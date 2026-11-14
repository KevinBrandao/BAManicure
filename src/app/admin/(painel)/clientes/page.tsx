import Link from "next/link";
import { exigirAdmin } from "@/lib/auth";
import { dataHoraCurta, listarClientes } from "@/lib/painel";
import { Aviso, Cabecalho, formatarTelefone, param, Vazio, type Busca } from "@/components/admin/Ui";

export const metadata = { title: "Clientes" };

export default async function Clientes({ searchParams }: { searchParams: Busca }) {
  await exigirAdmin();
  const busca = await searchParams;
  const q = param(busca, "q")?.slice(0, 80) ?? "";
  const clientes = (await listarClientes(q)).filter((c) => !c.telefone.startsWith("000"));

  return (
    <>
      <Cabecalho titulo="Clientes" descricao="Cadastradas automaticamente no primeiro agendamento." />
      <Aviso busca={busca} />

      <form method="get" className="mb-5 flex gap-2" role="search">
        <label htmlFor="q" className="sr-only">Buscar por nome ou telefone</label>
        <input id="q" name="q" type="search" defaultValue={q} placeholder="Buscar por nome ou telefone" className="campo max-w-sm" />
        <button type="submit" className="btn btn-claro">Buscar</button>
      </form>

      {clientes.length === 0 ? (
        <Vazio>{q ? "Nenhuma cliente encontrada." : "Nenhuma cliente cadastrada ainda."}</Vazio>
      ) : (
        <div className="cartao overflow-x-auto p-0">
          <table className="tabela min-w-[40rem]">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Telefone</th>
                <th>Atendimentos</th>
                <th>Último</th>
                <th>Próximo</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id} className="hover:bg-nude-50">
                  <td>
                    <Link href={`/admin/clientes/${c.id}`} className="font-medium text-rose-600 underline-offset-4 hover:underline">
                      {c.nome}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap">{formatarTelefone(c.telefone)}</td>
                  <td>{c.total}</td>
                  <td className="whitespace-nowrap">{dataHoraCurta(c.ultimo)}</td>
                  <td className="whitespace-nowrap">{dataHoraCurta(c.proximo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
