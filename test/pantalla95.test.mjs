// EXPERIMENTO 95, pieza A: lo que Master Sword le hace al fundido cada vez que
// calcula la vista (`Effects_GetFade`), y el temblor de `effect screenshake`.
//
// Dos capas, como siempre:
//
//   1. LA REGLA, con los números escritos A MANO al lado de su cita (el 75:
//      cuando el número ES la regla, no se compara la constante consigo misma).
//   2. EL CAMINO, por donde entra el juego: un `GuionDelJugador` de verdad con
//      la ficha y los efectos horneados, y la línea partida por el ANALIZADOR
//      (el 67). Nadie llama a `leerTemblor` ni a `temblorParaJugador` a mano en
//      esa mitad: se mira lo que llega a la puerta de la pantalla.
//
// Lo que se ve —el velo en el DOM, la cámara moviéndose— lo mide la sonda
// (`sondas/pantalla95.mjs`).

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  FFADE, fijo16, leerFundido, fundidoAlLlegar, alfaDelFundido, pinturaDelFundido, fundidoTrasLaVista,
} from "../src/play/efectospantalla.js";
import {
  leerTemblor, mensajeDeTemblor, temblorParaJugador, nuevoTemblor, temblorAlLlegar, pasoDelTemblor, temblorEnEscena,
} from "../src/play/temblor.js";
import { GuionDelJugador } from "../src/play/guionjugador.js";
import { TablaDeEfectos } from "../src/play/efectos.js";
import { Guion, partirGuion, GETTERS } from "../src/play/guion.js";

const EFECTOS = "build/msr/efectosguion.json";
const JUGADOR = "build/msr/jugador.json";
const HAY_EFECTOS = existsSync(EFECTOS) && existsSync(JUGADOR);

// ── 1a. `Effects_GetFade` ───────────────────────────────────────────────────

describe("`Effects_GetFade` borra las banderas antes de pintar (hudscript.cpp:253, view.cpp:1747-1750)", () => {
  // `effect screenfade ent_me 0.5 3 (255,0,0) 255 fadeout` — demon_blood.script:18.
  const sangre = () => fundidoAlLlegar(leerFundido(["screenfade", "ent_me", "0.5", "3", "(255,0,0)", "255", "fadeout"]).mensaje, 100);

  test("pone `fadeFlags` a cero y no toca nada más", () => {
    const sf = sangre();
    const antes = { ...sf };
    assert.equal(sf.fadeFlags, FFADE.OUT);
    fundidoTrasLaVista(sf);
    assert.equal(sf.fadeFlags, 0);
    assert.deepEqual({ ...sf, fadeFlags: antes.fadeFlags }, antes);
    assert.equal(fundidoTrasLaVista(null), null);
  });

  test("`fadeout` de la sangre de demonio: NADA durante la duración, luego sube, aguanta y se va", () => {
    // `CL_ParseScreenFade` con `FFADE_OUT` (cl_parse.c:2096-2103): 0,5 s son
    // 2048/4096 exactos; `fadeSpeed = −255 / 0,5 = −510`; `fadeEnd = 100,5`;
    // `fadeReset = 100,5 + 3 = 103,5`.
    const sf = fundidoTrasLaVista(sangre());
    // `V_FadeAlpha` sin la bandera (cl_game.c:494-501): −510 · (100,5 − t).
    assert.equal(alfaDelFundido(sf, 100), 0, "−510 · 0,5 = −255 → 0");
    assert.equal(alfaDelFundido(sf, 100.25), 0, "−510 · 0,25 = −127,5 → 0");
    assert.equal(alfaDelFundido(sf, 100.75), 127, "−510 · (−0,25) = 127,5 → 127 (`int` trunca)");
    assert.equal(alfaDelFundido(sf, 101), 255, "255, topado a `fadealpha`");
    assert.equal(alfaDelFundido(sf, 103.4), 255, "en el aguante");
    assert.equal(alfaDelFundido(sf, 103.6), 0, "pasado `fadeReset` (103,5) y `fadeEnd` (100,5)");
  });

  test("CONTROL: sin `Effects_GetFade` el motor de HL sí lo pintaría subiendo desde el principio", () => {
    // El mismo struct, sin borrar: `−510 · 0,25 = −127,5 → −127`, más 255 = 128.
    const sf = sangre();
    assert.equal(alfaDelFundido(sf, 100.25), 128);
  });

  test("`perm` (STAYOUT) ya no se queda: se pinta y se va como uno normal", () => {
    const sf = fundidoTrasLaVista(fundidoAlLlegar({ duracion: fijo16(0.5), aguante: 0, banderas: FFADE.STAYOUT, r: 0, g: 0, b: 0, a: 90 }, 100));
    assert.equal(alfaDelFundido(sf, 100), 90, "al llegar, `180 · 0,5`");
    assert.equal(alfaDelFundido(sf, 500), 0, "con la bandera serían 90 para siempre (efectos93b)");
  });

  test("`noblend` (MODULATE) ya no multiplica: se mezcla con su color", () => {
    // `effect screenfade ent_me 0.9 5.0 (10,10,10) 255 noblend` — player/valid_spawn_new.script:117.
    const sf = fundidoTrasLaVista(fundidoAlLlegar(leerFundido(["screenfade", "ent_me", "0.9", "5.0", "(10,10,10)", "255", "noblend"]).mensaje, 0));
    assert.deepEqual(pinturaDelFundido(sf, 255), { modo: "mezcla", rgba: [10, 10, 10, 1] });
  });

  test("`fadein` NO cambia: FFADE_IN es 0 (el veneno, la muerte y el golpe siguen igual)", () => {
    const sf = fundidoTrasLaVista(fundidoAlLlegar(leerFundido(["screenfade", "ent_me", "0.2", "0", "(75,215,0)", "30", "fadein"]).mensaje, 100));
    assert.equal(alfaDelFundido(sf, 100), 30);
    assert.equal(alfaDelFundido(sf, 100.1), 14);
    assert.equal(alfaDelFundido(sf, 100.21), 0);
  });
});

// ── 1b. EL TEMBLOR ──────────────────────────────────────────────────────────

describe("`effect screenshake`: lo que lee el servidor y a quién se lo manda (mseffects.cpp:847-876, util.cpp:1066-1128)", () => {
  test("la línea de la sangre de demonio, ya resuelta", () => {
    // `effect screenshake $relpos(0,0,0) 32 10 1 32` — demon_blood.script:45.
    const t = leerTemblor(["screenshake", "(10.00,20.00,30.00)", "32", "10", "1", "32"]);
    assert.deepEqual(t, { tipo: "screenshake", centro: [10, 20, 30], amplitud: 32, frecuencia: 10, duracion: 1, radio: 32 });
  });

  test("`REQPARAMS(6)` y `REQPARAMS(5)`: con uno menos, nada", () => {
    assert.equal(leerTemblor(["screenshake", "(0,0,0)", "32", "10", "1"]), null);
    assert.equal(leerTemblor(["screenshake_one", "ent_me", "16", "20"]), null);
    assert.deepEqual(leerTemblor(["screenshake_one", "ent_me", "16", "20", "3"]),
      { tipo: "screenshake_one", aQuien: "ent_me", amplitud: 16, frecuencia: 20, duracion: 3 });
    assert.equal(leerTemblor(["screenfade", "ent_me"]), null);
  });

  test("EL TECHO: la amplitud viaja en 4.12 y no pasa de 16 unidades", () => {
    // 32 · 4096 = 131 072 > 0xFFFF → 65 535. 1 s → 4096. 10 · 256 = 2560.
    assert.deepEqual(mensajeDeTemblor(32, 1, 10), { amplitud: 65535, duracion: 4096, frecuencia: 2560 });
    // 380 (la reina de los gusanos) da lo mismo que 32; 300 de frecuencia se topa
    // en 8.8 (76 800 → 65 535) y 20 s de duración, en 16.
    assert.deepEqual(mensajeDeTemblor(380, 20, 300), { amplitud: 65535, duracion: 65535, frecuencia: 65535 });
    assert.deepEqual(mensajeDeTemblor(8, 0.5, 20), { amplitud: 32768, duracion: 2048, frecuencia: 5120 });
  });

  const t = { tipo: "screenshake", centro: [0, 0, 0], amplitud: 50, frecuencia: 10, duracion: 3, radio: 512 };
  test("de pie y dentro del radio: el mensaje con la amplitud ENTERA (sin caída con la distancia)", () => {
    const cerca = temblorParaJugador(t, { origen: [10, 0, 0], enSuelo: true });
    const lejos = temblorParaJugador(t, { origen: [500, 0, 0], enSuelo: true });
    assert.deepEqual(cerca, { amplitud: 65535, duracion: 12288, frecuencia: 2560 });
    assert.deepEqual(lejos, cerca, "«Had to get rid of this falloff» (util.cpp:1091-1093)");
  });

  test("en el AIRE no tiembla (util.cpp:1079)", () => {
    assert.equal(temblorParaJugador(t, { origen: [0, 0, 0], enSuelo: false }), null);
  });

  test("el radio es una esfera en 3D y la comparación es `<` ESTRICTO", () => {
    assert.equal(temblorParaJugador(t, { origen: [0, 0, 512], enSuelo: true }), null, "justo en el borde, fuera");
    assert.ok(temblorParaJugador(t, { origen: [0, 0, 511.9], enSuelo: true }));
    // 300² + 300² + 300² = 270 000 → 519,6 > 512: fuera, aunque cada eje esté dentro.
    assert.equal(temblorParaJugador(t, { origen: [300, 300, 300], enSuelo: true }), null);
  });

  test("radio 0 o negativo: a todos (util.cpp:1084)", () => {
    assert.ok(temblorParaJugador({ ...t, radio: 0 }, { origen: [9999, 0, 0], enSuelo: true }));
    assert.ok(temblorParaJugador({ ...t, radio: -1 }, { origen: [9999, 0, 0], enSuelo: true }));
  });

  test("amplitud 0: `if (localAmplitude)` no manda nada", () => {
    assert.equal(temblorParaJugador({ ...t, amplitud: 0 }, { origen: [0, 0, 0], enSuelo: true }), null);
  });

  test("`screenshake_one` no mira ni el suelo ni el radio (util.cpp:1111-1128)", () => {
    const uno = { tipo: "screenshake_one", aQuien: "ent_me", amplitud: 16, frecuencia: 20, duracion: 3 };
    assert.deepEqual(temblorParaJugador(uno, { origen: null, enSuelo: false }), { amplitud: 65535, duracion: 12288, frecuencia: 5120 });
  });
});

describe("el temblor en el cliente: `CL_ParseScreenShake` + `pfnCalcShake` + `pfnApplyShake` (xash3d engine/client)", () => {
  test("al llegar: se decodifica y `time` es el FINAL", () => {
    const s = temblorAlLlegar(nuevoTemblor(), { amplitud: 65535, duracion: 4096, frecuencia: 2560 }, 100);
    assert.equal(s.amplitude, 15.999755859375, "65535 / 4096");
    assert.equal(s.duration, 1);
    assert.equal(s.frequency, 10);
    assert.equal(s.time, 101);
    assert.equal(s.next_shake, 0);
  });

  test("un temblor más flojo no pisa la amplitud de uno más fuerte (cl_parse.c:2051-2053)", () => {
    const s = temblorAlLlegar(nuevoTemblor(), { amplitud: 16384, duracion: 4096, frecuencia: 256 }, 0);   // 4 u
    temblorAlLlegar(s, { amplitud: 8192, duracion: 8192, frecuencia: 512 }, 0.5);                       // 2 u
    assert.equal(s.amplitude, 4, "se queda la de antes");
    assert.equal(s.duration, 2, "pero la duración y la frecuencia SÍ son las nuevas");
    assert.equal(s.frequency, 2);
    assert.equal(s.time, 2.5);
  });

  test("un paso, con los números a mano", () => {
    // Amplitud 4, duración 1, frecuencia 1, llega a t = 0 → `time` = 1.
    const s = temblorAlLlegar(nuevoTemblor(), { amplitud: 16384, duracion: 4096, frecuencia: 256 }, 0);
    const pedidos = [];
    // `COM_RandomFloat(bajo, alto)`: aquí devuelve siempre el ALTO, y se apunta
    // con qué se le llamó (la trampa del 59: un dado con la firma equivocada).
    const azar = (bajo, alto) => { pedidos.push([bajo, alto]); return alto; };
    pasoDelTemblor(s, 0.5, 0.1, azar);
    assert.deepEqual(pedidos, [[-4, 4], [-4, 4], [-4, 4], [-1, 1]], "tres desplazamientos de ±A y un ángulo de ±A/4");
    assert.deepEqual(s.offset, [4, 4, 4]);
    assert.equal(s.angle, 1);
    assert.equal(s.next_shake, 1.5, "`cl.time + frequency / duration` = 0,5 + 1/1");
    // fracción = (0,5 − 1) / 1 = −0,5; freq = (1 / −0,5) · 1 = −2;
    // fracción = −0,5 · (−0,5 · sin(0,5 · −2)) = −0,5 · 0,5 · sin(1)… con el signo:
    // −0,5 · (−0,5 · −0,8414709848) = −0,2103677462.
    for (const v of s.applied_offset) assert.ok(Math.abs(v - (4 * -0.2103677462)) < 1e-9, `${v}`);
    assert.ok(Math.abs(s.applied_angle - -0.2103677462) < 1e-9, `${s.applied_angle}`);
    // «decrease amplitude»: 4 − 4 · (0,1 / (1 · 1)) = 3,6.
    assert.ok(Math.abs(s.amplitude - 3.6) < 1e-12, `${s.amplitude}`);
  });

  test("con los números de los guiones (10 / 1) el desplazamiento se sortea UNA vez", () => {
    // `next_shake = cl.time + frequency / duration` = +10 s para un temblor de 1 s.
    const s = temblorAlLlegar(nuevoTemblor(), mensajeDeTemblor(32, 1, 10), 0);
    let tiradas = 0;
    const azar = (bajo, alto) => { tiradas++; return alto; };
    for (let k = 1; k <= 120; k++) pasoDelTemblor(s, k / 100, 0.01, azar);
    assert.equal(tiradas, 4, "tres ejes y el ángulo, y nada más en todo el temblor");
  });

  test("al acabar se pone a cero lo APLICADO, pero no la amplitud (cl_game.c:2251-2256)", () => {
    const s = temblorAlLlegar(nuevoTemblor(), { amplitud: 16384, duracion: 4096, frecuencia: 256 }, 0);
    pasoDelTemblor(s, 0.5, 0.1, (b, a) => a);
    pasoDelTemblor(s, 1.01, 0.1, (b, a) => a);
    assert.equal(s.time, 0);
    assert.deepEqual(s.applied_offset, [0, 0, 0]);
    assert.equal(s.applied_angle, 0);
    assert.ok(Math.abs(s.amplitude - 3.6) < 1e-12, "la que quedó tras el paso de 0,5");
    // Y por eso el siguiente, de 2 unidades, tiembla con 3,6.
    temblorAlLlegar(s, { amplitud: 8192, duracion: 4096, frecuencia: 256 }, 2);
    assert.ok(Math.abs(s.amplitude - 3.6) < 1e-12);
  });

  test("a la vista: unidades a metros y los ejes de Three (x, z, −y); el ángulo al alabeo", () => {
    const s = nuevoTemblor();
    s.applied_offset = [39.37, 0, 0]; s.applied_angle = 2;
    assert.deepEqual(temblorEnEscena(s, 39.37), { desplazamiento: [1, 0, 0], alabeo: 2 });
    s.applied_offset = [0, 39.37, 0];
    assert.deepEqual(temblorEnEscena(s, 39.37).desplazamiento, [0, 0, -1]);
    s.applied_offset = [0, 0, 39.37];
    assert.deepEqual(temblorEnEscena(s, 39.37).desplazamiento, [0, 1, 0]);
    // El arma tiembla con 0,9 (view.cpp:703).
    assert.ok(Math.abs(temblorEnEscena(s, 39.37, 0.9).desplazamiento[1] - 0.9) < 1e-12);
  });
});

// ── 2. EL CAMINO ───────────────────────────────────────────────────────────

describe("EL CAMINO: el temblor sale del guion del jugador y de sus efectos", { skip: !HAY_EFECTOS }, () => {
  const ficha = HAY_EFECTOS ? JSON.parse(readFileSync(JUGADOR, "utf8")) : null;
  const tabla = HAY_EFECTOS ? new TablaDeEfectos(JSON.parse(readFileSync(EFECTOS, "utf8"))) : null;
  const montar = ({ origen = [100, 200, 36], enSuelo = true, fisica = true } = {}) => {
    let t = 0;
    const llegado = [];
    const cuerpo = { origen, enSuelo };
    const g = new GuionDelJugador({
      ficha, efectos: tabla, ahora: () => t,
      personaje: { id: "jugador1", nombre: "Ana", vida: 300, mana: 10, habilidades: {} },
      maximos: () => ({ vida: 300, mana: 10 }), dar: () => {}, suceso: () => {}, herir: () => {},
      fisica: fisica ? {
        empujar: () => {}, colocar: () => {},
        origen: () => [...cuerpo.origen], enSuelo: () => cuerpo.enSuelo, angulos: () => [0, 90, 0],
      } : null,
      pantalla: (p) => llegado.push({ t, ...p }),
    });
    const pasar = (s) => { for (let k = 0; k < Math.round(s * 100); k++) { t += 0.01; g.paso(0.01); } };
    return { g, llegado, pasar, cuerpo };
  };

  test("`$relpos` está entre los getters", () => {
    assert.ok(GETTERS.has("$relpos"));
  });

  test("`ext_quake_fx`: `$get(ent_me,origin)` es el centro del jugador, y le llega el temblor", () => {
    // player/externals.script:3383-3390: `effect screenshake $get(ent_me,origin) 50 10 L_DUR 512`.
    const { g, llegado } = montar();
    g.llamar("ext_quake_fx", ["3"]);
    const tt = g.temblores.at(-1);
    assert.ok(tt, JSON.stringify(g.noSoportados));
    assert.deepEqual(tt.centro, [100, 200, 36], "el `origin` que dio el cuerpo, no el del mapa");
    const temblores = llegado.filter((p) => p.tipo === "temblor");
    assert.equal(temblores.length, 1);
    assert.deepEqual(temblores[0].mensaje, { amplitud: 65535, duracion: 12288, frecuencia: 2560 });
    assert.ok(!g.guion.noSoportados.some((x) => /screenshake/.test(x.nombre)), JSON.stringify(g.guion.noSoportados));
  });

  test("CONTROL NEGATIVO: el mismo terremoto con el jugador en el aire no le llega, y queda apuntado que se decidió", () => {
    const { g, llegado } = montar({ enSuelo: false });
    g.llamar("ext_quake_fx", ["3"]);
    assert.equal(llegado.filter((p) => p.tipo === "temblor").length, 0);
    assert.equal(g.temblores.length, 1);
    assert.equal(g.temblores[0].mensaje, null);
  });

  test("sin cuerpo se APUNTA, no se adivina", () => {
    const { g, llegado } = montar({ fisica: false });
    g.llamar("ext_quake_fx", ["3"]);
    assert.equal(llegado.filter((p) => p.tipo === "temblor").length, 0);
    assert.ok(g.guion.noSoportados.some((x) => /screenshake \(sin cuerpo/.test(x.nombre)), JSON.stringify(g.guion.noSoportados));
  });

  test("la sangre de demonio: su `fadeout` y su latido con `$relpos(0,0,0)` de radio 32", () => {
    // `applyeffect $get(ent_owner,id) "effects/demon_blood" 60.0 -5` (items/mana_demon_blood.script:54);
    // aquí con intensidad 0 para no matar a nadie.
    const { g, llegado, pasar } = montar();
    const ef = g.efectos.aplicar("effects/demon_blood", ["60", "0"]);
    assert.ok(ef);
    const fundido = llegado.find((p) => p.tipo === "fundido");
    assert.deepEqual(fundido?.mensaje, { duracion: 2048, aguante: 12288, banderas: FFADE.OUT, r: 255, g: 0, b: 0, a: 255 });
    pasar(1.05);
    // `$relpos(0,0,0)` es el propio jugador: distancia 0 < 32, le llega.
    const tt = g.temblores.at(-1);
    assert.ok(tt, JSON.stringify(ef.guion.noSoportados));
    assert.deepEqual(tt.centro, [100, 200, 36]);
    assert.equal(tt.de, ef.guion.nombre);
    assert.deepEqual(llegado.filter((p) => p.tipo === "temblor").at(-1)?.mensaje, { amplitud: 65535, duracion: 4096, frecuencia: 2560 });
    assert.ok(!ef.guion.noSoportados.some((x) => /relpos|screenshake/.test(x.nombre)), JSON.stringify(ef.guion.noSoportados));
  });

  test("EL CASE, por texto: `effect screenshake` con `$relpos` de un guion suelto sin cuerpo se apunta", () => {
    const texto = "{ e\n effect screenshake $relpos(0,0,0) 32 10 1 32\n}";
    const g = new Guion({ eventos: partirGuion(texto).eventos });
    g.llamar("e", []);
    const n = g.noSoportados.map((x) => x.nombre);
    assert.ok(n.some((x) => x.startsWith("$relpos")), JSON.stringify(n));
    assert.ok(n.includes("effect"), JSON.stringify(n));
  });

  test("`$relpos`, las dos formas, por texto (script.cpp:3564-3595)", () => {
    const texto = [
      "{ e",
      " setvard A $relpos(10,20,30)",
      " setvard B $relpos((0,0,0),(10,20,30))",
      "}",
    ].join("\n");
    const g = new Guion({ eventos: partirGuion(texto).eventos });
    g.entorno.origenDeMi = () => [100, 200, 300];
    g.entorno.angulosDeMi = () => [0, 0, 0];
    g.llamar("e", []);
    // Ángulos 0: derecha = (0,−1,0), adelante = (1,0,0), arriba = (0,0,1)
    // (`AngleVectors`, mathlib.cpp:208). 10 a la derecha, 20 adelante, 30 arriba:
    // (100 + 20, 200 − 10, 300 + 30).
    assert.equal(g.vars.get("A"), "(120.00,190.00,330.00)");
    // Con ángulos explícitos NO se suma el origen (`StartPos = g_vecZero`): el
    // mismo desplazamiento sin los (100,200,300).
    assert.equal(g.vars.get("B"), "(20.00,-10.00,30.00)");
  });
});
