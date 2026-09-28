// Los fotogramas del jharro, medidos, y con las vistas CALCULADAS.
//
//   node tools/jharro_shot.mjs          -> build/jharro/vistas/
//   node tools/jharro_shot.mjs --keep   deja servidor y navegador abiertos
//
// Ni una coordenada de cámara escrita a mano. Cada toma se saca del plano: la
// caverna más grande de la planta del pueblo, el pasillo más largo de la cueva,
// la boca de la escalera más honda, el pozo, la celda del portal del fondo. Es
// la misma regla que gobierna la geometría —no inventes, calcula— aplicada a
// dónde se pone la cámara, y sirve para algo concreto: cuando el plano cambie,
// las fotos seguirán apuntando a lo que hay que mirar en vez de a donde había
// algo la semana pasada.
//
// Lo que se mide de cada fotograma, además de guardarlo:
//
//   cobertura   fracción de píxeles que no son el color de la niebla. Bajo
//               tierra esto es más duro que en Corinth: la niebla es casi negra
//               y una toma mirando a un sitio sin farol SE PARECE a una toma
//               rota. Por eso hace falta el control.
//   colores     una pantalla de un solo color es el equivalente visual de un
//               mundo vacío que compila.
//   fachadas    cuánto cambia al apagar la roca: lo que aportan las casas.
//   control     con todo apagado, la pantalla tiene que ser niebla. Sin esta
//               pareja de números, «se ve el jharro» solo dice que se ve algo.

import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { UNITS_PER_M } from "../src/map/geometry.js";
import { CELDA } from "../src/kit/house.js";
import { jharroLevel, centroCelda } from "../src/kit/nivel.js";
import { PLANTAS, cotaMundo } from "../src/kit/jharro.js";
import { BAJO_TIERRA } from "../src/render/scene.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "build", "jharro", "vistas");
const PORT = 5199;
const KEEP = process.argv.includes("--keep");
const OJOS = 1.7; // la altura de los ojos del jugador, en metros

// El color de la niebla bajo tierra, en bytes. Es contra esto contra lo que se
// mide la cobertura, así que tiene que ser EL mismo que usa la escena y no una
// copia: un fondo copiado que se desincroniza da coberturas que no significan
// nada y que además parecen razonables.
const FONDO = [
  (BAJO_TIERRA.niebla >> 16) & 255,
  (BAJO_TIERRA.niebla >> 8) & 255,
  BAJO_TIERRA.niebla & 255,
];

const level = jharroLevel();
const { plan, juego, ciudad, luz } = level;

/** El tramo más grande de un tipo, en la planta que se diga (o en cualquiera). */
function tramoMayor(tipo, planta = null) {
  let mejor = null;
  for (const pl of plan.plantas) {
    if (planta !== null && pl.indice !== planta) continue;
    for (const t of pl.tramos) {
      if (t.tipo !== tipo) continue;
      if (!mejor || t.celdas.length > mejor.t.celdas.length) mejor = { pl, t };
    }
  }
  return mejor;
}

/** El centro de un tramo, en metros. */
function centroTramo({ pl, t }) {
  const sx = t.celdas.reduce((a, c) => a + c[0], 0) / t.celdas.length;
  const sz = t.celdas.reduce((a, c) => a + c[1], 0) / t.celdas.length;
  return [sx * CELDA + CELDA / 2, cotaMundo(pl.indice), -sz * CELDA - CELDA / 2];
}

/** La celda de un tramo más lejos de su centro: desde ahí se ve el tramo entero. */
function esquinaTramo({ pl, t }) {
  const c = centroTramo({ pl, t });
  let mejor = null;
  for (const [x, z] of t.celdas) {
    const p = centroCelda(pl.indice, x, z);
    const d = Math.hypot(p[0] - c[0], p[2] - c[2]);
    if (!mejor || d > mejor.d) mejor = { p, d };
  }
  return mejor.p;
}

// --- las vistas, todas derivadas ---------------------------------------------

const VISTAS = [];

// 1. La llegada: donde acaba el socavón de Corinth, mirando a donde se puede ir.
{
  const [x, y, z] = level.start;
  const yaw = level.startYaw;
  VISTAS.push({
    nombre: "llegada",
    desde: [x, y + OJOS, z],
    // El punto al que se mira sale del propio rumbo de llegada, invirtiendo la
    // fórmula de `player.js`: con yaw 0 se mira hacia −Z.
    hacia: [x - Math.sin(yaw) * 12, y + OJOS - 0.6, z - Math.cos(yaw) * 12],
    fov: 75,
  });
}

// 2. La caverna mayor de la planta principal: es el 16 % medido de altura libre,
//    o sea la mitad del contraste que hace legible una cueva.
{
  const grande = tramoMayor("boveda", 3) ?? tramoMayor("boveda");
  if (grande) {
    const desde = esquinaTramo(grande);
    const hacia = centroTramo(grande);
    VISTAS.push({
      nombre: "caverna",
      desde: [desde[0], desde[1] + OJOS, desde[2]],
      hacia: [hacia[0], hacia[1] + 2.5, hacia[2]],
      fov: 75,
    });
    // Y la misma en picado, que es donde se vería un agujero en la bóveda.
    VISTAS.push({
      nombre: "caverna-en-picado",
      desde: [hacia[0], hacia[1] + 7.5, hacia[2] + 8],
      hacia: [hacia[0], hacia[1], hacia[2]],
      fov: 65,
    });
  }
}

// 3. El pasillo más largo de la cueva, mirando a lo largo. Es el 55 % medido por
//    debajo de tres metros: el sitio que más hay en un jharro.
{
  const largo = tramoMayor("pasillo");
  if (largo) {
    const celdas = largo.t.celdas;
    const a = centroCelda(largo.pl.indice, ...celdas[0]);
    const b = centroCelda(largo.pl.indice, ...celdas[celdas.length - 1]);
    VISTAS.push({
      nombre: "pasillo",
      desde: [a[0], a[1] + OJOS, a[2]],
      hacia: [b[0], b[1] + OJOS - 0.2, b[2]],
      fov: 75,
    });
  }
}

// 4. Las fachadas: la celda del pueblo con más casas alrededor. Es lo que la
//    parte 3 tenía que resolver —casas pegadas a la cueva, no exentas— y lo
//    único que se ve de ellas es una pared con su puerta.
{
  const cuenta = new Map();
  for (const f of ciudad.fachadas) {
    const k = `${f.planta},${f.x},${f.z}`;
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
  }
  // Por vecindad: la celda desde la que se ven más fachadas a la vez.
  let mejor = null;
  for (const f of ciudad.fachadas) {
    let n = 0;
    for (const g of ciudad.fachadas) {
      if (g.planta !== f.planta) continue;
      if (Math.abs(g.x - f.x) <= 2 && Math.abs(g.z - f.z) <= 2) n++;
    }
    if (!mejor || n > mejor.n) mejor = { f, n };
  }
  if (mejor) {
    const f = mejor.f;
    const pie = centroCelda(f.planta, f.x, f.z);
    const casa = centroCelda(f.planta, f.hueco[0], f.hueco[1]);
    VISTAS.push({
      nombre: "fachadas",
      // Retrocediendo dos celdas desde la casa, por el eje de la puerta.
      desde: [
        pie[0] - (casa[0] - pie[0]) * 1.6,
        pie[1] + OJOS,
        pie[2] - (casa[2] - pie[2]) * 1.6,
      ],
      hacia: [casa[0], casa[1] + 1.4, casa[2]],
      fov: 75,
    });
  }
}

// 5. La boca de la escalera más honda y el pozo: las conexiones verticales, que
//    es lo único de verdad nuevo del experimento y lo que no se ve en un plano.
for (const tipo of ["escalera", "pozo"]) {
  const e = plan.enlaces.filter((q) => q.tipo === tipo).sort((a, b) => b.salto - a.salto)[0];
  if (!e) continue;
  const arriba = centroCelda(e.arriba.planta, ...e.arriba.celda);
  const abajo = centroCelda(e.abajo.planta, ...e.abajo.celda);
  VISTAS.push({
    nombre: tipo === "pozo" ? "pozo" : "escalera",
    desde: [
      arriba[0] - e.dir[0] * CELDA * 0.8,
      arriba[1] + OJOS,
      arriba[2] + e.dir[1] * CELDA * 0.8,
    ],
    hacia: [abajo[0], abajo[1] + 1.0, abajo[2]],
    fov: 75,
  });
}

// 6. El fondo: la celda del portal, a 248 m de la entrada y en la planta más
//    honda. Es donde el lore de Corinth pone los portales de los invasores.
{
  const portal = juego.transiciones.find((t) => t.destino === null);
  if (portal) {
    const p = centroCelda(portal.planta, portal.x, portal.z);
    VISTAS.push({
      nombre: "fondo",
      desde: [p[0] + 5, p[1] + OJOS, p[2] + 5],
      hacia: [p[0], p[1] + 1.2, p[2]],
      fov: 75,
    });
  }
}

// 7. La frontera: una celda de cueva pegada al pueblo, que es la zona de
//    principiantes. Mirando HACIA el pueblo, porque lo que tiene que contar la
//    toma es el contraste de luz entre los dos lados.
{
  const borde = juego.principiantes.filter((c) => c.deLaFrontera === 1);
  const conLuz = borde.find((c) =>
    luz.luces.some((l) => l.planta === c.planta && Math.abs(l.x - c.x) + Math.abs(l.z - c.z) <= 3)
  ) ?? borde[0];
  if (conLuz) {
    const p = centroCelda(conLuz.planta, conLuz.x, conLuz.z);
    // Hacia el farol más cercano del pueblo: ahí es donde está la frontera.
    const faro = luz.luces
      .filter((l) => l.zona === "pueblo" && l.planta === conLuz.planta)
      .sort((a, b) => Math.hypot(a.pos[0] - p[0], a.pos[2] - p[2]) - Math.hypot(b.pos[0] - p[0], b.pos[2] - p[2]))[0];
    if (faro) {
      VISTAS.push({
        nombre: "frontera",
        desde: [p[0], p[1] + OJOS, p[2]],
        hacia: [faro.pos[0], faro.pos[1], faro.pos[2]],
        fov: 75,
      });
    }
  }
}

/**
 * De un punto de vista en metros a lo que pide `probe.fly`.
 *
 * El yaw sale de invertir la fórmula de `player.js` —con yaw 0 se mira hacia −Z
 * y el avance es (−sen, −cos)—, no de probar signos hasta que cuadre.
 */
function vista(desde, hacia) {
  const d = [hacia[0] - desde[0], hacia[1] - desde[1], hacia[2] - desde[2]];
  const plano = Math.hypot(d[0], d[2]);
  return {
    ojo: [desde[0] * UNITS_PER_M, -desde[2] * UNITS_PER_M, desde[1] * UNITS_PER_M],
    yaw: Math.atan2(-d[0], -d[2]),
    pitch: Math.atan2(d[1], plano),
  };
}

function arrancaServidor() {
  const proc = spawn(
    process.execPath,
    [join(ROOT, "node_modules", "vite", "bin", "vite.js"), "--port", String(PORT), "--strictPort"],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] }
  );
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("vite no arrancó")), 30000);
    proc.stdout.on("data", (d) => {
      if (d.toString().includes("ready in")) { clearTimeout(timer); resolve(proc); }
    });
    proc.on("error", reject);
  });
}

const server = await arrancaServidor();
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: !KEEP,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
const errores = [];
page.on("pageerror", (e) => errores.push(String(e?.message ?? e)));

await page.goto(`http://localhost:${PORT}/?map=jharro`, { waitUntil: "load" });
await page.waitForFunction(() => window.probe?.ready === true, null, { timeout: 180000 });
await page.evaluate(() => window.probe.pause());
const texto = await page.evaluate(() => document.getElementById("status").textContent);

/** Dibuja y mide en la MISMA tarea: separarlo devuelve negro, no el fondo. */
async function medir(v) {
  return page.evaluate(
    ({ bg, ojo, yaw, pitch }) => {
      const canvas = document.getElementById("view");
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      const w = canvas.width, h = canvas.height;
      const leer = () => {
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return px;
      };
      window.probe.fly(ojo, yaw, pitch);
      const con = leer();
      // Con la roca apagada: lo que queda son las fachadas del kit.
      window.probe.setGenerada(false);
      window.probe.fly(ojo, yaw, pitch);
      const sinRoca = leer();
      window.probe.setGenerada(true);
      window.probe.fly(ojo, yaw, pitch);

      const colores = new Set();
      let on = 0;
      let cambian = 0;
      // La LUMINANCIA, que es lo único que significa algo bajo tierra.
      //
      // La cobertura cuenta píxeles que no son del color de la niebla, y arriba
      // eso vale porque la niebla es lila. Aquí la niebla es casi negra y la roca
      // sin farol también, así que un pasillo a oscuras marca el 96 % de
      // cobertura siendo una pantalla NEGRA. La primera tanda de fotogramas dio
      // exactamente eso, y la cifra decía que se veía perfectamente.
      const luces = [];
      let visible = 0;
      for (let i = 0; i < con.length; i += 4) {
        const d = Math.abs(con[i] - bg[0]) + Math.abs(con[i + 1] - bg[1]) + Math.abs(con[i + 2] - bg[2]);
        if (d > 24) { on++; colores.add((con[i] << 16) | (con[i + 1] << 8) | con[i + 2]); }
        const k = Math.abs(con[i] - sinRoca[i]) + Math.abs(con[i + 1] - sinRoca[i + 1]) +
          Math.abs(con[i + 2] - sinRoca[i + 2]);
        if (k > 24) cambian++;
        const l = 0.2126 * con[i] + 0.7152 * con[i + 1] + 0.0722 * con[i + 2];
        luces.push(l);
        // 32 de 255: por debajo de eso, en una pantalla normal, no se distingue
        // una pared de un agujero.
        if (l > 32) visible++;
      }
      luces.sort((a, b) => a - b);
      return {
        cobertura: on / (w * h),
        colores: colores.size,
        ocupaRoca: cambian / (w * h),
        visible: visible / (w * h),
        brilloMediano: luces[Math.floor(luces.length / 2)],
        brilloP90: luces[Math.floor(luces.length * 0.9)],
      };
    },
    { bg: FONDO, ...vista(v.desde, v.hacia) }
  );
}

console.log(`\n${texto}\n`);
const fichas = [];
for (const v of VISTAS) {
  const m = await medir(v);
  await page.screenshot({ path: join(OUT, `${v.nombre}.png`) });
  fichas.push({ vista: v.nombre, ...m });
  console.log(
    `  ${v.nombre.padEnd(20)} se VE ${(m.visible * 100).toFixed(1).padStart(5)} %  ` +
      `brillo mediano ${String(Math.round(m.brilloMediano)).padStart(3)}  ` +
      `cobertura ${(m.cobertura * 100).toFixed(1).padStart(5)} %  ` +
      `${String(m.colores).padStart(5)} colores`
  );
}

// El control: con todo apagado, la pantalla tiene que ser niebla. Sin esta
// pareja de números, «se ve el jharro» solo dice que se ve algo — y bajo tierra,
// donde la niebla es casi negra, eso es peligrosamente fácil de creerse.
await page.evaluate(() => {
  window.probe.setKit(false);
  window.probe.setMapa(false);
  window.probe.setFondo(false);
});
const vacio = await medir(VISTAS[0]);
await page.screenshot({ path: join(OUT, "control-vacio.png") });

writeFileSync(join(OUT, "fichas.json"), JSON.stringify({ fichas, vacio, errores }, null, 2));

console.log(`\n  control (todo apagado)  cobertura ${(vacio.cobertura * 100).toFixed(2)} %`);
if (errores.length) console.log(`  errores de consola: ${errores.join(" | ")}`);

await browser.close();
if (!KEEP) server.kill();

// Lo que juzga una toma bajo tierra es cuánto se VE, no cuánta geometría hay.
const flojas = fichas.filter((f) => f.visible < 0.25);
const planas = fichas.filter((f) => f.colores < 24);
console.log();
if (vacio.cobertura > 0.02) {
  console.log(`FALLO DE LA SONDA: con todo apagado se ve el ${(vacio.cobertura * 100).toFixed(1)} %`);
  process.exit(1);
}
if (errores.length) {
  console.log(`FALLO: la consola del navegador escupió ${errores.length} errores`);
  process.exit(1);
}
if (flojas.length) {
  console.log(
    `MIRAR: ${flojas.length} vistas donde se ve menos del 25 % de la pantalla — ` +
      flojas.map((f) => `${f.vista} ${(f.visible * 100).toFixed(1)} %`).join(", ")
  );
}
if (planas.length) {
  console.log(`MIRAR: ${planas.length} vistas con menos de 24 colores: ` + planas.map((f) => f.vista).join(", "));
}
console.log(`${fichas.length} fotogramas en build/jharro/vistas/ — y ahora hay que MIRARLOS.\n`);
