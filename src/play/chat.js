// HABLAR: la regla del chat de Master Sword, sin DOM y sin red.
//
// Aquí no se dibuja nada y no se manda nada. Lo que hay es lo que el motor
// decide antes de dibujar y antes de mandar: **qué frase se construye** y
// **quién la oye**. Las dos cosas están en una sola función del mod,
// `CMSMonster::Speak` (`msmonsterserver.cpp:1588-1748`), y las dos son más
// raras de lo que uno supondría.
//
// ── Tres canales, y no son «tres colores» ──────────────────────────────────
//
// Master Sword no tiene «chat» y «chat de equipo»: tiene **tres maneras de
// hablar** que se eligen con tres teclas distintas, y cada una construye una
// frase distinta:
//
//     bind "y" "say_text 0"      global   ->  «[global] Ana: hola»
//     bind "u" "say_text 1"      local    ->  «Ana says,  "hola"»
//     bind "j" "say_text 2"      party    ->  «[party] Ana: hola»
//                                    ../MSC/assets/msr/config.cfg:23, 28, 32
//
// El local no lleva prefijo ni dos puntos: lleva el verbo. Y lleva **dos
// espacios** después de la coma, porque en el motor está escrito así:
//
//     _snprintf(cTemp, sizeof(cTemp), "%s says,  \"%s\"\n", DisplayName(), pszSentence);
//                                                   msmonsterserver.cpp:1632
//
// Eso es una errata de 2007 que lleva dieciocho años en pantalla. Se porta con
// los dos espacios: lo roto se porta con el fallo.
//
// El cuarto tipo, `SAYTEXT_NPC`, **no lo puede mandar un cliente** —
// `__CmdFunc_StartSayText` sólo acepta `Type >= 0 && Type <= 2`
// (`vgui_hud.cpp:492-497`)— y sale de que hable un NPC en local: el tipo se
// decide con `IsPlayer()`, no con la tecla (`msmonsterserver.cpp:1634`).
//
// ── Quién lo oye ───────────────────────────────────────────────────────────
//
// El orden importa y no es el que uno escribiría:
//
//   1. **el que habla se oye siempre**, antes de mirar distancia ni equipo;
//   2. si es local y la distancia **en 2D** pasa de `m_SayTextRange`, no;
//   3. si es party y quien habla es un jugador y no sois del mismo equipo, no;
//   4. si no, sí.
//
// Que la distancia sea 2D —`Length2D()`— significa que **la altura no cuenta**:
// alguien tres pisos por encima de ti, en la misma vertical, te oye hablar
// bajito. Y que el que habla se oiga primero significa que tu propia frase
// local te sale en pantalla aunque estés solo.
//
// ── El corral de los 6 000 ─────────────────────────────────────────────────
//
// Y hay un límite que no se ve nunca y existe:
//
//     UTIL_EntitiesInBox(pList, 255, Vector(-6000,-6000,-6000),
//                        Vector(6000,6000,6000), FL_MONSTER|FL_CLIENT|FL_SPECTATOR);
//                                                   msmonsterserver.cpp:1652
//
// El «global» no es global: es **una caja de 12 000 unidades centrada en el
// origen del mapa**, y como mucho 255 entidades. Un mapa que se salga de ahí
// tiene jugadores que no oyen los gritos. Gate City y Edana caben, así que es
// una regla que se porta y hoy no cambia nada — pero se porta, porque el día
// que un mapa no quepa el fallo va a parecer de la red.

/** `enum saytext_e` — `shared/ms/saytext.h:3-9`. El orden es el del cable. */
export const HABLA = Object.freeze({
  GLOBAL: 0,
  LOCAL: 1,
  PARTY: 2,
  NPC: 3,
});

/** Los nombres, por número, para no andar comparando enteros por ahí. */
export const NOMBRE_DE_HABLA = Object.freeze(["global", "local", "party", "npc"]);

/**
 * Lo que un cliente puede mandar: `Type >= 0 && Type <= 2`.
 *
 *     int Type = atoi(gEngfuncs.Cmd_Argv(1));
 *     if (Type >= 0 && Type <= 2) HUD_StartSayText(Type);
 *                                                   vgui_hud.cpp:492-497
 *
 * `NPC` queda fuera a propósito: es del servidor. Sin esta puerta, un cliente
 * podría pintar sus frases con el color de un NPC.
 */
export function puedeMandar(tipo) {
  return Number.isInteger(tipo) && tipo >= HABLA.GLOBAL && tipo <= HABLA.PARTY;
}

/**
 * Los cuatro colores, `vgui_hud.cpp:474-482`.
 *
 *     SAYTEXT_GLOBAL -> Color(255, 255, 255, 0)
 *     SAYTEXT_LOCAL  -> Color(255, 178, 0, 0)
 *     SAYTEXT_PARTY  -> Color(60, 200, 20, 0)
 *     SAYTEXT_NPC    -> Color(255, 178, 0, 0)
 *
 * Local y NPC son **el mismo ámbar**: en pantalla no se distinguen por color,
 * se distinguen por la frase («Ana says,  "x"» contra el nombre del bicho). El
 * alfa 0 es la inversión de VGUI de siempre — 0 es opaco.
 */
export const COLORES_DE_HABLA = Object.freeze({
  global: Object.freeze({ rgb: [255, 255, 255], que: "a gritos, todo el mapa" }),
  local: Object.freeze({ rgb: [255, 178, 0], que: "hablando, a 300 unidades" }),
  party: Object.freeze({ rgb: [60, 200, 20], que: "a los tuyos" }),
  npc: Object.freeze({ rgb: [255, 178, 0], que: "lo dice un NPC" }),
});

/** `rgb(r, g, b)` de un canal, para CSS. */
export function colorDeHabla(tipo) {
  const c = COLORES_DE_HABLA[tipo] ?? COLORES_DE_HABLA.global;
  return `rgb(${c.rgb[0]}, ${c.rgb[1]}, ${c.rgb[2]})`;
}

/**
 * Las tres teclas, tal cual las trae `config.cfg` recién instalado.
 *
 *     bind "j" "say_text 2"      config.cfg:23
 *     bind "u" "say_text 1"      config.cfg:28
 *     bind "y" "say_text 0"      config.cfg:32
 *
 * No se inventa una: el juego tiene tres teclas de hablar y son éstas.
 */
export const TECLAS_DE_HABLA = Object.freeze({
  KeyY: HABLA.GLOBAL,
  KeyU: HABLA.LOCAL,
  KeyJ: HABLA.PARTY,
});

/** `m_TextPanel->m_MaxLetters = 120;` — `vgui_startsaytext.h:31`. */
export const MAX_LETRAS = 120;

/** `#define SPEECH_LOCAL_RANGE 300` — `msmonster.h:79`, en unidades de GoldSrc. */
export const RANGO_LOCAL = 300;

/**
 * La caja de `UTIL_EntitiesInBox`, `msmonsterserver.cpp:1652`. Ver la cabecera.
 */
export const CORRAL = Object.freeze({ radio: 6000, maxEntidades: 255 });

/**
 * El icono que sale a la izquierda del cajetín mientras escribes.
 *
 *     const char* ImageName = "hud_shout";
 *     if (m_Type == SAYTEXT_LOCAL) ImageName = "hud_talk";
 *     else if (m_Type == SAYTEXT_PARTY) ImageName = "hud_party";
 *                                              vgui_startsaytext.h:37-42
 *
 * Fíjate en que el de por omisión es el de gritar, no el de hablar.
 */
export function iconoDeHabla(tipo) {
  if (tipo === HABLA.LOCAL) return "hud_talk";
  if (tipo === HABLA.PARTY) return "hud_party";
  return "hud_shout";
}

/**
 * Quita las comillas de fuera, como hace `Speak` antes de nada.
 *
 *     if (*pszSentence == '"') {
 *         if (strlen(pszSentence) > 1) {
 *             pszSentence++;
 *             if (pszSentence[strlen(pszSentence)-1] == '"') pszSentence[...] = 0;
 *         }
 *     }                                        msmonsterserver.cpp:1593-1602
 *
 * Dos cosas que se copian porque son del motor y no de la lógica:
 *   - la comilla final **sólo** se quita si había una al principio;
 *   - una cadena que sea exactamente `"` se queda como está (`strlen > 1`).
 */
export function sinComillas(texto) {
  let s = String(texto ?? "");
  if (s[0] !== '"' || s.length <= 1) return s;
  s = s.slice(1);
  if (s.endsWith('"')) s = s.slice(0, -1);
  return s;
}

/**
 * ¿Hay algo que decir? `msmonsterserver.cpp:1605-1614`.
 *
 *     for (pc = pszSentence; pc && *pc; pc++)
 *         if (isprint(*pc) && !isspace(*pc)) { pc = NULL; break; }
 *     if (pc != NULL) return;
 *
 * O sea: hace falta **al menos un carácter imprimible que no sea un espacio**.
 * Una línea de espacios no se manda, y una vacía tampoco. Lo de `isprint` se
 * traduce aquí como «no es un carácter de control», que es lo que `isprint`
 * niega en ASCII.
 */
export function tieneContenido(texto) {
  const s = String(texto ?? "");
  for (const c of s) {
    const n = c.codePointAt(0);
    if (n < 0x20 || n === 0x7f) continue;   // !isprint
    if (/\s/.test(c)) continue;             // isspace
    return true;
  }
  return false;
}

/**
 * La frase final, letra por letra como la arma el motor.
 *
 *     case SPEECH_GLOBAL: strcat(FinalSentence, "[global] "); break;
 *     case SPEECH_PARTY:  strcat(FinalSentence, "[party] ");  break;
 *     case SPEECH_LOCAL:
 *         _snprintf(cTemp, ..., "%s says,  \"%s\"\n", DisplayName(), pszSentence);
 *         strcat(FinalSentence, cTemp); break;
 *     if (SpeechType != SPEECH_LOCAL) {
 *         strcat(FinalSentence, DisplayName());
 *         strcat(FinalSentence, ": ");
 *         strcat(FinalSentence, pszSentence);
 *         strcat(FinalSentence, "\n");
 *     }                                        msmonsterserver.cpp:1621-1649
 *
 * @param {string} nombre  `DisplayName()`
 * @param {string} texto   ya sin comillas
 * @param {number} tipo    uno de `HABLA`
 * @returns {string} con su `\n` final, que es parte de la frase
 */
export function frase(nombre, texto, tipo = HABLA.GLOBAL) {
  const quien = String(nombre ?? "");
  const que = String(texto ?? "");
  if (tipo === HABLA.LOCAL || tipo === HABLA.NPC) return `${quien} says,  "${que}"\n`;
  const prefijo = tipo === HABLA.PARTY ? "[party] " : "[global] ";
  return `${prefijo}${quien}: ${que}\n`;
}

/**
 * Con qué color llega la frase: el tipo del cable **no es el tipo de la tecla**.
 *
 *     SayTextType = IsPlayer() ? SAYTEXT_LOCAL : SAYTEXT_NPC;
 *                                              msmonsterserver.cpp:1634
 *
 * Sólo cambia en local: un NPC que habla global —que puede— manda `GLOBAL`.
 */
export function tipoEnElCable(tipo, esJugador = true) {
  if (tipo === HABLA.LOCAL && !esJugador) return HABLA.NPC;
  return tipo;
}

/**
 * ¿Este oyente recibe esta frase? El bucle de `Speak`, en su orden.
 *
 *     if (pEnt->edict() == edict()) { ...enviar...; continue; }   // 1
 *     if (SpeechType == SPEECH_LOCAL)
 *         if ((pEnt->Center() - Center()).Length2D() > m_SayTextRange) continue;
 *     if ((SpeechType == SPEECH_PARTY && IsPlayer()) && !SameTeam(pEnt, this)) continue;
 *                                              msmonsterserver.cpp:1699-1718
 *
 * @param {number} tipo
 * @param {object} o
 * @param {boolean} o.esElQueHabla  el oyente es el que habla
 * @param {number}  o.distancia2D   unidades, sin la altura
 * @param {boolean} o.mismoEquipo   `SameTeam`
 * @param {boolean} o.hablaUnJugador `IsPlayer()` del que habla
 * @param {number}  o.rango         `m_SayTextRange`, que un guion puede cambiar
 */
export function loOye(tipo, {
  esElQueHabla = false,
  distancia2D = 0,
  mismoEquipo = true,
  hablaUnJugador = true,
  rango = RANGO_LOCAL,
} = {}) {
  if (esElQueHabla) return true;
  if ((tipo === HABLA.LOCAL || tipo === HABLA.NPC) && distancia2D > rango) return false;
  if (tipo === HABLA.PARTY && hablaUnJugador && !mismoEquipo) return false;
  return true;
}

/** La distancia que mira el motor: la del plano, sin la altura. */
export function distancia2D(a, b) {
  const dx = (a?.[0] ?? 0) - (b?.[0] ?? 0);
  const dz = (a?.[2] ?? 0) - (b?.[2] ?? 0);
  return Math.hypot(dx, dz);
}

/**
 * Lo que sale en la consola de sucesos al cambiar de canal con la tecla.
 *
 *     SayString = "You ";
 *     case SPEECH_GLOBAL: += "begin to shout!\n";
 *     case SPEECH_PARTY:  += "aim your voice toward your party.\n";
 *     default:            += "speak normally.\n";
 *                                              hudmisc.cpp:159-176
 */
export function avisoDeCanal(tipo) {
  if (tipo === HABLA.GLOBAL) return "You begin to shout!";
  if (tipo === HABLA.PARTY) return "You aim your voice toward your party.";
  return "You speak normally.";
}

/**
 * Todo el camino del servidor de una vez: de lo que llega por el cable a la
 * frase y a la lista de quién la recibe.
 *
 * Devuelve `null` cuando no hay nada que mandar, que es lo que hace `Speak`
 * con un `return` seco. Los dos motivos son los del motor: un tipo que un
 * cliente no puede mandar, y un texto sin un solo carácter imprimible.
 *
 * @param {object} o
 * @param {string} o.nombre    quién habla
 * @param {string} o.texto     lo que ha escrito, crudo
 * @param {number} o.tipo      la tecla que ha pulsado
 * @param {boolean} o.esJugador
 * @param {Array<{id:*, pies:number[], equipo:*}>} o.oyentes  todos, él incluido
 * @param {*} o.quienHabla     el `id` del que habla, para reconocerlo
 * @param {number[]} o.pies    dónde está el que habla
 * @param {number} o.rango
 * @returns {{tipo:number, texto:string, para:Array<*>}|null}
 */
export function hablar({
  nombre = "", texto = "", tipo = HABLA.GLOBAL, esJugador = true,
  oyentes = [], quienHabla = null, pies = [0, 0, 0], equipo = null,
  rango = RANGO_LOCAL,
} = {}) {
  if (esJugador && !puedeMandar(tipo)) return null;
  const limpio = sinComillas(texto);
  if (!tieneContenido(limpio)) return null;

  const enCable = tipoEnElCable(tipo, esJugador);
  const dicho = frase(nombre, limpio, enCable);

  const para = [];
  for (const o of oyentes) {
    const esElQueHabla = o?.id === quienHabla;
    // El corral: quien esté fuera de la caja no está en `pList` y no se entera
    // ni del «global». Se mira con el centro del mapa, que es el origen.
    if (!esElQueHabla && !dentroDelCorral(o?.pies)) continue;
    if (loOye(enCable, {
      esElQueHabla,
      distancia2D: distancia2D(o?.pies, pies),
      mismoEquipo: equipo != null && o?.equipo === equipo,
      hablaUnJugador: esJugador,
      rango,
    })) para.push(o.id);
    if (para.length >= CORRAL.maxEntidades) break;
  }
  return { tipo: enCable, texto: dicho, para };
}

/** La caja de `UTIL_EntitiesInBox`, en coordenadas del mundo. */
export function dentroDelCorral(pies) {
  if (!pies) return false;
  const r = CORRAL.radio;
  return Math.abs(pies[0] ?? 0) <= r && Math.abs(pies[1] ?? 0) <= r && Math.abs(pies[2] ?? 0) <= r;
}
