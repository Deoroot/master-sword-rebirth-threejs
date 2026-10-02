// ENTRAR COMO ENTRA EL JUGADOR — experimento 59.
//
// La regla de la casa es «si su camino no pasa por `menuselect`, no cuenta», y
// llevaba desde el 36 sin cumplirse: **27 de las 33 sondas registradas
// abrían `?map=gatecity`**, que se salta el menú entero. Sólo dos escribían
// por qué.
//
// ── Por qué importa, y no es purismo ──────────────────────────────────────
//
// `?map=` no es un camino falso: es el `+map` de la línea de órdenes
// (`hl.exe +map gatecity`), y el motor lo tiene. Pero **no es por donde entra
// el jugador**, y las dos rutas no montan lo mismo:
//
//   - por `?map=` se carga el nivel y se arranca la sesión de una pasada;
//   - por el menú se carga el nivel **como fondo** —escena sí, partida no, que
//     es lo que decidió el 53—, y «Start» monta los 69 NPC y arranca la sesión
//     después, en ese orden y no al revés (el borde del 36: 5 610 ms).
//
// Una sonda que entra por `?map=` mide el primer montaje y nunca ve el
// segundo. Eso ya escondió un fallo entero: la fila «Map» del menú se
// apuntaba y no se aplicaba, y ninguna de las 27 podía verlo porque ninguna
// pasaba por la fila.
//
// ── Por qué esto es UNA función y no 27 copias ────────────────────────────
//
// Porque el camino del jugador cambia. Cambió en el 36 (apareció el menú), en
// el 50 (la fila se aplica y recarga) y en el 53 (el fondo dejó de ser una
// partida). Cada vez, veintitantas sondas se quedaron midiendo un juego que
// ya no existía y ninguna se puso roja. Con el camino en un sitio, el día que
// vuelva a cambiar se arregla una vez.

import { esNuestro } from "./mismo.mjs";
import { MAPA_POR_DEFECTO } from "../src/play/mapa.js";

/**
 * Abre el juego y llega hasta dentro por donde llega el jugador.
 *
 * Menú principal → «Establish a Kingdom» → la fila «Map» → «Start».
 *
 * **El mapa se elige a mano siempre**, incluso siendo el de por omisión: la
 * fila viene con `< Random Map >` y con dos portados dejarla sin tocar es una
 * moneda al aire. Ésa es la lección del 50, y vale igual aquí.
 *
 * Deja la página con el panel `newchar` abierto, que es donde deja el juego al
 * jugador: quien quiera un personaje llama a `probe.sesion.nuevo(...)` como
 * hacía antes. Lo que cambia es **cómo se llegó**, no lo que se mide.
 *
 * @param pag    la página de Playwright
 * @param PORT   el puerto del `vite` de esta sonda
 * @param mapa   cuál se elige en la fila «Map»
 * @returns      `{ url, recargo, mapa }` — `recargo` dice si «Start» navegó,
 *               que es lo que hace el motor al cambiar de nivel
 *               (`CL_Disconnect()` + `Host_Map()`, host_cmd.cpp:970 y :1021)
 */
export async function entrarPorElMenu(pag, PORT, {
  mapa = MAPA_POR_DEFECTO, timeout = 240000, antesDeTocarNada = null,
  extra = "", origen = null,
} = {}) {
  // SIN `?map=`. Es lo único que distingue esta entrada de la vieja.
  //
  // `extra` es para los parámetros que NO son el mapa y que el menú todavía
  // no sabe poner —`red=ws://…`, que es a lo que «Visit a Kingdom» llegará
  // algún día—. Van en la URL de partida y sobreviven, porque elegir el mapa
  // por omisión no recarga: sólo recarga cambiar de mapa.
  const base = origen ?? `http://localhost:${PORT}`;
  await pag.goto(`${base}/${extra ? `?${extra}` : ""}`, { waitUntil: "load" });
  await esNuestro(pag, PORT);
  await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout });

  // EL GANCHO DE ANTES DEL PRIMER CLIC.
  //
  // Hay cosas que sólo son verdad antes de que el jugador toque algo, y la
  // primera es el `AudioContext`: el navegador lo deja `suspended` hasta que
  // hay un gesto, y **las pulsaciones del menú son un gesto**. Con la entrada
  // vieja la sonda de sonido leía «suspended» porque no había pulsado nada
  // todavía; entrando por el menú lee «running», y tiene razón. Lo que hay
  // que hacer no es cambiar lo que se afirma, es medirlo donde vale.
  if (antesDeTocarNada) await antesDeTocarNada(pag);

  const menuALaVista = await pag.evaluate(() => !document.querySelector(".ms-menu")?.hidden);
  if (!menuALaVista) throw new Error("no hay menú principal: la entrada por el menú no existe");

  // Localizadores y no manejadores, por lo mismo que abajo: el menu se
  // repinta y un manejador guardado deja de estar en el DOM (61).
  await pag.waitForLoadState("load");
  await pag.locator(".ms-menu-op").filter({ hasText: /^Establish a Kingdom$/ }).first().click();
  await pag.waitForFunction(() => !!window.probe.vgui2.estado().crearServidor,
    null, { timeout: 30000 });

  // La fila «Map», con el ratón.
  await pag.click(".v2-desplegable");
  await pag.waitForSelector(".v2-lista-abierta > button", { timeout: 15000 });
  const fila = pag.locator(".v2-lista-abierta > button").filter({ hasText: new RegExp(`^${mapa}$`) });
  if (!(await fila.count())) throw new Error(`el desplegable no ofrece «${mapa}»`);
  await fila.first().click();
  await pag.waitForFunction(
    (m) => window.probe.vgui2.estado().crearServidor?.valores?.mapa === m,
    mapa, { timeout: 15000 });

  const antes = pag.url();
  // CON UN LOCALIZADOR Y NO CON MANEJADORES — experimento 61.
  //
  // Esto era un `for` sobre `await pag.$$(".v2-boton")` preguntando el
  // `textContent` de cada uno. Recorrer manejadores **mientras la página
  // navega** revienta: «Execution context was destroyed». Y aquí «Start»
  // navega siempre que el mapa elegido no sea el del fondo, o sea **siempre
  // que se elige el segundo mapa**. Con Gate City, que es el de por omisión,
  // no recarga y el bucle sobrevivía; el día que una sonda pidió Edana, se
  // cayó antes de medir nada.
  //
  // Un localizador se resuelve de una vez, en la página, y reintenta solo.
  // `noWaitAfter`: este clic PROVOCA la navegación, y sin esto Playwright se
  // espera a que se asiente con el manejador ya desprendido — «element was
  // detached from the DOM, retrying» y la entrada se cae a la mitad. Pasa sólo
  // cuando el mapa elegido no es el del fondo, o sea con el segundo mapa (61).
  await pag.locator(".v2-boton").filter({ hasText: /^Start$/ }).first()
    .click({ noWaitAfter: true });

  // Cambiar de mapa recarga la página; quedarse en el mismo, no. Las dos son
  // correctas, así que se espera a lo que de verdad importa —estar dentro— y
  // se informa de cuál pasó, en vez de exigir una de las dos.
  let recargo = true;
  try { await pag.waitForURL((u) => String(u) !== antes, { timeout: 8000 }); }
  catch { recargo = false; }
  if (recargo) await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout });

  // SE ESPERA AL EFECTO, NO A UN RELOJ. Montar los 69 NPC tarda 5 610 ms
  // medidos en el 36; un `waitForTimeout` se queda corto el día que el mapa
  // traiga más modelos, y entonces la sonda mide el instante de antes.
  await pag.waitForFunction(() => document.querySelector(".ms-menu")?.hidden === true,
    null, { timeout: 120000 });
  await pag.waitForFunction(() => window.probe.vgui.abierto() === "newchar",
    null, { timeout: 120000 });

  return { url: pag.url(), recargo, mapa };
}
