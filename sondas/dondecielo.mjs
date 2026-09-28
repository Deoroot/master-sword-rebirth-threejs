import { leerBsp, leerModelos, leerTexinfo, leerTexturas, leerCaras, UNIDADES_POR_METRO as U } from "../src/bsp/lector.js";
import { contenidoEn } from "../src/bsp/arbol.js";
const bsp = leerBsp("../MSC/assets/msr/maps/gatecity.bsp");
const modelos = leerModelos(bsp), tis = leerTexinfo(bsp), tex = leerTexturas(bsp);
const caras = leerCaras(bsp, modelos[0], tis).filter(c => /^sky/i.test(tex[c.miptex]?.nombre ?? ""));
caras.sort((a,b)=>b.area-a.area);
console.log(`${caras.length} caras de cielo, la mayor ${(caras[0].area/(U*U)).toFixed(0)} m2`);
for (const c of caras.slice(0,6)) {
  const m = c.puntos.reduce((a,p)=>[a[0]+p[0]/c.puntos.length,a[1]+p[1]/c.puntos.length,a[2]+p[2]/c.puntos.length],[0,0,0]);
  // un punto 200 unidades por debajo, y se pregunta al arbol si ahi se puede estar
  for (const d of [100,200,400,800,1600]) {
    const p = [m[0], m[1], m[2]-d];
    const cont = contenidoEn(bsp, p);
    if (cont && (cont.nombre === "vacio" || cont.valor === -1 || cont === -1)) {
      console.log(`  cielo de ${(c.area/(U*U)).toFixed(0)} m2 en ${m.map(v=>v.toFixed(0)).join(" ")}, hueco a ${d} debajo -> HUD ${[Math.round(p[0]), Math.round(p[2]), Math.round(-p[1])].join(" ")}`);
      break;
    }
  }
}
