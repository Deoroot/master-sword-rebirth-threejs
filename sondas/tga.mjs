import { readFileSync, readdirSync } from "node:fs";
import { decodificarTga } from "../src/bsp/tga.js";
const dir = "../MSC/assets/msr/gfx/detail";
let ok = 0, mal = [];
for (const f of readdirSync(dir)) {
  if (!f.endsWith(".tga")) continue;
  try {
    const b = readFileSync(`${dir}/${f}`);
    const t = decodificarTga(b, f);
    // El oraculo: el recorrido acaba en el ultimo byte, o a 26 del final si trae
    // pie de TGA 2.0 ("TRUEVISION-XFILE").
    const pie = b.length >= 26 && b.subarray(b.length - 18, b.length - 2).toString("latin1") === "TRUEVISION-XFILE";
    const esperado = pie ? b.length - 26 : b.length;
    if (t.bytesLeidos !== esperado) mal.push(`${f}: leidos ${t.bytesLeidos} de ${esperado}${pie ? " (con pie)" : ""}`);
    else ok++;
  } catch (e) { mal.push(`${f}: ${e.message}`); }
}
console.log(`detail/: ${ok} .tga leidos hasta el ultimo byte, ${mal.length} no`);
for (const m of mal.slice(0, 10)) console.log("  ", m);
for (const f of ["up","dn","lf","rt","ft","bk"]) {
  const t = decodificarTga(readFileSync(`../MSC/assets/msr/gfx/env/nature1${f}.tga`), `nature1${f}`);
  let s=0; for (let i=0;i<t.rgba.length;i+=4) s += 0.2126*t.rgba[i]+0.7152*t.rgba[i+1]+0.0722*t.rgba[i+2];
  console.log(`  nature1${f}  ${t.ancho}x${t.alto} ${t.bpp} bits, luz media ${(s/(t.rgba.length/4)).toFixed(1)}`);
}
