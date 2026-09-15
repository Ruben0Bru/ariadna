"use client";

import { DAG, DAG_ORDER } from "@/lib/dag";

interface ThreadMapProps {
  masteredNodes: Set<string>;
  reviewNode: string | null;
  currentNodeId: string;
}

export default function ThreadMap({ masteredNodes, reviewNode, currentNodeId }: ThreadMapProps) {
  return (
    <div className="thread-map" id="threadMap">
      {DAG_ORDER.map((key, i) => {
        const n = DAG[key];
        let cls = "node";
        if (masteredNodes.has(key)) cls += " mastered";
        else if (key === currentNodeId && reviewNode === null) cls += " current";
        if (key === reviewNode) cls += " review";

        return (
          <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span className={cls} title={n.unit}>
              {n.label}
            </span>
            {i < DAG_ORDER.length - 1 && <span className="sep">→</span>}
          </span>
        );
      })}
    </div>
  );
}
