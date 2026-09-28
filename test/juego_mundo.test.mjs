// EL MUNDO VIVO: la animación de estar parado y el paseo.
//
// Las dos cosas que se veían mal jugando y que resultaron ser la misma
// pregunta: **qué hace un bicho cuando no tiene a quién pegar**. La respuesta
// no está en los scripts —no hay `npc_wander` ni `ANIM_IDLE`—, está en
// `msmonsterserver.cpp` y en la cabecera del `.mdl`.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import { ACT, NO_HAY, buscarActividad, secuenciaDeActividad, animacionDeParado } from "../src/play/actividad.js";
import {
  Vagabundo, cercaniaDe, alcanceDelTrazo, anguloMod, adelante,
  ESPERA, PLAZO, ATASCADO, ABANICO, INTENTOS,
} from "../src/play/paseo.js";
import { leerFichaNpc, iaDe, sonidosDeEvento } from "../src/bsp/script.js";

const SCRIPTS = "../MSC/MSCScripts/scripts";
const hayScripts = existsSync(`${SCRIPTS}/monsters/goblin.script`);

// Una secuencia de mentira con lo justo: índice, nombre, actividad y peso.
const sec = (indice, nombre, actividad, pesoActividad = 1) =>
  ({ indice, nombre, actividad, pesoActividad });

describe("la animación de estar parado", () => {
  test("si el script la nombra, manda ella y no se mira el .mdl", () => {
    const secs = [sec(0, "walk", ACT.ANDAR), sec(1, "idle", ACT.IDLE)];
    const d = animacionDeParado({ nombrado: "idle1", secuencias: secs });
    assert.equal(d.que, "idle1");
    assert.match(d.porque, /script/);
  });

  test("si no la nombra, sale de la ACTIVIDAD y NUNCA de la de andar", () => {
    // Éste es el fallo entero: el aldeano declara `setmoveanim walk` y nada
    // más, y caíamos en `walk`. El motor pide ACT_IDLE.
    const secs = [sec(0, "reposo", ACT.IDLE), sec(1, "walk", ACT.ANDAR)];
    const d = animacionDeParado({ nombrado: null, secuencias: secs });
    assert.equal(d.que, "reposo");
    assert.notEqual(d.que, "walk");
    assert.match(d.porque, /ACT_IDLE/);
  });

  test("y si el modelo tampoco la trae, la secuencia 0 — que no es la de andar", () => {
    const secs = [sec(0, "loquesea", 99), sec(1, "walk", ACT.ANDAR)];
    const d = animacionDeParado({ nombrado: null, secuencias: secs });
    assert.equal(d.que, "loquesea");
    assert.equal(d.indice, 0);
    assert.match(d.porque, /secuencia 0/);
    assert.equal(buscarActividad(secs, ACT.IDLE), NO_HAY);
    assert.equal(secuenciaDeActividad(secs, ACT.IDLE), 0);
  });

  test("con varias candidatas se SORTEA en proporción al peso", () => {
    // `weighttotal += actweight; if (!weighttotal || RANDOM_LONG(0, weighttotal-1) < actweight)`
    const secs = [sec(0, "a", ACT.IDLE, 1), sec(1, "b", ACT.IDLE, 9)];
    const cuenta = { 0: 0, 1: 0 };
    // Un dado uniforme de verdad, no fijado: lo que se comprueba es el reparto.
    for (let n = 0; n < 20000; n++) cuenta[buscarActividad(secs, ACT.IDLE, (m) => Math.floor(Math.random() * m))]++;
    const p = cuenta[1] / 20000;
    assert.ok(p > 0.85 && p < 0.95, `la de peso 9 deberia salir el 90 %, sale el ${(p * 100).toFixed(1)} %`);
  });

  test("y con todos los pesos a CERO gana la última, que no es lo mismo que la primera", () => {
    // El `!weighttotal` del motor. Con los pesos sin poner —que los hay— la
    // condición se cumple siempre y el bucle se queda con la última.
    const secs = [sec(0, "a", ACT.IDLE, 0), sec(1, "b", ACT.IDLE, 0), sec(2, "c", ACT.IDLE, 0)];
    for (let n = 0; n < 50; n++) assert.equal(buscarActividad(secs, ACT.IDLE), 2);
  });

  test("ACT_IDLE es 1 y no un número nuestro", () => {
    // `activity.h:21-25`. Cambiarlo es dejar de encontrar la secuencia, y eso
    // no da error: da un bicho en la pose 0.
    assert.deepEqual(ACT, { RESET: 0, IDLE: 1, GUARD: 2, ANDAR: 3, CORRER: 4 });
  });
});

describe("el paseo de `SetWanderDest`", () => {
  test("sin `roam 1` no se mueve nadie, y eso también es del juego", () => {
    const v = new Vagabundo({ ancho: 32, pasea: false });
    for (let t = 0; t < 60; t += 0.1) assert.equal(v.tic(0.1, {}), null);
    assert.equal(v.tieneDestino, false);
  });

  test("las constantes son las del motor y no un gusto", () => {
    assert.equal(ESPERA, 2.0);      // m_RoamDelay
    assert.equal(PLAZO, 7.0);       // m_NodeCancelTime
    assert.equal(ATASCADO, 10.0);   // el «UNFIXABLY STUCK»
    assert.equal(ABANICO, 130);     // RANDOM_FLOAT(-130, 130)
    assert.equal(INTENTOS, 15);
    assert.ok(Math.abs(cercaniaDe(32) - 35.2) < 1e-9);       // m_Width * 1.1
    assert.ok(Math.abs(alcanceDelTrazo(32) - 105.6) < 1e-9); // Proximity * 3
  });

  test("se espera dos segundos ANTES de elegir, y no entre pasos", () => {
    // El primer tic es el que arranca el reloj (`m_NextNodeTime = time +
    // m_RoamDelay`), así que la primera decisión cae a los dos segundos de
    // ese tic y no del nacimiento.
    const v = new Vagabundo({ ancho: 32 });
    assert.equal(v.tic(0.016, { libre: () => true }), null, "el primer fotograma sólo pone el reloj");
    assert.ok(Math.abs(v.proximoNodo - (0.016 + ESPERA)) < 1e-9);
    assert.equal(v.tic(1.0, { libre: () => true }), null, "al segundo, nada");
    const r = v.tic(1.1, { libre: () => true });
    assert.ok(r?.destino, "pasados los dos segundos ya hay destino");
  });

  test("el trazo es corto y el DESTINO está lejísimos: de 300 a 6000 unidades", () => {
    // Ésta es la que no se adivina. Colapsar las dos distancias da bichos que
    // tiemblan en el sitio en vez de cruzar el pueblo.
    const v = new Vagabundo({ ancho: 32, azar: () => 0.5 });
    v.t = 10; v.proximoNodo = 1;
    const donde = [0, 0, 0];
    let trazado = 0;
    const r = v.tic(0, {
      rumbo: 0, donde, ojo: donde, centro: donde,
      libre: (desde, hasta) => { trazado = Math.hypot(hasta[0] - desde[0], hasta[2] - desde[2]); return true; },
    });
    assert.ok(Math.abs(trazado - 105.6) < 1e-6, `el trazo mide ${trazado}, deberia medir 105,6`);
    const lejos = Math.hypot(r.destino[0], r.destino[2]);
    assert.ok(Math.abs(lejos - 3150) < 1e-6, `el destino esta a ${lejos}`);   // 300 + 0.5*(6000-300)
    assert.ok(lejos > trazado * 25, "el destino esta treinta veces mas lejos que el trazo");
  });

  test("el rumbo sale del actual ±130°, así que no se da la vuelta en seco", () => {
    const vistos = [];
    for (let n = 0; n < 200; n++) {
      const v = new Vagabundo({ ancho: 32 });
      v.t = 10; v.proximoNodo = 1;
      const r = v.tic(0, { rumbo: 0, donde: [0, 0, 0], libre: () => true });
      vistos.push(r.rumbo);
    }
    // En [0,130] ∪ [230,360): nunca justo detrás.
    for (const g of vistos) assert.ok(g <= ABANICO + 1e-9 || g >= 360 - ABANICO - 1e-9, `${g}° esta fuera del abanico`);
    assert.ok(vistos.some((g) => g > 100 && g < 130), "y sí llega a los extremos");
  });

  test("si los quince fallan se barren los 360 grados, midiendo desde otro sitio", () => {
    // El primer bucle traza hasta `pev->origin + adelante*d` y el segundo hasta
    // `Center() + adelante*d`. Son dos líneas distintas del archivo (1084 y
    // 1113) y van portadas como están.
    const v = new Vagabundo({ ancho: 32 });
    v.t = 10; v.proximoNodo = 1;
    const desdeDonde = [];
    const r = v.tic(0, {
      rumbo: 0,
      donde: [0, 0, 0], centro: [0, 30, 0], ojo: [0, 54, 0],
      // Sólo hay salida al norte exacto, que el abanico de ±130° desde 0 no
      // alcanza... salvo por casualidad. Se fuerza a la fuerza bruta.
      libre: (desde, hasta) => { desdeDonde.push(hasta[1]); return Math.abs(anguloMod(Math.round(Math.atan2(-(hasta[2]), hasta[0]) * 180 / Math.PI)) - 180) < 0.6; },
    });
    assert.ok(r?.destino, "algo tiene que encontrar");
    assert.match(r.porque, /fuerza/);
    // Los quince primeros trazos salen de `donde` (y=0) y los siguientes de
    // `centro` (y=30).
    assert.equal(desdeDonde.slice(0, INTENTOS).every((y) => y === 0), true);
    assert.equal(desdeDonde[INTENTOS], 30);
  });

  test("sin salida por ningún lado, diez segundos de espera y a callar", () => {
    const v = new Vagabundo({ ancho: 32 });
    v.t = 10; v.proximoNodo = 1;
    const r = v.tic(0, { rumbo: 0, donde: [0, 0, 0], libre: () => false });
    assert.equal(r.atascado, true);
    assert.equal(v.tieneDestino, false);
    assert.ok(Math.abs(v.proximoNodo - (10 + ATASCADO)) < 1e-9);
  });

  test("el plazo de siete segundos vence aunque no se haya llegado", () => {
    // Es lo que marca el ritmo de verdad: el destino a 150 metros casi nunca
    // se alcanza, se anda siete segundos hacia allá y se vuelve a tirar.
    const v = new Vagabundo({ ancho: 32 });
    v.t = 10; v.proximoNodo = 1;
    v.tic(0, { rumbo: 0, donde: [0, 0, 0], libre: () => true });
    assert.equal(v.tieneDestino, true);
    assert.equal(v.vencido, false);
    v.t += PLAZO + 0.01;
    assert.equal(v.vencido, true);
    v.llegado();
    assert.equal(v.tieneDestino, false);
  });

  test("`adelante` va en los ejes de la escena, no en los de GoldSrc", () => {
    // Mezclarlas no da error: da un bicho que pasea hacia el techo.
    const [x, y, z] = adelante(0);
    assert.ok(Math.abs(x - 1) < 1e-9 && y === 0 && Math.abs(z) < 1e-9);
    const [x2, y2, z2] = adelante(90);
    assert.ok(Math.abs(x2) < 1e-9 && y2 === 0 && Math.abs(z2 + 1) < 1e-9);
    assert.equal(anguloMod(-30), 330);
    assert.equal(anguloMod(390), 30);
  });
});

describe("lo que dicen los scripts de Gate City", { skip: !hayScripts && "sin los scripts de MSR al lado" }, () => {
  test("`roam 1` lo dicen los que pasean, y los tenderos no", () => {
    const pasea = (s) => iaDe(leerFichaNpc(SCRIPTS, s)).pasea;
    assert.equal(pasea("NPCs/default_dwarf"), true, "el aldeano pasea");
    assert.equal(pasea("monsters/goblin"), true);
    assert.equal(pasea("monsters/giantrat"), true);
    assert.equal(pasea("gatecity/armorer"), false, "el herrero NO se va de paseo");
    assert.equal(pasea("gatecity/tavern"), false);
  });

  test("el aldeano no nombra su animación de estar parado, y por eso hacía falta todo esto", () => {
    const f = leerFichaNpc(SCRIPTS, "NPCs/default_dwarf");
    assert.equal(f.ficha.setidleanim, undefined, "no hay `setidleanim`");
    assert.equal(f.ficha.setmoveanim, "walk", "sólo dice la de andar");
  });

  test("el sonido de recibir del goblin son cinco, y DOS son de gárgola", () => {
    // El que sonaba raro jugando. No es un fallo del mod: es reutilización.
    const s = iaDe(leerFichaNpc(SCRIPTS, "monsters/goblin")).sonidos.recibir;
    assert.equal(s.length, 5);
    const metal = s.filter((x) => x.includes("gargoyle"));
    assert.equal(metal.length, 2, "dos de cinco, o sea el 40 % de los golpes");
    assert.equal(s.filter((x) => x.startsWith("body/flesh")).length, 3);
  });

  test("repetir un nombre es como el mod le da PESO a un sonido", () => {
    // `playrandomsound` sortea uniformemente sobre la lista tal cual
    // (scriptcmds.cpp:4730), así que quitar los repetidos cambia la mezcla.
    const rata = iaDe(leerFichaNpc(SCRIPTS, "monsters/giantrat")).sonidos.recibir;
    assert.equal(rata.length, 5);
    assert.equal(rata.filter((x) => x.includes("squeak1")).length, 2, "el chillido va dos veces de cinco");
    assert.notEqual(new Set(rata).size, rata.length, "y la lista TIENE repetidos");
  });

  test("un `playsound` detrás de un `if` en la misma línea también cuenta", () => {
    // El zombi enano tiene TODOS los suyos así. Anclando al principio de la
    // línea se queda mudo, que es lo que pasaba en el primer intento.
    const z = iaDe(leerFichaNpc(SCRIPTS, "monsters/dwarf_zombie_random")).sonidos.recibir;
    assert.ok(z.length >= 6, `sólo salen ${z.length}`);
    assert.ok(z.some((x) => x.includes("debris/flesh2")), "el de carne, que va detrás de un `if` de vida");
  });

  test("el volumen se distingue del sonido por el VALOR, no por el nombre", () => {
    // La araña escribe `playrandomsound game.sound.body SPIDER_VOLUME SND_STRUCK1 ...`
    // y `SPIDER_VOLUME` vale 10. Mirando el nombre, el 10 se cuela de sonido.
    const a = iaDe(leerFichaNpc(SCRIPTS, "monsters/spider")).sonidos.recibir;
    assert.equal(a.includes("10"), false, "el volumen no es un sonido");
    assert.ok(a.every((x) => /\.wav$/i.test(x)), `hay algo que no es un .wav: ${JSON.stringify(a)}`);
  });

  test("los aldeanos no declaran ninguno: en el juego no suenan al recibir", () => {
    for (const s of ["NPCs/default_dwarf", "NPCs/default_human", "gatecity/guard"]) {
      assert.deepEqual(sonidosDeEvento(leerFichaNpc(SCRIPTS, s), "npc_struck"), [], s);
    }
  });

  test("el goblin da 25 de experiencia y tiene 50 de vida", () => {
    // Los dos números que alimentan `expDeLaMuerte`. Si `NPC_GIVE_EXP` se
    // leyera mal, la experiencia saldría cero y no habría error en ningún sitio.
    const ia = iaDe(leerFichaNpc(SCRIPTS, "monsters/goblin"));
    assert.equal(ia.experiencia, 25);
    assert.equal(ia.vida, 50);
  });
});
