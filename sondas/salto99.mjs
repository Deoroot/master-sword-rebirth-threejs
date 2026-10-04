// EL 99: EL SALTO JUSTO DESPUÉS DE UN TELETRANSPORTE, SIN ASENTARSE ANDANDO.
//
//   npm run sonda:salto99
//
// La 98 (sondas/aturdir98.mjs) medía el salto en el sitio de aparecer de Gate
// City y lo veía quedarse en 0,03-0,16 m dos de cada seis veces; lo esquivó
// andando 0,3 s antes de cada salto y lo dejó pendiente, achacado a la regla
// del «techo» de `Player.step`. El 99 midió que la regla era nuestra (y se ha
// cambiado por `PM_ClipVelocity`, test/salto99.test.mjs), pero que lo que
// cortaba el salto era EL SITIO: el nacimiento estaba a 6 unidades de una
// pared, con la cabeza bajo el alféizar de una ventana, dentro de la caja del
// jugador (casco 1). Ver doc/SALTO_99.md.
//
// Esta sonda entra POR EL MENÚ (CLAUDE.md §3), crea un personaje y:
//
//   1. aparece donde dice el horneado (`build/gatecity/aparicion.json`);
//   2. CONTROL POSITIVO DEL INSTRUMENTO: teletransportado bajo un techo bajo
//      de verdad (un sitio de Gate City con 0,5 m de hueco sobre la cabeza),
//      el mismo instrumento ve un salto CORTADO. Sin esto, «salta entero»
//      podría ser un instrumento que siempre lee lo mismo;
//   3. CONTROL POSITIVO DEL SALTO: al aire libre y después de andar, como
//      hacía la 98, salta entero;
//   4. LO QUE SE MIDE: seis veces, `poner` en el sitio de aparecer y la barra
//      SIN andar —tres esperando 300 ms, tres en el acto—, y las seis enteras.
//
// La altura se mide contra el SUELO donde acaba (los pies cuando ya ha
// aterrizado), no contra los pies al pulsar: `poner` deja al jugador 5 cm en
// el aire y en el caso «en el acto» todavía está cayendo.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

// 5991: ninguna otra sonda lo usa (grep de `PORT` en sondas/, el 99).
const PORT = 5991;
const liberados = liberarPuerto(PORT);
if (liberados?.length) console.log(`  (puerto ${PORT} liberado)`);
const dev = await arrancarVite(PORT, { tope: 90_000 });
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

const nav = await chromium.launch();
const errores = [];
const controles = [];
// LOS DECLARADOS, contados antes de empezar (el 65): menú, horneado, techo,
// aire libre, seis saltos, y errores.
const SALTOS = 6;
const DECLARADOS = 4 + SALTOS + 1;
const control = (que, bien, detalle = "") => { controles.push({ que, bien, detalle }); return bien; };

// Un sitio de Gate City con un techo plano a ~0,5 m por encima de la cabeza,
// buscado con rayos de Rapier sobre la malla de colisión (el 99) y comprobado
// en Node: el salto ahí se queda en 0,41-0,45 m. Es el control de que este
// instrumento SABE ver un salto cortado.
const TECHO_BAJO = [12.24, -13.72, -20.79];

// ENTERO ES 45 UNIDADES, NO «MÁS DE 0,9 m». `PM_Jump` con sv_gravity 800 da
// 268,3²/1600 = 45 u = 1,143 m (ALTURA_DE_SALTO, movimiento.js). La primera
// versión de esta sonda pedía 0,9-1,4 m y con el nacimiento VIEJO —dentro de
// la pared— salió verde: 1,37-1,38 m, la cápsula saliendo disparada de la
// pared. Un salto un 21 % más alto está tan mal como uno cortado. El margen
// es el de lo medido al aire libre (1,12-1,14) más el paso de 1/60 s.
const ENTERO = [1.05, 1.20];

try {
  const aparicion = JSON.parse(readFileSync("build/gatecity/aparicion.json", "utf8"));
  const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
  pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
  pag.on("console", (m) => {
    if (m.type() === "error" && /SyntaxError|is not defined|Cannot read/.test(m.text())) errores.push(m.text().slice(0, 200));
  });
  // Sin el recargado en caliente: el árbol es compartido con otras sesiones.
  await pag.addInitScript(() => {
    const Real = window.WebSocket;
    window.WebSocket = function (url, protos) {
      const esHmr = protos === "vite-hmr" || (Array.isArray(protos) && protos.includes("vite-hmr"));
      if (!esHmr) return new Real(url, protos);
      return { close() {}, send() {}, addEventListener() {}, removeEventListener() {}, readyState: 3 };
    };
  });

  await entrarPorElMenu(pag, PORT, { mapa: "gatecity" });
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
  await pag.waitForFunction(() => window.probe.sesion.estado() === "jugando", null, { timeout: 60000 });
  const mapa = await pag.evaluate(() => window.probe.vgui2.mapaDeLaPartida());
  control("se entra por el menú en gatecity", mapa === "gatecity", `mapa ${mapa}`);
  await pag.waitForTimeout(1500);

  const pies0 = await pag.evaluate(() => [...window.probe.player.feet]);
  const nac = aparicion.nacimiento.escena;
  const desvio = Math.hypot(pies0[0] - nac[0], pies0[2] - nac[2]);
  control("aparece donde dice el horneado", desvio < 0.3,
    `${aparicion.nacimiento.nombre}: pies (${pies0.map((x) => x.toFixed(2)).join(", ")}), desvío ${desvio.toFixed(2)} m`);

  /**
   * Teletransporta a `p` (+5 cm, como el 98), espera `ms` y salta. Devuelve la
   * altura máxima de los pies sobre el suelo en que acaba.
   */
  async function saltarEn(p, { ms = 300, andar = false } = {}) {
    await pag.evaluate((p) => window.probe.mundo.poner(p[0], p[1] + 0.05, p[2]), p);
    if (ms) await pag.waitForTimeout(ms);
    if (andar) {
      await pag.keyboard.down("KeyW"); await pag.waitForTimeout(300); await pag.keyboard.up("KeyW");
      await pag.waitForTimeout(500);
    }
    const medir = pag.evaluate(() => new Promise((listo) => {
      let max = -Infinity; const t0 = performance.now();
      const uno = () => {
        max = Math.max(max, window.probe.player.feet[1]);
        if (performance.now() - t0 < 1400) requestAnimationFrame(uno);
        else listo({ max, suelo: window.probe.player.feet[1], enSuelo: window.probe.player.grounded });
      };
      requestAnimationFrame(uno);
    }));
    await pag.keyboard.down("Space");
    await pag.waitForTimeout(150);
    await pag.keyboard.up("Space");
    const r = await medir;
    return { h: r.max - r.suelo, enSuelo: r.enSuelo };
  }

  // ── EL INSTRUMENTO VE UN SALTO CORTADO ──────────────────────────────────
  const bajo = await saltarEn(TECHO_BAJO);
  control("CONTROL DEL INSTRUMENTO: bajo un techo a 0,5 m el salto sale cortado (0,1-0,7 m)",
    bajo.enSuelo && bajo.h > 0.1 && bajo.h < 0.7, `${bajo.h.toFixed(2)} m`);

  // ── Y UN SALTO ENTERO, COMO LO MEDÍA LA 98 ──────────────────────────────
  const andando = await saltarEn(pies0, { andar: true });
  control("CONTROL POSITIVO: andando antes, como la 98, salta entero (1,05-1,20 m)",
    andando.h > ENTERO[0] && andando.h < ENTERO[1], `${andando.h.toFixed(2)} m`);

  // ── LO QUE SE MIDE: SIN ANDAR ───────────────────────────────────────────
  const alturas = [];
  for (let k = 0; k < SALTOS; k++) {
    const enElActo = k % 2 === 1;
    const s = await saltarEn(pies0, { ms: enElActo ? 0 : 300 });
    alturas.push(s.h);
    control(`salto ${k + 1} de ${SALTOS} tras el teletransporte, ${enElActo ? "EN EL ACTO" : "a los 300 ms"}, sin andar: entero (1,05-1,20 m)`,
      s.h > ENTERO[0] && s.h < ENTERO[1], `${s.h.toFixed(2)} m`);
    await pag.waitForTimeout(400);
  }
  console.log(`  saltos sin andar: ${alturas.map((h) => h.toFixed(2)).join(", ")} m`);

  // NO ES UN CONTROL: el sitio de aparecer del 98, dentro de la pared. Ahí el
  // motor no te deja moverte (`PM_CheckStuck`), así que no hay número «bueno»
  // que pedir; se imprime para que se vea qué pasa.
  const viejo = await saltarEn([2.032, -14.53, -70.866]);
  console.log(`  (en el nacimiento del 98, dentro de la pared: ${viejo.h.toFixed(2)} m — sin control: el motor no deja ni moverse)`);

  await pag.close();
  control("ni un error de página en toda la pasada", errores.length === 0, errores.slice(0, 2).join(" | ") || "ninguno");
} catch (e) {
  // LA CAÍDA ES UNA ROJA, no una nota al pie (el 65).
  control("LA SONDA HA LLEGADO AL FINAL", false, `${String(e).slice(0, 300)} | errores: ${errores.slice(0, 3).join(" | ") || "ninguno"}`);
} finally {
  const verdes = controles.filter((x) => x.bien === true).length;
  const rojas = controles.filter((x) => x.bien === false);
  console.log("\n  ──────────────────────────────────────────────");
  for (const x of controles) console.log(`  [${x.bien ? " ok " : "ROJA"}] ${x.que}${x.detalle ? `  — ${x.detalle}` : ""}`);
  const faltan = Math.max(0, DECLARADOS - controles.length);
  console.log(`\n  ${verdes} de ${DECLARADOS} controles en verde${faltan ? ` (${faltan} sin correr: cuentan como rojos)` : ""}`);
  await nav.close();
  matar(dev);
  process.exit(rojas.length || faltan || verdes !== DECLARADOS ? 1 : 0);
}
