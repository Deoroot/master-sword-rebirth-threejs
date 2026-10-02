// Las conversaciones pertenecen a la partida, no al dibujo ni al panel.
// Extraído de main.js: conserva el camino de msmonsterserver.cpp:2884-3013.
// No importa DOM ni Three; la selección del objetivo sigue junto al combate.
import { GuionDeNpc, RelojDeGuiones } from "../play/npcguion.js";
import { Entidades } from "../play/entidades.js";
import { Tiendas, Comercio } from "../play/tienda.js";
import { opcionesDe, opcionesDelJugador } from "../play/opciones.js";
// El 85: lo que HACEN las seis opciones de tu propio menú. Ver `elegidoDelJugador`.
import { descripcionDeObjeto, perdonar } from "../play/menujugador.js";
// El 79: la voz del jugador se monta y se mide con LA MISMA regla que el chat
// del 61. Dos copias del alcance serían dos mundos — la lección del 63.
import { frase, sinComillas, tieneContenido, distancia2D, HABLA, RANGO_LOCAL } from "../play/chat.js";

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
    emociones = null, enLaMano = null, verDescripcion = null } = {}) {
    Object.assign(this, { sesion, guiones, menus, catalogo, npcPorId, suceso, animar, borrarDelMundo, ventanaDeAviso, abrirTienda, comoEstaElCliente, losNpc, dondeEstaElJugador, unidadesPorMetro, mandarADestino, lineaDeVision, emociones, enLaMano, verDescripcion });
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
    if (this.guionesVivos.has(clave)) return this.guionesVivos.get(clave);
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
      sitioDelJugador: () => (this.dondeEstaElJugador?.() ?? []).join(" ") || null,
      npc: {
        nombre: instancia.ficha?.nombre ?? "Someone",
        script: instancia.ficha?.script ?? "",
        // La posición cambia al caminar: no capturar una copia al hablar.
        get origen() { return (instancia.donde ?? []).join(" "); },
      },
      catalogo: this.catalogo,
      tiendas: this.tiendas,
      trato: {
        ocupado: () => this.comercio.ocupado(instancia.id, this.hablandoCon),
        abrir: (retrollamada) => this.comercio.abrir(instancia.id, this.hablandoCon, { retrollamada }),
      },
      suceso: this.suceso,
      ventanaDeAviso: (t, x) => this.ventanaDeAviso?.(t, x, this.hablandoCon),
      // El 60: quien de verdad abre la tienda vive en `src/main.js`, que es
      // quien tiene el registro de paneles. Aquí sólo pasa el recado, y con
      // la instancia delante para que el panel sepa de quién es la tienda.
      abrirTienda: (o) => this.abrirTienda?.({ ...o, instancia, para: this.hablandoCon }) ?? false,
      // `playanim once nod`, npcscript.cpp:1487. Una secuencia que no existe
      // se ignora como LookupSequence; no interrumpe la conversación.
      animar: nombre => { try { this.animar?.(instancia, nombre); } catch {} },
      programar: (s, que) => this.reloj.programar(s, que),
      entidades: this.registroDeEntidades,
      borrarDelMundo: nombre => this.borrarDelMundo?.(nombre),
      // El 81: el cableado entre NPC. `callexternal $get_by_name(wench) cider2`
      // es la mitad de la misión de la sidra y no llegaba a nadie — ver la
      // corrección del 81 en `llamarExterno`, en `npcguion.js`.
      guionDeOtro: (asa) => this.guionPorAsa(asa),
      todosLosGuiones: () => (this.losNpc?.() ?? []).map((i) => this.guionDe(i)).filter(Boolean),
      // El 79: una opción de menú de tipo `say` hace hablar AL JUGADOR, y
      // hablar es llegar a los oídos de alrededor — no imprimir una línea.
      hablaElJugador: (texto, { desde } = {}) => this.hablaElJugador(texto, { desde }),
    });
    caja.guion = g;
    this.guionesVivos.set(clave, g);
    return g;
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
    this.suceso?.("normal", linea.replace(/\n$/, ""));

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
    return this.reloj.paso(dt);
  }
}
