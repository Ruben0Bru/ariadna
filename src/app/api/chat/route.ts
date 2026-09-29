import { NextRequest, NextResponse } from "next/server";

// ── Chat de dudas socrático de Cálculo I ────────────────────────────────────
// RF-11: Este módulo NUNCA evalúa matemáticamente. Solo media pedagógicamente.
// RNF-05: La separación verificador/LLM es verificable: el motor corre en /api/verify.

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
  regla_potencia: "regla de la potencia para derivar: d/dx[xⁿ] = n·xⁿ⁻¹",
  regla_producto: "regla del producto: (uv)' = u'v + uv'",
  regla_cociente: "regla del cociente: (u/v)' = (u'v − uv') / v²",
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
  const isFirstMessage = messages.length === 1;
  const conversationTurns = Math.floor(messages.length / 2);

  const systemPrompt = `Eres Ariadna, tutora socrática de Cálculo I universitario. Tu misión principal es guiar al estudiante a DESCUBRIR las respuestas mediante el razonamiento, no dándole la solución final directamente. Eres paciente, amigable y muy pedagógica.

**CONTEXTO ACTUAL:**
- Tema de la duda: "${currentNodeLabel}" → ${nodeCtx}
${currentExercise ? `- El estudiante está resolviendo este ejercicio: "${currentExercise}"` : ""}

**MÉTODO SOCRÁTICO Y REGLAS DE ORO:**
1. RESPUESTAS CONCEPTUALES PERMITIDAS: Si el estudiante hace una pregunta conceptual directa (ej. "¿Qué es una derivada?", "¿Por qué se multiplican los exponentes?"), DEBES responderla de forma clara y directa, pero sin resolver el ejercicio. Explicar conceptos y razones ("el por qué") es parte fundamental de tutorizar.
2. NO RESUELVAS EL EJERCICIO ACTUAL: Puedes dar ejemplos similares, puedes explicar la teoría, pero nunca le des el resultado final del ejercicio "${currentExercise ?? "actual"}".
3. GUÍA PASO A PASO: Si el estudiante está atascado resolviendo algo, no le des todos los pasos a la vez. Dale un pequeño empujón conceptual o un pequeño paso, y hazle una pregunta para que él concluya lo siguiente.
4. CONFIRMACIÓN: Si en algún punto el estudiante descubre la respuesta a su ejercicio en esta conversación, FELICÍTALO calurosamente y dile explícitamente: "¡Exacto! Ahora escribe esa respuesta en el verificador principal."
5. LÍMITES DE MATERIA: Si el estudiante pregunta sobre matemáticas o cálculo (ej. derivadas, álgebra, geometría básica necesaria), ayúdalo. Solo rechaza (diciendo "Solo puedo ayudarte con Cálculo I") si preguntan cosas completamente fuera de contexto como historia, programación o juegos.
6. FORMATO: Usa Markdown y LaTeX (fórmulas inline con $...$ y bloques con $$...$$). Sé concisa, máximo 150-200 palabras. No saludes repetidamente, ve al grano.`;

  const geminiContents = [
    { parts: [{ text: systemPrompt }], role: "user" as const },
    { parts: [{ text: "Entendido. Seré una tutora socrática, ayudaré con los conceptos y guiaré al estudiante sin darle la respuesta de su ejercicio en bandeja." }], role: "model" as const },
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
          group_id: groupId ?? null,
          turn_number: conversationTurns + 1,
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
      reply: `No pude conectarme al servicio ahora. Mientras, piensa: ¿cuál es el **primer paso** para abordar el tema "${currentNodeLabel}"?`,
    });
  }
}
