// LA MANADA: los 69 bichos de Gate City, **sin Three.js y sin navegador**.
//
// Esto es el paso 5 de PROYECTO_10.md y es una mudanza, no una función nueva.
// La decisión ya estaba fuera del visor desde el 17 y el 20 —`src/play/ia.js` es
// `npcatk_hunt` y `src/play/paseo.js` es `SetWanderDest`, y ninguno de los dos
// importa Three—, pero **el estado no**: dónde está cada bicho vivía en
// `i.nodo.position`, su rumbo en `i.nodo.rotation.y` y su animación dentro de un
// `AnimationMixer`. Con la posición dentro de un objeto de dibujo, la única
// máquina capaz de simular un goblin era un navegador con pantalla.
//
// Y eso, con dos jugadores, no es un problema de arquitectura: es un juego
// distinto para cada uno. Cada pestaña simulaba sus propios 69 bichos con su
// propio `Math.random`, así que **dos jugadores en la misma plaza veían dos
// pueblos diferentes** — el goblin que a ti te persigue, al otro le pasea.
//
// Aquí está el estado y las reglas. Quien dibuja es `src/render/bichos.js`, que
// ahora es una VISTA: copia `donde`, `yaw` y la animación pedida a los nodos. Y
// quien manda es el servidor (`src/red/fauna.js`), que corre esto mismo.
//
// ── Las unidades, que son dos y se mezclan a propósito ─────────────────────
//
//   `donde`  en METROS de escena, porque es lo que consume la física (Rapier) y
//            lo que el renderizador copia a un nodo sin convertir.
//   la IA    en UNIDADES de GoldSrc, porque los alcances salen de los scripts
//            del mod (`ATTACK_RANGE 130`) y convertirlos sería reescribirlos.
//
// El cambio se hace en la frontera y en un solo sitio, igual que antes.

import { Cazador, ACCION, acierta, danoDe } from "./ia.js";
import { parryDelBicho, aciertoDelGolpe } from "./parry.js";
import { reaccionAlGolpe, aQuienAvisa } from "./reaccion.js";
import { animacionDeParado } from "./actividad.js";
import { Vagabundo, grados } from "./paseo.js";

/**
 * Lo que tarda en volver a golpear: `HACK_ATTACK_DELAY 1.0`.
 *
 * Es el del ataque «sin evento en el modelo». El motor prefiere el evento 600
 * de la secuencia de ataque cuando lo hay, y ése todavía no lo leemos del
 * `.mdl` — así que esto es el camino de repuesto del propio mod, no un número
 * elegido. Cuando se lea el evento, saldrá de ahí.
 */
export const ESPERA_ENTRE_GOLPES = 1.0;

/** Lo que puede subir de un paso: `m_StepSize = 18` (msmonsterserver.cpp:188). */
export const ESCALON = 18;

/**
 * Cuánto dura un cadáver. Los dos plazos son del motor:
 *
 *     pev->nextthink = gpGlobals->time + 20.0;     msmonsterserver.cpp:2688
 *     renderamt -= 7 cada 0,1 s                    combat.cpp:651
 */
export const CADAVER = { quieto: 20, desvanece: (255 / 7) * 0.1 };

/** Las unidades de GoldSrc por metro. La misma constante de siempre. */
export const U_POR_METRO = 39.37;

/**
 * Cuántas posiciones se guardan de cada bicho para poder rebobinar.
 *
 * Son las mismas 64 de `MULTIPLAYER_BACKUP` (`netchan.h:75`) que ya guarda la
 * partida de los jugadores, y hacen falta por lo mismo: el cliente ve a los
 * bichos `ex_interp` en el pasado, así que cuando dice «le he pegado a éste»
 * está hablando de dónde estaba hace 100 ms más su latencia. Sin la historia, el
 * servidor mediría contra el presente y los golpes a un monstruo que corre no
 * llegarían nunca.
 */
export const HISTORIA = 64;

const dist2D = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

/**
 * La velocidad de una secuencia, del `linearmovement` que escribió el
 * compilador partido por su duración. En metros por segundo.
 *
 * No se elige: si el número estuviera mal, se vería — un bicho que patina o
 * que va de puntillas es exactamente el síntoma.
 */
export function velocidadDeSecuencia(secuencias, nombre, U = U_POR_METRO) {
  const s = buscarSecuencia(secuencias, nombre);
  if (!s || !s.fps) return 0;
  const d = s.fotogramas / s.fps;
  return d > 0 ? Math.hypot(...(s.avance ?? [0, 0, 0])) / d / U : 0;
}

/**
 * Una secuencia por nombre o por índice.
 *
 * Por ÍNDICE también, porque un arma nombra las suyas por número
 * (`const ANIM_ATTACK1 2`) y porque es lo que hacía el mapa de clips del
 * renderizador. Sin el índice, pedir la 2 no encuentra nada y el modelo se
 * queda quieto al blandir.
 */
export function buscarSecuencia(secuencias, nombre) {
  if (!secuencias?.length) return null;
  const k = String(nombre ?? "").toLowerCase();
  return secuencias.find((s) => String(s.nombre).toLowerCase() === k)
    ?? secuencias.find((s) => String(s.indice) === k)
    ?? secuencias[0];
}

/** La duración de una secuencia en segundos, con la cuenta del motor. */
export const duracionDe = (s) => (s && s.fps ? s.fotogramas / s.fps : 0);

/**
 * UN PASO HACIA EL DESTINO, en metros de escena.
 *
 * Es `UTIL_MoveToOrigin` recortado a lo que hace falta: recto, con el escalón
 * de 18 unidades y sin caerse por un borde. `i.cerca` es a qué distancia se
 * planta, y viene de `MOVE_RANGE` — llegar hasta encima haría que el bicho se
 * metiera dentro del jugador para pegarle.
 */
export function avanzar(i, dt, libre, suelo, U = U_POR_METRO, { correr = true } = {}) {
  // `i.frenado` dice POR QUÉ no se ha movido, y no es adorno: «el bicho no
  // avanza» tiene cinco causas que se ven exactamente igual en pantalla, y
  // una sexta —que esto ni siquiera se llame— que se ve igual que las cinco.
  i.frenado = "sin destino";
  if (!i.destino) return false;
  const n = i.donde;
  const dx = i.destino[0] / U - n[0], dz = i.destino[2] / U - n[2];
  const falta = Math.hypot(dx, dz);
  const cerca = (i.cerca ?? 0) / U;
  if (falta <= cerca) { i.frenado = "ya esta cerca"; return false; }
  mirarA(i, i.destino, U);
  // Paseando se ANDA, y no es un detalle: `SetWanderDest` termina con
  // `m_Activity = ACT_WALK` (msmonsterserver.cpp:1152) y la animación que sale
  // es `m_MoveAnim`, la de andar. Con la velocidad de correr sobre el ciclo de
  // andar, los pies patinan — que es el síntoma que este proyecto ya conoce.
  const v = correr ? (i.velocidadCorriendo || i.velocidad) : (i.velocidad || i.velocidadCorriendo);
  if (!v) { i.frenado = "sin velocidad"; return false; }
  const paso = Math.min(v * dt, falta - cerca);
  const ux = dx / falta, uz = dz / falta;
  // Se mira delante antes de moverse, igual que en el paseo: entrar en la
  // pared y salir después es lo que hace que un bicho tiemble en una esquina.
  if (libre && !libre(n[0], n[1], n[2], ux, uz, Math.max(0.5, paso * 4), i)) { i.frenado = "pared delante"; return false; }
  const antes = [n[0], n[1], n[2]];
  n[0] += ux * paso;
  n[2] += uz * paso;
  if (suelo) {
    const y = suelo(n[0], n[1], n[2], i);
    // Sin suelo debajo es un borde: se deshace. Y si el escalón es mayor que
    // `m_StepSize` tampoco se sube — un goblin no salta a un tejado.
    if (y === null || Math.abs(y - antes[1]) > ESCALON / U) {
      n[0] = antes[0]; n[2] = antes[2];
      i.frenado = y === null ? "sin suelo delante"
        : `escalon de ${((y - antes[1]) * U).toFixed(0)} u`;
      return false;
    }
    n[1] = y;
  }
  i.frenado = "avanza";
  return true;
}

/** Gira al bicho hacia un punto dado en UNIDADES. */
export function mirarA(i, destinoU, U = U_POR_METRO) {
  const n = i.donde;
  const dx = destinoU[0] / U - n[0], dz = destinoU[2] / U - n[2];
  if (dx * dx + dz * dz < 1e-9) return;
  // Con yaw 0 el modelo mira a +X de Three; el giro es sobre +Y y la Z va
  // negada respecto al `.bsp`, así que el ángulo es `atan2(-dz, dx)`.
  i.yaw = Math.atan2(-dz, dx);
}

/**
 * UN PASO DE PASEO, de UN bicho.
 *
 * En el motor no hay «o cazas o paseas». `MonsterThink` llama a las dos, en
 * este orden y siempre, para todos:
 *
 *     dbg("SetMoveDest");   SetMoveDest();
 *     dbg("SetWanderDest"); SetWanderDest();
 *                                        msmonsterserver.cpp:569-574
 *
 * y quien decide cuál manda es el destino, no un `if`: `SetMoveDest` se va
 * sin hacer nada `if (!HasConditions(MONSTER_HASMOVEDEST))` (línea 995) y
 * `SetWanderDest` sólo elige sitio cuando el reloj `m_NextNodeTime` está
 * armado, que es lo que hace `StopWalking` al soltar el destino:
 *
 *     ClearConditions(MONSTER_HASMOVEDEST);
 *     m_NextNodeTime = gpGlobals->time + m_RoamDelay;   //:1407-1408
 *
 * Una sola casilla de destino compartida entre las dos. Y por eso un goblin
 * que pierde de vista al jugador se pone a pasear él solo, sin que nadie se
 * lo diga.
 */
function pasoDePaseo(manada, i, dt, { libre, suelo } = {}, U = U_POR_METRO) {
  if (!i.vagabundo?.pasea) return;     // sin `roam 1`, quieto y ya está
  if (!i.velocidad && !i.velocidadCorriendo) return;
  const n = i.donde;
  const donde = [n[0] * U, n[1] * U, n[2] * U];
  // El OJO, que es de donde sale el trazo del motor (`EyePosition()`), y
  // el CENTRO, que es desde donde mide el segundo bucle. Son tres alturas
  // distintas en el archivo y las tres se usan.
  const alto = i.ficha.ia?.alto ?? i.ficha.alto ?? 60;
  const ojo = [donde[0], donde[1] + alto * 0.9, donde[2]];
  const centro = [donde[0], donde[1] + alto * 0.5, donde[2]];
  const r = i.vagabundo.tic(dt, {
    rumbo: grados(i.yaw),
    donde, centro, ojo,
    // `UTIL_TraceLine(EyePosition(), VecDest, ...)` con `flFraction >= 1`.
    // Se traduce al `libre(x, y, z, dx, dz, dist)` que ya tenía el arnés
    // para no pedirle a quien tiene la física una segunda forma de
    // preguntar lo mismo.
    libre: (desde, hasta) => {
      if (!libre) return true;
      const dx = (hasta[0] - desde[0]) / U, dz = (hasta[2] - desde[2]) / U;
      const d = Math.hypot(dx, dz);
      if (!(d > 0)) return true;
      return libre(desde[0] / U, desde[1] / U, desde[2] / U, dx / d, dz / d, d, i);
    },
  });
  if (r?.destino) {
    i.destino = r.destino;
    i.cerca = r.cerca;
    // La animación de andar, que es `m_MoveAnim`: el destino puesto es
    // `MONSTER_HASMOVEDEST` y eso es lo que la elige.
    if (i.andando !== "pasea") { manada.pon(i, i.ficha.andando ?? manada.quieto(i)); i.andando = "pasea"; }
  }
  // El plazo de siete segundos: se suelta el destino aunque no se haya
  // llegado. Sin esto un bicho apuntado a 150 metros anda en línea recta
  // hasta la primera pared y se queda ahí para siempre.
  if (i.vagabundo.vencido) { i.vagabundo.llegado(); i.destino = null; }
  if (!i.destino) {
    if (i.andando !== null) { manada.pon(i, manada.quieto(i)); i.andando = null; }
    return;
  }
  // Paseando se ANDA: `m_Activity = ACT_WALK`.
  avanzar(i, dt, libre, suelo, U, { correr: false });
  // ── LLEGAR NO ES LO MISMO QUE CHOCAR ────────────────────────────────────
  //
  // Hasta el 22 las dos cosas soltaban el destino, y ahí estaba el temblor
  // que quedaba: un bicho encajado —las cuatro ratas hundidas en el suelo,
  // por ejemplo— chocaba, soltaba el destino, se ponía la animación de estar
  // quieto, esperaba los 2 s, pedía otro sitio, se ponía la de andar, volvía
  // a chocar. Dos cambios de animación por cada dos segundos, para siempre.
  //
  // El motor no hace eso. Chocar no suelta nada: el destino sólo se cae
  // cuando se llega (`StopWalking` desde `SetMoveDest`, línea 1026) o cuando
  // vence el `m_NodeCancelTime` de siete segundos. Mientras tanto el bicho
  // sigue empujando contra la piedra con la animación de andar puesta, que es
  // exactamente lo que se ve en MSR cuando a un monstruo le falla el grafo de
  // nodos. Feo, pero es el suyo, y no parpadea.
  if (i.frenado === "ya esta cerca") { i.vagabundo.llegado(); i.destino = null; }
}

/**
 * LA MANADA.
 *
 * `censo` es `build/gatecity/bichos.json` —lo que escribe `tools/bichos.mjs`,
 * el que junta las tres fuentes: el `.bsp` dice dónde, el `.script` dice qué
 * modelo y el `.mdl` cómo se mueve—. `secuenciasPorClave` es, por cada modelo,
 * la lista de secuencias de su `bicho.json`: de ahí salen las velocidades, las
 * duraciones y qué animación es de bucle.
 *
 * `cajasPorClave` es opcional y sólo la usa quien ponga colisionadores.
 */
export class Manada {
  constructor(censo, {
    secuenciasPorClave = new Map(), cajasPorClave = new Map(),
    azar = Math.random, historia = HISTORIA,
  } = {}) {
    this.censo = censo;
    this.U = censo?.unidadesPorMetro ?? U_POR_METRO;
    this.azar = azar;
    this.historia = historia;
    /** El reloj de la manada, en segundos. Lo mueve quien la haga avanzar. */
    this.t = 0;
    /** Qué ha pasado desde la última foto: golpes, muertes, encogimientos. */
    this.sucesos = [];
    this.instancias = [];

    for (const [n, c] of (censo?.colocados ?? []).entries()) {
      const secuencias = secuenciasPorClave.get(c.clave) ?? [];
      const i = {
        /** El identificador con el que este bicho viaja por el cable. */
        id: n,
        ficha: c,
        secuencias,
        // La caja del MODELO, que es de dónde sale el tamaño con el que choca.
        // La MEDIDA primero: la de la cabecera del `.mdl` viene vacía en casi
        // todos estos modelos, y una caja de lado cero da un colisionador que
        // no choca con nada y no da ningún error.
        caja: cajasPorClave.get(c.clave) ?? null,
        /** Dónde está, en METROS de escena. Era `nodo.position`. */
        donde: [c.escena[0], c.escena[1], c.escena[2]],
        /** El rumbo en radianes, convención de Three. Era `nodo.rotation.y`. */
        yaw: ((c.yaw ?? 0) * Math.PI) / 180,
        destino: null,
        cerca: 0,
        frenado: "sin destino",
        intencion: null,
        andando: null,
        // La velocidad que el propio archivo declara para su ciclo de andar:
        // `linearmovement` partido por la duración de la secuencia. Es lo que
        // impide que los pies patinen, y sale del `.mdl` y no de un número
        // elegido — el goblin da 72,2 unidades en 2 s, o sea 0,92 m/s.
        velocidad: velocidadDeSecuencia(secuencias, c.andando, this.U),
        // Y LA DE CORRER, que es otra secuencia y otro `linearmovement`. El
        // goblin declara `ANIM_RUN run` aparte de `setmoveanim walk`, y no es
        // decorativo: perseguir con la de pasear da un monstruo que te sigue
        // dando un paseo, y forzar la velocidad de correr sobre el ciclo de
        // andar da pies patinando. Las dos salen del archivo.
        velocidadCorriendo: velocidadDeSecuencia(secuencias, c.ia?.corriendo, this.U)
          || velocidadDeSecuencia(secuencias, c.andando, this.U),
        vida: c.ia?.vida ?? c.hp ?? null,
        vidaMaxima: c.ia?.vida ?? c.hp ?? null,
        muerto: false,
        desdeQueMurio: 0,
        /** Cuánto se ve el cadáver, de 1 a 0. Lo pinta quien dibuje. */
        opacidad: 1,
        /** Cuánto daño le ha hecho el jugador, por habilidad y propiedad. */
        recibido: {},
        /** Cuánto lleva con la misma pose de reposo, para volver a sortear. */
        tQuieto: 0,
        /** La animación PEDIDA. `gen` sube cada vez que hay que rebobinar. */
        anim: { nombre: null, gen: 0, unaVez: false },
        actual: null,
        nombreActual: null,
        // La cuenta de las dos cosas: cuántas veces se rebobinó y cuántas se
        // dejó correr. La sonda las mira porque «no parpadea» no se puede ver
        // desde fuera de otra manera — una animación que salta al fotograma 0
        // sesenta veces por segundo y una que no, valen lo mismo en una foto.
        sigue: { reinicios: 0, veces: 0 },
        // EL ESTADO DE LA REACCIÓN. Los tres relojes del motor, que son largos
        // y por eso hacen falta: treinta segundos entre encogimientos y cinco
        // entre gritos de dolor. Sin ellos un bicho al que le das seis veces
        // por segundo se encoge seis veces por segundo, que es un tic y no una
        // reacción.
        reaccion: {
          proximoEncogerse: -Infinity, proximoDolor: -Infinity,
          quietoHasta: -Infinity, proximoCambio: 0,
          parados: 0, encogidas: 0,
        },
        // EL VAGABUNDO: `SetWanderDest`, uno por instancia igual que el
        // `Cazador`. Lo lleva TODO el mundo, también el cofre y los tenderos:
        // la condición `roam` vive dentro y con ella a cero el objeto no hace
        // nada, que es lo que hace el motor
        // (`if (!HasConditions(MONSTER_ROAM)) return;`).
        vagabundo: new Vagabundo({
          ancho: c.ia?.ancho ?? c.ancho ?? 32,
          pasea: Boolean(c.ia?.pasea),
          azar,
        }),
        // Y EL CAZADOR, que es la decisión. Sólo lo llevan los que tienen ficha
        // de combate; un cofre del tesoro no piensa.
        cazador: c.ia ? new Cazador(c.ia, { azar }) : null,
        /** Dónde ha estado, para poder rebobinar. */
        rastro: [],
      };
      // ESTAR PARADO, que hasta el 21 se resolvía mal. Era `pon(c.parado ??
      // c.andando)`: si el script no nombraba la de estar quieto, se ponía la
      // de ANDAR. Y hay 33 de los 69 que no la nombran, así que el pueblo
      // entero estaba plantado en mitad de una zancada, con un pie levantado.
      this.pon(i, this.quieto(i));
      this.instancias.push(i);
    }
  }

  get n() { return this.instancias.length; }

  /** Los que se puede golpear: vivos y con vida que quitar. */
  vivos() { return this.instancias.filter((i) => !i.muerto && i.vida > 0); }

  de(id) { return this.instancias[id] ?? null; }

  /**
   * La animación de estar quieto, resuelta cada vez que se pide: el motor
   * vuelve a sortear en cada `SetActivity`, y un modelo con tres «idle» no se
   * queda siempre en la misma. Ver `src/play/actividad.js`.
   */
  quieto(i) {
    return animacionDeParado({
      nombrado: i.ficha.parado, secuencias: i.secuencias, azar: this.azar,
    }).que;
  }

  /**
   * PEDIR UNA ANIMACIÓN. Devuelve la secuencia elegida.
   *
   * ── PEDIR LA QUE YA ESTÁ PUESTA NO HACE NADA ──────────────────────────────
   *
   * El motor lo dice dos veces, y las dos con el mismo cuidado:
   *
   *     int animDesired = LookupSequence(TorsoAnimName);
   *     if (animDesired != m_pOwner->pev->sequence) //Continue playing the
   *       SetAnim(TorsoAnimName);                   //same uninterrupted
   *                       monsteranimation.cpp:160-162  //animation until
   *                                                     //told otherwise
   *
   *     if (pev->sequence != iSequence || !m_fSequenceLoops) pev->frame = 0;
   *                                                    monsters.cpp:1238
   *
   * O sea: rebobinar sólo si la secuencia CAMBIA, o si no es de bucle. Y eso no
   * es una optimización, es lo que se ve. `npc/human1.mdl` declara seis
   * secuencias con ACT_IDLE y `idle1` pesa 50 de 65, así que **77 de cada 100
   * sorteos salen la misma** — y sin esta guarda cada uno de esos rebobinaba el
   * ciclo a mano, que es el parpadeo del pueblo entero.
   *
   * Los golpes y las muertes SÍ rebobinan: no son de bucle, y además el motor
   * las pasa por `CAnimOnce`, que hace `SetAnim` incondicional
   * (monsteranimation.cpp:213-220). Por eso la guarda mira las dos cosas.
   */
  pon(i, nombre) {
    const s = buscarSecuencia(i.secuencias, nombre);
    if (!s) return null;
    if (i.actual?.seq === s && s.bucle) { i.sigue.veces++; return s; }
    i.sigue.reinicios++;
    i.actual = { seq: s };
    i.nombreActual = String(nombre ?? "").toLowerCase();
    i.anim = { nombre: s.nombre, gen: i.anim.gen + 1, unaVez: !s.bucle };
    i.tQuieto = 0;
    return s;
  }

  /**
   * `playanim critical <nombre>`: una vez, quedándose en el último fotograma y
   * sin que la interrumpa nada. Es lo que usan la esquiva, el encogerse y la
   * muerte, y lo que NO hay que usar para andar.
   */
  deUnaVez(i, nombre) {
    const s = buscarSecuencia(i.secuencias, nombre);
    if (!s) return false;
    i.sigue.reinicios++;
    i.actual = { seq: s };
    i.nombreActual = String(nombre ?? "").toLowerCase();
    i.anim = { nombre: s.nombre, gen: i.anim.gen + 1, unaVez: true };
    i.andando = null;
    i.tQuieto = 0;
    return true;
  }

  // ── los relojes ───────────────────────────────────────────────────────────

  /**
   * Los relojes que corren solos: volver a sortear la pose de reposo y el
   * cadáver que se desvanece. Antes era la mitad de `bichos.animar`, que además
   * movía los mezcladores; los mezcladores son de quien dibuja y esto no.
   */
  relojes(dt) {
    this.t += dt;
    // ── SE VUELVE A SORTEAR AL ACABAR EL CICLO ──────────────────────────────
    //
    // `SetActivity` no se llama una vez: se llama cada vez que la secuencia
    // termina, y vuelve a echar el dado.
    //
    //     else if (m_OldActivity != m_Activity || m_fSequenceFinished)
    //       { m_pAnimHandler = NULL; SetActivity(ACT_IDLE); }
    //                                       msmonsterserver.cpp:596-600
    //
    // Y eso no es un detalle, porque `dwarf/male1.mdl` declara TRES secuencias
    // con ACT_IDLE y con pesos: `idle` 10, `nod` 10 y `anim_xbow_aim_idle` 3. O
    // sea que en el juego los aldeanos **asienten con la cabeza** cada pocos
    // segundos, y sin volver a sortear se quedarían los 69 en la primera que
    // les tocó al nacer.
    for (const i of this.instancias) {
      if (i.muerto || i.andando !== null || i.destino) continue;
      // Sólo los que la sacan de la actividad: si su script la NOMBRA, el motor
      // no pasa por `SetActivity` y no hay nada que sortear.
      if (i.ficha.parado) continue;
      const dura = duracionDe(i.actual?.seq);
      if (!(dura > 0)) continue;
      i.tQuieto = (i.tQuieto ?? 0) + dt;
      if (i.tQuieto < dura) continue;
      i.tQuieto = 0;
      this.pon(i, this.quieto(i));
    }
    // EL CADÁVER, con los dos plazos del motor: veinte segundos quieto y luego
    // desvanecerse. `msmonsterserver.cpp:2688` pone el `think` a +20 s y
    // `SUB_FadeOut` baja el `renderamt` de 7 en 7 cada 0,1 s, o sea 3,6 s.
    //
    // Los plazos importan más de lo que parece: sin ellos el bicho se queda ahí
    // para siempre —y Gate City acaba siendo un osario— o desaparece en el
    // golpe, que se lee como «no ha muerto, se ha borrado».
    for (const i of this.instancias) {
      if (!i.muerto) continue;
      i.desdeQueMurio += dt;
      const t = i.desdeQueMurio - CADAVER.quieto;
      if (t <= 0) continue;
      i.opacidad = Math.max(0, 1 - t / CADAVER.desvanece);
    }
  }

  /**
   * Apunta dónde está cada uno, para poder rebobinar.
   *
   * Se llama una vez por paso del servidor y no por fotograma: el rastro tiene
   * que estar muestreado a un ritmo conocido para que `donde(id, t)` interpole.
   */
  apuntarRastro(t = this.t) {
    for (const i of this.instancias) {
      i.rastro.push({ t, donde: [i.donde[0], i.donde[1], i.donde[2]] });
      if (i.rastro.length > this.historia) i.rastro.shift();
    }
  }

  /**
   * **Dónde estaba este bicho en el instante `t`**, en metros.
   *
   * Es la mitad de `SV_SetupMove` que el 27 dejó medida y sin usar. Ahora sí se
   * usa, y por un motivo que sólo aparece cuando los bichos son del servidor:
   * el cliente los dibuja `ex_interp` en el pasado, así que cuando pega, le está
   * pegando a una posición vieja. Medir contra el presente haría que pegarle a
   * un goblin que corre fallara siempre, y eso no se ve como un problema de red:
   * se ve como que la espada atraviesa a los monstruos.
   */
  donde(id, t) {
    const i = this.de(id);
    if (!i) return null;
    const h = i.rastro;
    if (!h.length) return [...i.donde];
    if (t >= h[h.length - 1].t) return [...h[h.length - 1].donde];
    if (t <= h[0].t) return [...h[0].donde];
    let k = h.length - 1;
    while (k > 0 && h[k - 1].t > t) k--;
    const a = h[k - 1], b = h[k];
    const span = b.t - a.t;
    const f = span > 0 ? (t - a.t) / span : 0;
    return [0, 1, 2].map((j) => a.donde[j] + (b.donde[j] - a.donde[j]) * f);
  }

  // ── el movimiento ─────────────────────────────────────────────────────────

  /**
   * EL PASEO: `CMSMonster::SetWanderDest`.
   *
   * Quién pasea lo dice `roam 1` en el `npc_spawn` de su script, y en Gate City
   * lo dicen **53 de los 69**: los otros 16 —los tenderos, el alcalde, el
   * cofre— están clavados a propósito y tienen que seguir estándolo.
   */
  pasear(dt, arnes = {}, filtro = null) {
    for (const i of this.instancias) {
      if (i.muerto) continue;                // un cadáver no pasea
      if (filtro && !filtro(i)) continue;
      pasoDePaseo(this, i, dt, arnes, this.U);
    }
  }

  /**
   * LA CAZA. `npcatk_hunt` decide y esto ejecuta.
   *
   * `arnes` trae lo que este módulo no puede saber:
   *   `objetivos(i)` quién hay y de qué raza, en unidades
   *   `veA(i, id)`   línea de visión, que la tiene quien tenga la física
   *   `libre/suelo`  como en el paseo
   *   `golpear(i, id, dano)` qué hacer cuando acierta
   */
  cazar(dt, arnes = {}) {
    const { objetivos = () => [], veA = () => true, libre, suelo, golpear, ahora = this.t } = arnes;
    for (const i of this.instancias) {
      if (!i.cazador || i.muerto) continue;
      // QUIETO MIENTRAS SE ENCOGE: `npcatk_suspend_ai NPC_FLINCH_TIME`, que
      // son 1,5 s. El cazador no piensa y el cuerpo no avanza — la animación
      // de encogerse corre igual porque el mezclador va por su cuenta.
      if (ahora < (i.reaccion?.quietoHasta ?? -Infinity)) continue;
      const n = i.donde;
      const donde = [n[0] * this.U, n[1] * this.U, n[2] * this.U];
      // `objetivos(i)` y no `objetivos()`: la relación de razas es DE CADA
      // BICHO. Un censo único para los 69 haría que o te atacara el pueblo
      // entero o no te atacara nadie.
      const r = i.cazador.tic(dt, {
        donde,
        candidatos: objetivos(i),
        veA: (id) => veA(i, id),
      });
      // ENTRE CICLOS DE PENSAR el cazador no contesta, pero el cuerpo sigue
      // moviéndose — `Move()` está en el mismo `MonsterThink`. Si el destino
      // es del vagabundo, el que tiene que seguir corriendo es el paseo (que
      // anda, no corre, y lleva sus propios plazos); si es de la caza, basta
      // con seguir avanzando.
      if (!r) {
        if (i.vagabundo?.tieneDestino || !i.destino) pasoDePaseo(this, i, dt, arnes, this.U);
        else avanzar(i, dt, libre, suelo, this.U);
        continue;
      }
      i.intencion = r;

      if (r.accion === ACCION.GOLPEAR) {
        if (i.vagabundo?.tieneDestino) { i.vagabundo.llegado(); i.destino = null; }
        mirarA(i, r.destino, this.U);
        this.pon(i, i.ficha.ia.golpe);
        // La espera entre golpes es la del ataque sin evento en el modelo:
        // `HACK_ATTACK_DELAY 1.0`. El motor la saca del evento 600 de la
        // secuencia cuando lo hay, y ése todavía no lo leemos.
        i.cazador.haGolpeado(ESPERA_ENTRE_GOLPES);
        i.andando = null;
        // El acierto y el daño son del script, y el dado se tira aquí
        // porque es donde hay alguien a quien pegarle.
        if (acierta(i.ficha.ia, this.azar)) {
          const dano = danoDe(i.ficha.ia, this.azar);
          this._suceso("pega", { id: i.id, a: r.objetivo, dano: Math.round(dano * 10) / 10 });
          golpear?.(i, r.objetivo, dano);
        } else {
          this._suceso("falla", { id: i.id, a: r.objetivo });
        }
        continue;
      }

      // HUIR: el mismo movimiento de perseguir con el destino al revés, y con
      // la animación de correr. `npcatk_flee` hace `playanim break` para salir
      // del ataque y luego `playanim critical ANIM_RUN`.
      if (r.accion === ACCION.HUIR) {
        if (i.vagabundo?.tieneDestino) i.vagabundo.llegado();
        if (r.destino) { i.destino = r.destino; i.cerca = r.cerca ?? 1; mirarA(i, r.destino, this.U); }
        if (i.andando !== "huye") { this.pon(i, i.ficha.ia.corriendo ?? i.ficha.andando); i.andando = "huye"; }
        avanzar(i, dt, libre, suelo, this.U);
        continue;
      }

      if (r.accion === ACCION.PERSEGUIR || r.accion === ACCION.BUSCAR) {
        i.destino = r.destino;
        i.cerca = r.cerca;
        if (i.andando !== "corre") { this.pon(i, i.ficha.ia.corriendo ?? i.ficha.andando); i.andando = "corre"; }
        // Y el vagabundo se retira: la casilla de destino la tiene la caza.
        // Es `StopWalking` al revés — al soltarla se rearma el reloj de los
        // 2 s, así que al perder de vista al jugador el bicho no se pone a
        // pasear en el mismo fotograma.
        if (i.vagabundo?.tieneDestino) i.vagabundo.llegado();
        avanzar(i, dt, libre, suelo, this.U);
        continue;
      }
      // ── SIN NADIE A QUIEN PERSEGUIR, SE PASEA ──────────────────────────────
      //
      // El destino se suelta sólo si era de la CAZA. Si el que lo puso fue el
      // vagabundo hay que dejárselo: borrarlo cada fotograma sería pedirle un
      // sitio nuevo sesenta veces por segundo y no llegar nunca a ninguno.
      if (!i.vagabundo?.tieneDestino) i.destino = null;
      pasoDePaseo(this, i, dt, arnes, this.U);
    }
    // Los MUERTOS no: al morir se les quita el cazador, así que sin excluirlos
    // aquí el cadáver se levantaría a dar un paseo.
    this.pasear(dt, arnes, (i) => !i.cazador && !i.muerto);
  }

  /**
   * Un paso hacia el destino. Es `UTIL_MoveToOrigin` recortado a lo que hace
   * falta: ir en línea recta, subir hasta `m_StepSize` y no caerse.
   *
   * Lo que NO hace, y conviene decirlo: no rodea obstáculos. El motor tiene un
   * grafo de nodos y quince intentos de rumbo al azar
   * (`msmonsterserver.cpp:1081`). Aquí, si se choca, se para — que es
   * visiblemente tonto pero no finge ser otra cosa.
   */
  avanzarHacia(i, dt, arnes = {}) {
    return avanzar(i, dt, arnes.libre, arnes.suelo, this.U);
  }

  // ── el daño ───────────────────────────────────────────────────────────────

  /**
   * QUITARLE VIDA. Devuelve si ha muerto con este golpe.
   *
   * `cubo` es la habilidad y la propiedad que se apunta para la experiencia
   * —`swordsmanship.power`—, porque el motor no da experiencia al golpear: la va
   * **acumulando en el monstruo** y la reparte al morir. Ver `expDeLaMuerte` en
   * `src/play/golpe.js`.
   */
  herir(i, dano, { cubo = null, tipo = "", ahora = this.t, dados = {}, quien = null, esAliado = null } = {}) {
    if (!i || i.muerto || !(dano > 0)) return { muerto: false, vida: i?.vida ?? 0 };
    const ia = i.ficha.ia ?? {};
    // 1. EL PARRY, antes que nada: si para, no hay daño, no hay experiencia y
    //    no hay reacción. `flDamage` se queda en 0 y `MarkDamage` no se llama
    //    (giattack.cpp:1751), así que un golpe parado no enseña nada.
    // Los dos dados se pueden fijar por separado, y hay que fijar LOS DOS: con
    // sólo el del parry a 90 la parada sigue siendo azarosa, porque el del
    // atacante es `rand(acierto, 100)` y puede salir 100. Un dado «fijado» que
    // no fija nada da una sonda que pasa unas veces y no otras, y eso se lee
    // como un fallo del juego.
    const p = parryDelBicho({
      parry: ia.parry ?? 0, tipo,
      acierto: dados.acierto ?? aciertoDelGolpe(),
      tiradas: {
        ...(dados.parry !== undefined ? { parry: dados.parry } : {}),
        ...(dados.acc !== undefined ? { acierto: dados.acc } : {}),
      },
    });
    if (p.para) {
      i.reaccion.parados++;
      // `game_parry` de `spider_base.script:47`: la animación de esquivar, una
      // vez y sin que la interrumpa nada.
      if (ia.esquiva) this.deUnaVez(i, ia.esquiva);
      this._suceso("para", { id: i.id });
      return { muerto: false, vida: i.vida, parado: true, mensaje: ia.mensajeDeParry, tirada: p };
    }
    if (cubo) i.recibido[cubo] = (i.recibido[cubo] ?? 0) + dano;
    // 2. LA REACCIÓN se calcula con la vida ANTES de restar, porque el umbral
    //    de encogerse de `base_struck` es un ratio de la vida de ese momento
    //    (`local L_MIN_DMG $get(ent_me,hp)`), y el motor lo lee en
    //    `game_damaged`, o sea antes de aplicar el daño.
    const antes = i.vida ?? 0;
    i.vida = antes - dano;
    if (i.vida <= 0) {
      const r = this.matar(i, { quien, esAliado });
      return { muerto: true, vida: 0, avisados: r.avisados };
    }
    const r = reaccionAlGolpe({
      ficha: ia, vida: antes, dano, tipo, ahora,
      estado: {
        proximoEncogerse: i.reaccion.proximoEncogerse,
        proximoDolor: i.reaccion.proximoDolor,
        quieto: ahora < i.reaccion.quietoHasta,
        huyendo: Boolean(i.cazador?.huyendo),
        proximoCambio: i.reaccion.proximoCambio,
      },
      dados,
    });
    if (r.encoge) {
      i.reaccion.proximoEncogerse = r.encoge.hasta;
      i.reaccion.encogidas++;
      if (r.encoge.animacion) this.deUnaVez(i, r.encoge.animacion);
      // Y QUEDARSE QUIETO, que es la mitad del efecto: `npcatk_suspend_ai
      // NPC_FLINCH_TIME`. Sin esto se ve la animación pero el bicho sigue
      // andando hacia ti mientras la hace.
      if (r.encoge.quietoHasta) i.reaccion.quietoHasta = r.encoge.quietoHasta;
    }
    if (r.huye && i.cazador) {
      i.cazador.huyeDe(r.huye.objetivo ?? dados.quien ?? quien ?? null,
        { distancia: r.huye.distancia, tiempo: r.huye.tiempo });
    }
    if (r.proximoDolor !== undefined) i.reaccion.proximoDolor = r.proximoDolor;
    // El suceso va DESPUÉS de la reacción y lleva su resultado, porque de eso
    // depende qué sonido toca: la cadena de `base_struck` es excluyente
    // —encogerse, si no dolor, si no el del material— y quien la resuelve es
    // `reaccionAlGolpe`. Mandando sólo «le he quitado 8 de vida», el navegador
    // tendría que volver a decidirlo, y decidiría otra cosa.
    this._suceso("herido", {
      id: i.id, dano: Math.round(dano * 10) / 10, vida: Math.max(0, Math.round(i.vida)),
      suena: r.suena ?? null, encoge: Boolean(r.encoge), huye: Boolean(r.huye),
    });
    return { muerto: false, vida: i.vida, suena: r.suena, encoge: Boolean(r.encoge), huye: Boolean(r.huye) };
  }

  /**
   * AVISAR A LOS ALIADOS: `npcatk_alert_all_allies`, una esfera de aliados de
   * radio sacado de la vida máxima, sin línea de visión — se grita a través de
   * las paredes. Devuelve a cuántos ha avisado.
   *
   * `esAliado(a, b)` lo pone quien tenga la tabla de razas.
   */
  avisar(i, quien, { esAliado = null } = {}) {
    if (!i || i.ficha.ia?.noAvisa || quien === null || quien === undefined) return [];
    const U = this.U;
    const candidatos = this.instancias
      .map((o, n) => ({ i: n, o, donde: [o.donde[0] * U, o.donde[1] * U, o.donde[2] * U] }))
      .filter((c) => c.o.cazador && !c.o.muerto);
    const fuera = aQuienAvisa({
      // `o` también en el que grita, no sólo en los candidatos: `esAliado`
      // necesita la RAZA de los dos, y sin la instancia aquí se quedaba sin la
      // del que muere y devolvía «no es aliado» para todo el mapa. Ningún
      // control lo veía, porque avisar a cero es lo mismo que no avisar.
      de: { i: i.id, o: i, donde: [i.donde[0] * U, i.donde[1] * U, i.donde[2] * U] },
      vidaMaxima: i.vidaMaxima ?? i.ficha.ia?.vida ?? 0,
      candidatos,
      esAliado: esAliado ?? ((a, b) => b.o.ficha.script === i.ficha.script),
    });
    for (const n of fuera) this.instancias[n].cazador?.apuntarA(quien);
    return fuera;
  }

  /**
   * LA MUERTE: la animación que dice su script y dejar de pensar.
   *
   * `playanim critical ANIM_DEATH` (base_npc.script:185), y `critical` significa
   * que no la interrumpe nada — o sea una vez y quedarse en el último
   * fotograma.
   *
   * Quien tenga la física tiene que quitarle el colisionador: aquí no hay
   * mundo. Sin eso el cadáver sigue siendo un muro invisible.
   */
  matar(i, { quien = null, esAliado = null } = {}) {
    if (!i || i.muerto) return { muerto: false, avisados: [] };
    // AL MORIR SE GRITA. `base_npc.script:169-172`: si no había avisado ya,
    // `npcatk_alert_all_allies $get(ent_laststruck,id)`. O sea que matar a uno
    // en medio del pueblo te echa encima a los que estén a tiro de su grito.
    const avisados = this.avisar(i, quien, { esAliado });
    i.muerto = true;
    i.vida = 0;
    i.cazador = null;
    i.destino = null;
    i.desdeQueMurio = 0;
    this.deUnaVez(i, i.ficha.ia?.muerte ?? this.quieto(i));
    this._suceso("muere", { id: i.id, por: quien ?? null, avisados: avisados.length });
    return { muerto: true, avisados };
  }

  // ── lo que viaja ──────────────────────────────────────────────────────────

  /**
   * El estado de un bicho tal y como va por el cable.
   *
   * Los nombres son cortos porque van 69 de éstos en cada foto, veinte veces
   * por segundo: `p` posición, `y` rumbo, `a` animación, `g` la generación que
   * dice cuándo hay que rebobinarla, `m` muerto, `o` lo que se ve del cadáver.
   * Con los nombres largos la foto completa pasa de 6 kB.
   */
  estadoDe(i) {
    const red = (v) => Math.round(v * 1000) / 1000;
    const e = {
      id: i.id,
      p: [red(i.donde[0]), red(i.donde[1]), red(i.donde[2])],
      y: red(i.yaw),
      a: i.anim.nombre,
      g: i.anim.gen,
    };
    if (i.muerto) { e.m = 1; e.o = Math.round(i.opacidad * 100) / 100; }
    if (i.vida !== null) e.v = Math.max(0, Math.round(i.vida));
    return e;
  }

  /** La foto entera de la manada. */
  estado() { return this.instancias.map((i) => this.estadoDe(i)); }

  /**
   * **Aplicar una foto**, que es lo que hace el cliente cuando los bichos son
   * del servidor. Aquí no se simula nada: se coloca.
   *
   * Las animaciones se piden por `gen` y no por nombre, y hace falta: una
   * secuencia de una sola vez —un golpe, una muerte— hay que rebobinarla cuando
   * el servidor la pide otra vez, y comparando nombres dos golpes seguidos son
   * el mismo golpe.
   */
  aplicar(lista = []) {
    for (const e of lista) {
      const i = this.de(e.id);
      if (!i) continue;
      if (e.p) { i.donde[0] = e.p[0]; i.donde[1] = e.p[1]; i.donde[2] = e.p[2]; }
      if (typeof e.y === "number") i.yaw = e.y;
      if (typeof e.v === "number") i.vida = e.v;
      if (e.m) { i.muerto = true; i.opacidad = e.o ?? 1; i.cazador = null; i.destino = null; }
      if (e.a && e.g !== i.anim.gen) {
        const s = buscarSecuencia(i.secuencias, e.a);
        if (s) {
          i.actual = { seq: s };
          i.nombreActual = String(e.a).toLowerCase();
          i.sigue.reinicios++;
          i.anim = { nombre: e.a, gen: e.g, unaVez: !s.bucle };
        }
      }
    }
  }

  _suceso(que, datos) {
    this.sucesos.push({ que, ...datos });
    if (this.sucesos.length > 200) this.sucesos.shift();
  }

  /** Se lleva los sucesos y deja la lista vacía: son de un solo reparto. */
  recogerSucesos() {
    const s = this.sucesos;
    this.sucesos = [];
    return s;
  }
}
