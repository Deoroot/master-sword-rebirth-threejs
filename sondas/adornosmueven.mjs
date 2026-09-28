import { readFileSync } from "node:fs";
import { leerMdl, texturasDe, mallaDe, porMatriz, TAM } from "../src/bsp/mdl.js";
import { leerSecuencias, leerHuesos, clavesDeSecuencia, matricesEnFotograma } from "../src/bsp/mdlanim.js";

/** Los vértices en el espacio de su hueso, que es como los guarda el archivo. */
function verticesCrudos(m) {
  const { buf } = m;
  const out = [];
  for (let bp = 0; bp < m.nBodyparts; bp++) {
    const ob = m.offBodyparts + bp * TAM.bodypart;
    const nModelos = buf.readInt32LE(ob + 64);
    const offModelos = buf.readInt32LE(ob + 72);
    if (nModelos < 1) continue;
    const nVerts = buf.readInt32LE(offModelos + 80);
    const offInfoVert = buf.readInt32LE(offModelos + 84);
    const offVerts = buf.readInt32LE(offModelos + 88);
    for (let i = 0; i < nVerts; i++) {
      out.push({
        hueso: buf[offInfoVert + i],
        p: [buf.readFloatLE(offVerts + i * 12), buf.readFloatLE(offVerts + i * 12 + 4), buf.readFloatLE(offVerts + i * 12 + 8)],
      });
    }
  }
  return out;
}

const man = JSON.parse(readFileSync("build/gatecity/malla.json", "utf8"));
const veces = new Map();
for (const c of man.adornos.colocaciones) veces.set(c.modelo, (veces.get(c.modelo) ?? 0) + 1);

console.log("modelo                                 veces  huesos  vert  secuencia            recorrido (u)  en cm");
let mueven = 0, quietos = 0;
for (const [modelo, n] of [...veces].sort((a, b) => b[1] - a[1])) {
  const m = leerMdl(`../MSC/assets/msr/${modelo}`);
  const huesos = leerHuesos(m);
  const secuencias = leerSecuencias(m);
  const verts = verticesCrudos(m);
  let peorGlobal = 0, cual = null;
  for (const s of secuencias) {
    if (s.nFotogramas < 2) continue;
    const pistas = clavesDeSecuencia(m, s, huesos);
    const base = matricesEnFotograma(pistas, huesos, 0).map((M) => M);
    const p0 = verts.map((v) => porMatriz(base[v.hueso] ?? base[0], v.p));
    let peor = 0;
    for (let f = 1; f < s.nFotogramas; f++) {
      const M = matricesEnFotograma(pistas, huesos, f);
      for (let i = 0; i < verts.length; i++) {
        const q = porMatriz(M[verts[i].hueso] ?? M[0], verts[i].p);
        peor = Math.max(peor, Math.hypot(q[0] - p0[i][0], q[1] - p0[i][1], q[2] - p0[i][2]));
      }
    }
    if (peor > peorGlobal) { peorGlobal = peor; cual = s; }
  }
  if (peorGlobal > 0.5) mueven += n; else quietos += n;
  console.log(`${modelo.replace("models/", "").padEnd(38)}${String(n).padStart(4)}   ${String(huesos.length).padStart(5)}  ${String(verts.length).padStart(5)}  ` +
    `${(cual ? `${cual.nombre} (${cual.nFotogramas}f@${cual.fps})` : "—").padEnd(22)}${peorGlobal.toFixed(2).padStart(8)}  ${(peorGlobal / 39.37 * 100).toFixed(1).padStart(6)}`);
}
console.log(`\ncolocaciones que SE MUEVEN (>0,5 u): ${mueven}   quietas: ${quietos}`);
