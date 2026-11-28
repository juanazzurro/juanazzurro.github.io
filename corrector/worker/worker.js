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
const MAX_BODY_BYTES = 32 * 1024;
const INSTRUCTIONS_TTL_S = 300;

// Límite por IP (mejor esfuerzo: se cuenta por instancia del Worker). Frena abusos casuales.
const RATE_LIMIT = { max: 15, windowMs: 60_000 };
const hits = new Map();

function rateLimited(ip, now = Date.now()) {
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_LIMIT.windowMs);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > RATE_LIMIT.max;
}

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": SITE,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };
    const reply = (obj, status) => json(obj, status, cors);

    // Solo se aceptan pedidos que vienen de la página del Corrector.
    if (request.headers.get("Origin") !== SITE) return reply({ error: "Origen no permitido." }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors, ...SECURITY_HEADERS } });
    if (request.method !== "POST") return reply({ error: "Método no permitido." }, 405);
    if (!(request.headers.get("content-type") || "").includes("application/json")) return reply({ error: "Pedido inválido." }, 415);
    if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) return reply({ error: "Pedido demasiado grande." }, 413);

    const ip = request.headers.get("CF-Connecting-IP") || "?";
    if (rateLimited(ip)) return reply({ error: "Demasiados pedidos seguidos. Esperá un minuto." }, 429);

    let text;
    try {
      const raw = await request.text();
      if (raw.length > MAX_BODY_BYTES) return reply({ error: "Pedido demasiado grande." }, 413);
      ({ text } = JSON.parse(raw));
    } catch {
      return reply({ error: "Pedido inválido." }, 400);
    }
    if (typeof text !== "string" || !text.trim()) return reply({ error: "No hay texto para corregir." }, 400);
    if (text.length > MAX_CHARS) return reply({ error: `El texto supera los ${MAX_CHARS} caracteres.` }, 413);
    if (!env.AI) {
      console.error("Falta el binding AI");
      return reply({ error: "El servicio no está disponible." }, 500);
    }

    let instructions;
    try {
      instructions = await loadInstructions();
    } catch (err) {
      console.error("Instrucciones:", err);
      return reply({ error: "El servicio no está disponible." }, 502);
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
        if (result) return reply({ result }, 200);
        lastError = new Error("El modelo no devolvió texto.");
      } catch (err) {
        lastError = err;
      }
    }

    // El detalle técnico queda en los registros del Worker, no en la respuesta pública.
    console.error("Modelos no disponibles:", lastError);
    const quota = /limit|quota|neuron|429|3036|exceed/i.test(String(lastError?.message));
    return reply({ error: quota ? "Se alcanzó el uso gratuito diario." : "El modelo no está disponible." }, quota ? 429 : 502);
  },
};

/** Devuelve el texto de la respuesta, sea cual sea el formato del modelo. */
function extractText(out) {
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

function stripFrontmatter(md) {
  return md.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
}

async function loadInstructions() {
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
    headers: { ...headers, ...SECURITY_HEADERS, "content-type": "application/json; charset=utf-8" },
  });
}
