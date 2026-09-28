import { leerBsp, leerModelos, leerTexinfo, leerCaras, tieneLuz } from "../src/bsp/lector.js";
import { empaquetar } from "../src/bsp/luz.js";

const bsp = leerBsp("../MSC/assets/msr/maps/gatecity.bsp");
const modelos = leerModelos(bsp);
const texinfos = leerTexinfo(bsp);
let caras = [];
for (let i = 0; i < modelos.length; i++) caras = caras.concat(leerCaras(bsp, modelos[i], texinfos));
const conLuz = caras.filter(tieneLuz);
const cubo = (c) => [...new Set(c.estilos.filter((e) => e === 1 || e === 6))].sort().join("+") || "quieta";
const cubos = new Map();
for (const c of conLuz) { const k = cubo(c); if (!cubos.has(k)) cubos.set(k, []); cubos.get(k).push(c); }

let total = 0;
console.log("cubo        caras   atlas        variantes    MB");
for (const [k, lista] of [...cubos].sort((a, b) => b[1].length - a[1].length)) {
  const n = k === "quieta" ? 1 : k === "1+6" ? 16 : 4;
  // el más CUADRADO de los que caben, que es lo que respetan todas las GPU
  let mejor = null;
  for (const w of [128, 256, 512, 1024, 2048]) {
    let a; try { a = empaquetar(lista, { ancho: w }); } catch { continue; }
    if (a.alto > 4096) continue;
    const forma = Math.max(a.ancho, a.alto) / Math.min(a.ancho, a.alto);
    const coste = a.ancho * a.alto * (1 + forma / 8);
    if (!mejor || coste < mejor.coste) mejor = { ...a, coste, forma };
  }
  const mb = n * mejor.ancho * mejor.alto * 4 / 1048576;
  total += mb;
  console.log(`${k.padEnd(10)} ${String(lista.length).padStart(6)}   ${`${mejor.ancho}x${mejor.alto}`.padEnd(11)} ${String(n).padStart(6)}    ${mb.toFixed(1)}   ocupacion ${(mejor.ocupacion*100).toFixed(0)} %`);
}
console.log(`\nTOTAL en textura: ${total.toFixed(1)} MB   (hoy 4.0, con 16 atlas enteros 64.0)`);
