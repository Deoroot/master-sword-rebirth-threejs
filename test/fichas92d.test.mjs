// LAS FICHAS QUE LEÍAN UN EVENTO QUE NO CORRE — experimento 92, pieza D.
//
// `sondas/mundo.mjs` daba 41 de 44 y dos de las rojas eran la misma: «en Gate
// City nadie pide `set_self_adj`» (13 lo pedían) y «ni hay jefes que cobren el
// ×4». Los 25 guiones del pueblo salían jefes y autoajustables, herrero y
// tabernero incluidos, porque `recoger` (src/bsp/script.js) cosecha los
// `setvar`/`setvard` de TODOS los bloques de todo lo incluido, y desde el 82
// —cuando `#include [server] monsters/externals` empezó a cargarse— eso trae
// `make_boss` y `set_self_adj` (externals.script:791-793, :1319-1322), que los
// pide el mapa y no el bicho. La trampa de `NPC_NO_DROPS` del 82, otra vez.
//
// TODO ENTRA POR `leerFichaNpc` CON GUIONES DEL MOD (CLAUDE.md §4, el 59 y el
// 67): ninguna ficha escrita a mano. Y cada negativo lleva su positivo al lado
// —un jefe de verdad, un autoajustable de verdad—, porque «nadie es jefe» está
// verde también con un lector que no lee nada (el 50: el segundo caso).
//
// Y la tercera roja, «el que anda y declara animación de andar, la tiene
// puesta», no era de fichas: era el candado de `CAnimOnce` (el 80) echado por
// la pose de reposo `nod`. Va al final, por `Manada`.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import { leerFichaNpc, modeloYAnimaciones } from "../src/bsp/script.js";
import { Manada } from "../src/play/manada.js";
import { RELACION } from "../src/bsp/razas.js";

const SCRIPTS = "../MSC/MSCScripts/scripts";
const HAY_MOD = existsSync(SCRIPTS);
const ficha = (g) => modeloYAnimaciones(leerFichaNpc(SCRIPTS, g));

/** Los 25 guiones que coloca Gate City (build/gatecity/bichos.json, el 92). */
const GATE_CITY = [
  "monsters/goblin", "monsters/spider", "monsters/spider_spitting", "monsters/dwarf_zombie_random",
  "monsters/dwarf_zombie_hbow", "gatecity/chest", "gatecity/armorer", "gatecity/hunter",
  "gatecity/generalstore", "gatecity/grocer", "gatecity/magicshop", "gatecity/kendra",
  "gatecity/mayor", "gatecity/guard", "gatecity/masterp", "gatecity/priest", "NPCs/default_dwarf",
  "NPCs/default_human", "gatecity/vendor", "gatecity/storage", "monsters/dwarf_zombie_sword",
  "monsters/dwarf_zombie_bigaxe", "monsters/spider_mini", "gatecity/miner", "gatecity/tavern",
];

describe("jefes y autoajuste: sólo lo que corre al nacer (el 92)", { skip: !HAY_MOD }, () => {
  test("en Gate City no hay ningún jefe ni ningún autoajustable", () => {
    const fichas = GATE_CITY.map((g) => [g, ficha(g)]).filter(([, f]) => f);
    assert.equal(fichas.length, 25, "control: los 25 guiones se leen");
    assert.deepEqual(fichas.filter(([, f]) => f.ia.esJefe).map(([g]) => g), []);
    assert.deepEqual(fichas.filter(([, f]) => f.ia.seAjusta).map(([g]) => g), []);
  });

  test("CONTROL DE LA TRAMPA: el valor de los eventos muertos SÍ está en `vars`", () => {
    // Sin esto, «nadie es jefe» sería verde también si `externals` dejara de
    // cargarse —que es como estuvo hasta el 82—, y no mediría la regla.
    const conTrampa = GATE_CITY.filter((g) => leerFichaNpc(SCRIPTS, g)?.vars.get("NPC_IS_BOSS") === "1");
    assert.ok(conTrampa.length >= 13, `${conTrampa.length} de 25 traen el 1 de \`make_boss\` en \`vars\``);
    const rata = leerFichaNpc(SCRIPTS, "monsters/giantrat");
    assert.equal(rata.vars.get("NPC_IS_BOSS"), "1", "en `vars`, de `make_boss`");
    assert.equal(rata.alNacer.variables.has("NPC_IS_BOSS"), false, "y al nacer no lo pone nadie");
  });

  test("POSITIVO: un jefe por `setvar` (se ejecuta al cargar) sale jefe", () => {
    // monsters/shadow_form_boss.script:6, en su bloque sin nombre.
    assert.equal(ficha("monsters/shadow_form_boss").ia.esJefe, true);
  });

  test("POSITIVO: un jefe por `setvard` en un bloque que corre al nacer sale jefe", () => {
    // monsters/goblinchief.script:7, dentro del bloque sin nombre de la línea 3.
    //
    // CORRECCIÓN DEL 93: la línea 7 está dentro de `if ( $lcase(game.map.name)
    // equals goblintown )` (:5-9). El lector del 92 tomaba el `if` por cierto;
    // el del 93 lo evalúa con el mapa, así que el jefe lo es en `goblintown` y
    // NO en `gertenheld_forest2`, que es donde lo colocamos. El positivo sigue
    // siendo un `setvard` en un bloque que corre al nacer, con su mapa.
    const en = (mapa) => modeloYAnimaciones(leerFichaNpc(SCRIPTS, "monsters/goblinchief", { mapa })).ia;
    assert.equal(en("goblintown").esJefe, true);
    assert.equal(en("gertenheld_forest2").esJefe, false, "y fuera de su mapa, no");
  });

  test("POSITIVO: los de `orc_for/*_sa` se ajustan, que lo piden con `setvar` (orc_archer_sa.script:2)", () => {
    assert.equal(ficha("orc_for/orc_archer_sa").ia.seAjusta, true);
    assert.equal(ficha("orc_for/orc_archer_sa").ia.esJefe, false, "y no por eso son jefes");
  });
});

describe("las otras tres del mismo `externals.script` (el 92)", { skip: !HAY_MOD }, () => {
  test("`set_blind_attack` no corre: la rata TIENE que verte para morder", () => {
    // externals.script:1227-1229. En `vars` hay un 0 y la rata salía ciega.
    const f = leerFichaNpc(SCRIPTS, "monsters/giantrat");
    assert.equal(f.vars.get("NPC_MUST_SEE_TARGET"), "0", "control: la trampa está en `vars`");
    assert.equal(modeloYAnimaciones(f).ia.tieneQueVerte, true);
  });

  test("POSITIVO: el goblin sí pega sin verte — lo pone él, en su bloque sin nombre", () => {
    // monsters/goblin.script:33 (`setvard NPC_MUST_SEE_TARGET 0`, bloque :3-39).
    assert.equal(ficha("monsters/goblin").ia.tieneQueVerte, false);
  });

  test("huir: los 2 048 de `turn_undead` no son la distancia de nadie; los del zombi enano, sí", () => {
    // externals.script:519 contra dwarf_zombie_random.script:25.
    assert.equal(ficha("monsters/goblin").ia.huir.distancia, 1000);
    assert.equal(ficha("monsters/dwarf_zombie_random").ia.huir.distancia, 2048);
  });

  test("`NPC_EXP_REDUCT`: el `PARAM1` de `ext_reduct_xp` ya no es la rebaja de nadie", () => {
    // externals.script:860-869. Salía «PARAM1» en 968 fichas.
    assert.equal(ficha("monsters/goblin").ia.reduccionDeExp, null);
    // CORRECCIÓN DEL 93: el `setvard NPC_EXP_REDUCT 1.5` del guardián está
    // dentro de `if ( $lcase(game.map.name) equals tundra )`
    // (elemental_ice_guardian2.script:12-16): es el suyo SÓLO en `tundra`.
    const guardian = (mapa) => modeloYAnimaciones(leerFichaNpc(SCRIPTS, "monsters/elemental_ice_guardian2", { mapa })).ia;
    assert.equal(guardian("tundra").reduccionDeExp, "1.5", "positivo: el suyo, en su mapa");
    assert.equal(guardian("gatecity").reduccionDeExp, null, "y en otro, ninguna");
  });
});

describe("la regla del motor al cargar: `setvar` corre en cualquier bloque, `setvard` no", { skip: !HAY_MOD }, () => {
  test("`setvar` en un evento CON NOMBRE cuenta al cargar, y gana el último (script.cpp:5384-5416)", () => {
    // calruin/cavetroll.script: `setvar ANIM_RUN walk` en el bloque sin
    // nombre (:28) y `setvar ANIM_RUN ANIM_FULLRUN` en
    // `npcatk_get_postspawn_properties` (:114). Al cargar se ejecutan los dos
    // y `SetVar` pisa: queda el segundo. `vars` —gana el primero— dice `walk`.
    const f = leerFichaNpc(SCRIPTS, "calruin/cavetroll");
    assert.equal(f.vars.get("ANIM_RUN"), "walk", "control: el lector viejo se queda el primero");
    // CORRECCIÓN DEL 93: al CARGAR sí queda el segundo, pero al nacer vuelve
    // a correr el bloque sin nombre —su `setvar ANIM_RUN walk` se ejecuta
    // «at loadtime and runtime», scriptcmds.cpp:120— y el de la línea 114 no:
    // está detrás de `if AM_GERIC` (:113), que en un troll sin más es falso y
    // abandona el evento. El 92 no evaluaba ese `if`. Al nacer, `walk`; la
    // regla de la carga la mide ahora test/fichas93c.test.mjs.
    assert.equal(f.alNacer.variables.get("ANIM_RUN"), "walk");
  });

  test("`setvard` en un evento que no corre NO cuenta (script.cpp:5448-5458)", () => {
    const f = leerFichaNpc(SCRIPTS, "monsters/giantrat");
    assert.equal(f.alNacer.variables.has("NPC_SELF_ADJUST"), false);
    assert.equal(f.vars.get("NPC_SELF_ADJUST"), "1", "control: está en `set_self_adj`");
  });
});

// ── LA TERCERA ROJA: EL ALDEANO QUE ECHA A ANDAR ASINTIENDO ────────────────

// Las tres secuencias que importan de `dwarf/male1.mdl`, con sus banderas tal
// como las da el `.mdl`: `nod` es de reposo (ACT_IDLE) y NO es de bucle —lo
// leyó la sonda en el navegador: `deBucle: false`—. Las duraciones son
// redondas: aquí se mide el candado, no el tiempo.
const SECUENCIAS_ENANO = [
  { indice: 0, nombre: "nod", fps: 10, fotogramas: 30, bucle: false, actividad: 1, pesoActividad: 10, avance: [0, 0, 0] },
  { indice: 1, nombre: "walk", fps: 30, fotogramas: 30, bucle: true, actividad: 3, pesoActividad: 1, avance: [-72, 0, 0] },
  { indice: 2, nombre: "attack", fps: 10, fotogramas: 30, bucle: false, actividad: 28, pesoActividad: 1, avance: [0, 0, 0] },
];

function dado(semilla = 1) {
  let s = semilla >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Un aldeano enano de Gate City: la ficha de `NPCs/default_dwarf`, del mod. */
function aldeano() {
  const f = ficha("NPCs/default_dwarf");
  return new Manada({
    mapa: "liso", unidadesPorMetro: 39.37, razas: [], modelos: [{ clave: "enano", carpeta: "x" }],
    colocados: [{
      clase: "msmonster_npc", script: "NPCs/default_dwarf", clave: "enano", nombre: f.nombre, hp: f.hp,
      ancho: f.ancho, alto: f.alto, parado: f.parado, andando: f.andando, piel: 0,
      escena: [0, 0, 0], yaw: 0, luz: [0, 0, 0], hostil: false, relacion: RELACION.ALIADO, ia: f.ia,
    }],
  }, {
    secuenciasPorClave: new Map([["enano", SECUENCIAS_ENANO]]),
    cajasPorClave: new Map([["enano", { min: [-16, -16, 0], max: [16, 16, 72] }]]),
    azar: dado(3),
  });
}

const ARNES = { libre: () => true, suelo: () => 0 };

describe("la pose de reposo no echa el candado de `CAnimOnce` (el 92)", { skip: !HAY_MOD }, () => {
  test("el aldeano que asiente y recibe destino se pone a ANDAR en ese mismo paso", () => {
    const m = aldeano();
    const i = m.instancias[0];
    assert.equal(i.ficha.parado ?? null, null, "control: `default_dwarf` no nombra su reposo, lo sortea");
    assert.equal(i.ficha.andando, "walk", "control: y declara la de andar");
    assert.equal(i.nombreActual, "nod", "control: nace asintiendo, que no es de bucle");
    // Se pasea SIN relojes, como `probe.vivo.pasear`: así el candado, si lo
    // hubiera, no lo vencería nadie y se vería entero.
    let primero = null;
    for (let k = 0; k < 60 * 20 && !primero; k++) {
      m.pasear(1 / 60, ARNES);
      if (i.andando === "pasea") primero = i.nombreActual;
    }
    assert.ok(primero !== null, "control: en 20 s ha recibido destino");
    // msmonsterserver.cpp:589-600 y monsteranimation.cpp:144-147: la de andar
    // entra con `gAnimWalk`, que no rechaza nada.
    assert.equal(primero, "walk");
  });

  test("CONTROL: un candado DE VERDAD —un ataque— sí rechaza la de andar", () => {
    // `CAnimOnce::CanChangeTo` (monsteranimation.cpp:219): mientras el golpe
    // dura, la de andar no entra. El arreglo no puede abrir esto.
    const m = aldeano();
    const i = m.instancias[0];
    assert.ok(m.pon(i, "attack"), "control: el ataque entra (la pose de reposo no lo ha rechazado)");
    assert.ok(i.unaVezHasta !== null, "el ataque echa el candado");
    m.ponDeAndarOParar(i, "walk");
    assert.equal(i.nombreActual, "attack", "y la de andar se rechaza");
  });
});
