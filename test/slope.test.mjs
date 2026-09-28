// El relieve continuo: campo por esquinas, rampas y malla.
//
// Lo que aqui se rompe en silencio es lo mismo que en el escalonado y peor: un
// suelo inclinado con una pendiente demasiado fuerte no da ningun error, se ve
// perfecto, sella perfecto, y el jugador resbala para abajo cada vez que
// intenta subirlo. Asi que la pendiente se mide, no se supone.

import test from "node:test";
import assert from "node:assert/strict";

import {
  cornerField, limitSlope, worstDrop, worstSlopeDeg, levelCell, heightAtCell,
  highestCorner, MAX_SLOPE_DEG,
} from "../src/map/slope.js";
import { slab } from "../src/map/emit.js";
import { parse } from "../src/map/parse.js";
import { buildMesh } from "../src/map/geometry.js";
import { fbm } from "../src/util/noise.js";
import { PLAYER } from "../src/play/player.js";

// --- el campo ---------------------------------------------------------------

test("una rejilla de w x h celdas tiene (w+1) x (h+1) esquinas", () => {
  // No es contar por contar: si el campo tuviera una esquina de menos, la
  // ultima fila de celdas cogeria la altura de la primera y el pueblo saldria
  // con un pliegue que cruza el mapa.
  const f = cornerField(10, 7, {});
  assert.equal(f.cornersX, 11);
  assert.equal(f.cornersY, 8);
  assert.equal(f.raw.length, 11 * 8);
});

test("ninguna esquina vecina pasa de la pendiente permitida", () => {
  for (const seed of [0, 1, 5]) {
    for (const wavelength of [1.5, 3, 9, 25]) {
      for (const range of [48, 400]) {
        const f = cornerField(40, 30, { seed, wavelength, range, cell: 64 });
        assert.ok(
          worstDrop(f) <= f.maxDrop,
          `semilla ${seed}, onda ${wavelength}, rango ${range}: desnivel ${worstDrop(f)} de ${f.maxDrop}`
        );
      }
    }
  }
});

test("la pendiente maxima queda por debajo de la que sube el jugador", () => {
  // Seis grados de margen contra PLAYER.maxSlopeDeg. Al limite justo, un
  // redondeo deja una ladera por la que se resbala sin motivo aparente.
  const f = cornerField(50, 50, { wavelength: 2, range: 600, cell: 64 });
  assert.ok(worstSlopeDeg(f) <= MAX_SLOPE_DEG + 1e-6, `${worstSlopeDeg(f)} grados`);
  assert.ok(MAX_SLOPE_DEG < PLAYER.maxSlopeDeg, "el terreno va al limite del controlador");
});

test("limitar la pendiente hace falta: el ruido crudo no sale suave", () => {
  // Si el ruido ya cumpliera, el limitador seria codigo muerto y alguien lo
  // quitaria. No cumple: con onda corta y rango grande hay desniveles de
  // cientos de unidades entre esquinas contiguas.
  const cw = 40, ch = 30;
  const z = new Float64Array(cw * ch);
  for (let j = 0; j < ch; j++) {
    for (let i = 0; i < cw; i++) z[j * cw + i] = Math.round(fbm(i / 1.5, j / 1.5, 3) * 600);
  }
  const antes = worstDrop({ raw: z, cornersX: cw, cornersY: ch, cell: 64 });
  assert.ok(antes > 53, `el ruido crudo ya era suave: desnivel ${antes}`);

  const copia = Float64Array.from(z);
  limitSlope(copia, cw, ch, 53);
  assert.ok(worstDrop({ raw: copia, cornersX: cw, cornersY: ch, cell: 64 }) <= 53);
});

test("limitar solo baja, nunca sube, que es lo que hace que termine", () => {
  const cw = 20, ch = 20;
  const z = new Float64Array(cw * ch);
  for (let i = 0; i < z.length; i++) z[i] = Math.round(fbm(i % cw, Math.floor(i / cw), 4) * 500);
  const antes = Float64Array.from(z);
  limitSlope(z, cw, ch, 40);
  for (let i = 0; i < z.length; i++) {
    assert.ok(z[i] <= antes[i], `la esquina ${i} subio de ${antes[i]} a ${z[i]}`);
  }
});

test("todas las alturas son enteras", () => {
  // Los planos del .map se escriben con decimales solo cuando hacen falta. Una
  // cara inclinada con decimales le da a qbsp un plano que no es exactamente
  // el del vecino, y ahi aparecen rendijas de una diezmilesima.
  const f = cornerField(30, 30, { range: 137 });
  for (const v of f.raw) assert.ok(Number.isInteger(v), `altura ${v}`);
});

test("hay relieve de verdad, no un campo plano que cumple todo", () => {
  // Un campo todo a cero pasa cada una de las pruebas de arriba. Es el mismo
  // fallo que 'exit 0 no significa correcto' con otra ropa.
  const f = cornerField(40, 40, { range: 48, cell: 64, wavelength: 9 });
  assert.ok(f.max - f.min >= 32, `el campo solo tiene ${f.max - f.min} unidades de desnivel`);
});

test("pedir fuera de la rejilla no da undefined", () => {
  const f = cornerField(8, 8, {});
  for (const [i, j] of [[-3, 0], [99, 0], [0, -1], [0, 99], [-9, -9]]) {
    assert.ok(Number.isFinite(f.get(i, j)), `get(${i},${j}) dio ${f.get(i, j)}`);
  }
});

// --- interpolacion ----------------------------------------------------------

test("en una esquina la interpolacion da exactamente esa esquina", () => {
  const f = cornerField(12, 12, { range: 200 });
  for (const [i, j] of [[0, 0], [3, 7], [12, 12], [5, 0]]) {
    assert.equal(heightAtCell(f, i, j), f.get(i, j), `esquina ${i},${j}`);
  }
});

test("en el centro de una celda la interpolacion da la media de las cuatro", () => {
  // Con la esquina mas cercana en vez de interpolar, un arbol plantado junto a
  // una linea de la rejilla queda medio metro fuera de su ladera. No da error:
  // se ve un arbol flotando, si es que alguien mira.
  const f = cornerField(6, 6, { range: 300 });
  const media = (f.get(2, 3) + f.get(3, 3) + f.get(2, 4) + f.get(3, 4)) / 4;
  assert.ok(Math.abs(heightAtCell(f, 2.5, 3.5) - media) < 1e-9);
});

test("el zocalo se asienta sobre la esquina mas alta de la huella", () => {
  const f = cornerField(20, 20, { range: 200 });
  const top = highestCorner(f, 3, 3, 6, 6);
  // Hasta i1+1 y j1+1: la celda 6 acaba en la esquina 7, y olvidarse de esa
  // fila deja la esquina de atras de la casa por encima del zocalo.
  for (let j = 3; j <= 7; j++) {
    for (let i = 3; i <= 7; i++) {
      assert.ok(f.get(i, j) <= top, `la esquina ${i},${j} asoma sobre el zocalo`);
    }
  }
});

test("nivelar una celda la deja plana y no rompe la pendiente", () => {
  const f = cornerField(20, 20, { range: 400, wavelength: 3, cell: 64 });
  const antes = [f.get(5, 5), f.get(6, 5), f.get(5, 6), f.get(6, 6)];
  const flat = levelCell(f, 5, 5);
  assert.equal(flat, Math.min(...antes), "nivelar tiene que bajar, no subir");
  for (const [i, j] of [[5, 5], [6, 5], [5, 6], [6, 6]]) {
    assert.equal(f.get(i, j), flat, `la esquina ${i},${j} no quedo a ras`);
  }
  assert.ok(worstDrop(f) <= f.maxDrop, `nivelar dejo un desnivel de ${worstDrop(f)}`);
});

// --- las rampas como brushes ------------------------------------------------

/** Lee un brush suelto como si fuera un .map, para poder medirlo de verdad. */
function brushesOf(pieces) {
  const text = `{\n"classname" "worldspawn"\n${[pieces].flat().join("\n")}\n}\n`;
  return parse(text)[0].brushes;
}

test("una losa inclinada son dos prismas de cinco caras", () => {
  // Dos y no uno: cuatro puntos con cuatro alturas distintas no son
  // coplanarios, asi que 'la cara de arriba' de una sola pieza no existe.
  const pieces = slab([0, 0], [64, 64], -64, [0, 8, 24, 16], "grass01");
  assert.equal(pieces.length, 2);
  const brushes = brushesOf(pieces);
  for (const b of brushes) {
    assert.equal(b.planes.length, 5, "un prisma triangular tiene cinco caras");
    assert.ok(!b.degenerate, "la losa salio degenerada");
  }
});

test("la losa inclinada saca triangulos y no se pierde ninguna cara", () => {
  // Un brush con una cara invertida no da error: qbsp la descarta con 'no
  // visible sides' y esa cara sencillamente no esta. Aqui se cuenta.
  const mesh = buildMesh(brushesOf(slab([0, 0], [64, 64], -64, [0, 8, 24, 16], "grass01")));
  assert.equal(mesh.degenerate, 0);
  // Dos prismas de cinco caras: dos triangulos (arriba y abajo) y tres
  // cuadrilateros (los lados), o sea ocho triangulos por prisma.
  assert.equal(mesh.triangleCount, 16);
});

test("la cara de arriba de la losa pasa por las cuatro alturas pedidas", () => {
  // Es el equivalente aqui de contrastar la malla contra el campo: si la losa
  // no pasara por las alturas que se le dan, el pueblo saldria con un relieve
  // que no es el que calculo el emisor, y se veria perfectamente normal.
  const z = [0, 8, 24, 16];
  const mesh = buildMesh(brushesOf(slab([0, 0], [64, 64], -64, z, "grass01")));
  const esquinas = [[0, 0, z[0]], [64, 0, z[1]], [64, 64, z[2]], [0, 64, z[3]]];
  for (const [qx, qy, qz] of esquinas) {
    // De unidades de Quake a metros y ejes de Three.js: x, z, -y.
    const want = [qx / 32, qz / 32, -qy / 32];
    let found = false;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      if (
        Math.abs(mesh.positions[i] - want[0]) < 1e-6 &&
        Math.abs(mesh.positions[i + 1] - want[1]) < 1e-6 &&
        Math.abs(mesh.positions[i + 2] - want[2]) < 1e-6
      ) {
        found = true;
        break;
      }
    }
    assert.ok(found, `la esquina ${qx},${qy},${qz} no esta en la malla`);
  }
});

test("una losa plana tambien vale: no hace falta que este inclinada", () => {
  const mesh = buildMesh(brushesOf(slab([0, 0], [64, 64], -64, [0, 0, 0, 0], "grass01")));
  assert.equal(mesh.degenerate, 0);
  assert.equal(mesh.triangleCount, 16);
});

test("una losa cuya esquina no llega al fondo se niega a emitirse", () => {
  // Los caminos de error hay que ejercitarlos a proposito. Esa esquina daria
  // una cara lateral de area cero: qbsp la descarta y queda un agujero por el
  // que el mundo deja de sellar, a varios cientos de brushes de distancia de
  // donde esta el fallo.
  assert.throws(() => slab([0, 0], [64, 64], 0, [0, 8, 24, 16], "grass01"), /fondo/);
  assert.throws(() => slab([0, 0], [64, 64], 10, [8, 8, 24, 16], "grass01"), /fondo/);
});

test("dos losas vecinas comparten esquinas, asi que no dejan rendija", () => {
  // Es de lo que depende que un suelo inclinado siga sellando. Las caras
  // verticales de dos celdas contiguas tienen que ser el MISMO rectangulo.
  const f = cornerField(4, 4, { range: 200, cell: 64 });
  const izq = slab([0, 0], [64, 64], -400,
    [f.get(0, 1), f.get(1, 1), f.get(1, 0), f.get(0, 0)], "grass01");
  const der = slab([64, 0], [128, 64], -400,
    [f.get(1, 1), f.get(2, 1), f.get(2, 0), f.get(1, 0)], "grass01");
  const mesh = buildMesh(brushesOf([...izq, ...der]));
  // La junta esta en x = 64 unidades = 2 m. Las alturas que aparecen ahi
  // tienen que ser exactamente las dos esquinas compartidas, y ninguna mas.
  const alturas = new Set();
  for (let i = 0; i < mesh.positions.length; i += 3) {
    if (Math.abs(mesh.positions[i] - 2) < 1e-6) {
      alturas.add(Math.round(mesh.positions[i + 1] * 32));
    }
  }
  assert.ok(alturas.has(f.get(1, 0)), "falta la esquina de abajo de la junta");
  assert.ok(alturas.has(f.get(1, 1)), "falta la esquina de arriba de la junta");
});
