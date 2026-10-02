// LAS VENTANAS DE VALVE, en un Chrome de verdad.
//
//   npm run sonda:vgui2_34
//
// `npm test` comprueba 39 cosas del esquema y de los ajustes: que el alfa va al
// derecho, que la letra se elige por la altura, que los valores por defecto
// salen del `config.cfg`. Ninguna de esas 39 dice que la ventana se vea, y
// menos aún que se vea CON LA LETRA DEL JUEGO, que es lo único que el usuario
// pidió: que combine.
//
// ── La sonda no abre: pulsa ───────────────────────────────────────────────
//
// La ventana se abre con la **G**, que es la acción `opciones` del `config.cfg`,
// pulsada con el teclado del navegador. Ni un control llama a `abrirOpciones()`
// para abrir la primera vez: ésa es la forma de que todo esto salga verde sin
// haber probado que el jugador pueda llegar, y fue el agujero que tuvo esta
// sonda mientras `src/main.js` lo tenía otra sesión.
//
// Las formas de que esto esté verde midiendo nada:
//
//   1. la ventana se abre y no se ve            -> medir el DOM, no el objeto
//   2. se ve con la letra de Chrome             -> medir la familia computada
//   3. la barra de título es una banda gris     -> medir el alfa del fondo
//   4. las pestañas son botones                 -> pulsar una y ver que cambia
//   5. el texto lo hemos escrito nosotros       -> tiene que salir del archivo
//   6. los valores son bonitos redondos         -> tienen que ser los del config.cfg
//   7. los controles apagados se pueden usar    -> ÉSE es el control positivo
//   8. Cancel no deshace nada                   -> cambiar, cancelar, comprobar
//   9. la Escape cierra las dos de golpe        -> tiene que cerrar la de arriba

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";
import { mkdirSync } from "node:fs";

const PORT = 5219;
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (habia ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { shell: true, stdio: "ignore" });
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
await new Promise((r) => setTimeout(r, 6000));

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });
const errores = [];
let nav = null;

try {
  nav = await chromium.launch();
  const ANCHO = 1200, ALTO = 800;
  const pag = await nav.newPage({ viewport: { width: ANCHO, height: ALTO } });
  pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
  // SE ENTRA POR EL MENÚ, como el jugador (57). Antes era `?map=gatecity`,
  // que se salta el menú: carga el nivel y arranca la sesión de una pasada,
  // que es un montaje que el jugador no ve nunca. Ver `sondas/entrar.mjs`.
  // CON VGUI2 FORZADO, y no por comodidad.
  //
  // Desde el 73 el aspecto de por omisión es el códice (`src/vgui2/codice.js`),
  // que no tiene barra de título. Casi todo lo que mide esta sonda es la
  // FIDELIDAD del port de `TrackerScheme.res` —Verdana, 13 px, `ControlBG` negro
  // al 50 %, el alfa 0 de `TitleBG`, el bisel, los 535 px de la captura—, y eso
  // son hechos citados que siguen siendo verdad aunque el menú se dibuje hoy
  // como un libro. Sin esto la sonda se cae en `getComputedStyle(null)` y la
  // medición se pierde para siempre. El códice tiene su propio bloque al final.
  await entrarPorElMenu(pag, PORT, { extra: "aspecto=vgui" });
  mkdirSync("build/gatecity/vistas", { recursive: true });

  // Se espera al juego entero: la gracia es ver la ventana ENCIMA del juego,
  // que es de lo que iba el encargo.
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
  await pag.waitForFunction(() => window.probe.vgui.abierto() === null, null, { timeout: 60000 });
  await pag.evaluate(() => window.probe.vivo.congelarPaseo(true));
  await pag.evaluate(() => window.probe.hud.avanzar(20));

  // ── 0. EL CONTROL POSITIVO DEL PUNTERO, ANTES DE ABRIR NADA ──────────────
  //
  // Sin esto, «el puntero se suelta al abrir» saldría en verde en un navegador
  // que no lo hubiera atrapado nunca, que es la forma más fácil de que este
  // experimento entero mida cero. Lo sugirió la otra sesión y tiene razón.
  const antesDeAbrir = await pag.evaluate(() => document.pointerLockElement?.tagName ?? null);
  control("CONTROL POSITIVO: jugando, el puntero es del lienzo",
    antesDeAbrir === "CANVAS", `pointerLockElement: ${antesDeAbrir}`);

  // ── 1. LA TECLA DEL JUEGO ABRE LA VENTANA ────────────────────────────────
  //
  // Esto era el agujero de la primera versión de esta sonda: la capa se montaba
  // desde aquí y nadie comprobaba que el jugador pudiera llegar. Ya no.
  //
  // Se pulsa la **G**, que es la acción `opciones` del `config.cfg`
  // (`src/juego/teclas.js`), con el teclado del navegador. La sonda NO llama a
  // `abrirOpciones()` para abrir la primera vez, que es la forma de que esto
  // salga verde sin probar la tecla.
  await pag.keyboard.press("KeyG");
  await pag.waitForTimeout(300);
  const montada = await pag.evaluate(() => {
    // `main.js` la guarda; la sonda la lee, no la crea.
    window.__v2 = window.probe.vgui2;
    return window.probe.vgui2.estado();
  });
  control("LA G DEL JUEGO ABRE «OPTIONS», sin que la sonda la abra",
    montada?.abiertas === 1 && !!montada?.opciones,
    JSON.stringify(montada?.opciones?.pestanas ?? null));
  control("y lo hace con el esquema HORNEADO del juego, no con el de repuesto",
    montada.conFicha === true, `conFicha ${montada.conFicha}`);

  // ── 1. LAS SIETE PESTAÑAS, EN SU ORDEN ───────────────────────────────────
  const pestanas = await pag.$$eval(".v2-pestana", (ns) => ns.map((n) => n.textContent));
  control("las siete pestañas de la captura, en el orden de la captura",
    JSON.stringify(pestanas) === JSON.stringify(
      ["Multiplayer", "Keyboard", "Mouse", "Audio", "Video", "Voice", "Lock"]),
    pestanas.join(" · "));

  // ── 2. EL ASPECTO: que COMBINE, que era el encargo ───────────────────────
  const aspecto = await pag.evaluate(() => {
    const v = document.querySelector(".v2-ventana");
    const barra = document.querySelector(".v2-titulo");
    const cv = getComputedStyle(v), cb = getComputedStyle(barra);
    return {
      letra: cv.fontFamily, tamano: cv.fontSize, peso: cv.fontWeight,
      fondo: cv.backgroundColor, borde: cv.boxShadow,
      tituloFondo: cb.backgroundColor,
      ancho: v.getBoundingClientRect().width,
    };
  });
  control("la letra es la del juego, Verdana, no una del navegador",
    /Verdana/i.test(aspecto.letra), `${aspecto.peso} ${aspecto.tamano} ${aspecto.letra}`);
  // Y el tamaño NO cambia con la pantalla, que es lo contrario de lo que hace el
  // HUD. La fuente de las ventanas es `Default` —«Verdana Bold» 13, sin `yres`
  // (TrackerScheme.res:192-200)—, así que mide 13 px a cualquier resolución. La
  // que escala por rangos es `EngineFont`, que es la del motor, no la de los
  // diálogos. Se comprobó midiendo: esta sonda pedía 14 y salían 13.
  control("y mide 13 px, porque la letra de los diálogos NO escala",
    aspecto.tamano === "13px", `${aspecto.tamano} a ${ALTO} px de alto (Default, sin yres)`);
  control("EL FONDO DEJA VER EL JUEGO: ControlBG es negro al 50 %",
    /^rgba\(0, 0, 0, 0\.5/.test(aspecto.fondo), aspecto.fondo);
  control("LA BARRA DE TÍTULO NO ES UNA BANDA GRIS: TitleBG tiene el alfa a 0",
    /rgba\(206, 206, 206, 0\)|transparent/.test(aspecto.tituloFondo), aspecto.tituloFondo);
  control("el marco lleva el bisel del esquema y no un borde de CSS",
    aspecto.borde.includes("inset") && aspecto.borde.split("inset").length >= 4,
    `${aspecto.borde.split("inset").length - 1} trazos`);
  control("y mide lo medido de la captura",
    Math.abs(aspecto.ancho - 535) <= 1, `${Math.round(aspecto.ancho)} px`);

  // ── 3. EL PUNTERO: sin esto no se puede pulsar NADA ──────────────────────
  //
  // El juego captura el ratón sobre el lienzo. Con el puntero bloqueado el
  // navegador manda todos los clics al lienzo, pase lo que pase por encima: la
  // ventana se ve perfecta y no responde. Lo encontró esta sonda quedándose
  // colgada en «performing click action».
  //
  // La sonda NO lo suelta ella: eso taparía el fallo. Tiene que soltarlo la
  // ventana al abrirse, y esto lo comprueba.
  const puntero = await pag.evaluate(() => document.pointerLockElement?.tagName ?? null);
  control("EL PUNTERO SE SUELTA AL ABRIR: si no, la ventana no se puede pulsar",
    puntero === null, `pointerLockElement: ${puntero}`);

  // ── 4. UNA PESTAÑA SE PULSA CON EL RATÓN ─────────────────────────────────
  await pag.click(".v2-pestana:nth-child(3)");          // Mouse
  const enMouse = await pag.evaluate(() => window.probe.vgui2.estado().opciones.pestana);
  control("pulsar una pestaña con el ratón cambia de página", enMouse === "Mouse", enMouse);

  // ── 4. EL TEXTO SALE DEL ARCHIVO DEL JUEGO, no de nuestra cabeza ────────
  const textos = await pag.$$eval(".v2-hoja", (ns) => ns[0].innerText);
  control("y lo que pone es lo de gameui_english.txt, letra por letra",
    textos.includes("Reverse mouse up-down axis") && textos.includes("Smooth out mouse movement"),
    textos.split("\n").filter(Boolean).slice(0, 2).join(" / "));

  // ── 5. LOS VALORES SON LOS DEL config.cfg ────────────────────────────────
  const sens = await pag.evaluate(() => {
    const caja = [...document.querySelectorAll(".v2-entrada")].pop();
    return { valor: caja?.value, v: window.probe.vgui2.estado().valores.sensibilidad };
  });
  control("la sensibilidad arranca en el 10 del config.cfg, como en la captura",
    sens.valor === "10.0" && sens.v === 10, `caja ${sens.valor}, valor ${sens.v}`);

  // ── 6. EL CONTROL POSITIVO: lo apagado tiene que estar apagado ───────────
  //
  // De los treinta controles, ocho hacen algo. Si los otros veintidós se
  // pudieran usar, la ventana mentiría: parecería que el joystick se enciende.
  // Así que se PULSA uno apagado y tiene que no pasar nada.
  const antesJoystick = await pag.evaluate(() => window.probe.vgui2.estado().opciones.valores.joystick);
  const pulsado = await pag.evaluate(() => {
    const c = [...document.querySelectorAll(".v2-casilla")].find((n) => n.textContent.includes("Joystick"));
    if (!c) return "no encontré la casilla";
    c.click();
    return { desactivada: c.disabled, motivo: c.parentElement?.title ?? "" };
  });
  const despuesJoystick = await pag.evaluate(() => window.probe.vgui2.estado().opciones.valores.joystick);
  control("CONTROL POSITIVO: pulsar un control apagado NO cambia nada",
    antesJoystick === despuesJoystick && pulsado.desactivada === true,
    `${antesJoystick} -> ${despuesJoystick}`);
  control("y el apagado dice por qué lo está, en vez de callarse",
    typeof pulsado.motivo === "string" && pulsado.motivo.length > 20, pulsado.motivo);

  // ── 7. ARRASTRAR EL DESLIZADOR, Y QUE «CANCEL» LO DESHAGA ────────────────
  //
  // El valor se cambia ARRASTRANDO con el ratón, no escribiéndolo en el objeto:
  // así se prueba de paso que el deslizador funciona. Y se cierra con un clic
  // de verdad en «Cancel», que además es un gesto del usuario —lo de escribir
  // el valor a mano y cerrar con `.click()` de guion fue lo que escondió el
  // fallo del puntero la primera vez.
  const caja = await pag.$(".v2-deslizador");
  const r = await caja.boundingBox();
  await pag.mouse.click(r.x + r.width * 0.25, r.y + r.height / 2);
  await pag.waitForTimeout(150);
  const arrastrado = await pag.evaluate(() => window.probe.vgui2.estado().opciones.valores.sensibilidad);
  control("arrastrar el deslizador con el ratón cambia el valor",
    arrastrado !== 10 && arrastrado > 0.2 && arrastrado < 20, `${arrastrado?.toFixed?.(2)}`);

  const botonCancel = await pag.$$(".v2-boton");
  for (const b of botonCancel) {
    if ((await b.textContent()) === "Cancel") { await b.click(); break; }
  }
  await pag.waitForTimeout(200);
  // «Cancel» cierra. Se vuelve a abrir con la G —otra vez la tecla, no el
  // método— y el valor tiene que estar como estaba: sin aplicar, no se guarda.
  await pag.keyboard.press("KeyG");
  await pag.waitForTimeout(300);
  const vaiven = await pag.evaluate(() => window.probe.vgui2.estado().opciones?.valores?.sensibilidad ?? null);
  control("«Cancel» no deja puesto lo que no se aplicó",
    vaiven === 10, `al volver a abrir: ${vaiven}`);

  // ── 8. LA VENTANA DE SERVIDORES ──────────────────────────────────────────
  //
  // «Cancel» acaba de cerrar Options, así que se vuelve a abrir: hacen falta
  // DOS ventanas para que la prueba de la Escape signifique algo.
  await pag.evaluate(() => window.probe.vgui2.servidores());
  await pag.waitForTimeout(150);
  await pag.keyboard.press("KeyG");            // Options encima, con la tecla
  await pag.waitForTimeout(200);
  await pag.waitForTimeout(200);
  const listado = await pag.evaluate(() => {
    const cab = [...document.querySelectorAll(".v2-tabla-cabecera > div")].map((n) => n.textContent);
    const conectar = [...document.querySelectorAll(".v2-boton")].find((n) => n.textContent === "Connect");
    return { cab, conectarApagado: conectar?.disabled, aviso: document.body.innerText.includes("Run `npm run servidor`") };
  });
  control("la lista de servidores sale con sus columnas y su cuenta",
    listado.cab.includes("Servers (0)") && listado.cab.includes("Latency"),
    listado.cab.filter(Boolean).join(" · "));
  control("«Connect» está apagado mientras no hay fila elegida",
    listado.conectarApagado === true, `disabled ${listado.conectarApagado}`);
  control("y una lista vacía DICE POR QUÉ, y dónde mirar",
    listado.aviso === true, "manda a la pestaña Lan y a `npm run servidor`");

  await pag.screenshot({ path: "build/gatecity/vistas/vgui2_34.png" });
  console.log(`    captura         build/gatecity/vistas/vgui2_34.png`);

  // ── 9. LA ESCAPE CIERRA LA DE ARRIBA, NO LAS DOS ─────────────────────────
  const antes = await pag.evaluate(() => window.probe.vgui2.estado().abiertas);
  await pag.keyboard.press("Escape");
  await pag.waitForTimeout(100);
  const despues = await pag.evaluate(() => window.probe.vgui2.estado().abiertas);
  control("la Escape cierra UNA ventana, la de arriba",
    antes === 2 && despues === 1, `${antes} -> ${despues}`);

  // ── 10. Y AL CERRAR LA ÚLTIMA, EL RATÓN VUELVE A SER DEL JUEGO ───────────
  //
  // Es lo que hace el motor: sin menú delante, `UpdateCursorState` llama a
  // `IN_ResetMouse()` en el mismo fotograma
  // (vgui_teamfortressviewport.cpp:1741-1750). No devolverlo deja al jugador sin
  // poder girar hasta que pulse en el mundo.
  //
  // Se hace el camino ENTERO del jugador, y no vale saltárselo: hay que llegar
  // con el puntero puesto. Los pasos de arriba lo han ido soltando —y una de las
  // ventanas se cerró con un `click()` de guion, que NO es un gesto del usuario
  // y por eso el navegador no devolvió nada—, así que primero se vuelve a pulsar
  // en el mundo como haría una persona.
  await pag.keyboard.press("Escape");          // cerrar lo que quede
  await pag.waitForTimeout(150);
  await pag.mouse.click(600, 400);             // clic de verdad en el lienzo
  await pag.waitForTimeout(300);
  const conPuntero = await pag.evaluate(() => document.pointerLockElement?.tagName ?? null);
  control("el clic en el mundo devuelve el puntero al juego",
    conPuntero === "CANVAS", `pointerLockElement: ${conPuntero}`);

  await pag.keyboard.press("KeyG");
  await pag.waitForTimeout(150);
  const prestado = await pag.evaluate(() => window.probe.vgui2.estado());
  control("al abrir se lo queda prestado, y lo apunta para devolverlo",
    prestado.puntero === null && prestado.punteroPrestado === true,
    `puntero ${prestado.puntero}, prestado ${prestado.punteroPrestado}`);

  // La Escape es un gesto del usuario, así que el navegador lo concede. Se pulsa
  // de verdad y se mira `document.pointerLockElement`, no si el juego responde.
  await pag.keyboard.press("Escape");
  await pag.waitForTimeout(400);
  const devuelto = await pag.evaluate(() => window.probe.vgui2.estado());
  control("y al cerrar la ÚLTIMA, el puntero VUELVE al juego",
    devuelto.abiertas === 0 && devuelto.puntero === "CANVAS",
    `abiertas ${devuelto.abiertas}, puntero ${devuelto.puntero}`);

  // ── 11. Y EL JUEGO SIGUE DETRÁS ──────────────────────────────────────────
  const final = await pag.evaluate(() => {
    window.probe.hud.avanzar(1);
    return { hud: window.probe.hud.estado().visible, abiertas: window.probe.vgui2.estado().abiertas };
  });
  control("el HUD del juego sigue en pie con la ventana delante",
    final.hud === true, JSON.stringify(final));
  // (el HUD se mide con la ventana ya cerrada: lo que importa es que el juego
  //  no se haya quedado tocado por la ida y vuelta del puntero)

  // ── 9. EL CÓDICE: que quite LAS TRES, y no sólo repinte ──────────────────
  //
  // El 73 empezó con tres estilos y el jugador vio que eran el mismo esqueleto:
  // caja con barra de título, pestañas en fila y OK/Cancel/Apply. El códice
  // existe para quitar las tres, así que lo que hay que medir son las tres, y
  // no un color — un color lo pone el tema y no demuestra nada estructural.
  //
  // El CONTROL POSITIVO es todo el bloque 2 de más arriba: con `?aspecto=vgui`
  // la barra de título existe, mide 535 px y es Verdana. Si estas afirmaciones
  // salieran verdes por no estar mirando nada, aquéllas habrían salido rojas.
  // Se recarga en la PRIMERA PANTALLA y no con `entrarPorElMenu`, que termina
  // dentro del mapa: al volver de ahí el menú está cerrado y el clic se queda
  // esperando a un botón que existe y no se puede pulsar. Y la primera pantalla
  // es el menú desde el 36, así que esto sigue siendo el camino del jugador.
  await pag.goto(`http://localhost:${PORT}/?aspecto=codice`, { waitUntil: "load" });
  await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
  await pag.locator(".ms-menu-op").filter({ hasText: /^Options$/ }).click();
  await pag.waitForSelector(".v2-ventana");
  const libro = await pag.evaluate(() => {
    const cintas = [...document.querySelectorAll(".v2-pestana")];
    const caja = (n) => n.getBoundingClientRect();
    return {
      aspecto: window.probe.vgui2.estado().aspecto,
      barras: document.querySelectorAll(".v2-titulo").length,
      cintas: cintas.length,
      // En columna: la segunda está DEBAJO de la primera y empieza a su misma
      // izquierda. En fila sería al revés, y es lo que distingue las dos.
      enColumna: cintas.length > 1
        && caja(cintas[1]).top > caja(cintas[0]).bottom - 1
        && Math.abs(caja(cintas[1]).left - caja(cintas[0]).left) < 1,
      botones: [...document.querySelectorAll(".v2-boton")].map((b) => b.textContent),
    };
  });
  control("el códice está puesto y lo dice la capa, no el color de un píxel",
    libro.aspecto === "codice", `aspecto ${libro.aspecto}`);
  control("1 · NO hay barra de título: un libro no se arrastra por su cabecera",
    libro.barras === 0, `${libro.barras} barras de título`);
  control("2 · las siete pestañas son CINTAS en columna, no una fila",
    libro.cintas === 7 && libro.enColumna === true,
    `${libro.cintas} cintas, en columna: ${libro.enColumna}`);
  control("3 · NO hay OK/Cancel/Apply: lo que se toca ya está aplicado",
    !libro.botones.some((t) => /^(OK|Cancel|Apply)$/.test(t ?? ""))
      && libro.botones.some((t) => t === "Done"),
    `botones: ${libro.botones.join(" · ") || "ninguno"}`);
} catch (e) {
  errores.push(`la sonda se cayó: ${String(e).slice(0, 300)}`);
}

console.log("\n  CONTROLES");
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(66)} ${c.detalle}`);
const mal = controles.filter((c) => !c.bien);
console.log(`\n  ${controles.length - mal.length} de ${controles.length} en verde`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);
console.log("");

await nav?.close();
matar(dev);
process.exit(mal.length || errores.length || !controles.length ? 1 : 0);
