// EXPERIMENTO 93, pieza E: el horneado de bichos pide también las secuencias
// que el GUION nombra con `playanim`/`setidleanim`/`setmoveanim`, no sólo las
// de la ficha. doc/HORNEADO_93.md.
//
// Lo que se prueba es la COSECHA (`animacionesDelGuion`) con los guiones de
// verdad, por texto: la araña de Gate City salta con
// `playanim critical ANIM_LATCH_ATTACK` y `const ANIM_LATCH_ATTACK jumpmiss`
// (spider.script:80-83, :106). Lo horneado lo mira test/salto93a.test.mjs
// («Gate City trae horneadas las secuencias del salto»), que es la prueba que
// se pone roja si esta cosecha se quita.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { animacionesDelGuion } from "../tools/bicho.mjs";

const SCRIPTS = "../MSC/MSCScripts/scripts";
const HAY_MOD = existsSync(`${SCRIPTS}/monsters/spider.script`);

describe("las animaciones que pide el guion de la araña", { skip: !HAY_MOD }, () => {
  const { nombres, sinResolver } = animacionesDelGuion(SCRIPTS, "monsters/spider");

  test("trae las tres del salto que el guion usa con `playanim`", () => {
    for (const n of ["jumpmiss", "hitbite", "falloff"]) {
      assert.ok(nombres.has(n), `falta ${n}; trae: ${[...nombres].join(" ")}`);
    }
  });

  test("y NO `jumphit`: es un `const` que ningún comando de animación usa", () => {
    // `const ANIM_LATCH_HIT jumphit` (spider.script:81) y nada en los 2 884
    // guiones lee `ANIM_LATCH_HIT` salvo su gemela de deralia/boss_spider. El
    // motor no la pide nunca, así que no se hornea. Control de que la cosecha
    // mira COMANDOS y no cualquier `const` que parezca una animación.
    assert.ok(!nombres.has("jumphit"));
  });

  test("resuelve la constante de la plantilla y no se traga expresiones", () => {
    // `playanim critical ANIM_DODGE` (spider_base.script:51) con el valor de
    // `spider.script`: sale `dodge` y no la cadena `anim_dodge`.
    assert.ok(nombres.has("dodge"));
    assert.ok(!nombres.has("anim_dodge"));
    for (const n of nombres) assert.ok(!/^[$\d]/.test(n), `«${n}» no es un nombre de secuencia`);
  });
});

describe("la cosecha sigue los `#include` y resuelve a través de ellos", () => {
  test("el `playanim` de la plantilla con la constante del guion que la incluye", () => {
    // Es la forma de la araña, con texto propio para que no dependa del mod.
    const raiz = mkdtempSync(join(tmpdir(), "h93e-"));
    mkdirSync(join(raiz, "m"));
    writeFileSync(join(raiz, "m/hijo.script"), [
      "{",
      " const ANIM_SALTO brinco",
      " const ANIM_X uno",
      " setvard ANIM_X dos",
      "}",
      "#include m/base",
    ].join("\n"));
    writeFileSync(join(raiz, "m/base.script"), [
      "{ npc_spawn",
      " setidleanim quieto",
      "}",
      "{ saltar",
      " playanim critical ANIM_SALTO",
      " playanim once ANIM_X",
      " playanim break",
      " playanim once $get(ent_me,anim)",
      "}",
    ].join("\n"));
    const hijo = animacionesDelGuion(raiz, "m/hijo");
    // Las DOS asignaciones de `ANIM_X`: la pregunta es qué puede llegar a pedir.
    assert.deepEqual([...hijo.nombres].sort(), ["brinco", "dos", "quieto", "uno"]);
    assert.ok([...hijo.sinResolver].some((t) => t.startsWith("$")), "la expresión se cuenta, no se hornea");
    // Control: la plantilla sola no sabe qué es `ANIM_SALTO`; el nombre viene del hijo.
    assert.ok(!animacionesDelGuion(raiz, "m/base").nombres.has("brinco"));
  });
});

describe("lo horneado de Gate City", { skip: !existsSync("build/gatecity/bichos/monsters_spider/bicho.json") }, () => {
  test("la araña trae `jumpmiss`, `hitbite` y `falloff`", () => {
    const b = JSON.parse(readFileSync("build/gatecity/bichos/monsters_spider/bicho.json", "utf8"));
    const s = new Set(b.secuencias.map((x) => x.nombre));
    for (const n of ["jumpmiss", "hitbite", "falloff"]) assert.ok(s.has(n), `horneadas: ${[...s].join(" ")}`);
  });
});
