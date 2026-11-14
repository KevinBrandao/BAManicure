import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelarAgendamentoAdmin, mudarStatusAgendamento, salvarAgendamento } from "../../../actions";
import { exigirAdmin } from "@/lib/auth";
import { buscarAgendamento, listarServicos, STATUS_ATIVOS } from "@/lib/agenda";
import { dataHoraCurta, lembretesDoAgendamento } from "@/lib/painel";
import { formatarDataLonga, formatarPreco } from "@/lib/tz";
import { Aviso, Cabecalho, formatarTelefone, Selo, SeloStatus, Voltar, type Busca } from "@/components/admin/Ui";
import { BotaoConfirmar } from "@/components/admin/Cliente";

export const metadata = { title: "Agendamento" };

const ROTULO_LEMBRETE: Record<string, string> = { "1H": "1 hora antes", "30MIN": "30 minutos antes", "10MIN": "10 minutos antes" };
const COR_LEMBRETE: Record<string, "verde" | "vermelho" | "ambar" | "cinza" | "azul"> = {
  PENDENTE: "ambar",
  ENVIANDO: "azul",
  ENVIADO: "verde",
  FALHA: "vermelho",
  CANCELADO: "cinza",
  EXPIRADO: "cinza",
};

export default async function DetalheAgendamento({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Busca }) {
  await exigirAdmin();
  const { id } = await params;
  const busca = await searchParams;
  const ag = await buscarAgendamento(id);
  if (!ag) notFound();

  const servicos = await listarServicos();
  const lembretes = await lembretesDoAgendamento(ag.id);
  const ativo = STATUS_ATIVOS.includes(ag.status);
  const opcoesServico = servicos.filter((s) => s.ativo || s.id === ag.service_id);

  return (
    <div className="max-w-3xl">
      <Voltar href={`/admin/agenda?visao=dia&data=${ag.data}`}>Agenda de {ag.data.slice(8)}/{ag.data.slice(5, 7)}</Voltar>
      <Cabecalho titulo={ag.cliente_nome} descricao={`Código ${ag.codigo} · criado ${ag.origem === "WHATSAPP" ? "pelo WhatsApp" : "pelo painel"} em ${dataHoraCurta(ag.created_at)}`}>
        <SeloStatus status={ag.status} />
      </Cabecalho>
      <Aviso busca={busca} />

      <section className="cartao mb-5">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs tracking-wider text-tinta-suave uppercase">Serviço</dt>
            <dd className="mt-0.5 font-medium">{ag.servico_nome}</dd>
          </div>
          <div>
            <dt className="text-xs tracking-wider text-tinta-suave uppercase">Quando</dt>
            <dd className="mt-0.5 font-medium first-letter:uppercase">
              {formatarDataLonga(ag.data)}, {ag.hora} – {ag.hora_fim}
            </dd>
          </div>
          <div>
            <dt className="text-xs tracking-wider text-tinta-suave uppercase">Valor</dt>
            <dd className="mt-0.5 font-medium">{formatarPreco(ag.preco_centavos)}</dd>
          </div>
          <div>
            <dt className="text-xs tracking-wider text-tinta-suave uppercase">Cliente</dt>
            <dd className="mt-0.5">
              <Link href={`/admin/clientes/${ag.customer_id}`} className="font-medium text-rose-600 underline-offset-4 hover:underline">
                {ag.cliente_nome}
              </Link>{" "}
              <span className="text-tinta-suave">· {formatarTelefone(ag.cliente_telefone)}</span>
            </dd>
          </div>
          {ag.observacoes && (
            <div className="sm:col-span-2">
              <dt className="text-xs tracking-wider text-tinta-suave uppercase">Observações</dt>
              <dd className="mt-0.5 whitespace-pre-line">{ag.observacoes}</dd>
            </div>
          )}
          {ag.status === "CANCELADO" && (
            <div className="sm:col-span-2">
              <dt className="text-xs tracking-wider text-tinta-suave uppercase">Cancelamento</dt>
              <dd className="mt-0.5">
                {dataHoraCurta(ag.cancelado_em)} · por {ag.cancelado_por === "CLIENTE" ? "cliente (WhatsApp)" : "profissional"}
                {ag.motivo_cancelamento ? ` · motivo: ${ag.motivo_cancelamento}` : ""}
              </dd>
            </div>
          )}
        </dl>

        {ag.status !== "CANCELADO" && (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-linha pt-4">
            {(
              [
                ["CONCLUIDO", "Marcar como concluído"],
                ["NAO_COMPARECEU", "Não compareceu"],
                ["CONFIRMADO", "Voltar para confirmado"],
              ] as const
            )
              .filter(([s]) => s !== ag.status)
              .map(([s, rotulo]) => (
                <form key={s} action={mudarStatusAgendamento}>
                  <input type="hidden" name="id" value={ag.id} />
                  <input type="hidden" name="status" value={s} />
                  <button type="submit" className="btn btn-sm btn-claro">
                    {rotulo}
                  </button>
                </form>
              ))}
          </div>
        )}
      </section>

      {ativo && (
        <section className="cartao mb-5" aria-labelledby="t-editar">
          <h2 id="t-editar" className="mb-4 text-xl">
            Editar agendamento
          </h2>
          <form action={salvarAgendamento} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={ag.id} />
            <div className="sm:col-span-2">
              <label htmlFor="service_id" className="rotulo">
                Serviço
              </label>
              <select id="service_id" name="service_id" defaultValue={ag.service_id} className="campo">
                {opcoesServico.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="data" className="rotulo">
                Data
              </label>
              <input id="data" name="data" type="date" defaultValue={ag.data} required className="campo" />
            </div>
            <div>
              <label htmlFor="hora" className="rotulo">
                Horário
              </label>
              <input id="hora" name="hora" type="time" defaultValue={ag.hora} required className="campo" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="observacoes" className="rotulo">
                Observações
              </label>
              <textarea id="observacoes" name="observacoes" rows={2} maxLength={500} defaultValue={ag.observacoes ?? ""} className="campo" />
              <p className="ajuda">O novo horário é validado: precisa estar no expediente, sem bloqueio e sem conflito.</p>
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="btn btn-primario">
                Salvar alterações
              </button>
            </div>
          </form>
        </section>
      )}

      {ativo && (
        <section className="cartao mb-5 border-red-200" aria-labelledby="t-cancelar">
          <h2 id="t-cancelar" className="mb-3 text-xl">
            Cancelar agendamento
          </h2>
          <form action={cancelarAgendamentoAdmin} className="space-y-3">
            <input type="hidden" name="id" value={ag.id} />
            <div>
              <label htmlFor="motivo" className="rotulo">
                Motivo (opcional)
              </label>
              <input id="motivo" name="motivo" maxLength={500} className="campo" />
            </div>
            <BotaoConfirmar mensagem="Cancelar este agendamento? O horário voltará a ficar disponível e os lembretes serão cancelados." className="btn btn-perigo">
              Cancelar agendamento
            </BotaoConfirmar>
            <p className="ajuda">A cliente não é avisada automaticamente por esta ação.</p>
          </form>
        </section>
      )}

      <section className="cartao" aria-labelledby="t-lembretes">
        <h2 id="t-lembretes" className="mb-3 text-xl">
          Lembretes
        </h2>
        {lembretes.length === 0 ? (
          <p className="text-sm text-tinta-suave">Nenhum lembrete programado (agendamento criado muito próximo do horário).</p>
        ) : (
          <ul className="divide-y divide-linha/70">
            {lembretes.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div>
                  <p className="font-medium">{ROTULO_LEMBRETE[l.tipo]}</p>
                  <p className="text-tinta-suave">
                    Programado para {dataHoraCurta(l.scheduled_at)}
                    {l.sent_at ? ` · enviado ${dataHoraCurta(l.sent_at)}` : ""}
                    {l.attempts > 0 ? ` · ${l.attempts} tentativa(s)` : ""}
                  </p>
                  {l.error_message && <p className="mt-0.5 text-red-700">{l.error_message}</p>}
                </div>
                <Selo cor={COR_LEMBRETE[l.status] ?? "cinza"}>{l.status.toLowerCase()}</Selo>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
