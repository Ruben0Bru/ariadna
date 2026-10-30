import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { EXERCISES } from "@/lib/dag";
import { getTeacherAuth, getAnyAuth, getServerSupabaseConfig } from "@/lib/auth";

// Map local exercise format to the DB format the client expects
function localToDbFormat(ex: typeof EXERCISES[number]) {
  return {
    id: ex.id,
    prompt: ex.prompt,
    correct_expr: ex.expr,
    node_id: ex.node,
    prereq_on_fail: ex.prereqOnFail || null,
    fail_reason: ex.failReason || null,
    variable: "x",
  };
}

/**
 * GET /api/exercises
 * Returns all exercises from Supabase if available, or falls back to the
 * local hardcoded bank (lib/dag.ts EXERCISES) so students are NEVER blocked.
 */
export async function GET(req: NextRequest) {
  // Solo usuarios con sesión (estudiante o docente) pueden leer el banco.
  if (!getAnyAuth(req)) {
    return NextResponse.json({ error: "Sesión requerida", authRequired: true }, { status: 401 });
  }

  const cfg = getServerSupabaseConfig();
  // If no DB configured at all, serve local bank immediately
  if (!cfg) {
    console.log("[exercises] No DB config — serving local exercise bank");
    return NextResponse.json({ exercises: EXERCISES.map(localToDbFormat), source: "local" });
  }

  const supabase = createClient(cfg.url, cfg.key);

  try {
    const { data, error } = await supabase
      .from("exercises")
      .select("*")
      .order("id", { ascending: true });

    // If DB returns exercises, serve them
    if (!error && data && data.length > 0) {
      return NextResponse.json({ exercises: data, source: "db" });
    }

    // DB returned empty or errored — fall back to local bank
    if (error) {
      console.warn("[exercises] DB error, falling back to local bank:", error.message);
    } else {
      console.log("[exercises] DB empty — falling back to local exercise bank");
    }

    return NextResponse.json({ exercises: EXERCISES.map(localToDbFormat), source: "local" });
  } catch (e) {
    console.warn("[exercises] Exception, falling back to local bank:", e);
    return NextResponse.json({ exercises: EXERCISES.map(localToDbFormat), source: "local" });
  }
}

// Create a new custom exercise (teacher use only)
export async function POST(req: NextRequest) {
  if (!getTeacherAuth(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const cfg = getServerSupabaseConfig();
  if (!cfg) {
    return NextResponse.json({ error: "No DB configuration" }, { status: 500 });
  }

  const supabase = createClient(cfg.url, cfg.key);

  try {
    const { node_id, prompt, correct_expr } = await req.json();

    if (!node_id || !prompt || !correct_expr) {
      return NextResponse.json({ error: "Campos incompletos" }, { status: 400 });
    }

    const { data, error } = await supabase.from("exercises").insert({
      node_id,
      prompt,
      correct_expr,
      variable: "x"
    }).select().single();

    if (error) throw error;

    return NextResponse.json({ success: true, exercise: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
