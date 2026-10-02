// EL `#include` SE RESUELVE EN SU LÍNEA, Y ESO DECIDE NÚMEROS — el 66.
//
// `cargarGuion` subía **todos** los `#include` al principio, con un comentario
// encima que decía «en el sitio en que aparece» y hacía lo contrario. El motor
// los resuelve dentro del analizador de líneas:
//
//     else if (!_stricmp(TestCommand, "#include")) {
//       ...
//       bool fSucces = Spawn(FileName, m.pScriptedEnt, ...);
//                                            script.cpp:5229, 5255
//
// Y no es cosmético, porque `const` **gana el primero**:
//
//     for (int i = 0; i < m_Constants.size(); i++)
//       if (m_Constants[i].Name == VarName) { AddConst = false; break; }
//                                            script.cpp:5419-5433
//
// Un guion de Master Sword está escrito para aprovecharlo: los números propios
// arriba, el `#include` que dice qué es debajo. Con los `#include` subidos, cada
// entidad se quedaba con los valores de su plantilla.
//
// ── LO QUE COSTABA, MEDIDO ──────────────────────────────────────────────────
//
// **593 de los 760 objetos** del catálogo tenían algún `const` con el valor de
// su plantilla —2 623 en total—, y en los dos mapas portados:
//
//   · `monsters/goblin`  SOUND_DEATH  `none` → `monsters/goblin/c_goblin_dead.wav`
//     El goblin **moría en silencio**.
//   · `monsters/spider`  PARRY_TYPE   `parried!` → `dodged!`
//   · `edana/urdauf`     CHAT_AUTO_HAIL `0` → `1`
//     Dos vecinos de Edana te saludan al acercarte, y no lo hacían.
//
// Nada de eso ponía nada rojo: 1 571 pruebas y las sondas seguían verdes con
// los 2 623 valores mal. Por eso estas pruebas existen — y por eso van sobre
// un caso mínimo escrito aquí, que es el único sitio donde se puede tener las
// DOS versiones para comparar.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { partirGuion } from "../src/play/guion.js";

// ── EL CASO MÍNIMO ──────────────────────────────────────────────────────────
//
// Un objeto escrito como los de MSR: su número, luego el `#include`, luego su
// ficha. Se resuelven los `#include` contra este mapa en vez de contra el
// disco, que es lo mismo que hace `cargarGuion` con `leerScript`.
const ARCHIVOS = {
  "el_objeto": `
{
  const DANO 90
  const NOMBRE_ANIM shortsword
}
#include la_plantilla
{ game_spawn
  name Rusty Short Sword
}
`,
  "la_plantilla": `
{
  const DANO 10
  const NOMBRE_ANIM generico
  const PESO 5
}
{ game_spawn
  name Generic Sword
}
`,
};

/** El cargador de `tools/scriptsmsr.mjs`, con el disco cambiado por el mapa. */
function cargar(ruta, vistos = new Set()) {
  if (vistos.has(ruta)) return { eventos: [] };
  vistos.add(ruta);
  const texto = ARCHIVOS[ruta];
  if (texto === undefined) return { eventos: [] };
  const propio = partirGuion(texto);
  const eventos = [];
  for (const pieza of propio.piezas) {
    if (pieza.evento) { eventos.push(pieza.evento); continue; }
    if (pieza.include) eventos.push(...cargar(pieza.include, vistos).eventos);
  }
  return { eventos };
}

/** El de ANTES del 66: todos los `#include` delante. Está aquí para comparar. */
function cargarSubiendo(ruta, vistos = new Set()) {
  if (vistos.has(ruta)) return { eventos: [] };
  vistos.add(ruta);
  const texto = ARCHIVOS[ruta];
  if (texto === undefined) return { eventos: [] };
  const propio = partirGuion(texto);
  const eventos = [];
  for (const inc of propio.includes) eventos.push(...cargarSubiendo(inc, vistos).eventos);
  eventos.push(...propio.eventos);
  return { eventos };
}

/** Qué valor gana cada `const`: el PRIMERO que se lee. script.cpp:5419-5433. */
function constantes(eventos) {
  const m = new Map();
  const paseo = (cmds) => {
    for (const c of cmds ?? []) {
      if (c.nombre === "const" && c.params?.[0] && !m.has(c.params[0])) {
        m.set(c.params[0], c.params.slice(1).join(" "));
      }
      paseo(c.hijos);
      for (const r of c.sino ?? []) paseo(r);
    }
  };
  for (const e of eventos) if (!e.nombre) paseo(e.cmds);
  return m;
}

describe("el `#include` se resuelve en su línea (66)", () => {
  test("`partirGuion` dice DÓNDE estaba cada `#include`, no sólo que había uno", () => {
    const p = partirGuion(ARCHIVOS.el_objeto);
    // La lista suelta se queda, que hay quien sólo quiere los nombres.
    assert.deepEqual(p.includes, ["la_plantilla"]);
    // Y `piezas` lleva el archivo EN ORDEN. Los `const` de la cabecera salen
    // dos veces a propósito: como parte del bloque sin nombre —que es un
    // evento— y aparte, porque el motor también los evalúa al cargar.
    assert.deepEqual(
      p.piezas.map((x) => (x.include ? `#include ${x.include}` : x.evento ? `{${x.evento.nombre}}` : `const ${x.preload?.nombre}`)),
      ["{}", "const DANO", "const NOMBRE_ANIM", "#include la_plantilla", "{game_spawn}"],
    );
    // Lo que importa es que TODO lo del objeto queda delante del `#include`.
    const i = p.piezas.findIndex((x) => x.include);
    assert.equal(i, 3);
    assert.equal(p.piezas.length, 5);
  });

  test("el objeto se queda con SUS números, no con los de la plantilla", () => {
    const c = constantes(cargar("el_objeto").eventos);
    assert.equal(c.get("DANO"), "90", "si sale 10, los `#include` se están subiendo otra vez");
    assert.equal(c.get("NOMBRE_ANIM"), "shortsword");
    // Y lo que el objeto NO declara sí lo hereda: es lo que hace útil heredar.
    assert.equal(c.get("PESO"), "5");
  });

  // ── EL CONTROL QUE HACE VALER AL DE ARRIBA ────────────────────────────────
  //
  // Sin esto, «el objeto se queda con sus números» pasaría igual si la
  // plantilla no declarara `DANO`: el valor correcto y el valor de reposo
  // serían el mismo, que es el fallo del experimento 50. Aquí el caso está
  // construido para que los dos cargadores den valores DISTINTOS, y se
  // comprueba que el viejo da el equivocado.
  test("y el cargador de antes daba el de la plantilla: los dos casos existen", () => {
    const viejo = constantes(cargarSubiendo("el_objeto").eventos);
    assert.equal(viejo.get("DANO"), "10");
    assert.equal(viejo.get("NOMBRE_ANIM"), "generico");
    const nuevo = constantes(cargar("el_objeto").eventos);
    assert.notEqual(viejo.get("DANO"), nuevo.get("DANO"),
      "el caso no discrimina: los dos cargadores dan lo mismo y la prueba de arriba no mide nada");
  });

  test("el `const` de FUERA de todo bloque va por el mismo camino", () => {
    // `setvar`/`const` sueltos van a `preload`, y el motor los lee en su línea
    // igual que los de dentro. Si `piezas` no los llevara, un `#include`
    // detrás de ellos ganaría.
    const p = partirGuion("{\n const A 1\n}\n#include otro\n");
    const tipos = p.piezas.map((x) => (x.include ? "inc" : x.evento ? "ev" : "pre"));
    // El bloque de cabecera aparece como evento Y sus `const` como preload,
    // los dos antes del `#include`.
    assert.ok(tipos.indexOf("inc") > tipos.indexOf("ev"));
    assert.ok(tipos.includes("pre"));
    assert.ok(tipos.indexOf("inc") > tipos.indexOf("pre"));
  });

  test("los eventos de los dos lados están, y en orden de archivo", () => {
    // `RunScriptEventByName` corre TODOS los que se llamen igual
    // (script.cpp:5836), así que los dos `game_spawn` cuentan y el orden decide
    // quién pisa a quién con `name`, que gana el ÚLTIMO.
    const evs = cargar("el_objeto").eventos.filter((e) => e.nombre === "game_spawn");
    assert.equal(evs.length, 2);
    const nombres = evs.map((e) => e.cmds.find((c) => c.nombre === "name")?.params.join(" "));
    assert.deepEqual(nombres, ["Generic Sword", "Rusty Short Sword"],
      "la ficha del objeto tiene que ir DETRÁS de la de su plantilla");
  });
});

// ── Y CONTRA LA HORNEADA DE VERDAD ──────────────────────────────────────────
//
// Lo de arriba mide la regla sobre un caso escrito aquí. Esto mide el efecto
// sobre los dos mapas portados, que es lo que se oye jugando.

const mapa = (n) => {
  try { return JSON.parse(readFileSync(`build/${n}/guiones.json`, "utf8")); }
  catch { return null; }
};
const gc = mapa("gatecity");
const ed = mapa("edana");

/** El valor que gana un `const` en un guion ya horneado. */
function constDe(guion, clave) {
  let v = null;
  const paseo = (cmds) => {
    for (const c of cmds ?? []) {
      if (v === null && c.nombre === "const" && c.params?.[0] === clave) v = c.params.slice(1).join(" ");
      paseo(c.hijos);
      for (const r of c.sino ?? []) paseo(r);
    }
  };
  for (const e of guion.eventos ?? []) if (!e.nombre) paseo(e.cmds);
  return v;
}

describe("el efecto en los dos mapas portados (66)", () => {
  test("hay guiones horneados: si no, lo de abajo se salta", { skip: !gc || !ed }, () => {
    assert.ok(Object.keys(gc.guiones).length >= 25);
    assert.ok(Object.keys(ed.guiones).length >= 22);
  });

  test("el goblin de Gate City ya NO muere en silencio", { skip: !gc }, () => {
    // `playsound 0 5 SOUND_DEATH` — monsters/base_npc.script:178, y `playsound`
    // está portado, así que esto se oye. Con los `#include` subidos ganaba el
    // `const SOUND_DEATH none` de la plantilla y el goblin moría callado.
    const s = constDe(gc.guiones["monsters/goblin"], "SOUND_DEATH");
    assert.notEqual(s, "none", "el goblin volvió a morir en silencio");
    assert.equal(s, "monsters/goblin/c_goblin_dead.wav");
  });

  test("y la araña dice lo suyo al esquivar, que no es «parried!»", { skip: !gc }, () => {
    // Una araña no para golpes: los esquiva. Con la plantilla ganando decía
    // «parried!» como todo el mundo.
    assert.equal(constDe(gc.guiones["monsters/spider"], "PARRY_TYPE"), "dodged!");
  });

  test("dos vecinos de Edana te saludan al acercarte", { skip: !ed }, () => {
    // `CHAT_AUTO_HAIL` a 1 es lo que hace que hablen sin que les pulses. La
    // plantilla lo trae a 0, así que estaban callados.
    assert.equal(constDe(ed.guiones["edana/urdauf"], "CHAT_AUTO_HAIL"), "1");
    assert.equal(constDe(ed.guiones["edana/sumdale"], "CHAT_AUTO_HAIL"), "1");
  });
});
