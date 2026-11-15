"use client";

/**
 * Tela de erro controlada. Aparece quando uma página falha no servidor (por
 * exemplo, banco de dados indisponível). Os detalhes ficam apenas nos logs do
 * servidor; aqui é exibido somente o código de referência.
 */
export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-nude-100 to-creme px-5 py-10">
      <div className="w-full max-w-md text-center">
        <p className="sobretitulo">Ops</p>
        <h1 className="text-3xl text-tinta">Estamos com uma instabilidade</h1>
        <div className="filete mx-auto my-6" />
        <p className="leading-relaxed text-tinta-suave">
          Não foi possível carregar esta página agora. Tente novamente em alguns instantes.
        </p>
        <button type="button" onClick={reset} className="btn btn-primario mt-8">
          Tentar novamente
        </button>
        {error.digest && <p className="mt-6 text-xs text-tinta-suave/70">Código de referência: {error.digest}</p>}
      </div>
    </main>
  );
}
