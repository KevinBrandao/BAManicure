import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { modoLanding } from "@/lib/conteudo";
import { acaoEntrar } from "../actions";
import { existeAdministradora, usuarioAtual } from "@/lib/auth";
import { Aviso, type Busca } from "@/components/admin/Ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Entrar — Painel", robots: { index: false, follow: false } };

export default async function Login({ searchParams }: { searchParams: Busca }) {
  if (modoLanding()) notFound();
  if (await usuarioAtual()) redirect("/admin");
  const busca = await searchParams;
  const temAdmin = await existeAdministradora();

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-nude-100 to-creme px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="sobretitulo">Área da profissional</p>
          <h1 className="text-3xl text-tinta">Painel de agendamentos</h1>
          <div className="filete mx-auto mt-5" />
        </div>

        <div className="cartao">
          <Aviso busca={busca} />
          {!temAdmin && (
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Nenhuma administradora cadastrada ainda. Defina <code>ADMIN_EMAIL</code> e <code>ADMIN_PASSWORD</code> no
              arquivo <code>.env.local</code> e execute <code>npm run admin:create</code>.
            </div>
          )}
          <form action={acaoEntrar} className="space-y-4">
            <div>
              <label htmlFor="email" className="rotulo">
                E-mail
              </label>
              <input id="email" name="email" type="email" autoComplete="username" required className="campo" />
            </div>
            <div>
              <label htmlFor="senha" className="rotulo">
                Senha
              </label>
              <input id="senha" name="senha" type="password" autoComplete="current-password" required className="campo" />
            </div>
            <button type="submit" className="btn btn-primario w-full">
              Entrar
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm">
          <Link href="/" className="text-tinta-suave underline-offset-4 hover:underline">
            ← Voltar ao site
          </Link>
        </p>
      </div>
    </main>
  );
}
