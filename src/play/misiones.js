// LAS MISIONES, que en Master Sword son DOS COMANDOS Y UNA LISTA.
//
// Buscar «quest» por los 4 973 archivos de `src/game/server` casa sobre todo
// con «request». El motor no tiene un sistema de misiones: tiene un comando de
// script, un getter y una lista que se guarda con el personaje.
//
//     // quest <set|unset|dump> <player> <quest_name> <value>
//     // - Sets or removes quest data on a player
//     // - Quest data saves with characters, and can be retrieved via
//     //   $get_questdata(<player>,<quest_name>)
//                                          scriptcmds.cpp:4844-4850
//     m_GlobalCmdHash["quest"]         = ...ScriptCmd_Quest;   scriptcmds.cpp:171
//     m_GlobalGetterHash["$get_quest_data"] = ...;                script.cpp:112
//
// Y el estado de una misión es **una clave de una o dos letras**, con la lista
// escrita a mano en la cabecera de `scripts/player/player_main.script:4-22`:
//
//     //r  = ring quest stage (integer)
//     //l  = lighthouse keeper (spider,grave,crystal,food)
//     //f  = Felwyn Symbol/Shard quest
//     //b1-b9 = galat chest bank
//     //dl = darkness contamination level
//
// ── Por qué una LISTA y no un objeto ──────────────────────────────────────
//
// Porque el motor usa una lista ordenada de pares y el orden se ve: `quest dump`
// los escribe en el orden en que se pusieron (scriptcmds.cpp:4890-4895). Un
// objeto de JavaScript conserva el orden de las claves de cadena, pero no el de
// las que parecen números —`"1"`, `"20"`— y una misión puede llamarse así. La
// lista no tiene ese borde.
//
//     quest_t { Name; Data; }      y `m_Quests` se recorre entera para buscar
//                                  por nombre.            player.cpp:6293-6305
//
// ── Y CÓMO SE GUARDA, que es la parte que puede comerse una partida ───────
//
//     gFile.WriteByte(CHARDATA_QUESTS1);        //[BYTE - CHUNK - QUESTS]
//     gFile.WriteInt(pPlayer->m_Quests.size()); //[INT]
//     for (q...) { WriteString(Name); WriteString(Data); }
//                                          sv_character.cpp:687-694
//
// Es **un trozo propio con su etiqueta**, que es justo la decisión que
// `src/juego/personaje.js` ya copió en su cabecera: un personaje guardado antes
// de que existieran las misiones no trae el trozo, y al leerlo sale una lista
// vacía. Aquí eso es `misiones ?? []` en `abrirPersonaje`, y lo defiende
// `test/juego_misiones.test.mjs` con un documento de los del experimento 30.

/** `CBasePlayer::m_Quests` de un personaje, siempre una lista. */
export function misionesDe(personaje) {
  if (!Array.isArray(personaje?.misiones)) return [];
  return personaje.misiones;
}

/**
 * `$get_quest_data(<target>, <questname>)` — script.cpp:2175-2190.
 *
 * Y devuelve **`"0"`** cuando no está puesta, no vacío ni nulo (`return "0";`,
 * script.cpp:2189). Eso importa: `if RQUEST_STAGE >= 1` con la misión sin poner
 * compara contra cero y da falso, que es lo que se quiere. Si devolviera el
 * nombre —como hace la resolución de variables— daría cierto.
 */
export function leerMision(personaje, nombre) {
  const n = String(nombre);
  for (const q of misionesDe(personaje)) if (q.n === n) return String(q.d);
  return "0";
}

/** ¿Está puesta? Distinto de valer cero, que es lo que `leerMision` no puede decir. */
export function tieneMision(personaje, nombre) {
  return misionesDe(personaje).some((q) => q.n === String(nombre));
}

/**
 * `CBasePlayer::SetQuest` — player.cpp:6275-6316.
 *
 * `dato === null` es el `unset`: borra la entrada. Poner una que ya existe
 * **pisa el valor y conserva el sitio**; poner una nueva la añade al final.
 */
export function ponerMision(personaje, nombre, dato) {
  if (!personaje) return null;
  if (!Array.isArray(personaje.misiones)) personaje.misiones = [];
  const n = String(nombre);
  const i = personaje.misiones.findIndex((q) => q.n === n);
  if (i >= 0) {
    if (dato === null || dato === undefined) { personaje.misiones.splice(i, 1); return null; }
    personaje.misiones[i].d = String(dato);
    return personaje.misiones[i];
  }
  // «if (Found <= -1) { if (SetData) {...} }»: un `unset` de algo que no está
  // no hace nada, y tampoco da error.
  if (dato === null || dato === undefined) return null;
  const q = { n, d: String(dato) };
  personaje.misiones.push(q);
  return q;
}

/**
 * `quest clear <player>` — scriptcmds.cpp:4867-4871.
 *
 * Y con él viene un fallo del motor que conviene dejar escrito aunque aquí no
 * se pueda reproducir: `msstring &Data = Params[3];` se lee **antes** de
 * comprobar `Params.size() >= 4` (scriptcmds.cpp:4864), o sea que
 * `quest unset <jugador> <nombre>` —tres parámetros— lee fuera de la lista. En
 * C++ eso es memoria de nadie; en JavaScript es `undefined`, que es lo que
 * `ejecutarComando` le pasa a `ponerMision` como `null`. El efecto visible es
 * el mismo porque el valor no se usa al borrar.
 */
export function limpiarMisiones(personaje) {
  if (personaje) personaje.misiones = [];
}

/** `quest dump`: lo que el motor escribe en la consola. scriptcmds.cpp:4890-4895. */
export function volcarMisiones(personaje) {
  return misionesDe(personaje).map((q, i) => `#${i} name: ${q.n} data: ${q.d}`);
}
