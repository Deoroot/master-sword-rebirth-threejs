// EL CÓDICE: las ventanas de VGUI2 dejan de ser ventanas y pasan a ser un libro.
//
// ── Qué es esto y qué NO es ────────────────────────────────────────────────
//
// Todo lo que hay en `src/vgui2/` hasta aquí es un hecho portado: cada color
// cita una línea de `TrackerScheme.res` y cada medida está sacada de una
// captura. La barra de título es transparente porque `"TitleBG" "206 206 206 0"`
// (TrackerScheme.res:44); el fondo es negro al 50 % porque `ControlBG
// "0 0 0 128"`. Se puede ir a mirarlo.
//
// **Esto no.** Esto es una decisión nuestra, y no cita nada porque no hay nada
// que citar: Master Sword no tiene un menú con forma de libro. Va en su propio
// archivo, y no mezclado con los widgets, justamente para que la frontera entre
// «lo que dice el juego» y «lo que decidimos nosotros» se vea desde el índice de
// la carpeta. Es la misma regla con la que se declararon ALT y ALT GR en
// `src/juego/teclas.js` y la casilla de pantalla completa del 36.
//
// ── Por qué existe ─────────────────────────────────────────────────────────
//
// Los tres estilos del maquetado del 73 eran el mismo esqueleto repintado, y el
// jugador lo vio enseguida: *«esos son basados en el de half-life no?»*. Lo que
// hace que una ventana se lea como Half-Life no es el gris, son TRES cosas
// estructurales —caja flotante con barra de título, tira de pestañas horizontal
// y pie OK/Cancel/Apply—, y mientras estén puestas da igual el color.
//
// El códice quita las tres:
//
//   - no hay barra de título, ni X, ni agarre de esquina: un libro no se
//     arrastra por su cabecera, y el título va escrito en la página;
//   - no hay tira de pestañas: hay CINTAS, en una columna, que es como se marca
//     un libro;
//   - no hay OK/Cancel/Apply: un libro no se acepta, se cierra, y lo escrito ya
//     está escrito. Los cambios entran al tocarlos.
//
// Esa última no es cosmética: **cambia el comportamiento**. Ver `conCaja`.
//
// ── Lo que NO cambia, y es la mitad del motivo de que esto sea barato ──────
//
// 1. **La regla no se toca.** `src/play/ajustes.js`, `crearpartida.js` y
//    `menu.js` no tocan el DOM por diseño, así que no se enteran de nada.
// 2. **Los controles de hoja se reutilizan enteros.** `Button`, `Slider`,
//    `CheckButton`, `ComboBox`, `TextEntry` y `ListPanel` piden sus colores por
//    `tema.color(...)` y no los escriben a mano, así que con otro tema se
//    repintan solos. Su comportamiento —el arrastre del deslizador, el recorte
//    al rango, la selección de la lista— es el mismo código.
// 3. **Las cintas conservan la clase `.v2-pestana`.** Son pestañas: lo que
//    cambia es su aspecto, no su papel. Ocho sondas las pulsan por esa clase
//    (`.v2-pestana:nth-child(4)` para llegar a Audio, por ejemplo) y hay que
//    poder seguir midiendo lo mismo. Cambiar la clase habría sido renombrar el
//    instrumento a mitad de medición.

import { Tema, Frame, PropertySheet, MEDIDAS } from "./widgets.js";

/**
 * QUÉ ASPECTO TIENEN LAS VENTANAS DEL MENÚ.
 *
 * `"codice"` o `"vgui"`. Una palabra, con su razón al lado, igual que
 * `ESCENA_DEL_MENU` en `src/play/fondomenu.js`: el 72 dejó ese precedente y
 * funcionó, porque permite enseñar lo nuevo sin tirar lo viejo ni dejar ciegas a
 * las sondas que lo miden.
 *
 * **El alcance es sólo VGUI2**: el menú, «Options», «Servers» y «Create
 * Server». Los paneles del mod —inventario, hoja de personaje, tiendas, menús de
 * NPC, que son `src/vgui/` y 2 602 líneas— se quedan como están. Eso deja el
 * juego con dos aspectos a propósito y por ahora: fue lo que se pidió, *«por
 * ahora toquemos solo el menú, para ver cómo quedaría»*.
 */
export const ASPECTO_DE_LAS_VENTANAS = Object.freeze({
  cual: "codice",
  porQue:
    "los tres estilos del maquetado del 73 eran el mismo diálogo de Half-Life " +
    "repintado, y lo que los delata es estructural: caja con barra de título, " +
    "pestañas en fila y OK/Cancel/Apply. El códice quita las tres. Es una " +
    "decisión nuestra y no cita nada, al contrario que el resto de esta " +
    "carpeta. Ver doc/INTERFAZ_73.md y doc/mockups/interfaz-73-mockup.html",
});

/**
 * EL ASPECTO QUE ESTÁ PUESTO, que puede no ser el de arriba.
 *
 * Y tiene que poder no serlo, por una razón que no es comodidad: los controles
 * de `sondas/vgui2_34.mjs` —Verdana, 13 px, `ControlBG` negro al 50 %, el alfa 0
 * de `TitleBG`, el bisel, los 535 px de la captura— **miden que el port de
 * `TrackerScheme.res` es fiel**. Eso son hechos citados, y no dejan de ser
 * hechos porque hoy el menú se dibuje como un libro. Si el aspecto fuera una
 * constante y punto, elegir el códice habría borrado esa medición para siempre:
 * la sonda se cae con `getComputedStyle(null)` en cuanto no hay barra de título.
 *
 * Es lo mismo que hizo el 72 con la escena de la torre: no se borra, se enciende
 * a petición, y las sondas que la medían siguen midiéndola.
 */
let ACTIVO = ASPECTO_DE_LAS_VENTANAS;

/** El aspecto puesto ahora mismo. */
export function aspectoActivo() { return ACTIVO; }

/**
 * Cambiarlo. Un valor que no sea `"vgui"` o `"codice"` **no cambia nada**: lo
 * llama `montar.js` con lo que venga en la URL, que es texto de fuera.
 */
export function ponerAspecto(cual) {
  if (cual !== "vgui" && cual !== "codice") return ACTIVO;
  ACTIVO = cual === ASPECTO_DE_LAS_VENTANAS.cual
    ? ASPECTO_DE_LAS_VENTANAS
    : Object.freeze({ ...ASPECTO_DE_LAS_VENTANAS, cual });
  return ACTIVO;
}

/** Si las ventanas llevan caja. Con códice no, y eso cambia también el pie. */
export function conCaja(aspecto = ACTIVO) {
  return aspecto.cual !== "codice";
}

/**
 * LA PALETA DEL PERGAMINO.
 *
 * Los nombres son los de `TrackerScheme.res` —`ControlBG`, `BrightControlText`,
 * `SelectionBG`…— y eso es a propósito: así los diez widgets siguen pidiendo lo
 * mismo que pedían y no hay que tocar ni uno. Lo que cambia es qué contesta.
 *
 * Los valores NO están medidos de ninguna parte. Son nuestros.
 */
// LA PRIMERA PALETA ERA DEMASIADO CÁLIDA Y NO MEZCLABA.
//
// Encargo, al verlo corriendo: *«los colores no mezclan muy bien»*. Y es cierto,
// y tiene causa: la pintura de Finér es **fría** —cielo gris azulado, valle
// verde, roca verdinegra— y el pergamino salió ámbar, con cintas naranjas. Dos
// familias de color que no se tocan en ningún punto: el libro no estaba dentro
// de la escena, estaba pegado encima.
//
// Lo que se cambia es la TEMPERATURA, no el tono: sigue siendo vitela, pero
// desaturada y tirando a verde grisáceo, que es lo que tiene el cuadro alrededor.
// Y las cintas pasan de naranja a un pardo apagado.
//
// Y una segunda cosa que lo mete en la escena: **la página deja pasar algo de
// luz**. Es lo que hace VGUI2 con `ControlBG "0 0 0 128"` —sus ventanas dejan
// ver la pared de piedra— y es la razón por la que una ventana de Valve sobre un
// mapa no parece un recorte. Aquí es mucho menos, porque un papel no es un
// cristal: lo justo para que el verde de debajo tiña el blanco del papel.
const PERGAMINO = Object.freeze({
  // `ControlBG` lo usan el fondo de un botón Y el agarre del deslizador
  // (widgets.js, `Button` y `Slider`). Empezó igual que la vitela y el resultado
  // fue que **el agarre era invisible**: se vio en la primera captura contra la
  // pintura, no leyendo. Tiene que separarse de la página a propósito.
  ControlBG: "#cfc7a9",
  ControlDarkBG: "#d4ccae",
  ControlText: "#403c27",
  BrightControlText: "#2a2719",
  DisabledText1: "#8e8a70",
  DisabledText2: "#8e8a70",
  TitleBG: "transparent",
  TitleText: "#4e4a30",
  BaseText: "#2a2719",
  DimBaseText: "#625e45",
  BrightBaseText: "#4e4a30",
  ListBG: "rgba(176,170,140,.26)",
  SelectionBG: "#6f6a46",
  SelectedText: "#f2eedb",
  BorderBright: "#aaa484",
  BorderDark: "#948e70",
  SliderTrackColor: "#b8b194",
  SliderTickColor: "#7d785c",
  // ── LOS QUE FALTABAN ────────────────────────────────────────────────────
  //
  // La tabla empezó con los nombres que recordaba y salieron a la primera un
  // desplegable NEGRO y una flecha azul de Valve: `ComboBox` pide `WindowBG`,
  // `MenuButtonArrow`, `MenuBorder` y `ComboBoxBorder`, y ninguno estaba. La
  // lista completa no se adivina, se saca:
  //
  //     grep -oh 'color("[A-Za-z0-9]*"' src/vgui2/*.js | sort -u
  //
  // y lo mismo con `borde(`. Los que se pasan como opción a `etiqueta()`
  // —`DimBaseText`, `DisabledText2`, `SelectedText`— no salen en ese grep y hay
  // que leerlos de `opciones.js` y `servidores.js`.
  WindowBG: "#eae5d0",          // el campo de un desplegable o una caja de texto
  WindowBgColor: "#eae5d0",
  WindowFgColor: "#2a2719",
  MenuButtonArrow: "#625e45",
  TextCursorColor: "#2a2719",
  CheckBgColor: "#eee9d6",
  CheckButtonCheck: "#403c27",
  CheckButtonBorder1: "#8c8768",
  CheckButtonBorder2: "#aaa484",
});

/** Los bordes. En un libro no hay biseles: hay rayas de tinta, o no hay nada. */
const BORDES_PERGAMINO = Object.freeze({
  FrameBorder: "0 26px 70px rgba(0,0,0,.66), 0 0 0 1px #5e5a3f",
  ButtonBorder: "inset 0 0 0 1px #8c8768",
  // El nombre es `ButtonDepressedBorder` y no `DepressedBorder`: es el que pide
  // `Button` al hundirse (widgets.js). Con el nombre mal, `borde()` devolvía
  // `"none"` y pulsar un botón no se notaba.
  ButtonDepressedBorder: "inset 0 2px 3px rgba(42,39,25,.38)",
  ButtonKeyFocusBorder: "inset 0 0 0 2px #4e4a30",
  TabBorder: "none",
  BrowserBorder: "inset 0 0 0 1px #aaa484",
  BaseBorder: "inset 0 0 0 1px #aaa484",
  ComboBoxBorder: "inset 0 0 0 1px #8c8768",
  MenuBorder: "0 10px 26px rgba(0,0,0,.42), inset 0 0 0 1px #8c8768",
});

/** Lo que ya se avisó, para no repetirlo sesenta veces por segundo. */
const AVISADOS = new Set();

/**
 * El tema de pergamino.
 *
 * Hereda de `Tema` y sólo cambia los colores, los bordes y la letra: `texto()`
 * —el que resuelve `#GameUI_SoundEffectVolume` contra `gameui_english.txt`— se
 * queda tal cual, porque las etiquetas del juego son del juego pase lo que pase
 * con el aspecto. Cambiar la piel no es traducir.
 */
export class TemaCodice extends Tema {
  color(nombre) {
    const c = PERGAMINO[nombre];
    if (c) return c;
    // UN NOMBRE QUE FALTA NO PUEDE QUEDARSE CALLADO, que es la regla de las
    // tablas de ajustes aplicada aquí. No se cae a `super.color()` porque eso
    // mete un color de Valve en una ventana de pergamino y luego nadie sabe de
    // dónde salió —pasó, y fue una flecha azul—; y no se devuelve algo
    // razonable en silencio porque entonces el hueco no se encuentra nunca.
    // Se avisa una vez por nombre y se da tinta, que al menos se lee.
    if (!AVISADOS.has(nombre)) {
      AVISADOS.add(nombre);
      console.warn(`códice: falta el color "${nombre}" en la paleta de pergamino`);
    }
    return PERGAMINO.BaseText;
  }

  borde(nombre) {
    const b = BORDES_PERGAMINO[nombre];
    if (b !== undefined) return b;
    if (!AVISADOS.has(nombre)) {
      AVISADOS.add(nombre);
      console.warn(`códice: falta el borde "${nombre}" en la paleta de pergamino`);
    }
    return "none";
  }

  get letra() { return `14px "IM Fell English", Georgia, "Times New Roman", serif`; }
  get letraPequena() { return `12px "IM Fell English", Georgia, "Times New Roman", serif`; }
}

/** El tema que toca. Es lo único que `montar.js` necesita saber de este archivo. */
export function temaDe(ficha, altoPantalla, aspecto = ACTIVO) {
  return conCaja(aspecto)
    ? new Tema(ficha, altoPantalla)
    : new TemaCodice(ficha, altoPantalla);
}

const el = (tag, clase = "") => {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  return n;
};

/**
 * EL MARCO DEL LIBRO. Misma interfaz que `Frame` —`nodo`, `cuerpo`, `cerrar()`—
 * para que las tres ventanas no noten el cambio.
 *
 * Dos diferencias deliberadas con `Frame`, y las dos son la misma idea:
 *
 *   - **No se mueve.** `Frame` se arrastra por la barra de título, y aquí no hay
 *     barra que arrastrar. Un libro abierto delante de ti está centrado.
 *   - **`x` e `y` se ignoran.** `montar.js` los calcula para centrar la ventana
 *     a mano contra un tamaño escrito; el libro se centra solo con CSS y así
 *     sigue centrado cuando cambia la ventana del juego, que es más de lo que
 *     hacía el otro.
 */
export class MarcoCodice {
  constructor(tema, { titulo = "", ancho = 535, alto = 422, alCerrar = null,
                      conIndice = true } = {}) {
    this.tema = tema;
    this.alCerrar = alCerrar;
    // SIN ÍNDICE NO ES UN LIBRO ABIERTO: ES UNA NOTA. Y tiene que medir lo que
    // mida su contenido.
    //
    // Empezó midiendo lo mismo en los dos casos, y el diálogo de «Quit» —dos
    // líneas— salía de 700x490 con el canal del lomo marcado en medio sin tener
    // ninguna cinta a la izquierda. Una página en blanco del tamaño de la
    // pantalla para preguntar sí o no.
    this.nodo = el("div", `v2-ventana v2-codice${conIndice ? "" : " v2-codice-nota"}`);
    this.nodo.style.boxShadow = tema.borde("FrameBorder");
    if (conIndice) {
      // El ancho mínimo sale de que la columna de cintas se lleva 176 px: con
      // los 535 de la captura de «Options» la página quedaría en 359, y ahí no
      // caben ni las puntas numeradas de un deslizador.
      this.nodo.style.width = `min(92vw, ${Math.max(ancho + 200, 700)}px)`;
      this.nodo.style.height = `min(86vh, ${Math.max(alto, 430) + 60}px)`;
    } else {
      this.nodo.style.width = `min(92vw, ${ancho}px)`;
      this.nodo.style.height = "auto";
      this.nodo.style.maxHeight = "86vh";
    }

    const cabecera = el("div", "v2-codice-cabecera");
    const t = el("div", "v2-codice-titulo");
    t.textContent = tema.texto(titulo);
    t.style.color = tema.color("TitleText");

    // CERRAR TIENE QUE VERSE. Esto empezó sin ningún botón —«un libro no tiene
    // una X»— y el resultado fue que **«Servers» no se podía cerrar**: es la
    // única de las tres sin pie, así que su única salida era la Escape, que no
    // se descubre mirando. Lo dijo el jugador la primera vez que lo abrió.
    //
    // Lo que sí se mantiene de aquella idea es que no se arrastra: no hay barra
    // de título, hay una cabecera con el nombre escrito y una salida al lado.
    // La clase es `v2-cerrar`, la misma que la X de `Frame`, porque hace lo
    // mismo y porque quien la busque la va a buscar por ahí.
    const salir = el("button", "v2-cerrar v2-codice-cerrar");
    salir.type = "button";
    salir.setAttribute("aria-label", "Close");
    salir.textContent = "✕";
    salir.style.color = tema.color("DimBaseText");
    salir.onclick = () => this.cerrar();

    cabecera.append(t, salir);

    this.cuerpo = el("div", "v2-cuerpo");
    this.nodo.append(cabecera, this.cuerpo);
  }

  cerrar() {
    this.nodo.hidden = true;
    this.alCerrar?.();
  }
}

/**
 * LAS CINTAS. Misma interfaz que `PropertySheet` —`nodo`, `anadir()`,
 * `elegir()`, `activa`, `titulos`— y el mismo reparto de clases, para que las
 * sondas que pulsan `.v2-pestana` sigan pulsando lo mismo.
 *
 * Lo que cambia es que la fila es una COLUMNA y vive en la página izquierda.
 */
export class IndiceCodice {
  constructor(tema) {
    this.tema = tema;
    this.paginas = [];
    this.activa = 0;
    this.nodo = el("div", "v2-cuerpo v2-codice-doble");
    this.barra = el("div", "v2-pestanas v2-codice-cintas");
    this.hoja = el("div", "v2-hoja v2-codice-pagina");
    this.nodo.append(this.barra, this.hoja);
  }

  anadir(titulo, contenido) {
    const i = this.paginas.length;
    const b = el("button", "v2-pestana v2-codice-cinta");
    b.type = "button";
    b.textContent = this.tema.texto(titulo);
    b.style.font = this.tema.letra;
    b.onclick = () => this.elegir(i);
    this.barra.appendChild(b);
    this.paginas.push({ titulo, contenido, boton: b, nodo: null });
    // Todas, no sólo la primera: ver la nota en `PropertySheet.anadir`.
    this.elegir(this.activa);
    return this;
  }

  elegir(i) {
    if (i < 0 || i >= this.paginas.length) return;
    this.activa = i;
    for (const [j, p] of this.paginas.entries()) {
      const suya = j === i;
      p.boton.dataset.activa = suya ? "si" : "no";
      p.boton.style.color = this.tema.color(suya ? "SelectedText" : "ControlText");
      p.boton.style.background = this.tema.color(suya ? "SelectionBG" : "ControlDarkBG");
      p.boton.style.fontWeight = suya ? "600" : "400";
    }
    const p = this.paginas[i];
    if (!p.nodo) p.nodo = typeof p.contenido === "function" ? p.contenido() : p.contenido;
    this.hoja.replaceChildren(p.nodo ?? el("div"));
  }

  get titulos() { return this.paginas.map((p) => p.titulo); }
}

/**
 * Qué par de cáscaras toca. Las tres ventanas piden esto y construyen lo que
 * salga, que es todo lo que hace falta para que el aspecto sea una palabra.
 */
export function cascara(aspecto = ACTIVO) {
  return conCaja(aspecto)
    ? { Marco: Frame, Hojas: PropertySheet, conCaja: true }
    : { Marco: MarcoCodice, Hojas: IndiceCodice, conCaja: false };
}

/**
 * El CSS del códice. Sólo disposición y las dos formas que no se pueden hacer
 * con un color —la cola de golondrina de la cinta y el canal del lomo—: lo demás
 * lo ponen los widgets desde el tema, como siempre.
 */
export const CSS_CODICE = `
.v2-codice { border-radius: 2px;
  /* El canal del lomo, entre la columna de cintas y la página. Y la vitela, en
     diagonal para que las dos páginas no sean del mismo tono plano.
     LOS ALFAS NO SON DECORACIÓN: dejan que el verde del cuadro tiña el papel,
     que es lo que mete el libro en la escena en vez de pegarlo encima. Es la
     misma idea que el ControlBG "0 0 0 128" de VGUI2, con mucho menos paso:
     un papel no es un cristal.
     (Sin comillas invertidas: esto vive dentro de una plantilla que las usa,
     y cerrarla da un SyntaxError a cien líneas de distancia.) */
  background:
    linear-gradient(to right, transparent 170px, rgba(60,56,38,.24) 176px, transparent 183px),
    linear-gradient(135deg, rgba(234,230,210,.955) 0%, rgba(225,220,197,.945) 44%,
                    rgba(214,209,185,.94) 100%);
  left: 50% !important; top: 50% !important;
  transform: translate(-50%, -50%); }

/* Una NOTA: sin cintas y por tanto sin canal del lomo. La vitela se queda. */
.v2-codice-nota { background:
  linear-gradient(135deg, rgba(234,230,210,.955) 0%, rgba(218,213,190,.94) 100%); }
.v2-codice-nota .v2-cuerpo { overflow: visible; }
.v2-codice-nota .v2-codice-titulo { padding-left: 22px; }

.v2-codice-cabecera { flex: 0 0 auto; display: flex; align-items: center;
  padding: 13px 14px 9px 18px; }
.v2-codice-titulo { flex: 1 1 auto; text-align: center; padding-left: 22px;
  letter-spacing: .2em; text-transform: uppercase;
  font: 600 17px/1 Cinzel, "Trajan Pro", Georgia, serif; }
/* La salida: discreta, sin caja y sin bisel. Que esté no se discute; que grite,
   sí — en un libro la X de Windows sería justo lo que este aspecto vino a
   quitar. El área de pulsado es de 22 px aunque el aspa mida menos. */
.v2-codice-cerrar { flex: 0 0 auto; width: 22px; height: 22px; border: 0;
  background: transparent; cursor: pointer; font-size: 13px; line-height: 1;
  opacity: .55; transition: opacity .12s ease; }
.v2-codice-cerrar:hover { opacity: 1; }

.v2-codice-doble { display: flex; flex-direction: row; height: 100%; }

.v2-codice-cintas { flex: 0 0 176px; flex-direction: column; flex-wrap: nowrap;
  align-items: stretch; gap: 3px; padding: 10px 0 14px 14px;
  align-content: start; overflow: auto; }
.v2-codice-cinta { text-align: left; padding: 7px 24px 7px 13px;
  letter-spacing: .04em;
  /* La cola de golondrina, que es lo que la hace leerse como una cinta de tela
     y no como una pestaña con otro color. */
  clip-path: polygon(0 0, 100% 0, calc(100% - 10px) 50%, 100% 100%, 0 100%); }

.v2-codice-pagina { flex: 1 1 auto; padding: 10px 20px 14px; overflow: auto; }

/* El pie del libro: sin botones de caja, una sola salida escrita a mano alzada.
   Ver \`conCaja\`: aquí los cambios entran al tocarlos y no hay nada que aceptar. */
.v2-codice .v2-pie { justify-content: flex-end; padding: 0 20px 14px; }
.v2-codice .v2-pie .v2-boton { background: transparent !important;
  box-shadow: none !important; border-bottom: 1px solid #9d7b40 !important;
  border-radius: 0; padding: 4px 3px; font-style: italic; }

@media (max-width: 760px) {
  .v2-codice { background: linear-gradient(135deg, #efe5ca 0%, #e1d2ae 100%); }
  .v2-codice-doble { flex-direction: column; }
  .v2-codice-cintas { flex: 0 0 auto; flex-direction: row; flex-wrap: wrap;
    padding: 8px 14px; }
  .v2-codice-cinta { flex: 0 0 auto; }
}
`;
