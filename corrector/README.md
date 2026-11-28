# ✍️ Corrector

Corrige solo errores de ortografía y gramática en copys. Si no hay errores, responde **OK**.

**Online:** https://juanazzurro.github.io/corrector/ — sin cuentas, sin claves, sin instalar nada.

## Cómo funciona

1. **IA** ([Pollinations](https://pollinations.ai), gratis y sin clave) corrige siguiendo las instrucciones de `skill/`.
2. Si la IA está ocupada o falla, se usa un **corrector básico** ([LanguageTool](https://languagetool.org), basado en reglas).

La IA gratuita permite **una corrección cada 45 segundos por conexión a internet** (personas en la misma red de oficina comparten ese turno). Mientras tanto, la página muestra una cuenta regresiva, reintenta sola y ofrece usar el corrector básico sin esperar.

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
│       ├── pollinations.js    IA
│       └── languagetool.js    Corrector básico
└── tests/unit.test.mjs        Tests
```

Sin dependencias ni paso de compilación: son módulos JavaScript nativos que GitHub Pages sirve tal cual.

## Cambiar el comportamiento

- **Qué corrige y cómo:** editá `skill/SKILL.md`. La página lo lee en cada visita, así que alcanza con guardar y subir el cambio.
- **Formato de la respuesta:** `skill/formato-respuesta.md`.
- **Modelo, límites o servicios:** `js/config.js`.

## Probar localmente

```bash
# desde la raíz del repo
python3 -m http.server 8000      # abrir http://localhost:8000/corrector/
node --test corrector/tests/unit.test.mjs
```
