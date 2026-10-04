// EL 98: UN BICHO ATURDE AL JUGADOR POR SU CUENTA, JUGANDO.
//
//   npm run sonda:aturdir98
//
// La 97 (sondas/aturdir97.mjs) aplicaba el aturdimiento por la puerta de
// `applyeffect` a mano, y lo decía: en estos mapas ningún bicho lo hacía. Ésta
// NO aplica nada. Entra POR EL MENÚ en Gate City (CLAUDE.md §3), se planta al
// lado de un zombi enano que puede saltar (`ATTACK2_CHANCE` > 0,
// dwarf_zombie_random.script:220-268) y ESPERA: el zombi ataca con `attack`,
// su `attack_1` sortea el salto (:303), la IA pone `attack2` porque el guion lo
// pide (`ANIM_ATTACK`, src/play/manada.js `_animDeAtaque`), el evento 600 del
// fotograma 9 llama a `attack_2` y éste aplica `effects/debuff_stun $rand(2,8)`
// al jugador (:309-315).
//
// Lo que se mide es el EFECTO, con la W, la barra y el botón de verdad, en el
// mismo sitio y rumbo que el control positivo (el sitio de aparecer, lejos
// del zombi):
//
//   1. LIBRE: anda lo suyo, salta y el botón ataca. Control positivo de todo.
//   2. EL ZOMBI ATACA SOLO: `attack_1` llega a su guion (control positivo de
//      que ataca) y, después, `attack_2` (el salto).
//   3. ATURDIDO POR ÉL: el bucle lee `movespeed 45`/`canattack 0`/`canjump 0`,
//      la consola dice «You have been stunned!», y ningún aturdimiento antes
//      del primer salto.
//   4. Con el aturdimiento puesto: anda a 45 u/s, no salta, el botón no ataca.
//      El aturdimiento dura `$rand(2,8)` s; cada medida se repite hasta que
//      cabe entera DENTRO de uno (se comprueba antes y después).
//   5. Se le pasa, y vuelve a andar lo suyo.
//
// Andamio dicho: la vida del personaje se pone a 5000 en cada vuelta (el hacha
// grande quita 40 y 100 y un personaje nuevo tiene menos de 20); no toca nada
// de lo que se mide.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

// 5898: ninguna otra sonda lo usa (grep de `PORT` en sondas/, el 98).
const PORT = 5898;
const liberados = liberarPuerto(PORT);
if (liberados?.length) console.log(`  (puerto ${PORT} liberado)`);
const dev = await arrancarVite(PORT, { tope: 90_000 });
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

const nav = await chromium.launch();
const errores = [];
const consola = [];
const controles = [];
// LOS DECLARADOS, contados antes de empezar (el 65).
const DECLARADOS = 18;
const control = (que, bien, detalle = "") => { controles.push({ que, bien, detalle }); return bien; };

const ZOMBIS = ["monsters/dwarf_zombie_bigaxe", "monsters/dwarf_zombie_random", "monsters/dwarf_zombie_sword"];

try {
  const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
  pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
  pag.on("console", (m) => {
    if (m.type() !== "error") return;
    consola.push(m.text().slice(0, 200));
    if (/SyntaxError|is not defined|Cannot read/.test(m.text())) errores.push(m.text().slice(0, 200));
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

  const U = await pag.evaluate(() => window.probe.mundo.unidadesPorMetro());
  const pies0 = await pag.evaluate(() => window.probe.mundo.donde().pies);
  const vidaAlta = () => pag.evaluate(() => { const p = window.probe.sesion.personaje; if (p) p.vida = 5000; });
  const trabas = () => pag.evaluate(() => window.probe.trabas.ultimas);
  const dicho = () => pag.evaluate(() => (window.probe.misiones.dicho?.() ?? [])
    .map((l) => (typeof l === "string" ? l : l.texto ?? "")).map((l) => l.replace(/^[a-z]+: /, "").trimEnd()));

  /** Al sitio de aparecer, mirando con el rumbo `a`. TRES números a `mirar` (el 78). */
  const alSitio = (a) => pag.evaluate(({ p, a }) => {
    window.probe.mundo.poner(p[0], p[1] + 0.05, p[2]);
    window.probe.mundo.mirar(p[0] + Math.cos(a) * 10, p[1] + 1.6, p[2] + Math.sin(a) * 10);
  }, { p: pies0, a });

  /** ANDAR con la W: 0,6 s para asentarse y 0,8 s medidos con el reloj de la página. */
  async function andar(a) {
    await alSitio(a);
    await pag.waitForTimeout(200);
    await pag.keyboard.down("KeyW");
    await pag.waitForTimeout(600);
    const x = await pag.evaluate(() => ({ p: [...window.probe.player.feet], t: performance.now() }));
    await pag.waitForTimeout(800);
    const y = await pag.evaluate(() => ({ p: [...window.probe.player.feet], t: performance.now() }));
    await pag.keyboard.up("KeyW");
    return (Math.hypot(y.p[0] - x.p[0], y.p[2] - x.p[2]) * U) / ((y.t - x.t) / 1000);
  }
  /** SALTAR: la altura máxima de los pies en los 700 ms después de la barra. */
  async function saltar(a) {
    await alSitio(a);
    // ASENTARSE ANDANDO, no esperando. Justo después de `poner`, en el sitio
    // de aparecer de Gate City, el jugador se queda flotando 13 cm sobre el
    // suelo (−14,48 contra −14,61) con `grounded` a uno, y el primer paso del
    // salto no sube entero: la regla «techo» de `Player.step` (src/play/
    // player.js, `applied.y < mover[1] × 0,5`) le pone la velocidad a cero y
    // el salto se queda en 0,03-0,16 m. Medido fotograma a fotograma: 268
    // u/s hacia arriba y en el fotograma siguiente −67. En cuanto anda un
    // paso, salta 1,0-1,25 m las seis de seis. La integración del 98 lo vio
    // rojo tres veces seguidas (17/18); esta sonda, una (−0,13 m). Es un
    // hueco del juego tras un teletransporte —ver doc/ATURDIR_98.md §7—, y
    // aquí se esquiva igual en el control positivo que en el negativo.
    await pag.waitForTimeout(300);
    await pag.keyboard.down("KeyW");
    await pag.waitForTimeout(300);
    await pag.keyboard.up("KeyW");
    await pag.waitForTimeout(500);
    const y0 = await pag.evaluate(() => window.probe.player.feet[1]);
    const medir = pag.evaluate(() => new Promise((listo) => {
      let max = -Infinity; const t0 = performance.now();
      const uno = () => { max = Math.max(max, window.probe.player.feet[1]); if (performance.now() - t0 < 700) requestAnimationFrame(uno); else listo(max); };
      requestAnimationFrame(uno);
    }));
    await pag.keyboard.down("Space");
    await pag.waitForTimeout(150);
    await pag.keyboard.up("Space");
    return (await medir) - y0;
  }
  /** ATACAR con el botón: ¿llega a `atacando`? */
  async function atacar(a) {
    await alSitio(a);
    await pag.mouse.move(600, 400);
    await pag.mouse.down();
    await pag.waitForTimeout(250);
    const r = await pag.evaluate(() => Boolean(window.probe.golpe.estado.atacando));
    await pag.mouse.up();
    return r;
  }

  // ── 1. LIBRE, en el sitio de aparecer ──────────────────────────────────
  // El rumbo con más camino libre de ocho: Gate City no es un pasillo.
  let rumbo = 0, libre = -1;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const us = await andar(a);
    if (us > libre) { libre = us; rumbo = a; }
    if (us > 155) break;
  }
  console.log(`  libre: ${libre.toFixed(1)} u/s, rumbo ${(rumbo * 180 / Math.PI).toFixed(0)}°`);
  control("CONTROL POSITIVO: libre anda lo de un personaje nuevo (150-175 u/s)", libre > 150 && libre < 175, `${libre.toFixed(1)} u/s`);
  const saltoLibre = await saltar(rumbo);
  control("CONTROL POSITIVO: libre salta (más de 0,8 m)", saltoLibre > 0.8, `${saltoLibre.toFixed(2)} m`);
  const atacaLibre = await atacar(rumbo);
  await pag.waitForTimeout(1200);
  control("CONTROL POSITIVO: libre, el botón empieza un ataque", atacaLibre === true, String(atacaLibre));
  const t0 = await trabas();
  control("y el bucle no lee ninguna traba", Boolean(t0) && t0.porcentaje === 0 && !t0.noAtacar && !t0.noSaltar, JSON.stringify(t0));

  // ── 2. UN ZOMBI QUE PUEDA SALTAR ───────────────────────────────────────
  const de = (guion, n) => pag.evaluate(({ guion, n }) => window.probe.costura.de(guion, n), { guion, n });
  let zombi = null;
  for (let vuelta = 0; vuelta < 120 && !zombi; vuelta++) {
    let mejor = null;
    for (const g of ZOMBIS) {
      for (let n = 0; n < 20; n++) {
        const c = await de(g, n);
        if (!c) break;
        const p = Number(c.vars?.ATTACK2_CHANCE);
        if (!c.dormido && c.vivo && c.conGuion && p > 0 && (!mejor || p > mejor.p)) mejor = { g, n, p, id: c.id };
      }
    }
    if (mejor) zombi = mejor; else await pag.waitForTimeout(500);
  }
  control("hay un zombi enano fuera, con guion y `ATTACK2_CHANCE` > 0", Boolean(zombi), JSON.stringify(zombi));
  if (!zombi) throw new Error("sin zombi que salte no hay medida");
  console.log(`  zombi: ${zombi.g} #${zombi.n}, ATTACK2_CHANCE ${zombi.p}`);

  /** Al lado del zombi, mirándolo, desde un sitio desde el que él te ve (el 94). */
  const plantarse = () => pag.evaluate(({ g, n }) => {
    const c = window.probe.costura.de(g, n);
    if (!c?.donde) return null;
    const s = window.probe.costura.sitioALaVista(c.id, 1.0);
    if (s) window.probe.mundo.poner(s[0], s[1] + 0.05, s[2]);
    else window.probe.mundo.poner(c.donde[0] - 1.0, c.donde[1] + 0.1, c.donde[2]);
    window.probe.mundo.mirar(c.donde[0], c.donde[1] + 1.0, c.donde[2]);
    return Boolean(s);
  }, zombi);

  /**
   * ESPERAR A QUE TE ATURDA, al lado del zombi. Devuelve lo que había al
   * detectarlo, o `null` si en `segundos` no pasó. Sin tocar nada del juego
   * salvo la vida.
   */
  let ultimaEspera = null;
  async function esperarAturdido(segundos) {
    await plantarse();
    const t0 = Date.now();
    let ultimoSitio = Date.now();
    while (Date.now() - t0 < segundos * 1000) {
      await vidaAlta();
      const r = await pag.evaluate(({ g, n }) => {
        const c = window.probe.costura.de(g, n);
        const t = window.probe.trabas.ultimas;
        const pies = window.probe.mundo.donde().pies;
        return { t, rec: c?.recibidos ?? {}, anim: c?.anim, vivo: c?.vivo,
          lejos: c?.donde ? Math.hypot(c.donde[0] - pies[0], c.donde[2] - pies[2]) : null };
      }, zombi);
      ultimaEspera = { ...r, t: undefined };
      if (r.t?.noAtacar) return r;
      // Si se ha ido lejos (te empujó, o se perdió), otra vez a su lado.
      if ((r.lejos ?? 0) > 2.5 || Date.now() - ultimoSitio > 8000) { await plantarse(); ultimoSitio = Date.now(); }
      await pag.waitForTimeout(150);
    }
    return null;
  }

  // ── 3. EL PRIMER ATURDIMIENTO, Y QUIÉN LO PUSO ────────────────────────
  const antes = await de(zombi.g, zombi.n);
  const att2Antes = antes.recibidos?.attack_2 ?? 0;
  const primero = await esperarAturdido(180);
  const lineas = await dicho();
  console.log(`  primer aturdimiento: ${JSON.stringify(primero?.rec)} anim ${primero?.anim}`);
  control("CONTROL POSITIVO: el zombi ataca solo con `attack` (`attack_1` llega a su guion)", (primero?.rec?.attack_1 ?? 0) >= 1,
    JSON.stringify(primero?.rec ?? null));
  control("LA REGLA: el zombi SALTA solo (`attack_2`, el evento de `attack2`, llega a su guion)", (primero?.rec?.attack_2 ?? 0) > att2Antes,
    JSON.stringify(primero?.rec ?? null));
  control("el jugador queda trabado: `movespeed 45`, `canattack 0`, `canjump 0`",
    Boolean(primero) && primero.t.porcentaje === 45 && primero.t.noAtacar && primero.t.noSaltar,
    JSON.stringify(primero?.t ?? null));
  control("y la consola dice «You have been stunned! ( n / 0 )»", lineas.some((l) => /^You have been stunned! \( \d+ \/ 0 \)$/.test(l)),
    lineas.filter((l) => /stun/i.test(l)).slice(-2).join(" | "));
  // Lo que distingue «lo aturde el salto» de «lo aturde otra cosa»: el
  // aturdimiento no llegó antes de que hubiera un `attack_2`.
  control("ningún aturdimiento sin un salto antes", Boolean(primero) && (primero.rec.attack_2 ?? 0) >= 1, JSON.stringify(primero?.rec ?? null));
  // Sin un primer aturdimiento, lo de abajo esperaría minutos para nada: la
  // caída es roja y los que no corren cuentan como rojos (el 65). Lo enseñó
  // la rotura R1: 180 s, 92 ataques, 48 `attack_1` y ni un `attack_2`.
  if (!primero) throw new Error(`en 180 s no aturdió: ${JSON.stringify(ultimaEspera)}`);
  const part = await pag.evaluate(() => window.probe.costura.partida().golpesDelGuion);
  control("las animaciones que pide el guion están horneadas (`animSinHornear` 0)", (part?.animSinHornear ?? 0) === 0,
    JSON.stringify({ sin: part?.animSinHornear ?? 0, cuales: part?.cualesSinHornear ?? null }));

  // ── 4. ATURDIDO POR EL ZOMBI: LO QUE ANDA, SALTA Y ATACA ──────────────
  // Cada medida, DENTRO de un aturdimiento entero: se mira antes y después.
  let primeroSinUsar = Boolean(primero);
  async function dentro(medida, intentos = 6) {
    for (let k = 0; k < intentos; k++) {
      // La primera medida aprovecha el aturdimiento que ya está puesto.
      const r = primeroSinUsar ? primero : await esperarAturdido(120);
      primeroSinUsar = false;
      if (!r) return { valor: null, porQue: "no volvió a aturdir", ultimo: ultimaEspera };
      const valor = await medida(rumbo);
      const t = await trabas();
      if (t?.noAtacar) return { valor, intento: k + 1 };
      // Se le pasó a mitad: no vale, otra vez.
    }
    return { valor: null, porQue: "ningún aturdimiento duró lo que la medida" };
  }
  const andando = await dentro(andar);
  console.log(`  aturdido: ${JSON.stringify(andando)}`);
  control("LA REGLA: aturdido por el zombi anda a 45 u/s (el tope de `pmove`)", andando.valor !== null && Math.abs(andando.valor - 45) < 5,
    JSON.stringify(andando));
  const saltando = await dentro(saltar);
  control("aturdido por el zombi no salta", saltando.valor !== null && saltando.valor < 0.05, JSON.stringify(saltando));
  const atacando = await dentro(atacar);
  control("aturdido por el zombi, el botón NO empieza un ataque", atacando.valor === false, JSON.stringify(atacando));

  // ── 5. SE LE PASA ───────────────────────────────────────────────────────
  await alSitio(rumbo);
  let suelto = null;
  for (let k = 0; k < 40 && !suelto; k++) {
    await vidaAlta();
    const t = await trabas();
    const act = await pag.evaluate(() => window.probe.trabas.activos().map((e) => e.id));
    if (t && t.porcentaje === 0 && !t.noAtacar && !act.includes("debuff_stun")) suelto = { t, act };
    else await pag.waitForTimeout(250);
  }
  control("se le pasa: ni traba ni efecto", Boolean(suelto), JSON.stringify(suelto));
  const despues = await andar(rumbo);
  // Contra la horquilla del control positivo y no contra el número de la
  // primera medida: la primera pasada dio 157,0 libre y 168,4 después, con el
  // mismo personaje (la 97 midió 159,8-163,3 y 162-164 en su pasillo).
  control("y vuelve a andar lo de un personaje nuevo (150-175 u/s)", despues > 150 && despues < 175, `${despues.toFixed(1)} u/s; libre ${libre.toFixed(1)}`);

  await pag.close();
  control("ni un error de página en toda la pasada", errores.length === 0, errores.slice(0, 2).join(" | ") || "ninguno");
} catch (e) {
  // LA CAÍDA ES UNA ROJA, no una nota al pie (el 65).
  control("LA SONDA HA LLEGADO AL FINAL", false, `${String(e).slice(0, 300)} | errores: ${errores.slice(0, 3).join(" | ") || "ninguno"} | consola: ${consola.slice(0, 3).join(" | ") || "nada"}`);
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
