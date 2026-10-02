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

import { Guion, entornoVacio } from "./guion.js";
import { Consejos } from "./consejos.js";
import { RelojDeGuiones } from "./npcguion.js";
import { desplazamientoDeVista } from "./efectosdeguion.js";
import { habilidadDeGuion } from "./habilidad.js";

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
  game_transition_entered: "no hay transiciones entre mapas: se cambia de mapa por el menú, no pisando un `ms_trigger`",
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
      // SOBRE `entornoVacio()`, no en vez de él. El intérprete pide ganchos
      // que el jugador no usa —el azar, las listas, el mundo— y si falta uno
      // no da un hueco: **revienta el evento entero a medias**, así que el
      // consejo de después no llega. Pasó con `azarFlotante`.
      entorno: { ...entornoVacio(), ...entornoDelJugador({ dueño, consejo, suceso, dar, maximos, usarDisparador }) },
    });
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
    return this.guion.llamar(String(nombre), params.map((p) => String(p)));
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

  /** El paso del reloj: los eventos con `repeatdelay`. */
  paso(dt = 0) {
    // Los dos relojes, y son distintos: `repeatdelay` se mide contra el reloj
    // del juego y `callevent <segundos>` contra lo que ha pasado desde el paso
    // anterior. Se mueven los dos aquí para que quien llama no tenga que saberlo.
    const a = this.guion.pasoDeRepeticiones(this._ahora());
    const b = this.reloj.paso(dt);
    return a + b;
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
function entornoDelJugador({ dueño, consejo, suceso, dar, maximos, usarDisparador }) {
  const yo = dueño;
  return {
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
        yo.guion.llamar(String(nombre), params.map(String));
        return;
      }
      yo.noSoportados.push({ tipo: "callexternal", nombre: `${ref} ${nombre}` });
    },
    // `callevent <segundos> <evento>`. HACE FALTA de verdad: el hundimiento de
    // la vista se reprograma a sí mismo cada 0,01 s hasta apagarse, así que con
    // un `programar` vacío el efecto se queda puesto en el primer valor y no
    // vuelve. Era un no-op y la prueba del aterrizaje lo cazó.
    programar: (s, que) => yo.reloj.programar(s, que),
    // Lo que el jugador no tiene. Se dejan vacíos en vez de omitirlos para que
    // el intérprete no tenga que preguntar si existen.
    anadirOpcion: () => {}, quitarOpcion: () => {}, abrirMenu: () => {},
    escuchar: () => {}, animar: () => {}, ventanaDeAviso: () => {},
    apuntar: (tipo, nombre) => yo.noSoportados.push({ tipo, nombre }),
  };
}
