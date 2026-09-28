// EL GOLPE DEL JUGADOR. La otra mitad del combate.
//
// Los bichos ya pegaban (`src/play/ia.js`); esto es lo que hace que su `hp`, su
// `ANIM_DEATH` y su `NPC_GIVE_EXP` signifiquen algo.
//
// Y no conoce Three ni Rapier a propósito, igual que `ia.js`: aquí está la
// REGLA —cuándo cae el golpe, a quién le da y cuánto duele— y quien tenga el
// mundo la ejecuta. Por eso se prueba en `node --test`.
//
// ── Lo que hay que saber antes de leerlo ──────────────────────────────────
//
// Un arma de Master Sword no es un número: es una lista de ATAQUES
// registrados, cada uno con su combinación de teclas, su prioridad y sus dos
// relojes. La espada oxidada registra dos —el mandoble normal (`+attack1`) y el
// cargado (`-attack1`, o sea AL SOLTAR)— y el puño registra tres, porque
// `base_kick` añade la patada.
//
//   `CGenericItem::RegisterAttack`  giattack.cpp:480   de dónde sale cada campo
//   `CGenericItem::StartAttack`     giattack.cpp:203   cuál se elige
//   `CGenericItem::Attack`          giattack.cpp:403   los dos relojes
//   `CGenericItem::StrikeLand`      giattack.cpp:736   el daño
//   `DoDamage( Damage, Hits )`      giattack.cpp:1532  a quién le da

/**
 * `VIEW_FIELD_NARROW` (util.h:178), y con dos avisos que cambian el juego:
 *
 *   1. **el cono es de YAW y no tiene techo.** `FInViewCone` hace el producto
 *      escalar en 2D — «making the view cone infinitely tall», combat.cpp:1152
 *      — así que mirando al suelo se le pega igual a lo que tengas delante, y
 *      un cono en 3D dejaría de acertar a nada que no esté a tu altura.
 *   2. **se mide desde el CENTRO del jugador**, no desde el ojo: el ojo es el
 *      origen del alcance, `pev->origin` el del cono.
 */
export const CONO = 0.7;

/** Los mismos 0,7 en grados, que es como se discute: ±45,57°. */
export const GRADOS_DEL_CONO = (Math.acos(CONO) * 180) / Math.PI;

/** `STATPROP_MAX_VALUE` (statdefs.h:76). Las tres propiedades van de 0 a 100. */
export const TOPE_PROPIEDAD = 100;

/**
 * El suelo de la fracción de potencia: `V_max(flDamageFraction, 0.001f)`.
 *
 * Y es el número más brutal de todo el combate. El daño de un arma se
 * MULTIPLICA por `potencia / 100`, y un personaje recién creado tiene **un
 * punto** de potencia (`CreateChar`, sv_character.cpp:44): o sea que la espada
 * oxidada de 90 a 140 de daño hace **0,9 a 1,4**. No es un error de lectura —
 * es el modelo de progresión del juego, y explica por qué una rata de 20 de
 * vida aguanta veinte mandobles al empezar.
 */
export const SUELO_DE_POTENCIA = 0.001;

/**
 * El CRÍTICO, que en Rebirth se ha comido a la puntería.
 *
 *     //always hit, reuse flAccuracyDefault as crit chance.
 *     float flHitPercentage = 100;                       giattack.cpp:770
 *     ...
 *     iAccuracyRoll = RANDOM_LONG(0,99);
 *     if( iAccuracyRoll < (100 - flHitPercentage) ) AttackHit = false;
 *     if( iAccuracyRoll > flCritThreshold ) flDamage *= flCritMutli;
 *
 * Dos consecuencias que no se ven en el script:
 *
 *   - el `hitchance` del arma —el 70 % de la espada— **ya no sirve para
 *     acertar**. El jugador acierta SIEMPRE. Portar el 70 % daría un arma que
 *     falla tres de cada diez veces sin que el motor lo haga.
 *   - el umbral es 95 con un dado de 0 a 99 y la comparación es `>`, así que
 *     el crítico sale con 96, 97, 98 y 99: **4 %, no 5 %.**
 *
 * Y el comentario del propio motor dice que reutiliza `flAccuracyDefault` como
 * probabilidad de crítico. **No lo hace**: el umbral sale de
 * `reg.attack.critthreshold`, y si no está, de este 95.
 */
export const CRITICO = { umbral: 95, multiplicador: 1.5 };

/**
 * Lo que pasa si blandes un arma para la que no tienes nivel (`bUnderleveled`).
 * El motor no te lo impide: te deja atacar peor.
 */
export const SIN_NIVEL = { acierto: 0.25, dano: 0.5 };

/**
 * De cuánto has aguantado el botón a cuánta CARGA llevas.
 *
 *     #define GET_CHARGE_FROM_TIME(a) (a + V_max(a - 1, 0) * .5)
 *                                              genericitem.h:99
 *
 * O sea que el primer nivel de carga —el `chargeamt 100%` del ataque cargado—
 * son **un segundo exacto**, y el segundo nivel (200 %) no son dos segundos
 * sino 1,67: la curva se acelera a partir del primero.
 */
export function cargaDe(segundos) {
  const t = Math.max(0, segundos);
  return t + Math.max(t - 1, 0) * 0.5;
}

/** Y al revés, que es lo que hace falta para pintar una barra de carga. */
export function segundosDeCarga(carga) {
  return carga <= 1 ? carga : (carga + 0.5) / 1.5;
}

/**
 * ── LA BARRA DE CARGA ──────────────────────────────────────────────────────
 *
 * `VGUI_Health::Update` (vgui_health.h:239-296), «MiB NOV2007a - Moar Charge
 * Colors!». Son DOS barras, una por mano, de `XRES(30)×YRES(6)`, y lo que
 * pintan no es la carga: es **cuánto te falta para el siguiente nivel**.
 *
 * El bucle del motor, con su cuenta de color dentro:
 *
 *     int vChargeLevel = 1, vChargeR = 0, vChargeG = 0, vChargeB = 0;
 *     while (notDone) {
 *       vChargeLevelAmt = GET_CHARGE_FROM_TIME(vChargeLevel);
 *       if (vCurChargeAmt <= vChargeLevelAmt) {
 *         notDone = false;
 *         ChargeBar.SetFGColorRGB(COLOR(vChargeR, vChargeG, vChargeB, 128));
 *         if (vChargeLevel != 1) { ...normalizar al tramo... }
 *       }
 *       vChargeR += 100;
 *       if (vChargeR > 255) { vChargeR -= 255; vChargeG += 100; ... }
 *       vChargeLevel++;
 *     }
 *
 * Cuatro cosas que no se ven leyéndolo por encima:
 *
 * **Los niveles caen en segundos enteros**, y es por casualidad buena: el mismo
 * `GET_CHARGE_FROM_TIME` se aplica a los dos lados —a los segundos aguantados
 * para sacar la carga, y al número de nivel para sacar su umbral— así que el
 * nivel 2 está en 2,5 de carga, que son 2 s justos. Uno por segundo.
 *
 * **El nivel 1 se pinta NEGRO.** El color se elige ANTES de sumarle los 100,
 * así que el primer tramo sale con (0, 0, 0, 128) sobre un fondo gris. Se ve
 * como una barra que se vacía de gris, no como una que se llena.
 *
 * **Y al desbordar, el canal VUELVE ATRÁS**: al pasar de 255 se RESTA 255 en
 * vez de saturar, así que el rojo va 0, 100, 200, **45**, 145, 245, **90**… y
 * la barra se oscurece justo al subir de nivel. Es una rueda, no una escala, y
 * sin repetirse: en cuarenta niveles no vuelve a salir el mismo color.
 *
 * **El número de la etiqueta va uno por debajo del nivel** (`vDisplayChargeLevel
 * = vCurChargeLevel - 1`), y en el primero no pone nada: un espacio. Así que
 * cuando la barra pone «1» vas por el segundo nivel de carga.
 *
 * Devuelve `{ nivel, fraccion, rgb, etiqueta, mostrado }`.
 */
export function nivelDeCarga(carga) {
  const c = Math.max(0, carga ?? 0);
  let nivel = 1, r = 0, g = 0, b = 0;
  // Un tope de seguridad que el motor no tiene: su `while` sólo sale por la
  // condición, y con una carga absurda daría vueltas hasta desbordar. Con 64
  // niveles son 64 segundos aguantando el botón, que no pasa jugando.
  for (let vuelta = 0; vuelta < 64; vuelta++) {
    const umbral = cargaDe(nivel);
    let rgb = null, fraccion = c;
    if (c <= umbral) {
      rgb = [r, g, b];
      if (nivel !== 1) {
        const piso = cargaDe(nivel - 1);
        fraccion = (c - piso) / (umbral - piso);
      }
      // `vCurChargeLevel = (int)((vChargeLevel - 1) + vCurChargeAmt)`, con
      // `vChargeLevel` ya incrementado. O sea: el nivel, salvo cuando la
      // fracción vale 1 exacto y sube uno — que pasa con la carga clavada en
      // el umbral, y es el fotograma en el que suena.
      const cual = Math.trunc(nivel + fraccion);
      const mostrado = cual - 1;
      return {
        nivel: cual,
        fraccion,
        rgb,
        mostrado,
        // `ChargeLbl.setText(" ")` cuando el número es cero: un espacio, no
        // una etiqueta escondida. La caja sigue ahí.
        etiqueta: mostrado ? String(mostrado) : " ",
      };
    }
    r += 100;
    if (r > 255) { r -= 255; g += 100; if (g > 255) { g -= 255; b += 100; if (b > 255) b -= 255; } }
    nivel++;
  }
  return { nivel, fraccion: 1, rgb: [r, g, b], mostrado: nivel - 1, etiqueta: String(nivel - 1) };
}

/**
 * El sonido de la barra: `ms_chargebar_sound` = `magic/chargebar_alt1.wav`, a
 * `ms_chargebar_volume` = **15** (clientlibrary.cpp:149-151). Quince sobre una
 * API que toma de 0 a 1, así que la perilla no sirve para nada por encima de
 * uno: suena a todo volumen y ya.
 *
 * Suena **al subir de nivel**:
 *
 *     if (vCurChargeLevel > mCurChargeLevel) PlayHUDSound(...);
 *     mCurChargeLevel = vCurChargeLevel;              vgui_health.h:285-288
 *
 * `mCurChargeLevel` es un campo del panel, arranca en **1** y **no se pone a
 * cero al soltar** — sólo se toca dentro del `if` de «estoy cargando». Parece
 * que eso deba dejar muda la segunda carga de una pelea, y la primera versión
 * de esto lo portó así y lo escribió como un fallo. **No lo es**: la segunda
 * carga empieza en cero, o sea en el nivel 1, y en ese primer fotograma la
 * asignación de abajo devuelve el campo a 1. Lo que el campo guarda es el
 * nivel del fotograma anterior, no un máximo histórico.
 *
 * Lo que sí hace el arranque en 1 es que **el nivel 1 no suena nunca**, que es
 * lo coherente: no hay nada que celebrar en empezar a cargar.
 */
export class VozDeLaCarga {
  constructor() { this.nivelMaximo = 1; }

  /** Devuelve el archivo si toca sonar, o null. */
  paso(carga) {
    // Con la carga a cero no se entra al `if` del motor, así que **no se
    // asigna nada**: el campo se queda con el último nivel. Soltar no lo
    // reinicia, y es la parte que parece un fallo y no lo es.
    if (!(carga > 0)) return null;      // `Attack_IsCharging() && Charge() > 0`
    const { nivel } = nivelDeCarga(carga);
    const suena = nivel > this.nivelMaximo;
    this.nivelMaximo = nivel;           // asignación incondicional, como el motor
    return suena ? SONIDO_DE_CARGA : null;
  }
}

/** El wav, que sí está en el mod: `sound/magic/chargebar_alt1.wav`. */
export const SONIDO_DE_CARGA = "magic/chargebar_alt1.wav";

// La GEOMETRÍA de las dos barras —y su errata de precedencia— no está aquí:
// vive en `cargaEn()` de `src/play/hud.js` desde el 24, que es donde está el
// resto del reparto de la pantalla. Aquí sólo el nivel, el color y la voz.

/** La fracción de daño que sale de la POTENCIA del personaje, con su suelo. */
export function fraccionDePotencia(potencia) {
  return Math.max((potencia ?? 0) / TOPE_PROPIEDAD, SUELO_DE_POTENCIA);
}

/**
 * EL DAÑO DE UN GOLPE, en el orden del motor.
 *
 *     randomMulti = RANDOM_LONG( 0, flDamageRange )      <- ENTERO, no decimal
 *     flDamage    = flDamage + randomMulti
 *     flDamage   *= max( potencia / 100, 0.001 )
 *     si sin nivel: *= 0.5
 *     si crítico:   *= 1.5
 *
 * Tres cosas que se pierden si uno lo escribe «como tiene sentido»:
 *
 *   - el dado del rango de daño es de ENTEROS (`RANDOM_LONG`), así que la
 *     espada da 90, 91… 140 y nunca 90,5.
 *   - la BALANZA no entra. El motor calcula `flDamageFraction` con ella y
 *     **acto seguido la sobreescribe con la potencia** (giattack.cpp:509-521):
 *     dos líneas más abajo el valor de la balanza está tirado. O sea que en
 *     Rebirth la puntería no hace nada y la balanza tampoco: sólo la potencia.
 *   - el crítico multiplica DESPUÉS de la potencia, no antes.
 */
export function danoDelGolpe(ataque, {
  potencia = 0, azar = Math.random, sinNivel = false, multiplicadorDeCarga = 1,
} = {}) {
  // El multiplicador del cargado va SÓLO en el daño base y no en el rango: la
  // base hace `multiply reg.attack.dmg BWEAPON_DBL_CHARGE_ADJ` y no toca
  // `reg.attack.dmg.range`. Multiplicar los dos hincha el cargado un 50 % en la
  // espada oxidada, y nadie lo notaría.
  const base = (ataque?.dano ?? 0) * (multiplicadorDeCarga || 1);
  const rango = Math.max(0, Math.round(ataque?.danoRango ?? 0));
  // `RANDOM_LONG(0, n)` incluye los dos extremos: son n+1 resultados.
  const dado = rango ? Math.floor(azar() * (rango + 1)) : 0;
  let dano = (base + dado) * fraccionDePotencia(potencia);
  if (sinNivel) dano *= SIN_NIVEL.dano;
  const tirada = Math.floor(azar() * 100);
  const critico = tirada > CRITICO.umbral;
  if (critico) dano *= CRITICO.multiplicador;
  return { dano, critico, tirada };
}

/**
 * ¿Está ese punto en el cono de ataque? Dos dimensiones, como el motor.
 *
 * `yaw` en radianes y con el eje de la escena: con yaw 0 se mira a −Z, que es
 * lo que hace la cámara de este proyecto. El motor mira a +X con su yaw 0, así
 * que el cambio va aquí y no en el dato.
 */
export function dentroDelCono(desde, mirando, punto, cono = CONO) {
  const dx = punto[0] - desde[0], dz = punto[2] - desde[2];
  const d = Math.hypot(dx, dz);
  if (!(d > 0)) return true;
  const m = Math.hypot(mirando[0], mirando[2]);
  if (!(m > 0)) return false;
  return (dx * mirando[0] + dz * mirando[2]) / (d * m) > cono;
}

/**
 * A QUIÉN LE DA, y esto no es un rayo.
 *
 * Es lo que más me habría costado adivinar: un mandoble de Master Sword **no
 * traza una línea**. `DoDamage` busca en una ESFERA de radio `reg.attack.range`
 * alrededor del punto de salida, y de lo que encuentra se queda con **uno
 * solo**, el más cercano:
 *
 *     while( (pTarget = UTIL_FindEntityInSphere(pTarget, vecSrc, flRange)) )
 *       ...
 *       UTIL_TraceLine( vecSrc, pTarget->Center(), ignore_monsters, ... );
 *       if( tr.flFraction < 1.0f ) continue;              <- pared en medio
 *       if( FInViewCone(tr.vecEndPos, VIEW_FIELD_NARROW) )
 *         if( !Hits.size() || Hits[0].Dist > dist ) ...   <- el más cercano
 *                                              giattack.cpp:1547-1580
 *
 * Y sólo si NO encuentra a nadie traza la línea de verdad, para dar contra el
 * mundo — que es de dónde sale el `hitwall`.
 *
 * La diferencia con un rayo se nota jugando: con la esfera le pegas a un goblin
 * que tengas pegado al hombro y no exactamente en la cruceta, y en cambio NO le
 * pegas a dos a la vez ni al de detrás.
 *
 *   `desde`      el punto de salida, en UNIDADES (ojo + `ofs.startpos`)
 *   `centro`     el del jugador, para el cono — que se mide desde ahí
 *   `mirando`    el vector de la vista, en la escena
 *   `candidatos` `{ id, centro: [x,y,z] en unidades, vivo }`
 *   `libre`      `(desde, hasta) => bool`, la traza que IGNORA monstruos
 */
export function elegirObjetivo({
  desde, centro = desde, mirando, alcance = 0, candidatos = [],
  libre = () => true, cono = CONO,
} = {}) {
  let mejor = null;
  for (const c of candidatos) {
    if (!c || c.vivo === false) continue;
    const p = c.centro;
    const dist = Math.hypot(p[0] - desde[0], p[1] - desde[1], p[2] - desde[2]);
    if (dist > alcance) continue;
    if (!libre(desde, p)) continue;
    if (!dentroDelCono(centro, mirando, p, cono)) continue;
    if (!mejor || dist < mejor.distancia) mejor = { objetivo: c, distancia: dist };
  }
  return mejor;
}

/**
 * LA EXPERIENCIA DE UNA MUERTE, que no se da al golpear.
 *
 * El motor va sumando en el monstruo cuánto daño le ha hecho cada jugador **y
 * con qué propiedad**, y sólo al morir reparte:
 *
 *     mult = min( 1, m_MaxHP / dmgInTotal )               <- por pasarse
 *     xp   = redondear( m_SkillLevel * (dmg * mult) / MaxHP )
 *                                        msmonsterserver.cpp:2500-2510
 *
 * Tres detalles:
 *
 *   - `mult` castiga el EXCESO: matar a un bicho de 20 de vida haciéndole 200
 *     de daño da la experiencia de 20, no de 200.
 *   - el redondeo es **por cubo** y a la mitad hacia arriba, y los cubos son
 *     (habilidad × propiedad). Como la propiedad de cada golpe se sorteja
 *     (`RANDOM_LONG(0, subStats-1)`, msmonstershared.cpp:620), repartir el daño
 *     entre las tres propiedades **pierde experiencia** en los redondeos.
 *   - matándolo tú solo con un arma, la suma sale exactamente `NPC_GIVE_EXP`.
 */
export function expDeLaMuerte({ nivel = 0, vidaMaxima = 0, porCubo = {} } = {}) {
  const total = Object.values(porCubo).reduce((a, b) => a + b, 0);
  if (!(nivel > 0) || !(vidaMaxima > 0) || !(total > 0)) return {};
  const mult = Math.min(1, vidaMaxima / total);
  const out = {};
  for (const [cubo, dano] of Object.entries(porCubo)) {
    if (!(dano > 0)) continue;
    const xp = (nivel * (dano * mult)) / vidaMaxima;
    out[cubo] = xp - Math.floor(xp) >= 0.5 ? Math.ceil(xp) : Math.floor(xp);
  }
  return out;
}

/** En qué anda el brazo. `TENSANDO` es sólo del arco. */
export const FASE = { QUIETO: "quieto", BLANDIENDO: "blandiendo", TENSANDO: "tensando" };

/**
 * EL BRAZO: la máquina de estados de un arma en la mano.
 *
 * Se le da el botón pulsado o no en cada paso y contesta qué ha pasado. Los dos
 * relojes son los del motor y **no son uno**:
 *
 *     delay.strike  cuándo DUELE     (0,6 s en la espada oxidada)
 *     delay.end     cuándo ACABA     (1,1 s)
 *
 * O sea que el daño cae por la mitad del movimiento. Colapsarlos en uno da un
 * arma que hace daño en el fotograma del clic, que se juega como una pistola.
 *
 * ── La carga, que es la regla que nadie adivina ───────────────────────────
 *
 * En Master Sword el ataque cargado **no se hace aguantando el botón desde el
 * principio**. El reloj de carga sólo arranca si al pulsar YA estabas
 * atacando:
 *
 *     if( ((CurrentAttack && !CurrentAttack->flChargeAmt) || ms_autocharge==1)
 *         && !m_TimeChargeStart && GetHighestAttackCharge() )
 *       m_TimeChargeStart = gpGlobals->time;
 *                                            genericitem.cpp:735-741
 *
 * Así que la secuencia es: clic (mandoble) → **segundo clic mientras el primero
 * corre**, y aguantar un segundo → soltar → mandoble cargado. El primer clic no
 * carga nunca. Con `ms_autocharge 1` sí, y por eso existe la opción.
 */
export class Brazo {
  constructor(arma, { azar = Math.random, autocarga = false } = {}) {
    this.arma = arma ?? null;
    this.azar = azar;
    this.autocarga = autocarga;
    /**
     * Los ataques que se pueden usar, con el de más prioridad primero.
     *
     * Los dos tipos que sabe hacer este brazo: el mandoble y el tiro. El tercero
     * del motor —`hold-strike`— no está aquí porque es el escudo, y vive en
     * `escudo.js`.
     *
     * Y un arco registra **dos ataques idénticos**, que no es un error de
     * lectura: `base_ranged` pone los `local reg.attack.*` y llama a
     * `registerattack`, y `bows_base` —que lo incluye— vuelve a llamarlo en su
     * propio `weapon_spawn` con los mismos valores todavía puestos. El script lo
     * sabe: su `skill_check` toca `attackprop ent_me 0` y `attackprop ent_me 1`.
     * Para el motor son dos ataques con la misma prioridad, o sea que
     * `StartAttack` **tira una moneda** entre dos clones.
     */
    this.ataques = (arma?.ataques ?? [])
      .filter((a) => a?.tipo === "strike-land" || a?.tipo === "charge-throw-projectile");
    /** ¿Es un arco? Lo decide el tipo del primer ataque, como el motor. */
    this.esDeTiro = this.ataques[0]?.tipo === "charge-throw-projectile";
    this.multiplicadorDeCarga = arma?.multiplicadorDeCarga ?? 2;
    this.fase = FASE.QUIETO;
    this.ataque = null;
    this.t = 0;
    this.golpeDado = false;
    this.pulsadoAntes = false;
    this.cargando = 0;
    this.cargaHecha = 0;
    /** Sólo del arco: se soltó el botón antes del mínimo y la suelta espera. */
    this.sueltaPendiente = false;
    /** Cuál de las animaciones de ataque tocó, que el arma tiene varias. */
    this.animacion = null;
  }

  /**
   * ¿Está atacando? Es lo que corta el trote: `PLAYER_MOVE_ATTACKING`, que el
   * motor pone en `StartAttack` y quita en `CancelAttack`. Tensar un arco cuenta:
   * no se puede correr con la cuerda tirada.
   */
  get atacando() { return this.fase !== FASE.QUIETO; }

  /** La carga que llevaría si soltara ahora, en tanto por uno. */
  get carga() { return this.cargando > 0 ? cargaDe(this.cargando) : 0; }

  /**
   * El ataque que toca, con las reglas de `StartAttack`:
   *
   *   - `+attack1` sólo con el botón PULSADO, `-attack1` sólo SOLTADO
   *   - un ataque con carga sólo si hay carga hecha y llega al mínimo
   *   - uno sin carga sólo si NO hay carga hecha
   *   - gana la prioridad más alta, y a igual prioridad **se sortea**
   *   - si te falta destreza para él, se salta (menos el primero)
   */
  elegir({ pulsado, destreza = 0 }) {
    let elegido = null, porFallback = false;
    // «Estoy en medio de una carga» es el reloj CORRIENDO o la carga guardada,
    // las dos cosas: `if( m_TimeChargeStart || m_LastChargedAmt )`.
    const cargando = this.cargando > 0 || this.cargaHecha > 0;
    for (let i = 0; i < this.ataques.length; i++) {
      const a = this.ataques[i];
      const suelta = a.teclas?.includes("-attack1");
      const mantiene = a.teclas?.includes("+attack1");
      if (suelta && pulsado) continue;
      if (mantiene && !pulsado) continue;
      if (cargando) {
        // Mientras cargas NO se hace el ataque normal — si no, aguantar el botón
        // sería dar mandobles y cargar a la vez.
        if (!a.carga) continue;
        // Y si lo cargado no llega a lo que pide este ataque, el motor no se
        // queda quieto: **usa el ataque 0 y tira la carga** (`iNewAttack = -2`,
        // MiB MAR2012_07). Es la salida de emergencia, y sin ella hay un
        // BLOQUEO de verdad: con una carga guardada que no llega —o que llega
        // pero para la que no tienes destreza— ningún ataque cumple las
        // condiciones y el brazo se queda muerto para siempre. Lo medí: 120
        // segundos aguantando el botón, cero mandobles, y ni un error.
        if (this.cargaHecha < a.carga) {
          if (!elegido) { elegido = this.ataques[0]; porFallback = true; }
          continue;
        }
      } else if (a.carga) continue;
      if (a.pideHabilidad > 0 && destreza < a.pideHabilidad && i > 0) continue;
      if (elegido && !porFallback) {
        if ((a.prioridad ?? 0) < (elegido.prioridad ?? 0)) continue;
        // A igual prioridad, el motor tira una moneda: `!RANDOM_LONG(0,1)`.
        if ((a.prioridad ?? 0) === (elegido.prioridad ?? 0) && this.azar() < 0.5) continue;
      }
      elegido = a;
      porFallback = false;
    }
    return { ataque: elegido, porFallback };
  }

  /**
   * Un paso. Devuelve lo que ha ocurrido, que es lo que ejecuta quien llama:
   *
   *     empieza   el ataque que arranca en este paso (y su animación)
   *     golpe     el ataque cuyo daño cae en ESTE paso — uno por ataque
   *     acaba     verdadero el paso en que termina
   */
  tic(dt, { pulsado = false, destreza = 0 } = {}) {
    if (this.esDeTiro) return this.ticDelTiro(dt, { pulsado, destreza });
    const out = { empieza: null, golpe: null, acaba: false, fase: this.fase };
    const pulsaAhora = pulsado && !this.pulsadoAntes;

    // 1. `ActivateButtonDown`: la carga arranca al pulsar **estando ya
    //    atacando** (o con `ms_autocharge 1`).
    if (pulsaAhora && !this.cargando &&
        ((this.atacando && !this.ataque?.carga) || this.autocarga) &&
        this.ataques.some((a) => a.carga > 0)) {
      this.cargando = 1e-9; // arranca el reloj sin darle tiempo todavía
    }
    // 2. `ActivateButtonUp`, y va con el botón ARRIBA, **no en el flanco**:
    //
    //        if( ButtonsDown & iActivateButton ) ActivateButtonDown();
    //        else ActivateButtonUp();          <- cada fotograma
    //        ...
    //        void ActivateButtonUp() {
    //          m_LastChargedAmt = Attack_Charge();   // 0 si no se cargaba
    //          m_TimeChargeStart = 0;
    //        }                                  genericitem.cpp:747-752
    //
    // O sea que **la carga guardada dura UN fotograma**: al siguiente, con el
    // botón todavía arriba, se recalcula desde un reloj que ya vale cero y se
    // queda en cero. Escribirlo como un flanco —que es lo natural— guarda la
    // carga para siempre y deja el ataque cargado disponible minutos después.
    if (!pulsado) {
      this.cargaHecha = this.carga;
      this.cargando = 0;
    } else if (this.cargando > 0) {
      this.cargando += dt;
    }

    // 3. `StartAttack()` primero, `Attack()` después: es el ORDEN del motor
    //    (genericitem.cpp:1490) y no da lo mismo. Con el orden al revés, el
    //    fotograma en que acaba un mandoble empieza ya el siguiente, y la
    //    cadencia sale un fotograma más rápida de lo que el juego permite.
    //    Así, el ataque que termina deja el hueco y el siguiente arranca en el
    //    paso de después.
    if (this.fase === FASE.QUIETO) {
      const { ataque: a, porFallback } = this.elegir({ pulsado, destreza });
      if (a) {
        // La salida de emergencia del motor tira el reloj de carga.
        if (porFallback) this.cargando = 0;
        this.ataque = a;
        this.fase = FASE.BLANDIENDO;
        this.t = 0;
        this.golpeDado = false;
        this.cargaHecha = 0; // se limpia al elegir, como en el motor
        const anims = this.arma?.animaciones?.ataque ?? [];
        this.animacion = anims.length
          ? anims[Math.floor(this.azar() * anims.length)] : null;
        out.empieza = a;
        out.animacion = this.animacion;
      }
    }

    // 4. Y `Attack()`: el reloj de fin antes que el del golpe, como el motor.
    //    El ataque que acaba de arrancar en este mismo paso no avanza, porque
    //    en el motor `tStart` es el instante de ahora.
    if (this.fase === FASE.BLANDIENDO && !out.empieza) {
      this.t += dt;
      if (this.t >= (this.ataque?.duracion ?? 0)) {
        this.fase = FASE.QUIETO;
        this.ataque = null;
        this.animacion = null;
        out.acaba = true;
      } else if (!this.golpeDado && this.t >= (this.ataque?.retardo ?? 0)) {
        this.golpeDado = true;
        out.golpe = this.ataque;
      }
    }

    this.pulsadoAntes = pulsado;
    out.fase = this.fase;
    return out;
  }

  /**
   * EL ARCO, que es otra máquina y no el mandoble con otro número.
   *
   * Cuatro reglas, y ninguna es la que uno escribiría solo:
   *
   *   1. **Mientras aguantas el botón no pasa nada**: no hay cadencia, no hay
   *      tope de tiempo y no se dispara. `Attack()` pone `fCanCancel = false` y
   *      `fCanLandAttack = false` en cada fotograma con el botón abajo
   *      (giattack.cpp:429-433), o sea que el ataque no caduca ni cae.
   *   2. **Al soltar se dispara, pero no antes del mínimo.** La suelta la manda
   *      el cliente y sólo si `time >= tTrueStart + tProjMinHold`
   *      (genericitem.cpp:760), y como esa comprobación corre en cada fotograma
   *      con el botón arriba, soltar pronto **deja la suelta pendiente**: sale
   *      sola al llegar al mínimo. Un clic seco dispara 1,1 s después.
   *   3. **La fuerza y el cono salen de lo que se aguantó**, con el mínimo como
   *      suelo: el 85 % de un clic, el 100 % a 1,3 s. Ver `proyectil.js`.
   *   4. **El reloj de fin no se reinicia al soltar.** El motor sólo pone
   *      `tStart = ahora` dentro del `if (… && !fAttackReleased)`, y en el
   *      fotograma de la suelta esa bandera **ya está puesta** (la pone
   *      `StartAttack`, giattack.cpp:231, que corre antes que `Attack`). O sea
   *      que `RANGED_POSTFIRE_DELAY` se mide desde que empezaste a tensar, y si
   *      tensaste más que él —siempre, con 1,1 contra 0,3— **no retrasa nada**:
   *      el arco vuelve a estar libre el fotograma siguiente al tiro.
   *
   * Devuelve `tira` en el paso del disparo, con lo que se aguantó.
   */
  ticDelTiro(dt, { pulsado = false, destreza = 0 } = {}) {
    const out = { empieza: null, golpe: null, tira: null, acaba: false, fase: this.fase };
    const a = this.ataques[0] ?? null;
    const minimo = a?.sostener?.[0] ?? 0;

    if (this.fase === FASE.QUIETO) {
      if (!pulsado) { this.pulsadoAntes = pulsado; out.fase = this.fase; return out; }
      // `CheckKeys` con `+attack1`: basta con tenerlo abajo. No es el flanco, y
      // por eso tras un tiro con el botón todavía pulsado arranca otro tensado.
      if (a?.pideHabilidad > 0 && destreza < a.pideHabilidad) {
        // Igual que en el mandoble: el motor no lo impide, sólo deja tirar peor
        // (y es el ataque 0, así que el `i > 0` no lo salva). Aquí se deja pasar.
      }
      this.ataque = a;
      this.fase = FASE.TENSANDO;
      this.t = 0;
      this.golpeDado = false;
      this.sueltaPendiente = false;
      out.empieza = a;
      this.pulsadoAntes = pulsado;
      out.fase = this.fase;
      return out;
    }

    if (this.fase === FASE.TENSANDO) {
      this.t += dt;
      if (!pulsado) this.sueltaPendiente = true;
      if (this.sueltaPendiente && this.t >= minimo) {
        out.tira = this.ataque;
        out.sostenido = this.t;
        this.fase = FASE.BLANDIENDO;
        this.golpeDado = true;
      }
      this.pulsadoAntes = pulsado;
      out.fase = this.fase;
      return out;
    }

    // Y el rabo del ataque, con el reloj corriendo desde que se empezó a tensar.
    this.t += dt;
    if (this.t >= (this.ataque?.duracion ?? 0)) {
      this.fase = FASE.QUIETO;
      this.ataque = null;
      this.sueltaPendiente = false;
      out.acaba = true;
    }
    this.pulsadoAntes = pulsado;
    out.fase = this.fase;
    return out;
  }

  /** Lo tensado que está el arco ahora, en tanto por uno. Para pintar la barra. */
  get tensado() {
    if (!this.esDeTiro || this.fase !== FASE.TENSANDO) return 0;
    const max = this.ataque?.sostener?.[1] ?? 0;
    return max > 0 ? Math.min(this.t / max, 1) : 0;
  }

  /** El aguante que se lleva un ataque. No hace falta tenerlo: se queda en 0. */
  aguanteDe(ataque) {
    const base = ataque?.aguante ?? 0;
    return ataque?.carga ? base * (this.multiplicadorDeCarga || 1) : base;
  }

  /** El daño de un golpe de este brazo, con la potencia del personaje. */
  dano(ataque, { potencia = 0, sinNivel = false } = {}) {
    return danoDelGolpe(ataque, {
      potencia, azar: this.azar, sinNivel,
      multiplicadorDeCarga: ataque?.carga ? (this.multiplicadorDeCarga || 1) : 1,
    });
  }
}
