/**
 * Senhas e cadastro de administradoras (sem dependências do Next, para uso
 * também pelos scripts de linha de comando).
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { getDb } from "./db";

const scrypt = promisify(scryptCb) as (senha: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export async function hashSenha(senha: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(senha, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verificarSenha(senha: string, armazenado: string): Promise<boolean> {
  const [algoritmo, saltHex, hashHex] = armazenado.split("$");
  if (algoritmo !== "scrypt" || !saltHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, "hex");
  const calculado = await scrypt(senha, Buffer.from(saltHex, "hex"), esperado.length);
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

export async function existeAdministradora(): Promise<boolean> {
  const db = await getDb();
  const { rows } = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM users");
  return rows[0].n > 0;
}

export async function criarAdministradora(nome: string, emailBruto: string, senha: string): Promise<void> {
  const email = emailBruto.trim().toLowerCase();
  if (!nome.trim()) throw new Error("Informe o nome.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("E-mail inválido.");
  if (senha.length < 10) throw new Error("A senha deve ter pelo menos 10 caracteres.");
  const db = await getDb();
  await db.query(
    `INSERT INTO users (nome, email, senha_hash, role) VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (email) DO UPDATE SET nome = EXCLUDED.nome, senha_hash = EXCLUDED.senha_hash`,
    [nome.trim(), email, await hashSenha(senha)],
  );
}
