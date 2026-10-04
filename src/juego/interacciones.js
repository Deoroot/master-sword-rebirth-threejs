// Las conversaciones pertenecen a la partida, no al dibujo ni al panel.
// Extraído de main.js: conserva el camino de msmonsterserver.cpp:2884-3013.
// No importa DOM ni Three; la selección del objetivo sigue junto al combate.
import { GuionDeNpc, RelojDeGuiones, CIERRE_DE_BICHO, comoF, aMotor, paramsDeDodamage } from "../play/npcguion.js";
// El 91: el nombre de la habilidad como lo manda el motor en PARAM6 de
// `game_damaged` (`pStat->m_Name`, msmonsterserver.cpp:2290-2304).
import { HABILIDADES } from "./stats.js";
import { Entidades } from "../play/entidades.js";
import { Tiendas, Comercio } from "../play/tienda.js";
import { opcionesDe, opcionesDelJugador } from "../play/opciones.js";
// El 85: lo que HACEN las seis opciones de tu propio menú. Ver `elegidoDelJugador`.
import { descripcionDeObjeto, perdonar } from "../play/menujugador.js";
// El 79: la voz del jugador se monta y se mide con LA MISMA regla que el chat
// del 61. Dos copias del alcance serían dos mundos — la lección del 63.
import { frase, sinComillas, tieneContenido, distancia2D, HABLA, RANGO_LOCAL } from "../play/chat.js";

/**
 * ¿Lleva este bicho FICHA DE COMBATE? — el 91.
 *
 * Todos los bichos horneados llevan `ia` (hasta el alcalde: es lo que les da
 * un `Cazador` que decide si atacar, y con `relacion` amistosa no ataca).
 * Lo que distingue a quien pelea es el DAÑO: `ATTACK_DAMAGE` y sus primos,
 * leídos por `tools/bicho.mjs`. Ver la cuenta por mapa en
 * doc/BICHOS_GUION_91.md; los tres ballesteros zombis de Gate City NO entran
 * —disparan, y su daño va en el proyectil—, y eso queda dicho allí.
 *
 * Sólo éstos nacen con guion y con `CIERRE_DE_BICHO`. A un NPC sin daño se le
 * sigue creando el guion cuando alguien le habla, como desde el 33, y sin
 * cierre: sus escenas usan `npcatk_suspend_ai` y compañía a su manera.
 */
export const esDeCombate = (i) => Boolean(i?.ficha?.ia?.dano);

/** «jugador» o «j3»: un objetivo que es un jugador. Igual que `esJugador` de manada.js. */
const esUnJugador = (id) => id === "jugador" || /^j\d+$/.test(String(id ?? ""));

export class InteraccionesNpc {
  constructor({ sesion, guiones = null, menus = null, catalogo = null,
    // `ventanaDeAviso` es el `infomsg` de los guiones, que desde el 60 va a
    // la ventana de arriba a la izquierda y no a la consola de sucesos.
    areas = [], npcPorId, suceso, animar, borrarDelMundo, ventanaDeAviso,
    // El 62: `{distancia, vivo, mirando}` de la pareja vendedor/cliente, en
    // unidades de GoldSrc. Sin esto la correa NO corre — ver `paso`.
    abrirTienda, comoEstaElCliente = null,
    // El 79: para repartir la voz hacen falta tres cosas que esta clase no
    // tiene — la lista de NPC con su sitio, dónde están los pies del jugador
    // y la escala del mundo. Sin ellas una opción `say` no llega a nadie, y
    // eso se cuenta (`sinSitio`) en vez de taparse con un alcance infinito.
    losNpc = null, dondeEstaElJugador = null, unidadesPorMetro = 39.37,
    // El 81. **Es una FÁBRICA, no el gancho**: `(instancia, avisar, apuntar)`
    // devuelve el `(destino, opciones) => bool` que `setmovedest` necesita.
    // Va así porque quien sabe mover un NPC es la manada, que vive en
    // `src/main.js`, y los tres eventos de vuelta —`game_movingto_dest`,
    // `game_stopmoving`, `game_reached_dest`— son eventos DEL PROPIO guion y
    // tienen que volver a él. Sin esto, `setmovedest` no llega a nada, como
    // desde el 43.
    mandarADestino = null,
    // El 81. El rayo de `$cansee`: `(refObjetivo, instancia) => boolean`. Es
    // el `FMVisible` de npcscript.cpp:1824 y vive en la física, o sea en
    // `src/main.js`. Sin él el getter da «0» y lo apunta, que es lo honesto:
    // un NPC que no puede comprobar si te ve no se inventa que te ve.
    lineaDeVision = null,
    // ── EL 85: EL MENÚ DEL PROPIO JUGADOR, que es el OTRO lado de `pedir` ──
    //
    // `pedir` sabía contestar las seis opciones del jugador desde el 60 y
    // `elegido` no tenía su rama, así que las seis caían en «este NPC no tiene
    // guion portado». Estos tres ganchos son lo que hace falta para cerrarla, y
    // van inyectados porque las tres cosas viven fuera de esta clase:
    //
    //   `emociones`     el estado de sentarse y los emotes (`src/play/menujugador.js`)
    //   `enLaMano`      qué objeto empuña, para `itemdesc` — lo sabe el equipo
    //   `verDescripcion` dónde se escribe esa descripción: en el original es una
    //                   ventana del cliente, no la consola (ver abajo)
    //
    // Si falta `emociones` NO se finge: se apunta y se dice. Un `?.()` callado
    // aquí sería el `=> {}` del 66 otra vez, en el sitio exacto del fallo.
    emociones = null, enLaMano = null, verDescripcion = null,
    // LOS EFECTOS: `(ruta, params, {aplicador})` que se lo pega AL JUGADOR
    // (`src/play/efectos.js`). Lo tiene `src/main.js`, que es quien tiene el
    // guion del jugador. Se reenvía a cada `GuionDeNpc` en `guionDe` (el 63).
    aplicarEfecto = null,
    // ── EL 92: QUIÉN ES «j3» ─────────────────────────────────────────────
    //
    // `(idDeObjetivo) => sesion | null`. Sólo lo pasa el SERVIDOR
    // (`src/red/partida.js`): allí la manada conoce a los jugadores como
    // «j1», «j2»… (`Fauna.nombreDeJugador`) y la sesión de cada uno es otra.
    // Sin esto la costura del 91 contaba todos los golpes como del jugador del
    // constructor, que en el servidor es `null`. En un navegador no se pasa y
    // `alCombate` hace exactamente lo de antes. Ver `alCombate`.
    jugadorDe = null } = {}) {
    Object.assign(this, { sesion, guiones, menus, catalogo, npcPorId, suceso, animar, borrarDelMundo, ventanaDeAviso, abrirTienda, comoEstaElCliente, losNpc, dondeEstaElJugador, unidadesPorMetro, mandarADestino, lineaDeVision, emociones, enLaMano, verDescripcion, aplicarEfecto, jugadorDe });
    /**
     * Las opciones que se le mandaron al jugador en la última apertura de SU
     * menú, para poder resolver el índice que vuelve.
     *
     * Y no es una comodidad: es lo que hace el motor. El cliente manda
     * `menuoption <ent> <Data>` y el servidor lo resuelve contra la lista que él
     * registró (`pPlayer->ParseMenu(OldMenu, slot)`,
     * multiplay_gamerules.cpp:1578-1588). Volver a construir la lista en
     * `elegido` sería una segunda fuente para la misma lista, y el menú CAMBIA
     * de tamaño según si estás sentado: de pie son seis opciones y sentado tres,
     * así que dos listas construidas en momentos distintos pueden no coincidir.
     */
    this.menuDelJugador = [];
    // Un CScript por entidad durante la vida del mapa. Las misiones y objetos
    // del jugador siguen en la sesión, que puede cambiar de personaje.
    this.guionesVivos = new Map();
    /**
     * CON QUIÉN ESTÁ HABLANDO EL GUION AHORA MISMO.
     *
     * El guion es uno por NPC y sus recados —abrir la tienda, un `infomsg`—
     * van a UNA pantalla: la del que habló. Con un solo jugador era obvio y
     * con varios hay que decirlo, porque si no el vendedor le abre la tienda
     * al que pasaba por allí. En el mod esto no hace falta porque el jugador
     * viaja como parámetro del evento (`client.cpp:485-490`) y el mensaje se
     * manda con `MESSAGE_BEGIN(MSG_ONE, ..., pEnt->edict())`.
     */
    this.hablandoCon = null;
    /**
     * LAS TIENDAS, UNA LISTA PARA TODAS — experimento 62.
     *
     *     static storelist m_gStores;        vgui_store.h / CStore
     *
     * El mod las tiene en una lista global por nombre, y hasta ahora cada
     * `GuionDeNpc` se creaba la suya porque el parámetro tenía valor por
     * omisión. Con un jugador da igual —cada vendedor nombra la suya—; con
     * dos no, porque **el estante tiene que ser el mismo** para los dos, y
     * porque quien sirva la tienda por la red necesita un sitio donde
     * buscarla por nombre.
     */
    this.tiendas = new Tiendas();
    /**
     * EL TRATO EN CURSO CON CADA VENDEDOR — `MONSTER_TRADING`, el 62.
     *
     * Con un jugador no se nota; con dos es lo que hace que el segundo reciba
     * `_busy` en vez de abrir una copia del estante. `comoEstaElCliente` es lo
     * único que hace falta de geometría y se inyecta, porque este archivo no
     * sabe dónde está nadie: devuelve `{distancia, vivo, mirando}` en unidades
     * de GoldSrc, que es en las que está escrita la correa de 128.
     */
    this.comercio = new Comercio();
    this.reloj = new RelojDeGuiones();
    this.entidades = new Entidades();
    // Sólo las áreas ya simuladas. `deleteent` sigue conectado al Aparecedor
    // local; este refactor no añade ejecución de guiones al servidor remoto.
    for (const a of areas) this.entidades.registrar(a.nombre);
    // El 81: los NPC entran en el registro perezosamente, la primera vez que
    // alguien pregunta por un nombre. No se puede hacer aquí porque `losNpc`
    // todavía no devuelve nada: la manada se monta después que esto.
    this.nombresPuestos = false;
    /**
     * EL 91: la manada cuyos golpes llegan a los guiones, y lo que se ha
     * quedado por el camino. `sinGuion` son golpes a un bicho de combate sin
     * guion horneado; `noDeCombate` golpes a un NPC sin ficha de combate, que
     * en el motor también reciben `game_struck` y aquí todavía no (se dice).
     *
     * EL 94: ya lo reciben —`recibe` y `muere`, ver `_alCombate`— y se
     * cuentan en `aldeanos`. `noDeCombate` queda para lo demás (un aldeano no
     * ataca, así que en la práctica no debería subir).
     */
    this.manadaEnchufada = null;
    this.costura = { sinGuion: 0, noDeCombate: 0, nacidos: 0, renacidos: 0, sinJugador: 0 };
    /** EL 94: asa del jugador -> su id en la manada. Ver `fijarObjetivoDe`. */
    this._idPorAsa = new Map();
  }

  /**
   * **LA COSTURA SE ENCHUFA** — el 91. Quien monta la manada llama a esto una
   * vez; desde entonces los bichos de combate nacen con su guion (`paso`) y
   * los golpes le llegan (`alCombate`).
   *
   * No se hace en el constructor porque la manada se monta DESPUÉS que esta
   * clase (ver `ponerNombresDeNpc`), y en el servidor de `src/red/` todavía no
   * se llama: allí la manada no tiene oyente y lo cuenta en
   * `costuraSinOyente`.
   *
   * EL 92: ya se llama también allí, en el constructor de `Partida`
   * (doc/COSTURA_RED_92.md). La frase de arriba era verdad en el 91 y se deja.
   */
  enchufarA(manada) {
    if (!manada || this.manadaEnchufada === manada) return false;
    this.manadaEnchufada = manada;
    manada.oyente = (s) => this.alCombate(s);
    return true;
  }

  /**
   * **LOS BICHOS DE COMBATE NACEN CON SU GUION** — el 91.
   *
   * En el motor el guion se carga con la entidad y `spawn`/`game_spawn`
   * corren al aparecer (global.cpp:435-437). Aquí el guion de un NPC se
   * creaba la primera vez que alguien le hablaba, y a un goblin no le habla
   * nadie: su guion no existía nunca. Un bicho dormido (la ficha de un área)
   * todavía no ha nacido, y uno que vuelve a salir (`revivir`) es otra
   * entidad: se le rehace, y `guionDe` se encarga de retirar el de antes.
   *
   * @returns cuántos han nacido en esta pasada.
   */
  nacerBichos() {
    if (!this.manadaEnchufada) return 0;
    let n = 0;
    for (const i of this.losNpc?.() ?? []) {
      if (!esDeCombate(i) || i.dormido || i.muerto) continue;
      const g = this.guionesVivos.get(i.id);
      if (g !== undefined && (g === null || g.nacimiento === (i.nacimientos ?? 0))) continue;
      if (this.guionDe(i)) n++;
    }
    return n;
  }

  /**
   * **UN GOLPE, AL GUION DEL BICHO** — el 91. `s` viene de `Manada._costura`.
   *
   * La IA ya ha decidido todo; esto sólo le cuenta al guion lo que el motor le
   * contaría, con sus parámetros en orden y su formato:
   *
   *   `danaAOtro`  -> `game_damaged_other` (giattack.cpp:1755-1762)
   *   `hizoDano`   -> `game_dodamage` (giattack.cpp:2036-2045)
   *   `recibe`     -> `game_damaged` (msmonsterserver.cpp:2275-2311), y luego
   *                   o `game_parry` (lo decidió `parryDelBicho`) o
   *                   `game_damaged_end` + `game_struck` (:2321-2323, :2385)
   *   `muere`      -> `game_predeath` y `game_death` (:2580, :2605)
   */
  alCombate(s) {
    // En un navegador hay un jugador y es el del constructor: lo de siempre.
    if (!this.jugadorDe) return this._alCombate(s, this.sesion, true);
    // ── EL 92: EN EL SERVIDOR, ¿DE QUÉ JUGADOR ES ESTE GOLPE? ─────────────
    //
    // El motor no tiene que preguntarlo: el jugador viaja dentro del evento,
    // como entidad (`Params.add(EntToString(pTarget))`,
    // giattack.cpp:1758; `EntToString(pAttacker)`,
    // msmonsterserver.cpp:2285). Aquí la manada da un id de objetivo —«j3»— y
    // la sesión de ese jugador hay que buscarla. Quien pega es `objetivo` en
    // los dos eventos del atacante y `quien` en los del que recibe; los del
    // 92 del daño por evento de animación (`ataca`, `animacion`) traen
    // `quien`, y si falta se mira `objetivo`.
    const principal = s?.que === "danaAOtro" || s?.que === "hizoDano" ? s.objetivo : (s?.quien ?? s?.objetivo);
    const suSesion = esUnJugador(principal) ? (this.jugadorDe(principal) ?? null) : null;
    if (esUnJugador(principal) && !suSesion) this.costura.sinJugador++;
    // Y MIENTRAS CORRE EL EVENTO, «con quién habla el guion» es ESE jugador:
    // sus `playermessage`, su `applyeffect` y la posición de su centro van a
    // él y no al último que abrió un menú. Es el `MSG_ONE` del motor
    // (`MESSAGE_BEGIN(MSG_ONE, …, pEnt->edict())`, el mismo comentario de
    // `hablandoCon` arriba). Se devuelve como estaba al acabar: el comercio y
    // los menús usan esta misma casilla.
    const antes = this.hablandoCon;
    this.hablandoCon = suSesion;
    try { return this._alCombate(s, suSesion, Boolean(suSesion)); }
    finally { this.hablandoCon = antes; }
  }

  /** El cuerpo de `alCombate`, con el jugador ya resuelto. `hayJugador` falso: su asa es «none». */
  _alCombate(s, sesion, hayJugador) {
    const i = s?.i ?? null;
    if (!i) return;
    if (!esDeCombate(i)) {
      // EL 92: los eventos de animación de un NPC sin ficha de combate (los
      // pasos de un aldeano) no son golpes: no se cuentan como tales. Ver
      // doc/MORDISCO_92.md — a un NPC al que no se le habla no le llegan.
      // EL 93: tampoco lo son las dos preguntas de la caza (`caza`, `puede`).
      // EL 98: ni las cuatro de la caza que lee el guion (`visto`,
      // `eligeAtaque`, `atacado`, `anim`).
      if (s.que === "animacion" || s.que === "ataca" || s.que === "caza" || s.que === "puede" ||
          s.que === "visto" || s.que === "eligeAtaque" || s.que === "atacado" || s.que === "anim") return;
      // ── EL 94: RECIBIR Y MORIR SÍ LE LLEGAN A UN ALDEANO ────────────────
      //
      // `TraceAttack`, `TakeDamage` y `Killed` son de `CMSMonster`, y un
      // aldeano lo es igual que un goblin: `game_damaged`, `game_struck` y
      // `game_death` le llegan en el motor sin mirar si pelea
      // (msmonsterserver.cpp:2311, :2385, :2605). Aquí se paraban, y con ellos
      // se perdía lo único que hace el aldeano al recibir: gritar y avisar a
      // los guardias (monsters/base_civilian.script:3-21). Su guion corre SIN
      // cierre —no tiene IA de caza que duplicar— y por eso entero.
      if (s.que !== "recibe" && s.que !== "muere") { this.costura.noDeCombate++; return; }
      this.costura.aldeanos = (this.costura.aldeanos ?? 0) + 1;
    }
    const g = this.guionDe(i);
    if (!g) { this.costura.sinGuion++; return; }
    const jugador = this.contextoDelJugador(sesion);
    // EL 94: el asa del jugador y su id en la manada, para el camino de vuelta
    // (`fijarObjetivoDe`): un guion que pide `npcatk_settarget <asa>` trae el
    // asa, y el cazador entiende ids de la manada.
    if (hayJugador) {
      const principal = s?.que === "danaAOtro" || s?.que === "hizoDano" ? s.objetivo : (s?.quien ?? s?.objetivo);
      if (esUnJugador(principal)) this._idPorAsa.set(String(jugador.ref), principal);
    }
    // `EntToString` del jugador: en este puerto su asa es el id del
    // personaje, la misma que ve el guion en `ent_lastspoke` (el 45).
    const ref = (id) => (hayJugador && esUnJugador(id) ? jugador.ref : "none");
    // Como `oir`: el guion tiene que saber quién es el jugador de ahora para
    // que `$get(<su asa>,…)` lo encuentre.
    if (hayJugador) g.jugador = { ...(g.jugador ?? {}), personaje: jugador.personaje, ref: jugador.ref };
    const U = this.unidadesPorMetro ?? 39.37;
    const tipo = i.ficha?.ia?.tipoDano || "generic";
    switch (s.que) {
      case "danaAOtro":
        // PARAM4 es el `dmgevent` del ataque, o «(none)» (:1759). Los ataques
        // que la IA decide no pasan por un `xdodamage` con `dmgevent:`, así
        // que es «(none)»; el `bite_dodamage` de las arañas está pendiente.
        //
        // Y ANTES, `StoreEntity(pTarget, ENT_LASTSTRUCKBYME)` (:1754-1756):
        // desde aquí `ent_laststruckbyme` es el jugador para este guion. Es lo
        // que lee el empujón del jabalí (boar_base.script:93) y su aturdimiento
        // (:178-183).
        g.entorno.golpeadoPorMi = ref(s.objetivo);
        // EL 92: si el golpe lo dio el GUION, el tipo y el `dmgevent` son los
        // de su `dodamage` (`dmgevent:bite` de spider_base.script:34).
        g.costura("game_damaged_other", [ref(s.objetivo), comoF(s.dano), s.tipo || tipo, s.evento || "(none)"]);
        return;
      case "hizoDano": {
        const alto = i.ficha?.ia?.alto ?? i.ficha?.alto ?? 0;
        const pies = i.donde ?? [0, 0, 0];
        // El ojo del monstruo es su alto entero sobre los pies
        // (`view_ofs = m_Height`, msmonsterserver.cpp:250, el 81).
        const ojo = aMotor([pies[0], pies[1] + alto / U, pies[2]], U);
        // El `Center()` del jugador: su origen, que en GoldSrc está a media
        // caja, 36 sobre los pies de pie (la caja es de 72). Agachado sería
        // otro número y no se distingue: queda dicho.
        const p = esUnJugador(s.objetivo) ? (this.dondeEstaElJugador?.() ?? null) : null;
        const centro = p ? aMotor([p[0], p[1] + 36 / U, p[2]], U) : null;
        const params = paramsDeDodamage({
          acierto: s.acierto, objetivo: ref(s.objetivo), desde: ojo, hasta: centro ?? ojo, tipo: s.tipo || tipo, dano: s.dano,
        });
        g.costura("game_dodamage", params);
        // EL 92: y después `<dmgevent>_dodamage`, con los MISMOS parámetros y
        // acierte o no (giattack.cpp:2046-2059). Es por donde envenena la
        // araña venenosa de las cloacas (`bite_dodamage`,
        // spider_mini_poison.script:51-54). Un `dmgevent` con `*` va al
        // OBJETO que inflige (:2050-2054), y un bicho no lleva ninguno: no se
        // porta.
        if (s.evento && !String(s.evento).startsWith("*")) g.costura(`${s.evento}_dodamage`, params);
        return;
      }
      case "ataca":
        // EL 92: la IA va a atacar con una secuencia que trae eventos 500/600.
        // Si el guion maneja alguno, el daño lo pondrá él (`Manada.cazar`), y
        // antes tiene que saber a quién (`GuionDeNpc.apuntarObjetivo`).
        if (s.r && !g.retirado && (s.eventos ?? []).some((e) => g.maneja(e))) {
          g.apuntarObjetivo(ref(s.objetivo));
          s.r.porGuion = true;
        }
        return;
      // EL 93: la IA ha fijado o soltado objetivo, y el guion lo apunta como lo
      // apuntarían sus eventos de caza cerrados (`GuionDeNpc.cazando`).
      case "caza":
        g.cazando(s.objetivo === null || s.objetivo === undefined ? null : ref(s.objetivo));
        return;
      // EL 93: ¿deja el guion cazar y atacar? (`GuionDeNpc.puede`). `r` va por
      // referencia, como en `ataca`.
      case "puede":
        if (s.r) Object.assign(s.r, g.puede());
        return;
      // ── EL 98: LO QUE LA CAZA LE PREGUNTA Y LE CUENTA AL GUION ─────────────
      // `npc_targetsighted` con el objetivo a la vista; `npc_selectattack` y el
      // `ANIM_ATTACK` de ahora al atacar; `npc_attack` después (la vieja); y
      // el `ANIM_RUN` de ahora al perseguir. Ver `GuionDeNpc.visto` y
      // compañía, y doc/ATURDIR_98.md.
      case "visto":
        g.visto(ref(s.objetivo));
        return;
      case "eligeAtaque": {
        const a = g.eligeAtaque();
        if (s.r && a) s.r.anim = a;
        return;
      }
      case "atacado":
        g.atacado();
        return;
      case "anim": {
        const a = g.retirado ? null : g.animDe(s.variable);
        if (s.r && a) s.r.anim = a;
        return;
      }
      case "animacion": {
        // EL 92: un evento 500/600 del modelo, al guion por su nombre
        // (`CallScriptEvent(pEvent->options)`, msmonsterserver.cpp:1487 y
        // :1492). Mientras corre, su `dodamage` tiene a quién pedírselo.
        const antes = g.alHacerDano ?? null;
        g.alHacerDano = s.hacerDano ?? null;
        try { g.costura(String(s.evento), []); }
        finally { g.alHacerDano = antes; }
        return;
      }
      case "recibe": {
        const quien = ref(s.quien);
        const hab = String(s.cubo ?? "").split(".")[0];
        const habilidad = HABILIDADES.find((h) => h.clave === hab)?.nombre ?? "none";
        // PARAM5 es el INFLICTOR —el arma—, que en este puerto no es una
        // entidad con asa. Se manda el jugador, que es el atacante: queda
        // dicho como aproximación en doc/BICHOS_GUION_91.md.
        g.costura("game_damaged", [quien, comoF(s.dano), String(s.tipo ?? ""),
          String(Math.trunc(Number(s.acierto) || 0)), quien, habilidad]);
        if (s.parado) {
          // La regla del guion: `callevent game_parry ATTACKER_ID` y
          // `return 0` (base_monster_shared.script:854-856). El cero de la
          // vuelta llega a `game_damaged_end` y no hay `game_struck`, porque
          // un daño cero no pasa por `TakeDamage`.
          g.costura("game_parry", [quien]);
          // EL 97: el que habla del parry es este guion, no el juego. «Your
          // attack was PARRY_TYPE» es su `playermessage`
          // (base_monster_shared.script:472-475), y si un `[override]` lo quita
          // —la araña gigante, spider.script:63-67— no lo dice nadie. Se avisa
          // por referencia, como `puede`, para que el llamador NO lo repita
          // (doc/OVERRIDE_97.md §3).
          if (s.r) s.r.hablaElGuion = true;
          g.costura("game_damaged_end", [quien, comoF(0)]);
          return;
        }
        g.costura("game_damaged_end", [quien, comoF(s.dano)]);
        // EL 94: `StoreEntity(pAttacker, ENT_LASTSTRUCK)` y después
        // `game_struck` (msmonsterserver.cpp:2380-2385). Sólo aquí: un golpe
        // parado no pasa por `TakeDamage` y no lo guarda.
        g.entorno.golpeadoPor = quien;
        g.costura("game_struck", [comoF(s.dano)]);
        return;
      }
      case "muere":
        g.costura("game_predeath", []);
        g.costura("game_death", []);
        return;
      default:
        return;
    }
  }

  /**
   * **LOS NPC ENTRAN EN EL REGISTRO DE NOMBRES** — experimento 81.
   *
   *     name_unique bryan              edana/bryan.script
   *     callexternal $get_by_name(wench) cider2
   *
   * `$get_by_name` mira el `netname` antes que el `targetname`, y el `netname`
   * de un NPC lo pone `name_unique` dentro de su `npc_spawn`. En este puerto
   * `name_unique` **no es un comando y `npc_spawn` no se ejecuta**, así que el
   * registro —que sabe distinguir únicos desde el 45— no tenía dentro ni un
   * NPC: `$get_by_name(wench)` devolvía «0» en todas las partidas.
   *
   * Se lee de la FICHA en vez de hornearse aparte: el dato ya está en
   * `guiones.json`, dentro de los comandos del `npc_spawn`, y así no hay que
   * volver a hornear los 81 mapas para una cadena de texto.
   *
   * Dos NPC con el mismo guion comparten `name_unique` —los doce parroquianos
   * de la taberna son el mismo `commoner_sitting`— y eso **no se corrige**:
   * `UTIL_FindEntityByString` devuelve el PRIMERO que casa y el mod vive con
   * ello. Ver `Entidades._buscar`.
   */
  ponerNombresDeNpc() {
    if (this.nombresPuestos) return 0;
    const todos = this.losNpc?.() ?? [];
    // Sin manada todavía no se marca como hecho: si se marcara, el primer
    // `callexternal` de la partida dejaría el registro vacío para siempre.
    if (!todos.length) return 0;
    let n = 0;
    for (const i of todos) {
      const nombre = this.nombreUnicoDe(i);
      if (!nombre) continue;
      this.entidades.registrar(nombre, i, { unico: true });
      n++;
    }
    this.nombresPuestos = true;
    return n;
  }

  /**
   * El `name_unique` del guion de esta instancia, o `null`.
   *
   * **Se miran TODOS los bloques, no el de nacer.** El primer intento filtró
   * por `npc_spawn` y encontró 2 de los 48 NPC de Edana: en los 2 884 guiones
   * hay 123 `name_unique` repartidos por **trece bloques distintos** —
   * `game_spawn` 43, `[shared]` 20, el bloque sin nombre 18, `npc_spawn` 18,
   * `orc_spawn`, `spawn`, `[server]`, `skel_setup_body`, `elf_spawn`…—, así
   * que elegir uno es quedarse con el 15 %. Es la lista blanca del 78 otra
   * vez: sólo mira donde sabe mirar.
   *
   * Lo que esto NO porta, y va dicho: un `name_unique` dentro de un evento
   * tardío es un RENOMBRADO en mitad de la partida, y aquí se lee una sola
   * vez, estático. Ninguno de los 27 guiones de Edana lo hace.
   */
  nombreUnicoDe(instancia) {
    const ficha = this.guiones?.guiones?.[instancia?.ficha?.script ?? ""] ?? null;
    for (const e of ficha?.eventos ?? []) {
      for (const c of e.cmds ?? []) {
        if (c.nombre === "name_unique" && c.params?.[0]) return String(c.params[0]);
      }
    }
    return null;
  }

  /**
   * El guion de OTRO NPC, por el asa que devolvió `$get_by_name` — el destino
   * de un `callexternal`. Devuelve `null` si el asa no es de un NPC, que es
   * `RetrieveEntity` dando NULL.
   */
  guionPorAsa(asa) {
    this.ponerNombresDeNpc();
    const ent = this.entidades.recuperar(asa);
    return ent?.que ? this.guionDe(ent.que) : null;
  }

  /**
   * El registro que ven los guiones. Es una fachada y no el registro a secas
   * porque **la consulta llega antes que la manada**: `$get_by_name` se
   * resuelve en mitad de un evento, y el apunte de los NPC tiene que haber
   * ocurrido para entonces. Pedirlo aquí es más barato que adivinar cuándo
   * está montada la manada, y pasa una sola vez.
   */
  get registroDeEntidades() {
    const self = this;
    this._registro ??= {
      porNombre(n) { self.ponerNombresDeNpc(); return self.entidades.porNombre(n); },
      recuperar(a) { self.ponerNombresDeNpc(); return self.entidades.recuperar(a); },
      borrar(a) { return self.entidades.borrar(a); },
      registrar(...x) { return self.entidades.registrar(...x); },
    };
    return this._registro;
  }

  /**
   * El jugador para el que corre esto AHORA.
   *
   * ── POR QUÉ LLEVA PARÁMETRO — experimento 62 ──────────────────────────
   *
   * Hasta ahora había una sesión y punto, porque esto corría en el navegador
   * de uno. En el servidor hay hasta treinta y dos, y **el guion es uno por
   * NPC, no uno por jugador**: las variables del vendedor, su estante y sus
   * `setvard` son suyos, y los dos que están hablando con él tienen que ver
   * lo mismo. Es lo que hace el mod, que tiene un `CScript` por entidad y le
   * pasa el jugador como parámetro:
   *
   *     Parameters.add(EntToString(pPlayer));
   *     pScript->CallScriptEvent("game_playerspeak", &Parameters);
   *                                                  client.cpp:485-490
   *
   * Así que la sesión del constructor se queda como la de por omisión —el
   * navegador jugando solo sigue igual— y quien tenga varias la pasa en cada
   * llamada.
   */
  contextoDelJugador(sesion = this.sesion) {
    const personaje = sesion?.personaje ?? null;
    return { personaje, ref: personaje?.id ?? "player" };
  }

  guionDe(instancia) {
    if (!instancia || !this.guiones) return null;
    const clave = instancia.id;
    // EL 91: un bicho de combate que ha vuelto a nacer es otra entidad. El
    // guion de su vida anterior se retira (sus relojes pendientes ya no
    // corren) y se le hace uno nuevo, con su `game_spawn` y su botín.
    const combate = esDeCombate(instancia);
    if (this.guionesVivos.has(clave)) {
      const viejo = this.guionesVivos.get(clave);
      if (!combate || viejo === null || viejo.nacimiento === (instancia.nacimientos ?? 0)) return viejo;
      viejo.retirar();
      this.guionesVivos.delete(clave);
      this.costura.renacidos++;
    }
    const ficha = this.guiones.guiones?.[instancia.ficha?.script ?? ""] ?? null;
    if (!ficha) { this.guionesVivos.set(clave, null); return null; }
    /**
     * El hueco donde cae el guion que se está construyendo.
     *
     * **No es un `const g` a propósito.** El constructor de `GuionDeNpc`
     * ejecuta `spawn` y `game_spawn` DENTRO de sí mismo, y hay guiones que
     * llaman a `setmovedest` ahí: con un `const` eso entra en la zona muerta
     * y revienta con un `ReferenceError` en mitad del nacimiento de un NPC.
     * Con el hueco, la retrollamada que llegue antes de tiempo encuentra
     * `null` y no hace nada, que es lo correcto — todavía no hay a quien
     * avisar. El 81.
     */
    const caja = { guion: null };
    const avisar = (evento, params) => caja.guion?.guion?.llamar(evento, params ?? []);
    const apunta = (tipo, porQue) => caja.guion?.guion?.anotarNoSoportado(tipo, porQue);
    const g = new GuionDeNpc({
      ficha,
      // El 81: los cuatro parámetros de `game_postspawn`, horneados por el 82.
      // Van crudos y en cadena, incluidos los `;` de `params`: quien trocea es
      // `npcatk_do_events` en el guion, y su regla —un token que empieza por
      // dígito no es un evento sino el parámetro del anterior— vive allí con
      // su cita. Trocearlo aquí sería mudarla a un sitio sin cita.
      nacer: instancia.ficha?.postspawn ?? null,
      // El 81: `setmovedest`. La fábrica se pide por instancia y el aviso
      // vuelve al guion, porque los tres eventos del motor son suyos.
      mandarADestino: (d, o) => this.mandarADestino?.(instancia, avisar, apunta)?.(d, o) ?? false,
      // El 81: el rayo de `$cansee`, con la instancia que mira.
      lineaDeVision: this.lineaDeVision ? (ref) => this.lineaDeVision(ref, instancia) : null,
      // El 81: la escala, para que `$cansee` compare unidades con unidades.
      unidadesPorMetro: this.unidadesPorMetro,
      // El 81: dónde está el jugador cuando no ha abierto ningún menú.
      // EL 93 (pieza G): y DE QUIÉN, con el asa del jugador de este guion. Un
      // navegador tiene uno y no lo mira; el servidor tiene varios y, fuera de
      // `alCombate` y de los menús, «con quién habla» es el último que abrió
      // un menú: la araña del salto medía su `dist` contra ése (o contra nadie,
      // y `dist` valía «0»). Ver `dondeEstaElJugador` en `src/red/partida.js`.
      sitioDelJugador: () => (this.dondeEstaElJugador?.(caja.guion?.jugador?.ref ?? null) ?? []).join(" ") || null,
      npc: {
        nombre: instancia.ficha?.nombre ?? "Someone",
        script: instancia.ficha?.script ?? "",
        // EL 92: el bicho mismo, para que el veneno que pone sepa quién es su
        // atacante (`GuionDeNpc` -> `aplicarEfecto` -> `main.js`, `herir`).
        instancia,
        // La posición cambia al caminar: no capturar una copia al hablar.
        get origen() { return (instancia.donde ?? []).join(" "); },
        // EL 91: `$get(ent_me,hp)` y `maxhp` leen esto (scriptcmds.cpp:960,
        // y la rama de `pMonster`, :1388-1391) y NADIE lo pasaba: valían «0»
        // para todos los NPC desde el 46. El 62 otra vez —un parámetro con
        // valor por omisión—, y lo destapó el guion del zombi preguntando por
        // su vida al recibir un golpe. Con getter, porque la vida cambia.
        get vida() { return instancia.vida ?? 0; },
        get vidaMax() { return instancia.vidaMaxima ?? 0; },
        // EL 93: `m_Width` (npcscript.cpp:201), que `$get(<x>,dist)` resta a
        // medias (scriptcmds.cpp:1151-1152). Es el `width` del guion horneado.
        get ancho() { return instancia.ficha?.ia?.ancho ?? instancia.ficha?.ancho ?? 0; },
      },
      catalogo: this.catalogo,
      tiendas: this.tiendas,
      trato: {
        ocupado: () => this.comercio.ocupado(instancia.id, this.hablandoCon),
        abrir: (retrollamada) => this.comercio.abrir(instancia.id, this.hablandoCon, { retrollamada }),
      },
      // EL 95: con la instancia que habla, para que quien reparte sepa DE
      // QUIÉN es el mensaje: con servidor, el jugador de ESTE guion
      // (`RetrieveEntity` del `playermessage`, scriptcmds.cpp:4249) y, si es un
      // `saytext`, todos los que estén a su alcance (msmonsterserver.cpp:1712-1716).
      // Hasta aquí iba sin ella y el servidor le preguntaba a `hablandoCon`,
      // que es el último que abrió un menú en toda la partida. Un navegador
      // ignora el tercer parámetro.
      suceso: (tipo, texto, o) => this.suceso?.(tipo, texto, { ...(o ?? {}), instancia }),
      ventanaDeAviso: (t, x, o) => this.ventanaDeAviso?.(t, x, this.hablandoCon, { ...(o ?? {}), instancia }),
      // El 60: quien de verdad abre la tienda vive en `src/main.js`, que es
      // quien tiene el registro de paneles. Aquí sólo pasa el recado, y con
      // la instancia delante para que el panel sepa de quién es la tienda.
      abrirTienda: (o) => this.abrirTienda?.({ ...o, instancia, para: this.hablandoCon }) ?? false,
      // `playanim once nod`, npcscript.cpp:1487. Una secuencia que no existe
      // se ignora como LookupSequence; no interrumpe la conversación.
      // EL 94: y con su MODO. Tirarlo convertía cada `playanim once` en un
      // `critical`, que rompe lo que esté corriendo (npcscript.cpp:1514-1550).
      animar: (nombre, modo) => { try { this.animar?.(instancia, nombre, modo); } catch {} },
      programar: (s, que) => this.reloj.programar(s, que),
      entidades: this.registroDeEntidades,
      borrarDelMundo: nombre => this.borrarDelMundo?.(nombre),
      // El 81: el cableado entre NPC. `callexternal $get_by_name(wench) cider2`
      // es la mitad de la misión de la sidra y no llegaba a nadie — ver la
      // corrección del 81 en `llamarExterno`, en `npcguion.js`.
      // EL 94: y con el jugador de quien llama. En el motor un asa de jugador
      // vale en cualquier guion (`RetrieveEntity`); aquí cada `GuionDeNpc` sólo
      // reconoce al jugador que tiene atado, así que el guardia que recibe
      // `civilian_attacked <asa>` del aldeano no sabía de quién le hablaban:
      // `$get(OFFENDER,range)` medía al propio guardia (0, siempre dentro de
      // `BG_MAX_HEAR_CIV`) y `$cansee` no tenía a quién mirar. Ver `atarAlJugadorDe`.
      guionDeOtro: (asa) => this.atarAlJugadorDe(caja.guion, this.guionPorAsa(asa)),
      todosLosGuiones: () => (this.losNpc?.() ?? []).map((i) => this.atarAlJugadorDe(caja.guion, this.guionDe(i))).filter(Boolean),
      // EL 94: `npcatk_settarget` pedido por otro guion, a la IA. Sólo los de
      // combate: son los únicos con cierre, y los únicos con cazador que caza.
      fijarObjetivo: combate ? (asa) => this.fijarObjetivoDe(instancia, asa) : null,
      // El 79: una opción de menú de tipo `say` hace hablar AL JUGADOR, y
      // hablar es llegar a los oídos de alrededor — no imprimir una línea.
      hablaElJugador: (texto, { desde } = {}) => this.hablaElJugador(texto, { desde }),
      // `applyeffect` sobre el jugador: la cura del sumo sacerdote de Edana.
      aplicarEfecto: this.aplicarEfecto ? (ruta, params, o) => this.aplicarEfecto(ruta, params, o) : null,
      // EL 91: el cierre y de qué vida es. Ver `esDeCombate`.
      cierre: combate ? CIERRE_DE_BICHO : null,
      nacimiento: instancia.nacimientos ?? 0,
      // EL 93: el cuerpo del bicho, para su `setvelocity`, `setfollow`… Sólo
      // los de combate y sólo con la manada enchufada (ver `Manada.cuerpoDe`).
      cuerpo: combate ? (this.manadaEnchufada?.cuerpoDe?.(instancia) ?? null) : null,
    });
    if (combate) this.costura.nacidos++;
    /**
     * ── EL 98: EL `dodamage` DE UN BICHO, TAMBIÉN FUERA DE UNA ANIMACIÓN ──
     *
     * En el motor `dodamage` pega desde cualquier evento (npcscript.cpp:1110-
     * 1200 no mira quién lo llama). Hasta aquí sólo tenía gancho mientras
     * corría un evento 500/600 del modelo (caso `animacion`), y fuera «se
     * apuntaba» como hueco declarado (el 92). El caso que lo pide: la
     * embestida del jabalí, que pega desde su bloque de `repeatdelay 0.1`
     * (boar_base.script:164-176) y es la ÚNICA puerta a su aturdimiento
     * (`boar_charge_hit`, :178-184). El caso `animacion` sigue poniendo el
     * suyo y devolviendo éste al acabar.
     */
    if (combate) {
      g.alHacerDano = (p) => {
        const m = this.manadaEnchufada;
        if (!m) { g.danoCuenta.sinGancho++; return { porQue: "sin manada enchufada" }; }
        return m._golpeDelGuion(instancia, p);
      };
    }
    caja.guion = g;
    this.guionesVivos.set(clave, g);
    return g;
  }

  /**
   * **EL JUGADOR DE QUIEN LLAMA, ATADO AL GUION QUE RECIBE** — el 94.
   *
   * `callexternal` pasa asas, y en el motor un asa se resuelve en cualquier
   * guion (`RetrieveEntity`). Aquí «quién es el jugador» lo sabe cada
   * `GuionDeNpc` por su cuenta (`jugador`, que ponen `pedirOpciones`, `oir`
   * y la costura), así que lo que viaja con la llamada es eso: el jugador del
   * que llama, que es el del asa que lleva dentro.
   *
   * Sin `origen`, a propósito: el que haya quedado de un menú viejo es una
   * foto, y el guardia mide con él cuánto le separa del que pega
   * (`$get(OFFENDER,range)`, gatecity/guard.script:110). Sin él se pregunta
   * a `sitioDelJugador`, que lo lee vivo.
   *
   * Si quien llama no tiene jugador atado, no se toca nada: la llamada no
   * habla de ninguno.
   */
  atarAlJugadorDe(desde, otro) {
    if (!otro || !desde || otro === desde) return otro;
    const j = desde.jugador;
    if (!j?.ref) return otro;
    otro.jugador = { ...(otro.jugador ?? {}), personaje: j.personaje ?? null, ref: j.ref, origen: undefined };
    return otro;
  }

  /**
   * **`npcatk_settarget <asa>` PEDIDO POR OTRO GUION, A LA IA** — el 94.
   *
   * Lo llama `GuionDeNpc._objetivoPedidoDeFuera`. El asa es la del guion; el
   * cazador entiende ids de la manada («jugador» en un navegador, «j3» con
   * servidor). La traducción la apunta la costura cada vez que pasa un golpe
   * de un jugador (`_idPorAsa`); sin ella, en un navegador sólo hay uno.
   *
   * Hoy sólo jugadores: un guion que pide como objetivo a otro NPC no tiene
   * id de la manada que este puerto sepa dar, y se apunta.
   */
  fijarObjetivoDe(instancia, asa) {
    const id = this._idPorAsa.get(String(asa))
      ?? (!this.jugadorDe && String(asa) === String(this.contextoDelJugador().ref) ? "jugador" : null);
    if (!id) { this.costura.objetivoSinId = (this.costura.objetivoSinId ?? 0) + 1; return false; }
    return Boolean(this.manadaEnchufada?.fijarObjetivoPorGuion?.(instancia, id));
  }

  /**
   * **HABLA EL JUGADOR Y LOS DE ALREDEDOR LE OYEN** — experimento 79.
   *
   *     if (SpeechType == SPEECH_LOCAL && IsPlayer() && pEnt->IsMSMonster())
   *         ((CMSMonster*)pEnt)->HearPhrase(this, pszSentence);
   *                                       msmonsterserver.cpp:1743-1744
   *
   * Esto es la mitad que faltaba de `catchspeech`, registrado desde el 43 y
   * sin disparar nunca. Va aquí porque hay que recorrer a los NPC y decidir
   * quién está cerca, y eso es de la partida: `oir.js` tiene la regla de QUÉ
   * evento dispara una frase y no sabe dónde está nadie.
   *
   * ── LAS TRES PUERTAS, EN ESTE ORDEN ──────────────────────────────────
   *
   *   1. La frase sale con **el nombre del jugador**, por `frase()` de
   *      `chat.js`, que es la misma que usa el chat desde el 61. Antes del 79
   *      una opción `say` la imprimía con el nombre del NPC.
   *   2. `game_heardtext` a **todos** los que estén en rango.
   *   3. `HearPhrase` al que tenga una palabra que encaje.
   *
   * Las dos últimas las hace `GuionDeNpc.oir`; aquí se decide a quién.
   *
   * ── QUIÉN QUEDA FUERA, Y POR QUÉ ─────────────────────────────────────
   *
   *   - **El muerto no oye**: `if (!IsAlive()) return;`, primera guarda de
   *     `HearPhrase` (msmonsterserver.cpp:1757-1760).
   *   - **El dormido tampoco**, que es lo más parecido que hay aquí a no
   *     estar en `pList`: un bicho que su área todavía no ha soltado no está
   *     en el mundo. En el motor eso es literal, porque `UTIL_EntitiesInBox`
   *     sólo devuelve lo que existe.
   *   - `HasConditions(MONSTER_NOAI)` no tiene equivalente exacto; el `sinIa`
   *     de este puerto se mira porque es lo que más se le parece, y queda
   *     dicho que no es la misma bandera.
   *   - El **rango** es `distancia2D` contra `RANGO_LOCAL`, de `chat.js`, en
   *     metros de escena: la misma regla y los mismos números que el 61.
   *
   * @param texto  lo que dice el jugador, sin comillas y sin montar.
   * @param desde  el `GuionDeNpc` que abrió el menú, si vino de un `MOT_SAY`.
   * @returns      `{frase, oyeron, contestaron:[...]}`, para poder medirlo.
   */
  hablaElJugador(texto, { desde = null, sesion = this.hablandoCon ?? this.sesion, yaDicho = false } = {}) {
    const limpio = sinComillas(String(texto ?? ""));
    // «make sure the text has content» — la misma guarda que `saytext`.
    if (!tieneContenido(limpio)) return { frase: null, oyeron: 0, contestaron: [] };

    const jugador = this.contextoDelJugador(sesion);
    const nombre = jugador?.personaje?.nombre ?? "You";
    // `frase()` es la del 61: `Ana says,  "hola"`, con las dos espacios del mod.
    const linea = frase(nombre, limpio, HABLA.LOCAL);
    // EL 95: con la sesión del que habla. Con servidor esta línea iba a
    // `hablandoCon`, y quien escribe en el chat no abre ningún menú: lo medió
    // la sonda del 95, con Beto leyendo en su consola el «Ana says» de Ana a
    // 527 unidades porque Beto había sido el último en pulsar la F. (Y
    // `yaDicho`, que llega desde el chat, no lo lee nadie: doc/RED_95.md §8.)
    this.suceso?.("normal", linea.replace(/\n$/, ""), { sesion });

    const pies = this.dondeEstaElJugador?.() ?? null;
    const todos = this.losNpc?.() ?? [];
    const rango = RANGO_LOCAL / (this.unidadesPorMetro ?? 39.37);

    const contestaron = [];
    let oyeron = 0, sinSitio = 0;
    for (const i of todos) {
      if (!i || i.muerto || i.dormido || i.sinIa) continue;
      // Sin saber dónde está el jugador no se puede decidir el rango, y
      // entonces **no se reparte**: repartir a todos «porque no sé medir»
      // sería un alcance infinito disfrazado de arreglo. Se cuenta aparte.
      if (!pies || !i.donde) { sinSitio++; continue; }
      // ── UN `NaN` EN LA DISTANCIA ES UN ALCANCE INFINITO ─────────────────
      //
      // `NaN > rango` es **false**, así que una distancia que no se puede
      // calcular pasa el filtro y el NPC oye. Lo encontró la primera pasada de
      // la sonda del 79, que puso al jugador en `NaN` por un fallo suyo: el
      // capitán contestó desde 500 unidades y con él **otros diecisiete** —
      // medio pueblo saludando a la vez. El motor no puede llegar aquí con un
      // `NaN` porque sus vectores salen de la física; este puerto sí, porque
      // una sonda puede teletransportarte. Un umbral escrito con `>` deja
      // pasar lo que no es un número, así que se pregunta al revés.
      const d = distancia2D(i.donde, pies);
      if (!Number.isFinite(d)) { sinSitio++; continue; }
      if (d > rango) continue;
      const g = this.guionDe(i);
      if (!g) continue;
      oyeron++;
      const r = g.oir(limpio, { quien: jugador?.ref ?? "player", personaje: jugador?.personaje ?? null });
      if (r?.evento) contestaron.push({ id: i.id, evento: r.evento, palabra: r.palabra });
    }
    // El que abrió el menú tiene que estar entre los que oyen: si no, una
    // opción `say` no haría nada y el verde sería el del valor de reposo.
    void desde;
    return { frase: linea, oyeron, contestaron, sinSitio };
  }

  async pedir(id, sesion = this.sesion) {
    const quien = id === null ? null : this.npcPorId?.(id);
    const jugador = this.contextoDelJugador(sesion);
    this.hablandoCon = sesion ?? null;
    if (!quien) {
      // EL 85: `estado` existía en la firma de `opcionesDelJugador` desde el 60
      // y **nadie lo pasaba**, así que `sentado` valía `false` en todas las
      // partidas: la primera opción decía siempre «Sit Down (Rest)», nunca
      // «Stand Up», y las tres emociones salían también estando sentado. La
      // única condición que tiene este menú (`if ( !$get(ent_me,sitting) )`,
      // player_sv_menu.script:19-52) estaba portada y no se cumplía nunca — un
      // parámetro con valor por omisión es donde vive una regla que no corre,
      // que es el 62 literal.
      const opciones = opcionesDelJugador(jugador.personaje, {
        sentado: Boolean(this.emociones?.sentado),
      });
      this.menuDelJugador = opciones;
      return { nombre: "You", opciones };
    }
    const nombre = quien.ficha?.nombre ?? "Someone";
    const guion = this.guionDe(quien);
    if (guion) return {
      nombre,
      opciones: guion.pedirOpciones(jugador)
        .map(o => ({ titulo: o.titulo, tipo: o.tipo, datos: o.datos, porque: "" })),
    };
    // Respaldo del 29: conserva las opciones indecidibles apagadas y su motivo.
    return { nombre, opciones: opcionesDe(this.menus, quien.ficha?.script ?? "", jugador.personaje) };
  }

  elegido(id, indice, sesion = this.sesion) {
    const quien = id === null ? null : this.npcPorId?.(id);
    const guion = this.guionDe(quien);
    this.hablandoCon = sesion ?? null;
    if (indice === null) {
      // Cancelar sí llama a game_menu_cancel: msmonsterserver.cpp:2920-2926.
      guion?.elegir(-1, this.contextoDelJugador(sesion));
      return;
    }
    // ── LA RAMA QUE FALTABA (85) ───────────────────────────────────────────
    //
    // `id === null` es «la F sin nadie delante», o sea TU PROPIO menú:
    //
    //     else pMonster = pPlayer;              client.cpp:679-682
    //
    // No hay NPC, así que no hay guion, así que las seis opciones salían por el
    // `if (!guion)` de abajo diciendo que el NPC no tiene guion portado — un
    // mensaje correcto para un caso que no es éste.
    if (id === null) return this.elegidoDelJugador(indice, sesion);
    if (!guion) {
      this.suceso?.("nopuedes", "That is not implemented yet: this NPC has no ported script.");
      return;
    }
    guion.elegir(indice, this.contextoDelJugador(sesion));
    sesion?.guardar?.();
  }

  /**
   * UNA OPCIÓN DEL MENÚ DEL PROPIO JUGADOR — el 85.
   *
   * Los tres tipos que salen aquí se despachan en sitios distintos **en el
   * original**, y eso es lo que decide cómo se portan:
   *
   *   `callback`  va al servidor: `plr_menu_emote` manda `action <EFFECT_ID>` y
   *               el efecto contesta. `player_sv_menu.script:182-187`.
   *   `itemdesc`  **no sale del cliente**: `ShowWeaponDesc(player.ActiveItem())`
   *               y al servidor le manda un cancelar.
   *               `vgui_menu_interact.h:183-188`.
   *   `forgive`   el cliente manda el comando `forgive` y también un cancelar.
   *               `vgui_menu_interact.h:189-193`.
   *
   * Los dos últimos son del cliente, y aquí están en el lado del servidor a
   * propósito: en este puerto el panel es `src/vgui/interactuar.js`, que no
   * conoce ni el inventario ni la consola. Lo que NO se pierde por eso es el
   * cancelar, porque `elegir()` cierra el panel en los tres casos igual.
   *
   * @returns qué se hizo, para que una sonda pueda leerlo sin adivinar.
   */
  elegidoDelJugador(indice, sesion = this.sesion) {
    const op = this.menuDelJugador[indice] ?? null;
    if (!op) {
      // Esto no es «no implementado»: es un índice que no cuadra con la lista
      // que se mandó, y se dice distinto para que no se confundan los dos.
      this.suceso?.("nopuedes", "That option is no longer available.");
      return { hecho: false, porque: `índice ${indice} fuera de las ${this.menuDelJugador.length} opciones` };
    }

    if (op.tipo === "itemdesc") {
      const objeto = this.enLaMano?.() ?? null;
      const texto = descripcionDeObjeto(objeto);
      // `if (!pItem) return;` es la primera línea de `ShowWeaponDesc`: con la
      // mano vacía el original no escribe nada, y aquí tampoco se inventa un
      // texto de relleno que haría parecer que la opción funciona.
      if (texto === null) return { hecho: false, porque: "no lleva nada en la mano" };
      if (this.verDescripcion) this.verDescripcion(texto);
      else this.suceso?.("normal", texto);
      return { hecho: true, tipo: "itemdesc", texto };
    }

    if (op.tipo === "forgive") {
      const r = perdonar(null);
      if (r.texto) this.suceso?.("normal", r.texto);
      return { hecho: r.hecho, tipo: "forgive", texto: r.texto ?? null };
    }

    if (op.tipo === "callback") {
      if (!this.emociones) {
        // El gancho no está. Se dice y se apunta, porque un `?.()` callado aquí
        // sería exactamente el `=> {}` del 66 en el sitio del fallo.
        this.suceso?.("nopuedes", "That is not implemented yet: no emote state is wired.");
        return { hecho: false, porque: "sin `emociones`" };
      }
      const r = this.emociones.activar(op.datos);
      if (sesion?.guardar) sesion.guardar();
      return { ...r, tipo: "callback", efecto: op.datos };
    }

    // Una opción apagada se puede pulsar y no hace nada, como en el original:
    // `MOT_DISABLED` no manda comando (npcscript.cpp:966).
    return { hecho: false, porque: `el tipo «${op.tipo}» no hace nada en tu propio menú` };
  }

  paso(dt) {
    // LA CORREA, en el paso y no en un botón: `CMSMonster::Trade()` corre en
    // el `Think` del vendedor (msmonsterserver.cpp:1835). Por eso el trato se
    // acaba cuando el cliente se va, y no cuando cierra el panel.
    // SIN GEOMETRÍA NO SE CORRE LA CORREA, y es a propósito. Si esto llamara
    // a `paso` con un `undefined` por respuesta, `Comercio` haría lo que hace
    // el motor cuando no hay cliente —cerrar el trato— y cerraría TODOS en el
    // primer fotograma: el vendedor diría `_done` sin que nadie se haya
    // movido. Quien no inyecta la geometría es quien no tiene varios
    // jugadores, y ahí el trato no caduca.
    const tratos = this.comoEstaElCliente
      ? this.comercio.paso((v, cliente) => this.comoEstaElCliente(v, cliente))
      : [];
    for (const fin of tratos) {
      if (!fin.evento) continue;
      const quien = this.npcPorId?.(fin.vendedor);
      this.guionDe(quien)?.guion?.llamar?.(fin.evento, []);
    }
    // EL 91: los que acaban de nacer, con su guion. Antes del reloj, para que
    // sus `callevent` con retardo empiecen a contar desde ahora.
    this.nacerBichos();
    return this.reloj.paso(dt);
  }
}
