// Carga las instrucciones del corrector desde los archivos .md de /skill.

let cache = null;

/** Quita el bloque de metadatos (--- ... ---) del principio de un .md. */
export function stripFrontmatter(md) {
  return md.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
}

export async function loadInstructions(files, fetchFn = fetch) {
  if (cache) return cache;
  const parts = await Promise.all(
    files.map(async (path) => {
      const res = await fetchFn(path, { cache: "no-cache" });
      if (!res.ok) throw new Error(`No se pudieron cargar las instrucciones (${path}).`);
      return stripFrontmatter(await res.text());
    })
  );
  cache = parts.filter(Boolean).join("\n\n");
  return cache;
}
