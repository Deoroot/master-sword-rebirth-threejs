// EL ESCUDO — la otra mitad de defenderse, y no es el parry.
//
// Conviene decirlo primero porque yo empecé suponiendo lo contrario: **el escudo
// no mejora el parry, es otro sistema**, con otras tiradas, otro momento y otra
// forma de fallar. Viven los dos en el mismo golpe y en este orden
// (`CBasePlayer::TraceAttack`, player.cpp:403-414):
//
//     for( i ) Gear[i]->OwnerTakeDamage(Damage);      <- la armadura y el ESCUDO
//     if( Damage.flDamage <= 0 ) Damage.flDamage = 0;
//     Damage.flDamage = CMSMonster::TraceAttack(Damage);   <- el PARRY del motor
//
// O sea que el escudo llega antes y el parry se come lo que quede. Y como el
// parry del motor no para el daño 0 («do not parry 0 damage atks»), un escudo que
// anule el golpe deja al parry sin nada que hacer: nunca se ven los dos.
//
// Lo único que el escudo le presta al parry es un MULTIPLICADOR —`PARRY_MULTI`—,
// y eso pasa en otro sitio y en otro momento: al cambiar de arma, en
// `update_parry`. Está en `parry.js`, que es donde le toca.
//
// ── Dónde vive la regla ───────────────────────────────────────────────────
//
// Entera en `game_takedamage` de `items/shields_base.script:171-279`. No hay una
// línea de C++ del escudo: el motor sólo le pasa el golpe a cada cosa que llevas
// puesta y deja que el script lo cambie con `setdmg`.
//
// ── Las dos posturas, que no son «mejor» y «peor» ─────────────────────────
//
//   ARRIBA (aguantando el botón). `BLOCK_CHANCE_UP` de bloquear, y bloquear NO
//          es anular: pasa `DMG_BLOCK_UP` del daño. En el escudo de
//          entrenamiento es 100 % de bloqueo y pasa el 40 %.
//   ABAJO  (sólo llevándolo en la mano). `BLOCK_CHANCE_DOWN` —15 %— de anular
//          **todo** el golpe, y si no, entra entero.
//
// Cuentas: arriba te llevas 0,40 del daño; abajo, 0,85. Arriba es mejor, pero no
// tres veces mejor, y lo que de verdad cuesta es que no puedes atacar mientras lo
// aguantas (`IsShielding()` bloquea el ataque de la OTRA mano, giattack.cpp:235).
//
// ── Y el cono, que es el fallo gordo de todo esto ──────────────────────────
//
// El escudo sólo para lo que venga de frente, y el script pide un cono de 175
// grados —o sea, casi todo menos la espalda—. Lo que el motor calcula es otra
// cosa (`ScriptGetter_Cone`, script.cpp:745):
//
//     float ConeFOV = cosf( atof(Params[3]) / 2.0f );
//
// `cosf` quiere RADIANES y el script escribe GRADOS. `cos(87,5 rad)` = 0,894, y
// eso es un umbral de producto escalar altísimo: el cono de 175° declarado es un
// cono real de **53,2°**. Hay que estar mirando al que pega con ±26,6 grados.
//
// Y no es un error que empequeñezca siempre, porque el coseno es cíclico: los
// 30° del escudo de fuego salen 278,9° —casi todo el círculo— y los 100° que
// usan otros scripts salen 30,5°. **Declarar un número mayor puede dar un cono
// más pequeño.** Lo usan 48 ficheros con ángulos de 1 a 175, y ninguno mide lo
// que dice.
//
// Portado con el fallo, como todo lo demás, y con prueba.

import { parryDelJugador } from "./parry.js";
import { golpeContraLaArmadura } from "./armadura.js";

/** Lo que el script del escudo pide: «Attack must come from in front of player». */
export const CONO_DEL_ESCUDO = 175;

/**
 * El umbral de producto escalar que sale de un ángulo declarado, **con el fallo
 * de las unidades**. Es la función del motor tal cual.
 */
export function conoDelMotor(grados) {
  return Math.cos(Number(grados) / 2);
}

/** Y el semiángulo real que eso significa, para poder decirlo en grados. */
export function semianguloReal(grados) {
  const u = conoDelMotor(grados);
  if (u >= 1) return 0;
  if (u <= -1) return 180;
  return (Math.acos(u) * 180) / Math.PI;
}

/**
 * ¿Viene el golpe de frente? `$within_cone2D(atacante, yo, misAngulos, grados)`.
 *
 * Dos dimensiones quiere decir que **la altura no cuenta**: se ponen a cero la z
 * del vector y la del «adelante». Un golpe desde arriba se bloquea igual.
 *
 * `mirando` es el vector adelante del jugador, y basta con su x y su z porque la
 * y se tira. Los puntos van en las coordenadas que sean, mientras sean las
 * mismas: esto sólo normaliza y multiplica.
 */
export function dentroDelCono2D(atacante, yo, mirando, grados = CONO_DEL_ESCUDO) {
  const dx = atacante[0] - yo[0];
  const dz = atacante[2] - yo[2];
  const d = Math.hypot(dx, dz);
  const m = Math.hypot(mirando[0], mirando[2]);
  // `Normalize()` de un vector de longitud cero devuelve el propio vector, así
  // que el producto sale 0 y no pasa el umbral. Con el atacante justo encima, el
  // escudo no bloquea.
  if (!(d > 0) || !(m > 0)) return false;
  const punto = (dx * mirando[0] + dz * mirando[2]) / (d * m);
  return punto >= conoDelMotor(grados);
}

/**
 * Los tipos de daño que el escudo NO bloquea, y son muchos menos de los que el
 * comentario del script promete:
 *
 *     //if ( PARAM4 startswith cold ) local CANT_BLOCK 1
 *     //if ( PARAM4 startswith fire ) local CANT_BLOCK 1
 *     //if ( PARAM4 startswith poison ) local CANT_BLOCK 1
 *     if ( PARAM4 startswith target ) local CANT_BLOCK 1
 *     if ( PARAM4 contains effect ) local CANT_BLOCK 1
 *
 * Frío, fuego y veneno están COMENTADOS: un escudo de madera para una bola de
 * fuego. El propio autor explica por qué los dejó ahí —«This is pointless as
 * DMG_TYPE is not working (PARAM4 always empty)»— y ese comentario es la pista de
 * algo que importa más: el tipo de daño llega **vacío** casi siempre, y un tipo
 * vacío no cumple ninguna de las dos exclusiones, así que **el escudo lo bloquea
 * todo**.
 *
 * Es justo al revés que el parry del script, donde un tipo vacío es imparable
 * (ver `parry.js`). El mismo hueco, dos reglas, resultados opuestos.
 */
export const NO_BLOQUEA = { prefijos: ["target"], contiene: ["effect"] };

const dado = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

/** Las posturas, que es lo que decide qué tirada se hace. */
export const POSTURA = { ARRIBA: "arriba", ABAJO: "abajo", GUARDADO: "guardado" };

/**
 * EL BLOQUEO. `game_takedamage` de `shields_base.script`, en su orden.
 *
 * Devuelve lo que hay que HACER, no lo que pasó: el daño que queda, si suena el
 * golpe en el escudo, si hay que bajar la animación y el mensaje al jugador.
 *
 * `ficha` es el bloque `escudo` que saca el lector. Los dados se pueden fijar
 * (`dados.arriba`, `dados.abajo`) para poder medir.
 */
export function bloqueoDelEscudo({
  ficha = null, postura = POSTURA.GUARDADO, dano = 0, tipo = "",
  desplegado = true, deFrente = true, esElPropio = false, dados = {},
} = {}) {
  const nada = (porque) => ({ bloquea: false, dano, porque, suena: false, baja: false, mensaje: null });
  if (!ficha) return nada("sin escudo");
  // `if IS_DEPLOYED` — un escudo colgado a la espalda no bloquea nada. Es la
  // primera línea del evento y se la salta muy fácil al portarlo.
  if (!desplegado) return nada("guardado");
  if (postura === POSTURA.GUARDADO) return nada("guardado");
  const t = String(tipo ?? "").toLowerCase();
  if (NO_BLOQUEA.prefijos.some((p) => t.startsWith(p))) return nada(`tipo ${t}`);
  if (NO_BLOQUEA.contiene.some((c) => t.includes(c))) return nada(`tipo ${t}`);
  // «don't freeze self shielding from effects»: lo tuyo no lo paras.
  if (esElPropio) return nada("es mío");
  if (!deFrente) return nada("no viene de frente");

  if (postura === POSTURA.ARRIBA) {
    const tirada = dados.arriba ?? dado(1, 100);
    if (!(tirada <= (ficha.bloqueoArriba ?? 0))) {
      return { ...nada("la tirada de arriba no llega"), tirada };
    }
    // Bloquear con el escudo arriba NO anula: deja pasar `DMG_BLOCK_UP`.
    return {
      bloquea: true, arriba: true, tirada,
      dano: dano * (ficha.danoQuePasa ?? 1),
      // `shield_deflect` suena siempre, y baja la animación sólo si NO estás
      // aguantando — que con el escudo arriba no es el caso.
      suena: true, baja: false, mensaje: null, porque: "bloqueo con el escudo arriba",
    };
  }

  // Abajo: hace falta llevarlo en la mano (`if game.item.wielded`) y la tirada
  // anula el golpe ENTERO. Y el mensaje sólo sale si había daño que anular.
  const tirada = dados.abajo ?? dado(1, 100);
  if (!(tirada <= (ficha.bloqueoAbajo ?? 0))) {
    return { ...nada("la tirada de abajo no llega"), tirada };
  }
  return {
    bloquea: true, arriba: false, tirada, dano: 0, acierto: false,
    suena: true, baja: true,
    mensaje: dano > 0 ? "Deflected!" : null,
    porque: "desvío con el escudo abajo",
  };
}

/**
 * Lo que te llevas de media con cada postura, para poder comparar sin medir. Es
 * la cuenta cerrada de la regla de arriba.
 */
export function danoEsperado(ficha, postura) {
  if (!ficha) return 1;
  if (postura === POSTURA.ARRIBA) {
    const p = Math.min(100, Math.max(0, ficha.bloqueoArriba ?? 0)) / 100;
    return p * (ficha.danoQuePasa ?? 1) + (1 - p) * 1;
  }
  if (postura === POSTURA.ABAJO) {
    const p = Math.min(100, Math.max(0, ficha.bloqueoAbajo ?? 0)) / 100;
    return 1 - p;
  }
  return 1;
}

/**
 * EL ESCUDO EN LA MANO: la máquina de estados de un ataque `hold-strike`.
 *
 * Es un ataque de verdad —se registra con `registerattack`— y por eso el escudo
 * «ataca» mientras lo aguantas, que es literalmente lo que `game.item.attacking`
 * quiere decir. Lo que lo distingue de un mandoble es una línea de
 * `RegisterAttack` (giattack.cpp:558-562):
 *
 *     if (AttackType == "hold-strike") { attData.Type = ATT_STRIKE_HOLD;
 *                                        attData.tDuration = -1; }
 *
 * `tDuration = -1` **pisa** el `MELEE_ATK_DURATION 1.0` que el script declara, y
 * el comprobador de fin exige `tDuration >= 0`, así que el ataque no caduca: vive
 * hasta que sueltas el botón. Leer la duración del script y creerla da un escudo
 * que se cae solo al segundo.
 *
 * Los tres momentos, con el nombre del evento que dispara cada uno:
 *
 *     al pulsar          `melee_start` -> `ext_shield_up 1` -> ya no te empujan
 *     a `delay.strike`   `melee_hold`  -> la postura del muñeco. UNA vez
 *     al soltar          `melee_end`   -> `ext_shield_up 0` y la animación baja
 *
 * Y lo que NO cuesta: el aguante. El motor lo cobra al arrancar el ataque
 * (`Stamina -= CurrentAttack->flEnergy`), pero el ataque del escudo declara
 * `reg.attack.energydrain 0` a mano, así que los `MELEE_ENERGY` de la ficha —15
 * en el de entrenamiento, 8 en el de hierro grande— no se pagan nunca.
 * **Levantar un escudo es gratis y se puede tener arriba para siempre.**
 */
export class Brazal {
  constructor(escudo, { azar = Math.random } = {}) {
    /** La ficha entera del objeto, que trae `escudo` dentro. */
    this.objeto = escudo ?? null;
    this.ficha = escudo?.escudo ?? null;
    this.azar = azar;
    /** El ataque `hold-strike`, que es el único que un escudo registra. */
    this.ataque = (escudo?.ataques ?? []).find((a) => a?.tipo === "hold-strike") ?? null;
    /** `IS_DEPLOYED`: lo pone `weapon_deploy` y lo quita `game_wear`. */
    this.desplegado = false;
    this.arriba = false;
    this.t = 0;
    this.posturaPuesta = false;
    this.pulsadoAntes = false;
  }

  /** `game.item.attacking`, que es lo que mira el bloqueo para saber la postura. */
  get atacando() { return this.arriba; }

  /** La postura de cara al bloqueo. Sin desplegar no hay ninguna. */
  get postura() {
    if (!this.desplegado) return POSTURA.GUARDADO;
    return this.arriba ? POSTURA.ARRIBA : POSTURA.ABAJO;
  }

  /** `weapon_deploy` / `game_wear`. Guardarlo baja el escudo, claro. */
  desplegar(si = true) {
    this.desplegado = Boolean(si);
    if (!this.desplegado) this.soltar();
    return this.desplegado;
  }

  /** `CancelAttack()` — lo llama el soltar el botón y también morir o guardarlo. */
  soltar() {
    const estaba = this.arriba;
    this.arriba = false;
    this.t = 0;
    this.posturaPuesta = false;
    return estaba;
  }

  /**
   * Un paso. `pulsado` es el botón del escudo, que **no es el del arma**: el
   * objeto de la mano activa usa `IN_ATTACK` y el de la otra `IN_ATTACK2`
   * (giattack.cpp:118), y un escudo va siempre en la otra. O sea: botón derecho.
   *
   * Devuelve `sube`, `postura` y `baja` — los tres eventos del script.
   */
  tic(dt, { pulsado = false } = {}) {
    const out = { sube: false, postura: false, baja: false, aguante: 0 };
    if (!this.ataque || !this.desplegado) {
      if (this.arriba) { this.soltar(); out.baja = true; }
      this.pulsadoAntes = pulsado;
      return out;
    }
    if (pulsado && !this.arriba) {
      this.arriba = true;
      this.t = 0;
      this.posturaPuesta = false;
      out.sube = true;
      out.aguante = this.ataque.aguante ?? 0;
    } else if (!pulsado && this.arriba) {
      this.soltar();
      out.baja = true;
    } else if (this.arriba) {
      // El reloj de fin NO corre: `tDuration` es -1. Sólo el del golpe.
      this.t += dt;
      if (!this.posturaPuesta && this.t >= (this.ataque.retardo ?? 0)) {
        this.posturaPuesta = true;
        out.postura = true;
      }
    }
    this.pulsadoAntes = pulsado;
    return out;
  }
}

/**
 * ¿PUEDE ATACAR? `IsShielding()`, y es la línea que hace que un escudo cueste
 * algo (msmonstershared.cpp:65-71):
 *
 *     for( i = 0; i < Gear.size(); i++ )
 *       if( Gear[i]->CurrentAttack && msstring(Gear[i]->m_Name).starts_with("shields_") )
 *         return true;
 *
 * Dos cosas que no se adivinan:
 *
 *   1. Recorre **todo** lo que llevas, así que un escudo levantado en la mano
 *      izquierda impide atacar con la espada de la derecha (giattack.cpp:235 y
 *      252). No es «esa mano está ocupada»: es «estás cubriéndote».
 *   2. El criterio es el NOMBRE DEL SCRIPT, no la marca `AM_SHIELD`. Un escudo
 *      que no se llamara `shields_…` bloquearía el daño igual pero te dejaría
 *      atacar mientras te cubres. En el juego no pasa —los siete se llaman así—,
 *      pero es la clase de detalle que decide si un `.script` nuevo funciona.
 */
export function puedeAtacar({ objetos = [] } = {}) {
  return !objetos.some((o) => o?.cubriendose && /^shields_/.test(String(o?.id ?? "")));
}

/**
 * TODO EL GOLPE CONTRA EL JUGADOR, en el orden del motor. Es la función que usa
 * el juego, y existe para que el orden esté escrito en un sitio y no repartido:
 *
 *     1. la ARMADURA y el ESCUDO (la armadura desde el 96, `armadura.js`)
 *     2. el daño negativo se pisa a cero
 *     3. el PARRY del motor, que puede dejarlo en -1
 *
 * El paso 2 no es decoración: `setdmg dmg 0` con el escudo abajo deja un 0, y el
 * parry no para los ceros, así que la postura baja del escudo **apaga el parry**
 * cuando funciona. Es la única interacción real entre los dos sistemas.
 */
export function defensaDelJugador({
  dano = 0, tipo = "", escudo = null, postura = POSTURA.GUARDADO,
  desplegado = true, deFrente = true, esElPropio = false,
  parry = 0, consciencia = 0, acierto = 1, dados = {},
  // EL 96: las entidades de lo que lleva —`GuionDeObjeto`, en el orden de la
  // mochila— y quién pega. Ver `src/play/armadura.js`. Sin `equipo` no hay
  // armadura, y por eso el juego lo pasa SIEMPRE (src/main.js, `golpear`) y
  // la sonda del 96 mide que llega.
  equipo = [], atacante = "none",
} = {}) {
  // 0. LA ARMADURA. Va en el mismo bucle que el escudo (`Gear[i]->
  // OwnerTakeDamage`, player.cpp:403-404) y en el orden del `Gear`; aquí va
  // ANTES del escudo. Para el daño da igual —las dos son multiplicaciones—, y
  // `setdmg dmg` de una armadura no toca ni el tipo ni la tirada del escudo.
  const a = golpeContraLaArmadura({ dano, tipo, atacante, equipo });
  dano = a.dano;
  tipo = a.tipo;
  const b = bloqueoDelEscudo({
    ficha: escudo, postura, dano, tipo, desplegado, deFrente, esElPropio, dados,
  });
  let d = b.dano;
  if (d <= 0) d = 0;
  const p = parryDelJugador({
    parry, consciencia, acierto, tipo, dano: d, tiradas: dados,
  });
  return {
    dano: p.para ? 0 : d,
    armadura: a,
    bloqueo: b, parry: p,
    parado: p.para,
    // Lo que hay que contarle al jugador, en el orden en que sale en pantalla.
    mensaje: p.para ? null : b.mensaje,
  };
}
