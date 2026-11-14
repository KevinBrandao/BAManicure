import Link from "next/link";
import { alternarServico, excluirServico } from "../../actions";
import { exigirAdmin } from "@/lib/auth";
import { listarServicos } from "@/lib/agenda";
import { urlImagem } from "@/lib/imagens";
import { formatarDuracao, formatarPreco } from "@/lib/tz";
import { Aviso, Cabecalho, Selo, Vazio, type Busca } from "@/components/admin/Ui";
import { BotaoConfirmar } from "@/components/admin/Cliente";

export const metadata = { title: "Serviços" };

export default async function Servicos({ searchParams }: { searchParams: Busca }) {
  await exigirAdmin();
  const busca = await searchParams;
  const servicos = await listarServicos();

  return (
    <>
      <Cabecalho titulo="Serviços" descricao="O que aparece no site e é oferecido no WhatsApp. Só serviços ativos podem ser agendados.">
        <Link href="/admin/servicos/novo" className="btn btn-primario">
          Novo serviço
        </Link>
      </Cabecalho>
      <Aviso busca={busca} />

      {servicos.length === 0 ? (
        <Vazio>Nenhum serviço cadastrado ainda.</Vazio>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {servicos.map((s) => {
            const img = urlImagem(s.image_id);
            return (
              <li key={s.id} className={`cartao flex flex-col ${s.ativo ? "" : "opacity-70"}`}>
                <div className="flex items-start gap-3">
                  <div className="h-16 w-16 flex-none overflow-hidden rounded-xl bg-nude-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {img && <img src={img} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-lg leading-tight">{s.nome}</h2>
                      <Selo cor={s.ativo ? "verde" : "cinza"}>{s.ativo ? "ativo" : "inativo"}</Selo>
                    </div>
                    <p className="mt-1 text-sm text-tinta-suave">
                      {formatarPreco(s.preco_centavos)} · {formatarDuracao(s.duracao_minutos)}
                      {s.intervalo_minutos > 0 ? ` · +${s.intervalo_minutos} min de intervalo` : ""}
                    </p>
                  </div>
                </div>
                {s.descricao && <p className="mt-3 line-clamp-2 text-sm text-tinta-suave">{s.descricao}</p>}
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  <Link href={`/admin/servicos/${s.id}`} className="btn btn-sm btn-claro">
                    Editar
                  </Link>
                  <form action={alternarServico}>
                    <input type="hidden" name="id" value={s.id} />
                    <button type="submit" className="btn btn-sm btn-claro">
                      {s.ativo ? "Desativar" : "Ativar"}
                    </button>
                  </form>
                  <form action={excluirServico}>
                    <input type="hidden" name="id" value={s.id} />
                    <BotaoConfirmar mensagem={`Excluir o serviço "${s.nome}"?`} className="btn btn-sm btn-perigo">
                      Excluir
                    </BotaoConfirmar>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
