// Corinth montado: que las casas caigan donde el plano dice y miren donde deben.
//
// La prueba que justifica el archivo entero es «cada puerta da a una calle por
// la que se puede llegar». Se hace sobre la GEOMETRIA YA COLOCADA -se coge la
// pieza de puerta, se avanza medio metro en la direccion a la que mira, y se
// pregunta en que celda se cae- y no sobre el criterio que decidio el giro. Si
// se comprobara el criterio, esta prueba diria que el criterio hace lo que hace,
// que es una tautologia; comprobando la puerta dice que la casa esta bien
// puesta, que es lo que se queria saber.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  montarCorinth, rumboDeCalle, colocaPlan, giraXZ, normaliza, distancias,
  rectMundo, celdaAMundo, RUMBOS, puntoDeLlegada,
} from "../src/kit/pueblo.js";
import { CARAS, CELDA, planHouse } from "../src/kit/house.js";
import { CASAS } from "../src/kit/casas.js";
import {
  PARCELAS, LLEGADA, rect, transitable, alcanzables, celdasDe,
} from "../src/kit/corinth.js";
import { PARCELA as PARCELA_BOCA, CRATER, TRINCHERA, HONDO } from "../src/kit/boca.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const monta = montarCorinth();
const alcanzadas = alcanzables();

/** La celda del pueblo en la que cae un punto de mundo. */
function celdaDe([x, , z]) {
  return [Math.floor(x / CELDA), Math.floor(-z / CELDA)];
}

const esCalle = ([x, z]) => transitable(x, z) && alcanzadas.has(`${x},${z}`);

// --- el eje que esta del reves ----------------------------------------------

test("la cara que house.js llama 'sur' mira al NORTE del pueblo", () => {
  // Los dos archivos son coherentes consigo mismos y se contradicen entre si:
  // la casa crece hacia -Z y llama 'sur' a su cara de z=0, mientras el mapa de
  // celdas cuenta las filas de norte a sur, o sea que la fila 0 esta en z=0 del
  // mundo y el sur queda hacia -Z. Si alguien arrastra los nombres sin traducir,
  // las doce casas salen giradas media vuelta y no cambia ni una cifra.
  assert.equal(CARAS.sur.giro, RUMBOS.norte.yaw);
  assert.equal(CARAS.norte.giro, Math.abs(RUMBOS.sur.yaw));
  // Y la prueba de verdad, que no depende de como se llamen: la fila de celdas
  // z=0 esta mas al norte que la z=1, y en el mundo le toca una z MAYOR.
  assert.ok(celdaAMundo(0, 0)[2] > celdaAMundo(0, 1)[2]);
  // Mirar hacia el norte del pueblo es mirar hacia +Z, y eso es giro cero.
  // Con tolerancia y no exacto: cos(pi/2) en coma flotante es 6e-17, no cero, y
  // exigir el cero exacto aqui seria comprobar la biblioteca de matematicas en
  // vez del sentido del giro.
  const cerca = (v, esperado, que) => {
    for (let i = 0; i < 3; i++) {
      assert.ok(Math.abs(v[i] - esperado[i]) < 1e-9, `${que}: sale ${v} y deberia ${esperado}`);
    }
  };
  cerca(giraXZ([0, 0, 1], RUMBOS.norte.yaw), [0, 0, 1], "el norte del pueblo es +Z");
  cerca(giraXZ([0, 0, 1], RUMBOS.sur.yaw), [0, 0, -1], "el sur es -Z");
  cerca(giraXZ([0, 0, 1], RUMBOS.este.yaw), [1, 0, 0], "el este es +X");
  cerca(giraXZ([0, 0, 1], RUMBOS.oeste.yaw), [-1, 0, 0], "el oeste es -X");
});

test("girar no deja -0 en ninguna coordenada ni en ningun giro", () => {
  // -0 es cero para todo menos para Object.is, y por tanto para node --test.
  // Sale solo en cuanto un giro de media vuelta multiplica una coordenada por
  // cero, y entonces una prueba de igualdad falla sin que nada este mal.
  for (const q of monta.piezas) {
    for (const v of [...q.pos, q.giro]) assert.ok(!Object.is(v, -0), `${q.pieza} trae un -0`);
  }
});

// --- el montaje -------------------------------------------------------------

test("las dieciocho parcelas se montan y ninguna queda vacia", () => {
  assert.equal(monta.parcelas.length, PARCELAS.length);
  for (const e of monta.parcelas) {
    assert.ok(e.piezas.length > 0, `'${e.nombre}' no puso ni una pieza`);
  }
});

test("ninguna parcela esta tapiada: todas tienen calle alrededor", () => {
  for (const p of PARCELAS) {
    const { tapiada } = rumboDeCalle(p, alcanzadas);
    assert.ok(!tapiada, `'${p.nombre}' no tiene ni una celda de calle alcanzable pegada`);
  }
});

test("cada casa cabe entera dentro de su parcela, ya girada", () => {
  // Girar cambia la huella: una casa de 2x1 celdas pasa a ocupar 1x2. Una
  // parcela de 2x2 traga las dos, pero la de la herreria es de 2x2 con una casa
  // de 2x1, y la torre de guardia entra en una de 3x3. Que quepa girada no se
  // deduce de que quepa sin girar, y el sintoma de que no quepa es una casa
  // metida en la calle: se ve, pero solo si alguien pasa por ahi.
  for (const e of monta.parcelas) {
    if (!e.huella) continue;
    const m = e.rect;
    assert.ok(e.huella.x0 >= m.x0 - 1e-9 && e.huella.x1 <= m.x1 + 1e-9,
      `'${e.nombre}' se sale en X: ${e.huella.x0}..${e.huella.x1} en ${m.x0}..${m.x1}`);
    assert.ok(e.huella.z0 >= m.z0 - 1e-9 && e.huella.z1 <= m.z1 + 1e-9,
      `'${e.nombre}' se sale en Z: ${e.huella.z0}..${e.huella.z1} en ${m.z0}..${m.z1}`);
  }
});

test("dos casas no se pisan", () => {
  const huellas = monta.parcelas.filter((e) => e.huella);
  for (let i = 0; i < huellas.length; i++) {
    for (let j = i + 1; j < huellas.length; j++) {
      const a = huellas[i].huella, b = huellas[j].huella;
      const solapa =
        a.x0 < b.x1 - 1e-9 && b.x0 < a.x1 - 1e-9 &&
        a.z0 < b.z1 - 1e-9 && b.z0 < a.z1 - 1e-9;
      assert.ok(!solapa, `'${huellas[i].nombre}' y '${huellas[j].nombre}' se pisan`);
    }
  }
});

test("la fachada de cada casa toca el borde de su parcela, no flota en medio", () => {
  // Centrar la casa en la parcela deja un metro de nada entre la puerta y la
  // calle. Uno no se nota; doce son otra vez el descampado que ya paso una vez
  // con todas las comprobaciones en verde.
  for (const e of monta.parcelas) {
    if (!e.huella) continue;
    const m = e.rect;
    const borde = {
      norte: Math.abs(e.huella.z1 - m.z1),
      sur: Math.abs(e.huella.z0 - m.z0),
      este: Math.abs(e.huella.x1 - m.x1),
      oeste: Math.abs(e.huella.x0 - m.x0),
    }[e.rumbo];
    assert.ok(borde < 1e-9, `'${e.nombre}' mira al ${e.rumbo} y queda a ${borde.toFixed(2)} m del borde`);
  }
});

// --- LA prueba: la puerta da a la calle --------------------------------------

test("cada puerta da a una calle por la que se puede llegar", () => {
  const puertas = [];
  for (const e of monta.parcelas) {
    for (const q of e.piezas) {
      if (q.papel !== "puerta") continue;
      // Medio metro en la direccion a la que mira la pieza. Con giro 0 una
      // pieza mira hacia +Z, que es la misma convencion de todo el kit.
      const fuera = [
        q.pos[0] + Math.sin(q.giro) * 0.6,
        0,
        q.pos[2] + Math.cos(q.giro) * 0.6,
      ];
      const celda = celdaDe(fuera);
      puertas.push({ casa: e.nombre, celda });
      assert.ok(
        esCalle(celda),
        `la puerta de '${e.nombre}' da a la celda ${celda.join(",")}, que no es calle alcanzable`
      );
    }
  }
  assert.ok(puertas.length >= 12, `solo ${puertas.length} puertas en todo el pueblo`);
});

test("las casas no miran todas al mismo sitio", () => {
  // Un giro que no se aplica -o que se aplica siempre igual- deja el pueblo
  // entero mirando al mismo lado. Todas las cifras siguen bien: mismas piezas,
  // mismo tamano, misma silueta desde el lado bueno.
  const rumbos = new Set(monta.parcelas.filter((e) => e.casa).map((e) => e.rumbo));
  assert.ok(rumbos.size >= 2, `todas las casas miran al ${[...rumbos][0]}`);
});

test("el bloque del norte y el del sur se dan la cara a la calle del porton", () => {
  // La calle de llegada corre de este a oeste por las filas z=8 y z=9. Las
  // manzanas de arriba tienen que mirar hacia abajo y las de abajo hacia
  // arriba; si las dos miraran al mismo lado, una de ellas ensenaria la espalda
  // a la unica calle por la que entra el jugador.
  const norte = monta.parcelas.find((e) => e.nombre === "casa-calle-1");
  const sur = monta.parcelas.find((e) => e.nombre === "casa-calle-5");
  assert.equal(norte.rumbo, "sur");
  assert.equal(sur.rumbo, "norte");
});

test("el rumbo lo decide la distancia y no la fachada, y eso esta medido", () => {
  // No es un detalle: en Corinth casi todas las parcelas son exentas, con calle
  // por los cuatro lados, asi que la fachada empata y quien decide es lo cerca
  // que queda la calle de la llegada. Si algun dia el plano deja de ser asi,
  // esta cuenta cambia y conviene enterarse por aqui y no por una captura.
  const empatadas = monta.parcelas.filter((e) => e.empates >= 2).length;
  assert.ok(
    empatadas >= monta.parcelas.length / 2,
    `solo ${empatadas} parcelas empatan a fachada: el criterio ya no es el que dice el comentario`
  );
});

// --- girar, en abstracto -----------------------------------------------------

test("girar el plano conserva las piezas y suma el mismo angulo a todas", () => {
  const plan = planHouse(CASAS["casa-larga"].spec);
  plan.puertaCara = "sur";
  const p = PARCELAS.find((q) => q.nombre === "casa-calle-1");
  for (const rumbo of Object.keys(RUMBOS)) {
    const puesto = colocaPlan(plan, p, rumbo);
    assert.equal(puesto.piezas.length, plan.piezas.length, `al ${rumbo} se perdieron piezas`);
    for (let i = 0; i < plan.piezas.length; i++) {
      assert.equal(
        puesto.piezas[i].giro,
        normaliza((plan.piezas[i].giro ?? 0) + puesto.yaw),
        `la pieza ${i} no giro con la casa hacia el ${rumbo}`
      );
      assert.equal(puesto.piezas[i].pieza, plan.piezas[i].pieza);
    }
  }
});

test("girar cuatro veces un cuarto de vuelta devuelve el punto de partida", () => {
  // Es el contraste contra verdad conocida del giro: si el sentido estuviera
  // invertido esto seguiria dando la vuelta entera y no diria nada, pero si la
  // matriz estuviera mal -un seno con el signo cambiado en una sola linea- el
  // punto no vuelve.
  let v = [3, 1, -7];
  for (let k = 0; k < 4; k++) v = giraXZ(v, Math.PI / 2);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(v[i] - [3, 1, -7][i]) < 1e-9);
});

test("la distancia por la calle es la de alcanzables, con la cuenta puesta", () => {
  const d = distancias();
  const a = alcanzables();
  assert.equal(d.size, a.size, "las dos inundaciones no llegan a las mismas celdas");
  for (const clave of a) assert.ok(d.has(clave), `${clave} se alcanza pero no tiene distancia`);
  assert.equal(d.get(LLEGADA.join(",")), 0);
});

// --- la boca dentro del pueblo -----------------------------------------------

test("la boca cae dentro de su parcela, piezas y roca", () => {
  // La roca se generaba en coordenadas de parcela y `origen` solo movia las
  // piezas: mirando la boca sola daba igual, porque su origen era el cero. En
  // Corinth la parcela esta a 60 m, asi que las piezas se iban alli y el
  // agujero se quedaba en el porton. Ningun error: un socavon en mitad de la
  // plaza y una escalera bajando al aire sesenta metros al este.
  const e = monta.parcelas.find((q) => q.papel === "boca");
  const m = e.rect;
  for (const q of e.piezas) {
    assert.ok(q.pos[0] >= m.x0 - 3 && q.pos[0] <= m.x1 + 3, `${q.papel} fuera en X: ${q.pos[0]}`);
    assert.ok(q.pos[2] >= m.z0 - 3 && q.pos[2] <= m.z1 + 3, `${q.papel} fuera en Z: ${q.pos[2]}`);
  }
  const roca = monta.roca;
  assert.ok(roca.pos.length > 0);
  // Un palmo de holgura, y está medido: el labio del crater se sale 0,35 m de su
  // propia parcela en las diagonales -6 + rx*1,06*1,175 pasa de los 12 m del
  // lado- y el brocal, que lo remata, sale con él. Es sabido y está escrito en
  // corinth.js, que por eso movió la parcela una celda al este para que ese
  // palmo no cayera dentro del río.
  const HOLGURA = 1.2;
  for (let i = 0; i < roca.pos.length; i += 3) {
    assert.ok(roca.pos[i] >= m.x0 - HOLGURA && roca.pos[i] <= m.x1 + HOLGURA, `roca fuera en X: ${roca.pos[i]}`);
    assert.ok(roca.pos[i + 2] >= m.z0 - HOLGURA && roca.pos[i + 2] <= m.z1 + HOLGURA, `roca fuera en Z: ${roca.pos[i + 2]}`);
    // -0,35 y no cero: las paredes de la trinchera solapan 0,3 m hacia abajo a
    // proposito. Ver test/boca.test.mjs, donde esta la razon.
    assert.ok(roca.pos[i + 1] >= -HONDO - 0.35, `roca por debajo del fondo: ${roca.pos[i + 1]}`);
  }
});

test("la trinchera de la boca entra por el lado del patio de control", () => {
  // La boca no se gira, y eso solo vale mientras el lado por el que entra la
  // trinchera sea el que da al patio. Si alguien mueve la parcela, girarla pasa
  // a ser obligatorio y el sintoma sin esta prueba seria la escalera entrando
  // desde el lado del muro.
  const boca = PARCELAS.find((p) => p.papel === "boca");
  const r = rect(boca);
  // La trinchera arranca en w grande, o sea por el borde SUR de la parcela.
  assert.ok(TRINCHERA.desde > (PARCELA_BOCA.fondo * CELDA) / 2, "la trinchera ya no entra por el sur");
  // Y al sur de la parcela tiene que haber patio, no muralla.
  for (let x = r.x; x < r.x + r.ancho; x++) {
    const p = PARCELAS.find((q) => {
      const s = rect(q);
      return x >= s.x && x < s.x + s.ancho && r.z + r.fondo >= s.z && r.z + r.fondo < s.z + s.fondo;
    });
    assert.equal(p?.papel, "patio", `al sur de la boca, en x=${x}, no hay patio sino ${p?.papel}`);
  }
});

test("el ancho de la trinchera es un multiplo exacto del paso de la malla", () => {
  // No es estetica: es lo que permite que el suelo del pueblo y la roca casen
  // celda con celda. Con 2,35 m los bordes del pasillo caian entre dos lineas
  // de rejilla y quedaba un sobrante de 2,5 cm a cada lado.
  const { PASO } = JSON.parse(JSON.stringify({ PASO: 0.4 }));
  const pasos = TRINCHERA.ancho / PASO;
  assert.ok(Math.abs(pasos - Math.round(pasos)) < 1e-9, `la trinchera mide ${pasos} pasos`);
  const medio = TRINCHERA.ancho / 2;
  for (const borde of [CRATER.cx - medio, CRATER.cx + medio, TRINCHERA.desde]) {
    const n = borde / PASO;
    assert.ok(Math.abs(n - Math.round(n)) < 1e-9, `el borde ${borde} no cae en linea de rejilla`);
  }
});

// --- lo de siempre -----------------------------------------------------------

test("el pueblo solo usa piezas que se importaron", () => {
  const { piezas: importadas } = JSON.parse(
    readFileSync(join(ROOT, "public", "kit", "kit.json"), "utf8")
  );
  const disponibles = new Set(importadas.map((p) => p.nombre));
  for (const q of monta.piezas) {
    assert.ok(disponibles.has(q.pieza), `el pueblo pide '${q.pieza}', que no esta en public/kit/`);
  }
});

test("montar Corinth dos veces da exactamente lo mismo", () => {
  const otra = montarCorinth();
  assert.deepEqual(otra.medidas, monta.medidas);
  assert.equal(otra.piezas.length, monta.piezas.length);
  for (let i = 0; i < otra.piezas.length; i++) {
    assert.deepEqual(otra.piezas[i].pos, monta.piezas[i].pos);
    assert.equal(otra.piezas[i].giro, monta.piezas[i].giro);
  }
});

test("el jugador aparece en una celda de calle, no dentro de una casa", () => {
  const celda = celdaDe(puntoDeLlegada());
  assert.deepEqual(celda, LLEGADA);
  assert.ok(esCalle(celda));
});

test("lo que falta sigue declarado despues de montar", () => {
  // Montar la herreria y la guarnicion no las termina: siguen sin yunque y sin
  // empalizada. El aviso tiene que sobrevivir al montaje, porque una parcela
  // construida a medias se parece mucho mas a una terminada que una vacia.
  const faltas = monta.avisos.filter((a) => a.includes("falta"));
  assert.ok(faltas.length >= 3, `solo ${faltas.length} avisos de lo que falta`);
});
