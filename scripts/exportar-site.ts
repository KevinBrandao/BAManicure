/**
 * Exporta o CONTEÚDO PÚBLICO do site (informações, serviços, galeria,
 * horários e imagens) do banco local para arquivos do projeto:
 *
 *   src/conteudo/site.json      textos, serviços, preços e horários
 *   public/conteudo/<id>.<ext>  logo e fotos
 *
 * Esses arquivos alimentam a landing page quando o site é publicado SEM banco
 * de dados ("modo landing"). Nenhum dado de cliente ou agendamento é exportado.
 *
 * Uso (com o servidor de desenvolvimento parado):  npm run site:exportar
 */
import fs from "node:fs";
import path from "node:path";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

async function main() {
  const dirLocal = path.join(process.cwd(), ".data", "pglite");
  if (!fs.existsSync(dirLocal)) {
    console.error("Banco local não encontrado em .data/pglite — nada a exportar.");
    process.exit(1);
  }
  const { createPgliteDb } = await import("../src/lib/db");
  const db = await createPgliteDb(dirLocal);

  const settings = await db.query<{ chave: string; valor: unknown }>("SELECT chave, valor FROM settings");
  const cfg = Object.fromEntries(settings.rows.map((r) => [r.chave, r.valor]));

  const servicos = await db.query(
    `SELECT id, nome, descricao, preco_centavos, duracao_minutos, intervalo_minutos, ativo, image_id, ordem
       FROM services WHERE ativo ORDER BY ordem, nome`,
  );
  const galeria = await db.query("SELECT id, image_id, categoria, legenda FROM gallery_photos ORDER BY ordem, created_at DESC");
  const expediente = await db.query<Record<string, unknown>>(
    `SELECT dia_semana, to_char(horario_inicio, 'HH24:MI') AS inicio, to_char(horario_fim, 'HH24:MI') AS fim,
            to_char(intervalo_inicio, 'HH24:MI') AS intervalo_inicio, to_char(intervalo_fim, 'HH24:MI') AS intervalo_fim, ativo
       FROM business_hours ORDER BY dia_semana`,
  );

  // imagens usadas pelo site
  const ids = new Set<string>();
  for (const k of ["logo_id", "foto_principal_id", "foto_sobre_id"]) if (typeof cfg[k] === "string") ids.add(cfg[k] as string);
  for (const s of servicos.rows as Array<{ image_id: string | null }>) if (s.image_id) ids.add(s.image_id);
  for (const g of galeria.rows as Array<{ image_id: string }>) ids.add(g.image_id);

  const dirImagens = path.join(process.cwd(), "public", "conteudo");
  fs.rmSync(dirImagens, { recursive: true, force: true });
  fs.mkdirSync(dirImagens, { recursive: true });
  const imagens: Record<string, string> = {};
  for (const id of ids) {
    const r = await db.query<{ mime: string; dados: Uint8Array }>("SELECT mime, dados FROM images WHERE id = $1", [id]);
    if (!r.rows[0]) continue;
    const arquivo = `${id}.${EXT[r.rows[0].mime] ?? "jpg"}`;
    fs.writeFileSync(path.join(dirImagens, arquivo), Buffer.from(r.rows[0].dados));
    imagens[id] = `/conteudo/${arquivo}`;
  }

  const conteudo = {
    geradoEm: new Date().toISOString(),
    cfg,
    servicos: servicos.rows,
    galeria: galeria.rows,
    expediente: expediente.rows.map((e) => ({ ...e, dia_semana: Number(e.dia_semana) })),
    imagens,
  };
  const destino = path.join(process.cwd(), "src", "conteudo", "site.json");
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, JSON.stringify(conteudo, null, 2) + "\n");

  console.log(`Conteúdo exportado: ${servicos.rows.length} serviços, ${galeria.rows.length} fotos de galeria, ${Object.keys(imagens).length} imagens.`);
  console.log("Arquivos: src/conteudo/site.json e public/conteudo/");
  await db.close();
}

main().catch((err) => {
  console.error("Falha ao exportar:", err instanceof Error ? err.message : err);
  process.exit(1);
});
