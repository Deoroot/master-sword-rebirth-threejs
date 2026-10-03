// EL VENENO, DE PUNTA A PUNTA SOBRE EL JUGADOR — experimento 91.
//
//   node sondas/veneno91.mjs
//
// `effects/dot_poison` es lo que ponen la araña, el zombi enano de ballesta y
// la babosa verde. En el 90 corría y se quitaba diciendo «You resist the
// poison.», que el juego no diría (le faltaban `$get_takedmg`, `$math`,
// `scriptflags`, `xdodamage`…). El 91 lo portó; esto mide que, JUGANDO, el
// veneno le quita vida al jugador con el ritmo y la duración de su guion:
//
//     callevent 0.5 dot_effect                     effects/base_dot.script:45
//     xdodamage $get(ent_me,id) direct DOT_DMG …   effects/base_dot.script:64
//     callevent 1.0 dot_effect                     effects/base_dot.script:65
//     callevent EFFECT_DURATION effect_duration_ended   base_effect.script:62
//
// LO QUE NO MIDE: que una araña se lo ponga al morderte. Los bichos de este
// puerto no corren guion todavía (otra sesión), así que el veneno lo pone la
// sonda, con una araña de verdad de la manada como atacante y por la misma
// puerta que usa el juego (`guionJugador.efectos.aplicar`). El daño NO lo
// hace la sonda: lo hace el efecto, por el `golpear` de los bichos.
//
// Y EL 66: la regeneración del jugador mueve el mismo número. Por eso el
// control negativo va DESPUÉS del veneno, con el personaje herido —donde la
// regeneración sí actúa— y en una ventana del mismo largo: si sin veneno la
// vida no baja, la bajada de antes no era de otro mecanismo.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PORT = 5394;
const DANO = 2;          // por golpe; pequeño para no matar a un personaje nuevo
const DURACION = 5;      // PARAM1: cinco golpes, a los 0,5 / 1,5 / 2,5 / 3,5 / 4,5 s
const liberados = liberarPuerto(PORT);
if (liberados?.length) console.log(`  (puerto ${PORT} liberado)`);
const dev = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { shell: true, stdio: "ignore" });
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
await new Promise((r) => setTimeout(r, 7000));

const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
// El árbol es compartido con otras sesiones: sin esto, el recargado en
// caliente de Vite tira la partida a media medida (copiado de efectos90).
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
const vida = async () => (await pag.evaluate(() => window.probe.sesion.vitales())).vida;
const dicho = () => pag.evaluate(() => (window.probe.misiones.dicho?.() ?? []).map((l) => (typeof l === "string" ? l : l.texto ?? JSON.stringify(l))));

try {
  // ── 1. SE ENTRA POR EL MENÚ ──────────────────────────────────────────────
  await entrarPorElMenu(pag, PORT, { mapa: "gatecity" });
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
  await pag.waitForTimeout(2500);
  const mapa = await pag.evaluate(() => window.probe.vgui2.mapaDeLaPartida());
  control("se ha entrado a Gate City por el menú", mapa === "gatecity", String(mapa));

  const indice = await pag.evaluate(() => window.probe.veneno.bicho("monsters/spider"));
  control("hay una araña viva en la manada para ser el atacante", indice >= 0, String(indice));
  if (indice < 0) throw new Error("sin araña no hay atacante");

  // ── 2. EL VENENO ─────────────────────────────────────────────────────────
  const antes = await vida();
  // `dicho()` es un ANILLO de tamaño fijo: cortar por la longitud de antes
  // pierde líneas en cuanto se llena. Se mira el anillo entero antes y después.
  const textoAntes = (await dicho()).join("\n");
  control("antes del veneno nadie ha dicho «poisoned» ni «subsides»", !/poisoned|subsides/.test(textoAntes));
  const puesto = await pag.evaluate((o) => window.probe.veneno.aplicar("effects/dot_poison", o),
    { duracion: String(DURACION), dano: String(DANO), indice });
  control("se le pone effects/dot_poison al jugador por la puerta del juego", puesto?.puesto === true && puesto?.id === "DOT_poison",
    JSON.stringify(puesto));
  await pag.waitForTimeout(200);
  control("y queda puesto entre sus activos", (await pag.evaluate(() => window.probe.veneno.activos())).some((e) => e.id === "DOT_poison"));

  await pag.waitForTimeout(DURACION * 1000 + 1200);
  const despues = await vida();
  const heridas = await pag.evaluate(() => window.probe.veneno.heridas());
  const lineas = await dicho();
  const texto = lineas.join("\n");
  const ts = heridas.map((h) => h.t - puesto.t);
  console.log(`\n  VIDA   antes ${antes}   después ${despues}   golpes ${heridas.length} a ${ts.map((x) => x.toFixed(2)).join(", ")} s`);

  control("dice «You have been poisoned!»", /You have been poisoned!/.test(texto), lineas.slice(0, 3).join(" / "));
  control("y NO dice «You resist the poison.» (la frase falsa del 90)", !/resist/.test(texto), "");
  control(`cinco golpes de ${DANO}, uno por segundo: el ritmo del guion`, heridas.length === 5 && heridas.every((h) => h.dano === DANO && h.tipo === "poison_effect"),
    JSON.stringify(heridas.map((h) => [h.dano, h.tipo])));
  control("el primero a los 0,5 s y los demás a 1 s entre sí (±0,2)",
    ts.length === 5 && Math.abs(ts[0] - 0.5) <= 0.2 && ts.slice(1).every((x, k) => Math.abs(x - ts[k] - 1) <= 0.2),
    ts.map((x) => x.toFixed(2)).join(", "));
  control("la VIDA baja lo que dicen los golpes (la regeneración puede devolver un poco)",
    antes - despues >= 5 * DANO - 2 && antes - despues <= 5 * DANO, `${antes} -> ${despues}`);
  control("lo firma la araña, por el camino de un golpe de bicho: «… hits you: … poison damage.»",
    /Leaping Cave Spider hits you: 2\.0 poison damage\./.test(texto), lineas.filter((l) => /hits you/.test(l)).slice(0, 2).join(" / "));
  // Sólo el veneno: `player/emote_sit&stand` es un efecto que el jugador lleva
  // SIEMPRE desde que entra (player_main.script:308), y está bien que siga.
  const quedan = await pag.evaluate(() => window.probe.veneno.activos());
  control("al acabar se va: ya no está entre los activos", !quedan.some((e) => e.id === "DOT_poison"), quedan.map((e) => e.id).join(", "));
  control("y lo dice: «The poison subsides.»", /The poison subsides\./.test(texto), lineas.slice(-3).join(" / "));

  // ── 3. CONTROL NEGATIVO, en una ventana del mismo largo ─────────────────
  // Herido ya —la regeneración actúa aquí, el 66—, y sin veneno.
  const vNeg = await vida();
  const hNeg = heridas.length;
  await pag.waitForTimeout(DURACION * 1000 + 1200);
  const vNeg2 = await vida();
  const hNeg2 = (await pag.evaluate(() => window.probe.veneno.heridas())).length;
  console.log(`  NEGATIVO   ${vNeg} -> ${vNeg2}   golpes ${hNeg} -> ${hNeg2}`);
  control("NEGATIVO: sin veneno, en la misma ventana, la vida NO baja y no llega ni un golpe", vNeg2 >= vNeg && hNeg2 === hNeg,
    `${vNeg} -> ${vNeg2}, golpes ${hNeg} -> ${hNeg2}`);

  const faltan = await pag.evaluate(() => window.probe.veneno.noSoportados());
  console.log(`  lo que el veneno pidió y no hay: ${faltan.join(" | ") || "nada"}`);
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
