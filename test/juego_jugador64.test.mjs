// EL GUION DEL JUGADOR — el 64.
//
// Dos capas, y hacen falta las dos:
//
//   1. la REGLA de `helptip` y de `repeatdelay`, con sus rarezas del original;
//   2. y el guion DE VERDAD: `build/msr/jugador.json`, con los cuatro
//      `help/first_*` y la regeneración dentro.
//
// La segunda es la que importa y es la que el apartado 4 de CLAUDE.md exige:
// una prueba que le construya a la regla el argumento perfecto demuestra que
// la regla sabe hacer su trabajo, no que el juego la llame. Aquí el texto de
// los consejos NO está escrito en esta prueba: sale del `.script` de MSR.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { Consejos, partirConsejo, lineasDeConsejo, esGenerico } from "../src/play/consejos.js";
import { GuionDelJugador, SIN_QUIEN_LOS_LLAME } from "../src/play/guionjugador.js";
import { repeticionDe, partirGuion } from "../src/play/guion.js";

// ── 1. LA REGLA ────────────────────────────────────────────────────────────

describe("`helptip`, tal como lo parte el motor (64)", () => {
  test("con menos de cuatro parámetros no manda nada: es `ERROR_MISSING_PARMS`", () => {
    assert.equal(partirConsejo(["ent_me", "help_death"]), null);
    assert.equal(partirConsejo(["ent_me", "help_death", "Death"]), null);
  });

  test("y el texto se pega SIN espacios, que es lo que hace el mod", () => {
    // `buffer += static_cast<const char*>(Params[i+3])` — scriptcmds.cpp:3610.
    // `playermessage` los junta con un espacio y éste no. Es una errata del
    // original y se porta: quien escriba un `helptip` de varias palabras
    // sueltas se encuentra esto en el juego de verdad.
    const c = partirConsejo(["ent_me", "k", "Título", "hola", "mundo"]);
    assert.equal(c.texto, "holamundo");
  });

  test("las barras son saltos de línea, y dos seguidas una línea en blanco", () => {
    assert.deepEqual(lineasDeConsejo("uno|dos"), ["uno", "dos"]);
    assert.deepEqual(lineasDeConsejo("uno||tres"), ["uno", "", "tres"]);
  });

  test("«generic» se comprueba con LLEVA, no con ES", () => {
    // `mstipname.contains("generic")` — playershared.cpp:1136-1137.
    assert.equal(esGenerico("generic"), true);
    assert.equal(esGenerico("mi_generic_2"), true);
    assert.equal(esGenerico("help_death"), false);
  });
});

describe("un consejo se enseña UNA vez (64)", () => {
  const unConsejo = (clave) => ["ent_me", clave, "Death", "You have DIED!"];

  test("la segunda vez no sale", () => {
    const c = new Consejos();
    assert.ok(c.mandar(unConsejo("help_death")));
    assert.equal(c.mandar(unConsejo("help_death")), null);
  });

  test("pero uno genérico sale siempre, y NO se apunta", () => {
    const c = new Consejos();
    assert.ok(c.mandar(unConsejo("generic")));
    assert.ok(c.mandar(unConsejo("generic")));
    assert.deepEqual(c.vistos, [], "un genérico no debería recordarse");
  });

  test("y los vistos vienen del personaje: la primera vez es de ÉL, no de la partida", () => {
    // `m_ViewedHelpTips` se escribe en el archivo del personaje con su propio
    // bloque (sv_character.cpp:682-684), así que sobrevive a salir del juego.
    const c = new Consejos({ vistos: ["help_death"] });
    assert.equal(c.mandar(unConsejo("help_death")), null);
    assert.ok(c.mandar(unConsejo("help_skill_gain")));
  });

  test("el gancho `game_helptip` vuelve con título y clave, EN ESE ORDEN", () => {
    // `Parameters.add(Title); Parameters.add(Tipname);` —
    // playershared.cpp:1145-1147. Al revés de como los recibe el comando.
    const r = new Consejos().mandar(unConsejo("help_death"));
    assert.deepEqual(r.evento, { nombre: "game_helptip", params: ["Death", "help_death"] });
  });

  test("y un genérico NO dispara el gancho", () => {
    // El `if (!generic_tip)` envuelve la llamada entera, :1143.
    assert.equal(new Consejos().mandar(unConsejo("generic")).evento, null);
  });
});

// ── 2. `repeatdelay`, que se resuelve AL CARGAR ────────────────────────────

describe("los eventos que se repiten solos (64)", () => {
  test("`repeatdelay` de primer nivel se ve al cargar; dentro de un `if`, no", () => {
    // El lector del motor lee LÍNEAS: `repeatdelay` es una directiva del
    // cargador (script.cpp:5377-5382), no un comando que alguien ejecute.
    const g = partirGuion("{ a\n repeatdelay 12.0\n}\n{ b\n if ( X )\n {\n repeatdelay 5\n }\n}");
    const a = g.eventos.find((e) => e.nombre === "a");
    const b = g.eventos.find((e) => e.nombre === "b");
    // Devuelve el parámetro CRUDO y no un número, porque el cargador tiene que
    // resolverlo él: `atof(SCRIPTCONST(cBuffer))` acepta una constante, una
    // variable del script o un literal, y lo que no resuelve vale 0.
    assert.equal(repeticionDe(a), "12.0");
    assert.equal(repeticionDe(b), null);
  });
});

// ── 3. EL GUION DE VERDAD ──────────────────────────────────────────────────

const ficha = (() => {
  try { return JSON.parse(readFileSync("build/msr/jugador.json", "utf8")); }
  catch { return null; }
})();
const hay = Boolean(ficha);

describe("`player/player` cargado de verdad (64)", () => {
  test("hay guion horneado: si no, todo lo de abajo se salta y un salto silencioso es un cero sin control", { skip: !hay }, () => {
    assert.ok(ficha.eventos.length > 400, `sólo ${ficha?.eventos?.length} eventos`);
    assert.ok(ficha.archivos.includes("help/first_death"));
    assert.ok(ficha.archivos.includes("player/player_sv_regen"));
  });

  /** Un jugador con su guion y un buzón donde caen los consejos. */
  function unJugador(personaje = { nombre: "Ana", vida: 100, vidaMax: 100, mana: 20, manaMax: 20 }) {
    const consejos = [];
    const dado = [];
    let t = 0;
    const g = new GuionDelJugador({
      ficha, personaje,
      consejo: (c) => consejos.push(c),
      dar: (que, cuanto) => dado.push({ que, cuanto }),
      ahora: () => t,
    });
    return { g, consejos, dado, personaje, avanzar: (s) => { t += s; return g.paso(); } };
  }

  test("al morir sale el consejo de la muerte, con el texto del `.script`", { skip: !hay }, () => {
    // ESTE es el control del experimento: el texto no está escrito aquí, sale
    // de `help/first_death.script:5-7`. Si el guion no se carga o el `helptip`
    // no llega, no hay de dónde sacarlo.
    const j = unJugador();
    j.g.llamar("game_death", []);
    const c = j.consejos.find((x) => x.clave === "help_death");
    assert.ok(c, `no llegó el consejo; llegaron ${JSON.stringify(j.consejos.map((x) => x.clave))}`);
    assert.equal(c.titulo, "Death");
    assert.match(c.lineas[0], /You have DIED!/);
    assert.match(c.lineas.join("|"), /lose 5% of your gold/);
  });

  test("y la segunda muerte NO lo repite: queda apuntado en el personaje", { skip: !hay }, () => {
    const j = unJugador();
    j.g.llamar("game_death", []);
    const cuantos = j.consejos.length;
    j.g.llamar("game_death", []);
    assert.equal(j.consejos.length, cuantos, "se enseñó dos veces");
    assert.ok(j.personaje.consejosVistos.includes("help_death"));
  });

  test("al subir la competencia sale el suyo, y sólo a partir de 2", { skip: !hay }, () => {
    // `if PARAM2 equals 'Proficiency'` y `if PARAM3 >= 2` —
    // help/first_skillgain.script:5-6. Las dos condiciones son del script, no
    // de aquí: con `1` no debe salir nada.
    const flojo = unJugador();
    flojo.g.llamar("game_learnskill", ["Blunt", "Proficiency", "1"]);
    assert.equal(flojo.consejos.filter((c) => c.clave === "help_skill_gain").length, 0);

    const j = unJugador();
    j.g.llamar("game_learnskill", ["Blunt", "Proficiency", "2"]);
    const c = j.consejos.find((x) => x.clave === "help_skill_gain");
    assert.ok(c, "no llegó el consejo de competencia");
    assert.equal(c.titulo, "Proficiency");
    assert.match(c.lineas.join("|"), /double click attack to start charging/);
  });

  test("y con otra subhabilidad tampoco: el `equals` del script es de CADENA", { skip: !hay }, () => {
    const j = unJugador();
    j.g.llamar("game_learnskill", ["Blunt", "Mastery", "9"]);
    assert.equal(j.consejos.filter((c) => c.clave === "help_skill_gain").length, 0);
  });

  // ── LA REGENERACIÓN ──────────────────────────────────────────────────────
  test("la regeneración se arma SOLA al cargar: nadie llama a `player_regen_hp`", { skip: !hay }, () => {
    // Ni un script ni el motor llaman a ese evento — se comprobó buscando en
    // los 2 884. Lo que lo arranca es cargarlo, porque `repeatdelay` es una
    // directiva del cargador. Ver `armarRepeticiones`.
    const j = unJugador();
    const nombres = j.g.guion.repeticiones.map((r) => r.evento.nombre);
    assert.ok(nombres.includes("player_regen_hp"), `armados: ${JSON.stringify(nombres)}`);
    assert.ok(nombres.includes("player_regen_mp"));
  });

  test("LA PRIMERA VUELTA SALE EN EL ACTO, y eso no es un fallo", { skip: !hay }, () => {
    // `repeatdelay FINAL_REGEN_RATE_HP` toma una VARIABLE, y el cargador sólo
    // resuelve lo que ya existe —«loadtime only», script.cpp:40—. Esa variable
    // la pone el bloque de cabecera, que corre después, así que al armar el
    // reloj `atof` recibe el nombre y devuelve **0**: la primera regeneración
    // llega con el primer paso. Es del motor y se porta.
    const j = unJugador();
    assert.ok(j.avanzar(0) >= 2, "la primera vuelta no salió en el acto");
    assert.deepEqual(j.dado.filter((d) => d.que === "vida"), [{ que: "vida", cuanto: 1 }]);
    assert.deepEqual(j.dado.filter((d) => d.que === "mana"), [{ que: "mana", cuanto: 1 }]);
  });

  test("y a partir de ahí, 1 de vida cada doce segundos", { skip: !hay }, () => {
    // `BASE_REGEN_RATE 12.0`, `BASE_REGEN_HP 1` — player_sv_regen.script:6-8.
    // El comentario del propio script: «1 hp/12 sec».
    const j = unJugador();
    j.avanzar(0);                                  // la vuelta gratis
    const tras = () => j.dado.filter((d) => d.que === "vida").length;
    assert.equal(tras(), 1);
    j.avanzar(5);
    assert.equal(tras(), 1, "ha regenerado antes de tiempo");
    j.avanzar(8);                                  // t = 13
    assert.equal(tras(), 2);
    j.avanzar(12); j.avanzar(12);
    assert.equal(tras(), 4);
  });

  test("y el reloj se relee cada vuelta: el guion puede cambiar el ritmo", { skip: !hay }, () => {
    // «Minus 6 seconds per HP tick» con el anillo de sangre
    // (player_sv_regen.script:15-16). El motor vuelve a armar con lo que diga
    // el `repeatdelay` de ESA vuelta, así que el ritmo es del guion y no del
    // reloj de quien lo carga.
    // El ritmo nuevo NO vale para la vuelta ya armada: el motor sólo rearma
    // cuando el evento CORRE. Así que se deja pasar la que estaba en marcha y
    // se mide la siguiente, que es la primera que usa el ritmo nuevo.
    const tras = (x) => x.dado.filter((d) => d.que === "vida").length;
    const conAnillo = unJugador();
    conAnillo.avanzar(0);                          // la vuelta gratis
    conAnillo.g.llamar("bloodstone_toggle", ["1"]);
    conAnillo.avanzar(12);                         // corre y REARMA a 12-6 = 6
    conAnillo.avanzar(7);                          // t = 19: con 6 sí, con 12 no
    // Y el control al lado: el mismo reloj SIN el anillo no llega.
    const sinAnillo = unJugador();
    sinAnillo.avanzar(0); sinAnillo.avanzar(12); sinAnillo.avanzar(7);
    assert.equal(tras(conAnillo), 3, "el anillo de sangre no aceleró la regeneración");
    assert.equal(tras(sinAnillo), 2, "sin anillo no debería haber llegado la tercera");
  });

  // ── LO QUE NO SE CUENTA ──────────────────────────────────────────────────
  test("los dos consejos que nadie puede disparar están nombrados, no olvidados", { skip: !hay }, () => {
    // El apartado 4: si hoy no hay quien dispare el evento, se declara
    // pendiente en vez de contarlo entre los verdes. Y se comprueba que el
    // evento SÍ está cargado, para que el día que haya grupos funcione solo.
    const cargados = new Set(ficha.eventos.map((e) => e.nombre));
    for (const nombre of Object.keys(SIN_QUIEN_LOS_LLAME)) {
      assert.ok(cargados.has(nombre), `${nombre} ni siquiera está cargado`);
      assert.ok(SIN_QUIEN_LOS_LLAME[nombre].length > 20, `${nombre} sin motivo escrito`);
    }
  });
});
