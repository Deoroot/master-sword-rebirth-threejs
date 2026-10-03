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

import { Cazador, ACCION, acierta, danoDe, RELACION } from "./ia.js";
// EL 77: la regla de «¿ya está cerca?» en el único sitio donde está escrita,
// que es el mismo que mira el director de escenas. Dos cuentas de la misma
// distancia dan un NPC que la escena cree llegado y el movimiento no.
import { haLlegado } from "./escena.js";
import { parryDelBicho, aciertoDelGolpe } from "./parry.js";
import { reaccionAlGolpe, aQuienAvisa, apuntaAlQueTePega } from "./reaccion.js";
import { animacionDeParado } from "./actividad.js";
import { Vagabundo, grados } from "./paseo.js";
// EL 92: `atof`, para el `dmgmulti` del mapa (el 79: no es `Number`).
import { numDe } from "./guion.js";

/**
 * Lo que tarda en volver a golpear: `HACK_ATTACK_DELAY 1.0`.
 *
 * Es el del ataque «sin evento en el modelo». El motor prefiere el evento 600
 * de la secuencia de ataque cuando lo hay, y ése todavía no lo leemos del
 * `.mdl` — así que esto es el camino de repuesto del propio mod, no un número
 * elegido. Cuando se lea el evento, saldrá de ahí.
 *
 * EL 92: el evento ya se lee (`eventos` de cada secuencia, `tools/bicho.mjs`)
 * y es el que pone el DAÑO (`eventosDeAnimacion`). La espera NO ha cambiado:
 * de dónde la saca el motor no se ha leído en este experimento, y la frase de
 * arriba sigue siendo una promesa. Ver doc/MORDISCO_92.md.
 */
export const ESPERA_ENTRE_GOLPES = 1.0;

/**
 * EL 92: LOS DOS CÓDIGOS DE EVENTO DE ANIMACIÓN QUE LLAMAN AL GUION.
 *
 *     case 500: //Animation Event 500 - Call any script event
 *       if (pEvent->options) CallScriptEvent(pEvent->options);
 *     case 600: //Animation Event 600 - Call Attack() on my held weapon
 *       //... or do damage if its an anim type attack
 *       if (pEvent->options) CallScriptEvent(pEvent->options);
 *                                  msmonsterserver.cpp:1484-1493
 *
 * 400, 401 y 450 (saltar, avanzar en el salto, frenar) mueven el CUERPO y no
 * llaman a nadie: no se portan aquí (el cuerpo es de la IA). Lo demás cae en
 * `CBaseAnimating::HandleAnimEvent`, que no hace nada.
 */
export const EVENTOS_QUE_LLAMAN_AL_GUION = new Set([500, 600]);

/** `VIEW_FIELD_NARROW`, ±45° (util.h:178): el cono del golpe de un monstruo. */
export const CONO_ESTRECHO = 0.7;

/** Lo que puede subir de un paso: `m_StepSize = 18` (msmonsterserver.cpp:188). */
export const ESCALON = 18;

/**
 * LA CINTURA, en metros, y **es nuestra**: el motor no traza un rayo para andar.
 *
 * `UTIL_MoveToOrigin` acaba en `WALKMOVE`, que mueve la CAJA entera del bicho y
 * mira si cabe (`sv_move.cpp:211`). Nosotros no tenemos ese barrido: tenemos un
 * rayo, y un rayo a ras de suelo choca con cada adoquín y deja al bicho girando
 * toda su vida. Así que se sube a la cintura, que es la altura a la que una caja
 * de 60 unidades pasa o no pasa.
 *
 * Vive **aquí y no en el arnés** porque es una decisión de `avanzar`, no del
 * mundo. Cuando la sumaba el arnés, el paseo —que traza desde el OJO, como manda
 * `msmonsterserver.cpp:1084`— se llevaba una segunda cintura encima del ojo y su
 * rayo salía a 2,27 m del suelo en un enano de 1,37: elegía rumbos despejados a
 * la altura de la cabeza y se estrellaba contra los puestos del mercado. Medido
 * en Gate City, 300 s y 16 aldeanos: el episodio más largo contra una pared
 * pasaba de 44 s a 114 s.
 *
 * El contrato queda: **`libre(x, y, z, ...)` traza desde la `y` que se le da, tal
 * cual.** Quien quiera cintura, la suma.
 */
export const CINTURA = 0.9;

/**
 * EL OJO DE UN BICHO, EN UNIDADES, y es el ALTO ENTERO — el 81.
 *
 *     pev->view_ofs = Vector(0, 0, m_Height);     msmonsterserver.cpp:250
 *
 * Tres líneas por encima está el `UTIL_SetSize` cuyo casco trajo el 80, así que
 * el ojo y el casco los escribe la misma función con el mismo número: **el ojo
 * de un monstruo de Master Sword está justo en la tapa de su caja**, no dentro.
 * Para una rata de 32 son 32, encima de la cabeza. Raro, y es el suyo.
 *
 * ── LO QUE HABÍA, Y DE DÓNDE SALÍA ─────────────────────────────────────────
 *
 * Cuatro sitios hacían `alto * 0.9` llamándolo `EyePosition()`
 * (`pasoDePaseo`, `pasoMandado`, y los dos `veA` de `src/main.js` y
 * `src/red/fauna.js`). El 0,9 **es la proporción del JUGADOR**: su caja mide 72
 * y su ojo está a 64 (`src/play/movimiento.js:453`), o sea 0,889. Se le aplicó a
 * los bichos como si fuera una regla de anatomía, y no lo es: el jugador la
 * lleva en su caja y el monstruo tiene la suya en una línea distinta.
 *
 * No daba ningún error porque **a quien anda le da igual**: la proximidad se
 * mide con `Length2D`, que tira la altura. Se ve en dos sitios y ninguno es la
 * distancia a un punto:
 *
 *   - el rayo del paseo y el de `$cansee` salen un 10 % del alto bajos, y ésa es
 *     la altura a la que se decide si un rumbo está despejado o si te ve. El
 *     comentario de `CINTURA` de arriba cuenta lo que costó medirlo la otra vez:
 *     el episodio más largo contra una pared pasó de 44 s a 114 s por mover esa
 *     altura.
 *   - para quien VUELA la rama es `Length()` y la altura entra en la cuenta, así
 *     que ahí sí cambia a qué distancia se da por llegado.
 *
 * Y desde el 81 importa una tercera vez, que es la que lo destapó: un
 * `setmovedest <entidad>` manda **al ojo del objetivo** (npcscript.cpp:1660), y
 * el punto de superficie se calcula con los dos ojos. Ahí el ojo no es por dónde
 * se mira: es el destino.
 *
 * Vive en un solo sitio a propósito. Cuatro copias del mismo número es como se
 * consigue que tres se arreglen y la cuarta no.
 */
export const ojoDe = (i) => (i?.ficha?.ia?.alto ?? i?.ficha?.alto ?? 60);

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
 * ── EL 93: LA FÍSICA DE UN BICHO LANZADO ────────────────────────────────────
 *
 * Los tres números de `SV_Physics_Step` que mueven a un monstruo con velocidad
 * (ReHLDS, engine/sv_phys.cpp): `sv_gravity` 800 (:49, y Master Sword lo
 * vuelve a poner a 800 al empezar la partida, multiplay_gamerules.cpp:168), y la fricción del
 * primer fotograma en el suelo con `sv_friction` 4 y `sv_stopspeed` 100 (los
 * valores por omisión de los dos cvars, :52-53). Ver `Manada._fisica`.
 */
export const FISICA = Object.freeze({ gravedad: 800, friccion: 4, parada: 100 });
/**
 * Lo que baja el `origin` de quien sigue a un JUGADOR con `align_bottom`:
 * `origin.z += pOwner->pev->mins.z` (cbase.cpp:309-310), y en un jugador de
 * pie eso es −36 («in players, the bottom is 36 units lower»,
 * msitemdefs.h:55). Agachado serían −18 y no se distingue.
 */
export const ABAJO_DEL_JUGADOR = 36;

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
 * SI UN IDENTIFICADOR DE OBJETIVO ES UN JUGADOR.
 *
 * Hay dos convenciones y las dos son de verdad: `"jugador"` en la partida de un
 * solo jugador (`main.js:3702`) y `j<n>` con servidor (`Fauna.nombreDeJugador`,
 * fauna.js:170). Preguntarlo en un sitio es lo que evita que la rama de
 * `struck_by_enemy` se decida distinto en los dos mundos.
 */
const esJugador = (id) => id === "jugador" || /^j\d+$/.test(String(id ?? ""));

/**
 * EL SORTEO DEL BOTÍN, una vez por bicho y al NACER (el 82).
 *
 * `base_monster_shared.script:228-250`, dentro de `npc_post_spawn`:
 *
 *     if !NPC_NO_DROPS
 *     if( $rand(1,100) <= DROP_ITEM1_CHANCE ) { giveitem DROP_ITEM1 }
 *     ... y lo mismo del 2 al 5
 *
 * Son cinco tiradas INDEPENDIENTES, no una elección entre cinco: un bicho con
 * dos objetos puede soltar los dos, uno o ninguno. Eso importa porque siete
 * guiones declaran `DROP_ITEM2` además del primero.
 *
 * `$rand(1,100) <= P` con P entero es exactamente «P de cada 100», así que un
 * `azar()` en [0,1) se compara con `P / 100`. Con `P = 100` tiene que salir
 * SIEMPRE —el jefe jabalí de Edana lleva 100%— y por eso la comparación es
 * `<` contra `P/100` y no `<=`: `azar()` nunca devuelve 1.
 */
export function sorteoDeBotin(botin, azar = Math.random) {
  if (!Array.isArray(botin) || !botin.length) return [];
  const fuera = [];
  for (const b of botin) {
    const p = Number(b?.probabilidad ?? 0);
    if (!(p > 0) || !b?.objeto) continue;
    if (azar() < p / 100) fuera.push(String(b.objeto));
  }
  return fuera;
}

/**
 * La velocidad de una secuencia, del `linearmovement` que escribió el
 * compilador partido por su duración. En metros por segundo.
 *
 * No se elige: si el número estuviera mal, se vería — un bicho que patina o
 * que va de puntillas es exactamente el síntoma.
 */
export function velocidadDeSecuencia(secuencias, nombre, U = U_POR_METRO) {
  return velocidadDe(buscarSecuencia(secuencias, nombre), U);
}

/** Lo mismo, con la secuencia ya en la mano (el 94: la que echa el candado). */
export function velocidadDe(s, U = U_POR_METRO) {
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
 *
 * `valla` es el `Monsterclip`, y **va aquí y no en el arnés** porque aquí es
 * donde el motor lo mira. `SV_movestep` saca su `monsterClip` de las banderas de
 * la entidad (`sv_move.cpp:44`) y por eso el andar lo respeta; `UTIL_TraceLine`
 * lo pasa a `FALSE` a fuego (`pr_cmds.cpp:335`) y por eso **el rumbo del paseo y
 * la vista no lo ven**. Si se metiera en el `libre` del arnés se metería en las
 * tres cosas a la vez y los bichos esquivarían vallas que no pueden percibir —
 * que sería mejor y no sería Master Sword. Ver src/play/monsterclip.js.
 */
export function avanzar(i, dt, libre, suelo, U = U_POR_METRO, { correr = true, valla = null } = {}) {
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
  let v = correr ? (i.velocidadCorriendo || i.velocidad) : (i.velocidad || i.velocidadCorriendo);
  // ── EL 94: EL BICHO ANDA LO QUE ANDA SU ANIMACIÓN, Y A SU RITMO ──────────
  //
  // En el motor el paso NO sale de una velocidad del bicho: sale de la
  // secuencia que tiene puesta y de su ritmo,
  //
  //     float flTotal = m_flGroundSpeed * pev->framerate * flInterval
  //                     * m_SpeedMultiplier * ScriptMultiplier;
  //                                          msmonsterserver.cpp:1201
  //
  // y `m_flGroundSpeed` lo rehace `ResetSequenceInfo` cada vez que se pone una
  // secuencia (animating.cpp:112), con el `linearmovement` de ESA secuencia
  // (animation.cpp:266-267). O sea que mientras corre una de una sola vez
  // —`playanim once idle2`, el jabalí comiendo hierba (boar_base.script:85)—
  // el bicho avanza lo que avance `idle2`, que es CERO, aunque el destino siga
  // puesto: se para a comer y sigue andando cuando la suelta `CAnimOnce`
  // (monsteranimation.cpp:219-221). Aquí la de andar y la de correr ya están
  // en `velocidad`/`velocidadCorriendo`; la que hay que mirar es la que está
  // echando el candado, que es la que el motor tendría en `pev->sequence`.
  //
  // Y el ritmo es `pev->framerate`, que `SetAnimation` copia de `m_Framerate`
  // (msmonsterserver.cpp:2079-2081): `setanim.framerate .5` hace que la
  // araña ande a la mitad, no sólo que se mueva a cámara lenta. Ritmo 0, quieto
  // (el mordisco antes del primer segundo, doc/SALTO_93.md §3). Un ritmo
  // negativo andaría hacia atrás en el motor; aquí no anda (no se ha visto en
  // ningún guion de los cinco mapas).
  //
  // `m_SpeedMultiplier` (`movespeed`) y el `maxspeed` de los efectos no entran:
  // ver doc/ANIMACION_94.md §5.
  const deUnaVez = i.unaVezHasta !== null ? i.actual?.seq ?? null : null;
  if (deUnaVez) v = velocidadDe(deUnaVez, U);
  v *= i.fisica?.ritmoAnim ?? 1;
  if (!(v > 0)) {
    i.frenado = deUnaVez ? `la animacion ${deUnaVez.nombre} no avanza` : "sin velocidad";
    return false;
  }
  const paso = Math.min(v * dt, falta - cerca);
  const ux = dx / falta, uz = dz / falta;
  // Se mira delante antes de moverse, igual que en el paseo: entrar en la
  // pared y salir después es lo que hace que un bicho tiemble en una esquina.
  // A la CINTURA, y la suma quien anda: ver `CINTURA`. El paseo no la quiere.
  const mirada = Math.max(0.5, paso * 4);
  if (libre && !libre(n[0], n[1] + CINTURA, n[2], ux, uz, mirada, i)) { i.frenado = "pared delante"; return false; }
  // Y LA VALLA, con su propia causa de frenado: «pared delante» y «monsterclip»
  // se ven idénticos en pantalla —un bicho empujando contra nada— y son dos
  // cosas distintas. Sin separarlos, medir si la valla sirve es imposible.
  if (valla?.bloquea(
    [n[0], n[1] + CINTURA, n[2]],
    [n[0] + ux * mirada, n[1] + CINTURA, n[2] + uz * mirada],
  )) { i.frenado = "monsterclip"; return false; }
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

/**
 * ESCRIBIR LA CASILLA DEL DESTINO — el 77.
 *
 * `m_MoveDest` es UNA en el motor y la escriben el paseo, la caza y los
 * guiones. Esto la escribe y de paso deja copia en `ultimoDestino`, que es el
 * valor que sobrevive a `StopWalking` y el que una escena compara para saber
 * si **otro le ha quitado al NPC de la mano** (`npcact.cpp:229`).
 *
 * Sin esta copia el corte no se detecta: la caza le pisaría el destino al
 * `ms_npcscript`, el NPC se iría a perseguir a alguien y la escena seguiría
 * esperando a que llegara a un sitio al que ya no va. No daría un error: daría
 * una escena colgada para siempre y un `firewhendone` que nunca se dispara.
 */
function ponerDestino(i, origen, cerca) {
  i.destino = origen;
  i.cerca = cerca;
  i.ultimoDestino = origen ? { origen: [...origen], proximidad: Number(cerca) } : null;
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
function pasoDePaseo(manada, i, dt, arnes = {}, U = U_POR_METRO) {
  const { libre, suelo } = arnes;
  if (!i.vagabundo?.pasea) return;     // sin `roam 1`, quieto y ya está
  if (!i.velocidad && !i.velocidadCorriendo) return;
  const n = i.donde;
  const donde = [n[0] * U, n[1] * U, n[2] * U];
  // El OJO, que es de donde sale el trazo del motor (`EyePosition()`), y
  // el CENTRO, que es desde donde mide el segundo bucle. Son tres alturas
  // distintas en el archivo y las tres se usan.
  const alto = i.ficha.ia?.alto ?? i.ficha.alto ?? 60;
  // El ojo es el alto ENTERO (`view_ofs = m_Height`): ver `ojoDe`. El centro sí
  // es la mitad, porque el casco va de 0 a `m_Height` y `Center()` es su media.
  const ojo = [donde[0], donde[1] + ojoDe(i), donde[2]];
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
    ponerDestino(i, r.destino, r.cerca);
    // La animación de andar, que es `m_MoveAnim`: el destino puesto es
    // `MONSTER_HASMOVEDEST` y eso es lo que la elige.
    if (i.andando !== "pasea") { manada.ponDeAndarOParar(i, i.ficha.andando ?? manada.quieto(i)); i.andando = "pasea"; }
  }
  // El plazo de siete segundos: se suelta el destino aunque no se haya
  // llegado. Sin esto un bicho apuntado a 150 metros anda en línea recta
  // hasta la primera pared y se queda ahí para siempre.
  if (i.vagabundo.vencido) { i.vagabundo.llegado(); i.destino = null; }
  if (!i.destino) {
    // EL 94: `andando` a `null` no basta para saber que ya está parado. Cuando
    // vence una de una sola vez con destino, `relojes` pone la de ANDAR y deja
    // `andando` a `null` (para que la caza vuelva a elegir ritmo); si después
    // se suelta el destino, con sólo mirar `andando` la de andar se quedaba
    // puesta: el jabalí **andaba en el sitio** hasta el siguiente paseo
    // (medido: 2 s seguidos con `walk` y cero de avance). El motor pide la de
    // reposo en cada `Think` sin destino (msmonsterserver.cpp:589-594).
    const andaSinDestino = i.anim?.nombre && i.ficha.andando
      && String(i.anim.nombre).toLowerCase() === String(i.ficha.andando).toLowerCase();
    if (i.andando !== null || andaSinDestino) { manada.ponDeAndarOParar(i, manada.quieto(i)); i.andando = null; }
    return;
  }
  // Paseando se ANDA: `m_Activity = ACT_WALK`.
  avanzar(i, dt, libre, suelo, U, { correr: false, valla: arnes.valla });
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
 * UN PASO HACIA UN DESTINO MANDADO — `CMSMonster::SetMoveDest`,
 * msmonsterserver.cpp:988-1053. El 77.
 *
 * Es la otra mitad de `pasoDePaseo`: el mismo `avanzar`, pero el destino lo ha
 * puesto una escena (`ms_npcscript`) o un `setmovedest` de un guion, y por eso
 * **llegar significa algo** — hay quien está esperando a que se llegue.
 *
 * El motor llama a `SetMoveDest` y a `SetWanderDest` en este orden y SIEMPRE
 * (`msmonsterserver.cpp:569-574`); quien decide cuál manda es la casilla del
 * destino, no un `if`. Aquí el `if` existe —`i.mandado`— porque las dos
 * casillas no están fundidas en una, y lo que lo sustituye es aplazar los dos
 * relojes del paseo en cada paso, que es lo que hace `MoveThink` (npcact.cpp:234).
 *
 * ── LOS TRES AVISOS QUE SE MANDAN AL GUION ─────────────────────────────────
 *
 *     game_movingto_dest   cada paso, con el ángulo exacto como PARAM1  :1051
 *     game_stopmoving      desde `StopWalking`, AL LLEGAR               :1413
 *     game_reached_dest    justo después de `StopWalking`               :1027
 *
 * **El orden importa y es contraintuitivo**: `game_stopmoving` llega ANTES que
 * `game_reached_dest`, porque `SetMoveDest` llama primero a `StopWalking()`
 * (`:1026`) y el evento de llegada va en la línea siguiente. Un guion que
 * reaccione a los dos los recibe en ese orden y no en el otro.
 */
export function pasoMandado(manada, i, dt, arnes = {}, U = U_POR_METRO) {
  const { libre, suelo } = arnes;
  const m = i.mandado;
  if (!m) return false;

  // `if (pev->movetype == MOVETYPE_FOLLOW || MOVETYPE_NONE) return;` — :1002.
  // Aquí el equivalente es no tener con qué andar, y se dice en vez de quedarse
  // callado: un NPC sin secuencia de andar con un destino puesto es un NPC que
  // no llega nunca y una escena que no acaba nunca.
  if (!i.velocidad && !i.velocidadCorriendo) { i.frenado = "sin velocidad"; return false; }

  // Mientras la escena manda, el paseo espera. `MoveThink` rearma los dos
  // relojes cada 0,1 s; aquí se hace en cada paso, que es más a menudo y da el
  // mismo resultado porque lo que cuenta es que no venzan.
  i.vagabundo?.aplazar(2.0, dt);

  const n = i.donde;
  // `EyePosition()`, en unidades y en los ejes de este proyecto. Para quien
  // anda da igual —`Length2D` tira la altura— y para quien vuela no, así que
  // se pasa el ojo de verdad y no el origen. Y es el alto ENTERO: ver `ojoDe`,
  // que es lo que el 81 corrigió aquí.
  const ojo = [n[0] * U, n[1] * U + ojoDe(i), n[2] * U];

  // ── ¿YA ESTÁ CERCA? ────────────────────────────────────────────────────
  //
  // EL VIAJE QUE NO LLEGABA NUNCA, UNO DE CADA CINCO — el 81.
  //
  // `haLlegado` es el `<=` del motor y es correcto: estar EXACTAMENTE a la
  // distancia de proximidad ya es haber llegado (msmonsterserver.cpp:1018). Lo
  // que no es del motor es que aquí se aterrice exactamente ahí **siempre**:
  // `avanzar` topa el paso a `falta - cerca` (decisión de este puerto, para que
  // el bicho no se meta dentro de su objetivo), así que el último paso deja al
  // NPC clavado en el borde del círculo. El motor no hace eso — `UTIL_MoveToOrigin`
  // da el paso entero y se mete dentro—, o sea que para el motor el caso del
  // borde es raro y aquí es EL caso.
  //
  // Y en el borde, un `<=` entre flotantes es una moneda al aire. Medido:
  // recomponer `(d/U - p/U) * U` deja un error de ±4e-14 unidades, y para
  // 1 900 pares de distancia y proximidad **el 21,3 % cae del lado de «todavía
  // no»**. Ese NPC se queda parado en el sitio con la animación de andar puesta,
  // la condición sin apagar y `game_reached_dest` sin disparar: la escena del
  // mapa que lo espera **no acaba jamás**, y un `firewhendone` nunca se dispara.
  // Es el fallo que el 77 dejó latente y que sólo se ve una vez de cada cinco,
  // o sea de la familia del 76: lo que falla a veces gasta la sesión siguiente.
  //
  // La holgura es de una millonésima de unidad —25 nanómetros— y no puede tapar
  // un fallo de verdad: no llegar se mide en decenas de unidades. No cambia la
  // regla, que sigue siendo «en el círculo ya es dentro»; sólo impide que la
  // decida el bit menos significativo de un `double`.
  const EN_EL_BORDE = 1e-6;
  if (haLlegado({
    destino: m.origen, ojo, proximidad: m.proximidad + EN_EL_BORDE,
    vuela: Boolean(i.ficha.vuela),
  })) {
    // `pev->angles.y = ExactAngle.y` — al llegar se mira AL DESTINO (:1021-1023).
    // Puede que una escena lo sobrescriba un instante después con el `angles`
    // de su entidad (npcact.cpp:249); son dos giros y el que queda es el otro.
    mirarA(i, m.origen, U);
    i.llegadas++;
    manada.pararDeAndar(i);                        // `StopWalking()` — :1026
    m.alLlegar?.();                                // `game_reached_dest` — :1027
    return true;
  }

  // No ha llegado: se anda. `m_Activity = ACT_WALK` (:1047), o sea la de ANDAR
  // y no la de correr — con la velocidad de correr sobre el ciclo de andar los
  // pies patinan, que es el síntoma que este proyecto ya conoce.
  i.destino = m.origen;
  i.cerca = m.proximidad;
  const avanzo = avanzar(i, dt, libre, suelo, U, { correr: false, valla: arnes.valla });
  // `CallScriptEvent("game_movingto_dest", &Parameters)` con `VecToString(
  // ExactAngle)` dentro (:1046-1051). Se manda aunque se haya chocado: el
  // motor lo manda igual, porque esta función no sabe si `Move` avanzará.
  m.alAndar?.(grados(i.yaw));
  return avanzo;
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
    /**
     * EL 91: QUIEN OYE LOS GOLPES PARA EL GUION DEL BICHO.
     *
     * `(suceso) => void`, con `suceso = { que, i, ... }`. Lo enchufa
     * `InteraccionesNpc.enchufarA`, que es quien tiene los guiones. Va aparte
     * de `sucesos` porque aquello es la foto para el cable y se vacía cuando
     * quiere quien la lleva; esto tiene que llegar en el MOMENTO, dentro del
     * golpe, porque el orden del motor importa (`game_struck` corre con la
     * vida de ANTES, msmonsterserver.cpp:2380-2388).
     *
     * Sin oyente no pasa nada y se CUENTA en `costuraSinOyente`: el servidor
     * de `src/red/` todavía no lo enchufa, y eso tiene que verse.
     */
    this.oyente = null;
    this.costuraSinOyente = 0;
    this.costuraFallos = 0;
    /**
     * EL 92: LO QUE HA PASADO CON LOS GOLPES QUE DA EL GUION. Ver
     * `eventosDeAnimacion` y `_golpeDelGuion`. `atacaPorGuion` son los
     * ataques en los que la IA NO ha tirado su dado porque el daño lo pone el
     * evento de animación; `eventos` los eventos 500/600 entregados al guion;
     * y el resto, lo que hizo cada `dodamage`/`xdodamage` del guion. Se
     * cuenta para que «el guion pega» se pueda leer desde fuera sin
     * recalcularlo (el 65).
     */
    this.golpesDelGuion = {
      atacaPorGuion: 0, eventos: 0, pedidos: 0, entran: 0, fallan: 0,
      alAire: 0, noPuede: 0, sinObjetivo: 0, sinArnes: 0, formaSinPortar: 0,
    };

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
        /**
         * FUERA DEL MUNDO, y es distinto de muerto.
         *
         * 38 de las 69 entidades de bicho de Gate City no son monstruos: son la
         * ficha que usa un `msarea_monsterspawn`, y el motor las borra al
         * registrarlas (`SUB_Remove`, msmonsterserver.cpp:129). Aquí no se borran
         * —**el protocolo manda los bichos por índice y el índice no puede
         * moverse**— así que se quedan dormidas: no se simulan, no chocan y no se
         * dibujan hasta que su área las saca. Ver src/play/aparecer.js.
         */
        dormido: Boolean(c.aparecedor),
        /**
         * Si lo maneja un área. **`dormido` cambia y esto no**: hace falta saber,
         * cuando el cadáver acaba de desvanecerse, si el bicho tiene que salir del
         * mundo (ficha de un área) o quedarse de cadáver invisible para siempre
         * (los 31 aldeanos, que no vuelven porque nadie los saca).
         */
        plantilla: Boolean(c.aparecedor),
        destino: null,
        cerca: 0,
        // ── EL 77: CUANDO EL DESTINO LO MANDA OTRO ──────────────────────────
        //
        // En el motor hay **una sola casilla**, `m_MoveDest`, y la escriben tres
        // cosas: el paseo, la caza y los guiones (`setmovedest` y
        // `ms_npcscript`). Aquí la casilla sigue siendo una —`destino`— y esto
        // dice QUIÉN la tiene, que es lo que el motor lleva en
        // `m_MonsterState == MONSTERSTATE_SCRIPT`.
        //
        // Sin el «quién», llegar no se puede distinguir de que el paseo haya
        // elegido otro sitio, y entonces una escena no sabe si ha terminado.
        mandado: null,          // `{ origen, proximidad, anim, paraLaIa, dueño }`
        /**
         * `m_MoveDest` EL VALOR, que **no se borra nunca**: `StopWalking` apaga
         * la condición y deja el `dest_t` escrito (msmonsterserver.cpp:1407).
         * De esa diferencia depende que `setmovedest none` haga que una escena
         * del mapa se crea que el NPC ha llegado. Ver `src/play/escena.js`.
         */
        ultimoDestino: null,
        /** `m_MonsterState == MONSTERSTATE_SCRIPT` (npcact.cpp:181). */
        enEscena: false,
        /** `MONSTER_NOAI`, que lo pide el `stopai` del mapa (npcact.cpp:156-157). */
        sinIa: false,
        /** Cuántas veces ha llegado a un destino mandado. Para las sondas. */
        llegadas: 0,
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
        /**
         * LO QUE LLEVA ENCIMA, sorteado AL NACER y no al morir (el 82).
         *
         * El mod lo tira en `npc_post_spawn` —un segundo después de aparecer—
         * con `giveitem` (base_monster_shared.script:228-250), y al morir
         * `DropAllItems()` suelta el inventario (msmonsterserver.cpp:2614).
         * O sea que el pellejo del jabalí **se decide cuando nace**: si el dado
         * dijo que no, no hay nada que soltar por bien que lo mates.
         *
         * Sortearlo aquí y no en la muerte no es un detalle de estilo: con un
         * 20 %, hacerlo al morir daría una tirada por muerte y **el mismo bicho
         * resucitado volvería a tirar**, que no es lo que hace el motor.
         */
        llevaEncima: sorteoDeBotin(c.ia?.botin, azar),
        /** Cuánto lleva con la misma pose de reposo, para volver a sortear. */
        tQuieto: 0,
        /**
         * EL 91: cuántas veces ha vuelto a nacer. Cada `revivir` es una
         * entidad nueva en el motor y con ella un guion nuevo; el guion se
         * guarda con este número y se rehace cuando no coincide.
         */
        nacimientos: 0,
        /** La animación PEDIDA. `gen` sube cada vez que hay que rebobinar. */
        anim: { nombre: null, gen: 0, unaVez: false },
        /**
         * HASTA CUÁNDO NO SE LE PUEDE CAMBIAR LA ANIMACIÓN — el 80.
         *
         * Es `CAnimOnce` del motor, que es un objeto y aquí es un reloj. Una
         * animación de una sola vez **no suelta el sitio hasta que acaba**:
         *
         *     bool CAnimOnce::CanChangeTo(...) {
         *       return m_fSequenceFinished ? true : false; }
         *                               monsteranimation.cpp:217-220
         *
         * y `SetAnimation` le pregunta antes de tocar nada
         * (msmonsterserver.cpp:2023), con el aviso de Thothie delante: «if you
         * 'dance' around an affected monster, he can never attack, as his swing
         * anims break».
         *
         * `null` es «no hay ninguna corriendo». Lo pone `pon`, lo salta
         * `deUnaVez` —que es `playanim critical`, y ése rompe antes de poner— y
         * lo vence `relojes`.
         */
        unaVezHasta: null,
        actual: null,
        nombreActual: null,
        // La cuenta de las dos cosas: cuántas veces se rebobinó y cuántas se
        // dejó correr. La sonda las mira porque «no parpadea» no se puede ver
        // desde fuera de otra manera — una animación que salta al fotograma 0
        // sesenta veces por segundo y una que no, valen lo mismo en una foto.
        // `cambiosDeActividad` cuenta sólo los saltos andar↔parado, que son
        // los del temblor del encajado. `reinicios` cuenta TODOS los cambios
        // de secuencia, y desde que la pose de reposo vuelve a sortearse de
        // verdad (59) eso incluye parado→parado, que es correcto y no tiembla.
        // `rechazos` es del 80: cuántas peticiones ha tirado el candado de
        // `CAnimOnce`. Va con las otras dos porque mide lo mismo —si la
        // animación se respeta— y porque un cero aquí con un bicho peleando
        // significa que la guarda no se está ejecutando.
        sigue: { reinicios: 0, veces: 0, cambiosDeActividad: 0, rechazos: 0 },
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
        /**
         * EL 93: EL CUERPO CUANDO LO LLEVA EL GUION. Ver `cuerpoDe` y
         * `_fisica`. `vel` en UNIDADES/s y ejes del motor (Z arriba), `null` si
         * nadie lo ha lanzado; `sigue` a quién va pegado (`setfollow`);
         * `manda` dice que la IA no lo toca (el salto de la araña, del
         * `setvelocity` al `movespeed 1` de `spider_latch_resetmovement`).
         * `ritmoAnim` es `m_Framerate` (`setanim.framerate`) y `parado` el
         * `setidleanim` cuando no es el de la ficha.
         */
        fisica: {
          vel: null, gravedad: 1, enSuelo: true, sigue: null, manda: false,
          ritmoAndar: 1, ritmoAnim: 1, parado: null, saltos: 0, aterrizajes: 0,
        },
      };
      // ESTAR PARADO, que hasta el 21 se resolvía mal. Era `pon(c.parado ??
      // c.andando)`: si el script no nombraba la de estar quieto, se ponía la
      // de ANDAR. Y hay 33 de los 69 que no la nombran, así que el pueblo
      // entero estaba plantado en mitad de una zancada, con un pie levantado.
      this.ponDeAndarOParar(i, this.quieto(i));
      this.instancias.push(i);
    }
  }

  get n() { return this.instancias.length; }

  /** Los que se puede golpear: vivos y con vida que quitar. */
  vivos() { return this.instancias.filter((i) => !i.muerto && i.vida > 0); }

  de(id) { return this.instancias[id] ?? null; }

  /** El bicho que el mapa llama así por su `targetname`, vivo. El 77. */
  porObjetivo(nombre) {
    const n = String(nombre ?? "");
    if (!n) return null;
    return this.instancias.find((i) => i.ficha?.objetivo === n && !i.muerto && !i.dormido) ?? null;
  }

  /**
   * PONER UN DESTINO MANDADO — el 77.
   *
   *     pMonster->m_MoveDest = m_MoveDest;
   *     pMonster->SetConditions(MONSTER_HASMOVEDEST);
   *     if (m_fStopAI) pMonster->SetConditions(MONSTER_NOAI);
   *     pMonster->m_Activity = ACT_WALK;
   *     pMonster->m_hEnemy = this;
   *     if (m_sMoveAnim) SetAnimation(MONSTER_ANIM_WALK, m_sMoveAnim);
   *                                                      npcact.cpp:154-165
   *
   * `m_hEnemy = this` no se porta como «tiene un enemigo»: el motor usa esa
   * casilla para que el NPC mire al sitio y `FireTarget` la deshace al acabar
   * (`:311`). Portarla como enemigo haría que el NPC se defendiera de un punto
   * del mapa — y, peor, que la guarda de `Act` (`m_hEnemy != NULL`, `:131`)
   * rechazara la siguiente escena. Lo que sí se porta es el efecto: mientras
   * una escena manda, la caza no le quita la casilla si no tiene a nadie.
   *
   * @param origen      el destino en UNIDADES y ejes de este proyecto.
   * @param proximidad  `GetDefaultMoveProximity()`, en unidades.
   * @param anim        `m_sMoveAnim`, o `null` para dejar la que lleve.
   * @param alLlegar    `game_reached_dest`.
   * @param alAndar     `game_movingto_dest`, con el rumbo en grados.
   */
  mandarA(i, { origen, proximidad, anim = null, paraLaIa = false, alLlegar = null, alAndar = null, alParar = null, dueño = null } = {}) {
    if (!i || !Array.isArray(origen) || !Number.isFinite(Number(proximidad))) return false;
    i.mandado = { origen: [...origen], proximidad: Number(proximidad), alLlegar, alAndar, alParar, dueño };
    i.ultimoDestino = { origen: [...origen], proximidad: Number(proximidad) };
    i.destino = i.mandado.origen;
    i.cerca = i.mandado.proximidad;
    i.sinIa = Boolean(paraLaIa);
    // El paseo suelta su destino: la casilla la tiene ahora la escena. Es lo
    // mismo que ya hace la caza al cogerla.
    if (i.vagabundo?.tieneDestino) i.vagabundo.llegado();
    // `SetAnimation(MONSTER_ANIM_WALK, m_sMoveAnim)` — y si el mapa no nombra
    // ninguna, la de andar del propio bicho, que es lo que el motor tiene
    // puesto ya. Nunca la de estar parado: andar con la de parado es el
    // deslizamiento que el 21 arregló.
    const pedida = anim ?? i.ficha.andando ?? this.quieto(i);
    this.ponDeAndarOParar(i, pedida);
    // Y SE APUNTA CUÁL SE PIDIÓ, que no es lo mismo que cuál se puso: `pon`
    // devuelve `null` si el `.mdl` no tiene esa secuencia, y en Node no hay
    // `.mdl` ninguno. Sin esto, «¿pidió la de correr?» sólo se puede medir en
    // un navegador, y entonces no se mide: es el `nombreActual` a `null` que
    // dejó esta prueba verde por no poder ver nada.
    i.animPedida = pedida ?? null;
    i.andando = "escena";
    return true;
  }

  /**
   * `CMSMonster::StopWalking` — msmonsterserver.cpp:1400-1414. El 77.
   *
   *     ClearConditions(MONSTER_HASMOVEDEST);
   *     m_NextNodeTime = gpGlobals->time + m_RoamDelay;
   *     m_Activity = ACT_IDLE;
   *     if (!HasConditions(MONSTER_TRADING)) m_hEnemy = NULL;
   *     m_Wandering = true;
   *     CallScriptEvent("game_stopmoving");
   *
   * **El `dest_t` NO se borra**: lo que se apaga es la condición. De eso
   * depende el `setmovedest none` que hace que una escena se crea que el NPC
   * ha llegado — ver `src/play/escena.js`.
   */
  pararDeAndar(i, { avisar = true } = {}) {
    if (!i) return false;
    const aviso = i.mandado?.alParar ?? null;
    i.mandado = null;                      // `ClearConditions(MONSTER_HASMOVEDEST)`
    i.destino = null;
    i.cerca = 0;
    i.sinIa = false;
    i.frenado = "sin destino";
    // `m_NextNodeTime = time + m_RoamDelay`: al soltar el destino el paseo
    // espera sus dos segundos. Sin esto el NPC se pone a pasear en el mismo
    // fotograma en que acaba la escena.
    i.vagabundo?.llegado();
    this.ponDeAndarOParar(i, this.quieto(i));           // `m_Activity = ACT_IDLE`
    i.andando = null;
    if (avisar) aviso?.();                 // `CallScriptEvent("game_stopmoving")`
    return true;
  }

  /**
   * EL ASA QUE `src/play/escena.js` NECESITA, construida aquí.
   *
   * Va aquí y no en `src/main.js` para que una prueba de Node pueda mover a un
   * NPC de verdad por el mismo sitio por el que lo mueve el juego. Es la lección
   * del 59 y del 63: si el asa la construye quien prueba, lo que se prueba es
   * el asa y no el viaje.
   */
  asaDeEscena(i, { evento = null, animar = null, secuenciaAcabada = null } = {}) {
    const manada = this;
    return {
      get vivo() { return Boolean(i) && !i.muerto && !i.dormido; },
      get enEscena() { return Boolean(i.enEscena); },
      /** `m_hEnemy != NULL` — de verdad, o sea con alguien a quien pegar. */
      get enemigo() { return Boolean(i.cazador?.objetivo); },
      get ancho() { return i.ficha.ia?.ancho ?? i.ficha.ancho ?? null; },
      /** `GetDefaultMoveProximity()`, ya horneada en `cercaniaDeDestino`. */
      get proximidad() { return i.ficha.ia?.cercaniaDeDestino ?? null; },
      /** `m_MoveDest` el valor, que sobrevive a `StopWalking`. */
      destinoActual: () => (i.ultimoDestino ? { ...i.ultimoDestino, origen: [...i.ultimoDestino.origen] } : null),
      /** `MONSTER_HASMOVEDEST`, la condición. */
      tieneDestino: () => Boolean(i.mandado),
      mandarA: ({ destino, proximidad, anim, paraLaIa, dueño }) => manada.mandarA(i, {
        origen: destino, proximidad, anim, paraLaIa, dueño,
        // Los tres avisos al guion, en el orden del motor: `game_stopmoving`
        // sale de `StopWalking` y por eso llega ANTES que `game_reached_dest`.
        alLlegar: () => evento?.("game_reached_dest"),
        alAndar: (rumbo) => evento?.("game_movingto_dest", [String(rumbo)]),
        alParar: () => evento?.("game_stopmoving"),
      }),
      mirar: (angulos) => {
        // `pev->angles` del mapa es `pitch yaw roll` en GRADOS de GoldSrc; el
        // `yaw` del nodo crece al revés y en radianes. Es el mismo cambio que
        // hace `mirarA`, y por eso se hace aquí y no en `escena.js`.
        const yaw = Number(angulos?.[1]);
        if (Number.isFinite(yaw)) i.yaw = (yaw * Math.PI) / 180;
      },
      animacionDeReposo: () => { manada.ponDeAndarOParar(i, manada.quieto(i)); i.andando = null; },
      /**
       * `SetAnimation(MONSTER_ANIM_ONCE, m_sActionAnim)` — npcact.cpp:198.
       *
       * Se apunta CUÁNDO acabaría, porque `m_fSequenceFinished` lo pone el
       * mezclador del motor y aquí el mezclador es de quien dibuja. La
       * duración sí la sabe la manada: `fotogramas / fps`, que es la cuenta de
       * `duracionDe`. Es un sustituto, no la misma cosa, y coincide mientras la
       * animación se reproduzca a 1×. Quien tenga el mezclador de verdad puede
       * inyectar `secuenciaAcabada` y entonces manda ése.
       *
       * EL 77 ESCRIBIÓ AQUÍ que esta rama no la recorría ninguna sonda, y era
       * verdad: no hay un solo `ms_npcscript` de tipo 1 ni 3 en Edana ni en
       * Gate City. **Desde el 78 sí**: `gertenheld_forest2` es el tercer mapa
       * portado y `sondas/gertenheld78.mjs` la recorre con dos escenas del
       * tipo 1 y una del 3, leyendo del mezclador la animación que se puso.
       */
      animar: (nombre, { unaVez = false } = {}) => {
        if (animar) return animar(nombre, { unaVez });
        const s = unaVez ? (manada.deUnaVez(i, nombre), buscarSecuencia(i.secuencias, nombre)) : manada.pon(i, nombre);
        // Se apunta CUÁL se pidió, por lo mismo que en `mandarA` (ver allí): sin
        // `.mdl` no hay secuencia que poner y `nombreActual` se queda a `null`
        // con el trabajo bien hecho. Sin esto, «¿pidió `fear2`?» sólo lo puede
        // contestar un navegador, y entonces la rama del tipo 1 y la del 3 se
        // quedan sin prueba de Node. El 78.
        i.animPedida = nombre ?? null;
        i.animHasta = manada.t + duracionDe(s);
        return s;
      },
      secuenciaAcabada: () => (secuenciaAcabada ? Boolean(secuenciaAcabada()) : manada.t >= (i.animHasta ?? -Infinity)),
      ponerEnEscena: (si) => { i.enEscena = Boolean(si); },
      soltarLaEscena: () => { if (i.mandado) manada.pararDeAndar(i, { avisar: false }); },
      aplazarElPaseo: () => i.vagabundo?.aplazar(2.0, 0),
      evento: (nombre) => Boolean(evento?.(nombre)),
    };
  }

  /**
   * La animación de estar quieto, resuelta cada vez que se pide: el motor
   * vuelve a sortear en cada `SetActivity`, y un modelo con tres «idle» no se
   * queda siempre en la misma. Ver `src/play/actividad.js`.
   */
  quieto(i) {
    // EL 93: `m_IdleAnim` del guion, si lo ha cambiado (`setidleanim`,
    // npcscript.cpp:1458-1469): es lo que el `Think` pide en cada vuelta
    // (msmonsterserver.cpp:590-592). La araña agarrada pone `hitbite`.
    if (i.fisica?.parado) return i.fisica.parado;
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
    // ── Y NO SE LE PISA UNA DE UNA SOLA VEZ: `CAnimOnce::CanChangeTo` (80) ──
    //
    // Esto es `SetAnimation`, o sea `playanim once` y `playanim move`, y las dos
    // pasan por la guarda. El que NO pasa es `playanim critical`, que primero
    // llama a `BreakAnimation` (npcscript.cpp:1545-1548) — ése es `deUnaVez`.
    //
    // Lo que se veía sin esto, medido con el cronograma de `test/combate80`: la
    // rata ataca, y 33 ms después la caza vuelve con PERSEGUIR y le pone la de
    // correr. Del segundo golpe en adelante **el ataque duraba 120 ms de los
    // 1000 que trae el archivo**, o sea el 12 %: el bicho se sacude y corre en
    // el sitio. No daba ningún error porque poner una animación no falla nunca.
    if (i.unaVezHasta !== null && this.t < i.unaVezHasta) { i.sigue.rechazos++; return null; }
    if (i.actual?.seq === s && s.bucle) { i.sigue.veces++; return s; }
    i.sigue.reinicios++;
    if ((i.actual?.seq?.actividad ?? null) !== (s.actividad ?? null)) i.sigue.cambiosDeActividad++;
    i.actual = { seq: s };
    i.nombreActual = String(nombre ?? "").toLowerCase();
    // EL 92: `desde` y `visto` son el reloj de los eventos de animación —ver
    // `eventosDeAnimacion`—: cuándo se rebobinó y hasta qué fotograma se han
    // mirado ya. Rebobinar es `pev->frame = 0` (monsters.cpp:1238).
    i.anim = { nombre: s.nombre, gen: i.anim.gen + 1, unaVez: !s.bucle, desde: this.t, visto: 0 };
    // Y si la que acaba de entrar es de una sola vez, arma el candado: a partir
    // de aquí es ELLA la que rechaza a las demás, hasta que `relojes` la vence.
    i.unaVezHasta = s.bucle ? null : this.t + this._duraAlRitmo(i, s);
    i.tQuieto = 0;
    return s;
  }

  /**
   * LA DE ANDAR O LA DE ESTAR PARADO, que en el motor NO echan el candado — el 92.
   *
   * `pon` arma el candado de `CAnimOnce` (el 80) con CUALQUIER secuencia que no
   * sea de bucle. Para un ataque está bien; para la pose de reposo, no. En el
   * motor la de andar y la de parado se piden con `MONSTER_ANIM_WALK`
   * (msmonsterserver.cpp:589-594), y la pose que sale del sorteo de actividad
   * se pone después de `m_pAnimHandler = NULL; SetActivity(ACT_IDLE)` (:596-600):
   * el manejador que queda es `gAnimWalk`, cuyo `CanChangeTo` devuelve `true`
   * siempre (monsteranimation.cpp:144-147). O sea que en el siguiente `Think`,
   * con destino puesto, la de andar entra sin esperar.
   *
   * Aquí `dwarf/male1.mdl` sortea `nod` —no es de bucle— 10 de cada 23 veces, y
   * con el candado echado la de andar se rechazaba hasta que el asentimiento
   * acabara: **el aldeano echaba a andar deslizándose mientras asentía**. Lo
   * destapó `sondas/mundo.mjs` («el que anda y declara animación de andar, la
   * tiene puesta», 3 mal), cuyo `pasear` no corre los relojes y por eso dejaba
   * el candado puesto los diez segundos enteros (doc/FICHAS_92.md §3).
   *
   * Lo que sí respeta: si hay un candado de VERDAD puesto —un ataque—, la de
   * andar se rechaza igual que antes, porque `pon` mira el candado primero.
   */
  ponDeAndarOParar(i, nombre) {
    const s = this.pon(i, nombre);
    if (s && !s.bucle) i.unaVezHasta = null;
    return s;
  }

  /**
   * `playanim critical <nombre>`: una vez, quedándose en el último fotograma y
   * sin que la interrumpa nada. Es lo que usan la esquiva, el encogerse y la
   * muerte, y lo que NO hay que usar para andar.
   *
   * ── POR QUÉ ÉSTA SÍ SE SALTA EL CANDADO DEL 80 ───────────────────────────
   *
   * Porque `critical` no es «una vez con más ganas»: es **otro camino**. El
   * comando lo parte en dos y rompe antes de poner:
   *
   *     else if (!_stricmp(pszAnimType, "critical"))
   *       { AnimType = MONSTER_ANIM_ONCE; Priority = true; }
   *     ...
   *     if (Priority) { BreakAnimation(MONSTER_ANIM_BREAK);
   *                     SetAnimation(AnimType, pszAnimName, pData); }
   *                               npcscript.cpp:1521-1548
   *
   * y `BreakAnimation` deja `m_pAnimHandler = NULL` (msmonsterserver.cpp:2113),
   * o sea que el siguiente `SetAnimation` cae en `gAnimWalk`, que acepta todo.
   * Por eso una muerte interrumpe un ataque y un ataque no interrumpe otro.
   */
  deUnaVez(i, nombre) {
    const s = buscarSecuencia(i.secuencias, nombre);
    if (!s) return false;
    i.sigue.reinicios++;
    i.actual = { seq: s };
    i.nombreActual = String(nombre ?? "").toLowerCase();
    i.anim = { nombre: s.nombre, gen: i.anim.gen + 1, unaVez: true, desde: this.t, visto: 0 };
    // El candado se rearma con ESTA, que es lo que hace `BreakAnimation` seguido
    // de `SetAnimation`: la de antes se va y la nueva manda.
    i.unaVezHasta = this.t + this._duraAlRitmo(i, s);
    i.andando = null;
    i.tQuieto = 0;
    return true;
  }

  /**
   * `playanim once <nombre>` — EL 94. Hasta aquí llegaba como `deUnaVez`, o sea
   * como `critical`, porque `InteraccionesNpc` tiraba el modo.
   *
   * La diferencia es UNA línea del motor y decide quién gana:
   *
   *     else if (!_stricmp(pszAnimType, "once"))     AnimType = MONSTER_ANIM_ONCE;
   *     else if (!_stricmp(pszAnimType, "critical")) { AnimType = MONSTER_ANIM_ONCE;
   *                                                    Priority = true; }
   *     ...
   *     if (Priority) { BreakAnimation(MONSTER_ANIM_BREAK); SetAnimation(...); }
   *     else            SetAnimation(AnimType, pszAnimName, pData);
   *                                          npcscript.cpp:1514-1550
   *
   * Sin `Priority` no se rompe nada antes: `SetAnimation` le pregunta a la que
   * está puesta (msmonsterserver.cpp:2023), y si es otra de una sola vez que
   * no ha acabado —un mordisco, una esquiva, otra hierba— **se rechaza** y no
   * se apunta en ningún sitio (monsteranimation.cpp:219-221). Si la acepta, la
   * pone desde el fotograma 0 aunque ya fuera ésa (`IsNewAnim`,
   * monsteranimation.h:29 y monsteranimation.cpp:235-236), y la sujeta hasta que acaba —también si
   * es de bucle: `StudioFrameAdvance` da `m_fSequenceFinished` al dar la
   * vuelta (animating.cpp:61-68), así que una de bucle pedida «once» dura una
   * vuelta—.
   *
   * Lo que NO hace es parar el paseo: el destino sigue puesto. El bicho se
   * queda quieto porque la secuencia no avanza (ver `avanzar`, el 94).
   */
  unaVez(i, nombre) {
    if (i.unaVezHasta !== null && this.t < i.unaVezHasta) { i.sigue.rechazos++; return false; }
    return this.deUnaVez(i, nombre);
  }

  /**
   * EL `playanim` DE UN GUION, con su modo (npcscript.cpp:1487-1555). Es lo que
   * enchufan `src/main.js` y `src/red/partida.js` como `animar`.
   *
   *   - `critical`: rompe y pone (`deUnaVez`).
   *   - `once`: pone si la de ahora lo deja (`unaVez`).
   *   - `break` sin nombre lo resuelve el guion del bicho (`romper`); aquí no
   *     llega con cuerpo.
   *   - `move` y `hold` siguen yendo como antes, por `deUnaVez`: `move` dura en
   *     el motor hasta el siguiente `Think` (la pisa la de andar o reposo,
   *     msmonsterserver.cpp:589-594) y `hold` es `CAnimHold`, que no suelta a
   *     la de andar (monsteranimation.cpp:183-189). Ninguna de las dos está
   *     portada; queda dicho en doc/ANIMACION_94.md §5.
   */
  playanim(i, nombre, modo) {
    if (String(modo ?? "").toLowerCase() === "once") return this.unaVez(i, nombre);
    return this.deUnaVez(i, nombre);
  }

  // ── los relojes ───────────────────────────────────────────────────────────

  /**
   * Los relojes que corren solos: volver a sortear la pose de reposo y el
   * cadáver que se desvanece. Antes era la mitad de `bichos.animar`, que además
   * movía los mezcladores; los mezcladores son de quien dibuja y esto no.
   */
  relojes(dt) {
    this.t += dt;
    // ── LA OTRA MITAD DEL `CAnimOnce`: AL ACABAR, SE SUELTA (80) ────────────
    //
    // `CMSMonster::Think` corre cada 0,1 s (msmonsterserver.cpp:511) y **en
    // cada uno** vuelve a pedir la animación de moverse o la de reposo:
    //
    //     if (m_MonsterState != MONSTERSTATE_SCRIPT) {
    //       if (HasConditions(MONSTER_HASMOVEDEST)) SetAnimation(..., m_MoveAnim);
    //       else if (m_IdleAnim.len())              SetAnimation(..., m_IdleAnim);
    //                                       msmonsterserver.cpp:586-600
    //
    // Mientras el ataque corre, `CanChangeTo` rechaza esa petición; en cuanto
    // acaba, la acepta. O sea que la guarda de arriba y esto son **la misma
    // pieza**: sin lo primero la animación se corta, y sin lo segundo no se
    // suelta nunca. Lo segundo es lo que el jugador ve en el PRIMER golpe, que
    // es el que no se corta: con el reloj ocioso en 2 s (`CYCLE_TIME_IDLE`), la
    // rata se quedaba **2017 ms clavada en el último fotograma** de un ataque
    // que dura 1000. Medido en `test/combate80.test.mjs`.
    for (const i of this.instancias) {
      if (i.unaVezHasta === null || this.t < i.unaVezHasta) continue;
      // UN CADÁVER NO VUELVE DEL ATAQUE, y por eso el candado no se le abre: su
      // `Think` ya no corre, así que nadie le cambia la animación de morir.
      if (i.muerto) continue;
      // Y UNA ESCENA MANDA SOBRE ESTO: es el `m_MonsterState != MONSTERSTATE_SCRIPT`
      // de la cita. Se le abre el candado —para que el director pueda pedir la
      // siguiente— y no se le pone nada.
      if (i.enEscena) { i.unaVezHasta = null; continue; }
      // `i.andando` a `null` para que el siguiente ciclo de caza vuelva a
      // elegir entre andar, correr y huir: aquí sólo se sabe que hay destino,
      // no a cuál de los tres ritmos se va.
      i.andando = null;
      // EL 93: con el cuerpo en manos del guion no hay destino que valga: el
      // salto empieza con `setmovedest none` (spider.script:108) y el `Think`
      // pide entonces la de reposo (msmonsterserver.cpp:589-592) —`hitbite`
      // con la araña agarrada—, aunque la IA dejara escrito el suyo.
      const conDestino = i.destino && !i.fisica?.manda;
      this.ponDeAndarOParar(i, conDestino ? (i.ficha.andando ?? this.quieto(i)) : this.quieto(i));
      // Y se suelta DESPUÉS del `pon`: si el modelo no declarara reposo de
      // bucle, la de reposo volvería a echar el candado y esto se rearmaría
      // solo cada vez que venciera, rebobinándola. Un reposo no es una vez.
      i.unaVezHasta = null;
    }
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
      this.ponDeAndarOParar(i, this.quieto(i));
    }
    // EL CADÁVER, con los dos plazos del motor: veinte segundos quieto y luego
    // desvanecerse. `msmonsterserver.cpp:2688` pone el `think` a +20 s y
    // `SUB_FadeOut` baja el `renderamt` de 7 en 7 cada 0,1 s, o sea 3,6 s.
    //
    // Los plazos importan más de lo que parece: sin ellos el bicho se queda ahí
    // para siempre —y Gate City acaba siendo un osario— o desaparece en el
    // golpe, que se lee como «no ha muerto, se ha borrado».
    for (const i of this.instancias) {
      if (!i.muerto || i.dormido) continue;
      i.desdeQueMurio += dt;
      const t = i.desdeQueMurio - CADAVER.quieto;
      if (t <= 0) continue;
      i.opacidad = Math.max(0, 1 - t / CADAVER.desvanece);
      // Y CUANDO EL CADÁVER SE HA IDO DEL TODO, el bicho sale del mundo si era la
      // ficha de un área: en el motor el monstruo está borrado desde que murió, y
      // lo que queda hasta aquí es sólo el cuerpo. Se apunta en `sucesos` para que
      // quien lleve los cilindros le quite el suyo — un cadáver invisible que
      // todavía choca es un muro en medio de la calle.
      if (i.opacidad <= 0 && i.plantilla) {
        i.dormido = true;
        this.sucesos.push({ que: "sale", id: i.id });
      }
    }
  }

  /**
   * SACAR UN BICHO DEL MUNDO SIN MATARLO — `UTIL_Remove`, el 78.
   *
   * Es lo que hace un `killtarget` que nombra a un monstruo: la entidad
   * desaparece y ya está. **No es morir**: no hay golpe, ni animación de
   * muerte, ni cadáver, ni botín, ni se avisa a su área de que ha perdido una
   * vida — por eso esto no pasa por `herir` ni toca `muerto`.
   *
   *     if (pkvd->szValue[0]) KILLTARGET(...)  ->  UTIL_Remove(pentKillTarget)
   *                                               subs.cpp:220-233
   *
   * Hacía falta porque el `killtarget` del puerto sólo miraba el CABLEADO del
   * mapa, y un NPC no está ahí: está en la manada. Gate City tiene 0
   * `killtarget` y Edana 2, ninguno a un bicho — `gertenheld_forest2` tiene 13
   * y **cuatro apuntan a un NPC**, entre ellos el `SkeletonVanish` con el que
   * se desvanece el fantasma del tipo 3. Décima vez que el hueco lo enseña un
   * mapa nuevo (apartado 4 de CLAUDE.md).
   *
   * `dormido` es «no está en el mundo» y es lo mismo que usa el cadáver al
   * desvanecerse, así que el cilindro lo recoge `main.js` en el fotograma
   * siguiente con el invariante de siempre: cilindro si y sólo si está dentro.
   */
  sacarDelMundo(i) {
    if (!i || i.dormido) return false;
    i.dormido = true;
    i.mandado = null;
    i.enEscena = false;
    i.andando = null;
    i.cazador?.olvidar?.();
    this.sucesos.push({ que: "sale", id: i.id });
    return true;
  }

  /**
   * DEVOLVER UN BICHO AL MUNDO: lo que hace un área al sacarlo.
   *
   * En el motor esto no existe porque el monstruo es **nuevo**: `CREATE_ENT` y
   * `Spawn()` (msmapents.cpp:1206-1230). Aquí no se puede crear nada —el protocolo
   * manda los bichos por índice y el índice no se puede mover— así que hay que
   * deshacer a mano todo lo que la muerte dejó puesto. **Lo que se olvide aquí es
   * un bicho que vuelve roto**, y roto en silencio: un goblin con 0 de vida que no
   * se puede matar, o uno con la animación de morir congelada.
   */
  revivir(i) {
    // EL 91: otra entidad, otro guion. Ver `nacimientos`.
    i.nacimientos = (i.nacimientos ?? 0) + 1;
    // EL CAZADOR, que la muerte pone a `null` (`herir`, más abajo) y sin el cual
    // el bicho vuelve pero no ataca a nadie — vivo, con vida llena, y pacífico.
    // Se reconstruye de la ficha, que es de donde salió.
    if (!i.cazador && i.ficha.ia) i.cazador = new Cazador(i.ficha.ia, { azar: this.azar });
    i.muerto = false;
    i.desdeQueMurio = 0;
    i.opacidad = 1;
    i.vida = i.vidaMaxima;
    i.recibido = {};
    i.destino = null;
    i.cerca = 0;
    i.frenado = "sin destino";
    i.intencion = null;
    i.andando = null;
    i.cazador?.olvidar?.();
    i.vagabundo?.llegado?.();
    // A su sitio: el origen de su ficha, que es lo que el área usa
    // (`SPAWNLOC_FIXED`). Volver donde murió no pasa en el motor.
    i.donde[0] = i.ficha.escena[0];
    i.donde[1] = i.ficha.escena[1];
    i.donde[2] = i.ficha.escena[2];
    i.yaw = ((i.ficha.yaw ?? 0) * Math.PI) / 180;
    i.rastro.length = 0;
    // Y BOTÍN NUEVO: el motor vuelve a pasar por `npc_post_spawn` al aparecer,
    // así que un bicho resucitado sortea otra vez. No se le devuelve el que ya
    // soltó — eso sería duplicarlo.
    i.llevaEncima = sorteoDeBotin(i.ficha.ia?.botin, this.azar);
    i.reaccion.proximoEncogerse = -Infinity;
    i.reaccion.proximoDolor = -Infinity;
    i.reaccion.quietoHasta = -Infinity;
    this.ponDeAndarOParar(i, this.quieto(i));
    return i;
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
      if (i.dormido) continue;               // todavía no ha aparecido
      if (i.muerto) continue;                // un cadáver no pasea
      if (filtro && !filtro(i)) continue;
      // EL 77: con un destino MANDADO la casilla no es del paseo. El motor no
      // necesita este `if` porque la casilla es una sola y `SetWanderDest` se
      // calla con los relojes aplazados; aquí son dos, y lo que las ordena es
      // esto. El aplazamiento se hace igual, dentro de `pasoMandado`.
      if (i.mandado) { pasoMandado(this, i, dt, arnes, this.U); continue; }
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
    // EL 92: primero los eventos de animación que han pasado desde la última
    // vuelta, con el arnes de ESTA vuelta a mano: son los que ponen el daño
    // de los bichos cuyo guion lo maneja. Ver `eventosDeAnimacion`.
    this._arnesDeCaza = arnes;
    this.eventosDeAnimacion();
    // EL 93: los cuerpos que lleva el guion (lanzados o pegados a alguien).
    this._fisica(dt, arnes);
    for (const i of this.instancias) {
      if (i.dormido) continue;               // todavía no ha aparecido
      if (!i.cazador || i.muerto) continue;
      // ── EL 93: LO QUE EL GUION DEJA HACER AL BUCLE DE CAZA ─────────────
      //
      // La IA porta ese bucle, así que lee sus dos llaves: `if CAN_HUNT`
      // (base_npc_attack.script:73) y `if CAN_ATTACK` (:175). Mientras la
      // araña amaga, salta o va agarrada, su guion las tiene a 0
      // (spider.script:112-113) y quien mueve el cuerpo es la física
      // (`_fisica`) o el `setfollow`.
      //
      // Aquí hubo también un `if (i.fisica.manda) continue;` —«el cuerpo es
      // del guion»— y se QUITÓ: rompido a propósito no puso nada rojo, porque
      // con `CAN_HUNT 0` ya no se llega aquí. Para otros saltos del mod que no
      // bajan `CAN_HUNT` (`leap_scan`, `orc_jump_check`…) no se ha medido qué
      // hace el motor, y una regla sin medir no se escribe (doc/SALTO_93.md).
      const deja = this._deja(i);
      if (!deja.cazar) continue;
      // ── EL 77: UNA ESCENA MANDANDO ─────────────────────────────────────
      //
      // `MONSTER_NOAI` es el `stopai` del mapa: con él puesto el NPC no piensa
      // mientras dura la escena (`npcact.cpp:156-157`). Sin él, el motor deja
      // que la caza siga corriendo — y si encuentra a quien perseguir **le
      // pisa la casilla del destino**, que es justo lo que `MoveThink` detecta
      // para cortar la escena (`:229`). Las dos ramas son del motor y las dos
      // se portan: por eso aquí se suelta `mandado` en vez de protegerlo.
      if (i.mandado) {
        if (i.sinIa || !i.cazador.objetivo) { pasoMandado(this, i, dt, arnes, this.U); continue; }
        i.mandado = null;                   // la caza coge la casilla: la escena se cortará
      }
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
        else avanzar(i, dt, libre, suelo, this.U, { valla: arnes.valla });
        continue;
      }
      i.intencion = r;
      // EL 93: si la IA ha fijado o soltado objetivo, el guion lo sabe —
      // `IS_HUNTING` y `HUNT_LASTTARGET`, que el salto lee (`_avisarCaza`).
      this._avisarCaza(i);

      if (r.accion === ACCION.GOLPEAR && !deja.atacar) { mirarA(i, r.destino, this.U); continue; }
      if (r.accion === ACCION.GOLPEAR) {
        if (i.vagabundo?.tieneDestino) { i.vagabundo.llegado(); i.destino = null; }
        mirarA(i, r.destino, this.U);
        // ── EL 92: ¿EL DAÑO LO PONE EL GUION? ──────────────────────────────
        //
        // Se pregunta ANTES de poner la animación, porque la respuesta depende
        // de la secuencia que se va a poner: si trae un evento 500/600 cuyo
        // nombre maneja el guion del bicho, en el motor el golpe sale de ahí
        // (msmonsterserver.cpp:1484-1493 -> `bite1` -> `dodamage`) y la IA no
        // tira ningún dado. Ver `_atacaPorGuion`.
        const porGuion = this._atacaPorGuion(i, r.objetivo);
        this.pon(i, i.ficha.ia.golpe);
        // La espera entre golpes es la del ataque sin evento en el modelo:
        // `HACK_ATTACK_DELAY 1.0`. El motor la saca del evento 600 de la
        // secuencia cuando lo hay. EL 92: el evento ya se lee —es el que pone
        // el daño, abajo—, pero la ESPERA sigue siendo ésta: no se ha portado
        // de dónde la saca el motor y no se finge (doc/MORDISCO_92.md).
        i.cazador.haGolpeado(ESPERA_ENTRE_GOLPES);
        i.andando = null;
        // ── EL 92: SIN DOS DAÑOS POR GOLPE ─────────────────────────────────
        //
        // Si el guion maneja el evento de la animación, ESTE golpe no tira
        // `acierta`/`danoDe` ni llama a `golpear`: lo hará el `dodamage` del
        // guion cuando la animación pase por su fotograma (`_golpeDelGuion`).
        // Si no —sin guion, sin evento en el modelo, o con el evento sin
        // manejar—, la IA pega como desde el 17. En el motor ese segundo caso
        // sería un monstruo que no hace daño; aquí se le deja la IA porque es
        // como pega hoy todo lo que no tiene costura (el servidor sin oyente,
        // los modelos sin hornear), y se cuenta aparte.
        if (porGuion) { this.golpesDelGuion.atacaPorGuion++; continue; }
        // El acierto y el daño son del script, y el dado se tira aquí
        // porque es donde hay alguien a quien pegarle.
        if (acierta(i.ficha.ia, this.azar)) {
          const dano = danoDe(i.ficha.ia, this.azar);
          this._suceso("pega", { id: i.id, a: r.objetivo, dano: Math.round(dano * 10) / 10 });
          // ── EL 91: LOS DOS EVENTOS DEL ATACANTE, EN EL ORDEN DEL MOTOR ──
          //
          // `game_damaged_other` va ANTES de que el golpe llegue al otro, y
          // sólo si la tirada de acierto ha entrado (giattack.cpp:1696-1762).
          // `game_dodamage` va al final, en `EndDamage`, acierte o no
          // (:2030-2045). Y en medio la defensa del jugador puede pararlo:
          // un parry deja `flDamage == -1` y eso pone `AttackHit = false`
          // (:1832-1838), así que el «1» o el «0» de PARAM1 lo decide quien
          // tiene la defensa, que es `golpear`. Si `golpear` no dice nada
          // (`null`), se toma el golpe como entrado con el daño de la IA.
          this._costura("danaAOtro", i, { objetivo: r.objetivo, dano });
          const def = golpear?.(i, r.objetivo, dano) ?? null;
          const parado = Boolean(def?.parado);
          this._costura("hizoDano", i, {
            objetivo: r.objetivo, acierto: !parado,
            dano: parado ? 0 : (Number.isFinite(def?.dano) ? def.dano : dano),
          });
        } else {
          this._suceso("falla", { id: i.id, a: r.objetivo });
          // La tirada de acierto no ha entrado: `AttackHit = false`
          // (giattack.cpp:1686-1691) y no hay `game_damaged_other`, pero
          // `EndDamage` corre igual y el guion se entera de que ha fallado.
          this._costura("hizoDano", i, { objetivo: r.objetivo, acierto: false, dano: 0 });
        }
        continue;
      }

      // HUIR: el mismo movimiento de perseguir con el destino al revés, y con
      // la animación de correr. `npcatk_flee` hace `playanim break` para salir
      // del ataque y luego `playanim critical ANIM_RUN`.
      if (r.accion === ACCION.HUIR) {
        if (i.vagabundo?.tieneDestino) i.vagabundo.llegado();
        if (r.destino) { ponerDestino(i, r.destino, r.cerca ?? 1); mirarA(i, r.destino, this.U); }
        if (i.andando !== "huye") { this.ponDeAndarOParar(i, i.ficha.ia.corriendo ?? i.ficha.andando); i.andando = "huye"; }
        avanzar(i, dt, libre, suelo, this.U, { valla: arnes.valla });
        continue;
      }

      if (r.accion === ACCION.PERSEGUIR || r.accion === ACCION.BUSCAR) {
        ponerDestino(i, r.destino, r.cerca);
        if (i.andando !== "corre") { this.ponDeAndarOParar(i, i.ficha.ia.corriendo ?? i.ficha.andando); i.andando = "corre"; }
        // Y el vagabundo se retira: la casilla de destino la tiene la caza.
        // Es `StopWalking` al revés — al soltarla se rearma el reloj de los
        // 2 s, así que al perder de vista al jugador el bicho no se pone a
        // pasear en el mismo fotograma.
        if (i.vagabundo?.tieneDestino) i.vagabundo.llegado();
        avanzar(i, dt, libre, suelo, this.U, { valla: arnes.valla });
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

  // ── EL 93: EL CUERPO DEL BICHO, PARA SU GUION ─────────────────────────────

  /**
   * **LO QUE EL GUION DE UN BICHO PUEDE PEDIRLE A SU CUERPO** — el 93.
   *
   * El guion vive en `npcguion.js` y no sabe dónde está nadie; esto es la
   * puerta, una por bicho, que le da `InteraccionesNpc` al crearlo. Todo lo
   * que entra viene en UNIDADES y ejes del motor (Z arriba) y se cambia aquí,
   * una vez, a los de la escena (Y arriba, Z negada).
   *
   * Lo pidió el salto de la araña de Gate City (spider.script:93-192), que es
   * el primer guion de este puerto que mueve el cuerpo de su bicho:
   * `setvelocity ent_me $relvel(0,320,120)`, `gravity .9`, `movespeed 0`,
   * `setorigin ent_me <jugador>`, `setfollow <jugador> align_bottom`,
   * `setanim.framerate`, `setidleanim` y `playanim break`.
   */
  cuerpoDe(i) {
    const m = this;
    const f = i.fisica;
    const U = this.U;
    const aEscenaU = (v) => [Number(v?.[0]) || 0, Number(v?.[2]) || 0, -(Number(v?.[1]) || 0)];
    return {
      vivo: () => !i.muerto && (i.vida ?? 0) > 0,
      enSuelo: () => Boolean(f.enSuelo),
      /** `$get(<jugador>,onground)`: lo sabe quien da los objetivos. `null` si no lo dice. */
      objetivoEnSuelo: () => {
        const c = m._candidato(i, i.objetivoCazado ?? i.objetivoDelGuion ?? null);
        return c && typeof c.enSuelo === "boolean" ? c.enSuelo : null;
      },
      /**
       * `pev->angles` en grados: [pitch, yaw, roll]. El rumbo de la escena es
       * el del motor —yaw 0 mira a +X en los dos, y la Z de la escena es la
       * −Y del motor (ver `mirarA`)—, así que sólo cambia de radianes a grados.
       */
      angulos: () => [0, ((((i.yaw ?? 0) * 180) / Math.PI) % 360 + 360) % 360, 0],
      /** `setvelocity`/`addvelocity ent_me` (scriptcmds.cpp:7208-7209). */
      velocidad: (v, { sumar = false } = {}) => {
        const a = [Number(v?.[0]) || 0, Number(v?.[1]) || 0, Number(v?.[2]) || 0];
        f.vel = sumar && f.vel ? f.vel.map((x, k) => x + a[k]) : a;
        // Un `setvelocity (0,0,0)` es aterrizar (spider.script:136), no lanzar.
        if (a.some((x) => x !== 0)) { f.manda = true; f.saltos++; }
      },
      /** `setorigin ent_me <vec>` (scriptcmds.cpp:4518-4519). */
      ponerOrigen: (v) => {
        const e = aEscenaU(v);
        i.donde = [e[0] / U, e[1] / U, e[2] / U];
      },
      /** `pev->gravity` (scriptcmds.cpp:3464). */
      gravedad: (g) => { f.gravedad = g; },
      /**
       * `m_SpeedMultiplier` (npcscript.cpp:516). Al volver a uno positivo sin
       * ir pegado a nadie, la IA recupera el cuerpo: es el `movespeed 1` de
       * `spider_latch_resetmovement` (spider.script:177), el último paso.
       */
      ritmoDeAndar: (x) => {
        f.ritmoAndar = x;
        if (x > 0 && !f.sigue) { f.manda = false; f.vel = null; f.gravedad = 1; f.enSuelo = true; }
      },
      ritmoDeAnimacion: (x) => m.ritmo(i, x),
      /** `m_IdleAnim`; igual que el de la ficha es como no tener ninguno. */
      animacionDeParado: (n) => {
        const k = String(n ?? "").toLowerCase();
        f.parado = k && k !== String(i.ficha?.parado ?? "").toLowerCase() ? String(n) : null;
      },
      /**
       * `setfollow`: con objetivo, `MOVETYPE_NONE` y pegado a él; con `none`,
       * `MOVETYPE_STEP` otra vez (scriptcmds.cpp:5976-5993). El objetivo de
       * este puerto es el que caza la IA (el jugador).
       */
      seguir: (ref, { abajo = false } = {}) => {
        if (ref === null) { f.sigue = null; f.vel = [0, 0, 0]; f.enSuelo = false; return; }
        const id = i.objetivoCazado ?? i.objetivoDelGuion ?? null;
        if (id === null) return;
        f.sigue = { id, abajo: Boolean(abajo) };
        f.vel = null;
        f.manda = true;
      },
      /**
       * `playanim break`: `BreakAnimation` y nada más (npcscript.cpp:1527).
       * Se vence el candado, y `relojes` pone en la vuelta siguiente la de
       * reposo —la del `setidleanim`, si la hay—, que es lo que hace el `Think`
       * (msmonsterserver.cpp:590-592).
       */
      romper: () => { i.unaVezHasta = m.t; },
      manda: () => Boolean(f.manda),
    };
  }

  /**
   * Lo que tarda una secuencia AL RITMO DEL BICHO (`m_Framerate`, el 93): el
   * candado de `CAnimOnce` se suelta cuando la secuencia ACABA
   * (`m_fSequenceFinished`, monsteranimation.cpp:217-220), y a ritmo 0,5 una
   * secuencia tarda el doble. Sin esto la araña que cae del jugador a ritmo
   * 0,5 (spider.script:121, y nadie se lo devuelve a 1 en esa rama) perdía
   * `frame_falloffend` —el fotograma 53 de 55— porque el candado se soltaba a
   * la mitad, y se quedaba con `CAN_HUNT 0` para siempre. Lo cazó el sondeo de
   * la prueba, no una lectura.
   */
  _duraAlRitmo(i, s) {
    const r = i?.fisica?.ritmoAnim ?? 1;
    return r > 0 ? duracionDe(s) / r : Infinity;
  }

  /** El objetivo de la IA con ese id, de los que da el arnés de esta vuelta. */
  _candidato(i, id) {
    if (id === null || id === undefined) return null;
    return (this._arnesDeCaza?.objetivos?.(i) ?? []).find((x) => x.id === id) ?? null;
  }

  /**
   * `setanim.framerate` — `m_Framerate` (npcscript.cpp:1585-1591), que el
   * motor copia a `pev->framerate` al acabar cada `SetAnimation`
   * (msmonsterserver.cpp:2079-2081), o sea en el `Think` siguiente: aquí, en
   * el acto (hasta 0,1 s antes). Cambia a qué ritmo pasan los fotogramas y
   * por tanto CUÁNDO salen sus eventos (`eventosDeAnimacion`) y cuándo se
   * suelta el candado de una animación de una vez.
   *
   * EL 94: el dibujo sí se entera —`src/render/bichos.js` pone el
   * `timeScale` del mezclador a este ritmo, y con servidor viaja en la foto
   * (`r`, `estadoDe`)—, y el paso también (`avanzar`, msmonsterserver.cpp:1201).
   */
  ritmo(i, x) {
    const r = Number(x) || 0;
    i.fisica.ritmoAnim = r;
    const s = i.actual?.seq;
    if (i.unaVezHasta === null || !s?.fps) return;
    const falta = Math.max(0, (s.fotogramas ?? 0) - (i.anim?.visto ?? 0));
    // Ritmo cero: la secuencia no acaba nunca, y `CAnimOnce` no suelta
    // (monsteranimation.cpp:217-220). Es lo que el motor haría.
    i.unaVezHasta = r > 0 ? this.t + falta / (s.fps * r) : Infinity;
  }

  /**
   * ¿Deja el GUION cazar y atacar? `CAN_HUNT`/`CAN_ATTACK` de la familia
   * vieja (ver `GuionDeNpc.puede`). Sin oyente, sí.
   */
  _deja(i) {
    if (!this.oyente) return { cazar: true, atacar: true };
    const r = { cazar: true, atacar: true };
    this._costura("puede", i, { r });
    return r;
  }

  /**
   * Si el `Cazador` ha fijado o soltado objetivo desde la última vuelta, se
   * le cuenta al guion: `npcatk_targetvalidate`/`npcatk_clear_targets`, los
   * dos cerrados por el 91 (ver `GuionDeNpc.cazando`).
   */
  _avisarCaza(i) {
    const obj = i.cazador?.objetivo ?? null;
    if (obj === (i.objetivoCazado ?? null)) return;
    i.objetivoCazado = obj;
    this._costura("caza", i, { objetivo: obj, quien: obj });
  }

  /**
   * **EL CUERPO LANZADO O PEGADO** — `SV_Physics_Step` y `setfollow`, el 93.
   *
   * Sólo los bichos cuyo guion ha tomado el cuerpo (`fisica.vel` o
   * `fisica.sigue`); los demás no pasan por aquí y andan como siempre.
   *
   * Lanzado, en el orden de `SV_Physics_Step` (sv_phys.cpp:1363-1430):
   *   1. sin suelo, la gravedad: `vz -= gravity × 800 × dt` (`SV_AddGravity`,
   *      :395-405);
   *   2. con velocidad, deja de estar en el suelo; y si ESTABA, la fricción de
   *      ese fotograma (`sv_friction` 4, `sv_stopspeed` 100);
   *   3. se mueve (`SV_FlyMove`) y, si el suelo queda debajo, se posa.
   * Lo que NO hace: `SV_FlyMove` desliza contra las paredes; aquí una pared
   * delante anula la parte horizontal. Y el suelo se pregunta con el `suelo`
   * del arnés, el mismo del paso.
   *
   * Pegado (`setfollow <jugador> align_bottom`): el `origin` del seguidor es
   * el del anfitrión más su `mins.z` (cbase.cpp:305-310) — los pies del
   * jugador. Aquí `donde` del candidato es su centro, y se le bajan 36.
   */
  _fisica(dt, arnes = {}) {
    const U = this.U;
    for (const i of this.instancias) {
      const f = i.fisica;
      if (i.dormido || (!f?.vel && !f?.sigue)) continue;
      if (f.sigue) {
        const c = this._candidato(i, f.sigue.id);
        if (!c) continue;
        const bajar = f.sigue.abajo ? ABAJO_DEL_JUGADOR : 0;
        i.donde = [c.donde[0] / U, (c.donde[1] - bajar) / U, c.donde[2] / U];
        continue;
      }
      const v = f.vel;
      const estaba = f.enSuelo;
      if (!estaba) v[2] -= (f.gravedad || 1) * FISICA.gravedad * dt;
      if (!v.some((x) => x !== 0)) continue;
      f.enSuelo = false;
      if (estaba && !i.muerto) {
        const rapido = Math.hypot(v[0], v[1]);
        if (rapido > 0) {
          const control = rapido < FISICA.parada ? FISICA.parada : rapido;
          const factor = Math.max(0, rapido - dt * control * FISICA.friccion) / rapido;
          v[0] *= factor; v[1] *= factor;
        }
      }
      // Del motor (x, y, z arriba) a la escena (x, y arriba, z = −y).
      const n = i.donde;
      let hx = (v[0] * dt) / U, hz = (-v[1] * dt) / U;
      const sube = (v[2] * dt) / U;
      const L = Math.hypot(hx, hz);
      if (L > 0 && arnes.libre && !arnes.libre(n[0], n[1] + CINTURA, n[2], hx / L, hz / L, Math.max(0.3, L * 2), i)) {
        hx = 0; hz = 0; v[0] = 0; v[1] = 0;
      }
      const nuevo = [n[0] + hx, n[1] + sube, n[2] + hz];
      const y = arnes.suelo ? arnes.suelo(nuevo[0], Math.max(nuevo[1], n[1]), nuevo[2], i) : null;
      if (y !== null && y !== undefined && v[2] <= 0 && nuevo[1] <= y) {
        nuevo[1] = y;
        v[2] = 0;
        f.enSuelo = true;
        f.aterrizajes++;
      }
      i.donde = nuevo;
    }
  }

  // ── EL 92: EL DAÑO SALE DEL EVENTO DE ANIMACIÓN ───────────────────────────

  /**
   * ¿Pone el GUION el daño de este ataque? — el 92.
   *
   * Sí cuando la secuencia de ataque trae algún evento 500/600 y el guion del
   * bicho maneja alguno de sus nombres. Lo contesta quien tiene los guiones
   * (el oyente, `InteraccionesNpc`), que además deja apuntado en el guion A
   * QUIÉN ataca la IA: en el motor eso lo escribirían los eventos de caza
   * que la costura del 91 cierra (`npcatk_settarget` y compañía), y sin ello
   * el `dodamage NPCATK_TARGET …` del guion no tendría a quién pegar.
   *
   * `buscarSecuencia` y no una búsqueda exacta: la secuencia que se mira es
   * la que `pon` va a poner, y `pon` cae en la 0 si el nombre no existe — lo
   * que se dispara es lo de la que SUENA, como en el motor.
   */
  _atacaPorGuion(i, objetivo) {
    if (!this.oyente) return false;
    const s = buscarSecuencia(i.secuencias, i.ficha?.ia?.golpe);
    const eventos = [...new Set((s?.eventos ?? [])
      .filter((e) => EVENTOS_QUE_LLAMAN_AL_GUION.has(e.evento) && e.opciones)
      .map((e) => e.opciones))];
    if (!eventos.length) return false;
    // `r` va por referencia: `_costura` extiende el suceso con `...datos`, y
    // un objeto dentro sigue siendo el mismo. `quien` es para el servidor, que
    // resuelve de qué jugador es el suceso por ese campo (interacciones.js).
    const r = { porGuion: false };
    this._costura("ataca", i, { objetivo, quien: objetivo, eventos, r });
    if (r.porGuion !== true) return false;
    i.objetivoDelGuion = objetivo;
    return true;
  }

  /**
   * LOS EVENTOS DE ANIMACIÓN, AL GUION — el 92.
   *
   * Es `DispatchAnimEvents` (animating.cpp:125-167) con `GetAnimationEvent`
   * (animation.cpp:290-330): cada vez que se mira, se disparan los eventos
   * cuyo fotograma cae en `[visto, ahora)`, y en una de bucle también los
   * de la vuelta siguiente. Lo llama `cazar` en cada vuelta; el motor lo hace
   * en cada `Think` del monstruo (msmonsterserver.cpp:583) y también muerto
   * (:2626), y aquí también — un cadáver no se salta, uno DORMIDO sí, porque
   * no está en el mundo.
   *
   * Lo que NO es igual y va dicho:
   *
   *   - El motor mira cada 0,1 s (`flInterval = 0.1`, animating.cpp:150) y
   *     aquí cada vuelta de `cazar`: el evento sale hasta 0,1 s antes que
   *     allí. Su propio comentario avisa de que «this still sometimes hits
   *     events twice» (:153); aquí no se repite.
   *   - El fotograma es `tiempo × fps` con el `framerate` a 1: `setanim.framerate`
   *     no está portado (las arañas lo piden en `frame_bite1`).
   *   - Los de bucle dan la vuelta en `fotogramas` y no en `fotogramas − 1`
   *     (animation.cpp:323-324): es el reloj con el que `duracionDe` mide la
   *     secuencia en este puerto, y dos relojes para la misma animación serían
   *     dos mundos.
   *
   * Sin oyente no se hace nada: no hay guion que lo reciba, y contar cada
   * paso de cada aldeano como «sin oyente» enterraría la cuenta del 91.
   */
  eventosDeAnimacion() {
    if (!this.oyente) return;
    for (const i of this.instancias) {
      if (i.dormido) continue;
      const s = i.actual?.seq;
      const evs = s?.eventos;
      if (!evs?.length) continue;
      const a = i.anim;
      if (!Number.isFinite(a?.desde) || !(s.fps > 0)) continue;
      // EL 93: el fotograma AVANZA a `fps × ritmo` (`setanim.framerate`, ver
      // `ritmo`), así que se acumula desde la última mirada en vez de
      // calcularse desde que se rebobinó. Con el ritmo a 1 es lo mismo.
      const antes = a.visto ?? 0;
      const ahora = antes + Math.max(0, this.t - (a.tVisto ?? a.desde)) * s.fps * (i.fisica?.ritmoAnim ?? 1);
      a.tVisto = this.t;
      if (!(ahora > antes)) continue;
      a.visto = ahora;
      const n = Math.max(1, s.fotogramas ?? 1);
      const gen = a.gen;
      for (const e of evs) {
        if (!EVENTOS_QUE_LLAMAN_AL_GUION.has(e.evento) || !e.opciones) continue;
        let veces = 0;
        if (!s.bucle) veces = e.frame >= antes && e.frame < ahora ? 1 : 0;
        else {
          for (let m = Math.max(0, Math.ceil((antes - e.frame) / n)); e.frame + m * n < ahora; m++) {
            if (e.frame + m * n >= antes) veces++;
          }
        }
        for (let k = 0; k < veces; k++) {
          // Si un evento anterior de esta misma vuelta cambió la animación
          // (un `playanim critical` del guion fuera de la costura), los que
          // quedan son de una secuencia que ya no suena.
          if (i.anim.gen !== gen) break;
          this.golpesDelGuion.eventos++;
          this._costura("animacion", i, {
            evento: e.opciones, codigo: e.evento, secuencia: s.nombre, fotograma: e.frame,
            quien: i.objetivoDelGuion ?? null,
            hacerDano: (p) => this._golpeDelGuion(i, p),
          });
        }
      }
    }
  }

  /**
   * **UN `dodamage`/`xdodamage` DEL GUION DEL BICHO** — el 92.
   *
   * `p` llega de `GuionDeNpc` (npcguion.js) ya partido por `leerDano`
   * (guion.js) y con el objetivo resuelto: `alJugador` dice si el primer
   * parámetro es el jugador. Aquí se decide lo que en el motor decide
   * `DoDamage` (giattack.cpp:1532-1640 la lista, :1657-1730 el golpe) contra
   * el único objetivo que este puerto da a un bicho, el que le dio la IA.
   *
   * ── LA TRAZA (`dodamage <obj> <alcance> …`, la forma de casi todos) ──────
   *
   *   - El alcance es una ESFERA desde el OJO (`vecSrc = EyePosition()`,
   *     npcscript.cpp:1121), no una distancia entre pies: entra quien tenga el
   *     centro dentro (giattack.cpp:1548; el motor mira la caja, aquí el
   *     centro — aproximación declarada).
   *   - Su radio: `dodamage` suma media anchura del bicho y media del objetivo
   *     (npcscript.cpp:1146-1157) — la del jugador es 0, el 82 —; `xdodamage`
   *     sólo la del atacante (scriptcmds.cpp:7425-7427).
   *   - Sin pared entre el ojo y el centro (`UTIL_TraceLine … ignore_monsters`,
   *     giattack.cpp:1563-1566): es el rayo de `veA`, el mismo de la caza.
   *   - Y en el CONO ESTRECHO del atacante, ±45° en el plano
   *     (`FInViewCone(tr.vecEndPos, VIEW_FIELD_NARROW)`, :1572;
   *     combat.cpp:1186-1205). O sea que **apartarse durante el amago
   *     esquiva el mordisco**, que es lo que el daño de la IA no podía dar.
   *
   *   Si nadie entra, el motor traza recto contra el mundo (:1615-1630) y un
   *   golpe a la pared también corre `game_dodamage`; eso no está portado:
   *   aquí un golpe al aire no le llega al guion y se cuenta en `alAire`.
   *
   * ── LA DIRECTA (`dodamage <obj> direct …`) ─────────────────────────────
   *
   *   Sin alcance ni cono: el objetivo es la lista (giattack.cpp:1542-1545).
   *   Los goblins de Gate City la usan tras mirar ellos mismos el alcance.
   *
   * ── EL GOLPE, igual para las dos ───────────────────────────────────────
   *
   *   1. `CanDamage`: relación `<= RELATIONSHIP_NE` (msmonsterserver.cpp:83-87).
   *   2. El daño por `m_DMGMulti` si es > 0 (npcscript.cpp:1160-1162;
   *      scriptcmds.cpp:7362), que es el `dmgmulti` del mapa (`postspawn`).
   *   3. La tirada: `RANDOM_LONG(0, 99) < 100 - acierto` falla
   *      (giattack.cpp:1709-1713). `m_HITMulti` no está horneado: vale 1.
   *   4. Si entra: `game_damaged_other` (con el `dmgevent`), la defensa del
   *      jugador (`golpear`) y, al final, `game_dodamage` y
   *      `<dmgevent>_dodamage`, acierte o no (giattack.cpp:2030-2058). Los
   *      tres los manda `_costura`, por los mismos sucesos del 91.
   *
   * Las formas en radio y de vector a vector no se portan y se cuentan.
   */
  _golpeDelGuion(i, p) {
    const c = this.golpesDelGuion;
    c.pedidos++;
    const arnes = this._arnesDeCaza;
    if (!arnes) { c.sinArnes++; return { porQue: "sin arnes de caza" }; }
    if (p?.forma !== "traza" && p?.forma !== "directo") { c.formaSinPortar++; return { porQue: `forma ${p?.forma}` }; }
    const objetivo = p.alJugador ? (i.objetivoDelGuion ?? null) : null;
    const cand = objetivo ? (arnes.objetivos?.(i) ?? []).find((x) => x.id === objetivo) : null;
    if (!cand) { c.sinObjetivo++; return { porQue: "el guion apunta a alguien que no es el objetivo de la IA" }; }
    const U = this.U;
    const n = i.donde;
    if (p.forma === "traza") {
      const ojo = [n[0] * U, n[1] * U + ojoDe(i), n[2] * U];
      const miAncho = Number(i.ficha?.ia?.ancho ?? i.ficha?.ancho ?? 0) || 0;
      const radio = (Number(p.alcance) || 0) + miAncho / 2 +
        (p.comando === "dodamage" ? (Number(cand.ancho) || 0) / 2 : 0);
      const lejos = Math.hypot(cand.donde[0] - ojo[0], cand.donde[1] - ojo[1], cand.donde[2] - ojo[2]);
      // `!(a <= b)` y no `a > b`: una distancia NaN no entra (el 79).
      if (!(lejos <= radio)) { c.alAire++; return { porQue: "fuera de la esfera", lejos, radio }; }
      if (arnes.veA && !arnes.veA(i, objetivo)) { c.alAire++; return { porQue: "pared en medio" }; }
      // El cono en el PLANO, con el rumbo de `mirarA`: yaw 0 mira a +X y la
      // Z de Three va negada, así que el adelante es (cos, −sin).
      const dx = cand.donde[0] / U - n[0], dz = cand.donde[2] / U - n[2];
      const L = Math.hypot(dx, dz);
      const dot = L > 0 ? (dx * Math.cos(i.yaw) - dz * Math.sin(i.yaw)) / L : 1;
      if (!(dot > CONO_ESTRECHO)) { c.alAire++; return { porQue: "fuera del cono", dot }; }
    }
    const tipo = String(p.tipo || "generic");
    const evento = p.evento || null;
    const relacion = cand.relacion ?? i.ficha?.relacion ?? RELACION.SIN_RAZA;
    if (relacion > RELACION.NEUTRAL) {
      // `AttackHit = CanDamage(...)` falso: no hay `game_damaged_other` pero
      // `EndDamage` corre igual (giattack.cpp:1694, :2030).
      c.noPuede++;
      this._costura("hizoDano", i, { objetivo, quien: objetivo, acierto: false, dano: 0, tipo, evento });
      return { porQue: "no puede herirle", relacion };
    }
    const mult = numDe(i.ficha?.postspawn?.dmgmulti ?? "0");
    const dano = Math.fround((Number(p.dano) || 0) * (mult > 0 ? mult : 1));
    const tirada = Math.floor(this.azar() * 100);
    if (tirada < 100 - (Number(p.acierto) || 0)) {
      c.fallan++;
      this._suceso("falla", { id: i.id, a: objetivo });
      this._costura("hizoDano", i, { objetivo, quien: objetivo, acierto: false, dano: 0, tipo, evento });
      return { entra: false, tirada };
    }
    c.entran++;
    this._suceso("pega", { id: i.id, a: objetivo, dano: Math.round(dano * 10) / 10 });
    this._costura("danaAOtro", i, { objetivo, quien: objetivo, dano, tipo, evento });
    const def = arnes.golpear?.(i, objetivo, dano, tipo) ?? null;
    const parado = Boolean(def?.parado);
    this._costura("hizoDano", i, {
      objetivo, quien: objetivo, acierto: !parado, tipo, evento,
      dano: parado ? 0 : (Number.isFinite(def?.dano) ? def.dano : dano),
    });
    return { entra: true, dano, tirada, parado };
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
    return avanzar(i, dt, arnes.libre, arnes.suelo, this.U, { valla: arnes.valla });
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
    // La tirada del atacante se guarda: es la misma que el motor pasa como
    // PARAM4 de `game_damaged` (`Damage.AccuracyRoll`, msmonsterserver.cpp:2284),
    // y si se volviera a tirar para el guion serían dos dados para un golpe.
    const tiradaDeAcierto = dados.acierto ?? aciertoDelGolpe();
    const p = parryDelBicho({
      parry: ia.parry ?? 0, tipo,
      acierto: tiradaDeAcierto,
      tiradas: {
        ...(dados.parry !== undefined ? { parry: dados.parry } : {}),
        ...(dados.acc !== undefined ? { acierto: dados.acc } : {}),
      },
    });
    // ── EL 91: EL GUION DEL QUE RECIBE, con la vida de ANTES ──────────────
    //
    // `game_damaged` (TraceAttack, msmonsterserver.cpp:2311) y, si el golpe
    // pasa, `game_struck` (TakeDamage, :2385, ANTES de `GiveHP`). Se avisa
    // aquí, antes de restar, porque es el orden del motor; la costura sabe
    // cuál de los dos toca con `parado`.
    this._costura("recibe", i, {
      quien: dados.quien ?? quien ?? null, dano, tipo, cubo,
      acierto: tiradaDeAcierto, parado: Boolean(p.para),
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
      // `suelta` sube también por el valor de retorno: en la partida de un solo
      // jugador quien mata lee esto y no el bus de sucesos.
      return { muerto: true, vida: 0, avisados: r.avisados, suelta: r.suelta ?? [] };
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
    // ── DEVOLVER EL GOLPE (el 82) ──────────────────────────────────────────
    //
    // `struck_by_enemy`, la rama VIVA del `if` que `cambiaDeObjetivo` estudió
    // (base_npc_attack_new.script:1078-1083). Sin esto, pegarle a una rata no
    // tenía ninguna consecuencia: `vermin` RECELA de `human`, y quien recela no
    // es «enemigo» para la caza, así que no te tomaba como objetivo ni por
    // verte ni por recibir. Era el fallo que el usuario veía como «las ratas no
    // me devuelven el golpe», y es literalmente eso: no lo devolvían.
    //
    // Va aquí y no en `reaccion.js` porque quien tiene el cazador es la manada.
    const aQuien = dados.quien ?? quien ?? null;
    if (i.cazador && aQuien !== null && aQuien !== undefined) {
      const a = apuntaAlQueTePega({
        relacion: ia?.relacion ?? i.ficha.relacion ?? null,
        tengoObjetivo: i.cazador.objetivo !== null,
        // Hoy los únicos objetivos posibles son jugadores, pero se pregunta en
        // vez de darlo por hecho: el día que un bicho pelee con otro, esta
        // rama tiene que dejar de aplicarse y pasar a `npcatk_retaliate`.
        objetivoEsJugador: esJugador(i.cazador.objetivo),
        huyendo: Boolean(i.cazador.huyendo),
      });
      if (a.apunta) i.cazador.apuntarA(aQuien);
    }
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
   * **`npcatk_settarget` QUE LLEGA DE OTRO GUION** — el 94. Lo pide el
   * guardia que oye a un aldeano (`civilian_attacked`,
   * gatecity/guard.script:114) por `GuionDeNpc._objetivoPedidoDeFuera`.
   *
   * Las dos guardas de base_npc_attack_new.script que se pueden decidir
   * aquí, en su orden: `if !IS_FLEEING` (:403) y «ignore allies»
   * (`$get(PARAM1,relationship,ent_me) equals ally`, :420). La relación es la
   * de la ficha hacia el jugador, como en `apuntaAlQueTePega`. Después,
   * `apuntarA`, que es como ya entra aquí el `npcatk_settarget` de un aliado
   * avisado (`avisar`).
   *
   * @returns si ha fijado el objetivo.
   */
  fijarObjetivoPorGuion(i, quien) {
    if (!i || i.muerto || !i.cazador || quien === null || quien === undefined) return false;
    if (i.cazador.huyendo) return false;
    if ((i.ficha.ia?.relacion ?? i.ficha.relacion ?? null) === RELACION.ALIADO) return false;
    i.cazador.apuntarA(quien);
    return true;
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
    // Y SUELTA LO QUE LLEVABA: `DropAllItems()`, que el motor llama en las tres
    // salidas de la muerte de un monstruo (msmonsterserver.cpp:2614, :2628 y
    // :2638). Se vacía al soltarlo para que un cadáver no pueda dar su pellejo
    // dos veces — `revivir` le sortea uno nuevo, como un bicho nuevo.
    const suelta = i.llevaEncima ?? [];
    i.llevaEncima = [];
    // EL 91: `game_predeath` y `game_death`, los dos sin parámetros
    // (msmonsterserver.cpp:2580 y :2605). Después del grito a los aliados,
    // que el guion también daría (`npcatk_alert_all_allies`, base_npc.script:
    // 169-172) y por eso está en `CIERRE_DE_BICHO`.
    this._costura("muere", i, { quien: quien ?? null });
    this._suceso("muere", {
      id: i.id, por: quien ?? null, avisados: avisados.length,
      // Va en el suceso y no en el valor de retorno porque con servidor el que
      // tiene el suelo está en el navegador: es lo mismo que hace «herido» con
      // el sonido. Quien lo recoge lo convierte en objetos del mundo.
      suelta,
    });
    return { muerto: true, avisados, suelta };
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
    // `d` es «no está en el mundo», y va antes que `m`: un bicho dormido no es un
    // cadáver, es un bicho que todavía no ha aparecido. El cliente no lo dibuja.
    if (i.dormido) e.d = 1;
    if (i.muerto) { e.m = 1; e.o = Math.round(i.opacidad * 100) / 100; }
    if (i.vida !== null) e.v = Math.max(0, Math.round(i.vida));
    // EL 94: `r` es `pev->framerate` (`setanim.framerate`), que el motor manda
    // al cliente con la entidad (`DEFINE_DELTA( framerate, DT_SIGNED | DT_FLOAT,
    // 8, 16.0 )`, assets/msr/delta.lst:107, o sea con dieciseisavos) y el
    // cliente usa para avanzar los fotogramas (`dfdt = (m_clTime - animtime) *
    // framerate * fps`, studiomodelrenderer.cpp:897). Va sólo cuando no es 1,
    // que es casi siempre; con tres decimales y no en dieciseisavos.
    const r = i.fisica?.ritmoAnim ?? 1;
    if (r !== 1) e.r = Math.round(r * 1000) / 1000;
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
      // `d` es «no está en el mundo». Va primero porque un bicho dormido no tiene
      // posición que valga: la última que se mandó es de antes de morir.
      i.dormido = Boolean(e.d);
      if (e.p) { i.donde[0] = e.p[0]; i.donde[1] = e.p[1]; i.donde[2] = e.p[2]; }
      if (typeof e.y === "number") i.yaw = e.y;
      if (typeof e.v === "number") i.vida = e.v;
      // EL 94: sin `r` es ritmo 1 (`estadoDe` sólo lo manda cuando no lo es).
      if (i.fisica) i.fisica.ritmoAnim = typeof e.r === "number" ? e.r : 1;
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

  /**
   * EL 91: un golpe, al guion del bicho. Un guion que revienta NO para la IA
   * —la IA es la que manda—, pero se cuenta y se dice por consola: tragárselo
   * callado sería un `catch {}` donde vive una regla muerta.
   */
  _costura(que, i, datos = {}) {
    if (!this.oyente) { this.costuraSinOyente++; return; }
    try { this.oyente({ que, i, ...datos }); }
    catch (e) { this.costuraFallos++; console.warn(`costura «${que}» de ${i?.ficha?.script}:`, e); }
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
