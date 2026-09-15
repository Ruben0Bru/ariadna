import { NextRequest, NextResponse } from "next/server";

// ── Módulo de mediación pedagógica: proxy seguro hacia Gemini (RF-11, RF-12) ──
// La API key NUNCA se expone al cliente.
// Este módulo NO verifica matemáticamente nada — sólo redacta texto a partir
// del resultado que ya calculó el motor simbólico (RNF-05).

interface FeedbackBody {
  correct: boolean;
  studentAnswer: string;
  exercise: {
    prompt: string;
    failReason: string;
    prereqOnFail?: string;
  };
  targetNodeLabel: string;
  targetNodeUnit: string;
  errorType?: string | null;
  attemptId?: number | null;
  failedAttempts?: number;
}

function buildPrompt(body: FeedbackBody): string {
  const { correct, studentAnswer, exercise, targetNodeLabel, targetNodeUnit, errorType, failedAttempts = 1 } = body;

  const errorTypeLabel: Record<string, string> = {
    no_derivo: "no aplicó la derivada (posiblemente copió la función original)",
    signo: "error de signo en la derivada",
    exponente_o_coeficiente: "error en el cálculo del exponente o el coeficiente",
    constante: "olvidó que la derivada de un término constante aislado es cero",
    desconocido: "error no clasificado automáticamente",
  };
  const errorDesc = errorType ? (errorTypeLabel[errorType] ?? errorType) : null;

  if (correct) {
    return `Eres Ariadna, tutor inteligente de Cálculo.
El motor simbólico (SymPy) YA confirmó que la respuesta es matemáticamente correcta.
Felicita de forma breve y cercana. Indica que puede avanzar. NO uses saludos tipo "¡Hola!". Ocupa máximo 2 líneas.`;
  }

  return `Eres Ariadna, tutor inteligente de Cálculo universitario. Eres quien guía al estudiante (como un hilo en el laberinto), construyendo "andamiaje" (scaffolding) pedagógico, NUNCA dando la respuesta directa.
El motor (SymPy) YA determinó que la respuesta es incorrecta. TÚ NO VERIFICAS NADA MÁS.

Contexto:
- Ejercicio actual: ${exercise.prompt}
- Lo que escribió el estudiante: "${studentAnswer}"
${errorDesc ? `- Tipo de error detectado: ${errorDesc}` : ""}
- Tema que está fallando: "${exercise.failReason}"
- Intentos fallidos en este ejercicio: ${failedAttempts}

Tu tarea es generar la explicación usando EXACTAMENTE Markdown para el formato (viñetas, negritas) y siguiendo esta estructura:
1. Señala qué parte pudo haber fallado (sin decir "¡Hola!" ni saludar, entra directo al grano).
2. Explica CÓMO funciona la regla matemática general que necesita.
3. INVENTA UN EJEMPLO COMPLETAMENTE DIFERENTE Y MUY SENCILLO para ilustrar el concepto paso a paso. Úsalo para que el estudiante vea cómo se hace.
4. (Solo si Intentos >= 2) Da una pista MUY fuerte sobre cómo aplicar lo anterior al ejercicio actual, pero sin resolverlo.
5. Invita a repasar el tema "${targetNodeLabel}".

Reglas estrictas:
- NUNCA uses "Hola" ni te presentes.
- NUNCA resuelvas el ejercicio ${exercise.prompt}. Poner el resultado rompe el sistema.
- Usa formato Markdown legible.
- Mantén el tono socrático y cercano, generando fricción sana.`;
}


export async function POST(req: NextRequest) {
  let body: FeedbackBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  // Fallback estático si no hay key configurada — texto pedagógico útil sin Gemini
  if (!apiKey) {
    const fallback = body.correct
      ? "¡Muy bien! Tu derivada es correcta — puedes avanzar al siguiente nodo del grafo."
      : `Tu respuesta aún no es correcta. El motor simbólico detectó una posible dificultad con: ${body.exercise.failReason}. Te recomiendo repasar el nodo "${body.targetNodeLabel}" (${body.targetNodeUnit}) y volver a intentarlo — entender ese prerrequisito es clave para este tipo de ejercicio.`;
    return NextResponse.json({ message: fallback });
  }

  const prompt = buildPrompt(body);

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 300,
            temperature: 0.4,
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
      console.error("[Ariadna/feedback] Gemini API error:", errText);
      throw new Error("Gemini API error");
    }

    const data = await geminiRes.json();
    const message: string =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? "")
        .join("")
        .trim() ?? "";

    if (!message) throw new Error("Gemini devolvió respuesta vacía");

    return NextResponse.json({ message });
  } catch (e) {
    console.error("[Ariadna/feedback] Error:", e);
    const fallback = body.correct
      ? "¡Muy bien! Tu derivada es correcta — puedes avanzar al siguiente nodo del grafo."
      : `Tu respuesta aún no es correcta. Revisa el prerrequisito: ${body.exercise.failReason}. Visita el nodo "${body.targetNodeLabel}" antes de reintentar.`;
    return NextResponse.json({ message: fallback });
  }
}
