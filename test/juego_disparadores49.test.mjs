// 49 — El bus de disparadores: `target`, `targetname` y quién llama a quién.
//
// Dos capas de comprobación, y hacen falta las dos:
//
//   1. la REGLA, con entidades de mentira, donde se puede poner cada caso
//      raro del motor a mano —el multisource sin entradas, el maestro que no
//      es un maestro, el `#1` del multi_manager—;
//   2. LOS DOS MAPAS DE VERDAD, leídos de `build/`, donde lo que se mide es la
//      cadena entera: qué se dispara, en qué orden y qué pasa al llegar.
//
// Lo segundo necesita el horneado. Si no está, se salta y se dice.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  Disparadores, USO, SF, ENTVARS, ES_AREA, MULTISOURCE_ROTO,
  usoDeTriggerstate, sinAlmohadilla, objetivosDeManager, MAX_OBJETIVOS_DE_MANAGER,
} from "../src/play/disparadores.js";

/** Un bus con reloj y dado a mano: nada de `Date.now` ni de `Math.random`. */
function banco(lista) {
  const est = { t: 0, dado: 0.5 };
  const bus = new Disparadores(lista, { reloj: () => est.t, azar: () => est.dado });
  return {
    bus, est,
    /** Avanza el reloj en pasos de 10 ms, como el bucle. */
    correr(segundos) {
      const fin = est.t + segundos;
      let n = 0;
      while (est.t < fin - 1e-9) { est.t = Number((est.t + 0.01).toFixed(5)); n += bus.paso(); }
      return n;
    },
    tipos(salidas = bus.recoger()) {
      return salidas.filter((s) => s.tipo !== "evento_gm").map((s) => s.tipo);
    },
  };
}

// --- la traducción de las claves del mapa -----------------------------------

describe("49 · lo que dice el .bsp no es lo que usa el motor", () => {
  test("`triggerstate` NO es un USE_TYPE: el 2 es ALTERNAR y el 1 ENCENDER", () => {
    // triggers.cpp:219-233
    assert.equal(usoDeTriggerstate("0"), USO.APAGAR);
    assert.equal(usoDeTriggerstate("2"), USO.ALTERNAR);
    assert.equal(usoDeTriggerstate("1"), USO.ENCENDER);
    assert.equal(usoDeTriggerstate("7"), USO.ENCENDER, "cualquier otro cae en el default");
    // Y el control: copiarlo tal cual daría PONER, que es otra cosa.
    assert.notEqual(usoDeTriggerstate("2"), USO.PONER);
    assert.equal(USO.PONER, 2);
    assert.equal(USO.ALTERNAR, 3);
  });

  test("`UTIL_StripToken` corta en la almohadilla", () => {
    assert.equal(sinAlmohadilla("pstartl#1"), "pstartl");
    assert.equal(sinAlmohadilla("pstartl"), "pstartl");
    assert.equal(sinAlmohadilla("#1"), "");
  });

  test("un multi_manager convierte en objetivo lo que el motor no reconoce", () => {
    const objetivos = objetivosDeManager(Object.entries({
      classname: "multi_manager", origin: "1 2 3", angles: "0 0 0",
      targetname: "pstart", spawnflags: "1",
      ask: "3", "pstartl#1": "3", pstartl: "0",
      random: "1", wait: "2",
    }));
    // Ni `classname` ni `origin` ni `angles` ni `targetname` ni `spawnflags`
    // —son entvars— ni `random`/`wait` —son suyos—. Quedan tres.
    assert.deepEqual(objetivos, [
      { nombre: "pstartl", retraso: 0 },
      { nombre: "ask", retraso: 3 },
      { nombre: "pstartl", retraso: 3 },
    ]);
  });

  test("y el orden entre dos con el mismo retraso es el del archivo", () => {
    const o = objetivosDeManager([["b", "1"], ["a", "1"], ["c", "0"]]);
    assert.deepEqual(o.map((x) => x.nombre), ["c", "b", "a"], "burbuja estable, triggers.cpp:374");
  });

  test("CONTROL: `style` NO es entvars, así que en un manager SÍ es objetivo", () => {
    assert.ok(!ENTVARS.has("style"));
    assert.ok(ENTVARS.has("message"));
    assert.ok(ENTVARS.has("spawnflags"));
    const o = objetivosDeManager([["style", "32"], ["message", "hola"]]);
    assert.deepEqual(o, [{ nombre: "style", retraso: 32 }]);
  });

  test("del objetivo 17 en adelante el motor los DESCARTA en silencio", () => {
    const claves = [];
    for (let i = 0; i < 20; i++) claves.push([`t${i}`, "0"]);
    assert.equal(objetivosDeManager(claves).length, MAX_OBJETIVOS_DE_MANAGER);
  });
});

// --- el bus -----------------------------------------------------------------

describe("49 · FireTargets usa a TODAS las que se llamen igual", () => {
  test("dos entidades con el mismo targetname reciben las dos", () => {
    const { bus } = banco([
      { clase: "env_render", nombre: "a", objetivo: "x", renderamt: 1 },
      { clase: "env_render", nombre: "a", objetivo: "x", renderamt: 2 },
      { clase: "func_wall", nombre: "x" },
    ]);
    assert.equal(bus.disparar("a"), 2, "las dos, no la primera");
    assert.equal(bus.recoger().filter((s) => s.tipo === "render").length, 2);
  });

  test("un nombre que no existe no da error, y se cuenta", () => {
    const { bus } = banco([{ clase: "trigger_relay", nombre: "r", objetivo: "nadie" }]);
    assert.equal(bus.disparar("r"), 1);
    const s = bus.recoger();
    assert.equal(s.filter((x) => x.tipo === "sin_destinatario").length, 1);
  });
});

describe("49 · el retraso y el killtarget", () => {
  const mapa = () => [
    { clase: "trigger_once", nombre: "t", objetivo: "luz", retraso: 2, espera: -1 },
    { clase: "env_render", nombre: "luz", objetivo: "algo" },
    { clase: "func_wall", nombre: "algo" },
  ];

  test("con `delay` el disparo llega tarde, y ANTES no ha llegado", () => {
    const b = banco(mapa());
    b.bus.tocar(b.bus.entidades[0], { nombre: "jugador" });
    b.bus.recoger();
    b.correr(1.5);
    assert.equal(b.bus.cuenta.get("luz") ?? 0, 0, "a 1,5 s todavía no");
    b.correr(1.0);
    assert.equal(b.bus.cuenta.get("luz"), 1, "a 2,5 s sí");
  });

  test("el `killtarget` se lleva el retraso con él, y borra a TODOS", () => {
    const l = mapa();
    l[0].matar = "luz";
    l[0].objetivo = null;
    l.push({ clase: "env_render", nombre: "luz", objetivo: "algo" });
    const b = banco(l);
    b.bus.tocar(b.bus.entidades[0], {});
    b.bus.recoger();
    b.correr(1.0);
    assert.equal(b.bus.porNombre("luz").length, 2, "todavía vivos");
    b.correr(1.5);
    assert.equal(b.bus.porNombre("luz").length, 0, "los dos borrados");
  });

  test("sin `target` NI `killtarget` no se hace nada, ni siquiera se encola", () => {
    const b = banco([{ clase: "trigger_once", nombre: "t", espera: -1 }]);
    b.bus.tocar(b.bus.entidades[0], {});
    assert.equal(b.bus.pendientes.length, 0);
  });
});

describe("49 · trigger_once y trigger_multiple", () => {
  test("un trigger_once dispara UNA vez y se borra", () => {
    const b = banco([
      { clase: "trigger_once", nombre: "t", objetivo: "x", espera: -1 },
      { clase: "func_wall", nombre: "x" },
    ]);
    const t = b.bus.entidades[0];
    assert.equal(b.bus.tocar(t, {}), true);
    assert.equal(b.bus.tocar(t, {}), false, "ya no existe");
    assert.equal(b.bus.cuenta.get("x"), 1);
  });

  test("un trigger_multiple espera su `wait` y vuelve", () => {
    const b = banco([
      { clase: "trigger_multiple", nombre: "t", objetivo: "x", espera: 4 },
      { clase: "func_wall", nombre: "x" },
    ]);
    const t = b.bus.entidades[0];
    assert.equal(b.bus.tocar(t, {}), true);
    b.correr(1);
    assert.equal(b.bus.tocar(t, {}), false, "dentro del enfriamiento");
    b.correr(3.5);
    assert.equal(b.bus.tocar(t, {}), true, "pasado el `wait`");
    assert.equal(b.bus.cuenta.get("x"), 2);
  });

  test("`SF_TRIGGER_NOCLIENTS` deja al jugador fuera, y a los monstruos NO les basta", () => {
    const b = banco([
      { clase: "trigger_once", nombre: "t", objetivo: "x", espera: -1, banderas: SF.SIN_CLIENTES },
      { clase: "func_wall", nombre: "x" },
    ]);
    const t = b.bus.entidades[0];
    assert.equal(b.bus.tocar(t, {}, { esJugador: true }), false);
    // Sin SF_TRIGGER_ALLOWMONSTERS tampoco pasa un monstruo: son dos banderas.
    assert.equal(b.bus.tocar(t, {}, { esJugador: false }), false);
    t.banderas = SF.SIN_CLIENTES | SF.PERMITE_MONSTRUOS;
    assert.equal(b.bus.tocar(t, {}, { esJugador: false }), true);
  });
});

describe("49 · multi_manager", () => {
  const conManager = () => [
    { clase: "trigger_once", nombre: "t", objetivo: "mm", espera: -1 },
    { clase: "multi_manager", nombre: "mm", alAzar: 0,
      objetivos: [{ nombre: "a", retraso: 1 }, { nombre: "b", retraso: 2 }, { nombre: "c", retraso: 4 }] },
    { clase: "func_wall", nombre: "a" }, { clase: "func_wall", nombre: "b" }, { clase: "func_wall", nombre: "c" },
  ];

  test("reparte sus objetivos en el tiempo, en orden", () => {
    const b = banco(conManager());
    b.bus.tocar(b.bus.entidades[0], {});
    const visto = [];
    for (let i = 0; i < 500; i++) {
      b.correr(0.01);
      for (const n of ["a", "b", "c"]) {
        if (b.bus.cuenta.get(n) && !visto.some((v) => v.n === n)) visto.push({ n, t: b.est.t });
      }
    }
    assert.deepEqual(visto.map((v) => v.n), ["a", "b", "c"]);
    assert.ok(Math.abs(visto[0].t - 1) < 0.05, `a los ${visto[0].t}`);
    assert.ok(Math.abs(visto[2].t - 4) < 0.05, `a los ${visto[2].t}`);
  });

  test("mientras corre NO se le puede volver a usar, y después sí", () => {
    const b = banco(conManager());
    const mm = b.bus.entidades[1];
    b.bus.disparar("mm");
    b.correr(2.5);
    b.bus.disparar("mm");
    assert.equal(b.bus.cuenta.get("a"), 1, "el segundo disparo se pierde: SetUse(NULL)");
    b.correr(2);
    b.bus.disparar("mm");
    b.correr(5);
    assert.equal(b.bus.cuenta.get("a"), 2, "acabada la tanda vuelve a aceptar");
    assert.equal(mm.est.usable, true);
  });

  test("con `random 1` dispara UNO solo, y el dado decide cuál", () => {
    const l = conManager();
    l[1].alAzar = 1;
    const b = banco(l);
    b.est.dado = 0;                       // el primero
    b.bus.disparar("mm");
    b.correr(6);
    assert.equal(b.bus.cuenta.get("a"), 1);
    assert.equal(b.bus.cuenta.get("b") ?? 0, 0);
    assert.equal(b.bus.cuenta.get("c") ?? 0, 0);
  });
});

describe("49 · trigger_relay", () => {
  test("el activador pasa a ser el relé, y el `triggerstate` viaja", () => {
    const b = banco([
      { clase: "trigger_relay", nombre: "r", objetivo: "x", uso: USO.ENCENDER, probabilidad: 100 },
      // EL 70 cambió esto de `func_door` a `func_wall`, y el motivo merece una
      // línea porque no es cosmético: lo que mide esta prueba es que el
      // `triggerstate` LLEGA al otro lado, y para verlo hace falta que el otro
      // lado lo reenvíe en su salida. Una `func_door` ya no lo hace, y no por
      // un olvido: `CBaseDoor::Use` **no mira `useType`** (doors.cpp:549-554),
      // sólo su `m_toggle_state`. Dejarla aquí habría convertido esta prueba en
      // una prueba de puertas que da rojo por el motivo correcto.
      { clase: "func_wall", nombre: "x" },
    ]);
    b.bus.disparar("r", { nombre: "jugador" });
    const usos = b.bus.recoger().filter((s) => s.tipo === "usar");
    assert.equal(usos.length, 1);
    assert.equal(usos[0].uso, USO.ENCENDER);
  });

  test("`random` es una probabilidad sobre 99,9 y con 100 sale siempre", () => {
    const b = banco([
      { clase: "trigger_relay", nombre: "r", objetivo: "x", probabilidad: 100 },
      { clase: "func_wall", nombre: "x" },
    ]);
    b.est.dado = 0.999999;                // 99,89 < 100
    b.bus.disparar("r");
    assert.equal(b.bus.cuenta.get("x"), 1);
  });

  test("y con 50 el dado manda: el control es que con el mismo mapa sale y no sale", () => {
    const hacer = (dado) => {
      const b = banco([
        { clase: "trigger_relay", nombre: "r", objetivo: "x", probabilidad: 50 },
        { clase: "func_wall", nombre: "x" },
      ]);
      b.est.dado = dado;
      b.bus.disparar("r");
      return b.bus.cuenta.get("x") ?? 0;
    };
    assert.equal(hacer(0.1), 1, "9,99 < 50");
    assert.equal(hacer(0.9), 0, "89,9 no");
  });

  test("`SF_RELAY_FIREONCE` se borra a SÍ MISMO, no a sus tocayos", () => {
    const b = banco([
      { clase: "trigger_relay", nombre: "r", objetivo: "x", probabilidad: 100, banderas: SF.RELAY_UNA_VEZ },
      { clase: "trigger_relay", nombre: "r", objetivo: "x", probabilidad: 100 },
      { clase: "func_wall", nombre: "x" },
    ]);
    b.bus.disparar("r");
    assert.equal(b.bus.porNombre("r").length, 1, "el segundo sigue vivo");
  });
});

describe("49 · el maestro, y el multisource que no dispara", () => {
  // CORRECCIÓN DEL 68: aquí había un `entradas: [2, 3]` escrito a mano.
  //
  // Y con eso, las siete pruebas de abajo demostraban que `IsTriggered` y el `Use`
  // LEEN bien la lista de entradas, mientras **nadie en el proyecto la escribía**:
  // `CMultiSource::Register` no estaba portado, así que en el juego la lista era
  // `undefined` siempre, la reja estaba permanentemente abierta y el `Use`
  // rechazaba a todo el mundo por no ser miembro. Los dos huecos se tapaban.
  //
  // Es la trampa del 59 por tercera vez —la prueba construye el argumento que el
  // llamador nunca construye— y la segunda en que la escribí yo. Ahora la lista la
  // calcula `Register` a partir de quién apunta al multisource, que es lo que hace
  // el motor (buttons.cpp:241-270), y por eso ya no se pone aquí.
  const conMaestro = () => [
    { clase: "trigger_once", nombre: "t", objetivo: "x", espera: -1, maestro: "ms" },
    { clase: "multisource", nombre: "ms", objetivo: "jefe" },
    { clase: "trigger_relay", nombre: "r1", objetivo: "ms", probabilidad: 100 },
    { clase: "trigger_relay", nombre: "r2", objetivo: "ms", probabilidad: 100 },
    { clase: "func_wall", nombre: "x" },
    { clase: "func_wall", nombre: "jefe" },
  ];

  test("con el maestro cerrado el disparador no dispara", () => {
    const b = banco(conMaestro());
    assert.equal(b.bus.tocar(b.bus.entidades[0], {}), false);
  });

  test("y con las dos entradas puestas, sí", () => {
    const b = banco(conMaestro());
    b.bus.disparar("r1");
    assert.equal(b.bus.tocar(b.bus.entidades[0], {}), false, "falta una");
    b.bus.disparar("r2");
    assert.equal(b.bus.tocar(b.bus.entidades[0], {}), true);
  });

  test("EL FALLO DEL MOD: aun abierto, el multisource NO dispara su `target`", () => {
    assert.equal(MULTISOURCE_ROTO, true);
    const b = banco(conMaestro());
    b.bus.disparar("r1");
    b.bus.disparar("r2");
    b.correr(1);
    assert.equal(b.bus.cuenta.get("jefe") ?? 0, 0,
      "CBaseEntity::SUB_UseTargets sólo dispara si NO hay objetivo, subs.cpp:197");
    // Y EL CONTROL: por la vía buena el mismo objetivo sí se dispara, o esto
    // estaría verde por no haber cableado nada.
    b.bus.usarObjetivos(b.bus.entidades[1], null, USO.ALTERNAR, 0);
    assert.equal(b.bus.cuenta.get("jefe"), 1);
  });

  test("un multisource SIN entradas está ABIERTO, no cerrado", () => {
    // El 68: para que la lista salga vacía hay que quitarle a los relés el
    // `target`, que es lo que el motor pide — `m_iTotal` sale de contar a quién
    // apunta. Antes esta prueba escribía `entradas = []` a mano y con eso valía
    // igual con `Register` puesto que sin él.
    const l = conMaestro();
    l[2].objetivo = null;
    l[3].objetivo = null;
    const b = banco(l);
    assert.deepEqual(b.bus.entidades[1].entradas, [], "Register ha encontrado entradas que no hay");
    assert.equal(b.bus.tocar(b.bus.entidades[0], {}), true, "buttons.cpp:227-238");
  });

  test("y todo el que le apunta ES miembro, sin declararlo en ningún sitio", () => {
    // El otro lado de lo mismo (el 68): la pertenencia no se escribe, se descubre.
    const l = conMaestro();
    l.push({ clase: "trigger_relay", nombre: "r3", objetivo: "ms", probabilidad: 100 });
    const b = banco(l);
    assert.deepEqual(b.bus.entidades[1].entradas, [2, 3, 6]);
    // Y ahora hacen falta las TRES para abrir, no dos.
    b.bus.disparar("r1"); b.bus.disparar("r2");
    assert.equal(b.bus.tocar(b.bus.entidades[0], {}), false, "abre con dos de tres");
    b.bus.disparar("r3");
    assert.equal(b.bus.tocar(b.bus.entidades[0], {}), true);
  });

  test("un `master` que no es un multisource NO cierra nada", () => {
    const l = conMaestro();
    l[1].clase = "func_wall";
    const b = banco(l);
    assert.equal(b.bus.tocar(b.bus.entidades[0], {}), true,
      "«Master was null or not a master!» y devuelve 1, util.cpp:1494-1498");
  });

  test("y sólo mira a la PRIMERA con ese nombre", () => {
    const l = conMaestro();
    l.splice(1, 0, { clase: "func_wall", nombre: "ms" });   // una impostora delante
    const b = banco(l);
    assert.equal(b.bus.tocar(b.bus.entidades[0], {}), true, "la primera no es maestra: pasa");
  });

  test("quien usa un multisource sin ser miembro no cuenta", () => {
    // CORRECCIÓN DEL 68: antes esto añadía un tercer relé apuntando a `ms` y
    // esperaba que fuera «ajeno». Con `Register` portado eso es justo lo contrario
    // —apuntarle es SER miembro—, así que la prueba medía lo que no quería.
    //
    // El no-miembro de verdad, y el único que ocurre en el juego, es la copia
    // `DelayedUse` que el motor fabrica cuando el que llama tiene `delay`
    // (subs.cpp:252-269): no existía al registrar, así que nunca está en la lista.
    // Lo avisa el propio mod en la primera línea de `CMultiSource::Use`
    // (buttons.cpp:173-176), y es lo que deja sin salir al jefe jabalí de Edana.
    const l = conMaestro();
    l[2].retraso = 4;                     // r1 con `delay`, como `wave3_1`
    const b = banco(l);
    b.bus.disparar("r1");
    b.bus.recoger();
    b.correr(6);                          // vence el retraso: llega la copia
    const s = b.bus.recoger();
    const aj = s.filter((x) => x.que === "multisource_ajeno");
    assert.equal(aj.length, 1, "la copia del retraso no ha sido rechazada");
    assert.equal(aj[0].porRetraso, true);
    // Y la entrada NO se ha puesto, o sea que un relé con retraso nunca abre nada.
    assert.equal(b.bus.entidades[1].est.encendidas.size, 0);
  });
});

describe("49 · trigger_changetarget, env_render, teletransporte y empuje", () => {
  test("changetarget cambia el `target` de la PRIMERA, y sólo de ella", () => {
    const b = banco([
      { clase: "trigger_changetarget", nombre: "c", objetivo: "puerta", objetivoNuevo: "otra" },
      { clase: "trigger_multiple", nombre: "puerta", objetivo: "vieja", espera: 1 },
      { clase: "trigger_multiple", nombre: "puerta", objetivo: "vieja", espera: 1 },
      { clase: "func_wall", nombre: "vieja" }, { clase: "func_wall", nombre: "otra" },
    ]);
    b.bus.disparar("c");
    assert.equal(b.bus.entidades[1].est.objetivo, "otra");
    assert.equal(b.bus.entidades[2].est.objetivo, "vieja", "la segunda no se toca");
  });

  test("env_render manda su render a todas sus víctimas, y la máscara tapa campos", () => {
    const b = banco([
      { clase: "env_render", nombre: "e", objetivo: "v", renderamt: 200, rendermode: 4,
        renderfx: 0, rendercolor: [1, 2, 3], banderas: SF.RENDER_SIN_CANTIDAD },
      { clase: "func_wall", nombre: "v" },
    ]);
    b.bus.disparar("e");
    const r = b.bus.recoger().find((s) => s.tipo === "render");
    assert.equal(r.modo, 4);
    assert.equal(r.cantidad, null, "SF_RENDER_MASKAMT deja la cantidad como estaba");
    assert.deepEqual(r.color, [1, 2, 3]);
  });

  test("el teletransporte CICLA sus destinos, no los sortea", () => {
    const b = banco([{
      clase: "trigger_teleport", nombre: "tp", objetivo: "d", retraso: 0,
      destinos: [{ unidades: [1, 0, 0] }, { unidades: [2, 0, 0] }],
    }]);
    const tp = b.bus.entidades[0];
    const donde = [];
    for (let i = 0; i < 4; i++) {
      b.bus.tocar(tp, {});
      donde.push(b.bus.recoger().find((s) => s.tipo === "teletransportar").unidades[0]);
    }
    assert.deepEqual(donde, [1, 2, 1, 2], "iTeleIdx++ y vuelta, triggers.cpp:2454-2458");
  });

  test("y su `delay` es un ENFRIAMIENTO, no un retraso", () => {
    const b = banco([{
      clase: "trigger_teleport", nombre: "tp", objetivo: "d", retraso: 3,
      destinos: [{ unidades: [1, 0, 0] }],
    }]);
    const tp = b.bus.entidades[0];
    b.correr(1);                          // ver la prueba de abajo: en t=0 no arma
    assert.equal(b.bus.tocar(tp, {}), true, "la primera vez va, no espera 3 s");
    b.correr(1);
    assert.equal(b.bus.tocar(tp, {}), false);
    b.correr(2.5);
    assert.equal(b.bus.tocar(tp, {}), true);
  });

  test("y un teletransporte usado en el SEGUNDO CERO no arma su enfriamiento", () => {
    // `if (flLastTriggeredTime > 0 && ...)`, triggers.cpp:2282-2286. El tiempo
    // del último disparo se guarda tal cual, así que un cero significa las dos
    // cosas: «nunca» y «en el instante cero». No es nuestro: es del mod, y en
    // un mapa se nota si alguien cae en un teletransporte al aparecer.
    const b = banco([{
      clase: "trigger_teleport", nombre: "tp", objetivo: "d", retraso: 3,
      destinos: [{ unidades: [1, 0, 0] }],
    }]);
    const tp = b.bus.entidades[0];
    assert.equal(b.est.t, 0);
    assert.equal(b.bus.tocar(tp, {}), true);
    assert.equal(b.bus.tocar(tp, {}), true, "el enfriamiento no se armó");
  });

  test("el empuje usa OTRAS banderas que los demás disparadores", () => {
    const b = banco([{ clase: "trigger_push", velocidad: 900, direccion: [-1, 0, 0], banderas: 32 }]);
    const p = b.bus.entidades[0];
    assert.equal(b.bus.tocar(p, {}, { esJugador: false }), false, "el 32 es «sólo clientes»");
    assert.equal(b.bus.tocar(p, {}, { esJugador: true }), true);
    const e = b.bus.recoger().find((s) => s.tipo === "empujar");
    // `Math.abs` porque `-0` no es `0` para `Object.is`, y `deepEqual` lo usa:
    // está en doc/AVISOS.md desde antes de este experimento.
    assert.deepEqual(e.velocidad.map((v) => Math.abs(v)), [900, 0, 0]);
    assert.ok(e.velocidad[0] < 0, "y va hacia −X, que es el yaw 180 del mapa");
    assert.equal(e.unaVez, false);
  });
});

// --- los dos mapas de verdad ------------------------------------------------

const cargar = (m) => {
  const r = `build/${m}/malla.json`;
  return existsSync(r) ? JSON.parse(readFileSync(r, "utf8")) : null;
};

describe("49 · LA CADENA DE GATE CITY, y por qué no se ve", () => {
  const m = cargar("gatecity");

  // El 69 la subió de 39 a 50, y los once son `func_breakable` SIN NOMBRE: hasta
  // entonces sólo entraban los cableados —los que tienen `targetname` o
  // `target`— y las once rocas de Gate City no tienen ninguno de los dos. Entran
  // porque romperlas no necesita cable pero sí su vida y su material.
  test("el mapa trae su cableado, con los 16 rompibles del 69", (t) => {
    if (!m) return t.skip("no está build/gatecity");
    assert.equal(m.disparadores.length, 50);
    const c = (k) => m.disparadores.filter((d) => d.clase === k).length;
    assert.equal(c("func_breakable"), 16);
    // Y sólo cinco de los dieciséis disparan algo: las cuatro bolsas de las
    // crías de rata y la de 250 de vida que llama a `spawners10`.
    assert.equal(m.disparadores.filter((d) => d.clase === "func_breakable" && d.objetivo).length, 5);
    assert.equal(c("trigger_once"), 5);
    assert.equal(c("multi_manager"), 2);
    assert.equal(c("trigger_relay"), 1);
    assert.equal(c("msarea_monsterspawn") + c("ms_monsterspawn"), 16);
  });

  test("ningún objetivo citado se queda sin nombre en el mapa", (t) => {
    if (!m) return t.skip("no está build/gatecity");
    const nombres = new Set(m.disparadores.map((d) => d.nombre).filter(Boolean));
    const faltan = [];
    for (const d of m.disparadores) {
      for (const o of [d.objetivo, d.matar, ...(d.objetivos ?? []).map((x) => x.nombre)]) {
        if (o && !nombres.has(o)) faltan.push(o);
      }
    }
    assert.deepEqual(faltan, []);
  });

  test("EL RESULTADO: los cinco trigger_once llegan, y las once llegadas se IGNORAN", (t) => {
    if (!m) return t.skip("no está build/gatecity");
    const b = banco(m.disparadores);
    const tocables = b.bus.entidades.filter((e) => e.piezas);
    assert.equal(tocables.length, 5, "cinco volúmenes que se tocan");
    for (const e of tocables) assert.equal(b.bus.tocar(e, { nombre: "sonda" }), true);
    b.correr(15);                        // los retrasos del multi_manager llegan a 4 s
    const s = b.bus.recoger();
    const ignoradas = s.filter((x) => x.tipo === "area_ignora");
    const reinicios = s.filter((x) => x.tipo === "area_reinicia");
    assert.equal(ignoradas.length, 9, "nueve áreas alcanzadas");
    assert.equal(reinicios.length, 0, "y ninguna se reinicia");
    // Y EL CONTROL, porque «nueve ignoradas» sería verde también con un bus que
    // no dispara nada: las once llegadas están contadas por nombre —las nueve
    // áreas más los dos multi_manager que hay por el camino—.
    assert.equal([...b.bus.cuenta.values()].reduce((a, v) => a + v, 0), 11);
    assert.deepEqual([...b.bus.cuenta.keys()].sort(), [
      "mm_spiders", "mm_zombies", "spawners1", "spawners2", "spawners3",
      "spawners4", "spawners5", "spawners6", "spawners7", "spawners8", "spawners9",
    ]);
  });

  test("y el barril: romperlo dispara un relé que espera DIEZ segundos", (t) => {
    if (!m) return t.skip("no está build/gatecity");
    const b = banco(m.disparadores);
    const barril = b.bus.entidades.find((e) => e.clase === "func_breakable" && e.est.objetivo === "spawners10");
    assert.ok(barril, "el func_breakable *83, con 250 de vida");
    b.bus.usarObjetivos(barril, null, USO.ALTERNAR, 0);
    b.bus.recoger();
    b.correr(9);
    assert.equal(b.bus.cuenta.get("spawn_bowguys") ?? 0, 0, "a los 9 s todavía no");
    b.correr(2);
    assert.equal(b.bus.cuenta.get("spawn_bowguys"), 1, "a los 11 s sí");
    // Y el final de la cadena, otra vez: el área lo ignora.
    assert.ok(b.bus.recoger().some((x) => x.tipo === "area_ignora" && x.nombre === "spawn_bowguys"));
  });

  test("CONTROL del «se ignora»: con `resetwhen` puesto, la misma área SÍ reinicia", (t) => {
    if (!m) return t.skip("no está build/gatecity");
    const lista = m.disparadores.map((d) => (ES_AREA.has(d.clase) ? { ...d, reiniciarCuando: 2 } : d));
    const b = banco(lista);
    for (const e of b.bus.entidades.filter((x) => x.piezas)) b.bus.tocar(e, {});
    b.correr(15);
    const s = b.bus.recoger();
    assert.equal(s.filter((x) => x.tipo === "area_reinicia").length, 9);
    assert.equal(s.filter((x) => x.tipo === "area_ignora").length, 0,
      "o sea que lo que calla el mapa es `resetwhen`, no nuestro bus");
  });
});

describe("49 · EDANA, donde el bus sí lleva a alguna parte", () => {
  const m = cargar("edana");

  // El 67 subió la cuenta de 66 a 84: entraron los **18 `ms_npcscript`**, que
  // son las misiones del pueblo y que hasta entonces el extractor no miraba. La
  // cuenta se deja escrita a propósito, porque si vuelve a subir es que alguien
  // añadió una clase y hay que decir cuál.
  // Y el 69 la subió de 84 a 88: los cuatro `msitem_spawn`, que entran aunque
  // tres de ellos no tengan `targetname` — y ésa es justamente la medida que
  // hacía falta, porque un aparecedor de objetos con `spawnstart 1` y sin nombre
  // **no lo puede disparar nadie**. Los almiares y el botón ya estaban dentro:
  // tienen nombre.
  test("trae 88 entidades cableadas, con las 18 escenas de NPC del 67", (t) => {
    if (!m) return t.skip("no está build/edana");
    assert.equal(m.disparadores.length, 88);
    assert.equal(m.disparadores.filter((d) => d.clase === "msitem_spawn").length, 4);
    const c = (k) => m.disparadores.filter((d) => d.clase === k).length;
    assert.equal(c("trigger_teleport"), 4);
    assert.equal(c("env_render"), 7);
    assert.equal(c("multisource"), 1);
    assert.equal(c("trigger_changetarget"), 2);
    assert.equal(c("ms_npcscript"), 18);
    // Y de las 18, quince son del tipo 2 —lanzar un evento— que es el que está
    // portado. Los otros tres mueven al NPC y se declaran sin portar en el bus.
    const escenas = m.disparadores.filter((d) => d.clase === "ms_npcscript");
    assert.equal(escenas.filter((d) => d.tipo === 2).length, 15);
    // Cada una nombra a su NPC y a su evento: sin las dos cosas no hace nada.
    for (const d of escenas.filter((x) => x.tipo === 2)) {
      assert.ok(d.npc, `${d.nombre} sin NPC`);
      assert.ok(d.eventoDelNpc, `${d.nombre} sin evento`);
    }
  });

  test("los cuatro teletransportes tienen destino de verdad", (t) => {
    if (!m) return t.skip("no está build/edana");
    const tp = m.disparadores.filter((d) => d.clase === "trigger_teleport");
    for (const d of tp) assert.ok(d.destinos.length > 0, `${d.objetivo} sin destino`);
  });

  test("tocarlos mueve al jugador, y a un sitio distinto del que estaba", (t) => {
    if (!m) return t.skip("no está build/edana");
    const b = banco(m.disparadores);
    const tp = b.bus.entidades.filter((e) => e.clase === "trigger_teleport");
    for (const e of tp) {
      assert.equal(b.bus.tocar(e, { nombre: "sonda" }), true);
      const s = b.bus.recoger().find((x) => x.tipo === "teletransportar");
      assert.ok(s, `${e.est.objetivo} no teletransportó`);
      assert.equal(s.unidades.length, 3);
    }
  });

  test("tres objetivos del mapa no existen, y el motor los ignora igual", (t) => {
    if (!m) return t.skip("no está build/edana");
    const nombres = new Set(m.disparadores.map((d) => d.nombre).filter(Boolean));
    const citados = new Set();
    for (const d of m.disparadores) {
      if (d.objetivo) citados.add(d.objetivo);
      if (d.matar) citados.add(d.matar);
      for (const o of d.objetivos ?? []) citados.add(o.nombre);
    }
    // `Q_strcmp` distingue mayúsculas (pr_cmds.cpp:942), así que
    // `renderfountainBEANS` no es `renderFountainNormal` ni `renderBEANS`.
    assert.ok(citados.has("renderfountainBEANS"));
    assert.ok(!nombres.has("renderfountainBEANS"));
  });

  test("el multi_manager `pstart` de Edana ordena bien sus tres objetivos", (t) => {
    if (!m) return t.skip("no está build/edana");
    const mm = m.disparadores.find((d) => d.nombre === "pstart");
    assert.deepEqual(mm.objetivos, [
      { nombre: "pstartl", retraso: 0 },
      { nombre: "ask", retraso: 3 },
      { nombre: "pstartl", retraso: 3 },
    ]);
  });
});
