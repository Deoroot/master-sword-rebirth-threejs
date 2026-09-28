// Un nivel que NO es un .map: el suelo es una malla de altura.
//
// Esto es lo que hace el artefacto de referencia, y conviene decir claro lo
// que cuesta antes de mirarlo: **aqui qbsp deja de opinar**. No hay brushes,
// no hay sellado que compilar, y por tanto el veredicto automatico del
// experimento -"qbsp dice si el mundo esta cerrado"- no aplica a este nivel.
//
// Asi que se cambia el juez, no se quita. Lo que aqui hace de qbsp esta en
// tools/hill.mjs y son tres cosas medidas, no supuestas:
//
//   1. cada vertice de la malla esta donde dice el campo de alturas; si el
//      generador y la fisica se separaran, el jugador andaria sobre un suelo
//      que no es el que se ve, y eso no da ningun error
//   2. saliendo del centro en dieciseis direcciones y andando hasta topar, el
//      jugador nunca sale del cuenco ni cae por debajo del terreno
//   3. una sonda de control con el cuenco agujereado TIENE que fallar, o el
//      juez no esta juzgando nada
//
// Todo lo de aqui esta en unidades de Quake, igual que el emisor de brushes,
// para que las dos formas de relieve se puedan comparar con las mismas cifras.

import { cornerField, heightAtCell, worstDrop, MAX_SLOPE_DEG } from "./slope.js";
import { toScene, UNITS_PER_M } from "./geometry.js";

export const TERRAIN = {
  cells: 72,        // celdas de lado: 72 x 128 unidades = 288 m
  cell: 128,        // lado de celda, en unidades
  range: 320,       // desnivel del valle: 10 m entre lo mas alto y lo mas bajo
  wavelength: 11,   // en celdas: una ondulacion cada 44 m
  seed: 3,
  margin: 6,        // celdas de cuenco por cada lado, fuera de lo jugable
  bowlRise: 2600,   // cuanto sube el cuenco: 81 m, que no se sube andando
  skirt: 256,       // cuanto baja el faldon del borde, para cerrar la silueta
  pathWidth: 200,   // media anchura del camino, en unidades
};

/**
 * Campo de alturas del valle.
 *
 * El ruido se limita en pendiente PRIMERO -esa es la parte que se anda- y el
 * cuenco se suma DESPUES, a proposito: si el cuenco pasara por el limitador se
 * quedaria en una cuesta suave y el jugador se saldria del mundo andando. Lo
 * que contiene al jugador es justamente que esa pendiente sea imposible.
 */
export function valleyField(opts = {}) {
  const o = { ...TERRAIN, ...opts };
  const n = o.cells;
  const field = cornerField(n, n, {
    cell: o.cell,
    range: o.range,
    wavelength: o.wavelength,
    seed: o.seed,
    maxSlopeDeg: MAX_SLOPE_DEG,
  });

  const walkableDrop = worstDrop(field);

  // El cuenco. `t` va de 0 en el borde de lo jugable a 1 en el borde del mundo.
  const cw = field.cornersX;
  const inner = n - o.margin;
  for (let j = 0; j < cw; j++) {
    for (let i = 0; i < cw; i++) {
      const d = Math.max(
        o.margin - i,
        o.margin - j,
        i - inner,
        j - inner,
        0
      );
      if (d === 0) continue;
      const t = Math.min(d / o.margin, 1);
      field.raw[j * cw + i] += Math.round(o.bowlRise * t * t);
    }
  }

  let min = Infinity;
  let max = -Infinity;
  for (const v of field.raw) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  field.min = min;
  field.max = max;

  return {
    ...field,
    get: field.get,
    opts: o,
    walkableDrop,
    /** Limites de lo jugable, en unidades. */
    inner: {
      x0: o.margin * o.cell,
      y0: o.margin * o.cell,
      x1: inner * o.cell,
      y1: inner * o.cell,
    },
  };
}

/** Altura del terreno en un punto, en unidades. Interpolada, no a saltos. */
export function heightAtUnits(field, x, y) {
  return heightAtCell(field, x / field.cell, y / field.cell);
}

/** El camino serpenteante: cuanto se aparta un punto de su eje, en unidades. */
export function pathOffset(field, x, y) {
  const span = field.width * field.cell;
  const axis = span / 2 + Math.sin((y / span) * Math.PI * 3) * span * 0.18;
  return Math.abs(x - axis);
}

/**
 * La malla: la misma forma de arrays que devuelve buildMesh() para los brushes.
 *
 * Que sea la misma forma no es cosmetico. Es lo que permite que meshGeometry(),
 * buildScene() y el trimesh de Rapier se traguen este nivel sin una sola linea
 * especial: si hubiera un camino distinto para la malla y otro para los
 * brushes, lo que se comprueba en uno no diria nada del otro.
 *
 * Las normales son por triangulo y no suavizadas, igual que en los brushes: un
 * terreno con normales suavizadas a esta resolucion se lee como plastico, y
 * ademas dejaria de parecerse al pueblo, que es con lo que hay que compararlo.
 */
export function terrainMesh(field, { skirt = TERRAIN.skirt, hole = null } = {}) {
  const n = field.width;
  const cell = field.cell;
  const positions = [];
  const normals = [];
  const uvs = [];
  const byTexture = new Map();

  const at = (i, j) => [i * cell, j * cell, field.get(i, j)];

  // 64 unidades por tesela, que es la escala del suelo del pueblo
  // (GROUND_ALIGN "0 0 0 0.5 0.5" sobre una textura de 128 px). Con otra
  // escala la hierba de aqui y la del pueblo no se podrian comparar.
  const uvOf = (p) => [p[0] / 64, -p[1] / 64];

  function tri(a, b, c, texture) {
    const A = toScene(a), B = toScene(b), C = toScene(c);
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
    const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) return; // triangulo degenerado: no se emite, se cuenta fuera
    nx /= len; ny /= len; nz /= len;
    const base = positions.length / 3;
    for (const [p, P] of [[a, A], [b, B], [c, C]]) {
      positions.push(P[0], P[1], P[2]);
      normals.push(nx, ny, nz);
      const uv = uvOf(p);
      uvs.push(uv[0], uv[1]);
    }
    let group = byTexture.get(texture);
    if (!group) byTexture.set(texture, (group = { texture, indices: [] }));
    group.indices.push(base, base + 1, base + 2);
  }

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      // `hole` solo lo usa la sonda de control de tools/hill.mjs: un terreno
      // agujereado TIENE que hacer que el jugador se caiga. Sin ejercitar ese
      // camino, "nadie se cayo" no significa que el suelo este entero;
      // significa que nadie lo comprobo.
      if (hole && Math.hypot(i - hole.i, j - hole.j) < hole.r) continue;
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
      // La misma diagonal que usa slab() para los prismas del pueblo: asi la
      // version en brushes y la version en malla son la MISMA superficie, y
      // comparar las dos capturas compara el relieve y no la triangulacion.
      const cx = (a[0] + c[0]) / 2;
      const cy = (a[1] + c[1]) / 2;
      const alto = Math.max(a[2], b[2], c[2], d[2]);
      const texture =
        alto > field.min + field.opts.range * 2.2
          ? "wall01"                                   // la roca del cuenco
          : pathOffset(field, cx, cy) < field.opts.pathWidth
            ? "road01"
            : "grass01";
      tri(a, b, c, texture);
      tri(a, c, d, texture);
    }
  }

  // Faldon del borde. El jugador no llega -para eso esta el cuenco-, pero sin
  // el la malla tiene un canto abierto y desde el aire se ve el mundo por
  // dentro, como una cascara de huevo rota.
  const foot = field.min - skirt;
  for (let k = 0; k < n; k++) {
    const edges = [
      [at(k, 0), at(k + 1, 0)],
      [at(n - k, n), at(n - k - 1, n)],
      [at(0, n - k), at(0, n - k - 1)],
      [at(n, k), at(n, k + 1)],
    ];
    for (const [p, q] of edges) {
      const P = [p[0], p[1], foot];
      const Q = [q[0], q[1], foot];
      tri(p, q, Q, "wall01");
      tri(p, Q, P, "wall01");
    }
  }

  const groups = [...byTexture.values()].sort((a, b) =>
    a.texture < b.texture ? -1 : a.texture > b.texture ? 1 : 0
  );
  const indices = [];
  for (const g of groups) indices.push(...g.indices);

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
    groups,
    vertexCount: positions.length / 3,
    triangleCount: indices.length / 3,
    degenerate: 0,
    skipped: 0,
  };
}

/**
 * Arboles y matas sembrados SOBRE la curva.
 *
 * Es lo que separa un terreno con relieve de un tablero con cosas encima: cada
 * planta pregunta la altura del punto exacto en el que cae, no la de la celda.
 * Determinista, como todo lo demas, para que dos capturas se puedan comparar.
 */
export function scatter(field, { count = 900, bushRatio = 0.45 } = {}) {
  const { x0, y0, x1, y1 } = field.inner;
  const out = [];
  for (let k = 0; k < count; k++) {
    const r = (Math.imul(k + 1, 2654435761) ^ Math.imul(k + 7, 40503)) >>> 0;
    const x = x0 + ((r % 65536) / 65536) * (x1 - x0);
    const y = y0 + (((r >>> 16) % 65536) / 65536) * (y1 - y0);
    // Nada en mitad del camino: un arbol plantado en el carril se lee como un
    // error de colocacion, que es justo lo que seria.
    if (pathOffset(field, x, y) < field.opts.pathWidth + 40) continue;
    const bush = ((r >>> 5) % 100) / 100 < bushRatio;
    out.push({
      classname: bush ? "misc_bush" : "misc_tree",
      origin: [x, y, heightAtUnits(field, x, y)],
      height: bush ? 30 + ((r >>> 11) % 18) : 320 + ((r >>> 13) % 200),
      variant: ((r >>> 3) % 8),
    });
  }
  return out;
}

/**
 * El nivel entero, con la misma forma que devuelve loadLevel() para un .map.
 *
 * Misma forma otra vez por la misma razon: main.js, buildScene() y el World de
 * Rapier no distinguen este nivel de uno de brushes, asi que lo que funciona
 * para el pueblo funciona aqui sin codigo aparte que pudiera estar mal.
 */
export function terrainLevel(opts = {}) {
  const field = valleyField(opts);
  const mesh = terrainMesh(field, opts);
  const plants = scatter(field, opts);

  const cx = (field.inner.x0 + field.inner.x1) / 2;
  const cy = (field.inner.y0 + field.inner.y1) / 2;
  const startUnits = [
    Math.round(cx),
    Math.round(cy),
    Math.round(heightAtUnits(field, cx, cy)) + 24,
  ];

  // Entidades con la misma interfaz que las de parse.js: classname, props y
  // origin(). No se hereda nada -son cuatro campos- pero tienen que responder
  // a lo mismo, porque main.js las lee sin saber de donde vienen.
  const entities = plants.map((p) => ({
    classname: p.classname,
    props: { height: String(p.height), variant: String(p.variant) },
    origin: () => p.origin,
  }));

  return {
    name: opts.name ?? "colina",
    entities,
    brushes: [],
    mesh,
    skyFaces: 0,
    lights: [],
    points: plants.map((p) => ({
      classname: p.classname,
      targetname: null,
      units: p.origin,
      position: toScene(p.origin),
    })),
    startUnits,
    start: toScene([startUnits[0], startUnits[1], startUnits[2] - 24]),
    unitsPerMetre: UNITS_PER_M,
    // Lo que el juez de tools/hill.mjs necesita para poder contrastar la malla
    // contra la verdad, en vez de creersela.
    field,
    heightAt: (x, y) => heightAtUnits(field, x, y),
    plants,
  };
}
