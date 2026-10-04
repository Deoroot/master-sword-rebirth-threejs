import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { esNuestro, liberarPuerto, arrancarVite } from "./mismo.mjs";
const PORT = 5601;   // el 98: era 5195, compartido con otra sonda (test/puertos98.test.mjs)
// Se mata a quien estuviera en el puerto ANTES de arrancar el nuestro.
// `--strictPort` hace que el nuestro falle si esta ocupado, y con
// `stdio: "ignore"` ese fallo no se ve: la sonda acaba midiendo el programa
// de otro. Ver `sondas/mismo.mjs`.
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (habia ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = await arrancarVite(PORT);
const matar = (p) => { try { spawn("taskkill", ["/F","/T","/PID",String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
const nav = await chromium.launch();
const pag = await nav.newPage();
pag.on("pageerror", (e) => console.log("  ERROR:", String(e).slice(0, 300)));
await pag.goto(`http://localhost:${PORT}/?map=gatecity`, { waitUntil: "load" });
await esNuestro(pag, PORT);
await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
await pag.evaluate(() => window.probe.pause());
const a = await pag.evaluate(() => window.probe.dondeAdornos());
await pag.evaluate(() => window.probe.avanzarAdornos(0.5));
const b = await pag.evaluate(() => window.probe.dondeAdornos());
console.log("\n  clave                          animacion   fotog   huesos t=0      huesos t=0,5   se mueve");
for (let i = 0; i < a.length; i++) {
  const d = Math.abs(a[i].huesos - b[i].huesos);
  console.log(`  ${a[i].clave.padEnd(32)}${String(a[i].animacion).padEnd(11)}${String(a[i].fotogramas).padStart(5)}   ` +
    `${a[i].huesos.toFixed(3).padStart(12)}  ${b[i].huesos.toFixed(3).padStart(12)}   ${d > 1e-5 ? "SI" : "no"}`);
}
await nav.close(); matar(dev);
