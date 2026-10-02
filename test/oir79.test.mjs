// LOS NPC OYEN — experimento 79.
//
// `HearPhrase` (msmonsterserver.cpp:1752-1800) decide qué evento dispara una
// frase, y lo hace de una forma que no es la que uno escribiría: por subcadena,
// con un ratio que mide la palabra contra TODO lo que has dicho, parándose en
// la primera palabra de cada grupo y rompiendo los empates a favor del primero.
// Las cuatro cosas cambian el resultado y las cuatro se prueban por separado.
//
// Y una advertencia que es del apartado 4 de CLAUDE.md: estas pruebas le dan a
// `oirFrase` listas de frases **escritas a mano**, que es exactamente la trampa
// del 59. Por eso al final hay una suite que las saca de un `GuionDeNpc` de
// verdad, construido con la ficha horneada de Edana, y que entra por donde
// entra el juego.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { oirFrase, limpiarTexto } from "../src/play/oir.js";
import { GuionDeNpc } from "../src/play/npcguion.js";

const grupo = (evento, ...palabras) => ({ evento, palabras });

describe("`HearPhrase`: qué palabra gana", () => {
  const edrin = [
    grupo("say_hi", "hi", "hail", "hello", "greet"),
    grupo("say_job", "job", "work"),
  ];

  test("una palabra suelta dispara su evento", () => {
    assert.equal(oirFrase(edrin, "hello")?.evento, "say_hi");
    assert.equal(oirFrase(edrin, "job")?.evento, "say_job");
  });

  test("y no hace falta que sea la frase entera: `strstr` busca subcadena", () => {
    assert.equal(oirFrase(edrin, "well hello there captain")?.evento, "say_hi");
  });

  test("encaja DENTRO de otra palabra, que es la cara b de la subcadena", () => {
    // `greet` dentro de `greetings`. Esto es el mod y se porta tal cual.
    assert.equal(oirFrase(edrin, "greetings")?.evento, "say_hi");
    // Y el caso que muerde: `hi` dentro de `this`.
    assert.equal(oirFrase(edrin, "what is this")?.evento, "say_hi");
  });

  test("lo que no encaja no dispara nada", () => {
    assert.equal(oirFrase(edrin, "the weather is lovely today"), null);
    assert.equal(oirFrase(edrin, ""), null);
    assert.equal(oirFrase([], "hello"), null);
  });

  test("y da igual la caja: `_strlwr` antes de comparar", () => {
    assert.equal(oirFrase(edrin, "HELLO")?.evento, "say_hi");
    assert.equal(oirFrase([grupo("e", "Cider")], "cider")?.evento, "e");
  });
});

describe("el ratio, que NO es lo que parece", () => {
  // El bucle de `Matched` del mod compara una subcadena consigo misma, así que
  // siempre vale `strlen(CheckPhrase)`. El ratio real es
  // longitud de la palabra / longitud de la frase entera.
  test("decir sólo la palabra da 1,0", () => {
    assert.equal(oirFrase([grupo("e", "cider")], "cider").ratio, 1);
  });

  test("y decirla dentro de una frase larga la baja", () => {
    const r = oirFrase([grupo("e", "cider")], "i am looking for the cider");
    assert.equal(r.ratio, 5 / "i am looking for the cider".length);
    assert.ok(r.ratio < 0.2);
  });

  test("entre dos grupos que encajan gana la PALABRA MÁS LARGA", () => {
    const frases = [grupo("corto", "ale"), grupo("largo", "alehouse")];
    assert.equal(oirFrase(frases, "the alehouse")?.evento, "largo");
  });

  // El control positivo del anterior: si el ratio no se calculara, ganaría
  // siempre el primero y esta prueba no distinguiría nada. Dando la vuelta al
  // orden, el ganador tiene que seguir siendo el largo.
  test("y gana aunque esté declarado el segundo o el primero", () => {
    const a = [grupo("corto", "ale"), grupo("largo", "alehouse")];
    const b = [grupo("largo", "alehouse"), grupo("corto", "ale")];
    assert.equal(oirFrase(a, "the alehouse")?.evento, "largo");
    assert.equal(oirFrase(b, "the alehouse")?.evento, "largo");
  });

  test("un empate lo gana el declarado antes, porque la comparación es `>`", () => {
    const frases = [grupo("primero", "cider"), grupo("segundo", "cider")];
    assert.equal(oirFrase(frases, "cider")?.evento, "primero");
  });
});

describe("el `break`: dentro de un grupo sólo puntúa la primera que encaja", () => {
  // Es el detalle más fácil de portar mal, porque el `break` del mod está
  // dentro del `if` y parece una optimización. No lo es: decide el ratio con
  // el que compite el grupo entero, y por tanto quién gana.
  test("gana la primera de la lista, no la más larga del grupo", () => {
    const frases = [grupo("saludo", "hi", "greetings")];
    const r = oirFrase(frases, "hi there greetings");
    assert.equal(r.palabra, "hi");
    assert.equal(r.ratio, 2 / "hi there greetings".length);
  });

  test("y por eso el orden del guionista puede hacer perder a un grupo", () => {
    // El grupo A tiene la palabra larga, pero su primera encajante es corta.
    const frases = [
      grupo("A", "hi", "alehouse"),
      grupo("B", "house"),
    ];
    // «hi» (2) contra «house» (5): gana B, aunque A tuviera «alehouse» dentro.
    assert.equal(oirFrase(frases, "hi the alehouse")?.evento, "B");
  });

  test("sin el `break` ganaría A, que es lo que esta prueba separa", () => {
    // El mismo caso con la palabra corta quitada: ahora A sí puntúa con la
    // larga. Es el control positivo de que la prueba de arriba mide el `break`
    // y no otra cosa.
    const frases = [grupo("A", "alehouse"), grupo("B", "house")];
    assert.equal(oirFrase(frases, "hi the alehouse")?.evento, "A");
  });
});

describe("`stripBadChars`, y que limpia el original", () => {
  test("se van los cuatro y nada más", () => {
    // Y NO deja un hueco donde estaban: `cleanData[x++] = c` compacta, así que
    // `$get(a)` se queda en `geta`, pegado. Lo escribí esperando «get a» y la
    // prueba salió roja con el código bien — que es el rojo bueno.
    assert.equal(limpiarTexto("$get(a) ¯x"), "geta x");
    assert.equal(limpiarTexto("hello, friend!"), "hello, friend!");
    assert.equal(limpiarTexto("(no) $parens ¯"), "no parens ");
  });

  test("y por eso `$apple` encaja con `apple`", () => {
    // Si se limpiara una copia y `HearPhrase` viera el original, no encajaría.
    assert.equal(oirFrase([grupo("e", "apple")], limpiarTexto("$apple"))?.evento, "e");
  });
});

// ── Y AHORA SIN ESCRIBIR LAS FRASES A MANO ────────────────────────────────
//
// Todo lo de arriba le pasa a `oirFrase` una lista que construye la prueba. Eso
// demuestra que la función sabe elegir, no que alguien la llame con lo que el
// juego tiene dentro — la trampa del 59, tres veces en este cuaderno. Esta
// suite monta un `GuionDeNpc` con la ficha de Edrin **horneada del juego**, le
// habla, y mira si contesta.
const MANIFIESTO = "build/edana/guiones.json";

describe("un NPC de verdad, con sus `catchspeech` de verdad", { skip: existsSync(MANIFIESTO) ? false : "sin build/edana" }, () => {
  const guiones = JSON.parse(readFileSync(MANIFIESTO, "utf8")).guiones;

  const monta = (clave) => new GuionDeNpc({
    ficha: guiones[clave],
    npc: { nombre: "Quien Sea", script: clave, origen: "0 0 0" },
  });

  test("Edrin trae sus frases del guion, no de esta prueba", () => {
    const g = monta("edana/edrin");
    const frases = g.entorno.frases;
    assert.ok(frases.length >= 5, `sólo ${frases.length} grupos`);
    // Y que una de ellas es la del saludo, que es la que mide la sonda.
    assert.ok(frases.some((f) => (f.palabras ?? []).includes("hello")),
      `no hay un grupo con «hello»: ${JSON.stringify(frases).slice(0, 300)}`);
  });

  test("y al decirle «Hello» —lo que pone su propia opción de menú— contesta", () => {
    const g = monta("edana/edrin");
    const r = g.oir("Hello");
    assert.equal(r.heardtext, true);
    assert.equal(r.evento, "say_hi", `disparó ${r.evento}`);
  });

  test("el control negativo: con algo que no está en su lista no contesta", () => {
    const g = monta("edana/edrin");
    const r = g.oir("qwrtypz");
    assert.equal(r.evento, null);
    // Pero `game_heardtext` SÍ se le manda, que son dos mecanismos distintos.
    assert.equal(r.heardtext, true);
  });

  test("y con la lista de frases vacía no contesta nadie: el control del instrumento", () => {
    const g = monta("edana/edrin");
    g.entorno.frases.length = 0;
    assert.equal(g.oir("Hello").evento, null);
  });

  test("Bryan oye «cider», que es como empieza esa misión", () => {
    const g = monta("edana/bryan");
    assert.equal(g.oir("cider").evento, "say_cider");
  });

  test("y «apple», que es lo que te vende", () => {
    const g = monta("edana/bryan");
    assert.equal(g.oir("got any apples?").evento, "say_apple");
  });

  test("el alcalde oye lo suyo y no lo de Bryan", () => {
    const bryan = monta("edana/bryan");
    const mayor = monta("edana/mayor");
    // El segundo caso del 50: si los dos contestaran igual, esto no mediría
    // que cada NPC tiene SUS frases.
    assert.notEqual(bryan.oir("cider").evento, mayor.oir("cider").evento);
  });
});
