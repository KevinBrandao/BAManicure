/**
 * Cliente da WhatsApp Business Cloud API (Meta).
 * Nenhum envio é simulado: sem credenciais, o envio falha e a falha é registrada.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface ResultadoEnvio {
  ok: boolean;
  /** id da mensagem no WhatsApp (wamid) */
  id?: string;
  erro?: string;
}

export interface Transporte {
  enviarTexto(para: string, texto: string): Promise<ResultadoEnvio>;
  enviarTemplate(para: string, nome: string, idioma: string, parametros: string[]): Promise<ResultadoEnvio>;
}

export interface ConfigWhatsApp {
  token: string;
  phoneNumberId: string;
  appSecret: string;
  verifyToken: string;
  graphVersion: string;
  templates: { "1H": string; "30MIN": string; "10MIN": string };
  idiomaTemplate: string;
}

export function configWhatsApp(): ConfigWhatsApp {
  const env = (k: string) => process.env[k]?.trim() ?? "";
  return {
    token: env("WHATSAPP_ACCESS_TOKEN"),
    phoneNumberId: env("WHATSAPP_PHONE_NUMBER_ID"),
    appSecret: env("WHATSAPP_APP_SECRET"),
    verifyToken: env("WHATSAPP_VERIFY_TOKEN"),
    graphVersion: env("WHATSAPP_GRAPH_VERSION") || "v23.0",
    templates: {
      "1H": env("WHATSAPP_TEMPLATE_LEMBRETE_1H"),
      "30MIN": env("WHATSAPP_TEMPLATE_LEMBRETE_30MIN"),
      "10MIN": env("WHATSAPP_TEMPLATE_LEMBRETE_10MIN"),
    },
    idiomaTemplate: env("WHATSAPP_TEMPLATE_LANG") || "pt_BR",
  };
}

export function envioConfigurado(cfg = configWhatsApp()): boolean {
  return Boolean(cfg.token && cfg.phoneNumberId);
}

const NAO_CONFIGURADO =
  "WhatsApp não configurado: defina WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID.";

async function chamarGraph(caminho: string, init: RequestInit): Promise<{ ok: boolean; json: unknown; erro?: string }> {
  const cfg = configWhatsApp();
  try {
    const res = await fetch(`https://graph.facebook.com/${cfg.graphVersion}/${caminho}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(15_000),
    });
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const e = (json as { error?: { message?: string; code?: number; error_data?: { details?: string } } } | null)?.error;
      const detalhe = e?.error_data?.details ? ` — ${e.error_data.details}` : "";
      return {
        ok: false,
        json,
        erro: e ? `Erro ${e.code ?? res.status} da API do WhatsApp: ${e.message ?? "desconhecido"}${detalhe}` : `HTTP ${res.status} da API do WhatsApp`,
      };
    }
    return { ok: true, json };
  } catch (err) {
    return { ok: false, json: null, erro: `Falha de rede ao chamar a API do WhatsApp: ${(err as Error).message}` };
  }
}

async function enviar(corpo: Record<string, unknown>): Promise<ResultadoEnvio> {
  const cfg = configWhatsApp();
  if (!envioConfigurado(cfg)) return { ok: false, erro: NAO_CONFIGURADO };
  const r = await chamarGraph(`${cfg.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...corpo }),
  });
  if (!r.ok) return { ok: false, erro: r.erro };
  const id = (r.json as { messages?: Array<{ id?: string }> } | null)?.messages?.[0]?.id;
  return { ok: true, id };
}

export const transporteMeta: Transporte = {
  enviarTexto(para, texto) {
    return enviar({ to: para, type: "text", text: { preview_url: false, body: texto } });
  },
  enviarTemplate(para, nome, idioma, parametros) {
    return enviar({
      to: para,
      type: "template",
      template: {
        name: nome,
        language: { code: idioma },
        components:
          parametros.length > 0
            ? [{ type: "body", parameters: parametros.map((p) => ({ type: "text", text: p })) }]
            : [],
      },
    });
  },
};

let transporteAtual: Transporte = transporteMeta;

export function transporte(): Transporte {
  return transporteAtual;
}

/** Uso exclusivo dos testes automatizados. */
export function definirTransporteParaTestes(t: Transporte | null): void {
  transporteAtual = t ?? transporteMeta;
}

export interface StatusConexao {
  configurado: boolean;
  conectado: boolean;
  numero?: string;
  nomeVerificado?: string;
  qualidade?: string;
  erro?: string;
  pendencias: string[];
}

/** Consulta a Meta para verificar se as credenciais estão válidas. */
export async function statusConexao(): Promise<StatusConexao> {
  const cfg = configWhatsApp();
  const pendencias: string[] = [];
  if (!cfg.token) pendencias.push("WHATSAPP_ACCESS_TOKEN não definido");
  if (!cfg.phoneNumberId) pendencias.push("WHATSAPP_PHONE_NUMBER_ID não definido");
  if (!cfg.appSecret) pendencias.push("WHATSAPP_APP_SECRET não definido (webhooks serão rejeitados)");
  if (!cfg.verifyToken) pendencias.push("WHATSAPP_VERIFY_TOKEN não definido (verificação do webhook falhará)");
  for (const tipo of ["1H", "30MIN", "10MIN"] as const) {
    if (!cfg.templates[tipo]) {
      pendencias.push(`Template do lembrete ${tipo} não definido (lembretes fora da janela de 24h falharão)`);
    }
  }
  if (!envioConfigurado(cfg)) return { configurado: false, conectado: false, pendencias };

  const r = await chamarGraph(`${cfg.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`, {
    method: "GET",
  });
  if (!r.ok) return { configurado: true, conectado: false, erro: r.erro, pendencias };
  const j = r.json as { display_phone_number?: string; verified_name?: string; quality_rating?: string };
  return {
    configurado: true,
    conectado: true,
    numero: j.display_phone_number,
    nomeVerificado: j.verified_name,
    qualidade: j.quality_rating,
    pendencias,
  };
}

/** Valida o cabeçalho X-Hub-Signature-256 enviado pela Meta nos webhooks. */
export function assinaturaValida(corpoBruto: string, assinatura: string | null, appSecret: string): boolean {
  if (!appSecret || !assinatura || !assinatura.startsWith("sha256=")) return false;
  const esperado = createHmac("sha256", appSecret).update(corpoBruto, "utf8").digest();
  let recebido: Buffer;
  try {
    recebido = Buffer.from(assinatura.slice(7), "hex");
  } catch {
    return false;
  }
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}
