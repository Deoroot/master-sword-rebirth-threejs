// EL SERVIDOR ESTÁTICO DE LA CÁSCARA DE ESCRITORIO.
//
// No es el servidor multijugador —ése es `tools/servidor.mjs`— sino el que le
// da al juego sus propios archivos cuando corre dentro de Electron y no dentro
// de Vite.
//
// ── Por qué hay un servidor y no se carga `file://` ────────────────────────
//
// Porque **todas las rutas de recursos del juego son relativas**:
// `src/play/recursos.js:2` dice `build/msr`, y de ahí salen las rutas de todo
// —el mapa, los bichos, el jugador, los sonidos—. Con `file://` eso se rompe
// por dos sitios a la vez:
//
//   1. una ruta relativa resolvería contra la carpeta del `index.html`, que en
//      producción es `dist/`, y `build/` no está ni puede estar ahí dentro;
//   2. `fetch()` no funciona sobre `file://` en Chromium, y el juego entero
//      carga con `fetch`.
//
// La alternativa «moderna» sería registrar un esquema propio con
// `protocol.handle()`. Funciona, pero hay que escribirle a mano el soporte de
// `Range` para el audio, y a cambio no se gana nada aquí. Con un servidor en
// `127.0.0.1` **no hay que tocar una sola línea del juego**, y sobre todo:
// **las 57 sondas siguen valiendo**, porque siguen midiendo un Chromium contra
// un HTTP, que es exactamente lo que miden hoy.
//
// ── Las dos reglas de procedencia que esto respeta ─────────────────────────
//
// `build/` **se sirve desde donde está y no se copia a ningún sitio**. Este
// archivo no mueve un byte: abre el que hay en disco y lo manda por el socket.
// Y nada de esto pasa por `public/`, que sigue sin existir.
//
// Se escucha **sólo en `127.0.0.1`**. No es paranoia: lo que hay detrás es el
// contenido del juego del jugador, y no hay ninguna razón para que aparezca en
// su red local.

import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { join, normalize, extname, relative, isAbsolute } from "node:path";

/**
 * Los tipos que el juego pide de verdad. No es una tabla general de MIME: es la
 * lista de lo que `npm run gatecity` y sus hermanos escriben en `build/`, más
 * lo que `vite build` deja en `dist/`.
 *
 * Que `.json` lleve `charset=utf-8` importa: los textos del menú salen de un
 * `gameui_english.txt` que era UTF-16 y se reescribe en UTF-8 al hornear.
 */
const TIPOS = new Map(Object.entries({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wasm": "application/wasm",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
}));

/**
 * Resuelve una ruta de la URL contra una carpeta, **sin dejar salir de ella**.
 *
 * El control no es `includes("..")`: eso ya lo intentó `rutaComun` y aquí no
 * basta, porque el navegador normaliza antes de mandar y porque en Windows la
 * barra invertida también separa. Lo que se comprueba es el resultado: después
 * de normalizar, la ruta tiene que seguir estando **dentro** de la raíz. Si
 * `relative()` empieza por `..` o es absoluta, está fuera y se rechaza.
 *
 * @returns {string|null} la ruta en disco, o `null` si se sale
 */
function dentroDe(raiz, pedido) {
  let limpio;
  try { limpio = decodeURIComponent(pedido); } catch { return null; } // `%zz`

  // EL ORDEN DE ESTAS DOS LÍNEAS NO ES INDIFERENTE, y costó un verde vacío.
  //
  // Primero se quita la barra de delante y DESPUÉS se normaliza. Al revés
  // —normalizar una ruta que todavía empieza por `/`— Node la trata como
  // absoluta y **se come los `..` que suben por encima de la raíz**:
  //
  //   normalize("/msr/../../../secreto.txt")  ->  "\secreto.txt"
  //   normalize("msr/../../../secreto.txt")   ->  "..\..\secreto.txt"
  //
  // Con la primera forma ninguna ruta llega nunca a salirse, así que la
  // comprobación de abajo no se ejecuta jamás y se puede borrar entera sin que
  // se ponga roja una sola prueba. Eso es seguridad por accidente. Con la
  // segunda, el `..` sobrevive y el control hace su trabajo.
  limpio = normalize(limpio.replace(/^[/\\]+/, ""));

  const destino = join(raiz, limpio);
  const fuera = relative(raiz, destino);
  if (fuera.startsWith("..") || isAbsolute(fuera)) return null;
  return destino;
}

/** El archivo, si existe y es un archivo. Una carpeta no vale. */
function archivo(ruta) {
  if (!ruta) return null;
  try {
    const st = statSync(ruta);
    return st.isFile() ? st : null;
  } catch {
    return null;
  }
}

/**
 * Levanta el servidor de los archivos del juego.
 *
 * `raices` es una lista de pares `[prefijo, carpeta]` que se prueban **en
 * orden**, y es lo que permite que `dist/` y `build/` vivan en sitios
 * distintos sin copiarse el uno dentro del otro:
 *
 *   [["/build", CONTENIDO/build], ["/", APP/dist]]
 *
 * Así `/build/msr/menu.json` sale de la carpeta de contenido del jugador y
 * `/assets/index-xxxx.js` del paquete, que es justo el reparto que exige la
 * regla de procedencia.
 *
 * @param {Array<[string, string]>} raices
 * @returns {Promise<{url: string, cerrar: () => Promise<void>}>}
 */
export function servirArchivos(raices) {
  const servidor = createServer((pet, res) => {
    // Un juego no manda nada por POST a su propio servidor de archivos. Dejar
    // sólo lectura es gratis y quita una clase entera de sorpresas.
    if (pet.method !== "GET" && pet.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" });
      return res.end();
    }

    const url = new URL(pet.url, "http://127.0.0.1");
    let ruta = url.pathname;
    if (ruta.endsWith("/")) ruta += "index.html";

    for (const [prefijo, carpeta] of raices) {
      if (prefijo !== "/" && !ruta.startsWith(prefijo)) continue;
      const resto = prefijo === "/" ? ruta : ruta.slice(prefijo.length);
      const destino = dentroDe(carpeta, resto);
      const st = archivo(destino);
      if (!st) continue;
      return enviar(pet, res, destino, st);
    }

    // IMPORTANTE: un 404 de verdad, con `text/plain`.
    //
    // El servidor de Vite devuelve el `index.html` para lo que no encuentra, y
    // eso le costó un comentario a `main.js:470`: un `build/edana/mapa.json`
    // que no existe llegaba con un 200 y un `<!doctype` dentro, así que el
    // `JSON.parse` reventaba en vez de que el juego dijera «eso no está
    // horneado». Aquí no se repite ese favor.
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end(`404 ${ruta}\n`);
  });

  return new Promise((listo, mal) => {
    servidor.once("error", mal);
    // Puerto 0: que lo elija el sistema. Un puerto fijo choca con el `vite` que
    // alguien tenga abierto, o con la segunda ventana del propio juego.
    servidor.listen(0, "127.0.0.1", () => {
      const { port } = servidor.address();
      listo({
        url: `http://127.0.0.1:${port}`,
        cerrar: () => new Promise((f) => {
          // `close()` deja de aceptar conexiones nuevas pero **espera a que
          // mueran las que hay**, y las de `keep-alive` no mueren hasta que
          // caducan: cinco segundos de reloj. Medido en la prueba, cada cierre
          // costaba tres segundos.
          //
          // Eso en una prueba es una molestia; en el juego es que **al cerrar
          // la ventana la aplicación se queda unos segundos sin salir**, que
          // es como se ve un programa colgado. Aquí no hay nada que drenar con
          // delicadeza —son archivos estáticos de una sola ventana que ya se
          // ha ido—, así que se cortan y se sale.
          servidor.closeAllConnections();
          servidor.close(f);
        }),
      });
    });
  });
}

/**
 * Manda el archivo, con `Range` si lo piden.
 *
 * El `Range` no es un adorno: los sonidos del juego se piden así, y un servidor
 * que contesta siempre 200 con el archivo entero hace que el audio tarde más y
 * que algunas rutas de Chromium no puedan buscar dentro del clip.
 */
function enviar(pet, res, ruta, st) {
  const tipo = TIPOS.get(extname(ruta).toLowerCase()) ?? "application/octet-stream";
  const cabeceras = { "content-type": tipo, "accept-ranges": "bytes" };

  const rango = /^bytes=(\d*)-(\d*)$/.exec(pet.headers.range ?? "");
  if (rango) {
    let ini, fin;
    if (rango[1] === "") {
      // LA FORMA SUFIJO. `bytes=-500` son los ÚLTIMOS 500 bytes, y es una regla
      // aparte, no el caso general con el principio a cero: aquí el número que
      // viene es una CANTIDAD, no una posición. Metiéndolo en la fórmula de
      // abajo salen 500 bytes contados desde donde no es, y un sonido que
      // empieza a media palabra. Sin `rango[2]` —un `bytes=-` pelado— no hay
      // rango que servir.
      if (rango[2] === "") { ini = NaN; fin = NaN; }
      else { ini = Math.max(0, st.size - Number(rango[2])); fin = st.size - 1; }
    } else {
      ini = Number(rango[1]);
      fin = rango[2] ? Math.min(Number(rango[2]), st.size - 1) : st.size - 1;
    }
    if (!(ini >= 0 && ini <= fin && fin < st.size)) {
      res.writeHead(416, { "content-range": `bytes */${st.size}` });
      return res.end();
    }
    cabeceras["content-range"] = `bytes ${ini}-${fin}/${st.size}`;
    cabeceras["content-length"] = fin - ini + 1;
    res.writeHead(206, cabeceras);
    if (pet.method === "HEAD") return res.end();
    return tubo(res, createReadStream(ruta, { start: ini, end: fin }));
  }

  cabeceras["content-length"] = st.size;
  res.writeHead(200, cabeceras);
  if (pet.method === "HEAD") return res.end();
  tubo(res, createReadStream(ruta));
}

/**
 * Vuelca el archivo en la respuesta **y cierra el archivo pase lo que pase**.
 *
 * Un `.pipe(res)` pelado no basta, y esto no es teoría: lo cazó la prueba.
 * `pipe` cierra el origen cuando el destino termina BIEN, pero si la respuesta
 * se corta antes —el jugador cambia de mapa y el navegador aborta la descarga,
 * o se cierra la ventana y el servidor destruye los sockets— el destino nunca
 * termina, y el descriptor del archivo se queda abierto para siempre.
 *
 * En la prueba eso salía como un `ENOTEMPTY` al borrar el temporal, que parece
 * ruido del andamio. En una partida es **una fuga de descriptores**, y una
 * partida aborta peticiones a menudo.
 */
function tubo(res, flujo) {
  res.on("close", () => flujo.destroy());
  flujo.on("error", () => res.destroy());
  flujo.pipe(res);
}
