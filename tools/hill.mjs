// El juez del nivel de malla, que es el que sustituye a qbsp.
//
//   node tools/hill.mjs
//
// Esto es lo que cuesta la opcion 3, dicho con numeros en vez de con adjetivos.
// El pueblo de brushes tiene un juez de una linea: qbsp -leaktest dice si el
// mundo esta cerrado, y punto. Un terreno de malla no tiene sellado que
// compilar, asi que hay que escribir el juez, y un juez escrito a mano es una
// cosa mas que puede estar mal.
//
// Por eso las tres comprobaciones van con sus controles: una sonda que dice
// que si a todo no es un juez. El experimento 02 lo dejo dicho -"exit 0 no
// significa correcto, significa compilable"- y aqui la version es "nadie se
// cayo no significa que el suelo este entero".
//
//   1. la malla dice la verdad   cada vertice esta donde dice el campo
//   2. el cuenco contiene        16 direcciones, nadie sale ni se cae
//   3. control: agujero          con el suelo roto, el jugador TIENE que caer
//   4. control: sin cuenco       sin las montanas, TIENE que salirse

import { initPhysics, World, Player, PLAYER } from "../src/play/player.js";
import {
  valleyField, terrainMesh, terrainLevel, heightAtUnits, TERRAIN,
} from "../src/map/terrain.js";
import { UNITS_PER_M } from "../src/map/geometry.js";

const DT = 1 / 60;
const SECONDS = 14;
const DIRECTIONS = 16;

/**
 * Contrasta la malla contra el campo de alturas.
 *
 * Es la comprobacion que el experimento 02 aprendio a las malas con el medidor
 * de areas: "un medidor que se equivoca no falla, da una cifra plausible". Si
 * el generador de malla y el campo se separaran, el jugador andaria sobre un
 * suelo que no es el que ve, y la pantalla seguiria siendo bonita.
 */
function checkMesh(field, mesh, skirt) {
  const foot = field.min - skirt;
  let worst = 0;
  let checked = 0;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    // De metros y ejes de Three.js de vuelta a unidades de Quake.
    const x = mesh.positions[i] * UNITS_PER_M;
    const z = mesh.positions[i + 1] * UNITS_PER_M;
    const y = -mesh.positions[i + 2] * UNITS_PER_M;
    if (Math.abs(z - foot) < 0.5) continue; // el faldon del borde no es terreno
    worst = Math.max(worst, Math.abs(z - heightAtUnits(field, x, y)));
    checked++;
  }
  return { worst, checked };
}

/**
 * Anda `SECONDS` segundos en cada direccion y apunta lo peor que pasa.
 *
 * `fromEdge` arranca cada marcha pegada al borde del valle y mirando hacia
 * fuera, en vez de en el centro. No es un detalle: saliendo del centro, el
 * jugador anda setenta metros y el cuenco esta a ciento cuarenta, asi que la
 * comprobacion "no se sale" pasa sin haber tocado la montana. Una medida en
 * verde que no llega a ejercitar lo que mide es peor que no tenerla.
 */
function walkOut(level, world, { fromEdge = false } = {}) {
  const field = level.field;
  const span = field.width * field.cell;
  const player = new Player(world, level.start);
  const out = [];

  const cx = (field.inner.x0 + field.inner.x1) / 2;
  const cy = (field.inner.y0 + field.inner.y1) / 2;
  const reach = Math.min(field.inner.x1 - cx, field.inner.y1 - cy) - field.cell * 2;

  for (let k = 0; k < DIRECTIONS; k++) {
    const yaw = (k / DIRECTIONS) * Math.PI * 2;
    // Con yaw 0 se anda hacia -Z de la escena, que en unidades de Quake es +Y.
    const dir = [-Math.sin(yaw), Math.cos(yaw)];
    const from = fromEdge
      ? [cx + dir[0] * reach, cy + dir[1] * reach]
      : null;
    const feet = from
      ? [from[0] / UNITS_PER_M, heightAtUnits(field, from[0], from[1]) / UNITS_PER_M + 1,
         -from[1] / UNITS_PER_M]
      : level.start;
    player.body.setTranslation(
      { x: feet[0], y: feet[1] + player.centreOffset, z: feet[2] },
      true
    );
    player.velocityY = 0;
    player.yaw = yaw;
    for (let i = 0; i < 30; i++) player.step(DT, {}); // que se asiente

    let sunk = 0;        // cuanto se hundio bajo el terreno, en unidades
    let escaped = false; // salio de la rejilla entera
    let beyond = 0;      // cuanto se paso del valle jugable, en unidades
    let airborne = 0;
    const steps = Math.round(SECONDS / DT);
    for (let i = 0; i < steps; i++) {
      player.step(DT, { forward: 1 });
      const f = player.feet;
      const x = f[0] * UNITS_PER_M;
      const y = -f[2] * UNITS_PER_M;
      const z = f[1] * UNITS_PER_M;
      // Cuanto se ha metido en el cuenco. Es la medida que importa: salirse de
      // la rejilla entera es el final del cuento, pero para entonces ya lleva
      // un rato andando por donde no deberia. Lo que contiene al jugador es la
      // pendiente, y la pendiente se nota mucho antes del borde.
      beyond = Math.max(
        beyond,
        field.inner.x0 - x, field.inner.y0 - y,
        x - field.inner.x1, y - field.inner.y1
      );
      if (x < 0 || y < 0 || x > span || y > span) {
        escaped = true;
        break;
      }
      // Hundirse bajo el terreno es caerse, y caerse por un agujero de la
      // malla es el fallo que este juez existe para cazar.
      sunk = Math.max(sunk, heightAtUnits(field, x, y) - z);
      if (!player.grounded) airborne++;
    }
    const f = player.feet;
    out.push({
      yaw: player.yaw,
      escaped,
      beyond,
      sunk,
      airborne: airborne / steps,
      // Cuanto subio por el cuenco: si sube mucho, la montana no contiene y
      // solo es cuestion de andar un rato mas.
      climb: f[1] * UNITS_PER_M - level.startUnits[2],
      end: [Math.round(f[0] * UNITS_PER_M), Math.round(-f[2] * UNITS_PER_M)],
    });
  }
  player.body.setEnabled?.(false);
  return out;
}

await initPhysics();

console.log("\nJuez: campo de alturas + sonda de marcha   Runtime: Rapier en Node plano\n");

// --- el valle de verdad -----------------------------------------------------

const level = terrainLevel();
const field = level.field;
const mesh = level.mesh;
const geom = checkMesh(field, mesh, TERRAIN.skirt);

const world = new World(mesh);
const walks = walkOut(level, world, { fromEdge: true });
const escapes = walks.filter((w) => w.escaped).length;
const worstBeyond = Math.max(...walks.map((w) => w.beyond));
// Cuanto se le permite meterse en el cuenco. Medio margen: subir un poco por
// la ladera es normal y es lo que hace que la montana se lea como montana;
// cruzarla entera es salirse del mundo.
const ALLOWED_BEYOND = (TERRAIN.margin * TERRAIN.cell) / 2;
const worstSunk = Math.max(...walks.map((w) => w.sunk));
const worstAir = Math.max(...walks.map((w) => w.airborne));
const worstClimb = Math.max(...walks.map((w) => w.climb));

console.log(
  `  valle                ${mesh.triangleCount} triangulos, ${field.width}x${field.width} celdas ` +
    `de ${field.cell} unidades (${(field.width * field.cell) / 32} m de lado)`
);
console.log(
  `  malla contra campo   ${geom.checked} vertices, error maximo ${geom.worst.toFixed(4)} unidades`
);
console.log(
  `  ${DIRECTIONS} marchas al cuenco ${escapes} escapes, se meten ${worstBeyond.toFixed(0)} ` +
    `unidades en el cuenco de ${ALLOWED_BEYOND} permitidas, hundimiento maximo ` +
    `${worstSunk.toFixed(1)}, ${(worstAir * 100).toFixed(1)}% en el aire, ` +
    `subida maxima ${worstClimb.toFixed(0)} unidades`
);

// --- controles --------------------------------------------------------------
//
// Sin estos dos, lo de arriba es una sonda que dice que si.

const brokenField = valleyField();
const brokenMesh = terrainMesh(brokenField, {
  hole: { i: brokenField.width / 2, j: brokenField.width / 2, r: 3 },
});
const brokenWorld = new World(brokenMesh);
const brokenWalks = walkOut({ ...level, mesh: brokenMesh, field: brokenField }, brokenWorld);
const brokenSunk = Math.max(...brokenWalks.map((w) => w.sunk));
console.log(
  `  control agujero      hundimiento maximo ${brokenSunk.toFixed(1)} unidades ` +
    `(${brokenMesh.triangleCount} triangulos, ${mesh.triangleCount - brokenMesh.triangleCount} menos)`
);

// Un valle mas pequeno, para que el borde quede a tiro andando catorce
// segundos: la sonda tiene que poder llegar, o "nadie se salio" solo dice que
// el mundo es grande.
const flatLevel = terrainLevel({ bowlRise: 0, cells: 20 });
const flatWorld = new World(flatLevel.mesh);
const flatWalks = walkOut(flatLevel, flatWorld, { fromEdge: true });
const flatBeyond = Math.max(...flatWalks.map((w) => w.beyond));
console.log(
  `  control sin cuenco   se meten ${flatBeyond.toFixed(0)} unidades fuera del valle ` +
    `(${flatWalks.filter((w) => w.escaped).length} salen de la rejilla entera)`
);

// --- veredicto --------------------------------------------------------------

const problems = [];
if (mesh.triangleCount === 0) problems.push("la malla no tiene ni un triangulo");
if (geom.checked === 0) problems.push("no se comprobo ni un vertice contra el campo");
if (geom.worst > 0.01) {
  problems.push(
    `la malla se aparta ${geom.worst.toFixed(3)} unidades del campo: se anda sobre un suelo que no se ve`
  );
}
if (escapes > 0) problems.push(`${escapes} de ${DIRECTIONS} marchas salieron del mundo`);
if (worstBeyond > ALLOWED_BEYOND) {
  problems.push(
    `el jugador se metio ${worstBeyond.toFixed(0)} unidades en el cuenco: la montana no contiene`
  );
}
if (worstSunk > PLAYER.stepHeight * UNITS_PER_M) {
  problems.push(`el jugador se hundio ${worstSunk.toFixed(1)} unidades bajo el terreno`);
}
if (worstAir > 0.15) {
  problems.push(`el jugador paso el ${(worstAir * 100).toFixed(0)}% del tiempo en el aire`);
}
// Si el control del agujero NO hunde a nadie, la comprobacion del hundimiento
// no esta comprobando nada.
if (brokenSunk <= PLAYER.stepHeight * UNITS_PER_M) {
  problems.push(
    `con el suelo agujereado el jugador solo se hundio ${brokenSunk.toFixed(1)} unidades: la sonda no detecta caidas`
  );
}
if (flatBeyond <= ALLOWED_BEYOND) {
  problems.push("sin cuenco nadie se salio del valle: la sonda no detecta escapes");
}

console.log();
if (problems.length) {
  for (const p of problems) console.log("FALLO:", p);
  process.exit(1);
}
console.log(
  `Hay veredicto sin qbsp: la malla coincide con su campo hasta ${geom.worst.toFixed(4)} unidades, ` +
    `${DIRECTIONS} marchas de ${SECONDS}s no salen ni se hunden, y romper el suelo o quitar las ` +
    `montanas hace fallar a la sonda.\n`
);
