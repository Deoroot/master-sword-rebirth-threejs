// COMPRAR Y VENDER. `src/play/tienda.js` (60).
//
// El 44 portó el catálogo —qué hay, a cuánto— y dejó escrito que el comercio
// no estaba. Esto es el comercio: los dos `TradeItem` que se llaman en cadena,
// con el orden de sus rechazos.
//
// LO QUE HAY QUE PROBAR AQUÍ NO ES «se compra». Es el ORDEN, porque es lo
// único que un jugador puede notar y lo único que no se deduce leyendo:
//
//   - el vendedor rechaza EN SILENCIO y el cliente con aviso;
//   - el dinero se comprueba ANTES que el estante, así que sin oro delante de
//     una tienda vacía oyes «no te lo puedes permitir» y no «no queda»;
//   - y el guardia del estante que parece repetido no lo es: es un parche de
//     2012 contra comprar por consola, y por eso está donde está.

import test, { describe } from "node:test";
import assert from "node:assert/strict";

import {
  Tienda, comprar, vender, tituloDeLaTienda, precioDe,
  NO_TE_LO_PUEDES_PERMITIR, NO_LE_QUEDAN, LO_RECIBES, LO_VENDES,
  TEXTO_COSTE, TEXTO_VALOR, TEXTO_VENDIENDO, NO_VALE_NADA,
  SUBTITULO_COMPRAR, SUBTITULO_VENDER, SUBTITULO_INVENTARIO,
  INVENTARIO, RATIO_MAXIMO,
} from "../src/play/tienda.js";

/** Una tienda con una línea, como la deja `addstoreitem`. */
function conUna({ valor = 100, cantidad = 5, coste = 100, ratio = 0.25, lote = 0 } = {}) {
  const t = new Tienda("prueba");
  t.anadir({ id: "cosa", valor }, { cantidad, coste, ratio, lote });
  return t;
}

describe("comprar: el orden de los cuatro noes", () => {
  test("con oro y existencias, se compra", () => {
    const r = comprar(conUna(), "cosa", { oro: 500 });
    assert.equal(r.que, "compra");
    assert.equal(r.precio, 100);
    assert.equal(r.aviso, "You receive cosa.");
  });

  test("sin oro: «You can't afford», y con el nombre que se le pase", () => {
    const r = comprar(conUna(), "cosa", { oro: 99, nombre: "Leather Armor" });
    assert.equal(r.que, "sin oro");
    assert.equal(r.aviso, "You can't afford Leather Armor.");
    // El precio va en la respuesta aunque no se compre: es lo que el jugador
    // necesita saber para volver con dinero.
    assert.equal(r.precio, 100);
  });

  test("agotada: «Vendor out of item»", () => {
    const r = comprar(conUna({ cantidad: 0 }), "cosa", { oro: 500 });
    assert.equal(r.que, "agotado");
    assert.equal(r.aviso, "Vendor out of item: cosa.");
  });

  test("EL ORDEN: sin oro Y agotada gana «no te lo puedes permitir»", () => {
    // Éste es el control que vale. El otro orden es el que uno escribiría
    // —primero «¿queda?», luego «¿te llega?»— y el motor hace el contrario,
    // porque el guardia del estante es un parche que se añadió en 2012 y se
    // metió detrás. Si alguien lo «arregla», esto se pone rojo.
    const r = comprar(conUna({ cantidad: 0 }), "cosa", { oro: 0 });
    assert.equal(r.que, "sin oro");
    assert.notEqual(r.que, "agotado");
  });

  test("sin sitio: no se compra y NO se dice nada", () => {
    // El motor no imprime aquí: los avisos de «no te cabe» los saca
    // `NewItemHand` con su `verbose`, que es otro sitio. Un aviso inventado
    // aquí sería texto que el juego no dice.
    const r = comprar(conUna(), "cosa", { oro: 500, cabe: false });
    assert.equal(r.que, "no cabe");
    assert.equal(r.aviso, null);
  });

  test("y el sitio se mira ANTES que el dinero", () => {
    // :5911 va antes de :5914. Sin oro y sin sitio, el jugador no oye nada.
    const r = comprar(conUna(), "cosa", { oro: 0, cabe: false });
    assert.equal(r.que, "no cabe");
    assert.equal(r.aviso, null);
  });

  test("una línea que el vendedor no tiene: silencio", () => {
    const r = comprar(conUna(), "otra", { oro: 500 });
    assert.equal(r.que, "no la tiene");
    assert.equal(r.aviso, null);
  });

  test("y una tienda que no existe tampoco revienta", () => {
    assert.equal(comprar(null, "cosa", { oro: 5 }).que, "no la tiene");
  });
});

describe("el lote por omisión vale CERO, y eso se nota", () => {
  test("con lote 0 el guardia del vendedor nunca para nada", () => {
    // `Quantity >= iBundleAmt` con `iBundleAmt` 0 es `Quantity >= 0`, cierto
    // siempre — incluso con el estante a cero. Quien para la venta es el
    // guardia de después.
    const r = comprar(conUna({ cantidad: 0 }), "cosa", { oro: 500 });
    assert.notEqual(r.que, "no la tiene", "el guardia del vendedor ha parado, y no debería");
    assert.equal(r.que, "agotado");
  });

  test("se entregan 0 y se descuenta 1, que es lo que hace `V_max(q,1)`", () => {
    const r = comprar(conUna(), "cosa", { oro: 500 });
    assert.equal(r.entregadas, 0);
    assert.equal(r.descuenta, 1);
  });

  test("con lote declarado, se entrega el lote y se descuenta el lote", () => {
    // El control que da sentido al de arriba: con `lote` puesto los dos
    // números coinciden, así que la rareza es del cero y no de la fórmula.
    const r = comprar(conUna({ lote: 10, cantidad: 30 }), "cosa", { oro: 500 });
    assert.equal(r.entregadas, 10);
    assert.equal(r.descuenta, 10);
  });

  test("y con lote declarado el guardia del vendedor SÍ para", () => {
    const r = comprar(conUna({ lote: 10, cantidad: 3 }), "cosa", { oro: 500 });
    assert.equal(r.que, "no la tiene", "quedan 3 de un lote de 10: no debería venderse");
  });

  test("los dos eventos del cierre se dicen, para que un guion no se quede a medias", () => {
    const r = comprar(conUna(), "cosa", { oro: 500 });
    assert.deepEqual(r.eventos.map((e) => e.nombre),
      ["game_player_got_from_store", "game_gave_player"]);
  });
});

describe("vender", () => {
  test("lo que el vendedor vende, te lo compra", () => {
    const r = vender(conUna({ valor: 100, coste: 100, ratio: 0.25 }), "cosa");
    assert.equal(r.que, "vende");
    assert.equal(r.precio, 25);
    assert.equal(r.aviso, "You sell cosa for 25 gold.");
  });

  test("y lo que no tiene en su tienda, no: en silencio", () => {
    const r = vender(conUna(), "otra");
    assert.equal(r.que, "no la quiere");
    assert.equal(r.aviso, null);
  });

  test("el precio sale de SU precio de venta, no del valor del objeto", () => {
    // Un objeto de valor 100 que él vende al 200 % te lo paga a 200×0,25 = 50,
    // no a 100×0,25 = 25. Es lo que hace que un vendedor caro pague bien, y no
    // es lo que uno supondría.
    const caro = vender(conUna({ valor: 100, coste: 200, ratio: 0.25 }), "cosa");
    assert.equal(caro.precio, 50);
    const barato = vender(conUna({ valor: 100, coste: 100, ratio: 0.25 }), "cosa");
    assert.equal(barato.precio, 25);
  });

  test("el ratio sigue topado a 0,9 aunque el guion pida 1.0", () => {
    // El tope es del 44 y se comprueba aquí otra vez porque ahora se NOTA: al
    // 1.0 se compraría y revendería sin perder nada.
    const r = vender(conUna({ valor: 100, coste: 100, ratio: 1.0 }), "cosa");
    assert.equal(r.precio, Math.trunc(100 * RATIO_MAXIMO));
    assert.equal(r.precio, 90);
  });

  test("y comprar y revender SIEMPRE pierde dinero", () => {
    // La consecuencia de la línea de arriba, dicha como lo que es: la razón
    // por la que existe el tope. Si algún día el tope se cae, esto avisa.
    for (const coste of [50, 100, 125, 300]) {
      const t = conUna({ valor: 100, coste, ratio: 1.0 });
      const c = comprar(t, "cosa", { oro: 99999 });
      const v = vender(t, "cosa");
      assert.ok(v.precio < c.precio, `al ${coste} %: compra ${c.precio}, venta ${v.precio}`);
    }
  });

  test("un objeto que no es tuyo no se vende, y en silencio", () => {
    const r = vender(conUna(), "cosa", { esMio: false });
    assert.equal(r.que, "no es tuyo");
    assert.equal(r.aviso, null);
  });

  test("lo vendido vuelve al estante", () => {
    assert.equal(vender(conUna(), "cosa").suma, 1);
  });
});

describe("lo que el panel escribe, que sale de `titles.txt`", () => {
  test("los dos precios y el «Worthless», que NO está en `titles.txt`", () => {
    assert.equal(TEXTO_COSTE(125), "Cost: 125 gold");
    assert.equal(TEXTO_VALOR(31), "Worth: 31 gold");
    assert.equal(NO_VALE_NADA, "Worthless");
  });

  test("la etiqueta de abajo", () => {
    assert.equal(TEXTO_VENDIENDO(3, 90), "Selling 3 items for 90 gold");
  });

  test("el título lleva el genitivo, salvo si es un contenedor", () => {
    assert.equal(tituloDeLaTienda("Krythos"), "Krythos's Shop");
    // `STORE_INV` es un saco, no una tienda: sale su nombre a secas.
    assert.equal(tituloDeLaTienda("Backpack", INVENTARIO), "Backpack");
  });

  test("los tres subtítulos son tres, y distintos", () => {
    const tres = new Set([SUBTITULO_COMPRAR, SUBTITULO_VENDER, SUBTITULO_INVENTARIO]);
    assert.equal(tres.size, 3);
    assert.equal(SUBTITULO_COMPRAR, "Select an item to buy");
  });
});

describe("el ejemplo de verdad: el armero de Gate City", () => {
  // `gatecity/armourer.script` vende la de cuero al 125 % y la dorada al 100 %.
  // Se usa como caso porque es el que el 44 midió y el que un jugador ve.
  test("la de cuero al 125 % de un valor de 40 cuesta 50", () => {
    assert.equal(precioDe(40, 125), 50);
  });

  test("y al revenderla al 25 % te dan 12, no 12,5", () => {
    const t = new Tienda("armourer");
    t.anadir({ id: "armor_leather", valor: 40 }, { coste: 125, ratio: 0.25, cantidad: 1 });
    assert.equal(vender(t, "armor_leather").precio, 12);
  });
});

// ── Y QUIÉN LLENA LA TIENDA (60) ───────────────────────────────────────────
//
// Todo lo de arriba prueba que el modelo sabe comerciar. Lo que no probaba
// nadie es que **alguien meta algo en la tienda**, y ahí estaba el fallo: el
// `addstoreitem` del guion buscaba la ficha en `catalogo.porId` y quien lo
// llama le pasa el `Map` directamente. `catalogo.porId` era `undefined`, la
// ficha salía `null` siempre y ninguna tienda del juego tenía un solo objeto
// — desde el 44, en los dos mapas y sin un error.
//
// Es la fila del 59 en el apartado 4 de CLAUDE.md: la prueba construye el
// argumento con la forma correcta y el llamador se equivoca. Por eso esta
// prueba pasa **un `Map`**, que es lo que pasa `src/main.js`, y no un objeto
// con la forma que la función quisiera.

import { entornoDe } from "../src/play/npcguion.js";
import { Tiendas } from "../src/play/tienda.js";

describe("el guion llena su tienda (60)", () => {
  /** El catálogo tal como lo pasa `src/main.js`: un `Map` de id a ficha. */
  const CATALOGO = new Map([
    ["swords_longsword", { id: "swords_longsword", nombre: "Long Sword", valor: 100 }],
  ]);

  function unVendedor(catalogo) {
    const tiendas = new Tiendas();
    const apuntados = [];
    const e = entornoDe({ catalogo, tiendas, apuntar: (t, n) => apuntados.push(`${t} ${n}`) });
    e.crearTienda("prueba");
    e.anadirALaTienda("prueba", "swords_longsword", { cantidad: 3, coste: 125 });
    return { tienda: tiendas.buscar("prueba"), apuntados };
  }

  test("con el catálogo que le pasa el juego, la tienda se llena", () => {
    const { tienda, apuntados } = unVendedor(CATALOGO);
    assert.equal(tienda.objetos.length, 1, `no se añadió nada; se apuntó: ${apuntados.join(", ")}`);
    assert.equal(tienda.objetos[0].precio, 125);
  });

  test("y con el envoltorio `{ porId }` NO se llena: era eso lo que se le pasaba", () => {
    // El control que fija el fallo. Si algún día se vuelve a esperar el
    // envoltorio, esta prueba dice cuál de las dos formas es la buena.
    const { tienda, apuntados } = unVendedor({ porId: CATALOGO });
    assert.equal(tienda.objetos.length, 0);
    assert.deepEqual(apuntados, ["objeto de tienda swords_longsword"]);
  });

  test("un objeto que no está en el catálogo se apunta y no se añade", () => {
    const tiendas = new Tiendas();
    const apuntados = [];
    const e = entornoDe({ catalogo: CATALOGO, tiendas, apuntar: (t, n) => apuntados.push(`${t} ${n}`) });
    e.crearTienda("prueba");
    e.anadirALaTienda("prueba", "no_existe");
    assert.equal(tiendas.buscar("prueba").objetos.length, 0);
    assert.deepEqual(apuntados, ["objeto de tienda no_existe"]);
  });

  test("y sin `abrirTienda` la oferta se dice por la consola, no se pierde", () => {
    // La otra mitad del cableado: `src/play/` no conoce paneles, así que si
    // nadie inyecta con qué abrirla —Node, el servidor— tiene que decirlo.
    const tiendas = new Tiendas();
    const dichos = [];
    const e = entornoDe({
      catalogo: CATALOGO, tiendas, suceso: (t, x) => dichos.push(x),
      jugador: { personaje: () => ({ objetos: [] }) },
    });
    e.crearTienda("prueba");
    e.anadirALaTienda("prueba", "swords_longsword", { cantidad: 1 });
    e.ofrecerTienda("prueba", { flags: "buy", retrollamada: "trade" });
    assert.ok(dichos.some((t) => /offers 1 wares/.test(t)), dichos.join(" | "));
  });

  test("y CON `abrirTienda` se abre y NO se dice: son dos caminos, no dos avisos", () => {
    const tiendas = new Tiendas();
    const dichos = [];
    const abiertas = [];
    const e = entornoDe({
      catalogo: CATALOGO, tiendas, suceso: (t, x) => dichos.push(x),
      abrirTienda: (o) => { abiertas.push(o); return true; },
      jugador: { personaje: () => ({ objetos: [] }) },
    });
    e.crearTienda("prueba");
    e.anadirALaTienda("prueba", "swords_longsword", { cantidad: 1 });
    e.ofrecerTienda("prueba", { flags: "buy;sell", retrollamada: "trade" });
    assert.equal(abiertas.length, 1);
    assert.equal(abiertas[0].flags, 1 | 2, "los flags no llegan al panel");
    assert.deepEqual(dichos, [], `se dijo además de abrir: ${dichos.join(" | ")}`);
  });
});
