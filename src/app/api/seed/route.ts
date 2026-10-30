import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { DAG, EXERCISES } from "@/lib/dag";
import { getTeacherAuth, getServerSupabaseConfig } from "@/lib/auth";

export async function POST(req: NextRequest) {
  if (!getTeacherAuth(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const cfg = getServerSupabaseConfig();
  if (!cfg) {
    return NextResponse.json({ error: "Falta configuración de DB" }, { status: 500 });
  }

  const supabase = createClient(cfg.url, cfg.key);

  try {
    // 1. Sembrar Nodos
    const nodeInserts = Object.keys(DAG).map((key) => ({
      id: key,
      label: DAG[key].label,
      unit: DAG[key].unit,
      unit_order: 3
    }));
    const { error: nodeErr } = await supabase.from("nodes").upsert(nodeInserts);
    if (nodeErr) throw new Error("Error en nodos: " + nodeErr.message);

    // 2. Sembrar Ejercicios
    const inserts = EXERCISES.map((ex: any, i: number) => ({
      // Forzamos un ID limpio que no choque con los que usa schema.sql
      id: i + 100, 
      node_id: ex.node,
      correct_expr: ex.expr,
      variable: "x",
      prereq_on_fail: ex.prereqOnFail || null,
      fail_reason: ex.failReason,
      prompt: ex.prompt
    }));

    const { error: exErr } = await supabase.from("exercises").upsert(inserts);
    if (exErr) throw new Error("Error en ejercicios: " + exErr.message);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
