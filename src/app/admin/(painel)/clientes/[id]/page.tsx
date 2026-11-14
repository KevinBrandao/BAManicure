import Link from "next/link";
import { notFound } from "next/navigation";
import { excluirDadosCliente, salvarCliente } from "../../../actions";
import { exigirAdmin } from "@/lib/auth";
import { agendamentosDoCliente } from "@/lib/agenda";
import { buscarCliente, dataHoraCurta } from "@/lib/painel";
import { formatarData, formatarPreco } from "@/lib/tz";
import { Aviso, Cabecalho, formatarTelefone, SeloStatus, Vazio, Voltar, type Busca } from "@/components/admin/Ui";
import { BotaoConfirmar } from "@/components/admin/Cliente";

export const metadata = { title: "Cliente" };

export default async function DetalheCliente({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Busca }) {
  await exigirAdmin();
  const { id } = await params;
  const busca = await searchParams;
  const c = await buscarCliente(id);
  if (!c) notFound();
  const historico = await agendamentosDoCliente(c.id);

  return (
    <div className="max-w-3xl">
      <Voltar href="/admin/clientes">Clientes</Voltar>
      <Cabecalho titulo={c.nome} descricao={`${formatarTelefone(c.telefone)} · cliente desde ${dataHoraCurta(c.created_at).slice(0, 5)}`}>
        <Link href={`/admin/agenda/novo?cliente=${c.id}`} className="btn btn-primario">Agendar</Link>
        <Link href={`/admin/whatsapp/${c.telefone}`} className="btn btn-claro">Conversa</Link>
      </Cabecalho>
      <Aviso busca={busca} />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <div className="cartao p-4">
          <p className="text-xs tracking-wider text-tinta-suave uppercase">Atendimentos</p>
          <p className="mt-1 font-titulo text-2xl">{c.total}</p>
        </div>
        <div className="cartao p-4">
          <p className="text-xs tracking-wider text-tinta-suave uppercase">Último</p>
          <p className="mt-1 font-medium">{dataHoraCurta(c.ultimo)}</p>
        </div>
        <div className="cartao p-4">
          <p className="text-xs tracking-wider text-tinta-suave uppercase">Próximo</p>
          <p className="mt-1 font-medium">{dataHoraCurta(c.proximo)}</p>
        </div>
      </div>

      <form action={salvarCliente} className="cartao mb-5 space-y-4">
        <input type="hidden" name="id" value={c.id} />
        <div>
          <label htmlFor="nome" className="rotulo">Nome</label>
          <input id="nome" name="nome" required maxLength={80} defaultValue={c.nome} className="campo" />
        </div>
        <div>
          <label htmlFor="observacoes" className="rotulo">Observações internas</label>
          <textarea id="observacoes" name="observacoes" rows={3} maxLength={1000} defaultValue={c.observacoes ?? ""} className="campo" />
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="aceita_lembretes" defaultChecked={c.aceita_lembretes} className="h-4 w-4 accent-rose-500" />
          <span>Aceita receber lembretes pelo WhatsApp</span>
        </label>
        <p className="ajuda">
          {c.consentimento_em ? `Consentimento registrado em ${dataHoraCurta(c.consentimento_em)}.` : "Sem consentimento registrado pelo WhatsApp (cliente cadastrada pelo painel)."}
        </p>
        <button type="submit" className="btn btn-primario">Salvar</button>
      </form>

      <section className="cartao mb-5" aria-labelledby="t-hist">
        <h2 id="t-hist" className="mb-3 text-xl">Histórico de atendimentos</h2>
        {historico.length === 0 ? (
          <Vazio>Sem agendamentos.</Vazio>
        ) : (
          <ul className="divide-y divide-linha/70">
            {historico.map((a) => (
              <li key={a.id}>
                <Link href={`/admin/agenda/${a.id}`} className="flex items-center justify-between gap-3 px-1 py-3 text-sm hover:bg-nude-50">
                  <div>
                    <p className="font-medium">
                      {formatarData(a.data)} às {a.hora} · {a.servico_nome}
                    </p>
                    <p className="text-tinta-suave">{formatarPreco(a.preco_centavos)}</p>
                  </div>
                  <SeloStatus status={a.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="cartao border-red-200" aria-labelledby="t-lgpd">
        <h2 id="t-lgpd" className="mb-2 text-xl">Privacidade (LGPD)</h2>
        <p className="mb-3 text-sm text-tinta-suave">
          Use quando a cliente pedir a exclusão dos seus dados. Remove nome, telefone, conversas e cancela agendamentos
          futuros. O histórico de atendimentos é mantido de forma anônima.
        </p>
        <form action={excluirDadosCliente}>
          <input type="hidden" name="id" value={c.id} />
          <BotaoConfirmar mensagem={`Excluir definitivamente os dados pessoais de ${c.nome}? Esta ação não pode ser desfeita.`} className="btn btn-perigo">
            Excluir dados pessoais
          </BotaoConfirmar>
        </form>
      </section>
    </div>
  );
}
