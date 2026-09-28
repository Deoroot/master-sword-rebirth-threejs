// Que entidades de JUEGO pone Gate City, y cuales piden un .mdl con animacion.
import { leerBsp, leerEntidades } from "../src/bsp/lector.js";
const bsp = leerBsp("../MSC/assets/msr/maps/gatecity.bsp");
const ents = leerEntidades(bsp);
const porClase = new Map();
for (const e of ents) {
  const c = e.classname ?? "(sin classname)";
  const g = porClase.get(c) ?? { n: 0, ej: e };
  g.n++; porClase.set(c, g);
}
const filas = [...porClase].sort((a, b) => b[1].n - a[1].n);
console.log(`${ents.length} entidades, ${filas.length} clases distintas\n`);
for (const [c, g] of filas) console.log(`  ${String(g.n).padStart(4)}  ${c}`);
console.log("\n--- las que NO son de geometria ni de luz ---");
for (const [c, g] of filas) {
  if (/^(worldspawn|light|info_|func_|msarea|trigger_|env_|ambient_|infodecal|cycler)/.test(c)) continue;
  console.log(`  ${String(g.n).padStart(4)}  ${c}   ejemplo: ${JSON.stringify(g.ej).slice(0, 220)}`);
}
