// LA COSTURA DEL 91, EN EL SERVIDOR — experimento 92, pieza B.
//
// El 91 hizo que el guion de un bicho naciera con él y recibiera sus golpes, y
// lo enchufó en `src/main.js`. Con red la manada vive en `src/red/partida.js`,
// que no enchufaba nada: **con servidor ningún bicho corría guion** y la
// manada lo contaba en `costuraSinOyente` (doc/BICHOS_GUION_91.md §5.1).
//
// TODO ENTRA POR DONDE ENTRA EL SERVIDOR (CLAUDE.md §4, el 59 y el 63): una
// `Partida` de verdad con una `Fauna` de verdad sobre el suelo liso, clientes
// conectados con su buzón, `MENSAJE.ELEGIR` para entrar, `MENSAJE.PEGAR` para
// pegar y `_paso()` —el paso fijo del servidor— para que pase el tiempo.
// Nadie llama a `alCombate`, a `costura` ni a `enchufarA` a mano, y lo que se
// mira es lo que el GUION recibió (`partida.costura()`) y lo que le LLEGA a
// cada cliente por su buzón.
//
// Y con DOS jugadores, que es el caso que sólo existe aquí: el «segundo caso»
// de CLAUDE.md §4. Con uno, «el asa del jugador» y «el asa del que pegó» son
// la misma cadena y el control no puede fallar.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { leerFichaNpc, modeloYAnimaciones, RELACION } from "../src/bsp/script.js";
import { Fauna } from "../src/red/fauna.js";
import { Partida } from "../src/red/partida.js";
import { mundoLiso } from "../src/red/liso.js";
import { AlmacenMemoria } from "../src/juego/almacen.js";
import { MENSAJE, abrir } from "../src/red/protocolo.js";
import { InteraccionesNpc } from "../src/juego/interacciones.js";
import { cargarGuion } from "../tools/scriptsmsr.mjs";

const SCRIPTS = "../MSC/MSCScripts/scripts";
const HAY_MOD = existsSync(SCRIPTS);
const EFECTOS = "build/msr/efectosguion.json";
const JUGADOR = "build/msr/jugador.json";
const HAY_EFECTOS = existsSync(EFECTOS) && existsSync(JUGADOR);
const RATA = "monsters/giantrat";

/** Un dado fijo: dos pasadas dan lo mismo. */
function dado(semilla = 1) {
  let s = semilla >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const SECUENCIAS = [
  { indice: 0, nombre: "idle1", fps: 15, fotogramas: 30, bucle: true, actividad: 1, pesoActividad: 15, avance: [0, 0, 0] },
  { indice: 1, nombre: "walk", fps: 30, fotogramas: 60, bucle: true, actividad: 3, pesoActividad: 1, avance: [-72, 0, 0] },
  { indice: 2, nombre: "run", fps: 30, fotogramas: 25, bucle: true, actividad: 4, pesoActividad: 1, avance: [76, 0, 0] },
  { indice: 3, nombre: "attack", fps: 30, fotogramas: 30, bucle: false, actividad: 28, pesoActividad: 1, avance: [0, 0, 0] },
];

/** Un buzón que guarda todo lo que el servidor le manda a ESE cliente. */
function buzon() {
  const dentro = [];
  return {
    dentro,
    enviar: (t) => dentro.push(abrir(t)),
    al: () => () => {},
    textos: () => dentro.filter((m) => m.t === MENSAJE.TEXTO).map((m) => m.texto),
  };
}

/**
 * Una partida con UNA rata del mod a 1,2 m del punto de aparición, con su
 * relación horneada (la rata RECELA del humano: no muerde por verte, el 82).
 *
 * `guiones` a `false` es la partida de antes del 62 —sin conversaciones—, que
 * es el control de que sin guiones no hay costura que enchufar.
 */
async function montar({ guiones = true, efectos = false, params = null, jugadores = ["Ana"] } = {}) {
  const ficha = modeloYAnimaciones(leerFichaNpc(SCRIPTS, RATA));
  const censo = {
    mapa: "liso", unidadesPorMetro: 39.37, razas: [], modelos: [{ clave: "b", carpeta: "x" }],
    colocados: [{
      clase: "msmonster_giantrat", script: RATA, clave: "b", nombre: ficha.nombre ?? "Giant Rat", hp: ficha.hp ?? 10,
      ancho: ficha.ancho, alto: ficha.alto, parado: "idle1", andando: "walk", piel: 0,
      // A −1,2 m y no a +1,2 (el 92, pieza D). El segundo jugador aparece en
      // x = 1,28 m, o sea DENTRO de la rata si se la pone a +1,2, y el rayo de
      // `$cansee` sale de su ojo y topa con el cuerpo de Beto: `FMVisible`
      // traza con `dont_ignore_monsters` (combat.cpp:1216-1246), así que eso es
      // «no te veo», y es lo que hace el motor. Hasta el 92 no se notaba porque
      // la rata salía con `tieneQueVerte: false` —leído de `set_blind_attack`,
      // un evento que no corre (doc/FICHAS_92.md)— y mordía sin mirar.
      escena: [-1.2, 0, 0], yaw: 0, luz: [0, 0, 0], hostil: false,
      relacion: ficha.relacion ?? RELACION.RECELO, ia: { ...ficha.ia },
    }],
  };
  const mundo = await mundoLiso();
  const fauna = new Fauna({
    censo, mundo, azar: dado(7),
    secuenciasPorClave: new Map([["b", SECUENCIAS]]),
    cajasPorClave: new Map([["b", { min: [-16, -16, 0], max: [16, 16, 32] }]]),
  });
  const partida = new Partida({
    mundo, almacen: new AlmacenMemoria(), fauna, ahora: () => 0,
    aparicion: { mapa: "liso", nacimiento: { nombre: "el centro", escena: [0, 0.1, 0] } },
    guiones: guiones ? { guiones: { [RATA]: cargarGuion(RATA) } } : null,
    efectos: efectos ? JSON.parse(readFileSync(EFECTOS, "utf8")) : null,
    fichaDelJugador: efectos ? JSON.parse(readFileSync(JUGADOR, "utf8")) : null,
    paramsDeBicho: params,
  });
  const quienes = [];
  for (const nombre of jugadores) {
    const b = buzon();
    const c = partida.conectar(b, { nombre });
    await c.sesion.arrancar();
    const p = await c.sesion.crear({ nombre, genero: "female" });
    await partida.recibir(c.id, { t: MENSAJE.ELEGIR, id: p.id });
    quienes.push({ c, b, p });
  }
  const rata = fauna.manada.instancias[0];
  const pasar = (segundos) => { for (let k = 0; k < Math.round(segundos * 100); k++) partida._paso(); };
  const pegar = (q, dano = 1) => partida.recibir(q.c.id, {
    t: MENSAJE.PEGAR, id: rata.id, dano, alcance: 60, cubo: "swordsmanship.0", tipo: "slash",
  });
  const suya = () => partida.costura().bichos.find((x) => x.id === rata.id) ?? null;
  return { partida, fauna, rata, quienes, pasar, pegar, suya };
}

// ── LA COSTURA ESTÁ ENCHUFADA ──────────────────────────────────────────────

describe("la manada del servidor tiene oyente (doc/BICHOS_GUION_91.md §5.1)", { skip: !HAY_MOD }, () => {
  test("con guiones, la partida enchufa SU manada y el bicho de combate nace con guion y cierre", async () => {
    const { partida, fauna, pasar, suya } = await montar();
    assert.equal(partida.costura().enchufada, true);
    assert.equal(partida.interacciones.manadaEnchufada, fauna.manada, "la manada de ESTA partida, no otra");
    pasar(0.1);
    const s = suya();
    assert.ok(s, "la rata tiene guion en el servidor sin que nadie le haya hablado");
    assert.equal(s.conCierre, true);
    assert.ok((partida.costura().nacidos ?? 0) >= 1);
  });

  test("y un golpe le llega: `game_damaged`, `game_damaged_end` y `game_struck`, uno cada uno", async () => {
    const { fauna, quienes, pasar, pegar, suya } = await montar();
    pasar(0.1);
    const r = await pegar(quienes[0]);
    assert.equal(r.vale, true, "el golpe ha entrado (control: si no entra, no hay nada que contar)");
    const s = suya();
    assert.equal(s.recibidos.game_damaged, 1);
    assert.equal(s.recibidos.game_damaged_end, 1);
    assert.equal(s.recibidos.game_struck, 1);
    assert.equal(fauna.manada.costuraSinOyente, 0, "ningún suceso de combate se ha quedado sin oyente");
  });

  test("CONTROL NEGATIVO: sin guiones no hay costura, y el golpe se cuenta en `costuraSinOyente`", async () => {
    // Es la partida de las pruebas del 27/28 y la del servidor sin
    // `guiones.json`: tiene que seguir siendo posible, y el hueco se cuenta.
    const { partida, fauna, quienes, pasar, pegar } = await montar({ guiones: false });
    pasar(0.1);
    await pegar(quienes[0]);
    assert.equal(partida.interacciones, null);
    assert.equal(partida.costura().enchufada, false);
    assert.ok(fauna.manada.costuraSinOyente >= 1);
  });
});

// ── QUIÉN ES QUIÉN, CON DOS ────────────────────────────────────────────────

describe("con dos jugadores, el guion sabe CUÁL le ha pegado y a CUÁL muerde", { skip: !HAY_MOD }, () => {
  test("`game_damaged` lleva el asa del que pega: la de Beto si pega Beto, la de Ana si pega Ana", async () => {
    // El segundo caso: con un jugador, «el asa del jugador» y «el asa del que
    // pegó» son la misma y un control así no puede fallar (el 50).
    const { quienes, pasar, pegar, suya } = await montar({ jugadores: ["Ana", "Beto"] });
    const [ana, beto] = quienes;
    pasar(0.1);
    await pegar(beto);
    assert.equal(suya().damaged[0], beto.p.id, "PARAM1 = atacante (msmonsterserver.cpp:2285)");
    assert.equal(suya().damaged[4], beto.p.id, "PARAM5, el inflictor, va con el atacante (aproximación del 91)");
    await pegar(ana);
    assert.equal(suya().damaged[0], ana.p.id);
    assert.notEqual(ana.p.id, beto.p.id, "control: los dos asas son distintas");
  });

  test("la rata devuelve el golpe AL QUE LE PEGÓ, y su `game_dodamage` lleva el asa de ése", async () => {
    // Antes del 92 `Fauna.pegar` le pasaba a la manada el HUECO (un número) y
    // la manada conoce a los jugadores por «j3»: `apuntarA(1)` no encontraba
    // a nadie y la rata no mordía nunca en el servidor.
    const { rata, quienes, pasar, pegar, suya } = await montar({ jugadores: ["Ana", "Beto"] });
    const [ana, beto] = quienes;
    pasar(0.1);
    const vidaBeto = beto.c.sesion.personaje.vida;
    await pegar(ana);
    assert.equal(rata.cazador.objetivo, `j${ana.c.id}`, "le apunta con el id que la manada conoce");
    pasar(10);
    const s = suya();
    assert.ok((s.recibidos.game_dodamage ?? 0) >= 1, "la rata ha intentado morder");
    assert.equal(s.dodamage[1], ana.p.id, "PARAM2 = el objetivo, Ana (giattack.cpp:2036-2045)");
    assert.equal(beto.c.sesion.personaje.vida, vidaBeto, "a Beto, que no le pegó, no le ha tocado");
  });

  test("CONTROL NEGATIVO: sin que nadie le pegue, 10 s a su lado y la rata no muerde a nadie", async () => {
    const { quienes, pasar, suya } = await montar({ jugadores: ["Ana", "Beto"] });
    const vidas = quienes.map((q) => q.c.sesion.personaje.vida);
    pasar(10);
    assert.equal(suya()?.recibidos?.game_dodamage ?? 0, 0);
    assert.deepEqual(quienes.map((q) => q.c.sesion.personaje.vida), vidas);
  });

  test("al acabar el evento, «con quién habla el guion» vuelve a ser el de antes (el comercio usa esa casilla)", async () => {
    const { partida, quienes, pasar, pegar } = await montar({ jugadores: ["Ana", "Beto"] });
    pasar(0.1);
    const centinela = { soyElDeAntes: true };
    partida.interacciones.hablandoCon = centinela;
    await pegar(quienes[0]);
    pasar(3);
    assert.equal(partida.interacciones.hablandoCon, centinela);
  });
});

// ── EL VENENO, QUE CAE EN EL SERVIDOR Y SE VE EN UN SOLO CLIENTE ───────────

describe("el veneno de la rata cae en el jugador del servidor y viaja a SU pantalla", { skip: !HAY_MOD || !HAY_EFECTOS }, () => {
  const VENENO = { [RATA]: ["add_dot_poison"] };

  test("Ana le pega, la rata la muerde con veneno: a Ana le llega «You have been poisoned!» y a Beto no", async () => {
    const { partida, quienes, pasar, pegar, suya } = await montar({ efectos: true, params: VENENO, jugadores: ["Ana", "Beto"] });
    const [ana, beto] = quienes;
    pasar(0.1);
    assert.equal(suya().veneno, "1", "el evento del operador ha corrido: `NPC_DOT_POISON` puesto (externals.script:1342-1346)");
    await pegar(ana);
    pasar(12);
    const ef = partida.costura().efectos.find((e) => e.cliente === ana.c.id);
    assert.ok(ef?.aplicados >= 1, `el efecto se aplicó en el anfitrión de Ana: ${JSON.stringify(partida.costura().efectos)}`);
    assert.ok(ef.heridas >= 1, "y el veneno ha mordido por su cuenta (`xdodamage`, base_dot.script:64)");
    assert.ok(ana.b.textos().includes("You have been poisoned!"), ana.b.textos().join(" | "));
    assert.ok(!beto.b.textos().some((t) => /poison/i.test(t)), `Beto no lo ve: ${beto.b.textos().join(" | ")}`);
    assert.equal(partida.costura().efectos.some((e) => e.cliente === beto.c.id), false, "Beto ni tiene anfitrión");
  });

  test("CONTROL NEGATIVO: la misma rata sin el `add_dot_poison` del operador muerde y no envenena", async () => {
    const { partida, quienes, pasar, pegar, suya } = await montar({ efectos: true });
    pasar(0.1);
    await pegar(quienes[0]);
    pasar(12);
    assert.ok((suya().recibidos.game_dodamage ?? 0) >= 1, "control: ha mordido");
    assert.equal(partida.costura().efectos.length, 0);
    assert.ok(!quienes[0].b.textos().includes("You have been poisoned!"));
  });

  // PENDIENTE, NO VERDE: el veneno de la rata hace CERO de daño a un jugador,
  // en el navegador y aquí, porque `game_dodamage` lo calcula con
  // `$get(PARAM2,maxhp)` (base_monster_shared.script:1334) y `GuionDeNpc`
  // contesta «0» para un jugador. Esa respuesta es una lectura del 46 que el 92
  // ha medido como falsa: el jugador ES un `CMSMonster` (player.h:396), así
  // que `pMonster` no es nulo (scriptcmds.cpp:926) y la rama de `maxhp`
  // (:1388-1391) le contesta su `MaxHP()` (player.h:660). Es de
  // `src/play/npcguion.js`, que no es de esta pieza: ver doc/COSTURA_RED_92.md.
  //
  // EL 92, PIEZA A: arreglado en `npcguion.js` (`$get(<jugador>,maxhp)` es
  // ahora `MaxHP()` con «%.2f»; ver la corrección del 92 allí y en
  // `test/juego_menus46.test.mjs`). El `todo` pasa a prueba: la misma partida
  // y el mismo dado, con y sin el veneno, y lo que se compara es la vida que
  // guarda el servidor.
  test("y la vida del servidor baja por el veneno: el 5 % de su `maxhp` (base_monster_shared.script:1334)", async () => {
    const con = await montar({ efectos: true, params: VENENO });
    const sin = await montar({ efectos: true });
    for (const m of [con, sin]) { m.pasar(0.1); await m.pegar(m.quienes[0]); m.pasar(12); }
    assert.equal(con.suya().recibidos.game_dodamage, sin.suya().recibidos.game_dodamage, "control: los mismos mordiscos en las dos");
    const vCon = con.quienes[0].c.sesion.personaje.vida;
    const vSin = sin.quienes[0].c.sesion.personaje.vida;
    assert.ok(vCon < vSin, `con veneno ${vCon}, sin ${vSin}`);
    assert.ok(con.quienes[0].b.textos().some((t) => /hits you: .*poison/.test(t)), con.quienes[0].b.textos().join(" | "));
  });

  test("CONTROL NEGATIVO: sin las tablas de efectos el gancho no se pasa y el guion lo apunta, como antes del 92", async () => {
    const { partida, quienes, pasar, pegar } = await montar({ efectos: false, params: VENENO });
    pasar(0.1);
    await pegar(quienes[0]);
    pasar(12);
    assert.equal(partida.costura().efectos.length, 0);
    assert.ok(!quienes[0].b.textos().includes("You have been poisoned!"));
    const g = partida.interacciones.guionesVivos.get(partida.fauna.manada.instancias[0].id);
    assert.ok(g.guion.noSoportados.some((x) => x.tipo === "applyeffect" && /sin anfitrión/.test(x.nombre)),
      JSON.stringify(g.guion.noSoportados));
  });
});

// ── LA PUERTA DEL DAÑO DE UN EFECTO ────────────────────────────────────────
//
// Hoy NINGÚN camino del juego llega aquí con daño (el veneno de la rata hace
// cero, arriba), así que la puerta se prueba aplicando el veneno del mod con
// los parámetros que le pasaría una rata con el `maxhp` bien leído: el 5 % de
// la vida máxima (base_monster_shared.script:1334-1336). Es la variante del 59
// —el argumento lo pone la prueba— y por eso va APARTE y dicho: lo que se mide
// es la puerta (`_efectoPega`), no quién la llama.

describe("la puerta del daño de un efecto, en el servidor", { skip: !HAY_MOD || !HAY_EFECTOS }, () => {
  test("el veneno resta de la vida DEL SERVIDOR y el «hits you» va sólo a su pantalla", async () => {
    const { partida, quienes, pasar } = await montar({ efectos: true, jugadores: ["Ana", "Beto"] });
    const [ana, beto] = quienes;
    pasar(0.1);
    const antes = ana.c.sesion.personaje.vida;
    const ef = partida._efectosDe(ana.c).efectos.aplicar("effects/dot_poison", ["5.0", "0", "0.4"], {
      aplicador: { id: "0", nombre: "Giant Rat", propiedad: (p) => (p === "name" ? "Giant Rat" : "0") },
    });
    assert.ok(ef, "el efecto existe en la tabla horneada");
    pasar(7);
    const despues = ana.c.sesion.personaje.vida;
    assert.ok(despues < antes, `${antes} → ${despues}`);
    assert.ok(Math.abs((antes - despues) - 0.4 * 5) < 0.41, `cinco mordiscos de 0,4 (±1): ${antes - despues}`);
    assert.ok(ana.b.textos().some((t) => /^Giant Rat hits you: .*poison/.test(t)), ana.b.textos().join(" | "));
    assert.ok(ana.b.textos().includes("The poison subsides."), "y al acabar lo dice (dot_poison.script, `effect_die`)");
    assert.equal(beto.b.textos().length, 0, `a Beto no le llega nada: ${beto.b.textos().join(" | ")}`);
    // Y lo que el cliente ve es la vida de aquí: viaja en la foto.
    const foto = partida.foto(ana.c);
    assert.equal(foto.jugadores.find((j) => j.id === ana.c.id).vida, despues);
  });
});

// ── LA CURA DEL SUMO SACERDOTE, POR EL MENÚ Y POR EL CABLE ─────────────────
//
// El segundo caso del anfitrión de efectos, y éste es un camino ENTERO del
// juego: `MENSAJE.PEDIRMENU` → «Ask to be Healed» → `MENSAJE.ELIGEMENU` →
// `say_heal` → (1 s) `attack_1` → `applyeffect ent_lastspoke
// effects/effect_rejuv2 0 1000 …` (edana/highpriest.script:77-95) → `givehp`.
// Antes del 92, con servidor, el sacerdote decía «let me help you with
// that...» y no curaba: el `aplicarEfecto` del servidor no existía.

const SACERDOTE = "edana/highpriest";
async function conSacerdote({ efectos = true } = {}) {
  const ficha = modeloYAnimaciones(leerFichaNpc(SCRIPTS, SACERDOTE));
  const censo = {
    mapa: "liso", unidadesPorMetro: 39.37, razas: [], modelos: [{ clave: "b", carpeta: "x" }],
    colocados: [{
      clase: "msmonster_highpriest", script: SACERDOTE, clave: "b", nombre: ficha.nombre ?? "High Priest", hp: 100,
      ancho: 32, alto: 72, parado: "idle1", andando: "walk", piel: 0, escena: [1.2, 0, 0], yaw: 0, luz: [0, 0, 0],
      hostil: false, relacion: RELACION.ALIADO, ia: { ...(ficha.ia ?? {}), pasea: false },
    }],
  };
  const mundo = await mundoLiso();
  const fauna = new Fauna({
    censo, mundo, secuenciasPorClave: new Map([["b", SECUENCIAS]]),
    cajasPorClave: new Map([["b", { min: [-16, -16, 0], max: [16, 16, 72] }]]),
  });
  const partida = new Partida({
    mundo, almacen: new AlmacenMemoria(), fauna, ahora: () => 0,
    aparicion: { mapa: "liso", nacimiento: { nombre: "el centro", escena: [0, 0.1, 0] } },
    guiones: { guiones: { [SACERDOTE]: cargarGuion(SACERDOTE) } },
    efectos: efectos ? JSON.parse(readFileSync(EFECTOS, "utf8")) : null,
    fichaDelJugador: efectos ? JSON.parse(readFileSync(JUGADOR, "utf8")) : null,
  });
  const b = buzon();
  const c = partida.conectar(b, { nombre: "Ana" });
  await c.sesion.arrancar();
  const p = await c.sesion.crear({ nombre: "Ana", genero: "female" });
  await partida.recibir(c.id, { t: MENSAJE.ELEGIR, id: p.id });
  const npc = fauna.manada.instancias[0];
  const curarse = async () => {
    await partida.recibir(c.id, { t: MENSAJE.PEDIRMENU, id: npc.id });
    const op = b.dentro.filter((m) => m.t === MENSAJE.OPCIONES).at(-1);
    const k = (op?.opciones ?? []).findIndex((o) => /Heal/.test(o.titulo));
    assert.ok(k >= 0, `el menú trae «Ask to be Healed»: ${JSON.stringify(op?.opciones)}`);
    await partida.recibir(c.id, { t: MENSAJE.ELIGEMENU, id: npc.id, indice: k });
    for (let n = 0; n < 300; n++) partida._paso();
  };
  return { partida, c, b, curarse };
}

describe("la cura del sumo sacerdote, con servidor", { skip: !HAY_MOD || !HAY_EFECTOS }, () => {
  test("herida a 3, pide que la curen y la vida DEL SERVIDOR sube; el mensaje es el del efecto", async () => {
    const { c, b, curarse } = await conSacerdote();
    c.sesion.personaje.vida = 3;
    await curarse();
    assert.ok(c.sesion.personaje.vida > 3, `vida ${c.sesion.personaje.vida}`);
    assert.ok(b.textos().includes("High Priest heals you for 1000 hp"), b.textos().join(" | "));
  });

  test("CONTROL NEGATIVO: sin tablas de efectos el sacerdote habla y no cura (lo de antes del 92)", async () => {
    const { c, b, curarse } = await conSacerdote({ efectos: false });
    c.sesion.personaje.vida = 3;
    await curarse();
    assert.equal(c.sesion.personaje.vida, 3);
    assert.ok(b.textos().some((t) => /let me help you/.test(t)), "control: el guion ha corrido");
  });
});

// ── EN UN NAVEGADOR, NADA CAMBIA ───────────────────────────────────────────

describe("sin `jugadorDe` (un navegador), `alCombate` no toca la casilla de con quién se habla", () => {
  test("el jugador del constructor sigue siendo el de todos los golpes", () => {
    const sesion = { personaje: { id: "P1", nombre: "Ana" } };
    const inter = new InteraccionesNpc({ sesion });
    const centinela = { otro: true };
    inter.hablandoCon = centinela;
    // Un suceso sin guion detrás: sólo se mira que la casilla no se toque.
    inter.alCombate({ que: "recibe", i: { ficha: { ia: { dano: { min: 1, max: 1 } } } }, quien: "jugador" });
    assert.equal(inter.hablandoCon, centinela);
    assert.equal(inter.costura.sinJugador, 0);
  });
});
