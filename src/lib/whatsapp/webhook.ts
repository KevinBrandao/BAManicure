/**
 * Interpretação do payload de webhook da WhatsApp Cloud API.
 */
import { processarMensagem } from "./conversa";
import { atualizarStatusEntrega } from "./envio";
import { configWhatsApp } from "./client";

interface MensagemWebhook {
  from?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
}

interface StatusWebhook {
  id?: string;
  status?: string;
  errors?: Array<{ code?: number; title?: string; message?: string; error_data?: { details?: string } }>;
}

interface PayloadWebhook {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string };
        messages?: MensagemWebhook[];
        statuses?: StatusWebhook[];
      };
    }>;
  }>;
}

const ROTULO_MIDIA: Record<string, string> = {
  audio: "[áudio]",
  image: "[imagem]",
  video: "[vídeo]",
  document: "[documento]",
  sticker: "[figurinha]",
  location: "[localização]",
  contacts: "[contato]",
  reaction: "[reação]",
};

export interface ResumoWebhook {
  mensagens: number;
  duplicadas: number;
  status: number;
}

export async function processarWebhook(payload: PayloadWebhook): Promise<ResumoWebhook> {
  const resumo: ResumoWebhook = { mensagens: 0, duplicadas: 0, status: 0 };
  if (payload.object !== "whatsapp_business_account") return resumo;
  const cfg = configWhatsApp();

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages" || !change.value) continue;
      const valor = change.value;
      // ignora eventos de outros números da mesma conta
      if (cfg.phoneNumberId && valor.metadata?.phone_number_id && valor.metadata.phone_number_id !== cfg.phoneNumberId) {
        continue;
      }

      for (const m of valor.messages ?? []) {
        if (!m.from || !m.id) continue;
        if (m.type === "reaction") continue; // reações não iniciam nem avançam conversa
        const texto =
          m.type === "text"
            ? (m.text?.body ?? "")
            : m.type === "button"
              ? (m.button?.text ?? null)
              : m.type === "interactive"
                ? (m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null)
                : null;
        const r = await processarMensagem({
          telefone: m.from,
          texto,
          waMessageId: m.id,
          descricaoMidia: ROTULO_MIDIA[m.type ?? ""] ?? `[${m.type ?? "desconhecido"}]`,
        });
        if (r.duplicada) resumo.duplicadas++;
        else resumo.mensagens++;
      }

      for (const s of valor.statuses ?? []) {
        if (!s.id || !s.status) continue;
        const e = s.errors?.[0];
        const erro = e
          ? `Erro ${e.code ?? "?"}: ${e.title ?? e.message ?? "falha de entrega"}${e.error_data?.details ? ` — ${e.error_data.details}` : ""}`
          : undefined;
        await atualizarStatusEntrega(s.id, s.status, erro);
        resumo.status++;
      }
    }
  }
  return resumo;
}
