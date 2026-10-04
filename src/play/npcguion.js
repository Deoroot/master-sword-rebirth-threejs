// EL GUION DE UN NPC, ENCHUFADO AL JUEGO.
//
// `src/play/guion.js` es la máquina y no sabe nada de este juego: no importa
// nada, no toca el DOM y no conoce al jugador. Aquí se le da un mundo.
//
// Y con eso, lo que el experimento 29 dejó a medias se cierra: las opciones del
// menú de un NPC **dejan de leerse de una ficha horneada y pasan a salir de
// ejecutar su `game_menu_getoptions` de verdad**, que es lo que hace el
// servidor (`CallScriptEvent("game_menu_getoptions", &Params)`,
// msmonsterserver.cpp:2890). Elegir una llama a `usarOpcion`, que es
// `CMSMonster::UseMenuOption`.
//
// ── Por qué esto es MEJOR que la ficha, y no sólo distinto ────────────────
//
// `tools/menus.mjs` leía los bloques con expresiones regulares y tenía que
// adivinar las condiciones. Ejecutar el script no adivina nada, y al hacerlo
// salieron **tres cosas que la ficha decía mal**:
//
//   1. **Faltaban las opciones de `base_chat`.** El lector no seguía los
//      `#include`, y `RunScriptEventByName` ejecuta **todos** los eventos con
//      ese nombre (script.cpp:5836). El alcalde no ofrece cuatro opciones:
//      ofrece siete, y las tres primeras —«Hail», «Ask about Jobs», «Ask about
//      Rumors»— son de la plantilla.
//   2. **El `if` sin llaves estaba leído al revés.** Ver la cabecera de
//      `guion.js`: el `if` sin paréntesis es el VIEJO y **abandona el bloque**,
//      no «guarda sólo la línea siguiente». Con la regla buena, «Give Goblin's
//      Head» **no aparece si no llevas la cabeza**, y el caso del armero no
//      duplica ningún título.
//   3. **Las condiciones que la ficha marcaba «no decidibles»** —`A < B`,
//      `$get(...)`— se deciden solas al ejecutarlas.
//
// La ficha (`build/gatecity/menus.json`) se queda como respaldo: un NPC cuyo
// guion no esté horneado sigue enseñando su menú, apagado y con el motivo.

import { Guion, GLOBALES, PROPIEDADES, numDe, enteroDe, textoDeVector, repeticionDe } from "./guion.js";
import { leerMision, ponerMision, limpiarMisiones, volcarMisiones } from "./misiones.js";
import { usarOpcion, nombreVisibleDe } from "./usaropcion.js";
import { oirFrase, limpiarTexto } from "./oir.js";
import { Tiendas, flagsDe } from "./tienda.js";
import { RANGO_LOCAL } from "./chat.js";
// EL 92: `$get(<jugador>,maxhp)` es `CBasePlayer::MaxHP()`, que es esto.
import { derivadas, atributosDe } from "../juego/stats.js";

/**
 * EL RELOJ DE LOS EVENTOS CON RETARDO.
 *
 *     if (Delay) { SCRIPT_EVENT *seEvent = EventByName(EventName);
 *                  if (seEvent) CallEventTimed(EventName, Delay); }
 *                                          scriptcmds.cpp:2278-2285
 *
 * Media conversación de Master Sword es esto: `calleventtimed 3 say_hi2`. Sin
 * un reloj, el alcalde suelta sus cuatro frases de golpe en el mismo fotograma
 * y la misión «funciona» sin que se entienda nada de lo que dice.
 *
 * Va con el paso del HUD y no con `setTimeout` por la razón de siempre en este
 * proyecto: `setTimeout` no lo puede adelantar una sonda, y una conversación de
 * dieciséis segundos que no se puede adelantar es una sonda de dieciséis
 * segundos. Ver `probe.hud.avanzar`.
 */
export class RelojDeGuiones {
  constructor() { this.tiempo = 0; this.cola = []; }
  /** `CallEventTimed(nombre, retardo)`. */
  programar(segundos, que) { this.cola.push({ cuando: this.tiempo + Math.max(0, segundos), que }); return this; }
  /**
   * Avanza. Lo que venza se ejecuta **en orden de vencimiento**, y lo que se
   * programe durante el paso queda para el siguiente: sin eso, una cadena de
   * `callevent 0 x` se comería el bucle.
   */
  paso(dt) {
    this.tiempo += dt;
    const vencidos = this.cola.filter((c) => c.cuando <= this.tiempo).sort((a, b) => a.cuando - b.cuando);
    if (!vencidos.length) return 0;
    this.cola = this.cola.filter((c) => c.cuando > this.tiempo);
    for (const c of vencidos) { try { c.que(); } catch (e) { console.warn("un evento con retardo falló:", e); } }
    return vencidos.length;
  }
  /** Cuántos quedan por vencer. Para las sondas. */
  get pendientes() { return this.cola.length; }
  vaciar() { this.cola = []; return this; }
}

/**
 * El mundo que el intérprete necesita, atado a UN NPC.
 *
 * `quien` es el jugador que está delante (su personaje y su identificador de
 * script), `npc` el bicho, y los demás son ganchos del juego. Todos opcionales:
 * lo que no se pase, no pasa nada — es lo que permite probar esto en Node sin
 * montar el juego.
 */
/**
 * El 81. Cuántos saltos de `callexternal` se permiten encadenar.
 *
 * **Esto no es del motor y va dicho aquí.** El mod no lleva guarda ninguna: dos
 * NPC que se llamen el uno al otro cuelgan el servidor, y ése es su problema.
 * Aquí hace falta porque una recursión en JavaScript no cuelga nada: revienta
 * la pila y deja al jugador sin pestaña. Es el `VUELTAS_MAXIMAS` de `guion.js`
 * —la guarda de los bucles— aplicada al salto de un guion a otro. La cadena
 * más larga que se le conoce al juego es la de la sidra, que son dos saltos.
 */
const SALTOS_MAXIMOS = 8;
let saltos = 0;

/**
 * ── EL 91: LA COSTURA ENTRE LA IA PORTADA Y EL GUION DEL BICHO ──────────────
 *
 * El diseño es híbrido y va dicho aquí porque es donde se nota: la IA portada
 * a mano (`ia.js`, `manada.js`, `reaccion.js`) SIGUE mandando —a quién se
 * persigue, cuándo se ataca, cuánto daño, quién huye y quién se encoge— y el
 * guion del bicho corre a su lado y **recibe los eventos que el motor le
 * dispararía**. Lo que el guion haría por su cuenta y la IA ya hace se cierra
 * con esta lista: cada entrada es un evento del guion que, si corriera, sería
 * una SEGUNDA copia de una regla que ya está portada, con su propio dado.
 *
 * Cerrar no es callar: cada llamada a un evento cerrado se CUENTA en
 * `GuionDeNpc.costuraCuenta.cerrados`, y la sonda lo lee (el 66: un `=> {}` de
 * relleno es donde vive una regla muerta).
 *
 * La lista salió de MEDIR: se creó el guion de los 12 guiones con ficha de
 * combate de Gate City, Edana y sala88 y se les dispararon los eventos de
 * combate del motor (ver doc/BICHOS_GUION_91.md, §1). `medido: true` son los
 * que se vieron correr y duplicaban algo. Hay TRES con `medido: false`, y van
 * marcados para que no se lean como medidos: se llega a ellos por un camino
 * que la medida no recorrió (un `repeatdelay` que este puerto no arma, o una
 * rama que hoy corta un getter sin portar), y sin cerrarlos moverían el
 * cuerpo el día que ese camino se abra.
 */
export const CIERRE_DE_BICHO = Object.freeze([
  { evento: "npcatk_hunt", medido: true,
    cita: "monsters/base_npc_attack_new.script:230-232 (`callevent CYCLE_TIME npcatk_hunt`)",
    porque: "el bucle de caza; lo lleva `Cazador.tic` (ia.js) desde `Manada.cazar`" },
  { evento: "hunting_mode_go", medido: false,
    cita: "monsters/base_npc_attack.script:62-63 (`repeatdelay CYCLE_TIME`)",
    porque: "el mismo bucle en la familia vieja (rata, jabalí, arañas). NO MEDIDO: es un `repeatdelay` y ningún guion de NPC arma sus repeticiones en este puerto; se cierra para el día que se armen" },
  { evento: "npcatk_settarget", medido: true,
    cita: "monsters/base_npc_attack_new.script:400",
    porque: "elegir objetivo; lo hace `Cazador.apuntarA`/`tic`" },
  { evento: "npcatk_target", medido: true,
    cita: "monsters/base_npc_attack.script:588; base_npc_attack_new.script:394",
    porque: "el mismo, con su nombre viejo" },
  { evento: "npcatk_go_agro", medido: true,
    cita: "monsters/base_npc_attack.script:220",
    porque: "ponerse hostil al recibir; lo hace `apuntaAlQueTePega` (reaccion.js) en `Manada.herir`" },
  { evento: "npcatk_retaliate", medido: true,
    cita: "monsters/base_npc_attack_new.script:1096; base_npc_attack.script:262",
    porque: "cambiar de objetivo al recibir; `cambiaDeObjetivo`/`apuntaAlQueTePega` (el 82)" },
  { evento: "npcatk_checkflee", medido: true,
    cita: "monsters/base_npc_attack_new.script:1142; base_npc_attack.script:303",
    porque: "decidir si huye; `reaccionAlGolpe` (reaccion.js), con su propio dado" },
  { evento: "npcatk_flee", medido: true,
    cita: "monsters/base_npc_attack_new.script:778; base_npc_attack.script:319",
    porque: "huir; `Cazador.huyeDe`. Medido: el zombi pedía `setmovedest` aquí" },
  { evento: "npcatk_checkflinch", medido: true,
    cita: "monsters/base_npc_attack_new.script:1156; base_npc_attack.script:415",
    porque: "decidir si se encoge; `reaccionAlGolpe`" },
  { evento: "npcatk_suspend_ai", medido: false,
    cita: "monsters/base_npc_attack_new.script:1224; base_npc_attack.script:710",
    porque: "quedarse quieto al encogerse; `reaccion.quietoHasta` en `Manada.herir`. NO MEDIDO: lo pide `base_struck.script:208` tras `if $get(ent_me,isalive)`, que hoy da «0» para un NPC" },
  { evento: "npcatk_alert_all_allies", medido: true,
    cita: "monsters/base_monster_shared.script:1071-1095, llamado desde base_npc.script:169-172",
    porque: "avisar a los aliados al morir; `Manada.avisar` desde `Manada.matar`" },
  { evento: "chicken_run", medido: false,
    cita: "monsters/base_npc_attack_new.script:926; base_anti_stuck.script:422",
    porque: "mueve el cuerpo, que es de la IA. El anti-atasco NO está portado en la IA: cerrarlo es un hueco declarado, no una copia. NO MEDIDO: hacen falta siete `game_damaged` con `game.time > AS_ATTACKING`, y `game.time` vale 0 en un guion de NPC" },
  { evento: "game_parry", medido: true,
    cita: "monsters/base_monster_shared.script:843-857 (`callevent game_parry ATTACKER_ID` dentro de `game_damaged`)",
    porque: "la tirada del parry del bicho la hace `parryDelBicho` (parry.js:101); el guion tiraría otro dado. Lo cerrado es la llamada INTERNA: la costura dispara `game_parry` cuando la IA decide que para" },
]);

/** Los nombres de `CIERRE_DE_BICHO`, para mirar rápido. */
export const EVENTOS_CERRADOS = new Set(CIERRE_DE_BICHO.map((c) => c.evento));

/**
 * Un número como lo escribe `UTIL_VarArgs("%f", x)`: seis decimales. Es el
 * formato de PARAM2 de `game_damaged` y de PARAM1 de `game_struck`
 * (msmonsterserver.cpp:2283 y :2384), y un guion que compare con `equals`
 * lee la cadena, no el número.
 */
export const comoF = (x) => (Number.isFinite(Number(x)) ? Number(x).toFixed(6) : "0.000000");

/**
 * Un punto de la escena (metros, Y arriba) a UNIDADES del motor (Z arriba).
 * Es la inversa exacta de `aEscena` (src/bsp/lector.js:402-408).
 */
// El `+ 0` no es decoración: `-0 * U` es `-0`, y `VecToString` del motor
// imprimiría «-0.00» sólo si el número de verdad fuera un cero negativo, que
// aquí lo fabricaría el cambio de ejes y no la física (guion.js, `textoDeVector`).
export const aMotor = (p, U = 39.37) => [p[0] * U + 0, -p[2] * U + 0, p[1] * U + 0];

/**
 * LOS PARÁMETROS DE `game_dodamage`, en su orden — giattack.cpp:2036-2045.
 *
 *     Parameters.add(Damage.AttackHit ? "1" : "0");
 *     Parameters.add(pTarget ? EntToString(pTarget) : "none");
 *     Parameters.add(VecToString(Damage.vecSrc));
 *     Parameters.add(VecToString(EndPos));
 *     Parameters.add(Damage.sDamageType.c_str());
 *     Parameters.add(AttackHit ? UTIL_VarArgs(" %.1f damage.", flDamage) : "0");
 *
 * Tres cosas que no se ven leyendo el guion:
 *
 *   - **el sexto lleva un ESPACIO delante** (« 0.4 damage.»), y al fallar no
 *     es «0.0 damage.» sino la cadena «0»;
 *   - el tipo de un `dodamage` de NPC sin quinto parámetro es «generic»
 *     (`Damage.sDamageType = "generic"`, npcscript.cpp:1116), no la cadena vacía;
 *   - `vecSrc` es el OJO del atacante (`EyePosition()`, npcscript.cpp:1121) y
 *     el final, con el objetivo a tiro, su `Center()` (:1197-1198). Por la
 *     esfera de `DoDamage` (giattack.cpp:1559-1576) la traza que acierta acaba
 *     en el mismo `Center()`, así que los dos casos dan el mismo punto.
 */
export function paramsDeDodamage({ acierto, objetivo = "none", desde = null, hasta = null, tipo = "", dano = 0 } = {}) {
  const v = (p) => (Array.isArray(p) && p.length >= 3 ? textoDeVector(p) : "(0.00,0.00,0.00)");
  return [
    acierto ? "1" : "0",
    String(objetivo ?? "none"),
    v(desde), v(hasta),
    String(tipo || "generic"),
    acierto ? ` ${(Number(dano) || 0).toFixed(1)} damage.` : "0",
  ];
}

export function entornoDe({
  npc = null, jugador = null, catalogo = null,
  suceso = null, animar = null, programar = null, azar = null,
  // El 60. `infomsg` NO es la consola de sucesos: es la ventana de arriba a la
  // izquierda (`src/play/aviso.js`). Va aparte de `suceso` porque son dos
  // sitios distintos de la pantalla, y hasta el 60 eran el mismo.
  ventanaDeAviso = null,
  // El 60. Abre el panel de la tienda. Devuelve `true` si lo ha abierto; sin
  // ella —Node, el servidor— la oferta se dice por la consola y ya.
  abrirTienda = null,
  // El 44. `tiendas` es la lista GLOBAL por nombre (`CStore::m_gStores`), y va
  // inyectada en vez de ser un módulo con estado suelto: si fuera suelta, dos
  // pruebas se pisarían y dos partidas del mismo navegador compartirían
  // inventario de vendedor.
  tiendas = new Tiendas(), llamarEvento = null, apuntar = null,
  // El 62. El trato con ESTE vendedor: `ocupado()` dice si ya está atendiendo
  // a otro —lo que decide entre abrir y `_busy`, npcscript.cpp:875— y
  // `abrir(retrollamada)` lo marca en los dos lados, como `CStore::Offer`
  // (store.cpp:77-80). Quien no lo inyecte se queda como antes: un vendedor
  // que atiende a todo el mundo, que es lo correcto cuando sólo hay uno.
  trato = null,
  // El 64. Adónde va un `helptip`. Se inyecta como todo lo que acaba en la
  // pantalla; si no está, el comando se apunta como no soportado y nada más.
  mandarConsejo = null,
  // El 45. `entidades` es el registro nombre <-> asa (`src/play/entidades.js`) y
  // `borrarDelMundo` lo que de verdad quita la cosa: se pasan los dos porque
  // borrar es dos pasos, deshacer el asa y avisar a quien lleve esa entidad.
  entidades = null, borrarDelMundo = null,
  // El 81. `(asa) => Guion | null`: el guion de OTRO NPC, resuelto por el asa
  // que devuelve `$get_by_name`. Lo pone quien monta la manada, porque esta
  // clase sólo se conoce a sí misma. Sin él, `callexternal` a un vecino se
  // apunta y no llega — que es lo que pasaba hasta el 81.
  guionDeOtro = null,
  // El 81. `() => Guion[]`: todos los que corren, para `callexternal all`.
  todosLosGuiones = null,
  // El 81, para `setmovedest` (lo pide la sesión que lleva ese experimento).
  // `mandarADestino(destino, opciones)` es `SetMoveDest` y `animarAndando(n)`
  // es `m_MoveAnim`. Quien no los inyecte se queda como hasta el 81: el
  // comando se ejecuta, no se atranca y no llega a ninguna parte.
  mandarADestino = null, animarAndando = null,
  // El 81. SÓLO el rayo del `$cansee`: `(refObjetivo) => boolean`, que es
  // el `FMVisible` de npcscript.cpp:1824. La aritmética del rango se queda
  // en `ve`, con sus citas. Sin esto, `$cansee` da «0» y lo apunta.
  lineaDeVision = null,
  // El 81. **Las posiciones de este puerto están en METROS y los rangos de
  // los guiones en UNIDADES del motor** (`RANGO_LOCAL = 300`, chat.js:131).
  // Sin convertir, `$cansee(player,128)` daría que sí a 128 METROS, que es
  // tres veces el pueblo entero — un alcance infinito y callado, que es la
  // forma del 79. Va inyectado porque la escala la sabe el nivel.
  unidadesPorMetro = 39.37,
  // LOS EFECTOS. `(ruta, params, {aplicador}) => efecto|null`: pegarle un
  // efecto AL JUGADOR, que es el único anfitrión de efectos de este puerto
  // (`src/play/efectos.js`). Sin él, `applyeffect` se apunta.
  aplicarEfecto = null,
  // EL 93: EL CUERPO DEL BICHO, que lo lleva la manada (`Manada.cuerpoDe`).
  // Es por donde un guion mueve, lanza, pega o suelta a su propia entidad
  // (`setvelocity ent_me`, `setfollow`, `gravity`…) y por donde pregunta lo que
  // sólo la física sabe (`onground`, el rumbo). Sin él, todo eso se apunta.
  cuerpo = null,
} = {}) {
  /** `RetrieveEntity(ref)`: aquí sólo hay dos entidades, el jugador y el NPC. */
  const esElJugador = (ref) => {
    const r = String(ref ?? "");
    if (!jugador) return false;
    if (r === jugador.ref || r === "ent_lastspoke" || r === "player") return true;
    // EL 91: `ent_laststruckbyme` es a quién pegó este bicho la última vez:
    // `pAttMonster->StoreEntity(pTarget, ENT_LASTSTRUCKBYME)`, justo antes de
    // `game_damaged_other` (giattack.cpp:1754-1756). Lo apunta la costura.
    //
    // `ent_laststruck` —quién le pegó a ÉL— NO se resuelve todavía, y es a
    // propósito: su uso más visible es el «You've slain» de `game_death`
    // (base_npc.script:192-199), y con `game.monster.name.full` sin portar en
    // el intérprete saldría «You've slain game.monster.name.full», una frase
    // falsa con cara de mensaje del juego (el 65). Ver doc/BICHOS_GUION_91.md.
    if (r === "ent_laststruckbyme") return entorno.golpeadoPorMi === jugador.ref;
    // ── EL 94: `ent_laststruck` YA SE RESUELVE ───────────────────────────
    //
    // `StoreEntity(pAttacker, ENT_LASTSTRUCK)` justo antes de `game_struck`
    // (msmonsterserver.cpp:2380-2385). Lo apunta la costura en el caso
    // `recibe` (`InteraccionesNpc._alCombate`). Hace falta porque el aldeano
    // grita con él: `callevent call_for_help $get(ent_laststruck,id)`
    // (monsters/base_civilian.script:5) y `callexternal all civilian_attacked
    // $get(ent_laststruck,id) …` al morir (:20). Sin esto el guardia recibía
    // «0» de atacante.
    //
    // Y lo de arriba —que abrirlo sacaría «You've slain
    // game.monster.name.full»— se MIDIÓ al abrirlo, y era verdad: salía. Por
    // eso el 94 porta también `name.full` (ver `nombreCompleto` en
    // `GuionDeNpc`), y ahora sale «You've slain Commoner», que es la línea
    // verde del mod. Ver doc/GUARDIAS_94.md §3.
    if (r === "ent_laststruck") return entorno.golpeadoPor === jugador.ref;
    // EL 92: `ent_lastseen` es lo último que guardó `StoreEntity(pSighted,
    // ENT_LASTSEEN)`, y en el motor eso SÓLO lo escribe `$cansee`
    // (npcscript.cpp:1838-1846; `grep ENT_LASTSEEN` no da otro sitio). `ve`,
    // aquí abajo, ya lo guardaba en `ultimoVisto` y nadie lo leía. Lo pide el
    // golpe: la rata, el guardia y las arañas pegan a `ent_lastseen`
    // (giantrat.script:65, spider_base.script:34). La costura lo escribe
    // también cuando la IA ataca (`apuntarObjetivo`), que es el `$cansee` de
    // la caza que el cierre del 91 no deja correr.
    if (r === "ent_lastseen") return entorno.ultimoVisto === jugador.ref;
    return false;
  };
  const personaje = () => jugador?.personaje ?? null;
  /** «x y z» o «(x,y,z)» a tres números, que es como los guardan los guiones. */
  const vector = (v) => {
    const n = String(v ?? "").replace(/[()]/g, "").split(/[\s,]+/).filter(Boolean).map(Number);
    return n.length >= 3 && n.every((x) => Number.isFinite(x)) ? n : null;
  };
  /** EL 93: `ent_me`, el propio NPC, dicho como lo dice el guion. */
  const esYo = (ref) => String(ref ?? "") === "ent_me";
  /**
   * EL 93: el `pev->origin` del motor de una de las dos entidades, en
   * UNIDADES y con la Z arriba, o `null`. Los `origen` que da el juego son
   * METROS de la escena con la Y arriba (`instancia.donde`, `player.feet`), y
   * se cambian AQUÍ, una vez, con `aMotor` (la inversa de `aEscena`). El del
   * jugador sube 36 unidades: su `origin` es el centro de la caja
   * (msitemdefs.h:55); el de un monstruo son sus pies (msmonsterserver.cpp:244).
   * Agachado serían 18 y no se distingue: queda dicho, como en `hizoDano`.
   */
  const origenMotor = (ref) => {
    const jug = esElJugador(ref);
    const v = vector(jug ? jugador?.origen : npc?.origen);
    if (!v) return null;
    const m = aMotor(v, unidadesPorMetro || 39.37);
    if (jug) m[2] += 36;
    return m;
  };

  /**
   * El 81. Un salto de `callexternal`, con la guarda de `SALTOS_MAXIMOS`.
   *
   * Que el otro no tenga ese evento NO es un fallo —`CallScriptEvent` sobre un
   * nombre que no existe no hace nada y no avisa—, pero sí se apunta: así se
   * puede contar cuántas llamadas de los guiones caen en el vacío.
   */
  const conGuarda = (otro, evento, params, apunta) => {
    if (saltos >= SALTOS_MAXIMOS) {
      apuntar?.("callexternal", `${evento}: más de ${SALTOS_MAXIMOS} saltos encadenados`);
      return;
    }
    saltos++;
    let dicho = false;
    try { dicho = Boolean(otro?.llamar(evento, params.map(String))); }
    finally { saltos--; }
    if (!dicho) apunta();
  };

  const entorno = {
    // `$item_exists(<target>,<item>)`, script.cpp:3097. Los distintivos
    // (`nohands`, `noworn`...) se leen pero aquí sólo hay manos y mochila.
    llevaObjeto(ref, clave, distintivos = "0") {
      if (!esElJugador(ref)) return false;
      const p = personaje();
      const f = String(distintivos ?? "0");
      if (!f.includes("nohands")) {
        for (const m of Object.values(p?.manos ?? {})) {
          const id = typeof m === "string" ? m : m?.clave ?? m?.id;
          if (id === clave) return true;
        }
      }
      return (p?.objetos ?? []).some((o) => o?.id === clave);
    },

    leerMision: (ref, nombre) => (esElJugador(ref) ? leerMision(personaje(), nombre) : "0"),
    ponerMision: (ref, nombre, dato) => { if (esElJugador(ref)) ponerMision(personaje(), nombre, dato); },
    limpiarMisiones: (ref) => { if (esElJugador(ref)) limpiarMisiones(personaje()); },
    volcarMisiones: (ref) => (esElJugador(ref) ? volcarMisiones(personaje()) : []),

    /**
     * `Speak(texto, SPEECH_LOCAL)` — msmonsterserver.cpp:1588-1637.
     *
     * El formato es literal, **con las dos comillas y los DOS espacios detrás
     * de la coma**, que están en el `_snprintf` del motor (:1633):
     *
     *     _snprintf(cTemp, ..., "%s says,  \"%s\"\n", DisplayName(), pszSentence);
     *
     * Y antes se le quitan las comillas al texto (:1594-1601): un `saytext
     * "hola"` no sale entrecomillado dos veces.
     */
    hablar(texto) {
      let t = String(texto ?? "");
      if (t.startsWith('"')) { t = t.slice(1); if (t.endsWith('"')) t = t.slice(0, -1); }
      // «make sure the text has content»: sin un carácter imprimible que no sea
      // espacio, NO se dice nada. :1605-1614.
      if (!/[^\s]/.test(t)) return;
      // EL 95: con el ALCANCE de esta entidad (`m_SayTextRange`), porque
      // `Speak` no se lo dice a «el jugador» sino a todo el que esté a
      // `Length2D() <= m_SayTextRange` (msmonsterserver.cpp:1712-1716). En
      // UNIDADES del motor, como lo escribe el guion: quien sabe dónde está
      // cada uno (el servidor) convierte. Un navegador con un jugador no lo
      // mira todavía (doc/RED_95.md §8).
      suceso?.("normal", `${npc?.nombre ?? "Someone"} says,  "${t}"`, { habla: { rango: entorno.alcanceDeVoz } });
    },

    /**
     * EL 95. `m_SayTextRange`: hasta dónde llega el `saytext` de ESTA
     * entidad, en unidades. Nace en `SPEECH_LOCAL_RANGE` (300, msmonster.h:79;
     * msmonstershared.cpp:458) y lo cambia `saytextrange`.
     */
    alcanceDeVoz: RANGO_LOCAL,

    /**
     * `saytextrange <unidades|default>` — npcscript.cpp:724-737.
     *
     *     if (Params[0] == "default") m_SayTextRange = SPEECH_LOCAL_RANGE;
     *     else                        m_SayTextRange = atof(Params[0]);
     *
     * `==` de `msstring` es `strcmp` (stackstring.cpp:54): «Default» no es
     * «default», y `atof("Default")` es 0 — un NPC que no oye nadie. Se porta
     * así. El valor se queda puesto: el pregonero de Edana lo sube a 1024 para
     * su noticia y lo devuelve con `saytextrange default` (edana/towncrier.script:30-32).
     */
    cambiarAlcanceDeVoz(valor) {
      entorno.alcanceDeVoz = String(valor) === "default" ? RANGO_LOCAL : numDe(valor);
    },

    /**
     * `playanim [once|<seg>] <anim>` — npcscript.cpp:1487.
     *
     * EL 93: `playanim break`, a secas, es `BreakAnimation` y NADA MÁS
     * (npcscript.cpp:1527-1528, y sin nombre no hay `SetAnimation`, :1543):
     * suelta la animación y el siguiente `Think` pone la de reposo
     * (msmonsterserver.cpp:590-592). Hasta aquí llegaba como `animar("break")`
     * y la manada, al no encontrar la secuencia, ponía la 0 de una vez. Con
     * cuerpo se suelta; sin él, como antes.
     */
    animar: (nombre, modo) => {
      if (cuerpo && String(modo) === "break" && String(nombre) === "break") return cuerpo.romper();
      return animar?.(nombre, modo);
    },

    /**
     * `infomsg <player|all> <title> <text>` — scriptcmds.cpp:4058. Una ventana
     * emergente con el título en rojo, arriba a la izquierda.
     *
     * DESDE EL 60 va a esa ventana. Antes decía aquí que «este puerto no tiene
     * esa ventana» y se imprimía como una línea verde de la consola de
     * sucesos, abajo a la derecha. La ventana existe: `src/play/aviso.js`.
     *
     * `_aQuien` sigue sin usarse y sigue siendo correcto: con un solo jugador,
     * `ent_me` y `all` acaban los dos en tu pantalla — `SendHUDMsgAll` recorre
     * los jugadores y le llama a `SendHUDMsg` a cada uno (svglobals.cpp:346).
     */
    aviso(aQuien, titulo, texto) {
      // ── EL 95: A QUIÉN, que con servidor ya no es lo mismo ──────────────
      //
      //     if (Params[0] == "all") SendToAll = true;
      //     if (!SendToAll) pEntity = RetrieveEntity(Params[0]);
      //     if (SendToAll || (pEntity && pEntity->IsPlayer())) ...
      //                                   scriptcmds.cpp:4064-4075
      //
      // Lo de arriba («`_aQuien` sigue sin usarse y sigue siendo correcto»)
      // era verdad con UN jugador y dejó de serlo con servidor: `all` son
      // todos los de la partida y lo demás es UNO, el que nombre el guion. Y
      // si lo que nombra no es un jugador (`ent_me` desde un NPC), el motor no
      // manda nada; aquí se apunta, para que no parezca que se perdió.
      const todos = String(aQuien) === "all";
      if (!todos && !esElJugador(aQuien)) { apuntar?.("infomsg", `${aQuien}: no es un jugador`); return; }
      ventanaDeAviso?.(titulo, texto, { todos });
    },

    /** `offer <target> gold <n>` — npcscript.cpp:680, `pMonster->GiveGold`. */
    darOro(ref, cuanto) {
      if (!esElJugador(ref)) return;
      const p = personaje(); if (!p) return;
      p.oro = (p.oro ?? 0) + cuanto;
      suceso?.("bueno", `You receive ${cuanto} gold`);
    },

    /**
     * `offer <target> <item> [cantidad]` — npcscript.cpp:664-675.
     *
     * Con la mochila llena el motor no da nada y avisa («Cannot recieve items
     * while inventory is full.», :685); y si `GiveTo` falla **tira el objeto al
     * suelo** (:673). Aquí no hay objetos en el suelo todavía, así que el tope
     * es lo único que se porta.
     */
    darObjeto(ref, clave, cuantos = 1) {
      if (!esElJugador(ref)) return;
      const p = personaje(); if (!p) return;
      p.objetos ??= [];
      // `NUM_MAX_ITEMS`: el tope duro del inventario. genericitem.h.
      if (p.objetos.length >= 50) { suceso?.("nopuedes", "Cannot recieve items while inventory is full."); return; }
      const ya = p.objetos.find((o) => o.id === clave);
      if (ya) ya.n = (ya.n ?? 1) + cuantos;
      else p.objetos.push({ id: clave, n: cuantos });
      suceso?.("bueno", `You receive ${nombreVisibleDe(catalogo, clave, cuantos)}`);
    },

    /** Lo pone el propio `GuionDeNpc` al abrir el menú. */
    registrarOpcion: () => {},

    /**
     * `callexternal <ref> <evento> [params]` — scriptcmds.cpp, `RetrieveEntity`
     * y después `CallScriptEvent`; con `all`, `CallScriptEventAll`
     * (script.cpp:5893).
     *
     * ── CORRECCIÓN DEL 81 ──────────────────────────────────────────────────
     * Aquí decía «no hay más guiones corriendo que el del NPC de delante, así
     * que esto no llega a nadie». **Era verdad cuando se escribió y dejó de
     * serlo en el 79**, cuando `InteraccionesNpc` empezó a tener el guion de
     * los 48 NPC de Edana para repartir lo que dice el jugador. Otra vez un
     * diagnóstico correcto con fecha de caducidad y sin fecha, como el
     * `catchspeech` del 79 — y además el 66 ya había arreglado este mismo
     * `=> {}` en `guionjugador.js` y en `guionobjeto.js` y se dejó el tercero.
     *
     * Lo que destapó el hueco: la misión de la sidra de Edana es **entera**
     * NPC→NPC (`callexternal $get_by_name(wench) cider2`). En los 2 884
     * guiones hay **63 llamadas así en 27 ficheros**, más 111 `all` y 82
     * `players`.
     *
     * Lo que NO llega, y se apunta en vez de fingirse: el jugador —su guion es
     * `guionjugador.js` y no lo monta esta clase—, `players`, y cualquier asa
     * que no sea la de un NPC con guion.
     */
    llamarExterno(ref, nombre, params = []) {
      const r = String(ref ?? "");
      const evento = String(nombre ?? "");
      const apunta = () => apuntar?.("callexternal", `${r || "<nada>"} ${evento}`);

      // `CallScriptEventAll`: todas las entidades con guion. Aquí son los NPC
      // montados; el jugador y los objetos van por otros dos entornos.
      if (r === "all") {
        const todos = todosLosGuiones?.() ?? null;
        if (!todos?.length) { apunta(); return; }
        for (const g of todos) conGuarda(g, evento, params, apunta);
        return;
      }
      // `players` es el bucle sobre los clientes. Con el guion del jugador
      // fuera de esta clase, no llega: se apunta.
      if (r === "players" || esElJugador(r)) { apunta(); return; }

      const otro = guionDeOtro?.(r) ?? null;
      // `RetrieveEntity` devolviendo NULL: el motor no hace nada y no avisa.
      // Aquí sí se apunta, porque un nombre que no resuelve es casi siempre un
      // hueco nuestro y no del mapa.
      if (!otro) { apunta(); return; }
      conGuarda(otro, evento, params, apunta);
    },

    /** `callevent <retardo> <evento>`: lo encola quien tenga reloj. */
    programar: (segundos, que) => programar?.(segundos, que),

    /**
     * `applyeffect <objetivo> <guion> [params]` desde un NPC — scriptcmds.cpp:1865.
     *
     * El objetivo tiene que ser una entidad CON GUION (:1873), y aquí la única
     * que lo es y no es un NPC es el jugador. El caso que lo pide es el sumo
     * sacerdote de Edana: «Ask to be Healed» -> `say_heal` -> `attack_1` ->
     * `applyeffect ent_lastspoke effects/effect_rejuv2 0 1000 $get(ent_me,id)`
     * (edana/highpriest.script:94). Sin esto decía «let me help you with
     * that...» y no curaba nada.
     *
     * El aplicador va con el asa que ESTE guion se da a sí mismo
     * (`$get(ent_me,id)`): es la que el guion acaba de pasarle al efecto como
     * parámetro, y el efecto le pregunta el nombre por ella.
     */
    aplicarEfecto(ref, ruta, params = [], { desde = null } = {}) {
      if (!esElJugador(ref) || !aplicarEfecto) {
        apuntar?.("applyeffect", `${ref} ${ruta}${aplicarEfecto ? " (objetivo sin guion)" : " (sin anfitrión de efectos)"}`);
        return null;
      }
      const id = String(desde?.resolver?.("$get(ent_me,id)") ?? "0");
      // EL 92: y con su NOMBRE y, si es un bicho de la manada, su instancia.
      // El veneno que pone el mordisco de una araña golpea con este aplicador
      // de atacante, y `main.js` arma el «X hits you» y el cono del escudo con
      // `atacante.instancia` o, sin ella, con `atacante.nombre`: sin los dos
      // la línea decía «none hits you: 2.0 poison damage.».
      return aplicarEfecto(ruta, params, { aplicador: {
        id, nombre: npc?.nombre ?? null, instancia: npc?.instancia ?? null,
        propiedad: (p) => entorno.propiedad("ent_me", p),
      } });
    },

    /** `$get(<ent>,<prop>)` — sólo las propiedades de `PROPIEDADES`. */
    propiedad(ref, prop) {
      const p = personaje();
      switch (String(prop)) {
        case "isplayer": return esElJugador(ref) ? "1" : "0";
        case "exists": return esElJugador(ref) ? "1" : "0";
        case "alive": case "isalive":
          // EL 93: `$get(ent_me,alive)` de un BICHO con cuerpo:
          // `pTarget->IsAlive()` (scriptcmds.cpp:959), que en un `CMSMonster`
          // es `pev->deadflag == DEAD_NO` (msmonster.h:357). Daba «0» para todo NPC (el 91, §5.7) y es la cuarta
          // condición del salto de la araña (spider.script:99): sin esto no
          // saltaba nunca. SÓLO con cuerpo —los bichos de combate—: el 91 dejó
          // dicho que abrirlo despierta el encogerse de `base_struck`, y para
          // ésos está cerrado y absorbido; para un NPC al que se le habla no se
          // ha medido y sigue como estaba.
          if (cuerpo && esYo(ref)) return cuerpo.vivo() ? "1" : "0";
          return esElJugador(ref) && (p?.vida ?? 0) > 0 ? "1" : "0";
        case "id": return esElJugador(ref) ? (jugador?.ref ?? "0") : "0";
        case "name": return esElJugador(ref) ? (p?.nombre ?? "0") : (npc?.nombre ?? "0");
        /**
         * `origin` — `RETURN_POSITION("origin", pTarget->pev->origin)`
         * (scriptcmds.cpp:1144), o sea `VecToString`: «(x,y,z)» en UNIDADES y
         * ejes del motor (iscript.h:239-242).
         *
         * ── CORRECCIÓN DEL 93 ─────────────────────────────────────────────
         * Hasta aquí devolvía el `origen` tal cual lo da el juego, que en este
         * puerto son METROS de la escena con la Y arriba (`instancia.donde`,
         * `player.feet`). Lo destapó el salto de la araña:
         * `setorigin ent_me $get(SPIDER_LATCH_TARGET,origin)` (spider.script:148)
         * habría puesto a la araña a la cuarentava parte de la distancia. Es el
         * hallazgo del 81 —«las posiciones están en METROS y los rangos en
         * UNIDADES»— en otra puerta. Y el `origin` de un jugador es el CENTRO de
         * su caja, 36 unidades sobre los pies (`ENT_EFFECT_FOLLOW_ALIGN_BOTTOM`
         * lo dice: «in players, the bottom is 36 units lower», msitemdefs.h:55);
         * el de un monstruo, sus pies (msmonsterserver.cpp:244, el 82).
         */
        case "origin": {
          const o = origenMotor(ref);
          return o ? textoDeVector(o) : "0";
        }
        /**
         * `onground` — `FBitSet(pev->flags, FL_ONGROUND)` (scriptcmds.cpp:1055).
         * El 93: lo piden la araña y su objetivo antes de saltar
         * (spider.script:103-104). Sólo lo sabe la física, que la tiene el
         * cuerpo; sin cuerpo, o si el cuerpo no lo sabe, se apunta y da «0».
         */
        case "onground": {
          const s = !cuerpo ? null : esYo(ref) ? cuerpo.enSuelo() : esElJugador(ref) ? cuerpo.objetivoEnSuelo(jugador?.ref) : null;
          if (s === null || s === undefined) { apuntar?.("propiedad", `$get(${ref},onground) sin física`); return "0"; }
          return s ? "1" : "0";
        }

        // ── el 46 ─────────────────────────────────────────────────────────
        // `RETURN_FLOAT(pTarget->pev->health)` — scriptcmds.cpp:960.
        case "hp": return esElJugador(ref) ? String(p?.vida ?? 0) : String(npc?.vida ?? 0);

        /**
         * `maxhp` — y aquí hay una que se lee al revés de como está:
         * **la rama vive dentro de `else if (pMonster)`** (:1388-1391), o sea
         * que `$get(<un jugador>,maxhp)` **no casa con nada** y sale por
         * `return fSuccess ? "1" : "0"` valiendo **«0»**.
         *
         * No es teórico: `NPCs/base_storage.script:150-151` hace
         *
         *     setvard USE_FEE $get(PARAM1,maxhp)
         *     multiply USE_FEE FEE_HP_RATIO
         *
         * con PARAM1 = el jugador. O sea que **la tarifa del guardarropa de
         * Gate City es cero en el juego de verdad**, y siempre lo ha sido.
         * Devolver aquí la vida máxima del personaje sería «arreglarlo» y
         * cobrar un dinero que el original no cobra.
         *
         * ── CORRECCIÓN DEL 92: LO DE ARRIBA ES FALSO ─────────────────────
         *
         * El jugador SÍ es `pMonster`: `GetProp` lo rellena con
         * `pTarget->IsMSMonster()` (scriptcmds.cpp:926), `CBasePlayer` hereda
         * de `CMSMonster` (player.h:396) y no redefine `IsMSMonster`, que en
         * `CMSMonster` devuelve `true` (msmonster.h:352). Así que la rama de
         * :1391 SÍ casa con un jugador y devuelve `RETURN_FLOAT(MaxHP())`
         * —«%.2f», iscript.h:224—, la vida máxima de `CBasePlayer::MaxHP`
         * (playershared.cpp:1067-1076), que es `derivadas().vidaMax`.
         *
         * Y la tarifa del guardarropa NUNCA fue cero, ni con la lectura
         * equivocada: la línea siguiente del guion es `if ( USE_FEE < 25 )
         * setvard USE_FEE 25` (NPCs/base_storage.script:153).
         *
         * Lo destapó el veneno: `game_dodamage` de base_monster_shared
         * (:1334) calcula el daño por segundo como el 5 % de
         * `$get(PARAM2,maxhp)` del OBJETIVO, y con «0» el veneno de un bicho
         * hacía 0 al jugador. Lo midió la pieza B del 92 (el servidor); lo
         * arregla ésta. El texto de arriba se deja: es la lectura del 46.
         *
         * El de un MONSTRUO también es «%.2f» en el motor, y aquí sigue sin
         * decimales: no se ha cambiado en este experimento (ningún guion de
         * estos mapas lo compara con `equals`; sin medir en los demás).
         */
        case "maxhp": {
          if (!esElJugador(ref)) return String(npc?.vidaMax ?? 0);
          // Sin hoja de habilidades (un personaje de prueba) se lee el campo
          // que traiga; el del juego no se guarda, se deriva (personaje.js).
          const max = p?.habilidades ? derivadas(atributosDe(p.habilidades)).vidaMax : (p?.vidaMax ?? p?.vida ?? 0);
          return (Number(max) || 0).toFixed(2);
        }

        /**
         * `dist`/`range` y sus versiones en 2D — :1146-1165.
         *
         * `range` y `dist` son **lo mismo**, y las dos le restan la mitad de
         * los anchos de los dos bichos cuando los dos son monstruos
         * («MIB JAN2010_20 - range check take model widths into account»).
         * Con un jugador delante no se resta nada, que es el caso de Gate
         * City: el armero mira `$get(PARAM1,dist) <= 90`.
         */
        /*
         * ── CORRECCIÓN DEL 93 ─────────────────────────────────────────────
         * Lo de arriba («con un jugador delante no se resta nada») es FALSO, y
         * por lo mismo que corrigió el 92 en `maxhp`: el jugador SÍ es
         * `pMonster` (scriptcmds.cpp:926, player.h:396, msmonster.h:352), así
         * que con un NPC preguntando entran los dos en la rama de la resta
         * (:1151-1152). Lo que pasa es que el `m_Width` del jugador es 0 (el
         * 82: sólo lo asigna el `width` de un guion de NPC, npcscript.cpp:201),
         * y lo que se resta es la MITAD DE LA ANCHURA DEL NPC. Para la araña
         * son 17 unidades de las 200 de su salto (spider.script:102).
         *
         * Y la distancia se medía entre los dos `origen` crudos, que en este
         * puerto son METROS con la Y arriba: un `<= 90` del armero se cumplía
         * a 90 metros, y `dist2D` tiraba la Z de la escena, que es horizontal.
         * Ahora va entre los dos `origin` del motor (`origenMotor`, arriba):
         * unidades, Z arriba, y el del jugador en su centro.
         */
        case "dist": case "range": case "dist2D": case "range2D": {
          const a = origenMotor(ref);
          const b = origenMotor("ent_me");
          if (!a || !b) return "0";
          const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
          const plano = String(prop).endsWith("2D");
          let d = Math.sqrt(dx * dx + dy * dy + (plano ? 0 : dz * dz));
          // :1151-1152 — sólo `dist`/`range`, y sólo si los dos son monstruos.
          // El otro aquí es el jugador (ancho 0) o el propio NPC.
          if (!plano && esElJugador(ref)) d -= (Number(npc?.ancho) || 0) / 2;
          // `RETURN_FLOAT(Dist)`: «%.2f» de un `float` (iscript.h:224).
          return Math.fround(d).toFixed(2);
        }

        case "gold": return esElJugador(ref) ? String(p?.oro ?? 0) : "0";

        /**
         * `race` — `return _strlwr(pMonster->m_Race)` (scriptcmds.cpp:1390).
         * EL 94: lo pregunta el guardia antes de perseguirte por pegar a un
         * aldeano, `if $get(OFFENDER,race) isnot hguard`
         * (gatecity/guard.script:109). El jugador es `pMonster` (la corrección
         * del 92 en `maxhp`) y su raza la pone su guion al entrar:
         * `race human` (player/player_main.script:102).
         *
         * **SÓLO el jugador.** La del propio NPC (`$get(ent_me,race)`,
         * `game.monster.race`) sería la de su ficha (`race`,
         * npcscript.cpp:225-228), y NO se contesta a propósito: la piden
         * `game_spawn` de base_npc.script:34-40 (`NPC_FRIENDLY`,
         * `NPC_FIGHTS_NPCS`) y `npcatk_setup_siege`, ramas que nadie ha medido
         * en este puerto. Sigue en «0», que es lo que daba antes.
         */
        case "race": return esElJugador(ref) ? "human" : "0";

        /**
         * `steamid` — :1232, `pPlayer->AuthID()`. Aquí no hay Steam y no lo
         * habrá: este puerto no tiene cuentas. Vale «0», que es justo lo que
         * devuelve el motor en un servidor local cuando no hay AuthID.
         */
        case "steamid": return "0";

        default: return "0";
      }
    },

    /**
     * `$dist(a,b)` en unidades del motor — script.cpp:131.
     *
     * El 81. Los dos lados pueden ser un vector «(x,y,z)» o una entidad, y lo
     * que se resuelve aquí es lo que esta clase sabe: un vector literal, el
     * jugador y el propio NPC. **Una entidad cualquiera del mapa todavía no**,
     * y por eso devuelve `0` y lo apunta en vez de inventarse un número — un
     * cero callado en una distancia es un `if $dist(...) < 100` que se cumple
     * siempre. (La resolución general es de `setmovedest`, que lleva la sesión
     * de ese experimento; cuando esté, este getter se cuelga de ella.)
     */
    distancia(a, b) {
      const sitio = (x) => {
        const v = vector(x);
        if (v) return v;
        const o = entorno.propiedad(x, "origin");
        return vector(o);
      };
      const p = sitio(a), q = sitio(b);
      if (!p || !q) { apuntar?.("getter", `$dist(${a},${b})`); return 0; }
      return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    },

    // `RANDOM_LONG(a, b)`, los dos extremos incluidos. script.cpp:3554.
    azar: azar ?? ((a, b) => a + Math.floor(Math.random() * (b - a + 1))),

    // ── EL 43: los siete ganchos de los comandos nuevos ────────────────────
    //
    // Cuatro de los siete **todavía no llegan a ninguna parte**, y eso va
    // dicho aquí en vez de fingir que sí. Lo que cambia con el 43 es que el
    // intérprete YA NO SE ATRANCA en ellos: antes, encontrarse un `roam` en
    // mitad de una retrollamada abortaba la opción entera y el NPC no hacía
    // nada. Ahora la opción se ejecuta hasta el final y lo que falta es el
    // efecto, no la conversación. Es la diferencia entre 7 y 19 NPCs enteros.
    //
    // Cada uno dice dónde acaba hoy, que es la regla de «un ajuste no puede
    // quedarse callado» aplicada a los comandos.

    /** `RANDOM_FLOAT(a, b)`. script.cpp:3552. Comparte dado con `azar`. */
    azarFlotante: (a, b) => a + (azar ? (azar(0, 1000000) / 1000000) : Math.random()) * (b - a),

    /**
     * `say`: SUENA, no escribe — son `.wav` con la boca abierta tantos
     * segundos. LLEGA a la consola de sucesos y no al altavoz: el catálogo de
     * voces de los NPC no está horneado (`npm run sonido` trae pasos y
     * combate, no diálogo). Se anota para que se vea que el NPC habló.
     */
    decir(archivo, _cuanto) {
      if (!archivo) return;          // `*` y `RND*` son sólo mover la boca
      suceso?.("normal", `${npc?.nombre ?? "Someone"} speaks`);
    },

    /**
     * `playsound` / `playrandomsound`: NO llega al altavoz — el catálogo de
     * estos `.wav` no está horneado (`npm run sonido` trae pasos y combate, no
     * los de los guiones). Se apunta el archivo para que se vea cuál pedía y
     * con qué volumen, que es lo que el 46 vino a poder medir.
     */
    sonar(archivo, { volumen = null, corta = false } = {}) {
      apuntar?.("sonido", `${archivo}${corta ? " (corta el canal)" : volumen === null ? "" : ` @${volumen}`}`);
    },

    /**
     * El 89b. `sound.play3d`/`svsound.play3d`: igual que `sonar`, NO llega al
     * altavoz; se apunta archivo, volumen y punto (unidades del motor).
     */
    sonarEn(archivo, { volumen = null, origen = null } = {}) {
      apuntar?.("sonido", `${archivo} @${volumen} en (${(origen ?? []).join(",")})`);
    },

    /** `setprop`: NO llega a nada — las propiedades vivas del NPC no se tocan. */
    ponerPropiedad() {},

    /** `roam`: NO llega a nada — el paseo lo decide `src/play/paseo.js`. */
    pasear() {},

    /**
     * `setmovedest` — `SetMoveDest`, npcscript.cpp:1611-1700.
     *
     * El 81: deja de ser un `=> {}`. Reenvía tal cual lo que le da el
     * `case "setmovedest"` de `guion.js:1265-1274`: `null` para
     * `setmovedest none`, y `{punto}` o `{entidad}` más
     * `{proximidad, huir}` para el resto. **Quien no inyecte
     * `mandarADestino` se queda como hasta el 81** — el comando se ejecuta,
     * no atranca la conversación, y no llega a ninguna parte.
     */
    irA(destino, opciones) { mandarADestino?.(destino, opciones); },

    /** `setmoveanim` — `m_MoveAnim`, npcscript.cpp:1471-1477. El 81: reenvía. */
    animacionDeAndar(n) { animarAndando?.(n); },

    /**
     * **`$cansee(<objetivo>,<rango>)`** — npcscript.cpp:1754-1850. El 81.
     *
     * No estaba en `GETTERS`, y es la PRIMERA LÍNEA de media docena de
     * bloques de Edana: `{ say_job / if cider_1 equals 0 / if $cansee(player,128)`.
     * Al ser un `if` VIEJO, un getter sin soporte no se salta una línea:
     * **abandona el bloque entero** (el 67). O sea que la misión de la sidra
     * no podía empezar aunque todo lo demás estuviera bien.
     *
     * Cuatro rarezas del motor, y las cuatro se portan:
     *
     * 1. **`ClosestTarget = atof(Params[1])`** (:1761). `atof`, no `Number` —
     *    la del 79. Y **sin rango es `-1`**, que su propia condición
     *    (`ClosestTarget < 0 || ...`, :1841) convierte en «sin límite».
     * 2. **La distancia es 3D**, y el mod se molesta en decirlo:
     *    «*This is always going to use Length(), not Length2D()*» (:1829).
     *    Va de CENTRO a CENTRO, no de ojo a ojo.
     * 3. **Se le resta el tamaño del objetivo** si es un monstruo:
     *    `m_Width/2`, o `sqrt((w/2)² + (h/2)²)` si vuela (:1835-1837).
     * 4. **Deja un rastro que nadie espera**: `StoreEntity(pSighted,
     *    ENT_LASTSEEN)` (:1843). Y eso NO es decorado — el `say_job` de
     *    Sylphiel sigue con `setmovedest ent_lastseen 9999`, o sea que se
     *    gira hacia quien acaba de ver con este getter.
     *
     * Y una quinta que **el nombre de la variable dice al revés**, así que
     * va escrita aquí antes de que envejezca:
     *
     *     if (ClosestTarget < 0 || (flDistanceToTarget < ClosestTarget))
     *     {   StoreEntity(pSighted, ENT_LASTSEEN);
     *         ClosestTarget = flDistanceToTarget;   // se APRIETA
     *         fFoundTarget = true;   }
     *                                      npcscript.cpp:1838-1846
     *
     * `ClosestTarget` **no es un umbral fijo: se aprieta en cada vuelta**.
     * O sea que `$cansee(player,128)` no es «¿hay alguien a menos de 128?»
     * sino «recorre a los visibles y quédate con el más cercano», y cada
     * uno que pasa le baja el listón al siguiente. Por lo tanto
     * **`ent_lastseen` acaba siendo el visible MÁS CERCANO y no el último
     * visto**, a pesar de cómo se llama. Con un jugador da igual; con dos
     * en la taberna, Sylphiel se gira hacia el más cercano de los dos, y
     * eso se mide con dos navegadores. Aquí sólo hay un candidato posible
     * —el jugador—, así que el bucle no se recorre: **el apriete está
     * documentado y no portado**, y se dice en vez de fingirlo.
     *
     * Lo que se inyecta es SÓLO el rayo (`lineaDeVision`, el `FMVisible` de
     * :1824), porque el rayo vive en la física y aquí no hay física. La
     * aritmética se queda aquí, con sus citas al lado: llevarla al rayo
     * sería una segunda copia del `atof`, de la resta y del `ENT_LASTSEEN`,
     * y dos copias son dos mundos (el 63).
     *
     * **Sin `lineaDeVision` no se finge que se ve**: se apunta y da «0». Lo
     * que NO se porta y va dicho: la lista de enemigos (`m_hEnemyList`), que
     * es lo que hace que `$cansee(enemy,...)` y `$cansee(ally,...)` tengan
     * sentido; aquí sólo hay un objetivo posible, el jugador.
     */
    ve(nombre, rangoCrudo) {
      const quien = String(nombre ?? "").toLowerCase();
      // `atof` del motor, y la ausencia es -1: sin límite de distancia.
      const rango = rangoCrudo === undefined || rangoCrudo === null || String(rangoCrudo).trim() === ""
        ? -1 : numDe(rangoCrudo);
      if (quien !== "player" && !esElJugador(quien)) {
        apuntar?.("getter", `$cansee(${quien},…) — sólo el jugador`);
        return "0";
      }
      const p = personaje();
      /**
       * ── LAS DOS SALIDAS QUE AQUÍ ERAN UNA, Y LA CALLADA COSTÓ CARA ────
       *
       * Esto era `if (!p || (p.vida ?? 0) <= 0) return "0";`, sin apuntar
       * nada, y mezclaba dos cosas que no son la misma:
       *
       *   - **el objetivo está muerto**, que es la regla del motor
       *     («if (pSighted->pev->deadflag != DEAD_NO) continue;», :1792) y
       *     por lo tanto NO se apunta: es el juego funcionando;
       *   - **no hay nadie atado a este guion**, que no es una regla sino
       *     un hueco nuestro: el `jugador` lo rellena `pedirOpciones` al
       *     abrir el menú, y quien pregunte por otro camino encuentra
       *     `null`.
       *
       * Como las dos devolvían «0» en silencio, un `$cansee` que no se
       * podía contestar se leía exactamente igual que uno contestado que
       * no. Costó un diagnóstico entero **apuntando al archivo de otra
       * sesión**, y lo cazó la sesión de al lado instrumentando su rayo
       * para descubrir que su rayo no se llegaba a llamar. Es el cajón del
       * 63 —«el guion pide algo que no tenemos»— con la agravante de que
       * el apunte cuesta una línea.
       */
      if (!p) { apuntar?.("getter", "$cansee sin jugador atado al guion"); return "0"; }
      if ((p.vida ?? 0) <= 0) return "0";                 // :1792, la regla
      if (!lineaDeVision) { apuntar?.("getter", "$cansee sin rayo"); return "0"; }
      if (!lineaDeVision(jugador?.ref ?? "player")) return "0";
      // Sin rango declarado el motor no mide: ve y punto.
      if (rango < 0) { entorno.ultimoVisto = jugador?.ref ?? "player"; return "1"; }
      const a = vector(jugador?.origen), b = vector(npc?.origen);
      // Una distancia que no se puede calcular NO pasa el umbral. El 79: un
      // `NaN` colándose por un `<` fue dieciocho NPC saludando desde el otro
      // extremo del mapa. Se pregunta con `Number.isFinite`.
      if (!a || !b) { apuntar?.("getter", "$cansee sin sitios"); return "0"; }
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * (unidadesPorMetro || 39.37);
      if (!Number.isFinite(d)) { apuntar?.("getter", "$cansee con distancia no numérica"); return "0"; }
      // El objetivo es el jugador, que no es un `CMSMonster`: no hay resta de
      // tamaño. Con un NPC de objetivo habría que restar `m_Width/2` (:1835).
      if (!(d < rango)) return "0";
      // `StoreEntity(pSighted, ENT_LASTSEEN)` — :1843.
      entorno.ultimoVisto = jugador?.ref ?? "player";
      return "1";
    },

    // ── EL 44: LAS TIENDAS ─────────────────────────────────────────────────
    //
    // Éstas SÍ llegan: la tienda se crea, se llena con sus precios de verdad y
    // se puede leer. Lo que no hay es el panel que la enseña, así que
    // `ofrecerTienda` deja el resultado a mano —`ultimaOferta`— y avisa por la
    // consola. `src/play/tienda.js` tiene las reglas y sus citas.
    crearTienda(nombre) { tiendas.crear(nombre); },

    anadirALaTienda(nombre, objeto, opciones) {
      const t = tiendas.buscar(nombre);
      if (!t) return;                        // `if (NewStore)` — :787
      // EL CATÁLOGO ES UN `Map`, no `{ porId }` (60).
      //
      // Esta línea decía `catalogo?.porId?.get(objeto)`, y quien la llama le
      // pasa **el `Map`**: `catalogo: catalogoDeObjetos?.porId ?? null`
      // (`src/main.js`). Así que `catalogo.porId` era `undefined`, la ficha
      // salía `null` siempre y **ninguna tienda del juego tenía un solo
      // objeto** — en los dos mapas, desde el 44.
      //
      // Y no daba ningún error: caía en el `apuntar` de abajo, que es el
      // cajón de «el guion pide algo que no tenemos», y ahí se confundía con
      // los comandos que de verdad faltan. El 44 midió que el modelo funciona
      // y funcionaba; lo que nadie midió es que alguien lo llenara.
      //
      // Es la fila del 59 en el apartado 4 otra vez: la prueba construye el
      // argumento con la forma correcta y el llamador se equivoca. Por eso la
      // de ahora (`test/juego_comercio60.test.mjs`) pasa un `Map` de verdad.
      //
      // El resto del archivo ya lo trataba como `Map` —`nombreVisibleDe`
      // hace `catalogo?.get?.(clave)`—, o sea que la línea rara era ésta.
      const ficha = catalogo?.get?.(objeto) ?? null;
      // «non-existant item»: el motor se queja y NO añade nada (:820). Aquí se
      // apunta donde se apunta todo lo que el guion pide y no tenemos.
      if (!ficha) { apuntar?.("objeto de tienda", objeto); return; }
      t.anadir(ficha, opciones);
    },

    quitarDeLaTienda(nombre, { todo = false, objeto = null, apagar = false } = {}) {
      const t = tiendas.buscar(nombre);
      if (!t) return;
      if (apagar) { t.activa = false; return; }
      if (todo) { t.vaciar(); return; }
      if (objeto) t.quitar(objeto);
    },

    ofrecerTienda(nombre, { flags, retrollamada } = {}) {
      const p = personaje();
      const r = tiendas.ofrecer(nombre, {
        flags: flagsDe(flags),
        retrollamada,
        objetosDelJugador: p?.objetos?.length ?? 0,
        // `if (!HasConditions(MONSTER_TRADING))`, npcscript.cpp:875. Sin esto
        // el parámetro estaba portado y nadie lo ponía nunca a `true`: la
        // regla existía y no se ejecutaba.
        comerciando: trato?.ocupado?.() ?? false,
      });
      entorno.ultimaOferta = r;
      if (r.aviso) suceso?.("nopuedes", r.aviso);
      else if (r.que === "abre") {
        // El trato se marca ANTES de abrir el panel, como en el mod: `Offer`
        // pone las condiciones y luego manda los mensajes (store.cpp:77-88).
        trato?.abrir?.(retrollamada);
        // EL 60: Y AHORA SE ABRE. Hasta aquí esto imprimía «The vendor offers
        // N wares» por la consola, con este motivo escrito: «el panel de la
        // tienda no está portado; enseñar QUÉ habría dentro es mejor que
        // callarse». Ya está portado (`src/vgui/tienda.js`), así que se abre.
        //
        // `abrirTienda` se inyecta como todo lo que toca la pantalla: este
        // archivo no conoce el DOM. Si nadie la ha puesto —una prueba de
        // Node, el servidor— se sigue diciendo por la consola, que es mejor
        // que perder el aviso.
        const abierta = abrirTienda?.({
          tienda: r.tienda, flags: r.flags,
          vendedor: npc?.nombre ?? "The vendor",
        });
        if (!abierta) {
          suceso?.("bueno", `${npc?.nombre ?? "The vendor"} offers ${r.tienda.objetos.length} wares`);
        }
      }
      // La retrollamada la manda el motor con su sufijo ya puesto (:886-893).
      if (r.evento) llamarEvento?.(r.evento);
    },

    // ── EL 45: `$get_by_name` Y `deleteent` ────────────────────────────────
    //
    // Éstos llegan **a las áreas de aparición y a nada más**, y eso es a
    // propósito: es lo único con `targetname` que este puerto simula, y es
    // exactamente lo que el alcalde señala. Sin `entidades` puesto, el getter
    // devuelve «0» igual que en un mapa donde ese nombre no existe, que es lo
    // que hace el motor y no una excusa.

    /** `$get_by_name(<nombre>)` — script.cpp:1441. `netname` y luego `targetname`. */
    porNombre: (nombre) => entidades?.porNombre(nombre) ?? null,

    /**
     * `deleteent`/`deleteme` — scriptcmds.cpp:2872.
     *
     * `deleteme` es el NPC borrándose a sí mismo y aquí no se hace: un NPC que
     * desaparece de en medio de su propia conversación necesita que el menú
     * abierto se cierre, y eso es del `GuionDeNpc`, no de aquí. Se apunta.
     */
    borrarEntidad(ref, { modo = "delayed", segundos = null } = {}) {
      if (ref === null) { apuntar?.("comando", "deleteme"); return; }
      // «Don't allow a crash by deleting players» — :2879.
      if (esElJugador(ref)) return;
      const ent = entidades?.recuperar(ref) ?? null;
      // Un asa que no vale —caducada, o un nombre suelto que no es un asa— es
      // `RetrieveEntity` devolviendo NULL: el motor no hace nada y no avisa.
      if (!ent) return;
      // `fade` es `SUB_FadeOut`: no borra. Aquí no hay a qué desvanecer todavía.
      if (modo === "fade") { apuntar?.("comando", `deleteent ... fade${segundos === null ? "" : " <seg>"}`); return; }
      // `delayed` es `DelayedRemove()` sobre una entidad con guion, y las
      // nuestras no tienen. `remove` es `UTIL_Remove` y sí llega.
      if (modo !== "remove") { apuntar?.("comando", "deleteent <ent>"); return; }
      entidades.borrar(ref);
      borrarDelMundo?.(ent.nombre, ent);
    },

    // ── EL 46: EL ANDAMIAJE DE MENÚ ────────────────────────────────────────
    //
    // Éstos llegan de verdad, y era la condición para hacerlos: el menú del
    // vendedor y el del armero se construyen con `array.*` + `$get_arrayfind`
    // y se quitan opciones con `menuitem.remove`, así que sin esto el menú que
    // se ve es otro menú.

    /**
     * Las listas de OTRA entidad. Hoy **ninguna**: un guion que pase un asa
     * delante de `array.add` se encuentra con que no hay nadie más con listas,
     * y el motor en ese caso usa las suyas — que es lo mismo que devolver
     * `null` aquí. Ver `scriptcmds.cpp:1973`.
     */
    listasDe: () => null,

    /** Lo pone el propio `GuionDeNpc`, igual que `registrarOpcion`. */
    quitarOpcion: () => {},

    /**
     * `menu.open <jugador>`: el NPC abre su menú sin que le pulses. Aquí sólo
     * se anota que lo pidió — el panel lo abre la interfaz cuando la pulsas y
     * no hay camino de vuelta desde el guion hasta ella, que sería lo mismo
     * que el panel de la tienda del 44.
     */
    abrirMenu(aQuien) {
      if (!esElJugador(aQuien)) return;
      // Y la guarda del motor, con su silencio incluido: con la mochila llena
      // **no se abre y no se dice por qué** (npcscript.cpp:1026-1033, el aviso
      // está comentado en el original).
      if ((personaje()?.objetos?.length ?? 0) >= 50) return;
      entorno.menuPedido = true;
    },

    /**
     * `catchspeech <evento> <palabras...>`: qué dispara qué al hablarle por el
     * chat. Se guardan en `entorno.frases` desde el 43.
     *
     * ── CORRECCIÓN DEL 79 ────────────────────────────────────────────────
     *
     * Aquí ponía «**este puerto no tiene chat de texto**, así que nada las
     * dispara todavía». La primera mitad dejó de ser verdad en el **61**, con
     * los tres canales del chat, y nadie volvió a leer esta línea; la segunda
     * siguió siendo verdad **treinta y seis experimentos** por eso mismo. Es
     * exactamente el caso del 64, donde `helptip` y su ventana se esperaban el
     * uno al otro con un comentario diciendo que la ventana no existía.
     *
     * Ahora las dispara `GuionDeNpc.oir`, y el camino entero —quién oye, a qué
     * distancia y en qué orden— está en `src/play/oir.js`.
     */
    escuchar(evento, palabras) { entorno.frases.push({ evento, palabras }); },

    /** Las frases que el NPC escucha. `m_Phrases`, npcscript.cpp:702. */
    frases: [],

    /**
     * Los seis mensajes de colores. `ScriptCmd_Message`, scriptcmds.cpp:4243.
     * Van a la consola de sucesos con el tipo que más se le parece; el juego
     * los pinta con el color que dice su nombre y aquí hay tres tipos, no
     * seis, así que se agrupan y se dice cómo.
     */
    mensajeAlJugador(aQuien, texto, cual) {
      if (!esElJugador(aQuien)) return;
      // `consolemsg` va a la consola del jugador, que aquí no existe; el resto
      // al HUD de sucesos. Verde es «has ganado algo» (`bueno`), rojo y gris
      // son «no puedes», y los demás normales.
      const tipo = cual === "gplayermessage" ? "bueno"
        : (cual === "rplayermessage" || cual === "dplayermessage") ? "nopuedes"
          : "normal";
      suceso?.(tipo, texto);
    },

    /**
     * `helptip <player|all> <tipname> <title> <text...>`: el aviso de una sola
     * vez.
     *
     * EL 64: **ya llega**. Hasta aquí decía «NO llega — la ventana de consejos
     * no está portada», y la ventana SÍ estaba portada desde el 60: es la pila
     * de ayuda de `src/juego/mensajes.js`, arriba a la derecha y con el título
     * verde. Lo único que faltaba era esta línea. Quien no inyecte `consejo`
     * se queda como antes, apuntándolo como no soportado.
     */
    consejo(params) {
      if (!mandarConsejo) { apuntar?.("consejo", String(params?.[1] ?? "(sin clave)")); return; }
      // `all` va a todos y un nombre va a uno: scriptcmds.cpp:3612-3627.
      if (!esElJugador(params?.[0]) && String(params?.[0]) !== "all") return;
      mandarConsejo(params);
    },
  };
  // EL 92: `GuionDeNpc` resuelve el objetivo de un `dodamage` con la MISMA
  // regla que todo lo demás de este entorno; una segunda copia de «quién es
  // el jugador» sería otro mundo (el 63).
  entorno.esElJugador = esElJugador;
  /**
   * ── EL 93: LO QUE UN GUION LE PIDE A SU PROPIO CUERPO ──────────────────
   *
   * Sólo con `cuerpo` (los bichos de combate, `Manada.cuerpoDe`): sin él los
   * ganchos no existen y `guion.js` APUNTA el comando, que es como estaba. El
   * camino que los pide es el salto de la araña (spider.script:93-192), y cada
   * uno lleva la regla del motor que decide a quién toca:
   *
   *   `setvelocity`/`addvelocity` — `RetrieveEntity(Params[0])` y, si no está
   *       vivo, nada (`if (!pEntity->IsAlive()) abort_push`, scriptcmds.cpp:7203).
   *       Aquí sólo `ent_me`: empujar al JUGADOR desde el guion de un bicho
   *       (el jabalí, boar_base.script:93) es otra pieza y se apunta.
   *   `setorigin` — `pev->origin = StringToVec(...)` (:4518-4519), `ent_me`.
   *   `setfollow` — sigue al jugador o a nadie (:5976-5994).
   *   `gravity`, `movespeed`, `setanim.framerate`, `setidleanim` — del propio.
   */
  if (cuerpo) {
    const otro = (que, ref) => apuntar?.("comando", `${que} ${ref} (sólo ent_me)`);
    Object.assign(entorno, {
      velocidad(ref, v, { sumar = false } = {}) {
        if (!esYo(ref)) return otro(sumar ? "addvelocity" : "setvelocity", ref);
        if (!cuerpo.vivo()) return undefined;                       // :7203
        return cuerpo.velocidad(v, { sumar });
      },
      ponerOrigen(ref, v) {
        if (!esYo(ref)) return otro("setorigin", ref);
        return cuerpo.ponerOrigen(v);
      },
      seguir(ref, opciones = {}) {
        if (ref === null) return cuerpo.seguir(null);
        // `RetrieveEntity` que no encuentra a nadie: el motor no hace nada (:5980-5981).
        if (!esElJugador(ref)) { apuntar?.("comando", `setfollow ${ref} (sólo el jugador)`); return undefined; }
        return cuerpo.seguir(jugador?.ref ?? "player", opciones);
      },
      gravedad: (f) => cuerpo.gravedad(f),
      ritmoDeAndar: (f) => cuerpo.ritmoDeAndar(f),
      ritmoDeAnimacion: (f) => cuerpo.ritmoDeAnimacion(f),
      animacionDeParado: (n) => cuerpo.animacionDeParado(n),
      // `pev->angles` del bicho, en grados del motor: lo pide `$relvel`.
      angulosDeMi: () => cuerpo.angulos(),
    });
  }
  return entorno;
}

/**
 * Un NPC con guion, listo para que el menú le pregunte.
 *
 * Lo importante es que **el mismo objeto sirve para las dos mitades**: las
 * opciones salen de ejecutar `game_menu_getoptions` y elegir una ejecuta su
 * retrollamada sobre las MISMAS variables. En MSR eso es así porque el NPC es
 * una entidad con su `CScript` pegado, y las variables de la misión del
 * alcalde —`QUEST_GOBLINCHIEF`, `ZOMBIE_COUNT`— viven ahí mientras el mapa
 * está en pie.
 */
export class GuionDeNpc {
  /**
   * @param ficha  la entrada de `build/gatecity/guiones.json` para este script.
   * @param npc    `{ nombre, origen }`, para lo que el NPC dice y dónde está.
   */
  constructor({ ficha, npc = null, catalogo = null, suceso = null, animar = null, programar = null, azar = null,
    // El 60: `infomsg` va a la ventana de arriba a la izquierda y no a la
    // consola, y `npcstore.offer` abre un panel. Ver `entornoDe`.
    ventanaDeAviso = null, abrirTienda = null,
    // El 44: la lista de tiendas se comparte entre TODOS los NPC de la
    // partida, porque en el motor es estática y una tienda se busca por
    // nombre. Si cada NPC tuviera la suya, dos vendedores que usaran el mismo
    // `STORE_NAME` dejarían de pisarse — y en el juego SÍ se pisan.
    tiendas = undefined,
    // El 62: el trato con ESTE vendedor. Va aquí porque `entornoDe` no se
    // construye desde fuera: quien monta un NPC monta un `GuionDeNpc`, y lo
    // que esta clase no reenvíe se queda en su valor por omisión sin que nadie
    // lo note. Pasó: `trato` estaba escrito, probado y citado en `entornoDe`, y
    // esta línea no existía, así que `comerciando` era `false` SIEMPRE y
    // `trato.abrir` no se llamaba NUNCA. Ver el apartado 4 de CLAUDE.md.
    trato = null,
    // El 45: el registro de nombres del mapa y cómo se quita algo de él. Es
    // compartido por todos los NPC, como las tiendas y por el mismo motivo.
    entidades = null, borrarDelMundo = null,
    // El 79: `(texto, {desde}) => ...`, lo que pasa cuando habla EL JUGADOR.
    // Es de quien monta los NPC, porque hay que recorrer a los de alrededor y
    // esta clase no sabe dónde está nadie. Sin él, una opción `say` se apunta
    // como no soportada en vez de hacer como que habla.
    hablaElJugador = null,
    // El 81: el cableado entre NPC (`callexternal` a un vecino) y los dos
    // ganchos de `setmovedest`. Van reenviados DESDE AQUÍ a propósito: es
    // exactamente la línea que faltó con `trato` en el 62 y en el 63, y sin
    // ella el gancho vive a `null` en todas las partidas del juego con sus
    // pruebas en verde. Ver el apartado 4 de CLAUDE.md.
    guionDeOtro = null, todosLosGuiones = null,
    mandarADestino = null, animarAndando = null,
    // El 81: el rayo del `$cansee`. Ver `ve` en `entornoDe`.
    lineaDeVision = null, unidadesPorMetro = 39.37,
    // El 81. De dónde sale el sitio del jugador cuando NADIE ha abierto el
    // menú: hablando por el chat, `oir` no trae posición, y sin ella
    // `$cansee` no puede medir y dice que no. Es el agujero que destapó la
    // sonda del 81 con la misión bien.
    sitioDelJugador = null,
    // El 81/82: los cuatro de `game_postspawn`, tal como los hornea el 82:
    // `{titulo, dmgmulti, hpmulti, params}`, los cuatro en cadena. Sin esto
    // el evento no se llama, que es como estaba.
    nacer = null,
    // LOS EFECTOS: reenviado a `entornoDe` aquí abajo, por el 63.
    aplicarEfecto = null,
    // EL 91: la lista de eventos que la IA portada ya hace (`CIERRE_DE_BICHO`).
    // Sólo la llevan los bichos con ficha de combate; sin ella el guion es el
    // de siempre, el de un NPC al que se le habla. `nacimiento` dice de qué
    // vida del bicho es este guion: un área que lo vuelve a sacar crea una
    // entidad NUEVA en el motor (msmapents.cpp:1206-1230), y con ella un guion
    // nuevo.
    cierre = null, nacimiento = 0,
    // EL 93: el cuerpo del bicho (`Manada.cuerpoDe`), para lo que su guion le
    // pide a su propia entidad. Reenviado a `entornoDe` aquí abajo, por el 63.
    cuerpo = null,
    // EL 94: `(ref) => boolean`, el `npcatk_settarget` que pide OTRA entidad.
    // Ver `_objetivoPedidoDeFuera`. Sin él, la llamada se cierra como hasta el
    // 93 y se cuenta en `cerrados`.
    fijarObjetivo = null }) {
    this.npc = npc;
    this.fijarObjetivo = fijarObjetivo;
    /** EL 94: profundidad de llamadas que vienen de OTRO guion (`llamar`). */
    this.desdeFuera = 0;
    this.cuerpo = cuerpo;
    this.nacimiento = nacimiento;
    this.cierre = cierre ? new Set([...cierre].map((c) => (typeof c === "string" ? c : c.evento))) : null;
    /**
     * Lo que la costura ha hecho con este guion, para la sonda y las pruebas:
     * `recibidos` son los eventos del motor que le han llegado, `cerrados` las
     * llamadas a eventos de `CIERRE_DE_BICHO` que NO se ejecutaron, y
     * `absorbidos` lo que el guion pidió al cuerpo mientras corría un evento
     * de combate y no se hizo porque el cuerpo es de la IA (ver `absorbe`).
     */
    this.costuraCuenta = { recibidos: {}, cerrados: {}, absorbidos: {}, retirado: 0 };
    /** Profundidad de eventos de combate en curso. Ver `costura`. */
    this.enCostura = 0;
    this.retirado = false;
    this.hablaElJugador = hablaElJugador;
    this.catalogo = catalogo;
    this.opciones = [];
    this.jugador = null;
    this.suceso = suceso;
    // El entorno necesita saber a quién tiene delante, y eso cambia entre una
    // llamada y otra: se le da un hueco que este objeto rellena.
    const dueño = this;
    // EL 91: el cuerpo es de la IA mientras corre un evento de combate. Ver
    // `absorbe`. Fuera de la costura los dos ganchos pasan tal cual: un
    // `playanim once nod` del menú sigue moviendo la cabeza.
    const animarFiltrado = animar
      ? (nombre, modo) => (dueño.absorbe("animar", nombre) ? undefined : animar(nombre, modo))
      : null;
    const destinoFiltrado = mandarADestino
      ? (d, o) => (dueño.absorbe("setmovedest", d?.entidad ?? (d ? "punto" : "none")) ? false : mandarADestino(d, o))
      : null;
    // EL 93: `playanim break` también es del cuerpo, y la IA ya lo hace al
    // huir (`npcatk_flee`): dentro de la costura se absorbe como `animar`.
    // Los demás ganchos del cuerpo NO se absorben: lanzar, seguir o
    // teletransportar al bicho no lo hace la IA portada, así que no hay
    // segunda copia de nada que cerrar (ver `absorbe`).
    const cuerpoFiltrado = cuerpo
      ? { ...cuerpo, romper: () => (dueño.absorbe("animar", "break") ? undefined : cuerpo.romper()) }
      : null;
    this.entorno = entornoDe({
      npc, catalogo, suceso, animar: animarFiltrado, programar, azar, tiendas, entidades, borrarDelMundo,
      ventanaDeAviso, abrirTienda, trato,
      guionDeOtro, todosLosGuiones, mandarADestino: destinoFiltrado, animarAndando, lineaDeVision, unidadesPorMetro,
      aplicarEfecto, cuerpo: cuerpoFiltrado,
      // Las retrollamadas de la tienda (`<cb>_success` y compañía) son eventos
      // del propio guion, así que vuelven por aquí.
      llamarEvento: (nombre) => dueño.guion?.llamar(nombre, []),
      apuntar: (tipo, nombre) => dueño.guion?.anotarNoSoportado(tipo, nombre),
      jugador: {
        get ref() { return dueño.jugador?.ref ?? "player"; },
        get personaje() { return dueño.jugador?.personaje ?? null; },
        get origen() { return dueño.jugador?.origen ?? sitioDelJugador?.() ?? "0"; },
      },
    });
    this.entorno.registrarOpcion = (op) => dueño.anotar(op);
    // `menuitem.remove` — npcscript.cpp:1003. Por ID y **todas** las que
    // coincidan, que es lo que dice el comentario del motor.
    this.entorno.quitarOpcion = (id) => dueño.quitar(id);
    /**
     * `setstat <nombre> <v…>` EN UN MONSTRUO — npcscript.cpp:1305-1318. El 91.
     *
     *     if (!IsPlayer()) {
     *       if (msInputStatName == "parry")
     *         SetScriptVar("MONSTER_PARRY", atof(Params[1]));  }
     *
     * En un NPC SÓLO `parry` hace algo, y no toca ninguna estadística: pone la
     * variable que lee su propio `game_damaged`
     * (base_monster_shared.script:843). Lo destapó la costura: sin esto la
     * araña de Gate City (`setstat parry 50 0 0`) tenía `MONSTER_PARRY` sin
     * poner y su guion no tiraba nunca su dado de parry — o sea que el cierre
     * de `game_parry` no tenía nada que cerrar y su control salía verde vacío.
     *
     * El valor va por `SetVar(float)`, que lo escribe con `_gcvt(v, 10)`
     * (script.cpp:4785-4789): con MSVC eso da «50.» con el punto. Aquí se
     * escribe «50»; los dos usos que tiene —un `>` y un `$rand`— leen el
     * número y no la cadena, y la diferencia no se ha medido en Xash.
     */
    /**
     * `$get(ent_me,dmgmulti)` — `RETURN_FLOAT(pMonster->m_DMGMulti)`,
     * scriptcmds.cpp:1478, con el `"%.2f"` de `RETURN_FLOAT` (iscript.h:224).
     * El 91: es lo único que le faltaba al `game_dodamage` de
     * base_monster_shared (:1340, dentro de las ramas `NPC_DOT_*`) para correr
     * entero. `m_DMGMulti` sale del `dmgmulti` del mapa, que es el PARAM2 de
     * `game_postspawn` (msmonsterserver.cpp:286) y ya viene horneado en
     * `nacer`. Sólo para el propio NPC: de otra entidad este guion no sabe nada
     * y se sigue contestando «0», como antes.
     */
    this.entorno.propiedadesPropias = new Set(["dmgmulti"]);
    if (cuerpo) {
      // EL 93: `onground` lo contesta el cuerpo (ver `entornoDe`). Va aquí y no
      // en `PROPIEDADES` por lo mismo que `dmgmulti`: un NPC sin cuerpo tiene
      // que seguir apuntándola en vez de contestar «0» callado.
      this.entorno.propiedadesPropias.add("onground");
      // Y `game.monster.<prop>` es `$get(ent_me,<prop>)` (script.cpp:4692-4700):
      // sólo las que este entorno sabe contestar; el resto, `null`, y el
      // intérprete deja el nombre como estaba.
      this.entorno.propiedadDeMi = (prop) => (PROPIEDADES.has(prop) || dueño.entorno.propiedadesPropias.has(prop)
        ? dueño.entorno.propiedad("ent_me", prop) : null);
    }
    /**
     * ── EL 94: `name.full` DEL PROPIO NPC ─────────────────────────────────
     *
     * `SPEECH::NPCName(pMonster)` (scriptcmds.cpp:1475): el prefijo, un
     * espacio y el nombre, o el nombre a secas si no hay prefijo
     * (syntax.cpp:32-49). El prefijo es lo que va antes de la barra en
     * `name a|Goblin` (scriptcmds.cpp:4384-4388), y la ficha horneada guarda
     * el `name` CRUDO, con la barra («|Kendra»).
     *
     * Lo pide la muerte en cuanto `ent_laststruck` se resuelve (el 94):
     * `local MON_FULL game.monster.name.full` y `gplayermessage
     * $get(ent_laststruck,id) "You've slain " MON_FULL` (base_npc.script:
     * 192-197). Sin esto salía «You've slain game.monster.name.full», que es
     * justo la frase falsa que el 91 dejó escrita para no abrir esa puerta.
     * Por eso va para TODOS los NPC y no sólo los que tienen cuerpo: el
     * aldeano no tiene, y es el primero que muere con su `game_death` entero.
     */
    const nombreCompleto = () => {
      const crudo = String(npc?.nombre ?? "");
      const barra = crudo.indexOf("|");
      if (barra < 0) return crudo;
      const prefijo = crudo.slice(0, barra), nombre = crudo.slice(barra + 1);
      return prefijo ? `${prefijo} ${nombre}` : nombre;
    };
    this.entorno.propiedadesPropias.add("name.full");
    if (!this.entorno.propiedadDeMi) this.entorno.propiedadDeMi = (prop) => (prop === "name.full" ? nombreCompleto() : null);
    const propiedadBase = this.entorno.propiedad;
    this.entorno.propiedad = (ref, prop, resto) => {
      if (String(prop) === "dmgmulti") {
        return String(ref) === "ent_me" ? numDe(nacer?.dmgmulti ?? "1").toFixed(2) : "0";
      }
      if (String(prop) === "name.full") return String(ref) === "ent_me" ? nombreCompleto() : "0";
      return propiedadBase(ref, prop, resto);
    };
    this.entorno.ponerEstadistica = (nombre, valores = []) => {
      if (String(nombre) !== "parry") return;
      dueño.guion?.vars?.set("MONSTER_PARRY", String(numDe(valores[0])));
    };
    /**
     * ── EL 92: EL `dodamage` DE UN BICHO ──────────────────────────────────
     *
     * El intérprete parte el comando (`leerDano`, guion.js) y lo trae aquí;
     * esto resuelve A QUIÉN apunta el primer parámetro con `esElJugador` —la
     * misma regla del resto del entorno— y se lo pasa a `alHacerDano`, que
     * pone quien sabe dónde está cada uno: `Manada._golpeDelGuion`, enchufado
     * por la costura SÓLO mientras corre un evento de animación
     * (`InteraccionesNpc`, caso `animacion`).
     *
     * Fuera de un evento de animación —un `dodamage` desde un `callevent`
     * con retraso, o desde `npc_targetsighted`— no hay quien lo haga y se
     * apunta: el `=> {}` callado es donde vive una regla muerta (el 66).
     *
     * Sólo para los bichos con cierre (ficha de combate). Un NPC al que se le
     * habla sigue sin gancho de daño, como hasta el 91.
     */
    if (this.cierre) {
      this.alHacerDano = null;
      this.danoCuenta = { pedidos: 0, sinGancho: 0, ultimo: null };
      this.entorno.hacerDano = (d) => {
        dueño.danoCuenta.pedidos++;
        if (!dueño.alHacerDano) {
          dueño.danoCuenta.sinGancho++;
          dueño.guion?.anotarNoSoportado("comando", `${d.comando} fuera de un evento de animación`);
          return;
        }
        // En la directa y en la traza el primer parámetro es una entidad
        // (`RetrieveEntity(Params[0])`, npcscript.cpp:1133 y :1186); en las
        // otras dos es un punto y no apunta a nadie.
        const alJugador = (d.forma === "traza" || d.forma === "directo") && dueño.entorno.esElJugador(d.objetivo);
        dueño.danoCuenta.ultimo = { comando: d.comando, forma: d.forma, objetivo: d.objetivo, alJugador };
        dueño.alHacerDano({ ...d, alJugador });
      };
    }
    this.guion = new Guion({
      eventos: ficha?.eventos ?? [],
      preload: ficha?.preload ?? [],
      entorno: this.entorno,
      nombre: npc?.script ?? "",
    });
    /**
     * ── EL 91: EL CIERRE, PUESTO ANTES DE NACER ──────────────────────────
     *
     * Se tapa `llamar` EN LA INSTANCIA, y no en la clase, porque es por donde
     * pasan las tres maneras de llegar a un evento, las tres dentro del
     * `case "callevent"` de guion.js: el `callevent` sin retardo
     * (`this.llamar`), el que lleva retardo (lo programa con `this.llamar`
     * dentro) y el `calleventloop`. Va antes del
     * bloque sin nombre porque `npc_spawn` ya arranca el bucle de caza
     * (`callevent NPC_SPAWN_PRED2 npcatk_hunt`, base_npc_attack_new.script:148).
     *
     * Devuelve si el evento EXISTE aunque no lo corra: así un `callevent` a un
     * cerrado no se apunta además como «evento que no existe», que sería
     * contar dos veces lo mismo y con la etiqueta equivocada.
     *
     * Y un guion RETIRADO —el de una vida anterior del bicho— no corre nada:
     * sus eventos con retardo siguen en el reloj compartido y vencerán, pero
     * la entidad que los pidió ya no existe en el motor.
     */
    if (this.cierre) {
      const deVerdad = this.guion.llamar.bind(this.guion);
      this._llamarDeVerdad = deVerdad;
      const g = this.guion;
      g.llamar = (nombre, params = []) => {
        if (dueño.retirado) { dueño.costuraCuenta.retirado++; return false; }
        if (dueño.cierre.has(nombre)) {
          if (nombre === "npcatk_settarget" && dueño._objetivoPedidoDeFuera(params)) return true;
          const c = dueño.costuraCuenta.cerrados;
          c[nombre] = (c[nombre] ?? 0) + 1;
          return g.eventos.some((e) => e.nombre === nombre);
        }
        return deVerdad(nombre, params);
      };
      /**
       * Los eventos con `repeatdelay` que este guion trae y que NO corren.
       * No es cosa del cierre: ningún guion de NPC arma sus repeticiones en
       * este puerto (sólo el jugador, los efectos y los objetos llaman a
       * `armarRepeticiones`). Se cuenta aquí para que se vea en el bicho.
       *
       * ── CORRECCIÓN DEL 93 ─────────────────────────────────────────────
       * Ya corren: ver `armarRepeticionesDeBicho`, al final del constructor.
       * Esto se queda como la cuenta de cuántos TRAE, que es lo que decía.
       */
      this.repeticionesSinArmar = (ficha?.eventos ?? []).filter((e) => repeticionDe(e) !== null).length;
    }
    // ── EL BLOQUE SIN NOMBRE SE EJECUTA ENTERO, Y ANTES (60) ─────────────
    //
    // Un `{ ... }` sin nombre de evento no es sólo una lista de constantes:
    // el motor lo registra como un evento **programado para ya**.
    //
    //     if (Name.len()) Event.Name = Name;
    //     else            Event.fNextExecutionTime = 0;
    //                                             script.cpp:5198-5202
    //
    // O sea que corre en el primer `Think`, con el intérprete entero detrás.
    // Aquí sólo se leían sus `const` y `setvar` (el `preload`), y eso deja
    // fuera el modismo con el que las plantillas ponen sus valores por
    // omisión:
    //
    //     if( STORE_BUYMENU equals 'STORE_BUYMENU' ) setvard STORE_BUYMENU 1
    //                              monsters/base_npc_vendor.script:27
    //
    // «una variable que resuelve a su propio nombre no existe» — el mismo
    // `isnot 'X'` del guion del jugador que ya estaba portado en el 47. Sin
    // ejecutarlo, `STORE_BUYMENU` se quedaba vacío y **todos los vendedores
    // ofrecían «2. Sell» y ningún «1. Buy»**, que es como se encontró.
    //
    // Va ANTES de `game_spawn` porque el motor lo programa al cargar y
    // `game_spawn` llega con la entidad, y porque los valores por omisión
    // tienen que estar puestos antes de que nadie los lea.
    this.guion.llamar("", []);
    /**
     * Los DOS eventos de nacer, en el orden del motor:
     *
     *     CallScriptEvent("spawn");      //old
     *     CallScriptEvent("game_spawn"); //not called by players
     *                                            global.cpp:435-437
     *
     * El 81: `spawn` —el viejo— faltaba. No se notaba porque hasta el 81
     * **ningún bloque con `eventname` tenía nombre**, así que corría igual
     * como bloque anónimo; en cuanto la forma larga empezó a funcionar, los
     * dos guiones de Edana que lo usan (`urdauf`, `sumdale`) se quedaron sin
     * nacer. Un arreglo puede dejar al descubierto lo que tapaba.
     *
     * `npc_spawn` NO se llama desde aquí y es correcto: lo llama el guion,
     * con `callevent npc_spawn` dentro del `game_spawn` de `base_npc`
     * (monsters/base_npc.script:24).
     */
    this.guion.llamar("spawn", []);
    this.guion.llamar("game_spawn", []);
    /**
     * **`game_postspawn`, y sus cuatro parámetros en ORDEN** — el 81, con el
     * horneado del 82.
     *
     *     Parameters.add(m_title);                      // :285 -> PARAM1
     *     Parameters.add(FloatToString(m_DMGMulti));    // :286 -> PARAM2
     *     Parameters.add(FloatToString(m_HPMulti));     // :287 -> PARAM3
     *     Parameters.add(m_addparams);                  // :288 -> PARAM4
     *     CallScriptEvent("game_postspawn", &Parameters);  // :290
     *                                      msmonsterserver.cpp:284-290
     *
     * Y el guion lo confirma por su cuenta: «PARAM1 = (name|default),
     * PARAM2 = DmgMulti, PARAM3 = HPMulti, PARAM4 = pass_params»
     * (monsters/base_self_adjust.script:12). O sea que **`params` es el
     * ÚLTIMO**, y es el canal que el 78 dejó apuntado como «sin portar»:
     * resulta que no estaba sin portar, es que no se podía cargar.
     *
     * Los valores de reposo son del motor y son cadenas CONCRETAS —título
     * vacío es `"default"` y params vacío es `"none"` (:273-280)—, no `null`
     * ni `""`. Importa: el guion pregunta `if ( PARAM4 isnot 'none' )`
     * (:45), y con `""` esa condición es cierta y entrarían al reparto las
     * 6 880 criaturas del juego con una lista vacía. Por eso, sin horneado,
     * aquí se manda `none` y no se omite la llamada.
     *
     * Los multiplicadores llegan con dos decimales porque el motor los pasa
     * por `UTIL_VarArgs("%.2f", a)` (sharedutil.h:49): el guion lee `"1.00"`
     * y no `"1"`, y «limpiarlo» rompería cualquier `equals`.
     */
    this.guion.llamar("game_postspawn", [
      String(nacer?.titulo ?? "default"),
      String(nacer?.dmgmulti ?? "1.00"),
      String(nacer?.hpmulti ?? "1.00"),
      String(nacer?.params ?? "none"),
    ]);
    // EL 93: y los `repeatdelay`, que en el motor corren desde que se CARGA el
    // guion (script.cpp:5377-5382). Sólo los bichos de combate y sólo con reloj.
    this.repeticiones = { armadas: 0, cerradas: 0, vueltas: {} };
    if (this.cierre && programar) this.armarRepeticionesDeBicho(programar);
  }

  /**
   * **LOS `repeatdelay` DE UN BICHO, ARMADOS** — el 93.
   *
   * Un evento con `repeatdelay` empieza a correr en cuanto se carga el guion,
   * sin que nadie lo llame (script.cpp:5377-5382, ver `armarRepeticiones` en
   * guion.js), y al ejecutarse vuelve a armarse (scriptcmds.cpp:5121-5136).
   * Hasta el 92 ningún guion de NPC lo hacía (el 91, §5.8). El salto de la
   * araña de Gate City vive en uno: `repeatdelay 4` con un 20 % por vuelta
   * (spider.script:93-117).
   *
   * El reloj es el `RelojDeGuiones` de la partida —el mismo de los `callevent`
   * con retraso— y la vuelta es `Guion.correrRepeticion`, la misma que la del
   * jugador: dos copias serían dos reglas.
   *
   * **EL CIERRE MANDA AQUÍ TAMBIÉN** (el 91): un evento con nombre que esté en
   * `CIERRE_DE_BICHO` no se arma —es `hunting_mode_go`, el bucle de caza de
   * la familia vieja (base_npc_attack.script:62-63), que la IA ya lleva—, y se
   * cuenta en `costuraCuenta.cerrados` como cualquier llamada cerrada. Los
   * bloques SIN nombre no pueden estar en el cierre y corren: el del salto,
   * el gruñido de la araña (spider_base.script:21-28), el estirarse de la rata
   * (giantrat.script:76-83)…
   *
   * Un guion retirado (otra vida del bicho) deja de volver a armarse.
   */
  armarRepeticionesDeBicho(programar) {
    const g = this.guion;
    g.armarRepeticiones(0);
    const cuenta = this.repeticiones;
    for (const r of g.repeticiones) {
      const nombre = r.evento.nombre;
      if (nombre && this.cierre.has(nombre)) {
        cuenta.cerradas++;
        const c = this.costuraCuenta.cerrados;
        c[nombre] = (c[nombre] ?? 0) + 1;
        continue;
      }
      cuenta.armadas++;
      const clave = nombre || `(sin nombre, línea ${r.evento.linea ?? "?"})`;
      const vuelta = () => {
        if (this.retirado) { this.costuraCuenta.retirado++; return; }
        cuenta.vueltas[clave] = (cuenta.vueltas[clave] ?? 0) + 1;
        const cada = g.correrRepeticion(r, 0);
        programar(cada, vuelta);
      };
      programar(r.cada, vuelta);
    }
  }

  /**
   * **A QUIÉN CAZA LA IA, ESCRITO DONDE LO LEE EL GUION** — el 93.
   *
   * `apuntarObjetivo` (el 92) lo escribe al ATACAR. Pero el salto de la araña
   * se decide antes, persiguiendo: pide `IS_HUNTING` y `HUNT_LASTTARGET`
   * (spider.script:97, :102), que en la familia vieja escribe
   * `npcatk_targetvalidate` al fijar objetivo —`setvard IS_HUNTING 1`
   * (base_npc_attack.script:546)— y `npcatk_clear_targets` al perderlo
   * —`IS_HUNTING 0`, `HUNT_LASTTARGET ¯NONE¯`, `NPCATK_TARGET unset`
   * (:567-570)—. Los dos están cerrados (el 91), así que la costura escribe lo
   * mismo cuando el `Cazador` fija o suelta su objetivo (`Manada.cazar`).
   *
   * Sólo la familia vieja: la nueva (`npcatk_hunt`) no usa `IS_HUNTING` y no
   * se ha medido qué escribe al soltar.
   */
  cazando(ref) {
    const g = this.guion;
    if (!g || !this.maneja("hunting_mode_go")) return false;
    if (ref) {
      this.apuntarObjetivo(ref);
      g.vars.set("IS_HUNTING", "1");
    } else {
      g.vars.set("IS_HUNTING", "0");
      g.vars.set("HUNT_LASTTARGET", "¯NONE¯");
      g.vars.set("NPCATK_TARGET", "unset");
    }
    return true;
  }

  /**
   * **¿DEJA EL GUION CAZAR Y ATACAR?** — el 93.
   *
   * El bucle de caza de la familia vieja no hace nada sin `CAN_HUNT`
   * (base_npc_attack.script:73) y no ataca sin `CAN_ATTACK` (:175). La IA
   * portada ES ese bucle, así que tiene que leer las mismas dos variables: el
   * salto de la araña las pone a 0 mientras dura (spider.script:112-113) y a 1
   * al acabar (:180-181). Sin esto la IA la seguía persiguiendo y mordiendo
   * en el aire.
   *
   * Sólo cuenta una variable PUESTA a cero: sin poner vale su nombre, y en el
   * motor eso también es 0 — pero `base_npc_attack.script:815-817` las pone a
   * 1 al nacer, así que un «sin poner» aquí es un hueco nuestro y no se
   * convierte en un bicho que no caza. Y un cero de nacimiento tampoco: ver
   * dentro.
   */
  puede() {
    const g = this.guion;
    if (!g || this.retirado || !this.maneja("hunting_mode_go")) return { cazar: true, atacar: true };
    /*
     * Y SÓLO UN CERO QUE VIENE DESPUÉS DE UN UNO — esto NO es del motor, y va
     * dicho. Hay bichos que NACEN con `CAN_HUNT 0` y esperan un evento que la
     * IA portada no dispara: el murciélago se cuelga del techo al nacer
     * (`bat_hang`, bat_base.script:28 y :42) y sólo baja con
     * `npc_targetsighted` o `npc_heardenemy` (:45-51). Respetar ese cero
     * dejaría a los 16 de las cloacas colgados para siempre, que es peor que
     * hoy (cazan sin bajar). Así que el cero cuenta cuando el guion lo ha
     * puesto DESPUÉS de haberlo tenido a 1 en esta vida: el salto de la araña
     * (spider.script:112-113 tras base_npc_attack.script:815-817).
     */
    const ve = (n) => {
      if (!g.vars.has(n)) return true;
      const uno = enteroDe(g.vars.get(n)) !== 0;
      if (uno) (this._visto1 ??= new Set()).add(n);
      return uno || !this._visto1?.has(n);
    };
    return { cazar: ve("CAN_HUNT"), atacar: ve("CAN_ATTACK") };
  }

  /**
   * **UN EVENTO DE COMBATE DEL MOTOR, A ESTE GUION** — el 91.
   *
   * Lo llama la costura (`InteraccionesNpc.alCombate`) desde los sitios donde
   * la IA portada ya ha decidido el golpe, con los parámetros del motor. Pasa
   * POR ENCIMA del cierre a propósito: `game_parry` está cerrado para la
   * llamada que el guion se haría a sí mismo con su propio dado, y abierto
   * para la que hace la costura cuando el dado de la IA dice que para.
   *
   * Mientras corre, `enCostura` está arriba y el guion no mueve el cuerpo:
   * ver `absorbe`.
   *
   * @returns si el guion tenía algún bloque con ese nombre.
   */
  costura(evento, params = []) {
    if (this.retirado) { this.costuraCuenta.retirado++; return false; }
    const r = this.costuraCuenta.recibidos;
    r[evento] = (r[evento] ?? 0) + 1;
    const llamar = this._llamarDeVerdad ?? ((n, p) => this.guion.llamar(n, p));
    this.enCostura++;
    try { return llamar(String(evento), params.map(String)); }
    finally { this.enCostura--; }
  }

  /**
   * **EL CUERPO ES DE LA IA** mientras corre un evento de combate — el 91.
   *
   * Medido: al recibir `game_death` los catorce guiones de combate piden
   * `playanim critical ANIM_DEATH` (base_npc.script:185), que `Manada.matar`
   * ya pone con `deUnaVez`; repetirlo rebobina la muerte. Y el zombi, al
   * recibir `game_struck`, pide `playanim break` y un `setmovedest` para huir,
   * que son de `reaccionAlGolpe`. Lo que el guion pida AL CUERPO dentro de la
   * costura se cuenta aquí y no se hace. Lo demás —variables, sonidos que se
   * apuntan, mensajes, `applyeffect`— corre entero.
   *
   * @returns `true` si lo ha absorbido (y entonces quien llama no lo hace).
   */
  absorbe(tipo, que) {
    if (!this.cierre || this.enCostura <= 0) return false;
    // EL 93: mientras el cuerpo lo lleva el GUION —la araña en el aire o
    // agarrada al jugador, `Manada.cuerpoDe(i).manda()`— la IA no lo mueve, y
    // lo que el guion pida desde un evento de combate es lo único que lo
    // mueve: `npc_struck` -> `spider_latch_drop` -> `playanim critical
    // falloff` (spider.script:164-172, :194-198). Absorberlo dejaría a la
    // araña agarrada sin animación de caer y sin `frame_falloffend`, o sea
    // con `CAN_HUNT 0` para siempre.
    if (this.cuerpo?.manda?.()) return false;
    const a = this.costuraCuenta.absorbidos;
    const k = `${tipo} ${que ?? ""}`.trim();
    a[k] = (a[k] ?? 0) + 1;
    return true;
  }

  /**
   * ¿Tiene este guion una de las dos plantillas de caza? La vieja define
   * `hunting_mode_go` (base_npc_attack.script:62) y la nueva `npcatk_hunt`
   * (base_npc_attack_new.script:230). Un NPC al que se le habla, ninguna.
   */
  familiaDeCaza() {
    if (this.maneja("hunting_mode_go")) return "vieja";
    if (this.maneja("npcatk_hunt")) return "nueva";
    return null;
  }

  /**
   * **`npc_targetsighted`, CON EL OBJETIVO A LA VISTA** — el 98.
   *
   * Lo llaman las dos bases en cada ciclo de caza en que ven a su objetivo
   * (base_npc_attack.script:118-120 y, al fijarlo, :154-155;
   * base_npc_attack_new.script:303-307). El parámetro es el objetivo, y antes
   * de llamarlo la caza ya ha escrito quién es (`apuntarObjetivo`, lo mismo
   * que escribe al atacar) y su `$cansee` ha guardado `ent_lastseen`.
   *
   * Es por donde embiste el jabalí (boar_base.script:114-124) y por donde
   * hacen otras cosas otros guiones: el grito de guerra del goblin
   * (goblin.script:98-106), el escupitajo de lejos de la araña escupidora
   * (spider_spitting.script:104-111), el murciélago que se descuelga
   * (bat_base.script:46)… Lo que pidan AL CUERPO dentro —un `playanim`, un
   * `setmovedest`— se lo queda la IA (`absorbe`), como en todo evento de
   * combate; las variables, los `movespeed` y los efectos corren enteros.
   *
   * @returns si el guion tenía el evento.
   */
  visto(ref) {
    if (!this.guion || this.retirado || !this.familiaDeCaza()) return false;
    this.apuntarObjetivo(ref);
    return this.costura("npc_targetsighted", [String(ref)]);
  }

  /**
   * **¿CON QUÉ ANIMACIÓN ATACA?** — el 98. `callevent npc_selectattack` y el
   * valor de `ANIM_ATTACK` después (base_npc_attack.script:212-215;
   * base_npc_attack_new.script:617-619). `null` sin plantilla de caza o sin
   * la variable puesta: entonces manda la horneada.
   */
  eligeAtaque() {
    if (!this.guion || this.retirado || !this.familiaDeCaza()) return null;
    this.costura("npc_selectattack", []);
    return this.animDe("ANIM_ATTACK");
  }

  /** `callevent npc_attack` tras el `playanim` — SÓLO la vieja (base_npc_attack.script:217). */
  atacado() {
    if (!this.guion || this.retirado || this.familiaDeCaza() !== "vieja") return false;
    return this.costura("npc_attack", []);
  }

  /** El valor de una variable de animación del guion ahora, o `null`. */
  animDe(variable) {
    const v = this.guion?.vars?.get(String(variable));
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    // Sin poner vale su propio nombre (el `isnot 'X'` del 47): no es una animación.
    return s && s !== String(variable) ? s : null;
  }

  /** EL 92: ¿tiene este guion algún bloque con ese nombre? (`CallScriptEvent` sobre uno que no existe no hace nada.) */
  maneja(evento) {
    return (this.guion?.eventos ?? []).some((e) => e.nombre === String(evento));
  }

  /**
   * **A QUIÉN ATACA LA IA, ESCRITO DONDE LO LEE EL GUION** — el 92.
   *
   * En el motor estas variables las escriben los eventos de caza que la
   * costura del 91 cierra, así que sin esto un `dodamage NPCATK_TARGET …`
   * apunta a la cadena «unset» y no pega a nadie. Se escribe lo mismo que
   * escribirían ellos, y SÓLO en un guion con una de las dos plantillas de
   * caza (la de un NPC al que se le habla no las tiene). Las DOS familias
   * escriben las TRES variables, cada una a su manera:
   *
   *   nueva  `NPCATK_TARGET` (base_npc_attack_new.script:445) y de ahí
   *          `HUNT_LASTTARGET` y `ENTITY_ENEMY` (:508-509, «backwards
   *          compatibility»)
   *   vieja  `HUNT_LASTTARGET` (base_npc_attack.script:594) y de ahí
   *          `NPCATK_TARGET` y `ENTITY_ENEMY` (:525-526 y :595, «forward
   *          compat»)
   *
   * y `ent_lastseen` es el `$cansee(enemy)` de la caza, que lo guarda con
   * `StoreEntity(…, ENT_LASTSEEN)` (npcscript.cpp:1844;
   * base_npc_attack_new.script:240, base_npc_attack.script:131).
   *
   * Se hace al decidir el ataque y no antes: es cuando la IA sabe a quién.
   *
   * Lo escribí primero por familias —`NPCATK_TARGET` sólo en la nueva— y la
   * prueba de la rata lo desmintió: la vieja también lo escribe.
   */
  apuntarObjetivo(ref) {
    const g = this.guion;
    if (!g) return;
    const r = String(ref);
    // La familia se reconoce por el bucle de caza que DEFINE: `npcatk_hunt`
    // la nueva (base_npc_attack_new.script:230) y `hunting_mode_go` la vieja
    // (base_npc_attack.script:62). `npcatk_settarget` NO sirve: la vieja
    // también lo tiene, «forward compatibility» (base_npc_attack.script:737),
    // y base_monster_shared otro (:1058).
    if (this.maneja("npcatk_hunt") || this.maneja("hunting_mode_go")) {
      g.vars.set("NPCATK_TARGET", r);
      g.vars.set("HUNT_LASTTARGET", r);
      g.vars.set("ENTITY_ENEMY", r);
    }
    this.entorno.ultimoVisto = r;
  }

  /**
   * **EL `npcatk_settarget` QUE PIDE OTRA ENTIDAD** — el 94.
   *
   * El cierre del 91 dice «elegir objetivo lo hace `Cazador.apuntarA`/`tic`»,
   * y es verdad para las llamadas que el bicho se hace a sí mismo: su caza
   * (`npcatk_hunt`), su `game_struck`, su `npc_targetsighted`. Todas tienen
   * su copia portada en la IA. Lo que la IA NO sabe es lo que le cuenta OTRO
   * guion, y el caso es el guardia:
   *
   *     { [server] civilian_attacked     gatecity/guard.script:105-124
   *       ...
   *       if NPCATK_TARGET equals unset
   *       setvard NO_STUCK_CHECKS 0
   *       callevent npcatk_settarget PARAM1
   *       if $cansee(NPCATK_TARGET)
   *       saytextrange 1024 ... saytext Hey you! Leave him alone!
   *
   * que llega por `callexternal all civilian_attacked` desde el aldeano
   * (monsters/base_civilian.script:15 y :20). Con la llamada cerrada el
   * guardia decía la frase —no: ni eso, porque `NPCATK_TARGET` seguía
   * «unset» y `$cansee(unset)` abandona el bloque— y la IA no se enteraba.
   *
   * Así que la regla es: **cerrado dentro de la costura, abierto cuando viene
   * de fuera**. «De fuera» es `desdeFuera > 0` —la llamada entró por
   * `GuionDeNpc.llamar`, que es por donde llegan `callexternal` y el
   * `ms_npcscript`— y `enCostura === 0` —no está corriendo un evento de
   * combate del propio bicho, donde la IA ya ha decidido—.
   *
   * Lo que hace es lo que harían las líneas que importan del evento cerrado
   * (base_npc_attack_new.script:399-510), con sus dos guardas y sin el resto:
   *
   *   - `if !IS_FLEEING` (:403): quien huye no cambia de objetivo. Lo mira
   *     quien inyecta `fijarObjetivo` (el cazador sabe si huye).
   *   - ignorar aliados (`$get(PARAM1,relationship,ent_me) equals ally`,
   *     :420). También allí: la relación es de la ficha.
   *   - `setvard NPCATK_TARGET CHECK_TARGET` (:445) y las dos de
   *     compatibilidad (:508-509): `apuntarObjetivo`, la misma que usa la
   *     costura al atacar.
   *
   * NO porta `npcatk_targetvalidate` (:447, `npc_targetvalidate` en cada
   * guion) ni el `cycle_up` (:470): el primero no lo tiene el guardia y el
   * segundo es el reloj de la IA, que `Cazador.apuntarA` ya pone a cero.
   *
   * @returns si lo ha hecho. `false` y la llamada se cierra como antes.
   */
  _objetivoPedidoDeFuera(params = []) {
    if (!this.fijarObjetivo || this.desdeFuera <= 0 || this.enCostura > 0) return false;
    // `local CHECK_TARGET $get(PARAM1,id)` (:404): el asa tal cual llega.
    const ref = String(params?.[0] ?? "");
    if (!ref || ref === "0") return false;
    if (!this.fijarObjetivo(ref)) return false;
    this.apuntarObjetivo(ref);
    const c = (this.costuraCuenta.deFuera ??= {});
    c.npcatk_settarget = (c.npcatk_settarget ?? 0) + 1;
    return true;
  }

  /**
   * El guion de una vida anterior del bicho deja de correr. `revivir` en el
   * puerto es una entidad NUEVA en el motor (`CREATE_ENT` + `Spawn`,
   * msmapents.cpp:1206-1230): sus variables, su botín y sus relojes no pasan.
   */
  retirar() { this.retirado = true; }

  /** `menuitem.register` — npcscript.cpp:940, con su orden por prioridad. */
  anotar(op) {
    const nuevo = { ...op, silencioso: String(op.tipo).toLowerCase() === "payment_silent" };
    if (nuevo.silencioso) nuevo.tipo = "payment";
    // «Scoot all the items with lower priority down the line»: se inserta ANTES
    // del primero con prioridad MENOR, o sea que con todas a cero se queda el
    // orden de registro. npcscript.cpp:980-999.
    const i = this.opciones.findIndex((o) => nuevo.prioridad > o.prioridad);
    if (i >= 0) this.opciones.splice(i, 0, nuevo); else this.opciones.push(nuevo);
    return nuevo;
  }

  /**
   * `menuitem.remove <id>` — npcscript.cpp:1003-1013.
   *
   * Por **ID**, no por título, y **todas** las que coincidan: el bucle del
   * motor es `Menuoptions.erase(i--)` y lo comenta —«Erase _all_ with this
   * name»—. Quitar sólo la primera dejaría medio menú puesto, que es
   * exactamente lo que hace `base_storage` al cambiar de pantalla.
   */
  quitar(id) {
    const antes = this.opciones.length;
    this.opciones = this.opciones.filter((o) => String(o.id) !== String(id));
    return antes - this.opciones.length;
  }

  /**
   * Lo que el servidor contesta a `getmenuoptions`: se ejecuta el evento y se
   * devuelve lo que haya quedado registrado. msmonsterserver.cpp:2884-2911.
   */
  pedirOpciones({ personaje, ref = "player", origen = undefined } = {}) {
    // ── EL 95: SIN `origen`, LA POSICIÓN SE LEE VIVA ─────────────────────
    //
    // Aquí ponía `origen = "0"` por omisión, y NADIE lo pasa (`interacciones.pedir`
    // da `{personaje, ref}`). Así que abrir el menú de un NPC le dejaba al
    // jugador clavado en «0», que el getter de `jugador.origen` prefiere a
    // `sitioDelJugador` (un «0» no es `null`), y desde ese momento todo lo que
    // mide distancias contra el jugador en ESE guion —`$cansee(player,128)`,
    // `$get(ent_lastspoke,range)`— salía «sin sitios». Medido con Sylphiel:
    // abrir su menú, cerrarlo y pedirle trabajo por el chat dejaba el
    // `say_job` (edana/barwench.script:126-137) abandonado en su `$cansee`, o sea
    // la misión de la sidra muda para quien hablara con ella primero por la F.
    // El parámetro con valor por omisión del 62, otra vez (doc/RED_95.md §5).
    this.jugador = { personaje, ref, origen };
    // `m_MenuCurrentOptions` se pone a la lista de ESTE jugador antes de llamar
    // y a `NULL` después (:2893): fuera del evento, `menuitem.register` no hace
    // nada. Aquí eso es vaciar la lista antes de cada pregunta.
    this.opciones = [];
    this.entorno.menuPedido = false;
    this.guion.llamar("game_menu_getoptions", [ref]);
    return this.opciones;
  }

  /**
   * `CallScriptEvent(<nombre>)` a secas, para el `ms_npcscript` — el 67.
   *
   *     pMonster->CallScriptEvent(STRING(m_sEventName));   npcact.cpp:203
   *
   * **SIN PARÁMETROS, y no es un olvido:** el motor no le pasa ninguno, ni el
   * jugador que disparó la escena. Los eventos que hay detrás de esto en Edana
   * —`bookfound`, `cider2`, `evidence_found`, `trig_boarsdead`— están escritos
   * para eso y usan las variables del propio NPC o las globales del juego; el
   * que pida un jugador se encontrará su `PARAM1` sin poner, igual que en el
   * original. Pasarle el jugador «para que funcione» sería inventarse otro
   * Master Sword.
   *
   * Va aparte de `pedirOpciones` y de `elegir` porque no toca la lista de
   * opciones ni el contexto del jugador: el mapa está dando una orden, no hay
   * nadie hablando.
   */
  llamar(evento, params = []) {
    // EL 94: lo que entra por aquí lo pide otra entidad. Ver `_objetivoPedidoDeFuera`.
    this.desdeFuera++;
    try { return this.guion.llamar(String(evento), params.map(String)); }
    finally { this.desdeFuera--; }
  }

  /** `CMSMonster::UseMenuOption(pPlayer, Option)`. */
  elegir(indice, { personaje, ref = "player" } = {}) {
    this.jugador = { ...(this.jugador ?? {}), personaje, ref };
    const guion = this.guion;
    const dueñoDelMenu = this;
    const hablaElJugador = this.hablaElJugador;
    return usarOpcion({
      opciones: this.opciones,
      indice,
      personaje,
      refJugador: ref,
      nombreVisible: (clave, cuantos) => nombreVisibleDe(this.catalogo, clave, cuantos),
      npc: {
        llamar: (evento, params) => guion.llamar(evento, params),
        /**
         * `pPlayer->Speak(MenuOption.Data, SPEECH_LOCAL)` — :2937.
         *
         * ── LO QUE ESTO HACÍA MAL, Y SON DOS COSAS (79) ─────────────────
         *
         * Llamaba a `this.entorno.hablar`, que es el `saytext` **del NPC**.
         * Así que elegir «Say Hello» en el menú de Edrin imprimía
         *
         *     Edrin, Captain of the Guard says,  "Hello"
         *
         * —las palabras del jugador bajo el nombre del capitán— y, lo que es
         * peor, **no las oía nadie**: una opción `say` sin retrollamada, que
         * es lo que son casi todas, no hacía absolutamente nada.
         *
         * Habla el jugador, y hablar es llegar a los oídos de alrededor. Esta
         * clase no sabe dónde está nadie, así que el gancho se inyecta: quien
         * monta los NPC es quien puede recorrerlos. Sin inyectarlo se apunta
         * como no soportado en vez de quedarse callado — un `=> {}` de relleno
         * en un gancho es donde el 66 encontró viviendo una regla muerta.
         */
        hablarJugador: (texto) => {
          if (hablaElJugador) return hablaElJugador(texto, { desde: dueñoDelMenu });
          dueñoDelMenu.guion?.anotarNoSoportado?.("say", "sin nadie que oiga");
          return null;
        },
        // `SendEventMsg(HUDEVENT_UNABLE, ...)`: el gris del «no puedes».
        avisar: (tipo, texto) => this.suceso?.(tipo, texto),
      },
    });
  }

  /**
   * **ESTE NPC OYE HABLAR A UN JUGADOR** — experimento 79.
   *
   * Las dos puertas de `CMSMonster::Speak`, en su orden y con su cita:
   *
   *     //MiB DEC2007a
   *     if (SpeechType == SPEECH_LOCAL && IsPlayer() && pEnt->IsMSMonster())
   *     {   StoreEntity(this, ENT_LASTSPOKE);
   *         Params.add(strutil::stripBadChars(pszSentence));
   *         Params.add(EntToString(this));
   *         ((CMSMonster*)pEnt)->CallScriptEvent("game_heardtext", &Params); }
   *
   *     //This has to be called after the text msgs are sent out
   *     if (SpeechType == SPEECH_LOCAL && IsPlayer() && pEnt->IsMSMonster())
   *         ((CMSMonster*)pEnt)->HearPhrase(this, pszSentence);
   *                                       msmonsterserver.cpp:1729-1744
   *
   * `game_heardtext` le llega a **todos** los de alrededor, tengan frases o
   * no; `HearPhrase` sólo dispara en el que tenga una que encaje. Son dos
   * mecanismos y no uno: un guion puede escuchar todo lo que se dice sin
   * declarar una sola palabra — lo usa `base_chat_array` para sus
   * conversaciones.
   *
   * Quién está en rango y si está vivo lo decide quien llama: aquí no hay
   * geometría. Ver `alcanceDeVoz` en `src/play/oir.js`.
   *
   * @param texto  lo que ha dicho el jugador.
   * @param quien  su referencia de entidad, para `ent_lastspoke` y `PARAM2`.
   * @returns      `{heardtext, evento, palabra, ratio}` — qué ha pasado, para
   *               que una sonda pueda distinguir «no me oyó» de «me oyó y no
   *               tenía nada que decir».
   */
  oir(texto, { quien = "player", personaje = null, ref = null } = {}) {
    // EL ORDEN IMPORTA: `stripBadChars` limpia el original, así que las dos
    // puertas ven el texto YA limpio. Ver `limpiarTexto` en `oir.js`.
    const dicho = limpiarTexto(String(texto ?? ""));
    const bitacora = { heardtext: false, evento: null, palabra: null, ratio: 0 };
    if (!dicho) return bitacora;

    // `StoreEntity(this, ENT_LASTSPOKE)`: quién fue el último que le habló.
    // Aquí no hay nada que guardar en un registro aparte, porque `esElJugador`
    // resuelve `ent_lastspoke` contra el jugador en curso desde el 45
    // (`npcguion.js`, la lista de referencias) — y el jugador en curso es
    // justo el que acaba de hablar. Lo que sí hay que hacer es apuntarlo, que
    // es lo que le dice al guion de quién son los `$get(...)` de ahora.
    this.jugador = { ...(this.jugador ?? {}), personaje, ref: ref ?? quien };

    // PRIMERO el `game_heardtext`, con sus dos parámetros y en su orden.
    this.guion.llamar("game_heardtext", [dicho, quien]);
    bitacora.heardtext = true;

    // Y DESPUÉS la frase, que es lo que el mod deja dicho con un comentario.
    const r = oirFrase(this.entorno.frases, dicho);
    if (!r) return bitacora;
    Object.assign(bitacora, { evento: r.evento, palabra: r.palabra, ratio: r.ratio });
    // `CallScriptEvent(BestPhrase->ScriptEvent)` — y **sin parámetros**, que
    // es por lo que `sumdale.script` comprueba `if ( PARAM1 equals 'PARAM1' )`
    // para saber si le han hablado o si le ha llamado otro guion.
    this.guion.llamar(r.evento, []);
    return bitacora;
  }

  /** Lo que el guion se ha encontrado y no sabe hacer. Para la sonda. */
  get noSoportados() { return this.guion.noSoportados; }
}

export { GLOBALES };
