import Link from "next/link";
import { STATUS_ROTULO, type Status } from "@/lib/agenda";

export type Busca = Promise<Record<string, string | string[] | undefined>>;

export function param(busca: Record<string, string | string[] | undefined>, chave: string): string | undefined {
  const v = busca[chave];
  return Array.isArray(v) ? v[0] : v;
}

/** Mensagem de sucesso/erro vinda das ações (?ok=... / ?erro=...). */
export function Aviso({ busca }: { busca: Record<string, string | string[] | undefined> }) {
  const ok = param(busca, "ok");
  const erro = param(busca, "erro");
  if (!ok && !erro) return null;
  return (
    <div
      role={erro ? "alert" : "status"}
      className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
        erro ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      {erro ?? ok}
    </div>
  );
}

const COR_STATUS: Record<Status, string> = {
  PENDENTE: "bg-amber-100 text-amber-800",
  CONFIRMADO: "bg-emerald-100 text-emerald-800",
  CANCELADO: "bg-red-100 text-red-700",
  CONCLUIDO: "bg-sky-100 text-sky-800",
  NAO_COMPARECEU: "bg-stone-200 text-stone-700",
};

export function SeloStatus({ status }: { status: Status }) {
  return <span className={`selo ${COR_STATUS[status]}`}>{STATUS_ROTULO[status]}</span>;
}

export function Selo({ cor, children }: { cor: "verde" | "vermelho" | "ambar" | "cinza" | "azul"; children: React.ReactNode }) {
  const cores = {
    verde: "bg-emerald-100 text-emerald-800",
    vermelho: "bg-red-100 text-red-700",
    ambar: "bg-amber-100 text-amber-800",
    cinza: "bg-stone-200 text-stone-700",
    azul: "bg-sky-100 text-sky-800",
  };
  return <span className={`selo ${cores[cor]}`}>{children}</span>;
}

export function Cabecalho({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl text-tinta sm:text-3xl">{titulo}</h1>
        {descricao && <p className="mt-1 text-sm text-tinta-suave">{descricao}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function Voltar({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="mb-4 inline-block text-sm text-rose-600 underline-offset-4 hover:underline">
      ← {children}
    </Link>
  );
}

export function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-nude-300 bg-nude-50 px-4 py-8 text-center text-sm text-tinta-suave">{children}</p>;
}

/** (11) 99999-8888 para números brasileiros; demais, +DDI número. */
export function formatarTelefone(t: string): string {
  if (t.startsWith("000")) return "—";
  if (t.startsWith("55") && (t.length === 12 || t.length === 13)) {
    const ddd = t.slice(2, 4);
    const num = t.slice(4);
    return `(${ddd}) ${num.slice(0, num.length - 4)}-${num.slice(-4)}`;
  }
  return `+${t}`;
}
