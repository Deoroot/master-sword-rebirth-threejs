// npm run sonda:nacer100 — EL 100: el nacimiento de Gate City, otra vez bajo
// un rayo de luz, y con la caja del jugador dentro.
//
// El 99 sacó el nacimiento de Gate City de debajo del rayo `*48` porque la caja
// del jugador quedaba metida en la pared (doc/SALTO_99.md §2). El 100 aparta
// el punto del centro del rayo hasta que la caja cabe, sin que el haz deje de
// caerle encima (`bajoElRayo`, tools/aparicion.mjs; doc/SERVIDOR_100.md §5).
// Esto mide el EFECTO en el juego, entrando por el menú:
//
//   SOLO (personaje nuevo, `probe.sesion.nuevo`):
//     1. aparece donde dice el horneado;
//     2. el rayo cae sobre él: la huella del brush del rayo, leída AQUÍ del
//        `.bsp` y no del horneado, toca la planta de su caja (menos de 16
//        unidades en cada eje) — y el horneado dice que es un rayo;
//     3. la caja cabe: salta ENTERO en el sitio, sin andar (con la caja en la
//        pared el salto se cortaba: el 99), y anda en los cuatro sentidos;
//   CON SERVIDOR (un personaje de `tools/personaje.mjs`, por la ranura):
//     4. el servidor le pone en el punto, SIN que `_sitioLibre` tenga que
//        apartarle (anillo 0) — con el punto en la pared le apartaba;
//     5. control positivo del instrumento: el centro del rayo, sin apartar,
//        NO cabe (`/costura` no puede preguntar por un punto cualquiera, así
//        que se pregunta al árbol BSP con el casco 1, `cabeDePie`).
//
// LAS ROTURAS (CLAUDE.md §4), sin tocar `build/` —que es de todas las
// sesiones—: `ROTURA100=centro` sirve al NAVEGADOR un `aparicion.json` con el
// nacimiento en el centro del rayo (Playwright `route`), que es lo que haría
// `bajoElRayo` sin apartar; `ROTURA100=lejos` uno apartado 40 unidades del
// haz, que cabe y no está debajo. El servidor no se rompe: lee su copia.

import { spawn, spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { chromium } from "playwright";
import { liberarPuerto, lanzarVite, esperarHttp } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";
import { leerBsp, leerModelos, aEscena, UNIDADES_POR_METRO as U } from "../src/bsp/lector.js";
import { cabeDePie } from "../src/bsp/arbol.js";
import { bspDe } from "../tools/mapa.mjs";

// 5965/5966: ninguna otra sonda los usa (test/puertos98).
const PUERTO_WEB = 5965;
const PUERTO_PARTIDA = 5966;
const CARPETA = "build/partidas/nacer100/personajes";
const ID = "pruebas-nacer100";
const ROTURA = process.env.ROTURA100 ?? "";
const MEDIA_CAJA = 16;           // VEC_HULL_MIN/MAX, util.h:464-465
const ENTERO = [1.05, 1.20];     // el salto entero de salto99: 45 u = 1,143 m

const controles = [];
const control = (que, bien, detalle = "") => {
  controles.push({ que, bien: Boolean(bien), detalle });
  console.log(`  ${bien ? "ok  " : "MAL "} ${que}${detalle ? `\n         ${detalle}` : ""}`);
  return bien;
};
const DECLARADOS = 8;  // 1, 2, 3a, 3b, 4a, 4b, 5 y los errores
const errores = [];
const matar = (p) => { if (!p) return; try { spawnSync("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

const aparicion = JSON.parse(readFileSync("build/gatecity/aparicion.json", "utf8"));
const nac = aparicion.nacimiento;
// La huella del rayo, del `.bsp` y no del horneado: el horneado sólo dice CUÁL.
const bsp = leerBsp(bspDe("gatecity", []));
const modelos = leerModelos(bsp);
const modeloRayo = nac.rayo?.modelo ?? null;
const m = modeloRayo ? modelos[Number(modeloRayo.slice(1))] : null;

// Lo que se sirve al navegador, roto o no.
let servido = aparicion;
if (ROTURA) {
  if (!m) throw new Error("ROTURA100: el nacimiento horneado no es un rayo, no hay nada que romper");
  const c = [(m.mins[0] + m.maxs[0]) / 2, (m.mins[1] + m.maxs[1]) / 2, nac.unidades[2]];
  const u = ROTURA === "centro" ? c
    : ROTURA === "lejos" ? [nac.unidades[0], nac.unidades[1] + Math.sign(nac.unidades[1] - c[1] || -1) * 40, nac.unidades[2]]
    : null;
  if (!u) throw new Error(`ROTURA100: no hay rotura «${ROTURA}»`);
  const roto = { ...nac, unidades: u, escena: aEscena(u) };
  servido = { ...aparicion, nacimiento: roto, reaparicion: roto };
  console.log(`  ROTURA100=${ROTURA} puesta: el navegador recibe el nacimiento en [${u.join(", ")}]`);
}

const huella = (pies) => {
  // escena → unidades: aEscena es (x, z, −y) / U.
  const x = pies[0] * U, y = -pies[2] * U;
  return [Math.max(m.mins[0] - x, 0, x - m.maxs[0]), Math.max(m.mins[1] - y, 0, y - m.maxs[1])];
};

// ── el personaje del servidor, con la herramienta de verdad ────────────────
try { rmSync("build/partidas/nacer100", { recursive: true, force: true }); } catch {}
{
  const r = spawnSync(process.execPath, ["tools/personaje.mjs", "--nombre", "Nacer100", "--mapa", "nacer100"], { encoding: "utf8" });
  if (r.status !== 0) { console.error(r.stdout, r.stderr); process.exit(1); }
}

liberarPuerto(PUERTO_WEB);
liberarPuerto(PUERTO_PARTIDA);
const dev = lanzarVite(PUERTO_WEB);
const salida = [];
const partida = spawn(process.execPath, [
  "tools/servidor.mjs", "--puerto", String(PUERTO_PARTIDA), "--nombre", "La sonda 100", "--personajes", CARPETA,
], { stdio: ["ignore", "pipe", "pipe"] });
partida.stdout.on("data", (b) => salida.push(String(b)));
partida.stderr.on("data", (b) => salida.push(`ERR ${b}`));

const nav = await chromium.launch();
const pagina = async (quien) => {
  const pag = await nav.newPage({ viewport: { width: 1000, height: 700 } });
  await pag.addInitScript(() => {
    const Real = window.WebSocket;
    const Falso = function (url, protos) {
      const esHmr = protos === "vite-hmr" || (Array.isArray(protos) && protos.includes("vite-hmr"));
      if (!esHmr) return new Real(url, protos);
      return { close() {}, send() {}, addEventListener() {}, removeEventListener() {}, readyState: 3 };
    };
    Object.assign(Falso, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
    Falso.prototype = Real.prototype;
    window.WebSocket = Falso;
  });
  pag.on("pageerror", (e) => errores.push(`${quien}: ${String(e).slice(0, 200)}`));
  pag.on("console", (x) => { if (x.type() === "error" && /SyntaxError|is not defined|Cannot read/.test(x.text())) errores.push(`${quien}: ${x.text().slice(0, 200)}`); });
  if (ROTURA) {
    await pag.route(/\/gatecity\/aparicion\.json(\?.*)?$/, (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(servido) }));
  }
  return pag;
};

try {
  await esperarHttp(`http://localhost:${PUERTO_PARTIDA}/partidas`, { tope: 120_000, proceso: partida, quien: "el servidor de partida" });
  await esperarHttp(`http://localhost:${PUERTO_WEB}/`, { tope: 90_000, proceso: dev, quien: "vite" });

  // ── SOLO ─────────────────────────────────────────────────────────────────
  const pag = await pagina("solo");
  await entrarPorElMenu(pag, PUERTO_WEB, { mapa: "gatecity" });
  await pag.evaluate(() => window.probe.sesion.nuevo("Nacer", "swords_rsword"));
  await pag.waitForFunction(() => window.probe.sesion.estado() === "jugando", null, { timeout: 60000 });
  await pag.waitForTimeout(1500);
  const pies = await pag.evaluate(() => [...window.probe.player.feet]);
  const desvio = Math.hypot(pies[0] - nac.escena[0], pies[2] - nac.escena[2]);
  control("1. aparece donde dice el horneado (solo, por el menú)", desvio < 0.3,
    `${nac.nombre}: pies (${pies.map((x) => x.toFixed(2)).join(", ")}), desvío ${desvio.toFixed(2)} m`);

  const f = m ? huella(pies) : null;
  control("2. el rayo cae sobre él: la huella del brush (del .bsp) se mete en la planta de su caja",
    nac.familia === "rayo" && f && f[0] < MEDIA_CAJA && f[1] < MEDIA_CAJA,
    m ? `${modeloRayo}: x ${m.mins[0]}..${m.maxs[0]}, y ${m.mins[1]}..${m.maxs[1]} · el centro del jugador a ${f.map((v) => v.toFixed(1)).join(" y ")} u (menos de ${MEDIA_CAJA}) · apartado ${nac.rayo.apartadoUnidades} u`
      : `el horneado no es un rayo (${nac.familia})`);

  // Salta en el sitio, SIN andar ni teletransportar: lo primero que hace.
  const salto = await (async () => {
    const medir = pag.evaluate(() => new Promise((listo) => {
      let max = -Infinity; const t0 = performance.now();
      const uno = () => {
        max = Math.max(max, window.probe.player.feet[1]);
        if (performance.now() - t0 < 1400) requestAnimationFrame(uno);
        else listo({ max, suelo: window.probe.player.feet[1] });
      };
      requestAnimationFrame(uno);
    }));
    await pag.keyboard.down("Space"); await pag.waitForTimeout(150); await pag.keyboard.up("Space");
    const r = await medir;
    return r.max - r.suelo;
  })();
  control("3a. la caja cabe: salta ENTERO donde nace, sin andar (1,05-1,20 m)",
    salto > ENTERO[0] && salto < ENTERO[1], `${salto.toFixed(2)} m`);

  // Y anda en los cuatro sentidos (con la caja en la pared, uno no avanza).
  const andado = [];
  for (const tecla of ["KeyW", "KeyS", "KeyA", "KeyD"]) {
    const a = await pag.evaluate(() => [...window.probe.player.feet]);
    await pag.keyboard.down(tecla); await pag.waitForTimeout(400); await pag.keyboard.up(tecla);
    await pag.waitForTimeout(300);
    const b = await pag.evaluate(() => [...window.probe.player.feet]);
    andado.push(Math.hypot(b[0] - a[0], b[2] - a[2]));
  }
  control("3b. y anda en los cuatro sentidos desde donde nace (> 0,3 m cada uno)",
    andado.every((d) => d > 0.3), andado.map((d) => d.toFixed(2)).join(" · ") + " m (W S A D)");
  await pag.close();

  // ── CON SERVIDOR ─────────────────────────────────────────────────────────
  const pr = await pagina("red");
  await entrarPorElMenu(pr, PUERTO_WEB, { extra: `red=ws://localhost:${PUERTO_PARTIDA}/juego` });
  const lista = await pr.evaluate(() => window.probe.sesion.listar());
  const k = lista.findIndex((c) => c.id === ID);
  if (k < 0) throw new Error(`el servidor no lista ${ID}`);
  const b = (await pr.evaluate(() => window.probe.vgui.botones())).find((x) => x.i === 2 * k);
  await pr.mouse.click(b.centro, b.arriba + 12);
  await pr.waitForFunction(() => window.probe.sesion.estado() === "jugando" && window.probe.vgui.abierto() === null, null, { timeout: 90000 });
  await pr.waitForTimeout(1500);
  const cos = await (await fetch(`http://localhost:${PUERTO_PARTIDA}/costura`)).json();
  const cli = cos.clientes?.[0] ?? null;
  // El servidor lee SU aparicion.json (no se rompe): el punto es el horneado.
  const alPunto = cli?.pies ? Math.hypot(cli.pies[0] - nac.escena[0], cli.pies[2] - nac.escena[2]) : Infinity;
  control("4a. con servidor, le pone en el punto SIN apartarle (`_sitioLibre` anillo 0, cabe)",
    cli?.ultimoSitio?.anillo === 0 && cli.cabe === true && alPunto < 0.3,
    `pies ${cli?.pies?.map((x) => x.toFixed(2)).join(", ")} · al punto ${alPunto.toFixed(2)} m · sitio ${JSON.stringify(cli?.ultimoSitio)} · cabe ${cli?.cabe}`);
  control("4b. y el servidor dice que en el nacimiento cabe la cápsula",
    cos.puntos?.nacimiento?.cabe === true, JSON.stringify(cos.puntos?.nacimiento));
  await pr.close();

  // ── El control positivo del instrumento ──────────────────────────────────
  const centro = m ? [(m.mins[0] + m.maxs[0]) / 2, (m.mins[1] + m.maxs[1]) / 2, nac.unidades[2]] : null;
  control("5. CONTROL: en el centro del rayo, sin apartar, la caja NO cabe (casco 1)",
    centro && !cabeDePie(bsp, centro) && cabeDePie(bsp, nac.unidades),
    centro ? `centro [${centro.join(", ")}] cabe ${cabeDePie(bsp, centro)} · nacimiento [${nac.unidades.join(", ")}] cabe ${cabeDePie(bsp, nac.unidades)}` : "sin rayo");

  control("ni un error de página ni del servidor", errores.length === 0 && !salida.some((l) => l.startsWith("ERR") && !/ExperimentalWarning/.test(l)),
    errores.slice(0, 2).join(" | ") || "ninguno");
} catch (e) {
  control("LA SONDA HA LLEGADO AL FINAL", false, `${String(e?.message ?? e).slice(0, 300)} | errores: ${errores.slice(0, 3).join(" | ") || "ninguno"}`);
} finally {
  const verdes = controles.filter((x) => x.bien).length;
  const faltan = Math.max(0, DECLARADOS - controles.length);
  console.log(`\n  sonda:nacer100 — ${verdes} de ${DECLARADOS} en verde${faltan ? ` (${faltan} sin correr: cuentan como rojos)` : ""}`);
  await nav.close();
  matar(partida);
  matar(dev);
  process.exit(verdes === DECLARADOS && controles.length === DECLARADOS ? 0 : 1);
}
