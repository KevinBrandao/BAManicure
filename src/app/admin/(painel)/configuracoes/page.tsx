import Link from "next/link";
import {
  removerDataEspecial,
  salvarDataEspecial,
  salvarExpediente,
  salvarRegras,
  salvarSite,
} from "../../actions";
import { exigirAdmin } from "@/lib/auth";
import { urlImagem } from "@/lib/imagens";
import { listarDatasEspeciais } from "@/lib/painel";
import { lerConfiguracoes } from "@/lib/settings";
import { listarExpediente } from "@/lib/site";
import { DIAS_SEMANA, formatarDataComDia, hoje } from "@/lib/tz";
import { Aviso, Cabecalho, formatarTelefone, Vazio, type Busca } from "@/components/admin/Ui";

export const metadata = { title: "Configurações" };

const ARQUIVO = "campo file:mr-3 file:rounded-full file:border-0 file:bg-nude-100 file:px-3 file:py-1 file:text-sm";

export default async function Configuracoes({ searchParams }: { searchParams: Busca }) {
  await exigirAdmin();
  const busca = await searchParams;
  const cfg = await lerConfiguracoes();
  const expediente = await listarExpediente();
  const especiais = await listarDatasEspeciais(hoje());
  const porDia = new Map(expediente.map((e) => [e.dia_semana, e]));
  const fotoPrincipal = urlImagem(cfg.foto_principal_id);
  const fotoSobre = urlImagem(cfg.foto_sobre_id);

  return (
    <div className="max-w-4xl">
      <Cabecalho titulo="Configurações" descricao="Funcionamento, regras de agendamento e informações do site." />
      <Aviso busca={busca} />

      <nav aria-label="Seções" className="mb-6 flex flex-wrap gap-2 text-sm">
        {[
          ["#expediente", "Horários de atendimento"],
          ["#datas-especiais", "Datas especiais"],
          ["#regras", "Regras de agendamento"],
          ["#site", "Informações do site"],
        ].map(([h, r]) => (
          <a key={h} href={h} className="rounded-full border border-linha bg-white px-4 py-2 text-tinta-suave hover:text-tinta">
            {r}
          </a>
        ))}
      </nav>

      {/* ------------------------------------------------------- Expediente */}
      <section id="expediente" className="cartao mb-6 scroll-mt-24">
        <h2 className="mb-1 text-xl">Horários de atendimento</h2>
        <p className="mb-4 text-sm text-tinta-suave">Dias em que atende, horário inicial e final e intervalo de almoço.</p>
        <form action={salvarExpediente}>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => {
              const e = porDia.get(d);
              return (
                <fieldset key={d} className="rounded-xl border border-linha p-3">
                  <legend className="px-1 text-sm font-medium first-letter:uppercase">{DIAS_SEMANA[d]}</legend>
                  <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[auto_1fr_1fr_1fr_1fr]">
                    <label className="col-span-2 flex items-center gap-2 text-sm sm:col-span-1 sm:pb-3">
                      <input type="checkbox" name={`ativo_${d}`} defaultChecked={e?.ativo ?? false} className="h-4 w-4 accent-rose-500" />
                      Atende
                    </label>
                    <div>
                      <label htmlFor={`inicio_${d}`} className="ajuda mb-1 block">Início</label>
                      <input id={`inicio_${d}`} name={`inicio_${d}`} type="time" required defaultValue={e?.inicio ?? "09:00"} className="campo" />
                    </div>
                    <div>
                      <label htmlFor={`fim_${d}`} className="ajuda mb-1 block">Fim</label>
                      <input id={`fim_${d}`} name={`fim_${d}`} type="time" required defaultValue={e?.fim ?? "18:00"} className="campo" />
                    </div>
                    <div>
                      <label htmlFor={`ii_${d}`} className="ajuda mb-1 block">Intervalo de</label>
                      <input id={`ii_${d}`} name={`intervalo_inicio_${d}`} type="time" defaultValue={e?.intervalo_inicio ?? ""} className="campo" />
                    </div>
                    <div>
                      <label htmlFor={`if_${d}`} className="ajuda mb-1 block">Intervalo até</label>
                      <input id={`if_${d}`} name={`intervalo_fim_${d}`} type="time" defaultValue={e?.intervalo_fim ?? ""} className="campo" />
                    </div>
                  </div>
                </fieldset>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button type="submit" className="btn btn-primario">Salvar horários</button>
            <p className="ajuda">
              Outras pausas, feriados e folgas: use{" "}
              <Link href="/admin/agenda/bloqueios" className="text-rose-600 underline underline-offset-4">Bloqueios de agenda</Link>.
            </p>
          </div>
        </form>
      </section>

      {/* -------------------------------------------------- Datas especiais */}
      <section id="datas-especiais" className="cartao mb-6 scroll-mt-24">
        <h2 className="mb-1 text-xl">Datas especiais</h2>
        <p className="mb-4 text-sm text-tinta-suave">
          Expediente diferente do padrão em um dia específico (ex.: atender em um domingo ou sair mais cedo).
        </p>
        <form action={salvarDataEspecial} className="grid grid-cols-2 items-end gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="col-span-2 sm:col-span-1 lg:col-span-2">
            <label htmlFor="e-data" className="rotulo">Data</label>
            <input id="e-data" name="data" type="date" min={hoje()} required className="campo" />
          </div>
          <div>
            <label htmlFor="e-hi" className="rotulo">Início</label>
            <input id="e-hi" name="horario_inicio" type="time" required className="campo" />
          </div>
          <div>
            <label htmlFor="e-hf" className="rotulo">Fim</label>
            <input id="e-hf" name="horario_fim" type="time" required className="campo" />
          </div>
          <div>
            <label htmlFor="e-ii" className="rotulo">Intervalo de</label>
            <input id="e-ii" name="intervalo_inicio" type="time" className="campo" />
          </div>
          <div>
            <label htmlFor="e-if" className="rotulo">Intervalo até</label>
            <input id="e-if" name="intervalo_fim" type="time" className="campo" />
          </div>
          <div className="col-span-2 sm:col-span-2 lg:col-span-4">
            <label htmlFor="e-motivo" className="rotulo">Descrição (opcional)</label>
            <input id="e-motivo" name="motivo" maxLength={120} className="campo" />
          </div>
          <div className="col-span-2 sm:col-span-1 lg:col-span-2">
            <button type="submit" className="btn btn-primario w-full">Adicionar data</button>
          </div>
        </form>
        <div className="mt-4">
          {especiais.length === 0 ? (
            <Vazio>Nenhuma data especial futura.</Vazio>
          ) : (
            <ul className="divide-y divide-linha/70">
              {especiais.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-medium first-letter:uppercase">
                      {formatarDataComDia(e.data)} · {e.horario_inicio} – {e.horario_fim}
                      {e.intervalo_inicio ? ` (intervalo ${e.intervalo_inicio} – ${e.intervalo_fim})` : ""}
                    </p>
                    {e.motivo && <p className="text-tinta-suave">{e.motivo}</p>}
                  </div>
                  <form action={removerDataEspecial}>
                    <input type="hidden" name="id" value={e.id} />
                    <button type="submit" className="btn btn-sm btn-claro">Remover</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------------ Regras */}
      <section id="regras" className="cartao mb-6 scroll-mt-24">
        <h2 className="mb-4 text-xl">Regras de agendamento</h2>
        <form action={salvarRegras} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="antecedencia" className="rotulo">Antecedência mínima para agendar (minutos)</label>
            <input id="antecedencia" name="antecedencia_minima_minutos" type="number" min={0} max={10080} required defaultValue={cfg.antecedencia_minima_minutos} className="campo" />
            <p className="ajuda">Ex.: 120 = clientes só agendam horários a partir de 2h à frente.</p>
          </div>
          <div>
            <label htmlFor="cancelamento" className="rotulo">Antecedência mínima para cancelar (minutos)</label>
            <input id="cancelamento" name="cancelamento_antecedencia_minutos" type="number" min={0} max={10080} required defaultValue={cfg.cancelamento_antecedencia_minutos} className="campo" />
            <p className="ajuda">Política de cancelamento pelo WhatsApp. 0 = pode cancelar a qualquer momento.</p>
          </div>
          <div>
            <label htmlFor="janela" className="rotulo">Agenda aberta para os próximos (dias)</label>
            <input id="janela" name="janela_agendamento_dias" type="number" min={1} max={180} required defaultValue={cfg.janela_agendamento_dias} className="campo" />
          </div>
          <div>
            <label htmlFor="passo" className="rotulo">Intervalo entre horários oferecidos (minutos)</label>
            <input id="passo" name="passo_minutos" type="number" min={5} max={240} step={5} required defaultValue={cfg.passo_minutos} className="campo" />
            <p className="ajuda">Ex.: 30 = 09:00, 09:30, 10:00…</p>
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn btn-primario">Salvar regras</button>
          </div>
        </form>
      </section>

      {/* -------------------------------------------------------------- Site */}
      <section id="site" className="cartao scroll-mt-24">
        <h2 className="mb-4 text-xl">Informações do site</h2>
        <form action={salvarSite} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="nome_profissional" className="rotulo">Nome profissional</label>
            <input id="nome_profissional" name="nome_profissional" maxLength={60} defaultValue={cfg.nome_profissional} className="campo" />
            <p className="ajuda">Aparece no site e nas mensagens do WhatsApp.</p>
          </div>
          <div>
            <label htmlFor="whatsapp_numero" className="rotulo">WhatsApp de atendimento</label>
            <input
              id="whatsapp_numero"
              name="whatsapp_numero"
              type="tel"
              inputMode="tel"
              maxLength={25}
              placeholder="(11) 99999-8888"
              defaultValue={cfg.whatsapp_numero ? formatarTelefone(cfg.whatsapp_numero) : ""}
              className="campo"
            />
            <p className="ajuda">O mesmo número conectado à API do WhatsApp. Usado nos botões do site.</p>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="frase" className="rotulo">Frase de apresentação</label>
            <input id="frase" name="frase" maxLength={200} defaultValue={cfg.frase} className="campo" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="sobre_texto" className="rotulo">Sobre mim</label>
            <textarea id="sobre_texto" name="sobre_texto" rows={5} maxLength={2000} defaultValue={cfg.sobre_texto} className="campo" />
          </div>
          <div>
            <label htmlFor="experiencia" className="rotulo">Experiência (destaque curto)</label>
            <input id="experiencia" name="experiencia" maxLength={120} placeholder="Ex.: 8 anos de experiência" defaultValue={cfg.experiencia} className="campo" />
          </div>
          <div>
            <label htmlFor="instagram" className="rotulo">Instagram</label>
            <input id="instagram" name="instagram" maxLength={120} placeholder="@seuperfil" defaultValue={cfg.instagram} className="campo" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="diferenciais" className="rotulo">Diferenciais do atendimento (um por linha)</label>
            <textarea id="diferenciais" name="diferenciais" rows={4} maxLength={800} defaultValue={cfg.diferenciais.join("\n")} className="campo" />
          </div>
          <div>
            <label htmlFor="endereco" className="rotulo">Endereço ou região de atendimento</label>
            <textarea id="endereco" name="endereco" rows={2} maxLength={300} defaultValue={cfg.endereco} className="campo" />
          </div>
          <div>
            <label htmlFor="maps_url" className="rotulo">Link do Google Maps (opcional)</label>
            <input id="maps_url" name="maps_url" type="url" maxLength={500} placeholder="https://maps.app.goo.gl/..." defaultValue={cfg.maps_url} className="campo" />
          </div>
          <div>
            <label htmlFor="foto_principal" className="rotulo">Foto principal (topo do site)</label>
            {fotoPrincipal && (
              <div className="mb-2 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fotoPrincipal} alt="Foto principal atual" className="h-20 w-16 rounded-xl object-cover" />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="remover_foto_principal" className="h-4 w-4 accent-rose-500" /> Remover
                </label>
              </div>
            )}
            <input id="foto_principal" name="foto_principal" type="file" accept="image/jpeg,image/png,image/webp" className={ARQUIVO} />
          </div>
          <div>
            <label htmlFor="foto_sobre" className="rotulo">Foto da seção “Sobre mim”</label>
            {fotoSobre && (
              <div className="mb-2 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fotoSobre} alt="Foto atual da seção sobre" className="h-20 w-20 rounded-full object-cover" />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="remover_foto_sobre" className="h-4 w-4 accent-rose-500" /> Remover
                </label>
              </div>
            )}
            <input id="foto_sobre" name="foto_sobre" type="file" accept="image/jpeg,image/png,image/webp" className={ARQUIVO} />
          </div>
          <p className="ajuda sm:col-span-2">Envie uma foto por vez (até 4 MB cada, JPG/PNG/WebP).</p>
          <div className="sm:col-span-2">
            <button type="submit" className="btn btn-primario">Salvar informações do site</button>
          </div>
        </form>
      </section>
    </div>
  );
}
