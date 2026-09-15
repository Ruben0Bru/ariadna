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
  {
    id: 1,
    prompt: "Deriva f(x) = 3x² − 5x + 2",
    expr: "3*x^2 - 5*x + 2",
    node: "algebra_derivadas",
    prereqOnFail: "leyes_exponentes",
    failReason:
      "leyes de exponentes al derivar potencias (regla de la potencia: baja el exponente y resta 1)",
  },
  {
    id: 2,
    prompt: "Deriva f(x) = (x² − 1)(x + 3)  — expande antes de derivar",
    expr: "(x^2 - 1)*(x + 3)",
    node: "algebra_derivadas",
    prereqOnFail: "factorizacion",
    failReason:
      "expansión y simplificación de productos algebraicos antes de aplicar la regla de la potencia",
  },
  {
    id: 3,
    prompt: "Deriva f(x) = x³ / x  — simplifica primero",
    expr: "x^3 / x",
    node: "algebra_derivadas",
    prereqOnFail: "factorizacion",
    failReason:
      "simplificación de fracciones algebraicas antes de derivar",
  },
];
