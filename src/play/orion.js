// EL ARCO DE ORIÓN Y SU BOLA DE MANÁ (experimento 100, doc/ARMAS_100.md).
//
// El Orion Bow no dispara flechas. Su `custom_register` pone los `local
// reg.attack.*` y NO llama a `registerattack` (bows_orion1.script:53-74), y la
// flecha de `base_ranged` está detrás de `if !CUSTOM_ATTACK`: para el motor su
// único ataque es el VACÍO (doc/GUION_99.md §4). Todo lo que hace lo hace su
// GUION con los dos eventos que el motor llama en cada fotograma:
//
//     CallScriptEvent("game_attack1_down");   con el botón ABAJO   genericitem.cpp:730
//     CallScriptEvent("game_-attack1");       con el botón ARRIBA  genericitem.cpp:750
//
// y con un reloj propio, `tally_stretch`, que se llama a sí mismo cada 0,1 s.
// Mientras se aguanta el botón la bola CRECE —una vez cada `CHARGE_RATE`, 0,3 s—
// y cada vez cuesta `MP_DRAIN` = 4 de maná (`givemp $neg(MP_DRAIN)`, :159); al
// soltar, el arco crea un NPC, `items/proj_mana2`, que vuela a 200 u/s sin
// gravedad y hace un daño de ÁREA cada 0,3 s (proj_mana2.script:26-75).
//
// Esto es una regla y no toca el DOM ni Three: la usa `Brazo` (src/play/golpe.js)
// y la prueba entra por ahí, como el juego.

/** Las constantes del arco, con su línea. */
export const ORION = Object.freeze({
  id: "bows_orion1",
  /** `const MP_DRAIN 4` (bows_orion1.script:25): lo que cuesta cada carga. */
  costeDeCarga: 4,
  /** `const CHARGE_RATE 0.3 //lower=faster` (:26). */
  ritmo: 0.3,
  /** `const DMG_MULTI 10 //pts damage per MP_DRAIN mana` (:27). */
  danoPorTamano: 10,
  /** `const BASE_LEVEL_REQ 15` (:13): la COMPETENCIA de arquería que pide (:167). */
  competencia: 15,
  /** `if ( BALL_SIZE >= 10 )` (:152). */
  tamanoMaximo: 10,
  /** `callevent 0.1 tally_stretch` (:115). */
  reloj: 0.1,
  /** `game_deploy`: `add NEXT_ATTACK 1.0` (:76-79) — un segundo tras sacarlo. */
  alSacar: 1.0,
  /** `add NEXT_ATTACK 0.75` en `game_attack1_down` (:83-85). */
  entrePulsaciones: 0.75,
  /** `add NEXT_ATTACK 0.2` en `game_-attack1` (:180-181). */
  trasSoltar: 0.2,
  /** Lo que sale por la consola, tal cual lo escribe el guion. */
  frases: Object.freeze({
    sinManaAlEmpezar: "You lack the mana to start charging a mana ball.",   // :106
    sinMana: "Orion Bow: Insufficient Mana",                               // :146
    tope: "Manaball has reached maximum charge",                           // :157
  }),
  /** La habilidad que entrena y con la que se mira la competencia (`archery`, :189). */
  habilidad: "archery",
});

/**
 * LA BOLA, `items/proj_mana2`: un NPC sin modelo (`setmodel none`) que dibuja un
 * efecto de cliente con el submodelo 13 de `weapons/projectiles.mdl`
 * (proj_mana2_cl.script:2, :57) a escala `BALL_SIZE × 0,75` (:52).
 */
export const BOLA_DE_MANA = Object.freeze({
  id: "proj_mana2",
  modelo: "weapons/projectiles.mdl",
  /** `cleffect tempent set_current_prop body 13` (proj_mana2_cl.script:57). */
  submodelo: 13,
  /** `$relvel($get(ent_owner,viewangles),(0,200,0))` (bows_orion1.script:188). */
  velocidad: 200,
  /** `gravity 0` (proj_mana2.script:16). */
  gravedad: 0,
  /** `scale $math(multiply,BALL_SIZE,0.75)` (proj_mana2_cl.script:35, :52). */
  escalaPorTamano: 0.75,
  /** `callevent 0.3 scan_cycle` al nacer y en cada vuelta (:40, :69). */
  primero: 0.3,
  periodo: 0.3,
  /** `callevent 10.0 remove_projectile` (:23). */
  vida: 10.0,
  /** `xdodamage ... FX_DAMAGE 0 ...` (:68): caída 0, el daño entero en todo el radio. */
  caida: 0,
  tipo: "magic",
  cita: "proj_mana2.script:26-111, bows_orion1.script:174-193",
});

/**
 * EL RADIO DEL ÁREA: `func_get_scan_size` (proj_mana2.script:104-111).
 *
 *     local L_SCAN_SIZE 24
 *     multiply L_SCAN_SIZE FX_SIZE
 *     capvar L_SCAN_SIZE 55 140
 */
export function radioDeLaBola(tamano) {
  return Math.min(140, Math.max(55, 24 * tamano));
}

/**
 * LA CARGA DEL ARCO, el guion entero de `bows_orion1` sin el dibujo.
 *
 * El reloj es el de la partida desde que se SACÓ el arco (el `game_deploy`), y
 * `paso` hace en este orden lo que el motor hace en un fotograma: el evento del
 * botón —`game_attack1_down` o `game_-attack1`— y luego los `tally_stretch`
 * que vencen. Devuelve lo que pasa para que quien llama lo cobre y lo tire:
 *
 *     gasta     maná a restar (`givemp $neg(MP_DRAIN)`), uno o más cobros
 *     suelta    `{ tamano, dano }` de la bola que sale este paso, o `null`
 *     mensajes  `{ tipo, texto }`: `nopuedes` es `dplayermessage` (gris) y
 *               `normal` es `playermessage` (blanco)
 *
 * Tres cosas del guion que parecen erratas y se portan como están:
 *
 *   1. **La carga que se queda sin maná NO cobra pero SÍ crece.** `add
 *      BALL_SIZE 1` va antes de mirar el maná (:127 y :143), y el `EXIT_SUB`
 *      corta antes del `givemp` (:148-150). El daño se queda en el de la vuelta
 *      anterior (`BALL_DMG` se calcula en :123-124 antes del `add`)… hasta la
 *      vuelta siguiente, que lo rehace (ver 2).
 *   2. **Sin la competencia, la bola hace 0,05 — si se suelta pronto.** `if (
 *      $get(ent_owner,skill.archery.proficiency) < BASE_LEVEL_REQ )` pone
 *      `MAX_LEVEL 1` y `BALL_DMG 0.05` (:167-171) DESPUÉS de cobrar: la primera
 *      carga cuesta 4 y no crece más. Pero cada vuelta que pasa la puerta del
 *      reloj hace `BALL_DMG = BALL_SIZE × DMG_MULTI` (:123-124) ANTES del `if
 *      !MAX_LEVEL` que corta (:126), así que aguantando 0,3 s más el castigo se
 *      pierde y la bola de tamaño 1 hace 10. Está escrito así.
 *   3. **`NEXT_CHARGE` no se reinicia nunca** (sólo `setvard` en :120): una
 *      segunda carga empezada antes de 0,3 s de la última vuelta de la primera
 *      espera a que venza, y soltar entre medias tira una bola de tamaño 0.
 *
 * Las comparaciones de tiempo son las del guion: `game.time > NEXT_*`, estricto.
 * Aquí el reloj avanza con el `dt` de quien llama; el motor lo hace con los
 * `callevent 0.1` de su propio planificador.
 */
export class CargaDeOrion {
  constructor() {
    /** El reloj de la partida desde `game_deploy`. */
    this.t = 0;
    /** `NEXT_ATTACK`: `game.time + 1.0` al sacarlo (:77-78). */
    this.proximoAtaque = ORION.alSacar;
    /** `NEXT_CHARGE`, sin poner = su nombre = 0 (script.cpp:4741). */
    this.proximaCarga = 0;
    this.cargando = false;     // AM_CHARGING
    this.tamano = 0;           // BALL_SIZE
    this.dano = 0;             // BALL_DMG
    this.maximo = false;       // MAX_LEVEL
    this.cuenta = false;       // TALLY_ACTIVE
    /** Cuándo vence el próximo `tally_stretch`, o `null` si no hay ninguno pendiente. */
    this.proximoTally = null;
  }

  /**
   * Un fotograma.
   *
   * @param {number} dt
   * @param {object} o
   * @param {boolean} o.pulsado     el botón de atacar
   * @param {number}  o.mana        `$get(ent_owner,mp)`, el maná de AHORA
   * @param {number}  o.competencia `skill.archery.proficiency`
   */
  paso(dt, { pulsado = false, mana = 0, competencia = 0 } = {}) {
    const out = { gasta: 0, suelta: null, mensajes: [], empieza: false };
    this.t += dt;
    let mp = mana;
    if (pulsado) this._abajo(out, mp, competencia);
    else this._arriba(out);
    // Los `tally_stretch` que vencen en este fotograma, en orden. El primero de
    // una carga corre DENTRO de `_abajo` (`callevent tally_stretch` sin
    // retraso, :101); los demás, aquí.
    while (this.proximoTally !== null && this.proximoTally <= this.t + 1e-9) {
      const cuando = this.proximoTally;
      this.proximoTally = null;
      mp = mana - out.gasta;
      this._tally(out, cuando, mp, competencia);
    }
    return out;
  }

  /** `game_attack1_down` (bows_orion1.script:81-110). */
  _abajo(out, mp, competencia) {
    if (!(this.t > this.proximoAtaque)) return;          // `if game.time > NEXT_ATTACK` (viejo: corta)
    this.proximoAtaque = this.t + ORION.entrePulsaciones;
    if (this.cargando) return;                           // `if ( !AM_CHARGING ) { … }`
    if (mp > ORION.costeDeCarga) {                       // `if ( $get(ent_owner,mp) > MP_DRAIN )`
      // `playviewanim ANIM_FIRE`; `if $get(ent_owner,canattack)` —se da por
      // cierto: este puerto no tiene el estado que lo apaga—; `AM_CHARGING 1`.
      this.cargando = true;
      out.empieza = true;
      this.tamano = 0;
      this.dano = 0;
      if (!this.cuenta) {
        this.cuenta = true;
        this._tally(out, this.t, mp, competencia);
      }
    } else {
      out.mensajes.push({ tipo: "nopuedes", texto: ORION.frases.sinManaAlEmpezar });
    }
  }

  /** `game_-attack1` (:174-193): corre en CADA fotograma con el botón arriba. */
  _arriba(out) {
    if (!this.cargando) return;                          // `if AM_CHARGING` (viejo)
    this.proximoAtaque = this.t + ORION.trasSoltar;
    out.suelta = { tamano: this.tamano, dano: this.dano };
    this._reiniciar();
  }

  /** `reset_atk` (:199-209). */
  _reiniciar() {
    this.cargando = false;
    this.tamano = 0;
    this.dano = 0;
    this.maximo = false;
    this.cuenta = false;
  }

  /** `tally_stretch` (:112-172), a la hora `t`. */
  _tally(out, t, mp, competencia) {
    if (!this.cuenta) return;                            // `if TALLY_ACTIVE` (viejo)
    this.proximoTally = t + ORION.reloj;                 // `callevent 0.1 tally_stretch`
    if (!this.cargando) return;                          // `if AM_CHARGING`
    // `if game.time > NEXT_CHARGE`, estricto. En el motor cada `callevent 0.1`
    // corre en el primer fotograma de servidor DESPUÉS de vencer y se vuelve a
    // poner desde ESA hora, así que tres vueltas suman 0,3 s más tres retrasos
    // de fotograma y el `>` se cumple en la tercera: una carga cada ~0,3 s.
    // Aquí las vueltas caen en múltiplos exactos de 0,1 y el `>` estricto
    // cumpliría en la CUARTA (0,4 s); la tolerancia pone el retraso de
    // fotograma que el motor tiene y esto no. Razonado, no medido en el motor.
    if (!(t > this.proximaCarga - 1e-6)) return;
    this.proximaCarga = t + ORION.ritmo;
    this.dano = this.tamano * ORION.danoPorTamano;
    if (this.maximo) return;                             // `if !MAX_LEVEL` (viejo)
    this.tamano += 1;
    if (mp <= ORION.costeDeCarga) {                      // :143-150
      this.maximo = true;
      out.mensajes.push({ tipo: "nopuedes", texto: ORION.frases.sinMana });
      return;                                            // `if !EXIT_SUB`
    }
    if (this.tamano >= ORION.tamanoMaximo) {
      this.tamano = ORION.tamanoMaximo;
      this.maximo = true;
    }
    if (this.maximo) out.mensajes.push({ tipo: "normal", texto: ORION.frases.tope });
    out.gasta += ORION.costeDeCarga;                     // `givemp $neg(MP_DRAIN)`
    this.dano = this.tamano * ORION.danoPorTamano;
    if (competencia < ORION.competencia) {               // :167-171
      this.maximo = true;
      this.dano = 0.05;
    }
  }
}
