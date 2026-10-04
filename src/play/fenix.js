// LO QUE SE VE Y SE OYE CUANDO REVIENTA LA FLECHA DEL FÉNIX.
//
// El DAÑO de la explosión está portado desde el 97 (`explosionDelFenix`, en
// `src/play/proyectilguion.js`). Lo que faltaba es la otra mitad de la misma
// línea del guion, la que no hace daño:
//
//     //Thothie: Client fx, self-removing (see items/proj_arrow_phx_cl)
//     clientevent new all items/proj_arrow_phx_cl MY_ORG MY_RADIUS
//                                                  proj_arrow_phx.script:96-99
//
// `clientevent new all <guion> <parámetros>` (scriptcmds.cpp:146) arranca un
// guion de CLIENTE en todos los jugadores y le pasa los parámetros a su
// `client_activate`. Este puerto no tiene `clientevent` —son 875 usos en el
// mod y cada guion de cliente es un programa distinto—, así que aquí NO se
// porta el comando: se porta lo que hace ESTE guion, que son tres cosas y
// caben en una ficha (`items/proj_arrow_phx_cl.script`, entero):
//
//   1. UNA LLAMARADA, que no es un sprite aunque el comando lo diga:
//
//          cleffect tempent sprite weapons/projectiles.mdl L_FX_CENTER setup_flame_burst update_flame_burst
//                                                                        :36
//
//      es el submodelo 51 de `projectiles.mdl` (`body 51`, :70) puesto como
//      entidad temporal. Que se cree con `sprite` y no con `model` sólo cambia
//      una cosa: nace ya en modo aditivo y con `renderamt 255`
//      (`if (IsSprite) { rendermode = kRenderTransAdd; ... }`,
//      client/entity.cpp:985-992) — que es lo mismo que el guion le pone después
//      a mano (:73-74).
//
//   2. UNA LUZ: `cleffect light new FX_CENTER LIGHT_RAD (255,128,64) 2.0` (:46),
//      con `LIGHT_RAD = FX_RADIUS × 1,5` (:44-45) — «light radius fades quickly,
//      so we need to increase radius to more closely match AOE size».
//
//   3. UN SONIDO en el sitio: `sound.play3d SOUND_BURST 5 FX_CENTER` (:49), con
//      `const SOUND_BURST ambience/steamburst1.wav` (:6). Ese `.wav` NO está en
//      `assets/msr`: es de `valve/`, que el motor monta detrás (CLAUDE.md §2).
//
// Y EL TAMAÑO SALE DEL RADIO DEL DAÑO, que es lo que hace que el efecto diga la
// verdad sobre a quién alcanza:
//
//     local FX_RADIUS_RATIO FX_RADIUS
//     divide FX_RADIUS_RATIO 256
//     setvard SCALE_RATIO $ratio(FX_RADIUS_RATIO,1.0,10.0)        :24-26
//     local Z_ADJ $ratio(FX_RADIUS_RATIO,8.0,30.0)
//     vectoradd L_FX_CENTER z Z_ADJ //adjust up a bit based on scale   :31-32
//
// con `$ratio(r,a,b) = a + (b − a)·r` (script.cpp:2527-2545). El radio va de 32
// a 256 según lo lejos que haya caído la flecha (proj_arrow_phx.script:18-20,
// :76-86), o de 16 a 128 si al tirador le falta arquería (:88-94): la llamarada
// va de escala 1,56 a 10.
//
// Esto es la regla y no toca Three: la dibuja `src/render/estallido.js`.
//
// ── LO QUE NO SE PORTA, dicho aquí ─────────────────────────────────────────
//
//   - **El hueco de la casilla 0.** `fadeout` sólo se atiende `else if
//     (p->entity.curstate.weaponanim)` (client/entity.cpp:1123-1136), y
//     `weaponanim` es la casilla de `g_TempEntExtra` que le tocó, que puede ser
//     la 0 (:1000-1010). O sea que la PRIMERA entidad temporal de guion de cada
//     mapa no se desvanece —se queda entera sus dos segundos y desaparece de
//     golpe— y además esa casilla no se libera nunca (:2044-2048), así que es
//     sólo la primera. Aquí todas se desvanecen: este puerto no tiene un
//     reparto de casillas común a todos los efectos, y fingirlo en uno solo
//     sería inventarlo.
//   - **`frames 11` con `framerate 1.0`** (:71, :79): la animación de cuadro de
//     una entidad temporal (`FTENT_SPRANIMATE`, client/entity.cpp:1071-1077).
//     Sobre un `.mdl` no se ha podido medir contra el original qué mueve; aquí
//     la llamarada corre su secuencia 8 a la velocidad del archivo.
//   - **`r_dynamic 0`** apaga la luz (client/entity.cpp:1254-1255). No hay ese
//     ajuste en este puerto.
//   - **Los demás jugadores.** `new all` se lo manda a todos; con servidor, aquí
//     sólo lo ve quien tira (como el resto de lo que hace este arco, que el
//     servidor no conoce).

/** `$ratio(r,a,b)` — `Min + (Max − Min) · Ratio`, sin recortar (script.cpp:2527-2545). */
const ratio = (r, a, b) => a + (b - a) * r;

export const ESTALLIDO_DEL_FENIX = Object.freeze({
  /** A qué proyectil pertenece. */
  proyectil: "proj_arrow_phx",
  guion: "items/proj_arrow_phx_cl",
  /** `cleffect tempent sprite weapons/projectiles.mdl ...` (:36). */
  modelo: "weapons/projectiles.mdl",
  /** `set_current_prop body 51` (:70). */
  submodelo: 51,
  /** `set_current_prop sequence 8` (:72). */
  secuencia: 8,
  /** `set_current_prop framerate 1.0` (:71). */
  ritmo: 1.0,
  /** `set_current_prop death_delay 2.0` (:69) → `p->die = ahora + 2.0` (client/entity.cpp:1053-1067). */
  vida: 2.0,
  /**
   * `set_current_prop fadeout lifetime` (:80): lo que le queda de vida, o sea
   * los mismos 2 s, y `renderamt = 255 · (1 − transcurrido/duración)`
   * (client/entity.cpp:1131-1136, :2082-2088).
   */
  desvanece: 2.0,
  /** `rendermode add` y `renderamt 255` (:73-74). */
  aditivo: true,
  opacidad: 255,
  /** `set_current_prop angles $vec(0,90,0)` (:81): guiño de 90 grados. */
  guino: 90,
  /** `divide FX_RADIUS_RATIO 256` (:25). */
  radioDeReferencia: 256,
  /** `$ratio(FX_RADIUS_RATIO,1.0,10.0)` (:26). */
  escala: Object.freeze([1.0, 10.0]),
  /** `$ratio(FX_RADIUS_RATIO,8.0,30.0)` (:31): cuánto se sube sobre el suelo, en unidades. */
  alza: Object.freeze([8.0, 30.0]),
  /** `multiply LIGHT_RAD 1.5` y `(255,128,64) 2.0` (:44-46). */
  luz: Object.freeze({ porRadio: 1.5, color: Object.freeze([255, 128, 64]), vida: 2.0 }),
  /**
   * `sound.play3d SOUND_BURST 5 FX_CENTER` (:49, :6). El volumen va de 0 a 10
   * (`float Volume = atof(Params[1]) / 10`, scriptcmds.cpp:6705) y la
   * atenuación, sin cuarto parámetro, es `ATTN_NORM` (:6702).
   */
  sonido: Object.freeze({ archivo: "ambience/steamburst1.wav", volumen: 5 / 10 }),
  /** `callevent 2.1 remove_fx` (:40): el guion de cliente se borra a los 2,1 s. */
  seBorra: 2.1,
});

/**
 * EL EFECTO DE UNA EXPLOSIÓN, con el centro en el SUELO y el radio del daño.
 *
 * `centro` es el `MY_ORG` del guion —ya con la altura del suelo
 * (`vectorset MY_ORG z $get_ground_height(MY_ORG)`, proj_arrow_phx.script:64)—,
 * en unidades y con el eje de arriba en el segundo sitio, como todo `arco.js`.
 *
 * Devuelve dónde va la llamarada (subida `Z_ADJ`), a qué escala, y la luz y el
 * sonido, que se quedan en el centro SIN subir (`FX_CENTER` y no `L_FX_CENTER`,
 * :46 y :49).
 */
export function estallidoDelFenix({ centro = [0, 0, 0], radio = 0 } = {}) {
  const E = ESTALLIDO_DEL_FENIX;
  const r = (Number(radio) || 0) / E.radioDeReferencia;
  const alza = ratio(r, E.alza[0], E.alza[1]);
  return {
    proporcion: r,
    escala: ratio(r, E.escala[0], E.escala[1]),
    alza,
    llamarada: [centro[0], centro[1] + alza, centro[2]],
    vida: E.vida,
    luz: { donde: [...centro], radio: (Number(radio) || 0) * E.luz.porRadio, color: [...E.luz.color], vida: E.luz.vida },
    sonido: { donde: [...centro], archivo: E.sonido.archivo, volumen: E.sonido.volumen },
  };
}

/**
 * LA OPACIDAD a `t` segundos de nacer: `255 · (1 − t/duración)`
 * (client/entity.cpp:2084-2088), y nada pasada la vida.
 */
export function opacidadDelEstallido(t) {
  const E = ESTALLIDO_DEL_FENIX;
  if (!(t >= 0) || t >= E.vida) return 0;
  return Math.max(0, E.opacidad * (1 - t / E.desvanece)) / 255;
}

/**
 * LOS EFECTOS DE IMPACTO que este puerto dibuja, por proyectil. Hoy uno. Los
 * demás proyectiles que se pueden tirar aquí y tienen un guion de cliente sin
 * portar están contados en `test/fenix101.test.mjs`, no escritos a mano.
 */
export const ESTALLIDOS = Object.freeze({ [ESTALLIDO_DEL_FENIX.proyectil]: ESTALLIDO_DEL_FENIX });
