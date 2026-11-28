// Interpretación de la respuesta del modelo.

/** true si la respuesta significa "no hay errores". */
export function isOk(result, original) {
  const r = result.trim().replace(/^["'«“]+|["'»”.!]+$/g, "").trim();
  return /^ok$/i.test(r) || result.trim() === original.trim();
}

/** Limpia avisos agregados por el servicio y comillas que envuelvan todo el texto. */
export function cleanModelOutput(raw) {
  let r = (raw || "").trim();
  r = r.replace(/\n+\s*(-{3,}|\*{3,})[\s\S]*pollinations[\s\S]*$/i, "").trim();
  if (/^".*"$/s.test(r) && !r.slice(1, -1).includes('"')) r = r.slice(1, -1).trim();
  return r;
}

/**
 * Descarta respuestas que no parecen una corrección del texto original
 * (por ejemplo, si el modelo contestó o reescribió en lugar de corregir).
 */
export function looksLikeCorrection(result, original) {
  const ratio = result.length / Math.max(original.length, 1);
  return ratio >= 0.6 && ratio <= 1.5;
}
