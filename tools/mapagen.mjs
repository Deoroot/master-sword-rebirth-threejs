// ESCRIBIR UN `.map` DE GOLDSRC DESDE CÓDIGO (el 88).
//
// Un `.map` es texto: entidades con pares clave-valor y, dentro, brushes de seis
// planos. Esto escribe ese texto para que VHLT lo compile (`tools/contenido.mjs`)
// y para que J.A.C.K. lo abra. No sustituye a un mapeador: es la manera de
// probar el camino entero —escribir, compilar, cargar en Xash y aquí— sin
// depender de uno, y de que el día que llegue el camino ya exista.
//
// ── EL FORMATO, Y LA ÚNICA COSA QUE SE PUEDE HACER MAL ──────────────────────
//
// Se escribe en «Valve 220» (`"mapversion" "220"` en el `worldspawn`), que es el
// que sale de J.A.C.K.: las tres caras de Edana lo traen así. Cada plano son tres
// puntos y la textura con sus dos ejes:
//
//   ( x y z ) ( x y z ) ( x y z ) TEXTURA [ ux uy uz desp ] [ vx vy vz desp ] rot escx escy
//
// Lo que se puede hacer mal es **el orden de los tres puntos**. El compilador
// saca la normal como `cross(p0 - p1, p2 - p1)` —la cuenta de `qbsp` de Quake,
// que hlcsg heredó— y el brush es lo que queda DETRÁS de los seis planos. Con
// los puntos al revés la normal mira hacia dentro y el brush no tiene volumen.
// `test/mapagen88.test.mjs` hace esa cuenta con los puntos que salen de aquí; el
// otro control es que hlcsg compile sin quejarse.

/** Las seis caras de una caja: la normal hacia fuera y dos ejes `a`, `b` con `a × b = normal`. */
const CARAS = [
  { n: [0, 0, 1], a: [1, 0, 0], b: [0, 1, 0] },
  { n: [0, 0, -1], a: [0, 1, 0], b: [1, 0, 0] },
  { n: [1, 0, 0], a: [0, 1, 0], b: [0, 0, 1] },
  { n: [-1, 0, 0], a: [0, 0, 1], b: [0, 1, 0] },
  { n: [0, 1, 0], a: [0, 0, 1], b: [1, 0, 0] },
  { n: [0, -1, 0], a: [1, 0, 0], b: [0, 0, 1] },
];

/**
 * Los ejes de textura de Valve 220 para una cara alineada con los ejes: los de
 * J.A.C.K. por defecto («alinear al mundo»), con V hacia abajo.
 */
function ejesDeTextura(n) {
  if (n[2] !== 0) return [[1, 0, 0], [0, -1, 0]];
  if (n[0] !== 0) return [[0, 1, 0], [0, 0, -1]];
  return [[1, 0, 0], [0, 0, -1]];
}

const v = (p) => `( ${p.join(" ")} )`;
const eje = (e) => `[ ${e.join(" ")} 0 ]`;

/**
 * Los tres puntos de cada cara de la caja `[min, max]`, en el orden en que los
 * lee el compilador. Se exporta para la prueba.
 */
export function planosDeCaja(min, max) {
  return CARAS.map(({ n, a, b }) => {
    // Un punto del plano: la esquina de `max` si la normal es positiva, la de `min` si no.
    const p1 = [0, 1, 2].map((i) => (n[i] > 0 ? max[i] : n[i] < 0 ? min[i] : min[i]));
    const p0 = p1.map((c, i) => c + a[i] * 64);
    const p2 = p1.map((c, i) => c + b[i] * 64);
    return { n, puntos: [p0, p1, p2] };
  });
}

/**
 * Un brush con forma de caja. `tex` es un nombre de textura o un objeto
 * `{ arriba, abajo, lados }` para poner una en el suelo y otra en las paredes.
 */
export function caja(min, max, tex) {
  for (let i = 0; i < 3; i++) {
    if (!(max[i] > min[i])) throw new Error(`caja sin volumen en el eje ${i}: ${min} → ${max}`);
  }
  const de = (n) => typeof tex === "string" ? tex
    : n[2] > 0 ? tex.arriba : n[2] < 0 ? tex.abajo : tex.lados;
  const lineas = planosDeCaja(min, max).map(({ n, puntos }) => {
    const [u, w] = ejesDeTextura(n);
    return `${puntos.map(v).join(" ")} ${de(n)} ${eje(u)} ${eje(w)} 0 1 1`;
  });
  return `{\n${lineas.join("\n")}\n}`;
}

/**
 * Una sala hueca: suelo, techo y cuatro paredes de grosor `g` ALREDEDOR del
 * hueco `[min, max]`, o sea que el hueco es exactamente lo que se pide. Las
 * paredes se pisan en las esquinas a propósito: así no queda rendija por la que
 * se escape el vacío (una «fuga», que haría que hlvis no corriera).
 */
export function salaHueca(min, max, g, tex) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  return [
    caja([x0 - g, y0 - g, z0 - g], [x1 + g, y1 + g, z0], tex.suelo),
    caja([x0 - g, y0 - g, z1], [x1 + g, y1 + g, z1 + g], tex.techo),
    caja([x0 - g, y0 - g, z0], [x0, y1 + g, z1], tex.pared),
    caja([x1, y0 - g, z0], [x1 + g, y1 + g, z1], tex.pared),
    caja([x0, y0 - g, z0], [x1, y0, z1], tex.pared),
    caja([x0, y1, z0], [x1, y1 + g, z1], tex.pared),
  ];
}

/**
 * Lo que queda de la caja `a` al quitarle el hueco `h`: hasta seis cajas, sin
 * solaparse. Se corta primero en X, luego en Y y luego en Z, cada vez dentro de
 * lo que el corte anterior dejó tocando el hueco.
 */
export function restar(a, h) {
  const se = [0, 1, 2].every((i) => a.min[i] < h.max[i] && h.min[i] < a.max[i]);
  if (!se) return [a];
  const fuera = [];
  let min = [...a.min], max = [...a.max];
  for (let i = 0; i < 3; i++) {
    if (min[i] < h.min[i]) {
      const m = [...max]; m[i] = h.min[i];
      fuera.push({ min: [...min], max: m });
      min[i] = h.min[i];
    }
    if (max[i] > h.max[i]) {
      const m = [...min]; m[i] = h.max[i];
      fuera.push({ min: m, max: [...max] });
      max[i] = h.max[i];
    }
  }
  return fuera;
}

/**
 * Un interior: un bloque macizo que envuelve todos los huecos con `g` unidades
 * de margen, y los huecos vaciados. Así salas y pasillos se juntan sin que haya
 * que pensar dónde va cada pared ni dejar rendijas: lo que no es hueco es roca.
 *
 * Con `tex = { suelo, techo, pared }` cada brush lleva el suelo ARRIBA, el techo
 * ABAJO y la pared a los lados, que es lo que se ve desde dentro del hueco.
 */
export function interior(huecos, g, tex) {
  const min = [0, 1, 2].map((i) => Math.min(...huecos.map((h) => h.min[i])) - g);
  const max = [0, 1, 2].map((i) => Math.max(...huecos.map((h) => h.max[i])) + g);
  let macizo = [{ min, max }];
  for (const h of huecos) macizo = macizo.flatMap((c) => restar(c, h));
  const t = { arriba: tex.suelo, abajo: tex.techo, lados: tex.pared };
  return macizo.map((c) => caja(c.min, c.max, t));
}

const comillas = (s) => {
  const t = String(s);
  if (t.includes('"')) throw new Error(`un valor de entidad no puede llevar comillas: ${t}`);
  return `"${t}"`;
};

/** Una entidad: sus claves y, si es de brush, sus brushes. */
export function entidad(claves, brushes = []) {
  const pares = Object.entries(claves).map(([k, val]) => `${comillas(k)} ${comillas(val)}`);
  return `{\n${[...pares, ...brushes].join("\n")}\n}`;
}

/** El `.map` entero: el `worldspawn` con su geometría primero, como lo escribe J.A.C.K. */
export function mapa({ mundo, brushes, entidades }) {
  const ws = entidad({ classname: "worldspawn", mapversion: "220", ...mundo }, brushes);
  return [ws, ...entidades.map((e) => entidad(e))].join("\n") + "\n";
}
