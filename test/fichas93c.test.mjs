// LAS 23 VARIABLES MEZCLADAS DE `iaDe` — experimento 93, pieza C.
//
// El 92 escribió `variablesAlNacer` (src/bsp/script.js) y la aplicó a cinco
// campos; dejó 23 variables de `iaDe` leyendo `vars` porque su diferencia con
// lo de al nacer «mezcla el evento muerto con un `setvard` que este lector no
// puede evaluar». Casi todas eran el RELLENO POR OMISIÓN de la IA —`if ( X
// equals 'X' ) setvard X …`— aplicado sin mirar el `if`. El 93 evalúa las
// condiciones que dependen del propio bicho, y declara las que no.
//
// TODO ENTRA POR `leerFichaNpc` CON GUIONES DEL MOD (CLAUDE.md §4, el 59 y el
// 67): ni una ficha escrita a mano. Y cada valor nuevo lleva al lado el valor
// viejo de `vars` como control: si el lector dejara de evaluar, el control
// diría que la trampa sigue ahí y el valor nuevo no saldría.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { leerFichaNpc, modeloYAnimaciones } from "../src/bsp/script.js";

const SCRIPTS = "../MSC/MSCScripts/scripts";
const HAY_MOD = existsSync(SCRIPTS);
const leer = (g, o) => leerFichaNpc(SCRIPTS, g, o);
const ia = (g, o) => modeloYAnimaciones(leer(g, o)).ia;

describe("los alcances: el relleno por omisión sólo si el bicho no los pone (el 93)", { skip: !HAY_MOD }, () => {
  test("el zombi enano de Gate City pega a la MITAD de lo que declara", () => {
    // dwarf_zombie_random.script:27-28 declara 125/200 en su bloque sin nombre
    // y su `npcatk_get_postspawn_properties` (:275-295) los multiplica por 0,5
    // sin condición. Ése es el que corre, 0,5 s después de nacer.
    const f = leer("monsters/dwarf_zombie_bigaxe");
    assert.equal(f.vars.get("ATTACK_RANGE"), "125", "control: `vars` se queda el declarado");
    const i = modeloYAnimaciones(f).ia;
    assert.equal(i.alcanceDeGolpe, 62.5);
    assert.equal(i.alcanceDeImpacto, 100);
  });

  test("sin `ATTACK_HITRANGE` propio: `MONSTER_WIDTH` × 4, y `MONSTER_WIDTH` es `m_Width × 1,1`", () => {
    // base_npc_attack_new.script:172 (`game.monster.moveprox`, msmonster.h:355)
    // y :209-213. El guardia de Edana declara su `ATTACK_RANGE 100` y no el de
    // impacto: 32 × 1,1 × 4 = 140,8, y no los 128 de `porAncho(4)`.
    const i = ia("edana/guard");
    assert.equal(i.alcanceDeGolpe, 100, "el que declara se respeta: su `if ( X equals 'X' )` sale falso");
    assert.equal(i.alcanceDeImpacto, 140.8);
  });

  test("la IA VIEJA sube el alcance de impacto hasta la altura + 48 (base_npc_attack.script:893-909)", () => {
    // La araña escupidora declara 69 (spider_spitting.script:31) y mide 64 de
    // alto: `M_ATTACK_HITRANGE` = 64 + 10 + 38 = 112, y `if ( ATTACK_HITRANGE <
    // M_ATTACK_HITRANGE )` lo sube.
    const f = leer("monsters/spider_spitting");
    assert.equal(f.vars.get("ATTACK_HITRANGE"), "69", "control: lo declarado");
    assert.equal(modeloYAnimaciones(f).ia.alcanceDeImpacto, 112);
  });

  test("la araña de Gate City toca a 128: su plantilla, no `porAncho(4)` (spider_base.script:6)", () => {
    assert.equal(ia("monsters/spider").alcanceDeImpacto, 128);
  });

  test("un tirador se para a su `ATTACK_MOVERANGE` (base_npc_attack_new.script:186-196)", () => {
    // dwarf_zombie_sbow.script:43, `setvard ATTACK_MOVERANGE 768`; el zombi de
    // ballesta pesada de Gate City lo hereda. Antes se paraba a 32.
    assert.equal(ia("monsters/dwarf_zombie_hbow").alcanceParaPararse, 768);
  });
});

describe("las condiciones que se pueden evaluar, y las que no (el 93)", { skip: !HAY_MOD }, () => {
  test("`if ( $lcase(game.map.name) equals … )`: con el mapa, decide; sin él, se declara", () => {
    // monsters/goblinchief.script:5-19. El `)` que cierra el `if` es el
    // segundo: con el primero, el `{ }` corría siempre.
    const en = (mapa) => ia("monsters/goblinchief", { mapa });
    assert.equal(en("goblintown").esJefe, true);
    assert.equal(en("goblintown").experiencia, 400);
    assert.equal(en("gertenheld_forest").experiencia, 50);
    assert.equal(en("gertenheld_forest2").experiencia, 150);
    assert.equal(en("gertenheld_forest2").esJefe, false);
    const sin = ia("monsters/goblinchief");
    assert.equal(sin.esJefe, false, "sin mapa, el camino seguro: no entrar");
    assert.ok(sin.dudosas?.NPC_IS_BOSS?.some((r) => r.includes("game.map.name")), JSON.stringify(sin.dudosas));
  });

  test("un sorteo toma su primer resultado, y lo DICE", () => {
    // dwarf_zombie_random.script: `pick_weapon_type` sortea `WEAPON_TYPE`
    // entre 0 y 4; el 0 es el desarmado (:166-183): 40 de experiencia y 20 de
    // daño. El `bigaxe` lo fija a 2 con `[override]` y no sortea nada.
    const r = ia("monsters/dwarf_zombie_random");
    assert.equal(r.experiencia, 40);
    assert.deepEqual(r.dano, { min: 20, max: 20 });
    assert.ok(r.dudosas?.ATTACK_DAMAGE?.[0].startsWith("sorteo $rand(0,4)"), JSON.stringify(r.dudosas));
    const b = ia("monsters/dwarf_zombie_bigaxe");
    assert.equal(b.experiencia, 100);
    assert.deepEqual(b.dano, { min: 40, max: 40 });
    assert.equal(b.dudosas, null, "sin sorteo, nada que declarar");
  });

  test("`$randf` como RETRASO de un `callevent` es un retraso, no un nombre de evento", () => {
    // base_npc_attack.script:39, `callevent $randf(0.5,1.0)
    // npcatk_get_postspawn_properties`: es por donde la IA vieja rellena sus
    // omisiones (`npcatk_check_sets`, :800-909). La araña pone `CAN_RETALIATE
    // 0` sólo mientras va enganchada (spider.script:115) y al nacer vale el 1
    // de la plantilla (:823).
    const f = leer("monsters/spider");
    assert.equal(f.vars.get("CAN_RETALIATE"), "0", "control: el del enganche está en `vars`");
    assert.equal(modeloYAnimaciones(f).ia.puedeCambiarDeObjetivo, true);
  });

  test("el `setvarg` no se ejecuta al cargar (script.cpp:5384)", () => {
    // dwarf_zombie_random.script:475 pone `ZOMBIE_QUEST_COMPLETE` al acabar la
    // misión, y la :136 borra al zombi si está puesto.
    const texto = readFileSync(`${SCRIPTS}/monsters/dwarf_zombie_random.script`, "latin1");
    assert.match(texto, /setvarg ZOMBIE_QUEST_COMPLETE 1/, "control: la línea existe");
    assert.equal(leer("monsters/dwarf_zombie_random").alNacer.variables.has("ZOMBIE_QUEST_COMPLETE"), false);
  });
});

describe("el orden: `npc_spawn` antes que los bloques sin nombre (el 93)", { skip: !HAY_MOD }, () => {
  test("el jabalí jefe de Edana HUYE, aunque su `npc_spawn` diga que no", () => {
    // edana/boarboss.script:24 pone `CAN_FLEE 0` en `npc_spawn` («to override
    // base scripts»), pero el bloque sin nombre de monsters/boar.script:4 pone
    // 1 y corre DESPUÉS: `npc_spawn` lo llama `game_spawn` dentro de
    // `CScriptedEnt::Spawn` (global.cpp:424-437, msmonsterserver.cpp:238) y
    // los bloques sin nombre esperan al primer `Think` (:503-542,
    // script.cpp:4987). El comentario del autor y el motor no dicen lo mismo.
    const f = leer("edana/boarboss");
    assert.equal(f.vars.get("CAN_FLEE"), "0", "control: `vars` se queda el del `npc_spawn`");
    assert.equal(modeloYAnimaciones(f).ia.huir.puede, true);
  });

  test("dos bloques sin nombre: gana el que se LEE después", () => {
    // orc_flayer.script:13 pone 45 % y luego incluye orc_base, cuyo bloque
    // sin nombre (:25) pone 30 %.
    const f = leer("monsters/orc_flayer");
    assert.equal(f.vars.get("FLINCH_CHANCE"), "45%", "control");
    assert.equal(modeloYAnimaciones(f).ia.encogerse.probabilidad, 30);
  });
});

describe("la experiencia BASE, la de antes de los ajustes (el 93)", { skip: !HAY_MOD }, () => {
  test("es la que `skilllevel` guarda en `NPC_ORIG_EXP`, no la ya ajustada", () => {
    // base_self_adjust.script:488 escribe en `NPC_GIVE_EXP` la experiencia
    // YA ajustada (el «+1» de `expadj 1`): esa la hace `experienciaDelBicho`.
    const f = leer("monsters/dwarf_zombie_hbow");
    assert.equal(f.alNacer.variables.get("NPC_ORIG_EXP"), "150");
    assert.equal(modeloYAnimaciones(f).ia.experiencia, 150);
  });

  test("`const` gana el primero: el zombi de ballesta PESADA da 150 y no 200", () => {
    // dwarf_zombie_hbow.script:3 declara `XBOW_TYPE 0` antes del `#include`,
    // y la rama de dwarf_zombie_sbow.script:15-28 que corre es el `else`.
    const f = leer("monsters/dwarf_zombie_hbow");
    assert.equal(f.vars.get("NPC_GIVE_EXP"), "200", "control: `vars` se queda la primera rama");
    assert.equal(modeloYAnimaciones(f).ia.golpe, "anim_hxbow_shoot_reload");
  });

  test("`NPC_BASE_EXP` manda sobre `NPC_GIVE_EXP` (base_self_adjust.script:268)", () => {
    // edana/boarboss.script:9, `const NPC_BASE_EXP 15`; el jabalí del que
    // hereda pone 6.
    assert.equal(ia("edana/boarboss").experiencia, 15);
    assert.equal(ia("monsters/giantrat").experiencia, 3, "y la rata, que no lo tiene, la suya");
  });
});

describe("los valores, como los guarda el motor (el 93)", { skip: !HAY_MOD }, () => {
  test("las comillas dobles agrupan y no se guardan (script.cpp:5627-5640)", () => {
    assert.deepEqual(ia("monsters/elemental_fire_guardian").sonidos.muerte, ["monsters/ice_guardian/c_elemwatr_dead.wav"]);
  });

  test("`setvard X a b` JUNTA los valores sin espacio (scriptcmds.cpp:6569-6575)", () => {
    // orc_archer.script:19, `setvard DROP_ITEM2 proj_arrow_wooden 30`: el
    // motor guarda «proj_arrow_wooden30», que no es ningún objeto.
    const b = ia("monsters/orc_archer").botin;
    assert.equal(b[1].objeto, "proj_arrow_wooden30");
  });
});
