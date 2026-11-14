/**
 * Regras de agendamento: disponibilidade em tempo real, reserva atômica,
 * cancelamento, reagendamento e programação dos lembretes.
 */
import { randomBytes } from "node:crypto";
import { getDb, pgErrorCode, transaction, type Queryable } from "./db";
import { calcularSlots, verificarSlot, type ContextoDia, type MotivoIndisponivel } from "./availability";
import { lerConfiguracoes } from "./settings";
import {
  diaDaSemana,
  emSaoPaulo,
  hoje,
  horaParaMinutos,
  instanteDoDia,
  minutosParaHora,
  paraInstante,
  somarDias,
} from "./tz";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export const STATUS = ["PENDENTE", "CONFIRMADO", "CANCELADO", "CONCLUIDO", "NAO_COMPARECEU"] as const;
export type Status = (typeof STATUS)[number];
export const STATUS_ATIVOS: Status[] = ["PENDENTE", "CONFIRMADO"];

export const STATUS_ROTULO: Record<Status, string> = {
  PENDENTE: "Pendente",
  CONFIRMADO: "Confirmado",
  CANCELADO: "Cancelado",
  CONCLUIDO: "Concluído",
  NAO_COMPARECEU: "Não compareceu",
};

export type CodigoErroAgenda =
  | "SERVICO_INDISPONIVEL"
  | "HORARIO_INDISPONIVEL"
  | "DADOS_INVALIDOS"
  | "NAO_ENCONTRADO"
  | "STATUS_INVALIDO"
  | "POLITICA_CANCELAMENTO";

export class AgendaError extends Error {
  constructor(
    public codigo: CodigoErroAgenda,
    mensagem: string,
    public motivo?: MotivoIndisponivel,
  ) {
    super(mensagem);
    this.name = "AgendaError";
  }
}

const MENSAGEM_MOTIVO: Record<MotivoIndisponivel, string> = {
  DIA_SEM_ATENDIMENTO: "Não há atendimento neste dia.",
  FORA_DO_EXPEDIENTE: "O horário está fora do expediente.",
  INTERVALO: "O horário coincide com o intervalo de almoço.",
  BLOQUEADO: "O horário está bloqueado na agenda.",
  OCUPADO: "Já existe um agendamento neste horário.",
  ANTECEDENCIA: "O horário não respeita a antecedência mínima para agendar.",
};

export interface Servico {
  id: string;
  nome: string;
  descricao: string;
  preco_centavos: number;
  duracao_minutos: number;
  intervalo_minutos: number;
  ativo: boolean;
  image_id: string | null;
  ordem: number;
}

export interface Agendamento {
  id: string;
  codigo: string;
  customer_id: string;
  cliente_nome: string;
  cliente_telefone: string;
  service_id: string;
  servico_nome: string;
  inicio: Date;
  fim: Date;
  /** dia civil em São Paulo (YYYY-MM-DD) */
  data: string;
  hora: string;
  hora_fim: string;
  preco_centavos: number;
  status: Status;
  origem: "WHATSAPP" | "ADMIN";
  observacoes: string | null;
  cancelado_em: Date | null;
  cancelado_por: string | null;
  motivo_cancelamento: string | null;
  created_at: Date;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function ehUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

// ---------------------------------------------------------------------------
// Telefones
// ---------------------------------------------------------------------------

/** Só dígitos, com DDI. Números brasileiros sem DDI (10–11 dígitos) recebem 55. */
export function normalizarTelefone(entrada: string): string | null {
  let d = entrada.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return /^[0-9]{8,15}$/.test(d) ? d : null;
}

/**
 * O WhatsApp pode identificar celulares brasileiros com ou sem o nono dígito.
 * Retorna as duas formas para localizar a cliente em qualquer caso.
 */
export function variantesTelefone(telefone: string): string[] {
  const v = new Set([telefone]);
  if (telefone.startsWith("55")) {
    if (telefone.length === 13 && telefone[4] === "9") v.add(telefone.slice(0, 4) + telefone.slice(5));
    if (telefone.length === 12) v.add(`${telefone.slice(0, 4)}9${telefone.slice(4)}`);
  }
  return [...v];
}

export interface Cliente {
  id: string;
  nome: string;
  telefone: string;
  aceita_lembretes: boolean;
}

export async function buscarClientePorTelefone(telefone: string, q?: Queryable): Promise<Cliente | null> {
  const db = q ?? (await getDb());
  const { rows } = await db.query<Cliente>(
    `SELECT id, nome, telefone, aceita_lembretes FROM customers
      WHERE telefone = ANY($1::text[]) ORDER BY created_at LIMIT 1`,
    [variantesTelefone(telefone)],
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Serviços
// ---------------------------------------------------------------------------

const COLS_SERVICO =
  "id, nome, descricao, preco_centavos, duracao_minutos, intervalo_minutos, ativo, image_id, ordem";

export async function listarServicos(opts: { apenasAtivos?: boolean } = {}, q?: Queryable): Promise<Servico[]> {
  const db = q ?? (await getDb());
  const { rows } = await db.query<Servico>(
    `SELECT ${COLS_SERVICO} FROM services ${opts.apenasAtivos ? "WHERE ativo" : ""} ORDER BY ordem, nome`,
  );
  return rows;
}

export async function buscarServico(id: string, q?: Queryable): Promise<Servico | null> {
  if (!ehUuid(id)) return null;
  const db = q ?? (await getDb());
  const { rows } = await db.query<Servico>(`SELECT ${COLS_SERVICO} FROM services WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Contexto de disponibilidade
// ---------------------------------------------------------------------------

interface LinhaExpediente {
  dia_semana: number;
  horario_inicio: string;
  horario_fim: string;
  intervalo_inicio: string | null;
  intervalo_fim: string | null;
  ativo: boolean;
}

/** Carrega, em 4 consultas, tudo que afeta a disponibilidade entre duas datas. */
export async function carregarContextos(
  q: Queryable,
  de: string,
  ate: string,
  opts: { ignorarAgendamentoId?: string } = {},
): Promise<ContextoDia[]> {
  const inicioPeriodo = paraInstante(de, "00:00");
  const fimPeriodo = paraInstante(somarDias(ate, 1), "00:00");

  // consultas em sequência: uma conexão/transação executa um comando por vez
  const expedientes = await q.query<LinhaExpediente>(
      `SELECT dia_semana, horario_inicio::text, horario_fim::text,
              intervalo_inicio::text, intervalo_fim::text, ativo
         FROM business_hours`,
  );
  const especiais = await q.query<{ data: string } & Omit<LinhaExpediente, "dia_semana" | "ativo">>(
      `SELECT to_char(data, 'YYYY-MM-DD') AS data, horario_inicio::text, horario_fim::text,
              intervalo_inicio::text, intervalo_fim::text
         FROM special_dates WHERE data BETWEEN $1::date AND $2::date`,
      [de, ate],
  );
  const bloqueios = await q.query<{ data: string | null; dia_semana: number | null; horario_inicio: string | null; horario_fim: string | null }>(
      `SELECT to_char(data, 'YYYY-MM-DD') AS data, dia_semana,
              horario_inicio::text, horario_fim::text
         FROM blocked_times
        WHERE dia_semana IS NOT NULL OR data BETWEEN $1::date AND $2::date`,
      [de, ate],
  );
  const agendamentos = await q.query<{ id: string; inicio: Date; ocupado_ate: Date }>(
      `SELECT id, inicio, ocupado_ate FROM appointments
        WHERE status IN ('PENDENTE','CONFIRMADO') AND ocupado_ate > $1 AND inicio < $2`,
      [inicioPeriodo, fimPeriodo],
  );

  const expPorDia = new Map(expedientes.rows.map((e) => [Number(e.dia_semana), e]));
  const especialPorData = new Map(especiais.rows.map((e) => [e.data, e]));

  const contextos: ContextoDia[] = [];
  for (let data = de; data <= ate; data = somarDias(data, 1)) {
    const dow = diaDaSemana(data);
    const especial = especialPorData.get(data);
    const semanal = expPorDia.get(dow);
    const fonte = especial ?? (semanal?.ativo ? semanal : null);

    const meiaNoite = paraInstante(data, "00:00").getTime();
    const paraMin = (d: Date) => Math.round((new Date(d).getTime() - meiaNoite) / 60_000);

    contextos.push({
      data,
      expediente: fonte
        ? {
            inicio: horaParaMinutos(fonte.horario_inicio),
            fim: horaParaMinutos(fonte.horario_fim),
            intervaloInicio: fonte.intervalo_inicio ? horaParaMinutos(fonte.intervalo_inicio) : null,
            intervaloFim: fonte.intervalo_fim ? horaParaMinutos(fonte.intervalo_fim) : null,
          }
        : null,
      bloqueios: bloqueios.rows
        .filter((b) => (b.data !== null ? b.data === data : Number(b.dia_semana) === dow))
        .map((b) =>
          b.horario_inicio && b.horario_fim
            ? { inicio: horaParaMinutos(b.horario_inicio), fim: horaParaMinutos(b.horario_fim) }
            : { inicio: 0, fim: 24 * 60 },
        ),
      ocupados: agendamentos.rows
        .filter((a) => a.id !== opts.ignorarAgendamentoId)
        .map((a) => ({ inicio: paraMin(a.inicio), fim: paraMin(a.ocupado_ate) }))
        .filter((o) => o.fim > 0 && o.inicio < 24 * 60),
    });
  }
  return contextos;
}

function inicioMinimo(data: string, agora: Date, antecedenciaMin: number): number {
  const limite = agora.getTime() + antecedenciaMin * 60_000;
  return Math.ceil((limite - paraInstante(data, "00:00").getTime()) / 60_000);
}

export interface DiaDisponivel {
  data: string;
  horarios: string[];
}

/**
 * Próximas datas com pelo menos um horário livre para o serviço (RB02, RB07,
 * RB08). Consulta o banco no momento da chamada.
 */
export async function datasDisponiveis(
  serviceId: string,
  opts: { limite?: number; aPartirDe?: string; agora?: Date } = {},
): Promise<DiaDisponivel[]> {
  const db = await getDb();
  const agora = opts.agora ?? new Date();
  const servico = await buscarServico(serviceId, db);
  if (!servico || !servico.ativo) return [];
  const cfg = await lerConfiguracoes(db);

  const primeiro = hoje(agora);
  const ultimo = somarDias(primeiro, Math.max(1, cfg.janela_agendamento_dias));
  const de = opts.aPartirDe && opts.aPartirDe > primeiro ? opts.aPartirDe : primeiro;
  if (de > ultimo) return [];

  const contextos = await carregarContextos(db, de, ultimo);
  const dias: DiaDisponivel[] = [];
  for (const ctx of contextos) {
    const slots = calcularSlots(
      ctx,
      {
        duracao: servico.duracao_minutos,
        intervalo: servico.intervalo_minutos,
        inicioMinimo: inicioMinimo(ctx.data, agora, cfg.antecedencia_minima_minutos),
      },
      cfg.passo_minutos,
    );
    if (slots.length > 0) dias.push({ data: ctx.data, horarios: slots.map(minutosParaHora) });
    if (opts.limite && dias.length >= opts.limite) break;
  }
  return dias;
}

/** Horários livres de uma data para o serviço. */
export async function horariosDisponiveis(
  serviceId: string,
  data: string,
  opts: { agora?: Date; ignorarAntecedencia?: boolean; ignorarAgendamentoId?: string } = {},
): Promise<string[]> {
  const db = await getDb();
  const agora = opts.agora ?? new Date();
  const servico = await buscarServico(serviceId, db);
  if (!servico) return [];
  const cfg = await lerConfiguracoes(db);
  const [ctx] = await carregarContextos(db, data, data, { ignorarAgendamentoId: opts.ignorarAgendamentoId });
  return calcularSlots(
    ctx,
    {
      duracao: servico.duracao_minutos,
      intervalo: servico.intervalo_minutos,
      inicioMinimo: opts.ignorarAntecedencia
        ? -Infinity
        : inicioMinimo(data, agora, cfg.antecedencia_minima_minutos),
    },
    cfg.passo_minutos,
  ).map(minutosParaHora);
}

/** Horários livres do dia sem considerar um serviço específico (blocos de `passo`). */
export async function horariosLivresDoDia(data: string, agora: Date = new Date()): Promise<string[]> {
  const db = await getDb();
  const cfg = await lerConfiguracoes(db);
  const [ctx] = await carregarContextos(db, data, data);
  return calcularSlots(
    ctx,
    { duracao: cfg.passo_minutos, intervalo: 0, inicioMinimo: inicioMinimo(data, agora, 0) },
    cfg.passo_minutos,
  ).map(minutosParaHora);
}

// ---------------------------------------------------------------------------
// Lembretes (programação)
// ---------------------------------------------------------------------------

export const LEMBRETES = [
  { tipo: "1H", minutosAntes: 60 },
  { tipo: "30MIN", minutosAntes: 30 },
  { tipo: "10MIN", minutosAntes: 10 },
] as const;
export type TipoLembrete = (typeof LEMBRETES)[number]["tipo"];

async function programarLembretes(tx: Queryable, appointmentId: string, inicio: Date, agora: Date): Promise<void> {
  for (const l of LEMBRETES) {
    const quando = new Date(inicio.getTime() - l.minutosAntes * 60_000);
    if (quando.getTime() > agora.getTime()) {
      await tx.query(
        `INSERT INTO reminders (appointment_id, tipo, scheduled_at, status)
         VALUES ($1, $2, $3, 'PENDENTE')
         ON CONFLICT (appointment_id, tipo) DO UPDATE
           SET scheduled_at = EXCLUDED.scheduled_at, status = 'PENDENTE', attempts = 0,
               sent_at = NULL, error_message = NULL, wa_message_id = NULL, updated_at = now()`,
        [appointmentId, l.tipo, quando],
      );
    } else {
      // horário do lembrete já passou: não envia (e invalida um eventual lembrete antigo)
      await tx.query(
        `UPDATE reminders SET status = 'CANCELADO', updated_at = now()
          WHERE appointment_id = $1 AND tipo = $2 AND status <> 'ENVIADO'`,
        [appointmentId, l.tipo],
      );
    }
  }
}

async function cancelarLembretesPendentes(tx: Queryable, appointmentId: string): Promise<void> {
  await tx.query(
    `UPDATE reminders SET status = 'CANCELADO', updated_at = now()
      WHERE appointment_id = $1 AND status IN ('PENDENTE','ENVIANDO','FALHA')`,
    [appointmentId],
  );
}

// ---------------------------------------------------------------------------
// Consulta de agendamentos
// ---------------------------------------------------------------------------

const SELECT_AGENDAMENTO = `
  SELECT a.id, a.codigo, a.customer_id, c.nome AS cliente_nome, c.telefone AS cliente_telefone,
         a.service_id, s.nome AS servico_nome, a.inicio, a.fim, a.preco_centavos, a.status,
         a.origem, a.observacoes, a.cancelado_em, a.cancelado_por, a.motivo_cancelamento, a.created_at
    FROM appointments a
    JOIN customers c ON c.id = a.customer_id
    JOIN services  s ON s.id = a.service_id`;

type LinhaAgendamento = Omit<Agendamento, "data" | "hora" | "hora_fim">;

function mapear(l: LinhaAgendamento): Agendamento {
  const inicio = new Date(l.inicio);
  const fim = new Date(l.fim);
  const zi = emSaoPaulo(inicio);
  return {
    ...l,
    inicio,
    fim,
    data: zi.data,
    hora: zi.hora,
    hora_fim: emSaoPaulo(fim).hora,
    cancelado_em: l.cancelado_em ? new Date(l.cancelado_em) : null,
    created_at: new Date(l.created_at),
  };
}

export async function buscarAgendamento(id: string, q?: Queryable): Promise<Agendamento | null> {
  if (!ehUuid(id)) return null;
  const db = q ?? (await getDb());
  const { rows } = await db.query<LinhaAgendamento>(`${SELECT_AGENDAMENTO} WHERE a.id = $1`, [id]);
  return rows[0] ? mapear(rows[0]) : null;
}

/** Agendamentos cujo início cai entre as datas (inclusive), em ordem cronológica. */
export async function listarAgendamentos(
  de: string,
  ate: string,
  opts: { apenasAtivos?: boolean } = {},
): Promise<Agendamento[]> {
  const db = await getDb();
  const { rows } = await db.query<LinhaAgendamento>(
    `${SELECT_AGENDAMENTO}
      WHERE a.inicio >= $1 AND a.inicio < $2
        ${opts.apenasAtivos ? "AND a.status IN ('PENDENTE','CONFIRMADO')" : ""}
      ORDER BY a.inicio`,
    [paraInstante(de, "00:00"), paraInstante(somarDias(ate, 1), "00:00")],
  );
  return rows.map(mapear);
}

/** Próximos agendamentos ativos de um número de WhatsApp. */
export async function agendamentosFuturosDoTelefone(telefone: string, agora: Date = new Date()): Promise<Agendamento[]> {
  const db = await getDb();
  const { rows } = await db.query<LinhaAgendamento>(
    `${SELECT_AGENDAMENTO}
      WHERE c.telefone = ANY($1::text[]) AND a.status IN ('PENDENTE','CONFIRMADO') AND a.inicio > $2
      ORDER BY a.inicio`,
    [variantesTelefone(telefone), agora],
  );
  return rows.map(mapear);
}

export async function agendamentosDoCliente(customerId: string): Promise<Agendamento[]> {
  if (!ehUuid(customerId)) return [];
  const db = await getDb();
  const { rows } = await db.query<LinhaAgendamento>(
    `${SELECT_AGENDAMENTO} WHERE a.customer_id = $1 ORDER BY a.inicio DESC`,
    [customerId],
  );
  return rows.map(mapear);
}

// ---------------------------------------------------------------------------
// Reserva (RB01, RB03, RB06, RB07, RB08, RB09, RB16)
// ---------------------------------------------------------------------------

/** Trava de transação que serializa todas as alterações de agenda. */
const TRAVA_AGENDA = 727001;

function gerarCodigo(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let s = "";
  for (const b of bytes) s += alfabeto[b % alfabeto.length];
  return `AG-${s}`;
}

export interface NovoAgendamento {
  cliente: { id: string } | { nome: string; telefone: string; registrarConsentimento?: boolean };
  serviceId: string;
  data: string;
  hora: string;
  origem: "WHATSAPP" | "ADMIN";
  observacoes?: string | null;
  /** painel administrativo pode agendar sem a antecedência mínima */
  ignorarAntecedencia?: boolean;
  agora?: Date;
}

/**
 * Cria o agendamento de forma transacional. A disponibilidade é revalidada
 * dentro da transação e a exclusion constraint do banco garante que dois
 * agendamentos ativos nunca se sobreponham, mesmo com confirmações simultâneas.
 * Lança AgendaError('HORARIO_INDISPONIVEL') se o horário não puder ser usado.
 */
export async function criarAgendamento(input: NovoAgendamento): Promise<Agendamento> {
  const agora = input.agora ?? new Date();
  if (!ehUuid(input.serviceId)) throw new AgendaError("SERVICO_INDISPONIVEL", "Serviço inválido.");

  try {
    return await transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock($1::bigint)", [TRAVA_AGENDA]);

      const servico = await buscarServico(input.serviceId, tx);
      if (!servico || !servico.ativo) {
        throw new AgendaError("SERVICO_INDISPONIVEL", "Este serviço não está disponível para agendamento.");
      }

      const cfg = await lerConfiguracoes(tx);
      const [ctx] = await carregarContextos(tx, input.data, input.data);
      const inicioMin = horaParaMinutos(input.hora);
      const motivo = verificarSlot(ctx, inicioMin, {
        duracao: servico.duracao_minutos,
        intervalo: servico.intervalo_minutos,
        inicioMinimo: input.ignorarAntecedencia
          ? -Infinity
          : inicioMinimo(input.data, agora, cfg.antecedencia_minima_minutos),
      });
      if (motivo) throw new AgendaError("HORARIO_INDISPONIVEL", MENSAGEM_MOTIVO[motivo], motivo);

      // Cliente: identificado pelo telefone; criado automaticamente no 1º agendamento
      let customerId: string;
      if ("id" in input.cliente) {
        if (!ehUuid(input.cliente.id)) throw new AgendaError("DADOS_INVALIDOS", "Cliente inválida.");
        const r = await tx.query<{ id: string }>("SELECT id FROM customers WHERE id = $1", [input.cliente.id]);
        if (!r.rows[0]) throw new AgendaError("DADOS_INVALIDOS", "Cliente não encontrada.");
        customerId = r.rows[0].id;
      } else {
        const nome = input.cliente.nome.trim();
        const telefone = normalizarTelefone(input.cliente.telefone);
        if (!nome || !telefone) throw new AgendaError("DADOS_INVALIDOS", "Nome ou telefone inválido.");
        const existente = await buscarClientePorTelefone(telefone, tx);
        if (existente) {
          customerId = existente.id;
          await tx.query(
            `UPDATE customers SET nome = $2,
                    consentimento_em = COALESCE(consentimento_em, CASE WHEN $3 THEN now() END)
              WHERE id = $1`,
            [customerId, nome, input.cliente.registrarConsentimento === true],
          );
        } else {
          const r = await tx.query<{ id: string }>(
            `INSERT INTO customers (nome, telefone, consentimento_em)
             VALUES ($1, $2, CASE WHEN $3 THEN now() END) RETURNING id`,
            [nome, telefone, input.cliente.registrarConsentimento === true],
          );
          customerId = r.rows[0].id;
        }
      }

      const inicio = instanteDoDia(input.data, inicioMin);
      const fim = new Date(inicio.getTime() + servico.duracao_minutos * 60_000);
      const ocupadoAte = new Date(fim.getTime() + servico.intervalo_minutos * 60_000);

      const ins = await tx.query<{ id: string }>(
        `INSERT INTO appointments
           (codigo, customer_id, service_id, inicio, fim, ocupado_ate, preco_centavos, status, origem, observacoes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'CONFIRMADO', $8, $9)
         RETURNING id`,
        [
          gerarCodigo(),
          customerId,
          servico.id,
          inicio,
          fim,
          ocupadoAte,
          servico.preco_centavos,
          input.origem,
          input.observacoes?.trim() || null,
        ],
      );
      const id = ins.rows[0].id;
      await programarLembretes(tx, id, inicio, agora);
      return (await buscarAgendamento(id, tx))!;
    });
  } catch (err) {
    // 23P01 = exclusion_violation: outro agendamento ocupou o horário
    if (pgErrorCode(err) === "23P01") {
      throw new AgendaError("HORARIO_INDISPONIVEL", MENSAGEM_MOTIVO.OCUPADO, "OCUPADO");
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Cancelamento (RB04, RB05)
// ---------------------------------------------------------------------------

export interface Cancelamento {
  id: string;
  por: "CLIENTE" | "ADMIN";
  motivo?: string | null;
  /** aplica a antecedência mínima de cancelamento (clientes) */
  aplicarPolitica?: boolean;
  agora?: Date;
}

export async function cancelarAgendamento(input: Cancelamento): Promise<Agendamento> {
  const agora = input.agora ?? new Date();
  if (!ehUuid(input.id)) throw new AgendaError("NAO_ENCONTRADO", "Agendamento não encontrado.");
  return transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock($1::bigint)", [TRAVA_AGENDA]);
    const atual = await buscarAgendamento(input.id, tx);
    if (!atual) throw new AgendaError("NAO_ENCONTRADO", "Agendamento não encontrado.");
    if (!STATUS_ATIVOS.includes(atual.status)) {
      throw new AgendaError("STATUS_INVALIDO", "Este agendamento não está mais ativo.");
    }
    if (input.aplicarPolitica) {
      const cfg = await lerConfiguracoes(tx);
      const limite = atual.inicio.getTime() - cfg.cancelamento_antecedencia_minutos * 60_000;
      if (agora.getTime() > limite) {
        throw new AgendaError(
          "POLITICA_CANCELAMENTO",
          "O prazo para cancelamento deste agendamento já passou.",
        );
      }
    }
    await tx.query(
      `UPDATE appointments
          SET status = 'CANCELADO', cancelado_em = $2, cancelado_por = $3,
              motivo_cancelamento = $4, updated_at = now()
        WHERE id = $1`,
      [input.id, agora, input.por, input.motivo?.trim() || null],
    );
    await cancelarLembretesPendentes(tx, input.id);
    return (await buscarAgendamento(input.id, tx))!;
  });
}

export async function registrarMotivoCancelamento(id: string, motivo: string): Promise<void> {
  if (!ehUuid(id)) return;
  const db = await getDb();
  await db.query(
    `UPDATE appointments SET motivo_cancelamento = $2, updated_at = now()
      WHERE id = $1 AND status = 'CANCELADO'`,
    [id, motivo.trim().slice(0, 500)],
  );
}

// ---------------------------------------------------------------------------
// Edição pelo painel
// ---------------------------------------------------------------------------

/** Marca como concluído / não compareceu / confirmado. Cancelamentos usam cancelarAgendamento. */
export async function alterarStatus(id: string, status: Exclude<Status, "CANCELADO">): Promise<Agendamento> {
  if (!ehUuid(id)) throw new AgendaError("NAO_ENCONTRADO", "Agendamento não encontrado.");
  try {
    return await transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock($1::bigint)", [TRAVA_AGENDA]);
      const atual = await buscarAgendamento(id, tx);
      if (!atual) throw new AgendaError("NAO_ENCONTRADO", "Agendamento não encontrado.");
      if (atual.status === "CANCELADO") {
        throw new AgendaError("STATUS_INVALIDO", "Agendamento cancelado não pode ser reativado; crie um novo.");
      }
      await tx.query("UPDATE appointments SET status = $2, updated_at = now() WHERE id = $1", [id, status]);
      if (!STATUS_ATIVOS.includes(status)) await cancelarLembretesPendentes(tx, id);
      return (await buscarAgendamento(id, tx))!;
    });
  } catch (err) {
    if (pgErrorCode(err) === "23P01") {
      throw new AgendaError("HORARIO_INDISPONIVEL", "O horário já foi ocupado por outro agendamento.", "OCUPADO");
    }
    throw err;
  }
}

export interface Reagendamento {
  id: string;
  serviceId: string;
  data: string;
  hora: string;
  observacoes?: string | null;
  agora?: Date;
}

/** Altera serviço, data, horário e observações de um agendamento ativo. */
export async function reagendar(input: Reagendamento): Promise<Agendamento> {
  const agora = input.agora ?? new Date();
  if (!ehUuid(input.id)) throw new AgendaError("NAO_ENCONTRADO", "Agendamento não encontrado.");
  try {
    return await transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock($1::bigint)", [TRAVA_AGENDA]);
      const atual = await buscarAgendamento(input.id, tx);
      if (!atual) throw new AgendaError("NAO_ENCONTRADO", "Agendamento não encontrado.");
      if (!STATUS_ATIVOS.includes(atual.status)) {
        throw new AgendaError("STATUS_INVALIDO", "Somente agendamentos ativos podem ser alterados.");
      }
      const servico = await buscarServico(input.serviceId, tx);
      const trocouServico = servico?.id !== atual.service_id;
      if (!servico || (trocouServico && !servico.ativo)) {
        throw new AgendaError("SERVICO_INDISPONIVEL", "Este serviço não está disponível para agendamento.");
      }

      const inicioMin = horaParaMinutos(input.hora);
      const inicio = instanteDoDia(input.data, inicioMin);
      const mudouHorario = trocouServico || inicio.getTime() !== atual.inicio.getTime();

      if (mudouHorario) {
        const [ctx] = await carregarContextos(tx, input.data, input.data, { ignorarAgendamentoId: atual.id });
        const motivo = verificarSlot(ctx, inicioMin, {
          duracao: servico.duracao_minutos,
          intervalo: servico.intervalo_minutos,
          inicioMinimo: -Infinity,
        });
        if (motivo) throw new AgendaError("HORARIO_INDISPONIVEL", MENSAGEM_MOTIVO[motivo], motivo);
      }

      const fim = new Date(inicio.getTime() + servico.duracao_minutos * 60_000);
      const ocupadoAte = new Date(fim.getTime() + servico.intervalo_minutos * 60_000);
      await tx.query(
        `UPDATE appointments
            SET service_id = $2, inicio = $3, fim = $4, ocupado_ate = $5,
                preco_centavos = $6, observacoes = $7, updated_at = now()
          WHERE id = $1`,
        [
          atual.id,
          servico.id,
          inicio,
          fim,
          ocupadoAte,
          trocouServico ? servico.preco_centavos : atual.preco_centavos,
          input.observacoes?.trim() || null,
        ],
      );
      if (mudouHorario) await programarLembretes(tx, atual.id, inicio, agora);
      return (await buscarAgendamento(atual.id, tx))!;
    });
  } catch (err) {
    if (pgErrorCode(err) === "23P01") {
      throw new AgendaError("HORARIO_INDISPONIVEL", MENSAGEM_MOTIVO.OCUPADO, "OCUPADO");
    }
    throw err;
  }
}
