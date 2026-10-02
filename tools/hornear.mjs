// TODO EL HORNEADO DE UNA VEZ, en el orden en que se necesita.
//
//   npm run hornear
//
// Lee de `../MSC/` y escribe en `build/`, como cada una de las herramientas que
// lanza. No toca nada más. Tarda unos minutos y se puede volver a pasar: cada
// paso sobrescribe lo suyo.
//
// ── POR QUÉ EXISTE (el 87, al hacer público el repositorio) ─────────────────
//
// Hornear eran **veinte herramientas** y no había un sitio que dijera cuáles ni
// en qué orden. El README listaba ocho; `doc/EXTRACTORES_MAPA.md` decía que
// `npm run recursos` hacía «los comunes», y **le faltaban tres** que el juego lee:
// `jugador` (el guion del jugador), `objetos:guion` y `suelo` (lo que hay tirado y
// lo que suelta un bicho, el 82). Quien siguiera las instrucciones tenía un juego
// al que le faltaban piezas **sin un solo error** — el apartado 4, en la puerta de
// entrada. Esto no lo vio nadie porque todas las sesiones tenían ya su `build/`
// hecho a trozos: el caso único del 50, con el instrumento siendo la propia
// máquina de quien mide.
//
// Se comprobó como lo haría un desconocido: una copia limpia del repositorio,
// sin `build/`, `npm run hornear`, y Edana arrancada encima con su sonda.
//
// ── EL ORDEN, y por qué es éste ──────────────────────────────────────────────
//
//   1. lo común        `objetos` y los nueve de `recursos`, más `jugador`.
//                      Todo a `build/msr`; no depende de ningún mapa.
//   2. cada mapa       malla, bichos, aparición, menús, guiones, presentación y
//                      sonido. El sonido va el ÚLTIMO del mapa porque su catálogo
//                      depende de los materiales, la música y los NPC del mapa
//                      (doc/EXTRACTORES_MAPA.md).
//   3. lo que cruza    `objetos:guion` y `suelo` recorren LOS DOS mapas a la vez
//                      (`MAPAS` en cada archivo), así que van cuando los dos
//                      están hechos. Antes, `suelo` saldría sin el botín del
//                      mapa que faltara — y no lo diría.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Los mapas que se juegan. `suelo` y `objetos:guion` los esperan a los dos. */
export const MAPAS = ["gatecity", "edana"];

/** Los pasos, en orden. Cada uno es un script de `package.json` y sus argumentos. */
export function pasos(mapas = MAPAS) {
  return [
    ["recursos"],
    ["jugador"],
    ...mapas.flatMap((m) => [
      ["mapa", "--mapa", m],
      ["mapa:bichos", "--mapa", m],
      ["mapa:aparicion", "--mapa", m],
      ["menus", "--mapa", m],
      ["guiones", "--mapa", m],
      ["mapainfo", "--mapa", m],
      ["sonido", "--mapa", m],
    ]),
    ["objetos:guion"],
    ["suelo"],
  ];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const lista = pasos();
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const t0 = Date.now();
  for (const [i, [script, ...args]] of lista.entries()) {
    const titulo = `[${i + 1}/${lista.length}] npm run ${script}${args.length ? ` -- ${args.join(" ")}` : ""}`;
    console.log(`\n━━ ${titulo}`);
    const t = Date.now();
    const r = spawnSync(npm, ["run", "-s", script, ...(args.length ? ["--", ...args] : [])],
      { stdio: "inherit", shell: process.platform === "win32" });
    if (r.status !== 0) {
      // Falla fuerte y dice dónde: un horneado a medias que sigue adelante deja
      // un `build/` con piezas de dos tandas, que es el horneado parcial del 81.
      console.error(`\n✗ falló ${titulo} (salida ${r.status}). Lo de antes está hecho; lo de después, no.`);
      process.exit(r.status || 1);
    }
    console.log(`   ${((Date.now() - t) / 1000).toFixed(1)} s`);
  }
  console.log(`\n✓ horneado completo: ${lista.length} pasos en ${((Date.now() - t0) / 60000).toFixed(1)} min`);
}
