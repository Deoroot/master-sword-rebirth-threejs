import { leerBsp, leerEntidades } from "../src/bsp/lector.js";
import { leerMdl } from "../src/bsp/mdl.js";
import { leerSecuencias } from "../src/bsp/mdlanim.js";
const ents = leerEntidades(leerBsp("../MSC/assets/msr/maps/gatecity.bsp")).filter(e => e.classname === "env_model");
const porModelo = new Map();
for (const e of ents) {
  const k = e.model;
  const g = porModelo.get(k) ?? { n: 0, secs: new Set(), fr: new Set() };
  g.n++; g.secs.add(Number(e.sequence ?? 0)); g.fr.add(e.framerate ?? "1");
  porModelo.set(k, g);
}
console.log("  n   modelo                                   secuencias que pide   la del .mdl");
for (const [m, g] of [...porModelo].sort((a,b)=>b[1].n-a[1].n)) {
  let info = "";
  try {
    const M = leerMdl("../MSC/assets/msr/" + m);
    const S = leerSecuencias(M);
    info = [...g.secs].sort().map(i => `${i}:${S[i]?.nombre ?? "?"}(${S[i]?.nFotogramas ?? "?"}f)`).join(" ");
  } catch (e) { info = "(no leido)"; }
  console.log(`  ${String(g.n).padStart(3)} ${m.padEnd(40)} ${[...g.secs].sort().join(",").padEnd(20)} ${info}`);
}
