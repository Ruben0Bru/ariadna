import { NextRequest, NextResponse } from "next/server";

// ── Chat de dudas de Cálculo I (RF-13 extensión) ───────────────────────────
// El chat responde preguntas de matemáticas en el contexto del nodo activo.
// NUNCA resuelve directamente el ejercicio que el estudiante está haciendo,
// pero sí puede explicar conceptos generales de ese tema.

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatBody {
  messages: ChatMessage[];       // Historial completo de la conversación
  currentNode: string;           // Nodo activo del estudiante (ej: "regla_cadena")
  currentNodeLabel: string;      // Nombre legible del nodo
  currentExercise?: string;      // Enunciado del ejercicio actual (solo para contexto)
}

const NODE_CONTEXT: Record<string, string> = {
  leyes_exponentes: "leyes de exponentes (potencias, raíces, exponentes negativos)",
  factorizacion: "factorización y productos notables (binomios, diferencia de cuadrados)",
  definicion_derivada: "definición de derivada como límite, pendiente e interpretación",
  regla_potencia: "regla de la potencia para derivar polinomios: d/dx[xⁿ] = n·xⁿ⁻¹",
  regla_producto: "regla del producto: (uv)' = u'v + uv'",
  regla_cociente: "regla del cociente: (u/v)' = (u'v - uv') / v²",
  regla_cadena: "regla de la cadena para funciones compuestas: f(g(x))' = f'(g(x))·g'(x)",
};

export async function POST(req: NextRequest) {
  let body: ChatBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const { messages, currentNode, currentNodeLabel, currentExercise } = body;

  if (!messages || messages.length === 0) {
    return NextResponse.json({ error: "Sin mensajes" }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      reply: `Soy Ariadna, tu tutora de Cálculo I. En este momento el servicio de IA está desactivado, pero puedo decirte que el tema que estás trabajando es: **${currentNodeLabel}**. Revisa la tarjeta de concepto del nodo o consulta tu libro de texto en el capítulo correspondiente.`,
    });
  }

  const nodeCtx = NODE_CONTEXT[currentNode] ?? currentNodeLabel;

  // Construir el system prompt de contexto
  const systemPrompt = `Eres Ariadna, tutora socrática de Cálculo I universitario. Tu misión es ayudar al estudiante a ENTENDER, no darle las respuestas.

**CONTEXTO DEL ESTUDIANTE:**
- Nodo activo: "${currentNodeLabel}" (${nodeCtx})
${currentExercise ? `- Ejercicio actual que está resolviendo: "${currentExercise}"` : ""}

**REGLAS ESTRICTAS:**
1. Solo respondes preguntas de matemáticas, específicamente de Cálculo I y sus prerrequisitos algebraicos.
2. Si el estudiante pregunta algo fuera de matemáticas, responde: "Solo puedo ayudarte con dudas de Cálculo I y álgebra."
3. NUNCA resuelvas directamente el ejercicio que el estudiante está haciendo (si se menciona). En cambio, explica el concepto general con un ejemplo DIFERENTE.
4. Usa formato Markdown y LaTeX con $...$ para fórmulas inline y $$...$$ para ecuaciones en bloque.
5. Sé conciso: máximo 200 palabras por respuesta. Si el estudiante necesita más, puede preguntar de nuevo.
6. Tono: cálido, socrático, cercano. Termina con una pregunta de reflexión cuando sea útil.`;

  // Construir el historial de mensajes para Gemini
  const geminiContents = [
    { parts: [{ text: systemPrompt }], role: "user" as const },
    { parts: [{ text: "Entendido. Estoy listo para ayudarte con tus dudas de Cálculo I." }], role: "model" as const },
    ...messages.map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("model" as const),
      parts: [{ text: m.content }],
    })),
  ];

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: geminiContents,
          generationConfig: {
            maxOutputTokens: 400,
            temperature: 0.5,
            topP: 0.9,
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
          ],
        }),
      }
    );

    if (!geminiRes.ok) {
      throw new Error(`Gemini error: ${geminiRes.status}`);
    }

    const data = await geminiRes.json();
    const reply: string =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? "")
        .join("")
        .trim() ?? "";

    if (!reply) throw new Error("Gemini devolvió respuesta vacía");

    return NextResponse.json({ reply });
  } catch (e) {
    console.error("[Ariadna/chat] Error:", e);
    return NextResponse.json({
      reply: `No pude conectarme al servicio en este momento. Recuerda que el tema es **${currentNodeLabel}** — intenta consultar la tarjeta de concepto del nodo.`,
    });
  }
}
