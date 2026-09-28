// EL MENÚ PRINCIPAL, dibujado. La regla está en `src/play/menu.js`.
//
// Lo que se ve: el fondo de la torre —doce piezas de 256 px juntadas por
// `npm run menu`—, la lista de opciones de `gamemenu.res` en su orden, con sus
// separadores, y la placa que se enciende al pasar por encima.
//
// ── Los tres sonidos ────────────────────────────────────────────────────────
//
// La interfaz entera del juego suena con `sound/ui/`, que tiene **tres
// archivos**: `buttonrollover` al pasar, `buttonclick` al pulsar y
// `buttonclickrelease` al soltar. No hay más. Y son los mismos que usa el
// ciclador de armas (vgui_quickslot.h:123), o sea que el clic con el que eliges
// una espada es el mismo con el que sales del juego.
//
// Un navegador no deja sonar nada hasta que el jugador toque algo, así que el
// primer `play()` puede fallar y hay que dejarlo fallar en silencio: un menú que
// escribe errores en la consola por no poder hacer «clic» es peor que uno mudo.
//
// ── Lo que NO hace ──────────────────────────────────────────────────────────
//
// «Visit a Kingdom» y «Establish a Kingdom» están puestas y apagadas, porque no
// hay servidores. «Quit» también: un navegador no cierra la pestaña que no
// abrió él. Las tres se ven, se pueden elegir y dicen por qué no. Esconderlas
// haría un menú más limpio y menos parecido.

import { entradasVisibles, quehace } from "../play/menu.js";

const CSS = `
.ms-menu { position: absolute; inset: 0; z-index: 40; display: flex;
  align-items: center; justify-content: flex-start;
  background: #000 center/cover no-repeat; }
.ms-menu[hidden] { display: none !important; }
.ms-menu-lista { margin-left: 8%; display: flex; flex-direction: column;
  align-items: flex-start; gap: 2px; }
/* El logotipo va UNA vez y arriba: es «MASTER SWORD / art by Anders Finér»,
   no la placa de un botón. Se pixela a propósito: son 240x32 de verdad y
   estirarlos con suavizado los deja borrosos. */
.ms-menu-titulo { image-rendering: pixelated; margin-bottom: 18px;
  filter: drop-shadow(0 2px 6px #000); }
.ms-menu-op { position: relative; display: block; border: 0; background: transparent;
  padding: 4px 18px; text-align: left; cursor: pointer; letter-spacing: 0.04em;
  color: #eaeaff; text-shadow: 0 2px 4px #000, 0 0 8px #000;
  font-family: 'Sitka Text', 'Sitka', Georgia, 'Times New Roman', serif; }
.ms-menu-op[data-elegida="si"] { color: #fff; text-shadow: 0 0 10px #8ab, 0 2px 4px #000; }
.ms-menu-op[data-sirve="no"] { color: #9a9a9a; cursor: default; }
.ms-menu-op[data-sirve="no"][data-elegida="si"] { color: #c8c8c8; }
.ms-menu-sep { height: 14px; }
.ms-menu-pie { position: absolute; left: 0; right: 0; bottom: 10px; text-align: center;
  color: #a0a0c0; font: 12px 'Sitka Text', Georgia, serif; text-shadow: 0 1px 3px #000; }
`;

const el = (tag, clase = "") => {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  return n;
};

/**
 * Monta el menú principal. Arranca escondido.
 *
 * `ficha` es `build/gatecity/menu.json`. **Sin ella el menú se monta igual**,
 * con las opciones que trae escritas y sin fondo: la misma regla que el HUD, un
 * `.png` que falta no puede dejar al jugador sin forma de cambiar las teclas.
 *
 * `hacer` recibe `{ que, entrada }` y devuelve `true` si lo ha hecho. Todo lo
 * que el menú sabe del juego pasa por ahí.
 */
export function montarMenu({ raiz = document.body, ficha = null, hacer = () => false, sonar = null } = {}) {
  if (!document.getElementById("ms-menu-css")) {
    const s = el("style"); s.id = "ms-menu-css"; s.textContent = CSS;
    raiz.appendChild(s);
  }

  const base = ficha?.base ?? "";
  const nodo = el("div", "ms-menu");
  nodo.hidden = true;
  if (ficha?.fondo) nodo.style.backgroundImage = `url(${base}${ficha.fondo.archivo})`;
  const columna = el("div", "ms-menu-lista");
  nodo.appendChild(columna);
  // El logotipo, una vez. Al pasar el ratón por el menú se enciende con su
  // gemelo `_mouseover`, que es la misma imagen con más alfa.
  let titulo = null;
  if (ficha?.titulo) {
    titulo = el("img", "ms-menu-titulo");
    titulo.src = `${base}${ficha.titulo.archivo}`;
    titulo.alt = "Master Sword — art by Anders Finér";
    titulo.width = ficha.titulo.ancho * 2;
    columna.appendChild(titulo);
  }
  const lista = el("div", "ms-menu-lista");
  lista.style.marginLeft = "0";
  columna.appendChild(lista);
  const pie = el("div", "ms-menu-pie");
  nodo.appendChild(pie);
  raiz.appendChild(nodo);

  // Los tres sonidos. Se cargan una vez y se rebobinan, porque dos clics
  // seguidos sobre el mismo `Audio` no suenan dos veces.
  const audios = {};
  for (const [clave, s] of Object.entries(ficha?.sonidos ?? {})) {
    try {
      const a = new Audio(`${base}${s.archivo}`);
      a.preload = "auto";
      audios[clave] = a;
    } catch { /* sin sonido se juega igual */ }
  }
  const dar = (clave) => {
    if (sonar) { sonar(clave); return; }
    const a = audios[clave];
    if (!a) return;
    try { a.currentTime = 0; const p = a.play(); if (p?.catch) p.catch(() => {}); } catch { /* el navegador manda */ }
  };

  const ENTRADAS = ficha?.entradas ?? [];
  let visibles = [];
  let elegida = -1;
  let enJuego = false;

  function pintar() {
    visibles = entradasVisibles(ENTRADAS, { enJuego });
    lista.replaceChildren();
    // El cuerpo de letra sale del alto, como todo en este juego: la placa del
    // botón mide 32 px sobre una pantalla de 600.
    const h = nodo.clientHeight || window.innerHeight;
    const cuerpo = Math.max(15, Math.round(22 * (h / 600)));
    visibles.forEach((e, i) => {
      const q = quehace(e);
      if (q.que === "separador") {
        const s = el("div", "ms-menu-sep");
        lista.appendChild(s);
        return;
      }
      const b = el("button", "ms-menu-op");
      b.type = "button";
      b.textContent = e.texto || e.etiqueta;
      b.dataset.sirve = q.sirve ? "si" : "no";
      b.dataset.que = q.que ?? "";
      // El índice va en el nodo y no se busca por el texto: «Name Character» y
      // «Options» son dos entradas distintas con el mismo comando, y basta con
      // que un día dos compartan etiqueta para que marcar la de abajo encienda
      // la de arriba.
      b.dataset.i = String(i);
      b.style.fontSize = `${cuerpo}px`;
      if (!q.sirve && q.porque) b.title = q.porque;
      b.addEventListener("pointerenter", () => { if (elegida !== i) { elegida = i; dar("encima"); marcar(); } });
      b.addEventListener("click", () => { elegida = i; elegir(); });
      lista.appendChild(b);
    });
    marcar();
  }

  /** Cuál está marcada, y el logotipo encendido mientras haya alguna. */
  function marcar() {
    for (const b of lista.querySelectorAll(".ms-menu-op")) {
      b.dataset.elegida = Number(b.dataset.i) === elegida ? "si" : "no";
    }
    if (titulo && ficha?.tituloEncima) {
      const img = elegida >= 0 ? ficha.tituloEncima : ficha.titulo;
      titulo.src = `${base}${img.archivo}`;
    }
  }

  /** Pulsar la que esté marcada. */
  function elegir() {
    const e = visibles[elegida];
    if (!e) return null;
    const q = quehace(e);
    if (q.que === "separador") return null;
    dar("elegir");
    if (!q.sirve) {
      pie.textContent = `«${e.texto || e.etiqueta}»: ${q.porque ?? "todavía no"}`;
      return { ...q, entrada: e, hecho: false };
    }
    const hecho = Boolean(hacer({ que: q.que, entrada: e }));
    dar("confirmar");
    if (!hecho) pie.textContent = `«${e.texto || e.etiqueta}»: no ha hecho nada`;
    return { ...q, entrada: e, hecho };
  }

  /** Moverse con las flechas, saltando separadores. */
  function mover(paso) {
    const n = visibles.length;
    if (!n) return;
    for (let i = 1; i <= n; i++) {
      const j = ((elegida + paso * i) % n + n) % n;
      if (quehace(visibles[j]).que !== "separador") { elegida = j; dar("encima"); marcar(); return; }
    }
  }

  const alTeclado = (ev) => {
    if (nodo.hidden) return;
    if (ev.code === "ArrowDown") { mover(1); ev.preventDefault(); }
    else if (ev.code === "ArrowUp") { mover(-1); ev.preventDefault(); }
    else if (ev.code === "Enter" || ev.code === "NumpadEnter") { elegir(); ev.preventDefault(); }
  };
  addEventListener("keydown", alTeclado);
  const alRedimensionar = () => pintar();
  addEventListener("resize", alRedimensionar);

  pintar();

  return {
    nodo,
    get abierto() { return !nodo.hidden; },
    /** Abre el menú. `enJuego` decide si salen «Resume game» y «Disconnect». */
    abrir(hayPartida = false) {
      enJuego = Boolean(hayPartida);
      elegida = -1;
      pie.textContent = ficha ? "" : "el menú no está horneado (`npm run menu`): sin fondo ni sonidos";
      pintar();
      mover(1);
      nodo.hidden = false;
    },
    cerrar() { nodo.hidden = true; },
    alternar(hayPartida = false) { if (nodo.hidden) this.abrir(hayPartida); else this.cerrar(); },
    mover, elegir,
    /** Lo que se ve, para las sondas. */
    estado() {
      return {
        abierto: !nodo.hidden,
        enJuego,
        opciones: [...lista.querySelectorAll(".ms-menu-op")].map((b) => ({
          texto: b.textContent, sirve: b.dataset.sirve === "si", que: b.dataset.que,
        })),
        separadores: lista.querySelectorAll(".ms-menu-sep").length,
        elegida: visibles[elegida] ? (visibles[elegida].texto || visibles[elegida].etiqueta) : null,
        pie: pie.textContent,
        conFondo: Boolean(ficha?.fondo),
      };
    },
    destruir() {
      removeEventListener("keydown", alTeclado);
      removeEventListener("resize", alRedimensionar);
      nodo.remove();
    },
  };
}
