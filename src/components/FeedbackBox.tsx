"use client";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

interface FeedbackBoxProps {
  state: "hidden" | "ok" | "warn";
  tag: string;
  text: string;
  loading: boolean;
}

export default function FeedbackBox({ state, tag, text, loading }: FeedbackBoxProps) {
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
    </div>
  );
}
