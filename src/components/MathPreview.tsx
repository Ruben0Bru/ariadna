"use client";

import { useEffect, useRef, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

interface MathPreviewProps {
  input: string;
}

/**
 * Renders a live KaTeX preview of a mathjs-style expression while the student types.
 * Converts common student notation (^, *, parentheses) to LaTeX.
 */
function toLatex(expr: string): string {
  if (!expr.trim()) return "";

  let s = expr.trim();

  // Handle fractions with ÷ or / between grouped expressions
  // e.g. (x^2 + 2*x) / (x+1)^2 → \frac{x^2 + 2x}{(x+1)^2}
  const fractionMatch = s.match(/^(.+)\s*\/\s*(.+)$/);
  if (fractionMatch) {
    const num = toLatex(fractionMatch[1].replace(/^\(/, "").replace(/\)$/, "") || fractionMatch[1]);
    const den = toLatex(fractionMatch[2].replace(/^\(/, "").replace(/\)$/, "") || fractionMatch[2]);
    // Only use \frac if the denominator is non-trivial (has operators)
    if (/[+\-\*\/\^]/.test(fractionMatch[2])) {
      return `\\frac{${num}}{${den}}`;
    }
  }

  // Multiplication sign
  s = s.replace(/\*/g, " \\cdot ");

  // Exponents: convert x^n or x^(expr) → x^{n} or x^{expr}
  // Handle x^(expr) first
  s = s.replace(/\^(\([^)]+\))/g, (_, grp) => `^{${grp.slice(1, -1)}}`);
  // Then simple x^n
  s = s.replace(/\^(-?\d+(?:\.\d+)?)/g, (_, n) => `^{${n}}`);
  // Handle remaining ^ with word chars: x^abc
  s = s.replace(/\^([a-zA-Z0-9_]+)/g, (_, n) => `^{${n}}`);

  // sqrt(expr) → \sqrt{expr}
  s = s.replace(/sqrt\(([^)]+)\)/g, (_, inner) => `\\sqrt{${toLatex(inner)}}`);

  // Greek letters
  s = s.replace(/\bpi\b/g, "\\pi");
  s = s.replace(/\be\b/g, "e");

  // Spacing cleanup
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

export default function MathPreview({ input }: MathPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!input.trim()) {
      containerRef.current.innerHTML = "";
      setRenderError(false);
      return;
    }

    const latex = toLatex(input);
    try {
      katex.render(latex, containerRef.current, {
        throwOnError: false,
        displayMode: true,
        output: "html",
        strict: false,
        trust: false,
      });
      setRenderError(false);
    } catch {
      setRenderError(true);
      containerRef.current.innerHTML = "";
    }
  }, [input]);

  if (!input.trim()) return null;

  return (
    <div className="math-preview">
      <div className="math-preview-label">Vista previa:</div>
      {renderError ? (
        <div className="math-preview-error">Expresión incompleta…</div>
      ) : (
        <div ref={containerRef} className="math-preview-render" />
      )}
    </div>
  );
}
