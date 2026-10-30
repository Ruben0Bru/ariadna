// src/app/api/login/route.ts
// Acceso por código (RF-14).
//  - Estudiantes: el código debe estar PRE-REGISTRADO en la tabla students y activo.
//    Esta ruta ya NO crea estudiantes.
//  - Docentes: código existente en teachers + contraseña (hash bcrypt de pgcrypto).
// Al entrar emite una cookie httpOnly firmada; el servidor deja de confiar en el
// studentId que mande el navegador.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { getServerSupabaseConfig, setAuthCookie } from "@/lib/auth";

function isTeacherCode(code: string): boolean {
  return code.startsWith("PROF-");
}

// ── Límite de intentos fallidos de docente (en memoria) ──────────────────────
// Nota: en serverless cada instancia tiene su propia memoria, así que es una
// protección básica, no absoluta.
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const fails = new Map<string, { count: number; lockedUntil: number }>();

function lockKey(req: NextRequest, code: string): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return `${ip}|${code}`;
}

function isLocked(key: string): boolean {
  const f = fails.get(key);
  return !!f && f.lockedUntil > Date.now();
}

function registerFail(key: string): void {
  const f = fails.get(key) ?? { count: 0, lockedUntil: 0 };
  f.count += 1;
  if (f.count >= MAX_FAILS) {
    f.lockedUntil = Date.now() + LOCK_MS;
    f.count = 0;
  }
  fails.set(key, f);
}

export async function POST(req: NextRequest) {
  let code: string;
  let password = "";
  try {
    const body = await req.json();
    code = (body.code ?? "").trim().toUpperCase();
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  if (!code || code.length < 4 || code.length > 40) {
    return NextResponse.json({ error: "Código no válido" }, { status: 400 });
  }

  const cfg = getServerSupabaseConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: "Servidor sin configurar (falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 500 }
    );
  }
  const supabase = createClient(cfg.url, cfg.key);

  // ── Flujo de docente ────────────────────────────────────────────────────────
  if (isTeacherCode(code)) {
    const key = lockKey(req, code);
    if (isLocked(key)) {
      return NextResponse.json(
        { error: "Demasiados intentos. Espera 15 minutos e inténtalo de nuevo." },
        { status: 429 }
      );
    }

    const { data: teacher, error } = await supabase
      .from("teachers")
      .select("id, name, password_hash")
      .eq("code", code)
      .maybeSingle();

    if (error) {
      console.error("[login] error leyendo teachers:", error.message);
      return NextResponse.json({ error: "Error al consultar la base de datos." }, { status: 500 });
    }

    let ok = false;
    if (teacher?.password_hash && password) {
      try {
        ok = await bcrypt.compare(password, teacher.password_hash);
      } catch {
        ok = false;
      }
    }

    if (!teacher || !ok) {
      registerFail(key);
      return NextResponse.json({ error: "Código o contraseña incorrectos." }, { status: 401 });
    }

    fails.delete(key);
    const res = NextResponse.json({ teacherId: teacher.id, name: teacher.name });
    if (!setAuthCookie(res, "teacher", { id: teacher.id })) {
      return NextResponse.json({ error: "No hay clave de firma configurada en el servidor." }, { status: 500 });
    }
    return res;
  }

  // ── Flujo de estudiante: SOLO códigos pre-registrados ───────────────────────
  const { data: student, error: selectError } = await supabase
    .from("students")
    .select("id, group_id, mastered_nodes, active")
    .eq("code", code)
    .maybeSingle();

  if (selectError) {
    console.error("[login] error leyendo students:", selectError.message);
    return NextResponse.json({ error: "Error al consultar la base de datos." }, { status: 500 });
  }

  if (!student || student.active === false) {
    return NextResponse.json({ error: "Código no válido. Revisa que lo hayas copiado igual." }, { status: 401 });
  }

  const res = NextResponse.json({
    studentId: student.id,
    groupId: student.group_id,
    masteredNodes: student.mastered_nodes ?? [],
  });
  if (!setAuthCookie(res, "student", { id: student.id, groupId: student.group_id })) {
    return NextResponse.json({ error: "No hay clave de firma configurada en el servidor." }, { status: 500 });
  }
  return res;
}
