// EL KIT DE VGUI2: `Frame`, `PropertySheet`, `Button`, `CheckButton`,
// `ComboBox`, `Slider`, `TextEntry`, `ListPanel`.
//
// Son los controles con los que están hechas las ventanas de Valve —«Options»,
// «Servers», «Create Server»—, escritos aquí porque no hay de dónde copiarlos.
//
// ── De dónde sale cada cosa, que no es todo del mismo sitio ────────────────
//
// Hay que separarlo con cuidado, porque en este proyecto «portado» significa
// que hay un archivo detrás:
//
//   LOS COLORES, LAS LETRAS Y LOS BORDES  salen de `resource/TrackerScheme.res`
//       con `npm run vgui2`. Son hechos con su archivo y su línea.
//   LAS CADENAS                           salen de `resource/gameui_english.txt`.
//       También.
//   LA DISPOSICIÓN                        está MEDIDA de capturas de pantalla.
//       El código de `GameUI.dll` no es público y en GoldSrc estas ventanas no
//       se colocan con un `.res`: se construyen en C++. Todo número de este
//       archivo que no venga del esquema lleva `// medido` al lado, y eso quiere
//       decir «de una captura», no «de una línea de código».
//
// El parecido de familia se puede consultar en `vgui2/vgui_controls/` del Source
// SDK 2013, que es el descendiente directo de este VGUI2 y lee el mismo formato
// de esquema. Sirve para saber cómo se comporta un control; no se copia código.
//
// ── Los símbolos: el juego usa Marlett y aquí se dibujan ───────────────────
//
// El esquema declara la fuente de símbolos:
//
//     "Marlett" { "1" { "name" "Marlett" "tall" "14" "symbol" "1" } }
//                                     TrackerScheme.res:250-259
//
// De ahí salen la X de cerrar, la flecha del desplegable, la marca de la casilla
// y el agarre de la esquina. Pero **qué letra es cada símbolo no está en ningún
// archivo del mod**: es la tabla de Marlett de Windows. Así que aquí se dibujan
// con CSS en vez de pedir la fuente, por dos razones: no depender de una fuente
// que fuera de Windows no existe, y no escribir una tabla adivinada como si
// estuviera leída.

import { css, colorDe, fuenteDe, bordeCss, texto } from "./esquema.js";

/**
 * Las medidas, TODAS medidas de las capturas del 27 de septiembre.
 *
 * Van en píxeles de verdad y no en unidades de 640 como el HUD: VGUI2 no escala
 * con la resolución, sólo cambia el tamaño de letra por rangos de altura
 * (`EngineFont`, ver `esquema.js`). Se ve en las capturas: la ventana de Options
 * ocupa lo mismo a 1440 de ancho que la de la lista de servidores.
 */
export const MEDIDAS = {
  tituloAlto: 22,          // medido: de arriba de la ventana a la raya de abajo
  tituloSangria: 6,        // medido: del borde al icono
  botonCerrarLado: 14,     // medido
  pestanaAlto: 21,         // medido
  pestanaSangria: 9,       // medido: aire a cada lado del texto de la pestaña
  pestanaHueco: 2,         // medido: entre una pestaña y la siguiente
  botonAlto: 20,           // medido: los OK / Cancel / Apply de abajo
  botonAncho: 72,          // medido
  casillaLado: 13,         // medido
  filaAlto: 15,            // medido: una fila de la lista de servidores
  cabeceraAlto: 15,        // medido
  entradaAlto: 20,         // medido: una caja de texto
  desplegableAlto: 20,     // medido
  deslizadorAlto: 20,      // medido
  agarreLado: 12,          // medido: el rincón de abajo a la derecha
  margen: 16,              // medido: del borde de la ventana al contenido
};

export const CSS = `
.v2 { box-sizing: border-box; }
.v2-ventana { position: absolute; display: flex; flex-direction: column;
  pointer-events: auto; user-select: none; }
.v2-ventana[hidden] { display: none !important; }

.v2-titulo { display: flex; align-items: center; gap: 6px; flex: 0 0 auto;
  cursor: move; }
.v2-titulo-texto { flex: 1 1 auto; overflow: hidden; white-space: nowrap;
  text-overflow: ellipsis; }
/* El icono de la barra de título. El esquema lo pide por su ruta
   ("TitleBarIcon" "resource/icon_steam", TrackerScheme.res:80) y ese archivo es
   de Steam, no del mod: no se copia. Se dibuja una marca del mismo tamaño para
   que el texto del título caiga donde cae en la captura. */
.v2-titulo-icono { flex: 0 0 auto; width: 14px; height: 14px; border-radius: 50%;
  opacity: .8; }
.v2-cerrar { flex: 0 0 auto; border: 0; background: transparent; padding: 0;
  cursor: pointer; position: relative; }
.v2-cerrar::before, .v2-cerrar::after { content: ""; position: absolute;
  left: 50%; top: 50%; width: 11px; height: 2px; margin: -1px 0 0 -5.5px;
  background: currentColor; }
.v2-cerrar::before { transform: rotate(45deg); }
.v2-cerrar::after { transform: rotate(-45deg); }

.v2-cuerpo { flex: 1 1 auto; position: relative; overflow: hidden; }

.v2-pestanas { display: flex; align-items: flex-end; flex: 0 0 auto; }
.v2-pestana { border: 0; background: transparent; cursor: pointer;
  white-space: nowrap; }
/* La pestaña elegida se pega a la hoja: tapa la raya de abajo. Es lo que hace
   que el conjunto se lea como carpetas y no como una fila de botones. */
.v2-pestana[data-activa="si"] { position: relative; z-index: 2; }
.v2-hoja { flex: 1 1 auto; position: relative; overflow: auto; }

.v2-boton { border: 0; cursor: pointer; white-space: nowrap;
  display: inline-flex; align-items: center; justify-content: center; }
.v2-boton:disabled { cursor: default; }
/* El anillo del navegador se apaga: lo que marca el control elegido es el borde
   del esquema (ButtonKeyFocusBorder), como en el juego. Un halo azul de Chrome
   encima de una ventana de Valve es la señal más clara de que no es del juego. */
.v2 :focus { outline: none; }
.v2 :focus-visible { outline: none; }

.v2-casilla { display: flex; align-items: center; gap: 7px; cursor: pointer;
  background: transparent; border: 0; padding: 0; text-align: left; }
.v2-casilla-caja { flex: 0 0 auto; position: relative; }
.v2-casilla-marca { position: absolute; left: 2px; top: 1px; width: 5px;
  height: 8px; border-style: solid; border-width: 0 2px 2px 0;
  transform: rotate(40deg); }

.v2-entrada { border: 0; background: transparent; }
.v2-entrada:focus { outline: none; }

.v2-desplegable { display: flex; align-items: center; cursor: pointer;
  text-align: left; border: 0; }
.v2-desplegable-texto { flex: 1 1 auto; overflow: hidden; white-space: nowrap;
  padding: 0 4px; }
.v2-desplegable-flecha { flex: 0 0 auto; width: 17px; align-self: stretch;
  position: relative; }
.v2-desplegable-flecha::after { content: ""; position: absolute; left: 50%;
  top: 50%; margin: -2px 0 0 -4px; border: 4px solid transparent;
  border-top-color: currentColor; }
.v2-lista-abierta { position: absolute; z-index: 30; overflow: auto;
  max-height: 180px; }
.v2-lista-abierta > button { display: block; width: 100%; text-align: left;
  border: 0; background: transparent; cursor: pointer; }

.v2-deslizador { position: relative; cursor: pointer; }
.v2-deslizador-via { position: absolute; left: 0; right: 0; top: 50%;
  height: 2px; margin-top: -1px; }
.v2-deslizador-marcas { position: absolute; left: 0; right: 0; bottom: 0;
  height: 4px; display: flex; justify-content: space-between; }
.v2-deslizador-marcas > i { width: 1px; height: 100%; }
.v2-deslizador-agarre { position: absolute; top: 2px; bottom: 6px; width: 9px;
  margin-left: -4px; }

.v2-tabla { display: flex; flex-direction: column; overflow: hidden; }
.v2-tabla-cabecera { display: flex; flex: 0 0 auto; }
.v2-tabla-cabecera > div { overflow: hidden; white-space: nowrap;
  padding: 0 4px; }
.v2-tabla-cuerpo { flex: 1 1 auto; overflow: auto; }
.v2-fila { display: flex; cursor: default; }
.v2-fila > div { overflow: hidden; white-space: nowrap; padding: 0 4px; }

.v2-agarre { position: absolute; right: 2px; bottom: 2px; }
.v2-agarre > i { position: absolute; width: 2px; height: 2px; }
`;

const el = (tag, clase = "") => {
  const n = document.createElement(tag);
  if (clase) n.className = `v2 ${clase}`;
  return n;
};

/**
 * Lo que todo control necesita saber: el esquema horneado y la altura de la
 * pantalla, que es lo que elige el tamaño de letra.
 *
 * Se pasa uno solo y no cuatro argumentos por todas partes porque las ventanas
 * anidan controles y así el de dentro hereda sin que nadie lo reparta a mano.
 */
export class Tema {
  constructor(ficha, altoPantalla = 480) {
    this.ficha = ficha ?? null;
    this.alto = altoPantalla;
  }
  color(nombre, porSiFalta) { return colorDe(this.ficha, nombre, porSiFalta); }
  borde(nombre, opciones) { return bordeCss(this.ficha, nombre, opciones); }
  fuente(nombre) { return fuenteDe(this.ficha, nombre, this.alto); }
  texto(clave) { return texto(this.ficha, clave); }
  /**
   * La letra de la interfaz. `Default` es «Verdana Bold 13»
   * (TrackerScheme.res:192-200) y es la que llevan los botones, las pestañas y
   * las etiquetas de las capturas.
   */
  get letra() { return this.fuente("Default").css; }
  get letraPequena() { return this.fuente("DefaultSmall").css; }
}

/**
 * `Frame`: la ventana con su barra de título, su X y su agarre.
 *
 * Tres cosas de la captura que hay que respetar o no se parece:
 *
 * 1. **La barra de título no tiene fondo.** `"TitleBG" "206 206 206 0"`
 *    (TrackerScheme.res:44) es transparente —el alfa de VGUI2 va al derecho— y
 *    en la captura se ve el fondo de la ventana por detrás del título. Poner
 *    una banda gris es el error que delata una imitación.
 * 2. **El marco es `RaisedBorder`**, o sea el bisel claro arriba-izquierda:
 *    `FrameBorder "RaisedBorder"` (TrackerScheme.res:357).
 * 3. **El fondo es `ControlBG`, que es negro al 50 %**: `"0 0 0 128"`. La
 *    ventana deja ver el juego por debajo, y en la captura del menú principal se
 *    nota la pared de piedra a través de la ventana de Options.
 */
export class Frame {
  constructor(tema, { titulo = "", ancho = 400, alto = 300, x = 0, y = 0,
                      alCerrar = null, movible = true } = {}) {
    this.tema = tema;
    this.alCerrar = alCerrar;
    this.nodo = el("div", "v2-ventana");
    Object.assign(this.nodo.style, {
      left: `${x}px`, top: `${y}px`, width: `${ancho}px`, height: `${alto}px`,
      background: tema.color("ControlBG"),
      boxShadow: tema.borde("FrameBorder"),
      font: tema.letra,
      color: tema.color("ControlText"),
    });

    const barra = el("div", "v2-titulo");
    barra.style.height = `${MEDIDAS.tituloAlto}px`;
    barra.style.padding = `0 ${MEDIDAS.tituloSangria}px`;
    barra.style.background = tema.color("TitleBG");    // transparente a propósito

    const icono = el("div", "v2-titulo-icono");
    icono.style.background = tema.color("BrightBaseText");

    const t = el("div", "v2-titulo-texto");
    t.textContent = tema.texto(titulo);
    t.style.color = tema.color("TitleText");

    const x2 = el("button", "v2-cerrar");
    x2.type = "button";
    x2.setAttribute("aria-label", "Close");
    x2.style.width = `${MEDIDAS.botonCerrarLado}px`;
    x2.style.height = `${MEDIDAS.botonCerrarLado}px`;
    x2.style.color = tema.color("TitleText");
    x2.onclick = () => this.cerrar();

    barra.append(icono, t, x2);

    this.cuerpo = el("div", "v2-cuerpo");
    this.cuerpo.style.padding = `0 ${MEDIDAS.margen / 2}px ${MEDIDAS.margen / 2}px`;

    // El agarre de la esquina. En la captura son seis puntitos en diagonal.
    const agarre = el("div", "v2-agarre");
    agarre.style.width = `${MEDIDAS.agarreLado}px`;
    agarre.style.height = `${MEDIDAS.agarreLado}px`;
    for (const [px, py] of [[8, 2], [8, 6], [4, 6], [8, 10], [4, 10], [0, 10]]) {
      const p = el("i");
      p.style.right = `${px}px`; p.style.bottom = `${py}px`;
      p.style.background = tema.color("BorderBright");
      agarre.appendChild(p);
    }

    this.nodo.append(barra, this.cuerpo, agarre);
    if (movible) this.#arrastrar(barra);
  }

  cerrar() {
    this.nodo.hidden = true;
    this.alCerrar?.();
  }

  /** Mover la ventana por su barra de título, como en el juego. */
  #arrastrar(barra) {
    let de = null;
    barra.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".v2-cerrar")) return;
      de = { x: e.clientX, y: e.clientY,
             l: parseFloat(this.nodo.style.left) || 0,
             t: parseFloat(this.nodo.style.top) || 0 };
      barra.setPointerCapture(e.pointerId);
    });
    barra.addEventListener("pointermove", (e) => {
      if (!de) return;
      this.nodo.style.left = `${de.l + e.clientX - de.x}px`;
      this.nodo.style.top = `${Math.max(0, de.t + e.clientY - de.y)}px`;
    });
    const soltar = () => { de = null; };
    barra.addEventListener("pointerup", soltar);
    barra.addEventListener("pointercancel", soltar);
  }
}

/**
 * `PropertySheet`: la fila de pestañas y la hoja de debajo.
 *
 * `TabBorder "RaisedBorder"` (TrackerScheme.res:358), y la elegida se dibuja
 * pegada a la hoja. Lo que la marca es el color del texto —`BrightControlText`
 * contra `ControlText`—, no un fondo distinto: en la captura las siete pestañas
 * de Options tienen el mismo fondo y sólo cambia el brillo de la letra y que la
 * activa tapa la raya.
 */
export class PropertySheet {
  constructor(tema) {
    this.tema = tema;
    this.paginas = [];
    this.activa = 0;
    this.nodo = el("div", "v2-cuerpo");
    this.nodo.style.display = "flex";
    this.nodo.style.flexDirection = "column";
    this.nodo.style.height = "100%";

    this.barra = el("div", "v2-pestanas");
    this.barra.style.gap = `${MEDIDAS.pestanaHueco}px`;
    this.hoja = el("div", "v2-hoja");
    this.hoja.style.boxShadow = tema.borde("TabBorder");
    this.hoja.style.padding = `${MEDIDAS.margen}px`;
    this.nodo.append(this.barra, this.hoja);
  }

  /** Añade una página. `contenido` es un nodo o una función que lo hace. */
  anadir(titulo, contenido) {
    const i = this.paginas.length;
    const b = el("button", "v2-pestana");
    b.type = "button";
    b.textContent = this.tema.texto(titulo);
    b.style.height = `${MEDIDAS.pestanaAlto}px`;
    b.style.padding = `0 ${MEDIDAS.pestanaSangria}px`;
    b.style.font = this.tema.letra;
    b.style.boxShadow = this.tema.borde("TabBorder");
    b.onclick = () => this.elegir(i);
    this.barra.appendChild(b);
    this.paginas.push({ titulo, contenido, boton: b, nodo: null });
    // SE REPINTAN TODAS, no sólo la primera. Antes era `if (i === 0)`, y una
    // pestaña que nadie hubiera pulsado nunca se quedaba **sin su color y sin su
    // borde**: `elegir()` es el único sitio que se los pone, y sólo corría una
    // vez. Con el gris del esquema casi no se veía; se destapó al poner la
    // misma clase sobre pergamino, donde la pestaña sin pintar sale en blanco.
    // Ver `src/vgui2/codice.js`.
    this.elegir(this.activa);
    return this;
  }

  elegir(i) {
    if (i < 0 || i >= this.paginas.length) return;
    this.activa = i;
    for (const [j, p] of this.paginas.entries()) {
      const suya = j === i;
      p.boton.dataset.activa = suya ? "si" : "no";
      p.boton.style.color = this.tema.color(suya ? "BrightControlText" : "ControlText");
      p.boton.style.background = this.tema.color(suya ? "ControlBG" : "ControlDarkBG");
      // La elegida pierde la raya de abajo y baja un píxel para tapar la de la
      // hoja: es lo que la deja «dentro» de la carpeta. El esquema les da el
      // mismo fondo a todas, así que sin esto la activa sólo se distingue por el
      // brillo de la letra y la fila parece una hilera de botones.
      p.boton.style.boxShadow = this.tema.borde("TabBorder", suya ? { sin: ["Bottom"] } : undefined);
      p.boton.style.marginBottom = suya ? "-1px" : "0";
      p.boton.style.paddingBottom = suya ? "1px" : "0";
    }
    const p = this.paginas[i];
    if (!p.nodo) p.nodo = typeof p.contenido === "function" ? p.contenido() : p.contenido;
    this.hoja.replaceChildren(p.nodo ?? el("div"));
  }

  /** Cómo se llama la página que está delante. Para la sonda. */
  get titulos() { return this.paginas.map((p) => p.titulo); }
}

/** `Button`: `ButtonBorder "RaisedBorder"`, y hundido al pulsar. */
export class Button {
  constructor(tema, etiqueta, { alPulsar = null, ancho = MEDIDAS.botonAncho,
                                alto = MEDIDAS.botonAlto, activo = true } = {}) {
    this.tema = tema;
    this.nodo = el("button", "v2-boton");
    this.nodo.type = "button";
    this.nodo.textContent = tema.texto(etiqueta);
    Object.assign(this.nodo.style, {
      width: `${ancho}px`, height: `${alto}px`,
      font: tema.letra,
      background: tema.color("ControlBG"),
      boxShadow: tema.borde("ButtonBorder"),
    });
    this.activo = activo;
    // `ButtonDepressedBorder` tiene `inset "2 1 1 1"` (TrackerScheme.res:812),
    // o sea que el texto se mueve un píxel a la derecha al pulsar. Es un detalle
    // de dos líneas y es la mitad de la sensación de que el botón se hunde.
    this.nodo.addEventListener("pointerdown", () => {
      if (!this.activo) return;
      this.nodo.style.boxShadow = tema.borde("ButtonDepressedBorder");
      this.nodo.style.paddingLeft = "2px";
    });
    const subir = () => {
      this.nodo.style.boxShadow = tema.borde("ButtonBorder");
      this.nodo.style.paddingLeft = "";
    };
    this.nodo.addEventListener("pointerup", subir);
    this.nodo.addEventListener("pointerleave", subir);
    this.nodo.onclick = () => { if (this.activo) alPulsar?.(); };
    this.habilitar(activo);
  }

  habilitar(si) {
    this.activo = !!si;
    this.nodo.disabled = !si;
    // Los dos colores de apagado del esquema hacen el relieve hundido del texto
    // gris: `DisabledText1` claro y `DisabledText2` encima
    // (TrackerScheme.res:76-77). Aquí se usa el segundo, que es el que se lee.
    this.nodo.style.color = this.tema.color(si ? "ControlText" : "DisabledText2");
    return this;
  }
}

/**
 * `CheckButton`: la casilla con su marca.
 *
 * El esquema le da tres colores propios —`CheckButtonBorder1` oscuro a la
 * izquierda, `CheckButtonBorder2` claro a la derecha y `CheckBgColor` de fondo
 * (TrackerScheme.res:143-147)—, que es el bisel hundido de siempre.
 */
export class CheckButton {
  constructor(tema, etiqueta, { marcada = false, alCambiar = null, activo = true } = {}) {
    this.tema = tema;
    this.marcada = !!marcada;
    this.alCambiar = alCambiar;
    this.nodo = el("button", "v2-casilla");
    this.nodo.type = "button";
    this.nodo.setAttribute("role", "checkbox");

    this.caja = el("span", "v2-casilla-caja");
    Object.assign(this.caja.style, {
      width: `${MEDIDAS.casillaLado}px`, height: `${MEDIDAS.casillaLado}px`,
      background: tema.color("CheckBgColor", [0, 0, 0, 200]),
      boxShadow: `inset 1px 0 0 ${tema.color("CheckButtonBorder1", [112, 112, 112, 255])}, `
               + `inset -1px 0 0 ${tema.color("CheckButtonBorder2", [236, 236, 236, 255])}, `
               + `inset 0 1px 0 ${tema.color("CheckButtonBorder1", [112, 112, 112, 255])}, `
               + `inset 0 -1px 0 ${tema.color("CheckButtonBorder2", [236, 236, 236, 255])}`,
    });
    this.marca = el("span", "v2-casilla-marca");
    this.marca.style.borderColor = tema.color("CheckButtonCheck", [225, 225, 255, 255]);
    this.caja.appendChild(this.marca);

    this.etiqueta = el("span");
    this.etiqueta.textContent = tema.texto(etiqueta);
    this.nodo.append(this.caja, this.etiqueta);
    this.nodo.style.font = tema.letra;
    this.nodo.onclick = () => { if (this.activo) this.poner(!this.marcada, true); };
    this.habilitar(activo);
    this.poner(this.marcada, false);
  }

  poner(si, avisar) {
    this.marcada = !!si;
    this.marca.hidden = !this.marcada;
    this.nodo.setAttribute("aria-checked", this.marcada ? "true" : "false");
    if (avisar) this.alCambiar?.(this.marcada);
    return this;
  }

  habilitar(si) {
    this.activo = !!si;
    this.nodo.disabled = !si;
    this.etiqueta.style.color = this.tema.color(si ? "ControlText" : "DisabledText2");
    this.nodo.style.opacity = si ? "1" : ".75";
    return this;
  }
}

/** `TextEntry`: `InsetBorder` y fondo `WindowBG`. */
export class TextEntry {
  constructor(tema, { valor = "", ancho = 140, alCambiar = null, clave = false } = {}) {
    this.tema = tema;
    this.nodo = el("input", "v2-entrada");
    this.nodo.type = clave ? "password" : "text";
    this.nodo.value = valor;
    Object.assign(this.nodo.style, {
      width: `${ancho}px`, height: `${MEDIDAS.entradaAlto}px`,
      font: tema.letra,
      color: tema.color("WindowFgColor", [196, 220, 255, 220]),
      background: tema.color("WindowBgColor", [0, 0, 0, 150]),
      boxShadow: tema.borde("BaseBorder"),
      padding: "0 4px",
      // `TextCursorColor "BaseText"` (TrackerScheme.res:88).
      caretColor: tema.color("TextCursorColor", [196, 220, 255, 220]),
    });
    this.nodo.addEventListener("input", () => alCambiar?.(this.nodo.value));
  }
  get valor() { return this.nodo.value; }
  set valor(v) { this.nodo.value = v; }
}

/**
 * `ComboBox`: la caja hundida con la flechita.
 *
 * `ComboBoxBorder "InsetBorder"` (TrackerScheme.res:355) y el botón de la flecha
 * tiene su propio bloque en el esquema, `MenuButton` (TrackerScheme.res:104-110),
 * con el fondo igual que el de una caja de texto y la flecha en `DimBaseText`.
 *
 * La lista que se abre usa `Menu` (TrackerScheme.res:92-100): lo elegido va en
 * `SelectionBG`, que es el azul `26 78 137` de la captura.
 */
export class ComboBox {
  constructor(tema, opciones, { indice = 0, ancho = 160, alElegir = null,
                                activo = true } = {}) {
    this.tema = tema;
    this.opciones = [...opciones];
    this.indice = indice;
    this.alElegir = alElegir;
    this.abierta = null;

    this.nodo = el("button", "v2-desplegable");
    this.nodo.type = "button";
    Object.assign(this.nodo.style, {
      width: `${ancho}px`, height: `${MEDIDAS.desplegableAlto}px`,
      font: tema.letra,
      background: tema.color("WindowBG"),
      boxShadow: tema.borde("ComboBoxBorder"),
      position: "relative",
    });

    this.texto = el("span", "v2-desplegable-texto");
    this.flecha = el("span", "v2-desplegable-flecha");
    this.flecha.style.color = tema.color("MenuButtonArrow", [196, 220, 255, 200]);
    this.nodo.append(this.texto, this.flecha);
    this.nodo.onclick = () => { if (this.activo) this.alternar(); };
    this.habilitar(activo);
    this.poner(indice, false);
  }

  poner(i, avisar) {
    this.indice = Math.max(0, Math.min(i, this.opciones.length - 1));
    const o = this.opciones[this.indice];
    this.texto.textContent = this.tema.texto(typeof o === "string" ? o : o?.texto ?? "");
    if (avisar) this.alElegir?.(this.indice, o);
    return this;
  }

  alternar() {
    if (this.abierta) { this.cerrar(); return; }
    const lista = el("div", "v2-lista-abierta");
    Object.assign(lista.style, {
      left: "0px", top: `${MEDIDAS.desplegableAlto}px`,
      width: `${this.nodo.offsetWidth || 160}px`,
      background: this.tema.color("ControlBG"),
      boxShadow: this.tema.borde("MenuBorder"),
      font: this.tema.letra,
    });
    for (const [i, o] of this.opciones.entries()) {
      const b = el("button");
      b.type = "button";
      b.textContent = this.tema.texto(typeof o === "string" ? o : o?.texto ?? "");
      b.style.font = this.tema.letra;
      b.style.padding = "2px 6px";                  // TextInset "6" del bloque Menu
      b.style.color = this.tema.color(i === this.indice ? "BrightBaseText" : "DimBaseText");
      b.style.background = i === this.indice ? this.tema.color("SelectionBG") : "transparent";
      b.onmouseenter = () => { b.style.background = this.tema.color("SelectionBG"); };
      b.onmouseleave = () => {
        b.style.background = i === this.indice ? this.tema.color("SelectionBG") : "transparent";
      };
      b.onclick = (e) => { e.stopPropagation(); this.poner(i, true); this.cerrar(); };
      lista.appendChild(b);
    }
    this.nodo.appendChild(lista);
    this.abierta = lista;
    // CÓMO SE CIERRA ESTO DESDE FUERA, Y POR QUÉ HACE FALTA DECIRLO.
    //
    // La Escape la cierra el gestor de ventanas (`vgui2/montar.js`), que hasta
    // el 50 hacía `lista.remove()`: se llevaba el `<div>` y dejaba al widget
    // creyéndose abierto —`this.abierta` puesta y el oyente de «clic fuera»
    // colgando—. El siguiente clic en el desplegable entraba por `alternar()`,
    // veía `abierta` y llamaba a `cerrar()`: **el clic se perdía** y el
    // jugador tenía que pulsar dos veces.
    //
    // No se veía porque la sonda del 36 pulsaba Escape y no volvía a abrir la
    // lista; lo destapó el 50 al tener que elegir un mapa DESPUÉS de mirarla.
    lista.cerrarDesplegable = () => this.cerrar();
    // Un clic fuera la cierra, y se escucha una sola vez para no dejar oyentes
    // colgando cada vez que alguien abre un desplegable.
    setTimeout(() => {
      addEventListener("pointerdown", this.#fuera = (e) => {
        if (!this.nodo.contains(e.target)) this.cerrar();
      }, { once: true });
    }, 0);
  }

  cerrar() {
    this.abierta?.remove();
    this.abierta = null;
    if (this.#fuera) { removeEventListener("pointerdown", this.#fuera); this.#fuera = null; }
  }
  #fuera = null;

  habilitar(si) {
    this.activo = !!si;
    this.nodo.disabled = !si;
    this.texto.style.color = this.tema.color(si ? "ControlText" : "DisabledText2");
    return this;
  }

  get valor() { return this.opciones[this.indice]; }
}

/**
 * `Slider`: la vía con sus marcas y su agarre.
 *
 * El esquema le da dos colores, y son los dos que se ven en la captura de la
 * pestaña Mouse: `SliderTickColor "206 206 206"` para las rayitas y
 * `SliderTrackColor "56 56 56"` para la vía (TrackerScheme.res:49-50).
 *
 * Las marcas del juego son **once**, contadas en la captura de «Mouse
 * sensitivity» —diez huecos—, con el número a cada punta.
 */
export class Slider {
  constructor(tema, { min = 0, max = 1, valor = 0.5, ancho = 260, marcas = 11,
                      alCambiar = null, etiquetaMin = "", etiquetaMax = "" } = {}) {
    this.tema = tema;
    this.min = min; this.max = max;
    this.valor = valor;
    this.alCambiar = alCambiar;

    this.nodo = el("div", "v2-deslizador");
    this.nodo.style.width = `${ancho}px`;
    this.nodo.style.height = `${MEDIDAS.deslizadorAlto}px`;

    const via = el("div", "v2-deslizador-via");
    via.style.background = tema.color("SliderTrackColor", [56, 56, 56, 255]);

    const m = el("div", "v2-deslizador-marcas");
    for (let i = 0; i < marcas; i++) {
      const t = el("i");
      t.style.background = tema.color("SliderTickColor", [206, 206, 206, 255]);
      m.appendChild(t);
    }

    this.agarre = el("div", "v2-deslizador-agarre");
    this.agarre.style.background = tema.color("ControlBG");
    this.agarre.style.boxShadow = tema.borde("ButtonBorder");

    this.nodo.append(via, m, this.agarre);
    this.etiquetaMin = etiquetaMin;
    this.etiquetaMax = etiquetaMax;
    this.#arrastrar();
    this.poner(valor, false);
  }

  poner(v, avisar) {
    this.valor = Math.max(this.min, Math.min(this.max, v));
    const t = (this.valor - this.min) / (this.max - this.min || 1);
    this.agarre.style.left = `${(t * 100).toFixed(2)}%`;
    if (avisar) this.alCambiar?.(this.valor);
    return this;
  }

  #arrastrar() {
    const desde = (e) => {
      const r = this.nodo.getBoundingClientRect();
      const t = r.width ? (e.clientX - r.left) / r.width : 0;
      this.poner(this.min + t * (this.max - this.min), true);
    };
    let puesto = false;
    this.nodo.addEventListener("pointerdown", (e) => {
      puesto = true; this.nodo.setPointerCapture(e.pointerId); desde(e);
    });
    this.nodo.addEventListener("pointermove", (e) => { if (puesto) desde(e); });
    const soltar = () => { puesto = false; };
    this.nodo.addEventListener("pointerup", soltar);
    this.nodo.addEventListener("pointercancel", soltar);
  }
}

/**
 * `ListPanel`: la tabla de la lista de servidores.
 *
 * Fondo `ListBG "0 0 0 200"` (TrackerScheme.res:36), la fila elegida en
 * `SelectionBG` con el texto en `SelectedText`, y la cabecera con los nombres de
 * columna. En la captura las columnas son «Servers (9)», «Game», «Players»,
 * «Map» y «Latency», y las dos primeras columnitas sin nombre son el candado y
 * el corazón.
 */
export class ListPanel {
  constructor(tema, columnas, { alto = 240, alElegir = null } = {}) {
    this.tema = tema;
    this.columnas = columnas;            // [{clave, titulo, ancho}]
    this.filas = [];
    this.elegida = -1;
    this.alElegir = alElegir;

    this.nodo = el("div", "v2-tabla");
    Object.assign(this.nodo.style, {
      height: `${alto}px`,
      background: tema.color("ListBG"),
      boxShadow: tema.borde("BrowserBorder"),
      font: tema.letraPequena,
    });

    this.cabecera = el("div", "v2-tabla-cabecera");
    this.cabecera.style.height = `${MEDIDAS.cabeceraAlto}px`;
    this.cabecera.style.color = tema.color("ControlText");
    for (const c of columnas) {
      const d = el("div");
      d.textContent = tema.texto(c.titulo ?? "");
      d.style.flex = c.ancho ? `0 0 ${c.ancho}px` : "1 1 auto";
      d.style.boxShadow = tema.borde("BaseBorder");
      this.cabecera.appendChild(d);
    }

    this.cuerpo = el("div", "v2-tabla-cuerpo");
    this.nodo.append(this.cabecera, this.cuerpo);
  }

  poner(filas) {
    this.filas = [...filas];
    this.elegida = -1;
    this.cuerpo.replaceChildren();
    for (const [i, f] of this.filas.entries()) {
      const r = el("div", "v2-fila");
      r.style.height = `${MEDIDAS.filaAlto}px`;
      r.style.color = this.tema.color("BaseText");
      for (const c of this.columnas) {
        const d = el("div");
        d.textContent = String(f[c.clave] ?? "");
        d.style.flex = c.ancho ? `0 0 ${c.ancho}px` : "1 1 auto";
        r.appendChild(d);
      }
      r.onclick = () => this.elegir(i);
      this.cuerpo.appendChild(r);
    }
    return this;
  }

  elegir(i) {
    this.elegida = i;
    for (const [j, r] of [...this.cuerpo.children].entries()) {
      const suya = j === i;
      r.style.background = suya ? this.tema.color("SelectionBG") : "transparent";
      r.style.color = this.tema.color(suya ? "ListSelectionFgColor" : "BaseText");
    }
    this.alElegir?.(i, this.filas[i]);
    return this;
  }

  /** Cuántas filas hay. La cabecera del juego dice «Servers (9)» con esto. */
  get cuantas() { return this.filas.length; }
}

/** Una etiqueta suelta, que es la mitad de lo que hay en estas ventanas. */
export function etiqueta(tema, txt, { color = "ControlText", pequena = false } = {}) {
  const n = el("div");
  n.textContent = tema.texto(txt);
  n.style.font = pequena ? tema.letraPequena : tema.letra;
  n.style.color = tema.color(color);
  return n;
}
