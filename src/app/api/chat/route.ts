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
  groupId?: number;              // Grupo experimental (para lógica diferenciada)
  studentId?: string;            // UUID del estudiante (para logs)
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

  const { messages, currentNode, currentNodeLabel, currentExercise, groupId = 3, studentId } = body;

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

  // Lógica diferenciada por grupo experimental (RF-15 y RF-13)
  const isStrictTutor = groupId === 2 || groupId === 3;

  const rules = isStrictTutor
    ? `3. NUNCA resuelvas directamente el ejercicio que el estudiante está haciendo (si se menciona). En cambio, guía al estudiante con pistas socráticas o explica el concepto general con un ejemplo DIFERENTE.\n4. Si el estudiante pide la respuesta del ejercicio actual, niégate educadamente y ofrécele ayuda paso a paso.`
    : `3. Eres un tutor liberal. Si el estudiante te pide la respuesta o que resuelvas el ejercicio que está haciendo "${currentExercise}", PUEDES RESOLVERLO paso a paso y darle la respuesta final sin restricciones.`;

  // Construir el system prompt de contexto
  const systemPrompt = `Eres Ariadna, tutora de Cálculo I universitario. Tu misión secundaria es ayudar al estudiante a entender.

**CONTEXTO DEL ESTUDIANTE:**
- Nodo activo: "${currentNodeLabel}" (${nodeCtx})
${currentExercise ? `- Ejercicio actual que está resolviendo: "${currentExercise}"` : ""}
- Tu comportamiento (Módulo Experimental): ${isStrictTutor ? "TUTOR SOCRÁTICO ESTRICTO" : "ASISTENTE DIRECTO LIBERAL"}

**REGLAS ESTRICTAS:**
1. Solo respondes preguntas de matemáticas, específicamente de Cálculo I y sus prerrequisitos algebraicos.
2. Si el estudiante pregunta algo fuera de matemáticas (como juegos, clima o cosas de la API), responde: "Solo puedo ayudarte con dudas de Cálculo I y álgebra."
${rules}
5. Usa formato Markdown y LaTeX con $...$ para fórmulas inline y $$...$$ para ecuaciones en bloque.
6. Sé conciso: máximo 200 palabras por respuesta.`;

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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
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

    // =========================================================================
    // LOGGER DE CHAT EN BASE DE DATOS (NUEVO)
    // =========================================================================
    try {
      // Intentamos extraer el studentId del último mensaje o usar un fallback temporal
      // ya que body no tiene explícitamente studentId todavía (requeriría actializar App.tsx)
      const { studentId } = body;
      const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (studentId && supabaseUrl && supabaseKey) {
        const { createClient } = require("@supabase/supabase-js");
        const sb = createClient(supabaseUrl, supabaseKey);
        
        // Log fire-and-forget
        sb.from("chat_logs").insert({
          student_id: studentId,
          node_context: currentNode,
          user_prompt: messages[messages.length - 1].content,
          ai_response: reply
        }).then(({ error }: any) => {
          if (error) console.error("[Ariadna/chat] Supabase insert error:", error);
        });
      }
    } catch (e) {
      console.error("[Ariadna/chat] Fallo al loguear en BD:", e);
    }

    return NextResponse.json({ reply });
  } catch (e) {
    console.error("[Ariadna/chat] Error:", e);
    return NextResponse.json({
      reply: `No pude conectarme al servicio en este momento. Recuerda que el tema es **${currentNodeLabel}** — intenta consultar la tarjeta de concepto del nodo.`,
    });
  }
}
