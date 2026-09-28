// El nivel de malla: el suelo del artefacto de referencia.
//
// Aqui no hay qbsp. Eso quiere decir que todo lo que qbsp hacia gratis -decir
// si el mundo esta cerrado, si la geometria existe, si las caras miran hacia
// fuera- hay que comprobarlo a mano, y las comprobaciones a mano tambien
// pueden estar mal. Estas son las baratas, las que corren en cada `npm test`;
// las caras -andar por el terreno con Rapier- estan en tools/hill.mjs.

import test from "node:test";
import assert from "node:assert/strict";

import {
  valleyField, terrainMesh, terrainLevel, heightAtUnits, pathOffset, scatter,
  TERRAIN,
} from "../src/map/terrain.js";
import { UNITS_PER_M, meshBounds } from "../src/map/geometry.js";
import { worstDrop } from "../src/map/slope.js";
import { meshGeometry, fogDensityFor } from "../src/render/scene.js";

test("el valle tiene relieve, no es una mesa", () => {
  const f = valleyField({ cells: 24 });
  const desnivel = (f.max - f.min) / UNITS_PER_M;
  assert.ok(desnivel > 10, `solo ${desnivel.toFixed(1)} m entre lo alto y lo bajo`);
});

test("lo que se anda cumple la pendiente; el cuenco no, a proposito", () => {
  // Es la unica asimetria importante de este archivo. El ruido pasa por el
  // limitador porque es lo que se pisa; el cuenco se suma DESPUES porque lo
  // que contiene al jugador es justamente que no se pueda subir. Si el cuenco
  // pasara por el limitador, saldria una cuesta comoda y el mundo estaria
  // abierto por los cuatro lados sin que nada fallara.
  const f = valleyField({ cells: 30 });
  assert.ok(f.walkableDrop <= f.maxDrop, `lo andable tiene ${f.walkableDrop}`);
  assert.ok(
    worstDrop(f) > f.maxDrop * 3,
    `el cuenco solo sube ${worstDrop(f)} por esquina: se sube andando`
  );
});

test("la malla coincide con el campo en todos sus vertices", () => {
  // La misma comprobacion que hace tools/hill.mjs, en pequeno. Si el generador
  // de malla y el campo se separaran, el jugador andaria sobre un suelo que no
  // es el que ve y la pantalla seguiria siendo bonita.
  const f = valleyField({ cells: 20 });
  const mesh = terrainMesh(f);
  const foot = f.min - TERRAIN.skirt;
  let comprobados = 0;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const x = mesh.positions[i] * UNITS_PER_M;
    const z = mesh.positions[i + 1] * UNITS_PER_M;
    const y = -mesh.positions[i + 2] * UNITS_PER_M;
    if (Math.abs(z - foot) < 0.5) continue; // faldon del borde, no es terreno
    assert.ok(
      Math.abs(z - heightAtUnits(f, x, y)) < 0.01,
      `un vertice en ${x},${y} esta a ${z} y el campo dice ${heightAtUnits(f, x, y)}`
    );
    comprobados++;
  }
  assert.ok(comprobados > 1000, `solo se comprobaron ${comprobados} vertices`);
});

test("hay dos triangulos por celda y el faldon cierra el borde", () => {
  const n = 12;
  const mesh = terrainMesh(valleyField({ cells: n }));
  // n*n celdas a dos triangulos, mas dos triangulos por cada tramo de borde y
  // cuatro bordes. Sin el faldon la malla tiene un canto abierto y desde el
  // aire se ve el mundo por dentro, como una cascara rota.
  assert.equal(mesh.triangleCount, n * n * 2 + n * 4 * 2);
});

test("las normales apuntan arriba en el suelo que se anda", () => {
  // Una normal del reves no da error: la cara desaparece al mirarla, y lo que
  // se ve es un agujero en el terreno con la forma exacta de un triangulo.
  const f = valleyField({ cells: 16 });
  const mesh = terrainMesh(f);
  let arriba = 0;
  let total = 0;
  for (let i = 0; i < mesh.normals.length; i += 3) {
    const ny = mesh.normals[i + 1];
    if (Math.abs(ny) > 0.3) {
      total++;
      if (ny > 0) arriba++;
    }
  }
  assert.ok(total > 100, "no se encontraron caras de suelo");
  assert.equal(arriba, total, `${total - arriba} caras de suelo miran hacia abajo`);
});

test("cada triangulo tiene area: ninguno sale degenerado", () => {
  const mesh = terrainMesh(valleyField({ cells: 14 }));
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const p = [0, 1, 2].map((k) => {
      const v = mesh.indices[t + k] * 3;
      return [mesh.positions[v], mesh.positions[v + 1], mesh.positions[v + 2]];
    });
    const ux = p[1][0] - p[0][0], uy = p[1][1] - p[0][1], uz = p[1][2] - p[0][2];
    const vx = p[2][0] - p[0][0], vy = p[2][1] - p[0][1], vz = p[2][2] - p[0][2];
    const area = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    assert.ok(area > 1e-6, `un triangulo tiene area ${area}`);
  }
});

test("el camino existe y no es todo el mapa ni una raya perdida", () => {
  // Un camino de cero celdas cumple 'no hay camino mal puesto'. Un camino que
  // cubre el valle entero tambien. Las dos cosas se ven raras y ninguna falla.
  const f = valleyField({ cells: 30 });
  const mesh = terrainMesh(f);
  const camino = mesh.groups.find((g) => g.texture === "road01");
  const hierba = mesh.groups.find((g) => g.texture === "grass01");
  assert.ok(camino, "no se emitio ni un triangulo de camino");
  assert.ok(hierba, "no se emitio ni un triangulo de hierba");
  const fraccion = camino.indices.length / (camino.indices.length + hierba.indices.length);
  assert.ok(fraccion > 0.02 && fraccion < 0.3, `el camino ocupa el ${(fraccion * 100).toFixed(1)}%`);
});

test("el camino serpentea: no es una raya recta", () => {
  const f = valleyField({ cells: 40 });
  const span = f.width * f.cell;
  const ejes = [];
  for (let k = 0; k <= 10; k++) {
    const y = (k / 10) * span;
    // El eje es donde pathOffset vale cero: se busca a lo bruto, que para una
    // prueba vale.
    let mejor = 0;
    let min = Infinity;
    for (let x = 0; x <= span; x += 16) {
      const d = pathOffset(f, x, y);
      if (d < min) { min = d; mejor = x; }
    }
    ejes.push(mejor);
  }
  assert.ok(Math.max(...ejes) - Math.min(...ejes) > span * 0.2, "el camino sale recto");
});

// --- el nivel entero --------------------------------------------------------

test("el nivel de malla tiene la misma forma que uno de brushes", () => {
  // Es lo que permite que main.js, buildScene() y el World de Rapier no
  // distingan un nivel del otro. Si hubiera un camino aparte para cada uno, lo
  // que se comprueba en el pueblo no diria nada de aqui.
  const level = terrainLevel({ cells: 16 });
  for (const campo of [
    "name", "entities", "brushes", "mesh", "lights", "points",
    "startUnits", "start", "unitsPerMetre",
  ]) {
    assert.ok(campo in level, `al nivel le falta ${campo}`);
  }
  assert.equal(level.unitsPerMetre, UNITS_PER_M);
  assert.equal(level.brushes.length, 0, "un nivel de malla no tiene brushes");
  assert.ok(level.mesh.triangleCount > 0);
});

test("se aparece sobre el terreno, ni enterrado ni flotando", () => {
  const level = terrainLevel({ cells: 20 });
  const [x, y] = level.startUnits;
  const suelo = level.heightAt(x, y);
  // start son los PIES, y startUnits lleva las 24 unidades de Quake encima.
  const pies = level.start[1] * UNITS_PER_M;
  assert.ok(Math.abs(pies - suelo) <= 1, `los pies a ${pies} y el suelo a ${suelo}`);
});

test("las plantas se apoyan en la curva, no en una cota plana", () => {
  // Es lo que separa un terreno con relieve de un tablero con cosas encima.
  const level = terrainLevel({ cells: 24 });
  assert.ok(level.plants.length > 50, `solo ${level.plants.length} plantas`);
  const alturas = new Set();
  for (const p of level.plants) {
    const suelo = level.heightAt(p.origin[0], p.origin[1]);
    assert.ok(Math.abs(p.origin[2] - suelo) < 1e-6, "una planta no esta sobre el terreno");
    alturas.add(Math.round(p.origin[2]));
  }
  assert.ok(alturas.size > 20, `las plantas solo estan a ${alturas.size} alturas distintas`);
});

test("las plantas no caen en mitad del camino", () => {
  const level = terrainLevel({ cells: 30 });
  for (const p of level.plants) {
    assert.ok(
      pathOffset(level.field, p.origin[0], p.origin[1]) >= TERRAIN.pathWidth,
      `una planta en ${p.origin[0]},${p.origin[1]} esta en el carril`
    );
  }
});

test("las entidades responden a lo mismo que las de un .map", () => {
  // main.js las lee sin saber de donde vienen: classname, origin() y props.
  const level = terrainLevel({ cells: 16 });
  const arbol = level.entities.find((e) => e.classname === "misc_tree");
  const mata = level.entities.find((e) => e.classname === "misc_bush");
  assert.ok(arbol && mata, "faltan arboles o matas");
  for (const e of [arbol, mata]) {
    assert.equal(e.origin().length, 3);
    assert.ok(Number.isFinite(Number(e.props.height)));
    assert.ok(Number.isFinite(Number(e.props.variant)));
  }
});

test("la escena de Three.js se monta con este nivel sin tocar nada", () => {
  // Sin navegador: geometria, grupos y niebla se calculan en Node. Es la mitad
  // de la respuesta del experimento, y vale igual para la malla que para los
  // brushes.
  const level = terrainLevel({ cells: 16 });
  const { geometry, order } = meshGeometry(level.mesh);
  assert.ok(order.length >= 2, `solo ${order.length} materiales`);
  assert.equal(geometry.groups.length, order.length);
  assert.ok(geometry.getAttribute("uv"), "sin coordenadas de textura");
  const d = fogDensityFor(level.mesh);
  assert.ok(d > 0 && d < 0.02, `densidad de niebla ${d} para un valle de cientos de metros`);
});

test("agujerear el terreno quita triangulos de verdad", () => {
  // El agujero es la sonda de control de tools/hill.mjs. Si no quitara nada,
  // ese control diria que si a todo y la comprobacion de caidas no estaria
  // comprobando nada.
  const f = valleyField({ cells: 20 });
  const entero = terrainMesh(f);
  const roto = terrainMesh(f, { hole: { i: 10, j: 10, r: 3 } });
  assert.ok(roto.triangleCount < entero.triangleCount - 40, "el agujero no quito casi nada");
});

test("el valle mide lo que dice medir", () => {
  // Un medidor que se equivoca no falla: da una cifra plausible. Aqui la
  // verdad conocida es el tamano de la rejilla.
  const level = terrainLevel({ cells: 20 });
  const { min, max } = meshBounds(level.mesh);
  const lado = (max[0] - min[0]) * UNITS_PER_M;
  assert.ok(Math.abs(lado - 20 * TERRAIN.cell) < 1, `el valle mide ${lado} unidades de lado`);
});

test("sembrar da siempre lo mismo", () => {
  const f = valleyField({ cells: 16 });
  const a = scatter(f, { count: 200 });
  const b = scatter(f, { count: 200 });
  assert.deepEqual(a, b);
});
