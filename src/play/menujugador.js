// LO QUE HACEN LAS OPCIONES DEL MENÚ DEL PROPIO JUGADOR — el 85.
//
// Lo reportó el usuario: con la F abres el menú, pulsas «Sit Down (Rest)» y
// sale «That is not implemented yet». Y no sólo ésa: **las seis**. En el
// original sentarse pone una animación y te sube la vida poco a poco.
//
// ── EL FALLO ERA UNA COSTURA, Y ESTÁ EN LA TABLA DEL APARTADO 4 ─────────────
//
// `InteraccionesNpc.pedir` SÍ tenía su rama para el jugador desde el 60:
//
//     if (!quien) return { nombre: "You", opciones: opcionesDelJugador(...) };
//                                            src/juego/interacciones.js:371
//
// y `elegido`, tres líneas más abajo, **no la tiene**. Con `id === null` no hay
// NPC, `guionDe(null)` da `null`, y las seis opciones caen en el cajón de «este
// NPC no tiene guion portado». O sea: una mitad sabe qué ofrecer, la otra no
// sabe qué hacer con lo ofrecido, y las dos están verdes. El 63 otra vez.
//
// ── Y DEBAJO HABÍA UN HUECO DE VERDAD ──────────────────────────────────────
//
// Cerrar la costura no basta, porque **lo que hacen las opciones no estaba
// escrito en ningún sitio**. Los cuatro `callback` del menú son efectos, que
// son entidades con guion propio, y sus cuatro archivos NO se cargan:
//
//     player/emote_sit&stand.script      Sit Down (Rest) / Stand Up
//     player/emote_yes.script            Emote: Nod Yes
//     player/emote_no.script             Emote: Nod No
//     player/emote_idle.script           Emote: Stand At Attention
//
// `npm run jugador` carga 27 archivos y ninguno es de éstos: cuelgan de
// `#include effects/base_effect`, que es el sistema de efectos, y eso no está
// portado. Así que esto es un puerto **a mano** de los cuatro, con la cita de
// cada regla al lado — y la lista de lo que el sistema de efectos se lleva por
// delante está en `doc/EMOCIONES_84.md`.
//
// Que vaya a mano y no por el intérprete NO es la segunda fuente del 82: no hay
// primera. El día que haya efectos, esto se borra y se carga el guion.
//
// ── CÓMO LLEGA LA ORDEN, que es lo que explica los nombres ─────────────────
//
//     { plr_menu_emote
//         local CMD_STRING "action "
//         stradd CMD_STRING PARAM2
//         clientcmd ent_me CMD_STRING }       player_sv_menu.script:182-187
//
// El `data` de la opción —`player_sitstand`, `player_nodyes`…— es el `EFFECT_ID`
// del efecto, y lo que el menú manda es `action <EFFECT_ID>`. El efecto contesta
// en su `game_player_activate`. Por eso aquí se despacha por ese identificador y
// no por el índice del botón: el índice cambia con el menú (sentado son tres
// opciones y de pie son seis) y el identificador no.

/** Qué `scriptvar` hace que el guion te escriba los números. Ver `MENSAJES`. */
export const SHOW_HEALTH = "SHOW_HEALTH";

/**
 * Los cuatro efectos del menú, con la animación que pone cada uno.
 *
 * `modo` es el primer parámetro de `playanim` (npcscript.cpp:1512-1519):
 * `once` es MONSTER_ANIM_ONCE —se reproduce y vuelve al reposo— y `hold` es
 * MONSTER_ANIM_HOLD, que se queda en la postura hasta que algo la rompa.
 *
 * `alterna` es la diferencia entre los tres emotes, y **no es simetría mía**:
 * los tres tienen el mismo `if ( !local.idling ) … else callevent idle_stop`,
 * y sólo `emote_idle` pone `local.idling 1`. Los otros dos ponen
 * `local.noding`, que **nadie lee**, así que su rama `else` está muerta y
 * volver a pulsar «Nod Yes» no la cancela: la repite. Va portado con el fallo
 * —apartado 3 de CLAUDE.md— y hay una prueba que lo fija.
 */
export const EFECTOS = Object.freeze({
  player_sitstand: Object.freeze({
    titulo: "Sit Down (Rest)", anim: "sitdown", modo: "hold",
    cita: "player/emote_sit&stand.script:43-78",
  }),
  player_nodyes: Object.freeze({
    titulo: "Emote: Nod Yes", anim: "nod_yes", modo: "once", alterna: false,
    cita: "player/emote_yes.script:20-29",
  }),
  player_nodno: Object.freeze({
    titulo: "Emote: Nod No", anim: "nod_no", modo: "once", alterna: false,
    cita: "player/emote_no.script:20-29",
  }),
  player_standidle: Object.freeze({
    titulo: "Emote: Stand At Attention", anim: "attention", modo: "hold", alterna: true,
    cita: "player/emote_idle.script:20-31",
  }),
});

/**
 * Los números de sentarse, **escritos a mano y con su línea**, que es lo que
 * manda el 75 cuando el número ES la regla.
 *
 * `emote_sit&stand.script`, y la cabecera del propio archivo explica dos de
 * ellos: «*Thothie - Raising sit mana regen to 5, and sit health regen to 3
 * (total) due to mass complaints*». Los totales que dice son los de la PRIMERA
 * vuelta: 1 de base + 2 de vida, 1 + 4 de maná. Ver `cicloDeDescanso`.
 */
export const DESCANSO = Object.freeze({
  /** `repeatdelay 5`. El ciclo entero, no el paso del juego. `:81`. */
  CICLO: 5,
  /** `setvard REGEN_RATE 0.05` / `multiply REGEN_RATE MAX_HEALTH`. `:94-95`. */
  VIDA_PROPORCION: 0.05,
  /** `if ( REGEN_INT < 2 ) setvard REGEN_INT 2`. `:97`. */
  VIDA_MINIMO: 2,
  /** `setvard MANA_RATE 0.20`. `:114-115`. */
  MANA_PROPORCION: 0.20,
  /** `if ( MANA_INT < 4 ) setvard MANA_INT 4`. `:117`. */
  MANA_MINIMO: 4,
  /** `drainstamina ent_me -1000`: en negativo **devuelve** aguante. `:100`. */
  AGUANTE: 1000,
  /** `setvard STRUCK_TIME 5` en `game_struck`. `:141`. */
  GOLPE: 5,
  /** `const VIEW_LOWERHEIGHT -28`, en unidades del motor. `:171`. */
  VISTA: -28,
  /** `const VIEW_LOWERTIME 1` y `VIEW_RAISETIME 1`. `:26-27`. */
  VISTA_SEGUNDOS: 1,
});

/** Lo que el guion te quita al sentarte. `setvard game.effect.can* 0`, `:58-62`. */
export const CANDADOS = Object.freeze(["mover", "atacar", "correr", "saltar", "agacharse"]);

/**
 * Cuánta vida da una vuelta del ciclo, y **el acumulador es el de verdad**.
 *
 *     add regen.hp.amt REGEN_INT
 *     givehp ent_me regen.hp.amt          emote_sit&stand.script:98-99
 *
 * `add` SUMA sobre lo que ya había, y lo que se da es el acumulado, no el
 * incremento. Nadie lo reinicia mientras sigas sentado —de pie sí, `:109` lo
 * pone a 1 cada vuelta— así que descansar **acelera**: con 100 de vida máxima
 * las vueltas dan 6, 11, 16, 21… Eso es exactamente el «poco a poco» del
 * reporte, y comprobado contra los scripts no es una variable del motor: la
 * cadena `regen.hp.amt` sólo aparece en este archivo.
 *
 * @param acumulado  lo que vale `regen.hp.amt` al entrar.
 * @param maximo     `$get(ent_me,maxhp)`.
 * @returns          `{ acumulado, da }` — lo nuevo y lo que se regala.
 */
export function vueltaDeVida(acumulado, maximo) {
  const paso = Math.max(Math.trunc(DESCANSO.VIDA_PROPORCION * Number(maximo || 0)), DESCANSO.VIDA_MINIMO);
  const nuevo = Number(acumulado || 0) + paso;
  return { acumulado: nuevo, da: nuevo };
}

/** La misma cuenta para el maná. `:113-119`. El mínimo es 4 y la parte, 0,20. */
export function vueltaDeMana(acumulado, maximo) {
  const paso = Math.max(Math.trunc(DESCANSO.MANA_PROPORCION * Number(maximo || 0)), DESCANSO.MANA_MINIMO);
  const nuevo = Number(acumulado || 0) + paso;
  return { acumulado: nuevo, da: nuevo };
}

/**
 * ¿TOCA REGENERAR ESTA VUELTA? El contador de golpes, con su aritmética.
 *
 *     if ( STRUCK_TIME > 0 ) subtract STRUCK_TIME 1
 *     if ( STRUCK_TIME equals 'STRUCK_TIME' ) setvard STRUCK_TIME 1
 *     if ( STRUCK_TIME <= 1 ) { …                emote_sit&stand.script:83-87
 *
 * Dos cosas que hay que decir, porque ninguna se deduce leyendo rápido:
 *
 * 1. **La línea del medio está muerta**, y es el hallazgo del 82 aplicado aquí:
 *    las comillas simples no agrupan en este motor, `GetConst` devuelve el
 *    texto CON comillas (script.cpp:350-354) y una variable sin poner devuelve
 *    su nombre SIN ellas (script.cpp:4741). Así que `STRUCK_TIME` nunca es
 *    igual a `'STRUCK_TIME'` y ese `setvard` no corre jamás. No cambia nada,
 *    porque `atof("STRUCK_TIME")` es 0 y 0 ya pasa el `<= 1`.
 *
 * 2. **El comentario del mod dice cinco ciclos y la cuenta da tres.** `:141`
 *    pone «*Do not allow heal 5 cycles after being struck*» y vale 5; pero el
 *    `subtract` va ANTES del `<= 1`, así que las vueltas son 5→4, 4→3, 3→2 (las
 *    tres sin curar) y 2→1, que ya cura. Son **15 segundos de castigo y la cura
 *    vuelve a los 20**, no 25. Se porta la aritmética, no el comentario.
 *
 * @returns `{ golpe, regenera }`.
 */
export function cicloDeDescanso(golpe) {
  let g = Number(golpe || 0);
  if (g > 0) g -= 1;
  return { golpe: g, regenera: g <= 1 };
}

/**
 * CUÁNTO BAJA LA VISTA al sentarse, que es lo único que se ve en primera
 * persona mientras no haya nadie mirándote.
 *
 *     local L_RATIO L_TIMEDELTA / VIEW_LOWERTIME ; capvar L_RATIO 0 1
 *     local L_HEIGHTOFS L_RATIO                      (al bajar)
 *     setvard L_HEIGHTOFS 1 ; decvar L_HEIGHTOFS L_RATIO   (al subir)
 *     multiply L_HEIGHTOFS VIEW_LOWERHEIGHT      emote_sit&stand.script:178-197
 *
 * O sea una rampa lineal de un segundo, y al levantarse **la misma rampa del
 * revés**: no se corta, se deshace. Devuelve unidades del motor (negativas).
 *
 * @param t         segundos desde que se pidió el cambio.
 * @param bajando   `VIEW_DIRECTION`: `true` al sentarse, `false` al levantarse.
 */
export function vistaDeDescanso(t, bajando) {
  const r = Math.min(Math.max(Number(t || 0) / DESCANSO.VISTA_SEGUNDOS, 0), 1);
  const z = (bajando ? r : 1 - r) * DESCANSO.VISTA;
  // `0 * -28` es **`-0`**, y de ahí salieron cuatro rojos la primera pasada. No
  // cambia nada al sumarlo a una vista, pero `Object.is(-0, 0)` es `false` y
  // `JSON.stringify` lo escribe «0», así que es de los que se esconden: el 81 ya
  // perdió una rama entera por el `-0` de un `atan2`. El `|| 0` lo colapsa
  // porque `-0` es falsy, que es lo más corto que hay sin mentir sobre el signo.
  return z || 0;
}

/**
 * LOS DOS MENSAJES, y por qué por omisión no sale ninguno.
 *
 *     local SHOWIT_ON $get(ent_me,scriptvar,SHOW_HEALTH)
 *     if SHOWIT_ON                               emote_sit&stand.script:102-103
 *
 * Ése es un `if` VIEJO —sin paréntesis— y uno de ésos no se salta una línea:
 * corta el bloque en el que está (`break` sobre su `Cmdlist`,
 * script.cpp:5754-5758). Hay dos, uno en el bloque de la vida y otro en el del
 * maná, y **lo que se llevan es sólo el final de su bloque**: el `givehp`, el
 * `givemp` y el `drainstamina` van delante y corren siempre. Lo que queda
 * detrás del segundo es `FULL_ALERT` y los dos `gplayermessage`.
 *
 * Y `SHOW_HEALTH` no lo pone nadie al arrancar: sólo lo mueve el comando
 * `showhealth` (player_main.script:392-396). Así que **en una partida recién
 * empezada descansar cura en silencio**, y los números salen si lo enciendes.
 *
 * Hubo que medir CUÁL de los dos bloques se corta, porque de eso dependía si
 * sentarse da maná: si un `if` viejo abandonara el evento entero, el bloque del
 * maná —que es hermano, no hijo— no correría nunca. Abandona sólo su
 * `Cmdlist`, así que sí lo da. La cabecera del mod lo confirma: subieron el
 * maná de sentarse «*due to mass complaints*», que es algo que nadie escribe de
 * una regla que no corre.
 */
export const MENSAJES = Object.freeze({
  /** `gplayermessage ent_me You are fully rested.` `:132`. */
  LLENO: "You are fully rested.",
  /**
   * `:133`. Los paréntesis son del texto del mod, no agrupan nada — y «MAX»
   * sustituye al número cuando ese recurso está al tope (`:128-129`).
   */
  descansando(vida, vidaMax, mana, manaMax) {
    const n = (v, max) => (Number(v) >= Number(max) ? "MAX" : String(Math.trunc(Number(v || 0))));
    return `Resting... HP: ( ${n(vida, vidaMax)} / ${Math.trunc(Number(vidaMax || 0))} ) ` +
      `MANA: ( ${n(mana, manaMax)} / ${Math.trunc(Number(manaMax || 0))} )`;
  },
});

/** `dplayermessage ent_me "Can't use this emote while unable to attack."` `:49`. */
export const NO_PUEDES = "Can't use this emote while unable to attack.";

/**
 * LA DESCRIPCIÓN DEL OBJETO EN LA MANO — el tipo `itemdesc`, `MOT_DESC`.
 *
 * Es la única opción del menú que **no pasa por el servidor**: el cliente la
 * resuelve él y le manda al servidor un «cancelar».
 *
 *     if (MenuOption.Type == MOT_DESC) {
 *         ShowWeaponDesc(player.ActiveItem());
 *         ServerCmd("menuoption " + m_EntIdx + " " + -1);
 *         SendCmd = false; }            vgui_menu_interact.h:183-188
 *
 * Y el texto, con su caso vacío y su cantidad:
 *
 *     if (!pItem->DisplayDesc.len()) strncpy(cDescString, "No Description", …);
 *     else { if (ITEM_GROUPABLE && iQuantity > 1) snprintf(amt, " (%i)", iQuantity);
 *            snprintf(cDescString, "%s%s", pItem->DisplayDesc.c_str(), amt); }
 *                                            clplayer.cpp:707-724
 *
 * **Sin nada en la mano no sale nada**: `if (!pItem) return;` es la primera
 * línea. Eso no es un hueco nuestro, así que se devuelve `null` y no un texto
 * de relleno, que es lo que haría parecer que funciona.
 *
 * 720 de los 760 objetos del catálogo traen `descripcion`, así que los otros 40
 * son el caso de «No Description» de verdad y no una ausencia nuestra.
 *
 * @param objeto  lo que lleva en la mano: `{descripcion, apilable, cantidad}`.
 */
export function descripcionDeObjeto(objeto) {
  if (!objeto) return null;
  const texto = String(objeto.descripcion ?? "");
  if (!texto.length) return "No Description";
  const n = Number(objeto.cantidad ?? 0);
  // `ITEM_GROUPABLE && iQuantity > 1`: el catálogo lo llama `apilable`.
  return objeto.apilable && n > 1 ? `${texto} (${n})` : texto;
}

/**
 * «Forgive Last PK» — `MOT_FORGIVE`, que manda `ServerCmd("forgive")`
 * (vgui_menu_interact.h:189-193).
 *
 * El comando entero está en `multiplay_gamerules.cpp:1590-1614` y tiene DOS
 * ramas. La de arriba necesita `m_LastPlayerToKillMe > 0`, o sea que te haya
 * matado otro jugador, y esa parte **no se puede portar hoy**: aquí no se
 * apunta quién te mató porque el combate entre jugadores no está.
 *
 * Pero la de abajo sí, y es la que corre en una partida de un jugador:
 *
 *     else pPlayer->SendInfoMsg( "Forgive: Use this command to remove your
 *                                 accidental death from the killer's record\n" );
 *
 * Así que esto **no es un «no implementado»**: es literalmente lo que contesta
 * el original cuando nadie te ha matado, y va a la consola de sucesos porque
 * `SendInfoMsg` es la consola (ver `src/play/aviso.js`). La otra rama se declara
 * pendiente en el documento en vez de inventarse.
 *
 * @param quienMeMato  el jugador que te mató, para el día que exista.
 */
export function perdonar(quienMeMato = null) {
  if (!quienMeMato) {
    return {
      hecho: false,
      texto: "Forgive: Use this command to remove your accidental death from the killer's record",
    };
  }
  // No se finge la rama de arriba: hace falta bajarle el contador de muertes al
  // otro jugador, y ese contador no existe en este puerto.
  return { hecho: false, pendiente: "no hay registro de quién te mató: multiplay_gamerules.cpp:1592-1610" };
}

/**
 * EL ESTADO DE LAS EMOCIONES DEL JUGADOR.
 *
 * Vive en `src/play/` y no toca ni el DOM ni Three a propósito: lo que sale de
 * aquí son números y textos, y quien dibuja los lee. Las animaciones también
 * salen por aquí —`animacion()`— en vez de llamar al visor, que es lo que
 * permite probar «se pidió `sitdown` en modo `hold`» sin montar un esqueleto.
 *
 * @param dar         `(que, cuanto) => void`, el `givehp`/`givemp` del jugador.
 * @param aguante     `(cuanto) => void`, el `drainstamina` en positivo.
 * @param suceso      `(tipo, texto) => void`, la consola.
 * @param vitales     `() => {vida, vidaMax, mana, manaMax}`.
 * @param puedeAtacar `() => boolean`, el `$get(ent_me,canattack)` de la guarda.
 * @param mostrarVida `() => boolean`, el `SHOW_HEALTH` del jugador.
 */
export class Emociones {
  constructor({
    dar = null, aguante = null, suceso = null, vitales = null,
    puedeAtacar = () => true, mostrarVida = () => false,
  } = {}) {
    this._dar = dar;
    this._aguante = aguante;
    this._suceso = suceso;
    this._vitales = vitales;
    this._puedeAtacar = puedeAtacar;
    this._mostrarVida = mostrarVida;

    /** `AM_SITTING`. */
    this.sentado = false;
    /** El `EFFECT_ID` del emote puesto, o `null`. Sentarse NO es un emote. */
    this.emocion = null;
    /** `regen.hp.amt` y `regen.mp.amt`. Empiezan donde los deja estar de pie. */
    this.vidaAcumulada = 1;
    this.manaAcumulada = 1;
    /** `STRUCK_TIME`. Sin poner, que es lo que vale en el guion al nacer. */
    this.golpe = 0;
    /** `FULL_ALERT`. */
    this.lleno = 0;
    /**
     * Lo que queda del `repeatdelay 5`, y **arranca a cinco y no a cero.**
     *
     * El 64 dejó escrito que la regeneración del jugador llega «en el acto»
     * porque su `repeatdelay FINAL_REGEN_RATE_HP` es una variable que al cargar
     * todavía no existe y `atof` de eso da 0 (`armarRepeticiones`,
     * src/play/guion.js:946-958). Aquí el `repeatdelay 5` es **un literal**, así
     * que se arma a cinco y la primera vuelta llega a los cinco segundos.
     *
     * Y el reloj corre desde que el efecto nace, no desde que te sientas: por
     * eso sentarse no cura al instante, sino en la siguiente vuelta del ciclo
     * que ya estaba girando — de media, dos segundos y medio.
     */
    this._resto = DESCANSO.CICLO;
    /** Lo que queda para soltar el cuerpo al levantarse. `null` si no toca. */
    this._libera = null;
    /** La rampa de la vista: desde cuándo y hacia dónde. */
    this._vista = { t: DESCANSO.VISTA_SEGUNDOS, bajando: false };
    /** Lo último que se pidió al visor, para que quien dibuje no adivine. */
    this._anim = null;
    /** Para medir: cada vuelta del ciclo que ha dado algo. */
    this.vueltas = [];
  }

  /**
   * `action <EFFECT_ID>`, que es lo que manda `plr_menu_emote`.
   *
   * Devuelve qué pasó, para que la costura de `interacciones.js` no tenga que
   * suponerlo y para que una prueba pueda leerlo.
   */
  activar(id) {
    const efecto = EFECTOS[String(id ?? "")];
    if (!efecto) return { hecho: false, porque: `no hay efecto «${id}»` };
    if (id === "player_sitstand") return this._sentarse();
    return this._emocionar(id, efecto);
  }

  /** `game_player_activate` de `emote_sit&stand`. `:43-78`. */
  _sentarse() {
    if (this.sentado) {
      // La rama de levantarse: la vista sube YA y el cuerpo se libera cuando la
      // rampa acaba (`callevent VIEW_RAISETIME player_sit_freedom`, `:75`), que
      // es por lo que te levantas y tardas un segundo en poder andar.
      this.sentado = false;
      this._vista = { t: 0, bajando: false };
      this._libera = DESCANSO.VISTA_SEGUNDOS;
      return { hecho: true, sentado: false };
    }
    // La guarda, que es lo PRIMERO del evento y se come el resto si falla.
    if (!this._puedeAtacar()) {
      this._suceso?.("nopuedes", NO_PUEDES);
      return { hecho: false, porque: "canattack" };
    }
    // `callexternal ent_me emote_stop`: sentarse cancela el emote que hubiera.
    this.emocion = null;
    this.sentado = true;
    this._vista = { t: 0, bajando: true };
    this._libera = null;
    this._anim = { nombre: EFECTOS.player_sitstand.anim, modo: EFECTOS.player_sitstand.modo };
    return { hecho: true, sentado: true };
  }

  /** Los tres emotes. El `alterna` es la asimetría del mod: ver `EFECTOS`. */
  _emocionar(id, efecto) {
    if (efecto.alterna && this.emocion === id) {
      // `else callevent idle_stop` -> `playanim break`.
      this.emocion = null;
      this._anim = { nombre: "break", modo: "break" };
      return { hecho: true, emocion: null };
    }
    // Sentado no hay emotes que pulsar: el menú no los ofrece (`:32-52`), y por
    // eso esto no necesita guarda. Si alguien los manda a mano, el guion haría
    // lo mismo que aquí, porque su `game_player_activate` no mira `AM_SITTING`.
    this.emocion = id;
    this._anim = { nombre: efecto.anim, modo: efecto.modo };
    return { hecho: true, emocion: id };
  }

  /**
   * `game_struck`: te han pegado. `:139-143`.
   *
   * Pone el castigo y **reinicia sólo el acumulador de la vida**. El del maná no
   * se toca, así que después de un golpe la vida vuelve a empezar su rampa y el
   * maná sigue donde iba. Es asimétrico en el mod y va así.
   */
  golpeado() {
    this.golpe = DESCANSO.GOLPE;
    this.vidaAcumulada = 0;
  }

  /**
   * `game_animate`: el emote se cancela **en cuanto el jugador se mueve**.
   *
   *     if local.noding
   *     if game.player.speed
   *     callevent idle_stop            emote_yes.script:37-43
   *
   * Sentarse no: el guion de sentarse no tiene `game_animate`, y además te
   * quita el `canmove`, así que no hay velocidad que mirar.
   *
   * @param velocidad  `game.player.speed`.
   */
  seMueve(velocidad) {
    if (!this.emocion) return false;
    if (!(Number(velocidad || 0) > 0)) return false;
    this.emocion = null;
    this._anim = { nombre: "break", modo: "break" };
    return true;
  }

  /** `game_death`: `clientevent update … view_change 0`. `:160-164`. */
  muere() {
    if (!this.sentado) return;
    this.sentado = false;
    this._vista = { t: DESCANSO.VISTA_SEGUNDOS, bajando: false };
    this._libera = null;
  }

  /**
   * `player.IsActing()`: ¿está el jugador haciendo una acción?
   *
   * Los cuatro efectos del menú llevan `const EFFECT_FLAGS player_action`, que es
   * lo que pone esa bandera. Sirve para **una** cosa medida: la regeneración de
   * aguante se salta mientras actúas (`fatigue.cpp:77-79`), y por eso el guion de
   * sentarse rellena el aguante a mano cada vuelta.
   *
   * Asentir también cuenta, y eso es fiel: la bandera es de los cuatro.
   */
  actuando() { return this.sentado || this.emocion !== null; }

  /** Los cinco candados de `:58-62`, en la forma en que los pregunta el bucle. */
  puede(que) {
    if (!this.sentado) return true;
    return !CANDADOS.includes(String(que));
  }

  /** El desplazamiento de la vista, en unidades del motor. Negativo o cero. */
  vistaZ() { return vistaDeDescanso(this._vista.t, this._vista.bajando); }

  /**
   * LA POSTURA QUE SE SOSTIENE, o `null` si el cuerpo manda.
   *
   * Es la diferencia entre los dos modos de `playanim`, y hace falta porque el
   * bucle de dibujo le pone al muñeco una animación **cada fotograma**: sin
   * saber cuál se sostiene, la postura de sentarse duraría un fotograma. Eso es
   * el fallo que el 80 encontró en el ataque de los bichos, en otra pieza.
   *
   * `hold` es MONSTER_ANIM_HOLD y se queda; `once` es MONSTER_ANIM_ONCE y vuelve
   * al reposo sola (npcscript.cpp:1515-1517), así que un asentimiento **no**
   * sostiene nada: el efecto sigue puesto —por eso moverse todavía lo cancela—
   * pero la postura ya no es suya.
   */
  postura() {
    if (this.sentado) return EFECTOS.player_sitstand.anim;
    const e = EFECTOS[String(this.emocion ?? "")];
    if (e && e.modo === "hold") return e.anim;
    return null;
  }

  /**
   * Lo que hay que ponerle al muñeco, o `null` si no se ha pedido nada nuevo.
   * Se consume al leerlo: `playanim` es una orden, no un estado.
   */
  animacion() {
    const a = this._anim;
    this._anim = null;
    return a;
  }

  /** El paso del reloj: la rampa de la vista y el ciclo de los cinco segundos. */
  paso(dt = 0) {
    const d = Number(dt || 0);
    this._vista.t = Math.min(this._vista.t + d, DESCANSO.VISTA_SEGUNDOS);
    // `callevent VIEW_RAISETIME player_sit_freedom`: el cuerpo se suelta cuando
    // la vista ha acabado de subir, no al pulsar.
    if (this._libera !== null && this._libera !== undefined) {
      this._libera -= d;
      if (this._libera <= 0) {
        this._libera = null;
        this._anim = { nombre: "break", modo: "break" };
      }
    }
    this._resto -= d;
    let vueltas = 0;
    // Un `while` y no un `if`: con un paso grande —una pestaña en segundo plano—
    // el motor habría dado varias vueltas, y comerse las de más sería regalar
    // tiempo de descanso. Es lo mismo que hace `pasoDeRepeticiones`.
    while (this._resto <= 0) {
      this._resto += DESCANSO.CICLO;
      this._vuelta();
      vueltas++;
      if (vueltas > 64) break;      // un paso absurdo no cuelga el fotograma
    }
    return vueltas;
  }

  /** Una vuelta del `repeatdelay 5`. El orden es el del archivo. */
  _vuelta() {
    const c = cicloDeDescanso(this.golpe);
    this.golpe = c.golpe;
    if (!c.regenera) return;

    if (!this.sentado) {
      // Las dos ramas `else` del guion: de pie los acumuladores valen 1, y no
      // se da nada. La regeneración de andar es OTRA, la de
      // `player_sv_regen.script`, que ya corre por el intérprete desde el 64.
      this.vidaAcumulada = 1;
      this.manaAcumulada = 1;
      return;
    }

    const v = this._vitales?.() ?? {};
    const vida = vueltaDeVida(this.vidaAcumulada, v.vidaMax);
    this.vidaAcumulada = vida.acumulado;
    this._dar?.("vida", vida.da);
    this._aguante?.(DESCANSO.AGUANTE);

    const mana = vueltaDeMana(this.manaAcumulada, v.manaMax);
    this.manaAcumulada = mana.acumulado;
    this._dar?.("mana", mana.da);

    this.vueltas.push({ vida: vida.da, mana: mana.da });

    // Y los mensajes, que son los que el `if` viejo se lleva si `SHOW_HEALTH`
    // está apagado — o sea casi siempre. Ver `MENSAJES`.
    if (!this._mostrarVida?.()) return;
    const d = this._vitales?.() ?? {};
    this.lleno += 1;
    if (Number(d.mana) < Number(d.manaMax)) this.lleno = 0;
    if (Number(d.vida) < Number(d.vidaMax)) this.lleno = 0;
    if (this.lleno === 1) this._suceso?.("bueno", MENSAJES.LLENO);
    if (this.lleno === 0) {
      this._suceso?.("bueno", MENSAJES.descansando(d.vida, d.vidaMax, d.mana, d.manaMax));
    }
  }
}
