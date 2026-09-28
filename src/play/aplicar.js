// LO QUE HACE CADA AJUSTE. La tabla está en `ajustes.js`; aquí está el efecto.
//
// Separado a propósito, y por lo mismo que `sonido.js` está separado de
// `audio.js`: esto son REGLAS —cuántos grados gira el ratón, cuánto multiplica
// el volumen, qué tabla lleva el atlas de una gamma a otra— y se prueban con
// `node --test`, sin navegador y sin Three.
//
// Las tres fuentes, y ninguna es un gusto:
//
//   `../MSC/assets/msr/config.cfg`              los valores
//   `.../src/game/client/inputw32.cpp`          la fórmula del ratón
//   `.../xash3d-fwgs-sdk/engine/client/gamma.c` la de la gamma, vía `bsp/gamma.js`

/**
 * `m_yaw` y `m_pitch`: **grados de giro por cuenta de ratón**, antes de la
 * sensibilidad. Los dos valen lo mismo y los dos salen del archivo:
 *
 *     m_pitch "0.022000"                 config.cfg:126
 *     m_yaw   "0.022"                    config.cfg:129
 */
export const M_YAW = 0.022;
export const M_PITCH = 0.022;

/**
 * Hasta dónde se puede mirar arriba y abajo.
 *
 *     cl_pitchup   = pfnRegisterVariable("cl_pitchup",   "89", 0);
 *     cl_pitchdown = pfnRegisterVariable("cl_pitchdown", "89", 0);
 *                                             input.cpp:1122-1123
 *
 * Ochenta y nueve, no noventa: el motor deja un grado para que el jugador nunca
 * llegue a mirar recto arriba, que es donde la matriz de la cámara se degenera.
 * Aquí había ±(90° − 0,57°), que es la misma idea con un número inventado.
 */
export const PITCH_MAX = (89 * Math.PI) / 180;

const GRADOS = Math.PI / 180;

/**
 * EL RATÓN, con la fórmula del mod y no con una constante.
 *
 * Hasta el 37 esto era `MOUSE = 0.0022` radianes por cuenta, elegido a ojo, y
 * por eso el deslizador de sensibilidad no podía hacer nada: no había ningún
 * sitio donde meterlo. La fórmula de verdad es de `IN_MouseMove` y
 * `IN_ScaleMouse` (`inputw32.cpp:414-452, 527-552`), y son tres pasos en este
 * orden, que importa:
 *
 *   1. **el filtro**, sobre las cuentas CRUDAS:
 *
 *          mouse_x = (mx + old_mouse_x) * 0.5;
 *          old_mouse_x = mx;                       inputw32.cpp:527-535
 *
 *      Y lo que se guarda para la próxima es `mx`, no el filtrado: es una media
 *      de dos muestras, no un filtro con memoria larga. Filtrar el filtrado
 *      arrastraría el ratón durante medio segundo.
 *
 *   2. **la sensibilidad**, que multiplica las dos cuentas por igual:
 *
 *          *x *= mouse_senstivity;                 inputw32.cpp:452
 *
 *   3. **los grados**, que es donde entran `m_yaw` y `m_pitch`:
 *
 *          viewangles[YAW]   -= m_yaw->value   * mouse_x;
 *          viewangles[PITCH] += m_pitch->value * mouse_y;
 *                                                  inputw32.cpp:548, 552
 *
 * O sea que con la sensibilidad en 10 y `m_yaw` en 0,022 el giro es de
 * **0,22 grados por cuenta**. La constante que había daba 0,126: el port giraba
 * a poco más de la mitad de lo que gira el juego, y nadie podía notarlo porque
 * no había con qué comparar.
 *
 * ── Y el ratón invertido ──────────────────────────────────────────────────
 *
 * En el motor no hay casilla: es el SIGNO de `m_pitch`. La ventana de Valve
 * escribe el signo y el juego suma igual. Por eso aquí es un signo y no un `if`.
 */
export class Raton {
  constructor({ sensibilidad = 10, invertido = false, filtro = true } = {}) {
    this.poner({ sensibilidad, invertido, filtro });
    this.viejoX = 0;
    this.viejoY = 0;
  }

  poner({ sensibilidad, invertido, filtro } = {}) {
    if (sensibilidad !== undefined) this.sensibilidad = Number(sensibilidad) || 0;
    if (invertido !== undefined) this.invertido = !!invertido;
    if (filtro !== undefined) this.filtro = !!filtro;
    return this;
  }

  /** Al soltar el puntero: la muestra vieja ya no vale y arrastraría un salto. */
  olvidar() { this.viejoX = 0; this.viejoY = 0; return this; }

  /**
   * Un movimiento del ratón, en cuentas. Devuelve **radianes** de giro:
   * `{ yaw, pitch }`, ya con el signo con el que hay que sumarlos.
   */
  mover(mx, my) {
    let x = mx, y = my;
    if (this.filtro) {
      x = (mx + this.viejoX) * 0.5;
      y = (my + this.viejoY) * 0.5;
    }
    this.viejoX = mx;
    this.viejoY = my;
    x *= this.sensibilidad;
    y *= this.sensibilidad;
    const mPitch = this.invertido ? -M_PITCH : M_PITCH;
    return { yaw: -M_YAW * x * GRADOS, pitch: -mPitch * y * GRADOS };
  }
}

/**
 * EL VOLUMEN. `volume` es un multiplicador de 0 a 1 sobre todo lo que no es
 * música, y el archivo lo trae en **0,12** (`config.cfg:184`).
 *
 * Es un número bajo y hay que decirlo: hasta el 37 el port sonaba a 1, o sea
 * ocho veces más alto que la instalación de al lado. Poner el del archivo es lo
 * mismo que se hizo con `gl_overbright 0` —el juego manda, aunque a uno le
 * parezca poco— y ahora, además, hay un deslizador para subirlo.
 */
export function ganancia(volumen) {
  const v = Number(volumen);
  if (!Number.isFinite(v)) return 1;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
