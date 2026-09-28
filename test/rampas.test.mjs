// El pueblo con el suelo en rampas, contra el mismo pueblo en escalones.
//
// Las dos versiones salen del MISMO plano y de la misma tabla de casas. Lo
// unico que cambia es como se emite el suelo. Por eso casi todas las pruebas
// de aqui son comparaciones entre los dos: si algo que no es el suelo saliera
// distinto, la comparacion visual entre las dos capturas no estaria hablando
// del relieve, estaria hablando de un fallo del emisor.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { loadLevel } from "../src/map/level.js";
import { meshBounds, UNITS_PER_M } from "../src/map/geometry.js";
import { initPhysics, World, Player, PLAYER } from "../src/play/player.js";
import { MAX_SLOPE_DEG } from "../src/map/slope.js";
import { PUEBLO, PUEBLO_RAMPAS } from "./fixtures.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const maps = join(here, "..", "public", "maps");

const rampas = loadLevel(await readFile(PUEBLO_RAMPAS, "utf8"), { name: "pueblo-rampas" });
const escalones = loadLevel(await readFile(PUEBLO, "utf8"), { name: "pueblo" });
const meta = JSON.parse(await readFile(join(maps, "pueblo-rampas.meta.json"), "utf8"));
const metaEsc = JSON.parse(await readFile(join(maps, "pueblo.meta.json"), "utf8"));
const RAPIER = await initPhysics();

const DT = 1 / 60;

/**
 * Altura del suelo en un punto, tirando un rayo desde arriba. En unidades.
 *
 * Devuelve null si no hay nada debajo: con una casa o la muralla en medio el
 * rayo toca el tejado, y una cota de tejado metida entre dos de calle se lee
 * como un escalon de dos metros que no existe.
 */
function alturaEn(world, xu, yu) {
  const desde = { x: xu / UNITS_PER_M, y: 300 / UNITS_PER_M, z: -yu / UNITS_PER_M };
  const hit = world.world.castRay(
    new RAPIER.Ray(desde, { x: 0, y: -1, z: 0 }),
    400 / UNITS_PER_M,
    true
  );
  if (!hit) return null;
  const z = (desde.y - hit.timeOfImpact) * UNITS_PER_M;
  // Fuera del rango del terreno es tejado, brocal o barril: no es el suelo.
  return z > 40 || z < -80 ? null : z;
}

test("el pueblo en rampas se carga con geometria y sin degenerados", () => {
  assert.ok(rampas.brushes.length > 1000, `solo ${rampas.brushes.length} brushes`);
  assert.ok(rampas.mesh.triangleCount > 0);
  // Un prisma con una cara mal orientada no da error: qbsp lo descarta y esa
  // parte del suelo sencillamente no esta. Es el fallo mas facil de cometer
  // emitiendo caras inclinadas y el que menos se ve.
  assert.equal(rampas.mesh.degenerate, 0, "hay brushes degenerados");
});

test("mide exactamente lo mismo que el pueblo en escalones", () => {
  const a = meshBounds(rampas.mesh);
  const b = meshBounds(escalones.mesh);
  for (const eje of [0, 2]) {
    assert.equal(
      Math.round((a.max[eje] - a.min[eje]) * UNITS_PER_M),
      Math.round((b.max[eje] - b.min[eje]) * UNITS_PER_M),
      `el eje ${eje} no coincide`
    );
  }
});

test("tiene las mismas casas, arboles y matas: solo cambia el suelo", () => {
  assert.deepEqual(Object.keys(meta.houses), Object.keys(metaEsc.houses));
  assert.equal(meta.trees, metaEsc.trees);
  assert.equal(meta.bushes, metaEsc.bushes);
  assert.equal(rampas.entities.length, escalones.entities.length);
});

test("el relieve en rampas es mayor que el escalonado, que es la gracia", () => {
  // Con escalones el desnivel esta limitado por lo que el jugador sube de un
  // paso; con rampas lo limita la pendiente, que da mucho mas juego. Si los
  // dos dieran lo mismo, esta opcion no aportaria nada.
  const r = meta.relieve.max - meta.relieve.min;
  const e = metaEsc.relieve.max - metaEsc.relieve.min;
  assert.equal(meta.relieve.modo, "rampas");
  assert.ok(r > e, `rampas ${r} unidades contra escalones ${e}`);
});

test("la pendiente se queda por debajo de la que sube el jugador", () => {
  assert.ok(
    meta.relieve.pendiente_maxima_grados <= MAX_SLOPE_DEG,
    `${meta.relieve.pendiente_maxima_grados} grados`
  );
  assert.ok(MAX_SLOPE_DEG < PLAYER.maxSlopeDeg);
});

test("la superficie que se pisa es continua: no quedan peldanos", () => {
  // Es la comprobacion que distingue de verdad las dos versiones, y hay que
  // hacerla donde importa. Medir caras verticales en la malla no vale: TODAS
  // las losas tienen costados de dos metros, solo que enterrados bajo la losa
  // de al lado. Lo que se nota al andar es la superficie de arriba, asi que se
  // mide la superficie de arriba: rayos desde el cielo, como haria un pie.
  //
  // Sin esto, un emisor que se olvidara de inclinar la cara de arriba
  // produciria exactamente el pueblo escalonado y las ocho pruebas restantes
  // seguirian en verde.
  const peldanos = (level) => {
    const world = new World(level.mesh);
    // Un paso antes de tirar rayos. Sin el, el arbol de colisiones de Rapier
    // esta vacio y castRay no toca nada: devuelve null para todos los puntos,
    // y null se lee aqui como "ahi hay un tejado". O sea, la prueba pasaria
    // sin haber medido una sola muestra.
    world.world.step();
    let saltos = 0;
    let muestras = 0;
    // Cuatro lineas norte-sur por las calles y la plaza, cada 25 cm.
    for (const xu of [1152, 1600, 2048, 2176]) {
      let anterior = null;
      for (let yu = 384; yu <= 2432; yu += 8) {
        const z = alturaEn(world, xu, yu);
        if (z === null) {
          anterior = null;
          continue;
        }
        if (anterior !== null) {
          muestras++;
          // Seis unidades: por debajo de un peldano de ocho y muy por encima
          // de lo que sube una rampa en 25 cm.
          if (Math.abs(z - anterior) >= 6) saltos++;
        }
        anterior = z;
      }
    }
    world.free();
    return { fraccion: saltos / muestras, muestras };
  };

  const esc = peldanos(escalones);
  const ram = peldanos(rampas);
  assert.ok(esc.muestras > 500 && ram.muestras > 500, "no se tomaron muestras suficientes");
  // El pueblo escalonado TIENE que tener peldanos. Si no los tuviera, la
  // comprobacion de abajo estaria pasando por comparar con nada.
  assert.ok(esc.fraccion > 0.01, `el pueblo escalonado no tiene peldanos: ${esc.fraccion}`);
  assert.ok(
    ram.fraccion < esc.fraccion / 4,
    `con rampas sigue habiendo peldanos en el ${(ram.fraccion * 100).toFixed(2)}% ` +
      `de las muestras, contra el ${(esc.fraccion * 100).toFixed(2)}% escalonado`
  );
});

test("se aparece sobre el suelo inclinado, ni enterrado ni flotando", () => {
  const world = new World(rampas.mesh);
  const player = new Player(world, rampas.start);
  for (let i = 0; i < 120; i++) {
    player.step(DT, {});
    if (player.grounded) break;
  }
  assert.ok(player.grounded, "el jugador no encontro suelo donde aparece");
  const caida = (rampas.start[1] - player.feet[1]) * UNITS_PER_M;
  assert.ok(Math.abs(caida) < 16, `cayo ${caida.toFixed(1)} unidades al aparecer`);
  world.free();
});

test("se anda por la cuesta sin atascarse y sin despegar del suelo", () => {
  // El fallo que esto caza: una pendiente que el controlador rechaza deja al
  // jugador resbalando en el sitio. No falla nada, no se cae nada, solo no se
  // avanza -y en una captura fija se ve igual que si avanzara.
  const world = new World(rampas.mesh);
  const player = new Player(world, rampas.start);
  for (let i = 0; i < 60; i++) player.step(DT, {});
  const desde = player.feet;

  let enAire = 0;
  const pasos = 120; // dos segundos, la parte despejada de la calle
  for (let i = 0; i < pasos; i++) {
    player.step(DT, { forward: 1 });
    if (!player.grounded) enAire++;
  }
  const hasta = player.feet;
  const metros = Math.hypot(hasta[0] - desde[0], hasta[2] - desde[2]);

  assert.ok(metros > 8, `en dos segundos solo anduvo ${metros.toFixed(2)} m`);
  assert.ok(enAire / pasos < 0.1, `paso el ${((enAire / pasos) * 100).toFixed(0)}% en el aire`);
  world.free();
});

test("subir la cuesta cuesta lo mismo que bajarla, dentro de lo razonable", () => {
  // Con una pendiente mal limitada, andar cuesta arriba avanza la mitad que
  // cuesta abajo y el pueblo se vuelve asimetrico sin que nada lo diga.
  const world = new World(rampas.mesh);
  const player = new Player(world, rampas.start);
  const anda = (yaw) => {
    player.body.setTranslation(
      { x: rampas.start[0], y: rampas.start[1] + player.centreOffset, z: rampas.start[2] },
      true
    );
    player.velocityY = 0;
    player.yaw = yaw;
    for (let i = 0; i < 60; i++) player.step(DT, {});
    const a = player.feet;
    for (let i = 0; i < 90; i++) player.step(DT, { forward: 1 });
    const b = player.feet;
    return Math.hypot(b[0] - a[0], b[2] - a[2]);
  };
  const norte = anda(0);
  const sur = anda(Math.PI);
  assert.ok(norte > 4 && sur > 4, `norte ${norte.toFixed(1)} m, sur ${sur.toFixed(1)} m`);
  assert.ok(
    Math.min(norte, sur) / Math.max(norte, sur) > 0.6,
    `una direccion avanza mucho menos que la otra: ${norte.toFixed(1)} contra ${sur.toFixed(1)}`
  );
  world.free();
});
