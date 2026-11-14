import Link from "next/link";
import { processarLembretesAgora, reenviarLembrete } from "../../actions";
import { exigirAdmin } from "@/lib/auth";
import {
  dataHoraCurta,
  estatisticasWhatsApp,
  listarConversas,
  listarFalhasDeEnvio,
  listarLembretes,
} from "@/lib/painel";
import { statusConexao } from "@/lib/whatsapp/client";
import { Aviso, Cabecalho, formatarTelefone, Selo, Vazio, type Busca } from "@/components/admin/Ui";
import { AtualizacaoAutomatica } from "@/components/admin/Cliente";

export const metadata = { title: "WhatsApp" };

const ROTULO_LEMBRETE: Record<string, string> = { "1H": "1h antes", "30MIN": "30 min antes", "10MIN": "10 min antes" };
const COR: Record<string, "verde" | "vermelho" | "ambar" | "cinza" | "azul"> = {
  PENDENTE: "ambar",
  ENVIANDO: "azul",
  ENVIADO: "verde",
  FALHA: "vermelho",
  CANCELADO: "cinza",
  EXPIRADO: "cinza",
};

function Indicador({ rotulo, valor, alerta }: { rotulo: string; valor: number; alerta?: boolean }) {
  return (
    <div className="cartao p-4">
      <p className="text-xs tracking-wider text-tinta-suave uppercase">{rotulo}</p>
      <p className={`mt-1 font-titulo text-2xl ${alerta && valor > 0 ? "text-red-700" : "text-tinta"}`}>{valor}</p>
    </div>
  );
}

export default async function WhatsApp({ searchParams }: { searchParams: Busca }) {
  await exigirAdmin();
  const busca = await searchParams;
  const conexao = await statusConexao();
  const est = await estatisticasWhatsApp(30);
  const lembretes = await listarLembretes(60);
  const falhas = await listarFalhasDeEnvio(20);
  const conversas = await listarConversas(40);
  const cronOk = Boolean(process.env.CRON_SECRET?.trim());

  return (
    <>
      <AtualizacaoAutomatica segundos={30} />
      <Cabecalho titulo="WhatsApp" descricao="Conexão com a API oficial, mensagens, lembretes e conversas." />
      <Aviso busca={busca} />

      {/* ----------------------------------------------------------- Conexão */}
      <section className="cartao mb-6" aria-labelledby="t-conexao">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="t-conexao" className="text-xl">Status da conexão</h2>
          {conexao.conectado ? (
            <Selo cor="verde">conectado</Selo>
          ) : conexao.configurado ? (
            <Selo cor="vermelho">erro de conexão</Selo>
          ) : (
            <Selo cor="ambar">não configurado</Selo>
          )}
        </div>
        {conexao.conectado && (
          <p className="mt-2 text-sm text-tinta-suave">
            Número {conexao.numero ?? "—"}
            {conexao.nomeVerificado ? ` · ${conexao.nomeVerificado}` : ""}
            {conexao.qualidade ? ` · qualidade ${conexao.qualidade}` : ""}
          </p>
        )}
        {conexao.erro && <p className="mt-2 text-sm text-red-700">{conexao.erro}</p>}
        {!conexao.configurado && (
          <p className="mt-2 text-sm text-tinta-suave">
            As credenciais da WhatsApp Business Cloud API ainda não foram definidas. Enquanto isso, nenhuma mensagem é
            enviada e cada tentativa fica registrada como falha. Siga o guia <code>docs/WHATSAPP.md</code>.
          </p>
        )}
        {(conexao.pendencias.length > 0 || !cronOk) && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-900">
            {conexao.pendencias.map((p) => (
              <li key={p}>{p}</li>
            ))}
            {!cronOk && <li>CRON_SECRET não definido (o agendador de lembretes não consegue chamar o sistema)</li>}
          </ul>
        )}
      </section>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Indicador rotulo="Enviadas (30d)" valor={est.enviadas} />
        <Indicador rotulo="Recebidas (30d)" valor={est.recebidas} />
        <Indicador rotulo="Falhas de envio (30d)" valor={est.falhas} alerta />
        <Indicador rotulo="Lembretes pendentes" valor={est.lembretesPendentes} />
        <Indicador rotulo="Lembretes enviados (30d)" valor={est.lembretesEnviados} />
        <Indicador rotulo="Lembretes com falha" valor={est.lembretesFalha} alerta />
      </div>

      {/* --------------------------------------------------------- Conversas */}
      <section className="cartao mb-6" aria-labelledby="t-conversas">
        <h2 id="t-conversas" className="mb-3 text-xl">Conversas</h2>
        {conversas.length === 0 ? (
          <Vazio>Nenhuma conversa registrada ainda.</Vazio>
        ) : (
          <ul className="divide-y divide-linha/70">
            {conversas.map((c) => (
              <li key={c.telefone}>
                <Link href={`/admin/whatsapp/${c.telefone}`} className="flex items-center justify-between gap-3 px-1 py-3 hover:bg-nude-50">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {c.cliente_nome ?? formatarTelefone(c.telefone)}{" "}
                      {c.estado === "HUMANO" && <Selo cor="ambar">aguardando você</Selo>}
                    </p>
                    <p className="truncate text-sm text-tinta-suave">
                      {c.ultima_direcao === "SAIDA" ? "Você: " : ""}
                      {c.ultima_mensagem.split("\n")[0]}
                    </p>
                  </div>
                  <span className="flex-none text-xs text-tinta-suave">{dataHoraCurta(c.ultima_em)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="ajuda mt-3">
          O histórico é visível apenas para a profissional e pode ser excluído a pedido da cliente (página da cliente → Privacidade).
        </p>
      </section>

      {/* --------------------------------------------------------- Lembretes */}
      <section id="lembretes" className="cartao mb-6 scroll-mt-24" aria-labelledby="t-lembretes">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="t-lembretes" className="text-xl">Status dos lembretes</h2>
          <form action={processarLembretesAgora}>
            <button type="submit" className="btn btn-sm btn-claro">Processar fila agora</button>
          </form>
        </div>
        {lembretes.length === 0 ? (
          <Vazio>Nenhum lembrete nos últimos 7 dias.</Vazio>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabela min-w-[44rem]">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Lembrete</th>
                  <th>Programado</th>
                  <th>Enviado</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lembretes.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Link href={`/admin/agenda/${l.appointment_id}`} className="font-medium text-rose-600 underline-offset-4 hover:underline">
                        {l.cliente_nome}
                      </Link>
                      <span className="block text-xs text-tinta-suave">
                        {l.servico_nome} · {dataHoraCurta(l.inicio)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap">{ROTULO_LEMBRETE[l.tipo]}</td>
                    <td className="whitespace-nowrap">{dataHoraCurta(l.scheduled_at)}</td>
                    <td className="whitespace-nowrap">{dataHoraCurta(l.sent_at)}</td>
                    <td>
                      <Selo cor={COR[l.status] ?? "cinza"}>{l.status.toLowerCase()}</Selo>
                      {l.attempts > 1 && <span className="ml-1 text-xs text-tinta-suave">{l.attempts} tent.</span>}
                      {l.error_message && <span className="mt-1 block max-w-xs text-xs text-red-700">{l.error_message}</span>}
                    </td>
                    <td>
                      {l.status === "FALHA" && (
                        <form action={reenviarLembrete}>
                          <input type="hidden" name="id" value={l.id} />
                          <button type="submit" className="btn btn-sm btn-claro">Tentar de novo</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------ Falhas */}
      <section className="cartao" aria-labelledby="t-falhas">
        <h2 id="t-falhas" className="mb-3 text-xl">Falhas de envio recentes</h2>
        {falhas.length === 0 ? (
          <Vazio>Nenhuma falha de envio registrada. 🎉</Vazio>
        ) : (
          <ul className="divide-y divide-linha/70">
            {falhas.map((f) => (
              <li key={f.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/admin/whatsapp/${f.telefone}`} className="font-medium text-rose-600 underline-offset-4 hover:underline">
                    {f.cliente_nome ?? formatarTelefone(f.telefone)}
                  </Link>
                  <span className="text-xs text-tinta-suave">{dataHoraCurta(f.created_at)}</span>
                </div>
                <p className="mt-0.5 text-red-700">{f.erro}</p>
                <p className="mt-0.5 truncate text-tinta-suave">{f.mensagem.split("\n")[0]}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
