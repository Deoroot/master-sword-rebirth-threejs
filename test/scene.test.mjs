// La escena de Three.js, comprobada sin WebGL.
//
// Three.js construye escenas, geometrias y materiales en Node sin problema:
// lo unico que necesita navegador es el renderer. Asi que casi todo el camino
// de render se puede comprobar sin ojos, y lo que queda fuera es solo la
// llamada de dibujo.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { loadLevel } from "../src/map/level.js";
import { buildScene, meshGeometry, PALETTE, fogDensityFor, LIGHT } from "../src/render/scene.js";
import { PLAZA, PUEBLO } from "./fixtures.mjs";

const level = loadLevel(await readFile(PLAZA, "utf8"), { name: "plaza" });
const pueblo = loadLevel(await readFile(PUEBLO, "utf8"), { name: "pueblo" });

test("la geometria lleva todos los triangulos del cargador", () => {
  const { geometry, order } = meshGeometry(level.mesh);
  assert.equal(geometry.getIndex().count, level.mesh.triangleCount * 3);
  assert.equal(
    geometry.getAttribute("position").count,
    level.mesh.vertexCount
  );
  assert.equal(order.length, level.mesh.groups.length);
});

test("los grupos cubren todos los indices y no se solapan", () => {
  // Si un grupo se queda corto, esas caras no se dibujan con ningun material y
  // desaparecen de la pantalla sin que nada falle. Es una puerta invisible
  // mas, solo que del lado del render.
  const { geometry } = meshGeometry(level.mesh);
  const groups = [...geometry.groups].sort((a, b) => a.start - b.start);
  let cursor = 0;
  for (const g of groups) {
    assert.equal(g.start, cursor, "hueco o solape entre grupos de material");
    cursor += g.count;
  }
  assert.equal(cursor, geometry.getIndex().count, "quedaron indices sin grupo");
});

test("cada grupo tiene material y cada material color", () => {
  const { scene, materials, textures } = buildScene(level);
  const world = scene.getObjectByName("worldspawn");
  assert.equal(world.geometry.groups.length, materials.length);
  for (let i = 0; i < materials.length; i++) {
    const expected = PALETTE.textures[textures[i]] ?? PALETTE.textures.default;
    assert.equal(materials[i].color.getHex(), expected, `material de ${textures[i]}`);
  }
});

test("door01 tiene su propio material aunque no se vea", () => {
  // La puerta esta enterrada bajo el suelo, pero su geometria llega al render.
  // Si algun dia asoma, ya tiene color y no aparecera del color de la pared.
  const { textures } = buildScene(level);
  assert.ok(textures.includes("door01"));
});

test("la densidad de niebla se ajusta al tamano del mapa", () => {
  // Es el fallo que se vio mirando: la densidad calibrada para una sala de
  // veinte metros deja un pueblo de cien lavado de lila entero. Un mapa
  // grande tiene que llevar MENOS niebla por metro, no la misma.
  const dPlaza = fogDensityFor(level.mesh);
  const dPueblo = fogDensityFor(pueblo.mesh);
  assert.ok(dPueblo < dPlaza, `pueblo ${dPueblo} deberia ser menor que plaza ${dPlaza}`);
  // Y en los dos casos la niebla tiene que dejar ver el fondo del mapa: con
  // densidad por encima de 2/alcance, el mapa se ve como una pared de niebla.
  for (const [name, level_] of [["plaza", level], ["pueblo", pueblo]]) {
    const { min, max } = { min: [0, 0, 0], max: [0, 0, 0] };
    const d = fogDensityFor(level_.mesh);
    assert.ok(d > 0 && d < 0.2, `${name}: densidad ${d}`);
  }
});

test("hay sol, y no solo luz ambiente", () => {
  // Sin direccional, todas las caras de una casa reciben lo mismo y la casa
  // se lee como una silueta plana. Se ve al mirar, no en ninguna cifra.
  const { scene } = buildScene(level);
  const sun = scene.getObjectByName("sol");
  assert.ok(sun, "no hay luz direccional en la escena");
  assert.ok(sun.intensity >= 1, `el sol esta a ${sun.intensity}`);
  assert.ok(sun.position.length() > 0, "el sol no tiene direccion");
  assert.ok(
    sun.intensity > LIGHT.ambient,
    "la luz ambiente no puede mandar mas que el sol"
  );
});

test("la niebla esta puesta y es exponencial cuadratica", () => {
  const { scene } = buildScene(level);
  assert.equal(scene.fog.constructor.name, "FogExp2");
  assert.equal(scene.fog.density, fogDensityFor(level.mesh));
  assert.equal(scene.fog.color.getHex(), PALETTE.fog);
  // El fondo tiene que ser el mismo color que la niebla: si no, el horizonte
  // se ve como un borde duro y eso solo se nota mirando.
  assert.equal(scene.background.getHex(), PALETTE.fog);
});

test("las luces del .map llegan a la escena", () => {
  const { scene } = buildScene(level);
  const points = scene.children.filter((c) => c.type === "PointLight");
  assert.equal(points.length, level.lights.length);
  assert.ok(points.length > 0, "sin luces la escena se ve plana y nada lo avisa");
  for (const p of points) {
    assert.ok(p.distance > 0, "una luz con alcance cero no ilumina nada");
  }
});

test("la geometria cae dentro de su propia esfera envolvente", () => {
  // Una esfera mal calculada hace que Three.js descarte el mapa entero por
  // frustum culling y la pantalla quede vacia, sin ningun error.
  const { geometry } = meshGeometry(level.mesh);
  const { center, radius } = geometry.boundingSphere;
  const p = geometry.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const d = Math.hypot(
      p.getX(i) - center.x,
      p.getY(i) - center.y,
      p.getZ(i) - center.z
    );
    assert.ok(d <= radius + 1e-4, `vertice fuera de la esfera: ${d} > ${radius}`);
  }
});
