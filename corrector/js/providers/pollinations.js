// Proveedor de IA: Pollinations (gratis, sin clave, con límite por IP).

import { RateLimitError, ProviderError } from "../errors.js";
import { cleanModelOutput, isOk, looksLikeCorrection } from "../result.js";

/** Extrae los segundos de espera de un error FREE_LIMIT ("Retry after 34s"). */
export function parseRetryAfter(body, headers, fallback) {
  const header = Number(headers?.get?.("retry-after"));
  if (header > 0) return Math.ceil(header);
  const m = /retry after\s+(\d+)\s*s/i.exec(body?.error?.message || "");
  return m ? Number(m[1]) : fallback;
}

export async function correctWithPollinations(text, { instructions, cfg, fetchFn = fetch, signal }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  signal?.addEventListener("abort", () => ctrl.abort());

  let res;
  try {
    res = await fetchFn(cfg.url, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        private: true,
        referrer: "corrector",
        messages: [
          { role: "system", content: instructions },
          { role: "user", content: text },
        ],
      }),
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ProviderError("La IA no respondió a tiempo.");
  } finally {
    clearTimeout(timer);
  }

  const body = await res.json().catch(() => null);

  if (res.status === 402 || res.status === 429) {
    throw new RateLimitError(parseRetryAfter(body, res.headers, cfg.defaultRetryAfterS));
  }
  if (!res.ok) throw new ProviderError(`La IA respondió con error ${res.status}.`);

  const result = cleanModelOutput(body?.choices?.[0]?.message?.content);
  if (!result) throw new ProviderError("La IA no devolvió texto.");
  if (isOk(result, text)) return "OK";
  if (!looksLikeCorrection(result, text)) throw new ProviderError("La respuesta de la IA no parece una corrección.");
  return result;
}
