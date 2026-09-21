"use client";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { NodeConcept } from "@/lib/dag";

interface ConceptCardProps {
  nodeId: string;
  concept: NodeConcept;
  onStart: () => void;
}

export default function ConceptCard({ nodeId, concept, onStart }: ConceptCardProps) {
  const isPrereq = nodeId === "leyes_exponentes" || nodeId === "factorizacion";

  return (
    <div className="concept-card" role="region" aria-label={`Concepto: ${concept.title}`}>
      <div className="concept-badge">
        {isPrereq ? "📚 Prerrequisito · Repaso rápido" : "🎯 Concepto nuevo · Lee antes de empezar"}
      </div>

      <h2 className="concept-title">{concept.title}</h2>

      <div className="concept-body">
        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
          {concept.body}
        </ReactMarkdown>
      </div>

      <div className="concept-example">
        <div className="concept-example-label">Ejemplo resuelto</div>
        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
          {concept.example}
        </ReactMarkdown>
      </div>

      <div className="concept-tip">
        💡 {concept.tip}
      </div>

      <button
        id="startExercisesBtn"
        className="concept-start-btn"
        onClick={onStart}
        autoFocus
      >
        Entendido — empezar ejercicios →
      </button>
    </div>
  );
}
