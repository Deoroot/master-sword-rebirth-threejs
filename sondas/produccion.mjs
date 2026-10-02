// LA RAMA DE PRODUCCIÓN: `dist/` servido por `escritorio/servidor.js`.
//
// ── Por qué esto existe ────────────────────────────────────────────────────
//
// `sondas/escritorio.mjs` mide la cáscara con **Vite detrás**, y lo declaraba
// como límite al final de su informe: *«el camino de producción (dist/ servido
// por servidor.js): esta sonda mide la rama de desarrollo»*. Era verdad y era un
// agujero del tamaño del juego entero: el `.exe` no usa Vite por ningún lado.
//
// Las dos ramas se parecen poco. Vite resuelve módulos, reescribe rutas y
// contesta `index.html` a lo que no encuentra; `servidor.js` sirve archivos de
// disco, devuelve un 404 de verdad y responde `Range` a mano. Que una funcione
// no dice nada de la otra.
//
// ── Y por qué no hace falta empaquetar para medirlo ───────────────────────
//
// Porque el 74 añadió `--produccion`. Antes, `DESARROLLO` era
// `!app.isPackaged || argumentos.has("--dev")`, con lo que la rama de producción
// **sólo corría empaquetada**: depurarla costaba un empaquetado entero por
// intento, y el error salía dentro de un `.exe` sin consola.
//
// Lo que esta sonda NO mide, y se dice: el `.exe` en sí. Eso pide `npm run exe`,
// cinco minutos y 347 MB, así que no cabe en una sonda que se pasa a menudo. Se
// midió a mano en el 74 —arrancó, cargó Edana, el audio sonó— y lo que queda
// aquí es la parte que se puede repetir barata.

import { _electron as electron } from "playwright";
import { existsSync } from "node:fs";

const controles = [];
const control = (que, bien, detalle = "") => {
  controles.push({ que, bien, detalle });
};

if (!existsSync("dist/index.html")) {
  console.error("\n  No hay dist/index.html. Corre antes `npm run empaquetar`.\n");
  process.exit(1);
}

const env = { ...process.env };
// VS Code y cualquier terminal de una aplicación Electron la ponen, y con ella
// el binario de Electron arranca como Node pelado y no abre ninguna ventana.
// Costó tres diagnósticos equivocados en el 72.
delete env.ELECTRON_RUN_AS_NODE;

let app;
try {
  app = await electron.launch({ args: ["escritorio/main.cjs", "--produccion"], env });
  const pag = await app.firstWindow();

  const errores = [];
  const fallos = [];
  pag.on("pageerror", (e) => errores.push(e.message));
  pag.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
  pag.on("response", (r) => { if (r.status() >= 400) fallos.push(`${r.status()} ${r.url()}`); });

  // 1 · No es Vite. El puerto es efímero y lo elige `servidor.js`.
  const url = pag.url();
  control("la ventana NO apunta a Vite: la sirve nuestro servidor",
    /^http:\/\/127\.0\.0\.1:\d+\//.test(url) && !url.includes("5174"), url);

  await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 300000 });
  control("el juego compilado por Vite arranca servido desde disco", true);

  // 2 · El contenido viene de FUERA del paquete, que es la regla de procedencia.
  const fondo = await pag.evaluate(() =>
    getComputedStyle(document.querySelector(".ms-menu")).backgroundImage);
  control("la pintura del menú sale de /build, que vive fuera del paquete",
    /\/build\/msr\/menu\/fondo\.png/.test(fondo), fondo.slice(0, 80));

  // 3 · Entrar a jugar es lo que ejerce el servidor de verdad: el `.bsp`, el
  //     atlas de luz, los modelos y el audio con sus `Range`.
  await pag.locator(".ms-menu-op").filter({ hasText: /^Establish a Kingdom$/ }).click();
  await pag.waitForSelector(".v2-ventana");
  await pag.locator(".v2-boton").filter({ hasText: /^Start$/ }).click();
  await pag.waitForFunction(() => window.probe?.level?.name, null, { timeout: 300000 });
  const mapa = await pag.evaluate(() => window.probe.level.name);
  control("se entra a un mapa entero por el camino del jugador", Boolean(mapa), mapa);

  // 4 · EL AUDIO, que es el que viaja por `Range`.
  //
  // Y es el control que decidió que el paquete vaya SIN asar: Electron parchea
  // `fs` para leer dentro de un `.asar`, y los `Range` a medio archivo son justo
  // donde un parche se comporta distinto. Esto lo mide en vez de suponerlo.
  await pag.mouse.click(600, 400);          // ningún Chromium suena sin un gesto
  await pag.waitForTimeout(1500);
  const son = await pag.evaluate(() => window.probe.sonido.estado);
  control("el audio suena: contexto despierto y fuentes arrancadas",
    son.contexto === "running" && son.despierto === true && son.arrancadas > 0,
    `contexto ${son.contexto}, ${son.arrancadas} fuentes`);
  control("y ninguna se cayó por el camino", (son.fallos?.length ?? 0) === 0,
    JSON.stringify(son.fallos ?? []));

  // 5 · Un 404 aquí es un 404 de verdad, no el `index.html` de Vite — y por eso
  //     se puede exigir que no haya ninguno que no esté explicado.
  //
  //     `adornosvivos.json` no está horneado para Edana (sí para Gate City), así
  //     que su 404 es un hueco del CONTENIDO y no del servidor. Se nombra para
  //     que un 404 nuevo no se cuele detrás de él.
  const inesperados = fallos.filter((f) => !/adornosvivos\.json/.test(f));
  control("ninguna petición falla, salvo el hueco de contenido ya conocido",
    inesperados.length === 0, inesperados.join(" | ") || `(${fallos.length} conocido/s)`);

  control("y la página no escupió un solo error",
    errores.filter((e) => !/404/.test(e)).length === 0,
    errores.slice(0, 3).join(" | ") || "ninguno");
} catch (e) {
  control(`la sonda se cayó: ${String(e).slice(0, 200)}`, false);
} finally {
  await app?.close().catch(() => {});
}

console.log("\n  CONTROLES");
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(64)} ${c.detalle}`);

console.log("\n  pendiente (declarado, y NO contado entre los verdes):");
console.log("    - el `.exe` empaquetado. Pide `npm run exe`, unos minutos y");
console.log("      347 MB, así que no cabe en una sonda de pasar a menudo. Se");
console.log("      midió a mano en el 74: arrancó, cargó Edana y el audio sonó.");

// El marcador se calcula sobre lo DECLARADO y no sobre lo que llegó a correr:
// un «X de Y» donde Y sale al final no puede bajar nunca (el fallo del 65).
const DECLARADOS = 8;
const bien = controles.filter((c) => c.bien).length;
console.log(`\n  ${bien} de ${DECLARADOS} controles en verde` +
  (controles.length < DECLARADOS ? `  (sólo se ejecutaron ${controles.length})` : ""));
console.log("");
process.exit(bien < DECLARADOS ? 1 : 0);
