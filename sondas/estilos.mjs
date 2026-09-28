import { leerBsp, leerModelos, leerTexinfo, leerCaras, tieneLuz } from "../src/bsp/lector.js";
import { empaquetar } from "../src/bsp/luz.js";
import { PATRONES } from "../src/bsp/gamma.js";

const bsp = leerBsp("../MSC/assets/msr/maps/gatecity.bsp");
const modelos = leerModelos(bsp);
const texinfos = leerTexinfo(bsp);
let caras = [];
for (let i = 0; i < modelos.length; i++) caras = caras.concat(leerCaras(bsp, modelos[i], texinfos));

const cuenta = new Map();
for (const c of caras) for (const e of c.estilos) if (e !== 255) cuenta.set(e, (cuenta.get(e) ?? 0) + 1);
console.log("bloques por estilo");
for (const [e, n] of [...cuenta].sort((a, b) => b[1] - a[1]))
  console.log(`   estilo ${String(e).padStart(3)}: ${String(n).padStart(6)} bloques   patron ${PATRONES[e] ? `"${PATRONES[e]}"` : "(fijo)"}`);

const ANIM = new Set([...cuenta.keys()].filter((e) => PATRONES[e] && PATRONES[e] !== "m"));
console.log(`\nestilos que PARPADEAN en este mapa: ${[...ANIM].join(", ")}`);

let ninguno = 0, uno = 0, ambos = 0;
for (const c of caras) {
  if (!tieneLuz(c)) continue;
  const s = new Set(c.estilos.filter((e) => ANIM.has(e)));
  if (s.size === 0) ninguno++; else if (s.size === 1) uno++; else ambos++;
}
console.log(`caras con luz: quietas ${ninguno}  con un estilo animado ${uno}  CON LOS DOS ${ambos}`);

const conLuz = caras.filter(tieneLuz);
const atlas = empaquetar(conLuz, { ancho: 1024 });
let lux = 0, luxAnim = 0, yMin = 1e9, yMax = -1e9;
for (const it of atlas.items) {
  const n = it.ancho * it.alto;
  lux += n;
  if (it.cara.estilos.some((e) => ANIM.has(e))) {
    luxAnim += n; yMin = Math.min(yMin, it.y); yMax = Math.max(yMax, it.y + it.alto);
  }
}
console.log(`\natlas ${atlas.ancho}x${atlas.alto}  luxels ${lux}  animados ${luxAnim} (${(luxAnim/lux*100).toFixed(1)} %)`);
console.log(`hoy los animados van de la fila ${yMin} a la ${yMax}: ocupan CASI TODO el atlas`);

const letra = (p, i) => p[i % p.length].charCodeAt(0) - 97;
const lista = [...ANIM];
const periodo = lista.reduce((a, e) => {
  const l = PATRONES[e].length; const g = (x, y) => y ? g(y, x % y) : x; return a * l / g(a, l);
}, 1);
const pares = new Set();
for (let i = 0; i < periodo; i++) pares.add(lista.map((e) => letra(PATRONES[e], i)).join(","));
console.log(`\nciclo combinado ${periodo} pasos (${(periodo / 10).toFixed(1)} s a 10 Hz)`);
console.log(`COMBINACIONES DISTINTAS: ${pares.size}`);
for (const p of [...pares].sort()) console.log(`   ${lista.map((e, k) => `estilo ${e} = ${p.split(",")[k]}`).join("   ")}`);
