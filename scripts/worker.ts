/**
 * Worker de lembretes para ambientes com processo persistente (VPS, PC local).
 * A cada minuto chama o endpoint /api/cron/lembretes do próprio site.
 * Em hospedagem serverless use um agendador externo (veja docs/INSTALACAO.md).
 * Uso: npm run worker
 */
import { carregarEnv } from "./_env";
carregarEnv();

const base = (process.env.WORKER_TARGET_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
const segredo = process.env.CRON_SECRET?.trim();

if (!segredo) {
  console.error("Defina CRON_SECRET no .env.local.");
  process.exit(1);
}

async function tick() {
  const inicio = new Date().toISOString();
  try {
    const res = await fetch(`${base}/api/cron/lembretes`, {
      method: "POST",
      headers: { Authorization: `Bearer ${segredo}` },
      signal: AbortSignal.timeout(55_000),
    });
    const corpo = await res.text();
    console.log(`[${inicio}] ${res.status} ${corpo}`);
  } catch (err) {
    console.error(`[${inicio}] falha ao chamar o endpoint:`, (err as Error).message);
  }
}

console.log(`Worker de lembretes iniciado → ${base}/api/cron/lembretes (a cada 60s)`);
void tick();
setInterval(tick, 60_000);
