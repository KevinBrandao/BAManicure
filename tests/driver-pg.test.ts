/**
 * Valida o caminho de PRODUÇÃO: os mesmos fluxos, mas passando pelo driver
 * `pg` e pelo protocolo de rede do PostgreSQL (como acontece com o Supabase),
 * em vez do acesso embutido usado nos demais testes.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { getDb, runMigrations, setDbForTests, type Db } from "@/lib/db";
import { cancelarAgendamento, criarAgendamento, horariosDisponiveis, listarAgendamentos, listarServicos } from "@/lib/agenda";
import { lerImagem, salvarImagem } from "@/lib/imagens";
import { processarLembretes } from "@/lib/lembretes";
import { buscarCliente, estatisticasWhatsApp, listarBloqueios, listarClientes, listarConversas, listarLembretes, resumoDoMes } from "@/lib/painel";
import { lerConfiguracoes, salvarConfiguracoes } from "@/lib/settings";
import { lerDadosSite } from "@/lib/site";
import { processarMensagem } from "@/lib/whatsapp/conversa";
import { instalarTransporte, SEGUNDA, sp, TERCA, type TransporteDeTeste } from "./helpers";

const PORTA = 54329;
let servidor: PGLiteSocketServer;
let pglite: PGlite;
let db: Db;
let wa: TransporteDeTeste;
const AGORA = sp(SEGUNDA, "07:00");
const ANA = "5511988887777";

beforeAll(async () => {
  pglite = await PGlite.create();
  servidor = new PGLiteSocketServer({ db: pglite, port: PORTA, host: "127.0.0.1" });
  await servidor.start();

  setDbForTests(undefined);
  // a senha "sen@ha" codificada e o sslmode na URL exercitam o tratamento da connection string
  process.env.DATABASE_URL = `postgresql://postgres:sen%40ha@127.0.0.1:${PORTA}/postgres?sslmode=require`;
  process.env.DATABASE_SSL = "false";
  process.env.DATABASE_POOL_MAX = "1";
  db = await getDb();
  wa = instalarTransporte();
});

afterAll(async () => {
  await db?.close();
  await servidor?.stop();
  await pglite?.close();
  setDbForTests(undefined);
  delete process.env.DATABASE_URL;
  delete process.env.DATABASE_SSL;
  delete process.env.DATABASE_POOL_MAX;
});

describe("driver pg (caminho de produção / Supabase)", () => {
  it("conecta pelo driver pg e aplica as migrações de forma idempotente", async () => {
    expect(db.kind).toBe("pg");
    expect(await runMigrations(db)).toEqual(["001_init.sql"]);
    expect(await runMigrations(db)).toEqual([]);
    const { rows } = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'",
    );
    expect(rows[0].n).toBeGreaterThanOrEqual(17);
  });

  it("todas as tabelas ficam com RLS habilitado (API pública do Supabase sem acesso)", async () => {
    const { rows } = await db.query<{ relname: string }>(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`,
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("grava e lê configurações (jsonb), serviços e imagens (bytea)", async () => {
    await salvarConfiguracoes({ nome_profissional: "Teste Driver", diferenciais: ["a", "b"], passo_minutos: 30 });
    const cfg = await lerConfiguracoes();
    expect(cfg.nome_profissional).toBe("Teste Driver");
    expect(cfg.diferenciais).toEqual(["a", "b"]);
    expect(cfg.antecedencia_minima_minutos).toBe(120);

    await db.query(
      "INSERT INTO services (nome, preco_centavos, duracao_minutos, intervalo_minutos, ordem) VALUES ('Manicure', 3700, 60, 0, 1)",
    );
    const servicos = await listarServicos({ apenasAtivos: true });
    expect(servicos[0]).toMatchObject({ nome: "Manicure", preco_centavos: 3700, duracao_minutos: 60, ativo: true });

    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 250, 255]);
    const id = await salvarImagem(new File([png], "x.png"));
    const lida = await lerImagem(id!);
    expect(lida?.mime).toBe("image/png");
    expect(Array.from(lida!.dados)).toEqual(Array.from(png));

    const site = await lerDadosSite();
    expect(site.expediente).toHaveLength(7);
    expect(site.expediente.find((e) => e.dia_semana === 1)).toMatchObject({ inicio: "09:00", fim: "18:00", intervalo_inicio: "12:00", ativo: true });
  });

  it("fluxo completo pelo WhatsApp grava o agendamento e impede dupla reserva", async () => {
    let n = 0;
    const diz = (texto: string) => processarMensagem({ telefone: ANA, texto, waMessageId: `wamid.PG${++n}`, agora: AGORA });
    await diz("oi");
    await diz("1");
    await diz("Ana Paula Souza");
    await diz("1"); // serviço
    await diz("2"); // terça
    await diz("14:00");
    const r = await diz("1");
    expect(r.respostas[0]).toContain("Agendamento confirmado");

    const ags = await listarAgendamentos(TERCA, TERCA);
    expect(ags).toHaveLength(1);
    expect(ags[0]).toMatchObject({ cliente_nome: "Ana Paula Souza", data: TERCA, hora: "14:00", hora_fim: "15:00", status: "CONFIRMADO" });
    expect(ags[0].inicio.toISOString()).toBe(sp(TERCA, "14:00").toISOString());
    expect(await horariosDisponiveis(ags[0].service_id, TERCA, { agora: AGORA })).not.toContain("14:00");

    await expect(
      criarAgendamento({ cliente: { nome: "Bia Lima", telefone: "5511977776666" }, serviceId: ags[0].service_id, data: TERCA, hora: "14:30", origem: "WHATSAPP", agora: AGORA }),
    ).rejects.toMatchObject({ codigo: "HORARIO_INDISPONIVEL" });

    // a exclusion constraint do banco também é reconhecida pelo código de erro do driver
    await expect(
      db.query(
        `INSERT INTO appointments (codigo, customer_id, service_id, inicio, fim, ocupado_ate, preco_centavos)
         VALUES ('AG-PG', $1, $2, $3, $4, $4, 100)`,
        [ags[0].customer_id, ags[0].service_id, sp(TERCA, "14:30"), sp(TERCA, "15:30")],
      ),
    ).rejects.toMatchObject({ code: "23P01" });
  });

  it("lembretes, consultas do painel e cancelamento funcionam pelo driver pg", async () => {
    // o servidor de teste encerra a conexão após o erro provocado no teste
    // anterior; o pool do driver descarta a conexão quebrada e abre outra
    await db.query("SELECT 1").catch(() => {});
    const [ag] = await listarAgendamentos(TERCA, TERCA);
    // cliente escreveu na manhã do atendimento: janela de 24h aberta
    await processarMensagem({ telefone: ANA, texto: "menu", waMessageId: "wamid.PGJ", agora: sp(TERCA, "08:00") });
    wa.limpar();
    const r1 = await processarLembretes(sp(TERCA, "13:00"));
    expect(r1.enviados).toBe(1);
    expect(wa.enviadas[0].texto).toContain("Hoje, às 14:00");
    expect((await processarLembretes(sp(TERCA, "13:01"))).enviados).toBe(0);

    const mes = await resumoDoMes(AGORA);
    expect(mes).toMatchObject({ total: 1, cancelados: 0, faturamentoPrevisto: 3700 });
    expect(mes.maisProcurados[0]).toEqual({ nome: "Manicure", total: 1 });

    const clientes = await listarClientes("ana", AGORA);
    expect(clientes).toHaveLength(1);
    expect(clientes[0].total).toBe(1);
    expect(new Date(clientes[0].proximo!).toISOString()).toBe(sp(TERCA, "14:00").toISOString());
    expect((await buscarCliente(clientes[0].id, AGORA))?.nome).toBe("Ana Paula Souza");

    await db.query("INSERT INTO blocked_times (data, motivo) VALUES ($1, 'Feriado')", ["2026-11-20"]);
    const bloqueios = await listarBloqueios(SEGUNDA);
    expect(bloqueios[0]).toMatchObject({ data: "2026-11-20", horario_inicio: null, motivo: "Feriado" });

    expect((await listarConversas())[0]).toMatchObject({ telefone: ANA, cliente_nome: "Ana Paula Souza" });
    expect((await listarLembretes()).length).toBeGreaterThanOrEqual(0);
    expect((await estatisticasWhatsApp(36500)).recebidas).toBe(8);

    const cancelado = await cancelarAgendamento({ id: ag.id, por: "ADMIN", agora: sp(TERCA, "13:05") });
    expect(cancelado.status).toBe("CANCELADO");
    expect(await horariosDisponiveis(ag.service_id, TERCA, { agora: AGORA })).toContain("14:00");
  });
});
