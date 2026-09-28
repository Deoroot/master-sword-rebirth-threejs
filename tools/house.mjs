// La ficha de cada casa: seis angulos renderizados y medidos.
//
//   node tools/house.mjs                 todas las casas del catalogo
//   node tools/house.mjs casa-simple     una sola
//   node tools/house.mjs --keep          deja servidor y navegador abiertos
//
// Lo que comprueba, y por que cada cosa:
//
//   huella      que la caja del cuerpo -sin tejado ni voladizos- sea exactamente
//               ancho x fondo celdas. Es lo que decidira si la casa cabe donde
//               el plano del pueblo dice que cabe. Se compara contra lo que
//               calculo planHouse, no contra un numero escrito aqui.
//   tejado      que el tejado empiece POR DEBAJO de lo alto del muro. El kit lo
//               trae hecho para solapar 36,6 cm; si alguien coloca el tejado a
//               la altura del muro "y ya", queda una rendija de luz alrededor de
//               toda la casa que en una captura diurna casi no se ve y de noche
//               se ve entera.
//   piezas      que se haya instanciado una malla por pieza del plano: si el
//               cargador se come una, la casa sigue saliendo bien en la foto de
//               frente y le falta la pared de atras.
//   control     el estudio sin la casa tiene que medir cero.
//
// Las capturas van a build/casas/<casa>/.

import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { CASAS } from "../src/kit/casas.js";
import { planHouse, ALTURA_MURO, CELDA, SOLAPE_TEJADO } from "../src/kit/house.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "build", "casas");
const PORT = 5197;
const KEEP = process.argv.includes("--keep");
const only = process.argv.slice(2).find((a) => !a.startsWith("--"));

// Las seis. Las cuatro caras porque una casa con la puerta bien puesta y la
// ventana de atras metida en el tejado aprueba cualquier foto de frente. La
// cenital porque descubre que el tejado no tapa. La rasante porque es la unica
// altura desde la que un jugador va a ver esta casa de verdad.
const VISTAS = [
  { name: "sur", yaw: 0, pitch: 10 },
  { name: "este", yaw: 90, pitch: 10 },
  { name: "norte", yaw: 180, pitch: 10 },
  { name: "oeste", yaw: 270, pitch: 10 },
  { name: "tres-cuartos", yaw: 35, pitch: 22 },
  { name: "cenital", yaw: 0, pitch: 82 },
  // A la altura de los ojos, que es la unica que importa de verdad.
  { name: "rasante", yaw: 20, pitch: 2 },
];

const casas = only ? [only] : Object.keys(CASAS);

function startServer() {
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
const page = await browser.newPage({ viewport: { width: 640, height: 640 } });

const FONDO = [0x2a, 0x2a, 0x33];

async function silhouette(yaw, pitch) {
  return page.evaluate(
    ({ bg, yaw, pitch }) => {
      // Dibujar y leer en la MISMA tarea: separarlo deja que el compositor
      // intercambie el buffer y readPixels devuelva negro, que no es el fondo y
      // por tanto cuenta como casa en todos los pixeles.
      window.casa.look(yaw, pitch);
      const canvas = document.getElementById("view");
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      const w = canvas.width, h = canvas.height;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const colours = new Set();
      let on = 0;
      for (let i = 0; i < px.length; i += 4) {
        const d =
          Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]);
        if (d > 20) {
          on++;
          colours.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
        }
      }
      return { coverage: on / (w * h), colours: colours.size };
    },
    { bg: FONDO, yaw, pitch }
  );
}

const fichas = [];
const problems = [];

for (const nombre of casas) {
  const esperado = planHouse(CASAS[nombre].spec);

  const errors = [];
  const onError = (e) => errors.push(String(e?.message ?? e));
  page.on("pageerror", onError);

  await page.goto(`http://localhost:${PORT}/house.html?casa=${nombre}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.casa?.ready === true, null, { timeout: 30000 });
  const stats = await page.evaluate(() => window.casa.stats);

  const dir = join(OUT, nombre);
  mkdirSync(dir, { recursive: true });

  let sil = { coverage: 0, colours: 0 };
  let vacio = { coverage: 0, colours: 0 };
  if (!stats.error) {
    await page.evaluate(() => window.casa.setHelpers(false));
    sil = await silhouette(35, 22);
    await page.screenshot({ path: join(dir, "silueta.png") });
    await page.evaluate(() => window.casa.setCasa(false));
    vacio = await silhouette(35, 22);
    await page.evaluate(() => window.casa.setCasa(true));
    await page.evaluate(() => window.casa.setHelpers(true));
    for (const v of VISTAS) {
      await page.evaluate(({ yaw, pitch }) => window.casa.look(yaw, pitch), v);
      await page.screenshot({ path: join(dir, `${v.name}.png`) });
    }
    // El cuerpo sin tejado. Es la unica forma de ver donde estan las puertas y
    // ventanas de verdad: con el tejado puesto, una ventana metida debajo del
    // alero se ve igual que una ventana bien puesta.
    await page.evaluate(() => window.casa.soloPapel("muro"));
    await page.evaluate(() => window.casa.look(35, 22));
    await page.screenshot({ path: join(dir, "solo-muros.png") });
    await page.evaluate(() => window.casa.soloPapel(null));
  }

  page.off("pageerror", onError);

  const fallos = [];
  if (stats.error) fallos.push(`no se construyo: ${stats.error}`);
  else {
    const { plan, medido } = stats;
    // La huella: lo que mide el cuerpo tiene que ser ancho x fondo celdas.
    const huellaX = plan.caja.max[0] - plan.caja.min[0];
    const huellaZ = plan.caja.max[2] - plan.caja.min[2];
    if (Math.abs(huellaX - plan.ancho * CELDA) > 1e-9) {
      fallos.push(`la huella mide ${huellaX} m en X y deberia medir ${plan.ancho * CELDA}`);
    }
    if (Math.abs(huellaZ - plan.fondo * CELDA) > 1e-9) {
      fallos.push(`la huella mide ${huellaZ} m en Z y deberia medir ${plan.fondo * CELDA}`);
    }
    // El tejado tiene que solapar, no apoyarse. Lo alto del muro es plantas*3;
    // el tejado empieza SOLAPE_TEJADO por debajo de eso.
    const altoMuro = plan.plantas * ALTURA_MURO;
    const tejados = plan.piezas.filter((p) => p.papel === "tejado");
    if (!tejados.length) fallos.push("la casa no tiene tejado");
    for (const t of tejados) {
      const base = t.pos[1] - SOLAPE_TEJADO;
      if (base >= altoMuro - 1e-9) {
        fallos.push(
          `el tejado empieza en y = ${base.toFixed(3)} y lo alto del muro esta en ` +
            `${altoMuro}: no solapa, deja rendija`
        );
      }
    }
    // Una malla por pieza del plano, como minimo: cada .glb trae una o varias.
    if (medido.meshes < plan.piezas.length) {
      fallos.push(`${plan.piezas.length} piezas en el plano y solo ${medido.meshes} mallas`);
    }
    if (medido.texturedMeshes !== medido.meshes) {
      fallos.push(`${medido.meshes - medido.texturedMeshes} mallas sin textura`);
    }
    if (sil.coverage < 0.03) {
      fallos.push(`silueta de solo ${(sil.coverage * 100).toFixed(2)} %: la casa no se ve`);
    }
    if (vacio.coverage > 0.002) {
      fallos.push(
        `la sonda de control mide ${(vacio.coverage * 100).toFixed(2)} % sin la casa: ` +
          `lo que se midio no era la casa`
      );
    }
    for (const a of plan.avisos) fallos.push(`aviso del plano: ${a}`);
  }
  if (errors.length) fallos.push(`la pagina dio errores: ${errors.slice(0, 2).join(" | ")}`);

  for (const f of fallos) problems.push(`${nombre}: ${f}`);
  fichas.push({ nombre, esperado: esperado.piezas.length, stats, silueta: sil, control: vacio, fallos });

  console.log(
    `  ${nombre.padEnd(16)} ${String(stats.plan?.piezas.length ?? 0).padStart(3)} piezas  ` +
      `${String(stats.medido?.triangles ?? 0).padStart(5)} tri  ` +
      `silueta ${(sil.coverage * 100).toFixed(1).padStart(5)} %  ` +
      `${fallos.length ? "FALLO" : "ok"}`
  );
}

if (!KEEP) {
  await browser.close();
  server.kill();
}

writeFileSync(join(OUT, "fichas.json"), JSON.stringify(fichas, null, 2));

console.log(`\n${fichas.length} casas, ${fichas.length * (VISTAS.length + 2)} capturas en build/casas/\n`);
if (problems.length) {
  for (const p of problems) console.log("FALLO:", p);
  process.exit(1);
}
console.log(`Las ${fichas.length} casas se construyen, se ven, y el tejado solapa el muro.\n`);
