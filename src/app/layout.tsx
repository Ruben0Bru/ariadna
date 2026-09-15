import type { Metadata } from "next";
import Script from "next/script";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Ariadna — Prototipo",
  description:
    "Prototipo funcional de Ariadna: tutor neuro-simbólico de Cálculo I con verificación simbólica local y mediación pedagógica vía LLM. Universidad de Córdoba.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        {/* math.js se carga de forma global para el juez simbólico del cliente */}
        <Script
          src="https://cdnjs.cloudflare.com/ajax/libs/mathjs/12.4.0/math.min.js"
          strategy="beforeInteractive"
        />
      </head>
      <body>
        <div className="wrap">{children}</div>
      </body>
    </html>
  );
}
