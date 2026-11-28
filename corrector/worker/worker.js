/**
 * Corrector — intermediario en Cloudflare Workers AI.
 *
 * Ejecuta un modelo abierto en la nube de Cloudflare. No usa claves: el modelo
 * se accede con el binding `AI` del propio Worker.
 *
 * Las instrucciones NO están acá: se leen de los archivos skill/*.md publicados
 * en GitHub Pages, así que hay un único lugar para editarlas.
 *
 * Configuración en Cloudflare:
 *   - Binding de Workers AI con el nombre: AI   (obligatorio)
 */

const SITE = "https://juanazzurro.github.io";
const INSTRUCTION_FILES = [`${SITE}/corrector/skill/SKILL.md`, `${SITE}/corrector/skill/formato-respuesta.md`];

// Modelos abiertos, en orden de preferencia. Si uno falla se prueba el siguiente.
const MODELS = ["@cf/openai/gpt-oss-120b", "@cf/meta/llama-3.3-70b-instruct-fp8-fast"];

const MAX_CHARS = 5000;
const INSTRUCTIONS_TTL_S = 300;

export default {
  async fetch(request, env, ctx) {
    const cors = {
      "Access-Control-Allow-Origin": SITE,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method === "GET") return json({ ok: true, service: "corrector", models: MODELS }, 200, cors);
    if (request.method !== "POST") return json({ error: "Método no permitido." }, 405, cors);

    const origin = request.headers.get("Origin");
    if (origin && origin !== SITE) return json({ error: "Origen no permitido." }, 403, cors);

    let text;
    try {
      ({ text } = await request.json());
    } catch {
      return json({ error: "Pedido inválido." }, 400, cors);
    }
    if (typeof text !== "string" || !text.trim()) return json({ error: "No hay texto para corregir." }, 400, cors);
    if (text.length > MAX_CHARS) return json({ error: `El texto supera los ${MAX_CHARS} caracteres.` }, 413, cors);
    if (!env.AI) return json({ error: "Falta el binding de Workers AI (AI)." }, 500, cors);

    let instructions;
    try {
      instructions = await loadInstructions(ctx);
    } catch (err) {
      return json({ error: err.message }, 502, cors);
    }

    let lastError;
    for (const model of MODELS) {
      try {
        const out = await env.AI.run(model, {
          messages: [
            { role: "system", content: instructions },
            { role: "user", content: text },
          ],
          temperature: 0,
          max_tokens: 4096,
          ...(model.includes("gpt-oss") ? { reasoning: { effort: "low" } } : {}),
        });
        const result = extractText(out);
        if (result) return json({ result, model }, 200, cors);
        lastError = new Error("El modelo no devolvió texto.");
      } catch (err) {
        lastError = err;
      }
    }

    const quota = /limit|quota|neuron|429|exceed/i.test(String(lastError?.message));
    return json(
      { error: quota ? "Se alcanzó el uso gratuito diario." : "El modelo no está disponible.", detail: String(lastError?.message || "") },
      quota ? 429 : 502,
      cors
    );
  },
};

/** Devuelve el texto de la respuesta, sea cual sea el formato del modelo. */
export function extractText(out) {
  if (!out) return "";
  if (typeof out === "string") return out.trim();
  if (typeof out.response === "string") return out.response.trim();
  const choice = out.choices?.[0]?.message?.content;
  if (typeof choice === "string") return choice.trim();
  if (Array.isArray(out.output)) {
    return out.output
      .filter((item) => item.type === "message")
      .flatMap((item) => item.content || [])
      .filter((c) => c.type === "output_text" && c.text)
      .map((c) => c.text)
      .join("")
      .trim();
  }
  return "";
}

export function stripFrontmatter(md) {
  return md.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
}

async function loadInstructions(ctx) {
  const parts = await Promise.all(
    INSTRUCTION_FILES.map(async (url) => {
      const res = await fetch(url, { cf: { cacheTtl: INSTRUCTIONS_TTL_S, cacheEverything: true } });
      if (!res.ok) throw new Error(`No se pudieron cargar las instrucciones (${res.status}).`);
      return stripFrontmatter(await res.text());
    })
  );
  return parts.filter(Boolean).join("\n\n");
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...headers, "content-type": "application/json; charset=utf-8" },
  });
}
