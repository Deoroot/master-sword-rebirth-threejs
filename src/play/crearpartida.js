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

/** Las dos pestañas de la ventana, en el orden de la captura. */
export const PESTANAS = ["Server", "Game"];

/**
 * Los ajustes de la partida.
 *
 *   `cvar`     cómo se llama en el motor o en el mod.
 *   `fuente`   dónde está declarado, para poder volver a mirarlo.
 *   `porQueNo` vacío si el ajuste hace algo aquí; si no, por qué no puede.
 */
export const AJUSTES = [
  // ── Server ──────────────────────────────────────────────────────────────
  {
    pestana: "Server", clave: "mapa", cvar: "map", tipo: "desplegable",
    etiqueta: "#GameUI_Map", pordefecto: "< Random Map >",
    // El original lista todos los `.bsp` del juego. Aquí la lista la pone quien
    // monta la ventana, porque **sólo hay un mapa portado**: Gate City. Poner
    // los ciento y pico nombres del original haría una lista que miente.
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
  },
  {
    pestana: "Game", clave: "maxJugadores", cvar: "maxplayers", tipo: "numero",
    etiqueta: "Max. players", pordefecto: 6, min: 1, max: 32,
    porQueNo: "the host is the only player until the port has accounts.",
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
    porQueNo: "there is no second player to fight yet.",
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
    porQueNo: "a browser tab cannot close itself, same as «Quit» in the main menu.",
  },
  {
    pestana: "Game", clave: "guardarPersonajes", tipo: "desplegable",
    etiqueta: "Store Characters", opciones: ["On Client", "On Server", "3 On Server"],
    pordefecto: "3 On Server",
    // Sin cvar atado a propósito: ver la cabecera.
    porQueNo: "characters live in this browser's localStorage; there is no server to store them on.",
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

export function deLaPestana(nombre) {
  return AJUSTES.filter((a) => a.pestana === nombre);
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
 * LOS MAPAS QUE DE VERDAD SE PUEDEN ABRIR.
 *
 * Uno. El original lista todos los `.bsp` del juego —en la captura se ven
 * `aleyesu`, `aluhandra2`, `ara`, `b_castle`…— y aquí sólo está portado Gate
 * City. La lista se queda corta y lo dice, en vez de enseñar ciento y pico
 * nombres que no abrirían.
 *
 * `< Random Map >` se queda porque es la primera entrada del original y porque
 * con un solo mapa sigue siendo verdad: al azar entre uno.
 */
export const MAPAS = Object.freeze(["< Random Map >", "gatecity"]);

/** Qué mapa toca. Con `< Random Map >`, uno de los de verdad. */
export function mapaElegido(valor, mapas = MAPAS) {
  const reales = mapas.filter((m) => !m.startsWith("<"));
  if (!reales.length) return null;
  if (!valor || valor.startsWith("<")) {
    return reales[Math.floor(Math.random() * reales.length)];
  }
  return reales.includes(valor) ? valor : reales[0];
}
