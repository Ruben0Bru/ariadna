import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTeacherAuth, getServerSupabaseConfig } from "@/lib/auth";

// GET es público a propósito: lo usa la pantalla de login y la app del estudiante
// para saber si hay una sesión de clase activa. Solo devuelve ids de ejercicios.
export async function GET() {
  const cfg = getServerSupabaseConfig();
  if (!cfg) {
    return NextResponse.json({ error: "Falta DB" }, { status: 500 });
  }
  const supabase = createClient(cfg.url, cfg.key);
  const { data } = await supabase
    .from("class_sessions")
    .select("exercise_ids")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ activeSession: data || null });
}

export async function POST(req: NextRequest) {
  if (!getTeacherAuth(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const cfg = getServerSupabaseConfig();
  if (!cfg) {
    return NextResponse.json({ error: "Falta configuración de DB" }, { status: 500 });
  }

  try {
    const { action, exerciseIds, teacherCode } = await req.json();
    const supabase = createClient(cfg.url, cfg.key);

    if (action === "deactivate") {
      await supabase.from("class_sessions").update({ active: false }).eq("active", true);
      return NextResponse.json({ success: true });
    }

    if (action === "activate") {
      // Deactivate others
      await supabase.from("class_sessions").update({ active: false }).eq("active", true);

      let teacherId = null;
      if (teacherCode) {
        const { data: tData } = await supabase
          .from("teachers")
          .select("id")
          .eq("code", teacherCode)
          .maybeSingle();
        teacherId = tData?.id ?? null;
      }

      const { data, error } = await supabase
        .from("class_sessions")
        .insert({ exercise_ids: exerciseIds, active: true, teacher_id: teacherId })
        .select("id")
        .single();
        
      if (error) throw error;

      return NextResponse.json({ success: true, sessionId: data.id });
    }

    return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
