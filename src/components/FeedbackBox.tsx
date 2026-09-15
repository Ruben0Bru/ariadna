"use client";

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
      <p>
        {loading ? (
          <>
            Redactando retroalimentación<span className="loading-dots" />
          </>
        ) : (
          text
        )}
      </p>
    </div>
  );
}
