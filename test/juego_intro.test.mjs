// LA PRESENTACIÓN DEL MAPA. `src/play/intro.js`.
//
// Lo que se comprueba aquí es lo que no se puede volver a deducir del código
// una vez escrito: los dos retardos, cuál de las dos fuentes gana, y los tres
// guardias que deciden si sale el aviso de «esto te viene grande».
//
// Los dos mapas que salen de ejemplo son datos reales, copiados de
// `gatecity/map_startup.script` y `edana/map_startup.script`. Si alguien
// cambia el extractor y deja de leerlos bien, esto NO se entera — lo mide
// `tools/mapainfo.mjs` contra el disco. Aquí sólo está la regla.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  RETARDO_INTRO, RETARDO_DIFICULTAD, VIDA_MINIMA,
  TITULO_DIFICULTAD, TITULO_AVISO, TEXTO_AVISO,
  resolverMapa, presentacion,
} from "../src/play/intro.js";

/** Gate City tal como lo declara su guion: la banda 10-25 y el umbral de 100. */
const GATECITY = {
  nombre: "Gatecity",
  descripcion: "This Dwarven capital is carved deep inside the mountains.",
  dificultad: "Levels 10-25 / 100-400hp",
  avisoVida: 100,
};

/** Edana, el mapa de principiantes: sin umbral, o sea que no avisa nunca. */
const EDANA = {
  nombre: "The Village of Edana",
  descripcion: "This village grew around the temple of Urdual of the southern frontier.",
  dificultad: "(Beginner/Safe Area)",
  avisoVida: 0,
};

describe("de dónde salen los cuatro valores", () => {
  test("gana el map_startup del mapa, no el worldspawn del .bsp", () => {
    // Los dos dicen cómo se llama Gate City, y dicen cosas distintas.
    const m = resolverMapa({
      bsp: { maptitle: "Gatecity by DrKill", mapdesc: "This dwarven city, also called a jharro, is carved deep inside the mountains" },
      guion: { G_MAP_NAME: "Gatecity", G_MAP_DESC: "This Dwarven capital is carved deep inside the mountains." },
    });
    assert.equal(m.nombre, "Gatecity");
    assert.equal(m.descripcion, "This Dwarven capital is carved deep inside the mountains.");
  });

  test("y el .bsp se usa cuando el guion no lo dice", () => {
    const m = resolverMapa({ bsp: { maptitle: "Gatecity by DrKill" }, guion: {} });
    assert.equal(m.nombre, "Gatecity by DrKill");
  });

  test("una cadena del .bsp de un solo carácter se convierte en «0», no en vacío", () => {
    // `msMapTitle.len() > 1 ? valor : "0"`, script.cpp:4616-4620. Es una trampa
    // del motor y se porta tal cual: lo que se ve es un cero, no un hueco.
    const m = resolverMapa({ bsp: { maptitle: "x", mapdesc: "" }, guion: {} });
    assert.equal(m.nombre, "0");
    assert.equal(m.descripcion, "0");
  });

  test("la dificultad SÓLO existe en el guion: el worldspawn no tiene clave", () => {
    // `world.cpp:693-709` sólo conoce `hpwarn`, `mapdesc` y `maptitle`.
    const m = resolverMapa({ bsp: { maptitle: "algo", mapdiff: "Levels 1-5" }, guion: {} });
    assert.equal(m.dificultad, null);
  });

  test("el umbral de vida sale como número, y sin dato es 0", () => {
    assert.equal(resolverMapa({ guion: { G_WARN_HP: "100" } }).avisoVida, 100);
    assert.equal(resolverMapa({ guion: {}, bsp: {} }).avisoVida, 0);
  });
});

describe("cuándo sale cada aviso", () => {
  test("el nombre a los 10 s y la dificultad a los 13, no los dos juntos", () => {
    // `callevent 10.0 give_map_intro` y dentro `callevent 3.0 give_map_diff`.
    // Los tres segundos son ADEMÁS de los diez, no en vez de.
    assert.equal(RETARDO_INTRO, 10.0);
    assert.equal(RETARDO_DIFICULTAD, 3.0);
    const a = presentacion(GATECITY, 150);
    assert.equal(a[0].cuando, 10.0);
    assert.equal(a[1].cuando, 13.0);
  });

  test("y no es un cartel de carga: llega cuando ya estás andando", () => {
    // El control de que el número significa algo: si alguien lo pone a 0
    // pensando que es la pantalla de carga, esto se pone rojo.
    assert.ok(RETARDO_INTRO >= 10, "a los diez segundos, no al entrar");
  });
});

describe("lo que ve un personaje recién hecho en Gate City", () => {
  const avisos = presentacion(GATECITY, 12);

  test("son tres, y el tercero es el que faltaba", () => {
    assert.equal(avisos.length, 3);
    assert.deepEqual(avisos.map((a) => a.titulo), ["Gatecity", TITULO_DIFICULTAD, TITULO_AVISO]);
  });

  test("el segundo dice la banda que el mapa declara de sí mismo", () => {
    assert.equal(avisos[1].texto, "Levels 10-25 / 100-400hp");
  });

  test("el tercero es literal, con su falta de ortografía y todo", () => {
    // `player_main.script:556`. Dice «maybe» donde querría decir «may be», y
    // se porta así: una cita reescrita ya no es una cita.
    assert.equal(avisos[2].texto, TEXTO_AVISO);
    assert.equal(TEXTO_AVISO, "This area maybe too difficult at your level!");
  });
});

describe("los tres guardias del aviso de dificultad", () => {
  test("con vida por encima del umbral no avisa", () => {
    const a = presentacion(GATECITY, 150);
    assert.equal(a.length, 2);
    assert.ok(!a.some((x) => x.titulo === TITULO_AVISO));
  });

  test("justo en el umbral tampoco: la comparación es «<», no «<=»", () => {
    const a = presentacion(GATECITY, 100);
    assert.ok(!a.some((x) => x.titulo === TITULO_AVISO));
    // Y un punto por debajo sí, que es el control de que la línea de arriba
    // mide el borde y no que el aviso esté roto del todo.
    assert.ok(presentacion(GATECITY, 99).some((x) => x.titulo === TITULO_AVISO));
  });

  test("por debajo de 5 hp no avisa, aunque esté muy por debajo del umbral", () => {
    // `if game.monster.maxhp >= 5`, el guardia suelto de :555.
    assert.equal(VIDA_MINIMA, 5);
    assert.ok(!presentacion(GATECITY, 4).some((x) => x.titulo === TITULO_AVISO));
    assert.ok(presentacion(GATECITY, 5).some((x) => x.titulo === TITULO_AVISO));
  });

  test("en un mapa sin umbral no avisa a nadie, por poca vida que tenga", () => {
    // Edana: `G_WARN_HP 0`. Es el mapa de principiantes y por eso calla.
    assert.ok(!presentacion(EDANA, 5).some((x) => x.titulo === TITULO_AVISO));
    assert.equal(presentacion(EDANA, 5).length, 2);
  });
});

describe("los fallos que se portan con el fallo", () => {
  test("un mapa sin nombre no dice NADA, ni siquiera su dificultad", () => {
    // El guardia de `:1027` es sobre `G_MAP_NAME`, así que corta la cadena
    // entera antes de llegar a `give_map_diff`. Un mapa que declara la banda
    // pero no se presenta se la calla.
    const mudo = { nombre: null, descripcion: "algo", dificultad: "Levels 1-5", avisoVida: 500 };
    assert.deepEqual(presentacion(mudo, 12), []);
  });

  test("un mapa sin dificultad se presenta igual, sólo que sin la segunda línea", () => {
    const m = { nombre: "Sitio", descripcion: "Un sitio.", dificultad: null, avisoVida: 0 };
    const a = presentacion(m, 12);
    assert.equal(a.length, 1);
    assert.equal(a[0].titulo, "Sitio");
  });

  test("pero el aviso de vida sí sale sin dificultad declarada", () => {
    // Son dos `if` independientes en el mismo evento, no un `else`.
    const m = { nombre: "Sitio", descripcion: "Un sitio.", dificultad: null, avisoVida: 500 };
    const a = presentacion(m, 12);
    assert.deepEqual(a.map((x) => x.titulo), ["Sitio", TITULO_AVISO]);
  });
});
