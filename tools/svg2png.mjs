// Convierte un SVG en PNG con el navegador que ya está instalado.
//
//   node tools/svg2png.mjs build/jharro/plantas.svg build/jharro/plantas.png
//
// Existe por la regla de siempre: los planos no se dibujan para archivarlos, se
// dibujan para MIRARLOS. Un SVG hay que abrirlo en algo; un PNG se mira con
// cualquier cosa, y sobre todo se puede comparar con el de ayer, que es la cosa
// pendiente desde el experimento 02.

import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const [src, dst] = process.argv.slice(2);
if (!src || !dst) {
  console.error("uso: node tools/svg2png.mjs <entrada.svg> <salida.png>");
  process.exit(2);
}

const svg = readFileSync(src, "utf8");
const m = svg.match(/width="(\d+(?:\.\d+)?)" height="(\d+(?:\.\d+)?)"/);
if (!m) {
  console.error(`${src} no declara ancho y alto en su etiqueta <svg>`);
  process.exit(1);
}
const [ancho, alto] = [Math.ceil(+m[1]), Math.ceil(+m[2])];

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: ancho, height: alto } });
await pagina.setContent(`<body style="margin:0">${svg}</body>`);
await pagina.screenshot({ path: dst });
await navegador.close();

console.log(`${dst}  ${ancho}×${alto} px`);
