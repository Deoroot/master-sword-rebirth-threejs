// EL 98: DOS SONDAS NO PUEDEN COMPARTIR PUERTO.
//
// Cada sonda arranca su `vite` (y algunas un `tools/servidor.mjs`) en un puerto
// fijo, y lo primero que hace es `liberarPuerto`: matar a quien escuche ahí.
// Con dos sondas en el mismo puerto lanzadas a la vez —el lanzador del 98,
// `npm run sondas`, corre tres—, la segunda mata el `vite` de la primera a
// media medida, y la primera sale roja por un `ERR_CONNECTION_REFUSED` que no
// es del juego. O peor: `esNuestro` sólo mira el título, y el `vite` de la
// otra sonda ES nuestro, así que la primera sigue midiendo contra un servidor
// que no arrancó ella.
//
// Medido el 98 al escribir esta prueba: **14 puertos repetidos** y 19 sondas
// que hubo que mover, el peor el 5219, en cuatro (aviso60, inventario31,
// miradores52, vgui2_34). Ninguno se había notado porque las sondas se corrían
// de una en una.
//
// Lo mismo con la carpeta de personajes de una partida (`build/partidas/<x>`):
// cada sonda con servidor la borra al empezar, y dos con la misma se borran
// los personajes la una a la otra (el 97: `doc/DEFENSARED_97.md`, «Árbol
// compartido»).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dirname, "..", "sondas");

// Los `_tmp_*` son borradores de una sesión, no sondas del repositorio; y
// `mismo.mjs`/`entrar.mjs` son las piezas comunes.
const sondas = () => readdirSync(DIR)
  .filter((f) => f.endsWith(".mjs") && !f.startsWith("_") && f !== "mismo.mjs" && f !== "entrar.mjs");

/**
 * Los puertos que declara un texto de sonda: `const PORT = 5201;`,
 * `const PUERTO_WEB = 5975;`, `const PUERTO_PARTIDA = 5976;`, y la forma
 * `5391 + 100` que usa costura91. Lo que no sea un número o una suma de números
 * (menu52 pide uno libre al sistema: `dev.httpServer.address().port`) no es fijo
 * y no puede chocar.
 */
export function puertosDe(texto) {
  const fuera = [];
  for (const m of texto.matchAll(/^\s*const\s+(PORT|PUERTO[A-Z_]*)\s*=\s*([0-9]+(?:\s*\+\s*[0-9]+)*)\s*;/gm)) {
    fuera.push({ nombre: m[1], puerto: m[2].split("+").reduce((s, x) => s + Number(x), 0) });
  }
  return fuera;
}

/** Las carpetas `build/partidas/<x>` que nombra un texto de sonda. */
export function partidasDe(texto) {
  return [...new Set([...texto.matchAll(/build\/partidas\/([A-Za-z0-9_.-]+)/g)].map((m) => m[1]))];
}

/** Agrupa {clave → [sondas]} y devuelve las claves con más de una sonda. */
function repetidos(pares) {
  const por = new Map();
  for (const [clave, sonda] of pares) {
    if (!por.has(clave)) por.set(clave, new Set());
    por.get(clave).add(sonda);
  }
  return [...por].filter(([, s]) => s.size > 1).map(([c, s]) => `${c}: ${[...s].join(", ")}`);
}

test("el lector de puertos lee las tres formas (control positivo)", () => {
  assert.deepEqual(puertosDe("const PORT = 5201;"), [{ nombre: "PORT", puerto: 5201 }]);
  assert.deepEqual(puertosDe("const PUERTO_WEB = 5975;\nconst PUERTO_PARTIDA = 5976;").map((p) => p.puerto), [5975, 5976]);
  assert.deepEqual(puertosDe("const PORT = 5391 + 100;").map((p) => p.puerto), [5491]);
  assert.deepEqual(puertosDe("const PORT = dev.httpServer.address().port;"), []);
  // Y sobre el disco: una sonda conocida tiene que salir con su puerto, o
  // «ningún repetido» podría ser «no he leído nada».
  const golpe = puertosDe(readFileSync(join(DIR, "golpe.mjs"), "utf8"));
  assert.deepEqual(golpe.map((p) => p.puerto), [5201]);
});

test("el detector de repetidos ve uno puesto a propósito (control positivo)", () => {
  assert.deepEqual(repetidos([[5201, "a"], [5201, "b"], [5202, "c"]]), ["5201: a, b"]);
  // La misma sonda declarando el mismo puerto dos veces no es un choque.
  assert.deepEqual(repetidos([[5201, "a"], [5201, "a"]]), []);
});

test("ningún puerto (web o de partida) lo usan dos sondas", () => {
  const pares = [];
  for (const f of sondas()) {
    for (const p of puertosDe(readFileSync(join(DIR, f), "utf8"))) pares.push([p.puerto, f]);
  }
  // Que se lea de verdad: hoy son más de cien declaraciones.
  assert.ok(pares.length > 90, `sólo se leyeron ${pares.length} puertos: ¿ha cambiado la forma de declararlos?`);
  assert.deepEqual(repetidos(pares), [], "puertos compartidos (dos sondas a la vez se matan el vite)");
});

test("ninguna carpeta build/partidas/<x> la usan dos sondas", () => {
  const pares = [];
  for (const f of sondas()) for (const c of partidasDe(readFileSync(join(DIR, f), "utf8"))) pares.push([c, f]);
  assert.ok(pares.length >= 10, `sólo se leyeron ${pares.length} carpetas de partida`);
  assert.deepEqual(repetidos(pares), [], "carpetas de partida compartidas (sus rmSync se borran los personajes)");
});
