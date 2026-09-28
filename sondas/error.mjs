import { spawn } from "node:child_process";
import { chromium } from "playwright";
// `kill()` en Windows mata el `cmd` y deja el `vite` vivo: el puerto se queda
// cogido y la siguiente sonda mide contra un servidor de hace media hora.
const matar = (p) => { try { process.platform === "win32" ? spawn("taskkill", ["/F","/T","/PID",String(p.pid)],{shell:true,stdio:"ignore"}) : p.kill(); } catch {} };
const PORT = 5199;
const dev = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { shell: true, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 6000));
const b = await chromium.launch();
const p = await b.newPage();
p.on("console", (m) => console.log("  consola:", m.type(), m.text().slice(0, 300)));
p.on("pageerror", (e) => console.log("  ERROR:", String(e?.stack ?? e).slice(0, 800)));
await p.goto(`http://localhost:${PORT}/?map=gatecity`, { waitUntil: "load" });
await new Promise((r) => setTimeout(r, 25000));
console.log("ready =", await p.evaluate(() => window.probe?.ready));
await b.close(); matar(dev);
process.exit(0);
