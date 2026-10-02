// LO QUE LE PASA AL QUE RECIBE EL GOLPE.
//
// Hasta el 18 un golpe sólo quitaba vida: el bicho seguía andando a su ritmo
// hasta caerse muerto de golpe. El motor tiene cinco cosas colgadas de
// `game_struck`, y esto las porta. Lo interesante es que **tres de las cinco no
// se pueden disparar**, y no porque no estén portadas: porque en el mod están
// escritas de forma que no llegan a ejecutarse. Eso se documenta con una prueba
// cada una, no con un comentario, porque es la diferencia entre «no lo hemos
// hecho» y «el juego no lo hace».
//
// El orden es el de `base_npc_attack_new.script:1065-1093`:
//
//     game_struck →  primer golpe?  → npcatk_settarget  (y eso avisa a los aliados)
//                    si no          → npcatk_retaliate
//                    npcatk_checkflee
//                    npcatk_checkflinch
//                    npc_struck     (el sonido, que lo pone cada bicho)
//
// Y HAY TRES SISTEMAS DE ENCOGERSE, no uno:
//
//   1. `base_pain.script`, marcado «depreciated» por su propio autor.
//   2. `npcatk_checkflinch`, en la IA base, con `CAN_FLINCH` a 0 por omisión.
//   3. `base_struck.script`, el nuevo, por tipo de material.
//
// De los bichos de Gate City, el ÚNICO que se encoge es el zombi enano de
// ballesta, y con el tercero.

// `RELACION` sale de `razas.js` y no de `script.js`, igual que en `ia.js`: ése
// lee ficheros con `node:fs` y tocarlo desde el navegador hace que Vite lo
// externalice y la página no cargue, sin más error que uno en la consola antes
// de que exista `probe`.
import { RELACION } from "../bsp/razas.js";

/**
 * EL ALCANCE DEL AVISO, que sale de la vida máxima y no es un número fijo:
 * `npc_post_spawn` (base_monster_shared.script:175-182) hace
 * `$ratio(min(maxhp,1000)/1000, 256, 1024)`, o sea que un bicho gordo se oye
 * más lejos. El goblin de 50 de vida avisa a 294 unidades (7,5 m) y un jefe de
 * 1 000 a 1 024 (26 m).
 */
export const AVISO = { minimo: 256, maximo: 1024, vidaDeReferencia: 1000 };

export function alcanceDeAviso(vidaMaxima) {
  const r = Math.min(vidaMaxima ?? 0, AVISO.vidaDeReferencia) / AVISO.vidaDeReferencia;
  return AVISO.minimo + (AVISO.maximo - AVISO.minimo) * r;
}

/**
 * A quién avisa: `$get_tsphere(ally, alcance)` — **una esfera de aliados**, con
 * la misma relación de razas que decide quién te ataca, y sin línea de visión.
 * Se grita a través de las paredes, que es lo que hace el motor.
 *
 * `de` y los `candidatos` van en unidades. Devuelve los índices.
 */
export function aQuienAvisa({ de, vidaMaxima, candidatos = [], esAliado = () => false }) {
  const r = alcanceDeAviso(vidaMaxima);
  const fuera = [];
  for (const c of candidatos) {
    if (c.i === de.i) continue;
    if (!esAliado(de, c)) continue;
    const dx = c.donde[0] - de.donde[0], dy = c.donde[1] - de.donde[1], dz = c.donde[2] - de.donde[2];
    if (Math.hypot(dx, dy, dz) <= r) fuera.push(c.i);
  }
  return fuera;
}

const dado = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const suerte = (porCiento, tirada = null) => (tirada ?? dado(1, 100)) <= porCiento;

/**
 * HUIR. `npcatk_checkflee` (base_npc_attack_new.script:1142):
 *
 * ```
 * if !CANT_FLEE
 * if ( FLEE_HEALTH > 0 )
 *   if ( game.monster.hp < FLEE_HEALTH )
 *     if ( $rand(1,100) <= FLEE_CHANCE ) callevent npcatk_flee ...
 * ```
 *
 * Y el propio `npcatk_flee` pide además `CAN_FLEE`, que no esté huyendo ya y que
 * el que le pega no sea él mismo. Las dos condiciones que importan son la vida y
 * la probabilidad, y **las dos vienen a 0 por omisión**, así que por omisión no
 * huye nadie: hay que ponerlas a mano. En Gate City las pone la rata gigante
 * (vida 2, 30 %) y tres de los zombis enanos (vida 25, 25 %).
 *
 * Ojo con la comparación: es la vida DESPUÉS del golpe y es estricta.
 */
export function huyeDelGolpe({ ficha, vida, huyendo = false, tirada = null } = {}) {
  const h = ficha?.huir;
  if (!h || h.nunca || !h.puede) return { huye: false, porque: "no puede" };
  if (huyendo) return { huye: false, porque: "ya huye" };
  if (!(h.vida > 0)) return { huye: false, porque: "sin FLEE_HEALTH" };
  if (!(vida < h.vida)) return { huye: false, porque: `vida ${vida} >= ${h.vida}` };
  if (!suerte(h.probabilidad, tirada)) return { huye: false, porque: "el dado" };
  return { huye: true, distancia: h.distancia, tiempo: h.tiempo, porque: "huye" };
}

/**
 * ENCOGERSE, primer sistema vivo: `npcatk_checkflinch`
 * (base_npc_attack_new.script:1156).
 *
 * ```
 * if ( CAN_FLINCH )                        // 0 por omisión
 *   if !FLINCHED_RECENTLY
 *   if ( game.monster.hp < FLINCH_HEALTH )  // maxhp por omisión, o sea siempre
 *     if PARAM1 > FLINCH_DAMAGE_THRESHOLD   // 10 % de la vida MÁXIMA
 *     if ( $rand(1,100) <= FLINCH_CHANCE )  ...encogerse...
 *     setvard FLINCHED_RECENTLY 1           // <- fuera del dado: la espera
 *                                           //    corre aunque no se encoja
 * ```
 *
 * El umbral es lo que lo decide todo en esta demo, y sale de una cifra del 18:
 * un personaje nuevo hace **1,1 de daño** con la espada oxidada, y el 10 % de un
 * goblin de 50 son **5**. O sea que aunque el goblin tuviera `CAN_FLINCH 1`,
 * **un personaje nuevo no puede hacerle encogerse ni una vez**. Hace falta un
 * arma que pase de 5 de daño real, y eso es competencia, no otra espada.
 */
export function seEncogeIA({ ficha, vida, dano, ahora = 0, desde = -Infinity, tirada = null } = {}) {
  const e = ficha?.encogerse;
  if (!e?.puede) return { encoge: false, porque: "CAN_FLINCH 0" };
  if (ahora < desde) return { encoge: false, porque: "espera" };
  if (!(vida < e.vidaParaEmpezar)) return { encoge: false, porque: "vida" };
  if (!(dano > e.umbralDeDano)) return { encoge: false, porque: `daño ${dano} <= ${e.umbralDeDano}` };
  // La espera arranca aunque el dado salga mal: el `setvard` está detrás del
  // bloque del dado, no dentro. Así que un golpe flojo «gasta» el intento.
  const salio = suerte(e.probabilidad, tirada);
  return {
    encoge: salio, animacion: e.animacion, hasta: ahora + e.espera,
    porque: salio ? "encoge" : "el dado",
  };
}

/** Los valores por omisión de `base_struck.script`, líneas 4-40. */
export const STRUCK_POR_OMISION = {
  material: "default",
  usaEncogerse: false,
  usaDolor: false,
  /** Mínimo entre encogimientos, y es LARGO: treinta segundos. */
  esperaEntreEncogerse: 30.0,
  /** Y el umbral es un RATIO de la vida ACTUAL, no de la máxima. */
  umbralDeEncogerse: 0.1,
  /** Cuánto se le suspende la IA mientras se encoge. */
  tiempoQuieto: 1.5,
  esperaEntreDolor: { min: 5.0, max: 10.0 },
  /** El dolor empieza por debajo de la mitad de la vida máxima. */
  vidaParaDolor: 0.5,
};

/**
 * ENCOGERSE, segundo sistema vivo: el de `base_struck.script:158-215`. Es el que
 * corre en Gate City, y sólo lo lleva el zombi enano de ballesta
 * (`NPC_USE_FLINCH 1`, `ANIM_FLINCH anim_xbow_flinch`, material `flesh`).
 *
 * Tres diferencias con el de la IA, y las tres cambian el resultado:
 *
 *   - **No hay dado.** Si el daño pasa el umbral, se encoge.
 *   - El umbral es un ratio de la vida **ACTUAL** (`$get(ent_me,hp)` en ese
 *     momento, antes de restar), así que cuanto más herido está, más fácil es
 *     encogerle: con 10 % y 100 de vida hacen falta 10 de daño, y con 11 de
 *     vida bastan 1,1 — que es justo lo que hace la espada oxidada.
 *   - Se le **suspende la IA** 1,5 s: no es sólo una animación, se queda quieto.
 *
 * Y hay una segunda puerta: `$get_takedmg(ent_me, tipo) >= 2`, o sea que un tipo
 * de daño al que sea el doble de vulnerable le hace encogerse **sin umbral**.
 */
export function seEncogeStruck({ ficha, vida, dano, tipo = "", ahora = 0, desde = -Infinity, vulnerabilidad = () => 1, quieto = false } = {}) {
  const s = ficha?.struck;
  if (!s?.usaEncogerse) return { encoge: false, porque: "NPC_USE_FLINCH 0" };
  if (!(ahora > desde)) return { encoge: false, porque: "espera" };
  const minimo = vida * (s.umbralDeEncogerse ?? STRUCK_POR_OMISION.umbralDeEncogerse);
  const puede = dano > minimo || vulnerabilidad(tipo) >= 2;
  if (!puede) return { encoge: false, porque: `daño ${dano} <= ${minimo}` };
  if (quieto) return { encoge: false, porque: "IA suspendida" };
  return {
    encoge: true, animacion: s.animacion,
    hasta: ahora + (s.esperaEntreEncogerse ?? STRUCK_POR_OMISION.esperaEntreEncogerse),
    quietoHasta: ahora + (s.tiempoQuieto ?? STRUCK_POR_OMISION.tiempoQuieto),
    porque: dano > minimo ? "daño" : "vulnerable",
  };
}

/**
 * CAMBIAR DE OBJETIVO — y ésta es la primera de las tres que NO SE PUEDE
 * DISPARAR. `npcatk_retaliate` (base_npc_attack_new.script:1098-1112):
 *
 * ```
 * if ( NPC_DELAY_RETALITATE > 0 )              // const $randf(5.0,10.0): siempre
 * {
 *     if ( game.time < NPC_NEXT_RETALITATE )   // arranca sin poner, o sea 0
 *     {
 *         setvard NPC_NEXT_RETALITATE game.time
 *         add NPC_NEXT_RETALITATE NPC_DELAY_RETALITATE
 *     }
 *     else { local EXIT_SUB 1 }
 * }
 * if !EXIT_SUB
 * ```
 *
 * Las dos ramas están al revés: la que espera es la que sigue adelante y la que
 * ha cumplido el plazo es la que se va. Y como `NPC_NEXT_RETALITATE` **sólo se
 * escribe dentro de la rama que nunca se toma**, se queda en 0 para siempre:
 * `game.time < 0` es falso en el primer golpe y en todos los demás.
 *
 * O sea que `RETALIATE_CHANCE 75%`, que el goblin y la araña escriben a mano,
 * es dato muerto: **ningún monstruo cambia de objetivo por recibir un golpe.**
 * Cambia porque te VE, que es otro camino y sí funciona.
 *
 * Se porta con el fallo puesto, y la prueba comprueba el fallo.
 */
export function cambiaDeObjetivo({ ficha, ahora = 0, proximo = 0, huyendo = false } = {}) {
  if (huyendo) return { cambia: false, porque: "huye" };
  if (!ficha?.puedeCambiarDeObjetivo && ficha?.puedeCambiarDeObjetivo !== undefined) {
    return { cambia: false, porque: "CAN_RETALIATE 0" };
  }
  const espera = ficha?.esperaDeCambio?.min ?? 5;
  if (espera > 0 && !(ahora < proximo)) {
    return { cambia: false, porque: "el plazo al revés (base_npc_attack_new.script:1104)" };
  }
  return { cambia: true, porque: "cambia" };
}

/**
 * DEVOLVER EL GOLPE, QUE SÍ SE PUEDE DISPARAR — el 82.
 *
 * `cambiaDeObjetivo`, justo arriba, porta `npcatk_retaliate` con su plazo del
 * revés y concluye que **ningún monstruo cambia de objetivo por recibir un
 * golpe**. Ese análisis es correcto para `npcatk_retaliate` y la conclusión se
 * pasó de ancha: son DOS ramas de un `if`, y la otra no tiene plazo ni dado
 * (base_npc_attack_new.script:1075-1089):
 *
 * ```
 * if ( $get(NPCATK_TARGET,isplayer) ) local L_FIRST_STRUCK 1
 * if ( NPCATK_TARGET equals unset )   local L_FIRST_STRUCK 1
 *
 * if ( L_FIRST_STRUCK )
 * {
 *     if !IS_FLEEING
 *     if $get(ent_laststruck,relationship,ent_me) equals wary
 *     callevent npcatk_settarget $get(ent_laststruck,id) "struck_by_enemy"
 * }
 * else
 * {
 *     if $get(ent_laststruck,id) isnot NPCATK_TARGET
 *     callevent npcatk_retaliate INC_PARAM          // ← la muerta
 * }
 * ```
 *
 * Y la condición que la gobierna es `relationship equals wary`, o sea RECELO,
 * que es **la relación de una rata con el jugador**: `vermin` declara
 * `recelo human` en `races.script`. O sea que esta rama no es un caso
 * marginal — es el único camino por el que un bicho que recela llega a
 * atacarte, porque por su raza no te toma como enemigo nunca (`esEnemigo` no
 * cuenta RECELO, npcscript.cpp:1806). Sin ella, pegarle a una rata no tiene
 * ninguna consecuencia: te mira y sigue a lo suyo.
 *
 * Que la de al lado esté muerta es justo lo que hizo difícil ver que ésta
 * faltaba: las dos salen del mismo golpe y una ya estaba estudiada y escrita.
 *
 * NO lleva dado ni plazo a propósito: los suyos están en la otra rama.
 */
export function apuntaAlQueTePega({
  relacion = null, tengoObjetivo = false, objetivoEsJugador = false, huyendo = false,
} = {}) {
  if (huyendo) return { apunta: false, porque: "IS_FLEEING" };
  // `L_FIRST_STRUCK`: sin objetivo, o con uno que es un jugador.
  if (tengoObjetivo && !objetivoEsJugador) {
    return { apunta: false, porque: "ya peleo con otro: eso es `npcatk_retaliate`, y está muerto" };
  }
  if (relacion !== RELACION.RECELO) {
    return { apunta: false, porque: "la rama pide `equals wary` y ésta no lo es" };
  }
  return { apunta: true, porque: "struck_by_enemy" };
}

/**
 * Y la tercera muerta, en `base_pain.script:52-53`:
 *
 * ```
 * local L_RND_FLINCH $rand(0,L_NFLINCH_ANIMS)
 * playanim critical $get_token(BPAIN_FLINCH_TOKENS,L_NFLINCH_ANIMS)
 * ```
 *
 * Tira el dado en `L_RND_FLINCH` y luego indexa con `L_NFLINCH_ANIMS`, que es el
 * número de animaciones menos uno. O sea que de las siete elige **siempre la
 * última**, `rlflinch`. Un dado tirado y tirado a la basura, igual que el
 * `hitchance` del arma en el 18.
 *
 * Esto es del sistema depreciado y no lo usa ningún bicho de Gate City; está
 * aquí porque la prueba que lo fija es de tres líneas y el fallo es del mismo
 * tipo que otros dos ya encontrados.
 */
export const ENCOGERSE_DEPRECIADO = {
  animaciones: ["flinchsmall", "flinch", "bigflinch", "laflinch", "raflinch", "llflinch", "rlflinch"],
  /** Lo que el script elige de verdad, tire lo que tire el dado. */
  elegida(animaciones = ENCOGERSE_DEPRECIADO.animaciones) {
    return animaciones[animaciones.length - 1];
  },
};

/**
 * El golpe entero, en el orden del motor. Devuelve lo que hay que HACER, sin
 * hacerlo: quien tiene los nodos y el audio es `bichos.js`.
 *
 * `dados` permite fijar cada tirada para las pruebas y para la sonda.
 */
export function reaccionAlGolpe({
  ficha, vida, dano, tipo = "", ahora = 0,
  estado = {}, vulnerabilidad, dados = {},
} = {}) {
  const fuera = {
    huye: null, encoge: null, cambia: null,
    // El sonido de recibir. Lo pone cada bicho y es lo único que pasa SIEMPRE.
    suena: "golpeado",
  };
  fuera.cambia = cambiaDeObjetivo({ ficha, ahora, proximo: estado.proximoCambio ?? 0, huyendo: estado.huyendo });
  const h = huyeDelGolpe({ ficha, vida, huyendo: estado.huyendo, tirada: dados.huir });
  if (h.huye) fuera.huye = h;
  // Los dos sistemas de encogerse, en el orden en que los ve un golpe: el de
  // `base_struck` corre en `game_damaged`, o sea ANTES que el `game_struck` de
  // la IA. El primero que diga que sí, gana.
  const s = seEncogeStruck({ ficha, vida, dano, tipo, ahora, desde: estado.proximoEncogerse ?? -Infinity, vulnerabilidad, quieto: estado.quieto });
  const e = s.encoge
    ? s
    : seEncogeIA({ ficha, vida, dano, ahora, desde: estado.proximoEncogerse ?? -Infinity, tirada: dados.encogerse });
  if (e.encoge) fuera.encoge = e;
  // Y el dolor: por debajo de la mitad de la vida máxima, cada 5-10 s.
  if (ficha?.struck?.usaDolor && vida < (ficha.vida ?? 0) * STRUCK_POR_OMISION.vidaParaDolor
      && ahora > (estado.proximoDolor ?? -Infinity)) {
    fuera.suena = "dolor";
    fuera.proximoDolor = ahora + (dados.dolor ?? STRUCK_POR_OMISION.esperaEntreDolor.min);
  }
  return fuera;
}
