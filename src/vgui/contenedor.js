// EL INVENTARIO: `VGUI_ContainerPanel`, de `vgui_container.cpp`.
//
// Éste es el panel que **estaba inventado entero**. Lo que teníamos era una
// rejilla estilo Diablo, con huellas de 1×1 a 3×3 según el `size` del objeto, y
// su propio archivo lo reconocía en la cabecera:
//
//     «La rejilla es NUESTRA, y es la primera decisión de este proyecto que se
//      aparta del original a propósito.»          src/juego/inventario.js
//
// Master Sword no tiene rejilla. Tiene cuatro piezas, y las cuatro están
// medidas en las macros de su propio archivo:
//
//     GEARPNL          el equipo: lo que llevas puesto y tus contenedores
//     ITEM_CONTAINER   lo que hay dentro del contenedor elegido, con su barra
//     INFOPANEL        el objeto señalado: nombre, peso, cantidad, calidad
//     ACTBTN           la acción: sacar, meter, ponerse
//
// ── Las medidas, y dos que están raras a propósito ────────────────────────
//
//     #define GEARPNL_X            CONTAINERMENU_SPACER_X    // XRES(5)
//     #define GEARPNL_Y            YRES(50)
//     #define GEARPNL_SIZE_X       YRES(80)                  // <- YRES, no XRES
//     #define GEARPNL_SIZE_Y       YRES(235)
//     #define ITEM_CONTAINER_X     (GEARPNL_X + GEARPNL_SIZE_X) + CONTAINERMENU_SPACER_X
//     #define ITEM_CONTAINER_SIZE_X (ScreenWidth - (ITEM_CONTAINER_X + CONTAINERMENU_SPACER_X))
//     #define ITEM_CONTAINER_SIZE_Y YRES(340)
//     #define ACTBTN_SIZE_X        XRES(130)
//     #define ACTBTN_SIZE_Y        YRES(30)
//                                     vgui_container.h:11-27
//
// **`GEARPNL_SIZE_X` es `YRES(80)`**, o sea que el ANCHO de la columna del
// equipo se calcula con la escala VERTICAL. En 4:3 da igual; en 16:9 la columna
// sale más estrecha de lo que se quiso. Se porta así.
//
// Y **el contenedor mide «lo que sobre»**: no tiene ancho propio, se lo come
// todo hasta el borde derecho menos cinco. Por eso en una pantalla ancha el
// inventario de Master Sword se ve tan vacío.
//
// ── Lo que se conserva de lo que había ────────────────────────────────────
//
// La regla del peso, que ésa sí es del juego y no nuestra:
//
//     Volume() = min( STR × 25 + 25, 2000 )
//
// Sigue en `src/juego/inventario.js`, que se queda con eso y pierde `BANDAS` y
// `huellaDe()` — las dos cosas que se habían inventado.

import { Panel, MSLabel, MSButton } from "./widgets.js";
import { PanelConNombre, ATRAPA_NUMEROS, CERRAR_CON_ESC, ATRAPA_RUEDA, RUEDA } from "./registro.js";

export const NOMBRE = "inventory";

/** `INVENTORY_TRANSPARENCY 90`. `vgui_mscontrols.h:427`. */
export const TRANSPARENCIA = 90;

/** Las medidas, en la pantalla de referencia de 640×480. */
export const MEDIDAS = {
  separador: 5,
  equipoX: 5, equipoY: 50, equipoAncho: 80, equipoAlto: 235,
  contenedorY: 50, contenedorAlto: 340,
  accionAncho: 130, accionAlto: 30,
  oroAlto: 12, oroSeparador: 5,
  tituloY: 15,
  cancelarAncho: 40, cancelarAlto: 15,
  filaAlto: 18,                       // lo que ocupa un objeto en la lista
  etiquetaAlto: 12,
  infoPrimera: 20,                    // INFOPANEL_LABEL_SPACER1_Y
  // `VGUI_InvTypePanel`, vgui_container.cpp:517-524. MiB FEB2015_07 los tres
  // botones de vista, y FEB2019_25 la casilla de ordenar.
  vistaY: 10,                         // INVTYPE_PANEL_Y, bajo el contenedor
  vistaAlto: 64,
  vistaBotonAncho: 80, vistaBotonAlto: 15,
  vistaSepX: 12, vistaSepY: 12,
};

/**
 * Los tres modos de lista y la casilla de ordenar.
 *
 *     const char ButtonText[INVTYPE_BUTTONS_TOTAL][16] =
 *         {"Tiled", "Small", "Descriptions"};        vgui_container.cpp:531
 *
 * El orden es el del array y no se toca: es el que se ve en pantalla. La
 * casilla va DEBAJO del primero, no al lado (`INVTYPE_BUTTON_SIZE_Y +
 * INVTYPE_BUTTON_Y_SPACER` como `y`, vgui_container.cpp:533), y guarda su valor
 * en una cvar —`ms_alpha_inventory`— o sea que sobrevive a cerrar el panel.
 */
export const VISTAS = ["Tiled", "Small", "Descriptions"];

/**
 * `ms_doubleclicktime`, en segundos: `CVAR_CREATE("ms_doubleclicktime", "0.5")`
 * (clientlibrary.cpp:174). Lo usa `VGUI_DoubleClickDetector::Click`
 * (vgui_mscontrols.h:371-405): el MISMO botón sobre el MISMO elemento antes de
 * que pase este tiempo.
 */
export const DOBLE_CLIC = 0.5;

/** Los colores, de `vgui_container.cpp:36-40` y del constructor del panel. */
export const COLORES = {
  titulo: [255, 100, 100, 0],         // Color_TitleText — el salmón
  subtitulo: [160, 160, 160, 0],
  oro: [255, 255, 0, 0],              // Color_GoldText
  elegido: [255, 0, 0, 0],            // Color_GearSelected
  normal: [255, 255, 255, 0],         // Color_GearNormal
  noContenedor: [160, 160, 160, 0],   // Color_GearNonContainer
  resaltado: [255, 255, 255, 0],      // Color_TextHighlighted
  apagado: [100, 100, 100, 0],        // Color_TextNormal
  rojo: [255, 0, 0, 0],
  blanco: [255, 255, 255, 0],
};

/**
 * `ITEM_CONTAINER_X`, en unidades de referencia.
 *
 * Depende del ancho de la columna del equipo, y **ése se mide con `YRES`**, así
 * que depende de la proporción de la pantalla. A 640×480 son 90; a 1200×800 la
 * columna mide 133 px en vez de 150 y todo lo de la derecha se corre.
 */
export const contenedorX = (ancho = 640, alto = 480) =>
  MEDIDAS.equipoX + (MEDIDAS.equipoAncho * (alto / 480)) / (ancho / 640) + MEDIDAS.separador;
/** `ITEM_CONTAINER_SIZE_X`: lo que sobra hasta el borde derecho, menos cinco. */
export const contenedorAncho = (ancho = 640, alto = 480) =>
  640 - (contenedorX(ancho, alto) + MEDIDAS.separador);

const el = (tag, clase = "") => {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  return n;
};

export const CSS = `
.vg-inv-lista { position: absolute; overflow-y: auto; overflow-x: hidden; }
.vg-inv-fila { position: relative; display: flex; align-items: center; gap: 6px;
  cursor: pointer; white-space: nowrap; }
.vg-inv-fila[data-elegida="si"] { color: rgb(255, 0, 0); }
.vg-inv-icono { image-rendering: pixelated; flex: none; }
.vg-inv-nada { opacity: 0.55; }
/* «Descriptions» parte la fila en dos líneas, así que deja de ser una fila. */
.vg-inv-descriptions { flex-wrap: wrap; white-space: normal; }
.vg-inv-desc { flex-basis: 100%; opacity: 0.7; font-size: 0.9em; }
`;

/**
 * El panel del inventario.
 *
 * @param equipo     `() => [{id, nombre, esContenedor}]`, lo que llevas puesto
 * @param dentro     `(idEquipo) => [{id, nombre, peso, cantidad, calidad, icono}]`
 * @param actuar     `(idEquipo, idObjeto) => string|null`, y devuelve el aviso
 * @param oro        `() => number`
 * @param carga      `() => ({lleva, puede})`, el peso y el `Volume()`
 *
 * Y las tres órdenes del 97 (src/play/equipar.js), opcionales: sin ellas el
 * panel se comporta como antes, que es lo que necesita la tienda que hereda.
 *
 * @param quitar     `(idEquipo) => string|null` — `remove <id>`; el texto es un aviso
 * @param sacar      `(idEquipo, idObjeto) => string|null` — `inv transfer <id> 0`
 * @param llevarA    `(idEquipo, idObjeto, desdeLasManos) => bool` — `inv transfer
 *                   <id> <c>`; `false` es «no era un contenedor», y el clic elige
 * @param reloj      `() => segundos`, para el doble clic
 */
export class PanelDeInventario extends PanelConNombre {
  constructor({ esquema, equipo, dentro, actuar = () => null, oro = () => 0, carga = () => null,
    quitar = null, sacar = null, llevarA = null, reloj = () => performance.now() / 1000 }) {
    super({
      nombre: NOMBRE,
      // El original no le pone `MENUFLAG_CLOSEONESC` —se cierra con su botón—
      // pero sí `MENUFLAG_TRAPSTEPINPUT` por la barra de desplazamiento. Aquí se
      // añade el Escape por lo mismo que en el menú de la F: en un navegador no
      // hay consola a la que caer si un panel se queda pegado.
      banderas: ATRAPA_NUMEROS | CERRAR_CON_ESC | ATRAPA_RUEDA,
    });
    this.esquema = esquema;
    this.equipo = equipo; this.dentro = dentro; this.actuar = actuar;
    this.oro = oro; this.carga = carga;
    this.quitar = quitar; this.sacar = sacar; this.llevarA = llevarA; this.reloj = reloj;
    /** `VGUI_DoubleClickDetector`: qué se pulsó la última vez y cuándo. */
    this._ultimoClic = null;
    this.elegidoEquipo = 0;
    this.elegidoObjeto = null;
    this.aviso = "";

    this.raiz = new Panel({ x: 0, y: 0, w: 640, h: 480, transparencia: TRANSPARENCIA, clase: "vg-inv" });

    this.titulo = new MSLabel({
      texto: "Inventory", x: contenedorX(), y: MEDIDAS.tituloY, w: 300, h: 24,
      esquema: "Title Font", color: [...COLORES.titulo],
    });
    this.raiz.anadir(this.titulo);

    this.subtitulo = new MSLabel({
      texto: "", x: contenedorX(), y: MEDIDAS.tituloY + 24, w: 400, h: MEDIDAS.etiquetaAlto,
      color: [...COLORES.subtitulo],
    });
    this.raiz.anadir(this.subtitulo);

    // La columna del equipo, con su fondo propio.
    this.panelEquipo = new Panel({
      x: MEDIDAS.equipoX, y: MEDIDAS.equipoY,
      w: MEDIDAS.equipoAncho, h: MEDIDAS.equipoAlto,
      transparencia: TRANSPARENCIA, anchoPorY: true,
    });
    this.raiz.anadir(this.panelEquipo);
    this.listaEquipo = el("div", "vg-inv-lista");
    this.panelEquipo.nodo.appendChild(this.listaEquipo);

    // El contenedor, que mide lo que sobra.
    this.panelContenedor = new Panel({
      x: contenedorX(), y: MEDIDAS.contenedorY,
      w: contenedorAncho(), h: MEDIDAS.contenedorAlto,
      transparencia: TRANSPARENCIA,
    });
    this.raiz.anadir(this.panelContenedor);
    this.listaObjetos = el("div", "vg-inv-lista");
    this.panelContenedor.nodo.appendChild(this.listaObjetos);

    // El oro, en la fuente de TÍTULO y amarillo. `m_GoldLabel->setFont(g_FontTitle)`.
    const oroY = MEDIDAS.equipoY + MEDIDAS.equipoAlto + MEDIDAS.oroSeparador;
    this.etiquetaOro = new MSLabel({
      texto: "", x: MEDIDAS.equipoX, y: oroY, w: MEDIDAS.equipoAncho, h: MEDIDAS.oroAlto,
      alineacion: "center", esquema: "Title Font", color: [...COLORES.oro],
    });
    this.raiz.anadir(this.etiquetaOro);

    // El panel de información: nombre, peso, cantidad y calidad, uno debajo de
    // otro y centrados. `VGUI_ItemInfoPanel`, vgui_container.cpp:288-320.
    const infoY = oroY + MEDIDAS.oroAlto + MEDIDAS.oroSeparador;
    this.panelInfo = new Panel({
      x: MEDIDAS.equipoX, y: infoY,
      w: MEDIDAS.equipoAncho,
      h: (MEDIDAS.contenedorY + MEDIDAS.contenedorAlto) - infoY,
      transparencia: TRANSPARENCIA,
    });
    this.raiz.anadir(this.panelInfo);
    this.info = {};
    // `carga` es la quinta y es NUESTRA: el peso que llevas encima frente al
    // que puedes. MSR no la enseña en este panel —va en Character Info—, pero
    // el `Volume()` es del juego y sin verlo aquí no hay forma de saber por qué
    // un objeto no cabe. Se pone la última y se dice que es añadida.
    for (const [i, clave] of ["nombre", "peso", "cantidad", "calidad", "carga"].entries()) {
      const l = new MSLabel({
        texto: "", x: 0, y: MEDIDAS.infoPrimera + i * MEDIDAS.etiquetaAlto,
        w: MEDIDAS.equipoAncho, h: MEDIDAS.etiquetaAlto, alineacion: "center",
        color: i === 0 ? [...COLORES.resaltado] : [...COLORES.apagado],
      });
      this.panelInfo.anadir(l);
      this.info[clave] = l;
    }

    this.accion = new MSButton({
      texto: "Remove",
      x: contenedorX() + contenedorAncho() - MEDIDAS.accionAncho,
      y: MEDIDAS.contenedorY + MEDIDAS.contenedorAlto,
      w: MEDIDAS.accionAncho, h: MEDIDAS.accionAlto,
      armado: [...COLORES.rojo], desarmado: [...COLORES.blanco],
      alineacion: "east", esquema: "ID Text",
      alPulsar: () => this.hacer(),
    });
    this.raiz.anadir(this.accion);

    this.cancelar = new MSButton({
      texto: "Cancel",
      x: contenedorX() + contenedorAncho() - MEDIDAS.cancelarAncho,
      y: MEDIDAS.contenedorY - MEDIDAS.cancelarAlto,
      w: MEDIDAS.cancelarAncho, h: MEDIDAS.cancelarAlto,
      armado: [...COLORES.rojo], desarmado: [...COLORES.blanco],
      alineacion: "east", esquema: "ID Text",
      alPulsar: () => this.registro?.cerrar() ?? this.cerrar(),
    });
    this.raiz.anadir(this.cancelar);

    // ── LOS TRES BOTONES DE VISTA Y LA CASILLA ──────────────────────────
    //
    // `VGUI_InvTypePanel`, debajo del contenedor y a la izquierda del botón de
    // acción (`INVTYPE_PANEL_SIZE_X = ITEM_CONTAINER_SIZE_X - ACTBTN_SIZE_X`).
    // Los tres van en fila; la casilla, debajo del primero.
    this.vista = 0;
    this.alfabetico = false;
    this.botonesVista = [];
    for (const [i, texto] of VISTAS.entries()) {
      const b = new MSButton({
        texto,
        x: contenedorX() + MEDIDAS.vistaSepX + i * (MEDIDAS.vistaBotonAncho + MEDIDAS.vistaSepX),
        y: MEDIDAS.contenedorY + MEDIDAS.contenedorAlto + MEDIDAS.vistaY,
        w: MEDIDAS.vistaBotonAncho, h: MEDIDAS.vistaBotonAlto,
        armado: [...COLORES.rojo], desarmado: [...COLORES.blanco],
        alineacion: "center", esquema: "ID Text",
        alPulsar: () => { this.vista = i; this.refrescar(); },
      });
      this.raiz.anadir(b);
      this.botonesVista.push(b);
    }
    this.casillaAlfabetico = new MSButton({
      texto: "Alphabetic",
      x: contenedorX() + MEDIDAS.vistaSepX,
      y: MEDIDAS.contenedorY + MEDIDAS.contenedorAlto + MEDIDAS.vistaY
         + MEDIDAS.vistaBotonAlto + MEDIDAS.vistaSepY,
      w: MEDIDAS.vistaBotonAncho, h: MEDIDAS.vistaBotonAlto,
      armado: [...COLORES.rojo], desarmado: [...COLORES.blanco],
      alineacion: "west", esquema: "ID Text",
      alPulsar: () => { this.alfabetico = !this.alfabetico; this.refrescar(); },
    });
    this.raiz.anadir(this.casillaAlfabetico);

    /** Para `SlotInput` y para la sonda. */
    this.botones = [this.accion, this.cancelar, ...this.botonesVista, this.casillaAlfabetico];
  }

  /**
   * QUÉ HACE UN CLIC EN UN OBJETO. Aquí, elegirlo.
   *
   * Es un método y no una línea suelta dentro de `refrescar` porque **el panel
   * de la tienda hereda de éste** y ahí un clic no elige: compra. En el mod es
   * lo mismo, `VGUI_ItemButton` llama a `ItemClicked` del panel que lo
   * contiene y `CStoreBuyPanel` la sobreescribe para mandar `trade buy` y
   * cerrar (vgui_storebuy.cpp:68-76). El gancho es del 60, con la tienda.
   */
  alPulsarObjeto(o) {
    // Sin las órdenes del 97, elegir y nada más (lo de siempre).
    if (!this.sacar) {
      this.elegidoObjeto = o.id;
      this.refrescar();
      return;
    }
    // EL 97. `CHandler_ItemButton::mousePressed` (vgui_mscontrols.cpp:327-343):
    // es doble clic si el detector lo dice Y el objeto ya estaba elegido —el
    // primer clic lo eligió—; si no, `Clicked()` -> `Select(!m_Selected)`
    // (:519-523), o sea que un clic sobre el elegido lo DESELECCIONA.
    if (this._doble(`o:${o.id}`) && this.elegidoObjeto === o.id) {
      this.hacerDoble(o);
      return;
    }
    this.elegidoObjeto = this.elegidoObjeto === o.id ? null : o.id;
    this.refrescar();
  }

  /** `VGUI_DoubleClickDetector::Click` (vgui_mscontrols.h:388-404). */
  _doble(cosa) {
    const t = this.reloj();
    const u = this._ultimoClic;
    if (u && u.cosa === cosa && t < u.t + DOBLE_CLIC) { this._ultimoClic = null; return true; }
    this._ultimoClic = { cosa, t };
    return false;
  }

  /** `ItemDoubleclicked` (vgui_containerlist.cpp:199-221): a la mano, y se cierra. */
  hacerDoble(o) {
    const e = this.equipo?.() ?? [];
    const cual = e[this.elegidoEquipo] ?? null;
    // `if (m_GearPanel->m_Selected == 0) return;` — con las manos, nada.
    if (!cual || this.elegidoEquipo === 0) return;
    this.elegidoObjeto = null;                      // `UnSelectAllItems()`
    this.aviso = this.sacar?.(cual.id, o.id) ?? "";
    this._cerrarTrasOrden();
  }

  /** `gViewPort->HideTopMenu()`, que hacen las tres órdenes que mandan algo. */
  _cerrarTrasOrden() {
    if (this.aviso) { this.refrescar(); return; }   // si no se mandó nada, se queda abierto y lo dice
    this.registro?.cerrar() ?? this.cerrar();
  }

  /**
   * UN CLIC EN LA COLUMNA DEL EQUIPO. `CHandler_GearButton::mousePressed`
   * (vgui_container.cpp:58-71) y `GearItemClicked` (vgui_containerlist.cpp:
   * 288-327, vgui_container.cpp:232-243): con un objeto elegido, el clic lo
   * LLEVA ahí; sin objeto, o si ahí no se puede llevar, elige la entrada. Y
   * dos clics seguidos en una pieza puesta se la quitan (`GearItemDoubleClicked`,
   * vgui_containerlist.cpp:329-341).
   */
  alPulsarEquipo(i, g) {
    if (this.quitar && this._doble(`e:${g.id}`)) {
      if (!g.esContenedor) {
        this.aviso = this.quitar(g.id) ?? "";
        this._cerrarTrasOrden();
        return;
      }
    }
    if (this.llevarA && this.elegidoObjeto !== null) {
      const desdeLasManos = this.elegidoEquipo === 0;
      if (this.llevarA(g.id, this.elegidoObjeto, desdeLasManos)) {
        this.elegidoObjeto = null;
        this.refrescar();
        return;
      }
    }
    this.elegidoEquipo = i; this.elegidoObjeto = null; this.refrescar();
  }

  /** Lo que hay dentro del contenedor elegido ahora, en el orden que toque. */
  get objetos() {
    const e = this.equipo?.() ?? [];
    const cual = e[this.elegidoEquipo] ?? null;
    const lista = cual ? (this.dentro?.(cual.id) ?? []) : [];
    // `IsAlphabetical()` ordena por el nombre que se ve, no por la clave del
    // script: en pantalla «Rusty Short Sword» va antes que «Small Sack» aunque
    // sus ids sean `swords_rsword` y `pack_sack`.
    return this.alfabetico
      ? [...lista].sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)))
      : lista;
  }

  /**
   * El título y el subtítulo, que en el original son TRES estados y no uno.
   *
   *     if (!m_GearPanel->m_Selected || SelectedItems.size() > 0)
   *         "Click container to move selected item, or click again to equip"
   *         ...y el botón: oculto con las manos, «Drop Selected» si no
   *     else
   *         "Double click to use item or click Remove to unequip container.
   *          Right click to split a stack."
   *         ...y si lo elegido NO es un contenedor: "Remove wearable item"
   *                                     vgui_containerlist.cpp:135-167
   *
   * `m_Selected == 0` son **las manos**, que es la primera entrada de la
   * columna y no un «nada elegido». Por eso con las manos delante el botón de
   * acción desaparece: no hay nada que quitarse.
   *
   * Y el título es el nombre del contenedor elegido, no «Inventory» — eso sólo
   * sale si el id no resuelve (`vgui_containerlist.cpp:272-283`). Con las manos
   * pone **«Player hands»**, con hache minúscula, mientras que la columna de la
   * izquierda las llama «Player Hands». Son dos cadenas distintas en el
   * original y se copian las dos como están.
   */
  textos() {
    const e = this.equipo?.() ?? [];
    const cual = e[this.elegidoEquipo] ?? null;
    const enManos = this.elegidoEquipo === 0;
    const titulo = enManos ? "Player hands" : (cual?.nombre ?? "Inventory");
    if (enManos || this.elegidoObjeto !== null) {
      return {
        titulo,
        subtitulo: "Click container to move selected item, or click again to equip",
        accion: enManos ? null : "Drop Selected",
      };
    }
    return {
      titulo,
      subtitulo: cual?.esContenedor === false
        ? "Remove wearable item"
        : "Double click to use item or click Remove to unequip container. Right click to split a stack.",
      accion: "Remove",
    };
  }

  hacer() {
    const e = this.equipo?.() ?? [];
    const cual = e[this.elegidoEquipo] ?? null;
    // EL 97: sin objeto elegido, «Remove» es `RemoveGear` -> `remove <id>`
    // (vgui_containerlist.cpp:110-121, :170-175). Con las manos no hay botón.
    if (cual && this.elegidoObjeto === null && this.quitar && this.elegidoEquipo !== 0) {
      this.aviso = this.quitar(cual.id) ?? "";
      this._cerrarTrasOrden();
      return true;
    }
    if (!cual || this.elegidoObjeto === null) return false;
    this.aviso = this.actuar?.(cual.id, this.elegidoObjeto) ?? "";
    this.elegidoObjeto = null;
    // EL 98: «Drop Selected» es `DropAllSelected`, que acaba en `HideTopMenu`
    // (vgui_containerlist.cpp:177-186). Sólo con las órdenes del 97 puestas: la
    // tienda hereda este panel y ahí el botón no suelta nada.
    if (this.sacar) { this._cerrarTrasOrden(); return true; }
    this.refrescar();
    return true;
  }

  /**
   * `SlotInput`: los números eligen un objeto de la lista.
   *
   * En el original los números no hacen nada en este panel —`SlotInput`
   * devuelve `false`, vgui_container.cpp— y aquí sí, porque la bandera
   * `MENUFLAG_TRAPNUMINPUT` está puesta en el panel de la tienda que hereda de
   * él y no en éste. Es una añadidura nuestra y se dice: sin ella, un panel de
   * lista en el que los números no hacen nada es raro de usar con el teclado.
   */
  ranura(i) {
    if (i < 0) return false;
    const objs = this.objetos;
    if (i >= objs.length) return false;
    this.elegidoObjeto = objs[i].id;
    this.refrescar();
    return true;
  }

  /** `StepInput`: la rueda mueve la lista, que es lo que hace el original. */
  paso(cual) {
    const d = cual === RUEDA.ARRIBA ? -1 : 1;
    this.listaObjetos.scrollTop += d * 40;
  }

  abrir(ahora = 0) {
    this.elegidoObjeto = null;
    this.aviso = "";
    super.abrir(ahora);
    this.refrescar();
    return this;
  }

  refrescar() {
    const e = this.equipo?.() ?? [];
    if (this.elegidoEquipo >= e.length) this.elegidoEquipo = 0;

    // La columna del equipo.
    this.listaEquipo.replaceChildren();
    for (const [i, g] of e.entries()) {
      const fila = el("div", "vg-inv-fila");
      fila.textContent = g.nombre;
      fila.dataset.elegida = i === this.elegidoEquipo ? "si" : "no";
      // `Color_GearNonContainer`: lo que no es un contenedor se ve más apagado,
      // porque no se puede abrir.
      if (!g.esContenedor) fila.style.color = "rgb(160, 160, 160)";
      fila.dataset.id = String(g.id);
      fila.addEventListener("click", () => this.alPulsarEquipo(i, g));
      this.listaEquipo.appendChild(fila);
    }

    // El contenedor.
    const objs = this.objetos;
    this.listaObjetos.replaceChildren();
    for (const o of objs) {
      const fila = el("div", `vg-inv-fila vg-inv-${VISTAS[this.vista].toLowerCase()}`);
      fila.dataset.elegida = o.id === this.elegidoObjeto ? "si" : "no";
      // El id en el nodo, para que el panel de la tienda —que hereda de éste—
      // pueda marcar filas sin adivinar cuál es por su texto. El 60.
      fila.dataset.id = String(o.id);
      // `Item.Disabled`: en la tienda, lo que el vendedor no compra
      // (vgui_storesell.cpp:87). Aquí no lo pone nadie; lo pone la subclase.
      if (o.apagado) fila.dataset.apagada = "si";
      // «Small» es la lista sin iconos: es para lo que está, para que quepan
      // más objetos de los que caben con el icono de 128 al lado.
      if (o.icono && this.vista !== 1) {
        const img = el("img", "vg-inv-icono");
        img.src = o.icono; img.alt = "";
        fila.appendChild(img);
      }
      const t = el("span");
      // `SPEECH::ItemName(pItem, true)`: el nombre lleva la cantidad delante
      // cuando el objeto es agrupable.
      t.textContent = o.cantidad > 1 ? `${o.cantidad} ${o.nombre}` : o.nombre;
      fila.appendChild(t);
      // «Descriptions»: la misma línea que el juego enseña abajo a la izquierda
      // al señalar un objeto («The rusted metal is light and easy to swing…»),
      // aquí debajo del nombre.
      if (this.vista === 2 && o.descripcion) {
        const d = el("div", "vg-inv-desc");
        d.textContent = o.descripcion;
        fila.appendChild(d);
      }
      fila.addEventListener("click", () => this.alPulsarObjeto(o));
      this.listaObjetos.appendChild(fila);
    }
    if (!objs.length) {
      // `m_NoItems = new MSLabel(..., "No items", ...)`, vgui_mscontrols.cpp:642.
      // Decía «empty», que es nuestro. Un contenedor vacío es lo que ve un
      // personaje recién creado en sus cuatro fundas, así que es de las cadenas
      // que más se leen en el juego.
      const vacio = el("div", "vg-inv-fila vg-inv-nada");
      vacio.textContent = "No items";
      this.listaObjetos.appendChild(vacio);
    }

    // El objeto señalado.
    const sel = objs.find((o) => o.id === this.elegidoObjeto) ?? null;
    this.info.nombre.ponTexto(sel?.nombre ?? "");
    this.info.peso.ponTexto(sel ? `Weight: ${Number(sel.peso ?? 0).toFixed(2)}` : "");
    this.info.cantidad.ponTexto(sel && sel.cantidad > 1 ? `Quantity: ${sel.cantidad}` : "");
    this.info.calidad.ponTexto(sel?.calidad != null ? `Quality: ${sel.calidad}` : "");
    // El título, el subtítulo y el botón, con sus tres estados.
    const t = this.textos();
    this.titulo.ponTexto(t.titulo);
    this.accion.ponTexto(t.accion ?? "Remove");
    // `m_ActButton->setVisible(false)` con las manos: no se OCULTA a medias ni
    // se apaga, desaparece.
    this.accion.ver(t.accion !== null);
    this.accion.habilitar(Boolean(sel) || t.accion === "Remove");

    // Los tres botones de vista: el elegido se ve ARMADO, no apagado. Apagarlo
    // lo dejaría gris y sin poder pulsarse, que es lo contrario de «éste es el
    // que está puesto».
    for (const [i, b] of this.botonesVista.entries()) b.armar(i === this.vista);
    this.casillaAlfabetico.ponTexto?.(this.alfabetico ? "[x] Alphabetic" : "[ ] Alphabetic");

    const c = this.carga?.() ?? null;
    this.etiquetaOro.ponTexto(`Gold: ${this.oro?.() ?? 0}`);
    // El aviso manda sobre el texto de ayuda, y cuando no hay aviso el
    // subtítulo es el del original. El peso baja al panel de información, que
    // es donde MSR pone lo que pesa: en el subtítulo era una añadidura nuestra
    // ocupando el sitio de la línea que explica cómo se usa el panel.
    this.subtitulo.ponTexto(this.aviso || t.subtitulo);
    if (c) this.info.carga?.ponTexto(`${c.lleva.toFixed(1)} / ${c.puede} weight`);

    if (this._ancho) this.colocar(this._ancho, this._alto, this.esquema);
    return this;
  }

  colocar(ancho, alto, esquema) {
    this._ancho = ancho; this._alto = alto;
    // Todo lo que va a la derecha de la columna del equipo se mueve con ella, y
    // ella se mide con `YRES`. Así que las posiciones se rehacen aquí y no en el
    // constructor: dependen de la PROPORCIÓN de la pantalla, no sólo del ancho.
    const cx = contenedorX(ancho, alto);
    const cw = contenedorAncho(ancho, alto);
    this.titulo.pon({ x: cx });
    this.subtitulo.pon({ x: cx });
    this.panelContenedor.pon({ x: cx, w: cw });
    this.accion.pon({ x: cx + cw - MEDIDAS.accionAncho });
    this.cancelar.pon({ x: cx + cw - MEDIDAS.cancelarAncho });
    // Los de vista cuelgan de `INVTYPE_PANEL_X = ITEM_CONTAINER_X`, o sea que
    // se mueven con el contenedor igual que todo lo demás de la derecha.
    for (const [i, b] of this.botonesVista.entries()) {
      b.pon({ x: cx + MEDIDAS.vistaSepX + i * (MEDIDAS.vistaBotonAncho + MEDIDAS.vistaSepX) });
    }
    this.casillaAlfabetico.pon({ x: cx + MEDIDAS.vistaSepX });
    super.colocar(ancho, alto, esquema);
    // Las dos listas son hijas de sus paneles y ocupan lo que ellos: se les da
    // el tamaño aquí porque el `Panel` no sabe de scroll.
    for (const [lista, panel] of [[this.listaEquipo, this.panelEquipo], [this.listaObjetos, this.panelContenedor]]) {
      Object.assign(lista.style, {
        inset: "0", width: "100%", height: "100%",
        font: esquema.fuenteCss("Briefing Text"),
        color: "rgb(255, 255, 255)",
        padding: "2px 4px",
        boxSizing: "border-box",
      });
    }
    return this;
  }
}
