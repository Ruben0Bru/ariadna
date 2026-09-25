// src/lib/session.ts
// Helpers para manejar la sesión del estudiante/docente en localStorage (RF-14)
// Solo corre en el cliente (browser).

export interface StudentSession {
  studentId: string;   // UUID de Supabase
  groupId: number;     // 1 | 2 | 3
  code: string;        // código visible, ej. "G2-014"
  name?: string;       // nombre del estudiante (opcional)
  masteredNodes: string[]; // RF-18: nodos ya dominados en sesiones previas
}


export interface TeacherSession {
  teacherId: string;   // UUID de Supabase teachers.id
  code: string;        // código del docente, ej. "PROF-001"
  name: string;        // nombre del docente
}

const SESSION_KEY = "ariadna_session";
const TEACHER_SESSION_KEY = "ariadna_teacher_session";

// ── Sesión de Estudiante ─────────────────────────────────────────────────────
export function getSession(): StudentSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StudentSession;
  } catch {
    return null;
  }
}

export function saveSession(session: StudentSession): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
}

// ── Sesión de Docente ─────────────────────────────────────────────────────────
export function getTeacherSession(): TeacherSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(TEACHER_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TeacherSession;
  } catch {
    return null;
  }
}

export function saveTeacherSession(session: TeacherSession): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TEACHER_SESSION_KEY, JSON.stringify(session));
}

export function clearTeacherSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TEACHER_SESSION_KEY);
}

/** Returns true if the code looks like a teacher code */
export function isTeacherCode(code: string): boolean {
  return code.trim().toUpperCase().startsWith("PROF-");
}
