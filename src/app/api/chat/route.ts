import { NextRequest, NextResponse } from "next/server";

// ── Chat de dudas de Cálculo I (RF-13) ──────────────────────────────────────
// Ariadna responde preguntas de matemáticas en el contexto del nodo activo.
// NUNCA resuelve directamente el ejercicio que el estudiante está haciendo.

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatBody {
  messages: ChatMessage[];
  currentNode: string;
  currentNodeLabel: string;
  currentExercise?: string;
  groupId?: number;
  studentId?: string;
}

const NODE_CONTEXT: Record<string, string> = {
  leyes_exponentes: "leyes de exponentes (potencias, raíces, exponentes negativos y fraccionarios)",
  factorizacion: "factorización y productos notables (binomios, diferencia de cuadrados, distributiva)",
  definicion_derivada: "definición formal de derivada como límite, pendiente de la tangente e interpretación física",
  regla_potencia: "regla de la potencia para derivar monómios y polinomios: d/dx[xⁿ] = n·xⁿ⁻¹",
  regla_producto: "regla del producto para derivar: (uv)' = u'v + uv'",
  regla_cociente: "regla del cociente para derivar fracciones: (u/v)' = (u'v − uv') / v²",
  regla_cadena: "regla de la cadena para funciones compuestas: [f(g(x))]' = f'(g(x))·g'(x)",
};

export async function POST(req: NextRequest) {
  let body: ChatBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const { messages, currentNode, currentNodeLabel, currentExercise, groupId = 3, studentId } = body;

  if (!messages || messages.length === 0) {
    return NextResponse.json({ error: "Sin mensajes" }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      reply: `Soy Ariadna, tu tutora de Cálculo I. En este momento el módulo de IA está desactivado. Para el tema **${currentNodeLabel}**, revisa la tarjeta de concepto del nodo o tu libro de texto.`,
    });
  }

  const nodeCtx = NODE_CONTEXT[currentNode] ?? currentNodeLabel;
  const isStrictTutor = groupId === 2 || groupId === 3;

  const rules = isStrictTutor
    ? `3. NUNCA resuelvas directamente el ejercicio actual (si se menciona). En cambio, guía con preguntas socráticas o explica el concepto con un ejemplo DIFERENTE al ejercicio.
4. Si el estudiante pide la respuesta directamente, niégate con amabilidad y ofrece una pista en su lugar.`
    : `3. Puedes resolver directamente ejercicios similares al actual para ilustrar. Si el estudiante pide la respuesta del ejercicio "${currentExercise}", resuélvelo paso a paso.`;

  const systemPrompt = `Eres Ariadna, una tutora experta y cercana de Cálculo I universitario. Tu misión es ayudar al estudiante a ENTENDER, no a copiar respuestas.

**CONTEXTO ACTUAL:**
- Tema: "${currentNodeLabel}" → ${nodeCtx}
${currentExercise ? `- Ejercicio que está resolviendo: "${currentExercise}"` : ""}
- Modo pedagógico: ${isStrictTutor ? "SOCRÁTICO (solo pistas, nunca la respuesta directa)" : "ASISTENTE DIRECTO"}

**REGLAS:**
1. Responde ÚNICAMENTE preguntas de matemáticas y Cálculo I. Si preguntan otra cosa, di: "Solo puedo ayudarte con dudas de Cálculo I."
2. Mantén un tono amigable, alentador y profesional.
${rules}
5. Usa Markdown y LaTeX: fórmulas inline con $...$ y bloques con $$...$$. 
6. Sé conciso: máximo 200 palabras por respuesta.
7. Si el estudiante comete un error conceptual, señálalo con gentileza antes de explicar.`;

  const geminiContents = [
    { parts: [{ text: systemPrompt }], role: "user" as const },
    { parts: [{ text: "Entendido. Listo para ayudar con Cálculo I." }], role: "model" as const },
    ...messages.map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("model" as const),
      parts: [{ text: m.content }],
    })),
  ];

  try {
    // Using gemini-2.0-flash-lite (updated model name)
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: geminiContents,
          generationConfig: {
            maxOutputTokens: 500,
            temperature: 0.6,
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
      const errText = await geminiRes.text();
      throw new Error(`Gemini error ${geminiRes.status}: ${errText}`);
    }

    const data = await geminiRes.json();
    const reply: string =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? "")
        .join("")
        .trim() ?? "";

    if (!reply) throw new Error("Gemini devolvió respuesta vacía");

    // ── Log chat to Supabase (fire-and-forget) ──────────────────────────────────
    try {
      const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (studentId && supabaseUrl && supabaseKey) {
        const { createClient } = await import("@supabase/supabase-js");
        const sb = createClient(supabaseUrl, supabaseKey);
        sb.from("chat_logs").insert({
          student_id: studentId,
          node_context: currentNode,
          user_prompt: messages[messages.length - 1].content,
          ai_response: reply,
        }).then(({ error }: any) => {
          if (error) console.error("[chat] log error:", error.message);
        });
      }
    } catch (e) {
      console.error("[chat] log failed:", e);
    }

    return NextResponse.json({ reply });
  } catch (e) {
    console.error("[Ariadna/chat] Error:", e);
    return NextResponse.json({
      reply: `No pude conectarme al servicio. Recuerda: el tema es **${currentNodeLabel}**. Revisa la tarjeta de concepto o consulta tu libro de texto.`,
    });
  }
}
