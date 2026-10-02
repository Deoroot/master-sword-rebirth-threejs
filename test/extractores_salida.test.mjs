// DÓNDE ESCRIBE CADA EXTRACTOR, vigilado sobre el árbol entero.
//
// ── Por qué esto existe ───────────────────────────────────────────────────
//
// La refactorización que parametrizó los extractores arregló, entre otras
// cosas, que los modelos de NPC de un mapa se escribieran en la carpeta de
// Gate City aunque el censo fuera a otra. Su documento lo destaca como el
// arreglo principal, y **no tenía ni una prueba**: devolviendo a mano
//
//     salida: `build/gatecity/bichos`, raizSalida: `build/gatecity`
//
// en `tools/bichos.mjs`, las 1 324 comprobaciones seguían en verde. Un mapa
// nuevo volvía a escribir encima del viejo y nadie se enteraba — y el síntoma
// no es un error, es que Edana enseña los modelos de Gate City.
//
// La prueba de los menús que vino con el refactor **sí** lo vigila, lanzando
// la herramienta con dos mapas sintéticos y dejando un archivo testigo. Pero
// sólo vigila `menus.mjs`. Para `bichos.mjs` haría falta el `.bsp` y los
// scripts, que no están en el repositorio.
//
// Así que aquí se vigila lo que sí se puede leer sin ejecutar nada: **que la
// ruta de salida se DERIVE y no se escriba**. Es la misma forma que los dos
// guardias del experimento 47 sobre `src/`, y como ellos lleva su control
// positivo al lado: si no hubiera archivos que mirar, «no encontré ninguno»
// también sería verdad.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const HERRAMIENTAS = readdirSync("tools").filter((f) => f.endsWith(".mjs"));

/** El archivo sin comentarios: aquí se habla mucho de `build/gatecity`. */
function sinComentarios(texto) {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

/**
 * Las herramientas que hornean **de un mapa** y aceptan `--mapa`.
 *
 * Las que faltan no se olvidan, se dicen: `gatecity_shot.mjs`, `juez_luz.mjs`,
 * `mirar.mjs` y `quecara.mjs` son de diagnóstico —sacan capturas y comparan
 * caras de Gate City— y siguen con el mapa a mano a propósito. Si algún día
 * se parametrizan, entran en esta lista y la prueba las cubre sin tocarla.
 *
 * Y las que NO son de un mapa tampoco se olvidan: `jugador.mjs` hornea el
 * guion del jugador, que es el mismo en todos los mapas, y escribe en
 * `build/msr/` a propósito (64); `scriptsmsr.mjs` no hornea nada, sólo lee un
 * `.script` con sus `#include` para que los dos extractores que lo necesitan
 * no se copien la función.
 */
const POR_MAPA = [
  "gatecity.mjs", "bichos.mjs", "bicho.mjs", "aparicion.mjs",
  "menus.mjs", "guiones.mjs", "mapainfo.mjs", "sonido.mjs",
];

/** Las de diagnóstico, que NO se vigilan, y por qué. */
const DE_DIAGNOSTICO = ["gatecity_shot.mjs", "juez_luz.mjs", "mirar.mjs", "quecara.mjs"];

describe("los extractores por mapa derivan su salida, no la escriben", () => {
  test("CONTROL POSITIVO: hay herramientas que mirar y todas existen", () => {
    assert.ok(HERRAMIENTAS.length >= 15, `sólo ${HERRAMIENTAS.length} herramientas`);
    for (const h of [...POR_MAPA, ...DE_DIAGNOSTICO]) {
      assert.ok(HERRAMIENTAS.includes(h), `${h} ya no está: actualiza la lista`);
    }
  });

  test("ninguna escribe `build/<mapa>` a mano fuera de un comentario", () => {
    const malas = [];
    for (const h of POR_MAPA) {
      const texto = sinComentarios(readFileSync(`tools/${h}`, "utf8"));
      for (const [i, linea] of texto.split("\n").entries()) {
        // `build/` seguido de algo que no sea una variable ni `msr`.
        if (/build[/\\](?!msr\b)[a-z0-9_]+/i.test(linea)) malas.push(`${h}:${i + 1} ${linea.trim()}`);
      }
    }
    assert.deepEqual(malas, [], `rutas de salida escritas a mano:\n${malas.join("\n")}`);
  });

  test("y `extraerBicho` recibe siempre una salida DERIVADA", () => {
    // Éste es el que caza el fallo concreto: el sitio donde se escriben los
    // modelos y la raíz contra la que se calcula su `carpeta`.
    const derivada = /^(SALIDA|salidaComun\(|enSalida\(|`\$\{SALIDA\}|`\$\{salidaComun\(\))/;
    const encontradas = [];
    for (const h of HERRAMIENTAS) {
      const texto = sinComentarios(readFileSync(`tools/${h}`, "utf8"));
      for (const m of texto.matchAll(/\b(salida|raizSalida)\s*:\s*([^,\n]+)/g)) {
        encontradas.push({ h, clave: m[1], valor: m[2].trim() });
      }
    }
    // Control positivo: si el patrón no encontrara nada, lo de abajo sería
    // verde con el fallo puesto. Hay seis llamadas hoy.
    assert.ok(encontradas.length >= 6, `sólo ${encontradas.length} salidas encontradas`);
    const malas = encontradas.filter((e) => !derivada.test(e.valor));
    assert.deepEqual(malas.map((e) => `${e.h}: ${e.clave}: ${e.valor}`), []);
  });

  test("CONTROL: el comprobador SÍ acusa a una ruta escrita a mano", () => {
    // Sin esto, los dos de arriba podrían estar verdes por una expresión
    // regular que no casa con nada.
    const falso = "  salida: `build/gatecity/bichos`, raizSalida: `build/gatecity`,";
    assert.ok(/build[/\\](?!msr\b)[a-z0-9_]+/i.test(falso));
    const derivada = /^(SALIDA|salidaComun\(|enSalida\(|`\$\{SALIDA\}|`\$\{salidaComun\(\))/;
    const hallados = [...falso.matchAll(/\b(salida|raizSalida)\s*:\s*([^,\n]+)/g)];
    assert.equal(hallados.length, 2);
    assert.ok(hallados.every((m) => !derivada.test(m[2].trim())));
  });

  test("y las de diagnóstico están declaradas, no olvidadas", () => {
    // Que sigan teniendo el mapa a mano es el dato: si alguien las
    // parametriza, esto lo dice en vez de dejar la lista mintiendo.
    const conMapa = DE_DIAGNOSTICO.filter((h) =>
      /build[/\\](?!msr\b)[a-z0-9_]+|["'`]gatecity["'`]/.test(sinComentarios(readFileSync(`tools/${h}`, "utf8"))));
    assert.deepEqual(conMapa.sort(), [...DE_DIAGNOSTICO].sort(),
      "una de las de diagnóstico ya no nombra el mapa: sácala de la lista");
  });
});
