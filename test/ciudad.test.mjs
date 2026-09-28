// Lo construido del jharro, comprobado.
//
// El colocador de Corinth tenía una comprobación que lo sostenía todo: que las
// puertas dieran a la calle, medida EN LA PUERTA YA COLOCADA y no en el criterio
// que la giró. Aquí hace la misma falta y por el mismo motivo —el eje Z está del
// revés entre el plano y el mundo— con un agravante: en Corinth una casa girada
// media vuelta se ve desde fuera, y aquí la casa está metida en la roca, así que
// una fachada girada media vuelta enseña su puerta A LA ROCA y desde la galería
// no se ve nada raro: se ve una pared.

import { test } from "node:test";
import assert from "node:assert/strict";
import { CELDA, ALTURA_MURO } from "../src/kit/house.js";
import {
  planJharro, transitable, alcanzables, cotaMundo, tramoDe,
} from "../src/kit/jharro.js";
import { repartirAlturas, libreEn, generarRoca } from "../src/kit/roca.js";
import {
  montarCiudad, sitiosDeFachada, elegirFachadas, piezasDeFachada, juntasDeFachada,
  FACHADAS, CARA_DE, HOLGURA,
} from "../src/kit/ciudad.js";
import { superficie, triangulos, normalDe } from "../src/kit/medir.js";

const plan = planJharro();
const { alturas } = repartirAlturas(plan);
const ciudad = montarCiudad(plan, { alturas });

test("hay pueblo, y está repartido por varias plantas", () => {
  assert.ok(ciudad.fachadas.length > 30, `solo ${ciudad.fachadas.length} fachadas`);
  assert.ok(
    Object.keys(ciudad.medidas.porPlanta).length >= 4,
    `lo construido está en ${Object.keys(ciudad.medidas.porPlanta).length} plantas`
  );
});

test("cada fachada está metida en roca libre, no en un sitio que se pisa", () => {
  // Una casa metida en una celda que es suelo de otra planta es una casa dentro
  // de una galería: dos cosas en el mismo volumen, que parpadean.
  for (const f of ciudad.fachadas) {
    const [nx, nz] = f.hueco;
    for (const pl of plan.plantas) {
      assert.ok(
        !pl.suelo.has(`${nx},${nz}`),
        `la fachada de p${f.planta}(${f.x},${f.z}) se mete en (${nx},${nz}), que es suelo de ${pl.cota} m`
      );
    }
    assert.ok(!plan.reservadas.has(`${nx},${nz}`), `se mete en el túnel de (${nx},${nz})`);
    assert.ok(transitable(plan, f.planta, f.x, f.z), "la fachada no da a una galería");
  }
});

test("no hay dos casas en el mismo agujero", () => {
  const huecos = new Set();
  for (const f of ciudad.fachadas) {
    const k = `${f.hueco[0]},${f.hueco[1]}`;
    assert.ok(!huecos.has(k), `dos fachadas en la celda de roca (${k})`);
    huecos.add(k);
  }
});

test("a todas las casas se llega desde la entrada", () => {
  // Es la comprobación del experimento 02 aplicada a esto: una casa a la que no
  // se puede ir no existe, por muy bien que se vea en una captura.
  const vistas = alcanzables(plan);
  for (const f of ciudad.fachadas) {
    assert.ok(
      vistas.has(`${f.planta},${f.x},${f.z}`),
      `a la fachada de p${f.planta}(${f.x},${f.z}) no se llega`
    );
  }
});

test("ninguna fachada atraviesa el techo de su galería", () => {
  // La pieza de muro mide 3 m justos y una galería puede medir 2,2, porque así lo
  // dice la curva medida. Una fachada de tres metros en un pasillo de 2,2 le
  // saca ochenta centímetros de casa a la roca y le mete el techo por la puerta.
  // De frente se ve una casa perfectamente normal.
  for (const f of ciudad.fachadas) {
    const libre = libreEn(plan, alturas, f.planta, f.x, f.z);
    assert.ok(
      libre >= ALTURA_MURO + HOLGURA,
      `fachada en p${f.planta}(${f.x},${f.z}) con ${libre.toFixed(2)} m de techo`
    );
  }
});

test("lo construido está donde hay sitio: en las salas, no en los pasillos", () => {
  // No es una preferencia: es lo que midió Gate City —el 54 % es roca cruda y lo
  // construido no llega a un tercio— y además es donde cabe una fachada de 3 m.
  for (const f of ciudad.fachadas) {
    const t = tramoDe(plan, f.planta, f.x, f.z);
    assert.notEqual(t.tipo, "pasillo", `hay una casa en un pasillo: p${f.planta}(${f.x},${f.z})`);
  }
});

test("LA PUERTA DA A LA GALERÍA, medida en la puerta ya colocada", () => {
  // Y no en el criterio que la giró, que es la diferencia entera. `house.js` llama
  // «sur» a su cara de z=0, que mira a +Z; el plano cuenta las filas de norte a
  // sur, o sea hacia −Z. Arrastrar los nombres sin traducir deja todas las
  // fachadas con la puerta contra la roca, y desde la galería se ve una pared
  // lisa: ni una cifra cambia y la captura enseña una pared de piedra, que es una
  // cosa perfectamente razonable de ver en una cueva.
  for (const f of ciudad.fachadas) {
    const piezas = piezasDeFachada(f, plan);
    const puerta = piezas.find((q) => q.papel.endsWith("puerta"));
    assert.ok(puerta, "la fachada no tiene puerta");
    // Hacia dónde mira la pieza: su +Z local, girado por su yaw.
    const mira = [Math.sin(puerta.giro), 0, Math.cos(puerta.giro)];
    // Y hacia dónde tendría que mirar: del hueco de roca a la galería. En el
    // mundo, la fila z+1 está en −Z, así que la traducción es (−dx, 0, +dz).
    const debe = [-f.dx, 0, f.dz];
    const punto = mira[0] * debe[0] + mira[2] * debe[2];
    assert.ok(
      punto > 0.99,
      `la puerta de p${f.planta}(${f.x},${f.z}) mira a ${mira.map((v) => v.toFixed(2))} ` +
        `y la galería está hacia ${debe}`
    );
    // Y además está EN la junta, no en mitad de la roca ni en mitad de la calle.
    const juntaX = f.dx !== 0 ? (f.dx > 0 ? (f.x + 1) * CELDA : f.x * CELDA) : null;
    const juntaZ = f.dz !== 0 ? (f.dz > 0 ? -(f.z + 1) * CELDA : -f.z * CELDA) : null;
    if (juntaX !== null) assert.ok(Math.abs(puerta.pos[0] - juntaX) < 1e-9, "la puerta no está en la junta");
    if (juntaZ !== null) assert.ok(Math.abs(puerta.pos[2] - juntaZ) < 1e-9, "la puerta no está en la junta");
    // Y a ras del suelo de su galería.
    assert.ok(Math.abs(puerta.pos[1] - cotaMundo(f.planta)) < 1e-9, "la puerta no apoya en el suelo");
  }
});

// --- la costura con la roca ---------------------------------------------------

test("LA COSTURA: la roca no emite pared donde la tapa una fachada", () => {
  // Dos superficies en el mismo plano no dan error: parpadean al moverse, y un
  // fotograma fijo no lo caza porque congela la pelea en un ganador.
  const sin = generarRoca(plan, { alturas });
  const con = generarRoca(plan, { alturas, juntas: ciudad.juntas });
  assert.equal(con.cuenta.fachadas, ciudad.fachadas.length);
  assert.ok(
    con.cuenta.paredes < sin.cuenta.paredes,
    `con fachadas se emiten ${con.cuenta.paredes} paredes y sin ellas ${sin.cuenta.paredes}`
  );
  assert.equal(sin.cuenta.paredes - con.cuenta.paredes, ciudad.fachadas.length);
});

test("y SÍ emite el dintel de encima, que es el resto del muro", () => {
  // Abrir un hueco en un muro deja el resto del muro. Una fachada mide 3 m y la
  // galería puede medir nueve: saltarse la pared entera deja seis metros de
  // agujero por encima de la casa, y por ahí se ve el color del fondo, porque
  // aquí por debajo de las mallas no hay mundo.
  const con = generarRoca(plan, { alturas, juntas: ciudad.juntas });
  const caras = [...triangulos(con.malla)]
    .map((t) => ({ n: normalDe(t), c: [0, 1, 2].map((i) => t.reduce((a, p) => a + p[i], 0) / 3) }))
    .filter((o) => Math.abs(o.n[1]) <= 0.7);
  let conDintel = 0;
  let sinDintel = [];
  for (const f of ciudad.fachadas) {
    const y = cotaMundo(f.planta);
    const yt = y + libreEn(plan, alturas, f.planta, f.x, f.z);
    if (yt <= y + ALTURA_MURO + 1e-6) continue; // no hay hueco que tapar
    const planoX = f.dx !== 0 ? (f.dx > 0 ? (f.x + 1) * CELDA : f.x * CELDA) : null;
    const planoZ = f.dz !== 0 ? (f.dz > 0 ? -(f.z + 1) * CELDA : -f.z * CELDA) : null;
    const hay = caras.some((o) => {
      if (planoX !== null && Math.abs(o.c[0] - planoX) > 1e-6) return false;
      if (planoZ !== null && Math.abs(o.c[2] - planoZ) > 1e-6) return false;
      return o.c[1] > y + ALTURA_MURO - 1e-6 && o.c[1] <= yt + 1e-6;
    });
    if (hay) conDintel++;
    else sinDintel.push(`p${f.planta}(${f.x},${f.z})`);
  }
  assert.ok(conDintel > 10, `solo ${conDintel} fachadas con hueco por encima`);
  assert.deepEqual(sinDintel.slice(0, 5), [], `${sinDintel.length} fachadas sin dintel`);
});

// --- las proporciones medidas -------------------------------------------------

test("lo construido no llega a un tercio de la superficie", () => {
  // La cifra de Gate City: el 54 % de su superficie es roca y tierra, y lo
  // construido —sillería, adoquín, madera— no llega a un tercio. Es un techo, no
  // un objetivo, y es la cifra que dice que esto es una cueva con casas y no un
  // pueblo con las paredes pintadas de roca.
  const roca = generarRoca(plan, { alturas, juntas: ciudad.juntas });
  const s = superficie(roca.malla);
  const total = s.suelo + s.techo + s.pared + ciudad.medidas.superficie;
  const parte = ciudad.medidas.superficie / total;
  assert.ok(parte < 1 / 3, `lo construido es el ${(parte * 100).toFixed(1)} % de la superficie`);
  assert.ok(parte > 0.02, `lo construido es solo el ${(parte * 100).toFixed(1)} %: no hay pueblo`);
});

test("se repite, no se varía: pocas piezas distintas y muchas puestas", () => {
  // Gate City coloca 101 adornos de solo 17 modelos, y 55 de sus 58 sprites son
  // el mismo fuego. Lo que llena un sitio no es tener muchas cosas distintas.
  assert.ok(
    ciudad.medidas.distintas <= 8,
    `${ciudad.medidas.distintas} piezas distintas: eso es un catálogo, no un pueblo`
  );
  assert.ok(ciudad.medidas.piezas / ciudad.medidas.distintas > 10, "se repite poco");
  // Y la casa corriente es mayoría, como en cualquier pueblo.
  const tipos = Object.entries(ciudad.medidas.porTipo).sort((a, b) => b[1] - a[1]);
  assert.equal(tipos[0][0], "casa");
  assert.ok(tipos[0][1] > ciudad.fachadas.length / 2);
});

test("todas las piezas que pide el catálogo son del kit", () => {
  // Y no de una lista aparte: lo que el pack no da se declara, no se supone.
  const nombres = new Set(ciudad.piezas.map((q) => q.pieza));
  const delCatalogo = new Set();
  for (const f of FACHADAS) {
    delCatalogo.add(f.muro);
    delCatalogo.add(f.puerta);
    if (f.ventana) delCatalogo.add(f.ventana);
  }
  for (const n of nombres) assert.ok(delCatalogo.has(n), `${n} no está en el catálogo`);
});

test("la traducción de lados está completa y es biyectiva", () => {
  const caras = Object.values(CARA_DE);
  assert.equal(Object.keys(CARA_DE).length, 4);
  assert.equal(new Set(caras).size, 4, "dos lados dan a la misma cara");
});

test("el mismo plano da la misma ciudad", () => {
  const otra = montarCiudad(plan, { alturas });
  assert.equal(otra.fachadas.length, ciudad.fachadas.length);
  assert.equal(
    otra.fachadas.map((f) => `${f.planta},${f.x},${f.z},${f.fachada}`).join("|"),
    ciudad.fachadas.map((f) => `${f.planta},${f.x},${f.z},${f.fachada}`).join("|")
  );
});

test("los sitios candidatos son más que las casas puestas", () => {
  // Si fueran los mismos, el colocador no estaría eligiendo nada: estaría
  // llenando todo lo que puede, y entonces la regla de «una por hueco» y la de
  // los pasillos no estarían haciendo nada.
  const sitios = sitiosDeFachada(plan, alturas);
  assert.ok(sitios.length > ciudad.fachadas.length, "se construye en todos los sitios posibles");
  assert.equal(elegirFachadas(sitios).length, ciudad.fachadas.length);
});
