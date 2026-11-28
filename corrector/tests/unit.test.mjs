// Tests unitarios. Ejecutar con: node --test corrector/tests/unit.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { diffHtml } from "../js/diff.js";
import { isOk, cleanModelOutput, looksLikeCorrection } from "../js/result.js";
import { stripFrontmatter } from "../js/instructions.js";
import { applyMatches } from "../js/providers/languagetool.js";
import { parseRetryAfter, correctWithPollinations } from "../js/providers/pollinations.js";
import { RateLimitError, ProviderError } from "../js/errors.js";

const json = (status, body) => async () => new Response(JSON.stringify(body), { status });
const cfg = { url: "x", model: "openai", timeoutMs: 1000, defaultRetryAfterS: 45 };

test("diff marca palabras cambiadas y escapa HTML", () => {
  assert.equal(diffHtml("hola mundo", "hola mundo"), "hola mundo");
  assert.equal(diffHtml("el parke", "el parque"), "el <del>parke</del><ins>parque</ins>");
  assert.equal(diffHtml("a <b>", "a <b>!"), "a <del>&lt;b&gt;</del><ins>&lt;b&gt;!</ins>");
});

test("isOk reconoce variantes de OK y textos sin cambios", () => {
  for (const r of ["OK", "ok.", '"OK"', " OK! "]) assert.ok(isOk(r, "texto"));
  assert.ok(isOk("texto", "texto"));
  assert.ok(!isOk("Texto corregido", "texto"));
});

test("cleanModelOutput quita avisos y comillas envolventes", () => {
  assert.equal(cleanModelOutput("Hola.\n\n---\nPowered by Pollinations.AI"), "Hola.");
  assert.equal(cleanModelOutput('"Hola mundo."'), "Hola mundo.");
  assert.equal(cleanModelOutput('Dijo "sí" y "no"'), 'Dijo "sí" y "no"');
});

test("looksLikeCorrection descarta respuestas desproporcionadas", () => {
  assert.ok(looksLikeCorrection("Hola mundo.", "Hola mundo"));
  assert.ok(!looksLikeCorrection("Claro, acá tenés una explicación muy larga de todo lo que cambié…", "Hola"));
});

test("stripFrontmatter elimina metadatos del SKILL.md", () => {
  assert.equal(stripFrontmatter("---\nname: x\n---\n\nInstrucciones"), "Instrucciones");
  assert.equal(stripFrontmatter("Sin metadatos"), "Sin metadatos");
});

test("applyMatches aplica solo errores y evita superposiciones", () => {
  const text = "Los chicos fueron al parke";
  const matches = [
    { offset: 21, length: 5, replacements: [{ value: "parque" }], rule: { issueType: "misspelling" } },
    { offset: 21, length: 2, replacements: [{ value: "XX" }], rule: { issueType: "misspelling" } },
    { offset: 11, length: 6, replacements: [{ value: "marcharon" }], rule: { issueType: "style" } },
  ];
  assert.equal(applyMatches(text, matches, ["misspelling"]), "Los chicos fueron al parque");
});

test("parseRetryAfter lee el mensaje FREE_LIMIT de Pollinations", () => {
  const body = { error: { message: "Free limit reached: 1 reply every 45 seconds per IP. Retry after 34s, or ..." } };
  assert.equal(parseRetryAfter(body, new Headers(), 45), 34);
  assert.equal(parseRetryAfter({}, new Headers({ "retry-after": "12" }), 45), 12);
  assert.equal(parseRetryAfter(null, new Headers(), 45), 45);
});

test("Pollinations: OK, corrección, límite y respuestas inválidas", async () => {
  const ok = { choices: [{ message: { content: "OK" } }] };
  const fix = { choices: [{ message: { content: "El parque." } }] };
  const limit = { error: { message: "Retry after 20s" } };
  const opts = (fetchFn) => ({ instructions: "x", cfg, fetchFn });

  assert.equal(await correctWithPollinations("El parque.", opts(json(200, ok))), "OK");
  assert.equal(await correctWithPollinations("El parke.", opts(json(200, fix))), "El parque.");
  await assert.rejects(correctWithPollinations("El parke.", opts(json(402, limit))), (e) => e instanceof RateLimitError && e.retryAfter === 20);
  await assert.rejects(correctWithPollinations("El parke.", opts(json(500, {}))), ProviderError);
  const chatty = { choices: [{ message: { content: "Claro, con gusto te ayudo a corregir este texto. Aquí está la versión revisada." } }] };
  await assert.rejects(correctWithPollinations("El parke.", opts(json(200, chatty))), ProviderError);
});

import { correctWithCloudflare } from "../js/providers/cloudflare.js";
import worker from "../worker/worker.js";

test("Cloudflare: OK, corrección, límite diario y error", async () => {
  const cf = { url: "https://w", timeoutMs: 1000 };
  const opts = (fetchFn) => ({ cfg: cf, fetchFn });
  assert.equal(await correctWithCloudflare("El parque.", opts(json(200, { result: "OK" }))), "OK");
  assert.equal(await correctWithCloudflare("El parke.", opts(json(200, { result: "El parque." }))), "El parque.");
  await assert.rejects(correctWithCloudflare("x", opts(json(429, { error: "límite" }))), RateLimitError);
  await assert.rejects(correctWithCloudflare("x", opts(json(502, { error: "caído" }))), ProviderError);
  await assert.rejects(correctWithCloudflare("x", { cfg: { url: "" } }), ProviderError);
});

test("worker: usa el modelo, lee skill/ y entiende sus formatos de respuesta", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => new Response(url.endsWith("SKILL.md") ? "---\nname: x\n---\nCorregí." : "Formato.");
  const site = "https://juanazzurro.github.io";
  const call = async (aiOut, origin = site) => {
    let seen;
    const env = { AI: { run: async (model, input) => { seen = input; if (aiOut instanceof Error) throw aiOut; return aiOut; } } };
    const req = new Request("https://w", { method: "POST", headers: { Origin: origin, "content-type": "application/json" }, body: JSON.stringify({ text: "El parke." }) });
    const res = await worker.fetch(req, env, {});
    return { status: res.status, body: await res.json(), seen };
  };
  try {
    let r = await call({ response: " El parque. " });
    assert.equal(r.body.result, "El parque.");
    assert.equal(r.seen.messages[0].content, "Corregí.\n\nFormato.");
    assert.equal((await call({ choices: [{ message: { content: "OK" } }] })).body.result, "OK");
    r = await call({ output: [{ type: "reasoning", content: [] }, { type: "message", content: [{ type: "output_text", text: "Hola" }] }] });
    assert.equal(r.body.result, "Hola");
    assert.equal((await call(new Error("daily neuron limit exceeded"))).status, 429);
    assert.equal((await call({ response: "x" }, "https://otro.com")).status, 403);
    assert.equal(r.body.model, undefined, "no expone detalles internos");
    const err = await call(new Error("internal account 123 failure"));
    assert.equal(err.status, 502);
    assert.ok(!JSON.stringify(err.body).includes("123"), "no filtra el error interno");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("worker: rechaza pedidos sin Origin, sin JSON y aplica límite por IP", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("Instrucciones.");
  const env = { AI: { run: async () => ({ response: "OK" }) } };
  const req = (headers, body = JSON.stringify({ text: "Hola" })) => new Request("https://w", { method: "POST", headers, body });
  try {
    assert.equal((await worker.fetch(req({ "content-type": "application/json" }), env)).status, 403);
    assert.equal((await worker.fetch(req({ Origin: "https://juanazzurro.github.io", "content-type": "text/plain" }), env)).status, 415);
    const h = { Origin: "https://juanazzurro.github.io", "content-type": "application/json", "CF-Connecting-IP": "9.9.9.9" };
    const codes = [];
    for (let i = 0; i < 17; i++) codes.push((await worker.fetch(req(h), env)).status);
    assert.deepEqual([codes[0], codes[14], codes[15]], [200, 200, 429]);
    const r = await worker.fetch(req(h), env);
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  } finally {
    globalThis.fetch = realFetch;
  }
});
