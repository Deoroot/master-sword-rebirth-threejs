// LAS TIENDAS. `src/play/tienda.js`, y los cuatro comandos de `guion.js`.
//
// Lo que se comprueba es lo que no se puede volver a deducir del código: que el
// coste es un porcentaje y no un precio, que el ratio de recompra está topado,
// que `inv` borra los otros flags en vez de sumarse, y que las tiendas son
// globales por nombre — de eso último depende que el vendedor no acumule
// existencias cada vez que alguien le habla.

import test, { describe } from "node:test";
import assert from "node:assert/strict";

import {
  Tienda, Tiendas, flagsDe, precioDe,
  COMPRAR, VENDER, INVENTARIO, RATIO_MAXIMO, MAX_OBJETOS, POR_DEFECTO,
} from "../src/play/tienda.js";
import { Guion, partirGuion } from "../src/play/guion.js";

/** La armadura de cuero del armero de Gate City: vale 85. */
const CUERO = { id: "armor_leather", valor: 85 };

describe("el coste es un PORCENTAJE del valor, no un precio", () => {
  test("125 sobre un objeto de 85 son 106, no 125", () => {
    // `iRealCost = int(pItem->m_Value * (iCost/100.0))` — npcscript.cpp:802.
    // El armero vende la de cuero al 125 % y la dorada al 100 %.
    assert.equal(precioDe(85, 125), 106);      // 106,25 truncado
    assert.equal(precioDe(85, 100), 85);
  });

  test("y trunca, no redondea", () => {
    // Es un `int(...)` de C. 106,25 -> 106, y 106,99 también sería 106.
    assert.equal(precioDe(85, 125.9), 107);    // 107,015
    assert.equal(precioDe(3, 150), 4);         // 4,5 -> 4
  });

  test("un objeto sin valor sale a 0", () => {
    // `if (pItem->m_Value)` — :798. Sin esa guarda no cambiaría nada aquí,
    // pero es la que evita la división en el motor.
    assert.equal(precioDe(0, 500), 0);
  });
});

describe("el ratio de recompra, topado a 0,9", () => {
  test("un guion que pida 1.0 se queda en 0,9", () => {
    // `V_min(atof(Params[4]), .9)` — npcscript.cpp:843, «MIB JAN2010_16 - cap
    // resell values». Al 1.0 se podría comprar y revender sin perder nada.
    const t = new Tienda("x");
    assert.equal(t.anadir(CUERO, { ratio: 1.0 }).ratio, RATIO_MAXIMO);
    assert.equal(RATIO_MAXIMO, 0.9);
  });

  test("y uno que pida menos se respeta", () => {
    const t = new Tienda("x");
    assert.equal(t.anadir(CUERO, { ratio: 0.25 }).ratio, 0.25);
  });

  test("el tope está en la tienda, no en quien la llama", () => {
    // Si estuviera en el comando, cualquier otra vía de añadir se lo saltaría.
    const t = new Tienda("x");
    assert.equal(t.anadir(CUERO, { ratio: 99 }).ratio, 0.9);
  });
});

describe("los valores por omisión, que son los del motor", () => {
  test("cantidad 1, coste 100 %, ratio 0,25, lote 0", () => {
    // npcscript.cpp:772-774.
    assert.deepEqual(POR_DEFECTO, { cantidad: 1, coste: 100, ratio: 0.25, lote: 0 });
    const l = new Tienda("x").anadir(CUERO, {});
    assert.equal(l.cantidad, 1);
    assert.equal(l.precio, 85);
    assert.equal(l.ratio, 0.25);
  });
});

describe("los flags, y el que no se suma", () => {
  test("«buy» y «sell» se suman", () => {
    assert.equal(flagsDe("buy;sell"), COMPRAR | VENDER);
  });

  test("«inv» BORRA los demás en vez de sumarse", () => {
    // `iBuyFlags = STORE_INV` es una ASIGNACIÓN, mientras que los dos de
    // arriba son `SetBits` — npcscript.cpp:866-870. Una tienda pedida con
    // «buy;inv» no deja comprar.
    assert.equal(flagsDe("buy;inv"), INVENTARIO);
    assert.equal(flagsDe("buy;sell;inv") & COMPRAR, 0);
  });

  test("sin nada reconocible son cero flags", () => {
    assert.equal(flagsDe("trade"), 0);
    assert.equal(flagsDe(null), 0);
  });
});

describe("las tiendas son GLOBALES por nombre", () => {
  test("crear una que ya existe devuelve la misma, no otra", () => {
    // `if (!NewStore) NewStore = m_gStores.add(new CStore)` — :744-746.
    const g = new Tiendas();
    const a = g.crear("armor_store");
    a.anadir(CUERO, {});
    const b = g.crear("armor_store");
    assert.equal(a, b);
    assert.equal(b.objetos.length, 1, "la segunda creación NO vacía");
  });

  test("por eso los guiones empiezan vaciando, y si no crecería sola", () => {
    // Es el motivo de que `vendor.script` haga `npcstore.remove STORE_NAME
    // allitems` antes de volver a llenarla. Sin eso, hablar dos veces con el
    // vendedor le duplicaría las existencias.
    const g = new Tiendas();
    for (let i = 0; i < 3; i++) g.crear("t").anadir(CUERO, {});
    assert.equal(g.buscar("t").objetos.length, 3, "sin vaciar, crece");
    g.buscar("t").vaciar();
    g.crear("t").anadir(CUERO, {});
    assert.equal(g.buscar("t").objetos.length, 1);
  });
});

describe("ofrecer la tienda: los cuatro finales", () => {
  const conUna = () => { const g = new Tiendas(); g.crear("t").anadir(CUERO, {}); return g; };

  test("normal: abre, y la retrollamada lleva `_success`", () => {
    // El motor compone el sufijo él mismo — :886-893.
    const r = conUna().ofrecer("t", { retrollamada: "trade" });
    assert.equal(r.que, "abre");
    assert.equal(r.evento, "trade_success");
  });

  test("con la mochila llena no abre, y avisa con el texto del motor", () => {
    // `pPlayer->NumItems() >= NUM_MAX_ITEMS` — :847.
    const r = conUna().ofrecer("t", { retrollamada: "trade", objetosDelJugador: MAX_OBJETOS });
    assert.equal(r.que, "llena");
    assert.equal(r.evento, "trade_fail");
    assert.equal(r.aviso, "Cannot use stores/chests while inventory full.");
  });

  test("uno por debajo del tope SÍ abre: la comparación es «>=»", () => {
    const r = conUna().ofrecer("t", { retrollamada: "trade", objetosDelJugador: MAX_OBJETOS - 1 });
    assert.equal(r.que, "abre");
  });

  test("una tienda que no existe da `_fail`, no un error", () => {
    const r = new Tiendas().ofrecer("no_existe", { retrollamada: "trade" });
    assert.equal(r.que, "sin tienda");
    assert.equal(r.evento, "trade_fail");
  });

  test("un NPC que ya está comerciando da `_busy` y no mira la tienda", () => {
    // `if (!HasConditions(MONSTER_TRADING))` — :874.
    const r = conUna().ofrecer("t", { retrollamada: "trade", comerciando: true });
    assert.equal(r.que, "ocupado");
    assert.equal(r.evento, "trade_busy");
  });

  test("sin retrollamada no se llama a nada", () => {
    assert.equal(conUna().ofrecer("t", {}).evento, null);
  });
});

describe("quitar", () => {
  test("`allitems` vacía; sin segundo parámetro APAGA, que es otra cosa", () => {
    // `else pStore->Deactivate();` — npcscript.cpp:919. Es el caso que se lee
    // mal: «remove» sin más no borra el género, cierra la tienda.
    const g = new Tiendas();
    const t = g.crear("t"); t.anadir(CUERO, {});
    t.activa = false;
    assert.equal(t.objetos.length, 1, "apagar no vacía");
  });

  test("quitar un objeto se lleva sólo la primera línea que coincida", () => {
    const t = new Tienda("t");
    t.anadir(CUERO, { coste: 100 });
    t.anadir(CUERO, { coste: 200 });
    t.quitar("armor_leather");
    assert.equal(t.objetos.length, 1);
    assert.equal(t.objetos[0].coste, 200);
  });
});

describe("los comandos, tal como los escriben los guiones de Gate City", () => {
  /** Un guion con las tiendas enganchadas de verdad. */
  function corre(cuerpo) {
    const tiendas = new Tiendas();
    const g = new Guion({ eventos: partirGuion(`{ e\n${cuerpo}\n}`).eventos });
    const eventos = [];
    Object.assign(g.entorno, {
      crearTienda: (n) => tiendas.crear(n),
      anadirALaTienda: (n, id, o) => tiendas.buscar(n)?.anadir({ id, valor: 85 }, o),
      quitarDeLaTienda: (n, { todo, objeto, apagar }) => {
        const t = tiendas.buscar(n); if (!t) return;
        if (apagar) t.activa = false; else if (todo) t.vaciar(); else if (objeto) t.quitar(objeto);
      },
      ofrecerTienda: (n, o) => eventos.push(tiendas.ofrecer(n, { ...o, flags: flagsDe(o.flags) })),
    });
    g.llamar("e", []);
    return { tiendas, eventos };
  }

  test("la línea del armero, con sus cinco parámetros", () => {
    // `addstoreitem STORE_NAME armor_leather $rand(1,3) 125 SELL_RATIO`
    const { tiendas } = corre("npcstore.create tienda\naddstoreitem tienda armor_leather 3 125 0.25");
    const l = tiendas.buscar("tienda").objetos[0];
    assert.equal(l.cantidad, 3);
    assert.equal(l.precio, 106);
    assert.equal(l.ratio, 0.25);
  });

  test("`addstoreitem` sobre una tienda que no se creó no hace nada", () => {
    const { tiendas } = corre("addstoreitem fantasma armor_leather 1");
    assert.equal(tiendas.buscar("fantasma"), null);
  });

  test("con menos de dos parámetros se traga el comando en silencio", () => {
    // `if (Params.size() >= 2)` — :758.
    const { tiendas } = corre("npcstore.create t\naddstoreitem t");
    assert.equal(tiendas.buscar("t").objetos.length, 0);
  });

  test("la forma de CUATRO de `npcstore.offer`, que es la que usan", () => {
    // `npcstore.offer STORE_NAME PARAM1 L_SERVICE trade` — vendor.script:258.
    const { eventos } = corre("npcstore.create t\nnpcstore.offer t ent_player buy;sell trade");
    assert.equal(eventos.length, 1);
    assert.equal(eventos[0].que, "abre");
    assert.equal(eventos[0].flags, COMPRAR | VENDER);
    assert.equal(eventos[0].evento, "trade_success");
  });

  test("con DOS parámetros no hace nada: la rama pide tres", () => {
    const { eventos } = corre("npcstore.create t\nnpcstore.offer t ent_player");
    assert.deepEqual(eventos, []);
  });

  test("`npcstore.remove t allitems` vacía y deja la tienda en pie", () => {
    const { tiendas } = corre(
      "npcstore.create t\naddstoreitem t armor_leather 1\nnpcstore.remove t allitems");
    assert.equal(tiendas.buscar("t").objetos.length, 0);
    assert.equal(tiendas.buscar("t").activa, true);
  });

  test("y sin segundo parámetro la apaga sin vaciarla", () => {
    const { tiendas } = corre(
      "npcstore.create t\naddstoreitem t armor_leather 1\nnpcstore.remove t");
    assert.equal(tiendas.buscar("t").activa, false);
    assert.equal(tiendas.buscar("t").objetos.length, 1, "apagar NO vacía");
  });
});
