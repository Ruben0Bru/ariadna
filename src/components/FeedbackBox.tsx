"use client";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

interface FeedbackBoxProps {
  state: "hidden" | "ok" | "warn";
  tag: string;
  text: string;
  loading: boolean;
  onAction?: () => void;
}

export default function FeedbackBox({ state, tag, text, loading, onAction }: FeedbackBoxProps) {
  if (state === "hidden") return null;

  return (
    <div className={`feedback ${state === "ok" ? "ok" : "warn"}`}>
      <span className="tag">{tag}</span>
      <div className="feedback-content" style={{ marginTop: "8px", lineHeight: "1.4" }}>
        {loading ? (
          <p>
            Redactando retroalimentación<span className="loading-dots" />
          </p>
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkMath]}
            rehypePlugins={[rehypeKatex]}
          >
            {text}
          </ReactMarkdown>
        )}
      </div>
      {!loading && state === "warn" && onAction && (
        <div style={{ marginTop: "12px", textAlign: "right" }}>
          <button 
            onClick={onAction}
            style={{
              background: "transparent",
              border: "1px solid var(--accent-glow)",
              color: "var(--accent-glow)",
              padding: "6px 14px",
              borderRadius: "6px",
              fontSize: "0.85rem",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Responder a Ariadna 💬
          </button>
        </div>
      )}
    </div>
  );
}
