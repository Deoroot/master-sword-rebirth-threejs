// «CONNECT» EN LA PESTAÑA LAN ENTRA A LA PARTIDA, no vuelve al menú principal.
//
// En el motor conectar es entrar: el cliente carga el mapa del servidor y de
// ahí pasa a elegir personaje. Aquí «Connect» sólo ponía `?red=`, la página
// volvía con el menú principal delante y la conexión hecha por detrás, y quien
// se unía veía que «se desconecta al instante». Lo que se manda ahora es lo que
// deja «Start»: el mapa de la fila y `menu=1`.

import test from "node:test";
import assert from "node:assert/strict";
import { urlDeConexion } from "../src/red/navegador.js";
import { mapaPedido } from "../src/play/mapa.js";

test("la fila de una partida da una búsqueda con la dirección, SU mapa y `menu=1`", () => {
  const q = urlDeConexion({ url: "ws://localhost:5210/juego", mapa: "edana" });
  const p = new URLSearchParams(q);
  assert.equal(p.get("red"), "ws://localhost:5210/juego");
  assert.equal(p.get("map"), "edana");
  assert.equal(p.get("menu"), "1");
  // Y es un mapa PEDIDO para el arranque: sin eso la página se queda en el menú.
  assert.equal(mapaPedido(q).pedido, "edana");
  // El segundo caso: otro mapa da otra búsqueda (el del 50, el valor de reposo).
  assert.equal(new URLSearchParams(urlDeConexion({ url: "ws://x/juego", mapa: "gatecity" })).get("map"), "gatecity");
});

test("una fila sin dirección no navega, y un mapa que no es un nombre no se manda", () => {
  assert.equal(urlDeConexion(null), null);
  assert.equal(urlDeConexion({ mapa: "edana" }), null);
  const p = new URLSearchParams(urlDeConexion({ url: "ws://x/juego", mapa: "../etc" }));
  assert.equal(p.get("red"), "ws://x/juego");
  assert.equal(p.has("map"), false);
  assert.equal(p.has("menu"), false);
});
