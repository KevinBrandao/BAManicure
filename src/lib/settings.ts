import { getDb, type Queryable } from "./db";

export interface Configuracoes {
  // Site
  nome_profissional: string;
  frase: string;
  sobre_texto: string;
  experiencia: string;
  diferenciais: string[];
  endereco: string;
  maps_url: string;
  /** Número do WhatsApp de atendimento, só dígitos com DDI (ex.: 5511999998888) */
  whatsapp_numero: string;
  instagram: string;
  foto_principal_id: string | null;
  foto_sobre_id: string | null;
  // Regras de agendamento
  antecedencia_minima_minutos: number;
  cancelamento_antecedencia_minutos: number;
  janela_agendamento_dias: number;
  passo_minutos: number;
}

export const CONFIG_PADRAO: Configuracoes = {
  nome_profissional: "",
  frase: "Unhas impecáveis, feitas com cuidado e carinho em cada detalhe.",
  sobre_texto: "",
  experiencia: "",
  diferenciais: [
    "Atendimento com hora marcada",
    "Materiais esterilizados",
    "Ambiente tranquilo e acolhedor",
  ],
  endereco: "",
  maps_url: "",
  whatsapp_numero: "",
  instagram: "",
  foto_principal_id: null,
  foto_sobre_id: null,
  antecedencia_minima_minutos: 120,
  cancelamento_antecedencia_minutos: 120,
  janela_agendamento_dias: 30,
  passo_minutos: 30,
};

export async function lerConfiguracoes(q?: Queryable): Promise<Configuracoes> {
  const db = q ?? (await getDb());
  const { rows } = await db.query<{ chave: string; valor: unknown }>("SELECT chave, valor FROM settings");
  const cfg: Record<string, unknown> = { ...CONFIG_PADRAO };
  for (const r of rows) {
    if (r.chave in CONFIG_PADRAO) cfg[r.chave] = r.valor;
  }
  return cfg as unknown as Configuracoes;
}

export async function salvarConfiguracoes(parcial: Partial<Configuracoes>, q?: Queryable): Promise<void> {
  const db = q ?? (await getDb());
  for (const [chave, valor] of Object.entries(parcial)) {
    if (!(chave in CONFIG_PADRAO) || valor === undefined) continue;
    await db.query(
      `INSERT INTO settings (chave, valor, updated_at) VALUES ($1, $2::jsonb, now())
       ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now()`,
      [chave, JSON.stringify(valor)],
    );
  }
}

/** Nome exibido no site e nas mensagens; usa um texto neutro enquanto não configurado. */
export function nomeExibicao(cfg: Pick<Configuracoes, "nome_profissional">): string {
  return cfg.nome_profissional.trim() || "Studio de Manicure";
}

export function linkWhatsApp(cfg: Pick<Configuracoes, "whatsapp_numero">, texto?: string): string | null {
  const numero = cfg.whatsapp_numero.replace(/\D/g, "");
  if (!numero) return null;
  const base = `https://wa.me/${numero}`;
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base;
}
