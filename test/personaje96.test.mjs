// EL PERSONAJE DE PRUEBAS — experimento 96.
//
// La regla del 59, aplicada desde el principio: **ninguna prueba de aquí le
// construye al cargador el personaje que va a leer.** Se ejecuta la
// herramienta de verdad (`node tools/personaje.mjs`, en una carpeta temporal)
// y lo que ella deja en el disco se lee con los cargadores del juego:
//
//   - el del servidor: `AlmacenArchivos` + `Sesion.entrar`, que es lo que hace
//     `Partida._elegir` (src/red/partida.js);
//   - el del solitario: `importarPersonajeDePruebas` con un `fetch` que lee el
//     fichero, que llama a `importar()` de src/juego/almacen.js, y luego
//     `Sesion.entrar` sobre el almacén en memoria.
//
// Y los requisitos de los objetos se miden con `habilidadDeGuion`, que es
// como el puerto contesta el `$get(ent_owner, skill.…)` de los guiones — no con
// una cuenta escrita aquí. Cada número de la tabla se compara además con la
// línea del guion que cita, si ../MSC está al lado.

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  fabricar, incumplidos, valorPara, REQUISITOS, HABILIDADES, OBJETOS, EN_LA_MANO, ORO, contraElCatalogo,
} from "../tools/personaje.mjs";
import { AlmacenArchivos } from "../src/red/archivos.js";
import { AlmacenMemoria } from "../src/juego/almacen.js";
import { Sesion } from "../src/juego/sesion.js";
import { crearPersonaje, abrirPersonaje } from "../src/juego/personaje.js";
import { atributosDe, derivadas, TOPE_APRENDIZAJE } from "../src/juego/stats.js";
import { importarPersonajeDePruebas } from "../src/dev/personajepruebas.js";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const HERRAMIENTA = join(RAIZ, "tools", "personaje.mjs");
const GUIONES = join(RAIZ, "..", "MSC", "MSCScripts", "scripts");

/** Corre la herramienta en una carpeta temporal y devuelve dónde dejó las cosas. */
async function fabricarEnDisco(t, args = []) {
  const cwd = await mkdtemp(join(tmpdir(), "msr-personaje96-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const r = spawnSync(process.execPath, [HERRAMIENTA, ...args], { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, `la herramienta falló:\n${r.stdout}\n${r.stderr}`);
  return { cwd, salida: r.stdout };
}

/** Un `fetch` que sirve ficheros de una carpeta, como el `vite` de desarrollo. */
const fetchDeCarpeta = (cwd) => async (ruta) => {
  const f = join(cwd, ruta);
  if (!existsSync(f)) return { ok: false, text: async () => "" };
  return { ok: true, text: async () => readFileSync(f, "utf8") };
};

test("CON SERVIDOR: lo que deja la herramienta lo lista y lo abre el almacén del servidor, y la sesión entra", async (t) => {
  const { cwd } = await fabricarEnDisco(t, ["--mapa", "edana"]);
  const carpeta = join(cwd, "build", "partidas", "edana", "personajes");
  const almacen = new AlmacenArchivos({ carpeta });
  const lista = await almacen.listar();
  assert.deepEqual(lista.map((c) => c.nombre), ["Veteran"], "la lista del servidor es la que manda `_listar`");

  // Los avisos de `abrirPersonaje`: vacíos quiere decir que el documento tiene
  // exactamente la forma que el juego espera, sin campos que no conoce.
  const leido = await almacen.leer(lista[0].id);
  assert.deepEqual(leido.avisos, []);

  const sesion = new Sesion({ almacen, aparicion: { mapa: "edana", nacimiento: { escena: [0, 0, 0] } } });
  await sesion.arrancar();
  const p = await sesion.entrar(lista[0].id);
  assert.equal(sesion.estado, "jugando");
  // EL 97: lo de la mano ya no está en `objetos` (versión 2 del registro,
  // doc/INVENTARIO_97.md): se compara la lista SIN la Blood Drinker y la mano
  // aparte. Antes del 97 la lista traía las seis.
  assert.deepEqual(p.objetos.map((o) => o.id).filter((id) => OBJETOS.includes(id)), OBJETOS.filter((id) => id !== EN_LA_MANO));
  assert.equal(p.manos.derecha, EN_LA_MANO);
  assert.equal(p.oro, ORO);
  // `_recortarVitales` no tiene nada que recortar: la herramienta usa la
  // misma cuenta. Se compara con lo que dice EL DISCO y no con el máximo:
  // después de entrar la vida es el máximo SIEMPRE, recorte o no — esta línea
  // comparaba con `vidaMax` y siguió verde con la herramienta escribiendo 10
  // de más (rotura deliberada del 96).
  const d = sesion.limites;
  assert.equal(leido.personaje.vida, d.vidaMax, "lo escrito en el disco ya es el máximo");
  assert.equal(p.vida, leido.personaje.vida, "y entrar no lo ha tocado");
  assert.equal(leido.personaje.mana, d.manaMax);
  assert.equal(p.mana, leido.personaje.mana);
  assert.ok(p.vida > 400, `vida ${p.vida}: un personaje avanzado, no uno de partida`);
});

test("control de la anterior: un documento con vida de más SÍ se recorta al entrar", async () => {
  const p = fabricar();
  const almacen = new AlmacenMemoria([{ ...p, vida: p.vida + 50 }]);
  const sesion = new Sesion({ almacen });
  const dentro = await sesion.entrar(p.id);
  assert.equal(dentro.vida, p.vida, "si esto no recorta, la igualdad de arriba no mide nada");
});

test("EN SOLITARIO: `?personaje=veteran` importa el fichero con `importar()` y la sesión entra", async (t) => {
  const { cwd } = await fabricarEnDisco(t);
  const almacen = new AlmacenMemoria();
  const r = await importarPersonajeDePruebas({ almacen, buscar: "?personaje=veteran", traer: fetchDeCarpeta(cwd) });
  assert.equal(r.hecho, true, r.porQue);
  const lista = await almacen.listar();
  assert.deepEqual(lista.map((c) => c.nombre), ["Veteran"]);
  const sesion = new Sesion({ almacen });
  const p = await sesion.entrar(lista[0].id);
  // EL 97: sin la de la mano, que está en `manos.derecha` (ver arriba).
  assert.deepEqual(p.objetos.map((o) => o.id).filter((id) => OBJETOS.includes(id)), OBJETOS.filter((id) => id !== EN_LA_MANO));
  assert.equal(p.manos.derecha, EN_LA_MANO);
  assert.deepEqual(incumplidos(p), []);
});

test("EN SOLITARIO, LA RECARGA: la misma fabricación no pisa la partida; una nueva sí", async (t) => {
  const { cwd } = await fabricarEnDisco(t);
  const almacen = new AlmacenMemoria();
  const traer = fetchDeCarpeta(cwd);
  await importarPersonajeDePruebas({ almacen, buscar: "?personaje=veteran", traer });
  // Se juega: gasta oro y se guarda, como haría la sesión.
  const sesion = new Sesion({ almacen });
  const p = await sesion.entrar("pruebas-veteran");
  p.oro = 7;
  await almacen.escribir(p);
  // Cambiar de mapa recarga con la misma URL.
  const otra = await importarPersonajeDePruebas({ almacen, buscar: "?map=edana&personaje=veteran", traer });
  assert.equal(otra.hecho, false);
  assert.equal((await almacen.leer("pruebas-veteran")).personaje.oro, 7, "la recarga no devuelve el oro gastado");
  // Y el control positivo: otra fabricación (otro `creado`) sí entra.
  const creado = async () => JSON.parse(await readFile(join(cwd, "build/personajes/veteran.json"), "utf8")).personaje.creado;
  const antes = await creado();
  spawnSync(process.execPath, [HERRAMIENTA], { cwd });
  assert.notEqual(await creado(), antes, "la segunda fabricación tiene que llevar otra hora");
  const tercera = await importarPersonajeDePruebas({ almacen, buscar: "?personaje=veteran", traer });
  assert.equal(tercera.hecho, true, tercera.porQue);
  assert.equal((await almacen.leer("pruebas-veteran")).personaje.oro, ORO);
});

test("EN SOLITARIO, lo que NO se acepta: una ruta, un fichero que no está, un JSON que no es personaje", async () => {
  const almacen = new AlmacenMemoria();
  const traer = async (ruta) => (ruta.endsWith("raro.json")
    ? { ok: true, text: async () => "[1,2,3]" } : { ok: false, text: async () => "" });
  assert.equal(await importarPersonajeDePruebas({ almacen, buscar: "", traer }), null, "sin parámetro no hace nada");
  for (const pedido of ["../../secreto", "a/b", "nope", "raro"]) {
    const r = await importarPersonajeDePruebas({ almacen, buscar: `?personaje=${encodeURIComponent(pedido)}`, traer });
    assert.equal(r.hecho, false, pedido);
  }
  assert.deepEqual(await almacen.listar(), []);
});

test("LOS REQUISITOS: los cumple todos, y un personaje recién creado no cumple ninguno", () => {
  const p = fabricar();
  assert.deepEqual(incumplidos(p).map((r) => `${r.objeto} ${r.que}`), []);
  // El control positivo: si la comprobación no pudiera fallar, el verde de
  // arriba no diría nada.
  const novato = crearPersonaje({ nombre: "Novato" });
  assert.equal(incumplidos(novato).length, REQUISITOS.length,
    `${incumplidos(novato).length} de ${REQUISITOS.length}`);
});

test("el `>` estricto de la armadura del fénix: con fuego 20 justos NO cuenta", () => {
  const p = fabricar();
  p.habilidades.spellcasting.fire.valor = 20;
  const fuera = incumplidos(p);
  assert.ok(fuera.some((r) => r.objeto === "armor_pheonix55" && r.estricto), JSON.stringify(fuera.map((r) => r.cita)));
  assert.ok(!fuera.some((r) => r.objeto === "axes_dragon"), "el hacha pide >= 20 y con 20 sí le vale");
});

test("los números que el motor compararía, uno a uno (escritos a mano, el 75)", () => {
  const p = fabricar();
  // La fuerza es DERIVADA: (40·1,5 + 1 + 35·2 + 1·1,9 + 1·0,8 + 25·0,5 + 30·0,6)/4 = 41,05 → 41.
  assert.equal(valorPara(p, "stat.strength"), 41);
  assert.equal(valorPara(p, "skill.swordsmanship"), 40);
  assert.equal(valorPara(p, "prof.swordsmanship"), 40);
  assert.equal(valorPara(p, "skill.spellcasting.fire"), 25);
  assert.equal(valorPara(p, "prof.smallarms"), 25);
  // La vida: 5 + (41-1)·7 + (26-1)·7 + (17-1)·3 = 508 (playershared.cpp:1057-1085).
  assert.equal(p.vida, 508);
  assert.equal(p.mana, 170);
});

test("ninguna habilidad pasa de CHAR_LEVEL_CAP: es un personaje que se puede hacer entrenando", () => {
  for (const [h, props] of Object.entries(HABILIDADES)) {
    for (const [k, v] of Object.entries(props)) assert.ok(v <= TOPE_APRENDIZAJE, `${h}.${k} = ${v}`);
  }
  const p = fabricar();
  for (const props of Object.values(p.habilidades)) {
    for (const v of Object.values(props)) assert.ok(v.valor <= TOPE_APRENDIZAJE);
  }
});

test("el documento no trae campos que el juego no conozca, ni atributos guardados", () => {
  const { avisos, personaje } = abrirPersonaje(structuredClone(fabricar()));
  assert.deepEqual(avisos, []);
  assert.equal(personaje.atributos, undefined, "los atributos se derivan, no se guardan (stats.js)");
});

test("CONTRA EL CATÁLOGO: todos los objetos existen y la carga cabe", { skip: !existsSync(join(RAIZ, "build/msr/objetos.json")) && "sin build/msr/objetos.json" }, () => {
  const catalogo = JSON.parse(readFileSync(join(RAIZ, "build/msr/objetos.json"), "utf8"));
  const p = fabricar();
  const { problemas, carga } = contraElCatalogo(p, catalogo);
  assert.deepEqual(problemas, []);
  assert.ok(carga.peso > 0, "un peso cero diría que no ha encontrado las fichas");
  const porId = new Map(catalogo.objetos.map((o) => [o.id, o]));
  assert.equal(porId.get("armor_pheonix55").nombre, "Armor of the Phoenix");
  assert.equal(porId.get("armor_helm_gray").nombre, "Helmet of Stability");
  // Y el control de `contraElCatalogo`: un id inventado tiene que salir.
  const malo = { ...p, objetos: [...p.objetos, { id: "swords_que_no_existe", n: 1 }] };
  assert.equal(contraElCatalogo(malo, catalogo).problemas.length, 1);
});

test("LAS CITAS: cada número de la tabla está escrito en la línea del guion que cita", { skip: !existsSync(GUIONES) && "sin ../MSC/MSCScripts" }, () => {
  for (const r of REQUISITOS) {
    const [archivo, linea] = r.cita.split(":");
    const texto = readFileSync(join(GUIONES, archivo), "utf8").split(/\r?\n/)[Number(linea) - 1] ?? "";
    // El número que se pide puede ser una suma (reqskill + BASE_LEVEL_REQ):
    // entonces la línea trae el sumando y el `por` dice de dónde sale el otro.
    const sumando = r.por.match(/reqskill (\d+) \+ BASE_LEVEL_REQ (\d+)/);
    const esperado = sumando ? sumando[1] : String(r.minimo);
    if (sumando) assert.equal(Number(sumando[1]) + Number(sumando[2]), r.minimo, r.cita);
    assert.match(texto, new RegExp(`\\b${esperado}\\b`), `${r.cita}: «${texto.trim()}» no dice ${esperado}`);
  }
});

test("la vida y el maná salen de la misma cuenta que usa el juego", () => {
  const p = fabricar();
  const d = derivadas(atributosDe(p.habilidades));
  assert.equal(p.vida, d.vidaMax);
  assert.equal(p.mana, d.manaMax);
});
