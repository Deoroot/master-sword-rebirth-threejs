// LOS CINCO SITIOS DONDE EL JUEGO TE ESCRIBE ENCIMA, dibujados.
//
// La regla está en `src/play/nivel.js` (el cartel), `src/play/muerte.js` (el
// velo) y `src/play/aviso.js` (las dos ventanas). Aquí sólo hay DOM.
//
//   el velo      la pantalla a medias roja de morir. `gmsgFade`.
//   el centrado  «<nombre> has fallen!», en medio y grande. `HUD_PRINTCENTER`.
//   el cartel    «Swordsmanship Proficiency +1», escrito letra a letra.
//                `TE_TEXTMESSAGE` con `effect 2`.
//   la ventana   un título rojo y un texto, ARRIBA A LA IZQUIERDA, ocho
//                de aviso  segundos. `SendHUDMsg` → `AddInfoWin`. Es la del 60.
//   la de ayuda  lo mismo arriba a la DERECHA y con el título verde.
//                `SendHelpMsg` → `AddHelpWin`.
//
// La consola de sucesos —lo sexto que escribe— ya estaba y no es esto: vive en
// `src/juego/hudms.js` y es la que se lleva los `SendInfoMsg`.
//
// ── LAS DOS VENTANAS SON DEL 60, y llegan arreglando un sitio equivocado ────
//
// Hasta el 60 no existían, y lo que el mod manda por `SendHUDMsg` se iba a la
// consola de sucesos: la presentación del mapa y el anuncio de subir de nivel
// salían abajo a la derecha, en la esquina de «3.4 damage to Goblin», cuando
// en el juego son recuadros en la de arriba. Se leía igual de bien y por eso
// aguantó: un mensaje en la esquina que no es no da ningún error. El porqué de
// cada uno, con su cita, está en la cabecera de `src/play/aviso.js`.
//
// ── Lo que aquí es NUESTRO, y por qué ───────────────────────────────────────
//
// De las tres, **dos las dibuja el motor y no el SDK**. `CenterPrint` es
// `gEngfuncs.pfnCenterPrint` (`text_message.cpp:198-200`) y el velo lo pinta el
// motor con el struct de `common/screenfade.h`. El código de las dos no viene
// con el mod, así que aquí no hay `archivo:línea` de la colocación ni del tipo
// de letra: hay los VALORES que el mod manda, que sí están citados, y una
// colocación nuestra que imita la de GoldSrc y se dice que es nuestra.
//
// El cartel es el caso contrario: `CHudMessage` está entero en el SDK
// (`game/client/message.cpp`) y va portado línea a línea, erratas incluidas.

import { CARTEL, colorDeLetra, finDelAguante } from "../play/nivel.js";
import { alfaDelDesvanecido, DESVANECIDO } from "../play/muerte.js";
import { XRES, YRES } from "../play/hud.js";
import {
  AVISO, COLOR_TEXTO, PilaDeAvisos, anclaDelAviso, anclaDeLaAyuda,
} from "../play/aviso.js";

/**
 * Cuánto se queda el centrado. `scr_centertime` del motor, que vale 2.
 *
 * Es una cvar del motor y no del mod, así que no hay dónde citarla dentro de
 * esta carpeta: se pone su valor por defecto y se deja dicho que es eso.
 */
export const CENTRADO_DURA = 2.0;

/** La fuente de los carteles. La misma del HUD: el esquema «Briefing Text». */
const FUENTE = `'Sitka Text', 'Sitka', Georgia, 'Times New Roman', serif`;

const CSS = `
.ms-msg { position: absolute; inset: 0; pointer-events: none; z-index: 25;
  font-family: ${FUENTE}; overflow: hidden; }
.ms-velo { position: absolute; inset: 0; }
.ms-centro { position: absolute; left: 0; right: 0; text-align: center;
  color: #fff; text-shadow: 0 2px 4px #000, 0 0 6px #000; white-space: pre-line; }
.ms-cartel { position: absolute; white-space: pre; }
.ms-cartel > span { white-space: pre; }
.ms-aviso { position: absolute; padding: ${AVISO.margen}px;
  border: ${AVISO.borde}px solid transparent; }
.ms-aviso > b { display: block; font-weight: normal; white-space: pre;
  font-family: 'Courier New', Courier, monospace;
  margin-bottom: ${AVISO.bajoElTitulo}px; }
.ms-aviso > p { margin: 0; white-space: pre-wrap; }
`;

const el = (tag, clase = "") => {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  return n;
};

/**
 * Monta la capa.
 *
 * Va POR ENCIMA del HUD (z 25 contra 20) y por debajo de los paneles, que es
 * el orden del juego: el cartel de subir de nivel se ve sobre las barras, y
 * abrir el inventario lo tapa.
 */
export function montarMensajes({ raiz = document.body } = {}) {
  if (!document.getElementById("ms-msg-css")) {
    const s = el("style"); s.id = "ms-msg-css"; s.textContent = CSS;
    raiz.appendChild(s);
  }
  const nodo = el("div", "ms-msg");
  raiz.appendChild(nodo);

  const velo = el("div", "ms-velo");
  velo.style.background = "transparent";
  nodo.appendChild(velo);

  const centro = el("div", "ms-centro");
  centro.hidden = true;
  nodo.appendChild(centro);

  /** Los carteles vivos. `MAX_HUD_MESSAGES` es 16 en `message.h`. */
  const MAXIMOS = 16;
  const carteles = [];

  let desvanecido = null;   // `{ t, d }` mientras dure
  let centrado = null;      // `{ t, texto }`

  /**
   * Las dos pilas de ventanas. Son DOS y no una lista con una marca porque en
   * el mod son dos `std::vector` distintos (`m_InfoWindows`, `m_HelpWindows`):
   * se apilan por separado, cada una desde su esquina, y una ayuda no empuja a
   * un aviso.
   */
  const pilas = {
    aviso: new PilaDeAvisos("aviso"),
    ayuda: new PilaDeAvisos("ayuda"),
  };
  /** El `div` de cada ventana viva, por la ventana que lo dibuja. */
  const nodosDeVentana = new Map();

  function medidas() {
    const w = nodo.clientWidth || window.innerWidth;
    const h = nodo.clientHeight || window.innerHeight;
    // El centrado de GoldSrc sale sobre el tercio superior y con letra grande.
    // Las dos cosas son NUESTRAS: se eligen para que no se pise con el cartel
    // de subir de nivel, que va al 60 % del alto y a la izquierda.
    centro.style.top = `${Math.round(h * 0.33)}px`;
    centro.style.fontSize = `${Math.max(16, Math.round(YRES(22, h)))}px`;
    centro.style.lineHeight = "1.3";
    for (const c of carteles) colocar(c, w, h);
    // Las ventanas se vuelven a medir y a colocar: su alto sale del texto y el
    // texto se reparte distinto en otra anchura.
    pasoDeLasVentanas(0);
  }

  function colocar(c, w, h) {
    // `XRES`/`YRES` no: el motor multiplica la x y la y del `hudtextparms_t`
    // por el ancho y el alto de la pantalla tal cual —son fracciones, no
    // píxeles de 640×480— y eso es lo que hace `XPosition`/`YPosition`
    // (`message.cpp:95-129`). Así que aquí van igual.
    c.nodo.style.left = `${Math.round(CARTEL.x * w)}px`;
    c.nodo.style.top = `${Math.round(CARTEL.y * h)}px`;
    c.nodo.style.fontSize = `${Math.max(11, Math.round(YRES(14, h)))}px`;
  }

  /**
   * Un cartel nuevo. Devuelve `false` si no había hueco, que es lo que hace
   * `MessageAdd` cuando las dieciséis ranuras están llenas.
   */
  function cartel(texto) {
    if (carteles.length >= MAXIMOS) return false;
    const n = el("div", "ms-cartel");
    // Una `span` por carácter: el efecto 2 le da a cada letra su color y su
    // instante, así que no se puede pintar la línea de un color.
    const letras = [...texto].map((ch) => {
      const s = document.createElement("span");
      s.textContent = ch;
      n.appendChild(s);
      return s;
    });
    nodo.appendChild(n);
    // `m_parms.length` es el texto ENTERO, saltos de línea incluidos: es lo que
    // cuenta el bucle de `MessageDrawScan` (`message.cpp:243-252`).
    const c = { nodo: n, letras, largo: texto.length, t: 0, texto };
    carteles.push(c);
    colocar(c, nodo.clientWidth || window.innerWidth, nodo.clientHeight || window.innerHeight);
    return true;
  }

  // ── LAS DOS VENTANAS ──────────────────────────────────────────────────────

  /**
   * Un aviso: `SendHUDMsg(Title, Text)`, o sea `AddInfoWin`. Arriba a la
   * izquierda, título rojo, ocho segundos.
   *
   * `ayuda` cambia las tres cosas que el mod cambia y nada más: la esquina, el
   * color del título y la duración.
   */
  function ventana(clase, titulo, texto) {
    const v = pilas[clase].poner(titulo, texto);
    const n = el("div", "ms-aviso");
    const t = document.createElement("b");
    t.textContent = v.titulo;
    const p = document.createElement("p");
    p.textContent = v.texto;
    n.appendChild(t); n.appendChild(p);
    nodo.appendChild(n);
    nodosDeVentana.set(v, n);
    // Un tic de cero: coloca la nueva y **recoloca las que ya estaban**, que es
    // lo que hace `UpdateInfoWindows` — una ventana nueva no empuja a la de
    // arriba, se pone debajo, y para saber dónde hace falta el alto de todas.
    pasoDeLasVentanas(0);
    return v;
  }

  /**
   * Lo que el mod llama `Resize()`, y trae DOS cosas que no se adivinan.
   *
   * 1. **El cuerpo se parte a 114 píxeles y el título no.** El `TextPanel` nace
   *    con `INFOWIN_INTIAL_SIZE_X - (INFOWIN_SPACER_BORDER * 2)` de ancho —120
   *    menos 6— y ahí dentro se parte solo; el título es una `Label`, que no se
   *    parte nunca. Luego `Resize()` coge `V_max(TitleX, TextX)`, así que un
   *    título largo ensancha el recuadro y un texto largo sólo lo alarga. Ésa
   *    es la forma que tienen estas ventanas en el juego: estrechas y altas.
   *    vgui_infowin.h:46, 76-87.
   * 2. **Ese 120 no pasa por `XRES`.** Las posiciones sí (`INFOWIN_DISPLAY_X` es
   *    `XRES(20)`) y el tamaño no: son píxeles de pantalla tal cual, o sea que
   *    en 1920 la columna sigue midiendo lo mismo y se ve más estrecha. Va
   *    portado literal, que es lo que hay en la pantalla del jugador.
   *
   * ── CORRECCIÓN DEL 63 ────────────────────────────────────────────────────
   *
   * El punto 1 es falso, y lo enseñó una captura del juego de verdad: «This
   * village grew around the temple of Urdual of the southern frontier.» sale
   * **en una línea**, unos 330 píxeles de ancho, no partida en once líneas de
   * dos palabras. Lo que faltaba por portar es que `SetText` **reajusta el
   * panel al tamaño de su propio texto** justo después de ponerlo:
   *
   *     Text->setText(NewText);
   *     Text->getTextImage()->getSize(TextX, TextY);
   *     Text->setSize(TextX, TextY);
   *                                            vgui_infowin.h:68-71
   *
   * O sea que el 114 de nacimiento **no es donde se parte el texto**: es el
   * ancho con el que nace el panel, y la línea siguiente lo tira. Luego
   * `Resize()` toma `V_max(TitleX, TextX)` como antes.
   *
   * Lo que NO se puede citar es qué hace exactamente `TextImage::getSize` con
   * un texto largo: al lado sólo están las CABECERAS de VGUI
   * (`vgui-dev-…/include/VGUI_TextImage.h:41-42` declara `getTextSize` y
   * `getTextSizeWrapped`, sin cuerpo). Así que aquí va lo medido —no se parte—
   * y **el tope es nuestro**: la mitad de la pantalla, para que un `infomsg`
   * largo no se salga por el borde. Cuando aparezca el cuerpo de VGUI, esto se
   * corrige al lado, como esta nota.
   */
  const ANCHO_AL_NACER = 120 - AVISO.margen * 2;
  /** El tope es NUESTRO, no del mod: ver la corrección del 63 de arriba. */
  const TOPE_NUESTRO = 0.5;

  function medirVentana(v, n, w, h) {
    // La letra: el cuerpo es el del esquema «Briefing Text» y el título ese
    // mismo MÁS DOS y en Courier, que es la única fuente que el mod nombra a
    // mano en todo el HUD (`new Font("Courier", pFont->getTall() + 2, …)`,
    // vgui_infowin.h:41).
    const cuerpo = Math.max(11, Math.round(YRES(14, h) * 0.9));
    n.style.fontSize = `${cuerpo}px`;
    n.firstChild.style.fontSize = `${cuerpo + 2}px`;
    // El cuerpo se queda con SU ancho —`setSize(TextX, TextY)`— y sólo se parte
    // si no cabe en media pantalla. `ANCHO_AL_NACER` se conserva como mínimo
    // porque es el ancho con el que el panel nace y ninguna ventana del juego
    // es más estrecha que eso.
    n.lastChild.style.maxWidth = `${Math.max(ANCHO_AL_NACER, Math.round(w * TOPE_NUESTRO))}px`;
    // `getTall()`: lo mide el navegador, que es quien sabe cuánto ocupa el
    // texto. Es el dato que la pila necesita para apilar, y sin él no se puede.
    v.alto = n.offsetHeight;
    v.ancho = n.offsetWidth;
  }

  function pintarVentana(v, n, w, h) {
    const esAyuda = pilas.ayuda.ventanas.includes(v);
    // Sólo la x, porque `v.y` ya la trae puesta la pila en píxeles de pantalla
    // —se le pasa el ancla escalada como `arriba`—. La de la ayuda depende de
    // su ancho porque el mod la coloca DESPUÉS de medirla.
    const x = esAyuda ? anclaDeLaAyuda(w, h, v.ancho ?? 0).x : anclaDelAviso(w, h).x;
    n.style.left = `${x}px`;
    n.style.top = `${Math.round(v.y)}px`;
    // El alfa del motor es al revés que el de CSS: 0 opaco, 255 invisible.
    const op = (255 - (v.alfa ?? 255)) / 255;
    const [tr, tg, tb] = v.color;
    const [cr, cg, cb] = COLOR_TEXTO;
    n.firstChild.style.color = `rgba(${tr}, ${tg}, ${tb}, ${op.toFixed(3)})`;
    n.lastChild.style.color = `rgba(${cr}, ${cg}, ${cb}, ${op.toFixed(3)})`;
    // Y el fondo, que nunca llega a opaco: `INFOWIN_BKTRANS` lo deja en 128.
    const fondo = (255 - (v.alfaFondo ?? 255)) / 255;
    n.style.background = `rgba(0, 0, 0, ${fondo.toFixed(3)})`;
  }

  /**
   * Un tic de las dos pilas. `UpdateInfoWindows`, vgui_hud.cpp:358-371.
   *
   * Se mide ANTES de pasar el tic porque el alto es lo que la pila usa para
   * apilar, y el texto puede haber cambiado de alto al cambiar el tamaño de la
   * ventana del navegador — que en el juego no pasa y aquí sí.
   */
  function pasoDeLasVentanas(dt) {
    const w = nodo.clientWidth || window.innerWidth;
    const h = nodo.clientHeight || window.innerHeight;
    const espaciado = YRES(AVISO.espaciado, h);
    for (const clase of ["aviso", "ayuda"]) {
      const pila = pilas[clase];
      if (!pila.ventanas.length) continue;
      for (const v of pila.ventanas) {
        const n = nodosDeVentana.get(v);
        if (n) medirVentana(v, n, w, h);
      }
      const arriba = clase === "ayuda" ? anclaDeLaAyuda(w, h, 0).y : anclaDelAviso(w, h).y;
      for (const ida of pila.paso(dt, { arriba, espaciado })) {
        nodosDeVentana.get(ida)?.remove();
        nodosDeVentana.delete(ida);
      }
      for (const v of pila.ventanas) {
        const n = nodosDeVentana.get(v);
        if (n) pintarVentana(v, n, w, h);
      }
    }
  }

  /** El centrado. `CenterPrint(ConvertCRtoNL(psz))`, `text_message.cpp:200`. */
  function centrar(texto) {
    centrado = { t: 0, texto: String(texto ?? "").replace(/\r/g, "\n") };
    centro.textContent = centrado.texto;
    centro.hidden = false;
  }

  /**
   * Arranca el velo. `d` son los seis números de `gmsgFade`.
   *
   * Se pinta YA y no en el `paso` siguiente: el mensaje del motor lo pinta el
   * mismo fotograma en que llega, y esperar al reloj deja un fotograma sin
   * rojo justo en el instante en que te matan — que es el único que importa.
   */
  function desvanecer(d = DESVANECIDO) {
    desvanecido = { t: 0, d };
    pintarVelo();
  }

  function pintarVelo() {
    const a = desvanecido ? alfaDelDesvanecido(desvanecido.t, desvanecido.d) : 0;
    const [r, g, b] = desvanecido?.d.color ?? [0, 0, 0];
    velo.style.background = a > 0 ? `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(4)})` : "transparent";
  }

  /**
   * Lo apaga de golpe, que es lo que hace reaparecer.
   *
   * LAS VENTANAS NO SE VAN AQUÍ, y es a propósito: quien las borra en el mod es
   * `CHUDPanel::Initialize`, que corre **al empezar un nivel** y no al
   * reaparecer (vgui_hud.cpp:384-393). Mueres con el aviso de dificultad en
   * pantalla y al volver sigue ahí, contando sus ocho segundos. Para eso está
   * `limpiarVentanas`, que es lo que habrá que llamar el día que se pueda
   * cambiar de mapa sin recargar.
   */
  function limpiar() {
    desvanecido = null;
    velo.style.background = "transparent";
    centrado = null; centro.hidden = true; centro.textContent = "";
    for (const c of carteles) c.nodo.remove();
    carteles.length = 0;
  }

  /** `Initialize()`: al empezar un nivel se van las dos pilas. */
  function limpiarVentanas() {
    for (const clase of ["aviso", "ayuda"]) {
      for (const v of pilas[clase].limpiar()) {
        nodosDeVentana.get(v)?.remove();
        nodosDeVentana.delete(v);
      }
    }
  }

  function paso(dt) {
    if (!(dt > 0)) dt = 0;

    pasoDeLasVentanas(dt);

    if (desvanecido) {
      desvanecido.t += dt;
      // El alfa del mensaje es de 0 a 255 y en CSS va de 0 a 1.
      pintarVelo();
      // El aguante es lo que tarda en OLVIDARSE, no en irse: pasado
      // `duracion + aguante` el motor borra el struct. Hasta entonces el velo
      // sigue existiendo aunque su alfa sea cero.
      if (desvanecido.t > desvanecido.d.duracion + desvanecido.d.aguante) desvanecido = null;
    }

    if (centrado) {
      centrado.t += dt;
      if (centrado.t > CENTRADO_DURA) { centrado = null; centro.hidden = true; }
    }

    for (let i = carteles.length - 1; i >= 0; i--) {
      const c = carteles[i];
      c.t += dt;
      // Se va cuando la mezcla del final ha llegado a 255, o sea
      // `fadein·largo + holdtime + fadeout`.
      if (c.t > finDelAguante(c.largo) + CARTEL.salida) {
        c.nodo.remove(); carteles.splice(i, 1); continue;
      }
      for (let k = 0; k < c.letras.length; k++) {
        const [r, g, b] = colorDeLetra(k, c.t, { largo: c.largo });
        c.letras[k].style.color = `rgb(${r}, ${g}, ${b})`;
      }
    }
  }

  const alRedimensionar = () => medidas();
  addEventListener("resize", alRedimensionar);
  medidas();

  return {
    nodo, cartel, centrar, desvanecer, limpiar, paso, medidas, limpiarVentanas,
    /** `SendHUDMsg`: el recuadro de arriba a la izquierda, título rojo. */
    aviso: (titulo, texto) => ventana("aviso", titulo, texto),
    /** `SendHelpMsg`: el de arriba a la derecha, título verde. */
    ayuda: (titulo, texto) => ventana("ayuda", titulo, texto),
    /** Lo que se ve ahora mismo, para las sondas. */
    estado() {
      return {
        velo: {
          activo: Boolean(desvanecido),
          t: desvanecido ? Number(desvanecido.t.toFixed(3)) : 0,
          fondo: velo.style.background,
          alfa: desvanecido ? Math.round(alfaDelDesvanecido(desvanecido.t, desvanecido.d)) : 0,
        },
        centrado: {
          visible: !centro.hidden,
          texto: centro.textContent,
          y: Math.round((nodo.clientHeight || window.innerHeight) * 0.33),
        },
        // Las dos pilas, con la esquina de cada recuadro LEÍDA DEL DOM y no
        // calculada: lo que se quiere saber es dónde está, no dónde debería.
        ventanas: ["aviso", "ayuda"].flatMap((clase) =>
          pilas[clase].ventanas.map((v) => {
            const n = nodosDeVentana.get(v);
            const r = n?.getBoundingClientRect?.();
            return {
              clase, titulo: v.titulo, texto: v.texto,
              t: Number(v.t.toFixed(3)), duracion: Number(v.duracion.toFixed(3)),
              alfa: v.alfa ?? 255, alfaFondo: v.alfaFondo ?? 255,
              color: [...v.color],
              x: r ? Math.round(r.left) : null, y: r ? Math.round(r.top) : null,
              ancho: r ? Math.round(r.width) : null, alto: r ? Math.round(r.height) : null,
            };
          })),
        carteles: carteles.map((c) => ({
          texto: c.texto, t: Number(c.t.toFixed(3)), largo: c.largo,
          // Las letras que YA han salido, que es lo que se lee en pantalla:
          // las que no han salido están ahí, en negro.
          salidas: c.letras.filter((_, k) => (k + 1) * CARTEL.entrada <= c.t).length,
          colores: c.letras.map((s) => s.style.color),
          x: parseInt(c.nodo.style.left, 10), y: parseInt(c.nodo.style.top, 10),
        })),
      };
    },
    destruir() { removeEventListener("resize", alRedimensionar); nodo.remove(); },
  };
}

export { XRES, YRES };
