import type { Metadata } from "next";
import Link from "next/link";
import { acaoSair } from "../actions";
import { exigirAdmin } from "@/lib/auth";
import { NavAdmin } from "@/components/admin/Cliente";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { default: "Painel", template: "%s — Painel" },
  robots: { index: false, follow: false },
};

export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  // Proteção de todas as páginas do painel (as ações verificam de novo)
  const usuario = await exigirAdmin();

  return (
    <div className="min-h-dvh bg-nude-50 lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="sticky top-0 z-30 border-b border-linha bg-white lg:h-dvh lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-3 px-5 py-3 lg:block lg:py-6">
          <Link href="/admin" className="font-titulo text-lg text-tinta">
            Painel
          </Link>
          <div className="flex items-center gap-3 lg:mt-1 lg:block">
            <p className="hidden truncate text-xs text-tinta-suave sm:block">{usuario.nome}</p>
            <form action={acaoSair} className="lg:hidden">
              <button type="submit" className="cursor-pointer text-sm text-rose-600 underline-offset-4 hover:underline">
                Sair
              </button>
            </form>
          </div>
        </div>
        <NavAdmin />
        <div className="mt-6 hidden space-y-2 border-t border-linha px-5 pt-5 text-sm lg:block">
          <Link href="/" target="_blank" className="block text-tinta-suave underline-offset-4 hover:underline">
            Ver site ↗
          </Link>
          <form action={acaoSair}>
            <button type="submit" className="cursor-pointer text-rose-600 underline-offset-4 hover:underline">
              Sair
            </button>
          </form>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
    </div>
  );
}
