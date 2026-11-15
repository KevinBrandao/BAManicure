/**
 * Slides do carrossel "Inspire-se": fotos de inspiração de estilos de unha.
 * As imagens ficam em public/inspiracoes/. Para trocar, substitua os arquivos
 * ou edite a lista abaixo.
 */

interface Inspiracao {
  arquivo: string;
  titulo: string;
  largura: number;
  altura: number;
}

const INSPIRACOES: Inspiracao[] = [
  { arquivo: "01.jpg", titulo: "Francesinha clássica", largura: 516, altura: 594 },
  { arquivo: "02.jpg", titulo: "Vermelho com detalhe decorado", largura: 225, altura: 225 },
  { arquivo: "03.jpg", titulo: "Vinho intenso", largura: 447, altura: 447 },
  { arquivo: "04.jpg", titulo: "Francesinha com flores e pedrarias", largura: 494, altura: 619 },
  { arquivo: "05.jpg", titulo: "Azul com pontinhos", largura: 494, altura: 619 },
  { arquivo: "06.jpg", titulo: "Francesinha vermelha com coração", largura: 447, altura: 447 },
  { arquivo: "07.jpg", titulo: "Stiletto com francesinha e flor", largura: 468, altura: 654 },
  { arquivo: "08.jpg", titulo: "Caramelo", largura: 638, altura: 480 },
  { arquivo: "09.jpg", titulo: "Branquinho com francesinha", largura: 438, altura: 456 },
  { arquivo: "10.jpg", titulo: "Francesinha pink", largura: 451, altura: 679 },
  { arquivo: "11.jpg", titulo: "Francesinha pink com corações", largura: 195, altura: 259 },
  { arquivo: "12.jpg", titulo: "Preto com traços dourados", largura: 508, altura: 603 },
  { arquivo: "13.jpg", titulo: "Degradê com pedrarias", largura: 468, altura: 654 },
  { arquivo: "14.jpg", titulo: "Rosé com glitter", largura: 455, altura: 673 },
  { arquivo: "15.jpg", titulo: "Vermelho com folhagem", largura: 480, altura: 638 },
  { arquivo: "16.jpg", titulo: "Chocolate com detalhe", largura: 494, altura: 619 },
  { arquivo: "17.jpg", titulo: "Nude perolado", largura: 447, altura: 447 },
  { arquivo: "18.jpg", titulo: "Coloridas", largura: 494, altura: 619 },
];

export default function slidesDeInspiracao(): React.ReactNode[] {
  return INSPIRACOES.map((f) => (
    <figure key={f.arquivo} className="flex h-full flex-col overflow-hidden rounded-3xl border border-linha bg-white shadow-cartao">
      <div className="aspect-[4/5] overflow-hidden bg-nude-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/inspiracoes/${f.arquivo}`}
          alt={`Inspiração de unhas: ${f.titulo}`}
          width={f.largura}
          height={f.altura}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="h-full w-full object-cover"
        />
      </div>
      <figcaption className="px-5 py-4 text-center font-titulo text-lg text-tinta">{f.titulo}</figcaption>
    </figure>
  ));
}
