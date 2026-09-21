// src/app/api/verify/route.ts
//
// Orquestador del ciclo completo (RF-05, RF-11, RF-16):
//   1. Verifica simbólicamente usando mathjs (sin servidor externo).
//   2. Persiste el intento en Supabase (tabla attempts) — insumo de la tesis.
//   3. Devuelve el resultado + datos para el módulo pedagógico (feedback).
//
// Diseño deliberado (RNF-05): el LLM NUNCA verifica matemáticamente nada.
// La llamada a Gemini para redactar texto ocurre en /api/feedback, separada.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { evaluate } from "mathjs";

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

interface VerifyBody {
  studentId: string;
  exerciseId: number;
  studentAnswer: string;
}

// ── Motor simbólico en TypeScript (mathjs) ────────────────────────────────────
// Convierte notaciones mixtas a la sintaxis de mathjs
function toMathjs(expr: string): string {
  return expr
    .replace(/\*\*/g, "^")   // Python ** → mathjs ^
    .replace(/sqrt\(/g, "sqrt(")
    .trim();
}

// Evalúa una expresión con mathjs en un punto x=val.
// Devuelve null si la expresión no es parseable o arroja error (ej. sqrt de negativo).
function evalAt(expr: string, val: number): number | null {
  try {
    const result = evaluate(expr, { x: val });
    const n = typeof result === "number" ? result : (result as { toNumber?: () => number }).toNumber?.();
    if (typeof n !== "number" || !isFinite(n)) return null;
    return n;
  } catch {
    return null;
  }
}

// Comprobación numérica en múltiples puntos (RF-05, RNF-01)
function numericallyEqual(expr1: string, expr2: string): boolean {
  const points = [1.3, -0.7, 2.9, -2.1, 0.05];
  let passed = 0;
  let tried = 0;
  for (const pt of points) {
    const v1 = evalAt(expr1, pt);
    const v2 = evalAt(expr2, pt);
    if (v1 === null || v2 === null) continue;
    tried++;
    if (Math.abs(v1 - v2) <= 1e-6 * Math.max(1, Math.abs(v1))) passed++;
  }
  return tried >= 3 && passed === tried; // Deben coincidir en todos los puntos evaluables
}

// Clasifica el tipo de error (RF-07)
function classifyError(
  studentExpr: string,
  expectedExpr: string,
  originalExpr: string
): string {
  if (numericallyEqual(studentExpr, originalExpr)) return "no_derivo";
  if (numericallyEqual(studentExpr, `-(${expectedExpr})`)) return "signo";
  // ¿Olvidó derivar solo la constante?
  // Si student = expected + C (constante), el resto coincide
  try {
    const pts = [1.3, 2.9, -0.7];
    const diffs = pts.map(pt => {
      const sv = evalAt(studentExpr, pt);
      const ev = evalAt(expectedExpr, pt);
      return sv !== null && ev !== null ? sv - ev : null;
    }).filter(d => d !== null) as number[];
    if (diffs.length >= 2) {
      const allSame = diffs.every(d => Math.abs(d - diffs[0]) < 1e-6);
      if (allSame && Math.abs(diffs[0]) > 1e-6) return "constante";
    }
  } catch { /* ignore */ }
  return "desconocido";
}

// ── Banco de ejercicios ───────────────────────────────────────────────────────
// expected_answer: respuesta que el estudiante debe dar (derivada o forma simplificada)
// exercise_type:   "differentiate" | "simplify"
// (RNF-01: nunca confiamos en el cliente para determinar la respuesta correcta)
interface ExerciseRecord {
  id: number;
  node_id: string;
  correct_expr: string;      // función original (para derivar) o forma a simplificar
  expected_answer: string;   // respuesta esperada del estudiante
  exercise_type: "differentiate" | "simplify";
  variable: string;
  prereq_on_fail: string | null;
  fail_reason: string | null;
}

const LOCAL_EXERCISES: ExerciseRecord[] = [
  // ── Leyes de exponentes ─────────────────────────────────────────────────────
  { id: 8,  node_id: "leyes_exponentes",  correct_expr: "x^3 * x^4",       expected_answer: "x^7",              exercise_type: "simplify",       variable: "x", prereq_on_fail: null,           fail_reason: "multiplicación de potencias con igual base (xᵃ·xᵇ=xᵃ⁺ᵇ)" },
  { id: 9,  node_id: "leyes_exponentes",  correct_expr: "x^5 / x^2",       expected_answer: "x^3",              exercise_type: "simplify",       variable: "x", prereq_on_fail: null,           fail_reason: "división de potencias con igual base (xᵃ/xᵇ=xᵃ⁻ᵇ)" },
  { id: 10, node_id: "leyes_exponentes",  correct_expr: "(x^2)^3",         expected_answer: "x^6",              exercise_type: "simplify",       variable: "x", prereq_on_fail: null,           fail_reason: "potencia de potencia: (xᵃ)ᵇ=xᵃᵇ" },
  { id: 15, node_id: "leyes_exponentes",  correct_expr: "x^(-2)",          expected_answer: "1/x^2",            exercise_type: "simplify",       variable: "x", prereq_on_fail: null,           fail_reason: "exponente negativo: x⁻ⁿ=1/xⁿ" },
  { id: 16, node_id: "leyes_exponentes",  correct_expr: "sqrt(x)",         expected_answer: "sqrt(x)",          exercise_type: "simplify",       variable: "x", prereq_on_fail: null,           fail_reason: "raíz cuadrada como exponente fraccionario" },

  // ── Factorización ────────────────────────────────────────────────────────────
  { id: 11, node_id: "factorizacion",     correct_expr: "(x-2)*(x+2)",     expected_answer: "x^2 - 4",          exercise_type: "simplify",       variable: "x", prereq_on_fail: null,           fail_reason: "diferencia de cuadrados: (a-b)(a+b)=a²-b²" },
  { id: 12, node_id: "factorizacion",     correct_expr: "(x+3)^2",         expected_answer: "x^2 + 6*x + 9",   exercise_type: "simplify",       variable: "x", prereq_on_fail: null,           fail_reason: "cuadrado del binomio: (a+b)²=a²+2ab+b²" },
  { id: 13, node_id: "factorizacion",     correct_expr: "x*(x^2 + 5)",     expected_answer: "x^3 + 5*x",        exercise_type: "simplify",       variable: "x", prereq_on_fail: null,           fail_reason: "distributiva: a(b+c)=ab+ac" },
  { id: 17, node_id: "factorizacion",     correct_expr: "(2*x-1)^2",       expected_answer: "4*x^2 - 4*x + 1", exercise_type: "simplify",       variable: "x", prereq_on_fail: null,           fail_reason: "cuadrado del binomio con coeficiente" },
  { id: 18, node_id: "factorizacion",     correct_expr: "(x+1)*(x^2-x+1)", expected_answer: "x^3 + 1",          exercise_type: "simplify",       variable: "x", prereq_on_fail: null,           fail_reason: "suma de cubos: (a+b)(a²-ab+b²)=a³+b³" },

  // ── Definición de derivada ────────────────────────────────────────────────────
  { id: 19, node_id: "definicion_derivada", correct_expr: "7",             expected_answer: "0",                exercise_type: "simplify",       variable: "x", prereq_on_fail: "leyes_exponentes", fail_reason: "la derivada de una constante es siempre cero" },
  { id: 20, node_id: "definicion_derivada", correct_expr: "4*x",           expected_answer: "4",                exercise_type: "simplify",       variable: "x", prereq_on_fail: "leyes_exponentes", fail_reason: "la derivada de ax es su coeficiente a" },
  { id: 21, node_id: "definicion_derivada", correct_expr: "x",             expected_answer: "1",                exercise_type: "simplify",       variable: "x", prereq_on_fail: "leyes_exponentes", fail_reason: "la derivada de x es 1" },
  { id: 23, node_id: "definicion_derivada", correct_expr: "3*x + 5",       expected_answer: "3",                exercise_type: "simplify",       variable: "x", prereq_on_fail: "leyes_exponentes", fail_reason: "la derivada de mx+b es la pendiente m" },

  // ── Regla de la potencia (antes: algebra_derivadas) ───────────────────────────
  { id: 1,  node_id: "regla_potencia",    correct_expr: "3*x^2 - 5*x + 2",  expected_answer: "6*x - 5",           exercise_type: "differentiate",  variable: "x", prereq_on_fail: "leyes_exponentes", fail_reason: "regla de la potencia: d/dx[xⁿ]=n·xⁿ⁻¹" },
  { id: 4,  node_id: "regla_potencia",    correct_expr: "4*x^4 - 3*x^3 + 2*x - 7", expected_answer: "16*x^3 - 9*x^2 + 2", exercise_type: "differentiate", variable: "x", prereq_on_fail: "leyes_exponentes", fail_reason: "aplica la regla de la potencia a cada término" },
  { id: 7,  node_id: "regla_potencia",    correct_expr: "5*x^3 - 2*x + 8",  expected_answer: "15*x^2 - 2",       exercise_type: "differentiate",  variable: "x", prereq_on_fail: "leyes_exponentes", fail_reason: "la derivada de la constante 8 es cero" },
  { id: 24, node_id: "regla_potencia",    correct_expr: "x^2 * x^3",        expected_answer: "5*x^4",            exercise_type: "differentiate",  variable: "x", prereq_on_fail: "factorizacion",    fail_reason: "simplificar x²·x³=x⁵ antes de derivar" },
  { id: 25, node_id: "regla_potencia",    correct_expr: "x^3 / x",          expected_answer: "2*x",              exercise_type: "differentiate",  variable: "x", prereq_on_fail: "factorizacion",    fail_reason: "simplificar x³/x=x² antes de aplicar la regla" },
  { id: 26, node_id: "regla_potencia",    correct_expr: "(2*x - 1)^2",      expected_answer: "8*x - 4",          exercise_type: "differentiate",  variable: "x", prereq_on_fail: "factorizacion",    fail_reason: "expandir el cuadrado del binomio antes de derivar" },
  { id: 27, node_id: "regla_potencia",    correct_expr: "(x^2 - 1)*(x + 3)",expected_answer: "3*x^2 + 6*x - 1", exercise_type: "differentiate",  variable: "x", prereq_on_fail: "factorizacion",    fail_reason: "expansión del producto algebraico antes de derivar" },

  // ── Regla del producto ─────────────────────────────────────────────────────────
  { id: 28, node_id: "regla_producto",    correct_expr: "x^2 * (x + 3)",            expected_answer: "3*x^2 + 6*x",    exercise_type: "differentiate", variable: "x", prereq_on_fail: "regla_potencia", fail_reason: "regla del producto: (uv)'=u'v+uv'" },
  { id: 29, node_id: "regla_producto",    correct_expr: "(2*x + 1)*(x^2 - 4)",      expected_answer: "6*x^2 + 2*x - 8", exercise_type: "differentiate", variable: "x", prereq_on_fail: "regla_potencia", fail_reason: "regla del producto con binomios" },
  { id: 30, node_id: "regla_producto",    correct_expr: "x^4 * (x + 2)",            expected_answer: "5*x^4 + 8*x^3",  exercise_type: "differentiate", variable: "x", prereq_on_fail: "regla_potencia", fail_reason: "u=x⁴, v=x+2, u'=4x³, v'=1" },
  { id: 31, node_id: "regla_producto",    correct_expr: "(3*x^2 - 1)*(x^2 + 4)",   expected_answer: "12*x^3 + 22*x",  exercise_type: "differentiate", variable: "x", prereq_on_fail: "regla_potencia", fail_reason: "aplicar la regla del producto y simplificar términos" },

  // ── Regla del cociente ─────────────────────────────────────────────────────────
  { id: 32, node_id: "regla_cociente",    correct_expr: "x^2 / (x + 1)",            expected_answer: "(x^2 + 2*x) / (x+1)^2", exercise_type: "differentiate", variable: "x", prereq_on_fail: "regla_producto", fail_reason: "regla del cociente: (u/v)'=(u'v−uv')/v²" },
  { id: 33, node_id: "regla_cociente",    correct_expr: "(x + 1) / x^2",            expected_answer: "-(x + 2) / x^3",         exercise_type: "differentiate", variable: "x", prereq_on_fail: "regla_producto", fail_reason: "u=x+1, v=x², aplicar (u'v−uv')/v²" },
  { id: 34, node_id: "regla_cociente",    correct_expr: "x / (x^2 + 1)",            expected_answer: "(1 - x^2) / (x^2+1)^2", exercise_type: "differentiate", variable: "x", prereq_on_fail: "regla_producto", fail_reason: "numerador: 1·(x²+1) − x·2x" },
  { id: 35, node_id: "regla_cociente",    correct_expr: "(2*x - 3) / (x + 2)",      expected_answer: "7 / (x+2)^2",            exercise_type: "differentiate", variable: "x", prereq_on_fail: "regla_producto", fail_reason: "numerador tras cociente: 2(x+2)−(2x−3)·1=7" },

  // ── Regla de la cadena ─────────────────────────────────────────────────────────
  { id: 14, node_id: "regla_cadena",     correct_expr: "(2*x + 1)^3",       expected_answer: "6*(2*x+1)^2",            exercise_type: "differentiate", variable: "x", prereq_on_fail: "regla_potencia", fail_reason: "exterior: 3u², interior: (2x+1)'=2" },
  { id: 36, node_id: "regla_cadena",     correct_expr: "(x^2 + 1)^4",       expected_answer: "8*x*(x^2+1)^3",          exercise_type: "differentiate", variable: "x", prereq_on_fail: "regla_potencia", fail_reason: "exterior: 4u³, interior: (x²+1)'=2x" },
  { id: 37, node_id: "regla_cadena",     correct_expr: "(3*x - 5)^2",       expected_answer: "6*(3*x-5)",              exercise_type: "differentiate", variable: "x", prereq_on_fail: "factorizacion",  fail_reason: "exterior: 2u, interior: (3x-5)'=3" },
  { id: 38, node_id: "regla_cadena",     correct_expr: "(x^3 + 2*x)^5",     expected_answer: "5*(x^3+2*x)^4*(3*x^2+2)", exercise_type: "differentiate", variable: "x", prereq_on_fail: "regla_potencia", fail_reason: "interior: (x³+2x)'=3x²+2" },
];


export async function POST(req: NextRequest) {
  const startedAt = Date.now();

  let body: VerifyBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const { studentId, exerciseId, studentAnswer } = body;

  if (!studentId || !exerciseId || !studentAnswer?.trim()) {
    return NextResponse.json(
      { error: "Faltan campos requeridos: studentId, exerciseId, studentAnswer" },
      { status: 400 }
    );
  }

  // ── Supabase (opcional para MVP offline / sin configurar) ──────────────────
  const supabase =
    supabaseUrl && supabaseKey
      ? createClient(supabaseUrl, supabaseKey)
      : null;

  // 1. Traer el ejercicio desde Supabase o banco local
  interface SupabaseExercise {
    id: number;
    node_id: string;
    correct_expr: string;
    expected_answer: string | null;
    exercise_type: string | null;
    variable: string | null;
    prereq_on_fail: string | null;
    fail_reason: string | null;
  }

  let exercise: ExerciseRecord | null = null;
  let exerciseFromDb = false;

  if (supabase) {
    const { data } = await supabase
      .from("exercises")
      .select("id, node_id, correct_expr, expected_answer, exercise_type, variable, prereq_on_fail, fail_reason")
      .eq("id", exerciseId)
      .single();

    if (data) {
      const d = data as SupabaseExercise;
      exercise = {
        id: d.id,
        node_id: d.node_id,
        correct_expr: toMathjs(d.correct_expr),
        expected_answer: toMathjs(d.expected_answer ?? d.correct_expr),
        exercise_type: (d.exercise_type as ExerciseRecord["exercise_type"]) ?? "differentiate",
        variable: d.variable ?? "x",
        prereq_on_fail: d.prereq_on_fail,
        fail_reason: d.fail_reason,
      };
      exerciseFromDb = true;
    }
  }

  // Fallback al banco local
  if (!exercise) {
    const local = LOCAL_EXERCISES.find((e) => e.id === exerciseId);
    if (!local) {
      return NextResponse.json({ error: `Ejercicio ${exerciseId} no encontrado` }, { status: 404 });
    }
    exercise = local;
  }

  // 2. Verificación simbólica con mathjs (RF-05, RNF-01) ─────────────────────
  let isCorrect = false;
  let errorType: string | null = null;

  const studentExpr = toMathjs(studentAnswer.trim());
  const expectedExpr = exercise.expected_answer;
  const originalExpr = exercise.correct_expr;

  try {
    isCorrect = numericallyEqual(studentExpr, expectedExpr);
    if (!isCorrect) {
      errorType = classifyError(studentExpr, expectedExpr, originalExpr);
    }
  } catch (e) {
    // Si mathjs no puede parsear la respuesta, es una expresión inválida
    console.error("[Ariadna/verify] Error al procesar expresión:", e);
    return NextResponse.json(
      { error: "Expresión matemática inválida. Revisa la sintaxis (usa ^ para potencias, * para multiplicar)." },
      { status: 400 }
    );
  }

  const prereqSuggested = isCorrect ? null : exercise.prereq_on_fail;
  const responseTimeMs = Date.now() - startedAt;

  // 3. Persistir el intento (RF-16) ──────────────────────────────────────────
  let attemptId: number | null = null;
  if (supabase && exerciseFromDb) {
    let totalCorrect = 0;
    const { data: priorAttempts } = await supabase
      .from("attempts")
      .select("is_correct")
      .eq("student_id", studentId)
      .eq("node_id", exercise.node_id)
      .order("id", { ascending: false })
      .limit(5);

    if (priorAttempts) {
      for (const pa of priorAttempts) {
        if (pa.is_correct) totalCorrect++;
        else break;
      }
    }

    const currentCorrect = isCorrect ? totalCorrect + 1 : 0;

    if (isCorrect && currentCorrect >= 3) {
      // Estudiante acaba de dominar el nodo. Lo insertamos en la BD.
      supabase.from("mastery_logs").insert({
        student_id: studentId,
        node_id: exercise.node_id
      }).then(); // Fire-and-forget

      // También inicializamos el array de nodos dominados pre-generado vía un RPC o array append.
      supabase.rpc("append_mastered_node", {
        p_student_id: studentId,
        p_node_id: exercise.node_id
      }).then();
    }

    const { data: attempt, error: insertErr } = await supabase
      .from("attempts")
      .insert({
        student_id: studentId,
        exercise_id: exercise.id,
        node_id: exercise.node_id,
        student_answer: studentAnswer,
        is_correct: isCorrect,
        error_type: errorType,
        prereq_suggested: prereqSuggested,
        response_time_ms: responseTimeMs,
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("[Ariadna] No se pudo registrar el intento:", insertErr);
    } else {
      attemptId = attempt?.id ?? null;
    }
  }

  return NextResponse.json({
    correct: isCorrect,
    errorType,
    prereqSuggested,
    failReason: isCorrect ? null : exercise.fail_reason,
    attemptId,
  });
}
