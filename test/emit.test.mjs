// El emisor, comprobado dando la vuelta completa: emitir, volver a leer, medir.
//
// Es la unica forma honesta de comprobar un emisor. Que produzca texto con
// buena pinta no dice nada: un brush con las caras del reves se lee igual de
// bien y qbsp lo descarta en silencio.

import test from "node:test";
import assert from "node:assert/strict";

import { parse } from "../src/map/parse.js";
import { buildMesh } from "../src/map/geometry.js";
import { box, gable, brushFromFaces, MapBuilder, readPlan, runs } from "../src/map/emit.js";

/** Volumen con signo: positivo significa caras hacia fuera. */
function volume(mesh) {
  let v = 0;
  const p = mesh.positions;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i] * 3, b = mesh.indices[i + 1] * 3, c = mesh.indices[i + 2] * 3;
    v += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
        - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c])
        + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
  }
  return v;
}

/** Emite, vuelve a leer y devuelve los brushes y la malla. */
function roundTrip(...brushes) {
  const text = new MapBuilder().add(...brushes).toText();
  const world = parse(text).find((e) => e.classname === "worldspawn");
  return { text, brushes: world.brushes, mesh: buildMesh(world.brushes) };
}

test("una caja emitida vuelve a leerse con el volumen que toca", () => {
  // 128x64x32 unidades son 4x2x1 metros: 8 metros cubicos.
  const { brushes, mesh } = roundTrip(box([0, 0, 0], [128, 64, 32], "wall01"));
  assert.equal(brushes.length, 1);
  assert.equal(brushes[0].verts.length, 8);
  assert.ok(Math.abs(volume(mesh) - 8) < 1e-6, `volumen ${volume(mesh)}`);
});

test("las caras de una caja emitida miran hacia fuera", () => {
  const { brushes } = roundTrip(box([0, 0, 0], [64, 64, 64], "wall01"));
  const centre = [32, 32, 32];
  for (const [nx, ny, nz, d] of brushes[0].planes) {
    assert.ok(nx * centre[0] + ny * centre[1] + nz * centre[2] < d);
  }
});

test("cada cara de una caja puede llevar su textura", () => {
  const { brushes } = roundTrip(
    box([0, 0, 0], [64, 64, 16], { top: "floor01", bottom: "grass01", side: "wood01" })
  );
  const t = brushes[0].textures;
  assert.ok(t.includes("floor01"), "falta la de arriba");
  assert.ok(t.includes("grass01"), "falta la de abajo");
  assert.equal(t.filter((x) => x === "wood01").length, 4, "los cuatro cantos");
});

test("un tejado a dos aguas sale con las dos cunas hacia fuera", () => {
  // Es lo que mas facil sale del reves: los dos faldones miran a lados
  // contrarios, y el orden de vertices que va bien para uno deja al otro con
  // las caras hacia dentro. Un faldon invertido no da error: desaparece.
  const roof = gable([0, 0], [256, 128], 128, 64, "x", 8);
  assert.equal(roof.length, 2, "un tejado a dos aguas son dos cunas");
  const { brushes, mesh } = roundTrip(roof);
  assert.equal(brushes.length, 2);
  for (const b of brushes) {
    assert.ok(!b.degenerate, "una cuna salio degenerada");
    assert.ok(b.verts.length >= 6, `cuna con ${b.verts.length} vertices`);
  }
  assert.ok(volume(mesh) > 0, `volumen ${volume(mesh)}: hay una cuna del reves`);
});

test("el tejado mide lo que tiene que medir", () => {
  // Verdad conocida: planta de 256x128 con alero de 8 y subida de 64. El
  // volumen de un prisma triangular es base por altura partido dos, por el
  // largo: (128+16) * 64 / 2 * (256+16) unidades cubicas.
  const { mesh } = roundTrip(gable([0, 0], [256, 128], 128, 64, "x", 8));
  const expected = ((144 * 64) / 2) * 272 / 32 ** 3;
  assert.ok(
    Math.abs(volume(mesh) - expected) < 1e-3,
    `volumen ${volume(mesh).toFixed(4)}, esperado ${expected.toFixed(4)}`
  );
});

test("el caballete corre en el eje que se le pide", () => {
  const enX = roundTrip(gable([0, 0], [256, 128], 128, 64, "x", 0));
  const enY = roundTrip(gable([0, 0], [256, 128], 128, 64, "y", 0));
  // Con el caballete en X, la cumbrera es una linea larga en X; con el
  // caballete en Y, en Y. Se distingue por donde estan los vertices mas altos.
  const top = (r) => r.brushes.flatMap((b) => b.verts).filter((v) => v[2] > 190);
  const spreadX = (vs) => Math.max(...vs.map((v) => v[0])) - Math.min(...vs.map((v) => v[0]));
  const spreadY = (vs) => Math.max(...vs.map((v) => v[1])) - Math.min(...vs.map((v) => v[1]));
  assert.ok(spreadX(top(enX)) > spreadY(top(enX)), "el caballete en x no corre en x");
  assert.ok(spreadY(top(enY)) > spreadX(top(enY)), "el caballete en y no corre en y");
});

test("una cara con menos de tres vertices es un error", () => {
  assert.throws(() => brushFromFaces([{ verts: [[0, 0, 0], [1, 0, 0]] }], "wall01"), /tres vertices/);
});

test("un mapa sin brushes no se emite", () => {
  // Un mundo vacio sella perfecto. Negarse aqui cuesta menos que descubrirlo
  // mirando una pantalla de niebla.
  assert.throws(() => new MapBuilder().toText(), /ni un brush/);
});

test("las entidades salen con sus propiedades", () => {
  const text = new MapBuilder()
    .add(box([0, 0, 0], [64, 64, 64], "wall01"))
    .point("info_player_start", [32, 32, 24])
    .point("light", [32, 32, 96], { light: 300 })
    .toText();
  const ents = parse(text);
  assert.equal(ents.find((e) => e.classname === "info_player_start").origin()[2], 24);
  assert.equal(ents.find((e) => e.classname === "light").props.light, "300");
});

// --- plano de planta -------------------------------------------------------

test("el plano se lee con las filas de arriba abajo", () => {
  const { grid, width, height } = readPlan("###\n#.#\n###");
  assert.equal(width, 3);
  assert.equal(height, 3);
  assert.equal(grid[1][1], ".");
});

test("las filas cortas se rellenan en vez de romper", () => {
  const { grid, width } = readPlan("#####\n#.");
  assert.equal(width, 5);
  assert.equal(grid[1].length, 5);
  assert.equal(grid[1][4], " ");
});

test("los tramos seguidos se agrupan", () => {
  // Sin agrupar, un pueblo de veinte por veinte celdas serian cuatrocientos
  // brushes de suelo.
  const list = runs(readPlan("##..##").grid);
  assert.deepEqual(
    list.map((r) => [r.ch, r.x0, r.x1]),
    [["#", 0, 1], [".", 2, 3], ["#", 4, 5]]
  );
});

test("los comentarios del plano no cuentan como filas", () => {
  const { height } = readPlan("// el pueblo\n###\n###");
  assert.equal(height, 2);
});
