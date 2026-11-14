import Link from "next/link";
import { exigirAdmin } from "@/lib/auth";
import { horariosLivresDoDia, listarAgendamentos, listarServicos, type Agendamento } from "@/lib/agenda";
import { resumoDoMes } from "@/lib/painel";
import { lerConfiguracoes } from "@/lib/settings";
import { envioConfigurado } from "@/lib/whatsapp/client";
import { formatarDataComDia, formatarDataLonga, formatarPreco, hoje, somarDias } from "@/lib/tz";
import { Aviso, Cabecalho, SeloStatus, Vazio, type Busca } from "@/components/admin/Ui";
import { AtualizacaoAutomatica } from "@/components/admin/Cliente";

export const metadata = { title: "Início" };

function Indicador({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="cartao">
      <p className="text-xs font-medium tracking-wider text-tinta-suave uppercase">{rotulo}</p>
      <p className="mt-2 font-titulo text-3xl text-tinta">{valor}</p>
      {detalhe && <p className="mt-1 text-xs text-tinta-suave">{detalhe}</p>}
    </div>
  );
}

function LinhaAgendamento({ a, mostrarData }: { a: Agendamento; mostrarData?: boolean }) {
  return (
    <li>
      <Link href={`/admin/agenda/${a.id}`} className="flex items-center justify-between gap-3 rounded-xl px-3 py-3 transition hover:bg-nude-50">
        <div className="min-w-0">
          <p className="font-medium text-tinta">
            {a.hora} – {a.hora_fim} · {a.cliente_nome}
          </p>
          <p className="truncate text-sm text-tinta-suave">
            {mostrarData ? `${formatarDataComDia(a.data)} · ` : ""}
            {a.servico_nome}
          </p>
        </div>
        <SeloStatus status={a.status} />
      </Link>
    </li>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: Busca }) {
  await exigirAdmin();
  const busca = await searchParams;
  const agora = new Date();
  const dia = hoje(agora);

  const [cfg, servicos, deHoje, proximos, mes, livres] = [
    await lerConfiguracoes(),
    await listarServicos(),
    await listarAgendamentos(dia, dia),
    await listarAgendamentos(dia, somarDias(dia, 14), { apenasAtivos: true }),
    await resumoDoMes(agora),
    await horariosLivresDoDia(dia, agora),
  ];
  const ativosHoje = deHoje.filter((a) => a.status !== "CANCELADO");
  const futuros = proximos.filter((a) => a.inicio.getTime() > agora.getTime()).slice(0, 6);

  const pendencias: Array<{ texto: string; href: string }> = [];
  if (!cfg.nome_profissional) pendencias.push({ texto: "Informe seu nome profissional e os dados do site", href: "/admin/configuracoes#site" });
  if (!cfg.whatsapp_numero) pendencias.push({ texto: "Informe o número de WhatsApp exibido no site", href: "/admin/configuracoes#site" });
  if (servicos.filter((s) => s.ativo).length === 0) pendencias.push({ texto: "Cadastre pelo menos um serviço ativo", href: "/admin/servicos/novo" });
  if (!envioConfigurado()) pendencias.push({ texto: "Conecte a API do WhatsApp (credenciais da Meta)", href: "/admin/whatsapp" });

  return (
    <>
      <AtualizacaoAutomatica segundos={30} />
      <Cabecalho titulo="Olá! 👋" descricao={`Hoje é ${formatarDataLonga(dia)}.`}>
        <Link href="/admin/agenda/novo" className="btn btn-primario">
          Novo agendamento
        </Link>
      </Cabecalho>
      <Aviso busca={busca} />

      {pendencias.length > 0 && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="font-medium text-amber-900">Para começar a atender, falta:</p>
          <ul className="mt-2 space-y-1 text-sm">
            {pendencias.map((p) => (
              <li key={p.texto}>
                <Link href={p.href} className="text-amber-900 underline underline-offset-4">
                  {p.texto}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Indicador rotulo="Hoje" valor={String(ativosHoje.length)} detalhe={ativosHoje.length === 1 ? "agendamento" : "agendamentos"} />
        <Indicador rotulo="No mês" valor={String(mes.total)} detalhe="agendamentos (sem cancelados)" />
        <Indicador rotulo="Cancelamentos" valor={String(mes.cancelados)} detalhe="neste mês" />
        <Indicador rotulo="Faturamento previsto" valor={formatarPreco(mes.faturamentoPrevisto)} detalhe="neste mês" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="cartao" aria-labelledby="t-hoje">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="t-hoje" className="text-xl">
              Agendamentos de hoje
            </h2>
            <Link href={`/admin/agenda?visao=dia&data=${dia}`} className="text-sm text-rose-600 underline-offset-4 hover:underline">
              Ver agenda
            </Link>
          </div>
          {ativosHoje.length === 0 ? (
            <Vazio>Nenhum agendamento para hoje.</Vazio>
          ) : (
            <ul className="divide-y divide-linha/70">
              {ativosHoje.map((a) => (
                <LinhaAgendamento key={a.id} a={a} />
              ))}
            </ul>
          )}
        </section>

        <section className="cartao" aria-labelledby="t-prox">
          <h2 id="t-prox" className="mb-2 text-xl">
            Próximos atendimentos
          </h2>
          {futuros.length === 0 ? (
            <Vazio>Nenhum atendimento futuro nos próximos 14 dias.</Vazio>
          ) : (
            <ul className="divide-y divide-linha/70">
              {futuros.map((a) => (
                <LinhaAgendamento key={a.id} a={a} mostrarData />
              ))}
            </ul>
          )}
        </section>

        <section className="cartao" aria-labelledby="t-livres">
          <h2 id="t-livres" className="mb-3 text-xl">
            Horários livres hoje
          </h2>
          {livres.length === 0 ? (
            <Vazio>Sem horários livres hoje.</Vazio>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {livres.map((h) => (
                <li key={h}>
                  <Link
                    href={`/admin/agenda/novo?data=${dia}&hora=${h}`}
                    className="inline-flex min-h-9 items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 text-sm text-emerald-800 hover:bg-emerald-100"
                  >
                    {h}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="cartao" aria-labelledby="t-top">
          <h2 id="t-top" className="mb-3 text-xl">
            Serviços mais procurados no mês
          </h2>
          {mes.maisProcurados.length === 0 ? (
            <Vazio>Ainda não há agendamentos neste mês.</Vazio>
          ) : (
            <ol className="space-y-3">
              {mes.maisProcurados.map((s) => {
                const pct = Math.round((s.total / mes.maisProcurados[0].total) * 100);
                return (
                  <li key={s.nome}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{s.nome}</span>
                      <span className="text-tinta-suave">{s.total}</span>
                    </div>
                    <div className="h-2 rounded-full bg-nude-100">
                      <div className="h-2 rounded-full bg-rose-400" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
