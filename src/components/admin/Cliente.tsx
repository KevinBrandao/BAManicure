"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

const ITENS = [
  { href: "/admin", rotulo: "Início", exato: true },
  { href: "/admin/agenda", rotulo: "Agenda" },
  { href: "/admin/servicos", rotulo: "Serviços" },
  { href: "/admin/clientes", rotulo: "Clientes" },
  { href: "/admin/galeria", rotulo: "Galeria" },
  { href: "/admin/whatsapp", rotulo: "WhatsApp" },
  { href: "/admin/configuracoes", rotulo: "Configurações" },
];

export function NavAdmin() {
  const caminho = usePathname();
  return (
    <nav aria-label="Menu do painel" className="flex gap-1 overflow-x-auto px-3 pb-2 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-0">
      {ITENS.map((i) => {
        const ativo = i.exato ? caminho === i.href : caminho.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={ativo ? "page" : undefined}
            className={`flex min-h-10 flex-none items-center rounded-full px-4 py-2 text-sm whitespace-nowrap transition lg:rounded-xl ${
              ativo ? "bg-rose-500 font-medium text-white" : "text-tinta-suave hover:bg-nude-100 hover:text-tinta"
            }`}
          >
            {i.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}

/** Recarrega os dados do servidor periodicamente (agenda sempre atualizada). */
export function AtualizacaoAutomatica({ segundos = 30 }: { segundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, segundos * 1000);
    const aoVoltar = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [router, segundos]);
  return null;
}

/** Botão de envio que pede confirmação antes de ações destrutivas. */
export function BotaoConfirmar({
  mensagem,
  className,
  children,
}: {
  mensagem: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(mensagem)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
