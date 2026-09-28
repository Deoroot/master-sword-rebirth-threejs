// El jharro como NIVEL: lo que el visor y el arnés necesitan para andarlo.
//
// Hasta aquí el jharro eran cinco módulos que calculan cosas —el plano en 3D, la
// roca, las fachadas, las zonas y la luz— y ninguno sabía nada de Three.js ni de
// Rapier. Esto los junta en la misma forma que devuelve `loadLevel()` para un
// `.map` y `terrainLevel()` para el valle de malla, así que el visor, el sacador
// de capturas y el juez de marcha no necesitan un segundo camino.
//
// ── Lo que este nivel NO tiene, y por qué ───────────────────────────────────
//
//   brushes    ninguno. El jharro es malla entera, así que **`qbsp` no lo
//              juzga**: es el mismo reparto de jueces que el valle de
//              `hill.mjs`, y significa que aquí el juez hay que escribirlo.
//   worldspawn tampoco. Sin brushes no hay malla de `.map` que dibujar, y la
//              roca se dibuja con el atlas del kit, que es donde están sus UV.
//   cielo      no hay. Es lo que hace que una cara olvidada se vea tanto: por
//              debajo de las mallas no hay mundo, así que un agujero no enseña
//              el cielo, enseña el color de la niebla.

import { UNITS_PER_M, toScene } from "../map/geometry.js";
import { CELDA } from "./house.js";
import {
  planJharro, ENTRADA, ENTRADA_PLANTA, cotaMundo, PASO_LIBRE, transitable,
} from "./jharro.js";
import { generarRoca, repartirAlturas, libreEn } from "./roca.js";
import { montarCiudad } from "./ciudad.js";
import { planDeJuego } from "./zonas.js";
import { montarLuz, alcanceDeLaLuz, ALCANCE } from "./luz.js";
import { nuevaMalla, unir } from "./malla.js";

/**
 * Monta el jharro entero y lo devuelve con forma de nivel.
 *
 * El orden importa y no es casual: las fachadas tienen que existir antes que la
 * roca, porque la roca les pregunta por dónde NO emitir pared —dos superficies
 * en el mismo plano parpadean— y las zonas tienen que existir antes que la luz,
 * porque la luz tiene dos densidades y su frontera ES la zona.
 */
export function jharroLevel({ semilla } = {}) {
  const plan = planJharro(semilla === undefined ? {} : { semilla });
  const { alturas } = repartirAlturas(plan);
  const ciudad = montarCiudad(plan, { alturas });
  const roca = generarRoca(plan, { alturas, juntas: ciudad.juntas });
  const juego = planDeJuego(plan, ciudad);
  const luz = montarLuz(plan, juego.zonas, alturas);

  // Lo que se DIBUJA de lo generado: roca y faroles, en una sola malla porque
  // comparten el atlas del kit y por tanto una sola llamada de dibujo.
  const generada = unir(unir(nuevaMalla(), roca.malla), luz.malla);
  // Y lo que CHOCA: la roca sola.
  //
  // Los faroles NO chocan, y es la lección de la cuerda del torno de Corinth:
  // veinte centímetros de cuerda metidos en un trimesh eran un muro de seis
  // metros y medio cruzado en el único paso, y el jugador se quedaba clavado sin
  // que nada avisara. Un farol es una caja de 34 cm a dos metros de altura, o
  // sea justo a la altura de la cabeza, y hay cincuenta y ocho repartidos por
  // los sitios de paso.
  const solida = roca.malla;

  // --- dónde aparece el jugador ----------------------------------------------
  //
  // En el centro de la celda de entrada, que es donde acaba la trinchera de
  // Corinth. Se levanta medio metro para que caiga al suelo en vez de nacer
  // dentro de él: `place()` y el arranque del visor simulan hasta tocar suelo, y
  // nacer medio metro enterrado no se nota — se sale andando.
  const [ex, ey, ez] = centroCelda(ENTRADA_PLANTA, ENTRADA[0], ENTRADA[1]);
  const start = [ex, ey + 0.5, ez];

  // Y MIRANDO hacia dentro, que no es un detalle de presentación.
  //
  // La celda de entrada está pegada al margen de roca por el norte, así que con
  // el rumbo por defecto —yaw 0, o sea hacia −Z— el jugador aparece de cara a
  // una pared. Lo dijo la prueba de humo del visor: 1,5 m andados en doce
  // segundos, «el jugador está atascado». Y no estaba atascado: estaba empujando
  // la pared correcta de un mundo correcto, que es exactamente el tipo de cosa
  // que una captura de frente enseñaría como una bonita pared de roca.
  //
  // El rumbo sale de por dónde se puede ir: la galería que sale de la entrada.
  const start_yaw = rumboDeSalida(plan);
  // El arnés y el sacador de capturas hablan en unidades de Quake, y el origen
  // de un `info_player_start` está 24 unidades por encima de los pies.
  const startUnits = [
    Math.round(ex * UNITS_PER_M),
    Math.round(-ez * UNITS_PER_M),
    Math.round((ey + 0.5) * UNITS_PER_M) + 24,
  ];

  // --- las luces, con la forma que espera la escena --------------------------
  //
  // `light` en Quake es un RADIO en unidades, no una intensidad, y la escena lo
  // convierte dividiendo entre 32. Así que el alcance medido —10,6 m, el p90 de
  // Gate City— se escribe multiplicado por las unidades por metro y vuelve a
  // salir en metros al otro lado, en vez de dejar un número suelto.
  const lights = luz.luces.map((l) => ({
    units: [
      Math.round(l.pos[0] * UNITS_PER_M),
      Math.round(-l.pos[2] * UNITS_PER_M),
      Math.round(l.pos[1] * UNITS_PER_M),
    ],
    position: [l.pos[0], l.pos[1], l.pos[2]],
    light: ALCANCE * UNITS_PER_M,
    color: l.color,
    zona: l.zona,
  }));

  const mesh = {
    // Sin grupos: no hay worldspawn. Lo que se dibuja va por el atlas del kit.
    positions: new Float32Array(solida.pos),
    normals: new Float32Array(solida.nor),
    uvs: new Float32Array(solida.uv),
    groups: [],
    indices: new Uint32Array(solida.idx),
    triangleCount: solida.idx.length / 3,
    vertexCount: solida.pos.length / 3,
  };

  return {
    name: "jharro",
    entities: [],
    brushes: [],
    mesh,
    skyFaces: 0,
    lights,
    points: [
      ...juego.criaderos.map((c) => ({
        classname: "jharro_criadero",
        targetname: null,
        units: null,
        position: centroCelda(c.planta, c.x, c.z),
      })),
      ...juego.transiciones.map((t) => ({
        classname: "jharro_transicion",
        targetname: t.destino,
        units: null,
        position: centroCelda(t.planta, t.x, t.z),
      })),
    ],
    startUnits,
    start,
    startYaw: start_yaw,
    unitsPerMetre: UNITS_PER_M,

    // Lo propio del jharro, para que el arnés pueda contrastar la malla contra
    // el plano en vez de creérsela. Es lo mismo que `terrainLevel` hace con su
    // campo de alturas.
    plan,
    alturas,
    ciudad,
    roca,
    juego,
    luz,
    generada,
    solida,
    alcanceLuz: () => alcanceDeLaLuz(plan, luz.luces),
    /** La altura libre de una celda, para poder preguntarla desde fuera. */
    libreEn: (p, x, z) => libreEn(plan, alturas, p, x, z),
  };
}

/**
 * Hacia dónde mira quien acaba de bajar el socavón.
 *
 * A la galería que sale de la entrada. Con yaw 0 se mira hacia −Z, que en el
 * plano es la fila SIGUIENTE —la de más al sur—, porque el mundo crece hacia −Z
 * según se baja de fila. Es el mismo eje del revés de siempre, y aquí el síntoma
 * habría sido un jugador de cara a la pared en vez de doce casas giradas.
 */
export function rumboDeSalida(plan) {
  const [x, z] = ENTRADA;
  const p = ENTRADA_PLANTA;
  // En orden: sur, este, oeste, norte. El sur primero porque es hacia donde se
  // entra desde el norte, que es donde está la boca.
  const opciones = [
    { d: [0, 1], yaw: 0 },
    { d: [1, 0], yaw: -Math.PI / 2 },
    { d: [-1, 0], yaw: Math.PI / 2 },
    { d: [0, -1], yaw: Math.PI },
  ];
  for (const o of opciones) {
    if (transitable(plan, p, x + o.d[0], z + o.d[1])) return o.yaw;
  }
  return 0;
}

/** El centro de una celda, a ras de su suelo, en metros de mundo. */
export function centroCelda(p, x, z) {
  return [x * CELDA + CELDA / 2, cotaMundo(p), -z * CELDA - CELDA / 2];
}
