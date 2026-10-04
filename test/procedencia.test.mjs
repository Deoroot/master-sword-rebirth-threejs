// NINGÚN ASSET ENTRA SIN LICENCIA AL LADO.
//
// Es la regla más vieja del proyecto y hasta hoy era sólo una frase en un
// documento. Mientras esto vivía en una carpeta de nadie daba igual; ahora se
// publica, así que la frase tiene que ser comprobable.
//
// Lo que dice la regla, entera:
//
//   - el mapa, los modelos, las pieles, los sonidos y los scripts de Master
//     Sword son de DrKill y del equipo de MSR. **No se copian.** Se leen de una
//     instalación del juego que está al lado (`../MSC/`);
//   - todo lo que se extrae de ahí vive en `build/`, que está en `.gitignore` y
//     lleva su `build/gatecity/PROCEDENCIA.md` diciendo de dónde salió cada cosa;
//   - y no se mueve un byte a `public/`, que es lo único que un servidor web
//     publicaría tal cual.
//
// La forma más corta de comprobar las tres a la vez resultó ser ésta: **en este
// repositorio no hay ni un archivo binario**. Ni una textura, ni un `.wav`, ni un
// `.mdl`, ni un `.bsp`. Sólo código, documentos y cuatro maquetados. Si algún día
// hace falta meter un binario de verdad —un icono nuestro, una fuente libre— se
// añade su extensión aquí abajo con su licencia al lado, y eso es una decisión que
// alguien firma. Lo que esta prueba impide es el descuido.

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, extname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(import.meta.url), "..", "..");

/** Lo que puede estar versionado, y nada más. Cada línea es una decisión. */
const EXTENSIONES = new Set([
  ".js", ".mjs",      // el juego, las herramientas, las sondas y las pruebas
  // La cáscara de escritorio (`escritorio/`). Es JavaScript NUESTRO, igual que
  // los de arriba; lo que cambia es el sistema de módulos, no de quién es. Son
  // `.cjs` porque `package.json` dice `"type": "module"` y el proceso principal
  // de Electron y su precarga en caja de arena se cargan como CommonJS.
  ".cjs",
  ".md",              // los documentos, que son la mitad del trabajo
  ".html",            // el cascarón y los maquetados de doc/mockups
  ".json",            // package.json y package-lock.json
]);

/** Archivos sueltos sin extensión que sí van. */
const SIN_EXTENSION = new Set([".gitignore", "LICENSE", ".gitattributes"]);

/**
 * LA ÚNICA EXCEPCIÓN BINARIA, y la firma el usuario (el 87, al hacer público el
 * repositorio): *«incluyamos algunas imágenes de edana en el repo»*.
 *
 * Son CAPTURAS DE PANTALLA de este port corriendo, no assets: ni una textura, ni
 * un modelo, ni un sonido se puede sacar de un JPEG de 1200 píxeles de una
 * escena ya pintada. Es lo que enseña cualquier port de un juego en su página.
 * Pero dentro se ve el arte de MSR y de Valve, así que esto NO es «un `.png`
 * nuestro» y no va por la lista de arriba: va por aquí, estrecho a propósito.
 *
 *   - **Sólo `.jpg`, y sólo en `doc/capturas/`.** Un `.jpg` en cualquier otro
 *     sitio sigue siendo rojo, y un `.png` en esta carpeta también: el formato
 *     con pérdida es la garantía de que lo que entra es una foto y no un
 *     fichero de textura renombrado.
 *   - **Con tope de tamaño**, por archivo y en total. La vacuna de esta prueba es
 *     contra el descuido, y el descuido aquí sería que la carpeta creciera hasta
 *     ser un almacén. Si hace falta más, se sube el tope y alguien lo firma.
 */
const CAPTURAS = { carpeta: "doc/capturas/", extension: ".jpg", porArchivo: 400 * 1024, total: 1536 * 1024 };
const esCaptura = (ruta) =>
  ruta.startsWith(CAPTURAS.carpeta) && !ruta.slice(CAPTURAS.carpeta.length).includes("/")
  && extname(ruta).toLowerCase() === CAPTURAS.extension;

/**
 * LA SEGUNDA EXCEPCIÓN, y también la firma el usuario (2026-10-04, al empezar las
 * misiones propias): *«we can create custom scripts, no problem there»*.
 *
 * Un `.script` tiene la forma de un asset de Master Sword y por eso está en
 * `DEL_JUEGO`. Los de `contenido/scripts/` no lo son: están escritos para este
 * proyecto, igual que los mapas de `contenido/*.mjs`. Hacen `#include` de
 * guiones del juego, pero no llevan dentro ni una línea suya.
 *
 *   - **Sólo `.script`, y sólo debajo de `contenido/scripts/`.** Un `.script` en
 *     cualquier otro sitio sigue siendo rojo.
 *   - **No pueden llamarse como uno del juego**: eso lo vigila
 *     `tools/contenido.mjs` (`montarScripts`) al montarlos, que es donde se ve.
 */
const GUIONES_NUESTROS = "contenido/scripts/";
const esGuionNuestro = (ruta) => ruta.startsWith(GUIONES_NUESTROS) && extname(ruta).toLowerCase() === ".script";

/** Lo que no se recorre: no está versionado y pesa 190 MB. */
// `empaquetado/` es la salida de electron-builder: el `.exe`, su runtime de
// Chromium y los `.dll` de Electron. Nada de eso es nuestro ni del juego, y
// ninguno pasaría la regla de las extensiones — igual que `dist` y
// `node_modules`, va en `.gitignore` y no se recorre.
const FUERA = new Set(["build", "node_modules", "dist", "empaquetado", ".git"]);

/**
 * Las marcas de un asset del juego. La lista no es «formatos binarios»: es
 * **los formatos de Half-Life y de Master Sword**, que son los que no son
 * nuestros. Un `.png` nuestro tampoco entra, pero por la regla de arriba y no
 * por ésta.
 */
const DEL_JUEGO = /\.(bsp|mdl|wad|spr|tga|wav|mp3|lmp|dol|txt|res|lst|cfg|script)$/i;

function todos(dir = RAIZ, fuera = []) {
  for (const nombre of readdirSync(dir)) {
    if (FUERA.has(nombre)) continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) todos(ruta, fuera);
    else fuera.push(relative(RAIZ, ruta).split(sep).join("/"));
  }
  return fuera;
}

const permitido = (ruta) => {
  const base = ruta.split("/").pop();
  return SIN_EXTENSION.has(base) || EXTENSIONES.has(extname(base).toLowerCase()) || esCaptura(ruta) || esGuionNuestro(ruta);
};

test("en el repositorio no hay un solo asset del juego", async (t) => {
  const archivos = todos();

  await t.test("todo lo que hay es código, documentos o maquetados", () => {
    const raros = archivos.filter((r) => !permitido(r));
    assert.deepEqual(raros, [], "archivos con una extensión que no está declarada");
    assert.ok(archivos.length > 100, `sólo ${archivos.length} archivos: ¿se recorrió algo?`);
  });

  await t.test("y ninguno tiene la forma de un asset de Half-Life o de MSR", () => {
    assert.deepEqual(archivos.filter((r) => DEL_JUEGO.test(r) && !esGuionNuestro(r)), []);
  });

  await t.test("las capturas: sólo JPEG, sólo en su carpeta, y pequeñas", () => {
    const capturas = archivos.filter(esCaptura);
    const tam = capturas.map((r) => [r, statSync(join(RAIZ, r)).size]);
    for (const [r, n] of tam) {
      assert.ok(n <= CAPTURAS.porArchivo,
        `${r} pesa ${Math.round(n / 1024)} KB y el tope es ${CAPTURAS.porArchivo / 1024}`);
    }
    const total = tam.reduce((s, [, n]) => s + n, 0);
    assert.ok(total <= CAPTURAS.total,
      `las capturas pesan ${Math.round(total / 1024)} KB y el tope es ${CAPTURAS.total / 1024}: ` +
      "si de verdad hacen falta más, se sube el tope y alguien lo firma");
  });

  await t.test("y la excepción es estrecha: fuera de su sitio, una imagen se caza", () => {
    // El control positivo de la excepción. Sin él, esta prueba pasaría igual con
    // `esCaptura` devolviendo `true` para todo, y entonces la carpeta sería un
    // agujero con forma de regla — el apartado 4 escrito en la propia vacuna.
    assert.ok(esCaptura("doc/capturas/edana.jpg"));
    for (const fuera of [
      "doc/edana.jpg",                    // la extensión buena en otro sitio
      "public/edana.jpg",                 // y en el sitio que un servidor publica
      "doc/capturas/edana.png",           // el sitio bueno con otra extensión
      "doc/capturas/sub/edana.jpg",       // una subcarpeta no es la carpeta
      "src/doc/capturas/edana.jpg",       // ni un prefijo que se le parezca
    ]) {
      assert.ok(!permitido(fuera), `la excepción deja pasar ${fuera}`);
    }
  });

  await t.test("`build/` no está versionado, que es donde vive lo extraído", () => {
    // Esto sólo se puede preguntar a git. Si no hay git —una copia en zip— el
    // recorrido de arriba ya lo ha comprobado a su manera: `build/` no se mira,
    // pero tampoco hay nada binario fuera de él.
    let versionados;
    try {
      versionados = execFileSync("git", ["ls-files"], { cwd: RAIZ, encoding: "utf8" });
    } catch {
      t.diagnostic("sin git: esta comprobación se queda en la de arriba");
      return;
    }
    const lista = versionados.split("\n").filter(Boolean);
    assert.ok(lista.length > 100, `git dice que hay ${lista.length} archivos`);
    assert.deepEqual(lista.filter((r) => r.startsWith("build/")), []);
    assert.deepEqual(lista.filter((r) => r.startsWith("public/")), []);
    assert.deepEqual(lista.filter((r) => !permitido(r)), []);
  });

  await t.test("y la prueba distingue de verdad: un asset colado se caza", () => {
    // El control positivo. Sin él esto pasaría igual de bien con las dos listas
    // vacías, y entonces lo único que diría es que se ejecuta.
    for (const colado of [
      "public/maps/gatecity.bsp",
      "src/render/goblin.mdl",
      "build/gatecity/tex/stone.tga",
      "snd/ui/buttonclick.wav",
      "assets/gatecity.wad",
      "scripts/base_npc.script",
      // un guion fuera de su carpeta, aunque esté en `contenido/`
      "contenido/base_npc.script",
      "src/play/warden.script",
    ]) {
      assert.ok(
        !permitido(colado) || DEL_JUEGO.test(colado),
        `se habría colado: ${colado}`
      );
    }
    // Y no se pone nerviosa con lo que sí va.
    for (const bueno of [
      "src/play/manada.js", "sondas/ia28.mjs", "doc/IA_28.md",
      "index.html", "package.json", ".gitignore",
      "escritorio/main.cjs", "escritorio/precarga.cjs",
    ]) {
      assert.ok(permitido(bueno) && !DEL_JUEGO.test(bueno), `falso positivo: ${bueno}`);
    }
    // Un guion fuera de su carpeta NO va, ni siquiera dentro de contenido/.
    for (const fuera of ["contenido/base_npc.script", "src/play/warden.script", "contenido/scripts/x/rat.mdl"]) {
      assert.ok(!permitido(fuera), "la excepción de los guiones deja pasar " + fuera);
    }
    // Un guion nuestro, en su sitio, va.
    assert.ok(permitido("contenido/scripts/gatecity_anexo/warden.script"));
    assert.ok(esGuionNuestro("contenido/scripts/gatecity_anexo/warden.script"));
  });

  await t.test("y la procedencia de lo extraído sigue declarada", () => {
    // `build/` no está versionado, pero si está ahí tiene que llevar su ficha:
    // es el documento que dice de qué archivo del juego salió cada cosa.
    const ficha = join(RAIZ, "build", "gatecity", "PROCEDENCIA.md");
    if (!existsSync(join(RAIZ, "build", "gatecity"))) {
      t.diagnostic("sin build/gatecity: nada extraído que declarar");
      return;
    }
    assert.ok(existsSync(ficha), "hay assets extraídos y no hay PROCEDENCIA.md");
  });
});
