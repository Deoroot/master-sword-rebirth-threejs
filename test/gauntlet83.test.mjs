// EL BONO DE 10 000 QUE EDANA NO DEBERÍA DAR — el 83.
//
// El usuario, jugando: «cuando inicio el juego en edana me sale 10000 puntos
// por empezar un gauntlet, esto tampoco pasa en el juego original».
//
// Y no, no pasa. El guion del jugador lo tiene guardado detrás de una guarda:
//
//     local L_MAP_NAME $lcase(game.map.name)
//     if ( $get_find_token(MAPS_GAUNTLET_START,L_MAP_NAME) == -1 ) exitevent
//
//     if ( game.time < 180 )
//     {
//       setvard PLR_TOTAL_DMG 10
//       gplayermessage ent_me Bonus 10,000 damage points for starting gauntlet.
//       callevent store_dmg_points
//     }
//                               player/server/dmgpoints.script:32-42
//
// `MAPS_GAUNTLET_START` es «lowlands;lodagond-1;ww1;the_wall;old_helena;
// nashalrath» (world/server/maps.script:7) y Edana no está. O sea que la guarda
// es correcta y lo que fallaba era que **ninguna de sus cuatro piezas estaba
// portada**: `game.map.name`, `$lcase`, `$get_find_token` y `exitevent`. Sin
// `exitevent` la línea no corta nada y el evento sigue hasta el mensaje.
//
// Y al ir a escribir `exitevent` apareció que la línea que ya había —
// `case "return": case "exit": ev.parar = true` — hacía tres cosas y las tres
// mal. Ver el tercer bloque.
//
// LA REGLA DE LA CASA QUE MANDA AQUÍ: si hay analizador, la prueba le da
// TEXTO. Un objeto de comando escrito a mano no trae la bandera `nueva` que
// distingue el `if` viejo del nuevo, y aquí la mitad de los casos son `if`.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { Guion, partirGuion, COMANDOS, GETTERS, olvidarGlobales } from "../src/play/guion.js";
import { GuionDelJugador } from "../src/play/guionjugador.js";

/** Un guion de un solo archivo, partido por el analizador de verdad. */
function corre(texto, { evento = "prueba", params = [], mapa = null, ahora = () => 0 } = {}) {
  olvidarGlobales();
  const { eventos, preload } = partirGuion(texto);
  const dicho = [];
  const g = new Guion({
    eventos, preload, nombre: "prueba", ahora,
    entorno: { mensajeAlJugador: (_a, t) => dicho.push(t) },
    mapa,
  });
  g.llamar("", []);
  g.llamar(evento, params);
  return { g, dicho, vars: g.vars, noSoportados: g.noSoportados };
}

// ── 1. LAS CUATRO PIEZAS QUE FALTABAN ──────────────────────────────────────

describe("`exitevent`, el que sí existe (83)", () => {
  test("corta el evento entero, no la línea", () => {
    // `Event.bFullStop = true` (scriptcmds.cpp:3148-3153) y el bucle de
    // `Script_ExecuteCmds` lo mira DESPUÉS DE CADA COMANDO:
    // `if (Event.bFullStop) return false;` — script.cpp:5767-5768.
    const r = corre(`
{ prueba
  setvar ANTES 1
  exitevent
  setvar DESPUES 1
}`);
    assert.equal(r.vars.get("ANTES"), "1");
    assert.equal(r.vars.get("DESPUES"), undefined, "la línea de después se ejecutó");
  });

  test("y desde DENTRO de un `if` anidado también sale del evento entero", () => {
    // Esto es lo que lo distingue de un `break`: cada `Script_ExecuteCmds`
    // anidado devuelve `false`, y el padre vuelve a mirar `bFullStop` en su
    // propia vuelta, así que desenrolla hasta arriba.
    const r = corre(`
{ prueba
  if ( 1 == 1 )
  {
    if ( 2 == 2 )
    {
      exitevent
    }
  }
  setvar DESPUES 1
}`);
    assert.equal(r.vars.get("DESPUES"), undefined, "sólo salió del `if`, no del evento");
  });

  test("pero NO corta el evento que hizo el `callevent`: la bandera es del evento", () => {
    // `Event.bFullStop` es un campo de SCRIPT_EVENT y se limpia al terminar
    // `Script_ExecuteCmds` del suyo (script.cpp:5694). Un `callevent` corre
    // otro SCRIPT_EVENT, con su propia bandera.
    const r = corre(`
{ prueba
  callevent cortado
  setvar DESPUES 1
}
{ cortado
  exitevent
  setvar DENTRO 1
}`);
    assert.equal(r.vars.get("DENTRO"), undefined, "no cortó el evento llamado");
    assert.equal(r.vars.get("DESPUES"), "1", "cortó también al que llamaba");
  });

  test("está en la lista de comandos y no se apunta como no soportado", () => {
    assert.ok(COMANDOS.has("exitevent"), "`exitevent` no está en COMANDOS");
    const r = corre(`{ prueba\n  exitevent\n}`);
    assert.deepEqual(r.noSoportados, []);
  });
});

describe("`return` NO corta: es `returndata` (83)", () => {
  test("lo que va detrás de un `return` se ejecuta", () => {
    // El propio motor lo dice encima de la función, y es la frase entera:
    // «Does not stop code execution - if multiple instances of return are
    // encountered in the same event, the results are tokenized»
    // (scriptcmds.cpp, sobre `ScriptCmd_Return`).
    //
    // Y los guiones lo demuestran solos: `chests/bank1/filter.script:25-26` es
    //     return **clear
    //     return L_ITEMS
    // dos líneas seguidas. Si `return` cortara, el banco devolvería siempre
    // vacío y la segunda línea no existiría.
    const r = corre(`
{ prueba
  return algo
  setvar DESPUES 1
}`);
    assert.equal(r.vars.get("DESPUES"), "1", "`return` cortó el evento y no debe");
  });

  test("y `exit` a secas no es un comando del motor", () => {
    // `m_GlobalCmdHash` registra `exitevent` (scriptcmds.cpp:48) y `return`
    // (:167). `exit` no está, y en los 2 884 guiones hay CERO líneas con un
    // `exit` suelto. Estaba portado y no lo usaba nadie.
    assert.equal(COMANDOS.has("exit"), false, "`exit` sigue portado y no existe");
  });
});

describe("`$get_find_token` (83)", () => {
  // script.cpp:1725-1760. Devuelve el índice, o -1.
  const busca = (lista, que, extra = "") => corre(`
{ prueba
  setvar L "${lista}"
  setvar R $get_find_token(L,${que}${extra})
}`).vars.get("R");

  test("devuelve el índice, y -1 si no está", () => {
    assert.equal(busca("lowlands;lodagond-1;ww1", "ww1"), "2");
    assert.equal(busca("lowlands;lodagond-1;ww1", "edana"), "-1");
  });

  test("con repetidos devuelve el ÚLTIMO, porque el bucle no rompe", () => {
    // `for (int i = 0; i < Tokens.size(); i++) if (Tokens[i] == TokenAdd)
    //  iFoundAtPos = i;` — no hay `break` (script.cpp:1751-1754). El comentario
    // de encima dice «returns idx of found string» y se lee como el primero.
    assert.equal(busca("a;b;a", "a"), "2");
  });

  test("con menos de dos parámetros, -1", () => {
    // `else return "-1"` — script.cpp:1759.
    const r = corre(`{ prueba\n  setvar R $get_find_token(L)\n}`);
    assert.equal(r.vars.get("R"), "-1");
  });

  test("con un tercer parámetro la búsqueda es PARCIAL", () => {
    // `if (Params.size() >= 3) bPartialSearch = true;` y entonces
    // `Tokens[i].contains(TokenAdd)` — script.cpp:1745 y :1753.
    assert.equal(busca("lowlands;lodagond-1", "land"), "-1");
    assert.equal(busca("lowlands;lodagond-1", "land", ",1"), "0");
  });

  test("el PRIMER parámetro se resuelve como variable y el segundo NO", () => {
    // `msstring TokenString = GetVar(Params[0])` contra
    // `msstring& TokenAdd = Params[1]` — script.cpp:1740 y :1747. El segundo se
    // usa tal cual llega, ya resuelto por el intérprete, sin segunda vuelta.
    const r = corre(`
{ prueba
  setvar LISTA "uno;dos"
  setvar DOS dos
  setvar R $get_find_token(LISTA,DOS)
}`);
    // `DOS` lo resuelve el intérprete al convertir los parámetros, así que
    // llega como «dos» y se encuentra. Lo que NO pasa es la segunda vuelta.
    assert.equal(r.vars.get("R"), "1");
  });

  test("está en GETTERS", () => {
    assert.ok(GETTERS.has("$get_find_token"));
  });
});

describe("`$lcase` y `game.map.name` (83)", () => {
  test("`$lcase` baja la caja", () => {
    // `_strlwr` — script.cpp:3162-3176.
    const r = corre(`{ prueba\n  setvar R $lcase(EdAnA)\n}`);
    assert.equal(r.vars.get("R"), "edana");
  });

  test("`$lcase` sin parámetros devuelve «0»", () => {
    // `else return "0"` — script.cpp:3172-3175.
    const r = corre(`{ prueba\n  setvar R $lcase()\n}`);
    assert.equal(r.vars.get("R"), "0");
  });

  test("`game.map.name` es el mapa, y sin mapa inyectado su propio nombre", () => {
    // `if (Prop == "name") return MSGlobals::MapName;` — script.cpp:4612.
    // Sin inyección se cae a la regla de siempre: una variable que no existe
    // devuelve su propio nombre (script.cpp:4741).
    assert.equal(corre(`{ prueba\n  setvar R game.map.name\n}`, { mapa: () => "edana" }).vars.get("R"), "edana");
    assert.equal(corre(`{ prueba\n  setvar R game.map.name\n}`).vars.get("R"), "game.map.name");
  });
});

// ── 2. LA GUARDA ENTERA, CON LOS DOS CASOS ─────────────────────────────────
//
// El apartado 4 de CLAUDE.md, el caso del 50: con un solo mapa el valor
// correcto y el valor de reposo son el mismo y el control no puede fallar. Así
// que aquí van los dos: el mapa que NO es de gauntlet y el que SÍ.

describe("la guarda del bono, con el texto del guion y los dos mapas (83)", () => {
  // El cuerpo es el de `player/server/dmgpoints.script:32-42`, copiado con su
  // `setvarg` de `world/server/maps.script:7` delante — ver la nota de abajo
  // sobre por qué ese `setvarg` hay que ponerlo aquí a mano.
  const GUION = `
{ prueba
  setvarg MAPS_GAUNTLET_START "lowlands;lodagond-1;ww1;the_wall;old_helena;nashalrath"
  local L_MAP_NAME $lcase(game.map.name)
  if ( $get_find_token(MAPS_GAUNTLET_START,L_MAP_NAME) == -1 ) exitevent

  if ( game.time < 180 )
  {
    setvard PLR_TOTAL_DMG 10
    gplayermessage ent_me Bonus 10,000 damage points for starting gauntlet.
  }
}`;

  test("en edana NO hay bono", () => {
    const r = corre(GUION, { mapa: () => "edana" });
    assert.deepEqual(r.dicho, [], `salió el mensaje: ${JSON.stringify(r.dicho)}`);
    assert.equal(r.vars.get("PLR_TOTAL_DMG"), undefined);
  });

  test("en lowlands SÍ lo hay — el control positivo, sin él lo de arriba es un cero", () => {
    const r = corre(GUION, { mapa: () => "lowlands" });
    assert.equal(r.dicho.length, 1, "no salió el bono en un mapa que sí es de gauntlet");
    assert.match(r.dicho[0], /Bonus 10,000 damage points for starting gauntlet/);
    assert.equal(r.vars.get("PLR_TOTAL_DMG"), "10");
  });

  test("y en LOWLANDS con mayúsculas también: para eso está el `$lcase`", () => {
    const r = corre(GUION, { mapa: () => "LOWLANDS" });
    assert.equal(r.dicho.length, 1, "el `$lcase` no bajó la caja del nombre del mapa");
  });

  test("pasados los 180 s no hay bono aunque el mapa sea de gauntlet", () => {
    const r = corre(GUION, { mapa: () => "lowlands", ahora: () => 200 });
    assert.deepEqual(r.dicho, []);
  });
});

// ── 3. EL GUION DE VERDAD ──────────────────────────────────────────────────

const ficha = (() => {
  try { return JSON.parse(readFileSync("build/msr/jugador.json", "utf8")); }
  catch { return null; }
})();
const hay = Boolean(ficha);

describe("`player/player` de verdad, entrando en Edana (83)", () => {
  test("hay guion horneado y trae el bloque del gauntlet: si no, lo de abajo es un salto silencioso", { skip: !hay }, () => {
    // El `gplayermessage` llega PARTIDO en palabras, que es como el motor
    // recibe los parámetros de un comando: «starting» y «gauntlet.» son dos
    // elementos del array y la frase entera no está en ninguna parte del
    // `.json`. Buscarla fue mi primer control, y era rojo con el horneado bien.
    const texto = JSON.stringify(ficha.eventos);
    assert.ok(texto.includes('"gauntlet."'), "el `.json` no trae el bono");
    assert.ok(texto.includes("$get_find_token(MAPS_GAUNTLET_START,L_MAP_NAME)"), "no trae la guarda");
  });

  /** El jugador con su guion real y un buzón donde caen sus mensajes. */
  function unJugador(mapa) {
    const dicho = [];
    olvidarGlobales();
    const g = new GuionDelJugador({
      ficha,
      personaje: { nombre: "Ana", vida: 100, vidaMax: 100, mana: 20, manaMax: 20 },
      suceso: (_tipo, texto) => dicho.push(texto),
      mapa: () => mapa,
    });
    return { g, dicho };
  }

  test("al entrar en Edana NO sale el bono de los 10 000 — EL FALLO DEL USUARIO", { skip: !hay }, () => {
    const j = unJugador("edana");
    j.g.llamar("activate_stuff", []);
    const bono = j.dicho.filter((t) => /gauntlet/i.test(t));
    assert.deepEqual(bono, [], `salió el bono en Edana: ${JSON.stringify(bono)}`);
  });

  test("y el control positivo: el mensaje existe y se puede ver salir", { skip: !hay }, () => {
    // SIN ESTO lo de arriba es un cero sin control: podría estar en verde
    // porque el evento no corre, porque el guion no carga o porque el mensaje
    // no llega al buzón. Aquí se le quita la guarda al mapa poniéndole uno de
    // los seis de `MAPS_GAUNTLET_START` — pero OJO, ver la nota de abajo: en el
    // juego de verdad esa lista no está puesta.
    const j = unJugador("lowlands");
    j.g.guion.vars.set("MAPS_GAUNTLET_START", "lowlands;lodagond-1;ww1;the_wall;old_helena;nashalrath");
    j.g.llamar("activate_stuff", []);
    assert.ok(
      j.dicho.some((t) => /Bonus 10,000 damage points for starting gauntlet/.test(t)),
      `el mensaje no salió ni en un mapa de gauntlet; llegaron ${JSON.stringify(j.dicho)}`,
    );
  });

  test("`INIT_DMGPOINTS`: la segunda entrada no vuelve a pasar por el bloque", { skip: !hay }, () => {
    // Es el otro `exitevent` del mismo evento, el de la línea 17:
    // `if ( INIT_DMGPOINTS ) exitevent`. Sin `exitevent` esa guarda tampoco
    // guardaba nada, porque el `if` lleva paréntesis y el nuevo sólo se salta
    // sus hijos.
    const j = unJugador("lowlands");
    j.g.guion.vars.set("MAPS_GAUNTLET_START", "lowlands");
    j.g.llamar("activate_stuff", []);
    const cuantos = j.dicho.length;
    j.g.llamar("activate_stuff", []);
    assert.equal(j.dicho.length, cuantos, "la segunda entrada repitió el bono");
  });
});

// ── 4. LAS DOS COSAS QUE SÓLO SE PUEDEN MIRAR EN EL CÓDIGO ─────────────────
//
// LO QUE ESTAS DOS PRUEBAS MIDEN Y LO QUE NO, dicho antes de leerlas: miden
// el TEXTO DE `src/main.js`, no la pantalla. No son controles del apartado 3 y
// no sustituyen a una sonda. Están porque las dos cosas que vigilan son
// exactamente las que este proyecto pierde en silencio —un gancho que no se
// reenvía (el 63) y una frase inventada que nadie compara con el original (el
// 65)— y las dos viven en una línea de un archivo que ninguna prueba de Node
// puede importar. Un control flojo que dice lo que es vale más que ninguno.

describe("lo que tiene que seguir estando en `src/main.js` (83)", () => {
  const main = readFileSync("src/main.js", "utf8");

  test("el `mapa:` llega al guion del jugador — el gancho del 63", () => {
    // La trampa del 62/63: el parámetro en la firma y nadie que lo pase. Sin
    // esta línea `game.map.name` vale `null` en todas las partidas y las 23
    // pruebas de arriba siguen verdes, porque le construyen ellas el gancho.
    assert.match(main, /mapa:\s*\(\)\s*=>\s*MAPA/, "`new GuionDelJugador` ya no recibe el mapa");
  });

  test("y la frase de «alerted N allies» NO vuelve: el juego no la dice", () => {
    // El usuario: «en el juego original veo que no hay nada de eso de alerta a
    // los enemigos». La cadena del mod no imprime nada al jugador
    // (monsters/base_monster_shared.script:1071-1095: sólo un `dbg`).
    //
    // EL CONTROL DEL MECANISMO NO ES ÉSTE, y conviene que quede dicho: que el
    // aviso siga ocurriendo lo mide `sondas/consecuencias.mjs:400` leyendo
    // `estado.avisos`, que es un contador y no un texto. Aquí sólo se vigila
    // que nadie vuelva a escribir la frase.
    assert.equal(/alerted \$\{|alerted ok/.test(main), false);
    assert.equal(main.includes("as it died`"), false, "volvió el mensaje inventado");
    // Y el positivo de al lado, para que esto no sea un cero: el contador que
    // sí mide el mecanismo sigue estando en los dos caminos, el de un jugador
    // y el del servidor.
    assert.equal((main.match(/cuentas\.avisos \+=/g) ?? []).length, 2,
      "se ha perdido uno de los dos sitios que cuentan los avisos");
  });
});

// ── LO QUE NO SE PORTA, DICHO AQUÍ Y NO DESCUBIERTO LUEGO ──────────────────
//
// `MAPS_GAUNTLET_START` **nunca está puesta en este puerto**, y por eso la
// prueba de arriba se la pone a mano. La pone `world/server/maps.script:6-7`
// con un `setvarg`, y `world.script` no corre aquí: `src/play/intro.js` lo
// lee para sacarle datos, no lo ejecuta.
//
// O sea que hoy, con las cuatro piezas puestas, el bono NO sale en ningún
// mapa — ni en Edana, que es lo que pedía el usuario, ni en los seis en los
// que el original sí lo da. Lo primero está bien y lo segundo es un hueco, y
// se declara aquí en vez de contarse entre los verdes: cuando `world.script`
// corra, este archivo tiene ya el control que lo mide.
//
// Y una consecuencia que vale la pena mirar antes de darla por buena: los 265
// `game.map.name` de los 2 884 guiones llevaban hasta hoy resolviéndose a la
// cadena «game.map.name». Cualquier bloque que compare el mapa contra algo
// estaba comparando contra eso.

// ── EL 83 BIS: EL `if` VIEJO ABANDONA SU LISTA, Y EL LLAMADOR VE «SE CUMPLIÓ» ──
//
// Lo midió la sesión -e0 sobre el menú del propio jugador —`if SHOWIT_ON`
// dentro de `if ( AM_SITTING )`— y toca esta misma función, así que el control
// vive aquí. El motor:
//
//     if (!Cmd.m_NewConditional)
//       break; //Old if command.  Breaks event execution on failure
//                                                     script.cpp:5756-5757
//
// El comentario del motor dice «breaks event execution» y engaña: `break` sale
// del bucle y cae en el `return true` de :5771. A los bloques hijos se entra
// por la recursión de :5752, que TIRA el valor. Así que lo que abandona es su
// `Cmdlist`, y el único sitio que puede notar la diferencia es la cadena de
// `else`, que es el único que lee lo que devuelve `ejecutarLista`.
//
// MEDIDO Y DECLARADO, no contado entre los verdes: de las **1 908 ramas `else`
// de los 2 884 guiones**, 135 llevan un `if` viejo en su primer nivel y **0 de
// ellas son algo distinto de la última rama de su cadena**. Ningún guion del
// juego puede ver la diferencia hoy. Lo que sigue la construye a propósito —y
// desde TEXTO, que la bandera `nueva` la pone el analizador— para que el día
// que un guion la traiga, el control ya esté escrito.
describe("el `if` viejo abandona su lista y no la cadena de `else` (el 83 bis)", () => {
  const GUION = [
    "{ prueba",
    "  if ( 1 equals 2 )",
    "  {",
    "    gplayermessage ent_me AAA",
    "  }",
    "  else",
    "  {",
    "    if NO_PUESTA_NUNCA",
    "    gplayermessage ent_me BBB",
    "  }",
    "  else",
    "  {",
    "    gplayermessage ent_me CCC",
    "  }",
    "}",
  ].join("\n");

  test("el analizador construye las DOS ramas: sin esto la prueba no mide nada", () => {
    const { eventos } = partirGuion(GUION);
    const ev = eventos.find((e) => e.nombre === "prueba");
    const cond = ev.cmds.find((c) => c.condicional);
    assert.equal(cond.nueva, true, "el `if ( ... )` tendría que ser el NUEVO");
    assert.equal(cond.sino.length, 2, "hacen falta dos ramas para poder ver la diferencia");
    assert.ok(cond.sino[0].some((c) => c.condicional && !c.nueva),
      "la primera rama tendría que llevar el `if` VIEJO en su primer nivel");
  });

  test("la primera rama se abandona, y la SEGUNDA no se ejecuta", () => {
    const { dicho } = corre(GUION);
    const todo = dicho.join(" ");
    assert.equal(/AAA/.test(todo), false, "el `if` nuevo era falso: no toca su bloque");
    assert.equal(/BBB/.test(todo), false, "el `if` viejo falló: abandona lo que queda de su rama");
    assert.equal(/CCC/.test(todo), false,
      "la rama siguiente NO va: el motor sale con `break` y el llamador ve `true` (:5771)");
  });
});
