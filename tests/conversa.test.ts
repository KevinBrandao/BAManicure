import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { processarMensagem } from "@/lib/whatsapp/conversa";
import { criarAgendamento, horariosDisponiveis } from "@/lib/agenda";
import { criarBancoDeTeste, criarServico, instalarTransporte, SEGUNDA, sp, TERCA, type TransporteDeTeste } from "./helpers";

let db: Db;
let wa: TransporteDeTeste;
let manicure: string;
const ANA = "5511988887777";
const BIA = "5511977776666";
const AGORA = sp(SEGUNDA, "07:00");

let seq = 0;
async function diz(telefone: string, texto: string | null, agora: Date = AGORA) {
  wa.limpar();
  const r = await processarMensagem({ telefone, texto, waMessageId: `wamid.IN${++seq}`, agora });
  return { ...r, texto: wa.enviadas.map((m) => m.texto).join("\n---\n") };
}

async function contar(tabela: string, where = "true"): Promise<number> {
  const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${tabela} WHERE ${where}`);
  return rows[0].n;
}

/** Conduz a conversa até a tela de confirmação (segunda-feira às 10:00). */
async function ateConfirmacao(telefone: string, nome: string) {
  await diz(telefone, "Oi");
  await diz(telefone, "1");
  await diz(telefone, nome);
  await diz(telefone, "1"); // serviço
  await diz(telefone, "1"); // primeira data (segunda)
  return diz(telefone, "2"); // 09:00, 09:30, 10:00... => opção 3 seria 10:00; opção 2 = 09:30
}

beforeEach(async () => {
  db = await criarBancoDeTeste();
  wa = instalarTransporte();
  manicure = await criarServico(db, { nome: "Manicure tradicional", preco: 3500, duracao: 60, ordem: 1 });
  await criarServico(db, { nome: "Pedicure", preco: 4000, duracao: 60, ordem: 2 });
  await criarServico(db, { nome: "Serviço desativado", ativo: false, ordem: 3 });
});

describe("fluxo de agendamento pelo WhatsApp", () => {
  it("critérios 1 a 7 e 9: da saudação até a confirmação registrada", async () => {
    // 1. cliente inicia a conversa
    let r = await diz(ANA, "Olá, boa tarde");
    expect(r.texto).toContain("Seja muito bem-vinda! 💅");
    expect(r.texto).toContain("1 - Agendar um horário");
    expect(r.texto).toContain("5 - Falar diretamente com a profissional");

    // 2. sistema solicita o nome
    r = await diz(ANA, "1");
    expect(r.texto).toContain("Qual é o seu nome completo?");

    r = await diz(ANA, "Ana");
    expect(r.texto).toContain("nome completo");
    expect(r.estado).toBe("AGUARDANDO_NOME");

    // 3. escolha do serviço — apenas serviços ativos, com preço e duração
    r = await diz(ANA, "Ana Paula Souza");
    expect(r.texto).toContain("Qual procedimento você gostaria de realizar?");
    expect(r.texto).toMatch(/1 - Manicure tradicional — R\$\s35,00 \(1h\)/);
    expect(r.texto).toContain("2 - Pedicure");
    expect(r.texto).not.toContain("Serviço desativado");

    // 4. datas disponíveis (domingo não é oferecido)
    r = await diz(ANA, "1");
    expect(r.texto).toContain("Qual dia fica melhor para você?");
    expect(r.texto).toContain("1 - segunda-feira, 16/11");
    expect(r.texto).toContain("2 - terça-feira, 17/11");
    expect(r.texto).not.toContain("domingo");

    // 5. horários livres
    r = await diz(ANA, "2");
    expect(r.texto).toContain("Para terça-feira, 17/11, temos estes horários:");
    expect(r.texto).toContain("1 - 09:00");
    expect(r.texto).not.toContain("12:00");
    expect(r.texto).toContain("Qual horário você prefere?");

    // resumo antes de registrar
    r = await diz(ANA, "14:00");
    expect(r.texto).toContain("Confira seu agendamento:");
    expect(r.texto).toContain("👤 Cliente: Ana Paula Souza");
    expect(r.texto).toContain("💅 Serviço: Manicure tradicional");
    expect(r.texto).toContain("📅 Data: terça-feira, 17/11");
    expect(r.texto).toContain("🕐 Horário: 14:00");
    expect(r.texto).toMatch(/💰 Valor: R\$\s35,00/);
    expect(r.texto).toContain("1 - Confirmar agendamento");
    expect(await contar("appointments")).toBe(0); // nada gravado antes da confirmação

    // 6. confirmação
    r = await diz(ANA, "1");
    expect(r.texto).toContain("🎉 Agendamento confirmado!");
    expect(r.texto).toContain("Olá, Ana!");
    expect(r.texto).toContain("💅 Procedimento: Manicure tradicional");
    expect(r.texto).toContain("basta enviar CANCELAR");

    // 7. registro disponível para o painel, com cliente associada ao telefone
    const { rows } = await db.query<{ status: string; nome: string; telefone: string; origem: string; consentimento_em: Date | null }>(
      `SELECT a.status, c.nome, c.telefone, a.origem, c.consentimento_em
         FROM appointments a JOIN customers c ON c.id = a.customer_id`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "CONFIRMADO", nome: "Ana Paula Souza", telefone: ANA, origem: "WHATSAPP" });
    expect(rows[0].consentimento_em).not.toBeNull();
    expect(await contar("reminders", "status = 'PENDENTE'")).toBe(3);
  });

  it("critério 8 / RB12: se o horário for ocupado antes da confirmação, avisa e oferece alternativas", async () => {
    let r = await ateConfirmacao(ANA, "Ana Paula Souza");
    expect(r.texto).toContain("🕐 Horário: 09:30");

    // enquanto Ana decide, Bia reserva o mesmo horário
    await criarAgendamento({ cliente: { nome: "Bia Lima", telefone: BIA }, serviceId: manicure, data: SEGUNDA, hora: "09:30", origem: "WHATSAPP", agora: AGORA });

    r = await diz(ANA, "1");
    expect(r.texto).toContain("acabou de ficar indisponível");
    expect(r.texto).toContain("temos estes horários:");
    expect(r.texto).not.toMatch(/- 09:30/);
    expect(r.texto).not.toContain("Agendamento confirmado");
    expect(await contar("appointments")).toBe(1);
    expect(r.estado).toBe("ESCOLHA_HORARIO");
  });

  it("critério 18 / RB11: conversa abandonada não cria agendamento e expira", async () => {
    await ateConfirmacao(ANA, "Ana Paula Souza");
    expect(await contar("appointments")).toBe(0);
    expect(await contar("customers")).toBe(0);

    // volta 2 horas depois: a conversa recomeça do início
    const r = await diz(ANA, "1", sp(SEGUNDA, "09:00"));
    expect(r.texto).toContain("Seja muito bem-vinda!");
    expect(await contar("appointments")).toBe(0);
    // e o horário continuou livre para outras pessoas
    expect(await horariosDisponiveis(manicure, SEGUNDA, { agora: AGORA })).toContain("09:30");
  });

  it("permite escolher outro horário ou desistir na confirmação", async () => {
    await ateConfirmacao(ANA, "Ana Paula Souza");
    let r = await diz(ANA, "2");
    expect(r.texto).toContain("temos estes horários:");
    r = await diz(ANA, "1");
    expect(r.texto).toContain("🕐 Horário: 09:00");
    r = await diz(ANA, "3");
    expect(r.texto).toContain("nada foi agendado");
    expect(await contar("appointments")).toBe(0);
  });

  it("RB10: cliente conhecida é identificada pelo número e confirma o nome", async () => {
    await criarAgendamento({ cliente: { nome: "Ana Paula Souza", telefone: ANA }, serviceId: manicure, data: TERCA, hora: "10:00", origem: "WHATSAPP", agora: AGORA });
    await diz(ANA, "oi");
    let r = await diz(ANA, "1");
    expect(r.texto).toContain("Vou agendar em nome de *Ana Paula Souza*");
    r = await diz(ANA, "1");
    expect(r.texto).toContain("Qual procedimento");
  });

  it("webhook repetido (mesmo id de mensagem) não é processado duas vezes", async () => {
    const a = await processarMensagem({ telefone: ANA, texto: "oi", waMessageId: "wamid.DUP", agora: AGORA });
    const b = await processarMensagem({ telefone: ANA, texto: "oi", waMessageId: "wamid.DUP", agora: AGORA });
    expect(a.duplicada).toBe(false);
    expect(b.duplicada).toBe(true);
    expect(wa.enviadas).toHaveLength(1);
    expect(await contar("whatsapp_messages", "direcao = 'ENTRADA'")).toBe(1);
  });

  it("opção inválida repete a pergunta sem avançar", async () => {
    await diz(ANA, "oi");
    const r = await diz(ANA, "9");
    expect(r.texto).toContain("Não entendi");
    expect(r.texto).toContain("1 - Agendar um horário");
    expect(r.estado).toBe("MENU");
  });

  it("opção 4 lista serviços e valores; opção 5 passa para atendimento humano e silencia o robô", async () => {
    await diz(ANA, "oi");
    let r = await diz(ANA, "4");
    expect(r.texto).toContain("*Manicure tradicional*");
    expect(r.texto).toContain("*Pedicure*");
    r = await diz(ANA, "5");
    expect(r.estado).toBe("HUMANO");
    r = await diz(ANA, "queria tirar uma dúvida");
    expect(r.respostas).toEqual([]);
    r = await diz(ANA, "menu");
    expect(r.texto).toContain("1 - Agendar um horário");
  });

  it("critério 17: falha de envio fica registrada com o erro", async () => {
    wa.falhar = "Erro 131047 da API do WhatsApp: Re-engagement message";
    await processarMensagem({ telefone: ANA, texto: "oi", waMessageId: "wamid.F1", agora: AGORA });
    const { rows } = await db.query<{ status: string; erro: string }>(
      "SELECT status, erro FROM whatsapp_messages WHERE direcao = 'SAIDA'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("FALHA");
    expect(rows[0].erro).toContain("131047");
  });
});

describe("consulta e cancelamento pelo WhatsApp", () => {
  async function agendar(telefone: string, data: string, hora: string) {
    return criarAgendamento({ cliente: { nome: "Ana Paula Souza", telefone }, serviceId: manicure, data, hora, origem: "WHATSAPP", agora: AGORA });
  }

  it("critério 14: consulta mostra nome, serviço, data, horário e status", async () => {
    await agendar(ANA, TERCA, "10:00");
    await diz(ANA, "oi");
    const r = await diz(ANA, "2");
    expect(r.texto).toContain("👤 Cliente: Ana Paula Souza");
    expect(r.texto).toContain("💅 Serviço: Manicure tradicional");
    expect(r.texto).toContain("📅 Data: terça-feira, 17/11");
    expect(r.texto).toContain("🕐 Horário: 10:00");
    expect(r.texto).toContain("📌 Status: Confirmado");
    expect(r.texto).toContain("CANCELAR");
  });

  it("consulta sem agendamentos informa que nada foi encontrado", async () => {
    await diz(ANA, "oi");
    const r = await diz(ANA, "2");
    expect(r.texto).toContain("Não encontrei agendamentos futuros");
  });

  it("critérios 11, 12 e 13: CANCELAR com um agendamento pede confirmação, cancela, libera o horário e os lembretes", async () => {
    const ag = await agendar(ANA, TERCA, "10:00");
    let r = await diz(ANA, "CANCELAR");
    expect(r.texto).toContain("Olá, Ana!");
    expect(r.texto).toContain("Encontrei seu agendamento:");
    expect(r.texto).toContain("💅 Manicure tradicional");
    expect(r.texto).toContain("1 - Sim, cancelar");
    expect(r.texto).toContain("2 - Não, manter agendamento");

    r = await diz(ANA, "1");
    expect(r.texto).toContain("Agendamento cancelado com sucesso, Ana.");

    const { rows } = await db.query<{ status: string; cancelado_por: string }>("SELECT status, cancelado_por FROM appointments WHERE id = $1", [ag.id]);
    expect(rows[0]).toMatchObject({ status: "CANCELADO", cancelado_por: "CLIENTE" });
    expect(await horariosDisponiveis(manicure, TERCA, { agora: AGORA })).toContain("10:00");
    expect(await contar("reminders", "status = 'PENDENTE'")).toBe(0);
    expect(await contar("reminders", "status = 'CANCELADO'")).toBe(3);

    // motivo opcional
    r = await diz(ANA, "Tive um imprevisto no trabalho");
    expect(r.texto).toContain("Obrigada por avisar");
    const m = await db.query<{ motivo_cancelamento: string }>("SELECT motivo_cancelamento FROM appointments WHERE id = $1", [ag.id]);
    expect(m.rows[0].motivo_cancelamento).toBe("Tive um imprevisto no trabalho");
  });

  it("manter o agendamento não altera nada", async () => {
    const ag = await agendar(ANA, TERCA, "10:00");
    await diz(ANA, "cancelar");
    const r = await diz(ANA, "2");
    expect(r.texto).toContain("continua confirmado");
    expect(await contar("appointments", `id = '${ag.id}' AND status = 'CONFIRMADO'`)).toBe(1);
  });

  it("com mais de um agendamento, pergunta qual cancelar", async () => {
    await agendar(ANA, TERCA, "10:00");
    const segundo = await agendar(ANA, TERCA, "15:00");
    let r = await diz(ANA, "cancelar");
    expect(r.texto).toContain("Qual deles deseja cancelar?");
    expect(r.texto).toContain("1 - Manicure tradicional — terça-feira, 17/11 às 10:00");
    expect(r.texto).toContain("2 - Manicure tradicional — terça-feira, 17/11 às 15:00");
    r = await diz(ANA, "2");
    expect(r.texto).toContain("🕐 15:00");
    await diz(ANA, "1");
    expect(await contar("appointments", "status = 'CANCELADO'")).toBe(1);
    expect(await contar("appointments", `id = '${segundo.id}' AND status = 'CANCELADO'`)).toBe(1);
  });

  it("política de cancelamento: fora do prazo, orienta a falar com a profissional", async () => {
    await agendar(ANA, SEGUNDA, "10:00");
    const tarde = sp(SEGUNDA, "09:00");
    await diz(ANA, "cancelar", tarde);
    const r = await diz(ANA, "1", tarde);
    expect(r.texto).toContain("pelo menos 2 horas de antecedência");
    expect(await contar("appointments", "status = 'CONFIRMADO'")).toBe(1);
  });

  it("CANCELAR sem agendamentos avisa a cliente", async () => {
    const r = await diz(BIA, "cancelar");
    expect(r.texto).toContain("Não encontrei agendamentos futuros");
  });

  it("SAIR desativa os lembretes (opt-out) e LEMBRETES reativa", async () => {
    await agendar(ANA, TERCA, "10:00");
    let r = await diz(ANA, "sair");
    expect(r.texto).toContain("não receberá mais lembretes");
    expect(await contar("customers", "aceita_lembretes = false")).toBe(1);
    r = await diz(ANA, "lembretes");
    expect(await contar("customers", "aceita_lembretes = true")).toBe(1);
  });
});
