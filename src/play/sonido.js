// LA REGLA DE LOS PASOS, de `PM_UpdateStepSound` y `PM_PlayStepSound`.
//
// Esto es la mitad del sonido que se puede probar sin sonido: decide CUÁNDO
// suena un paso, CUÁL de las cuatro muestras y a QUÉ volumen. Reproducirlo es
// de `audio.js`; aquí no hay ni un `AudioContext`, y por eso corre en
// `node --test` contando disparos en vez de escuchando.
//
// ── Lo que no se adivina ───────────────────────────────────────────────────
//
// 1. **En multijugador no hay pasos por debajo de 220 u/s** (pm_shared.cpp:422):
//
//        if (pmove->multiplayer && (!g_onladder && Length(hvel) <= 220)) return;
//
//    Andar es mudo; sólo suena correr. Como esto es multijugador, ésa es la
//    regla que toca, y no es la que se ve jugando solo.
//
// 1b. Y **`velwalk` (120) no filtra nada nunca**, que es lo contrario de lo
//    que parece al leerlo. La condición de la línea 757 es
//
//        (speed >= velwalk || pmove->flTimeStepSound == 0)
//
//    pero la función ha vuelto en su tercera línea si el reloj no estaba a
//    cero, así que ahí `flTimeStepSound` vale cero SIEMPRE y el segundo
//    término es verdad siempre. Lo escribí primero como un umbral y habría
//    dejado mudo un tramo que en el motor suena. De los dos números, el único
//    que decide algo es `velrun`: separa andar de correr, o sea el volumen y
//    el intervalo. Filtrar, filtra el corte de 220.
//
// 2. **El pie alterna aunque el paso no suene**, porque el `return` de arriba
//    está DESPUÉS de `iStepLeft = !iStepLeft`. Sacar el corte antes haría que
//    al empezar a correr siempre saliera el mismo pie.
//
// 3. **El agua tiene dos sonidos según por dónde llegue**: con la RODILLA
//    dentro (origen − 0,3·alto) es vadeo, y sólo con los pies (− 0,5·alto) es
//    chapoteo. No es el `waterlevel` del movimiento, es otra medida.
//
// 4. La velocidad que decide es el módulo de las TRES componentes, pero la del
//    corte de 220 es sólo la horizontal. Dos velocidades distintas en la misma
//    función.
//
// 5. Agachado: los umbrales bajan a 60 y 80, el reloj **suma** 100 ms y el
//    volumen se multiplica por 0,35.

/** Umbrales de velocidad, en unidades por segundo. */
export const VELOCIDAD = {
  andar: 120, correr: 210,
  // Agachado o en escalera. El motor los pone juntos en el mismo `if`.
  andarAgachado: 60, correrAgachado: 80,
};

/** Por debajo de esto no suena NADA en multijugador, salvo en escalera. */
export const MINIMO_MULTIJUGADOR = 220;

/** Agachado: milisegundos que se SUMAN al reloj, y factor de volumen. */
export const AGACHADO = { masMilis: 100, volumen: 0.35 };

/**
 * Volumen e intervalo por material. `andando` es velocidad < `correr`.
 * Los de piedra son también los de cualquier material sin declarar, que es lo
 * que hace el `default:` del `switch`.
 */
export const MATERIALES = {
  piedra:   { andando: [0.2, 400], corriendo: [0.5, 300] },
  metal:    { andando: [0.2, 400], corriendo: [0.5, 300] },
  tierra:   { andando: [0.25, 400], corriendo: [0.55, 300] },
  nieve:    { andando: [0.25, 400], corriendo: [0.55, 300] },
  hierba:   { andando: [0.4, 400], corriendo: [0.7, 300] },
  rejilla:  { andando: [0.5, 400], corriendo: [0.9, 300] },
  madera:   { andando: [0.2, 400], corriendo: [0.5, 300] },
  chapoteo: { andando: [0.2, 400], corriendo: [0.5, 300] },
  // Éstos dos no dependen de la velocidad: el motor les da un solo valor.
  vadeo:    { andando: [0.65, 600], corriendo: [0.65, 600] },
  escalera: { andando: [0.35, 350], corriendo: [0.35, 350] },
};

/** El material por defecto, que es el `default:` del `switch` del motor. */
export const POR_DEFECTO = "piedra";

/**
 * Material de una textura, según la tabla de `materials.txt`.
 *
 * `PM_FindTextureType` compara **los 12 primeros caracteres** y sin distinguir
 * mayúsculas, y devuelve piedra si no la encuentra. `tabla` es el mapa que
 * escribe `tools/sonido.mjs`, ya con las claves recortadas y en mayúsculas.
 */
export function materialDe(textura, tabla) {
  if (!textura || !tabla) return POR_DEFECTO;
  return tabla[textura.slice(0, 12).toUpperCase()] ?? POR_DEFECTO;
}

/**
 * El contador de pasos. Uno por jugador.
 *
 * `tic(dt, estado)` devuelve `null`, o el paso que hay que sonar:
 * `{ material, muestra, volumen }`, con `muestra` de 0 a 3 — el orden del
 * motor, no el del nombre del archivo, que `tools/sonido.mjs` ya guarda
 * emparejado.
 */
export class Pasos {
  constructor({ multijugador = true, azar = Math.random } = {}) {
    this.multijugador = multijugador;
    this.azar = azar;
    /** Milisegundos que faltan para el siguiente. */
    this.reloj = 0;
    /** `iStepLeft`: con qué pie va. */
    this.izquierdo = false;
  }

  /** Al aterrizar el motor pone el reloj a cero y da el paso en el acto. */
  alAterrizar() { this.reloj = 0; }

  /**
   * @param dt      segundos desde el último tic
   * @param estado  { velocidad:[x,y,z] en u/s, enSuelo, agachado, enEscalera,
   *                  rodillaEnAgua, piesEnAgua, material }
   */
  tic(dt, estado) {
    // El reloj baja SIEMPRE, se dé o no un paso (pm_shared.cpp:3116).
    if (this.reloj > 0) this.reloj = Math.max(0, this.reloj - dt * 1000);
    if (this.reloj > 0) return null;

    const v = estado.velocidad ?? [0, 0, 0];
    const rapidez = Math.hypot(v[0], v[1], v[2]);
    const horizontal = Math.hypot(v[0], v[2]);

    const enEscalera = Boolean(estado.enEscalera);
    if (!(enEscalera || estado.enSuelo)) return null;
    if (!(rapidez > 0)) return null;

    const estrecho = estado.agachado || enEscalera;
    // `VELOCIDAD.andar` NO aparece aquí a propósito: en el motor su condición
    // va en `or` con «el reloj vale cero», que en ese punto es verdad siempre.
    // Es un umbral que no filtra. Ver la nota 1b de arriba.
    const correrMin = estrecho ? VELOCIDAD.correrAgachado : VELOCIDAD.correr;
    const andando = rapidez < correrMin;

    // El material, por orden de prioridad del motor: escalera, rodilla, pies,
    // y sólo entonces la textura del suelo.
    const material = enEscalera ? "escalera"
      : estado.rodillaEnAgua ? "vadeo"
      : estado.piesEnAgua ? "chapoteo"
      : (estado.material ?? POR_DEFECTO);

    const tabla = MATERIALES[material] ?? MATERIALES[POR_DEFECTO];
    let [volumen, milis] = andando ? tabla.andando : tabla.corriendo;

    if (estado.agachado) { milis += AGACHADO.masMilis; volumen *= AGACHADO.volumen; }
    this.reloj = milis;

    // A partir de aquí es `PM_PlayStepSound`, y el orden importa: el pie
    // cambia ANTES del corte, así que sigue alternando mientras se anda mudo.
    this.izquierdo = !this.izquierdo;
    const muestra = (this.azar() < 0.5 ? 0 : 1) + (this.izquierdo ? 2 : 0);

    if (this.multijugador && !enEscalera && horizontal <= MINIMO_MULTIJUGADOR) return null;

    return { material, muestra, volumen };
  }
}

/**
 * ── ATERRIZAR, que es lo único que suena de un salto ───────────────────────
 *
 * **El motor no tiene sonido de saltar.** `PM_Jump` no toca el sonido: lo que
 * se oye al saltar es el golpe de volver al suelo, y eso lo decide
 * `PM_CheckFalling` (pm_shared.cpp:2873-2925) con tres umbrales que están en
 * `player.h:140-143`.
 *
 *     if (onground && !dead && flFallVelocity >= 350) {
 *       float fvol = 0.5;
 *       if (waterlevel > 0) { }                      // <- el cuerpo está VACÍO
 *       else if (flFallVelocity > 580) { pl_fallpain3.wav; fvol = 1.0; }
 *       else if (flFallVelocity > 580 / 2) { fvol = 0.85; }
 *       else if (flFallVelocity < 200) { fvol = 0; }
 *       if (fvol > 0) { flTimeStepSound = 0; PM_UpdateStepSound();
 *                       PM_PlayStepSound(..., fvol); }
 *     }
 *
 * Tres cosas que se ven al transcribirlo y no al leerlo:
 *
 * 1. **La rama del agua está vacía.** No es que caer al agua suene distinto:
 *    es que no cambia nada y se queda el 0,5 de fábrica. El `if` sirve sólo
 *    para saltarse los otros dos.
 * 2. **`fvol = 0` es código muerto.** Para entrar hay que caer a 350 o más, y
 *    la rama pide menos de 200. No se alcanza nunca, y por eso **un aterrizaje
 *    siempre suena** una vez pasado el umbral de 350.
 * 3. **Por debajo de 350 no suena NADA**, y 350 u/s son casi nueve metros por
 *    segundo: los saltos normales son mudos, y eso es lo que se siente jugando.
 *
 * Y con daño —por encima de 580— el SERVIDOR añade un dado de cinco caras
 * (`player.cpp:2127-2145`): dos `player/hitground*` y tres `common/bodydrop*`.
 * **Las tres de `common/` son de Valve y el mod no las tiene**, así que tres de
 * cada cinco caídas que duelen son mudas en el juego original. Se devuelve la
 * cara igual, con su nombre, y que decida quien reproduce.
 */
export const CAIDA = Object.freeze({
  /** `PLAYER_FALL_PUNCH_THRESHHOLD`: por debajo, silencio. */
  avisa: 350,
  /** `PLAYER_MAX_SAFE_FALL_SPEED`: por encima, duele y grita. */
  segura: 580,
  /** `PLAYER_MIN_BOUNCE_SPEED`, que no se alcanza nunca. Ver la nota 2. */
  rebote: 200,
});

/** Las cinco caras del dado, en su orden. Las tres últimas no están en el mod. */
export const CARAS_DE_LA_CAIDA = Object.freeze([
  "player/hitground1.wav", "player/hitground2.wav",
  "common/bodydrop1.wav", "common/bodydrop2.wav", "common/bodydrop3.wav",
]);

/**
 * Qué suena al aterrizar a `velocidad` u/s.
 *
 * Devuelve `{ volumen, voz, golpe }`: el volumen del paso (0 si no suena), el
 * grito de dolor si lo hay, y la cara del dado si la caída hace daño.
 */
export function sonidoDeCaida(velocidad, { enAgua = false, conDano = false, azar = Math.random } = {}) {
  const v = velocidad ?? 0;
  if (!(v >= CAIDA.avisa)) return { volumen: 0, voz: null, golpe: null };
  let volumen = 0.5, voz = null;
  if (enAgua) {
    // La rama vacía del motor. Se deja escrita porque borrarla haría que el
    // agua cayera en el `else if` de abajo y sonara al 0,85 o al 1.
  } else if (v > CAIDA.segura) { voz = "player/fallpain3.wav"; volumen = 1.0; }
  else if (v > CAIDA.segura / 2) { volumen = 0.85; }
  else if (v < CAIDA.rebote) { volumen = 0; }   // inalcanzable, y por eso está
  const golpe = conDano ? CARAS_DE_LA_CAIDA[Math.floor(azar() * 5)] : null;
  return { volumen, voz, golpe };
}
