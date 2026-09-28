// El plano en tres dimensiones del jharro, comprobado.
//
// Lo que aquí se juzga no lo puede juzgar nada de lo que había antes. `qbsp` no
// ve una malla; el arnés de marcha necesita geometría, y la geometría todavía no
// existe; una captura enseña una planta, no ocho. Y el fallo propio de un plano
// de varias plantas —que una planta entera quede suelta porque falta una
// escalera— no cambia ni una cifra: el jharro sigue midiendo 256 celdas, sigue
// dando el relleno medido y sigue saliendo bien dibujado planta a planta.
//
// Todo esto es lógica pura y corre en Node sin gráficos, que es justamente lo
// que hace que se pueda comprobar antes de construir nada.

import { test } from "node:test";
import assert from "node:assert/strict";
import { CELDA } from "../src/kit/house.js";
import { HONDO, TRAMO } from "../src/kit/boca.js";
import {
  ANCHO, FONDO, MARGEN, PLANTAS, BANDAS_MEDIDAS, HUELLA_MEDIDA, RELLENO,
  OBJETIVO_M2, FRACCION_BOVEDA, DATUM, ENTRADA, ENTRADA_PLANTA, SALTO_POZO,
  planJharro, alcanzables, distancias, aisladas, transitable, tramoDe,
  conexionDe, tramosDe, reparte, dentro, cotaMundo, hueco, azar,
} from "../src/kit/jharro.js";

const plan = planJharro();

// --- lo derivado de la medida -------------------------------------------------

test("el reparto de restos mayores no pierde ni gana unidades", () => {
  // Es la cuenta que decide cuántas celdas tiene cada planta, así que un error
  // de una unidad aquí sale luego como «256 celdas» que en realidad son 255.
  for (const total of [1, 7, 256, 1000]) {
    for (const pesos of [[1], [1, 1, 1], [141, 964, 3330], BANDAS_MEDIDAS.map((b) => b.area)]) {
      const r = reparte(total, pesos);
      assert.equal(r.reduce((a, b) => a + b, 0), total, `${total} entre ${pesos}`);
      assert.ok(r.every((v) => Number.isInteger(v) && v >= 0));
    }
  }
});

test("las celdas de cada planta salen del suelo medido de su banda", () => {
  const total = PLANTAS.reduce((a, p) => a + p.celdas, 0);
  assert.equal(total, OBJETIVO_M2 / (CELDA * CELDA), "el total no es el objetivo");
  // La planta con más suelo medido tiene que ser la que más celdas tenga. Es la
  // forma de decir «esto lo decidió la medida» sin comprobar la medida entera.
  const porArea = [...PLANTAS].sort((a, b) => b.areaMedida - a.areaMedida);
  const porCeldas = [...PLANTAS].sort((a, b) => b.celdas - a.celdas);
  assert.equal(porArea[0].cota, porCeldas[0].cota, "el grueso no está donde lo midió Gate City");
  assert.equal(porArea[0].cota, -14, "el grueso de Gate City está en la banda de -14 m");
});

test("la huella sale del relleno medido, no de un número redondo", () => {
  assert.ok(Math.abs(RELLENO - 0.3045) < 0.001, `relleno ${RELLENO}`);
  // Y el aspecto de la huella es el de Gate City, con el error de redondear a
  // celdas enteras.
  const aspectoNuestro = ANCHO / FONDO;
  const aspectoSuyo = HUELLA_MEDIDA.ancho / HUELLA_MEDIDA.fondo;
  assert.ok(
    Math.abs(aspectoNuestro - aspectoSuyo) < 0.03,
    `aspecto ${aspectoNuestro.toFixed(3)} contra ${aspectoSuyo.toFixed(3)}`
  );
});

test("la cota cero del jharro es donde acaba el socavón de Corinth", () => {
  // Y sale de `HONDO`, no de un −4,06 copiado: si el socavón se hace más hondo,
  // el jharro tiene que bajar con él. Un número copiado no baja.
  //
  // Con holgura, y la holgura tiene nombre: `HONDO` es 1,015 × 4 y el datum le
  // resta 8 para volver a sumárselo aquí. Sumar y restar en otro orden no da el
  // mismo double —sale −4,059999999999999 contra −4,0600000000000005— y eso no es
  // un fallo de la cota, es cómo funciona el punto flotante. Exigir igualdad
  // exacta sería exigir que nadie cambie nunca el orden de dos sumas.
  assert.ok(
    Math.abs(cotaMundo(ENTRADA_PLANTA) - -HONDO) < 1e-9,
    `la planta de arriba está a ${cotaMundo(ENTRADA_PLANTA)} y la reja a ${-HONDO}`
  );
  assert.equal(DATUM, -HONDO - BANDAS_MEDIDAS[BANDAS_MEDIDAS.length - 1].cota);
  // Y la planta más honda queda por debajo de todo lo de Corinth.
  assert.ok(cotaMundo(0) < -30, `la planta del fondo está a ${cotaMundo(0)} m`);
});

test("la conexión entre dos bandas sale de la pieza de escalera medida", () => {
  // `strairs_stone` sube 1,015 m por tramo: bajar dos metros son dos tramos.
  assert.equal(tramosDe(2), 2);
  assert.equal(tramosDe(TRAMO.alto), 1);
  const dos = conexionDe(2);
  assert.equal(dos.tipo, "escalera");
  assert.equal(dos.tramos, 2);
  assert.ok(Math.abs(dos.carrera - 2 * TRAMO.carrera) < 1e-9);
  // Y a partir de ocho metros deja de ser una escalera: doce tramos son 26 m de
  // carrera, o sea seis celdas y media de galería dedicadas a bajar.
  assert.equal(conexionDe(SALTO_POZO).tipo, "pozo");
  assert.equal(conexionDe(12).tipo, "pozo");
  assert.equal(conexionDe(SALTO_POZO - 0.01).tipo, "escalera");
});

// --- el plano excavado --------------------------------------------------------

test("el plano se excava entero y sin pasarse", () => {
  assert.equal(plan.medidas.celdas, 256);
  for (const pl of plan.plantas) {
    assert.equal(pl.suelo.size, pl.celdas, `la planta ${pl.cota} m`);
  }
  assert.deepEqual(plan.avisos, [], "el plano salió con avisos");
});

test("nada se excava en el margen de roca", () => {
  // Aquí todo es interior: una galería que llegue al borde de la rejilla no da
  // error de compilación —no hay `qbsp` que juzgue una malla—, deja un agujero
  // por el que se ve el color del fondo.
  for (const pl of plan.plantas) {
    for (const k of pl.suelo.keys()) {
      const [x, z] = k.split(",").map(Number);
      assert.ok(dentro(x, z), `la planta ${pl.cota} m pisa (${x},${z}), fuera del margen`);
    }
  }
  assert.ok(!dentro(0, 5) && !dentro(5, 0) && !dentro(ANCHO - 1, 5) && !dentro(5, FONDO - 1));
});

test("cada celda pisable pertenece a un tramo y solo a uno", () => {
  // Los índices de tramo se recalculan al tirar los tramos vacíos. Sin
  // recalcularlos, cada celda apunta al tramo del vecino: la altura libre y la
  // luz saldrían de otro sitio y todas las cifras seguirían cuadrando.
  for (const pl of plan.plantas) {
    const vistas = new Set();
    for (const t of pl.tramos) {
      for (const [x, z] of t.celdas) {
        const k = `${x},${z}`;
        assert.ok(!vistas.has(k), `(${x},${z}) está en dos tramos de la planta ${pl.cota} m`);
        vistas.add(k);
        assert.ok(pl.suelo.has(k), `(${x},${z}) está en un tramo y no en el suelo`);
      }
    }
    assert.equal(vistas.size, pl.suelo.size, `la planta ${pl.cota} m`);
    for (const k of pl.suelo.keys()) {
      const [x, z] = k.split(",").map(Number);
      const t = tramoDe(plan, pl.indice, x, z);
      assert.ok(t, `(${x},${z}) no tiene tramo`);
      assert.ok(
        t.celdas.some((c) => c[0] === x && c[1] === z),
        `(${x},${z}) apunta a un tramo que no la contiene`
      );
    }
  }
});

test("hay pasillo, cuarto y bóveda, y la bóveda se acerca al 16 % medido", () => {
  const cuenta = {};
  for (const pl of plan.plantas) {
    for (const t of pl.tramos) cuenta[t.tipo] = (cuenta[t.tipo] ?? 0) + t.celdas.length;
  }
  assert.ok(cuenta.pasillo > 0 && cuenta.cuarto > 0 && cuenta.boveda > 0, JSON.stringify(cuenta));
  // El pasillo manda: es el 55 % medido por debajo de tres metros. Una cueva de
  // altura uniforme no se parece a Gate City por muy bien que mida el total.
  assert.ok(cuenta.pasillo > cuenta.cuarto + cuenta.boveda, JSON.stringify(cuenta));
  const fraccion = cuenta.boveda / plan.medidas.celdas;
  assert.ok(
    fraccion > FRACCION_BOVEDA * 0.7 && fraccion < FRACCION_BOVEDA * 1.3,
    `bóveda al ${(fraccion * 100).toFixed(1)} %, y la medida pide ${FRACCION_BOVEDA * 100} %`
  );
});

test("la ciudad ocupa la huella que la medida le dio", () => {
  // Es el fallo que el relleno global NO caza: 256 celdas apiñadas en una esquina
  // y 256 repartidas dan exactamente el mismo 31 %. Lo cazó el dibujo, y esto es
  // esa mirada puesta en una cifra.
  assert.ok(plan.medidas.cobertura.x > 0.7, `ancho cubierto ${plan.medidas.cobertura.x}`);
  assert.ok(plan.medidas.cobertura.z > 0.7, `fondo cubierto ${plan.medidas.cobertura.z}`);
});

test("las cavernas caen donde hay pueblo, no donde tocó primero", () => {
  // La planta de −14 es el grueso del jharro: 104 de las 256 celdas. Con un saldo
  // global de bóveda por orden de llegada se lo gastaban las dos primeras plantas
  // excavadas y la principal se quedaba entera de techo bajo, sin que cambiara el
  // total de bóveda ni ninguna otra cifra.
  const grande = plan.plantas.find((p) => p.cota === -14);
  const boveda = grande.tramos.filter((t) => t.tipo === "boveda")
    .reduce((a, t) => a + t.celdas.length, 0);
  assert.ok(boveda > 0, "la planta principal del jharro no tiene ni una bóveda");
});

// --- la excavación es determinista -------------------------------------------

test("el mismo plano sale igual dos veces, y distinto con otra semilla", () => {
  // Sin esto no se puede comparar nada con lo de ayer, ni casar lo que se dibuja
  // con lo que se construye: son dos programas distintos leyendo el mismo plano.
  const a = planJharro();
  const b = planJharro();
  const huella = (p) => p.plantas.map((pl) => [...pl.suelo.keys()].sort().join("|")).join("#");
  assert.equal(huella(a), huella(b));
  assert.notEqual(huella(a), huella(planJharro({ semilla: 99 })), "la semilla no hace nada");
  const r1 = azar(7), r2 = azar(7);
  assert.equal(r1(), r2());
});

// --- LA comprobación: se llega a todo ----------------------------------------

test("se llega desde la entrada a todo lo pisable de las ocho plantas", () => {
  const vistas = alcanzables(plan);
  const fuera = aisladas(plan, vistas);
  assert.equal(
    fuera.length, 0,
    `${fuera.length} celdas sueltas: ` + fuera.slice(0, 5).map((c) => `p${c.planta}(${c.x},${c.z})`).join(" ")
  );
  assert.equal(vistas.size, plan.medidas.celdas);
  // Y se toca cada planta: que el total cuadre no dice que la planta del fondo
  // se visite, porque el total lo llena la planta grande.
  for (const pl of plan.plantas) {
    const suyas = [...pl.suelo.keys()].filter((k) => vistas.has(`${pl.indice},${k}`));
    assert.equal(suyas.length, pl.suelo.size, `la planta ${pl.cota} m`);
  }
});

test("EL CONTROL: quitar una conexión deja una planta suelta", () => {
  // Una sonda sin control es una sonda que dice que sí. Si `alcanzables()` no
  // usara de verdad las aristas verticales —si inundara plantas por separado y
  // las sumara— la comprobación de arriba saldría en verde con el jharro partido
  // en ocho trozos sin una sola escalera.
  assert.ok(plan.enlaces.length >= 7, `solo hay ${plan.enlaces.length} conexiones`);
  for (let i = 0; i < plan.enlaces.length; i++) {
    const vistas = alcanzables(plan, undefined, [i]);
    const e = plan.enlaces[i];
    assert.ok(
      vistas.size < plan.medidas.celdas,
      `sin la ${e.tipo} de ${e.arriba.planta} a ${e.abajo.planta} se sigue llegando a todo`
    );
    // Y lo que se pierde es al menos la planta de abajo entera: una conexión que
    // solo aislara dos celdas sería un atajo, no el único paso.
    const abajo = plan.plantas[e.abajo.planta];
    const quedan = [...abajo.suelo.keys()].filter((k) => vistas.has(`${abajo.indice},${k}`)).length;
    assert.ok(quedan < abajo.suelo.size, `la planta ${abajo.cota} m sigue entera sin su conexión`);
  }
});

test("una inundación que empieza fuera del suelo no alcanza nada", () => {
  // El camino de error, ejercitado: si una entrada mal puesta devolviera el mapa
  // entero, la comprobación de arriba no distinguiría un plano bueno de uno con
  // la entrada en mitad de la roca.
  assert.equal(alcanzables(plan, { planta: ENTRADA_PLANTA, celda: [0, 0] }).size, 0);
  assert.equal(distancias(plan, { planta: 0, celda: [0, 0] }).size, 0);
});

test("la entrada está en la planta de arriba y se pisa", () => {
  assert.ok(transitable(plan, ENTRADA_PLANTA, ENTRADA[0], ENTRADA[1]), "la entrada es roca");
  assert.equal(ENTRADA[1], MARGEN, "la entrada no está en el borde norte");
});

test("las distancias a la entrada son coherentes con lo que se alcanza", () => {
  const d = distancias(plan);
  const vistas = alcanzables(plan);
  assert.equal(d.size, vistas.size);
  assert.equal(d.get(`${ENTRADA_PLANTA},${ENTRADA[0]},${ENTRADA[1]}`), 0);
  // Ninguna celda queda a distancia infinita, y la más lejana está de verdad
  // lejos: si todo estuviera a tres pasos, el jharro sería una sala.
  const max = Math.max(...d.values());
  assert.ok(max > 20, `la celda más lejana está a ${max} pasos`);
});

// --- las conexiones verticales, como geometría futura ------------------------

test("cada conexión cabe: corre en línea recta sobre roca, no sobre su propio suelo", () => {
  // Una escalera que baja por encima del pasillo del que sale es un agujero en
  // ese pasillo. Es el aviso de siempre —abrir un hueco en un muro deja el hueco
  // sin suelo— puesto del revés, en el techo.
  for (const e of plan.enlaces) {
    const [ax, az] = e.arriba.celda;
    const [bx, bz] = e.abajo.celda;
    const [dx, dz] = e.dir;
    assert.equal(bx, ax + dx * e.corrida, `${e.tipo}: la corrida en x no cuadra`);
    assert.equal(bz, az + dz * e.corrida, `${e.tipo}: la corrida en z no cuadra`);
    assert.ok(Math.abs(dx) + Math.abs(dz) === 1, "la conexión no va en línea recta");
    const arriba = plan.plantas[e.arriba.planta];
    for (let k = 1; k <= e.corrida; k++) {
      const x = ax + dx * k, z = az + dz * k;
      assert.ok(dentro(x, z), `la ${e.tipo} sale del margen en (${x},${z})`);
      assert.ok(
        !arriba.suelo.has(`${x},${z}`),
        `la ${e.tipo} de ${arriba.cota} m pasa por encima de su propio suelo en (${x},${z})`
      );
    }
    // Los dos extremos se pisan, cada uno en su planta.
    assert.ok(transitable(plan, e.arriba.planta, ax, az));
    assert.ok(transitable(plan, e.abajo.planta, bx, bz));
    // Y el salto que salva es el que hay entre las dos bandas medidas.
    assert.equal(e.salto, plan.plantas[e.arriba.planta].cota - plan.plantas[e.abajo.planta].cota);
  }
});

test("las conexiones encadenan las ocho plantas sin saltarse ninguna", () => {
  // Siete aristas para ocho plantas, y cada una une dos bandas contiguas: si una
  // uniera la de arriba con la del fondo, la escalera mediría treinta metros y
  // habría dos plantas a las que solo se llega de rebote.
  assert.equal(plan.enlaces.length, PLANTAS.length - 1);
  const vistas = new Set([ENTRADA_PLANTA]);
  for (const e of plan.enlaces) {
    assert.equal(e.arriba.planta, e.abajo.planta + 1, "une bandas no contiguas");
    vistas.add(e.abajo.planta);
  }
  assert.equal(vistas.size, PLANTAS.length);
});

// --- las piezas sueltas de la excavación -------------------------------------

test("el hueco por delante cuenta el margen como ocupado", () => {
  // Es lo que separa la excavación del borde sin escribir ninguna regla de «no te
  // acerques»: hacia el borde no hay hueco, así que no se crece para allá.
  const suelo = new Map();
  assert.equal(hueco(MARGEN, 5, 1, suelo), 0, "hacia el oeste desde el margen hay hueco");
  assert.ok(hueco(MARGEN, 5, 0, suelo) > 0, "hacia el este no hay hueco");
  suelo.set(`${MARGEN + 2},5`, 0);
  assert.equal(hueco(MARGEN, 5, 0, suelo), 1, "no se para al chocar con suelo ya excavado");
});
