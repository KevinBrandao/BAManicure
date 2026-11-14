/**
 * Aplica as migrações pendentes de db/migrations.
 * Uso: npm run db:migrate
 */
import { carregarEnv } from "./_env";
carregarEnv();

async function main() {
  const { getDb, runMigrations } = await import("../src/lib/db");
  const db = await getDb();
  const aplicadas = await runMigrations(db);
  console.log(
    aplicadas.length > 0
      ? `Migrações aplicadas (${db.kind}): ${aplicadas.join(", ")}`
      : `Banco já está atualizado (${db.kind}).`,
  );
  await db.close();
}

main().catch((err) => {
  console.error("Falha ao migrar:", err);
  process.exit(1);
});
