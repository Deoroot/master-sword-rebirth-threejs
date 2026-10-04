// EL GUION DEL JUGADOR, EN LA PANTALLA DE VERDAD — el 64.
//
//   npm run sonda:jugador64
//
// LO QUE ESTO EXISTE PARA MEDIR es que el jugador **corre su guion**: que al
// morir sale el consejo que escribió Thothie en `help/first_death.script`, en
// su ventana y con su texto, y que la regeneración le sube la vida sola.
//
// Por qué hace falta una sonda y no bastan las pruebas de Node: las de Node ya
// demuestran que el guion sabe hacerlo si alguien lo llama. Lo que no pueden
// ver es **si alguien lo llama** ni **dónde sale**, y las dos cosas son
// exactamente los dos fallos que este proyecto repite (apartado 4 de
// CLAUDE.md: el verde vacío y el verde que mide otra cosa).
//
// Las formas de que esto parezca funcionar y esté mal:
//
//   1. el guion no se carga             -> `probe.jugador.hay()` es false y todo
//                                          lo demás son ceros que pasan solos
//   2. se carga y nadie lo llama        -> la K mata y no sale consejo
//   3. sale, pero en la consola         -> el fallo del 60: se lee igual de bien
//   4. sale siempre                     -> no se está apuntando el «ya visto»
//   5. sale una vez y no hay control    -> «no salió» no dice nada sin un
//                                          positivo al lado
//   6. la regeneración no se arma       -> nadie llama a `player_regen_hp`, que
//                                          es justo lo que NO hay que llamar
//   7. sube la vida por otra cosa       -> hay que herir primero y medir el salto

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";
import { mkdirSync } from "node:fs";

const PORT = 5231;
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (habia ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = await arrancarVite(PORT);
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

const nav = await chromium.launch();
const ANCHO = 1200, ALTO = 800;
const pag = await nav.newPage({ viewport: { width: ANCHO, height: ALTO } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));

/**
 * SE CORTA EL HILO DE RECARGA DE VITE — el aviso del 81, aplicado aquí en el 83.
 *
 * Con el árbol compartido entre varias sesiones, en cuanto una guarda un
 * archivo vite recarga la página y **se lleva `window.probe` por delante**.
 * Esta sonda se cayó tres veces de cuatro con tres caídas DISTINTAS —un
 * `waitForFunction` agotado, un `personaje` a `null`— y la pasada que terminó
 * salió entera en verde. O sea que no medía el juego: medía las recargas.
 *
 * Y el motivo de fondo no es la comodidad: una sonda cuya página se recarga a
 * mitad está midiendo **dos versiones del código**, y eso no vale ni cuando
 * sale verde. El canal se reconoce por su subprotocolo; el del multijugador
 * pasa.
 */
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
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

try {

// Por el menú, como el jugador. El guion se monta con el `aparece` de la
// sesión, así que entrar por un atajo mediría otro juego.
await entrarPorElMenu(pag, PORT);
mkdirSync("build/gatecity/vistas", { recursive: true });
await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
await esperar(1200);

// ── 0. EL CONTROL DE TODO LO DEMÁS ─────────────────────────────────────────
const hay = await pag.evaluate(() => window.probe.jugador.hay());
console.log(`\n  EL GUION`);
console.log(`    cargado         ${hay}`);
control("el jugador tiene guion montado: sin esto, todo lo de abajo son ceros que pasan solos",
  hay, String(hay));

// ── 1. LA REGENERACIÓN SE ARMA SOLA ────────────────────────────────────────
//
// Nadie llama a `player_regen_hp`: ni un script de los 2 884 ni el motor.
// Lo que lo arranca es CARGARLO, porque `repeatdelay` es una directiva del
// cargador (script.cpp:5377-5382). Que estén armados es la medida.
const relojes = await pag.evaluate(() => window.probe.jugador.repeticiones());
const nombres = relojes.map((r) => r.evento);
console.log(`    relojes         ${relojes.length}: ${nombres.join(", ") || "ninguno"}`);
control("la regeneración está armada sin que nadie la llame",
  nombres.includes("player_regen_hp") && nombres.includes("player_regen_mp"),
  nombres.join(" ") || "ninguno");

// ── 2. Y SUBE LA VIDA DE VERDAD ────────────────────────────────────────────
//
// Se hiere primero, porque con la vida al máximo la regeneración no se nota y
// «no cambió nada» pasaría la prueba. El daño se hace con el probe porque lo
// que se mide es la regeneración, no cómo se pega.
console.log(`\n  LA REGENERACIÓN`);
await pag.evaluate(() => { window.probe.sesion.personaje.vida = 5; });
const vidaHerido = await pag.evaluate(() => window.probe.sesion.personaje.vida);
// 1 hp cada 12 s, y la primera vuelta sale en el acto (ver doc/JUGADOR_64.md).
await esperar(14000);
const vidaLuego = await pag.evaluate(() => window.probe.sesion.personaje.vida);
console.log(`    vida            ${vidaHerido} -> ${vidaLuego} en 14 s`);
control("la vida sube sola: la regeneración del guion corre en el bucle",
  vidaLuego > vidaHerido, `${vidaHerido} -> ${vidaLuego}`);

// ── 3. MORIR SACA EL CONSEJO, Y EN SU VENTANA ──────────────────────────────
//
// La K es la tecla de morirse del puerto. Se muere como se muere jugando.
console.log(`\n  MORIR`);
const antesDeMorir = await pag.evaluate(() => window.probe.jugador.ensenados());
await pag.keyboard.press("KeyK");
await esperar(1500);
const ventanas = await pag.evaluate(() => window.probe.aviso.ventanas());
const ensenados = await pag.evaluate(() => window.probe.jugador.ensenados());
const ayuda = (ventanas ?? []).find((v) => v.clase === "ayuda");
console.log(`    enseñados       ${JSON.stringify(ensenados)}`);
console.log(`    ventana         ${ayuda ? `«${ayuda.titulo}» en (${ayuda.x}, ${ayuda.y})` : "NINGUNA de ayuda"}`);
console.log(`    texto           ${JSON.stringify(String(ayuda?.texto ?? "").slice(0, 70))}`);

control("al morir el guion enseña el consejo de la muerte",
  ensenados.includes("help_death") && !antesDeMorir.includes("help_death"),
  JSON.stringify(ensenados));
control("y sale en la ventana de AYUDA, que llevaba desde el 60 sin que nadie la abriera",
  Boolean(ayuda), ayuda ? ayuda.titulo : "ninguna");
control("con el título del script, no uno inventado aquí",
  ayuda?.titulo === "Death", String(ayuda?.titulo));
// El texto NO está escrito en esta sonda: sale de `help/first_death.script`.
// Si el guion no se cargara, no habría de dónde sacarlo.
control("y con el texto de `help/first_death.script`, que esta sonda no conoce",
  /You have DIED/.test(String(ayuda?.texto ?? "")) && /5% of your gold/.test(String(ayuda?.texto ?? "")),
  JSON.stringify(String(ayuda?.texto ?? "").slice(0, 40)));
// Y que NO haya ido a la consola de sucesos, que es el fallo del 60.
const consola = await pag.evaluate(() => (window.probe.hud.estado()?.consola?.lineas ?? []).map((l) => l.texto));
control("y NO se ha ido también a la consola de sucesos: es el fallo del 60",
  !consola.some((l) => /You have DIED/.test(String(l))),
  consola.slice(-2).join(" | ").slice(0, 60));

await pag.screenshot({ path: "build/gatecity/vistas/jugador64.png" });

// ── 4. Y LA SEGUNDA VEZ NO ─────────────────────────────────────────────────
//
// Con su control positivo al lado: un consejo distinto SÍ tiene que salir, o
// «no salió» sólo diría que la ventana dejó de funcionar.
console.log(`\n  LA SEGUNDA MUERTE`);
await esperar(6000);                       // reaparecer: `ESPERA_MUERTO` son 5 s
await pag.evaluate(() => window.probe.aviso.paso(30));   // que caduque la ventana
await pag.keyboard.press("KeyK");
await esperar(1500);
const dosVeces = await pag.evaluate(() => window.probe.jugador.ensenados());
const cuantas = dosVeces.filter((c) => c === "help_death").length;
console.log(`    veces enseñado  ${cuantas}`);
control("el consejo de la muerte NO se repite: es `m_ViewedHelpTips`",
  cuantas === 1, `${cuantas} vez/veces`);
const vistos = await pag.evaluate(() => window.probe.jugador.vistos());
control("y queda apuntado en el personaje, que es lo que se guarda",
  vistos.includes("help_death"), JSON.stringify(vistos));

// EL CONTROL POSITIVO DEL CERO DE ARRIBA.
await pag.evaluate(() => window.probe.aviso.ayuda("Control", "Si esto no sale, el cero de arriba no medía nada."));
await pag.evaluate(() => window.probe.aviso.paso(1.0));
const tras = await pag.evaluate(() => window.probe.aviso.ventanas());
control("pero la ventana sigue funcionando: el cero de arriba tiene control",
  (tras ?? []).some((v) => v.clase === "ayuda" && v.titulo === "Control"),
  String((tras ?? []).filter((v) => v.clase === "ayuda").length));

// ── 4b. LA CAÍDA HUNDE LA CÁMARA — el 65 ───────────────────────────────────
//
// Es el control que junta las dos mitades del guion del jugador: un evento del
// motor (`game_hitground`) entra, y lo que sale **no es un mensaje: es la
// cámara**. El guion escribe `game.cleffect.view_ofs.z` y el bucle de dibujo lo
// suma a la vista (`Effects_GetView`, hudscript.cpp:208-221).
//
// Se mide comparando la cámara con el OJO, que es la única forma de ver el
// desplazamiento: si sólo se mirara la cámara, «se ha movido» valdría igual
// para un jugador que camina.
console.log(`
  LA CAÍDA`);
await esperar(6000);                       // que reaparezca de la segunda muerte

/** Qué separa la cámara del ojo, en unidades de GoldSrc. */
const desvio = () => pag.evaluate(() => {
  const c = window.probe.muerte.camara();
  // `distancia` es lo que separa la cámara del OJO, ya en unidades de GoldSrc.
  // Es la medida buena: mirar sólo la cámara valdría igual para quien camina.
  return { separada: c.distancia, guion: window.probe.jugador.vista("view")?.pos?.z ?? null };
});

const quieto = await desvio();
console.log(`    quieto          guion ${quieto.guion}`);
control("quieto, el guion no le pide nada a la cámara: el cero de abajo tiene con qué comparar",
  quieto.guion === 0, String(quieto.guion));

// Se le deja caer de verdad: `--` alto y la gravedad hace el resto. El umbral
// del guion son 240 u/s, y el daño no empieza hasta 580.
const pies = await pag.evaluate(() => [...window.probe.player.feet]);
await pag.evaluate(([x, y, z]) => window.probe.mundo.poner(x, y + 6, z), pies);
let hundido = 0, caida = 0, separadaEnElGolpe = 0;
for (let i = 0; i < 60; i++) {
  await esperar(50);
  const d = await desvio();
  if ((d.guion ?? 0) < hundido) { hundido = d.guion; separadaEnElGolpe = d.separada; }
  caida = Math.max(caida, await pag.evaluate(() => window.probe.player.caida ?? 0));
  if (hundido < 0) break;
}
// LOS DOS NÚMEROS SON MUESTRAS Y NINGUNO ES EL PICO, y conviene decirlo aquí
// para que nadie los lea como medidas:
//
//   - la velocidad se lee cada 50 ms y el bucle sale en cuanto ve hundimiento;
//   - y el hundimiento tampoco: el guion escribe una PARÁBOLA en el tiempo
//     (`LCL_BOBAMT² × GROUNDBOB_DIP − GROUNDBOB_DIP`) y además la recorta con
//     `capvar ... MAX_BOB_DIP`, así que lo que se pilla es un punto de la
//     curva, no su fondo.
//
// Se imprimen para poder mirarlos cuando algo raro pase. Lo que se decide con
// ellos es sólo el SIGNO: que el guion pida hundir y que la cámara se mueva.
console.log(`    cayó a          ~${Math.round(caida)} u/s (muestra) · el guion pide 240`);
console.log(`    hundimiento     ${hundido} unidades`);
control("al aterrizar fuerte, el GUION pide hundir la vista",
  hundido < 0, `${hundido} unidades`);

// Y que ese número LLEGUE a la cámara, que es otra cosa: es el enrutado, y el
// fallo del 60 fue exactamente eso.
console.log(`    cámara del ojo  ${separadaEnElGolpe.toFixed(1)} unidades`);
control("y ese número LLEGA a la cámara: se separa del ojo, que es el enrutado",
  separadaEnElGolpe > 1, `${separadaEnElGolpe.toFixed(1)} unidades`);

// Y se apaga solo: el guion se reprograma hasta escribir un cero.
await esperar(2500);
const luego = await desvio();
console.log(`    y luego         ${luego.guion}`);
control("y se apaga solo: nadie tiene que cancelarlo",
  luego.guion === 0, String(luego.guion));

// ── 5. LO QUE EL GUION PIDE Y NO SABEMOS HACER ─────────────────────────────
//
// No es un control: es la cuenta, y se dice porque el guion del jugador NO
// cabe entero —7 archivos de 25— y callarlo haría parecer que sí.
const noSop = await pag.evaluate(() => window.probe.jugador.noSoportados());
const cuenta = new Map();
for (const x of noSop) cuenta.set(x, (cuenta.get(x) ?? 0) + 1);
console.log(`\n  LO QUE FALTA POR PORTAR (no es un control)`);
console.log(`    ${[...cuenta].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} x${v}`).join(", ") || "nada"}`);

control("y no hubo errores de JavaScript", errores.length === 0, errores.slice(0, 2).join(" · "));

console.log(`\n  ── ${controles.filter((c) => c.bien).length} de ${controles.length} controles ──`);
for (const c of controles) console.log(`  ${c.bien ? "sí" : "NO"}  ${c.que}${c.detalle ? `  [${c.detalle}]` : ""}`);
console.log(`\n  captura         build/gatecity/vistas/jugador64.png`);
console.log(`  errores de página: ${errores.length ? errores.join(" · ") : "ninguno"}`);

} catch (e) {
  console.log(`\n  LA SONDA SE HA CAÍDO: ${e?.message ?? e}`);
  console.log(`  de la pagina: ${errores.length ? errores.slice(0, 10).join("\n    ") : "nada"}`);
} finally {
  await nav.close();
  matar(dev);
}
