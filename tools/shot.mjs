// Fotogramas, que es lo que falta para poder mirar.
//
// Las dos peores cosas del experimento 02 -una plaza que parecia un pozo y una
// puerta invisible- pasaban todas las comprobaciones. Y la primera vez que se
// abrio esta sonda en un navegador, con 55 comprobaciones en verde, la pantalla
// estaba tapada por el velo de entrada. Asi que un PNG no es un recuerdo: es
// una comprobacion mas, y por eso cada captura se mide ademas de guardarse.
//
//   node tools/shot.mjs            saca las capturas y da el veredicto
//   node tools/shot.mjs --keep     ademas deja el servidor y el navegador
//
// Lo que mide de cada fotograma:
//   cobertura   fraccion de pixeles que no son el color de la niebla; una
//               captura casi toda niebla es una camara mirando al vacio
//   colores     numero de colores distintos; una pantalla de un solo color es
//               el equivalente visual de un mundo vacio que compila
//   velo        si algun elemento del HTML tapa el canvas, que es justo el
//               fallo que ninguna de las 55 comprobaciones vio

import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "build", "shots", process.argv[2]?.startsWith("--") ? "pueblo" : (process.argv[2] ?? "pueblo"));
const PORT = 5199;
const KEEP = process.argv.includes("--keep");

// Cada toma: nombre, posicion de los pies en unidades de Quake, y adonde mira.
// Las posiciones salen de plaza.meta.json, no de tantear: 800,608 es donde
// aparece el jugador y 1312,992 es la muestra de la otra zona.
const MAP = process.argv.find((a) => !a.startsWith("--") && a !== process.argv[0] && a !== process.argv[1]) ?? "pueblo";

const SHOTS = {
  plaza: [
    { name: "aparicion", feet: [800, 608, 0], yaw: 0, pitch: 0 },
    { name: "aparicion-atras", feet: [800, 608, 0], yaw: Math.PI, pitch: 0 },
    { name: "aparicion-arriba", feet: [800, 608, 0], yaw: 0, pitch: 0.9 },
    { name: "aparicion-abajo", feet: [800, 608, 0], yaw: 0, pitch: -0.9 },
    { name: "zona2", feet: [1312, 992, 0], yaw: Math.PI / 2, pitch: 0 },
    { name: "puerta", feet: [544, 736, 0], yaw: Math.PI, pitch: -0.3 },
  ],
  // Las posiciones salen del plano de tools/village.mjs, no de tantear: la
  // celda 12,18 es donde esta el '@', y 12,10 el centro de la plaza.
  pueblo: [
    // Todas miran calle arriba o a una fachada a distancia de verla. Las
    // primeras que puse tenian la nariz contra una pared: la captura salia
    // 96 % cubierta y con doce mil colores, o sea aprobando todas las medidas,
    // y no ensenaba nada. Una medida buena no hace buena una toma.
    { name: "calle-sur", feet: [1600, 448, 0], yaw: 0, pitch: 0.05 },
    { name: "plaza", feet: [1600, 1216, 0], yaw: 0, pitch: 0.05 },
    { name: "pozo", feet: [1632, 1088, 0], yaw: 0, pitch: 0.14 },
    { name: "porton", feet: [1600, 512, 0], yaw: Math.PI, pitch: 0.1 },
    // Una fachada de frente, para ver si la puerta y las ventanas se leen.
    { name: "fachada", feet: [1216, 1856, 0], yaw: Math.PI / 2, pitch: 0.18 },
    { name: "casas-oeste", feet: [1216, 1984, 0], yaw: Math.PI / 2, pitch: 0.12 },
    { name: "muralla-norte", feet: [1600, 2496, 0], yaw: 0, pitch: 0.25 },
    // Un arbol del pueblo de cerca. Es lo unico que junta dos piezas que no se
    // hablan: el tronco macizo sale del .map y el follaje es un cartel del
    // lado del render. Si no coinciden, queda un poste negro.
    { name: "arbol", feet: [832, 2240, 0], yaw: 0, pitch: 0.25 },
    { name: "cielo", feet: [1600, 1472, 0], yaw: Math.PI, pitch: 0.75 },
    // Vistas de camara suelta, sin jugador. La aerea es la forma barata de ver
    // si una casa esta donde dice el plano: desde dentro un error de
    // colocacion se ve como una pared, y una pared es lo que uno espera.
    { name: "aerea", fly: [1664, 1408, 4600], yaw: 0, pitch: -Math.PI / 2 + 0.001 },
    { name: "oblicua", fly: [1664, -1400, 2000], yaw: 0, pitch: -0.5 },
  ],
  // El mismo plano con el suelo en rampas, y por tanto las MISMAS tomas: si
  // fueran otras, comparar las dos carpetas de capturas no diria nada sobre el
  // relieve, diria que se han elegido puntos de vista distintos.
  get "pueblo-rampas"() {
    return this.pueblo;
  },
  // El valle de malla. Aqui las alturas no se escriben: la z en null quiere
  // decir "preguntale al terreno", y se resuelve dentro de la pagina con el
  // mismo campo de alturas que genero la malla. Escribirlas a mano seria
  // escribir coordenadas a mano, que es lo que este proyecto no hace.
  colina: [
    { name: "valle", feet: [4608, 4608, null], yaw: 0, pitch: 0.06 },
    { name: "camino", feet: [4608, 4608, null], yaw: Math.PI, pitch: 0.04 },
    { name: "ladera", feet: [3200, 6400, null], yaw: -0.9, pitch: 0.02 },
    { name: "montanas", feet: [4608, 7800, null], yaw: 0, pitch: 0.2 },
    { name: "cuesta-abajo", feet: [6400, 3200, null], yaw: 2.2, pitch: -0.15 },
    { name: "arboles", feet: [5200, 5200, null], yaw: 1.2, pitch: 0.1 },
    { name: "aerea", fly: [4608, 4608, 9000], yaw: 0, pitch: -Math.PI / 2 + 0.001 },
    { name: "oblicua", fly: [4608, 400, 3400], yaw: 0, pitch: -0.28 },
  ],
}[MAP] ?? [];

if (!SHOTS.length) {
  console.error(`no hay tomas definidas para '${MAP}'`);
  process.exit(2);
}

function startServer() {
  // Se arranca el vite.js con el mismo node, no el .cmd de npx: en Windows
  // spawn de un .cmd sin shell da EINVAL, y con shell habria que citar rutas
  // con espacios, que este proyecto tiene.
  const proc = spawn(
    process.execPath,
    [join(ROOT, "node_modules", "vite", "bin", "vite.js"), "--port", String(PORT), "--strictPort"],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] }
  );
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("vite no arranco")), 30000);
    proc.stdout.on("data", (d) => {
      if (d.toString().includes("ready in")) {
        clearTimeout(timer);
        resolve(proc);
      }
    });
    proc.on("error", reject);
  });
}

const server = await startServer();
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: !KEEP,
  // WebGL en headless necesita que se le diga que use el render por software.
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

await page.goto(`http://localhost:${PORT}/?map=${MAP}`, { waitUntil: "load" });
await page.waitForFunction(() => window.probe?.ready === true, null, { timeout: 30000 });
// El bucle de render se para durante las tomas: si no, cada captura acaba
// mostrando lo que ve el jugador y no lo que se le pidio a la camara.
await page.evaluate(() => window.probe.pause());

// El velo de entrada. Es el fallo que 55 comprobaciones en verde no vieron:
// se comprueba lo que el usuario ve, no lo que el atributo hidden dice.
const veil = await page.evaluate(() => {
  const canvas = document.getElementById("view");
  const r = canvas.getBoundingClientRect();
  const mid = document.elementFromPoint(r.width / 2, r.height / 2);
  const intro = document.getElementById("intro");
  return {
    onTop: mid?.id ?? null,
    introVisible: intro.getBoundingClientRect().height > 0 &&
      getComputedStyle(intro).display !== "none",
    hudVisible: !document.getElementById("hud").hidden,
    canvas: [canvas.width, canvas.height],
  };
});

const FOG = [0x8d, 0x8d, 0xb6];

/** Mide un fotograma leyendo el canvas, no la pagina entera. */
async function measure() {
  return page.evaluate((fog) => {
    const canvas = document.getElementById("view");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    const w = canvas.width, h = canvas.height;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const colours = new Set();
    let offFog = 0;
    for (let i = 0; i < px.length; i += 4) {
      colours.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
      const d =
        Math.abs(px[i] - fog[0]) + Math.abs(px[i + 1] - fog[1]) + Math.abs(px[i + 2] - fog[2]);
      if (d > 24) offFog++;
    }
    return { colours: colours.size, coverage: offFog / (w * h), pixels: w * h };
  }, FOG);
}

const results = [];
for (const shot of SHOTS) {
  const placed = await page.evaluate(
    ({ feet, fly, yaw, pitch }) => {
      if (fly) {
        window.probe.fly(fly, yaw, pitch);
        // Una vista de camara suelta no tiene jugador, asi que no se le puede
        // exigir que toque suelo. Se marca para que el veredicto no la juzgue
        // por una regla que no le toca.
        return { grounded: true, flown: true };
      }
      // z en null: la altura la da el propio nivel. Solo el valle de malla la
      // usa, y es lo que evita tener que escribir a mano la cota de un terreno
      // que calcula el ruido.
      const at = feet[2] === null
        ? [feet[0], feet[1], window.probe.level.heightAt(feet[0], feet[1]) + 8]
        : feet;
      const r = window.probe.place(at, yaw, pitch);
      window.probe.draw();
      return r;
    },
    shot
  );
  const m = await measure();
  await page.screenshot({ path: join(OUT, `${shot.name}.png`) });
  // placed.feet viene en metros y shot.feet en unidades: no se mezclan.
  results.push({ ...shot, ...m, grounded: placed.grounded, landed: placed.feet });
}

// Una toma andando, para que la captura pruebe que el jugador se mueve de
// verdad y no solo que la camara se puede teletransportar.
const walked = await page.evaluate(async () => {
  // Desde el info_player_start del propio mapa, no desde una coordenada
  // escrita a mano: una coordenada de otro mapa cae dentro de una casa y el
  // fallo que se ve es «no anda», que no es el fallo que hay.
  window.probe.restart();
  const before = window.probe.player.feet.slice();
  window.probe.resume();
  window.probe.keys.add("KeyW");
  await new Promise((r) => setTimeout(r, 1200));
  window.probe.keys.delete("KeyW");
  // Unos cuantos pasos mas, quieto. Sin esto se lee el estado de un solo
  // fotograma, y 'grounded' parpadea al cruzar la junta entre dos brushes de
  // suelo: eso es un parpadeo, no una caida, y confundirlos hace que el
  // veredicto falle por algo que no pasa.
  await new Promise((r) => setTimeout(r, 300));
  window.probe.pause();
  const after = window.probe.player.feet;
  window.probe.draw();
  return {
    metres: Math.hypot(after[0] - before[0], after[2] - before[2]),
    grounded: window.probe.player.grounded,
    // La altura final en unidades: distingue «parpadeo en una junta» de
    // «se cayo del mapa», que la bandera sola no distingue.
    heightUnits: after[1] * 32,
  };
});
const walkFrame = await measure();
await page.screenshot({ path: join(OUT, "andando.png") });

if (!KEEP) {
  await browser.close();
  server.kill();
}

// --- veredicto -----------------------------------------------------------

console.log(`\nCapturas en build/shots/  (canvas ${veil.canvas.join("x")})\n`);
for (const r of results) {
  console.log(
    `  ${r.name.padEnd(18)} cobertura ${(r.coverage * 100).toFixed(1).padStart(5)}%` +
      `   colores ${String(r.colours).padStart(5)}` +
      `   ${r.grounded ? "suelo" : "AIRE "}`
  );
}
console.log(
  `  ${"andando".padEnd(18)} cobertura ${(walkFrame.coverage * 100).toFixed(1).padStart(5)}%` +
    `   colores ${String(walkFrame.colours).padStart(5)}   ${walked.metres.toFixed(2)} m`
);

const problems = [];
if (errors.length) problems.push(`la pagina dio errores: ${errors.slice(0, 3).join(" | ")}`);
if (veil.introVisible) {
  problems.push("el velo de entrada sigue tapando el canvas");
}
if (veil.onTop !== "view") {
  problems.push(`en el centro de la pantalla hay '${veil.onTop}', no el canvas`);
}
if (!veil.hudVisible) problems.push("el HUD no llego a mostrarse");

for (const r of [...results, { name: "andando", ...walkFrame }]) {
  // Una sola comprobacion no vale para todas las tomas: mirando al techo se ve
  // poco a proposito. Lo que no puede pasar es que no se vea nada en ninguna.
  if (r.colours < 8) {
    problems.push(`${r.name}: solo ${r.colours} colores, la pantalla esta plana`);
  }
}
for (const r of results) {
  // Una toma desde un sitio donde el jugador no puede estarse quieto retrata
  // un lugar que no existe. Da igual lo bonita que salga.
  if (!r.grounded) {
    problems.push(`${r.name}: el jugador no toca suelo en ${r.feet?.join(",") ?? "?"}`);
  }
}
const best = Math.max(...results.map((r) => r.coverage));
if (best < 0.5) {
  problems.push(
    `ninguna toma pasa del ${(best * 100).toFixed(0)}% de cobertura: se ve niebla, no geometria`
  );
}
if (walked.metres < 1.0) {
  problems.push(`andando 1,2 s solo avanzo ${walked.metres.toFixed(2)} m en el navegador`);
}
if (!walked.grounded) problems.push("el jugador acabo en el aire tras andar");

console.log();
if (problems.length) {
  for (const p of problems) console.log("FALLO:", p);
  process.exit(1);
}
console.log(
  `Se ve: ${results.length + 1} fotogramas, hasta ${(best * 100).toFixed(0)}% de ` +
    `geometria en pantalla, y el jugador anduvo ${walked.metres.toFixed(2)} m en el navegador.\n`
);
