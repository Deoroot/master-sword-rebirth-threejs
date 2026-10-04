// PONERSE Y QUITARSE LA ARMADURA CON EL RATÓN, Y TODAS LAS ARMAS DE VETERAN
// CON LA TECLA 1 — experimento 97.
//
//   node sondas/inventario97.mjs          (npm run sonda:inventario97)
//
// Se fabrica un «Veteran» con la herramienta de verdad (`tools/personaje.mjs
// --nombre Sonda97`), se entra POR EL MENÚ en sala88 (CLAUDE.md §3), se elige
// su ranura con el RATÓN y se juega con lo que juega el jugador: la `i`, clics
// en el panel del inventario, la `q` y la tecla 1. Nada de `probe.armadura.
// vestir`: el probe aquí sólo LEE (`probe.inventario97`, `probe.armadura`).
//
//   1. La forma del documento: la Blood Drinker en la mano y NO en la lista.
//   2. El panel: la armadura y el yelmo son entradas de la COLUMNA (en gris), no
//      cosas dentro de un contenedor.
//   3. «Remove» con la espada a dos manos: «…because your hands are full!» y
//      sigue puesta. La `q` guarda la espada en la funda.
//   4. CON la armadura: lo que muerde la rata (0,18). «Remove» -> a la mano
//      izquierda -> SIN armadura: 0,4. La `q` -> puesta otra vez: 0,18.
//   5. Elegirla en las manos y pulsar el contenedor la guarda; doble clic en el
//      contenedor la saca. Y el doble clic en el yelmo de la columna lo quita.
//      CORRECCIÓN DEL 98: NO la guarda —ningún contenedor de Veteran admite una
//      armadura—; el doble clic en el contenedor se mide con el Dragon Axe.
//   6. La tecla 1 llega a las CUATRO armas, y al final cada una está una vez.
//
// Ver doc/INVENTARIO_97.md.

import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { rmSync, existsSync } from "node:fs";
import { liberarPuerto, lanzarVite, esperarHttp } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PORT = 5497;
const NOMBRE = "Sonda97";
const PEDIDO = "sonda97";
const ARMAS = ["swords_blood_drinker", "axes_dragon", "bows_firebird", "smallarms_k_fire"];
const FENIX = "armor_pheonix55";
const YELMO = "armor_helm_gray";
const RATA = "monsters/giantrat";

// El marcador no puede bajar (el 65): los declarados, contados aquí.
const DECLARADOS = 25;
const controles = [];
const control = (que, bien, detalle = "") => {
  controles.push({ que, bien: Boolean(bien), detalle });
  console.log(`  ${bien ? "ok  " : "MAL "} ${que}${detalle ? `\n         ${detalle}` : ""}`);
  return bien;
};
const errores = [];
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const matar = (p) => { if (!p) return; try { spawnSync("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

try { rmSync("build/partidas/sonda97", { recursive: true, force: true }); } catch {}
const hecho = spawnSync(process.execPath, ["tools/personaje.mjs", "--nombre", NOMBRE, "--mapa", "sonda97"], { encoding: "utf8" });
if (hecho.status !== 0 || !existsSync(`build/personajes/${PEDIDO}.json`)) { console.error(hecho.stdout, hecho.stderr); process.exit(1); }

const liberados = liberarPuerto(PORT);
if (liberados?.length) console.log(`  (puerto ${PORT} liberado)`);
const dev = lanzarVite(PORT);
// Hasta que conteste, no un plazo fijo: con otras sesiones en la máquina los
// ocho segundos de las demás sondas no siempre bastan (salió ERR_CONNECTION_RESET).
// (el 98: `esperarHttp` pregunta cada 100 ms y revienta con motivo si no llega)
await esperarHttp(`http://localhost:${PORT}/`, { tope: 60_000, proceso: dev, quien: "vite" });

// ── lo que se lee (sólo lectura) ───────────────────────────────────────────
const estado = (pag) => pag.evaluate(() => {
  const p = window.probe.sesion.personaje;
  return {
    manos: window.probe.inventario97.manos,
    puestos: window.probe.inventario97.puestos,
    activa: window.probe.inventario97.manoActiva,
    objetos: (p?.objetos ?? []).map((o) => o.id),
    vivosPuestos: window.probe.armadura.puestos.map((o) => o.id),
    abierto: window.probe.vgui.abierto(),
    ultimo: window.probe.inventario97.ultimo,
  };
});
const lineas = (pag) => pag.evaluate(() => (window.probe.misiones.dicho?.() ?? [])
  .map((l) => (typeof l === "string" ? l : l.texto ?? JSON.stringify(l)))
  .map((l) => l.replace(/^[a-z]+: /, "").trimEnd()));

/** El panel, leído del DOM: la columna y la lista, con sus posiciones. */
const panel = (pag) => pag.evaluate(() => {
  const raiz = [...document.querySelectorAll(".vg-inv")].find((n) => !n.hidden && n.getClientRects().length) ?? null;
  const listas = raiz ? [...raiz.querySelectorAll(".vg-inv-lista")] : [];
  const fila = (n) => {
    const c = n.getBoundingClientRect();
    return { id: n.dataset.id ?? null, texto: n.textContent.trim(), color: getComputedStyle(n).color,
      elegida: n.dataset.elegida === "si", x: c.x + c.width / 2, y: c.y + c.height / 2 };
  };
  return {
    abierto: Boolean(raiz),
    columna: [...(listas[0]?.children ?? [])].map(fila),
    dentro: [...(listas[1]?.children ?? [])].map(fila),
  };
});
async function abrirInventario(pag) {
  if (!(await panel(pag)).abierto) { await pag.keyboard.press("KeyI"); await esperar(700); }
  return panel(pag);
}
async function clicEn(pag, f, doble = false) {
  if (!f) return false;
  if (doble) await pag.mouse.dblclick(f.x, f.y);
  else await pag.mouse.click(f.x, f.y);
  await esperar(300);
  return true;
}
async function pulsarBoton(pag, texto) {
  const b = (await pag.evaluate(() => window.probe.vgui.botones())).find((x) => x.texto === texto);
  if (!b) return false;
  await pag.mouse.click(b.centro, b.arriba + 10);
  await esperar(400);
  return true;
}
const enColumna = (p, id) => p.columna.find((f) => f.id === id) ?? null;
const enLista = (p, id) => p.dentro.find((f) => f.id === id) ?? null;

// ── la rata (copiado de sondas/armadura96.mjs) ─────────────────────────────
const plantarse = (pag, d = 0.8) => pag.evaluate(({ g, d }) => {
  const r = window.probe.ia.bicho(g, 0);
  if (!r) return null;
  window.probe.mundo.poner(r.donde[0] - d, r.donde[1] + 0.1, r.donde[2]);
  window.probe.mundo.mirar(r.donde[0], r.donde[1] + 0.2, r.donde[2]);   // TRES números (el 78)
  return r;
}, { g: RATA, d });
const golpesDeRata = (ls) => ls.filter((l) => /^Giant Rat hits you: /.test(l)).map((l) => Number(/hits you: (\d+\.\d) /.exec(l)?.[1]));
/** `n` mordiscos nuevos, con la vida perdida en cada uno (leído todo en la MISMA llamada, el 96). */
async function mordiscos(pag, n, segundos = 90) {
  const foto = () => pag.evaluate(() => ({
    lineas: (window.probe.misiones.dicho?.() ?? []).map((l) => (typeof l === "string" ? l : l.texto ?? JSON.stringify(l)))
      .map((l) => l.replace(/^[a-z]+: /, "").trimEnd()),
    vida: window.probe.sesion.vitales()?.vida ?? null,
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
    if (g.length === c0 + 1) out.push({ consola: g.at(-1), perdida: +(f0.vida - f1.vida).toFixed(3) });
    c0 = g.length;
    f0 = f1;
  }
  return out;
}
// La MEDIANA y no la media: la vida de Veteran se regenera sola (el 64) y un
// tic de regeneración que cae en la misma lectura que un mordisco da una
// pérdida negativa (salió «-0,18» la primera pasada). El número del golpe lo
// dice además la consola, que no se mezcla con nada.
const mediana = (xs) => { const v = xs.map((x) => x.perdida).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : NaN; };
const media = mediana;
const vale = (xs, consola, perdida) => xs.length >= 3 && xs.every((x) => x.consola === consola) && Math.abs(mediana(xs) - perdida) < 0.01;

const nav = await chromium.launch();
try {
  const ctx = await nav.newContext({ viewport: { width: 1200, height: 800 } });   // IndexedDB vacío
  const pag = await ctx.newPage();
  pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
  pag.on("console", (m) => {
    if (m.type() === "error" && /SyntaxError|Failed to fetch dynamically imported module|does not provide an export/.test(m.text())) {
      errores.push(`(consola) ${m.text().slice(0, 200)}`);
    }
  });
  // Sin el recargado en caliente: el árbol es compartido (el 93).
  await pag.addInitScript(() => {
    const Real = window.WebSocket;
    const Falso = function (url, protos) {
      const esHmr = protos === "vite-hmr" || (Array.isArray(protos) && protos.includes("vite-hmr"));
      if (!esHmr) return new Real(url, protos);
      return { close() {}, send() {}, addEventListener() {}, removeEventListener() {}, readyState: 3 };
    };
    Object.assign(Falso, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
    Falso.prototype = Real.prototype;
    window.WebSocket = Falso;
  });

  // ════ ENTRAR ════════════════════════════════════════════════════════════
  await entrarPorElMenu(pag, PORT, { mapa: "sala88", extra: `personaje=${PEDIDO}` });
  const lista = await pag.evaluate(() => window.probe.sesion.listar());
  const k = lista.findIndex((c) => c.nombre === NOMBRE);
  const b = (await pag.evaluate(() => window.probe.vgui.botones())).find((x) => x.i === 2 * k);
  if (b) await pag.mouse.click(b.centro, b.arriba + 12);
  await pag.waitForFunction(() => window.probe.sesion.estado() === "jugando" && window.probe.vgui.abierto() === null,
    null, { timeout: 120000 }).catch(() => {});
  const mapa = await pag.evaluate(() => window.probe.vgui2.mapaDeLaPartida());
  const e0 = await estado(pag);
  control("1. por el menú, en sala88, con Sonda97 elegido con el ratón", mapa === "sala88" && k >= 0 && e0.manos.derecha === ARMAS[0],
    `mapa ${mapa}, ranura ${k}, mano ${e0.manos.derecha}`);
  control("1b. LA FORMA (versión 2): la Blood Drinker en la mano y NINGUNA en la lista",
    !e0.objetos.includes(ARMAS[0]), e0.objetos.join(", "));
  control("1c. y llega con el fénix y el yelmo puestos, vivos", [FENIX, YELMO].every((id) => e0.puestos.includes(id) && e0.vivosPuestos.includes(id)),
    `${e0.puestos} / ${e0.vivosPuestos}`);
  await esperar(1500);

  // ════ EL PANEL ══════════════════════════════════════════════════════════
  await pag.click("#view", { position: { x: 600, y: 400 } }).catch(() => {});
  let pn = await abrirInventario(pag);
  console.log(`         columna: ${pn.columna.map((f) => f.texto).join(" · ")}`);
  const fCol = enColumna(pn, FENIX);
  control("2. el fénix es una entrada de la COLUMNA, después de los contenedores, en gris (`Color_GearNonContainer`)",
    fCol && fCol.color === "rgb(160, 160, 160)" && pn.columna.findIndex((f) => f.id === FENIX) > 4,
    JSON.stringify(fCol));

  // ════ «REMOVE» CON LA ESPADA A DOS MANOS ════════════════════════════════
  await clicEn(pag, fCol);
  await pulsarBoton(pag, "Remove");
  let e1 = await estado(pag);
  let ls = await lineas(pag);
  control("3. «Remove» con la Blood Drinker: «You can't get Armor of the Phoenix because your hands are full!»",
    ls.includes("You can't get Armor of the Phoenix because your hands are full!"), ls.slice(-2).join(" | "));
  control("3b. y la armadura SIGUE puesta (y el panel se cerró, `HideTopMenu`)", e1.puestos.includes(FENIX) && e1.abierto === null,
    `${e1.puestos} · abierto ${e1.abierto}`);
  await pag.keyboard.press("KeyQ");
  await esperar(500);
  e1 = await estado(pag);
  ls = await lineas(pag);
  // CORRECCIÓN DEL 98: el Heavy Weapon Holster sólo admite `axes;blunt`
  // (sheath_belt_holster.script:10) y `FindPackForItem` lleva la espada a la
  // Back Sword Sheath (genericitem.cpp:1175-1189). El 97 no miraba lo que cabe.
  control("3c. la `q` GUARDA la espada: «You put Blood Drinker in Back Sword Sheath» (el 98), mano vacía",
    ls.includes("You put Blood Drinker in Back Sword Sheath") && e1.manos.derecha === null && e1.objetos.includes(ARMAS[0]),
    `${ls.slice(-1)} · mano ${e1.manos.derecha}`);

  // ════ LA RATA: CON, SIN, CON ════════════════════════════════════════════
  await plantarse(pag);
  await pag.evaluate(() => window.probe.golpe.atacar(1.2));
  const con1 = await mordiscos(pag, 3);
  console.log(`         con el fénix: ${JSON.stringify(con1.map((x) => [x.consola, x.perdida]))}`);
  control("4. CON la armadura la rata quita 0,18 por mordisco (3 leídos; la consola «0.2 damage.»)",
    vale(con1, 0.2, 0.18), con1.map((x) => `${x.consola}/${x.perdida}`).join(", "));

  pn = await abrirInventario(pag);
  await clicEn(pag, enColumna(pn, FENIX));
  await pulsarBoton(pag, "Remove");
  const e2 = await estado(pag);
  control("4b. «Remove» con una mano libre: el fénix va a la mano IZQUIERDA y deja de estar puesto",
    e2.manos.izquierda === FENIX && !e2.puestos.includes(FENIX) && !e2.vivosPuestos.includes(FENIX) && e2.activa === "izquierda",
    JSON.stringify({ manos: e2.manos, puestos: e2.puestos, activa: e2.activa }));
  control("4c. con los eventos del motor en su orden: removefromowner, newowner, pickup, deploy, removepack",
    JSON.stringify(e2.ultimo?.diario) === JSON.stringify([`${FENIX}:game_removefromowner`, `${FENIX}:game_newowner`,
      `${FENIX}:game_pickup`, `${FENIX}:game_deploy`, `${FENIX}:game_removepack`]), JSON.stringify(e2.ultimo?.diario));
  await plantarse(pag);
  await pag.evaluate(() => window.probe.golpe.atacar(1.2));
  const sin = await mordiscos(pag, 3);
  console.log(`         sin el fénix: ${JSON.stringify(sin.map((x) => [x.consola, x.perdida]))}`);
  control("4d. SIN la armadura la misma rata quita 0,4 (el control positivo de 4; la consola «0.4 damage.»)",
    vale(sin, 0.4, 0.4), sin.map((x) => `${x.consola}/${x.perdida}`).join(", "));

  await pag.keyboard.press("KeyQ");
  await esperar(500);
  const e3 = await estado(pag);
  // EL VERDE VACÍO de la primera rotura (la `q` desconectada): con la armadura
  // sin quitar, «está puesta y la mano vacía» es el VALOR DE REPOSO y salía
  // verde. Ahora pide que antes estuviera en la mano (4b) y que la última orden
  // haya sido SU `game_wear`.
  control("4e. la `q` con el fénix en la mano: se lo PONE (`game_wear`), mano vacía",
    e2.manos.izquierda === FENIX && JSON.stringify(e3.ultimo?.diario) === JSON.stringify([`${FENIX}:game_wear`])
      && e3.puestos.includes(FENIX) && e3.vivosPuestos.includes(FENIX) && e3.manos.izquierda === null,
    JSON.stringify({ manos: e3.manos, puestos: e3.puestos, diario: e3.ultimo?.diario }));
  await plantarse(pag);
  await pag.evaluate(() => window.probe.golpe.atacar(1.2));
  const con2 = await mordiscos(pag, 3);
  console.log(`         otra vez con él: ${JSON.stringify(con2.map((x) => [x.consola, x.perdida]))}`);
  control("4f. y vuelve a proteger: 0,18", vale(con2, 0.2, 0.18), con2.map((x) => `${x.consola}/${x.perdida}`).join(", "));
  control("4g. el efecto en una línea: sin > con, las dos veces", media(sin) > media(con1) && media(sin) > media(con2),
    `${media(con1).toFixed(3)} / ${media(sin).toFixed(3)} / ${media(con2).toFixed(3)}`);

  // ════ GUARDAR CON UN CLIC EN EL CONTENEDOR, SACAR CON DOBLE CLIC ════════
  //
  // CORRECCIÓN DEL 98. Aquí el fénix se guardaba en el Heavy Weapon Holster y
  // se sacaba de él con doble clic. En el juego eso NO PASA: ninguno de los
  // cuatro contenedores de Veteran admite una armadura (doc/INVENTARIO_98.md),
  // y `PutInPack` lo dice con una de sus dos frases (playershared.cpp:676-688).
  // Lo que medía 5d —el doble clic en un contenedor— se mide con lo que SÍ
  // está en uno: el Dragon Axe, en el Heavy Weapon Holster.
  pn = await abrirInventario(pag);
  await clicEn(pag, enColumna(pn, FENIX));
  await pulsarBoton(pag, "Remove");                                   // a la mano otra vez
  pn = await abrirInventario(pag);
  await esperar(650);
  await clicEn(pag, enColumna(await panel(pag), "hands"));            // el panel recuerda la última entrada elegida
  pn = await panel(pag);
  const enManos = enLista(pn, FENIX);
  control("5. con el panel abierto, «Player Hands» enseña el fénix", Boolean(enManos), pn.dentro.map((f) => f.texto).join(" · "));
  await clicEn(pag, enManos);                                         // elegirlo
  const NO_CABE = ["Your Heavy Weapon Holster can't fit that!",
    "You try to stuff Armor of the Phoenix into your Heavy Weapon Holster, but to no avail."];
  // En el BLOQUE y contando: la consola parte las líneas largas (el 81).
  const cuantas = (xs) => { const t = xs.join(" "); return NO_CABE.reduce((n, f) => n + t.split(f).length - 1, 0); };
  const antes5 = cuantas(await lineas(pag));
  pn = await panel(pag);
  await clicEn(pag, enColumna(pn, "sheath_belt_holster"));           // y llevarlo a la funda
  let e4 = await estado(pag);
  ls = await lineas(pag);
  control("5b. elegirlo y pulsar el contenedor: NO CABE (el 98: una de las dos frases de `PutInPack`), y el panel sigue abierto",
    cuantas(ls) - antes5 === 1 && e4.abierto === "inventory", `${ls.slice(-2).join(" | ")} · ${e4.abierto}`);
  control("5c. y sigue en la mano izquierda, ni puesto ni registrado", e4.manos.izquierda === FENIX
    && !e4.puestos.includes(FENIX) && !e4.vivosPuestos.includes(FENIX), `${JSON.stringify(e4.manos)} · ${e4.puestos}`);
  await pag.keyboard.press("KeyI");
  await esperar(300);
  await pag.keyboard.press("KeyQ");
  await esperar(400);
  e4 = await estado(pag);
  control("5e. y la `q` se lo vuelve a poner (su `game_wear`, no el valor de reposo)",
    JSON.stringify(e4.ultimo?.diario) === JSON.stringify([`${FENIX}:game_wear`]) && e4.puestos.includes(FENIX) && e4.manos.izquierda === null,
    JSON.stringify({ puestos: e4.puestos, diario: e4.ultimo?.diario }));
  // El doble clic en un contenedor, con el hacha.
  pn = await abrirInventario(pag);
  await esperar(650);
  await clicEn(pag, enColumna(await panel(pag), "sheath_belt_holster"));
  pn = await panel(pag);
  console.log(`         en la funda: ${pn.dentro.map((f) => `${f.texto}@${Math.round(f.y)}`).join(" · ")}`);
  await clicEn(pag, enLista(pn, ARMAS[1]), true);                     // DOBLE clic
  e4 = await estado(pag);
  const diario5d = e4.ultimo?.diario ?? [];
  await pag.keyboard.press("KeyQ");                                   // y se guarda otra vez
  await esperar(400);
  ls = await lineas(pag);
  const e4b = await estado(pag);
  control("5d. DOBLE CLIC en la funda (`inv transfer <id> 0`): el hacha a la mano, el panel se cierra, y la `q` la devuelve",
    e4.manos.derecha === ARMAS[1] && e4.abierto === null
      && JSON.stringify(diario5d.slice(-2)) === JSON.stringify([`${ARMAS[1]}:removefrompack`, `${ARMAS[1]}:game_removefrompack`])
      && ls.includes("You put Dragon Axe in Heavy Weapon Holster") && e4b.manos.derecha === null,
    JSON.stringify({ manos: e4.manos, abierto: e4.abierto, diario: diario5d, luego: e4b.manos }));

  // El yelmo, por la otra puerta: DOBLE clic en su entrada de la columna.
  pn = await abrirInventario(pag);
  await clicEn(pag, enColumna(pn, YELMO), true);
  const e5 = await estado(pag);
  control("5f. DOBLE CLIC en el yelmo de la columna (`GearItemDoubleClicked` -> `remove`): a la mano, ya no puesto",
    e5.manos.izquierda === YELMO && !e5.puestos.includes(YELMO), JSON.stringify({ manos: e5.manos, puestos: e5.puestos }));
  await pag.keyboard.press("KeyQ");
  await esperar(400);
  const e6 = await estado(pag);
  control("5g. y la `q` lo pone (su `game_wear`)",
    JSON.stringify(e6.ultimo?.diario) === JSON.stringify([`${YELMO}:game_wear`]) && e6.puestos.includes(YELMO) && e6.manos.izquierda === null,
    JSON.stringify({ puestos: e6.puestos, diario: e6.ultimo?.diario }));

  // ════ LA TECLA 1: LAS CUATRO ARMAS ══════════════════════════════════════
  if (!(await pag.evaluate(() => Boolean(document.pointerLockElement)))) {
    await pag.mouse.click(600, 400);
    await esperar(300);
  }
  const conPuntero = await pag.evaluate(() => Boolean(document.pointerLockElement));
  const empunadas = [];
  const ofrecidas = [];
  for (let vuelta = 0; vuelta < 12 && new Set(empunadas).size < ARMAS.length; vuelta++) {
    if (conPuntero) { await pag.keyboard.press("Digit1"); await esperar(80); }
    else await pag.evaluate(() => window.probe.ranuras.ciclar("weapon"));
    const of = await pag.evaluate(() => window.probe.ranuras.estado().etiqueta?.id ?? null);
    ofrecidas.push(of);
    if (!of) continue;
    if (conPuntero) { await pag.mouse.down(); await esperar(50); await pag.mouse.up(); }
    else await pag.evaluate(() => window.probe.ranuras.confirmar());
    await esperar(1500);   // que acabe de sacarla: `CurrentAttack` no deja ciclar (el 96)
    const m = (await estado(pag)).manos.derecha;
    empunadas.push(m);
  }
  console.log(`         tecla 1 (${conPuntero ? "con puntero: tecla y clic" : "sin puntero: las mismas funciones que las teclas"}): ofrecidas ${ofrecidas.join(" → ")}`);
  control("6. la tecla 1 ofrece y empuña las CUATRO armas de Veteran", ARMAS.every((a) => empunadas.includes(a)),
    `empuñadas: ${empunadas.join(", ")}`);
  const fin = await pag.evaluate(() => {
    const p = window.probe.sesion.personaje;
    return [...(p.objetos ?? []).map((o) => o.id), p.manos.derecha, p.manos.izquierda].filter(Boolean);
  });
  control("6b. y al final cada arma está UNA vez entre la lista y la mano (sin duplicados)",
    ARMAS.every((a) => fin.filter((x) => x === a).length === 1), ARMAS.map((a) => `${a}×${fin.filter((x) => x === a).length}`).join(" "));
  control("6c. y la armadura y el yelmo siguen puestos después de cambiar de arma", (await estado(pag)).puestos.length === 2,
    JSON.stringify((await estado(pag)).puestos));

  await ctx.close();
} catch (e) {
  // El 65: una caída es una ROJA, no una nota.
  control(`la sonda se cayó: ${String(e?.message ?? e).slice(0, 200)}`, false);
} finally {
  await nav.close().catch(() => {});
  matar(dev);
}

control("ni un error de página (ni de módulo en la consola)", !errores.length, errores.join(" | ").slice(0, 400));
const verdes = controles.filter((c) => c.bien).length;
console.log(`\n  ${verdes} de ${Math.max(DECLARADOS, controles.length)} en verde`);
if (controles.length < DECLARADOS) console.log(`  (corrieron ${controles.length} de ${DECLARADOS} declarados: los que faltan son rojos)`);
process.exit(verdes === DECLARADOS && controles.length === DECLARADOS ? 0 : 1);
