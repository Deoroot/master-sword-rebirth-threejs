// EL VENDEDOR ATIENDE A UNO A LA VEZ. Regla: `src/play/tienda.js`.
//
// Esto existe por una pregunta del usuario —«que dos personas estén en el mismo
// mapa al 100 %»— y por lo que salió al buscar la respuesta en el mod: el
// original **no comparte el estante entre dos clientes**, hace cola de uno.
// Mientras uno compra, el otro recibe `_busy`; y el trato no se cierra al
// pulsar nada, se cierra **cuando el cliente se va a más de 128 unidades**.
//
// Lo que estas pruebas no pueden ver: que el estante que llega por la red sea
// el del servidor. Eso es de la sonda.

import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { Comercio, CORREA_DE_COMERCIO } from "../src/play/tienda.js";

describe("la cifra, tal como la declara el mod", () => {
  test("128 unidades — msmonsterserver.cpp:1843", () => {
    assert.equal(CORREA_DE_COMERCIO, 128);
  });
});

describe("uno a la vez", () => {
  test("el vendedor empieza libre", () => {
    const c = new Comercio();
    assert.equal(c.clienteDe("krythos"), null);
    assert.equal(c.ocupado("krythos"), false);
  });

  test("el primero abre el trato", () => {
    const c = new Comercio();
    assert.equal(c.abrir("krythos", "ana"), true);
    assert.equal(c.clienteDe("krythos"), "ana");
  });

  test("y el segundo NO: es el `_busy` de npcscript.cpp:893", () => {
    const c = new Comercio();
    c.abrir("krythos", "ana");
    assert.equal(c.ocupado("krythos", "beto"), true);
    assert.equal(c.abrir("krythos", "beto"), false);
    // Y el trato en curso NO se lo lleva por delante: sigue siendo de Ana.
    assert.equal(c.clienteDe("krythos"), "ana");
  });

  test("el MISMO cliente puede volver a abrir sin quedarse fuera", () => {
    const c = new Comercio();
    c.abrir("krythos", "ana");
    assert.equal(c.ocupado("krythos", "ana"), false);
    assert.equal(c.abrir("krythos", "ana"), true);
  });

  test("otro vendedor es otro trato: la cola es por vendedor", () => {
    const c = new Comercio();
    c.abrir("krythos", "ana");
    assert.equal(c.abrir("bryan", "beto"), true);
    assert.equal(c.clienteDe("krythos"), "ana");
    assert.equal(c.clienteDe("bryan"), "beto");
  });

  test("al cerrar, el vendedor queda libre y sale el `_done`", () => {
    const c = new Comercio();
    c.abrir("krythos", "ana", { retrollamada: "mi_trato" });
    assert.equal(c.cerrar("krythos"), "mi_trato_done");
    assert.equal(c.clienteDe("krythos"), null);
    assert.equal(c.abrir("krythos", "beto"), true);
  });

  test("sin retrollamada no hay evento, y el trato se cierra igual", () => {
    const c = new Comercio();
    c.abrir("krythos", "ana");
    assert.equal(c.cerrar("krythos"), null);
    assert.equal(c.clienteDe("krythos"), null);
  });

  test("cerrar uno que no existe no revienta", () => {
    assert.equal(new Comercio().cerrar("nadie"), null);
  });
});

describe("la correa: el trato se acaba andando", () => {
  const cerca = () => ({ distancia: 100, vivo: true, mirando: true });

  test("a 128 sigue, a 129 se acaba — `<= 128`", () => {
    const c = new Comercio();
    c.abrir("krythos", "ana");
    assert.deepEqual(c.paso(() => ({ distancia: 128, vivo: true, mirando: true })), []);
    assert.equal(c.clienteDe("krythos"), "ana");

    const fin = c.paso(() => ({ distancia: 129, vivo: true, mirando: true }));
    assert.equal(fin.length, 1);
    assert.equal(fin[0].cliente, "ana");
    assert.equal(c.clienteDe("krythos"), null);
  });

  test("y el `_done` sale con el paso, no con un botón", () => {
    const c = new Comercio();
    c.abrir("krythos", "ana", { retrollamada: "mi_trato" });
    const fin = c.paso(() => ({ distancia: 500, vivo: true, mirando: true }));
    assert.equal(fin[0].evento, "mi_trato_done");
  });

  test("si el cliente se muere delante del vendedor, se acaba", () => {
    const c = new Comercio();
    c.abrir("krythos", "ana");
    assert.equal(c.paso(() => ({ distancia: 10, vivo: false, mirando: true })).length, 1);
  });

  // `if (pEnemy->m_hEnemy == this ...)` — el cliente tiene que seguir
  // apuntando al vendedor. Hablar con otro te saca de la tienda.
  test("si el cliente deja de apuntar al vendedor, se acaba aunque esté pegado", () => {
    const c = new Comercio();
    c.abrir("krythos", "ana");
    assert.equal(c.paso(() => ({ distancia: 1, vivo: true, mirando: false })).length, 1);
  });

  test("si no se sabe nada de la pareja, se acaba: `m_hEnemy != NULL`", () => {
    const c = new Comercio();
    c.abrir("krythos", "ana");
    assert.equal(c.paso(() => null).length, 1);
  });

  // EL CONTROL POSITIVO DE TODO LO DE ARRIBA.
  //
  // Sin esto, «se acaba» pasaría igual si `paso` cerrara siempre todos los
  // tratos — y los seis controles anteriores saldrían verdes con la regla
  // sustituida por un `clear()`.
  test("y estando cerca, vivo y mirando, NO se acaba por muchos pasos que pasen",
    () => {
      const c = new Comercio();
      c.abrir("krythos", "ana");
      for (let i = 0; i < 50; i++) assert.deepEqual(c.paso(cerca), []);
      assert.equal(c.clienteDe("krythos"), "ana");
    });

  test("un paso sin tratos abiertos devuelve la lista vacía", () => {
    assert.deepEqual(new Comercio().paso(cerca), []);
  });

  test("dos tratos se acaban por separado: sólo el que se fue", () => {
    const c = new Comercio();
    c.abrir("krythos", "ana");
    c.abrir("bryan", "beto");
    const fin = c.paso((v) => (v === "krythos"
      ? { distancia: 999, vivo: true, mirando: true }
      : { distancia: 10, vivo: true, mirando: true }));
    assert.equal(fin.length, 1);
    assert.equal(fin[0].vendedor, "krythos");
    assert.equal(c.clienteDe("bryan"), "beto");
  });

  test("la correa se puede cambiar, que es lo que hará un guion algún día", () => {
    const c = new Comercio({ correa: 1000 });
    c.abrir("krythos", "ana");
    assert.deepEqual(c.paso(() => ({ distancia: 900, vivo: true, mirando: true })), []);
  });
});

// ── Y QUE LLEGUE POR EL GUION, que es lo que no medía nadie ─────────────────
//
// `comerciando` estaba portado desde el 44 en `Tiendas.ofrecer` y **nadie lo
// ponía nunca a `true`**: la regla existía y no se ejecutaba. Es el apartado 4
// en su forma de siempre, así que el control va donde el guion la dispara —
// `ofrecerTienda`— y no donde es cómodo llamarla.

import { entornoDe, GuionDeNpc } from "../src/play/npcguion.js";
import { Tiendas } from "../src/play/tienda.js";

describe("el `_busy` llega por el guion (62)", () => {
  const CATALOGO = new Map([
    ["swords_longsword", { id: "swords_longsword", nombre: "Long Sword", valor: 100 }],
  ]);

  /** Un vendedor con su tienda llena y su trato conectado a un `Comercio`. */
  function unVendedor(comercio, cliente) {
    const tiendas = new Tiendas();
    const abiertas = [];
    const eventos = [];
    const e = entornoDe({
      catalogo: CATALOGO, tiendas,
      abrirTienda: (o) => { abiertas.push(o); return true; },
      llamarEvento: (n) => eventos.push(n),
      jugador: { personaje: () => ({ objetos: [] }) },
      trato: {
        ocupado: () => comercio.ocupado("krythos", cliente),
        abrir: (retro) => comercio.abrir("krythos", cliente, { retrollamada: retro }),
      },
    });
    e.crearTienda("prueba");
    e.anadirALaTienda("prueba", "swords_longsword", { cantidad: 3, coste: 125 });
    return { e, abiertas, eventos, tiendas };
  }

  test("el primero abre, y con su `_success`", () => {
    const comercio = new Comercio();
    const ana = unVendedor(comercio, "ana");
    ana.e.ofrecerTienda("prueba", { flags: "buy", retrollamada: "trade" });
    assert.equal(ana.abiertas.length, 1);
    assert.deepEqual(ana.eventos, ["trade_success"]);
    assert.equal(comercio.clienteDe("krythos"), "ana");
  });

  test("y al segundo NO se le abre nada: le llega `trade_busy`", () => {
    const comercio = new Comercio();
    const ana = unVendedor(comercio, "ana");
    const beto = unVendedor(comercio, "beto");
    ana.e.ofrecerTienda("prueba", { flags: "buy", retrollamada: "trade" });
    beto.e.ofrecerTienda("prueba", { flags: "buy", retrollamada: "trade" });
    assert.equal(beto.abiertas.length, 0, "se le abrió la tienda al segundo");
    assert.deepEqual(beto.eventos, ["trade_busy"]);
  });

  // EL CONTROL POSITIVO: sin esto, «al segundo no se le abre» pasaría igual si
  // `ofrecerTienda` no abriera nunca nada a nadie.
  test("y en cuanto Ana se va, a Beto SÍ se le abre: el cero tiene control", () => {
    const comercio = new Comercio();
    const ana = unVendedor(comercio, "ana");
    const beto = unVendedor(comercio, "beto");
    ana.e.ofrecerTienda("prueba", { flags: "buy", retrollamada: "trade" });
    beto.e.ofrecerTienda("prueba", { flags: "buy", retrollamada: "trade" });
    assert.equal(beto.abiertas.length, 0);

    // Ana se aleja: el paso del vendedor acaba el trato.
    const fin = comercio.paso(() => ({ distancia: 400, vivo: true, mirando: true }));
    assert.equal(fin.length, 1);

    beto.e.ofrecerTienda("prueba", { flags: "buy", retrollamada: "trade" });
    assert.equal(beto.abiertas.length, 1, "Beto sigue sin poder comprar con el vendedor libre");
    assert.deepEqual(beto.eventos, ["trade_busy", "trade_success"]);
  });

  test("sin `trato` inyectado el vendedor atiende a todos, como antes del 62", () => {
    const tiendas = new Tiendas();
    const abiertas = [];
    const e = entornoDe({
      catalogo: CATALOGO, tiendas,
      abrirTienda: (o) => { abiertas.push(o); return true; },
      jugador: { personaje: () => ({ objetos: [] }) },
    });
    e.crearTienda("prueba");
    e.anadirALaTienda("prueba", "swords_longsword", { cantidad: 3 });
    e.ofrecerTienda("prueba", { flags: "buy", retrollamada: "trade" });
    e.ofrecerTienda("prueba", { flags: "buy", retrollamada: "trade" });
    assert.equal(abiertas.length, 2);
  });
});

// ── Y EL LLAMADOR DE VERDAD, que es quien se lo saltaba ────────────────────
//
// Todo lo de arriba llama a `entornoDe` a mano. Nadie en el juego lo hace:
// quien monta un NPC monta un `GuionDeNpc`, y `GuionDeNpc` **no reenviaba
// `trato`**. Así que la regla estaba escrita, citada y en verde, y el juego la
// ejecutaba con `trato` a `null`: `comerciando` siempre `false`, `abrir` nunca
// llamado. La sonda lo enseñó con un `claves= []` en el momento de comprar.
//
// Es la variante del 59 —la prueba CONSTRUYE el argumento que el llamador se
// equivoca al pasar—, así que el control tiene que entrar por donde entra el
// juego. Ver el apartado 4 de CLAUDE.md.
describe("`GuionDeNpc` reenvía el trato a su entorno (62)", () => {
  const CATALOGO = new Map([["swords_longsword", { id: "swords_longsword", nombre: "Long Sword", valor: 100 }]]);

  /** Un vendedor montado COMO LO MONTA EL JUEGO: por la clase, no por `entornoDe`. */
  function porLaClase(comercio, cliente, tiendas) {
    const abiertas = [];
    const g = new GuionDeNpc({
      ficha: { eventos: [] }, npc: { nombre: "Krythos", script: "krythos" },
      catalogo: CATALOGO, tiendas,
      abrirTienda: (o) => { abiertas.push(o); return true; },
      trato: {
        ocupado: () => comercio.ocupado(24, cliente),
        abrir: (retro) => comercio.abrir(24, cliente, { retrollamada: retro }),
      },
    });
    return { g, abiertas };
  }

  test("abrir la tienda por la clase marca el trato en el `Comercio`", () => {
    const comercio = new Comercio();
    const tiendas = new Tiendas();
    const ana = porLaClase(comercio, "ana", tiendas);
    ana.g.entorno.crearTienda("prueba");
    ana.g.entorno.anadirALaTienda("prueba", "swords_longsword", { cantidad: 3, coste: 125 });
    ana.g.entorno.ofrecerTienda("prueba", { flags: "buy", retrollamada: "trade" });
    assert.equal(ana.abiertas.length, 1, "no se abrió la tienda");
    // ESTO es lo que estaba roto: el trato quedaba sin marcar y el `trade`
    // posterior se encontraba el `Comercio` vacío.
    assert.equal(comercio.clienteDe(24), "ana");
  });

  test("y el segundo recibe `_busy` por la clase, no sólo por `entornoDe`", () => {
    const comercio = new Comercio();
    const tiendas = new Tiendas();
    const ana = porLaClase(comercio, "ana", tiendas);
    const beto = porLaClase(comercio, "beto", tiendas);
    ana.g.entorno.crearTienda("prueba");
    ana.g.entorno.anadirALaTienda("prueba", "swords_longsword", { cantidad: 3, coste: 125 });
    ana.g.entorno.ofrecerTienda("prueba", { flags: "buy", retrollamada: "trade" });
    beto.g.entorno.ofrecerTienda("prueba", { flags: "buy", retrollamada: "trade" });
    assert.equal(beto.abiertas.length, 0, "se le abrió la tienda al segundo");
    // Y el control positivo del cero: con el vendedor libre, a Beto SÍ se le abre.
    comercio.paso(() => ({ distancia: 400, vivo: true, mirando: true }));
    beto.g.entorno.ofrecerTienda("prueba", { flags: "buy", retrollamada: "trade" });
    assert.equal(beto.abiertas.length, 1, "Beto sigue sin poder comprar con el vendedor libre");
  });
});

// ── EL TIPO DEL IDENTIFICADOR, que se perdía en la frontera ─────────────────
//
// La clave del `Map` es `String(vendedor)` a propósito, para que el 24 y el
// «24» sean el mismo vendedor. Lo que costó una vuelta de sonda es que `paso`
// devolvía **la clave** en vez del vendedor: quien recibía un `"24"` y lo
// pasaba a un `manada.de(id)` que compara con `===` recibía `null`, concluía
// que el cliente no estaba y cerraba el trato en el fotograma siguiente. Se
// veía como «The vendor is busy» al comprar, con el comprador pegado al
// vendedor — un fallo en la frontera, no en la regla.
describe("el vendedor vuelve tal como entró (62)", () => {
  test("`paso` devuelve el vendedor, no la clave del Map", () => {
    const c = new Comercio();
    c.abrir(24, "ana");
    const fin = c.paso(() => ({ distancia: 999, vivo: true, mirando: true }));
    assert.equal(fin[0].vendedor, 24);
    assert.equal(typeof fin[0].vendedor, "number");
  });

  test("y la consulta de geometría lo recibe igual, no como cadena", () => {
    const c = new Comercio();
    c.abrir(24, "ana");
    const vistos = [];
    c.paso((v) => { vistos.push(v); return { distancia: 1, vivo: true, mirando: true }; });
    assert.deepEqual(vistos, [24]);
  });

  test("y el 24 y el «24» siguen siendo el mismo vendedor", () => {
    const c = new Comercio();
    c.abrir(24, "ana");
    assert.equal(c.ocupado("24", "beto"), true);
    assert.equal(c.clienteDe("24"), "ana");
  });
});
