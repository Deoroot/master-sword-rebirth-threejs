// EL NOMBRE DE UN NPC SE PARTE POR LA BARRA (`ScriptCmd_Name`, scriptcmds.cpp:4371-4412).
//
// `name a|Goblin` es el prefijo «a» y el nombre «Goblin»; `name |Mayor Vilhelm`
// es un nombre sin prefijo. Lo que se enseña es el nombre. El puerto guardaba el
// texto crudo y sacaba la barra a pantalla: «|Mayor Vilhelm says, …».

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { Manada, partirNombreDeFicha } from "../src/play/manada.js";

test("la barra separa prefijo y nombre, y lo que queda en `nombre` es lo que se enseña", () => {
  assert.deepEqual(partirNombreDeFicha({ nombre: "|Mayor Vilhelm" }), { nombre: "Mayor Vilhelm", prefijoDeNombre: "" });
  assert.deepEqual(partirNombreDeFicha({ nombre: "a|Goblin" }), { nombre: "Goblin", prefijoDeNombre: "a" });
  assert.deepEqual(partirNombreDeFicha({ nombre: "a murder of|crows" }), { nombre: "crows", prefijoDeNombre: "a murder of" });
  // Sin barra no se toca nada, ni se inventa un prefijo.
  assert.deepEqual(partirNombreDeFicha({ nombre: "Giant Rat" }), { nombre: "Giant Rat" });
  // Y partirlo dos veces no se come nada: la segunda ya no encuentra barra.
  const f = partirNombreDeFicha({ nombre: "a|Goblin" });
  assert.deepEqual(partirNombreDeFicha(f), { nombre: "Goblin", prefijoDeNombre: "a" });
  assert.equal(partirNombreDeFicha(null), null);
});

test("la MANADA lo parte al cargar: es por donde entran todas las fichas", () => {
  // El control va donde el mecanismo se dispara (CLAUDE.md §4, el 59): no basta
  // con que la función sepa partir, tiene que llamarla quien carga las fichas.
  const ficha = (nombre) => ({ script: "x/y", clave: "b", nombre, hp: 10, ancho: 32, alto: 72, escena: [0, 0, 0], yaw: 0, ia: {} });
  const m = new Manada({ colocados: [ficha("|Mayor Vilhelm"), ficha("a|Goblin"), ficha("Giant Rat")] },
    { secuenciasPorClave: new Map([["b", []]]) });
  const nombres = m.instancias.map((i) => [i.ficha.nombre, i.ficha.prefijoDeNombre ?? null]);
  assert.deepEqual(nombres, [["Mayor Vilhelm", ""], ["Goblin", "a"], ["Giant Rat", null]]);
});

test("y en lo horneado de Gate City ya no queda un nombre que se enseñe con barra", (t) => {
  const ruta = "build/gatecity/bichos.json";
  if (!existsSync(ruta)) { t.skip("sin build/gatecity: hornéalo"); return; }
  const censo = JSON.parse(readFileSync(ruta, "utf8"));
  const crudos = censo.colocados.filter((c) => String(c.nombre).includes("|")).map((c) => c.nombre);
  // El segundo caso tiene que existir: si el horneado no trae ninguno con barra,
  // esta prueba no mide nada y lo dice.
  assert.ok(crudos.length > 0, "Gate City no trae ningún nombre con barra: esta prueba ya no mide nada");
  const m = new Manada(censo, { secuenciasPorClave: new Map() });
  assert.deepEqual(m.instancias.filter((i) => String(i.ficha.nombre).includes("|")).map((i) => i.ficha.nombre), []);
  assert.ok(m.instancias.some((i) => i.ficha.nombre === "Mayor Vilhelm"));
});
