# Deploy na Vercel

Há duas formas de publicar. Comece pela primeira e ative a segunda quando quiser o agendamento automático.

| | **A. Só a landing page** | **B. Sistema completo** |
| --- | --- | --- |
| Banco de dados | Não precisa | Supabase (PostgreSQL) |
| Variáveis na Vercel | Nenhuma obrigatória | `DATABASE_URL` + WhatsApp |
| Site, serviços, preços, contato | Sim | Sim |
| Painel administrativo (`/admin`) | Desligado (404) | Sim |
| Robô do WhatsApp e lembretes | Desligados | Sim |
| Botões de WhatsApp do site | Abrem a conversa normal com o seu número | Idem, e o robô responde |

O que decide o modo é **apenas** a variável `DATABASE_URL`: sem ela, o site sobe em modo landing; com ela, o
sistema completo é ativado. Não é preciso mudar código para trocar de um modo para o outro.

# A. Publicar só a landing page (sem banco)

No modo landing, o conteúdo do site vem de arquivos do próprio projeto:

- `src/conteudo/site.json` — nome, textos, serviços, preços, horários, endereço, WhatsApp, Instagram;
- `public/conteudo/` — logo e fotos.

## Passo a passo

1. Confira o site no seu computador (`npm run dev`) e ajuste o que quiser pelo painel local
   (`http://localhost:3000/admin`).
2. Pare o servidor de desenvolvimento e gere os arquivos de conteúdo:

   ```bash
   npm run site:exportar
   ```

3. Envie o projeto para a Vercel **incluindo** `src/conteudo/site.json` e a pasta `public/conteudo/`.
4. Na Vercel, **não** cadastre `DATABASE_URL`. Recomendado cadastrar apenas:

   | Variável | Valor | Ambiente |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SITE_URL` | `https://seu-dominio` (sem barra no final) | Production |

5. Faça o deploy. No log do build deve aparecer:
   `predeploy: DATABASE_URL não definida — publicando em MODO LANDING`.

## Como atualizar o site depois

Qualquer mudança (preço, serviço novo, foto, horário) segue o mesmo ciclo: alterar no painel local →
`npm run site:exportar` → enviar para a Vercel de novo. No modo landing não há painel online.

## O que fica desligado

- `/admin` e todas as páginas do painel respondem 404.
- `/api/whatsapp/webhook` e `/api/cron/lembretes` respondem 503.
- O link "Área da profissional" some do rodapé.
- A página de privacidade continua descrevendo o agendamento pelo WhatsApp; nesse modo, a conversa é atendida
  manualmente por você.

# B. Publicar o sistema completo (com Supabase)

Use esta parte quando quiser ativar painel, agendamento automático e lembretes. Sem `DATABASE_URL` em produção
e fora do modo landing, o sistema antigo exibia:

```
Error: DATABASE_URL não configurada.
Em produção é obrigatório um PostgreSQL (ex.: Supabase).
```

Hoje esse cenário simplesmente cai no modo landing.

## Por que é preciso um banco

Agendamentos, clientes, conversas e lembretes precisam ser gravados em um PostgreSQL. No computador o sistema usa
um banco embutido de desenvolvimento; em produção esse banco não serve (os dados sumiriam a cada deploy), então o
sistema completo só é ativado quando a variável `DATABASE_URL` aponta para um PostgreSQL de verdade.

## O que o projeto usa (e o que não usa)

| Item | Situação |
| --- | --- |
| Driver | `pg` (node-postgres) com SQL parametrizado. Sem Prisma, sem Drizzle, sem `supabase-js`. |
| `DATABASE_URL` | **Obrigatória.** Única variável de banco. |
| `DIRECT_URL` | Não usada (só faz sentido com Prisma). |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Não usadas. O navegador nunca fala com o Supabase; todo acesso passa pelo servidor. |

Como nenhuma chave do Supabase vai para o frontend, não há credencial exposta no navegador. Mesmo assim, as
migrações habilitam **RLS em todas as tabelas, sem policies**: a API REST pública que o Supabase cria
automaticamente não consegue ler nem gravar nada.

> As telas do Supabase e da Vercel mudam com o tempo. Os nomes abaixo podem estar um pouco diferentes.

## 1. Criar o banco no Supabase

1. Acesse https://supabase.com, crie um projeto e escolha a região **South America (São Paulo)**.
2. Defina a **Database password** e guarde-a em local seguro (gerenciador de senhas). Prefira uma senha só com
   letras e números: caracteres especiais precisam ser codificados na URL (`@` → `%40`, `#` → `%23`, `/` → `%2F`).
3. No topo do projeto, clique em **Connect** e copie a connection string do **Transaction pooler** (porta `6543`).
   Ela tem este formato:

   ```
   postgresql://postgres.<ref-do-projeto>:[YOUR-PASSWORD]@<host-do-pooler>:6543/postgres
   ```

4. Troque `[YOUR-PASSWORD]` pela senha do banco.

Por que o *Transaction pooler*: a Vercel executa o site em funções serverless, que abrem e fecham conexões o tempo
todo. O pooler reaproveita as conexões e evita esgotar o limite do banco. A conexão direta (porta 5432) não é
indicada para esse ambiente.

## 2. Cadastrar as variáveis na Vercel

Em **Vercel → seu projeto → Settings → Environment Variables**, adicione:

| Variável | Valor | Ambientes |
| --- | --- | --- |
| `DATABASE_URL` | connection string do passo 1 | Production e Preview |
| `NEXT_PUBLIC_SITE_URL` | `https://seu-dominio` (sem barra no final) | Production |
| `CRON_SECRET` | valor aleatório longo | Production |
| `WHATSAPP_ACCESS_TOKEN` | veja [WHATSAPP.md](WHATSAPP.md) | Production |
| `WHATSAPP_PHONE_NUMBER_ID` | idem | Production |
| `WHATSAPP_APP_SECRET` | idem | Production |
| `WHATSAPP_VERIFY_TOKEN` | idem | Production |
| `WHATSAPP_GRAPH_VERSION` | ex.: `v23.0` | Production |
| `WHATSAPP_TEMPLATE_LEMBRETE_1H` / `_30MIN` / `_10MIN` | nomes dos templates aprovados | Production |
| `WHATSAPP_TEMPLATE_LANG` | `pt_BR` | Production |

Observações:

- Só `DATABASE_URL` é indispensável para o site abrir. As variáveis do WhatsApp podem ser cadastradas depois;
  enquanto faltarem, o site e o painel funcionam e os envios ficam registrados como falha.
- **Preview** usa o mesmo banco de produção se você marcar `DATABASE_URL` nesse ambiente. Se preferir isolar,
  crie um segundo projeto no Supabase e use a URL dele apenas em Preview.
- **Development** (da Vercel) não é necessário: no seu computador vale o `.env.local`.
- **Não** cadastre `ADMIN_PASSWORD` na Vercel.
- Variáveis novas só valem para deploys feitos **depois** do cadastro.

Para gerar o `CRON_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 3. Fazer o deploy

Em **Deployments**, abra o último deploy → menu **⋯** → **Redeploy** (ou envie um novo commit).

O comando de build (`npm run build`) executa antes `scripts/predeploy.ts`, que:

- conecta no banco e **aplica as migrações pendentes** (cria as tabelas na primeira vez; nas seguintes não altera
  nada que já exista);
- se `DATABASE_URL` não estiver cadastrada, não faz nada e o site sobe em modo landing.

No log do build você deve ver `predeploy: migrações aplicadas: 001_init.sql` (primeiro deploy) ou
`predeploy: banco já está atualizado.` (seguintes).

## 4. Criar a administradora e publicar as configurações

Estes dois comandos rodam **no seu computador**, apontando para o banco de produção.

1. No `.env.local`, preencha `DATABASE_URL` com a mesma connection string do Supabase e confira `ADMIN_NAME`,
   `ADMIN_EMAIL` e `ADMIN_PASSWORD` (mínimo de 10 caracteres — escolha uma senha forte e definitiva).
2. Pare o servidor de desenvolvimento, se estiver rodando.
3. Crie a administradora:

   ```bash
   npm run admin:create
   ```

4. Copie para produção o que já foi configurado localmente (nome, logo, WhatsApp, endereço, Instagram, serviços
   e preços, horários de atendimento):

   ```bash
   npm run db:publicar-config
   ```

   Clientes, agendamentos, conversas e bloqueios do banco local **não** são copiados — eles são dados de teste.

5. Apague `ADMIN_PASSWORD` do `.env.local`.

> Com `DATABASE_URL` preenchida no `.env.local`, o `npm run dev` passa a usar o **banco de produção**. Para voltar
> a desenvolver com o banco local de testes, deixe `DATABASE_URL=` vazia novamente.

## 5. Conferir

- [ ] Log do build mostra a linha `predeploy: ...` sem erro
- [ ] `https://seu-dominio/` abre com nome, logo, serviços e preços
- [ ] `https://seu-dominio/admin` aceita o login da administradora
- [ ] Criar e cancelar um agendamento de teste pelo painel funciona (leitura e gravação)
- [ ] No Supabase → **Table Editor**, as tabelas aparecem com o aviso de RLS habilitado

Depois disso, siga para o WhatsApp ([WHATSAPP.md](WHATSAPP.md)) e para o agendador dos lembretes
([INSTALACAO.md](INSTALACAO.md#4-agendador-dos-lembretes)).

## Problemas comuns

| Mensagem | Causa e solução |
| --- | --- |
| Cadastrei `DATABASE_URL` mas o site continua em modo landing (`/admin` dá 404) | A variável não foi marcada para o ambiente do deploy (Production/Preview) ou o deploy é anterior ao cadastro. Corrija e faça Redeploy. |
| `password authentication failed` | Senha errada ou com caracteres especiais sem codificar. |
| `DATABASE_URL inválida` | A URL não está no formato `postgresql://usuario:senha@host:porta/banco` (em geral, caractere especial na senha). |
| `getaddrinfo ENOTFOUND` / `ETIMEDOUT` | Host errado, ou foi usada a conexão direta (5432) em vez do pooler (6543). |
| `Tenant or user not found` | O usuário deve ser `postgres.<ref-do-projeto>` (com o ponto e o ref), como na string do pooler. |
| Site mostra "Estamos com uma instabilidade" | O servidor não conseguiu consultar o banco. Veja o erro real em **Vercel → Logs** (o código de referência da tela ajuda a localizar). |
| Login diz "E-mail ou senha incorretos" logo após o deploy | A administradora ainda não foi criada no banco de produção (passo 4). |

## Segurança e backups

- A connection string é um segredo: fica só nas variáveis da Vercel e no seu `.env.local` (ignorado pelo Git).
  Nunca a coloque em código, commits, prints ou chats. Se vazar, troque a senha do banco no Supabase e atualize a
  variável.
- A conexão usa TLS sempre. Os logs do sistema não imprimem a URL nem a senha.
- Backups: confira o que o seu plano do Supabase oferece e veja a rotina manual com `pg_dump` em
  [INSTALACAO.md](INSTALACAO.md#6-backups).
