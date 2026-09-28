// Vallas de madera, generadas.
//
// El pack CC0 no trae ni una: tiene vigas, postes y módulos de muro, y lo que se
// hacía hasta ahora era cercar con `stone_square_1m`, que es un bloque de piedra
// de cuatro metros. De cerca se lee como lo que es —un muro de sillería tirado
// en mitad de un patio— y no como una cerca.
//
// Una valla es geometría barata y exactamente calculable: postes cada tanto y
// dos listones entre ellos. No hay que modelar nada; hay que decir por dónde
// pasa. Se pinta con la misma franja de madera del atlas `bauerhaus` que usa el
// tambor del torno, así que sigue siendo un material y una llamada de dibujo.
//
// ── Lo que una valla es aquí, además de decorado ─────────────────────────────
//
// La del río es la que sostiene el lore. Corinth vive de controlar quién baja al
// agujero, y eso solo funciona si **el puente es el único paso**. Mientras la
// orilla fue un escalón de 1,25 m a plomo, esa regla la garantizaba un accidente
// de la geometría; en cuanto al río se le puso una ribera en pendiente, se abrió
// un vado en casi todas las filas y ninguna comprobación de celdas lo notó,
// porque las celdas mojadas seguían siendo las mismas.
//
// Poner una valla convierte la regla en algo dicho: se cruza por donde la valla
// se abre. Y `tools/andar.mjs` lo comprueba asaltando el río fila por fila.

import { nuevaMalla, caja, unir } from "./malla.js";
import { MADERA } from "./boca.js";

/** Las medidas de la valla, en metros. Un poste de hombre, no de jardín. */
export const VALLA = {
  poste: 0.16,      // lado del poste
  alto: 1.25,       // por encima del medio metro que el jugador puede subir
  liston: 0.085,    // grueso del listón
  cantoListon: 0.16,
  paso: 2.0,        // separación entre postes
};

/** Las alturas de los listones, como fracción del alto. Dos, como una cerca. */
const LISTONES = [0.42, 0.86];

/**
 * Una valla a lo largo de una polilínea.
 *
 * `puntos` son pares [x, z] en metros de mundo. Los postes se colocan a lo largo
 * del recorrido cada `paso` metros **y siempre en los vértices**: un poste en
 * cada quiebro es lo que hace que una valla curva se lea como una valla y no
 * como listones flotando, porque el listón va de poste a poste en recto.
 *
 * `y` es la cota del pie. Se pasa como función y no como número porque la valla
 * del río va por el borde de una ribera que no es plana, y una valla a cota fija
 * sobre un terreno que sube se entierra por un lado y flota por el otro.
 */
export function generarValla(puntos, { alto = VALLA.alto, paso = VALLA.paso, y = () => 0 } = {}) {
  const m = nuevaMalla();
  if (puntos.length < 2) return m;

  // --- repartir los postes ---------------------------------------------------
  //
  // Se recorre la polilínea acumulando longitud y se suelta un poste cada `paso`
  // metros. Repartir por segmento en vez de por longitud total daría postes muy
  // juntos en los tramos cortos, que es donde más se nota.
  const postes = [];
  let sobra = 0;
  postes.push(puntos[0]);
  for (let i = 1; i < puntos.length; i++) {
    const a = puntos[i - 1];
    const b = puntos[i];
    const largo = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (largo < 1e-9) continue;
    let d = paso - sobra;
    while (d < largo) {
      const t = d / largo;
      postes.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      d += paso;
    }
    sobra = largo - (d - paso);
    postes.push(b); // el vértice, siempre
  }

  const mitad = VALLA.poste / 2;
  for (const [px, pz] of postes) {
    const base = y(px, pz);
    caja(m, [px - mitad, base, pz - mitad], [px + mitad, base + alto, pz + mitad], MADERA);
  }

  // --- los listones ----------------------------------------------------------
  //
  // De poste a poste, y orientados según el tramo: un listón siempre alineado a
  // los ejes deja la valla con los travesaños cruzados en cuanto el recorrido
  // gira, y eso es justo lo que pasa en la orilla de un río.
  const g = VALLA.liston / 2;
  const c = VALLA.cantoListon / 2;
  for (let i = 1; i < postes.length; i++) {
    const [ax, az] = postes[i - 1];
    const [bx, bz] = postes[i];
    const dx = bx - ax;
    const dz = bz - az;
    const largo = Math.hypot(dx, dz);
    if (largo < 1e-6) continue;
    // El vector normal al tramo, para dar grueso al listón sin girar la caja.
    const nx = -dz / largo;
    const nz = dx / largo;
    for (const f of LISTONES) {
      const ya = y(ax, az) + alto * f;
      const yb = y(bx, bz) + alto * f;
      // Un listón inclinado no es una caja alineada a los ejes, así que se emite
      // como cuatro caras a mano en vez de con `caja`. Es la misma razón por la
      // que un tejado no es una caja: la cara de arriba no está en un plano de
      // los ejes.
      liston(m, [ax, ya, az], [bx, yb, bz], nx, nz, g, c);
    }
  }
  return m;
}

/** Un listón entre dos puntos: un prisma de sección rectangular. */
function liston(m, a, b, nx, nz, g, c) {
  const p = (pt, s, dy) => [pt[0] + nx * s, pt[1] + dy, pt[2] + nz * s];
  const A = [p(a, -g, -c), p(a, g, -c), p(a, g, c), p(a, -g, c)];
  const B = [p(b, -g, -c), p(b, g, -c), p(b, g, c), p(b, -g, c)];
  const uv = (i) => [
    [0, 0], [VALLA.liston, 0], [VALLA.liston, VALLA.cantoListon], [0, VALLA.cantoListon],
  ][i];
  const cara = (i, j) => {
    const base = m.pos.length / 3;
    const pts = [A[i], A[j], B[j], B[i]];
    const u = [A[j][0] - A[i][0], A[j][1] - A[i][1], A[j][2] - A[i][2]];
    const v = [B[i][0] - A[i][0], B[i][1] - A[i][1], B[i][2] - A[i][2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    n = [n[0] / len, n[1] / len, n[2] / len];
    const largo = Math.hypot(B[i][0] - A[i][0], B[i][2] - A[i][2]);
    const coords = [[0, 0], [0, 0.2], [largo, 0.2], [largo, 0]];
    pts.forEach((pt, k) => {
      m.pos.push(pt[0], pt[1], pt[2]);
      m.nor.push(n[0], n[1], n[2]);
      const [s, t] = coords[k];
      m.uv.push(
        MADERA.u0 + (s / 3 - Math.floor(s / 3)) * (MADERA.u1 - MADERA.u0),
        MADERA.v0 + (t / 3 - Math.floor(t / 3)) * (MADERA.v1 - MADERA.v0)
      );
    });
    m.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  cara(0, 1); cara(1, 2); cara(2, 3); cara(3, 0);
  void uv;
}

/**
 * La valla de un rectángulo, con los lados que se pidan y un hueco por lado.
 *
 * `huecos` es el ancho del paso que se deja en el centro de cada lado cercado.
 * Un cercado sin puerta es una jaula, y en un pueblo eso se nota enseguida:
 * nadie puede entrar en su propia parcela.
 */
export function vallaRect({ x0, x1, z0, z1 }, lados = ["norte", "sur", "este", "oeste"], hueco = 1.6, opciones = {}) {
  const m = nuevaMalla();
  // z1 es el borde NORTE porque z crece hacia el norte del pueblo; ver
  // src/kit/pueblo.js, donde esa traducción está escrita una sola vez.
  const tramos = {
    norte: [[x0, z1], [x1, z1]],
    sur: [[x0, z0], [x1, z0]],
    este: [[x1, z0], [x1, z1]],
    oeste: [[x0, z0], [x0, z1]],
  };
  for (const lado of lados) {
    const [a, b] = tramos[lado];
    const largo = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (hueco <= 0 || largo <= hueco + 0.4) {
      unir(m, generarValla([a, b], opciones));
      continue;
    }
    // Dos tramos y un paso en medio, calculado del largo real del lado.
    const t0 = (largo - hueco) / 2 / largo;
    const t1 = 1 - t0;
    const en = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    unir(m, generarValla([a, en(t0)], opciones));
    unir(m, generarValla([en(t1), b], opciones));
  }
  return m;
}
