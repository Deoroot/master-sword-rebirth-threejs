// La FICHA de un NPC de Master Sword Rebirth, leída de su `.script`.
//
// ── Lo que esto hace y lo que NO ───────────────────────────────────────────
//
// **No es un intérprete.** No ejecuta eventos, no evalúa `$rand()`, no entiende
// `callevent` ni las condiciones. Lee la ficha: qué modelo pone el NPC, qué
// animación usa parado, cuál andando, cómo se llama, cuánta vida tiene y cuánto
// ocupa. Eso es lo que hace falta para PONERLO en el mapa, y se dice que es un
// subconjunto para que nadie lo confunda con la IA.
//
// ── Por qué hay que leerlo y no basta con la entidad ───────────────────────
//
// Porque **el `classname` de la entidad es decorativo**. Gate City coloca:
//
//     msmonster_skeleton   defscriptfile "monsters/spider"    -> una ARAÑA
//     msmonster_orcwarrior defscriptfile "monsters/goblin"     -> un GOBLIN
//     msmonster_dwarf      defscriptfile "monsters/dwarf_zombie_random"
//
// O sea que deducir el modelo del nombre de la clase da tres bichos equivocados
// de cuatro, y no da error: da un mapa poblado de criaturas plausibles y
// distintas de las del juego.
//
// ── El formato, en corto ───────────────────────────────────────────────────
//
// Bloques entre llaves. El primero declara constantes y variables:
//
//     setvar  NOMBRE valor      una variable
//     setvard NOMBRE valor      igual, con valor por defecto
//     const   NOMBRE valor      una constante
//     #include monsters/base_monster        (fuera de los bloques)
//
// Y un bloque con `eventname npc_spawn` trae la ficha:
//
//     setmodel monsters/goblin_new.mdl     (o una VARIABLE: `setmodel SPIDER_MODEL`)
//     setidleanim idle1
//     setmoveanim ANIM_WALK
//     hp 50   width 32   height 60   name Goblin
//
// Las variables se resuelven al final, y un valor puede ser otra variable.

import { readFileSync, existsSync } from "node:fs";

/** Quita comentarios `//` respetando que no haya comillas de por medio. */
const sinComentarios = (l) => {
  const i = l.indexOf("//");
  return (i >= 0 ? l.slice(0, i) : l).trim();
};

/** Las etiquetas de ámbito, iguales que en la cabecera de un bloque. */
const AMBITOS = { "[client]": "cliente", "[server]": "servidor", "[shared]": "compartido" };

/**
 * Lo que va detrás de un `#include`: el ámbito, si lo trae, y la RUTA.
 *
 * La regla está citada entera arriba, en `partirScript`. Aquí sólo el reparto,
 * y un detalle del motor que importa: el corchete se mira con `contains`, así
 * que `[server]` y `[casual]` pueden venir **pegados** —`[server][casual]`— y
 * los dos cuentan. `[casual]` no elige ámbito: sólo dice que si el fichero no
 * está no es un error, que aquí es lo que pasa siempre.
 */
export function includeDe(cola) {
  let resto = String(cola ?? "").trim();
  let ambito = null;
  if (resto.startsWith("[")) {
    const corchetes = resto.match(/^(\[[^\]]*\])+/)?.[0]?.toLowerCase() ?? "";
    for (const [etiqueta, nombre] of Object.entries(AMBITOS)) {
      if (corchetes.includes(etiqueta)) { ambito = nombre; break; }
    }
    resto = resto.slice(corchetes.length).trim();
  }
  // El tercer token es `allowduplicate` y no se porta — ver `partirScript`.
  return { ruta: resto.split(/\s+/)[0] || null, ambito: ambito ?? "compartido" };
}

/**
 * Parte un script en bloques, y devuelve además las líneas de fuera.
 *
 * Los `#include` viven fuera de los bloques y hay que seguirlos: `goblin.script`
 * saca su comportamiento de `base_monster_new`, que a su vez incluye a otro. La
 * ficha, sin embargo, está casi siempre en el propio fichero.
 *
 * Devuelve además `piezas`: los bloques y los `#include` **en el orden en que
 * están escritos**. Eso no es un adorno — es lo único que permite saber quién
 * gana cuando dos sitios declaran lo mismo, y en este lenguaje la respuesta
 * depende de qué sea:
 *
 *   `const`   gana el PRIMERO. `script.cpp` recorre `m_Constants` y si el
 *             nombre ya está, **no lo añade**. Por eso un objeto pone sus
 *             constantes ANTES del `#include`: así pisa las de la base.
 *   lo demás  gana el ÚLTIMO, porque son órdenes que se ejecutan en orden y la
 *             última deja el valor puesto. Y como el `#include` va antes del
 *             bloque `weapon_spawn` del objeto, el objeto pisa a su base.
 *
 * Las dos reglas son OPUESTAS y las dos hacen falta a la vez. Leerlas al revés
 * no da error: da una espada oxidada que hace el daño de la base.
 *
 * ── EL 82: UN `#include` PUEDE TRAER ÁMBITO DELANTE ────────────────────────
 *
 * Y entonces **el nombre del fichero es el token SIGUIENTE**:
 *
 *     msstring FileName = Line.thru_char(SKIP_STR);
 *     eventscope_e Scope = EVENTSCOPE_SHARED;
 *     if (FileName.c_str()[0] == '[') {
 *       if (FileName.contains("[server]"))      Scope = EVENTSCOPE_SERVER;
 *       else if (FileName.contains("[client]")) Scope = EVENTSCOPE_CLIENT;
 *       if (FileName.contains("[casual]"))      Casual = true;
 *       Line = Line.substr(FileName.len()).skip(SKIP_STR);
 *       FileName = Line.thru_char(SKIP_STR);          // <- el de verdad
 *     }
 *     if ((Scope == EVENTSCOPE_SHARED) ||
 *         MSGlobals::IsServer == (Scope == EVENTSCOPE_SERVER)) ...Spawn(FileName...)
 *                                                  script.cpp:5229-5246
 *
 * Esto leía `/^#include\s+(\S+)/`, o sea que de
 *
 *     #include [server] monsters/externals
 *     #include [server] monsters/base_self_adjust     NPCs/base_npc.script:7-8
 *
 * se quedaba con **`[server]`**, buscaba `scripts/[server].script`, no lo
 * encontraba y **se callaba** —`recoger` devuelve `false` y nadie lo lee—, con
 * el fichero de verdad detrás. Son 135 `#include` con corchete en 90 ficheros
 * (109 `[server]`, 10 `[casual]`, 10 `[shared]`, 6 `[client]`), y como el que
 * los pone es `base_npc`, que incluye casi todo el que respira, el agujero no
 * es de 135 sitios sino de todo lo que cuelga de ellos: **1 074 de los 2 884
 * scripts** perdían ficheros —hasta 10 ficheros y 387 eventos en un lobo— y con
 * ellos **6 308 de las 6 877 criaturas de los 93 mapas, en 90 mapas**. Las
 * cuentas las imprime `npm run guiones`.
 *
 * Lo que se caía entero era `monsters/externals.script`, 1 861 líneas, que es
 * donde viven los `set_*` del canal `params` —la tarea del 82— y
 * `base_self_adjust.script`, que es **quien los reparte**. O sea que el canal
 * no estaba «sin portar»: estaba sin poder cargarse.
 *
 * **Y esta vez no lo enseñaba el segundo mapa: Gate City pierde 61 de 69.**
 * Lleva así desde que hay lector. Nadie lo vio porque un evento que no está
 * cargado no se distingue de un evento que no existe: `llamar()` no encuentra
 * nada y sigue, igual que el motor con un comando desconocido.
 *
 * Qué ámbito entra, que es la decisión ya tomada en este puerto: **esto es el
 * servidor** (`game.serverside` → «1», `guion.js:643`). Así que entran
 * `[server]`, `[shared]` y los que no traen corchete, y **no** entra
 * `[client]`. `[casual]` no es un ámbito sino «si no está, no es un error», que
 * aquí ya es el comportamiento de todos.
 *
 * Lo que NO se porta, dicho aquí y no descubierto luego: el tercer token,
 * `allowduplicate` (`m.AllowDupInclude`, script.cpp:5250), que deja incluir dos
 * veces el mismo fichero. Lo usan **33** `#include` y aquí `vistos` los corta
 * siempre. No se porta porque lo que hace es volver a ejecutar un bloque, y eso
 * sólo se nota con el intérprete corriendo; se dice el número para que el día
 * que haga falta esté contado y no sorprenda.
 */
export function partirScript(texto) {
  const bloques = [];
  const incluye = [];
  const piezas = [];
  let actual = null;
  let hondo = 0;
  for (const bruto of texto.split(/\r?\n/)) {
    const l = sinComentarios(bruto);
    if (!l) continue;
    if (!actual) {
      const inc = l.match(/^#include\s+(.*)$/i);
      if (inc) {
        const { ruta, ambito } = includeDe(inc[1]);
        // Un `[client]` no entra aquí, pero se apunta en `piezas` con su
        // ámbito: quien lea las piezas tiene que poder ver que estaba y que se
        // descartó a propósito. El hueco silencioso es lo que costó el 82.
        if (ruta) {
          piezas.push({ tipo: "include", ruta, ambito });
          if (ambito !== "cliente") incluye.push(ruta);
        }
        continue;
      }
    }
    // Una llave puede venir pegada al principio de la línea con contenido
    // detrás: `{ goblin_remove` es un bloque cuyo nombre es el evento.
    let resto = l;
    while (resto.length) {
      const abre = resto.indexOf("{");
      const cierra = resto.indexOf("}");
      if (hondo === 0 && abre >= 0 && (cierra < 0 || abre < cierra)) {
        actual = [];
        const cola = resto.slice(abre + 1).trim();
        hondo = 1;
        resto = cola;
        continue;
      }
      if (hondo > 0 && cierra >= 0 && (abre < 0 || cierra < abre)) {
        const cabeza = resto.slice(0, cierra).trim();
        if (cabeza) actual.push(cabeza);
        hondo--;
        if (hondo === 0) { bloques.push(actual); piezas.push({ tipo: "bloque", lineas: actual }); actual = null; }
        resto = resto.slice(cierra + 1).trim();
        continue;
      }
      if (hondo > 0 && abre >= 0) {
        // Llaves anidadas: un `if { ... }` dentro de un evento. Se cuentan para
        // no cerrar el bloque antes de tiempo, y su contenido se guarda igual.
        const cabeza = resto.slice(0, abre).trim();
        if (cabeza) actual.push(cabeza);
        hondo++;
        resto = resto.slice(abre + 1).trim();
        continue;
      }
      if (hondo > 0) { actual.push(resto); }
      break;
    }
  }
  return { bloques, incluye, piezas };
}

/**
 * La CABECERA de un bloque: su nombre, su ámbito y si ANULA.
 *
 * El motor lee los trozos que van detrás de la llave en cualquier orden, y el
 * que no es una etiqueta entre corchetes es el nombre (`script.cpp:5176-5190`):
 *
 *     while( Param.len() ) {
 *       if( Param == "[client]" )       esScope = EVENTSCOPE_CLIENT;
 *       else if( Param == "[server]" )  esScope = EVENTSCOPE_SERVER;
 *       else if( Param == "[shared]" )  esScope = EVENTSCOPE_SHARED;
 *       else if( Param == "[override]" ) Override = true;
 *       else Name = Param;
 *     }
 *
 * Y `[override]` no es un adorno: **borra de la lista todos los eventos que ya
 * se llamaban igual** (script.cpp:5205-5210), así que el del padre no llega a
 * existir. Eso es lo que hace que un escudo no registre los ataques de
 * `base_melee`: `shields_base` declara `[override] weapon_spawn` y el del padre
 * desaparece.
 *
 * Sin esto, la lectura anterior daba a los siete escudos **tres ataques**, y el
 * principal —el primero— era un `strike-land` fantasma de la base que en el
 * juego no existe. No da error: da un escudo que parece una maza.
 */
function cabeceraDe(bloque) {
  const ETIQUETAS = { "[client]": "cliente", "[server]": "servidor", "[shared]": "compartido" };
  let nombre = null, anula = false, ambito = null;
  const primera = bloque[0]?.trim() ?? "";
  const trozos = primera.split(/\s+/).filter(Boolean);
  let vale = trozos.length > 0;
  for (const t of trozos) {
    const b = t.toLowerCase();
    if (b === "[override]") { anula = true; continue; }
    if (ETIQUETAS[b]) { ambito = ETIQUETAS[b]; continue; }
    // `{ goblin_remove` — la forma corta: el nombre va pegado a la llave. Un
    // segundo trozo que no es etiqueta ya no es una cabecera: es una orden.
    if (nombre !== null || !/^[A-Za-z_][\w.]*$/.test(t)) { vale = false; break; }
    nombre = t.toLowerCase();
  }
  if (!vale) { nombre = null; anula = false; ambito = null; }
  /**
   * `eventname` gana: es la forma larga y puede estar en cualquier línea.
   *
   * ── EL FALLO DEL 81 ────────────────────────────────────────────────────
   * Esto comparaba contra la línea **sin recortar**, y un guion de Master
   * Sword escribe `eventname` sangrado DENTRO de las llaves. Resultado:
   * **570 de 570 declaraciones en 202 ficheros**, el total del juego, no
   * nombraban nada — la forma larga no funcionó ni una vez en 81
   * experimentos. Dos líneas más arriba la forma corta sí recorta
   * (`bloque[0]?.trim()`), y por eso los 25 guiones de Gate City, que la
   * usan, salieron bien y nadie miró: el caso único del 50 otra vez.
   *
   * Y no era un hueco callado, era peor: **un bloque sin nombre se ejecuta
   * entero al nacer** (el 60). Así que Sylphiel corría su `say_reward3` en
   * el primer fotograma y te regalaba el oro de una misión que no habías
   * empezado.
   */
  for (const l of bloque) {
    const m = l.trim().match(/^eventname\s+(\S+)/i);
    if (m) { nombre = m[1].toLowerCase(); break; }
  }
  return { nombre, anula, ambito };
}

/** El nombre del evento de un bloque, si lo declara. */
const eventoDe = (bloque) => cabeceraDe(bloque).nombre;

/**
 * Lee la ficha de un NPC, siguiendo los `#include`.
 *
 * `raiz` es la carpeta `scripts/`. Devuelve `null` si el fichero no está, que es
 * un caso distinto de un error: quiere decir que el mod pide un script que esta
 * copia no trae, y eso hay que decirlo y no adivinarlo.
 */
/** Las líneas de ficha que este lector entiende. Lo demás se ignora a propósito. */
const CAMPOS = /^(setmodel|setidleanim|setmoveanim|name|hp|width|height|race|roam)\s+(.*)$/i;

/**
 * Los TRES nombres con los que un script declara su nacimiento.
 *
 * Contados en los 723 scripts de `monsters/`, `gatecity/` y `NPCs/`: 213
 * `npc_spawn`, 64 `game_spawn` y unos cuantos `spawn` a secas —`gatecity/miner`
 * es uno—. Quedarse con el primero deja fuera a cuatro de los veinticinco
 * scripts que usa Gate City, y eso no da error: da un hueco donde el juego tiene
 * un enano.
 */
const NACIMIENTO = ["npc_spawn", "game_spawn", "spawn"];

/** Junta los bloques y las variables de un script y de todo lo que incluye. */
function recoger(raiz, rutaScript, vistos, profundidad, indice, vars, orden) {
  if (profundidad > 8) return false;
  const ruta = `${raiz}/${rutaScript.replace(/\\/g, "/")}.script`;
  if (!existsSync(ruta) || vistos.has(ruta)) return existsSync(ruta);
  vistos.add(ruta);

  const { bloques, incluye } = partirScript(readFileSync(ruta, "latin1"));
  for (const b of bloques) {
    const ev = eventoDe(b);
    for (const l of b) {
      const m = l.match(/^(setvar|setvard|const)\s+(\S+)\s+(.*)$/i);
      // Primero gana: el script del bicho declara antes que lo que incluye, y el
      // motor hace lo mismo — `base_monster` pone lo común y el bicho lo pisa.
      if (m && !vars.has(m[2])) vars.set(m[2], m[3].trim());
    }
    if (ev) {
      if (!indice.has(ev)) indice.set(ev, []);
      indice.get(ev).push(b);
      orden.push(ev);
    }
  }
  for (const inc of incluye) recoger(raiz, inc, vistos, profundidad + 1, indice, vars, orden);
  return true;
}

/**
 * LO QUE VALE UNA VARIABLE CUANDO EL BICHO YA HA NACIDO — el 92.
 *
 * `recoger`, arriba, junta los `setvar`/`setvard`/`const` de **todos los
 * bloques de todo lo incluido, corran o no**. Para una constante eso es lo
 * correcto; para una variable que sólo se pone dentro de un evento, no: el 82
 * lo pisó con `NPC_NO_DROPS` (ver el comentario del botín en `iaDe`) y lo
 * resolvió no leyéndolo. El 92 lo pisó otra vez con `NPC_IS_BOSS` y
 * `NPC_SELF_ADJUST`: **los 13 tipos de bicho de Gate City salían jefes y
 * autoajustables**, herrero y tabernero incluidos, porque los dos valores viven
 * en `make_boss` y `set_self_adj` de `monsters/externals.script:791-793` y
 * `:1319-1322`, dos eventos a los que no llama ningún guion — los pide el mapa
 * por `params`. Y aquí «no leerlo» no vale: 7 ficheros hacen `setvar
 * NPC_IS_BOSS 1` y 43 `setvard`, y algunos de verdad son jefes.
 *
 * LA REGLA DEL MOTOR, que distingue los tres comandos al CARGAR el guion
 * (script.cpp:5384-5458, `ParseScriptFile`, línea a línea de cada bloque):
 *
 *   `const`    se registra al cargar, en CUALQUIER bloque, y gana el PRIMERO
 *              (`AddConst = false` si ya está, :5418-5430).
 *   `setvar`   se EJECUTA al cargar, en cualquier bloque que no sea
 *              `[client]` (:5386-5416, `SetVar(...)` y `KeepCmd = true`): o
 *              sea que vale aunque su evento no corra nunca, y como `SetVar`
 *              pisa, gana el ÚLTIMO en orden de lectura. Y se vuelve a
 *              ejecutar cuando su evento corre («Exectuted at loadtime and
 *              runtime», scriptcmds.cpp:120).
 *   `setvard`  NO se ejecuta al cargar: se reescribe a `setvar` y se guarda
 *              para cuando el evento corra (:5448-5458). Sólo cuenta si el
 *              bloque corre.
 *
 * Y lo que corre al nacer: `spawn` y `game_spawn` (`CallScriptEvent`,
 * global.cpp:436-437) con lo que llamen —`base_npc` llama `npc_spawn` en su
 * `game_spawn`, :24—; los bloques SIN NOMBRE, que el motor arma con
 * `fNextExecutionTime = 0` (script.cpp:5198-5202) y corren en el primer
 * `RunScriptEvents`; y lo pedido con retraso (`callevent 1.0 npc_post_spawn`,
 * base_npc.script:25), al final. Dentro de eso, una variable que se pone dos
 * veces vale lo que puso la ÚLTIMA ejecución.
 *
 * Lo que NO hace, igual que `visita`: no evalúa condiciones. Un `setvard` detrás
 * de un `if` cuenta como ejecutado. Y `[override]` no borra al padre aquí.
 *
 * Devuelve las dos listas por separado: `variables` (lo que queda puesto al
 * nacer) y `constantes`. Quien quiera «el valor al nacer» mira la variable y, si
 * no está, la constante — que es el `valorAlNacer` de `iaDe`.
 */
function variablesAlNacer(raiz, rutaScript, resolverVar) {
  // 1. Leer en el orden del motor: cada `#include` en su sitio (el 66).
  const bloques = [];
  const vistos = new Set();
  const leer = (ruta, hondo) => {
    if (hondo > 8) return;
    const fichero = `${raiz}/${ruta.replace(/\\/g, "/")}.script`;
    if (!existsSync(fichero) || vistos.has(fichero)) return;
    vistos.add(fichero);
    for (const p of partirScript(readFileSync(fichero, "latin1")).piezas) {
      if (p.tipo === "include") { if (p.ambito !== "cliente") leer(p.ruta, hondo + 1); continue; }
      const cab = cabeceraDe(p.lineas);
      if (cab.ambito !== "cliente") bloques.push({ nombre: cab.nombre, lineas: p.lineas });
    }
  };
  leer(rutaScript, 0);

  const valores = new Map();
  const constantes = new Map();
  const VAR = /^(setvar|setvarg|setvard)\s+(\S+)\s+(.*)$/i;
  // 2. Al cargar: `setvar`/`setvarg` en todos los bloques, gana el último; y
  //    `const` en todos los bloques, gana el primero.
  for (const b of bloques) {
    for (const l of b.lineas) {
      const k = l.match(/^const\s+(\S+)\s+(.*)$/i);
      if (k) { if (!constantes.has(k[1])) constantes.set(k[1], k[2].trim()); continue; }
      const m = l.match(VAR);
      if (m && m[1].toLowerCase() !== "setvard") valores.set(m[2], m[3].trim());
    }
  }
  // 3. Al nacer: los bloques que corren, en orden de ejecución.
  const porNombre = new Map();
  for (const b of bloques) {
    if (!b.nombre) continue;
    if (!porNombre.has(b.nombre)) porNombre.set(b.nombre, []);
    porNombre.get(b.nombre).push(b.lineas);
  }
  const diferidos = [];
  const pisados = new Set();
  const correr = (lineas, hondo) => {
    for (const l of lineas) {
      const m = l.match(VAR);
      if (m) { valores.set(m[2], m[3].trim()); continue; }
      const c = l.match(/^callevent\s+(.+)$/i);
      if (!c) continue;
      // La misma regla del retraso que `visita` (scriptcmds.cpp:2257-2266).
      const t = c[1].trim().split(/\s+/);
      if (t.length > 1 && /^\d/.test(resolverVar(t[0]))) diferidos.push([t[1], hondo + 1]);
      else evento(t[0], hondo + 1);
    }
  };
  const evento = (nombre, hondo) => {
    const n = resolverVar(nombre).toLowerCase();
    if (hondo > 6 || pisados.has(n)) return;
    pisados.add(n);
    for (const lineas of porNombre.get(n) ?? []) correr(lineas, hondo);
  };
  // El orden del motor: `spawn` y `game_spawn` (global.cpp:436-437); `npc_spawn`
  // suele llegar por `game_spawn` y si no, se corre detrás.
  for (const n of ["spawn", "game_spawn", ...NACIMIENTO]) evento(n, 0);
  for (const b of bloques) if (!b.nombre) correr(b.lineas, 0);
  while (diferidos.length) evento(...diferidos.shift());
  return { variables: valores, constantes };
}

/**
 * Lee la ficha de un NPC, siguiendo los `#include` **y los `callevent`**.
 *
 * Lo de los `callevent` no es un refinamiento: la mitad de los bichos no ponen
 * su modelo en el bloque de nacimiento. `dwarf_zombie_sbow` hace
 *
 *     { npc_spawn
 *         callevent darcher_spawn
 *     }
 *     { darcher_spawn
 *         setmodel dwarf/male1.mdl
 *         ...
 *     }
 *
 * y leyendo sólo `npc_spawn` la ficha sale vacía — que no da error, da un bicho
 * sin modelo y un mapa con un hueco donde el juego tiene un enemigo.
 *
 * Es un salto acotado —cuatro niveles, sin ciclos— y NO es ejecutar el script:
 * no se evalúan condiciones ni `$rand()`, así que de una rama `if` se toma lo
 * primero que aparezca. Se dice, porque un bicho con dos modelos posibles saldrá
 * siempre con el primero.
 *
 * `raiz` es la carpeta `scripts/`. Devuelve `null` si el fichero no está, que es
 * un caso distinto de un error: quiere decir que el mod pide un script que esta
 * copia no trae, y eso hay que decirlo y no adivinarlo.
 */
/**
 * QUÉ GUION LLEVA UNA ENTIDAD, y no es el que parece — el 67.
 *
 * Una entidad de bicho puede traer las dos claves, y **gana `scriptfile`**:
 *
 *     else if (FStrEq(pkvd->szKeyName, "scriptfile") ||
 *         (FStrEq(pkvd->szKeyName, "defscriptfile") && !m_ScriptName))
 *                                            msmonsterserver.cpp:415-416
 *
 * `scriptfile` escribe `m_ScriptName` **siempre**; `defscriptfile` sólo si está
 * vacío. Así que el orden de las claves dentro de la entidad da igual: si
 * `defscriptfile` va primero lo pisa el `scriptfile` de después, y si va segundo
 * se encuentra el sitio ocupado y no hace nada. `defscriptfile` es, literalmente,
 * el valor **por omisión** que el editor deja puesto.
 *
 * Esto estaba al revés —`defscriptfile ?? scriptfile`—, y no daba ningún error
 * porque el valor de reposo es un bicho válido: **3 373 criaturas en 81 mapas**
 * salían con el guion de su clase en vez del suyo. En Edana son 10, y seis son
 * vecinos: el sumo sacerdote, el maestro y tres sacerdotes salían como
 * `NPCs/default_human`, el viejo también, el cofre del alcalde era un cofre
 * cualquiera y los dos jabalíes especiales —`edana/boarhard` y el jefe de 60 de
 * vida— eran dos jabalíes de 20. En Gate City son 4 y son ratas que deberían
 * ser arañas pequeñas: otra vez el mapa que había, con cuatro, no lo enseñaba.
 */
export function guionDeEntidad(e) {
  return e?.scriptfile || e?.defscriptfile || null;
}

export function leerFichaNpc(raiz, rutaScript) {
  const indice = new Map();
  const vars = new Map();
  const vistos = new Set();
  const orden = [];
  if (!recoger(raiz, rutaScript, vistos, 0, indice, vars, orden)) return null;

  const ficha = {};
  const cuerpos = new Map();
  const estadisticas = new Map();
  const pisados = new Set();
  // `diferido`: este evento corre por un `callevent` con retraso. Ver la nota
  // larga del `callevent`, más abajo: lo diferido SÓLO RELLENA.
  const visita = (evento, hondo, diferido = false) => {
    if (hondo > 4 || pisados.has(evento)) return;
    pisados.add(evento);
    for (const b of indice.get(evento) ?? []) {
      for (const l of b) {
        const p = l.match(CAMPOS);
        if (p) {
          const clave = p[1].toLowerCase();
          const valor = p[2].trim();
          // Un `$función(...)` es una expresión que este lector no evalúa: no es
          // un valor. Lo diferido no rellena con eso — `doom_plant_new` ganaba
          // `$stradd(LEVEL_PREFIX,idle1)` de animación, peor que nada. Y se mira
          // el valor RESUELTO: la línea es `setidleanim ANIM_IDLE`, y el `$`
          // sólo aparece al seguir la variable — mirando el texto crudo, la
          // guarda no lo veía (medido: la planta lo seguía ganando).
          if (ficha[clave] === undefined && !(diferido && resolverVar(valor).startsWith("$"))) ficha[clave] = valor;
          continue;
        }
        // `setmodelbody indice valor` elige el submodelo de cada `bodypart`:
        // es el hacha del enano, el arco del zombi y la cabeza del goblin. Aquí
        // gana el ULTIMO y no el primero, porque el motor los ejecuta en orden y
        // `gatecity/miner` pone el 1 y luego el 8 — con el primero sale desarmado.
        const b2 = l.match(/^setmodelbody\s+(\d+)\s+(\d+)/i);
        if (b2) {
          // Lo diferido no PISA un `bodypart` ya puesto, aunque aquí gane el
          // último: ver la nota del `callevent`, el caso de los enanos.
          if (!diferido || !cuerpos.has(Number(b2[1]))) cuerpos.set(Number(b2[1]), Number(b2[2]));
          continue;
        }
        // `setstat <nombre> <v0> [v1] [v2]`. No es un campo más: no cabe en
        // `CAMPOS` porque un bicho pone VARIAS —la araña pone `awareness 20` y
        // `parry 50 0 0`— y ahí gana la primera, o sea que el parry se perdía.
        //
        // Y lo que hace el motor con esta línea depende de quién la ejecute
        // (`npcscript.cpp:1299`): en un MONSTRUO sólo `parry` tiene efecto, y ni
        // siquiera toca la estadística — pone el scriptvar `MONSTER_PARRY`. Todo
        // lo demás, `setstat awareness 20` incluido, **no hace nada**: el `for`
        // que escribe las substats está dentro de `if (IsPlayer())`.
        const st = l.match(/^setstat\s+(\S+)((?:\s+-?[\d.]+)+)\s*$/i);
        if (st) {
          if (!diferido || !estadisticas.has(st[1].toLowerCase())) {
            estadisticas.set(st[1].toLowerCase(), st[2].trim().split(/\s+/).map(Number));
          }
          continue;
        }
        // La FAMILIA DE PIEL. `dwarf/male1.mdl` tiene siete y
        // `NPCs/default_dwarf.script` elige una con
        // `setprop ent_me skin $rand(1,6)`. Quedarse con la 0 —que es lo que
        // pasaba— pone a todos los enanos del pueblo la piel base sin teñir, y
        // el juego los tiene con barba roja, negra y blanca.
        const pi = l.match(/^(?:setprop\s+\S+\s+skin|setmodelskin|setskin)\s+(.+)$/i);
        if (pi && ficha.piel === undefined) { ficha.piel = pi[1].trim(); continue; }
        // ── `callevent [retraso] <evento>`: el primer token puede ser el RETRASO ──
        //
        // El 89, al hornear `edanasewers`. Esto era `/^callevent\s+(\S+)/`, que se
        // queda con el PRIMER token — y en `callevent 0.1 bat_spawn` el primer
        // token es el retraso. O sea que todo `callevent` con retraso se seguía
        // hasta un evento llamado «0.1», que no existe, y en silencio. Los 16
        // murciélagos de las cloacas se quedaban sin `setmodel` —vive en
        // `bat_spawn`, al que llega `bat_base.script:27` con `callevent 0.1`— y
        // **no se colocaba ninguno**. Gate City y Edana no tienen murciélagos.
        //
        // La regla del motor, ScriptCmd_CallEvent (scriptcmds.cpp:2257-2266):
        // con un parámetro, ése es el evento; con más, si el PRIMER CARÁCTER del
        // primero es un dígito, es el retraso y el evento es el siguiente. Los
        // parámetros llegan ya resueltos, así que `callevent FLIGHT_CHECK_FREQ
        // flight_check` también lleva retraso: se resuelve antes de mirar.
        //
        // Y un evento con retraso corre DESPUÉS de que acabe el bloque que lo
        // llama, así que se aplaza a la cola de `diferidos` y no se visita aquí
        // en línea.
        //
        // ── LO DIFERIDO SÓLO RELLENA, y esto lo enseñó la medida ─────────────
        //
        // Lo escribí primero diciendo que la cola hacía el cambio «aditivo por
        // construcción». **Era falso**: comparado el lector viejo con el nuevo
        // sobre los 2 884 guiones, 274 sólo ganaban un valor pero **114 CAMBIABAN
        // uno que ya tenían**, todos en `cuerpos` — porque ahí gana el ÚLTIMO, y
        // lo diferido llega el último.
        //
        // Y no era una mejora que se pudiera quedar: `NPCs/default_dwarf`, que
        // son los vecinos de Gate City, cambiaba la mano de 1 a 0 porque
        // `set_lantern` pone `setmodelbody 2 0`, y a `set_lantern` se llega por
        // `callevent 1.0 do_lantern` **sólo si `$rand(1,2) == 1`**. Este lector no
        // evalúa condiciones, así que aplicaba una moneda al aire a TODOS los
        // enanos del pueblo. Así que lo diferido rellena lo vacío y no pisa nada:
        // ni un campo, ni un `bodypart`, ni un `setstat`.
        //
        // Lo que eso CUESTA, y se dice en vez de esconderlo: cuando el evento
        // diferido es incondicional y de verdad cambia algo, se pierde. El caso
        // medido es `m2_quest/bgoblin_weak`: `npc_spawn` llama sin condición a
        // `callevent 0.01 goblin_set_weapon`, que le pone el arma, y aquí el
        // goblin sigue saliendo como salía antes, desarmado. Ninguno de los tres
        // mapas horneados tiene ese goblin.
        const c = l.match(/^callevent\s+(.+)$/i);
        if (c) {
          const t = c[1].trim().split(/\s+/);
          const p0 = resolverVar(t[0]);
          if (t.length > 1 && /^\d/.test(p0)) diferidos.push([t[1].toLowerCase(), hondo + 1, true]);
          else visita(t[0].toLowerCase(), hondo + 1, diferido);
        }
      }
    }
  };
  const resolverVar = (v, n = 0) => (n < 8 && vars.has(v) ? resolverVar(String(vars.get(v)).trim(), n + 1) : v);
  const diferidos = [];
  for (const n of NACIMIENTO) visita(n, 0);
  // Lo que se pidió con retraso, cuando lo inmediato ya ha corrido. Un diferido
  // puede pedir a su vez otro: por eso es una cola y no un `for` de una pasada.
  while (diferidos.length) visita(...diferidos.shift());

  // Resolver variables. Un valor puede ser otra variable —`setmodel SPIDER_MODEL`
  // y `setvar SPIDER_MODEL monsters/spider.mdl`—, así que se sigue la cadena.
  const resuelve = (v, n = 0) => {
    if (v === undefined || n > 8) return v;
    const t = v.trim();
    return vars.has(t) ? resuelve(vars.get(t), n + 1) : t;
  };
  const fichaResuelta = {};
  for (const [k, v] of Object.entries(ficha)) fichaResuelta[k] = resuelve(v);

  return {
    script: rutaScript, ruta: `${raiz}/${rutaScript}.script`,
    vars, ficha: fichaResuelta, estadisticas, resuelve,
    // Las variables como quedan al nacer (el 92): ver `variablesAlNacer`.
    alNacer: variablesAlNacer(raiz, rutaScript, resolverVar),
    // Los `bodypart` elegidos, por índice. El número de `body` que pide
    // `mallaDe()` se compone con las bases del propio modelo, así que se deja en
    // crudo: componerlo aquí obligaría a abrir el `.mdl` desde el lector de
    // scripts, y son dos cosas distintas.
    cuerpos: [...cuerpos].sort((a, b) => a[0] - b[0]),
    // Los bloques por nombre de evento. Hace falta fuera porque hay un evento
    // —`npc_struck`— del que sí leemos el cuerpo y no sólo las constantes:
    // ver `sonidosDeEvento`.
    eventos: indice,
    bloques: orden.length, ficheros: vistos.size,
  };
}

/**
 * LOS SONIDOS QUE UN EVENTO TOCA. Hoy sólo se usa con `npc_struck`.
 *
 * Esto es lo más cerca de interpretar un script que llega este lector, y se
 * hace por una razón concreta: **el sonido de recibir un golpe no está en
 * ninguna constante con nombre fijo**. Cada bicho lo monta a mano en su propio
 * evento, y con la lista en el orden que le da la gana:
 *
 *     { eventname npc_struck
 *       volume 5
 *       playrandomsound 2 SOUND_HIT SOUND_HIT2 SOUND_STRUCK1 SOUND_STRUCK2 SOUND_STRUCK3 }
 *                                            monsters/goblin.script:76-81
 *
 * Y de ahí sale una cosa que sólo se oye jugando: **dos de esas cinco son
 * `c_gargoyle_hit1.wav` y `c_gargoyle_hit2.wav`**, o sea el golpe metálico. No
 * es un fallo del mod ni nuestro: el goblin suena a chapa el 40 % de las
 * veces porque reutilizaron la muestra de la gárgola.
 *
 * ── Repetir un nombre es la forma de darle peso ──────────────────────────
 *
 * El motor sortea uniformemente sobre la lista tal cual:
 *
 *     pszSound = Params[NextParm + RANDOM_LONG(0, Params.size() - (Volume > -1 ? 3 : 2))];
 *                                            scriptcmds.cpp:4730-4733
 *
 * así que los autores repiten para pesar. La rata gigante pone `SOUND_PAIN`
 * dos veces en cinco y el zombi enano pone `SOUND_STRUCK SOUND_STRUCK
 * SOUND_PAIN1` con el comentario «most common» / «rare» al lado. Quitar los
 * repetidos —que es lo que pide el cuerpo— cambia la mezcla.
 *
 * ── Y lo que NO hace ─────────────────────────────────────────────────────
 *
 * No evalúa condiciones. El zombi tiene sus dos `playrandomsound` detrás de un
 * `if` de vida y el de sangrado detrás de otro; aquí salen los tres juntos en
 * una bolsa. Se dice en vez de fingir: la paleta de sonidos es la buena y el
 * reparto entre «por encima de media vida» y «por debajo» no lo tenemos.
 *
 * El primer parámetro es el canal y el segundo es el volumen **sólo si empieza
 * por un dígito** (`isdigit(Params[1].c_str()[0])`, scriptcmds.cpp:4705), que
 * es como `CHAN_VOICE 8` y `2 SOUND_HIT` se distinguen sin una tabla de canales.
 */
export function sonidosDeEvento(f, nombre) {
  const bloques = f?.eventos?.get(String(nombre).toLowerCase()) ?? [];
  const fuera = [];
  for (const b of bloques) {
    for (const cruda of b) {
      const l = cruda.replace(/\/\/.*$/, "").trim();
      // No se ancla al principio de la línea: la mitad de los `playsound` del
      // mod van detrás de un `if ( X )` en la misma línea, y el zombi enano
      // tiene TODOS los suyos así. Anclarlo deja al zombi mudo.
      const m = l.match(/\b(?:sv)?play(?:random)?sound\s+(.+)$/i);
      if (!m) continue;
      // Se resuelve ANTES de mirar quién es el volumen, que es lo que hace el
      // motor: a `ScriptCmd_PlaySound` le llegan los parámetros ya sustituidos,
      // así que el `isdigit(Params[1][0])` de scriptcmds.cpp:4705 mira el VALOR.
      // La araña escribe `playrandomsound game.sound.body SPIDER_VOLUME ...` y
      // `SPIDER_VOLUME` vale 10: mirando el nombre, el 10 se cuela de sonido.
      const t = m[1].split(/\s+/).filter(Boolean).map((x) => ({
        crudo: x, valor: String(f.resuelve(x) ?? x).trim(),
      }));
      let i = 1;
      if (/^\d/.test(t[1]?.valor ?? "")) i = 2;
      for (const s of t.slice(i)) {
        // Sin resolver y sin pinta de fichero es una constante que este script
        // no declara: el motor tocaría algo que no existe y aquí se deja fuera.
        // Con pinta de fichero es una ruta escrita a pelo, que también las hay.
        if (!s.valor || (s.valor === s.crudo && !/\.wav$/i.test(s.valor))) continue;
        fuera.push(s.valor.replace(/\\/g, "/").replace(/^"|"$/g, ""));
      }
    }
  }
  return fuera;
}

/**
 * EL DAÑO Y EL ACIERTO DE UN ATAQUE, LEÍDOS DE SU `dodamage` — el 67.
 *
 * Hay **dos estilos de declarar un ataque** en Master Sword, y el lector sólo
 * conocía el nuevo:
 *
 *     // EL NUEVO (`base_npc_attack_new`), el del goblin:
 *     setvar ATTACK_DAMAGE $randf(6,9)
 *     callevent npcatk_dodamage NPCATK_TARGET direct ATTACK_DAMAGE ATTACK_HITCHANCE
 *                                            monsters/goblin.script:69-70
 *
 *     // EL VIEJO (`base_npc_attack`), el del jabalí:
 *     { gore_forward
 *       dodamage ENTITY_ENEMY ATTACK_HITRANGE GORE_FORWARD_DAMAGE ATTACK_HITCHANCE }
 *                                            monsters/boar.script:25-29
 *
 * En el viejo **no existe `ATTACK_DAMAGE`**: el daño es una constante con el
 * nombre de la animación, y el evento que la usa se llama como la animación
 * también. Así que `rango(v("ATTACK_DAMAGE"))` daba `null`, y un `null` no da
 * error: da un bicho que te persigue, te embiste y no te quita vida.
 *
 * `dodamage <objetivo> <alcance> <daño> <acierto> [tipo]`
 *                                            npcscript.cpp:1107-1113
 *
 * O sea: el daño es `params[2]` y el acierto `params[3]`, y los dos hay que
 * resolverlos porque casi siempre son constantes.
 *
 * ── LO QUE COSTABA ─────────────────────────────────────────────────────────
 *
 * En Edana, los **6 jabalíes**: los cuatro normales, el `boarhard` y el jefe.
 * Y en Gate City, que es donde corren TODAS las sondas de combate del proyecto,
 * las **2 arañas, la escupidora y las 4 crías**. Las sondas estaban verdes
 * porque miden contra goblins y zombis, que son del estilo nuevo; ningún
 * control del proyecto se había puesto delante de una araña a ver si muerde.
 *
 * @param f       la ficha de `leerFichaNpc`
 * @param nombre  el evento de ataque, que en el estilo viejo es la animación
 */
export function danoDeEvento(f, nombre) {
  if (!nombre) return null;
  const bloques = f?.eventos?.get(String(nombre).toLowerCase()) ?? [];
  for (const b of bloques) {
    for (const cruda of b) {
      const l = cruda.replace(/\/\/.*$/, "").trim();
      // Sin anclar al principio, por la misma razón que `sonidosDeEvento`: la
      // mitad de estas líneas van detrás de un `if ( … )` en la misma línea.
      const m = l.match(/\bdodamage\s+(.+)$/i);
      if (!m) continue;
      const ps = m[1].split(/\s+/).filter(Boolean);
      if (ps.length < 4) continue;                 // `if (Params.size() >= 4)`
      return {
        dano: String(f.resuelve(ps[2]) ?? ps[2]).trim(),
        aciertos: String(f.resuelve(ps[3]) ?? ps[3]).trim(),
      };
    }
  }
  return null;
}

/** El modelo y las dos animaciones que la ficha declara, ya resueltos. */
export function modeloYAnimaciones(f) {
  if (!f) return null;
  const modelo = f.ficha.setmodel ?? null;
  if (!modelo) return null;
  return {
    modelo: modelo.replace(/\\/g, "/"),
    parado: f.ficha.setidleanim ?? null,
    andando: f.ficha.setmoveanim ?? null,
    nombre: f.ficha.name ?? null,
    // `atof` y no `Number`: `hp 700/700` son 700, no `NaN`. Ver `atof`, el 79.
    hp: vidaDe(f.ficha.hp),
    ancho: f.ficha.width ? Number(f.ficha.width) : null,
    alto: f.ficha.height ? Number(f.ficha.height) : null,
    cuerpos: f.cuerpos ?? [],
    // La piel puede venir como un número o como `$rand(a,b)`. Aquí NO se tira el
    // dado: se devuelve el rango y quien coloca elige — así dos ejecuciones dan
    // el mismo pueblo y una captura se puede volver a sacar.
    piel: (() => {
      const v = f.ficha.piel;
      if (v === undefined) return null;
      const r = String(v).match(/^\$rand\s*\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/i);
      if (r) return { min: Number(r[1]), max: Number(r[2]) };
      const n = Number(v);
      return Number.isFinite(n) ? { min: n, max: n } : null;
    })(),
    ia: iaDe(f),
  };
}

// ── LAS RAZAS, que son quién te ataca ───────────────────────────────────────
//
// `scripts/races.script` es una tabla de 178 líneas: cada raza declara sus
// `enemies`, sus `allies` y de quién está `wary`. Es dato puro, y contesta a
// una pregunta que no se puede contestar mirando los modelos: **de los 69
// bichos de Gate City, cuáles son hostiles.** Salen 33.
//
// Aquí está sólo LEER EL FICHERO. La lógica —el orden en que se miran las
// tres listas— vive en `src/bsp/razas.js`, que no toca el disco, porque la
// necesita también el navegador: importar este módulo desde el cliente hace
// que Vite externalice `node:fs` y la página no cargue.

export { RAZA_DEL_JUGADOR, RELACION, relacionDeRazas, esEnemigo } from "./razas.js";

/**
 * Las razas de `races.script`, por nombre.
 *
 * El formato es `local reg.race.<campo> <valor>` repetido y cerrado con
 * `registerrace`, o sea que se acumula y se vuelca — no es un bloque por raza.
 */
const SALTO = /\r?\n/;
export function leerRazas(raiz, ruta = "races") {
  const archivo = `${raiz}/${ruta}.script`;
  if (!existsSync(archivo)) return null;
  const tabla = new Map();
  let actual = {};
  for (const linea of readFileSync(archivo, "latin1").split(SALTO)) {
    const s = linea.replace(/\/\/.*$/, "").trim();
    if (!s) continue;
    const m = s.match(/^local\s+reg\.race\.(\w+)\s+(.*)$/i);
    if (m) {
      const lista = m[2].trim().toLowerCase().split(";").map((x) => x.trim()).filter(Boolean);
      actual[m[1].toLowerCase()] = m[1].toLowerCase() === "name" ? lista[0] : lista;
      continue;
    }
    if (/^registerrace\b/i.test(s) && actual.name) {
      tabla.set(actual.name, {
        nombre: actual.name,
        enemigos: actual.enemies ?? [],
        aliados: actual.allies ?? [],
        recelo: actual.wary ?? [],
      });
      actual = {};
    }
  }
  return tabla;
}
// ── LA FICHA DE COMBATE ─────────────────────────────────────────────────────
//
// Todo esto son DATOS del script, igual que el modelo y la animación: rangos,
// nombres de animación y probabilidades escritos a mano por quien hizo el
// monstruo. Leerlos es leer; la lógica que los usa la escribimos nosotros en
// `src/play/ia.js`.
//
// Los valores por omisión NO se inventan: están en el bloque de constantes de
// `monsters/base_npc_attack_new.script` y en `npcatk_post_load`, y el del
// alcance para moverse está en el motor (`msmonster.h:355`).

/**
 * LA CADENA DE REPUESTO DE LA MUERTE, que el motor tiene escrita y nosotros no
 * teníamos: `npc_post_spawn` en `base_npc.script:280-295` comprueba
 * `$anim_exists(ANIM_DEATH)` y si no está prueba estos cinco nombres en orden.
 *
 * No es un adorno. `NPCs/default_dwarf` declara `ANIM_DEATH diesimple` y
 * `dwarf/male1.mdl` **no tiene** `diesimple`: tiene `death`, que es el último de
 * la lista. Sin la cadena, todos los aldeanos enanos del pueblo se mueren de pie.
 */
export const MUERTES_DE_REPUESTO = ["diesimple", "diesforward", "die", "die_fallback", "death"];

/**
 * La animación de muerte que va a poder usarse de verdad, dadas las secuencias
 * que el modelo trae. `secuencias` son nombres.
 */
export function muerteQueExiste(pedida, secuencias = []) {
  const hay = new Set(secuencias.map((s) => String(s).toLowerCase()));
  if (pedida && hay.has(String(pedida).toLowerCase())) return pedida;
  for (const n of MUERTES_DE_REPUESTO) if (hay.has(n)) return n;
  return pedida ?? null;
}

/** Los de `base_npc_attack_new.script`, líneas 93-122. */
export const IA_POR_OMISION = {
  // Cada cuánto piensa. Dos relojes, y la diferencia es de veinte veces: un
  // monstruo ocioso mira alrededor cada 2 s y uno en combate diez veces por
  // segundo. Con uno solo, o gasta CPU o reacciona tarde.
  cicloOcioso: 2.0,
  cicloCombate: 0.1,
  cicloNpc: 0.8,
  /** Hasta dónde persigue antes de rendirse, en unidades. */
  alcanceDePersecucion: 4000,
  /** Oído. El del jugador es más corto que el máximo. */
  oidoMaximo: 1024,
  oidoDelJugador: 800,
  /** Probabilidad de cambiar de objetivo al que le pegue por detrás. */
  cambioDeObjetivo: 75,
  puedeCambiarDeObjetivo: true,
  tieneQueVerte: true,
  puedeHuir: true,
  puedeEncogerse: false,
  /** El del ataque sin evento en el modelo: 1 s entre golpes, 0,1 al impacto. */
  esperaEntreGolpes: 1.0,
  esperaHastaElImpacto: 0.1,
};

/**
 * `atof` DE C, QUE NO ES `Number` — experimento 79.
 *
 *     if (Params.size() == 1)
 *         m_HP = pev->health = pev->max_health = m_MaxHP = atof(Params[0]);
 *     if (Params.size() >= 2)
 *     { m_HP = pev->health = atof(Params[0]);
 *       pev->max_health = m_MaxHP = atof(Params[1]); }
 *                                            npcscript.cpp:185-196
 *
 * El comando `hp` del mod espera DOS parámetros separados por un espacio, y
 * **veintiún guiones del juego escriben `hp 700/700`**, que es uno solo. En el
 * motor eso funciona *por accidente*: `atof` lee el prefijo numérico más largo
 * y abandona en la barra, así que devuelve 700 — y como `Params.size()` vale 1,
 * la vida actual y la máxima salen las dos a 700, que es justo lo que el
 * guionista quería escribir.
 *
 * `Number("700/700")` es `NaN`, y de ahí salía un `hp: null`. **Un NPC sin vida
 * no está en `Manada.vivos()`, que exige `vida > 0`** (`manada.js:545`), y esa
 * lista es la que alimenta `candidatosDeGolpe()`: así que no se le podía pegar
 * **ni hablar**, porque el menú mira con la misma regla que la espada
 * (`main.js`, `aQuien`). Edrin, capitán de la guardia de Edana —el único NPC
 * de los tres mapas con opciones de menú de tipo `say`— era invisible para la
 * F y para el mandoble, y no daba un solo error.
 *
 * Medido sobre los 2 884 guiones: **la única clave en la que `Number` y `atof`
 * no coinciden es `hp`**, en esos 21 ficheros, y ninguna otra de las que este
 * lector convierte. Lo vigila `test/atof79.test.mjs`.
 *
 * Esto NO cambia `num`: ahí `null` significa «el guion no lo declara», que es
 * una distinción nuestra y no del mod —el mod simplemente no ejecuta la línea—
 * y de ella cuelgan dos docenas de `?? valorPorOmisión`. La diferencia que
 * queda escrita es que un valor declarado y no numérico da `null` aquí y daría
 * `0` en C; hoy no hay ninguno, y el día que lo haya lo dirá esa prueba.
 *
 * ── Y LO PEOR DEL CASO ────────────────────────────────────────────────────
 *
 * **`atof` ya estaba en este archivo**, 500 líneas más abajo, con su cita y con
 * el aviso «No es `Number()`» escrito encima — lo usa la aritmética de los
 * guiones de objetos desde el 66. Lo que faltaba no era entenderlo: era que el
 * lector de FICHAS lo usara. Es el 64 otra vez (un comando y una ventana, cada
 * uno esperando al otro) y el 66 (una pieza correcta a la que nadie llamaba).
 * Por eso aquí no se declara otro: se usa aquél.
 */
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
/** `hp`, con el `atof` del motor: declarado va por `atof`, ausente sigue `null`. */
const vidaDe = (v) => (v === undefined || v === null || String(v).trim() === "" ? null : atof(v));
/** Un texto de script viene entrecomillado: `const PARRY_TYPE "dodged!"`. */
const texto = (v) => (v === undefined || v === null ? null : String(v).trim().replace(/^(['"])(.*)\1$/s, "$2"));
/** `60%` y `60` son lo mismo; `$randf(6,9)` es un rango. */
/**
 * LOS CINCO `DROP_ITEM`, con su probabilidad (el 82).
 *
 * Devuelve `[{ objeto, probabilidad }]` en el orden del mod, y SÓLO los que
 * declaran objeto: un hueco con probabilidad y sin nombre no es un objeto, y
 * uno con nombre y sin probabilidad tampoco se tira —`$rand(1,100) <= ''` es
 * falso en el motor—, así que los dos se descartan y se dice cuál faltaba.
 *
 * La probabilidad viene como «20%» o «50%»; `rango` ya se come el `%`. Se
 * guarda el número y no un 0-1: el mod compara contra `$rand(1,100)` y
 * traducirlo aquí haría que el número horneado no se pareciera al del archivo.
 */
function botinDe(v) {
  const fuera = [];
  for (let n = 1; n <= 5; n++) {
    const objeto = v(`DROP_ITEM${n}`);
    const p = rango(v(`DROP_ITEM${n}_CHANCE`));
    if (!objeto || typeof objeto !== "string") continue;
    const nombre = objeto.trim();
    // Sin resolver no es un objeto: es el token que el guion dejó escrito.
    if (!nombre || /^DROP_ITEM\d/.test(nombre)) continue;
    if (!p || !(p.min > 0)) { fuera.push({ objeto: nombre, probabilidad: 0, porQue: "sin CHANCE" }); continue; }
    fuera.push({ objeto: nombre, probabilidad: p.min });
  }
  return fuera.length ? fuera : null;
}

function rango(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  const r = s.match(/^\$randf?\s*\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/i);
  if (r) return { min: Number(r[1]), max: Number(r[2]) };
  const n = Number(s.replace(/%$/, ""));
  return Number.isFinite(n) ? { min: n, max: n } : null;
}

/**
 * `ATTACK_DAMAGE_LOW` + `ATTACK_DAMAGE_HIGH` -> un rango (el 67).
 *
 * Con una sola de las dos no se devuelve nada: el par es la declaración, y
 * quedarse con la mitad daría un daño fijo que el bicho no tiene.
 */
function parDeRango(bajo, alto) {
  const a = rango(bajo); const b = rango(alto);
  if (!a || !b) return null;
  return { min: a.min, max: b.max };
}

/**
 * Los campos que el motor parte en trozos: `TokenizeString(s, Tokens)` con
 * separador **`;`** y nada más (`stackstring.h:218`). `1.1;1.3` son dos números
 * y `10;4` son dos ángulos.
 *
 * Devuelve `null` cuando el valor no existe — que es el caso normal, porque
 * `GetFirstScriptVar` de una constante sin definir devuelve su propio nombre y
 * `atof` de eso vale cero. Un hueco se ve; un cero se confunde con un dato.
 */
function tokensDe(v) {
  if (v === undefined || v === null) return null;
  // Y entrecomillado también: el lanzazo del bastón escribe `"1;1"`, con las
  // comillas dentro del valor, y `atof('"1')` vale cero.
  const t = String(v).trim().replace(/^["'](.*)["']$/s, "$1")
    .split(";").map((s) => Number(s.trim()));
  return t.every((n) => Number.isFinite(n)) ? t : null;
}

export function iaDe(f) {
  // SIGUIENDO LA CADENA, que es lo que hacía `ficha` y esto no. Un valor de la
  // ficha de combate puede ser otra variable igual que `setmodel SPIDER_MODEL`:
  // el zombi enano de ballesta hace `const ACT_ANIM_RUN walk` y luego
  // `setvar ANIM_RUN ACT_ANIM_RUN`, y sin resolver la cadena su animación de
  // correr era la cadena de texto `ACT_ANIM_RUN`. Eso no da error: da un nombre
  // que el modelo no tiene, y el visor cae a la secuencia 0 sin decir nada. Lo
  // mismo con `ANIM_ATTACK` -> `ANIM_SXBOW_ATTACK` -> `anim_sxbow_shoot`.
  const v = (n) => {
    const x = f.vars?.get(n);
    return f.resuelve ? f.resuelve(x) : x;
  };
  /**
   * EL VALOR AL NACER, y no «el que aparezca en algún bloque» — el 92.
   *
   * `v` lee `vars`, que trae lo puesto en CUALQUIER bloque (ver
   * `variablesAlNacer`). Para cinco campos eso era leer un evento que no corre:
   * medido sobre los 1 593 guiones con modelo, su diferencia con el valor al
   * nacer es **siempre** «había un valor de un evento muerto → no hay nada»,
   * ni un solo caso de otra clase:
   *
   *   NPC_IS_BOSS          911 fichas   `make_boss`        externals.script:791-793
   *   NPC_SELF_ADJUST      955          `set_self_adj`     :1319-1322
   *   NPC_MUST_SEE_TARGET  915          `set_blind_attack` :1227-1229
   *   FLEE_DISTANCE        955          `turn_undead`      :461, la línea :519
   *   NPC_EXP_REDUCT       968          `ext_reduct_xp`    :860-869
   *
   * Los cinco son eventos de `externals.script` que pide el MAPA (por
   * `params`), un hechizo (`turn_undead`) u otro guion con `callexternal`
   * (`dq/quests/dq_kill_target.script:72` hace `make_boss`), no el bicho al
   * nacer. Los demás campos de `iaDe` siguen
   * leyendo `v`: en ésos la diferencia mezcla el evento muerto con un `setvard`
   * de después que este lector no puede evaluar (`MY_WIDTH`,
   * `$get(ent_me,xp)`, `PARAM1`…), y cambiarlos a ciegas sería cambiar un valor
   * malo por otro. Contados en `doc/FICHAS_92.md`.
   */
  const va = (n) => {
    const a = f.alNacer;
    if (!a) return v(n);
    const x = a.variables.has(n) ? a.variables.get(n) : a.constantes.get(n);
    return f.resuelve ? f.resuelve(x) : x;
  };
  const ancho = num(f.ficha.width);
  // Los tres alcances por omisión salen de la anchura, y los factores son del
  // comentario de cabecera del propio script (líneas 11-14): moverse hasta la
  // anchura, blandir a 3x y tocar a 4x. El goblin los pisa con 90/130/130.
  const porAncho = (k) => (ancho ? ancho * k : null);
  // El `dodamage` del evento que se llama como la animación de golpe (el 67).
  const delGolpe = danoDeEvento(f, v("ANIM_ATTACK"));
  return {
    // Las animaciones. `ANIM_RUN` es la de perseguir y `setmoveanim` la de
    // pasear: no son la misma, y usar la de pasear para perseguir es lo que
    // hace que un monstruo te siga andando tranquilamente.
    corriendo: v("ANIM_RUN") ?? null,
    andando: v("ANIM_WALK") ?? f.ficha.setmoveanim ?? null,
    golpe: v("ANIM_ATTACK") ?? null,
    muerte: v("ANIM_DEATH") ?? null,
    /** A qué distancia blande, a cuál acierta y a cuál se para. */
    alcanceDeGolpe: num(v("ATTACK_RANGE")) ?? porAncho(3),
    alcanceDeImpacto: num(v("ATTACK_HITRANGE")) ?? porAncho(4),
    alcanceParaPararse: num(v("MOVE_RANGE")) ?? ancho,
    /** Y a cuál se considera «he llegado»: `m_Width * 1.1` (msmonster.h:355). */
    cercaniaDeDestino: ancho ? ancho * 1.1 : null,
    // EL ORDEN IMPORTA, y es éste: primero lo que el script DECLARA, y sólo si
    // no lo declara, lo que su evento de ataque PASA a `dodamage` (el 67). El
    // estilo nuevo pone `ATTACK_DAMAGE` y el viejo no lo tiene; al revés, un
    // bicho del estilo nuevo con un `dodamage` heredado de la plantilla se
    // quedaría con el daño de la plantilla, que es el fallo del 66 con otra
    // ropa. `danoDeEvento` pide el nombre de la ANIMACIÓN de golpe porque en el
    // estilo viejo el evento de ataque se llama igual que ella.
    // Y `ATTACK_ACCURACY` es el tercer nombre del acierto: la araña escribe
    // `const ATTACK_ACCURACY 60%` y su `xdodamage` lo pasa ahí.
    aciertos: rango(v("ATTACK_HITCHANCE")) ?? rango(v("ATTACK_ACCURACY"))
      ?? rango(delGolpe?.aciertos),
    // TRES FUENTES, en este orden, y las tres están en el mod (el 67):
    //
    //   1. `ATTACK_DAMAGE`                   el estilo NUEVO: goblin, zombi
    //   2. el `dodamage` de su animación     el estilo VIEJO: jabalí
    //   3. `ATTACK_DAMAGE_LOW`/`_HIGH`       el par, 49 ficheros: arañas,
    //                                        esqueletos, cadáveres
    //
    // El par se lee de las constantes DECLARADAS y no del `xdodamage` que lo
    // consume, a propósito: la araña lo usa como
    // `local ATTACK_DAMAGE $randf(ATTACK_DAMAGE_LOW,ATTACK_DAMAGE_HIGH)`
    // (`spider_base.script:33`), y un `local` no vive en las variables del
    // script. Buscar el `dodamage` de la araña además obligaría a recorrer
    // TODOS sus eventos, y entonces el `dodamage ent_laststole …` del guardia
    // del alcalde —que es el castigo por robarle, no su ataque— pasaría por
    // daño de ataque. Leer las dos constantes es lo que el bicho declara.
    dano: rango(v("ATTACK_DAMAGE")) ?? rango(delGolpe?.dano)
      ?? parDeRango(v("ATTACK_DAMAGE_LOW"), v("ATTACK_DAMAGE_HIGH")),
    /**
     * EL BOTÍN, que NO se decide al morir (el 82).
     *
     * `base_monster_shared.script:228-250` lo sortea dentro de
     * `npc_post_spawn` —un segundo después de nacer— y hace `giveitem`, o sea
     * que **se lo da al bicho**; al morir, `DropAllItems()` tira su inventario
     * al suelo (msmonsterserver.cpp:2614, :2628, :2638). Así que «el jabalí no
     * suelta su pellejo» no es un fallo del camino de la muerte: es que nunca
     * lo llevó encima. Por eso esto se lee aquí y se sortea al nacer.
     *
     * Son cinco huecos en el mod y el bucle es el mismo para los cinco, pero
     * **sólo dos los usa alguien**: `DROP_ITEM1` en 61 ficheros y `DROP_ITEM2`
     * en 7; del 3 al 5, cero. Se leen los cinco porque cuesta lo mismo, y los
     * tres vacíos se declaran sin caso en vez de contarse como portados — la
     * regla del 50.
     *
     * LAS TRES GUARDAS NO SE LEEN, y conviene decir por qué una por una.
     * `G_NO_DROP` y `OVERRIDE_NODROP` (`:221-225`) son de la PARTIDA y no del
     * bicho. Y `NPC_NO_DROPS` (`:228`) **lo leí primero y estaba mal**: salía
     * `true` para los cuatro jabalíes y la rata, o sea que habría anulado
     * exactamente lo que esta línea viene a leer.
     *
     * La causa es de este lector y merece saberse: `recoger` cosecha los
     * `setvar`/`setvard`/`const` de **todos los bloques de todo lo que se
     * incluye**, corran o no, y `NPC_NO_DROPS 1` sólo existe dentro del evento
     * `ext_no_drops` de `monsters/externals.script:881-884` —«add param to
     * remove drops for exploitable monsters»—, al que **no llama nadie en los
     * 2 884 guiones**. O sea que al nacer vale siempre lo que no está puesto, y
     * portarlo desde `vars` sería portar el valor de un bloque que no se
     * ejecuta. Si algún día hay un camino que lo encienda, se lee de ahí.
     *
     * AÑADIDO EN EL 92: el 82 lo vio en UNA variable y lo arregló en esa. La
     * misma trampa, del mismo fichero, estaba en otras cinco que `iaDe` sí leía
     * —jefe, autoajuste, `NPC_MUST_SEE_TARGET`, `FLEE_DISTANCE` y
     * `NPC_EXP_REDUCT`— y en 911 a 968 fichas cada una. Ahora hay
     * `variablesAlNacer` y esas cinco la usan (ver `va`, arriba). Las
     * probabilidades del botín (`DROP_ITEMn_CHANCE`) tienen la misma trampa
     * —el `0%` de `ext_no_drops2`, :886-894— y siguen leyendo `v`: medido, sólo
     * cambian `0%` por nada, y `botinDe` da probabilidad 0 en los dos casos
     * («sin CHANCE»), así que hoy no deciden nada. Pendiente de pasar a `va`.
     */
    botin: botinDe(v),
    // `CAN_HUNT` y `HUNT_AGRO` se leen porque están, pero **no deciden nada
    // aquí**, y eso lo escribí mal primero: son del `base_npc_attack.script`
    // VIEJO. El goblin incluye `base_monster_new` -> `base_npc_attack_new`, y
    // en ése la condición de cazar es `!NPC_CUSTOM_HUNT && !SUSPEND_AI &&
    // !IS_FLEEING`; `CAN_HUNT` no aparece. Quien decide si te persigue es la
    // RELACIÓN DE RAZAS, y por eso está en `relacionDeRazas`. Usar esto habría
    // dado un pueblo lleno de aldeanos pacíficos por accidente y un zombi
    // pacífico también, que sí es un fallo.
    // LOS SONIDOS DEL BICHO, que los declara él y no el motor: cada monstruo
    // nombra los suyos y hay reutilización descarada —el goblin grita con
    // `monsters/orc/pain.wav` y golpea con `c_gargoyle_hit1.wav`—, así que
    // inventarse una convención por el nombre del bicho da rutas que no existen.
    sonidos: {
      muerte: [v("SOUND_DEATH"), v("SOUND_DEATH2")].filter(Boolean),
      dolor: [v("SOUND_PAINYELL"), v("SOUND_PAIN"), v("SOUND_PAIN1"), v("SOUND_PAIN2")].filter(Boolean),
      ataque: [v("SOUND_ATTACK1"), v("SOUND_ATTACK2"), v("SOUND_ATTACK3")].filter(Boolean),
      golpe: [v("SOUND_HIT1"), v("SOUND_HIT2")].filter(Boolean),
      // EL DE RECIBIR, que hasta el 21 no estaba y por eso sonaba el grito de
      // dolor en cada golpe. No sale de una constante: sale del cuerpo del
      // evento `npc_struck`, con los repetidos puestos porque repetir es como
      // el mod le da peso a un sonido. Ver `sonidosDeEvento`.
      recibir: sonidosDeEvento(f, "npc_struck"),
    },
    canHuntViejo: num(v("CAN_HUNT")),
    huntAgroViejo: num(v("HUNT_AGRO")),
    tieneQueVerte: num(va("NPC_MUST_SEE_TARGET")) !== 0,
    puedeHuir: num(v("CAN_FLEE")) !== 0,
    cambioDeObjetivo: rango(v("RETALIATE_CHANCE"))?.min ?? IA_POR_OMISION.cambioDeObjetivo,
    esperaDeCambio: rango(v("NPC_DELAY_RETALITATE")) ?? { min: 5, max: 10 },
    // EL PARRY DEL BICHO, que es el scriptvar `MONSTER_PARRY` y no la
    // estadística. De los 25 scripts de Gate City lo pone UNO: la araña, con 50.
    parry: num(f.estadisticas?.get("parry")?.[0]) ?? 0,
    /** La animación de esquivar y el texto que te sale. `spider.script:20`. */
    esquiva: v("ANIM_DODGE") ?? null,
    mensajeDeParry: texto(v("PARRY_TYPE")) ?? "parried!",
    // ENCOGERSE. Los cinco valores y sus omisiones son de `npcatk_checkflinch` y
    // `npcatk_get_postspawn_properties`: `CAN_FLINCH` es **0 por omisión**, el
    // umbral de daño es el 10 % de la vida máxima y la vida a partir de la cual
    // se permite es la vida máxima entera (o sea siempre, una vez activado).
    encogerse: {
      puede: num(v("CAN_FLINCH")) === 1,
      animacion: v("FLINCH_ANIM") ?? v("ANIM_FLINCH") ?? null,
      probabilidad: rango(v("FLINCH_CHANCE"))?.min ?? 0,
      umbralDeDano: num(v("FLINCH_DAMAGE_THRESHOLD")) ?? (vidaDe(f.ficha.hp) ?? 0) * 0.1,
      vidaParaEmpezar: num(v("FLINCH_HEALTH")) ?? vidaDe(f.ficha.hp),
      espera: rango(v("FLINCH_DELAY"))?.min ?? 5.0,
    },
    // HUIR. `CAN_FLEE` es 1 por omisión pero `FLEE_HEALTH` es 0, así que por
    // omisión **no huye nadie**: hay que poner las dos. En Gate City las ponen
    // la rata gigante (2 de vida, 30 %) y el zombi enano (25 de vida, 25 %).
    huir: {
      puede: num(v("CAN_FLEE")) !== 0,
      nunca: num(v("CANT_FLEE")) === 1,
      vida: num(v("FLEE_HEALTH")) ?? 0,
      probabilidad: rango(v("FLEE_CHANCE"))?.min ?? 0,
      distancia: num(va("FLEE_DISTANCE")) || 1000,
      tiempo: num(v("FLEE_TIME")) || 10.0,
    },
    // EL TERCER SISTEMA DE ENCOGERSE, el de `base_struck.script`, que es el que
    // corre en Gate City. Sólo existe si el bicho hace `#include base_struck`:
    // si no lo incluye, ninguna de estas constantes está y `usaEncogerse` sale
    // false, que es exactamente lo que queremos. De los 25 scripts del pueblo lo
    // incluye uno, el zombi enano de ballesta, por la vía de `dwarf_zombie_sbow`.
    struck: {
      material: v("NPC_MATERIAL_TYPE") ?? null,
      usaEncogerse: num(v("NPC_USE_FLINCH")) === 1,
      usaDolor: num(v("NPC_USE_PAIN")) === 1,
      animacion: v("ANIM_FLINCH") ?? null,
      /** Treinta segundos entre encogimientos, y es un mínimo duro. */
      esperaEntreEncogerse: num(v("NPC_FREQ_FLINCH")) ?? 30.0,
      /** Ratio de la vida ACTUAL, no de la máxima. Ver `reaccion.js`. */
      umbralDeEncogerse: num(v("NPC_FLINCH_THRESH")) ?? 0.1,
      tiempoQuieto: num(v("NPC_FLINCH_TIME")) ?? 1.5,
      sonidosDeEncogerse: [v("SOUND_FLINCH1"), v("SOUND_FLINCH2"), v("SOUND_FLINCH3")].filter(Boolean),
      sonidosDeDolor: [v("SOUND_PAIN1"), v("SOUND_PAIN2"), v("SOUND_PAIN3")].filter(Boolean),
      /** Y los de recibir sin más, que si el bicho no los pone son del material. */
      sonidosDeGolpe: [v("SOUND_STRUCK1"), v("SOUND_STRUCK2"), v("SOUND_STRUCK3")].filter(Boolean),
    },
    puedeCambiarDeObjetivo: num(v("CAN_RETALIATE")) !== 0,
    /** Avisar a los aliados. El alcance sale de la vida máxima, ver `reaccion.js`. */
    noAvisa: num(v("NO_ALERT_ALLIES")) === 1,
    experiencia: num(v("NPC_GIVE_EXP")),
    /**
     * `NPC_SELF_ADJUST` — si el bicho sube de nivel con la vida total de los
     * jugadores. No lo trae el motor: lo pide el script, con `setvar
     * NPC_SELF_ADJUST 1` o llamando a `set_self_adj` (que es un evento de
     * `externals.script` y lo normal es que lo invoque el mapa por addparams).
     *
     * Se lee para poder DECIR que en Gate City no lo pide nadie, que es
     * distinto de suponerlo: los 25 scripts del pueblo dan 0 y en el `.bsp`
     * no aparece la cadena. Ver `src/juego/servidor.js`.
     *
     * CORRECCIÓN DEL 92: «los 25 scripts del pueblo dan 0» dejó de ser verdad
     * en el 82, cuando `#include [server] monsters/externals` empezó a cargarse
     * y con él `set_self_adj` (:1319-1322): desde entonces `v` leía su `1` y
     * **los 25 daban 1**, herrero y tabernero incluidos. La frase era cierta
     * del lector que había cuando se escribió. Por eso ahora es `va`.
     */
    seAjusta: num(va("NPC_SELF_ADJUST")) === 1,
    /** `NPC_IS_BOSS`: el ×4 de FuzzNet. Tampoco lo pide nadie aquí. */
    esJefe: num(va("NPC_IS_BOSS")) === 1,
    /** `NPC_EXP_REDUCT`, la rebaja propia. Se guarda como TEXTO: ver `expadj`. */
    reduccionDeExp: va("NPC_EXP_REDUCT") ?? null,
    vida: vidaDe(f.ficha.hp),
    ancho, alto: num(f.ficha.height),
    raza: f.ficha.race ?? null,
    pasea: num(f.ficha.roam) === 1,
  };
}

// ── EL CATÁLOGO DE OBJETOS ──────────────────────────────────────────────────
//
// 861 scripts en `items/`, de los que **789 heredan** de una plantilla con
// `#include`. Un objeto se lee así:
//
//     { const MELEE_DMG 90   const MELEE_STAT swordsmanship  ... }   <- sus números
//     #include items/swords_base_onehanded                            <- qué ES
//     { eventname weapon_spawn   name Rusty Short Sword  weight 10 }  <- su ficha
//
// La base usa las constantes del objeto (`local reg.attack.dmg MELEE_DMG`) y
// llama a `registerattack`. O sea que **el tipo de un objeto no lo dice el
// objeto: lo dice su base**, y el daño no lo dice la base: lo dice el objeto.
// Hay que leer los dos y en el orden bueno.
//
// Esto NO es un intérprete y no lo pretende: no evalúa condiciones, no tira
// dados y no ejecuta eventos. Saca la FICHA, que es lo que necesita una tabla
// de objetos, igual que `leerFichaNpc` saca la del bicho.

/** Los campos de ficha de un objeto, y cómo se llaman en nuestro lado. */
const CAMPOS_OBJETO = {
  name: "nombre", desc: "descripcion", weight: "peso", size: "tamano",
  value: "valor", quality: "calidad",
};

/**
 * Las marcas sin valor: estar escritas ya significa que sí.
 *
 * `wearable` estaba aquí y **no pertenece**: pide parámetros y sin ellos el
 * motor no hace nada. Se lee aparte, en `recogerObjeto`.
 */
const MARCAS_OBJETO = ["groupable", "useable"];

/** Qué hace que un objeto sea de un tipo u otro. Lo declara su base. */
const REGISTROS = {
  registerattack: "arma", registerarmor: "armadura", registerprojectile: "proyectil",
  registerspell: "hechizo", registercontainer: "contenedor", registerdrink: "bebida",
};

/**
 * Recorre un script y lo que incluye **en orden de ejecución**, aplicando las
 * dos reglas de precedencia. Devuelve las constantes, la ficha y las marcas.
 */
function recogerObjeto(raiz, rutaScript, vistos, profundidad, acc) {
  if (profundidad > 8) return false;
  const barras = (s) => s.split("\\").join("/");
  const ruta = `${raiz}/${barras(rutaScript)}.script`;
  if (!existsSync(ruta)) return false;
  if (vistos.has(ruta)) return true;
  vistos.add(ruta);
  acc.ficheros.push(barras(rutaScript));

  const { piezas } = partirScript(readFileSync(ruta, "latin1"));
  for (const pieza of piezas) {
    if (pieza.tipo === "bloque") {
      // Cada bloque es un EVENTO de la lista del motor, con su número de orden.
      // Hace falta guardarlos todos —y quién llama a quién— porque el borrado
      // del `[override]` no se puede aplicar sobre la marcha: sólo se sabe al
      // acabar el árbol.
      acc.bloque++;
      const cab = cabeceraDe(pieza.lineas);
      // `lineas` se guarda desde el 71: el cuerpo del suelo de un objeto no es
      // una constante, son las órdenes de su `game_fall` — ver `caidaDe`.
      acc.evento = {
        nombre: cab.nombre, bloque: acc.bloque, anula: cab.anula,
        llama: [], registros: [], lineas: pieza.lineas,
      };
      acc.eventos.push(acc.evento);
    }
    if (pieza.tipo === "include") {
      // EL 82. Aquí había un `.replace(/^\[[a-z]+\]\s*/i, "")` con el aviso
      // correcto encima —«sin quitarlo, el cierre de dependencias sale corto y
      // no avisa»— y **le llegaba `"[server]"` a secas**, porque el que partía
      // la línea se quedaba con el corchete y tiraba la ruta. O sea que quitaba
      // el ámbito de una cadena que era SÓLO el ámbito, y el resultado era la
      // cadena vacía: el aviso se apuntaba en `faltan` con el nombre en blanco.
      // El ámbito lo reparte ahora `includeDe`; ésta ya recibe la ruta buena.
      const limpio = pieza.ruta.replace(/^"|"$/g, "");
      if (pieza.ambito === "cliente") continue;
      if (!recogerObjeto(raiz, limpio, vistos, profundidad + 1, acc)) acc.faltan.push(limpio);
      continue;
    }
    for (const l of pieza.lineas) {
      const c = l.match(/^const(_ovrd)?\s+(\S+)\s+(.*)$/i);
      if (c) {
        // `const` gana el primero; `const_ovrd` existe justamente para pisar.
        if (c[1] || !acc.constantes.has(c[2])) acc.constantes.set(c[2], c[3].trim());
        continue;
      }
      const campo = l.match(/^([a-z]+)\s+(.+)$/i);
      if (campo && CAMPOS_OBJETO[campo[1].toLowerCase()]) {
        acc.ficha.set(CAMPOS_OBJETO[campo[1].toLowerCase()], campo[2].trim());
        continue;
      }
      // `local reg.attack.X  VALOR` es el INTERFAZ de verdad entre un objeto y
      // su base, y por eso se lee esto y no las constantes por prefijo.
      //
      // El primer intento buscaba `MELEE_DMG`, y hay al menos tres familias de
      // prefijo —`MELEE_`, `MISSILE_` y `RANGED_`—. Adivinarlas dejaba 29 de
      // 178 armas sin habilidad, y una espada sin habilidad no da error: da un
      // arma que no entrena nada.
      const reg = l.match(/^local\s+reg\.attack\.([a-z0-9_.&]+)\s+(.*)$/i);
      if (reg) { acc.ataque.set(reg[1].toLowerCase(), reg[2].trim()); continue; }

      // Y el mismo canal para el PROYECTIL, que es otro juego de campos y otra
      // función del motor (`RegisterProjectile`, giprojectile.cpp:24). Un arco no
      // lleva daño: lo lleva la flecha, y la flecha lo declara aquí.
      //
      // Y aquí el `local` NO viene solo, que es lo que costó ver: `proj_base`
      // escribe el daño con la condición delante, en la misma línea.
      //
      //     if ( !HITSCAN_BOLT ) local reg.proj.dmg PROJ_DAMAGE
      //     else local reg.proj.dmg 0
      //     if ( HEAVY_ONLY ) local reg.proj.dmg PROJ_DAMAGE
      //
      // Esto no evalúa condiciones —nunca lo ha hecho— así que se queda con la
      // última, y para una flecha las tres ramas dan `PROJ_DAMAGE`. Para una
      // SAETA de ballesta con `HITSCAN_BOLT 1` el motor ve 0 y nosotros
      // leeríamos el dado: queda dicho, y las ballestas no están en el juego
      // todavía.
      const rp = l.match(/^(?:if\s*\([^)]*\)\s*|else\s+)?local\s+reg\.proj\.([a-z0-9_.&]+)\s+(.*)$/i);
      if (rp) { acc.proyectil.set(rp[1].toLowerCase(), rp[2].trim()); continue; }

      // ── `gravity`, y hay DOS en la misma flecha ────────────────────────────
      //
      // `proj_arrow_base` pone `gravity 1.0` en `game_deploy` —o sea con la
      // flecha en la mano, que es cuando eliges munición— y cada flecha pone la
      // suya en `arrow_spawn`: 0,7 la de madera, 0,75 la gratis. La que vuela es
      // la del spawn, porque la que se lanza es un objeto NUEVO
      // (`NewGenericItem(sProjectile)`, giattack.cpp:1066) que nunca pasa por
      // `game_deploy`. Quedarse con «la última que se lee» daría 1,0 según el
      // orden de los ficheros, o sea un 40 % más de caída por accidente.
      const gv = l.match(/^gravity\s+([\d.]+)/i);
      if (gv) {
        const donde = acc.evento?.nombre ?? "";
        if (donde === "game_deploy") acc.gravedadEnMano = Number(gv[1]);
        else acc.gravedad = Number(gv[1]);
        continue;
      }

      // `setvar`/`setvard` son el otro canal entre un objeto y su base, y hay
      // reglas que sólo viven ahí: `setvar AM_SHIELD 1` es lo que mira
      // `update_parry` para saber que lo que llevas en la mano es un escudo, y
      // no hay ninguna constante que lo diga.
      const sv = l.match(/^setvar[d]?\s+(\S+)\s+(.*)$/i);
      if (sv) { if (!acc.variables.has(sv[1])) acc.variables.set(sv[1], sv[2].trim()); continue; }

      // `sethand left|right|any|both|undroppable` — la mano que pide el objeto.
      // Los números son los del motor (`hand_e`, genericitem.h:15): izquierda 0,
      // derecha 1, **2 son los puños** y 4 es a dos manos. Esos dos números son
      // los que lee `update_parry`, así que sin esto no se sabe de qué lado de
      // la regla del parry cae un objeto.
      const sh = l.match(/^sethand\s+(\S+)/i);
      if (sh) { acc.mano = sh[1].toLowerCase(); continue; }

      // ── `wearable`, y la lectura de antes estaba al revés ──────────────────
      //
      // El motor pide DOS parámetros para que algo sea vestible:
      //
      //     if( Params[0] == "0" )   { m_WearPositions.clear(); Clear(WEARABLE); }
      //     else if( Params.size() >= 2 ) { SetBits(Properties,ITEM_WEARABLE); ... }
      //                                            genericitem.cpp:1808-1822
      //
      // O sea que `wearable` a secas —y `wearable 1` a secas— **no hacen
      // nada**: hace falta la lista de sitios. Aquí se leía la palabra sola como
      // un sí, y como los 60 objetos vestibles del juego la escriben con sitio
      // (`wearable 1 back`), el resultado era que NINGUNO salía vestible. Un
      // campo siempre falso no da error: da un campo que nadie mira.
      const we = l.match(/^wearable\b\s*(.*)$/i);
      if (we) {
        const p = we[1].trim().split(/\s+/).filter(Boolean);
        if (p[0] === "0") { acc.ranuras.clear(); acc.marcas.delete("wearable"); }
        else if (p.length >= 2) {
          acc.marcas.add("wearable");
          // El motor parte por `;|` — las dos, y `chest|arms|legs` y
          // `"chest;arms;legs"` están los dos escritos en el juego.
          for (const r of p.slice(1).join(" ").replace(/^["']|["']$/g, "").split(/[;|]/)) {
            if (r.trim()) acc.ranuras.add(r.trim().toLowerCase());
          }
        }
        continue;
      }

      // A quién llama este evento. `callevent [retardo] <evento> [params]`: si
      // el primer trozo es un número es el retardo y el nombre va detrás.
      const ce = l.match(/^callevent\s+(\S+)(?:\s+(\S+))?/i);
      if (ce && acc.evento) {
        const n = /^[\d.]+$/.test(ce[1]) ? ce[2] : ce[1];
        if (n) acc.evento.llama.push(n.toLowerCase());
      }

      const solo = l.trim().toLowerCase();
      if (MARCAS_OBJETO.includes(solo)) { acc.marcas.add(solo); continue; }
      if (solo === "registerattack") {
        // Un arma puede registrar VARIOS ataques —un mandoble tiene golpe y
        // estocada—. Se guarda una foto de los valores en cada registro, y el
        // evento se queda con el índice: si ese evento resulta no ejecutarse, el
        // ataque no existe.
        acc.evento?.registros.push(acc.ataques.length);
        acc.ataques.push(new Map(acc.ataque));
      }
      if (REGISTROS[solo]) acc.registros.add(solo);
      const sw = l.match(/^setworldmodel\s+(\S+)/i);
      if (sw) acc.ficha.set("modelo", sw[1].replace(/^'|'$/g, ""));
    }
  }
  return true;
}

/** Resuelve una constante que a su vez puede ser otra constante. */
function valorDe(constantes, nombre, profundidad = 0) {
  if (nombre === undefined || profundidad > 8) return nombre;
  const v = constantes.get(nombre);
  return v === undefined ? nombre : valorDe(constantes, v, profundidad + 1);
}

/**
 * Lo mismo, pero devolviendo `null` cuando lo que queda es el NOMBRE de una
 * constante que nadie ha definido.
 *
 * Pasa de verdad: `base_melee` hace `local reg.attack.dmg.type MELEE_DMG_TYPE`
 * y ocho armas no declaran esa constante. Sin esto, el catálogo sale con ocho
 * objetos cuyo tipo de daño es «melee_dmg_type» — un valor inventado que se lee
 * como un dato. Vale más un hueco que un dato falso.
 */
function resueltoO(constantes, nombre) {
  const v = valorDe(constantes, nombre);
  if (v === undefined || v === null) return null;
  const s = String(v);
  return /^[A-Z][A-Z0-9_]*$/.test(s) && !constantes.has(s) ? null : s;
}

/**
 * Un vector de script, con la regla EXACTA del motor:
 *
 *     Vector StringToVec( const char *String )        sharedutil.cpp:115
 *       if( sscanf(String,"(%f,%f,%f)",...) < 3 )
 *         if( sscanf(String,"(%f,%f)",...) < 2 ) return g_vecZero;
 *
 * O sea: lo que no tenga la forma `(a,b,c)` o `(a,b)` vale CERO, y eso incluye
 * el caso normal — `MELEE_STARTPOS` no lo define casi nadie, así que
 * `GetFirstScriptVar` devuelve el nombre de la constante y el motor lo lee como
 * (0,0,0). Sin esta regla habría que adivinar qué hace el motor con un vector
 * que no existe, y lo que hace es tratarlo como el origen.
 *
 * Y los EJES no son los de siempre: en `StrikeLand`, `x` es a la derecha,
 * **`y` es hacia delante** y `z` arriba (`v_forward * ofs.y + v_right * ofs.x +
 * v_up * ofs.z`). Leerlo como (x, y, z) del mundo pone la ballesta apuntando de
 * lado.
 */
function vectorDe(v) {
  const s = String(v ?? "").trim();
  const m = s.match(/^\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*(?:,\s*(-?[\d.]+)\s*)?\)$/);
  if (!m) return [0, 0, 0];
  return [Number(m[1]), Number(m[2]), m[3] === undefined ? 0 : Number(m[3])];
}

/**
 * Las manos del motor, `hand_e` (genericitem.h:15). El orden importa y no es el
 * que uno pondría: **el 2 son los puños**, no «las dos manos».
 */
const MANOS = { left: 0, right: 1, undroppable: 2, any: 3, both: 4 };

/** Un porcentaje (`70%`) o un número. Devuelve `null` si no es ninguno. */
/**
 * El `atoi`/`atof` de C, que es lo que usa el intérprete del mod.
 *
 * No es `Number()`: lo que no empieza por un número **vale cero**, y no es un
 * error. De ahí salen la mitad de las decisiones de un `game_fall` —un `if`
 * sobre una constante que nadie declaró es falso porque `atoi` de un nombre es
 * 0 (scriptcmds.cpp:3975)— y también sus cuentas (`atof`, :4210-4213).
 */
const atoi = (v) => { const n = parseInt(String(v ?? "").trim(), 10); return Number.isFinite(n) ? n : 0; };
// Se exporta desde el 79: el lector de fichas de NPC lo necesitaba para `hp` y
// se había escrito su propio `Number`. Ver `vidaDe`, más arriba.
export const atof = (v) => { const n = parseFloat(String(v ?? "").trim()); return Number.isFinite(n) ? n : 0; };

function numeroDe(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  const pct = s.match(/^(-?[\d.]+)\s*%$/);
  if (pct) return Number(pct[1]) / 100;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * `GET_CHARGE_FROM_TIME(a) = a + V_max(a - 1, 0) * .5` (genericitem.h:99).
 *
 * Está copiada aquí —y no importada de `src/play/golpe.js`— porque este lector
 * no depende de la regla del juego: lo usan las herramientas de horneado, que
 * corren sin nada del `play`. La gemela de allí es `cargaDe()`, y las dos
 * tienen que decir lo mismo; hay una prueba que lo comprueba.
 */
function cargaDeTiempo(v) {
  if (v === null || !(v > 0)) return v;
  return v + Math.max(v - 1, 0) * 0.5;
}

/**
 * CÓMO QUEDA UN OBJETO EN EL SUELO — el 71.
 *
 * ── Por qué esto no es una constante ───────────────────────────────────────
 *
 * Un `.mdl` de objetos de Master Sword trae tres submodelos por cosa —mano
 * derecha, mano izquierda y suelo—, así que para dibujar una manzana tirada
 * hace falta un número, y **ese número no está escrito en ningún sitio**: lo
 * calcula el evento `game_fall` del propio guion, con dos o tres órdenes.
 *
 * Y cada familia lo calcula distinto:
 *
 *   `base_weapon`     `inc L_SUBMODEL 2`, y `−1` si `NO_WORLD_MODEL`  (:61-70)
 *   `base_drink`      `add L_SUBMODEL 2`                              (:79-90)
 *   `base_miscitem`   `add L_SUBMODEL 1`, **sólo si el modelo es `p_misc`**;
 *                     si no, `setmodelbody 0 0`                       (:39-57)
 *   `health_apple`    `[override] game_fall` con `add L_SUBMODEL 1`   (:47-57)
 *
 * O sea que la manzana hereda de `base_drink` —que dice `+2`— y **lo anula con
 * `+1`**. Con la fórmula de la base, `MODEL_BODY_OFS 1` más dos da el submodelo
 * 3 de `misc/p_misc.mdl`, que se llama `oldbook_rhand`: una manzana que al caer
 * del árbol se convierte en un libro viejo, sin un solo error. Es la regla del
 * 66 otra vez —`[override]` borra el del padre— y la del 64: lo que manda es lo
 * que ejecuta el motor, no lo que parece razonable.
 *
 * ── Qué entiende esto y qué NO ─────────────────────────────────────────────
 *
 * No es un intérprete: es un lector de las cinco órdenes con las que las
 * familias de arriba resuelven el número (`local`, `add`/`inc`,
 * `subtract`/`dec`, `stradd`, `setmodelbody`) más el `if` de dos ramas de
 * `base_miscitem`. Cualquier otra cosa —un `$calc`, un `if` anidado, un `if`
 * VIEJO sin paréntesis (el del 67, que abandona el bloque entero)— **no se
 * adivina**: se devuelve `cuerpo: null` con el motivo, y quien hornea lo cuenta
 * en vez de inventarse un submodelo.
 *
 * `lineas` es el bloque YA aplanado por `partirScript` —las llaves anidadas no
 * sobreviven—, así que la rama del `else` se reconoce por su propia línea y
 * llega hasta el final del evento. Con un `if` sin `else` el final de la rama
 * no se puede saber, y entonces esto se declara vencido.
 *
 * @param {string[]} lineas  el bloque de `game_fall`, aplanado
 * @param {(n: string) => (string|null)} resolver  una constante a su valor
 */
export function caidaDe(lineas, resolver) {
  const vars = new Map();
  // Un nombre se resuelve primero como variable local del evento y después como
  // constante del guion. El motor hace lo mismo: `local` crea una variable del
  // objeto y las constantes son del script.
  const val = (t) => {
    if (t === undefined || t === null) return null;
    // ── LAS COMILLAS SIMPLES NO SON COMILLAS ────────────────────────────
    //
    // Sólo las DOBLES agrupan y desaparecen (`GetParams`, script.cpp:5049-5064;
    // y el lector de parámetros de un comando, :5639-5650). La simple es un
    // carácter más del nombre, así que `'ANIM_PREFIX'` **no es** la constante
    // `ANIM_PREFIX`: es una cadena que `GetConst` no encuentra y devuelve tal
    // cual, comillas incluidas (script.cpp:349-354). Quitarlas aquí daría por
    // ciertas unas comparaciones que en el juego son falsas siempre.
    const limpio = String(t).trim().replace(/^"(.*)"$/s, "$1");
    // EL 67 otra vez: este puerto es el lado SERVIDOR, y la mitad de los
    // `game_fall` del mod empiezan por `if game.serverside`. Sin esto el
    // lector se quedaría fuera de todos ellos — y además con la respuesta
    // contraria a la del juego. La gemela viva está en `src/play/guion.js`.
    if (limpio === "game.serverside") return "1";
    if (limpio === "game.clientside") return "0";
    if (vars.has(limpio)) return vars.get(limpio);
    const c = resolver(limpio);
    return c === null || c === undefined ? limpio : String(c);
  };
  let cuerpo = null, modelo = null, animacion = null, motivo = null;
  let saltando = false, dentroDeIf = false, teniaElse = false;

  const orden = (l) => {
    const t = l.trim();
    let m;
    if ((m = t.match(/^setmodel\s+(\S+)/i))) { modelo = val(m[1]); return true; }
    if ((m = t.match(/^local\s+(\S+)\s+(.+)$/i))) { vars.set(texto(m[1]), val(m[2])); return true; }
    // `ScriptCmd_MathSet` usa `atof` en los dos operandos (scriptcmds.cpp:4210-4213),
    // así que lo que no es un número **vale cero** y la cuenta sigue. Esto no es
    // tolerancia nuestra: un `add L_SUBMODEL 1` con `MODEL_BODY_OFS` sin
    // declarar da 1 en el juego, y hay objetos que caen justo así.
    if ((m = t.match(/^(add|inc)\s+(\S+)\s+(\S+)$/i))) {
      vars.set(texto(m[2]), String(atof(val(m[2])) + atof(val(m[3])))); return true;
    }
    if ((m = t.match(/^(subtract|dec)\s+(\S+)\s+(\S+)$/i))) {
      vars.set(texto(m[2]), String(atof(val(m[2])) - atof(val(m[3])))); return true;
    }
    if ((m = t.match(/^stradd\s+(\S+)\s+(.+)$/i))) {
      vars.set(String(m[1]).trim(), `${val(m[1]) ?? ""}${String(m[2]).trim().replace(/^"(.*)"$/s, "$1")}`); return true;
    }
    if ((m = t.match(/^playanim\s+(\S+)/i))) { animacion = val(m[1]); return true; }
    if ((m = t.match(/^setmodelbody\s+(\d+)\s+(\S+)$/i))) {
      // El primer parámetro es el `bodypart`, y los objetos de MSR tienen uno.
      if (Number(m[1]) !== 0) { motivo = `'${t}' toca el bodypart ${m[1]}`; return false; }
      cuerpo = atoi(val(m[2])); return true;
    }
    // Lo que no es ninguna de las cinco se ignora a propósito: un `callevent`,
    // un sonido o un `clientevent` no cambian el submodelo.
    return true;
  };

  for (let i = 1; i < lineas.length; i++) {
    const t = lineas[i].trim();
    if (/^else$/i.test(t)) {
      if (!dentroDeIf) { motivo = "un `else` sin su `if` en bloque"; break; }
      teniaElse = true; saltando = !saltando; continue;
    }
    const nuevo = t.match(/^if\s*\((.+?)\)\s*(.*)$/i);
    if (nuevo) {
      if (saltando) continue;
      const r = condicion(nuevo[1], val);
      if (r === null) { motivo = `no sé evaluar 'if (${nuevo[1].trim()})'`; break; }
      // `if ( cond ) orden` en una línea: el hijo es ÚNICO y no abre bloque.
      if (nuevo[2].trim()) { if (r && !orden(nuevo[2])) break; continue; }
      dentroDeIf = true;
      saltando = !r;
      continue;
    }
    // EL `if` VIEJO, el del 67. No se salta una línea: con la condición falsa
    // **abandona el evento entero** (`break`, script.cpp:5754-5758). Eso no es
    // un hueco de este lector: es una respuesta, y la de verdad. Es lo que deja
    // sin submodelo del suelo a los `game_fall` de `base_item_extras`, que
    // empiezan por `if ITEM_RESERVE_FOR_STRONGEST` —una constante que nadie
    // declara, o sea `atoi("ITEM_...") == 0`, o sea falso.
    const viejo = t.match(/^if\s+(.+)$/i);
    if (viejo) {
      if (saltando) continue;
      const r = condicion(viejo[1], val);
      if (r === null) { motivo = `no sé evaluar 'if ${viejo[1].trim()}'`; break; }
      if (!r) break;
      continue;
    }
    if (saltando) continue;
    if (!orden(t)) break;
  }
  if (!motivo && dentroDeIf && !teniaElse) {
    motivo = "un `if` en bloque sin `else`: no se sabe dónde acaba la rama";
  }
  return { cuerpo: motivo ? null : cuerpo, modelo, animacion, motivo };
}

/**
 * La condición de un `if` nuevo, reducida a lo que usan los `game_fall`.
 *
 * Devuelve `null` cuando no sabe —y eso es un resultado, no un `false`: un
 * `false` inventado elige la rama contraria y da un modelo equivocado sin
 * avisar.
 */
function condicion(txt, val) {
  const t = txt.trim().replace(/\)\s*$/, "").trim();
  const trozos = t.split(/\s+/).filter(Boolean);
  // UN SOLO OPERANDO: `ConditionsMet = atoi(Value) ? true : false`, con el `!`
  // delante invirtiendo (scriptcmds.cpp:3964-3977). Y `atoi` de un nombre que
  // nadie ha definido es CERO, que es justo lo que hace que la mitad de los
  // `game_fall` del mod no lleguen a su `setmodelbody`.
  if (trozos.length === 1) {
    const niega = trozos[0].startsWith("!");
    return (atoi(val(niega ? trozos[0].slice(1) : trozos[0])) !== 0) !== niega;
  }
  if (trozos.length < 3) return null;
  const a = val(trozos[0]), b = val(trozos.slice(2).join(" "));
  // `FStrEq` para `equals`/`isnot`, y numérico para el resto
  // (scriptcmds.cpp:3984-4018). Un comparador que el motor no conoce cae en
  // `iCompareType = 0`, o sea `equals`; eso también se copia.
  const op = trozos[1].toLowerCase();
  const na = Number(a), nb = Number(b);
  switch (op) {
    case "isnot": case "!equals": return a !== b;
    case "<": return na < nb;
    case ">": return na > nb;
    case "<=": return na <= nb;
    case ">=": return na >= nb;
    case "==": return na === nb;
    case "!=": return na !== nb;
    case "startswith": return String(a).startsWith(String(b));
    case "contains": return String(a).includes(String(b));
    case "!startswith": return !String(a).startsWith(String(b));
    case "!contains": return !String(a).includes(String(b));
    default: return a === b;
  }
}

/**
 * La ficha de un objeto de MSR. `null` si el script no está.
 *
 * `ruta` es relativa a `scripts/`, sin extensión: `items/swords_rsword`.
 */
export function leerFichaObjeto(raiz, ruta) {
  const acc = {
    constantes: new Map(), ficha: new Map(), marcas: new Set(),
    registros: new Set(), ataque: new Map(), ataques: [], ficheros: [], faltan: [],
    variables: new Map(), ranuras: new Set(), mano: null,
    proyectil: new Map(), gravedad: null, gravedadEnMano: null,
    bloque: 0, evento: null, eventos: [],
  };
  if (!recogerObjeto(raiz, ruta, new Set(), 0, acc)) return null;

  // ── QUÉ ATAQUES EXISTEN DE VERDAD ────────────────────────────────────────
  //
  // Esto no se puede decidir mientras se lee, y son dos reglas:
  //
  //   1. `[override] <evento>` BORRA de la lista los que ya se llamaban igual.
  //   2. Un evento sólo cuenta si **alguien lo llama**. Y ahí estaba la trampa
  //      de verdad: `base_melee` no registra sus ataques en `weapon_spawn`, sino
  //      en `register_normal`, y `weapon_spawn` lo LLAMA. Borrar `weapon_spawn`
  //      no borra `register_normal`: lo deja huérfano, y un evento al que nadie
  //      llama no se ejecuta nunca.
  //
  // O sea que hay que seguir las llamadas desde la raíz, y la raíz la dice el
  // motor: `pItem->CallScriptEvent("game_spawn")` (playershared.cpp:1524). Los
  // bloques SIN nombre también cuentan como raíz — el motor les pone
  // `fNextExecutionTime = 0`, que quiere decir «ejecútate al nacer».
  const anulado = (e) => e.nombre
    && acc.eventos.some((o) => o.anula && o.nombre === e.nombre && o.bloque > e.bloque);
  const vivos = acc.eventos.filter((e) => !anulado(e));
  const porNombre = new Map();
  for (const e of vivos) {
    if (!e.nombre) continue;
    if (!porNombre.has(e.nombre)) porNombre.set(e.nombre, []);
    porNombre.get(e.nombre).push(e);
  }
  const alcanzados = new Set();
  const cola = vivos.filter((e) => !e.nombre || e.nombre === "game_spawn");
  for (const e of cola) alcanzados.add(e);
  while (cola.length) {
    const e = cola.shift();
    for (const n of e.llama) {
      for (const o of porNombre.get(n) ?? []) {
        if (alcanzados.has(o)) continue;
        alcanzados.add(o); cola.push(o);
      }
    }
  }
  const usados = new Set();
  for (const e of alcanzados) for (const i of e.registros) usados.add(i);
  const fantasmas = acc.ataques.length - usados.size;
  acc.ataques = acc.ataques.filter((_, i) => usados.has(i));

  const k = (n) => valorDe(acc.constantes, acc.constantes.get(n));
  // Igual que `k`, pero devolviendo `null` cuando lo que queda es el nombre de
  // una constante que nadie definió: un `SOUND_HITWALL1` sin valor es un hueco,
  // no una ruta de sonido llamada «SOUND_HITWALL1».
  const c = (n) => resueltoO(acc.constantes, acc.constantes.get(n));
  const tipos = [...acc.registros].map((r) => REGISTROS[r]);
  // ── EL 71: CÓMO QUEDA EN EL SUELO ────────────────────────────────────────
  //
  // Se recorren TODOS los `game_fall` que sobreviven al `[override]`, en orden,
  // porque `CallScriptEvent` ejecuta todos los que se llamen igual y el último
  // `setmodelbody` es el que queda. Y si cualquiera de ellos trae algo que
  // `caidaDe` no sabe leer, el resultado entero se declara vencido: medio
  // evento entendido es peor que ninguno, porque el submodelo que sale es
  // plausible y es de otra cosa.
  const caida = (() => {
    const bloques = vivos.filter((e) => e.nombre === "game_fall");
    if (!bloques.length) return { cuerpo: null, modelo: null, animacion: null, motivo: "no tiene `game_fall`" };
    const out = { cuerpo: null, modelo: null, animacion: null, motivo: null };
    for (const e of bloques) {
      const r = caidaDe(e.lineas, c);
      if (r.motivo) { out.motivo ??= r.motivo; continue; }
      if (r.cuerpo !== null) out.cuerpo = r.cuerpo;
      if (r.modelo) out.modelo = r.modelo;
      if (r.animacion) out.animacion = r.animacion;
    }
    if (out.cuerpo === null && !out.motivo) out.motivo = "su `game_fall` no toca el submodelo";
    return out;
  })();
  const ficha = {
    id: ruta.replace(/^.*\//, ""),
    ruta,
    // ── LAS COMILLAS NO SON PARTE DEL NOMBRE ────────────────────────────
    //
    // `name "Back Sword Sheath"` y `name Small Sack` son la misma cosa escrita
    // de dos formas: en el lenguaje de scripts las comillas AGRUPAN y no se
    // guardan. El repartidor del motor se las salta con un `continue`:
    //
    //     if (ch == '"') { ...inQuote = !inQuote... continue; }
    //                                     script.cpp:5049-5064 (`GetParams`)
    //
    // Sin quitarlas, la funda de espalda se llama «"Back Sword Sheath"» con
    // comillas en la pantalla y el hechizo de partida, «"Erratic Lightning"».
    // Los dos se ven: uno en el inventario y el otro en la pantalla de crear
    // personaje. `texto()` ya sabía hacerlo y no se estaba usando aquí.
    nombre: texto(acc.ficha.get("nombre")),
    descripcion: texto(acc.ficha.get("descripcion")),
    peso: numeroDe(acc.ficha.get("peso")),
    tamano: numeroDe(acc.ficha.get("tamano")),
    valor: numeroDe(acc.ficha.get("valor")),
    calidad: numeroDe(acc.ficha.get("calidad")),
    // `setworldmodel MODEL_WORLD` guarda el NOMBRE de la constante, no su
    // valor: la base no sabe qué modelo lleva el objeto, sólo cómo se llama su
    // constante. Sin resolverlo, las 861 fichas salen con un modelo que no
    // existe — y como el nombre es plausible, pasa por ruta buena.
    modelo: resueltoO(acc.constantes, acc.ficha.get("modelo"))
      ?? resueltoO(acc.constantes, acc.constantes.get("MODEL_WORLD")) ?? null,
    tipos,
    // Un objeto sin ningún `register*` es un trasto: una llave, una carta, una
    // gema. Son la mayoría del catálogo y no es un fallo de lectura.
    tipo: tipos[0] ?? "trasto",
    vestible: acc.marcas.has("wearable"),
    ranuras: [...acc.ranuras],
    apilable: acc.marcas.has("groupable"),
    usable: acc.marcas.has("useable"),
    // La mano que pide, con el número del motor. `null` si no lo dice.
    mano: acc.mano,
    manoNumero: MANOS[acc.mano] ?? null,
    // ── CÓMO SE VE Y SE OYE EL ARMA ────────────────────────────────────────
    //
    // Un arma de Master Sword son DOS modelos y ninguno es suyo del todo:
    //
    //   `MODEL_VIEW`  el de primera persona, con los brazos. `v_1hswords.mdl`
    //                 trae VEINTIÚN filos en un solo archivo y `MODEL_VIEW_IDX`
    //                 dice cuál: el 1 es `rusted`, el de la espada oxidada.
    //   `MODEL_WORLD` el de tercera persona, y lo mismo: `p_weapons1.mdl` trae
    //                 117 submodelos. `MODEL_BODY_OFS` es el índice del que va
    //                 en la mano DERECHA, y los tres siguientes son la
    //                 izquierda, el suelo y la vaina — que es exactamente por
    //                 qué `game_fall` hace `inc L_SUBMODEL 2`.
    //
    // O sea que sin estos dos números el arma no se ve, y con el número
    // equivocado se ve OTRA arma, que es un fallo que no da ningún error.
    //
    // Y HAY DOS JUEGOS DE NOMBRES PARA LO MISMO. La familia de las astas no usa
    // `MODEL_VIEW` sino `VMODEL_FILE`, con `VMODEL_IDX` para el submodelo y
    // `PMODEL_FILE`/`PMODEL_IDX_HANDS` para el de tercera persona
    // (`polearms_base.script:28` y `:220`, `setviewmodel VMODEL_FILE`).
    //
    // Sin este segundo juego el bastón sale **sin modelo en la mano** y no da
    // ningún error: el arma funciona, pega y hace daño, y no se ve. Lo encontró
    // el censo de las siete armas de partida, que es justo para lo que estaba.
    enMano: {
      modelo: c("MODEL_VIEW") ?? c("VMODEL_FILE"),
      submodelo: numeroDe(c("MODEL_VIEW_IDX") ?? c("VMODEL_IDX")) ?? 0,
    },
    enElMundo: {
      modelo: c("MODEL_WORLD") ?? c("PMODEL_FILE"),
      // `setmodelbody 0 (MODEL_BODY_OFS + 1 − game.item.hand_index)`: con la
      // mano derecha (índice 1) sale el propio `MODEL_BODY_OFS`.
      cuerpo: numeroDe(c("MODEL_BODY_OFS") ?? c("PMODEL_IDX_HANDS")),
      // Y en la familia de las astas el del SUELO viene declarado aparte en vez
      // de estar dos más allá: `setmodelbody 0 PMODEL_IDX_FLOOR` dentro de
      // `game_fall` (`polearms_base.script:208`), y en el bastón el suelo es el
      // 61 y la mano el 62 — o sea que van al revés. Quien dé por hecho el `+2`
      // de `MODEL_BODY_OFS` acaba dos armas más allá.
      suelo: numeroDe(c("PMODEL_IDX_FLOOR")),
      animaciones: c("ANIM_PREFIX"),
      // ── EL 71, y es lo único de aquí que NO sale de una constante ────────
      //
      // `suelo` de arriba es `PMODEL_IDX_FLOOR`, que sólo declara la familia de
      // las astas. Para los otros 700 objetos el submodelo del suelo lo calcula
      // el `game_fall`, y cada familia con una cuenta distinta. Ver `caidaDe`.
      cuerpoSuelo: caida.motivo ? null : caida.cuerpo,
      // El modelo que el `game_fall` pone con `setmodel`, cuando lo pone:
      // `base_miscitem` cambia al `MODEL_WORLD` al caer, que puede no ser el de
      // la mano.
      modeloSuelo: caida.modelo ?? null,
      // `playanim apple_floor_idle`. Sin ella el objeto sale en el fotograma 0
      // de la secuencia 0, que en `p_misc.mdl` es `idle` y no es la suya.
      animacionSuelo: caida.animacion ?? null,
      /** Por qué no se ha podido leer, cuando no se ha podido. Se cuenta. */
      sueloSinLeer: caida.motivo ?? null,
    },
    sonidos: {
      blandir: c("SOUND_SWIPE"),
      contraPared: [c("SOUND_HITWALL1"), c("SOUND_HITWALL2")].filter(Boolean),
      // Cuando SÍ le da a alguien el sonido no es del arma: lo pone el motor
      // por el tipo de daño. Aquí queda dicho lo que el script declara.
      contraCarne: c("SOUND_HITBODY"),
    },
    // Lo que multiplica el ataque cargado: `BWEAPON_DBL_CHARGE_ADJ`, que vale 2
    // en `base_melee`.
    //
    // Va aparte y NO metido en el daño del ataque porque esto **no es un
    // intérprete**: la base hace `multiply reg.attack.dmg
    // BWEAPON_DBL_CHARGE_ADJ` y aquí no se ejecuta ninguna multiplicación. O
    // sea que el `dano` del ataque cargado que se lee es el de BASE, y quien lo
    // use tiene que multiplicar. Meterlo dentro sin decirlo dejaría un número
    // que parece del script y no lo es.
    multiplicadorDeCarga: numeroDe(c("BWEAPON_DBL_CHARGE_ADJ")),
    // Las secuencias del modelo de primera persona, que el script nombra por
    // NÚMERO. `ATTACK_ANIMS` dice cuántas hay y la base elige una al azar: con
    // una sola, la espada golpea siempre igual y se nota.
    animaciones: {
      sacar: numeroDe(c("ANIM_LIFT1")),
      parado: numeroDe(c("ANIM_IDLE1")),
      guardar: numeroDe(c("ANIM_SHEATH")),
      ataque: [1, 2, 3, 4, 5]
        .map((n) => numeroDe(c(`ANIM_ATTACK${n}`)))
        .filter((v) => v !== null),
      // ── Y LAS DOS DEL ARCO, que no son ataques ─────────────────────────────
      //
      // Un arco no declara `ANIM_ATTACK1`: declara tensar y soltar, y las pone
      // su propio script y no el motor (`ranged_start` -> `playviewanim
      // ANIM_STRETCH`, `ranged_toss` -> `ANIM_FIRE`). Buscarle ataques a un arco
      // no da error: da un arco que se queda quieto al disparar.
      tensar: numeroDe(c("ANIM_STRETCH")),
      disparar: numeroDe(c("ANIM_FIRE")),
      /** Cuándo acaba de tensarse el muñeco: `RANGED_PULLTIME`, 0,8 s. */
      tiempoDeTensar: numeroDe(c("RANGED_PULLTIME")),
      // `ANIM_DEPLOY 1` de `bows_base` está MUERTO y por eso se lee aparte: para
      // un arma la de sacar la pone `base_item`, que declara `ANIM_LIFT1 0` y
      // hace `playviewanim ANIM_LIFT1` (base_item.script:10 y :38). Nadie toca
      // `ANIM_DEPLOY` de un arco; las flechas reusan el nombre para otra cosa
      // (`setvard ANIM_DEPLOY idle2`). O sea que `v_bows.mdl` tiene cuatro
      // secuencias y el juego usa tres: la 1 no se ve nunca.
      desplegarMuerto: numeroDe(c("ANIM_DEPLOY")),
    },
    // Los ATAQUES, tal y como la base se los pasa al motor. Cada valor puede
    // ser una constante, así que se resuelve.
    ataques: acc.ataques.map((a) => {
      const g = (n) => resueltoO(acc.constantes, a.get(n));
      return {
        tipo: (g("type") ?? "").toLowerCase() || null,
        habilidad: (g("stat") ?? "").toLowerCase() || null,
        dano: numeroDe(g("dmg")),
        danoRango: numeroDe(g("dmg.range")),
        /**
         * `reg.attack.dmg.multi`, y en un arco es el único daño que pone el arma:
         * multiplica el de la FLECHA, y lo hace al nacer ésta
         * (`ProjectileData->Damage = flStartingDamage * flDamageMulti`,
         * giprojectile.cpp:60-64). Los arcos de partida no lo declaran.
         */
        multiplicadorDeDano: numeroDe(g("dmg.multi")),
        tipoDano: (g("dmg.type") ?? "").toLowerCase() || null,
        alcance: numeroDe(g("range")),
        precision: numeroDe(g("hitchance")),
        aguante: numeroDe(g("energydrain")),
        duracion: numeroDe(g("delay.end")),
        // CUÁNDO cae el golpe dentro del swing, que es la mitad que faltaba:
        // `delay.end` dice cuánto dura la animación y `delay.strike` cuándo
        // duele. En la espada oxidada son 0,6 de 1,1 s, o sea que el daño cae
        // por la MITAD del movimiento y no al empezar ni al acabar. Sin esto un
        // ataque hace daño en el fotograma del clic, que se juega como un arma
        // de fuego.
        retardo: numeroDe(g("delay.strike")),
        // Las teclas del combo. `+attack1` es «mientras lo tengas pulsado» y
        // `-attack1` es **al soltarlo**: así se distingue el mandoble normal
        // del cargado, que son dos ataques registrados y no un modificador.
        teclas: String(g("keys") ?? "").toLowerCase().split(/[;\s]+/).filter(Boolean),
        prioridad: numeroDe(g("priority")) ?? 0,
        // `chargeamt` en tanto por uno, ya pasado por `%`, y **pasado también
        // por la misma curva que los segundos aguantados**, que es lo que el
        // motor hace al REGISTRAR el ataque y no al compararlo:
        //
        //     attData.flChargeAmt = atof(...) / 100.0f;
        //     if (attData.flChargeAmt > 0)
        //       attData.flChargeAmt = GET_CHARGE_FROM_TIME(attData.flChargeAmt);
        //                                              giattack.cpp:487-489
        //
        // Con lo cual `chargeamt 100%` son 1 de carga —un segundo justo— y
        // `200%` son 2,5, que son dos segundos: un nivel por segundo. Sin esta
        // línea el segundo nivel del cuchillo y del martillo pedía 2 de carga,
        // o sea 1,67 s, y salía antes de tiempo.
        carga: cargaDeTiempo(numeroDe(g("chargeamt"))),
        pideHabilidad: numeroDe(g("reqskill")) ?? 0,
        ruido: numeroDe(g("noise")),
        desde: vectorDe(g("ofs.startpos")),
        apunta: vectorDe(g("ofs.aimang")),
        sinAutoApuntado: numeroDe(g("noautoaim")) === 1,
        aoeAlcance: numeroDe(g("aoe.range")),
        aoeCaida: numeroDe(g("aoe.falloff")),
        // Un arco no lleva daño: lo lleva su FLECHA. Aquí queda dicho cuál.
        proyectil: g("projectile") ?? null,
        // ── LOS DOS TIEMPOS DE TENSAR ──────────────────────────────────────
        //
        //     TokenizeString( GetFirstScriptVar("reg.attack.hold_min&max"), … )
        //     tProjMinHold = atof(HoldDelays[0]);  tMaxHold = atof(HoldDelays[1]);
        //                                            giattack.cpp:569-575
        //
        // En los arcos son `1.1;1.3`, y esos dos números son casi todo el
        // sistema de carga. El mínimo hace DOS cosas: el cliente no suelta la
        // cuerda hasta que pasa (genericitem.cpp:760) y la fuerza se calcula con
        // `clamp(aguantado, min, max) / max` (giattack.cpp:1074), o sea que un
        // clic seco dispara 1,1 s después y **al 85 %** de la fuerza máxima.
        // Tensar hasta 1,3 da el 100 %. Ver `src/play/proyectil.js`.
        sostener: tokensDe(g("hold_min&max")),
        // Y los dos conos, en GRADOS: el de sin tensar y el de tensado del todo.
        // `reg.attack.COF` pisa a `hitchance`, que es el campo del cuerpo a
        // cuerpo (`flAccuracyDefault`), así que un arco tiene cono y no
        // porcentaje de acierto.
        // Y con la regla del motor, que no es «lee lo que haya»:
        //
        //     if (Stats.size() >= 2) { flAccuracyDefault = …; flAccBest = …; }
        //                                            giattack.cpp:582-586
        //
        // O sea que un `COF` con UN solo número **no se lee**: el cono se queda
        // a cero y el arma tira perfecta. Le pasa al lanzazo del bastón, que
        // declara `reg.attack.COF 1` y sale con puntería de láser. Leer ese 1
        // como un grado de dispersión sería inventarse una imprecisión que el
        // juego no tiene.
        cono: (() => { const t = tokensDe(g("cof")); return t && t.length >= 2 ? t : null; })(),
      };
    }),
    // ── LA FLECHA, que es un objeto aparte con sus propios campos ────────────
    //
    // `RegisterProjectile` (giprojectile.cpp:24) lee otros siete valores, y el
    // daño es el suyo: el arco sólo pone la fuerza y el multiplicador.
    proyectil: acc.registros.has("registerprojectile") ? {
      /** `reg.proj.dmg`, que en las flechas es un dado: `$rand(30,60)`. */
      dano: rango(resueltoO(acc.constantes, acc.proyectil.get("dmg"))),
      tipoDano: (resueltoO(acc.constantes, acc.proyectil.get("dmgtype")) ?? "").toLowerCase() || null,
      aoeAlcance: numeroDe(resueltoO(acc.constantes, acc.proyectil.get("aoe.range"))),
      aoeCaida: numeroDe(resueltoO(acc.constantes, acc.proyectil.get("aoe.falloff"))),
      /**
       * `reg.proj.collidehitbox`: con esto puesto, tocar la CAJA de un monstruo
       * sin darle a una hitbox **no para la flecha** — «Just keep going if I hit
       * a npc bounding box but not an actual hitbox» (giprojectile.cpp:182-186).
       */
      chocaConHitbox: numeroDe(resueltoO(acc.constantes, acc.proyectil.get("collidehitbox"))) === 1,
      ignoraNpc: numeroDe(resueltoO(acc.constantes, acc.proyectil.get("ignorenpc"))) === 1,
      ignoraMundo: numeroDe(resueltoO(acc.constantes, acc.proyectil.get("ignoreworld"))) === 1,
      /** La que vuela, y la de la mano, que son dos. Ver el lector de `gravity`. */
      gravedad: acc.gravedad,
      gravedadEnMano: acc.gravedadEnMano,
      /** Cuánto tarda en desaparecer del suelo (`ARROW_EXPIRE_DELAY`). */
      duraEnElSuelo: numeroDe(c("ARROW_EXPIRE_DELAY")),
      /**
       * `reg.proj.stick.duration` — leído porque el script lo declara, y
       * **muerto**: la línea que lo usaba está comentada en el motor
       * (giprojectile.cpp:35 y :222). Una flecha se queda clavada el tiempo del
       * `callevent`, no el de este campo.
       */
      clavadaMuerto: numeroDe(resueltoO(acc.constantes, acc.proyectil.get("stick.duration"))),
      seClavaEnNpc: numeroDe(k("PROJ_STICK_ON_NPC")) === 1,
      seClavaEnPared: numeroDe(k("PROJ_STICK_ON_WALL_NEW")) === 1,
      /** El submodelo de `arrows.mdl` — once flechas en un fichero. */
      submodelo: numeroDe(k("ARROW_BODY_OFS")) ?? numeroDe(k("MODEL_BODY_OFS")) ?? 0,
    } : null,
    // ── EL ESCUDO ──────────────────────────────────────────────────────────
    //
    // Un escudo no es un arma con poco daño: es **otro sistema**, y no vive en
    // el parry sino en `game_takedamage` de `shields_base.script`. Lo que lo
    // identifica NO es una constante, es un `setvar`:
    //
    //     setvar AM_SHIELD 1
    //
    // que es lo que mira `update_parry` en la mano del jugador. Y el motor usa
    // además otro criterio, por NOMBRE, para saber si estás cubriéndote:
    //
    //     for( i ) if( Gear[i]->CurrentAttack && m_Name.starts_with("shields_") )
    //                                            msmonstershared.cpp:65-71
    //
    // Los dos están aquí porque **no son el mismo conjunto**: los seis
    // `item_tk_shields_*` son vales de tienda, no escudos, y un escudo cuyo
    // script no se llamara `shields_…` bloquearía pero no impediría atacar.
    escudo: numeroDe(acc.variables.get("AM_SHIELD")) === 1 ? {
      /** `IsShielding()` va por el nombre del script, no por la marca. */
      leEmpujaElMotor: /^shields_/.test(ruta.replace(/^.*\//, "")),
      /** Lo que multiplica el parry del ARMA de la otra mano. */
      multiplicadorDeParry: numeroDe(c("PARRY_MULTI")),
      // Está declarada en los seis escudos y **no la lee nadie**: ni un script
      // ni el motor. Se anota porque una constante muerta en seis sitios se
      // parece mucho a una regla, y no lo es.
      parryBaseMuerto: numeroDe(c("SHIELD_BASE_PARRY")),
      /** Con el escudo ARRIBA: probabilidad de bloquear y qué parte del daño pasa. */
      bloqueoArriba: numeroDe(c("BLOCK_CHANCE_UP")),
      danoQuePasa: numeroDe(c("DMG_BLOCK_UP")),
      /** Con el escudo ABAJO, sólo en la mano: bloquea TODO o nada. */
      bloqueoAbajo: numeroDe(c("BLOCK_CHANCE_DOWN")),
      // La vida del escudo está leída porque el script la declara, pero en
      // Rebirth **no se gasta**: los cinco sitios que la restan están
      // comentados, así que un escudo no se rompe nunca.
      vida: numeroDe(resueltoO(acc.constantes, acc.variables.get("SHIELD_HEALTH"))),
      vidaMaxima: numeroDe(c("SHIELD_MAXHEALTH")),
      inmortal: numeroDe(c("SHIELD_IMMORTAL")) === 1,
      // `NOPUSH_CHANCE` va de 25 % a 100 % según el escudo y **no lo lee nadie**:
      // la línea que lo tiraba está comentada en `melee_start`, así que levantar
      // cualquier escudo te hace inempujable del todo (`scriptflags … nopush`).
      noEmpujaMuerto: numeroDe(c("NOPUSH_CHANCE")),
      // Y el aguante también es decoración: el ataque del escudo declara
      // `reg.attack.energydrain 0` a mano, así que los 15 puntos del escudo de
      // entrenamiento no se cobran nunca. Levantar un escudo es GRATIS.
      aguanteMuerto: numeroDe(c("MELEE_ENERGY")),
      precisionMuerta: numeroDe(c("MELEE_ACCURACY")),
      sonidoDeBloqueo: c("SOUND_BLOCK"),
      efectoAntesDeBloquear: numeroDe(c("SHIELD_PRE_BLOCK_EFFECT")) === 1,
    } : null,
    // De dónde ha salido, que es lo que permite discutir una cifra rara.
    hereda: acc.ficheros.slice(1),
    faltan: acc.faltan,
    /** Cuántos ataques se han tirado por un `[override]`. Cero en casi todo. */
    ataquesFantasma: fantasmas,
  };
  // `arma` es el ataque principal, que es el primero que se registra. Se deja
  // aparte de `ataques` porque casi todo el mundo quiere sólo ése.
  ficha.arma = ficha.ataques[0] ?? null;
  return ficha;
}
