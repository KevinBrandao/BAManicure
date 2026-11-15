/**
 * Ilustrações dos cards de serviço, escolhidas pelo nome do serviço.
 * São usadas enquanto o serviço não tem uma foto própria cadastrada no painel.
 */

const C = {
  pele: "#f3dccd",
  peleSombra: "#e9c9b6",
  rose: "#cf8f89",
  roseForte: "#b97570",
  roseClaro: "#f6e1df",
  ouro: "#c4a26a",
  ouroForte: "#a98650",
  ouroClaro: "#e6d2ab",
  branco: "#ffffff",
  natural: "#fbeee8",
  foil: "#ebe6e1",
  foilLinha: "#cdc5bd",
};

type Estilo = "esmaltada" | "natural" | "longa";

interface DedoProps {
  x: number;
  largura: number;
  altura: number;
  estilo: Estilo;
  embrulhado?: boolean;
}

/** Um dedo subindo da base do desenho (y = 200), com a unha na ponta. */
function Dedo({ x, largura: w, altura: h, estilo, embrulhado }: DedoProps) {
  const y = 200 - h;
  const m = Math.max(3, w * 0.13); // margem da unha
  const nw = w - 2 * m;
  const cx = x + w / 2;
  const cor = estilo === "natural" ? C.natural : C.rose;

  let unha: React.ReactNode;
  if (estilo === "longa") {
    const ext = w * 0.95; // quanto a unha passa da ponta do dedo
    unha = (
      <>
        <path
          d={`M ${x + m} ${y + w * 0.75} L ${x + m} ${y + 4} Q ${cx} ${y - ext * 1.7} ${x + w - m} ${y + 4} L ${x + w - m} ${y + w * 0.75} Q ${cx} ${y + w * 1.05} ${x + m} ${y + w * 0.75} Z`}
          fill={cor}
        />
        <path d={`M ${x + m + nw * 0.28} ${y + w * 0.5} L ${x + m + nw * 0.28} ${y - ext * 0.15}`} stroke={C.branco} strokeOpacity="0.55" strokeWidth={Math.max(1.5, w * 0.08)} strokeLinecap="round" />
      </>
    );
  } else {
    const nh = w * 0.95;
    unha = (
      <>
        <rect x={x + m} y={y + m} width={nw} height={nh} rx={nw / 2} fill={cor} stroke={estilo === "natural" ? C.peleSombra : "none"} strokeWidth="1" />
        <path d={`M ${x + m + nw * 0.3} ${y + m + nh * 0.25} L ${x + m + nw * 0.3} ${y + m + nh * 0.7}`} stroke={C.branco} strokeOpacity="0.6" strokeWidth={Math.max(1.5, w * 0.08)} strokeLinecap="round" />
      </>
    );
  }

  return (
    <g>
      <rect x={x} y={y} width={w} height={h + w} rx={w / 2} fill={C.pele} />
      <path d={`M ${x + w * 0.2} ${y + w * 1.75} Q ${cx} ${y + w * 1.9} ${x + w * 0.8} ${y + w * 1.75}`} stroke={C.peleSombra} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {unha}
      {embrulhado && (
        <g>
          <rect x={x - 3} y={y - (estilo === "longa" ? w * 0.9 : 3)} width={w + 6} height={w * 1.5 + (estilo === "longa" ? w * 0.9 : 0)} rx="5" fill={C.foil} stroke={C.foilLinha} strokeWidth="1" />
          <path d={`M ${x} ${y + w * 0.35} l ${w * 0.45} ${-w * 0.3} M ${x + w * 0.35} ${y + w * 0.9} l ${w * 0.55} ${-w * 0.4} M ${x + 2} ${y + w * 1.1} l ${w * 0.3} ${-w * 0.2}`} stroke={C.foilLinha} strokeWidth="1" strokeLinecap="round" />
        </g>
      )}
    </g>
  );
}

function Mao({ estilo, embrulhados = [] }: { estilo: Estilo; embrulhados?: number[] }) {
  const alturas = [92, 118, 130, 116, 86];
  return (
    <g>
      {alturas.map((h, i) => (
        <Dedo key={i} x={73 + i * 32} largura={26} altura={h} estilo={estilo} embrulhado={embrulhados.includes(i)} />
      ))}
    </g>
  );
}

function Pe({ estilo }: { estilo: Estilo }) {
  const dedos = [
    { w: 38, h: 78 },
    { w: 27, h: 68 },
    { w: 25, h: 60 },
    { w: 23, h: 52 },
    { w: 21, h: 44 },
  ];
  let x = 71;
  return (
    <g>
      {dedos.map((d, i) => {
        const el = <Dedo key={i} x={x} largura={d.w} altura={d.h} estilo={estilo} />;
        x += d.w + 6;
        return el;
      })}
    </g>
  );
}

/** Reduz um grupo ancorado na base (y = 200) e o desloca na horizontal. */
function Escala({ s, dx, children }: { s: number; dx: number; children: React.ReactNode }) {
  return <g transform={`translate(${dx} ${200 * (1 - s)}) scale(${s})`}>{children}</g>;
}

function Brilho({ x, y, r = 9 }: { x: number; y: number; r?: number }) {
  const k = r * 0.22;
  return (
    <path
      d={`M ${x} ${y - r} Q ${x + k} ${y - k} ${x + r} ${y} Q ${x + k} ${y + k} ${x} ${y + r} Q ${x - k} ${y + k} ${x - r} ${y} Q ${x - k} ${y - k} ${x} ${y - r} Z`}
      fill={C.ouro}
    />
  );
}

function Esmalte({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-12" y="-78" width="24" height="46" rx="5" fill={C.ouro} />
      <rect x="-12" y="-78" width="8" height="46" rx="4" fill={C.ouroClaro} opacity="0.7" />
      <rect x="-8" y="-34" width="16" height="10" fill={C.ouroForte} />
      <rect x="-30" y="-26" width="60" height="62" rx="14" fill={C.rose} />
      <rect x="-22" y="-16" width="9" height="36" rx="4.5" fill={C.branco} opacity="0.45" />
    </g>
  );
}

function Lixa({ x, y, angulo = 28, s = 1 }: { x: number; y: number; angulo?: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angulo}) scale(${s})`}>
      <rect x="-10" y="-70" width="20" height="140" rx="10" fill={C.ouroClaro} stroke={C.ouro} strokeWidth="1.5" />
      <rect x="-5.5" y="-60" width="11" height="120" rx="5.5" fill={C.roseClaro} />
      {[-48, -36, -24, -12, 0, 12, 24, 36, 48].map((d) => (
        <line key={d} x1="-4" y1={d} x2="4" y2={d} stroke={C.rose} strokeOpacity="0.45" strokeWidth="1" />
      ))}
    </g>
  );
}

function Alicate({ x, y, angulo = -24, s = 1 }: { x: number; y: number; angulo?: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angulo}) scale(${s})`} strokeLinecap="round" fill="none">
      {/* cabos */}
      <path d="M -3 4 C -10 30 -22 46 -18 78" stroke={C.ouro} strokeWidth="9" />
      <path d="M 3 4 C 10 30 22 46 18 78" stroke={C.ouroForte} strokeWidth="9" />
      {/* lâminas */}
      <path d="M -2 -2 L -9 -30 L -1 -44 Z" fill={C.ouroClaro} stroke={C.ouroForte} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M 2 -2 L 9 -30 L 1 -44 Z" fill={C.branco} stroke={C.ouroForte} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="0" cy="2" r="5.5" fill={C.branco} stroke={C.ouroForte} strokeWidth="2" />
    </g>
  );
}

function Cabine({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {[-50, -25, 0, 25, 50].map((a) => (
        <line key={a} x1="0" y1="-66" x2="0" y2="-80" stroke={C.ouro} strokeWidth="3" strokeLinecap="round" transform={`rotate(${a})`} />
      ))}
      <path d="M -62 30 L -62 0 A 62 58 0 0 1 62 0 L 62 30 Z" fill={C.branco} stroke={C.ouro} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M -42 30 L -42 8 A 42 34 0 0 1 42 8 L 42 30 Z" fill={C.roseClaro} />
      <rect x="-70" y="28" width="140" height="10" rx="5" fill={C.ouro} />
      <circle cx="0" cy="-34" r="4" fill={C.rose} />
    </g>
  );
}

function PoteDeGel({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {/* pincel */}
      <g transform="rotate(32 0 -20)">
        <rect x="-3.5" y="-104" width="7" height="66" rx="3.5" fill={C.ouro} />
        <rect x="-5" y="-42" width="10" height="12" rx="2" fill={C.ouroForte} />
        <path d="M -5 -30 L 5 -30 L 2 -8 Q 0 -4 -2 -8 Z" fill={C.rose} />
      </g>
      <rect x="-36" y="-2" width="72" height="44" rx="10" fill={C.branco} stroke={C.ouro} strokeWidth="2.5" />
      <rect x="-28" y="12" width="56" height="20" rx="6" fill={C.roseClaro} />
      <rect x="-40" y="-14" width="80" height="16" rx="6" fill={C.rose} />
      <rect x="-32" y="-10" width="28" height="5" rx="2.5" fill={C.branco} opacity="0.5" />
    </g>
  );
}

type Tipo =
  | "manicure"
  | "pedicure"
  | "maniPedi"
  | "cutilagemMao"
  | "cutilagemPe"
  | "esmaltacaoGel"
  | "alongamento"
  | "manutencaoAlongamento"
  | "banhoGel"
  | "manutencaoBanho"
  | "remocaoAlongamento"
  | "remocaoEsmaltacao"
  | "avulso";

function normalizar(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Decide a ilustração pelo nome do serviço; null quando não há uma adequada. */
export function tipoDoServico(nome: string): Tipo | null {
  const n = normalizar(nome);
  const tem = (...termos: string[]) => termos.every((t) => n.includes(t));
  const palavra = (p: string) => new RegExp(`(^|\\s)${p}(\\s|$)`).test(n);

  if (tem("avulso")) return "avulso";
  if (tem("remocao", "alongamento")) return "remocaoAlongamento";
  if (tem("remocao")) return "remocaoEsmaltacao";
  if (tem("manutencao", "banho")) return "manutencaoBanho";
  if (tem("manutencao")) return "manutencaoAlongamento";
  if (tem("banho")) return "banhoGel";
  if (tem("alongamento")) return "alongamento";
  if (tem("esmalt")) return "esmaltacaoGel";
  if (tem("cutilagem")) return palavra("pe") || palavra("pes") ? "cutilagemPe" : "cutilagemMao";
  if (tem("manicure") && tem("pedicure")) return "maniPedi";
  if (tem("pedicure")) return "pedicure";
  if (tem("manicure")) return "manicure";
  return null;
}

function Cena({ tipo }: { tipo: Tipo }) {
  switch (tipo) {
    case "manicure":
      return (
        <>
          <Mao estilo="esmaltada" />
          <Brilho x={48} y={62} />
          <Brilho x={252} y={88} r={7} />
        </>
      );
    case "pedicure":
      return (
        <>
          <Pe estilo="esmaltada" />
          <Brilho x={250} y={70} />
          <Brilho x={52} y={92} r={7} />
        </>
      );
    case "maniPedi":
      return (
        <>
          <Escala s={0.74} dx={-38}>
            <Mao estilo="esmaltada" />
          </Escala>
          <Escala s={0.74} dx={112}>
            <Pe estilo="esmaltada" />
          </Escala>
          <Brilho x={150} y={66} r={8} />
        </>
      );
    case "cutilagemMao":
      return (
        <>
          <Escala s={0.82} dx={-34}>
            <Mao estilo="natural" />
          </Escala>
          <Alicate x={236} y={96} />
        </>
      );
    case "cutilagemPe":
      return (
        <>
          <Escala s={0.9} dx={-44}>
            <Pe estilo="natural" />
          </Escala>
          <Alicate x={240} y={92} />
        </>
      );
    case "esmaltacaoGel":
      return (
        <>
          <Cabine x={112} y={132} />
          <Esmalte x={232} y={134} s={0.92} />
        </>
      );
    case "alongamento":
      return (
        <>
          <Escala s={0.9} dx={15}>
            <Mao estilo="longa" />
          </Escala>
          <Brilho x={44} y={64} />
          <Brilho x={256} y={58} r={7} />
        </>
      );
    case "manutencaoAlongamento":
      return (
        <>
          <Escala s={0.8} dx={-36}>
            <Mao estilo="longa" />
          </Escala>
          <Lixa x={238} y={104} />
        </>
      );
    case "banhoGel":
      return (
        <>
          <Escala s={0.8} dx={-40}>
            <Mao estilo="esmaltada" />
          </Escala>
          <PoteDeGel x={232} y={138} s={0.95} />
        </>
      );
    case "manutencaoBanho":
      return (
        <>
          <Escala s={0.74} dx={-48}>
            <Mao estilo="esmaltada" />
          </Escala>
          <PoteDeGel x={196} y={146} s={0.78} />
          <Lixa x={262} y={104} angulo={18} s={0.86} />
        </>
      );
    case "remocaoAlongamento":
      return (
        <>
          <Escala s={0.8} dx={-36}>
            <Mao estilo="longa" embrulhados={[1, 2]} />
          </Escala>
          <Lixa x={238} y={104} />
        </>
      );
    case "remocaoEsmaltacao":
      return (
        <>
          <Mao estilo="esmaltada" embrulhados={[0, 1, 2]} />
          <Brilho x={254} y={74} r={7} />
        </>
      );
    case "avulso":
      return (
        <>
          <Dedo x={128} largura={44} altura={104} estilo="longa" />
          <Brilho x={92} y={58} />
          <Brilho x={214} y={84} r={7} />
        </>
      );
  }
}

export default function IlustracaoServico({ nome }: { nome: string }) {
  const tipo = tipoDoServico(nome);
  if (!tipo) return null;
  return (
    <svg viewBox="0 0 300 200" role="img" aria-label={`Ilustração: ${nome}`} className="h-full w-full" preserveAspectRatio="xMidYMax slice">
      <circle cx="150" cy="118" r="92" fill="#ffffff" opacity="0.5" />
      <Cena tipo={tipo} />
    </svg>
  );
}
