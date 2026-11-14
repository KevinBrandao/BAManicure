/**
 * Camada de acesso ao banco.
 *
 * - Produção: PostgreSQL via `pg` (DATABASE_URL — Supabase, Neon etc.).
 * - Desenvolvimento/testes: PGlite (PostgreSQL real compilado para WASM),
 *   sem necessidade de instalar um servidor de banco.
 *
 * Ambos expõem a mesma interface mínima (`query` + `transaction`), e todo o
 * SQL usa parâmetros posicionais ($1, $2...) — nunca concatenação de strings.
 */
import fs from "node:fs";
import path from "node:path";

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
}

export interface Db extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  /** Executa vários comandos SQL sem parâmetros (migrações). */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  readonly kind: "pg" | "pglite";
}

const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

// ---------------------------------------------------------------------------
// Adaptadores
// ---------------------------------------------------------------------------

async function createPgDb(connectionString: string): Promise<Db> {
  const { Pool } = await import("pg");
  const ssl = process.env.DATABASE_SSL === "false" ? undefined : { rejectUnauthorized: false };
  const pool = new Pool({ connectionString, ssl, max: 5, idleTimeoutMillis: 10_000 });

  const wrap = (runner: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }> }): Queryable => ({
    async query<T>(sql: string, params?: unknown[]) {
      const res = await runner.query(sql, params);
      return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 };
    },
  });

  return {
    kind: "pg",
    ...wrap(pool as never),
    async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(wrap(client as never));
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
    async close() {
      await pool.end();
    },
  };
}

export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dataDir) fs.mkdirSync(dataDir, { recursive: true });
  const pg = await PGlite.create(dataDir);
  await pg.exec("SET TIME ZONE 'UTC'");

  const wrap = (runner: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; affectedRows?: number }> }): Queryable => ({
    async query<T>(sql: string, params?: unknown[]) {
      const res = await runner.query(sql, params);
      return { rows: res.rows as T[], rowCount: res.affectedRows ?? res.rows.length };
    },
  });

  return {
    kind: "pglite",
    ...wrap(pg as never),
    transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      return pg.transaction((tx) => fn(wrap(tx as never))) as Promise<T>;
    },
    async exec(sql: string) {
      await pg.exec(sql);
    },
    async close() {
      await pg.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Migrações
// ---------------------------------------------------------------------------

export async function runMigrations(db: Db): Promise<string[]> {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       nome text PRIMARY KEY,
       aplicada_em timestamptz NOT NULL DEFAULT now()
     )`,
  );
  const done = new Set(
    (await db.query<{ nome: string }>("SELECT nome FROM schema_migrations")).rows.map((r) => r.nome),
  );
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    await db.exec(`BEGIN;\n${sql}\n;COMMIT;`);
    await db.query("INSERT INTO schema_migrations (nome) VALUES ($1)", [file]);
    applied.push(file);
  }
  return applied;
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

const globalRef = globalThis as unknown as { __appDb?: Promise<Db> };

async function initDb(): Promise<Db> {
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    // Em produção as migrações são aplicadas com `npm run db:migrate`.
    return createPgDb(url);
  }
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PGLITE_IN_PRODUCTION !== "true") {
    throw new Error(
      "DATABASE_URL não configurada. Em produção é obrigatório um PostgreSQL (ex.: Supabase).",
    );
  }
  const db = await createPgliteDb(path.join(process.cwd(), ".data", "pglite"));
  await runMigrations(db);
  return db;
}

export function getDb(): Promise<Db> {
  if (!globalRef.__appDb) {
    globalRef.__appDb = initDb().catch((err) => {
      globalRef.__appDb = undefined;
      throw err;
    });
  }
  return globalRef.__appDb;
}

/** Uso exclusivo dos testes: instala um banco em memória. */
export function setDbForTests(db: Db | undefined): void {
  globalRef.__appDb = db ? Promise.resolve(db) : undefined;
}

export async function query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
  return (await getDb()).query<T>(sql, params);
}

export async function transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
  return (await getDb()).transaction(fn);
}

/** Código de erro do PostgreSQL (ex.: 23P01 = violação de exclusion constraint). */
export function pgErrorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}
