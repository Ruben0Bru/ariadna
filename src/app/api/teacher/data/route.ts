import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function GET() {
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Falta configuración de base de datos en servidor" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { data: students } = await supabase.from("students").select("id, code, group_id, mastered_nodes");
    const { data: attempts } = await supabase.from("attempts").select("student_id");
    const { data: exercises } = await supabase.from("exercises").select("*").order("id", { ascending: true });

    return NextResponse.json({
      students: students || [],
      attempts: attempts || [],
      exercises: exercises || []
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
