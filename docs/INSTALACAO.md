# Instalação e publicação

> **Publicando na Vercel com Supabase?** Siga o passo a passo específico em [DEPLOY-VERCEL.md](DEPLOY-VERCEL.md).
> Este documento traz a visão geral, o agendador de lembretes, backups e alternativas de hospedagem.

Este guia leva o sistema do computador para a internet. O caminho sugerido (baixo custo e pouca manutenção) é
**Supabase** para o banco e **Vercel** para o site, mas qualquer PostgreSQL e qualquer hospedagem Node.js servem.

> Planos, limites e telas desses serviços mudam com o tempo. Confira as condições atuais antes de contratar.

## 1. Banco de dados (Supabase)

1. Crie um projeto em https://supabase.com e escolha uma região próxima (ex.: São Paulo).
2. Em **Project Settings → Database → Connection string**, copie a URI de conexão.
   - Para hospedagem serverless (Vercel), use a conexão do **pooler em modo transaction** (porta 6543).
   - Para rodar `npm run db:migrate` do seu computador, a mesma URI funciona.
3. No seu computador, coloque a URI em `.env.local`:

   ```
   DATABASE_URL=postgresql://...
   ```

4. Aplique o schema e crie a administradora (com `ADMIN_EMAIL` e `ADMIN_PASSWORD` definidos no `.env.local`):

   ```bash
   npm run db:migrate
   ```

   ```bash
   npm run admin:create
   ```

   Opcional — serviços de exemplo para editar depois:

   ```bash
   npm run db:seed
   ```

5. Depois de criar a administradora, apague `ADMIN_PASSWORD` do `.env.local`.

As migrações habilitam RLS em todas as tabelas sem criar policies. O backend conecta com a role dona das tabelas;
as chaves públicas do Supabase (`anon`) não têm acesso a nenhum dado.

## 2. Hospedagem (Vercel)

1. Envie o projeto para um repositório Git (GitHub, GitLab...). O `.env.local` **não** deve ir junto.
2. Em https://vercel.com, importe o repositório (framework detectado: Next.js).
3. Em **Settings → Environment Variables**, cadastre as variáveis do `.env.example`:

   | Variável | Valor |
   | --- | --- |
   | `DATABASE_URL` | URI do pooler do Supabase |
   | `NEXT_PUBLIC_SITE_URL` | `https://seu-dominio` |
   | `CRON_SECRET` | valor aleatório longo |
   | `WHATSAPP_*` | veja [WHATSAPP.md](WHATSAPP.md) |

   Não cadastre `ADMIN_PASSWORD` na hospedagem.

4. Faça o deploy. A Vercel fornece HTTPS automaticamente; conecte seu domínio em **Settings → Domains**.

Para gerar um segredo aleatório:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Alternativa: servidor próprio (VPS)

```bash
npm ci
```

```bash
npm run build
```

```bash
npm start
```

Use um proxy reverso com HTTPS (Caddy, Nginx + Let's Encrypt) e um gerenciador de processos (systemd, pm2).
Nesse cenário, rode também `npm run worker` como serviço para os lembretes.

## 3. Conectar o WhatsApp

Siga [WHATSAPP.md](WHATSAPP.md). O webhook a cadastrar na Meta é:

```
https://seu-dominio/api/whatsapp/webhook
```

## 4. Agendador dos lembretes

Os lembretes ficam gravados no banco. Para enviá-los, algo precisa chamar, **a cada minuto**:

```
POST https://seu-dominio/api/cron/lembretes
Authorization: Bearer <CRON_SECRET>
```

A chamada é idempotente: chamar duas vezes no mesmo minuto não duplica mensagens. Escolha **uma** das opções:

### Opção A — Supabase `pg_cron` + `pg_net` (recomendada com Supabase)

Em **Database → Extensions**, habilite `pg_cron` e `pg_net`. Depois, no **SQL Editor** (troque domínio e segredo):

```sql
select cron.schedule(
  'lembretes-manicure',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://seu-dominio/api/cron/lembretes',
    headers := jsonb_build_object('Authorization', 'Bearer SEU_CRON_SECRET')
  );
  $$
);
```

Para conferir as execuções: `select * from cron.job_run_details order by start_time desc limit 10;`
Para remover: `select cron.unschedule('lembretes-manicure');`

### Opção B — Serviço de cron externo

Qualquer serviço que faça requisições HTTP agendadas (ex.: cron-job.org, EasyCron, GitHub Actions agendado),
configurado para `POST` na URL acima, a cada minuto, com o cabeçalho `Authorization`.

### Opção C — Worker próprio (VPS ou computador sempre ligado)

```bash
npm run worker
```

O worker lê `CRON_SECRET` e `NEXT_PUBLIC_SITE_URL` (ou `WORKER_TARGET_URL`) do `.env.local`.

> Os agendamentos de cron nativos da Vercel podem não permitir execução a cada minuto em todos os planos. Como os
> lembretes de 10 minutos exigem essa frequência, prefira uma das opções acima e confira os limites do seu plano.

### Verificando

Em *Painel → WhatsApp → Status dos lembretes* você vê cada lembrete (pendente, enviado, falha, cancelado), com
horário programado, horário de envio, tentativas e mensagem de erro. O botão **Processar fila agora** executa o
despacho manualmente; **Tentar de novo** reenfileira um lembrete que falhou.

## 5. Checklist de publicação

- [ ] `npm test` passando
- [ ] Migrações aplicadas no banco de produção
- [ ] Administradora criada e `ADMIN_PASSWORD` removido do `.env.local`
- [ ] Variáveis de ambiente cadastradas na hospedagem
- [ ] Site abrindo em HTTPS no domínio definitivo
- [ ] Painel: nome, WhatsApp, horários e serviços revisados
- [ ] Webhook verificado na Meta e campo `messages` assinado
- [ ] Templates de lembrete aprovados e nomes nas variáveis `WHATSAPP_TEMPLATE_*`
- [ ] Agendador chamando `/api/cron/lembretes` a cada minuto
- [ ] Teste real: enviar "oi" para o número, agendar, receber confirmação, cancelar

## 6. Backups

- **Supabase:** os planos pagos incluem backups diários automáticos; confira o que o seu plano oferece.
- **Manual / qualquer Postgres:** agende um `pg_dump` periódico e guarde o arquivo fora do servidor:

  ```bash
  pg_dump "$DATABASE_URL" --format=custom --file=backup-manicure.dump
  ```

  Restauração: `pg_restore --clean --dbname "$DATABASE_URL" backup-manicure.dump`

O banco contém dados pessoais (nomes, telefones, conversas). Trate os arquivos de backup com o mesmo cuidado:
acesso restrito e armazenamento criptografado.

## 7. Atualizações do schema

Novas alterações de banco entram como arquivos numerados em `db/migrations/` (`002_...sql`, `003_...sql`).
`npm run db:migrate` aplica apenas as que ainda não foram executadas (controle na tabela `schema_migrations`).
