// EL ENGANCHE: una capa para las ventanas de VGUI2 y las dos que hay.
//
// Todo lo demás de esta carpeta no sabe nada del juego a propósito —un `Frame`
// no sabe qué hay debajo—. Aquí es donde se juntan: la capa, la ficha del
// esquema, la Escape, y lo que la sonda necesita ver.
//
// Está en su propio archivo para que meterlo en `src/main.js` sea **una línea**.
// Mientras `main.js` lo tenga otra sesión, esto se puede montar solo y la sonda
// lo mide igual.

import { CSS } from "./widgets.js";
import { temaDe, CSS_CODICE, ponerAspecto, aspectoActivo } from "./codice.js";
import { VentanaOpciones } from "./opciones.js";
import { VentanaServidores } from "./servidores.js";
import { VentanaCrearServidor } from "./crearservidor.js";
import { VentanaPregunta } from "./pregunta.js";
import { porDefecto, leerAjustes } from "../play/ajustes.js";

import { BASE_COMUN } from "../play/recursos.js";
import { traerJson } from "../play/json.js";
const BASE_POR_DEFECTO = BASE_COMUN;
/** Dónde vive la ficha horneada. Si no está, el esquema de repuesto. */
export const RUTA_FICHA = `${BASE_POR_DEFECTO}/vgui2.json`;

export async function cargarFicha(ruta = RUTA_FICHA) {
  try {
    return await traerJson(ruta, { avisar: () => {} });
  } catch {
    // Igual que el HUD y el menú: un `.json` que falta no deja al jugador sin
    // interfaz. `esquema.js` tiene lo justo escrito a mano.
    return null;
  }
}

/**
 * Monta la capa y devuelve el mando.
 *
 *   `abrirOpciones()`  `abrirServidores()`  `cerrarTodo()`  `hayAlgoAbierto()`
 *
 * La capa sólo atrapa el ratón donde hay una ventana (`pointer-events: none` en
 * la capa y `auto` en cada ventana), para que con las ventanas cerradas el juego
 * siga recibiendo los clics. Es el mismo reparto que hace `src/vgui/registro.js`
 * con los paneles del mod.
 */
export class Vgui2 {
  constructor({ ficha = null, raiz = document.body, teclas = null, acciones = [],
                ajustes = null, alAplicar = null, buscarServidores = null,
                alConectar = null, porQueVacio = "", puedeCapturar = null,
                alEmpezar = null, mapas = undefined } = {}) {
    this.ficha = ficha;
    this.alEmpezar = alEmpezar;    // qué hace el «Start» de «Create Server»
    this.mapas = mapas;
    // Quién tenía el puntero cuando abrimos, para devolvérselo al cerrar.
    this.dePuntero = null;
    // Con qué permiso se devuelve. Lo pone `main.js` para que no se le quite a
    // un panel de VGUI1 que siga abierto: las dos capas se reparten el ratón.
    this.puedeCapturar = puedeCapturar;
    this.teclas = teclas;
    this.acciones = acciones;
    this.alAplicar = alAplicar;
    this.buscarServidores = buscarServidores;
    this.alConectar = alConectar;
    this.porQueVacio = porQueVacio;
    this.valores = leerAjustes(ajustes ?? porDefecto());
    this.abiertas = [];

    // `?aspecto=vgui` vuelve a las ventanas de VGUI2. No es una puerta trasera
    // para la sonda: es la única forma de que los controles de fidelidad del 34
    // —Verdana, 13 px, el alfa 0 de `TitleBG`, los 535 px medidos— se puedan
    // seguir midiendo con el códice de por omisión. Ver `codice.js`.
    try {
      ponerAspecto(new URLSearchParams(globalThis.location?.search ?? "").get("aspecto"));
    } catch { /* sin URL se queda el de por omisión */ }

    if (!document.getElementById("v2-css")) {
      const s = document.createElement("style");
      s.id = "v2-css";
      // El del códice va DETRÁS para poder pisar lo que haga falta, y se pone
      // siempre aunque el aspecto sea `vgui`: son reglas bajo `.v2-codice` y sin
      // esa clase no alcanzan a nada. Así cambiar de aspecto es una palabra y no
      // también un `if` aquí.
      s.textContent = CSS + CSS_CODICE;
      document.head.appendChild(s);
    }

    this.capa = document.createElement("div");
    this.capa.className = "v2-capa";
    Object.assign(this.capa.style, {
      position: "absolute", inset: "0", zIndex: "60", pointerEvents: "none",
    });
    raiz.appendChild(this.capa);

    this.tema = temaDe(ficha, innerHeight || 480);

    // La Escape cierra la de arriba, no todas: es lo que hace el juego cuando
    // tiene Options encima de Servers, que es justo la captura del menú.
    this.escape = (e) => {
      if (e.code !== "Escape" || !this.abiertas.length) return;
      e.preventDefault(); e.stopPropagation();
      // PRIMERO EL DESPLEGABLE, LUEGO LA VENTANA. Con una lista abierta la
      // Escape la cierra a ella y la ventana se queda; cerrar la ventana entera
      // se lleva por delante lo que el jugador estaba eligiendo.
      //
      // Lo enseñó la sonda del arranque: abría la lista de mapas, pulsaba Escape
      // para cerrarla y la siguiente pestaña ya no existía porque «Create
      // Server» se había ido con ella.
      //
      // EL 50: y se cierra POR EL WIDGET, no arrancando el nodo. `remove()`
      // dejaba al `Desplegable` con su `abierta` puesta, así que el siguiente
      // clic en la fila se lo comía `alternar()` cerrando lo que ya no estaba.
      // Ver `vgui2/widgets.js`, `cerrarDesplegable`.
      const lista = this.capa.querySelector(".v2-lista-abierta");
      if (lista) { (lista.cerrarDesplegable ?? (() => lista.remove()))(); return; }
      this.cerrarUltima();
    };
    addEventListener("keydown", this.escape, true);
  }

  #poner(ventana) {
    this.capa.appendChild(ventana.nodo);
    this.abiertas.push(ventana);
    this.#soltarPuntero();
    return ventana;
  }

  /**
   * SOLTAR EL PUNTERO AL ABRIR. No es cortesía: sin esto la ventana no se puede
   * pulsar.
   *
   * Mientras el juego tiene el ratón capturado (`requestPointerLock` sobre el
   * lienzo), el navegador manda TODO el movimiento y todos los clics al lienzo
   * bloqueado, pase lo que pase por encima. Una ventana abierta así se ve, se
   * dibuja bien y no responde a nada.
   *
   * Lo encontró la sonda y costó un rato: los controles de aspecto salían en
   * verde y el clic en una pestaña se quedaba colgado en «performing click
   * action» sin decir por qué. `document.pointerLockElement` era `CANVAS`.
   *
   * **Y se devuelve al cerrar**, que es lo que hace el motor:
   *
   *     if (!m_pCurrentMenu) { IN_ResetMouse(); g_iVisibleMouse = false; }
   *                                     vgui_teamfortressviewport.cpp:1741-1750
   *
   * Aquí se dudó de si el navegador lo concedería, porque sólo deja pedir el
   * puntero dentro de un gesto del usuario. Lo concede: los tres caminos por los
   * que se cierra una ventana —la X, «Cancel»/«OK» y la Escape— son gestos. No
   * devolverlo es una diferencia con el juego y se nota: cierras Options y no
   * puedes girar hasta pulsar en el mundo.
   *
   * Con tres redes, porque esto falla en silencio por definición:
   *
   *   1. **Sólo se devuelve si lo habíamos quitado nosotros.** Si el jugador
   *      tenía el ratón suelto al abrir la ventana, cerrarla no se lo puede
   *      quitar: sería agarrarle el ratón sin que lo pidiera.
   *   2. **Sólo cuando se cierra la última.** Con Options encima de Servers, la
   *      primera Escape no devuelve nada.
   *   3. `puedeCapturar()` lo puede prohibir desde fuera, que es como convive
   *      con los paneles de VGUI1: si uno de ellos sigue abierto, el puntero no
   *      es de nadie todavía.
   *
   * Y si el navegador dice que no, la promesa se traga sin ruido: el clic en el
   * lienzo lo recupera igual.
   */
  #soltarPuntero() {
    try {
      const preso = document.pointerLockElement;
      if (!preso) return;
      this.dePuntero = preso;        // de quién era, para devolvérselo
      document.exitPointerLock?.();
    } catch { /* un navegador sin puntero bloqueado no es un error */ }
  }

  #devolverPuntero() {
    const duena = this.dePuntero;
    this.dePuntero = null;
    if (!duena || this.abiertas.length) return;
    if (this.puedeCapturar && !this.puedeCapturar()) return;
    try {
      const p = duena.requestPointerLock?.();
      // En los navegadores nuevos devuelve una promesa; en los viejos, nada.
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch { /* si no lo concede, lo recupera el clic en el mundo */ }
  }

  abrirOpciones() {
    const ya = this.abiertas.find((v) => v instanceof VentanaOpciones);
    if (ya) { ya.nodo.hidden = false; return ya; }
    const v = new VentanaOpciones(this.tema, {
      valores: this.valores, teclas: this.teclas, acciones: this.acciones,
      alAplicar: (vals) => { this.valores = vals; this.alAplicar?.(vals); },
      alCerrar: () => this.#quitar(v),
      x: Math.max(8, (innerWidth - 535) / 2), y: Math.max(8, (innerHeight - 422) / 2),
    });
    return this.#poner(v);
  }

  abrirServidores() {
    const ya = this.abiertas.find((v) => v instanceof VentanaServidores);
    if (ya) { ya.nodo.hidden = false; return ya; }
    const v = new VentanaServidores(this.tema, {
      buscar: this.buscarServidores,
      alConectar: this.alConectar,
      porQueVacio: this.porQueVacio,
      alCerrar: () => this.#quitar(v),
      x: Math.max(8, (innerWidth - 773) / 2), y: Math.max(8, (innerHeight - 419) / 3),
    });
    return this.#poner(v);
  }

  /**
   * «Establish a Kingdom». Es por donde se entra a jugar desde el 36.
   *
   * `alEmpezar` recibe `{ mapa, valores }` y es quien arranca la partida: la
   * ventana no sabe cargar un mapa y no tiene por qué.
   */
  abrirCrearServidor({ alEmpezar = null, mapas } = {}) {
    const ya = this.abiertas.find((v) => v instanceof VentanaCrearServidor);
    if (ya) { ya.nodo.hidden = false; return ya; }
    const v = new VentanaCrearServidor(this.tema, {
      // En la cáscara no sale la casilla de pantalla completa: ver la fila
      // `soloEnNavegador` en `src/play/crearpartida.js`.
      enEscritorio: Boolean(globalThis.escritorio?.salir),
      mapas: mapas ?? this.mapas,
      alEmpezar: alEmpezar ?? this.alEmpezar,
      alCerrar: () => this.#quitar(v),
      x: Math.max(8, (innerWidth - 403) / 2), y: Math.max(8, (innerHeight - 493) / 2),
    });
    return this.#poner(v);
  }

  /**
   * Una pregunta de sí o no. La usa «Quit», y **se puede abrir dos veces**: a
   * diferencia de las otras tres no se busca una ya abierta, porque dos
   * preguntas distintas son dos preguntas.
   */
  abrirPregunta(opciones = {}) {
    const v = new VentanaPregunta(this.tema, {
      ...opciones,
      alCerrar: () => this.#quitar(v),
      x: Math.max(8, (innerWidth - 420) / 2), y: Math.max(8, (innerHeight - 150) / 2),
    });
    return this.#poner(v);
  }

  #quitar(v) {
    v.soltar?.();
    v.nodo.remove();
    this.abiertas = this.abiertas.filter((o) => o !== v);
    this.#devolverPuntero();
  }

  cerrarUltima() {
    const v = this.abiertas[this.abiertas.length - 1];
    if (v) v.cerrar();
    return this;
  }

  cerrarTodo() {
    for (const v of [...this.abiertas]) v.cerrar();
    return this;
  }

  hayAlgoAbierto() { return this.abiertas.length > 0; }

  /**
   * Lo que la sonda mira. Mismo trato que el registro de VGUI1: se expone lo
   * que se puede comprobar desde fuera, y NO se expone nada que permita saltarse
   * el camino del jugador —no hay `elegirPestaña` por aquí, la sonda pulsa—.
   */
  estado() {
    const op = this.abiertas.find((v) => v instanceof VentanaOpciones);
    const sr = this.abiertas.find((v) => v instanceof VentanaServidores);
    const cs = this.abiertas.find((v) => v instanceof VentanaCrearServidor);
    return {
      abiertas: this.abiertas.length,
      // `valores` de la capa es lo APLICADO; `opciones.valores` es lo que hay
      // puesto en la ventana ahora mismo, sin aplicar. Son dos cosas distintas y
      // «Cancel» es justo la diferencia entre ellas, así que se ven las dos.
      opciones: op
        ? { pestana: op.pestana, pestanas: op.hojas.titulos, valores: { ...op.valores } }
        : null,
      servidores: sr ? { pestana: sr.pestana, cuantos: sr.cuantos() } : null,
      crearServidor: cs ? { pestana: cs.pestana, valores: { ...cs.valores } } : null,
      conFicha: !!this.ficha,
      // QUÉ ASPECTO TIENEN LAS VENTANAS, para que la sonda lo mida en vez de
      // deducirlo del color de un píxel. Ver `codice.js`.
      aspecto: aspectoActivo().cual,
      valores: { ...this.valores },
      // De quién es el ratón ahora mismo, para que la sonda lo mida en vez de
      // deducirlo de que un clic funcione.
      puntero: document.pointerLockElement?.tagName ?? null,
      punteroPrestado: !!this.dePuntero,
    };
  }

  soltar() {
    removeEventListener("keydown", this.escape, true);
    this.cerrarTodo();
    this.capa.remove();
  }
}

/**
 * Lo de siempre en una línea, para `src/main.js`:
 *
 *     const vgui2 = await montarVgui2({ teclas, acciones: ACCIONES });
 *
 * y luego `vgui2.abrirOpciones()` donde hoy se llama a `pantallaOpciones()`.
 */
export async function montarVgui2(opciones = {}) {
  const ficha = opciones.ficha ?? await cargarFicha();
  return new Vgui2({ ...opciones, ficha });
}
