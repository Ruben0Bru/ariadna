// src/app/api/verify/route.ts
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

function toMathjs(expr: string): string {
  return expr
    .replace(/\*\*/g, "^")
    .replace(/sqrt\(/g, "sqrt(")
    .trim();
}

function evalAt(expr: string, val: number, variable: string = "x"): number | null {
  try {
    const scope: Record<string, number> = {};
    scope[variable] = val;
    const result = evaluate(expr, scope);
    const n = typeof result === "number" ? result : (result as { toNumber?: () => number }).toNumber?.();
    if (typeof n !== "number" || !isFinite(n)) return null;
    return n;
  } catch {
    return null;
  }
}

function numericallyEqual(expr1: string, expr2: string, variable: string = "x"): boolean {
  const points = [1.3, -0.7, 2.9, -2.1, 0.05];
  let passed = 0;
  let tried = 0;
  for (const pt of points) {
    const v1 = evalAt(expr1, pt, variable);
    const v2 = evalAt(expr2, pt, variable);
    if (v1 === null || v2 === null) continue;
    tried++;
    if (Math.abs(v1 - v2) <= 1e-6 * Math.max(1, Math.abs(v1))) passed++;
  }
  return tried >= 3 && passed === tried;
}

function classifyError(studentExpr: string, expectedExpr: string, originalExpr: string, variable: string = "x"): string {
  if (numericallyEqual(studentExpr, originalExpr, variable)) return "no_derivo";
  if (numericallyEqual(studentExpr, `-(${expectedExpr})`, variable)) return "signo";
  try {
    const pts = [1.3, 2.9, -0.7];
    const diffs = pts.map(pt => {
      const sv = evalAt(studentExpr, pt, variable);
      const ev = evalAt(expectedExpr, pt, variable);
      return sv !== null && ev !== null ? sv - ev : null;
    }).filter(d => d !== null) as number[];
    if (diffs.length >= 2) {
      const allSame = diffs.every(d => Math.abs(d - diffs[0]) < 1e-6);
      if (allSame && Math.abs(diffs[0]) > 1e-6) return "constante";
    }
  } catch { /* ignore */ }
  return "desconocido";
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
    return NextResponse.json({ error: "Faltan campos requeridos." }, { status: 400 });
  }

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "BD no configurada." }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // FETCH NATIVE SUPERBASE EXERCISE
  const { data: ex, error: exError } = await supabase
    .from("exercises")
    .select("node_id, correct_expr, variable, prereq_on_fail, fail_reason")
    .eq("id", exerciseId)
    .single();

  if (exError || !ex) {
    console.error(exError);
    return NextResponse.json({ error: `Ejercicio ${exerciseId} no funciona o no existe.` }, { status: 404 });
  }

  const variable = ex.variable || "x";
  const expectedExprMathjs = toMathjs(ex.correct_expr);
  const studentExprMathjs = toMathjs(studentAnswer);

  let isCorrect = false;
  let fallbackSyntaxError = false;
  let errorType: string | null = null;
  
  let evalTest = evalAt(studentExprMathjs, 1.0, variable);
  
  if (evalTest === null) {
    fallbackSyntaxError = true;
    errorType = "syntax";
  } else {
    isCorrect = numericallyEqual(studentExprMathjs, expectedExprMathjs, variable);
    if (!isCorrect) {
       errorType = classifyError(studentExprMathjs, expectedExprMathjs, toMathjs(ex.correct_expr), variable);
    }
  }

  const prereqSuggested = isCorrect ? null : (ex.prereq_on_fail || null);

  // LOG ATTEMPT
  let attemptId: number | null = null;

  if (isCorrect) {
    // Update mastered_nodes directly (no RPC dependency)
    supabase.from("students")
      .select("mastered_nodes")
      .eq("id", studentId)
      .single()
      .then(({ data: sData }) => {
        if (!sData) return;
        const current: string[] = sData.mastered_nodes ?? [];
        if (!current.includes(ex.node_id)) {
          supabase.from("students")
            .update({ mastered_nodes: [...current, ex.node_id] })
            .eq("id", studentId)
            .then();
        }
      });
  }


  const { data: attemptData } = await supabase
    .from("attempts")
    .insert({
      student_id: studentId,
      exercise_id: exerciseId,
      node_id: ex.node_id,
      student_answer: studentAnswer,
      is_correct: isCorrect,
      error_type: errorType,
      prereq_suggested: prereqSuggested,
      response_time_ms: Date.now() - startedAt,
    })
    .select("id")
    .maybeSingle();

  if (attemptData) attemptId = attemptData.id;

  return NextResponse.json({
    correct: isCorrect,
    errorType: fallbackSyntaxError ? "syntax" : (isCorrect ? null : "algebraic"), // frontend fallback support
    prereqSuggested,
    failReason: isCorrect ? null : ex.fail_reason,
    attemptId,
  });
}
