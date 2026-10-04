// LA ARMADURA DEL 96, JUGANDO: lo que un bicho te quita con y sin ella puesta.
//
//   npm run sonda:armadura96
//
// Se entra POR EL MENÚ (CLAUDE.md §3) en sala88, que es nuestra y tiene UNA
// rata, y se le pega para que muerda (`vermin` recela de `human`: el 82).
//
//   1. SIN armadura (la del fénix en la mochila): lo que te quita cada
//      mordisco. Es el CONTROL POSITIVO: si aquí ya bajara al 45 %, la mochila
//      protegería y lo de después no mediría nada.
//   2. Con el fénix PUESTO por `probe.armadura.vestir`, que llama a la misma
//      función del juego (`vestirObjeto` de src/main.js). Ningún botón lo hace
//      todavía: el panel del inventario no mueve objetos (doc/ARMADURA_96.md).
//      Lo que se lee es lo que hizo `golpear` —`probe.armadura.ultima`, no
//      recalculado aquí (el 65)— y lo que dice la consola y la vida.
//   3. El chaleco de cuero encima: «You have no more chest slots».
//   4. La fuerza: un personaje nuevo tiene 2 y el fénix pide 40, así que a la
//      décima sale la ventana «Insufficient Strength for Armor».
//
// El daño de la rata no se sortea (`dodamage` con un número fijo, ver
// sondas/mordisco92.mjs: «0.4 damage.»), así que no hacen falta medias: la
// armadura es una multiplicación y se compara golpe a golpe.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PORT = 5496;
const liberados = liberarPuerto(PORT);
if (liberados?.length) console.log(`  (puerto ${PORT} liberado)`);
const dev = await arrancarVite(PORT);
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

const nav = await chromium.launch();
const errores = [];
const controles = [];
const control = (que, bien, detalle = "") => { controles.push({ que, bien, detalle }); return bien; };

async function pagina() {
  const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
  pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
  // Sin el recargado en caliente: el árbol es compartido con otras sesiones.
  await pag.addInitScript(() => {
    const Real = window.WebSocket;
    window.WebSocket = function (url, protos) {
      const esHmr = protos === "vite-hmr" || (Array.isArray(protos) && protos.includes("vite-hmr"));
      if (!esHmr) return new Real(url, protos);
      return { close() {}, send() {}, addEventListener() {}, removeEventListener() {}, readyState: 3 };
    };
  });
  return pag;
}

const RATA = "monsters/giantrat";
const plantarse = (pag, d = 0.8) => pag.evaluate(({ g, d }) => {
  const r = window.probe.ia.bicho(g, 0);
  if (!r) return null;
  window.probe.mundo.poner(r.donde[0] - d, r.donde[1] + 0.1, r.donde[2]);
  window.probe.mundo.mirar(r.donde[0], r.donde[1] + 0.2, r.donde[2]);   // TRES números (el 78)
  return r;
}, { g: RATA, d });
const vida = (pag) => pag.evaluate(() => window.probe.sesion.vitales()?.vida ?? null);
// Cada línea llega como «<tipo>: <texto>» (`atacado: Giant Rat hits you: …`):
// se le quita el tipo y los espacios de cola, que el texto del motor lleva.
const dicho = (pag) => pag.evaluate(() => (window.probe.misiones.dicho?.() ?? [])
  .map((l) => (typeof l === "string" ? l : l.texto ?? JSON.stringify(l)))
  .map((l) => l.replace(/^[a-z]+: /, "").trimEnd()));
const golpesDeRata = (lineas) => lineas.filter((l) => /^Giant Rat hits you: /.test(l))
  .map((l) => Number(/hits you: (\d+\.\d) /.exec(l)?.[1]));

/**
 * Pegada a la rata hasta que la consola tenga `n` mordiscos más que al
 * empezar. Recoloca en cada vuelta (el 82) y le devuelve la vida a tope cada
 * vez, para que no se muera la medida. Devuelve los mordiscos nuevos con la
 * vida perdida en cada uno, leída justo antes y justo después.
 */
async function mordiscos(pag, n, segundos = 60) {
  // La consola, la vida y lo que hizo la armadura se leen en la MISMA llamada:
  // en dos `evaluate` seguidos el mordisco puede caer entre los dos, y la vida
  // perdida se apuntaba al mordisco de antes (salió «0» la primera pasada).
  const foto = () => pag.evaluate(() => ({
    lineas: (window.probe.misiones.dicho?.() ?? [])
      .map((l) => (typeof l === "string" ? l : l.texto ?? JSON.stringify(l)))
      .map((l) => l.replace(/^[a-z]+: /, "").trimEnd()),
    vida: window.probe.sesion.vitales()?.vida ?? null,
    ultima: window.probe.armadura.ultima,
  }));
  const out = [];
  let t = 0;
  let f0 = await foto();
  let c0 = golpesDeRata(f0.lineas).length;
  while (t < segundos * 1000 && out.length < n) {
    await pag.waitForTimeout(150); t += 150;
    if (t % 1500 < 150) await plantarse(pag);
    const f1 = await foto();
    const g = golpesDeRata(f1.lineas);
    // Uno por vuelta: si llegaran dos juntos, la vida no se reparte.
    if (g.length === c0 + 1) out.push({ consola: g.at(-1), perdida: +(f0.vida - f1.vida).toFixed(3), ultima: f1.ultima });
    c0 = g.length;
    f0 = f1;
  }
  return out;
}

try {
  const pag = await pagina();
  await entrarPorElMenu(pag, PORT, { mapa: "sala88" });
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
  await pag.waitForFunction(() => window.probe.sesion.estado() === "jugando", null, { timeout: 60000 });
  const mapa = await pag.evaluate(() => window.probe.vgui2.mapaDeLaPartida());
  control("se entra por el menú en sala88", mapa === "sala88", `mapa ${mapa}`);
  await pag.waitForTimeout(1000);

  // La armadura entra en la mochila como el botín del 82: se dice que la pone la sonda.
  await pag.evaluate(() => { window.probe.misiones.dar("armor_pheonix55"); window.probe.misiones.dar("armor_leather"); });

  // ── 1. SIN ARMADURA ─────────────────────────────────────────────────────
  await plantarse(pag);
  await pag.evaluate(() => window.probe.golpe.atacar(1.2));
  const sin = await mordiscos(pag, 3);
  console.log(`  sin armadura: ${JSON.stringify(sin.map((x) => [x.consola, x.perdida]))}`);
  control("CONTROL POSITIVO: sin armadura la rata muerde (3 mordiscos leídos uno a uno)", sin.length >= 3, `${sin.length}`);
  control("y con la armadura EN LA MOCHILA la consola dice «0.4 damage.» entero", sin.length > 0 && sin.every((x) => x.consola === 0.4),
    sin.map((x) => x.consola).join(", "));
  control("y la vida baja 0,4 por mordisco", sin.length > 0 && sin.every((x) => Math.abs(x.perdida - 0.4) < 0.01),
    sin.map((x) => x.perdida).join(", "));
  control("y `golpear` no pasó por ninguna pieza puesta", sin.every((x) => x.ultima === null), JSON.stringify(sin.at(-1)?.ultima ?? null));

  // ── 2. CON EL FÉNIX PUESTO ──────────────────────────────────────────────
  const r = await pag.evaluate(() => window.probe.armadura.vestir("armor_pheonix55"));
  control("ponerse el fénix: cabe", r?.puesto === true, JSON.stringify(r));
  // La ventana de la fuerza sale a la décima (`callevent 0.1`) y dura ocho
  // segundos: se lee ahora, no al final.
  await pag.waitForTimeout(600);
  const ventanas = JSON.stringify(await pag.evaluate(() => window.probe.aviso.ventanas()));
  const puestos = await pag.evaluate(() => window.probe.armadura.puestos);
  control("y queda puesto en su entidad con `registerarmor` hecho (protección del C++ = 0)",
    puestos.some((p) => p.id === "armor_pheonix55" && p.armadura?.proteccion === 0), JSON.stringify(puestos));
  const con = await mordiscos(pag, 3);
  console.log(`  con el fénix: ${JSON.stringify(con.map((x) => [x.consola, x.perdida, x.ultima?.antes, x.ultima?.despues]))}`);
  control("la rata sigue mordiendo (3 mordiscos)", con.length >= 3, `${con.length}`);
  // 0,45 con el redondeo del motor: el daño le llega al guion como texto con
  // «%.2f» (`FloatToString`, sharedutil.h:49), así que 0,4000000059 (un
  // `float`) entra como «0.40» y sale 0,18 justo, no 0,1800000027.
  control("LA REGLA: cada mordisco sale de `golpear` multiplicado por 0,45 —el 55 % del fénix—",
    con.length > 0 && con.every((x) => x.ultima && Math.abs(x.ultima.despues - Number(x.ultima.antes.toFixed(2)) * 0.45) < 1e-9),
    con.map((x) => `${x.ultima?.antes}→${x.ultima?.despues}`).join(", "));
  control("la consola dice «0.2 damage.» (0,18 con un decimal)", con.length > 0 && con.every((x) => x.consola === 0.2),
    con.map((x) => x.consola).join(", "));
  control("y la vida baja 0,18 por mordisco, no 0,4", con.length > 0 && con.every((x) => Math.abs(x.perdida - 0.18) < 0.01),
    con.map((x) => x.perdida).join(", "));
  const mediaSin = sin.reduce((a, x) => a + x.perdida, 0) / Math.max(1, sin.length);
  const mediaCon = con.reduce((a, x) => a + x.perdida, 0) / Math.max(1, con.length);
  control("el efecto, en una línea: con armadura se pierde menos que sin ella", mediaCon < mediaSin,
    `${mediaSin.toFixed(3)} → ${mediaCon.toFixed(3)} por mordisco`);

  // ── 3. NO CABEN DOS EN EL PECHO ─────────────────────────────────────────
  const r2 = await pag.evaluate(() => window.probe.armadura.vestir("armor_leather"));
  const lineas = await dicho(pag);
  control("el cuero encima no cabe: «You have no more chest slots»", r2?.puesto === false && lineas.some((l) => l === "You have no more chest slots"),
    `${JSON.stringify(r2)} / ${lineas.slice(-2).join(" | ")}`);

  // ── 4. LA FUERZA ────────────────────────────────────────────────────────
  control("fuerza 2 contra 40: la ventana «Insufficient Strength for Armor»",
    /Insufficient Strength for Armor/.test(ventanas) && /Min Strength 40/.test(ventanas), ventanas.slice(0, 300));
  const fuego = lineas.some((l) => l === "You lack the fire skill to activate this armor's magic.");
  control("y sin fuego 20: «You lack the fire skill to activate this armor's magic.»", fuego,
    lineas.filter((l) => /fire|resist/i.test(l)).join(" | ") || "nada");

  await pag.close();
  control("ni un error de página en toda la pasada", errores.length === 0, errores.slice(0, 2).join(" | ") || "ninguno");
} catch (e) {
  // LA CAÍDA ES UNA ROJA, no una nota al pie (el 65).
  control("LA SONDA HA LLEGADO AL FINAL", false, String(e).slice(0, 300));
} finally {
  const verdes = controles.filter((x) => x.bien === true).length;
  const rojas = controles.filter((x) => x.bien === false);
  console.log("\n  ──────────────────────────────────────────────");
  for (const x of controles) console.log(`  [${x.bien ? " ok " : "ROJA"}] ${x.que}${x.detalle ? `  — ${x.detalle}` : ""}`);
  console.log(`\n  ${verdes} de ${verdes + rojas.length} controles en verde`);
  await nav.close();
  matar(dev);
  process.exit(rojas.length ? 1 : 0);
}
