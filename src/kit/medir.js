// Medir una malla nuestra con la misma vara que se midió el mapa ajeno.
//
// `tools/bsp.mjs` saca la altura libre de Gate City emparejando cada cara de
// suelo con la cara de techo más baja que tiene encima, en casillas de 2 m. Si
// aquí se midiera de otra forma —por ejemplo tirando rayos, o leyendo las alturas
// del plano en vez de la geometría— la comparación no valdría nada: dos números
// que no se sacan igual no se comparan, y la mediana de 2,8 m que se pone de
// objetivo es la de ESE método.
//
// Así que este archivo es el mismo algoritmo, leyendo triángulos en vez de caras
// de `.bsp`. Y hay un detalle que no es cosmético: se mide la GEOMETRÍA, no el
// plano. Una bóveda que el plano dice que está a nueve metros y que la malla
// emitió a dos daría 2,8 de mediana en el plano y otra cosa en el mundo, y el
// que se agobia es el que anda por el mundo.
//
// Ejes de Three.js: Y arriba. En el `.bsp` el que sube es Z, y por eso allí se
// mira `normal[2]` y aquí la componente Y.

/** Los percentiles de una lista de números. La lista se ordena en el sitio. */
export function percentiles(valores) {
  const v = [...valores].sort((a, b) => a - b);
  if (!v.length) return null;
  const pct = (p) => v[Math.floor((v.length - 1) * p)];
  return {
    n: v.length,
    p10: pct(0.1), p25: pct(0.25), mediana: pct(0.5), p75: pct(0.75), p90: pct(0.9),
    bajo3: v.filter((a) => a < 3).length / v.length,
    sobre8: v.filter((a) => a > 8).length / v.length,
    min: v[0], max: v[v.length - 1],
  };
}

/** Recorre los triángulos de una malla generada. */
export function* triangulos(malla) {
  const { pos, idx } = malla;
  for (let i = 0; i < idx.length; i += 3) {
    const p = [0, 1, 2].map((k) => {
      const b = idx[i + k] * 3;
      return [pos[b], pos[b + 1], pos[b + 2]];
    });
    yield p;
  }
}

/** La normal de un triángulo, calculada de sus puntos y no leída del atributo. */
export function normalDe([a, b, c]) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ];
  const len = Math.hypot(...n) || 1;
  return [n[0] / len, n[1] / len, n[2] / len];
}

/** El área de un triángulo. */
export function areaDe([a, b, c]) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ];
  return Math.hypot(...n) / 2;
}

/**
 * Cuánta superficie mira arriba, abajo y de lado.
 *
 * Es la cuenta con la que Gate City dice «el techo es el 107 % del suelo», que
 * traducido es: está todo cubierto. Un jharro con el 60 % de techo tiene el 40 %
 * del pueblo al aire libre y ya no es un jharro, por muy bien que midan las
 * plantas.
 */
export function superficie(malla) {
  let suelo = 0, techo = 0, pared = 0;
  for (const t of triangulos(malla)) {
    const n = normalDe(t);
    const a = areaDe(t);
    if (n[1] > 0.7) suelo += a;
    else if (n[1] < -0.7) techo += a;
    else pared += a;
  }
  return { suelo, techo, pared, cubierto: suelo ? techo / suelo : 0 };
}

/**
 * La altura libre de una malla, por el método de `tools/bsp.mjs`.
 *
 * Las caras horizontales se reparten en una rejilla de 2 m por su caja en planta
 * y en cada casilla se empareja cada suelo con el techo más bajo que tenga por
 * encima. No es exacto —una cara grande cae en muchas casillas— pero la
 * DISTRIBUCIÓN sí lo es, que es lo que se compara.
 *
 * `umbral` es lo que tiene que haber entre un suelo y un techo para que cuenten
 * como par: sin él, las dos caras de una losa de 60 cm se emparejan consigo
 * mismas y la mediana se desploma sin que nada esté mal.
 */
export function alturaLibre(malla, { casilla = 2, umbral = 0.5, tope = 400 } = {}) {
  const rej = new Map();
  const mete = (t, tipo) => {
    const xs = t.map((p) => p[0]);
    const zs = t.map((p) => p[2]);
    const y = t.reduce((a, p) => a + p[1], 0) / 3;
    const i0 = Math.floor(Math.min(...xs) / casilla), i1 = Math.floor(Math.max(...xs) / casilla);
    const j0 = Math.floor(Math.min(...zs) / casilla), j1 = Math.floor(Math.max(...zs) / casilla);
    if ((i1 - i0) * (j1 - j0) > tope) return;
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = `${i},${j}`;
        if (!rej.has(k)) rej.set(k, { suelos: [], techos: [] });
        rej.get(k)[tipo].push(y);
      }
    }
  };
  for (const t of triangulos(malla)) {
    const n = normalDe(t);
    if (n[1] > 0.7) mete(t, "suelos");
    else if (n[1] < -0.7) mete(t, "techos");
  }
  const alturas = [];
  for (const { suelos, techos } of rej.values()) {
    for (const s of suelos) {
      let mejor = Infinity;
      for (const t of techos) if (t > s + umbral && t - s < mejor) mejor = t - s;
      if (Number.isFinite(mejor)) alturas.push(mejor);
    }
  }
  return { alturas, ...percentiles(alturas), casillas: rej.size };
}

/**
 * Cuánto se parece una medida nuestra a la medida de Gate City, percentil a
 * percentil.
 *
 * Devuelve la diferencia de cada uno en metros. Se mira así y no con un solo
 * número de parecido porque las desviaciones NO valen lo mismo: que la mediana
 * se vaya medio metro cambia cómo se siente el sitio entero, y que el p90 se
 * vaya un metro solo cambia lo grande que es la caverna más grande.
 */
export function comparar(nuestro, objetivo) {
  const salida = {};
  for (const [q, valor] of objetivo) {
    const nombre = { 0.1: "p10", 0.25: "p25", 0.5: "mediana", 0.75: "p75", 0.9: "p90" }[q];
    if (!nombre) continue;
    salida[nombre] = { objetivo: valor, nuestro: nuestro[nombre], error: nuestro[nombre] - valor };
  }
  return salida;
}
