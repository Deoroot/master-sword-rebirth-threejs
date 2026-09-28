// La cadena entera sin navegador: para cada grupo, que texel del atlas muestrean
// sus uv1. Si `wood_047` muestrea negro mientras el archivo dice luxel medio 28,
// el fallo esta entre el empaquetado y la UV; si muestrea claro, esta en el render.
import { readFileSync } from "node:fs";
import { leerPng } from "../tools/png.mjs";
const man = JSON.parse(readFileSync("build/gatecity/malla.json", "utf8"));
const bin = readFileSync("build/gatecity/malla.bin");
const atlas = leerPng("build/gatecity/luz.png");
const T = man.bin.tramos;
const uv1 = new Float32Array(bin.buffer, bin.byteOffset + T.uvs1.off, T.uvs1.n);
const idx = new Uint32Array(bin.buffer, bin.byteOffset + T.indices.off, T.indices.n);
const A = atlas.ancho, H = atlas.alto;
const texel = (u, v) => {
  const x = Math.min(A - 1, Math.max(0, Math.round(u * A - 0.5)));
  const y = Math.min(H - 1, Math.max(0, Math.round(v * H - 0.5)));
  const o = (y * A + x) * 4;
  return [atlas.rgba[o], atlas.rgba[o + 1], atlas.rgba[o + 2]];
};
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const negroUV = man.luz.negro;
const filas = [];
for (const g of man.grupos) {
  let s = 0, n = 0, alNegro = 0, min = 999, max = 0;
  for (let i = g.start; i < g.start + g.count; i++) {
    const v = idx[i];
    const u = uv1[v * 2], w = uv1[v * 2 + 1];
    if (Math.abs(u - negroUV[0]) < 1e-6 && Math.abs(w - negroUV[1]) < 1e-6) alNegro++;
    const l = lum(texel(u, w));
    s += l; n++; if (l < min) min = l; if (l > max) max = l;
  }
  if (!n) continue;
  filas.push({ t: g.texture, modo: g.render?.modo ?? 0, clase: g.clase, n, media: s / n, min, max, alNegro });
}
filas.sort((a, b) => b.n - a.n);
console.log("  grupo                      modo  vertices   luz media   min   max   al luxel negro");
for (const f of filas.slice(0, 22))
  console.log(`  ${f.t.padEnd(20)} ${f.clase.padEnd(7)} ${String(f.modo).padStart(2)} ${String(f.n).padStart(8)}  ` +
    `${f.media.toFixed(1).padStart(9)} ${f.min.toFixed(0).padStart(5)} ${f.max.toFixed(0).padStart(5)}   ${f.alNegro}`);
