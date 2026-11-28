// Orquesta la corrección: IA primero; si está saturada o falla, corrector básico.

import { CONFIG } from "./config.js";
import { loadInstructions } from "./instructions.js";
import { RateLimitError, ProviderError } from "./errors.js";
import { correctWithPollinations } from "./providers/pollinations.js";
import { correctWithLanguageTool } from "./providers/languagetool.js";
import { cooldown } from "./cooldown.js";

const { pollinations, languagetool } = CONFIG.providers;

/**
 * @param {string} text
 * @param {object} opts
 * @param {(seconds:number, signal:AbortSignal) => Promise<"retry"|"basic">} opts.onRateLimit
 *        La interfaz decide si esperar y reintentar con IA o pasar al corrector básico.
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{result:string, engine:string}>}
 */
export async function correct(text, { onRateLimit, signal }) {
  if (!text.trim()) throw new ProviderError("No hay texto para corregir.");
  if (text.length > CONFIG.maxChars) throw new ProviderError(`El texto supera los ${CONFIG.maxChars} caracteres.`);

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
      console.warn("IA no disponible, se usa el corrector básico:", err);
      break;
    }
  }

  const result = await correctWithLanguageTool(text, { cfg: languagetool });
  return { result, engine: languagetool.label };
}
