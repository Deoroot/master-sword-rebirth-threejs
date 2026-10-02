// LA REVERBERACIÓN: `env_sound`, y a quién le toca poner el `room_type`.
//
// 333 en 29 mapas, 11 en Edana, **0 en Gate City** — o sea que esto es el caso
// del experimento 50 y hay que decirlo antes de empezar: con un solo mapa
// portado el valor correcto y el valor de reposo eran la misma cosa, el cero.
//
// ── Qué hace un `env_sound` y qué NO hace ──────────────────────────────────
//
// **No suena.** No tiene `.wav` ni volumen: lo único que hace es ponerle al
// jugador su `room_type`, que es el número de preset del DSP del motor. O sea
// que un `env_sound` no es una fuente de sonido: es una etiqueta de «esta sala
// suena a cueva» pegada a un punto con un radio.
//
// Y de ahí sale el reparto, que es lo que vive en este archivo: once de éstos
// en Edana se pisan unos a otros, y la pregunta «¿a qué suena la taberna?» la
// contesta una regla de tres líneas del motor que no es la obvia.
//
// ── LAS TRES CONDICIONES PARA ALCANZAR AL JUGADOR ──────────────────────────
//
//     BOOL FEnvSoundInRange(entvars_t *pev, entvars_t *pevTarget, float *pflRange)
//     {
//       Vector vecSpot1 = pev->origin + pev->view_ofs;
//       Vector vecSpot2 = pevTarget->origin + pevTarget->view_ofs;
//       UTIL_TraceLine(vecSpot1, vecSpot2, ignore_monsters, ENT(pev), &tr);
//
//       // check if line of sight crosses water boundary, or is blocked
//       if ((tr.fInOpen && tr.fInWater) || tr.flFraction != 1)
//         return FALSE;
//
//       vecRange = tr.vecEndPos - vecSpot1;
//       flRange = vecRange.Length();
//       if (pSound->m_flRadius < flRange) return FALSE;
//       if (pflRange) *pflRange = flRange;
//       return TRUE;
//     }                                            sound.cpp:896-922
//
// Tres, y las tres hacen falta:
//
//   1. **traza libre**, con `ignore_monsters`: un vecino de por medio no corta
//      la reverberación, una pared sí. Igual que `elegirObjetivo` del 69, y con
//      el mismo cuidado: lo que traza es `ignore_monsters`, así que el que
//      mide no puede meter a los bichos en el rayo.
//   2. **la traza no cruza la superficie del agua** (`fInOpen && fInWater`).
//      Esto no es un detalle: es lo que impide que el `env_sound` de la plaza
//      te siga sonando con la cabeza dentro del estanque.
//   3. **la distancia cabe en el radio**, y la distancia se mide **hasta donde
//      acabó la traza**, no hasta el jugador. Con la traza libre son el mismo
//      punto; se escribe como el motor para que no haya que acordarse.
//
// ── EL REPARTO, Y UNA LECTURA MÍA QUE ERA FALSA ────────────────────────────
//
// Esto se escribió primero diciendo que **«el dueño defiende su sitio por ser
// el dueño»**, o sea que mientras te alcanzara no entraba nadie aunque hubiera
// otro a la mitad de distancia. Es falso, y lo cazó el control de abajo
// saliendo rojo con el código bien. Queda escrito porque el motivo del error
// se repite: el `goto`.
//
//     if (!FNullEnt(pPlayer->m_pentSndLast) && (pPlayer->m_pentSndLast == ENT(pev)))
//     {
//       if (pPlayer->m_flSndRoomtype != 0 && pPlayer->m_flSndRange != 0)
//       {
//         if (FEnvSoundInRange(pev, VARS(pentPlayer), &flRange))
//         { pPlayer->m_flSndRange = flRange; goto env_sound_Think_fast; }
//         else
//         { pPlayer->m_flSndRange = 0; pPlayer->m_flSndRoomtype = 0;
//           goto env_sound_Think_slow; }
//       }
//       else goto env_sound_Think_slow;
//     }
//     // if we got this far, we're looking at an entity that is contending
//     // for current player sound. the closest entity to player wins.
//     if (FEnvSoundInRange(pev, VARS(pentPlayer), &flRange))
//       if (flRange < pPlayer->m_flSndRange || pPlayer->m_flSndRange == 0)
//       { ...gana... }                             sound.cpp:947-1012
//
// Ese `goto` **sale del `Think` de ESA entidad**, no del reparto: cada
// `env_sound` tiene su propio `Think`, y el de al lado llega igual a la rama de
// contienda. Así que el comentario del motor no dice la mitad de la regla:
// dice la regla. **Gana el más cercano, siempre.** Lo único que hace la rama
// del dueño es refrescar su distancia mientras alcanza y soltar el sitio
// cuando deja de alcanzar.
//
// *Un `goto` dentro de un `Think` por entidad no es un `continue` del bucle de
// todas: leerlo como si lo fuera convierte una regla en otra.*
//
// ── EL CERO SÍ ES DISTINTO, PERO AL CONTRARIO DE LO QUE PARECE ────────────
//
// La validez del dueño incluye `m_flSndRoomtype != 0`. De ahí se dedujo que un
// `env_sound` de tipo 0 —el preset «off»— soltaría el sitio en cuanto pusiera
// su cero. **También falso, y también lo cazó el control**: el `else` al que
// cae es el de «wait passively», y ése **no pone `m_flSndRange = 0`**. O sea
// que no suelta nada:
//
//   - no refresca su distancia nunca más, y
//   - no libera el sitio nunca.
//
// Su `m_flSndRange` se queda **congelado** en la distancia que tenía al ganar,
// y desde entonces sólo se lo puede quitar alguien que esté más cerca que ese
// número viejo. O sea que el de tipo 0 es **MÁS pegajoso que uno normal**, no
// menos: uno normal se suelta al salirte de su radio, y éste no.
//
// Edana tiene **dos** así —dos de sus once no declaran `roomtype`—, y eso es
// lo que hace que merezca la pena portar el detalle en vez de redondearlo.
// Se mide en `rangoCongelado`.
//
// ── Lo que NO está aquí, dicho y contado ───────────────────────────────────
//
// 1. **El `FIND_CLIENT_IN_PVS` y los dos ritmos de `Think`** (0,25 s para el
//    activo y 0,75 s para el que espera, sound.cpp:1025-1031). El motor reparte
//    el trabajo entre fotogramas y por eso cada entidad mira a UN cliente por
//    llamada. Aquí se evalúan todos en orden en cada tic, que con un jugador da
//    el mismo dueño; lo que cambia es **cuándo** se nota un cambio de sala, y
//    eso se declara en vez de fingirlo.
// 2. **El PVS**. `FIND_CLIENT_IN_PVS` sólo ve a quien está en el conjunto
//    visible, y aquí entra cualquiera que pase la traza. La traza es más
//    estricta que el PVS para una pared, así que el caso que esto cambiaría es
//    un jugador en el mismo cuarto pero en otra hoja del árbol; no se ha medido
//    y por eso no se cuenta como portado.
//
// Es puro a propósito, como todo `src/play/`: ni DOM ni Three. El que suena es
// `src/play/audio.js`, que coge de aquí el número y busca su preset.

/**
 * LOS 29 PRESETS DEL DSP, copiados del motor sin tocar un número.
 *
 *     static const sx_preset_t rgsxpre[] =
 *     {
 *     //          -------reverb--------  -------delay--------
 *     // lp  mod  size   refl   rvblp  delay  feedback  dlylp  left
 *     { 0.0, 0.0, 0.0,   0.0,   1.0,   0.0,   0.0,      2.0,   0.0    }, // 0 off
 *     ...
 *     };                                       s_dsp.c:72-105
 *
 * Los nueve campos, en el orden del motor y con sus nombres
 * (`sx_preset_t`, s_dsp.c:28-42):
 *
 *   `paso`       `room_lp`        el paso bajo de toda la sala (0 o 1)
 *   `modula`     `room_mod`       la modulación (sólo el 26 la usa)
 *   `tamano`     `room_size`      el tamaño de la reverberación
 *   `reflejo`    `room_refl`      cuánto vuelve (`sxrvb_feedback`)
 *   `pasoRvb`    `room_rvblp`     paso bajo de la reverberación
 *   `retardo`    `room_delay`     el eco, en segundos
 *   `realim`     `room_feedback`  cuánto se realimenta el eco
 *   `pasoEco`    `room_dlylp`     paso bajo del eco
 *   `izquierda`  `room_left`      el retardo del canal izquierdo (estéreo)
 *
 * Y los comentarios de familia son del motor, no nuestros: off, generic,
 * metalic, tunnel, chamber, brite, water, concrete, outside, cavern, weirdo.
 */
export const PRESETS = [
  // paso mod   tamaño reflejo pasoRvb retardo realim pasoEco izquierda
  [0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 2.0, 0.0],        //  0 off
  [0.0, 0.0, 0.0, 0.0, 1.0, 0.065, 0.1, 0.0, 0.01],     //  1 generic
  [0.0, 0.0, 0.0, 0.0, 1.0, 0.02, 0.75, 0.0, 0.01],     //  2 metalic
  [0.0, 0.0, 0.0, 0.0, 1.0, 0.03, 0.78, 0.0, 0.02],     //  3
  [0.0, 0.0, 0.0, 0.0, 1.0, 0.06, 0.77, 0.0, 0.03],     //  4
  [0.0, 0.0, 0.05, 0.85, 1.0, 0.008, 0.96, 2.0, 0.01],  //  5 tunnel
  [0.0, 0.0, 0.05, 0.88, 1.0, 0.01, 0.98, 2.0, 0.02],   //  6
  [0.0, 0.0, 0.05, 0.92, 1.0, 0.015, 0.995, 2.0, 0.04], //  7
  [0.0, 0.0, 0.05, 0.84, 1.0, 0.0, 0.0, 2.0, 0.012],    //  8 chamber
  [0.0, 0.0, 0.05, 0.9, 1.0, 0.0, 0.0, 2.0, 0.008],     //  9
  [0.0, 0.0, 0.05, 0.95, 1.0, 0.0, 0.0, 2.0, 0.004],    // 10
  [0.0, 0.0, 0.05, 0.7, 0.0, 0.0, 0.0, 2.0, 0.012],     // 11 brite
  [0.0, 0.0, 0.055, 0.78, 0.0, 0.0, 0.0, 2.0, 0.008],   // 12
  [0.0, 0.0, 0.05, 0.86, 0.0, 0.0, 0.0, 2.0, 0.002],    // 13
  [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 2.0, 0.01],       // 14 water
  [1.0, 0.0, 0.0, 0.0, 1.0, 0.06, 0.85, 2.0, 0.02],     // 15
  [1.0, 0.0, 0.0, 0.0, 1.0, 0.2, 0.6, 2.0, 0.05],       // 16
  [0.0, 0.0, 0.05, 0.8, 1.0, 0.0, 0.48, 2.0, 0.016],    // 17 concrete
  [0.0, 0.0, 0.06, 0.9, 1.0, 0.0, 0.52, 2.0, 0.01],     // 18
  [0.0, 0.0, 0.07, 0.94, 1.0, 0.3, 0.6, 2.0, 0.008],    // 19
  [0.0, 0.0, 0.0, 0.0, 1.0, 0.3, 0.42, 2.0, 0.0],       // 20 outside
  [0.0, 0.0, 0.0, 0.0, 1.0, 0.35, 0.48, 2.0, 0.0],      // 21
  [0.0, 0.0, 0.0, 0.0, 1.0, 0.38, 0.6, 2.0, 0.0],       // 22
  [0.0, 0.0, 0.05, 0.9, 1.0, 0.2, 0.28, 0.0, 0.0],      // 23 cavern
  [0.0, 0.0, 0.07, 0.9, 1.0, 0.3, 0.4, 0.0, 0.0],       // 24
  [0.0, 0.0, 0.09, 0.9, 1.0, 0.35, 0.5, 0.0, 0.0],      // 25
  [0.0, 1.0, 0.01, 0.9, 0.0, 0.0, 0.0, 2.0, 0.05],      // 26 weirdo
  [0.0, 0.0, 0.0, 0.0, 1.0, 0.009, 0.999, 2.0, 0.04],   // 27
  [0.0, 0.0, 0.001, 0.999, 0.0, 0.2, 0.8, 2.0, 0.05],   // 28
];

/** Los nombres de los nueve campos, en el orden del motor. */
export const CAMPOS = [
  "paso", "modula", "tamano", "reflejo", "pasoRvb", "retardo", "realim", "pasoEco", "izquierda",
];

/**
 * El preset de un `room_type`, como objeto.
 *
 *     idsp_room = bound( 0, idsp_room, MAX_ROOM_TYPES );   s_dsp.c:809
 *
 * `bound` recorta a los dos lados, así que un `roomtype` de 500 **no apaga la
 * reverberación: da el último preset**. Lo mismo un negativo da el 0. Se porta
 * el recorte y no un `?? PRESETS[0]`, porque son cosas distintas y el mapa 93
 * puede traer el número raro.
 */
export function presetDe(tipo) {
  const i = Math.min(Math.max(Math.round(Number(tipo) || 0), 0), PRESETS.length - 1);
  const v = PRESETS[i];
  const out = { tipo: i };
  CAMPOS.forEach((c, j) => { out[c] = v[j]; });
  return out;
}

/** `roomwater_type`, cuyo valor por omisión es «14» — s_dsp.c:151. */
export const TIPO_DE_AGUA = 14;

/**
 * Qué `room_type` se oye de verdad, que no siempre es el de la sala.
 *
 *     idsp_room = cl.local.waterlevel > 2 ? roomwater_type.value : room_type.value;
 *                                                      s_dsp.c:806
 *
 * `waterlevel > 2` es **los ojos dentro del agua**, no los pies: son los
 * niveles de `WATERLEVEL_EYES` del motor. O sea que meter la cabeza en el
 * estanque de Edana cambia la reverberación a la 14 y sacarla la devuelve, sin
 * que el `env_sound` de la plaza se entere de nada.
 */
export function tipoQueSeOye({ tipo = 0, nivelDeAgua = 0 } = {}) {
  return nivelDeAgua > 2 ? TIPO_DE_AGUA : tipo;
}

/**
 * ¿Alcanza este `env_sound` al jugador? — `FEnvSoundInRange`, sound.cpp:896-922.
 *
 * `libre(a, b)` tiene que contestar como `UTIL_TraceLine` con
 * `ignore_monsters`: `{ fraccion, cruzaAgua }` o un booleano para el caso
 * simple. `vistaDe` es el `view_ofs` de cada uno, que el motor SUMA a los dos
 * orígenes: el del `env_sound` es cero —es un `CPointEntity`— y el del jugador
 * no, y usar el pie del jugador en vez del ojo cambia el radio en metro y
 * medio.
 */
export function alcanza({ origen, radio, ojoDelJugador, libre = () => true }) {
  const r = libre(origen, ojoDelJugador);
  const fraccion = typeof r === "object" && r !== null ? (r.fraccion ?? 1) : (r ? 1 : 0);
  const cruzaAgua = typeof r === "object" && r !== null ? Boolean(r.cruzaAgua) : false;
  // El orden del motor: primero se descarta, y sólo después se mide.
  if (cruzaAgua || fraccion !== 1) return { alcanza: false, distancia: null, porQueNo: cruzaAgua ? "cruza el agua" : "pared en medio" };
  // `vecRange = tr.vecEndPos - vecSpot1; flRange = vecRange.Length()`
  // (sound.cpp:915-917): el motor mide hasta **donde acabó la traza**, no hasta
  // el jugador.
  //
  // Aquí se mide hasta el jugador, y no es un atajo: en esta línea `fraccion`
  // **sólo puede ser 1**, porque el `return` de arriba se lleva todo lo que no
  // lo sea. O sea que `vecEndPos` es el destino por construcción y los dos
  // cálculos dan el mismo número siempre.
  //
  // Se dice porque se intentó medir: interpolar por la fracción —que es lo que
  // estaba escrito primero, copiando la forma del motor— **pasó las pruebas
  // igual al romperlo**, y un camino que no se puede poner en rojo no se deja
  // puesto haciendo como que hace algo (apartado 4 de CLAUDE.md). Si algún día
  // esta función se llamara con una traza que choca y aun así tuviera que medir,
  // hay que volver a traer la interpolación **y una prueba que la distinga**.
  const distancia = Math.hypot(
    ojoDelJugador[0] - origen[0], ojoDelJugador[1] - origen[1], ojoDelJugador[2] - origen[2],
  );
  if (radio < distancia) return { alcanza: false, distancia, porQueNo: "fuera del radio" };
  return { alcanza: true, distancia, porQueNo: null };
}

/**
 * EL REPARTO. Un tic de los `Think` de todos los `env_sound` de un mapa.
 *
 * `estado` es lo que el motor guarda **en el jugador** y no en la entidad
 * (`m_pentSndLast`, `m_flSndRoomtype`, `m_flSndRange`, player.h). Entra y sale
 * para que la pegajosidad sea visible desde fuera: sin eso no se puede medir
 * ni que el `tipo` se arrastra al salirse de todos, ni que el rango de un dueño
 * de tipo 0 se queda congelado.
 *
 * Devuelve el estado nuevo y, aparte, `tipo`: el `room_type` que el jugador
 * tiene puesto. Y OJO, que es la línea más fácil de portar mal —el motor la
 * comenta dos veces—:
 *
 *     // NOTE: we do not actually change the player's room_type
 *     // NOTE: until we have a new valid room_type to change it to.
 *                                                  sound.cpp:975-980
 *
 * O sea que salirse del alcance de todos **no apaga la reverberación**: te
 * llevas la de la última sala puesta hasta que otra te la cambie. Por eso
 * `tipo` vive en el estado y no se recalcula de cero en cada tic.
 */
export function unTic({ fuentes = [], ojoDelJugador, libre = () => true, estado = null } = {}) {
  const e = estado ?? { dueño: null, rango: 0, tipoDelDueño: 0, tipo: 0, cambios: 0 };
  let dueño = e.dueño, rango = e.rango, tipoDelDueño = e.tipoDelDueño;
  let tipo = e.tipo, cambios = e.cambios ?? 0;
  const vistos = [];

  for (let i = 0; i < fuentes.length; i++) {
    const f = fuentes[i];
    const clave = f.clave ?? i;
    const r = alcanza({ origen: f.unidades, radio: f.radio, ojoDelJugador, libre });
    vistos.push({ clave, ...r });

    // ── La rama del DUEÑO, sound.cpp:947-990 ──────────────────────────────
    if (dueño !== null && dueño === clave) {
      if (tipoDelDueño !== 0 && rango !== 0) {
        if (r.alcanza) {
          // «goto env_sound_Think_fast»: refresca su distancia. El `goto` sale
          // del `Think` de ESTA entidad, no del reparto: los demás siguen
          // contendiendo contra el rango nuevo. Ver la cabecera.
          rango = r.distancia;
        } else {
          // Ha dejado de alcanzar: suelta el sitio, **y el `tipo` del jugador
          // NO se toca** — las dos NOTE del motor.
          rango = 0;
          tipoDelDueño = 0;
        }
        continue;
      }
      // El `else` del motor: «is affecting player but is out of range, wait
      // passively for another entity to usurp it». **No toca `m_flSndRange`**,
      // así que el de tipo 0 se queda con el rango congelado: ni lo refresca
      // ni lo suelta. Ver `rangoCongelado`.
      continue;
    }

    // ── La rama de los que CONTIENDEN, sound.cpp:993-1012 ─────────────────
    if (!r.alcanza) continue;
    if (r.distancia < rango || rango === 0) {
      dueño = clave;
      tipoDelDueño = f.tipo ?? 0;
      rango = r.distancia;
      if (tipo !== tipoDelDueño) cambios++;   // el `MESSAGE_BEGIN(SVC_ROOMTYPE)`
      tipo = tipoDelDueño;
    }
  }

  return { dueño, rango, tipoDelDueño, tipo, cambios, vistos };
}

/**
 * ¿Tiene este dueño el rango CONGELADO? — la rareza del tipo 0.
 *
 * El `else` de «wait passively» (sound.cpp:986-990) no pone `m_flSndRange` a
 * cero, así que un dueño de tipo 0 ni refresca su distancia ni suelta el
 * sitio: se queda con la que tenía al ganar. Esto no es una función del motor,
 * es la pregunta puesta donde se pueda medir — y está escrita después de que
 * el control tumbara la lectura contraria, que era la primera que hice.
 */
export const rangoCongelado = (tipoDelDueño) => tipoDelDueño === 0;
