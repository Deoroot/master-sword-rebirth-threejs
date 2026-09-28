// Las SECUENCIAS de un `.mdl` y la FICHA de un NPC, con sus controles.
//
// ── El oráculo de la animación, y por qué es de los buenos ─────────────────
//
// Cada `mstudioseqdesc_t` guarda la caja envolvente de SU secuencia, escrita por
// el compilador con los vértices ya animados. O sea que el archivo trae dentro
// el juez: se animan los vértices fotograma a fotograma y se comprueba que
// caben. Un error en la descompresión del RLE no da excepción — da un bicho que
// «camina un poco raro», que es exactamente cómo han sobrevivido los cinco
// fallos más caros de este experimento.
//
// Y con control, porque un juez que sólo sabe decir que sí no es un juez. Con
// tres decodificadores rotos a propósito —sin la escala de compresión, con los
// desplazamientos de canal tomados como absolutos, y sin animar— el oráculo los
// caza a los tres, y las cifras están abajo.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { leerMdl, texturasDe, mallaDe, TAM, cuaternionDeEuler } from "../src/bsp/mdl.js";
import {
  leerSecuencias, leerHuesos, clavesDeSecuencia, cabeEnLaCaja, matricesEnFotograma,
  TAM_SEQ, TAM_ANIM, MOTION,
} from "../src/bsp/mdlanim.js";
import { partirScript, leerFichaNpc, modeloYAnimaciones } from "../src/bsp/script.js";

const MODELOS = "../MSC/assets/msr/models";
const SCRIPTS = "../MSC/MSCScripts/scripts";
const hayModelos = existsSync(`${MODELOS}/monsters/goblin_new.mdl`);
const hayScripts = existsSync(`${SCRIPTS}/monsters/goblin.script`);

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
        v: [
          buf.readFloatLE(offVerts + i * 12),
          buf.readFloatLE(offVerts + i * 12 + 4),
          buf.readFloatLE(offVerts + i * 12 + 8),
        ],
      });
    }
  }
  return out;
}

/** Una variante ROTA de la descompresión, para usarla de control. */
function clavesRotas(m, seq, huesos, modo) {
  const { buf } = m;
  const n = Math.max(1, seq.nFotogramas);
  const pistas = huesos.map(() => ({ pos: new Float32Array(n * 3), rot: new Float32Array(n * 4) }));
  for (let h = 0; h < huesos.length; h++) {
    const hueso = huesos[h];
    const offAnim = seq.animindex + h * TAM_ANIM;
    for (let f = 0; f < n; f++) {
      const v = [];
      for (let k = 0; k < 6; k++) {
        const off = buf.readUInt16LE(offAnim + k * 2);
        let val = hueso.valor[k];
        if (off !== 0) {
          const base = modo === "absoluto" ? seq.animindex : offAnim;
          let p = base + off, j = f;
          try {
            if (buf.readUInt8(p + 1) < buf.readUInt8(p)) j = 0;
            let g = 0;
            while (buf.readUInt8(p + 1) <= j) {
              j -= buf.readUInt8(p + 1);
              p += (buf.readUInt8(p) + 1) * 2;
              if (++g > 1e5) break;
              if (buf.readUInt8(p + 1) < buf.readUInt8(p)) j = 0;
            }
            const valid = buf.readUInt8(p);
            const bruto = valid > j ? buf.readInt16LE(p + (j + 1) * 2) : buf.readInt16LE(p + valid * 2);
            val = hueso.valor[k] + bruto * (modo === "sinescala" ? 1 : hueso.escala[k]);
          } catch { val = hueso.valor[k]; }
        }
        v.push(val);
      }
      pistas[h].pos.set(v.slice(0, 3), f * 3);
      pistas[h].rot.set(cuaternionDeEuler(v[3], v[4], v[5]), f * 4);
    }
  }
  return pistas;
}

describe("las secuencias de un .mdl", { skip: !hayModelos && "no está ../MSC/assets/msr/models/" }, () => {
  const m = leerMdl(`${MODELOS}/monsters/goblin_new.mdl`);
  const huesos = leerHuesos(m);
  const secuencias = leerSecuencias(m);
  const verts = verticesCrudos(m);

  test("la cabecera declara 36 secuencias y todas caben en el fichero", () => {
    assert.equal(secuencias.length, m.nSecuencias);
    assert.equal(m.offSecuencias + m.nSecuencias * TAM_SEQ <= m.bytes, true);
    for (const s of secuencias) {
      assert.ok(s.nFotogramas > 0, `${s.nombre} dice tener ${s.nFotogramas} fotogramas`);
      assert.ok(s.fps > 0, `${s.nombre} dice ir a ${s.fps} fps`);
      assert.ok(s.nombre.length > 0);
    }
  });

  test("EL ORÁCULO: los vértices animados caben en la caja del compilador", () => {
    let peor = 0, caben = 0;
    for (const s of secuencias) {
      const r = cabeEnLaCaja(s, clavesDeSecuencia(m, s, huesos), huesos, verts);
      if (r.cabe) caben++;
      peor = Math.max(peor, r.peor);
    }
    assert.equal(caben, secuencias.length, `sólo ${caben} de ${secuencias.length} caben`);
    assert.ok(peor < 1, `el peor vértice se sale ${peor.toFixed(1)} unidades`);
  });

  test("EL CONTROL: sin la escala de compresión, el oráculo lo caza", () => {
    let caben = 0, peor = 0;
    for (const s of secuencias) {
      const r = cabeEnLaCaja(s, clavesRotas(m, s, huesos, "sinescala"), huesos, verts);
      if (r.cabe) caben++;
      peor = Math.max(peor, r.peor);
    }
    // Medido: 0 de 36, y 6 511 unidades de desbordamiento.
    assert.equal(caben, 0);
    assert.ok(peor > 1000, `sólo se sale ${peor.toFixed(0)} unidades`);
  });

  test("EL CONTROL: con los desplazamientos de canal como absolutos, también", () => {
    let caben = 0, peor = 0;
    for (const s of secuencias) {
      const r = cabeEnLaCaja(s, clavesRotas(m, s, huesos, "absoluto"), huesos, verts);
      if (r.cabe) caben++;
      peor = Math.max(peor, r.peor);
    }
    // Medido: 2 de 36, y 354 unidades. Es el error típico —los seis
    // desplazamientos son relativos al `mstudioanim_t` de SU hueso— y no da
    // error: da huesos que leen la animación de otro hueso.
    assert.ok(caben <= 3, `caben ${caben} de ${secuencias.length}, el juez no lo distingue`);
    assert.ok(peor > 50, `sólo se sale ${peor.toFixed(0)} unidades`);
  });

  test("EL CONTROL: sin animar nada, el oráculo también lo caza", () => {
    let caben = 0;
    for (const s of secuencias) {
      const n = Math.max(1, s.nFotogramas);
      const quietas = huesos.map((h) => {
        const pos = new Float32Array(n * 3), rot = new Float32Array(n * 4);
        const q = cuaternionDeEuler(h.valor[3], h.valor[4], h.valor[5]);
        for (let f = 0; f < n; f++) { pos.set(h.valor.slice(0, 3), f * 3); rot.set(q, f * 4); }
        return { pos, rot };
      });
      if (cabeEnLaCaja(s, quietas, huesos, verts).cabe) caben++;
    }
    // Medido: 28 de 36. Es el control MÁS FLOJO de los tres, y por eso se dice:
    // una postura de reposo cabe en la caja de muchas secuencias, así que el
    // umbral que separa no es «caben todas» sino el desbordamiento del peor.
    assert.ok(caben < secuencias.length, `caben las ${caben}, el juez no distingue quieto de animado`);
  });

  test("el hueso de movimiento pierde sus ejes cuando el motiontype lo dice", () => {
    // `R_StudioCalcRotations` pone a cero `pos[motionbone][eje]` para X, Y y Z
    // (0x01, 0x02, 0x04) — y NO para `STUDIO_LX` (0x40), que es lo que traen las
    // secuencias de andar de este modelo: ahí el avance va en `linearmovement`.
    const andar = secuencias.find((s) => s.nombre === "walk");
    assert.ok(andar, "el goblin no tiene secuencia 'walk'");
    assert.equal(andar.motiontype & (MOTION.X | MOTION.Y | MOTION.Z), 0);
    assert.ok(Math.hypot(...andar.avance) > 1, "la secuencia de andar no declara avance");
  });

  test("el ciclo de andar declara una velocidad plausible para un bípedo", () => {
    const a = secuencias.find((s) => s.nombre === "walk");
    const v = (Math.hypot(...a.avance) / (a.nFotogramas / a.fps)) / 39.37;
    // 72,2 unidades en 2 s = 0,92 m/s. Si la unidad o los fps estuvieran mal
    // esto daría 0,02 o 36, y un bicho que patina o que va disparado es
    // exactamente el síntoma.
    assert.ok(v > 0.4 && v < 2.5, `el goblin andaría a ${v.toFixed(2)} m/s`);
  });

  test("los cuaterniones de una pista no dan la vuelta larga entre claves", () => {
    // Dos claves consecutivas en hemisferios opuestos representan la misma
    // rotación, pero interpoladas dan un giro de 350° en un fotograma. Se
    // alinean al emitir, y esto lo fija.
    for (const s of secuencias.slice(0, 6)) {
      const p = clavesDeSecuencia(m, s, huesos);
      for (let h = 0; h < huesos.length; h++) {
        for (let f = 1; f < s.nFotogramas; f++) {
          let dot = 0;
          for (let k = 0; k < 4; k++) dot += p[h].rot[(f - 1) * 4 + k] * p[h].rot[f * 4 + k];
          assert.ok(dot >= -1e-6, `${s.nombre}, hueso ${h}, fotograma ${f}: producto ${dot.toFixed(3)}`);
        }
      }
    }
  });
});

describe("la ficha de un NPC, leída de su .script", { skip: !hayScripts && "no está ../MSC/MSCScripts/" }, () => {
  test("el classname de la entidad NO dice qué bicho es", () => {
    // Es el hallazgo que ordena todo esto: Gate City pone `msmonster_skeleton`
    // con `defscriptfile monsters/spider`, y eso es una ARAÑA.
    const arana = modeloYAnimaciones(leerFichaNpc(SCRIPTS, "monsters/spider"));
    assert.equal(arana.modelo, "monsters/spider.mdl");
    const goblin = modeloYAnimaciones(leerFichaNpc(SCRIPTS, "monsters/goblin"));
    assert.equal(goblin.modelo, "monsters/goblin_new.mdl");
    assert.equal(goblin.nombre, "Goblin");
    assert.equal(goblin.hp, 50);
    assert.equal(goblin.parado, "idle1");
    assert.equal(goblin.andando, "walk");
  });

  test("se siguen los `callevent`, o la mitad de los bichos salen sin modelo", () => {
    // `dwarf_zombie_sbow` pone su modelo en un evento al que su `npc_spawn`
    // llama, no en el propio `npc_spawn`.
    const f = modeloYAnimaciones(leerFichaNpc(SCRIPTS, "monsters/dwarf_zombie_hbow"));
    assert.ok(f, "sin ficha");
    assert.equal(f.modelo, "dwarf/male1.mdl");
  });

  test("se entienden los tres nombres de evento de nacimiento", () => {
    // `gatecity/miner` usa `{ spawn`, no `npc_spawn` ni `game_spawn`.
    const f = modeloYAnimaciones(leerFichaNpc(SCRIPTS, "gatecity/miner"));
    assert.ok(f, "sin ficha");
    assert.equal(f.modelo, "dwarf/male1.mdl");
  });

  test("una variable se resuelve, aunque apunte a otra variable", () => {
    const f = leerFichaNpc(SCRIPTS, "monsters/spider");
    // `setmodel SPIDER_MODEL` y `setvar SPIDER_MODEL monsters/spider.mdl`.
    assert.ok(f.vars.has("SPIDER_MODEL"));
    assert.equal(f.ficha.setmodel, "monsters/spider.mdl");
  });

  test("la familia de piel sale como RANGO, no tirando el dado aquí", () => {
    // `NPCs/default_dwarf` hace `setprop ent_me skin $rand(1,6)`. Tirarlo en el
    // lector haría que dos ejecuciones dieran pueblos distintos y que una
    // captura no se pudiera volver a sacar.
    const f = modeloYAnimaciones(leerFichaNpc(SCRIPTS, "NPCs/default_dwarf"));
    assert.deepEqual(f.piel, { min: 1, max: 6 });
  });

  test("los `setmodelbody` se quedan con el ÚLTIMO, que es lo que ejecuta el motor", () => {
    // `gatecity/miner` pone el `bodypart` 1 a 1 y luego a 8. Con el primero el
    // enano sale desarmado.
    const f = leerFichaNpc(SCRIPTS, "gatecity/miner");
    const bp1 = f.cuerpos.find(([i]) => i === 1);
    assert.deepEqual(bp1, [1, 8]);
  });

  test("un script que no existe devuelve null y no un objeto vacío", () => {
    assert.equal(leerFichaNpc(SCRIPTS, "monsters/no_existe_este_bicho"), null);
  });

  test("el troceador respeta las llaves anidadas de un `if`", () => {
    const { bloques } = partirScript(`
      { npc_spawn
        if ( X == 1 )
        {
          setmodel a/b.mdl
        }
        name Cosa
      }
      { otro
        hp 1
      }
    `);
    assert.equal(bloques.length, 2);
    assert.ok(bloques[0].some((l) => l.includes("setmodel a/b.mdl")));
    assert.ok(bloques[0].some((l) => l.includes("name Cosa")));
  });
});

// ── La UV de un `.mdl` es un índice de PÍXEL ───────────────────────────────
//
// Un `.mdl` no guarda coordenadas de 0 a 1: guarda la columna y la fila del
// téxel, y el motor las divide al dibujar, sin voltear nada:
//
//     gl_studio.c  R_StudioDrawPoints()
//       s = 1.0f / ptexture->width;  t = 1.0f / ptexture->height;
//       ... pglTexCoord2f( ptricmds[2] * s, ptricmds[3] * t );
//
// Así que `t = 0` es la fila 0 del archivo, la de ARRIBA. Three.js voltea las
// imágenes al subirlas si no se le dice lo contrario, y con eso la fila 0 pasa
// a ser `v = 1`: el modelo entero sale del revés en vertical.
//
// El fallo no da excepción y en un barril no se ve. Se vio en una cara, con la
// boca arriba y los ojos abajo, jugando.
//
// El oráculo de abajo es GEOMÉTRICO y no mira ni un píxel: en los vértices de
// la cara que miran al frente, la altura y `uv.v` tienen que ir al revés la una
// de la otra, porque la frente se pinta en la fila de arriba del dibujo y el
// mentón en la de abajo. Con la convención buena la frente cae en el tercio de
// arriba de la imagen; con la de fábrica de Three.js, en el de abajo — y eso es
// el control, que aquí es la MISMA cuenta con el volteo puesto.
describe("la UV de un `.mdl` (sólo con los modelos de MSR al lado)", { skip: !hayModelos }, () => {
  /** Los vértices de un grupo que miran al frente (+X en el espacio del `.mdl`). */
  function alFrente(g) {
    const out = [];
    for (let i = 0; i < g.nor.length / 3; i++) {
      if (g.nor[i * 3] <= 0.5) continue;
      out.push({ z: g.pos[i * 3 + 2], v: g.uv[i * 2 + 1] });
    }
    return out;
  }

  function correlacion(pts, clave) {
    const n = pts.length;
    const mz = pts.reduce((s, p) => s + p.z, 0) / n;
    const mv = pts.reduce((s, p) => s + p[clave], 0) / n;
    let nu = 0, dz = 0, dv = 0;
    for (const p of pts) {
      nu += (p.z - mz) * (p[clave] - mv);
      dz += (p.z - mz) ** 2;
      dv += (p[clave] - mv) ** 2;
    }
    return nu / Math.sqrt(dz * dv);
  }

  /** La cara de un modelo, con sus vértices de frente ordenados de arriba abajo. */
  function cara(ruta, cuerpo) {
    const m = leerMdl(`${MODELOS}/${ruta}.mdl`);
    const texturas = texturasDe(m);
    const malla = mallaDe(m, texturas, { cuerpo });
    const g = malla.grupos.find((g) => /face/i.test(g.textura.nombre));
    assert.ok(g, `${ruta}: no hay grupo de cara`);
    const pts = alFrente(g).sort((a, b) => b.z - a.z);
    assert.ok(pts.length >= 40, `${ruta}: sólo ${pts.length} vértices al frente`);
    return { ruta, tex: g.textura, pts };
  }

  const CARAS = [["npc/human1", 33], ["npc/human2", 2]];

  test("la `s` y la `t` que se emiten son las del archivo partidas por el tamaño", () => {
    const m = leerMdl(`${MODELOS}/npc/human1.mdl`);
    const texturas = texturasDe(m);
    const malla = mallaDe(m, texturas, { cuerpo: 33 });
    // Toda UV emitida tiene que caer en una rejilla de 1/ancho × 1/alto, porque
    // viene de dividir dos enteros. Si alguien metiera un `1 − v` por el camino
    // seguiría cayendo en la rejilla, así que esto no lo caza — lo caza el
    // oráculo de la frente. Esto caza el otro error: normalizar dos veces.
    let fuera = 0, total = 0;
    for (const g of malla.grupos) {
      for (let i = 0; i < g.uv.length / 2; i++) {
        const s = g.uv[i * 2] * g.textura.ancho;
        const t = g.uv[i * 2 + 1] * g.textura.alto;
        total++;
        if (Math.abs(s - Math.round(s)) > 1e-3 || Math.abs(t - Math.round(t)) > 1e-3) fuera++;
      }
    }
    assert.equal(fuera, 0, `${fuera} de ${total} UV no caen en un píxel entero`);
    assert.ok(total > 1000);
  });

  for (const [ruta, cuerpo] of CARAS) {
    test(`en ${ruta} la frente va a la fila de arriba del dibujo`, () => {
      const { tex, pts } = cara(ruta, cuerpo);
      const n = Math.max(8, Math.floor(pts.length / 5));
      const frente = pts.slice(0, n);
      const menton = pts.slice(-n);
      const media = (l) => l.reduce((s, p) => s + p.v, 0) / l.length;

      // Geometría: la altura y la `v` van al revés la una de la otra.
      assert.ok(
        correlacion(pts, "v") < -0.9,
        `${ruta}: corr(altura, uv.v) = ${correlacion(pts, "v").toFixed(3)}, se esperaba ≈ −1`,
      );

      // La convención buena: `fila = v · alto`. La frente arriba, el mentón abajo.
      const filaBuena = (v) => v * tex.alto;
      assert.ok(filaBuena(media(frente)) < tex.alto / 3,
        `${ruta}: la frente cae en la fila ${filaBuena(media(frente)).toFixed(0)} de ${tex.alto}`);
      assert.ok(filaBuena(media(menton)) > (tex.alto * 2) / 3,
        `${ruta}: el mentón cae en la fila ${filaBuena(media(menton)).toFixed(0)} de ${tex.alto}`);

      // EL CONTROL: con el volteo de fábrica de Three.js, la misma cuenta pone
      // la frente abajo del todo. Es el fallo que se vio jugando.
      const filaVolteada = (v) => (1 - v) * tex.alto;
      assert.ok(filaVolteada(media(frente)) > (tex.alto * 2) / 3,
        `${ruta}: el control no distingue — con flipY la frente caería en ${filaVolteada(media(frente)).toFixed(0)}`);
    });
  }
});
