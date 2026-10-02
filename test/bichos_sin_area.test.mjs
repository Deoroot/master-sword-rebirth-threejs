// UNA PLANTILLA QUE APUNTA A UN ÁREA QUE NO EXISTE.
//
// El extractor de NPC paraba el horneado cuando encontraba una, con un motivo
// escrito al lado que era bueno: «un bicho que no existe no se ve por ningún
// lado». El motivo valía; la regla, no: estaba medida sobre Gate City, donde
// no pasa nunca. Edana tiene una plantilla que apunta a `patron9`, un área que
// el mapa no trae, y con eso la extracción de sus NPC no llegaba al final.
//
// Lo que hace el motor está escrito (`msmonsterserver.cpp:106-130`): busca el
// área, no la encuentra, escribe «ERROR: msarea_monsterspawn named %s NOT
// FOUND» y **borra la plantilla**. El mapa se juega con ese bicho ausente.
//
// Estas comprobaciones miran la salida de verdad, que es donde se ve si el
// extractor hizo lo que el motor hace. Si `build/` no está, se saltan y lo
// dicen.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const cargar = (m) => {
  const r = `build/${m}/bichos.json`;
  return existsSync(r) ? JSON.parse(readFileSync(r, "utf8")) : null;
};

/** Las plantillas cuyo área no está en el mapa. Lo que el motor tira. */
const huerfanas = (j) => {
  const areas = new Set((j.areas ?? []).map((a) => a.nombre));
  return (j.colocados ?? []).filter((c) => c.aparecedor && !areas.has(c.aparecedor.area));
};

describe("el censo de NPC deja fuera las plantillas sin área, como el motor", () => {
  test("Edana se extrae ENTERA, que es lo que antes no pasaba", (t) => {
    const j = cargar("edana");
    if (!j) return t.skip("no está build/edana/bichos.json");
    assert.ok((j.colocados ?? []).length > 30, `${j.colocados?.length} colocados`);
    assert.ok((j.areas ?? []).length > 10, `${j.areas?.length} áreas`);
  });

  test("y `patron9` no está entre sus áreas ni entre sus plantillas", (t) => {
    const j = cargar("edana");
    if (!j) return t.skip("no está build/edana/bichos.json");
    // El control de que esto mide algo: el área que SÍ existe con un nombre
    // casi igual. Si el filtro se pasara de listo, se llevaría ésta por
    // delante y la cuenta de plantillas se desplomaría.
    const nombres = (j.areas ?? []).map((a) => a.nombre);
    assert.ok(!nombres.includes("patron9"), "`patron9` no existe en el mapa");
    assert.ok(nombres.includes("patron8") && nombres.includes("patron10"),
      "pero sus vecinas sí, y siguen ahí");
    assert.deepEqual(huerfanas(j), [], "ninguna plantilla se quedó apuntando al vacío");
    assert.ok((j.colocados ?? []).filter((c) => c.aparecedor).length >= 19,
      "y el resto de plantillas NO se fue con ella");
  });

  test("Gate City no tiene ninguna huérfana, y por eso no se notaba", (t) => {
    const j = cargar("gatecity");
    if (!j) return t.skip("no está build/gatecity/bichos.json");
    assert.deepEqual(huerfanas(j), []);
    assert.equal((j.colocados ?? []).filter((c) => c.aparecedor).length, 38);
  });

  test("CONTROL: el detector SÍ ve una huérfana cuando la hay", () => {
    // Sin esto, los tres de arriba estarían verdes también con un detector
    // que no detecta nada — que es el fallo del apartado 4 de CLAUDE.md.
    const falso = {
      areas: [{ nombre: "patron8" }],
      colocados: [
        { aparecedor: { area: "patron8" } },
        { aparecedor: { area: "patron9" } },
        { aparecedor: null },
      ],
    };
    assert.equal(huerfanas(falso).length, 1);
    assert.equal(huerfanas(falso)[0].aparecedor.area, "patron9");
  });

  test("y las dos áreas de Edana que se llaman IGUAL siguen las dos", (t) => {
    const j = cargar("edana");
    if (!j) return t.skip("no está build/edana/bichos.json");
    // `FIND_ENTITY_BY_TARGETNAME` las recorre todas y `RANDOM_LONG` elige una
    // (msmonsterserver.cpp:106-121), así que quedarse con la primera cambiaría
    // dónde aparecen las ratas del templo.
    const ratas = (j.areas ?? []).filter((a) => a.nombre === "templerats");
    assert.equal(ratas.length, 2);
  });
});
