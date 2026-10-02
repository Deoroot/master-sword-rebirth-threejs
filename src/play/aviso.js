// LA VENTANA DE AVISO: el recuadro que sale ARRIBA A LA IZQUIERDA y se va solo.
//
// Master Sword tiene **dos** sitios donde te escribe un título y un texto, y
// no son el mismo que la consola de sucesos. Lo dice la cabecera del jugador,
// con esas palabras:
//
//     void SendHUDMsg(const char* Title, const char* Text);  //HUD message - top left
//                                                          player.h:554
//
// Y se separan así, que es lo que este puerto tenía mezclado:
//
//   `SendInfoMsg`  → `SendEventMsg` → `PrintEvent` → la CONSOLA DE SUCESOS,
//                    abajo a la derecha. `EVENTCON_X = XRES(640) -
//                    EVENTCON_SIZE_X - XRES(20)`, `EVENTCON_Y = YRES(480) -
//                    YRES(10)` (vgui_hud.cpp:144-146). Es `src/play/hud.js`.
//   `SendHUDMsg`   → `HUD_ShowInfoWin` → `AddInfoWin` → la VENTANA DE AVISO,
//                    arriba a la izquierda, título rojo, ocho segundos.
//                    playershared.cpp:1115-1126, vgui_hud.cpp:265-274.
//   `SendHelpMsg`  → `HUD_ShowHelpWin` → `AddHelpWin` → la misma ventana pero
//                    arriba a la DERECHA y con el título verde, y sólo si
//                    `ms_help`. vgui_hud.cpp:277-300.
//
// Las tres tienen su propio sitio en la pantalla a propósito: el comentario del
// mod en `AddHelpWin` es «MAR2008a - moving helptip window not to overlap
// eventhud». O sea que meterlas todas en la consola no es una simplificación,
// es deshacer un arreglo de 2008.
//
// ── Lo que se estaba viendo mal, y por qué nadie lo notó ──────────────────
//
// Dos cosas iban a la consola de sucesos y en el juego son ventanas:
//
//   la presentación del mapa   `infomsg ent_me G_MAP_NAME G_MAP_DESC` y sus dos
//                              hermanos. `infomsg` es `ScriptCmd_InfoMessage`,
//                              y su propio comentario lo dice: «Creates a
//                              pop-up with red title text on the player's HUD»
//                              (scriptcmds.cpp:4055-4099). Acaba en
//                              `SendHUDMsg`, no en `SendInfoMsg`.
//   el anuncio de subir        `infomsg all` con «<nombre> has gained a level!»
//                              → `SendHUDMsgAll` → un `SendHUDMsg` por jugador
//                              (svglobals.cpp:346-351).
//
// No se notó porque los dos **llegan como título y texto**, y la consola acepta
// cualquier cadena: se juntaban con un guion («WARNING — This area maybe too
// difficult…») y se leían igual de bien. Un mensaje en el sitio equivocado no
// da ningún error; sólo se ve jugando, que es como salió.
//
// Aquí está la REGLA —los tiempos, la mezcla y dónde cae cada ventana—. El DOM
// está en `src/juego/mensajes.js`, que es donde viven las otras capas que se
// escriben encima de la vista.

import { XRES, YRES } from "./hud.js";

/**
 * Los números del recuadro, los siete que hay. `vgui_infowin.h:13-27`.
 *
 * `fondo` es la TRANSPARENCIA de VGUI y no la opacidad: 0 es opaco y 255 es
 * invisible, que es al revés que en CSS. 128 en reposo, o sea medio tapado.
 */
export const AVISO = Object.freeze({
  /** `INFOWIN_DURATION`, en segundos. */
  duracion: 8.0,
  /** `FADEIN_TIME`. */
  entrada: 1.0,
  /** `FADEOUT_TIME`. */
  salida: 1.0,
  /** `INFOWIN_BKTRANS`, transparencia de VGUI en reposo. */
  fondo: 128,
  /** `INFOWIN_DISPLAY_X` / `INFOWIN_DISPLAY_Y`, en la pantalla de 640×480. */
  x: 20,
  y: 50,
  /** `INFOWIN_DISPLAY_SPACER_Y`: lo que se separan dos ventanas apiladas. */
  espaciado: 4,
  /** `INFOWIN_SPACER_BORDER`, `INFOWIN_SPACER_BELOWTITLE`, `INFOWIN_BORDER_SIZE`. */
  margen: 3,
  bajoElTitulo: 3,
  borde: 2,
});

/**
 * Y los de la de ayuda, que son otros. `vgui_hud.cpp:142-143, 291-298`.
 *
 * La `x` no es la que declara `INFOWIN_HELP_DISPLAY_X`: el constructor la usa y
 * dos líneas después `setPos` la pisa con `XRES(640) - ancho - XRES(60)`, o sea
 * **pegada al borde derecho** y no a 260 del izquierdo. Se porta la segunda,
 * que es la que manda, y se deja dicho que la primera existe y no sirve.
 *
 * La `y` tampoco es `INFOWIN_HELP_DISPLAY_Y` (300): las dos veces que se pone
 * es `YRES(10)`, con el comentario de por qué. La constante de 300 está muerta.
 */
export const AYUDA = Object.freeze({
  /** Lo que se deja libre a la DERECHA del recuadro. `XRES(60)`. */
  desdeLaDerecha: 60,
  y: 10,
  /** Título verde en vez de rojo. `NewInfoWin.Title->setFgColor(0, 200, 20, 0)`. */
  color: Object.freeze([0, 200, 20]),
});

/** El rojo del título. `Title->setFgColor(225, 0, 0, 0)`, y son 225, no 255. */
export const COLOR_TITULO = Object.freeze([225, 0, 0]);

/** El gris del cuerpo. `Text->setFgColor(192, 192, 192, 0)`. */
export const COLOR_TEXTO = Object.freeze([192, 192, 192]);

/** El fondo del texto, opaco. `Text->setBgColor(0, 0, 0, 255)`. */
export const COLOR_FONDO = Object.freeze([0, 0, 0]);

/**
 * Cuánto dura una ventana de ayuda: los ocho de siempre MÁS un segundo por cada
 * sesenta caracteres.
 *
 *     NewInfoWin.m_Duration = INFOWIN_DURATION + (strlen(Text) / 60.0f);
 *                                                      vgui_hud.cpp:298
 *
 * Es `strlen` del texto y no del título, y se mide DESPUÉS de cambiar las `|`
 * por saltos de línea — que no cambia el largo, porque es carácter por carácter.
 */
export function duracionDeAyuda(texto) {
  return AVISO.duracion + String(texto ?? "").length / 60;
}

/**
 * Las `|` de una ayuda son saltos de línea. `vgui_hud.cpp:281-287`.
 *
 * El mod lo hace **escribiendo sobre la cadena que le han pasado**
 * (`((char*)Text)[i] = '\n'`), que es feo y aquí no hace falta: el efecto es el
 * mismo y el nuestro no le estropea el texto a quien lo mandó.
 */
export function conSaltos(texto) {
  return String(texto ?? "").replace(/\|/g, "\n");
}

/**
 * `fadeamt`: 0 al nacer, 1 mientras se está quieta, 0 al morir.
 * `vgui_infowin.h:93-98`.
 *
 * Los dos `if` son independientes y el segundo pisa al primero. Con la duración
 * por omisión no se cruzan, pero **una ayuda no puede durar menos de dos
 * segundos** sin que se crucen — y como su duración es 8 más algo, nunca pasa.
 * Se deja el orden del motor por si algún día pasa.
 */
export function mezcla(t, duracion = AVISO.duracion) {
  const e = Math.max(0, Number(t) || 0);
  let f = e <= AVISO.entrada ? Math.min(e, AVISO.entrada) / AVISO.entrada : 1;
  if (e > duracion - AVISO.salida) {
    f = 1 - Math.min(e - (duracion - AVISO.salida), AVISO.salida) / AVISO.salida;
  }
  return f;
}

/**
 * La transparencia de VGUI de las letras: `int alpha = 255 - (255 * fadeamt)`.
 *
 * Se devuelve el número DEL MOTOR —0 opaco, 255 invisible— y con su truncado a
 * entero, no la opacidad de CSS. Quien dibuje que lo dé la vuelta: así la sonda
 * puede comparar con el mod sin traducir, y el redondeo es el mismo.
 */
export function alfaDeLaLetra(t, duracion = AVISO.duracion) {
  return Math.trunc(255 - 255 * mezcla(t, duracion));
}

/**
 * Y la del fondo: `255 - ((255 - INFOWIN_BKTRANS) * fadeamt)`.
 *
 * O sea que el fondo **nunca llega a opaco**: se queda en 128, medio velo. El
 * recuadro se lee sobre el mundo, no lo tapa.
 */
export function alfaDelFondo(t, duracion = AVISO.duracion) {
  return Math.trunc(255 - (255 - AVISO.fondo) * mezcla(t, duracion));
}

/** `gpGlobals->time > m_TimeDisplayed + m_Duration`, vgui_hud.cpp:368. */
export function seVa(t, duracion = AVISO.duracion) {
  return (Number(t) || 0) > duracion;
}

/**
 * DÓNDE CAE LA VENTANA `indice` DE LA PILA, en píxeles de la pantalla de 640.
 *
 * `altos` son los altos de todas, en orden, porque el sitio de una depende del
 * de las de encima. `tDeLaPrimera` es el tiempo que lleva la de arriba del
 * todo — se usa para que las de abajo empiecen a subir ANTES de que la primera
 * termine de irse, que es el detalle que hace que la pila no dé un salto:
 *
 *     if (idx > 0) {
 *       CInfoWindow &FirstWin = *Windows[0];
 *       float elapsedtime = gpGlobals->time - FirstWin.m_TimeDisplayed;
 *       if (elapsedtime > m_Duration - FADEOUT_TIME) {
 *         float moveamt = V_min(elapsedtime - (m_Duration - FADEOUT_TIME), FADEOUT_TIME) / FADEOUT_TIME;
 *         yPos -= (FirstWin.getTall() + INFOWIN_DISPLAY_SPACER_Y) * moveamt;
 *       }
 *     }
 *                                                      vgui_infowin.h:111-126
 *
 * DOS ERRATAS DEL MOTOR, portadas las dos:
 *
 * 1. El `m_Duration` de ese `if` es **el mío, no el de la primera**. Con avisos
 *    da igual —los ocho segundos son de todos—, pero las ayudas duran cada una
 *    lo que mide su texto, así que una ayuda larga debajo de una corta empieza
 *    a subir tarde y pega el salto que el arreglo quería evitar.
 * 2. Sólo se mira la PRIMERA. Si la que se está yendo es la segunda de tres, la
 *    tercera no se mueve hasta que le toque a la primera.
 *
 * `arriba` y `espaciado` se pasan **en las mismas unidades que `altos`**. El
 * motor trabaja siempre en píxeles de pantalla —`getTall()` los devuelve así—
 * y son sus valores por omisión los que están en la pantalla de 640, para que
 * quien no escale obtenga los números del mod tal cual. Quien dibuje de verdad
 * mide los altos con el navegador y pasa los dos ya escalados: mezclar las dos
 * reglas deja una pila que se separa más cuanto más grande es la ventana.
 */
export function yDeLaVentana(indice, altos = [], tDeLaPrimera = 0, {
  arriba = AVISO.y, duracion = AVISO.duracion, espaciado = AVISO.espaciado,
} = {}) {
  let y = arriba;
  for (let i = 0; i < indice; i++) y += (altos[i] ?? 0) + espaciado;
  if (indice > 0) {
    const e = Number(tDeLaPrimera) || 0;
    if (e > duracion - AVISO.salida) {
      const cuanto = Math.min(e - (duracion - AVISO.salida), AVISO.salida) / AVISO.salida;
      y -= ((altos[0] ?? 0) + espaciado) * cuanto;
    }
  }
  return y;
}

/**
 * La esquina de la que cuelga cada clase de ventana, ya en píxeles de pantalla.
 *
 * El aviso va a la izquierda y no depende de su ancho. La ayuda va a la derecha
 * y sí: se coloca DESPUÉS de medirse (`Resize()` y luego `setPos`), así que el
 * ancho tiene que estar puesto antes de preguntar.
 */
export function anclaDelAviso(ancho, alto) {
  return { x: XRES(AVISO.x, ancho), y: YRES(AVISO.y, alto) };
}

export function anclaDeLaAyuda(ancho, alto, anchoDeLaVentana) {
  return {
    x: XRES(640, ancho) - (Number(anchoDeLaVentana) || 0) - XRES(AYUDA.desdeLaDerecha, ancho),
    y: YRES(AYUDA.y, alto),
  };
}

/**
 * LA PILA DE VENTANAS, sin DOM: quién está viva, cuánto lleva y a qué altura.
 *
 * Es `std::vector<CInfoWindow*>` con su `UpdateInfoWindows`, que recorre **al
 * revés** para poder borrar mientras recorre (vgui_hud.cpp:358-371). Aquí se
 * recorre hacia delante y se filtra al final, que en JavaScript es lo mismo y
 * no hace falta explicarlo con un comentario.
 *
 * El alto de cada una lo pone quien dibuja, con `medir`: en Node se le da una
 * regla falsa y en el navegador, el `offsetHeight` del recuadro. Sin alto no se
 * puede apilar, y el motor tampoco podría.
 */
export class PilaDeAvisos {
  /** @param {"aviso"|"ayuda"} clase */
  constructor(clase = "aviso") {
    this.clase = clase;
    this.ventanas = [];
  }

  /** `AddInfoWin` / `AddHelpWin`. Devuelve la ventana, que es lo que se dibuja. */
  poner(titulo, texto, { alto = 0 } = {}) {
    const esAyuda = this.clase === "ayuda";
    const cuerpo = esAyuda ? conSaltos(texto) : String(texto ?? "");
    const v = {
      titulo: String(titulo ?? ""),
      texto: cuerpo,
      t: 0,
      duracion: esAyuda ? duracionDeAyuda(cuerpo) : AVISO.duracion,
      color: esAyuda ? [...AYUDA.color] : [...COLOR_TITULO],
      alto,
      y: esAyuda ? AYUDA.y : AVISO.y,
    };
    this.ventanas.push(v);
    return v;
  }

  /**
   * Un tic. Devuelve las que se han ido, para que quien dibuja las quite.
   *
   * El orden importa y es el del motor: **primero se recoloca y luego se mira
   * si ha caducado**. Una ventana en su último fotograma se dibuja una vez más
   * con la mezcla a cero, y por eso no desaparece de golpe.
   */
  paso(dt, escala = {}) {
    const d = Number(dt) > 0 ? Number(dt) : 0;
    // Sin escala se apila en la pantalla de 640, que son los números del mod.
    // Con ella —la que pasa el navegador— en píxeles de verdad. Ver
    // `yDeLaVentana`: lo que no se puede es mezclar las dos.
    const arriba = escala.arriba ?? (this.clase === "ayuda" ? AYUDA.y : AVISO.y);
    const espaciado = escala.espaciado ?? AVISO.espaciado;
    const altos = this.ventanas.map((v) => v.alto ?? 0);
    const tDeLaPrimera = this.ventanas[0]?.t ?? 0;
    for (let i = 0; i < this.ventanas.length; i++) {
      const v = this.ventanas[i];
      v.t += d;
      v.mezcla = mezcla(v.t, v.duracion);
      v.alfa = alfaDeLaLetra(v.t, v.duracion);
      v.alfaFondo = alfaDelFondo(v.t, v.duracion);
      v.y = yDeLaVentana(i, altos, tDeLaPrimera, { arriba, espaciado, duracion: v.duracion });
    }
    const idas = this.ventanas.filter((v) => seVa(v.t, v.duracion));
    if (idas.length) this.ventanas = this.ventanas.filter((v) => !seVa(v.t, v.duracion));
    return idas;
  }

  /** `Initialize()`: al empezar un nivel se van todas. vgui_hud.cpp:384-388. */
  limpiar() {
    const idas = this.ventanas;
    this.ventanas = [];
    return idas;
  }
}
