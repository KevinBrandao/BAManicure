/**
 * Fluxo conversacional do WhatsApp (máquina de estados por telefone).
 *
 * O estado fica em CONVERSATIONS. Nada é gravado em APPOINTMENTS antes da
 * confirmação explícita (RB11): conversas abandonadas simplesmente expiram.
 */
import { getDb } from "../db";
import {
  AgendaError,
  agendamentosFuturosDoTelefone,
  buscarAgendamento,
  buscarClientePorTelefone,
  buscarServico,
  cancelarAgendamento,
  criarAgendamento,
  datasDisponiveis,
  horariosDisponiveis,
  listarServicos,
  registrarMotivoCancelamento,
  STATUS_ROTULO,
  type Agendamento,
  type Cliente,
} from "../agenda";
import { lerConfiguracoes, nomeExibicao } from "../settings";
import { formatarDataComDia, formatarDuracao, formatarPreco, somarDias } from "../tz";
import { enviarTexto } from "./envio";

export type Estado =
  | "MENU"
  | "CONFIRMAR_NOME"
  | "AGUARDANDO_NOME"
  | "ESCOLHA_SERVICO"
  | "ESCOLHA_DATA"
  | "ESCOLHA_HORARIO"
  | "CONFIRMACAO"
  | "CANCELAR_ESCOLHA"
  | "CANCELAR_CONFIRMA"
  | "CANCELAR_MOTIVO"
  | "POS_ATENDIMENTO"
  | "HUMANO";

interface Dados {
  nome?: string;
  servicos?: string[];
  serviceId?: string;
  datas?: string[];
  data?: string;
  horarios?: string[];
  hora?: string;
  agendamentos?: string[];
  agendamentoId?: string;
}

interface Passo {
  estado: Estado;
  dados: Dados;
  respostas: string[];
}

/** Conversa sem atividade por este tempo volta ao início. */
const EXPIRA_MIN = 30;
/** Tempo em que o robô fica em silêncio após pedido de atendimento humano. */
const EXPIRA_HUMANO_MIN = 12 * 60;
const DATAS_POR_PAGINA = 7;

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

const OPCOES_MENU = [
  "1 - Agendar um horário",
  "2 - Consultar meu agendamento",
  "3 - Cancelar agendamento",
  "4 - Conhecer os serviços e valores",
  "5 - Falar diretamente com a profissional",
].join("\n");

function textoBoasVindas(nome: string): string {
  return [
    "Olá! Seja muito bem-vinda! 💅",
    "",
    `Sou a assistente virtual da ${nome}.`,
    "Estou aqui para ajudar você a agendar seu horário.",
    "",
    "Como posso ajudar?",
    "",
    OPCOES_MENU,
  ].join("\n");
}

function textoMenu(): string {
  return ["Como posso ajudar?", "", OPCOES_MENU].join("\n");
}

const NAO_ENTENDI = "Não entendi 😅 Por favor, responda com o número de uma das opções.";

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0];
}

function minutosPorExtenso(min: number): string {
  if (min % 60 === 0) {
    const h = min / 60;
    return h === 1 ? "1 hora" : `${h} horas`;
  }
  return `${min} minutos`;
}

export function textoConfirmacaoAgendamento(a: Agendamento): string {
  return [
    "🎉 Agendamento confirmado!",
    "",
    `Olá, ${primeiroNome(a.cliente_nome)}!`,
    "Seu horário foi reservado com sucesso.",
    "",
    `💅 Procedimento: ${a.servico_nome}`,
    `📅 Data: ${formatarDataComDia(a.data)}`,
    `🕐 Horário: ${a.hora}`,
    `💰 Valor: ${formatarPreco(a.preco_centavos)}`,
    `🔖 Código: ${a.codigo}`,
    "",
    "Estamos esperando você!",
    "Caso precise cancelar, basta enviar CANCELAR.",
    "",
    "Obrigada pela preferência! ❤️",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[!.?,;*_~]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Interpreta "2", "2.", "opção 2", "2 - Pedicure" como 2. */
function opcao(textoNorm: string): number | null {
  const m = textoNorm.match(/^(?:opcao\s+)?(\d{1,2})(?:\s*-.*)?$/);
  return m ? Number(m[1]) : null;
}

/** Interpreta "14:30", "14h30", "14h", "9 horas" => "14:30". */
function horaDigitada(textoNorm: string): string | null {
  const m = textoNorm.match(/^(\d{1,2})\s*(?::|h|hs|horas?)\s*(\d{2})?$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2] ?? "0");
  if (hh > 23 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function nomeValido(texto: string): string | null {
  const nome = texto.replace(/\s+/g, " ").trim();
  if (nome.length < 5 || nome.length > 80) return null;
  if (!/^[\p{L}][\p{L}\s'.-]*$/u.test(nome)) return null;
  if (nome.split(" ").filter((p) => p.length >= 2).length < 2) return null;
  return nome;
}

// ---------------------------------------------------------------------------
// Passos do fluxo
// ---------------------------------------------------------------------------

async function passoMenu(prefixo?: string): Promise<Passo> {
  return { estado: "MENU", dados: {}, respostas: [prefixo ? `${prefixo}\n\n${textoMenu()}` : textoMenu()] };
}

async function passoBoasVindas(): Promise<Passo> {
  const cfg = await lerConfiguracoes();
  return { estado: "MENU", dados: {}, respostas: [textoBoasVindas(nomeExibicao(cfg))] };
}

function passoIniciarAgendamento(cliente: Cliente | null): Passo {
  const abertura = "Perfeito! Vamos encontrar o melhor horário para você. ❤️";
  if (cliente) {
    return {
      estado: "CONFIRMAR_NOME",
      dados: { nome: cliente.nome },
      respostas: [
        `${abertura}\n\nVou agendar em nome de *${cliente.nome}*. Está correto?\n\n1 - Sim\n2 - Não, informar outro nome`,
      ],
    };
  }
  return { estado: "AGUARDANDO_NOME", dados: {}, respostas: [`${abertura}\n\nQual é o seu nome completo?`] };
}

async function passoServicos(dados: Dados, prefixo?: string): Promise<Passo> {
  const servicos = await listarServicos({ apenasAtivos: true });
  if (servicos.length === 0) {
    return passoMenu(
      "No momento não há serviços disponíveis para agendamento online. Envie 5 para falar com a profissional.",
    );
  }
  const linhas = servicos.map(
    (s, i) => `${i + 1} - ${s.nome} — ${formatarPreco(s.preco_centavos)} (${formatarDuracao(s.duracao_minutos)})`,
  );
  const cabecalho = prefixo ? `${prefixo}\n\n` : "";
  return {
    estado: "ESCOLHA_SERVICO",
    dados: { nome: dados.nome, servicos: servicos.map((s) => s.id) },
    respostas: [`${cabecalho}Qual procedimento você gostaria de realizar?\n\n${linhas.join("\n")}`],
  };
}

async function passoDatas(dados: Dados, opts: { aPartirDe?: string; prefixo?: string } = {}): Promise<Passo> {
  const dias = await datasDisponiveis(dados.serviceId!, { limite: DATAS_POR_PAGINA + 1, aPartirDe: opts.aPartirDe });
  if (dias.length === 0) {
    if (opts.aPartirDe) {
      return passoDatas(dados, { prefixo: "Não há mais datas disponíveis além dessas." });
    }
    return passoMenu(
      "Poxa, não encontrei horários livres para este serviço nos próximos dias 😕\nEnvie 5 para falar com a profissional.",
    );
  }
  const temMais = dias.length > DATAS_POR_PAGINA;
  const pagina = dias.slice(0, DATAS_POR_PAGINA);
  const linhas = pagina.map((d, i) => `${i + 1} - ${formatarDataComDia(d.data)}`);
  if (temMais) linhas.push(`${pagina.length + 1} - Ver mais datas`);
  const cabecalho = opts.prefixo ? `${opts.prefixo}\n\n` : "";
  return {
    estado: "ESCOLHA_DATA",
    dados: { nome: dados.nome, serviceId: dados.serviceId, datas: pagina.map((d) => d.data) },
    respostas: [`${cabecalho}Qual dia fica melhor para você?\n\n${linhas.join("\n")}`],
  };
}

async function passoHorarios(dados: Dados, data: string, prefixo?: string): Promise<Passo> {
  const horarios = await horariosDisponiveis(dados.serviceId!, data);
  if (horarios.length === 0) {
    return passoDatas(dados, {
      prefixo: `${prefixo ? `${prefixo}\n\n` : ""}Os horários de ${formatarDataComDia(data)} acabaram de ser preenchidos.`,
    });
  }
  const linhas = horarios.map((h, i) => `${i + 1} - ${h}`);
  linhas.push(`${horarios.length + 1} - Escolher outro dia`);
  const cabecalho = prefixo ? `${prefixo}\n\n` : "";
  return {
    estado: "ESCOLHA_HORARIO",
    dados: { nome: dados.nome, serviceId: dados.serviceId, data, horarios },
    respostas: [
      `${cabecalho}Para ${formatarDataComDia(data)}, temos estes horários:\n\n${linhas.join("\n")}\n\nQual horário você prefere?`,
    ],
  };
}

async function passoResumo(dados: Dados, hora: string): Promise<Passo> {
  const servico = await buscarServico(dados.serviceId!);
  if (!servico || !servico.ativo) {
    return passoServicos(dados, "Este serviço não está mais disponível. Escolha outro, por favor.");
  }
  return {
    estado: "CONFIRMACAO",
    dados: { nome: dados.nome, serviceId: dados.serviceId, data: dados.data, hora },
    respostas: [
      [
        "Confira seu agendamento:",
        "",
        `👤 Cliente: ${dados.nome}`,
        `💅 Serviço: ${servico.nome}`,
        `📅 Data: ${formatarDataComDia(dados.data!)}`,
        `🕐 Horário: ${hora}`,
        `💰 Valor: ${formatarPreco(servico.preco_centavos)}`,
        "",
        "Podemos confirmar?",
        "",
        "1 - Confirmar agendamento",
        "2 - Escolher outro horário",
        "3 - Cancelar",
        "",
        "_Ao confirmar, você concorda em receber por aqui a confirmação e os lembretes do seu horário. Envie SAIR a qualquer momento para não receber lembretes._",
      ].join("\n"),
    ],
  };
}

async function passoConfirmar(telefone: string, dados: Dados, agora: Date): Promise<Passo> {
  try {
    const ag = await criarAgendamento({
      cliente: { nome: dados.nome!, telefone, registrarConsentimento: true },
      serviceId: dados.serviceId!,
      data: dados.data!,
      hora: dados.hora!,
      origem: "WHATSAPP",
      agora,
    });
    // RB16: a confirmação só é montada depois de o agendamento estar salvo
    return { estado: "POS_ATENDIMENTO", dados: {}, respostas: [textoConfirmacaoAgendamento(ag)] };
  } catch (err) {
    if (err instanceof AgendaError && err.codigo === "HORARIO_INDISPONIVEL") {
      // RB12: horário ficou indisponível antes da confirmação
      return passoHorarios(
        dados,
        dados.data!,
        "Poxa, esse horário acabou de ficar indisponível 😕 Mas veja outras opções:",
      );
    }
    if (err instanceof AgendaError && err.codigo === "SERVICO_INDISPONIVEL") {
      return passoServicos(dados, "Este serviço não está mais disponível. Escolha outro, por favor.");
    }
    throw err;
  }
}

function descreverAgendamento(a: Agendamento): string {
  return [`💅 ${a.servico_nome}`, `📅 ${formatarDataComDia(a.data)}`, `🕐 ${a.hora}`].join("\n");
}

async function passoConsultar(telefone: string, agora: Date): Promise<Passo> {
  const ags = await agendamentosFuturosDoTelefone(telefone, agora);
  if (ags.length === 0) {
    return passoMenu("Não encontrei agendamentos futuros para este número.");
  }
  const blocos = ags.map((a) =>
    [
      `👤 Cliente: ${a.cliente_nome}`,
      `💅 Serviço: ${a.servico_nome}`,
      `📅 Data: ${formatarDataComDia(a.data)}`,
      `🕐 Horário: ${a.hora}`,
      `📌 Status: ${STATUS_ROTULO[a.status]}`,
    ].join("\n"),
  );
  const titulo = ags.length === 1 ? "Encontrei seu agendamento:" : "Encontrei seus agendamentos:";
  return {
    estado: "MENU",
    dados: {},
    respostas: [
      `${titulo}\n\n${blocos.join("\n\n")}\n\nEnvie *CANCELAR* para cancelar um agendamento, *5* para falar com a profissional ou *MENU* para ver as opções.`,
    ],
  };
}

function passoConfirmarCancelamento(a: Agendamento): Passo {
  return {
    estado: "CANCELAR_CONFIRMA",
    dados: { agendamentoId: a.id },
    respostas: [
      `Olá, ${primeiroNome(a.cliente_nome)}!\n\nEncontrei seu agendamento:\n\n${descreverAgendamento(a)}\n\nDeseja realmente cancelar?\n\n1 - Sim, cancelar\n2 - Não, manter agendamento`,
    ],
  };
}

async function passoIniciarCancelamento(telefone: string, agora: Date): Promise<Passo> {
  const ags = await agendamentosFuturosDoTelefone(telefone, agora);
  if (ags.length === 0) return passoMenu("Não encontrei agendamentos futuros para este número.");
  if (ags.length === 1) return passoConfirmarCancelamento(ags[0]);
  const linhas = ags.map((a, i) => `${i + 1} - ${a.servico_nome} — ${formatarDataComDia(a.data)} às ${a.hora}`);
  linhas.push(`${ags.length + 1} - Voltar ao menu`);
  return {
    estado: "CANCELAR_ESCOLHA",
    dados: { agendamentos: ags.map((a) => a.id) },
    respostas: [
      `Olá, ${primeiroNome(ags[0].cliente_nome)}! Você possui ${ags.length} agendamentos.\nQual deles deseja cancelar?\n\n${linhas.join("\n")}`,
    ],
  };
}

async function passoEfetivarCancelamento(dados: Dados, agora: Date): Promise<Passo> {
  try {
    const ag = await cancelarAgendamento({ id: dados.agendamentoId!, por: "CLIENTE", aplicarPolitica: true, agora });
    return {
      estado: "CANCELAR_MOTIVO",
      dados: { agendamentoId: ag.id },
      respostas: [
        `Agendamento cancelado com sucesso, ${primeiroNome(ag.cliente_nome)}.\nEsperamos receber você em uma próxima oportunidade! ❤️`,
        "Se quiser, conte em uma mensagem o motivo do cancelamento (opcional). Ou envie *MENU* para ver as opções.",
      ],
    };
  } catch (err) {
    if (err instanceof AgendaError && err.codigo === "POLITICA_CANCELAMENTO") {
      const cfg = await lerConfiguracoes();
      return {
        estado: "MENU",
        dados: {},
        respostas: [
          `Os cancelamentos por aqui precisam ser feitos com pelo menos ${minutosPorExtenso(cfg.cancelamento_antecedencia_minutos)} de antecedência, e esse prazo já passou. 😕\n\nEnvie *5* para falar diretamente com a profissional.`,
        ],
      };
    }
    if (err instanceof AgendaError) {
      return passoMenu("Este agendamento não está mais ativo.");
    }
    throw err;
  }
}

async function passoHumano(): Promise<Passo> {
  const cfg = await lerConfiguracoes();
  return {
    estado: "HUMANO",
    dados: {},
    respostas: [
      `Certo! Avisei a ${nomeExibicao(cfg)} e ela vai responder por aqui assim que possível. 💬\n\nPara voltar ao atendimento automático, envie *MENU*.`,
    ],
  };
}

async function passoListarServicos(): Promise<Passo> {
  const servicos = await listarServicos({ apenasAtivos: true });
  if (servicos.length === 0) return passoMenu("Ainda não há serviços cadastrados.");
  const blocos = servicos.map((s) =>
    [
      `💅 *${s.nome}*`,
      s.descricao ? s.descricao : null,
      `${formatarPreco(s.preco_centavos)} • ${formatarDuracao(s.duracao_minutos)}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return {
    estado: "MENU",
    dados: {},
    respostas: [`Nossos serviços e valores:\n\n${blocos.join("\n\n")}\n\nEnvie *1* para agendar um horário ou *MENU* para ver as opções.`],
  };
}

async function tratarMenu(n: number | null, telefone: string, cliente: Cliente | null, agora: Date): Promise<Passo | null> {
  switch (n) {
    case 1:
      return passoIniciarAgendamento(cliente);
    case 2:
      return passoConsultar(telefone, agora);
    case 3:
      return passoIniciarCancelamento(telefone, agora);
    case 4:
      return passoListarServicos();
    case 5:
      return passoHumano();
    default:
      return null;
  }
}

function repetir(estado: Estado, dados: Dados, pergunta: string): Passo {
  return { estado, dados, respostas: [`${NAO_ENTENDI}\n\n${pergunta}`] };
}

// ---------------------------------------------------------------------------
// Máquina de estados
// ---------------------------------------------------------------------------

async function decidir(
  estado: Estado | null,
  dados: Dados,
  texto: string | null,
  telefone: string,
  cliente: Cliente | null,
  agora: Date,
): Promise<Passo> {
  // Atendimento humano: o robô fica em silêncio até a cliente enviar MENU
  if (estado === "HUMANO") {
    const t = texto ? normalizar(texto) : "";
    if (["menu", "inicio", "0", "voltar"].includes(t)) return passoMenu();
    return { estado: "HUMANO", dados, respostas: [] };
  }

  if (texto === null) {
    return passoMenu("Por enquanto consigo entender apenas mensagens de texto 😊");
  }

  const t = normalizar(texto);
  const n = opcao(t);

  // ---- Comandos globais ---------------------------------------------------
  if (["menu", "inicio", "0", "voltar ao menu"].includes(t)) return passoMenu();

  if (["sair", "parar", "parar lembretes", "descadastrar"].includes(t)) {
    const db = await getDb();
    if (cliente) await db.query("UPDATE customers SET aceita_lembretes = false WHERE id = $1", [cliente.id]);
    return {
      estado: "POS_ATENDIMENTO",
      dados: {},
      respostas: [
        "Tudo certo! Você não receberá mais lembretes automáticos. 🔕\nSeus agendamentos continuam valendo. Para voltar a receber, envie *LEMBRETES*.",
      ],
    };
  }
  if (t === "lembretes") {
    const db = await getDb();
    if (cliente) {
      await db.query("UPDATE customers SET aceita_lembretes = true, consentimento_em = $2 WHERE id = $1", [cliente.id, agora]);
    }
    return { estado: "POS_ATENDIMENTO", dados: {}, respostas: ["Pronto! Você voltará a receber os lembretes dos seus horários. 🔔"] };
  }

  if (t.startsWith("cancelar") && estado !== "CONFIRMACAO") {
    return passoIniciarCancelamento(telefone, agora);
  }
  if (["atendente", "humano", "falar com atendente", "falar com a profissional"].includes(t)) {
    return passoHumano();
  }

  // ---- Estados --------------------------------------------------------------
  switch (estado) {
    case null:
      return passoBoasVindas();

    case "MENU": {
      const passo = await tratarMenu(n, telefone, cliente, agora);
      return passo ?? { estado: "MENU", dados: {}, respostas: [`${NAO_ENTENDI}\n\n${textoMenu()}`] };
    }

    case "POS_ATENDIMENTO": {
      const passo = await tratarMenu(n, telefone, cliente, agora);
      return (
        passo ?? {
          estado: "POS_ATENDIMENTO",
          dados: {},
          respostas: ["Estou por aqui se precisar! 😊 Envie *MENU* para ver as opções."],
        }
      );
    }

    case "CONFIRMAR_NOME": {
      if (n === 1 || ["sim", "s", "correto", "isso"].includes(t)) return passoServicos(dados);
      if (n === 2 || ["nao", "n"].includes(t)) {
        return { estado: "AGUARDANDO_NOME", dados: {}, respostas: ["Sem problemas! Qual é o seu nome completo?"] };
      }
      return repetir(estado, dados, `Vou agendar em nome de *${dados.nome}*. Está correto?\n\n1 - Sim\n2 - Não, informar outro nome`);
    }

    case "AGUARDANDO_NOME": {
      const nome = nomeValido(texto);
      if (!nome) {
        return {
          estado,
          dados,
          respostas: ["Por favor, informe seu nome completo (nome e sobrenome), usando apenas letras."],
        };
      }
      return passoServicos({ nome }, `Prazer, ${primeiroNome(nome)}! 😊`);
    }

    case "ESCOLHA_SERVICO": {
      const ids = dados.servicos ?? [];
      if (n !== null && n >= 1 && n <= ids.length) {
        return passoDatas({ nome: dados.nome, serviceId: ids[n - 1] });
      }
      const passo = await passoServicos(dados);
      return { ...passo, respostas: [`${NAO_ENTENDI}\n\n${passo.respostas[0]}`] };
    }

    case "ESCOLHA_DATA": {
      const datas = dados.datas ?? [];
      if (n !== null && n >= 1 && n <= datas.length) return passoHorarios(dados, datas[n - 1]);
      if (n !== null && n === datas.length + 1 && datas.length > 0) {
        return passoDatas(dados, { aPartirDe: somarDias(datas[datas.length - 1], 1) });
      }
      const passo = await passoDatas(dados);
      return { ...passo, respostas: [`${NAO_ENTENDI}\n\n${passo.respostas[0]}`] };
    }

    case "ESCOLHA_HORARIO": {
      const horarios = dados.horarios ?? [];
      if (n !== null && n >= 1 && n <= horarios.length) return passoResumo(dados, horarios[n - 1]);
      if (n !== null && n === horarios.length + 1) return passoDatas(dados);
      const digitada = horaDigitada(t);
      if (digitada && horarios.includes(digitada)) return passoResumo(dados, digitada);
      return passoHorarios(
        dados,
        dados.data!,
        digitada ? `O horário ${digitada} não está disponível.` : NAO_ENTENDI,
      );
    }

    case "CONFIRMACAO": {
      if (n === 1 || ["sim", "confirmar", "confirmo", "pode confirmar"].includes(t)) {
        return passoConfirmar(telefone, dados, agora);
      }
      if (n === 2) return passoHorarios(dados, dados.data!);
      if (n === 3 || t.startsWith("cancelar") || ["nao", "desistir"].includes(t)) {
        return passoMenu("Tudo bem, nada foi agendado. 😊");
      }
      return repetir(estado, dados, "Podemos confirmar?\n\n1 - Confirmar agendamento\n2 - Escolher outro horário\n3 - Cancelar");
    }

    case "CANCELAR_ESCOLHA": {
      const ids = dados.agendamentos ?? [];
      if (n !== null && n >= 1 && n <= ids.length) {
        const ag = await buscarAgendamento(ids[n - 1]);
        if (!ag || (ag.status !== "CONFIRMADO" && ag.status !== "PENDENTE")) {
          return passoMenu("Este agendamento não está mais ativo.");
        }
        return passoConfirmarCancelamento(ag);
      }
      if (n === ids.length + 1) return passoMenu();
      const passo = await passoIniciarCancelamento(telefone, agora);
      return { ...passo, respostas: [`${NAO_ENTENDI}\n\n${passo.respostas[0]}`] };
    }

    case "CANCELAR_CONFIRMA": {
      if (n === 1 || ["sim", "s"].includes(t)) return passoEfetivarCancelamento(dados, agora);
      if (n === 2 || ["nao", "n", "manter"].includes(t)) {
        return {
          estado: "POS_ATENDIMENTO",
          dados: {},
          respostas: ["Combinado! Seu agendamento continua confirmado. ❤️"],
        };
      }
      return repetir(estado, dados, "Deseja realmente cancelar?\n\n1 - Sim, cancelar\n2 - Não, manter agendamento");
    }

    case "CANCELAR_MOTIVO": {
      const passo = await tratarMenu(n, telefone, cliente, agora);
      if (passo) return passo;
      if (dados.agendamentoId) await registrarMotivoCancelamento(dados.agendamentoId, texto);
      return {
        estado: "POS_ATENDIMENTO",
        dados: {},
        respostas: ["Obrigada por avisar! ❤️ Quando quiser agendar novamente, é só enviar *MENU*."],
      };
    }

    default:
      return passoBoasVindas();
  }
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export interface MensagemRecebida {
  /** número de origem, como enviado pelo WhatsApp (só dígitos, com DDI) */
  telefone: string;
  /** null quando a mensagem não é de texto (áudio, imagem, figurinha...) */
  texto: string | null;
  /** id da mensagem no WhatsApp — usado para ignorar webhooks repetidos */
  waMessageId?: string | null;
  /** descrição registrada no histórico para mensagens que não são de texto */
  descricaoMidia?: string;
  agora?: Date;
}

export interface ResultadoConversa {
  duplicada: boolean;
  estado: Estado | null;
  respostas: string[];
}

export async function processarMensagem(msg: MensagemRecebida): Promise<ResultadoConversa> {
  const db = await getDb();
  const agora = msg.agora ?? new Date();
  const telefone = msg.telefone.replace(/\D/g, "");
  if (!/^[0-9]{8,15}$/.test(telefone)) return { duplicada: false, estado: null, respostas: [] };

  const cliente = await buscarClientePorTelefone(telefone, db);

  // 1) Registra a mensagem recebida. O índice único em wa_message_id garante
  //    que um webhook reenviado pela Meta não seja processado duas vezes.
  const registro = await db.query<{ id: string }>(
    `INSERT INTO whatsapp_messages (customer_id, telefone, direcao, tipo, mensagem, status, wa_message_id, created_at)
     VALUES ($1, $2, 'ENTRADA', $3, $4, 'RECEBIDA', $5, $6)
     ON CONFLICT (wa_message_id) WHERE direcao = 'ENTRADA' AND wa_message_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      cliente?.id ?? null,
      telefone,
      msg.texto === null ? "midia" : "texto",
      (msg.texto ?? msg.descricaoMidia ?? "[mensagem não suportada]").slice(0, 4000),
      msg.waMessageId ?? null,
      agora,
    ],
  );
  if (registro.rows.length === 0) return { duplicada: true, estado: null, respostas: [] };

  // 2) Estado atual (expira por inatividade — RB11)
  const conv = await db.query<{ estado: Estado; dados: Dados; updated_at: Date }>(
    "SELECT estado, dados, updated_at FROM conversations WHERE telefone = $1",
    [telefone],
  );
  let estado: Estado | null = null;
  let dados: Dados = {};
  if (conv.rows[0]) {
    const idadeMin = (agora.getTime() - new Date(conv.rows[0].updated_at).getTime()) / 60_000;
    const limite = conv.rows[0].estado === "HUMANO" ? EXPIRA_HUMANO_MIN : EXPIRA_MIN;
    if (idadeMin <= limite) {
      estado = conv.rows[0].estado;
      dados = conv.rows[0].dados ?? {};
    }
  }

  // 3) Decide a resposta
  let passo: Passo;
  try {
    passo = await decidir(estado, dados, msg.texto, telefone, cliente, agora);
  } catch (err) {
    console.error("[whatsapp] erro ao processar mensagem:", err);
    passo = {
      estado: "MENU",
      dados: {},
      respostas: [
        `Desculpe, tive um problema para processar sua mensagem. 😕 Vamos tentar de novo?\n\n${textoMenu()}`,
      ],
    };
  }

  // 4) Persiste o novo estado
  await db.query(
    `INSERT INTO conversations (telefone, estado, dados, updated_at) VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (telefone) DO UPDATE SET estado = EXCLUDED.estado, dados = EXCLUDED.dados, updated_at = EXCLUDED.updated_at`,
    [telefone, passo.estado, JSON.stringify(passo.dados), agora],
  );

  // 5) Envia as respostas (falhas ficam registradas em WHATSAPP_MESSAGES)
  const clienteAtual = cliente ?? (await buscarClientePorTelefone(telefone, db));
  for (const resposta of passo.respostas) {
    await enviarTexto(telefone, resposta, clienteAtual?.id ?? null);
  }

  return { duplicada: false, estado: passo.estado, respostas: passo.respostas };
}
