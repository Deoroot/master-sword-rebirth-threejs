// Prueba de migración: las copias antiguas existen, pero el servidor las niega.
// Así no pueden esconder una ruta olvidada. Usa un puerto libre y sólo cierra
// el servidor que crea; no interrumpe otros procesos del desarrollador.
import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

const viejas = /^\/build\/[^/]+\/(?:hud(?:\/|\.json)|menu(?:\/|\.json)|vgui2?\.json|armas(?:\/|\.json)|escudos\.json|cuerpos(?:\/|\.json)|iconos(?:\/|\.json)|efectos\.json|snd\/)/;
const bloqueadas = [];
const server = await createServer({
  server: { host: "127.0.0.1", port: 0 }, logLevel: "error",
  plugins: [{ name: "sin-copias-por-mapa", configureServer(s) {
    s.middlewares.use((req, res, next) => {
      if (!req.url.startsWith("/build/msr/") && viejas.test(req.url)) {
        bloqueadas.push(req.url);
        res.statusCode = 410; res.end("recurso compartido");
      } else next();
    });
  } }],
});
// ── POR QUÉ ÉSTA NO ENTRA POR EL MENÚ (59) ───────────────────────────────
//
// Porque no mide el juego: mide el SERVIDOR. Levanta su propio `vite`, pide
// rutas a mano y comprueba que `build/gatecity` da 410 y que lo común sale de
// `build/msr`. Y recorre los dos mapas portados en un bucle, que por el menú
// serían dos recargas y dos montajes enteros para no medir nada nuevo.
//
// La regla de la casa —«si su camino no pasa por `menuselect`, no cuenta»— es
// sobre lo que el jugador hace. Aquí no hay jugador.
let browser;
try {
  await server.listen();
  const origen = `http://127.0.0.1:${server.httpServer.address().port}`;
  // Control positivo: la barrera realmente bloquea las rutas antiguas.
  assert.equal((await fetch(`${origen}/build/gatecity/cuerpos.json`)).status, 410);
  bloqueadas.length = 0;
  browser = await chromium.launch();
  for (const mapa of ["gatecity", "edana"]) {
    const page = await browser.newPage();
    const errores = [], comunes = new Set();
    page.on("pageerror", e => errores.push(e.message));
    page.on("response", r => {
      const p = new URL(r.url()).pathname;
      if (r.ok() && p.startsWith("/build/msr/")) comunes.add(p);
    });
    await page.goto(`${origen}/?map=${mapa}`);
    await page.waitForFunction(() => window.probe?.ready, null, { timeout: 120000 });
    await page.evaluate(() => window.probe.sesion.nuevo("Recursos"));
    const modelo = await page.evaluate(() => window.probe.vista.genero("female"));
    assert.ok(modelo?.triangulos > 0, `${mapa}: el modelo debe existir`);
    for (const archivo of ["hud.json", "menu.json", "vgui.json", "vgui2.json", "cuerpos.json", "armas.json", "escudos.json", "efectos.json", "iconos.json"]) {
      assert.ok(comunes.has(`/build/msr/${archivo}`), `${mapa}: no cargó ${archivo}`);
    }
    assert.ok([...comunes].some(p => /\/cuerpos\/.*\.bin$/.test(p)), "el manifiesto no basta: debe descargar la malla");
    assert.deepEqual(errores, []);
    assert.deepEqual(bloqueadas, []);
    console.log(`${mapa}: ${comunes.size} recursos compartidos, modelo con ${modelo.triangulos} triángulos, ninguna ruta antigua`);
    await page.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
