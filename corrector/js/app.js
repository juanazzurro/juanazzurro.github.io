// Interfaz: conecta el formulario con el corrector y muestra los resultados.

import { correct } from "./corrector.js";
import { diffHtml } from "./diff.js";

const $ = (sel, root = document) => root.querySelector(sel);
const form = $("#form");
const input = $("#input");
const out = $("#out");
const submit = $("#submit");
const count = $("#count");

let current = null; // AbortController del pedido en curso

function fromTemplate(id) {
  return $(`#${id}`).content.firstElementChild.cloneNode(true);
}

function show(node) {
  out.replaceChildren(node);
}

function setBusy(busy) {
  submit.disabled = busy;
  submit.innerHTML = busy ? '<span class="spinner"></span> Corrigiendo…' : "Corregir";
}

// --- Estados de la interfaz -------------------------------------------------

function renderOk(engine) {
  const node = fromTemplate("tpl-ok");
  $(".engine", node).textContent = `· ${engine}`;
  show(node);
}

function renderCorrection(original, result, engine) {
  const node = fromTemplate("tpl-result");
  const view = $('[data-role="view"]', node);
  const diff = diffHtml(original, result);
  $(".engine", node).textContent = `· ${engine}`;

  const setView = (mode) => {
    node.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === mode)));
    if (mode === "diff") view.innerHTML = diff;
    else view.textContent = result;
  };
  node.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));

  const copy = $('[data-action="copy"]', node);
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(result);
      copy.textContent = "¡Copiado!";
    } catch {
      copy.textContent = "No se pudo copiar";
    }
    setTimeout(() => (copy.textContent = "Copiar"), 1500);
  });

  setView("diff");
  show(node);
}

function renderError(message) {
  const node = fromTemplate("tpl-error");
  node.textContent = `⚠️ ${message}`;
  show(node);
}

/** Muestra la cuenta regresiva. Resuelve "retry" al terminar o "basic" si el usuario lo elige. */
function waitForTurn(seconds, signal) {
  return new Promise((resolve, reject) => {
    const node = fromTemplate("tpl-wait");
    const label = $('[data-role="seconds"]', node);
    let left = seconds;
    label.textContent = left;

    const timer = setInterval(() => {
      left -= 1;
      label.textContent = Math.max(left, 0);
      if (left <= 0) finish("retry");
    }, 1000);

    const finish = (choice) => {
      clearInterval(timer);
      out.replaceChildren();
      resolve(choice);
    };

    $('[data-action="basic"]', node).addEventListener("click", () => finish("basic"));
    $('[data-action="cancel"]', node).addEventListener("click", () => current?.abort());
    signal.addEventListener("abort", () => {
      clearInterval(timer);
      reject(new DOMException("Cancelado", "AbortError"));
    });

    show(node);
  });
}

// --- Eventos ----------------------------------------------------------------

async function run() {
  const text = input.value;
  if (!text.trim()) {
    input.focus();
    return;
  }
  current?.abort();
  current = new AbortController();
  const { signal } = current;

  setBusy(true);
  out.replaceChildren();
  try {
    const { result, engine } = await correct(text, { onRateLimit: waitForTurn, signal });
    if (signal.aborted) return;
    if (result === "OK") renderOk(engine);
    else renderCorrection(text, result, engine);
  } catch (err) {
    if (current?.signal !== signal) return; // lo reemplazó un pedido más nuevo
    if (err.name === "AbortError") out.replaceChildren();
    else renderError(err.message || "Ocurrió un error inesperado.");
  } finally {
    if (current?.signal === signal) setBusy(false);
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  run();
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    run();
  }
});

input.addEventListener("input", () => {
  const n = input.value.length;
  count.textContent = n ? `${n} caracteres · Ctrl + Enter para corregir` : "Ctrl + Enter para corregir";
});

$("#clear").addEventListener("click", () => {
  current?.abort();
  input.value = "";
  out.replaceChildren();
  input.dispatchEvent(new Event("input"));
  input.focus();
});
