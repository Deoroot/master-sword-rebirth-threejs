// Brushes a triangulos. Sin dependencias: devuelve arrays planos que sirven
// igual para una BufferGeometry de Three.js y para un trimesh de Rapier.
//
// Dos conversiones ocurren aqui y en ningun otro sitio, para que haya un solo
// lugar donde equivocarse:
//
//   escala  32 unidades de Quake = 1 metro  (mapstats.py, UNITS_PER_M)
//   ejes    Quake es Z arriba, Three.js es Y arriba
//             three.x =  quake.x
//             three.y =  quake.z
//             three.z = -quake.y
//
// El cambio de ejes conserva la mano derecha (determinante +1), asi que el
// bobinado de las caras sigue siendo valido y las normales siguen apuntando
// hacia fuera sin tener que darles la vuelta.

import { textureAxes, texCoord, DEFAULT_TEXTURE_SIZE } from "./texcoords.js";

export const UNITS_PER_M = 32.0;
const ON_PLANE = 0.05; // holgura al decidir que un vertice pertenece a una cara

/** Un punto de Quake en unidades a un punto de Three.js en metros. */
export function toScene(p) {
  return [p[0] / UNITS_PER_M, p[2] / UNITS_PER_M, -p[1] / UNITS_PER_M];
}

/** Un vector de Quake a Three.js. Igual que toScene, pero sin escala. */
export function vectorToScene(v) {
  return [v[0], v[2], -v[1]];
}

/**
 * Vertices de una cara, ordenados alrededor de su normal.
 *
 * Se toma una base ortonormal del plano y se ordena por angulo, igual que
 * face_areas() en mapstats.py. Visto desde fuera del brush el resultado gira
 * en sentido antihorario, que es la cara frontal para Three.js y el bobinado
 * que espera qbsp.
 */
export function facePolygon(brush, index) {
  const [nx, ny, nz, d] = brush.planes[index];
  const on = brush.verts.filter(
    (v) => Math.abs(nx * v[0] + ny * v[1] + nz * v[2] - d) < ON_PLANE
  );
  if (on.length < 3) return [];

  let [ux, uy, uz] = Math.abs(nx) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const dot = ux * nx + uy * ny + uz * nz;
  ux -= dot * nx; uy -= dot * ny; uz -= dot * nz;
  const len = Math.sqrt(ux * ux + uy * uy + uz * uz);
  ux /= len; uy /= len; uz /= len;
  const vx = ny * uz - nz * uy;
  const vy = nz * ux - nx * uz;
  const vz = nx * uy - ny * ux;

  const cx = on.reduce((s, v) => s + v[0], 0) / on.length;
  const cy = on.reduce((s, v) => s + v[1], 0) / on.length;
  const cz = on.reduce((s, v) => s + v[2], 0) / on.length;

  return on
    .map((v) => {
      const ax = v[0] - cx, ay = v[1] - cy, az = v[2] - cz;
      return {
        v,
        angle: Math.atan2(
          ax * vx + ay * vy + az * vz,
          ax * ux + ay * uy + az * uz
        ),
      };
    })
    .sort((a, b) => a.angle - b.angle)
    .map((e) => e.v);
}

/** Area de una cara en unidades cuadradas. Sirve para descartar chaflanes nulos. */
export function faceArea(polygon, plane) {
  if (polygon.length < 3) return 0;
  const [nx, ny, nz] = plane;
  let sx = 0, sy = 0, sz = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    sx += a[1] * b[2] - a[2] * b[1];
    sy += a[2] * b[0] - a[0] * b[2];
    sz += a[0] * b[1] - a[1] * b[0];
  }
  return Math.abs(sx * nx + sy * ny + sz * nz) / 2;
}

/**
 * Malla de una lista de brushes.
 *
 * Devuelve posiciones y normales en metros y ejes de Three.js, mas los grupos
 * por textura para poder darle a cada una su material. `skip` filtra texturas
 * por nombre; el cielo se trata aparte y no es geometria que se toque.
 */
export function buildMesh(brushes, { skip = () => false, textureSize = () => DEFAULT_TEXTURE_SIZE } = {}) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const byTexture = new Map();
  let degenerate = 0;
  let skipped = 0;

  for (const brush of brushes) {
    if (brush.degenerate) {
      degenerate++;
      continue;
    }
    for (let f = 0; f < brush.planes.length; f++) {
      const texture = brush.textures[f];
      const plane = brush.planes[f];
      const poly = facePolygon(brush, f);
      if (poly.length < 3) continue;
      if (faceArea(poly, plane) < 1e-6) continue;
      if (skip(texture)) {
        skipped++;
        continue;
      }

      const normal = vectorToScene(plane);
      const base = positions.length / 3;
      // Los ejes de textura se calculan una vez por cara, en unidades y ejes
      // de Quake, y solo despues se convierte el punto a metros y a los ejes de
      // Three.js. Al reves no funciona: los ejes del .map estan escritos en el
      // sistema de Quake.
      const axes = textureAxes(plane, brush.aligns?.[f]);
      const size = textureSize(texture);
      for (const v of poly) {
        const p = toScene(v);
        positions.push(p[0], p[1], p[2]);
        normals.push(normal[0], normal[1], normal[2]);
        const uv = texCoord(v, axes, size);
        uvs.push(uv[0], uv[1]);
      }
      const tris = [];
      for (let i = 1; i + 1 < poly.length; i++) {
        tris.push(base, base + i, base + i + 1);
      }
      let group = byTexture.get(texture);
      if (!group) byTexture.set(texture, (group = { texture, indices: [] }));
      group.indices.push(...tris);
      indices.push(...tris);
    }
  }

  // Los grupos se ordenan por textura para que el orden de dibujo sea estable
  // entre ejecuciones: si no, dos capturas del mismo mapa pueden no coincidir.
  const groups = [...byTexture.values()].sort((a, b) =>
    a.texture < b.texture ? -1 : a.texture > b.texture ? 1 : 0
  );

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
    groups,
    vertexCount: positions.length / 3,
    triangleCount: indices.length / 3,
    degenerate,
    skipped,
  };
}

/** Caja envolvente de una malla, en metros y ejes de Three.js. */
export function meshBounds(mesh) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const v = mesh.positions[i + a];
      if (v < min[a]) min[a] = v;
      if (v > max[a]) max[a] = v;
    }
  }
  return { min, max };
}
