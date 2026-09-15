import { NextRequest, NextResponse } from "next/server";

// ---------- Módulo de mediación pedagógica: proxy seguro hacia Anthropic ----------
// La API key NUNCA se expone al cliente.  Configurar ANTHROPIC_API_KEY en .env.local
export async function POST(req: NextRequest) {
  const { correct, studentAnswer, exercise, targetNodeLabel, targetNodeUnit } =
    await req.json();

  const apiKey = process.env.ANTHROPIC_API_KEY;

  const systemPrompt = correct
    ? `Eres el módulo de mediación pedagógica de Ariadna, un tutor neuro-simbólico de Cálculo I. El motor simbólico YA confirmó que la respuesta del estudiante es matemáticamente correcta. Tu único trabajo es felicitar brevemente (1-2 frases, tono cercano pero no infantil) y decir que puede avanzar al siguiente nodo del grafo. NO repitas el cálculo, NO uses símbolos matemáticos elaborados, responde en español, máximo 3 frases.`
    : `Eres el módulo de mediación pedagógica de Ariadna, un tutor neuro-simbólico de Cálculo I. El motor simbólico YA determinó que la respuesta del estudiante es incorrecta (tú no calculas nada, solo explicas). El ejercicio era derivar f(x) = ${exercise.prompt.split("=")[1].trim()}. El estudiante respondió: "${studentAnswer}". El diagnóstico automático del grafo indica que el prerrequisito más probable en falla es: ${exercise.failReason}. Explica en español, en 2-3 frases cercanas y claras (sin regañar), qué prerrequisito debería repasar y por qué, sin resolverle el ejercicio completo. Termina invitándolo al nodo "${targetNodeLabel}" (${targetNodeUnit}).`;

  // Si no hay key configurada, devolver feedback por defecto
  if (!apiKey) {
    const fallback = correct
      ? "¡Correcto! El planteamiento y el resultado coinciden con lo esperado — puedes avanzar al siguiente nodo."
      : `No es correcto todavía. Antes de seguir, conviene repasar: ${exercise.failReason}.`;
    return NextResponse.json({ message: fallback });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: "user", content: "Genera la retroalimentación." }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic API error:", err);
      throw new Error("Anthropic API error");
    }

    const data = await response.json();
    const message = (data.content as { type: string; text: string }[])
      .map((b) => b.text || "")
      .join("")
      .trim();

    return NextResponse.json({
      message:
        message ||
        (correct
          ? "¡Correcto! Puedes avanzar."
          : "Respuesta incorrecta. Revisa el prerrequisito sugerido."),
    });
  } catch (e) {
    console.error(e);
    const fallback = correct
      ? "¡Correcto! El planteamiento y el resultado coinciden con lo esperado — puedes avanzar al siguiente nodo."
      : `No es correcto todavía. Antes de seguir, conviene repasar: ${exercise.failReason}.`;
    return NextResponse.json({ message: fallback });
  }
}
