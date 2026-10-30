// src/lib/auth.ts
// Sesiones firmadas (HMAC-SHA256) en cookie httpOnly. SOLO se usa en el servidor.
// No requiere dependencias extra: usa el módulo crypto de Node.
//
// La clave de firma es AUTH_SECRET; si no existe se usa SUPABASE_SERVICE_ROLE_KEY
// (también es un secreto exclusivo del servidor). Recomendado: definir AUTH_SECRET.

import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest, NextResponse } from "next/server";

export type Role = "student" | "teacher";

export interface AuthPayload {
  role: Role;
  id: string;      // students.id (uuid) o teachers.id
  groupId?: number;
  exp: number;     // epoch en segundos
}

export const STUDENT_COOKIE = "ariadna_student";
export const TEACHER_COOKIE = "ariadna_teacher";

const STUDENT_TTL_S = 60 * 60 * 24 * 7;  // 7 días (estudian varios días seguidos)
const TEACHER_TTL_S = 60 * 60 * 8;       // 8 horas

function getSecret(): string | null {
  return process.env.AUTH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function createToken(payload: Omit<AuthPayload, "exp">, ttlSeconds: number): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const full: AuthPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const body = b64url(JSON.stringify(full));
  return `${body}.${sign(body, secret)}`;
}

export function verifyToken(token: string | undefined | null): AuthPayload | null {
  const secret = getSecret();
  if (!secret || !token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AuthPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Devuelve la sesión de estudiante válida de la petición, o null. */
export function getStudentAuth(req: NextRequest): AuthPayload | null {
  const p = verifyToken(req.cookies.get(STUDENT_COOKIE)?.value);
  return p && p.role === "student" ? p : null;
}

/** Devuelve la sesión de docente válida de la petición, o null. */
export function getTeacherAuth(req: NextRequest): AuthPayload | null {
  const p = verifyToken(req.cookies.get(TEACHER_COOKIE)?.value);
  return p && p.role === "teacher" ? p : null;
}

/** Estudiante O docente (por ejemplo, para el feedback del LLM). */
export function getAnyAuth(req: NextRequest): AuthPayload | null {
  return getStudentAuth(req) ?? getTeacherAuth(req);
}

export function setAuthCookie(
  res: NextResponse,
  role: Role,
  payload: Omit<AuthPayload, "exp" | "role">
): boolean {
  const ttl = role === "student" ? STUDENT_TTL_S : TEACHER_TTL_S;
  const token = createToken({ ...payload, role }, ttl);
  if (!token) return false;
  res.cookies.set(role === "student" ? STUDENT_COOKIE : TEACHER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ttl,
  });
  return true;
}

export function clearAuthCookies(res: NextResponse): void {
  for (const name of [STUDENT_COOKIE, TEACHER_COOKIE]) {
    res.cookies.set(name, "", { httpOnly: true, path: "/", maxAge: 0 });
  }
}

/**
 * Normaliza la URL del proyecto: quita comillas, espacios, barras finales y
 * sufijos como /rest/v1 (el cliente de Supabase ya añade esa ruta por su cuenta;
 * si viene duplicada Supabase responde "Invalid path specified in request URL").
 */
export function normalizeSupabaseUrl(raw: string): string {
  return raw
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\/+$/, "")
    .replace(/\/(rest|auth|storage)\/v1.*$/i, "")
    .replace(/\/+$/, "");
}

/** Cliente de Supabase solo-servidor: exige la service role key (sin fallback a la anon key). */
export function getServerSupabaseConfig(): { url: string; key: string } | null {
  const rawUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const rawKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!rawUrl || !rawKey) return null;
  return {
    url: normalizeSupabaseUrl(rawUrl),
    key: rawKey.trim().replace(/^["']|["']$/g, ""),
  };
}
