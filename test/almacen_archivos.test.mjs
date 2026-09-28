// EL ALMACÉN DEL SERVIDOR, que es lo único que no se puede perder.
//
// Y no tenía ni una comprobación. Se escribió en el experimento 27, se usa en
// cada partida y lo único que se sabía de él era que la sonda de la red no se
// quejaba — hasta que se quejó: **una de cada ocho vueltas de `sonda:red`** daba
// `EPERM: operation not permitted, rename` al guardar un personaje. En Windows no
// se puede renombrar encima de un archivo que alguien tiene abierto, aunque sea
// para leerlo, y el antivirus o el indizador valen.
//
// Lo llamativo es CÓMO se vio: no lo cazó un control del guardado, porque no hay
// ninguno. Lo cazó el control que dice «el servidor no ha escupido ningún error»,
// que es el que está ahí precisamente para los fallos que nadie está mirando.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, open, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AlmacenArchivos } from "../src/red/archivos.js";
import { crearPersonaje } from "../src/juego/personaje.js";

const nuevo = (nombre = "Ana") =>
  crearPersonaje({ nombre, arma: "weapon_shortsword", ahora: "2026-01-01T00:00:00.000Z" });

async function almacen() {
  const carpeta = await mkdtemp(join(tmpdir(), "msr-almacen-"));
  return { carpeta, a: new AlmacenArchivos({ carpeta }), fin: () => rm(carpeta, { recursive: true, force: true }) };
}

test("guardar, leer, listar y borrar", async (t) => {
  const { a, carpeta, fin } = await almacen();
  t.after(fin);

  const p = nuevo();
  const guardado = await a.escribir(p);
  assert.equal(guardado.id, p.id);
  assert.ok(guardado.actualizado, "sellar() tiene que poner la fecha");

  // `leer()` devuelve lo que devuelve `abrirPersonaje()`: el personaje Y sus
  // avisos de migración, que es la mitad del valor de abrirlo. Un `leer()` que
  // devolviera sólo el personaje tiraría a la basura «este documento trae 48
  // ranuras y este código usa 36: se conservan».
  const { personaje: leido, avisos } = await a.leer(p.id);
  assert.equal(leido.nombre, "Ana");
  assert.deepEqual(avisos, [], `un personaje recién creado no necesita migrarse: ${avisos}`);

  const lista = await a.listar();
  assert.equal(lista.length, 1);
  assert.equal(lista[0].id, p.id);
  // La lista es un resumen, no el personaje: si trae las estadísticas enteras,
  // la pantalla de elegir personaje se baja treinta veces lo que necesita.
  assert.deepEqual(Object.keys(lista[0]).sort(), ["actualizado", "id", "mapa", "nombre", "version"]);

  await a.borrar(p.id);
  assert.equal(await a.leer(p.id), null);
  assert.deepEqual(await a.listar(), []);
  assert.deepEqual(await readdir(carpeta), [], "el respaldo se borra con el personaje");
});

test("el respaldo es la copia ANTERIOR, no la que se acaba de escribir", async (t) => {
  // Un respaldo hecho DESPUÉS de escribir respalda exactamente lo que se acaba
  // de poder perder. La primera escritura no deja respaldo porque no hay nada
  // anterior que respaldar, y eso también es correcto.
  const { a, carpeta, fin } = await almacen();
  t.after(fin);

  const p = nuevo("Beto");
  await a.escribir(p);
  assert.equal((await readdir(carpeta)).length, 1, "la primera vez no hay respaldo");

  await a.escribir({ ...p, nombre: "Beto el Segundo" });
  const nombres = (await readdir(carpeta)).sort();
  assert.equal(nombres.length, 2);
  assert.ok(nombres.some((n) => n.endsWith(".bak.json")));

  const respaldo = new AlmacenArchivos({ carpeta });
  const viejo = await respaldo.leer(`${p.id}.bak`);
  assert.equal(viejo, null, "el respaldo no es un personaje más de la lista");
  assert.equal((await a.listar()).length, 1, "y no sale en la lista");
  assert.equal((await a.leer(p.id)).personaje.nombre, "Beto el Segundo");
});

test("un id del cliente no puede tocar el disco", () => {
  // El id llega por el socket. Sin limpiarlo, `../../.ssh/id_rsa` es una lectura
  // arbitraria con dos barras.
  const a = new AlmacenArchivos({ carpeta: join(tmpdir(), "msr-no-existe") });
  const ruta = a._ruta("../../.ssh/id_rsa");
  assert.ok(!ruta.includes(".."), ruta);
  assert.ok(ruta.endsWith("sshid_rsa.json"), ruta);
  assert.throws(() => a._ruta("../.."), /vac/);
  assert.throws(() => a._ruta(""), /vac/);
});

test("un personaje ilegible no tumba la lista de los demás", async (t) => {
  const { a, carpeta, fin } = await almacen();
  t.after(fin);
  await a.escribir(nuevo("Buena"));
  await writeFile(join(carpeta, "roto.json"), "{ esto no es JSON", "utf8");
  const lista = await a.listar();
  assert.equal(lista.length, 1);
  assert.equal(lista[0].nombre, "Buena");
});

test("si el renombrado falla, se reintenta antes de rendirse", async (t) => {
  // El fallo de verdad. En Windows, con el archivo abierto por otro, `rename`
  // da EPERM; el guardado reintenta tres veces con espera creciente y quien
  // tenga el archivo lo suelta en milisegundos.
  //
  // AVISO HONESTO: en Linux y en macOS se puede renombrar encima de un archivo
  // abierto, así que allí esta comprobación pasa sin ejercitar el reintento.
  // Queda igual, porque es en Windows donde se rompe y es donde esto corre.
  const { a, carpeta, fin } = await almacen();
  t.after(fin);

  const p = nuevo("Ana");
  await a.escribir(p);

  const mano = await open(join(carpeta, `${p.id}.json`), "r");
  const suelta = new Promise((r) => setTimeout(() => mano.close().then(r), 60));
  const escrito = await a.escribir({ ...p, nombre: "Ana con el archivo abierto" });
  await suelta;

  assert.equal(escrito.nombre, "Ana con el archivo abierto");
  assert.equal((await a.leer(p.id)).personaje.nombre, "Ana con el archivo abierto");
});

test("y si de verdad no se puede escribir, el error SUBE", async (t) => {
  // La otra mitad, y la que importa más: un guardado que no se puede hacer tiene
  // que decirse. Tres intentos y arriba — un `catch` vacío aquí sería un
  // personaje perdido en silencio, que es el peor fallo que este archivo puede
  // tener.
  const { a, carpeta, fin } = await almacen();
  t.after(fin);
  // Se le pone un directorio donde iría el archivo: renombrar encima de un
  // directorio no funciona en ningún sistema, y no hay espera que lo arregle.
  const p = nuevo("Nunca");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(join(carpeta, `${p.id}.json`), { recursive: true });
  await assert.rejects(() => a.escribir(p));
});
