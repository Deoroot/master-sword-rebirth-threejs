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
      // EL 96: LAS MARCAS ENTRE CORCHETES SON VARIAS Y NO SON TODAS ÁMBITO.
      //
      //     if (Param == "[client]") ...  else if (Param == "[server]") ...
      //     else if (Param == "[override]") Override = true;  else Name = Param;
      //                                            script.cpp:5180-5191
      //
      // Aquí se leía la PRIMERA como ámbito y la segunda palabra como nombre,
      // así que `{ [override] elm_activate_effect` salía con ámbito
      // «override» y sin anular nada: el fénix registraba su resistencia al
      // fuego por el evento de la plantilla aunque el suyo dijera que no.
      // Quién borra al padre es `resolverGuion` (src/play/cargador.js).
      let ambito = "shared";
      let anula = false;
      let nombre = "";
      for (const p of tras) {
        if (p === "[client]") ambito = "client";
        else if (p === "[server]") ambito = "server";
        else if (p === "[shared]") ambito = "shared";
        else if (p === "[override]") anula = true;
        else nombre = p;
      }
      // Sin nombre es el bloque de constantes de la cabecera del script.
      evento = { nombre, ambito, cmds: [], linea: n + 1, ...(nombre ? {} : { cabecera: true }), ...(anula ? { anula: true } : {}) };
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

  // EL 97: EL `//` SE CORTA ANTES DE ANALIZAR, ESTÉ DONDE ESTÉ.
  //
  //     if (ch == '/' && (p + 1) < pCur && *(p + 1) == '/')
  //       break;                                   script.cpp:5118-5121
  //
  // `ParseScriptFile` copia cada línea hasta el primer `//` y SÓLO ENTONCES
  // llama a `ParseLine`, así que el corte de `palabras` (`:5637`, al principio
  // de una palabra) nunca ve un `//` pegado: ya no está. Aquí sólo existía el
  // segundo, y `{ [server] npc_struck//Hit by someone` se llamaba
  // «npc_struck//Hit» —y desde el 96, que se queda con la ÚLTIMA palabra como
  // el motor, «someone»—; `addvelocity ent_laststruckbyme PUSH_VEL//Push` del
  // jabalí empujaba con una constante que no existe. 82 líneas en el mod, y
  // ninguna con `//` dentro de comillas (que el motor también cortaría).
  // `src/bsp/script.js` (`sinComentarios`) lo hacía bien desde siempre.
  for (let n = 0; n < lineas.length; n++) {
    const corte = lineas[n].indexOf("//");
    procesar(corte < 0 ? lineas[n] : lineas[n].slice(0, corte), n);
  }

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
 * `StringToVec` — sharedutil.cpp:115-124. El 89b.
 *
 *     if (sscanf(String, "(%f,%f,%f)", ...) < 3)
 *       if (sscanf(String, "(%f,%f)", ...) < 2)
 *         return g_vecZero;
 *
 * Se emula el `sscanf` y no una expresión regular «bonita», porque lo que
 * decide es lo que `sscanf` acepta y lo que no:
 *
 *   - el `(` es literal y va el PRIMERO: con un espacio delante no casa nada
 *     y el vector vale CERO;
 *   - `%f` sí se salta blancos delante del número, pero la `,` es literal y
 *     no: «(1 ,2,3)» se queda en un número y vale cero;
 *   - el `)` del final **no se comprueba**: «(1,2,3» son tres números;
 *   - y lo que no es un vector —un nombre de variable sin poner, que es lo
 *     que devuelve `GetVar`— vale (0,0,0), no un error.
 *
 * LO QUE NO SE PORTA, dicho: en la forma de dos números el motor no toca la
 * `z`, y `Vector() {}` no inicializa (src/game/server/hl/vector.h:67), así que
 * la `z` es lo que hubiera en la pila. Aquí es 0, como en `src/bsp/script.js`.
 *
 * Los tres van por `Math.fround` porque `Vector` es de `float`.
 */
export function vectorDeTexto(texto) {
  const s = String(texto ?? "");
  const leer = (k) => {
    const v = [];
    if (s[0] !== "(") return v;
    let i = 1;
    for (let n = 0; n < k; n++) {
      while (i < s.length && /\s/.test(s[i])) i++;            // `%f` salta blancos
      const m = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(s.slice(i));
      if (!m) break;
      v.push(Math.fround(parseFloat(m[0])));
      i += m[0].length;
      if (n < k - 1) { if (s[i] !== ",") break; i++; }        // la `,` es literal
    }
    return v;
  };
  const tres = leer(3);
  if (tres.length >= 3) return tres;
  const dos = leer(2);
  if (dos.length < 2) return [0, 0, 0];
  return [dos[0], dos[1], 0];
}

/**
 * `VecToString` — sharedutil.cpp:106-114: `"(%.2f,%.2f,%.2f)"`.
 *
 * Dos decimales SIEMPRE, que es lo que vuelve a leer el guion: un
 * `vectoradd` sobre «(1,2,3)» deja «(1.00,2.00,3.00)» aunque no sume nada, y un
 * `if ( V equals (1,2,3) )` de después ya no casa. Y `printf` imprime el signo
 * del cero negativo («-0.00»), que `toFixed` se come.
 *
 * NO MEDIDO: los empates exactos en la tercera cifra (0,125). `toFixed` sube y
 * el `printf` de glibc va al par; cuál de los dos usa el servidor depende de
 * dónde se compile, y no se ha comprobado.
 */
export function textoDeVector(v) {
  const f = (x) => (Object.is(x, -0) ? "-0.00" : Math.fround(x).toFixed(2));
  return `(${f(v[0])},${f(v[1])},${f(v[2])})`;
}

/**
 * `$relvel`: `vRight * x + vForward * y + vUp * z` con los tres vectores de
 * `MakeVectors(Angle)` (script.cpp:3621-3624). `MakeVectors` es el
 * `AngleVectors` de Quake, en grados y en este orden —pitch, yaw, roll—
 * (ReHLDS, engine/mathlib.cpp:208, `AngleVectors`):
 *
 *     forward = ( cp*cy,               cp*sy,               -sp   )
 *     right   = ( -sr*sp*cy + cr*sy,   -sr*sp*sy - cr*cy,   -sr*cp )
 *     up      = (  cr*sp*cy + sr*sy,    cr*sp*sy - sr*cy,    cr*cp )
 *
 * Todo en UNIDADES y ejes del motor (Z arriba). El 93.
 */
export function velocidadRelativa(angulos, rel) {
  const [p, y, r] = (angulos ?? [0, 0, 0]).map((g) => ((Number(g) || 0) * Math.PI) / 180);
  const sp = Math.sin(p), cp = Math.cos(p), sy = Math.sin(y), cy = Math.cos(y), sr = Math.sin(r), cr = Math.cos(r);
  const fw = [cp * cy, cp * sy, -sp];
  const rt = [-sr * sp * cy + cr * sy, -sr * sp * sy - cr * cy, -sr * cp];
  const up = [cr * sp * cy + sr * sy, cr * sp * sy - sr * cy, cr * cp];
  const [x, f, z] = [0, 1, 2].map((k) => Number(rel?.[k]) || 0);
  return [0, 1, 2].map((k) => rt[k] * x + fw[k] * f + up[k] * z);
}

/**
 * `RETURN_FLOAT` — iscript.h:224-228: `"%.2f"` de un `float`. El 91.
 *
 * Es lo que devuelve `$math`, y eso tiene consecuencias que se ven: el fin de
 * un efecto es `$math(add,EFFECT_STARTED,EFFECT_DURATION)`
 * (effects/base_effect.script:67), o sea **con dos decimales**, y la
 * comparación `game.time >= L_END_TIME` de detrás compara contra el número
 * redondeado. Mismo aviso que `textoDeVector` para los empates exactos.
 */
export function flotanteDelMotor(x) {
  const n = Number(x);
  const v = Math.fround(Number.isNaN(n) ? 0 : n);
  return Object.is(v, -0) ? "-0.00" : v.toFixed(2);
}

/**
 * `$math(<op>,<a>,<b>[,<c>])` — `ScriptGetter_MathReturn`, script.cpp:3271-3401.
 *
 * Lo que no se adivina, en el orden en que aparece:
 *
 *   1. Con menos de tres parámetros sólo existen `sqrt` y `sin` (:3279-3296);
 *      cualquier otra cosa avisa y devuelve «0».
 *   2. Las operaciones se eligen con `starts_with` (:3348-3394), así que
 *      «addition» es `add` y «multiplyx» es `multiply`.
 *   3. `divide` por cero —O DE cero— da 0, no infinito (:3365).
 *   4. `intdivide` y `mod` truncan los DOS lados a `int` antes (:3343-3344).
 *   5. `vectormultiply` decide con `isdigit` del primer carácter si el
 *      segundo es un número o un vector (:3336): «-2» se lee como vector y da
 *      cero. Es la misma rareza que el `vectormultiply` del 89b.
 *   6. Una operación que no está devuelve «0» (:3396-3400).
 *   7. El resultado es `RETURN_FLOAT`, «%.2f» — ver `flotanteDelMotor`.
 */
export function mathDelMotor(p) {
  const ps = p.map((x) => String(x ?? ""));
  if (ps.length < 3) {
    if (ps[0] === "sqrt" && ps.length > 1) return flotanteDelMotor(Math.fround(Math.sqrt(numDe(ps[1]))));
    if (ps[0] === "sin" && ps.length > 1) return flotanteDelMotor(Math.sin(numDe(ps[1])));
    return "0";
  }
  const op = ps[0];
  const eje = (v, cual, n) => [cual === "x" ? n : v[0], cual === "y" ? n : v[1], cual === "z" ? n : v[2]];
  if (op === "vectoradd") {
    const a = vectorDeTexto(ps[1]);
    // Con un eje que no sea x/y/z, `Result` se queda sin inicializar (:3311);
    // aquí vale cero y se dice.
    if (ps.length >= 4) {
      if (!["x", "y", "z"].includes(ps[2])) return textoDeVector([0, 0, 0]);
      const s = eje([0, 0, 0], ps[2], numDe(ps[3]));
      return textoDeVector([a[0] + s[0], a[1] + s[1], a[2] + s[2]]);
    }
    const b = vectorDeTexto(ps[2]);
    return textoDeVector([a[0] + b[0], a[1] + b[1], a[2] + b[2]]);
  }
  if (op === "vectormultiply") {
    const a = vectorDeTexto(ps[1]);
    if (ps.length >= 4) {
      if (!["x", "y", "z"].includes(ps[2])) return textoDeVector([0, 0, 0]);
      const m = eje([0, 0, 0], ps[2], numDe(ps[3]));        // `VecMultiply` con ceros: anula los otros dos
      return textoDeVector([a[0] * m[0], a[1] * m[1], a[2] * m[2]]);
    }
    if (/^[0-9]/.test(ps[2])) { const k = numDe(ps[2]); return textoDeVector([a[0] * k, a[1] * k, a[2] * k]); }
    const b = vectorDeTexto(ps[2]);
    return textoDeVector([a[0] * b[0], a[1] * b[1], a[2] * b[2]]);
  }
  const m1 = Math.fround(numDe(ps[1]));
  const m2 = Math.fround(numDe(ps[2]));
  const i1 = Math.trunc(m1);
  const i2 = Math.trunc(m2);
  let r;
  if (op.startsWith("add")) r = m1 + m2;
  else if (op.startsWith("subtract")) r = m1 - m2;
  else if (op.startsWith("multiply")) r = m1 * m2;
  else if (op.startsWith("divide")) r = m1 === 0 || m2 === 0 ? 0 : m1 / m2;
  else if (op.startsWith("intdivide")) r = i1 === 0 || i2 === 0 ? 0 : Math.trunc(i1 / i2);
  else if (op.startsWith("mod")) r = i1 === 0 || i2 === 0 ? 0 : i1 % i2;
  else if (op.startsWith("capvar")) {
    if (ps.length < 4) r = 0;
    else {
      r = numDe(ps[1]);
      const lo = numDe(ps[2]);
      const hi = numDe(ps[3]);
      if (r < lo) r = lo; else if (r > hi) r = hi;
    }
  } else return "0";
  return flotanteDelMotor(r);
}

/**
 * `$string_upto(<cadena>,<busca>[,<desde>])` y `$string_from(...)` — LA MISMA
 * función, `ScriptGetter_StringUpToOrFrom` (script.cpp:4116-4152), que se
 * separa por el nombre. Con `msstring::thru_substr` (stackstring.cpp:109-113).
 *
 * Las rarezas, que se portan porque deciden ramas:
 *
 *   - **Si no encuentra lo que busca, devuelve «0»**, no la cadena entera: el
 *     trozo sale igual que la cadena, no entra en la primera rama, y la
 *     segunda sólo casa si la cadena EMPIEZA por lo buscado (:4144). O sea que
 *     `$string_upto(abc,_)` vale «0». `base_dot` lo llama sólo tras un
 *     `contains '_effect'` (effects/base_dot.script:124-127), por eso no se ve.
 *   - Con `<desde>`, el trozo empieza en `desde` pero `$string_from` corta
 *     contando desde el principio de la cadena entera (:4141).
 */
export function cadenaHasta(nombre, p) {
  if (p.length < 2) return "0";
  const s = String(p[0]);
  const busca = String(p[1]);
  const desde = p.length >= 3 ? Math.max(0, Math.min(enteroDe(p[2]), s.length)) : 0;   // `atoi`
  const resto = s.slice(desde);
  const k = resto.indexOf(busca);                    // `strstr`; con «» da 0, como C
  const trozo = k >= 0 ? resto.slice(0, k) : resto;
  const hasta = nombre === "$string_upto";
  if (trozo !== s) {
    if (hasta) return trozo;
    if (trozo.length + busca.length >= s.length) return "";
    return s.slice(trozo.length + busca.length);
  }
  if (s.startsWith(busca)) return hasta ? "" : s.slice(busca.length);
  return "0";
}

/**
 * LAS DOS FORMAS DE HACER DAÑO DESDE UN GUION, partidas como el motor. El 91.
 *
 * Devuelve `null` si faltan parámetros (`ERROR_MISSING_PARMS`) o un objeto
 * con la forma y los números, SIN decidir nada del mundo: quién existe, a quién
 * se le acierta y cuánto le duele es del gancho `hacerDano` del entorno. Se
 * parte entero aunque hoy sólo se use la forma directa —la de los venenos—
 * porque el guion de un BICHO lo usará con las otras, y el parseo tiene que
 * ser el mismo para los dos.
 *
 * ── `xdodamage` — scriptcmds.cpp:7336-7466 (`CScript`, de cualquier guion) ──
 *
 *     XDODAMAGE <objetivo|(origen)> <alcance|aoe|(destino)|direct> <daño>
 *               <acierto|caída> <atacante> <infligidor> <habilidad|none> <tipo> [banderas]
 *
 *   - Siete parámetros como mínimo (:7342), pero LEE EL OCTAVO (`Params[7]`,
 *     el tipo) sin mirar (:7362), y las banderas las lee de `Params[8]` en
 *     cuanto hay OCHO (`if( Params.size() >= 8 )`, :7366): con ocho lee una
 *     casilla más allá del final de la lista. Es el caso de `base_dot`
 *     (effects/base_dot.script:64). Aquí, sin noveno no hay banderas.
 *   - Cuatro formas, por la PRIMERA LETRA de los dos primeros (:7385-7428):
 *     `(`+no`(` es en radio, `(`+`(` de punto a punto, `direct` directo, y lo
 *     demás una traza hacia delante.
 *   - Los multiplicadores son DEL ATACANTE (`Params[4]` hecho `CMSMonster`,
 *     :7348-7349), y el de acierto **no sirve**: se aplica a
 *     `flHitPercentage` (:7363) antes de que cada forma lo pise con
 *     `atof(Params[3])`. En radio el acierto es siempre 100 (:7397).
 *
 * ── `dodamage` — npcscript.cpp:1107-1238 (`CMSMonster`, sólo de un monstruo) ─
 *
 *     Normal:  <objetivo> <alcance> <daño> <acierto> [tipo]
 *     Directo: <objetivo> direct <daño> <acierto> <atacante> [tipo]
 *     Radio:   <origen> <radio> <daño> <acierto> [atenuación] [banderas] [tipo]
 *
 *   - El tipo por omisión es «generic» (:1117). Y en la directa con CINCO
 *     parámetros el tipo es **el asa del atacante**: `Params[4]` se lee como
 *     tipo (:1125-1127) y sólo el sexto lo pisa (:1139-1140).
 *   - El atacante es quien corre el guion, o su `ENT_EXPOWNER` si tiene
 *     (:1118-1120), y fuera del radio `Params[4]` lo sustituye SI EXISTE
 *     (:1189-1194) — en la directa también.
 *   - El alcance de la traza suma la media anchura de los dos (:1146-1157).
 *   - Los multiplicadores son de QUIEN CORRE el guion, y aquí el de acierto
 *     sí cuenta (:1163-1168).
 *   - Es de `CMSMonster`, y el jugador también lo es: un efecto pegado al
 *     jugador que hiciera `dodamage` lo haría COMO el jugador.
 */
export function leerDano(nombre, p) {
  const ps = p.map((x) => String(x ?? ""));
  const empiezaVector = (s) => String(s ?? "")[0] === "(";
  if (nombre === "xdodamage") {
    if (ps.length < 7) return null;
    const d = {
      comando: "xdodamage",
      dano: numDe(ps[2]),
      atacante: ps[4],
      infligidor: ps[5],
      habilidad: ps[6],
      tipo: ps[7] ?? "",
      multiplicaDe: "atacante",
      multiplicaAcierto: false,
      evento: null,
      sinCalcomania: false,
    };
    // Las banderas, partidas como `TokenizeString(..., ";")` (:7369).
    if (ps.length >= 9) {
      for (const b of partirTokens(ps[8])) {
        if (b.startsWith("dmgevent:")) d.evento = b.slice(9);
        if (b.startsWith("nodecal")) d.sinCalcomania = true;
      }
    }
    if (empiezaVector(ps[0]) && !empiezaVector(ps[1])) {
      return { ...d, forma: "radio", origen: vectorDeTexto(ps[0]), alcance: numDe(ps[1]), atenuacion: numDe(ps[3]), acierto: 100, reflectivo: true };
    }
    if (empiezaVector(ps[0]) && empiezaVector(ps[1])) {
      return { ...d, forma: "vector", origen: vectorDeTexto(ps[0]), destino: vectorDeTexto(ps[1]), acierto: numDe(ps[3]) };
    }
    if (ps[1] === "direct") return { ...d, forma: "directo", objetivo: ps[0], acierto: numDe(ps[3]) };
    // La traza: `flRange` lleva la media anchura del atacante (:7425-7427) y
    // `flDamageRange` no (:7431). Se dan los dos números; el gancho decide.
    return { ...d, forma: "traza", objetivo: ps[0], alcance: numDe(ps[1]), sumaMediaAnchuraDelAtacante: true, acierto: numDe(ps[3]) };
  }
  if (nombre === "dodamage") {
    if (ps.length < 4) return null;
    const d = {
      comando: "dodamage",
      dano: numDe(ps[2]),
      acierto: numDe(ps[3]),
      // `this`, o su `ENT_EXPOWNER` si lo tiene: lo resuelve el gancho.
      atacante: null,
      infligidor: null,
      habilidad: null,
      tipo: "generic",
      multiplicaDe: "yo",
      multiplicaAcierto: true,
    };
    if (ps.length >= 5 && !empiezaVector(ps[0])) d.tipo = ps[4];
    if (empiezaVector(ps[0])) {
      return {
        ...d, forma: "radio", origen: vectorDeTexto(ps[0]), alcance: numDe(ps[1]),
        atenuacion: ps.length >= 5 ? numDe(ps[4]) : 1,
        reflectivo: ps.length >= 6 && ps[5].includes("reflective"),
        tipo: ps.length >= 7 ? ps[6] : d.tipo,
      };
    }
    // Fuera del radio, el quinto parámetro también es el atacante, si existe.
    if (ps.length >= 5) d.atacante = ps[4];
    if (ps[1] === "direct") return { ...d, forma: "directo", objetivo: ps[0], tipo: ps.length >= 6 ? ps[5] : d.tipo };
    return { ...d, forma: "traza", objetivo: ps[0], alcance: numDe(ps[1]), sumaMediaAnchuraDeLosDos: true };
  }
  return null;
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
  // EL 96: dos comandos de OBJETO (genericitem.cpp:354 y :377). Sin gancho se
  // apuntan; el del objeto los tiene (src/play/guionobjeto.js).
  "registerarmor", "setdmg",
  // EL 98: `registercontainer` (genericitem.cpp:352 y :1699-1700). Igual.
  "registercontainer",
  // EL 97: comando de `CMSMonster` (npcscript.cpp:37 y :318-330), que el
  // jugador también es. Sin gancho se apunta; el del jugador lo tiene.
  "nopush",
  // El 83. `exit` NO existe en el motor y lo quitamos: `m_GlobalCmdHash` tiene
  // `exitevent` (scriptcmds.cpp:48) y `return`/`returndata` (:167), y en los
  // 2 884 guiones hay cero `exit` sueltos. El que corta un evento es
  // `exitevent`, y era el que faltaba. Ver el `case` para las tres patas.
  "return", "returndata", "exitevent",            // scriptcmds.cpp:167 y :48
  "dbg",                                          // no hace nada fuera del build de desarrollo
  // `npcscript.cpp`, comandos del NPC
  "saytext",                                      // npcscript.cpp:52 / :708
  // EL 95: el alcance de ese `saytext`. 207 líneas en 141 guiones del mod
  // (`saytextrange 1024` en 93, `2048` en 75), y el grito del aldeano y la
  // frase del guardia de Gate City entre ellas (doc/RED_95.md).
  "saytextrange",                                 // npcscript.cpp:53 / :724
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
  // ── el 89c: los que cambian el ESTADO del jugador desde su guion ─────────
  //
  // El intérprete NO decide nada de ellos: llama a un gancho del entorno y,
  // si el entorno no lo tiene, lo APUNTA (no hay `=> {}` en `entornoVacio`
  // para éstos, por el 66 y el 81). Quién los tiene y por qué, en
  // `src/play/guionjugador.js`.
  "drainstamina",                                 // scriptcmds.cpp:177 / :2988
  "gold", "addgold",                              // npcscript.cpp:31-32 / :234-252
  "removeitem",                                   // npcscript.cpp:49 / :621
  "setvelocity", "addvelocity",                   // scriptcmds.cpp:142-143 / :7155
  "setorigin",                                    // scriptcmds.cpp:144 / :4508
  "setstat",                                      // npcscript.cpp:54 / :1305
  "noxploss",                                     // NO EXISTE en el motor: ver su `case`
  // ── el 89b: los pequeños del intérprete que más pide el guion del jugador ─
  //
  // Puros de cadenas y vectores, más los dos sonidos «del servidor». Los
  // `svplay*` son LA MISMA función que `playsound` (scriptcmds.cpp:148-151) y
  // `sound.play3d` la misma que `svsound.play3d` (:152-153): se cuentan los
  // cuatro porque el motor los registra con su nombre. Ver cada `case`.
  "svplaysound", "svplayrandomsound",             // scriptcmds.cpp:150-151 / :4686
  "sound.play3d", "svsound.play3d",               // scriptcmds.cpp:152-153 / :6698
  "vectoradd", "vectormultiply", "vectorset",     // scriptcmds.cpp:106-109 / :7073-7144
  "strconc",                                      // scriptcmds.cpp:71 / :6813
  "token.add", "token.del",                       // scriptcmds.cpp:123-124 / :6865-6911
  "token.set", "token.scramble",                  // scriptcmds.cpp:125-126 / :6917-6987
  // ── los EFECTOS: un efecto es otro guion pegado a la entidad ──────────────
  // 825 `applyeffect` en los 2 884 guiones. La regla vive en
  // `src/play/efectos.js`; aquí sólo se reparte al gancho, y sin gancho se APUNTA.
  "applyeffect",                                  // scriptcmds.cpp:156 / :1865
  "removeeffect",                                 // scriptcmds.cpp:210 / :5068
  "removescript",                                 // scriptcmds.cpp:147 / :5114
  // ── EL 91: el veneno. Lo que piden los `effects/dot_*` ────────────────────
  // Medido corriendo `effects/dot_poison` sobre el jugador: sin éstos el
  // efecto se quitaba diciendo «You resist the poison.», una frase que el
  // juego no diría (el 65). Las DOS formas de hacer daño se parten enteras,
  // como el motor; qué forma llega a hacer daño lo decide el gancho
  // `hacerDano`, y lo que no, se apunta. Ver `leerDano` más abajo.
  "dodamage",                                     // npcscript.cpp:68 / :1107-1238 (de CMSMonster)
  "xdodamage",                                    // scriptcmds.cpp:81 / :7336-7466
  "scriptflags",                                  // scriptcmds.cpp:191 / :5265-5451
  "takedmg",                                      // npcscript.cpp:1057-1104 (de CMSMonster)
  // ── EL 93: EL SALTO DE LA ARAÑA (`monsters/spider.script:93-192`) ─────────
  // Lo que pide el camino del salto y no estaba: seguir a otra entidad, la
  // gravedad, la velocidad de andar, el ritmo de la animación y la pose de
  // reposo. Los cinco van a un gancho del entorno —el CUERPO del bicho, que lo
  // tiene la manada— y sin gancho se APUNTAN. Ver doc/SALTO_93.md.
  "setfollow",                                    // scriptcmds.cpp:119 / :5970-6000
  "gravity",                                      // scriptcmds.cpp:90  / :3461-3467
  "movespeed",                                    // npcscript.cpp:41   / :514-521
  "setanim.framerate",                            // npcscript.cpp:81   / :1585-1591
  "setidleanim",                                  // npcscript.cpp:56   / :1458-1469
  // ── EL 93 (piezas B y G): LA PANTALLA ─────────────────────────────────────
  // `effect` cuenta entero aunque sólo `screenfade` y `glow` tengan regla
  // (mseffects.cpp:877-926): los demás tipos —`screenshake`, `beam`…— siguen
  // llegando al gancho, que los rechaza, y se apuntan con el nombre del
  // comando. Ver su `case` y `src/play/efectospantalla.js`.
  "effect",                                       // scriptcmds.cpp:140 / :3040
  "hud.addstatusicon", "hud.killstatusicon",      // scriptcmds.cpp:60, :63 / :3706-3847
  "hud.killicons",                                // scriptcmds.cpp:62
  // EL 95: las imágenes, la otra mitad de `ScriptCmd_HudIcon` (doc/BRILLO_95.md).
  "hud.addimgicon", "hud.killimgicon",            // scriptcmds.cpp:61, :64 / :3765-3875
]);

/** Los `$getters` portados. `m_GlobalGetterHash`, script.cpp:41-170. */
export const GETTERS = new Set([
  "$item_exists",     // script.cpp:87
  "$get_quest_data",  // script.cpp:112
  "$int",             // script.cpp:123
  "$neg",             // script.cpp:82 / :3461-3471 — `-atof`, con «%.2f». El 96
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
  // ── EL 91: los de `effects/base_dot` y `effects/base_effect` ────────────
  "$get_takedmg",     // script.cpp:65  / :2569-2592 — el multiplicador, del ANFITRIÓN
  "$math",            // script.cpp:144 / :3271-3401 — «%.2f», como todo `RETURN_FLOAT`
  "$string_upto",     // script.cpp:119 / :4116-4152
  "$string_from",     // script.cpp:98  — la MISMA función, se separa por el nombre
  "$get_scriptflag",  // script.cpp:124 / :2322-2510
  "$pass",            // script.cpp:151 / :990-994
  // Pedido por el censo de los bichos (otra sesión, `doc/CENSO_BICHOS_91.md`):
  // `game_struck` lo usa en 544 guiones. Ver su `case`.
  "$can_damage",      // script.cpp:67  / :662-684
  // EL 93: el salto de la araña sale con `setvelocity ent_me $relvel(0,320,120)`
  // (spider.script:119). 610 de los 724 guiones con modelo lo piden.
  "$relvel",          // script.cpp:90  / :3597-3628
  // EL 95: el centro de casi todo `effect screenshake` es `$relpos(0,0,0)`.
  "$relpos",          // script.cpp:91  / :3557-3595
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
  "race",                                 // :1390 — EL 94, el guardia
  "nopush",                               // :1422 — EL 97, la inmunidad al aturdimiento
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
  constructor({ eventos = [], entorno = null, preload = [], nombre = "", ahora = () => 0, mapa = null, jugadores = null } = {}) {
    /**
     * `UTIL_NumPlayers()`, lo que contesta `game.players` (script.cpp:4595-4605).
     * El 89, por la misma vía que el `mapa` del 83: inyectado, y quien no lo
     * ponga se queda como antes. Ver la nota larga donde se resuelve.
     */
    this.jugadores = jugadores;
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
    // EL 97: y con «%.2f», que es `RETURN_FLOAT(gpGlobals->time)`
    // (script.cpp:4500-4503; iscript.h:224-228). A pelo, `base_effect`
    // comparaba un fin redondeado (`$math(add,…)`, :67) contra un reloj sin
    // redondear: con el reloj en 20,0999999 y el fin en «20.10», lo que queda
    // sale «0.00», `callevent 0.00` es «Can't call myself recursively»
    // (scriptcmds.cpp:2297) y **el efecto no se acababa nunca**. Medido con el
    // fénix: tres `effect_slow` vivos a la vez a los 50 s. Ver doc/ATURDIR_97.md.
    //
    // Y SIN `Math.fround`, a diferencia de `flotanteDelMotor`: el reloj del
    // motor empieza cerca de cero al cargar el mapa, y en este puerto hay
    // relojes que son `Date.now() / 1000` (src/red/partida.js:161), 1,7e9 s,
    // donde un `float` sólo distingue saltos de 128 s. Con `fround` el
    // servidor dejó de mover al jugador (test/red_27, «y el servidor le ha
    // movido de verdad»). El «%.2f» es lo que cuenta; la precisión del `float`
    // sería la de un reloj que este puerto no tiene.
    if (t === "game.time") { const n = Number(this.ahora()); return (Number.isFinite(n) ? n : 0).toFixed(2); }
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
    // ── EL 89: `game.players`, que son 193 usos en los 2 884 guiones ──────
    //
    //     else if (Name.starts_with("players"))
    //       if (Name.contains("totalhp")) RETURN_FLOAT(UTIL_TotalHP())
    //       else if (Name.contains("avghp")) RETURN_FLOAT(UTIL_AvgHP())
    //       else if (... "playersnb" || "noafk") RETURN_INT(UTIL_NumActivePlayers())
    //       else RETURN_INT(UTIL_NumPlayers())           script.cpp:4595-4605
    //
    // Lo destapó el consejo de la primera transición: `help/first_transition`
    // añade «.|Press enter to travel to this area» detrás de un
    // `if ( game.players == 1 )`, y sin esto el consejo salía CORTADO, sin decir
    // qué tecla pulsar. Se resuelven el número y las dos variantes que cuentan
    // jugadores; `totalhp` y `avghp` —31 usos— no, porque piden la vida de todos.
    //
    // Y SÓLO lo recibe el guion del jugador, como el `mapa` del 83. Los guiones
    // de NPC de los mapas que se juegan lo usan mucho —19 veces en Gate City, 9
    // en Edana, más 36 `totalhp`/`avghp` en cada uno, que es escalar la
    // dificultad con la gente—, y darles el número cambia cómo pelean en todos
    // los mapas: eso pide su propio experimento y sus medidas, no colarse en
    // éste. Hasta entonces, para ellos sigue siendo su propio nombre.
    if (t === "game.players" || t === "game.players.noafk" || t === "game.players.playersnb") {
      return this.jugadores ? String(this.jugadores()) : t;
    }
    // ── EL 93: `game.monster.<prop>` ES `$get(ent_me,<prop>)` ──────────────
    //
    //     TokenizeString(Name, Params, ".");  Name = Params[0];
    //     msstring FullProp = &FullName.c_str()[5 + Name.len() + 1];
    //     if ((Name == "entity" || Name == "monster" || ...) && m.pScriptedEnt)
    //       Value = m.pScriptedEnt->GetProp(m.pScriptedEnt, FullProp, Params);
    //                                            script.cpp:4692-4700
    //
    // La araña lo pide al caer del salto: `if( game.monster.onground )`
    // (spider.script:134). Sin resolver valía su propio nombre, `atoi` daba 0
    // y la araña **no aterrizaba nunca**: se volvía a llamar cada 0,001 s.
    //
    // SÓLO con el gancho `propiedadDeMi`, que hoy pone el entorno de un NPC
    // (npcguion.js), y SÓLO para las propiedades que ese gancho sabe contestar:
    // el resto —`game.monster.name.full`, `game.monster.race`…— sigue
    // valiendo su propio nombre, como hasta el 92. Contestar «0» a ésas sería
    // cambiar ramas que hoy nadie ha medido (el «You've slain» del 91, §5.3).
    if (t.startsWith("game.monster.") && this.entorno?.propiedadDeMi) {
      const r = this.entorno.propiedadDeMi(t.slice("game.monster.".length));
      if (r !== null && r !== undefined) return String(r);
    }
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
      // EL 96. `$neg(<valor>)`: `RETURN_FLOAT((-atof(Params[0])))` y «0» sin
      // parámetro (script.cpp:3461-3471). Sin él, `cat_resistances` del guion
      // del jugador (player/server/element_resist.script:87) sumaba el texto
      // sin resolver y NINGUNA resistencia elemental llegaba a `takedmg`.
      case "$neg": return a.length ? flotanteDelMotor(-numDe(a[0])) : "0";
      // ── EL 91 ────────────────────────────────────────────────────────────
      // `$math(<op>,<a>,<b>[,<c>])`, `$string_upto/from` y `$pass` son de
      // cadenas y números: la regla entera está en las funciones de abajo,
      // sin gancho. `$get_takedmg` y `$get_scriptflag` son de la ENTIDAD y van
      // a su gancho; sin él, se apunta y se devuelve el texto entero, que es
      // lo que el motor hace con un getter que no conoce (script.cpp:4741).
      case "$math": return mathDelMotor(a);
      case "$string_upto": case "$string_from": return cadenaHasta(nombre, a);
      // `$pass(<x>)` — script.cpp:990-994: devuelve el primer parámetro, que
      // ya llega resuelto (script.cpp:4418). Existe para pasar un `PARAMn` de
      // un evento a otro sin que se resuelva dos veces.
      case "$pass": return a.length ? String(a[0]) : "";
      case "$get_takedmg": {
        if (!e.recibeDano) { this.anotarNoSoportado("getter", `${nombre} (sin gancho)`); return texto; }
        return String(e.recibeDano(String(a[0] ?? ""), String(a[1] ?? "")) ?? "-1");
      }
      // `$can_damage(<objetivo>,[quien])` — script.cpp:662-684. OJO, que el
      // comentario de encima (:658) dice «1 si <objetivo> puede herir a
      // [quien]» y el CÓDIGO hace lo contrario: `ThisEnt->CanDamage(ThatEnt)`
      // con `ThisEnt` = [quien] o el que llama y `ThatEnt` = <objetivo>. Manda
      // el código. Si alguno de los dos no existe, «0» (:681).
      case "$can_damage": {
        if (!a.length) return "0";
        if (!e.puedeHerir) { this.anotarNoSoportado("getter", `${nombre} (sin gancho)`); return texto; }
        const r = e.puedeHerir(a.length >= 2 ? String(a[1]) : "ent_me", String(a[0]));
        if (r === null || r === undefined) { this.anotarNoSoportado("getter", `${nombre} (entidad desconocida)`); return "0"; }
        return r ? "1" : "0";
      }
      case "$get_scriptflag": {
        const b = e.banderas?.(String(a[0] ?? "")) ?? null;
        if (!b) { this.anotarNoSoportado("getter", `${nombre} (entidad sin banderas)`); return texto; }
        return b.leer(String(a[1] ?? ""), String(a[2] ?? ""), { apuntar: (x) => this.anotarNoSoportado("getter", x) });
      }
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

      // ── EL 93: `$relvel(<derecha,adelante,arriba>)` ─────────────────────
      //
      //     if (Params[0].c_str()[0] != '(') {
      //       Angle = (IsPlayer() || FL_FLY|FL_SWIM) ? v_angle : pev->angles;
      //       RelVel = StringToVec(&FullName.c_str()[7]); }
      //     else { Angle = StringToVec(Params[0]); RelVel = StringToVec(Params[1]); }
      //     MakeVectors(Angle, vForward, vRight, vUp);
      //     Final = vRight * RelVel.x + vForward * RelVel.y + vUp * RelVel.z;
      //                                            script.cpp:3605-3628
      //
      // Es una VELOCIDAD, no un punto: no suma el origen (eso es `$relpos`).
      // Los ángulos del propio bicho los da el gancho `angulosDeMi` —el rumbo
      // vive en la manada—; sin él se apunta y se devuelve el texto entero,
      // que es lo que el motor hace con un getter que no conoce.
      case "$relvel": {
        if (!a.length) return "0";                                  // :3628
        let ang, rel;
        if (String(a[0]).startsWith("(")) {
          ang = vectorDeTexto(String(a[0]));
          rel = vectorDeTexto(String(a[1] ?? ""));
        } else {
          if (!e.angulosDeMi) { this.anotarNoSoportado("getter", `${nombre} (sin ángulos del bicho)`); return texto; }
          ang = e.angulosDeMi();
          // `&FullName.c_str()[7]`: lo que va detrás de «$relvel», paréntesis incluidos.
          rel = vectorDeTexto(texto.slice(7));
        }
        return textoDeVector(velocidadRelativa(ang, rel));
      }

      // ── EL 95: `$relpos(<derecha,adelante,arriba>)` ─────────────────────
      //
      //     if (m.pScriptedEnt && Params.size() >= 1) {
      //       if (Params[0].c_str()[0] != '(') {
      //         StartPos = modelindex ? Center() : pev->origin;
      //         Angle = pev->angles; PosString = FullName.substr(7); }
      //       else { Angle = StringToVec(Params[0]); PosString = Params[1];
      //              StartPos = g_vecZero; }
      //       RETURN_VECTOR(StartPos + GetRelativePos(Angle, StringToVec(PosString))) }
      //     else return "0";                       script.cpp:3564-3595
      //
      // El hermano de `$relvel` con el ORIGEN sumado, y con `pev->angles` SIEMPRE
      // —no la vista del jugador, que es lo que elige `$relvel`—.
      // `GetRelativePos` es la misma suma que `$relvel` (sharedutil.cpp:134-145).
      // El origen lo da el gancho `origenDeMi` (unidades y ejes del motor, el
      // `Center()` de la caja); el entorno que no lo tenga lo apunta y devuelve
      // el texto entero, como antes de existir el getter.
      case "$relpos": {
        if (!a.length) return "0";                                  // :3594
        let ang, rel, base;
        if (String(a[0]).startsWith("(")) {
          ang = vectorDeTexto(String(a[0]));
          rel = vectorDeTexto(String(a[1] ?? ""));
          base = [0, 0, 0];
        } else {
          if (!e.origenDeMi || !e.angulosDeMi) { this.anotarNoSoportado("getter", `${nombre} (sin origen ni ángulos de la entidad)`); return texto; }
          base = e.origenDeMi();
          ang = e.angulosDeMi();
          rel = vectorDeTexto(texto.slice(7));
        }
        const d = velocidadRelativa(ang, rel);
        return textoDeVector([0, 1, 2].map((k) => (Number(base?.[k]) || 0) + d[k]));
      }

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
        // EL 91: o que el entorno diga que la sabe contestar. Es para las que
        // sólo tiene sentido contestar donde hay con qué —`scriptvar`,
        // `relationship`, `index` en el entorno de un EFECTO—: meterlas en
        // `PROPIEDADES` haría que el entorno de un NPC, que no las sabe,
        // contestara «0» callado en vez de apuntarlas.
        if (!prop.startsWith("skill.") && !PROPIEDADES.has(prop) && !e.propiedadesPropias?.has?.(prop)) {
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
      this.correrRepeticion(r, ahora);
      n++;
    }
    return n;
  }

  /**
   * UNA vuelta de un evento con `repeatdelay`, y su siguiente cita. El 93 la
   * saca de `pasoDeRepeticiones` para que el guion de un BICHO, que no tiene
   * reloj propio sino el `RelojDeGuiones` de la partida, corra la MISMA vuelta
   * (npcguion.js, `armarRepeticionesDeBicho`): dos copias de esto serían dos
   * reglas para el mismo `repeatdelay`.
   *
   * @returns los segundos hasta la siguiente vuelta.
   */
  correrRepeticion(r, ahora = 0) {
    const ev = { nombre: r.evento.nombre, locales: new Map(), params: [], parar: false, repetirEn: null };
    this.rastro.push({ evento: r.evento.nombre, params: [] });
    this.ejecutarLista(r.evento.cmds, ev);
    // Se vuelve a armar con lo que el `repeatdelay` de ESTA vuelta haya
    // dicho: el guion puede cambiarlo —la regeneración le resta 6 segundos
    // con el anillo de sangre— y el motor lo relee cada vez.
    r.cada = ev.repetirEn ?? r.cada;
    r.cuando = ahora + r.cada;
    return r.cada;
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

      // EL 95. `saytextrange <unidades|default>` — npcscript.cpp:724-737. Sin
      // parámetro, `ERROR_MISSING_PARMS` y nada. Sólo lo tiene quien habla con
      // alcance (el entorno de un NPC); los demás lo apuntan.
      case "saytextrange":
        if (!params.length) return true;
        if (!e.cambiarAlcanceDeVoz) { this.anotarNoSoportado("comando", c.nombre); return true; }
        e.cambiarAlcanceDeVoz(String(params[0]));
        return true;

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
      //
      // ── EL 89b: `svplaysound` Y `svplayrandomsound` ─────────────────────
      //
      // Están registrados con la MISMA función (scriptcmds.cpp:148-151), y el
      // cuerpo mira el nombre en tres sitios:
      //
      //   1. `Cmd.Name().starts_with("sv")` (:4725) elige `EMIT_SOUND2` sobre
      //      la entidad —el sonido la SIGUE y puede hacer bucle— en vez de
      //      `ClXPlaySoundAll` en su origen. Se le pasa a `sonar` como
      //      `servidor: true`; quien dibuja decide si le importa.
      //   2. Al cortar (volumen 0) el del servidor manda `common/null.wav` y no
      //      el sonido pedido (:4781 contra :4794).
      //   3. El sorteo se compara con los dos nombres aleatorios (:4730) y la
      //      atenuación y el tono con `contains("random")` (:4739).
      //
      // Y uno más que no está aquí: el cargador los precachea al leerlos
      // (script.cpp:5490-5491), que en un navegador no significa nada.
      case "svplaysound": case "svplayrandomsound":
      case "playsound": case "playrandomsound": {
        if (params.length < 2) return true;          // `Params.size() >= 2`
        const delServidor = c.nombre.startsWith("sv");   // :4725
        const aleatorio = c.nombre.includes("random");   // :4730 y :4739
        const canal = enteroDe(params[0]);
        let siguiente = 1;
        let volumen = -1;
        if (/^\d/.test(String(params[1]))) {
          volumen = Math.min(1, Math.max(0, numDe(params[1]) / 10));
          siguiente++;
        }
        let cual = params.length > siguiente ? String(params[siguiente]) : "common/null.wav";
        if (aleatorio) {
          // `Params[NextParm + RANDOM_LONG(0, Params.size() - (Volume > -1 ? 3 : 2))]`
          const tope = params.length - (volumen > -1 ? 3 : 2);
          cual = String(params[siguiente + e.azar(0, Math.max(0, tope))] ?? cual);
        }
        if (cual === "none") return true;
        // El del servidor corta con `common/null.wav` (:4781); el otro manda
        // el sonido pedido a 0,001 (:4794).
        if (delServidor && volumen === 0) cual = "common/null.wav";
        e.sonar(cual, {
          canal,
          // Sin volumen el motor no toca `Volume` y cae por la rama de abajo
          // con `SndVolume`, el del bicho. Aquí eso es «el que tenga».
          //
          // CORRECCIÓN DEL 89b, ANOTADA Y NO APLICADA: en esta fuente no hay
          // «rama de abajo». Las dos emisiones están DENTRO de
          // `if (Volume > -1)` (scriptcmds.cpp:4754-4797), así que la forma
          // vieja —sin volumen— **no suena** en el build de Xash3D. No se
          // cambia aquí porque cambia lo que se oye en partida y pide su
          // propia medida (cuántas formas viejas quedan DESPUÉS de resolver
          // variables: en texto crudo son 342 de 3 224 líneas).
          volumen: volumen > -1 ? volumen : null,
          corta: volumen === 0,
          // La atenuación y el tono sólo se leen en la forma NO aleatoria
          // (`if (!Cmd.Name().contains("random"))`, :4737).
          atenuacion: !aleatorio && params.length > 3 ? numDe(params[3]) : null,
          tono: !aleatorio && params.length > 4 ? numDe(params[4]) : null,
          servidor: delServidor,
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
      // EL 95: el texto es TODO lo que va detrás del título, juntado con un
      // espacio (`for (i…) { if (i) sTemp += " "; sTemp += Params[i + 2]; }`,
      // scriptcmds.cpp:4083-4087), y con menos de tres no hay mensaje
      // (`if (Params.size() >= 3)`, :4061). Hasta aquí se quedaba con la
      // primera palabra: `infomsg all Title some words` decía «some».
      case "infomsg":
        if (params.length < 3) return true;
        e.aviso(params[0], params[1], params.slice(2).join(" "));
        return true;

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

      // ── EL 89b: los pequeños del intérprete ─────────────────────────────
      //
      // Todos escriben con `SetVar(Cmd.m_Params[1], …)`, o sea con el nombre
      // CRUDO y no con el `Params[0]` resuelto —igual que `stradd`—, y todos
      // LEEN `Params[0]` ya resuelto. Eso tiene una consecuencia que se porta
      // tal cual: sobre una variable que no existe, `Params[0]` es **su propio
      // nombre** (script.cpp:4741), y `strconc`/`token.add` lo pegan delante.
      // `stradd` lo comprueba (:6797-6800) y éstos no.
      //
      // Un `Params[2]` que no existe es memoria de más allá de la lista
      // (`mslist::operator[]` no comprueba, stackstring.h:86-89): aquí se lee
      // como cadena vacía, o sea `atof` = 0.
      //
      // `sound.play3d` / `svsound.play3d <sonido> <volumen> <origen> [atenuación] [canal] [tono]`
      // scriptcmds.cpp:6698-6716. Las dos son la misma función (:152-153); la
      // `sv` sólo cambia el precache del cargador (script.cpp:5492, 5506).
      //
      // Ojo con el ORDEN: el comentario de encima del motor dice
      // `[attenuation] [pitch]` y el código lee **el canal en el 5.º y el tono
      // en el 6.º** (:6703-6704); el 4.º es la atenuación (:6702). Los guiones escriben lo que lee el código:
      // `svsound.play3d magic/pulsemachine_noloop.wav 8 PLR_LCOD_POS 0.8 5 100`.
      // Y a diferencia de `playsound`: **sin tope** del volumen, sin saltarse
      // `none` y sin «0 corta el canal»; es un `UTIL_EmitAmbientSound` crudo
      // (global.cpp:774-783).
      case "sound.play3d": case "svsound.play3d": {
        if (params.length < 3) return true;          // `ERROR_MISSING_PARMS`
        e.sonarEn(String(params[0]), {
          volumen: numDe(params[1]) / 10,
          origen: vectorDeTexto(params[2]),
          atenuacion: params.length >= 4 ? numDe(params[3]) : null,   // `ATTN_NORM`
          canal: params.length >= 5 ? enteroDe(params[4]) : 0,
          tono: params.length >= 6 ? numDe(params[5]) : null,         // `PITCH_NORM`
        });
        return true;
      }

      // `vectoradd <vec> <vec>` | `vectoradd <vec> <x|y|z> <cantidad>` |
      // `vectoradd <destino> <vec> <vec>`. scriptcmds.cpp:7073-7092.
      //
      // La componente se reconoce con `==`, que en `msstring` es `strcmp`
      // (stackstring.cpp:53-55): `X` mayúscula NO es una componente, y cae a
      // la suma de vectores con «X» leído como vector, o sea cero.
      //
      // La forma de TRES vectores ignora el valor del primero: suma el 2.º y
      // el 3.º y lo guarda en el 1.º. Son 6 de las 891 líneas del juego.
      case "vectoradd": {
        if (params.length < 2) return true;
        const comp = { x: 0, y: 1, z: 2 }[params[1]];
        let r;
        if (comp !== undefined) {
          const d = [0, 0, 0];
          d[comp] = numDe(params[2] ?? "");
          r = vectorDeTexto(params[0]).map((a, i) => Math.fround(a + d[i]));
        } else {
          const [a, b] = params.length < 3 ? [params[0], params[1]] : [params[1], params[2]];
          const va = vectorDeTexto(a), vb = vectorDeTexto(b);
          r = va.map((x, i) => Math.fround(x + vb[i]));
        }
        this.ponerVar(c.params[0], textoDeVector(r), ev);
        return true;
      }

      // `vectormultiply <vec> <vec|número>` | `vectormultiply <vec> <x|y|z> <factor>`
      // scriptcmds.cpp:7098-7125.
      //
      // DOS COSAS DEL MOTOR QUE PARECEN FALLOS Y SE PORTAN:
      //
      //   1. Con componente, multiplica por `Vector(f, 0, 0)` componente a
      //      componente (`VecMultiply`, :37): **las otras dos se van a cero**.
      //      `vectormultiply V x 2` sobre (1,2,3) da (2,0,0). Ningún guion del
      //      juego usa esa forma (0 de 23), así que nadie lo sufre.
      //   2. Escalar o vector se decide con `isdigit(Params[1][0])`: un factor
      //      NEGATIVO o que empiece por punto («-0.5», «.5») no es un dígito, se
      //      lee como vector, `StringToVec` da cero, y el resultado es (0,0,0).
      //
      // Con tres parámetros mira `isdigit` del SEGUNDO —el que debería ser un
      // vector— y no del tercero; se porta así.
      case "vectormultiply": {
        if (params.length < 2) return true;
        const comp = { x: 0, y: 1, z: 2 }[params[1]];
        const porVector = (a, b) => a.map((x, i) => Math.fround(x * b[i]));
        const porNumero = (a, f) => a.map((x) => Math.fround(x * f));
        const digito = (s) => /^\d/.test(String(s ?? ""));
        let r;
        if (comp !== undefined) {
          const d = [0, 0, 0];
          d[comp] = numDe(params[2] ?? "");
          r = porVector(vectorDeTexto(params[0]), d);
        } else if (params.length < 3) {
          r = digito(params[1]) ? porNumero(vectorDeTexto(params[0]), numDe(params[1]))
            : porVector(vectorDeTexto(params[0]), vectorDeTexto(params[1]));
        } else {
          r = digito(params[1]) ? porNumero(vectorDeTexto(params[1]), numDe(params[2]))
            : porVector(vectorDeTexto(params[1]), vectorDeTexto(params[2]));
        }
        this.ponerVar(c.params[0], textoDeVector(r), ev);
        return true;
      }

      // `vectorset <vec> <x|y|z> <valor>` — scriptcmds.cpp:7130-7144.
      //
      // Con una componente que no es `x`, `y` ni `z` el motor avisa por consola
      // y **escribe igual**: el vector tal cual, pero ya pasado por
      // `VecToString`. O sea que un `vectorset` mal escrito no deja la variable
      // como estaba: la reformatea, y si no era un vector la deja a cero.
      // El juego lo tiene una vez (`vectorset … $relvel(ATK_ANG,MY_VEL)`).
      case "vectorset": {
        if (params.length < 2) return true;
        const v = vectorDeTexto(params[0]);
        const comp = { x: 0, y: 1, z: 2 }[params[1]];
        // Sin componente válida el motor avisa (`MSErrorConsoleText`, :7139) y
        // NO se apunta como hueco del puerto: es un fallo del guion.
        if (comp !== undefined) v[comp] = Math.fround(numDe(params[2] ?? ""));
        this.ponerVar(c.params[0], textoDeVector(v), ev);
        return true;
      }

      // `strconc <var> <cosas...>` — scriptcmds.cpp:6813-6833.
      //
      //     sTemp += Params[0];
      //     for (i = 0; i < Params.size() - 1; i++) { if (i) sTemp += " "; sTemp += Params[i + 1]; }
      //
      // O sea: el valor que ya tenía, PEGADO al primero, y luego los demás con
      // un espacio. Los guiones cuentan con ello —`local MSG_TITLE "HP LIMIT
      // is "` y luego `strconc MSG_TITLE $int(CVAR_HP_LIMIT) hp`
      // (player/player_main.script:933-934)—. Sobre una variable sin poner
      // pega su NOMBRE delante; ver la cabecera de este bloque.
      case "strconc": {
        if (params.length < 2) return true;
        let s = String(params[0]);
        for (let i = 0; i < params.length - 1; i++) {
          if (i) s += " ";
          s += String(params[i + 1]);
        }
        this.ponerVar(c.params[0], s, ev);
        return true;
      }

      // `token.add <lista> <valor>` — scriptcmds.cpp:6865-6880. Un `;` sólo si
      // la lista no estaba vacía. Sin `TokenizeString`: es concatenar.
      case "token.add": {
        if (params.length < 2) return true;
        let s = String(params[0]);
        if (s.length) s += ";";
        s += String(params[1]);
        this.ponerVar(c.params[0], s, ev);
        return true;
      }

      // `token.del <lista> <índice>` — scriptcmds.cpp:6885-6911.
      //
      // Parte con `TokenizeString` —`partirTokens`, que CORTA en el primer
      // hueco— y vuelve a pegar, así que borrar de «a;;b;c» deja sólo lo de
      // antes del hueco. Fuera de rango **no escribe nada** (el `SetVar` está
      // dentro del `if`, :6896-6906).
      case "token.del": {
        if (params.length < 2) return true;
        const t = partirTokens(params[0]);
        const i = enteroDe(params[1]);
        if (i >= 0 && i < t.length) {
          t.splice(i, 1);
          this.ponerVar(c.params[0], t.join(";"), ev);
        }
        return true;
      }

      // `token.set <lista> <índice> <valor>` — scriptcmds.cpp:6947-6984. Igual
      // que `token.del` —fuera de rango no escribe—, y pide sólo DOS
      // parámetros aunque lea el tercero (:6952 contra :6959).
      case "token.set": {
        if (params.length < 2) return true;
        const t = partirTokens(params[0]);
        const i = enteroDe(params[1]);
        if (i >= 0 && i < t.length) {
          t[i] = String(params[2] ?? "");
          this.ponerVar(c.params[0], t.join(";"), ev);
        }
        return true;
      }

      // `token.scramble <lista>` — scriptcmds.cpp:6917-6940. Saca uno al azar
      // cada vez (`RANDOM_LONG(0, size - 1)`) y le pega **un `;` detrás
      // siempre**: «a;b» sale «b;a;», con el punto y coma colgando. Un
      // `token.add` de después añade otro y queda «b;a;;c», que para
      // `TokenizeString` acaba en la «a».
      case "token.scramble": {
        if (!params.length) return true;
        const t = partirTokens(params[0]);
        let s = "";
        const n = t.length;
        for (let k = 0; k < n; k++) {
          const r = e.azar(0, t.length - 1);
          s += `${t[r]};`;
          t.splice(r, 1);
        }
        this.ponerVar(c.params[0], s, ev);
        return true;
      }

      // ── EL 89c: LO QUE CAMBIA EL ESTADO DEL JUGADOR ──────────────────────
      //
      // Ninguno decide nada aquí: el intérprete sólo parte los parámetros
      // como el motor y llama al gancho. Si el entorno NO tiene el gancho —el
      // de un NPC o el de un objeto, hoy— se APUNTA en vez de tragarse: un
      // `=> {}` por omisión es donde una regla vive sin correr (el 66, el 81).

      // `drainstamina <objetivo> <cantidad>` — scriptcmds.cpp:2988-3009. El
      // servidor NO resta: le manda al cliente `WRITE_LONG(Amt)` con un
      // `float`, o sea la cantidad TRUNCADA a entero (:2996-2998), y el
      // cliente la resta con tope en [0, máximo] (clplayer.cpp:131-136,
      // :1358-1360). Negativa, suma: `-1000` es «llénalo».
      case "drainstamina": {
        if (params.length < 2) return true;          // `ERROR_MISSING_PARMS`
        if (!e.drenarAguante) { this.anotarNoSoportado("comando", c.nombre); return true; }
        e.drenarAguante(String(params[0]), Math.trunc(numDe(params[1])));
        return true;
      }

      // `gold <n>` pone y `addgold <n>` suma — npcscript.cpp:234-252. Los dos
      // son de `CMSMonster`: el oro de QUIEN CORRE el guion, sin objetivo.
      case "gold": case "addgold": {
        if (!params.length) return true;             // `ERROR_MISSING_PARMS`
        if (!e.oroPropio) { this.anotarNoSoportado("comando", c.nombre); return true; }
        e.oroPropio(c.nombre === "gold" ? "poner" : "sumar", enteroDe(params[0]));
        return true;
      }

      // `removeitem <nombre>` — npcscript.cpp:621-634, con «Thothie - this
      // doesn't work» encima. Busca por SUBCADENA del nombre (`strstr`,
      // msmonstershared.cpp:196-221). El gancho hace la búsqueda.
      case "removeitem": {
        if (!params.length) return true;
        if (!e.quitarObjeto) { this.anotarNoSoportado("comando", c.nombre); return true; }
        e.quitarObjeto(String(params[0]));
        return true;
      }

      // `setvelocity|addvelocity <objetivo> <vec> [override]` —
      // scriptcmds.cpp:7155-7214. `setorigin <objetivo> <vec>` — :4508-4528.
      // El vector se parte como `StringToVec` (`vectorDeTexto`), en UNIDADES y
      // ejes del motor; pasarlo a la escena es del gancho.
      //
      // LA GUARDA DEL `$`, que NO es del motor: un getter que este puerto no
      // tiene vuelve como su propio texto (script.cpp:4741, ver `resolver`), y
      // `StringToVec("$vec(…)")` da (0,0,0). En el motor eso no pasa porque el
      // getter existe; aquí mandaría al jugador al origen del mapa. Así que esa
      // mitad —nuestra— se apunta y no se ejecuta, y la otra —una variable sin
      // poner, que también da (0,0,0) y ES del motor— se ejecuta como allí.
      case "setvelocity": case "addvelocity": case "setorigin": {
        if (params.length < 2) return true;          // `ERROR_MISSING_PARMS`
        const gancho = c.nombre === "setorigin" ? e.ponerOrigen : e.velocidad;
        if (!gancho) { this.anotarNoSoportado("comando", c.nombre); return true; }
        const texto = String(params[1]);
        if (texto.startsWith("$")) {
          this.anotarNoSoportado("vector sin getter", `${c.nombre} ${texto}`);
          return true;
        }
        const v = vectorDeTexto(texto);
        if (c.nombre === "setorigin") e.ponerOrigen(String(params[0]), v);
        else {
          e.velocidad(String(params[0]), v, {
            sumar: c.nombre === "addvelocity",
            // `Params[2] != "override"` (:7184): sólo cuenta si hay tercero.
            override: params.length >= 3 && String(params[2]) === "override",
          });
        }
        // `ScriptCmd_Origin` devuelve FALSE (:4527) y `ScriptCmd_Velocity`
        // TRUE (:7213). No cambia nada: el valor sólo lo lee un condicional y
        // éstos no lo son (script.cpp:5748-5754).
        return true;
      }

      // `setstat <estadística> <valores...>` — npcscript.cpp:1305-1358. En un
      // jugador escribe las subestadísticas de verdad; en un monstruo sólo
      // `parry`, y como scriptvar. Las dos ramas son del gancho.
      case "setstat": {
        if (params.length < 2) return true;          // `ERROR_MISSING_PARMS`
        if (!e.ponerEstadistica) { this.anotarNoSoportado("comando", c.nombre); return true; }
        e.ponerEstadistica(String(params[0]), params.slice(1).map(String));
        return true;
      }

      // ── EL 93: LO QUE EL SALTO DE LA ARAÑA LE PIDE AL CUERPO ─────────────
      //
      // Los cinco son del CUERPO de la entidad, y el cuerpo de un bicho lo
      // lleva la manada: aquí se parte el comando con las reglas del motor y
      // se pasa al gancho. Sin gancho, se apunta (no hay `=> {}`, el 66).
      //
      // `gravity <f>` — `pev->gravity = V_max(atof(Params[0]), 0.001f)`
      // (scriptcmds.cpp:3461-3467): nunca cero, y un texto que no es número
      // da 0 y por tanto 0,001.
      case "gravity": {
        if (!params.length) return true;             // `ERROR_MISSING_PARMS`
        if (!e.gravedad) { this.anotarNoSoportado("comando", c.nombre); return true; }
        e.gravedad(Math.max(numDe(params[0]), 0.001));
        return true;
      }
      // `movespeed <f>` — `m_SpeedMultiplier = atof(Params[0])`
      // (npcscript.cpp:514-521, «NOV2014_19 this was atoi»). El −1 de
      // `spider_latch_drop` se guarda tal cual: el motor no lo trata aparte.
      // `setanim.framerate <f>` — `m_Framerate = atof(Params[0])`
      // (npcscript.cpp:1585-1591).
      case "movespeed": case "setanim.framerate": {
        if (!params.length) return true;
        const gancho = c.nombre === "movespeed" ? e.ritmoDeAndar : e.ritmoDeAnimacion;
        if (!gancho) { this.anotarNoSoportado("comando", c.nombre); return true; }
        gancho(numDe(params[0]));
        return true;
      }
      // `setidleanim <anim|none>` — `m_IdleAnim`, con `none` a vacío
      // (npcscript.cpp:1458-1469).
      case "setidleanim": {
        if (!params.length) return true;
        if (!e.animacionDeParado) { this.anotarNoSoportado("comando", c.nombre); return true; }
        const n = String(params[0]);
        e.animacionDeParado(n === "none" ? "" : n);
        return true;
      }
      // `setfollow <objetivo> <banderas>` | `setfollow none` —
      // scriptcmds.cpp:5970-6000. Con `none` vuelve a `MOVETYPE_STEP`; con un
      // objetivo que `RetrieveEntity` encuentra, le sigue (`MOVETYPE_NONE`), y
      // `align_bottom` se busca como SUBCADENA del segundo (`find`, :5987). Con
      // un solo parámetro que no es `none`, `ERROR_MISSING_PARMS` y nada.
      case "setfollow": {
        if (!params.length) return true;
        if (!e.seguir) { this.anotarNoSoportado("comando", c.nombre); return true; }
        if (String(params[0]) === "none") { e.seguir(null); return true; }
        if (params.length < 2) return true;
        e.seguir(String(params[0]), { abajo: String(params[1]).includes("align_bottom") });
        return true;
      }

      // `noxploss ent_me 0`, en `game_player_putinworld`
      // (player_main.script:986). **No existe**: la palabra no sale en todo el
      // código del mod ni del motor. No está en `m_GlobalCmdHash` ni en la
      // lista de `CMSMonster` (npcscript.cpp:20-95), así que el CARGADOR ya la
      // tira al leer el guion: `Script_ParseLine` devuelve 0 y la línea no
      // entra en el evento (script.cpp:5616-5630). Es una línea muerta de un
      // sistema que ya no está; portarla es no hacer nada A PROPÓSITO, y no
      // apuntarla como hueco.
      case "noxploss": return true;

      // ── EL 97: `nopush <0|1>` ────────────────────────────────────────
      // npcscript.cpp:318-330: `SetScriptVar("IMMUNE_PUSH", Params[0])` y
      // `m_nopush = atoi(Params[0]) != 0`. Lo que vale para el aturdimiento:
      // `$get(ent_me,nopush)` (scriptcmds.cpp:1422) es la inmunidad de
      // `debuff_stun` (effects/debuff_stun.script:66-74). El jugador lo pone
      // desde su `game_scriptflag_update` (player/externals.script:164-173).
      case "nopush": {
        if (params.length < 1) return true;            // `ERROR_MISSING_PARMS`
        if (!e.inempujable) { this.anotarNoSoportado("comando", "nopush (sin cuerpo)"); return true; }
        this.vars.set("IMMUNE_PUSH", String(params[0]));
        e.inempujable(Math.trunc(numDe(params[0])) !== 0);
        return true;
      }

      // ── EL 96: LA ARMADURA ───────────────────────────────────────────
      // `registerarmor` (genericitem.cpp:1705-1706 -> giarmor.cpp:19-74) lee
      // `ARMOR_TYPE`, `ARMOR_PROTECTION` y `ARMOR_PROTECTION_AREA` del guion EN
      // ESE MOMENTO, y `setdmg <dmg|type|hit> <valor>` (genericitem.cpp:2174-
      // 2191) cambia el golpe que el motor está repartiendo — sólo si hay uno
      // (`if (m_CurrentDamage)`): fuera de `game_takedamage` no hace nada, y
      // eso lo decide el gancho. Los dos son del OBJETO; sin gancho se apuntan.
      case "registerarmor": {
        if (!e.registrarArmadura) { this.anotarNoSoportado("comando", "registerarmor (no es un objeto)"); return true; }
        e.registrarArmadura({
          tipo: this.resolver("ARMOR_TYPE"),
          proteccion: this.resolver("ARMOR_PROTECTION"),
          zonas: this.resolver("ARMOR_PROTECTION_AREA"),
        });
        return true;
      }
      // EL 98: `registercontainer` -> `RegisterContainer` (gipack.cpp:50-77):
      // `GetFirstScriptVar` de las tres claves, que es `GetVar` y por eso mira
      // primero los `local` del evento en curso (pack_base.script:35-42 las
      // pone con `local`). Sin poner, `GetVar` devuelve el propio nombre, y el
      // `strcmp` con el nombre (:69-72) deja la lista vacía.
      case "registercontainer": {
        if (!e.registrarContenedor) { this.anotarNoSoportado("comando", "registercontainer (no es un objeto)"); return true; }
        const leer = (n) => { const x = this.resolver(n, ev); return x === n ? null : String(x); };
        e.registrarContenedor({
          maximo: leer("reg.container.maxitem"),
          acepta: leer("reg.container.accept_mask"),
          rechaza: leer("reg.container.reject_mask"),
        });
        return true;
      }
      case "setdmg": {
        if (params.length < 2) return true;          // `ERROR_MISSING_PARMS`
        if (!e.cambiarDano) { this.anotarNoSoportado("comando", "setdmg (no es un objeto)"); return true; }
        e.cambiarDano(String(params[0]), String(params[1]));
        return true;
      }

      // ── LOS EFECTOS ──────────────────────────────────────────────────
      // `applyeffect <objetivo> <guion> [params…]` (scriptcmds.cpp:1865-1929),
      // `removeeffect <objetivo> <id>` (:5068-5106) y `removescript`
      // (:5114-5119). El intérprete no decide nada: QUIÉN es el objetivo y si
      // puede llevar un efecto lo sabe el entorno, y la regla entera —la pila,
      // el `game_activate`, el reparto de eventos— está en `efectos.js`. Sin
      // gancho se apunta: no hay `=> {}` en `entornoVacio` para éstos (el 66).
      case "applyeffect": case "removeeffect": case "removescript": {
        if (c.nombre === "removescript") {
          // `RemoveNextFrame`: NO corta el evento, lo de detrás sigue.
          if (e.quitarGuion) e.quitarGuion();
          else this.anotarNoSoportado("comando", "removescript (este guion no se puede quitar de su entidad)");
          return true;
        }
        if (params.length < 2) return true;          // `ERROR_MISSING_PARMS`
        const gancho = c.nombre === "applyeffect" ? e.aplicarEfecto : e.quitarEfecto;
        if (!gancho) { this.anotarNoSoportado("comando", `${c.nombre} (sin anfitrión de efectos)`); return true; }
        if (c.nombre === "applyeffect") e.aplicarEfecto(String(params[0]), String(params[1]), params.slice(2).map(String), { desde: this });
        else e.quitarEfecto(String(params[0]), String(params[1]));
        return true;
      }

      // ── EL 91: EL DAÑO, LAS BANDERAS Y LA RESISTENCIA ───────────────────
      //
      // `dodamage` y `xdodamage` se parten ENTEROS, con todas sus formas y sus
      // rarezas (ver `leerDano`), y el resultado va al gancho `hacerDano` del
      // entorno, que es quien sabe a quién le duele. Sin gancho, se apunta: un
      // `=> {}` aquí sería un veneno que no hace nada sin decirlo (el 66).
      case "dodamage": case "xdodamage": {
        const d = leerDano(c.nombre, params.map(String));
        if (!d) return true;                         // `ERROR_MISSING_PARMS`
        if (!e.hacerDano) { this.anotarNoSoportado("comando", `${c.nombre} (sin gancho de daño)`); return true; }
        e.hacerDano(d, { desde: this });
        return true;
      }

      // `scriptflags <objetivo> <acción> [nombre] [tipo] [valor] [caduca] [aviso]`
      // — scriptcmds.cpp:5265-5451. Las banderas son de la ENTIDAD
      // (`pEntity->m_scriptflags`), no del guion: un efecto y su anfitrión
      // leen las mismas. La regla está en `BanderasDeEntidad` (`efectos.js`);
      // aquí sólo se reparten los avisos y los dos eventos que el motor manda
      // a la entidad, en su orden: `game_scriptflag_expired` DENTRO del bucle
      // de `remove_expired` (:5372) y `game_scriptflag_update` siempre al
      // final (:5437-5444).
      case "scriptflags": {
        if (params.length < 2) return true;          // `ERROR_MISSING_PARMS`
        const ref = String(params[0]);
        const b = e.banderas?.(ref) ?? null;
        // «target entity not found» (:5446): el motor avisa por consola.
        if (!b) { this.anotarNoSoportado("comando", "scriptflags (entidad sin banderas)"); return true; }
        const r = b.ejecutar(params.map(String), Number(this.ahora()) || 0);
        for (const aviso of r.avisos) e.mensajeAlJugador?.(ref, aviso, "dplayermessage");   // HUDEVENT_UNABLE
        for (const ex of r.expirados) e.llamarExterno?.(ref, "game_scriptflag_expired", ex);
        e.llamarExterno?.(ref, "game_scriptflag_update", r.parametros);
        return true;
      }

      // `takedmg <tipo|all> <multiplicador> [adjust]` — npcscript.cpp:1057-1104.
      // Es de `CMSMonster`, y el jugador lo es: lo usa su guion para las
      // resistencias elementales (player/server/element_resist.script:103).
      case "takedmg": {
        if (params.length < 2) return true;          // `ERROR_MISSING_PARMS`
        if (!e.ponerRecibeDano) { this.anotarNoSoportado("comando", c.nombre); return true; }
        e.ponerRecibeDano(String(params[0]), numDe(params[1]), params.length >= 3 ? String(params[2]) : null);
        return true;
      }

      // ── EL 93 (pieza G): LO QUE UN GUION LE HACE A LA PANTALLA ──────────
      //
      // `effect <tipo> …` es UNA función con una rama por tipo
      // (`ScriptCmd_Effect`, scriptcmds.cpp:140 / :3040, que reparte a
      // mseffects.cpp) y los tres `hud.*` son otra (`ScriptCmd_HudIcon`,
      // scriptcmds.cpp:60-63 / :3706-3847). El intérprete no parte nada: la
      // regla está en `src/play/efectospantalla.js` y a quién le llega lo sabe
      // el entorno, que es el del jugador (`src/play/guionjugador.js`) y, por
      // herencia, el de cada efecto suyo (`entornoDelEfecto`, efectos.js).
      //
      // El gancho devuelve `false` si el tipo no es suyo —`effect beam`,
      // `effect screenshake`—, y entonces se apunta con el nombre del comando,
      // igual que hacía el `default`. Sin gancho (un NPC), lo mismo. Hasta este
      // `case` lo hacía un PUENTE que envolvía `ejecutarComando` de cada
      // instancia (doc/EFECTOS_RED_93.md §5.1 y §6).
      case "effect": case "hud.addstatusicon": case "hud.killstatusicon": case "hud.killicons":
      case "hud.addimgicon": case "hud.killimgicon": {   // EL 95
        if (!e.comandoDePantalla?.(c.nombre, params.map(String), { desde: this })) this.anotarNoSoportado("comando", c.nombre);
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
    /**
     * El 89b. `sound.play3d`/`svsound.play3d`: un sonido en un PUNTO y no en
     * la entidad. `origen` en unidades y ejes del motor, sin convertir.
     * AVISO (CLAUDE.md §4, el `=> {}` del 66): hoy no lo conecta ningún
     * entorno; el comando corre y no suena hasta que alguien lo cablee.
     */
    sonarEn: () => {},
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
