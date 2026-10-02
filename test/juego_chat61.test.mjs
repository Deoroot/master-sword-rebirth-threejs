// LA REGLA DEL CHAT. Módulo: `src/play/chat.js`.
//
// Lo que estas pruebas defienden es lo que un port se salta sin darse cuenta:
// que «hablar» en Master Sword son **tres canales con tres frases distintas**,
// y no un color. Si alguien simplifica `frase()` a «Nombre: texto» para los
// tres, todo sigue funcionando y el juego deja de ser el juego.
//
// Lo que aquí NO se puede medir, y por eso hay una sonda: que la frase salga
// en la caja de la izquierda y no en la consola de sucesos de la derecha. Es
// el enrutado, la lección del 60, y ninguna prueba de la regla lo ve.

import test, { describe } from "node:test";
import assert from "node:assert/strict";

import {
  HABLA, NOMBRE_DE_HABLA, COLORES_DE_HABLA, TECLAS_DE_HABLA, MAX_LETRAS,
  RANGO_LOCAL, CORRAL,
  puedeMandar, colorDeHabla, iconoDeHabla, sinComillas, tieneContenido,
  frase, tipoEnElCable, loOye, distancia2D, avisoDeCanal, hablar,
  dentroDelCorral,
} from "../src/play/chat.js";

describe("las cifras, tal como las declara el mod", () => {
  test("`enum saytext_e` en el orden del cable — saytext.h:3-9", () => {
    assert.equal(HABLA.GLOBAL, 0);
    assert.equal(HABLA.LOCAL, 1);
    assert.equal(HABLA.PARTY, 2);
    assert.equal(HABLA.NPC, 3);
    assert.deepEqual(NOMBRE_DE_HABLA, ["global", "local", "party", "npc"]);
  });

  test("`#define SPEECH_LOCAL_RANGE 300` — msmonster.h:79", () => {
    assert.equal(RANGO_LOCAL, 300);
  });

  test("`m_MaxLetters = 120` — vgui_startsaytext.h:31", () => {
    assert.equal(MAX_LETRAS, 120);
  });

  test("la caja de UTIL_EntitiesInBox: 6 000 y 255 — msmonsterserver.cpp:1652", () => {
    assert.equal(CORRAL.radio, 6000);
    assert.equal(CORRAL.maxEntidades, 255);
  });

  test("las tres teclas son las de config.cfg, no unas inventadas", () => {
    assert.equal(TECLAS_DE_HABLA.KeyY, HABLA.GLOBAL);   // config.cfg:32
    assert.equal(TECLAS_DE_HABLA.KeyU, HABLA.LOCAL);    // config.cfg:28
    assert.equal(TECLAS_DE_HABLA.KeyJ, HABLA.PARTY);    // config.cfg:23
  });

  test("los cuatro colores — vgui_hud.cpp:474-482", () => {
    assert.deepEqual(COLORES_DE_HABLA.global.rgb, [255, 255, 255]);
    assert.deepEqual(COLORES_DE_HABLA.local.rgb, [255, 178, 0]);
    assert.deepEqual(COLORES_DE_HABLA.party.rgb, [60, 200, 20]);
    assert.deepEqual(COLORES_DE_HABLA.npc.rgb, [255, 178, 0]);
  });

  test("local y NPC comparten color: lo que los distingue es la frase", () => {
    assert.equal(colorDeHabla("local"), colorDeHabla("npc"));
    assert.notEqual(colorDeHabla("local"), colorDeHabla("global"));
  });

  test("el icono por omisión es el de gritar — vgui_startsaytext.h:37", () => {
    assert.equal(iconoDeHabla(HABLA.GLOBAL), "hud_shout");
    assert.equal(iconoDeHabla(HABLA.LOCAL), "hud_talk");
    assert.equal(iconoDeHabla(HABLA.PARTY), "hud_party");
  });
});

describe("la frase, letra por letra", () => {
  test("global lleva prefijo y dos puntos", () => {
    assert.equal(frase("Ana", "hola", HABLA.GLOBAL), "[global] Ana: hola\n");
  });

  test("party lleva su propio prefijo", () => {
    assert.equal(frase("Ana", "hola", HABLA.PARTY), "[party] Ana: hola\n");
  });

  test("LOCAL NO lleva prefijo: lleva el verbo y las comillas", () => {
    assert.equal(frase("Ana", "hola", HABLA.LOCAL), 'Ana says,  "hola"\n');
  });

  // ESTO ES UNA ERRATA DEL MOD Y SE PORTA CON EL FALLO.
  //
  // `"%s says,  \"%s\"\n"` — msmonsterserver.cpp:1632. Dos espacios detrás de
  // la coma. Quien escriba esta línea de memoria pondrá uno, el juego seguirá
  // funcionando y la pantalla dejará de ser la del juego. Por eso hay una
  // prueba que sólo mira eso.
  test("y DOS espacios detrás de la coma, que es como está escrito", () => {
    assert.ok(frase("Ana", "x", HABLA.LOCAL).includes("says,  \""));
    assert.ok(!frase("Ana", "x", HABLA.LOCAL).includes("says, \"x"));
  });

  test("las tres acaban en salto de línea, que es parte de la frase", () => {
    for (const t of [HABLA.GLOBAL, HABLA.LOCAL, HABLA.PARTY]) {
      assert.ok(frase("Ana", "hola", t).endsWith("\n"), `tipo ${t}`);
    }
  });

  test("un NPC en local se escribe igual que un jugador en local", () => {
    assert.equal(frase("Krythos", "hi", HABLA.NPC), frase("Krythos", "hi", HABLA.LOCAL));
  });

  test("y las tres son distintas entre sí: no es «un color»", () => {
    const tres = new Set([HABLA.GLOBAL, HABLA.LOCAL, HABLA.PARTY].map((t) => frase("Ana", "hola", t)));
    assert.equal(tres.size, 3);
  });
});

describe("lo que se descarta antes de hablar", () => {
  test("las comillas de fuera se quitan — msmonsterserver.cpp:1593", () => {
    assert.equal(sinComillas('"hola"'), "hola");
  });

  test("la de atrás SÓLO se quita si había una delante", () => {
    assert.equal(sinComillas('hola"'), 'hola"');
    assert.equal(sinComillas('"hola'), "hola");
  });

  test("una comilla sola se queda: `strlen > 1`", () => {
    assert.equal(sinComillas('"'), '"');
  });

  test("hace falta un imprimible que no sea espacio", () => {
    assert.equal(tieneContenido("hola"), true);
    assert.equal(tieneContenido("   "), false);
    assert.equal(tieneContenido(""), false);
    assert.equal(tieneContenido("\t\n "), false);
    assert.equal(tieneContenido("."), true);
  });

  test("un cliente no puede mandar el tipo de los NPC", () => {
    assert.equal(puedeMandar(HABLA.GLOBAL), true);
    assert.equal(puedeMandar(HABLA.LOCAL), true);
    assert.equal(puedeMandar(HABLA.PARTY), true);
    assert.equal(puedeMandar(HABLA.NPC), false);
    assert.equal(puedeMandar(-1), false);
    assert.equal(puedeMandar(1.5), false);
    assert.equal(puedeMandar("1"), false);
  });

  test("y el tipo del cable se decide con IsPlayer(), no con la tecla", () => {
    assert.equal(tipoEnElCable(HABLA.LOCAL, true), HABLA.LOCAL);
    assert.equal(tipoEnElCable(HABLA.LOCAL, false), HABLA.NPC);
    assert.equal(tipoEnElCable(HABLA.GLOBAL, false), HABLA.GLOBAL);
  });
});

describe("quién lo oye, en el orden del motor", () => {
  test("el que habla se oye SIEMPRE, antes de mirar nada más", () => {
    assert.equal(loOye(HABLA.LOCAL, { esElQueHabla: true, distancia2D: 99999 }), true);
    assert.equal(loOye(HABLA.PARTY, { esElQueHabla: true, mismoEquipo: false }), true);
  });

  test("local llega a 300 y no a 301", () => {
    assert.equal(loOye(HABLA.LOCAL, { distancia2D: 300 }), true);
    assert.equal(loOye(HABLA.LOCAL, { distancia2D: 300.001 }), false);
  });

  test("global no mira la distancia", () => {
    assert.equal(loOye(HABLA.GLOBAL, { distancia2D: 5999 }), true);
  });

  test("party mira el equipo, y sólo si quien habla es un jugador", () => {
    assert.equal(loOye(HABLA.PARTY, { mismoEquipo: false, hablaUnJugador: true }), false);
    assert.equal(loOye(HABLA.PARTY, { mismoEquipo: true, hablaUnJugador: true }), true);
    assert.equal(loOye(HABLA.PARTY, { mismoEquipo: false, hablaUnJugador: false }), true);
  });

  test("un guion puede cambiar el rango — npcscript.cpp:732", () => {
    assert.equal(loOye(HABLA.LOCAL, { distancia2D: 500, rango: 1000 }), true);
  });

  // LA ALTURA NO CUENTA. `Length2D()`, msmonsterserver.cpp:1714.
  test("la distancia es del plano: tres pisos arriba te oyen hablar bajito", () => {
    assert.equal(distancia2D([0, 0, 0], [0, 4000, 0]), 0);
    assert.equal(distancia2D([3, 999, 4]), 5);
  });

  test("y el corral: fuera de la caja no se oye ni el global", () => {
    assert.equal(dentroDelCorral([0, 0, 0]), true);
    assert.equal(dentroDelCorral([6000, 0, 0]), true);
    assert.equal(dentroDelCorral([6001, 0, 0]), false);
    assert.equal(dentroDelCorral(null), false);
  });
});

describe("`hablar`: el camino entero del servidor", () => {
  const tres = [
    { id: "ana", pies: [0, 0, 0], equipo: "a" },
    { id: "beto", pies: [100, 0, 0], equipo: "a" },
    { id: "cid", pies: [5000, 0, 0], equipo: "b" },
  ];
  const decir = (tipo, extra = {}) => hablar({
    nombre: "Ana", texto: "hola", tipo, oyentes: tres,
    quienHabla: "ana", pies: [0, 0, 0], equipo: "a", ...extra,
  });

  test("global llega a los tres", () => {
    assert.deepEqual(decir(HABLA.GLOBAL).para, ["ana", "beto", "cid"]);
  });

  test("local llega a los dos de cerca", () => {
    assert.deepEqual(decir(HABLA.LOCAL).para, ["ana", "beto"]);
  });

  test("party llega a los del equipo", () => {
    assert.deepEqual(decir(HABLA.PARTY).para, ["ana", "beto"]);
  });

  test("y la frase que sale es la del canal", () => {
    assert.equal(decir(HABLA.LOCAL).texto, 'Ana says,  "hola"\n');
    assert.equal(decir(HABLA.GLOBAL).texto, "[global] Ana: hola\n");
  });

  test("un texto vacío no se manda: devuelve null", () => {
    assert.equal(decir(HABLA.GLOBAL, { texto: "   " }), null);
    assert.equal(decir(HABLA.GLOBAL, { texto: "" }), null);
  });

  test("y un tipo que un cliente no puede mandar, tampoco", () => {
    assert.equal(decir(HABLA.NPC), null);
    assert.equal(decir(7), null);
  });

  test("un NPC SÍ puede hablar de NPC: la puerta es para los clientes", () => {
    const r = hablar({
      nombre: "Krythos", texto: "hi", tipo: HABLA.LOCAL, esJugador: false,
      oyentes: tres, quienHabla: "krythos", pies: [0, 0, 0],
    });
    assert.equal(r.tipo, HABLA.NPC);
    assert.equal(r.texto, 'Krythos says,  "hi"\n');
  });

  test("las comillas de fuera se quitan antes de armar la frase", () => {
    assert.equal(decir(HABLA.GLOBAL, { texto: '"hola"' }).texto, "[global] Ana: hola\n");
  });

  // EL CONTROL POSITIVO DEL LOCAL, que si no mide «no llegó» sin más.
  //
  // Sin esto, «cid no oye el local» pasaría igual si `hablar` devolviera
  // siempre una lista vacía. Se mueve a cid a tiro y tiene que aparecer.
  test("y cid oye el local en cuanto se acerca: el cero tiene control", () => {
    const cerca = [...tres.slice(0, 2), { id: "cid", pies: [200, 0, 0], equipo: "b" }];
    assert.deepEqual(hablar({
      nombre: "Ana", texto: "hola", tipo: HABLA.LOCAL, oyentes: cerca,
      quienHabla: "ana", pies: [0, 0, 0], equipo: "a",
    }).para, ["ana", "beto", "cid"]);
  });

  test("el que habla se oye aunque esté solo", () => {
    assert.deepEqual(hablar({
      nombre: "Ana", texto: "hola", tipo: HABLA.LOCAL,
      oyentes: [{ id: "ana", pies: [0, 0, 0] }], quienHabla: "ana", pies: [0, 0, 0],
    }).para, ["ana"]);
  });
});

describe("el aviso al cambiar de canal — hudmisc.cpp:159-176", () => {
  test("las tres frases, en inglés como el resto de la interfaz", () => {
    assert.equal(avisoDeCanal(HABLA.GLOBAL), "You begin to shout!");
    assert.equal(avisoDeCanal(HABLA.PARTY), "You aim your voice toward your party.");
    assert.equal(avisoDeCanal(HABLA.LOCAL), "You speak normally.");
  });
});
