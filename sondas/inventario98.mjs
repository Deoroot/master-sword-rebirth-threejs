// QUÉ CONTENEDOR, CUÁNTO CABE Y «DROP SELECTED», CON EL RATÓN — experimento 98.
//
//   node sondas/inventario98.mjs          (npm run sonda:inventario98)
//
// Se fabrica un «Veteran» con la herramienta de verdad (`tools/personaje.mjs
// --nombre Inventario98 --mapa inventario98`, su propia carpeta) y se le
// añaden al documento exportado DOS armas de partida más —la Rusted Axe y el
// Training Hammer—, que es lo que hace falta para llenar el Heavy Weapon
// Holster (tope 2). Se entra POR EL MENÚ en sala88 (CLAUDE.md §3), se elige su
// ranura con el RATÓN y se juega con lo que juega el jugador: la `i`, clics y
// dobles clics en el panel, el botón «Drop Selected» y la `q`. El probe aquí
// sólo LEE (`probe.inventario98`, `probe.inventario97`, la consola, el suelo).
//
//   1. Cada contenedor con LO SUYO: las dos hachas en el Heavy Weapon Holster
//      —lleno— y el martillo SIN SITIO; la Fire Blade en la Dagger Sheath; la de
//      espalda y el saco vacíos.
//   2. La `q` guarda la Blood Drinker en la BACK SWORD SHEATH, no en el Heavy
//      Weapon Holster (que sólo admite `axes;blunt`; el 97 decía lo contrario).
//   3. El martillo a la mano; al saco NO cabe (la MÁSCARA: rechaza `blunt`) y
//      a la funda tampoco (el TOPE: admite `blunt` y está llena).
//   4. «Drop Selected» con el Dragon Axe elegido en su funda: sale de la
//      lista, cae al suelo y el panel se cierra.
//   5. Y con un hueco en la funda, el mismo gesto con el martillo SÍ cabe: el
//      control positivo de que lo que lo paraba era el tope.
//
// Una primera versión medía el tope llevando el hacha a la Back Sword Sheath
// llena, y la rotura deliberada del tope la dejó en verde: esa funda RECHAZA
// las hachas por su máscara (`swords;polearms`), así que el «no cabe» salía
// por la otra regla. El 75: un control puede acertar el mecanismo y mentir
// sobre el caso.
//
// Ver doc/INVENTARIO_98.md.

import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PORT = 5498;
const NOMBRE = "Inventario98";
const PEDIDO = "inventario98";
const CARPETA = "build/partidas/inventario98";
const HACHA = "axes_dragon";
const HACHA2 = "axes_rsmallaxe";
const MARTILLO = "blunt_hammer1";
const ESPADA = "swords_blood_drinker";
const DAGA = "smallarms_k_fire";
const FUNDA = "sheath_belt_holster";
const ESPALDA = "sheath_back";
const DE_DAGA = "sheath_dagger";
const SACO = "pack_sack";

// El marcador no puede bajar (el 65): los declarados, contados aquí.
const DECLARADOS = 19;
const controles = [];
const control = (que, bien, detalle = "") => {
  controles.push({ que, bien: Boolean(bien), detalle });
  console.log(`  ${bien ? "ok  " : "MAL "} ${que}${detalle ? `\n         ${detalle}` : ""}`);
  return bien;
};
const errores = [];
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const matar = (p) => { if (!p) return; try { spawnSync("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

try { rmSync(CARPETA, { recursive: true, force: true }); } catch {}
const hecho = spawnSync(process.execPath, ["tools/personaje.mjs", "--nombre", NOMBRE, "--mapa", PEDIDO], { encoding: "utf8" });
if (hecho.status !== 0 || !existsSync(`build/personajes/${PEDIDO}.json`)) { console.error(hecho.stdout, hecho.stderr); process.exit(1); }
// Dos armas más en la LISTA, sin `en`: las coloca el juego al abrir el panel.
{
  const ruta = `build/personajes/${PEDIDO}.json`;
  const sobre = JSON.parse(readFileSync(ruta, "utf8"));
  sobre.personaje.objetos.push({ id: HACHA2, n: 1 }, { id: MARTILLO, n: 1 });
  writeFileSync(ruta, JSON.stringify(sobre, null, 2));
}

// Con cinco sesiones en la máquina, los 60 s de por omisión no siempre bastan.
const dev = await arrancarVite(PORT, { tope: 240_000 });

// ── lo que se lee (sólo lectura) ───────────────────────────────────────────
const estado = (pag) => pag.evaluate(() => ({
  manos: window.probe.inventario97.manos,
  enCada: window.probe.inventario98.enCada,
  entradas: window.probe.inventario98.entradas,
  soltado: window.probe.inventario98.ultimoSoltado,
  abierto: window.probe.vgui.abierto(),
  suelo: (window.probe.mundo.suelo?.() ?? []).map((o) => ({ i: o.i, guion: o.guion, tirado: o.tirado })),
}));
const lineas = (pag) => pag.evaluate(() => (window.probe.misiones.dicho?.() ?? [])
  .map((l) => (typeof l === "string" ? l : l.texto ?? JSON.stringify(l)))
  .map((l) => l.replace(/^[a-z]+: /, "").trimEnd()));
const panel = (pag) => pag.evaluate(() => {
  const raiz = [...document.querySelectorAll(".vg-inv")].find((n) => !n.hidden && n.getClientRects().length) ?? null;
  const listas = raiz ? [...raiz.querySelectorAll(".vg-inv-lista")] : [];
  const fila = (n) => {
    const c = n.getBoundingClientRect();
    return { id: n.dataset.id ?? null, texto: n.textContent.trim(), elegida: n.dataset.elegida === "si", x: c.x + c.width / 2, y: c.y + c.height / 2 };
  };
  return { abierto: Boolean(raiz), columna: [...(listas[0]?.children ?? [])].map(fila), dentro: [...(listas[1]?.children ?? [])].map(fila) };
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
const botones = (pag) => pag.evaluate(() => window.probe.vgui.botones());
async function pulsarBoton(pag, texto) {
  const b = (await botones(pag)).find((x) => x.texto === texto);
  if (!b) return false;
  await pag.mouse.click(b.centro, b.arriba + 10);
  await esperar(400);
  return true;
}
const enColumna = (p, id) => p.columna.find((f) => f.id === id) ?? null;
const enLista = (p, id) => p.dentro.find((f) => f.id === id) ?? null;
/** Elige una entrada de la columna (más de `ms_doubleclicktime` después del último clic en ella) y lee la lista. */
async function abrirCaja(pag, id) {
  await esperar(650);
  await clicEn(pag, enColumna(await panel(pag), id));
  return panel(pag);
}
const textos = (p) => p.dentro.map((f) => f.texto);
const NO_CABE = (caja, objeto) => [`Your ${caja} can't fit that!`, `You try to stuff ${objeto} into your ${caja}, but to no avail.`];

const nav = await chromium.launch();
try {
  const ctx = await nav.newContext({ viewport: { width: 1200, height: 800 } });   // IndexedDB vacío
  const pag = await ctx.newPage();
  // La primera página de `vite` preempaqueta las dependencias, y con otras
  // sesiones en la máquina los 30 s de Playwright no bastaron (la primera pasada).
  pag.setDefaultNavigationTimeout(240_000);
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
  const b = (await botones(pag)).find((x) => x.i === 2 * k);
  if (b) await pag.mouse.click(b.centro, b.arriba + 12);
  await pag.waitForFunction(() => window.probe.sesion.estado() === "jugando" && window.probe.vgui.abierto() === null,
    null, { timeout: 120000 }).catch(() => {});
  const mapa = await pag.evaluate(() => window.probe.vgui2.mapaDeLaPartida());
  const e0 = await estado(pag);
  control("1. por el menú, en sala88, con Sonda98 elegido con el ratón", mapa === "sala88" && k >= 0 && e0.manos.derecha === ESPADA,
    `mapa ${mapa}, ranura ${k}, mano ${e0.manos.derecha}`);
  await esperar(1500);

  // ════ CADA CONTENEDOR CON LO SUYO ═══════════════════════════════════════
  await pag.click("#view", { position: { x: 600, y: 400 } }).catch(() => {});
  let pn = await abrirInventario(pag);
  pn = await abrirCaja(pag, FUNDA);
  const enFunda = textos(pn);
  pn = await abrirCaja(pag, DE_DAGA);
  const enDaga = textos(pn);
  pn = await abrirCaja(pag, ESPALDA);
  const enEspalda = textos(pn);
  pn = await abrirCaja(pag, SACO);
  const enSaco = textos(pn);
  console.log(`         funda: ${enFunda.join(" · ")} | daga: ${enDaga.join(" · ")} | espalda: ${enEspalda.join(" · ")} | saco: ${enSaco.join(" · ")}`);
  control("2. el Heavy Weapon Holster enseña las dos hachas (`axes` pide «holster», genericitem.cpp:1168-1169)",
    enFunda.includes("Dragon Axe") && enFunda.includes("Rusted Axe") && !enFunda.includes("Kharaztorant Fire Blade"), enFunda.join(" · "));
  control("2b. la Dagger Sheath enseña la Fire Blade y SÓLO ella (`smallarms`, la vuelta de :1175-1189)",
    enDaga.length === 1 && enDaga[0] === "Kharaztorant Fire Blade", enDaga.join(" · "));
  control("2c. la Back Sword Sheath y el Small Sack, vacíos («No items»)",
    enEspalda.length === 1 && enEspalda[0] === "No items" && enSaco.length === 1 && enSaco[0] === "No items",
    `${enEspalda.join(" · ")} / ${enSaco.join(" · ")}`);
  const e1 = await estado(pag);
  const martillo1 = e1.entradas.find((o) => o.id === MARTILLO);
  control("2d. en el documento: la funda con DOS (su tope, sheath_belt_holster.script:7), la daga en la suya, y el martillo SIN SITIO",
    JSON.stringify(e1.enCada[FUNDA]) === JSON.stringify([HACHA, HACHA2]) && (e1.enCada[DE_DAGA] ?? []).includes(DAGA)
      && martillo1 && martillo1.en === null, `${JSON.stringify(e1.enCada)} · martillo ${JSON.stringify(martillo1)}`);
  await pag.keyboard.press("KeyI");
  await esperar(400);

  // ════ LA `q` CON LA BLOOD DRINKER ═══════════════════════════════════════
  await pag.keyboard.press("KeyQ");
  await esperar(600);
  let ls = await lineas(pag);
  const e2 = await estado(pag);
  control("3. la `q` guarda la Blood Drinker en la BACK SWORD SHEATH: «You put Blood Drinker in Back Sword Sheath»",
    ls.includes("You put Blood Drinker in Back Sword Sheath") && e2.manos.derecha === null && (e2.enCada[ESPALDA] ?? []).includes(ESPADA),
    `${ls.slice(-1)} · ${JSON.stringify(e2.enCada)}`);
  control("3b. y NO «…in Heavy Weapon Holster», que es lo que decía el 97 (el control negativo de 3)",
    !ls.includes("You put Blood Drinker in Heavy Weapon Holster"), ls.slice(-2).join(" | "));
  pn = await abrirInventario(pag);
  pn = await abrirCaja(pag, ESPALDA);
  control("3c. y el panel la enseña en la Back Sword Sheath", textos(pn).includes("Blood Drinker"), textos(pn).join(" · "));

  // ════ CUÁNTO CABE: EL MARTILLO, CON LA MÁSCARA Y CON EL TOPE ═════════
  // Lo que no tiene sitio se ve en el PRIMER contenedor (main.js, `dentro`).
  pn = await abrirCaja(pag, FUNDA);
  // DOBLE clic: el primero lo elige y el segundo, antes de 0,5 s y sobre el
  // elegido, es `inv transfer <id> 0` (vgui_mscontrols.cpp:327-343).
  await clicEn(pag, enLista(pn, MARTILLO), true);
  const e3 = await estado(pag);
  control("4. doble clic en el martillo: a la mano, y el panel se cierra",
    e3.manos.derecha === MARTILLO && e3.abierto === null, JSON.stringify({ manos: e3.manos, abierto: e3.abierto }));
  // El panel se vuelve a abrir con la entrada que tenía elegida (aquí la
  // funda), no con las manos: se eligen las manos con el ratón y se exige
  // haber pulsado (la primera pasada no encontró el objeto y no pulsó nada).
  // Las frases se CUENTAN en el BLOQUE de la consola: guarda las últimas N
  // líneas (su longitud no crece) y parte las largas («…but to» | «no
  // avail.»), que es el 81 otra vez.
  const cuantas = (xs, frases) => { const t = xs.join(" "); return frases.reduce((n, f) => n + t.split(f).length - 1, 0); };
  async function llevarDesdeLasManos(caja, frases) {
    await esperar(650);
    let q = await abrirInventario(pag);
    await clicEn(pag, enColumna(q, "hands"));
    const fila = enLista(await panel(pag), MARTILLO);
    await clicEn(pag, fila);
    const antes = cuantas(await lineas(pag), frases);
    await clicEn(pag, enColumna(await panel(pag), caja));
    const ls = await lineas(pag);
    return { pulsado: Boolean(fila), nuevas: cuantas(ls, frases) - antes, ultimas: ls.slice(-2).join(" | ") };
  }
  const r4b = await llevarDesdeLasManos(SACO, NO_CABE("Small Sack", "Training Hammer"));
  control("4b. al Small Sack NO CABE por la MÁSCARA (rechaza `blunt`, pack_sack.script:18; vacío): una de las dos frases",
    r4b.pulsado && r4b.nuevas === 1, `${r4b.pulsado ? "pulsado" : "NO ESTABA EN LAS MANOS"} · ${r4b.nuevas} nuevas · ${r4b.ultimas}`);
  const r4c = await llevarDesdeLasManos(FUNDA, NO_CABE("Heavy Weapon Holster", "Training Hammer"));
  control("4c. al Heavy Weapon Holster NO CABE por el TOPE (admite `blunt` y ya tiene dos, gipack.cpp:254)",
    r4c.pulsado && r4c.nuevas === 1, `${r4c.pulsado ? "pulsado" : "NO ESTABA EN LAS MANOS"} · ${r4c.nuevas} nuevas · ${r4c.ultimas}`);
  const e4 = await estado(pag);
  control("4d. y el martillo sigue en la mano, la funda con sus dos, y el panel abierto",
    e4.manos.derecha === MARTILLO && JSON.stringify(e4.enCada[FUNDA]) === JSON.stringify([HACHA, HACHA2]) && e4.abierto === "inventory",
    JSON.stringify({ manos: e4.manos, funda: e4.enCada[FUNDA], abierto: e4.abierto }));

  // ════ «DROP SELECTED» ═══════════════════════════════════════════════════
  pn = await abrirCaja(pag, FUNDA);
  const bAntes = (await botones(pag)).map((x) => x.texto);
  await clicEn(pag, enLista(pn, HACHA));                              // elegirlo (un clic)
  const bCon = (await botones(pag)).map((x) => x.texto);
  control("5. con un objeto elegido el botón dice «Drop Selected»; sin él, «Remove» (vgui_containerlist.cpp:140-165)",
    bCon.includes("Drop Selected") && !bAntes.includes("Drop Selected") && bAntes.includes("Remove"), `${bAntes.join(",")} -> ${bCon.join(",")}`);
  const sueloAntes = (await estado(pag)).suelo;
  await pulsarBoton(pag, "Drop Selected");
  await esperar(500);
  const e6 = await estado(pag);
  const nuevos = e6.suelo.filter((o) => !sueloAntes.some((x) => x.i === o.i));
  control("5b. el Dragon Axe sale de la lista (de la funda: `ultimoSoltado.de`)",
    !e6.entradas.some((o) => o.id === HACHA) && e6.soltado?.id === HACHA && e6.soltado?.de === FUNDA,
    JSON.stringify({ soltado: e6.soltado, entradas: e6.entradas.map((o) => o.id) }));
  control("5c. y cae al SUELO: un objeto nuevo `axes_dragon`, tirado (el control positivo de que salió de verdad)",
    nuevos.length === 1 && nuevos[0].guion === HACHA && nuevos[0].tirado, JSON.stringify(nuevos));
  control("5d. y el panel se cierra (`HideTopMenu`, vgui_containerlist.cpp:185)", e6.abierto === null, String(e6.abierto));

  // ════ CONTROL POSITIVO DEL TOPE: CON UN HUECO, EL MARTILLO CABE ═════════
  const r6 = await llevarDesdeLasManos(FUNDA, ["You put Training Hammer in Heavy Weapon Holster"]);
  const e7 = await estado(pag);
  control("6. con el hueco que dejó el Dragon Axe, el MISMO gesto: «You put Training Hammer in Heavy Weapon Holster»",
    r6.pulsado && r6.nuevas === 1 && e7.manos.derecha === null && JSON.stringify(e7.enCada[FUNDA]) === JSON.stringify([HACHA2, MARTILLO]),
    `${r6.nuevas} nuevas · ${r6.ultimas} · ${JSON.stringify(e7.enCada)}`);
  control("6b. la espada y la daga, en sus fundas, sin tocar", (e7.enCada[ESPALDA] ?? []).includes(ESPADA) && (e7.enCada[DE_DAGA] ?? []).includes(DAGA),
    JSON.stringify(e7.enCada));

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
