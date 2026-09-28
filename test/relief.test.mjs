// El relieve escalonado.
//
// La propiedad que tiene que cumplirse siempre, y la unica que de verdad
// importa: dos celdas vecinas nunca se llevan mas de un escalon. Un salto de
// dos escalones es un muro de medio metro que el jugador no sube, y el pueblo
// se parte en trozos incomunicados sin que nada falle: el mapa compila, sella,
// se ve bien y no se puede cruzar.

import test from "node:test";
import assert from "node:assert/strict";

import {
  heightField, flatten, quantise, worstStep, highestUnder, STEP, RANGE,
} from "../src/map/relief.js";
import { fbm, hash2 } from "../src/util/noise.js";

test("el ruido da lo mismo en cada ejecucion", () => {
  // Sin esto ni el .map ni las capturas se podrian comparar con los de antes.
  assert.equal(fbm(1.7, -3.2, 3), fbm(1.7, -3.2, 3));
  assert.equal(hash2(41, -9), hash2(41, -9));
  assert.notEqual(fbm(1.7, -3.2, 3), fbm(1.8, -3.2, 3));
});

test("el ruido se queda entre -1 y 1", () => {
  for (let i = 0; i < 2000; i++) {
    const v = fbm(i * 0.37, i * -0.21, 4);
    assert.ok(v >= -1 && v <= 1, `fbm dio ${v}`);
  }
});

test("cuantizar lleva al multiplo del escalon", () => {
  assert.equal(quantise(0, 8), 0);
  assert.equal(quantise(3, 8), 0);
  assert.equal(quantise(5, 8), 8);
  assert.equal(quantise(-5, 8), -8);
  assert.equal(quantise(12.5, 8), 16);
});

test("ninguna celda vecina se lleva mas de un escalon", () => {
  // Con varias semillas y varias longitudes de onda, incluidas las cortas, que
  // son las que producen saltos grandes antes de aplanar.
  for (const seed of [0, 1, 2, 7]) {
    for (const wavelength of [2, 4, 9, 20]) {
      const f = heightField(40, 30, { seed, wavelength });
      assert.ok(
        worstStep(f) <= STEP,
        `semilla ${seed}, onda ${wavelength}: salto de ${worstStep(f)}`
      );
    }
  }
});

test("el aplanado hace falta: sin el hay saltos que no se suben", () => {
  // Si el ruido ya saliera suave, todo esto sobraria. No sale: con onda corta
  // el ruido cuantizado deja saltos de dos y tres escalones. Esta prueba
  // existe para que nadie quite el aplanado pensando que no hace nada.
  const w = 40, h = 30;
  const crudo = new Int32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      crudo[y * w + x] = quantise(fbm(x / 2, y / 2, 3) * RANGE, STEP);
    }
  }
  const antes = worstStep({ raw: crudo, width: w, height: h });
  assert.ok(antes > STEP, `el ruido crudo ya era suave: salto ${antes}`);

  const copia = Int32Array.from(crudo);
  flatten(copia, w, h, STEP);
  assert.ok(worstStep({ raw: copia, width: w, height: h }) <= STEP);
});

test("el aplanado solo baja, nunca sube", () => {
  // Es lo que garantiza que termine: un proceso que solo decrece sobre enteros
  // acotados no puede dar vueltas para siempre.
  const w = 20, h = 20;
  const cells = new Int32Array(w * h);
  for (let i = 0; i < cells.length; i++) {
    cells[i] = quantise(fbm(i % w, Math.floor(i / w), 4) * 40, STEP);
  }
  const antes = Int32Array.from(cells);
  flatten(cells, w, h, STEP);
  for (let i = 0; i < cells.length; i++) {
    assert.ok(cells[i] <= antes[i], `la celda ${i} subio de ${antes[i]} a ${cells[i]}`);
  }
});

test("el aplanado termina, y pronto", () => {
  const f = heightField(60, 60, { wavelength: 2 });
  assert.ok(f.passes < 64, `tardo ${f.passes} pasadas`);
});

test("el relieve se queda dentro del rango que se pide", () => {
  const f = heightField(50, 50, { range: 16, step: 8 });
  assert.ok(f.min >= -16, `baja hasta ${f.min}`);
  assert.ok(f.max <= 16, `sube hasta ${f.max}`);
  // Y tiene que haber relieve de verdad: un campo todo a cero cumple todas las
  // reglas de arriba y no es micro-elevacion, es un suelo plano.
  assert.ok(f.levels.length >= 3, `solo ${f.levels.length} niveles`);
});

test("todas las alturas son multiplos del escalon", () => {
  // Si una no lo fuera, ahi habria un escalon de altura arbitraria: puede ser
  // de una unidad, que se nota al andar, o de veinte, que no se sube.
  const f = heightField(40, 40, {});
  for (const v of f.raw) assert.equal(v % STEP + 0, 0, `altura ${v}`);
});

test("pedir fuera de la rejilla no da undefined", () => {
  // El emisor consulta los bordes al asentar casas y murallas. Un undefined
  // aqui se convierte en NaN en una coordenada del .map, y un .map con NaN se
  // lee sin quejarse y produce un brush degenerado.
  const f = heightField(10, 10, {});
  for (const [x, y] of [[-5, 0], [99, 0], [0, -1], [0, 99], [-9, -9]]) {
    assert.ok(Number.isInteger(f.get(x, y)), `get(${x},${y}) dio ${f.get(x, y)}`);
  }
});

test("una casa se asienta sobre la cota mas alta de su huella", () => {
  // Con la media, la esquina mas alta del terreno atraviesa el suelo de la
  // casa: se ve un pico de hierba dentro del salon.
  const f = heightField(20, 20, {});
  const top = highestUnder(f, 3, 3, 6, 6);
  for (let y = 3; y <= 6; y++) {
    for (let x = 3; x <= 6; x++) {
      assert.ok(f.get(x, y) <= top, `la celda ${x},${y} asoma por encima del zocalo`);
    }
  }
});
