"use client";

import { DAG, DAG_ORDER } from "@/lib/dag";

interface ThreadMapProps {
  masteredNodes: Set<string>;
  reviewNode: string | null;
  currentNodeId: string;
  onNodeClick?: (nodeId: string) => void;
}

export default function ThreadMap({ masteredNodes, reviewNode, currentNodeId, onNodeClick }: ThreadMapProps) {
  return (
    <div className="thread-map" id="threadMap">
      {DAG_ORDER.map((key, i) => {
        const n = DAG[key];
        const isMastered = masteredNodes.has(key);
        const isCurrent = key === currentNodeId && reviewNode === null;
        const isReview = key === reviewNode;
        // Estudio libre: todos los temas son accesibles; los prerrequisitos son solo una recomendación.
        const isAccessible = true;

        let cls = "node";
        if (isMastered) cls += " mastered";
        else if (isCurrent) cls += " current";
        if (isReview) cls += " review";

        const canClick = isAccessible && onNodeClick && key !== currentNodeId;

        return (
          <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span
              className={cls}
              title={n.prereqs.length > 0 ? `${n.unit} · Recomendado antes: ${n.prereqs.map(p => DAG[p]?.label).join(", ")}` : n.unit}
              onClick={canClick ? () => onNodeClick(key) : undefined}
              style={{ cursor: canClick ? "pointer" : "default" }}
            >
              {isMastered && <span style={{ marginRight: 4, fontSize: "0.8em" }}>✓</span>}
              {n.label}
            </span>
            {i < DAG_ORDER.length - 1 && <span className="sep">→</span>}
          </span>
        );
      })}
    </div>
  );
}
