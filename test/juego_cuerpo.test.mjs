// EL CUERPO DEL PERSONAJE: el modelo que sale en la pantalla, y las tres cosas
// que el plan tenía mal.
//
// En `MOCKUPS_13.md` quedó escrito que la vista usaría `human/male1/male1.mdl` y
// `human/female1/female1.mdl`, uno por género. Las dos mitades eran falsas, y
// estas comprobaciones existen para que no vuelvan a colarse:
//
//   el modelo es `human/reference.mdl` — `MODEL_HUMAN_REF`, lo que carga
//   `CRenderChar::Init`, y el único de los tres que trae las SEIS animaciones
//   que la pantalla pide por nombre.
//
//   el género es un SUBMODELO y no un archivo — `SetBody(0..3, 1)` o `2`, sobre
//   los tres submodelos de cada parte. `female1.mdl` está en el disco y el juego
//   no lo abre nunca: `MODEL_HUMAN_FEMALE1` apunta a `male1.mdl`.
//
//   y el juez de este archivo no es su caja, porque sus cajas no describen su
//   propia malla. Manda `rigidezDeModelo`.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import { leerMdl, TAM, texturasDe, mallaDe, porMatriz } from "../src/bsp/mdl.js";
import {
  leerSecuencias, leerHuesos, clavesDeSecuencia, cabeEnLaCaja,
  rigidezDeModelo, RIGIDO, matricesEnFotograma,
} from "../src/bsp/mdlanim.js";

const MODELOS = "../MSC/assets/msr/models";
const REF = `${MODELOS}/human/reference.mdl`;
const hay = existsSync(REF);

/**
 * Las seis de `global.script`, con la errata de `figet` incluida — que es la
 * clave por la que hay que buscar si esto se rompe algún día.
 *
 *     local reg.hud.char.active_weapon 'idle'      con arma en la mano
 *     local reg.hud.char.active_noweap 'attention' sin nada, y es la de salida
 *     local reg.hud.char.figet         'stretch'   cada 6 a 60 segundos
 *     local reg.hud.char.highlight     'jump'      al pasarle el ratón
 *     local reg.hud.char.upload        'run'       subiendo al servidor
 *     local reg.hud.char.inactive      'sitdown'   la ranura vacía
 */
const SEIS = ["idle", "attention", "stretch", "jump", "run", "sitdown"];

/** Las partes y sus bases, leídas del archivo. */
function partes(m) {
  const out = [];
  for (let bp = 0; bp < m.nBodyparts; bp++) {
    const ob = m.offBodyparts + bp * TAM.bodypart;
    const nModelos = m.buf.readInt32LE(ob + 64);
    const base = m.buf.readInt32LE(ob + 68);
    const off = m.buf.readInt32LE(ob + 72);
    const subs = [];
    for (let i = 0; i < nModelos; i++) {
      subs.push(m.buf.toString("latin1", off + i * TAM.modelo, off + i * TAM.modelo + 64).split("\0")[0]);
    }
    out.push({ nombre: m.buf.toString("latin1", ob, ob + 64).split("\0")[0], base, subs });
  }
  return out;
}

const cuerpoDe = (m, digito) => partes(m).reduce((a, p) => a + digito * p.base, 0);

describe("el modelo de la pantalla de personajes", { skip: hay ? false : "faltan los .mdl de Master Sword" }, () => {
  const ref = leerMdl(REF);
  const secs = leerSecuencias(ref);
  const nombres = secs.map((s) => s.nombre.toLowerCase());

  test("reference.mdl trae las seis animaciones que la pantalla pide", () => {
    for (const n of SEIS) {
      assert.ok(nombres.includes(n), `falta '${n}' en reference.mdl`);
    }
  });

  test("y male1.mdl NO, que es por lo que el modelo no es ése", () => {
    // El control del control. Sin esto, la comprobación de arriba no sabría
    // decir no — y decía sí al modelo equivocado, que es el que yo había
    // apuntado en el plan.
    const mal = leerMdl(`${MODELOS}/human/male1/male1.mdl`);
    const suyas = leerSecuencias(mal).map((s) => s.nombre.toLowerCase());
    const faltan = SEIS.filter((n) => !suyas.includes(n));
    assert.deepEqual(faltan.sort(), ["attention", "stretch"]);
    // Y `attention` es la que se ve al ABRIR la pantalla, o sea que el fallo
    // habría sido lo primero que se viera: tres personajes en `nod_yes`, que es
    // la secuencia 0 y la que el motor pone cuando le piden una que no hay.
    assert.equal(secs[0].nombre.toLowerCase(), "nod_yes");
  });

  test("las cuatro partes traen hombre, mujer y hueco, con bases en potencias de 3", () => {
    const p = partes(ref);
    assert.deepEqual(p.map((x) => x.nombre), ["legs", "head", "torso", "arms"]);
    assert.deepEqual(p.map((x) => x.base), [1, 3, 9, 27]);
    for (const x of p) {
      assert.equal(x.subs.length, 3, `${x.nombre} debería tener tres submodelos`);
      assert.equal(x.subs[0], "blank");
      assert.match(x.subs[2], /female$/);
    }
  });

  test("el `body` de cada género se CALCULA de las bases, y sale 40 y 80", () => {
    // Es el `gv` del cliente: `(gender == GENDER_MALE) ? 1 : 2` en los cuatro
    // grupos. Con bases 1, 3, 9 y 27 eso es un número en base 3.
    assert.equal(cuerpoDe(ref, 1), 40);
    assert.equal(cuerpoDe(ref, 2), 80);
  });

  describe("las tres mallas", () => {
    const tex = texturasDe(ref);
    const vacio = mallaDe(ref, tex, { cuerpo: 0 });
    const hombre = mallaDe(ref, tex, { cuerpo: cuerpoDe(ref, 1) });
    const mujer = mallaDe(ref, tex, { cuerpo: cuerpoDe(ref, 2) });

    test("body 0 son los cuatro `blank`: ni un triángulo", () => {
      // El oráculo de la base 3. Con las bases leídas como paso en vez de como
      // potencia, el cero deja de caer en `blank` y esto lo caza.
      assert.equal(vacio.triangulos, 0);
    });

    test("y hombre y mujer son mallas DISTINTAS", () => {
      // Si el `body` no se decodifica, los dos salen iguales y no hay error:
      // hay un juego donde elegir mujer no hace nada.
      assert.notEqual(hombre.triangulos, mujer.triangulos);
      assert.equal(hombre.triangulos, 972);
      assert.equal(mujer.triangulos, 1216);
    });

    test("las dos se leen enteras y bien bobinadas", () => {
      for (const [n, ma] of [["hombre", hombre], ["mujer", mujer]]) {
        assert.ok(ma.cuadra, `${n}: ${ma.leidos} de ${ma.esperados} triángulos`);
        assert.ok(ma.bobinadoBien, `${n}: gira contra su normal`);
      }
    });
  });

  describe("el juez de este archivo NO es su caja", () => {
    const huesos = leerHuesos(ref);

    test("sus cajas de secuencia no describen su propia malla", () => {
      // Esto no es un fallo que se arregle: es un hecho del archivo, y está
      // aquí para que nadie «arregle» la descompresión persiguiéndolo. Se
      // comprobaron y murieron tres hipótesis: que las cajas estuvieran
      // copiadas de male1 (0 de 22 secuencias comunes coinciden), que
      // describieran otro `body` (ninguno de diez da 65/65) y que la malla
      // fuera otra (en espacio de hueso miden lo mismo ±2 u).
      const verts = [];
      for (let bp = 0; bp < ref.nBodyparts; bp++) {
        const ob = ref.offBodyparts + bp * TAM.bodypart;
        const nModelos = ref.buf.readInt32LE(ob + 64);
        const base = ref.buf.readInt32LE(ob + 68);
        const offModelos = ref.buf.readInt32LE(ob + 72);
        if (nModelos < 1) continue;
        const iSub = nModelos > 1 && base > 0 ? Math.floor(40 / base) % nModelos : 0;
        const om = offModelos + iSub * TAM.modelo;
        const nV = ref.buf.readInt32LE(om + 80);
        const oI = ref.buf.readInt32LE(om + 84);
        const oV = ref.buf.readInt32LE(om + 88);
        for (let i = 0; i < nV; i++) {
          verts.push({ hueso: ref.buf[oI + i], v: [
            ref.buf.readFloatLE(oV + i * 12),
            ref.buf.readFloatLE(oV + i * 12 + 4),
            ref.buf.readFloatLE(oV + i * 12 + 8)] });
        }
      }
      let caben = 0, peor = 0;
      for (const s of secs) {
        const r = cabeEnLaCaja(s, clavesDeSecuencia(ref, s, huesos), huesos, verts);
        if (r.cabe) caben++;
        peor = Math.max(peor, r.peor);
      }
      assert.ok(caben < secs.length, "si ahora cabieran todas, este archivo ya no necesita el otro juez");
      assert.ok(peor > 16, `el desbordamiento debería pasar del tope de 16: ${peor.toFixed(1)}`);
    });

    test("la rigidez sí: los huesos no se estiran", () => {
      const r = rigidezDeModelo(ref, huesos, secs);
      assert.ok(r.peor < RIGIDO, `${r.peor.toFixed(3)} u en ${r.donde}`);
      // Y por debajo de lo que da `male1.mdl`, que es el que SÍ pasa el oráculo
      // de la caja. O sea que la lectura de reference no es la sospechosa.
      const mal = leerMdl(`${MODELOS}/human/male1/male1.mdl`);
      const rm = rigidezDeModelo(mal, leerHuesos(mal));
      assert.ok(r.peor < rm.peor, `reference ${r.peor.toFixed(3)} vs male1 ${rm.peor.toFixed(3)}`);
    });

    test("y sabe decir NO: sin la escala de compresión revienta", () => {
      const sinEscala = huesos.map((h) => ({ ...h, escala: [1, 1, 1, 1, 1, 1] }));
      const roto = rigidezDeModelo(ref, sinEscala, secs);
      assert.ok(roto.peor > RIGIDO * 10, `debería reventar y da ${roto.peor.toFixed(1)}`);
    });
  });
});

describe("cuál de las seis se mueve", { skip: hay ? false : "faltan los .mdl de Master Sword" }, () => {
  // Esto no es curiosidad: decide la lógica del retrato.
  //
  // Las dos posturas de reposo están QUIETAS a propósito, y sólo una de ellas
  // hace bucle. De ahí salen las dos correcciones de `_tic` en
  // `src/render/cuerpo.js`: que el `stretch` se dispare también desde una
  // postura que no hace bucle —si no, un personaje sin arma no se movía nunca—
  // y que una animación de reposo no se relance al acabar, porque `sitdown` es
  // la ACCIÓN de sentarse y relanzarla deja al personaje levantándose y
  // sentándose en bucle.
  const ref = leerMdl(REF);
  const huesos = leerHuesos(ref);
  const secs = leerSecuencias(ref);

  /** El recorrido máximo de un vértice respecto del primer fotograma. */
  function recorrido(nombre) {
    const s = secs.find((x) => x.nombre.toLowerCase() === nombre);
    const verts = [];
    for (let bp = 0; bp < ref.nBodyparts; bp++) {
      const ob = ref.offBodyparts + bp * TAM.bodypart;
      const nM = ref.buf.readInt32LE(ob + 64);
      const base = ref.buf.readInt32LE(ob + 68);
      const oM = ref.buf.readInt32LE(ob + 72);
      if (nM < 1) continue;
      const iSub = nM > 1 && base > 0 ? Math.floor(40 / base) % nM : 0;
      const om = oM + iSub * TAM.modelo;
      const nV = ref.buf.readInt32LE(om + 80);
      const oI = ref.buf.readInt32LE(om + 84);
      const oV = ref.buf.readInt32LE(om + 88);
      for (let i = 0; i < nV; i++) {
        verts.push({ hueso: ref.buf[oI + i], v: [
          ref.buf.readFloatLE(oV + i * 12),
          ref.buf.readFloatLE(oV + i * 12 + 4),
          ref.buf.readFloatLE(oV + i * 12 + 8)] });
      }
    }
    const pistas = clavesDeSecuencia(ref, s, huesos);
    const n = Math.max(1, s.nFotogramas);
    const M0 = matricesEnFotograma(pistas, huesos, 0);
    const p0 = verts.map((v) => porMatriz(M0[v.hueso] ?? M0[0], v.v));
    let peor = 0;
    for (let f = 1; f < n; f++) {
      const M = matricesEnFotograma(pistas, huesos, f);
      for (let i = 0; i < verts.length; i++) {
        const q = porMatriz(M[verts[i].hueso] ?? M[0], verts[i].v);
        peor = Math.max(peor, Math.hypot(q[0] - p0[i][0], q[1] - p0[i][1], q[2] - p0[i][2]));
      }
    }
    return { peor, bucle: s.bucle, fotogramas: n, fps: s.fps };
  }

  test("las dos posturas de reposo están quietas", () => {
    // `idle` es una pose fija estirada a 156 fotogramas: cero recorrido.
    const i = recorrido("idle");
    assert.ok(i.peor < 0.01, `idle recorre ${i.peor.toFixed(2)} u`);
    // Y `attention` es respirar: menos de un centímetro y medio.
    const a = recorrido("attention");
    assert.ok(a.peor < 2, `attention recorre ${a.peor.toFixed(2)} u`);
  });

  test("y las otras cuatro no, por dos órdenes de magnitud", () => {
    for (const n of ["stretch", "jump", "run", "sitdown"]) {
      const r = recorrido(n);
      assert.ok(r.peor > 40, `${n} sólo recorre ${r.peor.toFixed(2)} u`);
    }
  });

  test("sólo UNA de las dos de reposo hace bucle, y por eso el tic no mira eso", () => {
    // Era la condición equivocada: con `if (enBucle) animar('stretch')`, un
    // personaje sin arma —el caso por defecto de la pantalla— no se estiraba
    // jamás, porque `attention` no hace bucle.
    assert.equal(recorrido("idle").bucle, true);
    assert.equal(recorrido("attention").bucle, false);
    // Y `sitdown` tampoco, que es la otra mitad del arreglo.
    assert.equal(recorrido("sitdown").bucle, false);
  });
});

describe("la lente del retrato", () => {
  test("es la que la figura ocupa en el original, y se calcula", async () => {
    // 2·atan((72 × 0,025 / 2) / 5) = 20,41°. Los números son de `CRenderChar`:
    // `CHAR_SCALE 0.025` y `origin = view + forward*5`.
    const { campoDeVision } = await import("../src/render/cuerpo.js");
    const grados = campoDeVision({ escala: 0.025, distancia: 5 }, 72);
    assert.ok(Math.abs(grados - 20.41) < 0.02, `${grados.toFixed(3)}°`);
  });

  test("y el encuadre del original deja la figura en el 24 % del alto", () => {
    // Con `default_fov 90` (hud.cpp:325) horizontal y 4:3, la vista mide 10 de
    // ancho y 7,5 de alto a 5 unidades. Una figura de 72 × 0,025 = 1,8 es el
    // 24 %. Está aquí porque es la cifra de la que nos apartamos a propósito:
    // en una tarjeta de 132 px serían 43 px de personaje.
    const media = 5 * Math.tan((90 / 2) * Math.PI / 180);
    assert.equal(media.toFixed(3), "5.000");
    const alto = media * 2 * (3 / 4);
    assert.equal(alto.toFixed(1), "7.5");
    assert.equal(((72 * 0.025) / alto).toFixed(2), "0.24");
  });
});
