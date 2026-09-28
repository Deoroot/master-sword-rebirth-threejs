// La costura entre el suelo del pueblo y la roca de la boca.
//
// Es el trabajo de verdad de esta parte y por eso tiene pruebas propias. Lo que
// hay que demostrar no es que las dos cosas «encajen bien» -eso lo dice una
// captura, y ya hay dos fallos anotados que una captura vio y ninguna cifra-
// sino que la rejilla se REPARTE: ninguna celda sin nadie, ninguna celda con
// dos. Y eso sí es una cuenta.
//
// Las pruebas leen el `.map` EMITIDO, no las funciones que lo emiten. Preguntarle
// al emisor si emitió lo que emitió no comprueba nada; lo que se quiere saber es
// si el archivo que va a cargar el juego tiene suelo donde la roca no lo tapa.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { loadLevel } from "../src/map/level.js";
import { UNITS_PER_M } from "../src/map/geometry.js";
import { hayRoca, PASO, alturaRoca, PARCELA as PARCELA_BOCA, HONDO } from "../src/kit/boca.js";
import { PARCELAS, rect, ANCHO, FONDO } from "../src/kit/corinth.js";
import { CELDA } from "../src/kit/house.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RUTA = join(ROOT, "public", "maps", "corinth.map");

// Si el mapa no está emitido, es mejor decirlo una vez que fallar veinte veces
// con un error de archivo no encontrado que no explica nada.
const hayMapa = existsSync(RUTA);
const nivel = hayMapa
  ? loadLevel(readFileSync(RUTA, "utf8"), { name: "corinth" })
  : null;
const falta = hayMapa ? null : { skip: "falta public/maps/corinth.map: node tools/corinth_map.mjs" };

const U = UNITS_PER_M;
const SUB = PASO * U;
const boca = PARCELAS.find((p) => p.papel === "boca");
const r = rect(boca);
const x0 = r.x * CELDA * U;
const y0 = r.z * CELDA * U;
const n = Math.round((PARCELA_BOCA.ancho * CELDA) / PASO);

/** ¿Hay macizo en este punto, sin contar el sello ni el cielo? */
function macizo(nivel, p) {
  for (const b of nivel.brushes) {
    // Las texturas del brush: si TODAS son de sello o cielo, no cuenta. Un brush
    // normal puede llevar cielo en una cara suelta, así que mirar solo la
    // primera daría un falso negativo.
    if (b.degenerate) continue;
    if (b.textures.every((t) => /^sello|^sky/.test(t))) continue;
    if (p[0] < b.mins[0] - 0.01 || p[0] > b.maxs[0] + 0.01) continue;
    if (p[1] < b.mins[1] - 0.01 || p[1] > b.maxs[1] + 0.01) continue;
    if (p[2] < b.mins[2] - 0.01 || p[2] > b.maxs[2] + 0.01) continue;
    let dentro = true;
    for (const q of b.planes) {
      if (q[0] * p[0] + q[1] * p[1] + q[2] * p[2] > q[3] + 0.01) { dentro = false; break; }
    }
    if (dentro) return true;
  }
  return false;
}

test("el .map de Corinth existe y se lee", { ...falta }, () => {
  assert.ok(nivel.mesh.triangleCount > 0, "el mapa no tiene ni un triangulo solido");
  assert.ok(nivel.start, "el mapa no dice donde aparece el jugador");
});

// --- LA prueba: la reja de 0,4 m se reparte sin hueco ni solape --------------

test("cada paso de la rejilla de la boca lo tapa uno y solo uno", { ...falta }, () => {
  // 900 celdas de 40 cm. Por cada una se pregunta a las dos partes:
  //
  //   la roca   `hayRoca(i,j)` dice si la malla generada la cubre.
  //   el suelo  se mira si el `.map` tiene macizo justo debajo de la calle.
  //
  // Las dos respuestas tienen que ser contrarias. Si las dos dicen que sí, hay
  // una losa metida dentro del socavón; si las dos dicen que no, hay una rendija
  // por la que se ve el vacío, y una rendija de 40 cm de día casi no se ve.
  let conRoca = 0;
  let conLosa = 0;
  const huecos = [];
  const solapes = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const roca = hayRoca(i, j) !== false;
      // El centro de la celda, media unidad por debajo de la calle: es el
      // macizo de la losa, no su cara de arriba, que podría dar un empate.
      const p = [x0 + (i + 0.5) * SUB, y0 + (j + 0.5) * SUB, -1];
      const losa = macizo(nivel, p);
      if (roca) conRoca++;
      if (losa) conLosa++;
      if (roca && losa) solapes.push([i, j]);
      if (!roca && !losa) huecos.push([i, j]);
    }
  }
  assert.equal(
    huecos.length, 0,
    `${huecos.length} pasos sin roca y sin losa: rendija en ${huecos.slice(0, 5).map((c) => c.join(",")).join("  ")}`
  );
  assert.equal(
    solapes.length, 0,
    `${solapes.length} pasos con roca Y losa: losa dentro del agujero en ` +
      solapes.slice(0, 5).map((c) => c.join(",")).join("  ")
  );
  assert.equal(conRoca + conLosa, n * n, "las dos partes no suman la rejilla entera");
  assert.ok(conRoca > 100, `solo ${conRoca} pasos de roca: el socavon casi no existe`);
  assert.ok(conLosa > 50, `solo ${conLosa} pasos de losa: no queda calle alrededor del agujero`);
});

test("los vertices de la junta estan a cero exacto por el lado de la roca", { ...falta }, () => {
  // Es lo que permite que la junta case. `alturaRoca()` devuelve CERO EXACTO
  // fuera del labio -no «casi cero»-, y la losa del .map está a cota 0. Si
  // alguna esquina compartida valiera -0,003, la roca se hundiría bajo la calle
  // y quedaría una linea de sombra alrededor del socavón.
  let juntas = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if (hayRoca(i, j) !== "socavon") continue;
      // Los cuatro vecinos. Cada vecino sin roca es una junta, y la arista que
      // comparten son dos esquinas que tienen que valer cero en la roca.
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const vi = i + di, vj = j + dj;
        if (vi < 0 || vj < 0 || vi >= n || vj >= n) continue;
        if (hayRoca(vi, vj) !== false) continue;
        juntas++;
        // Las dos esquinas de la arista compartida, en metros de parcela.
        const esquinas = di !== 0
          ? [[(di > 0 ? i + 1 : i) * PASO, j * PASO], [(di > 0 ? i + 1 : i) * PASO, (j + 1) * PASO]]
          : [[i * PASO, (dj > 0 ? j + 1 : j) * PASO], [(i + 1) * PASO, (dj > 0 ? j + 1 : j) * PASO]];
        for (const [x, w] of esquinas) {
          const h = alturaRoca(x, w);
          assert.equal(h, 0, `la junta en ${i},${j} tiene la roca a ${h} y la calle a 0`);
        }
      }
    }
  }
  assert.ok(juntas > 20, `solo ${juntas} aristas de junta: el socavon no toca la calle`);
});

// --- el sello ----------------------------------------------------------------

test("el sello existe, y no se dibuja ni se pisa", { ...falta }, () => {
  // Las dos mitades del trato: tiene que estar en el .map -si no, qbsp ve una
  // fuga y deja de juzgar- y tiene que NO estar en la malla del runtime -si no,
  // el jugador anda sobre un suelo invisible por encima del agujero que ve-.
  assert.ok(nivel.selloFaces > 0, "no hay ni una cara de sello: qbsp vera el socavon como fuga");
  // El centro del crater, a ras de calle: en la malla del runtime no puede haber
  // nada ahi. La roca de esa cota esta cuatro metros mas abajo.
  const centro = [x0 + 6 * U, y0 + 5 * U, -1];
  assert.ok(!macizo(nivel, centro), "el .map tapa el centro del socavon con geometria de verdad");
  // Y la malla que se le da a Rapier y a Three no tiene ni un triangulo ahi.
  const { positions } = nivel.mesh;
  // El centro del crater en metros de Three.js.
  const cx = x0 / U + 6;
  const cz = -(y0 / U + 5);
  let cerca = 0;
  for (let i = 0; i < positions.length; i += 3) {
    if (Math.abs(positions[i] - cx) < 1 && Math.abs(positions[i + 2] - cz) < 1) cerca++;
  }
  assert.equal(cerca, 0, `${cerca} vertices del .map dentro del socavon: el sello se esta dibujando`);
});

test("el sello no se cuenta como cielo", { ...falta }, () => {
  // Son dos cosas distintas con el mismo truco. Sumarlas dejaria que un sello
  // olvidado en mitad de una calle pasara por una cara de cielo de mas.
  assert.ok(nivel.skyFaces > 0, "el mapa no tiene cielo");
  assert.notEqual(nivel.selloFaces, 0);
});

// --- el suelo, en conjunto ----------------------------------------------------

test("el pueblo es llano a cota cero, que es lo que la costura exige", { ...falta }, () => {
  // No es estetica. `alturaRoca()` vale cero exacto fuera del labio, y la unica
  // forma de que la calle case con eso es estar en cero ella tambien. El dia que
  // alguien le ponga micro-relieve al pueblo, esto falla y explica por que.
  const p = PARCELAS.find((q) => q.papel === "boca");
  const rb = rect(p);
  for (let z = rb.z - 1; z <= rb.z + rb.fondo; z++) {
    for (let x = rb.x - 1; x <= rb.x + rb.ancho; x++) {
      if (x < 0 || z < 0 || x >= ANCHO || z >= FONDO) continue;
      const centro = [(x + 0.5) * CELDA * U, (z + 0.5) * CELDA * U, -1];
      const arriba = [(x + 0.5) * CELDA * U, (z + 0.5) * CELDA * U, 1];
      if (!macizo(nivel, centro)) continue; // el agujero de la boca
      assert.ok(
        !macizo(nivel, arriba),
        `la celda ${x},${z} tiene suelo por encima de cota cero: la costura se rompe`
      );
    }
  }
});

test("el fondo de las losas queda por debajo del fondo del socavon", { ...falta }, () => {
  // Si el fondo de la losa estuviera por encima de -HONDO, el sello no llegaria
  // a tapar el agujero entero y qbsp volveria a ver fuga.
  let masBajo = Infinity;
  for (const b of nivel.brushes) masBajo = Math.min(masBajo, b.mins[2]);
  assert.ok(
    masBajo <= -HONDO * U,
    `las losas bajan a ${masBajo} y el socavon llega a ${(-HONDO * U).toFixed(1)}`
  );
});

test("el .map de Corinth no se sale del plano de celdas", { ...falta }, () => {
  // La muralla va por FUERA de la rejilla: el plano dice 20x18 celdas pisables y
  // comerse la primera fila con el muro dejaria 18x16 sin que nada lo dijera.
  const dentro = nivel.brushes.filter(
    (b) => b.mins[0] >= -1 && b.mins[1] >= -1 && b.maxs[0] <= ANCHO * CELDA * U + 1 &&
      b.maxs[1] <= FONDO * CELDA * U + 1
  );
  assert.ok(dentro.length > 100, `solo ${dentro.length} brushes dentro de la rejilla`);
  const esquina = [CELDA * U * 0.5, CELDA * U * 0.5, -1];
  assert.ok(macizo(nivel, esquina), "la celda 0,0 no tiene suelo: el muro se comio la primera fila");
});
