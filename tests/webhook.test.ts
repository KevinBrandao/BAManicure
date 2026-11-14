import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { assinaturaValida } from "@/lib/whatsapp/client";
import { processarWebhook } from "@/lib/whatsapp/webhook";
import { criarBancoDeTeste, criarServico, instalarTransporte, type TransporteDeTeste } from "./helpers";

const SEGREDO = "segredo-de-teste";
const assinar = (corpo: string, segredo = SEGREDO) => "sha256=" + createHmac("sha256", segredo).update(corpo).digest("hex");

describe("assinatura do webhook (X-Hub-Signature-256)", () => {
  const corpo = JSON.stringify({ object: "whatsapp_business_account", entry: [] });

  it("aceita somente a assinatura gerada com o App Secret correto", () => {
    expect(assinaturaValida(corpo, assinar(corpo), SEGREDO)).toBe(true);
    expect(assinaturaValida(corpo, assinar(corpo, "outro-segredo"), SEGREDO)).toBe(false);
    expect(assinaturaValida(corpo + " ", assinar(corpo), SEGREDO)).toBe(false);
  });

  it("rejeita assinatura ausente, malformada ou sem segredo configurado", () => {
    expect(assinaturaValida(corpo, null, SEGREDO)).toBe(false);
    expect(assinaturaValida(corpo, "abc", SEGREDO)).toBe(false);
    expect(assinaturaValida(corpo, "sha256=zz", SEGREDO)).toBe(false);
    expect(assinaturaValida(corpo, assinar(corpo, ""), "")).toBe(false);
  });
});

describe("processamento do payload da Cloud API", () => {
  let db: Db;
  let wa: TransporteDeTeste;

  const payload = (mensagens: unknown[], statuses: unknown[] = []) =>
    ({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "123" }, messages: mensagens, statuses } }] }],
    }) as Parameters<typeof processarWebhook>[0];

  beforeEach(async () => {
    db = await criarBancoDeTeste();
    wa = instalarTransporte();
    await criarServico(db);
  });

  it("mensagem de texto inicia a conversa; reenvio do mesmo evento é ignorado", async () => {
    const p = payload([{ from: "5511988887777", id: "wamid.A", type: "text", text: { body: "Oi" } }]);
    expect(await processarWebhook(p)).toMatchObject({ mensagens: 1, duplicadas: 0 });
    expect(await processarWebhook(p)).toMatchObject({ mensagens: 0, duplicadas: 1 });
    expect(wa.enviadas).toHaveLength(1);
    expect(wa.enviadas[0].texto).toContain("Seja muito bem-vinda");
  });

  it("mídia (áudio, imagem) recebe orientação em vez de quebrar o fluxo", async () => {
    await processarWebhook(payload([{ from: "5511988887777", id: "wamid.B", type: "audio" }]));
    expect(wa.ultima()).toContain("apenas mensagens de texto");
    const { rows } = await db.query<{ mensagem: string }>("SELECT mensagem FROM whatsapp_messages WHERE direcao = 'ENTRADA'");
    expect(rows[0].mensagem).toBe("[áudio]");
  });

  it("status de entrega atualiza a mensagem enviada e registra falhas", async () => {
    await processarWebhook(payload([{ from: "5511988887777", id: "wamid.C", type: "text", text: { body: "Oi" } }]));
    const { rows } = await db.query<{ wa_message_id: string }>("SELECT wa_message_id FROM whatsapp_messages WHERE direcao = 'SAIDA'");
    const id = rows[0].wa_message_id;

    await processarWebhook(payload([], [{ id, status: "read" }]));
    await processarWebhook(payload([], [{ id, status: "delivered" }])); // fora de ordem: não regride
    const m = await db.query<{ status: string }>("SELECT status FROM whatsapp_messages WHERE wa_message_id = $1", [id]);
    expect(m.rows[0].status).toBe("LIDA");

    await processarWebhook(payload([], [{ id, status: "failed", errors: [{ code: 131026, title: "Message undeliverable" }] }]));
    const f = await db.query<{ status: string; erro: string }>("SELECT status, erro FROM whatsapp_messages WHERE wa_message_id = $1", [id]);
    expect(f.rows[0].status).toBe("FALHA");
    expect(f.rows[0].erro).toContain("131026");
  });

  it("ignora payloads de outros produtos", async () => {
    expect(await processarWebhook({ object: "instagram", entry: [] })).toEqual({ mensagens: 0, duplicadas: 0, status: 0 });
  });
});
