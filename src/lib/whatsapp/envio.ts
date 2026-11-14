/**
 * Envio de mensagens com registro em WHATSAPP_MESSAGES (sucesso ou falha).
 */
import { getDb } from "../db";
import { transporte, type ResultadoEnvio } from "./client";

async function registrarSaida(
  telefone: string,
  mensagem: string,
  tipo: "texto" | "template",
  resultado: ResultadoEnvio,
  customerId?: string | null,
): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO whatsapp_messages (customer_id, telefone, direcao, tipo, mensagem, status, wa_message_id, erro)
     VALUES ($1, $2, 'SAIDA', $3, $4, $5, $6, $7)`,
    [
      customerId ?? null,
      telefone,
      tipo,
      mensagem,
      resultado.ok ? "ENVIADA" : "FALHA",
      resultado.id ?? null,
      resultado.ok ? null : (resultado.erro ?? "Erro desconhecido"),
    ],
  );
}

export async function enviarTexto(telefone: string, texto: string, customerId?: string | null): Promise<ResultadoEnvio> {
  const resultado = await transporte().enviarTexto(telefone, texto);
  await registrarSaida(telefone, texto, "texto", resultado, customerId);
  return resultado;
}

export async function enviarTemplate(
  telefone: string,
  template: { nome: string; idioma: string; parametros: string[] },
  textoEquivalente: string,
  customerId?: string | null,
): Promise<ResultadoEnvio> {
  const resultado = await transporte().enviarTemplate(telefone, template.nome, template.idioma, template.parametros);
  await registrarSaida(telefone, `[template ${template.nome}]\n${textoEquivalente}`, "template", resultado, customerId);
  return resultado;
}

/**
 * Janela de atendimento do WhatsApp: mensagens livres só podem ser enviadas
 * até 24h após a última mensagem recebida da cliente.
 */
export async function dentroDaJanela24h(telefone: string, agora: Date = new Date()): Promise<boolean> {
  const db = await getDb();
  const { rows } = await db.query<{ ultima: Date | null }>(
    `SELECT max(created_at) AS ultima FROM whatsapp_messages WHERE telefone = $1 AND direcao = 'ENTRADA'`,
    [telefone],
  );
  const ultima = rows[0]?.ultima ? new Date(rows[0].ultima).getTime() : null;
  if (ultima === null) return false;
  // margem de 5 minutos para não disputar o limite exato da janela
  return agora.getTime() - ultima < (24 * 60 - 5) * 60_000;
}

/** Atualiza o status de entrega informado pela Meta (sent/delivered/read/failed). */
export async function atualizarStatusEntrega(waMessageId: string, status: string, erro?: string): Promise<void> {
  const mapa: Record<string, string> = { sent: "ENVIADA", delivered: "ENTREGUE", read: "LIDA", failed: "FALHA" };
  const novo = mapa[status];
  if (!novo) return;
  const db = await getDb();
  // não regride (ex.: 'delivered' chegando depois de 'read')
  await db.query(
    `UPDATE whatsapp_messages
        SET status = $2, erro = CASE WHEN $2 = 'FALHA' THEN $3 ELSE erro END
      WHERE wa_message_id = $1 AND direcao = 'SAIDA'
        AND NOT (status = 'LIDA' AND $2 IN ('ENVIADA','ENTREGUE'))
        AND NOT (status = 'ENTREGUE' AND $2 = 'ENVIADA')`,
    [waMessageId, novo, erro ?? null],
  );
  if (novo === "FALHA") {
    await db.query(
      `UPDATE reminders SET status = 'FALHA', error_message = $2, updated_at = now()
        WHERE wa_message_id = $1 AND status = 'ENVIADO'`,
      [waMessageId, erro ?? "Falha de entrega informada pelo WhatsApp"],
    );
  }
}
