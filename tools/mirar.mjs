// Una captura desde DONDE YO DIGA, que es lo que faltaba para contestar a una
// captura de quien lo anda.
//
//   node tools/mirar.mjs --pos "738 -575 81" --yaw 180 --nombre calle
//   node tools/mirar.mjs --pos "..." --yaw 180 --singlow --sinadornos --plenaluz
//
// `--pos` son los tres numeros que el HUD del visor imprime, tal cual. El HUD
// escribe `player.feet` en ejes de Three.js y unidades de GoldSrc, o sea
// [x, z, -y] del `.bsp`; aqui se deshace el cambio y se suben los ojos 1,7 m,
// porque poner la camara en la coordenada del HUD la pone a ras de suelo.
//
// Sale el fotograma CRUDO —leido del framebuffer, sin el HUD encima— porque medir
// sobre una captura de pantalla ya dio una vez «el punto mas claro del mapa vale
// 72» midiendo la esquina de la caja de controles.

import { spawn } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { UNIDADES_POR_METRO } from "../src/bsp/lector.js";
import { escribirPng } from "./png.mjs";
import { mapaDeArgv } from "./mapa.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// EL 87: y de CUALQUIER mapa, no sólo de Gate City. Estaba clavado en tres
// sitios —la comprobación del horneado, la carpeta de salida y la URL—, así que
// pedir una vista de Edana daba una de Gate City sin un solo error: el valor de
// reposo, en una herramienta. Usa la opción común `--mapa`, la misma del resto
// de `tools/`.
const MAPA = mapaDeArgv();
const OUT = join(ROOT, "build", MAPA, "vistas");
const PORT = 5199;
const U = UNIDADES_POR_METRO;
const OJOS = 1.7 * U;

const arg = (n, d = null) => {
  const i = process.argv.indexOf(n);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const tiene = (n) => process.argv.includes(n);

const hud = (arg("--pos") ?? "0 0 0").trim().split(/[\s,]+/).map(Number);
if (hud.length !== 3 || hud.some(Number.isNaN)) {
  console.error('--pos "x y z" con los tres numeros del HUD');
  process.exit(2);
}
// del HUD [x, z, -y] al .bsp [x, y, z], y los ojos arriba
const ojo = [hud[0], -hud[2], hud[1] + OJOS];
// `--yaw` admite una lista —`0,45,90`— o `barrer`, que son los ocho rumbos. El
// HUD no imprime el rumbo, asi que reproducir una captura de quien lo anda pasa
// por barrerlos y mirar cual es.
const yaws = (arg("--yaw", "180") === "barrer"
  ? [0, 45, 90, 135, 180, 225, 270, 315]
  : String(arg("--yaw", "180")).split(",").map(Number)
).map((g) => ({ grados: g, rad: (g * Math.PI) / 180 }));
const pitch = (Number(arg("--pitch", "0")) * Math.PI) / 180;
const nombre = arg("--nombre", "mirar");
const ancho = Number(arg("--ancho", "960"));
const alto = Number(arg("--alto", "640"));

if (!existsSync(join(ROOT, "build", MAPA, "malla.json"))) {
  console.error(`falta build/${MAPA}/malla.json — hornéalo primero`);
  process.exit(2);
}

function arrancaServidor() {
  const proc = spawn(
    process.execPath,
    [join(ROOT, "node_modules", "vite", "bin", "vite.js"), "--port", String(PORT), "--strictPort"],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] }
  );
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("vite no arranco")), 30000);
    proc.stdout.on("data", (d) => {
      if (d.toString().includes("ready in")) { clearTimeout(timer); resolve(proc); }
    });
    proc.on("error", reject);
  });
}

const server = await arrancaServidor();
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: ancho, height: alto } });
const errores = [];
page.on("pageerror", (e) => errores.push(String(e?.message ?? e)));
await page.goto(`http://localhost:${PORT}/?map=${MAPA}`, { waitUntil: "load" });
await page.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
await page.evaluate(() => window.probe.pause());

await page.evaluate(
  ({ sinGlow, sinAdornos, sinCarteles, plenaLuz, sinLuz, sinTex, sinMundo, rosa, sinDetalle, sinBichos, avanzar, overbright, reloj }) => {
    const p = window.probe;
    if (sinGlow) p.setGlow(false);
    if (sinAdornos) p.setAdornos(false);
    if (sinCarteles) p.setCarteles(false);
    if (plenaLuz) p.setPlenaLuz(true);
    if (sinLuz) p.setLuz(false);
    if (sinTex) p.setTexturas(false);
    if (sinMundo) p.setMapa(false);
    if (rosa) p.setSinLuzEnRosa(true);
    if (overbright) p.setOverbright(overbright);
    if (sinDetalle) p.setDetalle(false);
    if (avanzar) p.avanzarBichos(avanzar);
    // El instante del PARPADEO. El bucle esta parado, asi que sin esto la
    // captura sale siempre en el estado del segundo cero.
    if (reloj && p.setReloj) p.setReloj(reloj);
    if (sinBichos) p.setBichos(false);
  },
  {
    sinGlow: tiene("--singlow"), sinAdornos: tiene("--sinadornos"),
    sinCarteles: tiene("--sincarteles"), plenaLuz: tiene("--plenaluz"),
    sinLuz: tiene("--sinluz"), sinTex: tiene("--sintex"), sinMundo: tiene("--sinmundo"),
    rosa: tiene("--rosa"), sinDetalle: tiene("--sindetalle"), sinBichos: tiene("--sinbichos"), avanzar: Number(arg("--avanzar", "0")), overbright: Number(arg("--overbright", "0")),
    reloj: Number(arg("--t", "0")),
  }
);

console.log(`ojo ${ojo.map((v) => Math.round(v)).join(" ")} (unidades del .bsp), pitch ${pitch ? arg("--pitch") : 0}`);
for (const { grados, rad } of yaws) {
  const crudo = await page.evaluate(
    ({ ojo, yaw, pitch }) => {
      window.probe.fly(ojo, yaw, pitch);
      const c = document.getElementById("view");
      const gl = c.getContext("webgl2") ?? c.getContext("webgl");
      const px = new Uint8Array(c.width * c.height * 4);
      gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return { datos: Array.from(px), ancho: c.width, alto: c.height };
    },
    { ojo, yaw: rad, pitch }
  );
  const vuelta = new Uint8Array(crudo.datos.length);
  for (let y = 0; y < crudo.alto; y++) {
    const src = (crudo.alto - 1 - y) * crudo.ancho * 4;
    vuelta.set(crudo.datos.slice(src, src + crudo.ancho * 4), y * crudo.ancho * 4);
  }
  const sufijo = yaws.length > 1 ? `-${grados}` : "";
  const ruta = join(OUT, `${nombre}${sufijo}.png`);
  escribirPng(ruta, vuelta, crudo.ancho, crudo.alto);

  // Y las cifras, para no tener que mirar la imagen para saber si esta vacia.
  const luces = [];
  let negro = 0;
  for (let i = 0; i < vuelta.length; i += 4) {
    const l = 0.2126 * vuelta[i] + 0.7152 * vuelta[i + 1] + 0.0722 * vuelta[i + 2];
    luces.push(l);
    if (l < 4) negro++;
  }
  luces.sort((a, b) => a - b);
  const n = luces.length;
  console.log(
    `  yaw ${String(grados).padStart(4)}  p10 ${luces[(n * 0.1) | 0].toFixed(1).padStart(5)}  ` +
    `mediana ${luces[(n / 2) | 0].toFixed(1).padStart(5)}  p90 ${luces[(n * 0.9) | 0].toFixed(1).padStart(5)}  ` +
    `negro ${((negro / n) * 100).toFixed(1).padStart(5)} %   ${ruta.slice(ROOT.length + 1)}`
  );
}
if (errores.length) console.log("  errores:", errores.slice(0, 5).join(" | "));

await browser.close();
server.kill();
