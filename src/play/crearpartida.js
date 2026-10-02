// «CREATE SERVER»: qué se puede ajustar al montar una partida, de dónde sale
// cada valor por defecto y cuáles de ellos hacen algo aquí.
//
// Sin DOM, como todo lo de esta carpeta: la tabla es la regla y
// `src/vgui2/crearservidor.js` sólo la dibuja.
//
// ── Los valores por defecto son cvars del juego, no gusto nuestro ─────────
//
// Casi todos están declarados en el servidor del mod, y tres de ellos se pueden
// comprobar contra la captura de la pestaña Game sin fiarse de nadie:
//
//     cvar_t msallowtimevote  = {"ms_allowtimevote", "1", FCVAR_SERVER};
//     cvar_t ms_pklevel       = {"ms_pklevel",       "0", FCVAR_SERVER};
//     cvar_t ms_central_enabled = {"ms_central_enabled","0", FCVAR_SERVER};
//                                     svglobals.cpp:42, 51, 67
//
// «Allow time change votes» sale MARCADA en la captura, «Allow Player vs Player»
// sin marcar y «Enable Central Server» sin marcar. Los tres cuadran. Que tres
// cuadren es lo que permite fiarse de los demás.
//
// ── Uno NO cuadra, y se dice en vez de taparlo ────────────────────────────
//
//     cvar_t ms_reset_time = {"ms_reset_time", "10", FCVAR_SERVER};
//                                     svglobals.cpp:45
//
// El cvar vale **10** y la ventana enseña **30**. O sea que el valor por defecto
// del diálogo no es el del cvar: `GameUI` escribe el suyo al abrir. Como el
// código del diálogo no es público, aquí manda lo que se ve en la captura —es lo
// que el jugador encuentra— y el cvar queda apuntado al lado. Es la única
// diferencia de las nueve.
//
// ── Y uno que no sé, y tampoco se inventa ─────────────────────────────────
//
// «Store Characters» sale como «3 On Server» en la captura. El cvar que se le
// parece es `ms_serverchar` (svglobals.cpp:52), que vale "1", y no explica el 3.
// Así que la opción se porta con el texto de la captura y sin atarla a ningún
// cvar: escribir uno adivinado sería peor que decir que no se sabe.
//
// ── POR QUÉ CASI TODO ESTÁ APAGADO: ES UNA RAZÓN, NO NUEVE ────────────────
//
// La tabla llevaba nueve motivos distintos —«no hay a quién ocultarse», «no hay
// segundo jugador», «no hay servidor donde guardar»— y eso hacía parecer que
// faltaban nueve cosas. **Falta una.** En el juego, «Start» LEVANTA UN
// SERVIDOR y te conecta a él; aquí abre una partida local en la pestaña y ya
// está. `Anfitrion` —el que sí es un servidor de verdad— sólo lo usa
// `tools/servidor.mjs`, que es otro proceso y se arranca a mano con
// `npm run servidor`.
//
// Por eso todos los `FCVAR_SERVER` de la pestaña Game están apagados: no es que
// no exista la función, es que no hay servidor al que decírselo. Y dos de los
// motivos que había escritos eran **falsos**, no sólo imprecisos:
//
//   - «no hay servidor donde guardar los personajes» — sí lo hay:
//     `AlmacenRemoto` (`src/red/cliente.js`) guarda contra `npm run servidor`
//     desde el experimento 27, y `src/main.js:374-376` elige entre él y el
//     local. Lo que no hay es forma de pedirlo DESDE AQUÍ: lo decide `?red=`
//     al cargar la página, antes de que esta ventana exista.
//   - «el anfitrión es el único jugador hasta que el port tenga cuentas» — las
//     cuentas no tienen nada que ver: `partida.js:199` ya reparte slots contra
//     `red.maxJugadores` y hay varios jugadores de verdad. Lo que falta es que
//     este diálogo pueda fijar ese número, que vive en el otro proceso
//     (`protocolo.js:134`).
//
// ── Y UN AJUSTE «VIVO» PUEDE NO ESTAR VIVO ────────────────────────────────
//
// `porQueNo` vacío significaba «esto hace algo», y no lo comprobaba nadie:
// `mapa` y `nombre` estaban los dos sin motivo y **ninguno de los dos llegaba
// al juego**, porque `alEmpezar` sólo miraba `pantallaCompleta`. La cuenta
// decía tres vivos y era uno.
//
// Para que no vuelva a pasar, un ajuste encendido tiene que decir DÓNDE se
// aplica, en `aplica`, y hay una prueba que exige una de las dos cosas: o
// `porQueNo`, o `aplica`. Un ajuste no puede estar callado.
import { MAPAS_PORTADOS } from "./mapa.js";


/** Las dos pestañas de la ventana, en el orden de la captura. */
export const PESTANAS = ["Server", "Game"];

/**
 * Los ajustes de la partida.
 *
 *   `cvar`     cómo se llama en el motor o en el mod.
 *   `fuente`   dónde está declarado, para poder volver a mirarlo.
 *   `porQueNo` por qué este ajuste no puede hacer nada aquí.
 *   `aplica`   dónde se aplica, si lo hace. **Uno de los dos, nunca ninguno**:
 *              un ajuste sin `porQueNo` y sin `aplica` es uno que dice estar
 *              vivo sin que nadie lo haya comprobado, que es como `mapa` y
 *              `nombre` pasaron por vivos sin llegar al juego.
 */
export const AJUSTES = [
  // ── Server ──────────────────────────────────────────────────────────────
  {
    pestana: "Server", clave: "mapa", cvar: "map", tipo: "desplegable",
    etiqueta: "#GameUI_Map", pordefecto: "< Random Map >",
    // El original lista todos los `.bsp` del juego. Aquí la lista la pone quien
    // monta la ventana, porque **sólo hay un mapa portado**: Gate City. Poner
    // los ciento y pico nombres del original haría una lista que miente.
    //
    // Y ahora se USA: `mapaElegido()` resuelve `< Random Map >` y el nombre
    // elegido, y «Start» arranca con lo que salga de ahí. Antes esta fila
    // estaba en la ventana y el valor se tiraba a la basura.
    //
    // Con un solo mapa portado las dos entradas llevan al mismo sitio, y eso
    // se dice aquí para que nadie lo lea como una elección que no es: lo que
    // se comprueba es que **«Start» abre el mapa que resuelve la fila**, no
    // que haya dos destinos. El día que entre un segundo mapa, esto ya está.
    //
    // CORRECCIÓN DEL 50: ese día llegó, y el «ya está» era cierto — no hubo
    // que tocar ni esta fila ni `mapaElegido()`. Lo que sí cambió de golpe es
    // que **`< Random Map >` sortea de verdad**: con dos portados, entrar sin
    // tocar la fila lleva a Gate City o a Edana a cara o cruz. Eso es lo que
    // hace el original, así que se queda; lo que no puede quedarse es una
    // sonda que exija un nombre concreto después de no elegir ninguno, y
    // `sonda:arranque36` elegía. Ahora elige a mano antes de «Start».
    aplica: "src/main.js, el «Start» de alEmpezar: mapaElegido(valores.mapa)",
  },

  // ── NUESTRA, y se declara ───────────────────────────────────────────────
  //
  // Esta fila NO está en la captura y no es de Master Sword. Se declara igual
  // que se declararon ALT y ALT GR de los desplazamientos de ranuras
  // (`src/juego/teclas.js`): lo de arriba son hechos, esto es una decisión.
  //
  // Está aquí y no en «Options» por una razón técnica, no estética: pedir el
  // teclado al navegador **sólo funciona dentro de un gesto del usuario y en
  // pantalla completa** (`src/juego/navegador.js:139-171`). El «Start» de esta
  // ventana es un clic, o sea un gesto, y es el último momento antes de jugar.
  // Ofrecerlo aquí es lo único que hace que funcione a la primera.
  //
  // Y hace falta de verdad: con los `bind` del juego, agacharse y avanzar es
  // Ctrl+W, que en una pestaña cierra la pestaña. Ver `doc/NAVEGADOR_35.md` §2.
  {
    pestana: "Server", clave: "pantallaCompleta", tipo: "casilla",
    etiqueta: "Play in full screen (web port only — lets the game keep Ctrl+W)",
    pordefecto: true, nuestra: true,
    // EL 73: **no sale en la cáscara de escritorio**, y es la propia etiqueta la
    // que lo dice desde que se escribió — «web port only».
    //
    // Esta fila nunca fue una preferencia: era un APAÑO contra un límite del
    // navegador, que sólo concede el teclado dentro de un gesto y en pantalla
    // completa. El 72 quitó el límite con `Menu.setApplicationMenu(null)`, así
    // que en escritorio el juego ya tiene Ctrl+W y F1–F12 sin pedir nada, y
    // ofrecer la casilla sería ofrecer la cura de una enfermedad que no hay.
    //
    // No se borra porque el port **también corre en un navegador** —ahí es donde
    // corren las sondas— y allí sigue siendo lo único que hace que agacharse y
    // avanzar no cierre la pestaña. Ver `doc/NAVEGADOR_35.md` §2.
    soloEnNavegador: true,
    // EL LÍMITE DEL 50, dicho aquí y no sólo en el código: si «Start» cambia
    // de mapa, la página se recarga —es el `CL_Disconnect()` + `Host_Map()`
    // del motor— y la recarga se lleva por delante la pantalla completa, que
    // el navegador sólo concede dentro del clic. Se avisa por consola y se
    // entra sin ella. Entrar al mapa que ya está cargado no recarga y sí la
    // consigue.
    aplica: "src/main.js, el «Start» de alEmpezar: atraparTeclado(document.documentElement)" +
      " — salvo si «Start» cambia de mapa, que recarga y pierde el gesto",
  },

  // ── Game ────────────────────────────────────────────────────────────────
  {
    pestana: "Game", clave: "lan", cvar: "sv_lan", tipo: "casilla",
    etiqueta: "LAN Game", pordefecto: false,
    porQueNo: "there is no Steam master to hide from: every game here is already local.",
  },
  {
    pestana: "Game", clave: "nombre", cvar: "hostname", tipo: "texto",
    etiqueta: "Hostname", pordefecto: "Master Sword: Rebirth Server",
    // `cvar_t host_name = { "hostname", "Half-Life", ... }` (host.cpp:50), pero
    // el motor lo pisa con la descripción del mod en cuanto arranca:
    // `Cvar_Set("hostname", gEntityInterface.pfnGetGameDescription())`
    // (sv_main.cpp:6291-6295). Por eso en la captura pone el nombre del mod y no
    // «Half-Life».
    fuente: "host.cpp:50, pisado en sv_main.cpp:6291-6295",
    // ESTA FILA ESTABA CONTADA COMO VIVA Y NO HACÍA NADA. El nombre de una
    // partida es de quien la sirve: `Partida.nombre` es lo que sale en la
    // columna «Servers» de la pestaña Lan (`src/vgui2/servidores.js:45`), y esa
    // partida la levanta `npm run servidor`, no este diálogo.
    porQueNo: "the game «Start» opens is local to this process; the name belongs " +
      "to whoever serves a game, and that is `npm run servidor`, another one.",
  },
  {
    pestana: "Game", clave: "maxJugadores", cvar: "maxplayers", tipo: "numero",
    etiqueta: "Max. players", pordefecto: 6, min: 1, max: 32,
    // El motivo de antes —«hasta que el port tenga cuentas»— era falso: las
    // cuentas no pintan nada aquí y el reparto de slots ya existe.
    fuente: "src/red/partida.js:199 reparte contra `red.maxJugadores`",
    porQueNo: "the slots are real and already shared out, but the number lives " +
      "in the server process (`protocolo.js:134`) and «Start» does not launch one.",
  },
  {
    pestana: "Game", clave: "clave", cvar: "sv_password", tipo: "texto",
    etiqueta: "Server password", pordefecto: "",
    fuente: 'sv_main.cpp:208 — cvar_t sv_password = {"sv_password", "", …}',
    porQueNo: "nothing to protect: this game is not reachable from outside the machine.",
  },
  {
    pestana: "Game", clave: "region", cvar: "sv_region", tipo: "desplegable",
    etiqueta: "Server Location (Steam)", opciones: [], pordefecto: "",
    porQueNo: "a Steam region for a server that is not on Steam.",
  },
  {
    pestana: "Game", clave: "votarHora", cvar: "ms_allowtimevote", tipo: "casilla",
    etiqueta: "Allow time change votes", pordefecto: true,
    fuente: 'svglobals.cpp:42 — {"ms_allowtimevote", "1", FCVAR_SERVER}',
    porQueNo: "voting needs other players to vote with.",
  },
  {
    pestana: "Game", clave: "pvp", cvar: "ms_pklevel", tipo: "casilla",
    etiqueta: "Allow Player vs Player", pordefecto: false,
    // No es una casilla en el motor: `ms_pklevel` tiene tres valores, y el
    // comentario de la línea lo dice —`// 1 == in town only`—. La ventana lo
    // aplana a sí/no, y se porta aplanado porque es lo que el jugador ve.
    fuente: 'svglobals.cpp:51 — {"ms_pklevel", "0"} // 1 == in town only',
    // El motivo de antes —«no hay un segundo jugador»— era impreciso: sí los
    // hay, contra `npm run servidor`. Lo que no hay es daño entre jugadores:
    // `ms_pklevel` no aparece en ningún sitio fuera de esta tabla.
    porQueNo: "players can meet, but nothing yet decides whether one may hurt " +
      "another: `ms_pklevel` is not read anywhere outside this table.",
  },
  {
    pestana: "Game", clave: "reiniciarTras", cvar: "ms_reset_time", tipo: "numero",
    etiqueta: "If Empty, reset after", pordefecto: 30, min: 0, max: 600,
    // OJO: el cvar vale 10 y la ventana enseña 30. Ver la cabecera.
    fuente: 'svglobals.cpp:45 — {"ms_reset_time", "10"}, pero el diálogo enseña 30',
    porQueNo: "the map does not reset yet: nothing respawns (see doc/MISIONES_33.md §8).",
  },
  {
    pestana: "Game", clave: "salirAlReiniciar", tipo: "casilla",
    etiqueta: "Quit server on reset", pordefecto: false,
    porQueNo: "there is no server process to quit: «Start» opens a local game, not a server.",
  },
  {
    pestana: "Game", clave: "guardarPersonajes", tipo: "desplegable",
    etiqueta: "Store Characters", opciones: ["On Client", "On Server", "3 On Server"],
    pordefecto: "3 On Server",
    // Sin cvar atado a propósito: ver la cabecera.
    //
    // El motivo de antes decía «no hay servidor donde guardarlos» y era FALSO:
    // `AlmacenRemoto` lo hace desde el 27. Lo que no hay es forma de elegirlo
    // desde aquí.
    fuente: "src/red/cliente.js, AlmacenRemoto; lo elige src/main.js:374-376",
    porQueNo: "«On Server» exists (AlmacenRemoto, since experiment 27), but which " +
      "store is used is decided by `?red=` when the page loads, before this window exists.",
  },
  {
    pestana: "Game", clave: "central", cvar: "ms_central_enabled", tipo: "casilla",
    etiqueta: "Enable Central Server", pordefecto: false,
    fuente: 'svglobals.cpp:67 — {"ms_central_enabled", "0", FCVAR_SERVER}',
    // Y hay una razón de más para dejarlo apagado, que ya está razonada en
    // `src/juego/servidor.js`: con el central apagado el motor deja usar
    // `ms_fake_hp` y `ms_fake_players`, o sea que apagado ES el modo de pruebas.
    porQueNo: "there is no central server, and with it off the engine allows the test cvars (util.cpp:911-944).",
  },
];

/**
 * Los de una pestaña, en orden.
 *
 * `enEscritorio` esconde los que llevan `soloEnNavegador`. Esconder una fila es
 * justo lo que esta ventana NO hace con los apagados —se ven y dicen por qué—,
 * y la diferencia es real: un apagado es trabajo que falta, y esto es un apaño
 * que **ya no tiene problema que resolver**. Enseñarlo apagado con el motivo
 * «esto es de la versión web» sería contarle al jugador de escritorio una
 * historia que no es la suya.
 */
export function deLaPestana(nombre, { enEscritorio = false } = {}) {
  return AJUSTES.filter((a) =>
    a.pestana === nombre && !(enEscritorio && a.soloEnNavegador));
}

export function porDefecto() {
  const v = {};
  for (const a of AJUSTES) v[a.clave] = a.pordefecto;
  return v;
}

/**
 * Cuántos ajustes hacen algo. Como en `ajustes.js`: se calcula, no se escribe,
 * para que no se quede viejo cuando uno se encienda.
 */
export function cuenta() {
  const vivos = AJUSTES.filter((a) => !a.porQueNo);
  return { total: AJUSTES.length, vivos: vivos.length, apagados: AJUSTES.length - vivos.length };
}

/**
 * LO QUE ENSEÑA LA FILA «Map» DE «Create Server».
 *
 * `< Random Map >` se queda delante porque es la primera entrada del original
 * y porque con un solo mapa sigue siendo verdad: al azar entre uno.
 *
 * El 47: **la lista de mapas ya no está aquí**. Está en `src/play/mapa.js`,
 * con el nombre por omisión y el validador, para que añadir Edana sea una
 * línea en un archivo y no tres en tres.
 */
export const MAPAS = Object.freeze(["< Random Map >", ...MAPAS_PORTADOS]);

/** Qué mapa toca. Con `< Random Map >`, uno de los de verdad. */
export function mapaElegido(valor, mapas = MAPAS) {
  const reales = mapas.filter((m) => !m.startsWith("<"));
  if (!reales.length) return null;
  if (!valor || valor.startsWith("<")) {
    return reales[Math.floor(Math.random() * reales.length)];
  }
  return reales.includes(valor) ? valor : reales[0];
}
