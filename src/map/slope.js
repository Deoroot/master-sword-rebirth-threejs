// Campo de alturas CONTINUO, en los vertices de una rejilla.
//
// Es la pieza que comparten las dos formas de tener un suelo que no es plano:
//
//   rampas   cada celda se emite como dos prismas triangulares cuya cara de
//            arriba pasa por las alturas de sus esquinas. Sigue siendo un .map
//            de brushes y qbsp sigue siendo el juez.
//   malla    las mismas alturas se sacan como triangulos y se le dan tal cual
//            a Three.js y a Rapier. No hay .map, y por tanto tampoco qbsp.
//
// La diferencia con relief.js es donde vive la altura. Alli vive en la CELDA
// -una celda entera esta a una cota, y entre dos celdas hay un escalon-; aqui
// vive en la ESQUINA, y la celda es lo que queda entre cuatro esquinas, o sea
// una superficie inclinada. Por eso alli el resultado son terrazas y aqui una
// pendiente.
//
// Lo que este archivo garantiza, igual que relief.js garantizaba el escalon:
// **dos esquinas vecinas nunca se llevan mas de `maxDrop`**, que es la
// pendiente maxima que el jugador puede subir. No porque el ruido salga suave,
// sino porque despues se baja hasta que se cumple, y hay una funcion que lo
// comprueba.

import { fbm } from "../util/noise.js";

// 40 grados, no 46. El controlador de Rapier esta puesto a 46
// (PLAYER.maxSlopeDeg) y dejar el terreno justo en el limite significa que
// cualquier redondeo deja una ladera por la que el jugador resbala sin motivo
// aparente. Seis grados de margen cuestan nada y quitan un fallo intermitente.
export const MAX_SLOPE_DEG = 40;

/**
 * Alturas en las esquinas de una rejilla de w x h celdas.
 *
 * Una rejilla de w x h celdas tiene (w+1) x (h+1) esquinas. Las esquinas son
 * compartidas entre celdas vecinas a proposito: es lo que hace que dos celdas
 * contiguas encajen sin rendija, tanto en brushes como en malla.
 *
 * @param {number} w celdas a lo ancho
 * @param {number} h celdas de fondo
 * @param {{cell?: number, range?: number, wavelength?: number, seed?: number,
 *          maxSlopeDeg?: number, octaves?: number}} opts
 *   `cell` es el lado de la celda en las mismas unidades que `range`: hace
 *   falta porque la pendiente es desnivel partido por distancia, y sin saber
 *   cuanto mide una celda no se puede limitar.
 */
export function cornerField(w, h, opts = {}) {
  if (w < 1 || h < 1) throw new Error("el campo necesita al menos una celda");
  const cell = opts.cell ?? 64;
  const range = opts.range ?? 48;
  const wavelength = opts.wavelength ?? 9;
  const seed = opts.seed ?? 0;
  const octaves = opts.octaves ?? 3;
  const maxSlopeDeg = opts.maxSlopeDeg ?? MAX_SLOPE_DEG;

  const cw = w + 1;
  const ch = h + 1;
  const z = new Float64Array(cw * ch);
  for (let j = 0; j < ch; j++) {
    for (let i = 0; i < cw; i++) {
      // Redondeado a entero a proposito. Los planos del .map se escriben con
      // cuatro decimales, y una cara inclinada cuyos tres puntos llevan
      // decimales le da a qbsp un plano que no es exactamente el del vecino:
      // aparecen rendijas de una diezmilesima por las que se cuela la luz y,
      // con mala suerte, el sellado.
      z[j * cw + i] = Math.round(
        fbm(i / wavelength + seed * 3.1, j / wavelength - seed * 1.7, octaves) * range
      );
    }
  }

  const maxDrop = Math.max(1, Math.floor(cell * Math.tan((maxSlopeDeg * Math.PI) / 180)));
  const passes = limitSlope(z, cw, ch, maxDrop);

  let min = Infinity;
  let max = -Infinity;
  for (const v of z) {
    if (v < min) min = v;
    if (v > max) max = v;
  }

  return {
    raw: z,
    cornersX: cw,
    cornersY: ch,
    width: w,
    height: h,
    cell,
    maxDrop,
    passes,
    min,
    max,
    /** Altura de la esquina (i, j), con los bordes extendidos. */
    get: (i, j) => z[clamp(j, 0, ch - 1) * cw + clamp(i, 0, cw - 1)],
  };
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Baja las esquinas hasta que ninguna vecina se lleve mas de `maxDrop`.
 *
 * Se baja siempre la alta y nunca se sube la baja, igual que en relief.js: asi
 * el proceso solo puede decrecer y por tanto termina. Subir la baja tambien
 * arreglaria esa pareja, pero podria romper la siguiente y entrar en bucle.
 */
export function limitSlope(z, cw, ch, maxDrop) {
  let passes = 0;
  for (let pass = 0; pass < 128; pass++) {
    let changed = false;
    passes++;
    for (let j = 0; j < ch; j++) {
      for (let i = 0; i < cw; i++) {
        const k = j * cw + i;
        let lowest = Infinity;
        if (i > 0) lowest = Math.min(lowest, z[k - 1]);
        if (i < cw - 1) lowest = Math.min(lowest, z[k + 1]);
        if (j > 0) lowest = Math.min(lowest, z[k - cw]);
        if (j < ch - 1) lowest = Math.min(lowest, z[k + cw]);
        if (z[k] > lowest + maxDrop) {
          z[k] = lowest + maxDrop;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return passes;
}

/**
 * El desnivel mas grande entre dos esquinas vecinas.
 *
 * Es lo que convierte la garantia de arriba en una garantia y no en una
 * esperanza. Solo mira vecinas en cruz: por la diagonal no se puede pasar sin
 * rozar una de las dos ortogonales.
 */
export function worstDrop(field) {
  const { raw: z, cornersX: cw, cornersY: ch } = field;
  let worst = 0;
  for (let j = 0; j < ch; j++) {
    for (let i = 0; i < cw; i++) {
      const v = z[j * cw + i];
      if (i < cw - 1) worst = Math.max(worst, Math.abs(z[j * cw + i + 1] - v));
      if (j < ch - 1) worst = Math.max(worst, Math.abs(z[(j + 1) * cw + i] - v));
    }
  }
  return worst;
}

/** La pendiente mas fuerte del campo, en grados. */
export function worstSlopeDeg(field) {
  return (Math.atan2(worstDrop(field), field.cell) * 180) / Math.PI;
}

/**
 * Nivela las cuatro esquinas de una celda, para poner algo plano encima.
 *
 * Un pozo, un zocalo o un mercado piden una superficie horizontal, y aqui no
 * hay ninguna: todo es pendiente. Se baja al MINIMO de las cuatro y no se sube
 * al maximo porque subir puede romper el limite de pendiente de una vecina, y
 * entonces la garantia deja de serlo.
 *
 * Vuelve a aplicar el limite despues, porque bajar una esquina puede dejar a
 * su vecina de fuera colgando.
 */
export function levelCell(field, i, j) {
  const { raw: z, cornersX: cw, cornersY: ch, maxDrop } = field;
  const corners = [
    j * cw + i,
    j * cw + i + 1,
    (j + 1) * cw + i,
    (j + 1) * cw + i + 1,
  ];
  for (const k of corners) {
    if (k < 0 || k >= z.length) throw new Error("celda fuera del campo");
  }
  const flat = Math.min(...corners.map((k) => z[k]));
  for (const k of corners) z[k] = flat;
  field.passes += limitSlope(z, cw, ch, maxDrop);
  let min = Infinity;
  for (const v of z) if (v < min) min = v;
  field.min = min;
  return flat;
}

/**
 * Altura en un punto cualquiera, interpolando entre las cuatro esquinas.
 *
 * Bilineal, no la esquina mas cercana. Con la mas cercana un arbol plantado
 * junto a una linea de la rejilla queda medio metro por encima o por debajo de
 * la ladera en la que se supone que esta, y eso no da ningun error: se ve un
 * arbol flotando, si es que alguien mira.
 *
 * @param {number} u  coordenada en CELDAS, no en unidades: 1.5 es el centro de
 *   la segunda celda. Quien llame convierte, porque la relacion entre la
 *   rejilla y el mundo la decide el emisor, no este archivo.
 */
export function heightAtCell(field, u, v) {
  const iu = Math.floor(u);
  const iv = Math.floor(v);
  const fu = u - iu;
  const fv = v - iv;
  const a = field.get(iu, iv);
  const b = field.get(iu + 1, iv);
  const c = field.get(iu, iv + 1);
  const d = field.get(iu + 1, iv + 1);
  return a + (b - a) * fu + (c - a) * fv + (a - b - c + d) * fu * fv;
}

/** La esquina mas alta dentro de un rectangulo de celdas, ambos extremos incluidos. */
export function highestCorner(field, i0, j0, i1, j1) {
  let top = -Infinity;
  for (let j = j0; j <= j1 + 1; j++) {
    for (let i = i0; i <= i1 + 1; i++) top = Math.max(top, field.get(i, j));
  }
  return top;
}
