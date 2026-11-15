import { lerImagem } from "@/lib/imagens";
import { modoLanding } from "@/lib/conteudo";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (modoLanding()) return new Response("Imagem não encontrada", { status: 404 });
  const { id } = await ctx.params;
  const img = await lerImagem(id);
  if (!img) return new Response("Imagem não encontrada", { status: 404 });
  return new Response(Buffer.from(img.dados), {
    headers: {
      "Content-Type": img.mime,
      // o id muda a cada upload, então o conteúdo de uma URL nunca muda
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
