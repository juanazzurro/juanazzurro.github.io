# ✍️ Corrector

Corrige solo errores de ortografía y gramática en copys. Si no hay errores, responde **OK**.

**Online:** https://juanazzurro.github.io/corrector/ — sin cuentas, sin claves, sin instalar nada.

## Cómo funciona

1. **Modelo abierto `gpt-oss-120b` en Cloudflare Workers AI** (principal). La página le manda el texto a `worker/worker.js`, desplegado en https://corrector.juanazzurro2.workers.dev. El Worker no usa claves: accede al modelo con el binding `AI`, y lee las instrucciones de `skill/` publicadas en este sitio. Uso gratuito diario: 10.000 "neurons" (cientos de correcciones).
2. Si el modelo principal falla, **IA de respaldo** ([Pollinations](https://pollinations.ai), gratis y sin clave, una corrección cada 45 s por conexión, con cuenta regresiva).
3. Si esa también falla, **corrector básico** ([LanguageTool](https://languagetool.org), basado en reglas).

### Actualizar el Worker

Si cambiás `worker/worker.js`, copiá su contenido en Cloudflare → Workers & Pages → `corrector` → Edit code → Deploy. Para cambiar solo las instrucciones no hace falta: el Worker las lee de `skill/` (con 5 minutos de caché).

## Estructura

```
corrector/
├── index.html                 Estructura de la página
├── css/styles.css             Estilos (claro/oscuro automático)
├── skill/
│   ├── SKILL.md               Instrucciones originales del corrector (las de la skill de GPT)
│   └── formato-respuesta.md   Reglas de formato de salida
├── js/
│   ├── config.js              Configuración: servicios, modelo, límites
│   ├── app.js                 Interfaz
│   ├── corrector.js           Orquesta IA → corrector básico
│   ├── instructions.js        Carga las instrucciones desde skill/
│   ├── cooldown.js            Recuerda el turno de la IA gratuita
│   ├── diff.js                Resalta los cambios palabra por palabra
│   ├── result.js              Interpreta y valida la respuesta de la IA
│   ├── errors.js              Tipos de error
│   └── providers/
│       ├── cloudflare.js      Modelo principal (gpt-oss)
│       ├── pollinations.js    IA de respaldo
│       └── languagetool.js    Corrector básico
├── worker/worker.js           Intermediario en Cloudflare Workers AI
└── tests/unit.test.mjs        Tests
```

Sin dependencias ni paso de compilación: son módulos JavaScript nativos que GitHub Pages sirve tal cual.

## Cambiar el comportamiento

- **Qué corrige y cómo:** editá `skill/SKILL.md`. La página lo lee en cada visita, así que alcanza con guardar y subir el cambio.
- **Formato de la respuesta:** `skill/formato-respuesta.md`.
- **Modelo:** lista `MODELS` en `worker/worker.js`.
- **Servicios y límites de la página:** `js/config.js`.

## Probar localmente

```bash
# desde la raíz del repo
python3 -m http.server 8000      # abrir http://localhost:8000/corrector/
node --test corrector/tests/unit.test.mjs
```
