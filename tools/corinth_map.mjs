// El suelo de Corinth: del mapa de celdas a public/maps/corinth.map
//
//   node tools/corinth_map.mjs
//   npm run verdict public/maps/corinth.map
//
// Es la mitad del pueblo que NO son mallas. El reparto de jueces vuelve a ser
// el de siempre: esto lo juzga `qbsp`, y las casas y el socavón los juzga el
// arnés escrito aquí.
//
// ── Por qué el suelo es llano, y no es pereza ────────────────────────────────
//
// El pueblo podía salir con micro-relieve, como `pueblo-rampas.map`, que ya está
// hecho y comprobado. No sale, y la razón es la costura: `alturaRoca()` devuelve
// CERO EXACTO fuera del labio del socavón, y ese cero es lo que permite que el
// suelo y la roca se toquen sin rendija. En cuanto la calle alrededor de la boca
// deja de estar a cero exacto, la junta se abre por un lado o se enterra por el
// otro, y ninguna de las dos cosas da error. Así que la llanura del pueblo no es
// una decisión de estilo que se pueda cambiar luego: es un requisito de la
// costura, y está escrito aquí para que nadie lo cambie sin saberlo.
//
// El terreno de rampas no se pierde: sigue vivo en `pueblo-rampas.map`, que es
// donde se contestó la pregunta de si `qbsp` aguanta pendientes.
//
// ── Cómo se cosen el suelo y la roca ─────────────────────────────────────────
//
// Sobre la parcela de la boca, las dos mallas se reparten la MISMA rejilla de
// 0,4 m y usan la MISMA función para decidir de quién es cada celda:
//
//   `hayRoca(i, j)`  devuelve "socavon", "trinchera" o false.
//   la malla de roca emite las celdas en que devuelve algo.
//   este emisor emite losa en las celdas en que devuelve false.
//
// O sea que es una partición, no dos dibujos que se parecen: ninguna celda se
// queda sin nadie y ninguna la cubren los dos. Y como la rejilla es compartida,
// los vértices de la junta son literalmente los mismos números en los dos lados
// -y además están a cero en los dos, porque solo son frontera las celdas en que
// la roca vale cero-. Una prueba lo comprueba celda a celda.
//
// 0,4 m son 12,8 unidades de Quake: exacto en los cuatro decimales con que
// `emit.js` escribe los planos, y 4 m son diez pasos justos, así que la rejilla
// fina de la boca encaja con la rejilla de celdas del resto del pueblo.
//
// ── El sello, que es lo que hacía falta inventar ─────────────────────────────
//
// `qbsp` no ve la malla de la roca. Donde este emisor deja el hueco del
// socavón, `qbsp` ve una fuga, y un `.map` con fuga no juzga nada. La solución
// es la que el cielo ya usaba: un brush con textura reservada -`sello01`- que
// tapa el hueco para `qbsp` y que el runtime no dibuja ni colisiona. Para el
// juez el suelo está entero; para el jugador el agujero está donde se ve.

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { MapBuilder, box, slab } from "../src/map/emit.js";
import {
  ANCHO, FONDO, PARCELAS, LLEGADA, PORTON, RIO, PUENTE, rect, esRio, esPuente, parcelaEn,
} from "../src/kit/corinth.js";
import { hayRoca, PASO, PARCELA as PARCELA_BOCA } from "../src/kit/boca.js";
import {
  alturaRibera, AGUA as RIO_AGUA, LECHO as RIO_LECHO,
} from "../src/kit/rio.js";
import { CELDA } from "../src/kit/house.js";
import { UNITS_PER_M } from "../src/map/geometry.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// --- unidades ---------------------------------------------------------------
//
// Una sola conversión, y va en este sentido: de celda de Corinth a unidad de
// Quake. Three.js no aparece en este archivo, porque el .map no sabe de Three.js.
//
//   la celda (x, z) ocupa quake.x de 128x a 128x+128
//                     y quake.y de 128z a 128z+128
//
// Sale así de la definición de `toScene`: three.z = -quake.y/32 y la celda z
// está en three.z = -4z, o sea quake.y = 128z. No hay que voltear ninguna fila.
const U = UNITS_PER_M;            // 32 unidades por metro
const CELL = CELDA * U;           // 128: una celda de Corinth
const SUB = PASO * U;             // 12,8: un paso de la rejilla de la roca
const SUELO = 0;                  // la calle, a cota cero, y por obligación
const BOTTOM = -256;              // 8 m: por debajo del fondo del socavón (4,06 m)

const MURO_ALTO = 320;            // 10 m de muralla
const CIELO = 768;                // donde empieza la tapa
const GRUESO = 64;

// Escala de textura: una tesela cada dos metros. Con escala 1 la tesela cubre
// cuatro metros y el adoquín se lee como losas de metro y medio.
const ALIGN = "0 0 0 0.5 0.5";

const SUELOS = {
  calle: { top: "road01", side: "road01" },
  casa: { top: "floor01", side: "floor01" },
  plaza: { top: "floor01", side: "floor01" },
  puente: { top: "wood01", side: "wood01" },
  rio: { top: "water01", side: "water01" },
  muralla: { top: "wall01", side: "wall01" },
};

/** De qué es el suelo de la celda (x, z). */
function sueloDe(x, z) {
  if (esPuente(x, z)) return "puente";
  if (esRio(x, z)) return "rio";
  const p = parcelaEn(x, z);
  if (!p) return "calle";
  if (["mercado", "patio", "boca"].includes(p.papel)) return "plaza";
  return "casa";
}

// --- el río ------------------------------------------------------------------
//
// Antes era una columna de celdas de 4 m a cota −1,25 m con las paredes a plomo:
// un canal de hormigón con textura de agua. Tres cosas estaban mal y ninguna las
// medía nadie, porque el `.map` sellaba igual y la celda mojada seguía siendo la
// misma:
//
//   recto      el cauce saltaba de columna en columna en escalones de 4 m
//   sin ribera el corte era vertical y del mismo material que la calle
//   sin agua   la superficie era una losa lisa, siempre igual
//
// Ahora la banda del río se emite en tiras de 1 × 2 m sobre un campo de alturas,
// igual que el socavón: la orilla sale de una función y no de una tabla de
// celdas. El cauce lo da un spline que pasa por los centros de la tabla `RIO`,
// así que el plano sigue mandando —las celdas mojadas son las mismas y la
// comprobación de paso no cambia— y lo que cambia es que entre celda y celda hay
// curva en vez de escalón.
//
// ── El río tiene que seguir siendo un muro ───────────────────────────────────
//
// Esto es lo que casi se rompe al suavizarlo. Todo el lore de Corinth se apoya
// en que **solo se cruza por el puente**: es lo que hace que la guarnición
// controle quién baja. Geométricamente eso no lo garantizaba el plano, lo
// garantizaba que la orilla fuera un escalón de 1,25 m —imposible de subir con
// `stepHeight` de 0,5 m—. Una ribera «bonita» en pendiente suave habría abierto
// un vado en todo el pueblo sin que fallara una sola comprobación.
//
// Por eso el corte es corto y hondo: **3 m de caída en 2 m de horizontal**, y el
// `smoothstep` pone lo más empinado en el medio, así que la pendiente máxima pasa
// de 60°. El controlador admite 46. Y no se deja a la confianza: `tools/andar.mjs`
// asalta el río desde doce puntos y exige que nadie llegue a la otra orilla.
// El trazado, la ribera y los bordes salen de src/kit/rio.js, que es el mismo
// archivo del que `pueblo.js` saca por dónde pasa la valla de la orilla. Dos
// copias del trazado bastarían para que la valla quedase a medio metro del borde
// -flotando o enterrada- sin que ninguna cifra lo dijera.
const AGUA = RIO_AGUA * U;    // la lámina, 1 m bajo la calle
const LECHO = RIO_LECHO * U;  // el fondo del cauce, 3 m
const PASO_X = 32;            // 1 m a lo ancho, que es donde está el detalle
const PASO_Y = 64;            // 2 m a lo largo, donde la curva ya es suave

// La banda que se emite fina: el río más una celda de margen a cada lado, para
// que la ribera quepa entera dentro de ella.
const BANDA_X0 = Math.min(...RIO.map((f) => f[1])) - 1;
const BANDA_X1 = Math.max(...RIO.map((f) => f[1] + f[2])) + 1;
const enBanda = (x) => x >= BANDA_X0 && x < BANDA_X1;

/** La cota del terreno en unidades, a partir del campo en metros. */
const ribera = (x, y) => alturaRibera(x / U, y / CELL) * U;

/** La fila del puente, en unidades: ahí el cauce sigue y por encima va el tablero. */
const PUENTE_Y0 = PUENTE.z * CELL;
const PUENTE_Y1 = (PUENTE.z + 1) * CELL;

const map = new MapBuilder();
let losas = 0;

// --- la parcela de la boca, que se emite aparte -----------------------------
const boca = PARCELAS.find((p) => p.papel === "boca");
const rBoca = rect(boca);
const enBoca = (x, z) =>
  x >= rBoca.x && x < rBoca.x + rBoca.ancho && z >= rBoca.z && z < rBoca.z + rBoca.fondo;

// --- el suelo del pueblo, celda a celda -------------------------------------
//
// Por filas y fundiendo tramos seguidos del mismo material y la misma cota: sin
// fundir serían 360 losas de cuatro metros, y con esto son unas decenas. Fundir
// es exacto porque el pueblo es llano: dos celdas seguidas comparten la cara de
// arriba entera, no solo la textura.
for (let z = 0; z < FONDO; z++) {
  let x = 0;
  while (x < ANCHO) {
    if (enBoca(x, z) || enBanda(x)) { x++; continue; }
    const tipo = sueloDe(x, z);
    let fin = x;
    while (
      fin + 1 < ANCHO && !enBoca(fin + 1, z) && !enBanda(fin + 1) &&
      sueloDe(fin + 1, z) === tipo
    ) fin++;
    map.add(
      box(
        [x * CELL, z * CELL, BOTTOM],
        [(fin + 1) * CELL, (z + 1) * CELL, SUELO],
        SUELOS[tipo],
        ALIGN
      )
    );
    losas++;
    x = fin + 1;
  }
}

// --- la banda del río, en tiras finas ----------------------------------------
//
// Dos prismas por tira, con las cuatro esquinas a la cota del campo. Las
// esquinas se comparten con la tira vecina, así que dos tiras contiguas tienen
// exactamente la misma cara vertical y no queda rendija: es lo mismo que hace
// `pueblo-rampas.map`, y por lo mismo sigue sellando.
const bx0 = BANDA_X0 * CELL;
const bx1 = BANDA_X1 * CELL;
const nx = Math.round((bx1 - bx0) / PASO_X);
const ny = Math.round((FONDO * CELL) / PASO_Y);
let tirasRio = 0;
let tirasAgua = 0;
for (let j = 0; j < ny; j++) {
  const y0 = j * PASO_Y;
  const y1 = y0 + PASO_Y;
  for (let i = 0; i < nx; i++) {
    const x0 = bx0 + i * PASO_X;
    const x1 = x0 + PASO_X;
    const h = [
      ribera(x0, y0), ribera(x1, y0),
      ribera(x1, y1), ribera(x0, y1),
    ];
    const hondo = Math.min(...h);
    const alto = Math.max(...h);
    // El material lo decide la cota, no la celda del plano: la hierba crece en
    // la orilla y no donde una tabla diga que empieza la orilla.
    const mat = alto <= LECHO + 1 ? { top: "road01", side: "road01" }
      : hondo < -1 ? { top: "road01", side: "road01" }
      : { top: "grass01", side: "grass01" };
    if (alto === 0 && hondo === 0) {
      // Tira entera a ras de calle: no es ribera, es calle. Se emite lisa y se
      // le pone el material que le tocaría a su celda del plano.
      const celda = [Math.floor((x0 + 1) / CELL), Math.floor((y0 + 1) / CELL)];
      map.add(
        box([x0, y0, BOTTOM], [x1, y1, SUELO], SUELOS[sueloDe(celda[0], celda[1])], ALIGN)
      );
      tirasRio++;
      continue;
    }
    map.add(
      // `slab` pide las esquinas en el orden (x0,y0), (x1,y0), (x1,y1), (x0,y1).
      slab([x0, y0], [x1, y1], BOTTOM, h, mat, ALIGN)
    );
    tirasRio += 2;
    // El agua: una lámina PLANA. Un río tiene la orilla torcida y la superficie
    // horizontal, y eso es justo lo que la versión anterior tenía al revés.
    if (hondo < AGUA) {
      map.add(box([x0, y0, LECHO - 8], [x1, y1, AGUA], SUELOS.rio, "0 0 0 0.25 0.25"));
      tirasAgua++;
    }
  }
}

// --- el puente ---------------------------------------------------------------
//
// Un tablero, no un tapón. Antes la fila del puente se emitía como suelo macizo
// de arriba abajo, o sea que el río se cortaba en seco y volvía a empezar al
// otro lado. Ahora el cauce pasa por debajo y el tablero es una losa de 25 cm
// apoyada en dos estribos, que es lo que hace que se vea que hay un puente.
const PUENTE_X0 = (PUENTE.x - 0.25) * CELL;
const PUENTE_X1 = (PUENTE.x + PUENTE.ancho + 0.25) * CELL;
map.add(box([PUENTE_X0, PUENTE_Y0, -8], [PUENTE_X1, PUENTE_Y1, SUELO], SUELOS.puente, ALIGN));
// Los dos estribos, bajando hasta el lecho: sin ellos el tablero flota.
for (const [ex0, ex1] of [
  [PUENTE_X0, PUENTE_X0 + 24],
  [PUENTE_X1 - 24, PUENTE_X1],
]) {
  map.add(box([ex0, PUENTE_Y0, LECHO - 8], [ex1, PUENTE_Y1, -8], SUELOS.muralla, ALIGN));
}

// --- el suelo de la parcela de la boca, en la rejilla de la roca -------------
//
// Aquí no se funde por celda de cuatro metros sino por paso de 0,4 m, porque es
// donde está la junta. Se sigue fundiendo por filas, que es exacto y barato.
const n = Math.round((PARCELA_BOCA.ancho * CELDA) / PASO); // 30 pasos por lado
const x0Boca = rBoca.x * CELL;
const y0Boca = rBoca.z * CELL;
let losasBoca = 0;
let celdasRoca = 0;
for (let j = 0; j < n; j++) {
  let i = 0;
  while (i < n) {
    // La rejilla de la roca va en coordenadas de parcela: `i` hacia el este e
    // `j` hacia el SUR, que en unidades de Quake es hacia +Y. Coinciden.
    if (hayRoca(i, j)) { celdasRoca++; i++; continue; }
    let fin = i;
    while (fin + 1 < n && !hayRoca(fin + 1, j)) fin++;
    map.add(
      box(
        [x0Boca + i * SUB, y0Boca + j * SUB, BOTTOM],
        [x0Boca + (fin + 1) * SUB, y0Boca + (j + 1) * SUB, SUELO],
        SUELOS.plaza,
        ALIGN
      )
    );
    losasBoca++;
    i = fin + 1;
  }
}

// --- el sello -----------------------------------------------------------------
//
// Un solo brush, del tamaño de la parcela, de lo más hondo a la calle. Tapa para
// `qbsp` todo lo que la roca tapa de verdad, y de paso solapa las losas que sí
// se emitieron, que es legal y no cuesta nada. El runtime lo descarta por la
// textura, igual que descarta el cielo.
map.add(
  box(
    [x0Boca, y0Boca, BOTTOM],
    [x0Boca + rBoca.ancho * CELL, y0Boca + rBoca.fondo * CELL, SUELO],
    "sello01",
    ALIGN
  )
);

// --- la muralla ----------------------------------------------------------------
//
// Por FUERA de la rejilla de celdas, no encima de la primera fila: el plano dice
// que el pueblo mide 20x18 celdas pisables, y comerse la fila de fuera con el
// muro dejaría 18x16. Es el error que hace que el plano dibujado y el mundo
// dejen de ser lo mismo sin que nadie lo note.
const W = ANCHO * CELL;
const H = FONDO * CELL;
const G = CELL; // el muro, de una celda de grueso

// El hueco del portón, en unidades: las filas que ocupa y hasta dónde sube.
const PY0 = PORTON.celda[1] * CELL;
const PY1 = (PORTON.celda[1] + PORTON.fondo) * CELL;
const PORTON_ALTO = 224; // 7 m: cabe un carro cargado, y deja dintel
// Cuánto se mete el portón en el grosor del muro. Dejar un retranqueo es lo que
// hace que se lea como una puerta y no como una mancha: se ve la jamba.
const RETRANQUEO = 40;

for (const [a, b] of [
  [[-G, -G], [W + G, 0]],       // norte
  [[-G, H], [W + G, H + G]],    // sur
  [[W, 0], [W + G, H]],         // este
  // El muro OESTE va partido en tres, y no entero con el portón encima.
  //
  // Estaba entero, y el portón era otro brush metido DENTRO de él: dos sólidos
  // ocupando el mismo volumen, con las caras coplanarias. Eso no da error, da
  // z-fighting: la puerta y el muro se pelean por la profundidad y el resultado
  // parpadea y se ve a ratos. Desde lejos parece suciedad de la textura; de
  // cerca, que el portón «casi no está». Ninguna cifra lo dice y la sonda de
  // capturas tampoco, porque un fotograma fijo congela la pelea en un ganador.
  [[-G, 0], [0, PY0]],          // oeste, al norte del portón
  [[-G, PY1], [0, H]],          // oeste, al sur del portón
]) {
  map.add(box([a[0], a[1], BOTTOM], [b[0], b[1], MURO_ALTO], SUELOS.muralla, ALIGN));
}

// El paño del portón: el muro sigue macizo desde fuera hasta el retranqueo, y
// del retranqueo hacia dentro va la hoja. Así queda un hueco de 1,25 m con sus
// jambas y su dintel, que es lo que se lee como puerta.
map.add(box([-G, PY0, BOTTOM], [-G + RETRANQUEO, PY1, MURO_ALTO], SUELOS.muralla, ALIGN));
map.add(
  box(
    [-G + RETRANQUEO, PY0, BOTTOM],
    [-G + RETRANQUEO + 16, PY1, PORTON_ALTO],
    { top: "wall01", side: "door01" },
    ALIGN
  )
);
// El dintel, por encima del hueco.
map.add(
  box([-G + RETRANQUEO, PY0, PORTON_ALTO], [0, PY1, MURO_ALTO], SUELOS.muralla, ALIGN)
);
// Y el suelo del retranqueo, que es lo que se me olvidó y cazó `qbsp`.
//
// Abrir el hueco en el muro dejó un nicho de 2,25 m de fondo sin nada debajo: el
// suelo del pueblo empieza en x=0 y el nicho va de −72 a 0. Por ahí el mundo se
// desangraba. No lo habría visto nadie andando —se entra al nicho y se pisa,
// porque el jugador cae sobre la losa de al lado— pero el mapa había dejado de
// estar sellado, y un `.map` con fuga no juzga nada.
map.add(box([-G, PY0, BOTTOM], [0, PY1, SUELO], SUELOS.calle, ALIGN));

// --- el cielo -------------------------------------------------------------------
for (const [a, b] of [
  [[-G, -G], [W + G, 0]],
  [[-G, H], [W + G, H + G]],
  [[-G, 0], [0, H]],
  [[W, 0], [W + G, H]],
]) {
  map.add(box([a[0], a[1], MURO_ALTO], [b[0], b[1], CIELO], "sky01"));
}
map.add(box([-G, -G, CIELO], [W + G, H + G, CIELO + GRUESO], "sky01"));

// --- luces y llegada -------------------------------------------------------------
//
// El jugador aparece en el centro de la celda de llegada, y a 24 unidades de
// altura porque en Quake el origin de `info_player_start` es el centro de la
// caja y no los pies. Sin eso aparece medio metro enterrado.
const centro = (c) => c * CELL + CELL / 2;
map.point("info_player_start", [centro(LLEGADA[0]), centro(LLEGADA[1]), SUELO + 24]);

// Una luz por parcela, a la altura del alero, más el sol de encima. Sin las de
// parcela las fachadas quedan planas; sin el sol, el pueblo sale de noche y la
// captura mide cobertura igual.
for (const p of PARCELAS) {
  const r = rect(p);
  map.point(
    "light",
    [centro(r.x) + ((r.ancho - 1) * CELL) / 2, centro(r.z) + ((r.fondo - 1) * CELL) / 2, 160],
    { light: 260 }
  );
}
map.point("light", [W / 2, H / 2, MURO_ALTO + 96], { light: 900 });

// --- árboles y matas ------------------------------------------------------------
//
// Corinth no tenía ni uno. Ochenta por setenta y dos metros de adoquín y hierba
// pelada, doce casas y nada más: desde la calle se lee como un solar con casas
// encima, no como un sitio donde vive gente. Es la segunda vez que el pueblo
// sale «vacío» y las dos veces lo dijo un ojo, no una cifra —el plano estaba
// bien, las parcelas estaban bien y la cobertura medía de sobra—.
//
// Van como ENTIDADES y no como brushes, así que no tienen tronco macizo y no
// colisionan. Eso es a propósito: un tronco en mitad de una celda estrecha la
// calle y puede cerrar una ruta que el plano da por abierta, y ese fallo ya
// tiene su propia sonda pero cuesta una sesión encontrarlo. Aquí el follaje es
// puro render, así que no puede romper nada.
//
// El reparto es determinista y sale del propio plano: se siembra en las celdas
// que NO son parcela, NO son río y NO están en la calle del portón, y la
// posición dentro de la celda se corre con una función del índice para que no
// salgan todos en el centro —un árbol en el centro de cada celda se lee como un
// huerto, que es peor que nada—.
let arboles = 0;
let matas = 0;
const BUSH_VARIANTES = 8;

/** ¿Toca esta celda alguna parcela? */
const pegadaAParcela = (x, z) =>
  [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => parcelaEn(x + dx, z + dz));

for (let z = 0; z < FONDO; z++) {
  for (let x = 0; x < ANCHO; x++) {
    if (parcelaEn(x, z) || esRio(x, z) || esPuente(x, z)) continue;
    if (enBanda(x)) continue;                 // la ribera tiene su propia hierba
    // La calle del portón, despejada: es por donde entra el jugador y la única
    // vista larga que tiene el pueblo.
    if (z >= LLEGADA[1] - 1 && z <= LLEGADA[1] + 1) continue;
    // Y solo ARRIMADO a una parcela.
    //
    // El primer intento sembraba en cualquier celda libre, y el resultado fue
    // una calle mayor tapada por árboles de doce metros: el pueblo dejó de
    // parecer vacío porque dejó de verse. Un árbol en mitad de la calle no es
    // vegetación, es un tapón. Arrimados a las casas se leen como huertos y
    // dejan la calle libre, que es lo que hacen en un pueblo de verdad.
    if (!pegadaAParcela(x, z)) continue;
    const semilla = (x * 73 + z * 149) % 100;
    // Dentro de la celda, corrido hacia la parcela que tiene al lado.
    const cx = (x + 0.3 + ((x * 31 + z * 17) % 40) / 100) * CELL;
    const cy = (z + 0.3 + ((x * 53 + z * 29) % 40) / 100) * CELL;
    if (semilla < 10) {
      // 160 a 240 unidades: de cinco a siete metros y medio. El primer intento
      // los puso de 320 a 500 -de diez a quince metros- y desde la calle no se
      // veía el pueblo, se veía un bosque con una casa detrás.
      map.point("misc_tree", [cx, cy, SUELO], { height: 160 + (semilla * 9) % 80 });
      arboles++;
    } else if (semilla < 45) {
      // La altura de la mata, DECLARADA. Sin ella el visor se cae a su valor por
      // defecto -320 unidades, diez metros- y las matas salen del tamaño de un
      // roble. No da ningún error: da un pueblo dentro de un seto, y como la
      // cobertura sube, la sonda de capturas dice que se ve más que antes.
      map.point("misc_bush", [cx, cy, SUELO], {
        variant: semilla % BUSH_VARIANTES,
        height: 26 + (semilla * 7) % 18,
      });
      matas++;
    }
  }
}

// --- salida ----------------------------------------------------------------------
const text = map.toText();
mkdirSync(join(ROOT, "public", "maps"), { recursive: true });
writeFileSync(join(ROOT, "public", "maps", "corinth.map"), text, "ascii");

const meta = {
  generado: new Date().toISOString(),
  celdas: [ANCHO, FONDO],
  metros: [ANCHO * CELDA, FONDO * CELDA],
  unidadesPorMetro: U,
  cota: { suelo: SUELO, agua: AGUA, lecho: LECHO, fondo: BOTTOM, muro: MURO_ALTO, cielo: CIELO },
  paso: PASO,
  losas,
  losasBoca,
  arboles,
  matas,
  celdasDeRoca: celdasRoca,
  pasosPorLado: n,
  brushes: map.brushes.length,
  entidades: map.entities.length,
  llegada: LLEGADA,
};
writeFileSync(
  join(ROOT, "public", "maps", "corinth.meta.json"),
  JSON.stringify(meta, null, 2)
);

console.log(`\ncorinth.map  ${map.brushes.length} brushes, ${map.entities.length} entidades`);
console.log(`  ${ANCHO}×${FONDO} celdas = ${ANCHO * CELDA}×${FONDO * CELDA} m, suelo llano a cota ${SUELO}`);
console.log(`  ${losas} losas de calle fundidas por tramos`);
console.log(
  `  la boca: ${n}×${n} pasos de ${PASO} m — ${celdasRoca} son de la roca, ` +
    `el resto sale en ${losasBoca} losas`
);
console.log(`  1 brush de sello: lo que qbsp necesita y el runtime descarta\n`);
