// EL INTÉRPRETE DE GUIONES, el subconjunto que hace falta para UNA misión.
//
// ── Qué es esto y, sobre todo, qué NO es ──────────────────────────────────
//
// El intérprete de Master Sword son **14 000 líneas y 223 comandos**:
//
//     script.cpp      6 242 líneas
//     scriptcmds.cpp  7 705 líneas
//     m_GlobalCmdHash con 223 entradas       scriptcmds.cpp:41 (`Script_Setup`)
//
// Esto no es eso y no pretende serlo. Es **la máquina**  —variables, eventos,
// condicionales, resolución de `$getters`— con **los comandos que las cuatro
// retrollamadas del alcalde de Gate City necesitan y ni uno más**. La lista
// está abajo en `COMANDOS` y en `GETTERS`, y `tools/guiones.mjs` cuenta cuántos
// de los 140 NPCs con menú caben dentro de ella. Esa cuenta es el resultado del
// experimento 33; el código de aquí es sólo lo que hace falta para poder
// contarla.
//
// Lo que no está no se adivina: un comando desconocido **se apunta** en
// `noSoportados` y se sigue, igual que hace el motor
// (`ALERT(at_console, "Command \"%s\" NOT FOUND!")`, script.cpp:5627). Un
// intérprete que se calla lo que no entiende da una misión que parece funcionar.
//
// ── LAS DOS FORMAS DE `if`, QUE NO HACEN LO MISMO ─────────────────────────
//
// Ésta es la regla central del lenguaje y es la que más fácil se porta mal:
//
//     m_GlobalCmdHash["if"]   = ...ScriptCmd_If, true);  //The old if
//     m_GlobalCmdHash["if()"] = ...ScriptCmd_If, true);  //The new if
//                                              scriptcmds.cpp:45-46
//
// Se distinguen **por el paréntesis**, en el análisis:
//
//     if (!strstr(TestCommand, "(") && *CmdLineTmp != '(')
//         KeepCmd = true;                      // -> el VIEJO: un comando normal
//     else { ...m_NewConditional = true;       // -> el NUEVO: con hijos
//            (*pCurrentCmds)->m_SingleCmd = true; }
//                                              script.cpp:5310-5322
//
// Y al ejecutar:
//
//     else if (Cmd.m_Conditional) {
//         if (!Cmd.m_NewConditional)
//             break;  //Old if command.  Breaks event execution on failure
//         ...else...
//     }                                        script.cpp:5754-5758
//
// O sea:
//
//   `if ( A == B )`  NUEVO. Falla -> se saltan sus hijos y **sigue** el evento.
//                    Sus hijos son `{ ... }` si la línea siguiente abre llave
//                    (`CurrentCmds.m_SingleCmd = false`, script.cpp:5225), y si
//                    no **UNA SOLA LÍNEA**.
//   `if A`           VIEJO. Falla -> `break`: **se abandona el resto del bloque
//                    que lo contiene**. No tiene hijos. Es el `return` de este
//                    lenguaje, y por eso los scripts están llenos de
//                    `if !EXIT_SUB`.
//
// Esto CORRIGE lo que el experimento 29 dejó escrito en `tools/menus.mjs`: allí
// se leyó el `if` sin llaves como «guarda sólo la línea siguiente», que es la
// regla del NUEVO, y se aplicó al VIEJO. Con la regla buena, el caso del
// armero —`if $item_exists(...)` y cinco líneas detrás— no registra dos veces
// el título anterior: **abandona el bloque**, y las opciones de detrás tampoco
// se registran. Ver `doc/MISIONES_33.md` §3.
//
// ── Cómo se resuelve un nombre ────────────────────────────────────────────
//
// `CScript::GetVar`, script.cpp:4396, y en este orden exacto:
//
//   1. locales del evento     `if (m.CurrentEvent) pszText = ...GetLocal(pszText)`
//   2. `'entrecomillado'`     literal, no se resuelve                     :4406
//   3. `$getter(a,b)`         con los parámetros resueltos antes          :4418
//   4. `game.*`, `const.*`    constantes del motor
//   5. variables del script, **globales** y constantes    `FindVar`,      :4419
//   6. no está -> **se devuelve el propio nombre**                        :4741
//
// El paso 6 no es un detalle: `if CAN_CHAT isnot 0` con `CAN_CHAT` sin poner
// compara la cadena «CAN_CHAT» con «0», que **no son iguales**, así que da
// cierto. Media docena de scripts dependen de eso.
//
// Y las globales son **estáticas y compartidas por todos los guiones**
// (`::mslist<scriptvar_t> CScript::m_gVariables;`, script.cpp:52): `setvarg` de
// un NPC lo lee otro. Por eso `GLOBALES` de aquí abajo no cuelga de la clase.

// Lo único que importa este archivo, y es de su misma clase: datos puros, sin
// DOM y sin Three, que corren igual en Node y en el navegador. Las listas de
// los guiones son estructura del lenguaje, no del mundo, y por eso van aquí y
// no de gancho del entorno — que es el error que se cometió con `$get_token`
// y que el 45 tuvo que deshacer.
import { Listas, LISTAS_GLOBALES, buscarEnLista, TIPOS_DE_BUSQUEDA, SIN_LISTA, FALTAN_PARAMS } from "./listas.js";

/** `::mslist<scriptvar_t> CScript::m_gVariables` — script.cpp:52. Compartidas. */
export const GLOBALES = new Map();

/**
 * El tope de reencauzamientos de `calleventloop`. **Esto no está en el motor**,
 * y se dice aquí en vez de esconderlo: `MSC_RESET_LOOP` deja escribir un bucle
 * que no termina, y en GoldSrc eso es un servidor colgado que alguien reinicia.
 * En una pestaña del navegador es la pestaña muerta y sin nadie al otro lado,
 * así que hay tope y el guion **lo apunta** en `noSoportados` al llegar.
 */
export const VUELTAS_MAXIMAS = 10000;

/** Vacía las globales. Sólo para las pruebas y para empezar partida. */
export function olvidarGlobales() { GLOBALES.clear(); }

// ── EL ANÁLISIS ─────────────────────────────────────────────────────────────

/**
 * Parte una línea en palabras como hace el motor: por espacios, con las comillas
 * dobles agrupando **hasta la siguiente comilla** y `//` cortando el resto.
 *
 *     while (sscanf(CmdLine, "%s", cBuffer) > 0) {
 *       if (!strncmp(cBuffer, "//", 2)) break;
 *       if (cBuffer[0] == '"') { ...sscanf(CmdLine, "%[^\"]", cBuffer)... }
 *       ScriptCmd.m_Params.add(GetConst(cBuffer));
 *     }                                          script.cpp:5632-5655
 *
 * El `//` sólo corta cuando es **el principio de una palabra**: el motor mira
 * `cBuffer`, que ya viene partido por espacios. `saytext a//b` no se corta.
 */
export function palabras(linea) {
  const fuera = [];
  let i = 0;
  const s = String(linea ?? "");
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    if (s[i] === '"') {
      const fin = s.indexOf('"', i + 1);
      // Sin comilla de cierre el motor avisa y se queda con lo que hay.
      fuera.push(fin < 0 ? s.slice(i + 1) : s.slice(i + 1, fin));
      i = fin < 0 ? s.length : fin + 1;
      continue;
    }
    let j = i;
    while (j < s.length && !/\s/.test(s[j])) j++;
    const p = s.slice(i, j);
    if (p.startsWith("//")) break;
    fuera.push(p);
    i = j;
  }
  return fuera;
}

/** Un comando del árbol. `scriptcmd_t`. */
function cmd(nombre, params, { condicional = false, nueva = false } = {}) {
  return { nombre, params, condicional, nueva, hijos: [], sino: [] };
}

/**
 * Analiza el texto de un `.script` y devuelve sus eventos.
 *
 * `#include` NO se resuelve aquí porque esto no toca el disco: devuelve la
 * lista en `includes` y quien cargue decide. Lo hace `tools/guiones.mjs` en la
 * construcción, y `RunScriptEventByName` los ejecuta **todos**, no el primero
 * (script.cpp:5836: «Run every event with this name»).
 *
 * ── EL ORDEN, QUE ES POSICIONAL Y NO «LOS INCLUDE PRIMERO» (el 66) ──────────
 *
 * Aquí decía «los eventos del `#include` van ANTES», y eso sólo es verdad
 * cuando el `#include` está en la primera línea. El motor lo resuelve **en el
 * sitio en que aparece**, dentro del propio analizador de líneas:
 *
 *     else if (!_stricmp(TestCommand, "#include")) {
 *       ...
 *       bool fSucces = Spawn(FileName, m.pScriptedEnt, ...);
 *                                            script.cpp:5229, 5255
 *
 * `Spawn` de la plantilla corre ahí mismo, así que lo que el archivo escribió
 * ANTES del `#include` ya está dentro. Y eso decide partidas, porque `const`
 * **gana el primero**:
 *
 *     for (int i = 0; i < m_Constants.size(); i++)
 *       if (m_Constants[i].Name == VarName) { AddConst = false; break; }
 *                                            script.cpp:5419-5433
 *
 * Un objeto de Master Sword está escrito justo para aprovecharlo: sus números
 * en un bloque, LUEGO el `#include` que dice qué es. Subir los `#include` al
 * principio le da a cada objeto los números de su plantilla — medido, **416
 * choques de `const` en los 300 primeros objetos**, con la Rusty Short Sword
 * pegando lo que diga `swords_base_onehanded`.
 *
 * Por eso además de `includes` —que se queda, que hay quien sólo quiere la
 * lista— se devuelve `piezas`: el archivo en orden, con sus eventos y sus
 * `#include` intercalados donde estaban. `cargarGuion` la recorre.
 */
export function partirGuion(texto) {
  const eventos = [];
  const includes = [];
  /**
   * El archivo EN ORDEN: `{evento}` o `{include}`, para poder resolver los
   * `#include` en su sitio. Ver el bloque de arriba.
   */
  const piezas = [];
  /** `setvar`/`const` fuera de evento: el motor los evalúa al cargar. */
  const preload = [];
  const lineas = String(texto ?? "").split(/\r?\n/);

  let evento = null;
  /** La pila de listas de comandos donde va cayendo lo que se lee. */
  let pila = [];
  let actual = null;
  /** Igual que `m_SingleCmd`: la lista se cierra tras UN comando. */
  let unaSola = false;

  const cerrarSiEsDeUna = () => {
    // `DontKeepCommand:` — script.cpp:5661-5669.
    while (unaSola && pila.length) {
      const v = pila.pop();
      actual = v.lista; unaSola = v.unaSola;
    }
  };

  /**
   * Una línea. Es `CScript::ParseLine`, y como ella **se llama a sí misma**
   * para lo que quede detrás de un `if ( ... )` o de un `else`:
   *
   *     if (ParseLine(ParamStr, LineNum, pCurrentEvent, pCurrentCmds, ParentCmds) == 2)
   *                                          script.cpp:5342
   *
   * Sin esa recursión, `else if( l.say == 2 ) local reg.mitem.data 'Hi'` —que
   * es como están escritos veintitantos NPCs— se lee como un comando llamado
   * «if(», y el `else if` deja de existir.
   */
  const procesar = (cruda, n) => {
    const ps = palabras(cruda);
    if (!ps.length) return;
    const cabeza = ps[0];

    if (cabeza.startsWith("{")) {
      // `{`, `{ game_spawn`, `{game_spawn` y `{ [server] zombie_died` son la
      // misma línea escrita de cuatro formas: se normaliza a «lo que hay
      // detrás de la llave».
      const tras = [cabeza.slice(1), ...ps.slice(1)].filter(Boolean);
      if (evento) {
        // `{` detrás de un `if ( ... )`: sus hijos dejan de ser uno solo.
        //   CurrentCmds.m_SingleCmd = false;          script.cpp:5225
        unaSola = false;
        return;
      }
      let ambito = "shared";
      let nombre = tras[0] ?? "";
      if (/^\[/.test(nombre)) { ambito = nombre.replace(/[[\]]/g, ""); nombre = tras[1] ?? ""; }
      // Sin nombre es el bloque de constantes de la cabecera del script.
      evento = { nombre, ambito, cmds: [], linea: n + 1, ...(nombre ? {} : { cabecera: true }) };
      eventos.push(evento);
      piezas.push({ evento });
      actual = evento.cmds; pila = []; unaSola = false;
      return;
    }

    if (cabeza === "}") {
      if (pila.length) { const v = pila.pop(); actual = v.lista; unaSola = v.unaSola; cerrarSiEsDeUna(); }
      else { evento = null; actual = null; }
      return;
    }

    if (!evento) {
      if (cabeza.toLowerCase() === "#include") {
        // `#include [server] monsters/base_chat` — el ámbito va delante.
        const resto = ps.slice(1).filter((p) => !/^\[/.test(p));
        if (resto[0]) { includes.push(resto[0]); piezas.push({ include: resto[0], linea: n + 1 }); }
      }
      // `#scope`, `#include` y poco más. Fuera de un bloque no hay comandos:
      // el motor avisa («Missing {», script.cpp:5279) y sigue.
      return;
    }

    // ── dentro de un evento ─────────────────────────────────────────────
    const nombreCmd = cabeza.toLowerCase();

    /**
     * **`eventname <nombre>`: LA FORMA LARGA DE NOMBRAR UN BLOQUE** — el 81.
     *
     *     else if (!_stricmp(TestCommand, "eventname"))
     *     {
     *         sscanf(CmdLineTmp, "%s", cBuffer);
     *         CurrentEvent->Name = cBuffer;
     *         CurrentEvent->fNextExecutionTime = -1;
     *         CurrentEvent->fRepeatDelay = -1;
     *     }
     *                                              script.cpp:5370-5376
     *
     * Este analizador conocía sólo la forma corta —`{ say_hi`— y **la larga no
     * estaba**. En los 2 884 guiones hay **570 `eventname` en 202 ficheros** y
     * ni uno estaba puesto: los 570 bloques se quedaban sin nombre.
     *
     * Y un bloque sin nombre no es un bloque inerte: **se ejecuta entero al
     * nacer el NPC** (el 60, `GuionDeNpc`). Así que lo que de verdad pasaba es
     * que Sylphiel corría su `say_reward3` en el primer fotograma de la
     * partida y **te regalaba el oro de una misión que no habías empezado**;
     * su `cider_1` valía 99 antes de que entraras en la taberna. Los 25
     * guiones de Gate City usan la forma corta, los 25, y por eso esto
     * sobrevivió 81 experimentos: el caso único del 50, duodécima vez que el
     * hueco lo enseña un mapa que no es el primero.
     *
     * `KeepCmd` se queda en `false` —a diferencia de `repeatdelay`, tres
     * líneas más abajo en el motor, que sí lo pone—, así que el comando **no
     * entra en la lista**. Por eso aparecía como no soportado 570 veces.
     */
    if (nombreCmd === "eventname" && ps[1]) {
      // El motor hace `sscanf("%s")`: la primera palabra y nada más. No
      // normaliza la caja, igual que la forma corta de aquí arriba.
      evento.nombre = String(ps[1]);
      delete evento.cabecera;
      return;
    }

    if (nombreCmd === "if" || nombreCmd.startsWith("if(")) {
      // La distinción del motor, tal cual: paréntesis en el comando o primer
      // carácter del resto de la línea. script.cpp:5312.
      const trasIf = cruda.trim().slice(cruda.trim().indexOf(cabeza) + cabeza.length).trim();
      const nuevo = cabeza.includes("(") || trasIf.startsWith("(");
      if (!nuevo) {
        // EL VIEJO. Un comando normal, condicional, SIN hijos.
        actual.push(cmd("if", ps.slice(1), { condicional: true, nueva: false }));
        cerrarSiEsDeUna();
        return;
      }
      // EL NUEVO. Se leen tres parámetros de dentro del paréntesis.
      const desde = cruda.indexOf("(", cruda.indexOf(cabeza));
      const dentro = cruda.slice(desde).trim();
      // El paréntesis que CIERRA, no el primero que aparece: dentro puede
      // haber un getter con los suyos —`if ( $item_exists(P1,item_x) )`— y
      // cortar por el primero deja la condición partida por la mitad.
      //
      // El motor no cuenta paréntesis: lee tres palabras y mira si la
      // siguiente empieza por `)` (script.cpp:5321-5328). Le sale bien porque
      // `$item_exists(a,b)` no lleva espacios dentro y cae entera como una
      // palabra. Contar es lo mismo para todo lo que escriben los scripts y no
      // se rompe con un espacio de más, que es la razón de hacerlo aquí así.
      let cierre = -1, prof = 0;
      for (let k = 0; k < dentro.length; k++) {
        if (dentro[k] === "(") prof++;
        else if (dentro[k] === ")") { prof--; if (!prof) { cierre = k; break; } }
      }
      const args = palabras(cierre < 0 ? dentro.slice(1) : dentro.slice(1, cierre)).slice(0, 3);
      const c = cmd("if()", args, { condicional: true, nueva: true });
      actual.push(c);
      pila.push({ lista: actual, unaSola });
      actual = c.hijos;
      unaSola = true;
      // Lo que venga DETRÁS del `)` en la misma línea es el hijo único, y se
      // vuelve a analizar entero: puede ser otro `if ( ... )`.
      if (cierre >= 0) procesar(dentro.slice(cierre + 1), n);
      return;
    }

    if (nombreCmd === "else") {
      // `else` cuelga del ÚLTIMO condicional de la lista. script.cpp:5349-5356.
      const padre = actual[actual.length - 1];
      if (!padre?.condicional) return;
      const rama = [];
      padre.sino.push(rama);
      pila.push({ lista: actual, unaSola });
      actual = rama;
      unaSola = true;
      procesar(cruda.trim().slice(cruda.trim().indexOf(cabeza) + cabeza.length), n);
      return;
    }

    // `setvar`/`const` fuera de evento el motor los evalúa al cargar; dentro
    // del bloque de cabecera son lo mismo. `setvard` NO se evalúa al cargar
    // (`strncpy(TestCommand, "setvar", 128); KeepCmd = true;`, script.cpp:5448).
    if (evento.cabecera && (nombreCmd === "const" || nombreCmd === "setvar")) {
      const entrada = { tipo: nombreCmd, nombre: ps[1], valor: ps.slice(2).join(" ") };
      preload.push(entrada);
      // Y en `piezas`, para que quien resuelva los `#include` sepa si este
      // `const` va delante o detrás de la plantilla. Con `const` ganando el
      // primero (script.cpp:5419-5433), eso ES el valor.
      piezas.push({ preload: entrada });
    }

    actual.push(cmd(nombreCmd, ps.slice(1)));
    cerrarSiEsDeUna();
  };

  for (let n = 0; n < lineas.length; n++) procesar(lineas[n], n);

  return { eventos, includes, preload, piezas };
}

// ── LA MÁQUINA ──────────────────────────────────────────────────────────────

/** `atof`: lo que C lee de una cadena, o 0. */
export const numDe = (s) => {
  const m = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(String(s ?? "").trim());
  return m ? parseFloat(m[0]) : 0;
};
/** `atoi`. */
export const enteroDe = (s) => {
  const m = /^[+-]?\d+/.exec(String(s ?? "").trim());
  return m ? parseInt(m[0], 10) : 0;
};

/**
 * `TokenizeString(cadena, Tokens, ";")` — stackstring.cpp:143-161.
 *
 * **NO es `split(";")`**, y la diferencia se ve en cuanto hay un hueco. El
 * motor da vueltas a un `sscanf(&pszString[i], "%[^;]", cTemp)`, y `%[^;]`
 * sobre un punto y coma **no casa nada**: `sscanf` devuelve 0 y el bucle
 * **para**. O sea:
 *
 *     "a;b;c"  -> [a, b, c]     igual que `split`
 *     "a;;b"   -> [a]           `split` diría [a, "", b]: el hueco CORTA la lista
 *     ";a"     -> []            `split` diría ["", a]
 *     ""       -> []
 *
 * Esto estaba portado como `split(";")` desde el 33 y nadie lo había medido.
 * En Gate City no cambia nada —ninguna de sus listas lleva huecos—, pero
 * `$get_token(L,2)` sobre «a;;b» devolvía «b» donde el juego devuelve «0».
 */
export function partirTokens(texto) {
  const s = String(texto ?? "");
  const fuera = [];
  let i = 0;
  while (i < s.length) {
    let j = i;
    while (j < s.length && s[j] !== ";") j++;
    if (j === i) break;              // `sscanf` no casó nada: se acabó
    fuera.push(s.slice(i, j));
    i = j < s.length ? j + 1 : j;    // «Hit a semi-colon, continue»
  }
  return fuera;
}

/**
 * Los comandos portados. La clave es el nombre del script; el valor, qué hace.
 *
 * **Esta lista ES el experimento.** Cada uno con su cita, y lo que no está no
 * está: `tools/guiones.mjs` mide los 140 NPCs contra ella.
 */
export const COMANDOS = new Set([
  // `script.cpp` / `scriptcmds.cpp`, comandos del lenguaje
  "if", "if()", "else",
  "setvar", "setvard", "setvarg", "local",        // scriptcmds.cpp:120-122, script.cpp:5448
  "const",                                        // script.cpp:5401
  "add", "subtract",                              // scriptcmds.cpp:101-102 (ScriptCmd_MathSet)
  "callevent", "calleventtimed", "callexternal",  // scriptcmds.cpp:93-95
  "quest",                                        // scriptcmds.cpp:171
  "infomsg",                                      // scriptcmds.cpp:166
  // El 83. `exit` NO existe en el motor y lo quitamos: `m_GlobalCmdHash` tiene
  // `exitevent` (scriptcmds.cpp:48) y `return`/`returndata` (:167), y en los
  // 2 884 guiones hay cero `exit` sueltos. El que corta un evento es
  // `exitevent`, y era el que faltaba. Ver el `case` para las tres patas.
  "return", "returndata", "exitevent",            // scriptcmds.cpp:167 y :48
  "dbg",                                          // no hace nada fuera del build de desarrollo
  // `npcscript.cpp`, comandos del NPC
  "saytext",                                      // npcscript.cpp:52 / :708
  "offer",                                        // npcscript.cpp:50 / :636
  "playanim",                                     // npcscript.cpp:88 / :1487
  "menuitem.register",                            // npcscript.cpp:83 / :940
  // ── el experimento 43: los ocho que más piden los NPC de Gate City ──────
  //
  // Se eligieron midiendo, no a ojo. De los 6 NPC de Gate City que tienen
  // menú, cinco necesitan `say`, `stradd`, `playsound` y `$randf`, y cuatro
  // necesitan `setprop`, `roam`, `setmovedest` y `setmoveanim`. Ninguno cabía
  // entero sin ellos. El recuento lo imprime `npm run guiones`.
  "stradd",                                       // scriptcmds.cpp:110 / :6787
  "playsound",                                    // scriptcmds.cpp:149
  "setprop",                                      // scriptcmds.cpp:118 / :6178
  "say",                                          // npcscript.cpp:24 / :109
  "roam",                                         // npcscript.cpp:45 / :340
  "setmovedest",                                  // npcscript.cpp:59 / :1600
  "setmoveanim",                                  // npcscript.cpp:57 / :1471
  // ── el 44: las tiendas. `src/play/tienda.js` ────────────────────────────
  "npcstore.create", "createstore",               // npcscript.cpp:63 / :739
  "npcstore.additem", "addstoreitem",             // npcscript.cpp:64 / :755
  "npcstore.offer", "offerstore",                 // npcscript.cpp:65 / :829
  "npcstore.remove",                              // npcscript.cpp:66 / :900
  // ── el 45: los tres que le faltaban al alcalde ──────────────────────────
  // `remove_spawns_loop` del alcalde es literalmente estos tres y `$get_token`,
  // y es lo que apaga los generadores de zombis al terminar su segunda misión.
  "deleteent", "deleteme",                        // scriptcmds.cpp:138-139 / :2872
  // ── el 46: el andamiaje de menú ─────────────────────────────────────────
  //
  // Éstos NO se eligieron por frecuencia suelta sino porque **sólo sirven
  // juntos**: la lección del 44, donde siete comandos buenos movieron el censo
  // cero porque lo que bloqueaba estaba en otro sitio. Los tres NPC que le
  // quedan a Gate City piden este bloque entero o ninguno.
  "calleventloop",                                // scriptcmds.cpp:96  / :2250
  "multiply", "divide", "mod", "dec", "decvar",   // scriptcmds.cpp:101-107 (ScriptCmd_MathSet)
  "capvar",                                       // scriptcmds.cpp:104 / :2333
  // Las listas. Cada una con su gemela global, que es el mismo comando con
  // `g_` delante (scriptcmds.cpp:1963).
  "array.create", "array.add", "array.add_unique", "array.set",
  "array.del", "array.erase", "array.clear", "array.copy",
  "g_array.create", "g_array.add", "g_array.add_unique", "g_array.set",
  "g_array.del", "g_array.erase", "g_array.clear", "g_array.copy",
  // El menú y la charla.
  "menuitem.remove",                              // npcscript.cpp:84 / :1003
  "menu.open",                                    // npcscript.cpp:85 / :1019
  "catchspeech",                                  // npcscript.cpp:51 / :693
  "helptip",                                      // scriptcmds.cpp:170
  // El 64, los tres del guion DEL JUGADOR. `repeatdelay` no es un comando
  // normal: ver `armarRepeticiones` más abajo.
  "repeatdelay",                                  // scriptcmds.cpp:127 / script.cpp:5377
  "givehp", "givemp",                             // scriptcmds.cpp:157-158
  // Los seis mensajes de colores son UNA función (`ScriptCmd_Message`,
  // scriptcmds.cpp:4243), y lo único que los separa es el nombre.
  "playermessage", "rplayermessage", "gplayermessage",
  "bplayermessage", "yplayermessage", "dplayermessage", "consolemsg",
  "playrandomsound",                              // scriptcmds.cpp:148 (= `playsound`)
  // ── el 67: el guion dispara el MAPA ────────────────────────────────────
  //
  // Es el único comando del lenguaje que cruza del lado de los guiones al de
  // las entidades del `.bsp`, y sin él media Edana no arranca. Ver `usetrigger`
  // más abajo.
  "usetrigger",                                   // scriptcmds.cpp:113 / :7054
]);

/** Los `$getters` portados. `m_GlobalGetterHash`, script.cpp:41-170. */
export const GETTERS = new Set([
  "$item_exists",     // script.cpp:87
  "$get_quest_data",  // script.cpp:112
  "$int",             // script.cpp:123
  "$rand",            // script.cpp:135
  "$get",             // script.cpp:70  — sólo un puñado de propiedades, ver `PROPIEDADES`
  "$dist",            // script.cpp:131
  // El 81. Faltaba, y es la primera línea de media docena de bloques de
  // Edana: con el `if` VIEJO, un getter sin soporte abandona el BLOQUE y no
  // la línea, así que la misión de la sidra no podía ni empezar.
  "$cansee",          // npcscript.cpp:1754-1850
  "$get_token",       // script.cpp:93
  // ── EL 83: los dos del bono de los 10 000 ──────────────────────────────
  // Sin ellos la guarda que impide que Edana dé el bono del gauntlet no podía
  // cumplirse: un getter sin soporte devuelve su propio nombre —que es lo
  // correcto, script.cpp:4741— y «$get_find_token(…)» no es «-1», así que el
  // `exitevent` de detrás no se ejecutaba y el mensaje salía.
  "$get_find_token",  // script.cpp:143 / :1725-1760 — ojo: devuelve el ÚLTIMO
  "$lcase",           // script.cpp:63  / :3159-3176
  "$randf",           // script.cpp:136 — el MISMO getter que `$rand`, ver abajo
  "$get_token_amt",   // script.cpp:146 — y ojo: en una cadena sin poner devuelve 1
  "$get_by_name",     // script.cpp:80  — devuelve un ASA «PentP(i,d)», no un nombre
  // ── el 46: los cuatro de las listas, y sus cuatro gemelos globales ──────
  // Los ocho son EL MISMO getter (`ScriptGetter_GetArray`, script.cpp:129-141)
  // y se distinguen por cómo TERMINA el nombre. Ver `src/play/listas.js`.
  "$get_array", "$get_arrayfind", "$get_array_amt", "$get_array_exists",
  "$g_get_array", "$g_get_arrayfind", "$g_get_array_amt", "$g_get_array_exists",
]);

/** Las propiedades de `$get(<ent>,<prop>)` que este puerto sabe contestar. */
export const PROPIEDADES = new Set([
  "isplayer", "id", "exists", "isalive", "alive", "origin", "name",
  // El 46. `CBaseEntity::GetProp`, scriptcmds.cpp:940-1690.
  "hp",                                   // :960
  "maxhp",                                // :1391 — y ver abajo: SÓLO monstruos
  "dist", "dist2D", "range", "range2D",   // :1146
  "gold",                                 // :1263
  "steamid",                              // :1232
]);

/**
 * PROPIEDADES QUE EL PROPIO MOTOR CONTESTA CON «0», y que por tanto **están
 * portadas en cuanto devolvemos «0»**.
 *
 * Esto no es una lista de excusas: es la diferencia entre «no lo sabemos
 * hacer» y «el juego tampoco lo hace», y sin separarlas el censo cuenta como
 * hueco algo que está bien.
 *
 * `GetProp` termina en `return fSuccess ? "1" : "0"` (scriptcmds.cpp:1688) y
 * `fSuccess` sólo lo enciende un puñado de ramas. Un nombre que no case con
 * ninguna y cuya entidad tenga guion —o sea, cualquier jugador— cae ahí y
 * sale «0»; sólo cuando la entidad **no** tiene guion se llega al
 * `return "¯NA¯"` de :1686 (`RETURN_NOTHING_STR`, iscript.h:261).
 *
 *   - `strength`: **no existe en todo el código del mod.** Y sin embargo
 *     `base_npc_vendor_confirm.script:87` hace `if ( $get(PARAM1,strength) <
 *     10 )`, que por tanto es **siempre cierto**. El vendedor te trata como si
 *     fueras un alfeñique valgas lo que valgas, y así es como se juega hoy.
 */
export const PROPIEDADES_VACIAS = new Set(["strength"]);

/**
 * Un guion cargado y corriendo: las variables de UN NPC y sus eventos.
 *
 * `entorno` es el juego, y va inyectado porque este módulo **no importa nada**:
 * corre igual en Node —donde lo prueban `test/juego_misiones.test.mjs`— y en el
 * navegador, que es la regla de `src/play/` desde el 28.
 */
export class Guion {
  /**
   * @param eventos   lo que devuelve `partirGuion`, con los `#include` ya delante.
   * @param entorno   los ganchos al juego. Ver `entornoVacio()`.
   * @param preload   los `setvar`/`const` de la cabecera.
   */
  constructor({ eventos = [], entorno = null, preload = [], nombre = "", ahora = () => 0, mapa = null } = {}) {
    /** `gpGlobals->time`. Lo pone quien tenga reloj; sin él, cero. */
    this.ahora = ahora;
    /**
     * `MSGlobals::MapName`, lo que contesta `game.map.name` (script.cpp:4612).
     * El 83. Va inyectado y no leído de ningún sitio por la regla de
     * `src/play/`: este módulo no importa nada y corre igual en Node. Quien no
     * lo ponga se queda con el comportamiento de antes.
     */
    this.mapa = mapa;
    this.nombre = nombre;
    this.eventos = eventos;
    this.entorno = entorno ?? entornoVacio();
    /** `m_Variables`: las del script. */
    this.vars = new Map();
    /** `m_Constants`. Gana el PRIMERO, no el último (script.cpp:5418-5432). */
    this.constantes = new Map();
    /** Lo que se ha encontrado y no se sabe hacer. El resultado del experimento. */
    this.noSoportados = [];
    /** El rastro de lo ejecutado, para las pruebas y para la sonda. */
    this.rastro = [];
    /** Los eventos con `repeatdelay` y su reloj. Ver `armarRepeticiones`. */
    this.repeticiones = [];
    /** `m.m_Iteration`: la vuelta de `calleventloop`, que empieza en 0. script.h:73. */
    this.iteracion = 0;
    /** Las listas de ESTA entidad: `pEnt->scriptedArrays`. Ver `listas.js`. */
    this.listas = new Listas();
    /** `GlobalScriptArrays`, el mapa estático. Compartido, como `GLOBALES`. */
    this.listasGlobales = new Listas(LISTAS_GLOBALES);

    for (const p of preload) {
      if (p.tipo === "const") { if (!this.constantes.has(p.nombre)) this.constantes.set(p.nombre, p.valor); }
      else this.vars.set(p.nombre, p.valor);
    }
  }

  /** `CScript::FindVar` — script.cpp:419. Script, luego GLOBALES, luego constantes. */
  buscarVar(nombre) {
    if (this.vars.has(nombre)) return { donde: this.vars, valor: this.vars.get(nombre) };
    if (GLOBALES.has(nombre)) return { donde: GLOBALES, valor: GLOBALES.get(nombre) };
    if (this.constantes.has(nombre)) return { donde: this.constantes, valor: this.constantes.get(nombre) };
    return null;
  }

  /** `CScript::VarExists` — script.cpp:438: «existe» es «resolver no me devuelve mi propio nombre». */
  existeVar(nombre, ev) { return this.resolver(nombre, ev) !== nombre; }

  /**
   * `SetVar(VarName, VarValue, Event)`. scriptcmds.cpp:6581 / script.cpp:4771.
   *
   * Si hay una LOCAL con ese nombre se pisa la local; si no, la del NPC. Es lo
   * mismo que hace `setvar`, sacado aparte porque `stradd` escribe por aquí.
   */
  ponerVar(nombre, valor, ev) {
    if (ev?.locales?.has(nombre)) ev.locales.set(nombre, valor);
    else this.vars.set(nombre, valor);
  }

  /**
   * `CScript::GetVar` — script.cpp:4396. El orden está en la cabecera de este
   * archivo y **no se puede cambiar sin cambiar el juego**.
   */
  resolver(texto, ev = null) {
    const t = String(texto ?? "");
    // 1. locales del evento. `if (m.CurrentEvent) pszText = ...GetLocal(...)`.
    if (ev?.locales?.has(t)) return ev.locales.get(t);
    // 2. literal entre comillas simples, que NO se resuelve.
    if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1);
    // 3. getter.
    if (t.startsWith("$")) return this.getter(t, ev);
    // 4. las constantes del motor. De momento sólo la que hace falta: la vuelta
    //    del bucle, que se lee `game.script.iteration` y **empieza en 0**
    //    (script.cpp:4673). Las demás `game.*` caen a variable, y como no
    //    existen devuelven su propio nombre, que es lo que hace el motor.
    if (t === "game.script.iteration") return String(this.iteracion);
    // EL 65: `game.time`, que es `gpGlobals->time` — el reloj del servidor en
    // segundos (script.cpp:4500-4503). Hacía falta para el guion del jugador:
    // el hundimiento de la vista al aterrizar se mide contra él
    // (`setvard GROUNDBOB_STARTTIME game.time`), y sin resolverlo la variable
    // guardaba la CADENA «game.time», que vale 0, y el `if` de después no se
    // cumplía nunca. El mecanismo entero estaba escrito y no arrancaba.
    //
    // Quien no inyecte reloj se queda como antes —`ahora` a cero—, que es lo
    // que hacen las pruebas de los NPC y el motor cuando el mapa acaba de
    // cargar.
    // ── EL 67: `game.serverside` Y `game.clientside` ──────────────────────
    //
    //     else if (Name == "clientside")  fSuccess = !IsServer;
    //     else if (Name == "serverside")  fSuccess = IsServer;
    //                                            script.cpp:4660-4661
    //
    // **ESTE PUERTO ES EL LADO SERVIDOR.** Lo que está portado del lenguaje es
    // la mitad `#ifdef VALVE_DLL` —`usetrigger` es literalmente eso—, los NPC
    // piensan aquí y el anfitrión de Node es la autoridad desde el 27. Que el
    // navegador también dibuje no lo convierte en el cliente del mod: el
    // cliente de MSR corre su propia copia del intérprete, y esa no está.
    //
    // ── Y NO ES COSMÉTICO, PORQUE CASI SIEMPRE ES UN `if` VIEJO ───────────
    //
    // Sin resolver, `game.serverside` devolvía **su propio nombre** —que es lo
    // correcto para una variable que no existe (script.cpp:4741)— y
    // `atoi("game.serverside")` es 0. Con el `if` VIEJO eso no salta una línea:
    // **abandona el bloque entero** (script.cpp:5754-5758). Medido sobre los
    // 2 884 scripts:
    //
    //     280   `if game.serverside`     sin paréntesis -> abandonaban el evento
    //      16   `if game.clientside`     idem
    //      68   con paréntesis           ésos sólo se saltaban sus hijos
    //
    // El caso que lo destapó: `game_player_putinworld` del jugador tiene
    // `if game.serverside` en el comando **3 de 20**, y el
    // `callevent 1.0 activate_stuff` está en el 17. O sea que el evento con el
    // que un mapa de Master Sword se enciende moría en la tercera línea, sin un
    // error, en todas las partidas de este puerto.
    if (t === "game.serverside") return "1";
    if (t === "game.clientside") return "0";
    if (t === "game.time") return String(this.ahora());
    // ── EL 83: `game.map.name`, que son 265 usos en los 2 884 guiones ──────
    //
    //     else if (Name.starts_with("map."))
    //       if (Prop == "name") return MSGlobals::MapName;   script.cpp:4608-4612
    //
    // Hasta hoy se resolvía a la cadena «game.map.name», o sea que **todo
    // bloque del juego que compare el mapa contra algo estaba comparando
    // contra eso**. El que lo destapó: la guarda del bono de los 10 000 del
    // guion del jugador, que en Edana tiene que cortar y no cortaba.
    //
    // Quien no inyecte mapa se queda como antes —su propio nombre, que es lo
    // que hace el motor con una variable que no existe (script.cpp:4741)—, y
    // no como la cadena vacía: un mapa sin nombre no es «ningún mapa», y
    // confundirlos convertiría un `equals` falso en uno verdadero.
    if (t === "game.map.name") return this.mapa?.() ?? t;
    // 5. variables.
    const v = this.buscarVar(t);
    if (v) return v.valor;
    // 6. no está: se devuelve el propio nombre. script.cpp:4741.
    return t;
  }

  /** `$nombre(a,b)`: se parte, se resuelve cada parámetro y se llama. script.cpp:4418-4421. */
  getter(texto, ev) {
    const m = /^(\$[A-Za-z_][\w.]*)\((.*)\)\s*$/s.exec(texto);
    if (!m) {
      // `$algo` sin paréntesis no es un getter: cae a variable.
      const v = this.buscarVar(texto);
      return v ? v.valor : texto;
    }
    const [, nombre, dentro] = m;
    const args = partirArgumentos(dentro).map((a) => this.resolver(a, ev));
    if (!GETTERS.has(nombre)) {
      this.anotarNoSoportado("getter", nombre);
      // El motor devuelve el texto entero cuando no encuentra el getter
      // (script.cpp:4741), y eso es lo que hace que una condición rota dé
      // CIERTO en vez de fallar. Se porta así, que es lo que se ve jugando.
      return texto;
    }
    return String(this.llamarGetter(nombre, args, ev, texto) ?? "0");
  }

  llamarGetter(nombre, a, ev, texto = "") {
    const e = this.entorno;
    switch (nombre) {
      // script.cpp:3097 — devuelve "1"/"0". Sin jugador, "0".
      case "$item_exists": return e.llevaObjeto(a[0], a[1], a[2] ?? "0") ? "1" : "0";
      // script.cpp:2175 — y **"0" cuando la misión no está puesta**, no vacío.
      case "$get_quest_data": return e.leerMision(a[0], a[1]) ?? "0";
      case "$int": return String(enteroDe(a[0]));                       // script.cpp:3075
      case "$rand": return String(e.azar(enteroDe(a[0]), enteroDe(a[1]))); // script.cpp:3547
      // `$randf`: el MISMO getter, y lo que los separa es **una letra en la
      // posición 5 del nombre**: `if (ParserName.c_str()[5] == 'f')`
      // (script.cpp:3551). Con la efe devuelve `RANDOM_FLOAT`, sin ella
      // `RANDOM_LONG`. Se pide el flotante al entorno por su propia puerta
      // para que el dado siga siendo inyectable: con `Math.random` suelto, dos
      // jugadores verían cosas distintas — el fallo del 28.
      case "$randf": return String(e.azarFlotante(numDe(a[0]), numDe(a[1]))); // script.cpp:3552
      case "$dist": return String(e.distancia(a[0], a[1]));             // script.cpp:131
      // El 81. El entorno que no lo tenga se comporta como antes: el getter
      // cae en «no soportado» y el `if` viejo abandona el bloque.
      case "$cansee": return e.ve ? String(e.ve(a[0], a[1])) : null;    // npcscript.cpp:1754

      // `$get_token(<lista>,<n>)` — script.cpp:2628-2649.
      //
      // Dos cosas que no se adivinan, y las dos salieron de leerlo al lado de
      // `$get_token_amt`:
      //
      //   1. **Resuelve el primer parámetro OTRA VEZ.** `msstring TokenString =
      //      GetVar(Params[0])` (:2643), y `Params[0]` ya venía resuelto de
      //      script.cpp:4418. Con `$get_token(LISTA,0)` donde LISTA vale
      //      «FOO;BAR» y además existe una variable llamada «FOO;BAR», gana la
      //      variable. `$get_token_amt` NO hace esa segunda vuelta (:2665), así
      //      que los dos getters hermanos no ven lo mismo.
      //   2. Fuera de rango devuelve **«0»**, no vacío (:2650).
      case "$get_token": {
        const t = partirTokens(this.resolver(String(a[0]), ev));
        const i = enteroDe(a[1]);
        return i >= 0 && i < t.length ? t[i] : "0";
      }

      // `$get_token_amt(<lista>)` — script.cpp:2655-2670. Lo que dice su propio
      // comentario: «this will return 1 on an uninitialized string, as the
      // string itself is taken to be a token». Una variable sin poner resuelve
      // a su propio nombre, que es un token, así que el bucle del alcalde
      // —`if RSPAWN_COUNT < L_NSPAWNS` con `L_NSPAWNS` de una lista vacía— se
      // comporta como si hubiera exactamente uno.
      case "$get_token_amt": return String(partirTokens(String(a[0])).length);

      // ── EL 83 ────────────────────────────────────────────────────────────
      //
      // `$get_find_token(<lista>,<qué>[,<lo que sea>])` — script.cpp:1725-1760.
      // Devuelve el índice, o -1. Cuatro cosas que no se adivinan:
      //
      //   1. **Devuelve el ÚLTIMO, no el primero.** El bucle no lleva `break`
      //      (:1751-1754), así que `iFoundAtPos` se sobrescribe. Su propio
      //      comentario dice «returns idx of found string», que se lee al
      //      revés.
      //   2. **Resuelve el primer parámetro otra vez** —`GetVar(Params[0])`,
      //      :1740— igual que `$get_token`; el segundo se usa tal cual
      //      (`msstring& TokenAdd = Params[1]`, :1747).
      //   3. **Con un tercer parámetro, el que sea, la búsqueda pasa a ser
      //      PARCIAL**: `if (Params.size() >= 3) bPartialSearch = true` (:1745)
      //      y entonces compara con `contains` (:1753). No mira su valor.
      //   4. Con menos de dos parámetros devuelve «-1» (:1759), no vacío.
      case "$get_find_token": {
        if (a.length < 2) return "-1";
        const t = partirTokens(this.resolver(String(a[0]), ev));
        const que = String(a[1]);
        const parcial = a.length >= 3;
        let donde = -1;
        for (let i = 0; i < t.length; i++) {
          if (parcial ? t[i].includes(que) : t[i] === que) donde = i;   // sin `break`: :1751
        }
        return String(donde);
      }

      // `$lcase(<var|cadena>)` — script.cpp:3159-3176. `_strlwr` sobre un
      // buffer de 256, y sin parámetros devuelve «0», no vacío.
      case "$lcase": return a.length >= 1 ? String(a[0]).toLowerCase() : "0";

      // `$get_by_name(<nombre>)` — script.cpp:1436-1458.
      //
      // Devuelve un ASA, `PentP(idx,dir)` (`EntToString`, sharedutil.cpp:81), y
      // no un nombre ni un índice: quien la recibe la vuelve a convertir con
      // `RetrieveEntity`. Ver `src/play/entidades.js`.
      //
      // Y el segundo parámetro **existe en la documentación y no en el código**:
      // la cabecera dice `$get_by_name(<name>,<property>)` y hasta recomienda
      // «$get_by_name(<name>,id)», pero la función no lee `Params[1]` ni una
      // vez. Se porta ignorándolo, que es lo que hace el juego.
      case "$get_by_name": return e.porNombre(String(a[0])) || "0";

      case "$get": {
        const prop = String(a[1]);
        // El motor contesta «0» a éstas, así que contestarlo es portarlas.
        if (PROPIEDADES_VACIAS.has(prop)) return "0";
        // `skill.<escuela>.<sub>` no es un nombre fijo: es una FAMILIA, y el
        // motor la reconoce por el prefijo (`Prop.starts_with("skill.")`,
        // scriptcmds.cpp:1651). Es lo que gradúa casi todo efecto de objeto.
        if (!prop.startsWith("skill.") && !PROPIEDADES.has(prop)) {
          this.anotarNoSoportado("propiedad", `$get(,${prop})`);
          return "0";
        }
        return String(e.propiedad(a[0], prop, a.slice(2)) ?? "0");
      }

      // ── LAS LISTAS ───────────────────────────────────────────────────
      // Los ocho nombres son EL MISMO getter y se separan por cómo TERMINA el
      // nombre (`ParserName.ends_with(...)`, script.cpp:1274-1361), que es por
      // lo que `$get_array_amt` y `$get_arrayfind` contestan cosas distintas
      // cuando la lista no está. Ver la tabla de `src/play/listas.js`.
      case "$get_array": case "$get_arrayfind": case "$get_array_amt": case "$get_array_exists":
      case "$g_get_array": case "$g_get_arrayfind": case "$g_get_array_amt": case "$g_get_array_exists": {
        if (!a.length) return FALTAN_PARAMS;
        const global = nombre.startsWith("$g_");
        const ps = [...a];
        let listas = global ? this.listasGlobales : this.listas;
        if (!global && ps.length > 1) {
          const otra = e.listasDe?.(String(ps[0])) ?? null;
          if (otra) { listas = otra; ps.shift(); }
        }
        const clave = String(ps[0]);
        const arr = listas.buscar(clave);
        const acaba = (s) => nombre.endsWith(s);

        if (!arr) {
          // Y aquí NO contestan lo mismo, que es lo que hay que leer despacio.
          if (acaba("amt")) return "-1";
          if (acaba("exists")) return "0";
          // «$get_array(<lista>,exists)», que es otra forma de preguntar lo
          // mismo y que Thothie arregló en JAN2020_02 (:1253).
          if (acaba("array") && String(ps[1] ?? "").includes("exist")) return "0";
          return SIN_LISTA;
        }
        if (acaba("exists")) return "1";
        if (acaba("array") && String(ps[1] ?? "").includes("exist")) return "1";

        if (acaba("amt")) return String(arr.length);

        if (acaba("find")) {
          if (ps.length < 2) return FALTAN_PARAMS;
          let i = 2;
          // El tercer parámetro es el TIPO o, si no es uno de los cuatro, el
          // índice de partida: el motor retrocede el cursor. :1298-1305.
          const quizaTipo = ps.length > i ? String(ps[i]) : "equals";
          const tipo = TIPOS_DE_BUSQUEDA.has(quizaTipo) ? (i++, quizaTipo) : "equals";
          const desde = ps.length > i ? enteroDe(ps[i++]) : 0;
          const sinMayusculas = ps.length > i ? enteroDe(ps[i]) === 1 : false;
          return String(buscarEnLista(arr, { que: ps[1], tipo, desde, sinMayusculas }));
        }

        // `$get_array(<lista>,<i>)`. Fuera de rango **devuelve su propio
        // texto**, no «-1» ni vacío: el motor cae hasta `return FullName` y
        // Thothie lo dejó documentado como «screwy, but servicable»
        // (script.cpp:1276). Aquí `texto` es ese literal.
        if (ps.length > 1) {
          const i = enteroDe(ps[1]);
          if (i > -1 && i < arr.length) return arr[i];
        }
        return texto;
      }
      default: return "0";
    }
  }

  anotarNoSoportado(tipo, nombre) {
    if (!this.noSoportados.some((x) => x.tipo === tipo && x.nombre === nombre)) {
      this.noSoportados.push({ tipo, nombre });
    }
  }

  /**
   * EL RELOJ DE LOS EVENTOS QUE SE REPITEN SOLOS — `repeatdelay`, el 64.
   *
   * Y aquí está lo que no se adivina: **`repeatdelay` se resuelve al CARGAR el
   * script, no al ejecutarlo.** El lector del motor lo trata como una
   * directiva mientras parte el archivo:
   *
   *     else if (!_stricmp(TestCommand, "repeatdelay")) {
   *         CurrentEvent->fRepeatDelay = atof(SCRIPTCONST(cBuffer));
   *         CurrentEvent->fNextExecutionTime = gpGlobals->time + CurrentEvent->fRepeatDelay;
   *         KeepCmd = true;
   *     }                                            script.cpp:5377-5382
   *
   * O sea que un evento con `repeatdelay` **empieza a correr solo en cuanto se
   * carga el guion**, sin que nadie lo llame — y el `KeepCmd = true` lo deja
   * además en la lista de comandos para que al ejecutarse se vuelva a armar
   * (scriptcmds.cpp:5121-5136). Eso contesta la pregunta que parecía no tener
   * respuesta: **quién arranca `player_regen_hp`**, que no lo llama ni un
   * script ni el motor. Nadie: cargarlo es arrancarlo.
   *
   * El propio comentario del mod avisa de la consecuencia: «whether the event
   * is called or not, or the NPC is alive or not, has no baring on whether
   * it'll repeat».
   */
  armarRepeticiones(ahora = 0) {
    this.repeticiones = [];
    for (const ev of this.eventos) {
      const crudo = repeticionDe(ev);
      if (crudo === null) continue;
      // `atof(SCRIPTCONST(cBuffer))`, y las dos mitades cuentan.
      //
      // `SCRIPTCONST` es «a const, script-wide, or global variable — LOADTIME
      // ONLY» (script.cpp:40), y `atof` de algo que no es un número da **0**.
      // La regeneración dice `repeatdelay FINAL_REGEN_RATE_HP`, que es un
      // `setvard` puesto por el bloque de cabecera — o sea que **al cargar no
      // existe todavía** y el reloj se arma a cero.
      //
      // Consecuencia, que no es un detalle: **la primera regeneración llega en
      // el acto**, no a los doce segundos. Luego el `repeatdelay` se ejecuta
      // como comando, esta vez con la variable ya puesta, y a partir de ahí va
      // cada doce. Se porta porque es lo que hace el juego.
      const seg = Math.max(0, numDe(this.resolver(crudo)));
      this.repeticiones.push({ evento: ev, cada: seg, cuando: ahora + seg });
    }
    return this.repeticiones.length;
  }

  /**
   * Corre los eventos cuyo reloj ha vencido. `ahora` en segundos.
   *
   * @returns cuántos han corrido, que es lo que una prueba mira.
   */
  pasoDeRepeticiones(ahora = 0) {
    let n = 0;
    for (const r of this.repeticiones ?? []) {
      if (ahora < r.cuando) continue;
      const ev = { nombre: r.evento.nombre, locales: new Map(), params: [], parar: false, repetirEn: null };
      this.rastro.push({ evento: r.evento.nombre, params: [] });
      this.ejecutarLista(r.evento.cmds, ev);
      n++;
      // Se vuelve a armar con lo que el `repeatdelay` de ESTA vuelta haya
      // dicho: el guion puede cambiarlo —la regeneración le resta 6 segundos
      // con el anillo de sangre— y el motor lo relee cada vez.
      r.cada = ev.repetirEn ?? r.cada;
      r.cuando = ahora + r.cada;
    }
    return n;
  }

  /**
   * `IScripted::CallScriptEvent` + `CScript::RunScriptEventByName` —
   * script.cpp:5932 y :5836. **Se ejecutan TODOS los eventos con ese nombre**,
   * en orden de archivo, que es lo que hace que el `game_menu_getoptions` de
   * `base_chat` y el del alcalde convivan y salgan las dos tandas de opciones.
   */
  llamar(nombre, params = []) {
    let hubo = false;
    for (const ev of this.eventos) {
      if (ev.nombre !== nombre) continue;
      hubo = true;
      this.ejecutarEvento(ev, params);
    }
    return hubo;
  }

  /** `CScript::Script_ExecuteEvent` — script.cpp:5776. */
  ejecutarEvento(evento, params = []) {
    const ev = { nombre: evento.nombre, locales: new Map(), params, parar: false };
    // `Script_SetupEvent`: PARAM1..PARAMn como locales. script.cpp:5709.
    params.forEach((p, i) => ev.locales.set(`PARAM${i + 1}`, String(p)));
    ev.locales.set("game.event.params", String(params.length));   // script.cpp:5964
    this.rastro.push({ evento: evento.nombre, params: [...params] });
    this.ejecutarLista(evento.cmds, ev);
    // «Erase all local variables» — script.cpp:5696. Por eso `reg.mitem.*`
    // sobrevive de un `menuitem.register` al siguiente DENTRO del evento y no
    // entre eventos.
    ev.locales.clear();
    return ev;
  }

  /**
   * `CScript::Script_ExecuteCmds` — script.cpp:5736-5771, línea por línea.
   *
   * Devuelve `false` si la lista terminó por un condicional viejo que falló o
   * por `exit`, que es lo que el motor usa para encadenar los `else`.
   */
  ejecutarLista(lista, ev) {
    for (const c of lista) {
      // «Convert the variable parameters»: TODOS los parámetros se resuelven
      // antes de llamar al comando. script.cpp:5742-5744.
      const params = c.params.map((p) => this.resolver(p, ev));
      const bien = this.ejecutarComando(c, params, ev);

      if (bien) {
        if (c.condicional) this.ejecutarLista(c.hijos, ev);
      } else if (c.condicional) {
        // EL VIEJO: abandona el bloque. Y lo abandona con `break`, no con
        // `return false`, que no es lo mismo:
        //
        //     if (!Cmd.m_NewConditional)
        //       break; //Old if command.  Breaks event execution on failure
        //                                            script.cpp:5756-5757
        //
        // El `break` sale del bucle y cae en el `return true` de :5771, así que
        // **quien llamó ve «se cumplió»**. Esto sólo se puede distinguir en el
        // único sitio que lee el valor —la cadena de `else` de la línea de
        // abajo—: con `return false` la cadena seguiría probando ramas que el
        // motor ya no prueba. El comentario del motor dice «breaks event
        // execution» y es engañoso: a los bloques hijos se entra por la
        // recursión de :5752, que TIRA el valor, así que lo que abandona es su
        // `Cmdlist` y no el evento. Lo midió la sesión -e0 sobre
        // `if SHOWIT_ON` dentro de `if ( AM_SITTING )`: sentarse sí da maná, y
        // lo que se pierde son los dos mensajes. La fila del 67 no está mal
        // —allí la línea estaba al nivel de arriba del evento, y ahí abandonar
        // el bloque y abandonar el evento son lo mismo—, pero decía «el
        // bloque» por dónde estaba la línea y no por la regla.
        //
        // FIDELIDAD SIN EFECTO MEDIBLE HOY, y se dice en voz alta por el
        // apartado 4: de las **1 908 ramas `else` de los 2 884 guiones**, 135
        // llevan un `if` viejo en su primer nivel y **0 de ellas son algo
        // distinto de la última rama de su cadena**. O sea que ningún guion del
        // juego puede notar la diferencia; la prueba que la mide construye el
        // caso a mano (desde texto, por la regla del 67). No se apunta un verde
        // por este caso.
        if (!c.nueva) break;
        for (const rama of c.sino) if (this.ejecutarLista(rama, ev)) break;
        if (lista.length === 1) return false;
      }
      if (ev.parar) return false;                   // `exit`, MiB 07DEC_2014
    }
    return true;
  }

  /** Un comando. Devuelve si «se cumplió», que sólo mira el que es condicional. */
  ejecutarComando(c, params, ev) {
    const e = this.entorno;
    switch (c.nombre) {
      case "if": case "if()": {
        // EL `!` HAY QUE QUITARLO Y VOLVER A RESOLVER, y no es un detalle:
        //
        //     if (Params[0].c_str()[0] == '!') {
        //       Opposite = true;
        //       Value = SCRIPTVAR(Params[0].substr(1));  //The '!' interferes
        //       //with the default variable resolution, so remove it and
        //       //resolve the variable again
        //     }                                  scriptcmds.cpp:3968-3972
        //
        // Sin esto, `!QUEST_GOBLINCHIEF` se resuelve como un nombre entero, no
        // lo encuentra, devuelve «!QUEST_GOBLINCHIEF» y `atoi` de eso es cero:
        // la condición **da cierto siempre**, valga lo que valga la variable.
        // O sea que la misión del alcalde se podía volver a entregar después
        // de terminada. Lo cazaron dos pruebas.
        const ps = [...params];
        if (ps.length === 1 && String(ps[0]).startsWith("!")) {
          ps[0] = `!${this.resolver(String(ps[0]).slice(1), ev)}`;
        }
        return condicion(ps);
      }

      // ── variables ────────────────────────────────────────────────────
      // `ScriptCmd_SetVar`, scriptcmds.cpp:6553. Con tres o más parámetros
      // **se concatenan sin separador**: `sTemp += Params[i + 1]`, :6572.
      case "local": case "setvar": case "setvard": case "setvarg": case "const": {
        if (params.length < 2) return true;
        // El nombre NO se resuelve: el motor usa `Cmd.m_Params[1]`, o sea el
        // texto crudo, mientras que `Params[0]` es ese mismo texto YA resuelto
        // (scriptcmds.cpp:6560 contra script.cpp:5743). Aquí `c.params` no
        // lleva el nombre del comando delante, así que el crudo es el [0].
        const nombre = c.params[0];
        const valor = params.length > 2 ? params.slice(1).join("") : params[1];
        if (c.nombre === "local") ev.locales.set(nombre, valor);
        else if (c.nombre === "setvarg") GLOBALES.set(nombre, valor);
        else if (c.nombre === "const") { if (!this.constantes.has(nombre)) this.constantes.set(nombre, valor); }
        else {
          // `SetVar(VarName, VarValue, Event)`: si hay una LOCAL con ese
          // nombre, se pisa la local. scriptcmds.cpp:6581 / script.cpp:4771.
          if (ev.locales.has(nombre)) ev.locales.set(nombre, valor);
          else this.vars.set(nombre, valor);
        }
        return true;
      }

      // `ScriptCmd_MathSet`, scriptcmds.cpp:4200. Y el detalle que se ve
      // jugando: **con dos parámetros escribe «%.2f»**, o sea que
      // `add ZOMBIE_COUNT 1` deja «1.00» y no «1» (:4221). Por eso los scripts
      // pasan por `$int` antes de enseñar un número.
      case "add": case "subtract": case "multiply": case "divide": case "mod":
      case "dec": case "decvar": {
        if (params.length < 2) return true;
        const a = numDe(params[0]);
        const b = numDe(params[1]);
        let v;
        switch (c.nombre) {
          case "subtract": case "dec": case "decvar": v = a - b; break;
          case "multiply": v = a * b; break;
          // **Dividir entre cero NO da error ni cero: deja el valor como
          // estaba.** La condición es `Operation == 3 && Amount`, así que sin
          // `Amount` no entra en ninguna rama y `flValue` sigue siendo
          // `Params[0]`… que se escribe igualmente encima. scriptcmds.cpp:4217.
          case "divide": v = b ? a / b : a; break;
          // `mod` corta a entero LOS DOS lados: `(int)flValue % (int)Amount`.
          case "mod": v = b ? Math.trunc(a) % Math.trunc(b) : a; break;
          default: v = a + b;
        }
        const nombre = c.params[0];                 // `Cmd.m_Params[1]`, crudo
        // Con un tercer parámetro —`full`— se escribe con toda la precisión;
        // sin él, «%.2f». :4221-4225. Da igual QUÉ diga el tercero.
        const texto = params.length <= 2 ? v.toFixed(2) : String(v);
        if (ev.locales.has(nombre)) ev.locales.set(nombre, texto);
        else this.vars.set(nombre, texto);
        return true;
      }

      // `capvar <var> <min> <max>` — scriptcmds.cpp:2333-2344.
      //
      // Y tiene un detalle que se porta porque se ve: **si el valor está
      // dentro, NO se escribe nada**. Son dos `if` sueltos, no un
      // `clamp`, así que una variable que no existe y está «dentro» se queda
      // sin existir en vez de quedarse a su propio valor.
      case "capvar": {
        if (params.length < 3) return true;
        const v = numDe(params[0]);
        const min = numDe(params[1]);
        const max = numDe(params[2]);
        if (v >= min && v <= max) return true;
        this.ponerVar(c.params[0], v < min ? String(params[1]) : String(params[2]), ev);
        return true;
      }

      // ── LAS LISTAS ───────────────────────────────────────────────────
      // `ScriptCmd_Array`, scriptcmds.cpp:1945. Las reglas están en
      // `src/play/listas.js`; aquí sólo se decide de quién es la lista.
      case "array.create": case "array.add": case "array.add_unique": case "array.set":
      case "array.del": case "array.erase": case "array.clear": case "array.copy":
      case "g_array.create": case "g_array.add": case "g_array.add_unique": case "g_array.set":
      case "g_array.del": case "g_array.erase": case "g_array.clear": case "g_array.copy": {
        if (!params.length) return true;
        const global = c.nombre.startsWith("g_");
        // `Cmd.Name().substr(GLOBAL ? 8 : 6)` — :1964.
        const sub = c.nombre.slice(global ? 8 : 6);
        const ps = [...params];
        // El primer parámetro puede ser UNA ENTIDAD, sin marcar: se prueba a
        // resolverlo como asa y, si contesta, el nombre es el siguiente.
        // :1966-1972. Sólo las no globales.
        let listas = global ? this.listasGlobales : this.listas;
        if (!global && ps.length > 1) {
          const otra = e.listasDe?.(String(ps[0])) ?? null;
          if (otra) { listas = otra; ps.shift(); }
        }
        const nombre = String(ps[0]);
        if (sub === "create") { listas.crear(nombre); return true; }
        // «Attempting %s on non-existant array»: se queja y no hace nada. :1961.
        if (!listas.existe(nombre)) { this.anotarNoSoportado("lista", nombre); return true; }
        if (sub === "add" && ps.length > 1) listas.anadir(nombre, ps[1]);
        else if (sub === "add_unique" && ps.length > 1) listas.anadirUnico(nombre, ps[1]);
        else if (sub === "set" && ps.length > 2) listas.poner(nombre, enteroDe(ps[1]), ps[2]);
        else if (sub === "del" && ps.length > 1) listas.quitar(nombre, enteroDe(ps[1]));
        else if (sub === "erase") listas.borrar(nombre);
        else if (sub === "clear") listas.vaciar(nombre);
        // `array.copy` copia **a la lista de ESTE guion siempre**, aunque el
        // origen sea de otra entidad: el motor usa `m.pScriptedEnt` a pelo
        // para el destino (:2003), no el `pEnt` que acaba de resolver.
        else if (sub === "copy" && ps.length > 1) {
          const origen = listas.buscar(nombre);
          if (origen) { const d = this.listas.crear(String(ps[1])); for (const v of origen) d.push(v); }
        }
        return true;
      }

      // ── llamadas ─────────────────────────────────────────────────────
      // `ScriptCmd_CallEvent`, scriptcmds.cpp:2220. Un primer parámetro que
      // empieza por dígito es un RETARDO (`isdigit(Params[NextParm][0])`,
      // :4241), no un nombre de evento.
      case "callevent": case "calleventtimed": case "callexternal": case "calleventloop": {
        if (!params.length) return true;
        let i = 0;
        let externo = null;
        let vueltas = 1;
        if (c.nombre === "callexternal") { externo = params[0]; i = 1; }
        // `calleventloop <n> <evento> [params]`: el PRIMER parámetro es cuántas
        // veces, y se come antes de mirar nada más. scriptcmds.cpp:2250-2255.
        else if (c.nombre === "calleventloop") { vueltas = enteroDe(params[0]); i = 1; }
        let retardo = 0;
        if (params.length > i + 1 && /^\d/.test(String(params[i]))) { retardo = numDe(params[i]); i++; }
        const nombre = params[i]; i++;
        const resto = params.slice(i);
        if (externo !== null) { e.llamarExterno(externo, nombre, resto); return true; }
        // «Can't call myself recursively» — scriptcmds.cpp:2297.
        if (nombre === ev.nombre && !retardo) return true;
        if (retardo) { e.programar(retardo, () => this.llamar(nombre, resto)); return true; }

        // EL BUCLE. scriptcmds.cpp:2299-2320.
        //
        //     SetVar("MSC_RESET_LOOP", "-5");
        //     for (int i = 0; i < Loops; i++) {
        //       m.m_Iteration = i;
        //       RunScriptEventByName(EventName, ...);
        //       if (atoi(GetScriptVar("MSC_BREAK_LOOP")) == 1) { ...; break; }
        //       if (atoi(GetScriptVar("MSC_RESET_LOOP")) != -5) { i = ...; }
        //     }
        //
        // Tres cosas que no se ven leyendo un guion:
        //
        //   1. **La vuelta actual se lee con `game.script.iteration`**
        //      (script.cpp:4673) y empieza en 0, no en 1.
        //   2. **Se sale poniendo `MSC_BREAK_LOOP` a 1**, y el motor la vuelve
        //      a poner a 0 al salir: es un `break` de una sola bala (DEC2017_19).
        //   3. **`MSC_RESET_LOOP` reencauza el contador** a lo que le pongas,
        //      y vuelve a −5, que es su «apagado» (SEP2019_08). Con un valor
        //      bajo hace un bucle infinito de verdad, y el motor no tiene tope.
        //      Aquí sí hay uno, porque un guion colgado se lleva la pestaña por
        //      delante y no hay nada al otro lado que lo mate; se apunta al
        //      salir para que no sea un silencio.
        if (c.nombre === "calleventloop") {
          const antes = this.iteracion;
          this.vars.set("MSC_RESET_LOOP", "-5");
          let sinCuenta = 0;
          for (let k = 0; k < vueltas; k++) {
            this.iteracion = k;
            if (!this.llamar(nombre, resto)) { this.anotarNoSoportado("evento", nombre); break; }
            if (enteroDe(this.resolver("MSC_BREAK_LOOP", ev)) === 1) { this.vars.set("MSC_BREAK_LOOP", "0"); break; }
            const reset = enteroDe(this.resolver("MSC_RESET_LOOP", ev));
            if (reset !== -5) {
              k = reset;
              this.iteracion = reset;
              this.vars.set("MSC_RESET_LOOP", "-5");
              if (++sinCuenta > VUELTAS_MAXIMAS) { this.anotarNoSoportado("bucle", `${nombre} no termina`); break; }
            }
          }
          this.iteracion = antes;           // `m.m_Iteration = SaveIteration`
          return true;
        }

        if (!this.llamar(nombre, resto)) this.anotarNoSoportado("evento", nombre);
        return true;
      }

      // ── EL 83: TRES COSAS EN UNA LÍNEA, Y LAS TRES ESTABAN MAL ───────────
      //
      // Aquí ponía `case "return": case "exit": ev.parar = true`. Al ir a
      // escribir el comando que de verdad corta un evento resultó que:
      //
      //   1. **`exit` no existe en el motor.** `m_GlobalCmdHash` registra
      //      `exitevent` (scriptcmds.cpp:48) y `return` (:167), y no hay
      //      ningún `exit`. En los 2 884 guiones hay **cero** líneas con un
      //      `exit` suelto: estaba portado y no lo usaba nadie.
      //
      //   2. **`return` NO corta.** Es `returndata`, y el motor lo dice encima
      //      de la función, con todas las letras: «*Does not stop code
      //      execution - if multiple instances of return are encountered in
      //      the same event, the results are tokenized*»
      //      (scriptcmds.cpp, sobre `ScriptCmd_Return`). Lo demuestran los
      //      propios guiones sin salir del archivo: `chests/bank1/filter.script`
      //      hace `return **clear` en la línea 25 y `return L_ITEMS` en la 26.
      //      Si `return` cortara, el banco devolvería siempre vacío.
      //      **Son 148 líneas en 81 ficheros** las que estaban cortando el
      //      evento donde el juego sigue.
      //
      //   3. **`exitevent`, que es el que corta, no estaba.** 108 líneas en 53
      //      ficheros. La bandera `ev.parar` y su comprobación en
      //      `ejecutarLista` ya estaban escritas desde el 67 — lo que faltaba
      //      era el comando que la enciende. Una bandera que no enciende nadie
      //      es el mismo sitio que un `=> {}`: una regla puede vivir ahí sin
      //      correr.
      //
      // `exitevent`: `Event.bFullStop = true` (scriptcmds.cpp:3148-3153). El
      // bucle lo mira DESPUÉS DE CADA COMANDO (`if (Event.bFullStop) return
      // false`, script.cpp:5767-5768), así que desenrolla los `if` anidados; y
      // se limpia al acabar el evento (:5694), así que no se lleva por delante
      // al que hizo el `callevent`.
      case "exitevent": ev.parar = true; return true;

      // `return <valor>` / `returndata <valor>`: guarda `m_ReturnData`, que es
      // lo que recoge `$func(<evento>)` y lo que `game_damaged` usa para
      // cambiar el daño. Este puerto no tiene `$func` ni `m_ReturnData`, así
      // que el VALOR se apunta como hueco — pero el comando **no corta**, que
      // es la mitad que sí importa y la que estaba mal.
      case "return": case "returndata":
        this.anotarNoSoportado("comando", `${c.nombre} (no hay \`m_ReturnData\`; no corta el evento)`);
        return true;

      // ── el mundo ─────────────────────────────────────────────────────
      // `saytext`: las palabras se juntan **con un espacio** y se dicen en
      // SPEECH_LOCAL. npcscript.cpp:708-720.
      case "saytext": e.hablar(params.join(" ")); return true;

      // `say <sonido>[duración] ...`. npcscript.cpp:109-140.
      //
      // No es `saytext`: `saytext` son PALABRAS y esto son SONIDOS. Cada
      // parámetro es un `.wav` y puede llevar entre corchetes cuánto tiene que
      // estar la boca abierta: `say hail[0.8]`. Sin corchetes son 0,2 s.
      //
      // Y tiene un caso que no se adivina: `*` y cualquier cosa que empiece
      // por `RND` **no son sonidos**, son sólo movimiento de boca. El propio
      // motor lo comenta como un apaño («Thothie's totally frustrated and just
      // hacking now»), y está ahí para que el parloteo aleatorio de
      // `base_chat` no acabe cargando un archivo llamado `RND1.wav`.
      case "say": {
        for (const p of params) {
          const s = String(p);
          const corchete = s.indexOf("[");
          const cual = corchete === -1 ? s : s.slice(0, corchete);
          const cuanto = corchete === -1 ? 0.2 : numDe(s.slice(corchete + 1));
          const mudo = !cual || cual === "*" || cual.startsWith("RND");
          e.decir(mudo ? null : cual, cuanto);
        }
        return true;
      }

      // `stradd <var> <a> [b]`. scriptcmds.cpp:6787-6808.
      //
      // Dos formas, y la de tres NO añade: **reemplaza**. Con `stradd V a b`
      // la variable acaba valiendo «ab», se llamara antes como se llamara.
      // Sólo `stradd V a` concatena. Es de la reescritura de MiB de 2019 y es
      // lo que hacen los guiones, así que va tal cual.
      //
      // Y el otro detalle: una variable que no existe **devuelve su propio
      // nombre**, y el motor lo comprueba justo para tratarla como vacía
      // (`if (vsVarName == vsOrgl) vsOrgl = ""`). Sin eso, el primer `stradd`
      // sobre una variable nueva daría «L_TEXTOhola».
      case "stradd": {
        if (params.length < 2) return true;
        // El nombre CRUDO, igual que en `setvar`: el motor usa
        // `Cmd.m_Params[1]`, no el `Params[0]` ya resuelto (:6795).
        const nombre = c.params[0];
        if (params.length >= 3) { this.ponerVar(nombre, `${params[1]}${params[2]}`, ev); return true; }
        const antes = this.existeVar(nombre, ev) ? String(this.resolver(nombre, ev)) : "";
        this.ponerVar(nombre, `${antes}${params[1]}`, ev);
        return true;
      }

      // `playsound <canal> [volumen] <sonido> [atenuación] [tono]`
      // `playrandomsound <canal> [volumen] <sonido...>`
      // scriptcmds.cpp:4675-4795.
      //
      // **CORRECCIÓN DEL 43.** Aquí se portó como
      // `playsound <ent> <canal> <archivo>`, con una entidad delante, y **no
      // hay entidad**: suena siempre el que ejecuta el guion. Se leyó de la
      // tabla de comandos sin abrir la función. Lo que hay es:
      //
      //   - `<canal>` siempre el primero;
      //   - el volumen es **opcional y se reconoce por ser un dígito**
      //     (`isdigit(Params[1].c_str()[0])`, :4704), lo que deja convivir la
      //     forma vieja `playsound 0 SOUND_IDLE1` con la nueva
      //     `playsound 0 10 SOUND_IDLE1`. Las dos están en los guiones de hoy;
      //   - y **va de 0 a 10, no de 0 a 1**: `Volume = atof(Params[1]) / 10`,
      //     con tope arriba y abajo por un fallo viejo de Thothie que a veces
      //     lo dejaba por encima de 10.
      //
      // Dos casos más que se ven jugando: **volumen 0 no es silencio, es
      // «corta ese canal»** (:4775), que es como se paran los sonidos en
      // bucle; y un sonido llamado literalmente `none` **se salta** (:4751).
      case "playsound": case "playrandomsound": {
        if (params.length < 2) return true;          // `Params.size() >= 2`
        const canal = enteroDe(params[0]);
        let siguiente = 1;
        let volumen = -1;
        if (/^\d/.test(String(params[1]))) {
          volumen = Math.min(1, Math.max(0, numDe(params[1]) / 10));
          siguiente++;
        }
        let cual = params.length > siguiente ? String(params[siguiente]) : "common/null.wav";
        if (c.nombre === "playrandomsound") {
          // `Params[NextParm + RANDOM_LONG(0, Params.size() - (Volume > -1 ? 3 : 2))]`
          const tope = params.length - (volumen > -1 ? 3 : 2);
          cual = String(params[siguiente + e.azar(0, Math.max(0, tope))] ?? cual);
        }
        if (cual === "none") return true;
        e.sonar(cual, {
          canal,
          // Sin volumen el motor no toca `Volume` y cae por la rama de abajo
          // con `SndVolume`, el del bicho. Aquí eso es «el que tenga».
          volumen: volumen > -1 ? volumen : null,
          corta: volumen === 0,
          // La atenuación y el tono sólo se leen en la forma NO aleatoria
          // (`if (!Cmd.Name().contains("random"))`, :4737).
          atenuacion: c.nombre === "playsound" && params.length > 3 ? numDe(params[3]) : null,
          tono: c.nombre === "playsound" && params.length > 4 ? numDe(params[4]) : null,
        });
        return true;
      }

      // `setprop <ent> <propiedad> <valor>`. scriptcmds.cpp:6178-6189.
      // Hacen falta LOS TRES: con menos, el motor no entra en el `if` y el
      // comando se traga sin decir nada.
      case "setprop": {
        if (params.length < 3) return true;
        e.ponerPropiedad(String(params[0]), String(params[1]), String(params[2]));
        return true;
      }

      // `roam <0|1>`. npcscript.cpp:340-350. Enciende o apaga `MONSTER_ROAM`,
      // que es si el NPC se pasea cuando no tiene nada que hacer.
      case "roam": {
        if (!params.length) return true;
        e.pasear(enteroDe(params[0]) !== 0);
        return true;
      }

      // `setmovedest none` | `setmovedest <destino> <distancia> [flee]`.
      // npcscript.cpp:1600-1640.
      //
      // El destino es o un nombre de entidad o un vector entre paréntesis, y
      // eso se distingue mirando **si el primer carácter es un paréntesis**
      // (`Params[0].c_str()[0] == '('`, :1621). Con una sola palabra que no sea
      // `none` el motor tampoco hace nada: la rama pide `Params.size() >= 2`.
      case "setmovedest": {
        if (!params.length) return true;
        if (String(params[0]).toLowerCase() === "none") { e.irA(null); return true; }
        if (params.length < 2) return true;
        const a = String(params[0]);
        e.irA(a.startsWith("(") ? { punto: a } : { entidad: a }, {
          proximidad: numDe(params[1]),
          huir: params.slice(2).some((p) => String(p).toLowerCase() === "flee"),
        });
        return true;
      }

      // `setmoveanim <anim>`. npcscript.cpp:1471-1477. Sólo guarda el nombre
      // en `m_MoveAnim`: la animación con la que andará a partir de ahora.
      case "setmoveanim": {
        if (!params.length) return true;
        e.animacionDeAndar(String(params[0]));
        return true;
      }

      // ── LAS TIENDAS ──────────────────────────────────────────────────
      // Las reglas están en `src/play/tienda.js`; esto sólo traduce los
      // parámetros del guion. Cada rama copia el `Params.size() >= n` del
      // motor, que es lo que decide si el comando hace algo o se calla.

      // `npcstore.create <tienda>`. npcscript.cpp:739-753. Sobre un nombre que
      // ya existe REUTILIZA la que hay: las tiendas son globales por nombre.
      case "npcstore.create": case "createstore": {
        if (!params.length) return true;
        e.crearTienda(String(params[0]));
        return true;
      }

      // `addstoreitem <tienda> <objeto> [cant] [coste%] [venta] [lote]`.
      // npcscript.cpp:755-826. El coste es un PORCENTAJE del valor del objeto,
      // no un precio, y el ratio de venta está topado a 0,9.
      case "npcstore.additem": case "addstoreitem": {
        if (params.length < 2) return true;
        e.anadirALaTienda(String(params[0]), String(params[1]), {
          cantidad: params.length >= 3 ? enteroDe(params[2]) : undefined,
          coste: params.length >= 4 ? enteroDe(params[3]) : undefined,
          ratio: params.length >= 5 ? numDe(params[4]) : undefined,
          lote: params.length >= 6 ? enteroDe(params[5]) : undefined,
        });
        return true;
      }

      // `npcstore.offer <tienda> <a quién> <flags> <retrollamada>`.
      // npcscript.cpp:829-896.
      //
      // La rama pide `>= 3` y en esa forma vieja lee los flags del hueco del
      // DESTINO (`BuyFlags = Params[1]`, que es a quién se le ofrece). Con
      // cuatro reasigna bien (:855-862). Todos los guiones de Gate City usan
      // cuatro; la de tres se porta igual porque es lo que hace el motor.
      case "npcstore.offer": case "offerstore": {
        if (params.length < 3) return true;
        const cuatro = params.length >= 4;
        e.ofrecerTienda(String(params[0]), {
          aQuien: String(params[1]),
          flags: String(cuatro ? params[2] : params[1]),
          retrollamada: String(cuatro ? params[3] : params[2]),
        });
        return true;
      }

      // `npcstore.remove <tienda> [allitems | item <objeto>]`.
      // npcscript.cpp:900-925. **Sin segundo parámetro no vacía: APAGA** la
      // tienda (`Deactivate()`), que es otra cosa.
      case "npcstore.remove": {
        if (!params.length) return true;
        const que = params.length >= 2 ? String(params[1]) : null;
        if (que === null) e.quitarDeLaTienda(String(params[0]), { apagar: true });
        else if (que === "allitems") e.quitarDeLaTienda(String(params[0]), { todo: true });
        else if (que === "item" && params.length >= 3) e.quitarDeLaTienda(String(params[0]), { objeto: String(params[2]) });
        return true;
      }

      // `deleteme` | `deleteent <ent> [remove | fade [seg]]`.
      // scriptcmds.cpp:2872-2919. Los dos son LA MISMA función y lo que los
      // separa es `Cmd.Name()` (:2876).
      //
      // Tres cosas que se leen mal:
      //
      //   1. **Con un solo parámetro NO borra una entidad del mapa.** Llama a
      //      `game_deleted` y a `DelayedRemove()`, que es la baja ordenada de
      //      una entidad con guion. Quitar de verdad algo puesto por el mapa
      //      —los generadores de zombis del alcalde— pide `remove`, que es
      //      `UTIL_Remove` y lo añadió Thothie en FEB2015_19 justo para eso.
      //   2. `fade` NO borra: desvanece (`SUB_FadeOut`), y con un tercer
      //      parámetro es cuánto tarda.
      //   3. **A un jugador no se le puede borrar** — `!pEntity->IsPlayer()`,
      //      y el propio motor comenta por qué: «Don't allow a crash by
      //      deleting players».
      //
      // Y las dos ramas son `if` seguidos, no `else if`: no es que importe con
      // lo que escriben los guiones, pero se porta como está.
      case "deleteme": case "deleteent": {
        if (c.nombre === "deleteme") { e.borrarEntidad(null, { modo: "delayed" }); return true; }
        if (!params.length) return true;
        const quien = String(params[0]);
        if (params.length < 2) { e.borrarEntidad(quien, { modo: "delayed" }); return true; }
        const que = String(params[1]);
        if (que === "fade") e.borrarEntidad(quien, { modo: "fade", segundos: params.length >= 3 ? enteroDe(params[2]) : null });
        if (que === "remove") e.borrarEntidad(quien, { modo: "remove" });
        return true;
      }

      // ── `usetrigger <nombre...>`: EL GUION DISPARA EL MAPA — el 67 ────────
      //
      //     if( Params.size() >= 1 )
      //     {
      //         for(int i = 0; i < Params.size(); i++)
      //             FireTargets( Params[i], m.pScriptedEnt, m.pScriptedEnt, USE_TOGGLE, 0 );
      //     }
      //     else ERROR_MISSING_PARMS;
      //                                            scriptcmds.cpp:7054-7066
      //
      // Cuatro cosas que se leen ahí y hay que copiar:
      //
      //   1. **Acepta varios nombres** y dispara todos, en orden.
      //   2. El activador Y el llamador son **la entidad del guion**, no el
      //      jugador que la usó. En `trigger_relay` eso decide a quién le llega
      //      el `killtarget`, así que no es decorativo.
      //   3. El `USE_TYPE` es **`USE_TOGGLE`**, no `USE_ON`. Una puerta
      //      disparada con `ON` no se cierra y con `TOGGLE` sí.
      //   4. Es `#ifdef VALVE_DLL`: **sólo servidor**. Aquí el bus vive en el
      //      anfitrión, que es lo mismo.
      //
      // Sin esto, `player_main.script:139` —`usetrigger player_joined`— no
      // llegaba a ningún sitio, y con él se queda dentro medio Edana: los
      // **11 parroquianos sentados** de la taberna esperan a que su
      // `ms_monsterspawn` se dispare, y quien lo dispara es esa línea.
      case "usetrigger": {
        if (!params.length) return true;          // `ERROR_MISSING_PARMS`
        for (const p of params) e.usarDisparador(String(p));
        return true;
      }

      // `playanim once nod` / `playanim <sec> <anim>`. npcscript.cpp:1487.
      case "playanim": e.animar(params[params.length - 1], params[0]); return true;

      // `infomsg <player|all> <title> <text>`. scriptcmds.cpp:4058.
      case "infomsg": e.aviso(params[0], params[1] ?? "", params[2] ?? ""); return true;

      // `offer <target> <item|gold> [cantidad]`. npcscript.cpp:636.
      // El fallo se porta: la rama del oro comprueba `Params.size() >= 2` y
      // **lee `Params[2]`** (:653-655), o sea que `offer X gold` sin cantidad
      // lee fuera de la lista. Aquí eso es `undefined` -> `atoi` -> 0.
      case "offer": {
        if (params.length < 2) return true;
        if (String(params[1]).toLowerCase() === "gold") e.darOro(params[0], enteroDe(params[2]));
        else e.darObjeto(params[0], params[1], params.length > 2 ? enteroDe(params[2]) : 1);
        return true;
      }

      // `quest <set|unset|dump|clear> <player> <nombre> <valor>`.
      // scriptcmds.cpp:4844-4851. Ver `src/play/misiones.js`.
      case "quest": {
        const accion = String(params[0] ?? "").toLowerCase();
        if (accion === "dump") { e.volcarMisiones(params[1]); return true; }
        if (accion === "clear") { e.limpiarMisiones(params[1]); return true; }
        // `if(!SetData || Params.size() >= 4)`: un `set` sin valor NO hace nada
        // (scriptcmds.cpp:4874), y un `unset` sí, con tres parámetros.
        if (accion === "unset") { e.ponerMision(params[1], params[2], null); return true; }
        if (params.length >= 4) e.ponerMision(params[1], params[2], params[3]);
        return true;
      }

      // `menuitem.register`. npcscript.cpp:940. Lee las `reg.mitem.*` que
      // haya puestas y **no las borra**: la siguiente opción hereda lo que no
      // se vuelva a poner. Es un fallo del motor y se porta.
      case "menuitem.register": {
        const v = (k) => this.resolver(`reg.mitem.${k}`, ev);
        const hay = (k) => this.existeVar(`reg.mitem.${k}`, ev);
        e.registrarOpcion({
          id: hay("id") ? v("id") : "",
          titulo: hay("title") ? v("title") : "",
          tipo: hay("type") ? v("type") : "callback",
          datos: hay("data") ? v("data") : "",
          // `Script->VarExists(...) ? SCRIPTVAR(...) : ""` — npcscript.cpp:977.
          respuesta: hay("callback") ? v("callback") : "",
          siFalla: hay("cb_failed") ? v("cb_failed") : "",
          prioridad: enteroDe(hay("priority") ? v("priority") : "0"),
        });
        return true;
      }

      // ── EL MENÚ Y LA CHARLA ──────────────────────────────────────────

      // `menuitem.remove <id>` — npcscript.cpp:1003-1016.
      //
      // Quita por **ID** (`reg.mitem.id`), no por título, y **quita TODAS las
      // que se llamen así**: el bucle es `Menuoptions.erase(i--)`, y el motor
      // lo comenta —«Erase _all_ with this name. Makes erasing big menus
      // easy»—. Un port que quitara sólo la primera dejaría medio menú puesto.
      //
      // Y fuera de `game_menu_getoptions` no hace nada, porque
      // `m_MenuCurrentOptions` es nulo: es la misma guarda que
      // `menuitem.register`.
      case "menuitem.remove": {
        if (!params.length) return true;
        e.quitarOpcion(String(params[0]));
        return true;
      }

      // `menu.open <jugador>` — npcscript.cpp:1019-1037.
      //
      // Y aquí hay un fallo del original que se porta **con el fallo**: la
      // rama comprueba que te quepa algo en la mochila, y el aviso que te
      // diría por qué no se abre **está comentado en el código**:
      //
      //     if (pPlayer->NumItems() < NUM_MAX_ITEMS) OpenMenu(pPlayer);
      //     // else
      //     // {
      //     //   pPlayer->SendEventMsg(HUDEVENT_UNABLE, "Cannot use menus...");
      //     // }
      //
      // O sea que con la mochila llena el NPC **se queda callado** y el menú
      // no aparece, sin decir nada. Es un silencio del juego, no nuestro.
      case "menu.open": {
        if (!params.length) return true;
        e.abrirMenu(String(params[0]));
        return true;
      }

      // `catchspeech <evento> <palabra> [palabra...]` — npcscript.cpp:693-706.
      // Registra qué dispara qué cuando le hablas por el chat. Se guarda en
      // `m_Phrases`, que es una lista y no un mapa: **la misma palabra puede
      // estar en dos entradas y se disparan las dos**.
      case "catchspeech": {
        if (params.length < 2) return true;
        e.escuchar(String(params[0]), params.slice(1).map(String));
        return true;
      }

      // Los seis mensajes de colores y la consola. `ScriptCmd_Message`,
      // scriptcmds.cpp:4243-4290. Las palabras se juntan **con un espacio** y
      // el texto se corta a 140 con un asterisco detrás, porque el límite del
      // mensaje al cliente es 192 (Thothie MAR2008a).
      case "playermessage": case "rplayermessage": case "gplayermessage":
      case "bplayermessage": case "yplayermessage": case "dplayermessage":
      case "consolemsg": {
        if (params.length < 2) return true;
        let t = params.slice(1).join(" ");
        if (t.length > 140) t = `${t.slice(0, 140)}*\n`;
        e.mensajeAlJugador(String(params[0]), t, c.nombre);
        return true;
      }

      // `helptip <player|all> <tipname|generic> <title> <text>` —
      // scriptcmds.cpp:3595. El aviso de una sola vez que el juego enseña la
      // primera vez que algo pasa.
      //
      // EL 64: se le pasan los PARÁMETROS ENTEROS y no los dos primeros. Antes
      // llegaban `aQuien` y `clave` y el título y el texto se tiraban aquí, o
      // sea que aunque alguien hubiera enganchado la ventana no habría tenido
      // qué escribir en ella. Quién manda y qué se recuerda es de
      // `src/play/consejos.js`; esto sólo entrega.
      case "helptip": {
        if (params.length < 4) return true;         // `ERROR_MISSING_PARMS`
        e.consejo(params.map((x) => String(x)));
        return true;
      }

      // `givehp <ent> <cantidad>` / `givemp <ent> <cantidad>` — scriptcmds.cpp:
      // 157-158. La regeneración del jugador son estas dos líneas repetidas
      // cada doce segundos (`player_sv_regen.script:54-65`). Aquí sólo se
      // entrega: cuánta vida cabe lo sabe quien tiene el personaje.
      // `givehp [target] <amt>` — el objetivo es OPCIONAL, y sin él es la
      // entidad del guion:
      //
      //     CBaseEntity *pTarget = m.pScriptedEnt;
      //     const char* Amt = Params[0];
      //     if( Params.size() >= 2 ) { pTarget = ...RetrieveEntity(Params[0]); Amt = Params[1]; }
      //                                            scriptcmds.cpp:3434, 3443-3449
      //
      // ── EL 66 ────────────────────────────────────────────────────────────
      //
      // Esto pedía DOS parámetros y con uno se iba en silencio. El guion del
      // jugador siempre escribe `givehp ent_me …`, así que su regeneración
      // funcionaba y nadie vio el hueco; los OBJETOS lo escriben con uno
      // —`givehp MY_PASSIVE_RATE`, la curación pasiva del hechizo de
      // rejuvenecer— y ésos no curaban nada.
      //
      // `null` es «la entidad de este guion», y quien lo reciba decide qué
      // significa. Para un objeto significa su dueño, porque el motor lo
      // reenvía: `if (m_pOwner) return m_pOwner->Give(Type, Amt);`
      // (genericitem.cpp:2298-2302).
      case "givehp": case "givemp": {
        if (!params.length) return true;
        const que = c.nombre === "givehp" ? "vida" : "mana";
        if (params.length === 1) { e.dar(que, null, numDe(params[0])); return true; }
        e.dar(que, String(params[0]), numDe(params[1]));
        return true;
      }

      // `repeatdelay <segundos>` — scriptcmds.cpp:5121-5136. Al EJECUTARSE
      // vuelve a armar el reloj del evento; armarlo la primera vez es cosa de
      // `armarRepeticiones`, porque el motor lo hace al CARGAR (ver allí).
      case "repeatdelay": {
        if (!params.length) return true;
        const seg = numDe(params[0]);
        if (seg > 0 && ev) ev.repetirEn = seg;
        return true;
      }

      case "dbg": return true;                       // sólo en el build de Thothie

      default:
        this.anotarNoSoportado("comando", c.nombre);
        // El motor avisa por consola y **sigue con la línea siguiente**
        // (script.cpp:5627). Un comando que no existe no es condicional, así
        // que devolver `true` es lo mismo que hace el original.
        return true;
    }
  }
}

/**
 * `ScriptCmd_If` — scriptcmds.cpp:3957. Con un parámetro es la verdad de un
 * número (con `!` delante para negar); con tres, una comparación.
 *
 * Y la comparación **de igualdad es de CADENA** (`FStrEq`), no de número: sólo
 * `<`, `>`, `<=`, `>=`, `==` y `!=` pasan por `GetNumeric`. O sea que
 * `if ( X equals 1 )` con X a «1.00» es FALSO y `if ( X == 1 )` es cierto.
 */
/**
 * Los segundos de `repeatdelay` de un evento, o `null` si no tiene.
 *
 * Se busca **sólo en el primer nivel** del evento, que es donde el lector del
 * motor lo ve: `repeatdelay` es una directiva del cargador y el cargador lee
 * líneas, no bloques. Un `repeatdelay` dentro de un `if` sí se ejecuta al
 * correr —eso lo hace `ScriptCmd_RepeatDelay`— pero no arma nada al cargar.
 */
export function repeticionDe(evento) {
  for (const c of evento?.cmds ?? []) {
    if (c.nombre !== "repeatdelay") continue;
    return String(c.params?.[0] ?? "");
  }
  return null;
}

export function condicion(params) {
  if (params.length === 1) {
    let v = String(params[0] ?? "");
    let alReves = false;
    // El `!` se quita y se vuelve a resolver; aquí ya viene resuelto, así que
    // se mira el resultado. Un nombre sin poner resuelve a sí mismo, y `atoi`
    // de un nombre es 0: `if !NO_HAIL` con NO_HAIL sin poner da CIERTO.
    if (v.startsWith("!")) { alReves = true; v = v.slice(1); }
    return (enteroDe(v) !== 0) !== alReves;
  }
  if (params.length >= 3) {
    const [a, op, b] = [String(params[0] ?? ""), String(params[1] ?? ""), String(params[2] ?? "")];
    switch (op) {
      case "equals": return a === b;
      case "isnot": case "!equals": return a !== b;
      case "<": return numDe(a) < numDe(b);
      case ">": return numDe(a) > numDe(b);
      case "<=": return numDe(a) <= numDe(b);
      case ">=": return numDe(a) >= numDe(b);
      case "==": return numDe(a) === numDe(b);
      case "!=": return numDe(a) !== numDe(b);
      case "startswith": return a.startsWith(b);
      case "contains": return a.includes(b);
      case "!startswith": return !a.startsWith(b);
      case "!contains": return !a.includes(b);
      // Un operador que no está en la tabla deja `iCompareType` a 0, o sea
      // `equals`. scriptcmds.cpp:3980.
      default: return a === b;
    }
  }
  // «If I get a parameter error, just fall through like a normal command»
  // — scriptcmds.cpp:4045.
  return true;
}

/** Los argumentos de un getter, por comas, respetando paréntesis anidados. */
export function partirArgumentos(dentro) {
  const fuera = [];
  let n = 0, actual = "";
  for (const ch of String(dentro ?? "")) {
    if (ch === "(") n++;
    if (ch === ")") n--;
    if (ch === "," && n === 0) { fuera.push(actual.trim()); actual = ""; continue; }
    actual += ch;
  }
  if (actual.trim() || fuera.length) fuera.push(actual.trim());
  return fuera;
}

/** Un entorno que no hace nada: el que usan las pruebas del análisis. */
export function entornoVacio() {
  return {
    llevaObjeto: () => false,
    leerMision: () => null,
    ponerMision: () => {},
    limpiarMisiones: () => {},
    volcarMisiones: () => {},
    hablar: () => {},
    animar: () => {},
    aviso: () => {},
    darOro: () => {},
    darObjeto: () => {},
    registrarOpcion: () => {},
    llamarExterno: () => {},
    programar: () => {},
    propiedad: () => "0",
    distancia: () => 0,
    // `$get_token` ya NO pasa por aquí: es trabajo de cadenas, no del mundo, y
    // tenerlo de gancho es lo que dejó el `split(";")` del 33 sin medir durante
    // doce experimentos. Ahora lo hace `partirTokens`, que es el del motor.
    azar: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
    // ── el 43 ──────────────────────────────────────────────────────────────
    /** `$randf`: el flotante, por su puerta, para que el dado sea inyectable. */
    azarFlotante: (a, b) => a + Math.random() * (b - a),
    /** `say`: un `.wav` y cuánto se abre la boca. `null` = sólo boca. */
    decir: () => {},
    /** `playsound <ent> <canal> <archivo>`. */
    sonar: () => {},
    /** `setprop <ent> <prop> <valor>`. */
    ponerPropiedad: () => {},
    /** `roam 0|1`: `MONSTER_ROAM`. */
    pasear: () => {},
    /** `setmovedest`: a dónde va, o `null` para pararlo. */
    irA: () => {},
    /** `setmoveanim`: `m_MoveAnim`. */
    animacionDeAndar: () => {},
    // ── el 44: las tiendas ─────────────────────────────────────────────────
    crearTienda: () => {},
    anadirALaTienda: () => {},
    ofrecerTienda: () => {},
    quitarDeLaTienda: () => {},
    // ── el 45: buscar una entidad por su nombre, y quitarla ────────────────
    /** `$get_by_name`: el asa `PentP(i,d)`, o `null` si no hay nadie así. */
    porNombre: () => null,
    /** `deleteent`/`deleteme`. `ref` es `null` cuando es `deleteme`. */
    borrarEntidad: () => {},
    // ── el 46: el andamiaje de menú ────────────────────────────────────────
    /** Las `Listas` de OTRA entidad, cuando el guion pasa un asa delante. */
    listasDe: () => null,
    /** `menuitem.remove <id>`: quita TODAS las opciones con ese id. */
    quitarOpcion: () => {},
    /** `menu.open <jugador>`. */
    abrirMenu: () => {},
    /** `catchspeech <evento> <palabras...>`. */
    escuchar: () => {},
    /** Los seis mensajes de colores y `consolemsg`; `cual` es el nombre exacto. */
    mensajeAlJugador: () => {},
    /** `helptip <player|all> <tipname> <title> <text...>`: los params tal cual. */
    consejo: () => {},
    /** `givehp`/`givemp <ent> <cantidad>`: `que` es "vida" o "mana". */
    dar: () => {},
    // ── el 67 ──────────────────────────────────────────────────────────────
    /**
     * `usetrigger <nombre>`: un `FireTargets` por nombre en el bus del mapa,
     * con `USE_TOGGLE`. Un nombre, una llamada.
     */
    usarDisparador: () => {},
  };
}
