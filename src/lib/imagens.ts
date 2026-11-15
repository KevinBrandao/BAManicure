import { getDb } from "./db";
import { ehUuid } from "./agenda";
import { conteudoEstatico, modoLanding } from "./conteudo";

export const TAMANHO_MAX_IMAGEM = 4 * 1024 * 1024;

/** Identifica o tipo pelo conteúdo (assinatura do arquivo), não pelo nome/cabeçalho. */
function detectarMime(b: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (
    b.length > 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * Salva uma imagem enviada por formulário. Retorna null se nenhum arquivo foi
 * enviado; lança Error com mensagem amigável se o arquivo for inválido.
 */
export async function salvarImagem(arquivo: FormDataEntryValue | null): Promise<string | null> {
  if (!arquivo || typeof arquivo === "string" || arquivo.size === 0) return null;
  if (arquivo.size > TAMANHO_MAX_IMAGEM) throw new Error("A imagem deve ter no máximo 4 MB.");
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const mime = detectarMime(bytes);
  if (!mime) throw new Error("Formato de imagem não suportado. Use JPG, PNG ou WebP.");
  const db = await getDb();
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO images (mime, dados) VALUES ($1, $2) RETURNING id",
    [mime, db.kind === "pg" ? Buffer.from(bytes) : bytes],
  );
  return rows[0].id;
}

export async function lerImagem(id: string): Promise<{ mime: string; dados: Uint8Array } | null> {
  if (!ehUuid(id)) return null;
  const db = await getDb();
  const { rows } = await db.query<{ mime: string; dados: Uint8Array }>("SELECT mime, dados FROM images WHERE id = $1", [id]);
  if (!rows[0]) return null;
  return { mime: rows[0].mime, dados: new Uint8Array(rows[0].dados) };
}

export async function removerImagem(id: string | null | undefined): Promise<void> {
  if (!id || !ehUuid(id)) return;
  const db = await getDb();
  await db.query("DELETE FROM images WHERE id = $1", [id]);
}

export function urlImagem(id: string | null | undefined): string | null {
  if (id && modoLanding()) return conteudoEstatico.imagens[id] ?? null;
  return id ? `/api/imagens/${id}` : null;
}
