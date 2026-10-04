// EL 95: UN ALDEANO HUYE UNA VEZ, Y AL MORIR NO AVISA A NADIE.
//
// Los dos pendientes que dejó el 94 (doc/GUARDIAS_94.md §7), y los dos tienen la
// misma raíz: el aldeano de Master Sword NO TIENE IA DE ATAQUE.
//
//   NPCs/default_human.script:28-30   incluye `base_npc`, `base_civilian` y
//                                     `base_xmass`; ni `base_npc_attack` ni la nueva
//   NPCs/default_dwarf.script:32-34   `base_npc`, `base_civilian`, `dwarf_lantern_base`
//   base_npc_attack.script:5          `setvar HAS_AI 1`   <- los dos ÚNICOS sitios
//   base_npc_attack_new.script:81     `setvar HAS_AI 1`      de los 2 884 guiones
//
// 1. La huida. El aldeano huye por SU guion (`setmovedest ent_laststruck 1024
//    flee`, default_human.script:66-72). La IA portada le hacía huir otra vez
//    (`npcatk_checkflee` con su `FLEE_HEALTH 25`, `FLEE_CHANCE 100%`), y ese
//    evento está en el `game_struck` de una base que el aldeano no incluye. Lo
//    mismo con `npcatk_checkflinch` (`CAN_FLINCH 1`, `FLINCH_CHANCE 50%`).
//    El ENANO es el segundo caso, y más claro: en el mod no huye NUNCA —su
//    `game_struck` le gira hacia ti y le hace pegar, default_dwarf.script:79-82—
//    y aquí huía igual que el humano.
// 2. El aviso. `if HAS_AI` delante de `npcatk_alert_all_allies`
//    (base_npc.script:168-172). Aquí, matar a un aldeano ponía a todo aldeano a
//    tiro de grito a perseguirte.
//
// Se entra por donde entra el juego con servidor: `Partida` + `Fauna` + un
// mensaje `PEGAR`, con las fichas y los guiones HORNEADOS (el 59). Los
// controles positivos son la misma ficha con `tieneIA: true`, que es el valor
// de reposo (lo que había antes del 95), escrito a la vista.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { Fauna } from "../src/red/fauna.js";
import { Partida } from "../src/red/partida.js";
import { mundoLiso } from "../src/red/liso.js";
import { AlmacenMemoria } from "../src/juego/almacen.js";
import { MENSAJE } from "../src/red/protocolo.js";

const BICHOS = "build/gatecity/bichos.json";
const GUIONES = "build/gatecity/guiones.json";
const EDANA = "build/edana/bichos.json";
const HAY = existsSync(BICHOS) && existsSync(GUIONES);

const SECUENCIAS = [
  { indice: 0, nombre: "idle1", fps: 15, fotogramas: 30, bucle: true, actividad: 1, pesoActividad: 1, avance: [0, 0, 0] },
  { indice: 1, nombre: "walk", fps: 30, fotogramas: 60, bucle: true, actividad: 3, pesoActividad: 1, avance: [-72, 0, 0] },
  { indice: 2, nombre: "die", fps: 30, fotogramas: 40, bucle: false, actividad: 36, pesoActividad: 1, avance: [0, 0, 0] },
];
const CATALOGO = {
  objetos: [{
    id: "weapon_shortsword", nombre: "Short Sword", peso: 40, multiplicadorDeCarga: 2,
    ataques: [{ nombre: "swing", dano: 9, danoRango: 5, alcance: 60, carga: 1, habilidad: "swordsmanship", tipoDano: "slash" }],
  }],
};

/** `puestos`: `{ script, escena, ia? }`; `ia` se mezcla sobre la horneada. */
async function montar(puestos) {
  const b = JSON.parse(readFileSync(BICHOS, "utf8"));
  const guiones = JSON.parse(readFileSync(GUIONES, "utf8"));
  const colocados = puestos.map(({ script, escena, ia = {} }) => {
    const c = b.colocados.find((x) => x.script === script);
    assert.ok(c, `el horneado trae un ${script}`);
    return { ...c, aparecedor: null, escena, ia: { ...c.ia, pasea: false, ...ia } };
  });
  const claves = new Set(colocados.map((c) => c.clave));
  const censo = {
    mapa: "liso", unidadesPorMetro: b.unidadesPorMetro, razas: b.razas,
    modelos: b.modelos.filter((m) => claves.has(m.clave)), colocados,
  };
  const mundo = await mundoLiso();
  const fauna = new Fauna({
    censo, mundo,
    secuenciasPorClave: new Map([...claves].map((k) => [k, SECUENCIAS])),
    cajasPorClave: new Map([...claves].map((k) => [k, { min: [-16, -16, 0], max: [16, 16, 72] }])),
    azar: () => 0.5,
  });
  const partida = new Partida({
    mundo, almacen: new AlmacenMemoria(), fauna, ahora: () => 0, catalogo: CATALOGO, guiones,
    aparicion: { mapa: "liso", nacimiento: { nombre: "el centro", escena: [0, 0, 0] } },
  });
  const cliente = partida.conectar({ enviar() {}, al: () => () => {} });
  await cliente.sesion.arrancar();
  const p = await cliente.sesion.crear({ nombre: "Ana", genero: "female", arma: "weapon_shortsword" });
  await partida.recibir(cliente.id, { t: MENSAJE.ELEGIR, id: p.id });
  for (let k = 0; k < 5; k++) partida.avanzar(0.1);
  return { partida, cliente, fauna, yo: `j${cliente.id}` };
}

const pegar = (partida, cliente, id, dano = 3) => partida.recibir(cliente.id, {
  t: MENSAJE.PEGAR, id, dano, alcance: 100000, cubo: "swordsmanship.power", tipo: "slash",
});

/** Corre `f` con todos los dados del mundo a 1 (el que más favorece cada `if`). */
async function conDadosAFavor(f) {
  const real = Math.random;
  Math.random = () => 0;
  try { return await f(); } finally { Math.random = real; }
}

test("el horneado: `tieneIA` es `HAS_AI`, y el aldeano no lo tiene (el 95)", { skip: !HAY && `falta ${BICHOS}` }, () => {
  const b = JSON.parse(readFileSync(BICHOS, "utf8"));
  const de = (s) => b.colocados.find((x) => x.script === s)?.ia?.tieneIA;
  // Con el valor de reposo (`undefined`, el horneado de antes) estas cuatro
  // fallan: la regla nueva lee `=== false` y sin el campo no se aplica.
  assert.equal(de("NPCs/default_human"), false, "default_human no incluye ninguna IA de ataque");
  assert.equal(de("NPCs/default_dwarf"), false, "default_dwarf tampoco");
  assert.equal(de("monsters/goblin"), true, "el goblin sí (base_monster_new -> base_npc_attack_new)");
  assert.equal(de("gatecity/guard"), true, "y el guardia (guard.script:20)");
  // Y ningún bicho del mapa sin el campo: un horneado a medias (el 81) se ve aquí.
  assert.equal(b.colocados.filter((x) => x.ia && typeof x.ia.tieneIA !== "boolean").length, 0);
  if (existsSync(EDANA)) {
    const e = JSON.parse(readFileSync(EDANA, "utf8"));
    assert.equal(e.colocados.find((x) => x.script === "deralia/commoner_sitting")?.ia?.tieneIA, false,
      "Edana: el aldeano sentado tampoco");
    assert.equal(e.colocados.find((x) => x.script === "monsters/boar")?.ia?.tieneIA, true,
      "Edana: el jabalí (base_monster -> base_npc_attack) sí");
  }
});

test("UNA huida, la del guion: el aldeano no huye además por la IA (el 95)",
  { skip: !HAY && `falta ${BICHOS} o ${GUIONES}` }, async (t) => {
    await t.test("humano: dos golpes, la IA no huye y el guion sí manda el destino", async () => {
      const { partida, cliente, fauna } = await montar([{ script: "NPCs/default_human", escena: [1, 0, 0] }]);
      const i = fauna.manada.de(0);
      // Dos golpes: `game_struck` corre con la vida de ANTES (TakeDamage,
      // msmonsterserver.cpp:2385, antes de `GiveHP`), y `FLEE_HEALTH 25` es
      // estricto, así que la IA del port huía a partir del SEGUNDO.
      await pegar(partida, cliente, 0);
      await pegar(partida, cliente, 0);
      assert.ok(i.vida < 25 && !i.muerto, `vivo y herido: ${i.vida}`);
      assert.equal(i.cazador?.huyendo ?? false, false, "sin `npcatk_flee`: no tiene `base_npc_attack`");
      assert.equal(i.mandado?.dueño, "guion",
        "la huida que queda es la de su guion (`setmovedest ent_laststruck 1024 flee`, default_human.script:68)");
    });

    await t.test("CONTROL POSITIVO: la misma ficha con `tieneIA: true` (lo de antes) huía por la IA", async () => {
      const { partida, cliente, fauna } = await montar([
        { script: "NPCs/default_human", escena: [1, 0, 0], ia: { tieneIA: true } },
      ]);
      const i = fauna.manada.de(0);
      await pegar(partida, cliente, 0);
      assert.equal(i.cazador.huyendo, false, "el primer golpe no (25 < 25 es falso)");
      await pegar(partida, cliente, 0);
      assert.equal(i.cazador.huyendo, true, "el segundo sí: la segunda huida que el 94 dejó apuntada");
      assert.equal(i.mandado?.dueño, "guion", "y además la del guion: DOS");
    });

    await t.test("enano: el segundo caso — en el mod no huye nunca, se gira hacia ti", async () => {
      const { partida, cliente, fauna } = await montar([{ script: "NPCs/default_dwarf", escena: [1, 0, 0] }]);
      const i = fauna.manada.de(0);
      await pegar(partida, cliente, 0);
      await pegar(partida, cliente, 0);
      assert.equal(i.cazador?.huyendo ?? false, false, "la IA no le hace huir");
      // `setmovedest ent_laststruck 9999` (default_dwarf.script:80): proximidad
      // 9999 es «mirar», no andar (el 81).
      assert.equal(i.mandado?.dueño, "guion");
      assert.equal(i.mandado?.proximidad, 9999, "lo que le manda su guion es girarse");
    });

    await t.test("encogerse: con los dados a favor, sin `HAS_AI` no hay `npcatk_checkflinch`", async () => {
      // Dos golpes: `FLINCH_HEALTH` es la vida máxima y la comparación es
      // estricta con la vida de antes del golpe, así que el primero no cuenta.
      const dos = async (m) => { await pegar(m.partida, m.cliente, 0, 3); await pegar(m.partida, m.cliente, 0, 3); };
      const a = await montar([{ script: "NPCs/default_human", escena: [1, 0, 0] }]);
      await conDadosAFavor(() => dos(a));
      assert.equal(a.fauna.manada.de(0).reaccion.encogidas, 0, "el aldeano de verdad no se encoge");
      // Control positivo: `CAN_FLINCH 1`, `FLINCH_CHANCE 50%`, umbral 2,5 y un
      // golpe de 3 con el dado a 1: con IA, se encoge.
      const b = await montar([{ script: "NPCs/default_human", escena: [1, 0, 0], ia: { tieneIA: true } }]);
      await conDadosAFavor(() => dos(b));
      assert.equal(b.fauna.manada.de(0).reaccion.encogidas, 1, "con IA se encogía");
    });
  });

test("al morir un aldeano no avisa a sus aliados: `if HAS_AI`, base_npc.script:170 (el 95)",
  { skip: !HAY && `falta ${BICHOS} o ${GUIONES}` }, async (t) => {
    /** Cuenta los avisados de cada `avisar` de la manada, sin cambiar lo que hace. */
    const espiar = (fauna) => {
      const vistos = [];
      const real = fauna.manada.avisar.bind(fauna.manada);
      fauna.manada.avisar = (...a) => { const r = real(...a); vistos.push(r.length); return r; };
      return vistos;
    };

    await t.test("dos aldeanos a un metro: matar a uno no pone al otro a perseguirte", async () => {
      const { partida, cliente, fauna } = await montar([
        { script: "NPCs/default_human", escena: [1, 0, 0] },
        { script: "NPCs/default_dwarf", escena: [2, 0, 0] },
      ]);
      const vistos = espiar(fauna);
      // Son aliados para la tabla de razas (los dos `race human`): lo que corta
      // es el `if HAS_AI`, no la relación.
      assert.equal(fauna.sonAliados(fauna.manada.de(0), fauna.manada.de(1)), true, "son aliados");
      await pegar(partida, cliente, 0, 9999);
      assert.equal(fauna.manada.de(0).muerto, true);
      assert.ok(vistos.length >= 1, "se ha preguntado a `avisar` (el instrumento ve la muerte)");
      assert.deepEqual(vistos.filter((n) => n > 0), [], "y no ha avisado a nadie");
      assert.equal(fauna.manada.de(1).cazador.objetivo, null, "el enano sigue sin objetivo");
    });

    await t.test("CONTROL POSITIVO: con `tieneIA: true` en el que muere (lo de antes), avisaba", async () => {
      const { partida, cliente, fauna, yo } = await montar([
        { script: "NPCs/default_human", escena: [1, 0, 0], ia: { tieneIA: true } },
        { script: "NPCs/default_dwarf", escena: [2, 0, 0] },
      ]);
      const vistos = espiar(fauna);
      await pegar(partida, cliente, 0, 9999);
      assert.equal(fauna.manada.de(0).muerto, true);
      assert.ok(vistos.some((n) => n > 0), `avisó: ${JSON.stringify(vistos)}`);
      assert.equal(fauna.manada.de(1).cazador.objetivo, yo, "y el enano te perseguía");
    });

    await t.test("CONTROL POSITIVO del juego: un goblin que muere sí avisa al de al lado", async () => {
      const { partida, cliente, fauna } = await montar([
        { script: "monsters/goblin", escena: [1, 0, 0] },
        { script: "monsters/goblin", escena: [2, 0, 0] },
      ]);
      const vistos = espiar(fauna);
      // El goblin puede parar (`parry`): se pega hasta que muera.
      for (let k = 0; k < 20 && !fauna.manada.de(0).muerto; k++) await pegar(partida, cliente, 0, 9999);
      assert.equal(fauna.manada.de(0).muerto, true, "muere");
      assert.ok(vistos.some((n) => n > 0), `avisó a su aliado: ${JSON.stringify(vistos)}`);
    });
  });
