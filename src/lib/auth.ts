/**
 * Autenticação do painel administrativo.
 * - Senhas com scrypt (salt aleatório por usuária).
 * - Sessão em cookie httpOnly; o banco guarda apenas o hash do token.
 * - Bloqueio temporário após tentativas de login malsucedidas.
 */
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDb } from "./db";
import { modoLanding } from "./conteudo";
import { verificarSenha } from "./usuarios";

export { criarAdministradora, existeAdministradora, hashSenha, verificarSenha } from "./usuarios";

export const COOKIE_SESSAO = "sessao_admin";
const DURACAO_SESSAO_DIAS = 7;
const MAX_FALHAS = 5;
const JANELA_FALHAS_MIN = 15;

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  role: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type ResultadoLogin = { ok: true } | { ok: false; erro: string };

export async function entrar(emailBruto: string, senha: string): Promise<ResultadoLogin> {
  if (modoLanding()) return { ok: false, erro: "Painel indisponível nesta publicação." };
  const db = await getDb();
  const email = emailBruto.trim().toLowerCase();
  if (!email || !senha) return { ok: false, erro: "Informe e-mail e senha." };

  const falhas = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM login_attempts
      WHERE email = $1 AND NOT sucesso AND created_at > now() - ($2 || ' minutes')::interval`,
    [email, String(JANELA_FALHAS_MIN)],
  );
  if (falhas.rows[0].n >= MAX_FALHAS) {
    return { ok: false, erro: `Muitas tentativas. Aguarde ${JANELA_FALHAS_MIN} minutos e tente novamente.` };
  }

  const { rows } = await db.query<Usuario & { senha_hash: string }>(
    "SELECT id, nome, email, role, senha_hash FROM users WHERE email = $1",
    [email],
  );
  const usuario = rows[0];
  // compara mesmo sem usuária, para não revelar se o e-mail existe pelo tempo de resposta
  const senhaOk = usuario
    ? await verificarSenha(senha, usuario.senha_hash)
    : (await verificarSenha(senha, `scrypt$${"00".repeat(16)}$${"00".repeat(64)}`), false);

  await db.query("INSERT INTO login_attempts (email, sucesso) VALUES ($1, $2)", [email, senhaOk]);
  if (!usuario || !senhaOk) return { ok: false, erro: "E-mail ou senha incorretos." };

  const token = randomBytes(32).toString("base64url");
  const expira = new Date(Date.now() + DURACAO_SESSAO_DIAS * 24 * 60 * 60 * 1000);
  await db.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [
    hashToken(token),
    usuario.id,
    expira,
  ]);
  await db.query("DELETE FROM sessions WHERE expires_at < now()");
  await db.query("DELETE FROM login_attempts WHERE created_at < now() - interval '30 days'");

  const jar = await cookies();
  jar.set(COOKIE_SESSAO, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expira,
  });
  return { ok: true };
}

export async function sair(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESSAO)?.value;
  if (token) {
    const db = await getDb();
    await db.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
  }
  jar.delete(COOKIE_SESSAO);
}

/** Usuária da sessão atual (ou null). Memorizado por requisição. */
export const usuarioAtual = cache(async (): Promise<Usuario | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESSAO)?.value;
  if (!token) return null;
  const db = await getDb();
  const { rows } = await db.query<Usuario>(
    `SELECT u.id, u.nome, u.email, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  return rows[0] ?? null;
});

/** Protege páginas e ações do painel: sem sessão válida, vai para o login. */
export async function exigirAdmin(): Promise<Usuario> {
  if (modoLanding()) notFound(); // site publicado sem banco: não há painel
  const usuario = await usuarioAtual();
  if (!usuario || usuario.role !== "admin") redirect("/admin/login");
  return usuario;
}

export async function registrarAuditoria(
  usuario: Usuario | null,
  acao: string,
  entidade?: string,
  entidadeId?: string | null,
  detalhes?: Record<string, unknown>,
): Promise<void> {
  const db = await getDb();
  await db.query(
    "INSERT INTO audit_log (user_id, acao, entidade, entidade_id, detalhes) VALUES ($1, $2, $3, $4, $5::jsonb)",
    [usuario?.id ?? null, acao, entidade ?? null, entidadeId ?? null, detalhes ? JSON.stringify(detalhes) : null],
  );
}
