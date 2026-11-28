// Configuración central del Corrector. Todo lo ajustable vive acá.

export const CONFIG = {
  // Archivos de instrucciones. El prompt del modelo es la unión de ambos, en este orden.
  instructionFiles: ["./skill/SKILL.md", "./skill/formato-respuesta.md"],

  // Largo máximo de texto aceptado.
  maxChars: 5000,

  providers: {
    // IA gratuita y sin clave. Límite anónimo: ~1 respuesta cada 45 s por IP.
    pollinations: {
      label: "IA",
      url: "https://text.pollinations.ai/openai",
      model: "openai",
      timeoutMs: 45000,
      defaultRetryAfterS: 45,
    },
    // Corrector ortográfico/gramatical basado en reglas. Gratis y sin clave (20 pedidos/min).
    languagetool: {
      label: "Corrector básico",
      url: "https://api.languagetool.org/v2/check",
      languages: ["es-AR", "es"],
      // Solo errores; se ignoran sugerencias de estilo.
      issueTypes: ["misspelling", "grammar", "typographical", "duplication"],
    },
  },
};
