/**
 * Utilitários de data/hora no fuso de negócio (America/Sao_Paulo).
 *
 * Convenções:
 *  - "data"  => string 'YYYY-MM-DD' (dia civil em São Paulo)
 *  - "hora"  => string 'HH:MM'
 *  - instantes são objetos Date (UTC) e timestamptz no banco
 */
export const TZ = "America/Sao_Paulo";

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export interface ZonedParts {
  data: string;
  hora: string;
  ano: number;
  mes: number;
  dia: number;
  horas: number;
  minutos: number;
  /** minutos desde 00:00 */
  minutosDoDia: number;
}

export function emSaoPaulo(instante: Date): ZonedParts {
  const p: Record<string, string> = {};
  for (const part of partsFmt.formatToParts(instante)) p[part.type] = part.value;
  const horas = Number(p.hour);
  const minutos = Number(p.minute);
  return {
    data: `${p.year}-${p.month}-${p.day}`,
    hora: `${p.hour}:${p.minute}`,
    ano: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    horas,
    minutos,
    minutosDoDia: horas * 60 + minutos,
  };
}

function offsetMs(instante: Date): number {
  const p: Record<string, string> = {};
  for (const part of partsFmt.formatToParts(instante)) p[part.type] = part.value;
  const comoUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return comoUtc - Math.floor(instante.getTime() / 1000) * 1000;
}

/** Converte data + hora civis de São Paulo no instante UTC correspondente. */
export function paraInstante(data: string, hora: string): Date {
  const [y, m, d] = data.split("-").map(Number);
  const [hh, mm] = hora.split(":").map(Number);
  const palpite = Date.UTC(y, m - 1, d, hh, mm, 0);
  let resultado = palpite - offsetMs(new Date(palpite));
  // segunda passada cobre mudanças de offset (horário de verão histórico)
  resultado = palpite - offsetMs(new Date(resultado));
  return new Date(resultado);
}

/** Instante correspondente a `minutos` após 00:00 da data informada. */
export function instanteDoDia(data: string, minutos: number): Date {
  return new Date(paraInstante(data, "00:00").getTime() + minutos * 60_000);
}

export function hoje(agora: Date = new Date()): string {
  return emSaoPaulo(agora).data;
}

export function somarDias(data: string, dias: number): string {
  const [y, m, d] = data.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

/** 0 = domingo ... 6 = sábado */
export function diaDaSemana(data: string): number {
  const [y, m, d] = data.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function horaParaMinutos(hora: string): number {
  const [hh, mm] = hora.split(":").map(Number);
  return hh * 60 + mm;
}

export function minutosParaHora(min: number): string {
  const hh = Math.floor(min / 60);
  const mm = min % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export const DIAS_SEMANA = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
] as const;

export const DIAS_SEMANA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

export const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

/** '2026-11-17' => '17/11/2026' */
export function formatarData(data: string): string {
  const [y, m, d] = data.split("-");
  return `${d}/${m}/${y}`;
}

/** '2026-11-17' => 'terça-feira, 17/11' */
export function formatarDataComDia(data: string): string {
  const [, m, d] = data.split("-");
  return `${DIAS_SEMANA[diaDaSemana(data)]}, ${d}/${m}`;
}

/** '2026-11-17' => 'terça-feira, 17 de novembro' */
export function formatarDataLonga(data: string): string {
  const [, m, d] = data.split("-").map(Number);
  return `${DIAS_SEMANA[diaDaSemana(data)]}, ${d} de ${MESES[m - 1]}`;
}

export function formatarPreco(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(centavos / 100);
}

export function formatarDuracao(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

export function dataValida(data: unknown): data is string {
  if (typeof data !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const [y, m, d] = data.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function horaValida(hora: unknown): hora is string {
  return typeof hora === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(hora);
}

/** Normaliza 'HH:MM:SS' (tipo time do Postgres) para 'HH:MM'. */
export function hhmm(time: string | null | undefined): string | null {
  return time ? time.slice(0, 5) : null;
}
