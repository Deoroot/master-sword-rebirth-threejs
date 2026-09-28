// Inspector del kit CC0 "PSX style going medieval" de valsekamerplant.
//
// La pregunta que contesta no es "que trae el pack" -eso lo dice un `ls`- sino
// las cuatro que deciden si el kit sirve como kit:
//
//   1. Las piezas miden numeros redondos? Un muro de 1.0034 m no es un modulo,
//      es un adorno: al ponerlo doce veces se acumulan 4 cm de rendija.
//   2. Donde esta el origen? Si el pivote esta en el centro, colocar por celdas
//      obliga a media pieza de correccion en cada eje; si esta en una esquina,
//      la celda es la posicion y ya.
//   3. Cuantas texturas distintas usa el pack? Una sola quiere decir que todo
//      el pueblo puede ser un material y, con eso, fusionable en una malla.
//   4. Cuantos triangulos, para saber si un hamlet cabe en el presupuesto.
//
// Nada de esto se mira: se lee del propio archivo. Un .glb es una cabecera de
// 12 bytes, un trozo de JSON y un trozo de binario. Los accesores de POSITION
// traen min y max ya calculados por el exportador, asi que la caja de cada
// pieza sale de sumar esas cajas transformadas por el arbol de nodos -sin
// decodificar un solo vertice.
//
//   node tools/kit.mjs                     resumen de todo el pack
//   node tools/kit.mjs "Building blocks"   solo una carpeta
//   node tools/kit.mjs --json              la tabla entera, para otro programa
//
// Aviso que vale una sesion: los .glb del pack traen la conversion de ejes de
// glTF (Y arriba, -Z adelante). Este proyecto usa unidades de Quake con Z
// arriba. Aqui se informa en METROS y en ejes glTF, tal cual estan en disco; la
// conversion es del colocador, no del medidor. Un medidor que ademas convierte
// es un medidor del que no te puedes fiar.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PACK = "C:/Users/User/Documents/Visual Studio Projects/Mydra Ages/assets/bought_assets/PSX style going medieval by valsekamerplant";

const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

/** Lee un .glb y devuelve su JSON y el trozo binario, sin decodificar mallas. */
export function readGlb(path) {
  const buf = readFileSync(path);
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546c67) throw new Error(`${path}: no empieza por 'glTF'`);
  const version = buf.readUInt32LE(4);
  if (version !== 2) throw new Error(`${path}: glTF version ${version}, se esperaba 2`);
  const total = buf.readUInt32LE(8);
  if (total !== buf.length) {
    throw new Error(`${path}: la cabecera dice ${total} bytes y el archivo tiene ${buf.length}`);
  }

  let off = 12;
  let json = null;
  let bin = null;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === JSON_CHUNK) json = JSON.parse(data.toString("utf8"));
    else if (type === BIN_CHUNK) bin = data;
    off += 8 + len + ((4 - (len % 4)) % 4) * 0; // los trozos ya vienen alineados a 4
  }
  if (!json) throw new Error(`${path}: no trae trozo JSON`);
  return { json, bin, bytes: buf.length };
}

// --- matrices 4x4, en el orden de columnas de glTF --------------------------

export const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = s;
    }
  }
  return out;
}

/** Traslacion, rotacion (cuaternion) y escala a matriz, como manda la spec. */
export function trsToMatrix(node) {
  if (node.matrix) return node.matrix.slice();
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

export function transformPoint(m, [x, y, z]) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

/**
 * La caja de una pieza, en el espacio del archivo.
 *
 * Se transforman las OCHO esquinas de la caja de cada accesor, no min y max
 * sueltos: con una rotacion de 90 grados -que estos .glb traen, por la
 * conversion de ejes del exportador- transformar solo dos esquinas da una caja
 * que no contiene la pieza, y el fallo no se nota porque el numero que sale es
 * plausible.
 */
export function measure(json) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let triangles = 0;
  let vertices = 0;
  let primitives = 0;
  const materials = new Set();

  const walk = (index, parent) => {
    const node = json.nodes[index];
    const world = multiply(parent, trsToMatrix(node));
    if (node.mesh !== undefined) {
      for (const prim of json.meshes[node.mesh].primitives ?? []) {
        primitives++;
        if (prim.material !== undefined) materials.add(prim.material);
        const pos = json.accessors[prim.attributes?.POSITION];
        if (pos) {
          vertices += pos.count;
          const n = prim.indices !== undefined ? json.accessors[prim.indices].count : pos.count;
          // mode 4 es TRIANGLES, y es el unico que cuenta en tercios.
          if ((prim.mode ?? 4) === 4) triangles += n / 3;
          if (pos.min && pos.max) {
            for (let corner = 0; corner < 8; corner++) {
              const p = transformPoint(world, [
                corner & 1 ? pos.max[0] : pos.min[0],
                corner & 2 ? pos.max[1] : pos.min[1],
                corner & 4 ? pos.max[2] : pos.min[2],
              ]);
              for (let i = 0; i < 3; i++) {
                if (p[i] < min[i]) min[i] = p[i];
                if (p[i] > max[i]) max[i] = p[i];
              }
            }
          }
        }
      }
    }
    for (const child of node.children ?? []) walk(child, world);
  };

  const scene = json.scenes?.[json.scene ?? 0];
  for (const root of scene?.nodes ?? []) walk(root, IDENTITY);

  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]].map((v) =>
    Number.isFinite(v) ? v : 0
  );
  return {
    min: min.map((v) => (Number.isFinite(v) ? v : 0)),
    max: max.map((v) => (Number.isFinite(v) ? v : 0)),
    size,
    triangles,
    vertices,
    primitives,
    materials: materials.size,
    // Las texturas se listan por su imagen, que es lo que de verdad se comparte
    // entre piezas: dos materiales distintos con el mismo PNG son una sola
    // carga de GPU si se fusionan.
    images: (json.images ?? []).map((im, i) => im.uri ?? im.name ?? `imagen ${i}`),
  };
}

/** Cuanto se aleja un numero del multiplo de `step` mas cercano. */
function gridError(value, step) {
  return Math.abs(value - Math.round(value / step) * step);
}

export function inspect(path) {
  const { json, bytes } = readGlb(path);
  const m = measure(json);
  return { path, bytes, ...m, generator: json.asset?.generator ?? "?" };
}

function glbsUnder(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    // 'source' son los .blend y .fbx originales: no se inspeccionan, no se usan.
    if (entry.isDirectory()) {
      if (entry.name.toLowerCase() !== "source") out.push(...glbsUnder(p));
    } else if (entry.name.toLowerCase().endsWith(".glb")) out.push(p);
  }
  return out;
}

// --- informe ----------------------------------------------------------------

// Comparar con pathToFileURL y no montando la cadena a mano: las rutas de este
// proyecto tienen espacios, que en una URL van como %20, y la comparacion
// ingenua falla en silencio -el programa no da error, simplemente no imprime.
// El `?? ""` no es adorno: al importar este modulo desde `node -e` no hay
// argv[1], y resolve(undefined) revienta antes de que nadie llegue a medir nada.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const only = args.find((a) => !a.startsWith("--"));
  const root = only ? join(PACK, only) : PACK;

  if (!statSync(root, { throwIfNoEntry: false })) {
    console.error(`no existe: ${root}`);
    process.exit(2);
  }

  const files = glbsUnder(root);
  const rows = [];
  const broken = [];
  for (const f of files) {
    try {
      rows.push(inspect(f));
    } catch (e) {
      broken.push(`${basename(f)}: ${e.message}`);
    }
  }

  if (asJson) {
    console.log(JSON.stringify({ rows, broken }, null, 2));
    process.exit(0);
  }

  // Pieza a pieza. El resumen dice cuantas encajan en la rejilla; esto dice
  // CUALES, que es lo unico que sirve para decidir si el kit se usa: que las
  // flores no midan un metro da igual, que los muros no lo midan lo cambia todo.
  if (args.includes("--list")) {
    const f = (v) => v.toFixed(3).padStart(7);
    for (const r of [...rows].sort((a, b) => a.path.localeCompare(b.path))) {
      console.log(
        `${basename(r.path, ".glb").padEnd(42)} ` +
          `${f(r.size[0])} x ${f(r.size[1])} x ${f(r.size[2])}   ` +
          `suelo ${f(r.min[1])}   ` +
          `${String(r.triangles).padStart(5)} tri   ${r.images.join(",")}`
      );
    }
    process.exit(0);
  }

  console.log(`\n${rows.length} piezas leidas de ${relative(PACK, root) || "todo el pack"}\n`);

  // 1. Cuantas imagenes distintas hay en todo el pack.
  const allImages = new Map();
  for (const r of rows) for (const im of r.images) allImages.set(im, (allImages.get(im) ?? 0) + 1);
  console.log(`Imagenes distintas en todo el pack: ${allImages.size}`);
  for (const [im, n] of [...allImages].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`   ${String(n).padStart(4)} piezas  ${im}`);
  }

  // 2. La rejilla. Se prueban varios pasos y se cuenta cuantas piezas encajan
  //    con menos de 1 mm de error; el paso ganador es el modulo del kit.
  console.log(`\nRejilla: piezas cuyo ancho y fondo son multiplo exacto (< 1 mm)`);
  for (const step of [0.5, 1, 2, 4]) {
    const fit = rows.filter(
      (r) => gridError(r.size[0], step) < 0.001 && gridError(r.size[2], step) < 0.001
    ).length;
    console.log(`   paso ${String(step).padStart(4)} m   ${String(fit).padStart(4)} de ${rows.length}`);
  }

  // 3. Alturas, que es lo que decide si los pisos apilan.
  const heights = new Map();
  for (const r of rows) {
    const h = r.size[1].toFixed(3);
    heights.set(h, (heights.get(h) ?? 0) + 1);
  }
  console.log(`\nAlturas mas repetidas (metros):`);
  for (const [h, n] of [...heights].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`   ${String(n).padStart(4)} piezas  ${h} m`);
  }

  // 4. El pivote. Si el suelo de la pieza esta en y=0 se apila sola.
  const onFloor = rows.filter((r) => Math.abs(r.min[1]) < 0.001).length;
  const centred = rows.filter(
    (r) => Math.abs(r.min[0] + r.max[0]) < 0.001 && Math.abs(r.min[2] + r.max[2]) < 0.001
  ).length;
  console.log(`\nPivote:`);
  console.log(`   ${onFloor} de ${rows.length} piezas apoyan el origen en el suelo (y = 0)`);
  console.log(`   ${centred} de ${rows.length} piezas estan centradas en X y Z`);

  // 5. Presupuesto.
  const tris = rows.reduce((s, r) => s + r.triangles, 0);
  const sorted = [...rows].sort((a, b) => b.triangles - a.triangles);
  console.log(`\nTriangulos: ${tris} en total, ${(tris / rows.length).toFixed(0)} de media`);
  console.log(`   la mas pesada: ${basename(sorted[0].path)} con ${sorted[0].triangles}`);
  console.log(`   la mas ligera: ${basename(sorted.at(-1).path)} con ${sorted.at(-1).triangles}`);
  console.log(`   generador: ${rows[0].generator}`);

  if (broken.length) {
    console.log(`\n${broken.length} piezas NO se pudieron leer:`);
    for (const b of broken.slice(0, 10)) console.log(`   ${b}`);
    process.exit(1);
  }
  console.log();
}
