// Corrector básico: LanguageTool (reglas, gratis, sin clave).

import { RateLimitError, ProviderError } from "../errors.js";

/** Aplica la primera sugerencia de cada error, sin superponer correcciones. */
export function applyMatches(text, matches, issueTypes) {
  const keep = new Set(issueTypes);
  const fixes = matches
    .filter((m) => m.replacements?.length && keep.has(m.rule?.issueType))
    .sort((a, b) => a.offset - b.offset);
  let out = "";
  let pos = 0;
  for (const m of fixes) {
    if (m.offset < pos) continue;
    out += text.slice(pos, m.offset) + m.replacements[0].value;
    pos = m.offset + m.length;
  }
  return out + text.slice(pos);
}

export async function correctWithLanguageTool(text, { cfg, fetchFn = fetch }) {
  for (const language of cfg.languages) {
    let res;
    try {
      res = await fetchFn(cfg.url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ text, language, level: "default" }),
      });
    } catch {
      throw new ProviderError("No se pudo conectar con el corrector básico.");
    }
    if (res.status === 429) throw new RateLimitError(60);
    if (!res.ok) continue; // idioma no soportado: probar el siguiente
    const data = await res.json();
    const corrected = applyMatches(text, data.matches || [], cfg.issueTypes);
    return corrected === text ? "OK" : corrected;
  }
  throw new ProviderError("El corrector básico no está disponible ahora.");
}
