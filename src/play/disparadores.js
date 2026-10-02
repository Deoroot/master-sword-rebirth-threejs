// EL BUS DE DISPARADORES DE GOLDSRC: `target`, `targetname` y quién llama a quién.
//
// Hasta aquí cada cosa del mapa que hacía algo lo hacía por su cuenta: el agua
// moja, la puerta gira, la zona de daño mata. Lo que faltaba es el **cableado**
// —una entidad que nombra a otra y la usa— que es la mitad de cómo se programa
// un mapa de Half-Life y de lo que Master Sword hereda entero.
//
// Esto es puro: no toca el DOM, ni Three, ni el reloj. El tiempo y el dado
// **se inyectan**, por la razón del experimento 28 (dos jugadores tienen que
// ver lo mismo) y la del 47 (dos horneados tienen que dar lo mismo).
//
// ── Las dos piezas ────────────────────────────────────────────────────────
//
//   `FireTargets(nombre, ...)`     busca TODAS las entidades cuyo `targetname`
//                                  sea ése y llama a su `Use`. (subs.cpp:203)
//   `SUB_UseTargets(...)`          lo de arriba, con el `delay` y el
//                                  `killtarget` de quien dispara. (subs.cpp:240)
//
// ── Y HAY DOS `SUB_UseTargets`, Y UNA ESTÁ ROTA ───────────────────────────
//
// No son virtuales (`cbase.h:507` y `cbase.h:732`), así que **decide el tipo
// estático de quien la llama**. La de `CBaseDelay` está bien. La de
// `CBaseEntity` es ésta, entera:
//
//     // subs.cpp:191-202
//     void CBaseEntity::SUB_UseTargets(CBaseEntity *pActivator, USE_TYPE useType, float value)
//     {
//         //Thothie OCT2007a
//         //- if (!FStringNull(pev->target)) does not seem to stop null events firing
//         if (!pev->target)
//         {
//             FireTargets(STRING(pev->target), pActivator, this, useType, value);
//         }
//     }
//
// `pev->target` es un `string_t`, o sea un entero. `!pev->target` es cierto
// **sólo cuando NO hay objetivo**, y entonces dispara la cadena vacía, de la
// que `FireTargets` sale en la primera línea. O sea: **no dispara nunca**.
// Arreglando un problema de eventos nulos se invirtió la condición.
//
// De las entidades que hay en Gate City y en Edana, la única que baja por ahí
// es `multisource` (`CMultiSource : CPointEntity : CBaseEntity`, y su `Use`
// llama a `SUB_UseTargets` en `buttons.cpp:211`). Todas las demás derivan de
// `CBaseDelay` y usan la buena. Se porta con el fallo, que es la regla de la
// casa: ver `MULTISOURCE_ROTO`.
//
// ── Qué NO está aquí ──────────────────────────────────────────────────────
//
// Las puertas (`src/play/puertas.js`), el agua y las zonas
// (`src/play/volumenes.js`) y el daño ya estaban y siguen donde están. Esto
// les añade el cable: ahora se les puede disparar y ellas pueden disparar.
//
// ── Y LO QUE NO SE PORTA, con la cuenta de a quién afecta HOY ─────────────
//
// El 68 enseñó que una lista de «esto no se porta» envejece con el primer mapa
// nuevo y nadie la vuelve a leer. Así que ésta no dice sólo qué falta: dice **a
// cuántas entidades de los dos mapas les toca**, que es el número que cambia
// cuando llegue un mapa que sí lo use.
//
//   `SF_BREAK_TOUCH` (2) y `SF_BREAK_PRESSURE` (4), o sea romper un
//   `func_breakable` corriendo contra él o de pie encima
//   (`BreakTouch`, func_break.cpp:438-479). **5 entidades, todas de Gate City**
//   —las cajas de `material 8` y `health 1`— y 0 de Edana. No se escribe la
//   regla: hace falta la velocidad del jugador y saber que está ENCIMA, y una
//   regla que nada puede llamar es peor que un hueco contado (el 62). Las cinco
//   se rompen igual a golpes, que es el otro camino que sí tienen.
//
//   `spawnobject`, que en este mod está muerto de origen: la asignación está
//   comentada y la clave se le pasa a `CBaseDelay::KeyValue`, que no la conoce
//   (func_break.cpp:115-121). **0 entidades** en los dos mapas, y aunque la
//   trajeran no harían nada en el juego original tampoco.
//
//   `container` de `msitem_spawn`, meter el objeto en la mochila de otro
//   (gispawn.cpp:64-83). **0 entidades** en los dos mapas.
//
//   `CBaseDoor::Blocked` (doors.cpp:725-805), o sea qué pasa si trabas una
//   puerta DESLIZANTE. El 70 lo dejó fuera después de medir a quién le tocaría,
//   y la cuenta es **cero de las tres de Edana**: `sewer_door` y `sewerbeam`
//   traen `wait -1`, y con espera negativa el motor **no invierte** —*«if a
//   door has a negative wait, it would never come back if blocked, so let it
//   just squash the object to death real fast»* (doors.cpp:740-741)— además de
//   que las dos traen `dmg 0`. Y `door1`, que sí invertiría y aplasta con
//   `dmg 50000`, **no la puede abrir nadie**: tiene `targetname` (así que no se
//   toca, doors.cpp:533-538) y no hay una sola entidad del mapa que la apunte.
//   Las rotatorias sí lo tienen portado, en `src/play/puertas.js`, porque a
//   ésas el jugador sí las pone en marcha y la hoja le barre encima.
//
//   `netname` de una puerta, el «disparo de cierre» del extremo contrario
//   (doors.cpp:671 y :722). **0 entidades** en los dos mapas.
//
//   Las puertas ENLAZADAS: en el motor, dos `func_door` que se tocan se mueven
//   como una, y `Blocked` para a todas las que comparten `targetname`
//   (doors.cpp:762-804). Las tres de Edana tienen nombres distintos, así que
//   **0 pares**. En las rotatorias sí hay uno —las dos hojas de `door2`—, y ahí
//   el enlace sale solo porque el disparo va por nombre y las coge a las dos.

/** `USE_TYPE`, `cbase.h:103-109`. El 2 es PONER y el 3 ALTERNAR, no al revés. */
export const USO = Object.freeze({ APAGAR: 0, ENCENDER: 1, PONER: 2, ALTERNAR: 3 });

/**
 * `triggerstate` -> `USE_TYPE`, y **no es la identidad**: `triggers.cpp:219-233`
 *
 *     case 0: USE_OFF;  case 2: USE_TOGGLE;  default: USE_ON;
 *
 * O sea que un `triggerstate 2` es ALTERNAR (3) y un `triggerstate 1` —o
 * cualquier otro número— es ENCENDER. Copiar el número tal cual daría PONER,
 * que es otra cosa.
 */
export function usoDeTriggerstate(v) {
  const n = Number(v);
  if (n === 0) return USO.APAGAR;
  if (n === 2) return USO.ALTERNAR;
  return USO.ENCENDER;
}

/**
 * `UTIL_StripToken`: corta en la primera almohadilla. `util.cpp:2012-2022`.
 *
 * Es lo que deja a un `multi_manager` disparar dos veces el mismo objetivo con
 * dos retrasos: las claves de una entidad son únicas, así que se escribe
 * `pstartl` y `pstartl#1`.
 */
export function sinAlmohadilla(clave) {
  const s = String(clave ?? "");
  const i = s.indexOf("#");
  return i < 0 ? s : s.slice(0, i);
}

/**
 * Los campos de `entvars_t`, `util.cpp:209-319`, en minúsculas.
 *
 * Hacen falta **aquí** y no sólo en el extractor por una razón concreta: el
 * `multi_manager` convierte en OBJETIVO toda clave que no reconozca
 * (`triggers.cpp:357-370`), y quién la reconoce antes es `EntvarsKeyvalue`
 * (`util.cpp:2345`, y compara **sin distinguir mayúsculas**). Si esta lista se
 * queda corta, un `multi_manager` se inventa objetivos con nombres como
 * «origin»; si se pasa, se come objetivos de verdad.
 *
 * Lo que NO está y sorprende: **`style`, `wait`, `delay` y `killtarget`**. Los
 * tres últimos los atiende el propio `CMultiManager::KeyValue` o `CBaseDelay`,
 * pero `CMultiManager::KeyValue` **no llama a su base**, así que en un
 * `multi_manager` un `delay` o un `killtarget` serían objetivos. Ninguno de
 * los dos mapas lo hace; queda dicho.
 */
export const ENTVARS = new Set([
  "absmax", "absmin", "aiment", "air_finished", "angles", "animtime", "armortype",
  "armorvalue", "avelocity", "basevelocity", "blending", "body", "button", "chain",
  "classname", "colormap", "controller", "deadflag", "dmg", "dmg_inflictor",
  "dmg_save", "dmg_take", "dmgtime", "effects", "enemy", "fixangle", "flags",
  "frags", "frame", "framerate", "friction", "globalname", "gravity",
  "groundentity", "health", "ideal_yaw", "idealpitch", "impulse", "light_level",
  "ltime", "max_health", "maxs", "message", "mins", "model", "modelindex",
  "movedir", "movetype", "netname", "nextthink", "noise", "noise1", "noise2",
  "noise3", "oldorigin", "origin", "owner", "pain_finished", "pitch_speed",
  "punchangle", "radsuit_finished", "renderamt", "rendercolor", "renderfx",
  "rendermode", "scale", "sequence", "size", "skin", "solid", "spawnflags",
  "speed", "takedamage", "target", "targetname", "team", "teleport_time",
  "v_angle", "velocity", "view_ofs", "viewmodel", "waterlevel", "watertype",
  "weaponmodel", "weapons", "yaw_speed",
]);

/** Las claves que un `multi_manager` se queda para sí. `triggers.cpp:346-355`. */
export const CLAVES_DEL_MANAGER = new Set(["wait", "random"]);

/**
 * Los objetivos de un `multi_manager`, ya ordenados por retraso.
 *
 * El orden importa y no es el del archivo: el motor los ordena con una burbuja
 * (`triggers.cpp:374-395`) que es **estable**, así que dos objetivos con el
 * mismo retraso salen en el orden en que estaban escritos. `Array.sort` de V8
 * también es estable, pero se hace explícito porque de eso depende cuál de los
 * dos `pstartl@3` de Edana va primero.
 */
export function objetivosDeManager(claves) {
  const fuera = [];
  for (const [k, v] of claves) {
    const bajo = String(k).toLowerCase();
    if (ENTVARS.has(bajo) || CLAVES_DEL_MANAGER.has(bajo)) continue;
    if (fuera.length >= MAX_OBJETIVOS_DE_MANAGER) break;
    fuera.push({ nombre: sinAlmohadilla(k), retraso: Number(v) || 0, orden: fuera.length });
  }
  fuera.sort((a, b) => (a.retraso - b.retraso) || (a.orden - b.orden));
  return fuera.map(({ nombre, retraso }) => ({ nombre, retraso }));
}

/** `MAX_MULTI_TARGETS`. Pasado ese número, el motor **descarta en silencio**. */
export const MAX_OBJETIVOS_DE_MANAGER = 16;

/** Banderas de `spawnflags`, `util.h:484-486` y `triggers.cpp:29-34`. */
export const SF = Object.freeze({
  PERMITE_MONSTRUOS: 1,      // SF_TRIGGER_ALLOWMONSTERS
  SIN_CLIENTES: 2,           // SF_TRIGGER_NOCLIENTS
  EMPUJABLES: 4,             // SF_TRIGGER_PUSHABLES
  RELAY_UNA_VEZ: 1,          // SF_RELAY_FIREONCE
  MANAGER_HILO: 1,           // SF_MULTIMAN_THREAD
  EMPUJE_UNA_VEZ: 1,         // SF_TRIG_PUSH_ONCE
  EMPUJE_APAGADO: 2,         // SF_TRIGGER_PUSH_START_OFF
  RENDER_SIN_FX: 1,          // SF_RENDER_MASKFX
  RENDER_SIN_CANTIDAD: 2,    // SF_RENDER_MASKAMT
  RENDER_SIN_MODO: 4,        // SF_RENDER_MASKMODE
  RENDER_SIN_COLOR: 8,       // SF_RENDER_MASKCOLOR
});

/**
 * Las banderas de `func_breakable` (el 69), `util.h:489-492`.
 *
 * Van aparte de `SF` porque los números CHOCAN con los de arriba: el 1 de un
 * rompible es «sólo por disparo» y el 1 de un relé es «una sola vez». Meterlas
 * en la misma tabla habría dado un rompible que se rompe al tocarlo porque
 * alguien escribió `SF.RELAY_UNA_VEZ`.
 */
export const SF_ROMPER = Object.freeze({
  SOLO_DISPARO: 1,   // SF_BREAK_TRIGGER_ONLY: no acepta daño
  AL_CHOCAR: 2,      // SF_BREAK_TOUCH: se rompe corriendo contra él
  AL_PISAR: 4,       // SF_BREAK_PRESSURE: se rompe de pie encima
  PALANCA: 256,      // SF_BREAK_CROWBAR: de un golpe, saltándose la vida
});

/**
 * Las de `func_button`, `buttons.cpp:27-31`. Y la última tiene el nombre al
 * revés Y el comentario equivocado en el propio mod: se llama `TOUCH_ONLY`, su
 * comentario dice *«button only fires as a result of USE key»*, y lo que hace el
 * código es **poner el toque** y quitar el uso (buttons.cpp:539-547). El botón
 * de Edana no la trae, así que es de usar.
 */
export const SF_BOTON = Object.freeze({
  NO_SE_MUEVE: 1,    // SF_BUTTON_DONTMOVE
  ALTERNA: 32,       // SF_BUTTON_TOGGLE
  CHISPEA: 64,       // SF_BUTTON_SPARK_IF_OFF
  POR_TOQUE: 256,    // SF_BUTTON_TOUCH_ONLY
});

/**
 * `CMultiSource::Use` baja por la `SUB_UseTargets` rota, así que **nunca
 * dispara su `target`**. Ver la cabecera. Esta constante existe para que el
 * fallo esté nombrado, contado y probado, y no parezca un olvido nuestro.
 */
export const MULTISOURCE_ROTO = true;

const esCierto = (v) => Boolean(Number(v));

/** Las dos formas de escribir la misma clase. `msmapents.cpp:1320-1321`. */
export const ES_AREA = new Set(["msarea_monsterspawn", "ms_monsterspawn"]);

/**
 * LAS DOS PUERTAS, y son la MISMA clase de C++ (el 70).
 *
 * `LINK_ENTITY_TO_CLASS(func_door, CBaseDoor)` y
 * `LINK_ENTITY_TO_CLASS(func_door_rotating, CRotDoor)` (doors.cpp:268 y :852),
 * y `CRotDoor` declara DOS métodos, `Spawn` y `SetToggleState`
 * (doors.cpp:845-850): el ciclo entero —`Use`, `DoorActivate`, `DoorGoUp`,
 * `DoorHitTop`, `DoorGoDown`— es heredado y es uno. De hecho `DoorGoUp`
 * pregunta `FClassnameIs(pev, "func_door_rotating")` en mitad del método para
 * decidir si gira o si desliza (doors.cpp:608 y :690).
 *
 * Aquí manda lo mismo para el CABLEADO: las dos aceptan un disparo con la misma
 * regla. Lo que NO se reparte igual es el reloj, y conviene decir por qué.
 *
 * El ciclo de las rotatorias vive en `src/play/puertas.js` desde el 48, con su
 * `Blocked` portado —una hoja que gira te barre encima y sin eso te empotra— y
 * su lado de apertura. Traérselo aquí sería tener **dos máquinas de estados
 * para la misma puerta**, que es literalmente la costura donde este proyecto se
 * equivoca (el 63, tres veces). Así que un disparo a una rotatoria sale por
 * `salidas` y lo sirve quien ya la mueve; el de una deslizante se sirve aquí,
 * porque de las deslizantes no había nada.
 *
 * Lo que se pierde con ese reparto, medido: `DoorHitTop` dispara el `target` de
 * la puerta al llegar arriba, y eso las rotatorias no lo hacen todavía. Le toca
 * a **0 de las 16** de los dos mapas — ninguna trae `target`. El día que una lo
 * traiga, la línea que falta es una llamada a `_puertaLlega` desde el reloj de
 * `puertas.js`.
 */
export const ES_PUERTA = new Set(["func_door", "func_door_rotating"]);

/** Las que además lleva el reloj de este módulo. Ver arriba. */
export const ES_CORREDERA = new Set(["func_door"]);

/**
 * EL BUS.
 *
 * `lista` es lo que hornea el extractor: una entidad por elemento, con sus
 * claves ya leídas. `reloj()` da el tiempo del juego en segundos y `azar()` un
 * número en [0,1).
 */
export class Disparadores {
  constructor(lista = [], { reloj = () => 0, azar = Math.random } = {}) {
    this.reloj = reloj;
    this.azar = azar;
    /** Lo que el mundo tiene que hacer y este módulo no puede. Se vacía con `recoger()`. */
    this.salidas = [];
    /** Cuántas veces se ha disparado cada nombre. Para medir, no para jugar. */
    this.cuenta = new Map();
    this.pendientes = [];      // los `DelayedUse`
    this.entidades = lista.map((e, i) => ({
      ...e,
      i,
      vivo: true,
      // El estado de ejecución, aparte de los datos del mapa.
      est: {
        proximoPensar: -1,     // `pev->nextthink`, el enfriamiento
        indice: 0,             // multi_manager: por qué objetivo va
        inicio: 0,             // multi_manager: cuándo empezó
        usable: true,          // multi_manager: `SetUse(NULL)` mientras corre
        indiceTele: 0,         // trigger_teleport: cicla, no sortea
        ultimoDisparo: 0,      // trigger_teleport: `flLastTriggeredTime`
        encendidas: new Map(), // multisource: qué entradas están puestas
        objetivo: e.objetivo ?? null,  // `pev->target` CAMBIA: trigger_changetarget
        despierta: false,      // msarea_monsterspawn: `didfirstspawn`
        // `m_fActive` al nacer: `if (!m_fSpawnOnTrigger) m_fActive = true`
        // (msmapents.cpp:740-748). Depende de `spawntrigger` y **no de cómo se
        // llame la clase**: `msarea_monsterspawn` y `ms_monsterspawn` son la
        // misma (msmapents.cpp:1320-1321). Aquí puse el nombre en vez de la
        // bandera y los siete `ms_monsterspawn` de Gate City nacían apagados,
        // así que aceptaban un disparo que el motor ignora. Lo cazó seguir la
        // cadena del barril, no una prueba.
        activa: ES_AREA.has(e.clase) ? !e.porDisparo : false,
        // `ms_counter`: `m_cTriggersLeft`. El dos por omisión lo resuelve el
        // extractor, que es donde nace la entidad (`triggers.cpp:1655`).
        quedan: Number(e.cuenta ?? 0) || 0,
        // multi_manager con `SF_MULTIMAN_THREAD`: los clones (el 67).
        esClon: false,
        origen: -1,
        // EL 69. La vida de un `func_breakable`, que SÍ se resta
        // (`pev->health -= flDamage`, func_break.cpp:575). En un `func_button`
        // esta misma clave no es vida: ver `_boton`.
        vida: Number(e.vida ?? 0),
        roto: false,
        seLlamaba: null,       // cómo se llamaba antes de que `Die` le quitara el nombre
        // `m_toggle_state` del botón, reducido a lo que Edana usa: el suyo no
        // se mueve (`SF_BUTTON_DONTMOVE`), así que sólo hay abajo y arriba.
        pulsado: false,
        // `msitem_spawn`: cuántas veces ha soltado su objeto. `Use` no lleva
        // cuenta ni tope —`SpawnItem()` y nada más, gispawn.cpp:23-26— así que
        // esto es para medir, no para frenarlo.
        soltados: 0,
        // EL 70: `m_toggle_state` de una puerta. Nace ABAJO siempre, también
        // con `SF_DOOR_START_OPEN` — el motor la coloca en la otra punta y
        // luego **intercambia las dos posiciones** (doors.cpp:302-310), así que
        // el estado sigue siendo `TS_AT_BOTTOM` y lo que cambia es dónde cae
        // ese «abajo». Quien dibuja lo resuelve dando la vuelta a la fracción;
        // aquí no hay caso especial, que es lo que hace el motor.
        puerta: "abajo",
        puertaDesde: 0,        // la fracción en que arrancó este tramo
        puertaHasta: 0,        // a la que va
        puertaInicio: 0,
        puertaFin: 0,
        puertaPiensa: -1,      // cuándo se cierra sola; −1 es «no vuelve»
        puertaActivador: null, // `m_hActivator`, que es quien dispara al llegar
        puertaVueltas: 0,      // cuántas veces ha llegado arriba. Para medir.
      },
    }));
    this.porNombreCache = new Map();
    for (const e of this.entidades) {
      if (!e.nombre) continue;
      if (!this.porNombreCache.has(e.nombre)) this.porNombreCache.set(e.nombre, []);
      this.porNombreCache.get(e.nombre).push(e);
    }
    this._registrarMultisources();
  }

  /**
   * `CMultiSource::Register`, `buttons.cpp:241-270` (el 68).
   *
   *   pentTarget = FIND_ENTITY_BY_STRING(NULL, "target", STRING(pev->targetname));
   *   while (!FNullEnt(pentTarget) && (m_iTotal < MS_MAX_TARGETS)) { ... }
   *
   * O sea: **mis entradas son quien me APUNTA**, al revés de todo lo demás en este
   * módulo. Un `multisource` no declara sus entradas; las descubre mirando quién
   * lo tiene de `target`. En el motor es un `Think` a los 0,1 s del arranque
   * (`SetThink(&Register)`, :170) y por eso existe `SF_MULTI_INIT`: hasta que ese
   * pensamiento corre, `IsTriggered` devuelve 0 pase lo que pase (:224-226). Aquí
   * el mundo entero ya está en la lista cuando se construye, así que se hace de
   * una vez y no hace falta la bandera.
   *
   * **Sin esto el `multisource` estaba portado en dos mitades y no corría ninguna:**
   * `entradas` se leía en `IsTriggered` y en `Use` y no se escribía en ningún
   * sitio, así que la reja estaba SIEMPRE ABIERTA —«sin entradas está abierto», que
   * es del motor— y a la vez su `Use` rechazaba a todo el mundo por no ser miembro.
   * Dos huecos que se tapaban el uno al otro: el que mira la reja la ve bien, y el
   * que dispara ve un aviso que nadie leía. Es la forma del 64 —dos piezas
   * esperándose— con el agravante de que las dos estaban escritas y citadas.
   *
   * Lo cazó seguir la cadena de los jabalíes de Edana hasta el final, no una prueba.
   */
  _registrarMultisources() {
    for (const e of this.entidades) {
      if (e.clase !== "multisource" || !e.nombre) continue;
      // La pertenencia es por ENTIDAD, así que se guardan índices y no nombres:
      // dos relés distintos con el mismo `target` son dos entradas distintas.
      e.entradas = this.entidades
        .filter((q) => q !== e && q.objetivo === e.nombre)
        .map((q) => q.i);
    }
  }

  get n() { return this.entidades.length; }

  /** Vacía la bandeja de efectos y la devuelve. */
  recoger() { const s = this.salidas; this.salidas = []; return s; }

  /**
   * TODAS las entidades con ese `targetname`, en el orden del archivo.
   *
   * «Todas» y no «la primera»: `FireTargets` recorre el bucle entero
   * (`subs.cpp:222-234`), y de eso depende que los tres `templerats` de Edana
   * —hay dos áreas con el mismo nombre— reciban el disparo los dos.
   */
  porNombre(nombre) {
    if (!nombre) return [];
    return (this.porNombreCache.get(nombre) ?? []).filter((e) => e.vivo);
  }

  /**
   * `UTIL_IsMasterTriggered`, `util.cpp:1481-1499`. Sin maestro, pasa.
   *
   * Y con maestro también pasa, salvo en un caso: sólo mira **la PRIMERA**
   * entidad con ese nombre —un solo `FIND_ENTITY_BY_TARGETNAME(NULL, ...)`, sin
   * bucle— y sólo la obedece si esa primera es de las que llevan `FCAP_MASTER`.
   * Si no lo es, el motor escribe «Master was null or not a master!» y
   * **devuelve 1**: un `master` mal escrito no cierra nada, lo deja abierto.
   */
  maestroAbierto(nombre, activador) {
    if (!nombre) return true;
    const primera = this.porNombre(nombre)[0];
    if (!primera || primera.clase !== "multisource") return true;
    return this._multisourceAbierto(primera, activador);
  }

  /**
   * `CMultiSource::IsTriggered`, `buttons.cpp:219-242`: todas sus entradas
   * puestas.
   *
   * Y **sin entradas está ABIERTO**, que es lo contrario de lo que uno
   * escribiría: el bucle es `while (i < m_iTotal) ... if (i == m_iTotal)
   * return 1`, y con `m_iTotal == 0` la condición se cumple en el acto. Un
   * multisource al que no apunta nadie no bloquea a quien lo tenga de maestro.
   */
  _multisourceAbierto(e) {
    for (const i of e.entradas ?? []) if (e.est.encendidas.get(i) !== true) return false;
    return true;
  }

  /**
   * `FireTargets`: usa a todas las que se llamen así.
   *
   * El `game_triggered` del `game_master` (`subs.cpp:212-221`) sale como efecto:
   * el intérprete de guiones vive en otro módulo y este no lo importa.
   */
  disparar(nombre, activador = null, uso = USO.ALTERNAR, valor = 0, quien = null) {
    if (!nombre) return 0;
    this.cuenta.set(nombre, (this.cuenta.get(nombre) ?? 0) + 1);
    this.salidas.push({ tipo: "evento_gm", evento: "game_triggered", parametros: [nombre] });
    let n = 0;
    for (const e of this.porNombre(nombre)) { this.usar(e, activador, uso, valor, quien); n++; }
    // NADIE CONTESTÓ, y en el motor eso es exactamente igual de silencioso:
    // `FireTargets` recorre cero entidades y sigue. Aquí se dice, porque hay
    // dos causas muy distintas detrás y sólo se distinguen mirándolas:
    //
    //   - el mapa cita un nombre que no existe (Edana tiene tres: `lol`,
    //     `sewerlight` y `renderfountainBEANS`, y el motor los ignora igual —
    //     `Q_strcmp`, `pr_cmds.cpp:942`, distingue mayúsculas);
    //   - el nombre existe pero es de algo que este bus no conoce: un
    //     monstruo, un `env_model`, una entidad con guion.
    //
    // Lo segundo es un hueco NUESTRO y lo primero es del mapa. Contarlos juntos
    // y mirarlos es mejor que no contar ninguno.
    if (n === 0) this.salidas.push({ tipo: "sin_destinatario", nombre, de: quien?.i ?? null });
    return n;
  }

  /**
   * `CBaseDelay::SUB_UseTargets`, `subs.cpp:240-309`: el retraso, el
   * `killtarget` y luego los objetivos. **En ese orden**, y el retraso se lleva
   * el `killtarget` con él.
   */
  usarObjetivos(e, activador = null, uso = USO.ALTERNAR, valor = 0) {
    const objetivo = e.est.objetivo;
    if (!objetivo && !e.matar) return;
    if (e.retraso) {
      this.pendientes.push({
        cuando: this.reloj() + e.retraso,
        objetivo, matar: e.matar ?? null, uso, valor, activador, de: e.i,
      });
      return;
    }
    if (e.matar) this._matar(e.matar);
    if (objetivo) this.disparar(objetivo, activador, uso, valor, e);
  }

  /**
   * La `SUB_UseTargets` DE `CBaseEntity`, con su fallo. Ver la cabecera.
   *
   * Se escribe entera y no se simplifica a «no hagas nada» porque el día que
   * alguien arregle el mod, esto tiene que poder arreglarse cambiando un signo
   * y no reescribiendo una idea.
   */
  usarObjetivosDeEntidadBase(e, activador = null, uso = USO.ALTERNAR, valor = 0) {
    // La condición está invertida y **es lo ÚNICO que está mal**: el argumento
    // es el objetivo de verdad, igual que en Half-Life. Esto importa para
    // poder romperlo: la primera versión de aquí escribía además la cadena
    // vacía a mano, y entonces «arreglar» la condición no cambiaba nada y la
    // rotura a propósito daba CERO rojos. Un fallo portado tiene que
    // distinguirse del bueno por un solo operador, o no se puede comprobar.
    if (!e.est.objetivo) {              // subs.cpp:197 — sí, al revés
      this.disparar(e.est.objetivo, activador, uso, valor, e);
    }
  }

  /**
   * `UTIL_Remove` por nombre: lo que hace un `killtarget`.
   *
   * EL 78: el motor borra **todo lo que se llame así** (`subs.cpp:220-233`), y
   * aquí sólo se miraba el cableado del mapa. Un NPC no está en el cableado:
   * está en la manada, y el bus no la conoce. Así que ahora sale SIEMPRE una
   * `borrar` con el nombre, la haya encontrado aquí o no, y quien tenga bichos
   * la resuelve. Gate City tiene cero `killtarget` y Edana dos, ninguno a un
   * bicho; `gertenheld_forest2` tiene trece y cuatro van a un NPC, así que esto
   * llevaba muerto desde el 49 sin que se pudiera ver.
   */
  _matar(nombre) {
    let encontrado = false;
    for (const e of this.porNombre(nombre)) {
      e.vivo = false;
      encontrado = true;
      this.salidas.push({ tipo: "borrar", entidad: e.i, clase: e.clase, nombre });
    }
    // Y la que puede ser de un bicho. Va aparte y no en lugar de las de arriba
    // porque el motor no elige: borra a todos los que lleven ese nombre.
    if (!encontrado) this.salidas.push({ tipo: "borrar", entidad: null, clase: null, nombre });
  }

  /** `Use()`, repartido por clase. */
  usar(e, activador, uso, valor, quien = null) {
    switch (e.clase) {
      case "trigger_relay":
      case "mstrig_relay": return this._relay(e, activador, uso, valor);
      case "multi_manager":
      case "mstrig_multi": return this._manager(e, activador);
      case "multisource": return this._multisource(e, activador, quien);
      case "trigger_changetarget": return this._cambiarObjetivo(e);
      case "ms_counter":
      case "trigger_counter": return this._contador(e, activador);
      case "ms_npcscript":
      case "mstrig_act": return this._escenaDeNpc(e, activador);
      case "env_render": return this._render(e);
      case "msarea_monsterspawn":
      case "ms_monsterspawn": return this._reiniciarArea(e);
      case "func_door": return this._puerta(e, activador);
      case "func_door_rotating": return this._puertaGiratoria(e, activador);
      case "func_breakable": return this._romper(e, "disparo");
      case "func_button": return this._boton(e, activador);
      case "msitem_spawn": return this._soltarObjeto(e);
      default:
        // Lo demás —puertas, rompibles, zonas— no vive aquí: se avisa al mundo
        // y que lo resuelva quien lo tenga. Un disparo a algo que no sabemos
        // hacer se CUENTA, no se traga.
        this.salidas.push({ tipo: "usar", entidad: e.i, clase: e.clase, nombre: e.nombre ?? null, uso });
        return undefined;
    }
  }

  /** `CTriggerRelay::Use`, `triggers.cpp:246-272`. */
  _relay(e, activador) {
    if (e.maestro && !this.maestroAbierto(e.maestro, activador)) return;
    // `if (!m_flRandomChance || RANDOM_FLOAT(0, 99.9f) < m_flRandomChance)`.
    // Con `random 100` —que es lo que ponen los dos mapas— sale siempre.
    const p = Number(e.probabilidad) || 0;
    if (!p || this.azar() * 99.9 < p) {
      if (e.evento) this.salidas.push({ tipo: "evento", evento: e.evento, quien: activador });
      // El activador pasa a ser el relé, NO quien lo disparó: `SUB_UseTargets(this, ...)`.
      this.usarObjetivos(e, e, e.uso ?? USO.APAGAR, 0);
    }
    // `UTIL_Remove(this)`: se borra ÉL, no todos los que se llamen igual.
    if ((Number(e.banderas) || 0) & SF.RELAY_UNA_VEZ) {
      e.vivo = false;
      this.salidas.push({ tipo: "borrar", entidad: e.i, clase: e.clase, nombre: e.nombre ?? null });
    }
  }

  /**
   * `CBaseTrigger::CounterUse`, `triggers.cpp:1601-1635` — el 67.
   *
   *     m_cTriggersLeft--;
   *     m_hActivator = pActivator;
   *     if (m_cTriggersLeft < 0) return;
   *     ...
   *     if (m_cTriggersLeft != 0) return;
   *     ActivateMultiTrigger(pActivator);
   *
   * Cuenta hacia atrás y al llegar a cero dispara su `target` con `USE_TOGGLE`
   * (`SUB_UseTargets`, la buena, desde `ActivateMultiTrigger`, `triggers.cpp:1517`)
   * y **se borra**, porque su `Spawn` pone `m_flWait = -1` a mano y eso lleva al
   * `else` del final (`SUB_Remove`, `triggers.cpp:1578-1581`).
   *
   * Dos detalles que no se inventan:
   *
   *   - El guarda `< 0` está DESPUÉS del `--`, así que con `count 1` el primer
   *     disparo deja 0 y entra; no es «uno de más».
   *   - Los mensajes de «only 1 more to go» están comentados en el mod
   *     («I don't think we want these Quakesque messages»), así que aquí no hay
   *     nada que decirle al jugador. Se anota igual en `salidas`, para medir.
   *
   * El de Edana es `patroncounter`, `count 8`, y lleva a `patronkiller`: es el
   * contador de la taberna.
   */
  _contador(e, activador) {
    e.est.quedan -= 1;
    e.est.activador = activador;
    this.salidas.push({
      tipo: "cuentaAtras", entidad: e.i, nombre: e.nombre ?? null, quedan: e.est.quedan,
    });
    if (e.est.quedan < 0) return;
    if (e.est.quedan !== 0) return;
    // `ActivateMultiTrigger`: el objetivo con ALTERNAR, y el activador es quien
    // llamó, no el contador.
    this.usarObjetivos(e, activador, USO.ALTERNAR, 0);
    // `m_flWait = -1` -> `SUB_Remove`.
    e.vivo = false;
    this.salidas.push({ tipo: "borrar", entidad: e.i, clase: e.clase, nombre: e.nombre ?? null });
  }

  /**
   * `NPCScript::Act`, `npcact.cpp:63-176` — el 67.
   *
   * El `scripted_sequence` de Master Sword. Coge al NPC que nombra su `target` y
   * le hace una de cinco cosas:
   *
   *     enum { SCRIPT_MOVE = 0, SCRIPT_PLAYANIM, SCRIPT_RUNEVENT,
   *            SCRIPT_MOVE_PLAYANIM, SCRIPT_MOVE_RUNEVENT };   npcact.cpp:17-23
   *
   * ── QUÉ SE PORTA Y QUÉ NO, con la cuenta ───────────────────────────────────
   *
   * **El tipo 2 (`SCRIPT_RUNEVENT`) entero**, que son 15 de los 18 de Edana y
   * son sus misiones: el libro de Urdauf y Sumdale (`askbook`/`bookfound`), la
   * sidra de Bryan y la tabernera (`cider`..`cider4`, `ciderreward`), las
   * pruebas del alcalde (`evidence_found`), el jabalí del viejo
   * (`trig_boarsdead`, que es el `killtarget` del jefe) y los saludos del
   * sacerdote y del guardia de la plaza.
   *
   * Los que **no**: los dos que mueven al NPC (tipos 0 y 4, Edrin y su sitio) y
   * el 1, que le pone una animación. Mover a un NPC hasta un punto pide hablarle
   * al rebaño y a la física, que no viven aquí, y se dice en vez de fingirlo: el
   * disparo sale por `salidas` como «usar» para que cuente en el censo de lo que
   * falta. El de tipo 0 con `eventname player_spawned` **no tiene `targetname`**,
   * así que en el juego tampoco lo dispara nadie.
   *
   * ── LAS GUARDAS, que las aplica el mundo porque sabe del NPC ────────────────
   *
   *     if (!pMonster->IsAlive()) return;                              :82-86
   *     if (pMonster->m_MonsterState == MONSTERSTATE_SCRIPT) return;      :128
   *     if (!m_fStopAI && pMonster->m_hEnemy != NULL) return;             :131
   *
   * La tercera es la que se nota: **un NPC peleando no atiende una escena** si
   * el mapa no pone `stopai`. Viajan con el pedido porque este módulo no sabe
   * quién está vivo ni quién tiene enemigo, y no se va a inventar que sí.
   *
   * ── Y EL TIPO 2 NO DEJA AL NPC «EN ESCENA» ─────────────────────────────────
   *
   *     if (m_iType == SCRIPT_RUNEVENT) { RunScriptEvent(); return; }
   *                                            npcact.cpp:134-141
   *
   * Vuelve ANTES del `pMonster->m_MonsterState = MONSTERSTATE_SCRIPT` del final,
   * con el comentario de Thothie al lado («attempting to fix buggy ms_npcscript
   * behavior»). Lanzar un evento no congela al NPC, y eso importa: si lo
   * congelara, el sacerdote se quedaría clavado después de saludarte.
   */
  _escenaDeNpc(e, activador) {
    const tipo = Number(e.tipo) || 0;
    // ── EL 77: LOS CUATRO TIPOS QUE NO SON EL 2 ──────────────────────────
    //
    // Hasta aquí salían por `usar` para que CONTARAN en el censo de lo que
    // falta, con la razón escrita al lado: mover a un NPC pide hablarle al
    // rebaño y a la física, que no viven en este módulo. Siguen sin vivir
    // aquí — lo que cambia es que ahora hay a quién pasarle el recado.
    //
    // La máquina de estados es `src/play/escena.js` y no está en este archivo
    // a propósito: `NPCScript` tiene relojes propios (`nextthink` cada 0,1 s,
    // el `firedelay`) y el bus no tiene reloj. Lo que sale de aquí es el
    // pedido entero, y quien lo recoge lo mete en el director de escenas.
    if (tipo !== 2) {
      this.salidas.push({
        tipo: "escenaDeNpc", entidad: e.i, clase: e.clase, nombre: e.nombre ?? null,
        escenaTipo: tipo,
        npc: e.npc ?? null,
        eventoDelNpc: e.eventoDelNpc ?? null,
        animDeAndar: e.animDeAndar ?? null,
        animDeAccion: e.animDeAccion ?? null,
        alAcabar: e.alAcabar ?? null,
        alCortarse: e.alCortarse ?? null,
        retrasoAlAcabar: Number(e.retrasoAlAcabar) || 0,
        paraLaIa: Boolean(e.paraLaIa),
        // En METROS de escena: lo convierte a unidades quien tenga la manada,
        // que es donde está la constante. Aquí no se multiplica por nada.
        escena: e.escena ?? null,
        angulos: e.angulos ?? null,
        activador,
      });
      return;
    }
    if (!e.npc || !e.eventoDelNpc) return;
    this.salidas.push({
      tipo: "eventoDeNpc",
      entidad: e.i,
      nombre: e.nombre ?? null,
      npc: String(e.npc),
      evento: String(e.eventoDelNpc),
      paraLaIa: Boolean(e.paraLaIa),
      activador,
    });
    // `Finish()` -> `FireTarget()`: el `firewhendone` con su `firedelay`. Y el
    // activador que se pasa es **el NPC**, no quien disparó la escena
    // (`FireTargets(FireEvent, pMonster, this, …)`, npcact.cpp:319). Aquí el NPC
    // es un nombre, así que se pasa tal cual y que lo resuelva el mundo.
    if (!e.alAcabar) return;
    const cuando = Number(e.retrasoAlAcabar) || 0;
    if (!cuando) { this.disparar(e.alAcabar, activador, USO.ALTERNAR, 0, e); return; }
    this.pendientes.push({
      cuando: this.reloj() + cuando,
      objetivo: e.alAcabar, matar: null, uso: USO.ALTERNAR, valor: 0, activador, de: e.i,
    });
  }
  /**
   * `CMultiManager::Clone`, `triggers.cpp:445-460` — el 67.
   *
   *     if (ShouldClone())
   *     {
   *         CMultiManager *pClone = Clone();
   *         pClone->ManagerUse(pActivator, pCaller, useType, value);
   *         return;
   *     }
   *                                            triggers.cpp:469-474
   *
   * Un `multi_manager` con `SF_MULTIMAN_THREAD` (`spawnflags 1`) **no se
   * ejecuta él**: se copia y corre la copia, y el original se queda con su `Use`
   * intacto, o sea siempre disparable. Es lo que en Half-Life permite que dos
   * jugadores usen el mismo manager a la vez, y el comentario del motor lo dice
   * con esa palabra: «execute in the clone (like a thread)».
   *
   * SIN ESTO, LA TABERNA DE EDANA RECIBE UN PARROQUIANO Y SE PARA. La cadena
   * es `patronmm1` -> {`patroncounter`, `patronspawn`, `patronspawnreset`+1s},
   * y `patronspawnreset` vuelve a disparar `patronmm1`. El original tiene el
   * `Use` desactivado hasta que acaba, y **acaba justo después de disparar el
   * relé**, así que sin clonar el segundo ciclo se rechaza a sí mismo: 1 de los
   * 11 parroquianos. Con clon, entra uno al azar por segundo.
   *
   * El clon se reutiliza en vez de acumularse. El motor hace `UTIL_Remove` y se
   * olvida; aquí la lista de entidades es fija y un `Math.random` cada segundo
   * durante una partida larga la haría crecer sin tope. Un clon muerto del mismo
   * origen es indistinguible de uno nuevo, porque `Clone` copia el `pev` entero
   * y sus objetivos.
   */
  _clonarManager(e) {
    const previo = this.entidades.find((c) => c.est.esClon && c.est.origen === e.i && !c.vivo);
    if (previo) {
      previo.vivo = true;
      previo.est.usable = true;
      previo.est.indice = 0;
      previo.est.proximoPensar = -1;
      return previo;
    }
    const clon = {
      ...e,
      i: this.entidades.length,
      vivo: true,
      // `memcpy(pMulti->pev, pev, …)` copia el `targetname` también, así que el
      // clon responde al mismo nombre. No molesta: mientras corre tiene el `Use`
      // desactivado (`est.usable` en falso) y al acabar se borra.
      est: { ...e.est, esClon: true, origen: e.i, usable: true, indice: 0, proximoPensar: -1 },
    };
    this.entidades.push(clon);
    if (clon.nombre) {
      if (!this.porNombreCache.has(clon.nombre)) this.porNombreCache.set(clon.nombre, []);
      this.porNombreCache.get(clon.nombre).push(clon);
    }
    return clon;
  }

  /**
   * `ShouldClone`, `triggers.cpp:317-323`. Un clon no se vuelve a clonar:
   *
   *     if (IsClone()) return FALSE;
   *     return (pev->spawnflags & SF_MULTIMAN_THREAD) ? TRUE : FALSE;
   */
  _deberiaClonar(e) {
    if (e.est.esClon) return false;
    return Boolean((Number(e.banderas) || 0) & SF.MANAGER_HILO);
  }

  /** `CMultiManager::ManagerUse`, `triggers.cpp:465-491`. */
  _manager(e, activador) {
    // El clonado va PRIMERO, antes del guarda de `usable`: el original nunca
    // tiene el `Use` desactivado, porque nunca se ejecuta él.
    if (this._deberiaClonar(e)) {
      const clon = this._clonarManager(e);
      this.salidas.push({ tipo: "clonar", entidad: clon.i, de: e.i, nombre: e.nombre ?? null });
      return this._manager(clon, activador);
    }
    if (!e.est.usable) return;          // `SetUse(NULL)` mientras corre
    const objetivos = e.objetivos ?? [];
    if (!objetivos.length) return;
    e.est.activador = activador;
    e.est.inicio = this.reloj();
    e.est.usable = false;
    if (esCierto(e.alAzar)) {
      // `m_index = RANDOM_LONG(0, m_cTargets - 1)` y se dispara sólo ése.
      e.est.indice = Math.min(objetivos.length - 1, Math.floor(this.azar() * objetivos.length));
      e.est.proximoPensar = this.reloj() + objetivos[e.est.indice].retraso;
    } else {
      e.est.indice = 0;
      e.est.proximoPensar = this.reloj();
    }
  }

  /** `CMultiManager::ManagerThink`, `triggers.cpp:415-444`. */
  _managerPiensa(e) {
    const objetivos = e.objetivos ?? [];
    const t = this.reloj() - e.est.inicio;
    while (e.est.indice < objetivos.length && objetivos[e.est.indice].retraso <= t) {
      this.disparar(objetivos[e.est.indice].nombre, e.est.activador ?? null, USO.ALTERNAR, 0, e);
      if (esCierto(e.alAzar)) { e.est.indice = objetivos.length; break; }
      e.est.indice++;
    }
    if (e.est.indice >= objetivos.length) {
      e.est.proximoPensar = -1;
      // `if (IsClone()) { UTIL_Remove(this); return; }` va ANTES del
      // `SetUse(&ManagerUse)`: un clon no se reutiliza, se muere
      // (triggers.cpp:436-441).
      if (e.est.esClon) {
        e.vivo = false;
        this.salidas.push({ tipo: "borrar", entidad: e.i, clase: e.clase, nombre: e.nombre ?? null });
        return;
      }
      e.est.usable = true;              // «allow manager re-use»
    } else {
      e.est.proximoPensar = e.est.inicio + objetivos[e.est.indice].retraso;
    }
  }

  /**
   * `CMultiSource::Use`, `buttons.cpp:170-215`.
   *
   * Alterna la entrada de quien llama, y si están todas, «dispara» — por la
   * `SUB_UseTargets` rota, o sea que no dispara. Lo que sí hace es quedar
   * ABIERTO para quien lo tenga de `master`, y eso sí funciona.
   */
  _multisource(e, activador, quien) {
    // La pertenencia es por ENTIDAD y no por nombre: `m_rgEntities[i] ==
    // pCaller->GetSelf()`. Dos relés distintos con el mismo `target` son dos
    // entradas distintas, aunque se llamaran igual.
    const i = quien?.i;
    if (i === undefined || !(e.entradas ?? []).includes(i)) {
      // «MultiSrc:Used by non member %s» y se va: buttons.cpp:191-196.
      //
      // Con `quien` a `null` esto es la copia `DelayedUse` del motor llamando, o
      // sea el caso que Dogg avisa dos líneas más arriba en el mismo `Use`: un
      // relé con `delay` NUNCA puede abrir un multisource. Ver `paso()`. En Edana
      // es lo que deja al jefe jabalí sin salir, y es del mod y no nuestro.
      this.salidas.push({
        tipo: "aviso", que: "multisource_ajeno", entidad: e.i,
        quien: quien?.nombre ?? null,
        porRetraso: i === undefined,
      });
      return;
    }
    e.est.encendidas.set(i, !e.est.encendidas.get(i));
    if (this._multisourceAbierto(e)) {
      this.usarObjetivosDeEntidadBase(e, null, USO.ALTERNAR, 0);   // no hace nada, y es del mod
    }
  }

  /** `CTriggerChangeTarget::Use`, `triggers.cpp:2676-2689`. Sólo a la PRIMERA. */
  _cambiarObjetivo(e) {
    const victima = this.porNombre(e.est.objetivo)[0];
    if (!victima) return;
    victima.est.objetivo = e.objetivoNuevo ?? null;
    this.salidas.push({
      tipo: "cambio_objetivo", entidad: victima.i,
      nombre: victima.nombre ?? null, nuevo: victima.est.objetivo,
    });
  }

  /** `CRenderFxManager::Use`, `triggers.cpp:535-557`. A TODAS las que se llamen así. */
  _render(e) {
    const b = Number(e.banderas) || 0;
    const como = {
      fx: b & SF.RENDER_SIN_FX ? null : (e.renderfx ?? null),
      cantidad: b & SF.RENDER_SIN_CANTIDAD ? null : (e.renderamt ?? null),
      modo: b & SF.RENDER_SIN_MODO ? null : (e.rendermode ?? null),
      color: b & SF.RENDER_SIN_COLOR ? null : (e.rendercolor ?? null),
    };
    const dentro = this.porNombre(e.est.objetivo);
    for (const v of dentro) {
      this.salidas.push({ tipo: "render", entidad: v.i, nombre: v.nombre ?? null, enElBus: true, ...como });
    }
    // Y SI NADIE DEL BUS SE LLAMA ASÍ, se dice (el 69).
    //
    // Antes esto recorría cero y se callaba, y callarse era lo peor que podía
    // hacer: **seis de los siete `env_render` de Edana apuntan a un `env_model`**
    // —los platos de sopa de la taberna y la manzana del huerto—, que no es una
    // entidad del cableado. Así que la regla llevaba desde el 49 escrita, citada
    // y en verde sin haber cambiado nunca nada de nada. Ahora sale por aquí y la
    // busca quien tenga los adornos.
    if (!dentro.length && e.est.objetivo) {
      this.salidas.push({ tipo: "render", entidad: null, nombre: e.est.objetivo, enElBus: false, ...como });
    }
  }

  /**
   * `CAreaMonsterSpawn::ResetUse`, `msmapents.cpp:753-815`.
   *
   * Y AQUÍ ESTÁ EL FINAL DE LA CADENA DE GATE CITY:
   *
   *     if (m_fActive) { if (!resetwhen) return; }
   *
   * Las 16 áreas de Gate City nacen activas —ninguna pone `spawntrigger`, así
   * que `m_fSpawnOnTrigger` es falso y `Spawn()` pone `m_fActive = true`— y
   * ninguna pone `resetwhen`. O sea que **el disparo llega y el área lo
   * ignora**. Lo mismo en Edana con sus catorce. No es que no lleguen: llegan,
   * y no pasa nada. El 43 lo dijo mirando el otro extremo; ahora se mide aquí.
   */
  _reiniciarArea(e) {
    const cuando = Number(e.reiniciarCuando) || 0;
    if (e.est.activa && !cuando) {
      this.salidas.push({ tipo: "area_ignora", entidad: e.i, nombre: e.nombre ?? null });
      return;
    }
    e.est.activa = true;
    e.est.despierta = true;
    this.salidas.push({ tipo: "area_reinicia", entidad: e.i, nombre: e.nombre ?? null, cuando });
  }

  // --- lo que se rompe, se pulsa y se suelta (el 69) -------------------------

  /**
   * EL DAÑO a un `func_breakable` o a un `func_button`, que es por donde llega
   * la espada. Devuelve `true` si ha roto o pulsado.
   *
   * `tipo` es el del motor: `"club"` es un arma cuerpo a cuerpo, y **eso importa
   * el doble**:
   *
   *     if (bitsDamageType & DMG_CLUB) flDamage *= 2;      func_break.cpp:565-567
   *
   * Un almiar de 10 de vida cae con 5 de daño de espada, no con 10.
   */
  danar(e, dano, { tipo = "club", deJugador = true } = {}) {
    if (!e || !e.vivo) return false;
    if (e.clase === "func_button") return this._botonDanado(e, deJugador);
    if (e.clase !== "func_breakable") return false;
    if (e.est.roto) return false;
    if (!this.rompible(e)) return false;
    // `SF_BREAK_TRIGGER_ONLY` -> `pev->takedamage = DAMAGE_NO`
    // (func_break.cpp:158-162): con ella el daño no entra, sólo el disparo.
    if (Number(e.banderas) & SF_ROMPER.SOLO_DISPARO) {
      this.salidas.push({ tipo: "aviso", que: "rompible_inmune", entidad: e.i });
      return false;
    }
    let d = Number(dano) || 0;
    // `SF_BREAK_CROWBAR`: un cliente con un arma de golpe lo rompe de UNA,
    // pasando por encima de la vida (func_break.cpp:557-560). Y la condición
    // pide las dos cosas: la bandera Y que el atacante sea un cliente. Los
    // cinco de Gate City que la traen son las cajas de `explosion 1`.
    if (deJugador && tipo === "club" && (Number(e.banderas) & SF_ROMPER.PALANCA)) d = e.est.vida;
    else if (tipo === "club") d *= 2;
    // `DMG_POISON` sólo cuenta el 10 % (func_break.cpp:569-571).
    else if (tipo === "veneno") d *= 0.1;
    e.est.vida -= d;
    if (e.est.vida > 0) {
      this.salidas.push({ tipo: "rompible_danado", entidad: e.i, nombre: e.nombre ?? null,
        vida: e.est.vida, material: Number(e.material) || 0 });
      return false;
    }
    this._romper(e, "dano");
    return true;
  }

  /**
   * `IsBreakable()`: `m_Material != matUnbreakableGlass` (func_break.cpp:841).
   * El 7 es el único material que no se rompe nunca, y ninguno de los dos mapas
   * lo usa — se escribe porque la condición es del mod y no una suposición.
   */
  rompible(e) { return (Number(e.material) || 0) !== 7; }

  /**
   * `CBreakable::Die`, `func_break.cpp:656-836`. Y hay que leer el orden, porque
   * dos líneas seguidas deciden todo lo que pasa en el corral de la cloaca:
   *
   *     pev->targetname = 0;                 <- primero se BORRA su propio nombre
   *     pev->solid = SOLID_NOT;
   *     SUB_UseTargets(NULL, USE_TOGGLE, 0); <- y luego dispara
   *                                             func_break.cpp:821-825
   *
   * El comentario del mod dice por qué: *«Don't fire something that could fire
   * myself»*. En Edana eso no es una precaución teórica: **los cuatro almiares
   * se llaman `hay`**, el de 8 de vida apunta a `sewer_door`, y la puerta de la
   * cloaca apunta de vuelta a `hay`. Así que rompes uno, se abre la cloaca, y la
   * puerta revienta los otros tres — pero no al que la abrió, porque ése ya no
   * se llama así.
   *
   * Y `SUB_UseTargets` aquí es la BUENA: `CBreakable : CBaseDelay` (func_break.h:40),
   * no la de `CBaseEntity` con la condición invertida del 49.
   */
  _romper(e, por = "disparo") {
    if (e.est.roto) return;
    if (!this.rompible(e)) {
      // `CBreakable::Use` también pregunta (func_break.cpp:486-497): un disparo
      // a un cristal irrompible no lo rompe.
      this.salidas.push({ tipo: "aviso", que: "rompible_irrompible", entidad: e.i });
      return;
    }
    e.est.roto = true;
    e.est.vida = 0;
    // El nombre se borra ANTES de disparar, y se borra de verdad: `porNombre`
    // tiene que dejar de encontrarlo o la puerta de la cloaca volvería a
    // romper al que la abrió. Se quita de la caché además del campo.
    // `seLlamaba` es NUESTRO, no del motor: el motor tira el nombre y se queda
    // sin él. Se guarda aparte para poder medir cuál se rompió, porque si no lo
    // único que queda de un almiar roto es un hueco sin nombre.
    const comoSeLlamaba = e.nombre;
    e.est.seLlamaba = comoSeLlamaba ?? null;
    if (e.nombre) {
      const l = this.porNombreCache.get(e.nombre);
      if (l) this.porNombreCache.set(e.nombre, l.filter((x) => x !== e));
      e.nombre = null;
    }
    // Deja de chocar y desaparece. El mundo lo aplica; aquí sólo se dice.
    this.salidas.push({ tipo: "romper", entidad: e.i, nombre: comoSeLlamaba ?? null,
      material: Number(e.material) || 0, por,
      // `Explodable()` es `pev->impulse > 0` y el impulso viene de
      // `explodemagnitude` (func_break.h:66-67). Los cinco `explosion 1` de
      // Gate City no lo traen: no explota ninguno de los veinte.
      explota: (Number(e.magnitud) || 0) > 0 });
    this.usarObjetivos(e, null, USO.ALTERNAR, 0);
  }

  /**
   * `CBaseButton::TakeDamage`, `buttons.cpp:439-466`, y la sorpresa está en lo
   * que NO hace: **no resta de `pev->health` en ninguna de sus líneas.** Mira si
   * puede responder y activa. Así que `health 2` en el botón de la manzana no
   * son dos puntos de vida — es la bandera que hace `takedamage = DAMAGE_YES`
   * (buttons.cpp:531-534), y un golpe de cualquier tamaño lo abre.
   *
   * El daño no se usa, y el parámetro se recibe igual para que quede escrito que
   * el motor lo tira.
   */
  _botonDanado(e, deJugador = true) {
    if (!(Number(e.vida) > 0)) {
      // Sin `health` el botón no acepta daño: hay que USARLO.
      this.salidas.push({ tipo: "aviso", que: "boton_no_golpeable", entidad: e.i });
      return false;
    }
    if (!deJugador) return false;
    return this._boton(e, null);
  }

  /**
   * `ButtonActivate` + `TriggerAndWait`, `buttons.cpp:759-820`.
   *
   * De todo el ciclo del botón, el de Edana usa una esquina: `spawnflags 1` es
   * `SF_BUTTON_DONTMOVE`, así que `m_vecPosition2 == m_vecPosition1` y el
   * recorrido es de longitud cero — `TriggerAndWait` llega en el acto. Y
   * `wait -1` pone `m_fStayPushed` (buttons.cpp:552), con lo que al llegar
   * arriba **se queda arriba**: `ButtonResponseToTouch` devuelve `BUTTON_NOTHING`
   * desde entonces (buttons.cpp:/ButtonResponseToTouch/). Dispara una vez y no
   * vuelve.
   *
   * Y el `master` se pregunta DOS veces, al arrancar y al llegar arriba. Aquí
   * sólo una, porque sin movimiento las dos caen en el mismo instante; si algún
   * día un botón se mueve, ésta es la línea que hay que partir en dos.
   */
  _boton(e, activador) {
    if (e.est.pulsado) {
      this.salidas.push({ tipo: "aviso", que: "boton_ya_pulsado", entidad: e.i,
        nombre: e.nombre ?? null });
      return false;
    }
    if (!this.maestroAbierto(e.maestro, activador)) {
      // `PlayLockSounds(..., TRUE, TRUE)` y se va (buttons.cpp:762-767).
      this.salidas.push({ tipo: "aviso", que: "boton_cerrado", entidad: e.i, nombre: e.nombre ?? null });
      return false;
    }
    // `m_fStayPushed` es `wait == -1`. Sin él el botón vuelve solo y se puede
    // volver a pulsar; con él, esto es para siempre.
    const sePega = Number(e.espera) === -1;
    e.est.pulsado = sePega;
    this.salidas.push({ tipo: "boton", entidad: e.i, nombre: e.nombre ?? null, sePega });
    this.usarObjetivos(e, activador, USO.ALTERNAR, 0);
    return true;
  }

  /**
   * `CBaseGISpawn::Use` -> `SpawnItem()`, `gispawn.cpp:23-58`.
   *
   * Tres cosas que no se adivinan del nombre de la clase:
   *
   *   - **`Use` no mira `useType`.** Es una línea: `SpawnItem();`. Así que un
   *     relé con `triggerstate 0` —o sea «apágalo»— también suelta el objeto.
   *   - **el objeto hereda el `targetname` del aparecedor**
   *     (`pItem->pev->targetname = pev->targetname`, gispawn.cpp:40), que es lo
   *     que permite que luego algo apunte al objeto y no al sitio.
   *   - **no hay tope.** Cada disparo suelta otro. `apple5spawn` da una manzana
   *     por pulsación, y su botón sólo se pulsa una vez, así que en Edana sale
   *     una — pero el límite es del botón, no de aquí.
   */
  _soltarObjeto(e) {
    e.est.soltados++;
    this.salidas.push({
      tipo: "objeto_aparece",
      entidad: e.i,
      // El objeto SE LLAMA como el aparecedor, no como su guion.
      nombre: e.nombre ?? null,
      guion: e.guion ?? null,
      contenedor: e.contenedor ?? null,
      unidades: e.unidades ?? null,
      // El 71: y sus ángulos, que también los hereda (gispawn.cpp:57).
      angulos: e.angulos ?? [0, 0, 0],
      vez: e.est.soltados,
    });
    return true;
  }

  // --- las puertas (el 70) --------------------------------------------------

  /**
   * `CBaseDoor::Use`, `doors.cpp:549-554`. Son cuatro líneas y una de ellas es
   * la que decide si el jugador de Edana ve abrirse la cloaca:
   *
   *     if ((m_toggle_state == TS_AT_BOTTOM) ||
   *         (FBitSet(pev->spawnflags, SF_DOOR_NO_AUTO_RETURN) &&
   *          (m_toggle_state == TS_AT_TOP)))
   *         DoorActivate();
   *
   * O sea: **un disparo a una puerta que ya se está moviendo no hace nada**. No
   * la acelera, no la rearma, no la encola. Y una puerta arriba sin
   * `SF_DOOR_NO_AUTO_RETURN` tampoco acepta nada: hay que esperar a que baje
   * sola. Lo de arriba lo pongo entero porque la tentación era escribir «si no
   * está abierta, ábrela», que se porta igual en las tres puertas de Edana y
   * deja de portarse igual en la primera que traiga la bandera.
   *
   * `DoorActivate` mira antes el `master` (doors.cpp:562). Ninguna de las
   * tres lo trae; se pregunta igual porque es una línea y porque no
   * preguntarlo es cómo se construye una regla que no corre (el 62).
   */
  _puerta(e, activador) {
    const s = e.est.puerta;
    const sinRetorno = Boolean(e.sinRetorno);
    if (!(s === "abajo" || (sinRetorno && s === "arriba"))) {
      this.salidas.push({ tipo: "aviso", que: "puerta_ocupada", entidad: e.i,
        nombre: e.nombre ?? null, estado: s });
      return false;
    }
    if (!this.maestroAbierto(e.maestro, activador)) {
      // `PlayLockSounds(..., TRUE, FALSE)` y se va.
      this.salidas.push({ tipo: "aviso", que: "puerta_cerrada", entidad: e.i, nombre: e.nombre ?? null });
      return false;
    }
    this._puertaArranca(e, s === "arriba" ? "bajando" : "subiendo", activador);
    return true;
  }

  /**
   * `DoorGoUp` / `DoorGoDown` (doors.cpp:593-637 y :679-695), que en los dos
   * casos son lo mismo: elegir destino y llamar a `LinearMove`.
   *
   * Y `LinearMove` **no mueve nada**: pone una velocidad y un `nextthink` a
   * `distancia / velocidad`, y al vencer llama a `MoveDone` (subs.cpp:426-453).
   * Por eso aquí no hay ninguna interpolación: se guarda cuándo empieza y
   * cuándo acaba, y quien dibuja pregunta `fraccionDePuerta(e, t)`.
   *
   * Esto no es un atajo, es la frontera de siempre en su sitio: **el movimiento
   * es del motor, el choque es de Rapier** — y la posición a mitad de camino es
   * una cuenta con el reloj, que es lo único que este módulo tiene.
   */
  _puertaArranca(e, hacia, activador = null) {
    const t = this.reloj();
    const dur = Math.abs(Number(e.duracion) || 0);
    e.est.puerta = hacia;
    e.est.puertaDesde = this.fraccionDePuerta(e, t);
    e.est.puertaHasta = hacia === "subiendo" ? 1 : 0;
    e.est.puertaInicio = t;
    // El tramo que QUEDA, no el entero: una puerta que se invierte a medio
    // camino tarda lo que le falta. Hoy no se invierte ninguna —ver `Blocked`
    // en la cabecera de `src/render/correderas.js`— pero escribirlo con la
    // duración completa sería escribir una regla que sólo vale mientras nadie
    // la use, que es como se llega al apartado 4.
    e.est.puertaFin = t + dur * Math.abs(e.est.puertaHasta - e.est.puertaDesde);
    e.est.puertaActivador = activador ? activador.i ?? null : null;
    this.salidas.push({
      tipo: "puerta", entidad: e.i, nombre: e.nombre ?? null, clase: e.clase,
      hacia, desde: e.est.puertaDesde, hasta: e.est.puertaHasta,
      inicio: t, fin: e.est.puertaFin, sonido: e.sonido ?? null,
    });
  }

  /**
   * DÓNDE ESTÁ la hoja ahora, entre 0 (cerrada) y 1 (abierta del todo).
   *
   * Lo pregunta quien dibuja, cada fotograma, y es puro: dos restas y una
   * división. Con `duracion` cero —que el horneado ya impide con un control—
   * devolvería el destino en el acto en vez de dividir por cero.
   */
  fraccionDePuerta(e, t = this.reloj()) {
    const s = e.est.puerta;
    if (s === "abajo") return 0;
    if (s === "arriba") return 1;
    const d = e.est.puertaFin - e.est.puertaInicio;
    if (!(d > 0)) return e.est.puertaHasta;
    const p = Math.min(1, Math.max(0, (t - e.est.puertaInicio) / d));
    return e.est.puertaDesde + (e.est.puertaHasta - e.est.puertaDesde) * p;
  }

  /**
   * `DoorHitTop` / `DoorHitBottom`, `doors.cpp:639-674` y `:699-723`. Lo que
   * pasa AL LLEGAR, que es donde está la mitad interesante de una puerta.
   *
   *   - Las dos disparan `SUB_UseTargets(m_hActivator, USE_TOGGLE, 0)`, y es la
   *     buena (`CBaseDoor` baja de `CBaseToggle`, de `CBaseDelay`): doors.cpp:673
   *     y :718. Es la línea
   *     que cierra el bucle del almiar: la tapa de la cloaca tiene
   *     `target hay`, así que al terminar de abrirse **mata a los otros tres
   *     almiares**. Al arrancar no dispara nadie.
   *   - Arriba, con `wait` distinto de −1 y sin `SF_DOOR_NO_AUTO_RETURN`, se
   *     programa la bajada a `m_flWait` segundos (doors.cpp:660). Con −1 se queda
   *     (`pev->nextthink = -1`, doors.cpp:662-665).
   *   - Y el `netname` dispara en el extremo CONTRARIO según `START_OPEN`
   *     (doors.cpp:671 y :722): arriba si empieza abierta, abajo si no. Ninguna
   *     de las tres de Edana trae `netname`; se anota como no portado.
   */
  _puertaLlega(e) {
    const arriba = e.est.puerta === "subiendo";
    e.est.puerta = arriba ? "arriba" : "abajo";
    e.est.puertaVueltas = (e.est.puertaVueltas ?? 0) + (arriba ? 1 : 0);
    e.est.puertaPiensa = -1;
    if (arriba && !e.sinRetorno && Number(e.espera) !== -1) {
      e.est.puertaPiensa = this.reloj() + (Number(e.espera) || 0);
    }
    this.salidas.push({ tipo: "puerta_llega", entidad: e.i, nombre: e.nombre ?? null,
      arriba, volvera: e.est.puertaPiensa >= 0 });
    const act = e.est.puertaActivador === null ? null
      : this.entidades[e.est.puertaActivador] ?? null;
    this.usarObjetivos(e, act, USO.ALTERNAR, 0);
  }

  /**
   * Un disparo a una ROTATORIA. Aquí sólo se comprueba el `master` y se avisa;
   * quien la mueve es `src/play/puertas.js`. Ver `ES_PUERTA`.
   *
   * No se mira si está a medio girar —el `TS_AT_BOTTOM` de `CBaseDoor::Use`—
   * porque eso lo sabe el otro lado y preguntarlo aquí con un estado que este
   * módulo no lleva sería inventarse una respuesta. `abrir()` de `puertas.js`
   * ya rechaza a la que está abriéndose, con la misma regla y su cita.
   */
  _puertaGiratoria(e, activador) {
    if (!this.maestroAbierto(e.maestro, activador)) {
      this.salidas.push({ tipo: "aviso", que: "puerta_cerrada", entidad: e.i, nombre: e.nombre ?? null });
      return false;
    }
    this.salidas.push({ tipo: "puerta_gira", entidad: e.i, nombre: e.nombre ?? null });
    return true;
  }

  /** Cuántas deslizantes hay en cada estado. Se calcula, no se escribe. */
  censoDePuertas() {
    const fuera = { abajo: 0, subiendo: 0, arriba: 0, bajando: 0 };
    for (const e of this.entidades) {
      if (!ES_CORREDERA.has(e.clase)) continue;
      fuera[e.est.puerta] = (fuera[e.est.puerta] ?? 0) + 1;
    }
    return fuera;
  }

  // --- el tacto -------------------------------------------------------------

  /**
   * `CBaseTrigger::MultiTouch`, `triggers.cpp:1259-1283`: quién puede tocar.
   *
   * `esJugador` separa las dos banderas; un monstruo sólo dispara si el mapa lo
   * pide con `SF_TRIGGER_ALLOWMONSTERS`, y un jugador deja de hacerlo con
   * `SF_TRIGGER_NOCLIENTS`.
   */
  puedeTocar(e, { esJugador = true } = {}) {
    const b = Number(e.banderas) || 0;
    if (esJugador) return !(b & SF.SIN_CLIENTES);
    return Boolean(b & SF.PERMITE_MONSTRUOS);
  }

  /** `Touch()`, repartido por clase. Devuelve si hizo algo. */
  tocar(e, quien = null, { esJugador = true } = {}) {
    if (!e.vivo) return false;
    switch (e.clase) {
      case "trigger_once":
      case "trigger_multiple":
      case "trigger":
        if (!this.puedeTocar(e, { esJugador })) return false;
        return this._activarMulti(e, quien);
      case "trigger_teleport":
        if (!this.puedeTocar(e, { esJugador })) return false;
        return this._teletransportar(e, quien);
      case "trigger_push":
        return this._empujar(e, quien, esJugador);
      default:
        return false;
    }
  }

  /** `CBaseTrigger::ActivateMultiTrigger`, `triggers.cpp:1343-1580`. */
  _activarMulti(e, quien) {
    if (!this.maestroAbierto(e.maestro, quien)) return false;
    const t = this.reloj();
    if (e.est.proximoPensar > t) return false;      // «still waiting for reset time»

    if (e.sonido) this.salidas.push({ tipo: "sonido", sonido: e.sonido, entidad: e.i });

    // `reqhp`/`reqavghp`/`reqplayers` -> `reqelsetarget`. Ninguno de los dos
    // mapas los usa; se dejan pasar y se dice, en vez de fingir que no existen.
    if (e.reqhp || e.reqavghp || e.reqjugadores) {
      this.salidas.push({ tipo: "aviso", que: "req_sin_portar", entidad: e.i });
    }

    this.usarObjetivos(e, quien, USO.ALTERNAR, 0);
    if (e.mensaje) this.salidas.push({ tipo: "mensaje", texto: e.mensaje, quien });
    if (e.evento) this.salidas.push({ tipo: "evento", evento: e.evento, quien });

    const espera = Number(e.espera);
    if (espera > 0) {
      e.est.proximoPensar = t + espera;
    } else {
      // `m_flWait` es −1 en un `trigger_once`: deja de tocar y se borra.
      e.vivo = false;
      this.salidas.push({ tipo: "borrar", entidad: e.i, clase: e.clase, nombre: e.nombre ?? null });
    }
    return true;
  }

  /**
   * `CBaseTrigger::TeleportTouch`, `triggers.cpp:2275-2482`.
   *
   * Tres cosas que no se adivinan:
   *   - los destinos **se ciclan**, no se sortean (`iTeleIdx++`, OCT2011_28,
   *     y el comentario de al lado dice que antes era al azar);
   *   - la Z se corrige con `mins.z` del que viaja, porque su `origin` está en
   *     el centro y el destino se da a los pies, **y luego se suma uno**;
   *   - el `delay` aquí no retrasa: es un ENFRIAMIENTO (JUL2013_08).
   */
  _teletransportar(e, quien) {
    if (!this.maestroAbierto(e.maestro, quien)) return false;
    const t = this.reloj();
    if (e.retraso > 0 && e.est.ultimoDisparo > 0 && e.est.ultimoDisparo + e.retraso > t) return false;

    // `SUB_UseTargets` va ANTES de mover, y con el `target` del teletransporte
    // —o sea que el destino recibe también el disparo si es disparable.
    this.usarObjetivos(e, quien, USO.ALTERNAR, 0);
    if (e.evento) this.salidas.push({ tipo: "evento", evento: e.evento, quien });

    const destinos = e.destinos ?? [];
    if (!destinos.length) return false;
    if (e.est.indiceTele > destinos.length - 1) e.est.indiceTele = 0;
    const d = destinos[e.est.indiceTele];
    e.est.indiceTele++;
    e.est.ultimoDisparo = t;
    this.salidas.push({
      tipo: "teletransportar", entidad: e.i, quien,
      unidades: d.unidades, angulos: d.angulos ?? [0, 0, 0],
      // Lo aplica el mundo, que es quien sabe el `mins.z` del que viaja.
      sumaPies: true, sumaUno: true,
    });
    return true;
  }

  /** `CTriggerPush::Touch`, `triggers.cpp:2208-2270`. */
  _empujar(e, quien, esJugador) {
    const b = Number(e.banderas) || 0;
    if ((b & SF.EMPUJE_APAGADO) && !e.est.encendido) return false;
    // OJO: el empuje usa OTRAS dos banderas que el resto de disparadores, y con
    // los mismos números. `SF_TRIGGER_HURT_CLIENTONLYTOUCH` es 32 y
    // `SF_TRIGGER_HURT_NO_CLIENTS` es 8 (triggers.cpp:32-34), no el 1 y el 2.
    if ((b & 32) && !esJugador) return false;
    if ((b & 8) && esJugador) return false;
    if (e.evento) this.salidas.push({ tipo: "evento", evento: e.evento, quien });
    const v = (e.direccion ?? [0, 0, 0]).map((c) => c * (Number(e.velocidad) || 100));
    this.salidas.push({
      tipo: "empujar", entidad: e.i, quien, velocidad: v,
      // Con la bandera se SUMA a la velocidad y el empujador desaparece; sin
      // ella es un campo continuo que va a `basevelocity`.
      unaVez: Boolean(b & SF.EMPUJE_UNA_VEZ),
    });
    if (b & SF.EMPUJE_UNA_VEZ) e.vivo = false;
    return true;
  }

  // --- el reloj -------------------------------------------------------------

  /**
   * Un paso del mundo: vencen los retrasos y piensan los managers.
   *
   * Se llama con el reloj ya movido. Devuelve cuántas cosas pasaron, que es lo
   * que permite a una prueba distinguir «no ha llegado la hora» de «no hace
   * nada».
   */
  paso() {
    const t = this.reloj();
    let n = 0;
    // Los retrasos vencidos, en orden de vencimiento y no de llegada.
    const vencidos = this.pendientes.filter((p) => p.cuando <= t).sort((a, b) => a.cuando - b.cuando);
    if (vencidos.length) {
      this.pendientes = this.pendientes.filter((p) => p.cuando > t);
      for (const p of vencidos) {
        if (p.matar) this._matar(p.matar);
        // SIN `quien`, Y ES A PROPÓSITO (documentado en el 68).
        //
        // Un retraso no lo sirve la entidad que lo pidió: `CBaseDelay::
        // SUB_UseTargets` **crea una entidad nueva** cuando `m_flDelay != 0`
        // (subs.cpp:252-269), la llama `"DelayedUse"`, le copia el `target` y el
        // `killtarget`, le pone `m_flDelay = 0` «to prevent recursion» y se va.
        // Es esa copia la que dispara, cuatro segundos después, y por tanto la
        // que llega como `pCaller` al otro lado.
        //
        // Aquí está `p.de`, el índice del que lo pidió, y pasarlo «para que
        // funcione» sería inventarse otro Master Sword: el mod avisa de la
        // consecuencia por su nombre, en la primera línea de `CMultiSource::Use`
        // (buttons.cpp:173-176):
        //
        //   //Dogg: WARNING, can't used multi_source with triggers that have a
        //   //delay. If they have a delay, a copy is created and that copy's
        //   //address doesn't match up with the original
        //
        // Que es exactamente el corral de Edana: `wave3_1` y `wave3_2` tienen
        // `delay 4`, así que `multisource wave3` los rechaza por no ser miembros
        // y **el jefe jabalí no llega a desbloquearse**. Se anota para que se vea.
        if (p.objetivo) {
          this.salidas.push({ tipo: "uso_retrasado", objetivo: p.objetivo, de: p.de ?? null });
          this.disparar(p.objetivo, p.activador, p.uso, p.valor);
        }
        n++;
      }
    }
    // LAS PUERTAS (el 70), que tienen su propio `nextthink` y no el de arriba.
    //
    // Va en un bucle aparte a propósito: `proximoPensar` es del multi_manager y
    // el `else` de abajo lo apaga para todo lo demás. Colgar la puerta de ese
    // campo habría sido meterla en una cola que alguien más limpia — y eso no
    // da un error, da una puerta que se queda a medias.
    //
    // Dos vencimientos y en este orden: primero llegar, luego cerrarse sola.
    // Al revés, una puerta con `wait 0` llegaría arriba y se quedaría un paso
    // entero antes de bajar.
    for (const e of this.entidades) {
      if (!e.vivo || !ES_CORREDERA.has(e.clase)) continue;
      if ((e.est.puerta === "subiendo" || e.est.puerta === "bajando") && e.est.puertaFin <= t) {
        this._puertaLlega(e); n++;
      }
      if (e.est.puerta === "arriba" && e.est.puertaPiensa >= 0 && e.est.puertaPiensa <= t) {
        // `SetThink(&CBaseDoor::DoorGoDown)` (doors.cpp:661). Baja sola, y el
        // activador que lleva al llegar abajo sigue siendo el que la abrió.
        this._puertaArranca(e, "bajando",
          e.est.puertaActivador === null ? null : this.entidades[e.est.puertaActivador] ?? null);
        n++;
      }
    }
    for (const e of this.entidades) {
      if (!e.vivo || e.est.proximoPensar < 0 || e.est.proximoPensar > t) continue;
      if (e.clase === "multi_manager" || e.clase === "mstrig_multi") { this._managerPiensa(e); n++; }
      else e.est.proximoPensar = -1;
    }
    return n;
  }
}
