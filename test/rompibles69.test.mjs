// 69 — Lo que se rompe, lo que se pulsa y lo que se suelta.
//
// Tres clases que llevaban desde el 48 horneadas como pared o sin leer:
// `func_breakable`, `func_button` y `msitem_spawn`.
//
// ── EL CORRAL DE LA CLOACA DE EDANA, que es un bucle ───────────────────────
//
//   hay  *98   madera, 5 de vida   ──┐
//   hay  *99   madera, 10          ──┤  los CUATRO se llaman igual
//   hay  *100  madera, 8   target ─┐ │
//   hay  *101  madera, 11         ─┼─┘
//                                  │
//                    sewer_door ───┤  y son DOS entidades con ese nombre:
//                                  │    func_door      (wait -1, se queda abierta)
//                                  │    trigger_relay  (killtarget sewer_open)
//                                  │
//                    func_door ────┘  target: «hay»  <- de vuelta
//
// O sea: rompes el almiar de 8, se abre la cloaca, y la puerta revienta los
// otros tres. Al que la abrió no, porque `CBreakable::Die` **le quita el nombre
// antes de disparar** (func_break.cpp:821-825) con el comentario del mod al
// lado: *«Don't fire something that could fire myself»*.
//
// ── Y LA MANZANA ──────────────────────────────────────────────────────────
//
//   func_button appledrop  ->  multi_manager appledropMM  ->  apple5spawn
//                                                              ├ msitem_spawn health_apple
//                                                              └ env_render (apaga el adorno)
//
// ── LAS TRES CLAVES QUE SE LLAMAN AL REVÉS O NO SE LEEN ───────────────────
//
//   `health` en un func_button NO ES VIDA. `CBaseButton::TakeDamage` no la
//   resta en ninguna de sus 28 líneas (buttons.cpp:439-466): es la bandera de
//   «se puede golpear», y un golpe de cualquier tamaño abre el de `health 2`.
//
//   `spawnstart` en un msitem_spawn es `m_fSpawnOnTrigger` (gispawn.cpp:94-98),
//   o sea «NO salgas hasta que te llamen». El mismo nombre invertido que el 68.
//
//   `duration` NO LA LEE NADIE: `KeyValue` conoce tres claves y `duration` no es
//   un campo de `entvars_t` (gispawn.cpp:84-104). Dos de los cuatro de Edana la
//   traen y en el juego original tampoco hacían nada.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { Disparadores, USO, SF_ROMPER, SF_BOTON } from "../src/play/disparadores.js";
import { elegirObjetivo } from "../src/play/golpe.js";

const cargar = (m) => {
  const r = `build/${m}/malla.json`;
  return existsSync(r) ? JSON.parse(readFileSync(r, "utf8")) : null;
};

/** Un bus con reloj de mano. */
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
    porClase(c) { return bus.entidades.filter((e) => e.clase === c); },
  };
}

/** Un rompible de mentira, con lo mínimo que mira la regla. */
const almiar = (extra = {}) => ({
  clase: "func_breakable", nombre: "hay", material: 1, vida: 10, banderas: 0, ...extra,
});

describe("69 · `func_breakable`: la vida SÍ se resta, y el club vale el doble", () => {
  test("un almiar de 10 cae con DOS golpes de 3 de espada... no: con dos de 5", () => {
    const b = banco([almiar({ vida: 10, nombre: null })]);
    const e = b.bus.entidades[0];
    // `if (bitsDamageType & DMG_CLUB) flDamage *= 2` (func_break.cpp:565-567).
    assert.equal(b.bus.danar(e, 3, { tipo: "club" }), false);
    assert.equal(e.est.vida, 4);                    // 10 − 3×2
    assert.equal(b.bus.danar(e, 3, { tipo: "club" }), true);
    assert.ok(e.est.roto);
  });

  test("EL CONTROL: el mismo daño sin ser club no lo tumba", () => {
    const b = banco([almiar({ vida: 10, nombre: null })]);
    const e = b.bus.entidades[0];
    assert.equal(b.bus.danar(e, 3, { tipo: "flecha" }), false);
    assert.equal(e.est.vida, 7);                    // 10 − 3, sin doblar
    assert.equal(b.bus.danar(e, 3, { tipo: "flecha" }), false);
    assert.equal(e.est.vida, 4);
    assert.ok(!e.est.roto);
  });

  test("el veneno cuenta el 10 %, que es lo que dice el mod", () => {
    const b = banco([almiar({ vida: 10, nombre: null })]);
    const e = b.bus.entidades[0];
    b.bus.danar(e, 50, { tipo: "veneno" });
    assert.equal(e.est.vida, 5);                    // 10 − 50×0,1
    assert.ok(!e.est.roto);
  });

  test("`SF_BREAK_CROWBAR` lo rompe de UNA, saltándose la vida", () => {
    // Los cinco de Gate City con `spawnflags 262` la traen (262 = 256+4+2).
    const b = banco([almiar({ vida: 250, banderas: SF_ROMPER.PALANCA, nombre: null })]);
    const e = b.bus.entidades[0];
    assert.equal(b.bus.danar(e, 1, { tipo: "club" }), true);
    assert.ok(e.est.roto);
  });

  test("y la palanca pide LAS DOS COSAS: la bandera y que pegue un cliente", () => {
    const b = banco([almiar({ vida: 250, banderas: SF_ROMPER.PALANCA, nombre: null })]);
    const e = b.bus.entidades[0];
    // `FBitSet(pevAttacker->flags, FL_CLIENT) && FBitSet(..., SF_BREAK_CROWBAR)`
    // (func_break.cpp:557-560): sin cliente, el daño es el normal doblado.
    assert.equal(b.bus.danar(e, 1, { tipo: "club", deJugador: false }), false);
    assert.equal(e.est.vida, 248);
  });

  test("`SF_BREAK_TRIGGER_ONLY` no acepta daño, pero sí el disparo", () => {
    // Ninguno de los dos mapas la trae; el caso es del motor
    // (`pev->takedamage = DAMAGE_NO`, func_break.cpp:158-162).
    const b = banco([almiar({ vida: 5, banderas: SF_ROMPER.SOLO_DISPARO })]);
    const e = b.de("hay");
    assert.equal(b.bus.danar(e, 99, { tipo: "club" }), false);
    assert.equal(e.est.vida, 5, "el daño no ha entrado");
    assert.ok(b.bus.recoger().some((s) => s.que === "rompible_inmune"));
    b.bus.disparar("hay");
    assert.ok(e.est.roto, "y el disparo sí lo rompe");
  });

  test("el material 7 —`matUnbreakableGlass`— no se rompe de ninguna manera", () => {
    const b = banco([almiar({ material: 7, vida: 1 })]);
    const e = b.de("hay");
    assert.equal(b.bus.rompible(e), false);
    assert.equal(b.bus.danar(e, 999, { tipo: "club" }), false);
    b.bus.disparar("hay");
    assert.ok(!e.est.roto);
    // `CBreakable::Use` también pregunta (func_break.cpp:486-497).
    assert.ok(b.bus.recoger().some((s) => s.que === "rompible_irrompible"));
  });

  test("y el 1 —madera— SÍ, que es el de los almiares", () => {
    const b = banco([almiar({ material: 1, vida: 1 })]);
    assert.equal(b.bus.rompible(b.de("hay")), true);
  });

  test("romperlo dos veces cuenta una: `Die` no se repite", () => {
    const b = banco([almiar({ vida: 1, nombre: null })]);
    const e = b.bus.entidades[0];
    b.bus.danar(e, 99, { tipo: "club" });
    const primera = b.bus.recoger().filter((s) => s.tipo === "romper").length;
    b.bus.danar(e, 99, { tipo: "club" });
    b.bus._romper(e);
    assert.equal(primera, 1);
    assert.equal(b.bus.recoger().filter((s) => s.tipo === "romper").length, 0);
  });
});

describe("69 · `Die` borra su propio nombre ANTES de disparar", () => {
  // El bucle de Edana, montado a mano — y con un `trigger_relay` donde el mapa
  // pone un `func_door`, a propósito.
  //
  // Porque **`func_door` no está portado** (ni su movimiento ni su `target`: cae
  // en el `default` de `usar`), así que con la entidad de verdad esta prueba
  // mediría el hueco de la puerta y no la línea del nombre. Lo que se prueba aquí
  // es `Die`; que la puerta de Edana no devuelva el disparo se mide abajo, en su
  // sitio y con su cuenta.
  const corral = () => banco([
    { clase: "func_breakable", nombre: "hay", material: 1, vida: 5, banderas: 0 },
    { clase: "func_breakable", nombre: "hay", material: 1, vida: 8, banderas: 0, objetivo: "sewer_door" },
    { clase: "func_breakable", nombre: "hay", material: 1, vida: 10, banderas: 0 },
    { clase: "func_breakable", nombre: "hay", material: 1, vida: 11, banderas: 0 },
    { clase: "trigger_relay", nombre: "sewer_door", objetivo: "hay", uso: USO.ALTERNAR },
  ]);

  test("rompiendo el de 8, la puerta revienta LOS OTROS TRES y no a él", () => {
    const b = corral();
    const elDeOcho = b.bus.entidades[1];
    b.bus.danar(elDeOcho, 4, { tipo: "club" });       // 8 − 4×2 = 0
    const roturas = b.bus.recoger().filter((s) => s.tipo === "romper");
    // Cuatro y no cinco: el que abrió la cloaca no se rompe dos veces.
    assert.equal(roturas.length, 4);
    assert.ok(b.bus.entidades.slice(0, 4).every((e) => e.est.roto));
    // Y el orden: el de 8 primero, porque es el que recibió el golpe.
    assert.equal(roturas[0].nombre, "hay");
    assert.equal(roturas[0].por, "dano");
    assert.ok(roturas.slice(1).every((s) => s.por === "disparo"));
  });

  test("y el nombre se ha ido de verdad: `porNombre` deja de encontrarlo", () => {
    const b = corral();
    assert.equal(b.bus.porNombre("hay").length, 4);
    b.bus.danar(b.bus.entidades[1], 99, { tipo: "club" });
    assert.equal(b.bus.porNombre("hay").length, 0, "los cuatro se han roto");
    assert.equal(b.bus.entidades[1].nombre, null);
    assert.equal(b.bus.entidades[1].est.seLlamaba, "hay");
  });

  test("EL CONTROL NEGATIVO: rompiendo cualquiera de los otros tres no pasa nada más", () => {
    for (const k of [0, 2, 3]) {
      const b = corral();
      b.bus.danar(b.bus.entidades[k], 99, { tipo: "club" });
      const roturas = b.bus.recoger().filter((s) => s.tipo === "romper");
      assert.equal(roturas.length, 1, `el almiar ${k} no abre la cloaca`);
      assert.equal(b.bus.porNombre("hay").length, 3);
    }
  });

  test("y si NO se borrara el nombre, la puerta rompería al que la abrió: se mide", () => {
    // El control positivo del borrado. Se hace a mano lo que hace `Die` menos la
    // línea del nombre, y se comprueba que entonces la cadena vuelve sobre él.
    const b = corral();
    const e = b.bus.entidades[1];
    // Sin quitar el nombre: se dispara `sewer_door`, que dispara `hay`, y `hay`
    // sigue incluyéndole. Lo que demuestra que esa línea del mod hace algo.
    assert.ok(b.bus.porNombre("hay").includes(e));
    b.bus.disparar("sewer_door");
    const roturas = b.bus.recoger().filter((s) => s.tipo === "romper");
    assert.equal(roturas.length, 4, "los cuatro, él incluido, porque nadie lo ha borrado");
  });
});

describe("69 · un almiar se tapaba A SÍ MISMO, y por eso no se podía golpear", () => {
  // El fallo estaba ENTRE dos piezas correctas, que es como se equivoca esto.
  //
  // `elegirObjetivo` pide una traza libre hasta el centro del objetivo, igual que
  // el motor (`UTIL_TraceLine(vecSrc, pTarget->Center(), ignore_monsters)`,
  // giattack.cpp:1547-1580). Con `ignore_monsters` un monstruo no se tapa a sí
  // mismo — pero un `func_breakable` es geometría de colisión de verdad, así que
  // el rayo choca contra su propia cara y el almiar salía por «pared en medio».
  // Estaba dentro del cono, estaba a tiro, y no se podía golpear nunca.
  const almiarCandidato = { centro: [100, 0, 0], vivo: true, rompible: { colisionador: { handle: 7 } } };
  const tiro = (libre) => elegirObjetivo({
    desde: [0, 0, 0], mirando: [0, 0, -1], alcance: 200,
    candidatos: [almiarCandidato], libre,
    // El cono se desactiva con un vector que apunte al objetivo.
    cono: -1,
  });

  test("con la traza vieja —que no sabe a quién apunta— el almiar es intocable", () => {
    // Lo que hacía `trazaLibre` antes: cualquier cosa sólida en medio, y la cosa
    // sólida es él.
    const viejo = () => false;
    assert.equal(tiro(viejo), null);
  });

  test("y con el candidato en la mano, la traza puede dejar fuera SU colisionador", () => {
    let recibido = null;
    const nuevo = (desde, hasta, cand) => {
      recibido = cand;
      // Igual que `trazaLibre`: se ignora el colisionador del propio objetivo.
      const propio = cand?.rompible?.colisionador?.handle;
      return propio === 7;
    };
    const r = tiro(nuevo);
    assert.ok(r, "ahora sí le da");
    assert.equal(r.objetivo, almiarCandidato);
    // Y el tercer argumento llega de verdad: sin esto la prueba de arriba pasaría
    // igual por cualquier otra razón.
    assert.equal(recibido, almiarCandidato);
  });

  test("EL CONTROL: una pared que NO es el objetivo sigue tapándolo", () => {
    const conPared = (desde, hasta, cand) => cand?.rompible?.colisionador?.handle === 99;
    assert.equal(tiro(conPared), null);
  });
});

describe("69 · `func_button`: `health` no es vida", () => {
  const boton = (extra = {}) => ({
    clase: "func_button", nombre: "appledrop", objetivo: "appledropMM",
    vida: 2, espera: -1, velocidad: 5, banderas: SF_BOTON.NO_SE_MUEVE, ...extra,
  });

  test("UN golpe de 1 abre un botón de `health 2`, y la vida no baja", () => {
    const b = banco([boton(), { clase: "multi_manager", nombre: "appledropMM", objetivos: [] }]);
    const e = b.de("appledrop");
    assert.equal(b.bus.danar(e, 1, { tipo: "club" }), true);
    assert.equal(e.est.vida, 2, "`TakeDamage` no resta: buttons.cpp:439-466");
    assert.ok(e.est.pulsado);
    const s = b.bus.recoger();
    assert.equal(s.filter((x) => x.tipo === "boton").length, 1);
    assert.ok(s.some((x) => x.tipo === "boton" && x.sePega === true));
  });

  test("y `wait -1` lo deja pulsado: el segundo golpe no dispara nada", () => {
    const b = banco([boton(), { clase: "multi_manager", nombre: "appledropMM", objetivos: [] }]);
    const e = b.de("appledrop");
    b.bus.danar(e, 99, { tipo: "club" });
    b.bus.recoger();
    assert.equal(b.bus.danar(e, 99, { tipo: "club" }), false);
    const s = b.bus.recoger();
    assert.equal(s.filter((x) => x.tipo === "boton").length, 0);
    assert.ok(s.some((x) => x.que === "boton_ya_pulsado"));
  });

  test("EL CONTROL: con `wait` normal no se pega, y se puede volver a pulsar", () => {
    const b = banco([boton({ espera: 3 }), { clase: "multi_manager", nombre: "appledropMM", objetivos: [] }]);
    const e = b.de("appledrop");
    assert.equal(b.bus.danar(e, 1, { tipo: "club" }), true);
    assert.equal(e.est.pulsado, false);
    assert.equal(b.bus.danar(e, 1, { tipo: "club" }), true, "y otra vez");
    assert.equal(b.bus.recoger().filter((x) => x.tipo === "boton").length, 2);
  });

  test("sin `health` el botón NO acepta daño: hay que usarlo", () => {
    const b = banco([boton({ vida: 0 }), { clase: "multi_manager", nombre: "appledropMM", objetivos: [] }]);
    const e = b.de("appledrop");
    assert.equal(b.bus.danar(e, 999, { tipo: "club" }), false);
    assert.ok(b.bus.recoger().some((x) => x.que === "boton_no_golpeable"));
    // Y usándolo sí: `SetUse(ButtonUse)` (buttons.cpp:539-547).
    b.bus.disparar("appledrop");
    assert.ok(e.est.pulsado);
  });

  test("un maestro cerrado lo bloquea, y eso lo pregunta `ButtonActivate`", () => {
    const b = banco([
      boton({ maestro: "reja" }),
      { clase: "multisource", nombre: "reja", objetivo: null },
      { clase: "trigger_relay", nombre: "x", objetivo: "reja" },
    ]);
    const e = b.de("appledrop");
    assert.equal(b.bus.danar(e, 1, { tipo: "club" }), false);
    assert.ok(b.bus.recoger().some((x) => x.que === "boton_cerrado"));
    assert.equal(e.est.pulsado, false);
  });
});

describe("69 · `msitem_spawn`: `spawnstart` al revés y `duration` sin leer", () => {
  const spawner = (extra = {}) => ({
    clase: "msitem_spawn", nombre: "apple5spawn", guion: "health_apple",
    porDisparo: true, duracionIgnorada: "60", unidades: [-2136, 2741, 143], ...extra,
  });

  test("el objeto hereda el `targetname` DEL APARECEDOR, no el de su guion", () => {
    const b = banco([spawner()]);
    b.bus.disparar("apple5spawn");
    const s = b.bus.recoger().find((x) => x.tipo === "objeto_aparece");
    // `pItem->pev->targetname = pev->targetname` (gispawn.cpp:40).
    assert.equal(s.nombre, "apple5spawn");
    assert.equal(s.guion, "health_apple");
    assert.equal(s.vez, 1);
  });

  test("`Use` NO mira el tipo de uso: apagarlo también suelta el objeto", () => {
    const b = banco([spawner()]);
    // `void CBaseGISpawn::Use(...) { SpawnItem(); }` — una línea (gispawn.cpp:23-26).
    b.bus.disparar("apple5spawn", null, USO.APAGAR, 0);
    assert.equal(b.bus.recoger().filter((x) => x.tipo === "objeto_aparece").length, 1);
  });

  test("no hay tope: cada disparo suelta otro", () => {
    const b = banco([spawner()]);
    for (let i = 0; i < 3; i++) b.bus.disparar("apple5spawn");
    const s = b.bus.recoger().filter((x) => x.tipo === "objeto_aparece");
    assert.deepEqual(s.map((x) => x.vez), [1, 2, 3]);
  });

  test("un aparecedor sin nombre y con `spawnstart 1` no lo puede llamar NADIE", () => {
    // Que es el caso de tres de los cuatro de Edana, y es un resultado del mapa.
    const b = banco([spawner({ nombre: null })]);
    b.bus.disparar("apple5spawn");
    assert.equal(b.bus.recoger().filter((x) => x.tipo === "objeto_aparece").length, 0);
  });
});

describe("69 · la cadena de la manzana, de punta a punta", () => {
  test("golpear el botón suelta una manzana, y sólo una", () => {
    const b = banco([
      { clase: "func_button", nombre: "appledrop", objetivo: "appledropMM",
        vida: 2, espera: -1, velocidad: 5, banderas: SF_BOTON.NO_SE_MUEVE },
      // `retraso` y no `cuando`: es la clave que escribe `objetivosDeManager`.
      // Lo escribí mal y el multi_manager no disparaba nada — la prueba
      // construyendo a mano un argumento que el horneado escribe de otra forma,
      // que es la trampa del 59. La versión de abajo, contra el mapa de verdad,
      // es la que no se puede equivocar así.
      { clase: "multi_manager", nombre: "appledropMM", objetivos: [{ nombre: "apple5spawn", retraso: 0 }] },
      { clase: "msitem_spawn", nombre: "apple5spawn", guion: "health_apple",
        porDisparo: true, duracionIgnorada: "60", unidades: [-2136, 2741, 143] },
      { clase: "env_render", nombre: "apple5spawn", objetivo: "apple5", rendermode: 4, renderamt: 0 },
    ]);
    b.bus.danar(b.de("appledrop"), 1, { tipo: "club" });
    b.correr(1);
    const s = b.bus.recoger();
    const manzanas = s.filter((x) => x.tipo === "objeto_aparece");
    assert.equal(manzanas.length, 1);
    assert.equal(manzanas[0].guion, "health_apple");
    // Y el `env_render` del árbol recibe el mismo disparo: dos entidades con el
    // mismo `targetname`, y `FireTargets` llama a las dos. Sale con
    // `enElBus: false` porque su objetivo, `apple5`, es un `env_model` y no una
    // entidad del cableado — que es el hueco que el 69 encontró y midió.
    const r = s.filter((x) => x.tipo === "render");
    assert.equal(r.length, 1);
    assert.equal(r[0].enElBus, false);
    assert.equal(r[0].nombre, "apple5");
    assert.equal(r[0].cantidad, 0, "y lo que pide es dejarlo invisible");
    // Segundo golpe: nada, el botón se quedó pulsado.
    b.bus.danar(b.de("appledrop"), 1, { tipo: "club" });
    b.correr(1);
    assert.equal(b.bus.recoger().filter((x) => x.tipo === "objeto_aparece").length, 0);
  });
});

describe("69 · EDANA de verdad, contra el horneado", () => {
  const m = cargar("edana");
  const rompibles = () => m.disparadores.filter((d) => d.clase === "func_breakable");

  test("cuatro almiares, los cuatro llamados `hay` y los cuatro de MADERA", (t) => {
    if (!m) return t.skip("no está build/edana");
    const r = rompibles();
    assert.equal(r.length, 4);
    assert.ok(r.every((d) => d.nombre === "hay"));
    // `material 1` es `matWood` (func_break.h:24-35) — y el comentario del propio
    // `KeyValue` dice «1:metal», que es falso.
    assert.ok(r.every((d) => d.material === 1));
    assert.deepEqual(r.map((d) => d.vida).sort((a, b) => a - b), [5, 8, 10, 11]);
    // Ninguno trae banderas: sólo se rompen a golpes.
    assert.ok(r.every((d) => !d.banderas));
  });

  test("y el material que el horneado escribe con nombre dice madera, no metal", (t) => {
    if (!m) return t.skip("no está build/edana");
    const f = m.interactivas.rompibles;
    assert.equal(f.length, 4);
    assert.ok(f.every((x) => x.materialNombre === "madera"),
      `salió ${[...new Set(f.map((x) => x.materialNombre))]}`);
  });

  test("sólo UNO de los cuatro abre la cloaca", (t) => {
    if (!m) return t.skip("no está build/edana");
    const con = rompibles().filter((d) => d.objetivo);
    assert.equal(con.length, 1);
    assert.equal(con[0].objetivo, "sewer_door");
    assert.equal(con[0].vida, 8, "y es el de 8, no el de 5");
  });

  test("`sewer_door` son DOS entidades, y la puerta apunta de vuelta a `hay`", (t) => {
    if (!m) return t.skip("no está build/edana");
    const d = m.disparadores.filter((x) => x.nombre === "sewer_door");
    assert.equal(d.length, 2);
    assert.deepEqual(d.map((x) => x.clase).sort(), ["func_door", "trigger_relay"]);
    // El bucle, EN EL MAPA: la puerta revienta los almiares que quedan.
    assert.equal(d.find((x) => x.clase === "func_door").objetivo, "hay");
  });

  test("...PERO ese bucle no se cierra aquí, porque `func_door` no está portado", (t) => {
    if (!m) return t.skip("no está build/edana");
    // Edana tiene 3 `func_door` —puertas DESLIZANTES— y ninguna está montada:
    // `montarPuertas` sólo coge `func_door_rotating`, que son otras 7. Así que la
    // de la cloaca sigue horneada en el trimesh del mundo: ni se abre ni devuelve
    // el disparo. Se cuenta, y el número es el que cambiará cuando se porte.
    const deslizantes = m.disparadores.filter((d) => d.clase === "func_door");
    assert.equal(deslizantes.length, 3);
    assert.equal(deslizantes.filter((d) => d.objetivo).length, 1, "y sólo una tiene target");
    const montadas = m.interactivas.puertas ?? [];
    assert.equal(montadas.length, 7, "las 7 giratorias, ninguna deslizante");
    // Gate City no tiene ninguna, que es por lo que esto no se había visto.
    const g = cargar("gatecity");
    if (g) assert.equal(g.disparadores.filter((d) => d.clase === "func_door").length, 0);
  });

  test("cada rompible tiene malla, triángulos y su índice de entidad", (t) => {
    if (!m) return t.skip("no está build/edana");
    for (const f of m.interactivas.rompibles) {
      assert.ok(f.triangulos > 0, `${f.tramo} sin triángulos`);
      assert.ok(Number.isInteger(f.entidad) && f.entidad >= 0);
      assert.ok(m.bin.tramos[`${f.tramo}ChoquePositions`], `${f.tramo} sin malla de choque`);
      // Y su fila del cableado existe y es la misma entidad.
      assert.ok(m.disparadores.some((d) => d.entidad === f.entidad && d.clase === "func_breakable"));
    }
  });

  test("el botón de la manzana: `health 2`, no se mueve y dispara una vez", (t) => {
    if (!m) return t.skip("no está build/edana");
    const b = m.disparadores.filter((d) => d.clase === "func_button");
    assert.equal(b.length, 1);
    assert.equal(b[0].vida, 2);
    assert.equal(b[0].espera, -1);
    assert.equal(b[0].objetivo, "appledropMM");
    assert.ok(b[0].banderas & SF_BOTON.NO_SE_MUEVE);
    assert.ok(!(b[0].banderas & SF_BOTON.POR_TOQUE), "no es de toque: es de usar y de golpear");
  });

  test("los cuatro `msitem_spawn` esperan un disparo, y a TRES no les puede llegar", (t) => {
    if (!m) return t.skip("no está build/edana");
    const s = m.disparadores.filter((d) => d.clase === "msitem_spawn");
    assert.equal(s.length, 4);
    assert.ok(s.every((d) => d.porDisparo), "los cuatro traen `spawnstart 1`");
    const sinNombre = s.filter((d) => !d.nombre);
    assert.equal(sinNombre.length, 3);
    // Y nadie los cita, así que no es que les falte el cable: es que no hay.
    const citados = new Set(m.disparadores.flatMap((d) => [d.objetivo, d.matar,
      ...(d.objetivos ?? []).map((x) => x.nombre)]).filter(Boolean));
    assert.ok(!citados.has(null));
    assert.deepEqual(s.filter((d) => d.nombre).map((d) => d.nombre), ["apple5spawn"]);
    assert.ok(citados.has("apple5spawn"), "y al que sí tiene nombre lo llama el multi_manager");
  });

  test("`duration` está en el mapa y NO la lee nadie: se marca como ignorada", (t) => {
    if (!m) return t.skip("no está build/edana");
    const con = m.disparadores.filter((d) => d.clase === "msitem_spawn" && d.duracionIgnorada);
    assert.equal(con.length, 2);
    assert.deepEqual(con.map((d) => d.duracionIgnorada).sort(), ["60", "90000"]);
  });

  test("SEIS de los siete `env_render` apuntan a un ADORNO, no a una entidad del bus", (t) => {
    if (!m) return t.skip("no está build/edana");
    // El hallazgo del 69, y es la trampa del 62 con otra ropa: `env_render` está
    // portado desde el 49, citado y en verde, y su objetivo no existía en el bus
    // en seis de siete casos — los cuatro platos de sopa de la taberna y la
    // manzana del huerto son `env_model`. Gate City tiene CERO `env_render`, que
    // es por lo que nadie lo vio.
    const b = banco(m.disparadores);
    const rs = b.porClase("env_render");
    assert.equal(rs.length, 7);
    for (const e of rs) b.bus.usar(e, null, USO.ALTERNAR, 0);
    const s = b.bus.recoger().filter((x) => x.tipo === "render");
    assert.equal(s.filter((x) => x.enElBus === false).length, 6);
    assert.equal(s.filter((x) => x.enElBus === true).length, 2, "los dos `func_water` de la fuente");
    // Y los nombres a los que no llegaba: la manzana y las cuatro sopas.
    const fuera = s.filter((x) => !x.enElBus).map((x) => x.nombre).sort();
    assert.ok(fuera.includes("apple5"));
    assert.equal(fuera.filter((n) => /soup$/.test(n)).length, 4);
  });

  test("y ahora los adornos SÍ traen nombre, que es lo que faltaba para alcanzarlos", (t) => {
    if (!m) return t.skip("no está build/edana");
    const c = m.adornos?.colocaciones ?? [];
    assert.ok(c.length > 0);
    const conNombre = c.filter((x) => x.nombre);
    // Nueve de 46, y antes del 69 eran CERO: los cuatro platos de sopa y cinco
    // manzanas. De las cinco, **cuatro se llaman `apple1`** y ningún `env_render`
    // las nombra: la que se apaga al pulsar el botón es sólo `apple5`.
    assert.equal(conNombre.length, 9);
    assert.equal(conNombre.filter((x) => /soup$/.test(x.nombre)).length, 4);
    assert.equal(conNombre.filter((x) => x.nombre === "apple1").length, 4);
    assert.equal(conNombre.filter((x) => x.nombre === "apple5").length, 1);
    // Y su modo de dibujo de nacimiento, que es al que habría que volver.
    const manzana = conNombre.find((x) => x.nombre === "apple5");
    assert.equal(manzana.render.cantidad, 255, "nace visible; el env_render la pone a 0");
  });

  test("EL BUS DE EDANA ENTERO: un golpe al almiar de 8 abre la cloaca", (t) => {
    if (!m) return t.skip("no está build/edana");
    const b = banco(m.disparadores);
    const almiares = b.porClase("func_breakable");
    const elDeOcho = almiares.find((e) => e.vida === 8);
    assert.ok(elDeOcho, "el de 8 de vida es el que abre la cloaca");
    b.bus.danar(elDeOcho, 4, { tipo: "club" });       // 8 − 4×2
    b.correr(2);                                       // el relé de la cloaca
    const s = b.bus.recoger();
    // ── CORRECCIÓN DEL 70 ───────────────────────────────────────────────────
    //
    // Esta prueba nació pidiendo **1** y con esto escrito al lado: «los otros
    // tres caerían cuando la puerta devolviera el disparo a `hay`, y la puerta
    // no está portada. Este número es el que subirá a 4 el día que se porten
    // las deslizantes». Es ese día. Se deja escrito el 1 porque el número
    // viejo es la medida de cuánto faltaba, y el nuevo no se entiende sin él.
    //
    // La tapa tarda 126 u a 100 u/s = 1,26 s en llegar arriba, y los dos
    // segundos de `correr` la pasan. Si alguien acorta esa espera, esto vuelve
    // a valer 1 — y ése es justo el rojo que hay que ver.
    assert.equal(s.filter((x) => x.tipo === "romper").length, 4);
    assert.equal(b.bus.porNombre("hay").length, 0, "la puerta se ha llevado a los otros tres");
    // Y el orden importa: el disparo a `hay` no sale al ARRANCAR la puerta sino
    // al llegar arriba (`DoorHitTop`, doors.cpp:673), así que entre el primer
    // `romper` y los otros tres hay una `puerta_llega` por medio.
    const tipos = s.map((x) => x.tipo);
    assert.ok(tipos.indexOf("puerta_llega") > tipos.indexOf("romper"),
      "la tapa llega arriba DESPUÉS del almiar que la abrió");
    assert.ok(tipos.lastIndexOf("romper") > tipos.indexOf("puerta_llega"),
      "y los otros tres caen DESPUÉS de que llegue");
    assert.ok(s.some((x) => x.tipo === "borrar"), "y el relé ha matado a `sewer_open`");
  });

  test("70 · y a medio camino la tapa está a medio camino, no abierta", (t) => {
    if (!m) return t.skip("no está build/edana");
    const b = banco(m.disparadores);
    const tapa = b.porClase("func_door").find((e) => e.nombre === "sewer_door");
    assert.ok(tapa, "`sewer_door` es la tapa de la cloaca");
    const elDeOcho = b.porClase("func_breakable").find((e) => e.vida === 8);
    b.bus.danar(elDeOcho, 4, { tipo: "club" });
    b.bus.recoger();
    // 126 u a 100 u/s: 1,26 s. A los 0,63 va por la mitad.
    b.correr(0.63);
    const f = b.bus.fraccionDePuerta(tapa);
    assert.ok(f > 0.4 && f < 0.6, `a mitad de camino, y salió ${f.toFixed(3)}`);
    assert.equal(b.bus.porNombre("hay").length, 3, "y los otros tres siguen en pie");
    b.correr(1);
    assert.equal(b.bus.fraccionDePuerta(tapa), 1);
    assert.equal(b.bus.porNombre("hay").length, 0);
  });

  test("y el botón de la manzana, por el bus de verdad", (t) => {
    if (!m) return t.skip("no está build/edana");
    const b = banco(m.disparadores);
    const boton = b.porClase("func_button")[0];
    assert.equal(b.bus.danar(boton, 1, { tipo: "club" }), true);
    b.correr(2);
    const s = b.bus.recoger();
    const manzanas = s.filter((x) => x.tipo === "objeto_aparece");
    assert.equal(manzanas.length, 1);
    assert.equal(manzanas[0].nombre, "apple5spawn");
    assert.equal(manzanas[0].guion, "health_apple");
  });
});

describe("69 · GATE CITY, el segundo caso — y aquí hay más, no menos", () => {
  const m = cargar("gatecity");

  test("dieciséis rompibles, y ONCE no tienen ni nombre ni objetivo", (t) => {
    if (!m) return t.skip("no está build/gatecity");
    const r = m.disparadores.filter((d) => d.clase === "func_breakable");
    assert.equal(r.length, 16);
    assert.equal(r.filter((d) => !d.nombre && !d.objetivo).length, 11);
  });

  test("las CUATRO bolsas de las crías de rata: carne, 1 de vida, y cada una la suya", (t) => {
    if (!m) return t.skip("no está build/gatecity");
    const bolsas = m.disparadores.filter((d) => d.clase === "func_breakable" &&
      String(d.objetivo ?? "").startsWith("spawn_babies"));
    assert.equal(bolsas.length, 4);
    // `material 3` es `matFlesh`, y con 1 de vida cae con cualquier golpe.
    assert.ok(bolsas.every((d) => d.material === 3 && d.vida === 1));
    assert.equal(new Set(bolsas.map((d) => d.objetivo)).size, 4);
  });

  test("y al romper una bolsa, su área de crías recibe el disparo", (t) => {
    if (!m) return t.skip("no está build/gatecity");
    const b = banco(m.disparadores);
    const bolsa = b.porClase("func_breakable").find((e) =>
      String(e.objetivo ?? "").startsWith("spawn_babies"));
    assert.equal(b.bus.danar(bolsa, 1, { tipo: "club" }), true);
    const s = b.bus.recoger();
    assert.equal(s.filter((x) => x.tipo === "romper").length, 1);
    assert.ok(s.some((x) => x.tipo === "area_reinicia" || x.tipo === "area_ignora" ||
      x.tipo === "usar"), "el área de las crías se ha enterado");
  });

  test("los cinco de `explosion 1` NO explotan: les falta `explodemagnitude`", (t) => {
    if (!m) return t.skip("no está build/gatecity");
    // `Explodable()` es `pev->impulse > 0` (func_break.h:66-67) y el impulso lo
    // pone `explodemagnitude`, que ninguno trae.
    const r = m.disparadores.filter((d) => d.clase === "func_breakable");
    assert.equal(r.filter((d) => d.magnitud > 0).length, 0);
    const b = banco(m.disparadores);
    for (const e of b.porClase("func_breakable")) b.bus.danar(e, 999, { tipo: "club" });
    const roturas = b.bus.recoger().filter((x) => x.tipo === "romper");
    assert.equal(roturas.length, 16);
    assert.equal(roturas.filter((x) => x.explota).length, 0);
  });

  test("y los cinco con `SF_BREAK_CROWBAR` son los de `spawnflags 262`", (t) => {
    if (!m) return t.skip("no está build/gatecity");
    const r = m.disparadores.filter((d) => d.clase === "func_breakable");
    const conPalanca = r.filter((d) => d.banderas & SF_ROMPER.PALANCA);
    assert.equal(conPalanca.length, 5);
    // Y traen además las dos que NO se portan: chocar y pisar.
    assert.ok(conPalanca.every((d) => (d.banderas & SF_ROMPER.AL_CHOCAR) &&
                                      (d.banderas & SF_ROMPER.AL_PISAR)));
  });

  test("Gate City no tiene ni un `func_button` ni un `msitem_spawn`", (t) => {
    if (!m) return t.skip("no está build/gatecity");
    assert.equal(m.disparadores.filter((d) => d.clase === "func_button").length, 0);
    assert.equal(m.disparadores.filter((d) => d.clase === "msitem_spawn").length, 0);
  });
});
