# Sistema de agendamento para manicure com WhatsApp

Secretária virtual para uma profissional autônoma de manicure: site público, atendimento automatizado pelo
WhatsApp (agendar, consultar, cancelar), lembretes automáticos e painel administrativo.

## O que está incluído

| Parte | Descrição |
| --- | --- |
| **Site público** (`/`) | Landing page responsiva: apresentação, sobre, serviços, galeria com categorias e ampliação, horários, contato, botão flutuante de WhatsApp, SEO básico (metadados, Open Graph, JSON-LD, sitemap, robots) e política de privacidade (`/privacidade`). Todo o conteúdo vem do painel. |
| **WhatsApp** (`/api/whatsapp/webhook`) | Integração real com a **WhatsApp Business Cloud API** da Meta: webhook com verificação de assinatura, fluxo conversacional completo, registro de todas as mensagens e falhas. |
| **Motor de agenda** | Disponibilidade em tempo real (duração, intervalo, expediente, almoço, bloqueios, datas especiais, antecedência mínima) e reserva atômica garantida pelo banco. |
| **Lembretes** (`/api/cron/lembretes`) | Fila persistente com lembretes de 1h, 30min e 10min; sem duplicidade; novas tentativas; respeita a janela de 24h e usa templates aprovados fora dela. |
| **Painel** (`/admin`) | Dashboard, agenda (dia/semana/mês), agendamento manual, edição, cancelamento, bloqueios, serviços, clientes, galeria, configurações de funcionamento e monitor do WhatsApp. |

## Arquitetura

- **Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4** — site, painel e API no mesmo projeto.
- **PostgreSQL** — em produção, qualquer Postgres gerenciado (recomendado: Supabase). Em desenvolvimento e nos
  testes, **PGlite** (PostgreSQL real embutido), sem instalar nada.
- **SQL parametrizado** direto (sem ORM); schema em [`db/migrations/001_init.sql`](db/migrations/001_init.sql).
- **Autenticação própria**: senha com scrypt, sessão em cookie `httpOnly` (o banco guarda só o hash do token),
  bloqueio após 5 tentativas erradas.
- **Imagens** guardadas no próprio banco e servidas por `/api/imagens/:id` com cache imutável — nenhum serviço de
  armazenamento extra para configurar.

```
src/
  app/
    page.tsx                    landing page
    privacidade/                política de privacidade (LGPD)
    admin/                      painel (login + páginas protegidas + actions.ts)
    api/whatsapp/webhook/       webhook da Meta (GET verificação, POST eventos)
    api/cron/lembretes/         despacho dos lembretes
    api/imagens/[id]/           imagens
  lib/
    availability.ts             motor de disponibilidade (funções puras)
    agenda.ts                   reserva, cancelamento, reagendamento, lembretes
    lembretes.ts                fila de lembretes
    whatsapp/                   cliente da Cloud API, envio, webhook, conversa
    auth.ts, usuarios.ts        sessão e senhas
    db.ts                       acesso ao banco (pg | PGlite) e migrações
db/migrations/                  schema SQL
scripts/                        migrate, seed, create-admin, worker
tests/                          testes das regras de negócio
docs/                           guias de instalação e do WhatsApp
```

### Como as regras críticas são garantidas

- **Sem dupla reserva (RB01/RB03):** a tabela `appointments` tem uma *exclusion constraint*
  (`EXCLUDE USING gist (tstzrange(inicio, ocupado_ate) WITH &&) WHERE status IN ('PENDENTE','CONFIRMADO')`).
  O próprio PostgreSQL recusa agendamentos ativos sobrepostos, mesmo com confirmações simultâneas. Além disso, a
  disponibilidade é revalidada dentro da transação, sob uma trava (`pg_advisory_xact_lock`).
- **Conversa abandonada não agenda (RB11):** o estado da conversa fica em `conversations`; só existe registro em
  `appointments` depois do "1 - Confirmar". Conversas expiram após 30 minutos sem resposta.
- **Confirmação só após salvar (RB16):** a mensagem de confirmação é montada a partir do registro já gravado.
- **Lembretes sem duplicidade (RB14):** cada lembrete é único por agendamento/tipo e é reivindicado com
  `FOR UPDATE SKIP LOCKED` antes do envio; um lembrete `ENVIADO` nunca volta para a fila.
- **Webhooks duplicados:** índice único no id da mensagem do WhatsApp.
- **Fuso horário:** instantes em `timestamptz`; toda regra de negócio usa `America/Sao_Paulo`.

## Começando (desenvolvimento local)

Requisitos: Node.js 20 ou superior.

```bash
npm install
```

Copie `.env.example` para `.env.local` e preencha ao menos `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `CRON_SECRET`.
Com `DATABASE_URL` vazio, o banco local (PGlite) é criado sozinho em `.data/pglite`.

```bash
npm run admin:create
```

```bash
npm run db:seed
```

```bash
npm run dev
```

- Site: http://localhost:3000
- Painel: http://localhost:3000/admin

> `db:seed` cadastra **serviços de exemplo** (nomes, preços e durações ilustrativos). Revise tudo em
> *Painel → Serviços*. Com PGlite, execute os scripts (`admin:create`, `db:seed`, `db:migrate`) com o servidor de
> desenvolvimento **parado** — o banco embutido aceita um processo por vez.

### Primeiros passos no painel

1. **Configurações → Informações do site:** nome profissional, frase, sobre, endereço, Instagram, número de
   WhatsApp e fotos.
2. **Configurações → Horários de atendimento / Regras:** expediente, almoço, antecedência mínima, política de
   cancelamento.
3. **Serviços:** preços, durações, intervalo adicional e imagens.
4. **Galeria:** fotos dos trabalhos, por categoria.
5. **WhatsApp:** confira o status da conexão depois de configurar as credenciais.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e execução em produção |
| `npm test` | Testes das regras de negócio |
| `npm run typecheck` | Verificação de tipos |
| `npm run db:migrate` | Aplica migrações pendentes no banco de `DATABASE_URL` |
| `npm run db:seed` | Cadastra serviços de exemplo (só se não houver nenhum) |
| `npm run admin:create` | Cria a administradora / redefine a senha |
| `npm run worker` | Chama o endpoint de lembretes a cada minuto (VPS ou PC) |

## Testes

`npm test` executa 60 testes contra um PostgreSQL real em memória (PGlite), com o mesmo schema de produção. Eles
cobrem os critérios de aceitação: fluxo completo de agendamento pelo WhatsApp, dupla reserva e confirmações
simultâneas, cancelamento e liberação de horário, consulta, bloqueios, serviços inativos, expediente, antecedência,
conversa abandonada, lembretes nos horários corretos, não duplicação, falhas e novas tentativas, janela de 24h e
templates, assinatura do webhook e eventos duplicados.

Nos testes, o envio ao WhatsApp é substituído por um dublê que apenas captura as mensagens. **Na aplicação não há
envio simulado:** sem credenciais, cada tentativa falha e fica registrada em *Painel → WhatsApp → Falhas de envio*.

## O que depende de ativação externa

Estas partes estão implementadas, mas só funcionam depois de configuradas por você:

| Item | O que fazer | Guia |
| --- | --- | --- |
| **WhatsApp Business Cloud API** | Criar app na Meta, obter token, Phone Number ID e App Secret, cadastrar o webhook | [docs/WHATSAPP.md](docs/WHATSAPP.md) |
| **Templates de lembrete** | Criar e aprovar 3 templates na Meta (obrigatório para lembretes fora da janela de 24h) | [docs/WHATSAPP.md](docs/WHATSAPP.md#4-templates-dos-lembretes) |
| **Banco de produção** | Criar um PostgreSQL (ex.: Supabase) e aplicar as migrações | [docs/INSTALACAO.md](docs/INSTALACAO.md) |
| **Hospedagem com HTTPS** | Publicar (ex.: Vercel) — o webhook da Meta exige HTTPS público | [docs/INSTALACAO.md](docs/INSTALACAO.md) |
| **Agendador dos lembretes** | Chamar `/api/cron/lembretes` a cada minuto | [docs/INSTALACAO.md](docs/INSTALACAO.md#4-agendador-dos-lembretes) |

O envio real de mensagens **ainda não foi testado contra a API da Meta**, porque exige as credenciais da sua conta.
O que foi verificado: o webhook local recebendo eventos assinados no formato da Meta, o fluxo conversacional
completo, a gravação dos agendamentos e o registro das falhas de envio.

## Segurança e privacidade

- Painel e ações administrativas exigem sessão; cada ação valida os dados no servidor e grava em `audit_log`.
- Webhook valida `X-Hub-Signature-256` (HMAC-SHA256 com o App Secret) e recusa tudo sem assinatura válida.
- Endpoint de lembretes exige `Authorization: Bearer <CRON_SECRET>`.
- Segredos somente em variáveis de ambiente; `.env.local` está no `.gitignore`.
- RLS habilitado em todas as tabelas (sem policies): a API REST pública do Supabase não enxerga os dados.
- Uploads validados pelo conteúdo do arquivo (JPG/PNG/WebP, até 4 MB).
- LGPD: consentimento registrado na confirmação do agendamento, opt-out por `SAIR`, política de privacidade
  pública e exclusão/anonimização dos dados em *Painel → Clientes → Privacidade*.
- Backups: veja [docs/INSTALACAO.md](docs/INSTALACAO.md#6-backups).
#   B A M a n i c u r e  
 