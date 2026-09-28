// La ficha de cada pieza del kit: cuatro angulos renderizados y medidos.
//
//   node tools/piece.mjs                   todas las piezas de public/kit/
//   node tools/piece.mjs plaster_wall      una sola
//   node tools/piece.mjs --keep            deja servidor y navegador abiertos
//
// Por que existe: el kit se decidio con numeros leidos del .glb, pero un numero
// correcto no impide que una pieza se vea mal. Lo que aqui se comprueba de cada
// pieza, y ninguna de estas cosas la ve un `ls`:
//
//   se ve             que la silueta ocupe pixeles de verdad, con la rejilla y
//                     la vara humana apagadas: una pieza que no carga deja una
//                     foto perfecta del estudio vacio
//   caja              que la caja que mide Three.js coincida con la que leyo
//                     kit.mjs del binario. Son DOS lectores independientes del
//                     mismo archivo; que coincidan es lo que hace creible a los
//                     dos, y la regla del proyecto dice que a un medidor no se
//                     le cree hasta contrastarlo
//   textura           que cada malla tenga mapa. Una pieza gris carga sin error
//   filtro            NEAREST. Si sale LINEAR el kit deja de verse PS1
//   alfa              MASK y no BLEND, que es lo que hizo el importador
//   suelo             que la pieza apoye en y = 0, porque asi se coloca por
//                     celdas sin correccion
//
// Las capturas van a build/kit/<pieza>/ y se miran. Las cifras deciden.

import { spawn } from "node:child_process";
import { mkdirSync, rmSync, readdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { readGlb, measure } from "./kit.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KIT = join(ROOT, "public", "kit");
const OUT = join(ROOT, "build", "kit");
const PORT = 5198;
const KEEP = process.argv.includes("--keep");
const only = process.argv.slice(2).find((a) => !a.startsWith("--"));

// Los cuatro angulos. Frente y lado leen las fachadas; tres cuartos es la unica
// que ensena volumen; cenital es la que descubre que una pieza no es una pieza
// sino una cascara abierta por arriba, que es exactamente lo que son los muros
// de este kit y conviene ver, no suponer.
const VISTAS = [
  { name: "frente", yaw: 0, pitch: 8 },
  { name: "lado", yaw: 90, pitch: 8 },
  { name: "tres-cuartos", yaw: 35, pitch: 22 },
  { name: "cenital", yaw: 0, pitch: 80 },
];

// El manifiesto que dejo el importador. Sin el no se sabe que regla le toca a
// cada pieza, y aplicarlas todas a todas produce fallos que no son fallos.
let TIPOS = new Map();
try {
  const m = JSON.parse(readFileSync(join(KIT, "kit.json"), "utf8"));
  TIPOS = new Map(m.piezas.map((p) => [p.nombre, p.tipo]));
} catch {
  console.error("falta public/kit/kit.json — ejecuta antes: node tools/import_kit.mjs");
  process.exit(2);
}

const piezas = (only ? [`${only}.glb`] : readdirSync(KIT).filter((f) => f.endsWith(".glb"))).sort();
if (!piezas.length) {
  console.error("no hay piezas en public/kit/ — ejecuta antes: node tools/import_kit.mjs");
  process.exit(2);
}

function startServer() {
  // Con el mismo node y no el .cmd de npx: en Windows spawn de un .cmd sin
  // shell da EINVAL, y con shell habria que citar rutas con espacios.
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
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 480, height: 480 } });

const FONDO = [0x2a, 0x2a, 0x33];

/**
 * Fraccion de pixeles que no son el fondo del estudio.
 *
 * Dibuja y lee en la MISMA llamada, a proposito. Separarlo en dos evaluate
 * costo una medida falsa: el compositor intercambia el buffer entre las dos y
 * readPixels devuelve negro, que no es el color del fondo y por tanto cuenta
 * como pieza en todos los pixeles. El barril salio con 100 % de silueta.
 */
async function silhouette(yaw, pitch) {
  return page.evaluate(({ bg, yaw, pitch }) => {
    window.piece.look(yaw, pitch);
    const canvas = document.getElementById("view");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    const w = canvas.width, h = canvas.height;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const colours = new Set();
    let on = 0;
    for (let i = 0; i < px.length; i += 4) {
      const d = Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]);
      if (d > 20) {
        on++;
        colours.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
      }
    }
    return { coverage: on / (w * h), colours: colours.size };
  }, { bg: FONDO, yaw, pitch });
}

const fichas = [];
const problems = [];

for (const file of piezas) {
  const nombre = basename(file, ".glb");
  // La verdad de referencia: leida del binario, sin navegador ni Three.js.
  const esperado = measure(readGlb(join(KIT, file)).json);

  const errors = [];
  const onError = (e) => errors.push(String(e?.message ?? e));
  page.on("pageerror", onError);

  await page.goto(`http://localhost:${PORT}/piece.html?glb=${nombre}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.piece?.ready === true, null, { timeout: 20000 });
  const stats = await page.evaluate(() => window.piece.stats);

  const dir = join(OUT, nombre);
  mkdirSync(dir, { recursive: true });

  // Primero la silueta, con el estudio apagado: es la unica medida que dice
  // "la PIEZA se ve" y no "la rejilla se ve".
  let sil = { coverage: 0, colours: 0 };
  let vacio = { coverage: 0, colours: 0 };
  if (!stats.error) {
    await page.evaluate(() => window.piece.setHelpers(false));
    sil = await silhouette(35, 22);
    await page.screenshot({ path: join(dir, "silueta.png") });

    // La sonda de control: el mismo estudio, la misma medida, sin la pieza. Si
    // esto no da practicamente cero, la cifra de arriba no estaba midiendo la
    // pieza y toda la ficha es mentira. Un medidor no se cree hasta que se le
    // ha visto dar el resultado correcto sobre una verdad conocida.
    await page.evaluate(() => window.piece.setPiece(false));
    vacio = await silhouette(35, 22);
    await page.evaluate(() => window.piece.setPiece(true));

    await page.evaluate(() => window.piece.setHelpers(true));
    for (const v of VISTAS) {
      await page.evaluate(({ yaw, pitch }) => window.piece.look(yaw, pitch), v);
      await page.screenshot({ path: join(dir, `${v.name}.png`) });
    }
  }

  page.off("pageerror", onError);

  // --- las comprobaciones de esta pieza -------------------------------------
  const fallos = [];
  if (stats.error) fallos.push(`no cargo: ${stats.error}`);
  else {
    for (let i = 0; i < 3; i++) {
      // 1 mm de tolerancia: por debajo de eso es ruido de coma flotante entre
      // dos lectores, por encima es una pieza que no mide lo que dice medir.
      const d = Math.abs(stats.box.size[i] - esperado.size[i]);
      if (d > 0.001) {
        fallos.push(
          `caja eje ${"XYZ"[i]}: el binario dice ${esperado.size[i].toFixed(3)} y ` +
            `Three.js ${stats.box.size[i].toFixed(3)}`
        );
      }
    }
    if (stats.triangles !== esperado.triangles) {
      fallos.push(`${esperado.triangles} triangulos en el archivo, ${stats.triangles} en la escena`);
    }
    if (sil.coverage < 0.005) {
      fallos.push(`silueta de solo ${(sil.coverage * 100).toFixed(2)} %: no se ve`);
    }
    if (vacio.coverage > 0.002) {
      fallos.push(
        `la sonda de control mide ${(vacio.coverage * 100).toFixed(2)} % con el estudio ` +
          `vacio: lo que se midio no era la pieza`
      );
    }
    if (stats.texturedMeshes !== stats.meshes) {
      fallos.push(`${stats.meshes - stats.texturedMeshes} de ${stats.meshes} mallas sin textura`);
    }
    for (const m of stats.materials) {
      if (m.magFilter !== "NEAREST") fallos.push(`filtro ${m.magFilter}, se esperaba NEAREST`);
      if (m.alphaMode === "BLEND") fallos.push("el material sigue en BLEND");
    }
    // El suelo en y = 0 es lo que permite colocar por celdas sin corregir, y
    // solo se le exige a los modulos. A una viga se le exige lo contrario: si
    // NO bajara de cero quedaria una junta a la vista. La regla sale del tipo
    // declarado en el manifiesto, no de adivinarla por el nombre del archivo.
    const tipo = TIPOS.get(nombre) ?? "adorno";
    if (tipo === "modulo" && Math.abs(stats.box.min[1]) > 0.001) {
      fallos.push(`modulo con el suelo en y = ${stats.box.min[1].toFixed(3)}, no en 0`);
    }
  }
  if (errors.length) fallos.push(`la pagina dio errores: ${errors.slice(0, 2).join(" | ")}`);

  for (const f of fallos) problems.push(`${nombre}: ${f}`);
  fichas.push({ nombre, tipo: TIPOS.get(nombre) ?? "adorno", esperado, stats, silueta: sil, control: vacio, fallos });

  console.log(
    `  ${nombre.padEnd(32)} ` +
      `${stats.box ? stats.box.size.map((v) => v.toFixed(2).padStart(6)).join(" x") : "   —"}  ` +
      `${String(stats.triangles).padStart(4)} tri  ` +
      `silueta ${(sil.coverage * 100).toFixed(1).padStart(5)} %  ` +
      `${stats.materials?.[0]?.image ? stats.materials[0].image.join("x") : "sin textura"}  ` +
      `${fallos.length ? "FALLO" : "ok"}`
  );
}

if (!KEEP) {
  await browser.close();
  server.kill();
}

writeFileSync(join(OUT, "fichas.json"), JSON.stringify(fichas, null, 2));

console.log(`\n${fichas.length} piezas, ${fichas.length * (VISTAS.length + 1)} capturas en build/kit/`);
console.log();
if (problems.length) {
  for (const p of problems) console.log("FALLO:", p);
  process.exit(1);
}
console.log(
  `Las ${fichas.length} piezas cargan, se ven, miden lo que dice el binario ` +
    `y conservan textura NEAREST con alfa recortada.\n`
);
