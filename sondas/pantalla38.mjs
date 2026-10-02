// LA PANTALLA COMPLETA, MEDIDA — lo que el experimento 35 dejó declarado.
//
// `doc/NAVEGADOR_35.md` acaba diciendo «falta la sonda. Queda dicho aquí en vez
// de dado por bueno», y llevaba razón: de todo el experimento 35 sólo se
// comprobaba el diagnóstico en Node —qué teclas choca el `config.cfg`— y nada de
// lo que el navegador hace cuando se le piden. Esto lo mide, y mide además los
// dos fallos que aparecieron al jugar en pantalla completa de verdad:
//
//   1. **Aguantar la Escape spameaba el menú.** Chromium exige la Escape
//      AGUANTADA para salir de pantalla completa cuando el teclado está
//      atrapado, así que el jugador tiene que aguantarla, y cada repetición del
//      `keydown` alternaba el menú: abre, cierra, abre, cierra, con su sonido.
//   2. **El ratón no funcionaba en el menú.** El menú principal nunca soltó el
//      puntero: lo soltaba la Escape del navegador por nosotros. Con Keyboard
//      Lock la Escape es nuestra, el favor se acaba y el menú se abre sin ratón.
//
// Los dos son el mismo fallo de fondo, y merece la pena escribirlo: **el
// arreglo del 35 se llevó por delante lo que le tapaba el fallo al de al lado.**
// Pedir la Escape es pedir también lo que la Escape hacía gratis.
//
// ── EL TECHO DE ESTA SONDA, QUE VA AQUÍ ARRIBA Y NO EN UNA NOTA AL PIE ──────
//
// Que la pestaña NO se cierre con Ctrl+W no se puede medir desde aquí, y el
// motivo importa: Playwright manda las teclas por CDP
// (`Input.dispatchKeyEvent`), que las inyecta en el renderizador **por debajo
// de la capa de atajos del navegador**. O sea que un Ctrl+W de sonda no cierra
// la pestaña ni con el teclado atrapado ni sin él, y un control que dijera «no
// se cerró» estaría en verde con Keyboard Lock desconectado. Es el mismo error
// que el «una caída dentro del agua no hace daño» que da 15 → 15 porque por esa
// vía nada hace daño.
//
// Así que la sonda mide LO QUE SÍ PUEDE: que el camino del jugador —pulsar la
// `b`— consigue de verdad la pantalla completa y el teclado, que el navegador lo
// confirma, que soltarlo se entera, y los dos fallos de arriba. Y el Ctrl+W
// queda con su control declarado como lo que es: la comprobación de que el
// camino inyectado no distingue, medida en vez de supuesta.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { esNuestro, liberarPuerto } from "./mismo.mjs";
import { mkdirSync } from "node:fs";

const PORT = 5201;
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (habia ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { shell: true, stdio: "ignore" });
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
await new Promise((r) => setTimeout(r, 6000));

// `--headless=new` y no el viejo: el headless antiguo no trae Keyboard Lock, y
// una sonda que corriera ahí daría todos estos controles en gris sin decirlo.
// Se comprueba abajo con `hayKeyboardLock`, que es el positivo de la sonda
// entera: sin él, lo que sigue no mide nada y hay que verlo.
// ── POR QUÉ ÉSTA NO ENTRA POR EL MENÚ, y las demás sí (59) ────────────────
//
// El 59 pasó las 27 sondas que abrían `?map=gatecity` a entrar por el menú.
// Ésta se queda, y no por pereza: **su tema es la entrada**.
//
//   - los apartados 1 a 3 miden el estado ANTES de entrar —el teclado sin
//     atrapar, sin pantalla completa, el menú en pie—, y un ayudante que
//     entra por el menú ya ha pulsado «Start» cuando llegan;
//   - el apartado 9 compara los DOS caminos a propósito: si los retratos se
//     montan por `?map=` y no por el menú, el fallo es del menú; si no se
//     montan por ninguno, llevaba roto desde antes. Poner los dos lados al
//     mismo camino deja la comparación comparándose consigo misma.
//
// Se probó convertirla y dio 33 de 35, con siete controles midiendo otra
// cosa. Un camino uniforme no vale nada si borra la pregunta.
const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
await pag.goto(`http://localhost:${PORT}/?map=gatecity`, { waitUntil: "load" });
await esNuestro(pag, PORT);
mkdirSync("build/gatecity/vistas", { recursive: true });
const foto = async (n) => { await pag.waitForTimeout(300); await pag.screenshot({ path: `build/gatecity/vistas/pantalla38-${n}.png` }); };

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });

await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
await pag.evaluate(() => window.probe.sesion.nuevo("Sonda"));
await pag.waitForTimeout(400);

// ── 0. EL POSITIVO DE LA SONDA ENTERA ──────────────────────────────────────
const hayApi = await pag.evaluate(() => window.probe.navegador.hayKeyboardLock());
console.log(`\n  Keyboard Lock en este navegador: ${hayApi ? "sí" : "NO"}`);
control("el navegador de la sonda trae Keyboard Lock", hayApi, String(hayApi));
const choques = await pag.evaluate(() => window.probe.navegador.choques());
console.log(`  choques con las teclas puestas: ${choques.length}` +
  (choques.length ? ` — ${choques.map((c) => c.acciones.join(" + ")).join("; ")}` : ""));
// Con los `bind` del juego hay dos clases: Ctrl+W y las de función solas.
control("y el juego choca con el navegador, que es por lo que esto existe",
  choques.length > 0, `${choques.length}`);

// ── 1. ANTES DE PEDIR NADA ─────────────────────────────────────────────────
const antes = await pag.evaluate(() => ({
  atrapado: window.probe.navegador.atrapado(),
  completa: window.probe.navegador.pantallaCompleta(),
}));
control("al empezar el teclado NO está atrapado", !antes.atrapado, String(antes.atrapado));
control("y no se está en pantalla completa", !antes.completa, String(antes.completa));

// ── 2. LA `b`, QUE ES EL CAMINO DEL JUGADOR ────────────────────────────────
//
// La tecla de verdad y no `probe.navegador.algo()`: las dos APIs exigen el gesto
// del usuario, así que pedirlas desde `evaluate` fallaría siempre y pedirlas
// desde una puerta de la sonda mediría el `try`, no la concesión.
await pag.keyboard.press("KeyB");
await pag.waitForTimeout(700);
const conB = await pag.evaluate(() => ({
  atrapado: window.probe.navegador.atrapado(),
  completa: window.probe.navegador.pantallaCompleta(),
  sucesos: window.probe.hud?.sucesos?.() ?? null,
}));
console.log(`  tras la B: pantalla completa ${conB.completa}, teclado atrapado ${conB.atrapado}`);
control("la B mete en pantalla completa", conB.completa, String(conB.completa));
control("y con ella el teclado queda atrapado", conB.atrapado, String(conB.atrapado));
await foto("1-completa");

// ── 3. EL TECHO, MEDIDO ────────────────────────────────────────────────────
//
// Ctrl+W con el teclado atrapado, y la pestaña sigue aquí. NO es la prueba de
// que Keyboard Lock funcione: es la prueba de que por CDP no se puede probar.
await pag.keyboard.press("Control+KeyW");
await pag.waitForTimeout(300);
const sigueViva = !pag.isClosed() && await pag.evaluate(() => Boolean(window.probe));
control("un Ctrl+W de sonda no cierra la pestaña CON el teclado atrapado",
  sigueViva, String(sigueViva));

// ── 4. AGUANTAR LA ESCAPE NO SPAMEA EL MENÚ ────────────────────────────────
//
// El fallo 1, y SE CUENTA en vez de mirarse.
//
// La primera versión de este control muestreaba «¿está abierto?» veinte veces
// mientras la tecla estaba abajo y daba VERDE con el arreglo quitado: veinte de
// veinte muestras con el menú abierto y el menú alternando debajo, porque entre
// dos miradas cabe un número par de vueltas y cada mirada cuesta 30 ms de ida y
// vuelta. Un control que sigue verde con el fallo puesto no es un control, y
// éste estuvo a un `git diff` de colarse.
//
// `aperturas` sólo sube (`src/juego/menums.js`), así que la diferencia entre
// antes y después es el número de veces que el menú se abrió de verdad. Con el
// arreglo tiene que ser exactamente 1.
const cerradoAntes = await pag.evaluate(() => window.probe.menu.estado());
control("el menú está cerrado antes de aguantar la Escape", cerradoAntes?.abierto === false,
  String(cerradoAntes?.abierto));
// Y LA REPETICIÓN HAY QUE PEDIRLA. Un `keyboard.down("Escape")` y esperar 600 ms
// **no repite**: Playwright manda un solo `keyDown` por CDP y la repetición
// automática la hace el sistema operativo, que aquí no está. Con la espera a
// secas el control salía verde —una sola apertura— con el arreglo quitado, o
// sea que medía el transporte de la sonda y no el juego. Un segundo `down()` de
// la misma tecla sin `up()` en medio sí lleva `repeat: true`, que es exactamente
// lo que llega cuando un jugador la aguanta.
await pag.keyboard.down("Escape");
for (let i = 0; i < 20; i++) {
  await pag.keyboard.down("Escape");
  await pag.waitForTimeout(30);
}
await pag.keyboard.up("Escape");
await pag.waitForTimeout(200);
const trasAguantar = await pag.evaluate(() => window.probe.menu.estado());
const abiertas = (trasAguantar?.aperturas ?? 0) - (cerradoAntes?.aperturas ?? 0);
console.log(`  aguantando la Escape 600 ms: el menú se abrió ${abiertas} vez/veces ` +
  `y acabó ${trasAguantar?.abierto ? "abierto" : "cerrado"}`);
control("aguantar la Escape abre el menú UNA vez y no lo alterna", abiertas === 1,
  `${abiertas} aperturas`);
control("y se queda abierto, que es lo que el jugador pidió", trasAguantar?.abierto === true,
  String(trasAguantar?.abierto));

// ── 5. Y CON EL MENÚ ABIERTO EL RATÓN ES DEL MENÚ ──────────────────────────
//
// El fallo 2, y aquí es donde se veía: en pantalla completa el puntero seguía
// en el `canvas`, así que el menú se pintaba entero y no se podía pulsar nada.
const conMenu = await pag.evaluate(() => ({
  abierto: window.probe.menu.estado()?.abierto ?? null,
  puntero: window.probe.navegador.puntero(),
  completa: window.probe.navegador.pantallaCompleta(),
}));
console.log(`  con el menú abierto en pantalla completa: puntero en ${conMenu.puntero ?? "nadie"}`);
control("sigue en pantalla completa mientras se mira el menú", conMenu.completa,
  String(conMenu.completa));
control("con el menú abierto el puntero NO está en el canvas", conMenu.puntero === null,
  String(conMenu.puntero));
await foto("2-menu");

// Y SE PUEDE PULSAR, que es lo que el jugador quería hacer. Un clic de ratón de
// verdad sobre la entrada, no un `.click()` de guion: el sintético no lleva
// activación del usuario y además pasaría por encima del fallo.
const antesDeClic = await pag.evaluate(() => {
  const e = window.probe.menu.estado();
  return { abierto: e?.abierto, opciones: e?.opciones?.map((o) => o.texto) ?? [] };
});
const caja = await pag.evaluate(() => {
  const b = [...document.querySelectorAll(".ms-menu-op")].find((x) => x.dataset.que === "cerrar");
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, texto: b.textContent };
});
console.log(`  «${caja?.texto ?? "?"}» está en ${caja ? `${Math.round(caja.x)},${Math.round(caja.y)}` : "ningún sitio"}`);
control("el menú en juego ofrece la entrada que cierra el menú", Boolean(caja),
  antesDeClic.opciones.join(" · "));
if (caja) {
  await pag.mouse.click(caja.x, caja.y);
  await pag.waitForTimeout(300);
  const tras = await pag.evaluate(() => ({
    abierto: window.probe.menu.estado()?.abierto ?? null,
    puntero: window.probe.navegador.puntero(),
  }));
  console.log(`  tras el clic: menú ${tras.abierto ? "abierto" : "cerrado"}, ` +
    `puntero en ${tras.puntero ?? "nadie"}`);
  control("un clic de ratón de verdad cierra el menú en pantalla completa",
    tras.abierto === false, String(tras.abierto));
  // Y al cerrarse, el juego recupera el ratón: es `UpdateCursorState`.
  control("y al cerrarse el juego recupera el puntero", tras.puntero === "CANVAS",
    String(tras.puntero));
}

// ── 6. SALIR DE PANTALLA COMPLETA SUELTA EL TECLADO ────────────────────────
//
// Sin esto `tecladoAtrapado()` se quedaría diciendo que sí y el aviso de Ctrl+W
// no volvería a salir nunca, que es justo cuando hace falta otra vez.
await pag.evaluate(() => document.exitFullscreen?.());
await pag.waitForTimeout(600);
const fuera = await pag.evaluate(() => ({
  atrapado: window.probe.navegador.atrapado(),
  completa: window.probe.navegador.pantallaCompleta(),
}));
console.log(`  al salir: pantalla completa ${fuera.completa}, teclado atrapado ${fuera.atrapado}`);
control("salir de pantalla completa la deja", !fuera.completa, String(fuera.completa));
control("y suelta el teclado, que nadie nos avisa", !fuera.atrapado, String(fuera.atrapado));

// ── 7. Y FUERA DE ELLA LA ESCAPE SIGUE SIENDO UNA TECLA NORMAL ─────────────
//
// El positivo del control 4: el arreglo es del `keydown` repetido, no de la
// pantalla completa, así que fuera de ella un toque tiene que seguir abriendo.
await pag.keyboard.press("Escape");
await pag.waitForTimeout(250);
const tocada = await pag.evaluate(() => window.probe.menu.estado()?.abierto ?? null);
control("fuera de pantalla completa un toque de Escape abre el menú", tocada === true,
  String(tocada));
await pag.keyboard.press("Escape");
await pag.waitForTimeout(250);
const cerrada = await pag.evaluate(() => window.probe.menu.estado()?.abierto ?? null);
control("y otro lo cierra", cerrada === false, String(cerrada));

// ── 8. POR DÓNDE ENTRA EL JUGADOR, QUE YA NO ES POR DONDE ENTRAN LAS SONDAS ─
//
// Las 22 sondas abren `?map=gatecity`, que es `hl.exe +map` y entra sin pasar por
// el menú. Desde el experimento 36 **el jugador no entra por ahí**: entra por el
// menú. O sea que la regla del proyecto —«la sonda recorre el mismo camino que
// recorre el jugador»— se rompió el día que se cambió por dónde se entra, y no
// se rompió en una sonda: se rompió en todas a la vez, sin que ninguna se
// pusiera roja. Por eso esto abre una SEGUNDA página sin `?map=` y va andando.
//
// Lo que se busca aquí es el modelo animado de la pantalla de personajes, que el
// jugador dice que desapareció. `Retratos.montar()` se rinde en silencio si la
// caja mide 0x0 (`src/render/retratos.js:78`), y una caja mide 0x0 justo cuando
// está escondida — que es lo que le pasa a un panel que se monta detrás de un
// menú que lo tapa.
const pag2 = await nav.newPage({ viewport: { width: 1200, height: 800 } });
const errores2 = [];
pag2.on("pageerror", (e) => errores2.push(String(e).slice(0, 200)));
// Y los AVISOS de consola, que aquí hacen falta: los modelos del personaje se
// cargan con un `catch` que sólo hace `console.warn` y devuelve `null`
// (`src/main.js:386`), así que sin esto el fallo es invisible para la sonda.
const quejas = [];
pag2.on("console", (m) => { if (m.type() === "warning" || m.type() === "error") quejas.push(m.text().slice(0, 200)); });
await pag2.goto(`http://localhost:${PORT}/`, { waitUntil: "load" });
await pag2.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
await pag2.waitForTimeout(1200);

const alArrancar = await pag2.evaluate(() => ({
  menu: window.probe.menu.estado()?.abierto ?? null,
  panel: window.probe.vgui.abierto(),
}));
console.log(`\n  sin \`?map=\`: menú ${alArrancar.menu ? "abierto" : "cerrado"}, ` +
  `panel de VGUI ${alArrancar.panel ?? "ninguno"}`);
control("sin `?map=` el juego abre en el menú principal", alArrancar.menu === true,
  String(alArrancar.menu));

// «Establish a Kingdom» con un clic de ratón de verdad, y luego «Start».
const entrada = await pag2.evaluate(() => {
  const b = [...document.querySelectorAll(".ms-menu-op")].find((x) => x.dataset.que === "crearPartida");
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
control("el menú ofrece «Establish a Kingdom»", Boolean(entrada));
if (entrada) {
  await pag2.mouse.click(entrada.x, entrada.y);
  await pag2.waitForTimeout(600);
  const start = await pag2.evaluate(() => {
    const b = [...document.querySelectorAll("button, .vg2-boton")]
      .find((x) => (x.textContent ?? "").trim() === "Start");
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  control("y la ventana de Valve trae su «Start»", Boolean(start));
  if (start) {
    await pag2.mouse.click(start.x, start.y);
    // El mapa ya estaba cargado por detrás, pero la pantalla de personajes
    // tarda en montar sus tres modelos: son tres esqueletos y un `.mdl`.
    await pag2.waitForTimeout(3000);
    const tras = await pag2.evaluate(() => ({
      menu: window.probe.menu.estado()?.abierto ?? null,
      panel: window.probe.vgui.abierto(),
      lienzos: document.querySelectorAll(".vg-char-retrato").length,
      // `c.width > 0` NO SIRVE: un `<canvas>` recién creado mide 300x150 por
      // definición del elemento, así que ese control está verde con el retrato
      // sin montar. Es el mismo error que el positivo del agua, y esta vez
      // tapaba justo lo que el jugador vino a decir que estaba roto.
      // `sondas/personaje30.mjs:98` lo mira igual y también está vacío.
      medidos: [...document.querySelectorAll(".vg-char-retrato")].map((c) => {
        const r = c.parentElement?.getBoundingClientRect();
        return { w: c.width, h: c.height, cajaW: Math.round(r?.width ?? 0), cajaH: Math.round(r?.height ?? 0) };
      }),
      retratosVivos: window.probe.vgui.retratosVivos?.() ?? null,
    }));
    console.log(`  lienzos: ${tras.medidos.map((m) => `${m.w}x${m.h} en caja ${m.cajaW}x${m.cajaH}`).join(" · ")}`);
    tras.conTamano = tras.medidos.filter((m) => m.cajaW > 0 && m.cajaH > 0).length;
    console.log(`  tras «Start»: menú ${tras.menu ? "abierto" : "cerrado"}, panel ${tras.panel}, ` +
      `${tras.conTamano} de ${tras.lienzos} lienzos con tamaño, ${tras.retratosVivos} retratos vivos`);
    control("«Start» cierra el menú", tras.menu === false, String(tras.menu));
    control("y saca la pantalla de personajes", tras.panel === "newchar", String(tras.panel));
    control("con sus tres lienzos", tras.lienzos >= 3, `${tras.lienzos}`);
    // EL CONTROL QUE EL JUGADOR PIDIÓ. Un lienzo de 0x0 está en la página, se
    // cuenta y no se ve: por eso no basta con contar lienzos.
    control("y los tres modelos montados y con tamaño, no lienzos vacíos",
      tras.conTamano >= 3, `${tras.conTamano} de ${tras.lienzos}`);
    control("y los tres animándose de verdad", (tras.retratosVivos ?? 0) >= 3,
      `${tras.retratosVivos}`);
    await pag2.waitForTimeout(300);
    await pag2.screenshot({ path: "build/gatecity/vistas/pantalla38-3-personajes.png" });
  }
}
if (quejas.length) console.log(`  quejas de consola: ${quejas.join(" | ")}`);

// ── 8b. Y «DISCONNECT» VUELVE AL MENÚ PRINCIPAL ────────────────────────────
//
// Lo que había mandaba a la pantalla de personajes y dejaba el mapa detrás,
// porque no soltaba el personaje. Se entra a jugar de verdad primero: sin una
// partida, «Disconnect» no sale en el menú.
const jugando = await pag2.evaluate(async () => {
  // Un personaje y dentro, que es lo que el jugador haría eligiendo ranura.
  await window.probe.sesion.nuevo("Sonda38");
  await new Promise((r) => setTimeout(r, 800));
  return { estado: window.probe.sesion.estado(), panel: window.probe.vgui.abierto() };
});
console.log(`  jugando: estado ${jugando.estado}, panel ${jugando.panel ?? "ninguno"}`);
control("se llega a jugar entrando por el menú", jugando.estado === "jugando", jugando.estado);
await pag2.keyboard.press("Escape");
await pag2.waitForTimeout(300);
const conDesconectar = await pag2.evaluate(() => {
  const b = [...document.querySelectorAll(".ms-menu-op")].find((x) => x.dataset.que === "desconectar");
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
control("con partida, el menú ofrece «Disconnect»", Boolean(conDesconectar));
if (conDesconectar) {
  await pag2.mouse.click(conDesconectar.x, conDesconectar.y);
  await pag2.waitForTimeout(800);
  const tras = await pag2.evaluate(() => ({
    menu: window.probe.menu.estado(),
    estado: window.probe.sesion.estado(),
    panel: window.probe.vgui.abierto(),
  }));
  console.log(`  tras «Disconnect»: menú ${tras.menu?.abierto ? "abierto" : "cerrado"} ` +
    `(enJuego ${tras.menu?.enJuego}), sesión ${tras.estado}, panel ${tras.panel ?? "ninguno"}`);
  control("«Disconnect» deja el MENÚ PRINCIPAL delante", tras.menu?.abierto === true,
    String(tras.menu?.abierto));
  control("y no la pantalla de personajes", tras.panel !== "newchar", String(tras.panel));
  // Lo que delata que el mapa se quedó: si `enJuego` sigue puesto, el menú
  // ofrece «Resume game» y el personaje nunca se soltó.
  control("y el menú ya no ofrece volver a una partida que no existe",
    tras.menu?.enJuego === false, `enJuego ${tras.menu?.enJuego}`);
  control("y la sesión ha soltado el personaje", tras.estado !== "jugando", String(tras.estado));
  await pag2.screenshot({ path: "build/gatecity/vistas/pantalla38-5-desconectar.png" });
}
for (const e of errores2) errores.push(`(entrando por el menú) ${e}`);

// ── 9. Y LO MISMO ENTRANDO POR `?map=`, QUE ES EL CONTROL QUE DECIDE ───────
//
// Si los retratos se montan entrando por `?map=` y no entrando por el menú, el
// fallo es del camino nuevo. Si no se montan por ninguno de los dos, lleva roto
// desde antes y lo que pasa es que **nadie lo estaba mirando**: el único control
// que había —`sondas/personaje30.mjs:98`, «hay un lienzo por ranura»— cuenta
// `canvas.width > 0`, y un `<canvas>` mide 300x150 sin que nadie lo toque.
const pag3 = await nav.newPage({ viewport: { width: 1200, height: 800 } });
await pag3.goto(`http://localhost:${PORT}/?map=gatecity`, { waitUntil: "load" });
await pag3.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
await pag3.waitForTimeout(3000);
const porMapa = await pag3.evaluate(() => ({
  panel: window.probe.vgui.abierto(),
  vivos: window.probe.vgui.retratosVivos?.() ?? null,
  lienzos: [...document.querySelectorAll(".vg-char-retrato")].map((c) => `${c.width}x${c.height}`),
}));
console.log(`  con \`?map=\`: panel ${porMapa.panel}, ${porMapa.vivos} retratos vivos, ` +
  `lienzos ${porMapa.lienzos.join(" ")}`);
control("con `?map=` también sale la pantalla de personajes", porMapa.panel === "newchar",
  String(porMapa.panel));
control("y por AHÍ los retratos sí se montan", (porMapa.vivos ?? 0) >= 3, `${porMapa.vivos}`);
await pag3.screenshot({ path: "build/gatecity/vistas/pantalla38-4-por-mapa.png" });

// ── LOS CONTROLES ──────────────────────────────────────────────────────────
console.log("\n  CONTROLES");
for (const c of controles) {
  console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(64)} ${c.detalle}`);
}
const verdes = controles.filter((c) => c.bien).length;
console.log(`\n  ${verdes} de ${controles.length} en verde`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);

await nav.close();
matar(dev);
process.exit(verdes === controles.length && !errores.length ? 0 : 1);
