// EL CONTROL DEL ORACULO: con la descompresion rota a proposito, tiene que FALLAR.
// Un juez que dice que si con el codigo bueno y tambien con el malo no es un juez.
import { readFileSync } from "node:fs";
import { leerMdl, TAM, cuaternionDeEuler } from "../src/bsp/mdl.js";
import { leerSecuencias, leerHuesos, clavesDeSecuencia, cabeEnLaCaja, matricesEnFotograma, TAM_ANIM } from "../src/bsp/mdlanim.js";

function verticesCrudos(m) {
  const { buf } = m; const out = [];
  for (let bp = 0; bp < m.nBodyparts; bp++) {
    const ob = m.offBodyparts + bp * TAM.bodypart;
    const nModelos = buf.readInt32LE(ob + 64), offModelos = buf.readInt32LE(ob + 72);
    if (nModelos < 1) continue;
    const om = offModelos;
    const nVerts = buf.readInt32LE(om + 80), offInfoVert = buf.readInt32LE(om + 84), offVerts = buf.readInt32LE(om + 88);
    for (let i = 0; i < nVerts; i++) out.push({ hueso: buf[offInfoVert + i],
      v: [buf.readFloatLE(offVerts + i*12), buf.readFloatLE(offVerts + i*12+4), buf.readFloatLE(offVerts + i*12+8)] });
  }
  return out;
}

// Variantes ROTAS de `clavesDeSecuencia`, cada una con un fallo plausible.
function clavesRotas(m, seq, huesos, modo) {
  const { buf } = m;
  const n = Math.max(1, seq.nFotogramas);
  const pistas = huesos.map(() => ({ pos: new Float32Array(n*3), rot: new Float32Array(n*4) }));
  for (let h = 0; h < huesos.length; h++) {
    const hueso = huesos[h];
    // "absoluto": tomar los offsets del canal como relativos al principio de la
    // secuencia en vez de al `mstudioanim_t` del hueso. Es EL error tipico.
    const offAnim = seq.animindex + h * TAM_ANIM;
    for (let f = 0; f < n; f++) {
      const v = [];
      for (let k = 0; k < 6; k++) {
        const off = buf.readUInt16LE(offAnim + k*2);
        let val = hueso.valor[k];
        if (off !== 0) {
          const base = modo === "absoluto" ? seq.animindex : offAnim;
          let p = base + off, j = f;
          try {
            if (buf.readUInt8(p+1) < buf.readUInt8(p)) j = 0;
            let g = 0;
            while (buf.readUInt8(p+1) <= j) { j -= buf.readUInt8(p+1); p += (buf.readUInt8(p)+1)*2; if (++g>1e5) break;
              if (buf.readUInt8(p+1) < buf.readUInt8(p)) j = 0; }
            const valid = buf.readUInt8(p);
            const bruto = valid > j ? buf.readInt16LE(p + (j+1)*2) : buf.readInt16LE(p + valid*2);
            // "sinescala": olvidarse de multiplicar por `scale[k]`.
            val = hueso.valor[k] + bruto * (modo === "sinescala" ? 1 : hueso.escala[k]);
          } catch { val = hueso.valor[k]; }
        }
        v.push(val);
      }
      pistas[h].pos[f*3]=v[0]; pistas[h].pos[f*3+1]=v[1]; pistas[h].pos[f*3+2]=v[2];
      const q = cuaternionDeEuler(v[3], v[4], v[5]);
      pistas[h].rot[f*4]=q[0]; pistas[h].rot[f*4+1]=q[1]; pistas[h].rot[f*4+2]=q[2]; pistas[h].rot[f*4+3]=q[3];
    }
  }
  return pistas;
}

// "reposo": no animar nada, dejar el modelo en su postura de reposo.
function clavesReposo(m, seq, huesos) {
  const n = Math.max(1, seq.nFotogramas);
  return huesos.map((hueso) => {
    const pos = new Float32Array(n*3), rot = new Float32Array(n*4);
    const q = cuaternionDeEuler(hueso.valor[3], hueso.valor[4], hueso.valor[5]);
    for (let f = 0; f < n; f++) {
      pos[f*3]=hueso.valor[0]; pos[f*3+1]=hueso.valor[1]; pos[f*3+2]=hueso.valor[2];
      rot[f*4]=q[0]; rot[f*4+1]=q[1]; rot[f*4+2]=q[2]; rot[f*4+3]=q[3];
    }
    return { pos, rot };
  });
}

const D = "../MSC/assets/msr/models/monsters/";
console.log("  modelo        variante        secuencias que CABEN    veredicto");
for (const n of ["goblin_new", "giant_rat", "skeleton"]) {
  const m = leerMdl(`${D}${n}.mdl`);
  const huesos = leerHuesos(m), secs = leerSecuencias(m), verts = verticesCrudos(m);
  const prueba = (etiqueta, hacer) => {
    let ok = 0, peor = 0;
    for (const s of secs) {
      const r = cabeEnLaCaja(s, hacer(s), huesos, verts);
      if (r.cabe) ok++;
      peor = Math.max(peor, r.peor);
    }
    const bien = etiqueta === "el bueno";
    const pasa = ok === secs.length;
    console.log(`  ${n.padEnd(12)}  ${etiqueta.padEnd(14)} ${String(ok).padStart(3)}/${secs.length}   peor ${peor.toFixed(0).padStart(5)} u   ` +
      (bien ? (pasa ? "OK" : "FALLO: el codigo bueno no pasa") : (pasa ? "FALLO DE JUEZ: no distingue" : "bien, lo caza")));
  };
  prueba("el bueno", (s) => clavesDeSecuencia(m, s, huesos));
  prueba("sin escala", (s) => clavesRotas(m, s, huesos, "sinescala"));
  prueba("offset abs.", (s) => clavesRotas(m, s, huesos, "absoluto"));
  prueba("sin animar", (s) => clavesReposo(m, s, huesos));
}
