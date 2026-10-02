// CHARACTER INFO: `CStatPanel`, de `vgui_stats.cpp`.
//
// El cuarto y último de los paneles. Es el de la **P** —`bind "p" "playerinfo"`,
// `config.cfg:24`— y el que enseña quién eres: seis datos generales, los cinco
// atributos y las nueve habilidades, con un panel al lado que describe la que
// esté elegida.
//
// ── Dos columnas y un panel FUERA de la ventana ───────────────────────────
//
//     #define MAINWINDOW_X          XRES(40)      #define TITLE_GENINFO_X XRES(12)
//     #define MAINWINDOW_Y          YRES(40)      #define TITLE_SKILLS_X  XRES(148)
//     #define MAINWINDOW_SIZE_X     XRES(330)     #define MAINBUTTON_SIZE_X XRES(132)
//     #define MAINWINDOW_SIZE_Y     YRES(270)     #define MAINBUTTON_SIZE_Y YRES(16)
//     #define SKILLINFOPANEL_SIZE_X XRES(225)
//                                     vgui_stats.cpp:40-53
//
//     m_InfoPanel->setPos(ix + MAINWINDOW_SIZE_X + XRES(16), iy);
//     m_InfoPanel->setSize(SKILLINFOPANEL_SIZE_X, YRES(96));
//     m_InfoPanel->setBorder(new LineBorder(2, Color(0, 128, 0, 0)));
//                                     vgui_stats.cpp:164-167
//
// El panel de la habilidad **no está dentro de la ventana**: va pegado a su
// derecha, dieciséis píxeles más allá, con el mismo verde del separador del
// menú. Y con el alfa de VGUI al derecho esta vez —`Color(0,128,0,0)`, alfa 0—
// o sea opaco desde el principio, sin desvanecido.
//
// ── `m_NoMouse`, que es la decisión que hay que copiar bien ───────────────
//
//     m_NoMouse = true;
//     SetBits(m_Flags, MENUFLAG_CLOSEONESC | MENUFLAG_TRAPSTEPINPUT);
//                                     vgui_stats.cpp:75-81
//
// La hoja **se lee sin soltar el puntero**. Puedes mirarte las habilidades
// mientras sigues girando la cámara y andando, que es justo lo contrario de lo
// que hacen los otros tres paneles. Copiarlo al revés daría una hoja que te
// quita el control del personaje, y eso cambia cómo se juega.
//
// Y por eso no tiene `MENUFLAG_TRAPNUMINPUT` sino `TRAPSTEPINPUT`: la habilidad
// se elige con **RePág y AvPág**, no con los números, y lo dice en pantalla
// —«Use PGUP/PGDN to view skill info.» (`vgui_stats.cpp:156`)—. Con los números
// atrapados, cambiar de arma con el 1 mientras miras la hoja dejaría de
// funcionar.
//
// ── El esquema roto, que aquí sí se ve ────────────────────────────────────
//
// Este panel usa `g_FontID`, que es el esquema **«ID Text»** — y «ID Text» es el
// último de los cuatro `*_textscheme.txt`, o sea el que se queda sin sus valores
// por defecto por el fallo del lector del motor que el 29 dejó portado. En el
// original su color acaba siendo lo que hubiera en memoria. Aquí se pinta
// blanco, que es la única cosa de ese fallo que NO se copia: un panel cuyo texto
// no se ve no es fidelidad.

import { Panel, MSLabel, LineBorder } from "./widgets.js";
import { PanelConNombre, CERRAR_CON_ESC, ATRAPA_RUEDA, RUEDA } from "./registro.js";
import { PROPIEDADES, ESCUELAS, expNecesaria } from "../juego/stats.js";

export const NOMBRE = "stats";

// ── DOS formatos, y no es un descuido del original ─────────────────────────
//
// Este panel pinta las habilidades en dos sitios y con dos formatos DISTINTOS a
// propósito. Conviene tenerlo escrito porque en una captura se ve como si a la
// lista le faltara algo, y «arreglarlo» sería inventarse un Master Sword que no
// existe — el experimento 65 calcado.
//
//   LA LISTA DE LA IZQUIERDA, nombre y número y nada más:
//
//     _snprintf(cDisplayText, ..., "%s: %i\n", SkillStatList[real_idx].Name,
//               player.GetSkillStat(SKILL_FIRSTSKILL + real_idx));
//     if (m_ActiveStat == real_idx) pTextbox->SetFGColorRGB(Color_SelectedText);
//                                     vgui_stats.cpp:277-285
//
//   EL PANEL DE LA DERECHA, con el porcentaje y lo que falta:
//
//     _snprintf(cDisplayText, ..., "%s: %i (%.2f%%%%) [%i left]\n",
//               Name, (int)SubStat.Value, Percent, (int)ceil(ExpToLevel));
//                                     vgui_stats.cpp:344
//
// Lo único que le pasa a la fila ELEGIDA de la izquierda es que se pone roja.
// El porcentaje vive en la derecha, y sólo ahí.

/** `STATPROP_TOTAL`: más propiedades que esto y son escuelas de magia. */
const PROPIEDADES_DE_ARMA = 3;

/**
 * Una fila del panel de la derecha, tal y como la escribe `vgui_stats.cpp:320-344`.
 *
 *     long double ExpNeeded = GetExpNeeded(SubStat.Value);
 *     float Percent = (float(SubStat.Exp) / float(ExpNeeded)) * 100;
 *     if (Percent > 100.0) Percent = 100.0;
 *     if (Percent < 0.0)   Percent = 0.0;
 *     if (SubStat.Value == 0) Percent = 0.0;
 *     double ExpToLevel = ExpNeeded - SubStat.Exp;
 *
 * Tres detalles que parecen de adorno y no lo son:
 *
 * 1. **`GetExpNeeded(SubStat.Value)`, con el valor ACTUAL y no `valor + 1`.**
 *    Es la misma trampa que `src/juego/stats.js:300` ya tiene documentada para
 *    la subida. `src/juego/interfaz.js` usa `expNecesaria(prop.valor + 1)`, y
 *    eso es correcto ALLÍ porque responde a otra pregunta; copiarlo aquí daría
 *    un porcentaje plausible y equivocado.
 * 2. **La guarda de `Value == 0` es la que sostiene la división.**
 *    `expNecesaria(0)` vale 0 —lo dice su propio comentario: «el primer punto es
 *    gratis»—, así que sin ella esto sería `0/0`. En C eso da `inf` o `NaN` y lo
 *    recogen los topes; en JavaScript daría «NaN%» en pantalla.
 * 3. **`ExpToLevel` NO se topa**, y por eso una propiedad a cero dice
 *    `[0 left]`. Es lo que hace el original, con lo cual un personaje recién
 *    creado enseña `[0 left]` en Proficiency y Balance. Se porta así.
 *
 * LO QUE NO SE PORTA, dicho aquí y no descubierto luego: la rama
 * `if (SubStat.Value > 25)`, que recalcula el porcentaje desde `TestExpArray` —la
 * copia de sombra que el cliente lleva contra las trampas, con su comentario de
 * Shuriken al lado—. En este puerto ese array no existe, así que por encima de
 * 25 el porcentaje sale de la experiencia de verdad. Inventarlo sería peor.
 */
export function filaDePropiedad(prop, cuantas) {
  const nombre = (cuantas > PROPIEDADES_DE_ARMA ? ESCUELAS : PROPIEDADES)
    .find((x) => x.clave === prop.clave)?.nombre ?? prop.clave;

  const falta = expNecesaria(prop.valor);
  let pct = (prop.exp / falta) * 100;
  if (pct > 100) pct = 100;
  if (pct < 0) pct = 0;
  if (prop.valor === 0) pct = 0;

  const quedan = Math.ceil(falta - prop.exp);
  return `${nombre}: ${Math.trunc(prop.valor)} (${pct.toFixed(2)}%) [${quedan} left]`;
}

/** Las medidas, en la pantalla de referencia de 640×480. */
export const MEDIDAS = {
  x: 40, y: 40, ancho: 330, alto: 270,
  generalX: 12, habilidadesX: 148,
  filaAncho: 132, filaAlto: 16,
  infoSeparacion: 16, infoAncho: 225, infoAlto: 96,
  infoTituloY: 3, infoTituloAlto: 20,
  tituloY: 2,
};

/** Los colores, de `vgui_stats.cpp:59-63`. */
export const COLORES = {
  titulo: [255, 255, 255, 0],         // Color_TitleText
  normal: [190, 190, 190, 0],         // Color_NormalText
  instruccion: [128, 128, 128, 0],    // Color_InstructionText
  elegido: [255, 0, 0, 0],            // Color_SelectedText
  borde: [0, 128, 0, 0],              // el verde del panel de la habilidad
};

/** `INFO_STAT_NUM 6`: cuántos datos generales hay. */
export const DATOS_GENERALES = 6;

export class PanelDeHoja extends PanelConNombre {
  /**
   * @param hoja  `() => resumen(personaje)`, de `src/juego/personaje.js`
   */
  constructor({ esquema, hoja }) {
    super({
      nombre: NOMBRE,
      banderas: CERRAR_CON_ESC | ATRAPA_RUEDA,
      // La que importa. Ver arriba.
      sinRaton: true,
    });
    this.esquema = esquema;
    this.hoja = hoja;
    this.elegida = 0;

    this.raiz = new Panel({ x: 0, y: 0, w: 640, h: 480, transparencia: 255, clase: "vg-hoja" });

    // `CTransparentPanel(60, ...)`: un negro muy suave, para poder seguir viendo
    // el juego por detrás mientras se lee.
    this.ventana = new Panel({
      x: MEDIDAS.x, y: MEDIDAS.y, w: MEDIDAS.ancho, h: MEDIDAS.alto,
      transparencia: 60,
    });
    this.ventana.ponBorde(new LineBorder(2, [0, 128, 0, 0]));
    this.raiz.anadir(this.ventana);

    this.titulo = new MSLabel({
      texto: "Character Info", x: 6, y: MEDIDAS.tituloY, w: 300, h: 24,
      esquema: "Title Font", color: [...COLORES.titulo],
    });
    this.ventana.anadir(this.titulo);

    this.rotuloGeneral = new MSLabel({
      texto: "General Information", x: MEDIDAS.generalX - 2, y: 26, w: 140, h: MEDIDAS.filaAlto,
      color: [...COLORES.titulo],
    });
    this.ventana.anadir(this.rotuloGeneral);

    this.general = [];
    for (let i = 0; i < DATOS_GENERALES; i++) {
      const l = new MSLabel({
        texto: "", x: MEDIDAS.generalX, y: 42 + i * MEDIDAS.filaAlto,
        w: MEDIDAS.filaAncho, h: MEDIDAS.filaAlto, color: [...COLORES.normal],
      });
      this.ventana.anadir(l);
      this.general.push(l);
    }

    // Los atributos van debajo de los datos generales, en la misma columna, con
    // un renglón de hueco: `offset += INFO_STAT_NUM * SIZE_Y + SIZE_Y`.
    this.atributos = [];
    const yAtr = 42 + (DATOS_GENERALES + 1) * MEDIDAS.filaAlto;
    for (let i = 0; i < 5; i++) {
      const l = new MSLabel({
        texto: "", x: MEDIDAS.generalX, y: yAtr + i * MEDIDAS.filaAlto,
        w: MEDIDAS.filaAncho, h: MEDIDAS.filaAlto, color: [...COLORES.normal],
      });
      this.ventana.anadir(l);
      this.atributos.push(l);
    }

    this.rotuloHabilidades = new MSLabel({
      texto: "Skills", x: MEDIDAS.habilidadesX - 2, y: 26, w: 100, h: MEDIDAS.filaAlto,
      color: [...COLORES.titulo],
    });
    this.ventana.anadir(this.rotuloHabilidades);

    this.habilidades = [];
    for (let i = 0; i < 9; i++) {
      const l = new MSLabel({
        texto: "", x: MEDIDAS.habilidadesX, y: 42 + i * MEDIDAS.filaAlto,
        w: MEDIDAS.filaAncho, h: MEDIDAS.filaAlto, color: [...COLORES.normal],
      });
      this.ventana.anadir(l);
      this.habilidades.push(l);
    }

    this.instruccion = new MSLabel({
      texto: "Use PGUP/PGDN to view skill info.",
      x: MEDIDAS.generalX, y: MEDIDAS.alto - MEDIDAS.filaAlto - 5,
      w: MEDIDAS.ancho, h: MEDIDAS.filaAlto, color: [...COLORES.instruccion],
    });
    this.ventana.anadir(this.instruccion);

    // El panel de la habilidad, FUERA de la ventana y a su derecha.
    this.info = new Panel({
      x: MEDIDAS.x + MEDIDAS.ancho + MEDIDAS.infoSeparacion, y: MEDIDAS.y,
      w: MEDIDAS.infoAncho, h: MEDIDAS.infoAlto, transparencia: 60,
    });
    this.info.ponBorde(new LineBorder(2, [...COLORES.borde]));
    this.raiz.anadir(this.info);

    this.infoTitulo = new MSLabel({
      texto: "", x: 0, y: MEDIDAS.infoTituloY, w: MEDIDAS.infoAncho, h: MEDIDAS.infoTituloAlto,
      alineacion: "center", color: [...COLORES.titulo],
    });
    this.info.anadir(this.infoTitulo);

    this.infoFilas = [];
    for (let i = 0; i < 5; i++) {
      const l = new MSLabel({
        texto: "", x: MEDIDAS.generalX,
        y: MEDIDAS.infoTituloY + MEDIDAS.infoTituloAlto + i * MEDIDAS.filaAlto,
        w: MEDIDAS.infoAncho - MEDIDAS.generalX, h: MEDIDAS.filaAlto,
        color: [...COLORES.normal],
      });
      this.info.anadir(l);
      this.infoFilas.push(l);
    }

    /** Para la sonda: este panel no tiene botones, y eso también se dice. */
    this.botones = [];
  }

  /**
   * `StepInput(ScrollCmd)`: RePág y AvPág cambian de habilidad.
   *
   *     virtual void StepInput(hudscroll_e ScrollCmd);
   *                                     vgui_stats.cpp:26
   */
  paso(cual) {
    const n = this.habilidades.length;
    this.elegida = (this.elegida + (cual === RUEDA.ARRIBA ? -1 : 1) + n) % n;
    this.refrescar();
  }

  abrir(ahora = 0) { super.abrir(ahora); this.refrescar(); return this; }

  refrescar() {
    const h = this.hoja?.() ?? null;
    if (!h) return this;

    const d = h.derivadas ?? {};
    // Las claves son `vidaMax`, `manaMax` y `aguanteMax` —`derivadas()` de
    // `src/juego/stats.js`—, no `vida`, `mana` y `aguante`. Con los nombres mal
    // esto enseñaba **tres ceros** mientras el HUD, tres centímetros más abajo,
    // decía 15/15, 20/20 y 7/7. No dio ningún error: dio una hoja de personaje
    // que decía que no tienes vida. Se vio en la captura.
    const filas = [
      `Name: ${h.nombre}`,
      `Gold: ${h.oro}`,
      `Health: ${Math.round(d.vidaMax ?? 0)}`,
      `Mana: ${Math.round(d.manaMax ?? 0)}`,
      `Stamina: ${Math.round(d.aguanteMax ?? 0)}`,
      `Weight: ${Math.round(d.carga ?? 0)}`,
    ];
    for (const [i, l] of this.general.entries()) l.ponTexto(filas[i] ?? "");
    for (const [i, l] of this.atributos.entries()) {
      const a = h.atributos?.[i];
      l.ponTexto(a ? `${a.nombre}: ${a.valor}` : "");
    }
    for (const [i, l] of this.habilidades.entries()) {
      const s = h.habilidades?.[i];
      l.ponTexto(s ? `${s.nombre}: ${s.valor}` : "");
      // `Color_SelectedText`, que es rojo. Lo mismo que el botón armado del menú.
      l.color = i === this.elegida ? [...COLORES.elegido] : [...COLORES.normal];
    }

    const s = h.habilidades?.[this.elegida] ?? null;

    // `Parry` ESCONDE el panel entero, y no es una rareza: tiene una sola
    // propiedad, así que un panel de cinco renglones para un número no dice nada.
    //
    //     if (m_ActiveStat < 0 || msstring(SkillStatList[m_ActiveStat].Name) == "Parry")
    //     { m_InfoPanel->setVisible(false); return; }
    //                                     vgui_stats.cpp:295-299
    //
    // El original lo compara por el NOMBRE y no por el índice; aquí por la clave,
    // que es lo mismo y no se mueve si alguien reordena la lista.
    const escondido = !s || s.clave === "parry";
    this.info.ver(!escondido);
    if (escondido) return this._colocarSiProcede();

    this.infoTitulo.ponTexto(s.nombre ?? "");
    const props = s.propiedades ?? [];
    for (const [i, l] of this.infoFilas.entries()) {
      const p = props[i];
      l.ponTexto(p ? filaDePropiedad(p, props.length) : "");
      // `m_StatTypeLabel[i]->setVisible(false)` para los renglones que sobran
      // (`vgui_stats.cpp:315`): un mago gasta los cinco y un arma sólo tres.
      l.ver(Boolean(p));
    }

    return this._colocarSiProcede();
  }

  _colocarSiProcede() {
    if (this._ancho) this.colocar(this._ancho, this._alto, this.esquema);
    return this;
  }

  colocar(ancho, alto, esquema) {
    this._ancho = ancho; this._alto = alto;
    super.colocar(ancho, alto, esquema);
    return this;
  }
}
