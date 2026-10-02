// LA VENTANA DE CHAT, dibujada. La regla está en `src/play/chat.js`.
//
// Son DOS cosas y en el mod también son dos clases distintas:
//
//   la consola     `VGUI_EventConsole` otra vez, la misma clase que la de
//                  sucesos, con otros cvars y en otro sitio: a la izquierda,
//                  a media altura, creciendo hacia arriba (vgui_hud.cpp:197).
//   el cajetín     `VGUI_SendTextPanel`, que aparece cuando pulsas la tecla,
//                  se ensancha según escribes y se va con el Enter
//                  (vgui_startsaytext.h:19-77).
//
// ── Que sea LA MISMA CLASE no es un detalle ────────────────────────────────
//
//     m_Consoles.push_back(new VGUI_EventConsole(this, EVENTCON_X, EVENTCON_Y,
//         EVENTCON_SIZE_X, EVENTCON_SIZE_Y, Prefs));               // sucesos
//     m_Consoles.push_back(new VGUI_EventConsole(this, SAYTEXTCON_X, SAYTEXTCON_Y,
//         SAYTEXTCON_SIZE_X, EVENTCON_SIZE_Y, Prefs, true, g_FontID)); // chat
//                                                   vgui_hud.cpp:188-197
//
// Las diferencias son cuatro y están todas ahí: el sitio, los cvars
// (`ms_txthud_*` en vez de `ms_evthud_*`), `DynamicWidth = true` y otra letra.
// Así que aquí se reusa `ConsolaDeSucesos`, que ya es esa clase portada y
// medida desde el 24. Escribir una segunda sería tener dos sitios donde
// arreglar el decaimiento.
//
// ── El ancho dinámico, que es la cuarta diferencia ─────────────────────────
//
//     if (m_DynamicWidth) { w = 0; for (i < m_VisibleLines)
//         { linewidth = V_min(line->m_TextWidth, line->getWide());
//           if (linewidth > w) w = linewidth; } }
//                                                   vgui_eventconsole.h:258-268
//
// La caja de sucesos tiene un ancho fijo; la del chat **se encoge al de la
// frase más larga que se está viendo**. Por eso una línea suelta no pinta un
// rectángulo negro de media pantalla.
//
// Y el ancho al que se PARTE el texto no es ése: es `ms_txthud_width`, 640,
// o sea la pantalla entera (`GetWidth()`, vgui_eventconsole.h:332-335). Se
// parte muy ancho y se dibuja muy estrecho.

import { ConsolaDeSucesos, CVARS, XRES, YRES } from "../play/hud.js";
import {
  HABLA, NOMBRE_DE_HABLA, MAX_LETRAS, TECLAS_DE_HABLA,
  colorDeHabla, iconoDeHabla,
} from "../play/chat.js";

/** La letra del chat es `g_FontID`, que en el esquema es la de la interfaz. */
const FUENTE = `'Sitka Text', 'Sitka', Georgia, 'Times New Roman', serif`;

const CSS = `
.ms-chat { position: absolute; inset: 0; pointer-events: none; z-index: 21;
  font-family: ${FUENTE}; }
.ms-chat[hidden] { display: none !important; }
.ms-chat-con { position: absolute; overflow: hidden; }
.ms-chat-con > div { white-space: pre; overflow: hidden; text-overflow: clip; }
.ms-chat-caja { position: absolute; display: flex; align-items: center;
  background: rgba(0, 0, 20, 0.5); overflow: hidden; }
.ms-chat-caja > i { flex: 0 0 auto; font-style: normal; color: #fff;
  text-align: center; opacity: 0.9; }
.ms-chat-caja > span { flex: 1 1 auto; white-space: pre; overflow: hidden;
  color: #fff; }
.ms-chat-caja > span::after { content: "_"; opacity: 0.8; }
`;

const el = (tag, clase = "") => {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  return n;
};

/**
 * Las tres letras que hacen de icono.
 *
 * El mod carga `hud_shout`, `hud_talk` y `hud_party` de los sprites del HUD
 * (`vgui_startsaytext.h:37-42`). Esos `.spr` están en `assets/msr` y **no se
 * sirven**: la regla 3 del apartado 2 dice que no se mueve un byte a
 * `public/`. Así que va una letra en su sitio, del mismo tamaño y en el mismo
 * hueco, y queda apuntado que el icono de verdad no está puesto.
 */
const LETRA_DEL_ICONO = Object.freeze({ hud_shout: "!", hud_talk: "“", hud_party: "•" });

/**
 * Monta la consola de chat y el cajetín.
 *
 * @param {object} o
 * @param {HTMLElement} o.raiz
 * @param {(tipo:number, texto:string)=>void} o.alDecir  qué hacer con lo
 *        escrito al pulsar Enter. Aquí no se manda nada: esto no conoce la red.
 * @returns el manejo, que es lo que usan `main.js` y la sonda
 */
export function montarChat({ raiz = document.body, alDecir = null } = {}) {
  if (!document.getElementById("ms-chat-css")) {
    const s = el("style"); s.id = "ms-chat-css"; s.textContent = CSS;
    raiz.appendChild(s);
  }

  const nodo = el("div", "ms-chat");
  raiz.appendChild(nodo);

  const caja = el("div", "ms-chat-con");
  caja.hidden = true;
  nodo.appendChild(caja);

  const cajetin = el("div", "ms-chat-caja");
  cajetin.hidden = true;
  const icono = el("i");
  const escrito = el("span");
  cajetin.append(icono, escrito);
  nodo.appendChild(cajetin);

  const lienzo = document.createElement("canvas").getContext("2d");
  let cuerpoDeLetra = 14;
  const medir = (t) => { lienzo.font = `${cuerpoDeLetra}px ${FUENTE}`; return lienzo.measureText(t).width; };

  const consola = new ConsolaDeSucesos({
    historial: CVARS.ms_txthud_history,     // 50, no 10
    tamano: CVARS.ms_txthud_size,           // 8, no 5
    decaimiento: CVARS.ms_txthud_decaytime, // 9, no 5
    medir,
  });
  consola.bgtrans = CVARS.ms_txthud_bgtrans;

  /** Lo que se está escribiendo, o `null` si el cajetín está cerrado. */
  let escribiendo = null;
  let altoDeLinea = 17;

  function medidas() {
    const w = innerWidth, h = innerHeight;
    cuerpoDeLetra = Math.max(11, Math.round(14 * (h / 480) * 0.62));
    altoDeLinea = Math.round(cuerpoDeLetra * 1.25);

    // `SAYTEXTCON_X = XRES(10)`, `SAYTEXTCON_Y = YRES(180)` — vgui_hud.cpp:148-150.
    // Igual que la de sucesos, la Y es **el borde de abajo** y la caja crece
    // hacia arriba (`setPos(x, m_StartY - LINE_SIZE_Y * m_VisibleLines)`).
    caja.style.font = `${cuerpoDeLetra}px ${FUENTE}`;
    caja.style.left = `${XRES(10, w)}px`;
    caja._abajo = YRES(180, h);
    // Se PARTE a `ms_txthud_width` —640, la pantalla— y se DIBUJA al ancho de
    // la línea más larga. Son dos anchos distintos y ésta es la diferencia.
    consola.ancho = XRES(CVARS.ms_txthud_width, w);
    caja.style.background = consola.fondo;

    // El cajetín: `new VGUI_SendTextPanel(this, XRES(100), YRES(300),
    // XRES(640) - XRES(100), YRES(16))` — vgui_hud.cpp:200.
    const alto = YRES(16, h);
    cajetin.style.left = `${XRES(100, w)}px`;
    cajetin.style.top = `${YRES(300, h)}px`;
    cajetin.style.height = `${alto}px`;
    cajetin.style.maxWidth = `${XRES(640, w) - XRES(100, w)}px`;
    cajetin.style.font = `${cuerpoDeLetra}px ${FUENTE}`;
    // `IMG_SIZE 16` con su espaciador, vgui_startsaytext.h:15-17.
    icono.style.width = `${XRES(16, w)}px`;
    icono.style.marginLeft = `${XRES(1, w)}px`;
    icono.style.marginRight = `${XRES(2, w)}px`;

    pintar();
    pintarCajetin();
  }

  function pintar() {
    const vistas = consola.vistas;
    caja.style.height = `${vistas.length * altoDeLinea}px`;
    caja.style.top = `${caja._abajo - vistas.length * altoDeLinea}px`;
    caja.hidden = vistas.length === 0;
    caja.replaceChildren();
    // EL ANCHO DINÁMICO: el de la línea más ancha que se está viendo.
    let ancho = 0;
    for (const l of vistas) ancho = Math.max(ancho, medir(l.texto));
    caja.style.width = `${Math.ceil(ancho) + 6}px`;
    for (const l of vistas) {
      const d = el("div");
      d.textContent = l.texto;
      d.style.color = colorDeHabla(l.tipo);
      d.style.height = `${altoDeLinea}px`;
      d.style.lineHeight = `${altoDeLinea}px`;
      caja.appendChild(d);
    }
  }

  function pintarCajetin() {
    cajetin.hidden = escribiendo === null;
    if (escribiendo === null) return;
    icono.textContent = LETRA_DEL_ICONO[iconoDeHabla(escribiendo.tipo)] ?? "!";
    icono.style.color = colorDeHabla(NOMBRE_DE_HABLA[escribiendo.tipo]);
    escrito.textContent = escribiendo.texto;
  }

  const alRedimensionar = () => medidas();
  addEventListener("resize", alRedimensionar);
  medidas();

  return {
    nodo, consola,

    /** ¿Está el cajetín abierto? Mientras lo esté, el juego no ve las teclas. */
    get escribiendo() { return escribiendo !== null; },
    /** El canal del cajetín abierto, o `null`. */
    get canal() { return escribiendo?.tipo ?? null; },

    /** Abre el cajetín en un canal. `HUD_StartSayText(Type)`. */
    abrir(tipo) {
      if (tipo !== HABLA.GLOBAL && tipo !== HABLA.LOCAL && tipo !== HABLA.PARTY) return false;
      escribiendo = { tipo, texto: "" };
      pintarCajetin();
      return true;
    },

    /** Lo cierra sin mandar nada. En el mod es lo que hace perder el foco. */
    cerrar() { escribiendo = null; pintarCajetin(); },

    /**
     * Una tecla mientras se escribe. Devuelve `true` si se la ha quedado.
     *
     * El Enter manda y esconde, en ese orden — `setVisible(false)` va ANTES
     * del `ServerCmd` (vgui_startsaytext.h:52-56). Aquí se copia el orden
     * porque es la lección del 60: quien se cierra después, se lleva por
     * delante lo que la orden acaba de abrir.
     */
    tecla(e) {
      if (escribiendo === null) return false;
      if (e.key === "Enter") {
        const { tipo, texto } = escribiendo;
        escribiendo = null;
        pintarCajetin();
        alDecir?.(tipo, texto);
        return true;
      }
      if (e.key === "Escape") { escribiendo = null; pintarCajetin(); return true; }
      if (e.key === "Backspace") {
        escribiendo.texto = escribiendo.texto.slice(0, -1);
        pintarCajetin();
        return true;
      }
      // Una sola letra, y el tope del mod: `m_MaxLetters = 120`.
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (escribiendo.texto.length < MAX_LETRAS) escribiendo.texto += e.key;
        pintarCajetin();
        return true;
      }
      return true;   // se traga TODO mientras escribes: la W no anda
    },

    /**
     * ¿Esta tecla abre el cajetín? `y`, `u`, `j` de `config.cfg`.
     * Devuelve el canal o `null`.
     */
    teclaQueAbre(code) { return TECLAS_DE_HABLA[code] ?? null; },

    /** Una frase que llega. `tipo` es el número del cable. */
    recibir(tipo, texto) {
      consola.imprimir(NOMBRE_DE_HABLA[tipo] ?? "global", String(texto ?? "").replace(/\n+$/, ""));
      pintar();
      return consola;
    },

    paso(dt) { consola.paso(dt); pintar(); },

    /** RePág/AvPág sobre la consola de chat. */
    desplazar(abajo) { consola.desplazar(abajo); pintar(); },

    medidas,

    estado() {
      return {
        escribiendo: escribiendo !== null,
        canal: escribiendo?.tipo ?? null,
        loEscrito: escribiendo?.texto ?? null,
        visibles: consola.visibles,
        total: consola.total,
        lineas: consola.vistas.map((l) => ({ tipo: l.tipo, texto: l.texto })),
        caja: (() => {
          const r = caja.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height, visible: !caja.hidden };
        })(),
      };
    },

    soltar() {
      removeEventListener("resize", alRedimensionar);
      nodo.remove();
    },
  };
}
