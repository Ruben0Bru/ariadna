"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveSession } from "@/lib/session";

export default function LoginPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError("Por favor ingresa tu código de participante.");
      return;
    }

    setLoading(true);
    setError(null);

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

      router.push("/");
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
            Ingresa el código de participante que te asignó tu docente para
            comenzar la sesión.
          </p>
        </div>

        <form onSubmit={handleLogin} className="login-form" noValidate>
          <label className="login-label" htmlFor="codeInput">
            Código de participante
          </label>
          <input
            id="codeInput"
            type="text"
            className="login-input"
            placeholder="ej: G2-014"
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
            ) : (
              "Ingresar →"
            )}
          </button>
        </form>

        <p className="login-hint">
          El código tiene formato <code>G1-001</code>, <code>G2-014</code> o{" "}
          <code>G3-032</code>. Si no lo tienes, consulta con tu docente.
        </p>
      </div>
    </div>
  );
}
