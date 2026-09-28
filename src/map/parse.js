// Lector de .map de Quake. Puerto directo de parse()/plane_of() de
// ../Mydra Map Lab/tools/mapstats.py, con la misma convencion de planos:
//
//   normal = cross(p0 - p1, p2 - p1), normalizada, hacia FUERA del brush
//   dentro del brush  <=>  dot(n, p) <= d
//
// Esa convencion no es opcional: si se invierte, las caras salen con el
// bobinado al reves y qbsp descarta el brush con 'no visible sides'. El
// experimento 02 ya pago ese fallo una vez.
//
// Sin dependencias a proposito: este archivo corre igual en Node y en el
// navegador, que es lo que permite que el arnes de pruebas no necesite ojos.

export const DET_EPS = 1e-6;
export const EPS = 0.01; // holgura en unidades para "el punto esta en el plano"

const KV = /^"((?:[^"\\]|\\.)*)"\s+"((?:[^"\\]|\\.)*)"/;
const POINT = /\(\s*(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s*\)/g;

export class MapError extends Error {}

/** Plano (nx, ny, nz, d) de una cara a partir de sus tres puntos. */
export function planeOf(p0, p1, p2) {
  const ax = p0[0] - p1[0], ay = p0[1] - p1[1], az = p0[2] - p1[2];
  const bx = p2[0] - p1[0], by = p2[1] - p1[1], bz = p2[2] - p1[2];
  let nx = ay * bz - az * by;
  let ny = az * bx - ax * bz;
  let nz = ax * by - ay * bx;
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (len < DET_EPS) return null; // tres puntos alineados: cara degenerada
  nx /= len; ny /= len; nz /= len;
  return [nx, ny, nz, nx * p0[0] + ny * p0[1] + nz * p0[2]];
}

/** Interseccion de tres planos, o null si no se cortan en un punto unico. */
export function solve3(a, b, c) {
  const det =
    a[0] * (b[1] * c[2] - b[2] * c[1]) -
    a[1] * (b[0] * c[2] - b[2] * c[0]) +
    a[2] * (b[0] * c[1] - b[1] * c[0]);
  if (Math.abs(det) < DET_EPS) return null; // paralelos o en haz
  const x =
    (a[3] * (b[1] * c[2] - b[2] * c[1]) -
     a[1] * (b[3] * c[2] - b[2] * c[3]) +
     a[2] * (b[3] * c[1] - b[1] * c[3])) / det;
  const y =
    (a[0] * (b[3] * c[2] - b[2] * c[3]) -
     a[3] * (b[0] * c[2] - b[2] * c[0]) +
     a[2] * (b[0] * c[3] - b[3] * c[0])) / det;
  const z =
    (a[0] * (b[1] * c[3] - b[3] * c[1]) -
     a[1] * (b[0] * c[3] - b[3] * c[0]) +
     a[3] * (b[0] * c[1] - b[1] * c[0])) / det;
  return [x, y, z];
}

/**
 * Vertices del poliedro: cada terna de planos que se corta dentro del brush.
 *
 * Fuerza bruta sobre las ternas, igual que mapstats.py. Un brush tiene seis u
 * ocho caras, asi que el coste real no esta aqui.
 */
export function brushVertices(planes) {
  const out = [];
  const seen = new Set();
  for (let i = 0; i < planes.length; i++) {
    for (let j = i + 1; j < planes.length; j++) {
      for (let k = j + 1; k < planes.length; k++) {
        const p = solve3(planes[i], planes[j], planes[k]);
        if (p === null) continue;
        let inside = true;
        for (const q of planes) {
          if (q[0] * p[0] + q[1] * p[1] + q[2] * p[2] > q[3] + EPS) {
            inside = false;
            break;
          }
        }
        if (!inside) continue;
        // Cada vertice aparece una vez por cada terna de caras que lo toca.
        const key = `${p[0].toFixed(3)},${p[1].toFixed(3)},${p[2].toFixed(3)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(p);
      }
    }
  }
  return out;
}

export class Brush {
  constructor(faces) {
    this.planes = faces.map((f) => f.plane);
    this.textures = faces.map((f) => f.texture);
    this.aligns = faces.map((f) => f.align);
    this.verts = brushVertices(this.planes);
    if (this.verts.length) {
      this.mins = [0, 1, 2].map((i) => Math.min(...this.verts.map((v) => v[i])));
      this.maxs = [0, 1, 2].map((i) => Math.max(...this.verts.map((v) => v[i])));
    } else {
      this.mins = this.maxs = null;
    }
  }

  get degenerate() {
    return this.mins === null;
  }

  get liquid() {
    return this.textures.some((t) => t.startsWith("*"));
  }
}

export class Entity {
  constructor() {
    this.props = Object.create(null);
    this.brushes = [];
  }

  get classname() {
    return this.props.classname ?? "";
  }

  /** origin como terna de numeros, o null si falta o no se puede leer. */
  origin() {
    const raw = this.props.origin;
    if (!raw) return null;
    const parts = raw.trim().split(/\s+/).map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    return parts;
  }
}

/**
 * Una cara: tres puntos, nombre de textura y ejes, que no usamos.
 *
 * Acepta el formato clasico y Valve 220 por igual: la diferencia esta en los
 * ejes de textura, que van detras del nombre, y la geometria no depende de
 * ellos.
 */
export function parseFace(line) {
  POINT.lastIndex = 0;
  const points = [];
  let m;
  let end = 0;
  while ((m = POINT.exec(line)) !== null && points.length < 3) {
    points.push([Number(m[1]), Number(m[2]), Number(m[3])]);
    end = POINT.lastIndex;
  }
  if (points.length < 3) {
    throw new MapError(
      `cara con ${points.length} puntos: ${JSON.stringify(line.trim().slice(0, 60))}`
    );
  }
  const tokens = line.slice(end).trim().split(/\s+/).filter(Boolean);
  const texture = tokens.length ? tokens[0] : "?";
  const plane = planeOf(points[0], points[1], points[2]);
  if (plane === null) return null;

  // Detras del nombre van los ejes de textura. En el formato clasico son cinco
  // numeros sueltos; en Valve 220 son dos vectores entre corchetes y luego la
  // rotacion y las dos escalas. La geometria no depende de ellos, pero las
  // coordenadas de textura si, y sin ellas el mapa se ve de un color plano.
  const rest = tokens.slice(1);
  let align;
  if (rest[0]?.startsWith("[")) {
    const nums = rest.join(" ").match(/-?[\d.eE+-]+/g)?.map(Number) ?? [];
    // [ ux uy uz uoff ] [ vx vy vz voff ] rot sx sy
    align = {
      valve: true,
      u: nums.slice(0, 3),
      uOffset: nums[3] ?? 0,
      v: nums.slice(4, 7),
      vOffset: nums[7] ?? 0,
      rotation: nums[8] ?? 0,
      scale: [nums[9] ?? 1, nums[10] ?? 1],
    };
  } else {
    const n = rest.map(Number);
    align = {
      valve: false,
      offset: [n[0] ?? 0, n[1] ?? 0],
      rotation: n[2] ?? 0,
      scale: [n[3] || 1, n[4] || 1],
    };
  }

  return { plane, texture: texture.toLowerCase(), align };
}

/** Texto de un .map a lista de entidades. Lanza MapError si no se puede leer. */
export function parse(text) {
  const entities = [];
  let ent = null;
  let faces = null;
  const lines = text.split(/\r?\n/);
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n].trim();
    const number = n + 1;
    if (!line || line.startsWith("//")) continue;
    if (line.startsWith("{")) {
      if (ent === null) ent = new Entity();
      else if (faces === null) faces = [];
      else throw new MapError(`linea ${number}: llave de mas`);
      continue;
    }
    if (line.startsWith("}")) {
      if (faces !== null) {
        if (faces.length >= 4) ent.brushes.push(new Brush(faces));
        faces = null;
      } else if (ent !== null) {
        entities.push(ent);
        ent = null;
      } else {
        throw new MapError(`linea ${number}: llave de cierre sin abrir`);
      }
      continue;
    }
    if (ent === null) {
      throw new MapError(`linea ${number}: contenido fuera de toda entidad`);
    }
    if (faces !== null) {
      const face = parseFace(line);
      if (face !== null) faces.push(face);
      continue;
    }
    const kv = KV.exec(line);
    if (kv) ent.props[kv[1]] = kv[2];
  }
  if (ent !== null || faces !== null) {
    throw new MapError("el archivo termina con una llave sin cerrar");
  }
  if (!entities.length) throw new MapError("no hay ninguna entidad");
  return entities;
}
