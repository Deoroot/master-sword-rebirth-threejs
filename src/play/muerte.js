// LO QUE PASA AL MORIR: el rojo, la cámara y el anuncio.
//
// El ciclo —morir, pagar el impuesto, esperar, volver— ya estaba en
// `src/juego/sesion.js` desde el 21. Lo que no estaba es **lo que se ve**, que
// es todo lo que el jugador tiene para enterarse de que ha muerto, y que en el
// motor son cuatro cosas seguidas dentro de `CBasePlayer::Killed`
// (`server/player/player.cpp:576-806`), en este orden:
//
//   1. `UTIL_ClientPrintAll(HUD_PRINTCENTER, "%s has fallen!")`   línea 578
//   2. `UTIL_ScreenFade(this, Vector(255,0,0), 0.2, 15, 128, FFADE_IN)`  741
//   3. `DeathSound()`                                                   755
//   4. la cámara: 70 unidades a la derecha, 25 arriba, trazada           756-764
//      y `CinematicCamera(TRUE, vOrigin, vAngles)`                       799
//
// Y una quinta que no es del motor sino del guion: `playsound 0 10 SOUND_DEATH`
// en el `game_death` de `player/player_main.script:291`.
//
// ── Lo que se recordaba mal, y hay que decirlo ─────────────────────────────
//
// «sale you died como mensaje si recuerdo». No. **No existe ningún «You
// died»** en Master Sword: se buscó en todo el SDK y en los 1 300 guiones. Lo
// que sale es un centrado que dice «<tu nombre> has fallen!» y que **lo ven
// todos los jugadores del servidor**, no sólo tú — es `UTIL_ClientPrintAll`,
// con «All» en el nombre. El texto está en `anuncioDeMuerte`, en `sesion.js`,
// desde el 21; lo que faltaba era enseñarlo, y enseñarlo donde va.

import { FFADE, fijo16, fundidoAlLlegar, alfaDelFundido } from "./efectospantalla.js";

/**
 * Las banderas del desvanecido. `public/engine/shake.h:40-43`. Son las de
 * `efectospantalla.js` (el 93), que además trae `LONGFADE`: una sola tabla.
 */
export { FFADE };

/**
 * El desvanecido de la muerte, con los seis números del motor:
 *
 *     // UNDONE: Put this in, but add FFADE_PERMANENT and make fade time 8.8 instead of 4.12
 *     UTIL_ScreenFade(this, Vector(255, 0, 0), 0.2, 15, 128, FFADE_IN);
 *                                                      player.cpp:740-741
 *
 * Rojo puro, dos décimas de desvanecido, **quince segundos de aguante** y alfa
 * 128 de 255 — o sea que la pantalla no se pone roja, se pone A MEDIAS roja, y
 * se puede seguir viendo lo que hay detrás. Que es justo lo que se describió:
 * «el color se pone algo rojo».
 *
 * El «8.8 instead of 4.12» del comentario es el formato del cable: el tiempo
 * viaja en 4.12 fijo (`FixedUnsigned16(…, 1 << 12)`, hl/util.cpp:1137-1138),
 * que topa en 15,9998 s. Quince caben (61 440 de 65 535); por eso el UNDONE.
 *
 * Los quince segundos de aguante son tres veces la espera de reaparición
 * (`ESPERA_MUERTO = 5`), así que en la práctica el rojo **nunca llega a
 * apagarse solo**: lo quita el reaparecer (`AL_REAPARECER`, abajo).
 */
export const DESVANECIDO = {
  color: [255, 0, 0],
  duracion: 0.2,
  aguante: 15,
  alfa: 128,
  banderas: FFADE.IN,
};

/** `WRITE_BYTE` de un `int`: se queda el byte bajo. */
const byte = (n) => (Math.trunc(n) & 0xff);

/**
 * `UTIL_ScreenFadeBuild` — hl/util.cpp:1135-1144: los seis números de una
 * llamada a `UTIL_ScreenFade` convertidos en lo que viaja por `gmsgFade`, con
 * el tiempo en 4.12 fijo y el color y el alfa en un byte. Sale con la forma de
 * `MENSAJE.PANTALLA` (`{ que: "fundido", duracion, aguante, banderas, r, g, b, a }`),
 * así que el velo de la muerte y el `effect screenfade` del 93 entran por la
 * misma puerta — y en el motor lo hacen: hay UN `clgame.fade`.
 */
export function mensajeDeFundido({ color, duracion, aguante, alfa, banderas = FFADE.IN }) {
  return {
    que: "fundido",
    duracion: fijo16(duracion),
    aguante: fijo16(aguante),
    banderas: banderas | 0,
    r: byte(color[0]), g: byte(color[1]), b: byte(color[2]),
    a: byte(alfa),
  };
}

/**
 * Lo que manda `Spawn` al volver a la vida:
 *
 *     UTIL_ScreenFade(this, Vector(0, 0, 0), 1, 0, 0, FFADE_IN);
 *                                                      player.cpp:2784
 *
 * Alfa CERO. No apaga nada a mano: **pisa** el `clgame.fade`, y un fundido de
 * alfa 0 se pinta con alfa 0 (`bound(0, alpha, fadealpha)`, cl_game.c:502).
 * Así es como se va el rojo de la muerte, y de paso cualquier fundido de guion.
 */
export const AL_REAPARECER = { color: [0, 0, 0], duracion: 1, aguante: 0, alfa: 0, banderas: FFADE.IN };

/**
 * El alfa del velo, de 0 a 255, `t` segundos después de morir.
 *
 * ── Corrección del 94: la curva SÍ está en el motor, y era al revés ────────
 *
 * Hasta el 94 esto decía que «la cuenta del desvanecido no está en el SDK» y
 * deducía la curva del efecto de guion (hudscript.cpp:268-270): un fogonazo de
 * dos décimas. Las dos cosas eran falsas. La cuenta está en el motor de Xash3D,
 * que viene en `../MSC/xash3d-fwgs-sdk`, y el 93 ya la había portado para los
 * efectos de guion sin que nadie volviera aquí:
 *
 *     sf->fadeEnd   = duration * flScale;           // 0,2
 *     sf->fadeReset = holdTime * flScale;           // 15
 *     ...
 *     sf->fadeSpeed  = (float)sf->fadealpha / sf->fadeEnd;
 *     sf->fadeReset += cl.time;                     // ahora + 15
 *     sf->fadeEnd   += sf->fadeReset;               // ahora + 15,2
 *                                     CL_ParseScreenFade, cl_parse.c:2068-2111
 *
 *     alpha = sf->fadeSpeed * ( sf->fadeEnd - cl.time );
 *     alpha = bound( 0, alpha, sf->fadealpha );
 *                                     V_FadeAlpha, cl_game.c:472-505
 *
 * Con `FFADE_IN` el aguante va **delante** del desvanecido: `640 · (15,2 − t)`
 * vale más de 128 hasta los 15 s, así que el velo se queda **clavado en 128
 * quince segundos** y sólo entonces se va, en dos décimas. El 41 tenía las dos
 * mitades en el orden contrario. Y no se nota en la prueba de los tres números,
 * que estaban bien: se nota al morir, que es cuando importa.
 *
 * Ahora no hay cuenta propia: se construye el mensaje y se le pasa por las dos
 * funciones del 93, que son las del motor.
 */
export function alfaDelDesvanecido(t, d = DESVANECIDO) {
  if (!(t >= 0)) return 0;
  return alfaDelFundido(fundidoAlLlegar(mensajeDeFundido(d), 0), t);
}

/**
 * EL 94. El tinte rojo de cada golpe que te entra. `CBasePlayer::TakeDamageEffect`:
 *
 *     if (flDamage > 0 && IsAlive())
 *     {
 *       float Amt = flDamage / MaxHP() * 255;
 *       int alpha = V_max(Amt, 0);
 *       if (flDamage > 0.5) //If too small, don't even waste the bandwidth
 *         UTIL_ScreenFade(this, Vector(255, 0, 0), 1, 0.5, alpha, FFADE_IN);
 *       float flPunch = alpha * 0.25;
 *       pev->punchangle.x += RANDOM_FLOAT(-flPunch, flPunch) * 0.5;
 *       pev->punchangle.y += RANDOM_FLOAT(-flPunch, flPunch) * 0.1;
 *       pev->punchangle.z += RANDOM_FLOAT(-flPunch, flPunch) * 0.2;
 *     }
 *                                                       player.cpp:537-550
 *
 * El rojo es proporcional a la parte de tu vida que se lleva el golpe: uno que
 * te quita la mitad pone 127 —el rojo de morir—, y uno de 5 sobre 50, 25.
 * Medio segundo entero y luego se va en uno (`V_FadeAlpha` otra vez).
 *
 * Lo llama `CMSMonster::TakeDamage` en su **primera** línea útil
 * (msmonsterserver.cpp:2369), antes de `GiveHP(-flDamage)` (:2394): el golpe
 * que mata también tiñe — con el jugador todavía vivo — y el velo de `Killed`
 * lo pisa en el mismo instante. Y `alpha` es el daño PEDIDO, no el que cabía
 * en la vida que te quedaba.
 *
 * El `WRITE_BYTE` se porta: un golpe de más de tu vida entera da un alfa por
 * encima de 255, que da la vuelta. No se ve nunca, porque ese golpe te mata.
 *
 * Devuelve `{ fundido, mensaje, golpe }` —los seis números del fundido y su
 * mensaje empaquetado (`null` los dos si no llega a 0,5), y el empujón de la
 * vista en grados del motor— o `null` si no hay nada que hacer.
 * `azar()` es `RANDOM_FLOAT(-1, 1)`.
 */
export function efectoDelGolpe(dano, vidaMax, { vivo = true, azar = () => Math.random() * 2 - 1 } = {}) {
  if (!(dano > 0) || !vivo || !(vidaMax > 0)) return null;
  const alfa = Math.trunc(Math.max(dano / vidaMax * 255, 0));
  const fundido = dano > 0.5
    ? { color: [255, 0, 0], duracion: 1, aguante: 0.5, alfa, banderas: FFADE.IN }
    : null;
  const p = alfa * 0.25;
  const golpe = [azar() * p * 0.5, azar() * p * 0.1, azar() * p * 0.2];
  return { fundido, mensaje: fundido ? mensajeDeFundido(fundido) : null, golpe, alfa };
}

/**
 * Cómo se va el empujón: `PM_DropPunchAngle`, pm_shared.cpp:3023-3031, que
 * corre en cada `PM_PlayerMove` (:3083):
 *
 *     len = VectorNormalize(punchangle);
 *     len -= (10.0 + len * 0.5) * pmove->frametime;
 *     len = V_max(len, 0.0);
 *     VectorScale(punchangle, len, punchangle);
 *
 * Diez grados por segundo más la mitad de lo que quede: un empujón de 3° se va
 * en unas tres décimas. Devuelve un vector nuevo.
 */
export function soltarGolpe(golpe, dt) {
  const len = Math.hypot(golpe[0], golpe[1], golpe[2]);
  if (!(len > 0)) return [0, 0, 0];
  const queda = Math.max(len - (10 + len * 0.5) * dt, 0);
  const k = queda / len;
  return [golpe[0] * k, golpe[1] * k, golpe[2] * k];
}

/**
 * Dónde se pone la cámara al morir, y hacia dónde mira.
 *
 *     Vector vOrigin = pev->origin + gpGlobals->v_right * 70 + Vector(0, 0, 25);
 *     TraceResult tr;
 *     UTIL_TraceLine(pev->origin, vOrigin, dont_ignore_monsters, edict(), &tr);
 *     if (tr.flFraction < 1.0) vOrigin = tr.vecEndPos;
 *     Vector vAngles = UTIL_VecToAngles(vOrigin - pev->origin);
 *     vAngles.y += 180;
 *                                                        player.cpp:756-764
 *
 * Setenta unidades **a tu derecha** y veinticinco arriba, con una traza para no
 * meter la cámara dentro de una pared, y mirando de vuelta hacia el cuerpo.
 * Setenta unidades son metro y ochenta: la cámara se queda al lado, cerca, no
 * en órbita. Y `dont_ignore_monsters` está puesto a propósito — si tienes al
 * goblin que te mató pegado al costado derecho, la cámara se apoya en ÉL.
 *
 * ── El `+= 180` sólo toca el giro, y aun así el cabeceo sale bien ──────────
 *
 * Esto parece un fallo y no lo es, y merece el párrafo porque al portarlo la
 * tentación es «arreglarlo».
 *
 * `UTIL_VecToAngles` es `VectorAngles`, que devuelve el cabeceo con el signo
 * **al revés** del que usa una mirada: para un vector que sube da cabeceo
 * positivo, y un ángulo de vista positivo significa mirar hacia ABAJO (por eso
 * `MakeVectors` usa `-pitch`). Aquí se le pasa el vector cuerpo→cámara, que
 * sube 25 unidades, así que sale cabeceo +19,6°, o sea «mira 19,6° hacia
 * abajo». Y eso es exactamente lo que hace falta para que una cámara puesta 25
 * unidades por encima mire al cuerpo. El giro sí hay que darle la vuelta a mano
 * —de ahí el `+= 180`— pero el cabeceo se da la vuelta solo, gratis, por la
 * inversión de signo del motor. Las dos erratas se cancelan.
 *
 * ── Convenio ───────────────────────────────────────────────────────────────
 *
 * Entra y sale en **metros y en los ejes del port** (Y arriba, con giro 0
 * mirando a −Z, `movimiento.js:520-521`), porque es lo que maneja el resto del
 * juego; las 70 y las 25 unidades se dividen por `U` aquí y en un solo sitio.
 * El cabeceo que se devuelve es el de la cámara de Three —positivo es mirar
 * ARRIBA—, no el del motor, y por eso lleva el signo cambiado.
 *
 * `trazar(desde, hasta)` es opcional y es la traza del motor: devuelve
 * `{ fraccion }` y, si choca, `{ punto }`. Sin ella la cámara va al sitio de
 * libro, que es lo que pasa en campo abierto.
 */
export const CAMARA = { lado: 70, alto: 25 };

export function camaraDeMuerte({
  origen = [0, 0, 0], yaw = 0, U = 39.37, trazar = null, camara = CAMARA,
} = {}) {
  // `gpGlobals->v_right`, en los ejes de aquí: `movimiento.js:521`.
  const derecha = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const lado = camara.lado / U, alto = camara.alto / U;
  let pos = [
    origen[0] + derecha[0] * lado,
    origen[1] + alto,
    origen[2] + derecha[2] * lado,
  ];
  let chocada = false;
  if (trazar) {
    const tr = trazar(origen, pos);
    // `if (tr.flFraction < 1.0) vOrigin = tr.vecEndPos;`
    if (tr && tr.fraccion < 1 && tr.punto) { pos = [...tr.punto]; chocada = true; }
  }
  const d = [pos[0] - origen[0], pos[1] - origen[1], pos[2] - origen[2]];
  const plano = Math.hypot(d[0], d[2]);
  // El giro hacia la cámara, y luego los 180 que lo devuelven al cuerpo. En los
  // ejes de aquí un giro `y` mira a (−sen, −cos), así que el giro de un vector
  // es `atan2(−x, −z)`; sumarle π es `atan2(x, z)`.
  const giro = Math.atan2(d[0], d[2]);
  // Y el cabeceo, que ya viene bien puesto del motor: mirar hacia abajo cuando
  // la cámara está arriba. En Three eso es NEGATIVO.
  const cabeceo = plano > 0 ? -Math.atan2(d[1], plano) : (d[1] > 0 ? -Math.PI / 2 : Math.PI / 2);
  return { pos, yaw: giro, pitch: cabeceo, chocada };
}

/**
 * El sonido de morir, que **no sale de `DeathSound()`**.
 *
 *     void CBasePlayer::DeathSound(void)
 *     {
 *       //Master Sword: Don't play this if you got splattered
 *       //if( !FBitSet(pev->effects,EF_NODRAW) )
 *       //  PlaySound( CHAN_VOICE, "player/death.wav", 1, true );
 *       STOP_SOUND(edict(), CHAN_ITEM,   "common/null.wav");
 *       STOP_SOUND(edict(), CHAN_BODY,   "common/null.wav");
 *       STOP_SOUND(edict(), CHAN_WEAPON, "common/null.wav");
 *     }
 *                                                        player.cpp:360-369
 *
 * La función que se llama «sonido de muerte» tiene el sonido de muerte
 * comentado y lo único que hace es **callar tres canales**. El grito viene del
 * guion del jugador, por el otro lado:
 *
 *     playsound 0 10 SOUND_DEATH        player/player_main.script:291
 *     const SOUND_DEATH $get(ent_me,scriptvar,'PLR_SOUND_DEATH')
 *                                       player/player_sound.script:5
 *     const SOUNDSET_HM_DEATH player/death.wav        externals.script:47
 *     const SOUNDSET_HF_DEATH player/FemaleDeath.wav  externals.script:65
 *
 * O sea que **depende del género**, y que si algún día se cambia el `else` del
 * modo oso (`player_main.script:288-292`) el jugador muere en silencio: en modo
 * oso no suena esto, suena lo del oso. Portado tal cual, con el modo oso
 * apagado porque en Gate City no hay forma de entrar en él.
 */
// Las claves son las que guarda el personaje (`crearPersonaje`, `genero =
// "male"`), no las del guion, para no tener que traducir en el camino.
export const SONIDOS = {
  male: "player/death.wav",
  female: "player/femaledeath.wav",
};

export function sonidoDeMuerte(genero = "male") {
  return SONIDOS[genero] ?? SONIDOS.male;
}

/** Los tres canales que `DeathSound()` calla, y no es una lista decorativa. */
export const CANALES_QUE_CALLA = ["item", "body", "weapon"];
