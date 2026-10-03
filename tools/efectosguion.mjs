// LOS GUIONES DE EFECTO — `applyeffect`.
//
//     npm run efectos:guion
//
// Un efecto de Master Sword es OTRO guion que se pega a una entidad: el veneno,
// el fuego, la cura del sacerdote y hasta el sentarse del jugador son archivos
// `.script` que el motor añade a la lista de guiones del objetivo
// (`CGlobalScriptedEffects::ApplyEffect`, scriptedeffects.cpp:25-58). Ver
// `src/play/efectos.js`, con las citas.
//
// Esto hornea la tabla que el navegador necesita para montarlos: los archivos
// UNA vez y con sus `#include` sin resolver —lo resuelve `src/play/cargador.js`
// en el orden del motor—, igual que `tools/objetosguion.mjs`. Va a `build/msr/`
// y no al mapa porque un efecto no es de ningún mapa.
//
// ── QUÉ SE HORNEA, Y POR QUÉ ESTE CONJUNTO ─────────────────────────────────
//
// Todo `effects/` (con subcarpetas) MÁS lo que una línea `applyeffect` nombre
// con todas sus letras fuera de esa carpeta —`player/emote_sit&stand`, que se
// pone al entrar en el mundo, es el caso que importa—. Lo que se nombra con una
// variable (`applyeffect PARAM2 DOT_EFFECT …`) no se puede resolver sin correr
// el guion, y se CUENTA en vez de callarse: un filtro callado esconde un pueblo
// (el 63).
//
// La regla del 02: los `.script` se quedan en `../MSC/`, lo extraído va a
// `build/`, y no se mueve un byte a `public/`.

import { writeFileSync, mkdirSync, readdirSync, statSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { partirGuion, COMANDOS } from "../src/play/guion.js";
import { resolverGuion } from "../src/play/cargador.js";
import { leerScript, RAIZ_POR_OMISION } from "./scriptsmsr.mjs";
import { posicionalesDe } from "./mapa.mjs";

const RAIZ = posicionalesDe()[0] ?? RAIZ_POR_OMISION;
const SALIDA_DIR = "build/msr";
const SALIDA = join(SALIDA_DIR, "efectosguion.json");

/** Todos los `.script` bajo una carpeta, como rutas del motor sin extensión. */
function scriptsBajo(dir) {
  const fuera = [];
  const paseo = (d) => {
    for (const n of readdirSync(d)) {
      const f = join(d, n);
      if (statSync(f).isDirectory()) paseo(f);
      else if (n.toLowerCase().endsWith(".script")) fuera.push(relative(RAIZ, f).replace(/\\/g, "/").replace(/\.script$/i, ""));
    }
  };
  paseo(dir);
  return fuera;
}

// ── 1. LO QUE LOS GUIONES APLICAN, CONTADO ──────────────────────────────────
const todos = scriptsBajo(RAIZ);
const nombrados = new Map();     // ruta literal -> veces
const porVariable = new Map();   // nombre de variable -> veces
let lineas = 0;
for (const r of todos) {
  const t = readFileSync(join(RAIZ, `${r}.script`), "latin1");
  for (const l of t.split(/\r?\n/)) {
    const m = /^\s*(?:if\b.*\)\s*)?applyeffect\s+(\S+)\s+(\S+)/i.exec(l);
    if (!m) continue;
    lineas++;
    const que = m[2].replace(/^["']|["']$/g, "");
    if (que.includes("/")) nombrados.set(que, (nombrados.get(que) ?? 0) + 1);
    else porVariable.set(que, (porVariable.get(que) ?? 0) + 1);
  }
}

const deEfectos = scriptsBajo(join(RAIZ, "effects"));
const pedidos = new Set([...deEfectos, ...nombrados.keys()]);

// ── 2. LA TABLA ─────────────────────────────────────────────────────────────
const archivos = {};
const leer = (ruta) => {
  if (Object.hasOwn(archivos, ruta)) return archivos[ruta] || null;
  const t = leerScript(ruta, RAIZ);
  archivos[ruta] = t === null ? null : partirGuion(t);
  return archivos[ruta];
};

const faltanDe = (cmds, acc) => {
  for (const c of cmds ?? []) {
    if (!COMANDOS.has(c.nombre)) acc.set(c.nombre, (acc.get(c.nombre) ?? 0) + 1);
    faltanDe(c.hijos, acc);
    for (const r of c.sino ?? []) faltanDe(r, acc);
  }
  return acc;
};

const efectos = {};
const noEstan = [];
const global = new Map();
for (const ruta of [...pedidos].sort()) {
  const g = resolverGuion(ruta, leer, new Set());
  if (!g.eventos.length) { noEstan.push(ruta); continue; }
  const acc = new Map();
  for (const e of g.eventos) faltanDe(e.cmds, acc);
  for (const [k, v] of acc) global.set(k, (global.get(k) ?? 0) + v);
  efectos[ruta] = { archivos: g.archivos, faltan: [...acc.keys()].sort(), sinResolver: g.faltan };
}

const tabla = {};
for (const ruta of Object.keys(archivos)) if (archivos[ruta]) tabla[ruta] = { piezas: archivos[ruta].piezas };

const caben = Object.entries(efectos).filter(([, f]) => !f.faltan.length).map(([r]) => r);
console.log(`\n  applyeffect        ${lineas} líneas en los ${todos.length} guiones`);
console.log(`  con ruta escrita    ${[...nombrados.values()].reduce((a, b) => a + b, 0)} (${nombrados.size} rutas)`);
console.log(`  con una variable    ${[...porVariable.values()].reduce((a, b) => a + b, 0)} — no se pueden resolver sin correr el guion`);
console.log(`  EFECTOS horneados   ${Object.keys(efectos).length}, ${Object.keys(tabla).length} archivos`);
console.log(`  caben enteros       ${caben.length}: ${caben.join(", ")}`);
if (noEstan.length) console.log(`  nombrados y no están  ${noEstan.join(", ")}`);
const ranking = [...global].sort((a, b) => b[1] - a[1]);
console.log(`\n  COMANDOS QUE FALTAN en los efectos (${ranking.length} distintos)`);
console.log(`    ${ranking.slice(0, 14).map(([k, v]) => `${k} x${v}`).join(", ")}`);

mkdirSync(SALIDA_DIR, { recursive: true });
const json = JSON.stringify({
  procedencia: `${RAIZ}/effects/**.script, más las rutas que nombra un applyeffect, y sus #include. Leídos, no copiados. No redistribuible.`,
  raiz: RAIZ,
  criterio: "todo effects/ más lo que una línea applyeffect nombra con su ruta escrita",
  descartados: { porVariable: Object.fromEntries(porVariable), noEstan },
  archivos: tabla,
  efectos,
}, null, 1);
writeFileSync(SALIDA, json);
console.log(`\n  escrito ${SALIDA}  (${(json.length / 1e6).toFixed(2)} MB)\n`);
