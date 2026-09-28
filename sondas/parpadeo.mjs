// ¿PARPADEA, y parpadea donde debe?
//
// Dos preguntas y las dos tienen respuesta exacta, sin mirar un GIF:
//
//   el control  los pasos 0 y 3 del ciclo son EL MISMO estado —el estilo 1 en
//               'm' y el 6 en 'n'—, así que la pantalla tiene que salir
//               IDÉNTICA. Si cambia, el índice de variante está mal y el
//               parpadeo estaría enseñando la variante de otra cara.
//   la medida   el paso 225 es el más lejano del 0 ('q','q' contra 'm','n').
//               Ahí es donde se ve cuánto vale esto.
//
// Se apagan el glow, los carteles y los bichos: las llamas y los bichos se
// mueven solos y contaminarían la cuenta.
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { esNuestro, liberarPuerto } from "./mismo.mjs";
// `kill()` en Windows mata el `cmd` y deja el `vite` vivo: el puerto se queda
// cogido y la siguiente sonda mide contra un servidor de hace media hora.
const matar = (p) => { try { process.platform === "win32" ? spawn("taskkill", ["/F","/T","/PID",String(p.pid)],{shell:true,stdio:"ignore"}) : p.kill(); } catch {} };
import { escribirPng } from "../tools/png.mjs";
import { UNIDADES_POR_METRO as U } from "../src/bsp/lector.js";

const PORT = 5198;
// Se mata a quien estuviera en el puerto ANTES de arrancar el nuestro.
// `--strictPort` hace que el nuestro falle si esta ocupado, y con
// `stdio: "ignore"` ese fallo no se ve: la sonda acaba midiendo el programa
// de otro. Ver `sondas/mismo.mjs`.
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (habia ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { shell: true, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 6000));
const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 960, height: 600 } });
await pag.goto(`http://localhost:${PORT}/?map=gatecity`, { waitUntil: "load" });
await esNuestro(pag, PORT);
await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
await pag.evaluate(() => {
  window.probe.pause();
  window.probe.setGlow(false);
  window.probe.setCarteles(false);
  window.probe.setBichos(false);
});

const VISTAS = [
  { nombre: "calle", hud: [-217, -575, 577], yaw: 180 },
  { nombre: "plaza", hud: [-117, -575, 994], yaw: 0 },
  { nombre: "cueva", hud: [-678, -383, 2781], yaw: 180 },
];

async function tomar(hud, yaw, t) {
  return pag.evaluate(({ ojo, yaw, t }) => {
    window.probe.setReloj(t);
    window.probe.fly(ojo, yaw, 0);
    const c = document.getElementById("view");
    const g = c.getContext("webgl2") ?? c.getContext("webgl");
    const px = new Uint8Array(c.width * c.height * 4);
    g.readPixels(0, 0, c.width, c.height, g.RGBA, g.UNSIGNED_BYTE, px);
    return { datos: Array.from(px), ancho: c.width, alto: c.height };
  }, { ojo: [hud[0], -hud[2], hud[1] + 1.7 * U], yaw: (yaw * Math.PI) / 180, t });
}

function diferencia(a, b) {
  let cambiados = 0, suma = 0, peor = 0;
  for (let i = 0; i < a.datos.length; i += 4) {
    const d = Math.max(
      Math.abs(a.datos[i] - b.datos[i]),
      Math.abs(a.datos[i + 1] - b.datos[i + 1]),
      Math.abs(a.datos[i + 2] - b.datos[i + 2]),
    );
    if (d) { cambiados++; suma += d; peor = Math.max(peor, d); }
  }
  const n = a.datos.length / 4;
  return { pct: (cambiados / n) * 100, medio: cambiados ? suma / cambiados : 0, peor };
}

console.log(`\n  EL CONTROL: los pasos 0 y 3 son el mismo estado (estilo 1 = 'm', estilo 6 = 'n').`);
console.log(`  vista      px que cambian   medio   peor`);
let controlMal = 0;
for (const v of VISTAS) {
  const a = await tomar(v.hud, v.yaw, 0.0);
  const b = await tomar(v.hud, v.yaw, 0.3);
  const d = diferencia(a, b);
  if (d.pct > 0) controlMal++;
  console.log(`  ${v.nombre.padEnd(10)} ${d.pct.toFixed(2).padStart(8)} %   ${d.medio.toFixed(1).padStart(6)}  ${String(d.peor).padStart(5)}` +
    (d.pct === 0 ? "   (IDÉNTICO, como debe)" : "   <- FALLO"));
}

console.log(`\n  LA MEDIDA: del paso 0 ('m','n') al 225 ('q','q'), el salto más grande del ciclo.`);
console.log(`  vista      px que cambian   medio   peor`);
for (const v of VISTAS) {
  const a = await tomar(v.hud, v.yaw, 0.0);
  const b = await tomar(v.hud, v.yaw, 22.5);
  const d = diferencia(a, b);
  console.log(`  ${v.nombre.padEnd(10)} ${d.pct.toFixed(2).padStart(8)} %   ${d.medio.toFixed(1).padStart(6)}  ${String(d.peor).padStart(5)}`);
  for (const [sufijo, foto] of [["min", a], ["max", b]]) {
    const img = new Uint8Array(foto.datos.length);
    for (let y = 0; y < foto.alto; y++) {
      const s = (foto.alto - 1 - y) * foto.ancho * 4;
      img.set(Uint8Array.from(foto.datos.slice(s, s + foto.ancho * 4)), y * foto.ancho * 4);
    }
    escribirPng(`build/gatecity/vistas/parpadeo-${v.nombre}-${sufijo}.png`, img, foto.ancho, foto.alto);
  }
}

console.log(`\n  y el paso a paso de un segundo en la calle, contra el anterior:`);
let prev = null;
for (let i = 0; i <= 10; i++) {
  const c = await tomar(VISTAS[0].hud, VISTAS[0].yaw, i / 10);
  if (prev) {
    const d = diferencia(prev, c);
    console.log(`    t=${(i / 10).toFixed(1)}  ${d.pct.toFixed(2).padStart(6)} % cambian, medio ${d.medio.toFixed(1)}`);
  }
  prev = c;
}
console.log(`\n  ${await pag.evaluate(() => JSON.stringify(window.probe.dondeLuz(0)))}`);
await nav.close(); matar(dev);
process.exit(controlMal ? 1 : 0);
