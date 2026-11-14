import Link from "next/link";
import { notFound } from "next/navigation";
import { encerrarAtendimentoHumano, enviarMensagemManual } from "../../../actions";
import { exigirAdmin } from "@/lib/auth";
import { buscarClientePorTelefone } from "@/lib/agenda";
import { conversaEmAtendimentoHumano, dataHoraCurta, mensagensDaConversa } from "@/lib/painel";
import { dentroDaJanela24h } from "@/lib/whatsapp/envio";
import { Aviso, Cabecalho, formatarTelefone, Selo, Vazio, Voltar, type Busca } from "@/components/admin/Ui";
import { AtualizacaoAutomatica } from "@/components/admin/Cliente";

export const metadata = { title: "Conversa" };

const STATUS_MSG: Record<string, string> = { ENVIADA: "enviada", ENTREGUE: "entregue", LIDA: "lida", FALHA: "falhou" };

export default async function Conversa({ params, searchParams }: { params: Promise<{ telefone: string }>; searchParams: Busca }) {
  await exigirAdmin();
  const { telefone } = await params;
  if (!/^[0-9]{8,15}$/.test(telefone)) notFound();
  const busca = await searchParams;

  const cliente = await buscarClientePorTelefone(telefone);
  const mensagens = await mensagensDaConversa(telefone);
  const humano = await conversaEmAtendimentoHumano(telefone);
  const janelaAberta = await dentroDaJanela24h(telefone);

  return (
    <div className="max-w-2xl">
      <AtualizacaoAutomatica segundos={15} />
      <Voltar href="/admin/whatsapp">WhatsApp</Voltar>
      <Cabecalho titulo={cliente?.nome ?? formatarTelefone(telefone)} descricao={formatarTelefone(telefone)}>
        {cliente && (
          <Link href={`/admin/clientes/${cliente.id}`} className="btn btn-claro">
            Ver cliente
          </Link>
        )}
      </Cabecalho>
      <Aviso busca={busca} />

      {humano && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>Esta cliente pediu para falar com você. A assistente virtual está em silêncio nesta conversa.</span>
          <form action={encerrarAtendimentoHumano}>
            <input type="hidden" name="telefone" value={telefone} />
            <input type="hidden" name="retorno" value={`/admin/whatsapp/${telefone}`} />
            <button type="submit" className="btn btn-sm btn-claro">Reativar assistente</button>
          </form>
        </div>
      )}

      <section className="cartao mb-4" aria-label="Mensagens">
        {mensagens.length === 0 ? (
          <Vazio>Nenhuma mensagem com este número.</Vazio>
        ) : (
          <ol className="space-y-3">
            {mensagens.map((m) => {
              const saida = m.direcao === "SAIDA";
              return (
                <li key={m.id} className={`flex ${saida ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                      saida
                        ? m.status === "FALHA"
                          ? "border border-red-200 bg-red-50"
                          : "bg-rose-100"
                        : "border border-linha bg-white"
                    }`}
                  >
                    <p className="break-words whitespace-pre-line">{m.mensagem}</p>
                    <p className="mt-1 text-right text-[11px] text-tinta-suave">
                      {dataHoraCurta(m.created_at)}
                      {saida ? ` · ${STATUS_MSG[m.status] ?? m.status.toLowerCase()}` : ""}
                    </p>
                    {m.erro && <p className="mt-1 text-xs text-red-700">{m.erro}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="cartao" aria-labelledby="t-responder">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="t-responder" className="text-lg">Responder</h2>
          <Selo cor={janelaAberta ? "verde" : "cinza"}>{janelaAberta ? "janela de 24h aberta" : "janela de 24h fechada"}</Selo>
        </div>
        {janelaAberta ? (
          <form action={enviarMensagemManual} className="space-y-3">
            <input type="hidden" name="telefone" value={telefone} />
            <label htmlFor="mensagem" className="sr-only">Mensagem</label>
            <textarea id="mensagem" name="mensagem" rows={3} required maxLength={2000} placeholder="Escreva sua mensagem…" className="campo" />
            <button type="submit" className="btn btn-primario">Enviar pelo WhatsApp</button>
          </form>
        ) : (
          <p className="text-sm text-tinta-suave">
            O WhatsApp só permite mensagens livres até 24 horas após a última mensagem da cliente. Depois disso, apenas
            templates aprovados (como os lembretes) podem ser enviados.
          </p>
        )}
      </section>
    </div>
  );
}
