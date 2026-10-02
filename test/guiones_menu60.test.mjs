// EL MENÚ DE UN NPC CASI NUNCA ESTÁ EN SU ARCHIVO. `tools/guiones.mjs` (60).
//
// El extractor decidía qué scripts tienen menú leyendo el texto CRUDO y
// buscando en él `{ game_menu_getoptions`. Y `cargarGuion`, que es lo que luego
// hornea, **sí** resuelve los `#include` y lleva haciéndolo desde el 33: el
// censo se hacía sobre una cosa y la carga sobre otra.
//
// Un NPC de Master Sword no suele traer su menú: lo hereda. El sanador de
// Edana son doce líneas de `setvar` y cuatro `#include`, y su «Buy / Sell»
// sale entero de `monsters/base_npc_vendor`.
//
//     139 scripts con `game_menu_getoptions` en su propio texto
//     262 con él una vez resueltos los `#include`
//
// POR QUÉ AGUANTÓ VEINTISIETE EXPERIMENTOS: porque **Gate City no pierde
// ninguno**. Sus 25 scripts colocados lo declaran en su propio archivo, los 25.
// Edana pierde 7 de 13. Es el apartado 4 en la forma del 50 —con un solo caso
// el valor correcto y el de reposo coinciden— y la defensa es el segundo mapa.
//
// Esto no lee `../MSC/`: no está en todas las máquinas y una prueba que se
// salta sola no es una prueba. Se escriben los scripts en un directorio
// temporal, con la forma exacta que tienen los del mod.

import test, { describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { partirGuion } from "../src/play/guion.js";

let RAIZ;

/**
 * `cargarGuion` y `tieneMenu` de `tools/guiones.mjs`, con la raíz de aquí.
 *
 * Se rehacen en vez de importarse porque el módulo resuelve su raíz al
 * cargarse, desde `process.argv`, y se muere si no encuentra `../MSC/`. Lo que
 * se comprueba es **la regla**: que el menú se busque después de los
 * `#include`. Que el extractor use esta regla lo comprueba la última prueba,
 * que lee su código.
 */
function cargar(ruta, vistos = new Set()) {
  if (vistos.has(ruta)) return { eventos: [] };
  vistos.add(ruta);
  let texto;
  try { texto = readFileSync(join(RAIZ, `${ruta}.script`), "latin1"); } catch { return { eventos: [] }; }
  const propio = partirGuion(texto);
  const eventos = [];
  // EN ORDEN DE ARCHIVO, como `cargarGuion` desde el 66: el `#include` se
  // resuelve en su línea (script.cpp:5229, 5255), no al principio. Esta copia
  // tiene que seguir siendo fiel a la de `tools/`, que es por lo que el cambio
  // del 66 pasó también por aquí.
  for (const pieza of propio.piezas) {
    if (pieza.evento) { eventos.push(pieza.evento); continue; }
    if (pieza.include) eventos.push(...cargar(pieza.include, vistos).eventos);
  }
  return { eventos };
}
const tieneMenu = (r) => cargar(r).eventos.some((e) => e?.nombre === "game_menu_getoptions");
/** Lo que hacía antes: mirar el texto del propio archivo y nada más. */
const comoAntes = (r) => {
  try {
    return /^\{\s*(\[[^\]]*\]\s*)?game_menu_getoptions\b/m
      .test(readFileSync(join(RAIZ, `${r}.script`), "latin1"));
  } catch { return false; }
};

before(() => {
  RAIZ = mkdtempSync(join(tmpdir(), "msguiones-"));
  mkdirSync(join(RAIZ, "monsters"), { recursive: true });
  mkdirSync(join(RAIZ, "edana"), { recursive: true });

  // La plantilla, que es quien tiene el menú. Con la forma de
  // `monsters/base_npc_vendor`: el bloque del menú y su retrollamada.
  writeFileSync(join(RAIZ, "monsters", "base_npc_vendor.script"), `
{ game_menu_getoptions
	menuitem.register "Buy" cb_buy
	menuitem.register "Sell" cb_sell
}
{ cb_buy
	npcstore.offer STORE_NAME PARAM1
}
`, "latin1");

  // Y el NPC: doce líneas de \`setvar\` y un \`#include\`. Ni una de menú.
  writeFileSync(join(RAIZ, "edana", "healer.script"), `
{
	setvar STORE_NAME edana_healer
	const NO_JOB 1
}

#include monsters/base_npc_vendor

{ npc_spawn
	name Hartold the Mage
	setmodel npc/balancepriest1.mdl
}
`, "latin1");

  // Uno que SÍ lo trae en su archivo, como los 25 de Gate City.
  writeFileSync(join(RAIZ, "edana", "mergur.script"), `
{ game_menu_getoptions
	menuitem.register "Hail" cb_hail
}
`, "latin1");

  // Uno sin menú por ningún lado: un jabalí.
  writeFileSync(join(RAIZ, "monsters", "boar.script"), `
{ npc_spawn
	hp 40
	name Boar
}
`, "latin1");

  // Y uno que lo hereda y lo PISA con \`[override]\`, que es una forma real:
  // el motor ejecuta los dos bloques, así que sigue teniendo menú.
  writeFileSync(join(RAIZ, "edana", "mayor.script"), `
#include monsters/base_npc_vendor

{ [override] game_menu_getoptions
	menuitem.register "Ask about the town" cb_town
}
`, "latin1");
});

after(() => { try { rmSync(RAIZ, { recursive: true, force: true }); } catch {} });

describe("de dónde saca su menú un NPC (60)", () => {
  test("el que lo hereda por `#include` TIENE menú", () => {
    assert.equal(tieneMenu("edana/healer"), true);
  });

  test("y es justo el que se perdía: su archivo no lo nombra", () => {
    // El control que convierte la prueba de arriba en una medida del fallo.
    // Sin esto, «el sanador tiene menú» lo cumpliría también la versión rota
    // si el sanador lo hubiera declarado él.
    assert.equal(comoAntes("edana/healer"), false,
      "este montaje ya no reproduce el fallo: el sanador declara su propio menú");
  });

  test("el que lo trae en su archivo sigue teniéndolo", () => {
    // Los 25 de Gate City son de éstos, y por eso el fallo era invisible.
    assert.equal(tieneMenu("edana/mergur"), true);
    assert.equal(comoAntes("edana/mergur"), true);
  });

  test("y el que no lo tiene por ningún lado sigue sin tenerlo", () => {
    // El negativo. Sin él, un `tieneMenu` que devolviera `true` siempre
    // pasaría las tres de arriba.
    assert.equal(tieneMenu("monsters/boar"), false);
  });

  test("un `[override]` del menú de la plantilla sigue siendo un menú", () => {
    // No se mira el ámbito: `RunScriptEventByName` ejecuta los dos bloques, y
    // de hecho ésa es la forma de un NPC que cambia el menú que hereda.
    assert.equal(tieneMenu("edana/mayor"), true);
  });

  test("y la plantilla sola también, que es de donde sale", () => {
    assert.equal(tieneMenu("monsters/base_npc_vendor"), true);
  });

  test("un `#include` que no existe no tumba nada: devuelve que no hay menú", () => {
    assert.equal(tieneMenu("edana/nohay"), false);
  });
});

describe("y el extractor usa esta regla, no la de antes", () => {
  test("`tools/guiones.mjs` pregunta por los eventos cargados", () => {
    // Se lee su código porque ejecutarlo necesita `../MSC/`. Es una
    // comprobación pobre y se dice que lo es: lo que de verdad lo mide es que
    // `build/edana/guiones.json` pasó de 9 a 22 de 22.
    const t = readFileSync("tools/guiones.mjs", "utf8");
    assert.ok(/export function tieneMenu/.test(t),
      "`tools/guiones.mjs` ya no exporta `tieneMenu`");
    assert.ok(/cargarGuion\(ruta\)\.eventos\.some/.test(t),
      "`tieneMenu` ya no pregunta por los eventos cargados: mira otra cosa");
    assert.ok(/for \(const r of rutas\) \{\s*\n\s*if \(tieneMenu\(r\)\) conMenu\.push\(r\);/.test(t),
      "el censo ha vuelto a decidir sin resolver los `#include`");
  });
});
