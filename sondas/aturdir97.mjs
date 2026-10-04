// EL ATURDIMIENTO Y LA LENTITUD DEL 97, JUGANDO: lo que anda el jugador.
//
//   npm run sonda:aturdir97
//
// Se entra POR EL MENÚ (CLAUDE.md §3) en sala88, que es nuestra y tiene un
// pasillo recto de 768 unidades. Lo que se mide es el EFECTO, andando con la W
// de verdad: metros recorridos entre dos lecturas del reloj de la página, no
// el porcentaje que dice el efecto (el «se mide el efecto, no el valor de la
// ventana» del §3).
//
//   1. LIBRE. Lo que anda un personaje nuevo, y que salta. Es el CONTROL
//      POSITIVO de todo lo demás: si aquí ya anduviera a 45, lo de después no
//      mediría nada.
//   2. ATURDIDO, sin yelmo. `effects/debuff_stun 3` por la puerta de
//      `applyeffect` del jugador (la que reciben los guiones de los bichos;
//      que el jabalí llega a ella lo prueba test/aturdir97.test.mjs con su
//      guion — en estos mapas la IA no le hace embestir, doc/IA_95.md). Anda a
//      45 u/s, no salta y no empieza un ataque.
//   3. EL DADO, con y sin el Helmet of Stability puesto: 60 tiradas cada uno.
//      Sin yelmo resiste 0 (`100 - 100 × 1.0`); con él, ~70 %.
//   4. EL ESCUDO ARRIBA: inmune («You are immune to stun effects.»), por la
//      costura nueva de `pasoDelEscudo` (src/main.js) — y al bajarlo, no.
//   5. LENTO: el fénix puesto con fuerza 2. Su guion pone `effect_slow 50%` a
//      la décima; anda a 50 u/s —el TOPE, no el 50 %— y no salta.
//
// Lo que se deja como andamio, dicho: la vida no se toca; `probe.trabas.quitar`
// es un `removeeffect` para tirar el dado sin esperar tres segundos.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

// 5797 y no 5497: inventario97 y override97 (otras sesiones del 97) cogieron
// el 5497 a la vez, y cada `liberarPuerto` mataba el Vite de la otra.
const PORT = 5797;   // (y no 5971, que es el de defensared97)
const liberados = liberarPuerto(PORT);
if (liberados?.length) console.log(`  (puerto ${PORT} liberado)`);
// Vite tarda más con otras sesiones en la máquina: se le pregunta hasta que
// conteste, con tope, en vez de esperar siete segundos a ciegas (el 98 lo
// pasó a `arrancarVite`, que pregunta cada 100 ms y revienta si no llega).
const dev = await arrancarVite(PORT, { tope: 90_000 });
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

const nav = await chromium.launch();
const errores = [];
/** Todo error de consola, sólo para diagnosticar una caída (no es un control). */
const consola = [];
const controles = [];
// LOS DECLARADOS, contados antes de empezar (el 65): si la sonda se cae a
// medias, el marcador no puede decir «X de X».
const DECLARADOS = 24;
const control = (que, bien, detalle = "") => { controles.push({ que, bien, detalle }); return bien; };

async function pagina() {
  const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
  pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
  // El 95: un módulo que no compila no salta en `pageerror`; en la consola sí.
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
  return pag;
}

const dicho = (pag) => pag.evaluate(() => (window.probe.misiones.dicho?.() ?? [])
  .map((l) => (typeof l === "string" ? l : l.texto ?? JSON.stringify(l)))
  .map((l) => l.replace(/^[a-z]+: /, "").trimEnd()));

/** Al principio del pasillo, mirando al este. TRES números a `mirar` (el 78). */
const alPasillo = (pag) => pag.evaluate(() => {
  const U = window.probe.mundo.unidadesPorMetro();
  window.probe.mundo.poner(-560 / U, 0.05, 0);
  window.probe.mundo.mirar(20, 1.6, 0);
  return U;
});

/**
 * ANDAR con la W: 0,7 s para asentarse y luego un segundo medido con el reloj
 * de la página, en unidades por segundo. La rapidez instantánea va al lado
 * para ver que no es un promedio con un tropiezo dentro.
 */
async function andar(pag) {
  const U = await alPasillo(pag);
  await pag.waitForTimeout(300);
  await pag.keyboard.down("KeyW");
  await pag.waitForTimeout(700);
  const a = await pag.evaluate(() => ({ p: [...window.probe.player.feet], t: performance.now() }));
  await pag.waitForTimeout(1000);
  const b = await pag.evaluate(() => ({ p: [...window.probe.player.feet], t: performance.now(), v: window.probe.player.rapidez }));
  await pag.keyboard.up("KeyW");
  const metros = Math.hypot(b.p[0] - a.p[0], b.p[2] - a.p[2]);
  return { us: (metros * U) / ((b.t - a.t) / 1000), instantanea: b.v * U, x: b.p[0] * U };
}

/** SALTAR: la altura máxima de los pies en los 700 ms después de la barra. */
async function saltar(pag) {
  await alPasillo(pag);
  await pag.waitForTimeout(300);
  const y0 = await pag.evaluate(() => window.probe.player.feet[1]);
  const medir = pag.evaluate(() => new Promise((listo) => {
    let max = -Infinity; const t0 = performance.now();
    const uno = () => { max = Math.max(max, window.probe.player.feet[1]); if (performance.now() - t0 < 700) requestAnimationFrame(uno); else listo(max); };
    requestAnimationFrame(uno);
  }));
  // `press` suelta en el mismo fotograma y el bucle no la ve: se aguanta.
  await pag.keyboard.down("Space");
  await pag.waitForTimeout(150);
  await pag.keyboard.up("Space");
  const max = await medir;
  return max - y0;
}

/** ATACAR con el botón: ¿llega a `atacando`? */
async function atacarConElRaton(pag) {
  await pag.mouse.move(600, 400);
  await pag.mouse.down();
  await pag.waitForTimeout(250);
  const r = await pag.evaluate(() => Boolean(window.probe.golpe.estado.atacando));
  await pag.mouse.up();
  await pag.waitForTimeout(1200);
  return r;
}

/**
 * EL DADO: `n` aturdimientos seguidos, leyendo la línea que contesta cada uno.
 * Si aturde, se le quita (`removeeffect`) y se espera un fotograma al barrido
 * para que el siguiente no choque con el `nostack`.
 */
async function tiradas(pag, n) {
  const out = { resiste: 0, aturde: 0, inmune: 0, otras: 0, ejemplo: [] };
  for (let k = 0; k < n; k++) {
    const r = await pag.evaluate(async () => {
      // La consola tiene TOPE de líneas: contar «las nuevas» por longitud da
      // cero en cuanto se llena (lo enseñó la primera pasada: 58 «otras»).
      // Cada aturdimiento dice UNA línea con «stun», así que se lee la última.
      window.probe.trabas.aplicar("effects/debuff_stun", ["3", "0"]);
      const nuevas = (window.probe.misiones.dicho?.() ?? []).slice(-4)
        .map((l) => (typeof l === "string" ? l : l.texto ?? "")).map((l) => l.replace(/^[a-z]+: /, "").trimEnd()).reverse();
      window.probe.trabas.quitar("debuff_stun");
      await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      return nuevas;
    });
    const l = r.find((x) => /stun/.test(x)) ?? "";
    if (/^You resist being stunned!/.test(l)) out.resiste++;
    else if (/^You have been stunned!/.test(l)) out.aturde++;
    else if (/immune to stun/.test(l)) out.inmune++;
    else out.otras++;
    if (out.ejemplo.length < 3 && l) out.ejemplo.push(l);
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
  await pag.waitForTimeout(1500);

  // ── 1. LIBRE ────────────────────────────────────────────────────────────
  const libre = await andar(pag);
  console.log(`  libre: ${libre.us.toFixed(1)} u/s (instantánea ${libre.instantanea.toFixed(1)})`);
  control("CONTROL POSITIVO: libre anda a lo de un personaje nuevo (160-170 u/s)", libre.us > 150 && libre.us < 175, `${libre.us.toFixed(1)} u/s`);
  const saltoLibre = await saltar(pag);
  control("CONTROL POSITIVO: libre salta (más de 0,8 m)", saltoLibre > 0.8, `${saltoLibre.toFixed(2)} m`);
  const atacaLibre = await atacarConElRaton(pag);
  control("CONTROL POSITIVO: libre, el botón empieza un ataque", atacaLibre === true, String(atacaLibre));
  const t0 = await pag.evaluate(() => window.probe.trabas.ultimas);
  control("y el bucle no lee ninguna traba", t0 && t0.porcentaje === 0 && !t0.noAtacar && !t0.noSaltar, JSON.stringify(t0));

  // ── 2. ATURDIDO, sin yelmo ──────────────────────────────────────────────
  // Se aplica justo antes de cada medida: dura tres segundos.
  const aplicarAturdido = () => pag.evaluate(() => {
    window.probe.trabas.quitar("debuff_stun");
    return new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok(window.probe.trabas.aplicar("effects/debuff_stun", ["3", "0"])))));
  });
  // La reserva de diez segundos (base_debuff_diminishing) se gasta: cada
  // medida espera a que vuelva lo suficiente. `quitar` no la devuelve.
  const r1 = await aplicarAturdido();
  const lineas1 = await dicho(pag);
  control("aturdido: «You have been stunned! ( n / 0 )»", r1.puesto && lineas1.some((l) => /^You have been stunned! \( \d+ \/ 0 \)$/.test(l)),
    `${JSON.stringify(r1)} / ${lineas1.filter((l) => /stun/.test(l)).slice(-1)}`);
  await pag.waitForTimeout(100);
  const t1 = await pag.evaluate(() => window.probe.trabas.ultimas);
  control("el bucle lee `movespeed 45`, `canattack 0` y `canjump 0` del efecto", t1?.porcentaje === 45 && t1.noAtacar && t1.noSaltar,
    JSON.stringify({ p: t1?.porcentaje, a: t1?.noAtacar, s: t1?.noSaltar, quien: t1?.quien }));
  const aturdido = await andar(pag);
  console.log(`  aturdido: ${aturdido.us.toFixed(1)} u/s (instantánea ${aturdido.instantanea.toFixed(1)})`);
  control("LA REGLA: aturdido anda a 45 u/s —el tope de `pmove`, no el 45 % de lo suyo—", Math.abs(aturdido.us - 45) < 4,
    `${aturdido.us.toFixed(1)} u/s; el 45 % serían ${(libre.us * 0.45).toFixed(1)}`);
  await pag.waitForTimeout(4000);
  await aplicarAturdido();
  const saltoAturdido = await saltar(pag);
  control("aturdido no salta", saltoAturdido < 0.05, `${saltoAturdido.toFixed(3)} m`);
  const atacaAturdido = await atacarConElRaton(pag);
  control("aturdido, el botón NO empieza un ataque", atacaAturdido === false, String(atacaAturdido));
  // Y se le pasa: tres segundos.
  await pag.waitForTimeout(3500);
  const t2 = await pag.evaluate(() => ({ t: window.probe.trabas.ultimas, act: window.probe.trabas.activos() }));
  control("a los tres segundos se le pasa: ni traba ni efecto", t2.t?.porcentaje === 0 && !t2.t.noAtacar && !t2.act.some((e) => e.id === "debuff_stun"),
    JSON.stringify(t2));
  const despues = await andar(pag);
  control("y vuelve a andar lo suyo", Math.abs(despues.us - libre.us) < 8, `${despues.us.toFixed(1)} u/s`);

  // ── 3. EL DADO, SIN YELMO Y CON ÉL ──────────────────────────────────────
  const sin = await tiradas(pag, 60);
  console.log(`  sin yelmo: ${JSON.stringify(sin)}`);
  control("CONTROL POSITIVO: sin yelmo, 0 de 60 resiste (la tirada 1-100 contra 0)", sin.resiste === 0 && sin.aturde === 60, JSON.stringify(sin));
  await pag.evaluate(() => window.probe.misiones.dar("armor_helm_gray"));
  const ry = await pag.evaluate(() => window.probe.armadura.vestir("armor_helm_gray"));
  await pag.waitForTimeout(600);
  const res = await pag.evaluate(() => window.probe.trabas.resistencia("stun"));
  const lineasY = await dicho(pag);
  control("ponerse el yelmo: «Your stun resistance is now 70%» y `takedmg stun 0.30`",
    ry?.puesto === true && res === "0.30" && lineasY.some((l) => l === "Your stun resistance is now 70%"), `${JSON.stringify(ry)} ${res}`);
  const con = await tiradas(pag, 60);
  console.log(`  con yelmo: ${JSON.stringify(con)}`);
  // Binomial de 60 con p = 0,7: σ = 5,9 %. Más de tres sigmas a cada lado.
  control("LA REGLA: con el yelmo resiste ~70 % (entre 50 % y 90 % de 60)", con.resiste >= 30 && con.resiste <= 54 && con.resiste + con.aturde === 60,
    JSON.stringify(con));
  control("y lo dice con su tirada: «( n / 70 )»", con.ejemplo.some((l) => /\( \d+ \/ 70 \)$/.test(l)), con.ejemplo.join(" | "));

  // ── 4. EL ESCUDO ARRIBA ─────────────────────────────────────────────────
  // CON EL BOTÓN DERECHO DE VERDAD (`atacar2`, MOUSE2), aguantado: el bucle
  // levanta el escudo y es `pasoDelEscudo` quien llama a `ext_shield_up`.
  // `probe.escudo.cubrir` NO sirve aquí: levanta el escudo fuera del bucle y
  // el fotograma siguiente lo baja, porque el botón no está pulsado (lo
  // enseñó la primera pasada: «nopush» en verde y cinco «resist» en rojo).
  await pag.evaluate(() => window.probe.escudo.embrazar("shields_buckler"));
  await pag.mouse.move(600, 400);
  await pag.mouse.down({ button: "right" });
  await pag.waitForTimeout(500);
  const esc = await pag.evaluate(() => ({ e: window.probe.escudo.estado.id, arriba: window.probe.escudo.estado.arriba, nopush: window.probe.trabas.nopush() }));
  control("con el escudo arriba el jugador es `nopush` (ext_shield_up 1)", esc.arriba && esc.nopush, JSON.stringify(esc));
  const inm = await tiradas(pag, 5);
  control("LA REGLA: escudo arriba, «You are immune to stun effects.» las cinco", inm.inmune === 5, JSON.stringify(inm));
  await pag.mouse.up({ button: "right" });
  await pag.waitForTimeout(500);
  const baj = await pag.evaluate(() => window.probe.trabas.nopush());
  const tras = await tiradas(pag, 5);
  control("CONTROL: al bajarlo deja de ser inmune", baj === false && tras.inmune === 0, `${baj} ${JSON.stringify(tras)}`);
  await pag.evaluate(() => window.probe.escudo.embrazar(null));

  // ── 5. LENTO: EL FÉNIX CON FUERZA 2 ─────────────────────────────────────
  // CON SU PESO: el fénix y el yelmo cargan a un personaje de fuerza 2 hasta
  // el castigo entero de `WalkSpeed` (−70, playershared.cpp:1017-1026), y
  // entonces la mitad de lo suyo queda POR DEBAJO del tope de 50. Se mide lo
  // que anda cargado ANTES de ponérselo, y la regla es el mínimo de los dos.
  await pag.evaluate(() => window.probe.misiones.dar("armor_pheonix55"));
  const cargado = await andar(pag);
  console.log(`  cargado, sin ponérselo: ${cargado.us.toFixed(1)} u/s`);
  // El yelmo no estorba: es de la cabeza.
  const rf = await pag.evaluate(() => window.probe.armadura.vestir("armor_pheonix55"));
  await pag.waitForTimeout(600);
  const lineasF = await dicho(pag);
  const t5 = await pag.evaluate(() => window.probe.trabas.ultimas);
  control("el fénix con fuerza 2: «You are being slowed.» y `movespeed 50%`", rf?.puesto === true && lineasF.some((l) => l === "You are being slowed.") && t5?.porcentaje === 50,
    `${JSON.stringify(rf)} ${JSON.stringify({ p: t5?.porcentaje, quien: t5?.quien })}`);
  control("y la lentitud no quita el ataque (`effect_slow` no pone `canattack`)", t5 && t5.noAtacar === false && t5.noSaltar === true, JSON.stringify(t5));
  const lento = await andar(pag);
  console.log(`  lento: ${lento.us.toFixed(1)} u/s (instantánea ${lento.instantanea.toFixed(1)})`);
  const esperado = Math.min(cargado.us * 0.5, 50);
  control("LA REGLA: lento anda a `min(lo suyo × 0,5, 50)` u/s", Math.abs(lento.us - esperado) < 3,
    `${lento.us.toFixed(1)} u/s; esperado ${esperado.toFixed(1)} (${cargado.us * 0.5 < 50 ? "manda el 50 %" : "manda el tope"})`);
  const saltoLento = await saltar(pag);
  control("lento no salta (`canjump 0`)", saltoLento < 0.05, `${saltoLento.toFixed(3)} m`);
  // (Aquí hubo un control «a los once segundos sigue al 50 % con UN
  // `effect_slow`». Con `game.time` sin «%.2f» —la rotura del amontonamiento—
  // siguió VERDE: en once segundos el ruido del reloj del navegador no cayó
  // del lado malo. No defendía nada y se quitó; lo defiende la prueba de Node,
  // que avanza el reloj ella misma. doc/ATURDIR_97.md §5.)

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
