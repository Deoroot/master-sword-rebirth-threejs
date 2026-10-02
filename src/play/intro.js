// LA PRESENTACIÓN DEL MAPA: cómo te dice el juego dónde has entrado y si te
// va grande.
//
// Esto es lo que faltaba y se notaba: Gate City **se declara a sí mismo un mapa
// de nivel 10-25**, el juego lo dice en la cara al entrar, y aquí no lo decía
// nadie. Un personaje recién hecho entraba a un pueblo con 8 goblins y 22
// enanos zombi sin un solo aviso.
//
// ── La cadena, que son tres eventos y dos retardos ────────────────────────
//
// Todo está en el guion del jugador, `player/player_main.script`:
//
//   :1025-1030  { game_player_putinworld }        al aparecer en el mundo
//                 if ( !GAVE_MAP_INTRO )
//                   if G_MAP_NAME isnot 'G_MAP_NAME'
//                   setvard GAVE_MAP_INTRO 1
//                   callevent 10.0 give_map_intro
//
//   :525-533    { give_map_intro }                 a los 10 s
//                 infomsg ent_me G_MAP_NAME G_MAP_DESC
//                 callevent 3.0 give_map_diff
//
//   :552-557    { give_map_diff }                  a los 13 s
//                 if ( G_MAP_DIFF isnot 'G_MAP_DIFF' )
//                   infomsg ent_me "Intended Difficulty" G_MAP_DIFF
//                 if game.monster.maxhp >= 5
//                 if ( game.monster.maxhp < G_WARN_HP )
//                   infomsg ent_me "WARNING" "This area maybe too difficult at your level!"
//
// Tres cosas que no se adivinan y que cambian lo que se ve:
//
// 1. **Diez segundos, no cero.** No es un cartel de carga: llega cuando ya
//    estás andando. Y la dificultad llega **trece** segundos después de
//    aparecer, no junto al nombre.
// 2. **Sin nombre no hay nada.** El guardia de `:1027` es sobre `G_MAP_NAME`,
//    así que un mapa que no se presenta tampoco avisa de su dificultad, aunque
//    la declare. Va portado con el fallo.
// 3. **`GAVE_MAP_INTRO` es una vez por mapa**, no por muerte: `game_respawn`
//    no lo borra. Mueres, reapareces y ya no te lo repite.
//
// ── El umbral, y por qué es tu vida máxima y no un nivel ──────────────────
//
// `game.monster.maxhp` sale de `pMonster->MaxHP()` (scriptcmds.cpp:1391); en el
// guion del jugador el ente del script eres tú, así que es **tu vida máxima**.
// En Master Sword no hay nivel —lo dice `src/play/nivel.js`—, y por eso el
// juego mide el «tu nivel» del texto en puntos de vida.
//
// El `if game.monster.maxhp >= 5` de en medio es un guardia suelto, del estilo
// de `if !EXIT_SUB`: corta el evento si no se cumple. Cinco es la vida de un
// personaje con los tres atributos a 1 (`5 + 0 + 0 + 0`, playershared.cpp:1057),
// o sea que sólo excluye a quien todavía no tiene ficha.
//
// ── De dónde salen los cuatro valores, que tienen DOS fuentes ─────────────
//
// Y se contradicen. El `worldspawn` del `.bsp` de Gate City dice
// `maptitle "Gatecity by DrKill"`; su `map_startup.script` dice `"Gatecity"`.
// Gana el guion, y no por gusto: `world.script` resuelve sus `#include` en
// orden y `#include` llama a `Spawn()` donde aparece (script.cpp:5255), así que
//
//     :19   #include [server] world/sv_world        ← lee el .bsp
//     :27   #include [casual] $currentmapscript     ← lee el map_startup
//
// el `setvarg` del mapa pisa al del mundo. `sv_world.script:7-9` es el que
// carga los del `.bsp`:
//
//     setvarg G_MAP_NAME game.map.title
//     setvarg G_MAP_DESC game.map.desc
//     setvarg G_WARN_HP  game.map.hpwarn
//
// Que se vea que gana el guion es comprobable sin discutirlo: el `worldspawn`
// de Edana trae los marcadores del editor sin tocar —`maptitle "My Map Name"`,
// `mapdesc "A brief description of my map"`— y en el juego Edana se llama «The
// Village of Edana». Si ganara el `.bsp`, se llamaría «My Map Name».
//
// El cuarto, `G_MAP_DIFF`, **sólo existe en el guion**: no hay ninguna clave de
// `worldspawn` que lo ponga. `world.cpp:693-709` sólo conoce `hpwarn`,
// `mapdesc` y `maptitle`.
//
// Y una trampa del motor en los tres que sí vienen del `.bsp`: `game.map.title`
// y compañía devuelven la cadena **sólo si `len() > 1`**, y si no devuelven la
// cadena `"0"` (script.cpp:4616-4644). O sea que un `mapdesc` de una sola letra
// se convierte en un cero, y ese cero es lo que se guarda. No es un vacío.

/** A los cuántos segundos de aparecer sale el nombre. `player_main.script:1029`. */
export const RETARDO_INTRO = 10.0;

/** Y cuántos MÁS tarda la dificultad. `player_main.script:533`. */
export const RETARDO_DIFICULTAD = 3.0;

/** Por debajo de esta vida máxima no se avisa de nada. `player_main.script:555`. */
export const VIDA_MINIMA = 5;

/** El título fijo del segundo aviso. `player_main.script:554`. */
export const TITULO_DIFICULTAD = "Intended Difficulty";

/** El título y el texto del tercero, literales. `player_main.script:556`. */
export const TITULO_AVISO = "WARNING";
export const TEXTO_AVISO = "This area maybe too difficult at your level!";

/**
 * Lo que devuelve el motor cuando una cadena del `worldspawn` no llega a dos
 * caracteres: la cadena `"0"`, no un vacío. script.cpp:4616-4644.
 */
const NO_HAY = "0";

/** `msstring::len() > 1 ? valor : "0"`, que es la puerta de los tres del `.bsp`. */
function delBsp(valor) {
  const s = valor == null ? "" : String(valor);
  return s.length > 1 ? s : NO_HAY;
}

/**
 * Los cuatro valores que usa la presentación, resueltos entre las dos fuentes.
 *
 * `bsp` son las claves del `worldspawn` tal cual (`maptitle`, `mapdesc`,
 * `hpwarn`); `guion` son los `setvarg G_*` del `map_startup.script` del mapa.
 * **Gana el guion**, por el orden de `world.script` explicado arriba.
 *
 * Un campo que no pone ninguna de las dos se queda en `null`, que es lo que
 * aquí significa «la variable global no existe» — el `isnot 'G_MAP_NAME'` del
 * guion. No se rellena con nada plausible a propósito: un valor por defecto
 * que parece razonable es un fallo que nadie busca.
 */
export function resolverMapa({ bsp = {}, guion = {} } = {}) {
  // `sv_world.script:7-9`, que corre primero y sólo sabe del .bsp.
  const delMundo = {
    nombre: delBsp(bsp.maptitle),
    descripcion: delBsp(bsp.mapdesc),
    // `hpwarn` es una cadena en el motor y se compara como número.
    avisoVida: delBsp(bsp.hpwarn),
    dificultad: null,   // no existe en el worldspawn: no hay clave que lo ponga
  };
  // Y ahora el `map_startup` del mapa, que pisa lo que traiga.
  const puesto = (v) => v != null && v !== "";
  return {
    nombre: puesto(guion.G_MAP_NAME) ? String(guion.G_MAP_NAME) : delMundo.nombre,
    descripcion: puesto(guion.G_MAP_DESC) ? String(guion.G_MAP_DESC) : delMundo.descripcion,
    dificultad: puesto(guion.G_MAP_DIFF) ? String(guion.G_MAP_DIFF) : delMundo.dificultad,
    avisoVida: Number(puesto(guion.G_WARN_HP) ? guion.G_WARN_HP : delMundo.avisoVida) || 0,
  };
}

/**
 * LOS AVISOS DE ENTRAR A UN MAPA, con el segundo en que sale cada uno.
 *
 * `mapa` es lo que devuelve `resolverMapa`; `vidaMaxima` es la tuya.
 *
 * Devuelve una lista de `{ cuando, titulo, texto }` en segundos desde que
 * apareces, lista para que la ponga en cola quien dibuje. Vacía si el mapa no
 * se presenta, que es el fallo del punto 2 de arriba.
 *
 * No decide **si** toca presentarse: eso es `GAVE_MAP_INTRO`, que es estado de
 * la partida y vive fuera. Aquí sólo está la regla.
 */
export function presentacion(mapa, vidaMaxima = 0) {
  const m = mapa ?? {};
  // `if G_MAP_NAME isnot 'G_MAP_NAME'`, :1027. Sin nombre no se llama ni a
  // `give_map_intro`, así que tampoco hay dificultad ni aviso.
  if (m.nombre == null || m.nombre === "") return [];

  const avisos = [{
    cuando: RETARDO_INTRO,
    titulo: String(m.nombre),
    // `infomsg ent_me G_MAP_NAME G_MAP_DESC` con la descripción sin poner manda
    // el nombre de la variable; con el `"0"` del motor manda un cero. Se guarda
    // tal cual y se deja que se vea: es lo que enseña que falta el dato.
    texto: m.descripcion == null ? "" : String(m.descripcion),
  }];

  const cuando = RETARDO_INTRO + RETARDO_DIFICULTAD;

  // `if ( G_MAP_DIFF isnot 'G_MAP_DIFF' )`, :554.
  if (m.dificultad != null && m.dificultad !== "") {
    avisos.push({ cuando, titulo: TITULO_DIFICULTAD, texto: String(m.dificultad) });
  }

  // Los dos guardias de :555-556, en ese orden y los dos sobre TU vida máxima.
  const vida = Number(vidaMaxima) || 0;
  const umbral = Number(m.avisoVida) || 0;
  if (vida >= VIDA_MINIMA && vida < umbral) {
    avisos.push({ cuando, titulo: TITULO_AVISO, texto: TEXTO_AVISO });
  }

  return avisos;
}
