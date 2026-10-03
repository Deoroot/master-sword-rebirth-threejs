// EL PROTOCOLO: las cifras de la red, leídas del motor y no elegidas.
//
// Es la misma regla que cerró la iluminación en el 06 y la física en el 12:
// **una cifra del motor vale más que una calibrada a ojo**. La red de GoldSrc
// lleva veinte años funcionando sobre módems, y todos sus números están
// escritos. Aquí están traducidos, con su sitio.
//
// Sin DOM y sin Three: esto corre igual en el navegador y en el servidor, que
// es el requisito del §5 de PROYECTO_10.md. Y sin sockets tampoco: el
// transporte es `src/red/socket.js` y no se nombra aquí, para que la regla se
// pueda comprobar sin abrir un puerto.
//
// ── Los cuatro relojes, que es lo que más cuesta ver ───────────────────────
//
// No hay «una frecuencia de red». Hay cuatro, y son independientes:
//
//   `sys_ticrate`     100/s   cuántas veces por segundo SIMULA el servidor
//   `cl_cmdrate`       30/s   cuántas veces el cliente MANDA lo que pulsa
//   `cl_updaterate`    20/s   cuántas veces el servidor le CUENTA el mundo
//   los fotogramas    60+/s   cuántas veces el cliente DIBUJA
//
// De ahí sale casi todo lo demás: como el servidor cuenta el mundo 20 veces por
// segundo y se dibuja 60, dos de cada tres fotogramas no tienen datos nuevos —
// y por eso existe `ex_interp`, que es dibujar el pasado a cambio de dibujarlo
// entero. Y como el servidor simula 100 veces por segundo y el cliente manda
// 30, cada paquete trae varias órdenes: por eso una orden lleva su propio
// `msec` y no se supone.

/**
 * Los `cvar` del motor, con su valor por defecto y su sitio.
 *
 * `MSC/` es la copia de las fuentes que este proyecto lee: `xash3d-fwgs-sdk/`
 * es el motor al que MSR está portado y `ReHLDS-master/` es el servidor de
 * GoldSrc reimplementado, que es donde vive la parte de servidor con nombres.
 */
export const RED = Object.freeze({
  /**
   * `sys_ticrate "100"` — `engine/common/host.c:67` (y `host.cpp:59` en
   * ReHLDS, con «100.0»). Cien pasos de simulación por segundo: **10 ms de
   * paso**, que es el número que hay que tener en la cabeza. Un servidor que
   * simula a 60 no es «casi igual»: cambia la altura de un salto, porque la
   * gravedad se integra por pasos.
   */
  ticrate: 100,

  /**
   * `sv_maxupdaterate "30.0"` y `sv_minupdaterate "1.0"` —
   * `engine/sv_main.cpp:191`. Topes del servidor sobre lo que pida el cliente.
   */
  maxUpdaterate: 30,
  minUpdaterate: 1,

  /**
   * `cl_updaterate` por defecto **20**, con `MIN_UPDATERATE 10.0f` y
   * `MAX_UPDATERATE 102.0f` — `engine/client/client.h:109-110`.
   *
   * El 102 no es un número redondo por casualidad: es el tope que deja el
   * `sys_ticrate` de 100 con un poco de margen.
   */
  updaterate: 20,
  updaterateMin: 10,
  updaterateMax: 102,

  /**
   * `cl_cmdrate "30"` — `engine/client/cl_main.c:69`, y se recorta a mano
   * entre 10 y 100 en `CL_WritePacket` (`cl_main.c:811-814`).
   */
  cmdrate: 30,
  cmdrateMin: 10,
  cmdrateMax: 100,

  /**
   * `cl_cmdbackup "10"` — `cl_main.c:53`. Cuántas órdenes VIEJAS se reenvían
   * pegadas a la nueva, y es la idea más barata de toda la red: como una orden
   * ocupa unos bytes, mandar las diez anteriores otra vez cuesta casi nada y
   * hace que perder un paquete no se note. No hay reenvío ni acuse por orden:
   * se manda todo varias veces y se tira lo repetido.
   *
   * El tope es `MAX_BACKUP_COMMANDS = BIT(NUM_BACKUP_COMMAND_BITS)` con
   * `NUM_BACKUP_COMMAND_BITS 4` (`engine/common/protocol.h:170-171`): **16**,
   * porque el campo que lleva la cuenta son cuatro bits.
   */
  cmdbackup: 10,
  cmdbackupMax: 16,

  /**
   * `ex_interp "0.1"` — `cl_main.c:70`, y `MAX_EX_INTERP 0.1f` en
   * `client.h:112`. Cien milisegundos: **los demás jugadores se dibujan una
   * décima de segundo en el pasado**, siempre, aunque la red sea perfecta.
   *
   * Es el precio de no dar saltos: con 20 actualizaciones por segundo hay 50 ms
   * entre dos, y para interpolar hace falta tener ya la siguiente. Sin esto se
   * puede extrapolar, que es adivinar, y cuando se falla el otro jugador se
   * teletransporta.
   */
  exInterp: 0.1,
  exInterpMax: 0.1,

  /**
   * `MULTIPLAYER_BACKUP 64` — `engine/common/netchan.h:75`. Cuántas fotos
   * guarda cada lado: el servidor para poder retroceder, el cliente para poder
   * comparar lo que predijo con lo que pasó. «must be power of 2», porque el
   * índice se saca con una máscara y no con un módulo.
   */
  historia: 64,

  /**
   * La compensación de retardo: `sv_unlag "1"`, `sv_maxunlag "0.5"`,
   * `sv_unlagpush "0.0"`, `sv_unlagsamples "1"` — `engine/sv_user.cpp:56-59`.
   *
   * Encendida de fábrica, y medio segundo de tope. Es lo que hace que apuntar
   * a donde ves al otro acierte, y también lo que hace que a veces te maten
   * detrás de una esquina: las dos cosas son la misma cosa.
   */
  unlag: true,
  maxUnlag: 0.5,
  unlagPush: 0,
  unlagMuestras: 1,

  /**
   * El tope del retardo que se compensa antes de mirar `sv_maxunlag`:
   *
   *     float clientLatency = _host_client->latency;
   *     if (clientLatency > 1.5) clientLatency = 1.5f;
   *                                        sv_user.cpp:1252-1254
   */
  latenciaTope: 1.5,

  /**
   * `MAX_CLIENTS 32` — `rehlds/common/const.h:23`, y en Xash es
   * `(1<<MAX_CLIENT_BITS)` con cinco bits, que da lo mismo. Treinta y dos
   * jugadores es el tope del formato, no una preferencia.
   */
  maxJugadores: 32,

  /**
   * `clockwindow "0.5"` — `engine/net_ws.cpp:83`. **Medio segundo de crédito**,
   * y es la defensa del motor contra el «speed hack».
   *
   * La idea es contable y no física: el servidor lleva la cuenta de cuánto
   * tiempo ha pedido simular cada cliente (`cmdtime`) y lo compara una vez por
   * segundo con el tiempo que ha pasado de verdad. Si un cliente va más de
   * medio segundo por delante —o sea, ha mandado más milisegundos de los que
   * han transcurrido— sus órdenes se **ignoran** durante otro medio segundo.
   *
   * Ir por DETRÁS no se castiga, y ahí está el criterio: eso es una conexión
   * mala, no una trampa. Se le vuelve a poner el reloj en hora y ya. Ver
   * `SV_CheckCmdTimes`, `sv_main.cpp:8015-8045`.
   */
  ventanaDelReloj: 0.5,

  /**
   * `MAX_DROPPED_CMDS = 24` — `sv_user.cpp:1526`, dentro de
   * `SV_EstablishTimeBase`. Por encima de veinticuatro órdenes perdidas el
   * servidor **no intenta recuperarlas**: se da por perdida la ráfaga entera.
   */
  maxOrdenesPerdidas: 24,
});

/** La versión del protocolo. Si cambia el formato, cambia esto. */
export const VERSION = 1;

/** Los mensajes, por nombre. Un mensaje que no esté aquí se tira. */
export const MENSAJE = Object.freeze({
  // del cliente al servidor
  HOLA: "hola",
  PERSONAJES: "personajes",
  CREAR: "crear",
  ELEGIR: "elegir",
  BORRAR: "borrar",
  ORDENES: "ordenes",
  PONG: "pong",
  ADIOS: "adios",
  /**
   * UN GOLPE A UN BICHO. Del 28.
   *
   * No dice «este monstruo tiene ahora 12 de vida»: dice «he blandido hacia
   * éste». Quien resta la vida, tira el parry, decide si muere y avisa a sus
   * aliados es el servidor, con su manada — y el daño que viene se recorta
   * contra el techo del arma que el servidor ve en las manos del personaje.
   *
   * Con la vida en el navegador, matar un goblin era editar un número.
   */
  PEGAR: "pegar",
  /**
   * HABLAR. Del 61, y es el `say_text` del mod tal cual.
   *
   *     ServerCmd(UTIL_VarArgs("say_text %i %s", m_Type, m_TextPanel->m_Message.c_str()));
   *                                              vgui_startsaytext.h:55
   *
   * Lo que manda el cliente son **dos cosas y ninguna más**: qué tecla ha
   * pulsado (`y`, `u` o `j`) y qué ha escrito. No manda la frase montada, ni
   * su nombre, ni a quién va: eso lo decide el servidor en `Speak`, y tiene
   * que ser así — si el cliente mandara la frase, cualquiera podría escribir
   * «[global] Ana: me voy» con el nombre de otro.
   */
  DECIR: "decir",
  /**
   * PEDIRLE EL MENÚ A UN NPC — el 62.
   *
   * Es la F. En el mod el menú lo construye el SERVIDOR corriendo
   * `game_menu_getoptions` del guion, y el cliente sólo lo dibuja; elegir una
   * opción vuelve como `menuselect`:
   *
   *     ClientCmd(UTIL_VarArgs("menuselect %d
", idx));   menu.cpp:143
   *     if (FStrEq(pcmd, "menuselect"))       multiplay_gamerules.cpp:1576
   *
   * Hasta el 62 el guion corría en el navegador de cada uno, así que dos
   * jugadores tenían dos copias del mismo NPC con sus variables por separado.
   */
  PEDIRMENU: "pedirmenu",
  /** `menuselect N`. `indice` a `null` es cancelar (`game_menu_cancel`). */
  ELIGEMENU: "eligemenu",
  /**
   * COMPRAR O VENDER. `ServerCmd("trade ...")` — client.cpp:739.
   *
   * El cliente dice qué fila quiere, no cuánto cuesta ni cuánto oro le queda.
   */
  TRADE: "trade",
  // del servidor al cliente
  BIENVENIDA: "bienvenida",
  LISTA: "lista",
  APARECES: "apareces",
  FOTO: "foto",
  PING: "ping",
  FUERA: "fuera",
  FALLO: "fallo",
  /**
   * LO QUE ALGUIEN HA DICHO, ya montado y ya filtrado.
   *
   * Es el `NETMSG_HUDMSG` de tipo 4 del mod (`vgui_hud.cpp:470-486`): un byte
   * de canal y la cadena entera. Que llegue significa que el servidor ya ha
   * decidido que **tú** lo oyes; el cliente no vuelve a mirar distancias.
   */
  TEXTO: "texto",
  /** El menú que pidió: `{ para, nombre, opciones }`. */
  OPCIONES: "opciones",
  /**
   * EL ESTANTE, para uno solo.
   *
   *     MESSAGE_BEGIN(MSG_ONE, g_netmsg[NETMSG_VGUIMENU], NULL, pPlayer->pev);
   *     WRITE_BYTE(MENU_STORE); WRITE_BYTE(iBuyFlags);
   *     WRITE_STRING_LIMIT(pVendor->DisplayName(), ...);
   *     WRITE_BYTE(Items.size());
   *     ...y un mensaje por objeto: nombre, cantidad, coste, ratio, lote
   *                                              store.cpp:82-111
   *
   * `MSG_ONE`: el estante va **al cliente que está comerciando** y a nadie
   * más, porque el vendedor atiende a uno a la vez.
   */
  TIENDA: "tienda",
  /**
   * LO QUE HA CAMBIADO DE TU PERSONAJE — el 63.
   *
   * Hasta el 63 el cliente recibía su personaje **una vez**, en `APARECES`, y
   * nunca más. Con el guion y la tienda en el servidor eso dejó de bastar: la
   * compra ocurría —el servidor decía «You receive Sharp Knife.»— y el
   * navegador seguía enseñando el oro y la mochila de hace un rato. No era un
   * fallo de la compra: era que **nadie se lo contaba**.
   *
   * El mod tiene los dos avisos y los manda `MSG_ONE`:
   *
   *     if (m_OldGold != m_Gold) {                       // sólo si cambió
   *         MESSAGE_BEGIN(MSG_ONE, g_netmsg[NETMSG_SETSTAT], NULL, pev);
   *         WRITE_BYTE(3); WRITE_BYTE(1); WRITE_LONG(m_Gold);
   *     }                                       player.cpp:3861-3870
   *     MESSAGE_BEGIN(MSG_ONE, g_netmsg[NETMSG_ITEM], NULL, pPlayer->pev);
   *                                             scriptcmds.cpp:2156, player.cpp:3790
   *
   * Aquí van juntos en uno solo porque este puerto no manda el inventario
   * ranura a ranura: manda los campos que han cambiado, y el cliente los
   * funde en el personaje que ya tiene.
   */
  FICHA: "ficha",
  /**
   * LO QUE UN EFECTO LE HACE A TU PANTALLA — el 93.
   *
   * Dos mensajes del mod en uno, distinguidos por `que`, y los dos `MSG_ONE`:
   *
   *   "fundido"  `gmsgFade`: `{ duracion, aguante, banderas, r, g, b, a }`,
   *              las dos primeras en 4.12 fijo como las escribe
   *              `UTIL_ScreenFadeWrite` (hl/util.cpp:1146-1161).
   *   "icono"    `NETMSG_STATUSICONS`: `{ tipo, icono, nombre, duracion, tga }`
   *              (scriptcmds.cpp:3727-3734, 3836-3842).
   *
   * El cliente no recalcula nada de quién lo ve: si le llega, es suyo. La
   * regla de los dos lados está en `src/play/efectospantalla.js`.
   */
  PANTALLA: "pantalla",
});

// ── Los relojes, calculados como los calcula el motor ───────────────────────

/**
 * `SV_CheckUpdateRate` — `sv_main.cpp:1688-1711`, traducido:
 *
 *     if (*rate == 0.0) { *rate = 0.05; return; }
 *     if (sv_maxupdaterate != 0) if (*rate < 1/sv_maxupdaterate) *rate = 1/sv_maxupdaterate;
 *     if (sv_minupdaterate != 0) if (*rate > 1/sv_minupdaterate) *rate = 1/sv_minupdaterate;
 *
 * Y el paso anterior, que es el que decide qué entra aquí (`sv_main.cpp:5337`):
 *
 *     i = atoi(cl_updaterate);
 *     if (i >= 10) cl->next_messageinterval = 1.0 / i; else = 0.1;
 *
 * O sea que **pedir 4 actualizaciones por segundo no da 4: da 10**, porque por
 * debajo de diez el servidor ignora la petición entera y pone una décima. Y
 * pedir 100 tampoco da 100: `sv_maxupdaterate` lo baja a 30. Los topes del
 * cliente y los del servidor son distintos y mandan los del servidor.
 *
 * @returns {number} segundos entre dos fotos para ese cliente
 */
export function intervaloDeEnvio(clUpdaterate, red = RED) {
  const i = Math.trunc(Number(clUpdaterate) || 0);
  let intervalo = i >= 10 ? 1 / i : 0.1;
  if (intervalo === 0) return 0.05;
  if (red.maxUpdaterate) intervalo = Math.max(intervalo, 1 / red.maxUpdaterate);
  if (red.minUpdaterate) intervalo = Math.min(intervalo, 1 / red.minUpdaterate);
  return intervalo;
}

/**
 * `CL_ComputeClientInterpolationAmount` — `cl_main.c:380-412`.
 *
 * La ventana de interpolación, y su regla escondida:
 *
 *     min_interp = 1.0f / cl_updaterate.value;
 *     interpolation_time = bound( min_interp, ex_interp*1000, max_interp );
 *
 * **El suelo depende de `cl_updaterate`**: con 20 actualizaciones por segundo
 * el mínimo son 50 ms, y pedir `ex_interp 0.01` no baja de ahí. Es lo que
 * impide el truco clásico de bajar la interpolación a cero para ver a los
 * demás «en tiempo real»: sin dos fotos que interpolar no hay nada que dibujar,
 * y lo que sale es un salto por actualización.
 *
 * Se devuelve en SEGUNDOS. El motor lo lleva en milisegundos dentro de la orden
 * (`lerp_msec`) porque ahí es un `short`.
 */
export function interpolacion(exInterp = RED.exInterp, clUpdaterate = RED.updaterate, red = RED) {
  // El propio motor recorta primero la tasa, e imprime un aviso al hacerlo.
  let tasa = Number(clUpdaterate) || red.updaterate;
  if (tasa < red.updaterateMin) tasa = red.updaterate;   // «resetting to default (20)»
  if (tasa > red.updaterateMax) tasa = red.updaterateMax;
  const minimo = 1 / tasa;
  const maximo = red.exInterpMax;
  return Math.min(Math.max(Number(exInterp) || 0, minimo), maximo);
}

/**
 * `SV_RunCmd` — `sv_user.cpp:775-783`. La orden larga se PARTE EN DOS:
 *
 *     if (cmd.msec > 50) {
 *       cmd.msec = (byte)(ucmd->msec / 2.0);  SV_RunCmd(&cmd, seed);
 *       cmd.msec = (byte)(ucmd->msec / 2.0);  cmd.impulse = 0;  SV_RunCmd(...);
 *       return;
 *     }
 *
 * Tres cosas, y las tres se portan tal cual:
 *
 *   1. **Se pierde un milisegundo en cada partición impar.** El `(byte)` trunca
 *      y las dos mitades salen del mismo cálculo, así que una orden de 51 ms se
 *      simula como 25 + 25 = 50. No es un redondeo repartido: es una pérdida.
 *      Con una orden de 255 ms —el tope de un byte— se pierden dos.
 *   2. **El `impulse` sólo va en la primera mitad.** Un impulso es un suceso
 *      («cambio de arma»), no un estado: correrlo dos veces lo haría dos veces.
 *   3. **Se parte recursivamente.** 200 ms → 100 + 100 → cuatro de 50.
 *
 * ¿Por qué 50? Porque un paso de simulación demasiado largo atraviesa paredes:
 * a 320 u/s, 200 ms son 64 unidades, más que el grosor de un tabique.
 *
 * @returns {number[]} los `msec` de las órdenes que hay que correr, en orden
 */
export function partirOrden(msec) {
  const ms = Math.max(0, Math.min(255, Math.trunc(Number(msec) || 0)));
  if (ms <= 50) return [ms];
  const mitad = Math.trunc(ms / 2);
  return [...partirOrden(mitad), ...partirOrden(mitad)];
}

/**
 * `SV_EstablishTimeBase` — `sv_user.cpp:1519-1558`. Qué hacer con lo perdido.
 *
 * Cuando faltan órdenes por el camino, el servidor **no las inventa y no las
 * salta**: repite. Y en dos tramos, que es lo que no se adivina:
 *
 *   - de lo perdido que NO cabe en el respaldo, repite la última orden conocida
 *     tantas veces como haga falta;
 *   - de lo que sí cabe, corre las órdenes viejas que venían en el paquete.
 *
 * Y si se han perdido **24 o más**, no hace nada de esto: la ráfaga se da por
 * perdida entera. Repetir dos segundos de «hacia adelante» sería peor que el
 * tirón — el jugador aparecería empotrado en una pared que nunca vio.
 *
 * @returns {{repetirUltima: number, viejasQueCorrer: number, abandonado: boolean}}
 */
export function recuperarPerdidas(perdidas = 0, respaldo = RED.cmdbackup, red = RED) {
  const p = Math.max(0, Math.trunc(perdidas));
  if (p >= red.maxOrdenesPerdidas) return { repetirUltima: 0, viejasQueCorrer: 0, abandonado: true };
  const repetirUltima = Math.max(0, p - respaldo);
  return { repetirUltima, viejasQueCorrer: p - repetirUltima, abandonado: false };
}

/**
 * La compensación de retardo: **a qué instante del pasado hay que mirar** para
 * resolver el disparo de este cliente. `SV_SetupMove`, `sv_user.cpp:1252-1285`:
 *
 *     clientLatency = min(host_client->latency, 1.5)
 *     if (sv_maxunlag) clientLatency = min(clientLatency, sv_maxunlag)
 *     cl_interptime = min(lastcmd.lerp_msec / 1000, 0.1)
 *     if (next_messageinterval > cl_interptime) cl_interptime = next_messageinterval
 *     targettime = realtime - clientLatency - cl_interptime + sv_unlagpush
 *     if (targettime > realtime) targettime = realtime
 *
 * Lo que dice en una frase: **el servidor rebobina a los demás jugadores hasta
 * lo que este cliente estaba viendo cuando pulsó.** Y son dos retrasos sumados,
 * no uno: lo que tardó el paquete en llegar (`latency`) y lo que el cliente
 * dibuja en el pasado a propósito (`ex_interp`). Olvidar el segundo es el fallo
 * clásico, y se ve como «le he dado y no ha contado».
 *
 * El `if (next_messageinterval > cl_interptime)` es el suelo del §
 * `interpolacion()` visto desde el otro lado: el servidor no se fía del
 * `lerp_msec` que le manden y nunca rebobina menos de lo que tarda en mandar
 * una foto.
 */
export function tiempoObjetivo({
  ahora = 0, latencia = 0, lerpMsec = 0, intervalo = 1 / RED.updaterate, red = RED,
} = {}) {
  if (!red.unlag) return ahora;
  let lat = Math.max(0, Number(latencia) || 0);
  if (lat > red.latenciaTope) lat = red.latenciaTope;
  if (red.maxUnlag) lat = Math.min(lat, red.maxUnlag);
  let interp = Math.max(0, (Number(lerpMsec) || 0) / 1000);
  if (interp > 0.1) interp = 0.1;
  if (intervalo > interp) interp = intervalo;
  const objetivo = ahora - lat - interp + red.unlagPush;
  return objetivo > ahora ? ahora : objetivo;
}

// ── Las órdenes ─────────────────────────────────────────────────────────────

/**
 * Una orden del jugador: el `usercmd_t` del motor, con nuestros nombres.
 *
 * Los campos que no llevamos son los que aquí no significan nada todavía
 * (`weaponselect`, `impact_index`, el `random_seed` del disparo). Los que sí
 * llevamos van con el mismo tipo que allí, **y eso importa en uno**: `msec` es
 * un `byte`, o sea que una orden **no puede durar más de 255 ms** por mucho que
 * la pestaña haya estado en segundo plano media hora. Volver a una pestaña
 * dormida no puede dar un salto de media hora de simulación.
 */
export function orden({
  seq = 0, msec = 0, yaw = 0, cabeceo = 0,
  adelante = 0, lado = 0, arriba = 0,
  botones = 0, impulso = 0, lerpMsec = 100,
} = {}) {
  return {
    seq: Math.max(0, Math.trunc(seq)),
    msec: Math.max(0, Math.min(255, Math.round(msec))),
    // Los ángulos van como los manda el cliente: son suyos. El motor tampoco
    // los valida — mirar a donde quieras no es hacer trampa.
    yaw: Number(yaw) || 0,
    cabeceo: Number(cabeceo) || 0,
    // La intención va recortada a [-1, 1]. En el motor es `forwardmove` en
    // unidades por segundo y el recorte lo hace `PM_Move` con `maxspeed`; aquí
    // el recorte es aquí, y es LA defensa más importante de todas: sin él, un
    // cliente que mande `adelante: 1000` anda mil veces más rápido y el
    // servidor se lo cree, porque está corriendo su física de verdad.
    adelante: recortar(adelante),
    lado: recortar(lado),
    arriba: recortar(arriba),
    botones: Math.trunc(botones) | 0,
    impulso: Math.trunc(impulso) | 0,
    lerpMsec: Math.max(0, Math.min(1000, Math.round(lerpMsec))),
  };
}

const recortar = (x) => {
  const v = Number(x);
  if (!Number.isFinite(v)) return 0;
  return v < -1 ? -1 : v > 1 ? 1 : v;
};

/** Los botones, como el `pev->button` del motor. */
export const BOTON = Object.freeze({
  ATACAR: 1 << 0,
  SALTAR: 1 << 1,
  AGACHAR: 1 << 2,
  CORRER: 1 << 3,     // la tecla de trotar: `+speed` en el `config.cfg`
  USAR: 1 << 4,
  ATACAR2: 1 << 5,
});

// ── El sobre ────────────────────────────────────────────────────────────────

/**
 * Empaqueta un mensaje. JSON, y con una razón que no es la pereza.
 *
 * El motor manda bits contados a mano porque su presupuesto era un módem de
 * 33,6 kbps; el nuestro es un WebSocket sobre TCP con veinte jugadores. Una
 * foto de esta partida en JSON son unos 200 bytes por jugador, o sea 4 kB a
 * veinte actualizaciones por segundo: 80 kB/s en el peor caso. Cabe.
 *
 * Y lo que se gana a cambio es que **la sonda puede leer el tráfico**. El día
 * que no quepa, se cambia esta función y sus dos pruebas: el resto del código
 * no sabe cómo viajan los mensajes.
 */
export function empaquetar(tipo, cuerpo = {}) {
  // `v` y `t` son del SOBRE, y esto no es celo: costó una vuelta entera.
  //
  // La foto llevaba el tiempo del servidor en un campo llamado `t`, y al
  // extenderla aquí **pisaba el tipo del mensaje**. El resultado es de los
  // malos: `abrir()` devolvía `null` por un tipo que ya no era una cadena, así
  // que el cliente entraba al mapa —eso iba por otro mensaje— y no recibía una
  // sola foto. Ni un error, ni un aviso: los demás jugadores simplemente no
  // existían. Ahora el choque es una excepción en la primera prueba que lo
  // toque, que es donde tiene que doler.
  if (cuerpo && (("t" in cuerpo) || ("v" in cuerpo))) {
    throw new Error(`el mensaje '${tipo}' usa 't' o 'v', que son del sobre`);
  }
  return JSON.stringify({ v: VERSION, t: tipo, ...cuerpo });
}

/**
 * Lo abre. Nunca lanza: un mensaje roto es un mensaje que se tira, no una
 * excepción que tumba el bucle del servidor. Devuelve `null`.
 */
export function abrir(texto) {
  let m;
  try { m = JSON.parse(typeof texto === "string" ? texto : String(texto)); } catch { return null; }
  if (!m || typeof m !== "object" || Array.isArray(m)) return null;
  if (m.v !== VERSION) return null;
  if (typeof m.t !== "string") return null;
  return m;
}
