// La proyeccion de texturas de Quake, contra verdad medida a mano.
//
// Una textura mal proyectada no falla: sale estirada, girada o del reves, y
// las tres cosas tienen muy buena pinta en una captura pequena. Asi que aqui
// se comprueban numeros concretos, no que «haya UVs».

import test from "node:test";
import assert from "node:assert/strict";

import { parse } from "../src/map/parse.js";
import { buildMesh } from "../src/map/geometry.js";
import { baseAxesFor, textureAxes, texCoord } from "../src/map/texcoords.js";
import { mapText } from "./fixtures.mjs";

test("cada orientacion de cara recibe su par de ejes", () => {
  // Un suelo y una pared no pueden compartir ejes: si lo hicieran, la textura
  // del suelo saldria vertical en la pared.
  const suelo = baseAxesFor([0, 0, 1]);
  const techo = baseAxesFor([0, 0, -1]);
  const oeste = baseAxesFor([1, 0, 0]);
  assert.deepEqual(suelo, [[1, 0, 0], [0, -1, 0]]);
  assert.deepEqual(techo, [[1, 0, 0], [0, -1, 0]]);
  assert.deepEqual(oeste, [[0, 1, 0], [0, 0, -1]]);
  // Suelo y techo comparten ejes a proposito, que es lo que hace Quake, pero
  // una pared no comparte con ninguno de los dos.
  assert.notDeepEqual(oeste, suelo);
});

test("los ejes que devuelve se pueden modificar sin estropear la tabla", () => {
  // Si devolviera los vectores de la tabla en vez de copias, la primera cara
  // con rotacion giraria los ejes de todas las caras del mapa. El sintoma
  // seria un mapa con las texturas cada vez mas torcidas segun se carga.
  const a = baseAxesFor([0, 0, 1]);
  a[0][0] = 99;
  assert.deepEqual(baseAxesFor([0, 0, 1])[0], [1, 0, 0]);
});

test("sin rotacion ni escala, una unidad de Quake es un pixel", () => {
  const axes = textureAxes([0, 0, 1, 0], { offset: [0, 0], rotation: 0, scale: [1, 1] });
  // 128 unidades con una textura de 128 px es exactamente una repeticion.
  assert.deepEqual(texCoord([128, 0, 0], axes, 128), [1, -0]);
  assert.deepEqual(texCoord([0, 128, 0], axes, 128), [0, 1]);
});

test("la escala estira la textura, no la encoge", () => {
  // Escala 2 significa que la textura se ve el doble de grande, o sea que hace
  // falta el doble de unidades para una repeticion. Confundir el sentido deja
  // un suelo de adoquines con adoquines de cuatro metros.
  const axes = textureAxes([0, 0, 1, 0], { offset: [0, 0], rotation: 0, scale: [2, 2] });
  assert.equal(texCoord([256, 0, 0], axes, 128)[0], 1);
});

test("una escala de cero se trata como uno, no como infinito", () => {
  const axes = textureAxes([0, 0, 1, 0], { offset: [0, 0], rotation: 0, scale: [0, 0] });
  const uv = texCoord([128, 0, 0], axes, 128);
  assert.ok(Number.isFinite(uv[0]) && Number.isFinite(uv[1]), `salio ${uv}`);
  assert.equal(uv[0], 1);
});

test("el desplazamiento corre la textura, en pixeles", () => {
  const axes = textureAxes([0, 0, 1, 0], { offset: [64, 0], rotation: 0, scale: [1, 1] });
  assert.equal(texCoord([0, 0, 0], axes, 128)[0], 0.5);
});

test("la rotacion gira en el plano de la textura, tambien en una pared", () => {
  // El error clasico es girar x,y siempre. En una pared que mira a +X los ejes
  // viven en y,z, asi que girar x,y no haria nada y la rotacion se perderia
  // en silencio: la pared saldria sin girar y nadie sabria por que.
  const sin = textureAxes([1, 0, 0, 0], { offset: [0, 0], rotation: 0, scale: [1, 1] });
  const con = textureAxes([1, 0, 0, 0], { offset: [0, 0], rotation: 90, scale: [1, 1] });
  assert.notDeepEqual(con.u, sin.u);
  // A 90 grados el eje u pasa a ser el v de antes, salvo signo.
  assert.deepEqual(con.u.map((v) => Math.round(v)), [0, 0, 1]);
});

test("la v va negada: el origen de Quake esta arriba", () => {
  // Sin negarla las texturas salen del reves en vertical. En un ladrillo no se
  // nota; en un tejado o en una puerta, si.
  const axes = textureAxes([0, 1, 0, 0], { offset: [0, 0], rotation: 0, scale: [1, 1] });
  const abajo = texCoord([0, 0, 0], axes, 128)[1];
  const arriba = texCoord([0, 0, 128], axes, 128)[1];
  assert.ok(arriba > abajo, "subir en el mundo tiene que subir en la textura");
});

test("se leen los cinco numeros del formato clasico", () => {
  const text = mapText([[[0, 0, 0], [128, 128, 128], "floor01"]]).replace(
    /floor01 0 0 0 1 1/g,
    "floor01 16 32 45 2 4"
  );
  const brush = parse(text)[0].brushes[0];
  const a = brush.aligns[0];
  assert.equal(a.valve, false);
  assert.deepEqual(a.offset, [16, 32]);
  assert.equal(a.rotation, 45);
  assert.deepEqual(a.scale, [2, 4]);
});

test("se leen los ejes del formato Valve 220", () => {
  const brush = parse(
    '{\n"classname" "worldspawn"\n{\n' +
      Array(4)
        .fill(
          "( 0 0 0 ) ( 1 0 0 ) ( 0 1 0 ) floor01 [ 1 0 0 8 ] [ 0 -1 0 16 ] 0 2 3"
        )
        .join("\n") +
      "\n}\n}\n"
  )[0].brushes[0];
  const a = brush.aligns[0];
  assert.equal(a.valve, true);
  assert.deepEqual(a.u, [1, 0, 0]);
  assert.equal(a.uOffset, 8);
  assert.deepEqual(a.v, [0, -1, 0]);
  assert.equal(a.vOffset, 16);
  assert.deepEqual(a.scale, [2, 3]);
});

test("la malla trae una UV por vertice, y ninguna es NaN", () => {
  const mesh = buildMesh(parse(mapText([[[0, 0, 0], [128, 256, 64], "wall01"]]))[0].brushes);
  assert.equal(mesh.uvs.length, mesh.vertexCount * 2);
  for (let i = 0; i < mesh.uvs.length; i++) {
    assert.ok(Number.isFinite(mesh.uvs[i]), `uv ${i} es ${mesh.uvs[i]}`);
  }
});

test("una cara de 128 unidades cubre exactamente una repeticion", () => {
  // Verdad conocida: con escala 1 y textura de 128 px, un cuadrado de 128
  // unidades tiene que ir de 0 a 1 en las dos direcciones. Si saliera 0 a 2 o
  // 0 a 0,5, el mapa se veria plausible y con la escala mal.
  const mesh = buildMesh(parse(mapText([[[0, 0, 0], [128, 128, 16], "floor01"]]))[0].brushes);
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  const p = mesh.positions;
  for (let i = 0; i < mesh.vertexCount; i++) {
    // Solo la cara de arriba, que es la que mira a +Z de Quake, o sea +Y aqui.
    if (Math.abs(mesh.normals[i * 3 + 1] - 1) > 1e-6) continue;
    uMin = Math.min(uMin, mesh.uvs[i * 2]);
    uMax = Math.max(uMax, mesh.uvs[i * 2]);
    vMin = Math.min(vMin, mesh.uvs[i * 2 + 1]);
    vMax = Math.max(vMax, mesh.uvs[i * 2 + 1]);
  }
  assert.equal(uMax - uMin, 1);
  assert.equal(vMax - vMin, 1);
});

test("textureSize cambia la escala, para texturas que no son de 128", () => {
  const brushes = parse(mapText([[[0, 0, 0], [128, 128, 16], "floor01"]]))[0].brushes;
  const a = buildMesh(brushes, { textureSize: () => 128 });
  const b = buildMesh(brushes, { textureSize: () => 64 });
  assert.equal(b.uvs[0], a.uvs[0] * 2);
});
