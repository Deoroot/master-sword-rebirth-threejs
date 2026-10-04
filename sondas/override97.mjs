// EL 97: `[override]` REHORNEADO, MEDIDO CONTRA BICHOS DE VERDAD.
//
//   npm run sonda:override97                 (el horneado de ahora)
//   npm run sonda:override97 -- --antes <guiones.json viejo de Gate City>
//
// Con `--antes` la página de Gate City recibe OTRO `guiones.json` —uno
// horneado antes del 97— por `page.route`, sin tocar `build/`: el árbol es
// compartido y otra sesión puede estar midiendo Gate City a la vez. Es el
// control de que el instrumento VE las copias de antes (CLAUDE.md §4).
//
// Lo que se mide, por el camino del jugador (menú, personaje, espada):
//
//   1. La araña gigante de Gate City (`monsters/spider`): blandiendo de verdad
//      hasta que para golpes, cuántas veces corre `game_parry` por parada y
//      cuántas líneas «Your attack was …» salen por cada una.
//   2. La araña escupidora (`monsters/spider_spitting`): pegado a ella hasta
//      que muerde, cuántos `xdodamage` pide su guion por cada `bite1` que le
//      manda el modelo (`gspider.mdl`).
//   3. EL CONTROL POSITIVO DE LA MISMA PASADA: el esqueleto venenoso de
//      `gertenheld_forest2`, que para (parry 40) y NO anula `game_parry`. Su
//      guion sí dice «Your attack was parried!» —el de la plantilla,
//      base_monster_shared.script:472-475—, así que ahí la consola tiene que
//      leer UNA línea por parada. Sin esto, el «cero líneas» de la araña sería
//      un cero sin control (el 37): no se sabría si el guion calla o si el
//      instrumento no oye.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { liberarPuerto, esperarApariciones, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const iAntes = process.argv.indexOf("--antes");
const ANTES = iAntes > 0 ? process.argv[iAntes + 1] : null;

const PORT = 5622;   // el 98: era 5497, compartido con otra sonda (test/puertos98.test.mjs)
const liberados = liberarPuerto(PORT);
if (liberados?.length) console.log(`  (puerto ${PORT} liberado)`);
// Se espera a que conteste, no un plazo fijo: con varias sesiones en la misma
// máquina, Vite tarda en arrancar lo que quiera (el 98: `arrancarVite`).
const dev = await arrancarVite(PORT);
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

const nav = await chromium.launch();
const errores = [];
const controles = [];
const control = (que, bien, detalle = "") => { controles.push({ que, bien, detalle }); return bien; };

/** Una página nueva, sin recarga en caliente (sondas/mordisco92.mjs). */
async function pagina() {
  const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
  pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
  // El aviso del 95: `pageerror` no ve un módulo que no compila; la consola sí.
  pag.on("console", (m) => { if (m.type() === "error" && /SyntaxError|is not defined|externalized/.test(m.text())) errores.push(m.text().slice(0, 200)); });
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

async function entrar(pag, mapa, script) {
  // UN reintento, y dicho: con varias sesiones en la máquina, el primer
  // `goto` de la segunda página se ha pasado de sus 30 s alguna vez. Un
  // segundo fallo sí es una roja.
  try { await entrarPorElMenu(pag, PORT, { mapa }); }
  catch (e) { console.log(`  (reintento al entrar en ${mapa}: ${String(e).slice(0, 80)})`); await entrarPorElMenu(pag, PORT, { mapa }); }
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
  await pag.waitForFunction(() => window.probe.sesion.estado() === "jugando", null, { timeout: 60000 });
  await pag.waitForFunction(() => window.probe.golpe.estado.triangulos > 0, null, { timeout: 60000 }).catch(() => {});
  await pag.evaluate(() => window.probe.vivo.congelarPaseo(true));
  await esperarApariciones(pag);
  await pag.waitForFunction((s) => window.probe.reaccion.censo().some((c) => c.script === s), script, { timeout: 60000 }).catch(() => {});
  const censo = await pag.evaluate(() => window.probe.reaccion.censo());
  return { censo, indice: (c) => censo.filter((x) => x.script === c.script).indexOf(c) };
}

/**
 * Blandir contra un bicho hasta que pare `hasta` golpes, y contar.
 *
 * LAS LÍNEAS SE CUENTAN POR TANDAS, CON UNA MARCA DELANTE. La consola es un
 * anillo de 128 (`MAX_LINEAS`, src/play/hud.js) y 240 s de mandobles lo llenan
 * muchas veces: la primera versión contaba «cuántas hay ahora menos cuántas
 * había» y dio 0,00 por parada con el horneado de antes Y con el de ahora — un
 * contador que satura mide su tope, no lo que pasa (el 67, otra vez). Cada
 * tanda de 3 s escribe una marca y se cuenta sólo lo que viene detrás.
 */
async function medirParry(pag, c, k, { hasta = 12, tandas = 80 } = {}) {
  // DOS CONTADORES DE PARADAS, y no sobra ninguno. `suyas` son las de ESTE
  // bicho (`i.reaccion.parados`), contra las que se mide su guion; `todas`
  // las de la partida, contra las que se miden las LÍNEAS, que no dicen de
  // quién son. La primera versión lo medía todo contra `todas` y salía «9 de
  // 11»: la segunda araña de Gate City se acerca cazando, el mandoble le
  // entra a ella, y la consola habla de las dos.
  const leer = () => pag.evaluate(({ s, k, n }) => {
    const r = window.probe.costura.de(s, k);
    return { conGuion: r?.conGuion, rastro: r?.corridos?.game_parry ?? 0, recibidos: r?.recibidos?.game_parry ?? 0,
      suyas: window.probe.reaccion.quien(n)?.parados ?? 0, todas: window.probe.reaccion.estado.parados };
  }, { s: c.script, k, n: c.n });
  await pag.evaluate((n) => window.probe.reaccion.vida(n, 100000), c.n);
  const r0 = await leer();
  let lineas = 0, golpes = 0, puesto = null, fin = r0;
  for (let tanda = 0; tanda < tandas; tanda++) {
    const marca = `#override97 ${tanda}`;
    const t = await pag.evaluate(({ n, marca }) => {
      window.probe.costura.curar();   // el esqueleto pega y envenena: que no muera el que mide
      const q = window.probe.reaccion.quien(n);
      let puesto = null;
      for (const d of [0.5, 0.6, 0.4, 0.7, 0.8, 0.3]) {
        window.probe.mundo.poner(q.donde[0] + d, q.donde[1], q.donde[2]);
        window.probe.mundo.mirar(q.donde[0], q.donde[1] + 0.25, q.donde[2]);   // TRES números (el 78)
        if (window.probe.golpe.objetivo()) { puesto = d; break; }
      }
      window.probe.hud.suceso("normal", marca);
      const r = window.probe.golpe.atacar(3);
      return { puesto, golpes: r.golpes };
    }, { n: c.n, marca });
    const todo = await pag.evaluate(() => window.probe.misiones.dicho());
    const desde = todo.lastIndexOf(`normal: ${marca}`);
    if (desde < 0) throw new Error(`la marca ${marca} no está en la consola: la tanda escribe más de lo que cabe`);
    lineas += todo.slice(desde + 1).filter((l) => /Your attack was/.test(l)).length;
    golpes += t.golpes ?? 0; puesto = t.puesto ?? puesto;
    fin = await leer();
    if (fin.suyas - r0.suyas >= hasta) break;
  }
  return {
    conGuion: r0.conGuion, puesto, golpes, lineas,
    parados: fin.suyas - r0.suyas, todas: fin.todas - r0.todas, recibidos: fin.recibidos - r0.recibidos, corridos: fin.rastro - r0.rastro,
  };
}

const porParada = (m) => (m.todas ? (m.lineas / m.todas).toFixed(2) : "—");

try {
  // ── 1 y 2. GATE CITY ────────────────────────────────────────────────────
  {
    const pag = await pagina();
    let servidoViejo = 0;
    if (ANTES) {
      const cuerpo = readFileSync(ANTES);
      await pag.route("**/gatecity/guiones.json*", (r) => { servidoViejo++; r.fulfill({ status: 200, contentType: "application/json", body: cuerpo }); });
    }
    const { censo, indice } = await entrar(pag, "gatecity", "monsters/spider");
    if (ANTES) control("se ha servido el `guiones.json` de antes", servidoViejo > 0, `${servidoViejo} peticiones`);

    const arana = censo.find((c) => c.script === "monsters/spider");
    control("hay araña gigante en Gate City", Boolean(arana), `${censo.length} bichos en el censo`);
    if (!arana) throw new Error("sin araña no hay medida");
    const m = await medirParry(pag, arana, indice(arana));
    console.log(`  araña gigante: a ${m.puesto} m, ${m.golpes} mandobles, ${m.parados} parados (${m.todas} en la partida); ` +
      `game_parry recibido ${m.recibidos}, corrido ${m.corridos}; «Your attack was …» ${m.lineas} (${porParada(m)} por parada)`);
    control("su guion está vivo (si no, lo de abajo no lo corre nadie)", m.conGuion === true);
    control("blandiendo de verdad, la araña para alguno", m.parados > 0, `${m.parados}`);
    control("cada parada le llega a su guion por la costura", m.recibidos === m.parados, `${m.recibidos} de ${m.parados}`);
    if (ANTES) {
      control("ANTES: tres `game_parry` por parada", m.corridos === 3 * m.recibidos, `${m.corridos} por ${m.recibidos}`);
      control("ANTES: una «Your attack was dodged!» por parada, la del guion de la plantilla", m.lineas === m.todas, `${m.lineas} en ${m.todas}`);
    } else {
      control("AHORA: un `game_parry` por parada, el suyo (spider.script:63-67)", m.corridos === m.recibidos, `${m.corridos} por ${m.recibidos}`);
      control("AHORA: ninguna «Your attack was …»: su `[override]` no la dice", m.lineas === 0 && m.todas > 0, `${m.lineas} en ${m.todas}`);
    }

    const escupidoras = censo.filter((c) => c.script === "monsters/spider_spitting");
    control("hay arañas escupidoras", escupidoras.length > 0, `${escupidoras.length}`);
    let mejor = null;
    for (const c of escupidoras) {
      const k = indice(c);
      const ini = await pag.evaluate((k) => window.probe.costura.de("monsters/spider_spitting", k), k);
      if (!ini?.vivo || ini.dormido) continue;
      await pag.evaluate((n) => window.probe.reaccion.vida(n, 100000), c.n);   // que los mandobles no la maten
      const base = { bite1: ini.recibidos?.bite1 ?? 0, pedidos: ini.dano?.pedidos ?? 0 };
      let fin = ini;
      for (let t = 0; t < 60000; t += 400) {
        await pag.evaluate(({ k, d }) => {
          window.probe.costura.curar();
          const r = window.probe.costura.de("monsters/spider_spitting", k);
          if (!r?.donde) return;
          window.probe.mundo.poner(r.donde[0] - d, r.donde[1] + 0.1, r.donde[2]);
          window.probe.mundo.mirar(r.donde[0], r.donde[1] + 0.2, r.donde[2]);
        }, { k, d: 0.8 });
        // Un golpe para empezar: si recela no muerde hasta que le pegas (el 82).
        // Y otro cada 4 s mientras no haya mordido: un primer mandoble que no
        // entra (se ha movido, o lo para) dejaba la medida en «0 bite1» una
        // pasada de cada tres.
        if (t % 4000 === 0 && (fin?.recibidos?.bite1 ?? 0) === base.bite1) await pag.evaluate(() => window.probe.golpe.atacar(1.2));
        await pag.waitForTimeout(400);
        fin = await pag.evaluate((k) => window.probe.costura.de("monsters/spider_spitting", k), k);
        if (!fin?.vivo || (fin.recibidos?.bite1 ?? 0) - base.bite1 >= 3) break;
      }
      const bite1 = (fin?.recibidos?.bite1 ?? 0) - base.bite1;
      const pedidos = (fin?.dano?.pedidos ?? 0) - base.pedidos;
      console.log(`  escupidora ${k}: bite1 ${bite1}, xdodamage pedidos ${pedidos}, anim ${fin?.anim}, recibidos ${JSON.stringify(fin?.recibidos)}`);
      if (bite1 > 0) { mejor = { k, bite1, pedidos }; break; }
    }
    control("alguna escupidora ha mordido (control: sin `bite1` no hay nada que contar)", Boolean(mejor), JSON.stringify(mejor));
    if (mejor) {
      if (ANTES) control("ANTES: dos `xdodamage` por `bite1`", mejor.pedidos === 2 * mejor.bite1, `${mejor.pedidos} por ${mejor.bite1}`);
      else control("AHORA: uno por `bite1` (spider_spitting.script:87-100)", mejor.pedidos === mejor.bite1, `${mejor.pedidos} por ${mejor.bite1}`);
    }
    await pag.close();
  }

  // ── 3. EL CONTROL POSITIVO: un bicho cuyo guion SÍ lo dice ──────────────
  {
    const pag = await pagina();
    const S = "monsters/skeleton_poison_random";
    const { censo, indice } = await entrar(pag, "gertenheld_forest2", S);
    const esq = censo.find((c) => c.script === S);
    control("hay esqueleto venenoso en gertenheld_forest2, con parry", Boolean(esq) && esq.parry > 0, `parry ${esq?.parry}`);
    if (!esq) throw new Error("sin esqueleto no hay control positivo");
    const m = await medirParry(pag, esq, indice(esq), { hasta: 8 });
    console.log(`  esqueleto: a ${m.puesto} m, ${m.golpes} mandobles, ${m.parados} parados (${m.todas} en la partida); ` +
      `game_parry recibido ${m.recibidos}, corrido ${m.corridos}; «Your attack was …» ${m.lineas} (${porParada(m)} por parada)`);
    control("CONTROL POSITIVO: el esqueleto para alguno", m.parados > 0, `${m.parados}`);
    control("y su guion corre UN `game_parry` por parada (no lo anula, pero tampoco lo duplica)", m.corridos === m.recibidos && m.recibidos === m.parados,
      `${m.corridos} corridos, ${m.recibidos} recibidos, ${m.parados} parados`);
    control("y la consola lee UNA «Your attack was …» por parada: la del guion, sin el relevo de main.js encima",
      m.lineas === m.todas, `${m.lineas} en ${m.todas}`);
    await pag.close();
  }
} catch (e) {
  // El 65: una caída es una roja, no una nota al pie.
  control("la sonda llega al final", false, String(e).slice(0, 300));
}

console.log(`\n  CONTROLES${ANTES ? " (Gate City con el horneado de ANTES)" : ""}`);
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(70)} ${c.detalle}`);
const mal = controles.filter((c) => !c.bien);
console.log(`\n  ${controles.length - mal.length} de ${controles.length} en verde`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);
await nav.close(); matar(dev);
process.exit(mal.length || errores.length ? 1 : 0);
