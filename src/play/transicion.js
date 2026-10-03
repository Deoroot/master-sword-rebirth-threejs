// LAS TRANSICIONES ENTRE MAPAS: `msarea_transition`. El experimento 89.
//
// Es puro a propósito, como todo `src/play/`: ni DOM ni Three. Devuelve EFECTOS
// —un evento de guion, un mensaje, guardar, viajar— y quien los aplica es
// `src/main.js`. Así la regla se prueba en Node y la costura con una sonda.
//
// ── LO QUE HACE EL MOTOR, que son TRES piezas y no una ─────────────────────
//
// 1. PISAR EL VOLUMEN (`CAreaTransition::OnControls`, msmapents.cpp:1650-1726).
//    Una guarda de UNA vez —`if (pPlayer->CurrentTransArea == this) return`—,
//    se apunta a dónde se va, se GUARDA el personaje (`SaveChar`, :1707) y se le
//    manda al guion del jugador `game_transition_entered` con cuatro
//    parámetros: el nombre del destino, el mapa, el nombre de esta transición y
//    la llegada (:1714-1719). Ese evento lo recoge `help/first_transition`, que
//    ya estaba cargado en este puerto desde el 64 sin que nadie lo llamara: es
//    el consejo «You have entered a transition to …|Press enter to travel».
//
// 2. SALIR DEL VOLUMEN (`DeathNotice`, :1730-1767): se suelta la guarda y va
//    `game_transition_exited` con tres parámetros.
//
// 3. ACEPTAR (`MSQuery`, :1779-1872), que es el comando `accept` —Enter,
//    `bind "ENTER" "accept"`, config.cfg:6— llegando por
//    multiplay_gamerules.cpp:1725-1732. La primera vez llama al `game_master`
//    (`game_transition_triggered`); luego, si están TODOS dentro y TODOS han
//    votado, anuncia «Traveling to …», manda `game_map_change` y guarda.
//
// Y EL CAMBIO DE MAPA NO LO HACE EL C++: el `CHANGE_LEVEL` está comentado —
// «letting game_master script handle changelevel functions» (:1883)— y lo hace
// `game_master/map_transitions.script`. Lo que hace ese guion con UN jugador se
// porta aquí, con sus líneas: si el mapa no existe lo dice, y si existe anuncia
// el viaje y cambia de nivel cinco segundos después. Con MÁS de uno abre una
// votación (`gm_create_vote`), que **no está portada**, y se dice abajo.
//
// ── LO QUE NO SE PORTA, dicho aquí y contado ───────────────────────────────
//
//   - la VOTACIÓN de varios jugadores (`gm_create_vote`, map_transitions:23-26).
//     `aceptar` sabe contar votos y sabe si están todos dentro, pero la ventana
//     de votar no existe: con más de un jugador devuelve el efecto `votacion` y
//     quien lo aplica tiene que decir que no la hay. Ver el documento del 89.
//   - el sonido de entrar (`TRANS_PLAYSOUND`, :1723): el mensaje al cliente
//     lleva la bandera y el cliente toca algo; no se ha medido qué.
//   - el `master` (:1652-1664): se lee y se respeta si quien llama pregunta por
//     él, pero ninguna de las cuatro transiciones de Edana y las cloacas lo trae.

/** Los cinco segundos de `callevent 5.0 delay_changelevel` (map_transitions:73). */
export const ESPERA_DEL_VIAJE = 5.0;

/**
 * El texto de «el mapa no está en este servidor», copiado del guion:
 *
 *     messageall green L_MAP " does not exist on this server. Perhaps this is a future transition point?"
 *                                                    map_transitions.script:15
 *
 * `L_MAP` es `PARAM2`, o sea el `destmap` tal cual — no el nombre bonito.
 */
export const noExiste = (mapa) =>
  `${mapa} does not exist on this server. Perhaps this is a future transition point?`;

/** «TRAVELING TO <map>» / «You will be reconnected shortly.» — map_transitions.script:69-70. */
export const viajandoA = (mapa) => ({ titulo: `TRAVELING TO ${mapa}`, texto: "You will be reconnected shortly." });

/** `UTIL_ClientPrintAll(HUD_PRINTCENTER, "Traveling to %s\n", destname)` — msmapents.cpp:1835. */
export const anuncioDeViaje = (comoSeLlama) => `Traveling to ${comoSeLlama}`;

/** «* Mapper did not include transition link: %s *» — player.cpp:2530. */
export const faltaElEnlace = (nombre) => `* Mapper did not include transition link: ${nombre} *`;

/** Los parámetros de `game_transition_entered`, en el orden del motor (msmapents.cpp:1714-1718). */
const paramsDeEntrada = (z) => [z.comoSeLlama ?? "", z.destino ?? "", z.nombre ?? "", z.llegada ?? ""];

export class Transiciones {
  /**
   * @param mapaExiste  `(nombre) => boolean`. Es el `$map_exists` del guion: en
   *                    este puerto, si el mapa está en `MAPAS_PORTADOS`. Se
   *                    compara en MINÚSCULAS porque los nombres del `.bsp` no lo
   *                    están siempre —`Gertenheld_Cape` contra
   *                    `gertenheld_cape.bsp`— y el guion del jugador ya los baja
   *                    (`$lcase(PARAM2)`, help/first_transition.script:17).
   */
  constructor({ mapaExiste = () => false } = {}) {
    this.mapaExiste = mapaExiste;
    /** `CurrentTransArea`: la transición en la que estás, o `null`. */
    this.actual = null;
    /** `bDidVote`: si ya se llamó al `game_master` desde esta transición. */
    this.yaSeLlamo = false;
    /** `GM_DISABLE_TRANSITIONS`: lo pone el guion al empezar un viaje (:38). */
    this.deshabilitadas = false;
    /** El viaje en marcha, o `null`. */
    this.viaje = null;
    /** El bit de este jugador en `PlayerVotes`. */
    this.votado = false;
  }

  /**
   * Un tic: en qué transiciones está el jugador AHORA. Devuelve los efectos.
   *
   * `dentro` es la lista de zonas `msarea_transition` que contienen al jugador
   * (normalmente cero o una). `maestroAbierto(nombre)` contesta el
   * `UTIL_IsMasterTriggered`; sin él, todo maestro cuenta como abierto, que es
   * lo que pasa con las cuatro de estos dos mapas porque no traen ninguno.
   */
  tic(dentro = [], { maestroAbierto = () => true } = {}) {
    const efectos = [];
    const zona = dentro[0] ?? null;

    // SALIR: estabas en una y ya no estás en ella. `DeathNotice`.
    if (this.actual && this.actual !== zona) {
      if (!this.deshabilitadas) {
        const z = this.actual;
        efectos.push({ tipo: "evento", nombre: "game_transition_exited", params: paramsDeEntrada(z).slice(0, 3) });
      }
      this.actual = null;
      this.yaSeLlamo = false;
    }

    // ENTRAR. Todas las guardas de `OnControls`, en su orden.
    if (zona && this.actual !== zona) {
      if (zona.maestro && !maestroAbierto(zona.maestro)) return efectos;   // :1652-1664
      if (this.deshabilitadas) return efectos;                             // :1666-1669
      this.actual = zona;                                                  // :1676-1677
      // `PlayerVotes = 0` al entrar (:1684-1693): los votos son por entrada.
      this.votado = false;
      // `SaveChar()` va ANTES del evento (:1707 y :1719): si el guion del jugador
      // hace algo raro, lo guardado es el personaje que entró.
      efectos.push({ tipo: "guardar" });
      efectos.push({ tipo: "evento", nombre: "game_transition_entered", params: paramsDeEntrada(zona) });
    }
    return efectos;
  }

  /**
   * El jugador pulsa Enter (`accept`). Es `MSQuery` y, con UN jugador, lo que el
   * `game_master` hace después.
   *
   * @param jugadores   cuántos hay en la partida (`game.players`).
   * @param todosDentro `FAllPlayersAreTouchingMe()`: con uno, siempre cierto.
   */
  aceptar({ jugadores = 1, todosDentro = true, todosVotaron = jugadores <= 1, quien = "" } = {}) {
    const z = this.actual;
    // Sin transición `accept` no hace nada aquí: en el motor sigue y prueba a
    // aceptar un miembro de grupo (multiplay_gamerules.cpp:1735), que este
    // puerto no tiene. Y `GM_DISABLE_TRANSITIONS` se mira AL EMPEZAR (:1784):
    // la segunda vez que pulsas, el guion ya lo ha puesto y no pasa nada.
    if (!z || this.deshabilitadas) return [];
    const efectos = [];

    // La primera vez, el `game_master`: `game_transition_triggered` (:1788-1798).
    if (!this.yaSeLlamo) {
      this.yaSeLlamo = true;
      efectos.push(...this._gameMaster(z, jugadores));
    }

    // ── Y EL C++ SIGUE, diga lo que diga el guion ───────────────────────────
    //
    // Esto lo escribí primero sólo para cuando había viaje, y es falso: `MSQuery`
    // no se entera de lo que haya hecho el guion. Si están todos dentro y todos
    // han votado, anuncia el viaje **aunque el mapa no exista** — y entonces en
    // el juego salen las dos cosas a la vez, el «does not exist on this server»
    // en verde y el «Traveling to The Thornlands» en el centro. Lo único que
    // mira es si quitar los controles (`IS_MAP_VALID`, :1842-1843).
    if (!todosDentro) return efectos;                                      // :1801-1802
    if (this.votado) return efectos;                                       // :1807-1808
    this.votado = true;
    if (jugadores > 1 && quien) {
      efectos.push({ tipo: "aviso", titulo: "Travel", texto: `${quien} wants to go to ${z.comoSeLlama ?? z.destino}` });   // :1825-1828
    }
    if (!todosVotaron) return efectos;                                     // :1831
    efectos.push({ tipo: "centro", texto: anuncioDeViaje(z.comoSeLlama ?? z.destino) });   // :1833
    if (this.mapaExiste(String(z.destino ?? "").toLowerCase())) efectos.push({ tipo: "bloquear" });   // :1842-1843
    efectos.push({ tipo: "evento", nombre: "game_map_change", params: [z.destino ?? ""] });  // :1846-1848
    efectos.push({ tipo: "guardar" });                                                       // :1858
    return efectos;
  }

  /** `game_master/map_transitions.script`, `game_transition_triggered` y `gm_manual_map_change`. */
  _gameMaster(z, jugadores) {
    const mapa = String(z.destino ?? "");
    if (!this.mapaExiste(mapa.toLowerCase())) {
      // :13-16. Y no pasa nada más: la transición sigue ahí y se puede volver a
      // intentar saliendo y entrando, que es como se juega.
      return [{ tipo: "mensaje", color: "green", texto: noExiste(mapa) }];
    }
    if (jugadores > 1) {
      // :21-27. La votación. NO PORTADA: se devuelve para que quien la aplique
      // lo diga, en vez de viajar solo y dejar a los demás atrás.
      return [{ tipo: "votacion", mapa: mapa.toLowerCase(), titulo: `Travel to ${z.comoSeLlama ?? mapa}?` }];
    }
    // `gm_manual_map_change` (:36-74), con un jugador.
    this.deshabilitadas = true;                                            // :38
    this.viaje = { mapa: mapa.toLowerCase(), llegada: z.llegada ?? null, desde: z.nombre ?? null };
    const v = viajandoA(mapa);
    return [
      { tipo: "aviso", titulo: v.titulo, texto: v.texto },                 // :69-70, `infomsg all`
      { tipo: "viajar", mapa: this.viaje.mapa, llegada: this.viaje.llegada, en: ESPERA_DEL_VIAJE },   // :73
    ];
  }
}

/**
 * EN QUÉ PUNTO SE APARECE AL LLEGAR.
 *
 * Primero, `GetRandomSpawnSpot(SPAWN_GENERIC, nombre)`: coincidencia EXACTA del
 * `message` con el nombre (player.cpp:2363-2367) —una llegada sin nombre no vale
 * para ninguno— y entre las que valen, una al azar (`RANDOM_LONG`, :2378).
 * `azar(n)` devuelve un entero en `[0, n)`.
 *
 * Y si no hay ninguna, el RESPALDO depende de cómo se entra (`m_JoinType`), y
 * eso lo decide `CanJoinThisMap` con una PRIMERA comprobación que manda sobre
 * todo lo demás:
 *
 *     if (MSGlobals::CanCreateCharOnMap)
 *         JoinType = JN_STARTMAP;                    mscharacter.cpp:216-217
 *
 * y `CanCreateCharOnMap` lo pone cualquier `ms_player_begin` del mapa
 * (player.cpp:2563). O sea:
 *
 *   - destino CON `ms_player_begin` → `JN_STARTMAP`: si la llegada no aparece,
 *     al punto de inicio (`GetRandomSpawnSpot(SPAWN_BEGIN, NULL)`, :2491-2492).
 *     Ése es `inicio`.
 *   - destino SIN él → `JN_TRAVEL`: sin respaldo; el motor escribe
 *     `faltaElEnlace` y expulsa (:2525-2547). Aquí, `null`.
 *
 * ── CORRECCIÓN DEL 89, al lado y sin borrar lo que se dijo ──────────────────
 *
 * Esto se escribió primero diciendo que de Edana a las cloacas **no se llega**:
 * Edana manda con `desttrans sewer_start`, las cloacas no tienen ninguna llegada
 * con ese nombre —sólo `fromchapel`— y leí la rama de `JN_TRAVEL`, que no tiene
 * respaldo, como si quien viaja entrara siempre por ella. **Es falso, y lo
 * desmintió el usuario con una captura del juego original llegando a las
 * cloacas.** Las cloacas tienen `ms_player_begin`, así que quien llega es
 * `JN_STARTMAP` y cae en el inicio, a 2,6 m de la escalera de vuelta a Edana.
 * *Antes de seguir una rama, lee quién decide la rama* — la condición estaba
 * en otro archivo.
 *
 * Lo que queda aproximado y se dice: el motor sortea entre TODOS los
 * `ms_player_begin` (Edana tiene cinco) y el horneado guarda uno, el mismo que
 * usa este puerto para los personajes nuevos.
 */
export function elegirLlegada(llegadas = [], nombre, { inicio = null, azar = (n) => Math.floor(Math.random() * n) } = {}) {
  const validas = nombre ? llegadas.filter((l) => l.nombre === nombre) : [];
  if (validas.length) return validas[azar(validas.length)];
  return inicio;
}

/**
 * El `inicio` que hay que pasarle a `elegirLlegada` para un mapa horneado: su
 * `entrada` si es un `ms_player_begin` (o sea, si el mapa deja crear personaje y
 * por tanto entra `JN_STARTMAP`), y si no, `null`.
 */
export function inicioDe(manifiesto) {
  const e = manifiesto?.entrada;
  return e && e.clase === "ms_player_begin" ? { nombre: null, unidades: e.unidades, pies: e.pies, yaw: null } : null;
}
