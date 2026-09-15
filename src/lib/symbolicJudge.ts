// ---------- Juez simbólico local: equivalencia numérica multi-punto (sustituto de SymPy) ----------
// Esta función sólo corre en el cliente (usa la librería math.js cargada globalmente).

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    math: any;
  }
}

export function symbolicJudge(studentInput: string, correctExprStr: string): boolean {
  try {
    const math = window.math;
    const derivativeNode = math.derivative(correctExprStr, "x");
    const studentNode = math.parse(studentInput);
    const testPoints = [1.3, -0.7, 2.9, -2.1, 0.05];
    const EPS = 1e-6;
    for (const x of testPoints) {
      const a: number = derivativeNode.evaluate({ x });
      const b: number = studentNode.evaluate({ x });
      if (Math.abs(a - b) > EPS * Math.max(1, Math.abs(a))) return false;
    }
    return true;
  } catch {
    return false;
  }
}
