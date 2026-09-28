// Compara un fotograma nuestro con una captura del JUEGO ORIGINAL, en números.
//
// ── Por qué hace falta ──────────────────────────────────────────────────────
//
// Porque la iluminación de este mapa se ha calibrado dos veces a ojo y las dos
// veces mal. Una poniendo la rampa de gamma en las texturas y quitándola por
// «se ve lavado»; otra dejándola y quedándose corto. El criterio era siempre el
// mismo —mirar una vista y opinar— y una vista no distingue «oscuro» de
// «apagado» ni «cálido» de «amarillo».
//
// Ahora hay referencia de verdad: quien lo juega trajo **una captura del juego
// original de la misma calle** que una nuestra. Con las dos delante, la pregunta
// deja de ser estética y pasa a ser un histograma contra otro.
//
// ── Qué se compara y por qué esas varas ─────────────────────────────────────
//
//   luminancia      la mediana y los percentiles 10 y 90. La mediana dice si el
//                   sitio está igual de oscuro; el rango 10-90 dice si tiene el
//                   mismo CONTRASTE, que es lo que distingue una cueva con
//                   charcos de luz de una cueva pintada de marrón.
//   saturación      el reproche literal fue «se ve amarillo». Eso es saturación,
//                   no brillo, y ninguna vara de brillo lo habría visto.
//   tono            el juego tiene piedra gris verdosa con charcos cálidos; lo
//                   nuestro salía amarillo uniforme. Dos tonos muy distintos con
//                   la misma luminancia.
//   contraste local la desviación típica dentro de bloques de 24 px. Es lo que
//                   mide si hay CHARCOS: una pared con una lámpara tiene mucho,
//                   una pared iluminada de plano tiene poco, y las dos pueden
//                   tener la misma mediana global.
//
// ── El recorte ─────────────────────────────────────────────────────────────
//
// Las dos capturas llevan cosas que no son el mapa: el HUD del juego abajo, el
// modelo del jugador en el centro-abajo, y nuestra barra de estado. Se recortan
// por fracción y no por píxeles, porque las dos imágenes no miden lo mismo.

import { leerPng } from "./png.mjs";

/** Lo que se descarta de cada borde, en fracción de la imagen. */
export const RECORTE = { arriba: 0.04, abajo: 0.22, izquierda: 0.02, derecha: 0.02 };

const luminancia = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Saturación y tono de HSV, que es lo que se corresponde con «se ve amarillo». */
function satTono(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [s, h];
}

export function medir(img, { recorte = RECORTE } = {}) {
  const { rgba, ancho, alto } = img;
  const x0 = Math.floor(ancho * recorte.izquierda), x1 = Math.ceil(ancho * (1 - recorte.derecha));
  const y0 = Math.floor(alto * recorte.arriba), y1 = Math.ceil(alto * (1 - recorte.abajo));
  const lum = [], sat = [];
  const tonos = new Array(12).fill(0);
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * ancho + x) * 4;
      const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      const l = luminancia(r, g, b);
      lum.push(l);
      const [s, h] = satTono(r, g, b);
      sat.push(s);
      // Sólo cuentan el tono los píxeles con algo de color y algo de luz: el
      // tono de un negro casi puro es ruido de redondeo.
      if (s > 0.15 && l > 12) tonos[Math.min(11, Math.floor(h / 30))]++;
      n++;
    }
  }
  lum.sort((a, b) => a - b);
  sat.sort((a, b) => a - b);
  const q = (arr, f) => arr[Math.floor((arr.length - 1) * f)];

  // El contraste local: la desviación típica dentro de bloques de 24 px, y la
  // mediana de esas desviaciones. Un bloque de pared con una lámpara al lado
  // tiene mucha; uno de pared iluminada de plano tiene poca.
  const B = 24;
  const locales = [];
  for (let by = y0; by + B <= y1; by += B) {
    for (let bx = x0; bx + B <= x1; bx += B) {
      let s = 0, s2 = 0;
      for (let y = by; y < by + B; y++) {
        for (let x = bx; x < bx + B; x++) {
          const i = (y * ancho + x) * 4;
          const l = luminancia(rgba[i], rgba[i + 1], rgba[i + 2]);
          s += l; s2 += l * l;
        }
      }
      const m = s / (B * B);
      locales.push(Math.sqrt(Math.max(0, s2 / (B * B) - m * m)));
    }
  }
  locales.sort((a, b) => a - b);

  const total = tonos.reduce((a, b) => a + b, 0) || 1;
  return {
    pixeles: n,
    luz: { p10: q(lum, 0.1), mediana: q(lum, 0.5), p90: q(lum, 0.9), media: lum.reduce((a, b) => a + b, 0) / n },
    oscuro: lum.filter((l) => l < 32).length / n,
    claro: lum.filter((l) => l > 180).length / n,
    quemado: lum.filter((l) => l > 245).length / n,
    saturacion: { mediana: q(sat, 0.5), p90: q(sat, 0.9) },
    contrasteLocal: { mediana: q(locales, 0.5), p90: q(locales, 0.9) },
    // Los doce sectores de tono, en porcentaje. 0-30 es rojo, 30-60 naranja y
    // amarillo, 60-90 amarillo verdoso, 90-150 verde.
    tonos: tonos.map((t) => t / total),
  };
}

const NOMBRES_TONO = ["rojo", "naranja", "amarillo", "lima", "verde", "esmeralda",
  "cian", "azulado", "azul", "violeta", "magenta", "rosa"];

export function informe(etiquetas, medidas) {
  const fila = (nombre, f, dec = 1) =>
    `  ${nombre.padEnd(24)}` + medidas.map((m) => String(f(m).toFixed(dec)).padStart(10)).join("");
  console.log(`  ${"".padEnd(24)}` + etiquetas.map((e) => e.padStart(10)).join(""));
  console.log(fila("luz p10", (m) => m.luz.p10));
  console.log(fila("luz MEDIANA", (m) => m.luz.mediana));
  console.log(fila("luz p90", (m) => m.luz.p90));
  console.log(fila("rango p10-p90", (m) => m.luz.p90 - m.luz.p10));
  console.log(fila("% oscuro (<32)", (m) => m.oscuro * 100));
  console.log(fila("% claro (>180)", (m) => m.claro * 100));
  console.log(fila("% quemado (>245)", (m) => m.quemado * 100));
  console.log(fila("saturación mediana", (m) => m.saturacion.mediana, 3));
  console.log(fila("saturación p90", (m) => m.saturacion.p90, 3));
  console.log(fila("contraste local", (m) => m.contrasteLocal.mediana));
  console.log(fila("contraste local p90", (m) => m.contrasteLocal.p90));
  console.log(`\n  reparto de tono (% de los píxeles con color):`);
  for (let i = 0; i < 12; i++) {
    if (medidas.every((m) => m.tonos[i] < 0.02)) continue;
    console.log(fila(`  ${i * 30}-${i * 30 + 30}° ${NOMBRES_TONO[i]}`, (m) => m.tonos[i] * 100));
  }
}

if (process.argv[1]?.endsWith("comparar.mjs")) {
  const rutas = process.argv.slice(2).filter((a) => a.endsWith(".png"));
  if (rutas.length < 2) {
    console.error("uso: node tools/comparar.mjs <referencia.png> <nuestra.png> [...]");
    process.exit(1);
  }
  const medidas = rutas.map((r) => medir(leerPng(r)));
  console.log(`\ncomparación, recortando el ${(RECORTE.abajo * 100).toFixed(0)} % de abajo (HUD y jugador):\n`);
  informe(rutas.map((r) => r.replace(/^.*[\\/]/, "").replace(/\.png$/, "").slice(0, 10)), medidas);
  console.log("");
}
