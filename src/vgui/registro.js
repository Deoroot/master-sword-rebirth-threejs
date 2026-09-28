// EL REGISTRO DE PANELES, y el contrato de entrada.
//
// Ésta es la pieza que arregla el fallo que motivó el experimento: los paneles
// que hicimos escuchaban `keydown` en la ventana, por su cuenta, por fuera de la
// tabla de teclas del juego. En Master Sword no funciona así. Un panel es un
// `CMenuPanel` con tres banderas, y el viewport decide qué tecla le llega:
//
//     #define MENUFLAG_CLOSEONESC   (1 << 0)
//     #define MENUFLAG_TRAPNUMINPUT (1 << 1)
//     #define MENUFLAG_TRAPSTEPINPUT (1 << 2)
//                                     vgui_teamfortressviewport.h:64-66
//
// Y el reparto entero está en un sitio (vgui_teamfortressviewport.cpp:1875-1911
// para el teclado, :2215-2236 para la rueda), no repartido por los paneles. Eso
// es lo que se porta aquí.
//
// ── Los tres comportamientos que sólo se ven leyéndolo ─────────────────────
//
// **1. Sólo el flanco de bajada.** `if (!down) return 1;` (:1875). Soltar una
// tecla no hace nada en un panel.
//
// **2. El botón décimo NO SE PUEDE ELEGIR CON EL TECLADO.** El reparto de los
// números es así:
//
//     for (int i = '0'; i <= '9'; i++)
//       if (down && (keynum == i)) { SlotInput((i - '0') - 1); return 0; }
//                                     vgui_teamfortressviewport.cpp:1892-1901
//
// O sea `ranura = dígito − 1`: el `1` da la 0 y el `9` da la 8. El `0` da **−1**,
// que `SlotInput` rechaza (`if (iSlot < 0 ...) return false`,
// vgui_menubase.cpp:178). Y el menú de interacción crea **diez** botones
// (`INTERACT_MAX_BUTTONS 10`), así que el décimo sólo se puede pulsar con el
// ratón. Doce líneas más arriba, en el camino del menú del HUD, el mismo motor
// SÍ hace `if (!Num) Num = 10;` (:1882-1884) — o sea que la corrección existe y
// no se aplicó aquí. **Se porta con el fallo**, y hay una prueba que lo dice.
//
// **3. Al cerrar un panel, la tecla de usar se traga medio segundo.**
//
//     if ((cmd->buttons & IN_USE) && ((GetClientTime() - g_fMenuLastClosed) < 0.5f))
//       { cmd->buttons &= ~IN_USE; IN_UseUp(); }        input.cpp:859-863
//
// Sin eso, cerrar el menú del NPC con la misma tecla con la que se abre lo
// vuelve a abrir en el mismo fotograma, o te hace usar lo que tengas delante.

import { ALINEACION } from "./widgets.js";

/** Las tres banderas, con su valor del motor. */
export const CERRAR_CON_ESC = 1 << 0;
export const ATRAPA_NUMEROS = 1 << 1;
export const ATRAPA_RUEDA = 1 << 2;

/** `HUDSCROLL_DOWN / UP / SELECT` (vgui_teamfortressviewport.h:1085-1090). */
export const RUEDA = { ABAJO: 0, ARRIBA: 1, ELEGIR: 2 };

/** `MAINMENU_FADETIME 0.5f` (vgui_menubase.cpp:97). */
export const DESVANECIDO = 0.5;

/** El medio segundo que se traga la tecla de usar. `input.cpp:859`. */
export const TRAGA_USAR = 0.5;

/**
 * Un panel con nombre: `VGUI_MainPanel` más `CMenuPanel`.
 *
 * Los cuatro paneles del personaje heredan de esto. Lo que trae:
 *
 *   - `nombre`, que es por lo que se busca (`VGUI::FindPanel`);
 *   - `banderas`, las tres de arriba;
 *   - `sinRaton`, que es `m_NoMouse`: hay paneles que se enseñan sin liberar el
 *     puntero, porque son de leer y no de tocar (`CStatPanel`, vgui_stats.cpp:75);
 *   - `abiertoEn`, que es `m_flOpenTime`, «so we can delay input for a bit».
 */
export class PanelConNombre {
  constructor({ nombre, banderas = 0, sinRaton = false, raiz = null }) {
    this.nombre = nombre;
    this.banderas = banderas;
    this.sinRaton = sinRaton;
    this.abiertoEn = 0;
    this.visible = false;
    this.raiz = raiz;                  // el `Panel` de `widgets.js` que dibuja
  }

  /** `CanOpen()`: un panel puede negarse a abrirse. Por defecto sí. */
  puedeAbrir() { return true; }

  /** `Open()`. */
  abrir(ahora = 0) {
    this.visible = true;
    this.abiertoEn = ahora;
    this.raiz?.ver(true);
    return this;
  }

  /** `Close()`. */
  cerrar() {
    this.visible = false;
    this.raiz?.ver(false);
    return this;
  }

  /** `SlotInput(iSlot)`: devuelve `true` si lo ha consumido. */
  ranura() { return false; }

  /** `StepInput(ScrollCmd)`. */
  paso() {}

  /** `KeyInput(down, keynum, binding)`: la salida de emergencia de cada panel. */
  tecla() { return false; }

  /** `Think()`, para el desvanecido. */
  pensar() {}

  /** `Update()`. */
  refrescar() {}

  /** Recoloca en pantalla. */
  colocar(ancho, alto, esquema) { this.raiz?.colocar(ancho, alto, esquema); }
}

/**
 * El registro: `VGUI::FindPanel`, `ToggleMenuVisible` y el reparto de teclas.
 *
 * Hay **un panel abierto y sólo uno**, que es `m_pCurrentMenu` del motor. Abrir
 * el inventario con la hoja abierta cierra la hoja; no se apilan.
 */
export class Registro {
  constructor({ esquema, raiz = null, reloj = () => 0, sonar = null, cursor = null } = {}) {
    this.esquema = esquema;
    this.raiz = raiz;                  // el nodo del DOM donde se cuelgan
    this.reloj = reloj;                // segundos, del reloj del juego
    this.sonar = sonar;                // los tres sonidos de `sound/ui/`
    this.cursor = cursor;              // `UpdateCursorState`, ver `cursorCambio`
    this.paneles = new Map();
    this.actual = null;
    /** `g_fMenuLastClosed` (vgui_menubase.cpp:61). */
    this.cerradoEn = -Infinity;
    this.ancho = 640;
    this.alto = 480;
  }

  /** Cuelga un panel. Devuelve el panel, para poder encadenar. */
  poner(panel) {
    this.paneles.set(panel.nombre, panel);
    // El panel necesita poder cerrarse solo —al elegir una opción se cierra— y
    // tiene que hacerlo POR EL REGISTRO, porque si no `actual` se queda
    // apuntando a un panel invisible y el juego cree que sigue habiendo uno
    // abierto: las teclas de movimiento no vuelven y el ratón no se captura.
    panel.registro = this;
    if (panel.raiz && this.raiz) this.raiz.appendChild(panel.raiz.nodo);
    panel.raiz?.ver(false);
    panel.colocar(this.ancho, this.alto, this.esquema);
    return panel;
  }

  /** `VGUI::FindPanel(name)`. */
  buscar(nombre) { return this.paneles.get(nombre) ?? null; }

  /** ¿Hay algún panel abierto? Es `m_pCurrentMenu != null`. */
  get abierto() { return this.actual; }

  /**
   * ¿El juego tiene que dejar de moverse? Es lo que decide si el ratón se
   * libera y si las teclas de movimiento llegan al jugador.
   *
   * `m_NoMouse` es la excepción que importa: `CStatPanel` se lee **sin** soltar
   * el puntero, así que se puede mirar la hoja sin perder el control del
   * personaje. Copiarlo al revés habría dado una hoja que te suelta la cámara.
   */
  get atrapaElRaton() { return !!(this.actual && !this.actual.sinRaton); }

  /**
   * `UpdateCursorState()`, que es lo que le faltaba a esto y por eso el
   * inventario se abría **sin poder pulsar nada**.
   *
   * El motor no deja esa decisión al panel: la toma el viewport, y la toma en
   * TRES sitios —al enseñar un menú, al esconderlo y al quitar el de encima—,
   * nunca en el cuerpo del panel:
   *
   *     m_pCurrentMenu = pNewMenu; m_pCurrentMenu->Open();
   *     UpdateCursorState();            vgui_teamfortressviewport.cpp:1489-1493
   *     VGUI::HideMenu(...) { pPanel->Close(); ... UpdateCursorState(); }
   *                                    vgui_global.cpp:67-72
   *     HideTopMenu() { ... UpdateCursorState(); }
   *                                    vgui_teamfortressviewport.cpp:1523
   *
   * Y lo que hace, delegado al panel para respetar su `m_NoMouse`:
   *
   *     if (m_NoMouse) { g_iVisibleMouse = false; ...scu_none; return false; }
   *     g_iVisibleMouse = true; ...scu_arrow;      vgui_global.cpp:99-114
   *
   * `g_iVisibleMouse` **es el puntero atrapado del navegador, al revés**. Con él
   * en alto el motor apaga las tres cosas que aquí apaga `pointerLockElement`:
   * los botones del ratón dejan de ser botones de juego (`if (iMouseInUse ||
   * g_iVisibleMouse) return;`, inputw32.cpp:387), el movimiento deja de girar la
   * vista (:477) y deja de acumularse (:600). O sea que **soltar el puntero es la
   * traducción exacta**, no una aproximación: una sola llamada compra las tres.
   *
   * Aquí sólo se avisa; quién llama a `exitPointerLock` es `src/main.js`, porque
   * el `canvas` es suyo y este archivo no toca el DOM del juego.
   */
  cursorCambio() { this.cursor?.(this.atrapaElRaton, this.actual); }

  abrir(nombre) {
    const p = this.buscar(nombre);
    if (!p || !p.puedeAbrir()) return null;
    if (this.actual && this.actual !== p) this.cerrar();
    this.actual = p;
    p.abrir(this.reloj());
    p.refrescar();
    p.colocar(this.ancho, this.alto, this.esquema);
    this.cursorCambio();
    return p;
  }

  cerrar() {
    if (!this.actual) return null;
    const p = this.actual;
    this.actual = null;
    p.cerrar();
    // `g_fMenuLastClosed = gEngfuncs.GetClientTime();`  vgui_menu_interact.h:177
    this.cerradoEn = this.reloj();
    this.cursorCambio();
    return p;
  }

  /** `VGUI::ToggleMenuVisible(name)`. */
  alternar(nombre) {
    if (this.actual?.nombre === nombre) { this.cerrar(); return null; }
    return this.abrir(nombre);
  }

  /**
   * ¿Se traga la tecla de usar? Medio segundo desde que se cerró un panel.
   * `input.cpp:859-863`.
   */
  tragaUsar() { return this.reloj() - this.cerradoEn < TRAGA_USAR; }

  /**
   * Una tecla. Devuelve `true` si el panel se la ha quedado y el juego no debe
   * verla. Es `KeyInput` del viewport, con el orden del original:
   *
   *   sólo bajada → el panel primero → los números → Escape.
   */
  tecla(codigo, abajo = true) {
    if (!this.actual) return false;
    if (!abajo) return false;                       // `if (!down) return 1;`

    // La salida de emergencia de cada panel va PRIMERO, porque crear personaje
    // la usa para su propio Escape (que va atrás de etapa, no cierra).
    if (this.actual.tecla(codigo, abajo)) return true;

    if (this.actual.banderas & ATRAPA_NUMEROS) {
      const m = /^Digit([0-9])$/.exec(codigo);
      if (m) {
        // `SlotInput((i - '0') - 1)`. El 0 da −1 a propósito: ver arriba.
        const ranura = Number(m[1]) - 1;
        this.actual.ranura(ranura);
        return true;                                // `return 0`: se la queda igual
      }
    }

    if ((this.actual.banderas & CERRAR_CON_ESC) && codigo === "Escape") {
      this.cerrar();
      return true;
    }
    return false;
  }

  /**
   * La rueda. `HUD_StepInput` sólo llega al HUD **si no hay panel abierto**
   * (:2233), o sea que con el inventario abierto la rueda no cambia de arma.
   */
  rueda(cual) {
    if (!this.actual) return false;
    if (this.actual.banderas & ATRAPA_RUEDA) { this.actual.paso(cual); return true; }
    // Un panel abierto sin la bandera se come la rueda igualmente: el motor no
    // la pasa al HUD mientras haya menú. Es el `else if (!m_pCurrentMenu)`.
    return true;
  }

  /** El desvanecido y el `Think()` de cada fotograma. */
  pensar() { this.actual?.pensar(this.reloj()); }

  /** Cambió el tamaño de la ventana: se recoloca todo. */
  medir(ancho, alto) {
    this.ancho = ancho; this.alto = alto;
    this.esquema.medir(ancho);
    for (const p of this.paneles.values()) p.colocar(ancho, alto, this.esquema);
  }

  /**
   * Cuánto va del desvanecido, en [0, 1].
   *
   *     FadeTime = time - m_OpenTime;  clamp(0, MAINMENU_FADETIME)
   *     m_FadeAmt = int(255 * FadeTime / MAINMENU_FADETIME);
   *                                     vgui_menubase.cpp:197-201
   */
  fundido(panel = this.actual) {
    if (!panel) return 1;
    const t = Math.min(Math.max(this.reloj() - panel.abiertoEn, 0), DESVANECIDO);
    return t / DESVANECIDO;
  }
}

// Se reexporta para que un panel no tenga que importar de dos sitios para
// declarar su alineación.
export { ALINEACION };
