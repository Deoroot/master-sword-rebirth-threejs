// EL MENÚ PRINCIPAL: qué opciones hay, cuáles se ven y cuáles hacen algo.
//
// La lista sale de `resource/gamemenu.res` y la hornea `tools/menu.mjs`. Aquí
// está lo que el motor hace con ella, que es poco pero no es nada.
//
// ── Las banderas ────────────────────────────────────────────────────────────
//
// Cada entrada puede traer `OnlyInGame` y `notmulti`, y el motor las usa para
// esconderla. «Resume game» y «Disconnect» sólo valen con una partida delante;
// las de un jugador —New/Load/Save Game— están comentadas en el archivo, o sea
// que `notmulti` no esconde hoy ninguna: sobrevive como bandera sin uso, y se
// porta igual porque descomentar una línea la despierta.
//
// ── Y tres entradas están EN BLANCO ─────────────────────────────────────────
//
// Los números 3, 7 y 11 no tienen ni etiqueta ni comando. No son un error: son
// los separadores, y el 3 además lleva `OnlyInGame`, con lo que el hueco
// aparece y desaparece con la partida. Filtrarlas por «tiene comando» junta
// todas las opciones en un bloque y el menú deja de parecerse.

/**
 * Qué comandos de `gamemenu.res` sabemos hacer hoy, y cuáles no.
 *
 * Esto NO viene del juego: es nuestro inventario de lo que hay montado. Va
 * aparte a propósito, para que se lea de un vistazo qué falta y para que el día
 * que haya servidores no haya que tocar el menú, sólo esta tabla.
 */
export const COMANDOS = Object.freeze({
  ResumeGame: { que: "cerrar", sirve: true },
  Disconnect: { que: "desconectar", sirve: true },
  // No hay ni lista de servidores ni forma de montar uno: el demo es una
  // partida local. Se dejan VISIBLES y apagadas, que es más honesto que
  // borrarlas del menú del juego.
  OpenServerBrowser: { que: "servidores", sirve: false, porque: "todavía no hay servidores" },
  OpenCreateMultiplayerGameDialog: { que: "crearPartida", sirve: false, porque: "todavía no hay servidores" },
  // «Name Character» y «Options» llevan las dos a `OpenOptionsDialog` en el
  // archivo del juego. Aquí se separan por la ETIQUETA, no por el comando, para
  // que nombrar al personaje abra lo que dice que abre.
  OpenOptionsDialog: { que: "opciones", sirve: true },
  // Un navegador no cierra su propia pestaña si no la abrió él
  // (`window.close()` no hace nada), así que ésta no puede funcionar y no se
  // finge que sí.
  Quit: { que: "salir", sirve: false, porque: "un navegador no cierra su pestaña" },
});

/** La etiqueta «Name Character» va a otro sitio aunque el comando sea el mismo. */
export const POR_ETIQUETA = Object.freeze({ "Name Character": "nombrar" });

/**
 * Las entradas que se ven ahora mismo, en el orden del archivo.
 *
 * `enJuego` es si hay una partida cargada detrás del menú.
 */
export function entradasVisibles(entradas, { enJuego = false, multijugador = true } = {}) {
  return entradas.filter((e) => {
    if (e.soloEnJuego && !enJuego) return false;
    if (e.noMulti && multijugador) return false;
    return true;
  });
}

/** Qué hace una entrada: `{ que, sirve, porque }`, o el separador. */
export function quehace(entrada) {
  if (!entrada.comando && !entrada.etiqueta) return { que: "separador", sirve: true };
  const porEtiqueta = POR_ETIQUETA[entrada.texto ?? entrada.etiqueta];
  if (porEtiqueta) return { que: porEtiqueta, sirve: true };
  return COMANDOS[entrada.comando] ?? { que: null, sirve: false, porque: `no sé hacer '${entrada.comando}'` };
}

/**
 * Moverse con el teclado: el siguiente que se pueda elegir, saltando los
 * separadores. `paso` es +1 o −1 y da la vuelta.
 *
 * Devuelve el índice dentro de `lista`, o −1 si no hay ninguno elegible — que
 * pasa de verdad: sin partida y sin servidores, un menú de puros separadores.
 */
export function siguienteElegible(lista, desde, paso) {
  const n = lista.length;
  if (!n) return -1;
  for (let i = 1; i <= n; i++) {
    const j = ((desde + paso * i) % n + n) % n;
    if (quehace(lista[j]).que !== "separador") return j;
  }
  return -1;
}
