import { adicionarFoto, removerFoto } from "../../actions";
import { exigirAdmin } from "@/lib/auth";
import { urlImagem } from "@/lib/imagens";
import { listarGaleria } from "@/lib/site";
import { Aviso, Cabecalho, Vazio, type Busca } from "@/components/admin/Ui";
import { BotaoConfirmar } from "@/components/admin/Cliente";

export const metadata = { title: "Galeria" };

export default async function GaleriaAdmin({ searchParams }: { searchParams: Busca }) {
  await exigirAdmin();
  const busca = await searchParams;
  const fotos = await listarGaleria();
  const categorias = Array.from(new Set(fotos.map((f) => f.categoria)));

  return (
    <>
      <Cabecalho titulo="Galeria" descricao="Fotos dos trabalhos exibidas no site, organizadas por categoria." />
      <Aviso busca={busca} />

      <form action={adicionarFoto} className="cartao mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1.5fr_auto] lg:items-end">
        <div>
          <label htmlFor="imagem" className="rotulo">Foto</label>
          <input id="imagem" name="imagem" type="file" required accept="image/jpeg,image/png,image/webp" className="campo file:mr-3 file:rounded-full file:border-0 file:bg-nude-100 file:px-3 file:py-1 file:text-sm" />
        </div>
        <div>
          <label htmlFor="categoria" className="rotulo">Categoria</label>
          <input id="categoria" name="categoria" list="categorias" maxLength={40} placeholder="Ex.: Alongamento" className="campo" />
          <datalist id="categorias">
            {categorias.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <label htmlFor="legenda" className="rotulo">Legenda (opcional)</label>
          <input id="legenda" name="legenda" maxLength={120} className="campo" />
        </div>
        <button type="submit" className="btn btn-primario">Adicionar</button>
        <p className="ajuda sm:col-span-2 lg:col-span-4">JPG, PNG ou WebP, até 4 MB. Publique apenas fotos com autorização da cliente.</p>
      </form>

      {fotos.length === 0 ? (
        <Vazio>Nenhuma foto na galeria. A seção só aparece no site quando houver fotos.</Vazio>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {fotos.map((f) => (
            <li key={f.id} className="overflow-hidden rounded-2xl border border-linha bg-white shadow-cartao">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urlImagem(f.image_id)!} alt={f.legenda ?? ""} loading="lazy" className="aspect-square w-full object-cover" />
              <div className="p-3">
                <p className="text-sm font-medium">{f.categoria}</p>
                {f.legenda && <p className="truncate text-xs text-tinta-suave">{f.legenda}</p>}
                <form action={removerFoto} className="mt-2">
                  <input type="hidden" name="id" value={f.id} />
                  <BotaoConfirmar mensagem="Remover esta foto da galeria?" className="btn btn-sm btn-perigo w-full">
                    Remover
                  </BotaoConfirmar>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
