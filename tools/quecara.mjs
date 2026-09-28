// ¿QUÉ hay en ese píxel? Un rayo por CPU contra la malla ya emitida.
//
//   node tools/quecara.mjs --pos "-217 -575 577" --yaw 180 --px 155,300
//   node tools/quecara.mjs --pos "..." --yaw 180 --negros      (los que salen a cero)
//
// Hace falta porque las perillas del visor mienten con demasiada facilidad y ya
// van tres: `--sinluz` devolvía el fotograma IDÉNTICO, la de teñir de rosa
// oscurecía la pantalla entera, y `setLuz(false)` no deja el mundo a plena luz
// sino NEGRO, porque `MeshLambertMaterial` sin luz ninguna no emite nada.
//
// Esto no pasa por el navegador. Lee `malla.bin`, lanza el rayo contra los
// triángulos de verdad y dice: qué grupo, qué textura, qué uv1 y qué texel del
// atlas muestrea esa uv1. Con eso, «negro» deja de ser una impresión.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { leerPng } from "./png.mjs";
import { UNIDADES_POR_METRO } from "../src/bsp/lector.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const U = UNIDADES_POR_METRO;
const arg = (n, d = null) => {
  const i = process.argv.indexOf(n);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

const man = JSON.parse(readFileSync(join(ROOT, "build/gatecity/malla.json"), "utf8"));
const bin = readFileSync(join(ROOT, "build/gatecity/malla.bin"));
const atlas = leerPng(join(ROOT, "build/gatecity/luz.png"));
const T = man.bin.tramos;
const pos = new Float32Array(bin.buffer, bin.byteOffset + T.positions.off, T.positions.n);
const uv1 = new Float32Array(bin.buffer, bin.byteOffset + T.uvs1.off, T.uvs1.n);
const idx = new Uint32Array(bin.buffer, bin.byteOffset + T.indices.off, T.indices.n);

// El grupo al que pertenece cada triángulo, por su índice dentro de `indices`.
const grupoDe = (i3) => {
  for (const g of man.grupos) if (i3 >= g.start && i3 < g.start + g.count) return g;
  return null;
};

const texel = (u, v) => {
  const x = Math.min(atlas.ancho - 1, Math.max(0, Math.round(u * atlas.ancho - 0.5)));
  const y = Math.min(atlas.alto - 1, Math.max(0, Math.round(v * atlas.alto - 0.5)));
  const o = (y * atlas.ancho + x) * 4;
  return [atlas.rgba[o], atlas.rgba[o + 1], atlas.rgba[o + 2]];
};

/** Möller–Trumbore. Devuelve la distancia y las baricéntricas, o null. */
function corta(o, d, a, b, c) {
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
  const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  const t = [o[0] - a[0], o[1] - a[1], o[2] - a[2]];
  const u = (t[0] * p[0] + t[1] * p[1] + t[2] * p[2]) * inv;
  if (u < 0 || u > 1) return null;
  const q = [t[1] * e1[2] - t[2] * e1[1], t[2] * e1[0] - t[0] * e1[2], t[0] * e1[1] - t[1] * e1[0]];
  const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) * inv;
  if (v < 0 || u + v > 1) return null;
  const dist = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
  return dist > 1e-4 ? { dist, u, v } : null;
}

const hud = (arg("--pos") ?? "0 0 0").trim().split(/[\s,]+/).map(Number);
// El HUD imprime [x, z, −y] en unidades; la cámara va en metros y ejes de Three.
const ojo = [hud[0] / U, hud[1] / U + 1.7, hud[2] / U];
const yaw = (Number(arg("--yaw", "180")) * Math.PI) / 180;
const pitch = (Number(arg("--pitch", "0")) * Math.PI) / 180;
const ancho = Number(arg("--ancho", "1437"));
const alto = Number(arg("--alto", "893"));
const FOV = 75;

/** La dirección de un píxel, con la misma cámara que el visor. */
function rayo(px, py) {
  const th = Math.tan((FOV * Math.PI) / 360);
  const x = ((px + 0.5) / ancho * 2 - 1) * th * (ancho / alto);
  const y = (1 - (py + 0.5) / alto * 2) * th;
  // La cámara mira a −Z con yaw 0; el orden es el de `camera.rotation.set(pitch, yaw, 0)`.
  let d = [x, y, -1];
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  d = [d[0], d[1] * cp - d[2] * sp, d[1] * sp + d[2] * cp];
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  d = [d[0] * cy + d[2] * sy, d[1], -d[0] * sy + d[2] * cy];
  const l = Math.hypot(...d);
  return [d[0] / l, d[1] / l, d[2] / l];
}

function lanzar(d) {
  let mejor = null;
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const r = corta(ojo, d,
      [pos[a], pos[a + 1], pos[a + 2]],
      [pos[b], pos[b + 1], pos[b + 2]],
      [pos[c], pos[c + 1], pos[c + 2]]);
    if (r && (!mejor || r.dist < mejor.dist)) mejor = { ...r, i };
  }
  return mejor;
}

function describe(h) {
  if (!h) return "  (el rayo no choca con nada)";
  const g = grupoDe(h.i);
  const v = [idx[h.i], idx[h.i + 1], idx[h.i + 2]];
  // La uv1 interpolada en el punto del choque, que es la que muestrea la tarjeta.
  const w = [1 - h.u - h.v, h.u, h.v];
  const u = w[0] * uv1[v[0] * 2] + w[1] * uv1[v[1] * 2] + w[2] * uv1[v[2] * 2];
  const t = w[0] * uv1[v[0] * 2 + 1] + w[1] * uv1[v[1] * 2 + 1] + w[2] * uv1[v[2] * 2 + 1];
  const c = texel(u, t);
  const alNegro = Math.abs(u - man.luz.negro[0]) < 2e-3 && Math.abs(t - man.luz.negro[1]) < 2e-3;
  return `  ${(g?.texture ?? "?").padEnd(16)} ${(g?.clase ?? "").padEnd(7)} ` +
    `modo ${g?.render?.modo ?? 0}  a ${(h.dist).toFixed(2)} m  ` +
    `uv1 ${u.toFixed(4)},${t.toFixed(4)} -> atlas (${Math.round(u * atlas.ancho)},${Math.round(t * atlas.alto)}) = ` +
    `${c.join(" ")}${alNegro ? "   <- EL LUXEL NEGRO RESERVADO" : ""}`;
}

/** Todos los choques del rayo, ordenados, con su lado. Es lo que dice si lo que
 *  la tarjeta pinta es el primero o el segundo. */
function todos(d) {
  const out = [];
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const A = [pos[a], pos[a + 1], pos[a + 2]];
    const B = [pos[b], pos[b + 1], pos[b + 2]];
    const C = [pos[c], pos[c + 1], pos[c + 2]];
    const r = corta(ojo, d, A, B, C);
    if (!r) continue;
    // La normal geométrica con el bobinado de Three.js (antihorario = frontal).
    const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const frontal = n[0] * d[0] + n[1] * d[1] + n[2] * d[2] < 0;
    out.push({ ...r, i, frontal });
  }
  return out.sort((a, b) => a.dist - b.dist);
}

if (arg("--px")) {
  for (const s of arg("--px").split(";")) {
    const [px, py] = s.split(",").map(Number);
    console.log(`(${px},${py})`);
    for (const h of todos(rayo(px, py)).slice(0, Number(arg("--capas", "3"))))
      console.log(`   ${h.frontal ? "frontal" : "TRASERA"} ${describe(h).trim()}`);
  }
} else {
  // Sin píxel concreto: una rejilla, y el censo de lo que muestrea NEGRO.
  const paso = Number(arg("--paso", "16"));
  const censo = new Map();
  let n = 0, negros = 0;
  for (let py = 0; py < alto; py += paso) {
    for (let px = 0; px < ancho; px += paso) {
      const h = lanzar(rayo(px, py));
      n++;
      if (!h) continue;
      const g = grupoDe(h.i);
      const v = [idx[h.i], idx[h.i + 1], idx[h.i + 2]];
      const w = [1 - h.u - h.v, h.u, h.v];
      const u = w[0] * uv1[v[0] * 2] + w[1] * uv1[v[1] * 2] + w[2] * uv1[v[2] * 2];
      const t = w[0] * uv1[v[0] * 2 + 1] + w[1] * uv1[v[1] * 2 + 1] + w[2] * uv1[v[2] * 2 + 1];
      const c = texel(u, t);
      const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      const clave = g?.texture ?? "?";
      const e = censo.get(clave) ?? { n: 0, negro: 0, suma: 0, alNegro: 0 };
      e.n++; e.suma += l;
      if (l < 4) e.negro++;
      if (Math.abs(u - man.luz.negro[0]) < 2e-3 && Math.abs(t - man.luz.negro[1]) < 2e-3) e.alNegro++;
      censo.set(clave, e);
      if (l < 4) negros++;
    }
  }
  console.log(`  ${n} rayos, ${negros} (${((negros / n) * 100).toFixed(1)} %) muestrean un texel NEGRO del atlas\n`);
  console.log("  textura            rayos   luz media   texel negro   al luxel reservado");
  for (const [k, e] of [...censo].sort((a, b) => b[1].n - a[1].n).slice(0, 20))
    console.log(`  ${k.padEnd(18)} ${String(e.n).padStart(6)}   ${(e.suma / e.n).toFixed(1).padStart(9)}   ` +
      `${String(e.negro).padStart(11)}   ${String(e.alNegro).padStart(18)}`);
}
