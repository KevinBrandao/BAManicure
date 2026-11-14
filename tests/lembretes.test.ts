import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { cancelarAgendamento, criarAgendamento } from "@/lib/agenda";
import { processarLembretes, reenfileirarLembrete } from "@/lib/lembretes";
import { processarMensagem } from "@/lib/whatsapp/conversa";
import { criarBancoDeTeste, criarServico, instalarTransporte, sp, TERCA, SEGUNDA, type TransporteDeTeste } from "./helpers";

let db: Db;
let wa: TransporteDeTeste;
let servico: string;
const ANA = "5511988887777";
const AGORA = sp(SEGUNDA, "07:00");

async function agendar(hora = "14:00", data = TERCA) {
  return criarAgendamento({ cliente: { nome: "Ana Paula Souza", telefone: ANA }, serviceId: servico, data, hora, origem: "WHATSAPP", agora: AGORA });
}

async function lembretes(appointmentId: string) {
  const { rows } = await db.query<{ tipo: string; status: string; attempts: number; scheduled_at: Date; sent_at: Date | null; error_message: string | null }>(
    "SELECT tipo, status, attempts, scheduled_at, sent_at, error_message FROM reminders WHERE appointment_id = $1 ORDER BY scheduled_at",
    [appointmentId],
  );
  return rows;
}

/** Cliente escreveu há pouco: janela de 24h aberta. */
async function abrirJanela(quando: Date) {
  await processarMensagem({ telefone: ANA, texto: "oi", waMessageId: `wamid.J${quando.getTime()}`, agora: quando });
  wa.limpar();
}

beforeEach(async () => {
  db = await criarBancoDeTeste();
  wa = instalarTransporte();
  servico = await criarServico(db, { nome: "Manicure tradicional", duracao: 60 });
  process.env.WHATSAPP_TEMPLATE_LEMBRETE_1H = "lembrete_1h";
  process.env.WHATSAPP_TEMPLATE_LEMBRETE_30MIN = "lembrete_30min";
  process.env.WHATSAPP_TEMPLATE_LEMBRETE_10MIN = "lembrete_10min";
});

afterEach(() => {
  delete process.env.WHATSAPP_TEMPLATE_LEMBRETE_1H;
  delete process.env.WHATSAPP_TEMPLATE_LEMBRETE_30MIN;
  delete process.env.WHATSAPP_TEMPLATE_LEMBRETE_10MIN;
});

describe("lembretes automáticos", () => {
  it("cada agendamento confirmado gera três lembretes nos horários corretos (America/Sao_Paulo)", async () => {
    const ag = await agendar("14:00");
    const ls = await lembretes(ag.id);
    expect(ls.map((l) => l.tipo)).toEqual(["1H", "30MIN", "10MIN"]);
    expect(ls.map((l) => new Date(l.scheduled_at).toISOString())).toEqual([
      sp(TERCA, "13:00").toISOString(),
      sp(TERCA, "13:30").toISOString(),
      sp(TERCA, "13:50").toISOString(),
    ]);
    expect(ls.every((l) => l.status === "PENDENTE")).toBe(true);
  });

  it("critério 10: envia cada lembrete no momento certo, com o texto correto", async () => {
    const ag = await agendar("14:00");
    await abrirJanela(sp(TERCA, "08:00"));

    expect((await processarLembretes(sp(TERCA, "12:59"))).enviados).toBe(0);
    expect(wa.enviadas).toHaveLength(0);

    expect((await processarLembretes(sp(TERCA, "13:00"))).enviados).toBe(1);
    expect(wa.enviadas[0].para).toBe(ANA);
    expect(wa.enviadas[0].texto).toContain("Oi, Ana! ❤️");
    expect(wa.enviadas[0].texto).toContain("💅 Serviço: Manicure tradicional");
    expect(wa.enviadas[0].texto).toContain("📅 Hoje, às 14:00.");
    expect(wa.enviadas[0].texto).toContain("Falta apenas 1 hora");

    expect((await processarLembretes(sp(TERCA, "13:30"))).enviados).toBe(1);
    expect(wa.enviadas[1].texto).toContain("Faltam 30 minutos para seu horário de 14:00.");

    expect((await processarLembretes(sp(TERCA, "13:50"))).enviados).toBe(1);
    expect(wa.enviadas[2].texto).toContain("Faltam apenas 10 minutos");

    const ls = await lembretes(ag.id);
    expect(ls.every((l) => l.status === "ENVIADO" && l.sent_at !== null && l.attempts === 1)).toBe(true);
  });

  it("RB14: não duplica mensagens, mesmo com execuções repetidas ou simultâneas", async () => {
    await agendar("14:00");
    await abrirJanela(sp(TERCA, "08:00"));
    const quando = sp(TERCA, "13:00");
    const resultados = await Promise.all([processarLembretes(quando), processarLembretes(quando), processarLembretes(quando)]);
    expect(resultados.reduce((s, r) => s + r.enviados, 0)).toBe(1);
    await processarLembretes(sp(TERCA, "13:01"));
    await processarLembretes(sp(TERCA, "13:02"));
    expect(wa.enviadas).toHaveLength(1);
  });

  it("RB05 / critério 13: agendamento cancelado não recebe lembretes", async () => {
    const ag = await agendar("14:00");
    await abrirJanela(sp(TERCA, "08:00"));
    await cancelarAgendamento({ id: ag.id, por: "CLIENTE", agora: sp(TERCA, "09:00") });
    expect((await lembretes(ag.id)).every((l) => l.status === "CANCELADO")).toBe(true);
    const r = await processarLembretes(sp(TERCA, "13:55"));
    expect(r.enviados).toBe(0);
    expect(wa.enviadas).toHaveLength(0);
  });

  it("falha de envio é registrada e há nova tentativa automática sem duplicar", async () => {
    const ag = await agendar("14:00");
    await abrirJanela(sp(TERCA, "08:00"));

    wa.falhar = "Erro 131000 da API do WhatsApp: Something went wrong";
    const r1 = await processarLembretes(sp(TERCA, "13:00"));
    expect(r1.falhas).toBe(1);
    let [l1h] = await lembretes(ag.id);
    expect(l1h.status).toBe("FALHA");
    expect(l1h.error_message).toContain("131000");
    expect(l1h.attempts).toBe(1);
    expect(l1h.sent_at).toBeNull();

    wa.falhar = null;
    const r2 = await processarLembretes(sp(TERCA, "13:02"));
    expect(r2.enviados).toBe(1);
    [l1h] = await lembretes(ag.id);
    expect(l1h.status).toBe("ENVIADO");
    expect(l1h.attempts).toBe(2);
    expect(wa.enviadas).toHaveLength(1);
  });

  it("após 3 falhas para de tentar sozinho; o painel pode reenfileirar manualmente", async () => {
    const ag = await agendar("14:00");
    await abrirJanela(sp(TERCA, "08:00"));
    wa.falhar = "indisponível";
    for (const hora of ["13:00", "13:02", "13:04", "13:06", "13:08"]) await processarLembretes(sp(TERCA, hora));
    let [l1h] = await lembretes(ag.id);
    expect(l1h.status).toBe("FALHA");
    expect(l1h.attempts).toBe(3);

    wa.falhar = null;
    const id = (await db.query<{ id: string }>("SELECT id FROM reminders WHERE appointment_id = $1 AND tipo = '1H'", [ag.id])).rows[0].id;
    expect(await reenfileirarLembrete(id, sp(TERCA, "13:10"))).toBe(true);
    await processarLembretes(sp(TERCA, "13:10"));
    [l1h] = await lembretes(ag.id);
    expect(l1h.status).toBe("ENVIADO");
    // um lembrete já enviado nunca volta para a fila
    expect(await reenfileirarLembrete(id, sp(TERCA, "13:11"))).toBe(false);
  });

  it("fora da janela de 24h usa o template aprovado, com os parâmetros certos", async () => {
    await agendar("14:00", "2026-11-19"); // quinta; última mensagem da cliente foi na segunda
    await abrirJanela(AGORA);
    await processarLembretes(sp("2026-11-19", "13:00"));
    expect(wa.enviadas).toHaveLength(1);
    expect(wa.enviadas[0]).toMatchObject({ tipo: "template", template: "lembrete_1h", parametros: ["Ana", "Manicure tradicional", "14:00"] });
  });

  it("fora da janela e sem template configurado, registra a falha em vez de enviar", async () => {
    delete process.env.WHATSAPP_TEMPLATE_LEMBRETE_1H;
    const ag = await agendar("14:00", "2026-11-19");
    await processarLembretes(sp("2026-11-19", "13:00"));
    expect(wa.enviadas).toHaveLength(0);
    const [l1h] = await lembretes(ag.id);
    expect(l1h.status).toBe("FALHA");
    expect(l1h.error_message).toContain("janela de 24h");
  });

  it("cliente que enviou SAIR não recebe lembretes", async () => {
    const ag = await agendar("14:00");
    await processarMensagem({ telefone: ANA, texto: "SAIR", waMessageId: "wamid.SAIR", agora: sp(TERCA, "08:00") });
    wa.limpar();
    await processarLembretes(sp(TERCA, "13:00"));
    expect(wa.enviadas).toHaveLength(0);
    expect((await lembretes(ag.id))[0].status).toBe("CANCELADO");
  });

  it("lembretes de atendimentos que já começaram expiram em vez de serem enviados com atraso", async () => {
    const ag = await agendar("14:00");
    await abrirJanela(sp(TERCA, "08:00"));
    const r = await processarLembretes(sp(TERCA, "14:05"));
    expect(r.enviados).toBe(0);
    expect(r.expirados).toBe(3);
    expect((await lembretes(ag.id)).every((l) => l.status === "EXPIRADO")).toBe(true);
  });

  it("agendamento em cima da hora só gera os lembretes que ainda fazem sentido", async () => {
    const ag = await criarAgendamento({
      cliente: { nome: "Ana Paula Souza", telefone: ANA },
      serviceId: servico,
      data: SEGUNDA,
      hora: "10:00",
      origem: "ADMIN",
      ignorarAntecedencia: true,
      agora: sp(SEGUNDA, "09:15"),
    });
    expect((await lembretes(ag.id)).map((l) => l.tipo)).toEqual(["30MIN", "10MIN"]);
  });
});
