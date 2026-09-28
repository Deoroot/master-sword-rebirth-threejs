// EL MENÚ DE INTERACCIÓN: la F delante de un NPC.
//
// Es `VGUI_MenuInteract` de `vgui_menu_interact.h`, y es el primer panel que se
// porta de verdad por dos razones: es el más pequeño de los cuatro, y usa el kit
// entero —ventana, borde, título centrado, separador, botones que se ajustan al
// texto, números, Escape, desvanecido, colores de apagado—. Si el kit está mal,
// aquí se ve.
//
// Su tecla es la **F**, y eso no es una elección:
//
//     bind "f" "menu interact"                 config.cfg:19, kb_def.lst:61
//     "menu interact"  "Interact with NPC"     kb_act.lst:41
//
// ── Cómo mira a quién tiene delante ────────────────────────────────────────
//
//     entinfo_t *pEntInfo = gHUD.m_HUDId->GetEntInFrontOfMe(72);
//     if (pEntInfo) { SetInfo(pEntInfo->Name, pEntInfo->entindex);
//                     ServerCmd("getmenuoptions " + m_EntIdx); }
//     else            ServerCmd("getmenuoptions");
//                                     vgui_menu_interact.h:82-93
//
// **72 unidades**, que son 1,83 m. Y si no hay nadie delante pregunta igual, sin
// número: el servidor entonces contesta con el menú **del propio jugador**
// (`pMonster = pPlayer`, client.cpp:679-682), que es el que trae «item
// description». O sea que la F nunca no hace nada.
//
// ── Cancelar es el ÚLTIMO botón y se va moviendo ───────────────────────────
//
//     Open():      SetButton(0, "#CANCEL", MOT_CALLBACK);
//     AddOption(): SetButton(m_LastButton++, Title, Type);
//                  SetButton(m_LastButton, "#CANCEL", MOT_CALLBACK);
//                                     vgui_menu_interact.h:74, 146-148
//
// Lo natural sería dejar «Cancel» arriba o abajo fijo. Lo que hace es reescribir
// dos botones cada vez que llega una opción, así que «Cancel» baja un hueco por
// opción. Y por eso el número que lo pulsa cambia según el NPC.
//
// ── Y LA VENTANA CAMBIA DE ANCHO AL LLEGAR LA PRIMERA OPCIÓN ───────────────
//
//     m_pMainPanel->setSize(XRES(200), YRES(72) + YRES((m_Options.size() + 1) * 20));
//                                     vgui_menu_interact.h:139
//
// De 120 a **200**. Un NPC sin nada que decir tiene el menú estrecho y uno con
// una sola opción lo tiene ancho, porque la línea que lo ensancha está dentro de
// `AddOption`. Se porta igual: es lo que se ve jugando.

import { MenuBase, MEDIDAS, COLORES, centrado } from "./menubase.js";
import { CERRAR_CON_ESC, ATRAPA_NUMEROS } from "./registro.js";
import { medirTexto } from "./widgets.js";

/** `INTERACT_MAX_BUTTONS 10` y `INTERACT_MENU_NAME "interact"`. */
export const MAX_BOTONES = 10;
export const NOMBRE = "interact";

/** `GetEntInFrontOfMe(72)`: 72 unidades del motor. */
export const ALCANCE = 72;

/** Las medidas del redimensionado, tal cual las escribe el comentario de MiB. */
export const CRECE = { ancho: 200, base: 72, porOpcion: 20 };

export class MenuInteractuar extends MenuBase {
  /**
   * @param pedir     `(id|null) => Promise<{nombre, opciones:[{titulo,tipo,datos}]}>`
   * @param elegido   `(id, datos|null) => void`. `null` es cancelar (el −1).
   * @param aQuien    `() => {id, nombre}|null`, el de delante a 72 unidades.
   */
  constructor({ esquema, pedir, elegido, aQuien }) {
    super({
      nombre: NOMBRE, esquema, titulo: "Interact",
      // `SetBits(m_Flags, MENUFLAG_TRAPNUMINPUT)` lo pone `Init()`
      // (vgui_menubase.cpp:103). El Escape NO está en las banderas de este menú:
      // se cierra con su botón o con la F otra vez. Se le añade igualmente,
      // porque un panel del que no se puede salir con Escape en un navegador es
      // una trampa —no hay consola a la que caer— y es la tercera cosa que
      // cambia respecto al original, dicha aquí.
      banderas: ATRAPA_NUMEROS | CERRAR_CON_ESC,
    });
    this.pedir = pedir;
    this.elegido = elegido;
    this.aQuien = aQuien;
    this.idNpc = null;
    this.opciones = [];
    this.ultimo = 0;

    // Los diez botones se crean AQUÍ, vacíos, y se rellenan al abrir:
    //   for (i = 0; i < INTERACT_MAX_BUTTONS; i++) AddButton("", 0, i);
    //                                   vgui_menu_interact.h:52-53
    for (let i = 0; i < MAX_BOTONES; i++) this.anadirBoton("", i).ver(false);

    // La ventana no está centrada: va pegada a la derecha.
    //   m_pMainPanel->setPos(ScreenWidth - getWide() - XRES(80), h);
    //                                   vgui_menu_interact.h:47
    // El comentario de Thothie dice que antes era XRES(20).
    this.ventana.pon({ x: 640 - this.ventana.w - 80 });
  }

  /** `SetButton(idx, Name, Type)`. */
  ponBoton(i, texto, tipo) {
    const b = this.botones[i];
    if (!b) return null;
    b.ponTexto(texto);
    b.ver(true);
    // Se recentra con el ancho ACTUAL de la ventana, que puede haber crecido.
    const m = medirTexto(texto, this.esquema.fuenteCss("Briefing Text"));
    const anchoRef = m.ancho * (640 / Math.max(1, this._ancho ?? 640));
    b.pon({ w: anchoRef, x: centrado(this.ventana.w, anchoRef) });
    // `MOT_GREEN` pinta el color de APAGADO en verde y apaga el botón: es una
    // marca de «esto ya está hecho», no un botón que se pueda pulsar.
    b.apagado = tipo === "green" ? [...COLORES.verde] : [...COLORES.apagado];
    b.habilitar(!(tipo === "disabled" || tipo === "green"));
    b.datos = i;
    return b;
  }

  /** `Open()`: título genérico, todos los botones fuera, y Cancel en el 0. */
  abrir(ahora = 0) {
    this.titulo.ponEsquema("Title Font").ponTexto("Interact");
    this.ultimo = 0;
    this.idNpc = null;
    this.opciones = [];
    for (const b of this.botones) { b.ver(false); b.habilitar(true); }
    this.ventana.pon({ w: MEDIDAS.anchoVentana, h: MEDIDAS.altoVentana });
    this.ventana.pon({ x: 640 - MEDIDAS.anchoVentana - 80 });
    this.ponBoton(0, "Cancel", "callback");
    super.abrir(ahora);
    return this;
  }

  /**
   * `SetInfo(NPCName, EntIdx)`: el nombre del NPC como título, en la fuente
   * PEQUEÑA y centrado con `GetCenteredX`.
   *
   * El comentario de Thothie dice por qué la pequeña: «can't figure how title
   * text centers self - so always using small text as it looks less odd
   * uncentered» (vgui_menu_interact.h:105-107). O sea que el título de un NPC no
   * sale en la fuente de título por un problema de centrado que luego MiB
   * arregló, y la línea que lo pone en pequeño se quedó. Se porta así.
   */
  ponNpc(nombre, id) {
    this.idNpc = id;
    this.titulo.ponEsquema("Briefing Text").ponTexto(nombre);
    return this;
  }

  /** `AddOption(MenuOption)`. */
  anadirOpcion(op) {
    // `if (m_LastButton >= INTERACT_MAX_BUTTONS - 1) return;`
    // Con diez botones caben NUEVE opciones y el Cancel. La décima se descarta
    // sin decir nada.
    if (this.ultimo >= MAX_BOTONES - 1) return false;
    this.opciones.push(op);
    this.ventana.pon({
      w: CRECE.ancho,
      h: CRECE.base + (this.opciones.length + 1) * CRECE.porOpcion,
    });
    this.ventana.pon({ x: 640 - CRECE.ancho - 80 });
    this.ponBoton(this.ultimo++, op.titulo, op.tipo);
    this.ponBoton(this.ultimo, "Cancel", "callback");
    return true;
  }

  /**
   * `Select(BtnIdx, Data)`. El Cancel manda −1; cualquier otra, su índice.
   *
   *     if (SendCmd && BtnIdx != m_LastButton) ServerCmd("menuoption " + ent + " " + Data);
   *     if (SendCmd && BtnIdx == m_LastButton) ServerCmd("menuoption " + ent + " " + -1);
   *     VGUI::HideMenu(this);          vgui_menu_interact.h:195-205
   */
  elegir(i) {
    const cancelar = i === this.ultimo;
    this.elegido?.(this.idNpc, cancelar ? null : i);
    // `VGUI::HideMenu(this)`: por el registro, no a mano. Ver `poner()`.
    if (this.registro) this.registro.cerrar(); else this.cerrar();
    return !cancelar;
  }

  /** `QueryNPC()`: mira 72 unidades al frente y pide las opciones. */
  async preguntar() {
    const quien = this.aQuien?.() ?? null;
    const r = await this.pedir?.(quien?.id ?? null);
    if (!r) return this;
    this.ponNpc(r.nombre ?? "Interact", quien?.id ?? null);
    for (const op of r.opciones ?? []) this.anadirOpcion(op);
    this.colocar(this._ancho ?? 640, this._alto ?? 480, this.esquema);
    return this;
  }
}
