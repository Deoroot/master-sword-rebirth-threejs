// EL KIT DE VGUI: `Panel`, `CTransparentPanel`, `LineBorder`, `MSLabel`, `MSButton`.
//
// Es `vgui_mscontrols.h` del mod, que es un archivo y aquí también. Con esto
// pintado, los cuatro paneles del personaje son composición y no CSS nuevo —que
// es justo lo que salió mal la primera vez: cada pantalla se inventó su rejilla,
// sus bordes y su espaciado, y el resultado no combina con el HUD ni con el menú,
// que sí son portes.
//
// ── Las medidas van en 640×480 y se convierten al colocar ──────────────────
//
// El mod escribe las medidas ya convertidas:
//
//     #define MAINWIN_SIZE_X XRES(120)
//     m_pMainPanel = new CTransparentPanel(128, MAINWIN_X, MAINWIN_Y, ...);
//                                           vgui_menubase.cpp:88-104
//
//     #define XRES(x) ((int)(float(x) * ((float)ScreenWidth / 640.0f) + 0.5f))
//                                           cl_util.h:108-109
//
// O sea: la pantalla de referencia es 640×480 y todo se multiplica al construir.
// Aquí se guarda el número **sin convertir** y la conversión se hace en
// `colocar()`, por una razón práctica: una ventana de navegador cambia de tamaño
// y el motor no —el motor reconstruye el viewport entero al cambiar de
// resolución—. Guardando las medidas de referencia, estirar la ventana recoloca
// los paneles en su sitio en vez de dejarlos donde estaban.
//
// `XRES`/`YRES` no se reescriben: están en `src/play/hud.js` desde el
// experimento 24, con su cita, y las usa el HUD.
//
// ── El alfa está al revés, y es lo que da el aspecto ───────────────────────
//
// `COLOR(r,g,b,a)` de VGUI usa el cuarto número como TRANSPARENCIA: 255 es
// invisible y 0 es opaco. `setBgColor(0,0,0,255)` no es un panel negro, es un
// panel que no está. Lo da la vuelta `deVgui()` de `src/juego/paleta.js`, que ya
// existía para esto y lleva la explicación entera.

import { XRES, YRES } from "../play/hud.js";
import { deVgui } from "../juego/paleta.js";

/**
 * Las nueve alineaciones de `vgui::Label`, en su orden.
 *
 *     a_northwest=0, a_north, a_northeast, a_west, a_center, a_east,
 *     a_southwest, a_south, a_southeast              vgui_mscontrols.h:118-129
 *
 * El orden importa porque el mod las pasa como número —`Alignment(Alignment)`—
 * y porque `MSButton` arranca en `a_east`, que es la quinta.
 */
export const ALINEACION = [
  "northwest", "north", "northeast",
  "west", "center", "east",
  "southwest", "south", "southeast",
];

/** De una alineación de VGUI a las dos propiedades de flexbox que la hacen. */
export function flexDe(a) {
  const n = typeof a === "number" ? (ALINEACION[a] ?? "west") : a;
  const fila = n.includes("west") ? "flex-start" : n.includes("east") ? "flex-end" : "center";
  const col = n.startsWith("north") ? "flex-start" : n.startsWith("south") ? "flex-end" : "center";
  return { justify: fila, align: col, nombre: n };
}

const el = (tag, clase = "") => {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  return n;
};

export const CSS = `
.vg { position: absolute; box-sizing: border-box; }
.vg-panel { pointer-events: auto; }
/* Un panel sin borde no dibuja borde. El motor tampoco: \`_border\` es nulo y
   \`paintBackground\` sólo rellena. */
.vg-etiqueta { display: flex; white-space: pre; overflow: hidden; }
.vg-boton { display: flex; border: 0; background: transparent; padding: 0;
  font: inherit; cursor: pointer; text-align: inherit; }
.vg-boton[data-sirve="no"] { cursor: default; }
/* El foco del navegador se apaga a mano: estos paneles se manejan con las teclas
   del juego y un anillo azul de Chrome encima de un panel de Master Sword es la
   señal más clara de que el panel no es del juego. Lo que marca el botón elegido
   es el color armado, que es lo que hace el original. */
.vg-boton:focus { outline: none; }
.vg[hidden] { display: none !important; }
`;

/**
 * `LineBorder`: un marco de N píxeles de un color.
 *
 *     m_pMainPanel->setBorder(m_Border = new LineBorder(XRES(2), Color(...)));
 *                                           vgui_menubase.cpp:99
 *
 * El grosor también pasa por `XRES`, así que a 1920 son seis píxeles y no dos.
 */
export class LineBorder {
  constructor(grosor, color) {
    this.grosor = grosor;              // en unidades de 640
    this.color = color;                // [r,g,b,a] en la convención de VGUI
  }
  get css() { return deVgui(...this.color); }
}

/**
 * `Panel`, y con transparencia `CTransparentPanel`.
 *
 *     virtual void paintBackground() {
 *       if (m_iTransparency) {
 *         drawSetColor(0, 0, 0, m_iTransparency);
 *         drawFilledRect(...);
 *       }
 *     }                              vgui_teamfortressviewport.h:1049-1064
 *
 * `m_iTransparency` VA TAMBIÉN AL REVÉS, y encima con una vuelta de tuerca que
 * es la que da el aspecto: **0 y 255 son los dos invisibles**, por motivos
 * distintos.
 *
 *   - `if (m_iTransparency)` — con 0 no se dibuja NADA. No es negro opaco: es
 *     que no hay fondo. El separador del título es `CTransparentPanel(0, ...)`
 *     con un borde verde, o sea una línea verde y nada detrás.
 *   - con 255 sí se dibuja, pero `drawSetColor(0,0,0,255)` en VGUI es negro
 *     completamente transparente, que también es nada. Por eso el panel de
 *     pantalla completa del menú es `CMenuPanel(255, ...)` y no tapa el juego.
 *   - 128 es el medio negro de la ventana del menú.
 *
 * Y se comprueba solo mirando el desvanecido:
 *
 *     m_pMainPanel->m_iTransparency = (InveserdFade / 2 + 128);
 *                                     vgui_menubase.cpp:207
 *
 * `InveserdFade` va de 255 a 0 mientras el menú entra, o sea que la
 * transparencia va de 255 a 128. Con el alfa leído al derecho eso sería un panel
 * que empieza NEGRO MACIZO y se aclara —un fogonazo negro al abrir el menú—; con
 * el alfa al revés es lo que tiene que ser: **aparece desde la nada**. Ésa es la
 * prueba de que la convención es ésta, y no hace falta abrir el juego.
 */
/**
 * De `m_iTransparency` a la opacidad de CSS del fondo.
 *
 * Las dos reglas de arriba en una línea: con 0 no se dibuja, y el resto va al
 * revés. Vale la pena que sea una función con nombre y no una expresión metida
 * en el `style`, porque es lo que decide si un panel se ve o no.
 */
export function opacidadDeFondo(t) {
  if (!t) return 0;                    // `if (m_iTransparency)`: no se dibuja
  return (255 - t) / 255;              // y 255 es invisible, 0 es opaco
}

export class Panel {
  constructor({ x = 0, y = 0, w = 0, h = 0, transparencia = 0, clase = "" } = {}) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.transparencia = transparencia;
    this.borde = null;
    this.hijos = [];
    this.nodo = el("div", `vg vg-panel ${clase}`.trim());
    this.visible = true;
  }

  /** `setBorder()`. Devuelve el borde, como el mod, para poder guardarlo. */
  ponBorde(b) { this.borde = b; return b; }

  /** `setParent()`. */
  anadir(hijo) { this.hijos.push(hijo); this.nodo.appendChild(hijo.nodo); return hijo; }

  /** `setVisible()`. */
  ver(si) { this.visible = si; this.nodo.hidden = !si; return this; }

  /** `setPos()` / `setSize()`, en unidades de 640×480. */
  pon({ x, y, w, h }) {
    if (x !== undefined) this.x = x;
    if (y !== undefined) this.y = y;
    if (w !== undefined) this.w = w;
    if (h !== undefined) this.h = h;
    return this;
  }

  /** Pasa las medidas de referencia a píxeles de pantalla y las escribe. */
  colocar(ancho, alto, esquema) {
    const s = this.nodo.style;
    s.left = `${XRES(this.x, ancho)}px`;
    s.top = `${YRES(this.y, alto)}px`;
    if (this.w) s.width = `${XRES(this.w, ancho)}px`;
    if (this.h) s.height = `${YRES(this.h, alto)}px`;
    s.background = opacidadDeFondo(this.transparencia) === 0
      ? ""
      : `rgba(0, 0, 0, ${opacidadDeFondo(this.transparencia).toFixed(3)})`;
    if (this.borde) {
      s.border = `${Math.max(1, XRES(this.borde.grosor, ancho))}px solid ${this.borde.css}`;
    } else {
      s.border = "";
    }
    for (const h of this.hijos) h.colocar(ancho, alto, esquema);
    return this;
  }
}

/**
 * `MSLabel`: texto con una de las nueve alineaciones.
 *
 *     setFgColor(255, 255, 255, 0);      // 0 = OPACO, ver arriba
 *     setBgColor(0, 0, 0, 255);          // 255 = invisible
 *     setContentAlignment(Alignment(Alignment));
 *     setFont(g_FontSml);                vgui_mscontrols.h:138-148
 */
export class MSLabel extends Panel {
  constructor({ texto = "", x = 0, y = 0, w = 0, h = 0, alineacion = "west",
                esquema = "Briefing Text", color = null, clase = "" } = {}) {
    super({ x, y, w, h, clase: `vg-etiqueta ${clase}`.trim() });
    this.alineacion = alineacion;
    this.esquemaNombre = esquema;
    this.color = color;                  // [r,g,b,a] de VGUI, o null = el del esquema
    this.texto = texto;
  }

  /** `setText()`. */
  ponTexto(t) { this.texto = t ?? ""; this.nodo.textContent = this.texto; return this; }

  /** `setFont()`, por nombre de esquema y no por objeto de fuente. */
  ponEsquema(n) { this.esquemaNombre = n; return this; }

  colocar(ancho, alto, esquema) {
    super.colocar(ancho, alto, esquema);
    const s = this.nodo.style;
    const f = flexDe(this.alineacion);
    s.justifyContent = f.justify;
    s.alignItems = f.align;
    s.font = esquema.fuenteCss(this.esquemaNombre);
    s.lineHeight = "1";
    s.color = this.color ? deVgui(...this.color) : esquema.color(this.esquemaNombre, "fg");
    if (this.nodo.textContent !== this.texto) this.nodo.textContent = this.texto;
    return this;
  }

  /**
   * `getTextSize()`, que el mod usa para centrar el título y para ajustar los
   * botones al texto. Mide de verdad, con el `canvas` 2D: una estimación de
   * «ancho × 0,5 por letra» descentra los títulos y eso se ve.
   */
  medirTexto(esquema) {
    return medirTexto(this.texto, esquema.fuenteCss(this.esquemaNombre));
  }
}

/** El `canvas` con el que se mide el texto. Uno para todo el proceso. */
let _pincel = null;
export function medirTexto(texto, fuenteCss) {
  if (!_pincel) {
    // En Node no hay `document`: se devuelve una medida aproximada para que las
    // pruebas de la disposición puedan correr sin navegador. Lo que se comprueba
    // ahí es el centrado, no el tipo de letra.
    if (typeof document === "undefined") return { ancho: texto.length * 7, alto: 14 };
    _pincel = document.createElement("canvas").getContext("2d");
  }
  _pincel.font = fuenteCss;
  const m = _pincel.measureText(texto);
  const alto = (m.actualBoundingBoxAscent ?? 0) + (m.actualBoundingBoxDescent ?? 0);
  return { ancho: m.width, alto: alto || parseInt(fuenteCss, 10) || 14 };
}

/**
 * `MSButton`: un `CommandButton` con tres colores y sin adorno de botón.
 *
 *     void paint() {
 *       if (isEnabled()) setFgColor(isArmed() ? m_ArmedColor : m_UnArmedColor);
 *       else             setFgColor(m_DisabledColor);
 *       Button::paint();
 *     }
 *     void paintBackground() { Label::paintBackground(); }   // NO Button::
 *                                           vgui_mscontrols.h:68-95
 *
 * Esa última línea es la que hace que estos botones sean **texto suelto** y no
 * botones con relieve: se salta el fondo de `Button` a propósito. Copiar el
 * relieve habría sido lo natural y habría dado otra interfaz.
 *
 * Y arranca en `a_east` (`MSInit`, :39), que es lo que hace que un botón más
 * ancho que su texto lo pegue a la derecha. El menú lo cambia a `a_center`
 * (`AddButton`, vgui_menubase.cpp:154-155), o sea que el valor de fábrica casi
 * nunca se ve — se porta igual, porque el día que se haga un panel que no lo
 * cambie, tiene que salir como sale en el juego.
 */
export class MSButton extends MSLabel {
  constructor({ texto = "", x = 0, y = 0, w = 0, h = 0,
                armado = [255, 0, 0, 0], desarmado = [255, 178, 0, 0],
                apagado = [127, 127, 127, 255],
                alineacion = "east", esquema = "Briefing Text",
                ajustarAlTexto = false, alPulsar = null, clase = "" } = {}) {
    super({ texto, x, y, w, h, alineacion, esquema, clase: `vg-boton ${clase}`.trim() });
    // Un `button` de verdad y no un `div`: así el navegador le da el papel y el
    // teclado que le corresponden sin que haya que fingirlos. Se cambia el nodo
    // aquí y no en `super()` porque `MSLabel` no sabe de botones; y se puede
    // cambiar sin más porque todavía no está colgado de nada.
    const boton = el("button", this.nodo.className);
    boton.type = "button";
    this.nodo = boton;
    this.armado = armado;
    this.desarmado = desarmado;
    this.apagado = apagado;
    this.ajustarAlTexto = ajustarAlTexto;
    this.sirve = true;
    this.estaArmado = false;
    this.datos = null;
    this.alPulsar = alPulsar;
    this.nodo.addEventListener("click", () => this.pulsar());
    // `setArmed()` en el original lo mueve el ratón del motor; aquí lo mueve el
    // del navegador, que es lo mismo visto desde el panel.
    this.nodo.addEventListener("pointerenter", () => this.armar(true));
    this.nodo.addEventListener("pointerleave", () => this.armar(false));
  }

  /** `setEnabled()`. */
  habilitar(si) { this.sirve = si; this.nodo.disabled = !si; this.nodo.dataset.sirve = si ? "si" : "no"; return this; }

  /** `setArmed()`. */
  armar(si) { this.estaArmado = si; this.nodo.dataset.armado = si ? "si" : "no"; this.pintar(); return this; }

  /** `doClick()`. Un botón apagado no hace nada, como en el original. */
  pulsar() {
    if (!this.sirve) return false;
    this.alPulsar?.(this.datos, this);
    return true;
  }

  /** El `paint()` de arriba: el color sale del estado, no del CSS. */
  pintar() {
    const c = !this.sirve ? this.apagado : this.estaArmado ? this.armado : this.desarmado;
    this.nodo.style.color = deVgui(...c);
  }

  colocar(ancho, alto, esquema) {
    super.colocar(ancho, alto, esquema);
    if (this.ajustarAlTexto) {
      // `FitText()`: el botón se queda del tamaño de su texto.
      //     void FitText() { getTextSize(w, h); setSize(w, h); }
      //                                       vgui_mscontrols.h:104-108
      const m = medirTexto(this.texto, esquema.fuenteCss(this.esquemaNombre));
      this.nodo.style.width = `${Math.ceil(m.ancho)}px`;
    }
    this.pintar();
    return this;
  }
}
