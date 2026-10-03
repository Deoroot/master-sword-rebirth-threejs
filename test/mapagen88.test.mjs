// EL GENERADOR DE `.map` DEL 88, y la regla de dónde se busca un `.bsp`.
//
// Lo que se puede hacer mal escribiendo un `.map` es el ORDEN de los tres puntos
// de cada plano: el compilador saca la normal como `cross(p0 - p1, p2 - p1)` y
// el brush es lo que queda detrás. Así que aquí se hace esa misma cuenta con lo
// que sale de `planosDeCaja`, y no se compara con la tabla de `CARAS`, que es
// lo que se mide (el 75: la constante que ES la regla no se usa para medirla).

import test from "node:test";
import assert from "node:assert/strict";
import { planosDeCaja, caja, restar, interior, entidad, mapa } from "../tools/mapagen.mjs";
import { bspDe, CONTENIDO, PROPIOS } from "../tools/mapa.mjs";

const resta = (a, b) => a.map((v, i) => v - b[i]);
const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const punto = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const volumen = (c) => (c.max[0] - c.min[0]) * (c.max[1] - c.min[1]) * (c.max[2] - c.min[2]);

test("cada plano de una caja mira HACIA FUERA, con la cuenta del compilador", () => {
  const min = [-10, 20, -5], max = [30, 50, 7];
  const centro = min.map((v, i) => (v + max[i]) / 2);
  const planos = planosDeCaja(min, max);
  assert.equal(planos.length, 6);
  for (const { puntos: [p0, p1, p2] } of planos) {
    const n = cruz(resta(p0, p1), resta(p2, p1));
    const d = punto(n, p1);
    // El centro de la caja tiene que quedar DETRÁS del plano: dentro del brush.
    assert.ok(punto(n, centro) < d, `el centro queda delante del plano de ${JSON.stringify([p0, p1, p2])}`);
    // Y las ocho esquinas, detrás o encima: si no, el plano corta la caja.
    for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
      assert.ok(punto(n, [x, y, z]) <= d + 1e-9);
    }
  }
  // Las seis normales, distintas: no hay dos caras en el mismo plano.
  const normales = new Set(planos.map(({ puntos: [p0, p1, p2] }) =>
    cruz(resta(p0, p1), resta(p2, p1)).map(Math.sign).join()));
  assert.equal(normales.size, 6);
});

test("una caja sin volumen no se escribe: se dice", () => {
  assert.throws(() => caja([0, 0, 0], [10, 0, 10], "x"), /sin volumen/);
});

test("restar un hueco no pierde ni inventa volumen, y no solapa", () => {
  const a = { min: [0, 0, 0], max: [100, 80, 60] };
  const h = { min: [20, -10, 10], max: [50, 30, 40] };
  const piezas = restar(a, h);
  const dentro = { min: [20, 0, 10], max: [50, 30, 40] };   // el trozo del hueco que cae en `a`
  assert.equal(piezas.reduce((s, c) => s + volumen(c), 0), volumen(a) - volumen(dentro));
  for (let i = 0; i < piezas.length; i++) {
    for (let j = i + 1; j < piezas.length; j++) {
      const p = piezas[i], q = piezas[j];
      const solapan = [0, 1, 2].every((k) => p.min[k] < q.max[k] && q.min[k] < p.max[k]);
      assert.ok(!solapan, `las piezas ${i} y ${j} se solapan`);
    }
    const p = piezas[i];
    assert.ok(![0, 1, 2].every((k) => p.min[k] < h.max[k] && h.min[k] < p.max[k]), `la pieza ${i} pisa el hueco`);
  }
  // Y si no se tocan, la caja vuelve entera.
  assert.deepEqual(restar(a, { min: [200, 0, 0], max: [300, 10, 10] }), [a]);
});

test("un interior deja el hueco vacío y rodeado: el suelo, el techo y las paredes existen", () => {
  const brushes = interior([{ min: [0, 0, 0], max: [64, 64, 64] }], 16, { suelo: "S", techo: "T", pared: "P" });
  assert.equal(brushes.length, 6);
  const texto = brushes.join("\n");
  assert.match(texto, / S \[/); assert.match(texto, / T \[/); assert.match(texto, / P \[/);
});

test("las entidades: un valor con comillas rompería el `.map`, y se para", () => {
  assert.throws(() => entidad({ classname: 'a"b' }), /comillas/);
  const m = mapa({ mundo: { wad: "x.wad" }, brushes: [], entidades: [{ classname: "light", origin: "0 0 0" }] });
  assert.match(m, /^\{\n"classname" "worldspawn"\n"mapversion" "220"\n"wad" "x\.wad"\n\}\n\{\n"classname" "light"/);
});

test("bspDe: el del juego por omisión, el nuestro si existe, y los dos a la vez es un ERROR", () => {
  const delJuego = `${CONTENIDO}/maps/x.bsp`, propio = `${PROPIOS}/x.bsp`;
  assert.equal(bspDe("x", [], () => false), delJuego);
  assert.equal(bspDe("x", [], (r) => r === propio), propio);
  assert.throws(() => bspDe("x", [], () => true), /está en el juego y en/);
  // La ruta a mano sigue ganando, como antes del 88.
  assert.equal(bspDe("x", ["a/y.bsp"], () => true), "a/y.bsp");
});
