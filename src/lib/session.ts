// src/lib/session.ts
// Helpers para manejar la sesión del estudiante en localStorage (RF-14)
// Solo corre en el cliente (browser).

export interface StudentSession {
  studentId: string;   // UUID de Supabase o código local
  groupId: number;     // 1 | 2 | 3
  code: string;        // código visible, ej. "G2-014"
  masteredNodes: string[]; // RF-18: nodos ya dominados en sesiones previas
}

const SESSION_KEY = "ariadna_session";

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


