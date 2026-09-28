// Dibuja el mapa de celdas de Corinth en un SVG.
//
//   node tools/plano.mjs          -> build/horno/plano.svg
//
// No es una ilustracion: es el mismo dato que juzgan las pruebas, dibujado. Por
// eso pinta tambien LO QUE SE ALCANZA -el resultado de inundar desde el punto de
// llegada-, que es la unica forma de ver de un vistazo si el pueblo tiene un
// rincon al que no se puede ir. Una comprobacion en verde dice «se llega a la
// boca»; el plano dice ademas por donde, y si media manzana quedo aislada sin
// que ninguna comprobacion la eche de menos.

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ANCHO, FONDO, PARCELAS, RIO, PUENTE, LLEGADA, PORTON,
  rect, esRio, esPuente, transitable, alcanzables, pendientes,
} from "../src/kit/corinth.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "build", "horno");
const C = 26; // pixeles por celda
const MARGEN = 30;

// Los colores salen del atlas del kit, no de una paleta cualquiera: el ocre de
// la paja, el yeso, el roble del entramado, la pizarra.
const COLOR = {
  fuera: "#1b1713",
  calle: "#2b2620",
  alcanzable: "#39322a",
  rio: "#3f5470",
  puente: "#6b5a44",
  muralla: "#0f0d0b",
};

// Un color por papel. El rojo se reserva a la boca de la mazmorra y a los
// fallos: en este plano, rojo significa siempre «mira aqui».
const PAPEL = {
  casa: { relleno: "#b9a184", borde: "#7d6a52" },
  posada: { relleno: "#c9a25d", borde: "#8a6c33" },
  mercado: { relleno: "#6a5f4a", borde: "#8d8164" },
  boca: { relleno: "#7d2f2a", borde: "#c1584c" },
  guarnicion: { relleno: "#4e5c74", borde: "#8296b4" },
  herreria: { relleno: "#7a4a2c", borde: "#b77a4a" },
  patio: { relleno: "#453d32", borde: "#6d6152" },
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Devuelve el SVG del plano y las cifras con que se juzga.
 *
 * Se exporta para que la pagina publicada ensene EXACTAMENTE el mismo dibujo
 * que juzga este programa. Si la pagina tuviera su propia copia del plano, lo
 * que se mira y lo que se comprueba dejarian de ser lo mismo en cuanto alguien
 * moviera una parcela.
 */
export function dibujarPlano() {
const W = ANCHO * C + MARGEN * 2;
const H = FONDO * C + MARGEN * 2 + 150;
const piezas = [];
const px = (x) => MARGEN + x * C;
const pz = (z) => MARGEN + z * C;

piezas.push(`<rect width="${W}" height="${H}" fill="${COLOR.fuera}"/>`);

// --- el suelo, celda a celda -------------------------------------------------
const vistas = alcanzables();
for (let z = 0; z < FONDO; z++) {
  for (let x = 0; x < ANCHO; x++) {
    let relleno = COLOR.calle;
    if (esRio(x, z)) relleno = esPuente(x, z) ? COLOR.puente : COLOR.rio;
    else if (vistas.has(`${x},${z}`)) relleno = COLOR.alcanzable;
    else if (transitable(x, z)) relleno = COLOR.calle; // pisable pero aislada
    piezas.push(
      `<rect x="${px(x)}" y="${pz(z)}" width="${C}" height="${C}" fill="${relleno}" ` +
        `stroke="#00000033" stroke-width="0.5"/>`
    );
  }
}

// Las celdas pisables a las que NO se llega: se marcan en rojo. Es el fallo que
// ninguna comprobacion de «se llega a X» encuentra, porque nadie pregunta por
// una calle que no sabia que existia.
const aisladas = [];
for (let z = 0; z < FONDO; z++) {
  for (let x = 0; x < ANCHO; x++) {
    if (transitable(x, z) && !vistas.has(`${x},${z}`)) {
      aisladas.push([x, z]);
      piezas.push(
        `<rect x="${px(x)}" y="${pz(z)}" width="${C}" height="${C}" fill="#8a2b22" opacity="0.55"/>`
      );
    }
  }
}

// --- las parcelas ------------------------------------------------------------
for (const p of PARCELAS) {
  const r = rect(p);
  const c = PAPEL[p.papel] ?? { relleno: "#8a7f70", borde: "#bdb1a0" };
  piezas.push(
    `<rect x="${px(r.x) + 1.5}" y="${pz(r.z) + 1.5}" width="${r.ancho * C - 3}" ` +
      `height="${r.fondo * C - 3}" fill="${c.relleno}" fill-opacity="${p.casa ? 0.9 : 0.55}" ` +
      `stroke="${c.borde}" stroke-width="${p.falta ? 2 : 1}" ` +
      `${p.falta ? 'stroke-dasharray="5 3"' : ""}/>`
  );
  // El nombre, en dos lineas si hace falta, dentro de la parcela.
  const cx = px(r.x) + (r.ancho * C) / 2;
  const cy = pz(r.z) + (r.fondo * C) / 2;
  const corto = p.nombre.replace(/^casa-/, "").replace(/-/g, " ");
  piezas.push(
    `<text x="${cx}" y="${cy + 3}" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" ` +
      `font-size="9" fill="#14110d" opacity="0.85">${esc(corto)}</text>`
  );
}

// --- muralla, porton, llegada ------------------------------------------------
piezas.push(
  `<rect x="${px(0)}" y="${pz(0)}" width="${ANCHO * C}" height="${FONDO * C}" ` +
    `fill="none" stroke="#0b0907" stroke-width="7"/>`
);
piezas.push(
  `<rect x="${px(PORTON.celda[0]) - 4}" y="${pz(PORTON.celda[1])}" width="9" ` +
    `height="${PORTON.fondo * C}" fill="#8a6a3f"/>`
);
piezas.push(
  `<text x="${px(0) - 8}" y="${pz(PORTON.celda[1]) + PORTON.fondo * C / 2 + 3}" text-anchor="end" ` +
    `font-family="ui-monospace,Consolas,monospace" font-size="9" fill="#a89478">portón</text>`
);
piezas.push(
  `<circle cx="${px(LLEGADA[0]) + C / 2}" cy="${pz(LLEGADA[1]) + C / 2}" r="6" ` +
    `fill="none" stroke="#e8c268" stroke-width="2"/>`
);
piezas.push(
  `<circle cx="${px(LLEGADA[0]) + C / 2}" cy="${pz(LLEGADA[1]) + C / 2}" r="2" fill="#e8c268"/>`
);

// --- leyenda -----------------------------------------------------------------
const base = MARGEN + FONDO * C + 26;
piezas.push(
  `<text x="${MARGEN}" y="${base}" font-family="ui-monospace,Consolas,monospace" font-size="12" ` +
    `fill="#e6dac4">CORINTH — ${ANCHO}×${FONDO} celdas de 4 m = ${ANCHO * 4}×${FONDO * 4} m</text>`
);
const leyenda = [
  ["se alcanza desde el portón", COLOR.alcanzable],
  ["río", COLOR.rio],
  ["puente", COLOR.puente],
  ["casas", PAPEL.casa.relleno],
  ["guarnición", PAPEL.guarnicion.relleno],
  ["boca de la mazmorra", PAPEL.boca.relleno],
];
// Dos columnas y no tres: con tres, la ultima etiqueta se salia del SVG por la
// derecha. El ancho del dibujo lo manda el pueblo, no la leyenda.
leyenda.forEach(([texto, color], i) => {
  const x = MARGEN + (i % 2) * 270;
  const y = base + 20 + Math.floor(i / 2) * 18;
  piezas.push(`<rect x="${x}" y="${y - 8}" width="11" height="11" fill="${color}"/>`);
  piezas.push(
    `<text x="${x + 17}" y="${y + 1}" font-family="ui-monospace,Consolas,monospace" font-size="10" ` +
      `fill="#a89478">${esc(texto)}</text>`
  );
});
piezas.push(
  `<text x="${MARGEN}" y="${base + 90}" font-family="ui-monospace,Consolas,monospace" font-size="10" ` +
    `fill="#a89478">trazo discontinuo: parcela que el kit CC0 no puede construir todavía ` +
    `(${pendientes().length})</text>`
);

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    piezas.join("") +
    `</svg>`;

  return { svg, W, H, vistas, aisladas };
}

// --- informe, solo cuando se ejecuta este archivo ----------------------------

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
const { svg, W, H, vistas, aisladas } = dibujarPlano();

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "plano.svg"), svg);

console.log(`\nPlano en build/horno/plano.svg  (${W}×${H} px)`);
console.log(`  ${PARCELAS.length} parcelas, ${pendientes().length} sin resolver`);
console.log(`  ${vistas.size} celdas alcanzables de ${ANCHO * FONDO}`);
console.log(`  ${aisladas.length} celdas pisables pero AISLADAS`);
for (const { parcela, falta } of pendientes()) console.log(`    falta en ${parcela}: ${falta}`);

console.log();
if (aisladas.length) {
  // Un rincon al que no se llega no rompe nada y no lo echa de menos ninguna
  // comprobacion, porque nadie pregunta por una calle que no sabia que existia.
  console.log(
    `FALLO: ${aisladas.length} celdas pisables no se alcanzan desde el portón: ` +
      aisladas.slice(0, 8).map((c) => c.join(",")).join("  ")
  );
  process.exit(1);
}
console.log("Todo el suelo pisable de Corinth se alcanza desde el portón.\n");
}
