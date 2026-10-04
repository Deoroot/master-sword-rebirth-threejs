// LANZADOR DE SONDAS EN PARALELO — el 98.
//
//   npm run sondas -- golpe arco muerte41            (3 a la vez, por omisión)
//   npm run sondas -- -j 1 golpe arco                (en serie)
//   npm run sondas -- --tope 600 golpe               (segundos por sonda)
//
// Cada sonda es un `node sondas/<nombre>.mjs` aparte, con su propio `vite` en
// su propio puerto (la prueba `test/puertos98.test.mjs` vigila que no se
// repitan: dos sondas en el mismo puerto se matan el `vite` la una a la otra).
// Su salida entera va a `build/sondas/<nombre>.log`, y al final se imprime una
// tabla con el tiempo y el «X de Y» de cada una, y **las líneas de los
// controles rojos**, que en una tanda larga se perdían: sólo se veía el
// resumen.
//
// LO QUE ES VERDE, y por qué así (CLAUDE.md §4, el 65): una sonda es verde si
// sale con código 0 **y** imprime un resumen «X de Y» **y** X = Y. Una sonda
// que se cae antes del resumen no es «0 controles rojos»: es una roja. Y una que
// imprime «30 de 30» y sale con 1 (errores de página) tampoco es verde.

import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

const RAIZ = join(import.meta.dirname, "..");
const DIR_LOG = join(RAIZ, "build", "sondas");

// ── los argumentos ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let concurrencia = 3;
let tope = 900; // segundos por sonda
const nombres = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "-j" || a === "--concurrencia") concurrencia = Number(args[++i]);
  else if (a === "--tope") tope = Number(args[++i]);
  else if (a === "-h" || a === "--help") { ayuda(); process.exit(0); }
  else nombres.push(basename(a).replace(/\.mjs$/, ""));
}
if (!nombres.length || !(concurrencia >= 1) || !(tope > 0)) { ayuda(); process.exit(2); }
for (const n of nombres) {
  if (!existsSync(join(RAIZ, "sondas", `${n}.mjs`))) {
    console.error(`no existe sondas/${n}.mjs`);
    process.exit(2);
  }
}
mkdirSync(DIR_LOG, { recursive: true });

function ayuda() {
  console.log("uso: npm run sondas -- [-j N] [--tope SEGUNDOS] <sonda> [<sonda>…]");
}

// ── leer el resumen de una salida ──────────────────────────────────────────
//
// Las sondas no se pusieron de acuerdo en el formato. Los que hay (medido el
// 98 con un grep sobre las 122): «N de N en verde» (51), «── N de N controles
// ──» (15), «N de N controles en verde» (8). Se coge la ÚLTIMA línea que case,
// porque varias imprimen antes cuentas parciales con «de».
const RE_RESUMEN = /(\d+)\s+de\s+(\d+)\s+(?:controles\s+en\s+verde|en\s+verde|controles)/;
// Y las marcas de un control rojo: `MAL ` (56 sondas), `NO  ` (17), `FALLA`
// (12), `[ROJA]` (7). Más la línea de errores de página cuando no es «ninguno».
const RE_ROJA = /^\s*(?:MAL\s|NO\s\s|FALLA|\[ROJA\])/;
// (El `\s*` va DENTRO de la mirada adelante: fuera, el motor lo deja en cero
// espacios, la mirada ve « ninguno» con su espacio y casa. Así salió la
// primera vez: «errores de página: ninguno» listado como roja.)
const RE_ERRORES = /^\s*errores de p[aá]gina:(?!\s*ninguno)/i;

function leerResumen(texto) {
  let resumen = null;
  const rojas = [];
  for (const linea of texto.split(/\r?\n/)) {
    const m = linea.match(RE_RESUMEN);
    if (m) resumen = { verdes: Number(m[1]), total: Number(m[2]) };
    if (RE_ROJA.test(linea) || RE_ERRORES.test(linea)) rojas.push(linea.trim());
  }
  return { resumen, rojas };
}

// ── correr una ─────────────────────────────────────────────────────────────
function correr(nombre) {
  return new Promise((resolver) => {
    const ruta = join(DIR_LOG, `${nombre}.log`);
    const log = createWriteStream(ruta);
    const t0 = Date.now();
    let texto = "";
    // Sin shell: el pid es el de Node, y un `taskkill /T` sobre él se lleva su
    // `vite` (la sonda lo arranca con shell, que cuelga de este Node).
    const hijo = spawn(process.execPath, [join("sondas", `${nombre}.mjs`)], { cwd: RAIZ, stdio: ["ignore", "pipe", "pipe"] });
    const anotar = (d) => { const s = d.toString(); texto += s; log.write(s); };
    hijo.stdout.on("data", anotar);
    hijo.stderr.on("data", anotar);
    let agotada = false;
    const reloj = setTimeout(() => {
      agotada = true;
      spawnSync("taskkill", ["/F", "/T", "/PID", String(hijo.pid)], { stdio: "ignore" });
    }, tope * 1000);
    hijo.on("close", (codigo) => {
      clearTimeout(reloj);
      const segundos = (Date.now() - t0) / 1000;
      if (agotada) { const s = `\n[lanzador] AGOTADA tras ${tope} s\n`; texto += s; log.write(s); }
      log.end();
      const { resumen, rojas } = leerResumen(texto);
      const verde = codigo === 0 && !agotada && resumen !== null && resumen.verdes === resumen.total && resumen.total > 0;
      let motivo = "";
      if (agotada) motivo = "agotada";
      else if (!resumen) motivo = "sin resumen";
      else if (resumen.verdes !== resumen.total) motivo = "controles rojos";
      else if (codigo !== 0) motivo = `salió con ${codigo}`;
      // Si se cae sin resumen, las últimas líneas son lo único que dice por qué.
      const cola = !resumen ? texto.trim().split(/\r?\n/).slice(-6) : [];
      resolver({ nombre, segundos, codigo, resumen, rojas, verde, motivo, cola, ruta });
    });
  });
}

// ── la cola ────────────────────────────────────────────────────────────────
const t0 = Date.now();
const pendientes = [...nombres];
const hechas = [];
async function obrero() {
  while (pendientes.length) {
    const n = pendientes.shift();
    console.log(`  … ${n}`);
    const r = await correr(n);
    console.log(`  ${r.verde ? "ok  " : "ROJA"} ${n}  ${r.segundos.toFixed(1)} s${r.motivo ? `  (${r.motivo})` : ""}`);
    hechas.push(r);
  }
}
console.log(`${nombres.length} sondas, ${Math.min(concurrencia, nombres.length)} a la vez; salidas en build/sondas/`);
await Promise.all(Array.from({ length: Math.min(concurrencia, nombres.length) }, obrero));
const total = (Date.now() - t0) / 1000;

// ── la tabla ───────────────────────────────────────────────────────────────
hechas.sort((a, b) => nombres.indexOf(a.nombre) - nombres.indexOf(b.nombre));
const ancho = Math.max(6, ...nombres.map((n) => n.length));
console.log(`\n  ${"sonda".padEnd(ancho)}  tiempo   controles   veredicto`);
for (const r of hechas) {
  const xy = r.resumen ? `${r.resumen.verdes} de ${r.resumen.total}` : "—";
  console.log(`  ${r.nombre.padEnd(ancho)}  ${(r.segundos.toFixed(1) + " s").padStart(7)}  ${xy.padStart(9)}   ${r.verde ? "verde" : `ROJA (${r.motivo})`}`);
}
const rojas = hechas.filter((r) => !r.verde);
for (const r of rojas) {
  console.log(`\n  ── ${r.nombre} (${r.ruta.slice(RAIZ.length + 1)})`);
  for (const l of r.rojas) console.log(`     ${l}`);
  for (const l of r.cola) console.log(`     | ${l}`);
}
const suma = hechas.reduce((s, r) => s + r.segundos, 0);
console.log(`\n  ${hechas.length - rojas.length} de ${hechas.length} sondas en verde · ${total.toFixed(1)} s de reloj (${suma.toFixed(1)} s sumando cada una)`);
process.exit(rojas.length ? 1 : 0);
