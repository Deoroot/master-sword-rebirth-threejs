// Micro-elevaciones para un mundo de brushes.
//
// Aviso sobre el vocabulario, porque lleva a error: heightmap, displacement y
// deformation son tecnicas que mueven los VERTICES de una malla. Un brush no
// tiene vertices que mover -sus vertices son el resultado de cortar sus
// planos-, asi que ninguna de esas tecnicas se puede aplicar aqui. Moverle un
// vertice a un brush lo deja no convexo y qbsp lo rechaza o lo sella mal.
//
// La forma que si funciona, y la que usaban Quake y Half-Life, es escalonar:
// cada celda del suelo recibe una altura del ruido, cuantizada a un multiplo
// del escalon del jugador. Sigue siendo un brush por celda, la colision es
// exacta y gratis, y qbsp sigue pudiendo juzgar el sellado.
//
// Lo que este archivo garantiza, y es todo lo que importa: **dos celdas
// vecinas nunca se llevan mas de un escalon**. No por que el ruido salga
// suave, que a veces no sale, sino porque despues se aplana hasta que se
// cumple, y hay una funcion que lo comprueba.

import { fbm } from "../util/noise.js";

export const STEP = 8;   // unidades por escalon: 25 cm, la mitad de lo que sube el jugador
export const RANGE = 16; // desnivel maximo respecto al cero, en unidades

/**
 * Campo de alturas cuantizado y aplanado.
 *
 * @param {number} w  celdas a lo ancho
 * @param {number} h  celdas de fondo
 * @param {{wavelength?: number, range?: number, step?: number, seed?: number}} opts
 *   `wavelength` en celdas: cuantas celdas mide una ondulacion. Corto da
 *   baches; largo da una loma que cruza el pueblo entero.
 * @returns {{get(x, y): number, levels: number[], min: number, max: number, passes: number}}
 */
export function heightField(w, h, opts = {}) {
  const range = opts.range ?? RANGE;
  const step = opts.step ?? STEP;
  const wavelength = opts.wavelength ?? 7;
  const seed = opts.seed ?? 0;

  const cells = new Int32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = fbm(x / wavelength + seed * 3.1, y / wavelength - seed * 1.7, 3);
      cells[y * w + x] = quantise(n * range, step);
    }
  }

  const passes = flatten(cells, w, h, step);

  const levels = [...new Set(cells)].sort((a, b) => a - b);
  return {
    get: (x, y) => cells[clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)],
    raw: cells,
    width: w,
    height: h,
    levels,
    min: levels[0],
    max: levels[levels.length - 1],
    passes,
  };
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Al multiplo de `step` mas cercano. */
export function quantise(value, step = STEP) {
  return Math.round(value / step) * step;
}

/**
 * Baja las celdas hasta que ninguna vecina se lleve mas de un escalon.
 *
 * El ruido cuantizado puede dejar saltos de dos y tres escalones donde la
 * pendiente es fuerte, y un salto de dos escalones es un muro de medio metro
 * que el jugador no sube: el pueblo se corta en trozos incomunicados sin que
 * nada falle. Se baja siempre la celda alta, nunca se sube la baja, porque asi
 * el proceso solo puede decrecer y por tanto termina.
 */
export function flatten(cells, w, h, step = STEP) {
  let passes = 0;
  for (let pass = 0; pass < 64; pass++) {
    let changed = false;
    passes++;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        let lowest = Infinity;
        if (x > 0) lowest = Math.min(lowest, cells[i - 1]);
        if (x < w - 1) lowest = Math.min(lowest, cells[i + 1]);
        if (y > 0) lowest = Math.min(lowest, cells[i - w]);
        if (y < h - 1) lowest = Math.min(lowest, cells[i + w]);
        if (cells[i] > lowest + step) {
          cells[i] = lowest + step;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return passes;
}

/**
 * El salto mas grande entre dos celdas vecinas, en unidades.
 *
 * Es la comprobacion que hace que lo de arriba sea una garantia y no una
 * esperanza. Solo mira vecinas en cruz: en diagonal el jugador no puede pasar
 * sin rozar una de las dos ortogonales, asi que la diagonal nunca es el paso
 * critico.
 */
export function worstStep(field) {
  const { raw, width: w, height: h } = field;
  let worst = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = raw[y * w + x];
      if (x < w - 1) worst = Math.max(worst, Math.abs(raw[y * w + x + 1] - v));
      if (y < h - 1) worst = Math.max(worst, Math.abs(raw[(y + 1) * w + x] - v));
    }
  }
  return worst;
}

/**
 * La altura mas alta bajo un rectangulo de celdas, en unidades.
 *
 * Para asentar una casa. Se toma el maximo y no la media: con la media, la
 * esquina mas alta del terreno atravesaria el suelo de la casa. En la realidad
 * pasa lo mismo y se resuelve igual, con un zocalo nivelado.
 */
export function highestUnder(field, x0, y0, x1, y1) {
  let top = -Infinity;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) top = Math.max(top, field.get(x, y));
  }
  return top;
}
