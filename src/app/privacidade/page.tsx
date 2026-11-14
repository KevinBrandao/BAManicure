import type { Metadata } from "next";
import Link from "next/link";
import { lerConfiguracoes, linkWhatsApp, nomeExibicao } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Política de privacidade",
  description: "Como tratamos os dados pessoais das clientes, conforme a LGPD.",
  alternates: { canonical: "/privacidade" },
};

export default async function Privacidade() {
  const cfg = await lerConfiguracoes();
  const nome = nomeExibicao(cfg);
  const whats = linkWhatsApp(cfg);

  return (
    <main className="mx-auto max-w-2xl px-5 py-14">
      <Link href="/" className="text-sm text-rose-600 underline underline-offset-4">
        ← Voltar ao site
      </Link>
      <h1 className="mt-6 text-4xl text-tinta">Política de privacidade</h1>
      <div className="filete my-6" />

      <div className="space-y-6 leading-relaxed text-tinta-suave [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:text-tinta [&_li]:ml-5 [&_li]:list-disc">
        <p>
          Esta política explica como {nome} trata os dados pessoais das clientes que agendam atendimentos pelo
          WhatsApp, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).
        </p>

        <section>
          <h2>Quais dados são coletados</h2>
          <ul>
            <li>Nome informado por você durante o agendamento.</li>
            <li>Número de WhatsApp de onde a conversa foi iniciada.</li>
            <li>Histórico de agendamentos (serviço, data, horário e situação).</li>
            <li>Mensagens trocadas com a assistente virtual de agendamento.</li>
          </ul>
        </section>

        <section>
          <h2>Para que os dados são usados</h2>
          <ul>
            <li>Realizar, confirmar, consultar e cancelar agendamentos.</li>
            <li>Enviar a confirmação e os lembretes do seu horário.</li>
            <li>Organizar a agenda e o histórico de atendimentos.</li>
          </ul>
          <p className="mt-2">
            Os dados não são vendidos nem usados para publicidade de terceiros. As bases legais são a execução do
            serviço solicitado por você e o seu consentimento para o envio de lembretes.
          </p>
        </section>

        <section>
          <h2>Lembretes e consentimento</h2>
          <p>
            Ao confirmar um agendamento você concorda em receber, pelo WhatsApp, a confirmação e os lembretes
            daquele horário. Você pode parar de receber lembretes a qualquer momento enviando <strong>SAIR</strong>{" "}
            na conversa, e voltar a recebê-los enviando <strong>LEMBRETES</strong>.
          </p>
        </section>

        <section>
          <h2>Compartilhamento</h2>
          <p>
            As mensagens trafegam pela plataforma WhatsApp (Meta), e os dados ficam armazenados em provedores de
            hospedagem e banco de dados contratados para operar este sistema, que atuam como operadores.
          </p>
        </section>

        <section>
          <h2>Seus direitos</h2>
          <p>
            Você pode solicitar a confirmação da existência de tratamento, acesso, correção ou exclusão dos seus
            dados, bem como revogar o consentimento. Basta pedir pelo WhatsApp de atendimento
            {whats ? (
              <>
                {" "}
                (
                <a href={whats} className="text-rose-600 underline underline-offset-4" target="_blank" rel="noopener noreferrer">
                  enviar mensagem
                </a>
                )
              </>
            ) : null}
            .
          </p>
        </section>

        <section>
          <h2>Por quanto tempo os dados são guardados</h2>
          <p>
            Os dados são mantidos enquanto houver relacionamento de atendimento e pelo período necessário ao
            cumprimento de obrigações legais. Após um pedido de exclusão, os dados pessoais são removidos ou
            anonimizados, ressalvadas as hipóteses legais de conservação.
          </p>
        </section>
      </div>
    </main>
  );
}
