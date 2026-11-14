import { criarAgendamentoAdmin } from "../../../actions";
import { exigirAdmin } from "@/lib/auth";
import { ehUuid, horariosDisponiveis, listarServicos } from "@/lib/agenda";
import { buscarCliente } from "@/lib/painel";
import { dataValida, formatarDataLonga, formatarDuracao, formatarPreco, hoje, horaValida } from "@/lib/tz";
import { Aviso, Cabecalho, formatarTelefone, param, Vazio, Voltar, type Busca } from "@/components/admin/Ui";

export const metadata = { title: "Novo agendamento" };

export default async function NovoAgendamento({ searchParams }: { searchParams: Busca }) {
  await exigirAdmin();
  const busca = await searchParams;
  const servicos = await listarServicos({ apenasAtivos: true });

  const dataParam = param(busca, "data");
  const data = dataValida(dataParam) ? dataParam : hoje();
  const servicoParam = param(busca, "service_id");
  const servico = servicos.find((s) => s.id === servicoParam) ?? null;
  const horaParam = param(busca, "hora");
  const horaPre = horaValida(horaParam) ? horaParam : null;
  const clienteParam = param(busca, "cliente");
  const cliente = ehUuid(clienteParam) ? await buscarCliente(clienteParam) : null;

  const horarios = servico ? await horariosDisponiveis(servico.id, data, { ignorarAntecedencia: true }) : [];
  const extras = [horaPre ? `hora=${horaPre}` : "", cliente ? `cliente=${cliente.id}` : ""].filter(Boolean).join("&");
  const retorno = `/admin/agenda/novo?data=${data}${servico ? `&service_id=${servico.id}` : ""}${extras ? `&${extras}` : ""}`;

  return (
    <div className="max-w-2xl">
      <Voltar href={`/admin/agenda?visao=dia&data=${data}`}>Agenda</Voltar>
      <Cabecalho titulo="Novo agendamento" descricao="Agendamento manual feito pela profissional." />
      <Aviso busca={busca} />

      {servicos.length === 0 ? (
        <Vazio>Cadastre e ative um serviço antes de criar agendamentos.</Vazio>
      ) : (
        <>
          <form method="get" className="cartao mb-5 grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            {horaPre && <input type="hidden" name="hora" value={horaPre} />}
            {cliente && <input type="hidden" name="cliente" value={cliente.id} />}
            <div>
              <label htmlFor="service_id" className="rotulo">
                1. Serviço
              </label>
              <select id="service_id" name="service_id" defaultValue={servico?.id ?? ""} required className="campo">
                <option value="" disabled>
                  Selecione…
                </option>
                {servicos.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome} — {formatarPreco(s.preco_centavos)} ({formatarDuracao(s.duracao_minutos)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="data" className="rotulo">
                2. Data
              </label>
              <input id="data" name="data" type="date" defaultValue={data} required className="campo" />
            </div>
            <button type="submit" className="btn btn-claro">
              Ver horários
            </button>
          </form>

          {servico && (
            <form action={criarAgendamentoAdmin} className="cartao space-y-4">
              <input type="hidden" name="service_id" value={servico.id} />
              <input type="hidden" name="data" value={data} />
              <input type="hidden" name="retorno" value={retorno} />
              <p className="text-sm text-tinta-suave">
                <strong className="text-tinta">{servico.nome}</strong> em {formatarDataLonga(data)}
              </p>

              {horarios.length === 0 ? (
                <Vazio>Não há horários livres para este serviço nesta data (fora do expediente, bloqueada ou lotada).</Vazio>
              ) : (
                <>
                  <div>
                    <label htmlFor="hora" className="rotulo">
                      3. Horário disponível
                    </label>
                    <select id="hora" name="hora" required defaultValue={horaPre && horarios.includes(horaPre) ? horaPre : ""} className="campo">
                      <option value="" disabled>
                        Selecione…
                      </option>
                      {horarios.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                    <p className="ajuda">Somente horários realmente livres, considerando a duração do serviço.</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="nome" className="rotulo">
                        Nome da cliente
                      </label>
                      <input id="nome" name="nome" required maxLength={80} defaultValue={cliente?.nome ?? ""} autoComplete="off" className="campo" />
                    </div>
                    <div>
                      <label htmlFor="telefone" className="rotulo">
                        WhatsApp (com DDD)
                      </label>
                      <input
                        id="telefone"
                        name="telefone"
                        type="tel"
                        inputMode="tel"
                        required
                        maxLength={25}
                        defaultValue={cliente ? formatarTelefone(cliente.telefone) : ""}
                        placeholder="(11) 99999-8888"
                        autoComplete="off"
                        className="campo"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="observacoes" className="rotulo">
                      Observações (opcional)
                    </label>
                    <textarea id="observacoes" name="observacoes" rows={2} maxLength={500} className="campo" />
                  </div>
                  <button type="submit" className="btn btn-primario w-full sm:w-auto">
                    Confirmar agendamento
                  </button>
                </>
              )}
            </form>
          )}
        </>
      )}
    </div>
  );
}
