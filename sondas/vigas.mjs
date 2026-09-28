// Que luxels tienen las caras que se ven NEGRAS en la calle.
import { leerBsp, leerModelos, leerTexinfo, leerTexturas, leerEntidades,
         leerCaras, origen, tieneLuz, parcheDeLuz, UNIDADES_POR_METRO as U } from "../src/bsp/lector.js";
const bsp = leerBsp("../MSC/assets/msr/maps/gatecity.bsp");
const modelos = leerModelos(bsp), texinfos = leerTexinfo(bsp), texturas = leerTexturas(bsp);
const ents = leerEntidades(bsp);
const porModelo = new Map();
for (const e of ents) if (/^\*\d+$/.test(e.model ?? "")) porModelo.set(Number(e.model.slice(1)), e);
const lum = bsp.lumps.luz.datos;
let caras = [];
for (let i = 0; i < modelos.length; i++) {
  const e = porModelo.get(i);
  for (const c of leerCaras(bsp, modelos[i], texinfos)) caras.push({...c, modelo: i, clase: e?.classname, ent: e});
}
// El ojo de la vista de la calle, en unidades del .bsp
const ojo = [-217, -577, -508];
const cen = (c) => c.puntos.reduce((a,p)=>[a[0]+p[0]/c.puntos.length,a[1]+p[1]/c.puntos.length,a[2]+p[2]/c.puntos.length],[0,0,0]);
const dist = (c) => { const m = cen(c); return Math.hypot(m[0]-ojo[0], m[1]-ojo[1], m[2]-ojo[2]); };

// Media de los luxels de una cara, ya sumados los estilos (crudo, sin rampa).
function luxels(c) {
  if (!tieneLuz(c)) return null;
  const p = parcheDeLuz(c.puntos, c.texinfo);
  const n = p.ancho * p.alto;
  let s = 0, max = 0;
  for (let k = 0; k < n; k++) {
    let r=0,g=0,b=0;
    for (let e = 0; e < c.nEstilos; e++) {
      const o = c.lightofs + (e*n+k)*3;
      if (o+2 >= lum.length) break;
      r+=lum[o]; g+=lum[o+1]; b+=lum[o+2];
    }
    const l = 0.2126*Math.min(255,r)+0.7152*Math.min(255,g)+0.0722*Math.min(255,b);
    s += l; if (l>max) max=l;
  }
  return { media: s/n, max, luxels: n, ancho: p.ancho, alto: p.alto };
}

const cerca = caras.filter(c => dist(c) < 400).sort((a,b)=>dist(a)-dist(b));
console.log(`caras a menos de 400 unidades (10 m) del ojo de la calle: ${cerca.length}\n`);
const porTex = new Map();
for (const c of cerca) {
  const t = texturas[c.miptex]?.nombre ?? "?";
  const L = luxels(c);
  const g = porTex.get(t) ?? { n:0, sinLuz:0, suma:0, con:0, max:0, clases:new Set() };
  g.n++;
  if (!L) g.sinLuz++; else { g.suma += L.media; g.con++; g.max = Math.max(g.max, L.max); }
  g.clases.add(c.clase ?? "mundo");
  porTex.set(t, g);
}
for (const [t,g] of [...porTex].sort((a,b)=>b[1].n-a[1].n))
  console.log(`  ${t.padEnd(18)} ${String(g.n).padStart(4)} caras, sin luz ${String(g.sinLuz).padStart(3)}, ` +
    `luxel medio ${g.con? (g.suma/g.con).toFixed(1).padStart(6):'   --- '}, maximo ${g.max.toFixed(0).padStart(4)}  [${[...g.clases].join(",")}]`);
