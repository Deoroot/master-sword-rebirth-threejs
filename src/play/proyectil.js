// EL TIRO CON ARCO. El tercer tipo de ataque del motor, y el más raro de los tres.
//
// Los otros dos —`strike-land` y `hold-strike`— están en `golpe.js` y en
// `escudo.js`. Éste es `charge-throw-projectile`, y no es «un golpe a distancia»:
// es un OBJETO que nace, vuela con gravedad y choca, y el daño no lo lleva el
// arco sino la flecha.
//
// Igual que `golpe.js`, esto no conoce Three ni Rapier: aquí está la regla y
// quien tenga el mundo la ejecuta. Por eso se prueba en `node --test`.
//
//   `CGenericItem::ChargeThrowProj`   giattack.cpp:1059   de dónde sale el tiro
//   `CGenericItem::RegisterAttack`    giattack.cpp:565    los dos tiempos y el cono
//   `CGenericItem::TossProjectile`    giprojectile.cpp:42 el nacimiento
//   `CGenericItem::Projectile_Move`   giprojectile.cpp:252 el vuelo
//   `CGenericItem::Projectile_CheckHit` giprojectile.cpp:281 el choque
//   `CGenericItem::ProjectileTouch`   giprojectile.cpp:118 el daño
//
// ── LO QUE HAY QUE SABER ANTES DE LEERLO ──────────────────────────────────
//
// **`reg.attack.range` no es el alcance: es la VELOCIDAD.**
//
//     float flRange = CurrentAttack->flRange * flTimeHeldAdjusted;
//     Vector vTemp = vForward * flRange;
//     pProjectile->TossProjectile(this, vStartPos, vTemp);     giattack.cpp:1097
//
// y dentro, `pev->velocity = vVelocity`. O sea que los 750 de `RANGED_FORCE` del
// arco de árbol son 750 unidades por segundo —19 m/s—, y el campo se llama
// «range» sólo porque el ataque a distancia reutiliza la ficha del cuerpo a
// cuerpo. Aquí se llama `fuerza`, que es lo que el script ya llamaba.
//
// **Una flecha cae, y cae más que una piedra en el mundo real.** `MOVETYPE_TOSS`
// con `sv_gravity 800` (multiplay_gamerules.cpp:168) y el `gravity 0.7` de la
// flecha: 560 u/s², o sea 14,2 m/s². Con 750 u/s de salida, a 20 metros ya ha
// bajado casi un metro y medio. El arco de Master Sword es un arco de verdad en
// eso: hay que apuntar alto.
//
// ── Y LAS TRES COSAS QUE ESTÁN MAL EN EL MOTOR ────────────────────────────
//
// No son interpretaciones: son tres líneas que hacen algo distinto de lo que
// dicen. Están portadas **con el fallo**, y cada una con su interruptor en
// `AJUSTES` por si se quiere jugar sin él. Ver `PROYECTILES_23.md`.
//
//   1. El desvío del apuntado va en el GUIÑO y tenía que ir en el cabeceo.
//   2. El cono de dispersión es un MEDIO círculo, así que siempre desvía al
//      mismo lado.
//   3. La habilidad no mejora la puntería: la línea que la calcula no se usa.

/** `sv_gravity`, forzada por las reglas del juego y no configurable. */
export const GRAVEDAD = 800;

/** `STATPROP_MAX_VALUE` (statdefs.h:76), igual que en el cuerpo a cuerpo. */
export const TOPE_PROPIEDAD = 100;

/** `V_max(dmgMultiplier, 0.001f)` — el mismo suelo brutal del mandoble. */
export const SUELO_DE_POTENCIA = 0.001;

/**
 * Cuánto mira hacia delante una flecha en cada paso, en unidades.
 *
 *     Vector vecEnd = pev->origin + pev->velocity.Normalize() * 36;
 *     MSTraceLine( pev->origin, vecEnd, dont_ignore_monsters, edict(), tr, … );
 *                                            giprojectile.cpp:290-296
 *
 * Y esto SÍ es una limitación, no un descuido: una flecha a 750 u/s avanza 12,5
 * unidades por fotograma a 60 Hz y 37 a 20 Hz, así que sin mirar adelante se
 * cuela por dentro de un goblin de 32 de ancho. La solución del motor es un rayo
 * de 36 unidades cada `think`, y la consecuencia jugable es que **una flecha
 * acierta hasta 36 unidades —casi un metro— antes de tocar nada**: se ve clavada
 * en el aire delante del bicho.
 *
 * Nosotros barremos además de `pos` a `pos + v*dt`, que es lo que hace de verdad
 * el movimiento de Half-Life (el `touch` de `SOLID_TRIGGER` es un movimiento
 * barrido, no una comprobación en un punto). O sea: el barrido es fiel y los 36
 * son fieles, y los dos hacen falta.
 */
export const MIRA_ADELANTE = 36;

/** `MSITEM_TIME_EXPIRE` (msitemdefs.h:10): lo que tarda en irse del suelo. */
export const EXPIRA = 120;

/**
 * LO QUE EL MOTOR HACE, para poder comparar. No se toca.
 *
 * `AJUSTES` arranca siendo una copia de esto, o sea que **por omisión se juega
 * el juego de verdad**, con sus tres erratas. La prueba
 * «los ajustes arrancan siendo los del motor» está para que un cambio de
 * comodidad no se convierta en el comportamiento por omisión sin que nadie lo
 * decida.
 */
export const COMO_EL_MOTOR = Object.freeze({
  /**
   * `RANGED_AIMANGLE (0,9,0)` sumado al ángulo de la vista, y el ángulo de la
   * vista es `(cabeceo, guiño, alabeo)`:
   *
   *     if (m_pPlayer) vAngle += CurrentAttack->AimOffset;   giattack.cpp:1089
   *
   * Nueve grados **en el guiño**, o sea de lado. A veinte metros son tres
   * metros a la izquierda de la cruceta. Que la intención era el cabeceo —subir
   * el tiro para compensar la caída— lo dice el resto del juego: las dos
   * ballestas, que van planas y casi sin gravedad, lo declaran `(0,0,0)`; el
   * arco largo, que llega más lejos, `(0,3,0)`; y todos los arcos posteriores
   * vuelven a `(0,0,0)`, o sea que alguien lo apagó en vez de arreglarlo. El
   * arco de árbol —el gratis del personaje nuevo— hereda los 9 de `bows_base`.
   *
   * Y sólo le pasa al JUGADOR: el `if (m_pPlayer)` deja fuera a los monstruos,
   * así que los arqueros enemigos tiran recto.
   */
  desvioEnElGuino: true,
  /**
   * El cono de dispersión no es un disco: es media circunferencia.
   *
   *     float VeerAng = RANDOM_FLOAT(0.0f, M_PI);
   *     vAngle.x += cosf(VeerAng) * Spread;
   *     vAngle.y += sinf(VeerAng) * Spread;       giattack.cpp:1085-1087
   *
   * Dos fallos en tres líneas. El ángulo va de 0 a π y no a 2π, así que
   * `sinf` **nunca es negativo**: el desvío del guiño es siempre al mismo lado.
   * Y el radio es siempre exactamente `Spread`, nunca menos, así que ninguna
   * flecha sale por el centro del cono: salen todas por el borde.
   */
  veerDeMedioCirculo: true,
  /**
   * La habilidad NO mejora la puntería, y no por decisión: por una línea
   * huérfana.
   *
   *     //Shoot more accurately for higher skill
   *     float flAccFraction = m_pOwner->GetSkillStat(…) / STATPROP_MAX_VALUE;
   *     flAccFraction = 1 - V_min(V_max(flAccFraction, 0.0f), 1.0f);
   *
   *     //Shoot more accurately for drawing the bow back longer
   *     float LoweredSpreadDeg = flAccBest + ((flAccuracyDefault - flAccBest) * (1 - flTimeHeldAdjusted));
   *                                            giattack.cpp:1077-1082
   *
   * `flAccFraction` se calcula, se normaliza con cuidado… y no vuelve a
   * aparecer. El cono sale sólo de cuánto has tensado. O sea que en Rebirth la
   * arquería **no apunta mejor**; sólo hace más daño, por el mismo
   * `potencia / 100` del mandoble.
   */
  punteriaPorHabilidad: false,
});

/**
 * ── EL MÍNIMO DE TENSADO, QUE NO ES UN CASTIGO: ES UNA ESPERA ─────────────
 *
 * Esto no lleva interruptor porque no es una errata, y costó verlo. En el
 * servidor el castigo por soltar pronto está comentado:
 *
 *     //if( gpGlobals->time < CurrentAttack->tStart + CurrentAttack->tProjMinHold )
 *     //{   //Released too early
 *     //	CurrentAttack->tStart = gpGlobals->time - CurrentAttack->tDuration;
 *     //}
 *     //else
 *     CurrentAttack->tStart = gpGlobals->time;        giattack.cpp:419-424
 *
 * y la primera lectura fue «entonces un clic dispara al instante al 85 %». No:
 * está comentado porque **el servidor no recibe nunca una suelta temprana**. La
 * suelta la manda el cliente, y la manda con una condición:
 *
 *     void CGenericItem::ActivateButtonUp() {
 *       …
 *     #ifndef VALVE_DLL
 *       if (!m_ReleaseAttack)
 *         if (CurrentAttack && !CurrentAttack->fAttackReleased &&
 *             (CurrentAttack->Type == ATT_CHARGE_THROW_PROJ || … ))
 *           if (gpGlobals->time >= CurrentAttack->tTrueStart + CurrentAttack->tProjMinHold)
 *           {
 *             SendCancelAttackCmd();
 *             CurrentAttack->fAttackReleased = true;
 *             m_ReleaseAttack = true;
 *           }
 *     #endif
 *     }                                              genericitem.cpp:747-768
 *
 * Y `ActivateButtonUp` corre en **cada fotograma con el botón arriba**, no en el
 * flanco. O sea que soltar antes del mínimo no cancela nada ni castiga nada: la
 * suelta **se queda pendiente y se manda sola** en cuanto el reloj llega al
 * mínimo. Un clic seco en el arco de árbol dispara **1,1 segundos después**, al
 * 85 % de fuerza, sin que el jugador toque nada más.
 *
 * Así que el arco de Master Sword tiene un tiempo de carga fijo de 1,1 s y una
 * ventana de mejora de 0,2: de 638 a 750 u/s y de 4,9° a 4,0° de cono. Todo el
 * sistema de tensado cabe en ese 15 %, y esa es la parte que de verdad merece
 * discutirse — no la de si el castigo debería estar descomentado.
 */
export const MINIMO_ES_ESPERA = true;

/** Los interruptores en uso. Arrancan siendo los del motor. */
export const AJUSTES = { ...COMO_EL_MOTOR };

/**
 * LA FRACCIÓN DE TENSADO, de la que sale todo lo demás.
 *
 *     float flTimeHeld = gpGlobals->time - CurrentAttack->tTrueStart;
 *     float flTimeHeldAdjusted = V_max(V_min(flTimeHeld, tMaxHold), tProjMinHold);
 *     flTimeHeldAdjusted = tMaxHold ? (flTimeHeldAdjusted / tMaxHold) : 0;
 *                                            giattack.cpp:1073-1075
 *
 * El `V_max` con el mínimo es lo que hace que un clic no sea un tiro flojo: es
 * un tiro al 85 %. Y con `tMaxHold` a cero —un arco que no declare los dos
 * tiempos— la fracción es **cero**, o sea que la flecha sale con velocidad cero
 * y cae a los pies. No es una suposición: es el ternario.
 */
export function fraccionTensada(sostenido, sostener = null) {
  const min = sostener?.[0] ?? 0;
  const max = sostener?.[1] ?? 0;
  if (!(max > 0)) return 0;
  return Math.max(Math.min(sostenido ?? 0, max), min) / max;
}

/** La velocidad de salida, en unidades por segundo. */
export function velocidadDeSalida(ataque, fraccion) {
  return (ataque?.alcance ?? 0) * fraccion;
}

/**
 * EL CONO, en grados, según lo tensado que estuviera.
 *
 *     LoweredSpreadDeg = flAccBest + ((flAccuracyDefault - flAccBest) * (1 - held))
 *     float Spread = V_max(LoweredSpreadDeg, 0);
 *
 * `reg.attack.COF` son los dos: `10;4` en el arco de árbol es 10° sin tensar y
 * 4° tensado del todo. Y ojo con el orden — el primero es el MALO.
 *
 * Con `punteriaPorHabilidad` encendido se multiplica por `1 - habilidad/100`,
 * que es lo que el motor calcula y no usa. **Eso es nuestro**: el motor no dice
 * en ningún sitio cómo pensaba aplicarlo.
 */
export function conoDelTiro(ataque, fraccion, { habilidad = 0, ajustes = AJUSTES } = {}) {
  const suelto = ataque?.cono?.[0] ?? 0;
  const tensado = ataque?.cono?.[1] ?? 0;
  let cono = tensado + (suelto - tensado) * (1 - fraccion);
  if (ajustes.punteriaPorHabilidad) {
    const f = 1 - Math.min(Math.max((habilidad ?? 0) / TOPE_PROPIEDAD, 0), 1);
    cono *= f;
  }
  return Math.max(cono, 0);
}

/**
 * EL ÁNGULO CON EL QUE SALE LA FLECHA, que no es el de la cruceta.
 *
 * Tres sumas encima de la vista, en este orden, que es el del motor: el desvío
 * del cono, y luego el `ofs.aimang` del arco.
 *
 *   `cabeceo`/`guino` en GRADOS y con el signo del motor: cabeceo positivo mira
 *   ABAJO (es `pev->v_angle.x`), guiño positivo gira a la IZQUIERDA.
 */
export function anguloDelTiro({
  cabeceo = 0, guino = 0, ataque = null, sostenido = 0, habilidad = 0,
  azar = Math.random, ajustes = AJUSTES,
} = {}) {
  const fraccion = fraccionTensada(sostenido, ataque?.sostener);
  const cono = conoDelTiro(ataque, fraccion, { habilidad, ajustes });
  // El medio círculo del motor, o el entero si se arregla. Y el radio: el motor
  // lo pone siempre al máximo; arreglado, se sortea dentro del disco (raíz para
  // que la densidad sea uniforme y no se apelotone en el centro).
  const vuelta = ajustes.veerDeMedioCirculo ? Math.PI : 2 * Math.PI;
  const anguloDelVeer = azar() * vuelta;
  const radio = ajustes.veerDeMedioCirculo ? cono : cono * Math.sqrt(azar());
  let p = cabeceo + Math.cos(anguloDelVeer) * radio;
  let g = guino + Math.sin(anguloDelVeer) * radio;
  const apunta = ataque?.apunta ?? [0, 0, 0];
  if (ajustes.desvioEnElGuino) {
    // Tal cual: `vAngle += AimOffset`, componente a componente.
    p += apunta[0];
    g += apunta[1];
  } else {
    // Arreglado: los grados que el arco declara van al CABECEO, y hacia arriba,
    // que es lo que compensa la caída. Cabeceo negativo mira arriba.
    p += apunta[0] - apunta[1];
  }
  return { cabeceo: p, guino: g, cono, fraccion, velocidad: velocidadDeSalida(ataque, fraccion) };
}

/**
 * EL DAÑO DE UNA FLECHA, y no se parece al del mandoble.
 *
 *     dmgMultiplier = GetSkillStat(StatPower, PropPower) / STATPROP_MAX_VALUE;
 *     dmgMultiplier = V_max(dmgMultiplier, 0.001f);
 *     …
 *     Damage.flDamage = ProjectileData->Damage * dmgMultiplier;
 *     Damage.flHitPercentage = 100.0f;                giprojectile.cpp:156-168
 *
 * Cuatro diferencias con `danoDelGolpe`, y ninguna es de matiz:
 *
 *   - el daño base es el de la FLECHA (`$rand(30,60)` en la gratis), sorteado
 *     con decimales y no con `RANDOM_LONG`;
 *   - el multiplicador del ARCO (`reg.attack.dmg.multi`) se aplica al nacer la
 *     flecha (giprojectile.cpp:60-64) y no al chocar;
 *   - **no hay crítico**: `flCritThreshold` se queda a cero porque
 *     `TossProjectile` no lo copia del ataque, y el motor pide
 *     `flCritThreshold > 0` para tirar el dado (giattack.cpp:1727);
 *   - **no hay tirada de acierto**: `flHitPercentage` es 100 a pelo.
 *
 * O sea: una flecha nunca falla y nunca hace crítico. Lo único que decide es la
 * potencia de arquería, con el mismo `/100` de siempre — un personaje nuevo con
 * un punto hace **0,3 a 0,6** de daño con la flecha gratis.
 */
export function danoDeFlecha({
  dado = 0, multiplicadorDelArco = 1, potencia = 0,
} = {}) {
  const multi = multiplicadorDelArco > 0 ? multiplicadorDelArco : 1;
  const fraccion = Math.max((potencia ?? 0) / TOPE_PROPIEDAD, SUELO_DE_POTENCIA);
  return dado * multi * fraccion;
}

/** Tira el dado de daño de una flecha: `$rand(30,60)`, con decimales. */
export function dadoDeFlecha(dano, azar = Math.random) {
  if (!dano) return 0;
  const min = dano.min ?? 0, max = dano.max ?? min;
  return max > min ? min + azar() * (max - min) : min;
}

/**
 * UNA FLECHA EN EL AIRE.
 *
 * Todo en UNIDADES y segundos, como el motor. El orden de cada paso es el de
 * `SV_Physics_Toss` seguido de `CGenericItem::Think`:
 *
 *   1. la gravedad, ANTES de mover (`SV_AddGravity`) — moverla después da un
 *      tiro un fotograma más plano, que a 20 Hz son 28 unidades de más;
 *   2. el movimiento, barrido de donde estaba a donde va;
 *   3. y el rayo de 36 unidades hacia delante de `Projectile_CheckHit`.
 *
 * Y nace con una comprobación **antes de moverse**, que es lo que el motor pone
 * al final de `TossProjectile`:
 *
 *     Think(); //Check the first frame                giprojectile.cpp:116
 *
 * O sea que una flecha disparada pegado a una pared choca en el fotograma cero,
 * sin haber recorrido nada.
 */
export class Flecha {
  /**
   * @param {object} o
   * @param {number[]} o.desde   punto de salida, en unidades
   * @param {number[]} o.hacia   dirección unitaria, ejes de la escena
   * @param {number} o.velocidad unidades por segundo
   * @param {number} o.gravedad  la de la flecha (0,7), no la del mundo
   */
  constructor({
    desde = [0, 0, 0], hacia = [0, 0, -1], velocidad = 0, gravedad = 1,
    dano = 0, tipoDano = "pierce", expira = EXPIRA, ficha = null,
  } = {}) {
    this.pos = [...desde];
    /** De dónde salió, para poder medir la caída sin el desnivel de la mano. */
    this.salida = [...desde];
    this.vel = [hacia[0] * velocidad, hacia[1] * velocidad, hacia[2] * velocidad];
    /**
     * Con qué salió, guardado aparte.
     *
     * Porque `vel` cambia en el primer paso: la gravedad entra antes de mover, y
     * medir «a qué velocidad sale una flecha» un fotograma después da 740 en vez
     * de 750 y un ángulo que no es el del disparo. Son las dos cifras que hay que
     * comparar con el script, así que se quedan.
     */
    this.velocidadInicial = velocidad;
    this.direccionInicial = [hacia[0], hacia[1], hacia[2]];
    this.gravedad = gravedad;
    this.dano = dano;
    this.tipoDano = tipoDano;
    this.expira = expira;
    this.ficha = ficha;
    /** Mientras vuela. Al chocar deja de volar y empieza a contar para irse. */
    this.volando = true;
    this.vida = 0;
    this.enElSuelo = 0;
    this.recorrido = 0;
    /** Dónde y contra qué chocó, para que quien tenga el mundo lo pinte. */
    this.choque = null;
  }

  /** La velocidad en módulo, que es lo que el motor guarda en `Speed`. */
  get rapidez() { return Math.hypot(this.vel[0], this.vel[1], this.vel[2]); }

  /**
   * La comprobación del fotograma cero. `traza(desde, hasta)` devuelve `null` si
   * el camino está libre o `{ punto, contra }` si no.
   */
  nacer(traza) {
    return this._mirarAdelante(traza);
  }

  _mirarAdelante(traza) {
    if (!traza) return null;
    const r = this.rapidez;
    if (!(r > 0)) return null;
    const hasta = [0, 1, 2].map((k) => this.pos[k] + (this.vel[k] / r) * MIRA_ADELANTE);
    const g = traza(this.pos, hasta);
    if (g) this._chocar(g);
    return g ?? null;
  }

  _chocar(g) {
    this.volando = false;
    this.choque = g;
    if (g?.punto) this.pos = [...g.punto];
    this.vel = [0, 0, 0];
  }

  /**
   * Un paso. Devuelve el choque de este paso, o `null`.
   *
   * `traza(desde, hasta)` es la del mundo y tiene que **ignorar al que
   * dispara** (`pev->owner == pOther->edict()` sale por la puerta de atrás,
   * giprojectile.cpp:126).
   */
  paso(dt, { traza = null } = {}) {
    this.vida += dt;
    if (!this.volando) { this.enElSuelo += dt; return null; }
    // 1. La gravedad primero.
    this.vel[1] -= this.gravedad * GRAVEDAD * dt;
    // 2. El movimiento, barrido.
    const antes = [...this.pos];
    const siguiente = [0, 1, 2].map((k) => antes[k] + this.vel[k] * dt);
    const g = traza ? traza(antes, siguiente) : null;
    if (g) { this._chocar(g); return g; }
    this.pos = siguiente;
    this.recorrido += Math.hypot(
      siguiente[0] - antes[0], siguiente[1] - antes[1], siguiente[2] - antes[2]);
    // 3. Y el rayo de 36 unidades del motor.
    return this._mirarAdelante(traza);
  }

  /**
   * ¿Toca quitarla ya?
   *
   * Dos relojes distintos, y el segundo es el del SCRIPT y no el del motor: una
   * flecha en el aire vive los `MSITEM_TIME_EXPIRE` de cualquier objeto, y una
   * clavada se va a los `ARROW_EXPIRE_DELAY` de su `projectile_landed` —cinco
   * segundos la gratis, diez la de madera—, contados **desde que se clava**.
   */
  get caducada() {
    return this.volando ? this.vida >= EXPIRA : this.enElSuelo >= this.expira;
  }
}
