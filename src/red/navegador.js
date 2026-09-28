// EL ENLACE DEL NAVEGADOR: el `WebSocket` de la página con la forma que espera
// `ClienteDeRed`.
//
// Son veinte líneas y hacen falta porque el `WebSocket` del navegador y nuestra
// `Conexion` de Node no comparten interfaz —uno es `onmessage`, el otro es
// `al("mensaje")`— y lo que NO se quiere es que `cliente.js` sepa en cuál de los
// dos está corriendo. Ésa es la misma razón por la que `src/play/` no importa
// Three.js.
//
// Y aquí el navegador hace de oráculo: su `WebSocket` implementa el RFC de
// verdad, así que si nuestro apretón o nuestro marco estuvieran mal, esta
// conexión no se abre. Nuestro cliente de Node podría entenderse con nuestro
// servidor estando los dos equivocados igual; Chrome no.

/** La partida de casa: el puerto que levanta `npm run servidor`. */
export const PUERTO_POR_DEFECTO = 5210;

export function urlPorDefecto() {
  const sitio = globalThis.location?.hostname || "localhost";
  return `ws://${sitio}:${PUERTO_POR_DEFECTO}/juego`;
}

/**
 * Abre la conexión y devuelve el enlace.
 *
 * `al("mensaje")` y `al("cierre")`, `enviar()` y `cerrar()`: lo mismo que la
 * `Conexion` de Node, para que el cliente no distinga.
 */
export function enlaceDeNavegador(url = urlPorDefecto(), { espera = 8000 } = {}) {
  return new Promise((ok, mal) => {
    let ws;
    try { ws = new WebSocket(url); } catch (e) { mal(e); return; }
    const oyentes = { mensaje: new Set(), cierre: new Set() };
    const reloj = setTimeout(() => { try { ws.close(); } catch {} mal(new Error(`${url} no contestó en ${espera} ms`)); }, espera);
    ws.onmessage = (ev) => { for (const fn of oyentes.mensaje) fn(ev.data); };
    ws.onclose = (ev) => { for (const fn of oyentes.cierre) fn({ codigo: ev.code, motivo: ev.reason }); };
    // Un error antes de abrir es «no hay servidor»; después, el `onclose` ya lo
    // cuenta. Separarlos importa: lo primero hay que decírselo al jugador en la
    // pantalla de entrada, y lo segundo en medio de la partida.
    ws.onerror = () => { if (ws.readyState !== WebSocket.OPEN) { clearTimeout(reloj); mal(new Error(`no hay partida en ${url}`)); } };
    ws.onopen = () => {
      clearTimeout(reloj);
      ok({
        ws,
        url,
        enviar: (texto) => { if (ws.readyState === WebSocket.OPEN) ws.send(texto); },
        cerrar: (codigo = 1000, motivo = "") => { try { ws.close(codigo, motivo); } catch {} },
        al: (evento, fn) => {
          oyentes[evento]?.add(fn);
          return () => oyentes[evento]?.delete(fn);
        },
        get abierta() { return ws.readyState === WebSocket.OPEN; },
      });
    };
  });
}

/** La lista de partidas, por HTTP, del mismo sitio. */
export async function listarPartidas(url = urlPorDefecto()) {
  const http = url.replace(/^ws/, "http").replace(/\/juego$/, "/partidas");
  const r = await fetch(http).catch(() => null);
  if (!r?.ok) return [];
  return r.json().catch(() => []);
}
