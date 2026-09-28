// El plano de la casa, comprobado sin navegador.
//
// Todo lo que hay aqui es aritmetica de colocacion, que es exactamente lo que
// no se puede juzgar en una captura: dos casas con el tejado 36 cm mal puesto se
// ven igual de bien a mediodia. Las capturas comprueban lo otro.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  planHouse,
  puntoEnCara,
  CELDA,
  ALTURA_MURO,
  SOLAPE_TEJADO,
  CARAS,
} from "../src/kit/house.js";
import { CASAS, casa } from "../src/kit/casas.js";

test("la celda (i,j) cae en (4i, 0, -4j), sin correccion de media pieza", () => {
  const { piezas } = planHouse({ ancho: 3, fondo: 2, tejado: null, puerta: null });
  const muros = piezas.filter((p) => p.papel === "muro p0").map((p) => p.pos.join(","));
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 2; j++) {
      assert.ok(
        muros.includes(`${i * CELDA},0,${-j * CELDA}`),
        `falta el muro de la celda ${i},${j}`
      );
    }
  }
  assert.equal(muros.length, 6);
});

test("cada planta empieza justo donde acaba la de abajo", () => {
  const { piezas } = planHouse({ plantas: 3, tejado: null, puerta: null });
  const alturas = piezas.filter((p) => p.papel.startsWith("muro")).map((p) => p.pos[1]);
  assert.deepEqual(alturas.sort((a, b) => a - b), [0, ALTURA_MURO, 2 * ALTURA_MURO]);
});

test("el tejado solapa el muro en vez de apoyarse encima", () => {
  // Es el fallo que deja una rendija de luz alrededor de toda la casa: casi no
  // se ve a mediodia y de noche se ve entera.
  for (const plantas of [1, 2, 3]) {
    const { piezas } = planHouse({ plantas });
    const tejado = piezas.find((p) => p.papel === "tejado");
    const base = tejado.pos[1] - SOLAPE_TEJADO;
    assert.ok(
      base < plantas * ALTURA_MURO,
      `con ${plantas} plantas el tejado empieza en ${base} y el muro acaba en ${plantas * ALTURA_MURO}`
    );
  }
});

test("hay un faldon por celda de ancho, y la cumbrera va en X", () => {
  const { piezas } = planHouse({ ancho: 4 });
  const tejados = piezas.filter((p) => p.papel === "tejado");
  assert.equal(tejados.length, 4);
  // Todos a la misma altura y a la misma Z: lo que cambia es X. Si cambiara Z,
  // la cumbrera iria en el otro eje y los remates cerrarian el lado que no es.
  assert.equal(new Set(tejados.map((t) => t.pos[1])).size, 1);
  assert.equal(new Set(tejados.map((t) => t.pos[2])).size, 1);
  assert.deepEqual(tejados.map((t) => t.pos[0]), [0, 4, 8, 12]);
});

test("un fondo de mas de una celda avisa en vez de sacar un tejado que no tapa", () => {
  const { avisos } = planHouse({ fondo: 2 });
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /sin cubrir/);
  // Y con fondo de una celda no avisa de nada: un aviso que salta siempre es
  // un aviso que nadie lee.
  assert.deepEqual(planHouse({ fondo: 1 }).avisos, []);
});

test("u = 0.5 es el centro de la cara, mida lo que mida la casa", () => {
  for (const ancho of [1, 2, 5]) {
    const p = puntoEnCara(ancho, 1, "sur", 0.5, 0);
    assert.equal(p.x, (ancho * CELDA) / 2);
    assert.equal(p.z, 0);
  }
});

test("las cuatro caras caen en el plano que les toca y miran hacia fuera", () => {
  const ancho = 2, fondo = 3;
  const sur = puntoEnCara(ancho, fondo, "sur", 0.5, 0);
  const norte = puntoEnCara(ancho, fondo, "norte", 0.5, 0);
  const este = puntoEnCara(ancho, fondo, "este", 0.5, 0);
  const oeste = puntoEnCara(ancho, fondo, "oeste", 0.5, 0);
  assert.equal(sur.z, 0);
  assert.equal(norte.z, -fondo * CELDA);
  assert.equal(este.x, ancho * CELDA);
  assert.equal(oeste.x, 0);
  // Los cuatro giros son distintos: si dos coincidieran, dos puertas mirarian
  // a la misma parte y una de ellas estaria de espaldas a su pared.
  assert.equal(new Set([sur.giro, norte.giro, este.giro, oeste.giro]).size, 4);
});

test("u recorre la cara en el mismo sentido visto desde fuera", () => {
  // En la cara norte se mira desde -Z, asi que u creciente tiene que ir hacia
  // -X. Sin esto, "la ventana a la izquierda de la puerta" cambia de lado segun
  // la fachada, y eso no se ve en una captura de frente.
  const a = puntoEnCara(2, 1, "norte", 0.2, 0);
  const b = puntoEnCara(2, 1, "norte", 0.8, 0);
  assert.ok(a.x > b.x, `u creciente deberia ir hacia -X en la cara norte: ${a.x} -> ${b.x}`);
  const c = puntoEnCara(2, 1, "sur", 0.2, 0);
  const d = puntoEnCara(2, 1, "sur", 0.8, 0);
  assert.ok(c.x < d.x);
});

test("la huella es exactamente ancho x fondo celdas, sin contar voladizos", () => {
  const { caja } = planHouse({ ancho: 3, fondo: 2, plantas: 2 });
  assert.equal(caja.max[0] - caja.min[0], 3 * CELDA);
  assert.equal(caja.max[2] - caja.min[2], 2 * CELDA);
  assert.equal(caja.max[1] - caja.min[1], 2 * ALTURA_MURO);
});

test("el origen desplaza la casa entera y nada mas", () => {
  const a = planHouse({ ancho: 2 });
  const b = planHouse({ ancho: 2, origen: [100, 5, -60] });
  assert.equal(a.piezas.length, b.piezas.length);
  for (let i = 0; i < a.piezas.length; i++) {
    assert.equal(b.piezas[i].pieza, a.piezas[i].pieza);
    assert.equal(b.piezas[i].giro, a.piezas[i].giro);
    assert.deepEqual(b.piezas[i].pos, [
      a.piezas[i].pos[0] + 100,
      a.piezas[i].pos[1] + 5,
      a.piezas[i].pos[2] - 60,
    ]);
  }
});

test("una ventana que se sale por encima del muro avisa", () => {
  const { avisos } = planHouse({ plantas: 1, ventanas: [{ cara: "sur", u: 0.5, altura: 2.8 }] });
  assert.ok(avisos.some((a) => /por encima del muro/.test(a)));
});

// --- los caminos de error, ejercitados a proposito ---------------------------

test("un ancho que no es un entero positivo es un error, no una casa rara", () => {
  assert.throws(() => planHouse({ ancho: 0 }), /ancho invalido/);
  assert.throws(() => planHouse({ ancho: 1.5 }), /ancho invalido/);
  assert.throws(() => planHouse({ fondo: -2 }), /fondo invalido/);
  assert.throws(() => planHouse({ plantas: 0 }), /plantas invalidas/);
});

test("una cara que no existe es un error", () => {
  assert.throws(() => puntoEnCara(1, 1, "arriba", 0.5, 0), /cara desconocida/);
  assert.throws(() => casa("casa-que-no-existe"), /casa desconocida/);
});

test("las cuatro caras del catalogo son las cuatro y no otras", () => {
  assert.deepEqual(Object.keys(CARAS).sort(), ["este", "norte", "oeste", "sur"]);
});

// --- el catalogo -------------------------------------------------------------

test("todas las casas del catalogo se planifican y ninguna avisa", () => {
  // Un aviso en el catalogo significa que hay una casa publicada que el kit no
  // puede construir bien. Que salte aqui y no al mirar una captura.
  for (const nombre of Object.keys(CASAS)) {
    const c = casa(nombre);
    assert.ok(c.piezas.length > 0, `${nombre} no tiene piezas`);
    assert.deepEqual(c.avisos, [], `${nombre} avisa: ${c.avisos.join(" | ")}`);
  }
});

test("toda casa del catalogo tiene tejado, puerta y cuerpo", () => {
  for (const nombre of Object.keys(CASAS)) {
    const papeles = casa(nombre).piezas.map((p) => p.papel);
    assert.ok(papeles.includes("tejado"), `${nombre} sin tejado`);
    assert.ok(papeles.includes("puerta"), `${nombre} sin puerta`);
    assert.ok(papeles.includes("muro p0"), `${nombre} sin muro`);
  }
});

test("ninguna casa del catalogo pide una pieza que no se importo", () => {
  // Es el fallo que no se ve: la pieza que falta no da error de carga, da una
  // casa a la que le falta una pared, y de frente sigue pareciendo una casa.
  // La ruta se resuelve desde este archivo y no desde el directorio de trabajo:
  // asi la prueba dice lo mismo se lance desde donde se lance.
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
  const { piezas: importadas } = JSON.parse(
    readFileSync(join(ROOT, "public", "kit", "kit.json"), "utf8")
  );
  const disponibles = new Set(importadas.map((p) => p.nombre));
  for (const nombre of Object.keys(CASAS)) {
    for (const p of casa(nombre).piezas) {
      assert.ok(disponibles.has(p.pieza), `${nombre} pide '${p.pieza}', que no esta en public/kit/`);
    }
  }
});
