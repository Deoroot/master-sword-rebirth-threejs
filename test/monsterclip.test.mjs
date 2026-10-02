// LA VALLA DE LOS MONSTRUOS: los 101 `func_monsterclip` de Gate City.
//
// Lo que estas pruebas defienden no es que la valla funcione: es que sea **de
// quien es**. En el motor el monsterclip lo ve el que anda y no lo ve el que
// mira, y la diferencia sale de una línea con un `FALSE` a fuego:
//
//   UTIL_TraceLine  ->  SV_Move(..., FALSE)          pr_cmds.cpp:335   NO lo ve
//   SV_movestep     ->  ent->v.flags & FL_MONSTERCLIP  sv_move.cpp:44    sí
//   DROP_TO_FLOOR   ->  ent->v.flags & FL_MONSTERCLIP  pr_cmds.cpp:1696  sí
//
// Y las dos cosas que usan `UTIL_TraceLine` son las dos que uno metería primero:
// elegir el rumbo del paseo (msmonsterserver.cpp:1084) y la vista (`FVisible`,
// combat.cpp:1294). Meter la valla ahí haría bichos que esquivan obstáculos que
// no pueden percibir: mejor juego y otro juego.
//
// El oráculo de la geometría es el propio `.bsp`: los medios espacios que
// reconstruimos y el árbol de colisión que el compilador escribió tienen que
// decir lo mismo en cada punto. Si no está el archivo, se salta y lo dice.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import { leerBsp, leerEntidades, aEscena } from "../src/bsp/lector.js";
import { contenidoEn } from "../src/bsp/arbol.js";
import { monsterclipDeMapa, piezasDeModelo, piezasEnEscena, SOLIDO } from "../src/bsp/clip.js";
import { Monsterclip, dentro, entradaEnConvexo, cortaConvexo, EPS } from "../src/play/monsterclip.js";
import { avanzar, CINTURA, U_POR_METRO } from "../src/play/manada.js";

const RUTA = "../MSC/assets/msr/maps/gatecity.bsp";
const HAY = existsSync(RUTA);

/** Un cubo de lado 2 centrado en el origen, como seis medios espacios. */
const CUBO = [
  { n: [1, 0, 0], dist: -1 }, { n: [-1, 0, 0], dist: -1 },
  { n: [0, 1, 0], dist: -1 }, { n: [0, -1, 0], dist: -1 },
  { n: [0, 0, 1], dist: -1 }, { n: [0, 0, -1], dist: -1 },
];
const unCubo = [{ piezas: [CUBO], mins: [-1, -1, -1], maxs: [1, 1, 1] }];

describe("un segmento contra un convexo", () => {
  test("lo atraviesa, lo esquiva, y empieza dentro", () => {
    assert.equal(cortaConvexo(CUBO, [-5, 0, 0], [5, 0, 0]), true, "de lado a lado");
    assert.equal(cortaConvexo(CUBO, [-5, 5, 0], [5, 5, 0]), false, "por encima");
    assert.equal(cortaConvexo(CUBO, [-5, 0, 0], [-2, 0, 0]), false, "se queda corto");
    assert.equal(cortaConvexo(CUBO, [0, 0, 0], [5, 0, 0]), true, "empieza dentro");
    // La `t` de entrada es la que sirve para el suelo: entrando por −1 de un
    // segmento de −5 a 5, entra al 40 % del recorrido.
    // Entra por x = −1 de un segmento de −5 a 5: al 40 % del recorrido, más la
    // tolerancia hacia dentro (EPS sobre 10 m de segmento, o sea 5e−5).
    const t = entradaEnConvexo(CUBO, [-5, 0, 0], [5, 0, 0]);
    assert.ok(Math.abs(t - 0.4) < 1e-3, `t = ${t}`);
    assert.ok(t > 0.4, "la tolerancia va hacia DENTRO");
  });

  test("rozar una cara NO cuenta, y es lo que deja salir a un bicho pegado", () => {
    // Sin la tolerancia hacia dentro, un bicho con el pie en la cara del brush
    // lo estaría cortando siempre y no podría moverse en ninguna dirección: se
    // ve igual que un bicho atascado en la roca, y no lo está.
    assert.equal(cortaConvexo(CUBO, [-5, 1, 0], [5, 1, 0]), false, "justo sobre la cara de arriba");
    assert.equal(cortaConvexo(CUBO, [-5, 1 - 10 * EPS, 0], [5, 1 - 10 * EPS, 0]), true,
      "un pelo por dentro sí");
  });

  test("el techo de la valla es la superficie más alta, y null si no hay", () => {
    const v = new Monsterclip(unCubo);
    // Bajando desde y=3 tres metros: la cara de arriba está en y=1.
    const y = v.techo(0, 0, 3, 3);
    assert.ok(y !== null && Math.abs(y - 1) < 1e-3, `techo = ${y}`);
    assert.equal(v.techo(10, 10, 3, 3), null, "fuera del brush no hay techo");
    // Y el control de que el largo importa: desde y=3 con un metro de segmento
    // no se llega a y=1.
    assert.equal(v.techo(0, 0, 3, 1), null);
  });

  test("una valla vacía no bloquea y no cuesta nada", () => {
    const v = new Monsterclip([]);
    assert.equal(v.n, 0);
    assert.equal(v.bloquea([-5, 0, 0], [5, 0, 0]), false);
    assert.equal(v.techo(0, 0, 3), null);
  });
});

describe("la valla la mira el que ANDA y no el que traza", () => {
  const bicho = () => ({
    donde: [-5, 0, 0], yaw: 0, destino: [10 * U_POR_METRO, 0, 0], cerca: 0,
    velocidad: 1, velocidadCorriendo: 2, frenado: null, ficha: { ia: { alto: 60 } },
  });
  // Un brush justo delante, a la altura de la cintura.
  const valla = new Monsterclip([{
    piezas: [[
      { n: [1, 0, 0], dist: -4.8 }, { n: [-1, 0, 0], dist: -4.5 },
      { n: [0, 1, 0], dist: 0 }, { n: [0, -1, 0], dist: -2 },
      { n: [0, 0, 1], dist: -2 }, { n: [0, 0, -1], dist: -2 },
    ]],
    mins: [-4.8, 0, -2], maxs: [4.5, 2, 2],
  }]);

  test("`avanzar` se para en la valla, con su propia causa", () => {
    // EL POSITIVO primero: sin valla el bicho avanza. Un «no avanza» es lo que
    // se ve cuando esto no se llama siquiera.
    const libreSiempre = () => true;
    const suelo = () => 0;
    const sinValla = bicho();
    assert.equal(avanzar(sinValla, 1 / 20, libreSiempre, suelo), true);
    assert.equal(sinValla.frenado, "avanza");

    const conValla = bicho();
    assert.equal(avanzar(conValla, 1 / 20, libreSiempre, suelo, U_POR_METRO, { valla }), false);
    // No es «pared delante»: son dos cosas que se ven igual y hay que distinguir.
    assert.equal(conValla.frenado, "monsterclip");
    assert.equal(conValla.donde[0], -5, "no se ha movido");
  });

  test("y `libre` NUNCA recibe la valla: el rumbo y la vista no la ven", () => {
    // Si alguien metiera la valla en el arnés, `libre` empezaría a decir «no» en
    // sitios donde el motor dice «sí» y el paseo elegiría rumbos que MSR no
    // elige. Aquí se comprueba al revés: `libre` recibe exactamente lo que le
    // toca y nada más — siete argumentos, sin valla entre ellos.
    const vistos = [];
    const espia = (...args) => { vistos.push(args); return true; };
    const i = bicho();
    avanzar(i, 1 / 20, espia, () => 0, U_POR_METRO, { valla });
    assert.equal(vistos.length, 1);
    const [x, y, z, dx, dz, dist, quien] = vistos[0];
    assert.equal(y, 0 + CINTURA);
    assert.equal(quien, i);
    assert.equal(vistos[0].length, 7, "a `libre` no se le ha colado un octavo argumento");
    for (const a of vistos[0]) {
      assert.ok(!(a instanceof Monsterclip), "la valla ha llegado a `libre`");
    }
    assert.ok(Number.isFinite(x) && Number.isFinite(z) && Number.isFinite(dx) && Number.isFinite(dz) && dist > 0);
  });
});

describe("gatecity.bsp: los 101 monsterclip", { skip: HAY ? false : `falta ${RUTA} (no se copia a propósito)` }, () => {
  const bsp = leerBsp(RUTA);
  const ents = leerEntidades(bsp);

  test("son 101, no traen ni una cara, y ninguno sale vacío", () => {
    const clips = ents.filter((e) => e.classname === "func_monsterclip" && /^\*\d+$/.test(e.model ?? ""));
    assert.equal(clips.length, 101);
    // Sin caras: por eso la malla de colisión, que se hace de caras, no los tenía.
    for (const e of clips) {
      assert.equal(piezasDeModelo(bsp, Number(e.model.slice(1))).numfaces, 0, e.model);
    }
    const { brushes, vacias } = monsterclipDeMapa(bsp, ents);
    // «cero monsterclip» y «los he leído todos y están vacíos» se ven igual en el
    // mundo y son dos fallos distintos, así que se cuentan las dos cosas.
    assert.equal(vacias, 0);
    assert.equal(brushes.length, 101);
    assert.equal(brushes.reduce((a, b) => a + b.piezas.length, 0), 105);
  });

  test("EL ORÁCULO: los medios espacios y el árbol del .bsp dicen lo mismo", () => {
    // El único juez que hay: el `.bsp` no guarda estos brushes de ninguna otra
    // forma, así que se muestrean puntos y se exige acuerdo total. Se muestrea
    // con margen para caer también FUERA — un `dentro()` que devolviera siempre
    // `true` pasaría la mitad de la prueba, y por eso se cuenta cuántas muestras
    // salen sólidas: si fueran cero, esto no mediría nada.
    const clips = ents.filter((e) => e.classname === "func_monsterclip" && /^\*\d+$/.test(e.model ?? ""));
    let s = 7;
    const dado = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    let muestras = 0, solidas = 0, acuerdo = 0;
    for (const e of clips) {
      const i = Number(e.model.slice(1));
      const org = String(e.origin ?? "0 0 0").trim().split(/\s+/).map(Number);
      const { mins, maxs } = piezasDeModelo(bsp, i);
      const uno = monsterclipDeMapa(bsp, [e]).brushes;
      assert.equal(uno.length, 1, e.model);
      for (let k = 0; k < 120; k++) {
        const p = [0, 1, 2].map((j) => mins[j] - 8 + dado() * ((maxs[j] - mins[j]) + 16));
        muestras++;
        const arbol = contenidoEn(bsp, [p[0] - org[0], p[1] - org[1], p[2] - org[2]], i).contenido === SOLIDO;
        if (arbol) solidas++;
        if (arbol === dentro(uno, aEscena(p))) acuerdo++;
      }
    }
    assert.equal(acuerdo, muestras, `${muestras - acuerdo} de ${muestras} discrepan`);
    assert.ok(solidas > muestras * 0.1, `sólo ${solidas} de ${muestras} muestras caen dentro: la prueba no mide`);
    assert.ok(solidas < muestras * 0.9, `${solidas} de ${muestras} dentro: el filtro no filtra`);
  });

  test("no hay muralla: son cien bloques pequeños, y la caja NO es la forma", () => {
    // Esto corrige un número que me creí una vuelta entera. Sumando las cajas
    // envolventes salen **32 428 m³** y de ahí dije «la muralla del pueblo, un
    // brush de 31 058». Es falso: el volumen SÓLIDO de los 101 son **872 m³**, y
    // la entidad de la caja de 31 058 son cuatro losas de 425 m³ repartidas por
    // sitios distintos del mapa. Una entidad puede agrupar brushes disjuntos, así
    // que su caja envolvente no es su forma ni de lejos — y por eso la caja sólo
    // vale para filtrar barato, nunca para decidir.
    const { brushes } = monsterclipDeMapa(bsp, ents);
    let s = 99;
    const dado = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    let solido = 0, cajas = 0;
    const porEntidad = [];
    for (const b of brushes) {
      const caja = [0, 1, 2].reduce((a, k) => a * (b.maxs[k] - b.mins[k]), 1);
      cajas += caja;
      let adentro = 0;
      const N = 4000;
      for (let k = 0; k < N; k++) {
        const p = [0, 1, 2].map((j) => b.mins[j] + dado() * (b.maxs[j] - b.mins[j]));
        if (dentro([b], p)) adentro++;
      }
      const v = (caja * adentro) / N;
      solido += v;
      porEntidad.push({ v, caja, piezas: b.piezas.length });
    }
    // Los dos números, y que son muy distintos: es la lección del test.
    assert.ok(cajas > 30000, `cajas ${cajas.toFixed(0)} m³`);
    assert.ok(solido > 700 && solido < 1100, `sólido ${solido.toFixed(0)} m³, esperaba ~872`);
    assert.ok(cajas > solido * 20, "las cajas tienen que ser muchísimo mayores que los brushes");

    // Casi todas son de UNA pieza: sólo dos entidades agrupan varias.
    assert.equal(porEntidad.filter((e) => e.piezas > 1).length, 2);
    // Y son pequeñas: la mediana es un bloque de metro y pico de lado.
    const orden = porEntidad.map((e) => e.v).sort((a, b) => a - b);
    const mediana = orden[orden.length >> 1];
    assert.ok(mediana > 0.5 && mediana < 5, `mediana ${mediana.toFixed(2)} m³`);

    // La entidad de la caja enorme: su centro está VACÍO, que es la prueba de que
    // hay que leer el árbol y no envolver. Y sus losas SÍ paran a alguien.
    const gorda = porEntidad.indexOf(porEntidad.reduce((a, b) => (b.caja > a.caja ? b : a)));
    const g = brushes[gorda];
    const centro = [0, 1, 2].map((k) => (g.mins[k] + g.maxs[k]) / 2);
    assert.equal(dentro([g], centro), false, "el centro de esa caja debería estar hueco");
    // El positivo: dentro de una de sus losas sí. Se busca muestreando, porque
    // afirmar «está hueca» sin encontrar nada sólido no distingue hueca de vacía.
    let unPuntoSolido = null;
    for (let k = 0; k < 200000 && !unPuntoSolido; k++) {
      const p = [0, 1, 2].map((j) => g.mins[j] + dado() * (g.maxs[j] - g.mins[j]));
      if (dentro([g], p)) unPuntoSolido = p;
    }
    assert.ok(unPuntoSolido, "no se ha encontrado ni un punto sólido: la entidad está vacía");
    const v = new Monsterclip([g]);
    assert.equal(v.bloquea(
      [unPuntoSolido[0] - 3, unPuntoSolido[1], unPuntoSolido[2]],
      [unPuntoSolido[0] + 3, unPuntoSolido[1], unPuntoSolido[2]],
    ), true, "un segmento por dentro de una losa tiene que chocar");
  });

  test("los ejes: la valla está donde está el mundo, no volteada", () => {
    // Confundir los ejes del `.bsp` con los de la escena no da error: da una
    // valla en el sitio simétrico del pueblo. Se comprueba contra `aEscena`,
    // que es el mismo cambio de ejes que usa la malla que se dibuja.
    const e = ents.find((x) => x.classname === "func_monsterclip" && /^\*\d+$/.test(x.model ?? ""));
    const i = Number(e.model.slice(1));
    const { mins, maxs } = piezasDeModelo(bsp, i);
    const centroU = [0, 1, 2].map((k) => (mins[k] + maxs[k]) / 2);
    const r = piezasEnEscena(bsp, i);
    const esperado = aEscena(centroU);
    for (const k of [0, 1, 2]) {
      const c = (r.mins[k] + r.maxs[k]) / 2;
      assert.ok(Math.abs(c - esperado[k]) < 1e-3,
        `eje ${k}: la caja está centrada en ${c.toFixed(3)} y el mundo dice ${esperado[k].toFixed(3)}`);
    }
  });
});
