// EL 61 EN PANTALLA: dos navegadores y una frase que va de uno al otro.
//
//   npm run sonda:chat61
//   npm run sonda:chat61 -- --mapa gatecity
//
// `npm test` comprueba 39 reglas del chat —qué frase se arma, quién la oye, a
// qué distancia—. **Ninguna de las 39 dice que salga en la pantalla del otro**,
// y ninguna dice que salga en la caja de la IZQUIERDA. Eso es lo que hay aquí,
// y es la lección del 60: cuando una regla decide *qué* y otra cosa decide
// *dónde*, la segunda no la ve ninguna prueba de la primera.
//
// Las formas de que esto parezca funcionar y esté mal:
//
//    1. la tecla no abre nada              -> `say_text` no está enganchado
//    2. abre y el juego sigue oyendo teclas -> escribir «walk» te hace andar
//    3. escribes y no se ve lo escrito      -> el cajetín no se repinta
//    4. el Enter no manda                   -> falta el `decir()`
//    5. manda y sólo lo ve quien lo dijo    -> el reparto de `Speak`
//    6. lo ven los dos y sale en la consola de sucesos -> el enrutado (el 60)
//    7. sale en su caja y con el texto crudo -> no se arma la frase del canal
//    8. sale la frase y con el nombre del otro -> el nombre lo pone el cliente
//    9. el local se oye desde el otro extremo del mapa -> no se mira el rango
//   10. no se va nunca                      -> `ms_txthud_decaytime`

import { spawn, spawnSync } from "node:child_process";
import { lanzarVite, esperarHttp } from "./mismo.mjs";
import { chromium } from "playwright";
import { entrarPorElMenu } from "./entrar.mjs";
import { mkdirSync, rmSync } from "node:fs";
import { MAPA_POR_DEFECTO, esNombreDeMapa } from "../src/play/mapa.js";

const PUERTO_WEB = 5215;
const PUERTO_PARTIDA = 5216;
const PERSONAJES = "build/partidas/chat/personajes";

const iMapa = process.argv.indexOf("--mapa");
const MAPA = iMapa >= 0 ? process.argv[iMapa + 1] : "edana";
if (!esNombreDeMapa(MAPA)) { console.error(`«${MAPA}» no es un nombre de mapa`); process.exit(2); }
console.log(`\n  EL MAPA: ${MAPA}  (el de por omisión de esta sonda es edana; ${MAPA_POR_DEFECTO} con --mapa)\n`);

try { rmSync("build/partidas/chat", { recursive: true, force: true }); } catch {}

function liberarPuerto(puerto) {
  const r = spawnSync("cmd", ["/c", `netstat -ano | findstr LISTENING | findstr :${puerto}`], { encoding: "utf8" });
  const pids = new Set(String(r.stdout ?? "").split(/\r?\n/)
    .map((l) => l.trim().split(/\s+/).pop()).filter((x) => /^[0-9]+$/.test(x) && x !== "0"));
  for (const pid of pids) spawnSync("taskkill", ["/F", "/T", "/PID", pid], { stdio: "ignore", shell: true });
  return [...pids];
}
const liberados = [...liberarPuerto(PUERTO_WEB), ...liberarPuerto(PUERTO_PARTIDA)];
if (liberados.length) console.log(`  (habia ${liberados.length} proceso(s) ocupando los puertos: matados)`);

const dev = lanzarVite(PUERTO_WEB);
const partida = spawn(process.execPath, [
  "tools/servidor.mjs", "--puerto", String(PUERTO_PARTIDA),
  "--nombre", "El chat", "--personajes", PERSONAJES, "--mapa", MAPA, "--sinbichos",
], { stdio: ["ignore", "pipe", "pipe"] });
const salidaDelServidor = [];
partida.stdout.on("data", (b) => salidaDelServidor.push(String(b)));
partida.stderr.on("data", (b) => salidaDelServidor.push(`ERR ${b}`));
const matar = (p) => { try { spawnSync("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

// vite y el mapa del servidor: se les PREGUNTA en vez de dormir a ciegas (el 98;
// el servidor no abre el puerto hasta haber cargado el mapa, servidor.mjs:241).
await esperarHttp(`http://localhost:${PUERTO_WEB}/`, { tope: 90_000, proceso: dev, quien: "vite" });
await esperarHttp(`http://localhost:${PUERTO_PARTIDA}/partidas`, { tope: 90_000, proceso: partida, quien: "el servidor de partida" });

const nav = await chromium.launch();
const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const errores = [];

try {
const abrir = async (quien) => {
  const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
  pag.on("pageerror", (e) => errores.push(`${quien}: ${String(e).slice(0, 160)}`));
  await entrarPorElMenu(pag, PUERTO_WEB, {
    mapa: MAPA,
    extra: `red=ws://localhost:${PUERTO_PARTIDA}/juego`,
  });
  await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
  return pag;
};

const ana = await abrir("ana");
const beto = await abrir("beto");
mkdirSync(`build/${MAPA}/vistas`, { recursive: true });

await ana.evaluate(() => window.probe.sesion.nuevo("Ana", "swords_rsword"));
await esperar(500);
await beto.evaluate(() => window.probe.sesion.nuevo("Beto", "swords_rsword"));
await esperar(1500);

const dentro = await Promise.all([ana, beto].map((p) => p.evaluate(() => window.probe.red.estado())));
control("los dos están dentro de la misma partida y reciben fotos",
  dentro.every((d) => d.dentro && d.fotos > 0), `fotos ${dentro.map((d) => d.fotos).join(" y ")}`);

control("y la ventana de chat está montada en los dos",
  (await ana.evaluate(() => window.probe.chat.hay())) && (await beto.evaluate(() => window.probe.chat.hay())),
  "montada");

// ── 1. LA TECLA ABRE EL CAJETÍN ────────────────────────────────────────────
console.log(`\n  LA TECLA`);
const cerrado = await ana.evaluate(() => window.probe.chat.estado());
control("antes de tocar nada el cajetín está cerrado",
  cerrado.escribiendo === false, `escribiendo ${cerrado.escribiendo}`);

// LA TECLA DE VERDAD: `y`, que es `bind "y" "say_text 0"` de config.cfg.
await ana.keyboard.press("KeyY");
await esperar(200);
const abiertoGlobal = await ana.evaluate(() => window.probe.chat.estado());
console.log(`    tras la Y       canal ${abiertoGlobal.canal} · escribiendo ${abiertoGlobal.escribiendo}`);
control("la Y abre el cajetín en el canal global (0)",
  abiertoGlobal.escribiendo === true && abiertoGlobal.canal === 0, `canal ${abiertoGlobal.canal}`);

// ── 2. MIENTRAS ESCRIBES, EL JUEGO NO OYE LAS TECLAS ───────────────────────
//
// Es el fallo número 2, y es el que se nota jugando: escribir «walk» con el
// cajetín mal hecho te hace andar, agacharte y sacar el arco.
console.log(`\n  EL JUEGO SE CALLA`);
const antesDeAndar = await ana.evaluate(() => [...window.probe.player.feet]);
await ana.keyboard.type("walk", { delay: 40 });
await esperar(600);
const despuesDeAndar = await ana.evaluate(() => [...window.probe.player.feet]);
const movido = Math.hypot(despuesDeAndar[0] - antesDeAndar[0], despuesDeAndar[2] - antesDeAndar[2]);
console.log(`    escribiendo     se ha movido ${movido.toFixed(3)} m`);
control("escribir «walk» NO mueve al personaje: la W es del cajetín",
  movido < 0.05, `${movido.toFixed(3)} m`);

const loEscrito = await ana.evaluate(() => window.probe.chat.estado());
console.log(`    lo escrito      «${loEscrito.loEscrito}»`);
control("y lo tecleado se ve en el cajetín, letra a letra",
  loEscrito.loEscrito === "walk", `«${loEscrito.loEscrito}»`);

// EL CONTROL POSITIVO DEL CERO DE ARRIBA.
//
// «no se ha movido» pasaría igual si el personaje estuviera clavado contra una
// pared, o muerto, o sin física. Así que se cierra el cajetín y se anda con la
// MISMA tecla: si ahora tampoco se mueve, el cero de antes no medía el chat.
await ana.keyboard.press("Escape");
await esperar(200);
const cerradoTrasEscape = await ana.evaluate(() => window.probe.chat.estado());
control("la Escape cierra el cajetín sin mandar nada",
  cerradoTrasEscape.escribiendo === false, `escribiendo ${cerradoTrasEscape.escribiendo}`);

const antesLibre = await ana.evaluate(() => [...window.probe.player.feet]);
await ana.keyboard.down("KeyW");
await esperar(900);
await ana.keyboard.up("KeyW");
const despuesLibre = await ana.evaluate(() => [...window.probe.player.feet]);
const anduvo = Math.hypot(despuesLibre[0] - antesLibre[0], despuesLibre[2] - antesLibre[2]);
console.log(`    sin cajetín     la MISMA W le anda ${anduvo.toFixed(2)} m`);
control("y con el cajetín cerrado esa misma W SÍ le anda: el cero de arriba tiene control",
  anduvo > 0.5, `${anduvo.toFixed(2)} m`);

// ── 3. UNA FRASE GLOBAL LLEGA AL OTRO ──────────────────────────────────────
console.log(`\n  DE ANA A BETO`);
await beto.evaluate(() => window.probe.chat.cvars({ decaimiento: 600 }));
await ana.evaluate(() => window.probe.chat.cvars({ decaimiento: 600 }));

await ana.keyboard.press("KeyY");
await ana.keyboard.type("hello there", { delay: 30 });
await ana.keyboard.press("Enter");
await esperar(1200);

const enBeto = await beto.evaluate(() => window.probe.chat.estado());
const enAna = await ana.evaluate(() => window.probe.chat.estado());
console.log(`    Beto lee        ${JSON.stringify(enBeto.lineas)}`);
console.log(`    Ana lee         ${JSON.stringify(enAna.lineas)}`);

control("lo que Ana dice llega a la pantalla de Beto",
  enBeto.lineas.some((l) => l.texto.includes("hello there")), `${enBeto.lineas.length} líneas`);

// LA FRASE ES LA DEL MOD, no «Ana: hello there».
control("y con la frase del canal: «[global] Ana: hello there»",
  enBeto.lineas.some((l) => l.texto === "[global] Ana: hello there"),
  enBeto.lineas.map((l) => l.texto).join(" | "));

control("y con el NOMBRE DEL PERSONAJE, que lo pone el servidor",
  enBeto.lineas.some((l) => l.texto.includes("Ana")), "Ana");

control("el que habla también se lee a sí mismo",
  enAna.lineas.some((l) => l.texto === "[global] Ana: hello there"),
  enAna.lineas.map((l) => l.texto).join(" | "));

control("el cajetín se cierra al mandar",
  enAna.escribiendo === false, `escribiendo ${enAna.escribiendo}`);

// ── 4. EL ENRUTADO: LA CAJA DE LA IZQUIERDA, NO LA DE SUCESOS ──────────────
//
// Esto es el 60 otra vez. La frase podía salir perfecta y salir en la consola
// de sucesos, abajo a la derecha, y se leería igual de bien.
console.log(`\n  DÓNDE SALE`);
const sitios = await beto.evaluate(() => ({
  chat: window.probe.chat.estado().caja,
  sucesos: window.probe.hud.estado()?.consola ?? null,
  ancho: innerWidth, alto: innerHeight,
}));
console.log(`    caja del chat   x ${Math.round(sitios.chat.x)} y ${Math.round(sitios.chat.y)} (pantalla ${sitios.ancho}×${sitios.alto})`);
control("la frase sale en la caja del chat, y está VISIBLE",
  sitios.chat.visible === true && sitios.chat.w > 0, JSON.stringify(sitios.chat));

control("y esa caja está a la IZQUIERDA y por encima de la mitad: `XRES(10), YRES(180)`",
  sitios.chat.x < sitios.ancho * 0.25 && sitios.chat.y < sitios.alto * 0.5,
  `x ${Math.round(sitios.chat.x)} de ${sitios.ancho} · y ${Math.round(sitios.chat.y)} de ${sitios.alto}`);

// Y EL CONTROL NEGATIVO CON SU POSITIVO AL LADO.
//
// «no hay nada en la consola de sucesos» no vale solo: valdría igual si la
// consola estuviera vacía por haberse apagado. Así que primero se manda un
// suceso de verdad, y luego se mira que la frase del chat NO esté allí.
await beto.evaluate(() => window.probe.hud.suceso("normal", "control: esto sí es un suceso"));
await esperar(200);
const sucesos = await beto.evaluate(() => window.probe.hud.estado().consola.lineas.map((l) => l.texto));
console.log(`    sucesos         ${JSON.stringify(sucesos)}`);
control("la consola de sucesos SÍ recibe lo suyo (el control positivo)",
  sucesos.some((t) => t.includes("control: esto sí es un suceso")), sucesos.join(" | "));
control("y NINGUNA frase de chat se ha colado en ella",
  !sucesos.some((t) => t.includes("hello there")), sucesos.join(" | "));

// ── 5. EL LOCAL TIENE ALCANCE Y EL GLOBAL NO ───────────────────────────────
//
// `SPEECH_LOCAL_RANGE 300` unidades, medidas en 2D. Es la diferencia entre los
// dos canales que un jugador nota, y la que un port se salta.
console.log(`\n  LAS 300 UNIDADES`);
// Se separan de verdad: Beto se va andando hasta pasar del rango.
await beto.evaluate(() => {
  const d = window.probe.sesion.donde().dice;
  if (Number.isFinite(d?.yaw)) window.probe.player.yaw = d.yaw;
});
// SE ANDA HASTA LLEGAR, NO UN RATO FIJO.
//
// Esto era `esperar(11000)` y daba 925 unidades una vuelta y 271 la
// siguiente: el suelo de Edana no es liso, hay una cuesta y un muro, y una
// espera fija mide el terreno tanto como la separación. Un control que
// depende de dónde caiga el punto de aparición no es un control.
const separacion = async () => ana.evaluate(() => {
  const otros = window.probe.red.otros();
  const yo = window.probe.player.feet;
  if (!otros.length) return null;
  const o = otros[0].pies;
  return Math.hypot(o[0] - yo[0], o[2] - yo[2]);
});
const METRO_EN_UNIDADES = 39.37;
await beto.keyboard.down("KeyW");
let lejos = null;
for (let i = 0; i < 12; i++) {
  await esperar(2000);
  lejos = await separacion();
  if ((lejos ?? 0) * METRO_EN_UNIDADES > 400) break;   // 400 y no 300: margen
  // Si se ha quedado contra un muro, se gira y se sigue.
  await beto.evaluate(() => { window.probe.player.yaw += Math.PI / 3; });
}
await beto.keyboard.up("KeyW");
await esperar(600);
lejos = await separacion();
// En unidades de GoldSrc, que es en las que está escrito el rango.
const enUnidades = lejos == null ? null : lejos * METRO_EN_UNIDADES;
console.log(`    separados       ${lejos?.toFixed(2)} m = ${enUnidades?.toFixed(0)} unidades (el rango son 300)`);
control("se han separado de verdad, más de las 300 unidades del rango",
  (enUnidades ?? 0) > 300, `${enUnidades?.toFixed(0)} unidades`);

const antesDelLocal = await beto.evaluate(() => window.probe.chat.estado().lineas.length);
await ana.keyboard.press("KeyU");      // bind "u" "say_text 1" — local
await ana.keyboard.type("too far", { delay: 30 });
await ana.keyboard.press("Enter");
await esperar(1200);
const trasElLocal = await beto.evaluate(() => window.probe.chat.estado());
console.log(`    Beto lee        ${JSON.stringify(trasElLocal.lineas.map((l) => l.texto))}`);
control("el LOCAL de Ana no llega a Beto, que está fuera de las 300",
  !trasElLocal.lineas.some((l) => l.texto.includes("too far")),
  `${trasElLocal.lineas.length} líneas (eran ${antesDelLocal})`);

// EL CONTROL POSITIVO, que es el que decide si el cero de arriba vale: el
// GLOBAL desde el mismo sitio y en el mismo instante SÍ tiene que llegar.
await ana.keyboard.press("KeyY");
await ana.keyboard.type("but this arrives", { delay: 30 });
await ana.keyboard.press("Enter");
await esperar(1200);
const trasElGlobal = await beto.evaluate(() => window.probe.chat.estado());
control("y el GLOBAL desde el mismo sitio SÍ llega: el cero de arriba tiene control",
  trasElGlobal.lineas.some((l) => l.texto.includes("but this arrives")),
  trasElGlobal.lineas.map((l) => l.texto).join(" | "));

// Y el que lo dice se oye a sí mismo aunque no lo oiga nadie más.
const anaSeOye = await ana.evaluate(() => window.probe.chat.estado());
control("Ana sí se lee su propio local: el que habla se oye siempre",
  anaSeOye.lineas.some((l) => l.texto.includes("too far")),
  anaSeOye.lineas.map((l) => l.texto).join(" | "));

control("y su local se escribe con el verbo: «Ana says,  \"too far\"»",
  anaSeOye.lineas.some((l) => l.texto === 'Ana says,  "too far"'),
  anaSeOye.lineas.map((l) => l.texto).join(" | "));

// ── 6. SE VA SOLO ──────────────────────────────────────────────────────────
console.log(`\n  SE VA SOLO`);
// EL RELOJ YA ARMADO NO SE ENTERA DEL CVAR NUEVO, y eso es del motor:
// `m_ShrinkTime` se fija UNA vez con el `m_DecayTime->value` que hubiera
// entonces (vgui_eventconsole.h:296-300), así que bajar el cvar con la cuenta
// en marcha no la acorta. Arriba se puso a 600 para que las frases aguantaran
// los cuarenta segundos de sonda, y con eso puesto avanzar treinta no vacía
// nada — la primera vuelta de este control dio 3 → 3 por eso, y no por el
// decaimiento.
//
// Se rearma por donde lo rearma el juego: `StepInput`, que pone
// `m_ShrinkTime = 0` (vgui_eventconsole.h:319-330), o sea RePág.
await beto.evaluate(() => window.probe.chat.cvars({ decaimiento: 1 }));
await beto.evaluate(() => window.probe.chat.desplazar(false));
const antesDeIrse = await beto.evaluate(() => window.probe.chat.estado().visibles);
const trasElReloj = await beto.evaluate(() => window.probe.chat.avanzar(30));
console.log(`    visibles        ${antesDeIrse} -> ${trasElReloj.visibles}`);
control("con el reloj adelantado las líneas se van, como `ms_txthud_decaytime`",
  antesDeIrse > 0 && trasElReloj.visibles === 0, `${antesDeIrse} -> ${trasElReloj.visibles}`);

await ana.screenshot({ path: `build/${MAPA}/vistas/chat61.png` });
console.log(`    captura         build/${MAPA}/vistas/chat61.png`);

control("y el servidor no ha escupido ningún error",
  !salidaDelServidor.some((l) => l.startsWith("ERR")),
  salidaDelServidor.filter((l) => l.startsWith("ERR")).join(" ").slice(0, 160) || "ninguno");

console.log(`\n  ── ${controles.filter((c) => c.bien).length} de ${controles.length} controles ──`);
for (const c of controles) console.log(`  ${c.bien ? "sí" : "NO"}  ${c.que}${c.detalle ? `  [${c.detalle}]` : ""}`);
console.log(`\n  errores de página: ${errores.length ? errores.join(" · ") : "ninguno"}`);

} catch (e) {
  console.log(`\n  LA SONDA SE HA CAÍDO: ${e?.message ?? e}`);
  console.log(`  el servidor dijo:\n${salidaDelServidor.join("").split("\n").map((l) => `  ${l}`).join("\n")}`);
} finally {
  await nav.close();
  matar(partida); matar(dev);
}

process.exit(controles.length && controles.every((c) => c.bien) && !errores.length ? 0 : 1);
