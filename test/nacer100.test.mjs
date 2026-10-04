// EL 100: el nacimiento de Gate City, otra vez bajo un rayo de luz y con la
// caja del jugador dentro (tools/aparicion.mjs `bajoElRayo`;
// doc/SERVIDOR_100.md §5).
//
// Lee el HORNEADO de verdad —el que cargan el navegador y el servidor— y le
// pregunta al `.bsp` por su cuenta: la huella del rayo sale del brush, no del
// horneado. `APARICION100=<ruta>` lo apunta a otro archivo, que es como se
// rompe a propósito sin tocar `build/` (es de todas las sesiones).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const APARICION = process.env.APARICION100 ?? "build/gatecity/aparicion.json";
const HAY = existsSync(APARICION) && existsSync("../MSC/assets/msr/maps/gatecity.bsp");
const MEDIA_CAJA = 16;   // VEC_HULL_MIN/MAX, util.h:464-465

describe("el nacimiento de Gate City, bajo el rayo y con la caja dentro", { skip: !HAY && "sin build/gatecity o sin ../MSC" }, async () => {
  const { leerBsp, leerModelos } = await import("../src/bsp/lector.js");
  const { cabeDePie } = await import("../src/bsp/arbol.js");
  const ap = JSON.parse(readFileSync(APARICION, "utf8"));
  const bsp = leerBsp("../MSC/assets/msr/maps/gatecity.bsp");
  const modelos = leerModelos(bsp);
  const nac = ap.nacimiento;
  const m = nac.rayo ? modelos[Number(nac.rayo.modelo.slice(1))] : null;

  test("es un rayo de luz: un func_illusionary con rendermode 5 del mapa", () => {
    assert.equal(nac.familia, "rayo", nac.nombre);
    assert.ok(m, `el modelo ${nac.rayo?.modelo} existe en el .bsp`);
  });
  test("la huella del brush (leída del .bsp) se mete en la planta de la caja: menos de 16 u en cada eje", () => {
    const [x, y] = nac.unidades;
    const fuera = [Math.max(m.mins[0] - x, 0, x - m.maxs[0]), Math.max(m.mins[1] - y, 0, y - m.maxs[1])];
    assert.ok(fuera[0] < MEDIA_CAJA && fuera[1] < MEDIA_CAJA, `a ${fuera.join(" y ")} u de la huella`);
  });
  test("la caja cabe donde nace (casco 1), y el nacimiento y la reaparición son el mismo sitio", () => {
    assert.equal(cabeDePie(bsp, nac.unidades), true);
    assert.deepEqual(ap.reaparicion.unidades, nac.unidades);
  });
  test("CONTROL: en el CENTRO del rayo no cabe — por eso hay que apartarlo", () => {
    const c = [(m.mins[0] + m.maxs[0]) / 2, (m.mins[1] + m.maxs[1]) / 2, nac.unidades[2]];
    assert.equal(cabeDePie(bsp, c), false, `centro [${c}]`);
    assert.ok(nac.rayo.apartadoUnidades > 0 && nac.rayo.apartadoUnidades <= 64, `apartado ${nac.rayo.apartadoUnidades}`);
  });
  test("los controles de la herramienta que miran el rayo aplican y están en verde", () => {
    for (const que of ["el rayo cae sobre la caja del jugador", "apartar salva rayos que en su centro no caben",
      "cabe la CAJA del jugador donde aparece (casco 1)"]) {
      const c = ap.controles.find((x) => x.que === que);
      assert.ok(c?.aplica && c.bien, `${que}: ${JSON.stringify(c)}`);
    }
  });
});
