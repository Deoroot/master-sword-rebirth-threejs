// LAS PUERTAS QUE SE CORREN, y las que ya giraban y no se abrían como debían.
//
// El 70 porta `func_door` —tres en Edana, cero en Gate City— y corrige una
// regla del 48 que llevaba veintidós experimentos dando el resultado correcto
// por accidente en cinco de siete puertas.
//
// Lo que se mide aquí es la REGLA: el ciclo de `CBaseDoor` y quién puede
// abrirla. Lo que hay que ver en una pantalla —que la tapa de la cloaca ya
// choca, y que al correrse deja pasar— está en `sondas/edana70.mjs`, porque un
// colisionador sólo lo prueba un rayo.
//
// ── LAS FORMAS DE QUE ESTO PAREZCA FUNCIONAR Y ESTÉ MAL ───────────────────
//
// Están aquí porque el apartado 4 de CLAUDE.md dice que se reconozcan en un
// minuto, y cada una tiene su prueba enfrente:
//
//   una puerta que se «abre» sin moverse   recorrido cero, y el control del
//                                          horneado para el proceso
//   una puerta que llega arriba y no       `DoorHitTop` no dispara: el bucle
//   dispara                                del almiar se queda en uno
//   una que dispara al ARRANCAR            los tres almiares caen antes de que
//                                          se abra la tapa: parece igual de
//                                          bien y es 1,26 s antes
//   una que acepta un disparo a medias     la tapa se reinicia a cada golpe y
//                                          nunca llega arriba
//   una que se abre al tocarla teniendo    la casa del alcalde se abre sola y
//   nombre                                 sus dos `trigger_changetarget` son
//                                          adorno

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { Disparadores, USO, ES_PUERTA, ES_CORREDERA } from "../src/play/disparadores.js";
import { seAbreAlTocar } from "../src/play/puertas.js";

const cargar = (m) => {
  const r = `build/${m}/malla.json`;
  return existsSync(r) ? JSON.parse(readFileSync(r, "utf8")) : null;
};

/** Un bus con reloj de mano, igual que el del 69. */
function banco(lista) {
  const est = { t: 0 };
  const bus = new Disparadores(lista, { reloj: () => est.t, azar: () => 0.5 });
  return {
    bus, est,
    correr(segundos) {
      const fin = est.t + segundos;
      while (est.t < fin - 1e-9) { est.t = Number((est.t + 0.01).toFixed(5)); bus.paso(); }
    },
    de(nombre) { return bus.entidades.find((e) => e.nombre === nombre); },
  };
}

/** Una deslizante de mentira: 100 unidades a 100 u/s, o sea un segundo. */
const puerta = (extra = {}) => ({
  clase: "func_door", nombre: "p", duracion: 1, espera: 3, velocidad: 100, ...extra,
});

describe("70 · el ciclo de `CBaseDoor`", () => {
  test("un disparo la abre, y tarda su `duracion` en llegar", () => {
    const b = banco([puerta()]);
    const p = b.de("p");
    assert.equal(p.est.puerta, "abajo");
    b.bus.disparar("p", null, USO.ALTERNAR, 0);
    assert.equal(p.est.puerta, "subiendo");
    assert.equal(b.bus.fraccionDePuerta(p), 0);
    b.correr(0.5);
    const mitad = b.bus.fraccionDePuerta(p);
    assert.ok(mitad > 0.45 && mitad < 0.55, `a la mitad, y salió ${mitad}`);
    // EL CONTROL POSITIVO de lo de arriba: que no está midiendo el reposo. Sin
    // avanzar el reloj tenía que valer 0, y con el reloj pasado tiene que valer
    // 1. Un «está entre 0,45 y 0,55» solo no distingue una fracción que se
    // quedó clavada en medio.
    b.correr(0.6);
    assert.equal(p.est.puerta, "arriba");
    assert.equal(b.bus.fraccionDePuerta(p), 1);
  });

  test("y un segundo disparo mientras se mueve NO hace nada", () => {
    // `if ((m_toggle_state == TS_AT_BOTTOM) || ...)` (doors.cpp:551-553). La
    // tentación es «si no está abierta, ábrela», y con eso cada golpe reinicia
    // el tramo y la tapa no llega arriba nunca.
    const b = banco([puerta()]);
    const p = b.de("p");
    b.bus.disparar("p", null, USO.ALTERNAR, 0);
    b.correr(0.5);
    b.bus.recoger();
    const antes = b.bus.fraccionDePuerta(p);
    assert.equal(b.bus._puerta(p, null), false);
    assert.equal(b.bus.fraccionDePuerta(p), antes, "el disparo no la ha reiniciado");
    const avisos = b.bus.recoger().filter((s) => s.que === "puerta_ocupada");
    assert.equal(avisos.length, 1, "y se ha contado, no tragado");
  });

  test("arriba y sin `NO_AUTO_RETURN` tampoco acepta nada: hay que esperar", () => {
    const b = banco([puerta({ espera: 3 })]);
    const p = b.de("p");
    b.bus.disparar("p", null, USO.ALTERNAR, 0);
    b.correr(1.1);
    assert.equal(p.est.puerta, "arriba");
    b.bus.recoger();
    assert.equal(b.bus._puerta(p, null), false);
    assert.equal(p.est.puerta, "arriba");
  });

  test("pero con `SF_DOOR_NO_AUTO_RETURN` un disparo la CIERRA", () => {
    const b = banco([puerta({ sinRetorno: true, banderas: 32 })]);
    const p = b.de("p");
    b.bus.disparar("p", null, USO.ALTERNAR, 0);
    b.correr(1.1);
    assert.equal(p.est.puerta, "arriba");
    assert.equal(b.bus._puerta(p, null), true);
    assert.equal(p.est.puerta, "bajando");
    b.correr(1.1);
    assert.equal(p.est.puerta, "abajo");
  });

  test("se cierra sola pasados sus `wait` segundos, y no antes", () => {
    const b = banco([puerta({ espera: 3 })]);
    const p = b.de("p");
    b.bus.disparar("p", null, USO.ALTERNAR, 0);
    b.correr(1.1);
    b.correr(2.5);
    assert.equal(p.est.puerta, "arriba", "a los 2,5 s de espera todavía está arriba");
    b.correr(1);
    assert.ok(p.est.puerta === "bajando" || p.est.puerta === "abajo");
    b.correr(1.1);
    assert.equal(p.est.puerta, "abajo");
    assert.equal(b.bus.fraccionDePuerta(p), 0);
  });

  test("con `wait -1` se queda arriba para siempre, que es la tapa de la cloaca", () => {
    const b = banco([puerta({ espera: -1 })]);
    const p = b.de("p");
    b.bus.disparar("p", null, USO.ALTERNAR, 0);
    b.correr(30);
    assert.equal(p.est.puerta, "arriba");
    assert.equal(p.est.puertaVueltas, 1);
  });

  test("invertirla a mitad de camino tarda LO QUE LE FALTA, no el tramo entero", () => {
    // `LinearMove` calcula `nextthink` con la distancia que queda
    // (subs.cpp:426-453). Escribirlo con la duración completa no da error: da
    // una puerta que tarda el doble en volver desde la mitad.
    const b = banco([puerta({ sinRetorno: true, espera: -1 })]);
    const p = b.de("p");
    b.bus.disparar("p", null, USO.ALTERNAR, 0);
    b.correr(1.1);
    b.bus._puertaArranca(p, "bajando");
    b.correr(0.5);
    // Va por la mitad bajando; se la manda a subir y tiene que tardar 0,5 s.
    const f = b.bus.fraccionDePuerta(p);
    assert.ok(f > 0.4 && f < 0.6);
    b.bus._puertaArranca(p, "subiendo");
    b.correr(0.55);
    assert.equal(p.est.puerta, "arriba", `desde ${f.toFixed(2)} tenía que llegar en ~0,5 s`);
  });

  test("con `master` cerrado no se abre, y se cuenta", () => {
    const b = banco([
      puerta({ maestro: "m" }),
      { clase: "multisource", nombre: "m" },
      { clase: "trigger_relay", nombre: "x", objetivo: "m", probabilidad: 100 },
    ]);
    const p = b.de("p");
    b.bus.disparar("p", null, USO.ALTERNAR, 0);
    assert.equal(p.est.puerta, "abajo");
    assert.ok(b.bus.recoger().some((s) => s.que === "puerta_cerrada"));
  });
});

describe("70 · lo que dispara al LLEGAR, que es donde está el bucle del almiar", () => {
  const conObjetivo = () => banco([
    puerta({ espera: -1, objetivo: "luz" }),
    { clase: "env_render", nombre: "luz", objetivo: "nadie" },
  ]);

  test("`DoorHitTop` dispara el `target`, y al arrancar NO dispara nadie", () => {
    const b = conObjetivo();
    b.bus.disparar("p", null, USO.ALTERNAR, 0);
    const alArrancar = b.bus.recoger();
    assert.ok(alArrancar.some((s) => s.tipo === "puerta"));
    assert.equal(alArrancar.filter((s) => s.tipo === "render").length, 0,
      "al arrancar la puerta no dispara a nadie (doors.cpp:673: es en HitTop)");
    b.correr(1.1);
    const alLlegar = b.bus.recoger();
    assert.ok(alLlegar.some((s) => s.tipo === "puerta_llega" && s.arriba));
    assert.equal(alLlegar.filter((s) => s.tipo === "render").length, 1,
      "y al llegar arriba sí");
  });

  test("`DoorHitBottom` también dispara: una puerta con retorno dispara DOS veces", () => {
    // `SUB_UseTargets` está en los dos extremos (doors.cpp:673 y :718). Es fácil
    // portar sólo el de arriba y no notarlo: las tres de Edana o no vuelven o
    // no tienen objetivo.
    const b = banco([
      puerta({ espera: 0.5, objetivo: "luz" }),
      { clase: "env_render", nombre: "luz", objetivo: "nadie" },
    ]);
    b.bus.disparar("p", null, USO.ALTERNAR, 0);
    b.correr(3.2);
    const s = b.bus.recoger();
    assert.equal(s.filter((x) => x.tipo === "render").length, 2);
    assert.equal(s.filter((x) => x.tipo === "puerta_llega").length, 2);
  });
});

describe("70 · quién se abre al tocarla, que NO es sólo la bandera", () => {
  test("sin nombre y sin bandera, sí", () => {
    assert.equal(seAbreAlTocar({ nombre: null, soloUsar: false }), true);
  });

  test("con `SF_DOOR_USE_ONLY`, no", () => {
    assert.equal(seAbreAlTocar({ nombre: null, soloUsar: true }), false);
  });

  test("Y CON NOMBRE TAMPOCO, aunque no traiga la bandera (doors.cpp:533-538)", () => {
    // Ésta es la corrección del 70 sobre el 48. Sin ella, las dos hojas de
    // `door2` de Edana se abren al acercarse y los dos `trigger_changetarget`
    // que las gobiernan dejan de significar nada.
    assert.equal(seAbreAlTocar({ nombre: "door2", soloUsar: false }), false);
  });
});

describe("70 · las rotatorias siguen siendo suyas, y el bus sólo las empuja", () => {
  test("un disparo a una rotatoria sale por `puerta_gira` y no la mueve aquí", () => {
    const b = banco([{ clase: "func_door_rotating", nombre: "d2", duracion: 0.9 }]);
    b.bus.disparar("d2", null, USO.ALTERNAR, 0);
    const s = b.bus.recoger();
    assert.equal(s.filter((x) => x.tipo === "puerta_gira").length, 1);
    // Y el reloj de este módulo NO la lleva: si la llevara, habría dos máquinas
    // de estados para la misma hoja.
    b.correr(3);
    assert.equal(b.de("d2").est.puerta, "abajo");
    assert.equal(ES_PUERTA.has("func_door_rotating"), true);
    assert.equal(ES_CORREDERA.has("func_door_rotating"), false);
  });

  test("con el maestro cerrado ni se empuja", () => {
    const b = banco([
      { clase: "func_door_rotating", nombre: "d2", maestro: "m" },
      { clase: "multisource", nombre: "m" },
      { clase: "trigger_relay", nombre: "x", objetivo: "m", probabilidad: 100 },
    ]);
    b.bus.disparar("d2", null, USO.ALTERNAR, 0);
    const s = b.bus.recoger();
    assert.equal(s.filter((x) => x.tipo === "puerta_gira").length, 0);
    assert.ok(s.some((x) => x.que === "puerta_cerrada"));
  });
});

describe("70 · EDANA de verdad, contra el horneado", () => {
  const m = cargar("edana");

  test("tres `func_door`, con su recorrido calculado y no escrito", (t) => {
    if (!m) return t.skip("no está build/edana");
    const c = m.interactivas.correderas;
    assert.equal(c.length, 3);
    // 80−2−8 = 70 · 128−2−0 = 126 · 128−2−0 = 126. Las dos de la cloaca son el
    // mismo brush de 128 de ancho y las dos abren hacia −x.
    assert.deepEqual(c.map((p) => Math.round(p.recorridoUnidades)).sort((a, b) => a - b),
      [70, 126, 126]);
    // Y ninguna con recorrido cero, que es el control del horneado por este lado.
    assert.ok(c.every((p) => p.recorridoUnidades > 1));
  });

  test("LAS TRES tienen `targetname`: ninguna se abre al tocarla", (t) => {
    if (!m) return t.skip("no está build/edana");
    assert.equal(m.interactivas.correderas.filter((p) => p.nombre).length, 3);
    assert.equal(m.interactivas.correderas.filter((p) => p.soloUsar).length, 0,
      "y ninguna trae SF_DOOR_USE_ONLY: lo que las cierra al tacto es el nombre");
  });

  test("`sewerbeam` es atravesable y aditivo; las otras dos chocan", (t) => {
    if (!m) return t.skip("no está build/edana");
    const c = m.interactivas.correderas;
    const haz = c.find((p) => p.nombre === "sewerbeam");
    assert.ok(haz, "el haz de luz de la cloaca");
    assert.equal(haz.atravesable, true, "SF_DOOR_PASSABLE -> SOLID_NOT");
    assert.equal(haz.render.modo, 5, "rendermode 5 es aditivo, y no está portado aquí");
    assert.equal(c.filter((p) => !p.atravesable).length, 2);
  });

  test("`door1` no la puede abrir NADIE, y eso es del mapa", (t) => {
    if (!m) return t.skip("no está build/edana");
    // Tiene `targetname`, así que no se toca; y no hay una sola entidad del
    // mapa que la apunte. `dmg 50000` y `wait 3` son de una puerta que nunca
    // se mueve. Se comprueba para que no parezca un hueco del port.
    const nombres = new Set(m.disparadores.flatMap((d) => [d.objetivo, d.matar].filter(Boolean)));
    assert.equal(nombres.has("door1"), false);
    assert.equal(nombres.has("sewer_door"), true, "y el control positivo: a la tapa sí la apuntan");
  });

  test("las dos hojas de `door2` comparten nombre, y por eso un disparo abre las dos", (t) => {
    if (!m) return t.skip("no está build/edana");
    const hojas = m.interactivas.puertas.filter((p) => p.nombre === "door2");
    assert.equal(hojas.length, 2);
    assert.equal(m.interactivas.puertas.filter((p) => !p.nombre).length, 5,
      "y las otras cinco no tienen nombre, que es por qué el fallo del 48 sobrevivió");
    const b = banco(m.disparadores);
    b.bus.disparar("door2", null, USO.ALTERNAR, 0);
    assert.equal(b.bus.recoger().filter((s) => s.tipo === "puerta_gira").length, 2);
  });

  test("la cadena entera de la cloaca, contada eslabón a eslabón", (t) => {
    if (!m) return t.skip("no está build/edana");
    const b = banco(m.disparadores);
    const elDeOcho = b.bus.entidades.find((e) => e.clase === "func_breakable" && e.vida === 8);
    b.bus.danar(elDeOcho, 4, { tipo: "club" });
    b.correr(3);
    const s = b.bus.recoger();
    const tapa = b.de("sewer_door");
    assert.equal(tapa.est.puerta, "arriba");
    assert.equal(tapa.est.puertaVueltas, 1);
    assert.equal(s.filter((x) => x.tipo === "romper").length, 4, "los cuatro almiares");
    // El relé que comparte nombre con la tapa: mata al `trigger_once` y llama
    // al multi_manager, que a su vez abre el haz de luz.
    assert.ok(s.some((x) => x.tipo === "borrar" && x.nombre === "sewer_door"));
    const haz = b.de("sewerbeam");
    assert.equal(haz.est.puerta, "arriba", "y el haz de luz también se ha corrido");
  });
});

describe("70 · GATE CITY, el segundo caso — y aquí el número es cero", () => {
  const m = cargar("gatecity");

  test("CERO `func_door`, que es la séptima vez que el hueco lo enseña el otro mapa", (t) => {
    if (!m) return t.skip("no está build/gatecity");
    assert.equal((m.interactivas.correderas ?? []).length, 0);
    assert.equal(m.disparadores.filter((d) => d.clase === "func_door").length, 0);
  });

  test("y sus nueve rotatorias no tienen nombre: para ellas la corrección no cambia nada", (t) => {
    if (!m) return t.skip("no está build/gatecity");
    const p = m.interactivas.puertas;
    assert.equal(p.length, 9);
    assert.equal(p.filter((x) => x.nombre).length, 0);
    assert.ok(p.every((x) => seAbreAlTocar(x)), "las nueve se siguen abriendo al acercarse");
  });
});
