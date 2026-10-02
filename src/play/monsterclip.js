// EL MONSTERCLIP EN EL JUEGO: la valla que sólo existe para los monstruos.
//
// Los datos los lee `src/bsp/clip.js` del `.bsp` y los hornea
// `tools/gatecity.mjs`; aquí sólo se contestan dos preguntas, y las dos en
// **metros y ejes de escena**:
//
//   `bloquea(desde, hasta)`  ¿corta este segmento algún brush?
//   `techo(x, z, desdeY, hasta)`  ¿hay un techo de brush debajo de este punto?
//
// Sin DOM, sin Three y sin Rapier, igual que el resto de `src/play/`: corre en el
// navegador y en el servidor, que es la única forma de que los bichos anden
// igual en los dos. Y **a propósito fuera de Rapier**: un colisionador de más en
// el mundo lo tocaría también el jugador, y el monsterclip es justo lo que el
// jugador no debe tocar (`world.cpp:1196`). Manteniéndolo aparte, eso no es una
// bandera que se pueda olvidar: es imposible por construcción.
//
// ── Un segmento contra un convexo, que es todo el algoritmo ───────────────
//
// Cada pieza es una lista de medios espacios `dot(n, p) >= dist`. El segmento
// `A + t·(B−A)` con `t` en [0,1] se recorta contra cada uno:
//
//   da = dot(n, A) − dist        db = dot(n, B) − dist
//
// Si los dos son negativos, el segmento entero está fuera de ESE medio espacio y
// por tanto fuera del convexo: se descarta la pieza y ya está. Si los dos son
// positivos, ese plano no recorta nada. Si tienen signo distinto, se mueve el
// extremo que toque. Cuando el intervalo se queda vacío, fuera. Si sobrevive,
// hay intersección.
//
// No tiene casos especiales y no necesita los vértices. La tolerancia es hacia
// **dentro**: se exige entrar más de `EPS` para contar como choque, o un bicho
// pegado a la cara de un brush lo estaría cortando siempre y no podría salir.

/** Un pelo, en metros. Medio milímetro: por debajo de lo que mide un luxel. */
export const EPS = 5e-4;

/**
 * La valla. `brushes` es lo que hornea el extractor: `{ piezas, mins, maxs }`,
 * con `piezas` una lista de listas de `{ n, dist }`.
 */
export class Monsterclip {
  constructor(brushes = []) {
    this.brushes = brushes;
    /** Cuántas veces se ha preguntado y cuántas ha parado a alguien. */
    this.consultas = 0;
    this.choques = 0;
  }

  get n() { return this.brushes.length; }
  get piezas() { return this.brushes.reduce((a, b) => a + b.piezas.length, 0); }

  /** ¿Corta el segmento `desde → hasta` algún brush? */
  bloquea(desde, hasta) {
    this.consultas++;
    if (!this.brushes.length) return false;
    // El filtro de caja primero: es una comparación de seis números contra cien
    // brushes, y se come el 99 % de las preguntas antes de tocar un plano.
    const a = [
      Math.min(desde[0], hasta[0]), Math.min(desde[1], hasta[1]), Math.min(desde[2], hasta[2]),
    ];
    const b = [
      Math.max(desde[0], hasta[0]), Math.max(desde[1], hasta[1]), Math.max(desde[2], hasta[2]),
    ];
    for (const br of this.brushes) {
      if (b[0] < br.mins[0] - EPS || a[0] > br.maxs[0] + EPS) continue;
      if (b[1] < br.mins[1] - EPS || a[1] > br.maxs[1] + EPS) continue;
      if (b[2] < br.mins[2] - EPS || a[2] > br.maxs[2] + EPS) continue;
      for (const pieza of br.piezas) {
        if (cortaConvexo(pieza, desde, hasta)) { this.choques++; return true; }
      }
    }
    return false;
  }

  /**
   * EL TECHO DEL BRUSH bajo un punto, o `null`.
   *
   * Hace falta porque el monsterclip también es **suelo** para un monstruo:
   * `DROP_TO_FLOOR` y `SV_movestep` los dos pasan la bandera de la entidad
   * (pr_cmds.cpp:1696, sv_move.cpp:44). Un bloque de monsterclip puesto en una
   * cornisa no sólo impide pasar: se puede andar por encima.
   *
   * Se resuelve con el mismo recorte, bajando un segmento vertical y quedándose
   * con la `t` más pequeña — o sea la superficie más alta.
   */
  techo(x, z, desdeY, largo = 3) {
    if (!this.brushes.length) return null;
    const desde = [x, desdeY, z];
    const hasta = [x, desdeY - largo, z];
    let mejor = null;
    for (const br of this.brushes) {
      if (x < br.mins[0] - EPS || x > br.maxs[0] + EPS) continue;
      if (z < br.mins[2] - EPS || z > br.maxs[2] + EPS) continue;
      if (desdeY < br.mins[1] - EPS || desdeY - largo > br.maxs[1] + EPS) continue;
      for (const pieza of br.piezas) {
        const t = entradaEnConvexo(pieza, desde, hasta);
        if (t !== null && (mejor === null || t < mejor)) mejor = t;
      }
    }
    return mejor === null ? null : desdeY - mejor * largo;
  }
}

/**
 * El intervalo `t` del segmento que queda dentro del convexo, o `null`.
 *
 * Devuelve el `t` de ENTRADA, que es lo que hace falta para el suelo. Para
 * «¿choca?» basta saber que no es `null`.
 */
export function entradaEnConvexo(pieza, desde, hasta) {
  let t0 = 0, t1 = 1;
  const d = [hasta[0] - desde[0], hasta[1] - desde[1], hasta[2] - desde[2]];
  for (const p of pieza) {
    // `dot(n, A + t·d) − dist >= 0`, o sea `da + t·dd >= 0`.
    const da = p.n[0] * desde[0] + p.n[1] * desde[1] + p.n[2] * desde[2] - p.dist;
    const dd = p.n[0] * d[0] + p.n[1] * d[1] + p.n[2] * d[2];
    if (Math.abs(dd) < 1e-12) {
      // Paralelo al plano: o está dentro todo el rato o está fuera todo el rato.
      if (da < EPS) return null;
      continue;
    }
    const t = (EPS - da) / dd;
    if (dd > 0) { if (t > t0) t0 = t; }     // entra en este medio espacio
    else { if (t < t1) t1 = t; }            // sale
    if (t0 > t1) return null;
  }
  return t0;
}

/** ¿Corta el segmento este convexo? */
export function cortaConvexo(pieza, desde, hasta) {
  return entradaEnConvexo(pieza, desde, hasta) !== null;
}

/**
 * ¿Está este PUNTO dentro de algún brush?
 *
 * Es el segmento degenerado, y se escribe aparte porque es lo que la prueba usa
 * para comparar contra el árbol del `.bsp`: muestrear puntos y exigir que las
 * dos formas de contestar coincidan es el único oráculo que hay aquí, ya que el
 * archivo no guarda estos brushes de ninguna otra manera.
 */
export function dentro(brushes, punto) {
  for (const br of brushes) {
    if (punto[0] < br.mins[0] || punto[0] > br.maxs[0]) continue;
    if (punto[1] < br.mins[1] || punto[1] > br.maxs[1]) continue;
    if (punto[2] < br.mins[2] || punto[2] > br.maxs[2]) continue;
    for (const pieza of br.piezas) {
      if (pieza.every((p) => p.n[0] * punto[0] + p.n[1] * punto[1] + p.n[2] * punto[2] - p.dist >= 0)) return true;
    }
  }
  return false;
}
