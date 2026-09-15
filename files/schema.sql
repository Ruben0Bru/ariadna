-- ============================================================
-- ARIADNA — Esquema mínimo para el MVP (RF-01, RF-09, RF-14, RF-16)
-- Ejecutar en el SQL editor de Supabase, en orden.
-- ============================================================

-- 1. Grupos experimentales (fijo: 3 filas, precargadas abajo)
create table groups (
  id smallint primary key,
  name text not null,
  description text
);

insert into groups (id, name, description) values
  (1, 'Control', 'Enseñanza tradicional, sin acceso a Ariadna'),
  (2, 'Hibrido', 'Clase magistral + Ariadna como apoyo en taller'),
  (3, 'Autonomo', 'Ariadna como tutor completo, sin instrucción directa del docente');

-- 2. Estudiantes — identificados por código, no por login tradicional (RF-14)
create table students (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,           -- código asignado en el reclutamiento, ej. "G2-014"
  group_id smallint not null references groups(id),
  created_at timestamptz not null default now()
);

-- 3. Nodos del grafo de conocimiento (RF-01)
create table nodes (
  id text primary key,                 -- slug estable, ej. 'algebra_derivadas'
  label text not null,
  unit text not null,                  -- 'Unidad 3', 'Pre-Calculo', etc.
  unit_order smallint not null default 0
);

-- 4. Aristas de prerrequisito: from_node es prerrequisito de to_node
create table node_edges (
  from_node text not null references nodes(id),
  to_node text not null references nodes(id),
  primary key (from_node, to_node)
);

-- 5. Banco de ejercicios (RF-09) — validado por el docente antes de usarse
create table exercises (
  id serial primary key,
  node_id text not null references nodes(id),
  prompt text not null,                -- enunciado mostrado al estudiante, ej. "f(x) = 3x^2 - 5x + 2"
  correct_expr text not null,          -- f(x) SIN derivar; el backend deriva con SymPy
  variable text not null default 'x',
  prereq_on_fail text references nodes(id),
  fail_reason text,
  active boolean not null default true
);

-- 6. Intentos — el dato crudo que alimenta el análisis de la tesis (RF-16, RNF-04)
-- Este esquema NO debe cambiar una vez arranque la intervención (S8).
create table attempts (
  id bigserial primary key,
  student_id uuid not null references students(id),
  exercise_id integer not null references exercises(id),
  node_id text not null references nodes(id),
  student_answer text not null,
  is_correct boolean not null,
  error_type text,                     -- 'signo' | 'no_derivo' | 'exponente' | 'sin_simplificar' | 'desconocido' | null si correcto
  prereq_suggested text references nodes(id),
  llm_feedback text,                   -- texto que efectivamente se le mostró al estudiante
  response_time_ms integer,            -- latencia total percibida, útil para RNF-03 en producción
  created_at timestamptz not null default now()
);

create index idx_attempts_student on attempts(student_id);
create index idx_attempts_exercise on attempts(exercise_id);
create index idx_attempts_created on attempts(created_at);

-- ============================================================
-- Datos semilla: DAG recortado de Unidad 3 + Pre-Cálculo (el mismo del prototipo)
-- ============================================================
insert into nodes (id, label, unit, unit_order) values
  ('leyes_exponentes',  'Leyes de exponentes', 'Pre-Calculo', 1),
  ('factorizacion',     'Factorizacion',       'Pre-Calculo', 1),
  ('algebra_derivadas', 'Algebra derivadas',   'Unidad 3',    3),
  ('regla_cadena',      'Regla cadena',        'Unidad 3',    3);

insert into node_edges (from_node, to_node) values
  ('leyes_exponentes', 'algebra_derivadas'),
  ('factorizacion',    'algebra_derivadas'),
  ('algebra_derivadas','regla_cadena');

insert into exercises (node_id, prompt, correct_expr, prereq_on_fail, fail_reason) values
  ('algebra_derivadas', 'f(x) = 3x^2 - 5x + 2',        '3*x**2 - 5*x + 2', 'leyes_exponentes', 'leyes de exponentes al derivar potencias (regla de la potencia: baja el exponente y resta 1)'),
  ('algebra_derivadas', 'f(x) = (x^2 - 1)(x + 3)',      '(x**2 - 1)*(x + 3)', 'factorizacion',   'expansion y simplificacion de productos algebraicos antes de aplicar la regla de la potencia'),
  ('algebra_derivadas', 'f(x) = x^3 / x',               'x**3 / x',           'factorizacion',   'simplificacion de fracciones algebraicas antes de derivar');

-- ============================================================
-- Nota de seguridad (RNF-06): esto NO implementa Row Level Security todavía.
-- Antes de exponer esto públicamente hay que activar RLS en `attempts` y
-- `students` para que un estudiante no pueda leer los intentos de otro
-- solo con la anon key. Pendiente antes de S8, no antes de tener el
-- backend de verificación funcionando.
-- ============================================================
