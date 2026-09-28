import test from "node:test";
import assert from "node:assert/strict";

import { parse } from "../src/map/parse.js";
import {
  buildMesh,
  meshBounds,
  toScene,
  facePolygon,
  faceArea,
  UNITS_PER_M,
} from "../src/map/geometry.js";
import { mapText } from "./fixtures.mjs";

const cube = (min, max, tex) => parse(mapText([[min, max, tex]]))[0].brushes;

/**
 * Volumen con signo de una malla cerrada.
 *
 * Esta es la comprobacion que separa 'sale una malla' de 'sale la malla
 * correcta': si el bobinado esta invertido el volumen sale negativo, y sin
 * medirlo un cubo del reves se ve exactamente igual de plausible que uno bien.
 */
function signedVolume(mesh) {
  let v = 0;
  const p = mesh.positions;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i] * 3, b = mesh.indices[i + 1] * 3, c = mesh.indices[i + 2] * 3;
    const ax = p[a], ay = p[a + 1], az = p[a + 2];
    const bx = p[b], by = p[b + 1], bz = p[b + 2];
    const cx = p[c], cy = p[c + 1], cz = p[c + 2];
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
}

test("los ejes de Quake pasan a los de Three.js sin perder la mano derecha", () => {
  // 32 unidades son un metro; Z de Quake sube, Y de Three.js sube.
  assert.deepEqual(toScene([32, 0, 0]), [1, 0, -0]);
  assert.deepEqual(toScene([0, 32, 0]), [0, 0, -1]);
  assert.deepEqual(toScene([0, 0, 32]), [0, 1, -0]);
  assert.equal(UNITS_PER_M, 32);
});

test("un cubo da doce triangulos y ocho vertices distintos", () => {
  const mesh = buildMesh(cube([-16, -16, -16], [16, 16, 16]));
  assert.equal(mesh.triangleCount, 12);
  const unique = new Set();
  for (let i = 0; i < mesh.positions.length; i += 3) {
    unique.add(`${mesh.positions[i]},${mesh.positions[i + 1]},${mesh.positions[i + 2]}`);
  }
  assert.equal(unique.size, 8);
});

test("el volumen con signo es positivo: las caras miran hacia fuera", () => {
  const mesh = buildMesh(cube([-16, -16, -16], [16, 16, 16]));
  // Un cubo de 32 unidades es un metro de lado: un metro cubico.
  assert.ok(Math.abs(signedVolume(mesh) - 1) < 1e-6, `volumen ${signedVolume(mesh)}`);
});

test("la normal geometrica de cada triangulo coincide con la del plano", () => {
  // Si el orden de los vertices y el plano discreparan, Three.js dibujaria una
  // cara y qbsp sellaria la contraria. Es el fallo que no se ve hasta mirar.
  const mesh = buildMesh(cube([0, 0, 0], [64, 96, 128]));
  const p = mesh.positions;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i] * 3, b = mesh.indices[i + 1] * 3, c = mesh.indices[i + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    const dot =
      (nx / len) * mesh.normals[mesh.indices[i] * 3] +
      (ny / len) * mesh.normals[mesh.indices[i] * 3 + 1] +
      (nz / len) * mesh.normals[mesh.indices[i] * 3 + 2];
    assert.ok(dot > 0.999, `normal del triangulo ${i / 3} discrepa: dot=${dot}`);
  }
});

test("la caja envolvente sale en metros y con Y arriba", () => {
  const mesh = buildMesh(cube([-64, -32, 0], [64, 32, 256]));
  const { min, max } = meshBounds(mesh);
  assert.deepEqual(min.map((v) => +v.toFixed(6)), [-2, 0, -1]);
  assert.deepEqual(max.map((v) => +v.toFixed(6)), [2, 8, 1]);
});

test("las caras se agrupan por textura y el orden es estable", () => {
  const brushes = parse(
    mapText([
      [[-16, -16, -16], [16, 16, 0], "floor01"],
      [[-16, -16, 0], [16, 16, 16], "wall01"],
    ])
  )[0].brushes;
  const a = buildMesh(brushes);
  const b = buildMesh(brushes);
  assert.deepEqual(a.groups.map((g) => g.texture), ["floor01", "wall01"]);
  assert.deepEqual(a.groups.map((g) => g.indices), b.groups.map((g) => g.indices));
});

test("skip descarta caras y lo dice, en vez de perderlas en silencio", () => {
  const brushes = parse(
    mapText([
      [[-16, -16, -16], [16, 16, 0], "floor01"],
      [[-16, -16, 0], [16, 16, 16], "sky01"],
    ])
  )[0].brushes;
  const mesh = buildMesh(brushes, { skip: (t) => t.startsWith("sky") });
  assert.equal(mesh.skipped, 6);
  assert.equal(mesh.triangleCount, 12);
  assert.deepEqual(mesh.groups.map((g) => g.texture), ["floor01"]);
});

test("el area de una cara es la que mide a mano", () => {
  const [b] = cube([0, 0, 0], [64, 96, 128]);
  const areas = b.planes.map((_, i) => faceArea(facePolygon(b, i), b.planes[i]));
  areas.sort((x, y) => x - y);
  // Tres pares de caras: 64x96, 64x128 y 96x128 unidades cuadradas.
  assert.deepEqual(areas.map(Math.round), [6144, 6144, 8192, 8192, 12288, 12288]);
});

test("un brush degenerado se cuenta, no se cuela como geometria", () => {
  // Cuatro planos que no encierran nada: el brush queda sin vertices.
  const text =
    '{\n"classname" "worldspawn"\n{\n' +
    "( 0 0 0 ) ( 1 0 0 ) ( 0 1 0 ) floor01 0 0 0 1 1\n" +
    "( 0 0 0 ) ( 0 1 0 ) ( 1 0 0 ) floor01 0 0 0 1 1\n" +
    "( 0 0 0 ) ( 1 0 0 ) ( 0 0 1 ) floor01 0 0 0 1 1\n" +
    "( 0 0 0 ) ( 0 0 1 ) ( 1 0 0 ) floor01 0 0 0 1 1\n" +
    "}\n}\n";
  const mesh = buildMesh(parse(text)[0].brushes);
  assert.equal(mesh.degenerate, 1);
  assert.equal(mesh.triangleCount, 0);
});

test("una malla vacia informa de cero, no de un numero plausible", () => {
  const mesh = buildMesh([]);
  assert.equal(mesh.triangleCount, 0);
  assert.equal(mesh.vertexCount, 0);
  assert.deepEqual(mesh.groups, []);
});
