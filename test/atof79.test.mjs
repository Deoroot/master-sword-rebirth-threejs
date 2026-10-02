// `atof` NO ES `Number` — experimento 79.
//
// Veintiún guiones de Master Sword escriben la vida de su NPC como
// `hp 700/700`. El comando del mod espera dos parámetros separados por un
// espacio (`npcscript.cpp:185-196`), así que eso es UNO solo — y funciona en el
// juego por accidente, porque `atof` lee el prefijo numérico y abandona en la
// barra. `Number("700/700")` es `NaN`.
//
// Lo que ese `NaN` producía no era un error sino **un NPC que no existe para
// nadie**: `Manada.vivos()` exige `vida > 0` y de esa lista sale
// `candidatosDeGolpe()`, con la que el menú decide a quién tienes delante. El
// capitán de la guardia de Edana no se podía golpear ni hablar, y es el único
// NPC de los tres mapas portados cuyo menú trae opciones de tipo `say`.
//
// Hay tres cosas que comprobar y son distintas:
//   1. que `atof` hace lo que hace el de C, incluidos sus casos feos;
//   2. que el lector de fichas lo usa para `hp` — el control que se pone rojo
//      si alguien vuelve a poner `Number` ahí;
//   3. que `hp` es la ÚNICA clave del juego donde los dos difieren, contado
//      sobre los 2 884 guiones. Esto es el límite declarado del arreglo: el día
//      que aparezca otra, esta prueba lo dice en vez de que lo descubra un mapa.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { atof, modeloYAnimaciones } from "../src/bsp/script.js";

describe("`atof`, el de C y no el de JavaScript", () => {
  test("lee el prefijo numérico y abandona en el primer carácter que no entiende", () => {
    // El caso que da nombre al experimento.
    assert.equal(atof("700/700"), 700);
    assert.equal(atof("60/60"), 60);
    assert.equal(atof("1/1"), 1);
    // Y los que `Number` también sabe, que tienen que seguir dando lo mismo.
    assert.equal(atof("25"), 25);
    assert.equal(atof("0.5"), 0.5);
    assert.equal(atof("-3"), -3);
    assert.equal(atof(" 42 "), 42);
  });

  test("sin un número delante vale cero, que es lo que devuelve `atof`", () => {
    assert.equal(atof("hola"), 0);
    assert.equal(atof(""), 0);
    assert.equal(atof("/700"), 0);
    assert.equal(atof(null), 0);
    assert.equal(atof(undefined), 0);
  });

  test("y NO es `parseFloat` a secas en lo que importa aquí: `Number` daba NaN", () => {
    // El control positivo del arreglo: la expresión vieja, escrita a mano, para
    // que se vea que lo que cambió no es cosmético.
    assert.ok(Number.isNaN(Number("700/700")));
    assert.equal(atof("700/700"), 700);
  });
});

describe("el lector de fichas usa `atof` para `hp`", () => {
  const ficha = (hp) => ({
    ficha: { setmodel: "npc/human1.mdl", name: "Quien Sea", hp, width: "32", height: "72" },
    cuerpos: [],
  });

  test("`hp 700/700` da 700 y no `null`", () => {
    assert.equal(modeloYAnimaciones(ficha("700/700")).hp, 700);
  });

  test("`hp 25` sigue dando 25", () => {
    assert.equal(modeloYAnimaciones(ficha("25")).hp, 25);
  });

  // LA DISTINCIÓN QUE NO SE PIERDE: el mod no ejecuta la línea que no está, y
  // aquí eso tiene que seguir siendo `null` y no el `0` de `atof`. Un cero
  // significaría «este NPC nace muerto» y `Manada.vivos()` lo tiraría igual que
  // antes del arreglo — o sea, el arreglo se habría comido su propio efecto.
  test("y un `hp` que no está sigue siendo `null`, no cero", () => {
    assert.equal(modeloYAnimaciones(ficha(undefined)).hp, null);
    assert.equal(modeloYAnimaciones(ficha("")).hp, null);
  });

  test("y el que no es cero pasa la puerta de `vivos()`, que es lo que fallaba", () => {
    // La condición literal de `Manada.vivos()`, escrita aquí a mano: es la que
    // decide si existes para la espada y para la F.
    const vivo = (hp) => { const v = modeloYAnimaciones(ficha(hp)).hp; return !!v && v > 0; };
    assert.equal(vivo("700/700"), true);
    assert.equal(vivo("25"), true);
    assert.equal(vivo(undefined), false);
  });
});

// ── EL LÍMITE, CONTADO SOBRE LOS GUIONES DE VERDAD ────────────────────────
//
// Si los scripts no están al lado, esto no puede medir nada y lo dice en vez de
// pasar en verde: un cero sin los datos delante no es un resultado.
const RAIZ = "../MSC/MSCScripts/scripts";

describe("`hp` es la única clave donde `Number` y `atof` no coinciden", { skip: existsSync(RAIZ) ? false : "sin ../MSC/MSCScripts" }, () => {
  /** Las claves numéricas que este lector convierte de un `.script`. */
  const CLAVES = /^\s*(hp|width|height|stepsize|gold|exp|mp|scale|yaw|speed|radius|roam)\s+(\S+)/i;

  const todos = [];
  (function anda(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) anda(p);
      else if (e.name.endsWith(".script")) todos.push(p);
    }
  })(RAIZ);

  /** Cada discrepancia, con su clave, su valor y en qué fichero está. */
  const discrepancias = [];
  for (const p of todos) {
    for (const l of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = l.match(CLAVES);
      if (!m) continue;
      const v = m[2];
      if (/^[A-Za-z_$]/.test(v)) continue;           // una variable, no un número
      if (Number.isFinite(Number(v))) continue;      // los dos lo entienden igual
      discrepancias.push({ clave: m[1].toLowerCase(), valor: v, donde: p });
    }
  }

  test("se han leído los 2 884 guiones, que es el control de que esto mide algo", () => {
    assert.ok(todos.length > 2800, `sólo ${todos.length} guiones`);
  });

  test("y las discrepancias son todas de `hp`, ninguna de otra clave", () => {
    const otras = discrepancias.filter((d) => d.clave !== "hp");
    assert.deepEqual(otras, [], `claves nuevas: ${[...new Set(otras.map((o) => `${o.clave} ${o.valor}`))].join(", ")}`);
  });

  test("y las de `hp` son todas de la forma `a/b`, que es lo que se arregló", () => {
    const raras = discrepancias.filter((d) => !/^[\d.]+\/[\d.]+$/.test(d.valor));
    assert.deepEqual(raras, [], `formas no previstas: ${raras.map((r) => r.valor).join(", ")}`);
  });

  test("y hay más de una, que si no esto sería un caso único", () => {
    // La lección del 50: con un solo caso, el valor correcto y el de reposo
    // pueden ser el mismo y el control no puede fallar por construcción.
    const ficheros = new Set(discrepancias.map((d) => d.donde));
    assert.ok(ficheros.size >= 20, `sólo ${ficheros.size} ficheros`);
  });
});
