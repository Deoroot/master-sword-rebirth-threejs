// EL PASEO: `CMSMonster::SetWanderDest`, msmonsterserver.cpp:1053-1157.
//
// Hasta el 20 esto eran treinta líneas nuestras —andar de frente y girar al
// chocar— y su propio comentario decía que no eran la IA del mod. Lo eran a
// medias: la IA de COMBATE sí estaba portada desde el 17 (`npcatk_hunt`, en
// `ia.js`), pero lo que hace un bicho cuando no tiene a quién perseguir no
// está en ningún script. Está en C++, y es esto.
//
// ── Quién pasea ───────────────────────────────────────────────────────────
//
// Lo dice una sola palabra del `npc_spawn` de su script:
//
//     roam  1                            <- NPCs/default_dwarf.script:44
//
// que el motor traduce a una condición y nada más:
//
//     else if (Cmd.Name() == "roam") {
//       if (atoi(Params[0])) SetConditions(MONSTER_ROAM);
//       else ClearConditions(MONSTER_ROAM); }      npcscript.cpp:340-350
//
//     if (!HasConditions(MONSTER_ROAM)) return;    msmonsterserver.cpp:1057
//
// En Gate City la dicen **53 de los 69**. Los otros 16 —los tenderos, el
// alcalde, el cofre— están clavados a propósito, y eso también hay que
// respetarlo: un mercader que se va de paseo deja la tienda vacía.
//
// ── Las cuatro cosas que no se adivinan ───────────────────────────────────
//
// 1. **El rumbo se busca cerca y el destino está lejísimos.** La comprobación
//    de que hay hueco se hace a `Proximity * 3` —tres anchos y pico, unos 2,7
//    metros para un goblin—, pero el destino que se apunta luego es otro:
//
//        m_MoveDest.Origin = EyePosition() + vForward * RANDOM_FLOAT(300, 6000);
//                                            msmonsterserver.cpp:1145
//
//    De 300 a 6000 unidades, o sea de 7,6 a 152 metros. Por eso los aldeanos
//    de Master Sword cruzan el pueblo entero y no dan vueltas alrededor de su
//    puerta. Si uno colapsa las dos distancias en una —que es lo natural—
//    salen bichos que tiemblan en el sitio.
//
// 2. **Hay un plazo, y es lo que de verdad marca el ritmo.** `m_NodeCancelTime`
//    se pone a 7 segundos al arrancar el paseo; cuando vence, se pide otro
//    rumbo. Así que el destino a 152 metros casi nunca se alcanza: se anda
//    siete segundos hacia allá y se vuelve a tirar el dado. El `m_RoamDelay`
//    de 2 segundos (msmonsterserver.cpp:187) es lo que se espera ANTES de
//    elegir, no entre pasos.
//
// 3. **El rumbo nuevo sale del actual, ±130 grados.** No es un rumbo cualquiera:
//    `UTIL_AngleMod(pev->angles.y + RANDOM_FLOAT(-130, 130))`. Un bicho no se da
//    la vuelta en seco, y quince intentos seguidos tampoco lo dejan mirando
//    atrás casi nunca.
//
// 4. **Si los quince intentos fallan, se prueban los 360 grados uno a uno** —y
//    ese segundo bucle mide desde otro sitio. El primero traza desde el ojo
//    hasta `pev->origin + adelante * d` y el segundo hasta `Center() + ...`.
//    No es una simplificación mía: son dos líneas distintas en el archivo
//    (1084 y 1113), y las porto como están. Si tampoco hay salida, el bicho se
//    da por atascado y espera **diez** segundos.
//
// Esto es decisión pura: no hay Three ni Rapier. El trazo lo pone quien tenga
// la física, igual que en `ia.js`.

/** `m_RoamDelay = 2.0f` (msmonsterserver.cpp:187), y el `roamdelay` lo cambia. */
export const ESPERA = 2.0;

/** `m_NodeCancelTime = gpGlobals->time + 7.0` (msmonsterserver.cpp:1147). */
export const PLAZO = 7.0;

/** Lo que se espera al no encontrar salida (msmonsterserver.cpp:1136). */
export const ATASCADO = 10.0;

/** `RANDOM_FLOAT(-130, 130)` sobre el rumbo actual. */
export const ABANICO = 130;

/** Los intentos al azar antes de barrer los 360 grados. */
export const INTENTOS = 15;

/** `GetDefaultMoveProximity() { return m_Width * 1.1; }` (msmonster.h:355). */
export const cercaniaDe = (ancho) => ancho * 1.1;

/** Lo lejos que se traza para ver si hay hueco: `Proximity * 3`. */
export const alcanceDelTrazo = (ancho) => cercaniaDe(ancho) * 3;

const grados = (r) => (r * 180) / Math.PI;
const radianes = (g) => (g * Math.PI) / 180;

/** `UTIL_AngleMod`: deja un ángulo en [0, 360). */
export const anguloMod = (g) => ((g % 360) + 360) % 360;

/**
 * El vagabundeo de un bicho. Uno por instancia, igual que el `Cazador`.
 *
 * Todo en UNIDADES de GoldSrc y en GRADOS, que es como está el motor. Quien lo
 * llame convierte; mezclar las dos unidades aquí dentro es cómo se pierde un
 * factor 39,37 sin que nada dé error.
 */
export class Vagabundo {
  constructor({ ancho = 32, pasea = true, espera = ESPERA, azar = Math.random } = {}) {
    this.ancho = ancho;
    /** `MONSTER_ROAM`. Sin ella este objeto no hace nada, y es lo correcto. */
    this.pasea = Boolean(pasea);
    this.espera = espera;
    this.azar = azar;
    /** `m_NextNodeTime`: cuándo toca elegir rumbo. 0 significa «ya lo tengo». */
    this.proximoNodo = 0;
    /** `m_NodeCancelTime`: cuándo se tira el destino actual aunque no se haya llegado. */
    this.plazo = 0;
    /** `m_MoveDest.Origin`, o `null` si no hay. */
    this.destino = null;
    /** `MONSTER_HASMOVEDEST`. */
    this.tieneDestino = false;
    /** El reloj propio, en segundos, que es `gpGlobals->time`. */
    this.t = 0;
  }

  /** `RANDOM_FLOAT(a, b)`. */
  azarEntre(a, b) { return a + this.azar() * (b - a); }

  /**
   * Un paso del reloj.
   *
   * @param dt      segundos
   * @param rumbo   hacia dónde mira AHORA, en grados (`pev->angles.y`)
   * @param donde   `pev->origin`, en unidades
   * @param centro  `Center()`, en unidades — el segundo bucle mide desde aquí
   * @param ojo     `EyePosition()`, en unidades — de donde sale el trazo
   * @param libre   `(desde, hasta) => bool`, el `UTIL_TraceLine` con
   *                `tr.flFraction >= 1.0`. Lo pone quien tenga la física.
   *
   * @returns `null` si no ha cambiado nada, o `{ destino, cerca, rumbo, porque }`.
   */
  tic(dt, { rumbo = 0, donde = [0, 0, 0], centro = null, ojo = null, libre = () => true } = {}) {
    this.t += dt;
    if (!this.pasea) return null;

    const c = centro ?? donde;
    const o = ojo ?? donde;

    // «Cancel a movedest if we've been trying for too long»: si NO hay nodo
    // pendiente y el plazo ha vencido, se pide uno. El `!m_NextNodeTime` es lo
    // que hace que el plazo sólo cuente mientras se está andando.
    if (!this.proximoNodo && this.t >= this.plazo) this.proximoNodo = this.t + this.espera;
    if (!(this.proximoNodo && this.t >= this.proximoNodo)) return null;

    const paso = alcanceDelTrazo(this.ancho);
    let nuevo = null;
    let porque = null;

    // Quince rumbos al azar a ±130° del actual, midiendo desde `pev->origin`.
    for (let n = 0; n < INTENTOS && nuevo === null; n++) {
      const g = anguloMod(rumbo + this.azarEntre(-ABANICO, ABANICO));
      const a = adelante(g);
      const hasta = [donde[0] + a[0] * paso, donde[1] + a[1] * paso, donde[2] + a[2] * paso];
      if (libre(o, hasta)) { nuevo = g; porque = `al azar, intento ${n + 1}`; }
    }

    // Y si no, los 360 grados uno a uno. Ojo: este bucle mide desde `Center()`.
    if (nuevo === null) {
      for (let g = 0; g < 360 && nuevo === null; g++) {
        const a = adelante(g);
        const hasta = [c[0] + a[0] * paso, c[1] + a[1] * paso, c[2] + a[2] * paso];
        if (libre(o, hasta)) { nuevo = g; porque = `a la fuerza, ${g}°`; }
      }
    }

    if (nuevo === null) {
      // «UNFIXABLY STUCK»: diez segundos y a callar.
      this.proximoNodo = this.t + ATASCADO;
      this.tieneDestino = false;
      this.destino = null;
      return { destino: null, atascado: true, porque: "sin salida: 10 s de espera" };
    }

    // El destino NO está donde se ha trazado: está de 300 a 6000 unidades, y
    // se mide desde el OJO.
    const a = adelante(nuevo);
    const lejos = this.azarEntre(300, 6000);
    this.destino = [o[0] + a[0] * lejos, o[1] + a[1] * lejos, o[2] + a[2] * lejos];
    this.tieneDestino = true;
    this.plazo = this.t + PLAZO;
    this.proximoNodo = 0;
    return {
      destino: this.destino,
      // `m_MoveDest.Proximity = GetDefaultMoveProximity()`.
      cerca: cercaniaDe(this.ancho),
      rumbo: nuevo,
      lejos,
      porque,
    };
  }

  /**
   * Se ha llegado, o ha vencido el plazo: se suelta el destino.
   *
   * El motor lo hace en `Move()` limpiando `MONSTER_HASMOVEDEST`; aquí hace
   * falta poder decirlo desde fuera porque quien mueve el nodo es otro módulo.
   */
  llegado() {
    this.tieneDestino = false;
    this.destino = null;
    if (!this.proximoNodo) this.proximoNodo = this.t + this.espera;
  }

  /** Si el plazo de siete segundos ha vencido con el destino aún puesto. */
  get vencido() { return this.tieneDestino && this.t >= this.plazo; }

  /**
   * LOS DOS RELOJES, APLAZADOS — el 77.
   *
   *     pMonster->m_NextNodeTime = pMonster->m_NodeCancelTime
   *         = gpGlobals->time + 2.0;                       npcact.cpp:234
   *
   * Lo hace `NPCScript::MoveThink` **cada 0,1 s mientras la escena corre**, y
   * son los dos a la vez: el de elegir rumbo nuevo y el de tirar el destino por
   * llevar mucho intentándolo. O sea que mientras un `ms_npcscript` lleva a un
   * NPC de la mano, el NPC **no se va a pasear por su cuenta** y **tampoco se
   * le vence el plazo de los siete segundos**, que es lo que de otro modo le
   * soltaría el destino a mitad del camino si el sitio está lejos.
   *
   * ── Y AQUÍ NO SE PUEDE MEDIR, ASÍ QUE SE DICE ─────────────────────────
   *
   * Esto se rompió a propósito —dejar el método sin rearmar nada— y **las 26
   * pruebas del 77 siguieron verdes**. No es que el control fuera flojo: es
   * que en este puerto el efecto no existe.
   *
   * En el motor hay UNA casilla de destino y `SetWanderDest` se llama en todos
   * los `MonsterThink`, también durante una escena (msmonsterserver.cpp:569-574):
   * lo único que lo calla es este reloj. Aquí las casillas son dos y quien las
   * ordena es el reparto de `Manada.pasear`, que con un destino mandado llama a
   * `pasoMandado` y ni toca al vagabundo. O sea que el paseo ya está parado
   * antes de llegar a este reloj, y aplazarlo no cambia nada observable.
   *
   * Se conserva igualmente porque es la línea del motor y porque el día que las
   * dos casillas se fundan en una —que es lo que debería pasar— será lo único
   * que impida que un NPC en escena se vaya a dar una vuelta. Lo que NO se hace
   * es apuntarse un control verde por ella: lo que mide de verdad la prueba de
   * al lado es **el reparto**, y eso sí se pone rojo al romperlo.
   *
   * EL RELOJ SIGUE CORRIENDO, y eso no es un adorno. En el motor
   * `SetWanderDest` se llama en TODOS los `MonsterThink`, también durante una
   * escena (`msmonsterserver.cpp:569-574`): lo que lo deja sin hacer nada es el
   * reloj aplazado, no un `if` que se lo salte. Aquí, mientras una escena manda
   * no se llama a `tic`, así que el `dt` entra por aquí — si no, al acabar la
   * escena este objeto creería que no ha pasado el tiempo.
   *
   * @param segundos cuánto desde AHORA.
   * @param dt       lo que ha avanzado el reloj en este paso.
   */
  aplazar(segundos, dt = 0) {
    this.t += dt;
    this.proximoNodo = this.t + segundos;
    this.plazo = this.t + segundos;
    return this;
  }
}

/**
 * `UTIL_MakeVectorsPrivate(Vector(0, yaw, 0), vForward, ...)`: el «adelante»
 * de un rumbo en grados.
 *
 * Va en el ORDEN DE EJES DE ESTE PROYECTO —`[x, arriba, z]`— y no en el de
 * GoldSrc, porque todo lo que entra y sale de aquí viene de un nodo de Three
 * multiplicado por `U`: así lo pasa `ia.js` y así lo pasa `bichos.js`. En los
 * ejes del motor la altura es la tercera componente, y mezclar las dos
 * convenciones no da un error: da un bicho que pasea hacia el techo.
 *
 * El giro de la entidad (`pev->angles.y`) crece hacia la izquierda y el eje z
 * de la escena apunta al contrario, de ahí el signo — es el mismo `−sin` que
 * ya usaba el paseo viejo en `bichos.js`.
 */
export function adelante(gradosYaw) {
  const r = radianes(gradosYaw);
  return [Math.cos(r), 0, -Math.sin(r)];
}

export { grados, radianes };
