// EL GUION DE UN NPC, ENCHUFADO AL JUEGO.
//
// `src/play/guion.js` es la máquina y no sabe nada de este juego: no importa
// nada, no toca el DOM y no conoce al jugador. Aquí se le da un mundo.
//
// Y con eso, lo que el experimento 29 dejó a medias se cierra: las opciones del
// menú de un NPC **dejan de leerse de una ficha horneada y pasan a salir de
// ejecutar su `game_menu_getoptions` de verdad**, que es lo que hace el
// servidor (`CallScriptEvent("game_menu_getoptions", &Params)`,
// msmonsterserver.cpp:2890). Elegir una llama a `usarOpcion`, que es
// `CMSMonster::UseMenuOption`.
//
// ── Por qué esto es MEJOR que la ficha, y no sólo distinto ────────────────
//
// `tools/menus.mjs` leía los bloques con expresiones regulares y tenía que
// adivinar las condiciones. Ejecutar el script no adivina nada, y al hacerlo
// salieron **tres cosas que la ficha decía mal**:
//
//   1. **Faltaban las opciones de `base_chat`.** El lector no seguía los
//      `#include`, y `RunScriptEventByName` ejecuta **todos** los eventos con
//      ese nombre (script.cpp:5836). El alcalde no ofrece cuatro opciones:
//      ofrece siete, y las tres primeras —«Hail», «Ask about Jobs», «Ask about
//      Rumors»— son de la plantilla.
//   2. **El `if` sin llaves estaba leído al revés.** Ver la cabecera de
//      `guion.js`: el `if` sin paréntesis es el VIEJO y **abandona el bloque**,
//      no «guarda sólo la línea siguiente». Con la regla buena, «Give Goblin's
//      Head» **no aparece si no llevas la cabeza**, y el caso del armero no
//      duplica ningún título.
//   3. **Las condiciones que la ficha marcaba «no decidibles»** —`A < B`,
//      `$get(...)`— se deciden solas al ejecutarlas.
//
// La ficha (`build/gatecity/menus.json`) se queda como respaldo: un NPC cuyo
// guion no esté horneado sigue enseñando su menú, apagado y con el motivo.

import { Guion, GLOBALES } from "./guion.js";
import { leerMision, ponerMision, limpiarMisiones, volcarMisiones } from "./misiones.js";
import { usarOpcion, nombreVisibleDe } from "./usaropcion.js";

/**
 * EL RELOJ DE LOS EVENTOS CON RETARDO.
 *
 *     if (Delay) { SCRIPT_EVENT *seEvent = EventByName(EventName);
 *                  if (seEvent) CallEventTimed(EventName, Delay); }
 *                                          scriptcmds.cpp:2278-2285
 *
 * Media conversación de Master Sword es esto: `calleventtimed 3 say_hi2`. Sin
 * un reloj, el alcalde suelta sus cuatro frases de golpe en el mismo fotograma
 * y la misión «funciona» sin que se entienda nada de lo que dice.
 *
 * Va con el paso del HUD y no con `setTimeout` por la razón de siempre en este
 * proyecto: `setTimeout` no lo puede adelantar una sonda, y una conversación de
 * dieciséis segundos que no se puede adelantar es una sonda de dieciséis
 * segundos. Ver `probe.hud.avanzar`.
 */
export class RelojDeGuiones {
  constructor() { this.tiempo = 0; this.cola = []; }
  /** `CallEventTimed(nombre, retardo)`. */
  programar(segundos, que) { this.cola.push({ cuando: this.tiempo + Math.max(0, segundos), que }); return this; }
  /**
   * Avanza. Lo que venza se ejecuta **en orden de vencimiento**, y lo que se
   * programe durante el paso queda para el siguiente: sin eso, una cadena de
   * `callevent 0 x` se comería el bucle.
   */
  paso(dt) {
    this.tiempo += dt;
    const vencidos = this.cola.filter((c) => c.cuando <= this.tiempo).sort((a, b) => a.cuando - b.cuando);
    if (!vencidos.length) return 0;
    this.cola = this.cola.filter((c) => c.cuando > this.tiempo);
    for (const c of vencidos) { try { c.que(); } catch (e) { console.warn("un evento con retardo falló:", e); } }
    return vencidos.length;
  }
  /** Cuántos quedan por vencer. Para las sondas. */
  get pendientes() { return this.cola.length; }
  vaciar() { this.cola = []; return this; }
}

/**
 * El mundo que el intérprete necesita, atado a UN NPC.
 *
 * `quien` es el jugador que está delante (su personaje y su identificador de
 * script), `npc` el bicho, y los demás son ganchos del juego. Todos opcionales:
 * lo que no se pase, no pasa nada — es lo que permite probar esto en Node sin
 * montar el juego.
 */
export function entornoDe({
  npc = null, jugador = null, catalogo = null,
  suceso = null, animar = null, programar = null, azar = null,
} = {}) {
  /** `RetrieveEntity(ref)`: aquí sólo hay dos entidades, el jugador y el NPC. */
  const esElJugador = (ref) => {
    const r = String(ref ?? "");
    return Boolean(jugador) && (r === jugador.ref || r === "ent_lastspoke" || r === "player");
  };
  const personaje = () => jugador?.personaje ?? null;

  return {
    // `$item_exists(<target>,<item>)`, script.cpp:3097. Los distintivos
    // (`nohands`, `noworn`...) se leen pero aquí sólo hay manos y mochila.
    llevaObjeto(ref, clave, distintivos = "0") {
      if (!esElJugador(ref)) return false;
      const p = personaje();
      const f = String(distintivos ?? "0");
      if (!f.includes("nohands")) {
        for (const m of Object.values(p?.manos ?? {})) {
          const id = typeof m === "string" ? m : m?.clave ?? m?.id;
          if (id === clave) return true;
        }
      }
      return (p?.objetos ?? []).some((o) => o?.id === clave);
    },

    leerMision: (ref, nombre) => (esElJugador(ref) ? leerMision(personaje(), nombre) : "0"),
    ponerMision: (ref, nombre, dato) => { if (esElJugador(ref)) ponerMision(personaje(), nombre, dato); },
    limpiarMisiones: (ref) => { if (esElJugador(ref)) limpiarMisiones(personaje()); },
    volcarMisiones: (ref) => (esElJugador(ref) ? volcarMisiones(personaje()) : []),

    /**
     * `Speak(texto, SPEECH_LOCAL)` — msmonsterserver.cpp:1588-1637.
     *
     * El formato es literal, **con las dos comillas y los DOS espacios detrás
     * de la coma**, que están en el `_snprintf` del motor (:1633):
     *
     *     _snprintf(cTemp, ..., "%s says,  \"%s\"\n", DisplayName(), pszSentence);
     *
     * Y antes se le quitan las comillas al texto (:1594-1601): un `saytext
     * "hola"` no sale entrecomillado dos veces.
     */
    hablar(texto) {
      let t = String(texto ?? "");
      if (t.startsWith('"')) { t = t.slice(1); if (t.endsWith('"')) t = t.slice(0, -1); }
      // «make sure the text has content»: sin un carácter imprimible que no sea
      // espacio, NO se dice nada. :1605-1614.
      if (!/[^\s]/.test(t)) return;
      suceso?.("normal", `${npc?.nombre ?? "Someone"} says,  "${t}"`);
    },

    /** `playanim [once|<seg>] <anim>` — npcscript.cpp:1487. */
    animar: (nombre, modo) => animar?.(nombre, modo),

    /**
     * `infomsg <player|all> <title> <text>` — scriptcmds.cpp:4058. Es una
     * ventana emergente con el título en rojo; aquí es una línea de la consola
     * de sucesos, porque este puerto no tiene esa ventana y perder el aviso
     * sería peor que enseñarlo en otro sitio.
     */
    aviso(_aQuien, titulo, texto) { suceso?.("bueno", `${titulo}${texto ? ` — ${texto}` : ""}`); },

    /** `offer <target> gold <n>` — npcscript.cpp:680, `pMonster->GiveGold`. */
    darOro(ref, cuanto) {
      if (!esElJugador(ref)) return;
      const p = personaje(); if (!p) return;
      p.oro = (p.oro ?? 0) + cuanto;
      suceso?.("bueno", `You receive ${cuanto} gold`);
    },

    /**
     * `offer <target> <item> [cantidad]` — npcscript.cpp:664-675.
     *
     * Con la mochila llena el motor no da nada y avisa («Cannot recieve items
     * while inventory is full.», :685); y si `GiveTo` falla **tira el objeto al
     * suelo** (:673). Aquí no hay objetos en el suelo todavía, así que el tope
     * es lo único que se porta.
     */
    darObjeto(ref, clave, cuantos = 1) {
      if (!esElJugador(ref)) return;
      const p = personaje(); if (!p) return;
      p.objetos ??= [];
      // `NUM_MAX_ITEMS`: el tope duro del inventario. genericitem.h.
      if (p.objetos.length >= 50) { suceso?.("nopuedes", "Cannot recieve items while inventory is full."); return; }
      const ya = p.objetos.find((o) => o.id === clave);
      if (ya) ya.n = (ya.n ?? 1) + cuantos;
      else p.objetos.push({ id: clave, n: cuantos });
      suceso?.("bueno", `You receive ${nombreVisibleDe(catalogo, clave, cuantos)}`);
    },

    /** Lo pone el propio `GuionDeNpc` al abrir el menú. */
    registrarOpcion: () => {},

    /**
     * `callexternal all <evento>` llama a TODAS las entidades con script
     * (`CallScriptEventAll`, script.cpp:5893). Aquí no hay más guiones
     * corriendo que el del NPC de delante, así que esto no llega a nadie y se
     * apunta para que no parezca que sí.
     */
    llamarExterno: () => {},

    /** `callevent <retardo> <evento>`: lo encola quien tenga reloj. */
    programar: (segundos, que) => programar?.(segundos, que),

    /** `$get(<ent>,<prop>)` — sólo las propiedades de `PROPIEDADES`. */
    propiedad(ref, prop) {
      const p = personaje();
      switch (String(prop)) {
        case "isplayer": return esElJugador(ref) ? "1" : "0";
        case "exists": return esElJugador(ref) ? "1" : "0";
        case "isalive": return esElJugador(ref) && (p?.vida ?? 0) > 0 ? "1" : "0";
        case "id": return esElJugador(ref) ? (jugador?.ref ?? "0") : "0";
        case "name": return esElJugador(ref) ? (p?.nombre ?? "0") : (npc?.nombre ?? "0");
        case "origin": return esElJugador(ref) ? (jugador?.origen ?? "0") : (npc?.origen ?? "0");
        default: return "0";
      }
    },

    /** `$dist(a,b)` en unidades del motor. Sin sitios, cero. */
    distancia: () => 0,

    /** `$get_token(<lista>,<n>)`: las listas de los scripts van por `;`. */
    token(lista, n) { return String(lista ?? "").split(";")[n] ?? "0"; },

    // `RANDOM_LONG(a, b)`, los dos extremos incluidos. script.cpp:3554.
    azar: azar ?? ((a, b) => a + Math.floor(Math.random() * (b - a + 1))),
  };
}

/**
 * Un NPC con guion, listo para que el menú le pregunte.
 *
 * Lo importante es que **el mismo objeto sirve para las dos mitades**: las
 * opciones salen de ejecutar `game_menu_getoptions` y elegir una ejecuta su
 * retrollamada sobre las MISMAS variables. En MSR eso es así porque el NPC es
 * una entidad con su `CScript` pegado, y las variables de la misión del
 * alcalde —`QUEST_GOBLINCHIEF`, `ZOMBIE_COUNT`— viven ahí mientras el mapa
 * está en pie.
 */
export class GuionDeNpc {
  /**
   * @param ficha  la entrada de `build/gatecity/guiones.json` para este script.
   * @param npc    `{ nombre, origen }`, para lo que el NPC dice y dónde está.
   */
  constructor({ ficha, npc = null, catalogo = null, suceso = null, animar = null, programar = null, azar = null }) {
    this.npc = npc;
    this.catalogo = catalogo;
    this.opciones = [];
    this.jugador = null;
    this.suceso = suceso;
    // El entorno necesita saber a quién tiene delante, y eso cambia entre una
    // llamada y otra: se le da un hueco que este objeto rellena.
    const dueño = this;
    this.entorno = entornoDe({
      npc, catalogo, suceso, animar, programar, azar,
      jugador: {
        get ref() { return dueño.jugador?.ref ?? "player"; },
        get personaje() { return dueño.jugador?.personaje ?? null; },
        get origen() { return dueño.jugador?.origen ?? "0"; },
      },
    });
    this.entorno.registrarOpcion = (op) => dueño.anotar(op);
    this.guion = new Guion({
      eventos: ficha?.eventos ?? [],
      preload: ficha?.preload ?? [],
      entorno: this.entorno,
      nombre: npc?.script ?? "",
    });
    /** `game_spawn` pone los `setvard` de partida del NPC. */
    this.guion.llamar("game_spawn", []);
  }

  /** `menuitem.register` — npcscript.cpp:940, con su orden por prioridad. */
  anotar(op) {
    const nuevo = { ...op, silencioso: String(op.tipo).toLowerCase() === "payment_silent" };
    if (nuevo.silencioso) nuevo.tipo = "payment";
    // «Scoot all the items with lower priority down the line»: se inserta ANTES
    // del primero con prioridad MENOR, o sea que con todas a cero se queda el
    // orden de registro. npcscript.cpp:980-999.
    const i = this.opciones.findIndex((o) => nuevo.prioridad > o.prioridad);
    if (i >= 0) this.opciones.splice(i, 0, nuevo); else this.opciones.push(nuevo);
    return nuevo;
  }

  /**
   * Lo que el servidor contesta a `getmenuoptions`: se ejecuta el evento y se
   * devuelve lo que haya quedado registrado. msmonsterserver.cpp:2884-2911.
   */
  pedirOpciones({ personaje, ref = "player", origen = "0" } = {}) {
    this.jugador = { personaje, ref, origen };
    // `m_MenuCurrentOptions` se pone a la lista de ESTE jugador antes de llamar
    // y a `NULL` después (:2893): fuera del evento, `menuitem.register` no hace
    // nada. Aquí eso es vaciar la lista antes de cada pregunta.
    this.opciones = [];
    this.guion.llamar("game_menu_getoptions", [ref]);
    return this.opciones;
  }

  /** `CMSMonster::UseMenuOption(pPlayer, Option)`. */
  elegir(indice, { personaje, ref = "player" } = {}) {
    this.jugador = { ...(this.jugador ?? {}), personaje, ref };
    const guion = this.guion;
    return usarOpcion({
      opciones: this.opciones,
      indice,
      personaje,
      refJugador: ref,
      nombreVisible: (clave, cuantos) => nombreVisibleDe(this.catalogo, clave, cuantos),
      npc: {
        llamar: (evento, params) => guion.llamar(evento, params),
        // `pPlayer->Speak(...)`: en `MOT_SAY` habla EL JUGADOR. :2937.
        hablarJugador: (texto) => this.entorno.hablar(texto),
        // `SendEventMsg(HUDEVENT_UNABLE, ...)`: el gris del «no puedes».
        avisar: (tipo, texto) => this.suceso?.(tipo, texto),
      },
    });
  }

  /** Lo que el guion se ha encontrado y no sabe hacer. Para la sonda. */
  get noSoportados() { return this.guion.noSoportados; }
}

export { GLOBALES };
