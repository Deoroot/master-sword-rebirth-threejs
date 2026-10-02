// EL 47: QUÉ MAPA SE ESTÁ JUGANDO.
//
// Todo el puerto se construyó contra Gate City y eso dejó `build/gatecity`
// escrito a mano en cuarenta sitios. Esto es el único sitio que lo dice ahora,
// y lo que se comprueba aquí es lo que puede salir mal cuando el nombre de una
// carpeta viene de la barra de direcciones.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";

import {
  MAPA_POR_DEFECTO, MAPAS_PORTADOS, RAIZ, NOMBRE_VALIDO, LARGO_MAXIMO,
  esNombreDeMapa, mapaPedido, baseDe, rutaDe,
} from "../src/play/mapa.js";
import { MAPAS, mapaElegido } from "../src/play/crearpartida.js";
import {
  mapaDeArgv, bspDe, salidaDe, creditoDe, AUTORES, CONTENIDO, NO_SON_DE_UN_MAPA,
} from "../tools/mapa.mjs";

describe("qué es un nombre de mapa", () => {
  test("los de verdad valen, incluidos los de guion bajo", () => {
    // Son nombres de `.bsp` de Master Sword, sacados de `../MSC/assets/msr/maps`.
    for (const n of ["gatecity", "edana", "old_helena", "hall_of_deralia", "b_castle", "aluhandra2"]) {
      assert.ok(esNombreDeMapa(n), n);
    }
  });

  test("y lo que NO es un mapa se rechaza", () => {
    for (const n of ["", null, undefined, "Gatecity", "gate city", "gate-city", "gatecity.bsp"]) {
      assert.equal(esNombreDeMapa(n), false, JSON.stringify(n));
    }
  });

  test("LO QUE DE VERDAD IMPORTA: no se puede salir de `build/`", () => {
    // El nombre entra por `?map=`, que es la línea de órdenes del juego, y de
    // ahí sale una ruta que se le pasa a `fetch`. Sin filtro,
    // `?map=../../../algo` es un `fetch("build/../../../algo/malla.json")` y el
    // navegador lo sigue tan contento. Éste es el motivo de que exista
    // `NOMBRE_VALIDO` y no un `if (nombre)`.
    for (const n of ["..", "../otro", "a/b", "/etc/passwd", "a\\b", "http://x/y", "a%2fb"]) {
      assert.equal(esNombreDeMapa(n), false, n);
      assert.throws(() => baseDe(n), /no es un nombre de mapa/, n);
    }
  });

  test("y hay un tope, para que un nombre absurdo no dé una ruta absurda", () => {
    assert.ok(esNombreDeMapa("a".repeat(LARGO_MAXIMO)));
    assert.equal(esNombreDeMapa("a".repeat(LARGO_MAXIMO + 1)), false);
  });

  test("el patrón es el del motor: minúsculas, dígitos y guion bajo", () => {
    assert.equal(NOMBRE_VALIDO.source, "^[a-z0-9_]+$");
  });
});

describe("`?map=`, que es el `hl.exe +map` del juego", () => {
  test("sin nada se entra en el de por defecto, y sin quejarse", () => {
    assert.deepEqual(mapaPedido(""), { mapa: MAPA_POR_DEFECTO, pedido: null, porQueNo: null });
    assert.deepEqual(mapaPedido("?red=1"), { mapa: MAPA_POR_DEFECTO, pedido: null, porQueNo: null });
  });

  test("con un mapa, ese mapa, con o sin interrogación delante", () => {
    assert.equal(mapaPedido("?map=edana").mapa, "edana");
    assert.equal(mapaPedido("map=edana").mapa, "edana");
    assert.equal(mapaPedido("?red=1&map=old_helena").mapa, "old_helena");
  });

  test("UN NOMBRE MALO NO CAE AL DE POR DEFECTO EN SILENCIO", () => {
    // Que es lo que costaría media hora: quien escribe `?map=Gatecity` con
    // mayúscula vería un mapa que carga y no entendería por qué no es el
    // suyo. Se dice el motivo y quien llama decide qué hacer con él.
    const r = mapaPedido("?map=Gatecity");
    assert.equal(r.mapa, MAPA_POR_DEFECTO);
    assert.equal(r.pedido, "Gatecity");
    assert.match(r.porQueNo, /Gatecity/);
  });

  test("y un intento de salirse tampoco pasa por aquí", () => {
    const r = mapaPedido("?map=..%2F..%2Fetc");
    assert.equal(r.mapa, MAPA_POR_DEFECTO);
    assert.ok(r.porQueNo);
  });

  test("una cadena de búsqueda rota no lanza", () => {
    assert.equal(mapaPedido(null).mapa, MAPA_POR_DEFECTO);
    assert.equal(mapaPedido(undefined).mapa, MAPA_POR_DEFECTO);
  });
});

describe("las rutas", () => {
  test("`baseDe` NO lleva barra al final", () => {
    // Es lo que esperan los `base` de `src/render/` y `src/red/`, que ya
    // venían parametrizados y sólo tenían mal el valor por omisión. Quien
    // necesita la barra —`cargarEsquema`, la ficha del HUD— la pone.
    assert.equal(baseDe("gatecity"), "build/gatecity");
    assert.equal(RAIZ, "build");
  });

  test("`rutaDe` junta trozos y se salta los vacíos", () => {
    assert.equal(rutaDe("gatecity", "bichos.json"), "build/gatecity/bichos.json");
    assert.equal(rutaDe("gatecity", "snd", "player/pl_step1.wav"), "build/gatecity/snd/player/pl_step1.wav");
    assert.equal(rutaDe("gatecity"), "build/gatecity");
    assert.equal(rutaDe("gatecity", "", null, undefined), "build/gatecity");
  });

  test("y un TROZO tampoco puede salirse", () => {
    // La otra mitad: el nombre del mapa viene de fuera, pero un trozo puede
    // venir de un manifiesto, que también es un archivo que no escribimos.
    assert.throws(() => rutaDe("gatecity", "../../etc"), /se sale/);
    assert.throws(() => rutaDe("gatecity", "/etc/passwd"), /se sale/);
  });
});

describe("la lista de mapas, que está en UN sitio", () => {
  test("«Create Server» la saca de `MAPAS_PORTADOS`, no de su propia copia", () => {
    // Antes del 47 había una lista en `crearpartida.js` y otra idea de «el
    // mapa» repartida por `main.js`. Si esto se cae es porque alguien volvió
    // a escribir un nombre de mapa a mano.
    assert.deepEqual(MAPAS, ["< Random Map >", ...MAPAS_PORTADOS]);
  });

  test("el mapa por omisión es uno de los portados", () => {
    // La coherencia que de verdad importa: si no lo fuera, entrar sin `?map=`
    // daría una pantalla de error.
    assert.ok(MAPAS_PORTADOS.includes(MAPA_POR_DEFECTO));
  });

  test("y todos los portados son nombres válidos", () => {
    for (const m of MAPAS_PORTADOS) assert.ok(esNombreDeMapa(m), m);
  });

  test("`< Random Map >` sigue eligiendo entre los de verdad", () => {
    assert.ok(MAPAS_PORTADOS.includes(mapaElegido("< Random Map >")));
  });
});

// ══ EL LADO DE LA EXTRACCIÓN ══════════════════════════════════════════════

describe("`tools/mapa.mjs`: qué mapa hornea una herramienta", () => {
  test("`--mapa`, una ruta `.bsp`, o el de por defecto", () => {
    assert.equal(mapaDeArgv([]), MAPA_POR_DEFECTO);
    assert.equal(mapaDeArgv(["--mapa", "edana"]), "edana");
    assert.equal(mapaDeArgv(["../MSC/assets/msr/maps/old_helena.bsp"]), "old_helena");
    assert.equal(mapaDeArgv(["--gamma", "3.4", "C:\\x\\edana.bsp"]), "edana");
  });

  test("`--mapa` gana a la ruta, que es lo que uno espera al escribir las dos", () => {
    assert.equal(mapaDeArgv(["otra/cosa.bsp", "--mapa", "edana"]), "edana");
  });

  test("EL FALLO QUE ESTO ARREGLA: `edana.bsp` ya no se escribe en `build/gatecity`", () => {
    // Antes del 47, `tools/gatecity.mjs` aceptaba una ruta `.bsp` cualquiera y
    // la salida estaba escrita a mano: se le podía dar Edana y la dejaba
    // encima de Gate City, sin avisar. Es el peor de los dos fallos posibles.
    assert.equal(salidaDe(mapaDeArgv(["maps/edana.bsp"])).replace(/\\/g, "/").endsWith("build/edana"), true);
  });

  test("y el `.bsp` sale del mapa cuando no se da la ruta", () => {
    assert.equal(bspDe("edana", []), `${CONTENIDO}/maps/edana.bsp`);
    assert.equal(bspDe("edana", ["otra/cosa.bsp"]), "otra/cosa.bsp");
  });

  test("LA ATRIBUCIÓN DEL MAPA NO SE PIERDE EN UN REFACTOR", () => {
    // Al parametrizar el extractor se me cayó el «(DrKill)» de la línea
    // `procedencia` del `malla.json`, y lo cazó comparar el archivo de antes
    // con el de después. Una atribución perdida en un refactor es peor que
    // una que nunca estuvo. Ver CREDITOS.md.
    assert.equal(AUTORES.gatecity, "DrKill");
    assert.equal(creditoDe("gatecity"), "gatecity.bsp (DrKill)");
    // Y de un mapa cuyo autor no sabemos NO se inventa uno.
    assert.equal(creditoDe("edana"), "edana.bsp");
  });

  test("las herramientas que NO son de un mapa están contadas, no comentadas", () => {
    // Nueve extractores comunes, además de objetos; sonido conserva catálogo por mapa.
    assert.equal(NO_SON_DE_UN_MAPA.length, 9);
    // Los archivos de sonido se comparten, su catálogo depende del mapa.
    assert.ok(!NO_SON_DE_UN_MAPA.includes("sonido.mjs"));
    for (const t of NO_SON_DE_UN_MAPA) {
      assert.ok(existsSync(`tools/${t}`), `tools/${t} no existe: la lista envejeció`);
    }
  });
});

// ══ EL GUARDIA: QUE NO VUELVA A CRECER ════════════════════════════════════

describe("nadie vuelve a escribir «build/gatecity» a mano", () => {
  /** Los `.js` del juego, que son los que se sirven al navegador. */
  const fuentes = (() => {
    const fuera = [];
    const anda = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const r = `${dir}/${e.name}`;
        if (e.isDirectory()) anda(r);
        else if (e.name.endsWith(".js")) fuera.push(r);
      }
    };
    anda("src");
    return fuera;
  })();

  test("hay fuentes que mirar: si no, esto no mide nada", () => {
    // El control positivo. Sin él, «no encontré ninguna» sería verdad también
    // con la lista vacía, que es el fallo del apartado 4 con otra ropa.
    assert.ok(fuentes.length > 40, `sólo ${fuentes.length} archivos`);
  });

  test("y ninguno la lleva escrita fuera de un comentario", () => {
    const malos = [];
    for (const f of fuentes) {
      readFileSync(f, "utf8").split(/\r?\n/).forEach((linea, i) => {
        if (!linea.includes(`${RAIZ}/${MAPA_POR_DEFECTO}`)) return;
        // Los comentarios sí pueden nombrarlo: hablan de lo que se midió.
        if (/^\s*(\/\/|\*|\/\*)/.test(linea)) return;
        malos.push(`${f}:${i + 1}`);
      });
    }
    assert.deepEqual(malos, [], "sale de `baseDe(MAPA_POR_DEFECTO)`, no a mano");
  });

  // ── EL GUARDIA SE EXTIENDE A TODO `src/` (59) ───────────────────────────
  //
  // Hasta el 59 esto miraba sólo `src/play/` y `src/bsp/`, y por eso no vio
  // que `src/render/bsp_escena.js` bautizaba las tres mallas de la escena
  // como «gatecity», «gatecity-translucido» y «gatecity-detalle». Con Edana
  // cargado, la malla de Edana se llamaba «gatecity» y quien la buscara por
  // ese nombre la encontraba — o encontraba la de otro mapa.
  //
  // No hay ninguna capa de `src/` que deba saber en qué mapa está: ni las
  // reglas, ni el lector de formatos, ni el render, ni la interfaz, ni
  // `main.js`. La única excepción es `mapa.js`, que es donde vive el nombre.
  const NO_LO_SABEN = (x) => !x.endsWith("/play/mapa.js");

  test("hay archivos bajo el guardia, y son casi todos: si no, no mide nada", () => {
    // El positivo de la extensión. Sin él, ampliar el filtro a `src/` entero y
    // equivocarse al escribirlo daría una lista vacía y un verde.
    const bajo = fuentes.filter(NO_LO_SABEN);
    assert.ok(bajo.length > 40, `sólo ${bajo.length} archivos bajo el guardia`);
    assert.equal(fuentes.length - bajo.length, 1, "la excepción es una: `mapa.js`");
  });

  test("el nombre del mapa tampoco, suelto, en NINGÚN archivo de `src/`", () => {
    const malos = [];
    for (const f of fuentes.filter(NO_LO_SABEN)) {
      readFileSync(f, "utf8").split(/\r?\n/).forEach((linea, i) => {
        if (!linea.includes(MAPA_POR_DEFECTO)) return;
        if (/^\s*(\/\/|\*|\/\*)/.test(linea)) return;
        malos.push(`${f}:${i + 1}  ${linea.trim()}`);
      });
    }
    assert.deepEqual(malos, []);
  });

  test("y ninguno nombra a OTRO mapa portado tampoco", () => {
    // El segundo caso, que es la defensa que enseñó el 50: mientras sólo se
    // vigile un nombre, el control no distingue «no hay nombres de mapa» de
    // «no hay ESTE nombre de mapa». Con dos portados ya se puede preguntar.
    const otros = MAPAS_PORTADOS.filter((m) => m !== MAPA_POR_DEFECTO);
    assert.ok(otros.length >= 1, "hace falta un segundo mapa para que esto mida");
    const malos = [];
    for (const f of fuentes.filter(NO_LO_SABEN)) {
      readFileSync(f, "utf8").split(/\r?\n/).forEach((linea, i) => {
        if (!otros.some((m) => linea.includes(m))) return;
        if (/^\s*(\/\/|\*|\/\*)/.test(linea)) return;
        malos.push(`${f}:${i + 1}  ${linea.trim()}`);
      });
    }
    assert.deepEqual(malos, []);
  });
});
