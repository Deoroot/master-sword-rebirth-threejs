// EL PERSONAJE DE PRUEBAS, ENTRANDO POR EL MENÚ — experimento 96.
//
//   node sondas/personaje96.mjs          (npm run sonda:personaje96)
//
// Fabrica un personaje con `tools/personaje.mjs` (con otro nombre, «Sonda96»,
// para no pisar el «Veteran» de quien esté probando) y lo mete en el juego por
// los DOS caminos, entrando por el menú (CLAUDE.md §3) y eligiéndolo con el
// RATÓN en la ranura de «Choose your character»:
//
//   A. EN SOLITARIO: `?personaje=sonda96` en una página con el IndexedDB
//      vacío (un contexto nuevo de Chromium). Se mide que salga en la ranura,
//      que al pulsarla se entre, y que el inventario —la `i`, el panel de VGUI—
//      enseñe en pantalla la armadura, el casco y las armas, y el oro.
//      Y la recarga: con la misma URL NO se vuelve a importar.
//   B. CON SERVIDOR: `tools/servidor.mjs` con `--personajes` en la carpeta
//      donde la herramienta lo dejó, y la página con `red=`. Se mide que la
//      lista que manda el servidor lo traiga, que al pulsarlo el SERVIDOR
//      diga que ese cliente lleva ese personaje (`/costura`), y el inventario.
//
// Lo que NO mide: que la armadura proteja (la porta otra sesión) ni el modelo
// del arma en la mano. Ver doc/PERSONAJE_96.md.

import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { rmSync, existsSync } from "node:fs";
import { liberarPuerto, lanzarVite, esperarHttp } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PUERTO_WEB = 5961;
const PUERTO_PARTIDA = 5962;
const NOMBRE = "Sonda96";
const PEDIDO = "sonda96";
const ID = "pruebas-sonda96";
const CARPETA = "build/partidas/sonda96/personajes";
const OBJETOS = ["Armor of the Phoenix", "Helmet of Stability", "Dragon Axe", "Phoenix Bow", "Kharaztorant Fire Blade"];
// EL 97: lo PUESTO no va dentro de un contenedor, es una entrada de la columna
// del equipo (`AddInventoryItems`, vgui_container.cpp:430-451). Hasta el 97 el
// panel enseñaba la armadura y el yelmo dentro del Heavy Weapon Holster.
const PUESTOS = ["Armor of the Phoenix", "Helmet of Stability"];
const EN_LA_BOLSA = OBJETOS.filter((n) => !PUESTOS.includes(n));
const EN_MANO = "Blood Drinker";

// El marcador NO puede bajar (el 65): los declarados se cuentan aquí arriba.
// El 98: eran 15 y corren 16 desde que el 97 añadió A7b. La sonda imprimía
// «16 de 16 en verde» y salía con 1 SIEMPRE (`verdes === DECLARADOS`); sólo
// lo vio el lanzador, que mira el código de salida además del resumen.
const DECLARADOS = 16;   // A1-A8, A7b, B1-B6 y «ni un error de página»
const controles = [];
const control = (que, bien, detalle = "") => {
  controles.push({ que, bien: Boolean(bien), detalle });
  console.log(`  ${bien ? "ok  " : "MAL "} ${que}${detalle ? `\n         ${detalle}` : ""}`);
  return bien;
};
const errores = [];
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const matar = (p) => { if (!p) return; try { spawnSync("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

// ── la fabricación, con la herramienta de verdad ───────────────────────────
try { rmSync("build/partidas/sonda96", { recursive: true, force: true }); } catch {}
const hecho = spawnSync(process.execPath, ["tools/personaje.mjs", "--nombre", NOMBRE, "--mapa", "sonda96"], { encoding: "utf8" });
if (hecho.status !== 0) { console.error(hecho.stdout, hecho.stderr); process.exit(1); }
// `--mapa sonda96` sólo decide la CARPETA; el servidor de abajo juega gatecity
// y se le apunta ahí con `--personajes`.
if (!existsSync(`${CARPETA}/${ID}.json`) || !existsSync(`build/personajes/${PEDIDO}.json`)) {
  console.error("la herramienta no dejó los dos ficheros"); process.exit(1);
}

const liberados = [...liberarPuerto(PUERTO_WEB), ...liberarPuerto(PUERTO_PARTIDA)];
if (liberados.length) console.log(`  (había ${liberados.length} proceso(s) en los puertos: matados)`);
const dev = lanzarVite(PUERTO_WEB);
let partida = null;

const vigilar = (pag, quien, consola) => {
  pag.on("pageerror", (e) => errores.push(`${quien}: ${String(e).slice(0, 200)}`));
  pag.on("console", (m) => {
    consola?.push(m.text());
    if (m.type() === "error" && /SyntaxError|Failed to fetch dynamically imported module|does not provide an export/.test(m.text())) {
      errores.push(`${quien} (consola): ${m.text().slice(0, 200)}`);
    }
  });
};
// Sin el recargado en caliente de Vite: el árbol es compartido (el 93).
const parar = (pag) => pag.addInitScript(() => {
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

/** La ranura de «Choose your character» que enseña `nombre`, leída del DOM. */
async function ranuraDe(pag, nombre) {
  return pag.evaluate((n) => {
    const etiquetas = [...document.querySelectorAll(".vg-etiqueta")]
      .filter((e) => e.textContent.trim() === n && e.getClientRects().length && !e.closest("[hidden]"));
    return etiquetas.map((e) => { const c = e.getBoundingClientRect(); return { x: c.x + c.width / 2, y: c.y + c.height / 2 }; });
  }, nombre);
}

/** Pulsa con el ratón la ranura `k` (sus botones son el `2k` del panel). */
async function pulsarRanura(pag, k) {
  const b = (await pag.evaluate(() => window.probe.vgui.botones())).find((x) => x.i === 2 * k);
  if (!b) return false;
  await pag.mouse.click(b.centro, b.arriba + 12);
  return true;
}

/** Abre el inventario con la `i` y devuelve lo que se LEE en el panel. */
async function inventario(pag) {
  await pag.click("#view", { position: { x: 600, y: 400 } }).catch(() => {});
  await pag.keyboard.press("KeyI");
  await esperar(900);
  const leer = () => pag.evaluate(() => {
    const raiz = [...document.querySelectorAll(".vg-inv")].find((n) => !n.hidden) ?? null;
    const listas = raiz ? [...raiz.querySelectorAll(".vg-inv-lista")] : [];
    return {
      abierto: window.probe.vgui.abierto(),
      columna: [...(listas[0]?.children ?? [])].map((n) => {
        const c = n.getBoundingClientRect();
        return { texto: n.textContent.trim(), x: c.x + c.width / 2, y: c.y + c.height / 2 };
      }),
      dentro: [...(listas[1]?.children ?? [])].map((n) => n.textContent.trim()),
      oro: raiz ? [...raiz.querySelectorAll(".vg-etiqueta")].map((n) => n.textContent).find((t) => /Gold: /.test(t)) ?? null : null,
    };
  });
  const manos = await leer();
  // El primer contenedor recibe lo que no va en la mano (main.js, `dentro`).
  //
  // CORRECCIÓN DEL 98: ya no. Cada contenedor enseña LO SUYO
  // (src/play/contenedores.js): el hacha en el Heavy Weapon Holster, la Fire
  // Blade en la Dagger Sheath, y el Phoenix Bow —que no cabe en ninguno de los
  // cuatro— en el primero. Se leen los cuatro contenedores (las entradas 1 a 4
  // de la columna) y se juntan; la columna, la del último.
  let bolsa = null;
  const juntos = [];
  for (let k = 1; k <= 4 && manos.columna[k]; k++) {
    await esperar(600);   // más que `ms_doubleclicktime` entre dos clics a la columna
    await pag.mouse.click(manos.columna[k].x, manos.columna[k].y);
    await esperar(500);
    bolsa = await leer();
    juntos.push(...bolsa.dentro.filter((t) => t !== "No items"));
  }
  if (bolsa) bolsa = { ...bolsa, dentro: juntos };
  else bolsa = await leer();
  await pag.keyboard.press("KeyI");
  return { manos, bolsa };
}

const sinRepetir = (a) => [...new Set(a)];

await esperarHttp(`http://localhost:${PUERTO_WEB}/`, { tope: 90_000, proceso: dev, quien: "vite" });   // el 98: en vez de dormir
const nav = await chromium.launch();
try {
  // ════ A. EN SOLITARIO ═══════════════════════════════════════════════════
  console.log("\n  A. EN SOLITARIO, con ?personaje=");
  {
    const ctx = await nav.newContext({ viewport: { width: 1200, height: 800 } });  // IndexedDB vacío
    const pag = await ctx.newPage();
    const consola = [];
    vigilar(pag, "A", consola);
    await parar(pag);
    await entrarPorElMenu(pag, PUERTO_WEB, { extra: `personaje=${PEDIDO}` });
    const dicho = consola.find((t) => t.startsWith(`personaje de pruebas «${PEDIDO}»`)) ?? null;
    control("A1. la página lo importa al cargar (consola)", dicho && /: importado$/.test(dicho), String(dicho));
    const lista = await pag.evaluate(() => window.probe.sesion.listar());
    const k = lista.findIndex((c) => c.nombre === NOMBRE);
    const enPantalla = await ranuraDe(pag, NOMBRE);
    control("A2. sale en «Choose your character»: en el almacén Y escrito en una ranura visible",
      k >= 0 && enPantalla.length === 1, `ranura ${k}, ${enPantalla.length} etiqueta(s) visibles con «${NOMBRE}»`);

    await pulsarRanura(pag, k);
    await pag.waitForFunction(() => window.probe.sesion.estado() === "jugando" && window.probe.vgui.abierto() === null,
      null, { timeout: 120000 }).catch(() => {});
    const dentro = await pag.evaluate(() => {
      const p = window.probe.sesion.personaje;
      return p ? {
        id: p.id, nombre: p.nombre, oro: p.oro, espada: p.habilidades?.swordsmanship?.proficiency?.valor,
        ...window.probe.sesion.vitales(),
      } : null;
    });
    control("A3. al pulsar la ranura con el ratón se entra con ESE personaje",
      dentro?.id === ID && dentro?.espada === 40, JSON.stringify(dentro));
    control("A4. vida y maná llenos y sin recortar (508 / 170, la cuenta de stats.js)",
      dentro?.vida === 508 && dentro?.vidaMax === 508 && dentro?.mana === 170, JSON.stringify(dentro));

    const inv = await inventario(pag);
    console.log(`         manos  ${JSON.stringify(inv.manos.dentro)} · ${inv.manos.oro}`);
    console.log(`         bolsa  ${JSON.stringify(inv.bolsa.columna[1]?.texto)} -> ${JSON.stringify(inv.bolsa.dentro)}`);
    control("A5. el inventario se abre y en LAS MANOS está la Blood Drinker",
      inv.manos.abierto === "inventory" && inv.manos.dentro.some((t) => t.includes(EN_MANO)), JSON.stringify(inv.manos.dentro));
    const faltan = [...EN_LA_BOLSA.filter((n) => !inv.bolsa.dentro.some((t) => t.includes(n))),
      ...PUESTOS.filter((n) => !inv.bolsa.columna.some((f) => f.texto === n))];
    control("A6. en el primer contenedor las otras tres armas, y la armadura y el casco en la columna (el 97), leídos del panel",
      !faltan.length, faltan.length ? `faltan ${faltan.join(", ")}` : `${inv.bolsa.dentro.join(" · ")} | ${inv.bolsa.columna.map((f) => f.texto).join(" · ")}`);
    control("A7. el panel dice el oro: 100000", /Gold: 100,?000\b/.test(inv.manos.oro ?? ""), String(inv.manos.oro));
    // EL 96 (armadura): llegan PUESTAS. Se lee de los objetos vivos del juego, y
    // el fénix además tiene que haber registrado su armadura (`registerarmor`,
    // armor_base.script:41) — el casco gris no, que no incluye armor_base.
    const puestos = await pag.evaluate(() => window.probe.armadura.puestos);
    control("A7b. la armadura y el casco llegan PUESTOS, y el fénix registró su armadura",
      ["armor_pheonix55", "armor_helm_gray"].every((id) => puestos.some((o) => o.id === id))
        && Boolean(puestos.find((o) => o.id === "armor_pheonix55")?.armadura), JSON.stringify(puestos));

    // La recarga, con la misma URL: no se vuelve a importar. Control positivo
    // del mismo número: A1 vio «importado» en la primera carga.
    consola.length = 0;
    await pag.reload({ waitUntil: "load" });
    await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
    const otra = consola.find((t) => t.startsWith(`personaje de pruebas «${PEDIDO}»`)) ?? null;
    control("A8. al recargar con la misma URL NO se pisa (ya estaba importado)", /ya estaba importado/.test(otra ?? ""), String(otra));
    await ctx.close();
  }

  // ════ B. CON SERVIDOR ═══════════════════════════════════════════════════
  console.log("\n  B. CON SERVIDOR");
  const salida = [];
  partida = spawn(process.execPath, [
    "tools/servidor.mjs", "--puerto", String(PUERTO_PARTIDA), "--nombre", "La sonda 96", "--personajes", CARPETA,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  partida.stdout.on("data", (b) => salida.push(String(b)));
  partida.stderr.on("data", (b) => salida.push(`ERR ${b}`));
  await esperarHttp(`http://localhost:${PUERTO_PARTIDA}/partidas`, { tope: 90_000, proceso: partida, quien: "el servidor de partida" });   // el 98
  {
    const ctx = await nav.newContext({ viewport: { width: 1200, height: 800 } });
    const pag = await ctx.newPage();
    vigilar(pag, "B");
    await parar(pag);
    await entrarPorElMenu(pag, PUERTO_WEB, { extra: `red=ws://localhost:${PUERTO_PARTIDA}/juego` });
    await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
    const lista = await pag.evaluate(() => window.probe.sesion.listar());
    const k = lista.findIndex((c) => c.id === ID);
    const enPantalla = await ranuraDe(pag, NOMBRE);
    control("B1. la lista que manda el servidor lo trae, y sale escrito en una ranura",
      k >= 0 && enPantalla.length === 1, `${JSON.stringify(lista.map((c) => c.nombre))}, ${enPantalla.length} etiqueta(s)`);
    await pulsarRanura(pag, k);
    await pag.waitForFunction(() => window.probe.sesion.estado() === "jugando" && window.probe.vgui.abierto() === null,
      null, { timeout: 120000 }).catch(() => {});
    await esperar(1500);
    const costura = await (await fetch(`http://localhost:${PUERTO_PARTIDA}/costura`)).json().catch(() => null);
    const quien = sinRepetir((costura?.clientes ?? []).map((c) => c.personaje).filter(Boolean));
    control("B2. el SERVIDOR dice que el cliente ha entrado con ese personaje (/costura)",
      quien.includes(ID), JSON.stringify(quien));
    const dentro = await pag.evaluate(() => {
      const p = window.probe.sesion.personaje;
      return p ? { id: p.id, oro: p.oro, objetos: p.objetos.map((o) => o.id) } : null;
    });
    // EL 97: 9 en la lista y la Blood Drinker en la mano (versión 2 del
    // registro); hasta el 97 eran 10 porque la de la mano estaba en los dos.
    control("B3. y el cliente lo tiene con sus 9 objetos, la espada en la mano y su oro",
      dentro?.id === ID && dentro.objetos.length === 9 && !dentro.objetos.includes("swords_blood_drinker") && dentro.oro === 100000, JSON.stringify(dentro));
    const inv = await inventario(pag);
    console.log(`         manos  ${JSON.stringify(inv.manos.dentro)} · ${inv.manos.oro}`);
    console.log(`         bolsa  ${JSON.stringify(inv.bolsa.dentro)}`);
    control("B4. en el inventario, la Blood Drinker en las manos",
      inv.manos.dentro.some((t) => t.includes(EN_MANO)), JSON.stringify(inv.manos.dentro));
    const faltan = [...EN_LA_BOLSA.filter((n) => !inv.bolsa.dentro.some((t) => t.includes(n))),
      ...PUESTOS.filter((n) => !inv.bolsa.columna.some((f) => f.texto === n))];
    control("B5. y las otras tres armas en el contenedor, la armadura y el casco en la columna (el 97)",
      !faltan.length, faltan.length ? `faltan ${faltan.join(", ")}` : inv.bolsa.dentro.join(" · "));
    const errServidor = salida.filter((l) => l.startsWith("ERR"));
    control("B6. el servidor no ha escupido ningún error", !errServidor.length, errServidor.join(" ").slice(0, 300));
    await ctx.close();
  }
} catch (e) {
  // El 65: una caída es una ROJA, no una nota.
  control(`la sonda se cayó: ${String(e?.message ?? e).slice(0, 200)}`, false);
} finally {
  await nav.close().catch(() => {});
  matar(partida);
  matar(dev);
}

control("ni un error de página", !errores.length, errores.join(" | ").slice(0, 400));
const verdes = controles.filter((c) => c.bien).length;
console.log(`\n  ${verdes} de ${Math.max(DECLARADOS, controles.length)} en verde`);
if (controles.length < DECLARADOS) console.log(`  (corrieron ${controles.length} de ${DECLARADOS} declarados: los que faltan son rojos)`);
process.exit(verdes === DECLARADOS && controles.length === DECLARADOS ? 0 : 1);
