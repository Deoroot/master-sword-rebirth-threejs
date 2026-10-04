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

import { Guion, entornoVacio, numDe, enteroDe } from "./guion.js";
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

    const r = guiones?.resolver(this.id) ?? null;
    this.hay = Boolean(r && r.eventos.length);
    const dueño = this;
    this.guion = new Guion({
      eventos: r?.eventos ?? [],
      preload: r?.preload ?? [],
      nombre: r ? `objeto ${this.id}` : `objeto ${this.id} (sin guion)`,
      ahora: () => this._ahora(),
      entorno: { ...entornoVacio(), ...entornoDelObjeto({ dueño, jugador, suceso, maximos }) },
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
function entornoDelObjeto({ dueño, jugador, suceso, maximos }) {
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
      if (!esElDueño(ref)) return "";
      const p = jugador?.personaje;
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
    propiedadesPropias: new Set(["is_worn", "scriptvar", ...STATS.map((s) => `stat.${s}`)]),

    /** `registerarmor` — giarmor.cpp:19-74. `Protection` es `atof` de lo que valga YA. */
    registrarArmadura({ tipo, proteccion, zonas }) {
      yo.armadura = { tipo: String(tipo ?? ""), proteccion: numDe(proteccion), zonas: String(zonas ?? "") };
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
