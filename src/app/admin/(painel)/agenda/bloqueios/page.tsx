import { criarBloqueio, removerBloqueio } from "../../../actions";
import { exigirAdmin } from "@/lib/auth";
import { listarBloqueios } from "@/lib/painel";
import { DIAS_SEMANA, formatarDataComDia, hoje } from "@/lib/tz";
import { Aviso, Cabecalho, Vazio, Voltar, type Busca } from "@/components/admin/Ui";

export const metadata = { title: "Bloqueios de agenda" };

export default async function Bloqueios({ searchParams }: { searchParams: Busca }) {
  await exigirAdmin();
  const busca = await searchParams;
  const dia = hoje();
  const bloqueios = await listarBloqueios(dia);
  const pontuais = bloqueios.filter((b) => b.data !== null);
  const recorrentes = bloqueios.filter((b) => b.dia_semana !== null);

  return (
    <div className="max-w-4xl">
      <Voltar href="/admin/agenda">Agenda</Voltar>
      <Cabecalho
        titulo="Bloqueios de agenda"
        descricao="Horários e dias bloqueados deixam de ser oferecidos no WhatsApp imediatamente."
      />
      <Aviso busca={busca} />

      <div className="grid gap-5 lg:grid-cols-3">
        <form action={criarBloqueio} className="cartao space-y-3">
          <input type="hidden" name="tipo" value="dia" />
          <h2 className="text-lg">Bloquear dia(s) inteiro(s)</h2>
          <p className="ajuda">Feriados, folgas, férias.</p>
          <div>
            <label htmlFor="d-data" className="rotulo">De</label>
            <input id="d-data" name="data" type="date" min={dia} required className="campo" />
          </div>
          <div>
            <label htmlFor="d-fim" className="rotulo">Até (opcional)</label>
            <input id="d-fim" name="data_fim" type="date" min={dia} className="campo" />
          </div>
          <div>
            <label htmlFor="d-motivo" className="rotulo">Motivo (opcional)</label>
            <input id="d-motivo" name="motivo" maxLength={120} placeholder="Feriado" className="campo" />
          </div>
          <button type="submit" className="btn btn-primario w-full">Bloquear</button>
        </form>

        <form action={criarBloqueio} className="cartao space-y-3">
          <input type="hidden" name="tipo" value="periodo" />
          <h2 className="text-lg">Bloquear um horário</h2>
          <p className="ajuda">Compromisso em uma data específica.</p>
          <div>
            <label htmlFor="p-data" className="rotulo">Data</label>
            <input id="p-data" name="data" type="date" min={dia} required className="campo" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="p-hi" className="rotulo">Das</label>
              <input id="p-hi" name="horario_inicio" type="time" required className="campo" />
            </div>
            <div>
              <label htmlFor="p-hf" className="rotulo">Até</label>
              <input id="p-hf" name="horario_fim" type="time" required className="campo" />
            </div>
          </div>
          <div>
            <label htmlFor="p-motivo" className="rotulo">Motivo (opcional)</label>
            <input id="p-motivo" name="motivo" maxLength={120} className="campo" />
          </div>
          <button type="submit" className="btn btn-primario w-full">Bloquear</button>
        </form>

        <form action={criarBloqueio} className="cartao space-y-3">
          <input type="hidden" name="tipo" value="recorrente" />
          <h2 className="text-lg">Pausa semanal</h2>
          <p className="ajuda">Repete toda semana no mesmo dia.</p>
          <div>
            <label htmlFor="r-dow" className="rotulo">Dia da semana</label>
            <select id="r-dow" name="dia_semana" required className="campo">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <option key={d} value={d}>{DIAS_SEMANA[d]}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="r-hi" className="rotulo">Das</label>
              <input id="r-hi" name="horario_inicio" type="time" required className="campo" />
            </div>
            <div>
              <label htmlFor="r-hf" className="rotulo">Até</label>
              <input id="r-hf" name="horario_fim" type="time" required className="campo" />
            </div>
          </div>
          <div>
            <label htmlFor="r-motivo" className="rotulo">Motivo (opcional)</label>
            <input id="r-motivo" name="motivo" maxLength={120} className="campo" />
          </div>
          <button type="submit" className="btn btn-primario w-full">Criar pausa</button>
        </form>
      </div>

      <section className="cartao mt-6" aria-labelledby="t-pontuais">
        <h2 id="t-pontuais" className="mb-3 text-xl">Próximos bloqueios</h2>
        {pontuais.length === 0 ? (
          <Vazio>Nenhum bloqueio futuro.</Vazio>
        ) : (
          <ul className="divide-y divide-linha/70">
            {pontuais.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-medium first-letter:uppercase">
                    {formatarDataComDia(b.data!)} · {b.horario_inicio ? `${b.horario_inicio} – ${b.horario_fim}` : "dia inteiro"}
                  </p>
                  {b.motivo && <p className="text-tinta-suave">{b.motivo}</p>}
                </div>
                <form action={removerBloqueio}>
                  <input type="hidden" name="id" value={b.id} />
                  <button type="submit" className="btn btn-sm btn-claro">Remover</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="cartao mt-6" aria-labelledby="t-rec">
        <h2 id="t-rec" className="mb-3 text-xl">Pausas semanais</h2>
        {recorrentes.length === 0 ? (
          <Vazio>Nenhuma pausa semanal além do intervalo de almoço.</Vazio>
        ) : (
          <ul className="divide-y divide-linha/70">
            {recorrentes.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-medium first-letter:uppercase">
                    Toda {DIAS_SEMANA[b.dia_semana!]} · {b.horario_inicio} – {b.horario_fim}
                  </p>
                  {b.motivo && <p className="text-tinta-suave">{b.motivo}</p>}
                </div>
                <form action={removerBloqueio}>
                  <input type="hidden" name="id" value={b.id} />
                  <button type="submit" className="btn btn-sm btn-claro">Remover</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
