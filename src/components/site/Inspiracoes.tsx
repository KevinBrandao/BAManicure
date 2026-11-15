/**
 * Slides do carrossel "Inspire-se": imagens ILUSTRATIVAS de estilos de unha
 * (desenhos, não fotos de atendimentos). Para usar fotos, substitua a lista
 * ESTILOS por imagens — o componente Carrossel aceita qualquer conteúdo.
 */

const PELE = "#f3dccd";
const PELE_SOMBRA = "#e9c9b6";
const OURO = "#c4a26a";
const BRANCO = "#ffffff";

type Deco = "flor" | "pontos" | "coracao" | "brilho" | null;

interface Unha {
  cor: string;
  /** francesinha: ponta em outra cor */
  ponta?: string;
  deco?: Deco;
}

interface DedoProps extends Unha {
  x: number;
  w: number;
  h: number;
  longa?: boolean;
}

const BASE = 300; // altura do desenho (viewBox 400 x 300)

function Decoracao({ tipo, cx, cy, r }: { tipo: Deco; cx: number; cy: number; r: number }) {
  if (tipo === "pontos") {
    return (
      <g fill={BRANCO}>
        <circle cx={cx} cy={cy - r * 1.1} r={r * 0.32} />
        <circle cx={cx - r * 0.45} cy={cy} r={r * 0.32} />
        <circle cx={cx + r * 0.45} cy={cy + r * 0.9} r={r * 0.32} />
      </g>
    );
  }
  if (tipo === "flor") {
    const p = r * 0.42;
    return (
      <g>
        {[0, 72, 144, 216, 288].map((a) => (
          <circle key={a} cx={cx} cy={cy - p * 1.05} r={p * 0.72} fill={BRANCO} transform={`rotate(${a} ${cx} ${cy})`} />
        ))}
        <circle cx={cx} cy={cy} r={p * 0.55} fill={OURO} />
      </g>
    );
  }
  if (tipo === "coracao") {
    const s = r * 0.5;
    return (
      <path
        d={`M ${cx} ${cy + s} C ${cx - s * 2} ${cy - s * 0.2} ${cx - s * 0.9} ${cy - s * 1.5} ${cx} ${cy - s * 0.4} C ${cx + s * 0.9} ${cy - s * 1.5} ${cx + s * 2} ${cy - s * 0.2} ${cx} ${cy + s} Z`}
        fill={BRANCO}
      />
    );
  }
  if (tipo === "brilho") {
    const k = r * 0.2;
    const R = r * 0.85;
    return (
      <path
        d={`M ${cx} ${cy - R} Q ${cx + k} ${cy - k} ${cx + R} ${cy} Q ${cx + k} ${cy + k} ${cx} ${cy + R} Q ${cx - k} ${cy + k} ${cx - R} ${cy} Q ${cx - k} ${cy - k} ${cx} ${cy - R} Z`}
        fill={OURO}
      />
    );
  }
  return null;
}

function Dedo({ x, w, h, cor, ponta, deco, longa }: DedoProps) {
  const y = BASE - h;
  const m = w * 0.13;
  const nw = w - 2 * m;
  const cx = x + w / 2;
  const brilhoLargura = Math.max(2, w * 0.07);

  let unha: React.ReactNode;
  let centroDecoY: number;

  if (longa) {
    const ext = w * 0.95;
    const topo = y + 4;
    const fundo = y + w * 0.8;
    centroDecoY = y + w * 0.15;
    unha = (
      <>
        <path
          d={`M ${x + m} ${fundo} L ${x + m} ${topo} Q ${cx} ${y - ext * 1.7} ${x + w - m} ${topo} L ${x + w - m} ${fundo} Q ${cx} ${fundo + w * 0.3} ${x + m} ${fundo} Z`}
          fill={cor}
        />
        {ponta && <path d={`M ${x + m} ${topo} Q ${cx} ${y - ext * 1.7} ${x + w - m} ${topo} Q ${cx} ${y - ext * 0.3} ${x + m} ${topo} Z`} fill={ponta} />}
        <path d={`M ${x + m + nw * 0.26} ${fundo - w * 0.2} L ${x + m + nw * 0.26} ${y - ext * 0.1}`} stroke={BRANCO} strokeOpacity="0.5" strokeWidth={brilhoLargura} strokeLinecap="round" />
      </>
    );
  } else {
    const nh = w * 1.0;
    const topo = y + m;
    centroDecoY = topo + nh * 0.55;
    unha = (
      <>
        <rect x={x + m} y={topo} width={nw} height={nh} rx={nw / 2} fill={cor} />
        {ponta && (
          <path
            d={`M ${x + m} ${topo + nw / 2} A ${nw / 2} ${nw / 2} 0 0 1 ${x + w - m} ${topo + nw / 2} Q ${cx} ${topo + nw * 0.2} ${x + m} ${topo + nw / 2} Z`}
            fill={ponta}
          />
        )}
        <path d={`M ${x + m + nw * 0.27} ${topo + nh * 0.3} L ${x + m + nw * 0.27} ${topo + nh * 0.72}`} stroke={BRANCO} strokeOpacity="0.55" strokeWidth={brilhoLargura} strokeLinecap="round" />
      </>
    );
  }

  return (
    <g>
      <rect x={x} y={y} width={w} height={h + w} rx={w / 2} fill={PELE} />
      <path d={`M ${x + w * 0.2} ${y + w * 1.8} Q ${cx} ${y + w * 1.95} ${x + w * 0.8} ${y + w * 1.8}`} stroke={PELE_SOMBRA} strokeWidth="2" fill="none" strokeLinecap="round" />
      {unha}
      {deco && <Decoracao tipo={deco} cx={cx} cy={centroDecoY} r={nw * 0.42} />}
    </g>
  );
}

function Mao({ unhas, longa }: { unhas: Unha[]; longa?: boolean }) {
  const alturas = longa ? [128, 164, 178, 160, 120] : [150, 190, 206, 186, 140];
  return (
    <g>
      {alturas.map((h, i) => (
        <Dedo key={i} x={70 + i * 54} w={44} h={h} longa={longa} {...unhas[i]} />
      ))}
    </g>
  );
}

function Pe({ unhas }: { unhas: Unha[] }) {
  const dedos = [
    { w: 66, h: 150 },
    { w: 48, h: 132 },
    { w: 44, h: 118 },
    { w: 40, h: 104 },
    { w: 36, h: 90 },
  ];
  let x = 59;
  return (
    <g>
      {dedos.map((d, i) => {
        const el = <Dedo key={i} x={x} w={d.w} h={d.h} {...unhas[i]} />;
        x += d.w + 12;
        return el;
      })}
    </g>
  );
}

const todas = (u: Unha): Unha[] => [u, u, u, u, u];

interface Estilo {
  titulo: string;
  descricao: string;
  fundo: [string, string];
  cena: React.ReactNode;
}

const ESTILOS: Estilo[] = [
  {
    titulo: "Francesinha",
    descricao: "Clássica e delicada, combina com tudo.",
    fundo: ["#fbf1f0", "#f1e2d6"],
    cena: <Mao unhas={todas({ cor: "#f6d3cf", ponta: "#ffffff" })} />,
  },
  {
    titulo: "Vermelho clássico",
    descricao: "Esmaltação tradicional com brilho intenso.",
    fundo: ["#faf4ee", "#ecdccd"],
    cena: <Mao unhas={todas({ cor: "#b5323b" })} />,
  },
  {
    titulo: "Unhas decoradas",
    descricao: "Flores, corações e detalhes feitos à mão.",
    fundo: ["#fbf1f0", "#f3dcd9"],
    cena: (
      <Mao
        unhas={[
          { cor: "#e7a9a4" },
          { cor: "#f6d3cf", deco: "flor" },
          { cor: "#cf8f89", deco: "pontos" },
          { cor: "#f6d3cf", deco: "coracao" },
          { cor: "#e7a9a4" },
        ]}
      />
    ),
  },
  {
    titulo: "Alongamento em gel",
    descricao: "Formato amendoado com acabamento espelhado.",
    fundo: ["#faf4ee", "#ead9ca"],
    cena: (
      <Mao
        longa
        unhas={[{ cor: "#e3b9a8" }, { cor: "#e3b9a8" }, { cor: "#e3b9a8", deco: "brilho" }, { cor: "#e3b9a8" }, { cor: "#e3b9a8" }]}
      />
    ),
  },
  {
    titulo: "Pedicure",
    descricao: "Pés bem cuidados e esmaltação impecável.",
    fundo: ["#fbf1f0", "#f1e2d6"],
    cena: <Pe unhas={[{ cor: "#c9736f", deco: "flor" }, { cor: "#c9736f" }, { cor: "#c9736f" }, { cor: "#c9736f" }, { cor: "#c9736f" }]} />,
  },
  {
    titulo: "Tons nude",
    descricao: "Degradê suave do rosé ao bege.",
    fundo: ["#faf4ee", "#f3dcd9"],
    cena: <Mao unhas={[{ cor: "#f1c9c0" }, { cor: "#e6b3a6" }, { cor: "#d99f90" }, { cor: "#cc8e7e" }, { cor: "#bf7f70" }]} />,
  },
  {
    titulo: "Francesinha colorida",
    descricao: "A ponta ganha cor para um toque moderno.",
    fundo: ["#fbf1f0", "#ecdccd"],
    cena: <Mao longa unhas={todas({ cor: "#f8ddd8", ponta: "#cf8f89" })} />,
  },
];

export default function slidesDeInspiracao(): React.ReactNode[] {
  return ESTILOS.map((e, i) => (
    <figure key={e.titulo} className="flex h-full flex-col overflow-hidden rounded-3xl border border-linha bg-white shadow-cartao">
      <svg viewBox="0 0 400 300" role="img" aria-label={`Ilustração do estilo ${e.titulo}`} className="block aspect-[4/3] w-full">
        <defs>
          <linearGradient id={`fundo-insp-${i}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={e.fundo[0]} />
            <stop offset="1" stopColor={e.fundo[1]} />
          </linearGradient>
        </defs>
        <rect width="400" height="300" fill={`url(#fundo-insp-${i})`} />
        <circle cx="200" cy="190" r="130" fill="#ffffff" opacity="0.45" />
        {e.cena}
      </svg>
      <figcaption className="flex flex-1 flex-col px-6 py-5">
        <span className="font-titulo text-xl text-tinta">{e.titulo}</span>
        <span className="mt-1 text-sm leading-relaxed text-tinta-suave">{e.descricao}</span>
      </figcaption>
    </figure>
  ));
}
