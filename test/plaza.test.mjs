// plaza.map contra su propio plaza.meta.json.
//
// El .meta.json lo escribio el emisor del experimento 02 mientras construia el
// nivel, asi que es verdad conocida e independiente del cargador de JS. Si las
// dos cifras coinciden, las dos pilas estan viendo el mismo mapa.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { loadLevel, PLAYER_ORIGIN_Z } from "../src/map/level.js";
import { meshBounds, UNITS_PER_M } from "../src/map/geometry.js";
import { MAP_LAB, PLAZA } from "./fixtures.mjs";

const text = await readFile(PLAZA, "utf8");
const meta = JSON.parse(
  await readFile(join(MAP_LAB, "build", "plaza.meta.json"), "utf8")
);
const level = loadLevel(text, { name: "plaza" });

test("plaza.map se carga y tiene geometria", () => {
  // La regla del 02: exit 0 no significa correcto. Un mapa vacio se carga
  // igual de bien, asi que el numero tiene que ser distinto de cero a mano.
  assert.ok(level.brushes.length > 0, "sin brushes");
  assert.ok(level.mesh.triangleCount > 0, "sin triangulos");
  assert.equal(level.mesh.degenerate, 0, "hay brushes degenerados");
});

test("hay caras de cielo, o sea que el mapa tiene tapa", () => {
  assert.ok(level.skyFaces > 0, "ninguna cara de cielo: el mapa no esta sellado");
});

test("todas las texturas que declara el meta aparecen en el mapa", () => {
  const used = new Set(level.mesh.groups.map((g) => g.texture));
  for (const t of meta.textures) {
    if (t.startsWith("sky")) continue;
    assert.ok(used.has(t), `el meta declara ${t} y no hay ninguna cara con ella`);
  }
});

test("door01 esta en el mapa aunque el meta no la declare", () => {
  // Hallazgo, no capricho de la prueba: plaza.meta.json lista cuatro texturas
  // y el .map usa cinco. La que falta es la de la puerta. Ver la prueba de
  // abajo: la puerta esta enterrada, asi que el meta describe lo que se ve y
  // el .map lo que hay. El experimento 02 esta congelado y no se corrige aqui.
  const used = new Set(level.mesh.groups.map((g) => g.texture));
  assert.ok(used.has("door01"));
  assert.ok(!meta.textures.includes("door01"));
});

test("el punto de aparicion coincide con el que anoto el emisor", () => {
  assert.deepEqual(level.startUnits, meta.spawn_units);
});

test("los pies del jugador quedan sobre el suelo, no flotando", () => {
  // meta.spawn_units da el origin, que esta 24 unidades por encima de los pies.
  const feetUnits = meta.spawn_units[2] - PLAYER_ORIGIN_Z;
  assert.equal(level.start[1] * UNITS_PER_M, feetUnits);
  assert.equal(feetUnits, 0, "en plaza el suelo esta a cero");
});

test("la altura del mapa coincide con la que anoto el emisor", () => {
  const { min, max } = meshBounds(level.mesh);
  // El meta mide el suelo y el techo del espacio jugable; la malla incluye el
  // grosor de los brushes, asi que la malla contiene al meta, no al reves.
  assert.ok(min[1] * UNITS_PER_M <= meta.bottom, `suelo ${min[1] * UNITS_PER_M}`);
  assert.ok(max[1] * UNITS_PER_M >= meta.top - 16, `techo ${max[1] * UNITS_PER_M}`);
});

test("estan las luces y los monstruos que dice el meta", () => {
  assert.equal(level.lights.length, meta.lights);
  const monsters = level.points.filter((p) => p.classname.startsWith("monster_"));
  assert.equal(monsters.length, meta.monsters);
});

test("el paso a bastion existe, con mapa y punto de llegada", () => {
  const trigger = level.points.find((p) => p.classname === "trigger_level");
  assert.ok(trigger, "no hay trigger_level: no se puede salir de plaza");
  const door = meta.doors[0];
  assert.equal(trigger.units[0], door.units[0]);
  assert.equal(trigger.units[1], door.units[1]);
});

test("la puerta de plaza esta enterrada bajo el suelo: no se ve", () => {
  // Esta es una de las dos cosas que el experimento 02 dio por buenas y solo
  // se veian mirando. Queda aqui fijada con cifras para que deje de depender
  // de que alguien se acuerde.
  //
  // El suelo jugable esta en z=0. La losa de door01 ocupa de -80 a -64, o sea
  // que su cara mas alta queda dos metros por debajo de los pies del jugador,
  // dentro del macizo del suelo. El trigger_level va con ella, en z=-40, y el
  // meta lo anota en z=24, que es donde se camina. Las tres cotas no coinciden.
  const doorBrush = level.brushes.find((b) => b.textures.includes("door01"));
  assert.ok(doorBrush, "ya no hay brush de puerta");
  assert.equal(doorBrush.maxs[2], -64);

  const floorTop = 0;
  assert.ok(
    doorBrush.maxs[2] < floorTop,
    "la puerta ya asoma sobre el suelo: arreglado en el 02, actualizar esta prueba"
  );

  const trigger = level.points.find((p) => p.classname === "trigger_level");
  assert.equal(trigger.units[2], -40);
  assert.notEqual(trigger.units[2], meta.doors[0].units[2]);
});

test("el punto de llegada desde bastion existe", () => {
  const arrive = level.points.find((p) => p.classname === "info_player_arrive");
  assert.ok(arrive, "no hay info_player_arrive");
  // El meta lo anota en y=736 y el .map lo pone en y=416: otra cota que las
  // dos fuentes del 02 no comparten. Se deja constancia, no se corrige.
  assert.equal(arrive.units[1], 416);
  assert.equal(meta.arrivals[0].units[1], 736);
});

test("el mapa cabe en la extension de celdas que declara el meta", () => {
  const { min, max } = meshBounds(level.mesh);
  const wide = (max[0] - min[0]) * UNITS_PER_M;
  const deep = (max[2] - min[2]) * UNITS_PER_M;
  const limit = (n) => (n + 2) * meta.cell_units;
  assert.ok(wide <= limit(meta.cells[0]), `ancho ${wide}`);
  assert.ok(deep <= limit(meta.cells[1]), `fondo ${deep}`);
});
