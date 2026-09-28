// CREAR PERSONAJE: `CNewCharacterPanel`, de `vgui_choosecharacter.cpp`.
//
// Son **tres etapas** y no una pantalla, y eso es lo primero que se pierde al
// hacerlo a ojo:
//
//     enum stage_e { STG_CHOOSECHAR, STG_CHOOSEGENDER, STG_CHOOSEWEAPON };
//                                     vgui_choosecharacter.h:15-21
//
//   1. **elegir**   tres ranuras con su personaje, su nombre, dónde está y un
//                   botón de borrar. Una ranura vacía dice «Create».
//   2. **quién**    el nombre escrito y hombre o mujer, con los dos modelos.
//   3. **con qué**  hasta nueve armas en una rejilla de tres, con su icono.
//
// Y lo que hace que sea la pantalla de Master Sword y no una lista: **los
// personajes son modelos**, no retratos dibujados.
//
//     class CRenderChar : public CRenderPlayer
//     enum rendercharstate_e { RCS_IDLE, RCS_FIDGET, RCS_HIGHLIGHT, RCS_INACTIVE }
//                                     vgui_choosecharacter.h:29-58
//
// Eso ya estaba hecho desde el experimento 14 y se reutiliza tal cual:
// `src/render/retratos.js`.
//
// ── DOS FALLOS DE MEDIDA QUE SE MULTIPLICAN ENTRE SÍ ───────────────────────
//
// **El primero** es el espaciador de las tres ranuras:
//
//     #define CHOOSE_BTNSPACERX  XRES(16) * XRES(1)
//                                     vgui_choosecharacter.cpp:370
//
// `XRES` ya convierte a píxeles de pantalla, así que multiplicar dos `XRES`
// convierte **dos veces**. A 640 da 16 × 1 = 16 y no se nota. A 1920 da
// 48 × 3 = **144** donde tocaban 48: el hueco entre personajes es el triple.
//
// **El segundo** es la función de centrar, que ya se portó en `menubase.js` con
// su `−1` fuera del paréntesis. La rejilla de armas la usa **con el espaciador
// roto de arriba**:
//
//     StartX = GetCenteredItemX(m_ChoosePanel->getWide(), WEAPON_BTN_SIZEX, 3,
//                               CHOOSE_BTNSPACERX);
//                                     vgui_choosecharacter.cpp:594
//
// Los dos se suman en la misma resta, y la cuenta sale exacta:
// `1,5 × espaciadorRoto − espaciadorBueno − 1`. A 640 son **7 píxeles** a la
// izquierda y nadie lo ha visto nunca; **a 1920 son 167**, o sea que la rejilla
// de armas se va casi media columna. Los dos se portan con el fallo y hay una
// prueba que mide los 167 píxeles.
//
// ── Y los botones de arma no escalan ───────────────────────────────────────
//
//     #define WEAPON_BTN_SIZEX  128        // sin XRES
//     #define WEAPON_BTN_SIZEY  128
//                                     vgui_choosecharacter.cpp:384-385
//
// Son 128 píxeles de verdad a cualquier resolución, porque son imágenes de
// 128×128 y estirarlas las emborrona. Es de las pocas medidas del panel que no
// pasan por `XRES`, y es una decisión, no un olvido.

import { Panel, MSLabel, MSButton, medirTexto } from "./widgets.js";
import { PanelConNombre, ATRAPA_NUMEROS, CERRAR_CON_ESC } from "./registro.js";
import { centradoConFallo } from "./menubase.js";
import { XRES, YRES } from "../play/hud.js";

export const NOMBRE = "newchar";

/** Las tres etapas, en su orden. */
export const ETAPA = { ELEGIR: 0, QUIEN: 1, ARMA: 2 };

/** Cuántas ranuras de personaje hay. `CHOOSEPANEL_MAINBTNS 3`. */
export const RANURAS = 3;
/** `WEAPONPANEL_MAINBTNMAX 9`: «Max of 9 starting weapon choices». */
export const MAX_ARMAS = 9;
/** `Gender_NameTextPanel->m_MaxLetters = 32`. */
export const MAX_LETRAS = 32;

/** Las medidas, en la pantalla de referencia de 640×480. */
export const MEDIDAS = {
  ventanaY: 80, ventanaAlto: 320,
  tituloAlto: 80,
  elegirY: 15, elegirAlto: 270,
  etiquetaAlto: 12,
  manejoY: 16, manejoAlto: 28,
  ranuraAncho: 110, ranuraAlto: 130,
  ranuraY: 44,                       // CHOOSE_BTNY + CHOOSE_CHARHANDLING_H
  nombreAlto: 13,
  borrarAncho: 36, borrarAlto: 10,
  borrarY: 44 + 130 + 10 + 21 - 44,  // relativo a la ranura
  generoBotonY: 40,
  nombreX: 75, nombreY: 5, campoAncho: 120, campoAlto: 20,
  aceptarX: 220, aceptarAncho: 100, aceptarAlto: 20,
  generoEtiquetaY: 30,
  armaY: 26, armaEtiquetaX: 120,
  armaSeparacionY: 31,               // WEAPON_BTNLABEL_SPACERY + YRES(21)
  atrasX: 80, atrasY: 360, atrasAncho: 60, atrasAlto: 20,
};

/** Los colores, de `vgui_choosecharacter.cpp:88-91`. «Hightlight» está así. */
export const COLORES = {
  disponible: [0, 255, 0, 0],        // EnabledColor — el verde de un personaje
  apagado: [128, 128, 128, 80],      // DisabledColor
  nuevo: [255, 255, 255, 0],         // NewCharColor
  info: [192, 192, 192, 128],        // InfoColor
  resaltado: [255, 0, 0, 0],         // HightlightColor (sic)
};

/** El botón de arma, que NO escala: 128 píxeles de verdad. */
export const ARMA_PX = 128;

/**
 * El espaciador de las ranuras, **con el fallo**, en unidades de referencia.
 *
 * `XRES(16) * XRES(1)` da píxeles de pantalla; aquí se devuelve en unidades de
 * 640 para que el resto del panel siga midiéndose igual. `XRES(1, ancho)` es el
 * factor de más que el motor no quería.
 */
export function espaciador(ancho) {
  return 16 * XRES(1, ancho);
}

/**
 * Dónde empieza la rejilla de armas, con los DOS fallos puestos.
 *
 * @returns píxeles de pantalla, porque el botón de arma tampoco escala.
 */
export function inicioDeArmas(anchoPanel, ancho) {
  return centradoConFallo(anchoPanel, ARMA_PX, 3, XRES(16, ancho) * XRES(1, ancho));
}

/** Lo mismo sin los fallos, que existe SÓLO para poder medir la diferencia. */
export function inicioDeArmasSano(anchoPanel, ancho) {
  const s = XRES(16, ancho);
  return Math.trunc(anchoPanel / 2 - (ARMA_PX / 2 * 3 + s * 2 / 2));
}

const el = (tag, clase = "") => {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  return n;
};

export const CSS = `
.vg-char { color: #fff; }
.vg-char-ranura { position: absolute; box-sizing: border-box; }
.vg-char-retrato { position: absolute; inset: 0; width: 100%; height: 100%; }
.vg-char-campo { position: absolute; box-sizing: border-box; background: rgba(0,0,0,0.6);
  border: 1px solid rgba(255,255,255,0.35); color: #fff; font: inherit; padding: 0 4px; }
.vg-char-campo:focus { outline: none; border-color: #ffaa00; }
.vg-char-icono { position: absolute; image-rendering: pixelated; pointer-events: none; }
`;

export class PanelDePersonaje extends PanelConNombre {
  /**
   * @param listar    `() => [{id, nombre, mapa, nivel}]`, las ranuras ocupadas
   * @param crear     `({nombre, genero, arma}) => void`
   * @param jugar     `(id) => void`
   * @param borrar    `(id) => void`
   * @param armas     `[{id, nombre, habilidad, icono}]`, de `reg.newchar.weaponlist`
   * @param retratos  `Retratos` de `src/render/retratos.js`, o `null`
   */
  constructor({ esquema, listar, crear, jugar, borrar, armas = [], retratos = null,
                nombrePropuesto = "" }) {
    super({
      nombre: NOMBRE,
      // `SetBits(m_Flags, MENUFLAG_TRAPNUMINPUT)` — vgui_choosecharacter.cpp:409.
      // El Escape NO está en el original: de esta pantalla no se sale, porque
      // sin personaje no hay juego. Aquí tampoco se añade, y es la única de los
      // cuatro paneles en la que eso se respeta tal cual.
      banderas: ATRAPA_NUMEROS,
    });
    this.esquema = esquema;
    this.listar = listar; this.crear = crear; this.jugar = jugar; this.borrar = borrar;
    this.armas = armas;
    this.retratos = retratos;

    /**
     * TODOS los botones del panel, en una lista.
     *
     * `MenuBase` la tiene porque sus botones son una fila; aquí son cinco
     * grupos repartidos por tres etapas, y aun así hace falta la lista: es lo
     * que mira `SlotInput` para saber si un botón está apagado, y es por donde
     * la sonda ve lo que hay en pantalla. Sin ella `probe.vgui.botones()`
     * devolvía una lista vacía y tres controles salían en rojo por eso.
     */
    this.botones = [];

    this.etapa = ETAPA.ELEGIR;
    // EL NOMBRE VIENE PUESTO, y viene del cvar `name`:
    //
    //     Gender_Name = gEngfuncs.pfnGetCvarString("name");
    //                                 vgui_choosecharacter.cpp:411
    //     Gender_NameTextPanel->SetText( Gender_Name );            :545
    //
    // O sea que el cuadro «Player name» de «Options» no es decorativo: es lo
    // que te propone esta pantalla. Aquí arrancaba vacío.
    this.nuevo = { nombre: String(nombrePropuesto ?? ""), genero: "male", arma: armas[0]?.id ?? null };
    this.ranuraElegida = null;

    this.raiz = new Panel({ x: 0, y: 0, w: 640, h: 480, transparencia: 255, clase: "vg-char" });

    // `CTransparentPanel(255, MAINWINDOW_X, MAINWINDOW_Y, getWide(), MAINWINDOW_SIZE_Y)`
    // — transparencia 255, o sea SIN fondo. La pantalla de personajes de Master
    // Sword no tiene panel: es texto y figuras sobre el mapa.
    this.ventana = new Panel({
      x: 0, y: MEDIDAS.ventanaY, w: 640, h: MEDIDAS.ventanaAlto,
      transparencia: 255, clase: "vg-char-ventana",
    });
    this.raiz.anadir(this.ventana);

    this.titulo = new MSLabel({
      texto: "", x: 0, y: 0, w: 640, h: MEDIDAS.tituloAlto,
      alineacion: "center", esquema: "Title Font", color: [...COLORES.nuevo],
    });
    this.raiz.anadir(this.titulo);

    this.etiqueta = new MSLabel({
      texto: "", x: 0, y: MEDIDAS.elegirY, w: 640, h: MEDIDAS.etiquetaAlto,
      alineacion: "center", color: [255, 255, 255, 0],
    });
    this.ventana.anadir(this.etiqueta);

    this.manejo = new MSLabel({
      texto: "", x: 0, y: MEDIDAS.elegirY + MEDIDAS.manejoY, w: 640, h: MEDIDAS.manejoAlto,
      alineacion: "north", color: [...COLORES.info],
    });
    this.ventana.anadir(this.manejo);

    // ── etapa 1: las tres ranuras ────────────────────────────────────────
    this.ranuras = [];
    for (let i = 0; i < RANURAS; i++) {
      const caja = new Panel({ w: MEDIDAS.ranuraAncho, h: MEDIDAS.ranuraAlto, clase: "vg-char-ranura" });
      const boton = new MSButton({
        texto: "Create", w: MEDIDAS.ranuraAncho, h: MEDIDAS.ranuraAlto,
        armado: [...COLORES.nuevo], desarmado: [...COLORES.nuevo], apagado: [...COLORES.apagado],
        alineacion: "center", esquema: "ID Text",
        alPulsar: () => this.elegirRanura(i),
      });
      const linea1 = new MSLabel({ texto: "", w: MEDIDAS.ranuraAncho, h: MEDIDAS.nombreAlto, alineacion: "center" });
      const linea2 = new MSLabel({ texto: "", w: MEDIDAS.ranuraAncho, h: MEDIDAS.nombreAlto, alineacion: "center" });
      const borrar = new MSButton({
        texto: "Delete", w: MEDIDAS.borrarAncho, h: MEDIDAS.borrarAlto,
        armado: [...COLORES.resaltado], desarmado: [...COLORES.info], apagado: [...COLORES.apagado],
        alineacion: "center", alPulsar: () => this.pedirBorrar(i),
      });
      this.ventana.anadir(caja);
      this.ventana.anadir(boton); this.botones.push(boton);
      this.ventana.anadir(linea1);
      this.ventana.anadir(linea2);
      this.ventana.anadir(borrar); this.botones.push(borrar);
      this.ranuras.push({ caja, boton, linea1, linea2, borrar, lienzo: null, quien: null });
    }

    // ── etapa 2: el nombre y el género ───────────────────────────────────
    this.nombreEtiqueta = new MSLabel({
      texto: "Name:", x: MEDIDAS.nombreX, y: MEDIDAS.nombreY, w: 40, h: 14,
      esquema: "ID Text", color: [...COLORES.nuevo],
    });
    this.ventana.anadir(this.nombreEtiqueta);

    // `VGUI_TextPanel` con `m_MaxLetters = 32`. Un `input` de verdad: escribir
    // un nombre es lo único de estos cuatro paneles que el navegador hace mejor
    // que nosotros, y fingirlo con un `div` y un cursor pintado sería inventar.
    this.campo = el("input", "vg-char-campo");
    this.campo.maxLength = MAX_LETRAS;
    this.campo.spellcheck = false;
    this.campo.addEventListener("input", () => { this.nuevo.nombre = this.campo.value; this.refrescar(); });
    this.campo.addEventListener("keydown", (e) => {
      // Las teclas del campo son del campo, no del juego: sin esto, escribir
      // «Ana» con el panel abierto dispara la ranura 1 al teclear cualquier
      // número, y la `i` abre el inventario.
      e.stopPropagation();
      if (e.code === "Enter" && this.puedeSeguir()) this.irA(ETAPA.ARMA);
    });
    this.ventana.nodo.appendChild(this.campo);

    this.aceptar = new MSButton({
      texto: "Submit Name", x: MEDIDAS.aceptarX, y: MEDIDAS.nombreY - 2,
      w: MEDIDAS.aceptarAncho, h: MEDIDAS.aceptarAlto,
      armado: [...COLORES.nuevo], desarmado: [...COLORES.info], apagado: [...COLORES.apagado],
      alineacion: "center", alPulsar: () => { if (this.puedeSeguir()) this.irA(ETAPA.ARMA); },
    });
    this.ventana.anadir(this.aceptar); this.botones.push(this.aceptar);

    this.generoEtiqueta = new MSLabel({
      texto: "Gender:", x: MEDIDAS.nombreX, y: MEDIDAS.generoEtiquetaY, w: 60, h: 14,
      color: [...COLORES.nuevo],
    });
    this.ventana.anadir(this.generoEtiqueta);

    this.generos = [];
    for (const [i, [clave, texto]] of [["male", "Male"], ["female", "Female"]].entries()) {
      const caja = new Panel({ w: MEDIDAS.ranuraAncho, h: MEDIDAS.ranuraAlto, clase: "vg-char-ranura" });
      const boton = new MSButton({
        texto, w: MEDIDAS.ranuraAncho, h: MEDIDAS.ranuraAlto,
        armado: [...COLORES.nuevo], desarmado: [...COLORES.info], apagado: [...COLORES.apagado],
        alineacion: "south", alPulsar: () => { this.nuevo.genero = clave; this.refrescar(); },
      });
      this.ventana.anadir(caja);
      this.ventana.anadir(boton); this.botones.push(boton);
      this.generos.push({ clave, caja, boton, lienzo: null, i });
    }

    // ── etapa 3: las armas ───────────────────────────────────────────────
    this.botonesDeArma = [];
    for (const [i, a] of this.armas.slice(0, MAX_ARMAS).entries()) {
      const icono = el("img", "vg-char-icono");
      icono.alt = "";
      if (a.icono) icono.src = a.icono;
      else icono.hidden = true;                 // las cinco sin `trade`
      this.ventana.nodo.appendChild(icono);
      const boton = new MSButton({
        texto: "", armado: [...COLORES.nuevo], desarmado: [...COLORES.info],
        apagado: [...COLORES.apagado], alineacion: "center",
        alPulsar: () => this.elegirArma(a.id),
      });
      const nombre = new MSLabel({ texto: a.nombre ?? a.id, h: MEDIDAS.nombreAlto, alineacion: "center", color: [...COLORES.nuevo] });
      this.ventana.anadir(boton); this.botones.push(boton);
      this.ventana.anadir(nombre);
      this.botonesDeArma.push({ arma: a, boton, nombre, icono, i });
    }

    this.atras = new MSButton({
      texto: "Back", x: MEDIDAS.atrasX, y: MEDIDAS.atrasY - MEDIDAS.ventanaY,
      w: MEDIDAS.atrasAncho, h: MEDIDAS.atrasAlto,
      armado: [...COLORES.nuevo], desarmado: [...COLORES.info], apagado: [...COLORES.apagado],
      alineacion: "center", alPulsar: () => this.atrasDeEtapa(),
    });
    this.ventana.anadir(this.atras); this.botones.push(this.atras);
  }

  /** ¿El nombre vale? El original no deja pasar sin uno. */
  puedeSeguir() { return this.nuevo.nombre.trim().length > 0; }

  irA(etapa) { this.etapa = etapa; this.refrescar(); return this; }

  /**
   * El nombre que propone la pantalla, cuando cambia el cvar.
   *
   * En el mod el cvar se lee UNA vez, al construir el panel
   * (`vgui_choosecharacter.cpp:411`), así que el que está escribiendo su nombre
   * no ve cómo se lo cambian por debajo: si la etapa es la del nombre, esto no
   * toca nada. Aplicar «Options» con la pantalla delante no borra lo tecleado.
   */
  proponerNombre(nombre) {
    if (this.etapa === ETAPA.QUIEN) return this;
    this.nuevo.nombre = String(nombre ?? "");
    this.refrescar();
    return this;
  }

  atrasDeEtapa() {
    if (this.etapa === ETAPA.ELEGIR) return this;
    return this.irA(this.etapa - 1);
  }

  elegirRanura(i) {
    const quien = this.ranuras[i]?.quien ?? null;
    this.ranuraElegida = i;
    // Una ranura con personaje se JUEGA; una vacía empieza a crear uno.
    if (quien) { this.jugar?.(quien.id); return this; }
    this.nuevo = { nombre: "", genero: "male", arma: this.armas[0]?.id ?? null };
    return this.irA(ETAPA.QUIEN);
  }

  pedirBorrar(i) {
    const quien = this.ranuras[i]?.quien;
    if (quien) this.borrar?.(quien.id);
    return this.refrescar();
  }

  elegirArma(id) {
    this.nuevo.arma = id;
    this.crear?.({ ...this.nuevo, nombre: this.nuevo.nombre.trim() });
    return this;
  }

  /** `SlotInput`: los números eligen ranura en la primera etapa, arma en la tercera. */
  ranura(i) {
    if (i < 0) return false;
    if (this.etapa === ETAPA.ELEGIR) {
      if (i >= RANURAS) return false;
      this.elegirRanura(i);
      return true;
    }
    if (this.etapa === ETAPA.ARMA) {
      const b = this.botonesDeArma[i];
      if (!b) return false;
      this.elegirArma(b.arma.id);
      return true;
    }
    return false;
  }

  abrir(ahora = 0) {
    this.etapa = ETAPA.ELEGIR;
    super.abrir(ahora);
    this.refrescar();
    return this;
  }

  cerrar() { this.retratos?.soltar(); return super.cerrar(); }

  /** `Update()`: qué se ve en cada etapa. */
  refrescar() {
    const lista = this.listar?.() ?? [];
    for (const [i, r] of this.ranuras.entries()) r.quien = lista[i] ?? null;

    const enElegir = this.etapa === ETAPA.ELEGIR;
    const enQuien = this.etapa === ETAPA.QUIEN;
    const enArma = this.etapa === ETAPA.ARMA;

    this.titulo.ponTexto(enElegir ? "Choose your character"
      : enQuien ? "Who are you?" : "Choose your weapon");
    this.etiqueta.ponTexto(enElegir ? "" : enQuien ? "" : "");
    this.manejo.ponTexto(enElegir
      ? "Characters are saved in this browser. Use Export to keep a copy."
      : enQuien ? "" : "");
    this.manejo.ver(enElegir);
    this.etiqueta.ver(enElegir);

    for (const r of this.ranuras) {
      r.caja.ver(enElegir); r.boton.ver(enElegir);
      r.linea1.ver(enElegir); r.linea2.ver(enElegir);
      const hay = Boolean(r.quien);
      r.borrar.ver(enElegir && hay);
      r.boton.ponTexto(hay ? "" : "Create");
      r.boton.desarmado = hay ? [...COLORES.disponible] : [...COLORES.nuevo];
      r.linea1.ponTexto(hay ? r.quien.nombre : "");
      r.linea1.color = [...COLORES.disponible];
      r.linea2.ponTexto(hay ? (r.quien.mapa ? `At ${r.quien.mapa}` : "Never played") : "");
      r.linea2.color = [...COLORES.info];
    }

    this.nombreEtiqueta.ver(enQuien);
    this.aceptar.ver(enQuien);
    this.generoEtiqueta.ver(enQuien);
    this.campo.hidden = !enQuien;
    // El cuadro enseña lo que hay en `nuevo.nombre`, que empieza siendo el del
    // cvar `name`. Se comprueba antes de escribir para no mover el cursor de
    // quien está tecleando: asignar `value` al mismo texto lo manda al final.
    if (this.campo.value !== this.nuevo.nombre) this.campo.value = this.nuevo.nombre;
    this.aceptar.habilitar(this.puedeSeguir());
    for (const g of this.generos) {
      g.caja.ver(enQuien); g.boton.ver(enQuien);
      g.boton.desarmado = g.clave === this.nuevo.genero ? [...COLORES.disponible] : [...COLORES.info];
    }

    for (const b of this.botonesDeArma) {
      b.boton.ver(enArma); b.nombre.ver(enArma);
      b.icono.hidden = !enArma || !b.arma.icono;
      b.boton.desarmado = b.arma.id === this.nuevo.arma ? [...COLORES.disponible] : [...COLORES.info];
    }

    this.atras.ver(!enElegir);
    if (this._ancho) this.colocar(this._ancho, this._alto, this.esquema);
    if (enQuien) this.campo.focus?.();
    return this;
  }

  colocar(ancho, alto, esquema) {
    this._ancho = ancho; this._alto = alto;
    const esp = espaciador(ancho);

    // Las tres ranuras, centradas con el espaciador roto.
    //   ButtonWidth = N*W + (N-1)*S;  StartX = panelAncho/2 - ButtonWidth/2
    //                                   vgui_choosecharacter.cpp:441-442
    const anchoTotal = RANURAS * MEDIDAS.ranuraAncho + (RANURAS - 1) * esp;
    const inicio = 640 / 2 - anchoTotal / 2;
    for (const [i, r] of this.ranuras.entries()) {
      const x = inicio + i * (MEDIDAS.ranuraAncho + esp);
      r.caja.pon({ x, y: MEDIDAS.ranuraY });
      r.boton.pon({ x, y: MEDIDAS.ranuraY });
      r.linea1.pon({ x, y: MEDIDAS.ranuraY + MEDIDAS.ranuraAlto });
      r.linea2.pon({ x, y: MEDIDAS.ranuraY + MEDIDAS.ranuraAlto + MEDIDAS.nombreAlto });
      r.borrar.pon({
        x: x + MEDIDAS.ranuraAncho - MEDIDAS.borrarAncho,
        y: MEDIDAS.ranuraY + MEDIDAS.borrarY,
      });
    }

    // Los dos géneros, con el mismo espaciador.
    const anchoG = 2 * MEDIDAS.ranuraAncho + esp;
    const inicioG = 640 / 2 - anchoG / 2;
    for (const g of this.generos) {
      const x = inicioG + g.i * (MEDIDAS.ranuraAncho + esp);
      g.caja.pon({ x, y: MEDIDAS.generoBotonY });
      g.boton.pon({ x, y: MEDIDAS.generoBotonY });
    }

    super.colocar(ancho, alto, esquema);

    // El campo de nombre: `XRES(120)` de ancho y **20 de alto sin `YRES`**, que
    // es otra medida que el original deja sin escalar.
    const campoX = XRES(MEDIDAS.nombreX, ancho) +
      medirTexto("Name:", esquema.fuenteCss("ID Text")).ancho + XRES(4, ancho);
    Object.assign(this.campo.style, {
      left: `${campoX}px`,
      top: `${YRES(MEDIDAS.nombreY + 2, alto)}px`,
      width: `${XRES(MEDIDAS.campoAncho, ancho)}px`,
      height: `${MEDIDAS.campoAlto}px`,
      font: esquema.fuenteCss("Briefing Text"),
    });

    // La rejilla de armas: en PÍXELES, porque el botón no escala, y con los dos
    // fallos de medida puestos.
    // OJO CON EL ORIGEN: los botones, los iconos y las etiquetas cuelgan todos
    // de `ventana`, que ya está colocada en `YRES(80)`. Sumar ahí el `ventanaY`
    // otra vez desplaza la rejilla media pantalla hacia abajo y deja los iconos
    // en una fila distinta de la de sus botones — que es lo que pasó, y se vio
    // en la captura antes que en ningún número.
    const inicioA = inicioDeArmas(XRES(640, ancho), ancho);
    const espPx = XRES(16, ancho) * XRES(1, ancho);
    for (const b of this.botonesDeArma) {
      const col = b.i % 3, fila = Math.floor(b.i / 3);
      const x = inicioA + col * (ARMA_PX + espPx);
      const y = YRES(MEDIDAS.armaY, alto) + fila * (ARMA_PX + YRES(MEDIDAS.armaSeparacionY, alto));
      for (const n of [b.boton.nodo, b.icono]) {
        Object.assign(n.style, { left: `${x}px`, top: `${y}px`, width: `${ARMA_PX}px`, height: `${ARMA_PX}px` });
      }
      // La etiqueta: `ix - XRES(len/2)` de ancho `iw + XRES(len)`, que es el
      // apaño del original para centrar un nombre más largo que el botón.
      const largo = (b.arma.nombre ?? b.arma.id).length;
      Object.assign(b.nombre.nodo.style, {
        left: `${x - XRES(largo / 2, ancho)}px`,
        top: `${y + ARMA_PX + YRES(10, alto)}px`,
        width: `${ARMA_PX + XRES(largo, ancho)}px`,
      });
    }

    // Y los retratos, uno por ranura y uno por género, montados una sola vez.
    this._montarRetratos();
    return this;
  }

  _montarRetratos() {
    if (!this.retratos) return;
    const poner = (destino, genero) => {
      if (destino.lienzo) return;
      const lienzo = el("canvas", "vg-char-retrato");
      destino.caja.nodo.appendChild(lienzo);
      destino.lienzo = lienzo;
      this.retratos.montar(destino.caja.nodo, lienzo, {
        genero, animacion: "sinArma", senalaCon: destino.boton.nodo,
      });
    };
    for (const r of this.ranuras) if (r.caja.nodo.isConnected) poner(r, "male");
    for (const g of this.generos) if (g.caja.nodo.isConnected) poner(g, g.clave);
  }
}
