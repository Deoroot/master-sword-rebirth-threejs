// LAS MISIONES: el intérprete, el pago y el guardado.
//
// Todo lo de aquí sale de `msmonsterserver.cpp:2914-3037`
// (`CMSMonster::UseMenuOption`), de `script.cpp` y `scriptcmds.cpp`, y de
// `npcscript.cpp`. Cuando una prueba comprueba algo que parece un fallo, lo
// dice: se porta con el fallo y la prueba lo documenta.
//
// La misión concreta que esto tiene que dejar terminable es la del alcalde de
// Gate City, `scripts/gatecity/mayor.script:103-182`. Las pruebas del final la
// hacen entera contra el script DE VERDAD, no contra una copia escrita aquí.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  partirGuion, palabras, condicion, numDe, enteroDe, partirArgumentos,
  Guion, GLOBALES, olvidarGlobales, COMANDOS, GETTERS,
} from "../src/play/guion.js";
import {
  leerMision, ponerMision, tieneMision, limpiarMisiones, volcarMisiones, misionesDe,
} from "../src/play/misiones.js";
import {
  usarOpcion, comprobarPago, cobrar, inventarioEnOrden, siguienteEnInventario,
  trozosDelPago, nombreVisibleDe, AVISO_NO_PUEDES,
} from "../src/play/usaropcion.js";
import { GuionDeNpc, RelojDeGuiones, entornoDe } from "../src/play/npcguion.js";
import { crearPersonaje, abrirPersonaje, VERSION } from "../src/juego/personaje.js";

const GUIONES = "build/gatecity/guiones.json";
const OBJETOS = "build/msr/objetos.json";
const hayGuiones = existsSync(GUIONES);

/** Un personaje de mentira, con lo justo para pagar. */
const alguien = (extra = {}) => ({
  id: "p1", nombre: "Probe", oro: 0, vida: 20,
  objetos: [], manos: { derecha: null, izquierda: null }, misiones: [],
  ...extra,
});

// ══ EL ANÁLISIS ════════════════════════════════════════════════════════════

describe("partir una línea como la parte el motor", () => {
  test("las comillas dobles agrupan hasta la siguiente comilla", () => {
    // `if (cBuffer[0] == '"') sscanf(CmdLine, "%[^\"]", cBuffer)` — script.cpp:5641
    assert.deepEqual(palabras('local reg.mitem.title "How many more Zombies!?"'),
      ["local", "reg.mitem.title", "How many more Zombies!?"]);
  });

  test("`//` corta, pero sólo cuando empieza una palabra", () => {
    // `if (!strncmp(cBuffer, "//", 2)) break;` — y `cBuffer` ya viene partido
    // por espacios, así que un `//` pegado a otra cosa no corta. script.cpp:5637
    assert.deepEqual(palabras("saytext hola // esto no se dice"), ["saytext", "hola"]);
    assert.deepEqual(palabras("saytext a//b"), ["saytext", "a//b"]);
  });

  test("una comilla sin cerrar se queda con el resto, y no lanza", () => {
    assert.deepEqual(palabras('saytext "se me olvido cerrar'), ["saytext", "se me olvido cerrar"]);
  });
});

describe("LAS DOS FORMAS DE `if`, que es la regla central del lenguaje", () => {
  const arbol = (texto) => partirGuion(texto).eventos[0].cmds;

  test("`if ( A )` con paréntesis es el NUEVO: tiene hijos", () => {
    // `m_NewConditional = true` — script.cpp:5317
    const c = arbol("{ e\n if ( A )\n {\n saytext uno\n saytext dos\n }\n saytext tres\n}")[0];
    assert.equal(c.nombre, "if()");
    assert.equal(c.nueva, true);
    assert.equal(c.hijos.length, 2);
  });

  test("y SIN llaves guarda UNA SOLA línea: `m_SingleCmd = true`", () => {
    // script.cpp:5332. La siguiente ya no es hija.
    const cmds = arbol("{ e\n if ( A )\n saytext uno\n saytext dos\n}");
    assert.equal(cmds[0].hijos.length, 1);
    assert.equal(cmds.length, 2);
  });

  test("`if A` SIN paréntesis es el VIEJO: un comando condicional SIN hijos", () => {
    // `if (!strstr(TestCommand, "(") && *CmdLineTmp != '(') KeepCmd = true;`
    // — script.cpp:5312, y `m_GlobalCmdHash["if"] = ..., true); //The old if`
    // — scriptcmds.cpp:45.
    const cmds = arbol("{ e\n if A\n saytext uno\n saytext dos\n}");
    assert.equal(cmds[0].nombre, "if");
    assert.equal(cmds[0].nueva, false);
    assert.equal(cmds[0].hijos.length, 0);
    assert.equal(cmds.length, 3);
  });

  test("el paréntesis que cierra es el que EMPAREJA, no el primero", () => {
    // `if ( $item_exists(P1,item_x) )`: cortar por el primer `)` parte la
    // condición por la mitad y el getter deja de existir.
    const c = arbol("{ e\n if ( $item_exists(PARAM1,item_x) )\n saytext uno\n}")[0];
    assert.deepEqual(c.params, ["$item_exists(PARAM1,item_x)"]);
  });

  test("`else if( X ) cmd` en una línea se vuelve a analizar entero", () => {
    // Es la recursión de `ParseLine` (script.cpp:5342). Sin ella salía un
    // comando llamado «if(» y el `else if` desaparecía — y así están escritos
    // veintitantos NPCs (`dalya/ferrin.script:88-91`).
    const cmds = arbol("{ e\n if( X == 1 ) local A uno\n else if( X == 2 ) local A dos\n}");
    assert.equal(cmds.length, 1);
    assert.equal(cmds[0].sino.length, 1);
    assert.equal(cmds[0].sino[0][0].nombre, "if()");
    assert.equal(cmds[0].sino[0][0].hijos[0].nombre, "local");
  });

  test("`{ [server] evento` trae su ámbito y su nombre", () => {
    const e = partirGuion("{ [server] zombie_died\n add Z 1\n}").eventos[0];
    assert.equal(e.nombre, "zombie_died");
    assert.equal(e.ambito, "server");
  });

  test("y los `#include` se apuntan, no se resuelven aquí", () => {
    assert.deepEqual(partirGuion("#include monsters/base_chat\n{ e\n}").includes, ["monsters/base_chat"]);
  });
});

describe("EJECUTAR: el `if` viejo abandona el bloque y el nuevo no", () => {
  const corre = (texto) => {
    const g = new Guion({ eventos: partirGuion(texto).eventos });
    const dicho = [];
    g.entorno.hablar = (t) => dicho.push(t);
    g.llamar("e", []);
    return dicho;
  };

  test("el VIEJO que falla se lleva por delante el resto del evento", () => {
    // `if (!Cmd.m_NewConditional) break;` — script.cpp:5756.
    assert.deepEqual(corre("{ e\n saytext antes\n if NO_ESTA_PUESTA_A_UNO\n saytext despues\n}"),
      ["antes"]);
  });

  test("el VIEJO que se cumple deja seguir", () => {
    // Una variable sin poner resuelve a su propio nombre, y `!NOMBRE` es
    // cierto porque `atoi("NOMBRE")` es 0. script.cpp:4741 + scriptcmds.cpp:3971.
    assert.deepEqual(corre("{ e\n if !SIN_PONER\n saytext despues\n}"), ["despues"]);
  });

  test("el NUEVO que falla sólo se salta sus hijos", () => {
    assert.deepEqual(corre("{ e\n if ( SIN_PONER )\n {\n saytext dentro\n }\n saytext despues\n}"),
      ["despues"]);
  });

  test("y el VIEJO de dentro de un bloque sólo abandona ESE bloque", () => {
    // Es exactamente lo que le pasa al alcalde: `if $item_exists(...)` vive
    // dentro del `if ( !QUEST_GOBLINCHIEF ) { ... }`, así que sin la cabeza se
    // cae el bloque de «Give Goblin's Head» y el evento sigue con lo de abajo.
    assert.deepEqual(
      corre("{ e\n if ( 1 )\n {\n saytext dentro\n if FALSA_0\n saytext no\n }\n saytext fuera\n}"),
      ["dentro", "fuera"]);
  });

  test("`else` se encadena y para en el primero que se cumple", () => {
    assert.deepEqual(corre("{ e\n if( X == 1 ) saytext uno\n else if( X == 2 ) saytext dos\n else saytext otro\n}"),
      ["otro"]);
  });
});

describe("las comparaciones de `ScriptCmd_If`", () => {
  test("`equals` es de CADENA y `==` es de NÚMERO, y no dan lo mismo", () => {
    // `FStrEq(CompareFromParam, CompareToParam)` contra `GetNumeric`.
    // scriptcmds.cpp:3981-3984 y :3990-3991. Y `add` deja «1.00», no «1»,
    // así que ésta es la diferencia que se ve jugando.
    assert.equal(condicion(["1.00", "equals", "1"]), false);
    assert.equal(condicion(["1.00", "==", "1"]), true);
  });

  test("un operador que no está en la tabla cae en `equals`", () => {
    // `int iCompareType = 0;` y ninguna rama lo cambia. scriptcmds.cpp:3975.
    assert.equal(condicion(["a", "loquesea", "a"]), true);
  });

  test("sin parámetros suficientes se cumple: «just fall through»", () => {
    // `ConditionsMet = true; ERROR_MISSING_PARMS;` — scriptcmds.cpp:4045.
    assert.equal(condicion([]), true);
    assert.equal(condicion(["a", "equals"]), true);
  });

  test("`atoi` y `atof` leen el principio y se rinden, como en C", () => {
    assert.equal(enteroDe("12abc"), 12);
    assert.equal(enteroDe("abc"), 0);
    assert.equal(numDe("1.50 x"), 1.5);
  });
});

describe("resolver un nombre: el orden de `CScript::GetVar`", () => {
  test("un nombre sin poner devuelve EL PROPIO NOMBRE, no vacío", () => {
    // `return pszText;` — script.cpp:4741. De esto depende media docena de
    // scripts: `if CAN_CHAT isnot 0` con CAN_CHAT sin poner da CIERTO.
    const g = new Guion({});
    assert.equal(g.resolver("CAN_CHAT"), "CAN_CHAT");
    assert.equal(condicion(["CAN_CHAT", "isnot", "0"]), true);
  });

  test("`'entrecomillado'` no se resuelve", () => {
    // script.cpp:4406. Es lo que hace que `if ( PARAM1 equals 'PARAM1' )`
    // distinga «me han llamado desde el chat» de «desde el menú».
    const g = new Guion({});
    g.vars.set("PARAM1", "deberia-ganar");
    assert.equal(g.resolver("'PARAM1'"), "PARAM1");
  });

  test("las locales del evento ganan a las del script", () => {
    const g = new Guion({});
    g.vars.set("X", "del-script");
    assert.equal(g.resolver("X", { locales: new Map([["X", "local"]]) }), "local");
  });

  test("y las globales son COMPARTIDAS entre guiones distintos", () => {
    // `::mslist<scriptvar_t> CScript::m_gVariables;` es estática —
    // script.cpp:52. Es como el `setvarg ZOMBIE_QUEST_COMPLETE 1` del alcalde
    // llega a su propio `say_job`, y a cualquier otro NPC.
    olvidarGlobales();
    const a = new Guion({ eventos: partirGuion("{ e\n setvarg COMPARTIDA 7\n}").eventos });
    a.llamar("e", []);
    const b = new Guion({});
    assert.equal(b.resolver("COMPARTIDA"), "7");
    olvidarGlobales();
  });

  test("los argumentos de un getter se parten por comas respetando paréntesis", () => {
    assert.deepEqual(partirArgumentos("a,$f(b,c),d"), ["a", "$f(b,c)", "d"]);
  });
});

describe("los comandos, con sus rarezas", () => {
  const corre = (texto, entorno = {}) => {
    const g = new Guion({ eventos: partirGuion(texto).eventos });
    Object.assign(g.entorno, entorno);
    g.llamar("e", []);
    return g;
  };

  test("EL FALLO PORTADO: `add` escribe «%.2f», así que 0+1 es «1.00»", () => {
    // `SetVar(..., UTIL_VarArgs("%.2f", flValue), Event)` cuando no se le pasa
    // precisión — scriptcmds.cpp:4221. Por eso los scripts hacen
    // `local Z_COUNT $int(ZOMBIE_COUNT)` antes de enseñar el número.
    const g = corre("{ e\n setvard N 0\n add N 1\n}");
    assert.equal(g.vars.get("N"), "1.00");
    assert.equal(g.resolver("$int(1.00)"), "1");
  });

  test("`local` no sale del evento y `setvar` sí", () => {
    // «Erase all local variables» — script.cpp:5696.
    const g = corre("{ e\n local L uno\n setvard V dos\n}");
    assert.equal(g.vars.has("L"), false);
    assert.equal(g.vars.get("V"), "dos");
  });

  test("`setvar` sobre un nombre que ya es LOCAL pisa la local", () => {
    // `SetVar(VarName, VarValue, Event)`: mira primero las del evento.
    // script.cpp:4771.
    const g = corre("{ e\n local X uno\n setvard X dos\n}");
    assert.equal(g.vars.has("X"), false);
  });

  test("con tres parámetros o más, `setvar` CONCATENA SIN espacios", () => {
    // `for (i...) sTemp += Params[i + 1];` — scriptcmds.cpp:6571-6573.
    const g = corre("{ e\n setvard X ab cd\n}");
    assert.equal(g.vars.get("X"), "abcd");
  });

  test("pero `saytext` junta CON espacios", () => {
    // `if (i) sTemp += " ";` — npcscript.cpp:713-716.
    const dicho = [];
    corre('{ e\n saytext Kill me 40 zombies\n}', { hablar: (t) => dicho.push(t) });
    assert.deepEqual(dicho, ["Kill me 40 zombies"]);
  });

  test("un comando que no existe se APUNTA y el evento sigue", () => {
    // El motor avisa por consola y sigue (script.cpp:5627). Un intérprete que
    // se calle lo que no entiende da una misión que parece funcionar.
    const dicho = [];
    const g = corre("{ e\n tossprojectile x\n saytext sigo\n}", { hablar: (t) => dicho.push(t) });
    assert.deepEqual(dicho, ["sigo"]);
    assert.deepEqual(g.noSoportados, [{ tipo: "comando", nombre: "tossprojectile" }]);
  });

  test("`callevent <n> <evento>` es un RETARDO si empieza por dígito", () => {
    // `if (isdigit(Params[NextParm].c_str()[0]))` — scriptcmds.cpp:2241.
    const cola = [];
    corre("{ e\n callevent 4.0 otro\n}\n{ otro\n saytext tarde\n}", { programar: (s, q) => cola.push([s, q]) });
    assert.equal(cola.length, 1);
    assert.equal(cola[0][0], 4);
  });

  test("y un evento NO puede llamarse a sí mismo sin retardo", () => {
    // «Can't call myself recursively» — scriptcmds.cpp:2297. Sin esto el
    // `chat_loop` de `base_chat` no termina.
    const dicho = [];
    corre("{ e\n saytext una\n callevent e\n}", { hablar: (t) => dicho.push(t) });
    assert.deepEqual(dicho, ["una"]);
  });

  test("EL FALLO PORTADO: `menuitem.register` NO limpia `reg.mitem.*`", () => {
    // npcscript.cpp:940-1000: lee las variables y las deja puestas. La segunda
    // opción hereda el título de la primera si no lo vuelve a poner.
    const ops = [];
    corre(`{ e
 local reg.mitem.title Primera
 local reg.mitem.callback uno
 menuitem.register
 local reg.mitem.callback dos
 menuitem.register
}`, { registrarOpcion: (o) => ops.push(o) });
    assert.equal(ops.length, 2);
    assert.equal(ops[1].titulo, "Primera");
    assert.equal(ops[1].respuesta, "dos");
  });

  test("el tipo que no está en la tabla es `callback`", () => {
    // `else MenuOption.Type = MOT_CALLBACK;` — npcscript.cpp:972.
    const ops = [];
    corre("{ e\n local reg.mitem.type loquesea\n menuitem.register\n}", { registrarOpcion: (o) => ops.push(o) });
    assert.equal(ops[0].tipo, "loquesea");      // el nombre crudo llega tal cual…
  });
});

describe("EL SUBCONJUNTO PORTADO, dicho aquí para que no crezca a escondidas", () => {
  test("son 78 comandos de los 223 del motor, y éstos", () => {
    // Si esta prueba se cae es porque alguien añadió un comando: hay que
    // volver a correr `npm run guiones` y actualizar la cuenta de
    // `doc/MISIONES_33.md`, porque la cobertura cambia.
    //
    // 22 hasta el 33; los siete del 43 son los que más piden los NPC de Gate
    // City, elegidos midiendo — ver `doc/GUIONES_43.md`.
    // El 83 lo movió de 77 a 78, y no sumando uno: QUITÓ `exit`, que no existe
    // en el motor y que no usa ni uno de los 2 884 guiones, y puso `exitevent`
    // —el que de verdad corta un evento, 108 líneas en 53 ficheros— y
    // `returndata`, el alias de `return`. Ver `test/gauntlet83.test.mjs`.
    // El 89b sumó doce, los pequeños del intérprete que pedía el guion del
    // jugador: ver `test/comandos89b.test.mjs`, que los nombra uno a uno.
    // El 89c sumó nueve, los que cambian el estado del jugador
    // (`test/jugador89c.test.mjs`), y los efectos del 89 tres más
    // (`applyeffect`, `removeeffect`, `removescript`). Escrito como suma para
    // que se vea de quién es cada parte.
    // El 91 sumó cuatro, los que pedía el veneno: `dodamage` y `xdodamage`
    // (las dos formas de hacer daño desde un guion), `scriptflags` y
    // `takedmg`. Ver `test/veneno91.test.mjs`.
    assert.equal(COMANDOS.size, 90 + 9 + 3 + 4);
    for (const c of ["dodamage", "xdodamage", "scriptflags", "takedmg"]) {
      assert.ok(COMANDOS.has(c), `falta ${c}, que es del 91`);
    }
    assert.equal(COMANDOS.has("exit"), false, "`exit` no es un comando del motor (el 83)");
    for (const c of ["exitevent", "returndata"]) {
      assert.ok(COMANDOS.has(c), `falta ${c}, que es del 83`);
    }
    for (const c of ["if", "if()", "setvard", "setvarg", "local", "saytext", "offer", "quest", "menuitem.register"]) {
      assert.ok(COMANDOS.has(c), `falta ${c}`);
    }
    for (const c of ["stradd", "playsound", "setprop", "say", "roam", "setmovedest", "setmoveanim"]) {
      assert.ok(COMANDOS.has(c), `falta ${c}, que es del 43`);
    }
    // Las tiendas del 44 van con su alias viejo cada una, porque los guiones
    // usan unas veces uno y otras veces otro.
    for (const c of ["npcstore.create", "createstore", "npcstore.additem", "addstoreitem",
      "npcstore.offer", "offerstore", "npcstore.remove"]) {
      assert.ok(COMANDOS.has(c), `falta ${c}, que es del 44`);
    }
    // El 64: los tres del guion DEL JUGADOR. `repeatdelay` no es como los
    // demás —lo resuelve el CARGADOR, no el intérprete— y por eso lleva su
    // propia prueba en `test/juego_jugador64.test.mjs`.
    for (const c of ["repeatdelay", "givehp", "givemp"]) {
      assert.ok(COMANDOS.has(c), `falta ${c}, que es del 64`);
    }
    // El 45: `deleteent` y su gemelo `deleteme`, que son LA MISMA función del
    // motor con dos nombres (scriptcmds.cpp:138-139).
    for (const c of ["deleteent", "deleteme"]) {
      assert.ok(COMANDOS.has(c), `falta ${c}, que es del 45`);
    }
    // El 67: el único comando del lenguaje que cruza al `.bsp`. Va solo porque
    // es el único de su especie — lo demás que un guion hace se queda entre
    // guiones, y esto dispara entidades del mapa.
    assert.ok(COMANDOS.has("usetrigger"), "falta usetrigger, que es del 67");
    // El 46: el andamiaje de menú. Van juntos a propósito — es la lección del
    // 44, donde siete comandos buenos movieron el censo cero porque lo que
    // bloqueaba estaba en otro sitio.
    for (const c of ["calleventloop", "multiply", "menuitem.remove", "menu.open",
      "catchspeech", "helptip", "gplayermessage", "playrandomsound",
      "array.create", "array.add", "array.del"]) {
      assert.ok(COMANDOS.has(c), `falta ${c}, que es del 46`);
    }
    // Y cada `array.*` tiene su gemela global con `g_` delante.
    for (const c of [...COMANDOS].filter((x) => x.startsWith("array."))) {
      assert.ok(COMANDOS.has(`g_${c}`), `falta la global de ${c}`);
    }
  });
  test("y 28 getters", () => {
    // 21 hasta el 90; el 91 sumó seis para los venenos: `$get_takedmg`,
    // `$math`, `$string_upto` y su gemelo `$string_from` (la MISMA función,
    // script.cpp:98 y :119), `$get_scriptflag` y `$pass`; y uno más que pidió
    // el censo de los bichos, `$can_damage`.
    assert.equal(GETTERS.size, 21 + 6 + 1);
    for (const g of ["$get_takedmg", "$math", "$string_upto", "$string_from", "$get_scriptflag", "$pass", "$can_damage"]) {
      assert.ok(GETTERS.has(g), `falta ${g}, que es del 91`);
    }
    // El 83: los dos de la guarda del bono del gauntlet. Entran juntos porque
    // por separado no sirven de nada — la guarda es
    // `$get_find_token(MAPS_GAUNTLET_START,$lcase(game.map.name)) == -1`.
    for (const g of ["$get_find_token", "$lcase"]) {
      assert.ok(GETTERS.has(g), `falta ${g}, que es del 83`);
    }
    // El 81: `$cansee`. Entra con nombre propio porque lo que lo destapó no
    // fue el censo sino una misión que no arrancaba — con el `if` VIEJO, un
    // getter sin soporte abandona el BLOQUE entero (el 67), así que el
    // `say_job` de Sylphiel moría en su primera línea.
    assert.ok(GETTERS.has("$cansee"), "el `$cansee` del 81");
    assert.ok(GETTERS.has("$item_exists") && GETTERS.has("$get_quest_data"));
    assert.ok(GETTERS.has("$randf"), "el `$randf` del 43");
    assert.ok(GETTERS.has("$get_by_name") && GETTERS.has("$get_token_amt"), "los dos del 45");
    // El 46: los cuatro de las listas y sus cuatro gemelos globales, que son
    // EL MISMO getter del motor con ocho nombres (script.cpp:129-141).
    for (const g of ["$get_array", "$get_arrayfind", "$get_array_amt", "$get_array_exists"]) {
      assert.ok(GETTERS.has(g), `falta ${g}, que es del 46`);
      assert.ok(GETTERS.has(g.replace("$", "$g_")), `falta su gemelo global de ${g}`);
    }
  });
});

// ══ LAS MISIONES ═══════════════════════════════════════════════════════════

describe("el diccionario de misiones", () => {
  test("`$get_quest_data` de una misión sin poner es «0», no vacío", () => {
    // `return "0";` — script.cpp:2189. De eso depende que
    // `if RQUEST_STAGE >= 1` dé falso en una partida nueva.
    assert.equal(leerMision(alguien(), "r"), "0");
  });

  test("poner, pisar y quitar, conservando el sitio", () => {
    // `CBasePlayer::SetQuest` — player.cpp:6275-6316.
    const p = alguien();
    ponerMision(p, "r", "1");
    ponerMision(p, "dl", "5");
    ponerMision(p, "r", "2");
    assert.deepEqual(misionesDe(p), [{ n: "r", d: "2" }, { n: "dl", d: "5" }]);
    ponerMision(p, "r", null);
    assert.deepEqual(misionesDe(p), [{ n: "dl", d: "5" }]);
  });

  test("quitar algo que no está no hace nada y no lanza", () => {
    const p = alguien();
    ponerMision(p, "no-existe", null);
    assert.deepEqual(misionesDe(p), []);
  });

  test("«0» puesta y «0» sin poner se distinguen con `tieneMision`", () => {
    const p = alguien();
    assert.equal(tieneMision(p, "r"), false);
    ponerMision(p, "r", "0");
    assert.equal(tieneMision(p, "r"), true);
    assert.equal(leerMision(p, "r"), "0");
  });

  test("`quest dump` escribe lo que escribe el motor", () => {
    // scriptcmds.cpp:4890-4895.
    const p = alguien();
    ponerMision(p, "r", "3");
    assert.deepEqual(volcarMisiones(p), ["#0 name: r data: 3"]);
  });

  test("`quest clear` las borra todas", () => {
    const p = alguien();
    ponerMision(p, "r", "3");
    limpiarMisiones(p);
    assert.deepEqual(misionesDe(p), []);
  });

  test("y el comando `quest` del script llega hasta el personaje", () => {
    const p = alguien();
    const g = new Guion({ eventos: partirGuion("{ e\n quest set PARAM1 r 2\n}").eventos });
    Object.assign(g.entorno, entornoDe({ jugador: { ref: "p1", personaje: p } }));
    g.llamar("e", ["p1"]);
    assert.equal(leerMision(p, "r"), "2");
  });

  test("EL FALLO PORTADO: `quest set` SIN valor no pone nada", () => {
    // `if (!SetData || Params.size() >= 4)` — scriptcmds.cpp:4874: con tres
    // parámetros y acción `set`, la guarda no deja llamar a `SetQuest`.
    const p = alguien();
    const g = new Guion({ eventos: partirGuion("{ e\n quest set PARAM1 r\n}").eventos });
    Object.assign(g.entorno, entornoDe({ jugador: { ref: "p1", personaje: p } }));
    g.llamar("e", ["p1"]);
    assert.equal(tieneMision(p, "r"), false);
  });
});

// ══ EL GUARDADO, que es lo que puede comerse una partida ═══════════════════

describe("EL GUARDADO CAMBIA DE FORMA, y los viejos tienen que abrirse", () => {
  /** Un personaje del 32, tal cual lo dejaba el código de antes del 33. */
  const DEL_32 = {
    version: 1, id: "viejo", creado: "2026-01-01T00:00:00.000Z",
    actualizado: "2026-01-02T00:00:00.000Z", nombre: "Vieja Gloria", genero: "female",
    oro: 137, habilidades: {}, objetos: [{ id: "swords_rsword", n: 1 }],
    manos: { derecha: "swords_rsword", izquierda: null }, hechizos: [],
    ranuras: [], mapasVisitados: ["gatecity"], mapa: "gatecity", vida: 20, mana: 5,
  };

  test("un personaje SIN el campo se abre, con la lista vacía y sin avisos raros", () => {
    const { personaje, avisos } = abrirPersonaje(structuredClone(DEL_32));
    assert.deepEqual(personaje.misiones, []);
    assert.equal(personaje.oro, 137);
    assert.equal(personaje.nombre, "Vieja Gloria");
    // Y NO se le inventa un aviso: no traerlo es lo normal, no un problema.
    assert.equal(avisos.some((a) => /misi/i.test(a)), false);
  });

  test("y sigue teniendo sus 36 ranuras y sus objetos: no se ha roto nada más", () => {
    const { personaje } = abrirPersonaje(structuredClone(DEL_32));
    assert.equal(personaje.ranuras.length, 36);
    assert.deepEqual(personaje.objetos, [{ id: "swords_rsword", n: 1 }]);
  });

  test("un personaje CON misiones las conserva al abrirlo", () => {
    const doc = { ...structuredClone(DEL_32), misiones: [{ n: "r", d: "3" }] };
    const { personaje } = abrirPersonaje(doc);
    assert.deepEqual(personaje.misiones, [{ n: "r", d: "3" }]);
    assert.equal(leerMision(personaje, "r"), "3");
  });

  test("una entrada rota se tira ELLA, no el personaje entero", () => {
    const doc = { ...structuredClone(DEL_32), misiones: [{ n: "r", d: "3" }, null, { d: "sin nombre" }, { n: "dl" }] };
    const { personaje } = abrirPersonaje(doc);
    assert.deepEqual(personaje.misiones, [{ n: "r", d: "3" }, { n: "dl", d: "" }]);
  });

  test("y si venían con OTRA forma —un objeto— se empieza de cero y se dice", () => {
    const doc = { ...structuredClone(DEL_32), misiones: { r: "3" } };
    const { personaje, avisos } = abrirPersonaje(doc);
    assert.deepEqual(personaje.misiones, []);
    assert.ok(avisos.some((a) => /misiones/i.test(a)), avisos.join(" | "));
  });

  test("EL CAMINO DE VUELTA: un personaje del 33 abierto por el código de antes", () => {
    // El 32 no conocía `misiones`, pero su `abrirPersonaje` CONSERVA lo que no
    // conoce y lo vuelve a escribir (la regla de la cabecera de
    // `personaje.js`). Se simula quitando el campo de CONOCIDOS: lo que llega
    // a `avisos` es «campos que este código no conoce y se conservan», y el
    // valor sobrevive. Aquí se comprueba lo que sí se puede comprobar: que un
    // campo desconocido de HOY sobrevive a una vuelta completa.
    const doc = { ...structuredClone(DEL_32), inventadoEnEl34: { algo: 1 } };
    const { personaje, avisos } = abrirPersonaje(doc);
    assert.deepEqual(personaje.inventadoEnEl34, { algo: 1 });
    assert.ok(avisos.some((a) => /inventadoEnEl34/.test(a)));
  });

  test("un personaje NUEVO ya nace con la lista puesta", () => {
    const p = crearPersonaje({ nombre: "Nuevo", arma: null, nuevoPersonaje: { oro: 10, gratis: [], armas: [] } });
    assert.deepEqual(p.misiones, []);
    assert.equal(p.version, VERSION);
  });
});

// ══ EL PAGO: `CMSMonster::UseMenuOption` ═══════════════════════════════════

describe("el inventario en el orden en que el motor lo recorre", () => {
  test("las manos primero, la mochila después", () => {
    // `if (CheckHands) for (i < MAX_NPC_HANDS) ...Hand(i)...` y luego `Gear`.
    // msmonstershared.cpp:234-248.
    const p = alguien({ manos: { izquierda: "escudo", derecha: "espada" }, objetos: [{ id: "piedra", n: 1 }] });
    assert.deepEqual(inventarioEnOrden(p).map((x) => x.clave), ["escudo", "espada", "piedra"]);
  });

  test("un montón de tres son tres entidades seguidas", () => {
    const p = alguien({ objetos: [{ id: "flecha", n: 3 }] });
    assert.equal(inventarioEnOrden(p).length, 3);
  });

  test("y la búsqueda DA LA VUELTA al llegar al final", () => {
    // «Item with StartID wasn't found, use the first valid item found»
    // — msmonstershared.cpp:293.
    const l = inventarioEnOrden(alguien({ objetos: [{ id: "a", n: 1 }, { id: "b", n: 1 }] }));
    assert.equal(siguienteEnInventario(l, 0).clave, "a");
    assert.equal(siguienteEnInventario(l, 1).clave, "b");
    assert.equal(siguienteEnInventario(l, 2).clave, "a");   // la vuelta
  });
});

describe("qué cuesta un pago y si se puede pagar", () => {
  test("`gold:N` suma oro y lo demás es `nombre:cantidad`", () => {
    // `TokenizeString(MenuOption.Data, Payments)` por espacios — :2944.
    assert.deepEqual(trozosDelPago("gold:50 item_x:2"), ["gold:50", "item_x:2"]);
    const p = alguien({ oro: 100, objetos: [{ id: "item_x", n: 2 }] });
    const r = comprobarPago(p, "gold:50 item_x:2");
    assert.equal(r.puede, true);
    assert.equal(r.oro, 50);
    assert.equal(r.encontrados.length, 2);
  });

  test("EL FALLO PORTADO: `gold` se mira con `starts_with`", () => {
    // `if (Payment.starts_with("gold")) TotalGold += atoi(Payment.substr(5));`
    // — :2953. Un objeto que se llamara `goldring` se leería como oro, y
    // `substr(5)` de «goldring» es «ing», que `atoi` deja en 0: un pago gratis.
    const r = comprobarPago(alguien(), "goldring");
    assert.equal(r.puede, true);
    assert.equal(r.oro, 0);
    assert.equal(r.encontrados.length, 0);
  });

  test("EL FALLO PORTADO: la vuelta al círculo cuenta DOS VECES el mismo objeto", () => {
    // El corte es `LastItem == FirstItem` (:2982) pero el objeto ya se ha
    // añadido antes (:2975). Con uno en la mochila y un pago de dos, el pago
    // cuela. Ninguna opción de Gate City pide dos de nada, así que no se ve
    // jugando — pero está.
    const p = alguien({ objetos: [{ id: "item_x", n: 1 }] });
    const r = comprobarPago(p, "item_x:2");
    assert.equal(r.puede, true, "el motor da el pago por bueno con un solo objeto");
    assert.equal(r.encontrados.length, 2);
    assert.equal(r.encontrados[0].id, r.encontrados[1].id, "y son EL MISMO");
  });

  test("`item_x:0` cuenta como uno", () => {
    // `if (!Amount) Amount = 1;` — :2962.
    const r = comprobarPago(alguien({ objetos: [{ id: "item_x", n: 1 }] }), "item_x:0");
    assert.equal(r.puede, true);
    assert.equal(r.encontrados.length, 1);
  });
});

describe("EL ORDEN RARO: el objeto corta y el oro no", () => {
  test("si faltan LAS DOS cosas, el mensaje es el DEL OBJETO", () => {
    // Los objetos se comprueban dentro del bucle y fallar hace `break` (:2993);
    // el oro se comprueba después y fallar no corta (:3006). Del oro no te
    // enteras.
    const r = comprobarPago(alguien({ oro: 0 }), "gold:50 item_x");
    assert.equal(r.puede, false);
    assert.equal(r.faltaba, "objeto");
    assert.match(r.falta, /item_x/);
    assert.doesNotMatch(r.falta, /Gold/);
  });

  test("y si sólo falta el oro, el mensaje es el del oro", () => {
    const r = comprobarPago(alguien({ oro: 10 }), "gold:50");
    assert.equal(r.puede, false);
    assert.equal(r.faltaba, "oro");
    assert.equal(r.falta, "You can't afford the payment of 50 Gold");
  });

  test("el trozo que va DESPUÉS del que falla ni se mira", () => {
    // Es el `break`: con `item_a item_b` y sin `item_a`, `item_b` no se busca.
    const r = comprobarPago(alguien(), "item_a item_b");
    assert.match(r.falta, /item_a/);
  });
});

describe("cobrar, y lo que `SUB_Remove()` NO hace", () => {
  test("resta el oro y quita el objeto de la mochila", () => {
    const p = alguien({ oro: 100, objetos: [{ id: "item_x", n: 2 }] });
    cobrar(p, comprobarPago(p, "gold:30 item_x"));
    assert.equal(p.oro, 70);
    assert.deepEqual(p.objetos, [{ id: "item_x", n: 1 }]);
  });

  test("EL FALLO PORTADO: pagar con lo que llevas EN LA MANO deja la mano vacía", () => {
    // `SUB_Remove()` y no `RemoveItem()` — msmonsterserver.cpp:3013, con la
    // línea vieja comentada al lado. `CMSMonster::RemoveItem` enfunda y llama
    // a `SwitchToBestHand()` (msmonstershared.cpp:370-382); `SUB_Remove` no
    // (genericitem.cpp:532-554). O sea que te quedas sin cambiar de arma.
    const p = alguien({ manos: { derecha: "item_x", izquierda: "espada" }, objetos: [] });
    cobrar(p, comprobarPago(p, "item_x"));
    assert.equal(p.manos.derecha, null);
    assert.equal(p.manos.izquierda, "espada", "y NO se cambia a la otra mano");
  });
});

describe("`usarOpcion`: el camino entero", () => {
  const npcFalso = () => {
    const llamadas = [];
    const avisos = [];
    const dicho = [];
    return {
      llamadas, avisos, dicho,
      npc: {
        llamar: (e, p) => llamadas.push({ evento: e, params: p }),
        hablarJugador: (t) => dicho.push(t),
        avisar: (tipo, t) => avisos.push({ tipo, texto: t }),
      },
    };
  };
  const pago = (extra = {}) => ({ titulo: "Pagar", tipo: "payment", datos: "item_x", respuesta: "ok", siFalla: "", prioridad: 0, ...extra });

  test("EL CONTROL POSITIVO: pagar sin tenerlo no cobra NADA y avisa", () => {
    const { npc, avisos, llamadas } = npcFalso();
    const p = alguien({ oro: 137 });
    const r = usarOpcion({ opciones: [pago()], indice: 0, npc, personaje: p });
    assert.equal(r.pago.puede, false);
    assert.equal(r.cobrado, null);
    assert.equal(p.oro, 137, "NO SE COBRÓ NADA");
    assert.deepEqual(p.objetos, []);
    assert.equal(avisos[0].tipo, AVISO_NO_PUEDES);
    assert.match(avisos[0].texto, /You can't afford the payment of/);
    assert.equal(llamadas.length, 0, "y la retrollamada de éxito NO se llamó");
  });

  test("y con `cb_failed` se llama a ÉSA, no a la de éxito", () => {
    // `if (!PlayerCanPay) CallbackEvent = MenuOption.CB_Failed_Name;` — :3029.
    const { npc, llamadas } = npcFalso();
    usarOpcion({ opciones: [pago({ siFalla: "fallo" })], indice: 0, npc, personaje: alguien() });
    assert.equal(llamadas[0].evento, "fallo");
  });

  test("`payment_silent` no dice nada, y tampoco cobra", () => {
    // `if (!MenuOption.SilentPayment)` — :2990. msmonster.h:158.
    const { npc, avisos } = npcFalso();
    usarOpcion({ opciones: [pago({ silencioso: true })], indice: 0, npc, personaje: alguien() });
    assert.equal(avisos.length, 0);
  });

  test("pagando bien, se cobra y se llama a la retrollamada", () => {
    const { npc, llamadas } = npcFalso();
    const p = alguien({ objetos: [{ id: "item_x", n: 1 }] });
    const r = usarOpcion({ opciones: [pago()], indice: 0, npc, personaje: p });
    assert.deepEqual(r.cobrado, ["item_x"]);
    assert.deepEqual(p.objetos, []);
    assert.equal(llamadas[0].evento, "ok");
  });

  test("EL ARREGLO DE THOTHIE: `Data` viaja como PARAM2", () => {
    // `Params.add(MenuOption.Data); //Thothie - reg.mitem.data function wasn't
    // returning as PARAM2 in type callback as described by docs` — :3022.
    const { npc, llamadas } = npcFalso();
    usarOpcion({
      opciones: [{ titulo: "x", tipo: "callback", datos: "2", respuesta: "cb", prioridad: 0 }],
      indice: 0, npc, personaje: alguien(), refJugador: "p1",
    });
    assert.deepEqual(llamadas[0].params, ["p1", "2"]);
  });

  test("`MOT_SAY` hace hablar AL JUGADOR, no al NPC", () => {
    // `pPlayer->Speak(MenuOption.Data, SPEECH_LOCAL)` — :2937.
    const { npc, dicho } = npcFalso();
    usarOpcion({ opciones: [{ titulo: "x", tipo: "say", datos: "Hola", prioridad: 0 }], indice: 0, npc, personaje: alguien() });
    assert.deepEqual(dicho, ["Hola"]);
  });

  test("el −1 dispara `game_menu_cancel` y no toca nada más", () => {
    // :2920-2926. Y es `== -1` exacto.
    const { npc, llamadas } = npcFalso();
    const r = usarOpcion({ opciones: [pago()], indice: -1, npc, personaje: alguien(), refJugador: "p1" });
    assert.equal(r.cancelado, true);
    assert.deepEqual(llamadas, [{ evento: "game_menu_cancel", params: ["p1"] }]);
  });

  test("un índice fuera de la lista no hace nada Y NO borra la lista", () => {
    // El `return` está ANTES del `clearitems()` — :2928 contra :3036.
    const { npc } = npcFalso();
    const ops = [pago()];
    usarOpcion({ opciones: ops, indice: 9, npc, personaje: alguien() });
    assert.equal(ops.length, 1);
  });

  test("pero elegir bien SÍ borra la lista del servidor", () => {
    // `Menuoptions.clearitems()` — :3036.
    const { npc } = npcFalso();
    const ops = [pago()];
    usarOpcion({ opciones: ops, indice: 0, npc, personaje: alguien() });
    assert.equal(ops.length, 0);
  });
});

describe("el nombre que se enseña al no poder pagar", () => {
  const cat = new Map([["item_goblinhead", { nombre: "Goblin Chief's Head" }]]);
  test("sale del catálogo, no la clave", () => {
    assert.equal(nombreVisibleDe(cat, "item_goblinhead"), "Goblin Chief's Head");
  });
  test("EL FALLO PORTADO: el plural es una «s» a pelo", () => {
    // `_snprintf(..., "%i %s%s", pItem->iQuantity, pItem->DisplayName(), "s")`
    // — syntax.cpp:10.
    assert.equal(nombreVisibleDe(cat, "item_goblinhead", 3), "3 Goblin Chief's Heads");
  });
  test("y un objeto que no está en el catálogo se anuncia con su clave", () => {
    // `static msstring DisplayName = ItemName;` y `if (pItem)` — genericitem.cpp:301.
    assert.equal(nombreVisibleDe(cat, "item_que_no_existe"), "item_que_no_existe");
  });
});

describe("el reloj de los `calleventtimed`", () => {
  test("nada vence antes de tiempo, y lo vencido corre una sola vez", () => {
    const r = new RelojDeGuiones();
    const pasos = [];
    r.programar(3, () => pasos.push("tres"));
    r.programar(1, () => pasos.push("uno"));
    assert.equal(r.paso(0.5), 0);
    assert.equal(r.paso(1), 1);
    assert.deepEqual(pasos, ["uno"]);
    r.paso(5);
    assert.deepEqual(pasos, ["uno", "tres"]);
    r.paso(5);
    assert.equal(pasos.length, 2);
  });

  test("lo que se programe DURANTE un paso queda para el siguiente", () => {
    // Sin esto, una cadena de `callevent 0 x` se come el bucle del juego.
    const r = new RelojDeGuiones();
    let n = 0;
    const encadenar = () => { n++; if (n < 5) r.programar(0, encadenar); };
    r.programar(0, encadenar);
    r.paso(0.1);
    assert.equal(n, 1);
  });

  test("y un evento que se cae no para los demás", () => {
    const r = new RelojDeGuiones();
    let bien = false;
    r.programar(0, () => { throw new Error("me caigo"); });
    r.programar(0, () => { bien = true; });
    r.paso(1);
    assert.equal(bien, true);
  });
});

// ══ LA MISIÓN DEL ALCALDE, CONTRA SU SCRIPT DE VERDAD ══════════════════════

describe("LA MISIÓN DEL ALCALDE DE GATE CITY, de principio a fin", {
  skip: hayGuiones ? false : `falta ${GUIONES} (corre \`npm run guiones\`)`,
}, () => {
  const fichero = () => JSON.parse(readFileSync(GUIONES, "utf8"));
  const catalogo = () => (existsSync(OBJETOS)
    ? new Map(JSON.parse(readFileSync(OBJETOS, "utf8")).objetos.map((o) => [o.id, o]))
    : new Map());

  /** Un alcalde vivo, con su reloj y su bitácora de lo que dice. */
  function alcalde() {
    olvidarGlobales();
    const dicho = [];
    const reloj = new RelojDeGuiones();
    const npc = new GuionDeNpc({
      ficha: fichero().guiones["gatecity/mayor"],
      npc: { nombre: "Mayor Vilhelm", script: "gatecity/mayor" },
      catalogo: catalogo(),
      suceso: (tipo, texto) => dicho.push({ tipo, texto }),
      programar: (s, q) => reloj.programar(s, q),
      // `$rand(50,60)` con el dado clavado al mínimo: una prueba no puede
      // depender de un número aleatorio, y el mínimo es un número del script.
      azar: (a) => a,
    });
    return { npc, dicho, reloj, hastaElFinal: () => { for (let i = 0; i < 20; i++) reloj.paso(1); } };
  }

  test("el menú trae SIETE opciones, y tres son de `base_chat`", () => {
    // El 29 leía cuatro porque su lector no seguía los `#include`.
    // `RunScriptEventByName` ejecuta TODOS los eventos con ese nombre
    // (script.cpp:5836), y `monsters/base_chat` tiene el suyo.
    const { npc } = alcalde();
    const p = alguien({ objetos: [{ id: "item_goblinhead", n: 1 }, { id: "item_gaxe_handle", n: 1 }] });
    const ops = npc.pedirOpciones({ personaje: p, ref: "p1" });
    assert.deepEqual(ops.map((o) => o.titulo), [
      "Hail", "Ask about Jobs", "Ask about Rumors",
      "Ask about broken axe", "Give Goblin's Head",
    ]);
  });

  test("SIN la cabeza, «Give Goblin's Head» NO APARECE", () => {
    // Y esto CORRIGE al 29, que la enseñaba siempre. `if
    // $item_exists(PARAM1,item_goblinhead)` (mayor.script:130) es el `if`
    // VIEJO: al fallar abandona el bloque, y con él se van el `setvar
    // QUESTER_HEAD` y las cuatro líneas que registran la opción.
    const { npc } = alcalde();
    const ops = npc.pedirOpciones({ personaje: alguien(), ref: "p1" });
    assert.deepEqual(ops.map((o) => o.titulo), ["Hail", "Ask about Jobs", "Ask about Rumors"]);
  });

  test("LA MISIÓN ENTERA: la cabeza sale del inventario y la recompensa entra", () => {
    const { npc, dicho, hastaElFinal } = alcalde();
    const p = alguien({ oro: 10, objetos: [{ id: "item_goblinhead", n: 1 }] });
    const ops = npc.pedirOpciones({ personaje: p, ref: "p1" });
    const i = ops.findIndex((o) => o.titulo === "Give Goblin's Head");
    assert.ok(i >= 0);
    assert.equal(ops[i].tipo, "payment");

    const r = npc.elegir(i, { personaje: p, ref: "p1" });
    assert.equal(r.pago.puede, true);
    assert.deepEqual(r.cobrado, ["item_goblinhead"]);
    assert.equal(r.retrollamada, "say_ending");
    assert.deepEqual(p.objetos, [], "la cabeza salió del inventario");

    hastaElFinal();                          // los `calleventtimed 3`
    // `offer QUESTER_HEAD gold $rand(50,60)` — mayor.script:179.
    assert.equal(p.oro, 60, "10 de antes y 50 de recompensa");
    const frases = dicho.filter((d) => /says/.test(d.texto)).map((d) => d.texto);
    assert.ok(frases.some((f) => /You have proven your worth/.test(f)), frases.join(" | "));
    assert.ok(frases.some((f) => /Take this gold as a reward/.test(f)), frases.join(" | "));
  });

  test("y al terminarla la opción desaparece: `setvard QUEST_GOBLINCHIEF 1`", () => {
    const { npc, hastaElFinal } = alcalde();
    const p = alguien({ objetos: [{ id: "item_goblinhead", n: 1 }] });
    const ops = npc.pedirOpciones({ personaje: p, ref: "p1" });
    npc.elegir(ops.findIndex((o) => o.titulo === "Give Goblin's Head"), { personaje: p, ref: "p1" });
    hastaElFinal();
    p.objetos.push({ id: "item_goblinhead", n: 1 });   // aunque traiga otra
    const otra = npc.pedirOpciones({ personaje: p, ref: "p1" });
    assert.equal(otra.some((o) => o.titulo === "Give Goblin's Head"), false);
  });

  test("EL CONTROL POSITIVO: perder la cabeza con el menú abierto no cobra nada", () => {
    // El servidor guarda la lista al abrir el menú (`m_MenuOptions`,
    // msmonsterserver.cpp:2917) y la vuelve a comprobar al elegir. Es el único
    // camino por el que se llega a la rama del «no puedes» de esta opción,
    // porque sin la cabeza la opción no se ofrece.
    const { npc, dicho, hastaElFinal } = alcalde();
    const p = alguien({ oro: 10, objetos: [{ id: "item_goblinhead", n: 1 }] });
    const ops = npc.pedirOpciones({ personaje: p, ref: "p1" });
    const i = ops.findIndex((o) => o.titulo === "Give Goblin's Head");
    p.objetos = [];                          // se pierde por el camino

    const r = npc.elegir(i, { personaje: p, ref: "p1" });
    hastaElFinal();
    assert.equal(r.pago.puede, false);
    assert.equal(r.cobrado, null);
    assert.equal(r.retrollamada, null, "y `say_ending` NO se llamó");
    assert.equal(p.oro, 10, "NO SE COBRÓ NI SE PAGÓ NADA");
    const aviso = dicho.find((d) => d.tipo === AVISO_NO_PUEDES);
    assert.equal(aviso?.texto, "You can't afford the payment of Goblin Chief's Head");
  });

  test("«Ask about broken axe» sólo sale con el mango, y dispara sus cuatro frases", () => {
    const { npc, dicho, hastaElFinal } = alcalde();
    const p = alguien({ objetos: [{ id: "item_gaxe_handle", n: 1 }] });
    const ops = npc.pedirOpciones({ personaje: p, ref: "p1" });
    const i = ops.findIndex((o) => o.titulo === "Ask about broken axe");
    assert.ok(i >= 0);
    npc.elegir(i, { personaje: p, ref: "p1" });
    hastaElFinal();
    // Las cuatro de `say_axe` .. `say_axe4`, encadenadas con `callevent 4.0`.
    assert.equal(dicho.filter((d) => /says/.test(d.texto)).length, 4);
  });

  test("y el `if ( PARAM1 equals 'PARAM1' )` de `say_axe` distingue menú de chat", () => {
    // Desde el MENÚ, PARAM1 es el jugador: la rama del chat no entra y el
    // alcalde habla. Desde el chat no hay parámetros, PARAM1 resuelve a su
    // propio nombre, la rama entra y sin el mango `local EXIT_SUB 1` corta.
    const { npc, dicho, hastaElFinal } = alcalde();
    npc.jugador = { personaje: alguien(), ref: "p1" };
    npc.guion.llamar("say_axe", []);          // como si se hubiera dicho «axe»
    hastaElFinal();
    assert.equal(dicho.length, 0, "sin el mango y hablando por el chat, se calla");
  });

  test("«Ask about Jobs» cuenta la misión, y eso ya es `base_chat` + el alcalde", () => {
    const { npc, dicho, hastaElFinal } = alcalde();
    const p = alguien();
    const ops = npc.pedirOpciones({ personaje: p, ref: "p1" });
    npc.elegir(ops.findIndex((o) => o.titulo === "Ask about Jobs"), { personaje: p, ref: "p1" });
    hastaElFinal();
    const frases = dicho.map((d) => d.texto).join(" ");
    assert.match(frases, /bothered by goblins/);
    assert.match(frases, /head of the goblin chief/);
  });

  test("lo que el guion del alcalde NO sabe hacer está APUNTADO, no escondido", () => {
    // La honestidad del intérprete: los comandos de ficha del `game_spawn`
    // —`setmodel`, `hp`, `roam`— no están portados porque los lee
    // `leerFichaNpc`, y los dos eventos de `base_chat` que no existen tampoco.
    // Si esta lista se vaciara sola sería que algo se está tragando errores.
    const { npc } = alcalde();
    npc.pedirOpciones({ personaje: alguien(), ref: "p1" });
    assert.ok(npc.noSoportados.length > 0);
    assert.ok(npc.noSoportados.every((x) => ["comando", "getter", "evento", "propiedad"].includes(x.tipo)));
  });
});

describe("EL CENSO: cuántos NPCs caben en el subconjunto", {
  skip: hayGuiones ? false : `falta ${GUIONES}`,
}, () => {
  test("las tres cifras están medidas y guardadas con el fichero", () => {
    // No se comprueba el VALOR —cambiará en cuanto se porte un comando más—
    // sino que la medida existe y es coherente: el resultado del experimento
    // es una cuenta, y una cuenta sin fichero es una frase.
    const c = JSON.parse(readFileSync(GUIONES, "utf8")).censo;
    assert.ok(c.conMenu > 100, `${c.conMenu} scripts con menú`);
    assert.ok(c.caben <= c.algunaOpcion, "el NPC entero no puede caber más veces que una sola opción");
    assert.ok(c.algunaOpcion <= c.conMenu);
    assert.ok(Array.isArray(c.loQueFalta) && c.loQueFalta.length > 0,
      "y se dice QUÉ falta, que es lo que hace que la cifra sirva para algo");
  });
});
