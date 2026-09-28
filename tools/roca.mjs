// La roca del jharro: el informe y el corte.
//
//   node tools/roca.mjs              -> build/jharro/corte.svg y las cifras
//   node tools/roca.mjs --semillas   -> el barrido con el que se eligió la semilla
//
// El plano de plantas enseña por dónde se pasa y no enseña NADA de lo que decide
// este trabajo, porque la altura libre no se ve desde arriba. Un jharro dibujado
// en planta se parece igual con dos metros de techo que con nueve, y la medida
// dice que la diferencia entre esas dos cosas es la mitad del diseño. Por eso
// aquí el dibujo es un CORTE: se ve el techo de cada sitio, se ve el contraste
// entre el pasillo y la bóveda, y se ven las plantas unas encima de otras.

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CELDA } from "../src/kit/house.js";
import {
  ANCHO, FONDO, PLANTAS, NOMBRE, SEMILLA, ALTURA_LIBRE_MEDIDA, PASO_LIBRE,
  planJharro, cotaMundo, transitable,
} from "../src/kit/jharro.js";
import {
  generarRoca, repartirAlturas, libreEn, celdasTunel, cotaTunel, paredesFinas,
  ALTO_TUNEL, GAMMA,
} from "../src/kit/roca.js";
import { montarCiudad } from "../src/kit/ciudad.js";
import { alturaLibre, superficie } from "../src/kit/medir.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "build", "jharro");

/** Lo medido de Gate City, que es contra lo que se compara todo. */
const OBJETIVO = {
  p25: 2.3, mediana: 2.8, p75: 4.9, p90: 9.3, p10: 0.8,
  bajo3: 0.55, sobre8: 0.16, cubierto: 1.07,
};

const COLOR = {
  fondo: "#0b0806",
  roca: "#1d1712",
  hueco: "#5d503f",
  pasillo: "#4a4036",
  cuarto: "#6b5b48",
  boveda: "#9a8058",
  tunel: "#c9a25d",
  texto: "#a89478",
  titulo: "#e6dac4",
};
const mono = 'font-family="ui-monospace,Consolas,monospace"';

/**
 * Un corte vertical del jharro por una fila de celdas.
 *
 * `z` es la fila. Se dibuja el ancho entero y las ocho cotas, y cada hueco se
 * pinta con el color de su tipo de tramo: así el corte dice a la vez dónde hay
 * sitio y de qué clase es el sitio.
 */
export function dibujarCorte(plan, alturas, z, { escala = 9 } = {}) {
  const yTecho = cotaMundo(PLANTAS.length - 1) + 12;
  const yFondo = cotaMundo(0) - 3;
  const W = ANCHO * CELDA * escala * 0.5 + 90;
  const H = (yTecho - yFondo) * escala + 52;
  const px = (mx) => 70 + mx * escala * 0.5;
  const py = (my) => 22 + (yTecho - my) * escala;
  const piezas = [`<rect width="${W}" height="${H}" fill="${COLOR.fondo}"/>`];
  // La roca, de lado a lado: es el fondo, y lo que se recorta son los huecos.
  piezas.push(
    `<rect x="${px(0)}" y="${py(yTecho)}" width="${px(ANCHO * CELDA) - px(0)}" ` +
      `height="${py(yFondo) - py(yTecho)}" fill="${COLOR.roca}"/>`
  );

  // Las cotas, con su etiqueta.
  for (const p of PLANTAS) {
    const y = cotaMundo(p.indice);
    piezas.push(
      `<line x1="${px(0)}" y1="${py(y)}" x2="${px(ANCHO * CELDA)}" y2="${py(y)}" ` +
        `stroke="#ffffff10" stroke-width="0.5"/>`
    );
    piezas.push(
      `<text x="64" y="${py(y) + 3}" text-anchor="end" ${mono} font-size="8" fill="${COLOR.texto}">` +
        `${p.cota} m</text>`
    );
  }

  // Los huecos de cada planta en esta fila.
  let celdas = 0;
  for (const pl of plan.plantas) {
    const y0 = cotaMundo(pl.indice);
    for (let x = 0; x < ANCHO; x++) {
      if (!transitable(plan, pl.indice, x, z)) continue;
      const h = libreEn(plan, alturas, pl.indice, x, z);
      const tramo = pl.tramos[pl.suelo.get(`${x},${z}`)];
      celdas++;
      piezas.push(
        `<rect x="${px(x * CELDA)}" y="${py(y0 + h)}" width="${CELDA * escala * 0.5}" ` +
          `height="${(h) * escala}" fill="${COLOR[tramo.tipo]}"/>`
      );
    }
  }

  // Los túneles que cruzan esta fila.
  for (const e of plan.enlaces) {
    const yA = cotaMundo(e.arriba.planta);
    const yB = cotaMundo(e.abajo.planta);
    for (const c of celdasTunel(e)) {
      if (c.z !== z) continue;
      const d0 = (c.k - 1) * CELDA + CELDA / 2 - CELDA / 2;
      const ya = cotaTunel(e, d0, yA, yB);
      const yb = cotaTunel(e, d0 + CELDA, yA, yB);
      const a = px(c.x * CELDA), b = px((c.x + 1) * CELDA);
      const [ia, ib] = e.dir[0] >= 0 ? [ya, yb] : [yb, ya];
      piezas.push(
        `<polygon points="${a},${py(ia)} ${b},${py(ib)} ${b},${py(ib + ALTO_TUNEL)} ` +
          `${a},${py(ia + ALTO_TUNEL)}" fill="${COLOR.tunel}"/>`
      );
    }
  }

  piezas.push(
    `<text x="70" y="14" ${mono} font-size="10" fill="${COLOR.titulo}">` +
      `corte por la fila z=${z} — ${celdas} celdas de hueco</text>`
  );
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(W)}" height="${Math.ceil(H)}" viewBox="0 0 ${Math.ceil(W)} ${Math.ceil(H)}">${piezas.join("")}</svg>`,
    W: Math.ceil(W), H: Math.ceil(H), celdas,
  };
}

/** Las filas con más hueco: las que merece la pena cortar. */
export function filasConMasHueco(plan, cuantas = 5) {
  const cuenta = new Array(FONDO).fill(0);
  for (const pl of plan.plantas) {
    for (const k of pl.suelo.keys()) cuenta[+k.split(",")[1]]++;
  }
  // Con separación: las cinco filas con más hueco salían consecutivas —20, 21,
  // 22, 23— y cinco cortes casi iguales enseñan una quinta parte del jharro cinco
  // veces. Se exige que disten al menos cuatro filas.
  const elegidas = [];
  for (const [n, z] of cuenta.map((n, z) => [n, z]).sort((a, b) => b[0] - a[0])) {
    if (!n || elegidas.some((w) => Math.abs(w - z) < 4)) continue;
    elegidas.push(z);
    if (elegidas.length === cuantas) break;
  }
  return elegidas.sort((a, b) => a - b);
}

/** Varias filas en una hoja. */
export function dibujarCortes(plan, alturas, filas) {
  const hojas = filas.map((z) => dibujarCorte(plan, alturas, z));
  const W = Math.max(...hojas.map((h) => h.W));
  const H = hojas.reduce((a, h) => a + h.H, 0) + 30;
  const piezas = [`<rect width="${W}" height="${H}" fill="${COLOR.fondo}"/>`];
  piezas.push(
    `<text x="14" y="20" ${mono} font-size="14" fill="${COLOR.titulo}">` +
      `${NOMBRE.toUpperCase()} — cortes verticales, escala real</text>`
  );
  let y = 30;
  for (const h of hojas) {
    piezas.push(`<g transform="translate(0,${y})">${h.svg}</g>`);
    y += h.H;
  }
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${piezas.join("")}</svg>`, W, H };
}

// --- informe ------------------------------------------------------------------

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.includes("--semillas")) {
    // El barrido con el que se eligió la semilla por defecto. Está aquí para que
    // se pueda repetir: una semilla elegida sin criterio comprobable es un número
    // mágico, y una elegida con criterio escrito es una decisión.
    console.log("\nsemilla  cob-x cob-z  bóveda   p25  med  p75  p90    <3    >8  finas  error");
    for (const semilla of [1, 2, 3, 7, 11, 19, 23, 31, 101, 777, 1234, 0x4a48]) {
      const plan = planJharro({ semilla });
      const r = generarRoca(plan);
      const a = alturaLibre(r.malla);
      const finas = paredesFinas(plan, repartirAlturas(plan).alturas).length;
      const err =
        Math.hypot(...["p25", "mediana", "p75", "p90"].map((k) => (a[k] - OBJETIVO[k]) / OBJETIVO[k])) +
        Math.abs(a.bajo3 - OBJETIVO.bajo3) * 2 + Math.abs(a.sobre8 - OBJETIVO.sobre8) * 2 +
        Math.max(0, 0.8 - plan.medidas.cobertura.x) * 3 +
        Math.max(0, 0.8 - plan.medidas.cobertura.z) * 3;
      console.log(
        `${String(semilla).padStart(7)}  ${(plan.medidas.cobertura.x * 100).toFixed(0).padStart(4)}% ` +
          `${(plan.medidas.cobertura.z * 100).toFixed(0).padStart(5)}% ${String(plan.medidas.bovedaPuesta).padStart(7)}   ` +
          [a.p25, a.mediana, a.p75, a.p90].map((v) => v.toFixed(1).padStart(4)).join(" ") +
          `  ${(a.bajo3 * 100).toFixed(0).padStart(3)}%  ${(a.sobre8 * 100).toFixed(0).padStart(3)}%  ` +
          `${String(finas).padStart(5)}  ${err.toFixed(3)}${semilla === SEMILLA ? "   <- la elegida" : ""}`
      );
    }
    console.log();
    process.exit(0);
  }

  const plan = planJharro();
  const reparto = repartirAlturas(plan);
  // Con las juntas de las fachadas: la roca que se mide tiene que ser la roca del
  // mundo, no una roca sin pueblo. Donde hay casa, la pared de roca no está.
  const ciudad = montarCiudad(plan, { alturas: reparto.alturas });
  const roca = generarRoca(plan, { alturas: reparto.alturas, juntas: ciudad.juntas });
  const a = alturaLibre(roca.malla);
  const s = superficie(roca.malla);
  const finas = paredesFinas(plan, reparto.alturas);

  const filas = filasConMasHueco(plan, 5);
  const cortes = dibujarCortes(plan, reparto.alturas, filas);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "corte.svg"), cortes.svg);

  console.log(`\nLa roca del ${NOMBRE} — build/jharro/corte.svg (${cortes.W}×${cortes.H} px)`);
  console.log(`  semilla ${SEMILLA}, calibración γ=${GAMMA}`);
  console.log(
    `\n  malla         ${roca.malla.idx.length / 3} triángulos — ` +
      Object.entries(roca.cuenta).map(([k, v]) => `${v} ${k}`).join(", ")
  );
  console.log(
    `  superficie    suelo ${s.suelo.toFixed(0)} m², techo ${s.techo.toFixed(0)} m², ` +
      `pared ${s.pared.toFixed(0)} m²`
  );

  const fila = (nombre, nuestro, objetivo, unidad = " m") => {
    const err = nuestro - objetivo;
    const marca = Math.abs(err) <= Math.max(0.4, Math.abs(objetivo) * 0.12) ? " " : "!";
    console.log(
      `    ${nombre.padEnd(14)} ${nuestro.toFixed(2).padStart(6)}${unidad}   ` +
        `Gate City ${objetivo.toFixed(2)}${unidad}   ${err >= 0 ? "+" : ""}${err.toFixed(2)} ${marca}`
    );
  };
  console.log(`\n  altura libre  ${a.n} pares suelo-techo, medidos como se midió Gate City`);
  fila("p10", a.p10, OBJETIVO.p10);
  fila("p25", a.p25, OBJETIVO.p25);
  fila("mediana", a.mediana, OBJETIVO.mediana);
  fila("p75", a.p75, OBJETIVO.p75);
  fila("p90", a.p90, OBJETIVO.p90);
  fila("por debajo de 3", a.bajo3 * 100, OBJETIVO.bajo3 * 100, " %");
  fila("por encima de 8", a.sobre8 * 100, OBJETIVO.sobre8 * 100, " %");
  fila("techo/suelo", s.cubierto * 100, OBJETIVO.cubierto * 100, " %");

  console.log(
    `\n  recorte       ${(reparto.fraccionRecortada * 100).toFixed(0)} % de las celdas subidas a ` +
      `${PASO_LIBRE} m, que es lo que mide el paso del jugador`
  );
  console.log(
    `  juntas finas  ${finas.length}: sitios donde dos plantas se tocan sin roca en medio`
  );
  const total = s.suelo + s.techo + s.pared + ciudad.medidas.superficie;
  console.log(
    `
  construido    ${ciudad.fachadas.length} fachadas, ${ciudad.medidas.superficie} m² a la vista ` +
      `= ${((ciudad.medidas.superficie / total) * 100).toFixed(1)} % de la superficie`
  );
  console.log(
    `                Gate City: lo construido no llega a un tercio, y el 54 % es roca cruda`
  );
  console.log(
    `                ${ciudad.medidas.piezas} piezas de ${ciudad.medidas.distintas} distintas — ` +
      Object.entries(ciudad.medidas.porTipo).map(([k, v]) => `${v} ${k}`).join(", ")
  );
  console.log(`\n  cortes en las filas ${filas.join(", ")}\n`);
}
