import { leerMdl } from "../src/bsp/mdl.js";
import { existsSync } from "node:fs";
const D = "../MSC/assets/msr/models/monsters/";
const nombres = ["goblin_new", "giant_rat", "spider", "skeleton", "spider_mini"];
console.log("  modelo             huesos  secuencias  grupos sec  bodyparts  texturas  bytes   cuadra");
for (const n of nombres) {
  const r = `${D}${n}.mdl`;
  if (!existsSync(r)) { console.log(`  ${n.padEnd(18)} FALTA`); continue; }
  const m = leerMdl(r);
  console.log(`  ${n.padEnd(18)} ${String(m.nHuesos).padStart(6)} ${String(m.nSecuencias).padStart(11)} ` +
    `${String(m.nGruposSec).padStart(11)} ${String(m.nBodyparts).padStart(10)} ${String(m.nTexturas).padStart(9)} ` +
    `${String(m.bytes).padStart(8)}   ${m.cuadra ? "si" : "NO"}`);
}
