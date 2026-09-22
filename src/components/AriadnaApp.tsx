"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { DAG, DAG_ORDER, CONCEPTS, DEFAULT_NODE, type Exercise } from "@/lib/dag";
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

const MASTERY_THRESHOLD = 3;

export default function AriadnaApp() {
  const router = useRouter();
  const [session, setSession] = useState<StudentSession | null>(null);

  // ── Fase de concepto ────────────────────────────────────────────────────────
  const [conceptShown, setConceptShown] = useState<Set<string>>(new Set());
  const [showingConcept, setShowingConcept] = useState(false);

  // ── Estado de nodos ─────────────────────────────────────────────────────────
  const [activeNode, setActiveNode] = useState<string>(DEFAULT_NODE);
  const [masteredNodes, setMasteredNodes] = useState<Set<string>>(new Set());

  // ── Estado de revisión (repaso de prerrequisito) ─────────────────────────────
  // mainNode: el nodo al que debe VOLVER el estudiante al terminar el repaso
  const mainNodeRef = useRef<string>(DEFAULT_NODE);
  // savedExerciseIndex: para restaurar el ejercicio donde estaba antes del repaso
  const savedExerciseIndexRef = useRef<number>(0);
  const [reviewNode, setReviewNode] = useState<string | null>(null);
  const isReviewMode = activeNode !== mainNodeRef.current;

  // ── Estado de ejercicios ────────────────────────────────────────────────────
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [current, setCurrent] = useState(0);

  // ── Clase activa del docente ─────────────────────────────────────────────────
  const [classExerciseIds, setClassExerciseIds] = useState<number[] | null>(null);
  const [classSessionActive, setClassSessionActive] = useState(false);

  // ── Criterio de dominio ─────────────────────────────────────────────────────
  const [consecutiveCorrect, setConsecutiveCorrect] = useState(0);
  const [justMastered, setJustMastered] = useState(false);

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

    // Restaurar progreso y avanzar automáticamente al nodo no dominado
    if (s.masteredNodes?.length) {
      const mNodes = new Set(s.masteredNodes);
      setMasteredNodes(mNodes);
      const firstAvailable = DAG_ORDER.find(n => !mNodes.has(n)) ?? DEFAULT_NODE;
      setActiveNode(firstAvailable);
      mainNodeRef.current = firstAvailable;
    }

    // Cargar Banco de Ejercicios desde Supabase
    fetchAllExercises();

    // Verificar si hay clase activa del docente
    checkClassSession();
  }, [router]);

  async function fetchAllExercises() {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseKey) return;
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(supabaseUrl, supabaseKey);
      
      const { data } = await sb.from("exercises").select("id, prompt, correct_expr, expected_answer, node_id, prereq_on_fail, fail_reason");
      if (data) {
        const mapped: Exercise[] = data.map(dbEx => ({
          id: dbEx.id,
          prompt: dbEx.prompt,
          expr: dbEx.expected_answer || dbEx.correct_expr,
          node: dbEx.node_id,
          prereqOnFail: dbEx.prereq_on_fail || "",
          failReason: dbEx.fail_reason || "",
        }));
        setAllExercises(mapped);
      }
    } catch(e) {
      console.error("Error cargando ejercicios BD", e);
    }
  }

  async function checkClassSession() {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseKey) return;

      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(supabaseUrl, supabaseKey);
      const { data } = await sb
        .from("class_sessions")
        .select("exercise_ids")
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (data?.exercise_ids && Array.isArray(data.exercise_ids)) {
        setClassExerciseIds(data.exercise_ids);
        setClassSessionActive(true);
      }
    } catch {
      // Sin clase activa — flujo normal
    }
  }

  // ── Cambio de nodo: mostrar concepto si es nuevo ────────────────────────────
  useEffect(() => {
    if (!conceptShown.has(activeNode) && CONCEPTS[activeNode]) {
      setShowingConcept(true);
    } else {
      setShowingConcept(false);
    }
  }, [activeNode, conceptShown]);

  // ── RF-15: Grupo 2 — máximo 5 ejercicios por sesión ─────────────────────────
  const SESSION_LIMIT = session?.groupId === 2 ? 5 : Infinity;

  // ── Cambio de nodo: cargar ejercicios ───────────────────────────────────────
  useEffect(() => {
    let pool: Exercise[];

    if (classSessionActive && classExerciseIds && !isReviewMode) {
      // Clase activa: filtrar por IDs asignados por el docente para el nodo actual
      pool = allExercises.filter(e => e.node === activeNode && classExerciseIds.includes(e.id));
      if (pool.length === 0) {
        // Si no hay ejercicios del docente para este nodo, usar banco normal
        pool = allExercises.filter(e => e.node === activeNode);
      }
    } else {
      pool = allExercises.filter(e => e.node === activeNode);
    }

    const limited = pool.slice(0, SESSION_LIMIT === Infinity ? undefined : SESSION_LIMIT);
    setExercises(shuffle(limited));
    setConsecutiveCorrect(0);
    setJustMastered(false);

    // Si volvemos al mainNode y había un ejercicio guardado, restaurarlo
    if (!isReviewMode && savedExerciseIndexRef.current > 0) {
      setCurrent(Math.min(savedExerciseIndexRef.current, Math.max(0, limited.length - 1)));
      savedExerciseIndexRef.current = 0;
    } else {
      setCurrent(0);
    }
  }, [activeNode, SESSION_LIMIT, classSessionActive, classExerciseIds, allExercises]);

  const ex: Exercise | undefined = exercises[current];

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
    // Mostrar resultado inmediato antes de que Gemini responda
    setFeedbackText("");
    setFeedbackLoading(false);

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
        const msg = body?.error ?? `Error del servidor (${res.status}). Intenta de nuevo.`;
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

    // Resultado matemático INMEDIATO (sin esperar Gemini)
    setFeedbackState(correct ? "ok" : "warn");
    setFeedbackTag(
      correct
        ? `✓ CORRECTO — ${consecutiveCorrect + 1}/${MASTERY_THRESHOLD} hacia dominio`
        : "✗ REVISIÓN NECESARIA — Verificado por motor matemático"
    );
    setFeedbackLoading(true); // skeleton mientras llega Gemini
    setChecking(false); // habilitar la UI mientras Gemini trabaja en paralelo

    // ── Actualizar criterio de dominio ──────────────────────────────────────
    if (correct) {
      const newConsec = consecutiveCorrect + 1;
      setConsecutiveCorrect(newConsec);
      setReviewNode(null);

      if (newConsec >= MASTERY_THRESHOLD && !masteredNodes.has(activeNode)) {
        const newMastered = new Set([...masteredNodes, activeNode]);
        setMasteredNodes(newMastered);
        setJustMastered(true);
        if (session) saveSession({ ...session, masteredNodes: [...newMastered] });
      }
    } else {
      setConsecutiveCorrect(0);
      setReviewNode(prereqSuggested);
      setFailedAttempts(prev => prev + 1);
    }

    const targetNode = prereqSuggested ? DAG[prereqSuggested] : null;

    // Llamada a Gemini en paralelo (no bloquea la UI)
    fetch("/api/feedback", {
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
    })
      .then(res => res.json())
      .then(data => setFeedbackText(data.message ?? ""))
      .catch(() => {
        setFeedbackText(
          correct
            ? "¡Correcto! El resultado coincide — puedes avanzar."
            : `No es correcto todavía. Revisa: ${failReason ?? ex.failReason}.`
        );
      })
      .finally(() => setFeedbackLoading(false));
  }, [inputValue, checking, ex, session, activeNode, consecutiveCorrect, masteredNodes, failedAttempts]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleCheck();
  }

  // ── Navegar al siguiente ejercicio o terminar repaso ────────────────────────
  function handleNext() {
    if (current < exercises.length - 1) {
      setCurrent(c => c + 1);
    } else if (isReviewMode) {
      // Terminar repaso: volver al nodo principal y restaurar ejercicio
      setActiveNode(mainNodeRef.current);
      setReviewNode(null);
    }
    // Si ya está en el mainNode y terminó todos los ejercicios → no hacer nada
    // (el guard de RF-15 o justMastered lo manejará)
  }

  function handleGoToReview() {
    if (!reviewNode) return;
    // Guardar el estado actual antes de entrar al repaso
    savedExerciseIndexRef.current = current;
    mainNodeRef.current = activeNode;
    setActiveNode(reviewNode);
    setReviewNode(null);
  }

  function handleReturnEarly() {
    setActiveNode(mainNodeRef.current);
    setReviewNode(null);
  }

  function handleNodeClick(nodeId: string) {
    if (nodeId === activeNode) return;
    // Solo se puede navegar a nodos con prerrequisitos cumplidos
    const prereqs = DAG[nodeId]?.prereqs ?? [];
    const accessible = prereqs.every(p => masteredNodes.has(p)) || masteredNodes.has(nodeId);
    if (!accessible) return;

    if (isReviewMode) {
      // Si el estudiante navega desde modo repaso, guardar el contexto
      mainNodeRef.current = activeNode === mainNodeRef.current ? activeNode : mainNodeRef.current;
    } else {
      mainNodeRef.current = nodeId; // cambia el flujo principal
    }
    setActiveNode(nodeId);
    setReviewNode(null);
  }

  function handleSkip() {
    setFeedbackState("ok");
    setFeedbackTag("✓ AVANCE FORZADO");
    setFeedbackText(`La respuesta esperada era: ${ex?.expr}.`);
  }

  function handleLogout() { clearSession(); window.location.href = "/login"; }

  function handleConceptDone() {
    setConceptShown(prev => new Set([...prev, activeNode]));
    setShowingConcept(false);
  }

  function handleContinueAfterMastery() {
    setJustMastered(false);
    // Siempre avanzar al siguiente nodo no dominado, nunca volver al mismo
    const newMastered = new Set([...masteredNodes, activeNode]);
    const next = DAG_ORDER.find(n => !newMastered.has(n));
    if (next) {
      mainNodeRef.current = next;
      setActiveNode(next);
    }
    // Si todos están dominados, el estudiante habrá completado el grafo
  }

  // ── Guards de renderizado ────────────────────────────────────────────────────
  if (!session) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-dim)" }}>
        Cargando<span className="loading-dots" />
      </div>
    );
  }

  // Pantalla de celebración de dominio
  if (justMastered) {
    const nodeName = DAG[activeNode]?.label ?? activeNode;
    const newMastered = new Set([...masteredNodes, activeNode]);
    const next = DAG_ORDER.find(n => !newMastered.has(n));
    return (
      <div className="mastery-screen" role="dialog" aria-label="Nodo dominado">
        <div className="mastery-icon">🏆</div>
        <h2 className="mastery-title">¡Nodo dominado!</h2>
        <p className="mastery-subtitle">
          Respondiste <strong>{MASTERY_THRESHOLD} seguidas correctamente</strong>
        </p>
        <div className="mastery-node-badge">{nodeName}</div>
        <p className="mastery-body">
          {next
            ? `El siguiente tema es: ${DAG[next].label}`
            : "¡Has completado todos los temas! Eres increíble."}
        </p>
        <button className="mastery-continue-btn" onClick={handleContinueAfterMastery}>
          {next ? `Ir a ${DAG[next].label} →` : "Ver mi resumen final →"}
        </button>
      </div>
    );
  }

  // RF-15: Pantalla de sesión completada (Grupo 2)
  if (session.groupId === 2 && current >= exercises.length && exercises.length > 0 && !isReviewMode && !justMastered) {
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
            ARIADNA — TUTOR INTELIGENTE / UNIDAD 3
            {classSessionActive && (
              <span style={{ marginLeft: 12, background: "var(--accent-glow)", color: "#111", borderRadius: 6, padding: "2px 8px", fontSize: "0.75rem", fontWeight: 700 }}>
                🏫 Clase activa
              </span>
            )}
          </div>
          <button className="logout-btn" onClick={handleLogout} title="Cerrar sesión">
            {session.code} ↩
          </button>
        </div>
        <h1>
          El hilo que <em>te guía</em>
          <br />
          paso a paso.
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
        currentNodeId={activeNode}
        onNodeClick={handleNodeClick}
      />

      {isReviewMode && (
        <div style={{
          background: "rgba(255, 170, 0, 0.1)",
          border: "1px solid rgba(255, 170, 0, 0.4)",
          borderRadius: "8px",
          padding: "10px 16px",
          marginBottom: "12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "0.9rem",
          color: "var(--text-main)"
        }}>
          <span>🔄 Modo Repaso: <strong>{DAG[activeNode]?.label}</strong></span>
          <button
            onClick={handleReturnEarly}
            style={{ background: "transparent", border: "1px solid var(--accent-glow)", color: "var(--accent-glow)", padding: "4px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "0.85rem", fontWeight: 600 }}
          >
            ↩ Volver a {DAG[mainNodeRef.current]?.label ?? "unidad"}
          </button>
        </div>
      )}

      <div className="card">
        <div className="card-meta">
          <span className="card-label">Ejercicio {current + 1} de {exercises.length}</span>
          <span className="card-node-badge">{DAG[activeNode]?.label ?? activeNode}</span>
          {consecutiveCorrect > 0 && !justMastered && (
            <span className="mastery-progress-badge">
              🔥 {consecutiveCorrect}/{MASTERY_THRESHOLD} consecutivas
            </span>
          )}
        </div>

        <div className="problem" id="problemText">
          <span className="fn">{ex?.prompt}</span>
        </div>

        {/* Pista de notación */}
        <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginBottom: "8px", marginTop: "-4px" }}>
          💡 Recuerda usar <code style={{ background: "rgba(255,255,255,0.07)", padding: "1px 4px", borderRadius: "4px" }}>*</code> para multiplicar y <code style={{ background: "rgba(255,255,255,0.07)", padding: "1px 4px", borderRadius: "4px" }}>^</code> para exponentes (ej: <code style={{ background: "rgba(255,255,255,0.07)", padding: "1px 4px", borderRadius: "4px" }}>3*x^2</code>).
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
              {current < exercises.length - 1
                ? "Siguiente ➔"
                : isReviewMode
                  ? "✓ Terminar Repaso ➔"
                  : "Finalizar →"}
            </button>
          ) : (
            <button id="checkBtn" onClick={handleCheck} disabled={checking || !inputValue.trim()}>
              {checking ? "Verificando…" : "Verificar →"}
            </button>
          )}
        </div>

        {failedAttempts >= 3 && !checking && feedbackState !== "ok" && (
          <div style={{ marginTop: "10px", textAlign: "right", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <button
              onClick={handleSkip}
              style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text-dim)", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "0.9rem" }}
            >
              Me rindo, mostrar solución ⏭
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
            <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginBottom: "8px" }}>
              Parece que este tema requiere repasar un prerrequisito:
            </p>
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
        currentNode={activeNode}
        currentNodeLabel={DAG[activeNode]?.label ?? activeNode}
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
