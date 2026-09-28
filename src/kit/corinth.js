// El mapa de celdas de Corinth.
//
// Es el documento que decide donde va cada cosa, y existe antes que la
// geometria a proposito: una herreria bien construida en el sitio equivocado es
// trabajo tirado, y eso no se ve en la ficha de la herreria.
//
// TODO en celdas de 4 m, enteras. La celda (x, z) ocupa el cuadrado que va de
// (4x, -4z) a (4x+4, -4z-4) en metros, igual que en src/kit/house.js. Trabajar
// en celdas y no en metros es lo que hace que «la casa de al lado» sea x+2 y no
// una resta con decimales.
//
// ── Lo que el lore obliga, y por que el plano es asi ──────────────────────────
//
// Corinth vive de lo que se saca del agujero. Hay guarnicion, la boca esta
// SELLADA y hace falta permiso para entrar. Eso hace que el pueblo no sea una
// plaza con casas alrededor: es un puesto de control con un pueblo pegado.
//
//   - El rio parte el pueblo. La boca y la guarnicion quedan en la orilla ESTE,
//     al otro lado del agua, y se llega por un solo puente. No es decoracion:
//     un pueblo que controla quien baja necesita un sitio por donde se pase de
//     uno en uno, y el rio ya lo daba hecho.
//   - La herreria esta en la orilla este, junto a la guarnicion, no entre las
//     casas. Quien le compra son los que bajan.
//   - El mercado esta en la orilla oeste, en el lado de las casas: lo que se
//     saca del agujero se vende DESPUES de cruzar, no antes.
//   - El porton es de llegada y esta cerrado. En este experimento no hay salida.
//
// ── La comprobacion que justifica todo esto ──────────────────────────────────
//
// El experimento 02 dejo escrito que ni qbsp ni el emisor pueden comprobar «que
// la puerta lleve a alguna parte». Aqui si se puede, y es barato: con el plano
// en celdas, se inunda desde el punto de llegada y se mira si la boca de la
// mazmorra se moja. Si el puente se olvida, o una casa tapa la unica calle, el
// pueblo sigue sellando en qbsp y sigue siendo bonito en una captura, y el
// jugador no puede llegar a lo unico que hay que hacer.

// El tamano sale de la densidad, no al reves. La primera version median 24x22
// celdas -96x88 m- con las mismas once casas, y el plano dibujado lo enseno de
// un vistazo: no era un pueblo, era un descampado con cajas. Ninguna cifra lo
// decia, porque todas las cifras estaban bien.
export const ANCHO = 20; // celdas, eje X (oeste -> este) = 80 m
export const FONDO = 18; // celdas, eje Z (norte -> sur) = 72 m

/**
 * El rio, celda a celda: por cada fila z, en que columna x empieza y cuanto
 * mide de ancho.
 *
 * Se escribe asi y no como una curva porque el rio tiene que caer en celdas
 * enteras para que la comprobacion de paso sepa que celdas estan mojadas. Un
 * rio de trazo bonito que no se sabe si corta la calle no sirve para juzgar
 * nada.
 */
// El cauce solo se mueve entre x=12 y x=13, y no por capricho: a la izquierda
// la ultima fila de casas acaba en x=11, y a la derecha la guarnicion empieza en
// x=15. Un meandro mas ancho se comeria una de las dos, y el sintoma seria una
// casa dentro del agua -que la comprobacion de «ninguna parcela cae en el rio»
// caza, pero mejor no escribirlo mal de entrada.
export const RIO = [
  // z  x  ancho
  [0, 13, 2], [1, 13, 2], [2, 13, 2], [3, 12, 2], [4, 12, 2],
  [5, 12, 2], [6, 12, 2], [7, 13, 2], [8, 13, 2], [9, 13, 2],
  [10, 13, 2], [11, 13, 2], [12, 12, 2], [13, 12, 2], [14, 12, 2],
  [15, 13, 2], [16, 13, 2], [17, 13, 2],
];

/** El puente: las celdas de rio que se pueden pisar. */
export const PUENTE = { z: 9, x: 13, ancho: 2 };

/**
 * Las parcelas. Cada una ocupa un rectangulo de celdas y tiene un papel.
 *
 * `casa` nombra una entrada del catalogo de src/kit/casas.js cuando la parcela
 * se construye con el kit tal cual. Las que llevan `casa: null` son las que el
 * pack NO puede dar y hay que resolver aparte -y estan marcadas para que eso no
 * se olvide en vez de aparecer como un hueco vacio en una captura.
 */
export const PARCELAS = [
  // ── orilla oeste: donde se vive ────────────────────────────────────────────
  //
  // Dos manzanas al norte y dos al sur, con la calle del porton entre ellas.
  // Las casas van pegadas de dos en dos y solo hay una celda de separacion:
  // eso es lo que hace una calle en vez de un descampado.
  { nombre: "casa-porton-norte", papel: "casa", celda: [1, 2], casa: "casa-larga" },
  { nombre: "casa-porton-sur", papel: "casa", celda: [1, 5], casa: "casa-simple" },
  { nombre: "casa-calle-1", papel: "casa", celda: [4, 2], casa: "casa-alta" },
  { nombre: "casa-calle-2", papel: "casa", celda: [4, 5], casa: "casa-larga" },
  { nombre: "casa-rio-1", papel: "casa", celda: [7, 2], casa: "casa-simple" },
  { nombre: "posada", papel: "posada", celda: [7, 5], casa: "casa-alta" },
  { nombre: "casa-rio-2", papel: "casa", celda: [10, 2], casa: "casa-larga" },
  { nombre: "casa-rio-3", papel: "casa", celda: [10, 5], casa: "casa-larga" },

  // Manzana sur, al otro lado de la calle del porton.
  { nombre: "casa-calle-3", papel: "casa", celda: [1, 12], casa: "casa-larga" },
  { nombre: "casa-calle-4", papel: "casa", celda: [1, 15], casa: "casa-simple" },
  { nombre: "casa-calle-5", papel: "casa", celda: [9, 12], casa: "casa-alta" },
  { nombre: "casa-calle-6", papel: "casa", celda: [9, 15], casa: "casa-larga" },

  // La plaza del mercado: no se construye, se deja libre y se llena de barriles.
  // Da a la calle del porton por el norte y al puente por el este, que es el
  // camino que hace el que vuelve del agujero con algo que vender.
  { nombre: "mercado", papel: "mercado", celda: [4, 12], ancho: 4, fondo: 4, casa: null },

  // ── orilla este: donde se controla ─────────────────────────────────────────
  //
  // Las cuatro parcelas que el pack no puede dar. Estan aqui desde el principio
  // para que el plano este completo y el hueco se vea, en vez de descubrirlo al
  // construir.
  {
    // Fondo 2 y no 4: con 4 se comia el patio de control, que empieza en z=11.
    // Lo cazo la comprobacion de solapes, no una captura -desde fuera, dos
    // parcelas encajadas se ven como una pared.
    // 3x3 celdas y no 3x2. El tamano lo decidio una medida, no el dibujo: la
    // escalera de piedra del pack sube 1,015 m por cada 2,183 m de tramo, asi
    // que bajar los 4 m del crater pide 8,73 m de carrera. En 8 m de fondo no
    // cabe, y forzarla habria dado una escalera mas empinada que ninguna pieza
    // del pack -o sea, escalones flotando sobre la roca.
    // La celda x=16 y no 15, y la movió una sonda de marcha.
    //
    // El labio del cráter se sale 0,35 m de su propia parcela, así que con la
    // boca en x=15 su borde oeste caía en 59,65 m — y la orilla este del río, en
    // esas filas, está en 60,6. O sea que el socavón y el río se pisaban: la
    // valla de la orilla quedaba plantada DENTRO del cráter, y quien la tocaba
    // por el suroeste acababa dentro del agujero sin pasar por la reja.
    //
    // No lo veía nada. El plano de celdas dice que la parcela 15 no es río, y es
    // verdad; lo que se sale no es la parcela, es la roca que la parcela dice
    // que contiene. Una celda al este deja 2,7 m entre el agua y el labio.
    nombre: "boca-mazmorra", papel: "boca", celda: [16, 5], ancho: 3, fondo: 3, casa: null,
    // El brocal y la reja ya no faltan: el brocal sale de `stone_square_half_1m`
    // repetido por el labio y la reja de dos hojas de `door_stone_metal_grate`.
    // Lo que sigue sin existir es el herraje del torno.
    falta: "la manivela y el herraje del torno; el tambor y la cuerda si se generan",
  },
  // Estas tres estaban con `casa: null` y trazo discontinuo en el plano. Lo que
  // faltaba no era geometria: `stone_square` es un muro como cualquier otro, asi
  // que la guarnicion y la herreria caben en el mismo planHouse que las casas y
  // salen del catalogo como ellas. Lo que sigue sin existir se queda declarado
  // en `falta`, que es distinto de que la parcela este vacia.
  {
    nombre: "puesto-guardia", papel: "guarnicion", celda: [15, 1], ancho: 3, fondo: 3,
    casa: "torre-guardia",
    falta: "la empalizada; el pack no trae estacada ni valla de ningun tipo",
  },
  {
    nombre: "cuartel", papel: "guarnicion", celda: [15, 11], ancho: 3, fondo: 3,
    casa: "cuartel",
  },
  {
    nombre: "herreria", papel: "herreria", celda: [15, 15], ancho: 2, fondo: 2,
    casa: "herreria",
    falta: "el yunque y la manivela del torno; candidatos a modelar en Blender",
  },

  // El paso obligado: entre el puente y la boca no hay mas que este patio. Toca
  // el puente por el oeste y la boca por el norte, y nada mas lo toca.
  { nombre: "patio-control", papel: "patio", celda: [15, 8], ancho: 4, fondo: 2, casa: null },
];

/** Por donde llega el jugador. Dentro del pueblo, con el porton ya cerrado. */
export const LLEGADA = [1, 9];

/** El porton de llegada, cerrado. En este experimento no se abre. */
export const PORTON = { celda: [0, 8], fondo: 2, cara: "oeste" };

// --- lo que se deriva del plano ---------------------------------------------

/** El rectangulo de celdas que ocupa una parcela, con sus valores por defecto. */
export function rect(p) {
  return {
    x: p.celda[0],
    z: p.celda[1],
    ancho: p.ancho ?? 2,
    fondo: p.fondo ?? 2,
  };
}

/** True si la celda (x, z) esta mojada. */
export function esRio(x, z) {
  const fila = RIO.find((f) => f[0] === z);
  if (!fila) return false;
  return x >= fila[1] && x < fila[1] + fila[2];
}

/** True si la celda (x, z) es el puente. */
export function esPuente(x, z) {
  return z === PUENTE.z && x >= PUENTE.x && x < PUENTE.x + PUENTE.ancho;
}

/** La parcela que ocupa la celda (x, z), o null. */
export function parcelaEn(x, z) {
  for (const p of PARCELAS) {
    const r = rect(p);
    if (x >= r.x && x < r.x + r.ancho && z >= r.z && z < r.z + r.fondo) return p;
  }
  return null;
}

/**
 * El mapa de lo que se puede pisar.
 *
 * Se pisa la calle, el puente, y las parcelas que no son edificio -el mercado,
 * el patio, la boca. Una casa no se pisa: es un bloque. La boca SI se pisa,
 * porque el objetivo de la comprobacion es llegar hasta ella; que este sellada
 * es cosa de un permiso, no de la geometria.
 */
export function transitable(x, z) {
  if (x < 0 || z < 0 || x >= ANCHO || z >= FONDO) return false;
  if (esRio(x, z) && !esPuente(x, z)) return false;
  const p = parcelaEn(x, z);
  if (!p) return true;
  return ["mercado", "patio", "boca"].includes(p.papel);
}

/**
 * Inunda el pueblo desde una celda y devuelve el conjunto de celdas alcanzadas.
 *
 * Es la comprobacion que el experimento 02 dejo pendiente por escrito: que la
 * puerta lleve a alguna parte. Un pueblo puede sellar en qbsp, medir bien y
 * salir precioso en las capturas con el puente olvidado, y entonces no hay forma
 * de llegar a lo unico que hay que hacer en el.
 *
 * En cuatro direcciones y no en ocho: cruzar en diagonal entre dos esquinas de
 * casa es un paso que el jugador no puede dar, y contarlo daria por buena una
 * calle que no existe.
 */
export function alcanzables(desde = LLEGADA) {
  const vistas = new Set();
  if (!transitable(desde[0], desde[1])) return vistas;
  const cola = [desde];
  vistas.add(desde.join(","));
  while (cola.length) {
    const [x, z] = cola.pop();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      const clave = `${nx},${nz}`;
      if (vistas.has(clave) || !transitable(nx, nz)) continue;
      vistas.add(clave);
      cola.push([nx, nz]);
    }
  }
  return vistas;
}

/** Las celdas de una parcela, para preguntar si alguna se alcanza. */
export function celdasDe(nombre) {
  const p = PARCELAS.find((q) => q.nombre === nombre);
  if (!p) throw new Error(`parcela desconocida: ${nombre}`);
  const r = rect(p);
  const out = [];
  for (let x = r.x; x < r.x + r.ancho; x++) {
    for (let z = r.z; z < r.z + r.fondo; z++) out.push([x, z]);
  }
  return out;
}

/** Lo que falta por resolver, sacado del propio plano y no de una lista aparte. */
export function pendientes() {
  return PARCELAS.filter((p) => p.falta).map((p) => ({ parcela: p.nombre, falta: p.falta }));
}
