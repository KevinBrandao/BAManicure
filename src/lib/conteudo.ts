/**
 * "Modo landing": site publicado SEM banco de dados.
 *
 * Em produção, quando DATABASE_URL não está definida, a landing page é
 * servida a partir do conteúdo estático exportado por `npm run site:exportar`
 * (src/conteudo/site.json + public/conteudo/). Nesse modo o painel
 * administrativo, o WhatsApp e os lembretes ficam desligados.
 *
 * Para ativar o sistema completo, basta definir DATABASE_URL (veja
 * docs/DEPLOY-VERCEL.md) — nenhuma alteração de código é necessária.
 */
import snapshot from "../conteudo/site.json";

export interface ConteudoEstatico {
  geradoEm: string;
  cfg: Record<string, unknown>;
  servicos: Array<{
    id: string;
    nome: string;
    descricao: string;
    preco_centavos: number;
    duracao_minutos: number;
    intervalo_minutos: number;
    ativo: boolean;
    image_id: string | null;
    ordem: number;
  }>;
  galeria: Array<{ id: string; image_id: string; categoria: string; legenda: string | null }>;
  expediente: Array<{
    dia_semana: number;
    inicio: string;
    fim: string;
    intervalo_inicio: string | null;
    intervalo_fim: string | null;
    ativo: boolean;
  }>;
  imagens: Record<string, string>;
}

export const conteudoEstatico = snapshot as unknown as ConteudoEstatico;

export function modoLanding(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    !process.env.DATABASE_URL?.trim() &&
    process.env.ALLOW_PGLITE_IN_PRODUCTION !== "true"
  );
}
