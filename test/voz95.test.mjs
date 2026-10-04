// LO QUE DICE EL GUION DE UN NPC, CON SERVIDOR: A QUIÉN LE LLEGA — experimento 95.
//
// Hasta el 94 los ganchos `suceso` y `ventanaDeAviso` de `src/red/partida.js`
// mandaban TODO a `_aQuienHabla()`: el último jugador de la partida que abrió un
// menú, con quien fuera. El 94 lo quitó de `setmovedest` y `$cansee`; éstos
// eran los que quedaban. En el motor son tres reglas distintas:
//
//   `saytext`        `Speak(…, SPEECH_LOCAL)`: a TODOS los que estén a
//                    `Length2D() <= m_SayTextRange` (msmonsterserver.cpp:1712-1716)
//   `saytextrange`   cambia ese alcance; `default` lo devuelve a 300
//                    (npcscript.cpp:724-737; msmonster.h:79)
//   `playermessage`  `RetrieveEntity(Params[0])`, a ése (scriptcmds.cpp:4249)
//   `infomsg`        `all` a todos (svglobals.cpp:346-351); lo demás a uno, y
//                    si no es un jugador, a nadie (scriptcmds.cpp:4064-4075)
//
// TODO ENTRA POR DONDE ENTRA EL SERVIDOR (el 59 y el 63): una `Partida` con su
// `Fauna` sobre el suelo liso, dos clientes que entran con `MENSAJE.ELEGIR` y
// abren menús con `MENSAJE.PEDIRMENU`, y `_paso()`. El guion va como TEXTO al
// analizador (el 67). Lo que se afirma es lo que LLEGA a cada cliente por su
// enlace, no lo que la partida cree haber mandado.
//
// EL SEGUNDO CASO (el 50): Ana abre el menú del pregonero y DESPUÉS Beto el de
// otro NPC, así que `_aQuienHabla()` es Beto y el jugador del pregonero es
// Ana. Con un jugador los dos son la misma persona y nada de esto puede fallar.
//
// LA DISTANCIA (el 71, el 81): el pregonero en x = −3 m, Ana en 0 (118 u), y
// Beto en tres sitios: a 6 m (236 u, dentro de los 300), a 15 m (591 u, fuera
// de 300 y dentro de 1024) y a 28 m (1102 u, fuera de los dos). Los 28 m son
// el control de la trampa del 81: comparando METROS contra 1024, Beto oiría.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import { leerFichaNpc, modeloYAnimaciones } from "../src/bsp/script.js";
import { Fauna } from "../src/red/fauna.js";
import { Partida } from "../src/red/partida.js";
import { mundoLiso } from "../src/red/liso.js";
import { AlmacenMemoria } from "../src/juego/almacen.js";
import { MENSAJE, abrir } from "../src/red/protocolo.js";
import { partirGuion } from "../src/play/guion.js";
import { eventosDeSecuencia } from "../tools/bicho.mjs";
import { leerMdl } from "../src/bsp/mdl.js";
import { leerSecuencias } from "../src/bsp/mdlanim.js";

const SCRIPTS = "../MSC/MSCScripts/scripts";
const MODELOS = "../MSC/assets/msr/models";
const HAY = existsSync(SCRIPTS) && existsSync(MODELOS);
const MODELO_DE = "monsters/spider";
const U = 39.37;

/**
 * EL GUION DEL PREGONERO. Al abrirle el menú, medio segundo después —FUERA del
 * menú, desde un reloj, que es donde `_aQuienHabla()` ya no es quien le habló—
 * dice lo que tiene que decir por cada una de las puertas. Las líneas son las
 * del mod: `saytextrange 1024` + `saytext` (gatecity/guard.script:118-120),
 * `saytextrange default` (edana/towncrier.script:32), `infomsg all`
 * (gatecity/mayor.script:303) y `playermessage ent_lastspoke`.
 */
const GUION = `
{ game_menu_getoptions
	callevent 0.5 habla95
}
{ habla95
	playermessage ent_lastspoke Only for Ana
	infomsg ent_lastspoke Ana only for her
	infomsg all Everyone this goes to both of you
	infomsg ent_me Nobody the npc is not a player
	saytext At the default range
	saytextrange 1024
	saytext At a thousand units
	saytextrange default
	saytext Back to the default
	saytextrange Default
	saytext Capital D is atof zero
	setvard HABLO95 1
}
`;

function secuenciasDelModelo(relativo) {
  const m = leerMdl(`${MODELOS}/${relativo}`);
  return leerSecuencias(m).map((s, k) => ({
    indice: k, nombre: s.nombre, fps: s.fps, fotogramas: Math.max(1, s.nFotogramas), bucle: s.bucle,
    actividad: s.actividad, pesoActividad: s.pesoActividad, avance: s.avance, eventos: eventosDeSecuencia(m, k),
  }));
}

async function montar({ betoEn = 3, betoHabla = true } = {}) {
  const ficha = modeloYAnimaciones(leerFichaNpc(SCRIPTS, MODELO_DE));
  const npc = (escena, nombre, script) => ({
    clase: "msmonster_x", script, clave: "b", nombre, hp: 100,
    ancho: 32, alto: 60, parado: ficha.parado, andando: ficha.andando, piel: 0,
    escena, yaw: 0, luz: [0, 0, 0], hostil: false, relacion: 0,
    ia: { ...ficha.ia, dano: 0, alto: 60, ancho: 32, pasea: false },
  });
  const censo = {
    mapa: "liso", unidadesPorMetro: U, razas: [], modelos: [{ clave: "b", carpeta: "x" }],
    colocados: [npc([-3, 0, 0], "Crier", "prueba/pregonero95"), npc([-40, 40, 0], "Other", "prueba/otro95")],
  };
  const mundo = await mundoLiso();
  let k = 1;
  const azar = () => { k = (k * 1664525 + 1013904223) >>> 0; return k / 4294967296; };
  const fauna = new Fauna({
    censo, mundo, azar,
    secuenciasPorClave: new Map([["b", secuenciasDelModelo(ficha.modelo)]]),
    cajasPorClave: new Map([["b", { min: [-16, -16, 0], max: [16, 16, 60] }]]),
  });
  const partida = new Partida({
    mundo, almacen: new AlmacenMemoria(), fauna, ahora: () => 0,
    aparicion: { mapa: "liso", nacimiento: { nombre: "el centro", escena: [0, 0.1, 0] } },
    guiones: { guiones: {
      "prueba/pregonero95": partirGuion(GUION),
      "prueba/otro95": partirGuion("{ game_menu_getoptions\n\tsetvard NADA 1\n}"),
    } },
  });
  const quienes = [];
  for (const nombre of ["Ana", "Beto"]) {
    const llega = [];
    const b = { enviar: (t) => { const m = abrir(t); if (m.t === MENSAJE.TEXTO) llega.push(m); }, al: () => () => {} };
    const c = partida.conectar(b, { nombre });
    await c.sesion.arrancar();
    const p = await c.sesion.crear({ nombre, genero: "female" });
    await partida.recibir(c.id, { t: MENSAJE.ELEGIR, id: p.id });
    quienes.push({ c, p, llega });
  }
  const [ana, beto] = quienes;
  const [pregonero, otro] = fauna.manada.instancias;
  let seq = 0;
  const sitio = (q) => (q === ana ? [0, 0.1, 0] : [betoEn, 0.1, 0]);
  const pasar = async (segundos) => {
    for (let n = 0; n < Math.round(segundos * 100); n++) {
      partida._paso();
      seq++;
      for (const q of quienes) {
        // Recolocados en cada paso: la separación tiene que valer DURANTE la
        // medida, no sólo al empezar (el 82).
        q.c.cuerpo.colocar(sitio(q));
        await partida.recibir(q.c.id, { t: MENSAJE.ORDENES, ordenes: [{ seq, msec: 10, botones: 0 }] });
      }
    }
  };
  await pasar(0.3);
  await partida.recibir(ana.c.id, { t: MENSAJE.PEDIRMENU, id: pregonero.id });
  if (betoHabla) await partida.recibir(beto.c.id, { t: MENSAJE.PEDIRMENU, id: otro.id });
  // Lo que llegó por el menú no es lo que se mide: se vacía, y se mira lo que
  // trae el reloj.
  ana.llega.length = 0; beto.llega.length = 0;
  const guion = () => partida.interacciones.guionesVivos.get(pregonero.id) ?? null;
  await pasar(1.0);
  return { partida, ana, beto, pregonero, guion };
}

/** Las líneas de la consola de sucesos (`tipo -1`) y las ventanas (`tipo -2`). */
const sucesos = (q) => q.llega.filter((m) => m.tipo === -1).map((m) => m.texto);
const ventanas = (q) => q.llega.filter((m) => m.tipo === -2).map((m) => `${m.titulo}|${m.texto}`);
const dice = (q, frase) => sucesos(q).includes(`Crier says,  "${frase}"`);

describe("con servidor y dos jugadores, lo que dice un guion de NPC va a quien dice el motor", { skip: !HAY }, () => {
  test("CONTROL: el reloj corrió, Beto habló el último y el guion del pregonero es de Ana", async () => {
    const { partida, ana, beto, guion } = await montar();
    assert.equal(guion()?.guion?.vars?.get("HABLO95"), "1", "el reloj del guion corrió fuera del menú");
    assert.equal(partida._aQuienHabla(), beto.c, "si no, el segundo caso no existe y lo de abajo no puede fallar");
    assert.equal(guion().jugador?.ref, String(ana.p.id), "y el jugador del pregonero es Ana");
  });

  test("`playermessage ent_lastspoke` le llega a Ana, que es su jugador, y no a Beto (scriptcmds.cpp:4249)", async () => {
    const { ana, beto } = await montar();
    assert.ok(sucesos(ana).includes("Only for Ana"), sucesos(ana).join(" | "));
    assert.ok(!sucesos(beto).includes("Only for Ana"), sucesos(beto).join(" | "));
  });

  test("`infomsg ent_lastspoke` a Ana; `infomsg all` a los dos, con el texto ENTERO (scriptcmds.cpp:4083-4087)", async () => {
    const { ana, beto } = await montar();
    assert.ok(ventanas(ana).includes("Ana|only for her"), ventanas(ana).join(" · "));
    assert.ok(!ventanas(beto).some((v) => v.startsWith("Ana|")), ventanas(beto).join(" · "));
    for (const q of [ana, beto]) {
      assert.ok(ventanas(q).includes("Everyone|this goes to both of you"), `${q.p.nombre}: ${ventanas(q).join(" · ")}`);
    }
  });

  test("`infomsg ent_me` desde un NPC no le llega a nadie: no es un jugador (scriptcmds.cpp:4075)", async () => {
    const { ana, beto, guion } = await montar();
    for (const q of [ana, beto]) assert.ok(!ventanas(q).some((v) => v.startsWith("Nobody|")), ventanas(q).join(" · "));
    // Y no se pierde callado: se apunta (el `=> {}` del 66).
    assert.ok(guion().guion.noSoportados.some((x) => x.tipo === "infomsg" && x.nombre.startsWith("ent_me")),
      JSON.stringify(guion().guion.noSoportados));
  });

  test("`saytext` es por DISTANCIA y no por quién habló: Beto a 6 m (236 u) lo oye aunque no le habló", async () => {
    const { ana, beto } = await montar({ betoEn: 3 });
    for (const q of [ana, beto]) {
      assert.ok(dice(q, "At the default range"), `${q.p.nombre}: ${sucesos(q).join(" | ")}`);
      assert.ok(dice(q, "Back to the default"), `${q.p.nombre}: ${sucesos(q).join(" | ")}`);
    }
  });

  test("`saytextrange 1024`: Beto a 15 m (591 u) oye la frase de 1024 y NO las de 300 (npcscript.cpp:724-737)", async () => {
    const { ana, beto, partida } = await montar({ betoEn: 12 });
    assert.ok(dice(beto, "At a thousand units"), sucesos(beto).join(" | "));
    assert.ok(!dice(beto, "At the default range"), "a 591 u el alcance de 300 no llega");
    assert.ok(!dice(beto, "Back to the default"), "`saytextrange default` lo devuelve a 300");
    // Y Ana, a 118 u, las tres.
    for (const f of ["At the default range", "At a thousand units", "Back to the default"]) assert.ok(dice(ana, f), f);
    assert.equal(partida.voz.sinSitio, 0);
  });

  test("LA TRAMPA DEL 81: Beto a 28 m (1102 u) no oye ni la de 1024 — comparando metros, la oiría", async () => {
    const { ana, beto } = await montar({ betoEn: 25 });
    assert.ok(dice(ana, "At a thousand units"), "control positivo: la frase se dijo");
    assert.ok(!dice(beto, "At a thousand units"), sucesos(beto).join(" | "));
  });

  test("`saytextrange Default` (con mayúscula) es `atof` = 0: no lo oye ni Ana a 118 u (stackstring.cpp:54)", async () => {
    const { ana, beto, guion } = await montar();
    assert.ok(dice(ana, "Back to the default"), "control positivo: la de antes sí llegó");
    for (const q of [ana, beto]) assert.ok(!dice(q, "Capital D is atof zero"), `${q.p.nombre}`);
    assert.equal(guion().entorno.alcanceDeVoz, 0);
  });

  test("lo que Ana dice por el chat local le vuelve a SU consola, no a la de Beto, que abrió el último menú", async () => {
    const { partida, ana, beto } = await montar({ betoEn: 25 });
    ana.llega.length = 0; beto.llega.length = 0;
    await partida.recibir(ana.c.id, { t: MENSAJE.DECIR, tipo: 1, texto: "good day" });
    const eco = (q) => sucesos(q).some((t) => t.startsWith("Ana says"));
    assert.ok(eco(ana), `Ana: ${sucesos(ana).join(" | ")}`);
    assert.ok(!eco(beto), `Beto, a 28 m: ${sucesos(beto).join(" | ")}`);
  });

  test("con UN jugador hablando (sin el segundo caso) todo le llega a Ana: el control que no puede fallar", async () => {
    const { ana } = await montar({ betoHabla: false, betoEn: 25 });
    assert.ok(sucesos(ana).includes("Only for Ana"));
    assert.ok(dice(ana, "At a thousand units"));
  });
});

// ── EL MENÚ QUE DEJABA AL JUGADOR EN «0» — también del 95 ───────────────────
//
// `GuionDeNpc.pedirOpciones` tenía `origen = "0"` por omisión y nadie le pasa
// `origen`, así que abrir el menú de un NPC dejaba la posición del jugador
// clavada en «0» en ESE guion, y su `$cansee(player,128)` salía «sin sitios»
// para siempre. Con el guion de verdad de Sylphiel (Edana, horneado) y por la
// puerta del servidor: F, cancelar, y pedirle trabajo por el chat local.

const BICHOS_EDANA = "build/edana/bichos.json";
const GUIONES_EDANA = "build/edana/guiones.json";
const HAY_EDANA = existsSync(BICHOS_EDANA) && existsSync(GUIONES_EDANA);

async function sylphiel({ abrirMenu }) {
  const { readFileSync } = await import("node:fs");
  const b = JSON.parse(readFileSync(BICHOS_EDANA, "utf8"));
  const guiones = JSON.parse(readFileSync(GUIONES_EDANA, "utf8"));
  const c = b.colocados.find((x) => x.script === "edana/barwench");
  const sec = [{ indice: 0, nombre: "idle1", fps: 15, fotogramas: 30, bucle: true, actividad: 1, pesoActividad: 1, avance: [0, 0, 0] }];
  const censo = {
    mapa: "liso", unidadesPorMetro: b.unidadesPorMetro, razas: b.razas,
    modelos: b.modelos.filter((m) => m.clave === c.clave), colocados: [{ ...c, aparecedor: null, escena: [-2, 0, 0] }],
  };
  const mundo = await mundoLiso();
  const fauna = new Fauna({
    censo, mundo, secuenciasPorClave: new Map([[c.clave, sec]]),
    cajasPorClave: new Map([[c.clave, { min: [-16, -16, 0], max: [16, 16, 72] }]]), azar: () => 0.5,
  });
  const partida = new Partida({
    mundo, almacen: new AlmacenMemoria(), fauna, ahora: () => 0, guiones,
    aparicion: { mapa: "liso", nacimiento: { nombre: "c", escena: [0, 0.1, 0] } },
  });
  const llega = [];
  const cl = partida.conectar({ enviar: (t) => { const m = abrir(t); if (m.t === MENSAJE.TEXTO) llega.push(m); }, al: () => () => {} });
  await cl.sesion.arrancar();
  const p = await cl.sesion.crear({ nombre: "Ana", genero: "female" });
  await partida.recibir(cl.id, { t: MENSAJE.ELEGIR, id: p.id });
  for (let k = 0; k < 30; k++) partida._paso();
  const ella = fauna.manada.instancias[0];
  if (abrirMenu) {
    await partida.recibir(cl.id, { t: MENSAJE.PEDIRMENU, id: ella.id });
    await partida.recibir(cl.id, { t: MENSAJE.ELIGEMENU, id: ella.id, indice: null });
  }
  await partida.recibir(cl.id, { t: MENSAJE.DECIR, tipo: 1, texto: "job" });
  const g = partida.interacciones.guionesVivos.get(ella.id);
  return { llega, g };
}

describe("abrir el menú de un NPC no deja al jugador en «0» para su guion", { skip: !HAY_EDANA }, () => {
  const tarea = (llega) => llega.some((m) => m.tipo === -1 && /I have a task for you/.test(m.texto));

  test("CONTROL: sin abrir el menú, «job» por el chat hace contestar a Sylphiel (su `$cansee(player,128)` ve a Ana)", async () => {
    const { llega } = await sylphiel({ abrirMenu: false });
    assert.ok(tarea(llega), llega.map((m) => m.texto).join(" | "));
  });

  test("abriendo y cerrando ANTES su menú, también — antes del 95 su `say_job` se abandonaba «sin sitios»", async () => {
    const { llega, g } = await sylphiel({ abrirMenu: true });
    assert.ok(tarea(llega), llega.map((m) => m.texto).join(" | "));
    assert.ok(!g.guion.noSoportados.some((x) => x.nombre === "$cansee sin sitios"), JSON.stringify(g.guion.noSoportados));
  });
});
