// LOS EFECTOS, DE PUNTA A PUNTA: el sumo sacerdote de Edana te cura.
//
//   node sondas/efectos90.mjs
//
// `applyeffect` no existía en este puerto, y el sacerdote lo enseña mejor que
// nadie: su menú trae «Ask to be Healed», él contesta «Oh my, let me help you
// with that...» y un segundo después hace
//
//     applyeffect ent_lastspoke effects/effect_rejuv2 0 1000 $get(ent_me,id)
//                                          edana/highpriest.script:94
//
// que es pegarle AL JUGADOR otro guion —`effects/effect_rejuv2`— cuyo
// `game_activate` hace `givehp 1000` y te dice «High Priest heals you for 1000
// hp». Sin `applyeffect` el sacerdote hablaba y no curaba nada. Ver
// `src/play/efectos.js`.
//
// Lo que se mide es el EFECTO: la vida del personaje y lo que dice la consola,
// entrando por el menú y pulsando con el ratón. Y con su control negativo: sin
// pedirlo, en el mismo rato, la vida no sube a lo grande.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PORT = 5391;
const liberados = liberarPuerto(PORT);
if (liberados?.length) console.log(`  (puerto ${PORT} liberado)`);
const dev = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { shell: true, stdio: "ignore" });
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
await new Promise((r) => setTimeout(r, 7000));

const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
// El árbol es compartido con otras sesiones que editan a la vez: sin esto, el
// recargado en caliente de Vite tira la partida a media medida.
await pag.addInitScript(() => {
  const Real = window.WebSocket;
  window.WebSocket = function (url, protos) {
    const esHmr = protos === "vite-hmr" || (Array.isArray(protos) && protos.includes("vite-hmr"));
    if (!esHmr) return new Real(url, protos);
    return { close() {}, send() {}, addEventListener() {}, removeEventListener() {}, readyState: 3 };
  };
});

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });

/** Plantarse delante hasta que EL JUEGO diga que le ve (el 79 y el 81). */
async function plantarseDelante(id) {
  const sitios = [[0, -1.0], [0, 1.0], [-1.0, 0], [1.0, 0], [0, -1.6], [1.6, 0],
    [-1.0, -1.0], [1.0, 1.0], [-1.0, 1.0], [1.0, -1.0]];
  for (const [dx, dz] of sitios) {
    const q = await pag.evaluate((i) => window.probe.vgui.npcs().find((x) => x.id === i)?.donde ?? null, id);
    if (!q) return null;
    await pag.evaluate((a) => {
      window.probe.mundo.poner(a.q[0] + a.dx, a.q[1], a.q[2] + a.dz);
      window.probe.mundo.mirar(a.q[0], a.q[1] + 0.9, a.q[2]);   // TRES números (el 78)
    }, { q, dx, dz });
    await pag.waitForTimeout(800);
    const d = await pag.evaluate(() => window.probe.vgui.delante()?.id ?? null);
    if (d === id) return { dx, dz };
  }
  return null;
}

const vida = () => pag.evaluate(() => window.probe.sesion.vitales());
const dicho = () => pag.evaluate(() => (window.probe.misiones.dicho?.() ?? []).map((l) => (typeof l === "string" ? l : l.texto ?? JSON.stringify(l))));

try {
  // ── 1. SE ENTRA POR EL MENÚ ──────────────────────────────────────────────
  await entrarPorElMenu(pag, PORT, { mapa: "edana" });
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
  await pag.waitForTimeout(2500);
  const mapa = await pag.evaluate(() => window.probe.vgui2.mapaDeLaPartida());
  control("se ha entrado a Edana por el menú", mapa === "edana", String(mapa));

  const sacerdotes = await pag.evaluate(() => window.probe.vgui.npcs().filter((i) => i.script === "edana/highpriest"));
  control("los sumos sacerdotes están montados", sacerdotes.length > 0, `${sacerdotes.length}`);
  if (!sacerdotes.length) throw new Error("sin sacerdote no hay experimento");

  // ── 2. HERIDO, y el control negativo: sin pedirlo no se cura ─────────────
  const lleno = await vida();
  await pag.evaluate(() => window.probe.sesion.danar(Math.floor(window.probe.sesion.vitales().vida * 0.7), { porQue: "la sonda", tipo: "golpe" }));
  const herido = await vida();
  control("la sonda deja al personaje herido", herido.vida < lleno.vida, `${lleno.vida} -> ${herido.vida}`);

  let elegido = null, sitio = null;
  for (const s of sacerdotes) { sitio = await plantarseDelante(s.id); if (sitio) { elegido = s; break; } }
  control("se le puede hablar a un sumo sacerdote: el juego le ve delante", Boolean(sitio), elegido?.nombre ?? "a ninguno");
  if (!sitio) throw new Error("no se le puede hablar");

  await pag.waitForTimeout(1500);
  const sinPedir = await vida();
  control("NEGATIVO: delante de él y sin pedirle nada, la vida no sube a lo grande",
    sinPedir.vida - herido.vida < 5, `${herido.vida} -> ${sinPedir.vida}`);

  // ── 3. SE LE PIDE, CON LA F Y EL RATÓN ───────────────────────────────────
  await pag.keyboard.press("KeyF");
  await pag.waitForTimeout(800);
  const panel = await pag.evaluate((id) => ({
    cual: window.probe.vgui.abierto(),
    botones: window.probe.vgui.botones(),
    opciones: window.probe.misiones.opcionesDe(id),
  }), elegido.id);
  const i = (panel.opciones ?? []).findIndex((o) => o.titulo === "Ask to be Healed");
  control("se abre SU panel y trae «Ask to be Healed»", panel.cual === "interact" && i >= 0,
    (panel.opciones ?? []).map((o) => o.titulo).join(" | "));
  if (i < 0 || !panel.botones[i]) throw new Error("sin la opción no se puede pedir");
  const b = panel.botones[i];
  await pag.mouse.click(b.centro, b.arriba + 8);

  // `calleventtimed 1 attack_1`: a los 0,3 s todavía NO.
  await pag.waitForTimeout(300);
  const enseguida = await vida();
  control("a los 0,3 s todavía no: el sacerdote cura al segundo (`calleventtimed 1`)",
    enseguida.vida - herido.vida < 5, `${herido.vida} -> ${enseguida.vida}`);

  await pag.waitForTimeout(1700);
  const curado = await vida();
  console.log(`\n  VIDA   llena ${lleno.vida}   herido ${herido.vida}   sin pedir ${sinPedir.vida}   curado ${curado.vida}`);
  control("CURADO: la vida vuelve al máximo", curado.vida >= lleno.vida, `${herido.vida} -> ${curado.vida} (máximo ${lleno.vida})`);

  const lineas = (await dicho()).join("\n");
  control("y lo dice el EFECTO, con el nombre del sacerdote: «… heals you for 1000 hp»",
    /heals you for 1000 hp/.test(lineas), lineas.split("\n").slice(-4).join(" / "));
  control("y no dice la línea que es para el sacerdote («You heal …»)",
    !/You heal /.test(lineas), "");

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
