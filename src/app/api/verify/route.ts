// src/app/api/verify/route.ts
// Verificación matemática (motor numérico math.js) + registro del intento.
// Cambios clave:
//  - La identidad del estudiante sale de la COOKIE firmada, no del body.
//  - Todos los inserts/updates se esperan (await) con reintento: nada se pierde.
//  - El nodo se marca dominado en el servidor solo con 3 aciertos consecutivos.

import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { evaluate } from "mathjs";
import { EXERCISES } from "@/lib/dag";
import { getStudentAuth, getServerSupabaseConfig } from "@/lib/auth";

const MASTERY_THRESHOLD = 3;
const MAX_ANSWER_LENGTH = 200;

// Puntos de prueba: se usan solo los que son reales en AMBAS expresiones, así
// ln(x-3), sqrt(x) o similares también se pueden comparar.
const TEST_POINTS = [1.3, -0.7, 2.9, -2.1, 0.05, 4.7, 0.6, 1.9, 3.3, 5.5, -3.4, 7.1];

interface VerifyBody {
  exerciseId: number;
  studentAnswer: string;
}

// Funciones de math.js que un estudiante nunca necesita y que no queremos evaluar.
const FORBIDDEN = /\b(import|createUnit|evaluate|parse|compile|simplify|derivative|rationalize|resolve|chain|reviver|typed|config|help|function)\b/i;

function toMathjs(expr: string): string {
  let p = expr.trim();

  // Unicode habitual al escribir/pegar matemáticas
  p = p
    .replace(/[−–—]/g, "-")
    .replace(/[·×⋅]/g, "*")
    .replace(/÷/g, "/")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3");

  p = p.replace(/\*\*/g, "^");

  // LaTeX básico: \frac{a}{b} y \cdot
  p = p.replace(/\\frac{([^{}]+)}{([^{}]+)}/g, "($1)/($2)");
  p = p.replace(/\\cdot/g, "*");
  p = p.replace(/\\/g, "");

  // Notación en español / alias frecuentes
  p = p.replace(/\bsen\(/gi, "sin(").replace(/\btg\(/gi, "tan(").replace(/\bln\(/gi, "log(");

  return p;
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
  let passed = 0;
  let tried = 0;
  for (const pt of TEST_POINTS) {
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

// Ejecuta una operación de Supabase y la reintenta una vez si falla.
type SbResult = { error: { message: string } | null; data?: any };

async function withRetry<T extends SbResult>(
  label: string,
  op: () => PromiseLike<T>
): Promise<T> {
  let res = await op();
  if (res.error) {
    console.error(`[verify] ${label} falló, reintentando:`, res.error.message);
    res = await op();
    if (res.error) console.error(`[verify] ${label} falló de nuevo:`, res.error.message);
  }
  return res;
}

// Marca el nodo como dominado si los últimos N intentos en ese nodo son correctos.
async function updateMastery(supabase: SupabaseClient, studentId: string, nodeId: string): Promise<boolean> {
  const { data: recent, error } = await supabase
    .from("attempts")
    .select("is_correct")
    .eq("student_id", studentId)
    .eq("node_id", nodeId)
    .order("id", { ascending: false })
    .limit(MASTERY_THRESHOLD);

  if (error || !recent || recent.length < MASTERY_THRESHOLD) return false;
  if (!recent.every(r => r.is_correct === true)) return false;

  const { data: sData } = await supabase
    .from("students")
    .select("mastered_nodes")
    .eq("id", studentId)
    .single();

  const current: string[] = sData?.mastered_nodes ?? [];
  if (current.includes(nodeId)) return true;

  await withRetry("update mastered_nodes", () =>
    supabase.from("students").update({ mastered_nodes: [...current, nodeId] }).eq("id", studentId)
  );
  return true;
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();

  const auth = getStudentAuth(req);
  if (!auth) {
    return NextResponse.json(
      { error: "Tu sesión expiró. Vuelve a ingresar con tu código.", authRequired: true },
      { status: 401 }
    );
  }
  const studentId = auth.id;
  const groupId = auth.groupId ?? null;

  let body: VerifyBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const exerciseId = Number(body.exerciseId);
  const studentAnswer = typeof body.studentAnswer === "string" ? body.studentAnswer.trim() : "";

  if (!exerciseId || !studentAnswer) {
    return NextResponse.json({ error: "Faltan campos requeridos." }, { status: 400 });
  }
  if (studentAnswer.length > MAX_ANSWER_LENGTH) {
    return NextResponse.json({ error: "La respuesta es demasiado larga." }, { status: 400 });
  }

  const cfg = getServerSupabaseConfig();
  if (!cfg) {
    return NextResponse.json({ error: "BD no configurada en el servidor." }, { status: 500 });
  }
  const supabase = createClient(cfg.url, cfg.key);

  // FETCH EXERCISE — primero la BD; si no está, el banco local
  let ex: { node_id: string; correct_expr: string; variable: string; prereq_on_fail: string | null; fail_reason: string | null } | null = null;

  const { data: dbEx, error: exError } = await supabase
    .from("exercises")
    .select("node_id, correct_expr, variable, prereq_on_fail, fail_reason")
    .eq("id", exerciseId)
    .single();

  if (!exError && dbEx) {
    ex = dbEx;
  } else {
    const localEx = EXERCISES.find(e => e.id === exerciseId);
    if (localEx) {
      ex = {
        node_id: localEx.node,
        correct_expr: localEx.expr,
        variable: "x",
        prereq_on_fail: localEx.prereqOnFail || null,
        fail_reason: localEx.failReason || null,
      };
    }
  }

  if (!ex) {
    return NextResponse.json({ error: `Ejercicio ${exerciseId} no encontrado.` }, { status: 404 });
  }

  const variable = ex.variable || "x";
  const expectedExprMathjs = toMathjs(ex.correct_expr);
  const studentExprMathjs = toMathjs(studentAnswer);

  let isCorrect = false;
  let errorType: string | null = null;

  const evalTest = FORBIDDEN.test(studentAnswer) ? null : evalAt(studentExprMathjs, 1.0, variable);

  if (evalTest === null) {
    // No se pudo evaluar (sintaxis o dominio en x=1): se intenta con otros puntos
    // antes de declarar error de sintaxis.
    const evaluableElsewhere =
      !FORBIDDEN.test(studentAnswer) &&
      TEST_POINTS.some(pt => evalAt(studentExprMathjs, pt, variable) !== null);
    if (!evaluableElsewhere) {
      errorType = "syntax";
    } else {
      isCorrect = numericallyEqual(studentExprMathjs, expectedExprMathjs, variable);
      if (!isCorrect) {
        errorType = classifyError(studentExprMathjs, expectedExprMathjs, toMathjs(ex.correct_expr), variable);
      }
    }
  } else {
    isCorrect = numericallyEqual(studentExprMathjs, expectedExprMathjs, variable);
    if (!isCorrect) {
      errorType = classifyError(studentExprMathjs, expectedExprMathjs, toMathjs(ex.correct_expr), variable);
    }
  }

  const prereqSuggested = isCorrect ? null : (ex.prereq_on_fail || null);

  // ── REGISTRO DEL INTENTO (con await y reintento) ──────────────────────────
  const attemptRow = {
    student_id: studentId,
    exercise_id: exerciseId,
    node_id: ex.node_id,
    student_answer: studentAnswer,
    is_correct: isCorrect,
    error_type: errorType,
    prereq_suggested: prereqSuggested,
    response_time_ms: Date.now() - startedAt,
    group_id: groupId,
  };

  const attemptRes = await withRetry("insert attempt", () =>
    supabase.from("attempts").insert(attemptRow).select("id").maybeSingle()
  );
  const attemptId: number | null = attemptRes.data?.id ?? null;
  const logged = !attemptRes.error;

  // ── DOMINIO DE NODO (solo servidor): 3 aciertos consecutivos ──────────────
  let mastered = false;
  if (isCorrect && logged) {
    mastered = await updateMastery(supabase, studentId, ex.node_id);
  }

  return NextResponse.json({
    correct: isCorrect,
    errorType: isCorrect ? null : errorType,
    prereqSuggested,
    failReason: isCorrect ? null : ex.fail_reason,
    attemptId,
    mastered,
    logged,
  });
}
