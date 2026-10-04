// EL BRILLO EN EL MODELO DEL OTRO, Y LAS IMÁGENES DEL HUD — experimento 95, pieza E.
//
//   node sondas/brillo95.mjs          (npm run sonda:brillo95)
//
// El veneno pone `effect glow ent_me (75,215,0) 72 …` (effects/dot_poison).
// En el motor eso es el `renderfx` de la ENTIDAD (mseffects.cpp:340-344) y lo
// ven los DEMÁS sobre su modelo: una segunda pasada aditiva del modelo,
// empujada por la normal (gl_studio.c:3147-3168). Hasta el 95 se leía y no se
// dibujaba. Aquí se mide EN LA PANTALLA DEL OTRO.
//
// DOS FASES, las dos entrando por el menú (CLAUDE.md §3):
//
//   A. UN JUGADOR, sala88: `hud.addimgicon`. NINGÚN mapa portado lo dispara
//      —lo llaman la pelota del fútbol (ms_soccer/) y el maestro del juego en
//      su modo de inocentes (game_master.script:1527)—, así que la sonda llama
//      `ext_hud_icon` del guion del jugador con `probe.jugador.llamar`, que es
//      el evento que llama la pelota (ms_soccer/soccer_ball.script:428). Lo
//      que se mide es lo que hace la LÍNEA después: el intérprete, la puerta,
//      la capa de mensajes y el PNG horneado. Quién lo dispara queda dicho.
//   B. DOS JUGADORES contra `tools/servidor.mjs`, sala88, con la rata del 88
//      envenenando (`--params monsters/giantrat=add_dot_poison`): Ana le pega,
//      la rata la muerde, el veneno corre en el servidor, el brillo viaja en
//      la foto de Ana y **Beto la ve brillar**. Se mide la malla de la figura
//      (`probe.red.otros()`, leído de la malla y no de la foto) y los PÍXELES
//      alrededor de Ana en la pantalla de Beto: antes, durante y al acabar.
//      Controles negativos: Ana no ve brillar a Beto; y antes y después del
//      veneno no hay verde alrededor de Ana.

import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { liberarPuerto, lanzarVite, esperarHttp } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";
import { leerPng } from "../tools/png.mjs";

// Puertos propios: el árbol lo comparten varias sesiones (efectosred93 usa 5933/5934).
const PUERTO_WEB = 5995;
const PUERTO_PARTIDA = 5996;
const MAPA = "sala88";
const RATA = "monsters/giantrat";
const PERSONAJES = "build/partidas/sonda95e/personajes";
const VISTAS = "build/sondas95e";
try { rmSync("build/partidas/sonda95e", { recursive: true, force: true }); } catch {}
mkdirSync(VISTAS, { recursive: true });

const liberados = [...liberarPuerto(PUERTO_WEB), ...liberarPuerto(PUERTO_PARTIDA)];
if (liberados.length) console.log(`  (había ${liberados.length} proceso(s) en los puertos: matados)`);
const dev = lanzarVite(PUERTO_WEB);
let partida = null;
const salida = [];
const matar = (p) => { if (!p) return; try { spawnSync("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// El marcador NO puede bajar (el 65 y el 86).
const DECLARADOS = 16;
const controles = [];
const control = (que, bien, detalle = "") => { controles.push({ que, bien: Boolean(bien), detalle }); return bien; };
const errores = [];

const pantalla = (pag) => pag.evaluate(() => window.probe.muerte.pantalla());

/** Un recorte de la pantalla y cuántos píxeles tiran a VERDE (el del veneno es (75,215,0)). */
async function recorte(pag, nombre, clip) {
  const ruta = `${VISTAS}/${nombre}.png`;
  await pag.screenshot({ path: ruta, clip });
  const img = leerPng(ruta);
  let verdes = 0, suma = 0;
  for (let i = 0; i < img.ancho * img.alto; i++) {
    const [r, g, b] = [img.rgba[i * 4], img.rgba[i * 4 + 1], img.rgba[i * 4 + 2]];
    if (g >= r + 50 && g >= b + 50) verdes++;
    suma += r + g + b;
  }
  return { verdes, medio: suma / (img.ancho * img.alto * 3), ruta, rgba: img.rgba, n: img.ancho * img.alto };
}
/** La diferencia media por canal entre dos recortes del mismo tamaño. */
const diferencia = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.rgba.length; i++) if (i % 4 !== 3) s += Math.abs(a.rgba[i] - b.rgba[i]);
  return s / (a.n * 3);
};

/**
 * Los errores de la página, los dos caminos. `pageerror` NO salta con un
 * módulo que no compila: la primera pasada de esta sonda se quedó 240 s
 * esperando a `probe.ready` con un `SyntaxError` en `src/render/otros.js` y
 * el control «ni un error de página» en VERDE. Ese error sale por la consola.
 */
const vigilar = (pag, quien) => {
  pag.on("pageerror", (e) => errores.push(`${quien}: ${String(e).slice(0, 200)}`));
  pag.on("console", (m) => {
    if (m.type() === "error" && /SyntaxError|Failed to fetch dynamically imported module|does not provide an export/.test(m.text())) {
      errores.push(`${quien} (consola): ${m.text().slice(0, 200)}`);
    }
  });
};

const parar = (pag) => pag.addInitScript(() => {
  // El árbol es compartido: sin esto el recargado en caliente de Vite tira la
  // partida a media medida. Con las constantes (doc/EFECTOS_RED_93.md §3).
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

await esperarHttp(`http://localhost:${PUERTO_WEB}/`, { tope: 90_000, proceso: dev, quien: "vite" });   // el 98: en vez de dormir
const nav = await chromium.launch();
try {
  // ════ A. UN JUGADOR: `hud.addimgicon` ═════════════════════════════════
  {
    const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
    vigilar(pag, "A");
    await parar(pag);
    await entrarPorElMenu(pag, PUERTO_WEB, { mapa: MAPA });
    await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
    await pag.waitForTimeout(2500);
    const mapa = await pag.evaluate(() => window.probe.vgui2.mapaDeLaPartida());
    control("A. se ha entrado a sala88 por el menú", mapa === MAPA, String(mapa));
    // El rectángulo de `bepilepsy1 … 15 20 75 60` en 1200×800: (180,160) y 900×480.
    const CLIP = { x: 180, y: 160, width: 900, height: 480 };
    const p0 = await recorte(pag, "a_antes", CLIP);
    const e0 = await pantalla(pag);
    control("A. ANTES: ninguna imagen en la capa de mensajes", (e0?.imagenes?.length ?? -1) === 0, JSON.stringify(e0?.imagenes));

    // `ext_hud_icon <icono> <nombre> <x%> <y%> <ancho%> <alto%> <duración>` — player/externals.script:2911-2913.
    const llamado = await pag.evaluate(() => window.probe.jugador.llamar("ext_hud_icon", ["bepilepsy1", "bepilepsy1", "15", "20", "75", "60", "4.0"]));
    await pag.waitForTimeout(700);
    const e1 = await pantalla(pag);
    const im = e1?.imagenes?.find((x) => x.nombre === "bepilepsy1");
    control("A. DOM: la imagen «bepilepsy1» en (180,160) y 900×480 —porcentajes de la pantalla, vgui_status.h:293-302—, con su PNG de 512×256 cargado",
      llamado && im && im.x === 180 && im.y === 160 && im.ancho === 900 && im.alto === 480 && im.cargada && !im.falta &&
      im.natural?.[0] === 512 && im.natural?.[1] === 256,
      JSON.stringify(im ?? e1?.imagenes));
    const p1 = await recorte(pag, "a_con_imagen", CLIP);
    const d1 = diferencia(p0, p1);
    control("A. PÍXELES: el rectángulo cambia (diferencia media por canal > 25)", d1 > 25, `diferencia ${d1.toFixed(1)}`);
    const nsp = await pag.evaluate(() => window.probe.jugador.noSoportados());
    control("A. el guion del jugador no ha apuntado ningún `imgicon`", !nsp.some((x) => /imgicon/.test(x)), nsp.filter((x) => /hud|imgicon/.test(x)).join(" · ") || "ninguno");
    await pag.waitForTimeout(4200);
    const e2 = await pantalla(pag);
    const p2 = await recorte(pag, "a_despues", CLIP);
    const d2 = diferencia(p0, p2);
    control("A. a los 4 s se va, del DOM y de los píxeles (vuelve a parecerse al ANTES)",
      !(e2?.imagenes ?? []).length && d2 < d1 / 3, `imágenes ${JSON.stringify(e2?.imagenes)}, diferencia con el antes ${d2.toFixed(1)}`);
    await pag.close();
  }

  // ════ B. DOS JUGADORES: el brillo de Ana en la pantalla de Beto ════════
  partida = spawn(process.execPath, [
    "tools/servidor.mjs", "--puerto", String(PUERTO_PARTIDA), "--nombre", "La sonda 95e",
    "--personajes", PERSONAJES, "--mapa", MAPA,
    "--nacer", "17.3,0.1,0",
    "--params", `${RATA}=add_dot_poison`,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  partida.stdout.on("data", (b) => salida.push(String(b)));
  partida.stderr.on("data", (b) => salida.push(`ERR ${b}`));
  await esperarHttp(`http://localhost:${PUERTO_PARTIDA}/partidas`, { tope: 90_000, proceso: partida, quien: "el servidor de partida" });   // el 98
  const costura = async () => (await fetch(`http://localhost:${PUERTO_PARTIDA}/costura`)).json();
  const laRata = (c) => c?.bichos?.find((b) => b.script === RATA) ?? null;

  const abrir = async (quien) => {
    const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
    vigilar(pag, quien);
    await parar(pag);
    await entrarPorElMenu(pag, PUERTO_WEB, { mapa: MAPA, extra: `red=ws://localhost:${PUERTO_PARTIDA}/juego` });
    await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
    return pag;
  };
  const ana = await abrir("ana");
  const beto = await abrir("beto");
  await ana.evaluate(() => window.probe.sesion.nuevo("Ana", "swords_rsword"));
  await esperar(800);
  await beto.evaluate(() => window.probe.sesion.nuevo("Beto", "swords_rsword"));
  await esperar(2500);
  const yo = (pag) => pag.evaluate(() => window.probe.red.estado()?.yo ?? null);
  const [yoAna, yoBeto] = [await yo(ana), await yo(beto)];
  const c0 = await costura();
  control("B. los dos han entrado por el menú, con personaje, y la rata trae el veneno del operador",
    c0.clientes.filter((x) => x.personaje).length === 2 && laRata(c0)?.veneno === "1",
    `${JSON.stringify(c0.clientes)}, veneno ${laRata(c0)?.veneno}`);

  /** La figura de `id` en la pantalla de `pag`, leída de la malla. */
  const figura = (pag, id) => pag.evaluate((i) => window.probe.red.otros().find((f) => f.id === i) ?? null, id);
  /**
   * Mira a la figura `id` y devuelve el recorte de alrededor: el centro es
   * los pies más 0,9 m, y la ventana mide lo que mide un cuerpo a esa
   * distancia (con un mínimo), recortada a la pantalla.
   */
  const verA = async (pag, id, nombre) => {
    const f = await figura(pag, id);
    if (!f) return null;
    const [x, y, z] = f.pies;
    const p = await pag.evaluate((q) => {
      window.probe.mundo.mirar(q[0], q[1] + 0.9, q[2]);      // TRES números (el 78)
      return null;
    }, [x, y, z]);
    void p;
    await esperar(150);                                         // un fotograma con la vista nueva
    const s = await pag.evaluate((q) => window.probe.mundo.puntoEnPantalla([q[0], q[1] + 0.9, q[2]]), [x, y, z]);
    if (!s?.dentro) return { s, f };
    const media = Math.max(40, Math.min(300, Math.round(500 / Math.max(0.5, s.distancia))));
    const x0 = Math.max(0, s.x - media / 2), y0 = Math.max(0, s.y - media);
    const clip = { x: x0, y: y0, width: Math.min(1200 - x0, media), height: Math.min(800 - y0, media * 2) };
    return { s, f, clip, r: await recorte(pag, nombre, clip) };
  };

  // ANTES: Beto mira a Ana, que todavía no está envenenada.
  const antes = await verA(beto, yoAna, "b_beto_ve_a_ana_antes");
  control("B. ANTES: la figura de Ana en Beto no tiene cáscara visible y alrededor de ella no hay verde",
    antes?.clip && !(antes.f?.cascara?.visible) && antes.r.verdes < 30,
    `cascara ${JSON.stringify(antes?.f?.cascara)}, verdes ${antes?.r?.verdes}, ${JSON.stringify(antes?.s)}`);

  // Ana anda hasta la rata y le pega (el camino del 92: el cuerpo lo mueve el servidor).
  const mirarLaRata = (pag) => pag.evaluate((g) => {
    const r = window.probe.ia.bicho(g);
    if (!r) return null;
    window.probe.mundo.mirar(r.donde[0], r.donde[1] + 0.2, r.donde[2]);
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
  // Hasta que la FOTO de Ana, en el navegador de Beto, traiga el brillo.
  let conBrillo = null;
  for (let t = 0; t < 30000 && !conBrillo; t += 250) {
    await mirarLaRata(ana);
    await esperar(250);
    const f = await figura(beto, yoAna);
    if (f?.brilloDeLaFoto) conBrillo = f;
  }
  control("B. la foto de Ana llega a Beto con el brillo del veneno: `{fx 19, (75,215,0)}`",
    conBrillo?.brilloDeLaFoto?.fx === 19 && JSON.stringify(conBrillo.brilloDeLaFoto.color) === "[75,215,0]",
    JSON.stringify(conBrillo?.brilloDeLaFoto));
  const durante = await verA(beto, yoAna, "b_beto_ve_a_ana_durante");
  const k = durante?.f?.cascara;
  control("B. MALLA: la figura de Ana en Beto lleva su cáscara visible, aditiva, del color del veneno y con el MISMO esqueleto",
    k?.visible && k.enEscena && k.aditiva && k.mismoEsqueleto &&
    Math.abs(k.color[0] - 75 / 255) < 0.01 && Math.abs(k.color[1] - 215 / 255) < 0.01 && k.color[2] === 0 &&
    k.separacion >= 1 / 128 && k.separacion <= 72 / 128,
    JSON.stringify(k));
  control("B. PÍXELES de Beto: alrededor de Ana hay verde, y mucho más que antes",
    durante?.r && durante.r.verdes > 150 && durante.r.verdes > (antes?.r?.verdes ?? 0) * 4 + 100,
    `verdes ${durante?.r?.verdes} (antes ${antes?.r?.verdes}), ${durante?.r?.ruta}`);

  // CONTROL NEGATIVO, el mismo instante: Ana mira a Beto.
  const anaVeABeto = await verA(ana, yoBeto, "b_ana_ve_a_beto");
  control("B. CONTROL NEGATIVO: en la pantalla de Ana, Beto no brilla (ni en la foto, ni en la malla, ni en los píxeles)",
    anaVeABeto?.f && !anaVeABeto.f.brilloDeLaFoto && !(anaVeABeto.f.cascara?.visible) && (anaVeABeto.r?.verdes ?? 0) < 30,
    `foto ${JSON.stringify(anaVeABeto?.f?.brilloDeLaFoto)}, cascara ${JSON.stringify(anaVeABeto?.f?.cascara)}, verdes ${anaVeABeto?.r?.verdes}`);
  // Y Ana no tiene figura propia en su pantalla: en primera persona no se dibuja (cl_parse.c:323-331).
  const propia = await figura(ana, yoAna);
  control("B. Ana no se ve a sí misma: no hay figura suya en su pantalla", propia === null, JSON.stringify(propia));

  // AL ACABAR: el brillo se apaga de golpe cuando acaba el efecto.
  let sinBrillo = null;
  for (let t = 0; t < 40000 && !sinBrillo; t += 500) {
    await esperar(500);
    const f = await figura(beto, yoAna);
    if (f && !f.brilloDeLaFoto) sinBrillo = f;
  }
  const despues = sinBrillo ? await verA(beto, yoAna, "b_beto_ve_a_ana_despues") : null;
  control("B. AL ACABAR el veneno: la foto llega sin brillo, la cáscara se oculta y el verde se va",
    sinBrillo && !(despues?.f?.cascara?.visible) && despues?.r && despues.r.verdes < Math.max(30, (durante?.r?.verdes ?? 0) / 5),
    `cascara ${JSON.stringify(despues?.f?.cascara)}, verdes ${despues?.r?.verdes} (durante ${durante?.r?.verdes})`);

  const c3 = await costura();
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
