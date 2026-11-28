// Proveedor principal: modelo abierto en Cloudflare Workers AI (vía corrector/worker/worker.js).

import { RateLimitError, ProviderError } from "../errors.js";
import { cleanModelOutput, isOk, looksLikeCorrection } from "../result.js";

export async function correctWithCloudflare(text, { cfg, fetchFn = fetch, signal }) {
  if (!cfg.url) throw new ProviderError("Cloudflare no está configurado.");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  signal?.addEventListener("abort", () => ctrl.abort());

  let res;
  try {
    res = await fetchFn(cfg.url, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ProviderError("El modelo en la nube no respondió.");
  } finally {
    clearTimeout(timer);
  }

  const body = await res.json().catch(() => null);
  if (res.status === 429) throw new RateLimitError(0, body?.error || "Límite diario alcanzado.");
  if (!res.ok) throw new ProviderError(body?.error || `Error ${res.status} del modelo en la nube.`);

  const result = cleanModelOutput(body?.result);
  if (!result) throw new ProviderError("El modelo no devolvió texto.");
  if (isOk(result, text)) return "OK";
  if (!looksLikeCorrection(result, text)) throw new ProviderError("La respuesta del modelo no parece una corrección.");
  return result;
}
