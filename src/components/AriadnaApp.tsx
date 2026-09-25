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

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const MASTERY_THRESHOLD = 3;

// ── Group labels ────────────────────────────────────────────────────────────
const GROUP_LABELS: Record<number, string> = {
  1: "Grupo Control",
  2: "Grupo Híbrido",
  3: "Grupo Autónomo",
};

export default function AriadnaApp() {
  const router = useRouter();
  const [session, setSession] = useState<StudentSession | null>(null);

  // ── Welcome / node-selection screen ─────────────────────────────────────────
  // "welcome"  = first screen (shows progress summary)
  // "pick"     = node picker (first-time users)
  // "learning" = actual learning mode
  type AppPhase = "welcome" | "pick" | "learning";
  const [phase, setPhase] = useState<AppPhase>("welcome");

  // ── Concept cards ────────────────────────────────────────────────────────────
  const [conceptShown, setConceptShown] = useState<Set<string>>(new Set());
  const [showingConcept, setShowingConcept] = useState(false);

  // ── Node state ───────────────────────────────────────────────────────────────
  const [activeNode, setActiveNode] = useState<string>(DEFAULT_NODE);
  const [masteredNodes, setMasteredNodes] = useState<Set<string>>(new Set());

  // ── Review mode ──────────────────────────────────────────────────────────────
  const mainNodeRef = useRef<string>(DEFAULT_NODE);
  const savedExerciseIndexRef = useRef<number>(0);
  const [reviewNode, setReviewNode] = useState<string | null>(null);
  const isReviewMode = activeNode !== mainNodeRef.current;

  // ── Exercise state ───────────────────────────────────────────────────────────
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [exercisesLoaded, setExercisesLoaded] = useState(false);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [current, setCurrent] = useState(0);

  // ── Class session ────────────────────────────────────────────────────────────
  const [classExerciseIds, setClassExerciseIds] = useState<number[] | null>(null);
  const [classSessionActive, setClassSessionActive] = useState(false);

  // ── Mastery ──────────────────────────────────────────────────────────────────
  const [consecutiveCorrect, setConsecutiveCorrect] = useState(0);
  const [justMastered, setJustMastered] = useState(false);

  // ── Interaction ──────────────────────────────────────────────────────────────
  const [inputValue, setInputValue] = useState("");
  const [checking, setChecking] = useState(false);
  const [feedbackState, setFeedbackState] = useState<FeedbackState>("hidden");
  const [feedbackTag, setFeedbackTag] = useState("");
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Dropdown menu ────────────────────────────────────────────────────────────
  const [menuOpen, setMenuOpen] = useState(false);

  // ── Init: check session, fetch exercises, check class session ─────────────────
  useEffect(() => {
    const s = getSession();
    if (!s) { window.location.href = "/login"; return; }
    setSession(s);

    if (s.masteredNodes?.length) {
      const mNodes = new Set(s.masteredNodes);
      setMasteredNodes(mNodes);
      const firstAvailable = DAG_ORDER.find(n => !mNodes.has(n)) ?? DEFAULT_NODE;
      setActiveNode(firstAvailable);
      mainNodeRef.current = firstAvailable;
    }

    fetchAllExercises();
    checkClassSession();
  }, [router]);

  async function fetchAllExercises() {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseKey) { setExercisesLoaded(true); return; }
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(supabaseUrl, supabaseKey);
      const { data } = await sb.from("exercises").select("id, prompt, correct_expr, node_id, prereq_on_fail, fail_reason");
      if (data) {
        const mapped: Exercise[] = data.map(dbEx => ({
          id: dbEx.id,
          prompt: dbEx.prompt,
          expr: dbEx.correct_expr,
          node: dbEx.node_id,
          prereqOnFail: dbEx.prereq_on_fail || "",
          failReason: dbEx.fail_reason || "",
        }));
        setAllExercises(mapped);
      }
    } catch(e) {
      console.error("Error cargando ejercicios BD", e);
    } finally {
      setExercisesLoaded(true);
    }
  }

  async function checkClassSession() {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseKey) return;
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(supabaseUrl, supabaseKey);
      // Use maybeSingle() so no exception is thrown when there's no active session
      const { data } = await sb
        .from("class_sessions")
        .select("exercise_ids")
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data?.exercise_ids && Array.isArray(data.exercise_ids) && data.exercise_ids.length > 0) {
        setClassExerciseIds(data.exercise_ids);
        setClassSessionActive(true);
      }
    } catch {
      // No active class session — normal flow
    }
  }

  // ── Concept card trigger on node change ─────────────────────────────────────
  useEffect(() => {
    if (!conceptShown.has(activeNode) && CONCEPTS[activeNode]) {
      setShowingConcept(true);
    } else {
      setShowingConcept(false);
    }
  }, [activeNode, conceptShown]);

  // ── RF-15: Group 2 — max 5 exercises per session ────────────────────────────
  const SESSION_LIMIT = session?.groupId === 2 ? 5 : Infinity;

  // ── Load exercises when node / class session changes ─────────────────────────
  useEffect(() => {
    let pool: Exercise[];

    if (classSessionActive && classExerciseIds) {
      // Class session active: show only the exercises the teacher assigned, regardless of node
      pool = allExercises.filter(e => classExerciseIds.includes(e.id));
      // Drive the active node from the first exercise in the session
      if (pool.length > 0 && pool[0].node && !isReviewMode) {
        const sessionNode = pool[0].node;
        if (sessionNode !== activeNode) {
          setActiveNode(sessionNode);
          mainNodeRef.current = sessionNode;
          return; // let the effect re-run after the node is updated
        }
      }
    } else {
      pool = allExercises.filter(e => e.node === activeNode);
    }

    const limited = pool.slice(0, SESSION_LIMIT === Infinity ? undefined : SESSION_LIMIT);
    setExercises(shuffle(limited));
    setConsecutiveCorrect(0);
    setJustMastered(false);

    if (!isReviewMode && savedExerciseIndexRef.current > 0) {
      setCurrent(Math.min(savedExerciseIndexRef.current, Math.max(0, limited.length - 1)));
      savedExerciseIndexRef.current = 0;
    } else {
      setCurrent(0);
    }
  }, [activeNode, SESSION_LIMIT, classSessionActive, classExerciseIds, allExercises]);

  const ex: Exercise | undefined = exercises[current];

  // Reset on exercise change
  useEffect(() => {
    setInputValue("");
    setFeedbackState("hidden");
    setServiceError(null);
    setFailedAttempts(0);
    inputRef.current?.focus();
  }, [current, activeNode]);

  // ── Verify & feedback ────────────────────────────────────────────────────────
  const handleCheck = useCallback(async () => {
    if (!inputValue.trim() || checking || !ex || !session) return;
    setChecking(true);
    setServiceError(null);
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
        setServiceError(body?.error ?? `Error del servidor (${res.status}).`);
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

    setFeedbackState(correct ? "ok" : "warn");
    setFeedbackTag(
      correct
        ? `✓ CORRECTO — ${consecutiveCorrect + 1}/${MASTERY_THRESHOLD} hacia dominio`
        : "✗ REVISIÓN NECESARIA — Verificado por motor matemático"
    );
    setFeedbackLoading(true);
    setChecking(false);

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

  function handleNext() {
    if (current < exercises.length - 1) {
      setCurrent(c => c + 1);
    } else if (isReviewMode) {
      setActiveNode(mainNodeRef.current);
      setReviewNode(null);
    }
  }

  function handleGoToReview() {
    if (!reviewNode) return;
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
    const prereqs = DAG[nodeId]?.prereqs ?? [];
    const accessible = prereqs.every(p => masteredNodes.has(p)) || masteredNodes.has(nodeId);
    if (!accessible) return;
    mainNodeRef.current = nodeId;
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
    const newMastered = new Set([...masteredNodes, activeNode]);
    const next = DAG_ORDER.find(n => !newMastered.has(n));
    if (next) {
      mainNodeRef.current = next;
      setActiveNode(next);
    }
  }

  // ── Guard: loading session ────────────────────────────────────────────────────
  if (!session) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-dim)" }}>
        Cargando<span className="loading-dots" />
      </div>
    );
  }

  // ── Phase: Welcome screen ─────────────────────────────────────────────────────
  if (phase === "welcome") {
    const isFirstTime = session.masteredNodes?.length === 0 || !session.masteredNodes;
    return (
      <div className="welcome-screen">
        <div className="welcome-card">
          <div className="eyebrow">ARIADNA — TUTOR DE CÁLCULO I</div>
          <h1 className="welcome-title">
            Hola, <em>{session.name ?? session.code}</em> 👋
          </h1>
          <p className="welcome-subtitle">
            {GROUP_LABELS[session.groupId] ?? `Grupo ${session.groupId}`}
          </p>

          {/* Progress summary */}
          <div className="welcome-progress-bar-container">
            <div className="welcome-progress-label">
              Progreso: <strong>{masteredNodes.size}</strong> / {DAG_ORDER.length} nodos dominados
            </div>
            <div className="welcome-progress-track">
              <div
                className="welcome-progress-fill"
                style={{ width: `${(masteredNodes.size / DAG_ORDER.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Node status chips */}
          <div className="welcome-node-chips">
            {DAG_ORDER.map(n => (
              <span
                key={n}
                className={`node-chip ${masteredNodes.has(n) ? "node-chip-mastered" : "node-chip-pending"}`}
              >
                {masteredNodes.has(n) ? "✓ " : ""}{DAG[n]?.label}
              </span>
            ))}
          </div>

          {isFirstTime ? (
            <>
              <p className="welcome-hint">
                Es tu primera sesión. Elige desde qué tema quieres comenzar.
              </p>
              <button
                className="welcome-btn welcome-btn-secondary"
                onClick={() => setPhase("pick")}
              >
                Elegir tema de inicio →
              </button>
            </>
          ) : (
            <button
              className="welcome-btn welcome-btn-primary"
              onClick={() => setPhase("learning")}
            >
              Continuar con <em>{DAG[activeNode]?.label}</em> →
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Phase: Node picker (first-time users) ─────────────────────────────────────
  if (phase === "pick") {
    return (
      <div className="welcome-screen">
        <div className="welcome-card" style={{ maxWidth: 680 }}>
          <div className="eyebrow">ARIADNA — ELIGE TU PUNTO DE PARTIDA</div>
          <h2 className="welcome-title" style={{ fontSize: "1.6rem" }}>
            ¿Desde dónde quieres empezar?
          </h2>
          <p className="welcome-hint">
            Ariadna evaluará tu nivel mientras practicas. Puedes empezar desde un tema avanzado o desde los fundamentos.
          </p>
          <div className="node-picker-grid">
            {DAG_ORDER.map(n => {
              const prereqs = DAG[n]?.prereqs ?? [];
              const label = DAG[n]?.label;
              const unit = DAG[n]?.unit;
              return (
                <button
                  key={n}
                  className="node-picker-card"
                  onClick={() => {
                    mainNodeRef.current = n;
                    setActiveNode(n);
                    setPhase("learning");
                  }}
                >
                  <span className="node-picker-unit">{unit}</span>
                  <span className="node-picker-label">{label}</span>
                  {prereqs.length > 0 && (
                    <span className="node-picker-prereqs">
                      Requiere: {prereqs.map(p => DAG[p]?.label).join(", ")}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <button
            className="welcome-btn welcome-btn-secondary"
            style={{ marginTop: 20 }}
            onClick={() => setPhase("welcome")}
          >
            ← Volver
          </button>
        </div>
      </div>
    );
  }

  // ── Guard: mastery screen ─────────────────────────────────────────────────────
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

  // ── Guard: RF-15 Grupo 2 session completed ────────────────────────────────────
  if (session.groupId === 2 && current >= exercises.length && exercises.length > 0 && !isReviewMode && !justMastered) {
    return (
      <div style={{ textAlign: "center", padding: "80px 20px", color: "var(--text-main)" }}>
        <h2 style={{ fontSize: "1.8rem", marginBottom: "12px" }}>Sesión completada 🎓</h2>
        <p style={{ color: "var(--text-dim)", maxWidth: "420px", margin: "0 auto 24px" }}>
          Has terminado los ejercicios de esta sesión. Tu progreso queda guardado.
        </p>
        <button onClick={handleLogout} className="welcome-btn welcome-btn-primary">
          Cerrar sesión
        </button>
      </div>
    );
  }

  // ── Guard: concept card ───────────────────────────────────────────────────────
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

  // ── Guard: exercises not loaded yet ──────────────────────────────────────────
  if (!ex) {
    if (!exercisesLoaded) {
      return (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-dim)" }}>
          Cargando ejercicios<span className="loading-dots" />
        </div>
      );
    }
    // Exercises loaded but empty
    return (
      <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-dim)" }}>
        <div style={{ fontSize: "2.5rem", marginBottom: "16px" }}>📭</div>
        <h2 style={{ color: "var(--text-main)", marginBottom: "8px" }}>Sin ejercicios disponibles</h2>
        <p style={{ marginBottom: "24px", maxWidth: "400px", margin: "0 auto 24px" }}>
          La base de datos no tiene ejercicios para el tema <strong>{DAG[activeNode]?.label}</strong> todavía.
          Pídele al docente que siembre el banco de ejercicios.
        </p>
        <button
          onClick={() => setPhase("pick")}
          style={{ padding: "10px 22px", borderRadius: "8px", background: "var(--accent-glow)", color: "#111", border: "none", cursor: "pointer", fontWeight: 600 }}
        >
          Cambiar de tema
        </button>
      </div>
    );
  }

  // ── Main learning view ────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Header ── */}
      <header>
        <div className="header-top">
          <div className="eyebrow">
            ARIADNA · {DAG[activeNode]?.unit ?? "Cálculo I"}
            {classSessionActive && (
              <span style={{ marginLeft: 10, background: "var(--accent-glow)", color: "#111", borderRadius: 6, padding: "2px 8px", fontSize: "0.72rem", fontWeight: 700 }}>
                🏫 Clase activa
              </span>
            )}
          </div>

          {/* ── Dropdown menu ── */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="menu-toggle-btn"
              aria-label="Menú de opciones"
            >
              {session.code} ▾
            </button>
            {menuOpen && (
              <div className="dropdown-menu" onMouseLeave={() => setMenuOpen(false)}>
                <div className="dropdown-header">
                  <div style={{ fontWeight: 700, color: "var(--text-main)" }}>{session.name ?? session.code}</div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>{GROUP_LABELS[session.groupId]}</div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginTop: 2 }}>
                    Nodos dominados: {masteredNodes.size} / {DAG_ORDER.length}
                  </div>
                </div>
                <hr className="dropdown-divider" />
                <button className="dropdown-item" onClick={() => { setMenuOpen(false); setPhase("welcome"); }}>
                  📊 Ver mi progreso
                </button>
                <button className="dropdown-item" onClick={() => { setMenuOpen(false); setPhase("pick"); }}>
                  🗺️ Cambiar de tema
                </button>
                <hr className="dropdown-divider" />
                <button className="dropdown-item dropdown-item-danger" onClick={handleLogout}>
                  ↩ Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>

        <h1>
          El hilo que <em>te guía</em>
          <br />
          paso a paso.
        </h1>
        <p className="sub">
          Domina un tema respondiendo <strong>{MASTERY_THRESHOLD}</strong> ejercicios seguidos correctamente.
        </p>
      </header>

      {/* ── Thread map ── */}
      <ThreadMap
        masteredNodes={masteredNodes}
        reviewNode={reviewNode}
        currentNodeId={activeNode}
        onNodeClick={handleNodeClick}
      />

      {/* ── Review mode banner ── */}
      {isReviewMode && (
        <div className="review-banner">
          <span>🔄 Repasando: <strong>{DAG[activeNode]?.label}</strong></span>
          <button onClick={handleReturnEarly} className="review-return-btn">
            ↩ Volver a {DAG[mainNodeRef.current]?.label ?? "unidad"}
          </button>
        </div>
      )}

      {/* ── Exercise card ── */}
      <div className="card">
        <div className="card-meta">
          <span className="card-label">Ejercicio {current + 1} / {exercises.length}</span>
          <span className="card-node-badge">{DAG[activeNode]?.label ?? activeNode}</span>
          {consecutiveCorrect > 0 && !justMastered && (
            <span className="mastery-progress-badge">
              🔥 {consecutiveCorrect}/{MASTERY_THRESHOLD}
            </span>
          )}
        </div>

        <div className="problem" id="problemText">
          <span className="fn">{ex?.prompt}</span>
        </div>

        <div className="notation-hint">
          💡 Usa <code>*</code> para multiplicar y <code>^</code> para exponentes — ej: <code>3*x^2 - 6*x</code>
        </div>

        <div className="input-row">
          <input
            ref={inputRef}
            type="text"
            id="answerInput"
            placeholder="Escribe tu respuesta aquí…"
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
                  : "Continuar →"}
            </button>
          ) : (
            <button id="checkBtn" onClick={handleCheck} disabled={checking || !inputValue.trim()}>
              {checking ? "Verificando…" : "Verificar →"}
            </button>
          )}
        </div>

        {failedAttempts >= 3 && !checking && feedbackState !== "ok" && (
          <div style={{ marginTop: "10px", textAlign: "right" }}>
            <button onClick={handleSkip} className="skip-btn">
              Me rindo — mostrar solución ⏭
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
          <div className="prereq-suggestion">
            <p>Parece que este tema requiere repasar un prerrequisito:</p>
            <button onClick={handleGoToReview} className="prereq-btn">
              Repasar {DAG[reviewNode]?.label ?? "prerrequisito"} ↗
            </button>
          </div>
        )}
      </div>

      {/* ── Chat panel (dudas) ── */}
      <ChatPanel
        currentNode={activeNode}
        currentNodeLabel={DAG[activeNode]?.label ?? activeNode}
        currentExercise={ex?.prompt}
        groupId={session.groupId}
        studentId={session.studentId}
      />

      <footer>
        Ariadna — Ingeniería de Sistemas, Universidad de Córdoba · Verificación matemática real (mathjs)
      </footer>
    </>
  );
}
