// UN OBJETO TAMBIÉN ES UNA ENTIDAD CON GUION — el 66.
//
// El 64 descubrió que el jugador es una entidad con guion y el 65 que lo que
// faltaba no era portar comandos sino LLAMAR. Esto es la otra mitad de lo
// mismo, y es la que contesta «qué le afecta al jugador»: casi todo lo que le
// pasa se lo hace un objeto que lleva encima.
//
// ── LA INTERFAZ ES `callexternal ent_owner` ─────────────────────────────────
//
// El guion del jugador tiene **63 eventos que sólo puede llamar un objeto**, y
// se llaman así:
//
//     { game_deploy   callexternal ent_owner bloodstone_toggle 1 }
//                                    items/item_ring_percept.script:33-36
//
// De esos 63, **23 corren enteros** con lo que hay portado hoy. Este puerto
// llamaba a **cero**: `llamarExterno` era un no-op en los dos entornos
// (`entornoDe` de los NPC y el del jugador), así que el anillo de percepción
// nunca encendía nada. Y en el 64 escribí que «los anillos ya llaman al guion
// del jugador, que ya corre y está probado» — era falso, y está corregido al
// lado en `doc/JUGADOR_64.md`: lo único que llamaba a `bloodstone_toggle` en
// todo el proyecto era **una prueba, a mano**. Es la variante del 59.
//
// ── EL CICLO DE VIDA, QUE SON CUATRO EVENTOS DEL MOTOR ──────────────────────
//
// Al cargar el personaje, por cada objeto que lleva:
//
//     pItem->CallScriptEvent("game_spawn");
//     pItem->CallScriptEvent("game_deploy");
//     ...
//     Params.add((CharData.Gender == GENDER_MALE) ? "male" : "female");
//     Params.add("char_menu");
//     pItem->CallScriptEvent("game_wear", &Params);
//                                    playershared.cpp:1524-1544
//
// Y al ponérselo jugando, `game_wear` con **otros parámetros y un tercero que
// dice quién llamó**:
//
//     Params.add(m_pOwner->m_Race);
//     Params.add((m_pOwner->m_Gender == GENDER_MALE) ? "male" : "female");
//     Params.add("CGenericItem::WearItem");
//     CallScriptEvent("game_wear", &Params);
//                                    genericitem.cpp:1127-1135
//
// Ese tercer parámetro no es adorno: el guion distingue si se lo están poniendo
// desde el menú de personaje o en mitad de la partida. Y son TRES parámetros al
// vestir y **dos** al cargar (raza, género, quién / género, quién) — la ruta de
// carga no tiene raza porque no tiene dueño todavía, y lo dice el comentario del
// mod al lado («Can't do this way, don't have data for m_pOwner»).
//
// Al empuñar, el motor avisa al JUGADOR antes que al objeto:
//
//     m_pOwner->CallScriptEvent("game_equipped", &Params);   // params: el objeto
//     ...
//     CallScriptEvent("game_deploy");
//                                    genericitem.cpp:679-683
//
// Y al guardarlo, `game_putinpack` (genericitem.cpp:1250).
//
// ── Y LOS BUCLES QUE ARRANCAN SOLOS ─────────────────────────────────────────
//
// Lo que el usuario recordaba —«cuando equipabas el hechizo de regeneración tu
// vida regeneraba rápidamente»— no lo llama nadie. Es un `repeatdelay`, que lo
// resuelve el CARGADOR (script.cpp:5377-5382), así que arranca por existir:
//
//     { passive_regen
//       repeatdelay 0.5
//       if FAN_LOOP >= 1
//       ...
//       local MY_PASSIVE_RATE MY_SKILL   multiply 0.1   add 4
//       if ( MY_CUR_HEALTH < MY_MAX_HEALTH ) givehp MY_PASSIVE_RATE
//                        items/magic_hand_div_rejuvenate.script:155-179
//
// Con la puerta abierta por OTRO bucle, `enable_passive_regen_check`
// (`repeatdelay 1.0`), que pone `FAN_LOOP 1` en cuanto pasa el tiempo de
// preparación. O sea que el hechizo cura **por llevarlo encima**, sin lanzarlo,
// y a `divination × 0,1 + 4` de vida cada medio segundo: contra el `player_regen_hp`
// del jugador —1 de vida cada doce segundos— es otro orden de magnitud. La
// memoria del usuario era exacta.

import { Guion, entornoVacio, numDe, enteroDe, textoDeVector } from "./guion.js";
import { atributosDe, GETSTAT } from "../juego/stats.js";
import { resolverGuion } from "./cargador.js";
import { RelojDeGuiones } from "./npcguion.js";
import { habilidadDeGuion } from "./habilidad.js";

/**
 * Los eventos con que el motor mueve un objeto. Están aquí y no repartidos por
 * el código para poder leer de un vistazo qué parte del ciclo está viva.
 */
export const EVENTOS_DEL_OBJETO = Object.freeze({
  /** Nace. Sin parámetros. `playershared.cpp:1524`. */
  NACE: "game_spawn",
  /** Se empuña. Sin parámetros. `genericitem.cpp:683`. */
  EMPUNA: "game_deploy",
  /** Se viste. 1: raza 2: género 3: quién llamó. `genericitem.cpp:1127-1135`. */
  VISTE: "game_wear",
  /** Se guarda en la mochila. Sin parámetros. `genericitem.cpp:1250`. */
  GUARDA: "game_putinpack",
  /** Se saca de la mochila. Sin parámetros. `client.cpp:1267`. */
  SACA: "game_removefrompack",
});

/** Quién llamó a `game_wear`, que es el tercer parámetro y el guion lo mira. */
export const QUIEN_VISTE = Object.freeze({
  /** Al cargar el personaje. `playershared.cpp:1543`. */
  CARGA: "char_menu",
  /** Al ponérselo jugando. `genericitem.cpp:1134`. */
  JUGANDO: "CGenericItem::WearItem",
});

/**
 * Los guiones de objeto horneados, con los `#include` sin resolver.
 *
 * Se guarda así y no resuelto porque los objetos comparten sus plantillas casi
 * enteras: resuelto son 7,5 MB y compartido 0,7 — y es lo que hace el motor,
 * que cachea los scripts y los recorre por entidad. Ver `tools/objetosguion.mjs`.
 */
export class GuionesDeObjeto {
  constructor(ficha = null) {
    this.ficha = ficha;
    /** Los guiones ya resueltos, que no cambian entre entidades. */
    this._cache = new Map();
  }

  /** Los identificadores que hay horneados. */
  get ids() { return Object.keys(this.ficha?.objetos ?? {}); }

  /** Si un objeto tiene guion horneado. */
  tiene(id) { return Boolean(this.ficha?.objetos?.[id]); }

  /**
   * El guion de un objeto, con sus `#include` resueltos **en su sitio**.
   * Devuelve `null` si no está horneado, que es lo normal: se hornea lo
   * alcanzable en los mapas portados, no los 760 del catálogo.
   */
  resolver(id) {
    if (this._cache.has(id)) return this._cache.get(id);
    const o = this.ficha?.objetos?.[id];
    if (!o) { this._cache.set(id, null); return null; }
    const tabla = this.ficha.archivos ?? {};
    const r = resolverGuion(o.ruta, (ruta) => tabla[ruta] ?? null, new Set());
    this._cache.set(id, r);
    return r;
  }
}

/**
 * Un objeto con su guion corriendo.
 *
 * @param {GuionesDeObjeto} guiones  la tabla horneada
 * @param {string} id                el objeto
 * @param {object} jugador           el `GuionDelJugador`, que es su `ent_owner`
 * @param {Function} ahora           el reloj en segundos (`game.time`)
 * @param {Function} suceso          la consola de sucesos
 */
export class GuionDeObjeto {
  constructor({
    guiones = null, id = "", jugador = null, ahora = () => 0, suceso = null,
    maximos = null,
    // `createnpc`: lo que un objeto le pide al MUNDO, que este archivo no
    // tiene. `{ crearNpc(script, origenMotor, params, {creador}), asaDeObjeto(objeto),
    // asaDelDueño(), origenDelDueño(), objetivoDelDueño(), llamarA(asa, evento, params) }`.
    // Lo pone `src/main.js` con el `MundoDeCreados`. Sin él todo eso se apunta.
    mundo = null,
  } = {}) {
    this.id = String(id);
    this.jugador = jugador;
    this._ahora = ahora;
    this.reloj = new RelojDeGuiones();
    this.noSoportados = [];
    /** A qué eventos del jugador le ha llamado de verdad. Lo lee la sonda. */
    this.pedidos = [];
    // ── EL 96: LO QUE HACE FALTA PARA QUE UNA ARMADURA PROTEJA ────────────
    /**
     * `IsWorn()`: `m_Location == ITEMPOS_BODY`, que lo pone `WearItem`
     * (genericitem.cpp:1139). Lo lee el guion con `$get(ent_me,is_worn)`
     * (scriptcmds.cpp:1321) y es la PRIMERA línea del `game_takedamage` de
     * toda armadura: sin esto, una armadura en la mochila protegería igual.
     * Lo pone `src/play/armadura.js`, que es quien decide si cabe.
     */
    this.puesto = false;
    /** `ArmorData` (giarmor.cpp:19-74), o `null` si no ha hecho `registerarmor`. */
    this.armadura = null;
    /** `PackData` (gipack.cpp:50-77), o `null` si no ha hecho `registercontainer`. El 98. */
    this.contenedor = null;
    /** `m_CurrentDamage`: el golpe que se está repartiendo, o `null`. */
    this.golpeEnCurso = null;
    /**
     * EL 101: `m_ClEntity[ITEMENT_NORMAL]` — el modelo con que el objeto se ve
     * sobre quien lo lleva, y los `SetBody(grupo, valor)` pedidos en orden.
     * Los escribe su guion (`setmodel`, `setmodelbody`); `null` es sin modelo.
     */
    this.modelo = null;
    this.cuerpos = [];
    /**
     * EL 101: `m_Hand`, lo que contesta `game.item.hand_index`
     * (scriptcmds.cpp:1327). **La izquierda es el 0** (`hand_e`,
     * genericitem.h:15-18). El 0 de salida es lo que valía antes de resolverlo
     * —el nombre sin resolver suma 0—, no una afirmación sobre la mano: quien
     * quiere saber cómo se ve en una mano lo pone (src/play/equipovisto.js).
     */
    this.mano = 0;
    /**
     * `m_ViewModel` (genericitem.cpp:1934-1948): lo que el guion ha dejado
     * puesto con `setviewmodel`. `undefined` es «no lo ha tocado» —se ve el de
     * la ficha, como siempre—; `null` es `setviewmodel none`, la mano vacía.
     */
    this.vista = undefined;

    const r = guiones?.resolver(this.id) ?? null;
    this.hay = Boolean(r && r.eventos.length);
    const dueño = this;
    this.guion = new Guion({
      eventos: r?.eventos ?? [],
      preload: r?.preload ?? [],
      nombre: r ? `objeto ${this.id}` : `objeto ${this.id} (sin guion)`,
      ahora: () => this._ahora(),
      entorno: { ...entornoVacio(), ...entornoDelObjeto({ dueño, jugador, suceso, maximos, mundo }) },
    });
    // EL MISMO ORDEN QUE EL JUGADOR, y por el mismo motivo: `repeatdelay` lo
    // resuelve el cargador y el bloque sin nombre es un evento «programado para
    // ya» que corre en el primer `Think` (script.cpp:5198-5202). Armar antes es
    // lo que hace que la primera vuelta de un bucle salga a cero.
    this.guion.armarRepeticiones(this._ahora());
    this.guion.llamar("", []);
  }

  /** `CallScriptEvent(<nombre>, params)`. Devuelve si algún evento respondió. */
  llamar(nombre, params = []) {
    return this.guion.llamar(String(nombre), params.map((p) => String(p)));
  }

  /**
   * El ciclo de vida del motor, en su orden, al meterle el objeto al personaje.
   *
   * Es lo que hace `playershared.cpp:1524-1544` con cada objeto del personaje
   * al cargarlo: nacer, empuñar y vestir — y `game_wear` con **dos**
   * parámetros por esa ruta, porque no hay raza todavía.
   */
  arrancar({ genero = "male", quien = QUIEN_VISTE.CARGA, viste = true, puesto = false } = {}) {
    let n = 0;
    if (this.llamar(EVENTOS_DEL_OBJETO.NACE)) n++;
    if (this.llamar(EVENTOS_DEL_OBJETO.EMPUNA)) n++;
    // EL 96: una armadura en la mochila no se viste (ver `seVisteAlCargar`,
    // src/play/armadura.js), y una que ya venía puesta lo está DESPUÉS de su
    // `game_wear`, como en `WearItem` (genericitem.cpp:1135 y :1139).
    if (viste && this.llamar(EVENTOS_DEL_OBJETO.VISTE, [genero, quien])) n++;
    this.puesto = Boolean(puesto);
    return n;
  }

  /** El paso del reloj: los `repeatdelay` y los `callevent <segundos>`. */
  paso(dt = 0) {
    return this.guion.pasoDeRepeticiones(this._ahora()) + this.reloj.paso(dt);
  }
}

/**
 * El entorno de un objeto. Lo que tiene y el del jugador no es **un dueño**:
 * `ent_owner` es a quién se le está poniendo, y por ahí va casi todo.
 */
function entornoDelObjeto({ dueño, jugador, suceso, maximos, mundo = null }) {
  const yo = dueño;
  /** Las referencias que un objeto usa para hablar de su dueño. */
  const esElDueño = (ref) => {
    const r = String(ref ?? "").toLowerCase();
    return r === "ent_owner" || r === "my_owner" || r === "ent_currentplayer";
  };
  return {
    jugador: {
      get ref() { return "ent_owner"; },
      get personaje() { return jugador?.personaje ?? null; },
      get origen() { return "0 0 0"; },
    },
    npc: { nombre: yo.id, script: `objeto ${yo.id}`, origen: "0 0 0" },

    /**
     * `callexternal <ref> <evento> [params]`. ESTA es la interfaz del 66.
     *
     * Era un no-op en todo el proyecto, así que ningún objeto había encendido
     * nunca nada en el jugador. Lo que no es el dueño se apunta y no se
     * inventa: un objeto le habla también al maestro de juego, a sus
     * proyectiles y a otros jugadores, y nada de eso existe aquí.
     */
    llamarExterno(ref, nombre, params = []) {
      // A lo que este objeto ha creado (`callexternal SWORD_ID return_to_owner`,
      // swords_blood_drinker.script:199): por su asa, si el mundo la conoce.
      if (!esElDueño(ref) && mundo?.llamarA?.(String(ref), String(nombre), params.map(String))) return;
      if (!esElDueño(ref)) { yo.noSoportados.push({ tipo: "callexternal", nombre: `${ref} ${nombre}` }); return; }
      const dicho = Boolean(jugador?.llamar(nombre, params));
      yo.pedidos.push({ evento: String(nombre), params: params.map(String), contestado: dicho });
      // Un evento que el jugador no tiene NO es un fallo del objeto: son 16 de
      // los 79 y algunos están comentados en el propio mod (`//{ ext_nopush_on`,
      // player/externals.script:917). Se apunta para que se pueda contar.
      if (!dicho) yo.noSoportados.push({ tipo: "evento del jugador", nombre: String(nombre) });
    },

    /**
     * `$get(ent_owner, …)`. El objeto lee al jugador por aquí, y es lo que
     * hace que la curación dependa de la habilidad de quien lo lleva.
     */
    propiedad(ref, prop, resto = []) {
      const nombre = String(prop ?? "");
      const r = String(ref ?? "").toLowerCase();
      // EL 96. `$get(ent_me,is_worn)` — `pItem->IsWorn()`, scriptcmds.cpp:1321.
      if (nombre === "is_worn") return r === "ent_me" ? (yo.puesto ? "1" : "0") : "0";
      // EL 96. `$get(<otro>,scriptvar,'<VAR>')` — `GetFirstScriptVar`
      // (scriptcmds.cpp:1295, script.cpp:5949-5955), que devuelve EL NOMBRE si
      // la variable no existe. Lo pregunta la armadura del ATACANTE
      // (`NPC_IGNORES_ARMOR`, armor_base.script:232), y en los 2 884 guiones no
      // la declara ningún NPC: sólo aparece en las dos plantillas de armadura.
      // Así que contestar el nombre es exacto, y se apunta para que se vea.
      if (nombre === "scriptvar") {
        if (!esElDueño(ref) && r !== "ent_me") yo.noSoportados.push({ tipo: "scriptvar de otra entidad", nombre: String(resto[0] ?? "") });
        return String(resto[0] ?? "");
      }
      // `$get(ent_me,id)` — `EntToString` del propio objeto (scriptcmds.cpp:936).
      // Es lo que un arma le pasa a su invocación para que le llame de vuelta
      // (PARAM5 de la Blood Drinker, swords_blood_drinker.script:171). Sin
      // mundo no hay registro de asas y sigue vacío, como antes.
      if (nombre === "id" && r === "ent_me") return mundo?.asaDeObjeto?.(yo) ?? "";
      if (!esElDueño(ref)) return "";
      // Del dueño, lo que sólo sabe el mundo: dónde está —`pev->origin`, el
      // centro de su caja, «(x,y,z)» en unidades del motor (scriptcmds.cpp:1144)—
      // y a quién mira (`ENT_TARGET`, :1178-1182; «0» si a nadie).
      if (nombre === "origin" && mundo?.origenDelDueño) {
        const o = mundo.origenDelDueño();
        return o ? textoDeVector(o) : "0";
      }
      if (nombre === "target") return mundo?.objetivoDelDueño ? String(mundo.objetivoDelDueño() ?? "0") : "0";
      const p = jugador?.personaje;
      // EL 101. SIN DUEÑO, `$get` devuelve «0» (`if (pEntity) … return "0"`,
      // script.cpp:1195-1198), y de eso depende lo que se ve en la pantalla de
      // elección: `if ( OWNER_GENDER equals 0 ) local OWNER_GENDER PARAM2`
      // (armor_base.script:130). Sólo para estas dos, que son las que se
      // midieron; las demás siguen dando vacío como antes.
      if (!p && (nombre === "gender" || nombre === "race")) return "0";
      if (!p) return "";
      // EL 96. `$get(ent_owner,stat.strength)` — `GetNatStat`, que es
      // `GetStat(i, 0)` (msmonster.h:415; scriptcmds.cpp:1606-1622). Es
      // `atributosDe` de src/juego/stats.js, con su truncado.
      if (nombre.startsWith("stat.")) {
        const s = nombre.slice(5).split(".")[0];
        if (nombre.includes(".max")) return "100";
        const v = atributosDe(p.habilidades)[s];
        return v === undefined ? "0" : String(v);
      }
      switch (nombre) {
        case "name": return String(p.nombre ?? "");
        case "hp": return String(p.vida ?? 0);
        // El máximo NO se guarda: se deriva de las habilidades. Ver la nota de
        // `maximos` en el constructor — aquí se estrelló la curación del 66.
        case "maxhp": return String(maximos?.().vida ?? p.vidaMax ?? p.vida ?? 0);
        case "mp": return String(p.mana ?? 0);
        case "maxmp": return String(maximos?.().mana ?? p.manaMax ?? p.mana ?? 0);
        case "gold": return String(p.oro ?? 0);
        // EL 101. Lo que pregunta `barmor_update_vest` para elegir el submodelo
        // de mujer (armor_base.script:123-124): `gender` es «male»/«female»
        // (scriptcmds.cpp:1523) y `race`, `_strlwr(m_Race)` (:1390).
        case "gender": return p.genero === "female" ? "female" : "male";
        case "race": return "human";
        // `$get(ent_owner,id)` es el asa con que el guion se lo pasa a otros.
        case "id": return "ent_owner";
        default: break;
      }
      // `$get(ent_owner, skill.spellcasting.divination)`: la habilidad, que es
      // lo que gradúa casi todos los efectos de objeto. Las reglas del motor
      // están en `src/play/habilidad.js`, que son más de las que parecen.
      if (nombre.startsWith("skill.")) return habilidadDeGuion(p, nombre);
      return "";
    },

    /**
     * `givehp`/`givemp`: la curación pasiva sale por aquí.
     *
     * `null` es «la entidad de este guion», o sea el objeto — y un objeto se lo
     * pasa a su dueño, que es lo que hace que el hechizo de rejuvenecer te cure
     * a TI y no a sí mismo:
     *
     *     float CGenericItem::Give(enum givetype_e Type, float Amt) {
     *       if (m_pOwner) return m_pOwner->Give(Type, Amt);   //Pass it to my owner
     *                                            genericitem.cpp:2298-2302
     *
     * Sin dueño se cura el objeto, que no tiene vida: no pasa nada, y es el
     * caso de un objeto tirado en el suelo.
     */
    dar(que, ref, cantidad) {
      if (ref !== null && ref !== undefined && !esElDueño(ref)) return;
      jugador?.recibir?.(que, cantidad);
    },

    mensajeAlJugador(_aQuien, texto, cual) {
      const tipo = cual === "gplayermessage" ? "bueno"
        : (cual === "rplayermessage" || cual === "dplayermessage") ? "nopuedes"
          : "normal";
      suceso?.(tipo, texto);
    },

    programar: (s, que) => yo.reloj.programar(s, que),
    apuntar: (tipo, nombre) => yo.noSoportados.push({ tipo, nombre }),

    // ── EL 96: LA ARMADURA ─────────────────────────────────────────────────
    //
    // Lo que un `game_takedamage` de armadura y su `game_wear` le preguntan al
    // mundo. Ver `src/play/armadura.js`, que es quien llama.

    /** Las propiedades que sólo tienen sentido aquí. */
    // EL 101: `gender` también. Sin estar aquí el intérprete contestaba «0»
    // ANTES de preguntar (guion.js, `PROPIEDADES`), y la coraza de mujer salía
    // bien de rebote: por el `PARAM2` al que el guion cae cuando lee «0»
    // (armor_base.script:130). Lo destapó romper el `case "gender"` a
    // propósito y ver las 29 pruebas en verde.
    propiedadesPropias: new Set(["is_worn", "scriptvar", "gender", ...STATS.map((s) => `stat.${s}`),
      // `$get(ent_owner,target)`: sólo con mundo; sin él se apunta, como antes.
      ...(mundo?.objetivoDelDueño ? ["target"] : []),
      // `$get(ent_owner,mp)` — `RETURN_FLOAT(pMonster->m_MP)`. Su `case` está
      // en `propiedad` desde el 66 y NO se llegaba a él: `mp` no está en
      // `PROPIEDADES` (guion.js) y el intérprete contestaba «0» antes de
      // preguntar. Lo destapó la Blood Drinker: `if $get(ent_owner,mp) <
      // THROW_MP` (swords_blood_drinker.script:158) era SIEMPRE cierto y la
      // espada volvía a la mano en el mismo `throwsword_start` que la quitaba.
      // 72 líneas de `items/` preguntan esto mismo. Es el `gender` del 101
      // otra vez: un `case` escrito detrás de una puerta cerrada.
      "mp"]),

    /**
     * `createnpc` desde un OBJETO (scriptcmds.cpp:2766-2816). Quien crea es el
     * mundo. Una cosa es de este puerto y va dicha: el asa con la que un objeto
     * conoce a su dueño es «ent_owner» (`$get(ent_owner,id)`, arriba), que
     * fuera de este guion no significa nada; al cruzar a la entidad creada se
     * cambia por el asa del jugador que ella sí reconoce.
     */
    crearNpc(script, origen, params = []) {
      if (!mundo?.crearNpc) { yo.noSoportados.push({ tipo: "comando", nombre: `createnpc ${script} (sin mundo)` }); return null; }
      const suyo = mundo.asaDelDueño?.() ?? "ent_owner";
      const asa = mundo.crearNpc(String(script), origen, params.map((x) => (esElDueño(x) ? suyo : String(x))), { creador: mundo.asaDeObjeto?.(yo) ?? null });
      if (!asa) yo.noSoportados.push({ tipo: "createnpc", nombre: String(script) });
      return asa;
    },

    /** `setviewmodel <ruta|none>` — genericitem.cpp:1934-1948. */
    ponerModeloDeVista(ruta) {
      const r = String(ruta ?? "");
      yo.vista = r.toLowerCase() === "none" ? null : r;
    },

    /** `registerarmor` — giarmor.cpp:19-74. `Protection` es `atof` de lo que valga YA. */
    registrarArmadura({ tipo, proteccion, zonas, reemplaza }) {
      yo.armadura = {
        tipo: String(tipo ?? ""), proteccion: numDe(proteccion), zonas: String(zonas ?? ""),
        // EL 101: `m_WearModelPositions`, de `ARMOR_REPLACE_BODYPARTS` y en el
        // orden de los cuatro `strstr` (giarmor.cpp:43-51). Lo lee el muñeco.
        reemplaza: ["head", "chest", "arms", "legs"].filter((z) => String(reemplaza ?? "").includes(z)),
      };
    },

    // ── EL 101: EL MODELO QUE SE LE CUELGA AL MUÑECO ───────────────────────
    //
    // La mitad del CLIENTE de `Script_ExecuteCmd` (genericitem.cpp:2199-2225):
    //
    //     setmodel none      -> m_ClEntNormal.model = NULL
    //     setmodel <ruta>    -> Mod_ForName("models/" + ruta)      — NO toca el body
    //     setmodelbody g v   -> si hay modelo, m_ClEntNormal.SetBody(g, v)
    //
    // `SetBody` (clrenderent.cpp:102-117) necesita las bases del `.mdl`, que
    // este archivo no tiene: aquí se guarda la LISTA de lo pedido, en orden, y
    // `cuerpoDe` de src/play/equipovisto.js la pliega contra el manifiesto.
    // Se vacía al cambiar de modelo porque un `body` de otro archivo no dice
    // nada del nuevo — elección nuestra: el motor conserva el entero, y en los
    // guiones todo `setmodel` va seguido de su `setmodelbody`.
    ponerModelo(ruta) {
      const r = String(ruta ?? "");
      const nuevo = r.toLowerCase() === "none" ? null : r;
      if (nuevo !== yo.modelo) yo.cuerpos = [];
      yo.modelo = nuevo;
    },
    indiceDeMano: () => yo.mano,
    ponerCuerpo(grupo, valor) {
      if (!yo.modelo) return;                    // `if (m_ClEntNormal.model)`, :2218
      yo.cuerpos.push([grupo, valor]);
    },

    /**
     * `registercontainer` — gipack.cpp:50-77. `MaxItems` es `atof` (0 sin
     * número) y las dos máscaras van por `TokenizeString`, que corta en `;` y
     * PARA en el primer trozo vacío (stackstring.cpp:143-159). El 98.
     */
    registrarContenedor({ maximo, acepta, rechaza }) {
      const trozos = (s) => {
        const out = [];
        for (const t of String(s ?? "").split(";")) { if (t === "") break; out.push(t); }
        return out;
      };
      yo.contenedor = {
        maximo: Math.trunc(Number.parseFloat(maximo ?? "0")) || 0,
        acepta: trozos(acepta), rechaza: trozos(rechaza),
      };
    },

    /** `setdmg` — genericitem.cpp:2174-2191. Sin golpe en curso no hace nada. */
    cambiarDano(que, valor) {
      const g = yo.golpeEnCurso;
      if (!g) return;
      if (que === "dmg") g.dano = numDe(valor);
      else if (que === "type") g.tipo = String(valor);
      else if (que === "hit") g.acierto = enteroDe(valor) !== 0;
    },

    /** `$get_takedmg(ent_owner, <tipo>)`: las resistencias del dueño. */
    recibeDano(ref, tipo) {
      if (!esElDueño(ref)) { yo.noSoportados.push({ tipo: "$get_takedmg", nombre: String(ref) }); return null; }
      return jugador?.resistencias?.leer?.(tipo) ?? null;
    },

    /** `$get_scriptflag(ent_owner, …)`: las banderas son de la entidad del dueño. */
    banderas: (ref) => (esElDueño(ref) ? jugador?.banderas ?? null : null),

    /** `infomsg ent_owner <título> <texto>`: la ventana de su dueño. */
    aviso(quien, titulo, texto) {
      if (!esElDueño(quien)) { yo.noSoportados.push({ tipo: "infomsg", nombre: String(quien) }); return; }
      jugador?.guion?.entorno?.aviso?.("ent_me", titulo, texto);
    },

    /** `applyeffect ent_owner <efecto> …`: el anfitrión es el dueño (scriptcmds.cpp:1865-1929). */
    aplicarEfecto(ref, ruta, params = [], opciones = {}) {
      if (!esElDueño(ref) || !jugador?.guion?.entorno?.aplicarEfecto) {
        yo.noSoportados.push({ tipo: "applyeffect", nombre: `${ref} ${ruta}` });
        return null;
      }
      return jugador.guion.entorno.aplicarEfecto("ent_me", ruta, params, opciones);
    },
  };
}

/** Los seis atributos de `$get(<jugador>,stat.<nombre>)`, en el orden de `GETSTAT`. */
const STATS = Object.keys(GETSTAT);
