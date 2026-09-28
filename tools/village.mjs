// Construye el pueblo: de un plano de planta dibujado a mano a public/maps/pueblo.map
//
//   node tools/village.mjs                     relieve escalonado -> pueblo.map
//   node tools/village.mjs --relieve=rampas    pendientes de verdad -> pueblo-rampas.map
//
// Los dos salen del MISMO plano y de la misma tabla de casas. Lo unico que
// cambia es como se emite el suelo, que es justo lo que hay que poder comparar:
// si cambiara algo mas, la comparacion no diria nada sobre el relieve.
//
// El plano de abajo es la unica parte escrita a mano, y se lee como un mapa
// visto desde arriba. Todo lo demas -brushes, tejados, entidades, sellado- lo
// calcula el emisor. Es la regla del experimento 02: no pedir al modelo que
// invente geometria, calcularla.

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MapBuilder, box, gable, ring, slab, panelWithHoles, readPlan, runs,
} from "../src/map/emit.js";
import { heightField, worstStep, highestUnder, STEP, RANGE } from "../src/map/relief.js";
import {
  cornerField, levelCell, heightAtCell, highestCorner, worstDrop, worstSlopeDeg,
  MAX_SLOPE_DEG,
} from "../src/map/slope.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Que relieve se emite. 'escalones' es el de relief.js: una cota por celda y
// un peldano entre celdas. 'rampas' es el de slope.js: una cota por esquina y
// la celda inclinada entre ellas.
const MODE = process.argv.find((a) => a.startsWith("--relieve="))?.split("=")[1] ?? "escalones";
if (MODE !== "escalones" && MODE !== "rampas") {
  console.error(`FALLO: relieve desconocido '${MODE}'; usa escalones o rampas`);
  process.exit(2);
}
const RAMPS = MODE === "rampas";
const OUT_NAME = RAMPS ? "pueblo-rampas" : "pueblo";

// Con rampas el desnivel puede ser mucho mayor que con escalones y seguir
// siendo comodo de andar: lo que molesta de un escalon no es la altura, es el
// canto. 48 unidades son metro y medio de diferencia entre lo mas alto y lo
// mas bajo del pueblo, que es lo que se ve en la referencia.
const RAMP_RANGE = 48;

// --- el plano --------------------------------------------------------------
//
//   #  muralla        .  hierba         ,  camino de tierra
//   o  plaza empedrada  w  pozo         t  arbol
//   =  porton de la muralla
//   A-Z  casas: cada letra es una casa, y su rectangulo es su planta
//   @  donde aparece el jugador

const PLAN = `
// El pueblo. Una calle de norte a sur, una plaza en medio, casas a los lados.
##########################
#.....t..........t.......#
#..AAA...,,,,,,,,...CCC..#
#..AAA...,......,...CCC..#
#.t......,......,......t.#
#..BBBB..,......,..DDDD..#
#..BBBB..,......,..DDDD..#
#........,......,........#
#...,,,,,,,,,,,,,,,,,,...#
#...,oooooooooooooooo,...#
#..E,oooooo,ww,oooooo,G..#
#..E,oooooo,ww,oooooo,G..#
#...,oooooooooooooooo,...#
#...,,,,,,,,,,,,,,,,,,...#
#........,......,........#
#..FFFF..,......,..HHHH..#
#..FFFF..,......,..HHHH..#
#.t......,......,......t.#
#..III...,,,@,,,,...JJJ..#
#..III......,....t.......#
#...........,............#
############=#############
`;

// Altura de muro y subida de tejado de cada casa, en unidades. 128 unidades
// son cuatro metros. El caballete corre en el lado largo de la planta salvo
// que se diga otra cosa.
const HOUSES = {
  A: { wall: 160, rise: 96 },
  B: { wall: 192, rise: 112, axis: "x" },
  C: { wall: 160, rise: 96 },
  D: { wall: 224, rise: 128, axis: "x" },
  E: { wall: 128, rise: 80 },
  F: { wall: 192, rise: 112, axis: "x" },
  G: { wall: 128, rise: 80 },
  H: { wall: 208, rise: 120, axis: "x" },
  I: { wall: 176, rise: 104 },
  J: { wall: 176, rise: 104 },
};

const CELL = 128;        // unidades por celda del plano: cuatro metros
const SUB = 2;           // subdivisiones por celda para el relieve: losas de 2 m
const GROUND = 64;       // grosor de la losa de suelo
const WALL_TOP = 256;    // altura de la muralla
const SKY_TOP = 512;     // donde empieza la tapa de cielo
const SKY_THICK = 64;

// Escala de textura del suelo. Con escala 1 una tesela de 128 px cubre 128
// unidades, o sea cuatro metros: la hierba sale como una alfombra estampada y
// los adoquines como losas de un metro. A 0,5 la tesela cubre dos metros, que
// es lo que hace que se lea como hierba y como adoquin.
const GROUND_ALIGN = "0 0 0 0.5 0.5";

// Escala de textura para las piezas pequenas: postes, vigas, barriles, cubos.
// Con escala 1 una tesela cubre cuatro metros, asi que un poste de medio metro
// ensena un octavo de la textura y sale de un color liso: la madera deja de
// parecer madera y parece hormigon pintado. A 0,25 la tesela cubre un metro.
const PROP_ALIGN = "0 0 0 0.25 0.25";

// Cuantas siluetas de arbusto hay en public/textures/veg. Ocho matas iguales
// repetidas cien veces se leen como un patron, no como vegetacion.
const BUSH_VARIANTS = 8;

// El pozo, en unidades. Un pozo de verdad tiene poco mas de metro y medio de
// brocal: 52 unidades de diametro exterior son 1,6 m. El anterior media 136,
// o sea 4,25 m, y por eso parecia un aljibe.
const WELL_BORE = 26;     // la boca: 0,8 m
const WELL_RIN = 13;      // radio interior del brocal
const WELL_ROUT = 26;     // radio exterior: 1,6 m de diametro
const WELL_RIM_H = 40;    // altura del brocal sobre la base
const WELL_BASE_R = 46;   // la plataforma de piedra de debajo
const WELL_BASE_H = 10;

// Que textura lleva cada caracter del plano, arriba y en el canto.
const FLOOR = {
  // El canto lleva la MISMA textura que la superficie. Con el relieve, esos
  // cantos son los escalones, y ponerles ladrillo hace que un pliegue del
  // suelo se lea como un tablon tirado en la plaza. Un escalon de hierba tiene
  // que ser de hierba y uno de adoquin de adoquin.
  ".": { top: "grass01", side: "grass01" },
  ",": { top: "road01", side: "road01" },
  o: { top: "floor01", side: "floor01" },
  w: { top: "floor01", side: "floor01" },
  t: { top: "grass01", side: "grass01" },
  "@": { top: "road01", side: "road01" },
};

const { grid, width, height } = readPlan(PLAN);

// El plano se dibuja con la primera fila arriba; en el mapa, arriba es +Y. Sin
// esta vuelta el pueblo sale reflejado y las capturas no se corresponden con
// el dibujo, que es justo lo que hace imposible depurarlo mirando.
const cellX = (x) => x * CELL;
const cellY = (y) => (height - 1 - y) * CELL;

const map = new MapBuilder();

// --- relieve ---------------------------------------------------------------
//
// Micro-elevaciones escalonadas. El campo va sobre una rejilla mas fina que el
// plano -losas de dos metros, no de cuatro- porque con celdas grandes el
// escalonado se lee como terrazas en vez de como un suelo que no esta plano.
//
// relief.js garantiza que dos celdas vecinas no se llevan mas de un escalon.
// Eso no es un detalle estetico: un salto de dos escalones es un muro de medio
// metro que el jugador no sube, y el pueblo se partiria en trozos
// incomunicados sin que nada fallara.
const GW = width * SUB;
const GH = height * SUB;
const SUBCELL = CELL / SUB;

const field = RAMPS
  ? null
  : heightField(GW, GH, { wavelength: 9, range: RANGE, step: STEP });
// Con rampas la altura vive en las ESQUINAS: una rejilla de GW x GH celdas
// tiene (GW+1) x (GH+1) esquinas, y cada celda es la superficie inclinada que
// queda entre las cuatro suyas. Compartir las esquinas es lo que hace que dos
// celdas encajen sin rendija, que es de lo que depende el sellado.
const corners = RAMPS
  ? cornerField(GW, GH, {
      cell: SUBCELL,
      wavelength: 9 * SUB,
      range: RAMP_RANGE,
      maxSlopeDeg: MAX_SLOPE_DEG,
    })
  : null;

// El desnivel mas grande entre dos vecinas, comprobado y no supuesto. Es la
// misma garantia en los dos modos, con distinto limite: escalonado no puede
// pasar de un peldano, y con rampas no puede pasar de la pendiente que el
// jugador sube. Las dos se rompen en silencio -el pueblo se parte en trozos
// incomunicados y nada falla-, asi que las dos se miden aqui.
// Se mide mas abajo, despues de nivelar la celda del pozo: nivelar tambien
// toca el campo, y comprobar antes seria comprobar un campo que ya no existe.
let worst = 0;

// El pozo se localiza antes que el suelo, porque el suelo tiene que dejarle el
// hueco. Se coge la celda fina del centro del grupo de celdas 'w': asi el
// brocal queda centrado sobre su propio pozo y no a caballo entre dos.
const wellCells = [];
grid.forEach((row, y) => row.forEach((ch, x) => { if (ch === "w") wellCells.push([x, y]); }));
let shaft = null;
if (wellCells.length) {
  const xs = wellCells.map((c) => c[0]);
  const ys = wellCells.map((c) => c[1]);
  shaft = {
    i: Math.floor(((Math.min(...xs) + Math.max(...xs) + 1) / 2) * SUB) - 1,
    j: Math.floor(((Math.min(...ys) + Math.max(...ys) + 1) / 2) * SUB) - 1,
  };
}

const subX = (i) => i * SUBCELL;
const subY = (j) => (GH - 1 - j) * SUBCELL;
/** Caracter del plano bajo una celda fina. */
const charAt = (i, j) => grid[Math.floor(j / SUB)][Math.floor(i / SUB)];

// Con rampas hay que nivelar la celda del pozo antes de emitir nada: el brocal
// y su marco de suelo son piezas horizontales, y sobre una ladera dejarian una
// esquina en el aire. Se nivela BAJANDO, nunca subiendo, para no romper el
// limite de pendiente de las celdas de alrededor.
const wellPad = RAMPS && shaft ? levelCell(corners, shaft.i, shaft.j) : null;

// El desnivel mas grande entre dos vecinas, comprobado y no supuesto. Es la
// misma garantia en los dos modos con distinto limite: escalonado no puede
// pasar de un peldano, y con rampas no puede pasar de la pendiente que el
// jugador sube. Las dos se rompen en silencio -el pueblo se parte en trozos
// incomunicados y nada falla-, asi que las dos se miden.
worst = RAMPS ? worstDrop(corners) : worstStep(field);
if (RAMPS && worst > corners.maxDrop) {
  console.error(
    `FALLO: desnivel de ${worst} unidades entre esquinas vecinas; el maximo es ${corners.maxDrop}`
  );
  process.exit(1);
}
if (!RAMPS && worst > STEP) {
  console.error(`FALLO: hay un salto de ${worst} unidades entre celdas vecinas`);
  process.exit(1);
}

// --- el terreno, visto desde el resto del emisor --------------------------
//
// Las dos formas de relieve se consultan por aqui y no directamente, para que
// todo lo que se apoya en el suelo -casas, arboles, matas, barriles, el pozo-
// siga siendo el mismo codigo en los dos mapas. Si cada modo tuviera su copia,
// la comparacion entre los dos dejaria de hablar solo del suelo.

/** Esquina (ci, cj) de la rejilla fina, en unidades. Solo con rampas. */
const corner = (ci, cj) => corners.get(ci, cj);

/** Altura en un punto cualquiera del mundo, en unidades. */
const zUnits = RAMPS
  ? (x, y) => heightAtCell(corners, x / SUBCELL, GH - y / SUBCELL)
  : (x, y) => field.get(Math.round(x / SUBCELL), GH - 1 - Math.round(y / SUBCELL));

/** Altura de una celda del PLANO, no de la rejilla fina. */
const zPlanCell = RAMPS
  ? (x, y) => zUnits(cellX(x) + CELL / 2, cellY(y) + CELL / 2)
  : (x, y) => field.get(x * SUB, y * SUB);

/** Cota de una celda fina, para apoyar encima algo horizontal. */
const zSub = RAMPS
  ? (i, j) => Math.max(corner(i, j), corner(i + 1, j), corner(i, j + 1), corner(i + 1, j + 1))
  : (i, j) => field.get(i, j);

/** La cota mas alta bajo un rectangulo de celdas finas. */
const highest = RAMPS
  ? (i0, j0, i1, j1) => highestCorner(corners, i0, j0, i1, j1)
  : (i0, j0, i1, j1) => highestUnder(field, i0, j0, i1, j1);

// El fondo de todas las losas: una cota unica por debajo de lo mas bajo del
// pueblo. Que sea unica es lo que evita que entre dos losas a distinto nivel
// quede una rendija por la que se ve el vacio.
const GROUND_MIN = RAMPS ? corners.min : field.min;
const BOTTOM = GROUND_MIN - GROUND;

// --- suelo -----------------------------------------------------------------
//
// Un brush por tramo seguido de la misma textura Y la misma altura. Sin fundir
// los tramos serian mas de dos mil losas; con el relieve fundir solo vale
// cuando ademas coincide la altura, asi que salen unas cuantas mas que antes.
let floorBrushes = 0;

/** El marco de cuatro tiras alrededor de la boca del pozo, a una cota plana. */
function wellFrame(i, j, z, material) {
  const a0 = subX(i), b0 = subY(j);
  const m = (SUBCELL - WELL_BORE) / 2;
  for (const [rx0, ry0, rx1, ry1] of [
    [0, 0, SUBCELL, m],
    [0, SUBCELL - m, SUBCELL, SUBCELL],
    [0, m, m, SUBCELL - m],
    [SUBCELL - m, m, SUBCELL, SUBCELL - m],
  ]) {
    map.add(box([a0 + rx0, b0 + ry0, BOTTOM], [a0 + rx1, b0 + ry1, z], material, GROUND_ALIGN));
    floorBrushes++;
  }
}

if (RAMPS) {
  // Una celda, dos prismas. Aqui no se pueden fundir tramos seguidos como en
  // el modo escalonado: cada celda tiene su propia inclinacion, asi que dos
  // celdas contiguas no comparten cara de arriba aunque compartan textura.
  for (let j = 0; j < GH; j++) {
    for (let i = 0; i < GW; i++) {
      const ch = charAt(i, j);
      const tex = FLOOR[ch] ?? (HOUSES[ch] ? FLOOR["."] : null);
      const material = ch === "#" || ch === "=" ? { top: "wall01", side: "wall01" } : tex;
      if (!material) continue;
      if (shaft && i === shaft.i && j === shaft.j) {
        wellFrame(i, j, wellPad, material);
        continue;
      }
      map.add(
        slab(
          [subX(i), subY(j)],
          [subX(i) + SUBCELL, subY(j) + SUBCELL],
          BOTTOM,
          // En el orden que pide slab: (x0,y0), (x1,y0), (x1,y1), (x0,y1).
          [corner(i, j + 1), corner(i + 1, j + 1), corner(i + 1, j), corner(i, j)],
          material,
          GROUND_ALIGN
        )
      );
      floorBrushes += 2;
    }
  }
} else
for (let j = 0; j < GH; j++) {
  let i = 0;
  while (i < GW) {
    const ch = charAt(i, j);
    const z = field.get(i, j);
    let end = i;
    while (end + 1 < GW && charAt(end + 1, j) === ch && field.get(end + 1, j) === z) end++;

    const tex = FLOOR[ch] ?? (HOUSES[ch] ? FLOOR["."] : null);
    const material = ch === "#" || ch === "=" ? { top: "wall01", side: "wall01" } : tex;
    // El hueco del pozo. La losa de su celda no se emite entera: se emite un
    // marco de cuatro tiras alrededor de una boca de WELL_BORE unidades. Antes
    // el hueco era la celda completa, 64 unidades, y eso obligaba a un brocal
    // de cuatro metros y cuarto de diametro: un aljibe, no un pozo.
    const onShaftRow = shaft && j === shaft.j;
    // El tramo que llega al pozo se corta justo antes; el que empieza en el
    // pozo se corta para que mida exactamente esa celda. Sin la segunda linea
    // se salta el tramo ENTERO y el suelo se queda con un boquete de varios
    // metros: qbsp lo cazo como fuga, que es para lo que esta.
    if (onShaftRow && i < shaft.i && end >= shaft.i) end = shaft.i - 1;
    if (onShaftRow && i === shaft.i) end = shaft.i;
    if (material && onShaftRow && i === shaft.i) {
      // Las cuatro tiras del marco. Dejan una boca centrada de WELL_BORE
      // unidades, que es la que hace de pozo.
      wellFrame(i, j, z, material);
    } else if (material) {
      // La losa baja siempre hasta el mismo fondo, no un grosor fijo desde su
      // cota: si cada una colgara de su propia altura, entre dos losas a
      // distinto nivel quedaria una rendija por la que se ve el vacio.
      map.add(
        box(
          [subX(i), subY(j), BOTTOM],
          [subX(end) + SUBCELL, subY(j) + SUBCELL, z],
          material,
          GROUND_ALIGN
        )
      );
      floorBrushes++;
    }
    i = end + 1;
  }
}

// --- muralla ---------------------------------------------------------------

// --- porton ----------------------------------------------------------------
//
// Un pueblo amurallado sin puerta no se lee como un pueblo. Pero un hueco en
// la muralla es una fuga: qbsp no sellaria y con razon, porque el mundo
// quedaria abierto al vacio. Asi que el porton va CERRADO, con dos hojas de
// madera que llenan el vano, que ademas es lo que tendria un pueblo de verdad
// a según qué horas.
const GATE_H = 152;
let gateBrushes = 0;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (grid[y][x] !== "=") continue;
    const gx0 = cellX(x), gx1 = cellX(x + 1);
    const gy0 = cellY(y), gy1 = cellY(y) + CELL;
    const foot = BOTTOM;
    const JAMB = 26;   // ancho de cada jamba
    const LEAF = 32;   // grosor de las hojas

    // El vano es un TUNEL a traves de la muralla, que tiene un metro de
    // grosor. Asi que el hueco corre en la direccion en la que se anda, y las
    // jambas van a los lados. Ponerlas cruzando el paso -que fue el primer
    // intento- tapia el porton entero: sella igual de bien y se ve ladrillo
    // macizo donde tendria que haber puerta.
    map.add(box([gx0, gy0, foot], [gx0 + JAMB, gy1, WALL_TOP], { top: "ceil01", side: "wall01" }));
    map.add(box([gx1 - JAMB, gy0, foot], [gx1, gy1, WALL_TOP], { top: "ceil01", side: "wall01" }));
    // Dintel, de jamba a jamba y de lado a lado del grosor.
    map.add(box([gx0 + JAMB, gy0, GATE_H], [gx1 - JAMB, gy1, WALL_TOP], { top: "ceil01", side: "wall01" }));
    gateBrushes += 3;

    // Las hojas, a ras de la cara exterior. Lo que queda por dentro es un
    // pasadizo en el que se entra, que es lo que hace que se lea como porton
    // y no como una puerta pintada en un muro.
    //
    // Son ellas las que sellan el mundo: si dejaran una rendija de una unidad
    // entre si o contra la jamba, qbsp encontraria fuga -- y con razon, porque
    // al otro lado de esa rendija esta el vacio.
    const outer = gy0 < (height * CELL) / 2 ? gy0 : gy1 - LEAF;
    const mid = (gx0 + gx1) / 2;
    map.add(box([gx0 + JAMB, outer, foot], [mid, outer + LEAF, GATE_H], "door01", "0 0 0 0.5 0.5"));
    map.add(box([mid, outer, foot], [gx1 - JAMB, outer + LEAF, GATE_H], "door01", "0 0 0 0.5 0.5"));
    gateBrushes += 2;

    // Dos faroles en las jambas, dentro del pasadizo. Es lo que hace que de
    // noche se vea desde lejos que ahi hay una puerta.
    const inward = gy0 < (height * CELL) / 2 ? 1 : -1;
    for (const px of [gx0 + JAMB + 16, gx1 - JAMB - 16]) {
      map.point("light", [px, (gy0 + gy1) / 2 - inward * 24, GATE_H - 48], { light: 240 });
    }
  }
}

let wallBrushes = 0;
for (const run of runs(grid)) {
  if (run.ch !== "#") continue;
  map.add(
    box(
      // Desde por debajo de la cota mas baja del pueblo, no desde cero: con el
      // relieve, una muralla que arrancara en cero dejaria una rendija abierta
      // donde el terreno baja, y ahi qbsp encontraria fuga.
      [cellX(run.x0), cellY(run.y), BOTTOM],
      [cellX(run.x1 + 1), cellY(run.y) + CELL, WALL_TOP],
      { top: "ceil01", side: "wall01" }
    )
  );
  wallBrushes++;
}

// --- casas -----------------------------------------------------------------
//
// El rectangulo de cada casa sale del plano. Se comprueba que la letra llene
// ese rectangulo entero: una casa en forma de L no es un brush convexo y
// saldria con agujeros, y el sintoma seria una pared que falta, no un error.

const found = new Map();
grid.forEach((row, y) =>
  row.forEach((ch, x) => {
    if (!HOUSES[ch]) return;
    const r = found.get(ch) ?? { x0: x, x1: x, y0: y, y1: y, cells: 0 };
    r.x0 = Math.min(r.x0, x); r.x1 = Math.max(r.x1, x);
    r.y0 = Math.min(r.y0, y); r.y1 = Math.max(r.y1, y);
    r.cells++;
    found.set(ch, r);
  })
);

const problems = [];
for (const letter of Object.keys(HOUSES)) {
  if (!found.has(letter)) problems.push(`la casa ${letter} esta en la tabla y no en el plano`);
}
for (const [letter, r] of found) {
  const w = r.x1 - r.x0 + 1;
  const h = r.y1 - r.y0 + 1;
  if (r.cells !== w * h) {
    problems.push(`la casa ${letter} no es rectangular: ${r.cells} celdas en un ${w}x${h}`);
  }
}
if (problems.length) {
  for (const p of problems) console.error("FALLO:", p);
  process.exit(1);
}

let houseBrushes = 0;
for (const [letter, r] of found) {
  const spec = HOUSES[letter];
  const x0 = cellX(r.x0) + 8;
  const x1 = cellX(r.x1 + 1) - 8;
  const y0 = cellY(r.y1) + 8;
  const y1 = cellY(r.y0) + CELL - 8;

  // La casa se asienta sobre la cota mas ALTA de su huella, no sobre la media:
  // con la media, la esquina mas alta del terreno atravesaria el suelo de la
  // casa. En la realidad se resuelve igual, con un zocalo nivelado, asi que el
  // zocalo se emite tambien y ademas se ve.
  const base = highest(r.x0 * SUB, r.y0 * SUB, (r.x1 + 1) * SUB - 1, (r.y1 + 1) * SUB - 1);
  map.add(
    box([x0 - 6, y0 - 6, BOTTOM], [x1 + 6, y1 + 6, base], {
      top: "wall01",
      side: "wall01",
    })
  );

  // --- la fachada -----------------------------------------------------------
  //
  // La casa da a la calle. Cual de los cuatro lados es la fachada no se elige
  // a mano: se cuenta en el plano cuantas celdas de calle hay pegadas a cada
  // lado y gana el que mas tiene. Con las casas colocadas a mano en un plano,
  // poner la puerta al lado equivocado es facilisimo y no da ningun error:
  // simplemente queda una puerta mirando a un campo.
  const street = (x, y) =>
    y >= 0 && y < height && x >= 0 && x < width && ",o@".includes(grid[y][x]);
  const sides = [
    { name: "sur", n: count(r.x0, r.x1, r.y1 + 1, "x"), axis: "y", at: y0, dir: -1 },
    { name: "norte", n: count(r.x0, r.x1, r.y0 - 1, "x"), axis: "y", at: y1, dir: 1 },
    { name: "oeste", n: count(r.y0, r.y1, r.x0 - 1, "y"), axis: "x", at: x0, dir: -1 },
    { name: "este", n: count(r.y0, r.y1, r.x1 + 1, "y"), axis: "x", at: x1, dir: 1 },
  ];
  function count(a0, a1, fixed, along) {
    let n = 0;
    for (let a = a0; a <= a1; a++) n += street(along === "x" ? a : fixed, along === "x" ? fixed : a) ? 1 : 0;
    return n;
  }
  const front = sides.reduce((best, s) => (s.n > best.n ? s : best), sides[0]);

  // Variedad, de la letra de la casa. Determinista: el mismo plano da siempre
  // el mismo pueblo, que es lo que permite comparar capturas.
  const seed = letter.charCodeAt(0);
  const rnd = (k) => ((seed * 2654435761 + k * 40503) >>> 8) % 1000 / 1000;
  const skin = rnd(1) < 0.4 ? "wall01" : "plaster01";
  const DEPTH = 7;          // cuanto se hunde el hueco: da sombra y profundidad
  const DOOR_W = 52;
  const DOOR_H = 104;
  const WIN = 34;

  // El cuerpo se mete hacia dentro por el lado de la fachada, y la fachada se
  // monta encima en piezas. Asi el hueco queda hundido de verdad y no es una
  // mancha pintada.
  const body = { x0, x1, y0, y1 };
  if (front.axis === "y") body[front.dir < 0 ? "y0" : "y1"] += DEPTH * -front.dir;
  else body[front.dir < 0 ? "x0" : "x1"] += DEPTH * -front.dir;
  map.add(
    box([body.x0, body.y0, base], [body.x1, body.y1, base + spec.wall], {
      top: "wood01",
      side: skin,
    })
  );
  houseBrushes += 2;

  // Coordenadas del panel: u a lo ancho de la fachada, v a lo alto.
  const along = front.axis === "y" ? [x0, x1] : [y0, y1];
  const wide = along[1] - along[0];
  const panel = { u0: along[0], u1: along[1], v0: base, v1: base + spec.wall };

  const doorU = along[0] + wide * (0.3 + rnd(2) * 0.4);
  const door = {
    u0: Math.round(doorU - DOOR_W / 2),
    u1: Math.round(doorU + DOOR_W / 2),
    v0: base,
    v1: base + DOOR_H,
  };

  // Ventanas a los lados de la puerta, sin pisarla. Cuantas caben depende del
  // ancho: una casa estrecha con tres ventanas queda como una vitrina.
  const windows = [];
  const sill = base + Math.round(spec.wall * 0.45);
  for (const t of [0.12, 0.32, 0.68, 0.88]) {
    const u = Math.round(along[0] + wide * t);
    const w = { u0: u - WIN / 2, u1: u + WIN / 2, v0: sill, v1: sill + WIN };
    if (w.v1 > panel.v1 - 12) continue;
    if (w.u1 > door.u0 - 10 && w.u0 < door.u1 + 10) continue;
    if (w.u0 < panel.u0 + 8 || w.u1 > panel.u1 - 8) continue;
    windows.push(w);
  }
  if (windows.length > 2 && rnd(3) < 0.5) windows.length = 2;

  /** Una pieza del panel, de coordenadas de panel a coordenadas del mapa. */
  const piece = (u0, v0, u1, v1, texture, depth = DEPTH) => {
    const near = front.at;
    const far = front.at + depth * front.dir * -1;
    const lo = Math.min(near, far);
    const hi = Math.max(near, far);
    const a = front.axis === "y" ? [u0, lo] : [lo, u0];
    const b = front.axis === "y" ? [u1, hi] : [hi, u1];
    map.add(box([a[0], a[1], v0], [b[0], b[1], v1], texture));
    houseBrushes++;
  };

  panelWithHoles(panel, [door, ...windows], (u0, v0, u1, v1) =>
    piece(u0, v0, u1, v1, { top: skin, side: skin })
  );

  // La hoja de la puerta y las contraventanas, al fondo del hueco. Sin ellas
  // el hueco es un agujero negro, que a esta resolucion se lee como un error
  // de geometria y no como una puerta.
  piece(door.u0 + 3, door.v0, door.u1 - 3, door.v1 - 4, "door01", DEPTH - 3);
  for (const w of windows) {
    piece(w.u0 + 2, w.v0 + 2, w.u1 - 2, w.v1 - 2, "wood01", DEPTH - 3);
  }

  // Chimenea en algunas, sobre el faldon. Es lo que mas distingue una casa de
  // otra desde lejos, que es de donde se ven.
  if (rnd(4) < 0.6) {
    const cx = x0 + (x1 - x0) * (0.25 + rnd(5) * 0.5);
    const cy = y0 + (y1 - y0) * 0.5;
    map.add(
      box(
        [Math.round(cx) - 14, Math.round(cy) - 14, base + spec.wall],
        [Math.round(cx) + 14, Math.round(cy) + 14, base + spec.wall + spec.rise + 28],
        "wall01"
      )
    );
    houseBrushes++;
  }

  // El caballete corre por el lado largo si no se dice otra cosa: al reves, una
  // casa alargada sale con un tejado imposible.
  const axis = spec.axis ?? (x1 - x0 >= y1 - y0 ? "x" : "y");
  const roof = gable([x0, y0], [x1, y1], base + spec.wall, spec.rise, axis, 10, {
    roof: "roof01",
    // El hastial es pared, no tejado: con madera clara, desde el testero la
    // casa parece tener el tejado palido en vez de rojo.
    gable: skin,
  });
  map.add(roof);
  houseBrushes += roof.length;

  // Una luz dentro de cada casa no sirve de nada -son macizas-, pero una en la
  // fachada si: es lo que hace que el pueblo se lea de noche.
  map.point("light", [(x0 + x1) / 2, y0 - 24, base + spec.wall * 0.7], { light: 220 });
}

// --- pozo, arboles y entidades --------------------------------------------

let trees = 0;
let well = null;
grid.forEach((row, y) =>
  row.forEach((ch, x) => {
    const cx = cellX(x) + CELL / 2;
    const cy = cellY(y) + CELL / 2;
    // Todo lo que se apoya en el suelo tiene que consultar el terreno. Un
    // tronco que arrancara en cero quedaria flotando o enterrado segun la
    // celda, y ninguna de las dos cosas da error.
    const z = zPlanCell(x, y);
    if (ch === "t") {
      // Un tronco macizo de 40 unidades, para que el arbol pare al jugador. El
      // follaje es un cartel del lado del render y no colisiona con nada.
      map.add(box([cx - 20, cy - 20, BOTTOM], [cx + 20, cy + 20, z + 160], "bark01"));
      map.point("misc_tree", [cx, cy, z], { height: 320 + (x * 37 + y * 53) % 160 });
      trees++;
    }
    if (ch === "@") {
      map.point("info_player_start", [cx, cy, z + 24]);
    }
  })
);

let wellParts = 0;
if (shaft) {
  const cell = CELL / SUB;
  const sx0 = subX(shaft.i);
  const sy0 = subY(shaft.j);
  const wx = sx0 + cell / 2;
  const wy = sy0 + cell / 2;
  const wz = RAMPS ? wellPad : zSub(shaft.i, shaft.j);
  const foot = BOTTOM;
  well = [wx, wy, wz];
  const bore = WELL_BORE / 2;

  // Fondo del pozo. Sin el, la boca deja el mundo abierto al vacio y qbsp lo
  // canta como fuga, que es exactamente lo que tiene que hacer.
  map.add(box([wx - bore, wy - bore, foot - 16], [wx + bore, wy + bore, foot], "wall01"));
  wellParts++;
  // El agua, a ras del fondo: queda mas de dos metros bajo el brocal.
  map.add(box([wx - bore + 1, wy - bore + 1, foot], [wx + bore - 1, wy + bore - 1, foot + 16], "water01"));
  wellParts++;

  // Plataforma de piedra, como en la referencia: es lo que asienta el pozo en
  // el suelo en vez de dejarlo brotando del adoquin.
  const base = ring([wx, wy], 0.1, WELL_BASE_R, wz, wz + WELL_BASE_H, "wall01", 8, PROP_ALIGN);
  map.add(base);
  wellParts += base.length;

  // El brocal. El radio interior tiene que ser menor que la media anchura de
  // la boca, no que su media diagonal: con el interior mas ancho que la boca
  // queda una repisa de suelo dentro del pozo y desde arriba se ve el adoquin
  // de la plaza iluminado. Paso.
  const rim = ring([wx, wy], WELL_RIN, WELL_ROUT, wz + WELL_BASE_H, wz + WELL_BASE_H + WELL_RIM_H,
    "wall01", 12, PROP_ALIGN);
  map.add(rim);
  wellParts += rim.length;

  // Postes, viga y tejadillo a dos aguas. Sin ellos, un brocal de metro y
  // medio no se ve desde el otro lado de la plaza y el pozo no existe.
  // Cuatro postes, no dos. Con dos, desde la direccion en la que estan
  // alineados se ve uno solo detras del otro y el pozo se lee como una seta:
  // un tallo con un sombrero. Con cuatro siempre se ven al menos dos y la
  // estructura se entiende desde cualquier lado.
  const postR = 34;
  const postTop = wz + 150;
  for (const px of [-postR, postR]) {
    for (const py of [-postR, postR]) {
      map.add(
        box([wx + px - 6, wy + py - 6, wz + WELL_BASE_H], [wx + px + 6, wy + py + 6, postTop],
          "wood01", PROP_ALIGN)
      );
      wellParts++;
    }
  }
  // Las dos vigas que las atan, de poste a poste.
  for (const px of [-postR, postR]) {
    map.add(box([wx + px - 5, wy - postR, postTop - 10], [wx + px + 5, wy + postR, postTop],
      "wood01", PROP_ALIGN));
    wellParts++;
  }
  const tejadillo = gable([wx - 46, wy - 46], [wx + 46, wy + 46], postTop, 30, "y", 8, {
    roof: "roof01",
    gable: "wood01",
  });
  map.add(tejadillo);
  wellParts += tejadillo.length;
  // El cubo, colgado de la viga.
  map.add(box([wx - 9, wy - 9, postTop - 40], [wx + 9, wy + 9, postTop - 12], "wood01", PROP_ALIGN));
  wellParts++;

  // Al caballete y floja: mas abajo quedaba a medio metro de los postes y los
  // reventaba, y un poste blanco en el eje del pozo se lee como un monolito.
  map.point("light", [wx, wy, wz + 172], { light: 190 });
}

// --- cosas de la plaza -----------------------------------------------------
//
// Puestos, barriles y un crucero. Nada nuevo que inventar: cajas y un prisma.
// Lo que aportan es escala: una plaza vacia de cien metros no se lee como una
// plaza, se lee como un solar, porque no hay nada del tamano de una persona
// con lo que compararla.
let props = 0;
if (shaft) {
  const cell = CELL / SUB;
  const px0 = subX(shaft.i) + cell / 2;
  const py0 = subY(shaft.j) + cell / 2;
  const zAt = (dx, dy) => zUnits(px0 + dx, py0 + dy);

  // Dos puestos de mercado: mostrador, cuatro postes y un toldo plano.
  for (const [dx, dy, ry] of [[-320, 224, 0], [352, -256, 1]]) {
    const cx = px0 + dx, cy = py0 + dy;
    const z = zAt(dx, dy);
    const w = ry ? 48 : 112;
    const d = ry ? 112 : 48;
    map.add(box([cx - w, cy - d, z], [cx + w, cy + d, z + 40], "wood01", PROP_ALIGN));
    for (const sx of [-w + 8, w - 8]) {
      for (const sy of [-d + 8, d - 8]) {
        map.add(box([cx + sx - 6, cy + sy - 6, z], [cx + sx + 6, cy + sy + 6, z + 112], "wood01", PROP_ALIGN));
      }
    }
    map.add(box([cx - w - 16, cy - d - 16, z + 112], [cx + w + 16, cy + d + 16, z + 124], "roof01", PROP_ALIGN));
    props += 6;
  }

  // Barriles: prismas de ocho lados, que a esta resolucion son barriles.
  for (const [dx, dy] of [[-176, 288], [-136, 250], [416, -180], [-352, -300], [-310, -288]]) {
    const z = zAt(dx, dy);
    const barrel = ring([px0 + dx, py0 + dy], 0.1, 26, z, z + 56, "wood01", 8, PROP_ALIGN);
    map.add(barrel);
    props += barrel.length;
  }

  // Crucero: basa escalonada y fuste con brazos.
  const cx = px0 - 384, cy = py0 - 352;
  const cz = zAt(-384, -352);
  map.add(box([cx - 56, cy - 56, cz], [cx + 56, cy + 56, cz + 16], "wall01"));
  map.add(box([cx - 40, cy - 40, cz + 16], [cx + 40, cy + 40, cz + 32], "wall01"));
  map.add(box([cx - 12, cy - 12, cz + 32], [cx + 12, cy + 12, cz + 168], "wall01", PROP_ALIGN));
  map.add(box([cx - 44, cy - 10, cz + 128], [cx + 44, cy + 10, cz + 148], "wall01", PROP_ALIGN));
  props += 4;
}

// --- matas -----------------------------------------------------------------
//
// Carteles, sin colision y sin brush: una mata de metro y medio que parase al
// jugador seria un obstaculo invisible en mitad de la calle.
//
// Se siembran en la hierba, no en las calles ni en la plaza, y solo donde hay
// mas hierba alrededor: una mata suelta en medio de un descampado se lee como
// un objeto perdido, y contra una fachada o un rincon se lee como jardin.
let bushes = 0;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (grid[y][x] !== ".") continue;
    let vecinas = 0;
    let pegada = false;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = x + dx, ny = y + dy;
      if (ny < 0 || ny >= height || nx < 0 || nx >= width) continue;
      const n = grid[ny][nx];
      if (n === ".") vecinas++;
      if (n === "#" || n === "=" || HOUSES[n]) pegada = true;
    }
    // Determinista, de las coordenadas: el mismo plano da siempre el mismo
    // pueblo y dos capturas del mismo sitio se pueden comparar.
    const r = ((x * 73856093) ^ (y * 19349663)) >>> 8;
    const dado = (r % 1000) / 1000;
    if (dado > (pegada ? 0.55 : 0.18)) continue;
    if (vecinas < 2) continue;
    const ox = ((r >> 3) % 80) - 40;
    const oy = ((r >> 9) % 80) - 40;
    map.point(
      "misc_bush",
      [cellX(x) + CELL / 2 + ox, cellY(y) + CELL / 2 + oy, zPlanCell(x, y)],
      {
        height: 30 + ((r >> 15) % 18),
        // Hash aparte para la variante. Reusando bits altos de `r` salian solo
        // cuatro de las ocho siluetas: los bits de arriba de ese hash tienen
        // poca entropia y la mitad del pack no se llegaba a ver.
        variant: (((x * 2654435761) ^ (y * 40503)) >>> 3) % BUSH_VARIANTS,
      }
    );
    bushes++;
  }
}

// --- cielo -----------------------------------------------------------------
//
// Dos piezas: un anillo encima de la muralla y una tapa. Juntas cierran el
// mundo, que es lo que qbsp necesita para poder decir si sella. Las caras de
// cielo no se dibujan ni colisionan, asi que desde dentro se ve cielo abierto.

const W = width * CELL;
const H = height * CELL;
for (const [a, b] of [
  [[0, 0], [W, CELL]],
  [[0, H - CELL], [W, H]],
  [[0, CELL], [CELL, H - CELL]],
  [[W - CELL, CELL], [W, H - CELL]],
]) {
  map.add(box([a[0], a[1], WALL_TOP], [b[0], b[1], SKY_TOP], "sky01"));
}
map.add(box([0, 0, SKY_TOP], [W, H, SKY_TOP + SKY_THICK], "sky01"));

// Luz general del cielo, para que las calles no dependan solo de las fachadas.
map.point("light", [W / 2, H / 2, WALL_TOP + 64], { light: 700 });

// --- salida ----------------------------------------------------------------

const text = map.toText();
mkdirSync(join(ROOT, "public", "maps"), { recursive: true });
writeFileSync(join(ROOT, "public", "maps", `${OUT_NAME}.map`), text, "ascii");

const meta = {
  cells: [width, height],
  cell_units: CELL,
  units: [W, H],
  metres: [W / 32, H / 32],
  houses: Object.fromEntries(
    [...found].map(([k, r]) => [k, { cells: r.cells, wall: HOUSES[k].wall, rise: HOUSES[k].rise }])
  ),
  trees,
  bushes,
  bush_variants: BUSH_VARIANTS,
  well: well ? { units: well, segmentos: 16, r_interior: WELL_RIN, r_exterior: WELL_ROUT, boca: WELL_BORE } : null,
  pozo_brushes: wellParts,
  porton_brushes: gateBrushes,
  plaza_brushes: props,
  porton_alto: GATE_H,
  wall_top: WALL_TOP,
  sky_top: SKY_TOP,
  relieve: RAMPS
    ? {
        modo: "rampas",
        sub: SUB,
        celda: SUBCELL,
        rango: RAMP_RANGE,
        min: corners.min,
        max: corners.max,
        desnivel_maximo: worst,
        desnivel_permitido: corners.maxDrop,
        pendiente_maxima_grados: Number(worstSlopeDeg(corners).toFixed(2)),
        pendiente_permitida_grados: MAX_SLOPE_DEG,
        pasadas: corners.passes,
        pozo_nivelado_a: wellPad,
      }
    : {
        modo: "escalones",
        sub: SUB,
        escalon: STEP,
        rango: RANGE,
        min: field.min,
        max: field.max,
        niveles: field.levels,
        salto_maximo: worst,
        pasadas_de_aplanado: field.passes,
      },
};
writeFileSync(
  join(ROOT, "public", "maps", `${OUT_NAME}.meta.json`),
  JSON.stringify(meta, null, 2),
  "utf8"
);

const r = meta.relieve;
console.log(
  `${OUT_NAME}.map: ${W / 32}x${H / 32} m, ${map.brushes.length} brushes ` +
    `(${floorBrushes} suelo, ${wallBrushes} muralla, ${houseBrushes} casas, ${gateBrushes} porton, ${wellParts} pozo, ${props} plaza), ` +
    `${found.size} casas, ${trees} arboles, ${bushes} matas, ${map.entities.length} entidades
` +
    (RAMPS
      ? `relieve en rampas: de ${r.min} a ${r.max} unidades (${(r.max - r.min) / 32} m), ` +
        `pendiente maxima ${r.pendiente_maxima_grados} grados de ${MAX_SLOPE_DEG} permitidos, ` +
        `${r.pasadas} pasadas`
      : `relieve en escalones: ${field.levels.length} niveles de ${field.min} a ${field.max} unidades ` +
        `(${(field.max - field.min) / 32} m), escalon ${STEP}, salto maximo ${worst}, ` +
        `${field.passes} pasadas de aplanado`)
);
