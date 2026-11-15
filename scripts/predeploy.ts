/**
 * Executado automaticamente antes do build (`npm run build`).
 *
 * - Com DATABASE_URL definida: aplica as migrações pendentes no PostgreSQL,
 *   de modo que cada deploy já sobe com o schema atualizado.
 * - Sem DATABASE_URL: não faz nada. Em produção o site sobe em "modo landing"
 *   (conteúdo de src/conteudo/site.json; painel e WhatsApp desligados).
 */
import { carregarEnv } from "./_env";
carregarEnv();

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  const naVercel = Boolean(process.env.VERCEL);

  if (!url) {
    console.log(
      naVercel
        ? "predeploy: DATABASE_URL não definida — publicando em MODO LANDING (só o site; painel, WhatsApp e lembretes desligados)."
        : "predeploy: DATABASE_URL vazia — nada a migrar.",
    );
    return;
  }

  const { getDb, runMigrations } = await import("../src/lib/db");
  const db = await getDb();
  try {
    const aplicadas = await runMigrations(db);
    console.log(
      aplicadas.length > 0
        ? `predeploy: migrações aplicadas: ${aplicadas.join(", ")}`
        : "predeploy: banco já está atualizado.",
    );
    const admins = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM users");
    if (admins.rows[0].n === 0) {
      console.warn("predeploy: aviso — ainda não há administradora cadastrada (execute `npm run admin:create`).");
    }
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  // a mensagem do driver não inclui a senha; a URL nunca é impressa
  console.error("✖ predeploy: não foi possível conectar/migrar o banco:", err instanceof Error ? err.message : err);
  process.exit(1);
});
