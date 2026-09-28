import { leerPng } from "../tools/png.mjs";
const img = leerPng(process.argv[2]);
for (const s of process.argv.slice(3)) {
  const [x, y] = s.split(",").map(Number);
  const o = (y * img.ancho + x) * 4;
  console.log(`  (${x},${y}) = ${img.rgba[o]} ${img.rgba[o+1]} ${img.rgba[o+2]}`);
}
