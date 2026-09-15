# Ariadna — Requisitos del MVP

Alcance: Unidad 3 (Álgebra de derivadas) de Cálculo I, con backtracking a Pre-Cálculo. Grupos 2 (apoyo en taller) y 3 (tutor completo). Objetivo: sistema utilizable por estudiantes reales antes del pre-test (S8), no una demo.

Cada requisito lleva una prioridad: **M0** (bloquea el pre-test/inicio de intervención), **M1** (necesario antes de terminar la intervención), **P2** (mejora, no bloquea nada).

---

## 1. Requisitos Funcionales

### 1.1 Grafo de conocimiento (DAG)
- **RF-01 (M0)** El sistema debe representar el DAG de Unidad 3 + nodos de Pre-Cálculo como datos persistentes (no hardcodeados en el frontend como en el prototipo), con cada nodo referenciando su(s) prerrequisito(s) y su(s) nodo(s) siguiente(s).
- **RF-02 (M0)** El sistema debe poder ubicar a un estudiante en un nodo específico del grafo y recuperar cuál es el nodo prerrequisito recomendado cuando falla.
- **RF-03 (M1)** El sistema debe permitir avanzar al estudiante al nodo siguiente cuando domina el nodo actual (no solo retroceder — el diseño original contempla ambas direcciones).
- **RF-04 (P2)** El sistema debe permitir editar el grafo (agregar/quitar nodos o aristas) sin tocar código, para cuando amplíen a las otras 3 unidades.

### 1.2 Motor de verificación simbólica
- **RF-05 (M0)** El sistema debe verificar la equivalencia matemática entre la respuesta del estudiante y la respuesta esperada usando un motor simbólico real (SymPy en backend Python), no aproximación numérica de cliente como en el prototipo.
- **RF-06 (M0)** El motor debe manejar, como mínimo, los tipos de expresión de la Unidad 3: polinomios, productos/cocientes algebraicos, expresiones con radicales y exponentes.
- **RF-07 (M1)** Cuando la respuesta es incorrecta, el motor debe intentar clasificar el tipo de error (ej. error de signo, error de exponente, error de simplificación) para que el diagnóstico de backtracking sea específico y no genérico.
- **RF-08 (M0)** El motor debe rechazar con seguridad cualquier entrada que no sea una expresión matemática válida (sin ejecutar código arbitrario del estudiante — el parser de SymPy debe correr en modo seguro, sin `eval` directo sobre texto libre).

### 1.3 Banco de ejercicios
- **RF-09 (M0)** El sistema debe tener un banco de ejercicios reales (mínimo 8-10) para el nodo de Álgebra de derivadas, cada uno con su expresión correcta y el prerrequisito asociado en caso de fallo, validado por el docente de Cálculo I antes de usarse con estudiantes.
- **RF-10 (M1)** El sistema debe poder presentar ejercicios en orden no repetido dentro de una sesión, para evitar que estudiantes de un mismo grupo se pasen respuestas.

### 1.4 Módulo de mediación pedagógica (LLM)
- **RF-11 (M0)** El módulo debe recibir como entrada: resultado del motor simbólico (correcto/incorrecto + tipo de error si aplica), el nodo actual, y el nodo destino recomendado — nunca debe recibir la tarea de verificar la respuesta él mismo.
- **RF-12 (M0)** El módulo debe generar retroalimentación en español, sin resolver el ejercicio completo por el estudiante, y sin inventar contenido matemático fuera de lo que el motor simbólico ya determinó.
- **RF-13 (M1)** El sistema debe registrar cuándo la respuesta del LLM se desvía del formato esperado (ej. intenta dar el resultado numérico) para poder auditar alucinaciones del mediador, aunque no calcule.

### 1.5 Estudiantes y grupos experimentales
- **RF-14 (M0)** El sistema debe identificar a cada estudiante con un código asignado (sin necesidad de registro complejo tipo email+contraseña) y asociarlo a su grupo experimental (1, 2 o 3).
- **RF-15 (M0)** El sistema debe restringir el comportamiento según grupo: Grupo 2 ve la herramienta solo como apoyo dentro del taller (con tiempo/ejercicios acotados a la sesión); Grupo 3 la usa como tutor completo sin instrucción del docente.
- **RF-16 (M0)** El sistema debe registrar cada intento con: estudiante, grupo, nodo, ejercicio, respuesta dada, resultado del juez simbólico, nodo de backtracking sugerido (si aplica), y timestamp — este log es un insumo directo para el análisis de la tesis, no un "nice to have".

### 1.6 Interfaz de estudiante
- **RF-17 (M0)** Interfaz de tipo chat/ejercicio único (como el prototipo) donde el estudiante ve el problema, responde, y recibe feedback y su posición actualizada en el grafo.
- **RF-18 (M1)** El estudiante debe poder ver su progreso acumulado (nodos dominados) al reingresar, no solo dentro de una sesión.

### 1.7 Panel para investigador/docente
- **RF-19 (M1)** Vista mínima (puede ser una consulta directa a Supabase al inicio, no necesita UI dedicada para el MVP) que permita exportar los logs de interacción en CSV para el análisis estadístico.
- **RF-20 (P2)** Panel con progreso agregado por grupo, útil para monitorear la intervención en curso, no indispensable para el pre-test.

---

## 2. Requisitos No Funcionales

- **RNF-01 (M0) — Corrección del juez simbólico por encima de todo.** Un falso negativo (marcar incorrecta una respuesta correcta) es el peor fallo posible del sistema: rompe la confianza del estudiante y contamina los datos de la tesis. Se prioriza sobre cualquier otro requisito, incluyendo velocidad de desarrollo.
- **RNF-02 (M0) — Disponibilidad durante sesiones sincrónicas.** El Grupo 2 usa el sistema en vivo dentro del horario de clase; una caída durante el taller no es recuperable después. El sistema debe soportar al menos 32 estudiantes concurrentes (tamaño de un grupo) sin degradación perceptible.
- **RNF-03 (M0) — Latencia de verificación simbólica bajo 1-2 segundos percibidos** (incluyendo red, no solo el cómputo de SymPy que sí es de microsegundos). La latencia del LLM mediador puede ser algo mayor (3-5s) sin romper la experiencia, siempre que haya un indicador de carga.
- **RNF-04 (M0) — Trazabilidad completa y consistente de los logs.** El esquema de datos (estudiante-grupo-nodo-intento-timestamp) no puede cambiar a mitad de la intervención sin invalidar la comparabilidad entre grupos — debe congelarse antes de S8 junto con el resto del sistema.
- **RNF-05 (M0) — Aislamiento de responsabilidades entre motor simbólico y LLM**, verificable en el código: debe ser posible demostrar (para la sustentación) que el LLM nunca recibe la tarea de evaluar matemáticamente una respuesta.
- **RNF-06 (M1) — Seguridad y anonimización de datos de estudiantes**, acorde a lo que se defina en consentimiento informado — separar identidad real de código de participante en el almacenamiento si es posible.
- **RNF-07 (M1) — Portabilidad del proveedor de LLM.** El módulo de mediación debe estar aislado (una sola capa/función) para poder cambiar de Gemini a otro proveedor sin tocar el motor simbólico ni el grafo — esto también responde a un riesgo real: si la cuenta de API de Gemini falla o se acaba la cuota en medio de una sesión con 32 estudiantes, no hay margen para debug en vivo.
- **RNF-08 (M1) — Control de costo de API.** Con 96 estudiantes y ejercicios repetidos, el volumen de llamadas al LLM puede escalar rápido; conviene un límite razonable de tokens de salida por respuesta (ya lo tienes acotado en el prototipo a ~300) y monitoreo de uso frente al presupuesto de $800.000 COP en Equipos y Software.
- **RNF-09 (P2) — Usabilidad sin fricción para no-desarrolladores.** Los estudiantes son de distintos programas (no todos ingeniería); la interfaz de entrada de expresiones matemáticas (notación con `^`, `*`, paréntesis) debe explicarse en una línea visible, no asumirse.
- **RNF-10 (P2) — Mantenibilidad del grafo.** Aunque el MVP solo cubre Unidad 3, el modelo de datos del DAG no debería requerir reestructuración para añadir las otras 3 unidades más adelante.

---

## 3. Lo que el prototipo actual NO cumple todavía

Para que quede explícito qué separa el prototipo de HTML/JS de un sistema listo para estudiantes reales:

- El juez es numérico-aproximado en el cliente (math.js), no SymPy real en backend — no cumple RF-05/RNF-01.
- No hay identificación de estudiante ni grupo — no cumple RF-14/RF-15.
- No hay persistencia de logs — no cumple RF-16/RNF-04, que es probablemente el requisito más crítico de todos para la tesis: sin esto, no hay datos que analizar en S15-S16.
- El DAG está hardcodeado en JavaScript — aceptable para demo, no cumple RF-01 a nivel de dato persistente y editable.

Esto no invalida el prototipo — cumplió su función de demostrar el ciclo completo hoy. Pero antes de dárselo a un estudiante real, el orden de trabajo debe ser: **backend con SymPy real → persistencia de logs con estudiante/grupo → luego** recién ahí conectar Gemini en producción (que es lo único que ya casi tienen listo conceptualmente).
