// LA VENTANA «SERVERS»: el navegador de servidores.
//
// En el juego esta ventana no es del mod ni del motor: es el navegador de Steam,
// y por eso lleva su icono en la barra de título y sus seis pestañas —Internet,
// Favorites, History, Spectate, Lan, Friends—. El mod sólo pone el filtro:
// abajo a la izquierda pone «Master Sword: Rebirth;», que es lo que se le pide
// al maestro de Steam.
//
// ── Qué puede haber aquí de verdad ─────────────────────────────────────────
//
// No hay maestro de Steam ni lo va a haber: esto es una pestaña de navegador.
// Lo que sí hay es el servidor de partida del experimento 27 (`src/red/`), así
// que la ventana recibe una función `buscar(pestaña)` y enseña lo que devuelva.
// Quien la conecta decide qué es cada pestaña; aquí no se inventa ninguna.
//
// Una lista vacía **no se disimula**: la cabecera dice «Servers (0)» como en el
// juego y el pie explica por qué no hay nada, que es mejor que una ventana que
// gira para siempre.
//
// ── La disposición está medida de la captura del 27 de septiembre ──────────
//
// Como el resto de VGUI2: los colores, la letra y los bordes salen de
// `TrackerScheme.res`; dónde va cada control, de mirar la captura. El código de
// `GameUI.dll` no es público.

import { Frame, PropertySheet, Button, ListPanel, TextEntry, etiqueta, MEDIDAS } from "./widgets.js";

/** Medido de la captura. */
export const VENTANA = { ancho: 773, alto: 419 };

/** Las seis pestañas, en el orden de la captura. */
export const PESTANAS = ["Internet", "Favorites", "History", "Spectate", "Lan", "Friends"];

/**
 * Las columnas.
 *
 * Las dos primeras no tienen nombre y son estrechas: en la captura llevan un
 * candado —el servidor pide contraseña— y un corazón —está en favoritos—. Se
 * portan como columnas de verdad aunque hoy vengan vacías, porque si no la
 * cabecera queda descolocada respecto a las filas.
 */
export const COLUMNAS = [
  { clave: "candado", titulo: "", ancho: 16 },
  { clave: "favorito", titulo: "", ancho: 16 },
  { clave: "nombre", titulo: "Servers" },
  { clave: "juego", titulo: "Game", ancho: 108 },
  { clave: "jugadores", titulo: "Players", ancho: 56 },
  { clave: "mapa", titulo: "Map", ancho: 104 },
  { clave: "ping", titulo: "Latency", ancho: 64 },
];

const el = (tag) => document.createElement(tag);

export class VentanaServidores {
  /**
   * @param buscar    `async (pestaña) => [{nombre, juego, jugadores, mapa, ping, …}]`
   * @param alConectar `(fila) => void`
   */
  constructor(tema, { buscar = null, alConectar = null, alCerrar = null,
                      x = 60, y = 60, porQueVacio = "" } = {}) {
    this.tema = tema;
    this.buscar = buscar;
    this.alConectar = alConectar;
    this.porQueVacio = porQueVacio;
    this.listas = new Map();

    this.marco = new Frame(tema, {
      titulo: "Servers", ancho: VENTANA.ancho, alto: VENTANA.alto, x, y,
      alCerrar,
    });

    this.hojas = new PropertySheet(tema);
    for (const p of PESTANAS) this.hojas.anadir(p, () => this.#pagina(p));

    this.marco.cuerpo.appendChild(this.hojas.nodo);
  }

  get nodo() { return this.marco.nodo; }
  get pestana() { return PESTANAS[this.hojas.activa]; }

  // Las dos ventanas tienen que cerrarse igual, porque quien las cierra —la
  // Escape de `montar.js`— no sabe cuál tiene delante. Faltaba, y la Escape se
  // caía con «v.cerrar is not a function» dejando la ventana abierta: la sonda
  // lo vio como «la Escape cierra UNA ventana» en rojo.
  cerrar() { this.marco.cerrar(); return this; }

  /** No tiene oyentes globales que soltar, pero el que cierra llama a los dos. */
  soltar() { return this; }

  elegirPestana(nombre) {
    const i = PESTANAS.indexOf(nombre);
    if (i >= 0) this.hojas.elegir(i);
    return this;
  }

  #pagina(nombre) {
    const t = this.tema;
    const hoja = el("div");
    Object.assign(hoja.style, { display: "flex", flexDirection: "column",
      height: "100%", gap: `${MEDIDAS.margen / 2}px` });

    const lista = new ListPanel(t, COLUMNAS, {
      alto: 260,
      alElegir: () => { conectar.habilitar(true); },
    });
    this.listas.set(nombre, lista);

    // El pie: «Change filters», el filtro que pide el mod, y a la derecha los
    // tres botones. «Connect» sale apagado hasta que se elige una fila, que es
    // lo que hace el juego en la captura.
    const pie = el("div");
    Object.assign(pie.style, { display: "flex", alignItems: "center", gap: "8px", flex: "0 0 auto" });

    const filtros = new Button(t, "Change filters", { ancho: 104, activo: false });
    filtros.nodo.title = "the filter is fixed to Master Sword: Rebirth, like the game's own.";

    // Esto no es decorativo: es el filtro que el mod le pasa al maestro, y en la
    // captura se lee tal cual al lado del botón.
    const filtro = etiqueta(t, "Master Sword: Rebirth;", { color: "DimBaseText", pequena: true });
    filtro.style.flex = "1 1 auto";

    const rapido = new Button(t, "Quick refresh", { ancho: 96, alPulsar: () => this.refrescar(nombre) });
    const todo = new Button(t, "Refresh all", { ancho: 92, alPulsar: () => this.refrescar(nombre) });
    const conectar = new Button(t, "Connect", {
      ancho: 80, activo: false,
      alPulsar: () => {
        const f = lista.filas[lista.elegida];
        if (f) this.alConectar?.(f);
      },
    });
    pie.append(filtros.nodo, filtro, rapido.nodo, todo.nodo, conectar.nodo);

    // Por qué la lista está vacía. Se escribe debajo y no en lugar de la lista:
    // la ventana tiene que seguir siendo la ventana.
    this.aviso = etiqueta(t, "", { color: "DimBaseText", pequena: true });
    this.aviso.style.flex = "0 0 auto";

    hoja.append(lista.nodo, pie, this.aviso);
    this.refrescar(nombre);
    return hoja;
  }

  /** Vuelve a pedir la lista y repinta la cabecera con la cuenta. */
  async refrescar(nombre = this.pestana) {
    const lista = this.listas.get(nombre);
    if (!lista) return;
    let filas = [];
    try {
      filas = (await this.buscar?.(nombre)) ?? [];
    } catch {
      // Un servidor que no contesta no puede tirar la ventana: se queda a cero
      // y el aviso lo explica, igual que el juego cuando el maestro no responde.
      filas = [];
    }
    lista.poner(filas);
    // «Servers (9)»: el juego pone la cuenta EN EL TÍTULO DE LA COLUMNA, no
    // encima de la lista. Es un detalle de la captura y es lo que hace que la
    // cabecera se lea como parte de la tabla.
    const cab = lista.cabecera.children[2];
    if (cab) cab.textContent = `Servers (${filas.length})`;
    if (this.aviso) {
      this.aviso.textContent = filas.length ? "" : (this.porQueVacio || "");
    }
    return filas;
  }

  /** Cuántos servidores se ven ahora. Para la sonda. */
  cuantos(nombre = this.pestana) { return this.listas.get(nombre)?.cuantas ?? 0; }
}
