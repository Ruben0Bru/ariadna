// src/app/api/teacher/export/route.ts
// Datos para el panel del docente/investigador, solo con sesión de docente.
//   GET ?type=attempts       → todos los intentos (con código y grupo del estudiante)
//   GET ?type=chats          → todos los mensajes del chat
//   GET ?type=active_session → sesión de clase activa (id + ejercicios)
// Reemplaza las consultas directas a Supabase con la clave pública desde el navegador.

import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getTeacherAuth, getServerSupabaseConfig } from "@/lib/auth";

const PAGE = 1000; // Supabase devuelve como máximo 1000 filas por consulta

async function fetchAll(sb: SupabaseClient, table: string, select: string) {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from(table)
      .select(select)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export async function GET(req: NextRequest) {
  if (!getTeacherAuth(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const cfg = getServerSupabaseConfig();
  if (!cfg) {
    return NextResponse.json({ error: "Falta configuración de base de datos" }, { status: 500 });
  }
  const sb = createClient(cfg.url, cfg.key);
  const type = req.nextUrl.searchParams.get("type");

  try {
    if (type === "attempts") {
      const data = await fetchAll(sb, "attempts", "*, students(code, group_id)");
      return NextResponse.json({ data });
    }
    if (type === "chats") {
      const data = await fetchAll(sb, "chat_logs", "*, students(code, group_id)");
      return NextResponse.json({ data });
    }
    if (type === "active_session") {
      const { data } = await sb
        .from("class_sessions")
        .select("id, exercise_ids")
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return NextResponse.json({ data: data ?? null });
    }
    return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
