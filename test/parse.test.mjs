import test from "node:test";
import assert from "node:assert/strict";

import {
  parse,
  parseFace,
  planeOf,
  solve3,
  brushVertices,
  MapError,
} from "../src/map/parse.js";
import { brush, mapText } from "./fixtures.mjs";

test("el plano de una cara apunta hacia fuera del brush", () => {
  // La cara +Z de un cubo centrado en el origen, con los puntos en el orden
  // que fija el formato. La normal tiene que salir hacia arriba.
  const p = planeOf([16, 16, 16], [16, -16, 16], [-16, -16, 16]);
  assert.deepEqual(p.slice(0, 3).map((c) => Math.round(c) + 0), [0, 0, 1]);
  assert.equal(Math.round(p[3]), 16);
});

test("tres puntos alineados dan cara degenerada, no un plano inventado", () => {
  assert.equal(planeOf([0, 0, 0], [1, 0, 0], [2, 0, 0]), null);
});

test("tres planos paralelos no se cortan en un punto", () => {
  assert.equal(
    solve3([0, 0, 1, 0], [0, 0, 1, 10], [0, 0, 1, 20]),
    null
  );
});

test("un cubo de 32 unidades da ocho vertices y el volumen que toca", () => {
  const ents = parse(mapText([[[-16, -16, -16], [16, 16, 16]]]));
  const world = ents.find((e) => e.classname === "worldspawn");
  assert.equal(world.brushes.length, 1);
  const b = world.brushes[0];
  assert.equal(b.verts.length, 8);
  assert.deepEqual(b.mins, [-16, -16, -16]);
  assert.deepEqual(b.maxs, [16, 16, 16]);
  assert.equal(b.degenerate, false);
});

test("dentro del brush es dot(n,p) <= d para todas las caras", () => {
  // Es la convencion de mapstats.py y de qbsp. Si se invierte el signo, el
  // cargador sigue dando ocho vertices pero el brush queda del reves.
  const ents = parse(mapText([[[0, 0, 0], [64, 32, 96]]]));
  const b = ents[0].brushes[0];
  const centre = [32, 16, 48];
  for (const [nx, ny, nz, d] of b.planes) {
    assert.ok(
      nx * centre[0] + ny * centre[1] + nz * centre[2] < d,
      "el centro del brush tiene que quedar dentro de cada cara"
    );
  }
});

test("un brush con caras de mas sigue cerrando", () => {
  // Un cubo al que se le corta una esquina con un septimo plano diagonal.
  const planes = [
    [1, 0, 0, 16], [-1, 0, 0, 16],
    [0, 1, 0, 16], [0, -1, 0, 16],
    [0, 0, 1, 16], [0, 0, -1, 16],
    [0.5774, 0.5774, 0.5774, 20],
  ];
  const verts = brushVertices(planes);
  assert.ok(verts.length > 8, `se esperaban mas de 8 vertices, hubo ${verts.length}`);
  for (const v of verts) {
    for (const p of planes) {
      assert.ok(p[0] * v[0] + p[1] * v[1] + p[2] * v[2] <= p[3] + 0.01);
    }
  }
});

test("se leen las propiedades y el origin de las entidades", () => {
  const ents = parse(mapText([[[-16, -16, -16], [16, 16, 16]]], { spawn: [8, -4, 24] }));
  const start = ents.find((e) => e.classname === "info_player_start");
  assert.deepEqual(start.origin(), [8, -4, 24]);
  const light = ents.find((e) => e.classname === "light");
  assert.equal(light.props.light, "300");
});

test("un origin mal escrito da null, no NaN silencioso", () => {
  const ents = parse('{\n"classname" "light"\n"origin" "0 0"\n}\n');
  assert.equal(ents[0].origin(), null);
});

// --- caminos de error, ejercitados a proposito --------------------------

test("una llave sin cerrar es un error, no un mapa a medias", () => {
  assert.throws(() => parse('{\n"classname" "worldspawn"\n'), MapError);
});

test("una llave de cierre de mas es un error", () => {
  assert.throws(() => parse('{\n"classname" "worldspawn"\n}\n}\n'), MapError);
});

test("contenido fuera de toda entidad es un error", () => {
  assert.throws(() => parse('"classname" "worldspawn"\n'), MapError);
});

test("un archivo vacio es un error, no un mapa vacio", () => {
  assert.throws(() => parse(""), MapError);
});

test("una cara con dos puntos es un error", () => {
  assert.throws(
    () => parseFace("( 0 0 0 ) ( 1 0 0 ) floor01 0 0 0 1 1"),
    MapError
  );
});

test("los comentarios y las lineas en blanco no estorban", () => {
  const text = "// cabecera\n\n" + mapText([[[-16, -16, -16], [16, 16, 16]]]);
  assert.equal(parse(text)[0].brushes.length, 1);
});

test("se acepta el formato Valve 220 igual que el clasico", () => {
  const classic = parseFace("( 0 0 16 ) ( 1 0 16 ) ( 0 1 16 ) floor01 0 0 0 1 1");
  const valve = parseFace(
    "( 0 0 16 ) ( 1 0 16 ) ( 0 1 16 ) floor01 [ 1 0 0 0 ] [ 0 -1 0 0 ] 0 1 1"
  );
  assert.deepEqual(valve.plane, classic.plane);
  assert.equal(valve.texture, "floor01");
});

test("un brush de menos de cuatro caras se descarta en vez de romper", () => {
  const text =
    '{\n"classname" "worldspawn"\n{\n' +
    "( 0 0 0 ) ( 1 0 0 ) ( 0 1 0 ) floor01 0 0 0 1 1\n" +
    "( 0 0 8 ) ( 0 1 8 ) ( 1 0 8 ) floor01 0 0 0 1 1\n" +
    "}\n" +
    brush([0, 0, 0], [16, 16, 16]) +
    "\n}\n";
  assert.equal(parse(text)[0].brushes.length, 1);
});
