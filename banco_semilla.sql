-- ============================================================
-- ARIADNA — Datos semilla para el MVP (Supabase)
-- Ejecutar en el SQL editor de Supabase.
-- ============================================================

-- 1. Insertar Grupos (Vital para que funcione el login G2-014)
insert into groups (id, name, description) values
  (1, 'Control',   'Enseñanza tradicional, sin acceso a Ariadna'),
  (2, 'Hibrido',   'Clase magistral + Ariadna como apoyo en taller'),
  (3, 'Autonomo',  'Ariadna como tutor completo, sin instrucción directa del docente')
on conflict (id) do nothing;


-- 2. Insertar Nodos del Grafo
insert into nodes (id, label, unit, unit_order) values
  ('leyes_exponentes',  'Leyes de exponentes',  'Pre-Calculo', 1),
  ('factorizacion',     'Factorizacion',         'Pre-Calculo', 1),
  ('algebra_derivadas', 'Algebra de derivadas',  'Unidad 3',    3),
  ('regla_cadena',      'Regla de la cadena',    'Unidad 3',    3)
on conflict (id) do nothing;


-- 3. Insertar las Aristas (Conexiones del Grafo)
insert into node_edges (from_node, to_node) values
  ('leyes_exponentes', 'algebra_derivadas'),
  ('factorizacion',    'algebra_derivadas'),
  ('algebra_derivadas','regla_cadena')
on conflict do nothing;


-- 4. Banco de Ejercicios Inicial
insert into exercises (node_id, prompt, correct_expr, prereq_on_fail, fail_reason) values
  -- Álgebra de derivadas
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

  ('algebra_derivadas', 'f(x) = 5x³ − 2x + 8',
   '5*x**3 - 2*x + 8',      'leyes_exponentes',
   'la derivada de una constante es cero y aplicar regla de la potencia a cada término'),

  -- Leyes de exponentes
  ('leyes_exponentes', 'Simplifica: x³ · x⁴',
   'x**7', null, 'multiplicación de potencias con igual base (se suman los exponentes)'),
  ('leyes_exponentes', 'Simplifica: x⁵ / x²',
   'x**3', null, 'división de potencias con igual base (se restan los exponentes)'),
  ('leyes_exponentes', 'Expresa con exponente: raíz cuadrada de x (usa sqrt(x))',
   'sqrt(x)', null, 'conversión de raíz a exponente fraccionario'),

  -- Factorización
  ('factorizacion', 'Expande: (x - 2)(x + 2)',
   'x**2 - 4', null, 'producto notable de diferencia de cuadrados'),
  ('factorizacion', 'Expande: (x + 3)²',
   'x**2 + 6*x + 9', null, 'el cuadrado de un binomio perfecto'),
  ('factorizacion', 'Simplifica multiplicando: x(x² + 5)',
   'x**3 + 5*x', null, 'distributiva en polinomios simples'),

  -- Regla de la cadena
  ('regla_cadena', 'Deriva usando regla de la cadena: f(x) = (2x + 1)³',
   '6*(2*x + 1)**2', 'algebra_derivadas', 'aplicar derivada de la función externa multiplicada por la derivada de la interna (2)')
on conflict do nothing;
