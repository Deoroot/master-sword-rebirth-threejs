// EL MORDISCO DEL 92, JUGANDO: el daño de un bicho sale del evento de animación.
//
//   node sondas/mordisco92.mjs
//
// En Master Sword la IA de un monstruo no hace daño: pone la animación de
// atacar y el `.mdl`, en el fotograma del mordisco, llama al guion por su
// nombre (evento 500/600, msmonsterserver.cpp:1484-1493). Ese evento hace
// `dodamage`, y el motor le contesta con `game_dodamage` y, si el ataque trae
// `dmgevent:bite`, con `bite_dodamage` (giattack.cpp:2030-2058). Por ahí
// envenena la araña de las cloacas (spider_mini_poison.script:51-54).
//
// Se entra POR EL MENÚ (CLAUDE.md §3), tres veces:
//
//   1. sala88, la rata: muerde por `bite1`, la IA no tira su dado, y NO
//      envenena (control negativo del veneno).
//   2. edanasewers, «Poisonous Spider»: muerde por `bite1` -> `frame_bite1`
//      -> `xdodamage … dmgevent:bite` -> `bite_dodamage` y el jugador queda
//      envenenado, con el veneno firmado por ella.
//   3. gatecity, «Leaping Cave Spider»: muerde por su guion, con `pierce`, y
//      NO envenena al morder — su veneno es el salto, que no está portado.
//      (EL 93: ya lo está, `sondas/salto93.mjs`; el control de abajo pide
//      que todo veneno venga de un salto.)
//      El encargo daba por hecho lo contrario; el mod dice esto.
//
// Lo que se lee es lo que el GUION ha recibido (`probe.costura`) y lo que el
// jugador ve en la consola, no lo que la IA cree que ha mandado.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PORT = 5492;
const liberados = liberarPuerto(PORT);
if (liberados?.length) console.log(`  (puerto ${PORT} liberado)`);
const dev = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { shell: true, stdio: "ignore" });
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
await new Promise((r) => setTimeout(r, 7000));

const nav = await chromium.launch();
const errores = [];
const controles = [];
const control = (que, bien, detalle = "") => { controles.push({ que, bien, detalle }); return bien; };

/** Una página nueva, sin el recargado en caliente (el árbol es compartido). */
async function pagina() {
  const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
  pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
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

async function entrar(pag, mapa) {
  await entrarPorElMenu(pag, PORT, { mapa });
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
  await pag.waitForFunction(() => window.probe.sesion.estado() === "jugando", null, { timeout: 60000 });
  const m = await pag.evaluate(() => window.probe.vgui2.mapaDeLaPartida());
  control(`se entra por el menú en ${mapa}`, m === mapa, `mapa ${m}`);
}

/** Al lado del bicho y mirándolo; `poner` no resuelve colisiones (el 69). */
const plantarse = (pag, guion, n = 0, d = 0.8) => pag.evaluate(({ guion, n, d }) => {
  const r = window.probe.ia.bicho(guion, n);
  if (!r) return null;
  window.probe.mundo.poner(r.donde[0] - d, r.donde[1] + 0.1, r.donde[2]);
  window.probe.mundo.mirar(r.donde[0], r.donde[1] + 0.2, r.donde[2]);   // TRES números (el 78)
  return r;
}, { guion, n, d });

const costura = (pag, guion, n = 0) => pag.evaluate(({ guion, n }) => window.probe.costura.de(guion, n), { guion, n });
const partida = (pag) => pag.evaluate(() => window.probe.costura.partida());
const vida = (pag) => pag.evaluate(() => window.probe.sesion.vitales()?.vida ?? null);
const dicho = (pag) => pag.evaluate(() => (window.probe.misiones.dicho?.() ?? []).map((l) => (typeof l === "string" ? l : l.texto ?? JSON.stringify(l))));
const activos = (pag) => pag.evaluate(() => (window.probe.veneno.activos() ?? []).map((e) => e.id));
const cuantos = (c, e) => c?.recibidos?.[e] ?? 0;

/** El índice del primero de ese guion que está fuera y vivo, esperando a su área. */
async function despierto(pag, guion, segundos = 20) {
  for (let t = 0; t < segundos * 2; t++) {
    const n = await pag.evaluate((g) => {
      for (let k = 0; k < 32; k++) {
        const r = window.probe.ia.bicho(g, k);
        if (!r) return -1;
        if (!r.dormido && !r.muerto) return k;
      }
      return -1;
    }, guion);
    if (n >= 0) return n;
    await pag.waitForTimeout(500);
  }
  return -1;
}

/**
 * Pegada a él hasta que su guion haya recibido `cuantas` veces `evento` (o se
 * acabe el plazo). Recoloca en cada vuelta: un bicho que corre se va (el 82).
 */
async function aguantar(pag, guion, n, { evento, cuantas, d = 0.8, segundos = 40, hasta = null }) {
  let c = null, t = 0;
  while (t < segundos * 1000) {
    await pag.waitForTimeout(400); t += 400;
    await plantarse(pag, guion, n, d);
    c = await costura(pag, guion, n);
    if (!c?.vivo) break;
    if (cuantos(c, evento) >= cuantas && (!hasta || hasta(c))) break;
  }
  return { c, t };
}

try {
  // ── 1. LA RATA DE SALA88: muerde por su guion y no envenena ──────────────
  {
    const pag = await pagina();
    await entrar(pag, "sala88");
    const RATA = "monsters/giantrat";
    await pag.waitForTimeout(1000);
    const p0 = await partida(pag);
    control("la costura está enchufada y la manada cuenta los golpes del guion", p0.enchufada === true && Boolean(p0.golpesDelGuion),
      JSON.stringify(p0.golpesDelGuion));
    // `vermin` recela de `human`: no muerde hasta que le pegas (el 82).
    await plantarse(pag, RATA);
    await pag.evaluate(() => window.probe.golpe.atacar(1.2));
    const vidaAntes = await vida(pag);
    const { c, t } = await aguantar(pag, RATA, 0, { evento: "game_damaged_other", cuantas: 2, hasta: (x) => cuantos(x, "bite1") >= 3 });
    const p1 = await partida(pag);
    const g = p1.golpesDelGuion ?? {};
    const lineas = await dicho(pag);
    console.log(`  rata: ${(t / 1000).toFixed(1)} s, golpes del guion ${JSON.stringify(g)}, recibidos ${JSON.stringify(c?.recibidos)}`);
    control("la IA le deja el ataque al guion: hay ataques «por guion» y eventos de animación entregados",
      g.atacaPorGuion >= 1 && g.eventos >= 1, `atacaPorGuion ${g.atacaPorGuion}, eventos ${g.eventos}`);
    control("su guion recibe `bite1`, que es el evento del modelo (giant_rat.mdl, `attack` f14 ev600)",
      cuantos(c, "bite1") >= 1, JSON.stringify(c?.recibidos));
    control("y algún mordisco entra (control: sin esto lo de abajo no mide nada)", g.entran >= 1, `entran ${g.entran}`);
    // EL CONTROL DEL DOBLE DAÑO: cada `game_damaged_other` del guion es un
    // `dodamage` del guion que entró. Si la IA siguiera tirando su dado,
    // habría `game_damaged_other` de más.
    control("NI UN GOLPE DE LA IA: los `game_damaged_other` del guion son exactamente los `dodamage` que entraron",
      cuantos(c, "game_damaged_other") === g.entran, `${cuantos(c, "game_damaged_other")} contra ${g.entran}`);
    const ultimo = c?.dodamage?.at(-1) ?? [];
    control("el `game_dodamage` lleva el tipo de su `dodamage`: «generic» sin quinto parámetro (npcscript.cpp:1116)",
      ultimo[4] === "generic", JSON.stringify(ultimo));
    const vidaDespues = await vida(pag);
    control("la vida del jugador baja", vidaDespues < vidaAntes, `${vidaAntes} → ${vidaDespues}`);
    control("«Giant Rat hits you» en la consola", lineas.some((l) => /Giant Rat hits you: 0\.4 damage\./.test(l)),
      lineas.filter((l) => /hits you/.test(l)).slice(-2).join(" / "));
    control("CONTROL NEGATIVO DEL VENENO: la rata no envenena", !lineas.some((l) => /poisoned/i.test(l)) && !(await activos(pag)).includes("DOT_poison"));
    await pag.close();
  }

  // ── 2. LA ARAÑA VENENOSA DE LAS CLOACAS ──────────────────────────────────
  {
    const pag = await pagina();
    await entrar(pag, "edanasewers");
    const ARANA = "monsters/spider_mini_poison";
    const n = await despierto(pag, ARANA, 30);
    control("la «Poisonous Spider» está fuera (su área la ha sacado)", n >= 0, `índice ${n}`);
    if (n < 0) throw new Error("sin araña venenosa no hay medida");
    const r0 = await costura(pag, ARANA, n);
    control("tiene guion con el cierre puesto", Boolean(r0?.conGuion && r0?.conCierre), JSON.stringify({ g: r0?.conGuion, c: r0?.conCierre }));
    const vidaAntes = await vida(pag);
    // Muy cerca: mide 20 de alto y su `ATTACK_RANGE 38` se mide desde sus
    // pies hasta el CENTRO del jugador, 36 más arriba (el 82).
    const { c, t } = await aguantar(pag, ARANA, n, {
      evento: "bite_dodamage", cuantas: 1, d: 0.3, segundos: 60,
      hasta: (x) => cuantos(x, "game_damaged_other") >= 1,
    });
    await pag.waitForTimeout(2500);
    const lineas = await dicho(pag);
    const efectos = await activos(pag);
    const heridas = await pag.evaluate(() => window.probe.veneno.heridas());
    const vidaDespues = await vida(pag);
    console.log(`  araña venenosa: ${(t / 1000).toFixed(1)} s, recibidos ${JSON.stringify(c?.recibidos)}, efectos ${efectos.join(", ")}, heridas ${heridas.length}`);
    control("muerde por su guion: `bite1` y, por el `dmgevent:bite`, `bite_dodamage` (giattack.cpp:2046-2058)",
      cuantos(c, "bite1") >= 1 && cuantos(c, "bite_dodamage") >= 1, JSON.stringify(c?.recibidos));
    control("y algún mordisco entra (el veneno apunta a `ent_laststruckbyme`, que sólo escribe un acierto)",
      cuantos(c, "game_damaged_other") >= 1, JSON.stringify(c?.recibidos));
    control("EL VENENO: «You have been poisoned!»", lineas.some((l) => /You have been poisoned!/.test(l)), lineas.slice(-4).join(" / "));
    control("el veneno lo firma la araña: «Poisonous Spider hits you: … poison damage.»",
      lineas.some((l) => /Poisonous Spider hits you: \d+\.\d poison damage\./.test(l)),
      lineas.filter((l) => /hits you/.test(l)).slice(-3).join(" / "));
    control("el mordisco va con su tipo: «… pierce damage.» (spider_base.script:34)",
      lineas.some((l) => /Poisonous Spider hits you: \d+\.\d pierce damage\./.test(l)),
      lineas.filter((l) => /hits you/.test(l)).slice(-3).join(" / "));
    control("y el veneno resta vida por su cuenta (`xdodamage` de base_dot)", heridas.some((h) => h.tipo === "poison_effect") && vidaDespues < vidaAntes,
      `${vidaAntes} → ${vidaDespues}, ${heridas.length} heridas`);
    await pag.close();
  }

  // ── 3. LA ARAÑA DE GATE CITY: muerde por su guion, y no envenena ─────────
  {
    const pag = await pagina();
    await entrar(pag, "gatecity");
    const ARANA = "monsters/spider";
    const n = await despierto(pag, ARANA, 30);
    control("hay una «Leaping Cave Spider» fuera", n >= 0, `índice ${n}`);
    if (n < 0) throw new Error("sin araña de Gate City");
    const { c, t } = await aguantar(pag, ARANA, n, { evento: "game_damaged_other", cuantas: 2, d: 0.9, segundos: 60 });
    const lineas = await dicho(pag);
    console.log(`  araña de Gate City: ${(t / 1000).toFixed(1)} s, recibidos ${JSON.stringify(c?.recibidos)}`);
    control("muerde por su guion: `frame_bite1` y `bite_dodamage` le llegan",
      cuantos(c, "frame_bite1") >= 1 && cuantos(c, "bite_dodamage") >= 1, JSON.stringify(c?.recibidos));
    control("con `pierce`: «Leaping Cave Spider hits you: … pierce damage.»",
      lineas.some((l) => /Leaping Cave Spider hits you: \d+\.\d pierce damage\./.test(l)),
      lineas.filter((l) => /hits you/.test(l)).slice(-2).join(" / "));
    // EL 93: el salto ya está portado (sondas/salto93.mjs), y en 60 s pegada
    // a ella puede saltarte encima y envenenarte. Lo que este control mide es
    // que el MORDISCO no envenena: si hay veneno, tiene que haber habido salto
    // (`spider_latch_hit` en el rastro de su guion, `probe.costura.de`).
    const envenenada = lineas.some((l) => /poisoned/i.test(l)) || (await activos(pag)).includes("DOT_poison");
    // EL 94: los saltos de TODAS las arañas grandes, no sólo de la que se mide.
    // Gate City tiene tres; pegado 60 s a una, otra puede saltarte encima (la
    // sonda del 93 vio pegarse a dos). Contando sólo ésta, el veneno de la otra
    // salía como «el mordisco envenena»: un rojo sin nada roto.
    const porArana = await pag.evaluate((g) => {
      const l = [];
      for (let k = 0; k < 8; k++) { const x = window.probe.costura.de(g, k); if (!x) break; l.push(x.rastro?.spider_latch_hit ?? 0); }
      return l;
    }, ARANA);
    const saltos = porArana.reduce((a, b) => a + b, 0);
    console.log(`  saltos que se pegaron, por araña (la medida es la ${n}): ${JSON.stringify(porArana)}`);
    control("CONTROL NEGATIVO: su mordisco NO envenena (no maneja `bite_dodamage`; su veneno es el salto)",
      !envenenada || saltos >= 1, `envenenada ${envenenada}, saltos que se pegaron ${saltos}`);
    await pag.close();
  }

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
