// REHACER EL MAPA DE LUZ cuando se mueve el brillo o la gamma.
//
// Es lo único que hace el motor al cambiarlos —`R_GammaChanged(false)` llama a
// `GL_RebuildLightmaps()` y a nada más, `ref/gl/gl_rmain.c:1017-1021`—, así que
// es lo único que se hace aquí. La tabla que lleva un atlas de una gamma a otra
// la calcula `remapearLuz()` en `src/bsp/gamma.js`, que es donde vive
// `BuildGammaTable()`; esto sólo la pasa por los píxeles.
//
// ── Se guarda el original, y no se remapea lo ya remapeado ─────────────────
//
// Cada textura de atlas conserva su imagen recién descargada en
// `userData.original`. Encadenar remapeos —de 2 a 1 y de 1 a 3— perdería un
// poco en cada salto y el mapa se iría oscureciendo cada vez que alguien toca
// el deslizador. Se remapea SIEMPRE desde el horneado, que es lo que hace el
// motor: reconstruye desde el lump, no desde lo que había en la tarjeta.

import { remapearLuz } from "../bsp/gamma.js";

/** Si la tabla es la identidad no hay nada que hacer, y se dice. */
export function esIdentidad(lut) {
  for (let v = 0; v < 256; v++) if (lut[v] !== v) return false;
  return true;
}

function original(tex) {
  if (!tex.userData.originalDeLuz) tex.userData.originalDeLuz = tex.image;
  return tex.userData.originalDeLuz;
}

/**
 * Pasa la tabla por una textura de atlas, en su sitio.
 *
 * Se cambia el `image` y se marca `needsUpdate`: el objeto textura es el mismo,
 * así que los materiales que ya lo tienen puesto —y son todos— no hay que
 * tocarlos. Si hubiera que cambiar la textura, habría que perseguir también las
 * variantes del parpadeo, que se reparten sola `animarLuz()`.
 */
export function remapearTextura(tex, lut) {
  const orig = original(tex);
  if (!orig?.width) return false;
  if (esIdentidad(lut)) {
    if (tex.image !== orig) { tex.image = orig; tex.needsUpdate = true; }
    return true;
  }
  const lienzo = tex.userData.lienzoDeLuz ?? (tex.userData.lienzoDeLuz = document.createElement("canvas"));
  lienzo.width = orig.width;
  lienzo.height = orig.height;
  const g = lienzo.getContext("2d", { willReadFrequently: true });
  if (!g) return false;
  g.drawImage(orig, 0, 0);
  const d = g.getImageData(0, 0, lienzo.width, lienzo.height);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    p[i] = lut[p[i]];
    p[i + 1] = lut[p[i + 1]];
    p[i + 2] = lut[p[i + 2]];
  }
  g.putImageData(d, 0, 0);
  tex.image = lienzo;
  tex.needsUpdate = true;
  return true;
}

/**
 * Los 25 atlas de Gate City —uno por cubo de estilos y uno por variante del
 * parpadeo— con la gamma nueva.
 *
 * `mapa` es lo que devuelve `cargarMapaDeLuz()`. Devuelve cuántas texturas se
 * han tocado, para que la sonda lo mire en vez de fiarse de la captura.
 */
export function rehacerMapaDeLuz(mapa, viejos, nuevos) {
  if (!mapa?.cubos) return { texturas: 0, identidad: true };
  const lut = remapearLuz(viejos, nuevos);
  const identidad = esIdentidad(lut);
  let texturas = 0;
  for (const c of mapa.cubos.values()) {
    for (const t of c.texturas) if (remapearTextura(t, lut)) texturas++;
  }
  return { texturas, identidad, lut };
}
