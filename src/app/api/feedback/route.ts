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
    no_derivo: "no aplicó la derivada (posiblemente copió la función original sin diferenciar)",
    signo: "error de signo en la derivada",
    constante: "olvidó que la derivada de un término constante es cero",
    desconocido: "error no clasificado automáticamente",
  };
  const errorDesc = errorType ? (errorTypeLabel[errorType] ?? errorType) : null;

  if (correct) {
    return `Eres Ariadna, tutor de Cálculo I. El motor matemático YA confirmó que la respuesta es CORRECTA.
Felicita de forma breve, cercana y motivadora. Máximo 2 líneas. No saludes, entra directo.
Si el estudiante cometió varios errores antes de acertar, resalta su persistencia.`;
  }

  // Nivel de andamiaje según intentos fallidos (RF-12 escalada)
  const level = Math.min(failedAttempts, 3);

  const levelInstructions: Record<number, string> = {
    1: `## Nivel de Ayuda: CONCEPTUAL (1er intento fallido)
Tu misión es hacer que el estudiante RECUERDE el concepto general, sin ninguna referencia al ejercicio específico.
1. Señala brevemente qué tipo de error cometió (usa el tipo de error si está disponible).
2. Recuerda la regla matemática general que aplica: "${exercise.failReason}".
3. Termina con una pregunta socrática abierta: ej. "¿Cuál debería ser el primer paso aquí?"
NO des pasos específicos del ejercicio. NO des ejemplos del ejercicio.`,

    2: `## Nivel de Ayuda: PROCEDIMENTAL (2do intento fallido)
El estudiante ya sabe el concepto pero sigue fallando. Dale estructura procedimental.
1. Recuerda el error detectado.
2. Inventa un ejemplo DIFERENTE al ejercicio actual, más simple, y resuélvelo PASO A PASO completo.
3. Explica cómo los mismos pasos aplican aquí (sin resolver el ejercicio actual).
4. Cierra con: "Ahora aplica esos mismos pasos a tu ejercicio."`,

    3: `## Nivel de Ayuda: CASI-SOLUCIÓN (3er intento o más)
El estudiante está bloqueado significativamente. Dale un andamio muy concreto.
1. Indica exactamente en qué paso está fallando, con números específicos del ejercicio.
2. Escribe la estructura "molde" parcialmente resuelta, dejando UN solo paso para que el estudiante complete:
   Ejemplo del molde: "f'(x) = 3·__ · x^(3-1) - 5·... = ?"
3. Di que con este paso ya puede completar la respuesta.
4. NO reveles la respuesta final completa.`,
  };

  return `Eres Ariadna, tutor socrático de Cálculo I universitario. Tu rol es guiar, nunca resolver.
El motor matemático YA determinó que la respuesta es INCORRECTA. Tu tarea es solo el andamiaje pedagógico.

**Contexto del error:**
- Ejercicio: ${exercise.prompt}
- Respuesta del estudiante: "${studentAnswer}"
${errorDesc ? `- Tipo de error detectado automáticamente: ${errorDesc}` : ""}
- Tema de dificultad: "${exercise.failReason}"
- Si falla mucho, el nodo de repaso sugerido es: "${targetNodeLabel}" (${targetNodeUnit})
- Intentos fallidos: ${failedAttempts}

${levelInstructions[level]}

**Reglas absolutas:**
- NUNCA saludes ni te presentes. Entra directo al contenido.
- NUNCA resuelvas el ejercicio "${exercise.prompt}" completamente.
- Usa Markdown (negritas, viñetas) y LaTeX con $...$ para fórmulas.
- Tono: cercano, socrático, alentador. Máximo 250 palabras.`;
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
      throw new Error(`Gemini API error ${geminiRes.status}: ${errText}`);
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
