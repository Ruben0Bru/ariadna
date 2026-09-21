// ── Grafo de la Unidad de Derivadas, Cálculo I ──────────────────────────────
// Estructura de prerrequisitos:
//
//  [Pre-Cálculo]                    [Unidad 3 — Derivadas]
//  leyes_exponentes ─────────────►  definicion_derivada
//  factorizacion ────────────────►  regla_potencia
//                                   regla_potencia ──────►  regla_producto
//                                   regla_potencia ──────►  regla_cadena
//                                   regla_producto ─────►  regla_cociente
//

export const DAG: Record<string, { label: string; unit: string; prereqs: string[] }> = {
  // Pre-Cálculo
  leyes_exponentes: { label: "Leyes de exponentes",  unit: "Pre-Cálculo", prereqs: [] },
  factorizacion:    { label: "Factorización",         unit: "Pre-Cálculo", prereqs: [] },
  // Unidad 3
  definicion_derivada: { label: "Definición de derivada", unit: "Unidad 3 — §3.1", prereqs: ["leyes_exponentes"] },
  regla_potencia:      { label: "Regla de la potencia",   unit: "Unidad 3 — §3.2", prereqs: ["definicion_derivada", "factorizacion"] },
  regla_producto:      { label: "Regla del producto",     unit: "Unidad 3 — §3.3", prereqs: ["regla_potencia"] },
  regla_cociente:      { label: "Regla del cociente",     unit: "Unidad 3 — §3.4", prereqs: ["regla_producto"] },
  regla_cadena:        { label: "Regla de la cadena",     unit: "Unidad 3 — §3.5", prereqs: ["regla_potencia"] },
};

// Orden topológico del grafo (de fácil a difícil)
export const DAG_ORDER = [
  "leyes_exponentes",
  "factorizacion",
  "definicion_derivada",
  "regla_potencia",
  "regla_producto",
  "regla_cociente",
  "regla_cadena",
];

// Nodo de entrada por defecto al iniciar sesión
export const DEFAULT_NODE = "regla_potencia";

// ── Tarjetas de concepto (se muestran antes del primer ejercicio de cada nodo) ─
export interface NodeConcept {
  title: string;
  body: string;     // Markdown + LaTeX
  example: string;
  tip: string;
}

export const CONCEPTS: Record<string, NodeConcept> = {
  leyes_exponentes: {
    title: "Propiedades de los Exponentes",
    body: `Estas leyes son esenciales para simplificar expresiones antes de derivar:

| Operación | Ley |
|-----------|-----|
| Multiplicar igual base | $x^a \\cdot x^b = x^{a+b}$ |
| Dividir igual base | $x^a \\div x^b = x^{a-b}$ |
| Potencia de potencia | $(x^a)^b = x^{a \\cdot b}$ |
| Raíz como exponente | $\\sqrt{x} = x^{1/2}$ |
| Exponente negativo | $x^{-n} = \\dfrac{1}{x^n}$ |`,
    example: `**Simplifica:** $x^3 \\cdot x^4 \\div x^2$

$$x^3 \\cdot x^4 \\div x^2 = x^{3+4-2} = x^5$$`,
    tip: "Escribe tu respuesta simplificada, por ejemplo: x^7 o x^(1/2)",
  },

  factorizacion: {
    title: "Productos Notables y Distributiva",
    body: `Expandir antes de derivar convierte un producto en un polinomio fácil de tratar:

$$\\boxed{(a+b)^2 = a^2 + 2ab + b^2}$$
$$\\boxed{(a-b)(a+b) = a^2 - b^2}$$
$$\\boxed{a(b+c) = ab + ac}$$`,
    example: `**Expande:** $(3x - 2)^2$

$$(3x)^2 - 2(3x)(2) + 4 = 9x^2 - 12x + 4$$`,
    tip: "Escribe la forma expandida: ej. 9*x^2 - 12*x + 4",
  },

  definicion_derivada: {
    title: "¿Qué es la Derivada?",
    body: `La derivada $f'(x)$ mide la **tasa de cambio instantánea** de $f$, es decir, la pendiente de la recta tangente en cada punto.

**Definición formal (límite):**

$$f'(x) = \\lim_{h \\to 0} \\dfrac{f(x+h) - f(x)}{h}$$

Intuitivamente: si $f(x)$ describe posición, $f'(x)$ describe velocidad. Si describe costo, $f'(x)$ describe costo marginal.

**Notaciones equivalentes:** $f'(x) = \\dfrac{dy}{dx} = \\dfrac{d}{dx}[f(x)]$`,
    example: `**Calcula $f'(x)$ si $f(x) = x^2$ usando la definición:**

$$f'(x) = \\lim_{h\\to 0}\\frac{(x+h)^2 - x^2}{h} = \\lim_{h\\to 0}\\frac{2xh+h^2}{h} = 2x$$`,
    tip: "Para estas preguntas, escribe la derivada simbólica: ej. 2*x o simplemente 3",
  },

  regla_potencia: {
    title: "Regla de la Potencia",
    body: `La regla más usada al derivar. Para cualquier potencia $x^n$:

$$\\boxed{\\frac{d}{dx}[x^n] = n \\cdot x^{n-1}}$$

**Casos importantes:**
- $\\frac{d}{dx}[c] = 0$ (constante)
- $\\frac{d}{dx}[x] = 1$
- $\\frac{d}{dx}[cx^n] = c \\cdot n \\cdot x^{n-1}$

Se aplica **término a término** en cualquier polinomio.`,
    example: `**Deriva** $f(x) = 5x^4 - 3x^2 + 7$

$$f'(x) = 5 \\cdot 4x^3 - 3 \\cdot 2x + 0 = 20x^3 - 6x$$`,
    tip: "Usa ^ para potencias y * para multiplicar. Ej: 20*x^3 - 6*x",
  },

  regla_producto: {
    title: "Regla del Producto",
    body: `Cuando $f(x) = u(x) \\cdot v(x)$, **no puedes derivar cada factor por separado**:

$$\\boxed{[u \\cdot v]' = u' \\cdot v + u \\cdot v'}$$

**Estrategia:** identifica los dos factores $u$ y $v$, calcula sus derivadas $u'$ y $v'$, y combina.`,
    example: `**Deriva** $f(x) = x^2 \\cdot (x + 3)$

$u = x^2 \\Rightarrow u' = 2x$  
$v = x+3 \\Rightarrow v' = 1$

$$f'(x) = 2x(x+3) + x^2(1) = 2x^2+6x+x^2 = 3x^2+6x$$`,
    tip: "Desarrolla y simplifica el resultado. Ej: 3*x^2 + 6*x",
  },

  regla_cociente: {
    title: "Regla del Cociente",
    body: `Cuando $f(x) = \\dfrac{u(x)}{v(x)}$, la derivada es:

$$\\boxed{\\left[\\frac{u}{v}\\right]' = \\frac{u'v - uv'}{v^2}}$$

**Tip mnemotécnico:** "abajo·arriba' menos arriba·abajo', todo sobre abajo al cuadrado."`,
    example: `**Deriva** $f(x) = \\dfrac{x^2}{x+1}$

$u = x^2, u' = 2x \\quad v = x+1, v' = 1$

$$f'(x) = \\frac{2x(x+1) - x^2(1)}{(x+1)^2} = \\frac{x^2+2x}{(x+1)^2}$$`,
    tip: "Expande el numerador si es posible y simplifica. Ej: (x^2+2*x)/(x+1)^2",
  },

  regla_cadena: {
    title: "Regla de la Cadena",
    body: `Cuando $f(x) = g(h(x))$ (función compuesta), la derivada multiplica las derivadas de ambas capas:

$$\\boxed{f'(x) = g'(h(x)) \\cdot h'(x)}$$

**Pasos:**
1. Identifica la función **exterior** $g$ y la **interior** $h$.
2. Deriva la exterior (dejando la interior intacta): $g'(h(x))$.
3. Multiplica por la derivada de la interior: $h'(x)$.`,
    example: `**Deriva** $f(x) = (3x+2)^4$

- Exterior: $u^4 \\Rightarrow 4u^3$ donde $u = 3x+2$
- Interior: $3x+2 \\Rightarrow 3$

$$f'(x) = 4(3x+2)^3 \\cdot 3 = 12(3x+2)^3$$`,
    tip: "Escribe el resultado final: ej. 12*(3*x+2)^3",
  },
};

// ── Ejercicios ────────────────────────────────────────────────────────────────
export interface Exercise {
  id: number;
  prompt: string;
  expr: string;       // respuesta correcta (para mostrar en "Me rindo")
  node: string;
  prereqOnFail: string;
  failReason: string;
}

export const EXERCISES: Exercise[] = [
  // ── Leyes de exponentes ────────────────────────────────────────────────────
  { id: 8,  node: "leyes_exponentes", prompt: "Simplifica: x³ · x⁴", expr: "x^7",    prereqOnFail: "", failReason: "multiplicación de potencias con igual base (xᵃ · xᵇ = xᵃ⁺ᵇ)" },
  { id: 9,  node: "leyes_exponentes", prompt: "Simplifica: x⁵ / x²", expr: "x^3",    prereqOnFail: "", failReason: "división de potencias con igual base (xᵃ / xᵇ = xᵃ⁻ᵇ)" },
  { id: 10, node: "leyes_exponentes", prompt: "Simplifica: (x²)³",   expr: "x^6",    prereqOnFail: "", failReason: "potencia de potencia: (xᵃ)ᵇ = xᵃᵇ" },
  { id: 15, node: "leyes_exponentes", prompt: "Simplifica: x⁻²",     expr: "1/x^2",  prereqOnFail: "", failReason: "exponente negativo: x⁻ⁿ = 1/xⁿ" },
  { id: 16, node: "leyes_exponentes", prompt: "Expresa sin raíz: √x", expr: "x^(1/2)", prereqOnFail: "", failReason: "raíz cuadrada como exponente fraccionario: √x = x^(1/2)" },

  // ── Factorización ──────────────────────────────────────────────────────────
  { id: 11, node: "factorizacion", prompt: "Expande: (x - 2)(x + 2)",  expr: "x^2 - 4",        prereqOnFail: "", failReason: "diferencia de cuadrados: (a-b)(a+b) = a² - b²" },
  { id: 12, node: "factorizacion", prompt: "Expande: (x + 3)²",        expr: "x^2 + 6*x + 9",  prereqOnFail: "", failReason: "cuadrado del binomio: (a+b)² = a² + 2ab + b²" },
  { id: 13, node: "factorizacion", prompt: "Expande: x(x² + 5)",       expr: "x^3 + 5*x",      prereqOnFail: "", failReason: "distributiva: a(b+c) = ab + ac" },
  { id: 17, node: "factorizacion", prompt: "Expande: (2x - 1)²",       expr: "4*x^2 - 4*x + 1", prereqOnFail: "", failReason: "cuadrado del binomio con coeficiente: (2x-1)² = 4x²-4x+1" },
  { id: 18, node: "factorizacion", prompt: "Expande: (x + 1)(x² - x + 1)", expr: "x^3 + 1",   prereqOnFail: "", failReason: "suma de cubos: (a+b)(a²-ab+b²) = a³+b³" },

  // ── Definición de derivada ─────────────────────────────────────────────────
  { id: 19, node: "definicion_derivada", prompt: "¿Cuál es f'(x) si f(x) = 7? (constante)",         expr: "0",    prereqOnFail: "leyes_exponentes", failReason: "la derivada de una constante es siempre cero" },
  { id: 20, node: "definicion_derivada", prompt: "¿Cuál es f'(x) si f(x) = 4x?",                    expr: "4",    prereqOnFail: "leyes_exponentes", failReason: "la derivada de una función lineal ax es su pendiente a" },
  { id: 21, node: "definicion_derivada", prompt: "Si f(x) = x, ¿cuánto vale f'(x)?",                expr: "1",    prereqOnFail: "leyes_exponentes", failReason: "la derivada de x es 1 (pendiente de la recta y=x)" },
  { id: 22, node: "definicion_derivada", prompt: "Interpreta: f'(a) representa la _____ de f en x=a. Escribe: pendiente", expr: "pendiente", prereqOnFail: "", failReason: "f'(a) es la pendiente de la línea tangente a f en x=a" },
  { id: 23, node: "definicion_derivada", prompt: "Si f(x) = 3x + 5, ¿cuánto vale f'(x)?",           expr: "3",    prereqOnFail: "leyes_exponentes", failReason: "la derivada de mx+b es m (la pendiente de la recta)" },

  // ── Regla de la potencia ───────────────────────────────────────────────────
  { id: 1,  node: "regla_potencia", prompt: "Deriva f(x) = 3x² − 5x + 2",               expr: "6*x - 5",          prereqOnFail: "leyes_exponentes", failReason: "regla de la potencia: d/dx[xⁿ] = n·xⁿ⁻¹" },
  { id: 4,  node: "regla_potencia", prompt: "Deriva f(x) = 4x⁴ − 3x³ + 2x − 7",         expr: "16*x^3 - 9*x^2 + 2", prereqOnFail: "leyes_exponentes", failReason: "aplica la regla de la potencia a cada término" },
  { id: 7,  node: "regla_potencia", prompt: "Deriva f(x) = 5x³ − 2x + 8",               expr: "15*x^2 - 2",       prereqOnFail: "leyes_exponentes", failReason: "la derivada de la constante 8 es cero" },
  { id: 24, node: "regla_potencia", prompt: "Deriva f(x) = x² · x³  (simplifica primero)", expr: "5*x^4",          prereqOnFail: "factorizacion",    failReason: "simplificar x²·x³=x⁵ antes de derivar" },
  { id: 25, node: "regla_potencia", prompt: "Deriva f(x) = x³ / x  (simplifica primero)",  expr: "2*x",            prereqOnFail: "factorizacion",    failReason: "simplificar x³/x=x² antes de aplicar la regla" },
  { id: 26, node: "regla_potencia", prompt: "Deriva f(x) = (2x − 1)²  (expande primero)", expr: "8*x - 4",        prereqOnFail: "factorizacion",    failReason: "expandir el cuadrado del binomio antes de derivar" },
  { id: 27, node: "regla_potencia", prompt: "Deriva f(x) = (x² − 1)(x + 3)  (expande primero)", expr: "3*x^2 + 6*x - 1", prereqOnFail: "factorizacion", failReason: "expansión del producto algebraico antes de derivar" },

  // ── Regla del producto ─────────────────────────────────────────────────────
  { id: 28, node: "regla_producto", prompt: "Deriva f(x) = x² · (x + 3)  usando regla del producto",       expr: "3*x^2 + 6*x",    prereqOnFail: "regla_potencia", failReason: "regla del producto: (uv)' = u'v + uv'" },
  { id: 29, node: "regla_producto", prompt: "Deriva f(x) = (2x + 1)(x² − 4)  usando regla del producto",  expr: "6*x^2 + 2*x - 8", prereqOnFail: "regla_potencia", failReason: "regla del producto con binomios" },
  { id: 30, node: "regla_producto", prompt: "Deriva f(x) = x⁴ · (x + 2)",                                  expr: "5*x^4 + 8*x^3",  prereqOnFail: "regla_potencia", failReason: "u = x⁴, v = x+2, u'=4x³, v'=1" },
  { id: 31, node: "regla_producto", prompt: "Deriva f(x) = (3x² − 1)(x² + 4)",                             expr: "12*x^3 + 22*x",  prereqOnFail: "regla_potencia", failReason: "aplicar la regla del producto y simplificar términos semejantes" },

  // ── Regla del cociente ─────────────────────────────────────────────────────
  { id: 32, node: "regla_cociente", prompt: "Deriva f(x) = x² / (x + 1)  usando regla del cociente",      expr: "(x^2 + 2*x) / (x+1)^2", prereqOnFail: "regla_producto", failReason: "regla del cociente: (u/v)' = (u'v − uv') / v²" },
  { id: 33, node: "regla_cociente", prompt: "Deriva f(x) = (x + 1) / x²",                                 expr: "(x^2 - 2*x - 2) / x^4", prereqOnFail: "regla_producto", failReason: "u = x+1, v = x², aplicar (u'v−uv')/v²" },
  { id: 34, node: "regla_cociente", prompt: "Deriva f(x) = x / (x² + 1)",                                 expr: "(1 - x^2) / (x^2 + 1)^2", prereqOnFail: "regla_producto", failReason: "numerador después de cociente: 1·(x²+1) - x·2x" },
  { id: 35, node: "regla_cociente", prompt: "Deriva f(x) = (2x − 3) / (x + 2)",                           expr: "7 / (x + 2)^2",          prereqOnFail: "regla_producto", failReason: "numerador: 2(x+2) - (2x-3)·1 = 7" },

  // ── Regla de la cadena ─────────────────────────────────────────────────────
  { id: 14, node: "regla_cadena", prompt: "Deriva usando regla de la cadena: f(x) = (2x + 1)³", expr: "6*(2*x + 1)^2", prereqOnFail: "regla_potencia", failReason: "exterior: (u³)' = 3u², interior: (2x+1)' = 2" },
  { id: 36, node: "regla_cadena", prompt: "Deriva: f(x) = (x² + 1)⁴",                           expr: "8*x*(x^2 + 1)^3", prereqOnFail: "regla_potencia", failReason: "exterior: 4u³, interior: (x²+1)' = 2x, resultado: 4(x²+1)³·2x" },
  { id: 37, node: "regla_cadena", prompt: "Deriva: f(x) = (3x − 5)²",                            expr: "6*(3*x - 5)",      prereqOnFail: "factorizacion",  failReason: "exterior: 2u, interior: (3x-5)' = 3, resultado: 2(3x-5)·3" },
  { id: 38, node: "regla_cadena", prompt: "Deriva: f(x) = (x³ + 2x)⁵",                           expr: "5*(x^3 + 2*x)^4 * (3*x^2 + 2)", prereqOnFail: "regla_potencia", failReason: "interior: (x³+2x)' = 3x²+2, exterior: 5(...)⁴" },
];
