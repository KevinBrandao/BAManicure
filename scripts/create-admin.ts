/**
 * Cria (ou redefine a senha de) a administradora do painel.
 * Lê ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD do ambiente (.env.local).
 * Uso: npm run admin:create
 */
import { carregarEnv } from "./_env";
carregarEnv();

async function main() {
  const nome = process.env.ADMIN_NAME?.trim() || "Administradora";
  const email = process.env.ADMIN_EMAIL?.trim();
  const senha = process.env.ADMIN_PASSWORD;
  if (!email || !senha) {
    console.error("Defina ADMIN_EMAIL e ADMIN_PASSWORD no .env.local antes de executar.");
    process.exit(1);
  }
  const { getDb, runMigrations } = await import("../src/lib/db");
  const { criarAdministradora } = await import("../src/lib/usuarios");
  const db = await getDb();
  await runMigrations(db);
  await criarAdministradora(nome, email, senha);
  console.log(`Administradora pronta: ${email}`);
  console.log("Por segurança, remova ADMIN_PASSWORD do .env.local depois de anotar a senha em local seguro.");
  await db.close();
}

main().catch((err) => {
  console.error("Falha ao criar administradora:", err instanceof Error ? err.message : err);
  process.exit(1);
});
