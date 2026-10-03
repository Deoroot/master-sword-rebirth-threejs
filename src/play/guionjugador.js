// EL JUGADOR TAMBIÉN ES UNA ENTIDAD CON GUION — el 64.
//
// Éste es el descubrimiento del experimento, y explica un hueco que llevaba
// tiempo sin nombre. Este puerto corría los guiones de los NPC desde el 33 y
// **ninguno del jugador**, así que faltaban cosas que no son de ningún NPC:
//
//     if ( OLD_PARRY != PL_PARRY ) yplayermessage ent_me Your Parry value is now TOTAL_PARRY
//                                     MSCScripts/scripts/player/externals.script:696
//
// El «Your Parry value is now 2» de una captura del juego no sale del motor ni
// del mod: sale de un `.script`, como las conversaciones de los NPC. Y con él
// salen la regeneración, los avisos de la primera vez, las emociones y los
// efectos de clima. Son **27 archivos y 9 566 líneas** colgando de
// `player/player.script`.
//
// Lo que este archivo hace es montar ese guion sobre el MISMO intérprete que
// los NPC (`src/play/guion.js`), con el entorno del jugador en vez del de un
// monstruo. Lo que NO hace es fingir que cabe entero: `npm run jugador` dice
// cuántos archivos caben —**7 de 25** el día que se escribió esto— y este
// módulo se queda con los que caben y **dice cuáles no**.
//
// ── Qué cabe hoy, y por qué se dice aquí ────────────────────────────────────
//
// Los que caben enteros son los cuatro consejos de la primera vez
// (`help/first_*`), el sonido del jugador y dos de efectos de cliente. De los
// cuatro consejos **sólo dos se pueden disparar**: este puerto no tiene grupos
// ni transiciones entre mapas, así que `game_party_join` y
// `game_transition_entered` no los llama nadie. Se cargan igual —el día que
// haya grupos funcionan sin tocar nada— pero **no se cuentan entre lo hecho**,
// que es lo que manda el apartado 4 de CLAUDE.md cuando no hay segundo caso.
//
// CORRECCIÓN DEL 89, al lado: las transiciones ya existen, así que de los cuatro
// consejos se disparan TRES. Sólo `game_party_join` sigue sin quien lo llame.

import { Guion, entornoVacio, enteroDe } from "./guion.js";
import { Consejos } from "./consejos.js";
import { RelojDeGuiones } from "./npcguion.js";
import { desplazamientoDeVista } from "./efectosdeguion.js";
import { habilidadDeGuion } from "./habilidad.js";
import { propiedadesDe } from "../juego/stats.js";
import { EfectosDeEntidad, BanderasDeEntidad, ResistenciasDeEntidad } from "./efectos.js";

/**
 * Los eventos que el motor le manda al jugador y que este puerto SÍ dispara.
 *
 * Está escrito aquí y no repartido por el código para que se pueda leer de un
 * vistazo qué parte del jugador está viva. Cada uno lleva de dónde sale.
 */
export const EVENTOS_DEL_JUGADOR = Object.freeze({
  /** Al morir. `game_death` — help/first_death.script:3. */
  MUERE: "game_death",
  /** Al subir una habilidad. 1: escuela 2: subhabilidad 3: valor. */
  APRENDE: "game_learnskill",
  /** El gancho que el propio motor llama tras enseñar un consejo. */
  CONSEJO: "game_helptip",
  // ── EL 65: los que el guion ya sabía contestar y nadie llamaba ──────────
  /**
   * Has parado un golpe. **Seis parámetros**, y el script usa el cuarto y el
   * quinto para decirte las tiradas:
   *
   *     1 atacante · 2 daño · 3 tipo · 4 tirada de parry · 5 |tirada de acierto| · 6 valor
   *                                            msmonsterserver.cpp:2237-2245
   */
  PARRY: "game_parry",
  /** Te han pegado. 1: atacante 2: daño. */
  DANADO: "game_damaged",
  /** Has ganado experiencia. 1: cuánta. */
  EXPERIENCIA: "game_xpgain",
  /**
   * Has aterrizado fuerte. 1: la caída en milésimas de unidad, que es lo que
   * `player_hitgroundhard` multiplica por 0,05 para sacar el hundimiento.
   */
  SUELO: "game_hitground",
  // ── EL 66: lo que le hace un objeto ────────────────────────────────────
  /**
   * Has empuñado algo. 1: el objeto.
   *
   * Lo manda el motor **al jugador** justo antes del `game_deploy` del objeto,
   * y sólo en el servidor:
   *
   *     m_pOwner->CallScriptEvent("game_equipped", &Params);
   *     ...
   *     CallScriptEvent("game_deploy");
   *                                    genericitem.cpp:679-683
   */
  EMPUNA: "game_equipped",
  // CORRECCIÓN DEL 89c, al lado: el título de esta lista dice «que este puerto
  // SÍ dispara», y éste NO lo dispara nadie. Lo llama una prueba a mano. Por
  // eso el «Your Parry value is now 2» del 64 —la línea con la que empieza
  // este archivo— no sale nunca jugando. Ver `SIN_QUIEN_LOS_LLAME`.
  // ── EL 67: el jugador entra en el mundo, y el mapa se enciende ──────────
  /**
   * Te acaban de poner en el mapa. **Sin parámetros.**
   *
   *     else
   *     {
   *         dbg("Spawn in regular mode");
   *         CallScriptEvent("game_player_putinworld"); //Thothie MAR2008a
   *                                            player.cpp:2766-2771
   *
   * Es la rama de `CBasePlayer::Spawn` que NO es la de observador, o sea
   * después de elegir personaje, no durante. Y es la puerta por la que un mapa
   * de Master Sword arranca, porque dentro hace:
   *
   *     callevent 1.0 activate_stuff        player_main.script:1043
   *
   * y `activate_stuff` (`:132-140`) hace, la primera vez:
   *
   *     callexternal all player_joined $get(ent_me,id)
   *     usetrigger player_joined
   *
   * Ese `usetrigger` es lo que llena la taberna de Edana: **11 parroquianos
   * sentados** esperan a que se dispare su `ms_monsterspawn`, y la cadena es
   * `player_joined` -> `patronmm1` -> `patronspawn` -> `patron1..patron12`.
   * Hasta el 67 el evento estaba cargado, el comando no existía y el mapa se
   * quedaba con la taberna vacía sin un solo error.
   */
  ENTRA: "game_player_putinworld",
});

/**
 * Los eventos que están cargados y **no los dispara nadie todavía**, con el
 * motivo. Un evento sin quien lo llame es exactamente el sitio donde vive una
 * regla que nunca corre — el fallo del apartado 4— así que se nombra.
 */
export const SIN_QUIEN_LOS_LLAME = Object.freeze({
  game_party_join: "no hay grupos: el canal «party» del chat existe desde el 61 y nadie se une a nada",
  // CORRECCIÓN DEL 89: aquí estaba también `game_transition_entered`, con «no
  // hay transiciones entre mapas: se cambia de mapa por el menú». Dejó de ser
  // verdad en el 89: lo dispara `src/play/transicion.js` al pisar una
  // `msarea_transition`, y su consejo —y el `trans_message` de debajo— se ven
  // en pantalla (`sondas/transicion89.mjs`). Se quita de la lista en vez de
  // dejar el diagnóstico caducado, que es justo lo que el 79 enseñó a no hacer.
  //
  // ── EL 89c, contando ANTES de portar `drainstamina`, `addvelocity`,
  // `removeitem`, `addgold` y `setstat`: casi todo su uso en el guion del
  // jugador cuelga de estos cinco, y ninguno lo llama nadie aquí.
  game_equipped: "lo declara EVENTOS_DEL_JUGADOR.EMPUNA desde el 66, pero NADIE lo llama en el juego: sólo `test/juego_objetos66.test.mjs`, a mano. Detrás van `update_parry` y su `setstat parry`, y además lee el objeto por `$get(<objeto>,handpref|scriptvar)`, que este entorno no resuelve: llamado hoy pondría el parry a 0",
  game_leapback: "el salto atrás llega por `game_leap back <aguante>`, que el CLIENTE manda al pulsar dos veces atrás con `ms_doubletapdodge 1` (input.cpp:454-464, client.cpp:517-529). Este puerto no tiene el doble toque: su `drainstamina` y su `addvelocity` no corren",
  game_leapleft: "como `game_leapback`, con el doble toque de izquierda; pide además Martial Arts por encima de 10, que un personaje nuevo no tiene",
  game_leapright: "como `game_leapleft`, a la derecha",
  game_player_got_from_store: "`comprar` lo DICE (src/play/tienda.js, `eventos`) y `comprarDeLaTienda` no lo manda: es la forma del 62. Detrás van el `addgold` de las bolsas de oro y el `removeitem`, y ninguna tienda portada vende `gold_pouch_*` (salen de cofres, global/server/treasure.script)",
});

/**
 * CORRECCIÓN DEL 67, al lado y sin reescribir lo de arriba.
 *
 * `game_player_putinworld` NO estaba en esa lista y llevaba desde el 64 sin que
 * nadie lo llamara, que es peor: los eventos nombrados arriba se sabía que no
 * corrían, y éste se daba por hecho. Es el evento con el que un mapa de Master
 * Sword se enciende —`usetrigger player_joined` sale de ahí— y se quedaba sin
 * llamar Y sin declarar. Ahora lo llama `src/main.js` al aparecer.
 *
 * La lección, que es la del apartado 4 con otra ropa: **una lista de «esto no
 * corre» sólo sirve si alguien comprueba que lo que NO está en ella sí corre.**
 * Lo que se mide es lo que se llama, y el censo de eventos cargados —541 en el
 * guion del jugador— no dice cuántos se disparan.
 */
export const LLAMADO_DESDE_EL_67 = Object.freeze({
  game_player_putinworld: "src/main.js, en `sesion.al(\"aparece\")` — player.cpp:2771",
});

/**
 * El guion del jugador, montado sobre el intérprete de siempre.
 *
 * @param {object} ficha        lo que hornea `npm run jugador` (`build/msr/jugador.json`)
 * @param {object} personaje    el personaje, para leerle la vida y apuntarle los consejos vistos
 * @param {Function} consejo    dónde se enseña un consejo: `({titulo, lineas}) => void`
 * @param {Function} suceso     la consola de sucesos, para los `*playermessage`
 * @param {Function} dar        `(que, cantidad) => void` con `que` en "vida"|"mana"
 * @param {Function} ahora      el reloj en segundos
 */
export class GuionDelJugador {
  constructor({
    ficha = null, personaje = null,
    consejo = null, suceso = null, dar = null,
    ahora = () => 0, maximos = null, usarDisparador = null,
    // EL 83. `game.map.name`. Va en la firma Y en el `new Guion` de abajo: el
    // 63 se perdió justo aquí, con el parámetro en la firma y sin reenviar, y
    // las pruebas siguieron verdes porque llamaban al entorno a mano.
    mapa = null,
    // EL 89. `game.players`, por el mismo camino y con el mismo aviso del 63.
    jugadores = null,
    // EL 89. `infomsg`: la ventana de arriba a la izquierda. Ver el entorno.
    aviso = null,
    // LOS EFECTOS: la `TablaDeEfectos` horneada (`npm run efectos:guion`). El
    // jugador es el ANFITRIÓN de lo que le apliquen —la cura del sacerdote, el
    // sentarse— y sin tabla un `applyeffect` sobre él se apunta. Firma Y uso
    // abajo, por el 63.
    efectos = null,
    // EL 89c. Lo que el guion le cambia al jugador y no vive en `personaje`:
    //   aguante  `{ leer, poner, maximo }` — `drainstamina`
    //   fisica   `{ empujar(v, sumar), colocar(v) }`, v en UNIDADES y ejes
    //            del motor — `setvelocity`/`addvelocity`/`setorigin`
    //   cambio   `(que) => void` tras tocar `personaje` (oro, objetos,
    //            habilidades), para guardarlo y remontar lo que haga falta
    // Van en la firma Y en el entorno de abajo: el 63 otra vez.
    aguante = null, fisica = null, cambio = null,
    // EL 91. La puerta del DAÑO que le llega al jugador desde un guion —el
    // `xdodamage` de un veneno—: `(golpe) => void`, con `golpe = { dano,
    // tipo, acierto, atacante, infligidor }` y el daño YA multiplicado por sus
    // resistencias. Quien la inyecta (`src/main.js`) la manda por el MISMO
    // camino que el golpe de un bicho. Firma Y uso abajo, por el 63.
    herir = null,
  } = {}) {
    this.personaje = personaje;
    this._ahora = ahora;
    /**
     * Dónde se apunta la vida y el maná que llegan. Se guarda además de
     * pasarse al entorno porque desde el 66 **también se lo da un objeto**: la
     * curación pasiva del hechizo de rejuvenecer es un `givehp` del guion DEL
     * OBJETO, y tiene que acabar en el mismo sitio que la del jugador.
     */
    this._dar = dar;
    this.consejos = new Consejos({ vistos: personaje?.consejosVistos ?? [] });
    this.enseñado = [];
    /** Los `callevent` con retardo del guion. Los mueve `paso()`. */
    this.reloj = new RelojDeGuiones();
    /** Lo que el guion pidió y no se supo hacer, como en los NPC. */
    this.noSoportados = [];
    /** Los nombres que el guion ha disparado con `usetrigger` (el 67). Para medir. */
    this.disparados = [];
    // ── EL 91: LO QUE ES DE LA ENTIDAD Y NO DEL GUION ────────────────────
    /** `m_scriptflags` (scriptcmds.cpp:5265). Los venenos se apuntan aquí. */
    this.banderas = new BanderasDeEntidad({ esJugador: true });
    /** `GenericTDM` y `TakeDamageModifiers` (msmonster.h:341-343). */
    this.resistencias = new ResistenciasDeEntidad();
    this._herir = herir;
    /** Cada daño recibido por esta puerta, ya resistido. Para medir. */
    this.heridas = [];

    const dueño = this;
    this.guion = new Guion({
      eventos: ficha?.eventos ?? [],
      preload: ficha?.preload ?? [],
      nombre: "player/player",
      // `game.time`: el guion mide contra él el hundimiento de la vista.
      ahora: () => this._ahora(),
      // `game.map.name` (el 83). Sin esta línea el gancho vive a `null` en
      // todas las partidas y la guarda del bono del gauntlet no se cumple.
      mapa,
      // `game.players` (el 89): sin él, el consejo de la primera transición
      // sale cortado — su «Press enter» va detrás de `game.players == 1`.
      jugadores,
      // SOBRE `entornoVacio()`, no en vez de él. El intérprete pide ganchos
      // que el jugador no usa —el azar, las listas, el mundo— y si falta uno
      // no da un hueco: **revienta el evento entero a medias**, así que el
      // consejo de después no llega. Pasó con `azarFlotante`.
      entorno: { ...entornoVacio(), ...entornoDelJugador({ dueño, consejo, suceso, dar, maximos, usarDisparador, aviso, aguante, fisica, cambio }) },
    });
    // ── LOS EFECTOS: EL JUGADOR ES SU ANFITRIÓN ──────────────────────────
    //
    // Un efecto es otro guion que se AÑADE a `m_Scripts` del objetivo
    // (scriptedeffects.cpp:27). Su `ent_me` es el jugador, y lo que el
    // jugador oye lo oye también él (`CallScriptEvent` recorre todos,
    // script.cpp:5932-5937): por eso `llamar` y `paso` de abajo los incluyen.
    // Ver `src/play/efectos.js`.
    this.efectos = new EfectosDeEntidad({
      tabla: efectos,
      ahora: () => this._ahora(),
      anfitrion: {
        // El mismo asa que le dan los NPC (`contextoDelJugador`, interacciones.js).
        id: () => String(dueño.personaje?.id ?? "player"),
        esJugador: true,
        vivo: () => (dueño.personaje?.vida ?? 1) > 0,
        entorno: () => dueño.guion.entorno,
        llamar: (n, p) => dueño.llamar(n, p),
        // ── EL 91 ──
        // `entindex()`: en GoldSrc los jugadores son las entidades
        // 1..maxClients, y en una partida de uno éste es la 1.
        indice: () => 1,
        // `GetFirstScriptVar`: el guion PROPIO del jugador (script.cpp:5949).
        // `resolver` devuelve el nombre si no existe, como `GetVar` (:4741).
        variable: (n) => dueño.guion.resolver(String(n)),
        banderas: () => dueño.banderas,
        resistencias: () => dueño.resistencias,
        herir: (g) => dueño.recibirDano(g),
      },
    });
    Object.assign(this.guion.entorno, this.efectos.ganchos({
      base: { ...this.guion.entorno },
      apuntar: (tipo, nombre) => this.noSoportados.push({ tipo, nombre }),
    }));
    // ── EL ORDEN DEL MOTOR, QUE NO ES EL QUE UNO ESCRIBIRÍA ──────────────
    //
    // Primero se ARMAN los relojes y DESPUÉS corre el bloque sin nombre, y al
    // revés daría otro juego. `repeatdelay` lo resuelve el CARGADOR
    // (script.cpp:5377-5382) y el bloque sin nombre es un evento «programado
    // para ya» que corre en el primer `Think` (:5198-5202). Como la
    // regeneración arma su reloj con una variable que ese bloque aún no ha
    // puesto, armar antes es lo que hace que la primera vuelta salga a cero.
    this.guion.armarRepeticiones(this._ahora());
    // El bloque sin nombre. Es lo mismo que hace `GuionDeNpc` desde el 60, y
    // aquí hace falta de verdad: las cuatro variables de la regeneración son
    // `setvard` de cabecera, y `setvard` NO entra en el `preload`
    // (script.cpp:5448).
    this.guion.llamar("", []);
  }

  /** `CallScriptEvent(<nombre>, params)`. Devuelve si algún evento respondió. */
  llamar(nombre, params = []) {
    const ps = params.map((p) => String(p));
    const propio = this.guion.llamar(String(nombre), ps);
    // Y a sus efectos, que son guiones de la misma entidad (script.cpp:5932-5937).
    const deEfectos = this.efectos?.llamar(String(nombre), ps) ?? false;
    return propio || deEfectos;
  }

  /**
   * Vida o maná que le llega de FUERA de su guion — de un objeto (el 66).
   *
   * `que` es `"vida"` o `"mana"`. Entra por la misma puerta que el `givehp` de
   * su propio guion a propósito: si un objeto curara por otro camino, la
   * regeneración del jugador y la del hechizo se podrían desincronizar sin que
   * nada lo dijera.
   */
  recibir(que, cantidad) { this._dar?.(que, cantidad); }

  /**
   * EL 91. Un golpe que ya ha ENTRADO (`golpeDirecto`, `efectos.js`) llega al
   * jugador. Aquí sólo se le aplican sus resistencias —el `GenericTDM` y los
   * `takedmg` de su guion, `CMSMonster::TraceAttack`,
   * msmonsterserver.cpp:2269-2281— y se manda por la puerta que inyecta el
   * juego. El escudo, el parry, el mensaje, `game_damaged` y restar la vida
   * son de esa puerta, que es la de un golpe de bicho (`src/main.js`).
   *
   * El ORDEN del motor es escudo -> parry -> resistencias; aquí las
   * resistencias van antes. Para un veneno da igual —ni el escudo ni el
   * parry paran nada con «effect» o «poison» en el tipo (escudo.js,
   * parry.js)—, y por eso se deja dicho y no arreglado.
   */
  recibirDano(g) {
    const dano = this.resistencias.multiplicar(g.dano, g.tipo);
    this.heridas.push({ t: this._ahora(), dano, tipo: g.tipo, de: g.atacante?.nombre ?? null });
    if (!this._herir) { this.noSoportados.push({ tipo: "daño", nombre: `${g.comando ?? "?"} sin puerta de daño` }); return; }
    this._herir({ ...g, dano });
  }

  /** El paso del reloj: los eventos con `repeatdelay`. */
  paso(dt = 0) {
    // Los dos relojes, y son distintos: `repeatdelay` se mide contra el reloj
    // del juego y `callevent <segundos>` contra lo que ha pasado desde el paso
    // anterior. Se mueven los dos aquí para que quien llama no tenga que saberlo.
    const a = this.guion.pasoDeRepeticiones(this._ahora());
    const b = this.reloj.paso(dt);
    // Los efectos llevan sus propios relojes: cada `CScript` tiene los suyos.
    const c = this.efectos?.paso(dt) ?? 0;
    return a + b + c;
  }

  /** Los consejos ya vistos, para guardarlos en el personaje. */
  get vistos() { return [...this.consejos.vistos]; }

  /**
   * LO QUE EL GUION LE ESTÁ HACIENDO A LA VISTA ahora mismo.
   *
   * Se PREGUNTA cada fotograma y no se guarda, porque es una interfaz por
   * variable: el guion escribe el número y no avisa a nadie. Ver
   * `src/play/efectosdeguion.js`, con la cita y su errata.
   */
  vista(cual = "view") {
    return desplazamientoDeVista(
      (nombre) => (this.guion.vars.has(nombre) ? this.guion.vars.get(nombre) : null),
      cual,
    );
  }
}

/**
 * El entorno del jugador. Es el hermano de `entornoDe` de `npcguion.js`, y es
 * más corto a propósito: el jugador no tiene menú de interacción, ni tienda, ni
 * IA. Lo que sí tiene y un NPC no es **a quién se le enseña un consejo**.
 */
/**
 * `GetSubSkillByName` — stats.cpp:69-80. «prof» es alias de la primera; luego
 * `SkillTypeList` (stats.cpp:36-41) y `SpellTypeList` (:43-50), y el índice es
 * la posición EN SU LISTA: `power` y `lightning` son los dos el 2.
 */
export function indiceDeSubestadistica(nombre) {
  const n = String(nombre ?? "").toLowerCase();
  if (n === "prof") return 0;
  const armas = ["proficiency", "balance", "power"].indexOf(n);
  if (armas >= 0) return armas;
  return ["fire", "ice", "lightning", "divination", "affliction"].indexOf(n);
}

function entornoDelJugador({ dueño, consejo, suceso, dar, maximos, usarDisparador, aviso, aguante, fisica, cambio }) {
  const yo = dueño;
  // Las referencias que en el guion del jugador son ÉL. Son las mismas que
  // acepta `llamarExterno` más abajo, más `player`, que es su `jugador.ref`.
  const esYo = (ref) => ["ent_me", "ent_owner", "ent_currentplayer", "player"]
    .includes(String(ref ?? "").toLowerCase());
  const apuntar = (tipo, nombre) => yo.noSoportados.push({ tipo, nombre: String(nombre) });
  return {
    // ── EL 89c: LO QUE CAMBIA EL ESTADO DEL JUGADOR ───────────────────────
    //
    // Cada uno con la regla del motor aquí y el estado inyectado. Lo que no
    // es el jugador —un monstruo, otro jugador— se apunta: no hay a quién
    // dárselo desde este entorno, y un `=> {}` lo escondería.

    /**
     * `drainstamina <ref> <n>`, con `n` ya truncado por el intérprete
     * (`WRITE_LONG` de un `float`, scriptcmds.cpp:2996-2998). La regla es la
     * del CLIENTE, que es quien resta:
     *
     *     player.Stamina -= flAddAmt;
     *     player.Stamina = V_max(player.Stamina, 0);
     *     player.Stamina = V_min(player.Stamina, MaxStamina);
     *                                          clplayer.cpp:131-136
     *
     * En el guion del jugador corre de verdad en `activate_stuff`
     * (`drainstamina ent_me -1000`, player_main.script:147): un segundo
     * después de entrar, el aguante se llena.
     */
    drenarAguante(ref, n) {
      if (!esYo(ref)) { apuntar("drainstamina a otro", ref); return; }
      if (!aguante) { apuntar("drainstamina sin aguante", ref); return; }
      let v = aguante.leer() - n;
      v = Math.max(v, 0);
      v = Math.min(v, aguante.maximo());
      aguante.poner(v);
    },

    /**
     * `gold <n>` y `addgold <n>`: el oro de quien corre el guion.
     *
     *     m_Gold = atoi(Params[0]);                       npcscript.cpp:237
     *     GiveGold(iGoldAmount);                           npcscript.cpp:249
     *
     * `gold` pone a pelo, sin tope: un negativo se queda negativo. `addgold`
     * pasa por `CMSMonster::GiveGold`, que no deja bajar de cero
     * (`V_max(-m_Gold, iAmount)`, msmonstershared.cpp:583-589).
     *
     * Y **SIN MENSAJE**, aunque `CBasePlayer::GiveGold` imprima «You recieve %i
     * gold coins» (player.cpp:5694-5698): `GiveGold` NO es virtual
     * (msmonster.h:423, player.h:575), y la llamada sale de dentro de un
     * método de `CMSMonster`, así que el compilador la ata a la versión de
     * `CMSMonster`. Un mensaje plausible en su sitio es el 65.
     */
    oroPropio(modo, n) {
      const p = yo.personaje;
      if (!p) { apuntar(modo === "poner" ? "gold sin personaje" : "addgold sin personaje", n); return; }
      const actual = Number(p.oro) || 0;
      p.oro = modo === "poner" ? n : actual + Math.max(-actual, n);
      cambio?.("oro");
    },

    /**
     * `removeitem <nombre>` — npcscript.cpp:621-634, con «Thothie - this
     * doesn't work» encima, y se entiende al ver con qué lo llama el guion del
     * jugador: `removeitem PARAM1` con PARAM1 = una ENTIDAD (`EntToString`,
     * player.cpp:5940), y `GetItem` busca por subcadena del NOMBRE —
     * `strstr(ItemName, nombre)`, manos primero y luego dentro de las mochilas
     * (msmonstershared.cpp:196-221)—. Una entidad no es subcadena de ningún
     * nombre: en el motor esa línea no quita nada, y quien quita es el
     * `deleteent` de debajo.
     *
     * Aquí la mochila es una lista plana con las manos apuntando a ella, así
     * que «dentro de las mochilas» es «el resto de la lista». Lo que NO se
     * porta: los objetos PUESTOS (armaduras) que no son mochila no entran en
     * la búsqueda del motor, y aquí no se distinguen.
     */
    quitarObjeto(nombre) {
      const p = yo.personaje;
      if (!p) { apuntar("removeitem sin personaje", nombre); return; }
      const objetos = Array.isArray(p.objetos) ? p.objetos : [];
      const casa = (id) => String(id ?? "").includes(nombre);   // `strstr`
      let quitado = null;
      for (const mano of ["derecha", "izquierda"]) {
        const id = p.manos?.[mano];
        if (id && casa(id)) {
          quitado = objetos.find((o) => (o.uid ?? o.id) === id || o.id === id) ?? null;
          p.manos[mano] = null;
          break;
        }
      }
      if (!quitado) {
        const enMano = new Set(Object.values(p.manos ?? {}).filter(Boolean));
        quitado = objetos.find((o) => !enMano.has(o.uid ?? o.id) && !enMano.has(o.id) && casa(o.id)) ?? null;
      }
      if (!quitado) return;                           // `if (pItem)`: nada
      p.objetos = objetos.filter((o) => o !== quitado);
      cambio?.("objetos");
    },

    /**
     * `setvelocity`/`addvelocity` sobre el jugador — scriptcmds.cpp:7155-7214.
     *
     * La resistencia al empuje y `m_nopush` sólo miran a un MONSTRUO que no
     * sea quien llama (:7184-7200), y el jugador que se empuja a sí mismo es
     * quien llama: sin reducción, con `override` o sin él. Lo único que
     * queda es `if (!pEntity->IsAlive()) abort_push` (:7203).
     */
    velocidad(ref, v, { sumar = false } = {}) {
      if (!esYo(ref)) { apuntar(sumar ? "addvelocity a otro" : "setvelocity a otro", ref); return; }
      if (!fisica) { apuntar("velocidad sin física", ref); return; }
      if (!((Number(yo.personaje?.vida) || 0) > 0)) return;   // `IsAlive`
      fisica.empujar(v, sumar);
    },

    /**
     * `setorigin` sobre el jugador — scriptcmds.cpp:4508-4528:
     * `pev->origin = StringToVec(...)` a pelo. Sin mirar si está vivo, sin
     * trazar y sin tocar la velocidad. El `origin` es el CENTRO de la caja,
     * no los pies; pasarlo a la escena es de quien inyecta `fisica`.
     */
    ponerOrigen(ref, v) {
      if (!esYo(ref)) { apuntar("setorigin a otro", ref); return; }
      if (!fisica) { apuntar("setorigin sin física", ref); return; }
      fisica.colocar(v);
    },

    /**
     * `setstat <est> <valores...>` en un JUGADOR — npcscript.cpp:1324-1355.
     *
     * Dos formas. Sin punto busca la estadística por nombre (`FindStat`, sin
     * mayúsculas, msmonstershared.cpp:505-512) y le pone las subestadísticas
     * EN ORDEN, tantas como valores traiga, con `atoi` y **sin tope**. Con
     * punto —`swordsmanship.power 5`— pone una sola y **con** tope
     * (`V_min(value, STATPROP_MAX_VALUE)`, 100).
     *
     * Los nombres son los `DllName` (stats.cpp:226-240) y el orden de las
     * subestadísticas el de `propiedadesDe`, que es el de `SkillTypeList` y
     * `SpellTypeList`. Los atributos (`Strength`…) también son estadísticas
     * en el motor, pero aquí se derivan y no se guardan: se apunta.
     */
    ponerEstadistica(nombre, valores) {
      const p = yo.personaje;
      if (!p?.habilidades) { apuntar("setstat sin personaje", nombre); return; }
      const n = String(nombre);
      const punto = n.indexOf(".");
      const clave = (punto < 0 ? n : n.slice(0, punto)).toLowerCase();
      const hab = p.habilidades[clave];
      if (!hab) { apuntar("setstat", n); return; }        // «stat %s not found!»
      // El ORDEN es el del motor y no el de las claves del documento, que
      // depende de cómo se guardó.
      const props = propiedadesDe(clave);
      const sub = (k) => (hab[k] ??= { valor: 0, exp: 0 });
      if (punto < 0) {
        for (let i = 0; i < props.length && i < valores.length; i++) {
          sub(props[i]).valor = enteroDe(valores[i]);
        }
      } else {
        const i = indiceDeSubestadistica(n.slice(punto + 1));
        // El motor indexa sin mirar el tamaño (:1349): `parry.power` escribiría
        // fuera. Eso no se porta; se apunta.
        if (i < 0 || i >= props.length) { apuntar("setstat", n); return; }
        sub(props[i]).valor = Math.min(enteroDe(valores[0]), 100);
      }
      cambio?.("habilidades");
    },

    // ── EL 91: LAS BANDERAS Y LAS RESISTENCIAS DEL JUGADOR ────────────────
    /** `scriptflags`/`$get_scriptflag` sobre sí mismo. De otro, se apunta (lo hace el intérprete). */
    banderas(ref) { return esYo(ref) ? yo.banderas : null; },
    /** `$get_takedmg(<él>,<tipo>)` — script.cpp:2569-2592. */
    recibeDano(ref, tipo) {
      if (esYo(ref)) return yo.resistencias.leer(tipo);
      apuntar("$get_takedmg de otro", ref);
      return "-1";
    },
    /**
     * `takedmg <tipo|all> <mult> [adjust]` — npcscript.cpp:1057-1104. Con
     * `all` además deja `MSC_ARMOR_ALL` en su guion (`SetScriptVar` con
     * `_gcvt(…, 10)`, script.cpp:4785-4789: NO MEDIDO el formato exacto de
     * `_gcvt`; aquí, diez cifras significativas sin ceros de cola), y siempre
     * avisa con `game_set_takedmg <tipo> <mult con %f> [adjust]` (:1096-1101).
     */
    ponerRecibeDano(tipo, mult, extra = null) {
      yo.resistencias.poner(tipo, mult);
      const m = Math.fround(mult);
      if (tipo === "all") yo.guion.vars.set("MSC_ARMOR_ALL", String(Number(m.toPrecision(10))));
      yo.llamar("game_set_takedmg", [tipo, m.toFixed(6), ...(extra !== null ? [extra] : [])]);
    },

    jugador: {
      get ref() { return "player"; },
      get personaje() { return yo.personaje; },
      get origen() { return "0 0 0"; },
    },
    npc: { nombre: "you", script: "player/player", origen: "0 0 0" },
    propiedad(_ref, prop) {
      const p = yo.personaje;
      if (!p) return "";
      switch (prop) {
        case "name": return String(p.nombre ?? "");
        case "hp": return String(p.vida ?? 0);
        // El máximo NO se guarda en Master Sword: se deriva de las nueve
        // habilidades cada vez (msmonstershared.cpp:514). `personaje.vidaMax`
        // no lo pone el juego, así que sin `maximos` esto valía lo mismo que la
        // vida y toda guarda «estoy herido» era falsa. Lo encontró el 66.
        case "maxhp": return String(maximos?.().vida ?? p.vidaMax ?? p.vida ?? 0);
        case "mp": return String(p.mana ?? 0);
        case "maxmp": return String(maximos?.().mana ?? p.manaMax ?? p.mana ?? 0);
        case "gold": return String(p.oro ?? 0);
        default: break;
      }
      // `skill.…` (el 66). El guion del jugador también se lee a sí mismo: el
      // valor de parada y la regeneración salen de aquí.
      if (String(prop).startsWith("skill.")) return habilidadDeGuion(p, String(prop));
      return "";
    },
    mensajeAlJugador(_aQuien, texto, cual) {
      const tipo = cual === "gplayermessage" ? "bueno"
        : (cual === "rplayermessage" || cual === "dplayermessage") ? "nopuedes"
          : "normal";
      suceso?.(tipo, texto);
    },
    /**
     * `helptip`. Aquí es donde el consejo deja de ser texto y se convierte en
     * una ventana — y donde se decide que no se enseñe dos veces.
     */
    consejo(params) {
      const r = yo.consejos.mandar(params);
      if (!r) return;                                  // ya lo había visto
      yo.enseñado.push(r.clave);
      // Se apunta en el personaje, que es lo que se guarda: en el original es
      // `m_ViewedHelpTips`, con su bloque propio en el archivo del personaje
      // (sv_character.cpp:322-336 y :682-684).
      if (yo.personaje) yo.personaje.consejosVistos = yo.consejos.vistos;
      consejo?.({ titulo: r.titulo, lineas: r.lineas, clave: r.clave });
      // Y el gancho de vuelta, que el motor llama DESPUÉS de mandarlo y sólo
      // si no era genérico (playershared.cpp:1143-1150).
      if (r.evento) yo.guion.llamar(r.evento.nombre, r.evento.params);
    },
    /** `givehp` / `givemp`: la regeneración pasa por aquí. */
    dar(que, _aQuien, cantidad) { dar?.(que, cantidad); },
    /**
     * `usetrigger <nombre>`: el guion del jugador dispara una entidad del mapa
     * (el 67). Es la única puerta del jugador hacia el `.bsp`.
     *
     * **Y NO ES UN `?.()` CALLADO.** Si el bus no está, se apunta: el 66 dejó
     * escrito que un gancho vacío es donde una regla vive sin correr —
     * `llamarExterno` fue `() => {}` en los dos entornos durante dos
     * experimentos— así que aquí se cuenta en vez de tragarse. Con el bus
     * puesto, `yo.disparados` es lo que una sonda puede leer.
     */
    usarDisparador(nombre) {
      yo.disparados.push(String(nombre));
      if (!usarDisparador) {
        yo.noSoportados.push({ tipo: "usetrigger sin bus", nombre: String(nombre) });
        return;
      }
      usarDisparador(String(nombre));
    },
    /**
     * `callexternal <ref> <evento>` desde el guion del JUGADOR (el 66).
     *
     * Era un no-op, y el jugador se llama a sí mismo por esta puerta más de una
     * vez: `callexternal ent_me <evento>` es cómo un `#include` le habla a otro
     * sin saber si está. Lo que no es él se apunta y no se inventa —el maestro
     * de juego, los demás jugadores, sus mascotas— porque nada de eso existe
     * aquí todavía.
     */
    llamarExterno(ref, nombre, params = []) {
      const r = String(ref ?? "").toLowerCase();
      if (r === "ent_me" || r === "ent_owner" || r === "ent_currentplayer") {
        // `yo.llamar` y no `yo.guion.llamar`: es `CallScriptEvent`, que llega
        // también a los EFECTOS que lleva puestos (script.cpp:5932-5937).
        yo.llamar(String(nombre), params.map(String));
        return;
      }
      yo.noSoportados.push({ tipo: "callexternal", nombre: `${ref} ${nombre}` });
    },
    // `callevent <segundos> <evento>`. HACE FALTA de verdad: el hundimiento de
    // la vista se reprograma a sí mismo cada 0,01 s hasta apagarse, así que con
    // un `programar` vacío el efecto se queda puesto en el primer valor y no
    // vuelve. Era un no-op y la prueba del aterrizaje lo cazó.
    programar: (s, que) => yo.reloj.programar(s, que),
    // ── `infomsg`, que SÍ tiene: el 89 ────────────────────────────────────
    //
    // `infomsg <ent_me|all> <título> <texto>` es `SendHUDMsg` (scriptcmds.cpp:4058)
    // y va a la ventana de arriba a la izquierda. El intérprete lo manda a
    // `aviso`, y aquí no había: caía en el `aviso: () => {}` de `entornoVacio`,
    // y al lado un `ventanaDeAviso: () => {}` bajo el letrero de «lo que el
    // jugador no tiene». **Catorce `infomsg` del guion del jugador no salían
    // nunca**, entre ellos el «Travel to next area (…)» / «This leads to …» de
    // la transición, que es lo que el usuario enseñó en sus dos capturas del
    // juego original. Es el `=> {}` del 66 y del 81 otra vez: un gancho vacío
    // donde una regla vive sin correr.
    //
    // `ent_me` y `all` llegan los dos a esta pantalla: aquí sólo hay un jugador
    // mirándola. La presentación del mapa NO viene por aquí —la pinta
    // `src/play/intro.js`, que lee `mapa.json`—, y que no salga dos veces lo
    // vigila `sondas/transicion89.mjs`.
    aviso: (_quien, titulo, texto) => aviso?.(String(titulo ?? ""), String(texto ?? "")),
    // Lo que el jugador no tiene. Se dejan vacíos en vez de omitirlos para que
    // el intérprete no tenga que preguntar si existen.
    anadirOpcion: () => {}, quitarOpcion: () => {}, abrirMenu: () => {},
    escuchar: () => {}, animar: () => {}, ventanaDeAviso: () => {},
    apuntar: (tipo, nombre) => yo.noSoportados.push({ tipo, nombre }),
  };
}
