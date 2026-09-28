import { leerFichaNpc, modeloYAnimaciones } from "../src/bsp/script.js";
import { leerBsp, leerEntidades } from "../src/bsp/lector.js";
import { existsSync } from "node:fs";
const RAIZ = "../MSC/MSCScripts/scripts";
const MODELOS = "../MSC/assets/msr/models";
const bsp = leerBsp("../MSC/assets/msr/maps/gatecity.bsp");
const ents = leerEntidades(bsp);
const bichos = ents.filter((e) => /^msmonster_|^ms_npc$|^msworlditem_/.test(e.classname ?? ""));
const porScript = new Map();
for (const e of bichos) {
  const s = e.defscriptfile ?? e.scriptfile;
  if (!s) continue;
  const g = porScript.get(s) ?? { n: 0, clases: new Set() };
  g.n++; g.clases.add(e.classname); porScript.set(s, g);
}
console.log(`${bichos.length} entidades de bicho/NPC, ${porScript.size} scripts distintos\n`);
console.log("  n  script                              classname del mapa        modelo que pone el script        parado/andando   existe");
for (const [s, g] of [...porScript].sort((a,b)=>b[1].n-a[1].n)) {
  const f = leerFichaNpc(RAIZ, s);
  const m = modeloYAnimaciones(f);
  const ruta = m?.modelo ? `${MODELOS}/${m.modelo}` : null;
  const hay = ruta ? existsSync(ruta) : false;
  console.log(`  ${String(g.n).padStart(2)}  ${s.padEnd(34)} ${[...g.clases].join(",").padEnd(24)} ` +
    `${(m?.modelo ?? (f ? "(sin setmodel)" : "SCRIPT NO ESTA")).padEnd(32)} ` +
    `${((m?.parado ?? "-") + "/" + (m?.andando ?? "-")).padEnd(16)} ${ruta ? (hay ? "si" : "NO") : "-"}`);
}
