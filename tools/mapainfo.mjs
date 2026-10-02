// CÓMO SE PRESENTA UN MAPA: su nombre, su descripción y su dificultad.
//
//   npm run mapainfo              # gatecity
//   npm run mapainfo -- edana     # cualquier otro
//
// Deja en `build/<mapa>/mapa.json` los cuatro valores con los que el juego te
// recibe, ya resueltos entre sus dos fuentes. Quien manda es
// `src/play/intro.js`: aquí sólo se leen los dos sitios y se le pasan, para que
// la regla —cuál de los dos gana— esté bajo prueba y no metida en una
// herramienta que nadie ejecuta en los tests.
//
// Las dos fuentes, y por qué hay dos:
//
//   1. el `worldspawn` del `.bsp`: `maptitle`, `mapdesc`, `hpwarn`
//      (world.cpp:693-709)
//   2. los `setvarg G_*` de `<mapa>/map_startup.script`
//
// Se contradicen. El `.bsp` de Gate City dice «Gatecity by DrKill» y su guion
// dice «Gatecity». **Gana el guion**, por el orden de los `#include` de
// `world.script`; está explicado con sus líneas en `src/play/intro.js`.
//
// La regla del 02, que aquí manda igual: los `.script` y el `.bsp` se quedan en
// `../MSC/`, lo extraído vive en `build/`, que está en `.gitignore`, y **no se
// mueve un byte a `public/`**. Lo defiende `test/procedencia.test.mjs`.

import { writeFileSync, mkdirSync, existsSync, readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

import { leerBsp, leerEntidades } from "../src/bsp/lector.js";
import { resolverMapa, presentacion } from "../src/play/intro.js";

import { mapaDeArgv, posicionalesDe, salidaDe, enSalida, MAPA_POR_DEFECTO } from "./mapa.mjs";
// Conserva `mapainfo edana`, además de la opción común `--mapa edana`.
const MAPA = mapaDeArgv(process.argv.slice(2), posicionalesDe()[0] ?? MAPA_POR_DEFECTO);
const ASSETS = process.env.MSR_ASSETS ?? "../MSC/assets/msr";
const SCRIPTS = process.env.MSR_SCRIPTS ?? "../MSC/MSCScripts/scripts";

const RUTA_BSP = join(ASSETS, "maps", `${MAPA}.bsp`);
const RUTA_GUION = join(SCRIPTS, MAPA, "map_startup.script");

if (!existsSync(RUTA_BSP)) {
  console.error(`No encuentro ${RUTA_BSP}. Pásame el mapa: npm run mapainfo -- <mapa>`);
  process.exit(1);
}

// ── 1. el worldspawn del .bsp ──────────────────────────────────────────────

const entidades = leerEntidades(leerBsp(RUTA_BSP));
const worldspawn = entidades.find((e) => e.classname === "worldspawn") ?? {};

// ── 2. los setvarg del map_startup del mapa ────────────────────────────────
//
// Sólo los `G_*`, que son los globales. Las `const MAP_NAME 'gatecity'` de al
// lado son otra cosa —el nombre del archivo, para comparar— y no se tocan.
//
// El valor puede ir entre comillas dobles, simples o sin nada hasta el fin de
// línea; los comentarios `//` de detrás se cortan sólo si el valor no venía
// entrecomillado, porque dentro de unas comillas `//` es texto.

/** `setvarg G_LO_QUE_SEA valor` → { G_LO_QUE_SEA: "valor" }. */
export function leerSetvarg(texto) {
  const salida = {};
  for (const linea of String(texto).split(/\r?\n/)) {
    const m = /^\s*setvarg\s+(G_[A-Z0-9_]+)\s+(.*)$/i.exec(linea);
    if (!m) continue;
    let valor = m[2].trim();
    const comillas = /^(["'])([\s\S]*?)\1/.exec(valor);
    if (comillas) valor = comillas[2];
    else valor = valor.split("//")[0].trim();
    salida[m[1].toUpperCase()] = valor;
  }
  return salida;
}

let guion = {};
if (existsSync(RUTA_GUION)) {
  guion = leerSetvarg(readFileSync(RUTA_GUION, "latin1"));
} else {
  console.log(`  (no hay ${RUTA_GUION}: sólo queda lo del worldspawn)`);
}

// ── 3. la regla, que no está aquí ──────────────────────────────────────────

const mapa = resolverMapa({ bsp: worldspawn, guion });

const SALIDA = enSalida(MAPA, "mapa.json");
mkdirSync(salidaDe(MAPA), { recursive: true });
writeFileSync(SALIDA, JSON.stringify({
  procedencia: "derivado local del .bsp y los .script de Master Sword Rebirth, leídos no copiados. No redistribuible.",
  mapa: MAPA,
  ...mapa,
  fuentes: {
    bsp: { maptitle: worldspawn.maptitle ?? null, mapdesc: worldspawn.mapdesc ?? null, hpwarn: worldspawn.hpwarn ?? null },
    guion: { G_MAP_NAME: guion.G_MAP_NAME ?? null, G_MAP_DESC: guion.G_MAP_DESC ?? null, G_MAP_DIFF: guion.G_MAP_DIFF ?? null, G_WARN_HP: guion.G_WARN_HP ?? null },
  },
}, null, 1), "utf8");

// ── 4. lo que se va a ver, para que se lea sin abrir el navegador ──────────

console.log(`\n  ${MAPA}`);
console.log(`    nombre       ${mapa.nombre}`);
console.log(`    descripción  ${mapa.descripcion}`);
console.log(`    dificultad   ${mapa.dificultad ?? "(no la declara)"}`);
console.log(`    avisa bajo   ${mapa.avisoVida} hp${mapa.avisoVida ? "" : "  (0 = nunca avisa)"}`);

for (const quien of [{ n: "recién hecho (12 hp)", hp: 12 }, { n: "en la banda (150 hp)", hp: 150 }]) {
  const avisos = presentacion(mapa, quien.hp);
  console.log(`\n    lo que ve un personaje ${quien.n}:`);
  if (!avisos.length) console.log("      (nada: el mapa no se presenta)");
  for (const a of avisos) console.log(`      a los ${String(a.cuando).padStart(4)} s   ${a.titulo}${a.texto ? ` — ${a.texto}` : ""}`);
}

console.log(`\n  -> ${SALIDA}\n`);

// ── 5. la procedencia, que en este proyecto va con lo extraído ─────────────

const PROC = enSalida(MAPA, "PROCEDENCIA.md");
const MARCA = "## La presentación del mapa";
if (existsSync(PROC) && !readFileSync(PROC, "utf8").includes(MARCA)) {
  appendFileSync(PROC, `
${MARCA}

\`mapa.json\` lo escribe \`node tools/mapainfo.mjs\`. Son cuatro cadenas: cómo se
llama el mapa, su descripción, la dificultad que declara y por debajo de cuánta
vida te avisa. Salen del \`worldspawn\` de \`${MAPA}.bsp\` y de
\`${MAPA}/map_startup.script\`, y cuando se contradicen gana el guion — el porqué,
con sus líneas, está en \`src/play/intro.js\`.

Texto, nada de imágenes. Vale lo de siempre: **está en \`build/\`, que está en
\`.gitignore\`, y no se mueve un byte a \`public/\`.**
`);
  console.log(`  procedencia apuntada en ${PROC}\n`);
}
