// EL JUEZ DEL MAPA DE LUZ: la pantalla contra lo que dicen los archivos.
//
//   node tools/juez_luz.mjs                       la vista de la calle
//   node tools/juez_luz.mjs --pos "..." --yaw 180 --paso 8
//
// ── Por qué existe, con el número delante ──────────────────────────────────
//
// Porque **397 comprobaciones pasaron en verde sobre un mundo al que no le
// llegaba el mapa de luz**. Ni una sola miraba la pantalla y le preguntaba de
// dónde había salido el color.
//
// El fallo: desde r152 Three.js no tiene un juego de UV reservado para el
// `lightMap` — cada textura dice cuál usa en `texture.channel`, y `channel` vale
// CERO de fábrica, o sea `uv`. La geometría traía su `uv1` bien calculada y nadie
// la leía. El atlas se muestreaba con las UV de la TEXTURA, que van de −30 a 30 y
// que `ClampToEdge` pega al borde: cada cara recibía un valor casi constante.
//
// **Un mapa de luz plano se parece muchísimo a un mapa de luz que funciona.**
// Lo que no se parece a nada es un número: aquí cada píxel se predice desde el
// archivo y se compara con el que pintó la tarjeta.
//
// ── Y su control, que es la mitad del juez ─────────────────────────────────
//
// Se predice DOS veces: una muestreando el atlas con `uv1` (lo correcto) y otra
// con `uv` (el fallo). El juez no dice «cuadra»: dice CUÁL de las dos cuadra. Un
// juez que sólo sabe decir que sí es lo que ya falló seis veces en este
// experimento.

import { spawn } from "node:child_process";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { leerPng, escribirPng } from "./png.mjs";
import { UNIDADES_POR_METRO } from "../src/bsp/lector.js";
import { NIEBLA, ALCANCE_NIEBLA } from "../src/render/bsp_escena.js";
import { varianteEnT } from "../src/bsp/luz.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "build", "gatecity", "vistas");
const U = UNIDADES_POR_METRO;
const PORT = 5202;
const arg = (n, d = null) => {
  const i = process.argv.indexOf(n);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

if (!existsSync(join(ROOT, "build/gatecity/malla.json"))) {
  console.error("falta build/gatecity/malla.json — ejecuta primero: npm run gatecity");
  process.exit(2);
}

const man = JSON.parse(readFileSync(join(ROOT, "build/gatecity/malla.json"), "utf8"));
const bin = readFileSync(join(ROOT, "build/gatecity/malla.bin"));
// LOS ATLAS, uno por cubo de estilos de luz y una variante por estado del
// parpadeo. La captura se toma con el bucle pausado, o sea en el instante que
// diga `--t` (cero por defecto), y aquí se predice con esa misma variante: si
// el juez mirara otra, acusaría al parpadeo de ser un fallo de UV.
const RELOJ = Number(arg("--t") ?? 0);
const atlasPorCubo = new Map(
  (man.luz.cubos ?? [{ clave: "quieta", estilos: [], variantes: [man.luz.archivo] }]).map((c) => [
    c.clave,
    { estilos: c.estilos, imagenes: c.variantes.map((a) => leerPng(join(ROOT, "build/gatecity", a))) },
  ])
);
const atlasDe = (g) => {
  const c = atlasPorCubo.get(g.cubo ?? "quieta") ?? atlasPorCubo.get("quieta");
  return c.imagenes[varianteEnT(c.estilos, RELOJ) % c.imagenes.length];
};
const T = man.bin.tramos;
const pos = new Float32Array(bin.buffer, bin.byteOffset + T.positions.off, T.positions.n);
const uv0 = new Float32Array(bin.buffer, bin.byteOffset + T.uvs.off, T.uvs.n);
const uv1 = new Float32Array(bin.buffer, bin.byteOffset + T.uvs1.off, T.uvs1.n);
const idx = new Uint32Array(bin.buffer, bin.byteOffset + T.indices.off, T.indices.n);

// Las texturas del mundo, por nombre de grupo.
const texturas = new Map();
for (const t of man.texturas) {
  const ruta = join(ROOT, "build/gatecity", t.archivo ?? `tex/${t.nombre}.png`);
  if (existsSync(ruta)) texturas.set(t.nombre, leerPng(ruta));
}

// A qué grupo pertenece cada triángulo. Se indexa una vez: recorrer los 100
// grupos por cada rayo multiplica el trabajo por cien sin que se note.
const grupoPorTri = new Int16Array(idx.length / 3).fill(-1);
man.grupos.forEach((g, k) => {
  for (let i = g.start; i < g.start + g.count; i += 3) grupoPorTri[i / 3] = k;
});

const muestrea = (img, u, v, repetir) => {
  if (!img) return null;
  let x = repetir ? ((u % 1) + 1) % 1 : Math.min(1, Math.max(0, u));
  let y = repetir ? ((v % 1) + 1) % 1 : Math.min(1, Math.max(0, v));
  const px = Math.min(img.ancho - 1, Math.max(0, Math.floor(x * img.ancho)));
  const py = Math.min(img.alto - 1, Math.max(0, Math.floor(y * img.alto)));
  const o = (py * img.ancho + px) * 4;
  return [img.rgba[o], img.rgba[o + 1], img.rgba[o + 2]];
};

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
  if (dist <= 1e-4) return null;
  // Con una sola cara, como dibuja el mundo: `det > 0` es el triángulo de espaldas.
  const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  if (n[0] * d[0] + n[1] * d[1] + n[2] * d[2] >= 0) return null;
  return { dist, u, v };
}

const hud = (arg("--pos") ?? "-217 -575 577").trim().split(/[\s,]+/).map(Number);
const ojo = [hud[0] / U, hud[1] / U + 1.7, hud[2] / U];
const yaw = (Number(arg("--yaw", "180")) * Math.PI) / 180;
const pitch = (Number(arg("--pitch", "0")) * Math.PI) / 180;
const ancho = Number(arg("--ancho", "960"));
const alto = Number(arg("--alto", "640"));
const paso = Number(arg("--paso", "6"));
const FOV = 75;

function rayo(px, py) {
  const th = Math.tan((FOV * Math.PI) / 360);
  const x = ((px + 0.5) / ancho * 2 - 1) * th * (ancho / alto);
  const y = (1 - (py + 0.5) / alto * 2) * th;
  let d = [x, y, -1];
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  d = [d[0], d[1] * cp - d[2] * sp, d[1] * sp + d[2] * cp];
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  d = [d[0] * cy + d[2] * sy, d[1], -d[0] * sy + d[2] * cy];
  const l = Math.hypot(...d);
  return [d[0] / l, d[1] / l, d[2] / l];
}

function primero(d) {
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

// La niebla, igual que la monta `escenaDelMapa`: `FogExp2` y mezcla en el
// fragmento. A diez metros no llega al 1 %, pero al fondo de una galeria si.
const caja = man.caja;
const lejos = Math.hypot(caja.max[0] - caja.min[0], caja.max[2] - caja.min[2]);
const densidad = ALCANCE_NIEBLA / Math.max(1, lejos);
const nieblaRGB = [(NIEBLA >> 16) & 255, (NIEBLA >> 8) & 255, NIEBLA & 255];

// --- el fotograma, sin adornos, sin carteles y sin glow ----------------------
//
// Los cuatro se quitan a proposito: lo que este juez sabe predecir es el MUNDO
// —textura por mapa de luz— y mezclar en la pantalla cosas que no sabe predecir
// convierte su desacuerdo en ruido que tapa el que importa.
const server = await new Promise((res, rej) => {
  const p = spawn(process.execPath,
    [join(ROOT, "node_modules/vite/bin/vite.js"), "--port", String(PORT), "--strictPort"],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  const t = setTimeout(() => rej(new Error("vite no arranco")), 30000);
  p.stdout.on("data", (d) => { if (d.toString().includes("ready in")) { clearTimeout(t); res(p); } });
  p.on("error", rej);
});
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: ancho, height: alto } });
await page.goto(`http://localhost:${PORT}/?map=gatecity`, { waitUntil: "load" });
await page.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
const crudo = await page.evaluate(({ ojoU, yaw, pitch }) => {
  const p = window.probe;
  p.pause(); p.setGlow(false); p.setAdornos(false); p.setCarteles(false);
  // Y la segunda pasada de DETALLE, que multiplica por `2·detalle` encima. Este
  // juez mide una cosa —textura por mapa de luz— y mezclar la otra convierte su
  // desacuerdo en ruido. El detalle tiene su propio control: conserva la mediana
  // y sube el contraste local, y eso se mide aparte.
  p.setDetalle(false);
  p.fly(ojoU, yaw, pitch);
  const c = document.getElementById("view");
  const gl = c.getContext("webgl2") ?? c.getContext("webgl");
  const px = new Uint8Array(c.width * c.height * 4);
  gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return { datos: Array.from(px), ancho: c.width, alto: c.height };
}, { ojoU: [hud[0], -hud[2], hud[1] + 1.7 * U], yaw, pitch });
await browser.close();
server.kill();

const pant = new Uint8Array(crudo.datos.length);
for (let y = 0; y < crudo.alto; y++) {
  const s = (crudo.alto - 1 - y) * crudo.ancho * 4;
  pant.set(crudo.datos.slice(s, s + crudo.ancho * 4), y * crudo.ancho * 4);
}
mkdirSync(OUT, { recursive: true });
escribirPng(join(OUT, "juez-pantalla.png"), pant, crudo.ancho, crudo.alto);

// --- el juicio ---------------------------------------------------------------

const razones = { uv1: [], uv: [] };
let mirados = 0, saltados = 0;
const mapaPred = new Uint8Array(ancho * alto * 4);

for (let py = 0; py < alto; py += paso) {
  for (let px = 0; px < ancho; px += paso) {
    const h = primero(rayo(px, py));
    if (!h) { saltados++; continue; }
    const g = man.grupos[grupoPorTri[h.i / 3]];
    // Solo lo que este juez sabe predecir: opaco, con textura y con mapa de luz.
    if (!g || g.render || g.clase === "cielo" || g.clase === "agua") { saltados++; continue; }
    const img = texturas.get(g.texture);
    if (!img) { saltados++; continue; }

    const v = [idx[h.i], idx[h.i + 1], idx[h.i + 2]];
    const w = [1 - h.u - h.v, h.u, h.v];
    const iu = (a, k) => w[0] * a[v[0] * 2 + k] + w[1] * a[v[1] * 2 + k] + w[2] * a[v[2] * 2 + k];
    const tu = iu(uv0, 0), tv = iu(uv0, 1);
    const lu = iu(uv1, 0), lv = iu(uv1, 1);

    const tex = muestrea(img, tu, -tv, true);        // la V se emitio volteada
    const atlas = atlasDe(g);
    const luzBien = muestrea(atlas, lu, lv, false);  // con uv1: lo correcto
    const luzMal = muestrea(atlas, tu, tv, false);   // con uv: el fallo, que es el control

    const f = 1 - Math.exp(-((h.dist * densidad) ** 2));
    const o = (py * ancho + px) * 4;
    const obs = [pant[o], pant[o + 1], pant[o + 2]];
    const luzObs = 0.2126 * obs[0] + 0.7152 * obs[1] + 0.0722 * obs[2];
    if (luzObs < 2) { saltados++; continue; } // un negro no dice nada de una razon

    for (const [clave, lm] of [["uv1", luzBien], ["uv", luzMal]]) {
      let s = 0;
      for (let k = 0; k < 3; k++) {
        const p = ((tex[k] * lm[k]) / 255) * (1 - f) + nieblaRGB[k] * f;
        s += 0.2126 * (k === 0 ? p : 0) + 0.7152 * (k === 1 ? p : 0) + 0.0722 * (k === 2 ? p : 0);
      }
      if (s > 2) razones[clave].push(luzObs / s);
    }
    // El mapa de la prediccion buena, para poder MIRARLO al lado del fotograma.
    for (let dy = 0; dy < paso && py + dy < alto; dy++)
      for (let dx = 0; dx < paso && px + dx < ancho; dx++) {
        const q = ((py + dy) * ancho + (px + dx)) * 4;
        for (let k = 0; k < 3; k++)
          mapaPred[q + k] = Math.min(255, Math.round(((tex[k] * luzBien[k]) / 255) * (1 - f) + nieblaRGB[k] * f));
        mapaPred[q + 3] = 255;
      }
    mirados++;
  }
}
escribirPng(join(OUT, "juez-prediccion.png"), mapaPred, ancho, alto);

const resumen = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return {
    n: s.length,
    mediana: s[(s.length / 2) | 0],
    dentro: s.filter((r) => r > 0.8 && r < 1.25).length / s.length,
  };
};
const bien = resumen(razones.uv1), mal = resumen(razones.uv);

console.log(`\n  EL JUEZ DEL MAPA DE LUZ — ${mirados} pixeles predichos desde el archivo, ${saltados} saltados`);
console.log(`  (vista ${hud.join(" ")} rumbo ${arg("--yaw", "180")}, sin adornos, sin carteles y sin glow)\n`);
console.log(`                            razon pantalla/prediccion   dentro de ±20 %`);
console.log(`  atlas muestreado con uv1        ${bien.mediana.toFixed(3).padStart(8)}          ${(bien.dentro * 100).toFixed(1).padStart(6)} %   <- lo correcto`);
console.log(`  atlas muestreado con uv         ${mal.mediana.toFixed(3).padStart(8)}          ${(mal.dentro * 100).toFixed(1).padStart(6)} %   <- el control: el fallo`);
console.log(`\n  build/gatecity/vistas/juez-pantalla.png  y  juez-prediccion.png\n`);

// El veredicto, con las dos condiciones. La segunda es la que lo convierte en un
// juez: si las dos predicciones cuadran igual de bien, este juez no distingue
// nada y su «cuadra» no vale como respuesta.
const separa = bien.dentro - mal.dentro;
if (bien.dentro < 0.8) {
  console.error(`  FALLO: solo el ${(bien.dentro * 100).toFixed(1)} % de los pixeles sale de multiplicar ` +
    `la textura por el mapa de luz que dice su uv1. La pantalla no esta pintando lo que dice el archivo.`);
  process.exit(1);
}
if (separa < 0.2) {
  console.error(`  FALLO DE JUEZ: las dos predicciones cuadran casi igual (${(separa * 100).toFixed(1)} puntos). ` +
    `Sin control positivo, este numero no significa nada.`);
  process.exit(1);
}
console.log(`  CUADRA: el ${(bien.dentro * 100).toFixed(1)} % con uv1 contra el ${(mal.dentro * 100).toFixed(1)} % con uv, ` +
  `${(separa * 100).toFixed(0)} puntos de separacion.`);
