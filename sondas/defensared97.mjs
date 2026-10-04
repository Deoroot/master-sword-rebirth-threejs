// LA DEFENSA DEL JUGADOR CON SERVIDOR — experimento 97, pieza E.
//
//   npm run sonda:defensared97
//
// Dos Chrome de verdad contra un servidor de verdad (`tools/servidor.mjs`), en
// Gate City, delante de los tres goblins de la esquina norte. Los dos son el
// MISMO personaje fabricado por `tools/personaje.mjs` (el «Veteran» del 96,
// con su Blood Drinker y su parry de 40), con UNA diferencia escrita en el
// disco del servidor:
//
//   - «Defensa97a» lleva el fénix PUESTO (`puesto: true`, como lo fabrica la
//     herramienta).
//   - «Defensa97b» lo lleva en la mochila y NO puesto (se le quita el campo al
//     fichero antes de levantar el servidor).
//
// Es el segundo caso del 50: con el mismo personaje y el mismo goblin, lo
// único que puede separar los dos números es la armadura. Y es el control
// positivo de cada uno: B demuestra que el instrumento ve el golpe entero, y A
// que ve el recortado.
//
// LO QUE SE MIDE ES LO QUE LLEGA AL NAVEGADOR: las frases «Goblin hits you: N
// damage.» que el servidor le manda a cada uno (los marcos de SU WebSocket),
// que su consola las pinta, y la vida que cada uno ve bajar. Lo que el
// goblin pidió ANTES de la defensa (el daño de la IA, 6-9, sorteado) se lee del
// servidor (`/costura`, `defensa.historial`, de sólo lectura), golpe a golpe:
// así la proporción no depende del sorteo del daño (el 76), y el parry —que
// con 40 para muchos golpes— se cuenta aparte en vez de ensuciar la suma.
//
// Se entra POR EL MENÚ (CLAUDE.md §3) y se ELIGE el personaje en «Choose your
// character», con el ratón, como `sondas/personaje96.mjs`. Con red el cuerpo
// lo mueve el servidor: `--nacer` los pone a dos metros de los goblins y se
// quedan quietos. Fase 1, los dos dentro: los goblins van a por uno (el que
// la IA elija, no se fuerza) y el otro es el control negativo del reparto.
// Fase 2: ése se va y van a por el otro. Cada lectura se hace en una ventana
// de 0,8 s sin golpes (`instantanea`), para que no haya carrera entre el
// golpe que apunta el servidor y la frase que todavía viaja.

import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { liberarPuerto, lanzarVite, esperarHttp } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PUERTO_WEB = 5971;
const PUERTO_PARTIDA = 5972;
const CARPETA = "build/partidas/defensa97/personajes";
/** A dos metros de los goblins 0-2 de Gate City (build/gatecity/bichos.json). */
const NACER = "18.4,-9.7,87.4";
const DURACION = 45000;
const ARMADURA = 0.45;   // 1 - BARMOR_PROTECTION 55 × 0,01 (armor_pheonix55.script, armor_base.script:48-51)

// El marcador NO puede bajar (el 65): los declarados se cuentan aquí arriba.
const DECLARADOS = 13;
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
try { rmSync("build/partidas/defensa97", { recursive: true, force: true }); } catch {}
for (const nombre of ["Defensa97a", "Defensa97b"]) {
  const r = spawnSync(process.execPath, ["tools/personaje.mjs", "--nombre", nombre, "--mapa", "defensa97"], { encoding: "utf8" });
  if (r.status !== 0) { console.error(r.stdout, r.stderr); process.exit(1); }
}
const ID_A = "pruebas-defensa97a", ID_B = "pruebas-defensa97b";
{
  // B: la misma fabricación SIN el `puesto`. Se edita el disco del servidor,
  // que es donde vive el personaje con red; el `.bak.json` también, para que
  // un respaldo no lo devuelva puesto.
  for (const f of [`${CARPETA}/${ID_B}.json`, `${CARPETA}/${ID_B}.bak.json`]) {
    if (!existsSync(f)) continue;
    const p = JSON.parse(readFileSync(f, "utf8"));
    for (const o of p.objetos ?? []) delete o.puesto;
    writeFileSync(f, JSON.stringify(p, null, 1));
  }
  const a = JSON.parse(readFileSync(`${CARPETA}/${ID_A}.json`, "utf8"));
  const b = JSON.parse(readFileSync(`${CARPETA}/${ID_B}.json`, "utf8"));
  const puestos = (p) => p.objetos.filter((o) => o.puesto).map((o) => o.id);
  console.log(`  A puesto: ${JSON.stringify(puestos(a))} · B puesto: ${JSON.stringify(puestos(b))}`);
}

const liberados = [...liberarPuerto(PUERTO_WEB), ...liberarPuerto(PUERTO_PARTIDA)];
if (liberados.length) console.log(`  (había ${liberados.length} proceso(s) en los puertos: matados)`);
const dev = lanzarVite(PUERTO_WEB);
const partida = spawn(process.execPath, [
  "tools/servidor.mjs", "--puerto", String(PUERTO_PARTIDA), "--nombre", "La sonda 97",
  "--personajes", CARPETA, "--nacer", NACER,
], { stdio: ["ignore", "pipe", "pipe"] });
const salida = [];
partida.stdout.on("data", (b) => salida.push(String(b)));
partida.stderr.on("data", (b) => salida.push(`ERR ${b}`));
const costura = async () => (await fetch(`http://localhost:${PUERTO_PARTIDA}/costura`)).json();

/** Pulsa con el ratón la ranura `k` de «Choose your character» (sus botones son el `2k`). */
async function pulsarRanura(pag, k) {
  const b = (await pag.evaluate(() => window.probe.vgui.botones())).find((x) => x.i === 2 * k);
  if (!b) return false;
  await pag.mouse.click(b.centro, b.arriba + 12);
  return true;
}

/** «Goblin hits you: 9.0 damage.» → 9.0. */
const golpesEn = (textos) => textos.map((l) => /hits you: (\d+\.\d) /.exec(l)).filter(Boolean).map((m) => Number(m[1]));
const parryEn = (textos) => textos.filter((l) => /You parry the attack! \( \d+ vs\. \d+ \)/.test(l)).length;
const r1 = (x) => Math.round(x * 10) / 10;
const ordenar = (a) => [...a].sort((x, y) => x - y);

// Con otras sesiones en la máquina vite puede tardar más de diez segundos: se
// le pregunta hasta que contesta, en vez de leer un «connection refused».
// vite y el mapa del servidor: se les PREGUNTA en vez de dormir a ciegas (el 98;
// el servidor no abre el puerto hasta haber cargado el mapa, servidor.mjs:241).
await esperarHttp(`http://localhost:${PUERTO_WEB}/`, { tope: 90_000, proceso: dev, quien: "vite" });
await esperarHttp(`http://localhost:${PUERTO_PARTIDA}/partidas`, { tope: 90_000, proceso: partida, quien: "el servidor de partida" });
/**
 * LO QUE LE LLEGA A CADA NAVEGADOR POR EL CABLE: los `MENSAJE.TEXTO` del
 * servidor, leídos de los marcos del WebSocket de esa página. Es la consola
 * ANTES de su anillo: `probe.misiones.dicho()` sólo guarda las últimas líneas
 * (en la primera pasada enseñaba 8 de 25 golpes y 2 de 12 parries), así que
 * contar en él medía el tamaño del anillo. Que la consola PINTA lo que llega
 * se comprueba aparte, con la última frase.
 */
const llegado = { A: [], B: [] };
/** El contador de golpes del servidor justo antes de abrir la página de cada uno. */
const nAntes = { A: 0, B: 0 };
/** La última vida de cada hueco que le llegó a cada página en una foto. */
const vidaLlegada = { A: new Map(), B: new Map() };
const nav = await chromium.launch();
try {
  /**
   * Entra por el menú y elige su ranura. Con otras sesiones en la máquina la
   * entrada a veces se agota; se reintenta con una PÁGINA NUEVA —reintentar en
   * la misma dejó una vez un segundo enchufe sin personaje en el servidor y
   * la página creyéndose dentro— y se dice.
   */
  const abrirUnaVez = async (quien, id) => {
    const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
    try {
      // SIN EL RECARGADO EN CALIENTE DE VITE (el 93, como sondas/personaje96.mjs):
      // el árbol es compartido y otra sesión que guarde un archivo recarga la
      // página a media medida. Pasó: «Execution context was destroyed» y el
      // servidor con un hueco sin personaje.
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
      pag.on("console", (m) => {
        if (m.type() === "error" && /SyntaxError|Failed to fetch dynamically imported module|does not provide an export/.test(m.text())) {
          errores.push(`${quien} (consola): ${m.text().slice(0, 200)}`);
        }
      });
      pag.on("websocket", (ws) => {
        if (!ws.url().includes(`:${PUERTO_PARTIDA}/`)) return;
        ws.on("framereceived", (f) => {
          let m = null;
          try { m = JSON.parse(typeof f.payload === "string" ? f.payload : f.payload.toString("utf8")); } catch { return; }
          if (m?.t === "texto" && typeof m.texto === "string") llegado[quien].push({ texto: m.texto, cuando: Date.now() });
          // Y LA VIDA QUE LE MANDA EL SERVIDOR en cada foto (el propio jugador
          // va siempre, `foto`): es la vida de verdad tal como llega.
          if (m?.t === "foto") for (const j of m.jugadores ?? []) if (Number.isFinite(j?.vida)) vidaLlegada[quien].set(j.id, j.vida);
        });
      });
      await entrarPorElMenu(pag, PUERTO_WEB, { extra: `red=ws://localhost:${PUERTO_PARTIDA}/juego` });
      await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
      const lista = await pag.evaluate(() => window.probe.sesion.listar());
      const k = lista.findIndex((c) => c.id === id);
      if (k < 0) throw new Error(`${quien}: el servidor no lista ${id} (${JSON.stringify(lista.map((c) => c.id))})`);
      await pulsarRanura(pag, k);
      await pag.waitForFunction(() => window.probe.sesion.estado() === "jugando" && window.probe.vgui.abierto() === null,
        null, { timeout: 90000 });
      // Y que el SERVIDOR lo tenga: lo que decide es él, no la página.
      let h = null, tiene = null;
      for (let k = 0; k < 20 && tiene !== id; k++) {
        if (k) await esperar(1000);
        h = await pag.evaluate(() => window.probe.red.estado()?.yo ?? null);
        tiene = (await costura()).clientes.find((x) => x.id === h)?.personaje ?? null;
      }
      if (tiene !== id) throw new Error(`${quien}: el servidor no tiene a ${id} en el hueco ${h} (tiene ${tiene})`);
      return pag;
    } catch (e) {
      await pag.close().catch(() => {});
      throw e;
    }
  };
  const abrir = async (quien, id) => {
    for (let intento = 1; ; intento++) {
      llegado[quien] = [];
      vidaLlegada[quien] = new Map();
      // Desde dónde son SUYOS los golpes del servidor: lo de antes de abrir
      // esta página no le pudo llegar a ella.
      nAntes[quien] = (await costura()).defensa?.golpes ?? 0;
      try { return await abrirUnaVez(quien, id); } catch (e) {
        if (intento >= 3) throw e;
        console.log(`    (${quien}: la entrada falló «${String(e?.message ?? e).slice(0, 80)}», intento ${intento + 1} con otra página)`);
        await esperar(2000);
      }
    }
  };
  const A = await abrir("A", ID_A);
  const B = await abrir("B", ID_B);
  const yo = (pag) => pag.evaluate(() => window.probe.red.estado()?.yo ?? null);
  const [yoA, yoB] = [await yo(A), await yo(B)];
  const c0 = await costura();
  const pj = (h) => c0.clientes.find((x) => x.id === h)?.personaje ?? null;
  control("los dos han entrado por el menú con su personaje, y el servidor los tiene",
    pj(yoA) === ID_A && pj(yoB) === ID_B, `A ${yoA}=${pj(yoA)} · B ${yoB}=${pj(yoB)}`);

  const vidaHud = (pag) => pag.evaluate(() => window.probe.sesion.personaje?.vida ?? null);
  const dicho = (pag) => pag.evaluate(() => window.probe.misiones.dicho());
  const hueco = { A: yoA, B: yoB };
  const pags = { A, B };
  const historial = new Map();
  const acumular = (c) => { for (const x of c.defensa?.historial ?? []) historial.set(x.n, x); return c; };
  const maxN = (qs) => Math.max(0, ...[...historial.values()].filter((x) => qs.some((q) => x.cliente === hueco[q])).map((x) => x.n));

  /**
   * UNA MARCA SIN CARRERA. Entre «el servidor apunta un golpe» y «su frase
   * llega por el cable» hay unos milisegundos, y la primera pasada se los
   * comió en el borde de una fase: una frase de más, con el juego bien. Así
   * que cada lectura se hace en una ventana TRANQUILA: se lee el servidor, se
   * espera 0,8 s, se toma lo que ha llegado a cada página, y se vuelve a leer
   * el servidor. Si en medio no le han pegado a nadie de `qs`, lo que llegó
   * son exactamente las frases de los golpes hasta la primera lectura.
   *
   * Y el 200 del historial del servidor: se acumula aquí en cada lectura,
   * porque mientras una página tarda en entrar los goblins no esperan (en una
   * pasada fueron 205 golpes) y el servidor sólo guarda los 200 últimos.
   */
  const marca = async (qs) => {
    for (let k = 0; k < 60; k++) {
      acumular(await costura());
      const n = maxN(qs);
      await esperar(800);
      const m = { n, frases: {}, vida: {}, hud: {}, consola: {} };
      for (const q of qs) {
        m.frases[q] = llegado[q].length;
        m.vida[q] = vidaLlegada[q].get(hueco[q]) ?? null;
        m.hud[q] = await vidaHud(pags[q]);
        m.consola[q] = await dicho(pags[q]);
      }
      acumular(await costura());
      if (maxN(qs) === n) return m;
    }
    throw new Error(`no hubo 0,8 s sin golpes a ${qs.join("+")} en 60 intentos`);
  };
  /** Lo de `q` entre dos marcas. */
  const entre = (q, m0, m1) => ({
    golpes: [...historial.values()].filter((x) => x.cliente === hueco[q] && x.n > m0.n && x.n <= m1.n).sort((a, b) => a.n - b.n),
    textos: llegado[q].slice(m0.frases[q], m1.frases[q]).map((x) => x.texto),
    vida0: m0.vida[q], vida1: m1.vida[q], hud0: m0.hud[q], hud1: m1.hud[q], consola: m1.consola[q],
  });
  /** Se espera a que alguno de `qs` (o todos) lleve `n` golpes que entran desde `m0`. */
  const esperarGolpes = async (qs, m0, { n = 4, tope = 60000, alguno = false } = {}) => {
    let t = 0;
    const entran = (q) => [...historial.values()].filter((x) => x.cliente === hueco[q] && x.n > m0.n && !x.parry.para && x.dano > 0).length;
    while (t < tope) {
      await esperar(1000); t += 1000;
      acumular(await costura());
      const listos = qs.filter((q) => entran(q) >= n);
      if (alguno ? listos.length > 0 : listos.length === qs.length) break;
    }
    return t;
  };

  // ── FASE 1: LOS DOS DENTRO ───────────────────────────────────────────────
  //
  // No se elige a quién pegan los goblins: va a por quien la IA decida (en
  // una pasada fue A, en otra B). Mientras están los dos, al que NO le pegan
  // es el control negativo del reparto: no le puede llegar ni una frase.
  const m0 = await marca(["A", "B"]);
  const t1 = await esperarGolpes(["A", "B"], m0, { alguno: true });
  const m1 = await marca(["A", "B"]);
  const f1 = { A: entre("A", m0, m1), B: entre("B", m0, m1) };
  const entranDe = (f) => f.golpes.filter((x) => !x.parry.para && x.dano > 0);
  const X = entranDe(f1.A).length >= entranDe(f1.B).length ? "A" : "B";
  const Y = X === "A" ? "B" : "A";
  console.log(`\n  fase 1, ${t1} ms: van a por ${X} (${f1[X].golpes.length} golpes); a ${Y}, ${f1[Y].golpes.length}`);
  control(`CONTROL NEGATIVO del reparto (\`MSG_ONE\`): con los goblins pegando a ${X}, a ${Y} sólo le llegan SUS golpes`,
    entranDe(f1[X]).length >= 1 && golpesEn(f1[Y].textos).length === entranDe(f1[Y]).length &&
      parryEn(f1[Y].textos) === f1[Y].golpes.filter((x) => x.parry.para).length,
    `${X} recibió ${entranDe(f1[X]).length}; a ${Y} le llegaron ${golpesEn(f1[Y].textos).length} «hits you» por ${entranDe(f1[Y]).length} golpes suyos`);

  // ── FASE 2: X SE VA, Y VAN A POR Y ───────────────────────────────────────
  const fotos = { [X]: f1[X], [Y]: f1[Y] };
  if (entranDe(f1[Y]).length < 4) {
    await pags[X].close();
    const m2 = await marca([Y]);
    const t2 = await esperarGolpes([Y], m2);
    const m3 = await marca([Y]);
    fotos[Y] = entre(Y, m2, m3);
    console.log(`  fase 2, ${t2} ms: ${X} se ha ido y van a por ${Y} (${fotos[Y].golpes.length} golpes)`);
  }

  // ── LO QUE SE LEE ────────────────────────────────────────────────────────
  const medir = (q) => {
    const f = fotos[q];
    const entran = entranDe(f);
    const parados = f.golpes.filter((x) => x.parry.para);
    const llega = ordenar(golpesEn(f.textos));
    // Lo que dijo la defensa del servidor, golpe a golpe, al décimo como lo
    // escribe `"%.1f"`: lo que llega tiene que ser ESO (y no lo de la IA).
    const dicen = ordenar(entran.map((x) => r1(x.dano)));
    const proporciones = entran.map((x) => x.dano / x.antes);
    const suma = entran.reduce((s, x) => s + x.dano, 0), pedido = entran.reduce((s, x) => s + x.antes, 0);
    const baja = f.vida0 - f.vida1, bajaHud = f.hud0 - f.hud1;
    console.log(`  ${q}: ${entran.length} entran, ${parados.length} parados · llega ${JSON.stringify(llega)} · ` +
      `pidió ${JSON.stringify(ordenar(entran.map((x) => r1(x.antes))))} · vida −${r1(baja)} (defensa ${r1(suma)}, pedido ${r1(pedido)}); ` +
      `en el HUD −${r1(bajaHud)}`);
    return { f, entran, parados, llega, dicen, proporciones, suma, pedido, baja, bajaHud };
  };
  const a = medir("A");
  const b = medir("B");
  const todas = (l, v) => l.length > 0 && l.every((x) => Math.abs(x - v) < 0.005);

  control("CONTROL POSITIVO: a los dos les pegan (≥ 4 golpes que entran cada uno) y se para alguno",
    a.entran.length >= 4 && b.entran.length >= 4 && a.parados.length + b.parados.length >= 1,
    `A ${a.entran.length} (+${a.parados.length} parados), B ${b.entran.length} (+${b.parados.length} parados)`);
  control("A (fénix PUESTO): le llega cada golpe con el 45 % de lo que pidió el goblin",
    JSON.stringify(a.llega) === JSON.stringify(a.dicen) && todas(a.proporciones, ARMADURA),
    `llega ${JSON.stringify(a.llega)}; proporciones ${JSON.stringify([...new Set(a.proporciones.map((x) => x.toFixed(3)))])}`);
  control("CONTROL B (fénix en la mochila, NO puesto): le llega cada golpe ENTERO",
    JSON.stringify(b.llega) === JSON.stringify(b.dicen) && todas(b.proporciones, 1),
    `llega ${JSON.stringify(b.llega)}; proporciones ${JSON.stringify([...new Set(b.proporciones.map((x) => x.toFixed(3)))])}`);
  // La diferencia existe en los números (el 71): con 6-9 de daño, el entero y
  // el 45 % no coinciden nunca al décimo. Si el navegador volviera a decir lo
  // de la IA (la rama `pega` de src/main.js), saldría aquí.
  const pedidosA = a.entran.map((x) => r1(x.antes));
  const deLaIA = golpesEn(a.f.consola).filter((v) => pedidosA.includes(v) && !a.dicen.includes(v));
  control("la consola de A no enseña NINGUNA frase con el daño de antes de la defensa",
    !deLaIA.length, deLaIA.length ? `enseña ${JSON.stringify(deLaIA)}` : `${golpesEn(a.f.consola).length} frases en su anillo, ninguna de la IA`);
  const ultimaA = [...a.f.textos].reverse().find((x) => /hits you|parry/.test(x));
  control("la consola de A PINTA lo que le llega (la última frase está en su anillo)",
    Boolean(ultimaA) && a.f.consola.some((l) => l.endsWith(ultimaA)), `«${ultimaA}»`);
  control("la vida que le llega a A baja lo que dejó la defensa, no lo que pidió el goblin",
    Math.abs(a.baja - a.suma) < 0.5 && Math.abs(a.baja - a.pedido) > 3, `baja ${r1(a.baja)}, defensa ${r1(a.suma)}, pedido ${r1(a.pedido)}`);
  control("CONTROL: la vida que le llega a B baja el daño entero",
    Math.abs(b.baja - b.suma) < 0.5 && b.suma > 0, `baja ${r1(b.baja)}, defensa ${r1(b.suma)}`);
  control("EL PARRY con servidor: por cada golpe parado le llega a ESE «You parry the attack! ( a vs. b )»",
    a.parados.length + b.parados.length >= 1 && parryEn(a.f.textos) === a.parados.length && parryEn(b.f.textos) === b.parados.length,
    `A ${a.parados.length} parados/${parryEn(a.f.textos)} frases · B ${b.parados.length}/${parryEn(b.f.textos)}`);

  const c = await costura();
  control("el servidor pasó los golpes de A por el fénix y los de B por ninguna pieza que proteja",
    a.f.golpes.length > 0 && a.f.golpes.every((x) => x.armadura.piezas.some((q) => q.id === "armor_pheonix55" && q.despues < q.antes)) &&
      b.f.golpes.length > 0 && b.f.golpes.every((x) => !x.armadura.piezas.some((q) => q.despues !== q.antes)),
    `A ${JSON.stringify(a.f.golpes[0]?.armadura?.piezas?.map((q) => `${q.id} ${r1(q.antes)}->${r1(q.despues)}`))} · ` +
      `B ${JSON.stringify(b.f.golpes[0]?.armadura?.piezas?.map((q) => `${q.id} ${r1(q.antes)}->${r1(q.despues)}`))}`);
  control("el servidor no ha escupido ningún error y tiene los guiones de objeto",
    !salida.some((l) => l.startsWith("ERR")) && (c.defensa?.sinGuiones ?? 0) === 0,
    salida.filter((l) => l.startsWith("ERR")).join(" ").slice(0, 200) || `sinGuiones ${c.defensa?.sinGuiones}`);
  // Lo que se mide y NO se cuenta: la vida del HUD (la copia del navegador).
  if (Math.abs(a.bajaHud - a.baja) > 0.5 || Math.abs(b.bajaHud - b.baja) > 0.5) {
    console.log(`  (pendiente, sin contar: la vida del HUD no baja lo mismo que la que llega — A ${r1(a.bajaHud)} contra ${r1(a.baja)}, B ${r1(b.bajaHud)} contra ${r1(b.baja)})`);
  }
} catch (e) {
  // El 65: una caída es una ROJA, no una nota.
  control(`la sonda se cayó: ${String(e?.message ?? e).split("\n")[0].slice(0, 200)}`, false);
} finally {
  await nav.close().catch(() => {});
  matar(partida);
  matar(dev);
}

control("ni un error de página", !errores.length, errores.join(" | ").slice(0, 400));
const verdes = controles.filter((c) => c.bien).length;
console.log(`\n  ${verdes} de ${Math.max(DECLARADOS, controles.length)} en verde`);
if (controles.length < DECLARADOS) console.log(`  (corrieron ${controles.length} de ${DECLARADOS} declarados: los que faltan son rojos)`);
if (verdes !== DECLARADOS) console.log(`  el servidor dijo:\n${salida.join("").split("\n").slice(-30).map((l) => `    ${l}`).join("\n")}`);
process.exit(verdes === DECLARADOS && controles.length === DECLARADOS ? 0 : 1);
