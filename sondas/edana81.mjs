// QUE UN VECINO SE GIRE AL HABLARLE — experimento 81, `setmovedest`.
//
//   npm run sonda:edana81
//
// El gancho `irA` de `entornoDe` era un `=> {}` **desde el experimento 43**: el
// sitio del apartado 4 de CLAUDE.md donde una regla vive sin correr, el mismo en
// el que estuvo `llamarExterno` hasta el 66. Cuatro pruebas verdes desde el 43,
// y **ningún NPC de este puerto se había movido nunca por su guion**.
//
// ── QUÉ SE MIDE, Y POR QUÉ ESTO Y NO UN VIAJE ─────────────────────────────
//
// Porque el censo dice que lo que `setmovedest` hace en Edana casi nunca es
// andar. De sus **130 `setmovedest`, 65 llevan proximidad 9999 o 999** — la
// mitad justa—, y 9999 es más que cualquier distancia del mapa, así que
// `SetMoveDest` entra en su rama de «¿ya está cerca?» en el PRIMER think:
//
//     if ((IsFlying() ? Length() : Length2D()) <= m_MoveDest.Proximity) {
//         pev->angles.y = ExactAngle.y;     // <- le pone el rumbo EXACTO
//         StopWalking();
//         CallScriptEvent("game_reached_dest");
//                                           msmonsterserver.cpp:1018-1029
//
// O sea que `setmovedest <quien> 9999` **no es «anda hasta él»: es «gírate a
// mirarlo y párate»**, y es con lo que un vecino de Edana se vuelve hacia ti
// cuando le hablas. Eso es lo que esta sonda mide, porque es lo que el jugador
// ve y es la mitad del comando.
//
// La cadena entera, que cruza el trabajo de dos sesiones:
//
//     hablas  ->  el NPC te oye (el 79)  ->  `chat_face_speaker`
//             ->  `setmovedest CHAT_CURRENT_SPEAKER 9999`  (su guion)
//             ->  `irA`  ->  `ganchoDeMovedest`  ->  `Manada.mandarA`
//             ->  `pasoMandado` ve que ya está cerca  ->  gira y avisa
//
// ── LAS FORMAS DE QUE ESTO PAREZCA FUNCIONAR Y ESTÉ MAL ───────────────────
//
//   - **«se ha girado» cuando se estaba girando solo.** Un vecino de Edana
//     pasea y parlotea. Así que no se mide «el rumbo ha cambiado»: se mide que
//     el rumbo final APUNTA AL JUGADOR, y se compara con el error del rumbo de
//     antes. Es la lección del 71 —una prueba sobre una diferencia tiene que
//     poner los números donde la diferencia existe— y la del 76.
//   - **«apunta al jugador» por casualidad.** Un rumbo al azar acierta un
//     sector de ±15° una vez de cada doce. Va con un NPC de control al que no
//     se le habla, en la misma pasada y con el mismo jugador delante.
//   - **el cero sin control positivo.** Si no se gira nadie, hace falta saber
//     que esta sonda habría visto un giro: el control positivo es el propio
//     `mandado`/`ultimoDestino`, que antes de hablar tiene que estar a `null`.
//
// Y el cierre va en un `finally`: navegador y servidor, aunque la pasada se
// vaya por el `catch` (la lección del 65, y el barrido de sondas huérfanas).

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PORT = 5281;
const liberados = liberarPuerto(PORT);
if (liberados) console.log(`  (puerto ${PORT} liberado: ${liberados})`);
const dev = await arrancarVite(PORT);
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));

// ── SE CORTA EL HMR DE VITE, Y NO ES COMODIDAD ─────────────────────────────
//
// Con varias sesiones guardando a la vez, vite recarga la página a mitad de
// pasada y se lleva `window.probe` por delante: el síntoma es un `TypeError`
// leyendo `vgui` de `undefined`, o controles rojos sin motivo. Y lo de fondo es
// peor que la molestia: **una sonda cuya página se recarga a mitad está midiendo
// dos versiones del código**, así que lo que salga no vale ni verde ni rojo.
//
// Se reconoce por el subprotocolo, así que el WebSocket del multijugador pasa
// igual. (Diagnóstico de la otra sesión, comprobado antes de copiarlo.)
await pag.addInitScript(() => {
  const Real = window.WebSocket;
  window.WebSocket = function (url, protos) {
    const esHmr = protos === "vite-hmr" || (Array.isArray(protos) && protos.includes("vite-hmr"));
    if (!esHmr) return new Real(url, protos);
    return { close() {}, send() {}, addEventListener() {}, removeEventListener() {}, readyState: 3 };
  };
});

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });
/** Un control que hoy no se puede medir NO se cuenta entre los verdes (el 50). */
const pendiente = (que, porQue) => controles.push({ que, bien: null, detalle: porQue });

/** El rumbo, en grados [0,360), del que está en `a` hacia `b`. Ejes de la escena. */
const rumboHacia = (a, b) => {
  const g = (Math.atan2(-(b[2] - a[2]), b[0] - a[0]) * 180) / Math.PI;
  return ((g % 360) + 360) % 360;
};
/**
 * Cuánto se separan dos rumbos, por el lado corto, en [0, 180].
 *
 * Esto nació mal y dio una pasada en rojo con el juego BIEN: llevaba un
 * `180 - abs(...)` de más, así que **dos rumbos iguales daban 180°** y el
 * informe decía «se separa 180°» justo debajo de dos noventas idénticos. Lo
 * delató que los dos números impresos coincidían y el resultado no.
 */
const separacion = (a, b) => Math.abs(((a - b) % 360 + 540) % 360 - 180);

/**
 * Plantar al jugador delante de alguien hasta que EL JUEGO diga que le ve.
 *
 * Copiado del 79 y por su misma razón: `aQuien` usa el mismo cono y la misma
 * traza que la espada, así que estar a un metro no basta — puede haber una
 * esquina en medio. Si ninguno de los seis sitios vale, se dice, porque un «no
 * le ve» callado convertiría todo lo de abajo en verdes vacíos.
 */
async function plantarseDelante(id, { lejosDelRumbo = null } = {}) {
  let sitios = [[0, -1.0], [0, 1.0], [-1.0, 0], [1.0, 0], [0, -1.6], [1.6, 0],
    [-1.0, -1.0], [1.0, 1.0], [-1.0, 1.0], [1.0, -1.0]];
  // ── SE EMPIEZA POR DONDE EL VECINO NO ESTÁ MIRANDO — y esto costó una roja.
  //
  // El primer sitio de la lista, `[0, -1]`, le cayó a Sembelbin **exactamente en
  // la dirección a la que ya miraba**: su rumbo era 90° de lejos y 90° al
  // llegar, y el control «se gira hacia el jugador» salió verde-vacío primero y
  // rojo después, con el arreglo funcionando las dos veces. No había girado
  // nada porque no le hacía falta.
  //
  // Es el 70 al pie de la letra: un control positivo no sólo dice que el
  // instrumento ve, también dice dónde estaba apuntando mal. Así que los sitios
  // se ordenan por cuánto se separan del rumbo que el vecino lleva, de más a
  // menos: el jugador se planta donde el giro TIENE que ocurrir para verse.
  if (lejosDelRumbo !== null) {
    sitios = [...sitios].sort((a, b) =>
      separacion(rumboHacia([0, 0, 0], [b[0], 0, b[1]]), lejosDelRumbo)
      - separacion(rumboHacia([0, 0, 0], [a[0], 0, a[1]]), lejosDelRumbo));
  }
  for (const [dx, dz] of sitios) {
    const q = await pag.evaluate((i) => {
      const n = window.probe.vgui.npcs().find((x) => x.id === i);
      return n ? n.donde : null;
    }, id);
    if (!q) return null;
    await pag.evaluate((a) => {
      window.probe.mundo.poner(a.q[0] + a.dx, a.q[1], a.q[2] + a.dz);
      // TRES NÚMEROS. Con un array dentro el `yaw` es `NaN` y el cuerpo deja de
      // simularse — el fallo que el 78 encontró heredado del 77.
      window.probe.mundo.mirar(a.q[0], a.q[1] + 0.9, a.q[2]);
    }, { q, dx, dz });
    await pag.waitForTimeout(800);
    const d = await pag.evaluate(() => {
      const x = window.probe.vgui.delante();
      return x ? { id: x.id ?? null, nombre: x.nombre ?? null } : null;
    });
    if (d && d.id === id) return { ...d, dx, dz };
  }
  return null;
}

try {

// ── 0. EL CENSO, antes de abrir el navegador ───────────────────────────────
//
// El reparto de formas se CUENTA del horneado, no se copia de un comentario
// (apartado 5). Y es el que justifica que esta sonda mida un giro.
const G = JSON.parse(readFileSync("build/edana/guiones.json", "utf8")).guiones ?? {};
const rec = (cs, f) => { for (const c of cs ?? []) { f(c); rec(c.hijos, f); rec(c.sino, f); } };
const c = { total: 0, girar: 0, huir: 0, none: 0, punto: 0, usan: 0, de: 0 };
for (const g of Object.values(G)) {
  c.de++; let suyo = 0;
  for (const e of g.eventos ?? []) rec(e.cmds, (cmd) => {
    if (String(cmd.nombre).toLowerCase() !== "setmovedest") return;
    const p = cmd.params ?? []; c.total++; suyo++;
    if (String(p[0]).toLowerCase() === "none") { c.none++; return; }
    if (p.length < 2) return;
    if (String(p[0]).startsWith("(")) c.punto++;
    if (p.slice(2).some((x) => String(x).toLowerCase().includes("flee"))) c.huir++;
    if (["999", "9999"].includes(String(p[1]))) c.girar++;
  });
  if (suyo) c.usan++;
}
console.log(`\n  QUÉ HACE \`setmovedest\` EN EDANA, CONTADO DEL HORNEADO
    \`setmovedest\`      ${c.total}   en ${c.usan} de los ${c.de} guiones del mapa
    con 9999 o 999    ${c.girar}   <- NO andan: GIRAN y se paran
    con \`flee\`         ${c.huir}
    \`none\`             ${c.none}
    con \`(x y z)\`      ${c.punto}   <- ningún caso en ningún mapa horneado`);

control("`setmovedest` no es un comando de adorno en Edana: lo usan casi todos",
  c.total > 100 && c.usan >= c.de - 2, `${c.total} en ${c.usan} de ${c.de}`);
control("y la mitad justa es para GIRAR, que es lo que esta sonda mide",
  c.girar / c.total >= 0.45, `${c.girar} de ${c.total}`);
pendiente("la rama `(x y z)` de `setmovedest`",
  `cero casos en los mapas horneados: el cambio de ejes se mide en Node (test/movedest81.test.mjs) y no en una partida`);

// ── 1. SE ENTRA POR EL MENÚ ────────────────────────────────────────────────
//
// «Si su camino no pasa por `menuselect`, no cuenta.»
await entrarPorElMenu(pag, PORT, { mapa: "edana" });
await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
await pag.waitForTimeout(2500);

const mapa = await pag.evaluate(() => window.probe.vgui2.mapaDeLaPartida());
control("se ha entrado a Edana por el menú", mapa === "edana", String(mapa));

// LOS TRES VECINOS QUE DE VERDAD LLAMAN A `chat_face_speaker` en Edana. Se
// eligen por su `targetname` del mapa —no por el nombre de pantalla, que el 79
// enseñó que puede resolver a quien no existe— y se dice cuál es cuál.
const QUIENES = ["priest", "urdauf", "sumdale"];
const estado = (n) => pag.evaluate((x) => window.probe.mundo.npc(x), n);

// EL `id` HAY QUE CRUZARLO, Y ESO COSTÓ UNA PASADA EN ROJO.
//
// `probe.mundo.npc(nombre)` NO devuelve `id` —da nombre, sitio, rumbo y el
// destino—, y `probe.vgui.npcs()` sí pero va por índice de lista y no conoce el
// `targetname`. Así que `plantarseDelante(e.id)` recibía `undefined` y no casaba
// con nadie nunca: la sonda decía «a ninguno de los tres» con el juego bien.
// Es el primo del 78 —una llamada con la aridad mal no da error, da `undefined`—
// y se arregla cruzando por POSICIÓN, que es exacta, y no por nombre: «Patron»
// hay más de uno en esa taberna.
const enPantalla = await pag.evaluate(() => window.probe.vgui.npcs());
const mismoSitio = (a, b) => a && b && [0, 1, 2].every((k) => Math.abs(a[k] - b[k]) < 1e-6);
const presentes = [];
for (const q of QUIENES) {
  const e = await estado(q);
  if (!e) continue;
  const v = enPantalla.find((x) => mismoSitio(x.donde, e.donde));
  presentes.push({ objetivo: q, id: v?.id ?? null, ...e });
}
const sinId = presentes.filter((p) => p.id === null).map((p) => p.objetivo);
control("y a los tres se les ha podido cruzar su `id` del juego",
  sinId.length === 0, sinId.join(", ") || "los tres");
console.log(`\n  LOS QUE LLAMAN A \`chat_face_speaker\``);
for (const p of presentes) console.log(`    ${p.objetivo.padEnd(10)} ${p.nombre}`);
control("los tres vecinos con `chat_face_speaker` están montados",
  presentes.length === QUIENES.length, `${presentes.length} de ${QUIENES.length}`);
if (!presentes.length) throw new Error("sin ellos no hay experimento");

// ── 2. EL CONTROL POSITIVO DEL INSTRUMENTO, ANTES DE HABLAR ────────────────
//
// Nadie les ha mandado a ningún sitio todavía. Si `mandado` ya estuviera
// puesto, el verde de abajo no diría nada: mediría el valor de reposo.
const antes = {};
for (const p of presentes) antes[p.objetivo] = await estado(p.objetivo);
const yaMandados = presentes.filter((p) => antes[p.objetivo].mandado);
control("antes de hablar, a NINGUNO le han mandado un destino",
  yaMandados.length === 0, yaMandados.map((p) => p.objetivo).join(", ") || "ninguno");

// ── 3. SE LES HABLA, Y SE MIRA SI SE GIRAN ─────────────────────────────────
//
// Se habla por donde habla el jugador: la opción `say` de su menú, que es lo
// que el 79 puso en marcha. Y se mide DESDE DÓNDE, porque el rumbo esperado
// depende de dónde esté el jugador.
// SE PRUEBAN LOS TRES y se mide con el primero al que se le pueda hablar, en vez
// de elegir uno a dedo. Los tres están dentro de un edificio —el templo y la
// taberna— y `aQuien` usa el cono y la traza de la espada, así que «estar al
// lado» no es «el juego le ve»: con uno solo, un mueble en medio habría dejado
// la sonda sin medir y pareciendo que el arreglo no sirve.
let elQueGira = null, sitio = null;
const nadaConQue = [];
for (const p of presentes) {
  // `lejosDelRumbo`: su rumbo de ahora, para plantarse donde NO mira. Ver el
  // comentario de `plantarseDelante`.
  const s = await plantarseDelante(p.id, { lejosDelRumbo: antes[p.objetivo].yaw });
  if (s) { elQueGira = p; sitio = s; break; }
  nadaConQue.push(p.objetivo);
}
control("se le puede hablar a alguno de los tres: el juego le ve delante",
  Boolean(sitio),
  sitio ? `${elQueGira.nombre} desde ${sitio.dx},${sitio.dz}`
    : `a ninguno (${nadaConQue.join(", ")}): todos dentro de un edificio`);
if (!sitio) throw new Error("no se le puede hablar a ninguno de los tres");

const pies = await pag.evaluate(() => window.probe.mundo.donde().pies);
const yaCerca = await estado(elQueGira.objetivo);
const esperado = rumboHacia(yaCerca.donde, pies);
// EL RUMBO DE ANTES ES EL DE LEJOS, Y ESO COSTÓ UNA PASADA EN ROJO.
//
// La primera versión leía su rumbo DESPUÉS de plantarse delante y lo comparaba
// con el de después de hablar, y los dos salían 90,0° con el arreglo
// funcionando: el jugador había acabado plantado justo en la dirección a la que
// el vecino ya miraba, así que no tenía nada que girar. Ver el comentario de
// `plantarseDelante`, que es donde se arregló.
//
// Lo que se compara es el rumbo de cuando el jugador estaba LEJOS (`antes`,
// leído al entrar) contra el de después, con el sitio del jugador de ahora en
// los dos casos. Y así se ve ADEMÁS cuándo gira, que no es lo que yo suponía:
// al llegarle sigue a 90° y **gira al hablarle**, no al acercarse.
const deLejos = antes[elQueGira.objetivo];
const sepDeLejos = separacion(deLejos.yaw, esperado);
console.log(`\n  ${elQueGira.nombre.toUpperCase()}
    el jugador está en   ${pies.map((x) => x.toFixed(2)).join(", ")}
    él está en           ${yaCerca.donde.map((x) => x.toFixed(2)).join(", ")}
    el rumbo AL JUGADOR  ${esperado.toFixed(1)}°
    su rumbo DE LEJOS    ${deLejos.yaw.toFixed(1)}°   (se separaba ${sepDeLejos.toFixed(1)}°)
    su rumbo AL LLEGAR   ${yaCerca.yaw.toFixed(1)}°   (se separa ${separacion(yaCerca.yaw, esperado).toFixed(1)}°)`);

// Se le habla, y SE PULSA CON EL RATÓN. No hay `probe.misiones.elegir(n)` a
// propósito —`src/dev/sonda.js:1052`—: la sonda tiene que recorrer el camino de
// `menuselect` como lo recorre una persona, que es la regla del 29 y la del
// apartado 3. Elegir por API mediría otro juego.
await pag.keyboard.press("KeyF");
await pag.waitForTimeout(800);
const panel = await pag.evaluate((id) => ({
  cual: window.probe.vgui.abierto(),
  botones: window.probe.vgui.botones(),
  opciones: window.probe.misiones.opcionesDe(id),
}), elQueGira.id);
const iSay = (panel.opciones ?? []).findIndex((o) => String(o.tipo).toLowerCase() === "say");
// Que el panel sea el SUYO sí es un control; que traiga una opción `say` no lo
// es, porque depende de qué vecino sea —Sembelbin es un sacerdote y sus cuatro
// opciones son otras—. Se dice cuáles trae y se pulsa la de hablar sólo si está.
console.log(`    su menú              ${(panel.opciones ?? []).map((o) => `${o.titulo} [${o.tipo}]`).join(" | ")}`);
control("se le abre SU panel de interacción", panel.cual === "interact", String(panel.cual));
if (iSay >= 0 && panel.botones[iSay]) {
  const b = panel.botones[iSay];
  await pag.mouse.click(b.centro, b.arriba + 8);
  await pag.waitForTimeout(2000);
}

const despues = await estado(elQueGira.objetivo);
const sepDespues = separacion(despues.yaw, rumboHacia(despues.donde, pies));
console.log(`    su rumbo TRAS HABLAR ${despues.yaw.toFixed(1)}°   (se separa ${sepDespues.toFixed(1)}°)
    \`mandado\`            ${despues.mandado ? `prox ${despues.mandado.proximidad}` : "null"}
    \`ultimoDestino\`      ${despues.ultimoDestino ? `prox ${despues.ultimoDestino.proximidad}` : "null"}
    llegadas             ${despues.llegadas}`);

// EL CONTROL QUE IMPORTA, y no es «el rumbo ha cambiado»: es que APUNTA AL
// JUGADOR, porque un vecino que pasea cambia de rumbo solo. Y va con su mitad
// negativa en el mismo `if`: de lejos NO le apuntaba. Sin esa mitad, un vecino
// que mirase de casualidad hacia donde el jugador va a plantarse daría verde.
control("AL HABLARLE SE GIRA HACIA EL JUGADOR, y de lejos no le miraba",
  sepDespues < 15 && sepDeLejos > 30,
  `de lejos se separaba ${sepDeLejos.toFixed(1)}°, ahora ${sepDespues.toFixed(1)}°`);
// Y la huella de que ha pasado por `setmovedest` y no por otra cosa: la copia
// del destino queda escrita con la proximidad del guion, que es 9999.
control("y la huella es de `setmovedest`: queda un destino con proximidad de las grandes",
  Boolean(despues.ultimoDestino) && despues.ultimoDestino.proximidad >= 999,
  despues.ultimoDestino ? `proximidad ${despues.ultimoDestino.proximidad}` : "no hay destino");
// `9999` llega en el primer think, o sea que NO anda: llega y se para.
control("no ha andado hasta él: con 9999 se llega en el primer paso y se para",
  despues.llegadas > 0 && !despues.mandado,
  `llegadas ${despues.llegadas}, mandado ${despues.mandado ? "puesto" : "soltado"}`);

// ── 4. EL CONTROL NEGATIVO: A QUIEN NO SE LE HABLA, NO SE GIRA ─────────────
//
// En la misma pasada y con el mismo jugador delante. Sin esto, el verde de
// arriba podría estar midiendo que los vecinos miran al jugador siempre.
const otros = presentes.filter((p) => p.objetivo !== elQueGira.objetivo);
const girados = [];
for (const o of otros) {
  const e = await estado(o.objetivo);
  const sep = separacion(e.yaw, rumboHacia(e.donde, pies));
  console.log(`    ${o.objetivo.padEnd(10)} se separa ${sep.toFixed(1)}° del jugador, mandado ${e.mandado ? "SÍ" : "no"}`);
  if (e.mandado || e.ultimoDestino) girados.push(o.objetivo);
}
control("a los que NO se les ha hablado no les han mandado ningún destino",
  girados.length === 0, girados.join(", ") || "ninguno");

// ── 5. QUE NADA SE HAYA ROTO POR EL CAMINO ─────────────────────────────────
control("ni un error de página en toda la pasada", errores.length === 0,
  errores.slice(0, 2).join(" | ") || "ninguno");

} catch (e) {
  // LA CAÍDA ES UNA ROJA Y NO UNA NOTA AL PIE — la lección del 65: un «X de Y»
  // donde Y se calcula al final no puede bajar nunca.
  control("LA SONDA HA LLEGADO AL FINAL", false, String(e).slice(0, 300));
} finally {
  const verdes = controles.filter((x) => x.bien === true).length;
  const rojas = controles.filter((x) => x.bien === false);
  const pend = controles.filter((x) => x.bien === null);
  console.log("\n  ──────────────────────────────────────────────");
  for (const x of controles) {
    const m = x.bien === null ? "PEND" : x.bien ? " ok " : "ROJA";
    console.log(`  [${m}] ${x.que}${x.detalle ? `  — ${x.detalle}` : ""}`);
  }
  console.log(`\n  ${verdes} de ${verdes + rojas.length} controles en verde`
    + `${pend.length ? `, y ${pend.length} declarado${pend.length > 1 ? "s" : ""} pendiente${pend.length > 1 ? "s" : ""}` : ""}`);
  // Y SE CIERRA TODO, pase lo que pase: navegador y servidor. Una sonda
  // huérfana se queda escuchando un puerto y gasta la máquina de la sesión
  // siguiente.
  await nav.close();
  matar(dev);
  process.exit(rojas.length ? 1 : 0);
}
