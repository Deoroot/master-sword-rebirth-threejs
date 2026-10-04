// ¿Se mueven los 10 adornos vivos, y no se mueve nada más?
//
//   el control  avanzar CERO segundos no puede cambiar un píxel. Si cambia, lo
//               que se está midiendo es otra cosa —el agua, las llamas— y la
//               cifra de abajo no vale.
//   la medida   medio segundo de reloj. Se apagan el glow, los carteles, los
//               bichos y el parpadeo, así que lo único vivo en pantalla son
//               ellos.
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { esNuestro, liberarPuerto, arrancarVite } from "./mismo.mjs";
import { UNIDADES_POR_METRO as U } from "../src/bsp/lector.js";

const PORT = 5602;   // el 98: era 5196, compartido con otra sonda (test/puertos98.test.mjs)
// Se mata a quien estuviera en el puerto ANTES de arrancar el nuestro.
// `--strictPort` hace que el nuestro falle si esta ocupado, y con
// `stdio: "ignore"` ese fallo no se ve: la sonda acaba midiendo el programa
// de otro. Ver `sondas/mismo.mjs`.
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (habia ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = await arrancarVite(PORT);
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 900, height: 560 } });
await pag.goto(`http://localhost:${PORT}/?map=gatecity`, { waitUntil: "load" });
await esNuestro(pag, PORT);
await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
await pag.evaluate(() => {
  window.probe.pause();
  window.probe.setGlow(false);
  window.probe.setCarteles(false);
  window.probe.setBichos(false);
});

console.log("\n  los adornos vivos, del archivo:");
for (const a of await pag.evaluate(() => window.probe.dondeAdornos()))
  console.log(`    ${a.clave.padEnd(32)} recorrido ${a.recorrido.toFixed(2)} u  en ${a.pos.join(" ")}`);

// El ojo se saca de DONDE ESTA el adorno, y no de un sitio escrito a mano: la
// primera version llevaba las coordenadas a ojo y las dos vistas miraban a una
// pared. Una sonda que apunta a otro lado mide cero y el cero parece un fallo
// del codigo.
//
// `probe.fly` toma unidades del .bsp: `[x, y, z]` con `escena = [x/U, z/U, -y/U]`.
function ojoPara(escena, dist, altura) {
  const bsp = [escena[0] * U, -escena[2] * U, escena[1] * U];
  // La camara mira hacia (-sin yaw, 0, -cos yaw). Puesta en +X del adorno,
  // para mirarlo hace falta la direccion (-1,0,0), o sea yaw = +PI/2. Con el
  // signo al reves miraba a la pared de enfrente y la sonda decia que no se
  // movia nada: **el cero era de la camara, no del adorno**.
  return { ojo: [bsp[0] + dist * U, bsp[1], bsp[2] + altura * U], yaw: Math.PI / 2 };
}
async function foto(hud, yaw, avanzar) {
  return pag.evaluate(({ ojo, yaw, avanzar }) => {
    if (avanzar) window.probe.avanzarAdornos(avanzar);
    window.probe.fly(ojo, yaw, 0);
    const c = document.getElementById("view");
    const g = c.getContext("webgl2") ?? c.getContext("webgl");
    const px = new Uint8Array(c.width * c.height * 4);
    g.readPixels(0, 0, c.width, c.height, g.RGBA, g.UNSIGNED_BYTE, px);
    return Array.from(px);
  }, { ojo: hud, yaw, avanzar });
}
// El control POSITIVO de la vista: si la pantalla es un color plano, la camara
// esta metida en una pared y el 0 % de abajo no dice nada del adorno.
const variedad = (a) => {
  const vistos = new Set();
  let suma = 0;
  for (let i = 0; i < a.length; i += 4) { vistos.add((a[i] << 16) | (a[i + 1] << 8) | a[i + 2]); suma += a[i + 1]; }
  return { colores: vistos.size, luz: suma / (a.length / 4) };
};
const dif = (a, b) => {
  let n = 0, suma = 0, peor = 0;
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
    if (d) { n++; suma += d; peor = Math.max(peor, d); }
  }
  return { pct: (n / (a.length / 4)) * 100, medio: n ? suma / n : 0, peor };
};

// Una vista por MODELO, a tres metros de su primera colocación y mirándola. El
// sitio sale del manifiesto y no de un cuaderno — y el LADO tampoco se elige a
// mano: se prueban los cuatro y se queda el que ve más colores. Una vela metida
// en una posada tiene pared a tres metros en tres de los cuatro lados, y desde
// esa pared la medida sale cero. Pasó, y parecía que el adorno no se animaba.
const sitios = await pag.evaluate(() => window.probe.dondeAdornos());
const VISTAS = [];
for (const a of sitios) {
  if (VISTAS.some((v) => v.nombre === a.clave)) continue;
  let mejor = null;
  for (const [dx, dz, yaw] of [[3, 0, Math.PI / 2], [-3, 0, -Math.PI / 2], [0, 3, Math.PI], [0, -3, 0]]) {
    const bsp = [a.pos[0] * U, -a.pos[2] * U, a.pos[1] * U];
    const ojo = [bsp[0] + dx * U, bsp[1] - dz * U, bsp[2] + 0.6 * U];
    const v = variedad(await foto(ojo, yaw, 0));
    if (!mejor || v.colores > mejor.colores) mejor = { nombre: a.clave, ojo, yaw, colores: v.colores };
  }
  VISTAS.push(mejor);
}

console.log("\n  modelo                           control (0 s)        medio segundo");
let mal = 0, seMueven = 0;
for (const v of VISTAS) {
  const a = await foto(v.ojo, v.yaw, 0);
  const b = await foto(v.ojo, v.yaw, 0);
  const c = await foto(v.ojo, v.yaw, 0.5);
  const d0 = dif(a, b), d1 = dif(a, c);
  if (d0.pct > 0) mal++;
  if (d1.pct > 0.01) seMueven++;
  const vis = variedad(a);
  console.log(`  ${v.nombre.padEnd(32)} ${d0.pct.toFixed(3).padStart(7)} % ${d0.pct === 0 ? "(IDENTICO)" : "<- FALLO  "}   ` +
    `${d1.pct.toFixed(3).padStart(7)} % cambian, medio ${d1.medio.toFixed(1)}, peor ${String(d1.peor).padStart(3)}   ` +
    `[vista: ${String(vis.colores).padStart(5)} colores, luz ${vis.luz.toFixed(0)}]`);
}
await nav.close(); matar(dev);
process.exit(mal || !seMueven ? 1 : 0);
