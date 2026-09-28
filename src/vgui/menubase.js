// `VGUI_MenuBase`: la ventanita con título, separador y botones.
//
// Es `vgui_menubase.cpp`. De aquí salen el menú principal del juego, el de
// interacción con un NPC y el de acciones, y es el panel más pequeño de los
// cuatro — que es la razón de hacerlo primero: prueba el kit entero sin traerse
// un sistema de inventario detrás.
//
// ── Las medidas, tal cual ──────────────────────────────────────────────────
//
//     #define MAINWIN_SIZE_X XRES(120)      #define BTN_SPACER_Y YRES(10)
//     #define MAINWIN_SIZE_Y YRES(170)      #define BTN_SIZE_Y   YRES(12)
//     #define MAINWIN_X XRES(320) - MAINWIN_SIZE_X / 2
//     #define MAINWIN_Y YRES(240) - MAINWIN_SIZE_Y / 2
//     #define BTN_START_Y YRES(50)          vgui_menubase.cpp:83-95
//
// Y los colores, que no son elegidos:
//
//     Color_BtnArmed(255, 0, 0, 0), Color_BtnUnarmed(255, 178, 0, 0),
//     Color_BtnDisabled(128, 128, 128, 0), Color_Border(100, 140, 100, 255)
//                                           vgui_menubase.cpp:34-36
//
// El armado es ROJO y el normal es ÁMBAR. Lo natural habría sido lo contrario
// —resaltar en claro— y el juego hace esto.
//
// ── El desvanecido, que es lo que hay que leer con cuidado ─────────────────
//
//     FadeTime = time - m_OpenTime;  clamp a [0, MAINMENU_FADETIME]
//     m_FadeAmt = int(255 * FadeTime / MAINMENU_FADETIME);
//     float InveserdFade = 255 - m_FadeAmt;          // sic, «Inveserd»
//     m_pMainPanel->m_iTransparency = (InveserdFade / 2 + 128);
//     m_Title->setFgColor(..., InveserdFade);
//     m_Border->setLineColor(..., InveserdFade);
//     m_Buttons[i]->m_ArmedColor.a = InveserdFade;    (y las otras dos)
//                                           vgui_menubase.cpp:195-224
//
// `InveserdFade` va de 255 a 0 en medio segundo, y con el alfa de VGUI al revés
// eso es «de invisible a opaco». O sea: el menú **entra**. La transparencia del
// panel va de 255 a 128, que es de la nada al medio negro. Todo con la misma
// cuenta y con el mismo número, que es lo que hace que entre a la vez.

import { Panel, MSLabel, MSButton, LineBorder, medirTexto } from "./widgets.js";
import { PanelConNombre, ATRAPA_NUMEROS, DESVANECIDO } from "./registro.js";

/** Las medidas de referencia, en la pantalla de 640×480 del motor. */
export const MEDIDAS = {
  anchoVentana: 120,
  altoVentana: 170,
  espaciadorX: 15,
  espaciadorY: 10,
  altoBoton: 12,
  primerBoton: 50,
  tituloY: 10,
  tituloAlto: 14,
  separadorY: 30,
  separadorAlto: 3,
  grosorBorde: 2,
};

export const COLORES = {
  armado: [255, 0, 0, 0],
  desarmado: [255, 178, 0, 0],
  apagado: [128, 128, 128, 0],
  borde: [100, 140, 100, 255],
  separador: [0, 128, 0, 128],
  titulo: [255, 255, 255, 0],
  /** `COLOR(0, 255, 0, 255)` de `MOT_GREEN`. `vgui_menu_interact.h:161`. */
  verde: [0, 255, 0, 255],
};

/**
 * `GetCenteredItemX`, CON SU FALLO DE PRECEDENCIA.
 *
 *     return (WorkSpaceSizeX/2.0f) - (ItemSizeX/2.0f * Items
 *                                     + (SpaceBewteenItems/2.0f * Items-1));
 *                                     vgui_choosecharacter.cpp:393-397
 *
 * Lo que quería decir es `Espacio/2 * (Items − 1)`: el hueco va ENTRE los
 * elementos, así que con uno no hay hueco. Lo que dice es
 * `(Espacio/2 * Items) − 1`, con el `−1` fuera del paréntesis que le tocaba.
 *
 * Consecuencias, las dos:
 *
 *   - con un elemento y sin espacio —que es el caso del título del menú— sale
 *     **un píxel a la derecha** de donde debía. Nadie lo ha visto nunca.
 *   - con varios elementos y espacio de verdad, el error es de medio espacio por
 *     elemento y eso sí se ve. Y se vio: MiB escribió en 2014 un
 *     `GetCenteredX(W, w) { return W/2 - w/2; }` para el título del menú de
 *     interacción (vgui_menu_interact.h:126) en vez de arreglar éste.
 *
 * Se porta con el fallo, con su prueba al lado, porque las dos funciones existen
 * en el original y cada panel usa la que usa.
 */
export function centradoConFallo(anchoZona, anchoCosa, cosas = 1, espacio = 0) {
  return Math.trunc((anchoZona / 2) - (anchoCosa / 2 * cosas + (espacio / 2 * cosas - 1)));
}

/** `GetCenteredX`, el que MiB escribió bien. `vgui_menu_interact.h:126`. */
export function centrado(anchoZona, anchoCosa) {
  return Math.trunc(anchoZona / 2 - anchoCosa / 2);
}

export class MenuBase extends PanelConNombre {
  constructor({ nombre, esquema, titulo = "", banderas = ATRAPA_NUMEROS, sinRaton = false }) {
    super({ nombre, banderas, sinRaton });
    this.esquema = esquema;
    // `CMenuPanel(255, 0, 0, 0, ScreenWidth, ScreenHeight)`: la pantalla entera
    // con transparencia 255, que es invisible. Está para recibir el ratón y para
    // que los paneles hijos se coloquen respecto a la pantalla, no para tapar.
    this.raiz = new Panel({ x: 0, y: 0, w: 640, h: 480, transparencia: 255, clase: "vg-menu" });

    this.ventana = new Panel({
      x: 320 - MEDIDAS.anchoVentana / 2,
      y: 240 - MEDIDAS.altoVentana / 2,
      w: MEDIDAS.anchoVentana,
      h: MEDIDAS.altoVentana,
      transparencia: 128,
      clase: "vg-menu-ventana",
    });
    this.borde = this.ventana.ponBorde(new LineBorder(MEDIDAS.grosorBorde, [...COLORES.borde]));
    this.raiz.anadir(this.ventana);

    this.titulo = new MSLabel({
      texto: titulo, x: 0, y: MEDIDAS.tituloY,
      w: MEDIDAS.anchoVentana, h: MEDIDAS.tituloAlto,
      alineacion: "center", esquema: "Title Font", color: [...COLORES.titulo],
    });
    this.ventana.anadir(this.titulo);

    // El separador: `CTransparentPanel(0, ...)`, o sea sin fondo, con el borde
    // verde de 2 px que NO pasa por `XRES` —es `LineBorder(2, ...)` y no
    // `LineBorder(XRES(2), ...)` como el de la ventana—. A 1920 el marco de la
    // ventana mide seis píxeles y el separador sigue midiendo dos.
    this.separador = new Panel({
      x: 0, y: MEDIDAS.separadorY, w: 0, h: MEDIDAS.separadorAlto,
      transparencia: 0, clase: "vg-menu-sep",
    });
    this.separadorBorde = this.separador.ponBorde(new LineBorder(2, [...COLORES.separador]));
    this.separadorBorde.enPixeles = true;       // no escala: es 2 y no XRES(2)
    this.ventana.anadir(this.separador);

    this.botones = [];
    this.siguienteY = MEDIDAS.primerBoton;
    /** `m_AllowKeys`. Las teclas de número se pueden apagar por panel. */
    this.permitirTeclas = true;
  }

  /**
   * `AddButton`. Se crea con el ancho de su texto y se centra en la ventana.
   *
   *     g_FontSml->getTextSize(Name, w, h);
   *     new MSButton(m_pMainPanel, Name, (wide/2.0) - (w/2.0), m_ButtonY, w, BTN_SIZE_Y, ...)
   *     pButton->m_AutoFitText = true;
   *     pButton->setTextAlignment(Label::a_west);
   *     pButton->setContentAlignment(Label::a_center);
   *     m_ButtonY += pButton->getTall() + BTN_SPACER_Y;
   *                                     vgui_menubase.cpp:147-165
   */
  anadirBoton(texto, datos = null) {
    const m = medirTexto(texto, this.esquema.fuenteCss("Briefing Text"));
    const b = new MSButton({
      texto,
      x: MEDIDAS.anchoVentana / 2 - (m.ancho || 0) / 2,
      y: this.siguienteY,
      w: m.ancho || 0,
      h: MEDIDAS.altoBoton,
      armado: [...COLORES.armado],
      desarmado: [...COLORES.desarmado],
      apagado: [...COLORES.apagado],
      alineacion: "center",
      ajustarAlTexto: true,
      alPulsar: (d, boton) => this.elegir(this.botones.indexOf(boton), d),
    });
    b.datos = datos;
    this.botones.push(b);
    this.ventana.anadir(b);
    this.siguienteY += MEDIDAS.altoBoton + MEDIDAS.espaciadorY;
    return b;
  }

  /** `Select(BtnIdx, Data)`. Lo implementa cada menú. */
  elegir() {}

  /**
   * `SlotInput(iSlot)`.
   *
   *     if (iSlot < 0 || iSlot >= m_Buttons.size() || !m_AllowKeys
   *         || !m_Buttons[iSlot]->isEnabled()) return false;
   *     m_Buttons[iSlot]->doClick();
   *                                     vgui_menubase.cpp:176-189
   *
   * Un botón apagado no se puede elegir con el número, y un botón invisible SÍ
   * —la condición no mira `isVisible()`—. El menú de interacción crea sus diez
   * botones vacíos e invisibles en el constructor, así que con dos opciones en
   * pantalla el `5` pulsa un botón que no se ve. Lo que salva al original de que
   * eso haga algo es que un botón vacío no lleva datos, no que lo compruebe.
   */
  ranura(i) {
    if (i < 0 || i >= this.botones.length) return false;
    if (!this.permitirTeclas) return false;
    if (!this.botones[i].sirve) return false;
    this.botones[i].pulsar();
    return true;
  }

  /** `Open()`: todos los botones desarmados y el reloj del desvanecido a cero. */
  abrir(ahora = 0) {
    for (const b of this.botones) b.armar(false);
    super.abrir(ahora);
    this.pensar(ahora);
    return this;
  }

  /** `UpdateFade()`, la cuenta de arriba, con un solo número para todo. */
  pensar(ahora = 0) {
    const t = Math.min(Math.max(ahora - this.abiertoEn, 0), DESVANECIDO);
    const alRevés = Math.round(255 - 255 * (t / DESVANECIDO));
    this.ventana.transparencia = Math.round(alRevés / 2 + 128);
    this.titulo.color = [COLORES.titulo[0], COLORES.titulo[1], COLORES.titulo[2], alRevés];
    this.borde.color = [COLORES.borde[0], COLORES.borde[1], COLORES.borde[2], alRevés];
    this.separadorBorde.color = [COLORES.separador[0], COLORES.separador[1], COLORES.separador[2], alRevés];
    for (const b of this.botones) {
      b.armado[3] = alRevés;
      b.desarmado[3] = alRevés;
      b.apagado[3] = alRevés;
    }
    this.colocar(this._ancho ?? 640, this._alto ?? 480, this.esquema);
    return alRevés;
  }

  colocar(ancho, alto, esquema) {
    this._ancho = ancho; this._alto = alto;
    // El separador mide lo que mide el título, y se centra con la función BUENA
    // (`GetCenteredX`), que es lo que MiB cambió en 2014.
    const m = medirTexto(this.titulo.texto, esquema.fuenteCss(this.titulo.esquemaNombre));
    const anchoEnReferencia = m.ancho * (640 / Math.max(1, ancho));
    this.separador.pon({ w: anchoEnReferencia, x: centrado(this.ventana.w, anchoEnReferencia) });
    super.colocar(ancho, alto, esquema);
    // El borde del separador no escala: son 2 píxeles y no `XRES(2)`.
    if (this.separadorBorde.enPixeles) {
      this.separador.nodo.style.border = `2px solid ${this.separadorBorde.css}`;
    }
  }
}
