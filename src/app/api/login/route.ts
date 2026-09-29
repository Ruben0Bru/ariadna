// src/app/api/login/route.ts
// Registra / recupera al estudiante o docente por código (RF-14).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { inferGroupFromCode } from "@/lib/utils";

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function isTeacherCode(code: string): boolean {
  return code.startsWith("PROF-");
}

export async function POST(req: NextRequest) {
  let code: string;
  try {
    const body = await req.json();
    code = (body.code ?? "").trim().toUpperCase();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  if (!code || code.length < 4) {
    return NextResponse.json(
      { error: "Código inválido. Debe tener al menos 4 caracteres." },
      { status: 400 }
    );
  }

  // ── Flujo de docente ────────────────────────────────────────────────────────
  // Accept any PROF-* code — the teachers table is optional.
  // If the table doesn't exist or the code isn't registered, still allow login
  // as the teacher dashboard only needs a session identifier.
  if (isTeacherCode(code)) {
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ teacherId: code, name: `Docente (${code})`, offline: true });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Try to look up the teacher — but treat ANY error as "accept with offline mode"
    // because the teachers table may not exist in all environments.
    try {
      const { data, error } = await supabase
        .from("teachers")
        .select("id, name")
        .eq("code", code)
        .maybeSingle();

      // If query succeeded and we found a record, return it
      if (!error && data) {
        return NextResponse.json({ teacherId: data.id, name: data.name });
      }

      // If query succeeded but no record, still accept the code (open registration)
      if (!error && !data) {
        return NextResponse.json({ teacherId: code, name: `Docente (${code})` });
      }

      // For any DB error (including PGRST125 = table not found), accept gracefully
      console.warn("[Ariadna/login] No se pudo consultar tabla teachers (puede no existir):", error?.message);
      return NextResponse.json({ teacherId: code, name: `Docente (${code})`, offline: true });
    } catch (e) {
      console.warn("[Ariadna/login] Excepción al buscar docente:", e);
      return NextResponse.json({ teacherId: code, name: `Docente (${code})`, offline: true });
    }
  }

  // ── Flujo de estudiante ─────────────────────────────────────────────────────
  const groupId = inferGroupFromCode(code);

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ studentId: code, groupId, masteredNodes: [], offline: true });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: existing, error: selectError } = await supabase
    .from("students")
    .select("id, group_id, mastered_nodes")
    .eq("code", code)
    .maybeSingle();

  if (selectError) {
    console.error("[Ariadna/login] Error en lectura de estudiante:", selectError);
    return NextResponse.json(
      { error: `Error DB en lectura: ${selectError.message}. Verifica que la tabla students exista.` },
      { status: 500 }
    );
  }

  let studentId: string;
  let resolvedGroupId: number;
  let masteredNodes: string[] = [];

  if (existing) {
    studentId = existing.id;
    resolvedGroupId = existing.group_id;
    masteredNodes = existing.mastered_nodes ?? [];
  } else {
    const { data: created, error } = await supabase
      .from("students")
      .insert({ code, group_id: groupId })
      .select("id, group_id")
      .single();

    if (error || !created) {
      console.error("[Ariadna/login] Error al crear estudiante:", error);
      return NextResponse.json(
        { error: `Error DB insert: ${error?.message ?? "Desconocido"}` },
        { status: 500 }
      );
    }
    studentId = created.id;
    resolvedGroupId = created.group_id;
  }

  return NextResponse.json({ studentId, groupId: resolvedGroupId, masteredNodes });
}
