import type { Metadata } from "next";
import Link from "next/link";
import Galeria from "@/components/site/Galeria";
import {
  IconeCheck,
  IconeInstagram,
  IconeLocal,
  IconeRelogio,
  IconeWhatsApp,
  Ornamento,
} from "@/components/Icones";
import { lerDadosSite, type HorarioDia } from "@/lib/site";
import { lerConfiguracoes, linkWhatsApp, nomeExibicao } from "@/lib/settings";
import { urlImagem } from "@/lib/imagens";
import { modoLanding } from "@/lib/conteudo";
import { DIAS_SEMANA, formatarDuracao, formatarPreco } from "@/lib/tz";

// conteúdo vem do banco e deve refletir o painel imediatamente
export const dynamic = "force-dynamic";

/** Metadados estáticos usados quando as configurações não podem ser lidas. */
const METADADOS_PADRAO: Metadata = {
  title: "Manicure e nail design com hora marcada",
  description: "Conheça os serviços e agende seu horário pelo WhatsApp.",
  alternates: { canonical: "/" },
};

export async function generateMetadata(): Promise<Metadata> {
  // Os metadados não podem derrubar a página: se o banco estiver indisponível,
  // o erro é registrado e a página segue com metadados estáticos. O conteúdo
  // em si continua dependendo do banco e mostra a tela de indisponibilidade.
  let cfg: Awaited<ReturnType<typeof lerConfiguracoes>>;
  try {
    cfg = await lerConfiguracoes();
  } catch (err) {
    console.error("[site] não foi possível ler as configurações para os metadados:", err);
    return METADADOS_PADRAO;
  }
  const nome = nomeExibicao(cfg);
  const titulo = `${nome} — Manicure e nail design com hora marcada`;
  const descricao = `${cfg.frase} Conheça os serviços, veja fotos dos trabalhos e agende seu horário pelo WhatsApp.`;
  const foto = urlImagem(cfg.foto_principal_id);
  return {
    title: titulo,
    description: descricao,
    alternates: { canonical: "/" },
    openGraph: {
      title: titulo,
      description: descricao,
      type: "website",
      locale: "pt_BR",
      images: foto ? [foto] : undefined,
    },
  };
}

function instagramUrl(valor: string): { url: string; rotulo: string } | null {
  const v = valor.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) {
    return { url: v, rotulo: `@${v.replace(/\/+$/, "").split("/").pop()}` };
  }
  const usuario = v.replace(/^@/, "");
  return { url: `https://www.instagram.com/${encodeURIComponent(usuario)}`, rotulo: `@${usuario}` };
}

const DIA_SCHEMA = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function capitalizar(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function LinhaHorario({ h }: { h: HorarioDia }) {
  return (
    <li className="flex items-baseline justify-between gap-4 border-b border-linha/70 py-3 last:border-0">
      <span className="font-medium">{capitalizar(DIAS_SEMANA[h.dia_semana])}</span>
      {h.ativo ? (
        <span className="text-right text-tinta-suave">
          {h.inicio} – {h.fim}
          {h.intervalo_inicio && h.intervalo_fim && (
            <span className="block text-xs">
              intervalo {h.intervalo_inicio} – {h.intervalo_fim}
            </span>
          )}
        </span>
      ) : (
        <span className="text-tinta-suave/70">Fechado</span>
      )}
    </li>
  );
}

export default async function PaginaInicial() {
  const { cfg, servicos, galeria, expediente } = await lerDadosSite();
  const nome = nomeExibicao(cfg);
  const whats = linkWhatsApp(cfg, "Olá! Gostaria de agendar um horário.");
  const insta = instagramUrl(cfg.instagram);
  const logo = urlImagem(cfg.logo_id);
  const fotoPrincipal = urlImagem(cfg.foto_principal_id);
  const fotoSobre = urlImagem(cfg.foto_sobre_id);
  // semana começando na segunda-feira
  const semana = [...expediente.filter((h) => h.dia_semana !== 0), ...expediente.filter((h) => h.dia_semana === 0)];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BeautySalon",
    name: nome,
    description: cfg.frase,
    url: process.env.NEXT_PUBLIC_SITE_URL || undefined,
    image: fotoPrincipal ? `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}${fotoPrincipal}` : undefined,
    telephone: cfg.whatsapp_numero ? `+${cfg.whatsapp_numero}` : undefined,
    address: cfg.endereco || undefined,
    openingHoursSpecification: expediente
      .filter((h) => h.ativo)
      .map((h) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: DIA_SCHEMA[h.dia_semana],
        opens: h.inicio,
        closes: h.fim,
      })),
  };

  const navegacao = [
    { href: "#sobre", rotulo: "Sobre" },
    { href: "#servicos", rotulo: "Serviços" },
    ...(galeria.length > 0 ? [{ href: "#galeria", rotulo: "Galeria" }] : []),
    { href: "#horarios", rotulo: "Horários" },
    { href: "#contato", rotulo: "Contato" },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      {/* ------------------------------------------------------------ Cabeçalho */}
      <header className="sticky top-0 z-40 border-b border-linha/70 bg-creme/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <a href="#inicio" className="flex items-center gap-2.5 font-titulo text-xl tracking-wide text-tinta">
            {logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" width={40} height={40} className="h-10 w-10 rounded-full object-cover" />
            )}
            {nome}
          </a>
          <nav aria-label="Seções do site" className="hidden items-center gap-7 text-sm text-tinta-suave md:flex">
            {navegacao.map((n) => (
              <a key={n.href} href={n.href} className="transition hover:text-rose-600">
                {n.rotulo}
              </a>
            ))}
          </nav>
          {whats && (
            <a href={whats} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-primario">
              Agendar
            </a>
          )}
        </div>
      </header>

      <main id="inicio">
        {/* ---------------------------------------------------------------- Hero */}
        <section className="relative overflow-hidden bg-gradient-to-b from-nude-100 via-nude-50 to-creme">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-14 md:grid-cols-2 md:py-24">
            <div className="text-center md:text-left">
              <p className="sobretitulo">Manicure • Nail design</p>
              <h1 className="text-4xl leading-tight text-tinta sm:text-5xl lg:text-6xl">{nome}</h1>
              <div className="filete mx-auto my-6 md:mx-0" />
              <p className="mx-auto max-w-md text-lg leading-relaxed text-tinta-suave md:mx-0">{cfg.frase}</p>
              <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center md:justify-start">
                {whats ? (
                  <>
                    <a href={whats} target="_blank" rel="noopener noreferrer" className="btn btn-primario w-full sm:w-auto">
                      Agendar meu horário
                    </a>
                    <a href={whats} target="_blank" rel="noopener noreferrer" className="btn btn-whats w-full sm:w-auto">
                      <IconeWhatsApp /> Chamar no WhatsApp
                    </a>
                  </>
                ) : (
                  <a href="#servicos" className="btn btn-primario w-full sm:w-auto">
                    Conhecer os serviços
                  </a>
                )}
              </div>
              <p className="mt-5 text-sm text-tinta-suave">Atendimento somente com hora marcada.</p>
            </div>

            <div className="relative mx-auto w-full max-w-sm md:max-w-md">
              <div className="absolute -top-4 -right-4 h-full w-full rounded-[2.5rem] border border-ouro-300" aria-hidden="true" />
              <div className="relative aspect-square overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-rose-100 via-nude-100 to-nude-200 shadow-suave">
                {fotoPrincipal ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fotoPrincipal} alt={nome} className="h-full w-full object-cover" fetchPriority="high" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-ouro-400">
                    <Ornamento className="h-28 w-28" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ Sobre mim */}
        <section id="sobre" className="mx-auto max-w-6xl px-5 py-16 md:py-24">
          <div className="grid items-center gap-10 md:grid-cols-5">
            <div className="md:col-span-2">
              <div className="mx-auto aspect-square max-w-xs overflow-hidden rounded-full bg-gradient-to-br from-nude-100 to-rose-100 shadow-suave">
                {fotoSobre ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fotoSobre} alt={nome} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-ouro-400">
                    <Ornamento className="h-20 w-20" />
                  </div>
                )}
              </div>
            </div>
            <div className="md:col-span-3">
              <p className="sobretitulo">Sobre mim</p>
              <h2 className="titulo-secao">Cuidado em cada detalhe</h2>
              <div className="filete my-5" />
              {cfg.sobre_texto ? (
                cfg.sobre_texto.split(/\n{2,}/).map((p, i) => (
                  <p key={i} className="mb-4 leading-relaxed whitespace-pre-line text-tinta-suave">
                    {p}
                  </p>
                ))
              ) : (
                <p className="mb-4 leading-relaxed text-tinta-suave">
                  Atendimento individual, com hora marcada, para você relaxar e sair com as unhas do jeito que imaginou.
                </p>
              )}
              {cfg.experiencia && (
                <p className="mb-4 inline-flex rounded-full bg-nude-100 px-4 py-1.5 text-sm text-ouro-600">{cfg.experiencia}</p>
              )}
              {cfg.diferenciais.length > 0 && (
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {cfg.diferenciais.map((d) => (
                    <li key={d} className="flex items-start gap-2.5 text-tinta">
                      <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-rose-100 text-rose-600">
                        <IconeCheck className="h-3.5 w-3.5" />
                      </span>
                      {d}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- Serviços */}
        <section id="servicos" className="bg-nude-50 py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-5">
            <div className="mb-12 text-center">
              <p className="sobretitulo">Serviços</p>
              <h2 className="titulo-secao">Procedimentos e valores</h2>
              <div className="filete mx-auto mt-5" />
            </div>
            {servicos.length === 0 ? (
              <p className="text-center text-tinta-suave">Os serviços serão divulgados em breve.</p>
            ) : (
              <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {servicos.map((s) => {
                  const img = urlImagem(s.image_id);
                  return (
                    <li key={s.id} className="flex flex-col overflow-hidden rounded-3xl border border-linha bg-white shadow-cartao">
                      <div className="aspect-[3/2] bg-gradient-to-br from-rose-50 via-nude-100 to-nude-200">
                        {img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={img} alt={s.nome} loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-ouro-400">
                            <Ornamento className="h-12 w-12" />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col p-6">
                        <h3 className="text-xl text-tinta">{s.nome}</h3>
                        {s.descricao && <p className="mt-2 text-sm leading-relaxed text-tinta-suave">{s.descricao}</p>}
                        <div className="mt-auto flex items-end justify-between pt-5">
                          <span className="font-titulo text-2xl text-rose-600">{formatarPreco(s.preco_centavos)}</span>
                          <span className="inline-flex items-center gap-1.5 text-sm text-tinta-suave">
                            <IconeRelogio className="h-4 w-4" /> {formatarDuracao(s.duracao_minutos)}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {whats && (
              <div className="mt-12 text-center">
                <a href={whats} target="_blank" rel="noopener noreferrer" className="btn btn-primario">
                  Agendar meu horário
                </a>
              </div>
            )}
          </div>
        </section>

        {/* -------------------------------------------------------------- Galeria */}
        {galeria.length > 0 && (
          <section id="galeria" className="mx-auto max-w-6xl px-5 py-16 md:py-24">
            <div className="mb-10 text-center">
              <p className="sobretitulo">Galeria</p>
              <h2 className="titulo-secao">Trabalhos realizados</h2>
              <div className="filete mx-auto mt-5" />
            </div>
            <Galeria
              fotos={galeria.map((f) => ({
                id: f.id,
                url: urlImagem(f.image_id)!,
                categoria: f.categoria,
                legenda: f.legenda,
              }))}
            />
          </section>
        )}

        {/* ------------------------------------------------- Horários e contato */}
        <section className="bg-gradient-to-b from-nude-50 to-nude-100 py-16 md:py-24">
          <div className="mx-auto grid max-w-6xl gap-8 px-5 md:grid-cols-2">
            <div id="horarios" className="rounded-3xl border border-linha bg-white p-7 shadow-cartao sm:p-9">
              <p className="sobretitulo">Horários de atendimento</p>
              <h2 className="text-2xl text-tinta sm:text-3xl">Quando atendo</h2>
              <ul className="mt-5">
                {semana.map((h) => (
                  <LinhaHorario key={h.dia_semana} h={h} />
                ))}
              </ul>
              <p className="mt-5 flex items-start gap-2 text-sm text-tinta-suave">
                <IconeWhatsApp className="mt-0.5 h-4 w-4 flex-none text-[#1f9d55]" />
                Os agendamentos são feitos pelo WhatsApp: você escolhe o serviço, o dia e o horário disponível em poucos minutos.
              </p>
            </div>

            <div id="contato" className="rounded-3xl border border-linha bg-white p-7 shadow-cartao sm:p-9">
              <p className="sobretitulo">Localização e contato</p>
              <h2 className="text-2xl text-tinta sm:text-3xl">Onde me encontrar</h2>
              <ul className="mt-6 space-y-5">
                <li className="flex items-start gap-3">
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-rose-50 text-rose-600">
                    <IconeLocal />
                  </span>
                  <div>
                    <p className="font-medium">Endereço</p>
                    <p className="whitespace-pre-line text-tinta-suave">
                      {cfg.endereco || "Informado no momento do agendamento."}
                    </p>
                    {cfg.maps_url && (
                      <a href={cfg.maps_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-sm text-rose-600 underline underline-offset-4 hover:text-rose-500">
                        Ver no Google Maps
                      </a>
                    )}
                  </div>
                </li>
                {whats && (
                  <li className="flex items-start gap-3">
                    <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-rose-50 text-rose-600">
                      <IconeWhatsApp />
                    </span>
                    <div>
                      <p className="font-medium">WhatsApp</p>
                      <a href={whats} target="_blank" rel="noopener noreferrer" className="text-rose-600 underline underline-offset-4 hover:text-rose-500">
                        Enviar mensagem
                      </a>
                    </div>
                  </li>
                )}
                {insta && (
                  <li className="flex items-start gap-3">
                    <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-rose-50 text-rose-600">
                      <IconeInstagram />
                    </span>
                    <div>
                      <p className="font-medium">Instagram</p>
                      <a href={insta.url} target="_blank" rel="noopener noreferrer" className="text-rose-600 underline underline-offset-4 hover:text-rose-500">
                        {insta.rotulo}
                      </a>
                    </div>
                  </li>
                )}
              </ul>
              {whats && (
                <a href={whats} target="_blank" rel="noopener noreferrer" className="btn btn-whats mt-8 w-full">
                  <IconeWhatsApp /> Agende seu horário pelo WhatsApp
                </a>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* ---------------------------------------------------------------- Rodapé */}
      <footer className="border-t border-linha bg-creme">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-5 py-8 pb-24 text-center text-sm text-tinta-suave sm:flex-row sm:justify-between sm:text-left md:pb-8">
          <p>
            © {new Date().getFullYear()} {nome}. Todos os direitos reservados.
          </p>
          <nav aria-label="Links do rodapé" className="flex gap-5">
            <Link href="/privacidade" className="underline-offset-4 hover:underline">
              Política de privacidade
            </Link>
            {!modoLanding() && (
              <Link href="/admin" className="underline-offset-4 hover:underline">
                Área da profissional
              </Link>
            )}
          </nav>
        </div>
      </footer>

      {/* ------------------------------------------------ Botão flutuante (CTA) */}
      {whats && (
        <a
          href={whats}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed right-4 bottom-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-full bg-[#1f9d55] px-5 py-3 text-sm font-medium text-white shadow-suave transition hover:bg-[#17803f] sm:right-6 sm:bottom-6"
        >
          <IconeWhatsApp className="h-5 w-5" />
          <span className="sm:hidden">Agendar pelo WhatsApp</span>
          <span className="hidden sm:inline">Agende seu horário pelo WhatsApp</span>
        </a>
      )}
    </>
  );
}
