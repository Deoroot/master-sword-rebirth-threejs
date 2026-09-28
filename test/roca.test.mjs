// La roca del jharro, comprobada.
//
// Dos condiciones mandan aquí, y las dos se comprueban midiendo la GEOMETRÍA y
// no el plano:
//
//   la altura libre  tiene que dar los percentiles que se midieron de Gate City,
//                    medida con el mismo algoritmo con que se midió Gate City.
//                    Leerla del plano —«el tramo dice 2,8, luego la mediana es
//                    2,8»— sería comprobar que una variable vale lo que vale.
//   la costura       una sola función decide si dos plantas caben una sobre
//                    otra, y la preguntan los dos lados. La comprobación lleva su
//                    control: con la veta quitada, el conflicto aparece.

import { test } from "node:test";
import assert from "node:assert/strict";
import { CELDA } from "../src/kit/house.js";
import {
  planJharro, PLANTAS, PASO_LIBRE, SEPARACION, GRUESO_ROCA, ALTURA_LIBRE_MEDIDA,
  cotaMundo, plantaEncima, chocaConOtraPlanta, transitable, excavar, dentro,
} from "../src/kit/jharro.js";
import {
  generarRoca, repartirAlturas, libreEn, alturaLibreObjetivo, celdasTunel,
  cotaTunel, esquina, paredesFinas, ALTO_TUNEL, GAMMA, REPISA,
} from "../src/kit/roca.js";
import { alturaLibre, superficie, triangulos, normalDe, percentiles } from "../src/kit/medir.js";

const plan = planJharro();
const roca = generarRoca(plan);
const medida = alturaLibre(roca.malla);

// --- la curva medida ----------------------------------------------------------

test("la curva de altura libre devuelve lo medido en los puntos medidos", () => {
  for (const [q, v] of ALTURA_LIBRE_MEDIDA) {
    assert.ok(Math.abs(alturaLibreObjetivo(q) - v) < 1e-9, `q=${q} da ${alturaLibreObjetivo(q)}`);
  }
  // Y plana fuera del rango medido: extrapolar sería inventarse la cola.
  assert.equal(alturaLibreObjetivo(0), ALTURA_LIBRE_MEDIDA[0][1]);
  assert.equal(alturaLibreObjetivo(1), ALTURA_LIBRE_MEDIDA.at(-1)[1]);
  assert.equal(alturaLibreObjetivo(-5), ALTURA_LIBRE_MEDIDA[0][1]);
  // Monótona: si no, un tramo más alto en la curva saldría más bajo en el mundo.
  let previo = -Infinity;
  for (let q = 0; q <= 1; q += 0.01) {
    const v = alturaLibreObjetivo(q);
    assert.ok(v >= previo - 1e-9, `la curva baja en q=${q}`);
    previo = v;
  }
});

test("el reparto da techo a todos los tramos, y ninguno por debajo del paso", () => {
  const { alturas, total } = repartirAlturas(plan);
  let tramos = 0;
  for (const pl of plan.plantas) {
    pl.tramos.forEach((t, i) => {
      const h = alturas.get(`${pl.indice},${i}`);
      assert.ok(typeof h === "number", `el tramo ${i} de la planta ${pl.cota} m no tiene techo`);
      assert.ok(h >= PASO_LIBRE, `${h} m de techo: por ahí no se pasa`);
      tramos++;
    });
  }
  assert.equal(tramos, alturas.size);
  assert.equal(total, plan.medidas.celdas);
});

test("el pasillo se lleva el techo bajo y la caverna el alto, y no al revés", () => {
  // Es lo que hace legible una cueva: el CONTRASTE. Repartir la misma curva al
  // azar daría los mismos percentiles y una caverna de nueve metros en mitad de
  // un pasillo, o sea un sitio que mide bien y no se entiende.
  const { alturas } = repartirAlturas(plan);
  const por = { pasillo: [], cuarto: [], boveda: [] };
  for (const pl of plan.plantas) {
    pl.tramos.forEach((t, i) => por[t.tipo].push(alturas.get(`${pl.indice},${i}`)));
  }
  const med = (v) => percentiles(v).mediana;
  assert.ok(med(por.pasillo) < med(por.cuarto), "el pasillo no es más bajo que el cuarto");
  assert.ok(med(por.cuarto) < med(por.boveda), "el cuarto no es más bajo que la bóveda");
  // Y ninguna bóveda es más baja que el pasillo más alto: el orden es estricto.
  assert.ok(Math.min(...por.boveda) >= Math.max(...por.pasillo) - 1e-9);
});

// --- LA condición: los percentiles medidos ------------------------------------

test("la altura libre del jharro da los percentiles medidos de Gate City", () => {
  // Con la tolerancia dicha, y la única que se sale es el p10: ver la prueba
  // siguiente, que lo mide a propósito en vez de esconderlo en una holgura.
  const dentroDe = (nombre, objetivo, holgura) => {
    const v = medida[nombre];
    assert.ok(
      Math.abs(v - objetivo) <= holgura,
      `${nombre}: ${v.toFixed(2)} m, y Gate City mide ${objetivo} ±${holgura}`
    );
  };
  dentroDe("p25", 2.3, 0.4);
  dentroDe("mediana", 2.8, 0.4);
  dentroDe("p75", 4.9, 0.6);
  dentroDe("p90", 9.3, 0.8);
  assert.ok(
    Math.abs(medida.bajo3 - 0.55) < 0.07,
    `${(medida.bajo3 * 100).toFixed(0)} % por debajo de 3 m, y lo medido es el 55 %`
  );
  assert.ok(
    Math.abs(medida.sobre8 - 0.16) < 0.06,
    `${(medida.sobre8 * 100).toFixed(0)} % por encima de 8 m, y lo medido es el 16 %`
  );
});

test("el p10 no llega, y la cifra queda escrita en vez de disimulada", () => {
  // Gate City mide 0,8 m de p10: una décima parte de sus pares suelo-techo están
  // por debajo del metro. Esos no son sitios por donde se ande —el jugador mide
  // 2,2 m de paso— son salientes y vigas sobre un suelo que sí se pisa, y aquí se
  // reproducen con repisas. Con repisa en TODAS las celdas de techo bajo que
  // tienen pared, el p10 se queda en 1,2 m. Bajarlo hasta 0,8 pediría plantar
  // todos los salientes a ochenta centímetros clavados, que ya no es reproducir
  // una curva medida sino forzar un número.
  //
  // Esta prueba existe para que el día que alguien cambie las repisas se entere
  // de en qué dirección se mueve eso, no para dar nada por bueno.
  assert.ok(medida.p10 > 0.85 && medida.p10 < 1.6, `p10 = ${medida.p10.toFixed(2)} m`);
});

test("la calibración de la medida está puesta, y sin ella se nota", () => {
  // GAMMA corrige el sesgo del propio método de medida —cada cara se reparte por
  // su caja, así que el techo bajo de al lado le baja la cifra a la caverna—.
  // Con GAMMA = 1 el jharro sale medio metro más bajo de mediana y metro y pico
  // más bajo de p90. Si alguien lo pone a 1 pensando que sobra, esto lo dice.
  assert.ok(GAMMA < 1, "la calibración está desactivada");
  const crudo = alturaLibre(generarRoca(plan, { gamma: 1 }).malla);
  assert.ok(
    crudo.mediana < medida.mediana - 0.1,
    `sin calibrar da ${crudo.mediana} y calibrado ${medida.mediana}: la calibración no hace nada`
  );
  assert.ok(crudo.p90 < medida.p90 - 0.5, "sin calibrar el p90 no baja: la calibración no hace nada");
});

test("está todo cubierto, como en el mapa medido", () => {
  // Gate City cubre el 107 % de su suelo. Un jharro con el 60 % de techo tiene el
  // 40 % del pueblo al aire libre, y eso ya no es un jharro.
  const s = superficie(roca.malla);
  assert.ok(s.cubierto > 0.95, `solo se cubre el ${(s.cubierto * 100).toFixed(0)} % del suelo`);
  assert.ok(s.pared > s.suelo, "hay menos pared que suelo: esto no es un interior");
});

// --- la costura ---------------------------------------------------------------

test("LA COSTURA: ninguna celda es suelo de dos plantas que no caben", () => {
  // Dos suelos a dos metros dejan 1,4 m de aire una vez puesta la losa de roca.
  // Eso no es un pasillo: es un hueco. Y no da error de nada — sella igual,
  // mide igual y se dibuja igual planta por planta.
  for (let a = 0; a < plan.plantas.length; a++) {
    for (let b = a + 1; b < plan.plantas.length; b++) {
      const pa = plan.plantas[a], pb = plan.plantas[b];
      if (Math.abs(pa.cota - pb.cota) >= SEPARACION) continue;
      for (const k of pa.suelo.keys()) {
        assert.ok(
          !pb.suelo.has(k),
          `(${k}) es suelo de ${pa.cota} m y de ${pb.cota} m, y entre las dos hay ` +
            `${Math.abs(pa.cota - pb.cota)} m`
        );
      }
    }
  }
});

test("EL CONTROL DE LA COSTURA: sin la veta, el conflicto aparece", () => {
  // Una sonda sin control es una sonda que dice que sí. Se excava una planta a la
  // cota de otra SIN preguntar a la función de la costura, y tiene que chocar:
  // si no chocara, la prueba de arriba estaría en verde por casualidad —porque
  // las plantas no se solapan nunca— y no porque la veta funcione.
  const grande = plan.plantas.find((p) => p.cota === -14);
  const suelta = excavar({
    celdas: 40,
    semilla: 12345,
    ancla: [...grande.suelo.keys()][0].split(",").map(Number),
    presupuesto: { boveda: 0 },
    // sin veta
  });
  const choques = [...suelta.suelo.keys()].filter((k) => grande.suelo.has(k)).length;
  assert.ok(choques > 0, "excavar sin veta sobre la misma planta no choca ni una celda");
  // Y la función de la costura lo dice: es la que se le quitó.
  const [cx, cz] = [...grande.suelo.keys()][0].split(",").map(Number);
  assert.equal(chocaConOtraPlanta(plan.plantas, cx, cz, grande.cota), true);
  assert.equal(chocaConOtraPlanta(plan.plantas, cx, cz, grande.cota + SEPARACION), false);
});

test("donde hay otra planta encima, el techo se queda a un grueso de losa", () => {
  // Y lo decide la misma función que dejó excavar la celda. Con dos copias del
  // criterio, tocar el grueso en un sitio mete la bóveda de una planta dentro del
  // suelo de la otra: dos superficies en el mismo volumen, que parpadean.
  const { alturas } = repartirAlturas(plan);
  let comprobadas = 0;
  for (const pl of plan.plantas) {
    for (const k of pl.suelo.keys()) {
      const [x, z] = k.split(",").map(Number);
      const arriba = plantaEncima(plan, pl.indice, x, z);
      if (!arriba) continue;
      comprobadas++;
      const h = libreEn(plan, alturas, pl.indice, x, z);
      const hueco = arriba.cota - pl.cota - GRUESO_ROCA;
      assert.ok(h <= hueco + 1e-9, `${h} m de techo y solo hay ${hueco} hasta ${arriba.cota}`);
      assert.ok(h >= PASO_LIBRE, `la losa deja ${h} m: por ahí no se pasa`);
    }
  }
  assert.ok(comprobadas > 0, "no hay ni una celda con otra planta encima: esto no prueba nada");
});

// --- la geometría emitida -----------------------------------------------------

test("cada celda pisable lleva un suelo y una bóveda, ni cero ni dos", () => {
  // Dos losas en el mismo sitio no dan error: dan z-fighting, que parpadea al
  // moverse y un fotograma fijo no lo caza. Cero losas dan un agujero por el que
  // se cae para siempre, porque aquí por debajo de las mallas no hay mundo.
  assert.equal(roca.cuenta.suelos, plan.medidas.celdas);
  assert.equal(roca.cuenta.bovedas, plan.medidas.celdas);
  // Y contado sobre la malla, no sobre el contador: el contador puede mentir.
  const porCota = new Map();
  for (const t of triangulos(roca.malla)) {
    const n = normalDe(t);
    if (n[1] <= 0.7) continue;
    const y = t[0][1];
    if (Math.abs(t[1][1] - y) > 1e-6 || Math.abs(t[2][1] - y) > 1e-6) continue; // rampa
    // Solo las losas de celda entera: los trozos de rampa miden medio metro y
    // caen dentro de celdas del túnel, que no son de ninguna planta.
    const anchoT = Math.max(...t.map((p) => p[0])) - Math.min(...t.map((p) => p[0]));
    const fondoT = Math.max(...t.map((p) => p[2])) - Math.min(...t.map((p) => p[2]));
    if (Math.abs(anchoT - CELDA) > 1e-6 || Math.abs(fondoT - CELDA) > 1e-6) continue;
    const cx = t.reduce((a, p) => a + p[0], 0) / 3;
    const cz = t.reduce((a, p) => a + p[2], 0) / 3;
    const k = `${Math.floor(cx / CELDA)},${Math.floor(-cz / CELDA)},${y.toFixed(3)}`;
    porCota.set(k, (porCota.get(k) ?? 0) + 1);
  }
  // Dos triángulos por losa, uno por celda: nunca cuatro.
  for (const [k, n] of porCota) {
    assert.ok(n <= 2, `${n / 2} losas de suelo en la misma celda y cota: ${k}`);
  }
});

test("cada lado que da a roca tiene su pared, y mira hacia dentro", () => {
  // La normal la calcula `quad()` del propio polígono, así que un despiste en el
  // orden de las esquinas no deja una cara negra: deja una pared del revés, que
  // desde dentro no se ve y por la que se ve el color del fondo, porque aquí por
  // debajo de las mallas no hay mundo.
  //
  // La pregunta es por LADO y no por triángulo, y esa fue la segunda versión de
  // esta sonda. La primera recorría los triángulos que caían dentro de la celda
  // y exigía que todos miraran hacia dentro, y acusaba a quien no era: las
  // paredes de los túneles y las de las galerías de otra planta caen justo en la
  // misma junta y miran, con toda la razón, hacia su propio lado. Lo que hay que
  // exigir no es que no haya caras mirando afuera, es que cada lado que da a roca
  // tenga AL MENOS UNA mirando adentro.
  const caras = [...triangulos(roca.malla)]
    .map((t) => ({ t, n: normalDe(t), c: [0, 1, 2].map((i) => t.reduce((a, p) => a + p[i], 0) / 3) }))
    .filter((o) => Math.abs(o.n[1]) <= 0.7);
  const { alturas } = repartirAlturas(plan);
  // Las bocas de túnel: ahí la pared es solo el dintel, porque por debajo está el
  // hueco por el que se entra. Y si el túnel es MÁS alto que la galería de la que
  // sale, no hay dintel que poner: el escalón mira al túnel.
  const bocas = new Map();
  for (const e of plan.enlaces) {
    const [dx, dz] = e.dir;
    bocas.set(`${e.arriba.planta},${e.arriba.celda},${dx},${dz}`, cotaMundo(e.arriba.planta) + ALTO_TUNEL);
    bocas.set(`${e.abajo.planta},${e.abajo.celda},${-dx},${-dz}`, cotaMundo(e.abajo.planta) + ALTO_TUNEL);
  }
  let lados = 0;
  let sinPared = [];
  for (const pl of plan.plantas) {
    const y0 = cotaMundo(pl.indice);
    for (const k of pl.suelo.keys()) {
      const [x, z] = k.split(",").map(Number);
      const y1 = y0 + libreEn(plan, alturas, pl.indice, x, z);
      const [wx, wz] = esquina(x, z);
      const centro = [wx + CELDA / 2, wz - CELDA / 2];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (transitable(plan, pl.indice, x + dx, z + dz)) continue;
        // El plano de esa junta, y el trozo de altura que hay que tapar.
        const planoX = dx === 1 ? wx + CELDA : dx === -1 ? wx : null;
        const planoZ = dz === 1 ? wz - CELDA : dz === -1 ? wz : null;
        const boca = bocas.get(`${pl.indice},${[x, z]},${dx},${dz}`);
        // Por debajo del techo del túnel no hay pared: hay entrada.
        const desde = boca ?? y0;
        if (boca !== undefined && y1 <= boca + 1e-6) continue;
        lados++;
        const ok = caras.some((o) => {
          if (planoX !== null && Math.abs(o.c[0] - planoX) > 1e-6) return false;
          if (planoZ !== null && Math.abs(o.c[2] - planoZ) > 1e-6) return false;
          if (planoX !== null && Math.abs(o.c[2] - centro[1]) > CELDA / 2) return false;
          if (planoZ !== null && Math.abs(o.c[0] - centro[0]) > CELDA / 2) return false;
          if (o.c[1] < desde - 1e-6 || o.c[1] > y1 + 1e-6) return false;
          // Y mirando hacia dentro de esta celda.
          //
          // El eje Z está del revés entre el plano y el mundo: la fila z+1 es la
          // de más al sur y el mundo crece hacia −Z al bajar de fila. Así que la
          // normal que mira hacia dentro por el lado sur es +Z, no −Z. Escrito
          // sin traducir, esta sonda acusaba a 217 paredes de 438 —todas las de
          // norte y sur, ninguna de este y oeste— de mirar al revés, y las
          // paredes estaban bien. Es el mismo eje que ya giró media vuelta las
          // doce casas de Corinth.
          return o.n[0] * -dx + o.n[2] * dz > 0.5;
        });
        if (!ok) sinPared.push(`p${pl.cota}(${x},${z}) hacia ${dx},${dz}`);
      }
    }
  }
  assert.ok(lados > 300, `solo se miraron ${lados} lados`);
  assert.deepEqual(sinPared.slice(0, 5), [], `${sinPared.length} lados de ${lados} sin pared hacia dentro`);
});

test("las juntas sin roca entre dos plantas están medidas, no escondidas", () => {
  // Cuando una caverna sube por encima del suelo de otra planta en la columna de
  // al lado, las dos galerías quedan pegadas por una hoja de papel. Cada una ve
  // su pared, así que no es un agujero; pero son dos sitios del pueblo separados
  // por cero centímetros de roca. Esto fija cuántas hay para que no crezcan solas.
  const juntas = paredesFinas(plan, repartirAlturas(plan).alturas);
  assert.ok(
    juntas.length < 40,
    `${juntas.length} juntas sin roca: ` +
      juntas.slice(0, 3).map((j) => `p${j.planta}(${j.x},${j.z})~p${j.otra}`).join(" ")
  );
});

test("las repisas no tapan el paso", () => {
  // Una repisa es un saliente de roca a metro y pico, o sea justo a la altura de
  // la cabeza. Vuela 0,9 m de los 4 de la celda: quedan 3,1 m libres, y el
  // jugador mide uno. Si alguien la engorda, esto lo dice antes de que un cuerpo
  // se quede clavado en un pasillo sin que falle ninguna otra cifra.
  assert.ok(REPISA.fondo < CELDA / 2 - 0.5, `la repisa vuela ${REPISA.fondo} de ${CELDA} m`);
  assert.ok(roca.cuenta.repisas > 0, "no hay ni una repisa: la cola baja no viene de ningún sitio");
});

// --- los túneles ---------------------------------------------------------------

test("cada túnel empieza donde acaba una planta y acaba donde empieza la otra", () => {
  for (const e of plan.enlaces) {
    const yArriba = cotaMundo(e.arriba.planta);
    const yAbajo = cotaMundo(e.abajo.planta);
    assert.ok(Math.abs(cotaTunel(e, 0, yArriba, yAbajo) - yArriba) < 1e-9, `${e.tipo} arranca torcido`);
    assert.ok(
      Math.abs(cotaTunel(e, e.corrida * CELDA, yArriba, yAbajo) - yAbajo) < 1e-9,
      `${e.tipo} no llega a la cota de abajo`
    );
    // El túnel son las celdas de EN MEDIO: el pie es de la planta de abajo, y esa
    // frontera es la costura de esta parte.
    assert.equal(celdasTunel(e).length, e.corrida - 1);
    const ultima = celdasTunel(e).at(-1);
    const [bx, bz] = e.abajo.celda;
    assert.deepEqual(
      [ultima.x + e.dir[0], ultima.z + e.dir[1]], [bx, bz],
      "la última celda del túnel no da al pie"
    );
    for (const c of celdasTunel(e)) {
      for (const pl of plan.plantas) {
        assert.ok(!pl.suelo.has(`${c.x},${c.z}`), `la celda (${c.x},${c.z}) es túnel y suelo a la vez`);
      }
    }
  }
});

test("las rampas bajan con la pendiente de la pieza del pack, y se pueden bajar", () => {
  // La rampa lleva encima la escalera de piedra del pack, así que tiene que tener
  // SU pendiente: más tendida deja los escalones flotando al principio, más
  // empinada los entierra al final. Y de paso, el controlador admite 46°.
  for (const e of plan.enlaces) {
    if (e.tipo !== "escalera") continue;
    const grados = (Math.atan(e.salto / e.carrera) * 180) / Math.PI;
    assert.ok(grados < 46, `la rampa de ${e.salto} m baja ${grados.toFixed(1)}°`);
    assert.ok(
      Math.abs(grados - 24.94) < 0.6,
      `la rampa baja ${grados.toFixed(2)}° y la pieza del pack baja 24,94°`
    );
    // Y la carrera cabe en el túnel: si no, la escalera se sale por el otro lado.
    assert.ok(e.carrera <= e.corrida * CELDA + 1e-9, `${e.carrera} m de escalera en ${e.corrida} celdas`);
  }
});

test("un pozo no es una rampa disfrazada", () => {
  // Doce metros repartidos en una celda serían 72° de cuesta: el controlador
  // admite 46, así que el jugador no bajaría, resbalaría. Por eso a partir de
  // ocho metros la conexión deja de ser escalera.
  for (const e of plan.enlaces) {
    if (e.tipo !== "pozo") continue;
    const yArriba = cotaMundo(e.arriba.planta);
    const yAbajo = cotaMundo(e.abajo.planta);
    // El suelo de un pozo es el fondo desde el primer metro: no hay cuesta.
    assert.equal(cotaTunel(e, 0.5, yArriba, yAbajo), yAbajo);
    assert.ok(e.salto >= 8, `un pozo de ${e.salto} m`);
  }
});

test("nada queda flotando fuera del mundo", () => {
  // Un vértice a cien metros no da error: da un triángulo que cruza el jharro de
  // punta a punta y que en una captura de cerca no se ve.
  const alto = cotaMundo(PLANTAS.length - 1) + 12;
  const bajo = cotaMundo(0) - 2;
  for (const t of triangulos(roca.malla)) {
    for (const p of t) {
      assert.ok(p[1] >= bajo && p[1] <= alto, `un vértice a ${p[1].toFixed(1)} m`);
      assert.ok(p[0] >= 0 && p[0] <= 24 * CELDA, `un vértice en x=${p[0]}`);
      assert.ok(p[2] <= 0 && p[2] >= -34 * CELDA, `un vértice en z=${p[2]}`);
    }
  }
});

test("la roca sale igual dos veces", () => {
  const a = generarRoca(plan);
  assert.equal(a.malla.pos.length, roca.malla.pos.length);
  assert.equal(a.malla.pos.join(","), roca.malla.pos.join(","));
});
