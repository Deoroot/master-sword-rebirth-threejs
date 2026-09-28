// LA ESCENA, lo que de ella usa Gate City.
//
// Esto no es un archivo nuevo: es lo que se pudo salvar de `test/scene.test.mjs`
// en la mudanza. Aquel comprobaba `src/render/scene.js` contra dos mapas `.map`
// de verdad —la plaza del experimento 02 y el pueblo del 03—, y esos mapas, su
// cargador y sus fixtures se quedaron en el laboratorio web. Se quedó allí con
// ellos, y con él la única prueba de `fogDensityFor()`, que Gate City SÍ usa
// (`src/render/bsp_escena.js`).
//
// Así que aquí está otra vez, contra una malla escrita a mano en vez de contra un
// mapa. Se pierde lo que sólo se podía comprobar con un mapa de verdad —que cada
// grupo de material tenga color, que las luces del `.map` lleguen a la escena— y
// eso se queda medido en el laboratorio, que es donde vive el cargador.

import test from "node:test";
import assert from "node:assert/strict";
import { meshGeometry, fogDensityFor, FOG_REACH, LIGHT, PALETTE } from "../src/render/scene.js";

/**
 * Una malla de dos triángulos con dos texturas, del tamaño que se pida.
 *
 * Con `lado` se controla lo único que le importa a la niebla: la diagonal en
 * planta (X y Z), que es de donde sale su densidad.
 */
function malla(lado) {
  const positions = new Float32Array([
    0, 0, 0, lado, 0, 0, lado, 0, lado,
    0, 0, 0, lado, 0, lado, 0, 0, lado,
  ]);
  const normals = new Float32Array(18);
  for (let i = 1; i < 18; i += 3) normals[i] = 1;
  return {
    positions, normals,
    groups: [
      { texture: "floor01", indices: [0, 1, 2] },
      { texture: "wall01", indices: [3, 4, 5] },
    ],
  };
}

test("un mapa grande lleva MENOS niebla por metro, no la misma", () => {
  // El fallo que se vio mirando y que ninguna cifra decía: la densidad calibrada
  // para una sala de veinte metros deja un pueblo de cien lavado de lila entero.
  const chica = fogDensityFor(malla(20));
  const grande = fogDensityFor(malla(200));
  assert.ok(grande < chica, `grande ${grande} tendría que ser menor que chica ${chica}`);
  // Y en los dos casos la niebla tiene que dejar ver el fondo del mapa: por
  // encima de 0,2 el mapa se ve como una pared de niebla.
  for (const [nombre, d] of [["chica", chica], ["grande", grande]]) {
    assert.ok(d > 0 && d < 0.2, `${nombre}: densidad ${d}`);
  }
  // La fórmula, explícita: `FOG_REACH` partido por la diagonal en planta.
  assert.equal(grande, FOG_REACH / Math.hypot(200, 200));
});

test("una malla sin tamaño no divide por cero", () => {
  // `min === max` deja la diagonal en 0. Sin la guarda esto devuelve Infinity y
  // la escena entera sale blanca, sin error ninguno.
  const d = fogDensityFor(malla(0));
  assert.ok(Number.isFinite(d) && d > 0, `densidad ${d}`);
});

test("los grupos cubren todos los índices y no se solapan", () => {
  // Si un grupo se queda corto, esas caras no las dibuja ningún material y
  // desaparecen de la pantalla sin que nada falle. Es una puerta invisible más,
  // sólo que del lado del render.
  const { geometry, order } = meshGeometry(malla(64));
  const grupos = [...geometry.groups].sort((a, b) => a.start - b.start);
  let cursor = 0;
  for (const g of grupos) {
    assert.equal(g.start, cursor, "hueco o solape entre grupos de material");
    cursor += g.count;
  }
  assert.equal(cursor, geometry.getIndex().count, "quedaron índices sin grupo");
  assert.deepEqual(order, ["floor01", "wall01"], "el orden de los grupos no es estable");
});

test("la geometría cae dentro de su propia esfera envolvente", () => {
  // Una esfera mal calculada hace que Three.js descarte el mapa entero por
  // frustum culling y la pantalla quede vacía, sin ningún error.
  const { geometry } = meshGeometry(malla(64));
  const { center, radius } = geometry.boundingSphere;
  const p = geometry.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const d = Math.hypot(p.getX(i) - center.x, p.getY(i) - center.y, p.getZ(i) - center.z);
    assert.ok(d <= radius + 1e-4, `vértice fuera de la esfera: ${d} > ${radius}`);
  }
});

test("el sol manda más que el ambiente, y la niebla tiene color", () => {
  // Sin direccional todas las caras de una casa reciben lo mismo y la casa se
  // lee como una silueta plana. Se ve al mirar, no en ninguna cifra.
  assert.ok(LIGHT.sun > LIGHT.ambient, "la luz ambiente no puede mandar más que el sol");
  assert.equal(Math.hypot(...LIGHT.sunDirection) > 0, true, "el sol no tiene dirección");
  assert.equal(typeof PALETTE.fog, "number");
});
