// Caminar, sin navegador y sin ojos.
//
// Esta es la pregunta del experimento 03. Si estas pruebas corren en Node
// plano, el veredicto automatico sobrevive fuera de Godot. Si hiciera falta un
// navegador para saber si el jugador sube un escalon, no sobrevive.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { loadLevel } from "../src/map/level.js";
import { UNITS_PER_M } from "../src/map/geometry.js";
import { initPhysics, World, Player, PLAYER } from "../src/play/player.js";
import { stepRoom, PLAZA } from "./fixtures.mjs";

await initPhysics();

const DT = 1 / 60;

/** Un mundo y un jugador a partir del texto de un .map. */
function spawn(text, name = "prueba") {
  const level = loadLevel(text, { name });
  const world = new World(level.mesh);
  const player = new Player(world, level.start);
  return { level, world, player };
}

/** Deja caer al jugador hasta que toque suelo. Devuelve los pasos que tardo. */
function settle(player, maxSteps = 240) {
  for (let i = 0; i < maxSteps; i++) {
    player.step(DT, {});
    if (player.grounded) return i + 1;
  }
  return null;
}

test("un mundo sin triangulos no se acepta en silencio", () => {
  // Sin esto el jugador caeria para siempre y la prueba de caminar mediria un
  // desplazamiento perfecto en el vacio. Es el 'exit 0 no significa correcto'
  // de la fisica.
  assert.throws(
    () => new World({ positions: new Float32Array(), indices: new Uint32Array(), triangleCount: 0 }),
    /ni un triangulo/
  );
});

test("el jugador aparece en el suelo de plaza y no lo atraviesa", async () => {
  const text = await readFile(PLAZA, "utf8");
  const { player, world } = spawn(text, "plaza");
  const y0 = player.feet[1];
  const steps = settle(player);
  assert.ok(steps !== null, "el jugador no llego a tocar suelo: cae al vacio");
  const drop = (y0 - player.feet[1]) * UNITS_PER_M;
  assert.ok(drop < 4, `cayo ${drop.toFixed(1)} unidades antes de asentarse`);
  assert.ok(player.feet[1] > -1, "el jugador se colo por debajo del suelo");
  world.free();
});

test("caminar hacia delante avanza a la velocidad que se pidio", async () => {
  const text = await readFile(PLAZA, "utf8");
  const { player, world } = spawn(text, "plaza");
  settle(player);
  // Mirando hacia -X, que en plaza es campo abierto desde la aparicion.
  player.yaw = Math.PI / 2;
  const before = player.feet;
  const seconds = 1.0;
  for (let i = 0; i < seconds / DT; i++) player.step(DT, { forward: 1 });
  const after = player.feet;
  const travelled = Math.hypot(after[0] - before[0], after[2] - before[2]);
  const expected = PLAYER.walkSpeed * seconds;
  assert.ok(
    travelled > expected * 0.9,
    `avanzo ${travelled.toFixed(2)} m de ${expected.toFixed(2)} esperados: algo lo frena`
  );
  assert.ok(travelled <= expected * 1.01, `avanzo de mas: ${travelled.toFixed(2)} m`);
  world.free();
});

test("quieto es quieto: sin entrada no se desplaza", async () => {
  const text = await readFile(PLAZA, "utf8");
  const { player, world } = spawn(text, "plaza");
  settle(player);
  const before = player.feet;
  for (let i = 0; i < 120; i++) player.step(DT, {});
  const drift = Math.hypot(player.feet[0] - before[0], player.feet[2] - before[2]);
  assert.ok(drift < 0.01, `se fue solo ${drift.toFixed(4)} m`);
  world.free();
});

test("sube un escalon de 16 unidades", () => {
  // La cifra del experimento 02. Con autostep corto el jugador no falla: se
  // queda parado contra el peldano y nada lo avisa.
  const { player, world } = spawn(stepRoom(16), "escalon16");
  settle(player);
  const y0 = player.feet[1];
  // El escalon ocupa la mitad +Y de Quake de la sala, que en la escena es -Z,
  // y yaw 0 mira justo hacia -Z.
  player.yaw = 0;
  for (let i = 0; i < 300; i++) player.step(DT, { forward: 1 });
  const risen = (player.feet[1] - y0) * UNITS_PER_M;
  assert.ok(risen > 15, `solo subio ${risen.toFixed(1)} unidades de 16`);
  assert.ok(risen < 17, `subio ${risen.toFixed(1)} unidades: mas que el escalon`);
  world.free();
});

test("no trepa un escalon de 24 unidades", () => {
  // El camino de error, ejercitado a proposito: un autostep demasiado generoso
  // sube paredes y eso no se ve en ninguna captura.
  const { player, world } = spawn(stepRoom(24), "escalon24");
  settle(player);
  const y0 = player.feet[1];
  player.yaw = 0;
  for (let i = 0; i < 300; i++) player.step(DT, { forward: 1 });
  const risen = (player.feet[1] - y0) * UNITS_PER_M;
  assert.ok(risen < 8, `subio ${risen.toFixed(1)} unidades un escalon de 24`);
  world.free();
});

test("una pared para al jugador, no lo deja salir del mapa", () => {
  const { player, world } = spawn(stepRoom(0), "sala");
  settle(player);
  player.yaw = 0;
  for (let i = 0; i < 600; i++) player.step(DT, { forward: 1 });
  const z = player.feet[2] * UNITS_PER_M; // -Z de escena son +Y de Quake
  assert.ok(-z < 256, `el jugador llego a y=${(-z).toFixed(0)}: atraveso la pared`);
  assert.ok(player.feet[1] > -1, "se colo por el suelo");
  world.free();
});

test("la simulacion es determinista: dos ejecuciones dan lo mismo", () => {
  // Sin esto no hay veredicto automatico que valga: una prueba que da un
  // numero distinto cada vez no distingue un fallo de un ruido.
  const run = () => {
    const { player, world } = spawn(stepRoom(16), "det");
    settle(player);
    player.yaw = 0.7;
    for (let i = 0; i < 180; i++) player.step(DT, { forward: 1, strafe: 0.3 });
    const feet = player.feet;
    world.free();
    return feet;
  };
  const a = run();
  const b = run();
  assert.deepEqual(a, b);
});

test("caer desde alto termina en el suelo y no atraviesa", () => {
  // Un solo jugador en el mundo: dos capsulas colisionan entre si y la que
  // cae aterriza sobre la otra, a 56 unidades, que es una cifra perfectamente
  // plausible y completamente falsa.
  const level = loadLevel(stepRoom(0), { name: "caida" });
  const world = new World(level.mesh);
  const high = [level.start[0], level.start[1] + 4, level.start[2]];
  const player = new Player(world, high);
  const steps = settle(player, 600);
  assert.ok(steps !== null, "no aterrizo");
  const y = player.feet[1] * UNITS_PER_M;
  assert.ok(Math.abs(y) < 2, `aterrizo en z=${y.toFixed(1)} en vez de 0`);
  world.free();
});
