// LAS TECLAS QUE NO SON NUESTRAS, y qué se puede hacer al respecto.
//
// **Este archivo es NUESTRO entero.** No porta nada: Master Sword es un juego de
// escritorio y no tiene este problema, así que aquí no hay ninguna cita del
// motor y no debe aparecer ninguna. Lo que hay es el precio de publicar en el
// navegador, escrito en un sitio en vez de repartido por `main.js`.
//
// ── El problema, con nombre y apellido ─────────────────────────────────────
//
// `config.cfg:15` dice `bind "CTRL" "+duck"`, y eso es un hecho del juego que
// `src/juego/teclas.js` respeta. Pero **agacharse y avanzar a la vez es Ctrl+W**,
// que en un navegador cierra la pestaña. Y agacharse-y-avanzar no es una
// rareza: es cómo se sube a los sitios estrechos en Half-Life desde 1998.
//
// Lo que hay que entender antes de intentar arreglarlo es que
// **`preventDefault()` NO sirve para esto**. Los atajos de la ventana —cerrar
// pestaña, abrir pestaña, abrir ventana, la barra de direcciones, F11, F12— los
// atiende el navegador ANTES de que el evento sea cancelable, y en una página
// normal no hay forma de quedárselos. Da lo mismo cuántos `preventDefault` se
// pongan: con Ctrl+W la pestaña se cierra y el `keydown` que llegó no sirve de
// nada porque ya no hay a quién avisar.
//
// ── La única salida de verdad: pantalla completa + Keyboard Lock ───────────
//
// Hay **una** manera de que el navegador ceda esas teclas, y es la API de
// Keyboard Lock (`navigator.keyboard.lock()`), que existe justo para los juegos.
// Tiene dos condiciones que conviene no esconder:
//
//   1. **Sólo funciona en pantalla completa.** Fuera de ella la llamada se
//      rechaza, y es deliberado: ninguna página debería poder quitarle a nadie
//      el «cerrar pestaña» sin que se note en qué estado está.
//   2. **Es de Chromium.** Firefox y Safari no la traen. Ahí no hay arreglo
//      posible, sólo un aviso y la posibilidad de reasignar la tecla.
//
// O sea que la respuesta honesta al «el navegador me cierra la pestaña» es:
// pantalla completa y se arregla; fuera de ella no se arregla, se avisa. Eso es
// lo que hace este archivo, y por eso `avisoDeReservadas()` existe: más vale
// decirle al jugador lo que va a pasar que dejar que lo descubra perdiendo la
// partida.

/**
 * Las teclas que el navegador se queda, y con qué modificador.
 *
 * No es una lista exhaustiva de todos los navegadores del mundo —no existe— sino
 * las que un jugador de esto va a pulsar sin querer. `modificador` es el que
 * hace falta para que el atajo exista; `null` quiere decir que la tecla sola ya
 * es del navegador.
 *
 * Sirve para dos cosas distintas y las dos importan: avisar mientras se juega, y
 * que el panel de opciones pueda decir «esa tecla no te va a funcionar» en el
 * momento de asignarla, que es cuando se puede hacer algo.
 */
export const RESERVADAS = Object.freeze([
  { codigo: "KeyW", modificador: "ctrl", que: "closes the tab" },
  { codigo: "KeyT", modificador: "ctrl", que: "opens a new tab" },
  { codigo: "KeyN", modificador: "ctrl", que: "opens a new window" },
  { codigo: "KeyL", modificador: "ctrl", que: "jumps to the address bar" },
  { codigo: "KeyJ", modificador: "ctrl", que: "opens downloads" },
  { codigo: "KeyP", modificador: "ctrl", que: "opens the print dialog" },
  { codigo: "KeyS", modificador: "ctrl", que: "opens the save dialog" },
  { codigo: "KeyD", modificador: "ctrl", que: "bookmarks the page" },
  { codigo: "KeyF", modificador: "ctrl", que: "opens find-in-page" },
  { codigo: "KeyR", modificador: "ctrl", que: "reloads" },
  { codigo: "KeyH", modificador: "ctrl", que: "opens history" },
  // Las de función que el navegador usa sin modificador. Ya estaban dichas en
  // `teclas.js` —de ahí el segundo `bind` de las cinco primeras ranuras— y aquí
  // se repiten porque el panel de opciones pregunta a este archivo, no a aquél.
  { codigo: "F11", modificador: null, que: "toggles fullscreen" },
  { codigo: "F12", modificador: null, que: "opens developer tools" },
  { codigo: "F5", modificador: null, que: "reloads" },
  { codigo: "F3", modificador: null, que: "opens find-in-page" },
  { codigo: "F1", modificador: null, que: "opens help in some browsers" },
  // La Escape no cierra nada, pero suelta el puntero, y eso aquí ES el problema
  // equivalente: el jugador pierde el control de la cámara. Se deja en la lista
  // porque quien reasigne algo a la Escape tiene que saberlo.
  { codigo: "Escape", modificador: null, que: "releases the mouse" },
]);

/** Por `code`, para no recorrer la lista en cada tecla. */
const PORCODIGO = new Map(RESERVADAS.map((r) => [r.codigo, r]));

/**
 * ¿Esta asignación se la va a comer el navegador? Para el panel de opciones.
 *
 * Devuelve la entrada de `RESERVADAS` o `null`. Ojo con lo que significa un
 * `modificador` no nulo: la tecla **sola sí funciona**. Asignar la W a avanzar
 * está perfecto; el problema aparece cuando además hay un Ctrl pulsado, y ese
 * Ctrl viene de OTRA acción. Por eso esto no basta y hace falta lo de abajo.
 */
export function reservada(codigo, { enEscritorio = enLaCascara() } = {}) {
  if (enEscritorio) return null;    // en la cáscara no hay ninguna reservada
  return PORCODIGO.get(codigo) ?? null;
}

/**
 * ¿Corremos dentro de la cáscara de escritorio?
 *
 * Se lee de `window.escritorio`, que pone `escritorio/precarga.cjs`. Es el único
 * sitio del proyecto que lo consulta por su cuenta en vez de recibirlo, y tiene
 * motivo: **este archivo entero trata del precio de publicar en el navegador**,
 * así que la pregunta «¿hay navegador?» es su asunto y no el de quien lo llama.
 *
 * Las dos funciones públicas dejan pasarlo como parámetro igualmente, porque una
 * prueba de Node tiene que poder afirmar las dos ramas sin inventarse un
 * `globalThis` — que es la trampa del 59: construir el argumento que el llamador
 * se equivoca al pasar.
 */
export function enLaCascara() {
  return Boolean(globalThis.escritorio);
}

/**
 * El choque de verdad: dos acciones que por separado están bien y juntas no.
 *
 * Se le pasa el mapa de teclas (`teclas.mapa`) y contesta la lista de parejas
 * que van a acabar en un atajo del navegador. Con los valores por defecto del
 * juego devuelve una: agacharse (Ctrl) con avanzar (W), que cierra la pestaña.
 *
 * Esto es lo que hay que enseñar, y no la lista de arriba: «Ctrl + W» a secas no
 * le dice nada a nadie, «Duck + Move Forward» sí.
 */
export function choques(mapa = {}, acciones = []) {
  const nombreDe = (clave) => acciones.find((a) => a.clave === clave)?.nombre ?? clave;
  const modificadores = {
    ctrl: ["ControlLeft", "ControlRight"],
    alt: ["AltLeft", "AltRight"],
  };
  const fuera = [];
  for (const r of RESERVADAS) {
    // La acción que tiene la tecla del atajo. Sin ella no hay choque posible.
    const conLaTecla = Object.keys(mapa).find((k) => mapa[k] === r.codigo);
    if (!conLaTecla) continue;
    if (!r.modificador) { fuera.push({ ...r, acciones: [nombreDe(conLaTecla)] }); continue; }
    const codigos = modificadores[r.modificador] ?? [];
    for (const k of Object.keys(mapa)) {
      if (!codigos.includes(mapa[k])) continue;
      fuera.push({ ...r, acciones: [nombreDe(k), nombreDe(conLaTecla)] });
    }
  }
  return fuera;
}

/** ¿Está el documento en pantalla completa? */
export function enPantallaCompleta(doc = globalThis.document) {
  return Boolean(doc?.fullscreenElement);
}

/** ¿Tiene este navegador la API que hace falta? Chromium sí, los demás no. */
export function hayAtrapaTeclado(nav = globalThis.navigator) {
  return typeof nav?.keyboard?.lock === "function";
}

let atrapado = false;

/** ¿Están las teclas del navegador en nuestras manos ahora mismo? */
export function tecladoAtrapado() { return atrapado; }

/**
 * Pide pantalla completa y, con ella, las teclas.
 *
 * Las dos cosas van juntas a propósito: pedir el teclado sin pantalla completa
 * se rechaza siempre, así que ofrecer las dos por separado sería ofrecer un
 * botón que no funciona. Hay que llamarlo desde un gesto del usuario.
 *
 * Devuelve qué se consiguió, sin lanzar: que no haya pantalla completa o que el
 * navegador no traiga Keyboard Lock **no es un error del juego**, es el sitio
 * donde se está jugando, y quien llama decide qué contarle al jugador.
 */
export async function atraparTeclado(nodo, nav = globalThis.navigator) {
  const salida = { pantallaCompleta: false, teclado: false, porque: "" };
  try {
    if (!enPantallaCompleta()) await nodo?.requestFullscreen?.();
    salida.pantallaCompleta = enPantallaCompleta();
  } catch (e) {
    salida.porque = "fullscreen refused";
    return salida;
  }
  if (!salida.pantallaCompleta) { salida.porque = "not in fullscreen"; return salida; }
  if (!hayAtrapaTeclado(nav)) { salida.porque = "no Keyboard Lock in this browser"; return salida; }
  try {
    // Sin argumentos se piden TODAS las teclas que el navegador esté dispuesto a
    // ceder. Pasar una lista concreta parece más prudente y es peor: habría que
    // mantenerla al día con las reasignaciones del jugador, y la que se olvide
    // es justo la que le cierre la pestaña.
    await nav.keyboard.lock();
    atrapado = true;
    salida.teclado = true;
  } catch (e) {
    salida.porque = String(e?.message ?? e);
  }
  return salida;
}

/** Devuelve las teclas al navegador. Al salir de pantalla completa se cae solo. */
export function soltarTeclado(nav = globalThis.navigator) {
  try { nav?.keyboard?.unlock?.(); } catch { /* da igual: se suelta al salir */ }
  atrapado = false;
}

/**
 * El aviso, en inglés porque es interfaz, y **una sola vez**.
 *
 * Se dispara cuando el jugador pulsa un modificador que forma atajo, no cuando
 * el atajo se completa: con Ctrl+W no hay segunda oportunidad —el `keydown`
 * llega y la pestaña se cierra— así que avisar después no avisa de nada.
 *
 * Devuelve el texto, o `null` si no toca decir nada. Quien lo llama lo manda al
 * HUD; este archivo no sabe qué es un HUD.
 */
export function avisoDeReservadas({ mapa = {}, acciones = [], yaAvisado = false,
                                    enEscritorio = enLaCascara() } = {}) {
  // EN LA CÁSCARA NO HAY NADA QUE AVISAR, y avisar igual sería mentir.
  //
  // Esto ya estaba prometido —y escrito— en `escritorio/precarga.cjs`: *«quien
  // lo pregunta es src/juego/navegador.js […] en escritorio no se queda ninguna,
  // así que esos avisos sobran — y un aviso que no es verdad es peor que no
  // avisar»*. La promesa estaba, la línea que la cumple no: hasta el 74 el juego
  // de escritorio seguía diciéndole al jugador que Ctrl+W le cerraría la pestaña
  // y que se pusiera en pantalla completa para evitarlo. No hay pestaña, y las
  // teclas son suyas desde que el 72 quitó el menú de aplicación.
  if (enEscritorio) return null;
  if (yaAvisado || atrapado) return null;
  const lista = choques(mapa, acciones).filter((c) => c.modificador === "ctrl" && c.acciones.length === 2);
  if (!lista.length) return null;
  const cual = lista[0];
  return `${cual.acciones.join(" + ")} ${cual.que} in a browser tab. ` +
    "Go fullscreen to play with the game's own keys.";
}
