/**
 * Motor de disponibilidade — funções puras (sem banco), fáceis de testar.
 * Todos os horários são minutos desde 00:00 do dia analisado.
 */

export interface Intervalo {
  inicio: number;
  fim: number;
}

export interface Expediente {
  inicio: number;
  fim: number;
  intervaloInicio: number | null;
  intervaloFim: number | null;
}

export interface ContextoDia {
  data: string;
  /** null => a profissional não atende neste dia */
  expediente: Expediente | null;
  /** bloqueios de agenda (dia inteiro = 0..1440) e pausas recorrentes */
  bloqueios: Intervalo[];
  /** agendamentos ativos: [inicio, ocupado_ate) — já inclui o intervalo do serviço */
  ocupados: Intervalo[];
}

export interface ParametrosSlot {
  duracao: number;
  /** intervalo adicional após o atendimento */
  intervalo: number;
  /** horário mínimo permitido (antecedência mínima); -Infinity para ignorar */
  inicioMinimo: number;
}

function sobrepoe(aInicio: number, aFim: number, b: Intervalo): boolean {
  return aInicio < b.fim && b.inicio < aFim;
}

export type MotivoIndisponivel =
  | "DIA_SEM_ATENDIMENTO"
  | "FORA_DO_EXPEDIENTE"
  | "INTERVALO"
  | "BLOQUEADO"
  | "OCUPADO"
  | "ANTECEDENCIA";

/** Retorna null se o horário pode ser reservado; caso contrário, o motivo. */
export function verificarSlot(ctx: ContextoDia, inicio: number, p: ParametrosSlot): MotivoIndisponivel | null {
  const exp = ctx.expediente;
  if (!exp) return "DIA_SEM_ATENDIMENTO";
  const fim = inicio + p.duracao;
  if (inicio < exp.inicio || fim > exp.fim) return "FORA_DO_EXPEDIENTE";
  if (
    exp.intervaloInicio !== null &&
    exp.intervaloFim !== null &&
    sobrepoe(inicio, fim, { inicio: exp.intervaloInicio, fim: exp.intervaloFim })
  ) {
    return "INTERVALO";
  }
  if (ctx.bloqueios.some((b) => sobrepoe(inicio, fim, b))) return "BLOQUEADO";
  const ocupadoAte = fim + p.intervalo;
  if (ctx.ocupados.some((o) => sobrepoe(inicio, ocupadoAte, o))) return "OCUPADO";
  if (inicio < p.inicioMinimo) return "ANTECEDENCIA";
  return null;
}

/** Lista os horários de início livres do dia, em passos de `passo` minutos. */
export function calcularSlots(ctx: ContextoDia, p: ParametrosSlot, passo: number): number[] {
  const exp = ctx.expediente;
  if (!exp) return [];
  const slots: number[] = [];
  const step = Math.max(5, passo);
  for (let s = exp.inicio; s + p.duracao <= exp.fim; s += step) {
    if (verificarSlot(ctx, s, p) === null) slots.push(s);
  }
  return slots;
}
