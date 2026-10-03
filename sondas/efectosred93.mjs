// LO QUE UN EFECTO LE HACE A LA PANTALLA, EN UNO Y CON SERVIDOR — experimento 93, pieza B.
//
//   node sondas/efectosred93.mjs
//
// El veneno (`effects/dot_poison`) pone un icono de estado arriba a la
// izquierda —una silueta BLANCA de 64×64 con una barra verde debajo que se
// vacía— y tiñe la pantalla de verde 0,2 s en cada mordisco:
//
//     hud.addstatusicon ent_me hud/status/alpha_dot_poison EFFECT_ID EFFECT_DURATION
//     effect screenfade ent_me 0.2 0 (75,215,0) 30 fadein
//                                       effects/dot_poison.script, `dot_start`/`dot_effect`
//
// Se mide lo que hay EN PANTALLA: el DOM real de la capa de mensajes
// (`probe.muerte.pantalla()`, que lee posiciones con `getBoundingClientRect`),
// los PÍXELES del recorte del icono, y el velo con un `MutationObserver` sobre
// su `style` —no con una espera: el fundido dura 0,2 s y un `evaluate` no mide
// décimas (el 75)—.
//
// DOS FASES, las dos entrando por el menú (CLAUDE.md §3):
//
//   A. UN JUGADOR, Gate City. El veneno lo pone la sonda con una araña de la
//      manada de atacante, por la puerta del juego (`probe.veneno.aplicar`,
//      la del 91: lo que se mide es lo que el EFECTO hace después, no quién
//      lo pone). Control negativo: antes del veneno no hay icono ni verde, y
//      al acabar el icono se va.
//   B. DOS JUGADORES contra `tools/servidor.mjs`, sala88, con la rata del 88
//      envenenando (`--params monsters/giantrat=add_dot_poison`): el camino
//      ENTERO del juego —Ana le pega, la rata la muerde, el veneno corre en el
//      servidor y su pantalla viaja por `MENSAJE.PANTALLA`—. Control negativo:
//      Beto, al lado, no ve ni icono ni verde, en el DOM y en los píxeles.

import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { liberarPuerto } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";
import { leerPng } from "../tools/png.mjs";

const PUERTO_WEB = 5933;
const PUERTO_PARTIDA = 5934;
const MAPA_RED = "sala88";
const RATA = "monsters/giantrat";
const PERSONAJES = "build/partidas/sonda93b/personajes";
const VISTAS = "build/sondas93b";
const DURACION = 8;          // el veneno de la fase A: ocho segundos, ocho mordiscos
try { rmSync("build/partidas/sonda93b", { recursive: true, force: true }); } catch {}
mkdirSync(VISTAS, { recursive: true });

const liberados = [...liberarPuerto(PUERTO_WEB), ...liberarPuerto(PUERTO_PARTIDA)];
if (liberados.length) console.log(`  (había ${liberados.length} proceso(s) en los puertos: matados)`);
const dev = spawn("npx", ["vite", "--port", String(PUERTO_WEB), "--strictPort"], { shell: true, stdio: "ignore" });
let partida = null;
const salida = [];
const matar = (p) => { if (!p) return; try { spawnSync("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// El marcador NO puede bajar (el 65 y el 86).
const DECLARADOS = 24;
const controles = [];
const control = (que, bien, detalle = "") => { controles.push({ que, bien: Boolean(bien), detalle }); return bien; };
const errores = [];

// ── LOS INSTRUMENTOS ───────────────────────────────────────────────────────

/** Lo que la capa de mensajes tiene en el DOM ahora mismo. */
const pantalla = (pag) => pag.evaluate(() => window.probe.muerte.pantalla());

/**
 * Un `MutationObserver` sobre el `style` del velo: cuenta las veces que pasa a
 * tener el verde del veneno. Lo que se cuenta es lo que el navegador ha
 * PINTADO en el `div`, no lo que la regla dice.
 */
const vigilarVelo = (pag) => pag.evaluate(() => {
  const velo = document.querySelector(".ms-velo");
  const v = { verdes: 0, cambios: 0, ultimo: "", ejemplo: "" };
  window.__velo93 = v;
  if (!velo) return false;
  let antes = velo.style.background;
  new MutationObserver(() => {
    const ahora = velo.style.background;
    v.cambios++;
    v.ultimo = ahora;
    if (/rgba\(75, 215, 0/.test(ahora) && !/rgba\(75, 215, 0/.test(antes)) { v.verdes++; v.ejemplo = ahora; }
    antes = ahora;
  }).observe(velo, { attributes: true, attributeFilter: ["style"] });
  return true;
});
const velo = (pag) => pag.evaluate(() => ({ ...(window.__velo93 ?? { verdes: -1 }) }));

/**
 * Los píxeles del rectángulo de un icono de estado: (10,10) y 64×75, que es
 * donde lo pone `VGUI_Status::Update` al primero (ui/vgui_status.h:224).
 * Blancos en el dibujo (las 64 primeras filas) y verdes en la barra (las 11
 * últimas).
 */
async function recorte(pag, nombre) {
  const ruta = `${VISTAS}/${nombre}.png`;
  await pag.screenshot({ path: ruta, clip: { x: 10, y: 10, width: 64, height: 75 } });
  const img = leerPng(ruta);
  let blancos = 0, verdes = 0;
  for (let y = 0; y < img.alto; y++) {
    for (let x = 0; x < img.ancho; x++) {
      const i = (y * img.ancho + x) * 4;
      const [r, g, b] = [img.rgba[i], img.rgba[i + 1], img.rgba[i + 2]];
      if (y < 64 && r >= 235 && g >= 235 && b >= 235) blancos++;
      if (y >= 64 && g >= r + 60 && g >= b + 60) verdes++;
    }
  }
  return { blancos, verdes, ruta };
}

const parar = (pag) => pag.addInitScript(() => {
  // El árbol es compartido: sin esto el recargado en caliente de Vite tira la
  // partida a media medida (copiado de efectos90 y veneno91).
  const Real = window.WebSocket;
  const Falso = function (url, protos) {
    const esHmr = protos === "vite-hmr" || (Array.isArray(protos) && protos.includes("vite-hmr"));
    if (!esHmr) return new Real(url, protos);
    return { close() {}, send() {}, addEventListener() {}, removeEventListener() {}, readyState: 3 };
  };
  // Y LAS CONSTANTES, que la copia de efectos90 no trae: el cliente de red
  // pregunta `readyState === WebSocket.OPEN`, y sin ellas es `undefined` y no
  // manda nada. La primera pasada de esta sonda se quedó así en la fase B,
  // esperando a una partida que nunca empezaba.
  Object.assign(Falso, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  Falso.prototype = Real.prototype;
  window.WebSocket = Falso;
});

/** Espera a que no haya ventanas de aviso en la esquina de arriba (tapan el icono). */
async function sinVentanas(pag, tope = 20000) {
  for (let t = 0; t < tope; t += 500) {
    const e = await pantalla(pag);
    if (!(e?.ventanas?.length)) return true;
    await esperar(500);
  }
  return false;
}

await esperar(8000);   // vite
const nav = await chromium.launch();
try {
  // ════ A. UN JUGADOR ════════════════════════════════════════════════════
  {
    const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
    pag.on("pageerror", (e) => errores.push(`A: ${String(e).slice(0, 200)}`));
    await parar(pag);
    await entrarPorElMenu(pag, PUERTO_WEB, { mapa: "gatecity" });
    await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
    await pag.waitForTimeout(2500);
    const mapa = await pag.evaluate(() => window.probe.vgui2.mapaDeLaPartida());
    control("A. se ha entrado a Gate City por el menú", mapa === "gatecity", String(mapa));
    await sinVentanas(pag);
    await vigilarVelo(pag);

    // CONTROL NEGATIVO, antes: ni icono ni verde.
    const e0 = await pantalla(pag);
    const p0 = await recorte(pag, "a_antes");
    await pag.waitForTimeout(1500);
    const v0 = await velo(pag);
    control("A. ANTES del veneno: ningún icono en el DOM, el velo no se ha teñido de verde y el recorte no tiene la silueta",
      (e0?.iconos?.length ?? -1) === 0 && v0.verdes === 0 && p0.blancos < 300,
      `iconos ${e0?.iconos?.length}, verdes ${v0.verdes}, blancos ${p0.blancos}`);

    const indice = await pag.evaluate(() => window.probe.veneno.bicho("monsters/spider"));
    const puesto = await pag.evaluate((o) => window.probe.veneno.aplicar("effects/dot_poison", o),
      { duracion: String(DURACION), dano: "1", indice });
    control("A. el veneno se pone por la puerta del juego, con una araña de la manada de atacante",
      puesto?.puesto === true && puesto?.id === "DOT_poison", JSON.stringify(puesto));
    await pag.waitForTimeout(1200);

    const e1 = await pantalla(pag);
    const ic = e1?.iconos?.find((x) => x.nombre === "DOT_poison");
    control("A. DOM: hay un icono «DOT_poison» en (10,10), de 64×75, con su PNG horneado cargado",
      ic && ic.x === 10 && ic.y === 10 && ic.ancho === 64 && ic.alto === 75 && ic.cargada && !ic.falta,
      JSON.stringify(ic ?? e1?.iconos));
    const p1 = await recorte(pag, "a_con_veneno");
    control("A. PÍXELES: el recorte del icono trae la silueta blanca (más de 800 píxeles blancos, antes " + p0.blancos + ")",
      p1.blancos > 800 && p1.blancos > p0.blancos + 600, `blancos ${p1.blancos}`);
    control("A. PÍXELES: y la barra verde debajo (más de 100 píxeles verdes en las 11 filas de abajo)",
      p1.verdes > 100 && p1.verdes > p0.verdes + 80, `verdes ${p1.verdes} (antes ${p0.verdes})`);
    await pag.waitForTimeout(2500);
    const e2 = await pantalla(pag);
    const ic2 = e2?.iconos?.find((x) => x.nombre === "DOT_poison");
    control("A. la barra se VACÍA con el tiempo (`flPercent`, vgui_status.h:73)",
      ic && ic2 && ic2.barra < ic.barra, `${ic?.barra} -> ${ic2?.barra} px`);
    const v1 = await velo(pag);
    const heridas = (await pag.evaluate(() => window.probe.veneno.heridas())).length;
    control("A. el velo se ha teñido de (75,215,0) una vez por mordisco (`dot_effect`)",
      v1.verdes >= 2 && v1.verdes === heridas, `verdes ${v1.verdes}, mordiscos ${heridas}, ejemplo «${v1.ejemplo}»`);

    await pag.waitForTimeout((DURACION - 2) * 1000);
    const e3 = await pantalla(pag);
    const p3 = await recorte(pag, "a_despues");
    control("A. al acabar el veneno el icono se va, del DOM y de los píxeles",
      !(e3?.iconos ?? []).some((x) => x.nombre === "DOT_poison") && p3.blancos < p1.blancos - 600,
      `iconos ${JSON.stringify(e3?.iconos)}, blancos ${p3.blancos}`);
    control("A. y el brillo se ha leído y NO se dibuja (primera persona: cl_parse.c:323-331 está en `#if 0`)",
      (e3?.brillos ?? 0) >= 1, `brillos ${e3?.brillos}`);
    await pag.close();
  }

  // ════ B. DOS JUGADORES CONTRA UN SERVIDOR ══════════════════════════════
  partida = spawn(process.execPath, [
    "tools/servidor.mjs", "--puerto", String(PUERTO_PARTIDA), "--nombre", "La sonda 93b",
    "--personajes", PERSONAJES, "--mapa", MAPA_RED,
    "--nacer", "17.3,0.1,0",
    "--params", `${RATA}=add_dot_poison`,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  partida.stdout.on("data", (b) => salida.push(String(b)));
  partida.stderr.on("data", (b) => salida.push(`ERR ${b}`));
  await esperar(5000);
  const costura = async () => (await fetch(`http://localhost:${PUERTO_PARTIDA}/costura`)).json();
  const laRata = (c) => c?.bichos?.find((b) => b.script === RATA) ?? null;

  const abrir = async (quien) => {
    const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
    pag.on("pageerror", (e) => errores.push(`${quien}: ${String(e).slice(0, 200)}`));
    await parar(pag);
    await entrarPorElMenu(pag, PUERTO_WEB, { mapa: MAPA_RED, extra: `red=ws://localhost:${PUERTO_PARTIDA}/juego` });
    await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
    return pag;
  };
  const ana = await abrir("ana");
  const beto = await abrir("beto");
  await ana.evaluate(() => window.probe.sesion.nuevo("Ana", "swords_rsword"));
  await esperar(800);
  await beto.evaluate(() => window.probe.sesion.nuevo("Beto", "swords_rsword"));
  await esperar(2000);
  const yo = (pag) => pag.evaluate(() => window.probe.red.estado()?.yo ?? null);
  const [yoAna, yoBeto] = [await yo(ana), await yo(beto)];
  const c0 = await costura();
  control("B. los dos han entrado por el menú y el servidor los tiene con personaje",
    c0.clientes.filter((x) => x.personaje).length === 2, JSON.stringify(c0.clientes));
  control("B. la rata tiene guion en el servidor y el veneno del operador puesto", laRata(c0)?.veneno === "1",
    `veneno ${laRata(c0)?.veneno}`);
  await sinVentanas(ana); await sinVentanas(beto);
  await vigilarVelo(ana); await vigilarVelo(beto);
  const pBeto0 = await recorte(beto, "b_beto_antes");

  // Ana anda hasta la rata y le pega (el camino del 92: con red el cuerpo lo
  // mueve el servidor, así que nada de teletransportes).
  const mirarLaRata = (pag) => pag.evaluate((g) => {
    const r = window.probe.ia.bicho(g);
    if (!r) return null;
    window.probe.mundo.mirar(r.donde[0], r.donde[1] + 0.2, r.donde[2]);   // TRES números (el 78)
    const p = window.probe.player.feet;
    return { a: Math.hypot(r.donde[0] - p[0], r.donde[2] - p[2]) };
  }, RATA);
  const acercarse = async (pag, cerca = 1.0) => {
    let r = await mirarLaRata(pag);
    for (let k = 0; k < 40 && r && r.a > cerca; k++) {
      await pag.keyboard.down("KeyW");
      await esperar(Math.min(400, 150 + (r.a - cerca) * 200));
      await pag.keyboard.up("KeyW");
      await esperar(150);
      r = await mirarLaRata(pag);
    }
    return r;
  };
  let c = c0;
  for (let k = 0; k < 6 && !(laRata(c)?.recibidos?.game_damaged > 0); k++) {
    await acercarse(ana);
    await ana.evaluate(() => window.probe.golpe.atacar(1.2));
    await esperar(700);
    c = await costura();
  }
  // Hasta que el veneno llegue a su pantalla. Se mira el DOM a cada vuelta:
  // la rata y el veneno pueden matarla, y al morir el guion de su navegador
  // borra los iconos (`hud.killicons ent_me` en `game_death`).
  let eAna = null, pAna = null, envenenada = false, dijo = false;
  for (let t = 0; t < 30000; t += 300) {
    await mirarLaRata(ana);
    await esperar(300);
    eAna = await pantalla(ana);
    // `dicho()` es un anillo: la frase se busca A CADA VUELTA y se recuerda.
    // La primera rotura deliberada la perdió por mirar sólo al final, tras
    // treinta segundos de mordiscos (el 91 ya avisó de este anillo).
    if (!dijo) dijo = (await ana.evaluate(() => window.probe.misiones.dicho())).some((l) => String(l).includes("You have been poisoned!"));
    if ((eAna?.iconos ?? []).some((x) => x.nombre === "DOT_poison")) {
      envenenada = true;
      pAna = await recorte(ana, "b_ana_con_veneno");
      break;
    }
  }
  const dAna = await ana.evaluate(() => window.probe.misiones.dicho());
  control("B. la rata muerde a Ana con veneno: a Ana le llega «You have been poisoned!»",
    dijo || dAna.some((l) => String(l).includes("You have been poisoned!")), dAna.slice(-3).join(" | "));
  const icA = eAna?.iconos?.find((x) => x.nombre === "DOT_poison");
  control("B. DOM de Ana: el icono «DOT_poison» del servidor, en (10,10), con su PNG cargado",
    envenenada && icA?.x === 10 && icA?.y === 10 && icA?.cargada, JSON.stringify(icA ?? eAna?.iconos));
  control("B. PÍXELES de Ana: la silueta blanca en el recorte del icono",
    (pAna?.blancos ?? 0) > 800, `blancos ${pAna?.blancos}`);
  await esperar(2500);
  const vA = await velo(ana);
  control("B. el velo de Ana se ha teñido de (75,215,0) por los mordiscos del veneno",
    vA.verdes >= 1, `verdes ${vA.verdes}, ejemplo «${vA.ejemplo}»`);
  const activosAna = await ana.evaluate(() => window.probe.veneno.activos());
  // PREMISA, no efecto: sigue verde con el cable roto, y debe. Lo que dice es
  // que lo que se ve en Ana no puede salir de una copia local del veneno.
  control("B. PREMISA: el navegador de Ana no corre ningún veneno (los efectos viven en el servidor)",
    !activosAna.some((e) => e.id === "DOT_poison"), JSON.stringify(activosAna));

  // CONTROL NEGATIVO: Beto, al lado, en el mismo instante.
  const eBeto = await pantalla(beto);
  const pBeto = await recorte(beto, "b_beto_durante");
  const vB = await velo(beto);
  control("B. CONTROL NEGATIVO, DOM de Beto: ningún icono", (eBeto?.iconos?.length ?? -1) === 0, JSON.stringify(eBeto?.iconos));
  control("B. CONTROL NEGATIVO, PÍXELES de Beto: sin silueta en el mismo recorte (con el mismo umbral que da verde en Ana)",
    pBeto.blancos < 300 && pBeto.blancos <= pBeto0.blancos + 100, `blancos ${pBeto.blancos} (antes ${pBeto0.blancos})`);
  control("B. CONTROL NEGATIVO: el velo de Beto no se ha teñido de verde ni una vez", vB.verdes === 0, `verdes ${vB.verdes}`);

  const c3 = await costura();
  const efA = c3.efectos.find((e) => e.cliente === yoAna);
  control("B. en el servidor: el anfitrión de Ana mandó icono y fundidos, y el brillo se contó sin mandarse",
    efA?.pantallas?.icono >= 1 && efA?.pantallas?.fundido >= 1 && efA?.pantallas?.brillo >= 1,
    JSON.stringify(efA?.pantallas));
  control("B. y Beto ni tiene anfitrión de efectos", !c3.efectos.some((e) => e.cliente === yoBeto), JSON.stringify(c3.efectos.map((e) => e.cliente)));
  control("B. el servidor no ha escupido ningún error", !salida.some((l) => l.startsWith("ERR")) && (c3.fallos ?? 0) === 0,
    salida.filter((l) => l.startsWith("ERR")).join(" ").slice(0, 200) || `fallos ${c3.fallos}`);
} catch (e) {
  console.log(`\n  LA SONDA SE HA CAÍDO: ${String(e?.message ?? e).split("\n")[0]}`);
  controles.push({ que: `la sonda termina sin caerse (${String(e?.message ?? e).split("\n")[0]})`, bien: false, detalle: "" });
} finally {
  control("ni un error de página en las tres páginas", errores.length === 0, errores.slice(0, 3).join(" · ") || "ninguno");
  await nav.close().catch(() => {});
  matar(partida);
  matar(dev);
}

const bien = controles.filter((c) => c.bien).length;
console.log(`\n  ── ${bien} de ${DECLARADOS} controles ──`);
if (controles.length !== DECLARADOS) console.log(`  corrieron ${controles.length} de ${DECLARADOS} declarados`);
for (const c of controles) console.log(`  ${c.bien ? "sí" : "NO"}  ${c.que}${c.detalle ? `  [${c.detalle}]` : ""}`);
console.log(`  recortes en ${VISTAS}/`);
if (salida.length) console.log(`  el servidor dijo:\n${salida.join("").split("\n").slice(-15).map((l) => `    ${l}`).join("\n")}`);
process.exit(controles.length === DECLARADOS && controles.every((c) => c.bien) ? 0 : 1);
