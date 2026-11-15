"use client";

import { Children, useCallback, useEffect, useRef, useState } from "react";

/**
 * Carrossel horizontal com rolagem nativa (scroll-snap): desliza com o dedo
 * no celular, tem setas, indicadores de posição e navegação por teclado.
 * Mostra 1 slide no celular, 2 em tablets e 3 em telas grandes.
 */
export default function Carrossel({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  const slides = Children.toArray(children);
  const trilho = useRef<HTMLUListElement>(null);
  const [ativo, setAtivo] = useState(0);
  const [visiveis, setVisiveis] = useState(1);
  // destino da rolagem em andamento: cliques rápidos somam a partir dele,
  // e não da posição ainda desatualizada
  const destino = useRef<number | null>(null);

  const medir = useCallback(() => {
    const el = trilho.current;
    const primeiro = el?.firstElementChild as HTMLElement | null;
    if (!el || !primeiro) return;
    const passo = primeiro.offsetWidth + parseFloat(getComputedStyle(el).columnGap || "0");
    setVisiveis(Math.max(1, Math.round(el.clientWidth / passo)));
    const indice = Math.round(el.scrollLeft / passo);
    if (destino.current === indice) destino.current = null;
    setAtivo(indice);
  }, []);

  useEffect(() => {
    medir();
    const el = trilho.current;
    if (!el) return;
    const fimDaRolagem = () => {
      destino.current = null;
    };
    el.addEventListener("scroll", medir, { passive: true });
    el.addEventListener("scrollend", fimDaRolagem);
    window.addEventListener("resize", medir);
    return () => {
      el.removeEventListener("scroll", medir);
      el.removeEventListener("scrollend", fimDaRolagem);
      window.removeEventListener("resize", medir);
    };
  }, [medir]);

  const ultimo = Math.max(0, slides.length - visiveis);

  const irPara = useCallback(
    (indice: number) => {
      const el = trilho.current;
      const limitado = Math.min(Math.max(indice, 0), ultimo);
      const alvo = el?.children[limitado] as HTMLElement | undefined;
      if (!el || !alvo) return;
      destino.current = limitado;
      const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollTo({ left: alvo.offsetLeft - el.offsetLeft, behavior: suave ? "smooth" : "auto" });
    },
    [ultimo],
  );
  const mover = (passo: number) => irPara((destino.current ?? ativo) + passo);

  const botaoSeta =
    "flex h-11 w-11 flex-none cursor-pointer items-center justify-center rounded-full border border-linha bg-white text-xl text-tinta shadow-cartao transition hover:border-rose-300 hover:text-rose-600 disabled:cursor-default disabled:opacity-35 disabled:hover:border-linha disabled:hover:text-tinta";

  return (
    <div role="region" aria-roledescription="carrossel" aria-label={rotulo}>
      <ul
        ref={trilho}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            mover(1);
          }
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            mover(-1);
          }
        }}
        className="flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth rounded-3xl pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((slide, i) => (
          <li
            key={i}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} de ${slides.length}`}
            className="w-full flex-none snap-start sm:w-[calc((100%-1.25rem)/2)] lg:w-[calc((100%-2.5rem)/3)]"
          >
            {slide}
          </li>
        ))}
      </ul>

      <div className="mt-6 flex items-center justify-center gap-4">
        <button type="button" onClick={() => mover(-1)} disabled={ativo <= 0} aria-label="Imagens anteriores" className={botaoSeta}>
          ‹
        </button>
        <div className="flex items-center gap-1">
          {Array.from({ length: ultimo + 1 }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => irPara(i)}
              aria-label={`Ir para a posição ${i + 1} de ${ultimo + 1}`}
              aria-current={i === ativo ? "true" : undefined}
              className="flex h-8 w-6 cursor-pointer items-center justify-center"
            >
              <span className={`block h-2.5 rounded-full transition-all duration-300 ${i === ativo ? "w-6 bg-rose-500" : "w-2.5 bg-nude-300"}`} />
            </button>
          ))}
        </div>
        <button type="button" onClick={() => mover(1)} disabled={ativo >= ultimo} aria-label="Próximas imagens" className={botaoSeta}>
          ›
        </button>
      </div>
    </div>
  );
}
