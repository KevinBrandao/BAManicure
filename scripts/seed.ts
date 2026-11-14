/**
 * Cadastra serviços de EXEMPLO para facilitar o primeiro uso.
 * Nomes, preços e durações são apenas ilustrativos — ajuste tudo no painel
 * (Serviços). Não faz nada se já existir algum serviço cadastrado.
 * Uso: npm run db:seed
 */
import { carregarEnv } from "./_env";
carregarEnv();

const EXEMPLOS = [
  { nome: "Manicure tradicional", descricao: "Cutilagem, lixamento e esmaltação.", preco: 3500, duracao: 45, intervalo: 0 },
  { nome: "Pedicure", descricao: "Cuidado completo dos pés com esmaltação.", preco: 4000, duracao: 60, intervalo: 0 },
  { nome: "Manicure e pedicure", descricao: "Mãos e pés no mesmo atendimento.", preco: 7000, duracao: 105, intervalo: 15 },
  { nome: "Alongamento de unhas", descricao: "Alongamento com acabamento natural.", preco: 15000, duracao: 150, intervalo: 15 },
  { nome: "Manutenção de alongamento", descricao: "Manutenção e reposição do alongamento.", preco: 10000, duracao: 120, intervalo: 15 },
];

async function main() {
  const { getDb, runMigrations } = await import("../src/lib/db");
  const db = await getDb();
  await runMigrations(db);
  const { rows } = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM services");
  if (rows[0].n > 0) {
    console.log("Já existem serviços cadastrados; nada foi alterado.");
  } else {
    let ordem = 1;
    for (const s of EXEMPLOS) {
      await db.query(
        `INSERT INTO services (nome, descricao, preco_centavos, duracao_minutos, intervalo_minutos, ordem)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [s.nome, s.descricao, s.preco, s.duracao, s.intervalo, ordem++],
      );
    }
    console.log(`${EXEMPLOS.length} serviços de exemplo cadastrados. Revise preços e durações no painel.`);
  }
  await db.close();
}

main().catch((err) => {
  console.error("Falha no seed:", err);
  process.exit(1);
});
