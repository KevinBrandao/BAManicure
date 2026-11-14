/**
 * Lembretes automáticos (1h, 30min e 10min antes do atendimento).
 *
 * Os lembretes ficam persistidos em REMINDERS e são despachados por
 * `processarLembretes()`, chamado a cada minuto pelo endpoint
 * /api/cron/lembretes (agendador externo) — não depende de navegador aberto.
 *
 * Garantias:
 *  - cada lembrete é "reivindicado" de forma atômica (FOR UPDATE SKIP LOCKED),
 *    então execuções simultâneas nunca enviam a mesma mensagem duas vezes;
 *  - um lembrete ENVIADO nunca volta a ser enviado (RB14);
 *  - agendamentos cancelados não recebem lembretes (RB05);
 *  - falhas ficam registradas, com nova tentativa automática (até 3) e manual.
 */
import { getDb } from "./db";
import { configWhatsApp } from "./whatsapp/client";
import { dentroDaJanela24h, enviarTemplate, enviarTexto } from "./whatsapp/envio";
import { emSaoPaulo } from "./tz";
import { ehUuid, type TipoLembrete } from "./agenda";

export const MAX_TENTATIVAS = 3;

interface DadosLembrete {
  nome: string;
  servico: string;
  hora: string;
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0];
}

export function textoLembrete(tipo: TipoLembrete, d: DadosLembrete): string {
  switch (tipo) {
    case "1H":
      return [
        `Oi, ${d.nome}! ❤️`,
        "",
        "Passando para lembrar que seu horário está chegando!",
        "",
        `💅 Serviço: ${d.servico}`,
        `📅 Hoje, às ${d.hora}.`,
        "",
        "Falta apenas 1 hora para seu atendimento.",
        "Esperamos você!",
      ].join("\n");
    case "30MIN":
      return [
        `Oi, ${d.nome}! Seu atendimento está se aproximando! 💅`,
        "",
        `Faltam 30 minutos para seu horário de ${d.hora}.`,
        "",
        "Até daqui a pouco! ❤️",
      ].join("\n");
    case "10MIN":
      return [
        `Olá, ${d.nome}!`,
        "",
        "Seu horário está chegando! ⏰",
        "Faltam apenas 10 minutos para seu atendimento.",
        "",
        "Estamos esperando você! ❤️",
      ].join("\n");
  }
}

/** Parâmetros ({{1}}, {{2}}...) de cada template aprovado na Meta. */
export function parametrosTemplate(tipo: TipoLembrete, d: DadosLembrete): string[] {
  switch (tipo) {
    case "1H":
      return [d.nome, d.servico, d.hora];
    case "30MIN":
      return [d.nome, d.hora];
    case "10MIN":
      return [d.nome];
  }
}

export interface ResumoLembretes {
  enviados: number;
  falhas: number;
  expirados: number;
  cancelados: number;
}

export async function processarLembretes(agora: Date = new Date(), limite = 50): Promise<ResumoLembretes> {
  const db = await getDb();
  const resumo: ResumoLembretes = { enviados: 0, falhas: 0, expirados: 0, cancelados: 0 };

  // Agendamentos que deixaram de estar ativos não recebem lembretes (RB05)
  const canc = await db.query(
    `UPDATE reminders r SET status = 'CANCELADO', updated_at = $1
       FROM appointments a
      WHERE a.id = r.appointment_id AND r.status IN ('PENDENTE','FALHA')
        AND a.status NOT IN ('PENDENTE','CONFIRMADO')`,
    [agora],
  );
  resumo.cancelados += canc.rowCount;

  // Lembretes cujo atendimento já começou perdem o sentido
  const exp = await db.query(
    `UPDATE reminders r SET status = 'EXPIRADO', updated_at = $1
       FROM appointments a
      WHERE a.id = r.appointment_id AND r.status IN ('PENDENTE','FALHA') AND a.inicio <= $1`,
    [agora],
  );
  resumo.expirados += exp.rowCount;

  // Envio interrompido (ex.: processo encerrado no meio): não se sabe se a
  // mensagem saiu, então NÃO há nova tentativa automática — evita duplicidade.
  await db.query(
    `UPDATE reminders SET status = 'FALHA', attempts = $2, updated_at = $1,
            error_message = 'Envio interrompido antes da confirmação da API. Verifique o histórico antes de reenviar.'
      WHERE status = 'ENVIANDO' AND updated_at < $1::timestamptz - interval '10 minutes'`,
    [agora, MAX_TENTATIVAS],
  );

  // Reivindica os lembretes vencidos de forma atômica
  const { rows: lote } = await db.query<{ id: string; appointment_id: string; tipo: TipoLembrete }>(
    `UPDATE reminders SET status = 'ENVIANDO', attempts = attempts + 1, updated_at = $1
      WHERE id IN (
        SELECT r.id
          FROM reminders r
          JOIN appointments a ON a.id = r.appointment_id
         WHERE a.status IN ('PENDENTE','CONFIRMADO')
           AND a.inicio > $1
           AND r.scheduled_at <= $1
           AND (r.status = 'PENDENTE'
                OR (r.status = 'FALHA' AND r.attempts < $2
                    AND r.updated_at <= $1::timestamptz - interval '1 minute'))
         ORDER BY r.scheduled_at
         LIMIT $3
         FOR UPDATE OF r SKIP LOCKED
      )
      RETURNING id, appointment_id, tipo`,
    [agora, MAX_TENTATIVAS, limite],
  );

  const cfg = configWhatsApp();

  for (const item of lote) {
    const { rows } = await db.query<{
      customer_id: string;
      nome: string;
      telefone: string;
      aceita_lembretes: boolean;
      servico: string;
      inicio: Date;
    }>(
      `SELECT c.id AS customer_id, c.nome, c.telefone, c.aceita_lembretes, s.nome AS servico, a.inicio
         FROM appointments a
         JOIN customers c ON c.id = a.customer_id
         JOIN services  s ON s.id = a.service_id
        WHERE a.id = $1`,
      [item.appointment_id],
    );
    const info = rows[0];

    if (!info.aceita_lembretes) {
      await db.query(
        `UPDATE reminders SET status = 'CANCELADO', updated_at = $2,
                error_message = 'Cliente optou por não receber lembretes.'
          WHERE id = $1 AND status = 'ENVIANDO'`,
        [item.id, agora],
      );
      resumo.cancelados++;
      continue;
    }

    const dados: DadosLembrete = {
      nome: primeiroNome(info.nome),
      servico: info.servico,
      hora: emSaoPaulo(new Date(info.inicio)).hora,
    };
    const texto = textoLembrete(item.tipo, dados);

    // Regras da API oficial: texto livre só dentro da janela de 24h; fora
    // dela, a mensagem iniciada pela empresa precisa de um template aprovado.
    let resultado: { ok: boolean; id?: string; erro?: string };
    try {
      if (await dentroDaJanela24h(info.telefone, agora)) {
        resultado = await enviarTexto(info.telefone, texto, info.customer_id);
      } else if (cfg.templates[item.tipo]) {
        resultado = await enviarTemplate(
          info.telefone,
          {
            nome: cfg.templates[item.tipo],
            idioma: cfg.idiomaTemplate,
            parametros: parametrosTemplate(item.tipo, dados),
          },
          texto,
          info.customer_id,
        );
      } else {
        resultado = {
          ok: false,
          erro: `Fora da janela de 24h do WhatsApp e nenhum template aprovado configurado para o lembrete ${item.tipo}.`,
        };
      }
    } catch (err) {
      resultado = { ok: false, erro: `Erro inesperado no envio: ${(err as Error).message}` };
    }

    if (resultado.ok) {
      await db.query(
        `UPDATE reminders SET status = 'ENVIADO', sent_at = $2, updated_at = $2,
                wa_message_id = $3, error_message = NULL
          WHERE id = $1 AND status = 'ENVIANDO'`,
        [item.id, agora, resultado.id ?? null],
      );
      resumo.enviados++;
    } else {
      await db.query(
        `UPDATE reminders SET status = 'FALHA', updated_at = $2, error_message = $3
          WHERE id = $1 AND status = 'ENVIANDO'`,
        [item.id, agora, (resultado.erro ?? "Erro desconhecido").slice(0, 1000)],
      );
      resumo.falhas++;
    }
  }

  return resumo;
}

/**
 * Nova tentativa manual (painel). Só lembretes em FALHA de agendamentos
 * ativos e futuros voltam para a fila; lembretes já enviados nunca.
 */
export async function reenfileirarLembrete(id: string, agora: Date = new Date()): Promise<boolean> {
  if (!ehUuid(id)) return false;
  const db = await getDb();
  const r = await db.query(
    `UPDATE reminders r SET status = 'PENDENTE', attempts = 0, error_message = NULL, updated_at = $2
       FROM appointments a
      WHERE r.id = $1 AND a.id = r.appointment_id AND r.status = 'FALHA'
        AND a.status IN ('PENDENTE','CONFIRMADO') AND a.inicio > $2`,
    [id, agora],
  );
  return r.rowCount > 0;
}
