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
};

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
`;

/**
 * El panel del inventario.
 *
 * @param equipo     `() => [{id, nombre, esContenedor}]`, lo que llevas puesto
 * @param dentro     `(idEquipo) => [{id, nombre, peso, cantidad, calidad, icono}]`
 * @param actuar     `(idEquipo, idObjeto) => string|null`, y devuelve el aviso
 * @param oro        `() => number`
 * @param carga      `() => ({lleva, puede})`, el peso y el `Volume()`
 */
export class PanelDeInventario extends PanelConNombre {
  constructor({ esquema, equipo, dentro, actuar = () => null, oro = () => 0, carga = () => null }) {
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
    for (const [i, clave] of ["nombre", "peso", "cantidad", "calidad"].entries()) {
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

    /** Para `SlotInput` y para la sonda. */
    this.botones = [this.accion, this.cancelar];
  }

  /** Lo que hay dentro del contenedor elegido ahora. */
  get objetos() {
    const e = this.equipo?.() ?? [];
    const cual = e[this.elegidoEquipo] ?? null;
    return cual ? (this.dentro?.(cual.id) ?? []) : [];
  }

  hacer() {
    const e = this.equipo?.() ?? [];
    const cual = e[this.elegidoEquipo] ?? null;
    if (!cual || this.elegidoObjeto === null) return false;
    this.aviso = this.actuar?.(cual.id, this.elegidoObjeto) ?? "";
    this.elegidoObjeto = null;
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
      fila.addEventListener("click", () => {
        this.elegidoEquipo = i; this.elegidoObjeto = null; this.refrescar();
      });
      this.listaEquipo.appendChild(fila);
    }

    // El contenedor.
    const objs = this.objetos;
    this.listaObjetos.replaceChildren();
    for (const o of objs) {
      const fila = el("div", "vg-inv-fila");
      fila.dataset.elegida = o.id === this.elegidoObjeto ? "si" : "no";
      if (o.icono) {
        const img = el("img", "vg-inv-icono");
        img.src = o.icono; img.alt = "";
        fila.appendChild(img);
      }
      const t = el("span");
      // `SPEECH::ItemName(pItem, true)`: el nombre lleva la cantidad delante
      // cuando el objeto es agrupable.
      t.textContent = o.cantidad > 1 ? `${o.cantidad} ${o.nombre}` : o.nombre;
      fila.appendChild(t);
      fila.addEventListener("click", () => { this.elegidoObjeto = o.id; this.refrescar(); });
      this.listaObjetos.appendChild(fila);
    }
    if (!objs.length) {
      const vacio = el("div", "vg-inv-fila vg-inv-nada");
      vacio.textContent = "empty";
      this.listaObjetos.appendChild(vacio);
    }

    // El objeto señalado.
    const sel = objs.find((o) => o.id === this.elegidoObjeto) ?? null;
    this.info.nombre.ponTexto(sel?.nombre ?? "");
    this.info.peso.ponTexto(sel ? `Weight: ${Number(sel.peso ?? 0).toFixed(2)}` : "");
    this.info.cantidad.ponTexto(sel && sel.cantidad > 1 ? `Quantity: ${sel.cantidad}` : "");
    this.info.calidad.ponTexto(sel?.calidad != null ? `Quality: ${sel.calidad}` : "");
    this.accion.habilitar(Boolean(sel));

    const c = this.carga?.() ?? null;
    this.etiquetaOro.ponTexto(`Gold: ${this.oro?.() ?? 0}`);
    this.subtitulo.ponTexto(this.aviso
      || (c ? `${c.lleva.toFixed(1)} / ${c.puede} weight` : ""));

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
