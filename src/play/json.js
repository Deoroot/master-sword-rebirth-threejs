// TRAER UN JSON DE `build/`, que no es `fetch(...).then((r) => r.json())`.
//
// ── El fallo, medido dos veces ────────────────────────────────────────────
//
// **El servidor de desarrollo contesta el `index.html` a lo que no
// encuentra.** Así que un `build/edana/menus.json` que no existe no llega con
// un 404: llega con un **200**, `content-type: text/html` y `<!doctype` dentro.
// `r.ok` dice que sí y el `r.json()` revienta con «Unexpected token '<'», que
// no dice qué archivo falta ni que falte ninguno.
//
// Lo destapó el 47 al dejar entrar `?map=<cualquiera>` —antes la carpeta
// siempre estaba— y se arregló en `main.js` y en `nivel.js`. El 48 encontró
// que quedaban cinco sitios más con el `r.ok ? r.json() : null` de siempre, y
// uno de ellos tumbaba el arranque de Edana entero después de que los seis
// avisos hubieran salido bien. Por eso vive aquí y no copiado en cada sitio:
// un arreglo repetido a mano se queda a medias, y se quedó.
//
// Es puro y no importa nada, como el resto de `src/play/`: `fetch` se puede
// pasar, así que vale también en Node y en una prueba.

/** ¿Es esta respuesta un JSON de verdad, y no el `index.html` del servidor? */
export function esJson(res) {
  return Boolean(res?.ok) && String(res.headers?.get?.("content-type") ?? "").includes("json");
}

/**
 * El JSON de esa ruta, o `null` si no está — **diciendo por qué**.
 *
 * Para todo lo que el juego puede no tener: los bichos de un mapa sin extraer,
 * el catálogo de sonidos, los esquemas de VGUI. Nunca lanza.
 */
export async function traerJson(ruta, { fetch: f = fetch, avisar = console.warn } = {}) {
  let res;
  try { res = await f(ruta); } catch (e) { avisar(`no se pudo pedir ${ruta}: ${e.message}`); return null; }
  if (!res.ok) { avisar(`falta ${ruta} (${res.status})`); return null; }
  if (!esJson(res)) {
    avisar(`falta ${ruta} (el servidor devolvió ${res.headers?.get?.("content-type") || "otra cosa"})`);
    return null;
  }
  try { return await res.json(); } catch { avisar(`${ruta} no es JSON válido`); return null; }
}

/**
 * Lo mismo, pero LANZA. Para lo que sin ello no hay juego: `malla.json`.
 *
 * El mensaje nombra el archivo a propósito: un `SyntaxError` sin ruta cuesta
 * media hora, y la causa casi siempre es «ese mapa no está horneado».
 */
export async function pedirJson(ruta, { fetch: f = fetch } = {}) {
  const res = await f(ruta);
  if (!res.ok) {
    throw new Error(`no se pudo leer ${ruta} (${res.status}). ¿Has ejecutado la extracción de ese mapa? ` +
      `Lo extraído no está en el repositorio a propósito: ver el README.`);
  }
  if (!esJson(res)) {
    throw new Error(`${ruta} no es JSON: el servidor devolvió «${res.headers?.get?.("content-type") ?? ""}». ` +
      `Ese mapa no está extraído en build/ — ver el README.`);
  }
  return res.json();
}
