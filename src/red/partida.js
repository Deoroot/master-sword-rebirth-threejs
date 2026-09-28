// LA PARTIDA: el servidor que manda, sin sockets y sin navegador.
//
// Esto es el paso 4 de PROYECTO_10.md — «el servidor, y el personaje pasa a
// vivir allí»— y es la mitad que decide. La otra mitad, el transporte, está en
// `socket.js` y no se nombra aquí: una partida se puede simular entera en una
// prueba de Node sin abrir un puerto, y eso es lo que permite comprobar la
// predicción y la reconciliación sin depender de la red.
//
// ── La frase que ordena todo el archivo ────────────────────────────────────
//
// **El cliente manda TECLAS y el servidor manda POSICIONES.** Nunca al revés.
// Un mensaje que diga «estoy en (x,y,z)» no existe en este protocolo, y por eso
// no hay que validarlo: lo único que el cliente puede mandar es lo que pulsa, y
// lo que pulsa está recortado a [-1, 1] en `orden()`. Es la diferencia entre
// «el servidor comprueba que no hagas trampas» —una carrera que se pierde— y
// «el servidor es el que juega» —que es lo que hace GoldSrc y lo que hace esto.
//
// De ahí sale lo demás: el servidor corre la MISMA física que el navegador
// (`src/play/player.js`, que no importa Three.js desde el 03 justo para esto),
// y el cliente corre una copia por adelantado para no esperar al viaje de ida y
// vuelta. Cuando no coinciden, manda el servidor.
//
// ── Lo que MSR hace y aquí se copia ───────────────────────────────────────
//
//     void CHalfLifeMultiplay::ClientDisconnected( edict_t *pClient ) {
//       pPlayer->SaveChar(); // Save data on disconnect!
//                                   gamerules/multiplay_gamerules.cpp:432
//
// El personaje se guarda al desconectar, y además solo cada pocos segundos
// mientras juegas (`MSChar_Interface::AutoSave`, ya portado en `Sesion`). Las
// dos cosas, porque la primera no ocurre cuando se va la luz.

import { Sesion, ESTADO } from "../juego/sesion.js";
import { vitalesDe, velocidadDelPaso } from "./andar.js";
// El techo de daño sale de las mismas tres piezas que el daño del navegador, y
// eso es lo que hace que sea un techo y no un número inventado.
import { fraccionDePotencia, TOPE_PROPIEDAD, CRITICO, expDeLaMuerte } from "../play/golpe.js";
import { entrenar } from "../juego/personaje.js";
import { atributosDe, derivadas } from "../juego/stats.js";
import {
  PARTIDA, vidaTotal, jugadoresActivos, autoajustar, experienciaDelBicho,
} from "../juego/servidor.js";
import {
  RED, MENSAJE, empaquetar, orden as normalizarOrden, partirOrden,
  recuperarPerdidas, tiempoObjetivo, intervaloDeEnvio, BOTON,
} from "./protocolo.js";

/** Lo que un cliente es para la partida. */
class Cliente {
  constructor({ id, enlace, partida }) {
    this.id = id;
    this.enlace = enlace;
    this.partida = partida;
    this.nombre = `jugador${id}`;
    /** La sesión: el personaje vive AQUÍ, no en el navegador. */
    this.sesion = null;
    /** El cuerpo simulado. Null mientras no haya aparecido. */
    this.cuerpo = null;
    /** Las órdenes pendientes de correr, en orden de llegada. */
    this.cola = [];
    /** La última orden corrida. Es lo que se le devuelve como acuse. */
    this.ultimaOrden = 0;
    /** La última orden recibida, para saber cuántas se han perdido. */
    this.ultimaRecibida = 0;
    /** `lastcmd`: la última corrida, que es la que se repite si falta alguna. */
    this.ultimaCorrida = null;
    this.perdidas = 0;
    this.abandonadas = 0;
    /** `cl_updaterate` del cliente, ya pasado por los topes del servidor. */
    this.intervalo = intervaloDeEnvio(RED.updaterate);
    this.proximaFoto = 0;
    /** `latency`: ida y vuelta medida con ping, en segundos. */
    this.latencia = 0;
    this._ping = null;
    /** El trote: el servidor lleva SU cuenta del aguante, no la del cliente. */
    this.corriendo = false;
    this.aguante = 0;
    this.rapidezAnterior = 0;
    /** La velocidad máxima de este personaje ahora mismo, en unidades. */
    this.maxima = 0;
    /** `cmdtime`: cuánto tiempo ha pedido simular este cliente, en total. */
    this.tiempoPedido = 0;
    /** `connecttime`: cuándo llegó, para poder comparar con el reloj. */
    this.desde = 0;
    /** `ignorecmdtime`: hasta cuándo se le ignora por ir adelantado. */
    this.ignorarHasta = 0;
    this.ignoradas = 0;
    /** La última foto que el cliente dice haber recibido. `delta_sequence`. */
    this.fotoReconocida = 0;
    /**
     * Las últimas fotos mandadas, por número, para poder comparar contra la que
     * el cliente diga. **Una sola no vale**, y esto lo cazó la sonda: el acuse
     * llega con un viaje de red de retraso, así que cuando llega, la «última
     * mandada» ya es otra — y la comparación no cuadraba NUNCA. Resultado: todas
     * las fotos iban completas y **la lista de quién se ha ido siempre venía
     * vacía**, así que la figura de un jugador que cerraba la pestaña se quedaba
     * de pie en el mapa para siempre.
     *
     * Por eso el motor guarda `frames[MULTIPLAYER_BACKUP]`, que son 64. Es
     * exactamente esto y para exactamente esto.
     */
    this.fotosMandadas = new Map();
    this.fotoSeq = 0;
    this.dentro = false;
    /**
     * Lo que ha pasado y este cliente todavía no sabe: golpes de bichos,
     * muertes, paradas. Una cola POR CLIENTE y no una lista global, porque cada
     * uno recibe a su ritmo (`cl_updaterate`) y con una lista compartida el que
     * pide veinte fotos por segundo se quedaría sin la mitad de los sucesos.
     */
    this.sucesosPendientes = [];
  }

  get vivo() { return this.sesion?.estado === ESTADO.JUGANDO; }

  mandar(tipo, cuerpo) { this.enlace?.enviar?.(empaquetar(tipo, cuerpo)); }
}

/**
 * La partida.
 *
 * Todo lo del mundo exterior entra por el constructor, igual que en `Sesion` y
 * por el mismo motivo: `mundo` es quien sabe crear cuerpos —Rapier y la malla
 * de Gate City en el servidor de verdad, un suelo liso en las pruebas—, y el
 * reloj se inyecta para que una prueba no tenga que esperar.
 */
export class Partida {
  /**
   * @param {{
   *   mundo: { crearCuerpo(pies: number[]): object, soltarCuerpo?: Function },
   *   almacen: object, aparicion?: object, catalogo?: object,
   *   nombre?: string, ahora?: () => number, red?: object,
   * }} opciones
   */
  constructor({
    mundo, almacen, aparicion = null, catalogo = null, fauna = null,
    nombre = "partida", ahora = () => Date.now() / 1000, red = RED,
  } = {}) {
    if (!mundo) throw new Error("una partida necesita un mundo que simular");
    if (!almacen) throw new Error("una partida necesita dónde guardar los personajes");
    this.mundo = mundo;
    this.almacen = almacen;
    this.aparicion = aparicion;
    this.catalogo = catalogo;
    this._porId = catalogo?.porId
      ?? (catalogo?.objetos ? new Map(catalogo.objetos.map((o) => [o.id, o])) : null);
    this.nombre = nombre;
    this.red = red;
    this._ahora = ahora;

    /** El paso fijo. `sys_ticrate`: 100 por segundo, 10 ms cada uno. */
    this.paso = 1 / red.ticrate;
    this.tick = 0;
    /** El tiempo de la partida, que avanza a pasos y no con el reloj. */
    this.t = 0;
    this._sobra = 0;
    this._arranque = ahora();
    this._ultimoChequeo = 0;

    /** @type {Map<number, Cliente>} por hueco. */
    this.clientes = new Map();
    /** La historia de posiciones, para rebobinar. Una cola por cliente. */
    this.historia = new Map();
    this.sucesos = [];

    /**
     * LOS BICHOS, si los hay. Del 28.
     *
     * Es opcional a propósito: una partida sin fauna es la de las pruebas —un
     * suelo liso y dos jugadores— y tiene que seguir siendo posible, porque es
     * donde se comprueba la red sin 69 monstruos de ruido.
     */
    this.fauna = fauna ?? null;
    if (this.fauna) {
      this.fauna.jugadores = () => [...this.clientes.values()].filter((c) => c.cuerpo);
      this.fauna.golpear = (i, j, dano) => this._bichoPega(i, j, dano);
    }
    /**
     * Las fotos de la manada, por número. Una sola cola para TODOS los clientes,
     * a diferencia de las de jugadores: el estado de un bicho es el mismo para
     * todo el mundo, así que guardar 64 × 69 una vez cuesta lo mismo con un
     * jugador que con treinta y dos.
     */
    this._fotosDeBichos = new Map();
    this._bichoSeq = 0;
  }

  // ── entrar y salir ────────────────────────────────────────────────────────

  /**
   * Un hueco libre, o `null` si la partida está llena.
   *
   * Se busca el más bajo libre a propósito, y no es cosmético: MSR tiene un
   * comentario entero sobre esto porque los clientes que se reconectan se
   * quedaban con su hueco viejo —«attempting to make sure next client takes
   * slot #1»— y con eso la lista de jugadores salía con agujeros.
   */
  _hueco() {
    for (let i = 1; i <= this.red.maxJugadores; i++) if (!this.clientes.has(i)) return i;
    return null;
  }

  /** Acepta una conexión. Devuelve el cliente, o `null` si no cabe. */
  conectar(enlace, { nombre = null } = {}) {
    const id = this._hueco();
    if (id === null) return null;
    const c = new Cliente({ id, enlace, partida: this });
    c.desde = this.t;                                   // `connecttime`
    if (nombre) c.nombre = String(nombre).slice(0, 32);
    c.sesion = new Sesion({
      almacen: this.almacen,
      aparicion: this.aparicion,
      catalogo: this.catalogo,
      ahora: () => this.t,
      central: false,
    });
    this.clientes.set(id, c);
    this.historia.set(id, []);
    c.mandar(MENSAJE.BIENVENIDA, {
      tu: id,
      partida: this.nombre,
      mapa: this.aparicion?.mapa ?? null,
      tick: this.tick,
      tiempo: this.t,
      ticrate: this.red.ticrate,
      intervalo: c.intervalo,
      jugadores: this.clientes.size,
      max: this.red.maxJugadores,
    });
    return c;
  }

  /**
   * Se va. **Guarda el personaje**, que es lo que dice `ClientDisconnected`, y
   * suelta el cuerpo para que la física no siga simulando a un fantasma.
   */
  async desconectar(id, { porque = "se fue" } = {}) {
    const c = this.clientes.get(id);
    if (!c) return null;
    this.clientes.delete(id);
    this.historia.delete(id);
    if (c.cuerpo) this.mundo.soltarCuerpo?.(c.cuerpo);
    c.cuerpo = null;
    let guardado = null;
    // El guardado va DESPUÉS de sacarlo de la lista: si falla, el jugador
    // igualmente se ha ido, y dejarlo en la partida porque no se pudo guardar
    // deja un cuerpo de pie en medio del mapa.
    if (c.sesion?.personaje) guardado = await c.sesion.salir().catch(() => null);
    this._suceso("sale", { id, nombre: c.nombre, porque });
    return { cliente: c, guardado };
  }

  // ── los mensajes del cliente ─────────────────────────────────────────────

  /**
   * Un mensaje ya abierto. Devuelve lo que haya que hacer, o `null`.
   *
   * Nunca lanza por culpa de lo que venga de fuera: un mensaje mal formado de
   * un cliente no puede tumbar la partida de los otros treinta y uno.
   */
  async recibir(id, m) {
    const c = this.clientes.get(id);
    if (!c || !m) return null;
    try {
      switch (m.t) {
        case MENSAJE.HOLA: return this._hola(c, m);
        case MENSAJE.PERSONAJES: return this._listar(c);
        case MENSAJE.CREAR: return this._crear(c, m);
        case MENSAJE.ELEGIR: return this._elegir(c, m);
        case MENSAJE.BORRAR: return this._borrar(c, m);
        case MENSAJE.ORDENES: return this._ordenes(c, m);
        case MENSAJE.PEGAR: return this._pegar(c, m);
        case MENSAJE.PONG: return this._pong(c, m);
        case MENSAJE.ADIOS: return this.desconectar(id, { porque: "adiós" });
        default: return null;
      }
    } catch (e) {
      c.mandar(MENSAJE.FALLO, { que: m.t, porque: String(e?.message ?? e) });
      return null;
    }
  }

  _hola(c, m) {
    if (m.nombre) c.nombre = String(m.nombre).slice(0, 32);
    // `cl_updaterate` es una PETICIÓN, no una orden: pasa por los topes del
    // servidor (`SV_CheckUpdateRate`). Un cliente que pida 1 000 no recibe
    // mil fotos por segundo, recibe treinta.
    c.intervalo = intervaloDeEnvio(m.updaterate ?? this.red.updaterate, this.red);
    c.mandar(MENSAJE.BIENVENIDA, {
      tu: c.id, partida: this.nombre, mapa: this.aparicion?.mapa ?? null,
      tick: this.tick, tiempo: this.t, ticrate: this.red.ticrate,
      intervalo: c.intervalo, jugadores: this.clientes.size, max: this.red.maxJugadores,
    });
    return this._listar(c);
  }

  async _listar(c, creado = null) {
    const lista = await this.almacen.listar();
    c.mandar(MENSAJE.LISTA, { personajes: lista, creado });
    return lista;
  }

  /**
   * Crear un personaje: **el servidor lo construye, el cliente sólo pide**.
   *
   * De lo que llega se usan tres cosas —nombre, género y arma de partida— y
   * `crearPersonaje()` pone el resto: las habilidades de salida, el oro, los
   * objetos gratis y las 36 ranuras vacías. Aceptar el personaje entero del
   * cliente sería dejar que se escriba las estadísticas, que es precisamente lo
   * que el paso 4 viene a cerrar. Y las armas de partida ya las valida
   * `crearPersonaje`: sólo las siete de `reg.newchar.weaponlist`.
   *
   * El id lo pone el servidor, y por eso la lista dice cuál es: el cliente
   * acaba de mandar un nombre y necesita saber con qué entrar.
   */
  async _crear(c, m) {
    if (!c.sesion.personaje) await c.sesion.arrancar();
    const pedido = m.personaje ?? {};
    const p = await c.sesion.crear({
      nombre: pedido.nombre, genero: pedido.genero, arma: pedido.arma,
    });
    await this._listar(c, p.id);
    return p;
  }

  async _borrar(c, m) {
    await this.almacen.borrar(String(m.id));
    return this._listar(c);
  }

  /**
   * Entra al mapa con un personaje: el momento en el que aparece un cuerpo.
   *
   * El personaje se LEE del almacén del servidor. Lo que el cliente manda es un
   * identificador, no un personaje: si mandara el personaje, ponerse
   * Swordsmanship a 100 sería editar un JSON.
   */
  async _elegir(c, m) {
    if (c.cuerpo) return null;                       // ya está dentro
    await c.sesion.arrancar();
    const p = await c.sesion.entrar(String(m.id));
    const donde = c.sesion.donde;
    const pies = this._sitioLibre(donde?.escena ?? this.aparicion?.nacimiento?.escena ?? [0, 0, 0]);
    c.cuerpo = this.mundo.crearCuerpo(pies);
    c.dentro = true;
    c.mandar(MENSAJE.APARECES, {
      donde: donde ?? null,
      // Y el sitio DE VERDAD, que puede no ser el de `donde`: si el punto está
      // ocupado por otro jugador, `_sitioLibre` aparta. El cliente tiene que
      // colocarse donde el servidor le ha puesto y no donde dice el manifiesto,
      // o empieza la partida con un metro de error que la primera foto corrige
      // de un tirón.
      pies,
      entrada: c.sesion.entrada,
      personaje: p,
      tick: this.tick,
    });
    this._suceso("aparece", { id: c.id, nombre: c.nombre, personaje: p.nombre });
    return p;
  }

  /**
   * Un sitio libre cerca del punto de aparición.
   *
   * **Esto es NUESTRO y hace falta por algo que sólo aparece con dos
   * jugadores**: el punto de aparición es uno y las cápsulas chocan, así que el
   * segundo que entra nace DENTRO del primero y el controlador de personaje no
   * le deja moverse. No se ve como un choque: se ve como un jugador paralítico,
   * y el primero no se entera de nada.
   *
   * Se prueba el sitio, y si está ocupado, ocho alrededor a un radio y a dos.
   * Si todo está ocupado —diecisiete jugadores en el templo— se usa el punto de
   * todas formas: quedarse fuera del mapa es peor que quedarse encajado un
   * segundo.
   *
   * MSR no hace esto y no puede: su punto de aparición lo resuelve el motor con
   * la lista de `ms_player_spawn`, que son once y están repartidos por el mapa.
   * El día que se usen los once, esto sobra.
   */
  _sitioLibre(pies) {
    const radio = (this.mundo.perfil?.radius ?? 0.25) * 2.1;
    const ocupado = (p) => {
      for (const c of this.clientes.values()) {
        if (!c.cuerpo) continue;
        const o = c.cuerpo.feet;
        if (Math.hypot(p[0] - o[0], p[2] - o[2]) < radio && Math.abs(p[1] - o[1]) < 2) return true;
      }
      return false;
    };
    if (!ocupado(pies)) return pies;
    for (const anillo of [radio * 1.5, radio * 3]) {
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const p = [pies[0] + Math.cos(a) * anillo, pies[1], pies[2] + Math.sin(a) * anillo];
        if (!ocupado(p)) return p;
      }
    }
    return pies;
  }

  /**
   * Las órdenes. Aquí llega lo único que el cliente puede decidir.
   *
   * Y aquí se cuenta lo perdido: como cada paquete trae las últimas
   * `cl_cmdbackup` órdenes, del hueco entre la última que teníamos y la primera
   * de este paquete sale cuántas se han perdido de verdad.
   */
  _ordenes(c, m) {
    const llegan = Array.isArray(m.ordenes) ? m.ordenes : [];
    if (!llegan.length) return null;
    // El acuse de la foto viaja pegado a las órdenes, que es lo que hace
    // `SV_ParseDelta` (`sv_user.cpp:1504`): el cliente dice qué foto tiene, y
    // el servidor manda la diferencia contra ÉSA y no contra la última suya.
    if (Number.isFinite(m.foto)) c.fotoReconocida = Math.max(c.fotoReconocida, Math.trunc(m.foto));
    if (Number.isFinite(m.lerpMsec)) c.lerpMsec = Math.trunc(m.lerpMsec);

    const nuevas = [];
    for (const cruda of llegan) {
      const o = normalizarOrden(cruda);
      if (o.seq <= c.ultimaRecibida) continue;       // repetida: es el respaldo
      nuevas.push(o);
    }
    if (!nuevas.length) return null;
    nuevas.sort((a, b) => a.seq - b.seq);

    const hueco = nuevas[0].seq - c.ultimaRecibida - 1;
    if (hueco > 0) {
      const { repetirUltima, abandonado } = recuperarPerdidas(hueco, this.red.cmdbackup, this.red);
      c.perdidas += hueco;
      if (abandonado) {
        c.abandonadas += hueco;
      } else if (c.ultimaCorrida) {
        // «Run the last known cmd for each dropped cmd we don't have a backup
        // for» — las que no vienen repetidas en el paquete se sustituyen por la
        // última conocida. No se inventa nada: se repite.
        for (let i = 0; i < repetirUltima; i++) {
          c.cola.push({ ...c.ultimaCorrida, seq: -1, repetida: true });
        }
      }
    }
    for (const o of nuevas) c.cola.push(o);
    c.ultimaRecibida = nuevas[nuevas.length - 1].seq;
    // Y se corren AQUÍ, al llegar, no en el siguiente paso del mundo.
    //
    // Esto costó una vuelta: lo primero que escribí daba a cada cliente un
    // presupuesto de 10 ms por paso, que suena prudente y es falso. El motor
    // corre las órdenes dentro de `SV_ReadPackets`, según llegan
    // (`SV_ParseMove` → `SV_RunCmd`), y tiene que ser así: un cliente a 60
    // fotogramas manda órdenes de 16 ms, y con un presupuesto de 10 ms por
    // paso **ninguna cabría nunca** y el jugador no andaría. Quien decide
    // cuánto tiempo se simula es el cliente, con su `msec`; lo que el servidor
    // vigila es el TOTAL, y eso es `SV_CheckCmdTimes`.
    this._correrOrdenes(c);
    return nuevas.length;
  }

  /**
   * **UN GOLPE A UN BICHO**, que es la otra mitad de mudar la IA.
   *
   * Lo que llega es «he blandido hacia el bicho 17 con esto». Lo que NO llega es
   * cuánta vida le queda: eso lo lleva el servidor. Y el daño que viene se
   * recorta contra el techo del arma que el servidor ve en las manos de ESE
   * personaje, así que un cliente que mande 9 999 le hace al goblin exactamente
   * lo que le haría su espada con el mejor dado y un crítico.
   *
   * Por qué el daño viaja y no se calcula aquí entero, dicho en voz alta: la
   * carga del brazo —cuánto has aguantado el botón, en qué fase está el
   * blandido— vive en el navegador y todavía no viaja. El techo es lo que impide
   * que eso sea un agujero; recalcularlo entero es el paso siguiente y está
   * declarado en IA_28.md §7.
   */
  _pegar(c, m) {
    if (!this.fauna || !c.cuerpo) return null;
    const id = Math.trunc(Number(m.id));
    if (!Number.isFinite(id)) return null;
    const techo = this._techoDeDano(c);
    const dano = Math.min(Math.max(0, Number(m.dano) || 0), techo);
    const pies = c.cuerpo.feet;
    const r = this.fauna.pegar({
      id, dano,
      alcance: Math.max(0, Number(m.alcance) || 0),
      cubo: typeof m.cubo === "string" ? m.cubo.slice(0, 48) : null,
      tipo: typeof m.tipo === "string" ? m.tipo.slice(0, 32) : "",
      // Desde los PIES del jugador tal y como los tiene el servidor, no desde un
      // punto que mande el cliente: si el punto de salida viniera de fuera,
      // pegar desde el otro lado del mapa sería mandar otras coordenadas.
      desde: [pies[0], pies[1], pies[2]],
      // Y CONTRA EL PASADO: el instante que este cliente estaba viendo. Es el
      // mismo `objetivoDe` que el 27 dejó escrito, medido y sin usar —
      // `realtime − latencia − cl_interptime + sv_unlagpush`, con su tope de
      // `sv_maxunlag`. El reloj de la manada y el de la partida son el mismo,
      // porque los dos avanzan en el paso fijo.
      t: this.objetivoDe(c.id),
      quien: c.id,
    });
    if (r.muerto) r.experiencia = this._experiencia(c, this.fauna.manada.de(id));
    c.sucesosPendientes.push({ que: "tupegas", id, ...r, tope: dano >= techo ? techo : undefined });
    return r;
  }

  /**
   * **LA EXPERIENCIA, repartida por el servidor** — y por primera vez entre
   * varios de verdad.
   *
   * El motor no da experiencia al golpear: la va acumulando en el monstruo por
   * habilidad y propiedad y la reparte al morir. Esa mitad ya estaba portada; lo
   * que no podía estar es la otra, porque `jugadoresActivos` y `UTIL_TotalHP`
   * son cuentas **sobre la partida entera** y en el navegador la partida era
   * siempre de uno. Ahora la lista es la de verdad: matar algo con cuatro
   * jugadores dentro da menos que matarlo solo, que es lo que hace el servidor
   * de MSR.
   *
   * Se apunta en el personaje que tiene el servidor, o sea en el que se guarda.
   */
  _experiencia(c, i) {
    const p = c.sesion?.personaje;
    if (!p || !i) return null;
    const nivel = experienciaDelBicho({
      base: i.ficha.ia?.experiencia ?? 0,
      ...autoajustar({
        vidaTotalDelGrupo: vidaTotal(this._laPartida(), PARTIDA),
        seAjusta: Boolean(i.ficha.ia?.seAjusta),
      }),
      reduccion: i.ficha.ia?.reduccionDeExp ?? null,
      esJefe: Boolean(i.ficha.ia?.esJefe),
      jugadores: jugadoresActivos(this._laPartida(), PARTIDA),
      srv: PARTIDA,
    }).exp;
    const xp = expDeLaMuerte({ nivel, vidaMaxima: i.vidaMaxima ?? 0, porCubo: i.recibido });
    let total = 0, entregado = 0, subidas = 0;
    for (const [cubo, cantidad] of Object.entries(xp)) {
      if (!(cantidad > 0)) continue;
      total += cantidad;
      const r = entrenar(p, cubo, cantidad);
      entregado += r.entregado ?? 0;
      subidas += r.subidas;
    }
    if (total > 0) c.sesion.tocado();
    return { total, entregado, subidas };
  }

  /**
   * La partida tal y como la ve `UTIL_TotalHP`: los que están dentro, con su
   * vida MÁXIMA y no la que les queda — un jugador a un punto de vida cuenta
   * entero para el escalado.
   */
  _laPartida() {
    const fuera = [];
    for (const c of this.clientes.values()) {
      const p = c.sesion?.personaje;
      if (!p || !c.cuerpo) continue;
      fuera.push({ activo: c.vivo, vidaMaxima: derivadas(atributosDe(p.habilidades)).vidaMax });
    }
    return fuera;
  }

  /**
   * El techo de daño de este personaje: lo más que puede hacer su arma con el
   * mejor dado, la carga máxima y un crítico.
   *
   *     (dano × multiplicadorDeCarga + danoRango) × fraccionDePotencia(100) × 1,5
   *
   * Las tres piezas son del motor y ya estaban portadas en `src/play/golpe.js`.
   * Sin catálogo no hay techo que calcular, y entonces no se recorta: el
   * servidor sin `objetos.json` ya avisa por consola de lo que le falta.
   */
  _techoDeDano(c) {
    const p = c.sesion?.personaje;
    const arma = p?.manos?.derecha ? this._porId?.get(p.manos.derecha) : null;
    if (!arma?.ataques?.length) return Infinity;
    let techo = 0;
    for (const a of arma.ataques) {
      const mul = a.carga ? (arma.multiplicadorDeCarga ?? 2) : 1;
      const d = ((a.dano ?? 0) * mul + Math.max(0, Math.round(a.danoRango ?? 0)))
        * fraccionDePotencia(TOPE_PROPIEDAD) * CRITICO.multiplicador;
      techo = Math.max(techo, d);
    }
    return techo;
  }

  /**
   * UN BICHO LE PEGA A UN JUGADOR. Lo cobra la sesión **del servidor**, que es
   * la que se guarda: el navegador se enterará por la foto, que ya lleva la vida
   * y el estado.
   */
  _bichoPega(i, cliente, dano) {
    if (!cliente?.sesion || !cliente.vivo) return null;
    const r = cliente.sesion.danar(dano, {
      porQue: i.ficha.nombre ?? i.ficha.clase ?? "un monstruo",
      deQuien: i.id, tipo: "monstruo",
    });
    this._suceso("dano", { id: cliente.id, de: i.id, dano: Math.round(dano * 10) / 10 });
    return r;
  }

  /** Un suceso de la manada, a la cola de cada cliente. */
  _repartirSucesos(lista) {
    for (const c of this.clientes.values()) {
      c.sucesosPendientes.push(...lista);
      // Un tope por si alguien no recibe: sin él, un cliente con la conexión
      // caída acumula los sucesos de los 69 bichos para siempre.
      if (c.sucesosPendientes.length > 120) {
        c.sucesosPendientes.splice(0, c.sucesosPendientes.length - 120);
      }
    }
  }

  _pong(c, m) {
    if (!c._ping || m.t0 !== c._ping) return null;
    // Ida y vuelta entera, como el `latency` del motor. No se divide entre dos:
    // `SV_SetupMove` resta la latencia completa porque lo que hay que deshacer
    // es el viaje de ida MÁS el de vuelta de la foto que el cliente vio.
    c.latencia = Math.max(0, this.t - c._ping);
    c._ping = null;
    return c.latencia;
  }

  // ── el reloj ──────────────────────────────────────────────────────────────

  /**
   * Avanza la partida el tiempo que haya pasado, **a pasos fijos**.
   *
   * Paso fijo y no «el tiempo que pasó desde la última vez», y esto no es
   * estilo: un paso variable hace que el mismo salto llegue a distinta altura
   * según lo cargado que esté el servidor, y hace que la predicción del cliente
   * —que sí corre a pasos fijos— nunca coincida. Lo que sobra se guarda para
   * el siguiente reloj, que es lo que impide perder tiempo por el camino.
   */
  avanzar(dt) {
    this._sobra += Math.max(0, dt);
    let pasos = 0;
    // Un tope por vuelta: si el proceso se quedó parado diez segundos, no se
    // simulan mil pasos de golpe —eso congela otros diez— y se tira lo demás.
    const tope = Math.max(1, Math.round(this.red.ticrate));
    while (this._sobra >= this.paso && pasos < tope) {
      this._paso();
      this._sobra -= this.paso;
      pasos++;
    }
    if (pasos >= tope) this._sobra = 0;
    return pasos;
  }

  _paso() {
    this.tick++;
    this.t += this.paso;
    for (const c of this.clientes.values()) {
      c.sesion?.tic({ botonPulsado: false });
      this._apuntarHistoria(c);
    }
    // LOS BICHOS, en el mismo paso fijo que los jugadores.
    //
    // En el mismo y no en un reloj aparte, y no es comodidad: un goblin que
    // piensa a 30 y se mueve a 100 da un movimiento a tirones, y sobre todo la
    // línea de visión y la posición del jugador tienen que ser del mismo
    // instante — si no, el monstruo dispara a donde el jugador estaba hace un
    // paso y se ve como que apunta mal.
    if (this.fauna) {
      this.fauna.paso(this.paso);
      const nuevos = this.fauna.manada.recogerSucesos();
      if (nuevos.length) this._repartirSucesos(nuevos);
    }
    // Una vez por segundo, como el motor.
    if (this.t - this._ultimoChequeo >= 1) {
      this._ultimoChequeo = this.t;
      for (const c of this.clientes.values()) this._chequearReloj(c);
    }
  }

  /**
   * `SV_CheckCmdTimes` — `sv_main.cpp:8015-8045`. El freno contra el «speed
   * hack», que es contable y no físico:
   *
   *     float dif = cl->connecttime + cl->cmdtime - realtime;
   *     if (dif > clockwindow.value) {
   *       cl->ignorecmdtime = clockwindow.value + realtime;
   *       cl->cmdtime = realtime - cl->connecttime;
   *     }
   *     if (dif < -clockwindow.value) cl->cmdtime = realtime - cl->connecttime;
   *
   * O sea: el servidor no mira si te mueves raro, mira **cuánto tiempo has
   * pedido simular**. Un cliente que manda el doble de órdenes anda el doble de
   * rápido y su `cmdtime` crece el doble; en medio segundo se le nota y se le
   * ignora medio segundo. Y quedarse corto no se castiga: eso es ir con la
   * conexión mala, y el castigo sería para el que ya lo está pasando peor.
   */
  _chequearReloj(c) {
    const dif = c.desde + c.tiempoPedido - this.t;
    if (dif > this.red.ventanaDelReloj) {
      c.ignorarHasta = this.t + this.red.ventanaDelReloj;
      c.tiempoPedido = this.t - c.desde;
      this._suceso("reloj", { id: c.id, nombre: c.nombre, adelanto: Math.round(dif * 1000) });
      return "adelantado";
    }
    if (dif < -this.red.ventanaDelReloj) {
      c.tiempoPedido = this.t - c.desde;
      return "atrasado";
    }
    return "en hora";
  }

  /**
   * Corre lo que haya en la cola de este cliente, con la partición de los
   * 50 ms de `SV_RunCmd`.
   */
  _correrOrdenes(c) {
    if (!c.cuerpo || !c.cola.length) return 0;
    let corridas = 0;
    while (c.cola.length) {
      const o = c.cola.shift();
      // Mientras está castigado, el tiempo SE SIGUE CONTANDO y la orden no se
      // corre (`sv_user.cpp:767-771`). Es lo que impide escaparse del castigo
      // callando: el reloj del cliente sigue adelantado hasta que el de verdad
      // le alcanza.
      c.tiempoPedido += o.msec / 1000;
      if (this.t < c.ignorarHasta) {
        c.ignoradas++;
        if (o.seq > 0) c.ultimaOrden = o.seq;
        continue;
      }
      for (const ms of partirOrden(o.msec)) {
        if (ms <= 0) continue;
        this._simular(c, o, ms / 1000);
      }
      if (o.seq > 0) c.ultimaOrden = o.seq;
      c.ultimaCorrida = o;
      corridas++;
    }
    return corridas;
  }

  /** Lo que este personaje puede. Sale del personaje que tiene EL SERVIDOR. */
  _vitales(c) { return vitalesDe(c.sesion?.personaje, this._porId); }

  /**
   * **La velocidad la decide el servidor**, y es la otra mitad de la autoridad.
   *
   * Recortar la intención a [-1, 1] impide andar el doble; lo que impide
   * *trotar siempre* es esto: el cliente manda el BOTÓN de correr, y quien lleva
   * la cuenta del aguante —gastarlo trotando, recuperarlo andando— es el
   * servidor. La cuenta está en `src/red/andar.js` y la usan los dos lados, que
   * es lo único que hace que coincidan.
   */
  _velocidad(c, o, dt) {
    c.maxima = velocidadDelPaso(c, { orden: o, dt, vitales: this._vitales(c), rapidez: c.cuerpo.rapidez });
    return c.maxima;
  }

  _simular(c, o, dt) {
    const cuerpo = c.cuerpo;
    cuerpo.yaw = o.yaw;
    cuerpo.pitch = o.cabeceo;
    cuerpo.step(dt, {
      forward: o.adelante,
      strafe: o.lado,
      jump: (o.botones & BOTON.SALTAR) !== 0,
      agachar: (o.botones & BOTON.AGACHAR) !== 0,
      maxima: this._velocidad(c, o, dt),
    });
  }

  /**
   * La historia de posiciones, que es lo que permite rebobinar.
   *
   * `MULTIPLAYER_BACKUP` es 64 (`netchan.h:75`), o sea 0,64 s a 100 pasos por
   * segundo — y `sv_maxunlag` es 0,5. Los dos números encajan: la historia
   * cubre justo lo máximo que se compensa, ni un paso más.
   */
  _apuntarHistoria(c) {
    if (!c.cuerpo) return;
    const h = this.historia.get(c.id);
    if (!h) return;
    const [x, y, z] = c.cuerpo.feet;
    h.push({ t: this.t, pies: [x, y, z], yaw: c.cuerpo.yaw });
    if (h.length > this.red.historia) h.shift();
  }

  /**
   * **Rebobinar**: dónde estaba cada jugador en el instante `objetivo`.
   *
   * Es la mitad de `SV_SetupMove` que el motor usa para resolver un disparo con
   * el mundo que el tirador estaba viendo. La otra mitad —mover de verdad los
   * cuerpos, resolver y volverlos a su sitio— no está hecha, porque el combate
   * entre jugadores todavía no existe: lo que hay aquí es la consulta, medida y
   * comprobada, para que el día que haya golpes no se invente.
   *
   * Entre dos muestras se interpola. Si el instante cae antes de la historia
   * que se guarda, se devuelve la más vieja: es lo que hace el motor cuando la
   * latencia se pasa de `sv_maxunlag`.
   */
  rebobinar(objetivo, { salvo = null } = {}) {
    const fuera = new Map();
    for (const [id, h] of this.historia) {
      if (id === salvo || !h.length) continue;
      if (objetivo >= h[h.length - 1].t) { fuera.set(id, h[h.length - 1]); continue; }
      if (objetivo <= h[0].t) { fuera.set(id, h[0]); continue; }
      let i = h.length - 1;
      while (i > 0 && h[i - 1].t > objetivo) i--;
      const a = h[i - 1];
      const b = h[i];
      const span = b.t - a.t;
      const f = span > 0 ? (objetivo - a.t) / span : 0;
      fuera.set(id, {
        t: objetivo,
        pies: [0, 1, 2].map((k) => a.pies[k] + (b.pies[k] - a.pies[k]) * f),
        yaw: a.yaw,
      });
    }
    return fuera;
  }

  /** El instante al que hay que rebobinar para este cliente. */
  objetivoDe(id) {
    const c = this.clientes.get(id);
    if (!c) return this.t;
    return tiempoObjetivo({
      ahora: this.t, latencia: c.latencia,
      lerpMsec: c.lerpMsec ?? Math.round(this.red.exInterp * 1000),
      intervalo: c.intervalo, red: this.red,
    });
  }

  // ── las fotos ─────────────────────────────────────────────────────────────

  /** El estado de un jugador tal y como viaja. */
  _estado(c) {
    if (!c.cuerpo) return null;
    const [x, y, z] = c.cuerpo.feet;
    const red = (v) => Math.round(v * 1000) / 1000;   // milímetros: sobra
    return {
      id: c.id,
      nombre: c.nombre,
      pies: [red(x), red(y), red(z)],
      yaw: red(c.cuerpo.yaw),
      cabeceo: red(c.cuerpo.pitch ?? 0),
      suelo: Boolean(c.cuerpo.grounded),
      // La VELOCIDAD viaja, y no es un extra: es lo que el cliente necesita
      // para rehacer sus órdenes desde el estado del servidor. Es el
      // `clientdata_t` del motor, que lleva `velocity` por la misma razón.
      // Sin ella la corrección arregla el sitio y deja la deriva intacta.
      vel: c.cuerpo.vel ? c.cuerpo.vel.map(red) : null,
      // La rapidez va porque la necesita quien dibuje: decide la animación y el
      // sonido de los pasos. En unidades por segundo, como el motor — y esa
      // frase es la del 26, que costó una sesión.
      rapidez: red(c.cuerpo.rapidez ?? 0),
      vida: c.sesion?.personaje?.vida ?? null,
      estado: c.sesion?.estado ?? null,
    };
  }

  /**
   * La foto para un cliente, **con sólo lo que ha cambiado** desde la última
   * que reconoció.
   *
   * Es la compresión delta del motor en su versión más simple: por jugador y no
   * por campo. Y lleva la trampa que hay que respetar: **se compara contra la
   * foto que el cliente dice tener**, no contra la última que mandamos. Si se
   * compara contra la última, un paquete perdido deja al cliente sin esa
   * diferencia para siempre — y el otro jugador se queda clavado en la pared.
   */
  foto(c) {
    const anterior = c.fotoReconocida ? c.fotosMandadas.get(c.fotoReconocida) ?? null : null;
    const base = anterior?.jugadores ?? null;
    const porId = new Map();
    const jugadores = [];
    for (const otro of this.clientes.values()) {
      const e = this._estado(otro);
      if (!e) continue;
      porId.set(otro.id, e);
      const antes = base?.get(otro.id);
      // **El propio jugador va SIEMPRE**, aunque no haya cambiado nada.
      //
      // Esto lo cazó la sonda y es de los buenos: con la compresión delta, un
      // cliente quieto no recibía su propio estado, así que si su predicción se
      // equivocaba —o si mentía— **no había nada contra lo que reconciliar** y
      // la corrección no llegaba nunca. Se le teletransportaba dos metros y el
      // servidor callaba, porque desde su punto de vista no había novedad.
      //
      // El motor no tiene este problema porque lo propio no viaja por el mismo
      // camino: `svc_clientdata` va en CADA mensaje, aparte de las entidades.
      // Aquí es el mismo campo con una excepción, que es lo mismo escrito de
      // otra manera.
      if (otro.id === c.id || !antes || !igual(antes, e)) jugadores.push(e);
    }
    const fuera = [];
    if (base) for (const id of base.keys()) if (!porId.has(id)) fuera.push(id);

    // ── LOS BICHOS, con la misma compresión delta y por el mismo motivo ──────
    //
    // Son 69 y cambian casi todos —53 pasean—, pero «casi» es la palabra: los
    // 16 clavados (los tenderos, el alcalde, el cofre) no cambian nunca, y los
    // muertos tampoco después de los veinte segundos. La foto completa son unos
    // 4 kB y veinte por segundo serían 80 kB/s por jugador sólo de monstruos.
    const bichos = [];
    let bSeq = anterior?.bichos ?? 0;
    if (this.fauna) {
      const antes = bSeq ? this._fotosDeBichos.get(bSeq) ?? null : null;
      const ahora = this._fotoDeBichos();
      for (const [id, e] of ahora.mapa) {
        const viejo = antes?.get(id);
        if (!viejo || !igualBicho(viejo, e)) bichos.push(e);
      }
      bSeq = ahora.seq;
    }

    c.fotoSeq++;
    c.fotosMandadas.set(c.fotoSeq, { jugadores: porId, bichos: bSeq });
    // Las 64 del motor: lo más viejo se tira. Sin este recorte, una partida de
    // una hora guarda setenta mil fotos por jugador.
    if (c.fotosMandadas.size > this.red.historia) {
      c.fotosMandadas.delete(c.fotosMandadas.keys().next().value);
    }
    // Los sucesos se VACÍAN al mandarlos: son de un solo reparto, y si se
    // quedaran, un golpe sonaría en cada foto hasta el final de la partida.
    const sucesos = c.sucesosPendientes;
    c.sucesosPendientes = [];
    const foto = {
      seq: c.fotoSeq,
      tick: this.tick,
      tiempo: Math.round(this.t * 1000) / 1000,
      /** El acuse: hasta qué orden suya está simulada esta foto. */
      ack: c.ultimaOrden,
      completa: !base,
      jugadores,
      fuera,
    };
    if (this.fauna) foto.bichos = bichos;
    if (sucesos.length) foto.sucesos = sucesos;
    return foto;
  }

  /**
   * La foto de la manada de ESTE paso, guardada una vez para todos.
   *
   * Se calcula como mucho una vez por paso: dos clientes que reciben en la
   * misma vuelta comparten la misma, que es lo que permite que la cola de 64 no
   * dependa de cuántos jugadores haya.
   */
  _fotoDeBichos() {
    if (this._ultimaDeBichos?.tick === this.tick) return this._ultimaDeBichos;
    const mapa = new Map();
    for (const i of this.fauna.manada.instancias) mapa.set(i.id, this.fauna.manada.estadoDe(i));
    this._bichoSeq++;
    this._fotosDeBichos.set(this._bichoSeq, mapa);
    if (this._fotosDeBichos.size > this.red.historia) {
      this._fotosDeBichos.delete(this._fotosDeBichos.keys().next().value);
    }
    this._ultimaDeBichos = { seq: this._bichoSeq, mapa, tick: this.tick };
    return this._ultimaDeBichos;
  }

  /**
   * Manda a cada cliente lo que le toque, si le toca.
   *
   * Cada uno tiene su propio reloj de envío (`next_messageinterval`), y por eso
   * no hay un «tick de red» común: dos clientes con `cl_updaterate` distinto
   * reciben a ritmos distintos, que es como funciona GoldSrc.
   */
  repartir() {
    let mandadas = 0;
    for (const c of this.clientes.values()) {
      if (!c.dentro) continue;
      if (this.t < c.proximaFoto) continue;
      c.proximaFoto = this.t + c.intervalo;
      c.mandar(MENSAJE.FOTO, this.foto(c));
      mandadas++;
      // El ping va pegado a la foto y no en su propio reloj: una medida de
      // latencia que viaja sola mide el camino de un paquete que no se parece
      // a los que lleva el juego.
      if (c._ping === null) {
        c._ping = this.t;
        c.mandar(MENSAJE.PING, { t0: this.t });
      }
    }
    return mandadas;
  }

  _suceso(que, datos) {
    this.sucesos.push({ t: this.t, que, ...datos });
    if (this.sucesos.length > 200) this.sucesos.shift();
  }

  /** Lo que la lista de partidas enseña de ésta. */
  get resumen() {
    return {
      nombre: this.nombre,
      mapa: this.aparicion?.mapa ?? null,
      jugadores: [...this.clientes.values()].filter((c) => c.dentro).length,
      conectados: this.clientes.size,
      max: this.red.maxJugadores,
      tick: this.tick,
      tiempo: Math.round(this.t),
      ...(this.fauna ? this.fauna.resumen : {}),
    };
  }
}

/**
 * Dos estados de bicho son iguales si nada de lo que se dibuja ha cambiado.
 *
 * `g` —la generación de la animación— entra en la comparación aunque el nombre
 * sea el mismo, y es lo que hace que dos golpes seguidos con la misma secuencia
 * lleguen como dos golpes. Comparando sólo nombres, el segundo no viajaría y el
 * bicho daría un solo hachazo por cada dos.
 */
function igualBicho(a, b) {
  return a.p[0] === b.p[0] && a.p[1] === b.p[1] && a.p[2] === b.p[2] &&
    a.y === b.y && a.a === b.a && a.g === b.g && a.v === b.v &&
    a.m === b.m && a.o === b.o;
}

/** Dos estados son iguales si nada de lo que se dibuja ha cambiado. */
function igual(a, b) {
  return a.pies[0] === b.pies[0] && a.pies[1] === b.pies[1] && a.pies[2] === b.pies[2] &&
    a.yaw === b.yaw && a.cabeceo === b.cabeceo && a.suelo === b.suelo &&
    a.rapidez === b.rapidez && a.vida === b.vida && a.estado === b.estado &&
    a.nombre === b.nombre &&
    (a.vel?.[0] === b.vel?.[0] && a.vel?.[1] === b.vel?.[1] && a.vel?.[2] === b.vel?.[2]);
}
