import { createPgliteDb, runMigrations, setDbForTests, type Db } from "@/lib/db";
import { definirTransporteParaTestes, type ResultadoEnvio, type Transporte } from "@/lib/whatsapp/client";
import { paraInstante } from "@/lib/tz";

/** Banco PostgreSQL (PGlite) em memória, com o schema real das migrações. */
export async function criarBancoDeTeste(): Promise<Db> {
  const db = await createPgliteDb();
  await runMigrations(db);
  setDbForTests(db);
  return db;
}

export interface MensagemCapturada {
  para: string;
  tipo: "texto" | "template";
  texto?: string;
  template?: string;
  parametros?: string[];
}

/**
 * Dublê do transporte do WhatsApp usado SOMENTE nos testes automatizados:
 * captura o que seria enviado à API da Meta, sem acessar a rede.
 */
export class TransporteDeTeste implements Transporte {
  enviadas: MensagemCapturada[] = [];
  falhar: string | null = null;
  private seq = 0;

  private resultado(): ResultadoEnvio {
    if (this.falhar) return { ok: false, erro: this.falhar };
    return { ok: true, id: `wamid.TESTE${++this.seq}` };
  }
  async enviarTexto(para: string, texto: string) {
    const r = this.resultado();
    if (r.ok) this.enviadas.push({ para, tipo: "texto", texto });
    return r;
  }
  async enviarTemplate(para: string, nome: string, _idioma: string, parametros: string[]) {
    const r = this.resultado();
    if (r.ok) this.enviadas.push({ para, tipo: "template", template: nome, parametros });
    return r;
  }
  ultima(): string {
    return this.enviadas[this.enviadas.length - 1]?.texto ?? "";
  }
  limpar() {
    this.enviadas = [];
  }
}

export function instalarTransporte(): TransporteDeTeste {
  const t = new TransporteDeTeste();
  definirTransporteParaTestes(t);
  return t;
}

export async function criarServico(
  db: Db,
  dados: Partial<{ nome: string; preco: number; duracao: number; intervalo: number; ativo: boolean; ordem: number }> = {},
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO services (nome, descricao, preco_centavos, duracao_minutos, intervalo_minutos, ativo, ordem)
     VALUES ($1, '', $2, $3, $4, $5, $6) RETURNING id`,
    [
      dados.nome ?? "Manicure tradicional",
      dados.preco ?? 3500,
      dados.duracao ?? 60,
      dados.intervalo ?? 0,
      dados.ativo ?? true,
      dados.ordem ?? 0,
    ],
  );
  return rows[0].id;
}

/** Instante a partir de data/hora de São Paulo. */
export function sp(data: string, hora: string): Date {
  return paraInstante(data, hora);
}

/** Segunda-feira usada como referência nos testes (expediente 09–18, almoço 12–13). */
export const SEGUNDA = "2026-11-16";
export const TERCA = "2026-11-17";
export const DOMINGO = "2026-11-22";
