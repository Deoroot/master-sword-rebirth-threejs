// EL PUENTE ENTRE LA CÁSCARA Y EL JUEGO.
//
// Es `.cjs` y no `.js` a propósito: `package.json` dice `"type": "module"`, así
// que un `.js` aquí sería ESM, y una precarga en caja de arena (`sandbox: true`)
// se carga como CommonJS. La extensión es lo que lo decide.
//
// ── Por qué esto es tan corto ──────────────────────────────────────────────
//
// Porque el juego no necesita nada del escritorio. Sigue cargando sus recursos
// por `fetch` contra el servidor de `escritorio/servidor.js`, igual que contra
// Vite. Lo único que hace falta es que **el juego sepa que no está en un
// navegador**, y eso es un dato, no una capacidad.
//
// Lo que NO se expone, y conviene que se vea escrito: ni `require`, ni `fs`, ni
// `ipcRenderer` entero. Si algún día el juego necesita leer un archivo del
// disco —elegir la carpeta de `../MSC/`, por ejemplo— se añade **un** método
// con nombre propio, no una puerta general.

const { contextBridge, ipcRenderer } = require("electron");

/**
 * `window.escritorio` existe si y sólo si el juego corre en la cáscara.
 *
 * Quien lo pregunta es `src/juego/navegador.js`, que es el archivo que avisa de
 * las teclas que el navegador se queda. En escritorio no se queda ninguna, así
 * que esos avisos sobran — y un aviso que no es verdad es peor que no avisar.
 */
contextBridge.exposeInMainWorld("escritorio", Object.freeze({
  /** Para los informes de las sondas y para el «about». */
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  plataforma: process.platform,

  /**
   * CERRAR EL JUEGO. Es el «Quit» del menú principal, que llevaba apagado todo
   * el port porque una pestaña no puede cerrarse a sí misma.
   *
   * Tiene nombre propio y no es `ipcRenderer.send` a secas: es exactamente lo
   * que decía la cabecera de este archivo —si hace falta una capacidad, se añade
   * **un** método con nombre, no una puerta general—. Desde el juego sólo se
   * puede pedir esto, y nada más.
   *
   * Y **no pregunta**: la confirmación es del juego, con su ventana. Esto es el
   * tirador, no la decisión.
   */
  salir() { ipcRenderer.send("msr:salir"); },
}));
