"use client";

import { DAG, DAG_ORDER } from "@/lib/dag";

interface ThreadMapProps {
  masteredNodes: Set<string>;
  reviewNode: string | null;
}

export default function ThreadMap({ masteredNodes, reviewNode }: ThreadMapProps) {
  return (
    <div className="thread-map" id="threadMap">
      {DAG_ORDER.map((key, i) => {
        const n = DAG[key];
        let className = "node";
        if (masteredNodes.has(key)) className += " mastered";
        else if (key === "algebra_derivadas" && reviewNode === null) className += " current";
        if (key === reviewNode) className += " review";

        return (
          <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span className={className}>{n.label}</span>
            {i < DAG_ORDER.length - 1 && <span className="sep">→</span>}
          </span>
        );
      })}
    </div>
  );
}
