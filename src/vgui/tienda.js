// LA TIENDA, dibujada. `vgui_store.cpp`, `vgui_storemainwin.cpp`,
// `vgui_storebuy.cpp` y `vgui_storesell.cpp` (experimento 60).
//
// El 44 portó el catálogo y dejó escrito, en `src/play/tienda.js`, que «no
// dibuja la tienda: `Offer` abre un panel de VGUI que aquí no existe todavía».
// Existe desde el 60. El modelo —precios, ratios, existencias— ya estaba; lo
// que faltaba era la pantalla y el comercio, que está en `comprar()` y
// `vender()` del mismo archivo.
//
// ── SON TRES PANELES, no uno, y eso cambia cómo se usa ───────────────────
//
// `npcstore.offer` no abre la lista de la tienda: abre un **selector** de tres
// botones —«1. Buy», «2. Sell», «3. Cancel»— con el título «<vendedor>'s Shop»
// y una línea de descripción por botón. De ahí se va a la lista.
//
//     g_StoreText[] = {
//       "#STORE_BTN_BUY",    "#BUY",    "#STORE_DESC_BUY",
//       "#STORE_BTN_SELL",   "#SELL",   "#STORE_DESC_SELL",
//       "#STORE_BTN_CANCEL", "#CANCEL", "#STORE_DESC_CANCEL" };
//                                                  vgui_store.cpp:49-55
//
// Y los dos primeros **sólo salen si los flags los traen**:
//
//     if( !i && !(iStoreBuyFlags & STORE_BUY) ) continue;
//     else if( (i==1) && !(iStoreBuyFlags & STORE_SELL) ) continue;
//                                                  vgui_store.cpp:212-213
//
// Los flags salen del guion (`STORE_BUYMENU`, `STORE_SELLMENU` →
// `monsters/base_npc_vendor.script:132-133`), o sea que un vendedor que sólo
// compra enseña un selector con un botón y un Cancel. Los números de los
// botones vienen **en el texto** —«    1. Buy», con cuatro espacios delante—
// y no los pone el panel: están en `titles.txt:201-221`. Por eso el Cancel es
// siempre «3.» aunque el botón de vender no esté.
//
// ── Y la lista es EL PANEL DEL INVENTARIO ────────────────────────────────
//
//     class CStorePanel : public VGUI_ContainerPanel
//                                                  vgui_storemainwin.h:14
//
// El mismo panel de tres columnas del 42, con otro título y otro contenido.
// Aquí se hereda igual, de `PanelDeInventario`, porque copiarlo sería tener
// dos paneles que se separan al primer arreglo.
//
// Lo que la herencia cambia, y es poco:
//
//   comprar  una sola «bolsa» llamada «Store» con las líneas de la tienda, el
//            botón de acción oculto, y **un clic compra y cierra**.
//   vender   la bolsa es la TUYA, y lo que el vendedor no compra sale apagado.
//
// ── EL CLIC COMPRA. No elige, compra ─────────────────────────────────────
//
//     bool CStoreBuyPanel::ItemClicked(void *pData) {
//       msstring Command = msstring("trade buy ") + ItemButton.m_Data.Name + "\n";
//       ClientCmd(Command);
//       Close();
//       return true; }
//                                                  vgui_storebuy.cpp:68-76
//
// Un clic, una compra, y la ventana se cierra. Sin confirmación y sin poder
// comprar dos cosas seguidas sin volver a hablar con el vendedor. Es raro de
// usar y es lo que hace el juego: se porta.

import {
  PanelDeInventario, MEDIDAS, COLORES, contenedorX, contenedorAncho,
} from "./contenedor.js";
import { MenuBase, MEDIDAS as MENU, COLORES as COLORES_MENU, centrado } from "./menubase.js";
import { CERRAR_CON_ESC, ATRAPA_NUMEROS, ATRAPA_RUEDA } from "./registro.js";
import { MSLabel } from "./widgets.js";
import {
  COMPRAR, VENDER, tituloDeLaTienda, TEXTO_COSTE, TEXTO_VALOR, NO_VALE_NADA,
  TEXTO_VENDIENDO, SUBTITULO_COMPRAR, SUBTITULO_VENDER, SUBTITULO_INVENTARIO,
  INVENTARIO,
} from "../play/tienda.js";

export const NOMBRE_SELECTOR = "store";
export const NOMBRE_COMPRAR = "storebuy";
export const NOMBRE_VENDER = "storesell";

/**
 * Los tres botones, con su número DENTRO del texto y sus cuatro espacios.
 * `titles.txt:201-221`. La descripción lleva un `%s` que es el vendedor.
 */
export const BOTONES = [
  { texto: "    1. Buy", descripcion: (v) => `Purchase items from ${v}`, bit: COMPRAR },
  { texto: "    2. Sell", descripcion: (v) => `Sell items to ${v}`, bit: VENDER },
  { texto: "    3. Cancel", descripcion: () => "Cancel", bit: null },
];

/**
 * EL SELECTOR. `CStoreMenuPanel`.
 *
 * `flags` son los de `npcstore.offer` ya resueltos por `flagsDe()`. Con
 * `INVENTARIO` —un cofre, un saco— el selector **no sale**: el motor abre
 * directamente la lista, porque no hay nada que elegir. Lo decide quien lo
 * abre, no este panel.
 */
export class MenuDeTienda extends MenuBase {
  /**
   * @param alElegir `(cual) => void`, con `cual` en «comprar», «vender» o
   *                  `null` para cancelar.
   */
  constructor({ esquema, alElegir }) {
    super({
      nombre: NOMBRE_SELECTOR, esquema, titulo: "Shop",
      // `SetBits(m_Flags, MENUFLAG_TRAPNUMINPUT)`, vgui_store.cpp:197. El
      // Escape se añade por lo mismo que en los otros: en un navegador no hay
      // consola a la que caer si un panel se queda pegado.
      banderas: ATRAPA_NUMEROS | CERRAR_CON_ESC,
    });
    this.alElegir = alElegir;
    this.vendedor = "";
    this.flags = COMPRAR;
    /** Qué botón es cada ranura AHORA, que depende de los flags. */
    this.visibles = [];

    for (const [i, b] of BOTONES.entries()) {
      const boton = this.anadirBoton(b.texto, i);
      boton.ver(false);
    }
    // La línea de descripción, que en el original es un `TextPanel` por botón
    // dentro de un panel de información a la derecha. Aquí es UNA que cambia
    // con el botón señalado, y se dice que es una simplificación: los tres
    // paneles del original sólo se distinguen por su texto.
    this.descripcion = new MSLabel({
      texto: "", x: 0, y: MENU.altoVentana - 28, w: MENU.anchoVentana, h: 20,
      alineacion: "center", color: [...COLORES_MENU.apagado],
    });
    this.ventana.anadir(this.descripcion);
  }

  /** `Update()`: el título y qué botones salen. */
  poner(vendedor, flags = COMPRAR) {
    this.vendedor = String(vendedor ?? "");
    this.flags = flags;
    this.titulo.ponTexto(tituloDeLaTienda(this.vendedor, flags));
    this.visibles = [];
    for (const [i, b] of BOTONES.entries()) {
      // El Cancel (bit `null`) sale siempre; los otros dos, sólo con su bit.
      const sale = b.bit === null || (flags & b.bit) !== 0;
      this.botones[i].ver(sale);
      if (sale) this.visibles.push(i);
    }
    this.descripcion.ponTexto(BOTONES[this.visibles[0] ?? 2].descripcion(this.vendedor));
    return this;
  }

  /**
   * `SlotInput(iSlot)`: los números pulsan el botón de ESA ranura, y
   * `if (!m_pButtons[iSlot]->isVisible()) return false` (vgui_store.cpp:230).
   *
   * O sea que el número es el del botón en la tabla, no el del que se ve: con
   * la venta apagada, el **2** no hace nada y el **3** cancela. Es lo que dice
   * el texto de los botones, que trae el número escrito.
   */
  ranura(i) {
    if (i < 0 || i >= BOTONES.length) return false;
    if (!this.visibles.includes(i)) return false;
    this.elegirBoton(i);
    return true;
  }

  /**
   * `Select(BtnIdx, Data)`, que es lo que `MenuBase.anadirBoton` engancha al
   * clic. Se llama `elegir` porque así se llama en los otros menús; el
   * parámetro del constructor es `alElegir` para que no se pisen.
   */
  elegir(i) {
    const cual = i === 0 ? "comprar" : i === 1 ? "vender" : null;
    // SE CIERRA PRIMERO Y SE ABRE DESPUÉS, y ese orden importa.
    //
    // `CMenuPanel::Select` manda la orden y luego esconde el menú, igual que
    // el de interacción; el original se libra porque la lista llega del
    // servidor en otro mensaje. Aquí los dos pasan en la misma pila, así que
    // abrir antes de cerrar significa que el `cerrar()` se lleva por delante
    // la lista que se acaba de abrir. Se vio en `sonda:tienda60`: el selector
    // salía bien y «1. Buy» no abría nada.
    if (this.registro) this.registro.cerrar(); else this.cerrar();
    this.alElegir?.(cual);
    return cual;
  }

  elegirBoton(i) { return this.elegir(i); }
}

/**
 * LA LISTA. `CStorePanel` y sus dos hijas.
 *
 * `modo` es «comprar» o «vender». Las dos usan el panel del inventario entero
 * y se diferencian en cuatro cosas, que son las cuatro que el mod cambia:
 * el subtítulo, el botón de acción, qué bolsa se enseña y qué hace un clic.
 */
export class PanelDeTienda extends PanelDeInventario {
  /**
   * @param lineas   `() => [{id, nombre, cantidad, precio, ratio, icono, ...}]`
   *                 lo que el vendedor tiene. En «vender» se usa para saber
   *                 QUÉ le interesa, no para enseñarlo.
   * @param mios     `() => [...]` los objetos del jugador. Sólo en «vender».
   * @param comprar  `(id) => void`
   * @param venderTodo `(ids) => void`
   */
  constructor({
    esquema, modo = "comprar", lineas = () => [], mios = () => [],
    comprar = () => {}, venderTodo = () => {}, oro = () => 0, vendedor = () => "",
    flags = () => COMPRAR,
  }) {
    super({
      esquema,
      // La bolsa: en «comprar» es una sola y se llama «Store»
      // (`GearItem.Name = "Store"`, vgui_storebuy.cpp:37); en «vender» es la
      // del jugador, porque lo que se enseña es lo tuyo.
      equipo: () => (modo === "comprar"
        ? [{ id: "store", nombre: "Store", esContenedor: true }]
        : [{ id: "yo", nombre: "Player Hands", esContenedor: true }]),
      dentro: () => (modo === "comprar" ? this.paraComprar() : this.paraVender()),
      oro,
    });
    this.nombre = modo === "comprar" ? NOMBRE_COMPRAR : NOMBRE_VENDER;
    this.modo = modo;
    this.lineas = lineas; this.mios = mios;
    this.comprarUno = comprar; this.venderTodo = venderTodo;
    this.vendedor = vendedor; this.flags = flags;
    /** Lo marcado para vender. En «comprar» no se usa: un clic compra. */
    this.marcados = new Set();

    // La etiqueta de abajo, que sólo existe en la tienda: «Selling 0 Items
    // (0 Gold)» es el texto con el que nace (vgui_storemainwin.cpp:56) y en
    // cuanto marcas algo pasa al otro formato, «Selling N items for G gold»
    // (vgui_storesell.cpp:130). Son dos cadenas distintas y se copian las dos.
    this.etiquetaVenta = new MSLabel({
      texto: "Selling 0 Items (0 Gold)",
      x: contenedorX(), y: MEDIDAS.contenedorY + MEDIDAS.contenedorAlto,
      w: contenedorAncho() - MEDIDAS.accionAncho, h: 30,
      esquema: "Title Font", color: [...COLORES.subtitulo],
    });
    this.raiz.anadir(this.etiquetaVenta);

    // Y la línea del precio dentro del panel de información: `m_SaleText`.
    // Va la última de las del original —debajo de calidad— y por delante de
    // la de carga, que es nuestra.
    this.precioTexto = new MSLabel({
      texto: "", x: 0, y: MEDIDAS.infoPrimera + 5 * MEDIDAS.etiquetaAlto,
      w: MEDIDAS.equipoAncho, h: MEDIDAS.etiquetaAlto, alineacion: "center",
      color: [...COLORES.oro],
    });
    this.panelInfo.anadir(this.precioTexto);

    // Comprar: ni botón de acción ni etiqueta de venta.
    //   m_ActButton->setVisible(false); m_SaleLabel->setVisible(false);
    //                                        vgui_storebuy.cpp:29-30
    if (modo === "comprar") {
      this.accion.ver(false);
      this.etiquetaVenta.ver(false);
    } else {
      this.accion.ponTexto("Sell");
      this.accion.alPulsar = () => this.venderLoMarcado();
    }
    // Y el Cancel de la tienda no es «Cancel», es «Close», porque manda
    // `trade stop`: cierra el trato, no una elección.
    //   m_pCancelButton->setText(Localized("#CLOSE"));  vgui_storemainwin.cpp:60
    this.cancelar.ponTexto("Close");
  }

  /** Las líneas con existencias. `if (StoreItems[i].Quantity > 0)`, :46. */
  paraComprar() {
    return (this.lineas?.() ?? []).filter((l) => (l.cantidad ?? 0) > 0);
  }

  /**
   * Lo tuyo, con lo que el vendedor no quiere marcado como apagado.
   *
   *     Item.Disabled = !InterestedInItem(Item.Name);
   *                                        vgui_storesell.cpp:87
   *
   * «Le interesa» es literalmente «lo tiene en su tienda»: no hay más regla.
   */
  paraVender() {
    const suyas = new Set((this.lineas?.() ?? []).map((l) => l.id));
    return (this.mios?.() ?? []).map((o) => ({ ...o, apagado: !suyas.has(o.id) }));
  }

  /** El precio de una línea, para el panel de información. */
  precioDe(id) {
    const l = (this.lineas?.() ?? []).find((x) => x.id === id) ?? null;
    if (!l) return null;
    return this.modo === "comprar" ? l.precio : Math.trunc(l.precio * l.ratio);
  }

  /**
   * El clic. Comprar compra y cierra; vender marca y desmarca.
   *
   * Un objeto apagado no se puede marcar: en el original el botón está
   * `Disabled` y no dispara nada.
   */
  alPulsarObjeto(o) {
    if (this.modo === "comprar") {
      this.comprarUno?.(o.id);
      // `Close()` — vgui_storebuy.cpp:74. Una compra por visita.
      if (this.registro) this.registro.cerrar(); else this.cerrar();
      return;
    }
    if (o.apagado) return;
    if (this.marcados.has(o.id)) this.marcados.delete(o.id);
    else this.marcados.add(o.id);
    this.elegidoObjeto = o.id;
    this.refrescar();
  }

  /** `SellAll()`: un solo `trade sell` con todos los ids. :148-165. */
  venderLoMarcado() {
    // «If no items selected» el comando es `trade stop`, o sea que el botón
    // Sell sin nada marcado **cierra la tienda**. vgui_storesell.cpp:150.
    if (!this.marcados.size) {
      if (this.registro) this.registro.cerrar(); else this.cerrar();
      return false;
    }
    this.venderTodo?.([...this.marcados]);
    this.marcados.clear();
    this.refrescar();
    return true;
  }

  /** El título y el subtítulo de la tienda, que no son los del inventario. */
  textos() {
    const f = this.flags?.() ?? COMPRAR;
    const titulo = tituloDeLaTienda(this.vendedor?.() ?? "", f);
    if (this.modo === "vender") return { titulo, subtitulo: SUBTITULO_VENDER, accion: "Sell" };
    // Comprar y «tomar de un saco» comparten panel y cambian de subtítulo.
    //   if (FBitSet(iStoreBuyFlags, STORE_INV)) Text_InvSubtitle
    //   else                                    Text_BuySubtitle
    //                                        vgui_storebuy.cpp:60-63
    return {
      titulo,
      subtitulo: (f & INVENTARIO) ? SUBTITULO_INVENTARIO : SUBTITULO_COMPRAR,
      accion: null,
    };
  }

  abrir(ahora = 0) {
    this.marcados.clear();
    return super.abrir(ahora);
  }

  refrescar() {
    super.refrescar();
    // El precio del señalado. En «vender», un objeto que no le interesa dice
    // «Worthless» y no un precio de cero: son dos cosas distintas y el
    // original tiene una cadena para cada una.
    const p = this.elegidoObjeto == null ? null : this.precioDe(this.elegidoObjeto);
    if (this.elegidoObjeto == null) this.precioTexto.ponTexto("");
    else if (p == null) this.precioTexto.ponTexto(this.modo === "vender" ? NO_VALE_NADA : "");
    else this.precioTexto.ponTexto(this.modo === "comprar" ? TEXTO_COSTE(p) : TEXTO_VALOR(p));

    if (this.modo === "vender") {
      let total = 0;
      for (const id of this.marcados) total += this.precioDe(id) ?? 0;
      this.etiquetaVenta.ponTexto(TEXTO_VENDIENDO(this.marcados.size, total));
      // Lo marcado se ve marcado: el original lo pinta con el botón hundido.
      // Se busca por el `data-id` que pone `PanelDeInventario`, no por el
      // texto de la fila: dos objetos pueden llamarse igual.
      for (const fila of this.listaObjetos.children) {
        fila.dataset.marcada = this.marcados.has(fila.dataset.id) ? "si" : "no";
      }
    }
    return this;
  }

  colocar(ancho, alto, esquema) {
    super.colocar(ancho, alto, esquema);
    this.etiquetaVenta.pon({
      x: contenedorX(ancho, alto),
      w: contenedorAncho(ancho, alto) - MEDIDAS.accionAncho,
    });
    return this;
  }
}

/** Lo poco que la tienda añade al CSS del inventario, del que hereda. */
export const CSS = `
.vg-inv-fila[data-marcada="si"] { background: rgba(255, 0, 0, 0.25); }
.vg-inv-fila[data-apagada="si"] { color: rgb(100, 100, 100); cursor: default; }
.vg-inv-fila[data-apagada="si"]:hover { background: none; }
`;
