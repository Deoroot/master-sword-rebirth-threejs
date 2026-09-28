// El río de Corinth: su trazado, su ribera y sus bordes.
//
// Vive aquí y no en el emisor del `.map` por la misma razón que `hayRoca()` vive
// en `boca.js`: lo usan DOS cosas que tienen que coincidir o se abre una
// rendija. El emisor saca de aquí el terreno, y `pueblo.js` saca de aquí por
// dónde pasa la valla de la orilla. Con dos copias del trazado bastaría con que
// alguien tocara un seno para que la valla quedara a medio metro del borde,
// flotando o enterrada, y eso no lo dice ninguna cifra.
//
// Todo en METROS y en coordenadas del mapa de celdas: `x` hacia el este, `fila`
// hacia el sur —la misma fila continua que numera `corinth.js`, pero con
// decimales—. Quien emita en unidades de Quake convierte al final.

import { RIO, PUENTE, FONDO } from "./corinth.js";
import { CELDA } from "./house.js";

/** La lámina de agua, el fondo del cauce y el ancho de la ribera cortada. */
export const AGUA = -1.0;
export const LECHO = -3.0;
export const CORTE = 2.0;

/** El centro del cauce en cada fila del plano, en metros. */
const CENTROS = RIO.map((f) => (f[1] + f[2] / 2) * CELDA);

/**
 * El centro del cauce a la altura `fila`, interpolado suave.
 *
 * Catmull-Rom y no lineal. La lineal pasa por los puntos pero deja un pico en
 * cada uno, y un río con esquinas se lee como una tubería. Catmull-Rom pasa por
 * los MISMOS puntos —o sea que las celdas mojadas del plano siguen siendo las
 * mojadas y la comprobación de paso no cambia— y llega a ellos con la tangente
 * continua.
 */
export function cauceEn(fila) {
  const t = fila - 0.5;
  const i = Math.floor(t);
  const f = t - i;
  const c = (k) => CENTROS[Math.max(0, Math.min(CENTROS.length - 1, k))];
  const p0 = c(i - 1), p1 = c(i), p2 = c(i + 1), p3 = c(i + 2);
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * f +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f +
    (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f
  );
}

/** El semiancho del agua. Varía, porque un río de ancho constante es un canal. */
export function semiEn(fila) {
  const y = fila * CELDA;
  return 3.25 + 0.62 * Math.sin(y / 5.9) + 0.31 * Math.sin(y / 2.2 + 1.3);
}

/** Los dos bordes de arriba de la ribera, en metros: [oeste, este]. */
export function bordesEn(fila) {
  const c = cauceEn(fila);
  const s = semiEn(fila) + CORTE;
  return [c - s, c + s];
}

/**
 * La cota del terreno, en metros. 0 en la calle, LECHO en el cauce.
 *
 * Devuelve CERO EXACTO fuera de la ribera, por la misma razón que `alturaRoca()`
 * en la boca: es lo que permite coser la banda fina del río con las losas de 4 m
 * del resto del pueblo sin dejar rendija.
 */
export function alturaRibera(x, fila) {
  const d = Math.abs(x - cauceEn(fila));
  const s = semiEn(fila);
  if (d <= s) return LECHO;
  if (d >= s + CORTE) return 0;
  const t = (d - s) / CORTE;
  const e = t * t * (3 - 2 * t);
  const v = LECHO * (1 - e);
  return v === 0 ? 0 : v;
}

/** Las filas que ocupa el puente, con un poco de margen para los estribos. */
export const PUENTE_FILA = { desde: PUENTE.z, hasta: PUENTE.z + 1 };

/**
 * El recorrido de la valla de una orilla, como polilínea en metros de mundo.
 *
 * Se devuelve partido en tramos, porque en el puente la valla se abre: ese hueco
 * ES el paso, y es lo único que hace de Corinth un puesto de control. Un cercado
 * continuo sería una tapia y el pueblo se quedaría sin cruce.
 *
 * `lado` es 0 para la orilla oeste y 1 para la este. El retranqueo mete la valla
 * un palmo tierra adentro: plantada justo en el borde, medio poste queda en el
 * aire sobre la ribera.
 */
export function recorridoValla(lado, { paso = 0.5, retranqueo = 0.35 } = {}) {
  const tramos = [];
  let actual = [];
  for (let fila = 0; fila <= FONDO; fila += paso) {
    // El hueco del puente, con medio metro de margen a cada lado para que los
    // postes no se planten encima del tablero.
    const enPuente =
      fila > PUENTE_FILA.desde - 0.15 && fila < PUENTE_FILA.hasta + 0.15;
    if (enPuente) {
      if (actual.length > 1) tramos.push(actual);
      actual = [];
      continue;
    }
    const borde = bordesEn(fila)[lado];
    const x = lado === 0 ? borde - retranqueo : borde + retranqueo;
    // La fila crece hacia el sur y el mundo hacia −Z: la traducción es la misma
    // que en src/kit/pueblo.js y está escrita allí una sola vez.
    actual.push([x, -fila * CELDA]);
  }
  if (actual.length > 1) tramos.push(actual);
  return tramos;
}
