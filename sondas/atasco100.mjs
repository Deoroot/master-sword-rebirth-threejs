// EL 100: `PM_CheckStuck` Y LOS BICHOS DE DENTRO, EN EL NAVEGADOR Y EN SOLITARIO.
//
//   npm run sonda:atasco100
//   ROTURA100=R1 npm run sonda:atasco100     (la rotura deliberada)
//
// El 99 lo portó al servidor; el navegador seguía llamando a `player.step` a
// pelo, y en solitario un bicho metido en el jugador le dejaba clavado. Ahora
// el bucle de src/main.js da el paso por `PasoLocal` (src/play/atasco.js). Ver
// doc/ATASCO_100.md.
//
// Entra POR EL MENÚ (CLAUDE.md §3), crea un personaje en Gate City y:
//
//   1. el bucle pasa por `PasoLocal`: su cuenta de pasos SUBE jugando;
//   2. CONTROL POSITIVO DEL SITIO: sin nada, con la W, se anda más de un metro;
//   3. LO QUE SE MIDE: el cilindro de un bicho de verdad clavado EN los pies
//      del jugador; con la W sale andando (más del 70 % de lo de 2), y la
//      cuenta dice que se ha apartado; y luego doce salidas más con el
//      cilindro en sitios distintos alrededor del jugador (el centrado solo no
//      ve las roturas R2 y R3: ver el 3b de abajo);
//   4. CONTROL POSITIVO DEL INSTRUMENTO: el mismo cilindro 1,2 m por DELANTE,
//      que sólo toca, le PARA (menos de 0,6 m) y no se aparta nunca;
//   5. metido en la pared (el nacimiento viejo del 98, que el 99 midió dentro
//      de la caja del jugador): `PM_CheckStuck` contesta —pasos parados o
//      sacado por la tabla del cliente— y el fotograma no se cuelga.
//
// LA ROTURA va en el navegador, no en el árbol (que es compartido): con
// `ROTURA100=R1` la página recibe un src/main.js con el bucle llamando a
// `player.step` otra vez, cambiado al vuelo por `page.route` (R2 y R3 cambian
// src/play/atasco.js igual). Si el reemplazo no casa exactamente una vez, es
// un error de página y la sonda sale roja (el 80).

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

// 5985: ninguna otra sonda lo usa (test/puertos98.test.mjs lo comprueba).
const PORT = 5985;
const ROTURA = (process.env.ROTURA100 ?? "").trim();
// [archivo, de, a]. R1: el bucle vuelve a `player.step`. R2: `encender` sin
// poner al día el árbol de consultas. R3: sin el borde de las dos pieles.
const REEMPLAZOS = {
  R1: ["/src/main.js", "const r = pasoLocal.step(dtCuerpo", "const r = player.step(dtCuerpo"],
  R2: ["/src/play/atasco.js", "  cuerpo.world?.world?.updateSceneQueries?.();\n}", "}"],
  R3: ["/src/play/atasco.js", "  if (antes?.size) {", "  if (false) {"],
};
if (ROTURA && !REEMPLAZOS[ROTURA]) { console.error(`no hay rotura ${ROTURA}`); process.exit(2); }
if (ROTURA) console.log(`  ROTURA DELIBERADA: ${ROTURA}`);

const liberados = liberarPuerto(PORT);
if (liberados?.length) console.log(`  (puerto ${PORT} liberado)`);
const dev = await arrancarVite(PORT, { tope: 90_000 });
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

const nav = await chromium.launch();
const errores = [];
const controles = [];
// LOS DECLARADOS, contados antes de empezar (el 65).
const DECLARADOS = 11;
const control = (que, bien, detalle = "") => { controles.push({ que, bien, detalle }); return bien; };

// El nacimiento del 98, dentro de la pared (sondas/salto99.mjs, doc/SALTO_99.md).
const EN_LA_PARED = [2.032, -14.53, -70.866];

try {
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
  if (ROTURA) {
    let [archivo, de, a] = REEMPLAZOS[ROTURA];
    let puesta = 0;
    await pag.route((u) => new URL(u).pathname === archivo, async (ruta) => {
      const r = await ruta.fetch();
      const s = await r.text();
      // El árbol puede estar en CRLF (`core.autocrlf`): el reemplazo también (el 99).
      if (s.includes("\r\n")) { de = de.replace(/\r?\n/g, "\r\n"); a = a.replace(/\r?\n/g, "\r\n"); }
      const n = s.split(de).length - 1;
      if (n !== 1) { errores.push(`ROTURA100: el reemplazo casa ${n} veces`); return ruta.fulfill({ response: r, body: s }); }
      puesta++;
      console.log(`  ROTURA100 puesta en ${archivo} (${puesta})`);
      return ruta.fulfill({ response: r, body: s.replace(de, a) });
    });
  }

  await entrarPorElMenu(pag, PORT, { mapa: "gatecity" });
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
  await pag.waitForFunction(() => window.probe.sesion.estado() === "jugando", null, { timeout: 60000 });
  const mapa = await pag.evaluate(() => window.probe.vgui2.mapaDeLaPartida());
  control("se entra por el menú en gatecity", mapa === "gatecity", `mapa ${mapa}`);
  // Que los bichos de área hayan salido y tengan cilindro.
  await pag.waitForTimeout(4000);

  const a = () => pag.evaluate(() => window.probe.mundo.atasco());
  // ── 1. el bucle pasa por `PasoLocal` ────────────────────────────────────
  const c0 = await a();
  await pag.waitForTimeout(500);
  const c1 = await a();
  control("el bucle da los pasos del jugador por `PasoLocal` (su cuenta sube en 0,5 s)",
    c1 && c1.pasos - c0.pasos >= 10, `${c1 ? c1.pasos - c0.pasos : "sin"} pasos`);

  const pies0 = await pag.evaluate(() => [...window.probe.player.feet]);
  const yaw = await pag.evaluate(() => window.probe.player.yaw);
  const delante = (d) => [pies0[0] - Math.sin(yaw) * d, pies0[1], pies0[2] - Math.cos(yaw) * d];

  /**
   * Pone al jugador en `pies0`, mirando a `yaw`, y anda `ms` con la W. Devuelve
   * lo andado en planta, y una traza por fotograma (ms, andado, pasos, apartados,
   * cinemáticos dentro, rapidez, vida) que se imprime si el control sale rojo:
   * «no anda» puede ser un atasco o un golpe que le ha aturdido, y la traza los
   * distingue.
   */
  async function andarDesde(ms = 1000) {
    await pag.evaluate(([p, y]) => { window.probe.mundo.poner(p[0], p[1] + 0.02, p[2]); window.probe.player.yaw = y; }, [pies0, yaw]);
    await pag.waitForTimeout(300);
    const p = await pag.evaluate(() => [...window.probe.player.feet]);
    const traza = pag.evaluate(([p, ms]) => new Promise((listo) => {
      const o = []; const t0 = performance.now();
      const uno = () => {
        const f = window.probe.player.feet; const a = window.probe.mundo.atasco();
        o.push([Math.round(performance.now() - t0), +Math.hypot(f[0] - p[0], f[2] - p[2]).toFixed(2), a.pasos, a.apartados, a.dentro,
          Math.round(Math.hypot(a.vel[0], a.vel[2])), window.probe.sesion.vitales?.()?.vida ?? null]);
        if (performance.now() - t0 < ms + 200) requestAnimationFrame(uno); else listo(o);
      };
      requestAnimationFrame(uno);
    }), [p, ms]);
    await pag.keyboard.down("KeyW");
    await pag.waitForTimeout(ms);
    await pag.keyboard.up("KeyW");
    await pag.waitForTimeout(200);
    const q = await pag.evaluate(() => [...window.probe.player.feet]);
    return { d: Math.hypot(q[0] - p[0], q[2] - p[2]), traza: await traza };
  }
  const contar = (t) => `${t.length} fotogramas: ` + t.map((x) => x.join("/")).join(" ");

  // ── 2. el sitio deja andar ──────────────────────────────────────────────
  const { d: libre } = await andarDesde();
  control("CONTROL POSITIVO DEL SITIO: sin nada, con la W se anda más de un metro", libre > 1, `${libre.toFixed(2)} m`);

  // ── 3. un bicho DENTRO ──────────────────────────────────────────────────
  const cil = await pag.evaluate((p) => window.probe.mundo.clavarCilindro(p), pies0);
  // La cuenta desde ANTES de ponerle: la primera muestra de la traza puede
  // llegar con la salida ya hecha (son diez pasos, 0,17 s, y un fotograma de
  // la sonda puede tardar 200 ms). Así salió rojo una pasada con el juego bien.
  const apartados0 = (await a()).apartados;
  const fuera = await andarDesde();
  const apartados = fuera.traza.at(-1)[3] - apartados0;
  console.log(`  cilindro clavado: ${cil ? `${(cil.alto * 39.37).toFixed(0)} u de alto, radio ${(cil.radio * 39.37).toFixed(0)} u` : "ninguno"}`);
  if (!(fuera.d > 0.7 * libre)) console.log(`  traza (ms/andado/pasos/apartados/dentro/rapidez/vida) — ${contar(fuera.traza)}`);
  control("con el cilindro de un bicho EN los pies, sale andando (más del 70 % de lo libre)",
    cil && fuera.d > 0.7 * libre, `${fuera.d.toFixed(2)} m de ${libre.toFixed(2)}`);
  control("y la cuenta dice que lo ha apartado (y al final ya no tiene nada dentro)",
    apartados > 0 && fuera.traza.at(-1)[4] === 0, `${apartados} pasos con el bicho apartado, ${fuera.traza.at(-1)[4]} dentro al final`);

  // ── 3b. doce salidas desde sitios distintos ─────────────────────────────
  // Con el cilindro CENTRADO, salir funciona aunque el apartado vaya uno sí y
  // uno no, o aunque falte el borde: la mitad de los pasos bastan, y el último
  // no siempre cae en la banda de la piel (R2 dio 8 de 10 en una pasada y 10
  // de 10 en otra). En Node, al azar, se clavan el 15 %. Así que aquí se sale
  // desde doce sitios: el cilindro alrededor del jugador, de 0,15 a 0,59 m.
  const salidas = [];
  for (let k = 0; k < 12; k++) {
    const th = (k * Math.PI) / 6, lejos = 0.15 + 0.04 * k;
    await pag.evaluate((p) => window.probe.mundo.clavarCilindro(p), [pies0[0] + Math.sin(th) * lejos, pies0[1], pies0[2] + Math.cos(th) * lejos]);
    salidas.push((await andarDesde(700)).d);
  }
  control("doce salidas con el cilindro en sitios distintos dentro de él: todas andan más de un metro en 0,7 s",
    salidas.every((d) => d > 1), salidas.map((d) => d.toFixed(2)).join(" ") + " m");

  // ── 4. el mismo cilindro DELANTE le para ────────────────────────────────
  await pag.evaluate((p) => window.probe.mundo.clavarCilindro(p), delante(1.2));
  const apartadosAntes = (await a()).apartados;
  const contra = await andarDesde();
  const apartadosContra = contra.traza.at(-1)[3] - apartadosAntes;
  if (!(contra.d < 0.6) || apartadosContra) console.log(`  traza contra el de delante — ${contar(contra.traza)}`);
  control("CONTROL DEL INSTRUMENTO: el mismo cilindro 1,2 m por delante le PARA (menos de 0,6 m)",
    contra.d < 0.6, `${contra.d.toFixed(2)} m`);
  control("y ése, que sólo toca, no se aparta nunca", apartadosContra === 0, `${apartadosContra} apartados`);
  await pag.evaluate(() => window.probe.mundo.clavarCilindro(null));

  // ── 5. metido en la pared ───────────────────────────────────────────────
  const antesPared = await a();
  const enPared = await pag.evaluate(async (p) => {
    window.probe.mundo.poner(p[0], p[1], p[2]);
    const cabe = window.probe.mundo.atasco().cabe;
    // El fotograma más lento en 1 s con la W pulsada no se mide aquí: se mide
    // el reloj entre `requestAnimationFrame`.
    let peor = 0, t = performance.now();
    await new Promise((listo) => {
      const t0 = t;
      const uno = () => {
        const ahora = performance.now();
        peor = Math.max(peor, ahora - t); t = ahora;
        if (ahora - t0 < 1000) requestAnimationFrame(uno); else listo();
      };
      requestAnimationFrame(uno);
    });
    return { cabe, peor, despues: window.probe.mundo.atasco() };
  }, EN_LA_PARED);
  const parados = enPared.despues.parados - antesPared.parados;
  const sacado = enPared.despues.sacado - antesPared.sacado;
  console.log(`  en la pared: cabía al ponerle ${enPared.cabe}; ${parados} pasos parados, sacado ${sacado} veces; cabe al final ${enPared.despues.cabe}`);
  control("metido en la pared, `PM_CheckStuck` contesta (pasos parados o sacado por la tabla)",
    !enPared.cabe && (parados > 0 || sacado > 0), `cabía ${enPared.cabe}, ${parados} parados, ${sacado} sacado`);
  control("y el fotograma no se cuelga (el peor, menos de 500 ms)", enPared.peor < 500, `${Math.round(enPared.peor)} ms`);

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
