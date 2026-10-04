// ATASCADO EN LA PARED — experimento 99.
//
// `PM_CheckStuck` (pm_shared.cpp:1852-1970) y su tabla
// (`PM_CreateStuckTable`, pm_shared.cpp:3406-3510), portados, y la pregunta que
// los dos hacen: `PM_TestPlayerPosition` (ReHLDS pmovetst.cpp:346), «¿la caja
// del jugador, puesta AQUÍ, toca algo sólido?».
//
// ── POR QUÉ HACE FALTA, CON EL NÚMERO ──────────────────────────────────────
//
// El controlador de personaje de Rapier NO está hecho para empezar dentro de
// la geometría. Con la cápsula metida en una malla de triángulos, cada
// `computeColliderMovement` calcula contactos contra todo lo que solapa, y eso
// en Gate City son **hasta 1,9 SEGUNDOS por paso** (medido: 3 000 cápsulas
// puestas sobre triángulos al azar, la peor en 79,6 / −6,2 / −36,9). Un
// servidor que corre cien pasos por segundo y cada uno tarda dos se ha
// colgado, y eso es lo que vio el 98 con el inspector (doc/SERVIDOR_98.md §7).
//
// El motor no tiene ese problema porque no deja llegar a eso: **antes de mover
// pregunta si estás atascado, y si lo estás no te mueve** —
//
//     // Always try and unstick us unless we are in NOCLIP mode
//     if (PM_CheckStuck()) return; // Can't move, we're stuck
//                                              pm_shared.cpp:3183-3189
//
// — y si sale del atasco a medias, `PM_FlyMove` empieza con la traza en sólido
// y no mueve nada: «entity is trapped in another solid», velocidad a cero
// (pm_shared.cpp:1059-1067). Una pregunta por paso en vez de un movimiento que
// no acaba. Eso es lo que se porta aquí, y la pregunta cuesta centésimas de
// milisegundo (doc/REAPARECER_99.md §3).
//
// ── LO QUE ES NUESTRO, dicho ───────────────────────────────────────────────
//
// 1. **Una malla no tiene interior.** El motor pregunta al árbol de clipnodos
//    del casco 1, que sabe qué es sólido por dentro; Rapier sólo sabe si la
//    cápsula CORTA algún triángulo. Una cápsula entera dentro de una roca sin
//    tocar sus caras sale «libre» — y es justo el caso que no cuelga, porque
//    sin triángulos que solapar el controlador no tiene nada que calcular. Lo
//    que cuelga es solapar caras, y eso sí se ve. Es la lección del 69 (el
//    rayo dentro del trimesh) puesta del lado que sirve.
// 2. **Contra qué se pregunta**: lo FIJO (el mapa, los adornos sólidos) y los
//    OTROS JUGADORES. No contra los bichos: en el motor un monstruo no puede
//    meterse en un jugador (`SV_Move` lo para), aquí sus cilindros los mueve el
//    paseo y pueden solaparse un instante, y contarlo como atasco dejaría
//    paralítico a quien tenga un goblin pegado. Los jugadores sí, porque el
//    motor tiene su rama propia para ellos (el «flailing», abajo).
// 3. **El reloj** es el de la partida, no `Sys_FloatTime`: es el que avanza
//    con el paso fijo y el que las pruebas pueden mover.

import RAPIER from "@dimforge/rapier3d-compat";

/** `PM_CHECKSTUCK_MINTIME`, pm_shared.cpp:1850: «Don't check again too quickly». */
export const ENTRE_PRUEBAS = 0.05;

/**
 * `rgv3tStuckTable`, en UNIDADES y con los ejes del motor (x, y, z con la z
 * hacia arriba). Cincuenta y tres empujones y un cero de relleno: el `memset`
 * deja 54 casillas (pm_shared.cpp:3413) y los bucles escriben 53.
 *
 *   0-16   «Little Moves»: ±0,125 por eje y las ocho esquinas
 *   17-52  «Big Moves»: z a 0, 1 y 6; ±2 en x y en y; y su rejilla 3×3×3
 */
export const TABLA = (() => {
  const t = [];
  for (let z = -0.125; z <= 0.125; z += 0.125) t.push([0, 0, z]);
  for (let y = -0.125; y <= 0.125; y += 0.125) t.push([0, y, 0]);
  for (let x = -0.125; x <= 0.125; x += 0.125) t.push([x, 0, 0]);
  for (let x = -0.125; x <= 0.125; x += 0.25) {
    for (let y = -0.125; y <= 0.125; y += 0.25) {
      for (let z = -0.125; z <= 0.125; z += 0.25) t.push([x, y, z]);
    }
  }
  const zi = [0, 1, 6];
  for (const z of zi) t.push([0, 0, z]);
  // Con x = z = 0 y luego y = z = 0: la z que deja el bucle de arriba (6) la
  // pisa el `x = z = 0` de la :3476, así que estas dos van a ras.
  for (let y = -2; y <= 2; y += 2) t.push([0, y, 0]);
  for (let x = -2; x <= 2; x += 2) t.push([x, 0, 0]);
  for (const z of zi) {
    for (let x = -2; x <= 2; x += 2) {
      for (let y = -2; y <= 2; y += 2) t.push([x, y, z]);
    }
  }
  while (t.length < 54) t.push([0, 0, 0]);
  return Object.freeze(t.map((v) => Object.freeze(v)));
})();

/** Del motor (x, y, z-arriba, unidades) a la escena (x, y-arriba, −z, metros). Como `aEscena`. */
const aEscena = (v, U) => [v[0] / U, v[2] / U, -v[1] / U];

/** Lo que la cápsula de `probadorDe` se encoge, en unidades: ver allí. */
export const HOLGURA_UNIDADES = 4;

/** `IN_JUMP | IN_DUCK | IN_ATTACK`, con los bits del cable (src/red/protocolo.js `BOTON`). */
export const FORCEJEO = (1 << 0) | (1 << 1) | (1 << 2);

/**
 * El estado de `PM_CheckStuck` de UN jugador en UN lado: `rgStuckLast` y
 * `rgStuckCheckTime`, que en el motor son tablas estáticas indexadas por
 * jugador y por lado (pm_shared.cpp:212 y :1863).
 */
export class Atasco {
  /** `servidor` es `pmove->server`: el bucle de 54 intentos es sólo del cliente. */
  constructor({ servidor = true, unidadesPorMetro = 39.37 } = {}) {
    this.servidor = servidor;
    this.U = unidadesPorMetro;
    this.siguiente = 0;            // rgStuckLast
    this.ultimaPrueba = -Infinity; // rgStuckCheckTime
    /** Cuántas veces ha dicho «atascado»: para medir, no lo lee ninguna regla. */
    this.veces = 0;
    this.sacado = 0;
  }

  reiniciar() { this.siguiente = 0; }  // PM_ResetStuckOffsets

  /** `PM_GetRandomStuckOffsets`: el siguiente de la tabla, en metros de escena. */
  _empujon() {
    const i = this.siguiente++ % 54;
    return { i, d: aEscena(TABLA[i], this.U) };
  }

  /**
   * `PM_CheckStuck`. Devuelve `{ atascado, pies, dentro }`:
   *
   *   - `atascado`: lo que devuelve el motor; si es `true`, ese paso NO se mueve.
   *   - `pies`: dónde queda (sólo cambia si el motor mueve el origen).
   *   - `dentro`: si al acabar sigue en sólido aunque el motor haya devuelto 0
   *     (un empujón pequeño libre NO se aplica: `if (i >= 27)`, :1930). Ahí el
   *     motor movería con la traza en sólido y `PM_FlyMove` no haría nada.
   *
   * `probar(pies)` es `PM_TestPlayerPosition`: `null` si cabe, o `{ jugador }`
   * con lo que estorba.
   */
  comprobar({ pies, t, botones = 0, probar }) {
    let tope = probar(pies);
    if (!tope) { this.reiniciar(); return { atascado: false, pies, dentro: false }; }
    const base = pies;
    const mover = (d) => [base[0] + d[0], base[1] + d[1], base[2] + d[2]];

    // «Deal with precision error in network», :1876-1900 — SÓLO en el cliente,
    // y sólo si lo que estorba es el mundo o un modelo del BSP.
    if (!this.servidor && !tope.jugador) {
      this.reiniciar();
      for (let n = 0; n < 54; n++) {
        const { d } = this._empujon();
        const prueba = mover(d);
        if (!probar(prueba)) { this.reiniciar(); this.sacado++; return { atascado: false, pies: prueba, dentro: false }; }
      }
    }

    // «Too soon?» — :1911-1916.
    if (this.ultimaPrueba >= t - ENTRE_PRUEBAS) { this.veces++; return { atascado: true, pies: base, dentro: true }; }
    this.ultimaPrueba = t;
    // `PM_StuckTouch(hitent, &traceresult)` (:1919) no se porta: es el aviso
    // de «te ha tocado» a la entidad que estorba, y aquí lo que estorba es la
    // pared o un jugador, que no tienen guion de tocar.

    const { i, d } = this._empujon();
    const prueba = mover(d);
    tope = probar(prueba);
    if (!tope) {
      this.reiniciar();
      if (i >= 27) { this.sacado++; return { atascado: false, pies: prueba, dentro: false }; }
      return { atascado: false, pies: base, dentro: true };
    }

    // «If player is flailing while stuck in another player ( should never
    // happen ), then see if we can't "unstick" them forceably.» — :1936-1966.
    // Con salto, agacharse o atacar pulsados y otro jugador encima, una
    // rejilla de 8 en horizontal y 18 hacia arriba hasta cuatro escalones.
    if ((botones & FORCEJEO) && tope.jugador) {
      for (let z = 0; z <= 4 * 18; z += 18) {
        for (let x = -8; x <= 8; x += 8) {
          for (let y = -8; y <= 8; y += 8) {
            const otra = mover(aEscena([x, y, z], this.U));
            if (!probar(otra)) { this.sacado++; return { atascado: false, pies: otra, dentro: false }; }
          }
        }
      }
    }
    this.veces++;
    return { atascado: true, pies: base, dentro: true };
  }
}

/**
 * `PM_TestPlayerPosition` para un `Player` de src/play/player.js: la cápsula
 * del jugador, puesta en `pies`, contra el mundo de Rapier.
 *
 * **Encogida CUATRO UNIDADES** (10 cm, un cuarto del radio), y eso es nuestro.
 * El motor no necesita holgura porque sus trazas nunca meten la caja en un
 * plano (se paran a `DIST_EPSILON`, 1/32 de unidad, ReHLDS world.cpp:727 y
 * :785-788). Rapier sí la mete, y no poco: medido en el 99 sobre el suelo liso
 * de las pruebas, andando despacio los pies bajan hasta **6,7 cm** bajo el
 * suelo (a 45 u/s, Ana de test/servidor98 a 2 cm a los 0,6 s), y el
 * controlador sigue andando sin coste. Con la cápsula exacta eso era
 * «atascada» y ya no se movía nunca. Lo que cuelga a Rapier es otra cosa:
 * de 2 000 cápsulas al azar sobre Gate City, las 17 que tardan más de 50 ms
 * por paso se ven TODAS aún con 15 cm de holgura; el punto viejo de Gate City
 * corta la pared 25 cm y la roca de capas de la prueba la atraviesa entera.
 *
 * `esJugador(colisionador)` dice si un colisionador es de otro jugador. Lo que
 * no es fijo ni jugador (los cilindros de los bichos) no cuenta: ver el
 * punto 2 de arriba. Unos pies que no son números NO llegan a Rapier: se
 * contestan como sólidos, que es lo que hace que ese paso no se mueva.
 */
export function probadorDe(cuerpo, { esJugador = () => false } = {}) {
  const holgura = HOLGURA_UNIDADES / (cuerpo.perfil.unidadesPorMetro ?? 39.37);
  const forma = new RAPIER.Capsule(cuerpo.half, Math.max(0.01, cuerpo.perfil.radius - holgura));
  const giro = { x: 0, y: 0, z: 0, w: 1 };
  const mundo = cuerpo.world.world;
  const cuenta = (col) => {
    const b = col.parent();
    return !b || b.isFixed() || esJugador(col);
  };
  return (pies) => {
    if (!pies.every(Number.isFinite)) return { jugador: false, raro: true };
    const col = mundo.intersectionWithShape(
      { x: pies[0], y: pies[1] + cuerpo.centreOffset, z: pies[2] }, giro, forma,
      undefined, undefined, cuerpo.collider, cuerpo.body, cuenta,
    );
    return col ? { jugador: Boolean(esJugador(col)) } : null;
  };
}
