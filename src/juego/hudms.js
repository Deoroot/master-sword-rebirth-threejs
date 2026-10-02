// EL HUD DE MASTER SWORD, dibujado. La regla está en `src/play/hud.js`.
//
// Esto es lo único de la pantalla de juego que hay: cuatro barras abajo con el
// emblema en medio, y la consola de sucesos abajo a la derecha. Nada más. El
// HUD de la sonda 03 —los contadores de «ANDADO 0.0 m» y el recuadro de teclas—
// sigue existiendo detrás de la **F3** y sigue siendo lo que era, una sonda.
//
// ── Por qué esto y no lo que había ──────────────────────────────────────────
//
// Lo que había era una línea negra abajo del todo que servía para tres cosas a
// la vez: decir por dónde va la carga («cargando texturas…»), contar lo que
// pasa en el juego («Flecha: 0.5 a Commoner») y dar los avisos. Una línea, un
// mensaje: el segundo tapa al primero y no queda rastro. En Master Sword eso
// son **dos sitios distintos** —la consola de sucesos, que apila cinco líneas y
// las va soltando, y las barras, que son estado y no mensajes— y separarlos es
// la mitad del trabajo de este experimento.
//
// La línea de carga se queda como estaba y con su nombre: es andamio del
// arranque, no interfaz de juego, y desaparece en cuanto el mapa está puesto.
//
// ── Lo que se dibuja y lo que no ────────────────────────────────────────────
//
//   está    las cuatro barras con su cifra, el emblema, la consola de sucesos
//           con sus cinco líneas, su decaimiento y su RePág/AvPág.
//   no está el HUD retro de los dos frascos (`cl_retrohud 1`), el panel de
//           identificación del objetivo («Giant Rat / Hostile»), la consola de
//           chat (`ms_txthud_*`), los iconos de estado de `sprites/hud/status/`
//           y las ventanas de ayuda. Están todos leídos y ninguno hecho.

import {
  ConsolaDeSucesos, CVARS, AJUSTES, XRES, YRES,
  colorDeSuceso, colorDeCifra, cuadroDeBarra, seguir, disposicionDelHud, seVeElHud,
  esquinaDeLaConsola,
  cargaVisible, cargaDelTiro,
} from "../play/hud.js";
// El nivel de carga, su color y su número viven con el resto de la regla del
// golpe, que es de donde sale la carga.
import { nivelDeCarga } from "../play/golpe.js";

/** El orden de pintado. Las cuatro claves son las de `hud.json`. */
const BARRAS = ["vida", "peso", "mana", "aguante"];

/**
 * El tipo de letra de la consola.
 *
 *     g_FontSml = getFont(getSchemeHandle("Briefing Text"));
 *                                       vgui_teamfortressviewport.cpp:563
 *     SchemeName = "Briefing Text" / FontName = "Sitka" / FontSize = 14
 *                                                     640_textscheme.txt:80
 *
 * Sitka es una fuente de Windows y no está en todas partes, así que detrás va
 * una pila de serifas. El tamaño lo da el esquema según la resolución: 14 en el
 * de 640 y 16 en el de 1920, o sea que escala pero muy poco.
 */
const FUENTE = `'Sitka Text', 'Sitka', Georgia, 'Times New Roman', serif`;

const CSS = `
.ms-hud { position: absolute; inset: 0; pointer-events: none; z-index: 20;
  font-family: ${FUENTE}; }
.ms-hud[hidden] { display: none !important; }
.ms-barra { position: absolute; background-repeat: no-repeat; image-rendering: pixelated; }
.ms-cifra { position: absolute; left: 0; right: 0; text-align: center;
  color: #fff; text-shadow: 0 1px 2px #000, 0 0 3px #000; font-variant-numeric: tabular-nums; }
.ms-emblema { position: absolute; image-rendering: pixelated; }
.ms-carga { position: absolute; background: rgba(128,128,128,0.39); border: 1px solid rgba(0,0,0,0.8); }
.ms-carga > i { display: block; height: 100%; width: 0; }
.ms-carga > b { position: absolute; inset: 0; text-align: center; font-weight: normal;
  color: #fff; text-shadow: 0 1px 2px #000, 0 0 3px #000; white-space: pre; overflow: hidden; }
.ms-consola { position: absolute; overflow: hidden; }
.ms-consola > div { white-space: pre; overflow: hidden; text-overflow: clip; }
.ms-ranura { position: absolute; white-space: pre; overflow: hidden;
  text-shadow: 0 1px 2px #000, 0 0 3px #000; }
`;

const el = (tag, clase = "") => {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  return n;
};

/**
 * Monta el HUD.
 *
 * `hud.json` es lo que hornea `npm run hud`. **Si no está, las barras no se
 * montan y la consola de sucesos sí**: la consola no necesita ningún asset, y
 * dejar al jugador sin los mensajes porque falta un `.png` sería perder lo que
 * más falta hace justo cuando algo va mal.
 */
export function montarHud({ raiz = document.body, ficha = null, ajustes = AJUSTES } = {}) {
  if (!document.getElementById("ms-hud-css")) {
    const s = el("style"); s.id = "ms-hud-css"; s.textContent = CSS;
    raiz.appendChild(s);
  }

  const nodo = el("div", "ms-hud");
  raiz.appendChild(nodo);

  // Las cuatro barras: un `div` con la tira de 43 cuadros de fondo, y el cuadro
  // se elige moviendo el fondo hacia arriba. Nada de recortar ni de redibujar.
  const cajas = {};
  const cifras = {};
  if (ficha?.barras) {
    for (const k of BARRAS) {
      const b = ficha.barras[k];
      if (!b) continue;
      const caja = el("div", "ms-barra");
      caja.style.backgroundImage = `url(${ficha.base ?? ""}${b.archivo})`;
      const cifra = el("div", "ms-cifra");
      caja.appendChild(cifra);
      nodo.appendChild(caja);
      cajas[k] = caja; cifras[k] = cifra;
    }
  }
  let emblema = null;
  if (ficha?.emblema) {
    emblema = el("img", "ms-emblema");
    emblema.src = `${ficha.base ?? ""}${ficha.emblema.archivo}`;
    emblema.alt = "";
    nodo.appendChild(emblema);
  }

  // Las dos barras de carga. Se montan siempre aunque casi nunca se vean: ver
  // `cargaVisible()` en la regla, que explica por qué un arco no la enseña.
  // Cada una lleva su relleno y su etiqueta: `m_Charge[i]` y `m_ChargeLbl[i]`,
  // la misma caja y el mismo sitio, con el texto centrado (`MSLabel::a_center`).
  const cargas = [el("div", "ms-carga"), el("div", "ms-carga")];
  for (const c of cargas) {
    c.appendChild(el("i"));
    c.appendChild(el("b"));
    c.hidden = true;
    nodo.appendChild(c);
  }

  // LA CONSOLA DE SUCESOS.
  const caja = el("div", "ms-consola");
  nodo.appendChild(caja);

  // LA ETIQUETA DEL CICLADOR, que en el motor es hija del mismo panel:
  //
  //     VGUI_QuickSlot(Panel *pParent)
  //       : Panel(XRES(170), ScreenHeight - QUICKSLOT_H, ScreenWidth, QUICKSLOT_H)
  //                                              vgui_quickslot.h:49
  //     #define QUICKSLOT_H YRES(14)
  //
  // Una tira de la altura de una línea pegada abajo del todo, que empieza a la
  // derecha de las barras y del emblema. No es un menú: es una palabra.
  const ranura = el("div", "ms-ranura");
  ranura.hidden = true;
  nodo.appendChild(ranura);

  // La regla de medir texto, que la consola necesita para partir las líneas.
  // Un `canvas` 2D y no un `div` de prueba: medir con el DOM obliga a un
  // reflow por línea, y esto corre dentro de `imprimir()`.
  const lienzo = document.createElement("canvas").getContext("2d");
  let cuerpoDeLetra = 14;
  const medir = (t) => { lienzo.font = `${cuerpoDeLetra}px ${FUENTE}`; return lienzo.measureText(t).width; };

  const consola = new ConsolaDeSucesos({
    historial: CVARS.ms_evthud_history,
    tamano: CVARS.ms_evthud_size,
    decaimiento: CVARS.ms_evthud_decaytime,
    medir,
  });

  // El estado que se ve, que persigue al de verdad. Empieza a cero a propósito:
  // así al entrar los vasos se llenan, que es lo que hace el juego.
  const visto = { vida: 0, mana: 0, peso: 0, aguante: 0 };
  /** El cuadro que enseña cada barra ahora mismo. Lo miran las sondas. */
  const cuadroVisto = { vida: 0, mana: 0, peso: 0, aguante: 0 };

  let disp = null;
  let altoDeLinea = 17;

  /** Recalcula todo lo que depende del tamaño de la ventana. */
  function medidas() {
    const w = nodo.clientWidth || window.innerWidth;
    const h = nodo.clientHeight || window.innerHeight;
    disp = disposicionDelHud(w, h, { ajustes });

    for (const k of BARRAS) {
      const caja = cajas[k]; if (!caja) continue;
      const b = ficha.barras[k];
      const r = disp.barras[k];
      caja.style.left = `${r.x}px`;
      caja.style.top = `${r.y}px`;
      caja.style.width = `${r.w}px`;
      caja.style.height = `${r.h}px`;
      // La tira entera escalada: ancho = el de la barra, alto = el de la barra
      // por los 43 cuadros. Mover el fondo un alto de barra es pasar de cuadro.
      caja.style.backgroundSize = `${r.w}px ${r.h * b.cuadros}px`;
      const c = cifras[k];
      c.style.top = `${disp.cifra.arriba}px`;
      c.style.fontSize = `${Math.max(9, disp.cifra.alto)}px`;
      c.style.lineHeight = `${Math.max(9, disp.cifra.alto)}px`;
    }
    if (emblema) {
      const e = disp.emblemaEn;
      emblema.style.left = `${e.x}px`; emblema.style.top = `${e.y}px`;
      emblema.style.width = `${e.w}px`; emblema.style.height = `${e.h}px`;
    }
    for (let i = 0; i < cargas.length; i++) {
      const c = disp.carga[i];
      cargas[i].style.left = `${c.x}px`; cargas[i].style.top = `${c.y}px`;
      cargas[i].style.width = `${c.w}px`; cargas[i].style.height = `${c.h}px`;
      // La etiqueta ocupa la misma caja que la barra, que mide seis píxeles de
      // alto sobre 480: el número no cabe dentro y en el juego tampoco cabe.
      // Se le da el alto de la caja y se deja desbordar hacia arriba, que es lo
      // que hace VGUI con una `MSLabel` más alta que su panel.
      const letra = cargas[i].childNodes[1];
      letra.style.fontSize = `${Math.max(9, Math.round(c.h * 1.6))}px`;
      letra.style.lineHeight = `${c.h}px`;
    }

    // La consola: cuerpo de letra del esquema —14 sobre 480 de alto— y su
    // sitio, que es abajo a la derecha y crece hacia arriba.
    cuerpoDeLetra = Math.max(11, Math.round(14 * (h / 480) * 0.62));
    altoDeLinea = Math.round(cuerpoDeLetra * 1.25);
    // Su sitio ya no se calcula aquí: es `esquinaDeLaConsola`, en la regla,
    // porque desde el 60 hay que poder compararlo con el de la ventana de
    // aviso sin abrir un navegador.
    const esquina = esquinaDeLaConsola(w, h);
    const anchoConsola = esquina.w;
    consola.ancho = anchoConsola - 4;
    caja.style.font = `${cuerpoDeLetra}px ${FUENTE}`;
    caja.style.width = `${anchoConsola}px`;
    caja.style.left = `${esquina.x}px`;
    caja.style.background = consola.fondo;
    // `EVENTCON_Y = YRES(480) - YRES(10)`: el borde de ABAJO es fijo.
    caja._abajo = esquina.y;

    const altoRanura = YRES(14, h);
    ranura.style.left = `${XRES(170, w)}px`;
    ranura.style.top = `${h - altoRanura}px`;
    ranura.style.width = `${w - XRES(170, w)}px`;
    ranura.style.height = `${altoRanura}px`;
    ranura.style.lineHeight = `${altoRanura}px`;
    ranura.style.fontSize = `${Math.max(11, Math.round(altoRanura * 0.85))}px`;

    pintarConsola();
  }

  function pintarConsola() {
    const vistas = consola.vistas;
    caja.style.height = `${vistas.length * altoDeLinea}px`;
    caja.style.top = `${caja._abajo - vistas.length * altoDeLinea}px`;
    caja.hidden = vistas.length === 0;
    caja.replaceChildren();
    for (const l of vistas) {
      const d = el("div");
      d.textContent = l.texto;
      d.style.color = colorDeSuceso(l.tipo);
      d.style.height = `${altoDeLinea}px`;
      d.style.lineHeight = `${altoDeLinea}px`;
      caja.appendChild(d);
    }
  }

  const alRedimensionar = () => medidas();
  addEventListener("resize", alRedimensionar);
  medidas();

  /**
   * Un paso. `estado` es lo que el juego sabe AHORA; el HUD se encarga de que
   * los vasos lo persigan en vez de saltar.
   */
  function paso(dt, estado = {}) {
    const ve = seVeElHud(estado);
    nodo.hidden = !ve;
    if (!ve) { consola.paso(dt); return; }

    const objetivos = {
      vida: [estado.vida ?? 0, estado.vidaMax ?? 1],
      mana: [estado.mana ?? 0, estado.manaMax ?? 1],
      peso: [estado.peso ?? 0, estado.carga ?? 1],
      aguante: [estado.aguante ?? 0, estado.aguanteMax ?? 1],
    };
    for (const k of BARRAS) {
      const caja = cajas[k]; if (!caja) continue;
      const [amt, max] = objetivos[k];
      visto[k] = seguir(visto[k], amt, max, dt);
      const b = ficha.barras[k];
      const f = cuadroDeBarra(visto[k], max, b.cuadros);
      // El motor le pasa un float a `SetFrame` y el dibujante trunca. Se trunca
      // también aquí: redondeando, el vaso enseña el cuadro siguiente medio
      // cuadro antes de tiempo y con 43 cuadros eso se ve.
      cuadroVisto[k] = Math.floor(f);
      caja.style.backgroundPosition = `0 ${-cuadroVisto[k] * disp.barras[k].h}px`;
      const c = cifras[k];
      // «12/25 » con el espacio final. Está en el motor y está comentado como
      // intencionado: `//the space is intentional` (vgui_health.h:111).
      c.textContent = `${Math.trunc(visto[k])}/${Math.trunc(max)} `;
      c.style.color = colorDeCifra(k, visto[k], max);
    }

    // Las barras de carga.
    const sale = cargaVisible({
      cargaMaxima: estado.cargaMaxima ?? 0,
      tensando: Boolean(estado.tensando),
      cargando: (estado.cargaBruta ?? 0) > 0,
      // El arco marca con su tanto por uno y la espada con su carga en bruto:
      // las dos valen como «hay algo que enseñar».
      carga: Math.max(estado.carga01 ?? 0, estado.cargaBruta ?? 0),
      ajustes,
    });
    // `cargaBruta` son unidades de carga, no un tanto por uno: es lo que el
    // motor llama `Attack_Charge()` y lo que decide el NIVEL. Con ella la barra
    // deja de ser una barra que se llena una vez y pasa a ser la del motor: se
    // vacía y se rellena en cada nivel, con el color de su vuelta y el número
    // del nivel anterior encima. Sin ella —el tensado del arco, que es nuestro
    // andamio— se queda como estaba.
    const bruta = estado.cargaBruta ?? 0;
    const nivel = bruta > 0 ? nivelDeCarga(bruta) : null;
    for (let i = 0; i < cargas.length; i++) {
      const suya = sale && (estado.mano ?? "derecha") === disp.carga[i].mano;
      cargas[i].hidden = !suya;
      if (!suya) continue;
      const [relleno, letra] = cargas[i].childNodes;
      if (nivel) {
        relleno.style.width = `${Math.min(1, nivel.fraccion) * 100}%`;
        // El alfa del frente es 128 sobre 255 en el motor, o sea medio.
        relleno.style.background = `rgba(${nivel.rgb.join(", ")}, 0.5)`;
        letra.textContent = nivel.etiqueta;
      } else {
        relleno.style.width = `${Math.min(1, estado.carga01 ?? 0) * 100}%`;
        relleno.style.background = "rgba(0, 0, 0, 0.5)";
        letra.textContent = " ";
      }
    }

    consola.paso(dt);
    pintarConsola();
  }

  /**
   * La etiqueta del ciclador. `null` la apaga.
   *
   * Se dibuja aquí y se decide en `src/play/ranuras.js`: lo que llega es lo que
   * devuelve `Ciclador.etiqueta`, ya con su «Cast » delante o su « (Infinite)»
   * detrás y con el color que le toca a su tipo.
   */
  function pintarRanura(etiqueta) {
    ranura.hidden = !etiqueta;
    if (!etiqueta) { ranura.textContent = ""; return; }
    ranura.textContent = etiqueta.texto;
    ranura.style.color = `rgb(${etiqueta.rgb.join(", ")})`;
  }

  return {
    nodo, consola,
    /** Un suceso a la consola. `tipo` es una de las seis claves del motor. */
    suceso(tipo, texto) { consola.imprimir(tipo, texto); pintarConsola(); return consola; },
    ranura: pintarRanura,
    desplazar(abajo) { consola.desplazar(abajo); pintarConsola(); },
    paso,
    medidas,
    /** Lo que se ve ahora mismo, para las sondas. */
    estado() {
      return {
        visible: !nodo.hidden,
        barras: Object.fromEntries(BARRAS.map((k) => [k, {
          visto: visto[k],
          cuadro: cajas[k] ? cuadroVisto[k] : null,
          cifra: cifras[k]?.textContent ?? null,
          color: cifras[k]?.style.color ?? null,
          caja: cajas[k] ? {
            x: Math.round(disp.barras[k].x), y: Math.round(disp.barras[k].y),
            w: Math.round(disp.barras[k].w), h: Math.round(disp.barras[k].h),
          } : null,
        }])),
        emblema: emblema ? { x: Math.round(disp.emblemaEn.x), w: Math.round(disp.emblemaEn.w) } : null,
        consola: {
          visibles: consola.visibles, total: consola.total, activa: consola.activa,
          lineas: consola.vistas.map((l) => ({ tipo: l.tipo, texto: l.texto, vieneDeArriba: l.vieneDeArriba })),
        },
        carga: cargas.map((c, i) => ({
          mano: disp.carga[i].mano, visible: !c.hidden,
          relleno: c.childNodes[0].style.width,
          color: c.childNodes[0].style.background,
          nivel: c.childNodes[1].textContent,
          x: Math.round(disp.carga[i].x), y: Math.round(disp.carga[i].y),
        })),
        ranura: {
          visible: !ranura.hidden,
          texto: ranura.textContent,
          color: ranura.style.color,
          x: Math.round(XRES(170, nodo.clientWidth || window.innerWidth)),
        },
      };
    },
    destruir() { removeEventListener("resize", alRedimensionar); nodo.remove(); },
  };
}

export { cargaDelTiro };
