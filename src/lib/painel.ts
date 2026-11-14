/**
 * Consultas de leitura usadas pelo painel administrativo.
 */
import { getDb } from "./db";
import { ehUuid, type Status, type TipoLembrete } from "./agenda";
import { emSaoPaulo, hhmm, paraInstante, somarDias } from "./tz";

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface ResumoMes {
  total: number;
  cancelados: number;
  faturamentoPrevisto: number;
  maisProcurados: Array<{ nome: string; total: number }>;
}

export async function resumoDoMes(agora: Date = new Date()): Promise<ResumoMes> {
  const db = await getDb();
  const z = emSaoPaulo(agora);
  const primeiro = `${z.ano}-${String(z.mes).padStart(2, "0")}-01`;
  const proximoMes = z.mes === 12 ? `${z.ano + 1}-01-01` : `${z.ano}-${String(z.mes + 1).padStart(2, "0")}-01`;
  const de = paraInstante(primeiro, "00:00");
  const ate = paraInstante(proximoMes, "00:00");

  const tot = await db.query<{ total: number; cancelados: number; faturamento: number }>(
    `SELECT count(*) FILTER (WHERE status <> 'CANCELADO')::int AS total,
            count(*) FILTER (WHERE status = 'CANCELADO')::int AS cancelados,
            COALESCE(sum(preco_centavos) FILTER (WHERE status IN ('PENDENTE','CONFIRMADO','CONCLUIDO')), 0)::int AS faturamento
       FROM appointments WHERE inicio >= $1 AND inicio < $2`,
    [de, ate],
  );
  const top = await db.query<{ nome: string; total: number }>(
    `SELECT s.nome, count(*)::int AS total
       FROM appointments a JOIN services s ON s.id = a.service_id
      WHERE a.inicio >= $1 AND a.inicio < $2 AND a.status <> 'CANCELADO'
      GROUP BY s.nome ORDER BY total DESC, s.nome LIMIT 5`,
    [de, ate],
  );
  return {
    total: tot.rows[0].total,
    cancelados: tot.rows[0].cancelados,
    faturamentoPrevisto: tot.rows[0].faturamento,
    maisProcurados: top.rows,
  };
}

// ---------------------------------------------------------------------------
// Bloqueios e datas especiais
// ---------------------------------------------------------------------------

export interface Bloqueio {
  id: string;
  data: string | null;
  dia_semana: number | null;
  horario_inicio: string | null;
  horario_fim: string | null;
  motivo: string | null;
}

export async function listarBloqueios(aPartirDe: string, ate?: string): Promise<Bloqueio[]> {
  const db = await getDb();
  const { rows } = await db.query<Bloqueio>(
    `SELECT id, to_char(data, 'YYYY-MM-DD') AS data, dia_semana, horario_inicio::text, horario_fim::text, motivo
       FROM blocked_times
      WHERE dia_semana IS NOT NULL OR (data >= $1::date AND ($2::date IS NULL OR data <= $2::date))
      ORDER BY data NULLS FIRST, dia_semana, horario_inicio NULLS FIRST`,
    [aPartirDe, ate ?? null],
  );
  return rows.map((b) => ({
    ...b,
    dia_semana: b.dia_semana === null ? null : Number(b.dia_semana),
    horario_inicio: hhmm(b.horario_inicio),
    horario_fim: hhmm(b.horario_fim),
  }));
}

export interface DataEspecial {
  id: string;
  data: string;
  horario_inicio: string;
  horario_fim: string;
  intervalo_inicio: string | null;
  intervalo_fim: string | null;
  motivo: string | null;
}

export async function listarDatasEspeciais(aPartirDe: string): Promise<DataEspecial[]> {
  const db = await getDb();
  const { rows } = await db.query<DataEspecial>(
    `SELECT id, to_char(data, 'YYYY-MM-DD') AS data, horario_inicio::text, horario_fim::text,
            intervalo_inicio::text, intervalo_fim::text, motivo
       FROM special_dates WHERE data >= $1::date ORDER BY data`,
    [aPartirDe],
  );
  return rows.map((d) => ({
    ...d,
    horario_inicio: hhmm(d.horario_inicio)!,
    horario_fim: hhmm(d.horario_fim)!,
    intervalo_inicio: hhmm(d.intervalo_inicio),
    intervalo_fim: hhmm(d.intervalo_fim),
  }));
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

export interface ClienteResumo {
  id: string;
  nome: string;
  telefone: string;
  aceita_lembretes: boolean;
  observacoes: string | null;
  consentimento_em: Date | null;
  created_at: Date;
  total: number;
  ultimo: Date | null;
  proximo: Date | null;
}

const SELECT_CLIENTE = `
  SELECT c.id, c.nome, c.telefone, c.aceita_lembretes, c.observacoes, c.consentimento_em, c.created_at,
         (SELECT count(*)::int FROM appointments a WHERE a.customer_id = c.id AND a.status <> 'CANCELADO') AS total,
         (SELECT max(a.inicio) FROM appointments a
           WHERE a.customer_id = c.id AND a.inicio <= $1 AND a.status IN ('CONFIRMADO','CONCLUIDO')) AS ultimo,
         (SELECT min(a.inicio) FROM appointments a
           WHERE a.customer_id = c.id AND a.inicio > $1 AND a.status IN ('PENDENTE','CONFIRMADO')) AS proximo
    FROM customers c`;

export async function listarClientes(busca?: string, agora: Date = new Date()): Promise<ClienteResumo[]> {
  const db = await getDb();
  const termo = busca?.trim();
  const digitos = termo?.replace(/\D/g, "") ?? "";
  const { rows } = await db.query<ClienteResumo>(
    `${SELECT_CLIENTE}
      WHERE $2::text IS NULL OR c.nome ILIKE '%' || $2 || '%' OR ($3 <> '' AND c.telefone LIKE '%' || $3 || '%')
      ORDER BY c.nome LIMIT 300`,
    [agora, termo ? termo.replace(/[%_\\]/g, "\\$&") : null, digitos],
  );
  return rows;
}

export async function buscarCliente(id: string, agora: Date = new Date()): Promise<ClienteResumo | null> {
  if (!ehUuid(id)) return null;
  const db = await getDb();
  const { rows } = await db.query<ClienteResumo>(`${SELECT_CLIENTE} WHERE c.id = $2`, [agora, id]);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

export interface EstatisticasWhatsApp {
  enviadas: number;
  recebidas: number;
  falhas: number;
  lembretesPendentes: number;
  lembretesEnviados: number;
  lembretesFalha: number;
}

export async function estatisticasWhatsApp(dias = 30): Promise<EstatisticasWhatsApp> {
  const db = await getDb();
  const desde = new Date(Date.now() - dias * 86_400_000);
  const m = await db.query<{ enviadas: number; recebidas: number; falhas: number }>(
    `SELECT count(*) FILTER (WHERE direcao = 'SAIDA' AND status <> 'FALHA')::int AS enviadas,
            count(*) FILTER (WHERE direcao = 'ENTRADA')::int AS recebidas,
            count(*) FILTER (WHERE direcao = 'SAIDA' AND status = 'FALHA')::int AS falhas
       FROM whatsapp_messages WHERE created_at >= $1`,
    [desde],
  );
  const l = await db.query<{ pendentes: number; enviados: number; falha: number }>(
    `SELECT count(*) FILTER (WHERE status IN ('PENDENTE','ENVIANDO'))::int AS pendentes,
            count(*) FILTER (WHERE status = 'ENVIADO' AND sent_at >= $1)::int AS enviados,
            count(*) FILTER (WHERE status = 'FALHA')::int AS falha
       FROM reminders`,
    [desde],
  );
  return {
    ...m.rows[0],
    lembretesPendentes: l.rows[0].pendentes,
    lembretesEnviados: l.rows[0].enviados,
    lembretesFalha: l.rows[0].falha,
  };
}

export interface LembreteView {
  id: string;
  appointment_id: string;
  tipo: TipoLembrete;
  status: string;
  scheduled_at: Date;
  sent_at: Date | null;
  attempts: number;
  error_message: string | null;
  cliente_nome: string;
  servico_nome: string;
  inicio: Date;
  agendamento_status: Status;
}

const SELECT_LEMBRETE = `
  SELECT r.id, r.appointment_id, r.tipo, r.status, r.scheduled_at, r.sent_at, r.attempts, r.error_message,
         c.nome AS cliente_nome, s.nome AS servico_nome, a.inicio, a.status AS agendamento_status
    FROM reminders r
    JOIN appointments a ON a.id = r.appointment_id
    JOIN customers c ON c.id = a.customer_id
    JOIN services s ON s.id = a.service_id`;

export async function listarLembretes(limite = 60): Promise<LembreteView[]> {
  const db = await getDb();
  const { rows } = await db.query<LembreteView>(
    `${SELECT_LEMBRETE}
      WHERE r.scheduled_at >= now() - interval '7 days'
      ORDER BY (r.status = 'FALHA') DESC, r.scheduled_at DESC LIMIT $1`,
    [limite],
  );
  return rows;
}

export async function lembretesDoAgendamento(appointmentId: string): Promise<LembreteView[]> {
  if (!ehUuid(appointmentId)) return [];
  const db = await getDb();
  const { rows } = await db.query<LembreteView>(`${SELECT_LEMBRETE} WHERE r.appointment_id = $1 ORDER BY r.scheduled_at`, [
    appointmentId,
  ]);
  return rows;
}

export interface MensagemView {
  id: string;
  telefone: string;
  direcao: "ENTRADA" | "SAIDA";
  tipo: string;
  mensagem: string;
  status: string;
  erro: string | null;
  created_at: Date;
  cliente_nome: string | null;
}

export async function listarFalhasDeEnvio(limite = 30): Promise<MensagemView[]> {
  const db = await getDb();
  const { rows } = await db.query<MensagemView>(
    `SELECT m.id, m.telefone, m.direcao, m.tipo, m.mensagem, m.status, m.erro, m.created_at, c.nome AS cliente_nome
       FROM whatsapp_messages m LEFT JOIN customers c ON c.id = m.customer_id
      WHERE m.direcao = 'SAIDA' AND m.status = 'FALHA'
      ORDER BY m.created_at DESC LIMIT $1`,
    [limite],
  );
  return rows;
}

export interface ConversaView {
  telefone: string;
  cliente_nome: string | null;
  ultima_mensagem: string;
  ultima_direcao: "ENTRADA" | "SAIDA";
  ultima_em: Date;
  estado: string | null;
}

export async function listarConversas(limite = 50): Promise<ConversaView[]> {
  const db = await getDb();
  const { rows } = await db.query<ConversaView>(
    `SELECT u.telefone, c.nome AS cliente_nome, u.mensagem AS ultima_mensagem, u.direcao AS ultima_direcao,
            u.created_at AS ultima_em,
            CASE WHEN cv.estado = 'HUMANO' AND cv.updated_at > now() - interval '12 hours' THEN 'HUMANO' END AS estado
       FROM (SELECT DISTINCT ON (telefone) telefone, mensagem, direcao, created_at
               FROM whatsapp_messages ORDER BY telefone, created_at DESC) u
       LEFT JOIN customers c ON c.telefone = u.telefone
       LEFT JOIN conversations cv ON cv.telefone = u.telefone
      ORDER BY (cv.estado = 'HUMANO' AND cv.updated_at > now() - interval '12 hours') DESC NULLS LAST, u.created_at DESC
      LIMIT $1`,
    [limite],
  );
  return rows;
}

export async function mensagensDaConversa(telefone: string, limite = 200): Promise<MensagemView[]> {
  const db = await getDb();
  const { rows } = await db.query<MensagemView>(
    `SELECT * FROM (
       SELECT m.id, m.telefone, m.direcao, m.tipo, m.mensagem, m.status, m.erro, m.created_at, c.nome AS cliente_nome
         FROM whatsapp_messages m LEFT JOIN customers c ON c.id = m.customer_id
        WHERE m.telefone = $1 ORDER BY m.created_at DESC LIMIT $2
     ) t ORDER BY created_at`,
    [telefone, limite],
  );
  return rows;
}

export async function conversaEmAtendimentoHumano(telefone: string): Promise<boolean> {
  const db = await getDb();
  const { rows } = await db.query(
    "SELECT 1 FROM conversations WHERE telefone = $1 AND estado = 'HUMANO' AND updated_at > now() - interval '12 hours'",
    [telefone],
  );
  return rows.length > 0;
}

/** Formata um instante como 'dd/mm HH:MM' no fuso de São Paulo. */
export function dataHoraCurta(d: Date | string | null): string {
  if (!d) return "—";
  const z = emSaoPaulo(new Date(d));
  return `${String(z.dia).padStart(2, "0")}/${String(z.mes).padStart(2, "0")} ${z.hora}`;
}

export function inicioDaSemana(data: string): string {
  // semana começando na segunda-feira
  const [y, m, d] = data.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return somarDias(data, dow === 0 ? -6 : 1 - dow);
}
