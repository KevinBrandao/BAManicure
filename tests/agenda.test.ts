import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import {
  AgendaError,
  alterarStatus,
  cancelarAgendamento,
  criarAgendamento,
  datasDisponiveis,
  horariosDisponiveis,
  reagendar,
} from "@/lib/agenda";
import { criarBancoDeTeste, criarServico, DOMINGO, SEGUNDA, sp, TERCA } from "./helpers";

let db: Db;
let servico: string;
const AGORA = sp(SEGUNDA, "07:00");

const cliente = (n: number) => ({ nome: `Cliente Teste ${n}`, telefone: `55119000000${String(n).padStart(2, "0")}` });

async function erroDe(p: Promise<unknown>): Promise<AgendaError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(AgendaError);
    return e as AgendaError;
  }
  throw new Error("esperava um AgendaError");
}

beforeEach(async () => {
  db = await criarBancoDeTeste();
  servico = await criarServico(db, { duracao: 60 });
});

describe("reserva de horários", () => {
  it("RB09: a confirmação gera registro persistente com código e cliente", async () => {
    const ag = await criarAgendamento({ cliente: cliente(1), serviceId: servico, data: SEGUNDA, hora: "10:00", origem: "WHATSAPP", agora: AGORA });
    expect(ag.status).toBe("CONFIRMADO");
    expect(ag.codigo).toMatch(/^AG-[A-Z2-9]{8}$/);
    expect(ag.data).toBe(SEGUNDA);
    expect(ag.hora).toBe("10:00");
    expect(ag.hora_fim).toBe("11:00");
    expect(ag.preco_centavos).toBe(3500);

    const { rows } = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM appointments");
    expect(rows[0].n).toBe(1);
    const c = await db.query<{ nome: string }>("SELECT nome FROM customers WHERE telefone = $1", [cliente(1).telefone]);
    expect(c.rows[0].nome).toBe("Cliente Teste 1");
  });

  it("RB01: outro cliente não consegue reservar o mesmo horário nem horário sobreposto", async () => {
    await criarAgendamento({ cliente: cliente(1), serviceId: servico, data: SEGUNDA, hora: "10:00", origem: "WHATSAPP", agora: AGORA });
    const mesmo = await erroDe(criarAgendamento({ cliente: cliente(2), serviceId: servico, data: SEGUNDA, hora: "10:00", origem: "WHATSAPP", agora: AGORA }));
    expect(mesmo.codigo).toBe("HORARIO_INDISPONIVEL");
    const sobreposto = await erroDe(criarAgendamento({ cliente: cliente(2), serviceId: servico, data: SEGUNDA, hora: "10:30", origem: "WHATSAPP", agora: AGORA }));
    expect(sobreposto.motivo).toBe("OCUPADO");
  });

  it("RB03: confirmações simultâneas do mesmo horário resultam em apenas um agendamento", async () => {
    const tentativas = await Promise.allSettled(
      [1, 2, 3, 4, 5].map((n) =>
        criarAgendamento({ cliente: cliente(n), serviceId: servico, data: SEGUNDA, hora: "14:00", origem: "WHATSAPP", agora: AGORA }),
      ),
    );
    expect(tentativas.filter((t) => t.status === "fulfilled")).toHaveLength(1);
    const falhas = tentativas.filter((t) => t.status === "rejected") as PromiseRejectedResult[];
    expect(falhas).toHaveLength(4);
    for (const f of falhas) expect((f.reason as AgendaError).codigo).toBe("HORARIO_INDISPONIVEL");
    const { rows } = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM appointments WHERE status = 'CONFIRMADO'");
    expect(rows[0].n).toBe(1);
  });

  it("RB03: a restrição do próprio banco impede sobreposição mesmo sem passar pela aplicação", async () => {
    const ag = await criarAgendamento({ cliente: cliente(1), serviceId: servico, data: SEGUNDA, hora: "10:00", origem: "WHATSAPP", agora: AGORA });
    await expect(
      db.query(
        `INSERT INTO appointments (codigo, customer_id, service_id, inicio, fim, ocupado_ate, preco_centavos)
         VALUES ('AG-DIRETO', $1, $2, $3, $4, $4, 100)`,
        [ag.customer_id, servico, sp(SEGUNDA, "10:30"), sp(SEGUNDA, "11:30")],
      ),
    ).rejects.toMatchObject({ code: "23P01" });
  });

  it("RB04: horário cancelado volta a ficar disponível", async () => {
    const ag = await criarAgendamento({ cliente: cliente(1), serviceId: servico, data: SEGUNDA, hora: "10:00", origem: "WHATSAPP", agora: AGORA });
    expect(await horariosDisponiveis(servico, SEGUNDA, { agora: AGORA })).not.toContain("10:00");

    const cancelado = await cancelarAgendamento({ id: ag.id, por: "CLIENTE", motivo: "imprevisto", agora: AGORA });
    expect(cancelado.status).toBe("CANCELADO");
    expect(cancelado.motivo_cancelamento).toBe("imprevisto");
    expect(cancelado.cancelado_em).not.toBeNull();

    expect(await horariosDisponiveis(servico, SEGUNDA, { agora: AGORA })).toContain("10:00");
    const novo = await criarAgendamento({ cliente: cliente(2), serviceId: servico, data: SEGUNDA, hora: "10:00", origem: "WHATSAPP", agora: AGORA });
    expect(novo.status).toBe("CONFIRMADO");
  });

  it("RB06: somente serviços ativos podem ser agendados", async () => {
    const inativo = await criarServico(db, { nome: "Inativo", ativo: false });
    const e = await erroDe(criarAgendamento({ cliente: cliente(1), serviceId: inativo, data: SEGUNDA, hora: "10:00", origem: "WHATSAPP", agora: AGORA }));
    expect(e.codigo).toBe("SERVICO_INDISPONIVEL");
    expect(await datasDisponiveis(inativo, { agora: AGORA })).toEqual([]);
  });

  it("RB07: não permite agendamento fora do expediente, no almoço ou em dia sem atendimento", async () => {
    const base = { cliente: cliente(1), serviceId: servico, origem: "WHATSAPP" as const, agora: AGORA };
    expect((await erroDe(criarAgendamento({ ...base, data: SEGUNDA, hora: "07:00" }))).motivo).toBe("FORA_DO_EXPEDIENTE");
    expect((await erroDe(criarAgendamento({ ...base, data: SEGUNDA, hora: "17:30" }))).motivo).toBe("FORA_DO_EXPEDIENTE");
    expect((await erroDe(criarAgendamento({ ...base, data: SEGUNDA, hora: "12:00" }))).motivo).toBe("INTERVALO");
    expect((await erroDe(criarAgendamento({ ...base, data: DOMINGO, hora: "10:00" }))).motivo).toBe("DIA_SEM_ATENDIMENTO");
  });

  it("RB08: dia bloqueado e horário bloqueado deixam de ser oferecidos e não podem ser reservados", async () => {
    expect(await horariosDisponiveis(servico, TERCA, { agora: AGORA })).toContain("15:00");

    await db.query("INSERT INTO blocked_times (data, horario_inicio, horario_fim, motivo) VALUES ($1, '14:00', '16:00', 'Curso')", [TERCA]);
    const horarios = await horariosDisponiveis(servico, TERCA, { agora: AGORA });
    expect(horarios).not.toContain("14:00");
    expect(horarios).not.toContain("15:00");
    expect(horarios).toContain("16:00");
    const e = await erroDe(criarAgendamento({ cliente: cliente(1), serviceId: servico, data: TERCA, hora: "15:00", origem: "ADMIN", ignorarAntecedencia: true, agora: AGORA }));
    expect(e.motivo).toBe("BLOQUEADO");

    await db.query("INSERT INTO blocked_times (data, motivo) VALUES ($1, 'Feriado')", [SEGUNDA]);
    expect(await horariosDisponiveis(servico, SEGUNDA, { agora: AGORA })).toEqual([]);
    const datas = (await datasDisponiveis(servico, { agora: AGORA, limite: 5 })).map((d) => d.data);
    expect(datas).not.toContain(SEGUNDA);
    expect(datas[0]).toBe(TERCA);
  });

  it("pausa recorrente semanal bloqueia o horário em todas as semanas", async () => {
    await db.query("INSERT INTO blocked_times (dia_semana, horario_inicio, horario_fim, motivo) VALUES (1, '09:00', '10:00', 'Academia')");
    expect(await horariosDisponiveis(servico, SEGUNDA, { agora: AGORA })).not.toContain("09:00");
    expect(await horariosDisponiveis(servico, "2026-11-23", { agora: AGORA })).not.toContain("09:00");
    expect(await horariosDisponiveis(servico, TERCA, { agora: AGORA })).toContain("09:00");
  });

  it("data especial substitui o expediente padrão (ex.: atender em um domingo)", async () => {
    expect(await horariosDisponiveis(servico, DOMINGO, { agora: AGORA })).toEqual([]);
    await db.query("INSERT INTO special_dates (data, horario_inicio, horario_fim) VALUES ($1, '10:00', '14:00')", [DOMINGO]);
    expect(await horariosDisponiveis(servico, DOMINGO, { agora: AGORA })).toEqual(["10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00"]);
  });

  it("respeita a antecedência mínima (padrão 2h) e não oferece horários passados", async () => {
    const agora = sp(SEGUNDA, "08:10");
    const horarios = await horariosDisponiveis(servico, SEGUNDA, { agora });
    expect(horarios[0]).toBe("10:30"); // 10:10 arredondado para o próximo passo
    const e = await erroDe(criarAgendamento({ cliente: cliente(1), serviceId: servico, data: SEGUNDA, hora: "10:00", origem: "WHATSAPP", agora }));
    expect(e.motivo).toBe("ANTECEDENCIA");
  });

  it("o intervalo adicional do serviço reserva tempo após o atendimento", async () => {
    const comIntervalo = await criarServico(db, { nome: "Alongamento", duracao: 60, intervalo: 30 });
    await criarAgendamento({ cliente: cliente(1), serviceId: comIntervalo, data: SEGUNDA, hora: "09:00", origem: "WHATSAPP", agora: AGORA });
    const horarios = await horariosDisponiveis(servico, SEGUNDA, { agora: AGORA });
    expect(horarios).not.toContain("10:00"); // ainda dentro do intervalo
    expect(horarios).toContain("10:30");
  });

  it("a antecedência mínima de cancelamento é aplicada às clientes, não ao painel", async () => {
    const ag = await criarAgendamento({ cliente: cliente(1), serviceId: servico, data: SEGUNDA, hora: "10:00", origem: "WHATSAPP", agora: AGORA });
    const emCimaDaHora = sp(SEGUNDA, "09:00"); // falta 1h; política padrão = 2h
    const e = await erroDe(cancelarAgendamento({ id: ag.id, por: "CLIENTE", aplicarPolitica: true, agora: emCimaDaHora }));
    expect(e.codigo).toBe("POLITICA_CANCELAMENTO");
    const ok = await cancelarAgendamento({ id: ag.id, por: "ADMIN", agora: emCimaDaHora });
    expect(ok.status).toBe("CANCELADO");
    expect((await erroDe(cancelarAgendamento({ id: ag.id, por: "ADMIN", agora: emCimaDaHora }))).codigo).toBe("STATUS_INVALIDO");
  });

  it("reagendamento valida o novo horário e reprograma os lembretes", async () => {
    const a = await criarAgendamento({ cliente: cliente(1), serviceId: servico, data: SEGUNDA, hora: "10:00", origem: "WHATSAPP", agora: AGORA });
    await criarAgendamento({ cliente: cliente(2), serviceId: servico, data: SEGUNDA, hora: "14:00", origem: "WHATSAPP", agora: AGORA });

    const conflito = await erroDe(reagendar({ id: a.id, serviceId: servico, data: SEGUNDA, hora: "14:30", agora: AGORA }));
    expect(conflito.codigo).toBe("HORARIO_INDISPONIVEL");

    const movido = await reagendar({ id: a.id, serviceId: servico, data: TERCA, hora: "16:00", agora: AGORA });
    expect(movido.data).toBe(TERCA);
    expect(movido.hora).toBe("16:00");
    const { rows } = await db.query<{ tipo: string; scheduled_at: Date; status: string }>(
      "SELECT tipo, scheduled_at, status FROM reminders WHERE appointment_id = $1 ORDER BY scheduled_at",
      [a.id],
    );
    expect(rows.map((r) => r.tipo)).toEqual(["1H", "30MIN", "10MIN"]);
    expect(new Date(rows[0].scheduled_at).toISOString()).toBe(sp(TERCA, "15:00").toISOString());
    expect(rows.every((r) => r.status === "PENDENTE")).toBe(true);
    expect(await horariosDisponiveis(servico, SEGUNDA, { agora: AGORA })).toContain("10:00");
  });

  it("RB13: aceita apenas os status previstos e libera o horário em 'não compareceu'", async () => {
    const ag = await criarAgendamento({ cliente: cliente(1), serviceId: servico, data: SEGUNDA, hora: "10:00", origem: "WHATSAPP", agora: AGORA });
    await expect(db.query("UPDATE appointments SET status = 'QUALQUER' WHERE id = $1", [ag.id])).rejects.toThrow();
    expect((await alterarStatus(ag.id, "CONCLUIDO")).status).toBe("CONCLUIDO");
    expect((await alterarStatus(ag.id, "NAO_COMPARECEU")).status).toBe("NAO_COMPARECEU");
  });
});
