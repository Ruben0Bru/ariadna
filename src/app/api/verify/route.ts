// src/app/api/verify/route.ts
//
// Orquestador del ciclo completo (RF-05, RF-11, RF-16):
//   1. Llama al motor simbólico real (SymPy en backend Python) — NUNCA al LLM.
//   2. Persiste el intento en Supabase (tabla attempts) — insumo de la tesis.
//   3. Devuelve el resultado + datos para el módulo pedagógico (feedback).
//
// Diseño deliberado (RNF-05): el LLM NUNCA verifica matemáticamente nada.
// La llamada a Gemini para redactar texto ocurre en /api/feedback, separada.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const VERIFY_SERVICE_URL =
  process.env.VERIFY_SERVICE_URL ?? "http://localhost:8000";

interface VerifyBody {
  studentId: string;
  exerciseId: number;
  studentAnswer: string;
}

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

  // 1. Traer el ejercicio (nunca confiar en el frontend para la respuesta correcta)
  interface ExerciseRecord {
    id: number;
    node_id: string;
    correct_expr: string;
    variable: string;
    prereq_on_fail: string | null;
    fail_reason: string | null;
  }
  // Banco local (siempre disponible como respaldo)
  const LOCAL_EXERCISES: ExerciseRecord[] = [
    // Álgebra derivadas
    { id: 1, node_id: "algebra_derivadas", correct_expr: "3*x**2 - 5*x + 2",           variable: "x", prereq_on_fail: "leyes_exponentes", fail_reason: "leyes de exponentes al derivar potencias" },
    { id: 2, node_id: "algebra_derivadas", correct_expr: "(x**2 - 1)*(x + 3)",         variable: "x", prereq_on_fail: "factorizacion",    fail_reason: "expansión y simplificación de productos algebraicos" },
    { id: 3, node_id: "algebra_derivadas", correct_expr: "x**3 / x",                   variable: "x", prereq_on_fail: "factorizacion",    fail_reason: "simplificación de fracciones algebraicas" },
    { id: 4, node_id: "algebra_derivadas", correct_expr: "4*x**4 - 3*x**3 + 2*x - 7", variable: "x", prereq_on_fail: "leyes_exponentes", fail_reason: "regla de la potencia a cada término del polinomio" },
    { id: 5, node_id: "algebra_derivadas", correct_expr: "x**2 * x**3",                variable: "x", prereq_on_fail: "factorizacion",    fail_reason: "simplificar el producto de potencias antes de derivar" },
    { id: 6, node_id: "algebra_derivadas", correct_expr: "(2*x - 1)**2",                variable: "x", prereq_on_fail: "factorizacion",    fail_reason: "expandir el cuadrado de un binomio antes de derivar" },
    { id: 7, node_id: "algebra_derivadas", correct_expr: "5*x**3 - 2*x + 8",           variable: "x", prereq_on_fail: "leyes_exponentes", fail_reason: "la derivada de una constante es cero" },
    // Leyes exponentes
    { id: 8, node_id: "leyes_exponentes", correct_expr: "x**7",                        variable: "x", prereq_on_fail: null,               fail_reason: "multiplicación de potencias con igual base (se suman los exponentes)" },
    { id: 9, node_id: "leyes_exponentes", correct_expr: "x**3",                        variable: "x", prereq_on_fail: null,               fail_reason: "división de potencias con igual base (se restan los exponentes)" },
    { id: 10, node_id: "leyes_exponentes", correct_expr: "sqrt(x)",       variable: "x", prereq_on_fail: null,               fail_reason: "conversión de raíz a exponente fraccionario" },
    // Factorización
    { id: 11, node_id: "factorizacion", correct_expr: "x**2 - 4",                      variable: "x", prereq_on_fail: null,               fail_reason: "producto notable de diferencia de cuadrados" },
    { id: 12, node_id: "factorizacion", correct_expr: "x**2 + 6*x + 9",                variable: "x", prereq_on_fail: null,               fail_reason: "el cuadrado de un binomio perfecto" },
    { id: 13, node_id: "factorizacion", correct_expr: "x**3 + 5*x",                    variable: "x", prereq_on_fail: null,               fail_reason: "distributiva en polinomios simples" },
    // Regla de cadena
    { id: 14, node_id: "regla_cadena", correct_expr: "6*(2*x + 1)**2",                 variable: "x", prereq_on_fail: "algebra_derivadas", fail_reason: "aplicar derivada de la función externa multiplicada por la derivada de la interna (2)" },
  ];

  let exercise: ExerciseRecord | null = null;
  let exerciseFromDb = false; // true solo si la BD respondió correctamente

  if (supabase) {
    // Intentar desde Supabase si las credenciales están configuradas
    const { data } = await supabase
      .from("exercises")
      .select("id, node_id, correct_expr, variable, prereq_on_fail, fail_reason")
      .eq("id", exerciseId)
      .single();

    if (data) {
      exercise = data as ExerciseRecord;
      exerciseFromDb = true;
    } else {
      // Supabase no respondió correctamente → usar banco local
      console.warn("[Ariadna/verify] Supabase no disponible, usando banco local. exerciseId:", exerciseId);
      exercise = LOCAL_EXERCISES.find((e) => e.id === exerciseId) ?? null;
    }
  } else {
    exercise = LOCAL_EXERCISES.find((e) => e.id === exerciseId) ?? null;
  }

  if (!exercise) {
    return NextResponse.json({ error: `Ejercicio ${exerciseId} no encontrado` }, { status: 404 });
  }

  // 2. Verificación simbólica — microservicio Python/SymPy
  //    AbortSignal.timeout(3000) → falla en 3s si el servicio no responde
  let verifyResult: { correct: boolean; error_type: string | null };
  try {
    const res = await fetch(`${VERIFY_SERVICE_URL}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_answer: studentAnswer,
        correct_expr: exercise.correct_expr,
        variable: exercise.variable ?? "x",
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`verify service respondió ${res.status}: ${errBody}`);
    }
    verifyResult = await res.json();
  } catch (e) {
    // Si el motor simbólico cae NO se inventa resultado (RNF-01)
    console.error("[Ariadna/verify] Motor simbólico no disponible:", e);
    return NextResponse.json(
      { error: "El motor de verificación no está disponible. Intenta de nuevo en un momento." },
      { status: 503 }
    );
  }


  const prereqSuggested = verifyResult.correct ? null : exercise.prereq_on_fail;
  const responseTimeMs = Date.now() - startedAt;

  // 3. Persistir el intento (RF-16) — solo si el ejercicio vino de Supabase
  let attemptId: number | null = null;
  if (supabase && exerciseFromDb) {
    const { data: attempt, error: insertErr } = await supabase
      .from("attempts")
      .insert({
        student_id: studentId,
        exercise_id: exercise.id,
        node_id: exercise.node_id,
        student_answer: studentAnswer,
        is_correct: verifyResult.correct,
        error_type: verifyResult.error_type,
        prereq_suggested: prereqSuggested,
        response_time_ms: responseTimeMs,
      })
      .select("id")
      .single();

    if (insertErr) {
      // No perdemos la respuesta al estudiante, pero sí queda en logs del servidor
      console.error("[Ariadna] No se pudo registrar el intento:", insertErr);
    } else {
      attemptId = attempt?.id ?? null;
    }
  }

  return NextResponse.json({
    correct: verifyResult.correct,
    errorType: verifyResult.error_type,
    prereqSuggested,
    failReason: verifyResult.correct ? null : exercise.fail_reason,
    attemptId,
  });
}
