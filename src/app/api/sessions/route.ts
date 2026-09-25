import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function POST(req: NextRequest) {
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Falta configuración de DB" }, { status: 500 });
  }

  try {
    const { action, exerciseIds, teacherCode } = await req.json();
    const supabase = createClient(supabaseUrl, supabaseKey);

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
