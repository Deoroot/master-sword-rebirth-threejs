// MORIR Y VOLVER CON SERVIDOR, MUCHAS VECES, Y QUE EL SERVIDOR SIGA — el 99.
//
//   npm run sonda:reaparecer99
//   ROTURA99=R1 npm run sonda:reaparecer99     (las roturas, abajo)
//
// Chrome de verdad contra un servidor de verdad (`tools/servidor.mjs`), en Gate
// City, entrando POR EL MENÚ (CLAUDE.md §3). El 98 vio el servidor dejar de
// contestar: un jugador débil moría junto a la araña, volvía con la cápsula
// metida en la roca y cada `computeColliderMovement` de Rapier tardaba segundos
// (doc/SERVIDOR_98.md §7). Lo que esta sonda monta es ese caso, a propósito y
// repetido:
//
//   - nacer al lado de las arañas de la cueva (`--nacer`), con un personaje de
//     habilidades de recién creado («Reaparecer99a», 15 de vida) y otro Veteran
//     al lado («Reaparecer99b»), que son los dos del 98;
//   - y REAPARECER en un punto HUNDIDO OCHO UNIDADES EN EL SUELO de la misma
//     cueva, a cinco metros (`--reaparecer`): la cápsula, tal cual, corta la
//     malla. Así A muere, vuelve, vuelve a morir... y cada vuelta pasa por el
//     sitio malo.
//
// LO QUE SE MIDE:
//
//   1. control positivo del instrumento: el servidor dice que en el punto de
//      reaparición NO cabe la cápsula (`costura().puntos`). Si dijera que cabe,
//      el «cabe» de los demás controles no valdría nada.
//   2. A muere y vuelve al menos TRES veces (cuenta del servidor), y su
//      navegador pasa por «muerto» y vuelve a «jugando».
//   3. cada vez que vuelve, el SERVIDOR le pone donde cabe (`cabe` es la misma
//      pregunta que hace `_atascado`, src/red/partida.js) y a menos de un metro
//      del punto, y no donde murió.
//   4. el servidor NO SE PARA: se le pregunta `/partidas` cada 250 ms durante
//      toda la sonda; ninguna respuesta tarda más de 3 s, sus pasos suben a
//      ≥ 80 por segundo de reloj de pared, y su peor vuelta se apunta.
//   5. el navegador de A acaba DONDE EL SERVIDOR: la reconciliación le lleva a
//      lo libre (a menos de medio metro de los pies del servidor) y su cuerpo
//      ANDA: con la W pulsada el servidor le mueve más de un metro.
//
// LAS ROTURAS (CLAUDE.md §4), en el PROCESO DEL SERVIDOR y no en el árbol: un
// gancho de carga de Node (`module.register`) cambia `src/red/partida.js` al
// importarlo, sólo para el servidor de esta sonda. Cada reemplazo tiene que
// casar UNA vez o el servidor no arranca (el 80: una rotura que no casa deja
// todo verde).
//
//   R1  `_atascado` siempre «no»: PM_CheckStuck apagado
//   R2  `_sitioLibre` sin mirar la pared (como antes del 99)
//   R3  nadie mueve el cuerpo al reaparecer (como antes del 99)
//   R4  los cilindros de los bichos que ya están DENTRO del jugador cuentan
//       para su paso (como antes del 99): el cuelgue de verdad, §6 del doc

import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { liberarPuerto, lanzarVite, esperarHttp } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";
import { crearPersonaje } from "../src/juego/personaje.js";

const PUERTO_WEB = 5997;
const PUERTO_PARTIDA = 5998;
const CARPETA = "build/partidas/reaparecer99/personajes";
/** Al lado de las arañas de la cueva de Gate City (build/gatecity/bichos.json: x −44 a −29, z 25,5 a 31). */
const NACER = "-36,-20.1,24";
/**
 * Cinco metros más allá, junto a la otra araña, y OCHO UNIDADES bajo el suelo
 * (que está a −20,10): la cápsula corta la malla. A cinco metros y no en el
 * mismo sitio para que «le ha movido» se pueda distinguir de «se ha quedado
 * donde murió», que es lo que hacía el servidor antes del 99 (la rotura R3).
 */
const REAPARECER = "-40,-20.3,27";
const VUELTAS = 3;
const PLAZO_MUERTES = 240_000;

const controles = [];
const control = (que, bien, detalle = "") => {
  controles.push({ que, bien: Boolean(bien), detalle });
  console.log(`  ${bien ? "ok  " : "MAL "} ${que}${detalle ? `\n         ${detalle}` : ""}`);
  return bien;
};
const DECLARADOS = 9;
const errores = [];
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const matar = (p) => { if (!p) return; try { spawnSync("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
const dist = (a, b) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : Infinity);

// ── las roturas, por el gancho de carga ────────────────────────────────────
const ROTURAS = (process.env.ROTURA99 ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const REEMPLAZOS = {
  R1: ["    if (!probar) return false;\n    c.atasco ??=", "    if (true) return false;\n    c.atasco ??="],
  R2: ["    const probar = yo ? this._probador(yo) : null;\n", "    const probar = null;\n"],
  R3: ["    c.sesion.al(\"aparece\", ({ donde, entrada }) => this._reaparecer(c, donde, entrada));", "    // R3"],
  // EL 100: la línea es ahora `encender(...)` (src/play/atasco.js); la rotura es la misma.
  R4: ["    encender(c.cuerpo, fuera, false);\n", "    fuera.length = 0;\n"],
};
let importar = [];
if (ROTURAS.length) {
  console.log(`  ROTURAS DELIBERADAS: ${ROTURAS.join(", ")}`);
  mkdirSync("build/sondas", { recursive: true });
  const pares = ROTURAS.map((k) => {
    if (!REEMPLAZOS[k]) throw new Error(`no hay rotura ${k}`);
    return REEMPLAZOS[k];
  });
  const gancho = resolve("build/sondas/rotura99_gancho.mjs");
  writeFileSync(gancho, `
const PARES = ${JSON.stringify(pares)};
export async function load(url, ctx, next) {
  const r = await next(url, ctx);
  if (!url.endsWith("/src/red/partida.js")) return r;
  let s = typeof r.source === "string" ? r.source : Buffer.from(r.source).toString("utf8");
  const crlf = s.includes("\\r\\n");
  for (let [a, b] of PARES) {
    if (crlf) { a = a.replace(/\\n/g, "\\r\\n"); b = b.replace(/\\n/g, "\\r\\n"); }
    const n = s.split(a).length - 1;
    if (n !== 1) throw new Error("ROTURA99: el reemplazo casa " + n + " veces: " + a.slice(0, 60));
    s = s.replace(a, b);
  }
  console.log("ROTURA99 puesta: " + PARES.length + " reemplazo(s) en partida.js");
  return { ...r, source: s };
}
`.replace(/\r\n/g, "\n"));
  const registro = resolve("build/sondas/rotura99_registro.mjs");
  writeFileSync(registro, `import { register } from "node:module";\nregister(${JSON.stringify(pathToFileURL(gancho).href)});\n`);
  importar = ["--import", pathToFileURL(registro).href];
}

// ── los dos personajes, con la herramienta de verdad ────────────────────────
try { rmSync("build/partidas/reaparecer99", { recursive: true, force: true }); } catch {}
for (const nombre of ["Reaparecer99a", "Reaparecer99b"]) {
  const r = spawnSync(process.execPath, ["tools/personaje.mjs", "--nombre", nombre, "--mapa", "reaparecer99"], { encoding: "utf8" });
  if (r.status !== 0) { console.error(r.stdout, r.stderr); process.exit(1); }
}
const ID = { A: "pruebas-reaparecer99a", B: "pruebas-reaparecer99b" };
{
  // A: las habilidades de uno recién creado (15 de vida), en el disco del
  // servidor y en su respaldo — como servidor98.
  const debiles = crearPersonaje({ nombre: "x" }).habilidades;
  for (const f of [`${CARPETA}/${ID.A}.json`, `${CARPETA}/${ID.A}.bak.json`]) {
    if (!existsSync(f)) continue;
    const p = JSON.parse(readFileSync(f, "utf8"));
    p.habilidades = debiles;
    p.vida = 15;
    writeFileSync(f, JSON.stringify(p, null, 1));
  }
}

liberarPuerto(PUERTO_WEB);
liberarPuerto(PUERTO_PARTIDA);
const dev = lanzarVite(PUERTO_WEB);
const salida = [];
const partida = spawn(process.execPath, [
  // `SONDA_NODE_ARGS` (p. ej. «--inspect=9333») para mirar dentro si se cuelga, como servidor98.
  ...(process.env.SONDA_NODE_ARGS ? process.env.SONDA_NODE_ARGS.split(" ") : []),
  ...importar,
  "tools/servidor.mjs", "--puerto", String(PUERTO_PARTIDA), "--nombre", "La sonda 99",
  "--personajes", CARPETA, "--nacer", NACER, "--reaparecer", REAPARECER,
], { stdio: ["ignore", "pipe", "pipe"] });
partida.stdout.on("data", (b) => salida.push(String(b)));
partida.stderr.on("data", (b) => salida.push(`ERR ${b}`));
// Con reintento ante un `ECONNRESET`: el `fetch` de Node reaprovecha la
// conexión y el servidor HTTP la cierra a los 5 s de reposo (`keepAliveTimeout`);
// si las dos cosas se cruzan, la petición muere sin que el servidor haya hecho
// nada mal. Medido: una pasada entera tirada así, con el servidor vivo. Un
// servidor colgado de verdad no contesta a ningún intento, y eso lo mide el
// vigilante, que NO reintenta.
const costura = async () => {
  for (let intento = 1; ; intento++) {
    try { return await (await fetch(`http://localhost:${PUERTO_PARTIDA}/costura`)).json(); } catch (e) {
      if (intento >= 3 || e?.cause?.code !== "ECONNRESET") throw e;
    }
  }
};

// ── EL VIGILANTE: el servidor contesta, todo el rato ───────────────────────
const INICIO = Date.now();
/** Lo que la sonda estaba haciendo, para saber DÓNDE se para el servidor si se para. */
const momento = [];
const marca = (que) => { momento.push(`${((Date.now() - INICIO) / 1000).toFixed(1)} s ${que}`); };
const vigia = { lentas: [], respuestas: 0, peorMs: 0, sinRespuesta: 0, pasos0: null, t0: null, pasos: null, t: null, msMaximo: 0 };
let vigilando = false;
async function vigilar() {
  vigilando = true;
  while (vigilando) {
    const t0 = Date.now();
    try {
      const ctl = new AbortController();
      const reloj = setTimeout(() => ctl.abort(), 5000);
      // Un `ECONNRESET` se reintenta EN EL ACTO y el tiempo cuenta desde el
      // primer intento (ver `costura`): una conexión reciclada no es un
      // servidor parado, y uno parado tampoco contesta al segundo.
      const pedir = () => fetch(`http://localhost:${PUERTO_PARTIDA}/partidas`, { signal: ctl.signal });
      const resp = await pedir().catch((e) => { if (e?.cause?.code === "ECONNRESET") return pedir(); throw e; });
      const r = await resp.json();
      clearTimeout(reloj);
      const ms = Date.now() - t0;
      vigia.respuestas++;
      vigia.peorMs = Math.max(vigia.peorMs, ms);
      if (ms > 1000) vigia.lentas.push({ cuando: ((t0 - INICIO) / 1000).toFixed(1), ms, momento: momento.at(-1) ?? null });
      const p = r?.[0]?.pasos ?? null;
      if (vigia.pasos0 === null) { vigia.pasos0 = p; vigia.t0 = Date.now(); }
      vigia.pasos = p; vigia.t = Date.now();
      vigia.msMaximo = Math.max(vigia.msMaximo, r?.[0]?.msMaximo ?? 0);
    } catch {
      vigia.sinRespuesta++;
      vigia.peorMs = Math.max(vigia.peorMs, Date.now() - t0);
    }
    await esperar(250);
  }
}

const nav = await chromium.launch();
let saliendo = 1;
try {
  await esperarHttp(`http://localhost:${PUERTO_PARTIDA}/partidas`, { tope: 120_000, proceso: partida, quien: "el servidor de partida" });
  await esperarHttp(`http://localhost:${PUERTO_WEB}/`, { tope: 90_000, proceso: dev, quien: "vite" });
  if (ROTURAS.length && !salida.some((l) => l.includes("ROTURA99 puesta"))) {
    throw new Error(`la rotura no está puesta: el servidor no lo ha dicho\n${salida.join("").slice(-800)}`);
  }
  vigilar();

  const pags = {};
  const yo = {};
  // Con la máquina compartida la entrada se agota a veces (servidor98 §7): se
  // reintenta, y cada fallo se dice.
  const abrir = async (quien) => {
    for (let intento = 1; ; intento++) {
      try { return await abrirUnaVez(quien); } catch (e) {
        const a = (await costura().catch(() => null))?.clientes ?? [];
        console.log(`    (${quien}: la entrada falló «${String(e?.message ?? e).slice(0, 80)}», intento ${intento}; servidor: ${JSON.stringify(a.map((x) => ({ id: x.id, estado: x.estado, cabe: x.cabe, atascado: x.pasosAtascado })))}; vigía: peor ${vigia.peorMs} ms)`);
        if (intento >= 3) throw e;
        await esperar(3000);
      }
    }
  };
  const abrirUnaVez = async (quien) => {
    const pag = await nav.newPage({ viewport: { width: 1000, height: 700 } });
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
    pag.on("console", (m) => { if (m.type() === "error") errores.push(`${quien} consola: ${m.text().slice(0, 200)}`); });
    try {
    await entrarPorElMenu(pag, PUERTO_WEB, { extra: `red=ws://localhost:${PUERTO_PARTIDA}/juego` });
    const lista = await pag.evaluate(() => window.probe.sesion.listar());
    const k = lista.findIndex((c) => c.id === ID[quien]);
    if (k < 0) throw new Error(`${quien}: el servidor no lista ${ID[quien]}`);
    // La ranura del personaje, con el ratón (como servidor98).
    const b = (await pag.evaluate(() => window.probe.vgui.botones())).find((x) => x.i === 2 * k);
    if (!b) throw new Error(`${quien}: no hay ranura ${k}`);
    await pag.mouse.click(b.centro, b.arriba + 12);
    await pag.waitForFunction(() => window.probe.sesion.estado() === "jugando" && window.probe.vgui.abierto() === null,
      null, { timeout: 90000 });
    yo[quien] = await pag.evaluate(() => window.probe.red.estado()?.yo ?? null);
    pags[quien] = pag;
    return pag;
    } catch (e) {
      await pag.close().catch(() => {});
      throw e;
    }
  };
  marca("entra A");
  await abrir("A");
  marca("entra B");
  await abrir("B");
  marca("dentro los dos");
  // EL VIGILANTE CUENTA DESDE AQUÍ. Lo que se mide es morir y volver; la
  // entrada de un jugador tiene sus propios tirones (una pasada vio 4 s
  // mientras entraba B, doc/REAPARECER_99.md §6) y no es de este experimento.
  // Lo de antes se apunta aparte.
  const deLaEntrada = { peorMs: vigia.peorMs, lentas: [...vigia.lentas] };
  Object.assign(vigia, { lentas: [], respuestas: 0, peorMs: 0, sinRespuesta: 0, pasos0: null, t0: null, msMaximo: 0 });
  const delServidor = async (q) => (await costura()).clientes.find((x) => x.id === yo[q]) ?? null;

  // ── 1. el instrumento ve el atasco ──────────────────────────────────────
  const c0 = await costura();
  control("1. control positivo: el servidor dice que en el punto de reaparición NO cabe la cápsula",
    c0.puntos?.reaparicion?.cabe === false && c0.puntos?.nacimiento?.cabe === true,
    `reaparición ${JSON.stringify(c0.puntos?.reaparicion)} · nacimiento ${JSON.stringify(c0.puntos?.nacimiento)}`);

  // ── 2-3. morir y volver, VUELTAS veces ──────────────────────────────────
  // A al frente: una pestaña de fondo no corre `requestAnimationFrame`, así
  // que su sesión no avanza y no manda órdenes (servidor98).
  await pags.A.bringToFront();
  const vistos = new Set();
  const vueltas = [];
  // UNA VUELTA ES EL ESTADO DE LA SESIÓN DEL SERVIDOR pasando de muerto a
  // jugando, y NO el contador `reapariciones` que pone `_reaparecer`: ese
  // contador es del arreglo, y con el arreglo roto (R3) decía «0 vueltas»
  // mientras A moría y volvía siete veces — y 3a/3b salían rojos por no
  // tener nada que medir, que es un rojo vacío (CLAUDE.md §4). La sesión
  // reaparece igual con o sin arreglo; lo que el arreglo cambia es DÓNDE.
  // Y EL 5 SE MIDE DENTRO DEL BUCLE, justo después de una vuelta: las arañas
  // matan a A en segundos, y medido al final A ya estaba muerto otra vez —5a
  // rojo con el juego bien, y 5b verde «porque murió andando», que es un verde
  // que no mide nada. Si una vuelta no da tiempo, se prueba en la siguiente.
  const tFin = Date.now() + PLAZO_MUERTES;
  let estadoA = null;
  let m5a = null, m5b = null;
  const intentos5b = [];
  while (Date.now() < tFin && (vueltas.length < VUELTAS || !m5a || !m5b)) {
    vistos.add(await pags.A.evaluate(() => window.probe.sesion.estado()));
    const a = await delServidor("A");
    const antes = estadoA;
    if (a?.estado !== estadoA) { estadoA = a?.estado; marca(`A ${estadoA}`); }
    if ((antes === "muerto" || antes === "muriendo") && a?.estado === "jugando") {
      vueltas.push({ pies: a.pies, cabe: a.cabe, alPunto: dist(a.pies, c0.puntos?.reaparicion?.pies), sitio: a.ultimoSitio });
      marca(`A vuelve (${vueltas.length})`);
      const bB = await delServidor("B");
      console.log(`    (B: ${bB?.estado}, a ${dist(bB?.pies, c0.puntos?.reaparicion?.pies).toFixed(2)} m del punto, ${bB?.reapariciones ?? 0} reapariciones, ${bB?.pasosAtascado ?? 0} pasos parados por PM_CheckStuck, sitio ${JSON.stringify(bB?.ultimoSitio)})`);
      console.log(`    vuelta ${vueltas.length}: pies ${a.pies?.map((v) => v.toFixed(2))} cabe ${a.cabe} · al punto ${dist(a.pies, c0.puntos?.reaparicion?.pies).toFixed(2)} m · sitio ${JSON.stringify(a.ultimoSitio)} · bichos apartados ${a.bichosApartados}`);
      if (!m5a || !m5b) {
        // 5a: medio segundo para que llegue una foto y la reconciliación la use.
        await esperar(600);
        const srv = await delServidor("A");
        const nav5 = await pags.A.evaluate(() => window.probe.red.estado()?.pies ?? null);
        if (srv?.estado === "jugando") {
          m5a = { bien: dist(nav5, srv.pies) < 0.5 && srv.cabe === true, nav: nav5, srv: srv.pies, cabe: srv.cabe };
          // 5b: la W, mientras siga vivo.
          const desde = srv.pies;
          await pags.A.keyboard.down("KeyW");
          let vivo = true;
          for (let i = 0; i < 5 && vivo; i++) { await esperar(250); vivo = (await delServidor("A"))?.estado === "jugando"; }
          await pags.A.keyboard.up("KeyW");
          const hasta = (await delServidor("A"))?.pies;
          // Una araña DELANTE (no dentro) le para, y eso es el juego: una
          // pasada midió 0,28 m así. Se guarda el mejor de los intentos y se
          // dicen todos; con A hundido en el suelo (R2) son todos cero.
          if (vivo) {
            intentos5b.push(dist(desde, hasta));
            const mejor = Math.max(...intentos5b);
            m5b = mejor > 1 ? { anduvo: mejor, atascado: (await delServidor("A"))?.pasosAtascado } : null;
          }
        }
      }
    }
    await esperar(200);
  }
  control(`2. A muere y vuelve al menos ${VUELTAS} veces con servidor`,
    vueltas.length >= VUELTAS && vistos.has("muerto") && vistos.has("jugando"),
    `${vueltas.length} vueltas en el servidor · estados del navegador: ${[...vistos].join(", ")}`);
  control("3a. cada vez el servidor le pone DONDE CABE (no en el punto, que no cabe)",
    vueltas.length > 0 && vueltas.every((v) => v.cabe === true),
    vueltas.map((v) => `cabe ${v.cabe}`).join(" · "));
  // El punto está a 5 m de donde nació: si nadie moviera el cuerpo (R3), la
  // primera vuelta saldría a ~5 m y esto sería rojo. EL UMBRAL ES EL ANILLO
  // MÁS ANCHO DE `_sitioLibre` (3 × 2,1 × el radio = 2,56 m) y no un metro:
  // una pasada salió a 1,29 m las tres veces, y `ultimoSitio` lo explicó —
  // «ocupado» 68 veces—: B, que es Veteran, también muere, también reaparece
  // en el punto y se queda allí de pie (su pestaña está de fondo). Apartarse
  // de B es la regla, no un fallo.
  control("3b. ...cerca del punto de reaparición (dentro del anillo más ancho, 2,56 m), que está a 5 m de donde nació",
    vueltas.length > 0 && vueltas.every((v) => v.alPunto < 2.6) && dist(c0.puntos?.reaparicion?.pies, c0.puntos?.nacimiento?.pies) > 4,
    vueltas.map((v) => `${v.alPunto.toFixed(2)} m (anillo ${v.sitio?.anillo?.toFixed?.(2) ?? "?"}, ocupado ${v.sitio?.ocupado ?? "?"})`).join(" · ") +
      ` · punto a ${dist(c0.puntos?.reaparicion?.pies, c0.puntos?.nacimiento?.pies).toFixed(1)} m del nacimiento`);
  control("5a. recién vuelto, el navegador de A está donde el servidor le ha puesto (la reconciliación le lleva a lo libre)",
    m5a?.bien === true,
    m5a ? `navegador ${m5a.nav?.map((v) => v.toFixed(2))} · servidor ${m5a.srv?.map((v) => v.toFixed(2))} (cabe ${m5a.cabe})` : "no se pudo medir: ninguna vuelta le dejó vivo 0,6 s");
  control("5b. y ANDA: con la W, vivo, el servidor le mueve más de un metro (el mejor de los intentos)",
    m5b && m5b.anduvo > 1,
    `intentos ${intentos5b.map((d) => d.toFixed(2)).join(", ") || "ninguno (ninguna vuelta le dejó vivo 1,85 s)"} m` +
      (m5b ? ` · pasos parados por PM_CheckStuck: ${m5b.atascado}` : ""));

  // ── 4. el servidor no se ha parado ──────────────────────────────────────
  vigilando = false;
  await esperar(300);
  const segundos = (vigia.t - vigia.t0) / 1000;
  const ritmo = (vigia.pasos - vigia.pasos0) / Math.max(1e-3, segundos);
  // El umbral es 3 s y no menos, medido: con la máquina compartida y siete
  // arañas cazando, la FAUNA da tirones de 1-2 s con el arreglo puesto
  // (doc/REAPARECER_99.md §6). Un servidor colgado por Rapier no contesta en
  // minutos; 3 s separa las dos cosas sin ser ruido.
  control("4a. el servidor contesta SIEMPRE: ninguna pregunta sin respuesta y ninguna de más de 3 s",
    vigia.sinRespuesta === 0 && vigia.peorMs < 3000 && vigia.respuestas > 20,
    `${vigia.respuestas} respuestas · ${vigia.sinRespuesta} sin respuesta · la peor ${vigia.peorMs} ms` +
      (vigia.lentas.length ? ` · lentas: ${JSON.stringify(vigia.lentas.slice(0, 6))}` : "") +
      ` · (en las entradas, sin contar: la peor ${deLaEntrada.peorMs} ms)`);
  control("4b. y SIMULA: ≥ 80 pasos por segundo de reloj de pared durante toda la sonda",
    ritmo >= 80,
    `${Math.round(ritmo)} pasos/s en ${segundos.toFixed(0)} s · peor vuelta del anfitrión ${vigia.msMaximo} ms`);

  const sinErrores = !salida.some((l) => l.startsWith("ERR") && !/ExperimentalWarning|--import|register|Debugger|inspector|For help/.test(l)) && errores.length === 0;
  control("sin errores en el servidor ni en las páginas", sinErrores,
    [...errores, ...salida.filter((l) => l.startsWith("ERR"))].join(" | ").slice(0, 600));
  console.log(`    lo que pasó: ${momento.join(" · ")}`);
  for (const q of ["A", "B"]) {
    const x = await delServidor(q).catch(() => null);
    console.log(`    ${q} al final: ${x?.estado} en ${x?.pies?.map((v) => v.toFixed(2))} · cabe ${x?.cabe} · ${x?.pasosAtascado} pasos parados · ${x?.bichosApartados} bichos apartados`);
  }
  saliendo = 0;
} catch (e) {
  console.error(e);
  if (errores.length) console.error(`  errores de las páginas:\n   ${errores.join("\n   ")}`);
  console.error(`  lo último del servidor:\n${salida.join("").slice(-1500)}`);
  control("la sonda llegó al final", false, String(e?.message ?? e).slice(0, 300));
} finally {
  vigilando = false;
  await nav.close().catch(() => {});
  matar(partida);
  matar(dev);
}

// Un «X de Y» donde Y se declara antes de empezar (el 65): si la sonda se cae a
// medias, lo que no corrió cuenta como rojo.
const bien = controles.filter((c) => c.bien).length;
const total = Math.max(DECLARADOS, controles.length);
console.log(`\n  sonda:reaparecer99 — ${bien} de ${total} en verde${ROTURAS.length ? ` (con ROTURA99=${ROTURAS.join(",")})` : ""}`);
process.exit(bien === total && !saliendo ? 0 : 1);
