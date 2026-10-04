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
  // Para una cara inclinada manda el eje en que más mira la normal, que es lo que hace
  // J.A.C.K. al «alinear al mundo»; para una cara recta sale lo mismo que antes.
  const a = n.map(Math.abs);
  if (a[2] >= a[0] && a[2] >= a[1]) return [[1, 0, 0], [0, -1, 0]];
  if (a[0] >= a[1]) return [[0, 1, 0], [0, 0, -1]];
  return [[1, 0, 0], [0, 0, -1]];
}

const v = (p) => `( ${p.join(" ")} )`;

/**
 * Qué textura lleva la cara de normal `n`. `tex` es un nombre, una función
 * `(n) => textura`, o un objeto `{ arriba, abajo, lados }` al que se le pueden
 * añadir `este`, `oeste`, `norte`, `sur` (+x, −x, +y, −y) para una cara suelta:
 * la puerta de una fachada es UNA cara de su caja.
 *
 * Y cada textura es un nombre o `{ nombre, escala, desp }`: `escala` es un número
 * o `[sx, sy]` (unidades por téxel: 0.5 la pone al doble de fina) y `desp` el
 * desplazamiento `[u, v]` en téxeles, para encajar una ventana en su hueco.
 */
function texturaDe(tex, n) {
  if (typeof tex === "string") return tex;
  if (typeof tex === "function") return tex(n);
  if (tex.nombre) return tex;
  const a = n.map(Math.abs);
  if (a[2] >= a[0] && a[2] >= a[1]) return (n[2] > 0 ? tex.arriba : tex.abajo) ?? tex.lados;
  const lado = a[0] >= a[1] ? (n[0] > 0 ? tex.este : tex.oeste) : (n[1] > 0 ? tex.norte : tex.sur);
  return lado ?? tex.lados;
}

/** La línea de una cara: sus tres puntos, la textura y los dos ejes de Valve 220. */
function linea(puntos, n, tex) {
  const t = texturaDe(tex, n);
  const s = typeof t === "string" ? { nombre: t } : t;
  if (!s?.nombre) throw new Error(`cara sin textura (normal ${n})`);
  const [u, w] = ejesDeTextura(n);
  const esc = Array.isArray(s.escala) ? s.escala : [s.escala ?? 1, s.escala ?? 1];
  const d = s.desp ?? [0, 0];
  return `${puntos.map(v).join(" ")} ${s.nombre} [ ${u.join(" ")} ${d[0]} ] [ ${w.join(" ")} ${d[1]} ] 0 ${esc[0]} ${esc[1]}`;
}

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
  const lineas = planosDeCaja(min, max).map(({ n, puntos }) => linea(puntos, n, tex));
  return `{\n${lineas.join("\n")}\n}`;
}

// ── LO QUE NO ES UNA CAJA (el experimento de geometría) ─────────────────────
//
// Gate City no está hecha de cajas: sus túneles son octógonos, sus esquinas van
// a 45° y el techo de sus calles es roca tallada a mano, triángulo a triángulo.
// Todo eso son brushes CONVEXOS cualesquiera, y un brush convexo es una lista de
// planos igual que una caja; lo único que cambia es que los tres puntos de cada
// plano ya no salen de una tabla. Aquí se ORIENTAN solos: se mira a qué lado
// queda el centro del sólido y se les da la vuelta si hace falta, con la misma
// cuenta del compilador que comprueba la prueba.

const resta = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const escalar = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Los planos de un sólido convexo: `puntos` son sus vértices y `caras` ternas de
 * índices, una por cara, en cualquier orden. Devuelve, por cara, la normal hacia
 * fuera (unitaria) y los tres puntos ya ordenados. Se exporta para la prueba.
 *
 * Para si una cara no tiene área o si algún vértice queda DELANTE de un plano:
 * eso es un sólido que no es convexo, y hlcsg lo recortaría sin avisar.
 */
export function planosDeConvexo(puntos, caras) {
  const centro = [0, 1, 2].map((i) => puntos.reduce((s, p) => s + p[i], 0) / puntos.length);
  return caras.map((ix) => {
    let [p0, p1, p2] = ix.map((i) => puntos[i]);
    let n = cruz(resta(p0, p1), resta(p2, p1));
    const largo = Math.hypot(...n);
    if (!(largo > 1e-9)) throw new Error(`cara sin área: ${JSON.stringify([p0, p1, p2])}`);
    n = n.map((c) => c / largo);
    if (escalar(n, resta(centro, p1)) > 0) { [p0, p2] = [p2, p0]; n = n.map((c) => -c); }
    for (const q of puntos) {
      if (escalar(n, resta(q, p1)) > 1e-6) throw new Error(`el sólido no es convexo: ${q} queda delante de ${JSON.stringify([p0, p1, p2])}`);
    }
    return { n, puntos: [p0, p1, p2] };
  });
}

/** Un brush convexo cualquiera. `tex`, como en `caja`. */
export function convexo(puntos, caras, tex) {
  const lineas = planosDeConvexo(puntos, caras).map(({ n, puntos: p }) => linea(p, n, tex));
  return `{\n${lineas.join("\n")}\n}`;
}

/**
 * Un prisma: el polígono convexo `perfil` (puntos 2D, en cualquier sentido)
 * estirado a lo largo del eje `eje` (0 = x, 1 = y, 2 = z) desde `a0` hasta `a1`.
 * Las dos coordenadas del perfil son las de los otros dos ejes, en su orden:
 * `(y, z)` para el eje x, `(x, z)` para el y, `(x, y)` para el z.
 *
 * Es la pieza de Gate City: el chaflán de un túnel es un prisma triangular a lo
 * largo del túnel, y la esquina a 45° de una sala es uno vertical.
 */
export function prisma(eje, perfil, a0, a1, tex) {
  if (!(a1 > a0)) throw new Error(`prisma sin largo: ${a0} → ${a1}`);
  if (perfil.length < 3) throw new Error("un perfil tiene al menos tres puntos");
  const en = (a, [p, q]) => (eje === 0 ? [a, p, q] : eje === 1 ? [p, a, q] : [p, q, a]);
  const m = perfil.length;
  const puntos = [...perfil.map((p) => en(a0, p)), ...perfil.map((p) => en(a1, p))];
  const caras = [[0, 1, 2], [m, m + 1, m + 2], ...perfil.map((_, i) => [i, (i + 1) % m, m + i])];
  return convexo(puntos, caras, tex);
}

/**
 * Un techo (o un suelo) de roca tallada: una rejilla de `paso` unidades sobre
 * `[min, max]` en planta, partida en triángulos, y de cada triángulo un brush que
 * va desde el plano `tapa` hasta la cota que dé `cota(x, y)` en sus tres
 * esquinas. Es la técnica con la que se hace terreno en GoldSrc —un prisma por
 * triángulo— y es como está hecho el techo de las calles de Gate City.
 *
 * Con `tapa` por ENCIMA de las cotas cuelga del techo; por debajo, es suelo.
 * `cota` tiene que devolver enteros: un vértice con decimales es una rendija.
 */
export function relieve({ min, max, paso, tapa, cota, tex }) {
  const brushes = [];
  const xs = [], ys = [];
  for (let x = min[0]; x < max[0]; x += paso[0]) xs.push(x);
  xs.push(max[0]);
  for (let y = min[1]; y < max[1]; y += paso[1]) ys.push(y);
  ys.push(max[1]);
  for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < ys.length; j++) {
    const q = [[xs[i], ys[j]], [xs[i + 1], ys[j]], [xs[i + 1], ys[j + 1]], [xs[i], ys[j + 1]]];
    // la diagonal, alternada: si no, todo el techo tiene la veta hacia el mismo lado
    const tris = (i + j) % 2 ? [[q[0], q[1], q[2]], [q[0], q[2], q[3]]] : [[q[0], q[1], q[3]], [q[1], q[2], q[3]]];
    for (const t of tris) {
      const z = t.map(([x, y]) => cota(x, y));
      if (z.some((c) => !Number.isInteger(c) || c === tapa)) throw new Error(`relieve: cota ${z} no vale (entera y distinta de la tapa ${tapa})`);
      const puntos = [...t.map(([x, y]) => [x, y, tapa]), ...t.map(([x, y], k) => [x, y, z[k]])];
      brushes.push(convexo(puntos, [[0, 1, 2], [3, 4, 5], [0, 1, 3], [1, 2, 4], [2, 0, 5]], tex));
    }
  }
  return brushes;
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
  // Una entidad de brush —un `func_illusionary`, un `func_wall`— trae los suyos en
  // `brushes`, que no es una clave: se separa aquí.
  const una = ({ brushes: suyos = [], ...claves }) => entidad(claves, suyos);
  return [ws, ...entidades.map(una)].join("\n") + "\n";
}
