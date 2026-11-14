-- ============================================================================
-- Schema inicial — Sistema de agendamento para manicure
-- Fuso horário de negócio: America/Sao_Paulo (instantes gravados em timestamptz)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- USERS (administradoras do painel) + sessões
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text NOT NULL CHECK (length(trim(nome)) > 0),
  email       text NOT NULL UNIQUE CHECK (email = lower(email)),
  senha_hash  text NOT NULL,
  role        text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token_hash  text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE login_attempts (
  id          bigserial PRIMARY KEY,
  email       text NOT NULL,
  sucesso     boolean NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_idx ON login_attempts(email, created_at);

-- ---------------------------------------------------------------------------
-- IMAGENS (fotos de serviços, galeria e site) armazenadas no próprio banco
-- ---------------------------------------------------------------------------
CREATE TABLE images (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mime        text NOT NULL CHECK (mime IN ('image/jpeg','image/png','image/webp')),
  dados       bytea NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE gallery_photos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id    uuid NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  categoria   text NOT NULL DEFAULT 'Geral',
  legenda     text,
  ordem       integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gallery_photos_cat_idx ON gallery_photos(categoria, ordem);

-- ---------------------------------------------------------------------------
-- CUSTOMERS
-- ---------------------------------------------------------------------------
CREATE TABLE customers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome              text NOT NULL CHECK (length(trim(nome)) > 0),
  -- somente dígitos, com DDI (ex.: 5511999998888), como enviado pelo WhatsApp
  telefone          text NOT NULL UNIQUE CHECK (telefone ~ '^[0-9]{8,15}$'),
  aceita_lembretes  boolean NOT NULL DEFAULT true,
  consentimento_em  timestamptz,
  observacoes       text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- SERVICES
-- ---------------------------------------------------------------------------
CREATE TABLE services (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome               text NOT NULL CHECK (length(trim(nome)) > 0),
  descricao          text NOT NULL DEFAULT '',
  preco_centavos     integer NOT NULL CHECK (preco_centavos >= 0),
  duracao_minutos    integer NOT NULL CHECK (duracao_minutos > 0 AND duracao_minutos <= 720),
  intervalo_minutos  integer NOT NULL DEFAULT 0 CHECK (intervalo_minutos >= 0 AND intervalo_minutos <= 240),
  ativo              boolean NOT NULL DEFAULT true,
  image_id           uuid REFERENCES images(id) ON DELETE SET NULL,
  ordem              integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX services_ativo_idx ON services(ativo, ordem);

-- ---------------------------------------------------------------------------
-- BUSINESS_HOURS (expediente semanal; 0 = domingo ... 6 = sábado)
-- ---------------------------------------------------------------------------
CREATE TABLE business_hours (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dia_semana        smallint NOT NULL UNIQUE CHECK (dia_semana BETWEEN 0 AND 6),
  horario_inicio    time NOT NULL,
  horario_fim       time NOT NULL,
  intervalo_inicio  time,
  intervalo_fim     time,
  ativo             boolean NOT NULL DEFAULT true,
  CHECK (horario_inicio < horario_fim),
  CHECK ((intervalo_inicio IS NULL) = (intervalo_fim IS NULL)),
  CHECK (intervalo_inicio IS NULL OR
         (intervalo_inicio < intervalo_fim AND intervalo_inicio >= horario_inicio AND intervalo_fim <= horario_fim))
);

-- Datas especiais: expediente diferente do padrão em um dia específico
CREATE TABLE special_dates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data              date NOT NULL UNIQUE,
  horario_inicio    time NOT NULL,
  horario_fim       time NOT NULL,
  intervalo_inicio  time,
  intervalo_fim     time,
  motivo            text,
  CHECK (horario_inicio < horario_fim),
  CHECK ((intervalo_inicio IS NULL) = (intervalo_fim IS NULL)),
  CHECK (intervalo_inicio IS NULL OR
         (intervalo_inicio < intervalo_fim AND intervalo_inicio >= horario_inicio AND intervalo_fim <= horario_fim))
);

-- ---------------------------------------------------------------------------
-- BLOCKED_TIMES
--   data + horários nulos      => dia inteiro bloqueado (feriado, folga)
--   data + horários            => período bloqueado naquela data
--   dia_semana + horários      => pausa recorrente semanal
-- ---------------------------------------------------------------------------
CREATE TABLE blocked_times (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data            date,
  dia_semana      smallint CHECK (dia_semana BETWEEN 0 AND 6),
  horario_inicio  time,
  horario_fim     time,
  motivo          text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK ((data IS NOT NULL) <> (dia_semana IS NOT NULL)),
  CHECK ((horario_inicio IS NULL) = (horario_fim IS NULL)),
  CHECK (horario_inicio IS NULL OR horario_inicio < horario_fim),
  CHECK (dia_semana IS NULL OR horario_inicio IS NOT NULL)
);
CREATE INDEX blocked_times_data_idx ON blocked_times(data);

-- ---------------------------------------------------------------------------
-- APPOINTMENTS
--   inicio / fim   => período do atendimento
--   ocupado_ate    => fim + intervalo adicional do serviço (tempo reservado)
-- ---------------------------------------------------------------------------
CREATE TABLE appointments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo                text NOT NULL UNIQUE,
  customer_id           uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  service_id            uuid NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  inicio                timestamptz NOT NULL,
  fim                   timestamptz NOT NULL,
  ocupado_ate           timestamptz NOT NULL,
  preco_centavos        integer NOT NULL CHECK (preco_centavos >= 0),
  status                text NOT NULL DEFAULT 'CONFIRMADO'
                        CHECK (status IN ('PENDENTE','CONFIRMADO','CANCELADO','CONCLUIDO','NAO_COMPARECEU')),
  origem                text NOT NULL DEFAULT 'WHATSAPP' CHECK (origem IN ('WHATSAPP','ADMIN')),
  observacoes           text,
  cancelado_em          timestamptz,
  cancelado_por         text CHECK (cancelado_por IN ('CLIENTE','ADMIN')),
  motivo_cancelamento   text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (inicio < fim),
  CHECK (fim <= ocupado_ate),
  -- RB01/RB03: dois agendamentos ativos nunca se sobrepõem. A restrição é
  -- verificada pelo próprio banco, de forma atômica, mesmo sob concorrência.
  CONSTRAINT appointments_sem_sobreposicao
    EXCLUDE USING gist (tstzrange(inicio, ocupado_ate, '[)') WITH &&)
    WHERE (status IN ('PENDENTE','CONFIRMADO'))
);
CREATE INDEX appointments_inicio_idx   ON appointments(inicio);
CREATE INDEX appointments_customer_idx ON appointments(customer_id, inicio);
CREATE INDEX appointments_status_idx   ON appointments(status, inicio);

-- ---------------------------------------------------------------------------
-- REMINDERS
-- ---------------------------------------------------------------------------
CREATE TABLE reminders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  tipo            text NOT NULL CHECK (tipo IN ('1H','30MIN','10MIN')),
  scheduled_at    timestamptz NOT NULL,
  sent_at         timestamptz,
  status          text NOT NULL DEFAULT 'PENDENTE'
                  CHECK (status IN ('PENDENTE','ENVIANDO','ENVIADO','FALHA','CANCELADO','EXPIRADO')),
  attempts        integer NOT NULL DEFAULT 0,
  error_message   text,
  wa_message_id   text,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- RB14: no máximo um lembrete de cada tipo por agendamento
  UNIQUE (appointment_id, tipo)
);
CREATE INDEX reminders_due_idx ON reminders(status, scheduled_at);

-- ---------------------------------------------------------------------------
-- WHATSAPP_MESSAGES (histórico de mensagens enviadas e recebidas)
-- ---------------------------------------------------------------------------
CREATE TABLE whatsapp_messages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    uuid REFERENCES customers(id) ON DELETE SET NULL,
  telefone       text NOT NULL,
  direcao        text NOT NULL CHECK (direcao IN ('ENTRADA','SAIDA')),
  tipo           text NOT NULL DEFAULT 'texto',
  mensagem       text NOT NULL,
  status         text NOT NULL CHECK (status IN ('RECEBIDA','ENVIADA','ENTREGUE','LIDA','FALHA')),
  wa_message_id  text,
  erro           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_messages_tel_idx ON whatsapp_messages(telefone, created_at);
CREATE INDEX whatsapp_messages_status_idx ON whatsapp_messages(status, created_at);
-- Proteção contra webhooks duplicados: cada mensagem recebida entra uma única vez
CREATE UNIQUE INDEX whatsapp_messages_wa_in_uidx
  ON whatsapp_messages(wa_message_id) WHERE direcao = 'ENTRADA' AND wa_message_id IS NOT NULL;
CREATE INDEX whatsapp_messages_wa_idx ON whatsapp_messages(wa_message_id);

-- ---------------------------------------------------------------------------
-- CONVERSATIONS (estado do fluxo conversacional por telefone)
-- ---------------------------------------------------------------------------
CREATE TABLE conversations (
  telefone    text PRIMARY KEY,
  estado      text NOT NULL,
  dados       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- SETTINGS (configurações do site e políticas)
-- ---------------------------------------------------------------------------
CREATE TABLE settings (
  chave       text PRIMARY KEY,
  valor       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- AUDIT_LOG (registro de operações administrativas)
-- ---------------------------------------------------------------------------
CREATE TABLE audit_log (
  id           bigserial PRIMARY KEY,
  user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  acao         text NOT NULL,
  entidade     text,
  entidade_id  text,
  detalhes     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_created_idx ON audit_log(created_at);

-- ---------------------------------------------------------------------------
-- Expediente padrão (editável no painel): seg–sex 09–18 com almoço, sáb 09–13
-- ---------------------------------------------------------------------------
INSERT INTO business_hours (dia_semana, horario_inicio, horario_fim, intervalo_inicio, intervalo_fim, ativo) VALUES
  (0, '09:00', '18:00', NULL,    NULL,    false),
  (1, '09:00', '18:00', '12:00', '13:00', true),
  (2, '09:00', '18:00', '12:00', '13:00', true),
  (3, '09:00', '18:00', '12:00', '13:00', true),
  (4, '09:00', '18:00', '12:00', '13:00', true),
  (5, '09:00', '18:00', '12:00', '13:00', true),
  (6, '09:00', '13:00', NULL,    NULL,    true);

-- ---------------------------------------------------------------------------
-- Políticas de acesso (RLS)
-- O backend conecta com a role dona das tabelas (que ignora RLS). Com RLS
-- ligado e nenhuma policy criada, as roles públicas do Supabase (anon /
-- authenticated, usadas pela API REST automática) não enxergam nenhuma linha.
-- ---------------------------------------------------------------------------
ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_attempts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE images            ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_photos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE services          ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_hours    ENABLE ROW LEVEL SECURITY;
ALTER TABLE special_dates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_times     ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log         ENABLE ROW LEVEL SECURITY;
