// Recuerda cuándo se puede volver a usar la IA gratuita (sobrevive a recargas de la página).

const KEY = "corrector:ai-next-at";

function read() {
  try {
    return Number(localStorage.getItem(KEY)) || 0;
  } catch {
    return memory;
  }
}
function write(v) {
  memory = v;
  try {
    localStorage.setItem(KEY, String(v));
  } catch {}
}
let memory = 0;

export const cooldown = {
  /** Segundos que faltan para poder pedir de nuevo (0 si ya se puede). */
  remaining(now = Date.now()) {
    return Math.max(0, Math.ceil((read() - now) / 1000));
  },
  start(seconds, now = Date.now()) {
    write(now + seconds * 1000);
  },
};
