// EL SERVIDOR DE LA CÁSCARA DE ESCRITORIO.
//
// Lo que se mide aquí es `escritorio/servidor.js`, que es la pieza de Electron
// que SÍ se puede probar sin abrir una ventana. La ventana —que las teclas
// llegan, que el juego carga— la mide la sonda, porque eso sólo lo prueba una
// sonda.
//
// Cada comprobación lleva su control positivo al lado. Dos de ellas existen
// porque el fallo ya estaba en mi primera versión del archivo y lo encontró
// escribir esto, no ejecutarlo.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { servirArchivos } from "../escritorio/servidor.js";

/** Un árbol de mentira con la forma del de verdad: `dist/` y `build/` aparte. */
function montar() {
  const raiz = mkdtempSync(join(tmpdir(), "msr-escritorio-"));
  const dist = join(raiz, "dist");
  const contenido = join(raiz, "contenido", "build");
  mkdirSync(join(dist, "assets"), { recursive: true });
  mkdirSync(join(contenido, "msr"), { recursive: true });

  writeFileSync(join(dist, "index.html"), "<!doctype html><title>el juego</title>");
  writeFileSync(join(dist, "assets", "app.js"), "export const a = 1;\n");
  writeFileSync(join(contenido, "msr", "menu.json"), JSON.stringify({ entradas: [] }));
  // 26 bytes exactos, para poder contar sin dudar.
  writeFileSync(join(contenido, "msr", "sonido.wav"), "abcdefghijklmnopqrstuvwxyz");
  // EL SECRETO. Está FUERA de las dos raíces servidas: es lo que una ruta con
  // `..` intentaría alcanzar, y lo que nunca puede salir por el socket.
  writeFileSync(join(raiz, "secreto.txt"), "esto no se sirve");

  return { raiz, dist, contenido };
}

/**
 * Borra el temporal, esperando a que Windows suelte los descriptores.
 *
 * Esto es andamio, pero la cifra se midió y conviene que esté escrita. Windows
 * marca un archivo como «pendiente de borrar» mientras alguien tenga su
 * descriptor, y hasta que se cierre de verdad la carpeta sigue diciendo que no
 * está vacía. Desde que `cerrar()` dejó de tardar tres segundos —ver el
 * comentario de `servidor.js`— el borrado llega antes que el sistema operativo.
 *
 * El `maxRetries` de `rmSync` NO sirve aquí: con diez reintentos y 2,75 s de
 * espera seguía saliendo `ENOTEMPTY`. Un bucle propio lo borra **al segundo
 * intento, 260 ms después de cerrar**. No hay fuga: hay un desfase.
 */
async function borrar(ruta) {
  for (let i = 0; i < 40; i++) {
    try { return rmSync(ruta, { recursive: true }); }
    catch { await new Promise((f) => setTimeout(f, 50)); }
  }
  // Que no se caiga la prueba por el andamio, pero que tampoco se calle: si
  // esto sale alguna vez, hay que mirar si el servidor dejó algo abierto.
  rmSync(ruta, { recursive: true, force: true });
}

/** Levanta el servidor con el reparto real: `/build` fuera, lo demás de `dist/`. */
async function conServidor(fn) {
  const { raiz, dist, contenido } = montar();
  const srv = await servirArchivos([["/build", contenido], ["/", dist]]);
  try {
    await fn(srv.url, { raiz, dist, contenido });
  } finally {
    await srv.cerrar();
    await borrar(raiz);
  }
}

test("el servidor de la cáscara", async (t) => {
  await t.test("reparte `dist/` y `build/` sin copiar uno dentro del otro", async () => {
    await conServidor(async (url) => {
      // Lo del paquete.
      const indice = await fetch(`${url}/`);
      assert.equal(indice.status, 200);
      assert.match(await indice.text(), /el juego/);

      // Y lo del jugador, que vive en OTRO disco lógico y llega por el mismo
      // origen. Ésta es la razón de ser del archivo: `build/` no se mueve.
      const menu = await fetch(`${url}/build/msr/menu.json`);
      assert.equal(menu.status, 200);
      assert.equal(menu.headers.get("content-type"), "application/json; charset=utf-8");
      assert.deepEqual(await menu.json(), { entradas: [] });
    });
  });

  await t.test("lo que no existe es un 404 de verdad, y no el `index.html`", async () => {
    // EL CASO QUE ESTO EVITA, y no es hipotético: `src/main.js:470` lleva un
    // comentario explicando que Vite devuelve el `index.html` con un 200 para
    // lo que no encuentra, así que un `build/edana/mapa.json` que no está
    // llegaba como un `<!doctype` y reventaba el `JSON.parse` en vez de que el
    // juego dijera «ese mapa no está horneado».
    await conServidor(async (url) => {
      const res = await fetch(`${url}/build/edana/mapa.json`);
      assert.equal(res.status, 404);
      const cuerpo = await res.text();
      assert.doesNotMatch(cuerpo, /doctype/i, "devolvió el index.html, como Vite");

      // CONTROL POSITIVO: el mismo servidor sí sirve el que existe. Sin esto,
      // un servidor roto que contestara 404 a todo pasaría esta prueba.
      assert.equal((await fetch(`${url}/build/msr/menu.json`)).status, 200);
    });
  });

  await t.test("no se puede salir de las carpetas servidas con `..`", async () => {
    await conServidor(async (url, { raiz }) => {
      // LAS RUTAS IMPORTAN, y ésta es la lección cara de esta prueba.
      //
      // La primera versión usaba `/build/../../secreto.txt` y compañía, y la
      // prueba seguía VERDE con la comprobación del servidor borrada. Por dos
      // motivos encadenados:
      //
      //   1. `fetch` normaliza la URL ANTES de mandarla, así que un `..` crudo
      //      no llega jamás al servidor: se resuelve en el cliente;
      //   2. y los codificados (`%2e%2e`) sí llegan, pero empezaban por `/`, y
      //      `normalize()` sobre una ruta absoluta descarta los `..` que suben
      //      por encima de la raíz.
      //
      // O sea que ninguna de las cuatro podía salirse ni con el servidor
      // abierto de par en par. Lo que hace falta es un `..` **codificado** y
      // **después de un segmento**, que es lo que sobrevive a las dos.
      //
      // Y de las cuatro de abajo, la que de verdad muerde es **la segunda**:
      // con el control quitado, el rojo lo da `..%2f..%2f..%2f`, donde lo
      // codificado es la BARRA. Las que llevan `%2e%2e` siguen sin llegar,
      // porque el estándar de URL también trata `%2e` como un punto al
      // resolver los segmentos. Se dejan las cuatro porque documentan qué se
      // intentó, pero el control lo sostiene una.
      for (const intento of [
        "/build/msr/%2e%2e/%2e%2e/%2e%2e/secreto.txt",
        "/build/msr/..%2f..%2f..%2fsecreto.txt",
        "/build/msr/..%5c..%5c..%5csecreto.txt",
        "/assets/%2e%2e/%2e%2e/secreto.txt",
      ]) {
        const res = await fetch(`${url}${intento}`);
        assert.notEqual(res.status, 200, `se salió con ${intento}`);
        assert.doesNotMatch(await res.text(), /esto no se sirve/, `se escapó con ${intento}`);
      }

      // CONTROL POSITIVO, y aquí hace falta de verdad: todas las de arriba
      // podrían estar fallando porque el servidor no sirve NADA. Esto demuestra
      // que el archivo existe, que se puede leer y que lo único que lo detiene
      // es estar fuera de la raíz.
      const { cerrar, url: suelto } = await servirArchivos([["/", raiz]]);
      try {
        const abierto = await fetch(`${suelto}/secreto.txt`);
        assert.equal(abierto.status, 200);
        assert.equal(await abierto.text(), "esto no se sirve");
      } finally { await cerrar(); }
    });
  });

  await t.test("el `Range` del audio sirve el trozo que se pide", async () => {
    await conServidor(async (url) => {
      const son = `${url}/build/msr/sonido.wav`;

      const medio = await fetch(son, { headers: { Range: "bytes=3-7" } });
      assert.equal(medio.status, 206);
      assert.equal(medio.headers.get("content-range"), "bytes 3-7/26");
      assert.equal(await medio.text(), "defgh");

      // LA FORMA SUFIJO, que es los ÚLTIMOS n bytes y no los n primeros. Mi
      // primera versión la calculaba con la fórmula del caso general y devolvía
      // «wx» para esto: dos bytes, y empezando donde no era.
      const final = await fetch(son, { headers: { Range: "bytes=-5" } });
      assert.equal(final.status, 206);
      assert.equal(await final.text(), "vwxyz");
      assert.equal(final.headers.get("content-range"), "bytes 21-25/26");

      // Abierto por la derecha: desde el 23 hasta el final.
      const cola = await fetch(son, { headers: { Range: "bytes=23-" } });
      assert.equal(cola.status, 206);
      assert.equal(await cola.text(), "xyz");

      // Fuera del archivo: 416, no un 206 con basura.
      const malo = await fetch(son, { headers: { Range: "bytes=99-200" } });
      assert.equal(malo.status, 416);

      // CONTROL POSITIVO: sin cabecera `Range` sale entero con un 200. Si el
      // servidor contestara siempre el archivo completo, las de arriba se
      // habrían caído; y si contestara siempre 206, se caería ésta.
      const entero = await fetch(son);
      assert.equal(entero.status, 200);
      assert.equal(await entero.text(), "abcdefghijklmnopqrstuvwxyz");
      assert.equal(entero.headers.get("accept-ranges"), "bytes");
    });
  });

  await t.test("sólo se puede leer: un POST no se atiende", async () => {
    await conServidor(async (url) => {
      const res = await fetch(`${url}/build/msr/menu.json`, { method: "POST" });
      assert.equal(res.status, 405);
      // CONTROL POSITIVO: el mismo recurso por GET sí.
      assert.equal((await fetch(`${url}/build/msr/menu.json`)).status, 200);
    });
  });

  await t.test("escucha sólo en 127.0.0.1, que es contenido del jugador", async () => {
    await conServidor(async (url) => {
      assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/);
    });
  });
});
