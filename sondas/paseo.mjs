// EL PASEO, medido: andan, siguen sobre el suelo y no se meten en la roca.
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { esNuestro } from "./mismo.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 5203;
const server = await new Promise((res, rej) => {
  const p = spawn(process.execPath, [join(ROOT, "node_modules/vite/bin/vite.js"), "--port", String(PORT), "--strictPort"],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  const t = setTimeout(() => rej(new Error("vite")), 30000);
  p.stdout.on("data", (d) => { if (d.toString().includes("ready in")) { clearTimeout(t); res(p); } });
});
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
page.on("pageerror", (e) => console.log("ERROR:", String(e?.message ?? e)));
await page.goto(`http://localhost:${PORT}/?map=gatecity`, { waitUntil: "load" });
await esNuestro(page, PORT);
await page.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
const r = await page.evaluate(({ segundos }) => {
  const p = window.probe;
  p.pause();
  const antes = p.dondeBichos();
  const pasos = Math.round(segundos * 60);
  for (let k = 0; k < pasos; k++) { p.pasoBichos(1 / 60); p.avanzarBichos(1 / 60); }
  const despues = p.dondeBichos();
  return { antes, despues, fisica: despues.map((d) => p.sondaFisica(d.p[0], d.p[1], d.p[2])) };
}, { segundos: 30 });
await browser.close(); server.kill();

const dist = r.antes.map((a, i) => Math.hypot(r.despues[i].p[0] - a.p[0], r.despues[i].p[2] - a.p[2]));
const conAnimacion = r.antes.filter((a) => a.v > 0).length;
const anduvieron = dist.filter((d, i) => r.antes[i].v > 0 && d > 0.5).length;
const quietosConPatas = dist.filter((d, i) => r.antes[i].v > 0 && d <= 0.5).length;
const sinSuelo = r.fisica.filter((f) => f.suelo === null).length;
const flotando = r.fisica.filter((f, i) => f.suelo !== null && Math.abs(f.suelo - r.despues[i].p[1]) > 0.15).length;
const enRoca = r.fisica.filter((f) => !f.libre).length;
console.log(`\n  EL PASEO, 30 s de reloj, ${r.antes.length} bichos\n`);
console.log(`  con ciclo de andar        ${conAnimacion} de ${r.antes.length}`);
console.log(`  se movieron mas de 0,5 m  ${anduvieron} de ${conAnimacion}`);
console.log(`  distancia andada          mediana ${dist.filter((d,i)=>r.antes[i].v>0).sort((a,b)=>a-b)[Math.floor(anduvieron/2)]?.toFixed(1) ?? "-"} m, ` +
  `la mayor ${Math.max(...dist).toFixed(1)} m`);
console.log(`  CONTROL sin ciclo         ${dist.filter((d, i) => !r.antes[i].v && d > 0.01).length} de ${r.antes.length - conAnimacion} se movieron (tiene que ser 0)`);
console.log(`  sobre el suelo            ${r.antes.length - sinSuelo - flotando} de ${r.antes.length}  (sin suelo debajo ${sinSuelo}, flotando o hundidos ${flotando})`);
console.log(`  fuera de la roca          ${r.antes.length - enRoca} de ${r.antes.length}`);
console.log(`  quietos teniendo patas    ${quietosConPatas} (normal: el paseo alterna andar y parar)\n`);
