// EL SERVIDOR HACE LO QUE YA HACE EL JUEGO EN SOLITARIO — experimento 98.
//
//   npm run sonda:servidor98
//
// Chrome de verdad contra un servidor de verdad (`tools/servidor.mjs`), en DOS
// fases, cada una con su servidor:
//
// FASE 1, Gate City, en el sitio de nacer del mapa (lejos de los bichos). Dos
// personajes fabricados por `tools/personaje.mjs` —el «Veteran» del 96, con el
// fénix PUESTO— y una diferencia escrita en el disco antes de levantarlo:
//
//   - «Servidor98a» tiene las habilidades de un personaje RECIÉN CREADO: su
//     fuerza no llega a los 40 del fénix (armor_pheonix55.script:16), así que
//     el `failed_str_req_loop` de la pieza le pone `effect_slow 50%` cada diez
//     segundos (armor_base.script:100, :173-181).
//   - «Servidor98b» es Veteran tal cual: el control, mismo fénix y sin bucle.
//
//   1. las trabas viajan: A las recibe en su foto, B nunca
//   2. el reloj de la pieza corre EN EL SERVIDOR y una sola vez: un «You are
//      being slowed.» por vuelta, no dos (el navegador no corre el suyo)
//   3. A anda a ≤ 50 u/s según el servidor, B a más de 100 (control)
//   4. y el navegador de A PREDICE con las mismas trabas
//   5. A no salta; B sí (control)
//
// FASE 2, gertenheld_forest2, al lado de los cinco esqueletos venenosos (parry
// 40, 350 de vida; su guion NO anula `game_parry`, así que dice UNA «Your
// attack was parried!» por parada: el control positivo del 97,
// doc/OVERRIDE_97.md §6). B y «Servidor98c», otro Veteran:
//
//   6. `game_damaged`: a quien un esqueleto le entra, su guion del navegador
//      apunta `PL_BEEN_ATTACKED`; al otro, sólo si le entró a él
//   7. el parry: B pega y lee UNA frase por parada (hasta el 98, dos: el
//      relevo de `case "para"` y el guion), y C, que no pega, ninguna (hasta
//      el 98, una por cada parada de B)
//
// Por qué dos fases y no una: la primera versión ponía a A —15 de vida, por
// las habilidades de recién creado— al lado de la araña de Gate City. Moría,
// reaparecía junto a otro jugador (`_sitioLibre` aparta, sin mirar la
// geometría) y su cápsula se quedaba metida en la roca: cada
// `computeColliderMovement` de Rapier tardaba SEGUNDOS y el servidor dejaba
// de contestar (pausado con el inspector: doc/SERVIDOR_98.md §7). Y la araña
// (30 de vida, parry 50 con la tirada de acierto uniforme) moría antes de
// parar nada.
//
// LO QUE SE MIDE ES LO QUE LLEGA AL NAVEGADOR Y LO QUE ÉL HACE CON ELLO: los
// marcos del WebSocket de cada página (las fotos, con su `trabas`, la rapidez
// y los pies que el SERVIDOR le da, sus sucesos y los textos), lo que el bucle
// de `main.js` leyó (`probe.trabas.ultimas`, no recalculado), las variables
// del guion del jugador del navegador (`probe.jugador.variable`) y su consola,
// contada tras una marca (`probe.hud.suceso`) y no por longitudes del anillo.
//
// Se entra POR EL MENÚ (CLAUDE.md §3) y se elige el personaje con el ratón,
// como `sondas/defensared97.mjs`. Se anda con la W y se salta con la barra.

import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { liberarPuerto, lanzarVite, esperarHttp } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";
import { crearPersonaje } from "../src/juego/personaje.js";

const PUERTO_WEB = 5981;
const PUERTO_PARTIDA = 5982;
const CARPETA = "build/partidas/servidor98/personajes";
const ESQUELETO = "monsters/skeleton_poison_random";
/** A dos metros de los esqueletos de gertenheld_forest2 (build/gertenheld_forest2/bichos.json: x 82,1-83,7, z −45,1 a −41,7). */
const NACER_BOSQUE = "80.0,-3.2,-43.5";

const DECLARADOS = 18;
const controles = [];
const control = (que, bien, detalle = "") => {
  controles.push({ que, bien: Boolean(bien), detalle });
  console.log(`  ${bien ? "ok  " : "MAL "} ${que}${detalle ? `\n         ${detalle}` : ""}`);
  return bien;
};
const errores = [];
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const matar = (p) => { if (!p) return; try { spawnSync("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

// ── los tres personajes, con la herramienta de verdad ──────────────────────
try { rmSync("build/partidas/servidor98", { recursive: true, force: true }); } catch {}
for (const nombre of ["Servidor98a", "Servidor98b", "Servidor98c"]) {
  const r = spawnSync(process.execPath, ["tools/personaje.mjs", "--nombre", nombre, "--mapa", "servidor98"], { encoding: "utf8" });
  if (r.status !== 0) { console.error(r.stdout, r.stderr); process.exit(1); }
}
const ID = { A: "pruebas-servidor98a", B: "pruebas-servidor98b", C: "pruebas-servidor98c" };
{
  // A: las habilidades de uno recién creado. En el disco del servidor, que es
  // donde vive el personaje con red, y en su respaldo.
  const debiles = crearPersonaje({ nombre: "x" }).habilidades;
  for (const f of [`${CARPETA}/${ID.A}.json`, `${CARPETA}/${ID.A}.bak.json`]) {
    if (!existsSync(f)) continue;
    const p = JSON.parse(readFileSync(f, "utf8"));
    p.habilidades = debiles;
    writeFileSync(f, JSON.stringify(p, null, 1));
  }
}

const liberados = [...liberarPuerto(PUERTO_WEB), ...liberarPuerto(PUERTO_PARTIDA)];
if (liberados.length) console.log(`  (había ${liberados.length} proceso(s) en los puertos: matados)`);
const dev = lanzarVite(PUERTO_WEB);

/** Un servidor de partida. `SONDA_NODE_ARGS` (p. ej. «--inspect=9333») para mirar dentro si se cuelga. */
let partida = null;
const salida = [];
async function levantar(extra) {
  if (partida) { matar(partida); await esperar(1500); liberarPuerto(PUERTO_PARTIDA); }
  partida = spawn(process.execPath, [
    ...(process.env.SONDA_NODE_ARGS ? process.env.SONDA_NODE_ARGS.split(" ") : []),
    "tools/servidor.mjs", "--puerto", String(PUERTO_PARTIDA), "--nombre", "La sonda 98",
    "--personajes", CARPETA, ...extra,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  partida.stdout.on("data", (b) => salida.push(String(b)));
  partida.stderr.on("data", (b) => salida.push(`ERR ${b}`));
  await esperarHttp(`http://localhost:${PUERTO_PARTIDA}/partidas`, { tope: 120_000, proceso: partida, quien: "el servidor de partida" });
}
const costura = async () => (await fetch(`http://localhost:${PUERTO_PARTIDA}/costura`)).json();
const sinErrores = () => !salida.some((l) => l.startsWith("ERR") && !/Debugger|inspector/.test(l));

async function pulsarRanura(pag, k) {
  const b = (await pag.evaluate(() => window.probe.vgui.botones())).find((x) => x.i === 2 * k);
  if (!b) return false;
  await pag.mouse.click(b.centro, b.arriba + 12);
  return true;
}

await esperarHttp(`http://localhost:${PUERTO_WEB}/`, { tope: 90_000, proceso: dev, quien: "vite" });

// ── LAS ROTURAS DELIBERADAS DEL NAVEGADOR (CLAUDE.md §4) ──────────────────
//
// `ROTURA98=C1,C2,C3,C4 npm run sonda:servidor98`. Se rompe src/main.js SÓLO
// para las páginas de esta sonda: Playwright intercepta el módulo que sirve
// Vite y lo devuelve cambiado. Romper el archivo del árbol rompería a la vez
// las sondas de las otras sesiones. Cada reemplazo tiene que casar UNA vez o
// la sonda se cae (el 80: una rotura que no casa deja todo verde).
const ROTURAS = (process.env.ROTURA98 ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const REEMPLAZOS = {
  // el navegador no junta las trabas del cable
  C1: [/const trabas = red\?\.trabas/, "const trabas = false && red?.trabas"],
  // el navegador mueve también el reloj de las piezas que corren en el servidor
  C2: [/if \(red && correEnElServidor\(fichaDeObjeto\(ent\.id\), ent\.puesto\)\) continue;/, "if (false) continue;"],
  // el relevo del parry vuelve a `case "para"` (lo de antes del 98)
  C3: [/cuentas\.parados\+\+;\s*break;\s*case "golpeado":/,
    'cuentas.parados++; suceso("ataque", `Your attack was ${i?.ficha.ia?.mensajeDeParry ?? "parried!"}`); break; case "golpeado":'],
  // nadie llama a `game_damaged` con servidor
  C4: [/case "golpeado":/, 'case "golpeado-roto":'],
};
async function romperEnLaPagina(pag) {
  await pag.route(/\/src\/main\.js(\?|$)/, async (route) => {
    const r = await route.fetch();
    let cuerpo = await r.text();
    for (const k of ROTURAS) {
      const [re, por] = REEMPLAZOS[k] ?? [];
      const n = re ? (cuerpo.match(new RegExp(re.source, "g")) ?? []).length : 0;
      if (n !== 1) { errores.push(`la rotura ${k} casa ${n} veces: NO está puesta`); continue; }
      cuerpo = cuerpo.replace(re, por);
      if (!rotasPuestas.includes(k)) rotasPuestas.push(k);
    }
    await route.fulfill({ response: r, body: cuerpo });
  });
}
const rotasPuestas = [];
if (ROTURAS.length) console.log(`  ROTURAS DELIBERADAS: ${ROTURAS.join(", ")}`);

/** Lo que le llega a cada página por SU WebSocket. */
const cable = {};
const nuevoCable = () => ({ textos: [], fotos: [], sucesos: [], yo: null });
const pags = {};
const nav = await chromium.launch();
try {
  const abrirUnaVez = async (quien, mapa) => {
    const id = ID[quien];
    const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
    try {
      // Sin el recargado en caliente de Vite: el árbol es compartido (el 93).
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
      pag.on("pageerror", (e) => errores.push(`${quien}: ${String(e).slice(0, 200)}`));
      if (ROTURAS.length) await romperEnLaPagina(pag);
      pag.on("websocket", (ws) => {
        if (!ws.url().includes(`:${PUERTO_PARTIDA}/`)) return;
        ws.on("framereceived", (f) => {
          let m = null;
          try { m = JSON.parse(typeof f.payload === "string" ? f.payload : f.payload.toString("utf8")); } catch { return; }
          const c = cable[quien];
          if (!c) return;
          const t = Date.now();
          if (m?.t === "texto" && typeof m.texto === "string") c.textos.push({ t, texto: m.texto, titulo: m.titulo ?? null, tipo: m.tipo });
          if (m?.t === "foto") {
            const mio = (m.jugadores ?? []).find((j) => j.id === c.yo) ?? null;
            c.fotos.push({ t, trabas: m.trabas ?? null, mio });
            for (const s of m.sucesos ?? []) c.sucesos.push({ t, ...s });
          }
        });
      });
      await entrarPorElMenu(pag, PUERTO_WEB, { ...(mapa ? { mapa } : {}), extra: `red=ws://localhost:${PUERTO_PARTIDA}/juego` });
      await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
      const lista = await pag.evaluate(() => window.probe.sesion.listar());
      const k = lista.findIndex((c) => c.id === id);
      if (k < 0) throw new Error(`${quien}: el servidor no lista ${id}`);
      await pulsarRanura(pag, k);
      await pag.waitForFunction(() => window.probe.sesion.estado() === "jugando" && window.probe.vgui.abierto() === null,
        null, { timeout: 90000 });
      let h = null, tiene = null;
      for (let j = 0; j < 20 && tiene !== id; j++) {
        if (j) await esperar(1000);
        h = await pag.evaluate(() => window.probe.red.estado()?.yo ?? null);
        tiene = (await costura()).clientes.find((x) => x.id === h)?.personaje ?? null;
      }
      if (tiene !== id) throw new Error(`${quien}: el servidor no tiene a ${id} en el hueco ${h}`);
      cable[quien].yo = h;
      return pag;
    } catch (e) {
      await pag.close().catch(() => {});
      throw e;
    }
  };
  const abrir = async (quien, mapa = null) => {
    for (let intento = 1; ; intento++) {
      cable[quien] = nuevoCable();
      try { pags[quien] = await abrirUnaVez(quien, mapa); return pags[quien]; } catch (e) {
        if (intento >= 4) throw e;   // con la máquina compartida la entrada se agota a veces (§7)
        console.log(`    (${quien}: la entrada falló «${String(e?.message ?? e).slice(0, 80)}», intento ${intento + 1})`);
        await esperar(3000);
      }
    }
  };
  // CADA PÁGINA AL FRENTE antes de moverla: una pestaña de fondo no tiene
  // `requestAnimationFrame`, así que su bucle no corre y no manda órdenes —
  // una pasada midió 5 fotos en 1,5 s y un salto sin pies.
  const alFrente = async (q) => { await pags[q].bringToFront(); await esperar(300); };
  const dicho = (q) => pags[q].evaluate(() => window.probe.misiones.dicho());
  const marcar = (q, m) => pags[q].evaluate((x) => window.probe.hud.suceso("normal", x), m);
  /** Lo que la consola de `q` ha pintado desde la marca `m`; `null` si la marca ya no está en el anillo. */
  const trasONada = async (q, m) => {
    const todo = await dicho(q);
    const desde = todo.lastIndexOf(`normal: ${m}`);
    return desde < 0 ? null : todo.slice(desde + 1);
  };
  /**
   * UN LECTOR DE LA CONSOLA QUE NO PIERDE LÍNEAS. El anillo de
   * `probe.misiones.dicho()` guarda las últimas; con cinco esqueletos
   * mordiendo, una tanda larga lo vaciaba y su marca desaparecía (23 de 32
   * tandas tiradas en una pasada). Dentro de la página, cada 50 ms, se copia
   * lo nuevo del anillo a una lista que sólo crece: lo nuevo es lo que queda
   * tras el solape más largo entre el final de la lectura anterior y el
   * principio de ésta. En 50 ms no caben 128 líneas.
   */
  const leerSinPerder = (q) => pags[q].evaluate(() => {
    if (window.__lineas98) return;
    window.__lineas98 = [];
    let antes = [];
    setInterval(() => {
      const ahora = window.probe.misiones.dicho();
      let o = Math.min(antes.length, ahora.length);
      for (; o > 0; o--) {
        let igual = true;
        for (let i = 0; i < o; i++) if (antes[antes.length - o + i] !== ahora[i]) { igual = false; break; }
        if (igual) break;
      }
      for (const l of ahora.slice(o)) window.__lineas98.push(l);
      antes = ahora;
    }, 50);
  });
  const lineas = (q) => pags[q].evaluate(() => window.__lineas98.length);
  const lineasDesde = (q, n) => pags[q].evaluate((k) => window.__lineas98.slice(k), n);
  const tras = async (q, m) => {
    const r = await trasONada(q, m);
    if (!r) throw new Error(`la marca ${m} no está en la consola de ${q}`);
    return r;
  };

  // ═════════════════════ FASE 1: GATE CITY, A Y B ═════════════════════════
  await levantar([]);
  await abrir("A");
  await abrir("B");
  const c0 = await costura();
  const pj = (q) => c0.clientes.find((x) => x.id === cable[q].yo)?.personaje ?? null;
  control("fase 1: A y B han entrado por el menú con su personaje, y el servidor los tiene",
    pj("A") === ID.A && pj("B") === ID.B, `A ${cable.A.yo}=${pj("A")} · B ${cable.B.yo}=${pj("B")}`);

  // ── 1. LAS TRABAS VIAJAN ─────────────────────────────────────────────────
  await esperar(3000);
  const conTrabas = (q) => cable[q].fotos.filter((f) => f.trabas);
  const ultTrA = conTrabas("A").at(-1)?.trabas ?? null;
  const srvTrA = (await costura()).efectos.find((e) => e.cliente === cable.A.yo)?.trabas ?? null;
  control("A recibe sus trabas en la foto (su `clientdata`): 50 % y sin salto, las del servidor; B ninguna",
    ultTrA?.porcentaje === 50 && ultTrA?.noSaltar === true && conTrabas("B").length === 0 &&
      ultTrA.porcentaje === srvTrA?.porcentaje,
    `A ${JSON.stringify(ultTrA)} en ${conTrabas("A").length}/${cable.A.fotos.length} fotos (servidor ${JSON.stringify(srvTrA)}) · B ${conTrabas("B").length}`);
  const leidas = async (q) => pags[q].evaluate(() => {
    const t = window.probe.trabas.ultimas;
    return t ? { porcentaje: t.porcentaje, noSaltar: t.noSaltar, quien: t.quien.map((x) => x.que) } : null;
  });
  await alFrente("A");
  const lA = await leidas("A");
  await alFrente("B");
  const lB = await leidas("B");
  control("el bucle de main.js de A las LEE (juntadas con las suyas); el de B no tiene ninguna",
    lA?.porcentaje === 50 && lA?.noSaltar === true && lA.quien.includes("servidor") && !(lB?.porcentaje) && !lB?.noSaltar,
    `A ${JSON.stringify(lA)} · B ${JSON.stringify(lB)}`);

  // ── 2. EL RELOJ DE LA PIEZA, UNA VEZ ─────────────────────────────────────
  // Una vuelta NUEVA, tras una marca en la consola de A: la primera llegó al
  // entrar y el anillo de la consola puede haberse llenado mientras B entraba
  // (una pasada leyó «consola 0» con el juego bien: el 97, el anillo no es la
  // consola). Si el navegador corriera también el reloj de su copia del fénix,
  // la consola tendría dos por vuelta y el cable una.
  await alFrente("A");
  const lentos = (l) => l.filter((x) => /You are being slowed/.test(x));
  const MARCA = "#servidor98 reloj";
  await marcar("A", MARCA);
  const tMarca = Date.now();
  let t1 = null;
  for (let k = 0; k < 150 && !t1; k++) {
    await esperar(100);
    t1 = cable.A.textos.find((x) => x.t > tMarca && /You are being slowed/.test(x.texto))?.t ?? null;
  }
  if (t1) await esperar(Math.max(0, t1 + 9000 - Date.now()));
  // Desde medio segundo antes: el `infomsg` va ANTES del `applyeffect` en el
  // mismo evento (armor_base.script:180-181).
  const enVentana = t1 ? cable.A.textos.filter((x) => x.t >= t1 - 500 && x.t < t1 + 9000) : [];
  const consolaA = await tras("A", MARCA);
  control("EL RELOJ DE LA PIEZA corre en el servidor y UNA vez: en 9 s, un «You are being slowed.» por el cable y uno en la consola",
    Boolean(t1) && lentos(enVentana.map((x) => x.texto)).length === 1 && lentos(consolaA).length === 1,
    `cable ${lentos(enVentana.map((x) => x.texto)).length}, consola ${lentos(consolaA).length}; ` +
      `avisos de fuerza ${enVentana.filter((x) => /Insufficient Strength/.test(x.titulo ?? "")).length}`);
  control("CONTROL: a B (Veteran, fuerza ≥ 40) no le llega ninguna lentitud",
    !cable.B.textos.some((x) => /slowed|Insufficient Strength/.test(`${x.texto} ${x.titulo ?? ""}`)), "");

  // ── 3 y 4. LO QUE ANDA, SEGÚN EL SERVIDOR Y SEGÚN LA PREDICCIÓN ──────────
  // La rapidez del SERVIDOR es la de las fotos (`rapidez` del propio jugador,
  // u/s); la de la predicción, `probe.player.rapidez`.
  const andar = async (q, ms = 2000) => {
    const pag = pags[q];
    await alFrente(q);
    const corr0 = (await pag.evaluate(() => window.probe.red.estado()?.correcciones ?? 0));
    const t0 = Date.now();
    const pred = [];
    await pag.keyboard.down("KeyW");
    for (let k = 0; k < ms / 100; k++) { await esperar(100); pred.push(await pag.evaluate(() => window.probe.player.rapidez ?? 0)); }
    await pag.keyboard.up("KeyW");
    await esperar(400);
    const corr1 = (await pag.evaluate(() => window.probe.red.estado()?.correcciones ?? 0));
    const srv = cable[q].fotos.filter((f) => f.t > t0 + 500 && f.t < t0 + ms).map((f) => f.mio?.rapidez ?? 0);
    const med = (l) => { const s = [...l].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
    return { servidor: med(srv), max: Math.max(0, ...srv), prediccion: med(pred.slice(5)), correcciones: corr1 - corr0, n: srv.length };
  };
  const vA = await andar("A");
  const vB = await andar("B");
  console.log(`  A: servidor ${vA.servidor.toFixed(1)} (máx ${vA.max.toFixed(1)}) u/s, predicción ${vA.prediccion.toFixed(1)}, ${vA.correcciones} correcciones · ` +
    `B: servidor ${vB.servidor.toFixed(1)} (máx ${vB.max.toFixed(1)}), predicción ${vB.prediccion.toFixed(1)}, ${vB.correcciones} correcciones`);
  control("A anda LENTA según el servidor (≤ 50 u/s, `min(fSpeed·0,5, 50)`)",
    vA.n > 10 && vA.max > 15 && vA.max <= 51, `mediana ${vA.servidor.toFixed(1)}, máx ${vA.max.toFixed(1)} en ${vA.n} fotos`);
  control("CONTROL: B, con el mismo fénix y sin bucle, anda a más de 100 u/s según el servidor",
    vB.servidor > 100, `mediana ${vB.servidor.toFixed(1)}`);
  // Las correcciones se dicen y no se cuentan: B, sin trabas, también corrige
  // (pendiente, doc/SERVIDOR_98.md §8).
  control("y el navegador de A PREDICE con las mismas trabas (su rapidez ≤ 51 u/s)",
    vA.prediccion > 10 && vA.prediccion <= 51,
    `predicción ${vA.prediccion.toFixed(1)}, ${vA.correcciones} correcciones (B ${vB.correcciones})`);

  // ── 5. EL SALTO ──────────────────────────────────────────────────────────
  const saltar = async (q) => {
    await alFrente(q);
    const t0 = Date.now();
    await pags[q].keyboard.down("Space");
    await esperar(150);
    await pags[q].keyboard.up("Space");
    await esperar(1200);
    const ys = cable[q].fotos.filter((f) => f.t >= t0 - 200 && f.mio?.pies).map((f) => f.mio.pies[1]);
    return ys.length ? Math.max(...ys) - ys[0] : null;
  };
  const sA = await saltar("A"), sB = await saltar("B");
  control("A no salta (NOJUMP del `effect_slow`, en el servidor); B sí, con la misma barra",
    sA !== null && sA < 0.05 && sB > 0.4, `A sube ${sA?.toFixed?.(3)} m, B ${sB?.toFixed?.(3)} m`);
  const cF1 = await costura();
  control("fase 1: el servidor no ha escupido ningún error y tiene los guiones de objeto",
    sinErrores() && (cF1.defensa?.sinGuiones ?? 0) === 0,
    `sinGuiones ${cF1.defensa?.sinGuiones}, piezas A ${JSON.stringify(cF1.efectos.find((e) => e.cliente === cable.A.yo)?.piezas ?? null)}`);

  // ═════════════════ FASE 2: GERTENHELD, B Y C CON LOS ESQUELETOS ═════════
  for (const q of ["A", "B"]) await pags[q].close().catch(() => {});
  await levantar(["--mapa", "gertenheld_forest2", "--nacer", NACER_BOSQUE]);
  const B2 = await abrir("B", "gertenheld_forest2");
  await abrir("C", "gertenheld_forest2");
  const c2 = await costura();
  const pj2 = (q) => c2.clientes.find((x) => x.id === cable[q].yo)?.personaje ?? null;
  control("fase 2: B y C han entrado por el menú en gertenheld_forest2",
    pj2("B") === ID.B && pj2("C") === ID.C, `B ${pj2("B")} · C ${pj2("C")}`);

  // ── 6. `game_damaged` ────────────────────────────────────────────────────
  // Los esqueletos muerden a quien quieran. Se espera a que a alguno le entre
  // un golpe (`golpeado`, MSG_ONE) y se mira SU guion del navegador.
  let golpeado = null;
  for (let k = 0; k < 60 && !golpeado; k++) {
    await esperar(1000);
    golpeado = ["B", "C"].find((q) => cable[q].sucesos.some((s) => s.que === "golpeado")) ?? null;
  }
  if (golpeado) {
    await esperar(500);
    const ultimo = cable[golpeado].sucesos.filter((s) => s.que === "golpeado").at(-1);
    const vars = await pags[golpeado].evaluate(() => ({
      atacado: window.probe.jugador.variable("PL_BEEN_ATTACKED"),
      cuanto: window.probe.jugador.variable("LAST_STRUCK_FOR"),
    }));
    control(`\`game_damaged\` con servidor: a ${golpeado} le entra un golpe y SU guion del navegador apunta PL_BEEN_ATTACKED`,
      vars.atacado === "1" && Number(vars.cuanto) > 0,
      `PL_BEEN_ATTACKED ${vars.atacado}, LAST_STRUCK_FOR ${vars.cuanto} (último golpe ${ultimo?.dano} de ${ultimo?.atacante})`);
    const otro = golpeado === "B" ? "C" : "B";
    const nOtro = cable[otro].sucesos.filter((s) => s.que === "golpeado").length;
    const vOtro = await pags[otro].evaluate(() => window.probe.jugador.variable("PL_BEEN_ATTACKED"));
    control(`y a ${otro} sólo le llegan SUS golpes: su guion apunta el golpe sólo si le entró alguno`,
      (nOtro > 0) === (vOtro === "1"), `${otro}: ${nOtro} golpeados, PL_BEEN_ATTACKED ${vOtro}`);
  } else {
    control("`game_damaged` con servidor: un esqueleto tenía que morder a alguno en 60 s", false, "");
    control("(sin golpe no hay reparto que medir)", false, "");
  }

  // ── 7. EL PARRY DEL ESQUELETO ────────────────────────────────────────────
  // B le pega hasta que para tres. Con los PUÑOS (`probe.golpe.empunar
  // ("fist_bare")`, sólo en su navegador: el daño lo calcula él y el servidor
  // sólo lo topa), para que 350 de vida den para muchos golpes: el parry 40
  // contra una tirada de acierto uniforme para pocas veces. Es un atajo del
  // instrumento, dicho; el golpe va por `MENSAJE.PEGAR` como el de un jugador.
  await alFrente("B");
  await B2.evaluate(() => window.probe.golpe.empunar("fist_bare"));
  await leerSinPerder("B"); await leerSinPerder("C");
  // Que los puños estén de verdad en la mano antes de pegar: con la Blood
  // Drinker todavía puesta (12,5 de daño medio en una pasada) los cinco
  // esqueletos morían en 140 golpes; con los puños (0,6) no mueren.
  for (let k = 0; k < 50 && (await B2.evaluate(() => window.probe.golpe.estado?.arma)) !== "fist_bare"; k++) await esperar(200);
  console.log(`  (en la mano de B: ${await B2.evaluate(() => window.probe.golpe.estado?.arma)})`);
  const frases = { B: 0, C: 0 };
  // Las paradas que se cuentan son las de las tandas cuya marca sigue en las
  // dos consolas: una pasada se cayó con «la marca no está en la consola de
  // B» (el anillo se llenó en 0,7 s, con los esqueletos mordiendo). Una tanda
  // así se tira entera —sus frases y sus paradas—, y se dice cuántas.
  let contadas = 0, tiradas = 0;
  const n0 = cable.B.sucesos.length;
  const paradasDeB = () => cable.B.sucesos.slice(n0).filter((s) => s.que === "tupegas" && s.parado);
  const golpesDeB = () => cable.B.sucesos.slice(n0).filter((s) => s.que === "tupegas" && s.vale);
  const mirarEsqueleto = () => B2.evaluate((g) => {
    let mejor = null;
    for (let n = 0; n < 5; n++) {
      const r = window.probe.ia.bicho(g, n);
      if (!r || r.muerto) continue;
      const p = window.probe.player.feet;
      const a = Math.hypot(r.donde[0] - p[0], r.donde[2] - p[2]);
      if (!mejor || a < mejor.a) mejor = { a, donde: r.donde };
    }
    if (mejor) window.probe.mundo.mirar(mejor.donde[0], mejor.donde[1] + 0.8, mejor.donde[2]);   // TRES números (el 78)
    return mejor?.a ?? null;
  }, ESQUELETO);
  // LA VENTANA DE CADA TANDA EMPIEZA Y ACABA EN SILENCIO (aviso del
  // integrador, 17 de 18: «4 frases en 3 paradas contadas», con 4 paradas y 4
  // frases en total). La tanda medía 0,7 s fijos: un `tupegas` que llegaba
  // tarde caía en el hueco entre tandas —antes de la marca siguiente— y su
  // frase, que viaja por otro mensaje, DESPUÉS de ella. No era el juego: era
  // la ventana partiendo una parada en dos. Ahora se espera, antes de marcar
  // y antes de leer, a que pasen 0,5 s sin ningún `tupegas` nuevo ni ninguna
  // «Your attack was» nueva por el cable de B, así que una parada y su frase
  // caen las dos dentro de la misma tanda.
  const ruidoDeB = () => cable.B.sucesos.filter((x) => x.que === "tupegas").length +
    cable.B.textos.filter((x) => /Your attack was/.test(x.texto)).length;
  const silencio = async (tope = 8000) => {
    let n = ruidoDeB(), quieto = 0;
    for (let t = 0; t < tope && quieto < 500; t += 100) {
      await esperar(100);
      const m = ruidoDeB();
      if (m === n) quieto += 100; else { n = m; quieto = 0; }
    }
    return quieto >= 500;
  };
  // Y SIN QUEDARSE CORTA: el parry 40 contra una tirada de acierto uniforme
  // para un 2-5 % de los golpes; una pasada acabó con cero paradas. Se pega
  // hasta tres paradas contadas o seis minutos, y se dice por qué acabó.
  const tFin = Date.now() + 6 * 60_000;   // cabe en los 900 s del lanzador
  let porQue = "tres paradas";
  let tandas = 0;
  const motivos = { ruido: 0, anillo: 0 };
  for (let k = 0; contadas < 3; k++) {
    tandas++;
    if (Date.now() > tFin) { porQue = "seis minutos"; break; }
    let a = await mirarEsqueleto();
    if (a === null) { porQue = "no quedan esqueletos vivos"; break; }
    if (a > 1.0) {
      await B2.keyboard.down("KeyW");
      await esperar(Math.min(600, 150 + (a - 1.0) * 400));
      await B2.keyboard.up("KeyW");
      a = await mirarEsqueleto();
    }
    if (!(await silencio())) { tiradas++; motivos.ruido++; continue; }
    await esperar(120);   // que el lector haya copiado lo de antes del silencio
    const [l0B, l0C] = [await lineas("B"), await lineas("C")];
    const p0 = paradasDeB().length;
    // Tres golpes por tanda: el silencio de las dos puntas cuesta un segundo, y
    // con uno solo por tanda una pasada dio 22 golpes en seis minutos.
    for (let g = 0; g < 3; g++) { await B2.evaluate(() => window.probe.golpe.atacar(1.2)); await esperar(250); }
    await esperar(500);
    const quieto = await silencio();
    await esperar(120);
    const [tB, tC] = [await lineasDesde("B", l0B), await lineasDesde("C", l0C)];
    if (!quieto) { tiradas++; motivos.ruido++; continue; }
    contadas += paradasDeB().length - p0;
    frases.B += tB.filter((x) => /Your attack was/.test(x)).length;
    frases.C += tC.filter((x) => /Your attack was/.test(x)).length;
  }
  const todos = cable.B.sucesos.slice(n0).filter((x) => x.que === "tupegas");
  const esqs = await B2.evaluate((g) => [0, 1, 2, 3, 4].map((n) => {
    const r = window.probe.ia.bicho(g, n);
    const p = window.probe.player.feet;
    return r ? { vida: Math.round(r.vida), muerto: r.muerto, dormido: r.dormido, a: Number(Math.hypot(r.donde[0] - p[0], r.donde[2] - p[2]).toFixed(1)) } : null;
  }), ESQUELETO);
  console.log(`  (esqueletos al acabar: ${JSON.stringify(esqs)}; tandas ${tandas} (tiradas por ruido ${motivos.ruido}, por el anillo ${motivos.anillo}); daño medio ${(todos.filter((x) => x.vale).reduce((s, x) => s + (x.dano ?? 0), 0) / Math.max(1, todos.filter((x) => x.vale).length)).toFixed(2)})`);
  console.log(`  (el bucle del parry acabó por: ${porQue}; tupegas ${todos.length}: ${todos.filter((x) => x.vale).length} valen, ${todos.filter((x) => x.lejos).length} lejos)`);
  const pB = paradasDeB();
  console.log(`  el parry: ${pB.length} paradas en ${golpesDeB().length} golpes que llegan (${contadas} en tandas contadas, ${tiradas} tandas tiradas); frases B ${frases.B}, C ${frases.C}`);
  control("CONTROL POSITIVO: el esqueleto le para a B (≥ 1 `tupegas` parado) y su guion lo recibe (`hablaElGuion`)",
    pB.length >= 1 && pB.every((s) => s.hablaElGuion === true),
    `${pB.length} paradas, hablaElGuion ${JSON.stringify(pB.map((s) => s.hablaElGuion))}`);
  control("EL PARRY CON SERVIDOR: B lee UNA «Your attack was parried!» por parada, no dos",
    contadas >= 1 && frases.B === contadas, `${frases.B} frases en ${contadas} paradas contadas`);
  control("y a C, que no pegó, no le llega ninguna",
    frases.C === 0, `${frases.C}`);
  // UN FALLO QUE NO ES DE ESTO, encontrado aquí y DICHO: el guion del
  // esqueleto hace `givehp HP_TO_GIVE` al morder (skeleton_poison_random.
  // script:304) y el entorno de un NPC no tiene el gancho `dar`, así que el
  // intérprete lanza «e.dar is not a function» (src/play/guion.js, `givehp`)
  // en la costura «danaAOtro». Pasa también en solitario: es el mismo
  // `GuionDeNpc`. Gate City no lo enseña (ningún bicho suyo cura al morder);
  // lo enseña el segundo mapa, el 50 otra vez. Pendiente en
  // doc/SERVIDOR_98.md §8; se imprime y no se cuenta, y cualquier OTRO error
  // sí pone esto rojo.
  const conocido = (l) => /danaAOtro|e\.dar is not a function|^\s+at /.test(l);
  // La costura primero y la salida después (1,5 s): un aviso que todavía
  // viaja por la tubería no puede dejar el contador por delante del texto.
  const cF2 = await costura();
  await esperar(1500);
  const otros = salida.filter((l) => l.startsWith("ERR") && !/Debugger|inspector/.test(l) && !conocido(l.slice(4)));
  const nDar = salida.join("").split("e.dar is not a function").length - 1;
  if (nDar) console.log(`  (pendiente, sin contar: ${nDar} «e.dar is not a function» del \`givehp\` del esqueleto)`);
  control("fase 2: el servidor no ha escupido ningún error que no esté dicho",
    !otros.length && (cF2.fallos ?? 0) <= nDar,
    otros.join(" ").slice(0, 300) || `fallos de la costura ${cF2.fallos}, ${nDar} de ellos el \`givehp\``);
} catch (e) {
  control(`la sonda se cayó: ${String(e?.message ?? e).split("\n")[0].slice(0, 200)}`, false);
} finally {
  await nav.close().catch(() => {});
  matar(partida);
  matar(dev);
}

if (ROTURAS.length) console.log(`  roturas puestas (casaron una vez): ${rotasPuestas.join(", ") || "NINGUNA"}`);
control("ni un error de página", !errores.length, errores.join(" | ").slice(0, 400));
const verdes = controles.filter((c) => c.bien).length;
console.log(`\n  ${verdes} de ${Math.max(DECLARADOS, controles.length)} en verde`);
if (controles.length < DECLARADOS) console.log(`  (corrieron ${controles.length} de ${DECLARADOS} declarados: los que faltan son rojos)`);
if (verdes !== DECLARADOS) console.log(`  el servidor dijo:\n${salida.join("").split("\n").slice(-30).map((l) => `    ${l}`).join("\n")}`);
process.exit(verdes === DECLARADOS && controles.length === DECLARADOS ? 0 : 1);
