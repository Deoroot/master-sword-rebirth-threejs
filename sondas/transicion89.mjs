// LAS TRANSICIONES ENTRE MAPAS — experimento 89.
//
//   npm run sonda:transicion89
//
// Entra por el MENÚ (CLAUDE.md §3), crea un personaje y hace el viaje de verdad:
// Edana → cloacas → Edana, más el intento a Thornlands, que no está portado.
//
// ── LA REFERENCIA SON DOS CAPTURAS DEL JUEGO ORIGINAL ───────────────────────
//
// El usuario las mandó al desmentir que este viaje estuviera roto en el juego:
//
//   1. en la puerta de la cloaca de Edana, arriba a la izquierda:
//        «Travel to next area (edanasewers)»
//        «This leads to The Edana Sewers. Press (enter) to continue.»
//   2. ya en las cloacas, junto a la escalera de vuelta:
//        «Travel to next area (edana)»
//        «This leads to Edana. Press (enter) to continue.»
//
// Así que lo que se mide es ESO, leído del DOM, y no un estado de la regla.
//
// ── LOS DOS CASOS DE LLEGADA, que hacen falta los dos ──────────────────────
//
// Edana → cloacas llega al INICIO de las cloacas (`JN_STARTMAP`: no hay ninguna
// llegada `sewer_start`). Cloacas → Edana llega a una de las cinco llegadas con
// NOMBRE `sewer_entrance`. Con sólo el primero no se distinguiría «busca por
// nombre» de «cae siempre en el inicio» — el caso único del 50. Por eso la
// vuelta pide además estar LEJOS del inicio de Edana, que es el templo.

import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PORT = 5289;
const liberados = liberarPuerto(PORT);
const dev = await arrancarVite(PORT);   // el 98: espera a que conteste
// SÍNCRONO, y no es un capricho: esta sonda termina con `process.exit`, y un
// `taskkill` lanzado con `spawn` no llega a correr antes de salir. Así dejó su
// vite huérfano en el 5289 dos veces, con el usuario pidiendo expresamente que
// no queden sondas colgadas. Por PID y con su árbol, nunca por nombre.
const matar = (p) => { try { spawnSync("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch { /* ya no está */ } };

// El marcador se declara antes de empezar (el 65): lo que no llegue a correr
// cuenta como rojo.
const PREVISTOS = 20;
const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien: Boolean(bien), detalle });

let nav = null;
try {
  nav = await chromium.launch();
  const pag = await nav.newPage({ viewport: { width: 1280, height: 720 } });
  // El HMR de vite se corta por subprotocolo (receta de sondas/sidra81.mjs): con
  // varias sesiones guardando, una recarga a media pasada mide dos versiones.
  // `addInitScript` vale para TODAS las navegaciones, y aquí hay tres.
  await pag.addInitScript(() => {
    const Real = window.WebSocket;
    window.WebSocket = function (url, protos) {
      const esHmr = protos === "vite-hmr" || (Array.isArray(protos) && protos.includes("vite-hmr"));
      if (!esHmr) return new Real(url, protos);
      return { close() {}, send() {}, addEventListener() {}, removeEventListener() {}, readyState: 3 };
    };
  });
  const errores = [];
  pag.on("pageerror", (e) => errores.push(String(e)));
  for (let i = 0; i < 60; i++) {
    try { const r = await pag.goto(`http://localhost:${PORT}/`, { timeout: 2000 }); if (r) break; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }

  const listo = () => pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
  const fotogramas = (n) => pag.evaluate(async (n) => { for (let i = 0; i < n; i++) await window.probe.mundo.dibujado(); }, n);
  const pantalla = () => pag.evaluate(() => window.probe.muerte.pantalla());
  const ventanas = async () => ((await pantalla())?.ventanas ?? []).map((v) => `${v.titulo ?? ""} | ${v.texto ?? ""}`);
  const consola = () => pag.evaluate(() => window.probe.hud.estado().consola.lineas);
  const donde = () => pag.evaluate(() => ({
    mapa: window.probe.level.name,
    pies: [...window.probe.player.feet],
    nombre: window.probe.sesion?.personaje?.nombre ?? null,
  }));
  // Plantarse DENTRO de una transición: el centro de su caja, un poco alto, y
  // que caiga. `poner` no resuelve choques (el 69), así que se le deja asentar.
  const pisar = async (nombre) => {
    const r = await pag.evaluate((nombre) => {
      const z = window.probe.level.manifiesto.interactivas.zonas
        .find((x) => x.clase === "msarea_transition" && x.nombre === nombre);
      if (!z) return null;
      const c = [0, 1, 2].map((k) => (z.caja.min[k] + z.caja.max[k]) / 2);
      window.probe.mundo.poner(c[0], c[1], c[2]);
      return { caja: z.caja, centro: c };
    }, nombre);
    await fotogramas(40);
    return r;
  };
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  // ── 1. EDANA, POR EL MENÚ, CON UN PERSONAJE ────────────────────────────
  await entrarPorElMenu(pag, PORT, { mapa: "edana" });
  await listo();
  await pag.evaluate(() => window.probe.sesion.nuevo("Viajero"));
  await fotogramas(20);
  const enEdana = await donde();
  control("se entra a Edana por el menú", enEdana.mapa === "edana", enEdana.mapa);

  // EL NEGATIVO PRIMERO: en el sitio de nacer no hay ninguna ventana de viaje.
  // Sin él, la de abajo la cumpliría una ventana que estuviera siempre puesta.
  const alNacer = await ventanas();
  control("al nacer NO hay ventana de viaje", !alNacer.some((v) => /Travel to next area/.test(v)), alNacer.join(" / ") || "(ninguna)");

  // LA PRESENTACIÓN DEL MAPA SALE UNA VEZ. Es la guarda del arreglo del
  // `infomsg` del jugador: la pinta `src/play/intro.js`, y si el guion la
  // pintara además, saldría dos veces. Se ESPERA a que salga (llega a los 10 s)
  // antes de contar: contar antes daría un cero que no mide nada.
  await pag.waitForFunction(() => (window.probe.muerte.pantalla()?.ventanas ?? [])
    .some((v) => v.titulo === "The Village of Edana"), null, { timeout: 20000 }).catch(() => {});
  await pag.waitForTimeout(3000);
  const presentaciones = (await ventanas()).filter((v) => v.startsWith("The Village of Edana |")).length;
  control("la presentación del mapa sale exactamente UNA vez", presentaciones === 1, `${presentaciones}`);

  // ── 2. LA PUERTA DE LA CLOACA: tu primera captura ──────────────────────
  const puerta = await pisar("sewer_entrance");
  const vPuerta = await ventanas();
  control("en la puerta de la cloaca: «Travel to next area (edanasewers)»",
    vPuerta.some((v) => v.startsWith("Travel to next area (edanasewers) |")), vPuerta.join(" / ") || `(ninguna; caja ${JSON.stringify(puerta?.caja)})`);
  control("y «This leads to The Edana Sewers. Press (enter) to continue.»",
    vPuerta.some((v) => v.endsWith("| This leads to The Edana Sewers. Press (enter) to continue.")), vPuerta.join(" / "));

  // ── 3. ENTER, y el viaje ───────────────────────────────────────────────
  const t0 = Date.now();
  await pag.keyboard.press("Enter");
  await fotogramas(5);
  const vViaje = await ventanas();
  const cViaje = (await pantalla())?.centrado;
  control("Enter: «TRAVELING TO edanasewers» / «You will be reconnected shortly.»",
    vViaje.includes("TRAVELING TO edanasewers | You will be reconnected shortly."), vViaje.join(" / "));
  control("y en el centro «Traveling to The Edana Sewers»",
    cViaje?.visible && cViaje.texto === "Traveling to The Edana Sewers", JSON.stringify(cViaje));

  await pag.waitForURL(/map=edanasewers/, { timeout: 20000 });
  const tardo = (Date.now() - t0) / 1000;
  // Los 5 s de `callevent 5.0 delay_changelevel`. Por debajo, no se esperó; muy
  // por encima, algo más lo retrasa. La horquilla es ancha por arriba porque
  // incluye la latencia de la sonda, que sólo suma.
  control("el cambio de nivel llega a los 5 s (map_transitions:73)", tardo >= 4.5 && tardo < 9, `${tardo.toFixed(1)} s`);
  await listo();
  await fotogramas(30);

  // ── 4. EN LAS CLOACAS: tu segunda captura ──────────────────────────────
  const enCloacas = await donde();
  const cloacas = await pag.evaluate(() => ({
    entrada: window.probe.level.manifiesto.entrada.pies,
    sesion: { nombre: window.probe.sesion.personaje?.nombre ?? null },
    panel: window.probe.vgui?.abierto?.() ?? null,
  }));
  control("se llega a las cloacas", enCloacas.mapa === "edanasewers", enCloacas.mapa);
  control("con EL MISMO personaje y sin pasar por la lista",
    cloacas.sesion.nombre === "Viajero" && !/newchar/.test(JSON.stringify(cloacas.panel ?? "")),
    `${cloacas.sesion.nombre}, panel ${JSON.stringify(cloacas.panel)}`);
  const aInicio = dist(enCloacas.pies, cloacas.entrada);
  control("al INICIO de las cloacas (JN_STARTMAP: no hay llegada `sewer_start`)", aInicio < 1.5, `${aInicio.toFixed(2)} m del ms_player_begin`);

  await pisar("sewer_start");
  const vEscalera = await ventanas();
  control("junto a la escalera: «Travel to next area (edana)»",
    vEscalera.some((v) => v.startsWith("Travel to next area (edana) |")), vEscalera.join(" / ") || "(ninguna)");
  control("y «This leads to Edana. Press (enter) to continue.»",
    vEscalera.some((v) => v.endsWith("| This leads to Edana. Press (enter) to continue.")), vEscalera.join(" / "));

  // ── 5. LA VUELTA, que llega POR NOMBRE ─────────────────────────────────
  await pag.keyboard.press("Enter");
  await pag.waitForURL(/map=edana(&|$)/, { timeout: 20000 });
  await listo();
  await fotogramas(30);
  const deVuelta = await donde();
  const edana = await pag.evaluate(() => ({
    llegadas: window.probe.level.manifiesto.llegadas.filter((l) => l.nombre === "sewer_entrance").map((l) => l.pies),
    inicio: window.probe.level.manifiesto.entrada.pies,
  }));
  const aLlegada = Math.min(...edana.llegadas.map((p) => dist(deVuelta.pies, p)));
  const aTemplo = dist(deVuelta.pies, edana.inicio);
  control("de vuelta en Edana", deVuelta.mapa === "edana", deVuelta.mapa);
  control("en una de las cinco llegadas `sewer_entrance`", aLlegada < 1.5, `${aLlegada.toFixed(2)} m de la más cercana`);
  control("y NO en el inicio del templo: la búsqueda por nombre no es el respaldo", aTemplo > 10, `${aTemplo.toFixed(1)} m del inicio`);

  // ── 6. THORNLANDS, que no está en este «servidor» ──────────────────────
  await pisar("a3trans");
  await pag.keyboard.press("Enter");
  await fotogramas(5);
  // LA CONSOLA PARTE LAS LÍNEAS LARGAS (el 81): «…a future transition» y
  // «point?» llegan en dos entradas. Así que la frase se busca en el BLOQUE de
  // líneas verdes juntas, y el color se comprueba aparte, en la que empieza.
  const lineas = await consola();
  const verdes = lineas.filter((l) => l.tipo === "bueno").map((l) => l.texto.trim()).join(" ");
  const empieza = lineas.find((l) => l.texto.startsWith("thornlands does not exist"));
  control("Thornlands: «thornlands does not exist on this server. Perhaps this is a future transition point?», en verde",
    verdes.includes("thornlands does not exist on this server. Perhaps this is a future transition point?") && empieza?.tipo === "bueno",
    `${empieza?.tipo ?? "-"} · ${verdes.slice(0, 120)}`);
  const cThorn = (await pantalla())?.centrado;
  control("y el «Traveling to The Thornlands» del C++ igual (msmapents.cpp:1833)",
    cThorn?.texto === "Traveling to The Thornlands", JSON.stringify(cThorn));
  // Y NO se va a ningún sitio: siete segundos, más que los cinco del viaje.
  await pag.waitForTimeout(7000);
  const quieto = await donde();
  control("y no se viaja: siete segundos después sigue en Edana", quieto.mapa === "edana" && /map=edana(&|$)/.test(pag.url()),
    `${quieto.mapa} · ${pag.url().replace(/^.*\?/, "?")}`);

  control("ningún error de página", errores.length === 0, errores.slice(0, 2).join(" | "));
} catch (e) {
  control("la sonda llegó al final", false, `se cayó: ${e.message.split("\n")[0]}`);
} finally {
  if (nav) { try { await nav.close(); } catch { /* ya estaba cerrado */ } }
  matar(dev);
}

console.log(`\nLAS TRANSICIONES — experimento 89`);
if (liberados) console.log(`  (puerto ${PORT} liberado antes de empezar)`);
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(84)} ${c.detalle}`);
// El denominador es el DECLARADO (el 65): lo que no corrió cuenta como rojo, y
// la caída es una roja más, no una nota. (La primera versión restaba la caída
// dos veces y llegó a decir «−1 de 17».)
const corrieron = controles.filter((c) => c.que !== "la sonda llegó al final");
const faltan = PREVISTOS - corrieron.length;
if (faltan > 0) console.log(`  MAL  ${faltan} control(es) no llegaron a correr`);
const verdes = corrieron.filter((c) => c.bien).length;
console.log(`\n  ${verdes} de ${PREVISTOS} en verde`);
process.exit(verdes === PREVISTOS && corrieron.length === controles.length ? 0 : 1);
