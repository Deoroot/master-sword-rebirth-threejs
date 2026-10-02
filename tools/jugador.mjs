// EL GUION DEL JUGADOR — `player/player`, el 64.
//
//     npm run jugador
//
// En Master Sword **el jugador también es una entidad con guion**. No es un
// detalle de implementación: la regeneración, los avisos de la primera vez, el
// valor de parada que sale en la consola, los efectos de clima y las emociones
// están escritos en `.script`, igual que los NPC. Son **27 archivos y 9 566
// líneas** colgando de `player/player`.
//
//     #include [server] player/player_main
//     #include [server] help/first_transition
//     #include [server] help/first_death
//     ...                                    player/player.script:4-16
//
// Este puerto corría los guiones de los NPC desde el 33 y **ninguno del
// jugador**. Por eso faltaban cosas que no son de ningún NPC: el «Your Parry
// value is now 2» de la captura del usuario sale de
// `player/externals.script:696`, no del motor.
//
// Lo que hace este extractor es lo mismo que `guiones.mjs` con los NPC:
// resolver los `#include`, hornear los eventos y **decir qué NO cabe**, por
// archivo, para que el número no dependa de lo que uno crea. Va a
// `build/msr/`, no a `build/<mapa>/`, porque el jugador no es del mapa.
//
// La regla del 02: los `.script` se quedan en `../MSC/`, lo extraído va a
// `build/`, y no se mueve un byte a `public/`.

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { partirGuion, COMANDOS } from "../src/play/guion.js";
import { leerScript, cargarGuion, RAIZ_POR_OMISION } from "./scriptsmsr.mjs";
import { posicionalesDe } from "./mapa.mjs";

const RAIZ = posicionalesDe()[0] ?? RAIZ_POR_OMISION;
const SALIDA_DIR = "build/msr";
const SALIDA = join(SALIDA_DIR, "jugador.json");
const RUTA = "player/player";

if (leerScript(RUTA, RAIZ) === null) {
  console.error(`No encuentro ${RAIZ}/${RUTA}.script. Pásame la carpeta scripts/ de MSR como argumento.`);
  process.exit(1);
}

const cargado = cargarGuion(RUTA, new Set(), RAIZ);
console.log(`\n  jugador         ${cargado.archivos.length} archivos, ${cargado.eventos.length} eventos`);
if (cargado.faltan.length) {
  // `$currentmap_player_externals` es un `#include` con el nombre del mapa
  // dentro: el motor lo resuelve al cargar y aquí no hay mapa. No es un fallo.
  console.log(`  sin resolver    ${cargado.faltan.join(", ")}`);
}

// ── QUÉ CABE, POR ARCHIVO ───────────────────────────────────────────────────
//
// Se mira ARCHIVO A ARCHIVO y no el conjunto, porque el conjunto no se puede
// correr entero y la pregunta útil es cuál sí. Un archivo «cabe» cuando todos
// los comandos de todos sus eventos están en el subconjunto portado.
const faltanDe = (cmds, acc) => {
  for (const c of cmds ?? []) {
    if (!COMANDOS.has(c.nombre)) acc.set(c.nombre, (acc.get(c.nombre) ?? 0) + 1);
    faltanDe(c.hijos, acc);
    for (const rama of c.sino ?? []) faltanDe(rama, acc);
  }
  return acc;
};

const porArchivo = [];
for (const ruta of cargado.archivos) {
  const t = leerScript(ruta, RAIZ);
  if (t === null) continue;
  const p = partirGuion(t);
  const acc = new Map();
  for (const e of p.eventos) faltanDe(e.cmds, acc);
  porArchivo.push({
    ruta,
    eventos: p.eventos.length,
    faltan: [...acc.keys()].sort(),
    veces: [...acc.values()].reduce((a, b) => a + b, 0),
  });
}
porArchivo.sort((a, b) => a.faltan.length - b.faltan.length || a.ruta.localeCompare(b.ruta));

// Y LA CUENTA QUE DE VERDAD CONTESTA «CUÁNTO FALTA»: por EVENTO.
//
// Por archivo es una cota pesimista: a `player_main` le faltan 26 comandos y
// aun así la mayoría de sus eventos corren enteros, porque lo que no cabe está
// en unos pocos. Un evento «cabe» cuando todos sus comandos, y los de sus
// bloques, están portados — que es lo que decide si al llamarlo pasa lo que
// tiene que pasar.
const cabeEntero = (e) => faltanDe(e.cmds, new Map()).size === 0;
const eventosQueCaben = cargado.eventos.filter(cabeEntero).length;
console.log(`
  EVENTOS          ${eventosQueCaben} de ${cargado.eventos.length} corren enteros`
  + `  (${Math.round(eventosQueCaben * 100 / Math.max(cargado.eventos.length, 1))} %)`);

const caben = porArchivo.filter((f) => f.faltan.length === 0);
console.log(`\n  CABEN ENTEROS   ${caben.length} de ${porArchivo.length}`);
for (const f of caben) console.log(`    ${f.ruta.padEnd(34)} ${f.eventos} eventos`);

console.log(`\n  LO QUE FALTA, por archivo`);
for (const f of porArchivo.filter((x) => x.faltan.length)) {
  console.log(`    ${String(f.faltan.length).padStart(3)} cmd · ${f.ruta.padEnd(34)} ${f.faltan.slice(0, 7).join(" ")}${f.faltan.length > 7 ? " …" : ""}`);
}

// Y el ranking global, que es la lista de la compra de quien quiera portar más.
const global = new Map();
for (const ruta of cargado.archivos) {
  const t = leerScript(ruta, RAIZ);
  if (t === null) continue;
  for (const e of partirGuion(t).eventos) faltanDe(e.cmds, global);
}
const ranking = [...global].sort((a, b) => b[1] - a[1]);
console.log(`\n  COMANDOS QUE FALTAN, por uso (${ranking.length} distintos)`);
console.log(`    ${ranking.slice(0, 14).map(([k, v]) => `${k} x${v}`).join(", ")}`);

mkdirSync(SALIDA_DIR, { recursive: true });
writeFileSync(SALIDA, JSON.stringify({
  procedencia: `${RAIZ}/${RUTA}.script y sus #include`,
  raiz: RAIZ,
  ruta: RUTA,
  archivos: cargado.archivos,
  sinResolver: cargado.faltan,
  // Los eventos van ENTEROS aunque su archivo no quepa: el intérprete se salta
  // el comando que no conoce y sigue con el siguiente, que es lo que hace el
  // motor (script.cpp:5627). Cortar aquí los archivos que no caben escondería
  // eventos que sí funcionan al lado de uno que no.
  eventos: cargado.eventos,
  // Los `const`/`setvar` de las cabeceras, que el motor evalúa al cargar.
  preload: cargado.preload,
  porArchivo,
  cabenEnteros: caben.map((f) => f.ruta),
  eventosQueCaben,
}, null, 1));
console.log(`\n  escrito ${SALIDA}\n`);
