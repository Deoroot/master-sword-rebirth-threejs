// EL ESQUEMA: de dónde saca un panel de VGUI su letra y sus colores.
//
// Ningún panel de Master Sword lleva una fuente escrita. Piden un esquema por su
// nombre y el esquema contesta:
//
//     g_FontSml   = getFont(getSchemeHandle("Briefing Text"));
//     g_FontTitle = getFont(getSchemeHandle("Title Font"));
//     g_FontID    = getFont(getSchemeHandle("ID Text"));
//                                     vgui_teamfortressviewport.cpp:563-565
//
// Los esquemas los extrae `npm run vgui` de los cuatro `*_textscheme.txt` del
// juego a `build/gatecity/vgui.json`. Aquí se consume.
//
// ── Sin el fichero esto tiene que funcionar igual ──────────────────────────
//
// Misma regla que el HUD y que el menú principal: **un `.json` que falta no puede
// dejar al jugador sin interfaz.** Así que los tres esquemas que el código pide
// de verdad están escritos abajo con los valores del archivo de 640, y lo que
// hace la ficha es mejorarlos, no habilitarlos. Un panel sin letra es un panel
// invisible, y eso es peor que un panel con la letra de otra resolución.

import { deVgui } from "../juego/paleta.js";

/**
 * Las cuatro resoluciones del motor y cómo elige entre ellas.
 *
 *     static int g_ResArray[] = { 640, 960, 1440, 1920 };
 *     int resNum = ARRAYSIZE(g_ResArray) - 1;
 *     while (g_ResArray[resNum] > xRes) resNum--;
 *                                     vgui_schememanager.cpp:108-128
 *
 * El mayor que no pase del ancho. **No interpola**: a 1439 px usa el de 960 tal
 * cual, así que la letra escala a saltos y no suave. Es del motor, no nuestro.
 */
export const RESOLUCIONES = [640, 960, 1440, 1920];

export function resolucionPara(ancho, disponibles = RESOLUCIONES) {
  const orden = [...disponibles].sort((a, b) => a - b);
  let i = orden.length - 1;
  while (i >= 0 && orden[i] > ancho) i--;
  // Por debajo de 640 el motor se queda sin archivo y usa su fuente de socorro
  // («Arial», vgui_schememanager.cpp:362-370). Aquí se devuelve el de 640, que
  // es más útil y es lo único que cambia respecto al original.
  return i < 0 ? orden[0] : orden[i];
}

/**
 * Los tres esquemas de socorro, con los valores del archivo de 640.
 *
 * El alfa va **como lo escribe VGUI**, o sea al revés: 255 es invisible y 0 es
 * opaco. Lo da la vuelta `deVgui()` al pasar a CSS, no esto. Ver `paleta.js`.
 */
const SOCORRO = {
  "Briefing Text": { fuente: "Sitka", tamano: 14, peso: 0, fg: [255, 170, 0, 255] },
  "Title Font": { fuente: "Sitka", tamano: 23, peso: 0, fg: [255, 170, 0, 255] },
  // «ID Text» sale sin color a propósito: es el fallo del motor, que no le aplica
  // los valores por defecto por ser el último esquema del archivo. Ver
  // `tools/vgui.mjs`. Se porta con el fallo.
  "ID Text": { fuente: "Sitka", tamano: 14, peso: 500, fg: null },
};

/**
 * De un `FontName` del juego a una pila de CSS que exista en alguna parte.
 *
 * Sitka es una fuente de Windows: está en el Windows donde se juega a Master
 * Sword y no en un teléfono. Detrás va una pila de serifas, que es la misma que
 * ya usan el HUD y el menú principal — si los paneles cayeran en otra, la
 * pantalla tendría dos letras distintas y eso se ve.
 */
const PILAS = {
  sitka: `'Sitka Text', 'Sitka', Georgia, 'Times New Roman', serif`,
  arial: `Arial, Helvetica, sans-serif`,
  courier: `'Courier New', Courier, monospace`,
  verdana: `Verdana, Geneva, sans-serif`,
};
export const pilaDe = (fuente) =>
  PILAS[String(fuente ?? "").toLowerCase().replace(/\s+/g, "")] ?? PILAS.sitka;

/** Blanco opaco, que es el color al que el motor recurre cuando no hay ninguno. */
const BLANCO = [255, 255, 255, 0];

export class Esquema {
  /**
   * @param ficha  `build/gatecity/vgui.json`, o `null` si no está.
   * @param ancho  el ancho de la pantalla, para elegir el archivo.
   */
  constructor(ficha = null, ancho = 640) {
    this.ficha = ficha;
    this.resoluciones = ficha?.resoluciones?.length ? ficha.resoluciones : RESOLUCIONES;
    this.medir(ancho);
  }

  /** Vuelve a elegir el archivo. Se llama al cambiar el tamaño de la ventana. */
  medir(ancho) {
    this.ancho = ancho;
    this.resolucion = resolucionPara(ancho, this.resoluciones);
    this.tabla = this.ficha?.esquemas?.[this.resolucion] ?? null;
    return this.resolucion;
  }

  /** Un esquema por su nombre, con el de socorro detrás. */
  de(nombre) {
    const x = this.tabla?.[nombre];
    if (x) return x;
    return SOCORRO[nombre] ?? SOCORRO["Briefing Text"];
  }

  /**
   * El `font` de CSS de un esquema.
   *
   * `FontWeight` del juego es el peso de Windows: 0 es normal, 700 negrita,
   * 1400 «very bold» según el comentario del propio archivo. En CSS el máximo es
   * 900, así que se recorta — y 0 no es un peso válido, es «el que sea».
   */
  fuenteCss(nombre) {
    const e = this.de(nombre);
    const peso = e.peso ? Math.min(900, e.peso) : 400;
    const cursiva = e.cursiva ? "italic " : "";
    return `${cursiva}${peso} ${e.tamano}px ${pilaDe(e.fuente)}`;
  }

  /** El alto de línea que este proyecto usa con esa letra. */
  altoDeLinea(nombre) {
    return Math.round(this.de(nombre).tamano * 1.25);
  }

  /**
   * Un color del esquema, ya en CSS. `cual` es `fg`, `bg`, `fgArmado`,
   * `bgArmado`, `fgPulsado` o `bgPulsado`.
   *
   * Si el esquema no lo trae —y el último del archivo no trae ninguno, por el
   * fallo del motor— se devuelve blanco opaco. El motor en ese caso pinta con lo
   * que haya en memoria, que es negro transparente, o sea nada: el texto no se
   * ve. Aquí NO se copia eso, y es la segunda cosa que cambia: un panel cuyo
   * texto no se ve no es fidelidad, es un panel roto.
   */
  color(nombre, cual = "fg") {
    const c = this.de(nombre)[cual] ?? null;
    return deVgui(...(c ?? BLANCO));
  }

  /** ¿Este esquema se quedó sin color por el fallo del motor? Para poder decirlo. */
  sinColor(nombre, cual = "fg") {
    return (this.de(nombre)[cual] ?? null) === null;
  }
}

/**
 * Carga `vgui.json` si está. Nunca lanza: devuelve un esquema de socorro.
 *
 * @param base  la carpeta de `build/gatecity/`, tal como la sirve vite.
 */
export async function cargarEsquema(base = "/build/gatecity/", ancho = 640, traer = fetch) {
  let ficha = null;
  try {
    const r = await traer(`${base}vgui.json`);
    if (r.ok) ficha = await r.json();
  } catch {
    // Sin ficha se sigue: los tres esquemas de socorro están escritos arriba.
  }
  return new Esquema(ficha, ancho);
}
