// LAS TECLAS QUE SON DEL NAVEGADOR, comprobadas sin navegador.
//
// Aquí no hay ninguna cita del motor y no debe haberla: `src/juego/navegador.js`
// es nuestro entero, porque Master Sword es de escritorio y no tiene este
// problema. Lo que se comprueba es que el diagnóstico sea correcto con los
// valores por defecto DEL JUEGO —o sea con los `bind` del `config.cfg`— y no con
// un mapa inventado para que salga bien.
//
// Lo que NO se puede comprobar aquí: que Keyboard Lock ceda Ctrl+W de verdad.
// Eso necesita un Chromium en pantalla completa y va en la sonda.

import test from "node:test";
import assert from "node:assert/strict";

import { RESERVADAS, reservada, choques, avisoDeReservadas, atraparTeclado,
  hayAtrapaTeclado, tecladoAtrapado } from "../src/juego/navegador.js";
import { ACCIONES, porDefecto } from "../src/juego/teclas.js";

test("el choque con el navegador sale de los `bind` del juego", async (t) => {
  await t.test("agacharse y avanzar cierran la pestaña, con los valores de fábrica", () => {
    // Éste es EL caso: `bind "CTRL" "+duck"` (config.cfg:15) y `bind "w"
    // "+forward"`, que juntos son Ctrl+W. Y no es una postura rara: es cómo se
    // sube a los sitios estrechos en Half-Life.
    const lista = choques(porDefecto(), ACCIONES);
    const cual = lista.find((c) => c.codigo === "KeyW");
    assert.ok(cual, "con las teclas del juego, Ctrl+W tiene que aparecer");
    assert.deepEqual(cual.acciones, ["Duck", "Move Forward"]);
    assert.equal(cual.que, "closes the tab");
  });

  await t.test("y desaparece si agacharse deja de ser un modificador", () => {
    // El control opuesto. Sin esto, una función que devolviera siempre algo
    // pasaría la prueba de arriba: hay que ver que el choque se va cuando la
    // causa se va.
    const mapa = { ...porDefecto(), agachar: "KeyZ" };
    const lista = choques(mapa, ACCIONES);
    assert.equal(lista.some((c) => c.codigo === "KeyW"), false,
      "sin ningún Ctrl asignado, la W sola no choca con nada");
    // Y la W sigue siendo de avanzar, que es lo que no debía cambiar.
    assert.equal(mapa.adelante, "KeyW");
  });

  await t.test("las de función chocan SIN modificador, y por eso son otra clase", () => {
    // F11 y F12 no necesitan compañía: la tecla sola no llega nunca. Es lo que
    // `teclas.js` ya sabía —de ahí el segundo `bind` de las cinco primeras
    // ranuras— y aquí queda medido en vez de contado en un comentario.
    const lista = choques(porDefecto(), ACCIONES);
    const f11 = lista.find((c) => c.codigo === "F11");
    assert.ok(f11, "la ranura 11 está en F11 y F11 es del navegador");
    assert.equal(f11.modificador, null);
    assert.deepEqual(f11.acciones, ["Quickslot 11"]);
  });

  await t.test("reservada() distingue, y no dice sí a todo", () => {
    assert.equal(reservada("KeyW")?.que, "closes the tab");
    assert.equal(reservada("F12")?.que, "opens developer tools");
    assert.equal(reservada("KeyZ"), null, "una tecla libre no está reservada");
    assert.equal(reservada("Space"), null, "ni saltar, que es la más usada del juego");
  });
});

test("el aviso al jugador", async (t) => {
  await t.test("nombra las dos ACCIONES, no las dos teclas, y en inglés", () => {
    // «Ctrl + W» no le dice nada a nadie; «Duck + Move Forward» sí. Y va en
    // inglés porque es interfaz, que es la regla del proyecto.
    const texto = avisoDeReservadas({ mapa: porDefecto(), acciones: ACCIONES });
    assert.match(texto, /Duck \+ Move Forward/);
    assert.match(texto, /closes the tab/);
    assert.match(texto, /fullscreen/i, "tiene que decir cuál es la salida");
  });

  await t.test("y se calla la segunda vez", () => {
    assert.equal(avisoDeReservadas({ mapa: porDefecto(), acciones: ACCIONES, yaAvisado: true }), null);
  });

  await t.test("se calla también si no hay nada que avisar", () => {
    // El control opuesto del de arriba: con agacharse fuera de Ctrl no hay aviso
    // que dar, y darlo sería peor que no darlo.
    const mapa = { ...porDefecto(), agachar: "KeyZ" };
    assert.equal(avisoDeReservadas({ mapa, acciones: ACCIONES }), null);
  });
});

test("pantalla completa y Keyboard Lock, sin navegador delante", async (t) => {
  await t.test("en Node no hay ninguna de las dos, y no se cae", () => {
    // Que `atraparTeclado` no lance importa de verdad: se llama desde el
    // manejador de una tecla, y una excepción ahí se lleva por delante el resto
    // del reparto —o sea que un navegador sin la API dejaría de responder a todo.
    assert.equal(hayAtrapaTeclado({}), false);
    assert.equal(tecladoAtrapado(), false);
  });

  await t.test("sin pantalla completa contesta que no, y dice por qué", async () => {
    const r = await atraparTeclado(null, {});
    assert.equal(r.teclado, false);
    assert.equal(r.pantallaCompleta, false);
    assert.ok(r.porque, "una negativa sin motivo no se puede enseñar al jugador");
  });

  await t.test("la lista tiene forma, toda ella", () => {
    // Una entrada a medias sería un aviso a medias, y se vería en el juego y no
    // aquí.
    for (const r of RESERVADAS) {
      assert.match(r.codigo, /^(Key[A-Z]|F\d{1,2}|Escape)$/, `código raro: ${r.codigo}`);
      assert.ok(r.modificador === null || r.modificador === "ctrl" || r.modificador === "alt");
      assert.ok(r.que && !/[A-Z]/.test(r.que[0]), "`que` completa una frase, así que va en minúscula");
    }
  });
});
