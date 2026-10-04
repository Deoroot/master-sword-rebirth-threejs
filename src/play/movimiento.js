// EL MOVIMIENTO DE MASTER SWORD, traducido del motor y de su mod.
//
// ── Por qué esto está en UNIDADES y no en metros ──────────────────────────
//
// Porque así cada constante de este archivo es **literalmente el número que
// hay en el código original**, y se puede comparar de un vistazo. En cuanto se
// convierte, `160` se vuelve `4,064` y nadie sabe ya de dónde salió. La
// conversión se hace en el borde, en `src/play/player.js`, con las unidades
// por metro que declare el mapa — y este proyecto ya aprendió por las malas
// que **GoldSrc son 39,37 u/m y no 32**.
//
// ── Qué es nuestro y qué no ───────────────────────────────────────────────
//
// Lo de aquí es el modelo de VELOCIDAD: rozamiento, aceleración, control en el
// aire, salto, caída, y cuánto corre un personaje según sus estadísticas. Es
// lo que decide el TACTO, y es lo que estaba mal: andábamos con las cifras de
// Quake.
//
// Lo que NO está aquí es la resolución de COLISIONES —`PM_FlyMove` con sus
// planos de recorte, `PM_CheckStuck`, `PM_CatagorizePosition`—. Eso lo hace el
// controlador de personaje de Rapier, que resuelve el mismo problema
// (desplazar y deslizar contra la geometría, con escalón). Reimplementarlo
// sería reescribir un motor de colisión que ya tenemos; reimplementar la
// velocidad no, porque ahí Rapier no opina.
//
// ── Las fuentes, archivo y línea ──────────────────────────────────────────
//
//   xash3d-fwgs-sdk/engine/server/sv_main.c:85-97   los movevars, con su valor
//   game/shared/movement/pm_shared.cpp              PM_Friction, PM_Accelerate,
//                                                   PM_AirAccelerate, PM_Jump
//   game/server/hl/util.h:464-474                   las cajas y la altura de ojo
//   game/server/player/playershared.cpp:1006        WalkSpeed, RunSpeed
//   game/client/ms/clplayer.cpp:297                 CheckSpeed, DoSprint
//   game/client/ms/fatigue.cpp:69                   la regeneración de aguante

// ── Los movevars del motor ────────────────────────────────────────────────
//
// Los ocho valores por defecto de `sv_main.c`. No son de Quake ni elegidos por
// nosotros: son las cadenas que el motor registra como valor inicial de cada
// cvar. Se dejan juntos y con nombre para que cambiarlos sea una decisión y no
// un descuido.
export const MOVEVARS = {
  gravedad: 800,        // sv_gravity
  velocidadDeParada: 100, // sv_stopspeed  — «how fast you come to a complete stop»
  aceleracion: 10,      // sv_accelerate
  aceleracionEnAire: 10, // sv_airaccelerate
  rozamiento: 4,        // sv_friction
  rozamientoDeBorde: 2, // edgefriction — «when nearing a ledge you might fall off»
  escalon: 18,          // sv_stepsize.  DIECIOCHO, no dieciséis.
  velocidadMaxima: 2000, // sv_maxvelocity
};

/**
 * La caja del jugador, de `util.h`.
 *
 *     VEC_HULL_MIN  (-16, -16, -36)      VEC_HULL_MAX  (16, 16, 36)
 *     VEC_VIEW      (0, 0, 28)
 *     VEC_DUCK_HULL_MIN (-16,-16,-18)    VEC_DUCK_HULL_MAX (16,16,18)
 *     VEC_DUCK_VIEW (0, 0, 12)
 *
 * El origen está en el CENTRO, así que los pies están 36 por debajo y el ojo a
 * 36 + 28 = **64 sobre los pies**. Es fácil leer el 28 y creer que el ojo está
 * a 28: quedaría a la altura de una mesa.
 */
export const CAJA = {
  ancho: 32,            // 16 de radio, la caja es cuadrada
  alto: 72,
  ojo: 64,              // 36 + 28
  altoAgachado: 36,
  ojoAgachado: 30,      // 18 + 12
  ojoMuerto: -8,        // PM_DEAD_VIEWHEIGHT, relativo al origen
};

/**
 * El salto: `pmove->velocity[2] = sqrt(2 * 800 * 45.0)`.
 *
 * No es una velocidad elegida: es la que hace falta para subir **45
 * unidades** con la gravedad del motor, escrita como la fórmula en vez de como
 * el resultado. Son 268,33 u/s, o **1,14 m** de altura de salto.
 */
export const ALTURA_DE_SALTO = 45;
export const velocidadDeSalto = (gravedad = MOVEVARS.gravedad) =>
  Math.sqrt(2 * gravedad * ALTURA_DE_SALTO);

// ── La velocidad de un personaje, que es lo propio de Master Sword ────────
//
// Esto ya no es GoldSrc: es el mod. `CBasePlayer::WalkSpeed()`.

export const VELOCIDAD = {
  base: 160,            // BASE_SPEED
  agilidadTope: 75,     // WALKSPEED_MAX_DEX — «75 dex adds 100 to speed»
  mejoraMaxima: 100,    // lo que suman esos 75 puntos
  lastreMaximo: 70,     // WALKSPEED_MAX_WEIGHT_SLOWDOWN
};

/**
 * Lo que anda un personaje, en unidades por segundo.
 *
 *     StatEnhancement = (min(Dex, 75) / 75) * 100
 *     VolumeHalf      = Volume() / 2
 *     SpeedDetriment  = clamp((max(Weight - VolumeHalf, 0) / VolumeHalf) * 70, 0, 70)
 *     fSpeed          = 160 + StatEnhancement - SpeedDetriment
 *
 * Dos cosas que no son obvias y que cambian el juego:
 *
 * **La agilidad satura a 75.** De 0 a 75 puntos se gana un 62 % de velocidad;
 * del 75 al tope de 300, nada. O sea que la agilidad no es una estadística que
 * se suba «para correr más» más allá de cierto punto.
 *
 * **El peso no estorba hasta la MITAD de lo que puedes cargar.** Y a partir de
 * ahí baja hasta 70 unidades, que sobre 160 es casi la mitad. Con la mochila a
 * tope y sin agilidad se anda a 90 u/s, 2,3 m/s — menos que una persona.
 */
export function velocidadAndando({ agilidad = 0, peso = 0, carga = 25 } = {}) {
  const mejora = (Math.min(agilidad, VELOCIDAD.agilidadTope) / VELOCIDAD.agilidadTope) * VELOCIDAD.mejoraMaxima;
  const mitad = carga / 2;
  // `VolumeHalf` nunca es cero en el juego —`Volume()` arranca en 25— pero si
  // alguien llama a esto con carga 0, dividir da infinito y el personaje se
  // queda clavado sin que nada lo avise.
  let lastre = 0;
  if (mitad > 0) {
    lastre = (Math.max(peso - mitad, 0) / mitad) * VELOCIDAD.lastreMaximo;
    lastre = Math.min(Math.max(lastre, 0), VELOCIDAD.lastreMaximo);
  }
  return VELOCIDAD.base + mejora - lastre;
}

/**
 * Lo que corre, que es **andar por (1 + aguante restante)**.
 *
 *     fSpeed *= 1 + min(Stamina / MaxStamina, 1.0)
 *
 * Con el aguante lleno se corre al DOBLE; con el aguante a cero, correr no
 * corre nada. No es un interruptor: es una rampa, y por eso en Master Sword
 * huir se va apagando en vez de cortarse de golpe.
 */
export function velocidadCorriendo(andando, { aguante = 0, aguanteMax = 1 } = {}) {
  const a = Math.max(aguante, 0.001);
  const m = Math.max(aguanteMax, 0.001);
  return andando * (1 + Math.min(a / m, 1));
}

/**
 * Los dos castigos de `ParseSpeed()`, que se aplican al final.
 *
 *     if (ArrowsStuckInMe > 0) Speed -= 60;
 *     Speed *= attacking ? 0.5 : 1.0;
 *
 * Lo de las flechas es literal: **basta UNA clavada** para perder 60 unidades,
 * y dos no quitan más que una. Es una comprobación de «> 0», no una cuenta.
 */
export const PENALIZACION_FLECHA = 60;
export function ajustarVelocidad(v, { flechasClavadas = 0, atacando = false } = {}) {
  let s = v;
  if (flechasClavadas > 0) s -= PENALIZACION_FLECHA;
  if (atacando) s *= 0.5;
  return s;
}

/**
 * Los tres ejes, de `CheckSpeed()`:
 *
 *     cl_forwardspeed = fSpeed
 *     cl_backspeed    = fSpeed * 0.5
 *     cl_sidespeed    = fSpeed * 0.8
 *
 * **Andar hacia atrás va a la MITAD.** Esto es lo que más se nota y es lo que
 * no teníamos: con los tres ejes iguales, retroceder de un monstruo es gratis,
 * y en Master Sword no lo es.
 */
export const EJES = { adelante: 1.0, atras: 0.5, lado: 0.8 };

// ── El aguante ────────────────────────────────────────────────────────────

/** Correr cuesta 0,6 por segundo. `Player_UseStamina(0.6 * frametime)`. */
export const AGUANTE_CORRIENDO = 0.6;

/**
 * Y se recupera a `0.6 + Fuerza/10` por segundo, **sólo si no corres ni
 * actúas**. `CHudFatigue::DoThink()`.
 */
export function regeneracionDeAguante(fuerza = 0) {
  return 0.6 + fuerza / 10;
}

/**
 * Lo que cuesta saltar: `int JumpEnergy = min(Weight/Volume, 1) * 4`.
 *
 * Y es un `int`, o sea que **trunca**: con la mochila a menos de un cuarto,
 * saltar es GRATIS. Otra decisión de diseño escondida en una conversión de
 * tipo, como el impuesto de muerte.
 */
export function aguanteDeSalto({ peso = 0, carga = 25 } = {}) {
  if (!(carga > 0)) return 0;
  return Math.trunc(Math.min(peso / carga, 1) * 4);
}

// ── La caída ──────────────────────────────────────────────────────────────

export const CAIDA = {
  seguro: 580,   // PLAYER_MAX_SAFE_FALL_SPEED — «approx 20 feet»
  mortal: 1024,  // PLAYER_FATAL_FALL_SPEED — «approx 60 feet»
};

/**
 * El daño de caída, en puntos de vida, a partir de la velocidad de impacto.
 *
 *     DAMAGE_FOR_FALL_SPEED = 100 / (1024 - 580)
 *     damage = (flFallVelocity - PLAYER_MAX_SAFE_FALL_SPEED) * DAMAGE_FOR_FALL_SPEED
 *
 * Son 100 de daño a 1024 u/s, y **cien puntos matan a casi cualquiera**: un
 * personaje nuevo tiene 15. O sea que la caída mortal del motor no es mortal
 * por un caso especial, es mortal porque 100 es mucho.
 */
export function danoDeCaida(velocidad) {
  if (!(velocidad > CAIDA.seguro)) return 0;
  return (velocidad - CAIDA.seguro) * (100 / (CAIDA.mortal - CAIDA.seguro));
}

// ── El modelo de velocidad del motor ──────────────────────────────────────

/**
 * `PM_Friction()`.
 *
 *     control = (speed < stopspeed) ? stopspeed : speed
 *     drop   += control * friction * frametime
 *     newspeed = max(speed - drop, 0)
 *
 * El suelo de `stopspeed` es lo que hace que parar sea rápido y no asintótico:
 * sin él, un rozamiento proporcional nunca llega a cero y el jugador patina
 * eternamente a velocidad diminuta.
 *
 * Y el rozamiento **se duplica al borde de un precipicio**
 * (`edgefriction 2`): el motor traza 16 unidades en la dirección de marcha y
 * 34 hacia abajo, y si no encuentra suelo, frena el doble. Es una ayuda para
 * no caerse, y es lo que hace que asomarse a un saliente se sienta pegajoso.
 * Quien llame a esto dice si está al borde; aquí no se traza nada.
 */
export function friccion(velocidad, dt, { enSuelo = true, alBorde = false, vars = MOVEVARS } = {}) {
  const [vx, vy, vz] = velocidad;
  const rapidez = Math.hypot(vx, vy, vz);
  // Por debajo de 0,1 el motor para en seco: `if (speed < 0.1f) return;` —
  // sin eso, dividir por `speed` más abajo da infinitos.
  if (rapidez < 0.1) return [0, 0, 0];
  let caida = 0;
  if (enSuelo) {
    const roz = vars.rozamiento * (alBorde ? vars.rozamientoDeBorde : 1);
    const control = rapidez < vars.velocidadDeParada ? vars.velocidadDeParada : rapidez;
    caida = control * roz * dt;
  }
  const nueva = Math.max(rapidez - caida, 0) / rapidez;
  return [vx * nueva, vy * nueva, vz * nueva];
}

/**
 * `PM_Accelerate()`. Acelera **sólo en lo que falta** hacia `wishspeed` medido
 * en la dirección deseada.
 *
 *     currentspeed = dot(velocity, wishdir)
 *     addspeed     = wishspeed - currentspeed
 *     if (addspeed <= 0) return
 *     accelspeed   = min(accel * frametime * wishspeed, addspeed)
 *
 * La proyección con el producto escalar es la clave: si ya vas a tope en esa
 * dirección no acelera, pero si vas a tope hacia OTRO lado sí, y por eso girar
 * en marcha responde.
 */
export function acelerar(velocidad, dir, deseada, accel, dt) {
  const actual = velocidad[0] * dir[0] + velocidad[1] * dir[1] + velocidad[2] * dir[2];
  const falta = deseada - actual;
  if (falta <= 0) return [...velocidad];
  const paso = Math.min(accel * dt * deseada, falta);
  return [velocidad[0] + paso * dir[0], velocidad[1] + paso * dir[1], velocidad[2] + paso * dir[2]];
}

/**
 * `PM_AirAccelerate()`, y **no es `acelerar` con otro número**.
 *
 *     if (wishspd > 30) wishspd = 30;          ← el tope, para `addspeed`
 *     addspeed   = wishspd - dot(vel, wishdir)
 *     accelspeed = accel * wishspeed * frametime   ← SIN topar, el de verdad
 *
 * Usa el valor TOPADO para decidir cuánto falta y el SIN TOPAR para decidir
 * cuánto se avanza por fotograma. No es un descuido: es de donde sale el
 * control en el aire de los motores de Quake, y su fama de permitir ganar
 * velocidad girando.
 *
 * Lo que las pruebas MIDEN de esa fama es esto, y conviene no prometer más:
 * el tope de 30 manda en las dos versiones, así que **el sitio al que se llega
 * es el mismo**; lo que cambia es cuánto se tarda. Desde parado, con el 160
 * sin topar se añaden 26,67 por paso y con el 30 topado sólo 5 — o sea **dos
 * pasos contra seis** hasta tener control. Un salto dura cuarenta pasos, así
 * que esa diferencia es la que hay entre poder corregir en el aire y no
 * llegar a tiempo.
 *
 * Igualar los dos no daría ningún error. Daría un juego más torpe.
 */
export const TOPE_EN_AIRE = 30;
export function acelerarEnAire(velocidad, dir, deseada, accel, dt) {
  const topada = Math.min(deseada, TOPE_EN_AIRE);
  const actual = velocidad[0] * dir[0] + velocidad[1] * dir[1] + velocidad[2] * dir[2];
  const falta = topada - actual;
  if (falta <= 0) return [...velocidad];
  const paso = Math.min(accel * deseada * dt, falta);
  return [velocidad[0] + paso * dir[0], velocidad[1] + paso * dir[1], velocidad[2] + paso * dir[2]];
}

/**
 * La dirección y la rapidez que pide el jugador.
 *
 * `PM_WalkMove` construye `wishvel = forward*fmove + right*smove`, donde
 * `fmove` y `smove` ya vienen escalados por `cl_forwardspeed`, `cl_backspeed`
 * y `cl_sidespeed`. Luego **topa la longitud a `maxspeed`**, que es lo que
 * impide que ir en diagonal sea más rápido.
 *
 * El convenio de ángulo es el de `player.js`: con yaw 0 se mira hacia −Z.
 *
 * EL 97: `tope` es el `pmove->maxspeed` de `PM_CheckParamters`
 * (pm_shared.cpp:3050-3053), que un efecto que frena baja a su porcentaje
 * LEÍDO COMO UNIDADES — el fallo del original, en `src/play/trabas.js`. Sin
 * efectos no muerde (`sv_maxspeed` es 600 y correr no pasa de 520).
 */
export function deseo({ adelante = 0, lado = 0 }, yaw, maxima, tope = Infinity) {
  const f = adelante >= 0 ? adelante * EJES.adelante : adelante * EJES.atras;
  const s = lado * EJES.lado;
  const sen = Math.sin(yaw), cos = Math.cos(yaw);
  // Con yaw 0 se avanza a (−sen, −cos) y el costado va a (cos, −sen).
  let x = (-sen * f + cos * s) * maxima;
  let z = (-cos * f - sen * s) * maxima;
  let rapidez = Math.hypot(x, z);
  const techo = Math.min(maxima, tope);
  if (rapidez > techo) {
    const k = techo / rapidez;
    x *= k; z *= k; rapidez = techo;
  }
  if (rapidez < 1e-6) return { dir: [0, 0, 0], rapidez: 0 };
  return { dir: [x / rapidez, 0, z / rapidez], rapidez };
}

/**
 * Si el jugador está corriendo ahora mismo. `DoSprint()`, las cinco
 * condiciones, y ninguna sobra:
 *
 *   - pulsa CORRER **y** ADELANTE — correr de lado o hacia atrás no existe
 *   - le queda aguante (`Stamina > 1` para empezar, `> 0` para seguir)
 *   - no está agachado
 *   - no está atacando
 *   - no le han frenado de golpe: `velocidad < ultimaVelocidad - 50` corta la
 *     carrera. Eso es chocar con algo, y es lo que impide correr contra una
 *     pared para mantener la carrera.
 */
export function puedeCorrer({
  corriendoYa = false, pulsaCorrer = false, adelante = 0,
  aguante = 0, agachado = false, atacando = false,
  rapidez = 0, rapidezAnterior = 0,
} = {}) {
  if (agachado || atacando) return false;
  if (adelante <= 0) return false;
  if (corriendoYa) {
    if (aguante <= 0) return false;
    if (rapidez < rapidezAnterior - 50) return false;
    return pulsaCorrer;
  }
  return pulsaCorrer && aguante > 1;
}

/**
 * LO QUE EL JUEGO TE DICE AL EMPEZAR Y AL DEJAR DE TROTAR — el 63.
 *
 * `DoSprint` no sólo decide: **habla**, y por la consola de sucesos. Son cinco
 * frases y cada una tiene su motivo, que es lo que las hace útiles: enterarte
 * de que has dejado de correr porque te has quedado sin aguante no es lo mismo
 * que enterarte de que has chocado.
 *
 *     SendEventMsg("You break into a jog.");                        :343
 *     SendEventMsg("You slow down and begin walking casually.");    :386
 *     SendEventMsg(HUDEVENT_UNABLE, "You are too exhausted to run.");          :348
 *     SendEventMsg(HUDEVENT_UNABLE, "You are too exhausted to continue running."); :357
 *     SendEventMsg(HUDEVENT_UNABLE, "You lose your running speed."); :373
 *                                                        clplayer.cpp
 *
 * El motivo de parar se deduce **con las mismas condiciones que `puedeCorrer`
 * y en el mismo orden que el mod**, para que las dos no puedan discrepar: si
 * una dice «ya no corres» y la otra «porque te has cansado» cuando en realidad
 * chocaste, el aviso miente. Por eso esto vive al lado y toma los mismos
 * argumentos.
 *
 * `ms_sprint_verbose` («0» calla todo, «1» sólo los `UNABLE», «2» también el
 * trote) existe en la rama nueva del mod (clplayer.cpp:234-266) y **no** en la
 * vieja, que dice las cinco siempre (:343-387). Se porta el valor con el que
 * se ven en el juego, que es el de la captura: las cinco.
 *
 * @returns {{tipo:"normal"|"nopuedes", texto:string}|null}
 */
export const SPRINT_VERBOSE = "2";

export function avisoDeCarrera({
  corriendoAntes = false, corriendoAhora = false, pulsaCorrer = false,
  adelante = 0, aguante = 0, agachado = false, atacando = false,
  rapidez = 0, rapidezAnterior = 0, verbose = SPRINT_VERBOSE,
} = {}) {
  if (verbose === "0") return null;
  const trote = verbose === "2";
  // ARRANCAR.
  if (!corriendoAntes) {
    if (corriendoAhora) return trote ? { tipo: "normal", texto: "You break into a jog." } : null;
    // Se pidió correr hacia delante y no arrancó: sólo hay un motivo posible
    // que el mod cuente, y es el aguante (`Stamina <= 1`).
    if (pulsaCorrer && adelante > 0 && !agachado && !atacando && aguante <= 1) {
      return { tipo: "nopuedes", texto: "You are too exhausted to run." };
    }
    return null;
  }
  // PARAR, y en el orden del mod: primero el aguante, luego el frenazo, y
  // soltar adelante el último — porque soltar es lo normal y lo demás no.
  if (corriendoAhora) return null;
  if (aguante <= 0) return { tipo: "nopuedes", texto: "You are too exhausted to continue running." };
  if (agachado || atacando || rapidez < rapidezAnterior - 50) {
    return { tipo: "nopuedes", texto: "You lose your running speed." };
  }
  return trote ? { tipo: "normal", texto: "You slow down and begin walking casually." } : null;
}

/**
 * Un paso completo del modelo de velocidad, en unidades y segundos.
 *
 * Devuelve **dos cosas, y hacen falta las dos**:
 *
 *     velocidad   la del final del paso, que es la que se guarda
 *     mover       el desplazamiento de ESTE paso, que es el que se aplica
 *
 * No son `velocidad × dt`, y ahí está el detalle. El motor parte la gravedad
 * en dos mitades alrededor del movimiento:
 *
 *     PM_AddCorrectGravity()      // «so they'll be in the correct position
 *                                 //  during movement»        — media
 *     ...acelerar y mover...
 *     PM_FixupGravityVelocity()   // «get the correct velocity for the end
 *                                 //  of the dt»              — la otra media
 *
 * Eso es integración de punto medio, y es **exacta** para una aceleración
 * constante: el salto sube sus 45 unidades exactas dé el paso que dé. Con la
 * gravedad entera antes de mover —Euler a secas, que es lo primero que uno
 * escribe— el salto sube 42,6 a 60 Hz y menos según baje la tasa de
 * fotogramas. **No da ningún error: da un salto un 5 % más bajo que va
 * cambiando con el rendimiento del equipo.**
 *
 * Mover el cuerpo y resolver el choque es de quien llama: aquí no hay mundo.
 */
/**
 * A qué altura está el agua respecto de ti. `PM_CheckWater()`, tres niveles.
 *
 *   1  los pies      un punto una unidad por encima de la planta
 *   2  la cintura    el centro de la caja
 *   3  los ojos      y a partir de aquí se nada de verdad
 *
 * Las tres alturas son del motor y salen de la caja, no de un gusto: el punto
 * es `origin + mins[2] + 1`, luego `origin + (mins+maxs)/2` y luego
 * `origin + view_ofs`. Con la caja de Master Sword —72 de alto, ojo a 64— eso
 * es 1, 36 y 64 unidades por encima de los pies.
 *
 * `hayAgua(z)` contesta si a esa altura, en la vertical del jugador, hay agua.
 */
export function nivelDeAgua(hayAgua, { agachado = false, caja = CAJA } = {}) {
  const alto = agachado ? caja.altoAgachado : caja.alto;
  const ojo = agachado ? caja.ojoAgachado : caja.ojo;
  if (!hayAgua(1)) return 0;
  if (!hayAgua(alto / 2)) return 1;
  return hayAgua(ojo) ? 3 : 2;
}

/** A partir de qué nivel se nada en vez de andar. `return waterlevel > 1`. */
export const NADANDO = 2;

/**
 * `PM_WaterMove()`: nadar.
 *
 * Tres cosas que no se adivinan y están en el código del motor:
 *
 *   SE HUNDE SOLO. Sin ninguna tecla, `wishvel[2] -= 60`. El agua no te sostiene
 *   — si sueltas los mandos te vas al fondo, y eso es lo que hace que salir
 *   valga algo.
 *   SE NADA AL 80 %. `wishspeed *= 0.8` DESPUÉS de capar a `maxspeed`, así que
 *   el tope real es cuatro quintos de lo que andas.
 *   EL ROZAMIENTO ES EL MISMO de andar, `movevars->friction`, pero se aplica al
 *   MÓDULO de la velocidad entera y no sólo a la horizontal. Por eso en el agua
 *   se frena también al caer.
 *
 * Y una rareza del motor que se copia tal cual: `addspeed = wishspeed −
 * newspeed` compara contra el **módulo** de la velocidad tras el rozamiento, no
 * contra su componente en la dirección deseada, que es lo que hacen
 * `PM_Accelerate` y `PM_AirAccelerate`. O sea que en el agua, ir rápido en una
 * dirección te impide acelerar en otra. No es lo que uno escribiría; es lo que
 * hay, y cambiarlo sería nadar distinto que el juego.
 */
export function nadar(velocidad, {
  intencion = {}, yaw = 0, maxima = 160, dt = 1 / 60,
  subir = 0, vars = MOVEVARS, friccionDeEntidad = 1, tope = Infinity,
} = {}) {
  let v = [...velocidad];
  const { adelante = 0, lado = 0 } = intencion;
  // EL 97: el mismo `pmove->maxspeed` que en tierra (pm_shared.cpp:1298 topa
  // contra él, y lo bajó `PM_CheckParamters`). Ver `deseo`.
  const techo = Math.min(maxima, tope);
  // Las mismas componentes que en tierra, sin los factores de andar hacia atrás
  // ni de lado: `PM_WaterMove` usa `forwardmove` y `sidemove` a pelo.
  const sy = Math.sin(yaw), cy = Math.cos(yaw);
  let deseada = [
    (-sy * adelante + cy * lado) * maxima,
    // `upmove` es saltar (subir) y agacharse (bajar), y va en el eje vertical.
    subir * maxima,
    (-cy * adelante - sy * lado) * maxima,
  ];
  if (!adelante && !lado && !subir) deseada[1] -= 60;   // se hunde solo

  let rapidez = Math.hypot(deseada[0], deseada[1], deseada[2]);
  if (rapidez > techo) {
    const k = techo / rapidez;
    deseada = deseada.map((x) => x * k);
    rapidez = techo;
  }
  rapidez *= 0.8;

  // Rozamiento sobre el módulo de la velocidad ENTERA, vertical incluida.
  const modulo = Math.hypot(v[0], v[1], v[2]);
  let tras = 0;
  if (modulo) {
    tras = Math.max(0, modulo - dt * modulo * vars.rozamiento * friccionDeEntidad);
    const k = tras / modulo;
    v = v.map((x) => x * k);
  }

  if (rapidez >= 0.1) {
    const falta = rapidez - tras;
    if (falta > 0) {
      const n = Math.hypot(deseada[0], deseada[1], deseada[2]) || 1;
      const dir = deseada.map((x) => x / n);
      const acel = Math.min(falta, vars.aceleracion * rapidez * dt * friccionDeEntidad);
      for (let i = 0; i < 3; i++) v[i] += acel * dir[i];
    }
  }
  return { velocidad: v, mover: [v[0] * dt, v[1] * dt, v[2] * dt] };
}

/** `MAX_CLIMB_SPEED`, en unidades por segundo. */
export const VELOCIDAD_DE_ESCALADA = 200;

/** Lo que empuja `PM_LadderMove` al saltar desde una escalera: 270 unidades. */
export const SALTO_DESDE_ESCALERA = 270;

/**
 * `PM_LadderMove()`: trepar.
 *
 * La idea del motor, que no es obvia: **mirar hacia la escalera y andar hacia
 * delante te sube**. La intención se descompone contra la normal de la escalera
 * —lo que va CONTRA la pared se convierte en movimiento vertical, y lo que va a
 * lo largo se queda— así que subes mirando arriba y también empujando de frente.
 *
 * Y sin tocar nada, la velocidad se pone a CERO: en una escalera no hay
 * gravedad y no se resbala. Es un `MOVETYPE_FLY` mientras dura.
 *
 * `normal` es la normal de la cara de la escalera. Aquí sale de la caja del
 * volumen —una escalera de GoldSrc es un brush fino, y su eje fino es el de la
 * normal— con el signo hacia el jugador. El motor la saca de una traza contra
 * el modelo; con una caja, el eje fino da la misma respuesta salvo que estés
 * justo en el canto.
 */
export function trepar(velocidad, {
  intencion = {}, yaw = 0, cabeceo = 0, normal = [0, 0, 1], dt = 1 / 60,
  saltar = false, enSuelo = false,
} = {}) {
  if (saltar) {
    // Saltar de una escalera te despega de ella, y con fuerza fija: 270 en la
    // dirección de la normal, sin mirar hacia dónde mires.
    const v = normal.map((x) => x * SALTO_DESDE_ESCALERA);
    return { velocidad: v, mover: [v[0] * dt, v[1] * dt, v[2] * dt], soltar: true };
  }
  const { adelante = 0, lado = 0 } = intencion;
  if (!adelante && !lado) {
    // Quieto en la escalera: quieto de verdad.
    return { velocidad: [0, 0, 0], mover: [0, 0, 0], soltar: false };
  }
  // Hacia dónde mira, con el CABECEO incluido — es lo que permite subir
  // mirando arriba, y sin él la escalera sólo funciona empujando contra ella.
  const cp = Math.cos(cabeceo), sp = Math.sin(cabeceo);
  const mirada = [-Math.sin(yaw) * cp, sp, -Math.cos(yaw) * cp];
  const derecha = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const q = [
    mirada[0] * adelante * VELOCIDAD_DE_ESCALADA + derecha[0] * lado * VELOCIDAD_DE_ESCALADA,
    mirada[1] * adelante * VELOCIDAD_DE_ESCALADA + derecha[1] * lado * VELOCIDAD_DE_ESCALADA,
    mirada[2] * adelante * VELOCIDAD_DE_ESCALADA + derecha[2] * lado * VELOCIDAD_DE_ESCALADA,
  ];

  // La perpendicular dentro del plano de la escalera, y luego el eje vertical
  // de ese plano. Es el `CrossProduct` del motor, con el arriba de Three (+Y).
  const arriba = [0, 1, 0];
  const perp = normaliza(producto(arriba, normal));
  const contra = q[0] * normal[0] + q[1] * normal[1] + q[2] * normal[2];
  const lateral = [
    q[0] - normal[0] * contra, q[1] - normal[1] * contra, q[2] - normal[2] * contra,
  ];
  const eje = producto(normal, perp);
  const v = [
    lateral[0] - eje[0] * contra,
    lateral[1] - eje[1] * contra,
    lateral[2] - eje[2] * contra,
  ];
  // En el suelo y empujando hacia AFUERA, el motor te despega en vez de
  // dejarte clavado contra el primer peldaño.
  if (enSuelo && contra > 0) {
    for (let i = 0; i < 3; i++) v[i] += normal[i] * VELOCIDAD_DE_ESCALADA;
  }
  return { velocidad: v, mover: [v[0] * dt, v[1] * dt, v[2] * dt], soltar: false };
}

const producto = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normaliza = (a) => {
  const n = Math.hypot(a[0], a[1], a[2]);
  return n ? [a[0] / n, a[1] / n, a[2] / n] : [0, 0, 0];
};

/**
 * La normal de una escalera, deducida de su caja: su eje MÁS FINO, apuntando
 * hacia el jugador.
 *
 * Una escalera de GoldSrc es un brush pegado a la pared —las dos de Gate City
 * miden 40×5×415 y 48×4×408 unidades— así que el eje fino es la cara por la que
 * se trepa. No hay ambigüedad: el segundo eje más fino mide ocho veces más.
 */
export function normalDeEscalera(caja, punto) {
  const tam = [0, 1, 2].map((k) => caja.max[k] - caja.min[k]);
  let fino = 0;
  for (let k = 1; k < 3; k++) if (tam[k] < tam[fino]) fino = k;
  const centro = (caja.min[fino] + caja.max[fino]) / 2;
  const n = [0, 0, 0];
  n[fino] = punto[fino] >= centro ? 1 : -1;
  return n;
}

export function pasoDeVelocidad(velocidad, {
  intencion = {}, yaw = 0, maxima = 160, dt = 1 / 60,
  enSuelo = true, alBorde = false, saltar = false, vars = MOVEVARS,
  tope = Infinity,
} = {}) {
  let v = [...velocidad];
  const { dir, rapidez } = deseo(intencion, yaw, maxima, tope);
  const media = (vars.gravedad * dt) / 2;

  if (enSuelo) {
    // En el suelo la velocidad vertical se pone a cero ANTES de rozar, que es
    // lo que hace `PM_WalkMove`: si no, el rozamiento se come parte del salto.
    v[1] = 0;
    v = friccion(v, dt, { enSuelo: true, alBorde, vars });
    v = acelerar(v, dir, rapidez, vars.aceleracion, dt);
  } else {
    v[1] -= media;                       // PM_AddCorrectGravity
    v = acelerarEnAire(v, dir, rapidez, vars.aceleracionEnAire, dt);
  }

  // En el suelo el desplazamiento es SÓLO horizontal: el salto empieza a subir
  // en el paso siguiente. Si se contara aquí, el primer paso subiría una
  // altura entera de más y el salto pasaría de 45 a 49,5.
  const mover = enSuelo ? [v[0] * dt, 0, v[2] * dt] : [v[0] * dt, v[1] * dt, v[2] * dt];
  if (enSuelo && saltar) v[1] = velocidadDeSalto(vars.gravedad);
  if (!enSuelo) v[1] -= media;           // PM_FixupGravityVelocity

  for (let i = 0; i < 3; i++) {
    v[i] = Math.min(Math.max(v[i], -vars.velocidadMaxima), vars.velocidadMaxima);
  }
  return { velocidad: v, mover };
}

// ── EL 99: LA VELOCIDAD TAMBIÉN SE RECORTA CONTRA LO QUE TOCAS ─────────────
//
// Corrección a la cabecera de este archivo, que dice que `PM_FlyMove` «lo hace
// el controlador de Rapier». Es verdad del DESPLAZAMIENTO y no de la
// VELOCIDAD: Rapier desliza la cápsula contra la pared y devuelve cuánto se ha
// movido, pero la velocidad la lleva este archivo, y nadie la recortaba. Para
// el techo había una regla NUESTRA en `Player.step` —«si subiste menos de la
// mitad de lo pedido, la vertical a cero»—, que no está en el motor. Lo del
// motor es esto: por cada plano que corta el movimiento, `PM_ClipVelocity`
// le quita a la velocidad la parte que entra en el plano.
//
//     STOP_EPSILON 0.1        pm_shared.cpp:151
//     DIST_EPSILON 0.125f     pm_shared.cpp:152  («network quantization»)
//     PM_ClipVelocity         pm_shared.cpp:933-973
//     PM_FlyMove, los planos  pm_shared.cpp:1021-1206
//
// LOS EJES: el motor tiene la Z arriba y este proyecto la Y. `angle =
// normal[2]` del motor es aquí `n[1]`; el producto escalar no depende de los
// ejes, así que lo demás se copia tal cual.
export const STOP_EPSILON = 0.1;
export const DIST_EPSILON = 0.125;
export const MAX_CLIP_PLANES = 5;    // pm_defs.h:22

/**
 * `PM_ClipVelocity` (pm_shared.cpp:933-973): «slide off of the impacting
 * object». Devuelve la velocidad nueva; `n` es la normal del plano, hacia
 * fuera del sólido, y `rebote` el `overbounce`.
 *
 * Las líneas 961-969 son de MSR y no de Valve: «iterate once to make sure we
 * aren't still moving through the plane». Si después de recortar la velocidad
 * todavía no SALE del plano, se empuja hacia fuera hasta `DIST_EPSILON`. O sea
 * que contra un techo plano la vertical no queda en 0 sino en −0,125 u/s.
 */
export function recortarVelocidad(v, n, rebote = 1) {
  const backoff = (v[0] * n[0] + v[1] * n[1] + v[2] * n[2]) * rebote;
  const out = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    out[i] = v[i] - n[i] * backoff;
    if (out[i] > -STOP_EPSILON && out[i] < STOP_EPSILON) out[i] = 0;
  }
  let ajuste = out[0] * n[0] + out[1] * n[1] + out[2] * n[2];
  if (ajuste <= 0) {
    ajuste = Math.min(ajuste, -DIST_EPSILON);
    for (let i = 0; i < 3; i++) out[i] -= n[i] * ajuste;
  }
  return out;
}

/**
 * Los PLANOS de `PM_FlyMove` (pm_shared.cpp:1046-1203), aplicados a la lista
 * de choques que devuelve el controlador de Rapier en vez de a los `trace`.
 *
 * Cada choque es `{ n: [x, y, z], toi }`, en el orden en que ocurrieron. La
 * correspondencia con el motor:
 *
 *   - `toi > 0` es `trace.fraction > 0`: se avanzó algo antes de chocar, y
 *     entonces `original_velocity = velocity` y `numplanes = 0` (:1073-1078).
 *   - más de `MAX_CLIP_PLANES` planos sin avanzar: velocidad a cero (:1112-1119).
 *   - `reflejar` es la rama de `MOVETYPE_WALK && (onground == -1 ||
 *     friction != 1)` (:1128-1144), o sea **en el aire**: cada plano recorta
 *     desde la original, y los de suelo (`n > 0.7`) la actualizan.
 *   - si no, la rama de la arista (:1145-1196), que es la de la escalera
 *     (`MOVETYPE_FLY`, :2295) y la del suelo.
 *   - `seMovio` falso con choques es `allFraction == 0`: «don't stick», la
 *     velocidad a cero (:1199-1203).
 *
 * `rebote` es `1 + bounce * (1 - friction)`, y `pmove->friction` es el
 * rozamiento de la ENTIDAD (1 salvo un `func_friction`), no `sv_friction`: en
 * la práctica vale 1.
 */
export function velocidadContraPlanos(velocidad, choques, {
  reflejar = true, rebote = 1, seMovio = true,
} = {}) {
  let v = [...velocidad];
  if (!choques.length) return v;
  const primal = [...velocidad];
  let original = [...velocidad];
  let planos = [];
  for (const c of choques) {
    if (!v[0] && !v[1] && !v[2]) break;                       // :1048-1049
    if (c.toi > 0) { original = [...v]; planos = []; }          // :1073-1078
    if (planos.length >= MAX_CLIP_PLANES) { v = [0, 0, 0]; break; } // :1112-1119
    planos.push(c.n);
    if (reflejar) {
      let nueva = v;
      for (const p of planos) {
        if (p[1] > 0.7) { nueva = recortarVelocidad(original, p, 1); original = nueva; }
        else nueva = recortarVelocidad(original, p, rebote);
      }
      v = nueva;
      original = nueva;
    } else {
      let i;
      for (i = 0; i < planos.length; i++) {
        v = recortarVelocidad(original, planos[i], 1);
        let j;
        for (j = 0; j < planos.length; j++) {
          if (j !== i && v[0] * planos[j][0] + v[1] * planos[j][1] + v[2] * planos[j][2] < 0) break;
        }
        if (j === planos.length) break;
      }
      if (i === planos.length) {
        if (planos.length !== 2) { v = [0, 0, 0]; break; }      // :1173-1180
        const [a, b] = planos;
        const dir = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
        const d = dir[0] * v[0] + dir[1] * v[1] + dir[2] * v[2];
        v = dir.map((x) => x * d);                               // :1181-1183
      }
      if (v[0] * primal[0] + v[1] * primal[1] + v[2] * primal[2] <= 0) { v = [0, 0, 0]; break; } // :1190-1195
    }
  }
  if (!seMovio) v = [0, 0, 0];                                   // :1199-1203
  return v;
}
