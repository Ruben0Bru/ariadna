"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { DAG, DAG_ORDER, EXERCISES, type Exercise } from "@/lib/dag";
import { getSession, clearSession, type StudentSession } from "@/lib/session";
import ThreadMap from "@/components/ThreadMap";
import FeedbackBox from "@/components/FeedbackBox";

type FeedbackState = "hidden" | "ok" | "warn";

// Baraja un arreglo (Fisher-Yates) para no repetir ejercicios en orden
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function AriadnaApp() {
  const router = useRouter();
  const [session, setSession] = useState<StudentSession | null>(null);
  const [activeNode, setActiveNode] = useState<string>("algebra_derivadas");
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [current, setCurrent] = useState(0);
  const [masteredNodes, setMasteredNodes] = useState<Set<string>>(new Set());
  const [reviewNode, setReviewNode] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [checking, setChecking] = useState(false);
  const [feedbackState, setFeedbackState] = useState<FeedbackState>("hidden");
  const [feedbackTag, setFeedbackTag] = useState("");
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Verificar sesión al montar ──────────────────────────────────────────────
  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace("/login");
      return;
    }
    setSession(s);
  }, [router]);

  // ── Filtrar ejercicios por nodo activo ──────────────────────────────────────
  useEffect(() => {
    const nodeExercises = EXERCISES.filter(e => e.node === activeNode);
    setExercises(shuffle(nodeExercises));
    setCurrent(0);
  }, [activeNode]);

  const ex: Exercise | undefined = exercises[current];
  const currentNodeId = activeNode;
  const isDerivativeNode = currentNodeId === "algebra_derivadas" || currentNodeId === "regla_cadena";

  // reset cuando cambia el ejercicio
  useEffect(() => {
    setInputValue("");
    setFeedbackState("hidden");
    setServiceError(null);
    setFailedAttempts(0);
    inputRef.current?.focus();
  }, [current, activeNode]);

  const handleCheck = useCallback(async () => {
    if (!inputValue.trim() || checking || !ex || !session) return;
    setChecking(true);
    setServiceError(null);

    // 1. Llamar al orquestador /api/verify (SymPy + log Supabase)
    let verifyData: {
      correct: boolean;
      errorType: string | null;
      prereqSuggested: string | null;
      failReason: string | null;
      attemptId: number | null;
    };

    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: session.studentId,
          exerciseId: ex.id,
          studentAnswer: inputValue.trim(),
        }),
      });

      // Cualquier respuesta de error detiene el flujo con mensaje claro
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg =
          res.status === 503
            ? "El motor de verificación no está disponible. Avisa a tu docente."
            : (body?.error ?? `Error del servidor (${res.status}). Intenta de nuevo.`);
        setServiceError(msg);
        setChecking(false);
        return;
      }

      verifyData = await res.json();
    } catch {
      setServiceError("Error de red. Verifica tu conexión e intenta de nuevo.");
      setChecking(false);
      return;
    }


    // 2. Actualizar estado del grafo
    const { correct, prereqSuggested, failReason, errorType, attemptId } = verifyData;

    if (correct) {
      setMasteredNodes((prev) => new Set([...prev, currentNodeId]));
      setReviewNode(null);
    } else {
      setReviewNode(prereqSuggested);
      setFailedAttempts((prev) => prev + 1);
    }

    // 3. Mostrar feedback con loading mientras llama a Gemini
    setFeedbackState(correct ? "ok" : "warn");
    setFeedbackTag(
      correct
        ? "✓ CORRECTO — Verificado por SymPy"
        : "✗ REVISIÓN NECESARIA — Verificado por SymPy"
    );
    setFeedbackText("");
    setFeedbackLoading(true);

    const targetNode = prereqSuggested ? DAG[prereqSuggested] : null;

    // 4. Pedir retroalimentación al mediador pedagógico (Gemini)
    try {
      const fbRes = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correct,
          studentAnswer: inputValue.trim(),
          exercise: {
            prompt: ex.prompt,
            failReason: failReason ?? ex.failReason,
            prereqOnFail: prereqSuggested,
          },
          targetNodeLabel: targetNode?.label ?? "",
          targetNodeUnit: targetNode?.unit ?? "",
          errorType,
          attemptId,
          failedAttempts,
        }),
      });
      const fbData = await fbRes.json();
      setFeedbackText(fbData.message ?? "");
    } catch {
      setFeedbackText(
        correct
          ? "¡Correcto! El resultado coincide con lo esperado — puedes avanzar."
          : `No es correcto todavía. Conviene repasar: ${failReason ?? ex.failReason}.`
      );
    } finally {
      setFeedbackLoading(false);
      setChecking(false);
    }

    // 5. El avance automático fue removido por solicitud de UX.
    // El estudiante debe dar click a 'Siguiente' cuando esté listo leyendo el feedback.
  }, [inputValue, checking, ex, session, current, exercises.length, activeNode]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleCheck();
  }

  function handleNext() {
    if (current < exercises.length - 1) {
      setCurrent((c) => c + 1);
    } else if (activeNode !== "algebra_derivadas") {
      setActiveNode("algebra_derivadas");
    }
  }

  function handleSkip() {
    setFeedbackState("ok");
    setFeedbackTag("✓ AVANCE FORZADO");
    setFeedbackText(`La respuesta era: ${ex?.expr}.`);
    // Ahora el usuario debe darle manualmente al botón de avanzar
  }

  function handleGoToReview() {
    if (reviewNode) {
      setActiveNode(reviewNode);
      setReviewNode(null);
    }
  }

  function handleReturnEarly() {
    setActiveNode("algebra_derivadas");
  }

  function handleLogout() {
    clearSession();
    router.replace("/login");
  }

  if (!session || !ex) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-dim)" }}>
        Cargando<span className="loading-dots" />
      </div>
    );
  }

  return (
    <>
      <header>
        <div className="header-top">
          <div className="eyebrow">
            ARIADNA — TUTOR INTELIGENTE / UNIDAD 3, ÁLGEBRA DE DERIVADAS
          </div>
          <button className="logout-btn" onClick={handleLogout} title="Cerrar sesión">
            {session.code} ↩
          </button>
        </div>
        <h1>
          El hilo que <em>te devuelve</em>
          <br />
          al nodo que necesitas.
        </h1>
        <p className="sub">
          Resuelve cada ejercicio. El sistema verifica tu respuesta simbólicamente
          (con SymPy, no por comparación de texto) y te orienta si algo falla.
          Usa{" "}
          <code className="inline-code">^</code> para potencias,{" "}
          <code className="inline-code">*</code> para multiplicar,{" "}
          <code className="inline-code">sqrt(x)</code> para raíces.
        </p>
      </header>

      <ThreadMap
        masteredNodes={masteredNodes}
        reviewNode={reviewNode}
        currentNodeId={currentNodeId}
      />

      <div className="card">
        <div className="card-meta">
          <span className="card-label">Ejercicio {current + 1} de {exercises.length}</span>
          <span className="card-node-badge">{DAG[currentNodeId]?.label ?? currentNodeId}</span>
        </div>

        <div className="problem" id="problemText">
          <span className="fn">{ex?.prompt}</span>
        </div>

        <div className="input-row">
          <input
            ref={inputRef}
            type="text"
            id="answerInput"
            placeholder="ej: 6x - 5   (usa ^ para potencias, * para multiplicar)"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={checking || feedbackState === "ok"}
          />
          {feedbackState === "ok" ? (
            <button id="nextBtn" onClick={handleNext}>
              {current < exercises.length - 1 ? "Siguiente ➔" : "Terminar Repaso ➔"}
            </button>
          ) : (
            <button id="checkBtn" onClick={handleCheck} disabled={checking || !inputValue.trim()}>
              {checking ? "Verificando…" : "Verificar →"}
            </button>
          )}
        </div>

        {failedAttempts >= 3 && !checking && feedbackState !== "ok" && (
          <div style={{ marginTop: "10px", textAlign: "right", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            {activeNode !== "algebra_derivadas" && (
              <button
                onClick={handleReturnEarly}
                style={{
                  background: "transparent",
                  border: "1px solid var(--accent)",
                  color: "var(--accent-glow)",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "0.9rem"
                }}
              >
                ↩ Volver a derivadas
              </button>
            )}
            <button
              onClick={handleSkip}
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--text-dim)",
                padding: "6px 12px",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "0.9rem"
              }}
            >
              Me rindo, mostrar solución ⏭
            </button>
          </div>
        )}

        {/* Botón de retorno rápido para cuando logran entender el concepto antes de terminar todos los ej */}
        {activeNode !== "algebra_derivadas" && failedAttempts < 3 && !checking && feedbackState !== "ok" && (
           <div style={{ marginTop: "10px", textAlign: "right" }}>
            <button
              onClick={handleReturnEarly}
              style={{
                background: "transparent",
                border: "1px solid var(--accent)",
                color: "var(--accent-glow)",
                padding: "6px 12px",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "0.9rem"
              }}
            >
              ↩ Ya entendí, volver al tema principal
            </button>
           </div>
        )}

        {serviceError && (
          <div className="service-error">⚠ {serviceError}</div>
        )}

        <FeedbackBox
          state={feedbackState}
          tag={feedbackTag}
          text={feedbackText}
          loading={feedbackLoading}
        />

        {reviewNode && !checking && feedbackState === "warn" && (
          <div style={{ marginTop: "15px", textAlign: "center" }}>
            <button
              onClick={handleGoToReview}
              style={{
                background: "var(--accent-glow)",
                color: "#111",
                border: "none",
                padding: "8px 16px",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Repasar {DAG[reviewNode]?.label ?? "prerrequisito"} ↗
            </button>
          </div>
        )}

        <div className="architecture">
          <span>Juez matemático: <b>SymPy (backend Python)</b></span>
          <span>Mediador pedagógico: <b>Gemini 2.0 Flash</b></span>
          <span>Posición curricular: <b>grafo DAG</b></span>
        </div>
      </div>

      <footer>
        Ariadna — Universidad de Córdoba, Ingeniería de Sistemas. La verificación es
        simbólica real (Python/SymPy en backend). El LLM sólo redacta
        el texto pedagógico, nunca evalúa matemáticamente.
      </footer>
    </>
  );
}
