// LA PREDICCIÓN ANDA LO QUE ANDA EL SERVIDOR — experimento 99, pieza Q.
//
//   npm run sonda:red99
//
// Chrome de verdad contra un servidor de verdad (`tools/servidor.mjs`), en
// Gate City, en el sitio de nacer. Dos personajes fabricados por
// `tools/personaje.mjs` con una diferencia escrita en el disco antes de
// levantar el servidor, para que ANDEN a velocidades distintas:
//
//   - «Red99a»: habilidades de recién creado y la mochila del Veteran, con la
//     armadura en el saco y no puesta (sin ella no hay `failed_str_req_loop`
//     que lo frene: esto mide el PESO, no las trabas). Carga poco y lleva
//     mucho: `velocidadAndando` le quita el lastre entero.
//   - «Red99b»: el Veteran del 96 tal cual, con su agilidad.
//
// LO QUE SE MIDE, por personaje, andando con la W, de espaldas al otro y con
// una corrección FORZADA cada segundo (el cuerpo del navegador se aparta 3 cm:
// el fallo vivía en rehacer las órdenes tras una corrección, y sin ella no se
// ve — ver «LAS MENTIRAS» abajo):
//   1. la rapidez que da el SERVIDOR (la de su foto, `rapidez` del propio
//      jugador) y la que PREDICE el navegador (`probe.player.rapidez`);
//   2. si las POSICIONES coinciden: el error de la reconciliación de cada foto
//      (`errorUltimo`, la distancia entre donde el navegador creyó estar al
//      acabar la orden N y donde dice el servidor) y las correcciones.
//
// EL CONTROL POSITIVO va dentro: los dos personajes andan, según el servidor,
// a velocidades que se separan más de 50 u/s, así que UNA velocidad de
// predicción para todos —el 160 del perfil, que es lo que había hasta el 99—
// no puede acertar con los dos. Y la rotura deliberada (`ROTURA99=1`) vuelve a
// poner el fallo en el módulo que sirve Vite a ESTAS páginas y pide rojo.
//
// Se entra POR EL MENÚ (CLAUDE.md §3) y se elige el personaje con el ratón,
// como `sondas/servidor98.mjs`.

import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { liberarPuerto, lanzarVite, esperarHttp } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";
import { crearPersonaje } from "../src/juego/personaje.js";

const PUERTO_WEB = 5993;
const PUERTO_PARTIDA = 5994;
const CARPETA = "build/partidas/red99/personajes";

const DECLARADOS = 9;
const controles = [];
const control = (que, bien, detalle = "") => {
  controles.push({ que, bien: Boolean(bien), detalle });
  console.log(`  ${bien ? "ok  " : "MAL "} ${que}${detalle ? `\n         ${detalle}` : ""}`);
  return bien;
};
const errores = [];
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const matar = (p) => { if (!p) return; try { spawnSync("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

// ── los dos personajes, con la herramienta de verdad ───────────────────────
try { rmSync("build/partidas/red99", { recursive: true, force: true }); } catch {}
for (const nombre of ["Red99a", "Red99b"]) {
  const r = spawnSync(process.execPath, ["tools/personaje.mjs", "--nombre", nombre, "--mapa", "red99"], { encoding: "utf8" });
  if (r.status !== 0) { console.error(r.stdout, r.stderr); process.exit(1); }
}
const ID = { A: "pruebas-red99a", B: "pruebas-red99b" };
{
  // A: las habilidades de uno recién creado y nada puesto. En el disco del
  // servidor, que es donde vive el personaje con red, y en su respaldo.
  const debiles = crearPersonaje({ nombre: "x" }).habilidades;
  for (const f of [`${CARPETA}/${ID.A}.json`, `${CARPETA}/${ID.A}.bak.json`]) {
    if (!existsSync(f)) continue;
    const p = JSON.parse(readFileSync(f, "utf8"));
    p.habilidades = debiles;
    p.objetos = p.objetos.map(({ puesto, ...o }) => o);
    writeFileSync(f, JSON.stringify(p, null, 1));
  }
}

const liberados = [...liberarPuerto(PUERTO_WEB), ...liberarPuerto(PUERTO_PARTIDA)];
if (liberados.length) console.log(`  (había ${liberados.length} proceso(s) en los puertos: matados)`);
const dev = lanzarVite(PUERTO_WEB);

const salida = [];
const partida = spawn(process.execPath, [
  "tools/servidor.mjs", "--puerto", String(PUERTO_PARTIDA), "--nombre", "La sonda 99",
  "--personajes", CARPETA,
], { stdio: ["ignore", "pipe", "pipe"] });
partida.stdout.on("data", (b) => salida.push(String(b)));
partida.stderr.on("data", (b) => salida.push(`ERR ${b}`));
const costura = async () => (await fetch(`http://localhost:${PUERTO_PARTIDA}/costura`)).json();

// UN VIGÍA: una pasada de la rotura deliberada se quedó diez minutos parada en
// un `page.evaluate` que no volvía, sin decir nada. Colgarse es una roja, no un
// silencio (el 65): a los 15 minutos se dice, se limpia y se sale con 1.
const vigia = setTimeout(() => {
  console.log("  MAL  la sonda se ha colgado (15 min sin acabar)");
  matar(partida); matar(dev);
  process.exit(1);
}, 15 * 60_000);
vigia.unref();
/** Un `evaluate` con plazo: si la página no contesta en 30 s, es un error y no una espera eterna. */
const evaluar = (pag, fn, arg) => Promise.race([
  pag.evaluate(fn, arg),
  new Promise((_, mal) => setTimeout(() => mal(new Error("la página no contesta en 30 s (¿bucle o Rapier colgado?)")), 30_000)),
]);

// ── LA ROTURA DELIBERADA (CLAUDE.md §4) ─────────────────────────────────────
//
// `ROTURA99=1 npm run sonda:red99`. Se rompe src/main.js SÓLO para las páginas
// de esta sonda (Playwright intercepta el módulo que sirve Vite): romper el
// archivo del árbol rompería las sondas de las otras sesiones. El reemplazo
// tiene que casar UNA vez o la sonda lo dice y se pone roja (el 80).
const ROTURA = process.env.ROTURA99 === "1";
const REEMPLAZO = [/maxima: v\?\.maxima \?\? undefined,/, "maxima: undefined,"];
let rotaPuesta = false;
async function romperEnLaPagina(pag) {
  await pag.route(/\/src\/main\.js(\?|$)/, async (route) => {
    const r = await route.fetch();
    let cuerpo = await r.text();
    const n = (cuerpo.match(new RegExp(REEMPLAZO[0].source, "g")) ?? []).length;
    if (n !== 1) errores.push(`la rotura casa ${n} veces: NO está puesta`);
    else { cuerpo = cuerpo.replace(REEMPLAZO[0], REEMPLAZO[1]); rotaPuesta = true; }
    await route.fulfill({ response: r, body: cuerpo });
  });
}
if (ROTURA) console.log("  ROTURA DELIBERADA: la predicción con red vuelve a la velocidad del perfil");

async function pulsarRanura(pag, k) {
  const b = (await pag.evaluate(() => window.probe.vgui.botones())).find((x) => x.i === 2 * k);
  if (!b) return false;
  await pag.mouse.click(b.centro, b.arriba + 12);
  return true;
}

await esperarHttp(`http://localhost:${PUERTO_PARTIDA}/partidas`, { tope: 120_000, proceso: partida, quien: "el servidor de partida" });
await esperarHttp(`http://localhost:${PUERTO_WEB}/`, { tope: 90_000, proceso: dev, quien: "vite" });

const cable = { A: { fotos: [], yo: null }, B: { fotos: [], yo: null } };
const erroresDePagina = {};
const pags = {};
const nav = await chromium.launch();
try {
  const abrirUnaVez = async (quien) => {
    const id = ID[quien];
    const pag = await nav.newPage({ viewport: { width: 1000, height: 700 } });
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
      // Los errores de ESTA página: si el intento falla y se repite, los del
      // intento tirado no cuentan (la página se cierra a medio cargar).
      const suyos = [];
      erroresDePagina[quien] = suyos;
      pag.on("pageerror", (e) => suyos.push(`${quien}: ${String(e).slice(0, 200)}`));
      if (ROTURA) await romperEnLaPagina(pag);
      pag.on("websocket", (ws) => {
        if (!ws.url().includes(`:${PUERTO_PARTIDA}/`)) return;
        ws.on("framereceived", (f) => {
          let m = null;
          try { m = JSON.parse(typeof f.payload === "string" ? f.payload : f.payload.toString("utf8")); } catch { return; }
          if (m?.t !== "foto") return;
          const c = cable[quien];
          const mio = (m.jugadores ?? []).find((j) => j.id === c.yo) ?? null;
          c.fotos.push({ t: Date.now(), mio });
        });
      });
      await entrarPorElMenu(pag, PUERTO_WEB, { extra: `red=ws://localhost:${PUERTO_PARTIDA}/juego` });
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
  const abrir = async (quien) => {
    for (let intento = 1; ; intento++) {
      cable[quien].fotos = [];
      try { pags[quien] = await abrirUnaVez(quien); return; } catch (e) {
        if (intento >= 4) throw e;
        console.log(`    (${quien}: la entrada falló «${String(e?.message ?? e).slice(0, 80)}», intento ${intento + 1})`);
        await esperar(3000);
      }
    }
  };
  await abrir("A");
  await abrir("B");
  const c0 = await costura();
  const pj = (q) => c0.clientes.find((x) => x.id === cable[q].yo)?.personaje ?? null;
  control("A y B han entrado por el menú con su personaje, y el servidor los tiene",
    pj("A") === ID.A && pj("B") === ID.B, `A ${cable.A.yo}=${pj("A")} · B ${cable.B.yo}=${pj("B")}`);

  // CADA PÁGINA AL FRENTE antes de moverla: una pestaña de fondo no tiene
  // `requestAnimationFrame` y su bucle no manda órdenes (el 98).
  const alFrente = async (q) => { await pags[q].bringToFront(); await esperar(300); };
  const med = (l) => { const s = [...l].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

  /**
   * Andar `ms` con la W y medir. La rapidez del servidor es la de sus fotos
   * desde medio segundo después de pulsar (se descarta la aceleración); la de
   * la predicción, la del cuerpo del navegador en el mismo tramo. El error de
   * posición, el `errorUltimo` de la reconciliación en cada lectura.
   */
  const andar = async (q, ms = 3000) => {
    const pag = pags[q];
    await alFrente(q);
    // DE ESPALDAS AL OTRO. Las dos cápsulas chocan en el servidor y el cuerpo
    // que predice el navegador no tiene la del otro: andar hacia él da un
    // error que no es de velocidad (una pasada leyó 25 cm así). Se mira al
    // punto opuesto al otro jugador, en el plano.
    await evaluar(pag, () => {
      const yo = window.probe.red.estado()?.pies;
      const otro = window.probe.red.crudos()[0]?.pies;
      if (!yo || !otro) return;
      const dx = yo[0] - otro[0], dz = yo[2] - otro[2], l = Math.hypot(dx, dz) || 1;
      const ojo = window.probe.player.eye;
      window.probe.mundo.mirar(yo[0] + (dx / l) * 10, ojo[1], yo[2] + (dz / l) * 10);
    });
    await esperar(200);
    const e0 = await evaluar(pag, () => window.probe.red.estado());
    const t0 = Date.now();
    const pred = [], err = [];
    // LAS MENTIRAS: cada segundo, el cuerpo del navegador se aparta 3 cm hacia
    // atrás. Es una corrección SEGURA, y hace falta: el fallo vive en REHACER
    // las órdenes tras una corrección, y sin corrección no se rehace nada. La
    // primera rotura deliberada salió 8 de 9 con el fallo puesto (red99_rota2):
    // en esa pasada casi no hubo correcciones y el bucle de los 160 no
    // arrancó. Las muestras de los 400 ms siguientes a cada mentira no cuentan
    // para el error (el error de ahí es la mentira).
    const mentiras = [];
    await pag.keyboard.down("KeyW");
    for (let k = 0; k < ms / 100; k++) {
      await esperar(100);
      if (k % 10 === 7) {
        await evaluar(pag, () => {
          const p = window.probe.player, f = p.feet;
          p.colocar([f[0] + Math.sin(p.yaw) * 0.03, f[1], f[2] + Math.cos(p.yaw) * 0.03]);
        });
        mentiras.push(Date.now() - t0);
      }
      const r = await evaluar(pag, () => ({
        rapidez: window.probe.player.rapidez ?? 0, error: window.probe.red.estado()?.errorUltimo ?? null,
      }));
      const t = Date.now() - t0;
      if (t > 700) {
        pred.push(r.rapidez);
        if (r.error !== null && !mentiras.some((m) => t >= m && t < m + 400)) err.push({ t, e: r.error });
      }
    }
    await pag.keyboard.up("KeyW");
    await esperar(500);
    const e1 = await evaluar(pag, () => window.probe.red.estado());
    const srv = cable[q].fotos.filter((f) => f.t > t0 + 700 && f.t < t0 + ms).map((f) => f.mio?.rapidez ?? 0);
    const vit = await evaluar(pag, () => window.probe.fisica.vitales());
    const errores = err.map((x) => x.e);
    return {
      servidor: med(srv), n: srv.length, fotos: cable[q].fotos.length, prediccion: med(pred),
      errorMed: med(errores), p90: [...errores].sort((a, b) => a - b)[Math.floor(errores.length * 0.9)] ?? 0, errorMax: Math.max(0, ...errores), correcciones: e1.correcciones - e0.correcciones,
      peores: [...err].sort((a, b) => b.e - a.e).slice(0, 3).map((x) => `${(x.e * 100).toFixed(1)} cm a ${x.t} ms`).join(", "),
      vitales: vit, mentiras: mentiras.length,
    };
  };
  const v = { A: await andar("A"), B: await andar("B") };
  for (const q of ["A", "B"]) {
    const x = v[q];
    console.log(`  ${q}: servidor ${x.servidor.toFixed(1)} u/s (${x.n} fotos) · predicción ${x.prediccion.toFixed(1)} · ` +
      `error de posición mediana ${(x.errorMed * 100).toFixed(1)} cm, máx ${(x.errorMax * 100).toFixed(1)} cm · ` +
      `${x.correcciones} correcciones (peores: ${x.peores}; ${x.fotos} fotos en total) · ` +
      `vitales del navegador ${JSON.stringify(x.vitales)}`);
  }

  control("CONTROL POSITIVO: según el servidor, A y B andan a velocidades que se separan más de 50 u/s",
    v.A.n > 10 && v.B.n > 10 && Math.abs(v.A.servidor - v.B.servidor) > 50,
    `A ${v.A.servidor.toFixed(1)} · B ${v.B.servidor.toFixed(1)}`);
  for (const q of ["A", "B"]) {
    const x = v[q];
    control(`${q}: el navegador PREDICE la rapidez del servidor (±3 u/s), con ${x.mentiras} correcciones forzadas por medio`,
      x.servidor > 50 && Math.abs(x.prediccion - x.servidor) <= 3 && x.correcciones >= x.mentiras && x.mentiras >= 2,
      `predicción ${x.prediccion.toFixed(1)} contra ${x.servidor.toFixed(1)}; ${x.correcciones} correcciones para ${x.mentiras} mentiras`);
    control(`${q}: y las POSICIONES coinciden: el error de la reconciliación se queda en menos de 2 cm (mediana)`,
      x.errorMed < 0.02, `mediana ${(x.errorMed * 100).toFixed(1)} cm, máx ${(x.errorMax * 100).toFixed(1)} cm`);
    // Las correcciones se DICEN y no se cuentan: la foto redondea a
    // milímetros y el umbral es 1 mm, así que con la predicción bien el error
    // ronda el umbral y corrige de vez en cuando (doc/RED_99.md §4). Lo que se
    // mide es que el error se quede en ese ruido: el 90 % por debajo de 5 mm.
    // Con el fallo era de 8,6 cm de mediana.
    control(`${q}: y el error se queda en el ruido del redondeo (p90 < 5 mm)`,
      x.p90 < 0.005, `p90 ${(x.p90 * 1000).toFixed(1)} mm, ${x.correcciones} correcciones`);
  }
} catch (e) {
  control(`la sonda se cayó: ${String(e?.message ?? e).split("\n")[0].slice(0, 200)}`, false);
} finally {
  await nav.close().catch(() => {});
  matar(partida);
  matar(dev);
}

if (ROTURA) console.log(`  rotura puesta (casó una vez): ${rotaPuesta ? "sí" : "NO"}`);
for (const q of Object.keys(erroresDePagina)) errores.push(...erroresDePagina[q]);
control("ni un error de página ni del servidor",
  !errores.length && !salida.some((l) => l.startsWith("ERR")),
  [...errores, ...salida.filter((l) => l.startsWith("ERR"))].join(" | ").slice(0, 400));
const verdes = controles.filter((c) => c.bien).length;
console.log(`\n  ${verdes} de ${Math.max(DECLARADOS, controles.length)} en verde`);
if (controles.length < DECLARADOS) console.log(`  (corrieron ${controles.length} de ${DECLARADOS} declarados: los que faltan son rojos)`);
process.exit(verdes === DECLARADOS && controles.length === DECLARADOS ? 0 : 1);
