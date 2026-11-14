import { describe, expect, it } from "vitest";
import { calcularSlots, verificarSlot, type ContextoDia } from "@/lib/availability";
import { diaDaSemana, emSaoPaulo, minutosParaHora, paraInstante, somarDias } from "@/lib/tz";

const h = (hora: string) => {
  const [a, b] = hora.split(":").map(Number);
  return a * 60 + b;
};

function ctx(parcial: Partial<ContextoDia> = {}): ContextoDia {
  return {
    data: "2026-11-16",
    expediente: { inicio: h("09:00"), fim: h("18:00"), intervaloInicio: h("12:00"), intervaloFim: h("13:00") },
    bloqueios: [],
    ocupados: [],
    ...parcial,
  };
}

const slots = (c: ContextoDia, duracao: number, intervalo = 0, inicioMinimo = -Infinity, passo = 30) =>
  calcularSlots(c, { duracao, intervalo, inicioMinimo }, passo).map(minutosParaHora);

describe("motor de disponibilidade", () => {
  it("não oferece horários em dia sem atendimento", () => {
    expect(slots(ctx({ expediente: null }), 60)).toEqual([]);
  });

  it("RB07: respeita o expediente e o intervalo de almoço", () => {
    const s = slots(ctx(), 60);
    expect(s[0]).toBe("09:00");
    expect(s).toContain("11:00");
    expect(s).not.toContain("11:30"); // terminaria 12:30, dentro do almoço
    expect(s).not.toContain("12:00");
    expect(s).toContain("13:00");
    expect(s[s.length - 1]).toBe("17:00"); // último que termina até 18:00
    expect(s).not.toContain("17:30");
  });

  it("RB02: a duração do serviço define quais horários cabem", () => {
    const s = slots(ctx(), 120);
    expect(s).toContain("10:00"); // 10–12
    expect(s).not.toContain("10:30"); // 10:30–12:30 invade o almoço
    expect(s[s.length - 1]).toBe("16:00");
  });

  it("RB01: não oferece horários que se sobrepõem a agendamentos existentes", () => {
    const s = slots(ctx({ ocupados: [{ inicio: h("10:00"), fim: h("11:00") }] }), 60);
    expect(s).toContain("09:00");
    expect(s).not.toContain("09:30");
    expect(s).not.toContain("10:00");
    expect(s).not.toContain("10:30");
    expect(s).toContain("11:00");
  });

  it("considera o intervalo adicional entre atendimentos", () => {
    // serviço de 60 min + 30 de intervalo antes de um agendamento às 11:00
    const s = slots(ctx({ ocupados: [{ inicio: h("11:00"), fim: h("12:00") }] }), 60, 30);
    expect(s).toContain("09:30"); // ocupa até 11:00
    expect(s).not.toContain("10:00"); // ocuparia até 11:30
  });

  it("RB08: não oferece horários bloqueados nem dias bloqueados", () => {
    const parcial = slots(ctx({ bloqueios: [{ inicio: h("14:00"), fim: h("16:00") }] }), 60);
    expect(parcial).toContain("13:00");
    expect(parcial).not.toContain("13:30");
    expect(parcial).not.toContain("14:00");
    expect(parcial).not.toContain("15:30");
    expect(parcial).toContain("16:00");

    expect(slots(ctx({ bloqueios: [{ inicio: 0, fim: 1440 }] }), 60)).toEqual([]);
  });

  it("respeita a antecedência mínima", () => {
    const s = slots(ctx(), 60, 0, h("10:15"));
    expect(s[0]).toBe("10:30");
  });

  it("verificarSlot informa o motivo da indisponibilidade", () => {
    const p = { duracao: 60, intervalo: 0, inicioMinimo: -Infinity };
    expect(verificarSlot(ctx(), h("08:00"), p)).toBe("FORA_DO_EXPEDIENTE");
    expect(verificarSlot(ctx(), h("17:30"), p)).toBe("FORA_DO_EXPEDIENTE");
    expect(verificarSlot(ctx(), h("12:30"), p)).toBe("INTERVALO");
    expect(verificarSlot(ctx({ expediente: null }), h("10:00"), p)).toBe("DIA_SEM_ATENDIMENTO");
    expect(verificarSlot(ctx({ ocupados: [{ inicio: h("10:00"), fim: h("11:00") }] }), h("10:30"), p)).toBe("OCUPADO");
    expect(verificarSlot(ctx(), h("10:00"), p)).toBeNull();
  });
});

describe("fuso horário America/Sao_Paulo", () => {
  it("converte data/hora local em instante UTC e vice-versa", () => {
    const instante = paraInstante("2026-11-16", "14:30");
    expect(instante.toISOString()).toBe("2026-11-16T17:30:00.000Z"); // UTC-3
    const z = emSaoPaulo(instante);
    expect(z.data).toBe("2026-11-16");
    expect(z.hora).toBe("14:30");
  });

  it("vira o dia corretamente perto da meia-noite", () => {
    expect(emSaoPaulo(new Date("2026-11-17T02:30:00Z")).data).toBe("2026-11-16");
    expect(emSaoPaulo(new Date("2026-11-17T03:00:00Z")).data).toBe("2026-11-17");
  });

  it("calcula dia da semana e soma de dias", () => {
    expect(diaDaSemana("2026-11-16")).toBe(1);
    expect(somarDias("2026-11-30", 1)).toBe("2026-12-01");
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
  });
});
