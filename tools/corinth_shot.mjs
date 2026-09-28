// Los fotogramas de Corinth, medidos.
//
//   node tools/corinth_shot.mjs          las ocho vistas -> build/corinth/
//   node tools/corinth_shot.mjs --keep   deja servidor y navegador abiertos
//
// Por qué existe, dicho por el propio traspaso: de los tres fallos que más
// cambiaron el trabajo la sesión pasada, DOS no los detectó ninguna cifra. El
// pueblo era un descampado y los muros salían de piedra, las dos cosas con todo
// en verde. Así que Corinth montado no se da por bueno hasta que se ha mirado.
//
// Cada captura se mide además de guardarse, porque un PNG que nadie mira no
// comprueba nada:
//
//   cobertura   fracción de píxeles que no son el color de la niebla. Una toma
//               casi toda niebla es una cámara mirando al vacío.
//   colores     una pantalla de un solo color es el equivalente visual de un
//               mundo vacío que compila sin fugas.
//   control     con el kit y el suelo apagados, la pantalla tiene que ser
//               niebla. Sin esto, «se ve el pueblo» solo dice que se ve algo.
//
// ── Se retrata el VISOR, no una página aparte ───────────────────────────────
//
// Hubo una página propia para esto, `corinth.html`, que montaba el pueblo con su
// cámara y sin jugador. Se borró, y por un motivo que ya tiene nombre en este
// proyecto: eran DOS páginas y no enseñaban lo mismo. El visor dibuja la
// vegetación en carteles y el paisaje del fondo; la página de capturas, no. O
// sea que las fotos que juzgaban Corinth enseñaban un pueblo sin un árbol
// mientras el pueblo que se andaba tenía ochenta y cuatro. Y la conclusión que
// se sacó de esas fotos —«sigue pareciendo vacío»— era sobre la página, no sobre
// el pueblo.
//
// Ahora se pilota `/?map=corinth` por `window.probe`, que es la misma puerta que
// usa `tools/shot.mjs` con los otros mundos. Una página, una verdad.
//
// Y una medida que es propia de esta sesión: **cuánta pantalla ocupa el kit**.
// Es la versión medida del fallo «el pueblo era un descampado», y costó dos
// intentos dar con ella.
//
// El primero restaba coberturas: la misma vista con el kit y sin él. No sirve, y
// la razón es que el pueblo está amurallado. Con muro, suelo y cielo, casi todo
// píxel es ya geometría antes de poner una sola casa: la cobertura se satura
// por encima del 90 % y la resta da dos puntos tanto si hay doce casas delante
// como si no hay ninguna. Una sonda que dice que no hay pueblo cuando lo hay es
// tan inútil como una que dice que sí cuando no.
//
// Lo que sí mide es cuántos píxeles CAMBIAN al apagar el kit. Eso es literalmente
// la fracción de pantalla que ocupan las casas, y no depende de lo que haya
// detrás. En la calle del norte son 46 puntos; en una vista del suelo pelado
// serían cero.

import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import { montarCorinth, puntoDeLlegada, rectMundo } from "../src/kit/pueblo.js";
import { UNITS_PER_M } from "../src/map/geometry.js";
import { PARCELAS, ANCHO, FONDO as FILAS } from "../src/kit/corinth.js";
import { CELDA } from "../src/kit/house.js";
import { CRATER, TRINCHERA, HONDO } from "../src/kit/boca.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "build", "corinth");
const PORT = 5198;
const KEEP = process.argv.includes("--keep");

// El color de la niebla, que es lo que cuenta como «nada». Sale de la paleta y
// no de un número escrito aquí: si alguien cambia la niebla, la sonda cambia con
// ella en vez de medir contra un color que ya no existe.
const FONDO = [0x8d, 0x8d, 0xb6];

const monta = montarCorinth();
const boca = rectMundo(PARCELAS.find((p) => p.papel === "boca"));
const llegada = puntoDeLlegada();
const centroPueblo = [(ANCHO * CELDA) / 2, 0, -(FILAS * CELDA) / 2];

// Las vistas. Cada una contesta una pregunta distinta y por eso no son ocho
// ángulos del mismo sitio: un pueblo mal montado sale bien desde algún lado.
const VISTAS = [
  {
    nombre: "cenital",
    // Toda la planta de una vez. Es la que enseñó que el pueblo era un
    // descampado, y la única que lo enseña.
    desde: [centroPueblo[0], 105, centroPueblo[2] + 1],
    hacia: centroPueblo,
    fov: 60,
  },
  {
    nombre: "llegada",
    // A la altura de los ojos, desde donde aparece el jugador, mirando al este
    // por la calle del portón. Es lo primero que se ve del pueblo, jamás.
    desde: [llegada[0], 1.75, llegada[2]],
    hacia: [llegada[0] + 40, 1.2, llegada[2]],
    fov: 70,
  },
  {
    nombre: "calle-norte",
    // Por la calle de las casas del norte. Si las fachadas están del revés, se
    // ve aquí y en ningún otro sitio.
    desde: [6, 1.75, -18],
    hacia: [46, 1.4, -18],
    fov: 70,
  },
  {
    nombre: "puente",
    // Desde la orilla oeste, mirando al puente y a la orilla de la guarnición.
    desde: [44, 2.2, -38],
    hacia: [64, 1.0, -38],
    fov: 70,
  },
  {
    nombre: "boca-desde-el-patio",
    // De frente a la reja de la calle, que es lo que ve quien pide permiso.
    desde: [boca.x0 + CRATER.cx, 1.75, boca.z1 - TRINCHERA.desde - 6],
    hacia: [boca.x0 + CRATER.cx, 0.4, boca.z1 - TRINCHERA.desde + 2],
    fov: 65,
  },
  {
    nombre: "boca-en-picado",
    // El socavón entero con su brocal. Es donde se vería un hueco en el anillo.
    desde: [boca.x0 + CRATER.cx, 22, boca.z1 - CRATER.cw - 9],
    hacia: [boca.x0 + CRATER.cx, -HONDO, boca.z1 - CRATER.cw],
    fov: 55,
  },
  {
    nombre: "fondo-del-socavon",
    // Desde el último peldaño, mirando a la reja. Es adonde llega la sonda de
    // marcha, y esta es la foto de lo que hay allí.
    desde: [boca.x0 + CRATER.cx, -HONDO + 1.7, boca.z1 - TRINCHERA.hasta - 3.5],
    hacia: [boca.x0 + CRATER.cx, -HONDO + 1.0, boca.z1 - TRINCHERA.hasta],
    fov: 70,
  },
  {
    nombre: "porton",
    // De frente al portón desde dentro, que es lo primero que el jugador tiene
    // detrás. Parpadeaba: el brush del portón estaba metido DENTRO del de la
    // muralla y los dos se peleaban por la profundidad.
    desde: [10, 1.75, -34],
    hacia: [-2, 2.2, -34],
    fov: 70,
  },
  {
    nombre: "rio",
    // El río desde la orilla oeste, con su ribera, su valla y el puente.
    desde: [44, 2.6, -30],
    hacia: [58, -1.0, -36],
    fov: 70,
  },
  {
    nombre: "herreria",
    // La orilla este: herrería, cuartel y torre. Las tres que hasta hoy estaban
    // con trazo discontinuo en el plano.
    desde: [56, 6, -66],
    hacia: [66, 1.5, -60],
    fov: 65,
  },
];

/**
 * De un punto de vista en metros a lo que pide `probe.fly`: unidades de Quake y
 * los dos ángulos.
 *
 * El yaw sale de invertir la fórmula de `player.js` -con yaw 0 se mira hacia −Z
 * y el avance es (−sen, −cos)-, no de probar signos hasta que cuadre.
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

await page.goto(`http://localhost:${PORT}/?map=corinth`, { waitUntil: "load" });
await page.waitForFunction(() => window.probe?.ready === true, null, { timeout: 180000 });
// Parar el bucle: sin esto, una vista de cámara suelta dura un fotograma y el
// siguiente `requestAnimationFrame` vuelve a dibujar desde los ojos del jugador.
// La captura sale del sitio equivocado, y sale plausible, que es lo peor.
await page.evaluate(() => window.probe.pause());
const stats = await page.evaluate(() => ({
  kit: window.probe.kit,
  mapa: {
    brushes: window.probe.level.brushes.length,
    triangulos: window.probe.level.mesh.triangleCount,
    cielo: window.probe.level.skyFaces,
    sello: window.probe.level.selloFaces,
  },
  avisos: window.probe.kit?.avisos ?? [],
  texto: document.getElementById("status").textContent,
}));

/** Dibuja y mide en la MISMA tarea: separarlo devuelve negro, no el fondo. */
async function medir(v) {
  return page.evaluate(
    ({ bg, ojo, yaw, pitch }) => {
      const canvas = document.getElementById("view");
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      const w = canvas.width, h = canvas.height;
      // Dibujar y leer en la MISMA tarea: separarlo deja que el compositor
      // intercambie el buffer y readPixels devuelva NEGRO, que no es el color
      // del fondo y por tanto cuenta como geometria en todos los pixeles.
      const leer = () => {
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return px;
      };
      window.probe.fly(ojo, yaw, pitch);
      const con = leer();
      window.probe.setKit(false);
      window.probe.fly(ojo, yaw, pitch);
      const sin = leer();
      window.probe.setKit(true);
      window.probe.fly(ojo, yaw, pitch);

      const colores = new Set();
      let on = 0;
      let cambian = 0;
      for (let i = 0; i < con.length; i += 4) {
        const d = Math.abs(con[i] - bg[0]) + Math.abs(con[i + 1] - bg[1]) + Math.abs(con[i + 2] - bg[2]);
        if (d > 24) { on++; colores.add((con[i] << 16) | (con[i + 1] << 8) | con[i + 2]); }
        const k = Math.abs(con[i] - sin[i]) + Math.abs(con[i + 1] - sin[i + 1]) + Math.abs(con[i + 2] - sin[i + 2]);
        if (k > 24) cambian++;
      }
      return { cobertura: on / (w * h), colores: colores.size, ocupaKit: cambian / (w * h) };
    },
    { bg: FONDO, ...vista(v.desde, v.hacia) }
  );
}

const fichas = [];
for (const v of VISTAS) {
  const m = await medir(v);
  await page.screenshot({ path: join(OUT, `${v.nombre}.png`) });
  // Y la misma vista con el kit apagado, guardada al lado. La pareja es lo que
  // deja ver de un vistazo qué pone el pueblo y qué pone el suelo.
  await page.evaluate(({ ojo, yaw, pitch }) => {
    window.probe.setKit(false);
    window.probe.fly(ojo, yaw, pitch);
  }, vista(v.desde, v.hacia));
  await page.screenshot({ path: join(OUT, `${v.nombre}--sin-kit.png`) });
  await page.evaluate(({ ojo, yaw, pitch }) => {
    window.probe.setKit(true);
    window.probe.fly(ojo, yaw, pitch);
  }, vista(v.desde, v.hacia));
  fichas.push({ vista: v.nombre, ...m });
  console.log(
    `  ${v.nombre.padEnd(22)} cobertura ${(m.cobertura * 100).toFixed(1).padStart(5)} %  ` +
      `el kit ocupa ${(m.ocupaKit * 100).toFixed(1).padStart(5)} %  ` +
      `${String(m.colores).padStart(5)} colores`
  );
}

// La sonda de control: sin kit y sin suelo, la pantalla tiene que ser niebla.
await page.evaluate(() => {
  window.probe.setKit(false);
  window.probe.setMapa(false);
  window.probe.setFondo(false);
});
const vacio = await medir(VISTAS[0]);
await page.screenshot({ path: join(OUT, "control-vacio.png") });
await page.evaluate(() => {
  window.probe.setKit(true);
  window.probe.setMapa(true);
  window.probe.setFondo(true);
});
console.log(`  ${"control vacío".padEnd(22)} cobertura ${(vacio.cobertura * 100).toFixed(2)} %`);

if (!KEEP) { await browser.close(); server.kill(); }

writeFileSync(join(OUT, "fichas.json"), JSON.stringify({ stats, fichas, vacio }, null, 2));

// --- veredicto ---------------------------------------------------------------

const fallos = [];
if (stats.error) fallos.push(`la página no montó el pueblo: ${stats.error.split("\n")[0]}`);
if (errores.length) fallos.push(`la página dio errores: ${errores.slice(0, 2).join(" | ")}`);
if (/sin cargar/.test(stats.texto)) {
  // Una textura que no carga no da error: sale gris y parece geometría mal
  // iluminada. Es la hermana del fallo de los muros de piedra.
  fallos.push(`la página dice que faltan texturas: ${stats.texto}`);
}
if (!stats.kit) fallos.push("la página no montó el kit: se está retratando el .map pelado");
if (stats.kit && stats.kit.piezas !== monta.piezas.length) {
  fallos.push(`la página montó ${stats.kit.piezas} piezas y el plano tiene ${monta.piezas.length}`);
}
for (const f of fichas) {
  if (f.cobertura < 0.25) {
    fallos.push(`'${f.vista}' mide ${(f.cobertura * 100).toFixed(1)} %: la cámara mira al vacío`);
  }
  if (f.colores < 40) {
    fallos.push(`'${f.vista}' tiene ${f.colores} colores: pantalla plana`);
  }
}
// La medida del descampado. En las vistas de calle el kit tiene que aportar de
// verdad; si aporta casi nada, lo que se ve es el suelo y las casas no están o
// están lejísimos, que es exactamente lo que pasó la vez anterior.
const calles = fichas.filter((f) => ["llegada", "calle-norte", "herreria"].includes(f.vista));
for (const f of calles) {
  if (f.ocupaKit < 0.10) {
    fallos.push(
      `en '${f.vista}' el kit solo ocupa el ${(f.ocupaKit * 100).toFixed(1)} % de la pantalla: ` +
        `lo que se ve es el suelo, no el pueblo`
    );
  }
}
if (vacio.cobertura > 0.02) {
  fallos.push(
    `la sonda de control mide ${(vacio.cobertura * 100).toFixed(2)} % sin kit y sin suelo: ` +
      `lo que se midió no era el pueblo`
  );
}

console.log(`\n${fichas.length * 2 + 1} capturas en build/corinth/`);
if (stats.avisos?.length) {
  console.log(`\n${stats.avisos.length} avisos del montaje:`);
  for (const a of stats.avisos) console.log("   ", a);
}
console.log();
if (fallos.length) {
  for (const f of fallos) console.log("FALLO:", f);
  process.exit(1);
}
console.log(
  `Corinth se ve: ${stats.kit.piezas} piezas del kit en ${stats.kit.parcelas} parcelas sobre ` +
    `${stats.mapa.triangulos} triángulos de .map, ${fichas.length} vistas medidas, y sin kit ni ` +
    `suelo la pantalla vuelve a ser niebla.\n`
);
