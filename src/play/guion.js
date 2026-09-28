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

/** `::mslist<scriptvar_t> CScript::m_gVariables` — script.cpp:52. Compartidas. */
export const GLOBALES = new Map();

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
 * construcción, y el orden importa —los eventos del `#include` van ANTES, y
 * `RunScriptEventByName` los ejecuta **todos**, no el primero (script.cpp:5836:
 * «Run every event with this name»)—.
 */
export function partirGuion(texto) {
  const eventos = [];
  const includes = [];
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
        if (resto[0]) includes.push(resto[0]);
      }
      // `#scope`, `#include` y poco más. Fuera de un bloque no hay comandos:
      // el motor avisa («Missing {», script.cpp:5279) y sigue.
      return;
    }

    // ── dentro de un evento ─────────────────────────────────────────────
    const nombreCmd = cabeza.toLowerCase();

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
      preload.push({ tipo: nombreCmd, nombre: ps[1], valor: ps.slice(2).join(" ") });
    }

    actual.push(cmd(nombreCmd, ps.slice(1)));
    cerrarSiEsDeUna();
  };

  for (let n = 0; n < lineas.length; n++) procesar(lineas[n], n);

  return { eventos, includes, preload };
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
  "return", "exit",                               // scriptcmds.cpp:167
  "dbg",                                          // no hace nada fuera del build de desarrollo
  // `npcscript.cpp`, comandos del NPC
  "saytext",                                      // npcscript.cpp:52 / :708
  "offer",                                        // npcscript.cpp:50 / :636
  "playanim",                                     // npcscript.cpp:88 / :1487
  "menuitem.register",                            // npcscript.cpp:83 / :940
]);

/** Los `$getters` portados. `m_GlobalGetterHash`, script.cpp:41-170. */
export const GETTERS = new Set([
  "$item_exists",     // script.cpp:87
  "$get_quest_data",  // script.cpp:112
  "$int",             // script.cpp:123
  "$rand",            // script.cpp:135
  "$get",             // script.cpp:70  — sólo un puñado de propiedades, ver `PROPIEDADES`
  "$dist",            // script.cpp:131
  "$get_token",       // script.cpp:93
]);

/** Las propiedades de `$get(<ent>,<prop>)` que este puerto sabe contestar. */
export const PROPIEDADES = new Set(["isplayer", "id", "exists", "isalive", "origin", "name"]);

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
  constructor({ eventos = [], entorno = null, preload = [], nombre = "" } = {}) {
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
    return String(this.llamarGetter(nombre, args, ev) ?? "0");
  }

  llamarGetter(nombre, a, ev) {
    const e = this.entorno;
    switch (nombre) {
      // script.cpp:3097 — devuelve "1"/"0". Sin jugador, "0".
      case "$item_exists": return e.llevaObjeto(a[0], a[1], a[2] ?? "0") ? "1" : "0";
      // script.cpp:2175 — y **"0" cuando la misión no está puesta**, no vacío.
      case "$get_quest_data": return e.leerMision(a[0], a[1]) ?? "0";
      case "$int": return String(enteroDe(a[0]));                       // script.cpp:3075
      case "$rand": return String(e.azar(enteroDe(a[0]), enteroDe(a[1]))); // script.cpp:3547
      case "$dist": return String(e.distancia(a[0], a[1]));             // script.cpp:131
      case "$get_token": return e.token(a[0], enteroDe(a[1]));          // script.cpp:93
      case "$get": {
        if (!PROPIEDADES.has(String(a[1]))) { this.anotarNoSoportado("propiedad", `$get(,${a[1]})`); return "0"; }
        return String(e.propiedad(a[0], a[1]) ?? "0");
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
        if (!c.nueva) return false;                 // EL VIEJO: abandona el bloque
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
      case "add": case "subtract": {
        if (params.length < 2) return true;
        const v = numDe(params[0]) + (c.nombre === "subtract" ? -1 : 1) * numDe(params[1]);
        const nombre = c.params[0];                 // `Cmd.m_Params[1]`, crudo
        const texto = params.length <= 2 ? v.toFixed(2) : String(v);
        if (ev.locales.has(nombre)) ev.locales.set(nombre, texto);
        else this.vars.set(nombre, texto);
        return true;
      }

      // ── llamadas ─────────────────────────────────────────────────────
      // `ScriptCmd_CallEvent`, scriptcmds.cpp:2220. Un primer parámetro que
      // empieza por dígito es un RETARDO (`isdigit(Params[NextParm][0])`,
      // :4241), no un nombre de evento.
      case "callevent": case "calleventtimed": case "callexternal": {
        if (!params.length) return true;
        let i = 0;
        let externo = null;
        if (c.nombre === "callexternal") { externo = params[0]; i = 1; }
        let retardo = 0;
        if (params.length > i + 1 && /^\d/.test(String(params[i]))) { retardo = numDe(params[i]); i++; }
        const nombre = params[i]; i++;
        const resto = params.slice(i);
        if (externo !== null) { e.llamarExterno(externo, nombre, resto); return true; }
        // «Can't call myself recursively» — scriptcmds.cpp:2297.
        if (nombre === ev.nombre && !retardo) return true;
        if (retardo) e.programar(retardo, () => this.llamar(nombre, resto));
        else if (!this.llamar(nombre, resto)) this.anotarNoSoportado("evento", nombre);
        return true;
      }

      // `exit` / `return`: `Event.bFullStop`. scriptcmds.cpp:5178.
      case "return": case "exit": ev.parar = true; return true;

      // ── el mundo ─────────────────────────────────────────────────────
      // `saytext`: las palabras se juntan **con un espacio** y se dicen en
      // SPEECH_LOCAL. npcscript.cpp:708-720.
      case "saytext": e.hablar(params.join(" ")); return true;

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
    token: () => "0",
    azar: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
  };
}
