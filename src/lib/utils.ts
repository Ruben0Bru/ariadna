// src/lib/utils.ts
// Utilidades puras — sin dependencias de browser ni de Node para poder
// importarlas tanto desde el cliente como desde rutas API de Next.js.

/**
 * Infiere el grupo experimental a partir del código de participante.
 * Convención: G1-xxx → grupo 1, G2-xxx → grupo 2, G3-xxx → grupo 3.
 * Si el código no sigue la convención se asigna grupo 3 (tutoría completa).
 */
export function inferGroupFromCode(code: string): number {
  const match = code.trim().match(/^[Gg]([123])/);
  return match ? parseInt(match[1]) : 3;
}
