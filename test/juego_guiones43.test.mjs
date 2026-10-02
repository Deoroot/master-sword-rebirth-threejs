// LOS SIETE COMANDOS Y EL GETTER DEL 43. `src/play/guion.js`.
//
// Se eligieron midiendo: de los 6 NPC de Gate City que tienen menú, cinco
// necesitan `say`, `stradd`, `playsound` y `$randf`, y cuatro necesitan
// `setprop`, `roam`, `setmovedest` y `setmoveanim`. El censo de
// `npm run guiones` pasó de 7 a 19 NPCs enteros al añadirlos.
//
// Lo que se comprueba aquí es lo que no se puede volver a deducir del código:
// las formas raras de cada comando, y sobre todo **dónde el motor no hace
// nada**, porque un comando que se traga los parámetros en silencio es
// indistinguible de uno que funciona si nadie lo mira.

import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { Guion, partirGuion, COMANDOS, GETTERS } from "../src/play/guion.js";

/** Un guion de un solo evento `e`, con el entorno espiado. */
function corre(cuerpo, espias = {}) {
  const g = new Guion({ eventos: partirGuion(`{ e\n${cuerpo}\n}`).eventos });
  Object.assign(g.entorno, espias);
  g.llamar("e", []);
  return g;
}

describe("`stradd`, que con tres parámetros NO añade", () => {
  test("con dos, concatena sobre lo que ya había", () => {
    const g = corre("setvard V hola\nstradd V mundo");
    assert.equal(g.resolver("V"), "holamundo");
  });

  test("con TRES, reemplaza: lo de antes se tira", () => {
    // `if (Params.size() >= 3) SetVar(vsVarName, Params[1] + Params[2])`
    // — scriptcmds.cpp:6802. No aparece `vsOrgl` por ninguna parte.
    const g = corre("setvard V hola\nstradd V a b");
    assert.equal(g.resolver("V"), "ab");
  });

  test("sobre una variable que no existe empieza vacía, no con su nombre", () => {
    // Una variable sin poner devuelve SU PROPIO NOMBRE, y el motor lo
    // comprueba justo para tratarla como vacía (`if (vsVarName == vsOrgl)
    // vsOrgl = ""`, :6798). Sin eso esto daría «L_TXThola».
    const g = corre("stradd L_TXT hola");
    assert.equal(g.resolver("L_TXT"), "hola");
  });

  test("con un solo parámetro no hace nada", () => {
    const g = corre("setvard V hola\nstradd V");
    assert.equal(g.resolver("V"), "hola");
  });
});

describe("`say`, que son sonidos y no palabras", () => {
  test("cada parámetro es un `.wav`, y por defecto 0,2 s de boca", () => {
    const dichos = [];
    corre("say hail", { decir: (a, c) => dichos.push([a, c]) });
    assert.deepEqual(dichos, [["hail", 0.2]]);
  });

  test("los corchetes dicen cuánto se abre la boca", () => {
    const dichos = [];
    corre("say hail[0.8]", { decir: (a, c) => dichos.push([a, c]) });
    assert.deepEqual(dichos, [["hail", 0.8]]);
  });

  test("`*` y lo que empieza por RND NO son sonidos: sólo mueven la boca", () => {
    // El propio motor lo comenta como un apaño (npcscript.cpp:127). Está para
    // que el parloteo de `base_chat` no cargue un archivo «RND1.wav».
    const dichos = [];
    corre("say * RND1 RND_LARGO", { decir: (a) => dichos.push(a) });
    assert.deepEqual(dichos, [null, null, null]);
  });

  test("varios sonidos en una línea son varias llamadas", () => {
    const dichos = [];
    corre("say uno dos tres", { decir: (a) => dichos.push(a) });
    assert.deepEqual(dichos, ["uno", "dos", "tres"]);
  });
});

describe("`$randf`, que es el MISMO getter que `$rand`", () => {
  test("lo único que los separa es la letra en la posición 5 del nombre", () => {
    // `if (ParserName.c_str()[5] == 'f')` — script.cpp:3551. `$randf`[5] es
    // la efe. Con ella `RANDOM_FLOAT`, sin ella `RANDOM_LONG`.
    assert.equal("$randf"[5], "f");
    assert.equal("$rand"[4], "d");
  });

  test("devuelve un flotante del rango, no un entero", () => {
    const g = corre("setvard V $randf(1,2)", { azarFlotante: () => 1.5 });
    assert.equal(g.resolver("V"), "1.5");
  });

  test("y el dado se inyecta: sin eso dos jugadores verían cosas distintas", () => {
    // Es el fallo del 28 con otra ropa. Si alguien cambia `azarFlotante` por
    // un `Math.random` suelto, esto se pone rojo.
    let pedido = null;
    corre("setvard V $randf(3,7)", { azarFlotante: (a, b) => { pedido = [a, b]; return 4; } });
    assert.deepEqual(pedido, [3, 7]);
  });
});

describe("los que el motor se traga en silencio si les faltan parámetros", () => {
  test("`setprop` necesita LOS TRES", () => {
    // `if (Params.size() >= 3)` — scriptcmds.cpp:6182. Con dos no entra en el
    // `if` y no pasa nada, sin un solo aviso.
    const puestas = [];
    corre("setprop ent_me speed", { ponerPropiedad: (...a) => puestas.push(a) });
    assert.deepEqual(puestas, []);
    corre("setprop ent_me speed 200", { ponerPropiedad: (...a) => puestas.push(a) });
    assert.deepEqual(puestas, [["ent_me", "speed", "200"]]);
  });

  test("`setmovedest` con una sola palabra que no sea `none` tampoco hace nada", () => {
    // La rama del destino pide `Params.size() >= 2` — npcscript.cpp:1613.
    const idas = [];
    corre("setmovedest ent_player", { irA: (...a) => idas.push(a) });
    assert.deepEqual(idas, []);
  });

  test("`roam` sin parámetros no hace nada", () => {
    const paseos = [];
    corre("roam", { pasear: (v) => paseos.push(v) });
    assert.deepEqual(paseos, []);
  });
});

describe("`setmovedest`, y cómo distingue un punto de una entidad", () => {
  test("`none` para el NPC", () => {
    let a = "sin llamar";
    corre("setmovedest none", { irA: (d) => { a = d; } });
    assert.equal(a, null);
  });

  test("un paréntesis delante es un VECTOR, no un nombre", () => {
    // `Params[0].c_str()[0] == '('` — npcscript.cpp:1621. Es lo único que los
    // distingue: no hay una lista de nombres válidos que consultar.
    //
    // Y el vector llega SIEMPRE por una variable, nunca escrito en la línea:
    // los guiones dicen `setmovedest WAIT_POINT 32`, porque el troceador parte
    // por espacios y «(100 20 3)» escrito a pelo serían tres parámetros. Se
    // prueba en la forma en que se usa.
    let d = null;
    corre('setvard WAIT_POINT "(100 20 3)"\nsetmovedest WAIT_POINT 64',
      { irA: (x) => { d = x; } });
    assert.deepEqual(d, { punto: "(100 20 3)" });
  });

  test("sin paréntesis es el nombre de una entidad, con su proximidad", () => {
    let d = null, o = null;
    corre("setmovedest ent_player 64", { irA: (x, y) => { d = x; o = y; } });
    assert.deepEqual(d, { entidad: "ent_player" });
    assert.equal(o.proximidad, 64);
    assert.equal(o.huir, false);
  });

  test("y `flee` al final es huir", () => {
    let o = null;
    corre("setmovedest ent_player 300 flee", { irA: (_x, y) => { o = y; } });
    assert.equal(o.huir, true);
  });
});

describe("`roam` y `setmoveanim`", () => {
  test("`roam 0` apaga y `roam 1` enciende `MONSTER_ROAM`", () => {
    const v = [];
    corre("roam 1\nroam 0", { pasear: (x) => v.push(x) });
    assert.deepEqual(v, [true, false]);
  });

  test("`setmoveanim` sólo guarda el nombre de la animación", () => {
    // `m_MoveAnim = Params[0]` y nada más — npcscript.cpp:1473.
    let a = null;
    corre("setmoveanim walk_wounded", { animacionDeAndar: (x) => { a = x; } });
    assert.equal(a, "walk_wounded");
  });
});

describe("lo que el 43 cambia de verdad: el intérprete deja de atrancarse", () => {
  test("un `roam` en mitad de un evento ya no se lleva por delante lo que sigue", () => {
    // ÉSTE es el experimento. Antes, encontrarse un comando no portado
    // abortaba la opción entera y el NPC se quedaba mudo; ahora el evento
    // llega al final. Es la diferencia entre 7 y 19 NPCs enteros.
    const dicho = [];
    corre("saytext antes\nroam 1\nsaytext despues", { hablar: (t) => dicho.push(t) });
    assert.deepEqual(dicho, ["antes", "despues"]);
  });

  test("y los ocho están declarados en el subconjunto", () => {
    for (const c of ["stradd", "playsound", "setprop", "say", "roam", "setmovedest", "setmoveanim"]) {
      assert.ok(COMANDOS.has(c), `falta ${c}`);
    }
    assert.ok(GETTERS.has("$randf"));
  });
});
