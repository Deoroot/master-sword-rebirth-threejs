// QUÉ MAPA HORNEA UNA HERRAMIENTA.
//
// El gemelo de `src/play/mapa.js` para el lado de la extracción. Está aparte
// porque éste **sí toca el disco y la línea de órdenes**, y `src/play/` no
// puede hacer ninguna de las dos cosas: sus módulos corren también en el
// navegador.
//
// Lo que resuelve: hasta el 47, cada una de las veintidós herramientas llevaba
// `build/gatecity` escrito a mano, y unas cuantas además la ruta del `.bsp`.
// Hornear Edana quería tocar veintidós archivos.
//
// Los recursos comunes se hornean una sola vez en build/msr.
// El sonido comparte muestras, pero su catálogo depende del mapa.
// Ver tools/recursos.mjs y doc/EXTRACTORES_MAPA.md.

import { resolve } from "node:path";
import { existsSync } from "node:fs";

export { MAPA_POR_DEFECTO, esNombreDeMapa } from "../src/play/mapa.js";
import { MAPA_POR_DEFECTO, esNombreDeMapa } from "../src/play/mapa.js";

/** Donde vive el contenido del juego. **No se escribe nunca ahí.** */
export const CONTENIDO = "../MSC/assets/msr";

/**
 * QUIÉN HIZO CADA MAPA.
 *
 * Esto no es decoración: la línea `procedencia` de cada `.json` horneado lleva
 * el nombre del autor, y al parametrizar el extractor se me cayó el «(DrKill)»
 * de la de Gate City sin darme cuenta. Lo cazó comparar el `malla.json` de
 * antes con el de después, que es el único motivo por el que se comparó.
 *
 * Una atribución que se pierde en un refactor es peor que una que nunca
 * estuvo, así que vive aquí, donde se ve, y no dentro de una cadena.
 * Ver [CREDITOS.md](../CREDITOS.md).
 */
export const AUTORES = Object.freeze({ gatecity: "DrKill" });

/** «gatecity.bsp (DrKill)», o «edana.bsp» si no sabemos de quién es. */
export function creditoDe(mapa) {
  const a = AUTORES[mapa];
  return a ? `${mapa}.bsp (${a})` : `${mapa}.bsp`;
}

/**
 * El mapa que pide la línea de órdenes, en las tres formas que los guiones de
 * `package.json` y las manos usan hoy:
 *
 *     node tools/x.mjs                       -> el de por defecto
 *     node tools/x.mjs --mapa edana          -> edana
 *     node tools/x.mjs ruta/a/edana.bsp      -> edana, del nombre del archivo
 *
 * La tercera existe porque `tools/gatecity.mjs` ya aceptaba una ruta `.bsp` y
 * quitársela rompería a quien la use; ahora además **de ahí sale el nombre de
 * la carpeta de salida**, que es lo que antes no pasaba: se le podía dar
 * `edana.bsp` y lo escribía en `build/gatecity/`.
 */
export function mapaDeArgv(argv = process.argv.slice(2), porDefecto = MAPA_POR_DEFECTO) {
  const i = argv.indexOf("--mapa");
  if (i >= 0) {
    if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error("--mapa necesita un nombre de mapa");
    return validado(argv[i + 1]);
  }
  const bsp = argv.find((a) => a.endsWith(".bsp"));
  if (bsp) return validado(bsp.split(/[/\\]/).pop().replace(/\.bsp$/i, ""));
  return validado(porDefecto);
}

function validado(n) {
  if (!esNombreDeMapa(n)) {
    throw new Error(`«${n}» no es un nombre de mapa: sólo minúsculas, dígitos y guion bajo.`);
  }
  return n;
}

/** Donde `tools/contenido.mjs` deja los mapas NUESTROS compilados (el 88). */
export const PROPIOS = "build/contenido/maps";

/**
 * El `.bsp` de ese mapa, o la ruta que se haya dado a mano.
 *
 * Desde el 88 hay dos sitios: los mapas del juego y los nuestros. **Un nombre
 * que esté en los dos es un error y no una preferencia**: si uno tapara al otro
 * en silencio, se hornearía un mapa distinto del que se cree, y sin aviso.
 */
export function bspDe(mapa, argv = process.argv.slice(2), existe = existsSync) {
  const dado = argv.find((a) => a.endsWith(".bsp"));
  if (dado) return dado;
  const delJuego = `${CONTENIDO}/maps/${mapa}.bsp`;
  const propio = `${PROPIOS}/${mapa}.bsp`;
  if (!existe(propio)) return delJuego;
  if (existe(delJuego)) throw new Error(`«${mapa}» está en el juego y en ${PROPIOS}: cambia el nombre del nuestro`);
  return propio;
}

/** `build/<mapa>`, absoluta, que es lo que quieren `mkdir` y `writeFile`. */
export function salidaDe(mapa) { return resolve("build", validado(mapa)); }

/** Argumentos posicionales de los extractores que admiten una raíz de scripts. */
export function posicionalesDe(argv = process.argv.slice(2)) {
  // Valida también el valor ausente, antes de que pueda interpretarse como ruta.
  mapaDeArgv(argv);
  return argv.filter((a, i) => a !== "--mapa" && argv[i - 1] !== "--mapa");
}

/** `build/<mapa>/...`, absoluta. */
export function enSalida(mapa, ...partes) { return resolve(salidaDe(mapa), ...partes); }

/** Extractores comunes que ejecuta `npm run recursos`, además de objetos. */
export const NO_SON_DE_UN_MAPA = Object.freeze([
  "hud.mjs", "menu.mjs", "vgui.mjs", "vgui2.mjs", "armas.mjs",
  "escudos.mjs", "cuerpo.mjs", "iconos.mjs", "efectos.mjs",
]);
