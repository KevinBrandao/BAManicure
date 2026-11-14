"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export interface FotoView {
  id: string;
  url: string;
  categoria: string;
  legenda: string | null;
}

export default function Galeria({ fotos }: { fotos: FotoView[] }) {
  const categorias = useMemo(() => ["Todas", ...Array.from(new Set(fotos.map((f) => f.categoria)))], [fotos]);
  const [categoria, setCategoria] = useState("Todas");
  const [aberta, setAberta] = useState<number | null>(null);

  const visiveis = useMemo(
    () => (categoria === "Todas" ? fotos : fotos.filter((f) => f.categoria === categoria)),
    [fotos, categoria],
  );

  const fechar = useCallback(() => setAberta(null), []);
  const mover = useCallback(
    (passo: number) => setAberta((i) => (i === null ? i : (i + passo + visiveis.length) % visiveis.length)),
    [visiveis.length],
  );

  useEffect(() => {
    if (aberta === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
      if (e.key === "ArrowRight") mover(1);
      if (e.key === "ArrowLeft") mover(-1);
    };
    document.addEventListener("keydown", onKey);
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflowAnterior;
    };
  }, [aberta, fechar, mover]);

  const atual = aberta !== null ? visiveis[aberta] : null;

  return (
    <div>
      {categorias.length > 2 && (
        <div className="mb-8 flex flex-wrap justify-center gap-2" role="group" aria-label="Filtrar por categoria">
          {categorias.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setCategoria(c);
                setAberta(null);
              }}
              aria-pressed={categoria === c}
              className={`min-h-10 cursor-pointer rounded-full border px-4 py-1.5 text-sm transition ${
                categoria === c
                  ? "border-rose-500 bg-rose-500 text-white"
                  : "border-linha bg-white text-tinta-suave hover:border-rose-300 hover:text-tinta"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {visiveis.map((f, i) => (
          <li key={f.id}>
            <button
              type="button"
              onClick={() => setAberta(i)}
              className="group relative block aspect-square w-full cursor-zoom-in overflow-hidden rounded-2xl bg-nude-100"
              aria-label={`Ampliar foto${f.legenda ? `: ${f.legenda}` : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={f.url}
                alt={f.legenda || `Trabalho da categoria ${f.categoria}`}
                loading="lazy"
                className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
              />
            </button>
          </li>
        ))}
      </ul>

      {atual && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Foto ampliada"
          className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/90 p-4"
          onClick={fechar}
        >
          <button
            type="button"
            onClick={fechar}
            autoFocus
            className="absolute top-4 right-4 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white/15 text-2xl text-white hover:bg-white/25"
            aria-label="Fechar"
          >
            ×
          </button>
          {visiveis.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  mover(-1);
                }}
                className="absolute left-3 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white/15 text-2xl text-white hover:bg-white/25"
                aria-label="Foto anterior"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  mover(1);
                }}
                className="absolute right-3 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white/15 text-2xl text-white hover:bg-white/25"
                aria-label="Próxima foto"
              >
                ›
              </button>
            </>
          )}
          <figure className="max-h-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={atual.url}
              alt={atual.legenda || `Trabalho da categoria ${atual.categoria}`}
              className="max-h-[80vh] w-auto rounded-xl object-contain"
            />
            {atual.legenda && <figcaption className="mt-3 text-center text-sm text-white/90">{atual.legenda}</figcaption>}
          </figure>
        </div>
      )}
    </div>
  );
}
