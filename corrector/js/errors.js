/** El servicio aceptaría el pedido, pero hay que esperar `retryAfter` segundos. */
export class RateLimitError extends Error {
  constructor(retryAfter, message = "Límite de uso alcanzado.") {
    super(message);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

/** El servicio no está disponible o respondió algo inutilizable. */
export class ProviderError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProviderError";
  }
}
