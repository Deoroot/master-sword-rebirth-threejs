// LO QUE NO ES UNA CAJA: los brushes convexos del experimento de geometría.
//
// Lo que se puede hacer mal sigue siendo lo del 88 —el ORDEN de los tres puntos
// de cada plano—, sólo que ahora los puntos no salen de una tabla: se orientan
// solos. Así que aquí se hace la cuenta del compilador, `cross(p0 - p1, p2 - p1)`,
// con lo que sale de `planosDeConvexo`, y se LEE la línea escrita en el `.map`
// en vez de fiarse de la normal que devuelve la función (el 75: lo que ES la
// regla no se usa para medirla).

import test from "node:test";
import assert from "node:assert/strict";
import { planosDeConvexo, convexo, prisma, relieve, caja, mapa } from "../tools/mapagen.mjs";
import { raizDeAssets, CONTENIDO, PROPIOS } from "../tools/mapa.mjs";

const resta = (a, b) => a.map((v, i) => v - b[i]);
const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const punto = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Los planos de un brush YA ESCRITO: los tres puntos de cada línea, leídos del texto. */
function planosDelTexto(brush) {
  return brush.split("\n").filter((l) => l.startsWith("(")).map((l) => {
    const p = [...l.matchAll(/\( (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) \)/g)].map((m) => m.slice(1, 4).map(Number));
    assert.equal(p.length, 3, l);
    return p;
  });
}

/** Con la cuenta del compilador, ¿queda `q` DENTRO del brush (detrás de todos sus planos)? */
function dentro(brush, q) {
  return planosDelTexto(brush).every(([p0, p1, p2]) => punto(cruz(resta(p0, p1), resta(p2, p1)), resta(q, p1)) < 0);
}

// Un chaflán de túnel: el triángulo (y, z) estirado a lo largo de x.
const CHAFLAN = [[-48, 0], [-32, 0], [-48, 24]];

test("un prisma encierra su centro y deja fuera lo de fuera, con la cuenta del compilador", () => {
  const b = prisma(0, CHAFLAN, -100, 100, "rock_07");
  assert.equal(planosDelTexto(b).length, 5);            // tres lados y dos tapas
  assert.ok(dentro(b, [0, -44, 6]), "el centro del chaflán queda fuera del brush");
  // El control positivo de que `dentro` sabe decir que no: un punto del hueco del túnel.
  assert.ok(!dentro(b, [0, -36, 20]));
  assert.ok(!dentro(b, [150, -44, 6]));
});

test("da igual en qué sentido se dé el perfil y en qué orden los puntos de cada cara", () => {
  const alReves = prisma(0, [...CHAFLAN].reverse(), -100, 100, "rock_07");
  assert.ok(dentro(alReves, [0, -44, 6]));
  // El mismo tetraedro con las caras dadas en los dos sentidos.
  const P = [[0, 0, 0], [64, 0, 0], [0, 64, 0], [0, 0, 64]];
  for (const caras of [[[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]], [[2, 1, 0], [3, 1, 0], [3, 2, 0], [3, 2, 1]]]) {
    assert.ok(dentro(convexo(P, caras, "rock_07"), [8, 8, 8]));
  }
});

test("los tres ejes de un prisma ponen el perfil donde se dice", () => {
  // (y, z) para el eje x, (x, z) para el y, (x, y) para el z
  assert.ok(dentro(prisma(0, CHAFLAN, 0, 10, "t"), [5, -44, 6]));
  assert.ok(dentro(prisma(1, CHAFLAN, 0, 10, "t"), [-44, 5, 6]));
  assert.ok(dentro(prisma(2, CHAFLAN, 0, 10, "t"), [-44, 6, 5]));
});

test("un sólido que no es convexo no se escribe: se dice", () => {
  // Una L vista desde arriba: el vértice de dentro queda delante de una cara.
  const L = [[0, 0], [64, 0], [64, 32], [32, 32], [32, 64], [0, 64]];
  assert.throws(() => prisma(2, L, 0, 16, "t"), /no es convexo/);
  assert.throws(() => planosDeConvexo([[0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 0, 1]], [[0, 1, 2]]), /sin área/);
  assert.throws(() => prisma(0, CHAFLAN, 5, 5, "t"), /sin largo/);
});

test("el relieve cuelga de la tapa: dos brushes por celda, y cada uno llega a sus tres cotas", () => {
  // Una rampa fuerte: de 200 en x = 0 a 136 en x = 64. Con una suave, un relieve
  // que se quedara en la cota de su PRIMERA esquina pasaba la prueba (roto a
  // propósito, se quedó verde): la diferencia tiene que caber entre los sondeos.
  const cota = (x) => 200 - x;
  const r = relieve({ min: [0, 0], max: [128, 192], paso: [64, 64], tapa: 240, cota, tex: "ms_dirt01" });
  assert.equal(r.length, 2 * 3 * 2);
  // En (48, 8) la roca llega hasta 152: a 170 se está dentro de UNO de los dos brushes de la celda…
  assert.equal(r.filter((b) => dentro(b, [48, 8, 170])).length, 1);
  // …y a 140, por debajo de la cota, no hay roca.
  assert.equal(r.filter((b) => dentro(b, [48, 8, 140])).length, 0);
  // En (8, 8) llega sólo hasta 192: lo que a 48 era roca, aquí es aire.
  assert.equal(r.filter((b) => dentro(b, [8, 8, 170])).length, 0);
  assert.throws(() => relieve({ min: [0, 0], max: [64, 64], paso: [64, 64], tapa: 240, cota: () => 200.5, tex: "t" }), /no vale/);
});

test("la textura de una cara: escala, desplazamiento y una cara suelta de la caja", () => {
  const b = caja([398, -328, 0], [400, -264, 112], {
    lados: { nombre: "wood_047", escala: 0.5 }, arriba: "wood_047", abajo: "wood_047",
    oeste: { nombre: "door_14i", escala: [1, 0.875], desp: [8, 0] },
  });
  const lineas = b.split("\n").filter((l) => l.startsWith("("));
  const puerta = lineas.filter((l) => l.includes("door_14i"));
  assert.equal(puerta.length, 1);
  assert.match(puerta[0], /door_14i \[ 0 1 0 8 \] \[ 0 0 -1 0 \] 0 1 0\.875$/);
  assert.equal(lineas.filter((l) => / wood_047 .* 0 0\.5 0\.5$/.test(l)).length, 3);
  // Lo de antes sale como antes: sin escala ni desplazamiento, `0 1 1`.
  assert.match(caja([0, 0, 0], [8, 8, 8], "rock_07"), /rock_07 \[ 1 0 0 0 \] \[ 0 -1 0 0 \] 0 1 1/);
});

test("una entidad de brush lleva los suyos dentro, y `brushes` no sale como clave", () => {
  const farol = caja([0, 0, 0], [16, 16, 26], "pi_lantern");
  const t = mapa({ mundo: {}, brushes: [caja([-8, -8, -8], [8, 8, 8], "rock_07")], entidades: [
    { classname: "func_illusionary", brushes: [farol] },
    { classname: "light", origin: "0 0 40" },
  ] });
  assert.ok(!t.includes('"brushes"'));
  const bloques = t.split('"classname" "func_illusionary"')[1].split('"classname" "light"')[0];
  assert.ok(bloques.includes("pi_lantern"), "el brush del farol no está dentro de su entidad");
  assert.ok(!t.split('"classname" "func_illusionary"')[0].includes("pi_lantern"), "el farol se ha ido al worldspawn");
});

test("lo que nombra un mapa NUESTRO se busca en el juego, no al lado de su `.bsp`", () => {
  // Con la raíz sacada de la ruta, el anexo se horneaba sin adornos ni llamas.
  assert.equal(raizDeAssets(`${PROPIOS}/gatecity_anexo.bsp`), `${CONTENIDO}/`);
  assert.equal(raizDeAssets(`${PROPIOS.replace(/\//g, "\\")}\\gatecity_anexo.bsp`), `${CONTENIDO}/`);
  // Y el del juego, como siempre: la carpeta de encima de `maps/`.
  assert.equal(raizDeAssets(`${CONTENIDO}/maps/gatecity.bsp`), `${CONTENIDO}/`);
  assert.equal(raizDeAssets("C:\\Juegos\\MSR\\msr\\maps\\edana.bsp"), "C:\\Juegos\\MSR\\msr\\");
});
