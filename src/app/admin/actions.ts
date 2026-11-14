"use server";

/**
 * Ações do painel administrativo. Todas exigem sessão válida, validam os
 * dados no servidor e registram a operação em AUDIT_LOG.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { entrar, exigirAdmin, registrarAuditoria, sair, type Usuario } from "@/lib/auth";
import {
  AgendaError,
  alterarStatus,
  buscarClientePorTelefone,
  cancelarAgendamento,
  criarAgendamento,
  ehUuid,
  normalizarTelefone,
  reagendar,
  STATUS,
  type Status,
} from "@/lib/agenda";
import { removerImagem, salvarImagem } from "@/lib/imagens";
import { processarLembretes, reenfileirarLembrete } from "@/lib/lembretes";
import { lerConfiguracoes, salvarConfiguracoes } from "@/lib/settings";
import { dataValida, horaValida } from "@/lib/tz";
import { dentroDaJanela24h, enviarTexto } from "@/lib/whatsapp/envio";

// ---------------------------------------------------------------------------
// Infraestrutura
// ---------------------------------------------------------------------------

class ErroValidacao extends Error {}

function mensagemDeErro(err: unknown): string {
  if (err instanceof ErroValidacao || err instanceof AgendaError) return err.message;
  console.error("[admin] erro inesperado:", err);
  return "Ocorreu um erro inesperado. Tente novamente.";
}

function comMensagem(caminho: string, tipo: "ok" | "erro", msg: string): string {
  const [base, hash] = caminho.split("#");
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}${tipo}=${encodeURIComponent(msg)}${hash ? `#${hash}` : ""}`;
}

/** Só aceita caminhos internos do painel como destino de retorno. */
function caminhoSeguro(valor: FormDataEntryValue | null, padrao: string): string {
  if (typeof valor !== "string") return padrao;
  return /^\/admin(\/[\w\-./]*)?(\?[\w\-=&%.]*)?$/.test(valor) ? valor : padrao;
}

/**
 * Executa a ação autenticada e redireciona com mensagem de sucesso ou erro.
 * `fn` devolve a mensagem de sucesso ou { msg, destino }.
 */
async function executar(
  retorno: string,
  fn: (usuario: Usuario) => Promise<string | { msg: string; destino: string }>,
): Promise<never> {
  const usuario = await exigirAdmin();
  let destino: string;
  try {
    const r = await fn(usuario);
    destino = typeof r === "string" ? comMensagem(retorno, "ok", r) : comMensagem(r.destino, "ok", r.msg);
  } catch (err) {
    destino = comMensagem(retorno, "erro", mensagemDeErro(err));
  }
  revalidatePath("/", "layout");
  redirect(destino);
}

function texto(fd: FormData, campo: string, opts: { max?: number; obrigatorio?: string } = {}): string {
  const v = fd.get(campo);
  const s = typeof v === "string" ? v.trim() : "";
  if (!s && opts.obrigatorio) throw new ErroValidacao(opts.obrigatorio);
  if (s.length > (opts.max ?? 500)) throw new ErroValidacao(`O campo "${campo}" excede ${opts.max ?? 500} caracteres.`);
  return s;
}

function inteiro(fd: FormData, campo: string, rotulo: string, min: number, max: number): number {
  const s = texto(fd, campo);
  const n = Number(s);
  if (!s || !Number.isInteger(n) || n < min || n > max) {
    throw new ErroValidacao(`${rotulo}: informe um número inteiro entre ${min} e ${max}.`);
  }
  return n;
}

/** "35", "35,5", "35,50", "1.250,00" => centavos */
function precoEmCentavos(fd: FormData, campo: string): number {
  const s = texto(fd, campo, { obrigatorio: "Informe o preço." }).replace(/^R\$\s*/i, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(s)) throw new ErroValidacao("Preço inválido. Exemplo: 35,00");
  const normal = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const centavos = Math.round(Number(normal) * 100);
  if (!Number.isFinite(centavos) || centavos < 0 || centavos > 10_000_000) throw new ErroValidacao("Preço inválido.");
  return centavos;
}

function data(fd: FormData, campo: string, rotulo = "Data"): string {
  const v = fd.get(campo);
  if (!dataValida(v)) throw new ErroValidacao(`${rotulo} inválida.`);
  return v;
}

function hora(fd: FormData, campo: string, rotulo = "Horário"): string {
  const v = fd.get(campo);
  const s = typeof v === "string" ? v.slice(0, 5) : v;
  if (!horaValida(s)) throw new ErroValidacao(`${rotulo} inválido.`);
  return s;
}

function horaOpcional(fd: FormData, campo: string, rotulo: string): string | null {
  const v = fd.get(campo);
  if (typeof v !== "string" || v.trim() === "") return null;
  return hora(fd, campo, rotulo);
}

function uuid(fd: FormData, campo: string, rotulo: string): string {
  const v = fd.get(campo);
  if (!ehUuid(v)) throw new ErroValidacao(`${rotulo} inválido(a).`);
  return v;
}

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------

export async function acaoEntrar(fd: FormData): Promise<void> {
  const email = String(fd.get("email") ?? "");
  const r = await entrar(email, String(fd.get("senha") ?? ""));
  if (!r.ok) redirect(comMensagem("/admin/login", "erro", r.erro));
  await registrarAuditoria(null, "login", "users", null, { email: email.trim().toLowerCase() });
  redirect("/admin");
}

export async function acaoSair(): Promise<void> {
  await sair();
  redirect("/admin/login");
}

// ---------------------------------------------------------------------------
// Serviços
// ---------------------------------------------------------------------------

export async function salvarServico(fd: FormData): Promise<void> {
  const id = fd.get("id");
  const retorno = ehUuid(id) ? `/admin/servicos/${id}` : "/admin/servicos/novo";
  await executar(retorno, async (u) => {
    const nome = texto(fd, "nome", { max: 80, obrigatorio: "Informe o nome do serviço." });
    const descricao = texto(fd, "descricao", { max: 400 });
    const preco = precoEmCentavos(fd, "preco");
    const duracao = inteiro(fd, "duracao_minutos", "Duração", 5, 720);
    const intervalo = inteiro(fd, "intervalo_minutos", "Intervalo adicional", 0, 240);
    const ordem = inteiro(fd, "ordem", "Ordem", 0, 999);
    const ativo = fd.get("ativo") === "on";
    const novaImagem = await salvarImagem(fd.get("imagem"));
    const removerFoto = fd.get("remover_imagem") === "on";
    const db = await getDb();

    if (ehUuid(id)) {
      const atual = await db.query<{ image_id: string | null }>("SELECT image_id FROM services WHERE id = $1", [id]);
      if (!atual.rows[0]) throw new ErroValidacao("Serviço não encontrado.");
      const imagemAntiga = atual.rows[0].image_id;
      const imageId = novaImagem ?? (removerFoto ? null : imagemAntiga);
      await db.query(
        `UPDATE services SET nome=$2, descricao=$3, preco_centavos=$4, duracao_minutos=$5,
                intervalo_minutos=$6, ativo=$7, ordem=$8, image_id=$9 WHERE id=$1`,
        [id, nome, descricao, preco, duracao, intervalo, ativo, ordem, imageId],
      );
      if (imagemAntiga && imagemAntiga !== imageId) await removerImagem(imagemAntiga);
      await registrarAuditoria(u, "servico.atualizar", "services", id, { nome, preco, duracao, intervalo, ativo });
      return { msg: "Serviço atualizado.", destino: "/admin/servicos" };
    }
    const r = await db.query<{ id: string }>(
      `INSERT INTO services (nome, descricao, preco_centavos, duracao_minutos, intervalo_minutos, ativo, ordem, image_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [nome, descricao, preco, duracao, intervalo, ativo, ordem, novaImagem],
    );
    await registrarAuditoria(u, "servico.criar", "services", r.rows[0].id, { nome, preco, duracao, intervalo, ativo });
    return { msg: "Serviço cadastrado.", destino: "/admin/servicos" };
  });
}

export async function alternarServico(fd: FormData): Promise<void> {
  await executar("/admin/servicos", async (u) => {
    const id = uuid(fd, "id", "Serviço");
    const db = await getDb();
    const r = await db.query<{ ativo: boolean }>("UPDATE services SET ativo = NOT ativo WHERE id = $1 RETURNING ativo", [id]);
    if (!r.rows[0]) throw new ErroValidacao("Serviço não encontrado.");
    await registrarAuditoria(u, "servico.alternar", "services", id, { ativo: r.rows[0].ativo });
    return r.rows[0].ativo ? "Serviço ativado." : "Serviço desativado: não será mais oferecido para agendamento.";
  });
}

export async function excluirServico(fd: FormData): Promise<void> {
  await executar("/admin/servicos", async (u) => {
    const id = uuid(fd, "id", "Serviço");
    const db = await getDb();
    const uso = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM appointments WHERE service_id = $1", [id]);
    if (uso.rows[0].n > 0) {
      throw new ErroValidacao("Este serviço possui agendamentos no histórico e não pode ser excluído. Desative-o em vez disso.");
    }
    const r = await db.query<{ image_id: string | null }>("DELETE FROM services WHERE id = $1 RETURNING image_id", [id]);
    await removerImagem(r.rows[0]?.image_id);
    await registrarAuditoria(u, "servico.excluir", "services", id);
    return "Serviço excluído.";
  });
}

// ---------------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------------

export async function criarAgendamentoAdmin(fd: FormData): Promise<void> {
  const retorno = caminhoSeguro(fd.get("retorno"), "/admin/agenda/novo");
  await executar(retorno, async (u) => {
    const serviceId = uuid(fd, "service_id", "Serviço");
    const dia = data(fd, "data");
    const horario = hora(fd, "hora");
    const observacoes = texto(fd, "observacoes", { max: 500 });
    const nome = texto(fd, "nome", { max: 80, obrigatorio: "Informe o nome da cliente." });
    const telefone = normalizarTelefone(texto(fd, "telefone", { max: 25, obrigatorio: "Informe o WhatsApp da cliente." }));
    if (!telefone) throw new ErroValidacao("Telefone inválido. Use DDD + número, ex.: (11) 99999-8888.");

    const ag = await criarAgendamento({
      cliente: { nome, telefone },
      serviceId,
      data: dia,
      hora: horario,
      origem: "ADMIN",
      observacoes,
      ignorarAntecedencia: true,
    });
    await registrarAuditoria(u, "agendamento.criar", "appointments", ag.id, { data: dia, hora: horario, servico: ag.servico_nome });
    return { msg: "Agendamento criado.", destino: `/admin/agenda?visao=dia&data=${dia}` };
  });
}

export async function salvarAgendamento(fd: FormData): Promise<void> {
  const id = String(fd.get("id") ?? "");
  await executar(`/admin/agenda/${id}`, async (u) => {
    const ag = await reagendar({
      id: uuid(fd, "id", "Agendamento"),
      serviceId: uuid(fd, "service_id", "Serviço"),
      data: data(fd, "data"),
      hora: hora(fd, "hora"),
      observacoes: texto(fd, "observacoes", { max: 500 }),
    });
    await registrarAuditoria(u, "agendamento.editar", "appointments", ag.id, { data: ag.data, hora: ag.hora, servico: ag.servico_nome });
    return "Agendamento atualizado.";
  });
}

export async function cancelarAgendamentoAdmin(fd: FormData): Promise<void> {
  const id = String(fd.get("id") ?? "");
  await executar(caminhoSeguro(fd.get("retorno"), `/admin/agenda/${id}`), async (u) => {
    const motivo = texto(fd, "motivo", { max: 500 });
    const ag = await cancelarAgendamento({ id: uuid(fd, "id", "Agendamento"), por: "ADMIN", motivo });
    await registrarAuditoria(u, "agendamento.cancelar", "appointments", ag.id, { motivo: motivo || null });
    return "Agendamento cancelado. O horário voltou a ficar disponível.";
  });
}

export async function mudarStatusAgendamento(fd: FormData): Promise<void> {
  const id = String(fd.get("id") ?? "");
  await executar(caminhoSeguro(fd.get("retorno"), `/admin/agenda/${id}`), async (u) => {
    const status = String(fd.get("status") ?? "") as Status;
    if (!STATUS.includes(status) || status === "CANCELADO") throw new ErroValidacao("Status inválido.");
    const ag = await alterarStatus(uuid(fd, "id", "Agendamento"), status);
    await registrarAuditoria(u, "agendamento.status", "appointments", ag.id, { status });
    return "Status atualizado.";
  });
}

export async function criarBloqueio(fd: FormData): Promise<void> {
  await executar("/admin/agenda/bloqueios", async (u) => {
    const tipo = String(fd.get("tipo") ?? "");
    const motivo = texto(fd, "motivo", { max: 120 });
    const db = await getDb();
    if (tipo === "dia") {
      const inicio = data(fd, "data", "Data inicial");
      const fimBruto = fd.get("data_fim");
      const fim = typeof fimBruto === "string" && fimBruto ? data(fd, "data_fim", "Data final") : inicio;
      if (fim < inicio) throw new ErroValidacao("A data final deve ser igual ou posterior à inicial.");
      const dias = Math.round((Date.parse(fim) - Date.parse(inicio)) / 86_400_000) + 1;
      if (dias > 60) throw new ErroValidacao("Bloqueie no máximo 60 dias por vez.");
      await db.query(
        `INSERT INTO blocked_times (data, motivo)
         SELECT d::date, $3 FROM generate_series($1::date, $2::date, interval '1 day') AS d`,
        [inicio, fim, motivo || null],
      );
      await registrarAuditoria(u, "bloqueio.criar", "blocked_times", null, { tipo, inicio, fim, motivo });
      return dias === 1 ? "Dia bloqueado." : `${dias} dias bloqueados.`;
    }
    const hi = hora(fd, "horario_inicio", "Horário inicial");
    const hf = hora(fd, "horario_fim", "Horário final");
    if (hf <= hi) throw new ErroValidacao("O horário final deve ser posterior ao inicial.");
    if (tipo === "periodo") {
      const dia = data(fd, "data");
      await db.query("INSERT INTO blocked_times (data, horario_inicio, horario_fim, motivo) VALUES ($1,$2,$3,$4)", [dia, hi, hf, motivo || null]);
      await registrarAuditoria(u, "bloqueio.criar", "blocked_times", null, { tipo, dia, hi, hf, motivo });
      return "Horário bloqueado.";
    }
    if (tipo === "recorrente") {
      const dow = inteiro(fd, "dia_semana", "Dia da semana", 0, 6);
      await db.query("INSERT INTO blocked_times (dia_semana, horario_inicio, horario_fim, motivo) VALUES ($1,$2,$3,$4)", [dow, hi, hf, motivo || null]);
      await registrarAuditoria(u, "bloqueio.criar", "blocked_times", null, { tipo, dow, hi, hf, motivo });
      return "Pausa semanal criada.";
    }
    throw new ErroValidacao("Tipo de bloqueio inválido.");
  });
}

export async function removerBloqueio(fd: FormData): Promise<void> {
  await executar("/admin/agenda/bloqueios", async (u) => {
    const id = uuid(fd, "id", "Bloqueio");
    const db = await getDb();
    await db.query("DELETE FROM blocked_times WHERE id = $1", [id]);
    await registrarAuditoria(u, "bloqueio.remover", "blocked_times", id);
    return "Bloqueio removido. O horário voltou a ficar disponível.";
  });
}

// ---------------------------------------------------------------------------
// Configurações de funcionamento
// ---------------------------------------------------------------------------

export async function salvarExpediente(fd: FormData): Promise<void> {
  await executar("/admin/configuracoes#expediente", async (u) => {
    const db = await getDb();
    const linhas: Array<[number, string, string, string | null, string | null, boolean]> = [];
    const nomes = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
    for (let d = 0; d <= 6; d++) {
      const ativo = fd.get(`ativo_${d}`) === "on";
      const inicio = hora(fd, `inicio_${d}`, `Início (${nomes[d]})`);
      const fim = hora(fd, `fim_${d}`, `Fim (${nomes[d]})`);
      const ii = horaOpcional(fd, `intervalo_inicio_${d}`, `Início do intervalo (${nomes[d]})`);
      const ifim = horaOpcional(fd, `intervalo_fim_${d}`, `Fim do intervalo (${nomes[d]})`);
      if (fim <= inicio) throw new ErroValidacao(`${nomes[d]}: o horário final deve ser posterior ao inicial.`);
      if ((ii === null) !== (ifim === null)) throw new ErroValidacao(`${nomes[d]}: informe início e fim do intervalo, ou deixe ambos vazios.`);
      if (ii && ifim && (ifim <= ii || ii < inicio || ifim > fim)) {
        throw new ErroValidacao(`${nomes[d]}: o intervalo deve estar dentro do expediente.`);
      }
      linhas.push([d, inicio, fim, ii, ifim, ativo]);
    }
    for (const l of linhas) {
      await db.query(
        `INSERT INTO business_hours (dia_semana, horario_inicio, horario_fim, intervalo_inicio, intervalo_fim, ativo)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (dia_semana) DO UPDATE SET horario_inicio=EXCLUDED.horario_inicio, horario_fim=EXCLUDED.horario_fim,
           intervalo_inicio=EXCLUDED.intervalo_inicio, intervalo_fim=EXCLUDED.intervalo_fim, ativo=EXCLUDED.ativo`,
        l,
      );
    }
    await registrarAuditoria(u, "expediente.salvar", "business_hours");
    return "Horários de atendimento salvos.";
  });
}

export async function salvarDataEspecial(fd: FormData): Promise<void> {
  await executar("/admin/configuracoes#datas-especiais", async (u) => {
    const dia = data(fd, "data");
    const inicio = hora(fd, "horario_inicio", "Horário inicial");
    const fim = hora(fd, "horario_fim", "Horário final");
    const ii = horaOpcional(fd, "intervalo_inicio", "Início do intervalo");
    const ifim = horaOpcional(fd, "intervalo_fim", "Fim do intervalo");
    const motivo = texto(fd, "motivo", { max: 120 });
    if (fim <= inicio) throw new ErroValidacao("O horário final deve ser posterior ao inicial.");
    if ((ii === null) !== (ifim === null)) throw new ErroValidacao("Informe início e fim do intervalo, ou deixe ambos vazios.");
    if (ii && ifim && (ifim <= ii || ii < inicio || ifim > fim)) throw new ErroValidacao("O intervalo deve estar dentro do expediente.");
    const db = await getDb();
    await db.query(
      `INSERT INTO special_dates (data, horario_inicio, horario_fim, intervalo_inicio, intervalo_fim, motivo)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (data) DO UPDATE SET horario_inicio=EXCLUDED.horario_inicio, horario_fim=EXCLUDED.horario_fim,
         intervalo_inicio=EXCLUDED.intervalo_inicio, intervalo_fim=EXCLUDED.intervalo_fim, motivo=EXCLUDED.motivo`,
      [dia, inicio, fim, ii, ifim, motivo || null],
    );
    await registrarAuditoria(u, "data_especial.salvar", "special_dates", null, { dia, inicio, fim });
    return "Data especial salva.";
  });
}

export async function removerDataEspecial(fd: FormData): Promise<void> {
  await executar("/admin/configuracoes#datas-especiais", async (u) => {
    const id = uuid(fd, "id", "Data especial");
    const db = await getDb();
    await db.query("DELETE FROM special_dates WHERE id = $1", [id]);
    await registrarAuditoria(u, "data_especial.remover", "special_dates", id);
    return "Data especial removida.";
  });
}

export async function salvarRegras(fd: FormData): Promise<void> {
  await executar("/admin/configuracoes#regras", async (u) => {
    const regras = {
      antecedencia_minima_minutos: inteiro(fd, "antecedencia_minima_minutos", "Antecedência mínima para agendar", 0, 10_080),
      cancelamento_antecedencia_minutos: inteiro(fd, "cancelamento_antecedencia_minutos", "Antecedência mínima para cancelar", 0, 10_080),
      janela_agendamento_dias: inteiro(fd, "janela_agendamento_dias", "Janela de agendamento", 1, 180),
      passo_minutos: inteiro(fd, "passo_minutos", "Intervalo entre horários oferecidos", 5, 240),
    };
    await salvarConfiguracoes(regras);
    await registrarAuditoria(u, "regras.salvar", "settings", null, regras);
    return "Regras de agendamento salvas.";
  });
}

export async function salvarSite(fd: FormData): Promise<void> {
  await executar("/admin/configuracoes#site", async (u) => {
    const atual = await lerConfiguracoes();
    const whatsappBruto = texto(fd, "whatsapp_numero", { max: 25 });
    const whatsapp = whatsappBruto ? normalizarTelefone(whatsappBruto) : "";
    if (whatsappBruto && !whatsapp) throw new ErroValidacao("Número de WhatsApp inválido. Use DDD + número.");
    const maps = texto(fd, "maps_url", { max: 500 });
    if (maps && !/^https:\/\//i.test(maps)) throw new ErroValidacao("O link do Google Maps deve começar com https://");

    const fotoPrincipal = await salvarImagem(fd.get("foto_principal"));
    const fotoSobre = await salvarImagem(fd.get("foto_sobre"));
    const removerPrincipal = fd.get("remover_foto_principal") === "on";
    const removerSobre = fd.get("remover_foto_sobre") === "on";

    const novo = {
      nome_profissional: texto(fd, "nome_profissional", { max: 60 }),
      frase: texto(fd, "frase", { max: 200 }),
      sobre_texto: texto(fd, "sobre_texto", { max: 2000 }),
      experiencia: texto(fd, "experiencia", { max: 120 }),
      diferenciais: texto(fd, "diferenciais", { max: 800 })
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 8),
      endereco: texto(fd, "endereco", { max: 300 }),
      maps_url: maps,
      whatsapp_numero: whatsapp ?? "",
      instagram: texto(fd, "instagram", { max: 120 }),
      foto_principal_id: fotoPrincipal ?? (removerPrincipal ? null : atual.foto_principal_id),
      foto_sobre_id: fotoSobre ?? (removerSobre ? null : atual.foto_sobre_id),
    };
    await salvarConfiguracoes(novo);
    if (atual.foto_principal_id && atual.foto_principal_id !== novo.foto_principal_id) await removerImagem(atual.foto_principal_id);
    if (atual.foto_sobre_id && atual.foto_sobre_id !== novo.foto_sobre_id) await removerImagem(atual.foto_sobre_id);
    await registrarAuditoria(u, "site.salvar", "settings");
    return "Informações do site salvas.";
  });
}

// ---------------------------------------------------------------------------
// Galeria
// ---------------------------------------------------------------------------

export async function adicionarFoto(fd: FormData): Promise<void> {
  await executar("/admin/galeria", async (u) => {
    const categoria = texto(fd, "categoria", { max: 40 }) || "Geral";
    const legenda = texto(fd, "legenda", { max: 120 });
    const imageId = await salvarImagem(fd.get("imagem"));
    if (!imageId) throw new ErroValidacao("Selecione uma foto.");
    const db = await getDb();
    const r = await db.query<{ id: string }>(
      `INSERT INTO gallery_photos (image_id, categoria, legenda, ordem)
       VALUES ($1, $2, $3, (SELECT COALESCE(min(ordem), 0) - 1 FROM gallery_photos)) RETURNING id`,
      [imageId, categoria, legenda || null],
    );
    await registrarAuditoria(u, "galeria.adicionar", "gallery_photos", r.rows[0].id, { categoria });
    return "Foto adicionada à galeria.";
  });
}

export async function removerFoto(fd: FormData): Promise<void> {
  await executar("/admin/galeria", async (u) => {
    const id = uuid(fd, "id", "Foto");
    const db = await getDb();
    const r = await db.query<{ image_id: string }>("DELETE FROM gallery_photos WHERE id = $1 RETURNING image_id", [id]);
    await removerImagem(r.rows[0]?.image_id);
    await registrarAuditoria(u, "galeria.remover", "gallery_photos", id);
    return "Foto removida.";
  });
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

export async function salvarCliente(fd: FormData): Promise<void> {
  const id = String(fd.get("id") ?? "");
  await executar(`/admin/clientes/${id}`, async (u) => {
    const cid = uuid(fd, "id", "Cliente");
    const nome = texto(fd, "nome", { max: 80, obrigatorio: "Informe o nome." });
    const observacoes = texto(fd, "observacoes", { max: 1000 });
    const aceita = fd.get("aceita_lembretes") === "on";
    const db = await getDb();
    await db.query("UPDATE customers SET nome = $2, observacoes = $3, aceita_lembretes = $4 WHERE id = $1", [
      cid,
      nome,
      observacoes || null,
      aceita,
    ]);
    await registrarAuditoria(u, "cliente.atualizar", "customers", cid);
    return "Cliente atualizada.";
  });
}

/** LGPD: exclusão/anonimização dos dados pessoais a pedido da titular. */
export async function excluirDadosCliente(fd: FormData): Promise<void> {
  const id = String(fd.get("id") ?? "");
  await executar(`/admin/clientes/${id}`, async (u) => {
    const cid = uuid(fd, "id", "Cliente");
    const db = await getDb();
    const c = await db.query<{ telefone: string }>("SELECT telefone FROM customers WHERE id = $1", [cid]);
    if (!c.rows[0]) throw new ErroValidacao("Cliente não encontrada.");
    const telefone = c.rows[0].telefone;

    const futuros = await db.query<{ id: string }>(
      "SELECT id FROM appointments WHERE customer_id = $1 AND status IN ('PENDENTE','CONFIRMADO') AND inicio > now()",
      [cid],
    );
    for (const a of futuros.rows) {
      await cancelarAgendamento({ id: a.id, por: "ADMIN", motivo: "Exclusão de dados solicitada pela cliente" });
    }
    await db.query("DELETE FROM whatsapp_messages WHERE customer_id = $1 OR telefone = $2", [cid, telefone]);
    await db.query("DELETE FROM conversations WHERE telefone = $1", [telefone]);

    const historico = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM appointments WHERE customer_id = $1", [cid]);
    if (historico.rows[0].n === 0) {
      await db.query("DELETE FROM customers WHERE id = $1", [cid]);
    } else {
      // mantém o histórico financeiro, sem dados que identifiquem a pessoa
      const anonimo = `000${Date.now()}`.slice(0, 15);
      await db.query(
        `UPDATE customers SET nome = 'Cliente removida', telefone = $2, observacoes = NULL,
                aceita_lembretes = false, consentimento_em = NULL WHERE id = $1`,
        [cid, anonimo],
      );
      await db.query("UPDATE appointments SET observacoes = NULL, motivo_cancelamento = NULL WHERE customer_id = $1", [cid]);
    }
    await registrarAuditoria(u, "cliente.excluir_dados", "customers", cid);
    return { msg: "Dados pessoais da cliente removidos.", destino: "/admin/clientes" };
  });
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

export async function reenviarLembrete(fd: FormData): Promise<void> {
  await executar("/admin/whatsapp#lembretes", async (u) => {
    const id = uuid(fd, "id", "Lembrete");
    const ok = await reenfileirarLembrete(id);
    if (!ok) throw new ErroValidacao("Este lembrete não pode ser reenviado (já enviado, ou o atendimento não está mais ativo/futuro).");
    const resumo = await processarLembretes();
    await registrarAuditoria(u, "lembrete.reenviar", "reminders", id, { ...resumo });
    return resumo.enviados > 0 ? "Lembrete reenviado." : "Nova tentativa registrada; verifique o status na lista.";
  });
}

export async function processarLembretesAgora(): Promise<void> {
  await executar("/admin/whatsapp#lembretes", async (u) => {
    const r = await processarLembretes();
    await registrarAuditoria(u, "lembrete.processar", "reminders", null, { ...r });
    return `Fila processada: ${r.enviados} enviado(s), ${r.falhas} falha(s), ${r.expirados} expirado(s).`;
  });
}

export async function enviarMensagemManual(fd: FormData): Promise<void> {
  const tel = String(fd.get("telefone") ?? "").replace(/\D/g, "");
  await executar(`/admin/whatsapp/${tel}`, async (u) => {
    if (!/^[0-9]{8,15}$/.test(tel)) throw new ErroValidacao("Telefone inválido.");
    const mensagem = texto(fd, "mensagem", { max: 2000, obrigatorio: "Escreva a mensagem." });
    if (!(await dentroDaJanela24h(tel))) {
      throw new ErroValidacao(
        "Fora da janela de 24 horas: o WhatsApp só permite mensagens livres até 24h após a última mensagem da cliente.",
      );
    }
    const cliente = await buscarClientePorTelefone(tel);
    const r = await enviarTexto(tel, mensagem, cliente?.id ?? null);
    await registrarAuditoria(u, "whatsapp.enviar", "whatsapp_messages", null, { telefone: tel, ok: r.ok });
    if (!r.ok) throw new ErroValidacao(`Não foi possível enviar: ${r.erro}`);
    return "Mensagem enviada.";
  });
}

/** Devolve a conversa ao atendimento automático. */
export async function encerrarAtendimentoHumano(fd: FormData): Promise<void> {
  const tel = String(fd.get("telefone") ?? "").replace(/\D/g, "");
  await executar(caminhoSeguro(fd.get("retorno"), "/admin/whatsapp"), async (u) => {
    const db = await getDb();
    await db.query("DELETE FROM conversations WHERE telefone = $1 AND estado = 'HUMANO'", [tel]);
    await registrarAuditoria(u, "whatsapp.encerrar_humano", "conversations", tel);
    return "Atendimento automático reativado para esta conversa.";
  });
}
