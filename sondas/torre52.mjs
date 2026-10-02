// MIRAR LA ESCENA DE LA TORRE mientras se construye.
//
//   npm run sonda:torre52
//
// No es un control: no dice «bien» ni «mal». Es la herramienta con la que se
// itera la escena, y hace tres cosas:
//
//   1. fotografía el recorrido en cinco puntos, para ver que el encuadre aguanta
//      TODO el trayecto — que es el defecto que tuvieron los miradores de Gate
//      City del 52, elegidos de una sola foto en `s = 0`;
//   2. adelanta las nubes, para ver una banda cruzando la torre (la pista 2);
//   3. lo junta en una hoja de contactos.
//
// Y de paso escribe los errores de la página, que en una escena con sombreadores
// propios son la mitad de las veces lo que falla.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto } from "./mismo.mjs";
import { mkdirSync } from "node:fs";

const PORT = 5221;
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (habia ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { shell: true, stdio: "ignore" });
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
await new Promise((r) => setTimeout(r, 6000));

const nav = await chromium.launch();
const ANCHO = 640, ALTO = 400;
const pag = await nav.newPage({ viewport: { width: ANCHO, height: ALTO } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 300)));
pag.on("console", (m) => { if (m.type() === "error") errores.push(`console: ${m.text().slice(0, 200)}`); });

await pag.goto(`http://localhost:${PORT}/sondas/torre.html`, { waitUntil: "load" });
mkdirSync("build/gatecity/vistas", { recursive: true });

try {
  await pag.waitForFunction(() => window.vista?.lista === true, null, { timeout: 30000 });
} catch {
  console.log("\n  LA VISTA NO ARRANCÓ. Errores de la página:");
  for (const e of errores) console.log(`    ${e}`);
  await nav.close(); matar(dev); process.exit(1);
}

const tiros = [];
// Los cinco puntos del recorrido. Si el encuadre se rompe, se rompe en alguno
// de éstos y no en el que se miró al elegirlo.
for (const s of [0, 0.25, 0.5, 0.75, 1]) {
  const donde = await pag.evaluate((v) => window.vista.en(v), s);
  await pag.waitForTimeout(160);
  const png = await pag.screenshot({ type: "png" });
  tiros.push({ nombre: `s=${s}`, png: png.toString("base64") });
  console.log(`  s=${String(s).padEnd(5)} cámara [${donde.pos.map((v) => v.toFixed(0)).join(", ")}]  yaw ${donde.yaw.toFixed(2)}`);
}

// Y tres momentos de las nubes desde el mismo punto, para ver la pista 2: una
// banda cruzando el fuste. Si en ninguno de los tres tapa la torre, la pista
// no está haciendo su trabajo por mucho que las bandas existan.
await pag.evaluate(() => window.vista.en(0.5));
for (const seg of [0, 40, 90]) {
  if (seg) await pag.evaluate((v) => window.vista.nubes(v), seg === 40 ? 40 : 50);
  await pag.waitForTimeout(160);
  const png = await pag.screenshot({ type: "png" });
  tiros.push({ nombre: `nubes +${seg}s`, png: png.toString("base64") });
}

const cols = 4;
const hoja = await nav.newPage({
  viewport: { width: ANCHO * cols, height: ALTO * Math.ceil(tiros.length / cols) },
});
await hoja.setContent(`<style>
  body { margin:0; background:#111; display:grid; grid-template-columns:repeat(${cols},${ANCHO}px); }
  figure { margin:0; position:relative; }
  img { display:block; width:${ANCHO}px; }
  figcaption { position:absolute; left:8px; top:6px; color:#ffdf9a; font:bold 16px monospace;
    text-shadow:0 1px 3px #000,0 0 6px #000; }
</style>` + tiros.map((t) => `<figure><img src="data:image/png;base64,${t.png}">
  <figcaption>${t.nombre}</figcaption></figure>`).join(""));
await hoja.waitForTimeout(400);
await hoja.screenshot({ path: "build/gatecity/vistas/torre52.png", fullPage: true });

console.log(`\n  hoja de contactos  build/gatecity/vistas/torre52.png  (${tiros.length})`);
console.log(`  errores de pagina: ${errores.length ? errores.join(" | ") : "ninguno"}`);

await nav.close();
matar(dev);
process.exit(0);
