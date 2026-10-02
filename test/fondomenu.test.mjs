// QUÉ SE VE DETRÁS DEL MENÚ PRINCIPAL.
//
// Lo que estas comprobaciones vigilan no es el aspecto —eso sólo lo prueba una
// sonda— sino la **regla**: qué mapa sale de fondo, de dónde sale ese nombre, y
// que la lista de lo que NO se monta siga diciendo por qué.
//
// El fondo del menú se estaba cargando desde `MAPA_POR_DEFECTO`, o sea que «el
// mapa que juegas si no dices nada» y «lo que se ve detrás del menú» eran la
// misma constante por accidente, y detrás del menú corría una partida entera:
// 69 NPC, 33 hostiles, 45 moviéndose en 4 s, y `sesion: true`.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FONDOS_DEL_MENU, LO_QUE_NO_SE_MONTA, LO_QUE_SI_SE_MONTA,
  fondoDelMenu, hayFondoVivo,
  ESCENA_DEL_MENU, conEscenaDelMenu, encuadreDelFondo,
} from "../src/play/fondomenu.js";
import {
  MAPA_POR_DEFECTO, esNombreDeMapa,
  FONDOS_DEL_MENU as FONDOS_DE_MAPA_JS,
} from "../src/play/mapa.js";

describe("el fondo del menú es una decisión con nombre", () => {
  test("todos los fondos son nombres de mapa válidos", () => {
    assert.ok(FONDOS_DEL_MENU.length > 0, "sin fondos, el menú va a la pintura");
    for (const m of FONDOS_DEL_MENU) assert.ok(esNombreDeMapa(m), m);
  });

  test("y el fondo de hoy se dice por su NOMBRE, no por su posición", () => {
    // La regla del 47 no deja escribir el nombre en `src/play/` —vive en
    // `mapa.js`, que es la excepción— pero una prueba sí puede, y tiene que.
    //
    // La alternativa que se probó primero era indexar `MAPAS_PORTADOS[0]`, y
    // deja un agujero mudo: quien reordene esa lista mueve el fondo del menú a
    // otro mapa y no falla nada, porque sigue siendo una lista de uno y sigue
    // siendo un mapa portado. El apartado 4 con otra ropa.
    assert.deepEqual([...FONDOS_DEL_MENU], ["gatecity"]);
    assert.equal(fondoDelMenu(), "gatecity");
  });

  test("los nombres salen de `mapa.js`, que es donde la regla del 47 los deja", () => {
    assert.strictEqual(FONDOS_DEL_MENU, FONDOS_DE_MAPA_JS,
      "`fondomenu.js` tiene su propia copia de la lista en vez de reexportarla");
  });

  test("y NO se deriva de `MAPA_POR_DEFECTO`", () => {
    // Lo que se arregla aquí. Que hoy coincidan en el valor es casualidad —los
    // dos dicen «gatecity»— así que lo que se comprueba es que el módulo del
    // fondo no lo IMPORTE: si lo hiciera, cambiar el mapa por omisión volvería
    // a arrastrar el menú detrás.
    const fuente = readFileSync("src/play/fondomenu.js", "utf8");
    const codigo = fuente.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    assert.ok(!codigo.includes("MAPA_POR_DEFECTO"),
      "el fondo del menú vuelve a salir del mapa por omisión");
    // Y que hoy valgan lo mismo se dice, en vez de dejarlo como coincidencia
    // muda: si un día dejan de coincidir, no es un fallo.
    assert.equal(typeof MAPA_POR_DEFECTO, "string");
  });

  test("con la lista vacía no hay fondo vivo: toca la pintura del mod", () => {
    // El orden del motor: `bgmaps.IsEmpty()` es lo primero que mira
    // `UI_StartBackGroundMap` (mainui/BaseMenu.cpp:551).
    assert.equal(fondoDelMenu([]), null);
    assert.equal(fondoDelMenu(undefined && []), FONDOS_DEL_MENU[0]);
    assert.equal(hayFondoVivo([]), false);
    assert.equal(hayFondoVivo(), true);
  });

  test("un nombre que no es de mapa no sale de fondo", () => {
    // La misma puerta que `?map=`: de aquí sale una ruta que se le pasa a
    // `fetch`, así que `../../algo` no puede pasar por ser una constante.
    assert.equal(fondoDelMenu(["../../etc"]), null);
    assert.equal(fondoDelMenu(["Gatecity"]), null);
    assert.equal(fondoDelMenu(["../../etc", "edana"]), "edana");
  });

  test("el sorteo elige entre los que hay, y no se sale por el final", () => {
    const tres = ["gatecity", "edana", "old_helena"];
    assert.equal(fondoDelMenu(tres, () => 0), "gatecity");
    assert.equal(fondoDelMenu(tres, () => 0.5), "edana");
    // Un `azar()` que devuelva 1 se saldría del array y daría `undefined`.
    assert.equal(fondoDelMenu(tres, () => 1), "old_helena");
    assert.equal(fondoDelMenu(tres, () => 0.999999), "old_helena");
  });

  test("CONTROL POSITIVO: con varios, el sorteo SORTEA", () => {
    // Sin esto, «elige entre los que hay» estaría verde con un `return
    // validos[0]` que no elige nada.
    const vistos = new Set();
    for (let i = 0; i < 500; i++) vistos.add(fondoDelMenu(["a", "b", "c"], Math.random));
    assert.equal(vistos.size, 3, `en 500 tiradas salieron ${[...vistos].join(", ")}`);
  });

  test("PENDIENTE, y se dice: hoy hay UN fondo, así que el sorteo no se puede medir en vivo", () => {
    // La lección del 50, apuntada en CLAUDE.md §4: con un solo caso el valor
    // correcto y el valor de reposo son el mismo, y el control no puede fallar
    // por construcción. El de arriba mide la FUNCIÓN con una lista inventada;
    // que la lista REAL se sortee no lo puede comprobar nadie hasta que haya
    // dos. Esto lo deja dicho en vez de contarlo entre los verdes.
    if (FONDOS_DEL_MENU.length > 1) {
      const vistos = new Set();
      for (let i = 0; i < 500; i++) vistos.add(fondoDelMenu());
      assert.equal(vistos.size, FONDOS_DEL_MENU.length);
    } else {
      assert.equal(FONDOS_DEL_MENU.length, 1,
        "si ya hay más de uno, esta rama debería estar midiendo el sorteo de verdad");
    }
  });
});

describe("lo que no se monta en un mapa de fondo dice por qué", () => {
  test("cada entrada trae su motivo, y no uno de adorno", () => {
    assert.ok(LO_QUE_NO_SE_MONTA.length >= 3);
    for (const e of LO_QUE_NO_SE_MONTA) {
      assert.ok(e.que?.length > 2, JSON.stringify(e));
      assert.ok(e.porQue?.length > 40, `«${e.que}» no dice por qué: ${e.porQue}`);
      assert.equal(typeof e.masQueElMotor, "boolean", `«${e.que}» no dice si va más lejos que el motor`);
    }
  });

  test("y las que van MÁS LEJOS que el motor están marcadas, no escondidas", () => {
    // `sv.background` deja las entidades vivas y se limita a `FL_NOTARGET` y a
    // congelar al jugador. Nosotros no las montamos. Eso es una desviación y
    // se declara; si un día alguien la borra, esto se cae.
    const nuestras = LO_QUE_NO_SE_MONTA.filter((e) => e.masQueElMotor);
    assert.ok(nuestras.length >= 3, `sólo ${nuestras.length} marcadas como nuestras`);
    for (const e of nuestras) {
      assert.match(e.porQue, /sv_|FL_NOTARGET|«Start»/,
        `«${e.que}» va más lejos que el motor y no cita contra qué`);
    }
  });

  test("las tres cosas que SÍ se montan, o el fondo sería una pantalla negra", () => {
    // Un «no se monta nada» sin su contrario al lado es la forma del apartado 4
    // otra vez: cero NPC y cero geometría se parecen mucho.
    assert.ok(LO_QUE_SI_SE_MONTA.length >= 3);
    assert.ok(LO_QUE_SI_SE_MONTA.some((s) => /geometr/i.test(s)));
    assert.ok(LO_QUE_SI_SE_MONTA.some((s) => /luz/i.test(s)));
    assert.ok(LO_QUE_SI_SE_MONTA.some((s) => /c[áa]mara/i.test(s)));
  });

  test("72 · lo que hay detrás del menú está DECLARADO y dice por qué", () => {
    // La vacuna del apartado 4 aplicada a una decisión de dirección artística:
    // apagar la escena de la torre es legítimo, pero tiene que estar escrito
    // dónde se decide y con qué razón. Si no, dentro de un año nadie sabe si la
    // torre no sale por decisión o porque algo se rompió.
    assert.ok(["pintura", "torre"].includes(ESCENA_DEL_MENU.cual),
      `«${ESCENA_DEL_MENU.cual}» no es ni la pintura ni la torre`);
    assert.ok(ESCENA_DEL_MENU.porQue.length > 80,
      "la razón es demasiado corta para ser una razón");

    // Y `conEscenaDelMenu` tiene que seguir a la tabla, no tener su propia idea.
    assert.equal(conEscenaDelMenu({ cual: "torre" }), true);
    assert.equal(conEscenaDelMenu({ cual: "pintura" }), false);
    // CONTROL POSITIVO: la función distingue de verdad. Sin esto, una que
    // devolviera siempre `false` pasaría la línea de arriba y la mitad de las
    // de abajo.
    assert.notEqual(conEscenaDelMenu({ cual: "torre" }), conEscenaDelMenu({ cual: "pintura" }));

    // Y lo que de verdad está puesto hoy, para que un cambio se vea en el diff
    // de una prueba y no sólo en el de un archivo de 150 líneas.
    assert.equal(ESCENA_DEL_MENU.cual, "pintura");
    assert.equal(conEscenaDelMenu(), false);
  });

  test("72 · el recorte de la pintura es el del motor, no un fallo del port", () => {
    // La pintura es 800x600 y las pantallas de hoy no. Al volver a ella en el
    // 72 lo primero que se ve es que a la torre le falta la cima, y la pregunta
    // es si eso lo hemos roto nosotros. Esto fija la respuesta: no.
    const PINTURA = { ancho: 800, alto: 600 };

    const w = encuadreDelFondo({ ...PINTURA, anchoPantalla: 1600, altoPantalla: 900 });
    // Escala única por el lado que desborda: 1600/800 = 2, para los DOS ejes.
    assert.equal(w.escalaX, 2);
    assert.equal(w.escalaY, 2, "dos escalas distintas deformarían la pintura");
    // 600*2 = 1200 de alto sobre 900 de pantalla -> sobran 300, centrados.
    assert.equal(w.desfaseY, -150);
    assert.equal(w.desfaseX, 0);
    // O sea el 25 % del alto perdido, 12,5 % por arriba y 12,5 % por abajo.
    assert.equal((1 - 900 / (600 * w.escalaY)) * 100, 25);

    // Y eso ES `center/cover`: la escala es el máximo de las dos razones.
    for (const [pw, ph] of [[1600, 900], [1920, 1080], [1024, 768], [1280, 1024]]) {
      const e = encuadreDelFondo({ ...PINTURA, anchoPantalla: pw, altoPantalla: ph });
      assert.equal(e.escalaX, e.escalaY);
      assert.equal(e.escalaX, Math.max(pw / PINTURA.ancho, ph / PINTURA.alto),
        `${pw}x${ph}: no coincide con lo que hace "cover"`);
      // Nunca quedan bordes vacíos: la imagen cubre la pantalla entera.
      assert.ok(PINTURA.ancho * e.escalaX >= pw - 1e-9);
      assert.ok(PINTURA.alto * e.escalaY >= ph - 1e-9);
    }

    // CONTROL POSITIVO: en 4:3 exacto no se recorta nada. Sin esto, una función
    // que devolviera siempre un desfase negativo pasaría lo de arriba.
    const justo = encuadreDelFondo({ ...PINTURA, anchoPantalla: 1024, altoPantalla: 768 });
    assert.equal(justo.desfaseX, 0);
    assert.equal(justo.desfaseY, 0);

    // Y el cvar: a `true` deforma en vez de recortar, que es la otra rama del
    // motor y la que el jugador puede pedir.
    const estirado = encuadreDelFondo({
      ...PINTURA, anchoPantalla: 1600, altoPantalla: 900, estirar: true,
    });
    assert.notEqual(estirado.escalaX, estirado.escalaY);
    assert.equal(estirado.desfaseY, 0, "estirando no se recorta nada");
  });

  test("el módulo cita el motor con archivo y línea, que es la regla de la casa", () => {
    const fuente = readFileSync("src/play/fondomenu.js", "utf8");
    for (const cita of ["BaseMenu.cpp:551", "BaseMenu.cpp:571", "sv_init.c:1011",
      "sv_client.c:1422-1423", "sv_main.c:111",
      "BaseMenu.cpp:1149", "BackgroundBitmap.cpp:186-195", "BackgroundBitmap.cpp:199-207"]) {
      assert.ok(fuente.includes(cita), `falta la cita ${cita}`);
    }
  });
});
