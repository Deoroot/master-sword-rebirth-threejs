// LOS GUIONES DE LOS OBJETOS — el 66.
//
//     npm run objetos:guion
//
// `npm run objetos` lee las FICHAS de los 760 objetos —peso, valor, daño— y ahí
// se acaba: es un lector, y lo dice en su cabecera. Lo que nadie ejecutaba es
// el COMPORTAMIENTO, que en Master Sword vive en el mismo `.script`.
//
// Y eso es la mitad de «qué le afecta al jugador». El guion del jugador tiene
// **63 eventos que sólo puede llamar un objeto** —`callexternal ent_owner`—, de
// los cuales **23 corren enteros**, y este puerto llamaba a cero:
//
//     { game_deploy   callexternal ent_owner bloodstone_toggle 1 }
//                                    items/item_ring_percept.script:33-36
//
// El caso que lo enseñó lo trajo el usuario de memoria: el hechizo de
// rejuvenecer te curaba deprisa por llevarlo encima. Está escrito, y es un
// bucle que **arranca solo**:
//
//     { passive_regen
//       repeatdelay 0.5
//       if FAN_LOOP >= 1
//       ...
//       if ( MY_CUR_HEALTH < MY_MAX_HEALTH ) givehp MY_PASSIVE_RATE
//                        items/magic_hand_div_rejuvenate.script:155-179
//
// ── POR QUÉ NO SE HORNEAN LOS 760 ───────────────────────────────────────────
//
// Resolver los `#include` de cada objeto y guardar el resultado son **39 191
// eventos y 7,5 MB** sólo para los 154 alcanzables. Pero los objetos comparten
// sus plantillas casi enteras: guardando **los archivos una vez** y la lista de
// `#include` de cada objeto son 189 archivos, 791 eventos y **0,7 MB**, diez
// veces menos. Y es lo que hace el motor, que cachea los scripts y los vuelve a
// recorrer por entidad (`Spawn` sobre el mismo `m.Events`).
//
// El conjunto es **lo alcanzable en los dos mapas portados**: lo que venden sus
// tiendas más lo que trae un personaje nuevo. Ampliarlo es cambiar una lista,
// no el formato.
//
// La regla del 02: los `.script` se quedan en `../MSC/`, lo extraído va a
// `build/`, y no se mueve un byte a `public/`.

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { partirGuion, COMANDOS, repeticionDe } from "../src/play/guion.js";
import { resolverGuion } from "../src/play/cargador.js";
import { leerScript, RAIZ_POR_OMISION } from "./scriptsmsr.mjs";
import { posicionalesDe } from "./mapa.mjs";

const RAIZ = posicionalesDe()[0] ?? RAIZ_POR_OMISION;
const SALIDA_DIR = "build/msr";
const SALIDA = join(SALIDA_DIR, "objetosguion.json");
/** Los mapas portados de los que se saca «qué objetos son alcanzables». */
const MAPAS = ["gatecity", "edana"];

if (!existsSync(join(RAIZ, "items"))) {
  console.error(`No encuentro ${RAIZ}/items. Pásame la carpeta scripts/ de MSR como argumento.`);
  process.exit(1);
}
if (!existsSync("build/msr/objetos.json")) {
  console.error("Falta build/msr/objetos.json. Pasa `npm run objetos` primero.");
  process.exit(1);
}

// ── 1. QUÉ OBJETOS SON ALCANZABLES ──────────────────────────────────────────

const catalogo = JSON.parse(readFileSync("build/msr/objetos.json", "utf8"));
const objetos = Array.isArray(catalogo.objetos) ? catalogo.objetos : Object.values(catalogo.objetos);
const porId = new Map(objetos.map((o) => [o.id, o]));

/** Lo que venden las tiendas de un mapa. `addstoreitem <tienda> <objeto> …`. */
function deLasTiendas(mapa) {
  const f = `build/${mapa}/guiones.json`;
  if (!existsSync(f)) return [];
  const g = JSON.parse(readFileSync(f, "utf8"));
  const ids = [];
  const paseo = (cmds) => {
    for (const c of cmds ?? []) {
      const n = String(c.nombre ?? "").toLowerCase();
      // Los dos nombres del mismo comando: el motor registra el alias.
      if ((n === "addstoreitem" || n === "npcstore.additem") && c.params?.[1]) ids.push(String(c.params[1]));
      paseo(c.hijos);
      for (const r of c.sino ?? []) paseo(r);
    }
  };
  for (const ruta of Object.keys(g.guiones ?? {})) {
    for (const e of g.guiones[ruta].eventos ?? []) paseo(e.cmds);
  }
  return ids;
}

const crudos = new Set();
const sinMapa = [];
for (const m of MAPAS) {
  const ids = deLasTiendas(m);
  if (!ids.length) sinMapa.push(m);
  for (const i of ids) crudos.add(i);
}
// Con lo que se empieza, que no lo vende nadie.
for (const a of catalogo.nuevoPersonaje?.armas ?? []) crudos.add(a);
for (const a of catalogo.nuevoPersonaje?.gratis ?? []) crudos.add(a);

// ── Y LOS HECHIZOS QUE ENSEÑAN LOS PERGAMINOS ───────────────────────────────
//
// Las tiendas venden pergaminos, no hechizos: el hechizo llega al leerlo. Cuál
// llega lo dice un `const` del propio pergamino:
//
//     const BASE_SPELL_SCRIPT "magic_hand_div_rejuvenate"
//                                    items/scroll_rejuvenate.script:2
//
// Ese `const` es justo uno de los que el 66 arregló en el cargador: con los
// `#include` subidos ganaba el de `items/base_tome` y **61 de los 63 pergaminos
// del juego enseñaban `magic_hand_fire_dart`**, el de la plantilla. Se sigue la
// cadena aquí porque si no, el objeto del caso del usuario —el hechizo de
// rejuvenecer, que trae su propio bucle de curación— no entra en la horneada.
const deUnPergamino = (ruta) => {
  const t = leerScript(ruta, RAIZ);
  if (t === null) return null;
  const g = resolverGuion(ruta, (r) => {
    const x = leerScript(r, RAIZ);
    return x === null ? null : partirGuion(x);
  }, new Set());
  for (const e of g.eventos) {
    if (e.nombre) continue;
    for (const c of e.cmds ?? []) {
      if (c.nombre === "const" && c.params?.[0] === "BASE_SPELL_SCRIPT") {
        return String(c.params.slice(1).join(" ")).replace(/^"|"$/g, "");
      }
    }
  }
  return null;
};
const hechizos = new Map();
for (const id of [...crudos]) {
  const o = porId.get(id);
  if (!o) continue;
  const h = deUnPergamino(o.ruta);
  if (!h) continue;
  // El `const` da el nombre suelto; el archivo vive en `items/`.
  const ruta = h.includes("/") ? h : `items/${h}`;
  hechizos.set(id, ruta);
}
for (const ruta of hechizos.values()) {
  const id = ruta.replace(/^items\//, "");
  if (porId.has(id)) crudos.add(id);
  else if (leerScript(ruta, RAIZ) !== null) {
    // El hechizo tiene guion y no ficha en el catálogo de objetos: entra igual,
    // porque lo que se hornea aquí es el GUION.
    porId.set(id, { id, ruta });
    crudos.add(id);
  }
}

// Un `addstoreitem` puede llevar una VARIABLE en vez de un nombre
// (`RND_ITEM`, `$get_array(...)`): eso se resuelve al correr y aquí no hay
// tienda. Se descartan y **se dicen**, que un filtro callado es donde cabe un
// pueblo (la lección del 63 con `msnpc_`).
const esNombre = (s) => /^[a-z][a-z0-9_]*$/.test(s);
const variables = [...crudos].filter((i) => !esNombre(i));
const sinFicha = [...crudos].filter((i) => esNombre(i) && !porId.has(i));
const ids = [...crudos].filter((i) => esNombre(i) && porId.has(i)).sort();

console.log(`\n  ALCANZABLES en ${MAPAS.join(" y ")}   ${ids.length} objetos`);
if (sinMapa.length) console.log(`  sin guiones horneados     ${sinMapa.join(", ")} — pasa \`npm run guiones\``);
if (variables.length) console.log(`  nombres que son variables ${variables.length}  ${variables.slice(0, 4).join(" ")}`);
if (sinFicha.length) console.log(`  sin ficha en el catálogo  ${sinFicha.length}  ${sinFicha.join(" ")}`);

// ── 2. LA TABLA DE ARCHIVOS, UNA VEZ ────────────────────────────────────────
//
// Se guarda `piezas` y no `eventos`, porque `piezas` es el archivo EN ORDEN con
// sus `#include` donde estaban, que es lo que el navegador necesita para
// resolverlos como el motor. Ver `src/play/cargador.js`.

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

/** Los `callexternal ent_owner <ev>` de un guion: lo que le pide al jugador. */
function alJugador(eventos) {
  const fuera = new Set();
  const paseo = (cmds) => {
    for (const c of cmds ?? []) {
      if (c.nombre === "callexternal" && String(c.params?.[0]) === "ent_owner" && c.params?.[1]) {
        fuera.add(String(c.params[1]));
      }
      paseo(c.hijos);
      for (const r of c.sino ?? []) paseo(r);
    }
  };
  for (const e of eventos) paseo(e.cmds);
  return [...fuera];
}

const fichas = {};
let evsTot = 0, evsCaben = 0;
const global = new Map();
const pideAlJugador = new Map();
let conBucle = 0, buclesTot = 0;
for (const id of ids) {
  const o = porId.get(id);
  const g = resolverGuion(o.ruta, leer, new Set());
  const bucles = g.eventos.filter((e) => e.nombre && repeticionDe(e) !== null).map((e) => e.nombre);
  let caben = 0;
  for (const e of g.eventos) {
    if (!e.nombre) continue;
    evsTot++;
    const f = faltanDe(e.cmds, new Map());
    if (f.size === 0) { caben++; evsCaben++; }
    for (const [k, v] of f) global.set(k, (global.get(k) ?? 0) + v);
  }
  const externos = alJugador(g.eventos);
  for (const x of externos) pideAlJugador.set(x, (pideAlJugador.get(x) ?? 0) + 1);
  if (bucles.length) { conBucle++; buclesTot += bucles.length; }
  fichas[id] = {
    ruta: o.ruta,
    archivos: g.archivos,
    faltan: g.faltan,
    eventos: g.eventos.filter((e) => e.nombre).length,
    caben,
    // Los bucles que arrancan solos: es lo que hace que un objeto esté VIVO sin
    // que nadie lo toque. `repeatdelay` lo resuelve el cargador (script.cpp:5377-5382).
    bucles,
    /** Lo que este objeto le pide al guion del jugador. */
    alJugador: externos,
  };
}

// Sólo los archivos que se usan de verdad, y sin los que no están.
const tabla = {};
for (const ruta of Object.keys(archivos)) {
  if (archivos[ruta]) tabla[ruta] = { piezas: archivos[ruta].piezas };
}

console.log(`\n  ARCHIVOS distintos        ${Object.keys(tabla).length}`);
console.log(`  EVENTOS con nombre        ${evsCaben} de ${evsTot} corren enteros  (${Math.round(evsCaben * 100 / Math.max(evsTot, 1))} %)`);
console.log(`  objetos con bucle propio  ${conBucle}, ${buclesTot} bucles que arrancan solos`);

console.log(`\n  LO QUE LOS OBJETOS LE PIDEN AL JUGADOR (${pideAlJugador.size} eventos distintos)`);
for (const [k, v] of [...pideAlJugador].sort((a, b) => b[1] - a[1]).slice(0, 16)) {
  console.log(`    ${String(v).padStart(4)} objetos · ${k}`);
}

const ranking = [...global].sort((a, b) => b[1] - a[1]);
console.log(`\n  COMANDOS QUE FALTAN (${ranking.length} distintos), por uso`);
console.log(`    ${ranking.slice(0, 12).map(([k, v]) => `${k} x${v}`).join(", ")}`);

mkdirSync(SALIDA_DIR, { recursive: true });
const json = JSON.stringify({
  procedencia: `${RAIZ}/items/*.script y sus #include, leídos no copiados. No redistribuible.`,
  raiz: RAIZ,
  mapas: MAPAS,
  // Por qué este conjunto y no los 760, para que no parezca arbitrario.
  criterio: "lo que venden las tiendas de los mapas portados más lo que trae un personaje nuevo",
  descartados: { variables, sinFicha },
  archivos: tabla,
  objetos: fichas,
}, null, 1);
writeFileSync(SALIDA, json);
console.log(`\n  escrito ${SALIDA}  (${(json.length / 1e6).toFixed(1)} MB)\n`);
