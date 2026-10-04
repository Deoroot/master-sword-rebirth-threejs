// EL 99: EL SALTO QUE SE QUEDABA EN 0,1 m DESPUÉS DE UN TELETRANSPORTE.
//
// Dos piezas, y las dos hacían falta:
//
//   1. La regla del «techo» de `Player.step` era NUESTRA: «si al subir se ha
//      avanzado menos de la mitad de lo pedido, la vertical a cero». Lo del
//      motor es `PM_FlyMove` recortando la velocidad con `PM_ClipVelocity`
//      contra cada plano tocado (pm_shared.cpp:933-973 y 1021-1206). Las
//      pruebas de abajo ponen los dos casos en que las dos reglas se separan:
//      el techo tocado DESPUÉS de la mitad del paso (la nuestra dejaba la
//      velocidad entera) y el techo inclinado (la nuestra no deslizaba).
//
//   2. Lo que de verdad cortaba el salto en la sonda del 98 no era la regla
//      sino EL SITIO: el nacimiento de Gate City que elige
//      `tools/aparicion.mjs` estaba a 6 unidades de una pared y con la cabeza
//      bajo el alféizar de una ventana. Los dos PUNTOS que miraba
//      (`sePuedeEstar` a +8 y +68) estaban vacíos; la CAJA del jugador, en el
//      casco 1, no. En el motor eso es `PM_CheckStuck` y no te mueves
//      (pm_shared.cpp:3183-3189). Las pruebas de la segunda mitad leen el
//      horneado y el `.bsp` de verdad.
//
// LOS NÚMEROS ESPERADOS VAN ESCRITOS A MANO (CLAUDE.md §4, el 75): salen de
// la aritmética del motor hecha aquí en el comentario, no de las constantes
// del código que se prueba.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { World, Player, perfilMsr, initPhysics } from "../src/play/player.js";
import { recortarVelocidad, velocidadContraPlanos } from "../src/play/movimiento.js";

const U = 39.37;
const DT = 1 / 60;
const cerca = (a, b, tol, que) => assert.ok(Math.abs(a - b) <= tol, `${que}: ${a} y no ${b} (±${tol})`);

// ── PM_ClipVelocity, a mano ───────────────────────────────────────────────

describe("PM_ClipVelocity (pm_shared.cpp:933-973)", () => {
  test("contra un techo plano la vertical no queda en 0 sino en −0,125: el empujón de MSR (:961-969)", () => {
    // backoff = 268·(−1) = −268; out = 268 − (−1)(−268) = 0; ajuste = 0 ≤ 0
    // → min(0, −0,125) = −0,125 → out −= (−1)(−0,125) → −0,125.
    const v = recortarVelocidad([0, 268, 0], [0, -1, 0]);
    assert.deepEqual(v, [0, -0.125, 0]);
  });
  test("STOP_EPSILON: lo que queda por debajo de 0,1 se pone a cero (:957-958)", () => {
    // Contra una pared (−1,0,0): x = 0,05 − (−1)(−0,05)… sale 0 y luego el
    // ajuste lo deja en +0,125 hacia fuera; la z de 0,09 se queda en 0.
    const v = recortarVelocidad([0.05, 0, 0.09], [-1, 0, 0]);
    assert.deepEqual(v, [-0.125, 0, 0]);
  });
  test("un techo a 45° convierte la subida en deslizamiento de lado", () => {
    // n = (s, −s, 0), s = √½. backoff = −268·s; out = (0 − s·backoff,
    // 268 + (−s)·(−backoff)) = (134, 134, 0). Y AQUÍ EL AJUSTE DE MSR ES UNA
    // MONEDA: después de recortar con rebote 1, `DotProduct(out, normal)` es
    // CERO por construcción, y que el flotante salga −1e−14 o +1e−14 decide si
    // se empuja 0,088 o no. En el motor igual (son `float`). Por eso el
    // margen es el del empujón entero y no una cifra exacta.
    const s = Math.SQRT1_2;
    const v = recortarVelocidad([0, 268, 0], [s, -s, 0]);
    cerca(v[0], 134, 0.09, "x");
    cerca(v[1], 134, 0.09, "y");
    assert.equal(v[2], 0);
  });
});

describe("los planos de PM_FlyMove (pm_shared.cpp:1046-1203)", () => {
  test("en el aire: el suelo actualiza la original, la pared recorta desde ella (:1131-1143)", () => {
    // Cae en diagonal contra una esquina suelo + pared, los dos en el mismo
    // tramo (toi 0): suelo → (100, −0,125·(−1)…); la pared (−1,0,0) recorta
    // desde esa original.
    const v = velocidadContraPlanos([100, -300, 0], [
      { n: [0, 1, 0], toi: 0.5 }, { n: [-1, 0, 0], toi: 0 },
    ]);
    assert.deepEqual(v, [-0.125, 0.125, 0]);
  });
  test("«don't stick»: con choques y sin avanzar nada, velocidad a cero (:1199-1203)", () => {
    assert.deepEqual(velocidadContraPlanos([10, 200, 0], [{ n: [0, -1, 0], toi: 0 }], { seMovio: false }), [0, 0, 0]);
  });
  test("la arista de la escalera: dos planos y la velocidad va por su cruce (:1172-1184)", () => {
    // Dos paredes en ángulo recto; el cruce es el eje vertical. La subida se
    // conserva y lo horizontal se pierde.
    const v = velocidadContraPlanos([50, 200, 50], [
      { n: [-1, 0, 0], toi: 0 }, { n: [0, 0, -1], toi: 0 },
    ], { reflejar: false });
    cerca(v[0], 0, 1e-9, "x"); cerca(v[2], 0, 1e-9, "z");
    assert.ok(v[1] > 199, `y ${v[1]}`);
  });
  test("sin choques, la velocidad no se toca", () => {
    assert.deepEqual(velocidadContraPlanos([1, 2, 3], []), [1, 2, 3]);
  });
});

// ── Con Rapier de verdad, por `Player.step` ───────────────────────────────

await initPhysics();
const L = 10;
function malla(quads) {
  const pos = [], idx = [];
  for (const q of quads) {
    const b = pos.length / 3;
    for (const v of q) pos.push(...v);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx), triangleCount: idx.length / 3 };
}
const SUELO = [[-L, 0, -L], [-L, 0, L], [L, 0, L], [L, 0, -L]];
const techo = (h) => [[-L, h, -L], [L, h, -L], [L, h, L], [-L, h, L]];
/** Un techo a 45°: y = h + x, con la cara de abajo mirando a (+x, −y). */
const techoInclinado = (h) => [[-L, h - L, -L], [L, h + L, -L], [L, h + L, L], [-L, h - L, L]];

/** Asienta, salta en el primer paso y devuelve los pasos con la velocidad. */
function saltar(quads, pasos = 60) {
  const w = new World(malla(quads), { perfil: perfilMsr(U) });
  const p = new Player(w, [0, 0.01, 0]);
  for (let i = 0; i < 30; i++) p.step(DT, {});
  const y0 = p.feet[1];
  let max = y0;
  const log = [];
  for (let i = 0; i < pasos; i++) {
    const v0 = [...p.vel];
    const r = p.step(DT, { jump: i === 0 });
    max = Math.max(max, p.feet[1]);
    log.push({ v0, v: [...p.vel], req: r.requested[1], app: r.applied[1] });
  }
  w.free();
  return { salto: (max - y0) * U, golpe: log.find((l) => l.req > 0 && l.app < l.req * 0.999) ?? null };
}

describe("Player.step: la velocidad contra el techo", () => {
  test("CONTROL POSITIVO: al aire libre el salto son 45 unidades (ALTURA_DE_SALTO)", () => {
    // 268,3² / (2·800) = 45,0: `PM_Jump` con sv_gravity 800.
    cerca(saltar([SUELO]).salto, 45, 0.1, "salto");
  });
  test("un techo tocado ANTES de la mitad del paso para la subida (las dos reglas lo hacían)", () => {
    // Hueco de 3 unidades sobre la cabeza: el primer paso que sube pide 4,4 y
    // avanza el 40 %.
    const { golpe } = saltar([SUELO, techo((72 + 3) / U)]);
    assert.ok(golpe && golpe.app / golpe.req < 0.5, `golpe ${JSON.stringify(golpe)}`);
    // Es el CONTROL de la prueba siguiente: aquí las dos reglas paran la
    // subida (la vieja a 0, la del motor a −6,79), así que esta prueba sigue
    // verde con la regla vieja puesta y la de abajo no.
    assert.ok(golpe.v[1] <= 0, `vertical tras el golpe ${golpe.v[1]}`);
  });
  test("un techo tocado DESPUÉS de la mitad del paso también para la subida (la regla vieja la dejaba entera)", () => {
    // Hueco de 4 unidades: el primer paso avanza el 64 % y choca. Con la regla
    // del «menos de la mitad» la vertical se quedaba en 255 y el jugador se
    // quedaba apretado contra el techo un paso más. El motor recorta en
    // cuanto hay plano: −6,79, la misma cuenta de la prueba de arriba.
    const { golpe } = saltar([SUELO, techo((72 + 4) / U)]);
    assert.ok(golpe && golpe.app / golpe.req > 0.5, `golpe ${JSON.stringify(golpe)}`);
    cerca(golpe.v[1], -6.79, 0.02, "vertical tras el golpe");
  });
  test("un techo INCLINADO desliza de lado, no para en seco ni deja subir igual", () => {
    // Al chocar la vertical que empieza el paso es 255,0: 255 − 6,67 = 248,3;
    // contra (√½, −√½, 0): backoff = −175,6 → (124,2, 124,2); el ajuste de
    // MSR los separa 0,088; y la segunda media gravedad: (124,3, 117,4).
    const { golpe } = saltar([SUELO, techoInclinado(2.2)]);
    assert.ok(golpe, "tiene que chocar con el techo");
    cerca(golpe.v0[1], 255.0, 0.1, "vertical al empezar el paso del golpe");
    cerca(golpe.v[0], 124.3, 0.5, "horizontal ganada");
    cerca(golpe.v[1], 117.4, 0.5, "vertical que queda");
  });
});

// ── El sitio: Gate City, con el `.bsp` y el horneado de verdad ────────────

const APARICION = "build/gatecity/aparicion.json";
const BSP = "../MSC/assets/msr/maps/gatecity.bsp";
const HAY = existsSync(APARICION) && existsSync(BSP) && existsSync("build/gatecity/malla.bin");

describe("el nacimiento de Gate City cabe (casco 1)", { skip: !HAY && "sin build/gatecity o sin ../MSC" }, async () => {
  const { leerBsp } = await import("../src/bsp/lector.js");
  const { cabeDePie, sePuedeEstar } = await import("../src/bsp/arbol.js");
  const bsp = HAY ? leerBsp(BSP) : null;
  const ap = HAY ? JSON.parse(readFileSync(APARICION, "utf8")) : null;

  test("CONTROL: el rayo que se elegía hasta el 98 tiene los dos PUNTOS vacíos y la CAJA dentro de la pared", () => {
    // [80, 2790, −576]: «rayo a 7,9 m del sacerdote», el nacimiento del 98.
    const viejo = [80, 2790, -576];
    assert.ok(sePuedeEstar(bsp, [80, 2790, -576 + 8]) && sePuedeEstar(bsp, [80, 2790, -576 + 68]),
      "los dos puntos que miraba la herramienta estaban vacíos: por eso pasaba");
    assert.equal(cabeDePie(bsp, viejo), false, "y la caja del jugador no cabe");
  });
  test("el `ms_player_begin` de Edana cabe aunque el suelo bajo la caja esté 4 unidades más alto que bajo el punto", { skip: !existsSync("../MSC/assets/msr/maps/edana.bsp") }, () => {
    const edana = leerBsp("../MSC/assets/msr/maps/edana.bsp");
    assert.equal(cabeDePie(edana, [-1984, -2784, -184]), true);
  });
  test("el nacimiento y la reaparición horneados caben", () => {
    assert.equal(cabeDePie(bsp, ap.nacimiento.unidades), true, ap.nacimiento.nombre);
    assert.equal(cabeDePie(bsp, ap.reaparicion.unidades), true, ap.reaparicion.nombre);
  });

  test("teletransportado al nacimiento, salta entero EN EL PRIMER PASO, seis de seis", async () => {
    const { cargarNivel } = await import("../src/bsp/nivel.js");
    const leer = async (ruta) => {
      try {
        const b = readFileSync(ruta);
        return { ok: true, status: 200, json: async () => JSON.parse(b.toString()),
          arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
      } catch { return { ok: false, status: 404 }; }
    };
    const level = await cargarNivel({ mapa: "gatecity", base: "build/gatecity", fetch: leer });
    const perfil = perfilMsr(level.unitsPerMetre);
    const w = new World(level.colision, { perfil });
    const p = new Player(w, level.start, { perfil });
    const e = ap.nacimiento.escena;
    const saltos = [];
    for (let k = 0; k < 6; k++) {
      // Como `probe.mundo.poner`: 5 cm por encima, y SIN asentarse andando.
      p.colocar([e[0], e[1] + 0.05, e[2]], { velocidad: [0, 0, 0] });
      w.world.step();
      for (let i = 0; i < k % 3; i++) p.step(DT, {});
      const y0 = Math.min(p.feet[1], e[1] + 0.05);
      let max = -Infinity;
      for (let i = 0; i < 50; i++) { p.step(DT, { jump: i < 6 }); max = Math.max(max, p.feet[1]); }
      saltos.push(Number(((max - e[1]) * U).toFixed(1)));
      for (let i = 0; i < 60; i++) p.step(DT, {});
      assert.ok(Number.isFinite(y0));
    }
    w.free();
    // Contra el suelo y no contra los pies de partida: 45 unidades, con el
    // margen de los 5 cm de la caída (2 u) y del paso.
    for (const s of saltos) assert.ok(s > 43 && s < 49, `saltos sobre el suelo: ${saltos.join(", ")} u`);
  });
});

// ── CORRECCIÓN DEL MISMO 99: lo que rompió el recorte, y lo que no ────────

describe("el recorte no se come el escalón (sonda red95, Edana)", { skip: !existsSync("build/edana/malla.bin") && "sin build/edana" }, async () => {
  test("Beto sube el escalón de x ≈ 17,25 andando hacia el rincón, como con la regla vieja", async () => {
    // Medido: con el recorte en todos los pasos «en el aire», Beto se quedaba
    // en x = 17,24, y = −4,45 los 20 s. El autostep de Rapier deja la cápsula
    // uno o dos pasos sobre el canto con `grounded` falso, y la contrahuella
    // (−1, 0,04, 0) le quitaba la velocidad. Con la regla vieja cruza x = 17,6
    // en el paso 190 y llega al rincón en el 227.
    const { cargarNivel } = await import("../src/bsp/nivel.js");
    const leer = async (ruta) => {
      try {
        const b = readFileSync(ruta);
        return { ok: true, status: 200, json: async () => JSON.parse(b.toString()),
          arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
      } catch { return { ok: false, status: 404 }; }
    };
    const level = await cargarNivel({ mapa: "edana", base: "build/edana", fetch: leer });
    const perfil = perfilMsr(level.unitsPerMetre);
    const w = new World(level.colision, { perfil });
    // NACER, PASO y RINCON de sondas/red95.mjs.
    const p = new Player(w, [7.98, -4.4, 2.37], { perfil });
    for (let i = 0; i < 60; i++) p.step(DT, {});
    const metas = [[8.98, -0.43], [19.0, -3.4]];
    let k = 0, t = 0, cruza = null;
    while (k < 2 && t < 1200) {
      const [x, z] = metas[k];
      const f = p.feet;
      if (Math.hypot(x - f[0], z - f[2]) < 0.3) { k++; continue; }
      p.yaw = Math.atan2(-(x - f[0]), -(z - f[2]));
      p.step(DT, { forward: 1 });
      t++;
      if (cruza === null && p.feet[0] > 17.6) cruza = t;
    }
    const fin = p.feet;
    w.free();
    assert.ok(cruza !== null && cruza < 240, `cruza x = 17,6 en el paso ${cruza} (la regla vieja: 190)`);
    assert.equal(k, 2, `se queda en (${fin.map((v) => v.toFixed(2)).join(", ")}) tras ${t} pasos`);
  });
});

describe("al caer sobre un suelo liso, los pies quedan a la piel y no dentro", () => {
  // `skin` 0,02 m (perfilMsr): el controlador deja los pies 2 cm por encima.
  // ESTO NO ERA UNA REGRESIÓN DEL RECORTE: andando despacio sobre el suelo de
  // `src/red/liso.js` los pies bajan hasta 5,3 cm CON LA REGLA VIEJA y 2,8
  // con la nueva (doc/SALTO_99.md §7). Lo que sí toca el recorte es el paso
  // de aterrizar, y eso es lo que se fija aquí.
  for (const [que, y0, saltar] of [["saltando", 0.05, true], ["cayendo 2 m", 2, false], ["cayendo 6 m", 6, false]]) {
    test(`${que}: reposo a 0,020 m ± 1 mm, y nunca por debajo de 0,018`, () => {
      const w = new World(malla([SUELO]), { perfil: perfilMsr(U) });
      const p = new Player(w, [0, y0, 0]);
      let min = Infinity;
      for (let i = 0; i < 200; i++) {
        p.step(DT, { jump: saltar && i > 60 && i < 64 });
        if (i > 60) min = Math.min(min, p.feet[1]);
      }
      const reposo = p.feet[1];
      w.free();
      cerca(reposo, 0.02, 0.001, "reposo");
      assert.ok(min > 0.018, `mínimo ${min}`);
    });
  }
});
