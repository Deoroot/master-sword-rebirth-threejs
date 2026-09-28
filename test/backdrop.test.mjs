// El paisaje de fondo.
//
// Aqui aparecieron dos fallos que ninguna cifra delataba y que solo se vieron
// mirando: el agujero del terreno era cuadrado con un pueblo rectangular, y
// los carteles llevaban la densidad de niebla escrita a mano. Estas pruebas
// existen para que no vuelvan.

import test from "node:test";
import assert from "node:assert/strict";

import {
  backdropHeight, buildTerrain, scatterTrees, buildBillboards, billboardRight, fbm,
} from "../src/render/backdrop.js";

const FOG = { color: 0x8d8db6, density: 0.009 };

test("el terreno es plano dentro del pueblo y sube fuera", () => {
  assert.equal(backdropHeight(0, 0, [50, 40], 300), 0);
  assert.equal(backdropHeight(49, 39, [50, 40], 300), 0);
  assert.ok(backdropHeight(200, 0, [50, 40], 300) > 5, "no sube al alejarse");
});

test("el agujero es rectangular, no cuadrado", () => {
  // El fallo: con un pueblo de 104x88 y un agujero cuadrado de lado 104, el
  // terreno dejaba ocho metros de vacio al norte y al sur. Desde dentro se
  // veia un hueco detras de la muralla; desde arriba, dos barras palidas.
  const inner = [52, 44];
  // Justo fuera del pueblo por el lado corto tiene que haber terreno, y
  // practicamente a ras: si ahi no hubiera nada, quedaria el vacio.
  assert.ok(backdropHeight(0, 45, inner, 300) < 0.01);
  assert.ok(backdropHeight(0, 120, inner, 300) > 0);
  // Y a la misma distancia del centro, los dos ejes no pueden dar lo mismo:
  // si dieran, el agujero seria cuadrado otra vez.
  const porX = backdropHeight(100, 0, inner, 300);
  const porZ = backdropHeight(0, 100, inner, 300);
  assert.notEqual(porX, porZ);
});

test("la malla del terreno no tiene agujero donde no toca", () => {
  const inner = [20, 16];
  const { mesh, triangles } = buildTerrain({ inner, outer: 120, step: 8 });
  assert.ok(triangles > 100, `solo ${triangles} triangulos`);
  const pos = mesh.geometry.getAttribute("position");
  // Ningun vertice del anillo puede quedar por debajo del suelo del pueblo:
  // si bajara, se veria una grieta alrededor de la muralla.
  for (let i = 0; i < pos.count; i++) {
    assert.ok(pos.getY(i) >= -1e-6, `vertice a ${pos.getY(i)}`);
  }
});

test("el paisaje sale igual en cada carga", () => {
  // Con Math.random() el fondo cambiaria entre ejecuciones y dos capturas del
  // mismo sitio dejarian de poder compararse. El ruido lleva semilla fija.
  assert.equal(fbm(3.7, -2.1, 4), fbm(3.7, -2.1, 4));
  const a = scatterTrees({ inner: [20, 16], outer: 120, count: 60 });
  const b = scatterTrees({ inner: [20, 16], outer: 120, count: 60 });
  assert.equal(a.length, b.length);
  assert.deepEqual(a.map((t) => t.position), b.map((t) => t.position));
});

test("no se siembra ni un arbol dentro del pueblo", () => {
  // Los de dentro vienen del .map, donde tienen su tronco macizo. Uno de
  // fondo dentro del pueblo seria un arbol que se atraviesa.
  const inner = [20, 16];
  for (const t of scatterTrees({ inner, outer: 150, count: 300 })) {
    const dentro = Math.abs(t.position[0]) < inner[0] && Math.abs(t.position[2]) < inner[1];
    assert.ok(!dentro, `arbol en ${t.position} dentro del pueblo`);
  }
});

test("los arboles se posan en el terreno, no flotan", () => {
  const inner = [20, 16];
  const outer = 150;
  for (const t of scatterTrees({ inner, outer, count: 200 })) {
    const suelo = backdropHeight(t.position[0], t.position[2], inner, outer);
    // El pie del cartel tiene que estar en la altura del terreno de su celda.
    assert.ok(Math.abs(t.position[1] - suelo) < 1e-6, `arbol a ${t.position[1]}, suelo ${suelo}`);
    assert.ok(t.height > 0, "arbol de altura cero");
  }
});

test("los carteles no aceptan una niebla inventada", () => {
  // Es el fallo exacto que se vio: la niebla del cartel tiene que venir de la
  // escena, porque la escena calcula su densidad por el tamano del mapa. Con
  // una cifra pegada, el bosque sale de un morado liso y parece un estilo.
  const arboles = scatterTrees({ inner: [20, 16], outer: 120, count: 20 });
  assert.throws(() => buildBillboards(arboles, null), /niebla de la escena/);
});

test("los carteles llevan la niebla que se les pasa", () => {
  const arboles = scatterTrees({ inner: [20, 16], outer: 120, count: 20 });
  const b = buildBillboards(arboles, null, { fog: FOG });
  assert.equal(b.count, arboles.length);
  assert.equal(b.material.uniforms.uFogDensity.value, FOG.density);
  assert.equal(b.material.uniforms.uFogColour.value.getHex(), FOG.color);
  // Una instancia por arbol, con su altura: si la altura llegara a cero el
  // cartel se dibuja con area nula y el bosque desaparece sin dar error.
  const base = b.mesh.geometry.getAttribute("iBase");
  assert.equal(base.count, arboles.length);
  for (let i = 0; i < base.count; i++) {
    assert.ok(base.getW(i) > 0, `instancia ${i} con altura ${base.getW(i)}`);
  }
});

test("sin arboles no se construye un cartel vacio", () => {
  assert.equal(buildBillboards([], null, { fog: FOG }), null);
});

test("un cartel se abre de cara a la camara, nunca de canto", () => {
  // El fallo que costo esta prueba: el shader mezclaba el pie del arbol, que
  // estaba en coordenadas del grupo, con cameraPosition, que es de mundo. Los
  // arboles lejanos se orientaban casi bien por pura escala; los de cerca
  // salian de canto y se veian como troncos pelados. Nada fallaba.
  const foot = [10, 0, -4];
  for (const cam of [[0, 2, 0], [40, 2, 40], [10, 2, -30], [-25, 6, 12]]) {
    const right = billboardRight(foot, cam);
    const view = [cam[0] - foot[0], 0, cam[2] - foot[2]];
    const len = Math.hypot(view[0], view[2]);
    // El ancho del cartel tiene que ser perpendicular a la linea de vision:
    // si no lo es, el cuadrado se ve escorzado y en el limite desaparece.
    const dot = (right[0] * view[0] + right[2] * view[2]) / len;
    assert.ok(Math.abs(dot) < 1e-9, `camara ${cam}: escorzo ${dot}`);
    assert.ok(Math.abs(Math.hypot(right[0], right[2]) - 1) < 1e-9, "no esta normalizado");
    assert.equal(right[1], 0, "el cartel no puede inclinarse hacia arriba");
  }
});

test("los carteles se cuelgan sin transformar", () => {
  // Si se cuelgan de un grupo desplazado, se colocan bien y se orientan mal,
  // que es el fallo de arriba. Con matrixAutoUpdate a false, moverlos no hace
  // nada en vez de torcerlos en silencio.
  const arboles = scatterTrees({ inner: [20, 16], outer: 120, count: 10 });
  const b = buildBillboards(arboles, null, { fog: FOG });
  assert.equal(b.mesh.matrixAutoUpdate, false);
  assert.ok(b.mesh.matrix.equals(new (b.mesh.matrix.constructor)()), "la malla llega transformada");
});
