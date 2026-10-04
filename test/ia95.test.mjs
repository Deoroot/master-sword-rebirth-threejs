// EL 95: EL PRIMER PENSAMIENTO DE UN BICHO, Y `playanim` CON MODO DE ANDAR.
//
// 1. Hasta el 94 `Cazador` nacía con el reloj a cero: un goblin o una araña
//    pensaban en el PRIMER paso y te fijaban al aparecer. En el mod las dos
//    bases esperan, y cada una lo suyo:
//
//        const NPC_SPAWN_PRED2 0.75              base_npc_attack_new.script:92
//        callevent NPC_SPAWN_PRED2 npcatk_hunt   base_npc_attack_new.script:148
//
//    y la vieja aborta su primer `hunting_mode_go` en `if NPC_INITIALIZED`
//    (base_npc_attack.script:71, puesto a `$randf(0.5,1.0)`, :40 y :57) y no
//    caza de verdad hasta el primer ciclo ocioso: 2,8 s (:7, :62-63).
//    Ver `primerPensamiento` en `iaDe` (src/bsp/script.js).
//
// 2. `playanim <tipo> <anim>` con un tipo que no es `once`, `hold`, `critical`
//    ni `break` —`move`, y también las erratas del mod (`critial`, en el
//    Urduaf de Edana, edana/urdauf.script:98 y :105)— es `MONSTER_ANIM_WALK`:
//    el valor por omisión de `AnimType` (npcscript.cpp:1512-1527). No rompe
//    nada antes (sólo `critical` lo hace, :1544-1547), lo rechaza una de una
//    vez sin acabar (monsteranimation.cpp:219-221), y NO echa candado: el
//    manejador que queda es `gAnimWalk`, que acepta todo (:144-147).
//
// TODO ENTRA POR DONDE ENTRA EL JUEGO (CLAUDE.md §4, el 59): la ficha sale de
// `leerFichaNpc` o del `bichos.json` horneado —ninguna lleva un
// `primerPensamiento` escrito aquí—; el reloj se mide por `Manada.cazar` y
// `Manada.revivir`, que son los que llaman en la partida (`aparecer` en
// src/render/bichos.js y `Fauna` en src/red/fauna.js); y el modo del
// `playanim` lo parte el analizador de un guion de texto, dentro de una
// `Partida` de verdad.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { leerFichaNpc, modeloYAnimaciones, iaDe } from "../src/bsp/script.js";
import { Manada } from "../src/play/manada.js";
import { Fauna } from "../src/red/fauna.js";
import { Partida } from "../src/red/partida.js";
import { mundoLiso } from "../src/red/liso.js";
import { AlmacenMemoria } from "../src/juego/almacen.js";
import { MENSAJE, abrir } from "../src/red/protocolo.js";
import { partirGuion } from "../src/play/guion.js";
import { resolverGuion } from "../src/play/cargador.js";
import { cargarGuion } from "../tools/scriptsmsr.mjs";
import { eventosDeSecuencia } from "../tools/bicho.mjs";
import { leerMdl } from "../src/bsp/mdl.js";
import { leerSecuencias } from "../src/bsp/mdlanim.js";

const SCRIPTS = "../MSC/MSCScripts/scripts";
const MODELOS = "../MSC/assets/msr/models";
const EFECTOS = "build/msr/efectosguion.json";
const JUGADOR = "build/msr/jugador.json";
const HAY_MOD = existsSync(SCRIPTS);
const HAY_TODO = HAY_MOD && existsSync(MODELOS) && existsSync(EFECTOS) && existsSync(JUGADOR);
const ficha = (g) => modeloYAnimaciones(leerFichaNpc(SCRIPTS, g));

// Los números del mod, ESCRITOS A MANO con su cita (el 75).
const NUEVA = 0.75;   // base_npc_attack_new.script:92 (`NPC_SPAWN_PRED2`)
const VIEJA = 2.8;    // base_npc_attack.script:7 (`CYCLE_TIME_IDLE`), ver arriba

// ── 1. LA FICHA ─────────────────────────────────────────────────────────────

describe("1. la ficha trae el primer pensamiento de su base (iaDe)", { skip: !HAY_MOD }, () => {
  test("la NUEVA: goblin, zombi enano, el guardia de Gate City → 0,75 s", () => {
    for (const g of ["monsters/goblin", "monsters/dwarf_zombie_random", "gatecity/guard"]) {
      assert.equal(ficha(g).ia.primerPensamiento, NUEVA, g);
    }
  });

  test("la VIEJA: rata, araña, cría de araña, jabalí → 2,8 s (el segundo caso)", () => {
    for (const g of ["monsters/giantrat", "monsters/spider", "monsters/spider_mini", "monsters/boar"]) {
      assert.equal(ficha(g).ia.primerPensamiento, VIEJA, g);
    }
  });

  test("un invocado piensa a 0,1 y aun así su primer pensamiento es el de la nueva", () => {
    // monsters/summon/base_summon.script:50 pone `CYCLE_TIME_IDLE 0.1`, pero el
    // primer `npcatk_hunt` lo programa `npc_spawn` con `NPC_SPAWN_PRED2`, que
    // no toca: el ciclo no es el primer pensamiento.
    const ia = iaDe(leerFichaNpc(SCRIPTS, "monsters/summon/base_summon"));
    assert.equal(ia.cicloOcioso, 0.1);
    assert.equal(ia.primerPensamiento, NUEVA);
  });

  test("un aldeano sin base no trae primer pensamiento (null, no un número inventado)", () => {
    assert.equal(ficha("NPCs/default_dwarf").ia.primerPensamiento, null);
  });
});

// ── 2. EL HORNEADO, CONTRA LA CADENA DE INCLUDES ────────────────────────────
//
// Otro instrumento que el de `iaDe`: seguir los `#include` del texto hasta una
// de las dos bases (el oráculo de test/ciclo94).
function baseDe(guion, vistos = new Set()) {
  const clave = guion.toLowerCase();
  if (vistos.has(clave)) return null;
  vistos.add(clave);
  if (clave === "monsters/base_npc_attack") return "vieja";
  if (clave === "monsters/base_npc_attack_new") return "nueva";
  const ruta = join(SCRIPTS, `${guion}.script`);
  if (!existsSync(ruta)) return null;
  for (const l of readFileSync(ruta, "latin1").split(/\r?\n/)) {
    const m = l.match(/^\s*#include\s+(?:\[\w+\]\s+)?(\S+)/i);
    if (!m) continue;
    const b = baseDe(m[1], vistos);
    if (b) return b;
  }
  return null;
}

const MAPAS = ["gatecity", "edana", "edanasewers", "gertenheld_forest2", "sala88"];
const horneado = (m) => {
  const r = `build/${m}/bichos.json`;
  return existsSync(r) ? JSON.parse(readFileSync(r, "utf8")) : null;
};

describe("2. el horneado de los cinco mapas, bicho por bicho", { skip: !HAY_MOD }, () => {
  for (const m of MAPAS) {
    test(`${m}: cada bicho espera lo de su base antes de pensar`, (t) => {
      const j = horneado(m);
      if (!j) return t.skip(`sin build/${m}/bichos.json`);
      const cuenta = { vieja: 0, nueva: 0, ninguna: 0 };
      for (const c of j.colocados) {
        const b = baseDe(c.script);
        cuenta[b ?? "ninguna"]++;
        const esperado = b === "vieja" ? VIEJA : b === "nueva" ? NUEVA : null;
        assert.equal(c.ia?.primerPensamiento ?? null, esperado, `${m} ${c.script} (${b ?? "sin base"})`);
      }
      t.diagnostic(`${m}: vieja ${cuenta.vieja}, nueva ${cuenta.nueva}, sin base ${cuenta.ninguna}`);
    });
  }
});

// ── 3. POR `Manada.cazar` Y `Manada.revivir` ────────────────────────────────
//
// El jugador está a la vista DESDE EL PRIMER PASO, a 2 m. Se cuenta cuánto
// tarda el bicho en fijarlo: eso es el primer pensamiento.

const DT = 1 / 60;   // el paso fijo del juego, src/main.js:161

function manadaDe(script, { conAparecedor = false } = {}) {
  const j = horneado("gatecity");
  const c = j.colocados.find((x) => x.script === script);
  assert.ok(c, `${script} está en Gate City`);
  assert.ok(c.aparecedor, `${script} sale de un área en Gate City (lo que se mide abajo)`);
  return new Manada({ ...j, colocados: [conAparecedor ? c : { ...c, aparecedor: null }] }, {
    cajasPorClave: new Map([[c.clave, { min: [-16, -16, 0], max: [16, 16, 32] }]]),
    azar: () => 0.5,
  });
}

function arnesDe(m) {
  const U = m.U;
  return {
    libre: () => true, suelo: () => 0, veA: () => true, golpear: () => {},
    objetivos: (b) => [{ id: "jugador", donde: [b.donde[0] * U + 79, b.donde[1] * U + 36, b.donde[2] * U],
      esJugador: true, relacion: b.ficha.relacion, ancho: 0 }],
  };
}

/** Pasos de 1/60 hasta que fija al jugador, en segundos (o `null`). */
function hastaQueTeFija(m, i) {
  const arnes = arnesDe(m);
  for (let k = 1; k <= 400; k++) {
    m.relojes(DT);
    m.cazar(DT, arnes);
    if (i.cazador?.objetivo === "jugador") return k * DT;
  }
  return null;
}

const cerca = (s, esperado) => s !== null && Math.abs(s - esperado) <= DT + 1e-9;

describe("3. cuánto tarda en fijarte un bicho recién nacido", { skip: !HAY_MOD }, () => {
  test("el goblin (nueva), colocado: 0,75 s; la cría de araña (vieja): 2,8 s", (t) => {
    if (!horneado("gatecity")) return t.skip("sin horneado");
    for (const [s, esperado] of [["monsters/goblin", NUEVA], ["monsters/spider_mini", VIEJA]]) {
      const m = manadaDe(s);
      const tarda = hastaQueTeFija(m, m.instancias[0]);
      assert.ok(cerca(tarda, esperado), `${s}: tardó ${tarda?.toFixed(3)} s, el mod ${esperado}`);
    }
  });

  test("SALIENDO DE SU ÁREA (por `revivir`, que es como aparecen todos los de Gate City)", (t) => {
    if (!horneado("gatecity")) return t.skip("sin horneado");
    for (const [s, esperado] of [["monsters/goblin", NUEVA], ["monsters/spider_mini", VIEJA]]) {
      const m = manadaDe(s, { conAparecedor: true });
      const i = m.instancias[0];
      assert.equal(i.dormido, true, "nace dormido, esperando a su área");
      // Un rato dormido: el reloj de un dormido no corre (`cazar` lo salta).
      for (let k = 0; k < 600; k++) { m.relojes(DT); m.cazar(DT, arnesDe(m)); }
      // Lo que hacen `aparecer` (src/render/bichos.js) y `Fauna` (src/red/fauna.js).
      m.revivir(i);
      i.dormido = false;
      const tarda = hastaQueTeFija(m, i);
      assert.ok(cerca(tarda, esperado), `${s}: tardó ${tarda?.toFixed(3)} s desde que apareció, el mod ${esperado}`);
    }
  });

  test("y al volver de MORIR, otra vez desde el principio: es otra entidad", (t) => {
    if (!horneado("gatecity")) return t.skip("sin horneado");
    const m = manadaDe("monsters/goblin");
    const i = m.instancias[0];
    assert.ok(cerca(hastaQueTeFija(m, i), NUEVA), "primera vida");
    // Un cazador viejo en combate piensa cada 0,1 s: si `revivir` lo
    // conservara, la segunda vida te fijaría en el primer paso.
    for (let k = 0; k < 60; k++) { m.relojes(DT); m.cazar(DT, arnesDe(m)); }
    m.revivir(i);
    const tarda = hastaQueTeFija(m, i);
    assert.ok(cerca(tarda, NUEVA), `segunda vida: tardó ${tarda?.toFixed(3)} s`);
  });
});

// ── 4. `playanim move` (y sus erratas) ──────────────────────────────────────
//
// El arnés de test/animacion94a: una `Partida` con UNA rata del mod, su
// modelo, y un guion escrito aquí y partido por el analizador.

function secuenciasDelModelo(relativo) {
  const m = leerMdl(`${MODELOS}/${relativo}`);
  return leerSecuencias(m).map((s, k) => ({
    indice: k, nombre: s.nombre, fps: s.fps, fotogramas: Math.max(1, s.nFotogramas), bucle: s.bucle,
    actividad: s.actividad, pesoActividad: s.pesoActividad, avance: s.avance, eventos: eventosDeSecuencia(m, k),
  }));
}

async function montar(script, texto) {
  const f = ficha(script);
  const secuencias = secuenciasDelModelo(f.modelo);
  const censo = {
    mapa: "liso", unidadesPorMetro: 39.37, razas: [], modelos: [{ clave: "b", carpeta: "x" }],
    colocados: [{
      clase: "msmonster_x", script, clave: "b", nombre: f.nombre, hp: 100,
      ancho: f.ancho, alto: f.alto, parado: f.parado, andando: f.andando, piel: 0,
      escena: [0, 0, 0], yaw: 0, luz: [0, 0, 0], hostil: false, relacion: -2, ia: { ...f.ia },
    }],
  };
  // Sin `texto`, el guion del mod tal cual (el cofre); con él, uno escrito aquí.
  const guion = texto ? resolverGuion(script, () => partirGuion(texto)) : cargarGuion(script);
  const mundo = await mundoLiso();
  let k = 1;
  const azar = () => { k = (k * 1664525 + 1013904223) >>> 0; return k / 4294967296; };
  const fauna = new Fauna({
    censo, mundo, azar,
    secuenciasPorClave: new Map([["b", secuencias]]),
    cajasPorClave: new Map([["b", { min: [-17, -17, 0], max: [17, 17, 40] }]]),
  });
  const partida = new Partida({
    mundo, almacen: new AlmacenMemoria(), fauna, ahora: () => 0,
    aparicion: { mapa: "liso", nacimiento: { nombre: "el centro", escena: [0, 0.1, 0] } },
    guiones: { guiones: { [script]: guion } },
    efectos: JSON.parse(readFileSync(EFECTOS, "utf8")),
    fichaDelJugador: JSON.parse(readFileSync(JUGADOR, "utf8")),
  });
  const dentro = [];
  const c = partida.conectar({ dentro, enviar: (t) => dentro.push(abrir(t)), al: () => () => {} }, { nombre: "Ana" });
  await c.sesion.arrancar();
  const p = await c.sesion.crear({ nombre: "Ana", genero: "female" });
  await partida.recibir(c.id, { t: MENSAJE.ELEGIR, id: p.id });
  c.cuerpo.colocar([3000, 0.1, 0]);
  const i = fauna.manada.instancias[0];
  const g = () => partida.interacciones.guionesVivos.get(i.id) ?? null;
  const rastro = (ev) => (g()?.guion?.rastro ?? []).filter((r) => r.evento === ev).length;
  let seq = 0;
  const paso = async () => {
    partida._paso();
    partida.repartir();
    seq++;
    await partida.recibir(c.id, { t: MENSAJE.ORDENES, ordenes: [{ seq, msec: 10, botones: 0 }] });
  };
  return { i, g, paso, rastro, partida };
}

describe("4. `playanim move` / `critial` / `loop`: MONSTER_ANIM_WALK (npcscript.cpp:1512-1527)", { skip: !HAY_TODO }, () => {
  // Un mordisco `critical` y, 0,2 s después —dura 0,75 s—, `standidle2` con el
  // modo a probar; a los 1,5 s, con el mordisco ya acabado, otra vez; y 0,1 s
  // después un `once` encima. `standidle2` no es de bucle ni la usa nadie más.
  const guion = (modo) => `{
   repeatdelay 30
   playanim critical attack
   callevent 0.2 encima
   callevent 1.5 sola
   callevent 1.6 y_luego_once
}
{ encima
   playanim ${modo} standidle2
}
{ sola
   playanim ${modo} standidle2
}
{ y_luego_once
   playanim once attack
}`;

  async function hasta(m, ev) {
    for (let n = 0; n < 400; n++) { await m.paso(); if (m.rastro(ev) >= 1) return true; }
    return false;
  }

  for (const modo of ["move", "critial", "loop"]) {
    test(`\`${modo}\`: lo rechaza un mordisco sin acabar, entra solo, y NO echa candado`, async () => {
      const m = await montar("monsters/giantrat", guion(modo));
      const rechazos = m.i.sigue.rechazos;
      assert.ok(await hasta(m, "encima"), "el evento `encima` corre");
      // Como `once` (CAnimOnce::CanChangeTo, monsteranimation.cpp:219-221) y
      // NO como `critical`, que rompería el mordisco.
      assert.equal(m.i.anim.nombre, "attack", `sigue el mordisco; puesta ${m.i.anim.nombre}`);
      assert.ok(m.i.sigue.rechazos > rechazos, "y se cuenta el rechazo");
      // CONTROL: sin nada corriendo, sí entra (el instrumento ve el cambio).
      assert.ok(await hasta(m, "sola"), "el evento `sola` corre");
      assert.equal(m.i.anim.nombre, "standidle2", `sola, entra; puesta ${m.i.anim.nombre}`);
      // LA REGLA: `gAnimWalk` acepta todo, así que no hay candado...
      assert.equal(m.i.unaVezHasta, null, "sin candado: el manejador es el de andar");
      // ...y un `once` encima entra (con `critical` o `once` se rechazaría).
      assert.ok(await hasta(m, "y_luego_once"), "el evento `y_luego_once` corre");
      assert.equal(m.i.anim.nombre, "attack", `el \`once\` de después entra; puesta ${m.i.anim.nombre}`);
    });
  }

  test("CONTROL: con `once` el `once` de después SÍ se rechaza (el candado existe y se ve)", async () => {
    const m = await montar("monsters/giantrat", guion("once"));
    assert.ok(await hasta(m, "sola"), "el evento `sola` corre");
    assert.equal(m.i.anim.nombre, "standidle2");
    assert.notEqual(m.i.unaVezHasta, null, "`once` echa el candado");
    assert.ok(await hasta(m, "y_luego_once"));
    assert.equal(m.i.anim.nombre, "standidle2", "y el `once` de después no entra");
  });
});

describe("4 bis. `move` con `m_IdleAnim`: la pisa el siguiente `Think` (msmonsterserver.cpp:589-592)", { skip: !HAY_TODO }, () => {
  // La rata nombra su reposo (`idle1`), así que el `Think` la pide cada 0,1 s.
  const guion = (modo) => `{
   repeatdelay 30
   callevent 0.5 pide
}
{ pide
   playanim ${modo} standidle2
}`;

  async function trasPedir(modo) {
    const m = await montar("monsters/giantrat", guion(modo));
    let n = 0;
    while (m.rastro("pide") < 1 && n++ < 200) await m.paso();
    assert.equal(m.i.anim.nombre, "standidle2", `entra (${modo})`);
    // 0,3 s más: tres `Think`.
    for (let k = 0; k < 30; k++) await m.paso();
    return m.i.anim.nombre;
  }

  test("con `move`, a los 0,3 s ya está otra vez el reposo de la rata", async () => {
    assert.equal(await trasPedir("move"), "idle1");
  });

  test("CONTROL: con `once` sigue `standidle2` a los 0,3 s (el instrumento ve que dura)", async () => {
    assert.equal(await trasPedir("once"), "standidle2");
  });
});

describe("5. `playanim hold`: `CAnimHold` (monsteranimation.cpp:183-199)", { skip: !HAY_TODO }, () => {
  const guion = (modo) => `{
   repeatdelay 60
   playanim critical attack
   callevent 0.2 encima
   callevent 1.5 sola
   callevent 2.0 andar
   callevent 4.5 y_luego_once
}
{ encima
   playanim ${modo} standidle2
}
{ sola
   playanim ${modo} standidle2
}
{ andar
   playanim move idle1
}
{ y_luego_once
   playanim once attack
}`;

  async function hasta(m, ev) {
    for (let n = 0; n < 600; n++) { await m.paso(); if (m.rastro(ev) >= 1) return true; }
    return false;
  }

  test("`hold`: un mordisco sin acabar la rechaza; sola entra y NO la suelta ni el reposo ni un `move`; un `once` sí", async () => {
    const m = await montar("monsters/giantrat", guion("hold"));
    assert.ok(await hasta(m, "encima"));
    assert.equal(m.i.anim.nombre, "attack", "sin `Priority` no rompe nada antes (npcscript.cpp:1544-1550)");
    assert.ok(await hasta(m, "sola"));
    assert.equal(m.i.anim.nombre, "standidle2", "sola, entra");
    assert.ok(await hasta(m, "andar"));
    assert.equal(m.i.anim.nombre, "standidle2", "`playanim move` es MONSTER_ANIM_WALK y el `hold` la rechaza");
    // 2,5 s de `Think` pidiendo `idle1` cada 0,1: `standidle2` dura menos.
    assert.ok(await hasta(m, "y_luego_once"));
    assert.equal(m.i.anim.nombre, "attack", "un `once` sí entra: `ReleaseAnim` es TRUE en un bicho");
    // Y la SUELTA: acabado el mordisco, el `Think` vuelve a poder pedir.
    for (let k = 0; k < 200; k++) await m.paso();
    assert.notEqual(m.i.anim.nombre, "attack", "acabado el `once`, el `hold` ya no está");
    assert.equal(m.i.sostenida, null);
  });

  test("CONTROL: con `critical`, a los 4,5 s hace mucho que volvió el reposo (el instrumento ve soltarse)", async () => {
    const m = await montar("monsters/giantrat", guion("critical"));
    assert.ok(await hasta(m, "andar"));
    for (let k = 0; k < 200; k++) await m.paso();
    // Lo que haya puesto el `Think` (`idle1`, o `walk` si la rata pasea), pero no la de antes.
    assert.notEqual(m.i.anim.nombre, "standidle2");
  });
});

describe("6. el cofre del tesoro, con SU guion: abierto mientras comercias", { skip: !HAY_TODO }, () => {
  // `trade_success` hace `playanim hold ANIM_OPEN` (chests/base_treasurechest.
  // script:160) y `trade_done` `playanim once ANIM_CLOSE` (:171). El cofre de
  // Edana (`edana/eTC1`) incluye esa plantilla; su guion es el del mod, partido
  // por el analizador. Lo que se llama a mano son las dos retrollamadas de la
  // tienda, por su nombre (el viaje de la tienda hasta ellas es del 62-63).
  test("con la tienda abierta 10 s el cofre sigue en `open`; al cerrarla, `close`", async () => {
    const m = await montar("edana/eTC1", null);
    for (let k = 0; k < 150; k++) await m.paso();
    assert.equal(m.i.anim.nombre, "idle", "nace cerrado (`setidleanim ANIM_IDLE`)");
    // `guionDe` es como lo encuentra `Interacciones` al usar el cofre.
    const guion = m.partida.interacciones.guionDe(m.i);
    assert.ok(guion, "el cofre tiene guion");
    guion.llamar("trade_success");
    await m.paso();
    assert.equal(m.i.anim.nombre, "open", "se abre");
    for (let k = 0; k < 1000; k++) await m.paso();
    assert.equal(m.i.anim.nombre, "open", `10 s después sigue abierto (antes del 95 volvía a \`idle\`): ${m.i.anim.nombre}`);
    guion.llamar("trade_done");
    await m.paso();
    assert.equal(m.i.anim.nombre, "close", "`once` suelta el `hold`");
    for (let k = 0; k < 300; k++) await m.paso();
    assert.equal(m.i.anim.nombre, "idle", "y cerrado, vuelve el reposo (`setidleanim ANIM_IDLE`, :172)");
  });
});

describe("7. `movespeed`: el cuarto factor del paso (msmonsterserver.cpp:1201, npcscript.cpp:514-521)", { skip: !HAY_TODO }, () => {
  // La rata pasea con su `walk`; el guion le pone `movespeed` al nacer. En los
  // cinco mapas lo hacen el esqueleto venenoso de los tipos 3 y 5 (`movespeed
  // 2.0` / `1.5`, monsters/skeleton_poison_random.script:100, :127) y el
  // jabalí al embestir (boar_base.script:131).
  const conMovespeed = (x) => `{
   repeatdelay 1
   movespeed ${x}
}`;

  async function andadoPorPaso(texto) {
    const m = await montar("monsters/giantrat", texto);
    let suma = 0, pasos = 0, antes = [...m.i.donde];
    for (let n = 0; n < 6000; n++) {
      await m.paso();
      const d = Math.hypot(m.i.donde[0] - antes[0], m.i.donde[2] - antes[2]) * 39.37;
      antes = [...m.i.donde];
      if (m.i.anim.nombre === "walk" && m.i.destino && m.i.unaVezHasta === null && d > 0) { suma += d; pasos++; }
    }
    return { m, porPaso: pasos ? suma / pasos : 0, pasos };
  }

  test("con `movespeed 2` la rata anda el DOBLE por paso que con `movespeed 1`", async () => {
    const uno = await andadoPorPaso(conMovespeed(1));
    const dos = await andadoPorPaso(conMovespeed(2));
    assert.ok(uno.pasos > 100 && dos.pasos > 100, `las dos andan: ${uno.pasos} y ${dos.pasos} pasos`);
    assert.equal(dos.m.i.fisica.ritmoAndar, 2, "control: el guion lo puso");
    const cociente = dos.porPaso / uno.porPaso;
    assert.ok(Math.abs(cociente - 2) < 0.04, `cociente ${cociente.toFixed(3)} (${dos.porPaso.toFixed(4)} / ${uno.porPaso.toFixed(4)} u por paso)`);
  });

  test("`revivir` lo devuelve a 1, y el ritmo y el reposo: `CMSMonster::Spawn` (msmonsterserver.cpp:180, :190)", async () => {
    // Un jabalí muerto embistiendo no vuelve embistiendo: su `boar_charge_stop`
    // estaba en el guion de la vida anterior, que se retira (el 91).
    const m = await montar("monsters/giantrat", `{
   repeatdelay 30
   movespeed 2
   setanim.framerate .5
   setidleanim standidle2
}`);
    for (let n = 0; n < 200; n++) await m.paso();
    assert.equal(m.i.fisica.ritmoAndar, 2, "control: puesto");
    assert.equal(m.i.fisica.ritmoAnim, 0.5, "control: puesto");
    assert.equal(m.i.fisica.parado, "standidle2", "control: puesto");
    m.partida.fauna.manada.revivir(m.i);
    assert.equal(m.i.fisica.ritmoAndar, 1);
    assert.equal(m.i.fisica.ritmoAnim, 1, "y `m_Framerate`");
    assert.equal(m.i.fisica.parado, null, "y `m_IdleAnim`");
  });
});

describe("7 bis. el esqueleto venenoso de Gertenheld, con SU guion: `movespeed` al nacer", { skip: !HAY_TODO }, () => {
  // `skeleton_spawn` sortea `POISON_TYPE $rand(1,6)` (skeleton_poison_random.
  // script:63) y los tipos 3 y 5 ponen `movespeed 2.0` y `1.5` (:100, :127).
  // Se lee lo que dejó en el cuerpo, junto con el tipo que salió.
  test("el `movespeed` del tipo que salió llega a `ritmoAndar`", async () => {
    const vistos = [];
    const m = await montar("monsters/skeleton_poison_random", null);
    for (let n = 0; n < 300; n++) await m.paso();
    const g = m.partida.interacciones.guionDe(m.i);
    const tipo = g?.guion?.vars?.get("POISON_TYPE");
    vistos.push({ tipo, ritmo: m.i.fisica.ritmoAndar });
    const esperado = { 3: 2, 5: 1.5 }[Number(tipo)] ?? 1;
    assert.ok(tipo !== undefined, `control: el guion sorteó un tipo: ${JSON.stringify(vistos)}`);
    assert.equal(m.i.fisica.ritmoAndar, esperado, JSON.stringify(vistos));
  });
});
