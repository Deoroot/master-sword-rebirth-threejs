// LO QUE EL GUION LE HACE A LA VISTA, Y LOS EVENTOS QUE NADIE LLAMABA — el 65.
//
// El 64 montó el guion del jugador y disparó dos eventos. El censo de después
// dijo lo incómodo: **21 de los 40 eventos del motor que el guion trae ya
// corrían enteros**, y este puerto llamaba a dos. O sea que la mayor parte de
// lo que faltaba no era portar comandos: era **llamar**.
//
// Aquí se comprueban los cuatro que se han enganchado y el contrato por el que
// el guion mueve la cámara, que no es una llamada sino una variable.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { desplazamientoDeVista, EJES_POS, EJES_ANG } from "../src/play/efectosdeguion.js";
import { GuionDelJugador, EVENTOS_DEL_JUGADOR } from "../src/play/guionjugador.js";

// ── 1. EL CONTRATO DE `game.cleffect.*` ────────────────────────────────────

describe("el guion mueve la vista escribiendo variables (65)", () => {
  /** Un lector de mentira: sólo existe lo que está en el mapa. */
  const de = (obj) => (n) => (Object.hasOwn(obj, n) ? obj[n] : null);

  test("sin variables no toca nada", () => {
    const r = desplazamientoDeVista(de({}));
    assert.deepEqual(r.pos, { x: 0, y: 0, z: 0 });
    assert.deepEqual(r.ang, { pitch: 0, yaw: 0, roll: 0 });
  });

  test("`_ofs` SUMA, en las dos vistas y en los seis ejes", () => {
    const r = desplazamientoDeVista(de({
      "game.cleffect.view_ofs.z": "-12.5",
      "game.cleffect.view_ofs.pitch": "3",
    }));
    assert.equal(r.pos.z, -12.5);
    assert.equal(r.ang.pitch, 3);
    // Y la del arma es OTRA variable: el guion baja el arma un 1 % más que la
    // vista, y si las dos leyeran lo mismo eso no se podría ver.
    const m = desplazamientoDeVista(de({ "game.cleffect.viewmodel_ofs.z": "-12.6" }), "viewmodel");
    assert.equal(m.pos.z, -12.6);
  });

  test("lo que no es un número vale 0, que es lo que hace `atof`", () => {
    assert.equal(desplazamientoDeVista(de({ "game.cleffect.view_ofs.z": "hola" })).pos.z, 0);
  });

  // ── LA ERRATA, PORTADA A PROPÓSITO ───────────────────────────────────────
  test("`_set` de POSICIÓN comprueba `_set` y lee `_ofs`: la errata del mod", () => {
    // `if( VarExists(name "_set.z") ) vec.z = atof(GetVar(name "_ofs.z"));`
    // hudscript.cpp:39-41. Poner `view_set.z 10` NO pone la vista en 10: la
    // pone en lo que valga `view_ofs.z`. Con `_ofs` a 4, sale 4 y no 10.
    const r = desplazamientoDeVista(de({
      "game.cleffect.view_set.z": "10",
      "game.cleffect.view_ofs.z": "4",
    }));
    assert.equal(r.pos.z, 4, "si sale 10, alguien ha «arreglado» la errata");
    // Y sin `_ofs`, `atof(undefined)` es 0: el `_set` deja la vista en CERO.
    const solo = desplazamientoDeVista(de({ "game.cleffect.view_set.z": "10" }));
    assert.equal(solo.pos.z, 0);
  });

  test("pero el `_set` de ÁNGULO está bien, y por eso se sabe que es errata", () => {
    // hudscript.cpp:47-49: la macro de ángulos lee `_set.pitch`. El mismo
    // patrón escrito dos veces y sólo uno falla. Si estas dos comprobaciones
    // dieran lo mismo, no habría manera de distinguir errata de intención.
    const r = desplazamientoDeVista(de({
      "game.cleffect.view_set.pitch": "10",
      "game.cleffect.view_ofs.pitch": "4",
    }));
    assert.equal(r.ang.pitch, 10);
  });

  test("y los nombres de los ejes son los del motor, no los nuestros", () => {
    assert.deepEqual([...EJES_POS], ["x", "y", "z"]);
    assert.deepEqual([...EJES_ANG], ["pitch", "yaw", "roll"]);
  });
});

// ── 2. LOS EVENTOS, CONTRA EL GUION DE VERDAD ──────────────────────────────

const ficha = (() => {
  try { return JSON.parse(readFileSync("build/msr/jugador.json", "utf8")); }
  catch { return null; }
})();
const hay = Boolean(ficha);

describe("los eventos del motor que el guion ya sabía contestar (65)", () => {
  function unJugador() {
    const dicho = [];
    // EL RELOJ NO EMPIEZA EN CERO, y no es cosmético: el hundimiento de la
    // vista se guarda como `setvard GROUNDBOB_STARTTIME game.time` y el evento
    // siguiente arranca con `if GROUNDBOB_STARTTIME`. Con el reloj en 0 esa
    // condición es falsa y el efecto no ocurre — **igual que en el motor**,
    // donde `gpGlobals->time` vale 0 sólo en el instante de cargar el mapa.
    // Poner 10 es medir el juego y no el primer fotograma.
    let t = 10;
    const g = new GuionDelJugador({
      ficha,
      personaje: { nombre: "Ana", vida: 100, vidaMax: 100, mana: 20, manaMax: 20 },
      suceso: (tipo, texto) => dicho.push({ tipo, texto }),
      consejo: () => {},
      ahora: () => t,
    });
    return { g, dicho, avanzar: (s) => { t += s; return g.paso(s); } };
  }

  test("hay guion horneado: si no, todo lo de abajo se salta", { skip: !hay }, () => {
    assert.ok(ficha.eventos.length > 400);
  });

  test("`game_parry` dice la frase DEL JUEGO, con las dos tiradas", { skip: !hay }, () => {
    // «You parried the blow!» era nuestra. La del juego es otra y lleva los
    // números dentro (`player_main.script`, `game_parry`). El texto no está
    // escrito en esta prueba: si el guion no corriera, no habría de dónde
    // sacarlo.
    const j = unJugador();
    const hubo = j.g.llamar(EVENTOS_DEL_JUGADOR.PARRY, ["Goblin", "7.5", "", "31", "12", "40"]);
    assert.ok(hubo, "ningún evento contestó");
    const m = j.dicho.map((x) => x.texto).join(" | ");
    assert.match(m, /You parry the attack!/);
    assert.match(m, /31/, `no salió la tirada de parry: ${m}`);
    assert.match(m, /12/, `no salió la tirada de acierto: ${m}`);
  });

  test("`game_xpgain` dice «XP Awarded», y en verde", { skip: !hay }, () => {
    // `gplayermessage` es el verde del motor — «has ganado algo».
    const j = unJugador();
    j.g.llamar(EVENTOS_DEL_JUGADOR.EXPERIENCIA, ["25"]);
    const linea = j.dicho.find((x) => /XP Awarded/.test(x.texto));
    assert.ok(linea, `no salió: ${JSON.stringify(j.dicho)}`);
    assert.match(linea.texto, /25/);
    assert.equal(linea.tipo, "bueno");
  });

  test("`game_damaged` se apunta quién te pegó, que es lo que leen los demás", { skip: !hay }, () => {
    const j = unJugador();
    j.g.llamar(EVENTOS_DEL_JUGADOR.DANADO, ["Goblin", "7.5"]);
    assert.equal(j.g.guion.vars.get("PL_BEEN_ATTACKED"), "1");
    assert.equal(j.g.guion.vars.get("LAST_STRUCK_FOR"), "7.5");
  });

  // ── EL ATERRIZAJE, QUE ES EL QUE JUNTA LAS DOS MITADES ───────────────────
  test("una caída fuerte hunde la vista, y una suave NO", { skip: !hay }, () => {
    // `L_DIP = PARAM1 * 0.05`, `if L_DIP >= 12` — o sea **240 u/s**. Y el
    // parámetro es `flFallVelocity` tal cual (pm_shared.cpp:2938-2944).
    //
    // El control negativo va al lado y hace falta: sin él, «la vista se ha
    // movido» pasaría igual si se moviera SIEMPRE.
    const suave = unJugador();
    suave.g.llamar(EVENTOS_DEL_JUGADOR.SUELO, ["100"]);
    suave.avanzar(0.05);
    assert.equal(suave.g.vista("view").pos.z, 0, "un saltito no debería mover la cámara");

    const fuerte = unJugador();
    fuerte.g.llamar(EVENTOS_DEL_JUGADOR.SUELO, ["500"]);
    fuerte.avanzar(0.05);
    assert.ok(fuerte.g.vista("view").pos.z < 0, "una caída de 500 u/s no hundió la vista");
  });

  test("y el arma baja MÁS que la vista: es el 1 % del guion", { skip: !hay }, () => {
    // `multiply LCL_BOBAMT 1.01` entre las dos escrituras. Es del guion, no
    // del motor, y es lo que hace que el modelo se hunda un pelo respecto a la
    // pantalla.
    const j = unJugador();
    j.g.llamar(EVENTOS_DEL_JUGADOR.SUELO, ["500"]);
    j.avanzar(0.05);
    const vista = j.g.vista("view").pos.z;
    const arma = j.g.vista("viewmodel").pos.z;
    assert.ok(vista < 0 && arma < 0, `vista ${vista} arma ${arma}`);
    assert.ok(Math.abs(arma) > Math.abs(vista), `el arma (${arma}) no baja más que la vista (${vista})`);
  });

  test("y la vista vuelve sola: nadie tiene que cancelarla", { skip: !hay }, () => {
    // Es la consecuencia de que sea una interfaz por variable: el guion se
    // reprograma cada 0,01 s y acaba escribiendo un cero. Si hubiera que
    // cancelarlo desde fuera, olvidarse dejaría la cámara torcida para siempre.
    const j = unJugador();
    j.g.llamar(EVENTOS_DEL_JUGADOR.SUELO, ["500"]);
    j.avanzar(0.05);
    assert.ok(j.g.vista("view").pos.z < 0);
    for (let i = 0; i < 400; i++) j.avanzar(0.01);
    assert.equal(j.g.vista("view").pos.z, 0, "la cámara se quedó hundida");
  });
});
