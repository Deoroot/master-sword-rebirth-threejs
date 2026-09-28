// La interfaz del personaje, mirada de verdad: se crea uno, se abre su hoja y
// su inventario, y se guarda una captura de cada pantalla.
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { esNuestro, liberarPuerto } from "./mismo.mjs";
import { mkdirSync } from "node:fs";
const PORT = 5193;
// Se mata a quien estuviera en el puerto ANTES de arrancar el nuestro.
// `--strictPort` hace que el nuestro falle si esta ocupado, y con
// `stdio: "ignore"` ese fallo no se ve: la sonda acaba midiendo el programa
// de otro. Ver `sondas/mismo.mjs`.
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (habia ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { shell: true, stdio: "ignore" });
const matar = (p) => { try { spawn("taskkill", ["/F","/T","/PID",String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
await new Promise((r) => setTimeout(r, 6000));
const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1200, height: 820 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
await pag.goto(`http://localhost:${PORT}/?map=gatecity`, { waitUntil: "load" });
await esNuestro(pag, PORT);
await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
await pag.evaluate(() => window.probe.pause());
mkdirSync("build/gatecity/vistas", { recursive: true });

const foto = async (n) => { await pag.waitForTimeout(350); await pag.screenshot({ path: `build/gatecity/vistas/ui-${n}.png` }); };

console.log("hay interfaz:", await pag.evaluate(() => window.probe.personaje.hay()));
await pag.evaluate(() => window.probe.personaje.elegir());
await foto("elegir");
await pag.evaluate(() => window.probe.personaje.crear());
await pag.fill(".mx-input", "Tirin");
await foto("crear");
// elegir la tercera arma y crear
await pag.evaluate(() => document.querySelectorAll(".mx-arma")[2].click());
await pag.evaluate(() => [...document.querySelectorAll(".mx-boton")].find((b) => b.textContent === "create").click());
await pag.waitForTimeout(600);
await foto("creado");
console.log("personajes guardados:", await pag.evaluate(() => document.querySelectorAll(".mx-lista li").length));
// jugar con él y abrir la hoja
await pag.evaluate(() => [...document.querySelectorAll(".mx-boton")].find((b) => b.textContent === "play")?.click());
await pag.waitForTimeout(600);
await pag.evaluate(() => window.probe.personaje.hoja());
await foto("hoja");
await pag.evaluate(() => window.probe.personaje.inventario());
await foto("inventario");
console.log("casillas ocupadas:", await pag.evaluate(() => document.querySelectorAll(".mx-obj").length));
console.log("errores:", errores.length ? errores : "ninguno");
await nav.close(); matar(dev);
