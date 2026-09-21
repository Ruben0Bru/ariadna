"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { DAG, DAG_ORDER, EXERCISES, CONCEPTS, DEFAULT_NODE, type Exercise } from "@/lib/dag";
import { getSession, clearSession, saveSession, type StudentSession } from "@/lib/session";
import ThreadMap from "@/components/ThreadMap";
import FeedbackBox from "@/components/FeedbackBox";
import ConceptCard from "@/components/ConceptCard";
import ChatPanel from "@/components/ChatPanel";

type FeedbackState = "hidden" | "ok" | "warn";

// Baraja un arreglo (Fisher-Yates)
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const MASTERY_THRESHOLD = 3; // respuestas correctas consecutivas para dominar un nodo

export default function AriadnaApp() {
  const router = useRouter();
  const [session, setSession] = useState<StudentSession | null>(null);

  // ── Fase de concepto (antes de ejercicios) ──────────────────────────────────
  // conceptShown: nodos cuya tarjeta de concepto YA fue mostrada esta sesión
  const [conceptShown, setConceptShown] = useState<Set<string>>(new Set());
  const [showingConcept, setShowingConcept] = useState(false);

  // ── Estado de ejercicios ────────────────────────────────────────────────────
  const [activeNode, setActiveNode] = useState<string>(DEFAULT_NODE);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [current, setCurrent] = useState(0);
  const [masteredNodes, setMasteredNodes] = useState<Set<string>>(new Set());
  const [reviewNode, setReviewNode] = useState<string | null>(null);

  // ── Criterio de dominio: 3 correctas consecutivas ───────────────────────────
  const [consecutiveCorrect, setConsecutiveCorrect] = useState(0);
  const [justMastered, setJustMastered] = useState(false); // pantalla de celebración

  // ── Interacción ─────────────────────────────────────────────────────────────
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
    if (!s) { window.location.href = "/login"; return; }
    setSession(s);
    // RF-18 / Producto Final: Restaurar progreso y avanzar automáticamente
    if (s.masteredNodes?.length) {
      const mNodes = new Set(s.masteredNodes);
      setMasteredNodes(mNodes);
      
      // Si el nodo de inicio por defecto ya está dominado, salta al siguiente disponible
      if (mNodes.has(DEFAULT_NODE)) {
        const next = DAG_ORDER.find(n => !mNodes.has(n));
        if (next) setActiveNode(next);
      }
    }
  }, [router]);

  // ── Cambio de nodo: mostrar concepto si es nuevo ────────────────────────────
  useEffect(() => {
    if (!conceptShown.has(activeNode) && CONCEPTS[activeNode]) {
      setShowingConcept(true);
    } else {
      setShowingConcept(false);
    }
  }, [activeNode, conceptShown]);

  // ── RF-15: Grupo 2 tiene máximo 5 ejercicios por sesión ─────────────────────
  const SESSION_LIMIT = session?.groupId === 2 ? 5 : Infinity;

  // ── Filtrar ejercicios al cambiar de nodo ───────────────────────────────────
  useEffect(() => {
    const nodeExercises = EXERCISES.filter(e => e.node === activeNode);
    const limited = nodeExercises.slice(0, SESSION_LIMIT);
    setExercises(shuffle(limited));
    setCurrent(0);
    setConsecutiveCorrect(0);
    setJustMastered(false);
  }, [activeNode, SESSION_LIMIT]);

  const ex: Exercise | undefined = exercises[current];
  const currentNodeId = activeNode;

  // Reset al cambiar de ejercicio
  useEffect(() => {
    setInputValue("");
    setFeedbackState("hidden");
    setServiceError(null);
    setFailedAttempts(0);
    inputRef.current?.focus();
  }, [current, activeNode]);

  // ── Verificación y feedback ─────────────────────────────────────────────────
  const handleCheck = useCallback(async () => {
    if (!inputValue.trim() || checking || !ex || !session) return;
    setChecking(true);
    setServiceError(null);

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

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg =
          res.status === 503
            ? (body?.error ?? "El motor está arrancando. Espera 10 segundos y vuelve a intentar.")
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

    const { correct, prereqSuggested, failReason, errorType, attemptId } = verifyData;

    // ── Actualizar criterio de dominio ──────────────────────────────────────
    if (correct) {
      const newConsec = consecutiveCorrect + 1;
      setConsecutiveCorrect(newConsec);
      setReviewNode(null);

      if (newConsec >= MASTERY_THRESHOLD && !masteredNodes.has(currentNodeId)) {
        // ¡Nodo dominado!
        const newMastered = new Set([...masteredNodes, currentNodeId]);
        setMasteredNodes(newMastered);
        setJustMastered(true);
        // Persistir en session (RF-18)
        if (session) {
          saveSession({ ...session, masteredNodes: [...newMastered] });
        }
      }
    } else {
      setConsecutiveCorrect(0);
      setReviewNode(prereqSuggested);
      setFailedAttempts(prev => prev + 1);
    }

    // ── Mostrar feedback ────────────────────────────────────────────────────
    setFeedbackState(correct ? "ok" : "warn");
    setFeedbackTag(
      correct
        ? `✓ CORRECTO — ${consecutiveCorrect + 1}/${MASTERY_THRESHOLD} hacia dominio`
        : "✗ REVISIÓN NECESARIA — Verificado por motor matemático"
    );
    setFeedbackText("");
    setFeedbackLoading(true);

    const targetNode = prereqSuggested ? DAG[prereqSuggested] : null;

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
          failedAttempts: failedAttempts + (correct ? 0 : 1),
        }),
      });
      const fbData = await fbRes.json();
      setFeedbackText(fbData.message ?? "");
    } catch {
      setFeedbackText(
        correct
          ? "¡Correcto! El resultado coincide — puedes avanzar."
          : `No es correcto todavía. Revisa: ${failReason ?? ex.failReason}.`
      );
    } finally {
      setFeedbackLoading(false);
      setChecking(false);
    }
  }, [inputValue, checking, ex, session, currentNodeId, consecutiveCorrect, masteredNodes, failedAttempts]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleCheck();
  }

  function handleNext() {
    if (current < exercises.length - 1) {
      setCurrent(c => c + 1);
    } else if (activeNode !== DEFAULT_NODE) {
      setActiveNode(DEFAULT_NODE);
    }
  }

  function handleSkip() {
    setFeedbackState("ok");
    setFeedbackTag("✓ AVANCE FORZADO");
    setFeedbackText(`La respuesta esperada era: ${ex?.expr}.`);
  }

  function handleGoToReview() {
    if (reviewNode) { setActiveNode(reviewNode); setReviewNode(null); }
  }

  function handleReturnEarly() { setActiveNode(DEFAULT_NODE); }

  function handleLogout() { clearSession(); window.location.href = "/login"; }

  function handleConceptDone() {
    setConceptShown(prev => new Set([...prev, activeNode]));
    setShowingConcept(false);
  }

  function handleContinueAfterMastery() {
    setJustMastered(false);
    // Si estaba en un nodo de repaso, regresar al principal
    if (activeNode !== DEFAULT_NODE) {
      setActiveNode(DEFAULT_NODE);
    } else {
      // Avanzar al siguiente nodo no dominado del DAG
      const next = DAG_ORDER.find(n => !masteredNodes.has(n) && n !== activeNode);
      if (next) setActiveNode(next);
    }
  }

  // ── Guards de renderizado ───────────────────────────────────────────────────
  if (!session) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-dim)" }}>
        Cargando<span className="loading-dots" />
      </div>
    );
  }

  // RF-15: Pantalla de sesión completada (Grupo 2)
  if (session.groupId === 2 && current >= exercises.length && exercises.length > 0 && activeNode === DEFAULT_NODE && !justMastered) {
    return (
      <div style={{ textAlign: "center", padding: "80px 20px", color: "var(--text-main)" }}>
        <h2 style={{ fontSize: "1.8rem", marginBottom: "12px" }}>Sesión completada 🎓</h2>
        <p style={{ color: "var(--text-dim)", maxWidth: "420px", margin: "0 auto 24px" }}>
          Has terminado los ejercicios de esta sesión de taller. Tu progreso queda guardado.
        </p>
        <button onClick={handleLogout} style={{ padding: "10px 24px", borderRadius: "8px", background: "var(--accent-glow)", color: "#111", border: "none", cursor: "pointer", fontWeight: 600 }}>
          Cerrar sesión
        </button>
      </div>
    );
  }

  // Pantalla de celebración de dominio
  if (justMastered) {
    const nodeName = DAG[currentNodeId]?.label ?? currentNodeId;
    return (
      <div className="mastery-screen" role="dialog" aria-label="Nodo dominado">
        <div className="mastery-icon">🏆</div>
        <h2 className="mastery-title">¡Nodo dominado!</h2>
        <p className="mastery-subtitle">
          Respondiste <strong>{MASTERY_THRESHOLD} seguidas correctamente</strong>
        </p>
        <div className="mastery-node-badge">{nodeName}</div>
        <p className="mastery-body">
          El motor matemático confirma que comprendes este tema. Tu progreso queda guardado.
        </p>
        <button className="mastery-continue-btn" onClick={handleContinueAfterMastery}>
          Continuar →
        </button>
      </div>
    );
  }

  // Tarjeta de concepto (antes del primer ejercicio del nodo)
  if (showingConcept && CONCEPTS[activeNode]) {
    return (
      <div style={{ maxWidth: "720px", margin: "0 auto", padding: "40px 20px" }}>
        <header style={{ marginBottom: "24px" }}>
          <div className="eyebrow">ARIADNA — TUTOR DE CÁLCULO I</div>
        </header>
        <ConceptCard
          nodeId={activeNode}
          concept={CONCEPTS[activeNode]}
          onStart={handleConceptDone}
        />
      </div>
    );
  }

  if (!ex) {
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
          Resuelve cada ejercicio. Domina un nodo respondiendo {MASTERY_THRESHOLD} seguidas bien.
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
          {consecutiveCorrect > 0 && !justMastered && (
            <span className="mastery-progress-badge">
              🔥 {consecutiveCorrect}/{MASTERY_THRESHOLD} consecutivas
            </span>
          )}
        </div>

        <div className="problem" id="problemText">
          <span className="fn">{ex?.prompt}</span>
        </div>

        <div className="input-row">
          <input
            ref={inputRef}
            type="text"
            id="answerInput"
            placeholder="ej: 6*x - 5   (usa ^ para potencias, * para multiplicar)"
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
            {activeNode !== DEFAULT_NODE && (
              <button
                onClick={handleReturnEarly}
                style={{ background: "transparent", border: "1px solid var(--accent-glow)", color: "var(--accent-glow)", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "0.9rem" }}
              >
                ↩ Volver a {DAG[DEFAULT_NODE]?.label ?? "unidad"}
              </button>
            )}
            <button
              onClick={handleSkip}
              style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text-dim)", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "0.9rem" }}
            >
              Me rindo, mostrar solución ⏭
            </button>
          </div>
        )}

        {activeNode !== DEFAULT_NODE && failedAttempts < 3 && !checking && feedbackState !== "ok" && (
          <div style={{ marginTop: "10px", textAlign: "right" }}>
            <button
              onClick={handleReturnEarly}
              style={{ background: "transparent", border: "1px solid var(--accent-glow)", color: "var(--accent-glow)", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "1rem", fontWeight: "bold" }}
            >
              ↩ Repaso terminado, volver a {DAG[DEFAULT_NODE]?.label ?? "unidad"}
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
              style={{ background: "var(--accent-glow)", color: "#111", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontWeight: 600 }}
            >
              Repasar {DAG[reviewNode]?.label ?? "prerrequisito"} ↗
            </button>
          </div>
        )}

        <div className="architecture">
          <span>Juez matemático: <b>mathjs (verificación numérica)</b></span>
          <span>Mediador pedagógico: <b>Gemini — 3 niveles de pista</b></span>
          <span>Dominio: <b>{MASTERY_THRESHOLD} correctas consecutivas</b></span>
        </div>
      </div>

      <ChatPanel
        currentNode={currentNodeId}
        currentNodeLabel={DAG[currentNodeId]?.label ?? currentNodeId}
        currentExercise={ex?.prompt}
        groupId={session.groupId}
        studentId={session.studentId}
      />

      <footer>
        Ariadna — Universidad de Córdoba, Ingeniería de Sistemas. La verificación es
        matemática real (mathjs). El LLM sólo redacta el texto pedagógico, nunca evalúa matemáticamente.
      </footer>
    </>
  );
}

