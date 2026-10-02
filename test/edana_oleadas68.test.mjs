// LAS TRES OLEADAS DEL CORRAL DE EDANA (experimento 68).
//
// El usuario se acordaba de que «el jefe jabalí aparecía después de matar x
// cantidad de jabalíes normales». El mapa dice que sí, y con una precisión que no
// se puede deducir del juego: quince jabalíes en tres oleadas encadenadas.
//
//   msarea_monsterspawn boars1          ← lleva el reloj, nace activa
//     ficha sin nombre  monsters/boar   lives 5             perishtarget wave2
//     ficha boar2       monsters/boar   lives 5 spawnstart 1 perishtarget wave3_1
//     ficha boar3       edana/boarhard  lives 5 spawnstart 1 perishtarget wave3_2
//     ficha boarboss    edana/boarboss  lives 1 spawnstart 1 killtarget   boarsdead
//   mstrig_multi wave2      → boar2, boar3   (los despierta)
//   trigger_relay wave3_1   → wave3          (delay 4)
//   trigger_relay wave3_2   → wave3          (delay 4)
//   multisource wave3       → boarboss       (dos entradas: los dos relés)
//
// Las dos claves que gobiernan esto tienen el nombre al revés, y las dos se
// portan por lo que HACEN:
//
// 1. `spawnstart 1` es `m_fSpawnOnTrigger = true` (msmapents.cpp:827-844), o sea
//    «no salgas hasta que te llamen». Encima de esa línea hay cuatro intentos de
//    Thothie de arreglar el nombre, comentados uno debajo de otro.
// 2. `killtarget` en un `msmonster_*` **no mata: dispara**
//    (msmonsterserver.cpp:2568-2569). No es la `killtarget` de `CBaseDelay`, que
//    sí borra entidades (subs.cpp:289-302). Mismo nombre, efecto opuesto.
//
// Y el final de la cadena está ROTO EN EL MOD, que es lo que estas pruebas fijan
// para que no se arregle sin querer: ver el último `describe`.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { Aparecedor, delCenso, PRIMER_PENSAMIENTO } from "../src/play/aparecer.js";
import { Disparadores, USO, MULTISOURCE_ROTO } from "../src/play/disparadores.js";

const medio = () => 0.5;

/** Un área con una sola ficha, para poder mirar una cosa a la vez. */
const conUna = (ficha) => new Aparecedor({
  areas: [{ nombre: "boars1", deGolpe: true }],
  plantillas: [{ id: 0, area: "boars1", ...ficha }],
  azar: medio,
});

/** Corre el reloj `segundos` y devuelve TODOS los sucesos, no sólo los últimos. */
const correr = (a, segundos, paso = 1 / 20) => {
  const todos = [];
  for (let t = 0; t < segundos; t += paso) todos.push(...a.tic(paso));
  return todos;
};

describe("`spawnstart`, que significa lo contrario de lo que suena", () => {
  test("con `porDisparo` NO sale, aunque pasen los 3 segundos y sobren vidas", () => {
    const a = conUna({ vidas: 5, porDisparo: true, esperaMin: 0, esperaMax: 0 });
    correr(a, 30);
    assert.equal(a.puestas, 0, "ha salido sin que nadie la llame");
    assert.equal(a.fichaDe(0).apariciones, 0);
    // Y NO cuenta como agotada: el área sigue viva esperándola. Si contara, un
    // `fireallperish` se dispararía solo al entrar al mapa.
    assert.equal(a.fichaDe(0).agotada, false);
  });

  // EL CONTROL POSITIVO del cero de arriba: la MISMA ficha sin la clave sale.
  test("sin `porDisparo` la misma ficha sale a los 3 segundos", () => {
    const a = conUna({ vidas: 5, porDisparo: false, esperaMin: 0, esperaMax: 0 });
    correr(a, PRIMER_PENSAMIENTO + 0.5);
    assert.equal(a.puestas, 1);
  });

  test("llamarla por su nombre la despierta, y la espera se pone a CERO", () => {
    // `MSQuery`: `triggered = true; deathtime = delayvalue = 0;` (:1310-1312).
    // Las dos cosas. Con una espera de 300 s, si sólo se pusiera `triggered` el
    // jefe tardaría cinco minutos en entrar.
    const a = conUna({ vidas: 1, porDisparo: true, nombre: "boarboss", esperaMin: 300, esperaMax: 300 });
    correr(a, 10);
    assert.equal(a.puestas, 0);
    assert.equal(a.disparar("boarboss"), true, "nadie contestó al nombre de la ficha");
    correr(a, 0.5);
    assert.equal(a.puestas, 1, "la ha despertado y no ha salido");
  });

  test("un nombre que no es de nadie no despierta nada", () => {
    const a = conUna({ vidas: 1, porDisparo: true, nombre: "boarboss" });
    assert.equal(a.disparar("merc3"), false);
    correr(a, 10);
    assert.equal(a.puestas, 0);
  });

  test("`porDisparo` frena la PRIMERA vez y sólo la primera", () => {
    // `lives == livesleft` es la tercera mitad de la condición (:1212): una vez
    // ha salido, ya no son iguales, así que vuelve por su cuenta. Esto es del
    // motor y es fácil de portar mal — «por disparo» suena a «siempre».
    const a = conUna({ vidas: 3, porDisparo: true, nombre: "boar2", esperaMin: 0, esperaMax: 0 });
    a.disparar("boar2");
    correr(a, 5);
    assert.equal(a.puestas, 1);
    a.muerto(0);
    correr(a, 5);
    assert.equal(a.fichaDe(0).apariciones, 2, "no ha vuelto sola después de la primera");
  });
});

describe("`perishtarget`, al gastar la última vida", () => {
  test("no dispara mientras queden vidas, y dispara al agotarlas", () => {
    const a = conUna({ vidas: 3, alPerecer: "wave2", nombre: null, esperaMin: 0, esperaMax: 0 });
    correr(a, 5);
    // Dos muertes con vida de sobra: nada.
    for (const _ of [1, 2]) {
      a.muerto(0);
      const s = correr(a, 1);
      assert.equal(s.filter((x) => x.que === "perece").length, 0, "ha disparado con vidas de sobra");
    }
    // La tercera es la última.
    a.muerto(0);
    const s = correr(a, 1);
    const p = s.filter((x) => x.que === "perece");
    assert.equal(p.length, 1, `esperaba UN perece y hay ${p.length}`);
    assert.equal(p[0].dispara, "wave2");
    assert.equal(a.fichaDe(0).agotada, true);
  });

  test("una ficha sin `perishtarget` se agota en silencio", () => {
    // El control negativo: si el `perece` saliera de agotarse y no de la clave,
    // esta ficha también lo daría.
    const a = conUna({ vidas: 1, alPerecer: null, esperaMin: 0, esperaMax: 0 });
    correr(a, 5);
    a.muerto(0);
    assert.equal(correr(a, 2).filter((x) => x.que === "perece").length, 0);
    assert.equal(a.fichaDe(0).agotada, true);
  });

  test("no dispara dos veces aunque se avise la muerte otra vez", () => {
    const a = conUna({ vidas: 1, alPerecer: "wave2", esperaMin: 0, esperaMax: 0 });
    correr(a, 5);
    a.muerto(0);
    a.muerto(0);
    assert.equal(correr(a, 2).filter((x) => x.que === "perece").length, 1);
  });

  // ESTO ES EL FALLO QUE SE VIO ANTES DE ESCRIBIRLO, y la prueba que lo fija.
  // `_rearmar` lo llama `muerto()`, que NO está dentro de un `tic`: un `push`
  // directo a `sucesos` caería en el array del tic anterior y el siguiente tic lo
  // borraría. El suceso tiene que sobrevivir al hueco entre dos tics.
  test("el `perece` de una muerte ENTRE dos tics no se pierde", () => {
    const a = conUna({ vidas: 1, alPerecer: "wave2", esperaMin: 0, esperaMax: 0 });
    correr(a, 5);
    a.tic(0.05);                 // un tic que vacía la bandeja
    a.muerto(0);                 // la muerte cae FUERA de cualquier tic
    const s = a.tic(0.05);       // y sale en el siguiente
    assert.equal(s.filter((x) => x.que === "perece").length, 1,
      "el perece se ha perdido en el hueco entre dos tics");
  });
});

const CENSO = "build/edana/bichos.json";
const MALLA = "build/edana/malla.json";
const falta = existsSync(CENSO) && existsSync(MALLA) ? false : `falta el horneado de edana`;

describe("el corral de Edana de verdad", { skip: falta }, () => {
  const censo = JSON.parse(readFileSync(CENSO, "utf8"));
  const malla = JSON.parse(readFileSync(MALLA, "utf8"));
  const fichas = censo.colocados.filter((c) => c.aparecedor?.area === "boars1");

  test("son cuatro fichas del mismo área, 15 vidas normales y 1 de jefe", () => {
    assert.equal(fichas.length, 4, `boars1 tiene ${fichas.length} fichas`);
    const jefe = fichas.find((f) => f.aparecedor.nombre === "boarboss");
    assert.ok(jefe, "no hay ficha boarboss");
    assert.equal(jefe.hp, 60, "el jefe no tiene 60 de vida");
    assert.equal(jefe.aparecedor.vidas, 1);
    assert.equal(jefe.alMorir, "boarsdead", "el jefe no avisa al viejo");
    // Las cuentas se calculan, no se escriben: 5+5+5 = 15 normales.
    const normales = fichas.filter((f) => f.aparecedor.nombre !== "boarboss");
    assert.equal(normales.reduce((s, f) => s + f.aparecedor.vidas, 0), 15);
  });

  test("la primera oleada sale sola y las otras tres esperan a que las llamen", () => {
    const sueltas = fichas.filter((f) => !f.aparecedor.porDisparo);
    assert.equal(sueltas.length, 1, "no hay exactamente una oleada que arranque sola");
    assert.equal(sueltas[0].aparecedor.alPerecer, "wave2");
    assert.equal(fichas.filter((f) => f.aparecedor.porDisparo).length, 3);
  });

  test("las tres oleadas están encadenadas por sus `perishtarget`", () => {
    const de = (n) => fichas.find((f) => f.aparecedor.nombre === n)?.aparecedor.alPerecer;
    assert.equal(de("boar2"), "wave3_1");
    assert.equal(de("boar3"), "wave3_2");
    // Y los dos relés van al MISMO multisource, que es lo que hace que haya que
    // agotar las dos oleadas y no una: `IsTriggered` pide todas las entradas.
    const rel = malla.disparadores.filter((d) => d.nombre === "wave3_1" || d.nombre === "wave3_2");
    assert.equal(rel.length, 2);
    assert.ok(rel.every((r) => r.objetivo === "wave3"), "los relés no van los dos a wave3");
    const ms = malla.disparadores.find((d) => d.nombre === "wave3" && d.clase === "multisource");
    assert.ok(ms, "no hay multisource wave3");
    assert.equal(ms.objetivo, "boarboss");
  });

  test("matando las 5 de la primera oleada se dispara `wave2` UNA vez", () => {
    const { areas, plantillas } = delCenso(censo);
    const a = new Aparecedor({ areas, plantillas, azar: medio });
    const id = plantillas.find((p) => p.area === "boars1" && !p.porDisparo).id;
    let avisos = 0;
    // Cinco vidas: sale, se muere, vuelve... y a la quinta muerte perece.
    for (let v = 0; v < 6; v++) {
      correr(a, 40);                       // de sobra para la espera de 5-25 s
      if (a.estaPuesto(id)) a.muerto(id);
      avisos += correr(a, 1).filter((s) => s.que === "perece" && s.dispara === "wave2").length;
    }
    assert.equal(avisos, 1, `wave2 se ha disparado ${avisos} veces y esperaba 1`);
    assert.equal(a.fichaDe(id).apariciones, 5, "no ha salido cinco veces");
  });

  // LA CADENA ENTERA, con el bus del mapa enganchado al aparecedor por los dos
  // lados, que es el único sitio donde se ve si el viaje funciona. Las dos mitades
  // estaban verdes por separado desde el 43 y la cadena no existía.
  test("agotadas las dos oleadas, `wave3` RECHAZA a los dos relés por el retraso", () => {
    const { areas, plantillas } = delCenso(censo);
    const a = new Aparecedor({ areas, plantillas, azar: medio });
    const d = new Disparadores(malla.disparadores, { reloj: () => a.t });
    // Los dos lados del cable, igual que en `main.js` y en `fauna.js`.
    const avisos = [];
    const cosecha = () => {
      for (const s of d.recoger()) {
        if (s.tipo === "sin_destinatario") a.disparar(s.nombre);
        if (s.tipo === "aviso" && s.que === "multisource_ajeno") avisos.push(s);
      }
    };
    const alMapa = (n) => {
      d.disparar(String(n), { nombre: "prueba" }, USO.ALTERNAR, 0, null);
      cosecha();
    };
    const paso = () => {
      for (const s of a.tic(1 / 20)) if (s.dispara) { a.disparar(s.dispara); alMapa(s.dispara); }
      // `paso()` y no `tic()`: el bus se mueve con el reloj ya movido, y aquí el
      // reloj es el del aparecedor —el mismo para los dos, que es lo que hace que
      // los `delay 4` de los relés venzan cuando de verdad tocan.
      d.paso();
      cosecha();
    };
    const jefe = plantillas.find((p) => p.nombre === "boarboss").id;
    const deBoars = plantillas.filter((p) => p.area === "boars1").map((p) => p.id);
    // Se juega el corral entero: matar todo lo que salga, mucho rato.
    for (let n = 0; n < 4000; n++) {
      paso();
      for (const id of deBoars) if (a.estaPuesto(id)) a.muerto(id);
    }
    // Las tres oleadas se han agotado: quince jabalíes muertos.
    const normales = deBoars.filter((id) => id !== jefe);
    assert.ok(normales.every((id) => a.fichaDe(id).agotada),
      "no se han agotado las tres oleadas de jabalíes normales");
    assert.equal(normales.reduce((s, id) => s + a.fichaDe(id).apariciones, 0), 15,
      "no han salido quince jabalíes normales");
    // `wave3` SÍ ha recibido los dos disparos y los ha RECHAZADO los dos, porque
    // quien llama no es el relé sino la copia `DelayedUse` que el motor fabrica
    // cuando hay `delay` (subs.cpp:252-269). Es el caso que el propio mod avisa
    // por su nombre en `CMultiSource::Use` (buttons.cpp:173-176), y `wave3_1` y
    // `wave3_2` tienen los dos `delay 4`.
    const ms = d.entidades.find((e) => e.nombre === "wave3" && e.clase === "multisource");
    assert.equal(ms.entradas.length, 2, "Register no ha encontrado los dos relés");
    assert.ok(avisos.length >= 2, `esperaba al menos 2 rechazos y hay ${avisos.length}`);
    assert.ok(avisos.every((x) => x.porRetraso),
      "algún rechazo NO es por el retraso, y entonces es un fallo nuestro");
    assert.equal(ms.est.encendidas.size, 0, "wave3 se ha abierto: la copia ha colado");
    // Y el jefe no sale. Dos roturas independientes, las dos del mod: ésta, y
    // detrás la `SUB_UseTargets` de `CBaseEntity` que tampoco dispararía.
    assert.equal(MULTISOURCE_ROTO, true);
    assert.equal(a.fichaDe(jefe).despertada, false,
      "el jefe se ha despertado: alguien ha cambiado esto sin decirlo");
    assert.equal(a.fichaDe(jefe).apariciones, 0);
  });

  // EL CONTROL POSITIVO del cero de arriba, que si no sería «el jefe no sale» sin
  // saber si es porque el multisource no dispara o porque nada lo haría salir.
  test("llamado a mano, el jefe SÍ sale, y al morir avisa al viejo", () => {
    const { areas, plantillas } = delCenso(censo);
    const a = new Aparecedor({ areas, plantillas, azar: medio });
    const jefe = plantillas.find((p) => p.nombre === "boarboss").id;
    correr(a, 10);
    assert.equal(a.estaPuesto(jefe), false);
    a.disparar("boarboss");
    correr(a, 2);
    assert.equal(a.estaPuesto(jefe), true, "ni llamándolo a mano sale el jefe");
    assert.equal(a.fichaDe(jefe).apariciones, 1);
    // Y su `killtarget`, que es lo que cierra la misión del viejo del huerto.
    assert.equal(censo.colocados[jefe].alMorir, "boarsdead");
  });
});

describe("`CMultiSource::Register` y la copia del retraso", () => {
  // `Register` mira quién le APUNTA (buttons.cpp:241-270), al revés de todo lo
  // demás. Hasta el 68 `entradas` se leía en dos sitios y no se escribía en
  // ninguno: la reja estaba siempre abierta Y el `Use` rechazaba a todos.
  /** El reloj es MÓVIL a propósito: con uno fijo el retraso no puede vencer. */
  const dos = (retraso) => {
    const t = { ahora: 0 };
    const d = new Disparadores([
      { clase: "trigger_relay", nombre: "r1", objetivo: "ms", retraso, uso: USO.ALTERNAR, probabilidad: 100 },
      { clase: "trigger_relay", nombre: "r2", objetivo: "ms", retraso, uso: USO.ALTERNAR, probabilidad: 100 },
      { clase: "multisource", nombre: "ms", objetivo: "premio" },
      { clase: "trigger_relay", nombre: "premio", objetivo: null },
    ], { reloj: () => t.ahora });
    return { d, t, ms: d.entidades.find((e) => e.nombre === "ms") };
  };

  test("`Register` encuentra sus dos entradas, y no se cuenta a sí mismo", () => {
    const { ms } = dos(0);
    assert.deepEqual(ms.entradas, [0, 1]);
    // Un multisource al que nadie apunta sigue con la lista VACÍA, que en el
    // motor significa ABIERTO (`i == m_iTotal` con los dos a cero, :233-238).
    const solo = new Disparadores([{ clase: "multisource", nombre: "ms" }]);
    assert.deepEqual(solo.entidades[0].entradas, []);
  });

  // EL CONTROL POSITIVO del rechazo de Edana: los MISMOS relés sin `delay` sí
  // abren la reja. Sin esto, «wave3 no se abre» no distinguiría «lo impide el
  // retraso» de «nuestro multisource no se abre nunca».
  test("sin retraso los dos relés SÍ abren la reja; con retraso NINGUNO", () => {
    const sin = dos(0);
    sin.d.disparar("r1"); sin.d.disparar("r2"); sin.d.recoger();
    assert.equal(sin.ms.est.encendidas.size, 2, "sin retraso tampoco se abre");
    assert.ok([...sin.ms.est.encendidas.values()].every(Boolean));

    // Los MISMOS relés con `delay 4`, que es lo que tienen los de Edana.
    const con = dos(4);
    con.d.disparar("r1"); con.d.disparar("r2"); con.d.recoger();
    con.d.paso();
    assert.equal(con.ms.est.encendidas.size, 0, "el retraso no ha vencido y ya ha llegado");
    // Ahora vence: el reloj pasa de los 4 s y el retrasado dispara — como copia.
    con.t.ahora = 5;
    assert.ok(con.d.paso() >= 2, "no ha vencido ningún retraso");
    const s = con.d.recoger();
    const rechazos = s.filter((x) => x.tipo === "aviso" && x.que === "multisource_ajeno");
    assert.equal(rechazos.length, 2, `esperaba 2 rechazos y hay ${rechazos.length}`);
    assert.ok(rechazos.every((x) => x.porRetraso));
    assert.equal(s.filter((x) => x.tipo === "uso_retrasado").length, 2);
    assert.equal(con.ms.est.encendidas.size, 0, "la copia ha colado y no debería");
  });
});

describe("Gate City no usa ninguna de las tres claves", () => {
  // EL SEGUNDO CASO, que es la defensa del 50: sin esta prueba, «las fichas de
  // Edana traen `porDisparo`» podría estar verde con el extractor poniéndolo a
  // todo el mundo. Y además fija por qué el encabezado de `aparecer.js` decía que
  // esto no se portaba: para Gate City era verdad.
  const G = "build/gatecity/bichos.json";
  test("las 38 fichas: 0 con `spawnstart`, 0 con `perishtarget`, 0 con nombre", {
    skip: existsSync(G) ? false : `falta ${G}`,
  }, () => {
    const c = JSON.parse(readFileSync(G, "utf8"));
    const f = c.colocados.filter((x) => x.aparecedor);
    assert.equal(f.length, 38);
    assert.equal(f.filter((x) => x.aparecedor.porDisparo).length, 0);
    assert.equal(f.filter((x) => x.aparecedor.alPerecer).length, 0);
    assert.equal(f.filter((x) => x.aparecedor.nombre).length, 0);
    assert.equal(c.colocados.filter((x) => x.alMorir).length, 0);
  });
});
