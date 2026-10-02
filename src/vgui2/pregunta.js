// UNA PREGUNTA DE SÍ O NO, con la cáscara que toque.
//
// Existe por «Quit»: salir no se deshace, y el original pregunta. Pero no se
// llama `VentanaSalir` porque no tiene nada de «Quit» dentro —ni el texto, ni lo
// que pasa al aceptar—, y lo siguiente que haga falta preguntar («¿descartar
// este personaje?») cabe aquí sin tocarla.
//
// ── Por qué no es un diálogo del sistema ───────────────────────────────────
//
// Electron trae `dialog.showMessageBox`, que habría sido **una línea** en
// `escritorio/main.cjs`. Y habría metido un cuadro de Windows, con su letra y
// sus botones, justo en mitad de un menú que acaba de dejar de parecerse a
// Windows a propósito. La pregunta es del juego; el proceso principal sólo
// obedece (`ipcMain.on("msr:salir")`).
//
// ── Sin pestañas ───────────────────────────────────────────────────────────
//
// Es la única ventana de VGUI2 que no lleva `PropertySheet`/`IndiceCodice`: el
// contenido va directo en el cuerpo del marco. Por eso no usa `Hojas`.

import { Button, etiqueta, MEDIDAS } from "./widgets.js";
import { cascara } from "./codice.js";

const el = (tag, clase = "") => {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  return n;
};

export class VentanaPregunta {
  /**
   * @param titulo    el de la barra o la cabecera.
   * @param texto     la pregunta, en una línea.
   * @param detalle   lo que conviene saber antes de responder. Puede faltar.
   * @param aceptar   la etiqueta del botón que hace la cosa («Quit»).
   * @param alAceptar qué hacer si dice que sí.
   */
  constructor(tema, { titulo = "", texto = "", detalle = "", aceptar = "OK",
                      alAceptar = null, alCerrar = null, x = 40, y = 40 } = {}) {
    this.tema = tema;
    this.alAceptar = alAceptar;

    const { Marco, conCaja } = cascara();
    this.conCaja = conCaja;

    this.marco = new Marco(tema, {
      titulo, ancho: 420, alto: 150, x, y, alCerrar,
      // `Frame` no lo conoce y lo ignora; `MarcoCodice` lo usa para no dibujar
      // el canal del lomo —no hay cintas— y para medir lo que mide el texto.
      conIndice: false,
    });

    const dentro = el("div");
    Object.assign(dentro.style, {
      display: "flex", flexDirection: "column", height: "100%",
      gap: "10px", padding: `${MEDIDAS.margen / 2}px`,
    });

    const p = etiqueta(tema, texto, { color: "BrightControlText" });
    p.style.fontSize = "14px";
    dentro.appendChild(p);
    if (detalle) {
      const d = etiqueta(tema, detalle, { color: "DimBaseText", pequena: true });
      d.style.maxWidth = "46ch";
      dentro.appendChild(d);
    }

    const pie = el("div", "v2-pie");
    Object.assign(pie.style, {
      display: "flex", justifyContent: "flex-end", gap: "6px",
      marginTop: "auto", flex: "0 0 auto",
    });
    this.botonAceptar = new Button(tema, aceptar, { alPulsar: () => this.aceptar() });
    this.botonCancelar = new Button(tema, "Cancel", { alPulsar: () => this.cerrar() });
    // CANCEL VA PRIMERO EN EL FOCO, no en el orden. Lo que no se puede deshacer
    // no se pulsa por inercia: quien llegue con el teclado tiene que encontrar
    // «Cancel» debajo del dedo. En el orden visual se queda a la derecha, que es
    // donde lo pone el juego.
    pie.append(this.botonAceptar.nodo, this.botonCancelar.nodo);
    dentro.appendChild(pie);

    this.marco.cuerpo.appendChild(dentro);
    queueMicrotask(() => { try { this.botonCancelar.nodo.focus(); } catch { /* da igual */ } });
  }

  get nodo() { return this.marco.nodo; }

  aceptar() {
    // Se cierra ANTES de hacer la cosa. Si lo que hay detrás es `app.quit()`,
    // lo de después no llega a correr nunca, y una ventana que se queda puesta
    // mientras el proceso muere es lo que se ve como un cuelgue.
    this.cerrar();
    this.alAceptar?.();
    return this;
  }

  cerrar() { this.marco.cerrar(); return this; }

  /** Las dos ventanas con pestañas tienen `soltar()`; quien cierra llama a todas. */
  soltar() { return this; }
}
