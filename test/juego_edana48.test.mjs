// 48 — Lo que hizo falta para que Edana se horneara.
//
// Cuatro guardas del extractor pararon el horneado de Edana, y **ninguna de
// las cuatro estaba equivocada al parar**: las cuatro estaban escritas para un
// mapa. Lo que se corrige aquí no son las guardas, es la regla que cada una
// daba por universal:
//
//   1. «los bloques de mapa de luz SUMAN el lump»   -> pueden dejar cola
//   2. «una entidad de brushes es UN brush convexo» -> puede tener diez
//   3. «encima de un suelo hay hueco 150 de 200 veces» -> depende del mapa
//   4. «en contra de su normal es un fallo»         -> o es de doble cara
//
// El `.bsp` no está en el repositorio: si no está, lo que necesita archivo se
// salta y lo dice, porque una prueba que se salta en silencio dice que sí.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import { leerBsp, leerTodasLasCaras, leerTexinfo, leerModelos, leerEntidades, tieneLuz }
  from "../src/bsp/lector.js";
import { contabilidad } from "../src/bsp/luz.js";
import { piezasDeModelo, OCUPADO, SOLIDO, VACIO, CLIP_MINS, CLIP_MAXS, modeloDeBsp }
  from "../src/bsp/clip.js";
import { leerMdl, texturasDe, mallaDe } from "../src/bsp/mdl.js";
import { dentroDe } from "../src/play/volumenes.js";

const MAPAS = "../MSC/assets/msr/maps";
const HAY = (m) => existsSync(`${MAPAS}/${m}.bsp`);
const abrir = (m) => {
  const bsp = leerBsp(`${MAPAS}/${m}.bsp`);
  const tis = leerTexinfo(bsp);
  return { bsp, tis, modelos: leerModelos(bsp), entidades: leerEntidades(bsp),
    caras: leerTodasLasCaras(bsp, leerModelos(bsp), tis) };
};

// --- 1. la cola del lump de luz ---------------------------------------------

describe("48 · la contabilidad del mapa de luz admite cola, pero sólo de ceros", () => {
  // Una cara de mentira: `contabilidad` sólo le pide `lightofs`, `estilos`,
  // `nEstilos`, `puntos` y `texinfo`. Con un `texinfo` de ejes unitarios, un
  // cuadrado de 0..16 da un parche de 2×2 = 12 bytes por estilo.
  const ti = { s: [1, 0, 0, 0], t: [0, 1, 0, 0] };
  const cara = (lightofs, lado = 16) => ({
    lightofs, estilos: [0, 255, 255, 255], nEstilos: 1, texinfo: ti,
    puntos: [[0, 0, 0], [lado, 0, 0], [lado, lado, 0], [0, lado, 0]],
  });
  const CERO = new Uint8Array(64);

  test("dos bloques pegados que llenan el lump: cuadra", () => {
    const c = contabilidad([cara(0), cara(12)], 24, CERO);
    assert.equal(c.bytes, 24);
    assert.equal(c.cola, 0);
    assert.equal(c.solapes, 0);
    assert.equal(c.huecos, 0);
    assert.ok(c.cuadra);
  });

  test("EL CASO DE EDANA: cola que nadie reclama, toda ceros -> cuadra", () => {
    const c = contabilidad([cara(0), cara(12)], 30, CERO);
    assert.equal(c.cola, 6);
    assert.equal(c.colaCeros, true);
    assert.equal(c.sobran, -6);
    assert.ok(c.cuadra, "seis ceros al final no son un fallo de lectura");
  });

  test("CONTROL: si UN byte de la cola no es cero, no cuadra", () => {
    const sucio = new Uint8Array(64);
    sucio[27] = 1;                          // dentro de la cola 24..30
    const c = contabilidad([cara(0), cara(12)], 30, sucio);
    assert.equal(c.cola, 6);
    assert.equal(c.colaCeros, false);
    assert.ok(!c.cuadra, "un byte con datos en la cola es un bloque que no hemos leído");
  });

  test("CONTROL: sin los bytes no se puede mirar la cola, y entonces NO cuadra", () => {
    const c = contabilidad([cara(0), cara(12)], 30);
    assert.equal(c.colaCeros, null, "«no se ha mirado» no es «está bien»");
    assert.ok(!c.cuadra);
  });

  test("un solape interno sigue siendo un fallo", () => {
    const c = contabilidad([cara(0), cara(6)], 18, CERO);
    assert.equal(c.solapes, 1);
    assert.ok(!c.cuadra);
  });

  test("un hueco INTERNO sigue siendo un fallo, aunque sea de ceros", () => {
    const c = contabilidad([cara(0), cara(20)], 32, CERO);
    assert.equal(c.huecos, 1);
    assert.equal(c.cola, 0);
    assert.ok(!c.cuadra);
  });

  test("un bloque que se sale del lump es un fallo", () => {
    const c = contabilidad([cara(0)], 8, CERO);
    assert.equal(c.desbordan, 1);
    assert.ok(!c.cuadra);
  });

  test("con el .bsp: Gate City no tiene cola y Edana tiene 807 bytes de ceros", (t) => {
    if (!HAY("gatecity") || !HAY("edana")) return t.skip("no está el .bsp");
    const g = abrir("gatecity");
    const cg = contabilidad(g.caras, g.bsp.lumps.luz.len, g.bsp.lumps.luz.datos);
    assert.equal(cg.cola, 0);
    assert.ok(cg.cuadra);

    const e = abrir("edana");
    const ce = contabilidad(e.caras, e.bsp.lumps.luz.len, e.bsp.lumps.luz.datos);
    assert.equal(ce.bytesDelLump, 1545495);
    assert.equal(ce.bytes, 1544688);
    assert.equal(ce.cola, 807);
    assert.equal(ce.colaCeros, true);
    assert.equal(ce.solapes, 0);
    assert.equal(ce.huecos, 0);
    assert.ok(ce.cuadra, "los 807 bytes son ceros que nadie reclama, no una mala lectura");
    // Y el control de que esto no se ha vuelto un colador: los 11 997 bloques
    // de delante encajan uno tras otro sin un byte de margen.
    assert.equal(ce.caras, 11998);
  });
});

// --- 2. una entidad puede tener varios brushes ------------------------------

describe("48 · los volúmenes son VARIAS piezas convexas, no una", () => {
  test("dentroDe: dentro de una pieza cualquiera es dentro", () => {
    // Dos cubos separados, 0..1 y 3..4 en X, dentro de una caja 0..4.
    const cubo = (x0, x1) => [
      { n: [-1, 0, 0], d: -x0 }, { n: [1, 0, 0], d: x1 },
      { n: [0, -1, 0], d: 0 }, { n: [0, 1, 0], d: 1 },
      { n: [0, 0, -1], d: 0 }, { n: [0, 0, 1], d: 1 },
    ];
    const v = { caja: { min: [0, 0, 0], max: [4, 1, 1] }, piezas: [cubo(0, 1), cubo(3, 4)] };
    assert.ok(dentroDe(v, [0.5, 0.5, 0.5]), "dentro del primero");
    assert.ok(dentroDe(v, [3.5, 0.5, 0.5]), "dentro del segundo");
    // EL CASO QUE EL CÓDIGO VIEJO FALLABA: en la caja, entre los dos.
    assert.ok(!dentroDe(v, [2.0, 0.5, 0.5]), "el hueco entre las dos piezas NO es el volumen");
    assert.ok(!dentroDe(v, [9.0, 0.5, 0.5]), "fuera de la caja tampoco");
  });

  test("sin piezas ni planos manda la caja, como antes", () => {
    const v = { caja: { min: [0, 0, 0], max: [1, 1, 1] } };
    assert.ok(dentroDe(v, [0.5, 0.5, 0.5]));
    assert.ok(!dentroDe(v, [2, 0.5, 0.5]));
  });

  test("con el .bsp: en Gate City cada func_water es UN brush y en Edana hay de seis y de diez", (t) => {
    if (!HAY("gatecity") || !HAY("edana")) return t.skip("no está el .bsp");
    const cuenta = (mapa) => {
      const { bsp, entidades } = abrir(mapa);
      return entidades
        .filter((e) => e.classname === "func_water" && /^\*\d+$/.test(e.model ?? ""))
        .map((e) => piezasDeModelo(bsp, Number(e.model.slice(1)), { contenidos: OCUPADO }).piezas.length);
    };
    assert.deepEqual(cuenta("gatecity"), [1, 1, 1], "por eso no se notaba");
    const e = cuenta("edana").sort((a, b) => a - b);
    assert.deepEqual(e, [1, 1, 1, 2, 6, 10]);
  });

  test("EL SIGNO: los planos del árbol miran hacia dentro y hay que voltearlos", (t) => {
    if (!HAY("gatecity")) return t.skip("no está el .bsp");
    const { bsp, entidades, modelos } = abrir("gatecity");
    // El estanque grande, el que no es su caja.
    const e = entidades.filter((x) => x.classname === "func_water")
      .map((x) => Number(x.model.slice(1)))
      .sort((a, b) => {
        const v = (m) => (m.maxs[0] - m.mins[0]) * (m.maxs[1] - m.mins[1]);
        return v(modelos[b]) - v(modelos[a]);
      })[0];
    const m = modelos[e];
    const crudas = piezasDeModelo(bsp, e, { contenidos: OCUPADO }).piezas;
    assert.ok(crudas.length >= 1);
    // Como las voltea el extractor: `n·p >= dist` pasa a `(−n)·p − (−dist) <= 0`.
    const volteadas = crudas.map((ps) => ps.map((p) => ({ n: p.n.map((v) => -v), d: -p.dist })));
    const v = { caja: { min: [...m.mins], max: [...m.maxs] }, piezas: volteadas };
    let a = 4242, dentro = 0;
    const rnd = () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; };
    for (let k = 0; k < 4000; k++) {
      const q = [0, 1, 2].map((j) => m.mins[j] + rnd() * (m.maxs[j] - m.mins[j]));
      if (dentroDe(v, q)) dentro++;
    }
    // El estanque llena bastante más de un tercio de su caja. Con el signo sin
    // voltear esto sale CERO, que es el fallo que este control existe para ver.
    assert.ok(dentro / 4000 > 0.3, `sólo ${dentro} de 4000 dentro: ¿planos del revés?`);
  });

  test("CONTROL: contando sólo CONTENTS_SOLID, el agua de Edana se pierde", (t) => {
    if (!HAY("edana")) return t.skip("no está el .bsp");
    const { bsp, entidades } = abrir("edana");
    const soloSolido = entidades
      .filter((e) => e.classname === "func_water" && /^\*\d+$/.test(e.model ?? ""))
      .map((e) => piezasDeModelo(bsp, Number(e.model.slice(1)),
        { contenidos: (c) => c === SOLIDO }).piezas.length);
    // Tres de los seis tienen las hojas en −3 (agua) y no en −2 (sólido), así
    // que con el filtro estricto salen VACÍOS. `PM_LinkContents` pide «!= −1».
    assert.equal(soloSolido.filter((n) => n === 0).length, 3);
  });
});

// --- los dos cascos ---------------------------------------------------------

describe("48 · el motor prueba el agua con el casco 0 y los disparadores con el del jugador", () => {
  test("las medidas de los cascos son las del motor, y en SU orden", () => {
    // model.cpp:1107-1136. El 2 es el grande y el 3 el agachado: no es el
    // orden de `player_mins[]`, que va por `usehull`.
    assert.deepEqual(CLIP_MINS, [[0, 0, 0], [-16, -16, -36], [-32, -32, -32], [-16, -16, -18]]);
    assert.deepEqual(CLIP_MAXS, [[0, 0, 0], [16, 16, 36], [32, 32, 32], [16, 16, 18]]);
  });

  test("OCUPADO es «no vacío», que es lo que pide PM_LinkContents", () => {
    assert.equal(VACIO, -1);
    assert.equal(OCUPADO(VACIO), false);
    assert.equal(OCUPADO(SOLIDO), true);
    assert.equal(OCUPADO(-3), true, "agua");
    assert.equal(OCUPADO(-4), true, "cieno");
  });

  test("con el .bsp: el casco 1 CONTIENE al 0, y es más grande donde importa", (t) => {
    if (!HAY("gatecity")) return t.skip("no está el .bsp");
    const { bsp, entidades } = abrir("gatecity");
    const dentroDeAlguna = (piezas, q) => piezas.some((ps) =>
      ps.every((p) => p.n[0] * q[0] + p.n[1] * q[1] + p.n[2] * q[2] - p.dist >= -0.01));
    // Un dado con semilla: la misma prueba tiene que dar lo mismo siempre.
    let a = 99991;
    const rnd = () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; };

    const zonas = entidades.filter((e) =>
      /^(trigger_hurt|trigger_once|msarea_town|msarea_music|msarea_transition)$/.test(e.classname) &&
      /^\*\d+$/.test(e.model ?? ""));
    assert.ok(zonas.length >= 20, `sólo ${zonas.length} zonas: no hay qué medir`);

    let seSale = 0, creceEnAlguna = 0;
    for (const e of zonas) {
      const i = Number(e.model.slice(1));
      const m = modeloDeBsp(bsp, i);
      const h0 = piezasDeModelo(bsp, i, { hull: 0, contenidos: OCUPADO }).piezas;
      const h1 = piezasDeModelo(bsp, i, { hull: 1, contenidos: (c) => c === SOLIDO }).piezas;
      const lo = m.mins.map((v) => v - 40), hi = m.maxs.map((v) => v + 40);
      let n0 = 0, n1 = 0;
      for (let k = 0; k < 4000; k++) {
        const q = [0, 1, 2].map((j) => lo[j] + rnd() * (hi[j] - lo[j]));
        const d0 = dentroDeAlguna(h0, q), d1 = dentroDeAlguna(h1, q);
        if (d0) n0++;
        if (d1) n1++;
        if (d0 && !d1) seSale++;
      }
      if (n1 > n0) creceEnAlguna++;
    }
    assert.equal(seSale, 0, "el casco 1 es el brush engordado: tiene que contener al casco 0");
    // Y EL CONTROL POSITIVO: si la caja de recorte no se engordara con el
    // casco, el 1 saldría IDÉNTICO al 0 y esto sería cero.
    assert.ok(creceEnAlguna >= 15,
      `sólo ${creceEnAlguna} zonas crecen del casco 0 al 1; sin engordar la caja no crece ninguna`);
  });
});

// --- 4. doble cara no es bobinado al revés ----------------------------------

describe("48 · un triángulo en contra de su normal con gemelo es de DOBLE CARA", () => {
  const HIERBA = "../MSC/assets/msr/models/msc_riverwind/flo_grass2.mdl";

  test("la hierba de Edana: 36 de 72 en contra, y los 36 tienen gemelo", (t) => {
    if (!existsSync(HIERBA)) return t.skip("no está el .mdl");
    const m = leerMdl(HIERBA);
    const ml = mallaDe(m, texturasDe(m));
    assert.equal(ml.contraNormal, 36);
    assert.equal(ml.aFavor, 36);
    assert.equal(ml.gemelos, 36, "cada triángulo del revés tiene otro igual del derecho");
    assert.equal(ml.sueltos, 0);
    assert.ok(ml.bobinadoBien, "una lámina de doble cara no es un modelo invertido");
    // Y el umbral viejo la habría parado: el 50 % clavado.
    assert.equal(Number((ml.contraNormalFrac).toFixed(2)), 0.5);
  });

  test("CONTROL: la vela de Gate City sigue pasando, y sus 10 NO son gemelos", (t) => {
    const vela = "../MSC/assets/msr/models/props/gaz_thoth_mutant_candle.mdl";
    if (!existsSync(vela)) return t.skip("no está el .mdl");
    const m = leerMdl(vela);
    const ml = mallaDe(m, texturasDe(m));
    assert.ok(ml.bobinadoBien);
    assert.ok(ml.sueltos <= (ml.aFavor + ml.contraNormal) * 0.25,
      `${ml.sueltos} sueltos de ${ml.aFavor + ml.contraNormal}`);
  });
});
