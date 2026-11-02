"use client";

import katex from "katex";
import "katex/dist/katex.min.css";

/**
 * Muestra el enunciado de un ejercicio. El texto normal se deja tal cual y lo que
 * va entre $...$ se renderiza con KaTeX (fracciones, raíces, trigonometría…).
 */
export default function PromptText({ text }: { text: string }) {
  const parts = text.split(/(\$[^$]+\$)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.length > 2 && part.startsWith("$") && part.endsWith("$")) {
          let html: string;
          try {
            html = katex.renderToString(part.slice(1, -1), { throwOnError: false });
          } catch {
            html = part;
          }
          return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
