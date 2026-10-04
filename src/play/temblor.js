// EL TEMBLOR DE LA PANTALLA — experimento 95, `effect screenshake`.
//
//     effect screenshake $relpos(0,0,0) 32 10 1 32        effects/demon_blood.script:45
//     effect screenshake $get(ent_me,origin) 50 10 L_DUR 512
//                                                  player/externals.script:3388
//
// 62 líneas en 50 guiones lo piden —el trol al pisar, la bola de fuego al
// estallar, el terremoto, la sangre de demonio a cada latido— y hasta el 95
// caía en el `case "effect"` del intérprete, que se lo pasaba al gancho de la
// pantalla, que lo rechazaba, y se apuntaba. Aquí está la REGLA, sin DOM ni
// Three, en los tres sitios por los que pasa en el motor:
//
//   1. el SERVIDOR lee la línea (`ScriptedEffect`, mseffects.cpp:847-876) y
//      decide a quién le tiembla (`UTIL_ScreenShake`, hl/util.cpp:1061-1108):
//      a cada jugador DE PIE en el suelo y dentro del radio, con un mensaje
//      `gmsgShake` de tres `short` en coma fija;
//   2. el CLIENTE lo recibe (`CL_ParseScreenShake`, xash3d-fwgs
//      engine/client/cl_parse.c:2045-2059) en UN `clgame.shake`;
//   3. y cada fotograma lo calcula (`pfnCalcShake`, cl_game.c:2243-2290) y lo
//      suma a la vista (`pfnApplyShake`, :2299-2306), que es lo que llama el
//      mod en `V_CalcNormalRefdef` (view.cpp:578-579).
//
// Lo que se ve y no se adivina leyendo los guiones:
//
//   - **la amplitud tiene un techo de 16 unidades.** Viaja en 4.12 sin signo
//     (`FixedUnsigned16(…, 1 << 12)`, util.cpp:1097 y :1033-1044), y 0xFFFF/4096
//     son 15,9998. Los guiones piden 32, 50, 190, 380, 512: todos tiemblan
//     igual de fuerte. La frecuencia va en 8.8 (techo 255,996) y la duración
//     en 4.12 (techo 16 s): el `effect screenshake … 20.0 1024` de Undamael
//     dura 16 segundos;
//   - **en el aire no tiembla** (`!(pPlayer->pev->flags & FL_ONGROUND)`,
//     util.cpp:1079), y el radio es una esfera en 3D (`delta.Length()`) que
//     se compara con `<` estricto; con radio 0 o negativo, a todos;
//   - **el desplazamiento se sortea UNA vez** en la práctica: el siguiente
//     sorteo es a `frequency / duration` segundos (cl_game.c:2263), que con los
//     números de los guiones —10 / 1— cae después de que el temblor acabe. Lo
//     que se mueve es la envolvente: `fracción² · sin(t · freq)`, con la
//     fracción yendo de −1 a 0 a lo largo de la duración;
//   - **un temblor más flojo no pisa a uno más fuerte** («don't overwrite larger
//     existing shake», cl_parse.c:2051-2053), y `pfnCalcShake` al acabar NO
//     pone la amplitud a cero (:2251-2256): la que quedó decaída sigue ahí, y
//     el siguiente temblor más flojo hereda ESA amplitud.
//
// Las unidades: todo aquí va en UNIDADES y ejes del motor (Z arriba), y en
// grados. `enEscena` lo pasa a metros y a los ejes de Three al final, una vez —
// la frontera del 81.

import { vectorDelMotor } from "./efectospantalla.js";

/** `atof`: lo que C lee de una cadena, o 0. */
const atof = (s) => {
  const m = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(String(s ?? "").trim());
  return m ? parseFloat(m[0]) : 0;
};

/** `StringToVec` — sharedutil.cpp:115-124. Una sola copia: la de `efectospantalla.js`. */
const vector = (texto) => vectorDelMotor(texto);

/** `FixedUnsigned16` — hl/util.cpp:1033-1044: trunca, suelo 0, techo 0xFFFF. */
export function fijoSinSigno16(valor, escala) {
  let o = Math.trunc(Number(valor) * escala);
  if (!(o > 0)) o = 0;
  if (o > 0xffff) o = 0xffff;
  return o;
}

// ── 1. EL SERVIDOR ──────────────────────────────────────────────────────────

/**
 * `effect screenshake <posición> <amplitud> <frecuencia> <duración> <radio>`
 * (mseffects.cpp:847-858, `REQPARAMS(6)`) y
 * `effect screenshake_one <objetivo> <amplitud> <frecuencia> <duración>`
 * (:859-876, `REQPARAMS(5)`, Thothie APR2016_08).
 *
 * `params[0]` es el tipo, como lo deja el `case "effect"` del intérprete.
 * Con menos parámetros de los que pide, el motor avisa y no hace nada: `null`.
 */
export function leerTemblor(params) {
  const tipo = String(params?.[0] ?? "");
  const p = (i) => String(params?.[i] ?? "");
  if (tipo === "screenshake") {
    if (!params || params.length < 6) return null;
    return {
      tipo, centro: vector(p(1)),
      amplitud: Math.fround(atof(p(2))), frecuencia: Math.fround(atof(p(3))),
      duracion: Math.fround(atof(p(4))), radio: Math.fround(atof(p(5))),
    };
  }
  if (tipo === "screenshake_one") {
    if (!params || params.length < 5) return null;
    return {
      tipo, aQuien: p(1),
      amplitud: Math.fround(atof(p(2))), frecuencia: Math.fround(atof(p(3))),
      duracion: Math.fround(atof(p(4))),
    };
  }
  return null;
}

/**
 * Lo que lleva el cable: `WRITE_SHORT` de amplitud, duración y frecuencia, en
 * ese orden (util.cpp:1101-1103), ya en coma fija.
 */
export function mensajeDeTemblor(amplitud, duracion, frecuencia) {
  return {
    amplitud: fijoSinSigno16(amplitud, 1 << 12),
    duracion: fijoSinSigno16(duracion, 1 << 12),
    frecuencia: fijoSinSigno16(frecuencia, 1 << 8),
  };
}

/**
 * `UTIL_ScreenShake` para UN jugador (util.cpp:1075-1107): el mensaje que le
 * llega, o `null` si no le llega nada.
 *
 * `jugador = { origen: [x,y,z] en unidades, enSuelo: bool }`. `screenshake_one`
 * (`UTIL_ScreenShakeOne`, :1111-1128) no mira ni el suelo ni el radio.
 */
export function temblorParaJugador(t, jugador) {
  if (!t || !jugador) return null;
  if (t.tipo === "screenshake_one") return mensajeDeTemblor(t.amplitud, t.duracion, t.frecuencia);
  if (!jugador.enSuelo) return null;                                  // :1079
  let local = 0;
  if (t.radio <= 0) local = t.amplitud;                               // :1084-1085
  else {
    const o = jugador.origen ?? [0, 0, 0];
    const d = Math.hypot(t.centro[0] - o[0], t.centro[1] - o[1], t.centro[2] - o[2]);
    // «Had to get rid of this falloff - it didn't work well»: dentro del radio,
    // la amplitud ENTERA (:1091-1093).
    if (d < t.radio) local = t.amplitud;
  }
  if (!local) return null;                                            // :1095
  return mensajeDeTemblor(local, t.duracion, t.frecuencia);
}

// ── 2 y 3. EL CLIENTE ───────────────────────────────────────────────────────

/** `screen_shake_t` (xash3d-fwgs engine/client/client.h:422-433), a cero. */
export function nuevoTemblor() {
  return {
    time: 0, duration: 0, amplitude: 0, frequency: 0, next_shake: 0,
    offset: [0, 0, 0], angle: 0, applied_offset: [0, 0, 0], applied_angle: 0,
  };
}

/** `CL_ParseScreenShake` — cl_parse.c:2045-2059. `ahora` es `cl.time`. */
export function temblorAlLlegar(s, m, ahora) {
  const amplitud = (m.amplitud & 0xffff) * (1 / (1 << 12));
  const duracion = (m.duracion & 0xffff) * (1 / (1 << 12));
  const frecuencia = (m.frecuencia & 0xffff) * (1 / (1 << 8));
  // «don't overwrite larger existing shake»
  if (amplitud > s.amplitude) s.amplitude = amplitud;
  s.duration = duracion;
  s.time = ahora + s.duration;
  s.frequency = frecuencia;
  s.next_shake = 0;                                  // «apply immediately»
  return s;
}

/** `COM_RandomFloat` (common.c:120-128): en [bajo, alto). */
const azarPorOmision = (bajo, alto) => bajo + Math.random() * (alto - bajo);

/**
 * `pfnCalcShake` — cl_game.c:2243-2290. Corre una vez por fotograma
 * (`V_CalcNormalRefdef`, view.cpp:578) con `dt` = `cl.time − cl.oldtime`.
 * Escribe `applied_offset` y `applied_angle`; no devuelve nada.
 *
 * `azar(bajo, alto)` es `COM_RandomFloat`: DOS números. No es `Math.random`,
 * que no mira sus argumentos — la trampa del 59.
 */
export function pasoDelTemblor(s, ahora, dt, azar = azarPorOmision) {
  if (ahora > s.time || s.amplitude <= 0 || s.frequency <= 0 || s.duration <= 0) {
    // «reset shake»: la amplitud NO se toca (ver la cabecera).
    if (s.time !== 0) {
      s.time = 0;
      s.applied_angle = 0;
      s.applied_offset = [0, 0, 0];
    }
    return s;
  }
  if (ahora > s.next_shake) {
    // «get next shake time based on frequency over duration»
    s.next_shake = ahora + s.frequency / s.duration;
    for (let i = 0; i < 3; i++) s.offset[i] = azar(-s.amplitude, s.amplitude);
    s.angle = azar(-s.amplitude * 0.25, s.amplitude * 0.25);
  }
  // `time` es el FINAL, así que la fracción va de −1 a 0.
  let fraccion = (ahora - s.time) / s.duration;
  const freq = fraccion !== 0 ? (s.frequency / fraccion) * s.frequency : 0;
  fraccion *= fraccion * Math.sin(ahora * freq);
  for (let i = 0; i < 3; i++) s.applied_offset[i] = s.offset[i] * fraccion;
  s.applied_angle = s.angle * fraccion;
  // «decrease amplitude, but slower on longer shakes or higher frequency»
  s.amplitude -= s.amplitude * (dt / (s.frequency * s.duration));
  return s;
}

/**
 * `pfnApplyShake(origin, angles, factor)` — cl_game.c:2299-2306: el
 * desplazamiento por `factor` al origen de la vista y el ángulo al ALABEO.
 * La vista lleva `factor` 1 (view.cpp:579) y el arma 0,9 (:703).
 *
 * Devuelve `{ desplazamiento: [x, y, z] en METROS y ejes de Three, alabeo: grados }`.
 */
export function temblorEnEscena(s, unidadesPorMetro, factor = 1) {
  const k = factor / (unidadesPorMetro || 1);
  const o = s?.applied_offset ?? [0, 0, 0];
  // El cambio de ejes de `aEscena` (bsp/lector.js): x, z, −y.
  return {
    desplazamiento: [o[0] * k + 0, o[2] * k + 0, -o[1] * k + 0],
    alabeo: (s?.applied_angle ?? 0) * factor,
  };
}
