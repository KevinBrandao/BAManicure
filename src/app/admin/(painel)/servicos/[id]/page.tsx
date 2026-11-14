import { notFound } from "next/navigation";
import { salvarServico } from "../../../actions";
import { exigirAdmin } from "@/lib/auth";
import { buscarServico } from "@/lib/agenda";
import { urlImagem } from "@/lib/imagens";
import { Aviso, Cabecalho, Voltar, type Busca } from "@/components/admin/Ui";

export const metadata = { title: "Serviço" };

export default async function FormularioServico({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Busca }) {
  await exigirAdmin();
  const { id } = await params;
  const busca = await searchParams;
  const novo = id === "novo";
  const s = novo ? null : await buscarServico(id);
  if (!novo && !s) notFound();
  const img = urlImagem(s?.image_id);

  return (
    <div className="max-w-2xl">
      <Voltar href="/admin/servicos">Serviços</Voltar>
      <Cabecalho titulo={novo ? "Novo serviço" : `Editar: ${s!.nome}`} />
      <Aviso busca={busca} />

      <form action={salvarServico} className="cartao grid gap-4 sm:grid-cols-2">
        {s && <input type="hidden" name="id" value={s.id} />}
        <div className="sm:col-span-2">
          <label htmlFor="nome" className="rotulo">Nome</label>
          <input id="nome" name="nome" required maxLength={80} defaultValue={s?.nome ?? ""} className="campo" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="descricao" className="rotulo">Descrição</label>
          <textarea id="descricao" name="descricao" rows={3} maxLength={400} defaultValue={s?.descricao ?? ""} className="campo" />
        </div>
        <div>
          <label htmlFor="preco" className="rotulo">Preço (R$)</label>
          <input
            id="preco"
            name="preco"
            required
            inputMode="decimal"
            placeholder="35,00"
            defaultValue={s ? (s.preco_centavos / 100).toFixed(2).replace(".", ",") : ""}
            className="campo"
          />
        </div>
        <div>
          <label htmlFor="duracao_minutos" className="rotulo">Duração (minutos)</label>
          <input id="duracao_minutos" name="duracao_minutos" type="number" required min={5} max={720} step={5} defaultValue={s?.duracao_minutos ?? 60} className="campo" />
        </div>
        <div>
          <label htmlFor="intervalo_minutos" className="rotulo">Intervalo adicional (minutos)</label>
          <input id="intervalo_minutos" name="intervalo_minutos" type="number" required min={0} max={240} step={5} defaultValue={s?.intervalo_minutos ?? 0} className="campo" />
          <p className="ajuda">Tempo reservado após o atendimento (limpeza, preparo).</p>
        </div>
        <div>
          <label htmlFor="ordem" className="rotulo">Ordem de exibição</label>
          <input id="ordem" name="ordem" type="number" required min={0} max={999} defaultValue={s?.ordem ?? 0} className="campo" />
          <p className="ajuda">Menor número aparece primeiro.</p>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="imagem" className="rotulo">Imagem</label>
          {img && (
            <div className="mb-2 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img} alt="Imagem atual" className="h-20 w-20 rounded-xl object-cover" />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="remover_imagem" className="h-4 w-4 accent-rose-500" /> Remover imagem atual
              </label>
            </div>
          )}
          <input id="imagem" name="imagem" type="file" accept="image/jpeg,image/png,image/webp" className="campo file:mr-3 file:rounded-full file:border-0 file:bg-nude-100 file:px-3 file:py-1 file:text-sm" />
          <p className="ajuda">JPG, PNG ou WebP, até 4 MB.</p>
        </div>
        <label className="flex items-center gap-2 sm:col-span-2">
          <input type="checkbox" name="ativo" defaultChecked={s?.ativo ?? true} className="h-4 w-4 accent-rose-500" />
          <span>Ativo (aparece no site e pode ser agendado)</span>
        </label>
        <div className="sm:col-span-2">
          <button type="submit" className="btn btn-primario">{novo ? "Cadastrar serviço" : "Salvar alterações"}</button>
        </div>
      </form>
    </div>
  );
}
