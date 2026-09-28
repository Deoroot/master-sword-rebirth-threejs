// El juez de Corinth caminado. Rapier contra mallas glTF y contra el socavón.
//
//   node tools/andar.mjs
//
// Hasta hoy el controlador de Rapier solo se había puesto contra mallas de
// `.map`: brushes convexos, caras grandes, suelo plano. Corinth le pone delante
// tres cosas que no había tocado ninguna:
//
//   piezas del kit   mallas de glTF con su propio pivote y su propio giro
//   la roca          una malla de altura generada, con un labio y una trinchera
//   la escalera      una pieza que NO apoya en su origen y sube desde él
//
// ── Por qué el plano no basta ────────────────────────────────────────────────
//
// `alcanzables()` inunda el mapa de celdas y dice que desde el portón se llega a
// la boca. Es verdad, y no es suficiente: una inundación de celdas pasa por
// encima de un escalón de dos metros, de una casa que asoma medio metro en la
// calle y de un puente que quedó a distinta cota que su orilla. Lo que esta
// sonda hace es RECORRER ESE MISMO CAMINO con un cuerpo que colisiona. Si el
// cuerpo llega, el plano decía la verdad; si no, decía una que solo vale en dos
// dimensiones.
//
// ── Los controles, que son la mitad ──────────────────────────────────────────
//
// «Nadie se cayó» no significa que el suelo esté entero, igual que `exit 0` no
// significa correcto. Cada sonda va con su contraria:
//
//   la reja de calle para al jugador   <->   quitada, el jugador baja
//   con escalera se llega al fondo     <->   sin escalera, no se llega
//   con el .map se anda                <->   sin el .map, se cae al vacío
//
// La primera pareja es además la que dice que la boca está SELLADA de verdad y
// no solo dibujada: el permiso de la guarnición es un quest, no un adorno.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { initPhysics, World, Player, PLAYER } from "../src/play/player.js";
import { loadLevel } from "../src/map/level.js";
import { montarCorinth, puntoDeLlegada, distancias } from "../src/kit/pueblo.js";
import { bakeCasa } from "./bake.mjs";
import { CELDA } from "../src/kit/house.js";
import {
  PARCELAS, LLEGADA, ANCHO, FONDO, RIO, PUENTE, rect, transitable, alcanzables,
  parcelaEn, celdasDe,
} from "../src/kit/corinth.js";
import {
  HONDO, CRATER, TRINCHERA, TRAMO, enTrinchera, alturaRoca, alturaTrinchera,
  PARCELA as PARCELA_BOCA,
} from "../src/kit/boca.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DT = 1 / 60;

// --- montar el mundo ----------------------------------------------------------

/** Junta varias mallas sueltas en el único trimesh que Rapier acepta. */
function fundir(partes) {
  let nv = 0;
  let ni = 0;
  for (const p of partes) { nv += p.positions.length; ni += p.indices.length; }
  const positions = new Float32Array(nv);
  const indices = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const p of partes) {
    positions.set(p.positions, ov);
    for (let k = 0; k < p.indices.length; k++) indices[oi + k] = p.indices[k] + ov / 3;
    ov += p.positions.length;
    oi += p.indices.length;
  }
  return { positions, indices, triangleCount: indices.length / 3, vertexCount: nv / 3 };
}

/** Las piezas del kit y la roca, fusionadas y en metros de mundo. */
function mallaDelKit(plan) {
  const { grupos } = bakeCasa(plan);
  const partes = [...grupos.values()].map((g) => ({
    positions: new Float32Array(g.pos),
    indices: new Uint32Array(g.idx),
  }));
  return fundir(partes);
}

const mapa = loadLevel(readFileSync(join(ROOT, "public", "maps", "corinth.map"), "utf8"), {
  name: "corinth",
});

/**
 * El mundo entero, con la posibilidad de quitar piezas por su papel.
 *
 * Quitar por papel y no por índice es lo que permite que el control sea honesto:
 * «sin la reja de calle» y «sin la escalera» se piden por su nombre, y si algún
 * día una de las dos deja de llamarse así, el control se queda sin quitar nada
 * y la sonda lo dice -porque entonces las dos mitades del par dan lo mismo-.
 */
function mundoDe({ sinPapel = [], sinMapa = false, sinRoca = false } = {}) {
  const monta = montarCorinth();
  const fuera = new Set(sinPapel);
  const plan = {
    piezas: monta.piezas.filter((q) => !fuera.has(q.papel)),
    roca: sinRoca ? monta.vallas : monta.generadaSolida,
  };
  const quitadas = monta.piezas.length - plan.piezas.length;
  const kit = mallaDelKit(plan);
  const malla = sinMapa ? kit : fundir([mapa.mesh, kit]);
  return { malla, world: new World(malla), quitadas, monta };
}

// --- andar --------------------------------------------------------------------

/** El centro de una celda, en metros de mundo. */
const centro = ([x, z]) => [x * CELDA + CELDA / 2, -z * CELDA - CELDA / 2];

/**
 * Anda hacia una lista de puntos, uno detrás de otro.
 *
 * El rumbo se recalcula cada paso, no una vez por tramo: con el rumbo fijo, un
 * roce contra una esquina desvía al jugador y ya no vuelve, y el fallo se lee
 * como «no llegó» cuando lo que pasó es que la sonda no sabía conducir.
 */
function recorrer(world, desde, puntos, { segundos = 60, radio = 1.2, empujar = false } = {}) {
  const player = new Player(world, desde);
  const pasos = Math.round(segundos / DT);
  let meta = 0;
  let masHondo = Infinity;
  let enAire = 0;
  const traza = [];
  for (let k = 0; k < pasos && meta < puntos.length; k++) {
    const f = player.feet;
    // Se apunta lo hondo que se llega ANTES de decidir si hay que seguir: con la
    // cuenta dentro del `continue`, una sonda que llega a su meta en el primer
    // paso devuelve `Infinity` como profundidad, y el control «sin .map» decia
    // que el jugador no se habia caido justo cuando se estaba cayendo.
    masHondo = Math.min(masHondo, f[1]);
    const [tx, tz] = puntos[meta];
    const dx = tx - f[0];
    const dz = tz - f[2];
    // `empujar` no da la meta por alcanzada nunca: el jugador sigue apretando
    // contra ella los segundos que haga falta. Es lo que se quiere cuando la
    // meta está detrás de una reja -lo que se mide es dónde te para, no si
    // llegaste a un metro- y también lo que deja que la bajada termine en el
    // suelo del socavón y no en el último peldaño, que cae a un metro de él.
    if (!empujar && Math.hypot(dx, dz) < radio) { meta++; continue; }
    // yaw 0 mira hacia -Z y el avance es (-sin, -cos): para ir hacia (dx, dz) el
    // rumbo es atan2(-dx, -dz). Sale de invertir la fórmula de player.js, no de
    // probar signos hasta que funcione.
    player.yaw = Math.atan2(-dx, -dz);
    player.step(DT, { forward: 1 });
    if (!player.grounded) enAire++;
    masHondo = Math.min(masHondo, player.feet[1]);
    if (k % 30 === 0) traza.push(player.feet.map((v) => Number(v.toFixed(2))));
  }
  const f = player.feet;
  return {
    llego: meta >= puntos.length,
    metas: meta,
    total: puntos.length,
    fin: f,
    masHondo,
    enAire: enAire / pasos,
    traza,
  };
}

/**
 * Deja caer al jugador y devuelve dónde acaba de pie.
 *
 * Hace falta para plantar sondas honestamente. Una sonda que aparece medio
 * metida en una pieza de un metro no se queda dentro: el controlador resuelve la
 * penetración subiéndola ENCIMA, y desde encima del brocal se entra al socavón
 * andando. Eso se contaba como «se cuela por el borde», que es una conclusión
 * falsa sacada de una sonda mal plantada — y pasó dos veces, con el brocal y con
 * la jamba, porque las dos veces el filtro miraba una lista de piezas en vez de
 * mirar dónde acababa el jugador.
 */
function asentar(world, desde) {
  const p = new Player(world, desde);
  for (let k = 0; k < 40; k++) {
    p.step(DT, {});
    if (p.grounded && k > 5) break;
  }
  return p.feet;
}

/** El camino de celdas más corto de la llegada a una celda, por la calle. */
function caminoHasta(destino) {
  const d = distancias();
  const clave = destino.join(",");
  if (!d.has(clave)) return null;
  const camino = [destino];
  let actual = destino;
  while (d.get(actual.join(",")) > 0) {
    const paso = d.get(actual.join(",")) - 1;
    const siguiente = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dx, dz]) => [actual[0] + dx, actual[1] + dz])
      .find((c) => d.get(c.join(",")) === paso);
    camino.unshift(siguiente);
    actual = siguiente;
  }
  return camino;
}

await initPhysics();

console.log("\nJuez: sonda de marcha con Rapier   Mundo: .map + glTF + roca generada\n");

// --- el mundo de verdad --------------------------------------------------------

const real = mundoDe();
console.log(
  `  mundo                ${real.malla.triangleCount} triangulos ` +
    `(${mapa.mesh.triangleCount} del .map, ${real.malla.triangleCount - mapa.mesh.triangleCount} ` +
    `de ${real.monta.piezas.length} piezas de kit y la roca)`
);

// --- sonda 1: el camino que la inundación prometió ------------------------------

// La meta es la última celda de patio ANTES de la boca, no la boca. No es una
// rebaja: la última celda está detrás de la reja, y que la reja no deje pasar es
// lo que comprueba la sonda siguiente. Pedir las dos cosas a la vez -llegar a la
// boca y no poder entrar en ella- es pedir que la sonda falle haga lo que haga.
const patioCeldas = celdasDe("patio-control");
const bocaCeldas = celdasDe("boca-mazmorra");
const bocaZ = Math.max(...bocaCeldas.map((c) => c[1]));
const antesDeLaBoca = patioCeldas
  .filter(([x, z]) => z === bocaZ + 1 && bocaCeldas.some(([bx]) => bx === x))
  .sort((a, b) => a[0] - b[0])[0];
const camino = caminoHasta(antesDeLaBoca);
const ruta = camino.map(centro);
const paseo = recorrer(real.world, puntoDeLlegada(), ruta, { segundos: 90 });
console.log(
  `  ruta portón→boca     ${camino.length} celdas de plano, ${paseo.metas}/${paseo.total} alcanzadas, ` +
    `${(paseo.enAire * 100).toFixed(1)}% en el aire`
);
if (process.env.RUTA_DETALLE) {
  console.log(`      celdas: ${camino.map((c) => c.join(",")).join(" -> ")}`);
  console.log(`      se queda en ${paseo.fin.map((v) => v.toFixed(1)).join(" ")} ` +
    `(celda ${Math.floor(paseo.fin[0] / CELDA)},${Math.floor(-paseo.fin[2] / CELDA)}) ` +
    `yendo a la meta ${paseo.metas}: ${JSON.stringify(camino[paseo.metas])}`);
}

// --- sonda 2: el sello para al jugador --------------------------------------------

// Desde la calle, de frente a la boca de la trinchera. Si la reja es geometría y
// no dibujo, aquí se acaba el camino.
// La parcela crece hacia el SUR según `w` crece, y el sur es z decreciente. O
// sea que la boca de la trinchera -w grande- está en el borde de z MENOR de la
// parcela, y quien viene del patio la aborda desde una z todavía menor. Al
// revés, la sonda arranca tres metros dentro del agujero, ya pasada la reja, y
// entonces dice que la reja no para a nadie: era verdad, pero no de la reja.
const mBoca = real.monta.parcelas.find((e) => e.papel === "boca").rect;
const wAz = (w) => mBoca.z1 - w;
const ejeX = mBoca.x0 + CRATER.cx;
// La reja del fondo, y un punto DETRÁS de ella: la meta está al otro lado para
// que el jugador empuje, no para que la roce.
const reja = [ejeX, wAz(TRINCHERA.hasta)];
const detrasDeLaReja = [ejeX, wAz(TRINCHERA.hasta - 1.5)];
// El arranque: dos metros al sur de la boca de la trinchera, en la calle.
const arranque = [ejeX, 0.2, wAz(TRINCHERA.desde) - 2.0];

/**
 * A qué distancia de la reja del fondo se quedó, en tres dimensiones.
 *
 * En tres y no en dos porque el último peldaño está medio metro por encima del
 * suelo del socavón: quien se apoya en la reja desde él no está en el fondo,
 * pero sí ha llegado. Midiendo solo en planta, «llegar» y «quedarse en la calle
 * cuatro metros más arriba» dan casi lo mismo si se para justo encima.
 */
const aLaReja = (r) => Math.hypot(r.fin[0] - reja[0], r.fin[1] + HONDO, r.fin[2] - reja[1]);
const LLEGA = 1.5; // metros: el alcance de un brazo desde el último peldaño

const sellada = recorrer(real.world, arranque, [detrasDeLaReja], {
  segundos: 20, radio: 1.0, empujar: true,
});
console.log(
  `  con reja de calle    para en y=${sellada.fin[1].toFixed(2)}, a ` +
    `${aLaReja(sellada).toFixed(1)} m de la reja del fondo`
);

// --- sonda 3: con permiso, se baja ------------------------------------------------

const abierta = mundoDe({ sinPapel: ["reja-calle"] });
const bajada = recorrer(abierta.world, arranque, [detrasDeLaReja], {
  segundos: 30, radio: 1.0, empujar: true,
});
console.log(
  `  sin reja de calle    para en y=${bajada.fin[1].toFixed(2)} ` +
    `(el fondo está en ${(-HONDO).toFixed(2)}), a ` +
    `${aLaReja(bajada).toFixed(1)} m de la reja del fondo`
);

// --- lo que sostiene la bajada no es la escalera ------------------------------------
//
// Esto empezó siendo un control -«sin la escalera no se baja»- y no lo es. La
// trinchera es una rampa de roca recta que baja HONDO metros en la carrera de
// los cuatro tramos, y eso son 24,9 grados: muy por debajo de los 46 que el
// controlador admite. O sea que **se baja igual sin escalera**, y lo que la
// escalera hace es verse.
//
// No es un fallo y no se arregla: una rampa de roca bajo una escalera de piedra
// es lo que hay en una cantera. Pero sí obliga a decir la verdad sobre lo que
// esta sonda demuestra, que es que el hueco es transitable, no que los peldaños
// funcionen. El control de verdad es el de abajo: sin la roca no hay por dónde.
const PENDIENTE = (Math.atan2(HONDO, TRAMO.carrera * 4) * 180) / Math.PI;
const sinEscalera = mundoDe({ sinPapel: ["reja-calle", "escalon 0", "escalon 1", "escalon 2", "escalon 3"] });
const sinPeldanos = recorrer(sinEscalera.world, arranque, [detrasDeLaReja], {
  segundos: 30, radio: 1.0, empujar: true,
});
console.log(
  `  sin escalera         se baja igual: la rampa de la trinchera cae ${PENDIENTE.toFixed(1)}° ` +
    `y el controlador admite ${PLAYER.maxSlopeDeg}° (acaba a ${aLaReja(sinPeldanos).toFixed(1)} m de la reja)`
);

// --- control: sin roca NI escalera ----------------------------------------------------
//
// Hacen falta las dos, y eso se descubrió intentando quitar solo una: sin la
// escalera se baja por la rampa, y sin la rampa se baja por la escalera. Las dos
// sostienen por separado, que es una buena noticia sobre la boca y una mala
// sobre el control. El que discrimina es este: sin ninguna de las dos, bajo la
// calle solo queda el sello -que no colisiona- y ahí no se baja, se cae.
const PELDANOS = ["escalon 0", "escalon 1", "escalon 2", "escalon 3"];
const sinNada = mundoDe({ sinPapel: ["reja-calle", ...PELDANOS], sinRoca: true });
const sinPiedra = recorrer(sinNada.world, arranque, [detrasDeLaReja], {
  segundos: 20, radio: 1.0, empujar: true,
});
console.log(
  `  control sin las dos  acaba en y=${sinPiedra.fin[1].toFixed(1)}, a ` +
    `${aLaReja(sinPiedra).toFixed(1)} m de la reja, ${(sinPiedra.enAire * 100).toFixed(0)}% en el aire`
);

// --- control: sin el .map -----------------------------------------------------------

const sinSuelo = mundoDe({ sinMapa: true });
// La meta se pone lejos a proposito: si fuera la propia celda de llegada, la
// sonda la daria por alcanzada en el primer paso y no llegaria a medir la caida.
const cae = recorrer(sinSuelo.world, puntoDeLlegada(), [centro([10, 9])], { segundos: 6, radio: 0.5 });
console.log(
  `  control sin .map     el jugador cae a y=${cae.masHondo.toFixed(1)} ` +
    `(${(cae.enAire * 100).toFixed(0)}% del tiempo en el aire)`
);

// --- sonda 4: ¿se puede entrar por el borde, sin pasar por la reja? ---------------------
//
// La reja para a quien va de frente. Pero el socavón es un agujero de diez
// metros con un brocal de piezas sueltas alrededor, y sus paredes son una malla
// de altura con una curva suave: si en algún punto esa curva baja menos de los
// 46° que el controlador admite, se entra andando por el borde y el sello no
// sella nada. En el plano de celdas esto no existe -la boca es una parcela
// pisable y punto- y en una captura cenital el brocal se ve entero.
const RADIOS = 48;
const alcanzadasCeldas = alcanzables();
// Las huellas del brocal, en coordenadas de parcela, para no plantar la sonda
// encima de ninguna.
const entradas = [];
for (let k = 0; k < RADIOS; k++) {
  const ang = (k / RADIOS) * Math.PI * 2;
  // Fuera del labio Y fuera del brocal, en la calle, de cara al centro.
  //
  // Empezó en 1,35 veces el radio y eso no bastaba: las piezas del brocal son
  // cuadrados de 2 m alineados a los ejes, así que en las DIAGONALES sobresalen
  // 1,4 m del aro. La sonda aparecía medio dentro de una, el controlador
  // resolvía la penetración subiéndola encima, y desde arriba del brocal se
  // entra al agujero andando. Lo contaba como «se cuela por el borde», que es
  // una conclusión falsa sacada de una sonda mal plantada: por el borde no se
  // entra, se entraba por donde la sonda aparecía.
  const rx = CRATER.rx * 1.7;
  const rw = CRATER.rw * 1.7;
  const px = CRATER.cx + Math.cos(ang) * rx;
  const pw = CRATER.cw + Math.sin(ang) * rw;
  // El filtro no es «¿cae en la parcela?» sino «¿cae en calle por la que se
  // puede llegar?». No es lo mismo: la parcela de la boca mide 12 m y el cráter
  // se la come casi entera, así que exigir que el asalto empiece dentro dejaba
  // la sonda con cuatro puntos de cuarenta y ocho. Alrededor de la parcela hay
  // patio y calle, y desde ahí es exactamente desde donde alguien lo intentaría.
  const mundoX = mBoca.x0 + px;
  const mundoZ = wAz(pw);
  const celdaAsalto = [Math.floor(mundoX / CELDA), Math.floor(-mundoZ / CELDA)];
  if (!transitable(celdaAsalto[0], celdaAsalto[1])) continue;
  if (!alcanzadasCeldas.has(celdaAsalto.join(","))) continue;
  // Y los que caen DENTRO del pasillo de la trinchera tampoco valen, porque ahí
  // ya se está pasada la reja: un asalto que arranca detrás de la puerta no dice
  // nada sobre la puerta. El primer intento tenía uno y lo contaba como colado.
  if (enTrinchera(px, pw)) continue;
  // Y ningún asalto puede empezar encima de nada. Se comprueba dejándolo caer,
  // que es general: vale para el brocal, para las jambas, para el revestimiento
  // y para lo que se añada mañana.
  const pies = asentar(real.world, [mundoX, 0.4, mundoZ]);
  if (Math.abs(pies[1]) > 0.25) continue;
  const r = recorrer(
    real.world,
    [mundoX, pies[1] + 0.05, mundoZ],
    [[mBoca.x0 + CRATER.cx, wAz(CRATER.cw)]],
    { segundos: 15, radio: 0.5, empujar: true }
  );
  entradas.push({ ang: Math.round((ang * 180) / Math.PI), y: r.fin[1] });
  if (process.env.BROCAL_DETALLE && r.fin[1] < -1.0) {
    console.log(`      ${Math.round((ang * 180) / Math.PI)}° sale de (${px.toFixed(2)}, ${pw.toFixed(2)}) ` +
      `y acaba en parcela (${(r.fin[0] - mBoca.x0).toFixed(2)}, ${(mBoca.z1 - r.fin[2]).toFixed(2)}) y=${r.fin[1].toFixed(2)}`);
    for (const t of r.traza) {
      console.log(`         (${(t[0] - mBoca.x0).toFixed(2)}, ${(mBoca.z1 - t[2]).toFixed(2)}) y=${t[1].toFixed(2)}`);
    }
  }
}
const coladas = entradas.filter((e) => e.y < -1.0);
console.log(
  `  ${entradas.length} asaltos al brocal   ${coladas.length} se cuelan dentro del socavón` +
    (coladas.length ? `: a ${coladas.map((c) => `${c.ang}° (y=${c.y.toFixed(1)})`).join(", ")}` : "")
);

// --- sonda 5: ¿se cruza el río a nado, digo andando? -----------------------------------
//
// Todo el lore de Corinth se apoya en que **solo se cruza por el puente**: es lo
// que hace que la guarnición controle quién baja al agujero. Y eso no lo
// garantizaba el plano, que solo dice que la celda está mojada; lo garantizaba
// que la orilla fuera un escalón de 1,25 m a plomo.
//
// Al darle al río una ribera de verdad, esa garantía se puso en juego: una
// orilla en pendiente suave es un vado, y un vado abre un paso nuevo en todo el
// pueblo sin que falle ni una comprobación de celdas —porque las celdas mojadas
// siguen siendo exactamente las mismas—. Por eso el corte es de 3 m en 2 m de
// horizontal, y por eso hay que comprobarlo con un cuerpo y no con un comentario.
//
// Se asalta desde la orilla OESTE, que es donde vive la gente, en todas las filas
// menos la del puente.
const cruces = [];
for (let z = 0; z < FONDO; z++) {
  if (z === PUENTE.z) continue;
  // El punto de salida: la celda de calle más al este de esa fila antes del río.
  let x = Math.min(...RIO.map((f) => f[1])) - 1;
  while (x > 0 && !transitable(x, z)) x--;
  if (!transitable(x, z)) continue;
  const desde = centro([x, z]);
  // La meta, al otro lado del agua: si llega, hay vado.
  const meta = centro([x + 6, z]);
  const r = recorrer(real.world, [desde[0], 0.3, desde[1]], [meta], {
    segundos: 14, radio: 0.8, empujar: true,
  });
  // Cruzó si acabó al este del cauce. El cauce de esa fila lo dice el plano.
  const cruzo = r.fin[0] > (RIO.find((f) => f[0] === z)[1] + 2) * CELDA;
  const deriva = Math.abs(-r.fin[2] / CELDA - z);
  cruces.push({ z, cruzo, x: r.fin[0], y: r.fin[1], deriva });
  if (process.env.RIO_DETALLE) {
    console.log(`      fila ${String(z).padStart(2)}  acaba x=${r.fin[0].toFixed(1)} y=${r.fin[1].toFixed(2)} ` +
      `fila final ${(-r.fin[2] / CELDA).toFixed(1)} (deriva ${deriva.toFixed(1)})  ${cruzo ? "CRUZA" : "no"}`);
  }
}
const vados = cruces.filter((c) => c.cruzo);
console.log(
  `  ${cruces.length} asaltos al río     ${vados.length} lo cruzan sin puente` +
    (vados.length ? `: filas ${vados.map((v) => v.z).join(" ")}` : "")
);

// --- sonda 6: ¿hay suelo en todas partes? ----------------------------------------------
//
// «Se puede caer del mapa» no lo dice ninguna de las sondas de arriba, y eso es
// un hueco del arnés y no una casualidad: las otras recorren CAMINOS, y un
// camino pasa por donde pasa. Un agujero de medio metro entre la escalera y la
// pared de la trinchera no lo pisa nadie que vaya a un sitio, pero lo encuentra
// cualquiera que se asome — y se ve desde dentro, porque por él entra el color
// del cielo.
//
// Así que se barre. Rejilla de un metro sobre todo el pueblo, un rayo hacia
// abajo desde dos metros, y se apunta lo que no encuentra suelo en treinta.
//
// El aviso de siempre: `castRay` no toca NADA hasta que el mundo ha dado su
// primer `step()`. Sin él devuelve «no hay nada» en todas partes, y la sonda
// diría que el pueblo entero es un agujero. Que es un fallo tan grande que se
// nota; lo peligroso sería al revés.
const RAPIER = await initPhysics();
real.world.world.step();
const PASO_BARRIDO = 1.0;
const agujeros = [];
let sondeados = 0;
for (let z = 0; z < FONDO * CELDA; z += PASO_BARRIDO) {
  for (let x = 0; x < ANCHO * CELDA; x += PASO_BARRIDO) {
    const celda = [Math.floor(x / CELDA), Math.floor(z / CELDA)];
    // Solo donde debería haber suelo: dentro de una casa no lo hay y da igual.
    const p = parcelaEn(celda[0], celda[1]);
    if (p && !["mercado", "patio", "boca"].includes(p.papel)) continue;
    sondeados++;
    const rayo = new RAPIER.Ray({ x, y: 2.0, z: -z }, { x: 0, y: -1, z: 0 });
    const golpe = real.world.world.castRay(rayo, 40, true);
    if (!golpe) agujeros.push([x, z]);
  }
}
// Y por DENTRO del socavón, que es donde el barrido de arriba no llega: un rayo
// que sale a dos metros de altura choca con el labio o con la roca de la ladera
// y da el agujero por tapado. El hueco que se ve desde el fondo de la trinchera
// está cuatro metros por debajo de eso.
//
// Aquí el rayo sale de justo encima de la superficie que la propia boca declara
// -`alturaTrinchera` dentro del pasillo, `alturaRoca` fuera- porque es la única
// forma de preguntar «¿hay suelo donde este archivo dice que lo hay?».
const mBocaRect = real.monta.parcelas.find((e) => e.papel === "boca").rect;
const PASO_BOCA = 0.25;
const LADO_BOCA = PARCELA_BOCA.ancho * CELDA;
let sondeosBoca = 0;
for (let w = PASO_BOCA / 2; w < LADO_BOCA; w += PASO_BOCA) {
  for (let px = PASO_BOCA / 2; px < LADO_BOCA; px += PASO_BOCA) {
    const h = enTrinchera(px, w) ? alturaTrinchera(w) : alturaRoca(px, w);
    if (h === 0) continue; // eso es calle, y ya lo barrió la rejilla de arriba
    sondeosBoca++;
    const rayo = new RAPIER.Ray(
      { x: mBocaRect.x0 + px, y: h + 0.35, z: mBocaRect.z1 - w },
      { x: 0, y: -1, z: 0 }
    );
    if (!real.world.world.castRay(rayo, 40, true)) agujeros.push([mBocaRect.x0 + px, w]);
  }
}
sondeados += sondeosBoca;

// Y el CANTO del pasillo de la trinchera, que es un caso que ningún rayo hacia
// abajo puede ver.
//
// El agujero que había estaba en vertical: entre el suelo del pasillo y el fondo
// del socavón, que está más abajo, faltaba la cara que cierra el escalón. Un
// rayo hacia abajo encuentra suelo a los dos lados —arriba el pasillo, abajo el
// cráter— y da el sitio por bueno. La ruta del portón a la reja pasa por el
// centro del pasillo y tampoco se asoma. Solo se ve mirando al suelo desde
// dentro, porque por el hueco entra el color del cielo.
//
// El primer intento tiraba rayos horizontales y exigía que chocaran con la
// pared. No vale: en la mitad honda la trinchera YA no es un pasillo, es un tajo
// abierto en el cuenco, y ahí no tiene que haber pared ninguna. La sonda decía
// que faltaban 404 paredes de 594 y tenía razón en ninguna.
//
// Lo que se prueba es otra cosa: desde justo encima del suelo del pasillo, en su
// mismo borde, un rayo hacia ABAJO Y HACIA FUERA. Todo es superficie aquí, no
// volumen, así que por debajo de las mallas no hay nada: un rayo que se cuela
// por una cara que falta no vuelve a chocar con nada nunca. Si choca, el canto
// está cerrado; si se va, se ve por debajo del mundo.
// Dos intentos fallaron antes de dar con la pregunta, y los dos por el mismo
// motivo: no atravesaban el sitio donde falta la cara.
//
//   horizontal a cualquier altura   decía que faltaban 404 paredes de 594, y no
//                                   faltaba ninguna: en la mitad honda la
//                                   trinchera ya no es un pasillo, es un tajo
//                                   abierto en el cuenco, y ahí no tiene que
//                                   haber pared.
//   en diagonal desde dentro        decía que 0 de 84, incluso con el fallo
//                                   puesto a mano: el rayo chocaba con el suelo
//                                   del propio pasillo a los doce centímetros.
//
// La cara que puede faltar ocupa una franja vertical muy concreta: entre la cota
// del suelo del pasillo y la cota de la roca que tiene justo al lado, sea cual
// sea de las dos la más alta. Así que se tira el rayo A ESAS ALTURAS y no a
// otras, desde el eje hacia fuera. Si la cara está, choca. Si no, sale por
// debajo de las mallas y no vuelve a chocar con nada nunca, porque aquí todo es
// superficie y no volumen.
let rayosCanto = 0;
const cantos = [];
for (let w = TRINCHERA.hasta + 0.2; w < TRINCHERA.desde - 0.2; w += 0.2) {
  const suelo = alturaTrinchera(w);
  for (const signo of [-1, 1]) {
    const fuera = alturaRoca(CRATER.cx + signo * (TRINCHERA.ancho / 2 + 0.06), w);
    const lo = Math.min(suelo, fuera);
    const hi = Math.max(suelo, fuera);
    if (hi - lo < 0.15) continue; // no hay escalon: no hace falta cara
    for (let y = lo + 0.05; y < hi - 0.05; y += 0.2) {
      rayosCanto++;
      const rayo = new RAPIER.Ray(
        { x: mBocaRect.x0 + CRATER.cx, y, z: mBocaRect.z1 - w },
        { x: signo, y: 0, z: 0 }
      );
      if (!real.world.world.castRay(rayo, TRINCHERA.ancho / 2 + 0.4, true)) {
        cantos.push(w.toFixed(1));
      }
    }
  }
}
console.log(
  `  ${rayosCanto} rayos al canto  ${cantos.length} se van por debajo del mundo` +
    (cantos.length ? `: w=${[...new Set(cantos)].slice(0, 6).join(" ")}` : "")
);

console.log(
  `  ${sondeados} sondeos de suelo  ${agujeros.length} sin suelo debajo` +
    (agujeros.length
      ? `: ${agujeros.slice(0, 6).map((a) => `${a[0].toFixed(0)},${a[1].toFixed(0)}`).join("  ")}`
      : "")
);

// --- el paseo por el pueblo -----------------------------------------------------------

const RUMBOS_PASEO = 16;
const paseos = [];
for (let k = 0; k < RUMBOS_PASEO; k++) {
  const ang = (k / RUMBOS_PASEO) * Math.PI * 2;
  const lejos = [
    puntoDeLlegada()[0] + Math.cos(ang) * 200,
    puntoDeLlegada()[2] + Math.sin(ang) * 200,
  ];
  paseos.push(recorrer(real.world, puntoDeLlegada(), [lejos], { segundos: 12, radio: 0.5 }));
}
const escapes = paseos.filter((p) => p.llego).length;
const peorHundido = Math.min(...paseos.map((p) => p.masHondo));
const peorAire = Math.max(...paseos.map((p) => p.enAire));
console.log(
  `  ${RUMBOS_PASEO} marchas de 12 s    ${escapes} salieron del pueblo, lo más hondo ` +
    `y=${peorHundido.toFixed(2)}, ${(peorAire * 100).toFixed(1)}% en el aire como mucho`
);

// --- veredicto -----------------------------------------------------------------------

const fallos = [];
if (real.malla.triangleCount < 1000) fallos.push("el mundo casi no tiene triangulos");
if (real.malla.triangleCount === mapa.mesh.triangleCount) {
  fallos.push("la malla del kit no aporto ni un triangulo: se esta andando solo sobre el .map");
}
if (!paseo.llego) {
  fallos.push(
    `la ruta del portón a la boca se corta en la meta ${paseo.metas} de ${paseo.total}: ` +
      `el plano dice que se llega y con un cuerpo no se llega`
  );
}
if (sellada.fin[1] < -1.0 || aLaReja(sellada) < LLEGA) {
  fallos.push(`la reja de la calle no para al jugador: baja hasta y=${sellada.fin[1].toFixed(2)}`);
}
if (aLaReja(bajada) > LLEGA) {
  fallos.push(
    `con la reja quitada no se llega a la reja del fondo: se queda a ` +
      `${aLaReja(bajada).toFixed(2)} m, en y=${bajada.fin[1].toFixed(2)}`
  );
}
if (bajada.fin[1] < -HONDO - 0.3) {
  fallos.push(`el jugador atraveso el fondo del socavon: y=${bajada.fin[1].toFixed(2)}`);
}
// Los controles. Si el control se comporta igual que la sonda, la sonda no mide.
if (sinEscalera.quitadas <= abierta.quitadas) {
  fallos.push("quitar la escalera no quito ninguna pieza: los papeles cambiaron de nombre");
}
if (PENDIENTE >= PLAYER.maxSlopeDeg) {
  // Si algun dia la trinchera se empinara por encima del limite, la frase de
  // arriba dejaria de ser verdad y habria que volver a mirarla.
  fallos.push(`la rampa de la trinchera cae ${PENDIENTE.toFixed(1)}°, por encima del limite del controlador`);
}
if (aLaReja(sinPiedra) < LLEGA) {
  fallos.push("sin roca ni escalera tambien se llega a la reja: la sonda no mide la bajada");
}
if (sinPiedra.masHondo > -20) {
  fallos.push(
    `sin roca ni escalera el jugador solo bajo a y=${sinPiedra.masHondo.toFixed(1)}: ` +
      `el hueco del socavon no esta abierto en el .map`
  );
}
if (aLaReja(sinPeldanos) > LLEGA) {
  fallos.push("sin escalera ya no se baja: la rampa de la trinchera dejo de sostener");
}
if (cae.masHondo > -5) {
  fallos.push(
    `sin el .map el jugador solo bajo a y=${cae.masHondo.toFixed(1)}: la sonda no detecta caidas`
  );
}
if (coladas.length) {
  fallos.push(
    `${coladas.length} de ${entradas.length} asaltos entran al socavon por el borde, sin pasar ` +
      `por la reja: el sello es dibujo`
  );
}
if (entradas.length < 8) {
  fallos.push(`solo ${entradas.length} asaltos al brocal: la sonda no rodea el socavon`);
}
if (vados.length) {
  fallos.push(
    `${vados.length} de ${cruces.length} asaltos cruzan el rio sin puente (filas ` +
      `${vados.map((v) => v.z).join(" ")}): la orilla dejo de ser un muro y el control ` +
      `de la guarnicion es decorado`
  );
}
if (cruces.length < 10) fallos.push(`solo ${cruces.length} asaltos al rio: la sonda no lo recorre`);
if (cantos.length) {
  fallos.push(
    `${cantos.length} de ${rayosCanto} rayos se van por debajo del mundo desde el canto de la ` +
      `trinchera: falta la cara que cierra el escalon contra la roca de al lado`
  );
}
if (agujeros.length) {
  fallos.push(
    `${agujeros.length} de ${sondeados} sondeos no encuentran suelo debajo: por ahi se cae del ` +
      `mapa, y se ve desde dentro porque por el agujero entra el color del cielo`
  );
}
if (escapes > 0) fallos.push(`${escapes} de ${RUMBOS_PASEO} marchas salieron del pueblo`);
if (peorHundido < -HONDO - 0.5) {
  fallos.push(`una marcha se hundio hasta y=${peorHundido.toFixed(2)}`);
}
if (peorAire > 0.35) {
  fallos.push(`una marcha paso el ${(peorAire * 100).toFixed(0)}% del tiempo en el aire`);
}

console.log();
if (fallos.length) {
  for (const f of fallos) console.log("FALLO:", f);
  process.exit(1);
}
console.log(
  `Corinth se camina. La ruta que la inundación prometía se recorre con un cuerpo, la reja de ` +
    `la calle para al jugador y ninguno de los ${entradas.length} asaltos al brocal entra por el ` +
    `borde; con permiso se baja hasta la reja del fondo, a ${HONDO.toFixed(2)} m. ` +
    `Quitar la roca Y la escalera, o el .map, hace fallar a la sonda.\n`
);
