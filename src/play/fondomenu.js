// QUÉ SE VE DETRÁS DEL MENÚ PRINCIPAL.
//
// ── Lo que había, y por qué está mal ─────────────────────────────────────
//
// Entrar sin `?map=` cargaba Gate City entera y dejaba el menú encima. Medido
// con el menú delante y sin haber pulsado nada:
//
//   mapa            gatecity, 41 494 tri, 299 texturas
//   dibujado        145 070 tri por fotograma en 636 llamadas
//   NPC             69 montados, 33 hostiles
//   ¿se mueven?     45 de los 69 se movieron en 4 s, hasta 3,74 m
//   jugador         existe, con posición
//   sesion          true
//
// Eso no es un fondo: **es una partida**. Arrancar el juego era entrar a Gate
// City con treinta y tres monstruos cazando, y el menú era una tapa encima.
// Y el mapa que se cargaba salía de `MAPA_POR_DEFECTO`, o sea que «el mapa que
// juegas si no dices otra cosa» y «lo que se ve detrás del menú» eran la misma
// constante por accidente.
//
// ── Lo que hace el motor, que resulta que tiene esto resuelto ────────────
//
// Xash3D —que es el motor sobre el que corre Master Sword Rebirth hoy, ver
// CLAUDE.md §2— tiene **mapas de fondo de serie**, y no son un `map` normal:
//
//   mainui/BaseMenu.cpp:547-581   `UI_StartBackGroundMap()` elige uno al azar
//                                 de `uiStatic.bgmaps` y manda
//                                 `map_background <nombre>`.
//   server/sv_init.c:1011, :1060  `SV_SpawnServer(..., background)` guarda
//   server/sv_init.c:1092-1093    `sv.background`, y lo publica en los cvars
//                                 `sv_background` y `cl_background`.
//
// Y lo que el modo fondo **apaga**, que es la parte que importa aquí:
//
//   server/sv_client.c:1422-1423  al entrar, el jugador recibe
//                                 `FL_GODMODE|FL_NOTARGET`. El comentario del
//                                 motor es literal: «don't attack player in
//                                 background mode».
//   server/sv_main.c:111          `sv_background_freeze`, por omisión **1**:
//   server/sv_client.c:3290       en un mapa de fondo el jugador no se mueve.
//   server/sv_client.c:1507       y no se puede pausar.
//
// ── En qué nos separamos, y se declara ───────────────────────────────────
//
// Dos cosas, y ninguna es un descuido:
//
// 1. **Master Sword Rebirth NO usa mapas de fondo.** No trae la lista que
//    `UI_LoadBackgroundMapList` busca (`BaseMenu.cpp:980`), así que
//    `UI_StartBackGroundMap` se vuelve en la primera línea —la lista está
//    vacía, `BaseMenu.cpp:551`— y su menú cae a la pintura: las doce losetas
//    TGA de `resource/background/` que coloca `resource/BackgroundLayout.txt`
//    sobre una rejilla de 800x600. Eso ya se hornea en `build/msr/menu/`.
//
//    O sea que **tener fondo vivo es decisión nuestra**, no un port. Lo que
//    se porta es el mecanismo y lo que apaga; usarlo es nuestro.
//
// 2. **Nosotros vamos más lejos que `sv.background`.** El motor deja las
//    entidades vivas y se limita a que no ataquen al jugador y a congelarlo.
//    Aquí no se montan: ni NPC, ni cuerpo de jugador, ni sesión. Se puede
//    porque **en nuestro menú no hay jugador a quien proteger** — no hay
//    nadie a quien no atacar ni a quien congelar—, y porque 33 hostiles
//    buscando camino detrás de una pantalla de menú cuestan fotogramas de
//    verdad. La diferencia se mide, no se supone: ver `LO_QUE_NO_SE_MONTA`.
//
// Esto no importa nada de Three ni toca el DOM, como el resto de `src/play/`.

// ── DÓNDE ESTÁN LOS NOMBRES, Y POR QUÉ NO AQUÍ ───────────────────────────
//
// `FONDOS_DEL_MENU` se reexporta desde `src/play/mapa.js` y no se escribe en
// este archivo. La regla del 47 prohíbe el nombre de un mapa suelto en
// `src/play/` fuera de un comentario, y `mapa.js` es la única excepción
// (`test/juego_mapa47.test.mjs`). Aquí vive la POLÍTICA —qué se apaga en un
// mapa de fondo y contra qué línea del motor—; allí, los nombres.
import { esNombreDeMapa, FONDOS_DEL_MENU } from "./mapa.js";

export { FONDOS_DEL_MENU };

/**
 * LO QUE NO SE MONTA EN UN MAPA DE FONDO, y por qué cada cosa.
 *
 * Está aquí, en una tabla y no en un `if` perdido, por la misma razón que las
 * tablas de ajustes: **una cosa apagada tiene que decir por qué**, o dentro de
 * un año nadie sabe si falta por decisión o por olvido. Es la vacuna del
 * apartado 4 de CLAUDE.md aplicada a lo que NO se hace.
 *
 * `masQueElMotor` marca las que van más lejos que `sv.background`. Las que no
 * lo llevan son lo que el motor ya apaga, con su línea.
 */
export const LO_QUE_NO_SE_MONTA = Object.freeze([
  Object.freeze({
    que: "los NPC",
    porQue: "no hay jugador a quien cazar, y 33 hostiles buscando camino detrás " +
      "de un menú cuestan fotogramas. El motor los deja vivos y sólo marca al " +
      "jugador con FL_NOTARGET (sv_client.c:1422-1423); sin jugador esa marca " +
      "no protege a nadie, así que aquí no se montan",
    masQueElMotor: true,
  }),
  Object.freeze({
    que: "el cuerpo del jugador",
    porQue: "en un mapa de fondo el jugador está congelado por omisión " +
      "(sv_background_freeze = 1, sv_main.c:111 y sv_client.c:3290). Un cuerpo " +
      "que no se puede mover y al que no se puede atacar no hace nada que se vea",
    masQueElMotor: true,
  }),
  Object.freeze({
    que: "la sesión",
    porQue: "una partida empieza al pulsar «Start». Antes salía `sesion: true` " +
      "con el menú todavía delante y sin personaje elegido",
    masQueElMotor: true,
  }),
  Object.freeze({
    que: "la pausa",
    porQue: "el motor la desactiva en modo fondo (sv_client.c:1507), y aquí " +
      "tampoco hay nada que pausar",
    masQueElMotor: false,
  }),
]);

/** Lo que sí se monta: sin esto, «no se monta nada» sería un mapa negro. */
export const LO_QUE_SI_SE_MONTA = Object.freeze([
  "la geometría del mapa y sus texturas",
  "el mapa de luz horneado",
  "la cámara del menú y su recorrido",
]);

/**
 * El mapa que toca ver detrás del menú, o `null` si no hay ninguno.
 *
 * Copia el orden del motor: si la lista está vacía **no hay fondo vivo** y
 * quien llame enseña la pintura (`BaseMenu.cpp:551`, `IsEmpty()` es lo primero
 * que se mira); si hay varios, uno al azar (`BaseMenu.cpp:571`).
 *
 * `azar` se inyecta para poder medir el sorteo sin depender de la suerte. Un
 * nombre que no sea de mapa no se devuelve: la misma puerta que `?map=`.
 *
 * @param {string[]} fondos  la lista, por si se quiere preguntar por otra.
 * @param {() => number} azar  un número en [0, 1), como `Math.random`.
 * @returns {string|null}
 */
export function fondoDelMenu(fondos = FONDOS_DEL_MENU, azar = Math.random) {
  const validos = (fondos ?? []).filter((m) => esNombreDeMapa(m));
  if (!validos.length) return null;
  const i = Math.floor(azar() * validos.length);
  // Un `azar()` que devuelva 1 —o 1.0 por redondeo— se saldría del final.
  return validos[Math.min(Math.max(i, 0), validos.length - 1)];
}

/** ¿Hay fondo vivo, o toca la pintura del mod? */
export function hayFondoVivo(fondos = FONDOS_DEL_MENU) {
  return fondoDelMenu(fondos, () => 0) !== null;
}

/**
 * QUÉ SE DIBUJA DETRÁS DEL MENÚ PRINCIPAL. Una decisión, no un accidente.
 *
 * Lo de arriba gobierna los mapas de fondo, que es lo que hace el motor. Esto
 * gobierna la otra rama, la que el proyecto se inventó en el 52: una escena
 * **nuestra y procedural** —la torre de `src/render/torre.js`— en vez de un
 * mapa o de la pintura.
 *
 * Y está en una tabla con su razón escrita, y no en un `if` dentro de
 * `main.js`, por lo mismo que `LO_QUE_NO_SE_MONTA`: **una cosa apagada tiene
 * que decir por qué**, o dentro de un año nadie sabe si falta por decisión o
 * por olvido. Es la regla de `src/play/ajustes.js` aplicada aquí.
 *
 * ── Por qué vale «pintura» hoy (72) ────────────────────────────────────────
 *
 * Porque la escena de la torre, después del 52 al 58 y de tres pasadas más de
 * materiales, paisaje y detalles, **no se ve bien**, y el usuario lo decidió
 * mirándola. El diagnóstico, por si alguien la retoma, es que **el problema no
 * es Three.js ni los materiales procedurales**:
 *
 *   - la fachada iluminada vive entre RGB 20 y 32, o sea en el 12 % inferior
 *     del rango, y una silueta necesita fondo claro detrás: el contraluz del
 *     58 se tomó al pie de la letra y queda una losa negra sobre gris;
 *   - la forma es un prisma recto, sin talud, contrafuertes ni saeteras, y a
 *     esa distancia una torre es casi toda silueta;
 *   - y el encuadre está invertido respecto a las dos pinturas de referencia,
 *     donde la torre es pequeña y lejana y el cuadro trata de lo que hay
 *     alrededor.
 *
 * Eso es dirección artística, y **ninguna sonda puede emitir ese juicio**: las
 * pruebas del menú dicen que el encuadre es el pedido y que la fisura tiene 39
 * metros, y siguen verdes sobre una imagen fea. Por eso esto es una constante
 * que firma una persona y no un control que se mida.
 *
 * **La escena NO se borra.** Sigue entera, con sus pruebas y sus cinco sondas,
 * y se monta bajo demanda desde `window.probe.miradores`. Volver a encenderla
 * es cambiar esta palabra.
 */
export const ESCENA_DEL_MENU = Object.freeze({
  /** `"pintura"` o `"torre"`. */
  cual: "pintura",
  porQue:
    "la pintura de Anders Finér es el arte REAL del menú de Master Sword " +
    "(resource/background/*.tga, y el propio logotipo lo firma: " +
    "«MASTER SWORD / ART BY: ANDERS FINÉR»). La torre procedural del 52..58 " +
    "es una interpretación nuestra, y a día de hoy se ve peor que el original " +
    "que sustituye. Entre un hecho citable y una invención que además no " +
    "convence, se queda el hecho. Ver doc/ESCRITORIO_72.md",
});

/** ¿Toca montar la escena de la torre al arrancar? */
export function conEscenaDelMenu(escena = ESCENA_DEL_MENU) {
  return escena.cual === "torre";
}

/**
 * CÓMO SE ENCUADRA LA PINTURA DEL MENÚ, según el motor.
 *
 * La pintura de Finér es de **800×600, o sea 4:3**, y las pantallas de hoy no.
 * En una ventana 16:9 se pierde el 25 % del alto, repartido arriba y abajo —y
 * arriba es donde está la cima de la torre—, así que la pregunta obvia al verlo
 * es si eso es un fallo del port. **No lo es**, y esto está aquí para que nadie
 * lo «arregle» dentro de un año:
 *
 *   mainui/BaseMenu.cpp:1149              `ui_background_stretch`, por omisión "0"
 *   mainui/controls/BackgroundBitmap.cpp:186-195
 *                                         con el estirado apagado, UNA sola
 *                                         escala para los dos ejes, la del lado
 *                                         que desborda
 *   mainui/controls/BackgroundBitmap.cpp:199-207
 *                                         y lo que sobra se centra
 *
 * Eso es, exactamente, el `center/cover` de CSS. Con 800×600 en 1600×900 el
 * motor saca escala 2 —imagen de 1600×1200 sobre 900 de alto— y un desfase de
 * −150, o sea 150 recortados arriba y 150 abajo. **El recorte es del juego.**
 *
 * `estirar` porta el cvar: a `true` deforma la imagen para llenar, que es lo
 * que el jugador puede pedir y no lo que sale de fábrica.
 *
 * @returns {{escalaX: number, escalaY: number, desfaseX: number, desfaseY: number}}
 */
export function encuadreDelFondo({
  ancho, alto, anchoPantalla, altoPantalla, estirar = false,
} = {}) {
  if (!(ancho > 0 && alto > 0 && anchoPantalla > 0 && altoPantalla > 0)) {
    throw new Error("encuadreDelFondo: hacen falta las cuatro medidas, y positivas");
  }
  if (estirar) {
    // `BackgroundBitmap.cpp:178-182`, y sin centrar nada: llena y deforma.
    return {
      escalaX: anchoPantalla / ancho, escalaY: altoPantalla / alto,
      desfaseX: 0, desfaseY: 0,
    };
  }
  // `:186-195`. La comparación del motor es con productos cruzados, sin
  // divisiones, y se copia así para que no haya que fiarse de un redondeo.
  const escala = anchoPantalla * alto > altoPantalla * ancho
    ? anchoPantalla / ancho
    : altoPantalla / alto;

  // `:199-207`, que es un `else if`: sólo se centra el eje que desborda, y con
  // una escala única nunca desbordan los dos.
  let desfaseX = 0, desfaseY = 0;
  if (ancho * escala > anchoPantalla) desfaseX = (anchoPantalla - ancho * escala) / 2;
  else if (alto * escala > altoPantalla) desfaseY = (altoPantalla - alto * escala) / 2;

  return { escalaX: escala, escalaY: escala, desfaseX, desfaseY };
}
