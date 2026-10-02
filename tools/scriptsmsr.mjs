// Leer un `.script` de Master Sword con sus `#include`, y nada más.
//
// Estaba dentro de `tools/guiones.mjs`, que es un EXTRACTOR: importarlo para
// usar dos funciones ejecuta su censo entero de los 2 884 scripts. El 64 lo
// necesitaba desde un segundo extractor —el del guion del jugador— así que la
// parte reutilizable vive aquí y `guiones.mjs` la importa.
//
// La regla del 02 manda igual: los `.script` se quedan en `../MSC/`, lo
// extraído va a `build/`, y no se mueve un byte a `public/`.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { partirGuion } from "../src/play/guion.js";
import { resolverGuion } from "../src/play/cargador.js";

export const RAIZ_POR_OMISION = "../MSC/MSCScripts/scripts";

/**
 * El texto de un script, o `null` si no está.
 *
 * `latin1` y no `utf8` a propósito: los scripts de MSR son de 2005 y llevan
 * bytes altos sueltos que `utf8` convertiría en el carácter de reemplazo.
 */
export function leerScript(ruta, raiz = RAIZ_POR_OMISION) {
  const f = join(raiz, `${ruta}.script`);
  return existsSync(f) ? readFileSync(f, "latin1") : null;
}

/**
 * Carga un script resolviendo cada `#include` **en su sitio**, que es el orden
 * del motor.
 *
 * `#include` llama a `Spawn()` dentro del analizador de líneas, en la línea en
 * que aparece (script.cpp:5229, 5255), así que lo que el archivo escribió antes
 * del `#include` entra antes que la plantilla. Y eso decide partidas, porque
 * `const` gana el PRIMERO (script.cpp:5419-5433) y un objeto de Master Sword
 * está escrito justo para eso: sus números arriba, el `#include` debajo.
 *
 * ── CORRECCIÓN DEL 66 ───────────────────────────────────────────────────────
 *
 * Esto subía TODOS los `#include` al principio, con un comentario que decía «en
 * el sitio en que aparece» y hacía lo contrario. Medido antes de arreglarlo:
 * **416 choques de `const` entre objeto y plantilla en los 300 primeros
 * objetos** —la Rusty Short Sword cogía el daño de `swords_base_onehanded`—.
 * Hay una prueba con el caso mínimo, porque el fallo no da ningún error: da
 * otros números.
 *
 * `vistos` corta los ciclos y además es la lista de archivos que han entrado,
 * que es lo que un extractor quiere poder decir.
 */
export function cargarGuion(ruta, vistos = new Set(), raiz = RAIZ_POR_OMISION) {
  // EL RECORRIDO NO ESTÁ AQUÍ, y es a propósito: el navegador tiene que hacer
  // el mismo con una tabla horneada en vez del disco, y dos copias de esto es
  // lo que el 65 aprendió a no hacer. Lo único de aquí es de dónde sale el
  // texto. `src/play/cargador.js` lleva las citas.
  return resolverGuion(ruta, (r) => {
    const texto = leerScript(r, raiz);
    return texto === null ? null : partirGuion(texto);
  }, vistos);
}
