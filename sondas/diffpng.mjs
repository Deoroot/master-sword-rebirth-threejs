import { leerPng } from "../tools/png.mjs";
const a = leerPng(process.argv[2]), b = leerPng(process.argv[3]);
let n = 0, max = 0;
for (let i = 0; i < a.rgba.length; i += 4) {
  const d = Math.abs(a.rgba[i]-b.rgba[i]) + Math.abs(a.rgba[i+1]-b.rgba[i+1]) + Math.abs(a.rgba[i+2]-b.rgba[i+2]);
  if (d > 8) n++;
  if (d > max) max = d;
}
console.log(`${n} pixeles de ${a.rgba.length/4} (${(n/(a.rgba.length/4)*100).toFixed(3)} %) cambian, diferencia mayor ${max}`);
