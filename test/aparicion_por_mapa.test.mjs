// DÓNDE APARECE UN PERSONAJE NUEVO, en un mapa que no es Gate City.
//
// ── Por qué esto existe ───────────────────────────────────────────────────
//
// `tools/aparicion.mjs` elegía el sitio comparándolo con el `ms_player_begin`
// del mapa y exigiéndole que le GANARA en luz, en hostiles y en zona de
// pueblo. Sobre Gate City eso es cierto: su punto de inicio deja al jugador en
// una cueva con tres goblins a menos de 15 m y fuera de toda zona. Sobre Edana
// no: su `ms_player_begin` tiene cero hostiles y luz 193 sobre 255, y pedirle
// al templo que gane en luz es pedirle que sea más claro que el mediodía.
//
// Es la forma del experimento 48 —una regla correcta medida sobre un solo
// mapa— y se arregló invirtiendo el orden: **primero el punto del mapa, que es
// lo que dice el mod (`SPAWN_BEGIN`, `player/player.cpp:2455`), y sólo si
// incumple una regla dura se busca otro**.
//
// Lo que estas comprobaciones vigilan es que la herramienta siga sabiendo
// contestar las dos cosas: que en Gate City hay motivo para cambiar el punto y
// que está medido, y que en Edana no lo hay y se respeta. Se lee la salida de
// verdad; si `build/` no está, se saltan y lo dicen.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const cargar = (m) => {
  const r = `build/${m}/aparicion.json`;
  return existsSync(r) ? JSON.parse(readFileSync(r, "utf8")) : null;
};

/** Los que podían fallar y fallaron. Un `n/a` no cuenta como verde. */
const rojos = (j) => (j.controles ?? []).filter((c) => c.aplica && !c.bien);

describe("la elección del sitio de aparición vale para más de un mapa", () => {
  test("Gate City CAMBIA el punto del mapa, y el motivo está medido", (t) => {
    const j = cargar("gatecity");
    if (!j) return t.skip("no está build/gatecity/aparicion.json");
    assert.equal(j.criterio.seCambioElPuntoDelMapa, true);
    // No vale «se cambió»: tiene que decir QUÉ incumple, y son sus goblins.
    assert.ok(j.criterio.loQueFallaElPuntoDelMapa.length > 0, "sin motivo apuntado");
    assert.ok(j.criterio.loQueFallaElPuntoDelMapa.some((f) => f.includes("hostil")),
      `esperaba los goblins: ${JSON.stringify(j.criterio.loQueFallaElPuntoDelMapa)}`);
    assert.equal(j.criterio.hayPueblos, true);
  });

  test("y Edana lo RESPETA, porque su punto de inicio está bien", (t) => {
    const j = cargar("edana");
    if (!j) return t.skip("no está build/edana/aparicion.json");
    assert.equal(j.criterio.seCambioElPuntoDelMapa, false);
    assert.deepEqual(j.criterio.loQueFallaElPuntoDelMapa, []);
    // Y el dato que lo hace distinto de Gate City, medido en el experimento 48.
    assert.equal(j.criterio.hayPueblos, false);
    assert.equal(j.nacimiento.nombre, "ms_player_begin");
    assert.equal(j.nacimiento.hostiles15, 0);
  });

  test("ningún control APLICABLE en rojo, en los dos mapas", (t) => {
    let mirados = 0;
    for (const m of ["gatecity", "edana"]) {
      const j = cargar(m);
      if (!j) continue;
      mirados++;
      assert.deepEqual(rojos(j).map((c) => `${m}: ${c.que}`), []);
    }
    if (!mirados) t.skip("no hay ningún build/<mapa>/aparicion.json");
  });

  test("y los que no aplican dicen POR QUÉ, en vez de contar como verdes", (t) => {
    const j = cargar("edana");
    if (!j) return t.skip("no está build/edana/aparicion.json");
    const na = j.controles.filter((c) => !c.aplica);
    // Edana tiene que traer varios: es el mapa sin zonas de pueblo y sin rama
    // de ancla. Si no trajera ninguno, el reparto aplica/no aplica no estaría
    // haciendo nada y esto sería el apartado 4 de CLAUDE.md otra vez.
    assert.ok(na.length >= 5, `sólo ${na.length} controles marcados n/a`);
    for (const c of na) {
      assert.equal(c.bien, null, `${c.que} no aplica pero trae veredicto`);
      assert.ok(c.porQueNo?.length > 10, `${c.que} no dice por qué no aplica`);
    }
    // Y el de la zona de pueblo tiene que ser uno de ellos, con su motivo.
    assert.ok(na.some((c) => c.porQueNo.includes("msarea_town")),
      "el control de la zona de pueblo debería declararse no aplicable");
  });

  test("CONTROL: el detector de rojos SÍ ve uno cuando lo hay", () => {
    // Sin esto, «ningún control en rojo» estaría verde también con un filtro
    // que no filtra — que es como se cuelan los ceros que no miden nada.
    const falso = { controles: [
      { que: "a", aplica: true, bien: true },
      { que: "b", aplica: false, bien: null, porQueNo: "x" },
      { que: "c", aplica: true, bien: false },
    ] };
    assert.deepEqual(rojos(falso).map((c) => c.que), ["c"]);
  });

  test("el ancla no está escrita a mano en ningún sitio", () => {
    // Los cuatro scripts con `help/first_npc` se buscan al hornear. Una lista
    // escrita era correcta y no se enteraba de un mapa nuevo.
    const fuente = readFileSync("tools/aparicion.mjs", "utf8");
    const sinComentarios = fuente.split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
    for (const n of ["gatecity/priest", "gatecity/masterp", "edana/priest", "edana/masterp"]) {
      assert.ok(!sinComentarios.includes(`"${n}"`), `«${n}» escrito a mano en tools/aparicion.mjs`);
    }
    assert.match(sinComentarios, /anclasDelMod\(/, "y el grep que las deriva tiene que seguir ahí");
  });
});
