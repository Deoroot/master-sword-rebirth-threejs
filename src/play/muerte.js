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

/**
 * Las banderas del desvanecido. `public/engine/shake.h:40-43`.
 *
 *     #define FFADE_IN        0x0000  // Just here so we don't pass 0 into the function
 *     #define FFADE_OUT       0x0001  // Fade out (not in)
 *     #define FFADE_MODULATE  0x0002  // Modulate (don't blend)
 *     #define FFADE_STAYOUT   0x0004  // ignores the duration, stays faded out
 */
export const FFADE = { IN: 0x0000, OUT: 0x0001, MODULATE: 0x0002, STAYOUT: 0x0004 };

/**
 * El desvanecido de la muerte, con los seis números del motor:
 *
 *     // UNDONE: Put this in, but add FFADE_PERMANENT and make fade time 8.8 instead of 4.12
 *     UTIL_ScreenFade(this, Vector(255, 0, 0), 0.2, 15, 128, FFADE_IN);
 *                                                      player.cpp:740-741
 *
 * Rojo puro, **medio segundo no: dos décimas**, quince segundos de aguante y
 * alfa 128 de 255 — o sea que la pantalla no se pone roja, se pone A MEDIAS
 * roja, y se puede seguir viendo lo que hay detrás. Que es justo lo que se
 * describió: «el color se pone algo rojo».
 *
 * Los quince segundos de aguante son tres veces la espera de reaparición
 * (`ESPERA_MUERTO = 5`), así que en la práctica el rojo **nunca llega a
 * apagarse solo**: lo quita el reaparecer. Está así en el motor y se copia así.
 */
export const DESVANECIDO = {
  color: [255, 0, 0],
  duracion: 0.2,
  aguante: 15,
  alfa: 128,
  banderas: FFADE.IN,
};

/**
 * El alfa del velo, de 0 a 255, `t` segundos después de morir.
 *
 * ── Una advertencia sobre esta función ─────────────────────────────────────
 *
 * **La cuenta del desvanecido no está en el SDK.** El mod manda un mensaje
 * —`gmsgFade` con duración, aguante, banderas y RGBA (`util.cpp:1137-1153`)— y
 * quien lo pinta es el motor, que no viene con la fuente. Así que esto no
 * lleva `archivo:línea` de la curva, porque no hay archivo que citar, y decir
 * lo contrario sería inventarse una cita.
 *
 * Lo que sí se puede leer es la forma del struct que el motor consume
 * (`common/screenfade.h:14-22`) y el único sitio del SDK que lo rellena a mano,
 * que es el efecto de guion:
 *
 *     ScreenFade.fadeSpeed = ScreenFade.fadealpha / (Duration ? Duration : ...);
 *     ScreenFade.fadeEnd   = gpGlobals->time + Duration;
 *     ScreenFade.fadeReset = ScreenFade.fadeEnd - blendduration;
 *                                                     hudscript.cpp:268-270
 *
 * De ahí sale todo: `fadeSpeed` es **alfa por segundo**, el desvanecido acaba
 * en `fadeEnd`, y el campo se llama `fadeSpeed` con el comentario «(+ fade in,
 * − fade out)». Con `FFADE_IN` —o sea, sin `FFADE_OUT`— el velo empieza opaco
 * en el instante del mensaje y **baja** hasta cero al llegar a `fadeEnd`; el
 * aguante es lo que tarda en olvidarse el desvanecido, no en empezar.
 *
 * Con los números de la muerte eso son dos décimas de rojo a medias que se van.
 * Un fogonazo, no un velo permanente. Se mide en la sonda y se dice ahí cuánto
 * dura de verdad, para que nadie tenga que fiarse de este párrafo.
 */
export function alfaDelDesvanecido(t, d = DESVANECIDO) {
  if (!(t >= 0)) return 0;
  if (t >= d.duracion) return 0;
  // `fadeSpeed · (fadeEnd − ahora)`, acotado a [0, fadealpha].
  const v = (d.alfa / d.duracion) * (d.duracion - t);
  return Math.max(0, Math.min(d.alfa, v));
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
