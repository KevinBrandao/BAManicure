# Configuração da WhatsApp Business Cloud API

O atendimento automático usa a **API oficial** da Meta. Um link `wa.me` só abre uma conversa; para receber
mensagens por webhook, responder sozinho e enviar lembretes, é preciso conectar a Cloud API como descrito aqui.

> As telas e os nomes dos menus da Meta mudam com frequência. Se algo estiver diferente, consulte a documentação
> oficial: https://developers.facebook.com/docs/whatsapp/cloud-api

## Antes de começar

- Uma conta no **Meta Business** (business.facebook.com) em nome da profissional.
- Um **número de telefone** para o atendimento automático. Confira nas regras atuais da Meta como esse número
  pode (ou não) continuar sendo usado no aplicativo WhatsApp/WhatsApp Business comum ao mesmo tempo.
- O site já publicado em **HTTPS** (veja [INSTALACAO.md](INSTALACAO.md)) — a Meta não aceita webhook em
  `http://` nem em `localhost`.
- A Cloud API tem **cobrança por mensagem/conversa** conforme a tabela vigente da Meta (mensagens de serviço
  dentro da janela de 24h e templates têm regras de preço diferentes). Consulte os valores atuais.

## 1. Criar o aplicativo

1. Acesse https://developers.facebook.com/apps e crie um app do tipo **Business**.
2. Adicione o produto **WhatsApp** ao app e vincule-o à sua conta do Meta Business.
3. Em **WhatsApp → API Setup (Configuração da API)**:
   - adicione e verifique o seu número de telefone;
   - anote o **Phone Number ID** (identificador do número — não é o número em si).

## 2. Credenciais

| Variável | Onde obter |
| --- | --- |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp → API Setup → *Phone number ID* |
| `WHATSAPP_ACCESS_TOKEN` | Token **permanente** de um *System User* (abaixo) |
| `WHATSAPP_APP_SECRET` | App → Settings → Basic → *App Secret* |
| `WHATSAPP_VERIFY_TOKEN` | Você inventa (texto aleatório longo); o mesmo valor vai no painel da Meta |
| `WHATSAPP_GRAPH_VERSION` | Versão vigente da Graph API mostrada no painel (ex.: `v23.0`) |

### Token permanente

O token exibido na tela de API Setup é temporário (expira em horas). Para produção:

1. Em **Business Settings → Users → System Users**, crie um usuário de sistema com perfil de administrador.
2. Atribua a ele o seu **app** e a sua **conta do WhatsApp Business** (controle total).
3. Clique em **Generate token**, selecione o app e marque as permissões
   `whatsapp_business_messaging` e `whatsapp_business_management`. Escolha expiração "nunca", se disponível.
4. Guarde o token em `WHATSAPP_ACCESS_TOKEN` (somente em variável de ambiente — nunca no código).

Cadastre as variáveis na hospedagem e faça um novo deploy. Em *Painel → WhatsApp*, o **Status da conexão** deve
mostrar "conectado" com o número e o nome verificados; se houver erro, a mensagem da Meta aparece ali.

## 3. Webhook

1. No app, vá em **WhatsApp → Configuration → Webhook → Edit**.
2. **Callback URL:** `https://seu-dominio/api/whatsapp/webhook`
3. **Verify token:** o mesmo valor de `WHATSAPP_VERIFY_TOKEN`.
4. Clique em **Verify and save**. O sistema responde ao desafio automaticamente.
5. Em **Webhook fields**, assine (subscribe) o campo **`messages`** — ele entrega as mensagens recebidas e os
   status de entrega (enviada, entregue, lida, falhou).

O que o sistema faz com cada evento:

- valida a assinatura `X-Hub-Signature-256` com o App Secret (eventos sem assinatura válida recebem 401);
- ignora eventos repetidos (a Meta reenvia quando não recebe resposta a tempo);
- registra a mensagem, avança a conversa e responde;
- atualiza o status de entrega das mensagens enviadas.

### Teste

Envie "oi" de outro celular para o número. A assistente deve responder com o menu. Tudo fica visível em
*Painel → WhatsApp → Conversas*. Se a resposta não chegar, veja *Falhas de envio* no mesmo painel — a mensagem de
erro devolvida pela Meta fica registrada.

## 4. Templates dos lembretes

**Regra da plataforma:** a empresa só pode enviar texto livre até **24 horas** depois da última mensagem da
cliente. Fora dessa janela, mensagens iniciadas pela empresa precisam usar um **template aprovado**.

O sistema decide sozinho, lembrete a lembrete:

- cliente escreveu nas últimas 24h → envia o texto do lembrete normalmente;
- fora da janela → envia o template correspondente;
- fora da janela **e** sem template configurado → não envia e registra a falha no painel.

Como a maioria dos agendamentos é feita com mais de um dia de antecedência, **crie os três templates**.

Em **WhatsApp Manager → Message templates → Create template**: categoria **Utility**, idioma
**Portuguese (BR)** (`pt_BR`), tipo de variável **numérica/posicional** (`{{1}}`, `{{2}}`…). Use os nomes e
textos abaixo (os nomes podem ser outros, desde que você informe os mesmos nas variáveis de ambiente).

### `lembrete_1h` — variáveis: `{{1}}` nome, `{{2}}` serviço, `{{3}}` horário

```
Oi, {{1}}! ❤️

Passando para lembrar que seu horário está chegando!

💅 Serviço: {{2}}
📅 Hoje, às {{3}}.

Falta apenas 1 hora para seu atendimento.
Esperamos você!
```

Exemplos para a análise: `Maria`, `Manicure tradicional`, `14:00`.

### `lembrete_30min` — variáveis: `{{1}}` nome, `{{2}}` horário

```
Oi, {{1}}! Seu atendimento está se aproximando! 💅

Faltam 30 minutos para seu horário de {{2}}.

Até daqui a pouco! ❤️
```

### `lembrete_10min` — variável: `{{1}}` nome

```
Olá, {{1}}!

Seu horário está chegando! ⏰
Faltam apenas 10 minutos para seu atendimento.

Estamos esperando você! ❤️
```

Depois da aprovação, cadastre na hospedagem:

```
WHATSAPP_TEMPLATE_LEMBRETE_1H=lembrete_1h
WHATSAPP_TEMPLATE_LEMBRETE_30MIN=lembrete_30min
WHATSAPP_TEMPLATE_LEMBRETE_10MIN=lembrete_10min
WHATSAPP_TEMPLATE_LANG=pt_BR
```

Se a Meta pedir ajustes no texto, pode alterá-lo livremente — o sistema envia apenas o nome do template e as
variáveis, na ordem indicada acima. **Não mude a quantidade nem a ordem das variáveis.**

## 5. Consentimento e opt-out

- Na tela de confirmação do agendamento, a cliente é informada de que receberá a confirmação e os lembretes
  daquele horário; a data do consentimento fica registrada no cadastro.
- `SAIR` (ou `PARAR`) desativa os lembretes; `LEMBRETES` reativa.
- A política de privacidade pública fica em `/privacidade`.

## 6. Como a conversa funciona

| A cliente envia | O sistema faz |
| --- | --- |
| qualquer mensagem | Boas-vindas + menu (1 a 5) |
| `1` | Nome → serviço → data → horário → resumo → confirmação |
| `2` | Mostra os próximos agendamentos do número |
| `3` ou `CANCELAR` | Localiza o agendamento, pede confirmação e cancela |
| `4` | Lista serviços, valores e duração |
| `5` | Passa para atendimento humano (a assistente fica em silêncio) |
| `MENU` | Volta ao menu a qualquer momento |

Atendimento humano: quando a cliente escolhe a opção 5, a conversa aparece em *Painel → WhatsApp* com o selo
**aguardando você**. A profissional responde pela própria página da conversa (dentro da janela de 24h) e pode
clicar em **Reativar assistente** quando terminar. A cliente também volta ao robô enviando `MENU`.

## 7. Problemas comuns

| Sintoma | Causa provável |
| --- | --- |
| "Verify and save" falha | URL sem HTTPS, deploy sem as variáveis, ou verify token diferente |
| Mensagens chegam à Meta mas o sistema não responde | Campo `messages` não assinado, ou `WHATSAPP_APP_SECRET` incorreto (webhook devolve 401) |
| Respostas aparecem como falha no painel | Token expirado/sem permissão ou Phone Number ID errado — leia o erro registrado |
| Lembrete falhou com aviso da janela de 24h | Template não configurado ou ainda não aprovado |
| Lembretes não saem | Agendador não está chamando `/api/cron/lembretes` (veja [INSTALACAO.md](INSTALACAO.md#4-agendador-dos-lembretes)) |
| Cliente cadastrada pelo painel não é reconhecida no WhatsApp | Telefone digitado errado; o sistema já trata a variação com/sem o nono dígito |
