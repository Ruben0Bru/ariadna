-- ============================================================
-- ARIADNA — Esquema mínimo para el MVP (RF-01, RF-09, RF-14, RF-16)
-- Ejecutar en el SQL editor de Supabase, en orden.
-- ⚠️  Este esquema NO debe cambiar después de S8 (inicio de intervención).
-- ============================================================

-- 1. Grupos experimentales (fijo: 3 filas, precargadas abajo)
create table if not exists groups (
  id smallint primary key,
  name text not null,
  description text
);

insert into groups (id, name, description) values
  (1, 'Control',   'Enseñanza tradicional, sin acceso a Ariadna'),
  (2, 'Hibrido',   'Clase magistral + Ariadna como apoyo en taller'),
  (3, 'Autonomo',  'Ariadna como tutor completo, sin instrucción directa del docente')
on conflict (id) do nothing;

-- 2. Estudiantes — identificados por código, no por login tradicional (RF-14)
create table if not exists students (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,        -- código asignado en el reclutamiento, ej. "G2-014"
  group_id       smallint not null references groups(id),
  mastered_nodes text[] not null default '{}', -- array de nodos ya dominados
  created_at     timestamptz not null default now()
);

-- 3. Nodos del grafo de conocimiento (RF-01)
create table if not exists nodes (
  id         text primary key,            -- slug estable, ej. 'algebra_derivadas'
  label      text not null,
  unit       text not null,               -- 'Unidad 3', 'Pre-Calculo', etc.
  unit_order smallint not null default 0
);

-- 4. Aristas de prerrequisito: from_node es prerrequisito de to_node
create table if not exists node_edges (
  from_node text not null references nodes(id),
  to_node   text not null references nodes(id),
  primary key (from_node, to_node)
);

-- 5. Banco de ejercicios (RF-09) — validado por el docente antes de usarse
create table if not exists exercises (
  id           serial primary key,
  node_id      text not null references nodes(id),
  prompt       text not null,             -- enunciado mostrado al estudiante
  correct_expr text not null,             -- f(x) SIN derivar; o string plano para simplify
  variable     text not null default 'x',
  prereq_on_fail text references nodes(id),
  fail_reason  text,
  active       boolean not null default true
);

-- 6. Intentos — el dato crudo que alimenta el análisis de la tesis (RF-16, RNF-04)
create table if not exists attempts (
  id              bigserial primary key,
  student_id      uuid not null references students(id),
  exercise_id     integer not null references exercises(id),
  node_id         text not null references nodes(id),
  student_answer  text not null,
  is_correct      boolean not null,
  error_type      text,                   -- 'signo' | 'no_derivo' | 'exponente_o_coeficiente' | 'desconocido' | null si correcto
  prereq_suggested text references nodes(id),
  llm_feedback    text,                   -- texto que efectivamente se le mostró al estudiante
  response_time_ms integer,              -- latencia total percibida (RNF-03)
  created_at      timestamptz not null default now()
);

create index if not exists idx_attempts_student  on attempts(student_id);
create index if not exists idx_attempts_exercise on attempts(exercise_id);
create index if not exists idx_attempts_created  on attempts(created_at);

-- 7. Chat Logs — Registro de los prompts libres al tutor (NUEVO)
create table if not exists chat_logs (
  id              bigserial primary key,
  student_id      uuid not null references students(id),
  node_context    text not null,
  user_prompt     text not null,
  ai_response     text not null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_chat_student on chat_logs(student_id);

-- 8. Mastery Logs — Registro exacto de cuándo dominó un nodo (NUEVO)
create table if not exists mastery_logs (
  id              bigserial primary key,
  student_id      uuid not null references students(id),
  node_id         text not null references nodes(id),
  created_at      timestamptz not null default now()
);

-- ============================================================
-- Datos semilla: DAG recortado de Unidad 3 + Pre-Cálculo
-- ============================================================
insert into nodes (id, label, unit, unit_order) values
  ('leyes_exponentes',  'Leyes de exponentes',  'Pre-Calculo', 1),
  ('factorizacion',     'Factorizacion',         'Pre-Calculo', 1),
  ('algebra_derivadas', 'Algebra de derivadas',  'Unidad 3',    3),
  ('regla_cadena',      'Regla de la cadena',    'Unidad 3',    3)
on conflict (id) do nothing;

insert into node_edges (from_node, to_node) values
  ('leyes_exponentes', 'algebra_derivadas'),
  ('factorizacion',    'algebra_derivadas'),
  ('algebra_derivadas','regla_cadena')
on conflict do nothing;

-- Banco de ejercicios inicial (validar con docente antes de S8)
insert into exercises (node_id, prompt, correct_expr, prereq_on_fail, fail_reason) values
  ('algebra_derivadas', 'f(x) = 3x² − 5x + 2',
   '3*x**2 - 5*x + 2',      'leyes_exponentes',
   'leyes de exponentes al derivar potencias (regla de la potencia: baja el exponente y resta 1)'),

  ('algebra_derivadas', 'f(x) = (x² − 1)(x + 3)  — expande antes de derivar',
   '(x**2 - 1)*(x + 3)',    'factorizacion',
   'expansión y simplificación de productos algebraicos antes de aplicar la regla de la potencia'),

  ('algebra_derivadas', 'f(x) = x³ / x  — simplifica primero',
   'x**3 / x',              'factorizacion',
   'simplificación de fracciones algebraicas antes de derivar'),

  ('algebra_derivadas', 'f(x) = 4x⁴ − 3x³ + 2x − 7',
   '4*x**4 - 3*x**3 + 2*x - 7', 'leyes_exponentes',
   'aplicar la regla de la potencia a cada término del polinomio'),

  ('algebra_derivadas', 'f(x) = x² · x³',
   'x**2 * x**3',           'factorizacion',
   'simplificar el producto de potencias con la misma base antes de derivar'),

  ('algebra_derivadas', 'f(x) = (2x − 1)²  — expande el cuadrado primero',
   '(2*x - 1)**2',          'factorizacion',
   'expandir el cuadrado de un binomio (a−b)² = a² − 2ab + b² antes de derivar'),

  ('algebra_derivadas', 'f(x) = x^(1/2) + x^(1/3)',
   'x**(sp.Rational(1,2)) + x**(sp.Rational(1,3))', 'leyes_exponentes',
   'convertir radicales a exponentes fraccionarios para aplicar la regla de la potencia'),

  ('algebra_derivadas', 'f(x) = 5x³ − 2x + 8',
   '5*x**3 - 2*x + 8',      'leyes_exponentes',
   'la derivada de una constante es cero y aplicar regla de la potencia a cada término'),

  -- EJERCICIOS LEYES DE EXPONENTES
  ('leyes_exponentes', 'Simplifica: x³ · x⁴',
   'x**7', null, 'multiplicación de potencias con igual base (se suman los exponentes)'),
  ('leyes_exponentes', 'Simplifica: x⁵ / x²',
   'x**3', null, 'división de potencias con igual base (se restan los exponentes)'),
  ('leyes_exponentes', 'Expresa con exponente: raíz cuadrada de x (usa sqrt(x))',
   'sqrt(x)', null, 'conversión de raíz a exponente fraccionario'),

  -- EJERCICIOS FACTORIZACIÓN
  ('factorizacion', 'Expande: (x - 2)(x + 2)',
   'x**2 - 4', null, 'producto notable de diferencia de cuadrados'),
  ('factorizacion', 'Expande: (x + 3)²',
   'x**2 + 6*x + 9', null, 'el cuadrado de un binomio perfecto'),
  ('factorizacion', 'Simplifica multiplicando: x(x² + 5)',
   'x**3 + 5*x', null, 'distributiva en polinomios simples'),

  -- EJERCICIOS REGLA DE LA CADENA
  ('regla_cadena', 'Deriva usando regla de la cadena: f(x) = (2x + 1)³',
   '6*(2*x + 1)**2', 'algebra_derivadas', 'aplicar derivada de la función externa multiplicada por la derivada de la interna (2)')
on conflict do nothing;

-- ============================================================
-- Funciones Auxiliares (RPC)
-- ============================================================
create or replace function append_mastered_node(p_student_id uuid, p_node_id text)
returns void as $$
begin
  update students
  set mastered_nodes = array_append(mastered_nodes, p_node_id)
  where id = p_student_id and not (mastered_nodes @> array[p_node_id]::text[]);
end;
$$ language plpgsql;

-- ============================================================
-- Nota de seguridad (RNF-06): activar RLS antes de S8.
-- ============================================================
-- alter table attempts enable row level security;
-- alter table students enable row level security;
-- (Configurar políticas según el consentimiento informado)
