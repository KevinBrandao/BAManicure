import Link from "next/link";
import { exigirAdmin } from "@/lib/auth";
import { horariosLivresDoDia, listarAgendamentos, type Agendamento } from "@/lib/agenda";
import { inicioDaSemana, listarBloqueios, type Bloqueio } from "@/lib/painel";
import {
  dataValida,
  diaDaSemana,
  DIAS_SEMANA,
  DIAS_SEMANA_CURTO,
  formatarDataLonga,
  hoje,
  MESES,
  somarDias,
} from "@/lib/tz";
import { Aviso, Cabecalho, param, SeloStatus, Vazio, type Busca } from "@/components/admin/Ui";
import { AtualizacaoAutomatica } from "@/components/admin/Cliente";

export const metadata = { title: "Agenda" };

type Visao = "dia" | "semana" | "mes";

function bloqueiosDoDia(bloqueios: Bloqueio[], data: string): Bloqueio[] {
  const dow = diaDaSemana(data);
  return bloqueios.filter((b) => (b.data !== null ? b.data === data : b.dia_semana === dow));
}

function CartaoAgendamento({ a, compacto }: { a: Agendamento; compacto?: boolean }) {
  const cancelado = a.status === "CANCELADO";
  return (
    <Link
      href={`/admin/agenda/${a.id}`}
      className={`block rounded-xl border px-3 py-2.5 transition hover:shadow-cartao ${
        cancelado ? "border-linha bg-stone-50 opacity-60" : "border-rose-200 bg-rose-50"
      }`}
    >
      <p className={`text-sm font-medium ${cancelado ? "line-through" : ""}`}>
        {a.hora} – {a.hora_fim}
      </p>
      <p className="truncate text-sm">{a.cliente_nome}</p>
      <p className="truncate text-xs text-tinta-suave">{a.servico_nome}</p>
      {!compacto && (
        <div className="mt-1.5">
          <SeloStatus status={a.status} />
        </div>
      )}
    </Link>
  );
}

function ItemBloqueio({ b }: { b: Bloqueio }) {
  return (
    <div className="rounded-xl border border-stone-300 bg-stone-100 px-3 py-2 text-sm text-stone-700">
      🔒 {b.horario_inicio ? `${b.horario_inicio} – ${b.horario_fim}` : "Dia inteiro bloqueado"}
      {b.motivo ? ` · ${b.motivo}` : ""}
      {b.dia_semana !== null ? " (pausa semanal)" : ""}
    </div>
  );
}

export default async function Agenda({ searchParams }: { searchParams: Busca }) {
  await exigirAdmin();
  const busca = await searchParams;
  const hojeStr = hoje();
  const v = param(busca, "visao");
  const visao: Visao = v === "semana" || v === "mes" ? v : "dia";
  const dataParam = param(busca, "data");
  const data = dataValida(dataParam) ? dataParam : hojeStr;

  // intervalo exibido + navegação
  let de = data;
  let ate = data;
  let anterior = somarDias(data, -1);
  let proximo = somarDias(data, 1);
  let titulo = formatarDataLonga(data);
  const [ano, mes] = data.split("-").map(Number);

  if (visao === "semana") {
    de = inicioDaSemana(data);
    ate = somarDias(de, 6);
    anterior = somarDias(de, -7);
    proximo = somarDias(de, 7);
    titulo = `Semana de ${de.slice(8)}/${de.slice(5, 7)} a ${ate.slice(8)}/${ate.slice(5, 7)}`;
  } else if (visao === "mes") {
    de = `${data.slice(0, 7)}-01`;
    ate = somarDias(mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`, -1);
    anterior = somarDias(de, -1).slice(0, 7) + "-01";
    proximo = somarDias(ate, 1);
    titulo = `${MESES[mes - 1]} de ${ano}`;
  }

  const agendamentos = await listarAgendamentos(de, ate);
  const bloqueios = await listarBloqueios(de, ate);
  const livres = visao === "dia" ? await horariosLivresDoDia(data) : [];
  const porDia = new Map<string, Agendamento[]>();
  for (const a of agendamentos) porDia.set(a.data, [...(porDia.get(a.data) ?? []), a]);

  const link = (vv: Visao, d: string) => `/admin/agenda?visao=${vv}&data=${d}`;
  const dias: string[] = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) dias.push(d);

  return (
    <>
      <AtualizacaoAutomatica segundos={20} />
      <Cabecalho titulo="Agenda">
        <Link href="/admin/agenda/bloqueios" className="btn btn-claro">
          Bloqueios
        </Link>
        <Link href={`/admin/agenda/novo?data=${data}`} className="btn btn-primario">
          Novo agendamento
        </Link>
      </Cabecalho>
      <Aviso busca={busca} />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Visualização" className="inline-flex rounded-full border border-linha bg-white p-1">
          {(["dia", "semana", "mes"] as Visao[]).map((vv) => (
            <Link
              key={vv}
              href={link(vv, data)}
              role="tab"
              aria-selected={visao === vv}
              className={`min-h-9 rounded-full px-4 py-1.5 text-sm ${visao === vv ? "bg-rose-500 text-white" : "text-tinta-suave hover:text-tinta"}`}
            >
              {vv === "dia" ? "Dia" : vv === "semana" ? "Semana" : "Mês"}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Link href={link(visao, anterior)} className="btn btn-sm btn-claro" aria-label="Período anterior">
            ‹
          </Link>
          <Link href={link(visao, hojeStr)} className="btn btn-sm btn-claro">
            Hoje
          </Link>
          <Link href={link(visao, proximo)} className="btn btn-sm btn-claro" aria-label="Próximo período">
            ›
          </Link>
        </div>
      </div>

      <h2 className="mb-4 text-xl first-letter:uppercase">{titulo}</h2>

      {/* ------------------------------------------------------------- DIA */}
      {visao === "dia" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="cartao lg:col-span-2" aria-label="Agendamentos do dia">
            <h3 className="mb-3 text-lg">Ocupados</h3>
            <div className="space-y-2">
              {bloqueiosDoDia(bloqueios, data).map((b) => (
                <ItemBloqueio key={b.id} b={b} />
              ))}
              {(porDia.get(data) ?? []).map((a) => (
                <CartaoAgendamento key={a.id} a={a} />
              ))}
              {(porDia.get(data) ?? []).length === 0 && bloqueiosDoDia(bloqueios, data).length === 0 && (
                <Vazio>Nenhum agendamento neste dia.</Vazio>
              )}
            </div>
          </section>
          <section className="cartao" aria-label="Horários livres">
            <h3 className="mb-3 text-lg">Livres</h3>
            {livres.length === 0 ? (
              <Vazio>{data < hojeStr ? "Dia já encerrado." : "Sem horários livres."}</Vazio>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {livres.map((h) => (
                  <li key={h}>
                    <Link
                      href={`/admin/agenda/novo?data=${data}&hora=${h}`}
                      className="inline-flex min-h-9 items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 text-sm text-emerald-800 hover:bg-emerald-100"
                    >
                      {h}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <p className="ajuda mt-3">Toque em um horário livre para agendar.</p>
          </section>
        </div>
      )}

      {/* ---------------------------------------------------------- SEMANA */}
      {visao === "semana" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
          {dias.map((d) => {
            const itens = porDia.get(d) ?? [];
            const bl = bloqueiosDoDia(bloqueios, d);
            return (
              <section key={d} className={`rounded-2xl border bg-white p-3 ${d === hojeStr ? "border-rose-400" : "border-linha"}`}>
                <Link href={link("dia", d)} className="mb-2 block text-sm font-medium hover:text-rose-600">
                  <span className="capitalize">{DIAS_SEMANA[diaDaSemana(d)].replace("-feira", "")}</span>{" "}
                  <span className="text-tinta-suave">
                    {d.slice(8)}/{d.slice(5, 7)}
                  </span>
                </Link>
                <div className="space-y-2">
                  {bl.map((b) => (
                    <ItemBloqueio key={b.id} b={b} />
                  ))}
                  {itens.map((a) => (
                    <CartaoAgendamento key={a.id} a={a} compacto />
                  ))}
                  {itens.length === 0 && bl.length === 0 && <p className="py-2 text-xs text-tinta-suave">Livre</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------------------- MÊS */}
      {visao === "mes" && (
        <div className="cartao overflow-x-auto p-3">
          <div className="grid min-w-[36rem] grid-cols-7 gap-1.5">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <div key={d} className="px-1 pb-1 text-center text-xs font-medium tracking-wider text-tinta-suave uppercase">
                {DIAS_SEMANA_CURTO[d]}
              </div>
            ))}
            {Array.from({ length: (diaDaSemana(de) + 6) % 7 }).map((_, i) => (
              <div key={`v${i}`} />
            ))}
            {dias.map((d) => {
              const itens = (porDia.get(d) ?? []).filter((a) => a.status !== "CANCELADO");
              const diaBloqueado = bloqueiosDoDia(bloqueios, d).some((b) => !b.horario_inicio);
              return (
                <Link
                  key={d}
                  href={link("dia", d)}
                  className={`flex min-h-20 flex-col rounded-xl border p-2 text-sm transition hover:border-rose-400 ${
                    d === hojeStr ? "border-rose-400 bg-rose-50" : diaBloqueado ? "border-stone-200 bg-stone-100" : "border-linha bg-white"
                  }`}
                >
                  <span className="font-medium">{Number(d.slice(8))}</span>
                  {diaBloqueado && <span className="mt-auto text-xs text-stone-600">🔒 bloqueado</span>}
                  {itens.length > 0 && (
                    <span className="mt-auto inline-flex w-fit rounded-full bg-rose-500 px-2 py-0.5 text-xs text-white">
                      {itens.length} {itens.length === 1 ? "agend." : "agends."}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
