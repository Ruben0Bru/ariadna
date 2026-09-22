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
  if (isTeacherCode(code)) {
    if (!supabaseUrl || !supabaseKey) {
      // Modo offline: aceptar cualquier código PROF-
      return NextResponse.json({ teacherId: code, name: "Docente (modo offline)", offline: true });
    }
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from("teachers")
      .select("id, name")
      .eq("code", code)
      .maybeSingle();

    if (error) {
      console.error("[Ariadna/login] Error al buscar docente:", error);
      return NextResponse.json({ error: "Error de base de datos." }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json(
        { error: `Código de docente "${code}" no registrado. Contacta al administrador.` },
        { status: 404 }
      );
    }

    return NextResponse.json({ teacherId: data.id, name: data.name });
  }

  // ── Flujo de estudiante ─────────────────────────────────────────────────────
  const groupId = inferGroupFromCode(code);

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ studentId: code, groupId, masteredNodes: [], offline: true });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: existing } = await supabase
    .from("students")
    .select("id, group_id, mastered_nodes")
    .eq("code", code)
    .maybeSingle();

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
        { error: `Error DB: ${error?.message ?? "Desconocido"}` },
        { status: 500 }
      );
    }
    studentId = created.id;
    resolvedGroupId = created.group_id;
  }

  return NextResponse.json({ studentId, groupId: resolvedGroupId, masteredNodes });
}
