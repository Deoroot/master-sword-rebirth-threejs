// LA COSTURA DEL 91, JUGANDO: el guion del bicho se entera de sus golpes.
//
//   node sondas/costura91.mjs
//
// Hasta el 90 el guion de un goblin o de una rata no existía: `GuionDeNpc` se
// creaba la primera vez que alguien le hablaba, y a un goblin no le habla
// nadie. Desde el 91 los bichos con ficha de combate nacen con su guion y la
// IA portada le cuenta lo que el motor le contaría —`game_dodamage` tras cada
// golpe, `game_damaged`/`game_struck` al recibir, `game_death` al morir—, con
// lo que duplicaría a la IA cerrado y contado (`CIERRE_DE_BICHO`).
//
// Se entra POR EL MENÚ (CLAUDE.md §3), dos veces:
//
//   1. sala88, la rata del 88: muerde, y su guion recibe `game_dodamage` con
//      «1» o «0», y su anti-atasco (base_anti_stuck.script:386-400) mueve
//      `AS_MISS_COUNT` con ellos. Con control negativo: quieto a su lado y sin
//      pegarle, la rata recela y no muerde, y su guion no recibe nada.
//   2. gatecity, los goblins: uno que te ataca recibe `game_dodamage`; otro,
//      lejos, tiene guion y no recibe ninguno (el contador no sube solo).
//
// Lo que se lee es lo que el GUION ha recibido (`probe.costura`), no lo que la
// IA cree que ha mandado.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PORT = 5391 + 100;
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
const plantarse = (pag, guion, n = 0, d = 1.0) => pag.evaluate(({ guion, n, d }) => {
  const r = window.probe.ia.bicho(guion, n);
  if (!r) return null;
  window.probe.mundo.poner(r.donde[0] - d, r.donde[1] + 0.1, r.donde[2]);
  window.probe.mundo.mirar(r.donde[0], r.donde[1] + 0.2, r.donde[2]);   // TRES números (el 78)
  return r;
}, { guion, n, d });

const costura = (pag, guion, n = 0) => pag.evaluate(({ guion, n }) => window.probe.costura.de(guion, n), { guion, n });
const vida = (pag) => pag.evaluate(() => window.probe.emociones.vitales()?.vida ?? null);
const cuantos = (c, e) => c?.recibidos?.[e] ?? 0;

try {
  // ── 1. LA RATA DE SALA88 ──────────────────────────────────────────────────
  const pag = await pagina();
  await entrar(pag, "sala88");
  const RATA = "monsters/giantrat";
  await pag.waitForTimeout(1000);
  const p0 = await pag.evaluate(() => window.probe.costura.partida());
  control("la costura está enchufada a la manada", p0.enchufada === true, JSON.stringify(p0));
  const r0 = await costura(pag, RATA);
  control("la rata TIENE guion sin que nadie le haya hablado, y con el cierre puesto",
    Boolean(r0?.conGuion && r0?.conCierre), r0 ? `guion ${r0.conGuion}, cierre ${r0.conCierre}` : "no hay rata");

  // CONTROL NEGATIVO: quieto a su lado, sin pegarle. `vermin` recela de
  // `human`: no muerde por verte (el 82), así que no hay golpe que contar.
  await plantarse(pag, RATA);
  const quieto0 = await costura(pag, RATA);
  for (let k = 0; k < 6; k++) { await pag.waitForTimeout(500); await plantarse(pag, RATA); }
  const quieto1 = await costura(pag, RATA);
  control("CONTROL NEGATIVO: sin provocarla, 3 s a su lado y su guion no recibe ningún `game_dodamage`",
    cuantos(quieto1, "game_dodamage") === cuantos(quieto0, "game_dodamage"),
    `${cuantos(quieto0, "game_dodamage")} → ${cuantos(quieto1, "game_dodamage")}`);

  // Un espadazo: el guion recibe `game_damaged` y `game_struck`.
  const golpe = await pag.evaluate(() => {
    const S = window.probe;
    const a = S.ia.bicho("monsters/giantrat").vida;
    S.golpe.atacar(1.2);
    return { a, b: S.ia.bicho("monsters/giantrat").vida };
  });
  const tras = await costura(pag, RATA);
  control("el espadazo le quita vida (control: el golpe ha entrado)", golpe.b < golpe.a, `${golpe.a} → ${golpe.b}`);
  control("y su guion recibe `game_damaged` y `game_struck`, uno cada uno",
    cuantos(tras, "game_damaged") === 1 && cuantos(tras, "game_struck") === 1, JSON.stringify(tras.recibidos));
  control("lo que su `game_struck` haría por la IA está cerrado y contado",
    (tras.cerrados.npcatk_target ?? 0) >= 1 && (tras.cerrados.npcatk_retaliate ?? 0) >= 1, JSON.stringify(tras.cerrados));

  // Ahora muerde. Se espera a que entre UN mordisco Y haya fallado alguno.
  const vidaAntes = await vida(pag);
  let c = tras, t = 0;
  const unos = (x) => (x?.dodamage ?? []).filter((p) => p[0] === "1").length;
  while (t < 30000) {
    await pag.waitForTimeout(500); t += 500;
    await plantarse(pag, RATA);
    c = await costura(pag, RATA);
    if (cuantos(c, "game_dodamage") >= 4) break;
  }
  const vidaDespues = await vida(pag);
  control("la rata muerde: su guion recibe `game_dodamage`", cuantos(c, "game_dodamage") >= 1,
    `${cuantos(c, "game_dodamage")} en ${(t / 1000).toFixed(1)} s`);
  const ultimo = c.dodamage.at(-1) ?? [];
  control("con los parámetros del motor: el asa del jugador, dos vectores, «generic» y el daño o «0»",
    ultimo.length === 6 && /^\(.*,.*,.*\)$/.test(ultimo[2]) && ultimo[4] === "generic" &&
      (ultimo[0] === "1" ? ultimo[5] === " 0.4 damage." : ultimo[5] === "0"),
    JSON.stringify(ultimo));
  // (Sin control de «los "1" son los que quitaron vida»: con la regeneración
  // del jugador y su parry de por medio, el número exacto no se puede leer
  // desde aquí sin recalcularlo. Lo mide la prueba de Node, con la defensa
  // fijada; aquí se imprime.)
  console.log(`  vida ${vidaAntes} → ${vidaDespues}; «1» entre los últimos rastros: ${unos(c)}`);
  // EL EFECTO EN EL GUION DEL MOD: `AS_MISS_COUNT` sigue al último PARAM1.
  control("EL EFECTO: el anti-atasco del guion de la rata lleva la cuenta (0 tras acertar, ≥1 tras fallar)",
    ultimo[0] === "1" ? String(c.fallosSeguidos) === "0" : Number(c.fallosSeguidos) >= 1,
    `último PARAM1 ${ultimo[0]}, AS_MISS_COUNT ${c.fallosSeguidos}`);

  // Y morir: `game_predeath`, `game_death`, y su `playanim` de morir absorbido.
  for (let k = 0; k < 20; k++) {
    const viva = await pag.evaluate(() => !window.probe.ia.bicho("monsters/giantrat")?.muerto);
    if (!viva) break;
    await plantarse(pag, RATA);
    await pag.evaluate(() => window.probe.golpe.atacar(1.2));
  }
  const muerta = await costura(pag, RATA);
  control("al morir: `game_predeath` y `game_death`, una vez",
    !muerta.vivo && cuantos(muerta, "game_predeath") === 1 && cuantos(muerta, "game_death") === 1,
    `viva ${muerta.vivo}, ${JSON.stringify(muerta.recibidos)}`);
  control("el aviso a los aliados del guion, cerrado (lo da la IA)", (muerta.cerrados.npcatk_alert_all_allies ?? 0) >= 1,
    JSON.stringify(muerta.cerrados));
  control("y su `playanim` de morir, absorbido: el cuerpo lo mueve la IA",
    Object.keys(muerta.absorbidos).some((k) => k.startsWith("animar")), JSON.stringify(muerta.absorbidos));
  await pag.close();

  // ── 2. LOS GOBLINS DE GATE CITY ───────────────────────────────────────────
  const pg = await pagina();
  await entrar(pg, "gatecity");
  const GOB = "monsters/goblin";
  // Las fichas de un área salen a los 3 s (aparecer.js).
  let despiertos = [];
  for (let k = 0; k < 30 && despiertos.length < 2; k++) {
    await pg.waitForTimeout(500);
    despiertos = await pg.evaluate((g) => {
      const fuera = [];
      for (let n = 0; n < 16; n++) {
        const c = window.probe.costura.de(g, n);
        if (!c) break;
        if (!c.dormido && c.vivo) fuera.push(n);
      }
      return fuera;
    }, GOB);
  }
  control("hay goblins fuera (las áreas los han sacado)", despiertos.length >= 2, `despiertos: ${despiertos.join(", ")}`);
  // EL TESTIGO NEGATIVO ES EL MÁS LEJANO, y se elige ANTES de pelear. La
  // primera pasada cogió el segundo de la lista, que estaba a 3,4 m y entró en
  // la pelea: el control «pasaba» por una excepción escrita para ese caso, o
  // sea que no medía nada (CLAUDE.md §4). Si no hay ninguno lejos, el control
  // no se da por bueno: se queda en rojo y lo dice.
  const cerca = despiertos[0];
  const lejos = await pg.evaluate(({ g, a, lista }) => {
    const x = window.probe.ia.bicho(g, a);
    let mejor = null, d = -1;
    for (const n of lista) {
      if (n === a) continue;
      const y = window.probe.ia.bicho(g, n);
      const e = Math.hypot(x.donde[0] - y.donde[0], x.donde[2] - y.donde[2]);
      if (e > d) { d = e; mejor = n; }
    }
    return mejor;
  }, { g: GOB, a: cerca, lista: despiertos });
  // El bucle no se pide al nacer sino 0,75 s después: `callevent
  // NPC_SPAWN_PRED2 npcatk_hunt` con `const NPC_SPAWN_PRED2 0.75`
  // (base_npc_attack_new.script:92 y :148). La primera pasada lo leyó antes
  // de tiempo y salió roja con el cierre bien: se espera a que el guion lo
  // pida, con un tope de cuatro veces ese plazo.
  await pg.waitForFunction(({ g, n }) => (window.probe.costura.de(g, n)?.cerrados?.npcatk_hunt ?? 0) >= 1,
    { g: GOB, n: cerca }, { timeout: 3000 }).catch(() => {});
  const g0 = await costura(pg, GOB, cerca);
  control("un goblin nace con su guion, y su bucle de caza del guion está cerrado",
    Boolean(g0?.conGuion) && (g0?.cerrados?.npcatk_hunt ?? 0) >= 1, JSON.stringify(g0?.cerrados ?? null));
  const lejos0 = await costura(pg, GOB, lejos);
  let gc = g0; let tg = 0;
  while (tg < 20000 && cuantos(gc, "game_dodamage") < 2) {
    await plantarse(pg, GOB, cerca, 1.2);
    await pg.waitForTimeout(500); tg += 500;
    gc = await costura(pg, GOB, cerca);
  }
  control("el goblin que te ataca: su guion recibe `game_dodamage`", cuantos(gc, "game_dodamage") >= 1,
    `${cuantos(gc, "game_dodamage")} en ${(tg / 1000).toFixed(1)} s; últimos ${JSON.stringify(gc.dodamage.slice(-2))}`);
  const lejos1 = await costura(pg, GOB, lejos);
  const dLejos = await pg.evaluate(({ g, a, b }) => {
    const x = window.probe.ia.bicho(g, a), y = window.probe.ia.bicho(g, b);
    return Math.hypot(x.donde[0] - y.donde[0], x.donde[2] - y.donde[2]);
  }, { g: GOB, a: cerca, b: lejos });
  control("CONTROL NEGATIVO: el goblin más lejano tiene guion y, sin pelear, no recibe ninguno",
    dLejos >= 15 && Boolean(lejos1?.conGuion) && cuantos(lejos1, "game_dodamage") === cuantos(lejos0, "game_dodamage"),
    `${cuantos(lejos0, "game_dodamage")} → ${cuantos(lejos1, "game_dodamage")}, a ${dLejos.toFixed(1)} m del que pelea` +
      (dLejos < 15 ? " (DEMASIADO CERCA: el testigo no sirve, y por eso es rojo)" : ""));
  const pp = await pg.evaluate(() => window.probe.costura.partida());
  control("ningún guion ha reventado dentro de la costura", pp.fallos === 0, JSON.stringify(pp));
  await pg.close();

  const bien = controles.filter((x) => x.bien).length;
  console.log(`\n  CONTROLES`);
  for (const x of controles) console.log(`  ${x.bien ? "ok  " : "MAL "} ${x.que.padEnd(70)} ${x.detalle}`);
  console.log(`\n  ${bien} de ${controles.length} en verde`);
  console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}\n`);
  await nav.close();
  matar(dev);
  process.exit(bien === controles.length && errores.length === 0 ? 0 : 1);
} catch (e) {
  // UNA CAÍDA ES UNA ROJA, NO UNA NOTA AL PIE — la lección del 65.
  console.log(`\n  LA SONDA SE HA CAÍDO: ${e.message}`);
  console.log(`  llevaba ${controles.filter((x) => x.bien).length} de ${controles.length} controles corridos`);
  for (const x of controles) console.log(`  ${x.bien ? "ok  " : "MAL "} ${x.que.padEnd(70)} ${x.detalle}`);
  console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);
  try { await nav.close(); } catch {}
  matar(dev);
  process.exit(1);
}
