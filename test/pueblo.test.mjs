// El pueblo contra su propio plano.
//
// pueblo.meta.json lo escribe el emisor mientras construye, asi que dice lo
// que el plano pedia; el .map dice lo que salio. Que las dos cifras coincidan
// es lo que separa «el emisor produjo algo» de «el emisor produjo el pueblo».

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { loadLevel } from "../src/map/level.js";
import { meshBounds, UNITS_PER_M } from "../src/map/geometry.js";
import { initPhysics, World, Player } from "../src/play/player.js";
import { PUEBLO } from "./fixtures.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const level = loadLevel(await readFile(PUEBLO, "utf8"), { name: "pueblo" });
const meta = JSON.parse(
  await readFile(join(here, "..", "public", "maps", "pueblo.meta.json"), "utf8")
);
await initPhysics();

const DT = 1 / 60;

test("el pueblo se carga con geometria y sin brushes degenerados", () => {
  assert.ok(level.brushes.length > 100, `solo ${level.brushes.length} brushes`);
  assert.ok(level.mesh.triangleCount > 0);
  assert.equal(level.mesh.degenerate, 0, "hay brushes degenerados");
});

test("mide lo que dice el plano", () => {
  const { min, max } = meshBounds(level.mesh);
  assert.equal(Math.round((max[0] - min[0]) * UNITS_PER_M), meta.units[0]);
  assert.equal(Math.round((max[2] - min[2]) * UNITS_PER_M), meta.units[1]);
});

test("estan las diez casas, y ninguna es un cubo sin tejado", () => {
  assert.equal(Object.keys(meta.houses).length, 10);
  // Cada casa son un cuerpo y dos faldones. Sin el tejado la casa sigue
  // compilando y sigue parando al jugador: solo se ve fea, que no falla.
  // Un faldon es una cuna de seis vertices. Se filtra por eso y por altura,
  // porque con el tejadillo del pozo y los toldos del mercado ya no basta con
  // contar lo que lleva teja: hay tejados que no son de casa.
  const roofs = level.brushes.filter(
    (b) => b.textures.includes("roof01") && b.verts.length === 6 && b.maxs[2] > 200
  );
  assert.equal(roofs.length, 20, `${roofs.length} faldones de casa para 10 casas`);
});

test("cada casa llega a la altura que dice su tabla", () => {
  const { max } = meshBounds(level.mesh);
  const tallest = Math.max(
    ...Object.values(meta.houses).map((h) => h.wall + h.rise)
  );
  const roofTop = Math.max(
    ...level.brushes
      .filter((b) => b.textures.includes("roof01"))
      .map((b) => b.maxs[2])
  );
  // Con relieve, la casa se asienta sobre su zocalo, asi que el tejado sube
  // lo que suba el terreno bajo ella. Lo que no puede es subir algo que no sea
  // un multiplo del escalon: eso significaria que el zocalo no cuadra con el
  // suelo y quedaria una rendija bajo la pared.
  const alzado = roofTop - tallest;
  assert.ok(
    alzado >= meta.relieve.min && alzado <= meta.relieve.max,
    `el tejado mas alto sube ${alzado} sobre la tabla, fuera del relieve`
  );
  // Con holgura: la cota sale de cortar tres planos, asi que llega con error
  // de coma flotante. 7,999999999999943 es ocho.
  const e = meta.relieve.escalon;
  assert.ok(
    Math.abs(Math.round(alzado / e) * e - alzado) < 0.01,
    `el zocalo mas alto esta a ${alzado}, que no es multiplo de ${e}`
  );
  assert.ok(roofTop < meta.wall_top + 128, "una casa asoma por encima de la muralla");
});

test("hay tantos arboles como dice el plano, y todos con tronco", () => {
  const trunks = level.brushes.filter((b) => b.textures.includes("bark01"));
  const marks = level.points.filter((p) => p.classname === "misc_tree");
  assert.equal(trunks.length, meta.trees);
  assert.equal(marks.length, meta.trees);
  // Un arbol sin tronco se atraviesa. Y una entidad sin geometria no se ve:
  // las dos cosas tienen que ir juntas o no van.
  for (const m of marks) {
    const near = trunks.find(
      (t) => Math.abs((t.mins[0] + t.maxs[0]) / 2 - m.units[0]) < 1 &&
             Math.abs((t.mins[1] + t.maxs[1]) / 2 - m.units[1]) < 1
    );
    assert.ok(near, `el arbol en ${m.units} no tiene tronco`);
  }
});

test("el cielo tapa el pueblo entero", () => {
  // Si la tapa no llega a los bordes, qbsp encuentra fuga. Pero con la fuga
  // tapada por casualidad -por una casa alta, por ejemplo- sellaria igual y
  // quedaria un agujero por el que se ve el vacio.
  const sky = level.brushes.filter((b) => b.textures.includes("sky01"));
  assert.ok(sky.length > 0, "no hay cielo");
  const lid = sky.filter((b) => b.mins[2] >= meta.sky_top);
  assert.equal(lid.length, 1, "la tapa tiene que ser una sola pieza");
  assert.equal(lid[0].mins[0] + 0, 0);
  assert.equal(lid[0].mins[1] + 0, 0);
  assert.equal(lid[0].maxs[0], meta.units[0]);
  assert.equal(lid[0].maxs[1], meta.units[1]);
});

test("todas las caras llevan textura conocida", () => {
  // Una textura que no existe no da error: la cara sale gris y parece
  // geometria mal hecha en vez de un archivo que falta.
  const known = new Set([
    "grass01", "road01", "floor01", "wall01", "ceil01",
    "roof01", "plaster01", "wood01", "bark01", "sky01", "water01", "door01",
  ]);
  for (const g of level.mesh.groups) {
    assert.ok(known.has(g.texture), `textura desconocida: ${g.texture}`);
  }
});

test("las UV del pueblo son finitas y no todas cero", () => {
  assert.equal(level.mesh.uvs.length, level.mesh.vertexCount * 2);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < level.mesh.uvs.length; i++) {
    const v = level.mesh.uvs[i];
    assert.ok(Number.isFinite(v), `uv ${i} es ${v}`);
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  // Un 19 % de ceros es normal y no dice nada: el mapa empieza en el origen y
  // muchisimas caras tocan el plano cero. Lo que si dice algo es el recorrido:
  // unas UV constantes pintan toda la pared con el mismo pixel, sale un color
  // plano, y un color plano parece una decision de estilo.
  assert.ok(max - min > 20, `las UV solo recorren de ${min} a ${max}`);
});

// --- se puede caminar ------------------------------------------------------

test("el jugador aparece en el suelo del pueblo", () => {
  const world = new World(level.mesh);
  const player = new Player(world, level.start);
  let steps = 0;
  while (steps < 180 && !player.grounded) {
    player.step(DT, {});
    steps++;
  }
  assert.ok(player.grounded, "el jugador no llega a tocar suelo");
  // Con relieve el suelo ya no esta en cero, pero tampoco puede estar en
  // cualquier sitio: tiene que caer dentro de la banda del terreno. Fuera de
  // ella significaria que aparece flotando o dentro de una losa.
  const z = player.feet[1] * UNITS_PER_M;
  assert.ok(
    z >= meta.relieve.min - 4 && z <= meta.relieve.max + 4,
    `aparecio a z=${z.toFixed(1)}, fuera de [${meta.relieve.min}, ${meta.relieve.max}]`
  );
  world.free();
});

test("se anda por la calle sin perder el suelo en cada junta", () => {
  // El suelo son decenas de brushes pegados. Al cruzar una junta el contacto
  // castanea si el controlador no lleva un empujon hacia abajo: el jugador no
  // se cae, pero 'grounded' se apaga y con el todo lo que dependa de el.
  const world = new World(level.mesh);
  const player = new Player(world, level.start);
  for (let i = 0; i < 120 && !player.grounded; i++) player.step(DT, {});

  let airborne = 0;
  let lo = Infinity;
  let hi = -Infinity;
  const start = player.feet;
  const frames = 600;
  let libre = null;
  for (let i = 0; i < frames; i++) {
    player.step(DT, { forward: 1 });
    const z = player.feet[1] * UNITS_PER_M;
    lo = Math.min(lo, z);
    hi = Math.max(hi, z);
    if (!player.grounded) airborne++;
    // Los dos primeros segundos, antes de llegar a la plaza, el camino esta
    // despejado: ahi se mide la velocidad. Mas adelante el jugador se topa con
    // el pozo, que esta en medio de la plaza a proposito, asi que exigir que
    // recorra diez segundos enteros es exigir que el pueblo este vacio.
    if (i === 120) libre = Math.hypot(player.feet[0] - start[0], player.feet[2] - start[2]);
  }
  const travelled = Math.hypot(player.feet[0] - start[0], player.feet[2] - start[2]);
  assert.ok(libre > 9, `en 2 s de camino libre solo anduvo ${libre.toFixed(1)} m`);
  assert.ok(travelled > 20, `solo anduvo ${travelled.toFixed(1)} m en 10 s`);

  // Sobre terreno escalonado, perder el suelo un fotograma al subir un escalon
  // es lo que tiene que pasar: el autostep levanta al jugador y durante ese
  // fotograma no hay contacto. Lo que no puede es castanear. El umbral es
  // holgado por arriba y se comprueba ademas que subio de verdad.
  assert.ok(
    airborne <= frames * 0.02,
    `perdio el suelo en ${airborne} de ${frames} fotogramas`
  );
  assert.ok(hi - lo > meta.relieve.escalon, `anduvo llano: de z=${lo} a z=${hi}`);
  assert.ok(
    lo >= meta.relieve.min - 4 && hi <= meta.relieve.max + 4,
    `se salio de la banda del terreno: de ${lo} a ${hi}`
  );
  world.free();
});

test("las casas paran al jugador", () => {
  // Andar contra una casa no puede acabar dentro de ella. Sin esto, una casa
  // sin colision se ve exactamente igual que una con colision.
  const world = new World(level.mesh);
  const casa = Object.entries(meta.houses)[0];
  const player = new Player(world, level.start);
  for (let i = 0; i < 120 && !player.grounded; i++) player.step(DT, {});

  // Hacia el oeste desde el inicio: hay casas a ese lado del plano.
  player.yaw = Math.PI / 2;
  for (let i = 0; i < 600; i++) player.step(DT, { forward: 1 });
  const x = player.feet[0] * UNITS_PER_M;
  assert.ok(x > 0, `el jugador salio del mapa por el oeste: x=${x.toFixed(0)}`);
  assert.ok(
    player.feet[1] * UNITS_PER_M < 64,
    "el jugador acabo subido encima de algo"
  );
  world.free();
});


// --- fachadas y pozo -------------------------------------------------------

test("cada casa tiene una puerta", () => {
  // Una puerta es la unica pieza con textura door01, asi que contarlas cuenta
  // puertas. Sin ella la casa es un bloque, y un bloque de yeso con tejado se
  // lee como un almacen, no como una vivienda.
  // Las hojas del porton tambien llevan door01, asi que se separan por altura:
  // una puerta de casa mide poco mas de tres metros y una hoja de porton casi
  // cinco. Contar door01 a secas daria doce puertas para diez casas.
  const doors = level.brushes.filter(
    (b) => b.textures.includes("door01") && b.maxs[2] - b.mins[2] < 140
  );
  assert.equal(doors.length, Object.keys(meta.houses).length);
  for (const d of doors) {
    const alto = d.maxs[2] - d.mins[2];
    assert.ok(alto > 64 && alto < 140, `una puerta mide ${alto} unidades de alto`);
    const ancho = Math.max(d.maxs[0] - d.mins[0], d.maxs[1] - d.mins[1]);
    assert.ok(ancho > 24 && ancho < 80, `una puerta mide ${ancho} de ancho`);
  }
});

test("las puertas se apoyan en el suelo de su casa, no flotan", () => {
  // Con relieve, cada casa se asienta a su altura. Una puerta emitida a cota
  // cero quedaria flotando o medio enterrada, y las dos cosas se ven raras sin
  // que nada falle.
  const bases = new Set(
    level.brushes
      .filter((b) => b.textures.includes("plaster01") || b.textures.includes("wall01"))
      .map((b) => b.mins[2])
  );
  for (const d of level.brushes.filter(
    (b) => b.textures.includes("door01") && b.maxs[2] - b.mins[2] < 140
  )) {
    assert.ok(
      d.mins[2] >= meta.relieve.min && d.mins[2] <= meta.relieve.max,
      `una puerta arranca en z=${d.mins[2]}, fuera del relieve`
    );
  }
});

test("las casas no son todas iguales", () => {
  // Diez copias de la misma casa se leen como un decorado. La variedad sale de
  // la letra de cada casa, asi que es determinista: el mismo plano da siempre
  // el mismo pueblo.
  const chimeneas = level.brushes.filter(
    (b) => b.textures.every((t) => t === "wall01") &&
      b.maxs[0] - b.mins[0] === 28 && b.maxs[1] - b.mins[1] === 28
  );
  assert.ok(chimeneas.length >= 3, `solo ${chimeneas.length} chimeneas`);
  assert.ok(
    chimeneas.length < Object.keys(meta.houses).length,
    "todas las casas tienen chimenea: no hay variedad"
  );

  // Y las puertas no pueden estar todas en el mismo sitio relativo.
  const doors = level.brushes.filter((b) => b.textures.includes("door01"));
  const alturas = new Set(doors.map((d) => Math.round(d.maxs[2] - d.mins[2])));
  const anchos = new Set(doors.map((d) => Math.round(d.maxs[0] - d.mins[0])));
  assert.ok(alturas.size + anchos.size > 2, "las puertas son todas identicas");
});

test("el pozo es redondo y tiene agua", () => {
  assert.ok(meta.well, "no hay pozo");
  assert.equal(meta.well.segmentos, 16);
  // Dieciseis segmentos, cada uno un brush de seis caras. Menos de ocho se ve
  // ochavado; cero significa que el brocal no se emitio.
  const rim = level.brushes.filter(
    (b) => b.textures.every((t) => t === "wall01") && b.verts.length === 8 &&
      !isAxial(b)
  );
  assert.ok(rim.length >= 16, `el brocal tiene ${rim.length} segmentos`);

  const agua = level.brushes.filter((b) => b.textures.includes("water01"));
  assert.equal(agua.length, 1, "el pozo no tiene agua, o tiene mas de una");
  // El agua tiene que estar por debajo del brocal, no a ras: si estuviera a
  // ras es un pilon, no un pozo.
  const brocalTop = Math.max(...rim.map((b) => b.maxs[2]));
  assert.ok(
    brocalTop - agua[0].maxs[2] > 64,
    `el agua esta a ${brocalTop - agua[0].maxs[2]} unidades del brocal`
  );
});

/** Un brush con alguna cara que no es paralela a los ejes. */
function isAxial(brush) {
  return brush.planes.every((p) =>
    p.slice(0, 3).filter((c) => Math.abs(Math.abs(c) - 1) < 1e-4).length === 1
  );
}

test("el pozo esta agujereado de verdad y tapado por abajo", () => {
  // El hueco en el suelo es lo que hace que sea un pozo. Y el fondo es lo que
  // impide que ese hueco sea una fuga: sin el, qbsp no sella, que ya paso.
  const [wx, wy] = meta.well.units;
  const suelo = level.brushes.filter(
    (b) => b.mins[0] < wx && b.maxs[0] > wx && b.mins[1] < wy && b.maxs[1] > wy
  );
  // Solo lo que esta a cota de calle: la tapa de cielo tambien cae sobre el eje
  // del pozo, y contarla como losa de suelo es confundir el techo con el suelo.
  const tapas = suelo.filter(
    (b) => b.maxs[2] > meta.relieve.min - 64 && b.maxs[2] <= meta.relieve.max + 8
  );
  // Sobre el eje del pozo no puede haber losa de suelo a la cota del terreno:
  // si la hubiera, el pozo tendria fondo de adoquin a ras de calle.
  for (const b of tapas) {
    assert.ok(
      b.textures.includes("wall01") || b.textures.includes("water01"),
      `hay una losa de ${b.textures[0]} tapando la boca del pozo`
    );
  }
  assert.ok(
    suelo.some((b) => b.textures.includes("water01")),
    "bajo el eje del pozo no hay agua"
  );
});

// --- porton, matas y plaza -------------------------------------------------

test("la muralla tiene porton, y el porton esta cerrado", () => {
  // Un pueblo amurallado sin puerta no se lee como un pueblo. Y un hueco en la
  // muralla es una fuga, porque al otro lado esta el vacio: por eso el porton
  // va cerrado con dos hojas.
  assert.ok(meta.porton_brushes >= 5, `el porton tiene ${meta.porton_brushes} piezas`);
  const hojas = level.brushes.filter(
    (b) => b.textures.includes("door01") && b.maxs[2] - b.mins[2] > 150
  );
  assert.equal(hojas.length, 2, `hay ${hojas.length} hojas de porton`);
  // Las dos se tocan sin holgura: una rendija de una unidad ya es una fuga.
  const [a, b] = hojas.sort((p, q) => p.mins[0] - q.mins[0]);
  assert.equal(a.maxs[0], b.mins[0], "las hojas no se tocan");
  assert.equal(a.mins[1], b.mins[1], "las hojas no estan en el mismo plano");
});

test("el vano del porton es un paso, no una puerta pintada", () => {
  // El primer intento puso las jambas cruzando el paso en vez de a los lados:
  // sellaba igual de bien y se veia ladrillo macizo. La diferencia se mide por
  // donde esta la hoja respecto al grosor de la muralla.
  const hojas = level.brushes.filter(
    (b) => b.textures.includes("door01") && b.maxs[2] - b.mins[2] > 150
  );
  const grosor = hojas[0].maxs[1] - hojas[0].mins[1];
  assert.ok(grosor < 64, `la hoja mide ${grosor} de grosor: ocupa el vano entero`);
});

test("hay matas, y ninguna en mitad de la calle", () => {
  const matas = level.points.filter((p) => p.classname === "misc_bush");
  assert.equal(matas.length, meta.bushes);
  assert.ok(matas.length > 20, `solo ${matas.length} matas`);
  // Una mata es un cartel sin colision. Si cayera en una calle, seria un
  // arbusto que se atraviesa en mitad del camino: no falla, pero se ve mal.
  for (const m of matas) {
    const cx = Math.floor(m.units[0] / meta.cell_units);
    assert.ok(cx >= 0 && cx < meta.cells[0], `una mata en x=${m.units[0]}`);
  }
});

test("las matas se apoyan en el terreno", () => {
  for (const m of level.points.filter((p) => p.classname === "misc_bush")) {
    assert.ok(
      m.units[2] >= meta.relieve.min && m.units[2] <= meta.relieve.max,
      `una mata a z=${m.units[2]}, fuera del relieve`
    );
  }
});

test("la plaza tiene cosas del tamano de una persona", () => {
  // Una plaza vacia de cien metros se lee como un solar: no hay nada con lo
  // que comparar la escala.
  assert.ok(meta.plaza_brushes >= 20, `solo ${meta.plaza_brushes} piezas en la plaza`);
});

test("el pozo tiene tejadillo", () => {
  // El brocal solo se lee como pozo desde encima. Desde el otro lado de la
  // plaza, que es de donde se mira, hace falta algo que asome.
  const [wx, wy] = meta.well.units;
  // Solape, no contencion: el tejadillo son dos cunas que se tocan justo en el
  // eje del pozo, asi que ninguna de las dos lo contiene.
  const encima = level.brushes.filter(
    (b) =>
      b.maxs[0] >= wx - 48 && b.mins[0] <= wx + 48 &&
      b.maxs[1] >= wy - 48 && b.mins[1] <= wy + 48 &&
      b.mins[2] > meta.relieve.max + 64
  );
  assert.ok(encima.length > 0, "no hay nada sobre el pozo");
  assert.ok(
    encima.some((b) => b.textures.includes("roof01")),
    "el tejadillo del pozo no tiene teja"
  );
});

test("toda entidad sin geometria la dibuja alguien", () => {
  // Regla del experimento 02: una entidad que no tiene geometria no se ve, y
  // marcarla no puede depender de que el autor se acuerde. Aqui se comprueba
  // al reves: que no haya en el .map ninguna clase de entidad puntual que el
  // render no sepa dibujar. Anadir un 'misc_barril' y olvidarse de pintarlo
  // no daria ningun error -- solo un barril invisible.
  const dibujadas = new Set(["misc_tree", "misc_bush"]);
  const sinGeometria = new Set(["info_player_start", "info_player_arrive", "light", "trigger_level"]);
  const clases = new Set(level.points.map((p) => p.classname));
  for (const c of clases) {
    assert.ok(
      dibujadas.has(c) || sinGeometria.has(c),
      `'${c}' no la dibuja nadie y no esta en la lista de las que no se ven`
    );
  }
});
