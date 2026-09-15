"use client";

import { useEffect, useRef, useState } from "react";
import { DAG, EXERCISES } from "@/lib/dag";
import { symbolicJudge } from "@/lib/symbolicJudge";
import ThreadMap from "@/components/ThreadMap";
import FeedbackBox from "@/components/FeedbackBox";

type FeedbackState = "hidden" | "ok" | "warn";

export default function AriadnaApp() {
  const [current, setCurrent] = useState(0);
  const [masteredNodes, setMasteredNodes] = useState<Set<string>>(new Set());
  const [reviewNode, setReviewNode] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [checking, setChecking] = useState(false);
  const [feedbackState, setFeedbackState] = useState<FeedbackState>("hidden");
  const [feedbackTag, setFeedbackTag] = useState("");
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const ex = EXERCISES[current];
  const exprPart = ex.prompt.split("=")[1]?.trim() ?? ex.prompt;

  // reset cuando cambia el ejercicio
  useEffect(() => {
    setInputValue("");
    setFeedbackState("hidden");
    setReviewNode(null);
    inputRef.current?.focus();
  }, [current]);

  async function handleCheck() {
    if (!inputValue.trim() || checking) return;
    setChecking(true);

    const correct = symbolicJudge(inputValue.trim(), ex.expr);

    // Actualizar estado del grafo
    if (correct) {
      setMasteredNodes((prev) => new Set([...prev, "algebra_derivadas"]));
      setReviewNode(null);
    } else {
      setReviewNode(ex.prereqOnFail);
    }

    // Mostrar feedback con loading
    setFeedbackState(correct ? "ok" : "warn");
    setFeedbackTag(
      correct
        ? "VERIFICADO — SymPy-equivalente"
        : "REVISIÓN NECESARIA — SymPy-equivalente"
    );
    setFeedbackText("");
    setFeedbackLoading(true);

    // Llamar al proxy de la API
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correct,
          studentAnswer: inputValue.trim(),
          exercise: ex,
          targetNodeLabel: DAG[ex.prereqOnFail]?.label ?? "",
          targetNodeUnit: DAG[ex.prereqOnFail]?.unit ?? "",
        }),
      });
      const data = await res.json();
      setFeedbackText(data.message ?? "");
    } catch {
      setFeedbackText(
        correct
          ? "¡Correcto! El planteamiento y el resultado coinciden con lo esperado — puedes avanzar al siguiente nodo."
          : `No es correcto todavía. Antes de seguir, conviene repasar: ${ex.failReason}.`
      );
    } finally {
      setFeedbackLoading(false);
      setChecking(false);
    }

    // Avanzar al siguiente ejercicio si es correcto
    if (correct) {
      setTimeout(() => {
        if (current < EXERCISES.length - 1) {
          setCurrent((c) => c + 1);
        }
      }, 3200);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleCheck();
  }

  return (
    <>
      <header>
        <div className="eyebrow">
          ARIADNA — PROTOTIPO FUNCIONAL / UNIDAD 3, ÁLGEBRA DE DERIVADAS
        </div>
        <h1>
          El hilo que <em>te devuelve</em>
          <br />
          al nodo que necesitas.
        </h1>
        <p className="sub">
          Este es un recorte funcional del tutor: verificación simbólica local +
          diagnóstico y redirección sobre el grafo curricular. No es la
          arquitectura completa — es el ciclo end-to-end demostrado sobre un
          solo nodo real.
        </p>
      </header>

      <ThreadMap masteredNodes={masteredNodes} reviewNode={reviewNode} />

      <div className="card">
        <div className="card-label">Ejercicio actual</div>
        <div className="problem" id="problemText">
          Deriva <span className="fn">f(x) = {exprPart}</span>
        </div>

        <div className="input-row">
          <input
            ref={inputRef}
            type="text"
            id="answerInput"
            placeholder="ej: 6x - 5   (usa ^ para potencias)"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button id="checkBtn" onClick={handleCheck} disabled={checking}>
            Verificar
          </button>
        </div>

        <div className="hint">
          La verificación es simbólica (equivalencia por evaluación numérica
          multi-punto), no comparación de texto.
        </div>

        <FeedbackBox
          state={feedbackState}
          tag={feedbackTag}
          text={feedbackText}
          loading={feedbackLoading}
        />

        <div className="architecture">
          <span>
            Juez matemático: <b>local, sin LLM</b>
          </span>
          <span>
            Mediador pedagógico: <b>API de lenguaje</b>
          </span>
          <span>
            Posición curricular: <b>grafo DAG</b>
          </span>
        </div>
      </div>

      <footer>
        Prototipo de demostración — Universidad de Córdoba, Ingeniería de
        Sistemas. El motor de verificación aquí usa equivalencia numérica
        multi-punto (vía math.js) como sustituto ligero del verificador
        simbólico real en Python/SymPy que usará el sistema en producción.
      </footer>
    </>
  );
}
