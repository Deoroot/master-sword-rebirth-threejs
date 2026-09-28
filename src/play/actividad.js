// LA ANIMACIÓN QUE NO TIENE NOMBRE: `LookupActivity`.
//
// Hasta ahora este proyecto pedía las animaciones POR NOMBRE, porque es como
// las nombra el script: `setvar ANIM_WALK walk`, `setvard ANIM_DEATH die_fallback`.
// Y para el goblin funciona. Pero dieciséis de los sesenta y nueve bichos de
// Gate City —los `Commoner` de `NPCs/default_dwarf` y `default_human`— **no
// nombran la de estar parado**: sólo declaran `setmoveanim walk`.
//
// Lo que hacíamos era caer en la de andar:
//
//     const actual = pon(c.parado ?? c.andando);       <- bichos.js, hasta el 21
//
// y eso da lo que se ve en el pueblo: un aldeano plantado en mitad de una
// zancada, con un pie levantado, para siempre. No es que se le haya parado la
// animación — es que le hemos puesto la de andar y no anda.
//
// ── Lo que hace el motor ──────────────────────────────────────────────────
//
// Tres casos, y el tercero no es «la secuencia 0»:
//
//     if (HasConditions(MONSTER_HASMOVEDEST))   SetAnimation(..., m_MoveAnim);
//     else if (m_IdleAnim.len())                SetAnimation(..., m_IdleAnim);
//     else { m_pAnimHandler = NULL; SetActivity(ACT_IDLE); }
//                                            msmonsterserver.cpp:590-600
//
// O sea: si el script no hizo `setidleanim`, se pide la **actividad** ACT_IDLE,
// que es un número escrito en la cabecera de cada secuencia del `.mdl` por el
// compilador (`$sequence idle ... ACT_IDLE 1`). Y si el modelo no tiene
// ninguna con esa actividad, ENTONCES sí, la secuencia 0:
//
//     iSequence = LookupActivity(NewActivity);
//     if (iSequence > ACTIVITY_NOT_AVAILABLE) { pev->sequence = iSequence; ... }
//     else pev->sequence = 0;                   monsters.cpp:1229-1254
//
// El dato ya estaba en el archivo y ya lo leíamos (`actividad` en
// `mdlanim.js`); lo que faltaba era usarlo.
//
// ── El sorteo con peso, que es lo que no se adivina ───────────────────────
//
// `LookupActivity` no devuelve la primera que empata: sortea entre TODAS las
// que empatan, en proporción a `actweight`. Y lo hace en una sola pasada, con
// un muestreo por depósito:
//
//     int weighttotal = 0;  int seq = ACTIVITY_NOT_AVAILABLE;
//     for (int i = 0; i < numseq; i++)
//       if (pseqdesc[i].activity == activity) {
//         weighttotal += pseqdesc[i].actweight;
//         if (!weighttotal || RANDOM_LONG(0, weighttotal - 1) < pseqdesc[i].actweight)
//           seq = i;
//       }
//                                            animation.cpp:81-106
//
// Eso es lo que hace que un modelo con tres «idle» no se quede siempre en la
// primera. Y trae un rincón que hay que portar tal cual: **`!weighttotal`**.
// Si todas las candidatas pesan cero, `weighttotal` se queda en cero, la
// condición se cumple SIEMPRE y gana la ÚLTIMA. No es lo mismo que «la
// primera» ni que «al azar», y en un modelo con los pesos sin poner —que los
// hay— es el caso que manda.

/**
 * Las actividades que este proyecto usa. El número lo fija `activity.h` del
 * motor y NO es nuestro: cambiarlo es dejar de encontrar la secuencia.
 *
 *     ACT_RESET = 0,  ACT_IDLE = 1,  ACT_GUARD = 2,  ACT_WALK = 3,  ACT_RUN = 4
 *                                            activity.h:21-25
 */
export const ACT = { RESET: 0, IDLE: 1, GUARD: 2, ANDAR: 3, CORRER: 4 };

/** Lo que `LookupActivity` devuelve cuando no hay ninguna. */
export const NO_HAY = -1;

/**
 * `LookupActivity(pmodel, pev, activity)`, literal.
 *
 * `secuencias` son las de la ficha del `.mdl` —con `actividad` y
 * `pesoActividad`— y devuelve el ÍNDICE, no el nombre, porque es lo que
 * devuelve el motor y porque dos secuencias pueden llamarse igual.
 *
 * `azar(n)` tiene que devolver un entero de 0 a n−1, que es `RANDOM_LONG(0, n-1)`.
 */
export function buscarActividad(secuencias, actividad, azar = (n) => Math.floor(Math.random() * n)) {
  let total = 0;
  let cual = NO_HAY;
  for (const s of secuencias ?? []) {
    if (s?.actividad !== actividad) continue;
    const peso = s.pesoActividad ?? 0;
    total += peso;
    // El `!weighttotal` del motor va PRIMERO y en el mismo `if`: con todos los
    // pesos a cero gana la última, y sin esa rama `RANDOM_LONG(0, -1)` sería
    // una barbaridad.
    if (!total || azar(total) < peso) cual = s.indice;
  }
  return cual;
}

/**
 * `SetActivity(ACT_IDLE)` con su caída a la secuencia 0.
 *
 * Devuelve el índice que hay que poner, siempre: si el modelo no declara la
 * actividad, el motor se queda en la 0 y no avisa de nada.
 */
export function secuenciaDeActividad(secuencias, actividad, azar) {
  const i = buscarActividad(secuencias, actividad, azar);
  return i > NO_HAY ? i : 0;
}

/**
 * LA ANIMACIÓN DE ESTAR PARADO de un bicho, en el orden del motor.
 *
 * `nombrado` es lo que dijo su script (`setidleanim`, que en nuestra ficha es
 * `parado`). Si lo dijo, manda. Si no, la actividad. Y **nunca** la de andar:
 * ése era el fallo.
 *
 * Devuelve `{ que, porque }` y no sólo el nombre, porque la sonda tiene que
 * poder distinguir «la nombró su script» de «la buscamos por actividad» de
 * «no había y es la cero». Con sólo el nombre, las tres se ven igual.
 */
export function animacionDeParado({ nombrado = null, secuencias = [], azar } = {}) {
  if (nombrado) return { que: String(nombrado), porque: "la nombra su script" };
  const i = buscarActividad(secuencias, ACT.IDLE, azar);
  if (i > NO_HAY) {
    const s = secuencias.find((x) => x.indice === i);
    return { que: s?.nombre ?? String(i), indice: i, porque: "por actividad ACT_IDLE" };
  }
  const cero = secuencias?.[0];
  return { que: cero?.nombre ?? "0", indice: 0, porque: "no hay ACT_IDLE: la secuencia 0" };
}
