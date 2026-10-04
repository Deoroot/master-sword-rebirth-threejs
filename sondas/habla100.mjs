// LO QUE DICE UN NPC SALE EN LA CAJA DE LA IZQUIERDA — experimento 100.
//
//   npm run sonda:habla100
//
// En el mod, «Bryan the grocer says,  "'Ello there..."» no sale en la consola de
// sucesos (abajo a la derecha): sale en la del chat, a la izquierda y a media
// altura, en ámbar sobre un fondo oscuro medio transparente. Son dos
// `VGUI_EventConsole` (vgui_hud.cpp:189 y :197) y a la segunda sólo se llega
// por `HUD_SayTextEvent` (:586-591), que es el `HUDInfoMsg` de tipo 4 que
// escribe `CMSMonster::Speak` (msmonsterserver.cpp:1721-1727).
//
// La regla —qué recado va a qué consola— está en `panelDeRecado`
// (src/play/chat.js) y la mide `test/habla100.test.mjs`. Lo que NO puede medir
// una prueba de Node es que `src/main.js` le haga caso, y eso es esta sonda:
// la F delante de un vecino, el dígito de «Hail», y a mirar las dos cajas.
//
// ── Lo que se mide, y contra qué ────────────────────────────────────────────
//
//   - la frase del NPC está en la caja del chat y NO en la de sucesos;
//   - la caja está donde la pone el mod: X = XRES(10), borde de abajo en
//     YRES(180), creciendo hacia arriba (vgui_hud.cpp:148-149,
//     vgui_eventconsole.h:255);
//   - la línea es ámbar (255,178,0 — vgui_hud.cpp:482) y el fondo
//     `setBgColor(0, 0, 20, 128)` (vgui_eventconsole.h:67 y :275);
//   - EN PÍXELES: el recorte de la caja gana píxeles ámbar que antes no tenía.
//     El color del estilo es «el valor de la ventana»; los píxeles, el efecto;
//   - el control positivo de la otra consola: el aviso de cambiar de canal
//     («You speak normally.», hudmisc.cpp:178) sigue yendo a la de sucesos;
//   - y lo escrito por el cajetín sale UNA vez (antes del 100 salía en las dos
//     consolas: doc/RED_95.md §8, «`yaDicho` no lo lee nadie»).
//
// ── Lo que NO mide, dicho ───────────────────────────────────────────────────
//
//   - la opción `say` de un menú, que hace hablar AL JUGADOR
//     (`pPlayer->Speak(MenuOption.Data, SPEECH_LOCAL)`): Gate City no tiene
//     ninguna —las siete del mod son de Edana—, así que en pantalla la mide
//     `sonda:edana79`; aquí sólo su regla, en `test/habla100.test.mjs`;
//   - con servidor: que el `saytext` viaje con `tipo 3` lo mide
//     `test/voz95.test.mjs` contra una `Partida` de verdad, no dos Chrome;
//   - la letra: `g_FontID` es «ID Text» y aquí va la del 61, sin tocar;
//   - que `HUD_SayTextEvent` tira la frase si `!ShowHUD()` (muerto, o con la
//     pantalla de personajes): no está portado y no se mide.

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";
import { leerPng } from "../tools/png.mjs";

const PORT = 5710;
const ANCHO = 1200, ALTO = 800;
// El marcador NO puede bajar (el 65): se declara cuántos hay.
const DECLARADOS = 18;

const VISTAS = "build/gatecity/vistas";
mkdirSync(VISTAS, { recursive: true });

const liberados = liberarPuerto(PORT);
if (liberados) console.log(`  (puerto ${PORT} liberado: ${liberados})`);
const dev = await arrancarVite(PORT);
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: ANCHO, height: ALTO } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));

const controles = [];
const control = (que, bien, detalle = "") => { controles.push({ que, bien: Boolean(bien), detalle }); return bien; };
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Las dos consolas, cada una por su lado, y la caja del chat como está en el DOM. */
const leer = () => pag.evaluate(() => {
  const S = window.probe;
  const caja = document.querySelector(".ms-chat-con");
  const lineas = [...(caja?.children ?? [])].map((d) => ({ texto: d.textContent, color: getComputedStyle(d).color }));
  return {
    chat: S.misiones.dicho("chat"),
    sucesos: S.misiones.dicho("sucesos"),
    todo: S.misiones.dicho(),
    estado: S.chat.estado(),
    dom: { lineas, fondo: caja ? getComputedStyle(caja).backgroundColor : null },
  };
});

/**
 * Cuántos píxeles ÁMBAR hay en un rectángulo de la pantalla.
 *
 * Ámbar es (255,178,0) con holgura para el suavizado de la letra; la holgura
 * es estrecha a propósito, porque Gate City tiene antorchas y su luz es
 * naranja: por eso se compara el MISMO rectángulo antes y después y no se
 * afirma nada con un solo recuento.
 */
async function ambar(nombre, r) {
  const ruta = `${VISTAS}/habla100-${nombre}.png`;
  const clip = { x: Math.floor(r.x), y: Math.floor(r.y), width: Math.ceil(r.w), height: Math.ceil(r.h) };
  await pag.screenshot({ path: ruta, clip });
  const { rgba } = leerPng(ruta);
  let n = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i] > 215 && Math.abs(rgba[i + 1] - 170) < 35 && rgba[i + 2] < 70) n++;
  }
  return { n, de: rgba.length / 4, ruta };
}

/** Se planta delante de un vecino, a un metro, mirándole. */
const anteElVecino = (patron) => pag.evaluate((p) => {
  const q = window.probe.vgui.npcs().find((i) => new RegExp(p).test(i.script ?? ""));
  if (!q) return null;
  window.probe.mundo.poner(q.donde[0], q.donde[1], q.donde[2] - 1.0);
  window.probe.mundo.mirar(q.donde[0], q.donde[1] + 0.9, q.donde[2]);
  return { id: q.id, nombre: q.nombre, script: q.script };
}, patron);

const firmada = (lineas, nombre) => lineas.filter((l) => l.replace(/^[a-z]+: /, "").startsWith(`${nombre} says,  "`));

try {
  await entrarPorElMenu(pag, PORT);
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
  await pag.waitForFunction(() => window.probe.sesion.estado() === "jugando", null, { timeout: 60000 }).catch(() => {});
  await pag.waitForFunction(() => window.probe.vgui.abierto() === null, null, { timeout: 60000 }).catch(() => {});
  control("se entra por el menú y hay personaje",
    await pag.evaluate(() => window.probe.sesion.estado() === "jugando" && window.probe.chat.hay() && window.probe.hud.hay()));
  await pag.evaluate(() => window.probe.vivo?.congelarPaseo?.(true));
  await dormir(1500);

  // ── 1. EL VECINO, y las dos cajas ANTES ──────────────────────────────────
  const vecino = await anteElVecino("gatecity/mayor");
  control("el alcalde está en el mapa", vecino !== null, JSON.stringify(vecino));
  await pag.waitForFunction(() => window.probe.vgui.delante() !== null, null, { timeout: 15000 }).catch(() => {});
  const antes = await leer();
  control("ANTES de hablarle, ninguna de las dos consolas trae una frase suya",
    firmada(antes.todo, vecino?.nombre).length === 0, antes.todo.slice(-3).join(" | "));

  // Dónde TIENE que estar la caja: `SAYTEXTCON_X = XRES(10)`, `SAYTEXTCON_Y =
  // YRES(180)` (vgui_hud.cpp:148-149). Escrito a mano y no leído de la caja
  // (el 75: cuando el número ES la regla, va a mano con su cita).
  const X = Math.round((10 * ANCHO) / 640), ABAJO = Math.round((180 * ALTO) / 480);
  // El rectángulo que se va a fotografiar: ocho líneas (`ms_txthud_size`) hacia
  // arriba desde el borde, y media pantalla de ancho.
  const zona = { x: X, y: ABAJO - 170, w: ANCHO / 2, h: 170 };
  const pxAntes = await ambar("antes", zona);

  // ── 2. LA F Y «HAIL» ──────────────────────────────────────────────────────
  await pag.keyboard.press("KeyF");
  await dormir(900);
  const botones = await pag.evaluate(() => window.probe.vgui.botones().map((b) => b.texto));
  const i = botones.findIndex((t) => /Hail|Hello|Greet/i.test(String(t)));
  control("la F abre su menú y trae el saludo", i >= 0, botones.join(" | ") || "(no se abrió)");
  if (i >= 0) await pag.keyboard.press(`Digit${i + 1}`);
  await pag.waitForFunction((n) => window.probe.misiones.dicho().some((l) => l.includes(`${n} says,  "`)),
    vecino?.nombre, { timeout: 15000 }).catch(() => {});
  await dormir(400);

  const tras = await leer();
  const pxTras = await ambar("tras", zona);
  await pag.screenshot({ path: `${VISTAS}/habla100-pantalla.png` });
  const suyasChat = firmada(tras.chat, vecino?.nombre);
  const suyasSucesos = firmada(tras.sucesos, vecino?.nombre);
  console.log(`    chat     ${tras.chat.map((l) => JSON.stringify(l)).join("\n             ") || "(vacío)"}`);
  console.log(`    sucesos  ${tras.sucesos.slice(-4).map((l) => JSON.stringify(l)).join("\n             ") || "(vacío)"}`);

  control("EL ALCALDE CONTESTA EN LA CAJA DEL CHAT", suyasChat.length > 0, suyasChat[0] ?? tras.chat.join(" | ") ?? "");
  control("y NO en la consola de sucesos", suyasSucesos.length === 0, suyasSucesos.join(" | "));
  control("con el tipo SAYTEXT_NPC", suyasChat.every((l) => l.startsWith("npc: ")) && suyasChat.length > 0, suyasChat.map((l) => l.split(":")[0]).join(","));
  control("`probe.misiones.dicho()` —el lector de las demás sondas— la encuentra",
    firmada(tras.todo, vecino?.nombre).length === suyasChat.length && suyasChat.length > 0, `${firmada(tras.todo, vecino?.nombre).length}`);

  // ── 3. DÓNDE Y CÓMO SE VE ────────────────────────────────────────────────
  const c = tras.estado.caja;
  console.log(`    la caja  x ${c.x.toFixed(0)} · y ${c.y.toFixed(0)} · ${c.w.toFixed(0)}x${c.h.toFixed(0)} · visible ${c.visible}`);
  control("la caja se ve", c.visible && c.w > 20 && c.h > 8, `${c.w.toFixed(0)}x${c.h.toFixed(0)}`);
  control("está a la IZQUIERDA: X = XRES(10)", Math.abs(c.x - X) <= 1, `x ${c.x.toFixed(1)}, se espera ${X}`);
  control("su borde de ABAJO está en YRES(180) y crece hacia arriba", Math.abs(c.y + c.h - ABAJO) <= 1 && c.y < ABAJO,
    `abajo ${(c.y + c.h).toFixed(1)}, se espera ${ABAJO}`);
  control("no pasa de la mitad izquierda y queda A MEDIA ALTURA (entre 1/5 y 1/2 de la pantalla)",
    c.x + c.w <= ANCHO / 2 + X && c.y + c.h > ALTO / 5 && c.y + c.h < ALTO / 2, `de ${c.y.toFixed(0)} a ${(c.y + c.h).toFixed(0)} de ${ALTO}`);
  const lineaDom = tras.dom.lineas.find((l) => l.texto.startsWith(`${vecino?.nombre} says,`));
  control("la línea es ÁMBAR: Color(255, 178, 0)", lineaDom?.color === "rgb(255, 178, 0)", lineaDom?.color ?? "(no está en el DOM)");
  // Con `c.visible`: el fondo es un estilo fijo y una caja ESCONDIDA lo trae
  // igual. Rota la entrega a propósito, este control se quedaba verde él solo.
  control("sobre `setBgColor(0, 0, 20, 128)`: oscuro y medio transparente (y con la caja a la vista)",
    c.visible && /^rgba\(0, 0, 20, 0\.50?\d*\)$/.test(tras.dom.fondo ?? ""), `${tras.dom.fondo ?? ""}${c.visible ? "" : " — escondida"}`);
  console.log(`    píxeles ámbar en la zona: ${pxAntes.n} antes, ${pxTras.n} después (de ${pxTras.de})`);
  control("EN PÍXELES: la zona de la caja gana letra ámbar que antes no tenía",
    pxTras.n > pxAntes.n + 150, `${pxAntes.n} -> ${pxTras.n}`);

  // ── 4. LA OTRA CONSOLA SIGUE VIVA, y el cajetín no repite ─────────────────
  //
  // La «U» abre el canal local y avisa por la consola de SUCESOS
  // (`SendEventMsg`, hudmisc.cpp:178): es el control positivo de que no se ha
  // mudado todo a la del chat.
  // SIN Escape: elegir ya cerró el panel, y un Escape de más abre el menú del
  // juego, con el que la «U» no abre el cajetín (lo pagó `mision_anexo`, y la
  // primera pasada de ésta: dos rojos con el juego bien).
  await pag.waitForFunction(() => window.probe.vgui.abierto() === null, null, { timeout: 5000 }).catch(() => {});
  const marca = await leer();
  await pag.keyboard.press("KeyU");
  await dormir(200);
  await pag.keyboard.type("sonda100 testing", { delay: 25 });
  await pag.keyboard.press("Enter");
  await dormir(700);
  const fin = await leer();
  const cuenta = (ls, t) => ls.filter((l) => l.includes(t)).length;
  control("el aviso de canal («You speak normally.») sigue en la consola de SUCESOS y no en el chat",
    cuenta(fin.sucesos, "You speak normally.") > cuenta(marca.sucesos, "You speak normally.") && cuenta(fin.chat, "You speak normally.") === 0,
    `sucesos ${cuenta(fin.sucesos, "You speak normally.")} · chat ${cuenta(fin.chat, "You speak normally.")}`);
  control("lo escrito en el cajetín sale UNA vez, en el chat, y ninguna en sucesos",
    cuenta(fin.chat, 'Sonda says,  "sonda100 testing"') === 1 && cuenta(fin.sucesos, "sonda100 testing") === 0,
    `chat ${cuenta(fin.chat, "sonda100 testing")} · sucesos ${cuenta(fin.sucesos, "sonda100 testing")}`);

  control("ni un error de página", errores.length === 0, errores.join(" | "));

  const bien = controles.filter((x) => x.bien).length;
  console.log(`\n  CONTROLES`);
  for (const x of controles) console.log(`  ${x.bien ? "ok  " : "MAL "} ${x.que.padEnd(66)} ${x.detalle}`);
  const faltan = DECLARADOS - controles.length;
  if (faltan !== 0) console.log(`  MAL  se declararon ${DECLARADOS} controles y han corrido ${controles.length}`);
  console.log(`\n  ${bien} de ${DECLARADOS} en verde`);
  console.log(`  capturas: ${VISTAS}/habla100-*.png\n`);
  await nav.close();
  matar(dev);
  process.exit(bien === DECLARADOS && faltan === 0 ? 0 : 1);
} catch (e) {
  // UNA CAÍDA ES UNA ROJA, NO UNA NOTA AL PIE — la lección del 65.
  console.log(`\n  LA SONDA SE HA CAÍDO: ${e.message}`);
  for (const x of controles) console.log(`  ${x.bien ? "ok  " : "MAL "} ${x.que.padEnd(66)} ${x.detalle}`);
  console.log(`\n  ${controles.filter((x) => x.bien).length} de ${DECLARADOS} en verde (caída)`);
  console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);
  try { await nav.close(); } catch {}
  matar(dev);
  process.exit(1);
}
