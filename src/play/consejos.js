// LOS CONSEJOS DE UNA SOLA VEZ — `helptip`, el 64.
//
// Master Sword te explica las cosas **la primera vez que te pasan**: la primera
// vez que mueres, la primera vez que subes una habilidad, la primera vez que
// pisas una transición. No es un tutorial aparte: son cuatro scripts del
// jugador —`help/first_death`, `help/first_skillgain`, `help/first_party`,
// `help/first_transition`— que llaman a un solo comando.
//
//     helptip <player|all> <tipname|generic> <title> <text>
//                                            scriptcmds.cpp:3595-3631
//
// Este archivo es LA REGLA: qué se manda, a quién, y cuándo NO se manda porque
// ya se vio. No sabe qué es una ventana — eso es de `src/juego/mensajes.js`,
// que tiene la pila de ayuda portada desde el 60 y **a la que no llamaba
// nadie**: hasta hoy el único que la abría era `window.probe`. Un comando
// portado que no llega a ningún sitio y una ventana portada que nadie abre son
// la misma línea que falta.
//
// ── Las dos rarezas del original, que se portan porque cambian lo que sale ──
//
// 1. **El texto se pega SIN separador.** `playermessage` junta sus palabras
//    con un espacio (scriptcmds.cpp:4243-4290) y éste no:
//
//        for(int i = 0; i < Params.size() - 3; i++)
//            buffer += static_cast<const char*>(Params[i+3]);
//
//    O sea que `helptip ent_me x "Título" hola mundo` sale «holamundo». En los
//    scripts del juego el texto viene siempre en UNA variable, así que no se
//    nota — pero quien escriba un `helptip` nuevo con varias palabras sueltas
//    se encuentra esto, y es del mod.
//
// 2. **`generic` no se recuerda.** La comprobación es `contains("generic")`,
//    no una igualdad: cualquier clave que LLEVE «generic» dentro se puede
//    mandar una y otra vez. Es lo que usa Thothie para las ventanas de varias
//    líneas (el comentario MAR2008a lo dice).
//
// Y una tercera que no es rareza sino contrato: **una clave ya vista corta
// antes de llamar a `game_helptip`**, así que el gancho del guion tampoco se
// dispara la segunda vez (playershared.cpp:1139-1150).

/** El separador de líneas dentro del texto de un consejo. */
export const BARRA = "|";

/**
 * `mstipname.contains("generic")` — playershared.cpp:1136-1137.
 *
 * Lleva, no es: `mi_generic_2` también es genérica. Se porta la comprobación
 * del mod y no la que uno escribiría.
 */
export function esGenerico(clave) {
  return String(clave ?? "").includes("generic");
}

/**
 * Parte los parámetros de `helptip` como los parte el motor.
 *
 * @param {string[]} params `<player|all> <tipname> <title> <text...>`
 * @returns {{aQuien:string, clave:string, titulo:string, texto:string}|null}
 *          `null` si faltan parámetros, que es el `ERROR_MISSING_PARMS` del
 *          motor: se queja y no manda nada (scriptcmds.cpp:3628).
 */
export function partirConsejo(params = []) {
  if (!Array.isArray(params) || params.length < 4) return null;
  return {
    aQuien: String(params[0] ?? ""),
    clave: String(params[1] ?? ""),
    titulo: String(params[2] ?? ""),
    // Pegado, sin espacios. Ver la rareza 1 de arriba.
    texto: params.slice(3).map((p) => String(p ?? "")).join(""),
  };
}

/**
 * Las líneas de un consejo. El texto lleva sus saltos como `|`, y el mod lo
 * dice en el propio comentario del comando: «helptips can have multiple lines
 * by parsing <text> with "|"» (scriptcmds.cpp:3599).
 *
 * Dos barras seguidas son una línea en blanco, que es como `first_skillgain`
 * separa sus párrafos (`stradd TEXT "||Level 1 charge is usually..."`).
 */
export function lineasDeConsejo(texto) {
  return String(texto ?? "").split(BARRA);
}

/**
 * Los consejos que este personaje ya ha visto.
 *
 * Va en el personaje y **se guarda**: en el original es
 * `m_ViewedHelpTips`, que se escribe en el archivo del personaje con su propio
 * identificador de bloque (`CHARDATA_HELPTIPS1`, sv_character.cpp:322-336 al
 * leer y :682-684 al escribir). O sea que «la primera vez que mueres» es la
 * primera vez de ESE personaje, para siempre, y no la primera de esta partida.
 */
export class Consejos {
  constructor({ vistos = [] } = {}) {
    /** Las claves ya enseñadas, en orden de aparición como en el mod. */
    this.vistos = [...vistos].map(String);
  }

  /** ¿Se puede enseñar esta clave? */
  puede(clave) {
    if (esGenerico(clave)) return true;
    return !this.vistos.includes(String(clave));
  }

  /**
   * Manda un consejo si toca.
   *
   * @returns {{clave:string, titulo:string, lineas:string[], aQuien:string,
   *            evento:{nombre:string, params:string[]}|null}|null}
   *          `null` si ya se había visto. El `evento` es el gancho que el
   *          motor llama después —`CallScriptEvent("game_helptip", {Title,
   *          Tipname})`, playershared.cpp:1145-1150— y va con los parámetros
   *          **en ese orden**, que es al revés de como los recibe el comando.
   */
  mandar(params = []) {
    const c = partirConsejo(params);
    if (!c) return null;
    if (!this.puede(c.clave)) return null;
    const generico = esGenerico(c.clave);
    // El motor lo apunta DESPUÉS de mandarlo (playershared.cpp:1180), y no
    // apunta los genéricos — si los apuntara, dejarían de ser repetibles.
    if (!generico) this.vistos.push(c.clave);
    return {
      clave: c.clave,
      titulo: c.titulo,
      aQuien: c.aQuien,
      lineas: lineasDeConsejo(c.texto),
      // `game_helptip` **no se llama con los genéricos**: el `if
      // (!generic_tip)` envuelve la llamada entera.
      evento: generico ? null : { nombre: "game_helptip", params: [c.titulo, c.clave] },
    };
  }
}
