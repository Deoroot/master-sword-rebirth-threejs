// La boca de la mazmorra, comprobada sin ojos.
//
// Aqui vive la geometria generada del proyecto, que es la que no tiene juez de
// serie: un .glb del pack ya viene bien hecho, pero una malla que calculo yo
// puede salir del reves, con agujeros, o con la escalera a media altura, y nada
// de eso da error.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  planBoca, generarRoca, generarTorno, alturaRoca, alturaTrinchera, enTrinchera,
  HONDO, TRAMO, TRAMOS, CRATER, TRINCHERA, PARCELA, PIEDRA, MADERA, labio,
} from "../src/kit/boca.js";
import { CELDA } from "../src/kit/house.js";
import { PARCELAS, rect } from "../src/kit/corinth.js";

const LADO = PARCELA.ancho * CELDA;
/** Lo que el jugador sube de un paso, en metros. Sale de src/play/player.js. */
const PASO_JUGADOR = 0.5;

test("la escalera llega exactamente al fondo, ni corta ni pasada", () => {
  // Es la comprobacion que justifica que el tamano de la parcela lo decidiera
  // una medida. Un escalon de mas deja la reja a 1 m de altura; uno de menos,
  // un peldano imposible al final.
  assert.equal(TRAMO.alto * TRAMOS, HONDO);
  const { piezas } = planBoca();
  const escalones = piezas.filter((p) => p.papel.startsWith("escalon"));
  assert.equal(escalones.length, TRAMOS);
  // Cada tramo se coloca por su punta BAJA, asi que el mas bajo apoya en el
  // fondo y el mas alto remata justo a ras de calle. Sin las dos cosas a la
  // vez, o la escalera flota o se hunde, y las dos pasan una foto de lejos.
  const cotas = escalones.map((p) => p.pos[1]).sort((a, b) => a - b);
  assert.equal(cotas[0], -HONDO, "el ultimo tramo no apoya en el fondo");
  assert.ok(
    Math.abs(cotas.at(-1) + TRAMO.alto) < 1e-9,
    `el primer tramo remata en ${(cotas.at(-1) + TRAMO.alto).toFixed(3)} y no a ras de calle`
  );
  // Y no hay dos tramos a la misma altura ni un salto de mas de un peldano.
  for (let i = 1; i < cotas.length; i++) {
    assert.ok(Math.abs(cotas[i] - cotas[i - 1] - TRAMO.alto) < 1e-9, "dos tramos mal escalonados");
  }
});

test("la carrera de la escalera cabe en la parcela", () => {
  // El fallo que mando agrandar la parcela de 3x2 a 3x3 celdas.
  const carrera = TRAMO.carrera * TRAMOS;
  assert.ok(
    carrera <= LADO,
    `la escalera mide ${carrera.toFixed(2)} m y la parcela ${LADO} m`
  );
  assert.ok(TRINCHERA.hasta > 0, "la trinchera se sale de la parcela por el norte");
});

test("la reja esta en el fondo y mirando a quien baja", () => {
  const { piezas } = planBoca();
  const reja = piezas.find((p) => p.papel === "reja");
  assert.ok(reja, "no hay reja");
  assert.equal(reja.pos[1], -HONDO, "la reja no esta a la altura del fondo");
  // Y esta al final de la trinchera, no en mitad de ella.
  const wReja = -reja.pos[2];
  assert.ok(
    Math.abs(wReja - TRINCHERA.hasta) < 0.1,
    `la reja esta a w=${wReja.toFixed(2)} y el frente de roca en ${TRINCHERA.hasta.toFixed(2)}`
  );
});

test("fuera del labio el terreno esta a ras de calle, exacto", () => {
  // Es lo que permite coser la boca con el suelo del pueblo sin rendija. Un
  // "casi cero" de 2 cm deja una linea de luz alrededor de toda la parcela.
  for (const [x, w] of [[0, 0], [LADO, 0], [0, LADO], [LADO, LADO], [0.2, 6], [11.8, 6]]) {
    assert.equal(alturaRoca(x, w), 0, `la roca no esta a cero en ${x},${w}`);
  }
});

test("el centro del socavon esta al fondo y el labio a cero", () => {
  assert.equal(alturaRoca(CRATER.cx, CRATER.cw), -HONDO);
  // Recorriendo hacia fuera desde el centro, la altura nunca sube y baja: una
  // roca que sube y vuelve a bajar es una joroba dentro del agujero.
  let previa = -Infinity;
  for (let t = 0; t <= 1.0001; t += 0.02) {
    const h = alturaRoca(CRATER.cx + t * CRATER.rx * 0.98, CRATER.cw);
    assert.ok(h >= previa - 1e-9, `la pared del socavon baja al alejarse, en t=${t.toFixed(2)}`);
    previa = h;
  }
});

test("la rampa de la trinchera baja de cero al fondo, sin saltos", () => {
  assert.equal(alturaTrinchera(TRINCHERA.desde), 0);
  assert.ok(Math.abs(alturaTrinchera(TRINCHERA.hasta) - -HONDO) < 1e-9);
  let previa = 0;
  for (let w = TRINCHERA.desde; w >= TRINCHERA.hasta; w -= 0.2) {
    const h = alturaTrinchera(w);
    assert.ok(h <= previa + 1e-9, "la rampa sube en algun tramo");
    assert.ok(previa - h < 0.35, `salto de ${(previa - h).toFixed(2)} m en la rampa`);
    previa = h;
  }
});

test("la trinchera es un pasillo recto del ancho declarado", () => {
  const medio = TRINCHERA.ancho / 2;
  assert.ok(enTrinchera(CRATER.cx, TRINCHERA.desde - 1));
  assert.ok(!enTrinchera(CRATER.cx + medio + 0.1, TRINCHERA.desde - 1));
  assert.ok(!enTrinchera(CRATER.cx, TRINCHERA.hasta - 0.5), "la trinchera sigue mas alla del fondo");
});

test("la escalera cabe de ancho en la trinchera", () => {
  assert.ok(
    TRAMO.ancho <= TRINCHERA.ancho,
    `el tramo mide ${TRAMO.ancho} m y la trinchera ${TRINCHERA.ancho}`
  );
});

// --- la malla generada -------------------------------------------------------

test("la roca genera geometria de verdad, no una malla vacia", () => {
  const m = generarRoca();
  assert.ok(m.idx.length > 0, "la roca no tiene ni un triangulo");
  assert.equal(m.pos.length % 3, 0);
  assert.equal(m.nor.length, m.pos.length);
  assert.equal(m.uv.length, (m.pos.length / 3) * 2);
  assert.equal(m.idx.length % 3, 0);
});

test("ningun indice de la roca apunta fuera de sus vertices", () => {
  // Un indice pasado no da error: da un triangulo que une tres puntos que no
  // tienen nada que ver, o sea una esquirla cruzando la pantalla.
  const m = generarRoca();
  const vertices = m.pos.length / 3;
  for (const i of m.idx) {
    assert.ok(Number.isInteger(i) && i >= 0 && i < vertices, `indice ${i} de ${vertices}`);
  }
});

test("todas las normales de la roca son unitarias", () => {
  // Una normal sin normalizar no da error: da una cara mas clara o mas oscura
  // que sus vecinas, y eso se lee como una mancha en la textura.
  const m = generarRoca();
  for (let i = 0; i < m.nor.length; i += 3) {
    const l = Math.hypot(m.nor[i], m.nor[i + 1], m.nor[i + 2]);
    assert.ok(Math.abs(l - 1) < 1e-5, `normal de longitud ${l.toFixed(4)}`);
  }
});

test("toda la roca cae dentro de la parcela y por debajo de la calle", () => {
  const m = generarRoca();
  for (let i = 0; i < m.pos.length; i += 3) {
    const [x, y, z] = [m.pos[i], m.pos[i + 1], m.pos[i + 2]];
    assert.ok(x >= -0.01 && x <= LADO + 0.01, `x=${x} fuera de la parcela`);
    assert.ok(-z >= -0.01 && -z <= LADO + 0.01, `w=${-z} fuera de la parcela`);
    // Por encima de la calle no hay nada: la boca es un agujero, no un monton.
    assert.ok(y <= 0.001, `hay roca a ${y.toFixed(2)} m sobre la calle`);
    // Un palmo por debajo del fondo, y declarado: las paredes de la trinchera se
    // estiran 0,3 m hacia abajo para solapar con la roca, porque van en recto de
    // paso a paso y la roca que cierran es curva. Sin ese solape quedan rendijas
    // de milimetros por las que entra el color del cielo -las encontro una sonda
    // de rayos, dos en trescientas sesenta y seis-. Lo que se mete de mas queda
    // dentro de la roca y no se ve.
    assert.ok(y >= -HONDO - 0.35, `hay roca a ${y.toFixed(2)} m, mas hondo que el fondo`);
  }
});

test("toda UV de la roca cae dentro del recuadro de piedra del atlas", () => {
  // El atlas es una hoja con muchos materiales. Una UV fuera de su recuadro no
  // da error: da un trozo de tejado de paja en mitad de una pared de roca.
  const m = generarRoca();
  for (let i = 0; i < m.uv.length; i += 2) {
    const [u, v] = [m.uv[i], m.uv[i + 1]];
    assert.ok(u >= PIEDRA.u0 - 1e-6 && u <= PIEDRA.u1 + 1e-6, `u=${u} fuera del recuadro`);
    assert.ok(v >= PIEDRA.v0 - 1e-6 && v <= PIEDRA.v1 + 1e-6, `v=${v} fuera del recuadro`);
  }
});

test("la roca es la misma dos veces: nada al azar", () => {
  // Si hubiera un Math.random escondido, la boca cambiaria entre la captura que
  // se aprueba y la que se publica.
  const a = generarRoca(), b = generarRoca();
  assert.deepEqual(a.pos, b.pos);
  assert.deepEqual(a.idx, b.idx);
});

test("el brocal rodea el labio, deja pasar la trinchera y SELLA", () => {
  // Antes eran piezas del pack y esta prueba contaba piezas. Ahora es malla
  // generada, y lo que se comprueba es mejor: que el anillo tape TODO el
  // contorno menos el tajo de la trinchera, y que en ninguna parte se quede por
  // debajo de la altura de paso del jugador.
  //
  // Lo segundo es lo que faltaba y costó una sonda: la altura del brocal sigue
  // al propio labio, y con el factor mal puesto bajaba a cuatro centímetros en
  // los dos puntos donde el labio se mete hacia dentro. Cuatro centímetros no
  // son un reborde, son suelo.
  const { roca, medidas } = planBoca();
  assert.ok(medidas.brocal > 40, `solo ${medidas.brocal} segmentos de brocal`);
  assert.ok(medidas.triangulosBrocal > 200, "el brocal casi no tiene geometria");

  // Muestreo angular del contorno: o hay brocal, o es el tajo de la trinchera.
  const medio = TRINCHERA.ancho / 2;
  const alturas = [];
  for (let i = 0; i < 360; i++) {
    const a = (i / 360) * Math.PI * 2;
    const x = CRATER.cx + Math.cos(a) * CRATER.rx * 1.02;
    const w = CRATER.cw + Math.sin(a) * CRATER.rw * 1.02;
    const enTajo = Math.abs(x - CRATER.cx) < medio + 0.45 && w > CRATER.cw;
    if (enTajo) continue;
    // La altura del brocal en ese angulo, sacada de la misma formula que lo
    // genera: si alguien la toca, esto se entera.
    const l = labio(a);
    alturas.push(0.95 * (0.9 + 1.2 * (l - 1)));
  }
  assert.ok(alturas.length > 250, `el tajo se come ${360 - alturas.length} grados de contorno`);
  const masBajo = Math.min(...alturas);
  assert.ok(
    masBajo > PASO_JUGADOR,
    `el brocal baja a ${masBajo.toFixed(2)} m y el jugador sube ${PASO_JUGADOR} m: no sella`
  );

  // Y el brocal esta DENTRO de la roca, que es lo que se le da a Rapier.
  let altos = 0;
  for (let i = 1; i < roca.pos.length; i += 3) if (roca.pos[i] > 0.3) altos++;
  assert.ok(altos > 100, "la roca no lleva ni un vertice por encima de la calle: falta el brocal");
});

test("el plano avisa de lo que el pack no puede dar", () => {
  const { avisos } = planBoca();
  assert.ok(avisos.some((a) => /torno/.test(a)), "no avisa de lo que falta del torno");
});

test("el sello se ve desde la calle, no solo desde el fondo", () => {
  // La reja de abajo se lo dice a quien YA ha bajado. Desde arriba, un agujero
  // con brocal y nada mas es una invitacion, no un sello. Esto comprueba que
  // hay cierre tambien en la boca de la trinchera, a cota de calle.
  const { piezas } = planBoca();
  const calle = piezas.filter((p) => p.papel === "reja-calle");
  assert.ok(calle.length, "no hay reja a cota de calle");
  for (const hoja of calle) {
    assert.equal(hoja.pos[1], 0, "la reja de calle no esta a ras de suelo");
    const w = -hoja.pos[2];
    assert.ok(
      w <= TRINCHERA.desde && w > TRINCHERA.desde - TRAMO.carrera,
      `la reja de calle esta a w=${w.toFixed(2)}, fuera de la boca de la trinchera`
    );
  }
  // Y las dos rejas son dos, no la misma contada dos veces.
  const fondo = piezas.filter((p) => p.papel === "reja");
  assert.ok(fondo.length, "no hay reja al fondo");
  assert.notEqual(calle[0].pos[1], fondo[0].pos[1]);
});

test("cada reja tapa el pasillo entero, no solo el centro", () => {
  // Es lo que faltaba comprobar y lo que costo la sesion. La hoja mide 1,228 m y
  // va centrada en su pivote; el pasillo mide 2,4. Con UNA hoja la reja tapa el
  // centro y deja 0,59 m libres a cada lado: de frente se ve cerrada -por eso no
  // la caza ninguna captura- y un cuerpo la rodea andando. Se comprueba el ancho
  // cubierto, no el numero de hojas, porque lo que importa es que no se pase.
  const ANCHO_HOJA = 1.228;
  const { piezas } = planBoca();
  const medio = TRINCHERA.ancho / 2;
  for (const papel of ["reja", "reja-calle"]) {
    const hojas = piezas
      .filter((p) => p.papel === papel)
      .map((p) => [p.pos[0] - ANCHO_HOJA / 2, p.pos[0] + ANCHO_HOJA / 2])
      .sort((a, b) => a[0] - b[0]);
    assert.ok(hojas.length, `no hay ninguna hoja de '${papel}'`);
    // Sin huecos entre hojas: cada una empieza antes de que acabe la anterior.
    for (let i = 1; i < hojas.length; i++) {
      assert.ok(
        hojas[i][0] <= hojas[i - 1][1] + 1e-9,
        `'${papel}' deja ${(hojas[i][0] - hojas[i - 1][1]).toFixed(2)} m de hueco entre hojas`
      );
    }
    // Y entre todas cubren el pasillo de lado a lado.
    assert.ok(
      hojas[0][0] <= CRATER.cx - medio + 1e-9,
      `'${papel}' deja ${(hojas[0][0] - (CRATER.cx - medio)).toFixed(2)} m libres por el oeste`
    );
    assert.ok(
      hojas[hojas.length - 1][1] >= CRATER.cx + medio - 1e-9,
      `'${papel}' deja ${(CRATER.cx + medio - hojas[hojas.length - 1][1]).toFixed(2)} m libres por el este`
    );
  }
});

test("el brocal no se aleja de su parcela mas que el propio labio", () => {
  // El labio del crater SI se sale un palmo de su parcela en las diagonales, y
  // el brocal lo remata, asi que sale con el. Lo que no puede es irse mas lejos:
  // si se fuera, estaria rematando otra cosa.
  const LADO = PARCELA.ancho * CELDA;
  const { roca } = planBoca();
  for (let i = 0; i < roca.pos.length; i += 3) {
    if (roca.pos[i + 1] <= 0.01) continue; // solo lo que sobresale: el brocal
    const x = roca.pos[i];
    const w = -roca.pos[i + 2];
    assert.ok(x > -1.2 && x < LADO + 1.2, `el brocal se va a x=${x.toFixed(2)}`);
    assert.ok(w > -1.2 && w < LADO + 1.2, `el brocal se va a w=${w.toFixed(2)}`);
  }
});

test("el torno se genera con la madera del atlas, no con la piedra", () => {
  // Un tambor con UV de silleria sale a cuadros de piedra y parece un
  // contrapeso, no un torno. Como las dos texturas viven en el mismo atlas, el
  // fallo no seria una textura que falta: seria la textura equivocada.
  const t = generarTorno({ cx: 6, w: 10, altura: 2.75, largo: 4.6 });
  assert.ok(t.idx.length > 0, "el torno no tiene geometria");
  for (let i = 0; i < t.uv.length; i += 2) {
    assert.ok(t.uv[i] >= MADERA.u0 - 1e-6 && t.uv[i] <= MADERA.u1 + 1e-6, `u=${t.uv[i]} fuera de la madera`);
    assert.ok(t.uv[i + 1] >= MADERA.v0 - 1e-6 && t.uv[i + 1] <= MADERA.v1 + 1e-6, `v=${t.uv[i + 1]} fuera`);
  }
});

test("la cuerda del torno llega al fondo, no a una longitud escrita a mano", () => {
  // Si el socavon se hace mas hondo, la cuerda tiene que bajar con el. Una
  // cuerda de largo fijo queda colgando en el aire y eso se ve enseguida... en
  // la boca actual. En la siguiente, no.
  const t = generarTorno({ cx: 6, w: 10, altura: 2.75, largo: 4.6 });
  let masBajo = Infinity;
  for (let i = 1; i < t.pos.length; i += 3) masBajo = Math.min(masBajo, t.pos[i]);
  assert.ok(Math.abs(masBajo - -HONDO) < 1e-9, `la cuerda acaba en ${masBajo.toFixed(2)} y el fondo esta en ${-HONDO}`);
});

test("el origen desplaza la boca entera", () => {
  const a = planBoca();
  const b = planBoca({ origen: [60, 0, -20] });
  assert.equal(a.piezas.length, b.piezas.length);
  for (let i = 0; i < a.piezas.length; i++) {
    assert.deepEqual(b.piezas[i].pos, [a.piezas[i].pos[0] + 60, a.piezas[i].pos[1], a.piezas[i].pos[2] - 20]);
  }
});

// --- encaje con el plano del pueblo -----------------------------------------

test("la parcela del pueblo tiene el tamano que la boca necesita", () => {
  // Las dos cosas se escriben en archivos distintos y tienen que coincidir. Si
  // alguien encoge la parcela en corinth.js, la escalera deja de caber y el
  // sintoma seria una escalera atravesando la muralla.
  const p = PARCELAS.find((q) => q.nombre === "boca-mazmorra");
  const r = rect(p);
  assert.equal(r.ancho, PARCELA.ancho);
  assert.equal(r.fondo, PARCELA.fondo);
});

test("la boca solo usa piezas que se importaron", () => {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
  const { piezas: importadas } = JSON.parse(
    readFileSync(join(ROOT, "public", "kit", "kit.json"), "utf8")
  );
  const disponibles = new Set(importadas.map((p) => p.nombre));
  for (const p of planBoca().piezas) {
    assert.ok(disponibles.has(p.pieza), `la boca pide '${p.pieza}', que no esta en public/kit/`);
  }
});
