// Un .map leido y convertido en lo que necesita el runtime: una malla, un
// punto de aparicion y las entidades puntuales. Nada de Three.js ni de Rapier
// aqui, para que el arnes de Node pueda pedir lo mismo que el navegador.

import { parse } from "./parse.js";
import { buildMesh, toScene, UNITS_PER_M } from "./geometry.js";

// El cielo en Quake no es geometria que se toque: es la caja exterior que
// sella el mundo. Se excluye del render y de la colision, pero se cuenta,
// porque un mapa sin caras de cielo es un mapa que no esta sellado.
const SKY = /^sky/;

/**
 * El sello: brushes que existen SOLO para que `qbsp` pueda hacer su trabajo.
 *
 * Corinth es el primer mapa en que parte del suelo no es un `.map`: el socavón
 * de la boca es una malla generada, y `qbsp` no ve mallas. El agujero que la
 * malla tapa es, para `qbsp`, una fuga por la que el mundo se desangra, y un
 * `.map` con fuga deja de decir nada sobre nada.
 *
 * La salida es la que el cielo ya usaba: un brush con una textura reservada que
 * el runtime no dibuja ni convierte en colisión. Para `qbsp` el suelo está
 * entero; para el jugador, el agujero está donde se ve que está y la roca es lo
 * que lo tapa. Es el mismo reparto de jueces de todo el experimento, escrito
 * ahora en una textura: `qbsp` juzga el `.map`, la malla la juzga el arnés.
 *
 * Se cuenta aparte, y no se suma al cielo, porque son dos cosas distintas y el
 * día que un sello se quede sin querer en mitad de una calle el número tiene
 * que poder decirlo.
 */
const SELLO = /^sello/;

// Distancia del origin de info_player_start a los pies, en unidades de Quake.
export const PLAYER_ORIGIN_Z = 24;

export function loadLevel(text, { name = "(sin nombre)" } = {}) {
  const entities = parse(text);
  const worldspawn = entities.find((e) => e.classname === "worldspawn");
  if (!worldspawn) throw new Error(`${name}: no hay worldspawn`);

  const brushes = worldspawn.brushes;
  const solid = buildMesh(brushes, { skip: (t) => SKY.test(t) || SELLO.test(t) });
  const sinCielo = buildMesh(brushes, { skip: (t) => SKY.test(t) });
  const all = buildMesh(brushes);

  const start = entities.find((e) => e.classname === "info_player_start");
  const startUnits = start?.origin() ?? null;

  const lights = entities
    .filter((e) => e.classname === "light")
    .map((e) => ({
      units: e.origin(),
      position: e.origin() ? toScene(e.origin()) : null,
      light: Number(e.props.light ?? 300),
    }))
    .filter((l) => l.position !== null);

  const points = entities
    .filter((e) => e.classname !== "worldspawn" && e.origin() !== null)
    .map((e) => ({
      classname: e.classname,
      targetname: e.props.targetname ?? null,
      units: e.origin(),
      position: toScene(e.origin()),
    }));

  return {
    name,
    entities,
    brushes,
    mesh: solid,
    skyFaces: all.triangleCount - sinCielo.triangleCount,
    selloFaces: sinCielo.triangleCount - solid.triangleCount,
    lights,
    points,
    startUnits,
    // Pies, no centro. En Quake el origin de info_player_start es el centro
    // de una caja de 32x32x56 cuyo suelo queda 24 unidades por debajo, asi
    // que en plaza (origin z=24) los pies caen justo sobre el suelo, z=0.
    // Sin restar esas 24 unidades el jugador aparece flotando y la primera
    // prueba de caida mide una caida que el mapa no tiene.
    start: startUnits
      ? toScene([startUnits[0], startUnits[1], startUnits[2] - PLAYER_ORIGIN_Z])
      : null,
    unitsPerMetre: UNITS_PER_M,
  };
}

/** Lee un .map del disco. Solo para Node; el navegador usa fetch. */
export async function loadLevelFromFile(path) {
  const { readFile } = await import("node:fs/promises");
  const { basename } = await import("node:path");
  const text = await readFile(path, "utf8");
  return loadLevel(text, { name: basename(path, ".map") });
}
