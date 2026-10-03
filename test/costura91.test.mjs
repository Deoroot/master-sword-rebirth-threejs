// LA COSTURA DEL 91: el guion de un bicho recibe los eventos de combate del motor.
//
// La IA portada (ia.js, manada.js, reaccion.js) sigue mandando; lo que se
// prueba aquí es que el GUION del bicho, que hasta el 90 no existía para un
// goblin o una rata, nace con el bicho y se entera de lo que le pasa, en el
// orden y con los parámetros del motor, y que lo que duplicaría a la IA está
// cerrado y CONTADO.
//
// TODO ENTRA POR DONDE ENTRA EL JUEGO (CLAUDE.md §4, el 59 y el 63): una
// `Manada` de verdad, un `InteraccionesNpc` de verdad enchufado con
// `enchufarA`, la caza con `manada.cazar` y el golpe del jugador con
// `manada.herir`. Ninguna prueba llama a `GuionDeNpc.costura` a mano ni le
// construye los parámetros: si la costura se desenchufa, éstas se ponen rojas.
//
// Los guiones salen del MOD, con sus `#include` resueltos por el mismo
// cargador que el horneado (`tools/scriptsmsr.mjs` -> `src/play/cargador.js`).

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import { leerFichaNpc, modeloYAnimaciones, RELACION } from "../src/bsp/script.js";
import { Manada } from "../src/play/manada.js";
import { GuionDeNpc, RelojDeGuiones, CIERRE_DE_BICHO, EVENTOS_CERRADOS, paramsDeDodamage, aMotor } from "../src/play/npcguion.js";
import { InteraccionesNpc, esDeCombate } from "../src/juego/interacciones.js";
import { cargarGuion } from "../tools/scriptsmsr.mjs";

const SCRIPTS = "../MSC/MSCScripts/scripts";
const HAY_MOD = existsSync(SCRIPTS);
const U = 39.37;

/** Un dado fijo, para que dos pasadas den lo mismo. */
function dado(semilla = 1) {
  let s = semilla >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const SECUENCIAS = [
  { indice: 0, nombre: "idle1", fps: 15, fotogramas: 30, bucle: true, actividad: 1, pesoActividad: 15, avance: [0, 0, 0] },
  { indice: 1, nombre: "walk", fps: 30, fotogramas: 60, bucle: true, actividad: 3, pesoActividad: 1, avance: [-72, 0, 0] },
  { indice: 2, nombre: "run", fps: 30, fotogramas: 25, bucle: true, actividad: 4, pesoActividad: 1, avance: [76, 0, 0] },
  { indice: 3, nombre: "attack", fps: 30, fotogramas: 30, bucle: false, actividad: 28, pesoActividad: 1, avance: [0, 0, 0] },
  { indice: 4, nombre: "die", fps: 30, fotogramas: 40, bucle: false, actividad: 36, pesoActividad: 1, avance: [0, 0, 0] },
];

/**
 * Un bicho del mod y un jugador de pie a `aU` unidades, con la costura
 * enchufada como la enchufa `src/main.js`.
 *
 * `defensa` es lo que contesta `golpear`, que en el juego es la defensa del
 * jugador (`main.js`): `{parado, dano}`.
 */
function montar(script, { aU = 32, azar = dado(5), relacion = null, defensa = null, enchufar = true, hp = null, aplicarEfecto = null } = {}) {
  const ficha = modeloYAnimaciones(leerFichaNpc(SCRIPTS, script));
  const guion = cargarGuion(script);
  const rel = relacion ?? RELACION.ODIO;
  const manada = new Manada({
    mapa: "liso", unidadesPorMetro: U,
    razas: [], modelos: [{ clave: "b", carpeta: "x" }],
    colocados: [{
      clase: "msmonster_x", script, clave: "b",
      nombre: ficha.nombre ?? script, hp: hp ?? ficha.hp ?? 10, ancho: ficha.ancho, alto: ficha.alto,
      parado: "idle1", andando: "walk", piel: 0,
      escena: [0, 0, 0], yaw: 0, luz: [0, 0, 0],
      hostil: true, relacion: rel,
      ia: { ...ficha.ia, ...(hp ? { vida: hp } : {}) },
    }],
  }, {
    secuenciasPorClave: new Map([["b", SECUENCIAS]]),
    cajasPorClave: new Map([["b", { min: [-16, -16, 0], max: [16, 16, 32] }]]),
    azar,
  });
  const personaje = { id: "P1", nombre: "Ana", vida: 1000 };
  const pies = () => {
    const n = manada.instancias[0].donde;
    return [n[0] + aU / U, n[1], n[2]];
  };
  const sucesos = [];
  const inter = new InteraccionesNpc({
    sesion: { personaje },
    guiones: { guiones: { [script]: guion } },
    npcPorId: (id) => manada.de(id),
    suceso: (t, x) => sucesos.push(`${t}: ${x}`),
    losNpc: () => manada.instancias,
    dondeEstaElJugador: pies,
    unidadesPorMetro: U,
    aplicarEfecto,
  });
  if (enchufar) inter.enchufarA(manada);
  const arnes = {
    libre: () => true,
    suelo: () => 0,
    veA: () => true,
    objetivos: (i) => {
      const n = i.donde;
      return [{ id: "jugador", donde: [n[0] * U + aU, n[1] * U + 36, n[2] * U], esJugador: true, relacion: i.ficha.relacion ?? rel, ancho: 0 }];
    },
    golpear: (_i, _id, dano) => (defensa ? defensa(dano) : { parado: false, dano }),
  };
  const correr = (segundos) => {
    for (let t = 0; t < segundos; t += 1 / 60) { manada.cazar(1 / 60, arnes); inter.paso(1 / 60); }
  };
  const i = manada.instancias[0];
  return { manada, inter, i, correr, sucesos, personaje, g: () => inter.guionesVivos.get(i.id) ?? null };
}

/** Los eventos del rastro de un guion con ese nombre, con sus parámetros. */
const del = (g, nombre) => g.guion.rastro.filter((r) => r.evento === nombre);

// ── LA LISTA ────────────────────────────────────────────────────────────────

describe("el cierre es una lista, y cada entrada dice de dónde sale", () => {
  test("cada evento cerrado trae su cita al mod y su porqué", () => {
    assert.ok(CIERRE_DE_BICHO.length > 0);
    for (const c of CIERRE_DE_BICHO) {
      assert.match(c.cita, /\.(script|cpp):\d+/, `${c.evento} sin cita a archivo:línea`);
      assert.ok(c.porque.length > 20, `${c.evento} sin porqué`);
    }
  });
  test("lo no medido va marcado y lo dice en su porqué, para que no se lea como medido", () => {
    for (const c of CIERRE_DE_BICHO) {
      assert.equal(typeof c.medido, "boolean", c.evento);
      if (!c.medido) assert.match(c.porque, /NO MEDIDO/, c.evento);
    }
  });
  test("sin repetidos: dos entradas del mismo evento serían dos porqués para una cosa", () => {
    assert.equal(EVENTOS_CERRADOS.size, CIERRE_DE_BICHO.length);
  });
  test("ningún evento que dispara el MOTOR está cerrado, salvo `game_parry` por su llamada interna", () => {
    // Los que dispara la costura no pueden estar en la lista: si estuvieran,
    // el guion no los recibiría por la puerta interna y la prueba de abajo
    // —que entra por la costura— no lo vería. `game_parry` es la excepción
    // declarada (ver su `porque`).
    for (const e of ["game_dodamage", "game_damaged", "game_damaged_other", "game_struck", "game_death", "game_predeath"]) {
      assert.ok(!EVENTOS_CERRADOS.has(e), e);
    }
  });
});

describe("los parámetros de `game_dodamage`, con el formato del motor (giattack.cpp:2036-2045)", () => {
  test("acierto: «1», el asa, dos vectores «(x,y,z)», el tipo y « N.N damage.» con su espacio", () => {
    assert.deepEqual(paramsDeDodamage({ acierto: true, objetivo: "P1", desde: [0, 0, 32], hasta: [32, 0, 36], tipo: "", dano: 0.4 }),
      ["1", "P1", "(0.00,0.00,32.00)", "(32.00,0.00,36.00)", "generic", " 0.4 damage."]);
  });
  test("fallo: «0» y la cadena «0», no «0.0 damage.»", () => {
    const p = paramsDeDodamage({ acierto: false, objetivo: "P1", desde: [0, 0, 0], hasta: [0, 0, 0], tipo: "slash", dano: 3 });
    assert.equal(p[0], "0");
    assert.equal(p[4], "slash");
    assert.equal(p[5], "0");
  });
  test("el cambio de ejes es la inversa de `aEscena`, sin ceros negativos fabricados", () => {
    // (1, 2, 3) m de escena son x=1·U, y=−3·U, z=2·U del motor (lector.js:402-408).
    assert.deepEqual(aMotor([1, 2, 3], 10), [10, -30, 20]);
    assert.ok(!Object.is(aMotor([0, 0, 0], U)[1], -0));
  });
});

// ── NACER ───────────────────────────────────────────────────────────────────

describe("el guion de un bicho de combate nace con él", { skip: !HAY_MOD }, () => {
  test("con la costura enchufada, el primer paso le crea el guion y corre su `npc_spawn`", () => {
    const { inter, g } = montar("monsters/giantrat");
    assert.equal(g(), null, "antes del paso no hay guion: nadie le ha hablado");
    inter.paso(0);
    assert.ok(g(), "después del paso, sí");
    assert.ok(del(g(), "npc_spawn").length > 0, "y ha nacido: su `npc_spawn` ha corrido");
    assert.equal(inter.costura.nacidos, 1);
  });

  test("CONTROL NEGATIVO: sin enchufar, el paso no crea nada (el guion seguiría siendo perezoso)", () => {
    const { inter, g } = montar("monsters/giantrat", { enchufar: false });
    inter.paso(0);
    assert.equal(g(), null);
  });

  test("un NPC sin daño no es de combate y no nace con guion", () => {
    assert.equal(esDeCombate({ ficha: { ia: { dano: null } } }), false);
    assert.equal(esDeCombate({ ficha: { ia: { dano: { min: 1, max: 1 } } } }), true);
  });

  test("el bucle de caza del goblin está CERRADO y contado; sin cierre correría cada ciclo", () => {
    // `npc_spawn` -> `callevent NPC_SPAWN_PRED2 npcatk_hunt` y el hunt se
    // reprograma solo (base_npc_attack_new.script:148 y :232).
    const { inter, g, correr } = montar("monsters/goblin", { aU: 4000 });
    inter.paso(0);
    correr(20);
    assert.equal(del(g(), "npcatk_hunt").length, 0, "el bucle del guion no ha corrido");
    assert.ok((g().costuraCuenta.cerrados.npcatk_hunt ?? 0) >= 1, "pero se le ha pedido, y está contado");
    // El control que demuestra que había algo que cerrar: el MISMO guion sin
    // cierre, con un reloj, corre el bucle una y otra vez.
    const reloj = new RelojDeGuiones();
    const libre = new GuionDeNpc({ ficha: cargarGuion("monsters/goblin"), npc: { nombre: "Goblin" }, programar: (s, q) => reloj.programar(s, q) });
    for (let t = 0; t < 20; t += 0.1) reloj.paso(0.1);
    assert.ok(del(libre, "npcatk_hunt").length >= 5, `sin cierre el hunt corre ${del(libre, "npcatk_hunt").length} veces en 20 s`);
  });
});

// ── EL BICHO PEGA ───────────────────────────────────────────────────────────

describe("la rata muerde y su guion recibe `game_dodamage`, acierte o falle", { skip: !HAY_MOD }, () => {
  test("uno por intento, y el «1» de PARAM1 son los que entraron", () => {
    const { manada, inter, g, correr } = montar("monsters/giantrat");
    inter.paso(0);
    correr(20);
    const pega = manada.sucesos.filter((s) => s.que === "pega").length;
    const falla = manada.sucesos.filter((s) => s.que === "falla").length;
    const dd = del(g(), "game_dodamage");
    assert.ok(pega > 0 && falla > 0, `hacen falta los dos casos: ${pega} aciertos y ${falla} fallos`);
    assert.equal(g().costuraCuenta.recibidos.game_dodamage, pega + falla);
    // El rastro apunta una entrada por BLOQUE: la rata tiene dos
    // `game_dodamage` (base_anti_stuck y base_monster_shared).
    const unos = dd.filter((r) => r.params[0] === "1").length;
    const ceros = dd.filter((r) => r.params[0] === "0").length;
    assert.equal(unos / 2, pega);
    assert.equal(ceros / 2, falla);
    // Y `game_damaged_other` sólo con los que entraron (giattack.cpp:1755).
    assert.equal(g().costuraCuenta.recibidos.game_damaged_other, pega);
  });

  test("los parámetros son los del motor: el asa del jugador, el ojo de la rata, el centro del jugador", () => {
    const { inter, g, correr } = montar("monsters/giantrat");
    inter.paso(0);
    correr(20);
    const r = del(g(), "game_dodamage").find((x) => x.params[0] === "1");
    assert.ok(r, "algún mordisco tiene que haber entrado");
    assert.equal(r.params[1], "P1", "PARAM2 es el asa del jugador, la del personaje");
    // La rata mide 32 de alto y está en el origen; el ojo es su alto entero.
    // Va andando hacia el jugador, así que x e y son las suyas del momento:
    // lo que se fija es la ALTURA, que es lo que separa el ojo de los pies.
    assert.match(r.params[2], /,32\.00\)$/, `el ojo a 32 sobre los pies: ${r.params[2]}`);
    assert.match(r.params[3], /,36\.00\)$/, `el centro del jugador a 36 sobre los pies: ${r.params[3]}`);
    assert.equal(r.params[4], "generic", "el `dodamage` de la rata no declara tipo: «generic», npcscript.cpp:1116");
    assert.equal(r.params[5], " 0.4 damage.", "los 0,4 de su archivo, con el espacio delante");
  });

  test("EL EFECTO: el anti-atasco del guion cuenta los fallos y se pone a cero al acertar", () => {
    // `game_dodamage` de base_anti_stuck.script:386-400: `add AS_MISS_COUNT 1`
    // si PARAM1 es 0, `setvard AS_MISS_COUNT 0` si es 1. No es una cuenta
    // nuestra: es una variable del guion del mod, movida por el guion.
    const { inter, g, manada } = montar("monsters/giantrat");
    inter.paso(0);
    const valor = () => g().guion.buscarVar("AS_MISS_COUNT")?.valor ?? null;
    const cazarHasta = (que) => {
      const arnes = {
        libre: () => true, suelo: () => 0, veA: () => true,
        objetivos: (i) => [{ id: "jugador", donde: [i.donde[0] * U + 32, 36, 0], esJugador: true, relacion: RELACION.ODIO, ancho: 0 }],
        golpear: (_i, _id, dano) => ({ parado: false, dano }),
      };
      for (let t = 0; t < 60; t += 1 / 60) {
        const n = manada.sucesos.length;
        manada.cazar(1 / 60, arnes);
        if (manada.sucesos.slice(n).some((s) => s.que === que)) return true;
      }
      return false;
    };
    assert.ok(cazarHasta("falla"));
    const trasFallo = Number(valor());
    assert.ok(trasFallo >= 1, `tras un fallo AS_MISS_COUNT vale ${valor()}`);
    assert.ok(cazarHasta("pega"));
    assert.equal(Number(valor()), 0, "y un acierto lo pone a cero");
  });

  test("un PARRY del jugador convierte el mordisco en «0», aunque el dado de la rata entrara", () => {
    // `flDamage == -1` -> `AttackHit = false` (giattack.cpp:1832-1838).
    const { manada, inter, g, correr } = montar("monsters/giantrat", { defensa: () => ({ parado: true, dano: 0 }) });
    inter.paso(0);
    correr(20);
    const pega = manada.sucesos.filter((s) => s.que === "pega").length;
    assert.ok(pega > 0, "el dado de la rata tiene que haber entrado alguna vez");
    assert.equal(del(g(), "game_dodamage").filter((r) => r.params[0] === "1").length, 0,
      "ningún «1»: el jugador los ha parado todos");
    assert.equal(g().costuraCuenta.recibidos.game_damaged_other, pega,
      "pero `game_damaged_other` sí llegó: va antes de la defensa");
  });

  test("CONTROL DE LA COSTURA: sin enchufar, la rata muerde igual y su guion no se entera", () => {
    const { manada, inter, correr } = montar("monsters/giantrat", { enchufar: false });
    correr(20);
    assert.ok(manada.sucesos.some((s) => s.que === "pega"), "la IA no depende de la costura");
    assert.ok(manada.costuraSinOyente > 0, "y lo que no llega se cuenta");
    assert.equal(inter.guionesVivos.size, 0);
  });
});

// ── AL BICHO LE PEGAN ───────────────────────────────────────────────────────

describe("al recibir: `game_damaged`, `game_damaged_end` y `game_struck`, con la vida de antes", { skip: !HAY_MOD }, () => {
  test("en ese orden, y el `game_struck` corre ANTES de restar (msmonsterserver.cpp:2380-2388)", () => {
    const { manada, inter, g, i } = montar("monsters/giantrat", { hp: 4 });
    inter.paso(0);
    const vidaAlRecibir = [];
    const oyente = manada.oyente;
    manada.oyente = (s) => { if (s.que === "recibe") vidaAlRecibir.push(s.i.vida); oyente(s); };
    const antes = i.vida;
    manada.herir(i, 1, { tipo: "slash", cubo: "swordsmanship.power", dados: { quien: "jugador", parry: 1, acc: 100 } });
    assert.deepEqual(vidaAlRecibir, [antes], "la costura ve la vida de ANTES del golpe");
    const orden = g().guion.rastro.map((r) => r.evento).filter((e) => ["game_damaged", "game_struck"].includes(e));
    assert.equal(orden[0], "game_damaged");
    assert.equal(orden.at(-1), "game_struck");
    const rc = g().costuraCuenta.recibidos;
    assert.deepEqual([rc.game_damaged, rc.game_damaged_end, rc.game_struck], [1, 1, 1]);
    const d = del(g(), "game_damaged")[0].params;
    assert.deepEqual([d[0], d[1], d[2], d[5]], ["P1", "1.000000", "slash", "Swordsmanship"],
      "atacante, daño en «%f», tipo y la habilidad con el nombre del motor");
    assert.equal(del(g(), "game_struck")[0].params[0], "1.000000");
  });

  test("lo que el `game_struck` del guion haría por la IA se cierra y se cuenta", () => {
    const { inter, g, i, manada } = montar("monsters/giantrat", { hp: 4 });
    inter.paso(0);
    manada.herir(i, 1, { tipo: "slash", dados: { quien: "jugador" } });
    const c = g().costuraCuenta.cerrados;
    // La rata es de la familia vieja: `npcatk_go_agro`, `npcatk_target`,
    // `npcatk_retaliate`, `npcatk_checkflee`, `npcatk_checkflinch`
    // (base_npc_attack.script:228-258).
    for (const e of ["npcatk_target", "npcatk_retaliate", "npcatk_checkflee"]) {
      assert.ok((c[e] ?? 0) >= 1, `${e} no se ha pedido: ${JSON.stringify(c)}`);
      assert.equal(del(g(), e).length, 0, `${e} ha corrido`);
    }
    // Y `npc_struck`, que no duplica nada, SÍ corre (sus sonidos se apuntan).
    assert.ok(del(g(), "npc_struck").length >= 1);
  });

  test("al morir: `game_predeath` y `game_death`; el grito a los aliados lo da la IA y el del guion se cierra", () => {
    const { inter, g, i, manada } = montar("monsters/giantrat", { hp: 4 });
    inter.paso(0);
    manada.herir(i, 10, { tipo: "slash", dados: { quien: "jugador", parry: 1, acc: 100 } });
    assert.ok(i.muerto);
    const rc = g().costuraCuenta.recibidos;
    assert.equal(rc.game_predeath, 1);
    assert.equal(rc.game_death, 1);
    assert.ok((g().costuraCuenta.cerrados.npcatk_alert_all_allies ?? 0) >= 1);
    assert.ok(manada.sucesos.some((s) => s.que === "muere"), "la muerte de la IA ha ocurrido igual");
  });

  test("la animación de morir que pide el guion se ABSORBE: la pone la IA, y no dos veces", () => {
    // base_npc.script:185, `playanim critical ANIM_DEATH`, contra el
    // `deUnaVez` de `Manada.matar`. Con un gancho `animar` que rebobina, un
    // segundo `die` reiniciaría la muerte.
    const { inter, i, manada } = montar("monsters/giantrat", { hp: 4 });
    const pedidas = [];
    inter.animar = (inst, n) => pedidas.push(n);
    inter.paso(0);
    // Lo que pida al NACER pasa —no es combate—: la rata a veces se estira
    // (su bloque sin nombre, giantrat.script:83-90). Se mide desde aquí.
    pedidas.length = 0;
    const gen0 = i.anim.gen;
    manada.herir(i, 10, { tipo: "slash", dados: { quien: "jugador", parry: 1, acc: 100 } });
    const g = inter.guionesVivos.get(i.id);
    assert.deepEqual(pedidas, [], "el guion no ha movido el cuerpo");
    assert.ok(Object.keys(g.costuraCuenta.absorbidos).some((k) => k.startsWith("animar")),
      `y lo ha pedido: ${JSON.stringify(g.costuraCuenta.absorbidos)}`);
    assert.equal(i.anim.gen, gen0 + 1, "la muerte la ha puesto la IA, una vez");
  });

  test("CONTROL DEL ABSORBER: fuera de la costura el mismo gancho sí anima (un `playanim` de menú)", () => {
    const { inter, i } = montar("monsters/giantrat");
    const pedidas = [];
    inter.animar = (inst, n) => pedidas.push(n);
    inter.paso(0);
    inter.guionesVivos.get(i.id).entorno.animar("idle1");
    assert.deepEqual(pedidas, ["idle1"]);
  });
});

describe("el parry DEL BICHO lo decide la IA, y el guion se entera por `game_parry`", { skip: !HAY_MOD }, () => {
  test("con parry: `game_damaged`, `game_parry`, `game_damaged_end` a cero, y NO `game_struck`", () => {
    const { inter, g, i, manada } = montar("monsters/spider");
    inter.paso(0);
    const r = manada.herir(i, 2, { tipo: "slash", dados: { quien: "jugador", parry: 90, acc: 1 } });
    assert.ok(r.parado, "el dado de la IA dice que para");
    const rc = g().costuraCuenta.recibidos;
    assert.equal(rc.game_damaged, 1);
    assert.equal(rc.game_parry, 1);
    assert.equal(rc.game_struck, undefined);
    assert.equal(del(g(), "game_damaged_end").length, 0, "la araña no tiene ese bloque, pero el evento llegó:");
    assert.equal(rc.game_damaged_end, 1);
  });

  test("y el dado PROPIO del guion (base_monster_shared.script:843-857) no para nada: su `game_parry` se cierra", () => {
    // Sin parry de la IA, cuarenta golpes. El guion de la araña tira su propio
    // `$rand(1,MONSTER_PARRY)` contra `$rand(PARAM4,100)` y alguna vez gana:
    // eso es lo que se cierra. Si no se cerrara, la araña haría su animación
    // de esquivar con golpes que SÍ le entran.
    const { inter, g, i, manada } = montar("monsters/spider", { hp: 100000 });
    inter.paso(0);
    // `acierto: 1` es PARAM4: el guion tira `$rand(1,100)` contra
    // `$rand(1,50)` y gana una de cada cuatro. Con cuarenta golpes, que no
    // gane ninguna es 0,75⁴⁰ ≈ 1e-5: esto no es un control de sorteo (el 76).
    // `MONSTER_PARRY` lo pone su `setstat parry 50 0 0` al nacer, que hasta
    // el 91 no hacía nada en un NPC (ver `ponerEstadistica` en npcguion.js).
    assert.equal(g().guion.buscarVar("MONSTER_PARRY")?.valor, "50");
    for (let k = 0; k < 40; k++) manada.herir(i, 1, { tipo: "slash", dados: { quien: "jugador", acierto: 1, parry: 1, acc: 1 } });
    assert.equal(del(g(), "game_parry").length, 0, "ningún `game_parry` ha corrido");
    assert.ok((g().costuraCuenta.cerrados.game_parry ?? 0) > 0,
      "y el guion SÍ lo ha pedido alguna vez: había algo que cerrar (si no, este verde no mediría nada)");
  });
});

describe("volver a nacer es otra entidad, y otro guion", { skip: !HAY_MOD }, () => {
  test("`revivir` rehace el guion y retira el viejo, que deja de correr", () => {
    const { inter, i, manada } = montar("monsters/giantrat", { hp: 4 });
    inter.paso(0);
    const viejo = inter.guionesVivos.get(i.id);
    manada.herir(i, 10, { tipo: "slash", dados: { quien: "jugador", parry: 1, acc: 100 } });
    manada.revivir(i);
    inter.paso(0);
    const nuevo = inter.guionesVivos.get(i.id);
    assert.notEqual(nuevo, viejo);
    assert.equal(nuevo.nacimiento, 1);
    assert.ok(viejo.retirado);
    assert.equal(viejo.costura("game_struck", ["1.000000"]), false, "el viejo ya no corre nada");
    assert.equal(inter.costura.renacidos, 1);
  });
});

describe("`applyeffect` desde el guion de un bicho llega al gancho de los efectos del jugador", { skip: !HAY_MOD }, () => {
  test("la rata venenosa: `game_dodamage` -> `applyeffect PARAM2 effects/dot_poison` -> `aplicarEfecto`", () => {
    // `game_dodamage` de base_monster_shared.script:1327-1340: si
    // `NPC_DOT_POISON`, `applyeffect PARAM2 effects/dot_poison 10.0
    // $get(ent_me,id) L_DOT`. Lo pone el evento `add_dot_poison` del propio
    // mod (monsters/externals.script:1342-1345), que un mapa pide con los
    // `params` de `game_postspawn` y que aquí se llama por su nombre: el
    // camino de los `params` lo corta hoy `G_MAP_ADDPARAMS`, una global del
    // GAME_MASTER que no corre (ver doc/BICHOS_GUION_91.md §5). Lo demás es
    // el camino del juego: la caza muerde, la costura avisa, el guion aplica.
    const pedidos = [];
    const { inter, g, correr } = montar("monsters/giantrat", {
      aplicarEfecto: (ruta, params, o) => { pedidos.push({ ruta, params, aplicador: o?.aplicador ?? null }); return null; },
    });
    inter.paso(0);
    g().llamar("add_dot_poison", []);
    assert.equal(g().guion.buscarVar("NPC_DOT_POISON")?.valor, "1");
    correr(20);
    const unos = del(g(), "game_dodamage").filter((r) => r.params[0] === "1").length / 2;
    assert.ok(unos > 0, "tiene que haber entrado algún mordisco");
    assert.equal(pedidos.length, unos, "un veneno por mordisco que entra, y ninguno por los que fallan");
    assert.equal(pedidos[0].ruta, "effects/dot_poison");
    assert.equal(pedidos[0].params[0], "10.0", "los diez segundos del veneno");
  });

  test("CONTROL NEGATIVO: la misma rata sin `add_dot_poison` muerde y no envenena", () => {
    const pedidos = [];
    const { inter, g, correr } = montar("monsters/giantrat", { aplicarEfecto: (r) => { pedidos.push(r); return null; } });
    inter.paso(0);
    correr(20);
    assert.ok(del(g(), "game_dodamage").some((r) => r.params[0] === "1"));
    assert.equal(pedidos.length, 0);
  });

  test("`ent_laststruckbyme` es el jugador desde que el bicho le pega (giattack.cpp:1754-1756)", () => {
    const { inter, g, correr } = montar("monsters/giantrat");
    inter.paso(0);
    assert.equal(g().entorno.propiedad("ent_laststruckbyme", "isplayer"), "0", "antes de pegarle, nadie");
    correr(20);
    assert.equal(g().entorno.propiedad("ent_laststruckbyme", "isplayer"), "1");
  });

  test("`$get(ent_me,dmgmulti)` contesta con el «%.2f» de `RETURN_FLOAT` (scriptcmds.cpp:1478)", () => {
    const { inter, g } = montar("monsters/giantrat");
    inter.paso(0);
    assert.equal(g().guion.resolver("$get(ent_me,dmgmulti)"), "1.00");
  });
});
