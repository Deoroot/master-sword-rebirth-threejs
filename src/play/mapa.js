// QUÉ MAPA SE ESTÁ JUGANDO.
//
// Todo este puerto se construyó contra Gate City, y eso dejó `build/gatecity`
// escrito a mano en cuarenta sitios. Master Sword tiene **más de cien mapas** y
// el siguiente que hace falta es Edana, así que esto es el paso previo: un solo
// sitio que diga cuál es el de ahora y cómo se llama su carpeta.
//
// ── POR QUÉ HAY QUE VALIDAR EL NOMBRE, Y NO ES PARANOIA ──────────────────
//
// El mapa entra por `?map=`, que es la línea de órdenes del juego
// (`hl.exe +map <mapa>`), y de ahí sale una ruta que se le pasa a `fetch`. Sin
// validar, `?map=../../../algo` es un `fetch("build/../../../algo/malla.json")`
// y el navegador lo sigue tan contento.
//
// El filtro no se inventa: **es el del motor**. GoldSrc busca el mapa como
// `maps/<nombre>.bsp` dentro del sistema de archivos del juego y los nombres
// de mapa reales son minúsculas, dígitos y guion bajo — `gatecity`,
// `old_helena`, `hall_of_deralia`, `dridmars_pass`—. Cualquier otra cosa no es
// un mapa de Master Sword, así que rechazarla no quita nada y cierra la puerta.
//
// ── LO QUE ESTO NO ES ────────────────────────────────────────────────────
//
// **No es una lista de los mapas que existen.** Eso depende de qué se haya
// horneado en `build/`, que es del disco y no de aquí; lo pregunta quien pueda
// mirar. Esto sólo sabe **nombrar** y **validar**, que es lo que hace falta en
// los dos lados —el navegador y el servidor— y lo que permite que este archivo
// no importe nada, como el resto de `src/play/`.

/**
 * Con qué mapa se entra si nadie dice otra cosa.
 *
 * Sigue siendo Gate City, y seguirá siéndolo mientras sea el único horneado:
 * cambiar esta constante sin hornear el otro mapa da una pantalla de error, no
 * otro mapa. Está **aquí y en un solo sitio** para que el día que Edana entre
 * sea una línea y no cuarenta.
 */
export const MAPA_POR_DEFECTO = "gatecity";

/**
 * LOS MAPAS QUE ESTE PUERTO SABE ABRIR.
 *
 * Uno. El original lista todos los `.bsp` del juego —en la captura de «Create
 * Server» se ven `aleyesu`, `aluhandra2`, `ara`, `b_castle`…— y aquí sólo hay
 * Gate City. La lista se queda corta y lo dice, en vez de enseñar ciento y pico
 * nombres que no abrirían.
 *
 * **No se comprueba contra el disco**, y no se puede: el navegador no lista
 * carpetas y `build/` no se publica. O sea que esta lista es una promesa, no
 * una medida — un nombre aquí sin su `npm run <mapa>` da una pantalla de error.
 * Es el precio de que añadir Edana sea una línea.
 *
 * ── CORRECCIÓN DEL 50: son dos, y la línea era de verdad una línea ────────
 *
 * El 48 dejó Edana fuera **a propósito**, y lo dijo con su motivo: ofrecerla
 * sería prometer un pueblo sin NPC, porque las herramientas que extraen
 * bichos, guiones y menús seguían escribiendo todas en `build/gatecity`.
 *
 * Ese motivo **ya no es cierto**, y no por una opinión: `build/edana` trae hoy
 * 42 colocaciones de NPC —las 42 con su guion—, 139 guiones y sus menús, y los
 * recursos que no son de un mapa viven en `build/msr`, que es de los dos. Lo
 * que el 48 llamaba «un mapa que se anda y nada más» tiene pueblo.
 *
 * Lo que sigue siendo verdad es la frase de arriba: **esto es una promesa**.
 * Quien añada el tercero hornea primero y lo mide por el menú después; el
 * `sonda:edana50` es exactamente esa medida para éste.
 *
 * ── EL TERCERO, DEL 78 ──────────────────────────────────────────────────────
 *
 * `gertenheld_forest2` entra por un motivo concreto y no por tener más: es el
 * único mapa del juego donde **los dos tipos de `ms_npcscript` que faltaban
 * cuelgan de un `trigger_once` sin nombre**, o sea del pie del jugador. El 77
 * dejó los tipos 1 y 3 escritos y declarados PENDIENTES porque ni Gate City ni
 * Edana tienen uno solo (15 y 10 en el resto del juego), y un control que no
 * se puede recorrer no se cuenta. Éste se recorre: `sondas/gertenheld78.mjs`.
 *
 * Lo que trae horneado: 74 colocaciones de NPC, 18 guiones, su aparición y su
 * sonido. Lo que NO trae es `menus.json`, y no es un hueco: el juego no tiene
 * carpeta `scripts/gertenheld_forest2` —la vecina es `gertenheld_cave`—, así
 * que este mapa no declara menús de NPC. `src/play/json.js` ya da por bueno
 * que ese archivo falte.
 */
export const MAPAS_PORTADOS = Object.freeze(["gatecity", "edana", "gertenheld_forest2"]);

/**
 * LOS MAPAS QUE PUEDEN SALIR DETRÁS DEL MENÚ PRINCIPAL.
 *
 * El gemelo de `uiStatic.bgmaps` de Xash3D (`mainui/BaseMenu.cpp:547-581`).
 * **Los nombres viven aquí y no en `src/play/fondomenu.js`**, que es quien los
 * usa, porque este archivo es la única excepción de la regla del 47: en
 * `src/play/` y `src/bsp/` no se escribe el nombre de un mapa fuera de un
 * comentario (`test/juego_mapa47.test.mjs`). Lo que sabe de nombres de mapa
 * está en un sitio, y éste es el sitio.
 *
 * La otra salida —indexar `MAPAS_PORTADOS[0]`— deja un agujero mudo: quien
 * reordene esa lista mueve el fondo del menú a otro mapa y no falla nada,
 * porque sigue siendo una lista de uno y sigue siendo un mapa portado. Eso es
 * el apartado 4 con otra ropa, así que el nombre se escribe.
 *
 * Es una lista y no un nombre porque el motor elige al azar entre varios
 * (`BaseMenu.cpp:571`). **Vaciarla es legal**: sin fondo se enseña la pintura
 * del mod, que es lo que hace el original al no traer lista.
 */
export const FONDOS_DEL_MENU = Object.freeze(["gatecity"]);

/** La carpeta donde `tools/` deja lo extraído. Nunca se commitea. */
export const RAIZ = "build";

/**
 * Un nombre de mapa de GoldSrc: minúsculas, dígitos y guion bajo, y con algo
 * dentro. Ni barras, ni puntos, ni mayúsculas.
 */
export const NOMBRE_VALIDO = /^[a-z0-9_]+$/;

/** Un tope, para que un nombre absurdo no acabe en una ruta absurda. */
export const LARGO_MAXIMO = 64;

/** ¿Es esto el nombre de un mapa? */
export function esNombreDeMapa(nombre) {
  const n = String(nombre ?? "");
  return n.length > 0 && n.length <= LARGO_MAXIMO && NOMBRE_VALIDO.test(n);
}

/**
 * El mapa que pide una cadena de búsqueda —`"?map=edana"`, o la de
 * `location.search`—, o el de por defecto.
 *
 * **Un nombre que no vale NO cae al de por defecto en silencio**: eso
 * escondería una errata detrás de un mapa que sí carga, y quien escribe
 * `?map=Gatecity` con mayúscula se pasaría media hora sin entender por qué el
 * mapa que ve no es el que pidió. Devuelve el motivo y quien llame decide.
 *
 * @returns `{ mapa, pedido, porQueNo }` — `porQueNo` es `null` cuando todo
 *          fue bien, y si no, el texto que se le enseña a quien lo escribió.
 */
export function mapaPedido(busqueda = "", porDefecto = MAPA_POR_DEFECTO) {
  let pedido = null;
  try {
    // Con o sin la interrogación delante; `URLSearchParams` acepta las dos.
    pedido = new URLSearchParams(String(busqueda ?? "")).get("map");
  } catch { pedido = null; }
  if (pedido === null || pedido === "") return { mapa: porDefecto, pedido: null, porQueNo: null };
  if (!esNombreDeMapa(pedido)) {
    return {
      mapa: porDefecto,
      pedido,
      porQueNo: `«${pedido}» no es un nombre de mapa: sólo minúsculas, dígitos y guion bajo.`,
    };
  }
  return { mapa: pedido, pedido, porQueNo: null };
}

/**
 * La carpeta de lo extraído de un mapa: `build/gatecity`.
 *
 * **Sin barra al final**, porque es lo que esperan los `base` de
 * `src/render/` y `src/red/`, que ya venían parametrizados y sólo tenían mal
 * el valor por omisión. Quien necesite la barra —`cargarEsquema`— la pone.
 */
export function baseDe(mapa = MAPA_POR_DEFECTO) {
  const n = String(mapa ?? "");
  if (!esNombreDeMapa(n)) throw new Error(`«${n}» no es un nombre de mapa`);
  return `${RAIZ}/${n}`;
}

/**
 * Una ruta dentro de la carpeta del mapa: `rutaDe("gatecity", "bichos.json")`.
 *
 * Los trozos se juntan con barras y **se comprueba que ninguno salga de la
 * carpeta**, que es la otra mitad de la validación: el nombre del mapa viene
 * de fuera, pero un trozo también puede venir de un manifiesto.
 */
export function rutaDe(mapa, ...partes) {
  const base = baseDe(mapa);
  const trozos = partes.flat().filter((p) => p !== null && p !== undefined && p !== "").map(String);
  for (const t of trozos) {
    if (t.startsWith("/") || t.includes("..")) throw new Error(`«${t}» se sale de la carpeta del mapa`);
  }
  return [base, ...trozos].join("/").replace(/\/{2,}/g, "/");
}
