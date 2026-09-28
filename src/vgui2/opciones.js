// LA VENTANA «OPTIONS», con sus siete pestañas.
//
// La regla —qué ajuste hay, de dónde sale su valor y cuál hace algo— está en
// `src/play/ajustes.js`, sin DOM. Aquí sólo se dibuja con el kit de
// `widgets.js` y el esquema de `esquema.js`.
//
// ── Lo que sustituye ───────────────────────────────────────────────────────
//
// El panel de `src/juego/interfaz.js:767` —un `<h2>Options — keys</h2>` con
// botones web— era UNA de las siete pestañas y con la letra del navegador. Lo
// que aquí cambia no es el aspecto por gusto: es que la ventana vuelve a ser del
// juego, con la letra, los colores y el bisel que el mod trae en sus archivos.
//
// ── Lo apagado se ve y dice por qué ────────────────────────────────────────
//
// De los treinta controles de las capturas, **ocho hacen algo aquí**. Los otros
// veintidós salen, se pueden señalar y explican qué les falta, que es lo que ya
// hace el menú principal con «Visit a Kingdom». Esconderlos daría una ventana
// más limpia, menos parecida y que además escondería el trabajo pendiente.
//
// La cuenta la calcula `cuenta()` y no está escrita a mano en ningún sitio, para
// que no se quede vieja cuando uno de los veintidós se encienda.

import { Frame, PropertySheet, Button, CheckButton, ComboBox, Slider, TextEntry,
         etiqueta, MEDIDAS } from "./widgets.js";
import { deLaPestana, PESTANAS, TIPOS, porDefecto, cuenta } from "../play/ajustes.js";

/** Medidas de la ventana, medidas de la captura del 27 de septiembre. */
export const VENTANA = { ancho: 535, alto: 422 };     // medido

const el = (tag, clase = "") => {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  return n;
};

/**
 * La ventana entera.
 *
 * `valores` es el estado vivo y se modifica en el sitio: la ventana no guarda
 * nada por su cuenta. `alAplicar` es quien decide qué hacer con ellos, que es
 * cosa del juego y no de la ventana.
 */
export class VentanaOpciones {
  constructor(tema, { valores = porDefecto(), teclas = null, acciones = [],
                      alAplicar = null, alCerrar = null, x = 40, y = 40 } = {}) {
    this.tema = tema;
    this.valores = { ...valores };
    this.original = { ...valores };
    this.teclas = teclas;
    this.acciones = acciones;
    this.alAplicar = alAplicar;
    this.controles = new Map();          // clave -> el control, para la sonda

    this.marco = new Frame(tema, {
      titulo: "Options", ancho: VENTANA.ancho, alto: VENTANA.alto, x, y,
      alCerrar: () => { this.#descartar(); alCerrar?.(); },
    });

    this.hojas = new PropertySheet(tema);
    for (const p of PESTANAS) this.hojas.anadir(p, () => this.#pagina(p));

    // Los tres botones de abajo, en el orden de la captura: OK, Cancel, Apply.
    const pie = el("div");
    Object.assign(pie.style, {
      display: "flex", justifyContent: "flex-end", gap: "6px",
      padding: `${MEDIDAS.margen / 2}px 0 0`, flex: "0 0 auto",
    });
    this.botonOk = new Button(tema, "#GameUI_OK", { alPulsar: () => { this.aplicar(); this.cerrar(); } });
    this.botonCancelar = new Button(tema, "#GameUI_Cancel", { alPulsar: () => { this.#descartar(); this.cerrar(); } });
    this.botonAplicar = new Button(tema, "#GameUI_Apply", { alPulsar: () => this.aplicar() });
    pie.append(this.botonOk.nodo, this.botonCancelar.nodo, this.botonAplicar.nodo);

    const dentro = el("div");
    Object.assign(dentro.style, { display: "flex", flexDirection: "column", height: "100%" });
    dentro.append(this.hojas.nodo, pie);
    this.marco.cuerpo.appendChild(dentro);
  }

  get nodo() { return this.marco.nodo; }

  /** «Apply»: se lleva los valores al juego y los deja como los de partida. */
  aplicar() {
    this.original = { ...this.valores };
    this.alAplicar?.({ ...this.valores });
    return this;
  }

  /** «Cancel» y la X: deshacer. En el juego los dos hacen lo mismo. */
  #descartar() {
    this.valores = { ...this.original };
  }

  cerrar() { this.marco.cerrar(); }

  /** Qué pestaña está delante. Para la sonda. */
  get pestana() { return PESTANAS[this.hojas.activa]; }
  elegirPestana(nombre) {
    const i = PESTANAS.indexOf(nombre);
    if (i >= 0) this.hojas.elegir(i);
    return this;
  }

  /** La cuenta de lo que funciona, para el informe y para la sonda. */
  static get cuenta() { return cuenta(); }

  // ── LAS PÁGINAS ─────────────────────────────────────────────────────────

  #pagina(nombre) {
    if (nombre === "Keyboard") return this.#paginaTeclas();
    const hoja = el("div");
    Object.assign(hoja.style, { display: "flex", flexDirection: "column", gap: "10px" });
    for (const a of deLaPestana(nombre)) hoja.appendChild(this.#control(a));
    return hoja;
  }

  /** Un ajuste, del tipo que sea, con su etiqueta y su motivo si está apagado. */
  #control(a) {
    const fila = el("div");
    const vivo = !a.porQueNo;
    const t = this.tema;

    const poner = (v) => { this.valores[a.clave] = v; };

    if (a.tipo === TIPOS.NOTA) {
      // El `\n` de los archivos de Valve es un salto de línea de verdad. Sin
      // esto la nota de Miles sale en una sola línea larguísima.
      const n = etiqueta(t, t.texto(a.etiqueta).replace(/\\n/g, "\n"), { color: "DimBaseText", pequena: true });
      n.style.whiteSpace = "pre-line";
      n.style.marginTop = "6px";
      return n;
    }

    if (a.tipo === TIPOS.CASILLA) {
      const c = new CheckButton(t, a.etiqueta, {
        marcada: !!this.valores[a.clave], activo: vivo,
        alCambiar: poner,
      });
      this.controles.set(a.clave, c);
      fila.style.display = "flex";
      fila.style.gap = "14px";
      fila.style.alignItems = "center";
      fila.appendChild(c.nodo);
      if (a.descripcion) {
        // En la captura de la pestaña Mouse la explicación va en su propia
        // columna a la derecha, no debajo de la casilla.
        const d = etiqueta(t, a.descripcion, { color: vivo ? "ControlText" : "DisabledText2" });
        d.style.flex = "1 1 auto";
        fila.appendChild(d);
      }
      if (!vivo) fila.title = a.porQueNo;
      return fila;
    }

    if (a.tipo === TIPOS.DESLIZADOR) {
      fila.style.display = "flex";
      fila.style.flexDirection = "column";
      fila.style.gap = "2px";
      fila.appendChild(etiqueta(t, a.etiqueta, { color: vivo ? "ControlText" : "DisabledText2" }));
      const linea = el("div");
      linea.style.display = "flex";
      linea.style.alignItems = "center";
      linea.style.gap = "10px";
      // La cajita con el número a la derecha del deslizador sólo la lleva la
      // sensibilidad del ratón, que es donde sale en la captura.
      const caja = a.clave === "sensibilidad"
        ? new TextEntry(t, { valor: this.#comoTexto(a, this.valores[a.clave]), ancho: 56 })
        : null;
      const s = new Slider(t, {
        min: a.min, max: a.max, valor: Number(this.valores[a.clave] ?? a.pordefecto),
        ancho: a.clave === "sensibilidad" ? 280 : 160,
        alCambiar: (v) => { poner(v); if (caja) caja.valor = this.#comoTexto(a, v); },
      });
      this.controles.set(a.clave, s);
      linea.appendChild(s.nodo);
      if (caja) linea.appendChild(caja.nodo);
      fila.appendChild(linea);
      // Las puntas con su número, como «0.20» y «20.00» de la captura.
      const puntas = el("div");
      Object.assign(puntas.style, { display: "flex", justifyContent: "space-between",
        width: `${a.clave === "sensibilidad" ? 280 : 160}px` });
      puntas.append(
        etiqueta(t, this.#comoTexto(a, a.min), { color: "DimBaseText", pequena: true }),
        etiqueta(t, this.#comoTexto(a, a.max), { color: "DimBaseText", pequena: true }));
      fila.appendChild(puntas);
      if (!vivo) { fila.style.opacity = ".75"; fila.title = a.porQueNo; }
      return fila;
    }

    if (a.tipo === TIPOS.DESPLEGABLE) {
      fila.style.display = "flex";
      fila.style.flexDirection = "column";
      fila.style.gap = "3px";
      if (a.etiqueta) fila.appendChild(etiqueta(t, a.etiqueta, { color: vivo ? "ControlText" : "DisabledText2" }));
      const opciones = a.opciones?.length ? a.opciones : ["—"];
      const c = new ComboBox(t, opciones, {
        indice: Math.max(0, opciones.indexOf(this.valores[a.clave])),
        activo: vivo, alElegir: (_i, o) => poner(o),
      });
      this.controles.set(a.clave, c);
      fila.appendChild(c.nodo);
      if (!vivo) fila.title = a.porQueNo;
      return fila;
    }

    if (a.tipo === TIPOS.TEXTO) {
      fila.style.display = "flex";
      fila.style.flexDirection = "column";
      fila.style.gap = "3px";
      fila.appendChild(etiqueta(t, a.etiqueta, { color: vivo ? "ControlText" : "DisabledText2" }));
      const c = new TextEntry(t, { valor: String(this.valores[a.clave] ?? ""), alCambiar: poner });
      this.controles.set(a.clave, c);
      fila.appendChild(c.nodo);
      if (!vivo) fila.title = a.porQueNo;
      return fila;
    }

    if (a.tipo === TIPOS.BOTON) {
      const b = new Button(t, a.etiqueta, { activo: vivo, ancho: 96 });
      this.controles.set(a.clave, b);
      fila.style.display = "flex";
      fila.style.justifyContent = "flex-end";
      fila.appendChild(b.nodo);
      if (!vivo) fila.title = a.porQueNo;
      return fila;
    }

    return fila;
  }

  #comoTexto(a, v) {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(a.decimales ?? 2) : String(v ?? "");
  }

  // ── LA PESTAÑA DE LAS TECLAS ────────────────────────────────────────────
  //
  // Es la única que no es una lista de ajustes: es la tabla del juego, con sus
  // tres columnas —«Master Sword Commands», «KEY/BUTTON», «ALTERNATE»— y sus
  // tres botones debajo. Los nombres de las acciones salen de `kb_act.lst` a
  // través de `src/juego/teclas.js`, que los trae desde el experimento 24.
  #paginaTeclas() {
    const t = this.tema;
    const hoja = el("div");
    Object.assign(hoja.style, { display: "flex", flexDirection: "column", height: "100%", gap: "8px" });

    const tabla = el("div");
    Object.assign(tabla.style, {
      flex: "1 1 auto", overflow: "auto",
      background: t.color("ListBG"), boxShadow: t.borde("BrowserBorder"),
      font: t.letraPequena,
    });

    const cabecera = el("div");
    Object.assign(cabecera.style, { display: "flex", position: "sticky", top: "0",
      background: t.color("ControlBG"), color: t.color("ControlText"),
      height: `${MEDIDAS.cabeceraAlto}px` });
    for (const [txt, ancho] of [["Master Sword Commands", ""], ["KEY/BUTTON", "110px"], ["ALTERNATE", "90px"]]) {
      const d = el("div");
      d.textContent = txt;
      d.style.flex = ancho ? `0 0 ${ancho}` : "1 1 auto";
      d.style.padding = "0 6px";
      cabecera.appendChild(d);
    }
    tabla.appendChild(cabecera);

    let esperando = null;
    const filas = el("div");
    const pinta = () => {
      filas.replaceChildren();
      for (const a of this.acciones) {
        const r = el("div");
        Object.assign(r.style, { display: "flex", height: `${MEDIDAS.filaAlto}px`,
          color: t.color(esperando === a.clave ? "SelectedText" : "BaseText"),
          background: esperando === a.clave ? t.color("SelectionBG") : "transparent",
          cursor: "default" });
        const nombre = el("div");
        nombre.textContent = a.nombre;
        nombre.style.flex = "1 1 auto"; nombre.style.padding = "0 6px";
        const tecla = el("div");
        tecla.textContent = esperando === a.clave ? "…" : (this.#nombreTecla(a.clave) || "");
        tecla.style.flex = "0 0 110px"; tecla.style.padding = "0 6px";
        const alt = el("div");
        alt.textContent = a.alias ?? "";
        alt.style.flex = "0 0 90px"; alt.style.padding = "0 6px";
        r.append(nombre, tecla, alt);
        r.onclick = () => { esperando = esperando === a.clave ? null : a.clave; pinta(); };
        filas.appendChild(r);
      }
    };
    pinta();
    tabla.appendChild(filas);

    // Se escucha en fase de CAPTURA y se corta el suceso, igual que hacía el
    // panel viejo: si no, asignar la «I» abre el inventario mientras se asigna.
    this.captura = (e) => {
      if (!esperando) return;
      e.preventDefault(); e.stopPropagation();
      if (e.code === "Escape") { esperando = null; pinta(); return; }
      this.teclas?.asignar(esperando, e.code);
      esperando = null; pinta();
    };
    this.capturaRaton = (e) => {
      if (!esperando) return;
      e.preventDefault(); e.stopPropagation();
      this.teclas?.asignar(esperando, `Mouse${e.button}`);
      esperando = null; pinta();
    };
    addEventListener("keydown", this.captura, true);
    addEventListener("mousedown", this.capturaRaton, true);

    const pie = el("div");
    Object.assign(pie.style, { display: "flex", justifyContent: "space-between", flex: "0 0 auto" });
    const porDefectoB = new Button(t, "Use Defaults", {
      ancho: 104, alPulsar: () => { this.teclas?.porDefecto(); esperando = null; pinta(); },
    });
    const editar = new Button(t, "Edit key", {
      ancho: 84, alPulsar: () => { esperando = this.acciones[0]?.clave ?? null; pinta(); },
    });
    const limpiar = new Button(t, "Clear Key", {
      ancho: 84, alPulsar: () => { if (esperando) { this.teclas?.quitar(esperando); esperando = null; pinta(); } },
    });
    const dcha = el("div");
    dcha.style.display = "flex"; dcha.style.gap = "6px";
    dcha.append(editar.nodo, limpiar.nodo);
    pie.append(porDefectoB.nodo, dcha);

    hoja.append(tabla, pie);
    return hoja;
  }

  #nombreTecla(clave) {
    const c = this.teclas?.mapa?.[clave];
    if (!c) return "";
    return String(c).replace(/^Key/, "").replace(/^Digit/, "").replace(/^Mouse(\d)/, "MOUSE$1").toUpperCase();
  }

  /** Suelta los oyentes de captura. Hay que llamarlo al tirar la ventana. */
  soltar() {
    if (this.captura) removeEventListener("keydown", this.captura, true);
    if (this.capturaRaton) removeEventListener("mousedown", this.capturaRaton, true);
    this.captura = this.capturaRaton = null;
  }
}
