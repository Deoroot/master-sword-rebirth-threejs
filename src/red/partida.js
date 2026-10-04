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

import { Sesion, ESTADO, ENTRADA } from "../juego/sesion.js";
// EL 99: `PM_CheckStuck` y `PM_TestPlayerPosition` (doc/REAPARECER_99.md).
import { Atasco, probadorDe, atascarse, bichosDentro, encender } from "../play/atasco.js";
import RAPIER from "@dimforge/rapier3d-compat";
import { vitalesDe, velocidadDelPaso } from "./andar.js";
// El techo de daño sale de las mismas tres piezas que el daño del navegador, y
// eso es lo que hace que sea un techo y no un número inventado.
import { fraccionDePotencia, TOPE_PROPIEDAD, CRITICO, expDeLaMuerte } from "../play/golpe.js";
import { entrenar } from "../juego/personaje.js";
import { hablar, MAX_LETRAS, RANGO_LOCAL, HABLA, loOye, distancia2D, dentroDelCorral, panelDeRecado } from "../play/chat.js";
import { InteraccionesNpc } from "../juego/interacciones.js";
// EL 95: el brillo de un jugador viaja en SU foto (doc/BRILLO_95.md).
import { brilloDeLaEntidad, podarBrillos, mismoBrillo } from "../play/brillo.js";
// El 81: `setmovedest` y el rayo de `$cansee` también en el camino del SERVIDOR.
// `ganchoDeMovedest` y `loVe` son los mismos que usa `src/main.js`; lo único que
// cambia entre los dos mundos es la física que se les inyecta.
import { ganchoDeMovedest, loVe } from "../play/movedest.js";
import { ojoDe } from "../play/manada.js";
import { comprar as comprarEnTienda, vender as venderEnTienda, MAX_OBJETOS } from "../play/tienda.js";
// El 92: el anfitrión de los efectos de cada jugador, y la frase de «X hits
// you», que es la misma función que usa el navegador (dos textos serían dos
// juegos, el 63).
import { GuionDelJugador } from "../play/guionjugador.js";
import { TablaDeEfectos } from "../play/efectos.js";
import { golpeRecibido, parryDelJugador as fraseDeParry } from "../play/mensajesdecombate.js";
// EL 97: LA DEFENSA DEL JUGADOR, la MISMA que en solitario (`golpear` en
// src/main.js): armadura, escudo, daño negativo a cero y parry del motor. No
// se copia ninguna regla; aquí sólo se le pregunta al mundo del servidor lo
// que en el navegador se le pregunta al suyo (doc/DEFENSARED_97.md).
import { defensaDelJugador, dentroDelCono2D, Brazal, POSTURA } from "../play/escudo.js";
import { valorDeParryDelJugador, manosDelParry } from "../play/parry.js";
import { seVisteAlCargar, correEnElServidor } from "../play/armadura.js";
// EL 98: las trabas de los efectos, las mismas que en solitario (doc/SERVIDOR_98.md).
import { trabasDelJugador, velocidadConTrabas, trabarIntencion, trabasParaElCable } from "../play/trabas.js";
import { GuionesDeObjeto, GuionDeObjeto, QUIEN_VISTE } from "../play/guionobjeto.js";
import { atributosDe, derivadas } from "../juego/stats.js";
import {
  PARTIDA, vidaTotal, jugadoresActivos, autoajustar, experienciaDelBicho,
} from "../juego/servidor.js";
import {
  RED, MENSAJE, empaquetar, orden as normalizarOrden, partirOrden,
  recuperarPerdidas, tiempoObjetivo, intervaloDeEnvio, BOTON,
} from "./protocolo.js";

/**
 * EL 99: DÓNDE SE PONE EL CUERPO AL APARECER, que es el punto tal cual.
 *
 * El motor lo pone UNA UNIDAD más arriba —«`pev->origin =
 * pSpawnSpot->pev->origin + Vector(0, 0, 1)`», player.cpp:2937— y en el primer
 * `PM_PlayerMove` `PM_CatagorizePosition` traza dos unidades hacia abajo y lo
 * baja a la que ha encontrado («If we could make the move, drop us down that 1
 * pixel», pm_shared.cpp:1783 y :1804-1806): o sea que la caja acaba apoyada en
 * el suelo. Aquí esa unidad se probó y SE QUITÓ: eran 2,5 cm de caída que el
 * cliente y el servidor no predicen igual —medido, `test/red_27` «sin mentiras
 * la predicción acierta» pasó de 0 a **27,9 mm** de error— y el controlador de
 * Rapier ya deja su propia holgura (`skin`) con lo que toca. Se queda como una
 * función para que esto esté escrito en un solo sitio.
 */
export function puntoDeAparicion(escena) {
  return [escena[0], escena[1], escena[2]];
}

/** EL 99: lo más que puede costar, en reloj de pared, correr las órdenes de UN mensaje (`_correrOrdenes`). */
// 200 y no 50: lo que se viene a parar son órdenes de 100 ms a 2 s CADA UNA
// (doc/REAPARECER_99.md §3-§4), no un paquete normal en una máquina cargada.
// Con 50, `npm test` —todos los archivos a la vez— dio un rojo en
// `test/red99` («no vuelve a corregir») que el archivo solo no da; NO está
// medido que fuera el tope, pero un tope que pudiera tirar órdenes buenas
// por la carga de la máquina sería un fallo nuevo, y 200 deja ese margen.
export const TOPE_MS_POR_MENSAJE = 200;

/**
 * EL 100: lo más que puede costar, en reloj de pared, correr las órdenes de UN
 * CLIENTE en cada segundo de reloj de pared (`_correrOrdenes`). Nuestro, como
 * el de arriba, y es el que de verdad acota.
 *
 * El tope por mensaje deja correr SIEMPRE la primera orden (`corridas > 0`),
 * así que no acota nada cuando la primera ya cuesta más que lo que tarda en
 * llegar el mensaje siguiente. Medido en la sonda del 99 colgada (doc/SERVIDOR_100.md
 * §2): `computeColliderMovement` a 100-250 ms POR LLAMADA, el reloj de la
 * partida parado en el mismo `t` durante minutos, y cada mensaje pagando una
 * orden: los mensajes llegaban más deprisa de lo que se despachaban y la cola
 * del socket crecía sin fondo. 250 por segundo deja a un cliente roto en el
 * cuarto de un segundo y al resto de la partida —el paso fijo, los otros
 * jugadores, `/partidas`— en los otros tres; una orden normal cuesta menos de
 * un milisegundo, así que sesenta por segundo no se acercan.
 *
 * Y sólo a partir del SEGUNDO segundo seguido por encima (`_correrOrdenes`):
 * la primera versión mordía en el primero y `npm test` en paralelo la puso
 * roja en cinco archivos de red — un primer paso de 738 ms, de construir el
 * árbol con la máquina cargada, se llevaba el presupuesto y las veintinueve
 * órdenes buenas de detrás se quedaban sin correr. Y sólo si ese segundo
 * anterior costó más reloj que el tiempo que simulaba: la segunda versión
 * dejaba «clavado» al de test/atasco100, que manda 3 600 órdenes baratas
 * seguidas, más deprisa que el tiempo real, con la máquina cargada.
 */
export const TOPE_MS_POR_SEGUNDO = 250;

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
    // El 62: los guiones de los NPC, para correrlos AQUÍ. Opcional: una
    // partida sin ellos es la del suelo liso de las pruebas, y sigue valiendo.
    guiones = null, menus = null,
    // El 63: el oro con el que entra cada personaje, si el operador lo dice.
    // `null` es «el suyo», que es lo normal.
    oroInicial = null,
    // ── EL 92: LO QUE HACE FALTA PARA QUE UN EFECTO CAIGA EN UN JUGADOR ──
    //
    // `efectos` es `build/msr/efectosguion.json` y `fichaDelJugador`
    // `build/msr/jugador.json`: con los dos, cada cliente tiene aquí un
    // anfitrión de efectos (`_efectosDe`). Sin ellos un `applyeffect` de un
    // guion de NPC se apunta como hasta ahora («sin anfitrión de efectos»).
    efectos = null, fichaDelJugador = null,
    // `{ "monsters/giantrat": ["add_dot_poison"] }`: eventos que se le llaman
    // al guion de un bicho al nacer. Es lo que un mapa pide con los `params`
    // de la entidad (`npcatk_do_events`, monsters/base_self_adjust.script:74-103) y que hoy no llega
    // por su camino (doc/BICHOS_GUION_91.md §2: `G_MAP_ADDPARAMS`). Perilla del
    // operador, como `oroInicial`: ver `--params` en `tools/servidor.mjs`.
    paramsDeBicho = null,
    // EL 97: `build/msr/objetosguion.json`, los guiones de los objetos. Con
    // ellos la armadura PUESTA protege también con servidor: su
    // `game_takedamage` corre aquí (`_equipoDe`). Sin ellos no hay armadura,
    // y se cuenta en `defensa.sinGuiones`.
    objetosGuion = null,
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
    this.oroInicial = oroInicial === null ? null : Math.max(0, Math.trunc(Number(oroInicial) || 0));
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
      this.fauna.golpear = (i, j, dano, tipo) => this._bichoPega(i, j, dano, tipo);
    }
    /**
     * Las fotos de la manada, por número. Una sola cola para TODOS los clientes,
     * a diferencia de las de jugadores: el estado de un bicho es el mismo para
     * todo el mundo, así que guardar 64 × 69 una vez cuesta lo mismo con un
     * jugador que con treinta y dos.
     */
    this._fotosDeBichos = new Map();
    this._bichoSeq = 0;

    /**
     * ── LOS GUIONES, EN EL SERVIDOR — experimento 62 ────────────────────────
     *
     * Hasta aquí cada navegador corría su copia del guion de cada NPC. Con un
     * jugador es lo mismo; con dos son **dos vendedores distintos con el mismo
     * nombre**, cada uno con sus variables, su estante y su oro, y los dos
     * pueden venderte la última daga.
     *
     * En el mod esto nunca fue del cliente: `game_menu_getoptions` corre en el
     * servidor y el cliente sólo dibuja lo que le llega; elegir es
     * `menuselect` de vuelta (menu.cpp:143, multiplay_gamerules.cpp:1576).
     *
     * `InteraccionesNpc` no toca el DOM ni Three desde que se extrajo, así que
     * se monta aquí tal cual. Lo que cambia es que **no tiene una sesión**:
     * la sesión va por parámetro en cada llamada, porque hay hasta treinta y
     * dos y el guion es uno por NPC.
     */
    this.interacciones = null;
    this.tablaDeEfectos = efectos ? new TablaDeEfectos(efectos) : null;
    this.fichaDelJugador = fichaDelJugador;
    this.paramsDeBicho = paramsDeBicho ?? null;
    this.guionesDeObjeto = objetosGuion ? new GuionesDeObjeto(objetosGuion) : null;
    /**
     * EL 97: lo que ha hecho la defensa con los golpes de los bichos, para
     * medirlo desde fuera (`/costura`). Se cuenta en el servidor, que es
     * donde se decide.
     */
    this.defensa = { golpes: 0, conArmadura: 0, bloqueos: 0, desvios: 0, parados: 0, sinGuiones: 0, danados: 0, ultimo: null, historial: [] };
    /**
     * Las tiradas de la defensa, fijas, para las pruebas (`dados` de
     * `defensaDelJugador`: `parry`, `acierto`, `arriba`, `abajo`). `null` es
     * el azar de verdad, que es lo que hace el juego.
     */
    this.dadosDeDefensa = null;
    /** Los guiones de bicho a los que ya se les ha llamado `paramsDeBicho`. */
    this._conParams = new WeakSet();
    /** El 92: cuántos `applyeffect` pidió un guion sin jugador a quien ponérselo. */
    this.efectosSinJugador = 0;
    /**
     * EL 95: lo que han dicho los guiones de los NPC y a quién le llegó. `sinJugador`
     * es un mensaje para «su» jugador desde un guion que no tiene ninguno
     * atado (no se adivina a quién: se cuenta); `sinSitio`, un `saytext` de un
     * NPC del que no se sabe dónde está.
     */
    this.voz = { dichas: 0, oidas: 0, sinSitio: 0, sinJugador: 0, avisos: 0 };
    if (guiones && this.fauna) {
      this.interacciones = new InteraccionesNpc({
        sesion: null,
        guiones, menus,
        catalogo: this._porId,
        // EL 92: «j3» es el cliente del hueco 3. Ver `alCombate`.
        jugadorDe: (id) => this._clienteDeObjetivo(id)?.sesion ?? null,
        // EL 92: `applyeffect` desde un guion de NPC —el veneno de una rata en
        // su `game_dodamage`, la cura del sumo sacerdote en su menú—, al
        // jugador con el que habla el guion AHORA: el que abrió el menú, o el
        // del golpe mientras corre la costura (`alCombate` pone
        // `hablandoCon`). Sin tablas no se pasa el gancho, y el guion lo
        // apunta como antes.
        aplicarEfecto: this.tablaDeEfectos && this.fichaDelJugador
          ? (ruta, params, o) => {
            // EL 93 (pieza G): el objetivo es el jugador DE ESE GUION
            // (`GuionDeNpc.aplicarEfecto` sólo deja pasar su asa), y no el
            // último que abrió un menú: el salto de la araña pone su veneno
            // desde un `callevent`, fuera de `alCombate`. Ver `_clienteDelGuion`.
            const c = this._clienteDelGuion(o?.aplicador?.instancia) ?? this._aQuienHabla();
            if (!c) { this.efectosSinJugador++; return null; }
            return this._efectosDe(c)?.efectos?.aplicar(ruta, params, o) ?? null;
          }
          : null,
        npcPorId: (id) => this.fauna?.manada?.de?.(id) ?? null,
        // EL 93 (pieza G): el `playanim` del guion de un bicho, a la manada,
        // como en `src/main.js` (`bichos.deUnaVez`). Sin él `InteraccionesNpc`
        // lo tiraba, y con servidor `playanim critical jumpmiss` no ponía la
        // animación cuyo fotograma 22 dispara `frame_jump` (spider.script:107,
        // :118): la araña cumplía todas las condiciones del salto y no saltaba.
        // Lo mismo que doc/SALTO_93.md §4 encontró en el arnés del 92.
        // EL 94: con el MODO (`once` no rompe lo que corre; `critical` sí:
        // npcscript.cpp:1514-1550). Ver `Manada.playanim`.
        animar: (instancia, nombre, modo) => this.fauna?.manada?.playanim?.(instancia, nombre, modo),
        // A quién va cada recado: `this.hablandoCon` es la sesión del que
        // habló, y de la sesión se saca su cliente. `MSG_ONE`, no `MSG_ALL`.
        // EL 95: eso valía para lo que dice el MENÚ mientras se contesta; lo
        // que dice un GUION va a quien diga el guion. Ver `_sucesoDeGuion`.
        suceso: (tipo, texto, o = null) => this._sucesoDeGuion(tipo, texto, o),
        ventanaDeAviso: (titulo, texto, _sesion, o = null) => this._avisoDeGuion(titulo, texto, o),
        abrirTienda: (o) => this._ofrecerTienda(o),
        comoEstaElCliente: (vendedor, cliente) => this._comoEstaElCliente(vendedor, cliente),
        // El 79. Quién habla cambia en cada llamada, así que `_decir` pone los
        // pies antes de repartir; esto es el valor por omisión para el camino
        // del menú, donde el que habla es `hablandoCon`.
        losNpc: () => this.fauna?.manada?.instancias ?? [],
        // EL 93 (pieza G): con el asa del jugador del guion que pregunta
        // (`sitioDelJugador`, interacciones.js), que manda sobre «con quién
        // habla»: ver `_clienteDeAsa`.
        dondeEstaElJugador: (asa = null) => {
          const c = this._clienteDeAsa(asa) ?? this._aQuienHabla();
          return c?.cuerpo ? [...c.cuerpo.feet] : null;
        },
        unidadesPorMetro: this.mundo?.perfil?.unidadesPorMetro ?? 39.37,
        // ── EL 81: LOS DOS GANCHOS QUE ESTE CONSTRUCTOR NO TENÍA ───────────
        //
        // `src/main.js` los inyecta desde el 81 y **esta clase se monta DOS
        // veces**: aquí y allí. Sin estas dos líneas, con servidor el gancho
        // `irA` seguía siendo el `=> {}` del experimento 43 —ningún NPC se gira
        // al hablarle ni anda por su guion— y `$cansee` contestaba «no» a todo,
        // con lo que cualquier bloque que empiece por `if $cansee(...)` se
        // abandona ENTERO, porque es un `if` VIEJO (el 67).
        //
        // Es la costura del 63 con las dos mitades verdes: la regla escrita,
        // citada y medida; el camino de un jugador la ejecuta y éste no la
        // recibía. Y no lo vio ninguna prueba ni ninguna sonda porque **las
        // sondas de combate y de guiones miden UN navegador**: el caso sólo
        // existe con dos. *Un gancho inyectado en un sitio no está inyectado:
        // hay que buscar quién más construye esa clase, porque dos
        // constructores de la misma clase son dos juegos.*
        mandarADestino: (instancia, avisar, apuntar) => ganchoDeMovedest({
          manada: this.fauna?.manada ?? null,
          instancia,
          // El cuerpo del jugador lo sabe ESTA clase, no la fauna: ver el
          // comentario de `entidadDeGuion`. EL 94: el del jugador que NOMBRA
          // el guion (`RetrieveEntity(Params[0])`, npcscript.cpp:1628), no el
          // último que abrió un menú. Ver `_cuerpoDeRef`.
          buscar: (n) => this.fauna?.arnes?.entidadDeGuion?.(
            n, instancia, this._cuerpoDeRef(n, instancia)) ?? null,
          libre: this.fauna?.arnes?.libreConBichos?.(instancia) ?? (() => true),
          avisar, apuntar,
        }),
        // El rayo de este mundo. La REGLA es `loVe` y está en un solo sitio; lo
        // que cambia es la física. Ver `trazarParaVer` en `src/red/fauna.js`.
        lineaDeVision: (ref, instancia) => {
          const a = this.fauna?.arnes;
          if (!a || !instancia) return false;
          // EL 94: `RetrieveEntity(Name)` de `$cansee` (npcscript.cpp:1765),
          // con el asa que trae el guion. Ver `_cuerpoDeRef`.
          const q = a.entidadDeGuion?.(ref, instancia, this._cuerpoDeRef(ref, instancia)) ?? null;
          if (!q) return false;
          const U = this.mundo?.perfil?.unidadesPorMetro ?? 39.37;
          const n = instancia.donde;
          return loVe({
            miOjo: [n[0], n[1] + ojoDe(instancia) / U, n[2]],
            suOjo: [q.ojo[0] / U, q.ojo[1] / U, q.ojo[2] / U],
            suColisionador: q.colisionador,
            trazar: a.trazarParaVer?.(instancia),
          });
        },
      });
      // ── EL 92: LA COSTURA DEL 91, TAMBIÉN AQUÍ ──────────────────────────
      //
      // `src/main.js` enchufa la manada del navegador desde el 91; ésta no la
      // enchufaba nadie, así que **con servidor ningún bicho corría guion**:
      // la manada lo contaba en `costuraSinOyente` y seguía. La misma línea
      // que dejó escrita doc/BICHOS_GUION_91.md §5.1. Desde aquí los bichos de
      // combate nacen con su guion en `interacciones.paso` y los golpes le
      // llegan por `alCombate`.
      this.interacciones.enchufarA(this.fauna.manada);
    }
  }

  /** El cliente de la sesión con la que el guion está hablando ahora. */
  _aQuienHabla() {
    const s = this.interacciones?.hablandoCon ?? null;
    if (!s) return null;
    for (const c of this.clientes.values()) if (c.sesion === s) return c;
    return null;
  }

  /**
   * EL 93 (pieza G). El cliente cuyo personaje es `asa` —el `EntToString` de
   * un jugador en este puerto es el id de su personaje (el 45)—, o `null`.
   */
  _clienteDeAsa(asa) {
    if (asa === null || asa === undefined || asa === "") return null;
    for (const c of this.clientes.values()) if (c.sesion?.personaje && String(c.sesion.personaje.id) === String(asa)) return c;
    return null;
  }

  /**
   * EL 93 (pieza G). El cliente del jugador con el que está el guion de
   * `instancia` (`GuionDeNpc.jugador`, que escriben `alCombate`, la caza y
   * los menús). En el motor el objetivo viaja en el propio comando
   * (`applyeffect SPIDER_LATCH_TARGET …`, spider.script:151; `RetrieveEntity`,
   * scriptcmds.cpp:1873); aquí `GuionDeNpc` sólo deja pasar el asa de su
   * jugador, así que ese jugador ES el objetivo.
   */
  _clienteDelGuion(instancia) {
    if (!instancia || !this.interacciones) return null;
    const g = this.interacciones.guionesVivos?.get?.(instancia.id) ?? null;
    return this._clienteDeAsa(g?.jugador?.ref ?? null);
  }

  /**
   * EL 94. El cuerpo del jugador al que se refiere `ref` en el guion de
   * `instancia`, o `null` si `ref` no es un jugador. Es lo que piden
   * `setmovedest` y `$cansee`.
   *
   * ── LO QUE HACE EL MOTOR ────────────────────────────────────────────────
   *
   * Los dos resuelven su parámetro con `RetrieveEntity`: `setmovedest` con
   * `RetrieveEntity(Params[0])` (npcscript.cpp:1628) y `$cansee` con
   * `RetrieveEntity(Name)` (npcscript.cpp:1765). Y `RetrieveEntity(const char*)`
   * (global.cpp:382-398) hace dos cosas y en este orden:
   *
   *   1. `StringToEnt(pszName)`: el asa ES la entidad. Un `PARAM1` que trae el
   *      `EntToString` de un jugador nombra a ese jugador y a ningún otro.
   *   2. si no, `EntityNameToType` (global.cpp:328-334) — `ent_lastspoke`,
   *      `ent_laststruckbyme`, `ent_lastseen`… — y lo guardado con
   *      `StoreEntity` en **`m_EntityList` de ESTA entidad** (global.cpp:361-367):
   *      el último que le habló a ESTE NPC, no el último que le habló a alguien.
   *
   * En ningún sitio entra «el último jugador del servidor que abrió un menú»,
   * que es lo que contestaba `_aQuienHabla()` aquí hasta el 93. Con un jugador
   * es la misma persona; con dos, la araña que caza a Beto miraba a Ana porque
   * Ana había hablado con el herrero. Lo mismo que el 93 quitó del daño y del
   * `dist` (pieza G, `_clienteDelGuion`).
   *
   * El paso 2 se le pregunta al propio guion (`entorno.esElJugador`, que es la
   * lista de referencias del 45 con sus reglas: `ent_laststruckbyme` sólo vale
   * si de verdad le pegó, `ent_lastseen` si lo vio) y la respuesta es SU
   * jugador (`GuionDeNpc.jugador`, que escriben `pedirOpciones`, `oir`,
   * `elegir` y `alCombate`).
   *
   * **Sin jugador no se adivina**: `null`, y quien llama cae a la manada y,
   * si tampoco es un bicho, lo APUNTA (`ganchoDeMovedest`) o contesta «no»
   * (`$cansee`). Antes esa casilla vacía se rellenaba con «el que habla», y por
   * eso cualquier nombre —incluso el de otro bicho— resolvía al jugador.
   */
  _cuerpoDeRef(ref, instancia) {
    const c = this._clienteDeAsa(ref);                                // 1. StringToEnt
    if (c) return c.cuerpo ?? null;
    const g = instancia ? (this.interacciones?.guionesVivos?.get?.(instancia.id) ?? null) : null;
    if (!g?.entorno?.esElJugador?.(ref)) return null;                // ni asa ni alias suyo
    return this._clienteDelGuion(instancia)?.cuerpo ?? null;          // 2. su `m_EntityList`
  }

  /**
   * **LO QUE DICE EL GUION DE UN NPC, Y A QUIÉN LE LLEGA** — el 95.
   *
   * Hasta aquí todo iba a `_aQuienHabla()`, el último jugador de la partida
   * que abrió un menú. Lo mismo que el 94 quitó de `setmovedest`/`$cansee`, en
   * los dos ganchos que quedaban. En el motor son tres reglas y ninguna es ésa:
   *
   *   - `saytext` es `Speak(…, SPEECH_LOCAL)` (npcscript.cpp:708-719): recorre
   *     a TODOS los jugadores y se lo manda a los que estén a
   *     `Length2D() <= m_SayTextRange` (msmonsterserver.cpp:1712-1716), hayan
   *     hablado con él o no. Lo trae `o.habla.rango`, en unidades.
   *   - `playermessage` y sus cinco colores: `RetrieveEntity(Params[0])` y, si
   *     es un jugador, a ése (scriptcmds.cpp:4249-4250). El guion ya filtra que
   *     el nombre sea SU jugador (`mensajeAlJugador`, con `esElJugador`), así
   *     que aquí es el cliente de ese guion. Lo mismo `offer` («You receive…»):
   *     el oro va al personaje de su jugador, y el aviso con él.
   *   - lo que no trae instancia es lo que `InteraccionesNpc` dice MIENTRAS
   *     contesta un menú (`pedir`/`elegido`, que ponen `hablandoCon` en la
   *     misma llamada): ahí sí es el que pregunta.
   *
   * **Sin jugador no se adivina** (la regla del 94): se cuenta en `voz`.
   */
  _sucesoDeGuion(tipo, texto, o = null) {
    // EL 100: lo que se DICE no es un suceso. `Speak` manda `HUDInfoMsg` de
    // tipo 4 con su `saytext_e` (msmonsterserver.cpp:1721-1727) y el cliente lo
    // pinta en la consola del chat (vgui_hud.cpp:469-485); aquí viajaba como
    // `tipo: -1` y acababa en la de sucesos. Ahora lleva el número del canal,
    // que es por donde el cliente ya reparte (`src/red/cliente.js`, `TEXTO`).
    const destino = panelDeRecado(o);
    const datos = destino.panel === "chat" ? { tipo: destino.tipo, texto } : { tipo: -1, texto, suceso: tipo };
    const instancia = o?.instancia ?? null;
    if (o?.habla) {
      this.voz.dichas++;
      for (const c of this._quienOyeA(instancia, o.habla.rango)) { c.mandar(MENSAJE.TEXTO, datos); this.voz.oidas++; }
      return;
    }
    // Lo que dice el propio jugador (`hablaElJugador`) va a SU consola: trae
    // su sesión, y el que escribe en el chat no ha abierto ningún menú.
    if (o?.sesion) {
      for (const c of this.clientes.values()) if (c.sesion === o.sesion) { c.mandar(MENSAJE.TEXTO, datos); return; }
      return;
    }
    if (!instancia) { this._aQuienHabla()?.mandar(MENSAJE.TEXTO, datos); return; }
    const c = this._clienteDelGuion(instancia);
    if (!c) { this.voz.sinJugador++; return; }
    c.mandar(MENSAJE.TEXTO, datos);
  }

  /**
   * `infomsg <player|all> <título> <texto>` — el 95. `all` es `SendHUDMsgAll`,
   * que recorre los `maxClients` (svglobals.cpp:346-351); lo demás es UNO, el
   * que nombre el guion (scriptcmds.cpp:4064-4075), y el guion ya ha
   * comprobado que es su jugador (`entorno.aviso`).
   */
  _avisoDeGuion(titulo, texto, o = null) {
    const datos = { tipo: -2, texto, titulo };
    this.voz.avisos++;
    if (o?.todos) {
      for (const c of this.clientes.values()) if (c.dentro) c.mandar(MENSAJE.TEXTO, datos);
      return;
    }
    if (!o?.instancia) { this._aQuienHabla()?.mandar(MENSAJE.TEXTO, datos); return; }
    const c = this._clienteDelGuion(o.instancia);
    if (!c) { this.voz.sinJugador++; return; }
    c.mandar(MENSAJE.TEXTO, datos);
  }

  /**
   * Los clientes que oyen un `saytext` de `instancia` con alcance `rango` (en
   * UNIDADES, `m_SayTextRange`).
   *
   * El bucle de `Speak` (msmonsterserver.cpp:1652-1730): `UTIL_EntitiesInBox`
   * con la caja de ±6000 (`dentroDelCorral`), y `Length2D` de centro a centro
   * contra el alcance con `>` (:1714: lo que está JUSTO en el borde, oye). En
   * 2D el centro y los pies dan lo mismo.
   *
   * **LAS POSICIONES SON METROS Y EL ALCANCE SON UNIDADES** (la trampa del 81
   * y del 61): la distancia se pasa a unidades aquí, que es donde está la
   * escala, y el corral también, que en `_decir` se compara en metros y es por
   * eso de 6 000 m (doc/RED_95.md §8). Y una distancia que no es un número no
   * pasa (`NaN > rango` es `false`, el 79): se cuenta en `voz.sinSitio`.
   */
  _quienOyeA(instancia, rango) {
    const n = instancia?.donde ?? null;
    if (!n || !n.every?.((x) => Number.isFinite(x))) { this.voz.sinSitio++; return []; }
    const U = this.mundo?.perfil?.unidadesPorMetro ?? 39.37;
    const alcance = Number(rango);
    const oyen = [];
    for (const c of this.clientes.values()) {
      if (!c.dentro || !c.cuerpo) continue;
      const p = c.cuerpo.feet;
      const d = distancia2D(n, p) * U;
      if (!Number.isFinite(d) || !Number.isFinite(alcance)) continue;
      if (!dentroDelCorral([p[0] * U, p[1] * U, p[2] * U])) continue;
      if (loOye(HABLA.NPC, { distancia2D: d, rango: alcance, hablaUnJugador: false })) oyen.push(c);
    }
    return oyen;
  }

  /**
   * El cliente de un id de objetivo de la manada: «j3» es el hueco 3
   * (`Fauna.nombreDeJugador`). Cualquier otra cosa no es un cliente.
   */
  _clienteDeObjetivo(id) {
    const m = /^j(\d+)$/.exec(String(id ?? ""));
    return m ? (this.clientes.get(Number(m[1])) ?? null) : null;
  }

  /**
   * **EL ANFITRIÓN DE LOS EFECTOS DE UN JUGADOR, EN EL SERVIDOR** — el 92.
   *
   * Un efecto es un guion que se AÑADE a la entidad objetivo
   * (`Script_Add`, scriptedeffects.cpp:27) y corre en el servidor
   * (`#scope server`, effects/base_dot.script). Con red el personaje vive
   * aquí, así que el veneno tiene que vivir aquí también: si se mandara al
   * navegador, su daño restaría de la COPIA de la vida, que la siguiente foto
   * pisa con la de verdad (`vitales`, `src/main.js`).
   *
   * El anfitrión es un `GuionDelJugador` de verdad, con la ficha horneada del
   * guion del jugador, por una razón medida: los efectos le preguntan cosas a
   * su guion —`$get(ent_me,scriptvar,'PLAYING_DEAD')` en el veneno
   * (effects/base_dot.script, `dot_resist_check`), que el motor contesta con
   * `GetFirstScriptVar` (script.cpp:5949-5955)— y le avisan
   * (`game_applyeffect`, scriptcmds.cpp:1890-1898). Un anfitrión de mentira
   * contestaría el valor de reposo de una variable que el guion sí pone.
   *
   * **Sólo es anfitrión.** De este guion se mueven los relojes de sus EFECTOS
   * (`efectos.paso`, en `_paso`) y no los suyos: su regeneración y sus
   * `repeatdelay` siguen siendo del navegador, como hasta hoy. Moverlos aquí
   * es mudar el guion del jugador al servidor, que es otro experimento y
   * queda dicho en doc/COSTURA_RED_92.md.
   *
   * Se hace la primera vez que hace falta y se rehace si el cliente ha
   * entrado con otro personaje.
   */
  _efectosDe(c) {
    if (!c?.sesion?.personaje || !this.tablaDeEfectos || !this.fichaDelJugador) return null;
    if (c.anfitrionDeEfectos?.personaje === c.sesion.personaje) return c.anfitrionDeEfectos;
    const partida = this;
    const g = new GuionDelJugador({
      ficha: this.fichaDelJugador,
      personaje: c.sesion.personaje,
      ahora: () => partida.t,
      mapa: () => partida.aparicion?.mapa ?? null,
      jugadores: () => [...partida.clientes.values()].filter((x) => x.dentro).length,
      efectos: this.tablaDeEfectos,
      // `playermessage ent_me …`: a SU pantalla y a ninguna otra (`MSG_ONE`,
      // `ScriptCmd_Message`, scriptcmds.cpp:4243). El mismo mensaje que usa el
      // guion de un NPC para la consola de sucesos.
      suceso: (tipo, texto) => c.mandar(MENSAJE.TEXTO, { tipo: -1, texto, suceso: tipo }),
      aviso: (titulo, texto) => c.mandar(MENSAJE.TEXTO, { tipo: -2, texto, titulo }),
      // `givehp`: el mismo tope que el navegador (`V_min(Max - Current, Amt)`,
      // msmonsterserver.cpp:1971-1999), sobre el personaje que se guarda.
      dar: (que, cuanto) => {
        const p = c.sesion?.personaje;
        if (!p || !(cuanto > 0)) return;
        const d = derivadas(atributosDe(p.habilidades));
        if (que === "vida") p.vida = Math.min(d.vidaMax, (p.vida ?? 0) + cuanto);
        else p.mana = Math.min(d.manaMax, (p.mana ?? 0) + cuanto);
        c.sesion.tocado?.();
      },
      herir: (golpe) => this._efectoPega(c, golpe),
      // EL 93: `effect screenfade`, `hud.addstatusicon`… del veneno corren
      // AQUÍ, sobre esta copia del guion del jugador, y lo que se ve es del
      // navegador. Ver `_pantalla`.
      pantalla: (p) => this._pantalla(c, p),
      // `$get(<el jugador>,maxhp)` que le pregunta un efecto a su anfitrión:
      // la cura del sacerdote no cura a quien cree que está al máximo
      // (effects/effect_rejuv2.script, `game_activate`). Los máximos se
      // DERIVAN, no se guardan (el 66): la misma cuenta que `src/main.js`.
      maximos: () => {
        const p = c.sesion?.personaje;
        if (!p) return { vida: 0, mana: 0 };
        const d = derivadas(atributosDe(p.habilidades));
        return { vida: d.vidaMax, mana: d.manaMax };
      },
    });
    c.anfitrionDeEfectos = g;
    return g;
  }

  /**
   * **LO QUE UN EFECTO LE HACE A LA PANTALLA, POR EL CABLE** — el 93.
   *
   * El fundido y los iconos son mensajes `MSG_ONE` en el mod: `gmsgFade`
   * (`UTIL_ScreenFadeWrite`, hl/util.cpp:1146-1161) y `NETMSG_STATUSICONS`
   * (scriptcmds.cpp:3727-3734). Van al cliente del jugador al que se le
   * aplicó el efecto y a ningún otro; con `all`, a todos los que están
   * dentro (`UTIL_ScreenFadeAll`, :1164-1177, y el bucle de :3738-3753).
   *
   * El brillo NO viaja aquí. En el motor es el `renderfx` de la entidad
   * (mseffects.cpp:318-344) y lo ven los DEMÁS sobre su modelo, no él.
   * Mandarlo a su propio navegador sería inventarse un brillo que el jugador
   * del juego no ve.
   *
   * EL 95: se apunta en el CLIENTE —`c.brillos`, un `CEntGlow` por línea
   * (mseffects.cpp:923)— con la hora del servidor, y viaja en la foto de ese
   * jugador (`_estado`), que es por donde viaja `renderfx` en el motor
   * (`AddToFullPack`, server/client.cpp:2313-2318). Lectura vieja (93): «este
   * puerto no dibuja todavía el brillo en el modelo de otro jugador, así que
   * se cuenta y se dice pendiente».
   */
  _pantalla(c, p) {
    if (!c || !p) return;
    c.pantallas ??= { fundido: 0, icono: 0, brillo: 0 };
    c.pantallas[p.tipo] = (c.pantallas[p.tipo] ?? 0) + 1;
    if (p.tipo === "brillo") {
      if (p.brillo) (c.brillos ??= []).push({ ...p.brillo, desde: this.t });
      return;
    }
    const datos = { que: p.tipo, ...p.mensaje };
    const a = p.todos ? [...this.clientes.values()].filter((x) => x.dentro) : [c];
    for (const x of a) x.mandar(MENSAJE.PANTALLA, datos);
  }

  /**
   * El daño de un efecto —el `xdodamage` de un veneno— llega a un jugador.
   *
   * Por la misma puerta que el mordisco de un bicho en el servidor
   * (`_bichoPega`: lo cobra la sesión de aquí, y el navegador lo ve en la
   * foto), y con su aviso `"%s hits you: %s %s"` (giattack.cpp:1994), que en
   * el navegador sale de la rama `pega` de `src/main.js` y aquí no hay rama
   * que lo diga: el efecto no es un bicho de la foto. El nombre es el del que
   * lo puso, si se sabe.
   */
  _efectoPega(c, golpe) {
    if (!c?.sesion || !c.vivo || !(golpe?.dano > 0)) return null;
    const a = golpe.atacante ?? null;
    const nombre = a?.nombre ?? a?.instancia?.ficha?.nombre ?? a?.propiedad?.("name") ?? null;
    // EL 97: por la MISMA defensa que el mordisco, como en el navegador (el
    // `herir` del guion del jugador va a `golpear`, src/main.js). Con un
    // veneno («poison_effect») el escudo no bloquea («effect») y el parry no
    // para («poison»), pero la armadura puesta lo deja a la mitad
    // (armor_base.script:191-238): antes del 97, con servidor, entraba entero.
    return this._defender(c, {
      dano: golpe.dano, tipo: String(golpe.tipo ?? ""),
      nombre, porQue: nombre ?? "un efecto",
      desde: Array.isArray(a?.instancia?.donde) ? a.instancia.donde : null,
      deQuien: a?.id ?? null, efecto: true,
    });
  }

  /**
   * Los eventos de `paramsDeBicho`, una vez por guion de bicho nacido.
   * Se mira tras `interacciones.paso`, que es donde nacen (`nacerBichos`).
   */
  _ponerParams() {
    if (!this.paramsDeBicho || !this.interacciones) return 0;
    let n = 0;
    for (const g of this.interacciones.guionesVivos.values()) {
      if (!g || g.retirado || this._conParams.has(g) || !g.cierre) continue;
      this._conParams.add(g);
      for (const e of this.paramsDeBicho[g.npc?.script ?? ""] ?? []) { g.llamar(e, []); n++; }
    }
    return n;
  }

  /**
   * LO QUE LA COSTURA HA HECHO EN ESTE SERVIDOR, para medirlo desde fuera
   * (`/costura` en `tools/servidor.mjs`). Se lee del GUION —lo que recibió—,
   * no de lo que la manada cree haber mandado: la regla de `probe.costura`.
   */
  costura() {
    const I = this.interacciones;
    const m = this.fauna?.manada ?? null;
    const bichos = [];
    if (I && m) {
      for (const i of m.instancias) {
        const g = I.guionesVivos.get(i.id);
        if (!g) continue;
        const ultimo = (ev) => g.guion?.rastro?.filter?.((r) => r.evento === ev).at(-1)?.params ?? null;
        bichos.push({
          id: i.id, script: i.ficha?.script ?? null, vivo: !i.muerto, dormido: Boolean(i.dormido),
          conCierre: Boolean(g.cierre), recibidos: { ...g.costuraCuenta.recibidos },
          cerrados: { ...g.costuraCuenta.cerrados }, absorbidos: { ...g.costuraCuenta.absorbidos },
          dodamage: ultimo("game_dodamage"), damaged: ultimo("game_damaged"),
          veneno: g.guion?.buscarVar?.("NPC_DOT_POISON")?.valor ?? null,
          // EL 95: el jugador atado a este guion (su asa) y su alcance de voz.
          jugador: g.jugador?.ref ?? null, alcanceDeVoz: g.entorno?.alcanceDeVoz ?? null,
          yaw: i.yaw ?? null, donde: i.donde ? [...i.donde] : null,
          mandado: i.mandado ? { origen: [...i.mandado.origen], proximidad: i.mandado.proximidad } : null,
          frenado: i.frenado ?? null, velocidad: i.velocidad ?? null,
        });
      }
    }
    const efectos = [];
    for (const c of this.clientes.values()) {
      const g = c.anfitrionDeEfectos;
      if (!g) continue;
      efectos.push({
        cliente: c.id, personaje: c.sesion?.personaje?.id ?? null,
        activos: g.efectos.activos, aplicados: g.efectos.historial.length, heridas: g.heridas.length,
        // EL 93: lo que sus efectos han mandado a la pantalla (y el brillo, que no viaja).
        pantallas: { fundido: 0, icono: 0, brillo: 0, ...(c.pantallas ?? {}) },
        // EL 98: las trabas que leyó `_simular` (no recalculadas: el 65) y las
        // piezas cuyo reloj corre aquí.
        trabas: trabasParaElCable(c.trabas),
        piezas: [...(c.equipoVivo?.vivos?.values() ?? [])].map((e) => ({ id: e.id, puesto: Boolean(e.puesto) })),
      });
    }
    return {
      enchufada: Boolean(I?.manadaEnchufada && I.manadaEnchufada === m),
      sinOyente: m?.costuraSinOyente ?? null, fallos: m?.costuraFallos ?? 0,
      ...(I ? { ...I.costura } : {}),
      efectosSinJugador: this.efectosSinJugador,
      // EL 97: lo que la defensa del jugador ha hecho con los golpes.
      defensa: { ...this.defensa, historial: [...this.defensa.historial] },
      // EL 95: a quién contestaría `_aQuienHabla()` ahora (el valor de reposo
      // que se quitó de los cuatro ganchos), y lo que los guiones han dicho.
      hablaCon: this._aQuienHabla()?.id ?? null, voz: { ...this.voz },
      clientes: [...this.clientes.values()].map((c) => ({
        id: c.id, personaje: c.sesion?.personaje?.id ?? null,
        // EL 99: dónde está su cuerpo, si CABE ahí (la misma pregunta que hace
        // `_atascado`, no recalculada aparte: el 65), cuántos pasos ha parado
        // `PM_CheckStuck` y cuántas veces ha reaparecido.
        estado: c.sesion?.estado ?? null,
        pies: c.cuerpo ? [...c.cuerpo.feet] : null,
        cabe: c.cuerpo && this._probador(c) ? !this._probador(c)(c.cuerpo.feet) : null,
        pasosAtascado: c.pasosAtascado ?? 0, reapariciones: c.reapariciones ?? 0, sinTiempo: c.sinTiempo ?? 0,
        ultimoSitio: c.ultimoSitio ?? null, bichosApartados: c.bichosApartados ?? 0,
      })),
      // EL 99: los dos puntos de la partida y si cabe la cápsula en cada uno (con la de cualquier jugador: son todas
      // iguales). Es el control positivo de la sonda: el instrumento que dice
      // «cabe» tiene que poder decir «no cabe».
      puntos: this._puntosQueCaben(),
      bichos, efectos,
    };
  }

  /**
   * `CStore::Offer`: el estante se manda **a uno**, y en el formato del mod —
   * flags, nombre del vendedor y una fila por objeto (store.cpp:82-111).
   */
  _ofrecerTienda({ tienda, flags, vendedor, instancia } = {}, aQuien = null) {
    // Quien pide el estante puede ser el guion —y entonces es «el que habla»—
    // o un `trade` que acaba de restar, y entonces es quien lo mandó. No se
    // deduce: se dice, porque `hablandoCon` es de la última llamada al guion y
    // un `trade` llega después.
    const c = aQuien ?? this._aQuienHabla();
    if (!c || !tienda) return false;
    c.mandar(MENSAJE.TIENDA, {
      vendedor: String(vendedor ?? ""),
      // El id de la entidad: es lo que el cliente devuelve al comprar, para
      // que el servidor sepa de qué estante habla sin fiarse del nombre.
      quien: instancia?.id ?? null,
      flags: Number(flags) || 0,
      tienda: tienda.nombre,
      lineas: (tienda.objetos ?? []).map((l) => ({
        id: l.id, cantidad: l.cantidad, precio: l.precio,
        ratio: l.ratio, lote: l.lote, apagado: l.apagado ?? false,
      })),
    });
    return true;
  }

  /**
   * Lo que la correa necesita saber, en unidades de GoldSrc.
   *
   * `(pEnemy->Center() - Center()).Length() <= 128` es **3D**, al contrario que
   * la del chat — msmonsterserver.cpp:1843.
   */
  _comoEstaElCliente(vendedor, sesion) {
    let cliente = null;
    for (const c of this.clientes.values()) if (c.sesion === sesion) { cliente = c; break; }
    const npc = this.fauna?.manada?.de?.(vendedor) ?? null;
    if (!cliente?.cuerpo || !npc) return null;
    const upm = this.mundo?.perfil?.unidadesPorMetro ?? 39.37;
    const a = cliente.cuerpo.feet, b = npc.donde ?? null;
    if (!b) return null;
    const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * upm;
    return { distancia: d, vivo: cliente.vivo, mirando: true };
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
    // EL 99: AL REAPARECER, EL CUERPO VA AL SITIO. `respawn()` es `Spawn()`
    // (client.cpp:159-163) y `Spawn` llama a `MoveToSpawnSpot` (player.cpp:
    // 2695), que pone el origen en el punto con la velocidad a cero
    // (:2935-2941). Hasta el 99 la sesión del servidor reaparecía y nadie
    // movía el cuerpo: se volvía a la vida DONDE SE HABÍA MUERTO, al lado del
    // bicho que te mató (doc/REAPARECER_99.md §1).
    c.sesion.al("aparece", ({ donde, entrada }) => this._reaparecer(c, donde, entrada));
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
        case MENSAJE.DECIR: return this._decir(c, m);
        case MENSAJE.PEDIRMENU: return this._pedirMenu(c, m);
        case MENSAJE.ELIGEMENU: return this._eligeMenu(c, m);
        case MENSAJE.TRADE: return this._trade(c, m);
        case MENSAJE.EMPUNAR: return this._empunar(c, m);
        case MENSAJE.VESTIR: return this._vestir(c, m);
        case MENSAJE.SOLTAR: return this._soltar(c, m);
        case MENSAJE.PONG: return this._pong(c, m);
        case MENSAJE.ADIOS: return this.desconectar(id, { porque: "adiós" });
        default: return null;
      }
    } catch (e) {
      c.mandar(MENSAJE.FALLO, { que: m.t, porque: String(e?.message ?? e) });
      return null;
    }
  }

  /**
   * SOLTAR — el 97 (`MENSAJE.SOLTAR`). Sólo lo de la mano derecha, que es lo que
   * suelta la `c` (`ActiveItem()`). Lo soltado no vuelve a la mochila: en el
   * motor queda en el SUELO como entidad (`FallInit`), y este servidor no tiene
   * suelo todavía —ni lo ve nadie más ni se puede volver a coger con red—, así
   * que aquí desaparece. Eso es un pendiente dicho, no una regla
   * (doc/ARMAS_97.md).
   */
  _soltar(c, m) {
    const p = c.sesion?.personaje;
    if (!p) return null;
    const id = m?.id === null || m?.id === undefined ? null : String(m.id).slice(0, 64);
    // EL 98: «Drop Selected» suelta de un CONTENEDOR (`drop <id>`, client.cpp:
    // 932-947: «Items could be anywhere on the player», playershared.cpp:942).
    // Una unidad de una entrada de SU lista que no esté puesta ni sea un
    // contenedor (un contenedor no se suelta desde dentro de sí mismo, y
    // quitárselo no está en este puerto).
    if (m?.desde === "mochila") {
      const lista = p.objetos ?? [];
      const e = id ? lista.find((o) => o.id === id && !o.puesto && this._porId?.get?.(o.id)?.tipo !== "contenedor") : null;
      if (!e) {
        c.mandar(MENSAJE.FALLO, { que: MENSAJE.SOLTAR, porque: `not carrying ${id}` });
        return null;
      }
      if ((e.n ?? 1) > 1) e.n -= 1;
      else lista.splice(lista.indexOf(e), 1);
      c.sesion.tocado?.();
      return { soltado: id, desde: "mochila" };
    }
    const enMano = p.manos?.derecha ?? null;
    if (!id || id !== enMano) {
      c.mandar(MENSAJE.FALLO, { que: MENSAJE.SOLTAR, porque: `not holding ${id}` });
      return null;
    }
    p.manos.derecha = null;
    c.sesion.tocado?.();
    return { soltado: id };
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
    // EL ORO DEL OPERADOR, como `--nacer`: una perilla del que levanta el
    // servidor, no del jugador. Existe por el mismo motivo que aquélla — con
    // red **el personaje vive aquí**, así que darle oro en el navegador es una
    // mentira que el servidor no comparte: la sonda ponía 5000 en su `probe` y
    // el servidor contestaba «You can't afford Sharp Knife», que era verdad.
    if (this.oroInicial !== null) { p.oro = this.oroInicial; c.sesion.tocado?.(); }
    const donde = c.sesion.donde;
    const punto = puntoDeAparicion(donde?.escena ?? this.aparicion?.nacimiento?.escena ?? [0, 0, 0]);
    // EL 99: el cuerpo se crea PRIMERO y luego se busca dónde cabe, porque la
    // pregunta de si cabe se le hace a SU cápsula (`probadorDe`). Si el punto
    // vale, no se mueve.
    c.cuerpo = this.mundo.crearCuerpo(punto);
    c.probar = null;
    c.atasco = null;
    const pies = this._sitioLibre(punto, c);
    if (pies !== punto) {
      c.cuerpo.colocar?.(pies);
      // Y EL ÁRBOL DE CONSULTAS, con el cuerpo ya en su sitio: si no, los demás
      // le siguen viendo en el punto hasta el siguiente `world.step()`, y si
      // el que está en el punto no se mueve, nadie lo llama nunca. Medido: el
      // segundo que entra, creado en el punto y apartado, seguía «encima» de la
      // primera para siempre, `PM_CheckStuck` la daba por atascada en otro
      // jugador y no volvía a andar (test/servidor98, «el fénix de un débil»).
      // Cuesta 0,3-0,7 ms en Gate City, una vez por entrada.
      c.cuerpo.world?.world?.updateSceneQueries?.();
    }
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
   * MSR no hace esto: su `IsSpawnPointValid` devuelve `TRUE` siempre, con la
   * comprobación de «hay otro jugador a 128» comentada (player.cpp:2277-2311),
   * y su punto lo pone el mapeador. El día que se usen los once
   * `ms_player_spawn`, esto sobra.
   *
   * ── EL 99: Y TAMBIÉN MIRA LA PARED ─────────────────────────────────────
   *
   * Hasta el 99 sólo miraba a los otros jugadores, y apartaba metro y medio
   * sin preguntar qué había allí: medio anillo podía caer dentro de una roca.
   * Y peor: el punto de Gate City **ya está metido en la pared** —la cápsula
   * corta la pared a +z, 30 cm hacia −z cabe (doc/REAPARECER_99.md §2)—, y una
   * cápsula metida en la malla es lo que hace que Rapier tarde segundos por
   * paso. Ahora un sitio vale si no hay nadie Y cabe la cápsula
   * (`PM_TestPlayerPosition`, src/play/atasco.js) Y se ve desde el punto (un
   * anillo no salta paredes). Se prueban anillos de menos a más —el primero a
   * un cuarto de hueco, que es lo que separa de una pared—, y en cada sitio
   * cuatro alturas hasta un escalón (`sv_stepsize` 18), porque un suelo
   * desigual no deja la caja apoyada donde el punto.
   *
   * Si nada vale se usa el punto de todas formas: quedarse fuera del mapa es
   * peor que quedarse encajado, y encajado **ya no cuelga**: lo para
   * `PM_CheckStuck` en `_simular`.
   *
   * `yo` es el cliente que aparece: él no se estorba a sí mismo, y su cápsula
   * es la que se prueba. Sin cuerpo de Rapier (las pruebas con un mundo de
   * mentira) sólo se mira a los jugadores, como antes.
   */
  _sitioLibre(pies, yo = null) {
    const radio = (this.mundo.perfil?.radius ?? 0.25) * 2.1;
    const ocupado = (p) => {
      for (const c of this.clientes.values()) {
        if (c === yo || !c.cuerpo) continue;
        const o = c.cuerpo.feet;
        if (Math.hypot(p[0] - o[0], p[2] - o[2]) < radio && Math.abs(p[1] - o[1]) < 2) return true;
      }
      return false;
    };
    const probar = yo ? this._probador(yo) : null;
    // Rapier no contesta a una consulta hasta que alguien pone al día su árbol
    // (el 28, doc/IA_28.md): al entrar el primero no ha corrido ni un paso, y
    // el cuerpo de quien acaba de entrar tampoco está en él.
    if (probar) yo.cuerpo.world.world.updateSceneQueries();
    const U = this.mundo.perfil?.unidadesPorMetro ?? 39.37;
    // Por qué se descartó cada sitio probado, para `costura()`: un sitio
    // elegido a metro y medio del punto tiene que poder decir por qué no más cerca.
    const motivos = { ocupado: 0, noCabe: 0, noSeVe: 0 };
    const vale = (p) => {
      if (ocupado(p)) { motivos.ocupado++; return false; }
      if (!probar) return true;
      if (probar(p)) { motivos.noCabe++; return false; }
      if (!this._seVe(yo, pies, p)) { motivos.noSeVe++; return false; }
      return true;
    };
    const elegido = (p, anillo) => { if (yo) yo.ultimoSitio = { anillo, ...motivos }; return p; };
    if (vale(pies)) return elegido(pies, 0);
    const alturas = [0, 6, 12, 18].map((u) => u / U);
    for (const anillo of [0, radio * 0.25, radio * 0.75, radio * 1.5, radio * 3]) {
      const n = anillo === 0 ? 1 : 8;
      for (let i = 0; i < n; i++) {
        const a = (i * Math.PI) / 4;
        for (const dy of alturas) {
          if (anillo === 0 && dy === 0) continue;
          const p = [pies[0] + Math.cos(a) * anillo, pies[1] + dy, pies[2] + Math.sin(a) * anillo];
          if (vale(p)) return elegido(p, anillo);
        }
      }
    }
    return elegido(pies, null);
  }

  /** EL 99, para `costura()`: ¿cabe la cápsula en el nacimiento y en la reaparición? */
  _puntosQueCaben() {
    const c = [...this.clientes.values()].find((x) => this._probador(x));
    if (!c) return null;
    // Sólo contra el MUNDO: un jugador de pie en el punto no es «el punto no cabe».
    const probar = probadorDe(c.cuerpo);
    const fuera = {};
    for (const k of ["nacimiento", "reaparicion"]) {
      const e = this.aparicion?.[k]?.escena;
      if (!e) continue;
      const pies = puntoDeAparicion(e);
      fuera[k] = { pies, cabe: !probar(pies) };
    }
    return fuera;
  }

  /** EL 99: `PM_TestPlayerPosition` de la cápsula de este cliente, o `null` sin Rapier. */
  _probador(c) {
    if (!c?.cuerpo?.world?.world || !c.cuerpo.collider) return null;
    if (!c.probar) {
      c.probar = probadorDe(c.cuerpo, {
        esJugador: (col) => {
          for (const o of this.clientes.values()) {
            if (o !== c && o.cuerpo?.collider?.handle === col.handle) return true;
          }
          return false;
        },
      });
    }
    return c.probar;
  }

  /**
   * EL 99, nuestro: desde el punto de aparición, a media altura, ¿se llega a
   * `p` sin cruzar lo fijo? Es lo que impide que un anillo de metro y medio
   * ponga a alguien al otro lado de una pared.
   */
  _seVe(c, desde, p) {
    const w = c?.cuerpo?.world?.world;
    if (!w) return true;
    const h = c.cuerpo.centreOffset;
    const a = { x: desde[0], y: desde[1] + h, z: desde[2] };
    const d = [p[0] - desde[0], p[1] - desde[1], p[2] - desde[2]];
    const largo = Math.hypot(d[0], d[1], d[2]);
    if (!(largo > 1e-6)) return true;
    const rayo = new RAPIER.Ray(a, { x: d[0] / largo, y: d[1] / largo, z: d[2] / largo });
    return !w.castRay(rayo, largo, true, RAPIER.QueryFilterFlags.ONLY_FIXED);
  }

  /**
   * EL 99: `CBasePlayer::MoveToSpawnSpot` al reaparecer (player.cpp:2928-2945):
   * el origen al punto (la unidad de más: ver `puntoDeAparicion`), la
   * velocidad a cero. El punto lo da la
   * sesión (`donde`, la regla de `m_JoinType` de `FindSpawnSpot`, :2427-2555);
   * aquí sólo se pone el cuerpo, y por el mismo `_sitioLibre` que al entrar.
   * Al ENTRAR no pasa por aquí: el cuerpo todavía no existe y lo coloca
   * `_elegir`.
   */
  _reaparecer(c, donde, entrada) {
    if (entrada !== ENTRADA.MUERTE || !c.cuerpo) return null;
    const punto = puntoDeAparicion(donde?.escena ?? this.aparicion?.nacimiento?.escena ?? [0, 0, 0]);
    const pies = this._sitioLibre(punto, c);
    c.cuerpo.colocar(pies, { velocidad: [0, 0, 0] });
    c.cuerpo.velocityY = 0;
    c.cuerpo.caida = 0;
    c.atasco?.reiniciar();
    c.reapariciones = (c.reapariciones ?? 0) + 1;
    this._suceso("reaparece", { id: c.id, nombre: c.nombre, pies: [...pies] });
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
    // EL 98: NOATTACK. `CGenericItem::Attack` sale en su primera guarda si el
    // jugador lo lleva (giattack.cpp:252-254), y ese código es compartido: el
    // servidor lo comprueba también. El navegador ya no lo manda si lo sabe
    // (las trabas viajan en la foto); esto es por si no lo sabe todavía.
    if (this._trabasDe(c).noAtacar) {
      const r = { vale: false, porque: "PLAYER_MOVE_NOATTACK", trabado: true };
      c.sucesosPendientes.push({ que: "tupegas", id, ...r });
      return r;
    }
    const techo = this._techoDeDano(c);
    const dano = Math.min(Math.max(0, Number(m.dano) || 0), techo);
    const pies = c.cuerpo.feet;
    // EL 86: el tipo se saca a una variable porque ahora VUELVE en el suceso.
    // El informe del golpe del mod lleva el elemento dentro —`"%.1f%s damage."`,
    // giattack.cpp:1898, o sea «0.4 slash damage.»— y el cliente no puede
    // ponerlo si no sabe con qué tipo acabó pegando el servidor. Es el mismo
    // viaje que el daño: lo decide quien lleva la manada.
    const tipo = typeof m.tipo === "string" ? m.tipo.slice(0, 32) : "";
    const r = this.fauna.pegar({
      id, dano,
      alcance: Math.max(0, Number(m.alcance) || 0),
      cubo: typeof m.cubo === "string" ? m.cubo.slice(0, 48) : null,
      tipo,
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
    c.sucesosPendientes.push({ que: "tupegas", id, ...r, tipo, tope: dano >= techo ? techo : undefined });
    return r;
  }

  /**
   * **HABLAR** — experimento 61. `CMSMonster::Speak`, msmonsterserver.cpp:1588.
   *
   * Del cliente vienen dos cosas: el canal y lo que ha escrito. Todo lo demás
   * lo pone el servidor, y por el motivo de siempre — **el nombre**. Si la
   * frase montada viajara, cualquiera podría decir «[global] Ana: me voy» con
   * el nombre de Ana. Aquí el nombre sale de la sesión que este socket tiene
   * abierta y de ninguna otra parte.
   *
   * Quién la oye lo decide `hablar()`, que es la regla y está probada aparte.
   * Lo que se hace aquí es lo que la regla no puede hacer sin la partida
   * delante: sacar la lista de quién está, dónde está y cómo se llama.
   *
   * El «party» llega hoy sólo al que habla, y es correcto: `SameTeam` empieza
   * con `if (!pObject1->TeamID()[0] || !pObject2->TeamID()[0]) return FALSE;`
   * (team.cpp:167), y sin grupos montados el `TeamID` de todos está vacío. Es
   * lo mismo que hace el juego con un servidor donde nadie ha hecho grupo.
   */
  _decir(c, m) {
    const tipo = Math.trunc(Number(m?.tipo));
    // El tope de letras es el del cajetín del mod, y se corta aquí además de
    // allí: el cajetín es del cliente y un cliente no es de fiar.
    const texto = String(m?.texto ?? "").slice(0, MAX_LETRAS);

    const oyentes = [];
    for (const otro of this.clientes.values()) {
      if (!otro.cuerpo) continue;
      const p = otro.cuerpo.feet;
      oyentes.push({ id: otro.id, pies: [p[0], p[1], p[2]], equipo: otro.equipo ?? null });
    }
    const pies = c.cuerpo ? [...c.cuerpo.feet] : [0, 0, 0];

    // LAS 300 SON UNIDADES DE GOLDSRC Y ESTOS PIES SON METROS.
    //
    // `SPEECH_LOCAL_RANGE` vale 300 y está escrito en las unidades del motor
    // (msmonster.h:79); los cuerpos de aquí los mueve Rapier y están en
    // metros. Comparar los dos números sin convertir da un rango de 300
    // METROS, o sea 11 811 unidades: **el «local» se oía desde el otro
    // extremo del mapa** y los tres canales pasaban a ser el mismo con
    // distinto color. Lo cazó la sonda midiendo a 846 unidades.
    //
    // La constante se queda en unidades, que es donde se puede citar, y la
    // conversión se hace aquí, que es donde está la escala del mundo.
    const unidadesPorMetro = this.mundo?.perfil?.unidadesPorMetro ?? 39.37;
    const dicho = hablar({
      nombre: c.sesion?.personaje?.nombre ?? c.nombre,
      texto, tipo, esJugador: true,
      oyentes, quienHabla: c.id, pies, equipo: c.equipo ?? null,
      rango: RANGO_LOCAL / unidadesPorMetro,
    });
    if (!dicho) return null;

    for (const id of dicho.para) {
      this.clientes.get(id)?.mandar(MENSAJE.TEXTO, { tipo: dicho.tipo, texto: dicho.texto });
    }
    // ── Y LOS NPC TAMBIÉN OYEN — experimento 79 ──────────────────────────
    //
    //     if (SpeechType == SPEECH_LOCAL && IsPlayer() && pEnt->IsMSMonster())
    //         ((CMSMonster*)pEnt)->HearPhrase(this, pszSentence);
    //                                       msmonsterserver.cpp:1743-1744
    //
    // Es el MISMO bucle del motor: `Speak` recorre jugadores y monstruos a la
    // vez, y lo que cambia es qué le hace a cada uno. Aquí estaban portados
    // los jugadores desde el 61 y los monstruos no, así que `catchspeech`
    // llevaba treinta y seis experimentos registrado y mudo.
    //
    // Sólo el canal LOCAL: un grito global no lo oye un NPC, porque la guarda
    // del mod es `SpeechType == SPEECH_LOCAL` y no «está en rango».
    let oidoPorNpc = null;
    if (tipo === HABLA.LOCAL && this.interacciones) {
      // Los pies son los del que habla AHORA, no los de `hablandoCon`: por el
      // chat se habla sin haber abierto el menú de nadie.
      const antes = this.interacciones.dondeEstaElJugador;
      this.interacciones.dondeEstaElJugador = () => pies;
      try {
        oidoPorNpc = this.interacciones.hablaElJugador(texto, { sesion: c.sesion, yaDicho: true });
      } finally { this.interacciones.dondeEstaElJugador = antes; }
    }

    // `g_engfuncs.pfnServerPrint(FinalSentence)` — msmonsterserver.cpp:1747.
    // El servidor lo escribe en su consola, y eso es parte del port: un
    // administrador lee lo que se dice en su partida.
    process.stdout?.write?.(dicho.texto);
    return { para: dicho.para.length, npc: oidoPorNpc };
  }

  /**
   * **LA F**: dame el menú de este NPC. El 62.
   *
   * Corre `game_menu_getoptions` del guion de esa entidad —el de verdad, el
   * único que hay— con ESTE jugador como parámetro, y devuelve lo mismo que le
   * llegaría al cliente en el mod: el nombre que se enseña y las opciones.
   */
  async _pedirMenu(c, m) {
    if (!this.interacciones) return null;
    const id = m?.id === null || m?.id === undefined ? null : Math.trunc(Number(m.id));
    const r = await this.interacciones.pedir(id, c.sesion);
    c.mandar(MENSAJE.OPCIONES, { para: id, nombre: r?.nombre ?? "", opciones: r?.opciones ?? [] });
    return r;
  }

  /** `menuselect N`. `indice` a `null` es cancelar. multiplay_gamerules.cpp:1576. */
  _eligeMenu(c, m) {
    if (!this.interacciones) return null;
    const id = m?.id === null || m?.id === undefined ? null : Math.trunc(Number(m.id));
    const indice = m?.indice === null || m?.indice === undefined ? null : Math.trunc(Number(m.indice));
    this.interacciones.elegido(id, indice, c.sesion);
    return { hecho: true };
  }

  /**
   * **COMPRAR O VENDER**, y aquí es donde deja de poder haber dos estantes.
   *
   *     else if (FStrEq(pcmd, "trade"))        client.cpp:739
   *
   * Del cliente viene qué fila quiere y nada más: el precio, las existencias y
   * el oro los tiene el servidor, y el estante es el de `Tiendas`, que es uno.
   * Dos jugadores ya no pueden comprar la misma última daga, porque sólo hay
   * una resta y la hace este método.
   *
   * Y no se atiende a quien no esté en el trato: si el vendedor está
   * comerciando con otro —o con nadie— este `trade` no vale, que es lo que
   * hace `TradeItem` con `if (!HasConditions(MONSTER_TRADING) || m_hEnemy == NULL ...)
   * return NULL` (msmonsterserver.cpp:1862-1866).
   */
  _trade(c, m) {
    const I = this.interacciones;
    if (!I || !c.sesion?.personaje) return null;
    const quien = m?.quien === null || m?.quien === undefined ? null : Math.trunc(Number(m.quien));
    if (quien === null || !Number.isFinite(quien)) return null;
    // El trato tiene que ser SUYO. Sin esto, cualquiera podría mandar `trade`
    // contra el estante que otro tiene abierto.
    if (I.comercio.clienteDe(quien) !== c.sesion) {
      c.mandar(MENSAJE.TEXTO, { tipo: -1, suceso: "nopuedes", texto: "The vendor is busy." });
      return null;
    }
    const tienda = I.tiendas.buscar(String(m?.tienda ?? ""));
    if (!tienda) return null;
    const id = String(m?.id ?? "");
    const ficha = this._porId?.get(id) ?? null;
    const p = c.sesion.personaje;

    // EL MISMO CUERPO QUE LA VERSIÓN LOCAL DE `src/main.js`, a propósito: la
    // regla es la de `src/play/tienda.js` y lo que cambia es quién la aplica.
    // Si aquí se escribiera otra aritmética, jugar solo y jugar acompañado
    // darían precios distintos, que es peor que no tener red.
    if (m?.que === "sell") {
      const pieza = (p.objetos ?? []).find((o) => (o.uid ?? o.id) === id) ?? null;
      const clave = pieza?.id ?? id;
      const r = venderEnTienda(tienda, clave, {
        nombre: this._porId?.get(clave)?.nombre ?? clave,
      });
      if (r.aviso) c.mandar(MENSAJE.TEXTO, { tipo: -1, suceso: "normal", texto: r.aviso });
      if (r.que !== "vende" || !pieza) return r;
      p.oro = (p.oro ?? 0) + r.precio;
      p.objetos = (p.objetos ?? []).filter((o) => o !== pieza);
      const linea = tienda.linea(clave);
      if (linea) linea.cantidad += r.suma;
      c.sesion.tocado?.();
      this._suFicha(c);
      this._ofrecerTienda({ tienda, flags: m?.flags ?? 0, vendedor: m?.vendedor ?? "", instancia: { id: quien } }, c);
      return r;
    }

    const r = comprarEnTienda(tienda, id, {
      oro: p.oro ?? 0,
      cabe: (p.objetos?.length ?? 0) < MAX_OBJETOS,
      nombre: ficha?.nombre ?? id,
    });
    if (r.aviso) c.mandar(MENSAJE.TEXTO, { tipo: -1, suceso: r.que === "compra" ? "normal" : "nopuedes", texto: r.aviso });
    if (r.que !== "compra") return r;
    // La resta es UNA y está aquí: el estante es el de la partida.
    p.oro = (p.oro ?? 0) - r.precio;
    // UN objeto con cantidad `max(lote, 1)`, no `lote` objetos.
    //
    // `pItem->iQuantity = psiStoreItem->iBundleAmt` (:1895) le pone al objeto
    // su cantidad; no crea uno por unidad. Y `iBundleAmt` **vale 0 por
    // omisión** (npcscript.cpp:772-774), que es lo que trae casi toda línea de
    // tienda: un bucle `k < entregadas` no da ni una vuelta. Pasaba: el
    // servidor restaba el oro, decía «You receive Sharp Knife.» y la mochila
    // se quedaba igual. Es el mismo `V_max(..., 1)` que ya usa `descuenta`.
    p.objetos = [...(p.objetos ?? []), { id, n: Math.max(r.entregadas ?? 0, 1) }];
    const linea = tienda.linea(id);
    if (linea) linea.cantidad -= r.descuenta;
    c.sesion.tocado?.();
    this._suFicha(c);
    // El estante vuelve a salir, que es lo que hace el mod: `Offer` se manda
    // otra vez entero, no se parchea una fila.
    this._ofrecerTienda({ tienda, flags: m?.flags ?? 0, vendedor: m?.vendedor ?? "", instancia: { id: quien } }, c);
    return r;
  }

  /**
   * `NETMSG_SETSTAT` del oro y `NETMSG_ITEM` de la mochila, juntos y `MSG_ONE`.
   *
   * El personaje vive aqui; el navegador tiene una COPIA que le llego en
   * `APARECES` y que hasta el 63 no se actualizaba nunca. Sin esto la compra
   * funcionaba y no se veia: el servidor restaba el oro y metia el cuchillo, y
   * la pantalla seguia con lo de antes. Ver `MENSAJE.FICHA` en el protocolo,
   * con sus dos citas.
   */
  _suFicha(c) {
    const p = c?.sesion?.personaje;
    if (!p) return false;
    c.mandar(MENSAJE.FICHA, { oro: p.oro ?? 0, objetos: p.objetos ?? [] });
    return true;
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
    // QUÉ ha subido, y no sólo cuántas: el cartel de «Swordsmanship Proficiency
    // +1» necesita el nombre, y con servidor el navegador no lo puede deducir
    // —la hoja la lleva el servidor—. Es lo que en el motor viaja como los
    // `Params` de `game_learnskill` (playerstats.cpp:169-172).
    const dondes = [];
    for (const [cubo, cantidad] of Object.entries(xp)) {
      // `while (iRemainingExp > 0)`, playerstats.cpp:83: un cubo negativo —el
      // aldeano de `skilllevel -10`— no entra al bucle y no resta ni enseña.
      // Sin esta línea `aprender` le daría el mínimo de 1 (el 94).
      if (!(cantidad > 0)) continue;
      total += cantidad;
      const r = entrenar(p, cubo, cantidad);
      entregado += r.entregado ?? 0;
      subidas += r.subidas;
      if (r.subidas > 0 && r.donde) dondes.push(r.donde);
    }
    if (total > 0) c.sesion.tocado();
    return { total, entregado, subidas, dondes };
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
   * EMPUÑAR — el 96. La misma regla que `cumplir` en el navegador
   * (src/main.js): lo que había en la mano vuelve a la mochila y lo nuevo sale
   * de ella (`inv transfer <id> 0`). Con dos condiciones que en el navegador no
   * hacen falta porque allí el inventario es suyo: el objeto TIENE que estar en
   * la mochila de la sesión del servidor, y tiene que ser algo que el catálogo
   * conozca. Si no, no se toca nada y se dice por qué.
   */
  _empunar(c, m) {
    const p = c.sesion?.personaje;
    if (!p) return null;
    const id = m?.id === null || m?.id === undefined ? null : String(m.id).slice(0, 64);
    p.manos ??= { derecha: null, izquierda: null };
    // EL 97: `mano: "izquierda"` es embrazar un escudo. La misma regla —de la
    // mochila a la mano y lo de antes de vuelta—, con una condición más: en
    // este puerto la mano izquierda sólo lleva escudos (`embrazar`, src/main.js),
    // así que lo que no tenga ficha `escudo` no entra. El servidor lo necesita
    // para la defensa (`_defender`): sin esto no sabía que llevabas escudo.
    const lado = m?.mano === "izquierda" ? "izquierda" : "derecha";
    const antes = p.manos[lado] ?? null;
    const dice = (x) => (lado === "izquierda" ? { escudo: x } : { arma: x });
    if (id === antes) return dice(antes);
    if (id !== null) {
      if (this._porId && !this._porId.has(id)) {
        c.mandar(MENSAJE.FALLO, { que: MENSAJE.EMPUNAR, porque: `unknown item ${id}` });
        return null;
      }
      if (lado === "izquierda" && this._porId && !this._porId.get(id)?.escudo) {
        c.mandar(MENSAJE.FALLO, { que: MENSAJE.EMPUNAR, porque: `not a shield ${id}` });
        return null;
      }
      const i = (p.objetos ?? []).findIndex((o) => o?.id === id);
      if (i < 0) {
        c.mandar(MENSAJE.FALLO, { que: MENSAJE.EMPUNAR, porque: `not carrying ${id}` });
        return null;
      }
      p.objetos.splice(i, 1);
    }
    if (antes) (p.objetos ??= []).push({ id: antes, n: 1 });
    p.manos[lado] = id;
    c.sesion.tocado?.();
    return dice(id);
  }

  /**
   * VESTIR — el 97 (`MENSAJE.VESTIR`). Sólo la marca `puesto` de una entrada que
   * la sesión del servidor TIENE en `objetos` y que el catálogo dice que se
   * viste; si no, `FALLO` y no se toca nada. La regla de si cabe la corre el
   * navegador con el guion de la pieza (src/play/equipar.js); aquí no se repite.
   */
  _vestir(c, m) {
    const p = c.sesion?.personaje;
    if (!p) return null;
    const id = String(m?.id ?? "").slice(0, 64);
    const entrada = (p.objetos ?? []).find((o) => o?.id === id) ?? null;
    const ficha = this._porId?.get(id) ?? null;
    if (!entrada || (this._porId && !ficha?.vestible)) {
      c.mandar(MENSAJE.FALLO, { que: MENSAJE.VESTIR, porque: entrada ? `${id} is not wearable` : `not carrying ${id}` });
      return null;
    }
    if (m?.puesto) entrada.puesto = true;
    else delete entrada.puesto;
    c.sesion.tocado?.();
    return { id, puesto: Boolean(entrada.puesto) };
  }

  /**
   * UN BICHO LE PEGA A UN JUGADOR. Lo cobra la sesión **del servidor**, que es
   * la que se guarda: el navegador se enterará por la foto, que ya lleva la vida
   * y el estado.
   *
   * EL 97: y antes de cobrarlo, LA DEFENSA (`_defender`). Hasta el 96 se
   * restaba tal cual: con servidor no había armadura, ni escudo, ni parry.
   * Devuelve lo mismo que `golpear` en el navegador —`{parado, dano}`—, que es
   * de donde sale el PARAM1 de `game_dodamage` del bicho (`Manada.cazar`).
   */
  _bichoPega(i, cliente, dano, tipo = i?.ficha?.ia?.tipoDano ?? "") {
    return this._defender(cliente, {
      dano, tipo: String(tipo ?? ""),
      nombre: i?.ficha?.nombre ?? null,
      porQue: i?.ficha?.nombre ?? i?.ficha?.clase ?? "un monstruo",
      desde: Array.isArray(i?.donde) ? i.donde : null,
      deQuien: i?.id ?? null,
    });
  }

  /**
   * ── EL 97: LA DEFENSA DEL JUGADOR, EN EL SERVIDOR ─────────────────────────
   *
   * El orden es el del motor y lo escribe UNA función, `defensaDelJugador`
   * (src/play/escudo.js), la misma que usa `golpear` en src/main.js:
   *
   *     for (i) Gear[i]->OwnerTakeDamage(Damage);   la armadura y el ESCUDO
   *     if (Damage.flDamage <= 0) Damage.flDamage = 0;
   *     Damage.flDamage = CMSMonster::TraceAttack(Damage);   el PARRY
   *                                                   player.cpp:403-414
   *
   * Lo único que se hace aquí es contestar las preguntas que la regla le hace
   * al mundo, con el mundo del servidor:
   *
   *   - QUÉ LLEVA PUESTO: las entidades con guion de su armadura
   *     (`_equipoDe`), del `puesto` del personaje que guarda ESTE proceso.
   *   - SI EL ESCUDO ESTÁ ARRIBA: el `Brazal` del servidor (`_brazalDe`),
   *     que se mueve con el botón `ATACAR2` de las órdenes.
   *   - DE DÓNDE VIENE: el cono de 53° (`dentroDelCono2D`) con el `yaw` de la
   *     última orden, que es el que tiene el cuerpo del servidor.
   *   - CUÁNTO PARRY: `update_parry` (`manosDelParry`) con el arma y el escudo
   *     de sus manos en el catálogo del servidor.
   *
   * Y lo que se le DICE va a SU consola y a ninguna otra (`MSG_ONE`): «X hits
   * you» con el daño que queda (giattack.cpp:1994), «Deflected!» del escudo,
   * y el parry por el `game_parry` de su guion de jugador, que es quien lo
   * dice en el mod (player/player_main.script). Los mensajes de la armadura
   * salen de su propio guion, que aquí tiene la consola de este cliente.
   */
  _defender(c, { dano, tipo = "", nombre = null, porQue = null, desde = null, deQuien = null, efecto = false } = {}) {
    if (!c?.sesion || !c.vivo || !(dano > 0)) return null;
    const p = c.sesion.personaje;
    const decir = (texto) => c.mandar(MENSAJE.TEXTO, { tipo: -1, texto, suceso: "atacado" });
    // El «adelante» del jugador en el plano —lo único que mira el cono—, con
    // la misma cuenta que el navegador (`golpear`, src/main.js).
    let deFrente = true;
    if (desde && c.cuerpo) {
      const yo = c.cuerpo.feet;
      const yaw = Number(c.cuerpo.yaw) || 0;
      deFrente = dentroDelCono2D(desde, [yo[0], yo[1], yo[2]], [-Math.sin(yaw), 0, -Math.cos(yaw)]);
    }
    const brazal = this._brazalDe(c);
    // Con la mano vacía se empuñan los puños, como en `empunar` (src/main.js).
    const arma = this._porId?.get(p?.manos?.derecha ?? "fist_bare") ?? this._porId?.get("fist_bare") ?? null;
    const d = defensaDelJugador({
      dano, tipo,
      escudo: brazal?.ficha ?? null,
      postura: brazal?.postura ?? POSTURA.GUARDADO,
      desplegado: Boolean(brazal?.desplegado),
      deFrente,
      parry: valorDeParryDelJugador({
        manos: manosDelParry({ habilidades: p?.habilidades, arma, escudo: brazal?.ficha ?? null }),
      }),
      equipo: this._equipoDe(c),
      atacante: nombre ?? "none",
      dados: this.dadosDeDefensa ?? {},
    });
    const D = this.defensa;
    D.golpes++;
    if (d.armadura?.piezas?.length) D.conArmadura++;
    D.ultimo = {
      n: D.golpes, cliente: c.id, antes: dano, tipo, deFrente,
      armadura: { dano: d.armadura?.dano ?? dano, piezas: (d.armadura?.piezas ?? []).map((x) => ({ ...x })) },
      bloqueo: { bloquea: d.bloqueo.bloquea, arriba: Boolean(d.bloqueo.arriba), porque: d.bloqueo.porque },
      parry: { para: d.parry.para, tirada: d.parry.tirada, acc: d.parry.acc, valor: d.parry.valor },
      dano: d.dano, efecto,
    };
    D.historial.push(D.ultimo);
    if (D.historial.length > 200) D.historial.shift();
    if (d.bloqueo.bloquea) {
      if (d.bloqueo.arriba) D.bloqueos++; else D.desvios++;
      if (d.mensaje) decir(d.mensaje);
    }
    if (d.parado) {
      D.parados++;
      // LA FRASE LA DICE EL GUION, como en `golpear`: `game_parry` con los
      // seis parámetros del motor (msmonsterserver.cpp:2237-2245). Sin guion
      // del jugador aquí, la misma frase armada por `mensajesdecombate.js`.
      const dicho = this._efectosDe(c)?.llamar?.("game_parry", [
        nombre ?? "none", String(dano), tipo,
        String(Math.round(d.parry.tirada)), String(Math.abs(Math.round(d.parry.acc))),
        String(Math.round(d.parry.valor)),
      ]);
      if (!dicho) decir(fraseDeParry(d.parry.tirada, Math.abs(d.parry.acc)));
      this._suceso("dano", { id: c.id, de: deQuien, dano: 0, parado: true, ...(efecto ? { efecto: true } : {}) });
      return { parado: true, dano: 0 };
    }
    if (!(d.dano > 0)) return { parado: false, dano: 0 };
    decir(golpeRecibido({ nombre: nombre && nombre !== "0" ? nombre : null, dano: d.dano, tipo }));
    // EL 98: `game_damaged` (msmonsterserver.cpp:2311), en el mismo sitio que
    // `golpear` en solitario: tras el aviso y antes de restar. Dos mitades,
    // porque el guion del jugador está partido: los EFECTOS del anfitrión de
    // aquí lo reciben aquí, y el guion propio —regeneración, barra de vida,
    // `PL_BEEN_ATTACKED`— y el descanso de sentarse son del navegador, que lo
    // llama al recibir este `golpeado` (MSG_ONE, sólo a este cliente).
    const atacante = nombre && nombre !== "0" ? nombre : "none";
    // El anfitrión SI LO HAY (`_anfitrionSiHay`): sin él no hay efectos que
    // avisar, y crearlo aquí daba uno a todo el que recibe un golpe.
    this._anfitrionSiHay(c)?.danado({ atacante, dano: d.dano, tipo }, { soloEfectos: true });
    c.sucesosPendientes.push({ que: "golpeado", de: deQuien, atacante, dano: d.dano, tipo, ...(efecto ? { efecto: true } : {}) });
    this.defensa.danados++;
    c.sesion.danar(d.dano, { porQue: porQue ?? nombre ?? "un monstruo", deQuien, tipo: "monstruo" });
    this._suceso("dano", { id: c.id, de: deQuien, dano: Math.round(d.dano * 10) / 10, ...(efecto ? { efecto: true } : {}) });
    return { parado: false, dano: d.dano };
  }

  /**
   * EL 97: el escudo de este cliente, en el servidor. Un `Brazal` (la
   * máquina de `hold-strike` de src/play/escudo.js, la misma del navegador)
   * por lo que haya en `manos.izquierda`, desplegado al embrazarlo como hace
   * `embrazar` (`weapon_deploy`). Se rehace si cambia lo que hay en la mano.
   */
  _brazalDe(c) {
    const id = c?.sesion?.personaje?.manos?.izquierda ?? null;
    if (c._brazalDeId === id) return c.brazal ?? null;
    c._brazalDeId = id;
    const ficha = id ? this._porId?.get(id) ?? null : null;
    c.brazal = ficha?.escudo ? new Brazal(ficha) : null;
    c.brazal?.desplegar(true);
    return c.brazal;
  }

  /**
   * EL 97: LO QUE LLEVA, CON SU GUION, en el orden de la mochila (el `Gear`).
   *
   * Es lo que en el navegador es `objetosVivos` (`sincronizarObjetosVivos`,
   * src/main.js), recortado a lo que la defensa usa: `golpeContraLaArmadura`
   * sólo llama a lo PUESTO y a lo que es armadura (src/play/armadura.js), así
   * que aquí sólo se montan ésos. Una poción de la mochila no corre su guion
   * en el servidor —sus relojes siguen siendo del navegador, como hasta hoy—,
   * y montarla aquí la haría curar dos veces.
   *
   * El anfitrión es el guion del jugador de los efectos (`_efectosDe`), que es
   * su `ent_owner`. Lo que el objeto dice va a la consola de ESTE cliente.
   *
   * Una entidad se rehace si su `puesto` ha cambiado: ponerse una pieza es
   * `game_wear` y quitársela `game_remove`, y lo que llama a eso es quien
   * cambia el `puesto` (`vestir`, src/play/armadura.js). Aquí no se adivina.
   */
  _equipoDe(c) {
    const p = c?.sesion?.personaje;
    if (!p) return [];
    if (!this.guionesDeObjeto) {
      if ((p.objetos ?? []).some((o) => o?.puesto)) this.defensa.sinGuiones++;
      return [];
    }
    let e = c.equipoVivo;
    if (!e || e.personaje !== p) e = c.equipoVivo = { personaje: p, vivos: new Map(), cargado: false };
    // EL 98: el anfitrión se pide SÓLO si hay una pieza que montar. Desde que
    // `_paso` llama a esto en cada paso (los relojes de las piezas), pedirlo
    // arriba daba un anfitrión a todo cliente, y `costura().efectos` —«a
    // quién le ha caído un efecto»— pasaba a listar a todos (lo cazó
    // `sondas/costurared92`, el control negativo de Beto).
    let host = null;
    const lista = [];
    const vistos = new Set();
    for (const o of p.objetos ?? []) {
      const ficha = this._porId?.get(o?.id) ?? null;
      if (!correEnElServidor(ficha, o?.puesto)) continue;
      const clave = String(o.uid ?? o.id);
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      let ent = e.vivos.get(clave);
      if (!ent || ent.puesto !== Boolean(o.puesto)) {
        if (!this.guionesDeObjeto.tiene(o.id)) continue;
        host ??= this._efectosDe(c);
        ent = new GuionDeObjeto({
          guiones: this.guionesDeObjeto, id: o.id, jugador: host,
          ahora: () => this.t,
          suceso: (tipo, texto) => c.mandar(MENSAJE.TEXTO, { tipo: -1, texto, suceso: tipo }),
          maximos: () => {
            const d = derivadas(atributosDe(p.habilidades));
            return { vida: d.vidaMax, mana: d.manaMax };
          },
        });
        ent.arrancar({
          genero: p.genero === "female" ? "female" : "male",
          quien: e.cargado ? QUIEN_VISTE.JUGANDO : QUIEN_VISTE.CARGA,
          viste: seVisteAlCargar(ficha, o),
          puesto: Boolean(o.puesto),
        });
        e.vivos.set(clave, ent);
      }
      lista.push(ent);
    }
    for (const k of [...e.vivos.keys()]) if (!vistos.has(k)) e.vivos.delete(k);
    e.cargado = true;
    return lista;
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
    // LOS GUIONES, en el mismo paso. El 62.
    //
    // Aquí corre el reloj de los guiones —`wait`, `playanim`— y **la correa
    // del comercio**: `CMSMonster::Trade()` está en el `Think` del vendedor
    // (msmonsterserver.cpp:1835), así que el trato se acaba cuando el cliente
    // se va a más de 128 unidades y no cuando cierra el panel.
    //
    // Sin esta línea el vendedor se quedaría **ocupado para siempre** con el
    // primero que le hablara, y el segundo jugador no podría comprar nunca:
    // la exclusividad sin la correa es peor que no tener exclusividad.
    this.interacciones?.paso(this.paso);
    // EL 92: los `params` del operador a los bichos que acaban de nacer, y los
    // relojes de los efectos de cada jugador (el veneno muerde cada segundo:
    // `callevent 1.0 dot_effect`, effects/base_dot.script). Cada `CScript`
    // lleva los suyos (`IScripted::RunScriptEvents`, script.cpp:5906-5922).
    this._ponerParams();
    for (const c of this.clientes.values()) c.anfitrionDeEfectos?.efectos?.paso(this.paso);
    // EL 98: Y LOS RELOJES DE LAS PIEZAS que corren aquí (`correEnElServidor`,
    // src/play/armadura.js): el `failed_str_req_loop` de una armadura que pesa
    // demasiado (armor_base.script:100, :173-181) y lo que cualquier pieza
    // puesta tenga en `callevent` o `repeatdelay`. Cada objeto es su propio
    // `CScript` con sus relojes (script.cpp:5906-5922). Hasta el 98 las
    // entidades se montaban al primer golpe y nunca se les daba `paso`, así
    // que con servidor el fénix de un débil no le frenaba nunca.
    if (this.guionesDeObjeto) {
      for (const c of this.clientes.values()) {
        if (!c.dentro || !c.sesion?.personaje) continue;
        for (const ent of this._equipoDe(c)) ent.paso(this.paso);
      }
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
    const desde = performance.now();
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
      // EL 99: UN TOPE DE RELOJ DE PARED POR MENSAJE, y es nuestro. Las órdenes
      // se corren al llegar (arriba, `SV_ReadPackets`), así que el bucle es tan
      // largo como lo que cueste cada una, y si Rapier se pone caro —una cápsula
      // metida en la malla, un bicho dentro: §3 y §4 de doc/REAPARECER_99.md—
      // sesenta órdenes por segundo de 100 ms cada una son un servidor que no
      // vuelve a contestar a nadie. El motor no lo necesita porque su
      // `PM_PlayerMove` cuesta lo mismo siempre. Pasado el tope, lo que queda
      // del paquete se trata como el castigo de arriba: el tiempo se cuenta, el
      // acuse sale y el cuerpo no se mueve; la reconciliación del cliente le
      // devuelve donde está. Una orden normal cuesta menos de un milisegundo:
      // el tope sólo lo toca lo que ya está roto.
      // EL 100: y el tope POR SEGUNDO, que cuenta entre mensajes: sin él, la
      // primera orden de cada mensaje corre siempre y un Rapier de 200 ms por
      // llamada cuelga al servidor igual (ver `TOPE_MS_POR_SEGUNDO`). Sólo
      // muerde si el segundo ANTERIOR también se pasó: lo que cuelga es un
      // coste que dura, y un primer paso caro —el árbol de Rapier que se
      // construye, una máquina cargada: medido, 738 ms con `npm test` en
      // paralelo— no puede tirar las órdenes buenas que vienen detrás. Y
      // sólo si en ese segundo anterior simular costó MÁS de lo que duraba lo
      // simulado (`pedido`, la suma de los `msec`): eso es no alcanzar nunca al
      // reloj, que es la forma del cuelgue (150 ms de reloj por orden de 16).
      // Un cliente que manda órdenes más deprisa que el tiempo real —una
      // prueba que manda 3 600 seguidas— con cada una barata no lo toca.
      const ahora = performance.now();
      if (!c.gasto || ahora - c.gasto.desde >= 1000) {
        const reciente = c.gasto && ahora - c.gasto.desde < 2000;
        c.gasto = { desde: ahora, ms: 0, pedido: 0, antes: reciente ? c.gasto.ms : 0, antesPedido: reciente ? c.gasto.pedido : 0 };
      }
      const sinPresupuesto = c.gasto.antes > TOPE_MS_POR_SEGUNDO && c.gasto.antes > c.gasto.antesPedido
        && c.gasto.ms > TOPE_MS_POR_SEGUNDO;
      if ((corridas > 0 && ahora - desde > TOPE_MS_POR_MENSAJE) || sinPresupuesto) {
        c.sinTiempo = (c.sinTiempo ?? 0) + 1;
        if (o.seq > 0) c.ultimaOrden = o.seq;
        continue;
      }
      for (const ms of partirOrden(o.msec)) {
        if (ms <= 0) continue;
        this._simular(c, o, ms / 1000);
      }
      c.gasto.ms += performance.now() - ahora;
      c.gasto.pedido += o.msec;
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
    // ── EL 98: LAS TRABAS, como en solitario ─────────────────────────────
    //
    // `PreThink` y `SetSpeed` son del SERVIDOR en el motor
    // (player.cpp:4033-4054, msmonsterserver.cpp:2819-2857): un aturdimiento
    // o un `effect_slow` que cae en el anfitrión de efectos de este cliente
    // frena AQUÍ, con la misma `trabasDelJugador` y la misma
    // `trabarIntencion` que el bucle de src/main.js. Hasta el 98 un jugador
    // aturdido con servidor andaba, saltaba y pegaba como si nada.
    const t = this._trabasDe(c);
    const b = o.botones ?? 0;
    const q = trabarIntencion({
      adelante: o.adelante, lado: o.lado,
      correr: (b & BOTON.CORRER) !== 0, saltar: (b & BOTON.SALTAR) !== 0,
      agachar: (b & BOTON.AGACHAR) !== 0, atacar: (b & BOTON.ATACAR) !== 0,
      cubrir: (b & BOTON.ATACAR2) !== 0,
    }, t);
    // La orden trabada, para la cuenta del aguante (`velocidadDelPaso` mira el
    // botón de correr y el de atacar): una orden de trotar con NORUN no trota.
    const ot = {
      ...o, adelante: q.adelante, lado: q.lado,
      botones: (b & ~(BOTON.CORRER | BOTON.SALTAR | BOTON.AGACHAR | BOTON.ATACAR | BOTON.ATACAR2))
        | (q.correr ? BOTON.CORRER : 0) | (q.saltar ? BOTON.SALTAR : 0)
        | (q.agachar ? BOTON.AGACHAR : 0) | (q.atacar ? BOTON.ATACAR : 0)
        | (q.cubrir ? BOTON.ATACAR2 : 0),
    };
    // `pev->maxspeed`: porcentaje para el cliente y TOPE para `pmove`
    // (clplayer.cpp:306-307, pm_shared.cpp:3050-3053). Ver src/play/trabas.js.
    const conTrabas = velocidadConTrabas(this._velocidad(c, ot, dt), t.porcentaje);
    c.maxima = conTrabas.maxima;
    // EL 99: «Always try and unstick us unless we are in NOCLIP mode» —
    // `if (PM_CheckStuck()) return;`, pm_shared.cpp:3183-3189. Atascado, ese
    // paso no se mueve, y eso es lo que impide que Rapier calcule segundos
    // enteros dentro de una roca (src/play/atasco.js).
    const apartados = this._atascado(c, ot.botones) ? null : this._bichosDentro(c);
    if (apartados) {
      try {
        cuerpo.step(dt, {
          forward: q.adelante,
          strafe: q.lado,
          jump: q.saltar,
          agachar: q.agachar,
          maxima: conTrabas.maxima,
          tope: conTrabas.tope,
        });
      } finally {
        // EL 100: con el árbol de consultas al día, o el siguiente paso no se
        // entera (ver `encender`, src/play/atasco.js).
        encender(cuerpo, apartados, true);
      }
    }
    // EL 97: EL ESCUDO, con el mismo paso que el cuerpo. El botón es el de la
    // otra mano (`IN_ATTACK2`, giattack.cpp:118), y sólo jugando, como el
    // `cubre` del navegador. Su postura es la que mira `_defender`. EL 98:
    // con NOATTACK no se levanta (`q.cubrir`).
    this._brazalDe(c)?.tic(dt, { pulsado: c.vivo && q.cubrir });
  }

  /**
   * EL 99: `PM_CheckStuck` para este cliente. `true` si este paso NO se mueve:
   * porque el motor devuelve 1 (atascado), o porque ha devuelto 0 sin sacarlo
   * y entonces `PM_FlyMove` empieza en sólido, pone la velocidad a cero y no
   * mueve (pm_shared.cpp:1059-1067). Si el motor mueve el origen (un empujón
   * grande de la tabla, o el forcejeo contra otro jugador), se coloca ahí.
   * Un cuerpo sin Rapier —el de mentira de las pruebas— no se comprueba.
   */
  _atascado(c, botones = 0) {
    const cuerpo = c.cuerpo;
    const probar = this._probador(c);
    if (!probar) return false;
    c.atasco ??= new Atasco({ servidor: true, unidadesPorMetro: this.mundo.perfil?.unidadesPorMetro ?? 39.37 });
    // EL 100: la regla es `atascarse`, la misma que corre el navegador.
    if (atascarse(cuerpo, c.atasco, { t: this.t, botones, probar })) {
      c.pasosAtascado = (c.pasosAtascado ?? 0) + 1;
      return true;
    }
    return false;
  }

  /**
   * EL 99: LOS BICHOS QUE SE HAN METIDO DENTRO DEL JUGADOR, apagados mientras
   * corre su paso. Devuelve los colisionadores apagados (casi siempre ninguno);
   * quien llama los vuelve a encender.
   *
   * En el motor un monstruo no se mete en un jugador: anda con `SV_movestep`,
   * que traza su caja con `MOVE_NORMAL` —contra las entidades, el jugador
   * incluido— y no avanza si choca (ReHLDS sv_move.cpp:232 y :268-273). Aquí
   * los cilindros de los bichos los coloca el paseo sin preguntar al jugador,
   * y una araña que salta encima deja su cilindro DENTRO de la cápsula. Con
   * eso dentro, el controlador de Rapier tarda: medido, hasta 125 ms por
   * llamada con un cilindro de 32×24 metido en la cápsula, y a sesenta órdenes
   * por segundo eso es el servidor de la sonda del 99 sin contestar durante
   * minutos, con el perfilador parado DENTRO de `computeColliderMovement`
   * (doc/REAPARECER_99.md §6). `PM_CheckStuck` no lo puede parar: atascarse en
   * un bicho dejaría paralítico a quien tenga una araña encima.
   *
   * Así que el cilindro que ya está dentro no cuenta para ESTE paso del
   * jugador, que es lo que pasaría en el motor si hubiera llegado a entrar: el
   * jugador sale andando. Los que sólo le tocan siguen ahí y le paran, como
   * siempre.
   */
  _bichosDentro(c) {
    // EL 100: la pregunta es `bichosDentro` (src/play/atasco.js), la misma que
    // hace el navegador; aquí sólo se dice quién es jugador.
    const jugadores = new Set([...this.clientes.values()].map((o) => o.cuerpo?.collider?.handle).filter((h) => h !== undefined));
    const fuera = bichosDentro(c.cuerpo, { esJugador: (col) => jugadores.has(col.handle) });
    // EL 100: `encender` y no `setEnabled` a pelo: sin poner al día el árbol
    // de consultas, el controlador seguía chocando con el apagado en uno de
    // cada dos pasos (src/play/atasco.js).
    encender(c.cuerpo, fuera, false);
    c.bichosApartados = (c.bichosApartados ?? 0) + fuera.length;
    return fuera;
  }

  /** EL 98: el anfitrión de efectos de este cliente si ya existe y es de su personaje; si no, `null`. */
  _anfitrionSiHay(c) {
    const h = c?.anfitrionDeEfectos ?? null;
    return h && h.personaje === c.sesion?.personaje ? h : null;
  }

  /**
   * EL 98: LAS TRABAS DE ESTE CLIENTE, de los efectos que lleva su anfitrión
   * (`_efectosDe`). Sin anfitrión —una partida sin efectos horneados—, ninguna.
   * Se guardan en `c.trabas` para la foto (`trabasParaElCable`) y para medir.
   *
   * No CREA el anfitrión: si no lo hay, no hay efectos que lean. Crearlo aquí
   * —en cada orden— daba un anfitrión a todo cliente, y `costura().efectos`
   * dejaba de decir a quién le ha caído algo (lo cazó costurared92b).
   */
  _trabasDe(c) {
    const t = trabasDelJugador(this._anfitrionSiHay(c));
    c.trabas = t;
    return t;
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
      // EL 95: `renderfx`/`rendercolor`/`renderamt`, o `null`. Se calcula a la
      // hora de la foto, como el `Think` de `CEntGlow` los reescribe en `pev`
      // (mseffects.cpp:361-389), y se apaga si el jugador está muerto (:367).
      brillo: this._brillo(c),
      // EL 96: lo que lleva en la mano derecha, que es lo que el cliente de los
      // demás cuelga de su figura (`CRenderPlayer::RenderGearItem`,
      // clrenderent.cpp:321-365). El id y no el modelo: el modelo lo saca cada
      // cliente de su propio catálogo.
      arma: c.sesion?.personaje?.manos?.derecha ?? null,
    };
  }

  /** EL 95. El brillo de este jugador ahora, y los controladores gastados fuera. */
  _brillo(c) {
    if (!c.brillos?.length) return null;
    const vivo = c.vivo !== false;
    c.brillos = podarBrillos(c.brillos, this.t, { vivo });
    return brilloDeLaEntidad(c.brillos, this.t, { vivo });
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
    // EL 98: LAS TRABAS de este cliente, que en el motor viajan en SU
    // `clientdata` —`iuser3` con las banderas (client.cpp:2800) y `maxspeed`
    // (sv_pmove.c:561)—, no en la entidad que ven los demás. El navegador las
    // junta con las suyas para construir la orden y predecir. Sólo si hay.
    const trabas = trabasParaElCable(c.trabas);
    if (trabas) foto.trabas = trabas;
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
    a.m === b.m && a.o === b.o && a.r === b.r;
}

/** Dos estados son iguales si nada de lo que se dibuja ha cambiado. */
function igual(a, b) {
  return a.pies[0] === b.pies[0] && a.pies[1] === b.pies[1] && a.pies[2] === b.pies[2] &&
    a.yaw === b.yaw && a.cabeceo === b.cabeceo && a.suelo === b.suelo &&
    a.rapidez === b.rapidez && a.vida === b.vida && a.estado === b.estado &&
    a.nombre === b.nombre && mismoBrillo(a.brillo, b.brillo) && (a.arma ?? null) === (b.arma ?? null) &&
    (a.vel?.[0] === b.vel?.[0] && a.vel?.[1] === b.vel?.[1] && a.vel?.[2] === b.vel?.[2]);
}
