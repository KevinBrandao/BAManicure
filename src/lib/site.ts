import { getDb } from "./db";
import { listarServicos, type Servico } from "./agenda";
import { lerConfiguracoes, type Configuracoes } from "./settings";
import { hhmm } from "./tz";
import { conteudoEstatico, modoLanding } from "./conteudo";

export interface FotoGaleria {
  id: string;
  image_id: string;
  categoria: string;
  legenda: string | null;
}

export interface HorarioDia {
  dia_semana: number;
  inicio: string;
  fim: string;
  intervalo_inicio: string | null;
  intervalo_fim: string | null;
  ativo: boolean;
}

export async function listarExpediente(): Promise<HorarioDia[]> {
  const db = await getDb();
  const { rows } = await db.query<{
    dia_semana: number;
    horario_inicio: string;
    horario_fim: string;
    intervalo_inicio: string | null;
    intervalo_fim: string | null;
    ativo: boolean;
  }>(
    `SELECT dia_semana, horario_inicio::text, horario_fim::text, intervalo_inicio::text, intervalo_fim::text, ativo
       FROM business_hours ORDER BY dia_semana`,
  );
  return rows.map((r) => ({
    dia_semana: Number(r.dia_semana),
    inicio: hhmm(r.horario_inicio)!,
    fim: hhmm(r.horario_fim)!,
    intervalo_inicio: hhmm(r.intervalo_inicio),
    intervalo_fim: hhmm(r.intervalo_fim),
    ativo: r.ativo,
  }));
}

export async function listarGaleria(): Promise<FotoGaleria[]> {
  const db = await getDb();
  const { rows } = await db.query<FotoGaleria>(
    "SELECT id, image_id, categoria, legenda FROM gallery_photos ORDER BY ordem, created_at DESC",
  );
  return rows;
}

export interface DadosSite {
  cfg: Configuracoes;
  servicos: Servico[];
  galeria: FotoGaleria[];
  expediente: HorarioDia[];
}

export async function lerDadosSite(): Promise<DadosSite> {
  const cfg = await lerConfiguracoes();
  if (modoLanding()) {
    return {
      cfg,
      servicos: conteudoEstatico.servicos,
      galeria: conteudoEstatico.galeria,
      expediente: conteudoEstatico.expediente,
    };
  }
  const servicos = await listarServicos({ apenasAtivos: true });
  const galeria = await listarGaleria();
  const expediente = await listarExpediente();
  return { cfg, servicos, galeria, expediente };
}
