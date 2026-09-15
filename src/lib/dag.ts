// ---------- DAG Unidad 3 (Álgebra de derivadas) + backtrack a Pre-Cálculo ----------
export const DAG: Record<string, { label: string; unit: string }> = {
  algebra_derivadas: { label: "Álgebra derivadas", unit: "Unidad 3" },
  factorizacion:     { label: "Factorización",      unit: "Pre-Cálculo" },
  leyes_exponentes:  { label: "Leyes de exponentes", unit: "Pre-Cálculo" },
  regla_cadena:      { label: "Regla cadena",        unit: "Unidad 3" },
};

export const DAG_ORDER = [
  "leyes_exponentes",
  "factorizacion",
  "algebra_derivadas",
  "regla_cadena",
];

export interface Exercise {
  id: number;
  prompt: string;
  expr: string;
  node: string;
  prereqOnFail: string;
  failReason: string;
}

export const EXERCISES: Exercise[] = [
  // --- Álgebra de Derivadas ---
  { id: 1, node: "algebra_derivadas", prompt: "Deriva f(x) = 3x² − 5x + 2", expr: "3*x^2 - 5*x + 2", prereqOnFail: "leyes_exponentes", failReason: "leyes de exponentes al derivar potencias" },
  { id: 2, node: "algebra_derivadas", prompt: "Deriva f(x) = (x² − 1)(x + 3)  — expande antes de derivar", expr: "(x^2 - 1)*(x + 3)", prereqOnFail: "factorizacion", failReason: "expansión y simplificación de productos algebraicos" },
  { id: 3, node: "algebra_derivadas", prompt: "Deriva f(x) = x³ / x  — simplifica primero", expr: "x^3 / x", prereqOnFail: "factorizacion", failReason: "simplificación de fracciones algebraicas" },
  { id: 4, node: "algebra_derivadas", prompt: "Deriva f(x) = 4x⁴ − 3x³ + 2x − 7", expr: "4*x^4 - 3*x^3 + 2*x - 7", prereqOnFail: "leyes_exponentes", failReason: "regla de la potencia a cada término del polinomio" },
  { id: 5, node: "algebra_derivadas", prompt: "Deriva f(x) = x² · x³", expr: "x^2 * x^3", prereqOnFail: "factorizacion", failReason: "simplificar el producto de potencias antes de derivar" },
  { id: 6, node: "algebra_derivadas", prompt: "Deriva f(x) = (2x − 1)²  — expande el cuadrado primero", expr: "(2*x - 1)^2", prereqOnFail: "factorizacion", failReason: "expandir el cuadrado de un binomio antes de derivar" },
  { id: 7, node: "algebra_derivadas", prompt: "Deriva f(x) = 5x³ − 2x + 8", expr: "5*x^3 - 2*x + 8", prereqOnFail: "leyes_exponentes", failReason: "la derivada de una constante es cero" },

  // --- Leyes de exponentes ---
  { id: 8, node: "leyes_exponentes", prompt: "Simplifica: x³ · x⁴", expr: "x^7", prereqOnFail: "", failReason: "multiplicación de potencias con igual base" },
  { id: 9, node: "leyes_exponentes", prompt: "Simplifica: x⁵ / x²", expr: "x^3", prereqOnFail: "", failReason: "división de potencias con igual base" },
  { id: 10, node: "leyes_exponentes", prompt: "Expresa con exponente: raíz cuadrada de x (usa sqrt(x))", expr: "sqrt(x)", prereqOnFail: "", failReason: "conversión de raíz a exponente fraccionario" },

  // --- Factorización ---
  { id: 11, node: "factorizacion", prompt: "Expande: (x - 2)(x + 2)", expr: "x^2 - 4", prereqOnFail: "", failReason: "producto notable de diferencia de cuadrados" },
  { id: 12, node: "factorizacion", prompt: "Expande: (x + 3)²", expr: "x^2 + 6*x + 9", prereqOnFail: "", failReason: "el cuadrado de un binomio perfecto" },
  { id: 13, node: "factorizacion", prompt: "Simplifica multiplicando: x(x² + 5)", expr: "x^3 + 5*x", prereqOnFail: "", failReason: "distributiva en polinomios simples" },

  // --- Regla de la cadena ---
  { id: 14, node: "regla_cadena", prompt: "Deriva usando regla de la cadena: f(x) = (2x + 1)³", expr: "6*(2*x + 1)^2", prereqOnFail: "algebra_derivadas", failReason: "aplicar derivada de la interna (2)" },
];
