import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Fetch all exercises (Used by AriadnaApp for robustness)
export async function GET() {
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "No DB configuration" }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data } = await supabase.from("exercises").select("*").order("id", { ascending: true });
  return NextResponse.json({ exercises: data || [] });
}

// Create a new custom exercise
export async function POST(req: NextRequest) {
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "No DB configuration" }, { status: 500 });
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    const { node_id, prompt, correct_expr } = await req.json();
    
    if (!node_id || !prompt || !correct_expr) {
      return NextResponse.json({ error: "Campos incompletos" }, { status: 400 });
    }

    const { data, error } = await supabase.from("exercises").insert({
      node_id,
      prompt,
      correct_expr,
      variable: "x",
      exercise_type: "algebraic"
    }).select().single();

    if (error) throw error;

    return NextResponse.json({ success: true, exercise: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
