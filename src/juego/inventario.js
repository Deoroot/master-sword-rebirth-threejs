// El INVENTARIO en rejilla.
//
// ── Esto NO es lo que hace Master Sword, y se dice ─────────────────────────
//
// MSR guarda **una lista de hasta cien objetos** (`NUM_MAX_ITEMS 100`) y dos
// manos (`MAX_PLAYER_HANDS 2`). No hay rejilla. Lo que limita es el peso:
//
//     Volume() = min( STR × 25 + 25, 2000 )
//
// La rejilla es **nuestra**, y es la primera decisión de este proyecto que se
// aparta del original a propósito. El motivo es que los datos ya la soportan
// sin inventarse un solo campo: cada objeto declara `size`, `weight`, `value`,
// `quality`, `wearable` y `groupable`, y 789 de los 861 heredan de una
// plantilla — o sea que el catálogo ya tiene la forma de una tabla.
//
// Lo que sí hay que inventar es la HUELLA: de cuántas casillas es cada cosa.
// MSR trae un solo número, `size`, y medido sobre los 658 objetos que lo
// declaran sale así:
//
//     min 0   p25 1   mediana 1   p75 5   p90 20   max 150
//     los más comunes:  1×332   0×78   2×46   10×33   5×28   60×18
//
// O sea que **la mitad del catálogo vale 1 y la cola llega a 150**. Las bandas
// de abajo salen de esos cuartiles y no de un gusto; son nuestras y se pueden
// discutir mirando la tabla.

/** Cuántas casillas ocupa un objeto, a partir de su `size` de MSR. */
export const BANDAS = [
  { hasta: 2, w: 1, h: 1 },     // la mitad del catálogo: monedas, llaves, gemas
  { hasta: 8, w: 1, h: 2 },     // dagas, pociones, libros
  { hasta: 24, w: 2, h: 2 },    // espadas cortas, cascos, escudos pequeños
  { hasta: 64, w: 2, h: 3 },    // espadones, corazas, arcos
  { hasta: Infinity, w: 3, h: 3 }, // lo que no cabe en ningún sitio razonable
];

export function huellaDe(objeto) {
  const s = Number.isFinite(objeto?.tamano) ? objeto.tamano : 1;
  return BANDAS.find((b) => s <= b.hasta) ?? BANDAS[BANDAS.length - 1];
}

/** La rejilla por defecto. Diez por seis son sesenta casillas. */
export const ANCHO = 10;
export const ALTO = 6;

/**
 * Coloca una lista de objetos en la rejilla, de arriba abajo y de izquierda a
 * derecha, los grandes primero.
 *
 * Los grandes primero **no es un detalle**: con el orden del inventario, una
 * espada de 2×3 se queda fuera detrás de veinte monedas y el jugador ve un
 * hueco enorme y un «no cabe». Es el mismo problema que el empaquetado del
 * atlas de luz, y la misma solución.
 *
 * Devuelve `{ colocados, fuera, ocupacion }`. Lo que no cabe se devuelve, no se
 * tira: que un inventario pierda objetos al abrirse sería el peor fallo
 * posible de esta pantalla.
 */
export function colocar(objetos, { ancho = ANCHO, alto = ALTO } = {}) {
  const rejilla = Array.from({ length: alto }, () => new Array(ancho).fill(null));
  const cabe = (x, y, w, h) => {
    if (x + w > ancho || y + h > alto) return false;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (rejilla[j][i]) return false;
    return true;
  };
  const marcar = (x, y, w, h, id) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) rejilla[j][i] = id;
  };

  const orden = objetos
    .map((o, i) => ({ ...o, _i: i, huella: huellaDe(o.ficha) }))
    .sort((a, b) => (b.huella.w * b.huella.h) - (a.huella.w * a.huella.h) || a._i - b._i);

  const colocados = [];
  const fuera = [];
  for (const o of orden) {
    const { w, h } = o.huella;
    let puesto = false;
    for (let y = 0; y < alto && !puesto; y++) {
      for (let x = 0; x < ancho && !puesto; x++) {
        if (!cabe(x, y, w, h)) continue;
        marcar(x, y, w, h, o.id);
        colocados.push({ ...o, x, y, w, h });
        puesto = true;
      }
    }
    if (!puesto) fuera.push(o);
  }
  const usadas = rejilla.flat().filter(Boolean).length;
  return { colocados, fuera, rejilla, ocupacion: usadas / (ancho * alto) };
}

/** El peso que lleva encima, y si se pasa de lo que puede cargar. */
export function carga(objetos, capacidad) {
  const peso = objetos.reduce((s, o) => s + (o.ficha?.peso ?? 0) * (o.n ?? 1), 0);
  return { peso, capacidad, pasado: peso > capacidad, fraccion: capacidad ? peso / capacidad : 0 };
}
