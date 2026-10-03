// COMPILAR UN MAPA NUESTRO (el 88).
//
//   npm run contenido -- sala88
//
// Lee la descripción `contenido/<nombre>.mjs`, escribe
// `build/contenido/maps/<nombre>.map` y lo compila con las cuatro herramientas
// de VHLT, en el orden de siempre: hlcsg, hlbsp, hlvis, hlrad. El `.bsp` sale a
// la misma carpeta, y de ahí lo lee `tools/mapa.mjs` (`bspDe`) para hornearlo
// como cualquier mapa del juego.
//
// VHLT no viene con el repositorio. Se busca en `VHLT_DIR` o, si no está, en
// `C:/Herramientas/vhlt`.
//
// ── POR QUÉ EL `.bsp` NO SALE DE `build/` ───────────────────────────────────
//
// hlcsg mete DENTRO del `.bsp` las texturas de los `.wad` que se le dicen
// (`-wadinclude`). Son texturas de MSR, así que el `.bsp` compilado es tan del
// juego como `gatecity.bsp`, aunque la geometría sea nuestra: va a `build/`, que
// no se versiona, y no a `contenido/`. Lo nuestro es la descripción.
//
// ── LO QUE SE COMPRUEBA, Y POR QUÉ NO BASTA CON QUE SALGA UN `.bsp` ─────────
//
// Las cuatro herramientas devuelven 0 en casos que no son un éxito: una fuga
// («LEAK») deja a hlvis sin hacer nada y el mapa entero se ve, y hlrad sin
// `.prt` lo ilumina todo igual. Así que además del código de salida se lee lo
// que escriben y se para con cualquier línea de error o de fuga.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { mapa } from "./mapagen.mjs";
import { CONTENIDO } from "./mapa.mjs";
import { esNombreDeMapa } from "../src/play/mapa.js";

export const SALIDA = resolve("build", "contenido", "maps");
const VHLT = process.env.VHLT_DIR ?? "C:/Herramientas/vhlt";

/** Las líneas que hacen que una compilación no cuente, aunque salga con 0. */
export const MALAS = /\b(error|leak|warning: brush|no visibility|mixed face contents)\b/i;

function correr(exe, args, registro) {
  const ruta = join(VHLT, exe);
  if (!existsSync(ruta)) throw new Error(`no encuentro ${ruta}: pon VHLT_DIR donde esté VHLT`);
  console.log(`\n━━ ${exe} ${args.join(" ")}`);
  const r = spawnSync(ruta, args, { encoding: "latin1" });
  const texto = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  registro.push(`━━ ${exe}\n${texto}`);
  const malas = texto.split(/\r?\n/).filter((l) => MALAS.test(l));
  for (const l of malas) console.log(`   ✗ ${l.trim()}`);
  if (r.status !== 0 || malas.length) {
    throw new Error(`${exe} falló (salida ${r.status}, ${malas.length} línea(s) de error)`);
  }
  const ultima = texto.trim().split(/\r?\n/).filter(Boolean).slice(-1)[0];
  console.log(`   ✓ ${ultima?.trim() ?? ""}`);
}

export async function compilar(nombre) {
  if (!esNombreDeMapa(nombre)) throw new Error(`«${nombre}» no es un nombre de mapa`);
  const desc = await import(pathToFileURL(resolve("contenido", `${nombre}.mjs`)).href);
  if (desc.nombre !== nombre) throw new Error(`contenido/${nombre}.mjs dice llamarse «${desc.nombre}»`);

  const wads = desc.wads.map((w) => resolve(CONTENIDO, `${w}.wad`));
  for (const w of wads) if (!existsSync(w)) throw new Error(`falta ${w}`);

  mkdirSync(SALIDA, { recursive: true });
  const base = join(SALIDA, nombre);
  const texto = mapa({
    mundo: { ...desc.mundo, wad: wads.join(";") },
    brushes: desc.brushes,
    entidades: desc.entidades,
  });
  writeFileSync(`${base}.map`, texto);
  console.log(`escrito ${base}.map (${desc.brushes.length} brushes, ${desc.entidades.length} entidades)`);

  const registro = [];
  try {
    correr("hlcsg_x64.exe", [...desc.wads.flatMap((w) => ["-wadinclude", w]), base], registro);
    correr("hlbsp_x64.exe", [base], registro);
    correr("hlvis_x64.exe", [base], registro);
    correr("hlrad_x64.exe", [base], registro);
  } finally {
    writeFileSync(`${base}.compilacion.txt`, registro.join("\n"));
  }
  if (!existsSync(`${base}.bsp`)) throw new Error(`VHLT no dejó ${base}.bsp`);

  writeFileSync(join(SALIDA, "PROCEDENCIA.md"), [
    "# De dónde sale lo que hay aquí",
    "",
    "Mapas NUESTROS compilados con VHLT por `tools/contenido.mjs`.",
    "La geometría y las entidades salen de `contenido/<mapa>.mjs` (de este repositorio).",
    `Las texturas que lleva dentro cada \`.bsp\` son de MSR: ${desc.wads.map((w) => `\`${w}.wad\``).join(", ")},`,
    `de \`${CONTENIDO}\`. Por eso esto no se versiona ni se publica.`,
    "",
  ].join("\n"));
  const bytes = readFileSync(`${base}.bsp`).length;
  console.log(`\n✓ ${base}.bsp (${(bytes / 1024).toFixed(0)} KB)`);
  return `${base}.bsp`;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const nombre = process.argv[2];
  if (!nombre) { console.error("uso: npm run contenido -- <mapa>   (contenido/<mapa>.mjs)"); process.exit(2); }
  compilar(nombre).catch((e) => { console.error(`\n✗ ${e.message}`); process.exit(1); });
}
