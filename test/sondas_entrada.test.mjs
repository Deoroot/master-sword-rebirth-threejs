// POR DÓNDE ENTRAN LAS SONDAS — el guardia del experimento 59.
//
// CLAUDE.md lo dice desde el 36: «si su camino no pasa por `menuselect`, no
// cuenta». Y llevaba desde el 36 sin cumplirse: **27 de las 33 sondas
// registradas abrían `?map=gatecity`**, que se salta el menú entero, y sólo
// dos escribían por qué.
//
// Eso no es purismo. Los dos caminos no montan lo mismo: por `?map=` se carga
// el nivel y se arranca la sesión de una pasada; por el menú se carga como
// fondo —escena sí, partida no, que es lo que decidió el 53— y «Start» monta
// los 69 NPC y arranca la sesión después. Una sonda que sólo conoce el primero
// no puede notar cuando el segundo se rompe, y eso ya escondió un fallo
// entero: la fila «Map» se apuntaba y no se aplicaba (el 50).
//
// La regla que esto hace cumplir tiene dos mitades, y la segunda importa tanto
// como la primera:
//
//   1. una sonda registrada entra por `sondas/entrar.mjs`;
//   2. o **dice por qué no**, con esas palabras, donde se lea.
//
// Porque hay sondas a las que convertir les quita la pregunta: `arranque36`
// mide la entrada misma, `pantalla38` compara los dos caminos a propósito,
// `edana48` prueba que `?map=nohay` se rechaza y `recursos` no tiene jugador.
// Convertirlas sería uniformidad comprada con medida, y se probó: `pantalla38`
// convertida daba 33 de 35, con siete controles midiendo otra cosa.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** Las sondas que alguien puede lanzar: las de `package.json`, no las sueltas. */
const REGISTRADAS = (() => {
  const p = JSON.parse(readFileSync("package.json", "utf8"));
  const fuera = new Set();
  for (const [k, v] of Object.entries(p.scripts ?? {})) {
    if (!k.startsWith("sonda:")) continue;
    const m = /sondas\/[\w.]+\.mjs/.exec(v);
    if (m) fuera.add(m[0]);
  }
  return [...fuera].sort();
})();

/** El permiso, escrito con estas palabras para que se pueda buscar. */
const EL_PERMISO = "NO ENTRA POR EL MENÚ";

const entraPorMapa = (t) => /goto\(\s*[`'"][^`'"]*\?map=/.test(t);
const entraPorElMenu = (t) => /entrarPorElMenu\s*\(/.test(t);

describe("por dónde entran las sondas (59)", () => {
  test("hay sondas registradas que mirar: si no, esto no mide nada", () => {
    // El positivo. Sin él, un `package.json` que dejara de listar sondas —o un
    // cambio en el nombre de los guiones— daría cero incumplimientos y verde.
    assert.ok(REGISTRADAS.length > 25, `sólo ${REGISTRADAS.length} sondas registradas`);
  });

  test("la mayoría entra por el menú, que es el camino del jugador", () => {
    // Y se exige una MAYORÍA de verdad, no «al menos una». Con «al menos una»
    // se podría volver al punto de partida —26 por `?map=` y una por el
    // menú— sin que nada se pusiera rojo.
    const porElMenu = REGISTRADAS.filter((f) => entraPorElMenu(readFileSync(f, "utf8")));
    assert.ok(porElMenu.length * 2 > REGISTRADAS.length,
      `sólo ${porElMenu.length} de ${REGISTRADAS.length} usan \`entrarPorElMenu\``);
  });

  test("y la que entra por `?map=` sin usar el menú lo tiene ESCRITO", () => {
    const mudas = [];
    for (const f of REGISTRADAS) {
      const t = readFileSync(f, "utf8");
      if (!entraPorMapa(t)) continue;          // no usa el atajo: nada que declarar
      if (entraPorElMenu(t)) continue;         // lo usa, pero además pasa por el menú
      if (t.includes(EL_PERMISO)) continue;    // lo usa y dice por qué
      mudas.push(f);
    }
    assert.deepEqual(mudas, [],
      `estas sondas se saltan el menú sin decir por qué (escribe «${EL_PERMISO}» y el motivo)`);
  });

  test("el ayudante existe y es uno solo", () => {
    // Que el camino esté en UN sitio es la mitad del arreglo: cambió en el 36,
    // en el 50 y en el 53, y cada vez veintitantas sondas se quedaron midiendo
    // un juego que ya no existía sin que ninguna se pusiera roja.
    const t = readFileSync("sondas/entrar.mjs", "utf8");
    assert.ok(t.includes("export async function entrarPorElMenu"),
      "`sondas/entrar.mjs` ya no exporta `entrarPorElMenu`");
    assert.ok(t.includes("Establish a Kingdom") && t.includes("Start"),
      "el ayudante ya no recorre el menú: comprueba qué le ha pasado");
  });
});
