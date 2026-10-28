-- =============================================================
-- ARIADNA — Migración 001: Schema v2
-- Idempotente: se puede ejecutar varias veces sin romper datos.
-- Ejecutar en: Supabase → SQL Editor
-- Fecha: 2026-10-28
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 0. Asegurar que las tablas BASE existen (por si schema.sql
--    no fue ejecutado previamente en este entorno)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS groups (
  id          smallint PRIMARY KEY,
  name        text NOT NULL,
  description text
);

INSERT INTO groups (id, name, description) VALUES
  (1, 'Control',  'Enseñanza tradicional, sin acceso a Ariadna'),
  (2, 'Hibrido',  'Clase magistral + Ariadna como apoyo en taller'),
  (3, 'Autonomo', 'Ariadna como tutor completo, sin instrucción directa del docente')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS students (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text NOT NULL UNIQUE,
  group_id       smallint NOT NULL REFERENCES groups(id),
  mastered_nodes text[] NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nodes (
  id         text PRIMARY KEY,
  label      text NOT NULL,
  unit       text NOT NULL,
  unit_order smallint NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS node_edges (
  from_node text NOT NULL REFERENCES nodes(id),
  to_node   text NOT NULL REFERENCES nodes(id),
  PRIMARY KEY (from_node, to_node)
);

CREATE TABLE IF NOT EXISTS exercises (
  id            serial PRIMARY KEY,
  node_id       text NOT NULL REFERENCES nodes(id),
  prompt        text NOT NULL,
  correct_expr  text NOT NULL,
  variable      text NOT NULL DEFAULT 'x',
  prereq_on_fail text REFERENCES nodes(id),
  fail_reason   text,
  active        boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS attempts (
  id               bigserial PRIMARY KEY,
  student_id       uuid NOT NULL REFERENCES students(id),
  exercise_id      integer NOT NULL REFERENCES exercises(id),
  node_id          text NOT NULL REFERENCES nodes(id),
  student_answer   text NOT NULL,
  is_correct       boolean NOT NULL,
  error_type       text,
  prereq_suggested text REFERENCES nodes(id),
  llm_feedback     text,
  response_time_ms integer,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attempts_student  ON attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_attempts_exercise ON attempts(exercise_id);
CREATE INDEX IF NOT EXISTS idx_attempts_created  ON attempts(created_at);

-- chat_logs: base (en caso de que no exista)
CREATE TABLE IF NOT EXISTS chat_logs (
  id           bigserial PRIMARY KEY,
  student_id   uuid NOT NULL REFERENCES students(id),
  node_context text NOT NULL,
  user_prompt  text NOT NULL,
  ai_response  text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_student ON chat_logs(student_id);

CREATE TABLE IF NOT EXISTS mastery_logs (
  id         bigserial PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES students(id),
  node_id    text NOT NULL REFERENCES nodes(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teachers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text NOT NULL UNIQUE,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO teachers (code, name) VALUES ('PROF-001', 'Docente 1')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS class_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id   uuid REFERENCES teachers(id),
  exercise_ids jsonb NOT NULL DEFAULT '[]',
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_sessions_active ON class_sessions(active) WHERE active = true;

-- ─────────────────────────────────────────────────────────────
-- 1. attempts — nuevas columnas de investigación
-- ─────────────────────────────────────────────────────────────
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS group_id    smallint REFERENCES groups(id);
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS session_id  uuid;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS attempt_kind text
  CHECK (attempt_kind IN ('evaluated', 'syntax_error', 'unverifiable'));

-- ─────────────────────────────────────────────────────────────
-- 2. chat_logs — nuevas columnas de investigación
-- ─────────────────────────────────────────────────────────────
ALTER TABLE chat_logs ADD COLUMN IF NOT EXISTS group_id        smallint REFERENCES groups(id);
ALTER TABLE chat_logs ADD COLUMN IF NOT EXISTS session_id      uuid;
ALTER TABLE chat_logs ADD COLUMN IF NOT EXISTS turn_number     integer;
ALTER TABLE chat_logs ADD COLUMN IF NOT EXISTS latency_ms      integer;
ALTER TABLE chat_logs ADD COLUMN IF NOT EXISTS flagged_offtopic boolean NOT NULL DEFAULT false;
ALTER TABLE chat_logs ADD COLUMN IF NOT EXISTS model           text;

-- ─────────────────────────────────────────────────────────────
-- 3. students — consentimiento y estado
-- ─────────────────────────────────────────────────────────────
ALTER TABLE students ADD COLUMN IF NOT EXISTS consent_at  timestamptz;
ALTER TABLE students ADD COLUMN IF NOT EXISTS active      boolean NOT NULL DEFAULT true;
ALTER TABLE students ADD COLUMN IF NOT EXISTS created_by  uuid;

-- ─────────────────────────────────────────────────────────────
-- 4. teachers — autenticación real (Fase 6)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'teacher'
  CHECK (role IN ('teacher', 'researcher'));

-- ─────────────────────────────────────────────────────────────
-- 5. exercises — metadatos y nueva semántica de correct_expr
-- ─────────────────────────────────────────────────────────────
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS answer_type text NOT NULL DEFAULT 'expression'
  CHECK (answer_type IN ('expression', 'text'));
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS accepted_answers text[];
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS fx         text;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS difficulty smallint;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS validated  boolean NOT NULL DEFAULT false;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS source     text;

COMMENT ON COLUMN exercises.correct_expr IS
  'RESPUESTA ESPERADA (derivada o respuesta ya simplificada). '
  'NO es f(x) original — para eso usar el campo fx.';

-- ─────────────────────────────────────────────────────────────
-- 6. Tablas nuevas
-- ─────────────────────────────────────────────────────────────

-- app_events: logging de eventos de navegación/interacción
CREATE TABLE IF NOT EXISTS app_events (
  id          bigserial PRIMARY KEY,
  student_id  uuid REFERENCES students(id),
  session_id  uuid,
  event_type  text NOT NULL,
  payload     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_events_student ON app_events(student_id);
CREATE INDEX IF NOT EXISTS idx_app_events_type    ON app_events(event_type);

-- study_sessions: duración de cada sesión de trabajo
CREATE TABLE IF NOT EXISTS study_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL REFERENCES students(id),
  group_id    smallint REFERENCES groups(id),
  started_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_study_sessions_student ON study_sessions(student_id);

-- ─────────────────────────────────────────────────────────────
-- 7. RLS — habilitar en todas las tablas
--    Sin políticas anon → todo acceso vía service role key
-- ─────────────────────────────────────────────────────────────
ALTER TABLE students       ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE mastery_logs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises      ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_sessions ENABLE ROW LEVEL SECURITY;
-- groups y nodes son tablas de referencia; pueden quedar sin RLS
-- o con política de lectura pública si se prefiere.

-- ─────────────────────────────────────────────────────────────
-- 8. Funciones auxiliares (idempotente)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION append_mastered_node(p_student_id uuid, p_node_id text)
RETURNS void AS $$
BEGIN
  UPDATE students
  SET mastered_nodes = array_append(mastered_nodes, p_node_id)
  WHERE id = p_student_id
    AND NOT (mastered_nodes @> ARRAY[p_node_id]::text[]);
END;
$$ LANGUAGE plpgsql;

-- FIN DE MIGRACIÓN 001
