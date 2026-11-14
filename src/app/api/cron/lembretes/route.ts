/**
 * Despacho dos lembretes. Deve ser chamado a cada minuto por um agendador
 * externo (Supabase pg_cron, cron-job.org, crontab, `npm run worker`...),
 * com o cabeçalho  Authorization: Bearer <CRON_SECRET>.
 */
import { timingSafeEqual } from "node:crypto";
import { processarLembretes } from "@/lib/lembretes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function autorizado(req: Request): boolean | null {
  const segredo = process.env.CRON_SECRET?.trim();
  if (!segredo) return null;
  const recebido = Buffer.from(req.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

async function executar(req: Request) {
  const ok = autorizado(req);
  if (ok === null) return Response.json({ erro: "CRON_SECRET não configurado" }, { status: 503 });
  if (!ok) return Response.json({ erro: "Não autorizado" }, { status: 401 });
  try {
    const resumo = await processarLembretes();
    return Response.json({ ok: true, ...resumo });
  } catch (err) {
    console.error("[cron] erro ao processar lembretes:", err);
    return Response.json({ ok: false, erro: "Falha ao processar lembretes" }, { status: 500 });
  }
}

export const GET = executar;
export const POST = executar;
