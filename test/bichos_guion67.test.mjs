// `scriptfile` GANA A `defscriptfile`, Y ESTABA AL REVÉS — el 67.
//
// Una entidad de bicho puede traer las dos claves. El motor:
//
//     else if (FStrEq(pkvd->szKeyName, "scriptfile") ||
//         (FStrEq(pkvd->szKeyName, "defscriptfile") && !m_ScriptName))
//     {
//         m_ScriptName = pkvd->szValue;
//                                            msmonsterserver.cpp:415-419
//
// `scriptfile` escribe **siempre**; `defscriptfile` sólo si `m_ScriptName` está
// vacío. O sea que el orden dentro de la entidad da igual, y `defscriptfile` es
// lo que su nombre dice: el valor por omisión que el editor deja puesto.
//
// El extractor hacía `defscriptfile ?? scriptfile`, que es exactamente lo
// contrario, y **no daba ningún error** porque el valor de reposo es un bicho
// válido. Medido sobre los 93 mapas del juego: **3 373 criaturas en 81 mapas**
// salían con el guion de su clase en vez del suyo.
//
// ── LO QUE COSTABA, EN LOS DOS MAPAS PORTADOS ───────────────────────────────
//
// Edana, 10 —y seis son vecinos con nombre—:
//
//   NPCs/default_human (Commoner)   ->  edana/highpriest  (High Priest)      x2
//   NPCs/default_human (Commoner)   ->  edana/priest      (Priest of Urdual) x3
//   NPCs/default_human (Commoner)   ->  edana/masterp     (Sembelbin)
//   NPCs/default_human (Commoner)   ->  edana/oldman      (Old man)
//   worlditems/treasurechest        ->  edana/eTC1        (el cofre del alcalde)
//   monsters/boar (Wild Boar, 20hp) ->  edana/boarhard    (Ferocious, 25hp)
//   monsters/boar (Wild Boar, 20hp) ->  edana/boarboss    (Huge Aggressive, 60hp)
//
// Gate City, 4: cuatro `msmonster_giantrat` que son **Cave Spiderling** de 15 de
// vida y salían como ratas de 4. Y ahí está la razón de que nadie lo viera en
// veinte experimentos: con cuatro ratas de más nadie mira, y el mapa que sí lo
// gritaba —seis vecinos sin nombre— llegó en el 48. Quinta vez seguida que el
// fallo lo enseña el segundo mapa (50, 60, 61, 63, 67).

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { guionDeEntidad } from "../src/bsp/script.js";

const censo = (m) => {
  const r = `build/${m}/bichos.json`;
  return existsSync(r) ? JSON.parse(readFileSync(r, "utf8")) : null;
};

describe("qué guion lleva una entidad (67)", () => {
  // ── LA REGLA, con los dos órdenes de clave ────────────────────────────────
  //
  // Los dos casos importan porque la tentación es leer el `else if` del motor
  // como «depende de cuál venga primero», y no depende: la primera rama es
  // incondicional. Si esto se escribiera con un `??` invertido, el caso de
  // abajo seguiría verde y el de arriba no.
  test("con las dos claves gana `scriptfile`, venga antes o después", () => {
    assert.equal(guionDeEntidad({ defscriptfile: "monsters/boar", scriptfile: "edana/boarboss" }),
      "edana/boarboss");
    assert.equal(guionDeEntidad({ scriptfile: "edana/boarboss", defscriptfile: "monsters/boar" }),
      "edana/boarboss");
  });

  test("con una sola clave, la que haya", () => {
    assert.equal(guionDeEntidad({ defscriptfile: "monsters/boar" }), "monsters/boar");
    assert.equal(guionDeEntidad({ scriptfile: "monsters/boar" }), "monsters/boar");
  });

  test("sin ninguna, `null` — que es un caso y no un error", () => {
    // Lo usa el extractor para contar «entidades sin guion» en vez de inventar
    // uno a partir del `classname`, que es la trampa del 02.
    assert.equal(guionDeEntidad({ classname: "msmonster_boar" }), null);
    assert.equal(guionDeEntidad({}), null);
    assert.equal(guionDeEntidad(null), null);
  });

  test("una clave vacía no cuenta como clave", () => {
    // `!m_ScriptName` es falso con la cadena vacía, así que un `scriptfile ""`
    // deja pasar al `defscriptfile`. Es por lo que esto va con `||` y no `??`.
    assert.equal(guionDeEntidad({ scriptfile: "", defscriptfile: "monsters/boar" }), "monsters/boar");
  });

  // ── Y EL EFECTO SOBRE EL HORNEADO, que es lo que se veía jugando ──────────
  test("el jefe de los jabalíes de Edana es el jefe, y tiene 60 de vida", (t) => {
    const j = censo("edana");
    if (!j) return t.skip("no está build/edana/bichos.json");
    const jefe = j.colocados.filter((b) => b.script === "edana/boarboss");
    assert.equal(jefe.length, 1, "edana coloca un boarboss");
    assert.equal(jefe[0].nombre, "Huge Aggressive Wild Boar");
    // Con la precedencia al revés eran 20, los de un jabalí cualquiera.
    assert.equal(jefe[0].hp, 60);
  });

  test("y los sacerdotes de Edana son sacerdotes, no «Commoner»", (t) => {
    const j = censo("edana");
    if (!j) return t.skip("no está build/edana/bichos.json");
    const nombres = j.colocados.map((b) => b.nombre);
    assert.ok(nombres.includes("High Priest"), "el sumo sacerdote");
    assert.ok(nombres.includes("Priest of Urdual"), "los sacerdotes");
    assert.ok(nombres.includes("Sembelbin"), "el maestro");
    assert.ok(nombres.includes("Old man"), "el viejo del huerto, el del jefe jabalí");
    // El control negativo, y NO es «cero»: Edana tiene **tres** `ms_npc` cuya
    // única clave es `scriptfile "NPCs/default_human"` —sin `defscriptfile`—,
    // o sea tres paisanos anónimos de verdad. Con la precedencia al revés eran
    // diez. La primera versión de esta prueba pedía cero y se puso roja con el
    // arreglo puesto; se comprobó en el `.bsp` y la prueba estaba mal.
    assert.equal(j.colocados.filter((b) => b.script === "NPCs/default_human").length, 3,
      "sólo los tres paisanos que el mapa pide por su nombre");
  });

  test("y las cuatro ratas de Gate City son arañas: el segundo mapa", (t) => {
    const j = censo("gatecity");
    if (!j) return t.skip("no está build/gatecity/bichos.json");
    const ar = j.colocados.filter((b) => b.script === "monsters/spider_mini");
    assert.equal(ar.length, 4);
    assert.equal(ar[0].nombre, "Cave Spiderling");
    assert.equal(ar[0].hp, 15);
    // Y su `classname` sigue siendo `msmonster_giantrat`: es la trampa del 02
    // otra vez, y aquí se deja escrito que el nombre de la clase no manda.
    assert.equal(ar[0].clase, "msmonster_giantrat");
  });
});

// ── Y EL DAÑO, QUE SE DECLARA DE TRES MANERAS ───────────────────────────────
//
// `iaDe` sólo conocía una. Las tres, con su ejemplo del mod:
//
//   1. `setvar ATTACK_DAMAGE $randf(6,9)`             goblin.script:69
//   2. `dodamage … GORE_FORWARD_DAMAGE …`             boar.script:28
//   3. `const ATTACK_DAMAGE_LOW/HIGH`                 spider.script:25-26
//
// Un `dano` a `null` no da error: da un bicho que te persigue, te embiste y no
// te quita vida. Y las sondas de combate del proyecto —`golpe`, `mundo`, `ia`—
// estaban todas verdes porque miden contra goblins y zombis, que son del estilo
// 1. Nunca se había puesto un control delante de una araña a ver si muerde.
describe("el daño de un bicho, y sus tres formas de declararse (67)", () => {
  test("el estilo VIEJO: el jabalí de Edana hace el daño de su `dodamage`", (t) => {
    const j = censo("edana");
    if (!j) return t.skip("no está build/edana/bichos.json");
    // `const GORE_FORWARD_DAMAGE 1.0` en `monsters/boar.script:9`.
    const b = j.colocados.find((x) => x.script === "monsters/boar");
    assert.deepEqual(b.ia.dano, { min: 1, max: 1 });
    // Y el jefe lo pisa con su propio 3 (`edana/boarboss.script:5`), que es el
    // segundo caso: si se leyera de la plantilla, los dos valdrían 1.
    const jefe = j.colocados.find((x) => x.script === "edana/boarboss");
    assert.deepEqual(jefe.ia.dano, { min: 3, max: 3 });
  });

  test("el estilo del PAR: las arañas de Gate City muerden", (t) => {
    const j = censo("gatecity");
    if (!j) return t.skip("no está build/gatecity/bichos.json");
    // `ATTACK_DAMAGE_LOW 2.0` / `HIGH 3.0`, y la cría con los suyos.
    assert.deepEqual(j.colocados.find((x) => x.script === "monsters/spider").ia.dano,
      { min: 2, max: 3 });
    assert.deepEqual(j.colocados.find((x) => x.script === "monsters/spider_mini").ia.dano,
      { min: 1, max: 2 });
  });

  test("el estilo NUEVO sigue ganando: el goblin no cambia", (t) => {
    const j = censo("gatecity");
    if (!j) return t.skip("no está build/gatecity/bichos.json");
    // Es el control de que las fuentes nuevas van DETRÁS y no pisan a nadie.
    assert.deepEqual(j.colocados.find((x) => x.script === "monsters/goblin").ia.dano,
      { min: 6, max: 9 });
  });

  test("un paisano sigue sin daño, y eso es correcto", (t) => {
    const j = censo("edana");
    if (!j) return t.skip("no está build/edana/bichos.json");
    // El control negativo: si la regla nueva le diera daño a todo el mundo,
    // Edana sería un pueblo de aldeanos que pegan. El guardia del alcalde
    // también se queda sin: su único `dodamage` es contra `ent_laststole`, o sea
    // el castigo por robarle, y no su ataque.
    assert.equal(j.colocados.find((x) => x.script === "NPCs/default_human").ia.dano, null);
    assert.equal(j.colocados.find((x) => x.script === "edana/mayorguard").ia.dano, null);
  });
});
