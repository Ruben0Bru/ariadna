"use client";

import { useState } from "react";
import { saveSession, saveTeacherSession, isTeacherCode } from "@/lib/session";

export default function LoginPage() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const codeIsTeacher = isTeacherCode(code);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError("Por favor ingresa tu código de participante.");
      return;
    }

    setLoading(true);
    setError(null);

    // ── Flujo de docente ────────────────────────────────────────────────────
    if (isTeacherCode(trimmed)) {
      try {
        const res = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: trimmed }),
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error ?? "Código de docente no reconocido.");
          return;
        }

        saveTeacherSession({
          teacherId: data.teacherId,
          code: trimmed,
          name: data.name ?? trimmed,
        });

        window.location.href = "/teacher";
      } catch {
        setError("Error de conexión. Verifica tu internet e intenta de nuevo.");
      } finally {
        setLoading(false);
      }
      return;
    }

    // ── Flujo de estudiante ─────────────────────────────────────────────────
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Código no reconocido. Verifica con tu docente.");
        return;
      }

      saveSession({
        studentId: data.studentId,
        groupId: data.groupId,
        code: trimmed,
        masteredNodes: data.masteredNodes ?? [],
      });

      window.location.href = "/";
    } catch {
      setError("Error de conexión. Verifica tu internet e intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-brand">
          <div className="eyebrow">ARIADNA — TUTOR INTELIGENTE / CÁLCULO I</div>
          <h1>
            El hilo que <em>te guía</em>
            <br />
            a través del cálculo.
          </h1>
          <p className="sub">
            Ingresa el código que te asignó tu docente para comenzar la sesión.
          </p>
        </div>

        <form onSubmit={handleLogin} className="login-form" noValidate>
          <label className="login-label" htmlFor="codeInput">
            {codeIsTeacher ? "👩🏽‍🏫 Código de docente detectado" : "Código de acceso"}
          </label>
          <input
            id="codeInput"
            type="text"
            className="login-input"
            placeholder="ej: G2-014 o PROF-001"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setError(null);
            }}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            disabled={loading}
          />

          {codeIsTeacher && !error && (
            <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", marginTop: "6px" }}>
              Accederás al panel de docente donde puedes ver el progreso de tus estudiantes y asignar ejercicios.
            </div>
          )}

          {error && <div className="login-error">{error}</div>}

          <button
            type="submit"
            className="login-btn"
            disabled={loading || !code.trim()}
          >
            {loading ? (
              <>
                Verificando<span className="loading-dots" />
              </>
            ) : codeIsTeacher ? (
              "Acceder al Panel de Docente →"
            ) : (
              "Ingresar →"
            )}
          </button>
        </form>

        <p className="login-hint">
          Estudiantes: <code>G1-001</code>, <code>G2-014</code>, <code>G3-032</code>.<br />
          Docentes: <code>PROF-001</code>. Si no tienes tu código, consulta a Rubén.
        </p>
      </div>
    </div>
  );
}
