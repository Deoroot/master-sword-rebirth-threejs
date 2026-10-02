// LA VENTANA «CREATE SERVER»: dos pestañas, «Start» y «Cancel».
//
// Es la tercera ventana de las capturas y la que le faltaba al menú principal:
// «Establish a Kingdom» la abre, y su «Start» es por donde se entra a jugar.
//
// ── Por qué importa más de lo que parece ──────────────────────────────────
//
// Hasta ahora el juego arrancaba directo en Gate City. Eso **ya era** «Establish
// a Kingdom»: montar una partida local. Lo que pasaba es que ocurría sola, en
// silencio y sin que nadie la pidiera. Esta ventana no añade un camino nuevo:
// le pone la puerta al que ya había.
//
// La regla —qué ajuste hay, de qué cvar sale y cuál funciona— está en
// `src/play/crearpartida.js`, con sus citas. Aquí sólo se dibuja.
//
// ── Las medidas ───────────────────────────────────────────────────────────
//
// Medidas de la captura, como el resto de VGUI2. La ventana es **más estrecha y
// más alta** que las otras dos, y eso no es un descuido del original: la pestaña
// Game tiene once filas y una barra de desplazamiento propia, que en la captura
// se ve a la derecha del recuadro.

import { cascara } from "./codice.js";
import { Button, CheckButton, ComboBox, TextEntry,
         etiqueta, MEDIDAS } from "./widgets.js";
import { PESTANAS, deLaPestana, porDefecto, MAPAS, mapaElegido, cuenta } from "../play/crearpartida.js";

/** Medido de la captura del 28 de septiembre. */
export const VENTANA = { ancho: 403, alto: 493 };

const el = (tag) => document.createElement(tag);

export class VentanaCrearServidor {
  /**
   * @param alEmpezar `({ mapa, valores }) => void` — lo que hace «Start».
   * @param mapas     los mapas que de verdad se pueden abrir.
   */
  constructor(tema, { valores = porDefecto(), mapas = MAPAS, alEmpezar = null,
                      alCerrar = null, x = 60, y = 40, enEscritorio = false } = {}) {
    this.tema = tema;
    // Esconde las filas `soloEnNavegador`. Hoy es una: la pantalla completa.
    this.enEscritorio = Boolean(enEscritorio);
    this.valores = { ...valores };
    this.mapas = [...mapas];
    this.alEmpezar = alEmpezar;
    this.controles = new Map();

    const { Marco, Hojas, conCaja } = cascara();
    this.conCaja = conCaja;

    this.marco = new Marco(tema, {
      titulo: "Create Server", ancho: VENTANA.ancho, alto: VENTANA.alto, x, y,
      alCerrar,
    });

    this.hojas = new Hojas(tema);
    for (const p of PESTANAS) this.hojas.anadir(p, () => this.#pagina(p));

    // «Start» y «Cancel», abajo a la derecha. En la captura no hay «Apply»: esta
    // ventana no ajusta nada, monta una partida o no la monta.
    const pie = el("div");
    Object.assign(pie.style, {
      display: "flex", justifyContent: "flex-end", gap: "6px",
      padding: `${MEDIDAS.margen / 2}px 0 0`, flex: "0 0 auto",
    });
    // «Start» tiene que ser SÍNCRONO hasta donde se pide el teclado: pedir
    // pantalla completa sólo vale dentro del gesto del usuario, y un `await`
    // antes lo pierde. Por eso `alEmpezar` recibe el trabajo y este manejador no
    // espera a nadie.
    this.botonStart = new Button(tema, "Start", {
      alPulsar: () => {
        const mapa = mapaElegido(this.valores.mapa, this.mapas);
        const valores = { ...this.valores };
        this.cerrar();
        this.alEmpezar?.({ mapa, valores });
      },
    });
    this.botonCancel = new Button(tema, "#GameUI_Cancel", { alPulsar: () => this.cerrar() });
    pie.append(this.botonStart.nodo, this.botonCancel.nodo);

    const dentro = el("div");
    Object.assign(dentro.style, { display: "flex", flexDirection: "column", height: "100%" });
    dentro.append(this.hojas.nodo, pie);
    this.marco.cuerpo.appendChild(dentro);
  }

  get nodo() { return this.marco.nodo; }
  get pestana() { return PESTANAS[this.hojas.activa]; }
  cerrar() { this.marco.cerrar(); return this; }
  soltar() { return this; }

  elegirPestana(nombre) {
    const i = PESTANAS.indexOf(nombre);
    if (i >= 0) this.hojas.elegir(i);
    return this;
  }

  static get cuenta() { return cuenta(); }

  #pagina(nombre) {
    const t = this.tema;
    const hoja = el("div");
    // La pestaña Game lleva su propio desplazamiento: once filas no caben. En la
    // captura la barra está DENTRO del recuadro, no en la ventana.
    Object.assign(hoja.style, {
      display: "flex", flexDirection: "column", gap: "8px",
      maxHeight: "100%", overflowY: nombre === "Game" ? "auto" : "visible",
    });
    for (const a of deLaPestana(nombre, { enEscritorio: this.enEscritorio })) hoja.appendChild(this.#control(a));
    return hoja;
  }

  #control(a) {
    const t = this.tema;
    const vivo = !a.porQueNo;
    const poner = (v) => { this.valores[a.clave] = v; };

    // Las casillas van solas, a la izquierda, sin etiqueta aparte.
    if (a.tipo === "casilla") {
      const c = new CheckButton(t, a.etiqueta, {
        marcada: !!this.valores[a.clave], activo: vivo, alCambiar: poner,
      });
      this.controles.set(a.clave, c);
      if (!vivo) c.nodo.title = a.porQueNo;
      return c.nodo;
    }

    // Y lo demás va en dos columnas: la etiqueta a la izquierda y el control a
    // la derecha, alineados, que es lo que hace la captura de la pestaña Game.
    const fila = el("div");
    Object.assign(fila.style, { display: "flex", alignItems: "center", gap: "10px" });
    const nombre = etiqueta(t, a.etiqueta, { color: vivo ? "ControlText" : "DisabledText2" });
    nombre.style.flex = "0 0 130px";
    fila.appendChild(nombre);

    if (a.tipo === "desplegable") {
      const opciones = a.clave === "mapa"
        ? this.mapas
        : (a.opciones?.length ? a.opciones : ["—"]);
      const c = new ComboBox(t, opciones, {
        indice: Math.max(0, opciones.indexOf(this.valores[a.clave])),
        ancho: 150, activo: vivo, alElegir: (_i, o) => poner(o),
      });
      this.controles.set(a.clave, c);
      fila.appendChild(c.nodo);
    } else if (a.tipo === "numero" || a.tipo === "texto") {
      const c = new TextEntry(t, {
        valor: String(this.valores[a.clave] ?? ""), ancho: 150,
        clave: a.clave === "clave",
        alCambiar: (v) => poner(a.tipo === "numero" ? (Number(v) || 0) : v),
      });
      this.controles.set(a.clave, c);
      if (!vivo) { c.nodo.disabled = true; c.nodo.style.opacity = ".75"; }
      fila.appendChild(c.nodo);
    }

    if (!vivo) fila.title = a.porQueNo;
    return fila;
  }
}
