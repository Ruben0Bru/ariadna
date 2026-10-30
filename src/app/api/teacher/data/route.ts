import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTeacherAuth, getServerSupabaseConfig } from "@/lib/auth";

export async function GET(req: NextRequest) {
  if (!getTeacherAuth(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const cfg = getServerSupabaseConfig();
  if (!cfg) {
    return NextResponse.json({ error: "Falta configuración de base de datos en servidor" }, { status: 500 });
  }

  const supabase = createClient(cfg.url, cfg.key);

  try {
    let students: any[] = [];
    let attempts: any[] = [];
    let exercises: any[] = [];

    const { data: sData, error: sErr } = await supabase.from("students").select("id, code, group_id, mastered_nodes");
    if (!sErr && sData) students = sData;

    const { data: aData, error: aErr } = await supabase.from("attempts").select("student_id");
    if (!aErr && aData) attempts = aData;

    const { data: eData, error: eErr } = await supabase.from("exercises").select("*").order("id", { ascending: true });
    if (!eErr && eData) exercises = eData;

    return NextResponse.json({
      students,
      attempts,
      exercises
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
