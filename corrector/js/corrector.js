// Orquesta la corrección:
//   1. Modelo abierto en Cloudflare (principal).
//   2. IA gratuita de respaldo (Pollinations), con espera si está ocupada.
//   3. Corrector básico (LanguageTool).

import { CONFIG } from "./config.js";
import { loadInstructions } from "./instructions.js";
import { RateLimitError, ProviderError } from "./errors.js";
import { correctWithCloudflare } from "./providers/cloudflare.js";
import { correctWithPollinations } from "./providers/pollinations.js";
import { correctWithLanguageTool } from "./providers/languagetool.js";
import { cooldown } from "./cooldown.js";

const { cloudflare, pollinations, languagetool } = CONFIG.providers;

/**
 * @param {string} text
 * @param {object} opts
 * @param {(seconds:number, signal:AbortSignal) => Promise<"retry"|"basic">} opts.onRateLimit
 *        La interfaz decide si esperar a la IA de respaldo o pasar al corrector básico.
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{result:string, engine:string}>}
 */
export async function correct(text, { onRateLimit, signal }) {
  if (!text.trim()) throw new ProviderError("No hay texto para corregir.");
  if (text.length > CONFIG.maxChars) throw new ProviderError(`El texto supera los ${CONFIG.maxChars} caracteres.`);

  // 1. Principal
  if (cloudflare.url) {
    try {
      const result = await correctWithCloudflare(text, { cfg: cloudflare, signal });
      return { result, engine: cloudflare.label };
    } catch (err) {
      if (signal?.aborted) throw err;
      console.warn("Modelo principal no disponible, se usa el respaldo:", err);
    }
  }

  // 2. Respaldo con IA gratuita
  const instructions = await loadInstructions(CONFIG.instructionFiles);
  while (true) {
    const wait = cooldown.remaining();
    if (wait > 0) {
      const choice = await onRateLimit(wait, signal);
      if (choice === "basic") break;
    }
    try {
      const result = await correctWithPollinations(text, { instructions, cfg: pollinations, signal });
      cooldown.start(pollinations.defaultRetryAfterS);
      return { result, engine: pollinations.label };
    } catch (err) {
      if (signal?.aborted) throw err;
      if (err instanceof RateLimitError) {
        cooldown.start(err.retryAfter);
        continue;
      }
      console.warn("IA de respaldo no disponible, se usa el corrector básico:", err);
      break;
    }
  }

  // 3. Corrector básico
  const result = await correctWithLanguageTool(text, { cfg: languagetool });
  return { result, engine: languagetool.label };
}
