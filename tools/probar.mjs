// La prueba de humo del visor: abre Corinth como lo abriría una persona.
//
//   node tools/probar.mjs            ?map=corinth
//   node tools/probar.mjs pueblo     cualquier otro mundo
//
// No sustituye a tools/andar.mjs, que juzga el mundo. Esta juzga la PÁGINA, que
// es otra cosa y ya ha fallado una vez por su cuenta: `corinth.html` funcionaba
// perfectamente para el robot de capturas y enseñaba un lienzo en blanco a una
// persona, porque solo dibujaba cuando algo llamaba a `mirar()` desde fuera.
//
// Comprueba lo que una persona notaría en los primeros diez segundos: que el
// velo de entrada se quita, que la consola no escupe errores, que el mundo trae
// los triángulos que debe, y que al pulsar W el jugador AVANZA y sigue en el
// suelo. Esto último es el que importa: una página puede montarlo todo bien y
// dejar al jugador atascado contra la primera pared.

import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 5199;
const MAPA = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "corinth";
const KEEP = process.argv.includes("--keep");
const SEGUNDOS = 12;

const proc = spawn(
  process.execPath,
  [join(ROOT, "node_modules", "vite", "bin", "vite.js"), "--port", String(PORT), "--strictPort"],
  { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] }
);
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error("vite no arrancó")), 30000);
  proc.stdout.on("data", (d) => {
    if (d.toString().includes("ready in")) { clearTimeout(t); resolve(); }
  });
  proc.on("error", reject);
});

const browser = await chromium.launch({
  headless: !KEEP,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
const errores = [];
page.on("pageerror", (e) => errores.push(String(e?.message ?? e)));

await page.goto(`http://localhost:${PORT}/?map=${MAPA}`, { waitUntil: "load" });
await page.waitForFunction(() => window.probe?.ready === true, null, { timeout: 180000 });

const estado = await page.evaluate(() => document.getElementById("status").textContent);
const velo = await page.evaluate(() => document.getElementById("intro").hidden);
const antes = await page.evaluate(() => window.probe.player.feet);

// Andar de verdad, con la tecla, no moviendo el cuerpo a mano.
await page.evaluate(() => { window.probe.keys.add("KeyW"); });
await page.waitForTimeout(SEGUNDOS * 1000);
await page.evaluate(() => window.probe.keys.clear());
await page.waitForTimeout(300);

const fin = await page.evaluate(() => ({
  pies: window.probe.player.feet,
  suelo: window.probe.player.grounded,
  andado: Number(document.getElementById("h-dist").textContent),
  triangulos: window.probe.level.mesh.triangleCount,
}));
await page.evaluate(() => window.probe.draw());
await page.screenshot({ path: join(ROOT, "build", "corinth", `navegador-${MAPA}.png`) });

if (!KEEP) { await browser.close(); proc.kill(); }

console.log(`\n${estado}\n`);
console.log(`  velo de entrada   ${velo ? "quitado" : "TAPANDO LA PANTALLA"}`);
console.log(`  andando ${SEGUNDOS} s      ${fin.andado.toFixed(1)} m, ${fin.suelo ? "en suelo" : "EN EL AIRE"}`);
console.log(`  de                ${antes.map((v) => v.toFixed(1)).join(" ")}`);
console.log(`  a                 ${fin.pies.map((v) => v.toFixed(1)).join(" ")}`);

const fallos = [];
// El velo de entrada ya tapó el juego una vez con las 55 comprobaciones en
// verde: `#intro { display: flex }` le ganaba al `display: none` del atributo
// `hidden`, y el mundo corría debajo sin que nadie lo viera.
if (!velo) fallos.push("el velo de entrada sigue puesto: la pantalla está tapada");
if (errores.length) fallos.push(`la página dio errores: ${errores.slice(0, 2).join(" | ")}`);
if (fin.triangulos === 0) fallos.push("el mundo se cargó vacío");
// Medio metro en doce segundos es estar atascado. A 5 m/s deberían ser sesenta.
if (fin.andado < 5) fallos.push(`solo ${fin.andado.toFixed(1)} m en ${SEGUNDOS} s: el jugador está atascado`);
if (!fin.suelo) fallos.push("el jugador acabó en el aire: se cayó del mundo");

console.log();
if (fallos.length) {
  for (const f of fallos) console.log("FALLO:", f);
  process.exit(1);
}
console.log(`'${MAPA}' se abre, se ve y se anda en el navegador.\n`);
