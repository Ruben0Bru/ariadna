// ---------- DAG Unidad 3 (Álgebra de derivadas) + backtrack a Pre-Cálculo ----------
export const DAG: Record<string, { label: string; unit: string }> = {
  algebra_derivadas: { label: "Álgebra derivadas", unit: "Unidad 3" },
  factorizacion:     { label: "Factorización",      unit: "Pre-Cálculo" },
  leyes_exponentes:  { label: "Leyes de exponentes", unit: "Pre-Cálculo" },
  regla_cadena:      { label: "Regla cadena",        unit: "Unidad 3" },
};

// Tarjetas de concepto — se muestran ANTES del primer ejercicio de cada nodo (tutor real)
export interface NodeConcept {
  title: string;
  body: string;         // Markdown + LaTeX (delimitadores $$)
  example: string;      // Markdown + LaTeX del ejemplo resuelto
  tip: string;          // Recordatorio rápido para el input del estudiante
}

export const CONCEPTS: Record<string, NodeConcept> = {
  algebra_derivadas: {
    title: "La Regla de la Potencia",
    body: `La regla más fundamental para derivar: si $f(x) = x^n$, entonces

$$f'(x) = n \\cdot x^{n-1}$$

El exponente **baja** como coeficiente y el nuevo exponente es uno menos. Se aplica término a término en cualquier polinomio, y la derivada de una constante sola siempre es **cero**.`,
    example: `**Ejemplo:** $f(x) = 4x^3 - 2x + 7$

$$f'(x) = 4 \\cdot 3 \\cdot x^{3-1} - 2 \\cdot 1 \\cdot x^{1-1} + 0 = 12x^2 - 2$$`,
    tip: "Escribe la derivada usando ^ para potencias y * para multiplicar (ej. 12*x^2 - 2)",
  },

  leyes_exponentes: {
    title: "Propiedades de los Exponentes",
    body: `Estas leyes son indispensables para simplificar antes de derivar:

| Operación | Ley |
|-----------|-----|
| Multiplicar igual base | $x^a \\cdot x^b = x^{a+b}$ |
| Dividir igual base | $x^a \\div x^b = x^{a-b}$ |
| Raíz cuadrada | $\\sqrt{x} = x^{1/2}$ |
| Potencia de potencia | $(x^a)^b = x^{a \\cdot b}$ |`,
    example: `**Ejemplo:** Simplifica $x^5 \\cdot x^{-2}$

$$x^5 \\cdot x^{-2} = x^{5+(-2)} = x^3$$`,
    tip: "Escribe tu respuesta simplificada, por ejemplo: x^7 o sqrt(x)",
  },

  factorizacion: {
    title: "Productos Notables y Distributiva",
    body: `Antes de derivar es necesario expandir expresiones. Los más comunes:

$$\`(a+b)^2 = a^2 + 2ab + b^2\`$$
$$\`(a-b)(a+b) = a^2 - b^2\`$$
$$\`a(b+c) = ab + ac\`$$

Expandir primero convierte un producto en un polinomio fácil de derivar término a término.`,
    example: `**Ejemplo:** Expande $(2x - 1)^2$

$$(2x)^2 - 2(2x)(1) + 1^2 = 4x^2 - 4x + 1$$`,
    tip: "Escribe la forma expandida: ej. x^2 + 6*x + 9",
  },

  regla_cadena: {
    title: "Regla de la Cadena",
    body: `Se usa cuando la función es una **composición**: una función dentro de otra.

Si $f(x) = g(h(x))$, entonces:

$$f'(x) = g'(h(x)) \\cdot h'(x)$$

Es decir: **derivada de la exterior** (dejando la interior intacta) **× derivada de la interior**.`,
    example: `**Ejemplo:** $f(x) = (3x + 2)^4$

- Exterior: $g(u) = u^4 \\Rightarrow g'(u) = 4u^3$  
- Interior: $h(x) = 3x+2 \\Rightarrow h'(x) = 3$

$$f'(x) = 4(3x+2)^3 \\cdot 3 = 12(3x+2)^3$$`,
    tip: "Escribe el resultado final multiplicado: ej. 6*(2*x+1)^2",
  },
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
