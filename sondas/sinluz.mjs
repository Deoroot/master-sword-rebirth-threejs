import { leerBsp, leerModelos, leerTexinfo, leerTexturas, leerEntidades, leerCaras, origen, tieneLuz, UNIDADES_POR_METRO as U } from "../src/bsp/lector.js";
const bsp = leerBsp("../MSC/assets/msr/maps/gatecity.bsp");
const modelos = leerModelos(bsp), texinfos = leerTexinfo(bsp), texturas = leerTexturas(bsp);
const ents = leerEntidades(bsp);
const porModelo = new Map();
for (const e of ents) if (/^\*\d+$/.test(e.model ?? "")) porModelo.set(Number(e.model.slice(1)), e);
const m2 = (a) => a / (U*U);
let caras = [];
for (let i = 0; i < modelos.length; i++) {
  const e = porModelo.get(i);
  for (const c of leerCaras(bsp, modelos[i], texinfos)) caras.push({...c, modelo: i, clase: e?.classname, ent: e});
}
const sin = caras.filter(c => !tieneLuz(c));
console.log(`caras totales ${caras.length}, sin luz ${sin.length}`);
// por causa
const menos1 = sin.filter(c => c.lightofs < 0);
const est255 = sin.filter(c => c.lightofs >= 0);
console.log(`  lightofs=-1 ${menos1.length} (${m2(menos1.reduce((a,c)=>a+c.area,0)).toFixed(0)} m2)`);
console.log(`  styles255   ${est255.length} (${m2(est255.reduce((a,c)=>a+c.area,0)).toFixed(0)} m2)`);
// por textura
const porTex = new Map();
for (const c of sin) {
  const t = texturas[c.miptex]?.nombre ?? "?";
  const g = porTex.get(t) ?? {n:0, area:0, m1:0, e255:0, mundo:0, ents:new Set()};
  g.n++; g.area += c.area; if (c.lightofs<0) g.m1++; else g.e255++;
  if (c.modelo===0) g.mundo++; else g.ents.add(c.clase);
  porTex.set(t,g);
}
console.log("\n  por textura (las 20 mayores):");
for (const [t,g] of [...porTex].sort((a,b)=>b[1].area-a[1].area).slice(0,20))
  console.log(`   ${t.padEnd(18)} ${String(g.n).padStart(5)} caras ${m2(g.area).toFixed(0).padStart(5)} m2  (-1:${g.m1} 255:${g.e255})  mundo ${g.mundo}  ents ${[...g.ents].join(",")}`);
// texinfo flags
const flags = new Map();
for (const c of sin) { const f = c.texinfo?.flags ?? -1; flags.set(f,(flags.get(f)??0)+1); }
console.log("\n  flags de texinfo de las caras sin luz:", [...flags].map(([f,n])=>`${f}:${n}`).join(" "));
const flagsCon = new Map();
for (const c of caras.filter(tieneLuz)) { const f = c.texinfo?.flags ?? -1; flagsCon.set(f,(flagsCon.get(f)??0)+1); }
console.log("  flags de texinfo de las caras CON luz:", [...flagsCon].map(([f,n])=>`${f}:${n}`).join(" "));
