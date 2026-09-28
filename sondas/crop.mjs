import { leerPng } from "../tools/png.mjs";
import { escribirPng } from "../tools/png.mjs";
const img = leerPng(process.argv[2]);
const [x0, y0, w, h] = process.argv.slice(4, 8).map(Number);
const out = new Uint8Array(w * h * 4);
for (let y = 0; y < h; y++)
  for (let x = 0; x < w; x++) {
    const s = ((y0 + y) * img.ancho + (x0 + x)) * 4, d = (y * w + x) * 4;
    out[d] = img.rgba[s]; out[d+1] = img.rgba[s+1]; out[d+2] = img.rgba[s+2]; out[d+3] = 255;
  }
escribirPng(process.argv[3], out, w, h);
console.log(process.argv[3]);
