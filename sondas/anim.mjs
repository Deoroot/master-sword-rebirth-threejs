// El oraculo de la animacion: los vertices animados contra la caja que el
// compilador escribio en cada secuencia.
import { leerMdl, TAM } from "../src/bsp/mdl.js";
import { leerSecuencias, leerHuesos, clavesDeSecuencia, cabeEnLaCaja } from "../src/bsp/mdlanim.js";

/** Los vertices de un modelo EN EL ESPACIO DE SU HUESO, con su hueso. */
function verticesCrudos(m, { cuerpo = 0 } = {}) {
  const { buf } = m;
  const out = [];
  for (let bp = 0; bp < m.nBodyparts; bp++) {
    const ob = m.offBodyparts + bp * TAM.bodypart;
    const nModelos = buf.readInt32LE(ob + 64);
    const base = buf.readInt32LE(ob + 68);
    const offModelos = buf.readInt32LE(ob + 72);
    if (nModelos < 1) continue;
    const iSub = nModelos > 1 && base > 0 ? Math.floor(cuerpo / base) % nModelos : 0;
    const om = offModelos + iSub * TAM.modelo;
    const nVerts = buf.readInt32LE(om + 80);
    const offInfoVert = buf.readInt32LE(om + 84);
    const offVerts = buf.readInt32LE(om + 88);
    for (let i = 0; i < nVerts; i++) {
      out.push({
        hueso: buf[offInfoVert + i],
        v: [buf.readFloatLE(offVerts + i * 12), buf.readFloatLE(offVerts + i * 12 + 4), buf.readFloatLE(offVerts + i * 12 + 8)],
      });
    }
  }
  return out;
}

const D = "../MSC/assets/msr/models/monsters/";
for (const n of (process.argv[2] ? [process.argv[2]] : ["goblin_new", "giant_rat", "spider", "skeleton"])) {
  const m = leerMdl(`${D}${n}.mdl`);
  const huesos = leerHuesos(m);
  const secs = leerSecuencias(m);
  const verts = verticesCrudos(m);
  let ok = 0, malas = [];
  let fotogramas = 0;
  for (const s of secs) {
    fotogramas += s.nFotogramas;
    const pistas = clavesDeSecuencia(m, s, huesos);
    const r = cabeEnLaCaja(s, pistas, huesos, verts);
    if (r.cabe) ok++;
    else malas.push(`${s.nombre} (${s.nFotogramas} f): ${r.fuera} de ${r.total} vertices, el peor a ${r.peor.toFixed(1)} unidades fuera`);
  }
  console.log(`${n.padEnd(12)} ${String(secs.length).padStart(3)} secuencias, ${String(fotogramas).padStart(5)} fotogramas, ` +
    `${huesos.length} huesos, ${verts.length} vertices -> ${ok}/${secs.length} caben en su caja`);
  for (const x of malas.slice(0, 5)) console.log(`    ${x}`);
  if (malas.length > 5) console.log(`    ... y ${malas.length - 5} mas`);
}
