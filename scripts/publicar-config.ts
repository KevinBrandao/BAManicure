/**
 * Copia para o banco de produção (DATABASE_URL) as CONFIGURAÇÕES reais feitas
 * no banco local de desenvolvimento: informações do site, logo e fotos,
 * serviços, expediente, datas especiais e galeria.
 *
 * NÃO copia clientes, agendamentos, conversas, bloqueios nem usuárias — o
 * banco local contém dados de teste e eles não devem ir para produção.
 *
 * É seguro executar mais de uma vez: registros já existentes no destino não
 * são sobrescritos (exceto as configurações do site, que são atualizadas).
 *
 * Uso (com o servidor de desenvolvimento parado):  npm run db:publicar-config
 */
import fs from "node:fs";
import path from "node:path";
import { carregarEnv } from "./_env";
carregarEnv();

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("Defina DATABASE_URL no .env.local (connection string do Supabase) antes de executar.");
    process.exit(1);
  }
  const dirLocal = path.join(process.cwd(), ".data", "pglite");
  if (!fs.existsSync(dirLocal)) {
    console.error("Banco local não encontrado em .data/pglite — nada a publicar.");
    process.exit(1);
  }

  const { createPgliteDb, getDb, runMigrations } = await import("../src/lib/db");
  const origem = await createPgliteDb(dirLocal);
  const destino = await getDb();
  await runMigrations(destino);

  const resumo: Record<string, number> = {};

  // 1) Imagens referenciadas por configurações, serviços e galeria
  const imagens = await origem.query<{ id: string; mime: string; dados: Uint8Array }>(
    `SELECT id, mime, dados FROM images
      WHERE id IN (SELECT image_id FROM services WHERE image_id IS NOT NULL)
         OR id IN (SELECT image_id FROM gallery_photos)
         OR id::text IN (SELECT valor #>> '{}' FROM settings WHERE chave IN ('logo_id','foto_principal_id','foto_sobre_id'))`,
  );
  resumo.imagens = 0;
  for (const img of imagens.rows) {
    const r = await destino.query("INSERT INTO images (id, mime, dados) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING", [
      img.id,
      img.mime,
      Buffer.from(img.dados),
    ]);
    resumo.imagens += r.rowCount;
  }

  // 2) Serviços
  const servicos = await origem.query<Record<string, unknown>>(
    "SELECT id, nome, descricao, preco_centavos, duracao_minutos, intervalo_minutos, ativo, image_id, ordem FROM services",
  );
  resumo.servicos = 0;
  for (const s of servicos.rows) {
    const r = await destino.query(
      `INSERT INTO services (id, nome, descricao, preco_centavos, duracao_minutos, intervalo_minutos, ativo, image_id, ordem)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
      [s.id, s.nome, s.descricao, s.preco_centavos, s.duracao_minutos, s.intervalo_minutos, s.ativo, s.image_id, s.ordem],
    );
    resumo.servicos += r.rowCount;
  }

  // 3) Expediente semanal
  const expediente = await origem.query<Record<string, unknown>>(
    `SELECT dia_semana, horario_inicio::text AS hi, horario_fim::text AS hf,
            intervalo_inicio::text AS ii, intervalo_fim::text AS ifim, ativo FROM business_hours`,
  );
  for (const e of expediente.rows) {
    await destino.query(
      `INSERT INTO business_hours (dia_semana, horario_inicio, horario_fim, intervalo_inicio, intervalo_fim, ativo)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (dia_semana) DO UPDATE SET horario_inicio=EXCLUDED.horario_inicio, horario_fim=EXCLUDED.horario_fim,
         intervalo_inicio=EXCLUDED.intervalo_inicio, intervalo_fim=EXCLUDED.intervalo_fim, ativo=EXCLUDED.ativo`,
      [e.dia_semana, e.hi, e.hf, e.ii, e.ifim, e.ativo],
    );
  }
  resumo.expediente = expediente.rows.length;

  // 4) Datas especiais futuras
  const especiais = await origem.query<Record<string, unknown>>(
    `SELECT to_char(data,'YYYY-MM-DD') AS data, horario_inicio::text AS hi, horario_fim::text AS hf,
            intervalo_inicio::text AS ii, intervalo_fim::text AS ifim, motivo
       FROM special_dates WHERE data >= current_date`,
  );
  resumo.datas_especiais = 0;
  for (const e of especiais.rows) {
    const r = await destino.query(
      `INSERT INTO special_dates (data, horario_inicio, horario_fim, intervalo_inicio, intervalo_fim, motivo)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (data) DO NOTHING`,
      [e.data, e.hi, e.hf, e.ii, e.ifim, e.motivo],
    );
    resumo.datas_especiais += r.rowCount;
  }

  // 5) Galeria
  const galeria = await origem.query<Record<string, unknown>>("SELECT id, image_id, categoria, legenda, ordem FROM gallery_photos");
  resumo.galeria = 0;
  for (const g of galeria.rows) {
    const r = await destino.query(
      "INSERT INTO gallery_photos (id, image_id, categoria, legenda, ordem) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING",
      [g.id, g.image_id, g.categoria, g.legenda, g.ordem],
    );
    resumo.galeria += r.rowCount;
  }

  // 6) Configurações do site e regras
  const settings = await origem.query<{ chave: string; valor: unknown }>("SELECT chave, valor FROM settings");
  for (const st of settings.rows) {
    await destino.query(
      `INSERT INTO settings (chave, valor, updated_at) VALUES ($1, $2::jsonb, now())
       ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now()`,
      [st.chave, JSON.stringify(st.valor)],
    );
  }
  resumo.configuracoes = settings.rows.length;

  console.log("Configurações publicadas no banco de produção:");
  console.table(resumo);
  console.log("Clientes, agendamentos, conversas e bloqueios locais (dados de teste) NÃO foram copiados.");

  await origem.close();
  await destino.close();
}

main().catch((err) => {
  console.error("Falha ao publicar configurações:", err instanceof Error ? err.message : err);
  process.exit(1);
});
