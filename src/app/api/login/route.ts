// src/app/api/login/route.ts
// Registra / recupera al estudiante por código (RF-14).
// Si Supabase no está configurado, crea una sesión local temporal.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { inferGroupFromCode } from "@/lib/utils";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
      { error: "Código inválido. Debe tener al menos 4 caracteres (ej. G2-014)." },
      { status: 400 }
    );
  }


  // ── Modo offline: sin Supabase configurado ────────────────────────────────
  if (!supabaseUrl || !supabaseKey) {
    const groupId = inferGroupFromCode(code);
    return NextResponse.json({
      studentId: code,
      groupId,
      masteredNodes: [],
      offline: true,
    });
  }

  // ── Modo Supabase ─────────────────────────────────────────────────────────
  const supabase = createClient(supabaseUrl, supabaseKey);
  const groupId = inferGroupFromCode(code);

  // Buscar estudiante existente o crear uno nuevo (upsert por código)
  const { data: existing, error: selectError } = await supabase
    .from("students")
    .select("id, group_id")
    .eq("code", code)
    .maybeSingle();

  let studentId: string;
  let resolvedGroupId: number;

  if (existing) {
    studentId = existing.id;
    resolvedGroupId = existing.group_id;
  } else {
    // Crear nuevo estudiante
    const { data: created, error } = await supabase
      .from("students")
      .insert({ code, group_id: groupId })
      .select("id, group_id")
      .single();

    if (error || !created) {
      console.error("[Ariadna/login] Error al crear estudiante:", error || selectError);
      return NextResponse.json(
        { error: `Error DB: ${error?.message || selectError?.message || "Desconocido"}. Verifica que las tablas y grupos estén creados en Supabase.` },
        { status: 500 }
      );
    }
    studentId = created.id;
    resolvedGroupId = created.group_id;
  }

  // RF-18: Cargar nodos ya dominados en sesiones anteriores
  const { data: masterAttempts } = await supabase
    .from("attempts")
    .select("node_id")
    .eq("student_id", studentId)
    .eq("is_correct", true);

  const masteredNodes = masterAttempts
    ? [...new Set(masterAttempts.map((a: { node_id: string }) => a.node_id))]
    : [];

  return NextResponse.json({ studentId, groupId: resolvedGroupId, masteredNodes });
}
