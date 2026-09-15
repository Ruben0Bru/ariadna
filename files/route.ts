// src/app/api/verify/route.ts
//
// Orquestador del ciclo completo (RF-05, RF-11, RF-16):
//   1. Llama al motor simbólico real (SymPy) — nunca al LLM para verificar.
//   2. Persiste el intento en Supabase (attempts) — esto es lo que
//      alimenta el análisis de la tesis, no es opcional.
//   3. Devuelve al frontend el resultado + los datos que necesita el
//      módulo de mediación pedagógica para redactar el feedback.
//
// Lo que este endpoint NO hace: no le pide al LLM que verifique nada.
// La llamada a Gemini/Claude para redactar el texto ocurre en el
// frontend o en otro endpoint separado, a partir de este resultado.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // server-side only, nunca en el cliente
);

const VERIFY_SERVICE_URL = process.env.VERIFY_SERVICE_URL ?? "http://localhost:8000";

interface VerifyBody {
  studentId: string;
  exerciseId: number;
  studentAnswer: string;
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const body: VerifyBody = await req.json();
  const { studentId, exerciseId, studentAnswer } = body;

  if (!studentId || !exerciseId || !studentAnswer) {
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
  }

  // 1. Traer el ejercicio real (nunca confiar en el frontend para la respuesta correcta)
  const { data: exercise, error: exErr } = await supabase
    .from("exercises")
    .select("id, node_id, correct_expr, variable, prereq_on_fail, fail_reason")
    .eq("id", exerciseId)
    .single();

  if (exErr || !exercise) {
    return NextResponse.json({ error: "Ejercicio no encontrado" }, { status: 404 });
  }

  // 2. Verificación simbólica real, en el microservicio Python
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
    });
    if (!res.ok) throw new Error(`verify service respondió ${res.status}`);
    verifyResult = await res.json();
  } catch (e) {
    // Si el motor simbólico cae, NO se debe inventar un resultado.
    // Se falla explícitamente — es preferible un error visible a un
    // falso "correcto"/"incorrecto" no verificado (RNF-01).
    return NextResponse.json(
      { error: "El motor de verificación no está disponible. Intenta de nuevo." },
      { status: 503 }
    );
  }

  const prereqSuggested = verifyResult.correct ? null : exercise.prereq_on_fail;
  const responseTimeMs = Date.now() - startedAt;

  // 3. Persistir el intento — este insert es RF-16, el requisito más crítico del MVP
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
    // No perdemos la respuesta al estudiante por un fallo de log, pero
    // sí queda registrado en el server para no perder el dato en silencio.
    console.error("No se pudo registrar el intento:", insertErr);
  }

  return NextResponse.json({
    correct: verifyResult.correct,
    errorType: verifyResult.error_type,
    prereqSuggested,
    failReason: verifyResult.correct ? null : exercise.fail_reason,
    attemptId: attempt?.id ?? null,
  });
}
