// src/app/api/class-session-status/route.ts
// GET → { active: boolean, sessionId: string | null }
// Usa service role key — nunca expone la anon key al navegador.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ active: false, sessionId: null });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from("class_sessions")
      .select("id")
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[Ariadna/class-session-status] DB error:", error.message);
      return NextResponse.json({ active: false, sessionId: null });
    }

    return NextResponse.json({
      active: !!data,
      sessionId: data?.id ?? null,
    });
  } catch (e) {
    console.error("[Ariadna/class-session-status] Excepción:", e);
    return NextResponse.json({ active: false, sessionId: null });
  }
}
