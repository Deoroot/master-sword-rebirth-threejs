// 71 — Los objetos en el suelo: nacer, caer, tumbarse, caducar y que te los
// cojan.
//
// La pieza que faltaba desde el 69, y que el 70 dejó señalada con el dedo: la
// cadena del manzano de Edana llegaba entera hasta el aparecedor y allí se
// paraba, porque en este puerto no había objetos en el suelo. Ni uno.
//
// Lo que estas pruebas vigilan, en orden de lo que cuesta descubrir:
//
//   1. el submodelo del suelo **no es una fórmula**: lo calcula el `game_fall`
//      de cada guion, y la manzana ANULA el de su base para cambiar un +2 por
//      un +1. Con el +2 cae del árbol convertida en `oldbook_rhand`;
//   2. el alcance de la recogida se mide contra la CAJA del objeto y no contra
//      su origen, así que son 88 unidades en horizontal y no 64;
//   3. el cono es de ±60° y **no tiene techo** (se mide en 2D);
//   4. y el `ItemCount = 1` de player.cpp:5199, que deja el menú de «Gather
//      items» inalcanzable: con dos cosas a los pies te llevas una.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  Suelo, ObjetoSuelto, aMano, CADUCA, ALCANCE, CONO, CAJA, ANTES_DE_CAER,
} from "../src/play/suelo.js";
import { caidaDe, leerFichaObjeto } from "../src/bsp/script.js";

const SCRIPTS = "../MSC/MSCScripts/scripts";
const hayScripts = existsSync(`${SCRIPTS}/items/health_apple.script`);

/** Un catálogo de mentira con lo que el horneado da de verdad. */
const CATALOGO = new Map([
  ["health_apple", { id: "health_apple", nombre: "Apple", modelo: "misc/p_misc.mdl", cuerpo: 2, animacion: "apple_floor_idle" }],
  ["item_log", { id: "item_log", nombre: "Firewood", modelo: "misc/item_log.mdl", cuerpo: 0, animacion: null }],
]);

const banco = () => new Suelo({ catalogo: CATALOGO, azar: () => 0.5 });

/** Una traza que pone el suelo a una altura fija. Devuelve `{ punto }`. */
const sueloA = (y) => (desde, hasta) => {
  if (hasta[1] > y) return null;
  const t = (desde[1] - y) / (desde[1] - hasta[1]);
  return { punto: [desde[0] + (hasta[0] - desde[0]) * t, y, desde[2] + (hasta[2] - desde[2]) * t] };
};

describe("71 · nacer y caer: `CGenericItem::Fall` y `FallInit`", () => {
  test("el objeto hereda el nombre DEL APARECEDOR y su sitio", () => {
    const s = banco();
    // `pItem->pev->targetname = pev->targetname` (gispawn.cpp:40) y
    // `pItem->pev->origin = pev->origin` (:55-56).
    const o = s.soltar({ guion: "health_apple", nombre: "apple5spawn", donde: [-2136, 143, -2741] });
    assert.equal(o.nombre, "apple5spawn");
    assert.deepEqual(o.pos, [-2136, 143, -2741]);
    assert.equal(o.estado, "naciendo");
  });

  test("un `scriptfile` que no existe no pone nada, y se dice", () => {
    // `NewGenericItem` devuelve NULL y `SpawnItem` se va (gispawn.cpp:38-39).
    // Es el caso del tercer aparecedor de Edana, cuyo `scriptfile` es `log`.
    const s = banco();
    assert.equal(s.soltar({ guion: "log" }), null);
    assert.equal(s.objetos.length, 0);
    assert.ok(s.recoger().some((x) => x.tipo === "objeto_sin_guion" && x.guion === "log"));
  });

  test("no cae hasta su primer `Think`, a los 0,1 s", () => {
    const s = banco();
    const o = s.soltar({ guion: "health_apple", donde: [0, 500, 0] });
    s.paso(0.05, { traza: sueloA(0) });
    assert.equal(o.estado, "naciendo");
    assert.deepEqual(o.pos, [0, 500, 0]);
    s.paso(ANTES_DE_CAER, { traza: sueloA(0) });
    assert.equal(o.estado, "cayendo");
  });

  test("cae con la gravedad del motor y se para en el suelo", () => {
    const s = banco();
    const o = s.soltar({ guion: "health_apple", donde: [0, 500, 0] });
    for (let i = 0; i < 200 && o.estado !== "suelo"; i++) s.paso(1 / 60, { traza: sueloA(100) });
    assert.equal(o.estado, "suelo");
    assert.equal(o.pos[1], 100);
    assert.equal(o.aterrizajes, 1);
  });

  test("al tocar el suelo se TUMBA: cabeceo y alabeo a cero, el rumbo se queda", () => {
    // «lie flat»: `pev->angles.x = 0; pev->angles.z = 0` (genericitem.cpp:1403-1404).
    const s = banco();
    const o = s.soltar({ guion: "health_apple", donde: [0, 300, 0], angulos: [45, 90, 30] });
    for (let i = 0; i < 200 && o.estado !== "suelo"; i++) s.paso(1 / 60, { traza: sueloA(0) });
    assert.deepEqual(o.angulos, [0, 90, 0]);
  });

  test("y suena `weapondrop1` con el tono de `95 + RANDOM_LONG(0,29)`", () => {
    const s = new Suelo({ catalogo: CATALOGO, azar: () => 0 });
    const o = s.soltar({ guion: "health_apple", donde: [0, 300, 0] });
    for (let i = 0; i < 200 && o.estado !== "suelo"; i++) s.paso(1 / 60, { traza: sueloA(0) });
    const a = s.recoger().find((x) => x.tipo === "objeto_aterriza");
    assert.equal(a.sonido, "items/weapondrop1.wav");
    assert.equal(a.tono, 95);
    const s2 = new Suelo({ catalogo: CATALOGO, azar: () => 0.999 });
    const o2 = s2.soltar({ guion: "health_apple", donde: [0, 300, 0] });
    for (let i = 0; i < 200 && o2.estado !== "suelo"; i++) s2.paso(1 / 60, { traza: sueloA(0) });
    assert.equal(o2.tono, 124);   // 95 + 29, el tope del dado
  });
});

describe("71 · caducar: 120 s DESDE QUE TOCA EL SUELO", () => {
  test("el reloj se reinicia al aterrizar, no al nacer", () => {
    // `FallInit` lo pone (genericitem.cpp:1390) y `FallThink` lo VUELVE a poner
    // al tocar el suelo (:1414). Una manzana que tarda en caer vive más.
    const s = banco();
    const o = s.soltar({ guion: "health_apple", donde: [0, 4000, 0] });
    let caida = 0;
    for (let i = 0; i < 20000 && o.estado !== "suelo"; i++) { s.paso(1 / 60, { traza: sueloA(0) }); caida += 1 / 60; }
    assert.ok(caida > 0.5, `la caída tiene que durar algo: ${caida.toFixed(2)} s`);
    assert.ok(Math.abs((o.caduca - o.vida) - CADUCA) < 1e-6,
      `le quedan ${(o.caduca - o.vida).toFixed(2)} s y tendrían que ser ${CADUCA}`);
  });

  test("a los 120 s se va, y se dice", () => {
    const s = banco();
    s.soltar({ guion: "health_apple", donde: [0, 10, 0] });
    for (let i = 0; i < 20; i++) s.paso(1 / 60, { traza: sueloA(0) });
    s.recoger();
    for (let i = 0; i < CADUCA * 10; i++) s.paso(0.1, { traza: sueloA(0) });
    assert.equal(s.objetos.length, 0);
    assert.equal(s.cuentas.caducados, 1);
  });

  test("y uno COGIDO no caduca: el reloj sólo corre sin dueño", () => {
    // `if (!Owner() && m_TimeExpire && ...)` (genericitem.cpp:1459).
    const s = banco();
    const o = s.soltar({ guion: "health_apple", donde: [0, 10, 0] });
    for (let i = 0; i < 20; i++) s.paso(1 / 60, { traza: sueloA(0) });
    o.cogido = true;
    assert.equal(o.caducado, false);
  });
});

describe("71 · el alcance: la esfera se mide contra la CAJA, no contra el origen", () => {
  const tirada = (donde) => {
    const o = new ObjetoSuelto({ guion: "health_apple", donde });
    o.estado = "suelo";
    return o;
  };
  const mirandoAl = (ojo, origen, mirando) => ({ ojo, origen, mirando, libre: () => true });

  test("la caja de un objeto es ±24 en horizontal y 16 de alto", () => {
    assert.deepEqual(CAJA.min, [-24, 0, -24]);
    assert.deepEqual(CAJA.max, [24, 16, 24]);
  });

  test("a 80 unidades en horizontal todavía se coge, aunque el alcance sea 64", () => {
    // `FindEntityInSphere` compara contra `absmin`/`absmax` componente a
    // componente (pr_cmds.cpp:871-882), así que los 24 de la caja se suman.
    const o = tirada([80, 0, 0]);
    const r = aMano(o, mirandoAl([0, 0, 0], [0, 0, 0], [1, 0, 0]));
    assert.equal(r.vale, true);
    assert.equal(ALCANCE, 64);
  });

  test("y a 89 ya no: el borde está en 64 + 24", () => {
    assert.equal(aMano(tirada([88, 0, 0]), mirandoAl([0, 0, 0], [0, 0, 0], [1, 0, 0])).vale, true);
    const r = aMano(tirada([89, 0, 0]), mirandoAl([0, 0, 0], [0, 0, 0], [1, 0, 0]));
    assert.equal(r.vale, false);
    assert.equal(r.por, "lejos");
  });

  test("el CONTROL: medida contra el origen, lo de 80 unidades estaría fuera", () => {
    // Es el control que separa «he portado la esfera» de «he portado la esfera
    // del motor»: con la distancia al origen, 80 > 64 y la manzana no se coge.
    const d = Math.hypot(80, 0, 0);
    assert.ok(d > ALCANCE, `${d} contra el origen sí pasaría de ${ALCANCE}`);
  });

  test("una pared en medio lo tapa: `FVisible` con la traza", () => {
    const o = tirada([50, 0, 0]);
    const r = aMano(o, { ojo: [0, 0, 0], origen: [0, 0, 0], mirando: [1, 0, 0], libre: () => false });
    assert.equal(r.vale, false);
    assert.equal(r.por, "tapado");
  });
});

describe("71 · el cono: ±60°, en 2D y sin techo", () => {
  const tirada = (donde) => { const o = new ObjetoSuelto({ guion: "health_apple", donde }); o.estado = "suelo"; return o; };
  const ver = (o, mirando) => aMano(o, { ojo: [0, 40, 0], origen: [0, 0, 0], mirando, libre: () => true });

  test("`m_flFieldOfView` del jugador es 0,5 y no 0,1: gana la segunda asignación", () => {
    // player.cpp:2627 pone 0.1 y player.cpp:2682 pone 0.5, las dos dentro de
    // `CBasePlayer::Spawn`. El cono de recoger es el segundo.
    assert.equal(CONO, 0.5);
  });

  test("de frente sí, de espaldas no", () => {
    assert.equal(ver(tirada([50, 0, 0]), [1, 0, 0]).vale, true);
    assert.equal(ver(tirada([-50, 0, 0]), [1, 0, 0]).vale, false);
  });

  test("a 45° sí y a 75° no", () => {
    const g = (a) => [Math.cos((a * Math.PI) / 180), 0, Math.sin((a * Math.PI) / 180)];
    const o45 = tirada([50 * Math.cos(Math.PI / 4), 0, 50 * Math.sin(Math.PI / 4)]);
    assert.equal(ver(o45, g(0)).vale, true);
    const o75 = tirada([50 * Math.cos((75 * Math.PI) / 180), 0, 50 * Math.sin((75 * Math.PI) / 180)]);
    assert.equal(ver(o75, g(0)).vale, false);
  });

  test("mirando al suelo se coge igual: el cono es infinitamente alto", () => {
    // «The dot product is performed in 2d, making the view cone infinitely
    // tall» (combat.cpp:1150-1151). Mirar hacia abajo es lo NORMAL al coger
    // algo, así que un cono en 3D haría que la tecla fallara justo al apuntar.
    //
    // LOS NÚMEROS IMPORTAN, y la primera versión de esta prueba no medía nada:
    // ponía el objeto a la MISMA altura que el jugador, y ahí el término
    // vertical vale cero y 2D y 3D dan lo mismo. Pasaba igual con el cono
    // roto a 3D a propósito. Ahora la manzana está en el SUELO y el origen del
    // jugador a la cintura (36 u), que es el caso de verdad: a 20 unidades de
    // distancia el producto en 3D sale 0,485 —por debajo del 0,5— y en 2D sale
    // 1. O sea que con el cono en 3D agacharse a coger algo no funcionaría.
    const o = tirada([20, 0, 0]);
    const r = aMano(o, {
      ojo: [0, 56, 0], origen: [0, 36, 0], mirando: [0.3, -0.95, 0], libre: () => true,
    });
    assert.equal(r.vale, true);
    assert.ok(Math.abs(r.punto - 1) < 1e-9, `en 2D el producto es 1, y ha salido ${r.punto}`);
    // Y la cuenta en 3D, escrita aquí para que se vea que el control no es
    // vacuo: 20 / hypot(20, 36) = 0,486 < 0,5.
    assert.ok(20 / Math.hypot(20, 36) < CONO);
  });
});

describe("71 · EL FALLO QUE SE PORTA: `ItemCount = 1`", () => {
  test("con dos cosas delante sólo se coge una, y se dice cuántas quedan", () => {
    // `ItemCount = 1; //Thothie DEC2010_11 - trying to end item dup exploit`
    // (player.cpp:5199), sin condición, justo antes del `if (ItemCount == 1)`.
    // El menú de «Gather items» del motor es inalcanzable.
    const s = banco();
    const a = s.soltar({ guion: "health_apple", donde: [40, 0, 0] });
    const b = s.soltar({ guion: "item_log", donde: [45, 0, 5] });
    for (let i = 0; i < 20; i++) s.paso(1 / 60, { traza: sueloA(0) });
    const r = s.coger({ ojo: [0, 40, 0], origen: [0, 0, 0], mirando: [1, 0, 0], libre: () => true });
    assert.equal(r.objeto.i, a.i);
    assert.equal(r.dejados, 1);
    assert.equal(b.cogido, false);
    assert.equal(s.vivos.length, 1);
  });

  test("el mensaje es el del motor, con el nombre del catálogo", () => {
    const s = banco();
    s.soltar({ guion: "health_apple", donde: [40, 0, 0] });
    for (let i = 0; i < 20; i++) s.paso(1 / 60, { traza: sueloA(0) });
    s.recoger();
    s.coger({ ojo: [0, 40, 0], origen: [0, 0, 0], mirando: [1, 0, 0], libre: () => true });
    const m = s.recoger().find((x) => x.tipo === "objeto_cogido");
    assert.equal(m.mensaje, "You pick up Apple");
  });

  test("sin nada delante no se coge nada, y el intento se cuenta igual", () => {
    const s = banco();
    s.soltar({ guion: "health_apple", donde: [4000, 0, 0] });
    for (let i = 0; i < 20; i++) s.paso(1 / 60, { traza: sueloA(0) });
    assert.equal(s.coger({ ojo: [0, 40, 0], origen: [0, 0, 0], mirando: [1, 0, 0], libre: () => true }), null);
    assert.equal(s.cuentas.intentos, 1);
    assert.equal(s.cuentas.cogidos, 0);
  });
});

// ── EL SUBMODELO DEL SUELO, contra los guiones de verdad ───────────────────
describe("71 · el `game_fall` dice qué submodelo, y no una fórmula", { skip: !hayScripts && "sin ../MSC/MSCScripts" }, () => {
  test("la manzana ANULA el +2 de su base y pone +1", () => {
    const f = leerFichaObjeto(SCRIPTS, "items/health_apple");
    // `MODEL_BODY_OFS 1`, y su `[override] game_fall` hace `add L_SUBMODEL 1`.
    assert.equal(f.enElMundo.cuerpo, 1);
    assert.equal(f.enElMundo.cuerpoSuelo, 2);
    assert.equal(f.enElMundo.animacionSuelo, "apple_floor_idle");
    assert.equal(f.enElMundo.sueloSinLeer, null);
  });

  test("y su base, `base_drink`, dice +2: el submodelo 3, que es otra cosa", () => {
    // El control de verdad del de arriba. Si la lectura se quedara con el
    // `game_fall` del padre, la manzana saldría en el 3 de `p_misc.mdl` — que
    // se llama `oldbook_rhand`. No da error: da un libro viejo en el huerto.
    const txt = readFileSync(`${SCRIPTS}/items/base_drink.script`, "latin1");
    assert.match(txt, /game_fall[\s\S]{0,120}add\s+L_SUBMODEL\s+2/i);
    const f = leerFichaObjeto(SCRIPTS, "items/health_apple");
    assert.notEqual(f.enElMundo.cuerpoSuelo, f.enElMundo.cuerpo + 2);
  });

  test("el leño se va por la rama del `else` y acaba en el submodelo 0", () => {
    // `base_miscitem` sólo hace la cuenta si el modelo es `p_misc.mdl`, y el
    // leño trae el suyo. Es el SEGUNDO caso, y hace falta: con un solo objeto
    // en el mundo, un lector que devolviera siempre `+1` estaría igual de
    // verde (la trampa del 50).
    const f = leerFichaObjeto(SCRIPTS, "items/item_log");
    assert.equal(f.enElMundo.cuerpoSuelo, 0);
    assert.equal(f.enElMundo.animacionSuelo, null);
  });

  test("las comillas SIMPLES no son comillas: la comparación de `base_miscitem` es falsa siempre", () => {
    // Sólo las dobles agrupan (`GetParams`, script.cpp:5049-5064). Así que
    // `if ( MODEL_WORLD equals 'misc/p_misc.mdl' )` compara «misc/p_misc.mdl»
    // con «'misc/p_misc.mdl'» —con las comillas dentro— y nunca es cierto. Por
    // eso TODO lo que hereda de `base_miscitem` acaba en el submodelo 0.
    const r = caidaDe(
      ["game_fall", "if ( A equals 'A' )", "setmodelbody 0 7", "else", "setmodelbody 0 0"],
      (n) => (n === "A" ? "A" : null));
    assert.equal(r.cuerpo, 0);
  });

  test("un `if` VIEJO con la condición falsa abandona el evento entero", () => {
    // El del 67 (script.cpp:5754-5758), y aquí decide un modelo: los
    // `game_fall` de `base_item_extras` empiezan por `if ITEM_RESERVED`, que
    // nadie declara, o sea `atoi` cero, o sea falso.
    const r = caidaDe(["game_fall", "if NO_EXISTE", "setmodelbody 0 7"], () => null);
    assert.equal(r.cuerpo, null);
    const si = caidaDe(["game_fall", "if game.serverside", "setmodelbody 0 7"], () => null);
    assert.equal(si.cuerpo, 7);
  });

  test("y las cuentas usan `atof`: lo que no es un número vale cero", () => {
    // `ScriptCmd_MathSet` (scriptcmds.cpp:4210-4213). No es tolerancia: es que
    // `add L_SUBMODEL 1` con la constante sin declarar da 1 en el juego.
    const r = caidaDe(
      ["game_fall", "local L X", "add L 1", "setmodelbody 0 L"], () => null);
    assert.equal(r.cuerpo, 1);
  });
});

// ── CONTRA EL HORNEADO DE VERDAD ───────────────────────────────────────────
const SUELO_JSON = "build/msr/suelo.json";
describe("71 · el horneado", { skip: !existsSync(SUELO_JSON) && "sin build/msr/suelo.json" }, () => {
  const m = JSON.parse(readFileSync(SUELO_JSON, "utf8"));

  // CORRECCIÓN DEL 72. Esto pedía `m.objetos.length === 2` y la lista exacta
  // `["health_apple", "item_log"]`, y era verdad: el 71 horneaba sólo lo que un
  // `msitem_spawn` puede soltar. El 72 añadió la segunda vía —lo que el jugador
  // puede tirar con la `c`— y son 13. La cifra escrita a mano se quedó vieja y
  // se puso roja, que es lo que tenía que pasar. Lo que esta prueba afirma es
  // que los dos del MAPA están y que el `log`, que no existe, no se cuela.
  test("se hornea lo que un mapa puede soltar, y lo que no existe no se cuela", () => {
    const ids = m.objetos.map((o) => o.id);
    assert.ok(ids.includes("health_apple"));
    assert.ok(ids.includes("item_log"));
    assert.equal(m.sinGuion.length, 1);
    assert.equal(m.sinGuion[0].guion, "log");
  });

  test("la manzana sale del submodelo `apple_floor` y trae su animación", () => {
    const a = m.objetos.find((o) => o.id === "health_apple");
    assert.equal(a.cuerpo, 2);
    assert.equal(a.submodelo.nombre, "apple_floor");
    assert.equal(a.animacion, "apple_floor_idle");
    assert.ok(a.secuencias.includes("apple_floor_idle"));
    assert.ok(a.clave, "tiene que traer su malla extraída");
  });
});
