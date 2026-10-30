"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { DAG, DAG_ORDER, CONCEPTS, DEFAULT_NODE, type Exercise } from "@/lib/dag";
import { getSession, clearSession, saveSession, type StudentSession } from "@/lib/session";
import ThreadMap from "@/components/ThreadMap";
import FeedbackBox from "@/components/FeedbackBox";
import ConceptCard from "@/components/ConceptCard";
import ChatPanel from "@/components/ChatPanel";
import MathPreview from "@/components/MathPreview";

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

  // ── Chat Panel state ─────────────────────────────────────────────────────────
  const [chatOpen, setChatOpen] = useState(false);

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [current, setCurrent] = useState(0);

  // ── Class session ────────────────────────────────────────────────────────────
  const [classExerciseIds, setClassExerciseIds] = useState<number[] | null>(null);
  const [classSessionActive, setClassSessionActive] = useState(false);
  // El estudiante decide si quiere ver solo los ejercicios de clase (no se fuerza).
  const [classMode, setClassMode] = useState(false);

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

  // ── Scratchpad (Bloc de notas) ───────────────────────────────────────────────
  const [scratchpadOpen, setScratchpadOpen] = useState(false);
  const [scratchpadText, setScratchpadText] = useState("");

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
      const res = await fetch("/api/exercises");
      if (res.status === 401) { clearSession(); window.location.href = "/login"; return; }
      const data = await res.json();
      if (data.exercises) {
        const mapped: Exercise[] = data.exercises.map((dbEx: any) => ({
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
      const res = await fetch("/api/sessions");
      const data = await res.json();
      if (data.activeSession?.exercise_ids?.length > 0) {
        setClassExerciseIds(data.activeSession.exercise_ids);
        setClassSessionActive(true);
      }
    } catch {
      // No active class session
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

  // ── Load exercises when node / class mode changes ───────────────────────────
  // Estudio libre: se practican TODOS los ejercicios del nodo (sin límite por sesión).
  useEffect(() => {
    let pool: Exercise[];

    if (classMode && classExerciseIds) {
      // Solo si el estudiante eligió ver los ejercicios de clase.
      pool = allExercises.filter(e => classExerciseIds.includes(e.id));
    } else {
      pool = allExercises.filter(e => e.node === activeNode);
    }

    setExercises(shuffle(pool));
    setConsecutiveCorrect(0);
    setJustMastered(false);

    if (!isReviewMode && savedExerciseIndexRef.current > 0) {
      setCurrent(Math.min(savedExerciseIndexRef.current, Math.max(0, pool.length - 1)));
      savedExerciseIndexRef.current = 0;
    } else {
      setCurrent(0);
    }
  }, [activeNode, classMode, classExerciseIds, allExercises]);

  const ex: Exercise | undefined = exercises[current];
  // Nodo real del ejercicio en pantalla (en "ejercicios de clase" puede variar).
  const exNode = ex?.node ?? activeNode;

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
          exerciseId: ex.id,
          studentAnswer: inputValue.trim(),
        }),
      });

      if (res.status === 401) {
        clearSession();
        window.location.href = "/login";
        return;
      }

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
      if (newConsec >= MASTERY_THRESHOLD && !masteredNodes.has(ex.node)) {
        const newMastered = new Set([...masteredNodes, ex.node]);
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
  }, [inputValue, checking, ex, session, consecutiveCorrect, masteredNodes, failedAttempts]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleCheck();
  }

  function handleNext() {
    if (current < exercises.length - 1) {
      setCurrent(c => c + 1);
    } else if (isReviewMode) {
      setActiveNode(mainNodeRef.current);
      setReviewNode(null);
    } else {
      // Terminó todos los ejercicios del tema: pantalla de cierre con opciones.
      setCurrent(exercises.length);
    }
  }

  // Repetir el tema (nuevo orden aleatorio) o pasar a elegir otro.
  function handleRepeatTopic() {
    setExercises(prev => shuffle(prev));
    setCurrent(0);
    setConsecutiveCorrect(0);
  }

  function handleEnterClassMode() {
    if (!classExerciseIds) return;
    const first = allExercises.find(e => classExerciseIds.includes(e.id));
    if (first) {
      mainNodeRef.current = first.node;
      setActiveNode(first.node);
    }
    setReviewNode(null);
    setClassMode(true);
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
    if (nodeId === activeNode && !classMode) return;
    // Estudio libre: cualquier tema es accesible, sin exigir prerrequisitos.
    setClassMode(false);
    mainNodeRef.current = nodeId;
    setActiveNode(nodeId);
    setReviewNode(null);
  }

  function handleSkip() {
    setFeedbackState("ok");
    setFeedbackTag("✓ AVANCE FORZADO");
    setFeedbackText(`La respuesta esperada era: ${ex?.expr}.`);
  }

  async function handleLogout() {
    try { await fetch("/api/logout", { method: "POST" }); } catch { /* ignore */ }
    clearSession();
    window.location.href = "/login";
  }

  function handleConceptDone() {
    setConceptShown(prev => new Set([...prev, activeNode]));
    setShowingConcept(false);
  }

  // Tras dominar un tema, el estudiante decide qué hacer (no se avanza solo).
  function handleChooseAnotherTopic() {
    setJustMastered(false);
    setPhase("pick");
  }

  function handleKeepPracticing() {
    setJustMastered(false);
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
            Practica a tu ritmo: elige el tema que quieras repasar.
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
            <>
              <button
                className="welcome-btn welcome-btn-primary"
                onClick={() => setPhase("learning")}
              >
                Continuar con <em>{DAG[activeNode]?.label}</em> →
              </button>
              <button
                className="welcome-btn welcome-btn-secondary"
                style={{ marginTop: 10 }}
                onClick={() => setPhase("pick")}
              >
                Elegir otro tema
              </button>
            </>
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
            Puedes practicar el tema que quieras, en el orden que prefieras. Los temas marcados con ✓ ya los dominaste.
          </p>
          <div className="node-picker-grid">
            {DAG_ORDER.map(n => {
              const prereqs = DAG[n]?.prereqs ?? [];
              const label = DAG[n]?.label;
              const unit = DAG[n]?.unit;
              const done = masteredNodes.has(n);
              return (
                <button
                  key={n}
                  className="node-picker-card"
                  onClick={() => {
                    setClassMode(false);
                    setReviewNode(null);
                    mainNodeRef.current = n;
                    setActiveNode(n);
                    setPhase("learning");
                  }}
                >
                  <span className="node-picker-unit">{unit}</span>
                  <span className="node-picker-label">{done ? "✓ " : ""}{label}</span>
                  {prereqs.length > 0 && (
                    <span className="node-picker-prereqs">
                      Recomendado antes: {prereqs.map(p => DAG[p]?.label).join(", ")}
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
    const nodeName = DAG[exNode]?.label ?? exNode;
    return (
      <div className="mastery-screen" role="dialog" aria-label="Nodo dominado">
        <div className="mastery-icon">🏆</div>
        <h2 className="mastery-title">¡Nodo dominado!</h2>
        <p className="mastery-subtitle">
          Respondiste <strong>{MASTERY_THRESHOLD} seguidas correctamente</strong>
        </p>
        <div className="mastery-node-badge">{nodeName}</div>
        <p className="mastery-body">
          Puedes seguir practicando este tema o elegir otro.
        </p>
        <button className="mastery-continue-btn" onClick={handleChooseAnotherTopic}>
          Elegir otro tema →
        </button>
        <button
          className="mastery-continue-btn"
          style={{ marginTop: 10, background: "transparent", border: "1px solid var(--line)", color: "var(--text-main)" }}
          onClick={handleKeepPracticing}
        >
          Seguir practicando este tema
        </button>
      </div>
    );
  }

  // ── Guard: terminó todos los ejercicios del tema ──────────────────────────────
  if (exercises.length > 0 && current >= exercises.length && !isReviewMode) {
    return (
      <div style={{ textAlign: "center", padding: "80px 20px", color: "var(--text-main)" }}>
        <h2 style={{ fontSize: "1.8rem", marginBottom: "12px" }}>
          {classMode ? "Terminaste los ejercicios de clase 🎓" : "Terminaste los ejercicios de este tema 🎓"}
        </h2>
        <p style={{ color: "var(--text-dim)", maxWidth: "420px", margin: "0 auto 24px" }}>
          Tu progreso queda guardado. Puedes repetir el tema o elegir otro.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={handleRepeatTopic} className="welcome-btn welcome-btn-secondary">
            Repetir ejercicios
          </button>
          <button onClick={() => { setClassMode(false); setPhase("pick"); }} className="welcome-btn welcome-btn-primary">
            Elegir otro tema →
          </button>
        </div>
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
          Todavía no hay ejercicios cargados para <strong>{DAG[activeNode]?.label}</strong>.
          Elige otro tema mientras tanto.
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
            ARIADNA · {DAG[exNode]?.unit ?? "Cálculo I"}
            {classMode && (
              <span style={{ marginLeft: 10, background: "var(--accent-glow)", color: "#111", borderRadius: 6, padding: "2px 8px", fontSize: "0.72rem", fontWeight: 700 }}>
                🏫 Clase
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
        currentNodeId={exNode}
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

      {/* ── Ejercicios de clase (opcional, no se fuerza) ── */}
      {classSessionActive && classExerciseIds && (
        <div className="review-banner">
          {classMode ? (
            <>
              <span>🏫 Estás viendo los <strong>ejercicios de clase</strong></span>
              <button onClick={() => setClassMode(false)} className="review-return-btn">
                Volver a practicar libremente
              </button>
            </>
          ) : (
            <>
              <span>🏫 Tu docente asignó ejercicios de clase</span>
              <button onClick={handleEnterClassMode} className="review-return-btn">
                Ver ejercicios de clase
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Exercise card ── */}
      <div className="card">
        <div className="card-meta">
          <span className="card-label">Ejercicio {current + 1} / {exercises.length}</span>
          <span className="card-node-badge">{DAG[exNode]?.label ?? exNode}</span>
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

        {/* ── Live math formula preview ── */}
        <MathPreview input={inputValue} />

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
          onAction={() => setChatOpen(true)}
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

      {/* ── Scratchpad Panel (Bloc de notas) ── */}
      <div className={`scratchpad-panel ${scratchpadOpen ? "open" : ""}`}>
        <div className="scratchpad-header" onClick={() => setScratchpadOpen(!scratchpadOpen)}>
          <span>🗒️ Bloc de Notas</span>
          <button className="scratchpad-toggle">
            {scratchpadOpen ? "▼" : "▲"}
          </button>
        </div>
        {scratchpadOpen && (
          <div className="scratchpad-body">
            <textarea
              className="scratchpad-textarea"
              placeholder="Usa este espacio como borrador para realizar despejes o anotar tus cálculos temporales..."
              value={scratchpadText}
              onChange={e => setScratchpadText(e.target.value)}
              spellCheck={false}
            />
          </div>
        )}
      </div>

      {/* ── Chat panel (dudas) ── */}
      <ChatPanel
        currentNode={exNode}
        currentNodeLabel={DAG[exNode]?.label ?? exNode}
        currentExercise={ex?.prompt}
        groupId={session.groupId}
        studentId={session.studentId}
        open={chatOpen}
        onToggle={() => setChatOpen(!chatOpen)}
      />

      <footer>
        Ariadna — Ingeniería de Sistemas, Universidad de Córdoba · Motor de verificación numérica (mathjs)
      </footer>
    </>
  );
}
