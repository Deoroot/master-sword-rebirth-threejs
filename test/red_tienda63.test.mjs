// LA COMPRA POR EL CABLE, desde el lado del servidor — el 63.
//
// El 62 dejó la tienda en red «de sólo mirar»: el estante llegaba y comprar no
// hacía nada. La causa no estaba en ninguna de las dos piezas probadas —el
// modelo de tiendas desde el 44, la partida desde el 27— sino **entre ellas**,
// tres veces seguidas y las tres calladas:
//
//   1. `GuionDeNpc` no reenviaba `trato` a su entorno, así que el vendedor no
//      quedaba marcado y la guarda de `_trade` rechazaba al propio comprador
//      con «The vendor is busy.» (lo caza `test/juego_comercio62.test.mjs`);
//   2. el objeto se metía con un bucle `k < entregadas`, y `entregadas` es
//      `iBundleAmt`, que **vale 0 por omisión**: el bucle no daba ni una
//      vuelta. El servidor restaba el oro, decía «You receive Sharp Knife.» y
//      la mochila se quedaba igual;
//   3. y aunque la hubiera metido, **nadie se lo contaba al navegador**: el
//      cliente recibía su personaje una vez, al aparecer, y nunca más.
//
// Las tres son de la costura, así que el control entra por donde entra el
// juego: un `MENSAJE.TRADE` de verdad contra una `Partida` de verdad, y se
// mira lo que le llega al cliente por el buzón.

import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { MENSAJE } from "../src/red/protocolo.js";
import { Partida } from "../src/red/partida.js";
import { mundoLiso } from "../src/red/liso.js";
import { AlmacenMemoria } from "../src/juego/almacen.js";
import { Tiendas, Comercio } from "../src/play/tienda.js";

const APARICION = {
  mapa: "liso",
  nacimiento: { nombre: "el centro", escena: [0, 0.2, 0] },
  reaparicion: { nombre: "el centro", escena: [0, 0.2, 0] },
};

const CATALOGO = {
  objetos: [
    { id: "smallarms_knife", nombre: "Sharp Knife", valor: 15 },
    { id: "swords_longsword", nombre: "Long Sword", valor: 100 },
  ],
};

function buzon() {
  const dentro = [];
  return {
    dentro,
    enviar: (t) => dentro.push(JSON.parse(t)),
    ultimo: (tipo) => [...dentro].reverse().find((m) => m.t === tipo) ?? null,
    al: () => () => {},
  };
}

/**
 * Una partida con un vendedor MARCADO, que es el estado en el que llega un
 * `trade` de verdad: el guion ya abrió el trato al pulsar «Shop».
 *
 * `interacciones` se pone a mano porque la partida sólo la monta cuando hay
 * guiones y fauna, y aquí lo que se prueba es `_trade`, no el censo.
 */
async function conVendedor({ lote = 0, oro = 100 } = {}) {
  const mundo = await mundoLiso();
  const partida = new Partida({
    mundo, almacen: new AlmacenMemoria(), aparicion: APARICION,
    catalogo: CATALOGO, nombre: "tienda", oroInicial: oro,
  });
  const b = buzon();
  const c = partida.conectar(b, { nombre: "Ana" });
  await partida.recibir(c.id, { t: MENSAJE.CREAR, personaje: { nombre: "Ana" } });
  const lista = b.ultimo(MENSAJE.LISTA).personajes;
  await partida.recibir(c.id, { t: MENSAJE.ELEGIR, id: lista[0].id });

  const tiendas = new Tiendas();
  tiendas.crear("forja").anadir(CATALOGO.objetos[0], { cantidad: 3, coste: 100, lote });
  const comercio = new Comercio();
  comercio.abrir(30, c.sesion, { retrollamada: "trade" });
  partida.interacciones = { tiendas, comercio };
  return { partida, c, b };
}

const comprar = (partida, c) => partida.recibir(c.id, {
  t: MENSAJE.TRADE, que: "buy", quien: 30, tienda: "forja", id: "smallarms_knife",
});

describe("comprar por el cable (63)", () => {
  test("el oro baja, y lo baja el servidor", async () => {
    const { partida, c } = await conVendedor();
    const antes = c.sesion.personaje.oro;
    await comprar(partida, c);
    assert.equal(c.sesion.personaje.oro, antes - 15);
  });

  test("y el objeto entra en la mochila DEL SERVIDOR", async () => {
    // El fallo número 2: con `lote` a 0 —que es lo que trae casi toda línea de
    // tienda (npcscript.cpp:772-774)— el bucle `k < entregadas` no daba una
    // vuelta y esto se quedaba en 0.
    const { partida, c } = await conVendedor();
    const antes = c.sesion.personaje.objetos.length;
    await comprar(partida, c);
    assert.equal(c.sesion.personaje.objetos.length, antes + 1);
    assert.equal(c.sesion.personaje.objetos.at(-1).id, "smallarms_knife");
    assert.equal(c.sesion.personaje.objetos.at(-1).n, 1, "lote 0 entrega UNO");
  });

  test("un lote de 3 entrega UN objeto de cantidad 3, no tres objetos", async () => {
    // `pItem->iQuantity = psiStoreItem->iBundleAmt` (msmonsterserver.cpp:1895):
    // el lote es la CANTIDAD del objeto, no cuántos objetos hay. El segundo
    // caso del control de arriba, sin el cual «lote 0 entrega uno» y «entrega
    // uno siempre» son indistinguibles.
    const { partida, c } = await conVendedor({ lote: 3 });
    await comprar(partida, c);
    const objetos = c.sesion.personaje.objetos.filter((o) => o.id === "smallarms_knife");
    assert.equal(objetos.length, 1, "uno, no tres");
    assert.equal(objetos[0].n, 3);
  });

  test("y el cliente se entera: le llega su oro y su mochila", async () => {
    // El fallo número 3. Sin esto la compra funciona y no se ve, que para el
    // jugador es lo mismo que no funcionar.
    const { partida, c, b } = await conVendedor();
    await comprar(partida, c);
    const ficha = b.ultimo(MENSAJE.FICHA);
    assert.ok(ficha, "no llegó ningún MENSAJE.FICHA");
    assert.equal(ficha.oro, c.sesion.personaje.oro);
    assert.equal(ficha.objetos.length, c.sesion.personaje.objetos.length);
  });

  test("el estante de la PARTIDA baja, que es lo que ve el otro jugador", async () => {
    const { partida, c } = await conVendedor();
    await comprar(partida, c);
    assert.equal(partida.interacciones.tiendas.buscar("forja").linea("smallarms_knife").cantidad, 2);
  });

  // ── EL CERO CON SU CONTROL ───────────────────────────────────────────────
  test("y quien NO está en el trato no compra: sigue siendo «busy»", async () => {
    const { partida, c } = await conVendedor();
    // Se le quita el trato: ahora el vendedor atiende a otro.
    partida.interacciones.comercio.cerrar(30);
    partida.interacciones.comercio.abrir(30, { otro: true }, { retrollamada: "trade" });
    const antes = c.sesion.personaje.oro;
    await comprar(partida, c);
    assert.equal(c.sesion.personaje.oro, antes, "le han vendido sin estar en el trato");
  });
});
