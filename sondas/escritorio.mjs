// LA SONDA DE LA CÁSCARA DE ESCRITORIO.
//
//   npm run sonda:escritorio
//
// Abre el juego dentro de Electron de verdad —no un Chromium, el binario de
// Electron con su proceso principal— y mide **lo único que justifica la
// mudanza: que las teclas llegan**.
//
// ── Por qué esto no lo puede medir una prueba de Node ──────────────────────
//
// Porque lo que se afirma es que `Menu.setApplicationMenu(null)` hace que F12 y
// Ctrl+W lleguen a la página en vez de quedárselos la ventana. Eso no es una
// función que devuelva un valor: es un reparto entre dos procesos. El único
// instrumento que lo ve es una ventana abierta con alguien escuchando dentro.
//
// ── LA TRAMPA EN LA QUE ESTA SONDA YA CAYÓ UNA VEZ ─────────────────────────
//
// La primera versión mandaba F12 y Ctrl+W con `pag.keyboard.press()`, miraba
// que llegaran a la página y se declaraba verde. Lo era. **También lo era con
// `Menu.setApplicationMenu(null)` quitado**, que es el arreglo que decía estar
// comprobando.
//
// El motivo, y la prueba de que es así está en el propio resultado de aquella
// pasada: con el menú por omisión puesto, Ctrl+W **no cerró la ventana**. Las
// teclas de Playwright viajan por el protocolo de depuración y entran
// directamente en el renderizador; **no pasan por los aceleradores de la
// ventana**, que son justo lo que el menú instala y lo que había que vencer. El
// mecanismo bajo prueba no llegaba a dispararse, el control leía el valor de
// reposo —«el renderizador recibe eventos sintéticos», que es siempre cierto— y
// el valor de reposo pasaba.
//
// Lo que se hace ahora, que es honrado y falsable:
//
//   1. **Se mide la CAUSA en el proceso principal**: que no hay menú de
//      aplicación. Eso se pregunta con `app.evaluate()`, se pone rojo en cuanto
//      alguien borra la línea, y es la afirmación que de verdad se sostiene.
//   2. Los controles de teclas se quedan, pero **diciendo lo que miden**: que
//      el camino hasta el juego está montado y las teclas de función no las
//      filtra nadie por el camino. No que se hayan vencido los aceleradores.
//   3. Y lo que no se puede medir aquí se **declara pendiente** en vez de
//      contarse entre los verdes.

import { _electron as electron } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const PROYECTO = join(AQUI, "..");

const controles = [];
const control = (que, bien, detalle = "") => {
  controles.push({ que, bien: Boolean(bien), detalle });
  console.log(`  ${bien ? "ok  " : "MAL "} ${que}${detalle ? ` — ${detalle}` : ""}`);
};

let app;
try {
  // `ELECTRON_RUN_AS_NODE` tiene que salir del entorno o el binario arranca
  // como un Node pelado, sin ventana. La hereda cualquier terminal integrado de
  // una aplicación hecha con Electron —VS Code, sin ir más lejos—, así que no
  // vale con suponer que no está. Ver la cabecera de `escritorio/main.cjs`.
  const entorno = { ...process.env };
  const venia = entorno.ELECTRON_RUN_AS_NODE;
  delete entorno.ELECTRON_RUN_AS_NODE;
  if (venia) console.log(`  (venía ELECTRON_RUN_AS_NODE=${venia}; se quita para esta sonda)\n`);

  app = await electron.launch({
    args: [join(PROYECTO, "escritorio", "main.cjs")],
    cwd: PROYECTO,
    env: entorno,
    timeout: 120_000,
  });

  const pag = await app.firstWindow({ timeout: 120_000 });
  await pag.waitForLoadState("domcontentloaded");

  // SE LE CORTA EL HMR A VITE, y no por comodidad.
  //
  // Esta sonda mide la rama de DESARROLLO, y ésa levanta Vite de verdad
  // (`levantarVite` en `escritorio/main.cjs`) sin desactivarle nada. Con varias
  // sesiones guardando sobre el mismo árbol, **Vite recarga la página a mitad
  // de pasada**: `window.probe` desaparece y salen `TypeError`s y controles
  // rojos con el juego perfectamente bien.
  //
  // Y lo grave no es el rojo, es lo contrario: **una página que se recarga a
  // mitad está midiendo dos versiones del código a la vez**, y eso puede salir
  // VERDE sin que ninguna de las dos lo esté.
  //
  // El filtro es por SUBPROTOCOLO, así que el WebSocket del multijugador pasa
  // entero: lo único que se corta es el canal de recarga. La idea viene de otra
  // sesión; el proyecto ya hacía lo mismo por el otro lado desde el 57, donde
  // las sondas que montan Vite ellas mismas le pasan `hmr: false`.
  //
  // LÍMITE, dicho aquí: `addInitScript` se aplica a los documentos SIGUIENTES,
  // y esta sonda recibe la ventana ya cargada. Si una recarga llega entre el
  // arranque y esta línea, esa primera se cuela; a partir de ahí no hay más,
  // porque el documento nuevo ya nace sin canal.
  await pag.addInitScript(() => {
    const Real = window.WebSocket;
    window.WebSocket = function (url, protos) {
      const esHmr = protos === "vite-hmr"
        || (Array.isArray(protos) && protos.includes("vite-hmr"));
      if (!esHmr) return new Real(url, protos);
      return { close() {}, send() {}, addEventListener() {}, removeEventListener() {}, readyState: 3 };
    };
  });

  // ── 1. La ventana es el juego, y no una pantalla de error ───────────────
  control("la ventana abre el juego",
    /Master Sword/i.test(await pag.title()),
    `título: «${await pag.title()}»`);

  control("y el lienzo de Three.js está montado con tamaño de verdad",
    await pag.evaluate(() => {
      const c = document.querySelector("#view");
      // No vale `c.width > 0`: un `<canvas>` recién creado mide 300x150 por
      // definición, y eso ya salió verde una vez sin nada dentro (el 38). Lo
      // que se pregunta es si está EN PANTALLA y con la medida de la ventana.
      if (!c) return false;
      const caja = c.getBoundingClientRect();
      return caja.width > 800 && caja.height > 400;
    }),
    "medido sobre el rectángulo en pantalla, no sobre `canvas.width`");

  // ── 2. El puente de la precarga ─────────────────────────────────────────
  const puente = await pag.evaluate(() => globalThis.escritorio ?? null);
  control("`window.escritorio` existe: el juego sabe que no está en un navegador",
    puente && typeof puente.electron === "string",
    puente ? `Electron ${puente.electron}, Chrome ${puente.chrome}` : "no está");

  control("y no se ha colado Node en la página",
    await pag.evaluate(() => typeof globalThis.require === "undefined"
      && typeof globalThis.process === "undefined"),
    "`require` y `process` no existen en el renderizador");

  // ── 3. LAS TECLAS, que es el motivo de todo esto ────────────────────────
  //
  // Se escucha en captura y sobre `window`, que es donde escucha el juego, y se
  // apunta lo que llega. Después se comparan las que el navegador se queda con
  // una que no se queda nadie.
  await pag.evaluate(() => {
    globalThis.__llegaron = [];
    addEventListener("keydown", (e) => {
      globalThis.__llegaron.push({
        code: e.code, ctrl: e.ctrlKey, cancelable: e.cancelable,
      });
    }, true);
  });
  await pag.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});

  // Las cinco de función que el navegador se queda (`navegador.js:RESERVADAS`)
  // y que aquí son ranuras rápidas de Master Sword.
  for (const t of ["F1", "F3", "F5", "F11", "F12"]) await pag.keyboard.press(t);
  // Y Ctrl+W, que es `+duck` + `+forward`: agacharse y avanzar.
  await pag.keyboard.press("Control+w");
  // EL CONTROL NEGATIVO: una tecla que nadie se queda nunca. Si ésta tampoco
  // llegara, el fallo sería del instrumento —el oyente, el foco, la ventana— y
  // no de las teclas reservadas. Sin ella, un cero no diría nada.
  await pag.keyboard.press("KeyG");

  const llegaron = await pag.evaluate(() => globalThis.__llegaron);
  const vino = (code) => llegaron.some((k) => k.code === code);

  control("CONTROL NEGATIVO: una tecla cualquiera llega (el instrumento ve)",
    vino("KeyG"),
    `${llegaron.length} eventos recogidos`);

  const funcion = ["F1", "F3", "F5", "F11", "F12"];
  const faltan = funcion.filter((t) => !vino(t));
  control("el camino hasta el juego no filtra las de función (F1..F12)",
    faltan.length === 0,
    faltan.length ? `faltan ${faltan.join(", ")}` : "las cinco llegan; NO prueba los aceleradores");

  const ctrlW = llegaron.find((k) => k.code === "KeyW" && k.ctrl);
  control("Ctrl+W llega a la página y es cancelable",
    ctrlW && ctrlW.cancelable,
    ctrlW ? "con `cancelable: true`; NO prueba los aceleradores" : "no llegó");

  // ── 4. LA CAUSA, preguntada en el proceso principal ─────────────────────
  //
  // Éste es el control que de verdad sostiene la afirmación del experimento, y
  // el único de la sonda que se pone rojo si alguien borra la línea. Se
  // pregunta donde vive la respuesta: el proceso principal de Electron.
  const menu = await app.evaluate(({ Menu }) => {
    const m = Menu.getApplicationMenu();
    return { hay: m !== null, cuantos: m ? m.items.length : 0 };
  });
  control("NO hay menú de aplicación: nadie se reserva F12 ni Ctrl+W",
    menu.hay === false,
    menu.hay
      ? `hay un menú con ${menu.cuantos} entradas, y sus aceleradores ganan a la página`
      : "`Menu.getApplicationMenu()` es null");

  control("y la ventana sigue viva después de todo",
    (await app.windows()).length === 1);

  // ── 5. «QUIT», QUE SÓLO EXISTE AQUÍ (el 73) ─────────────────────────────
  //
  // Llevaba apagado todo el port con el motivo «a browser cannot close its own
  // tab», que era verdad. En la cáscara deja de serlo, y por eso esto no se
  // puede medir en ninguna de las otras sondas: en Chromium la entrada está
  // apagada y tiene razón.
  // Hasta aquí la sonda sólo necesitaba la VENTANA; esto necesita el JUEGO, y
  // el juego tarda en estar. Sin esta espera `window.probe` es `undefined` y la
  // sonda se cae con un error que parece de otra cosa.
  await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 180000 });
  const primera = await pag.evaluate(() => {
    const e = window.probe.menu.estado();
    return {
      quit: e.opciones.find((o) => o.texto.startsWith("Quit")) ?? null,
      credito: document.querySelector(".ms-menu-credito")?.textContent ?? "",
    };
  });
  control("«Quit» está ENCENDIDA en escritorio, y no lo estaba en el navegador",
    primera.quit?.sirve === true && primera.quit?.que === "salir",
    JSON.stringify(primera.quit));
  // DrKill es el autor de `gatecity.bsp` (CREDITOS.md:26), no del juego, y el
  // crédito del menú lo ascendía. Un crédito equivocado dura años porque parece
  // información y nadie lo comprueba; ahora lo comprueba esto.
  control("el crédito no asciende al autor del mapa a autor del juego",
    !/DrKill/.test(primera.credito) && /Anders Finér/.test(primera.credito),
    primera.credito);

  // SE DEJA LA MESA LIMPIA ANTES DE EMPEZAR. Los bloques de arriba pueden haber
  // dejado una ventana abierta, y **con algo encima el menú no atiende clics**
  // —`tapado` en `src/juego/menums.js`, que es correcto y es del 52—. Sin esto
  // el clic en «Quit» no llega a ninguna parte, `waitForSelector(".v2-ventana")`
  // encuentra la ventana de antes y el control mide la ventana equivocada: dijo
  // «botones Advanced… · Done», que es Options. Un verde vacío de los de la
  // tabla del apartado 4, evitado porque el detalle venía impreso.
  for (let i = 0; i < 6; i++) {
    if ((await pag.evaluate(() => window.probe.vgui2.estado().abiertas)) === 0) break;
    await pag.keyboard.press("Escape");
    await pag.waitForTimeout(200);
  }
  control("CONTROL DE PARTIDA: no queda ninguna ventana abierta antes de «Quit»",
    (await pag.evaluate(() => window.probe.vgui2.estado().abiertas)) === 0);

  await pag.locator(".ms-menu-op").filter({ hasText: /^Quit$/ }).click();
  await pag.waitForSelector(".v2-ventana", { timeout: 10000 });
  const pregunta = await pag.evaluate(() => ({
    botones: [...document.querySelectorAll(".v2-boton")].map((b) => b.textContent),
    enfocado: document.activeElement?.textContent ?? null,
  }));
  // LO QUE NO SE DESHACE NO SE PULSA POR INERCIA: quien llegue con el teclado
  // tiene que encontrar «Cancel» debajo del dedo, no «Quit».
  control("salir PREGUNTA, y el foco empieza en «Cancel» y no en «Quit»",
    pregunta.botones.includes("Quit") && pregunta.botones.includes("Cancel")
      && pregunta.enfocado === "Cancel",
    `botones ${pregunta.botones.join(" · ")}, foco en ${pregunta.enfocado}`);

  // CONTROL POSITIVO de lo que viene después: «Cancel» NO cierra. Sin esto,
  // «Quit cierra» saldría verde con un botón que cierra pase lo que pase.
  await pag.locator(".v2-boton").filter({ hasText: /^Cancel$/ }).click();
  await pag.waitForTimeout(400);
  control("CONTROL POSITIVO: «Cancel» cierra la pregunta y NO la aplicación",
    (await pag.evaluate(() => window.probe.vgui2.estado().abiertas)) === 0
      && (await app.windows()).length === 1);

  // La casilla de pantalla completa era un apaño contra un límite del navegador
  // que el 72 quitó. Aquí no sale: `soloEnNavegador` en `src/play/crearpartida.js`.
  await pag.locator(".ms-menu-op").filter({ hasText: /^Establish a Kingdom$/ }).click();
  await pag.waitForSelector(".v2-ventana");
  await pag.waitForTimeout(250);
  const crear = await pag.evaluate(() =>
    document.querySelector(".v2-hoja")?.textContent ?? "");
  control("la casilla de pantalla completa NO sale en escritorio",
    !/full screen/i.test(crear) && /Map/.test(crear), crear.trim().slice(0, 60));
  // Y se puede cerrar SIN la Escape, que era el fallo: «Servers» no tenía salida
  // visible ninguna.
  await pag.locator(".v2-cerrar").first().click();
  await pag.waitForTimeout(300);
  control("toda ventana tiene una salida visible, no sólo la Escape",
    (await pag.evaluate(() => window.probe.vgui2.estado().abiertas)) === 0);

  // ── 6. NI UNA PALABRA DE NAVEGADOR EN PANTALLA (el 74) ──────────────────
  //
  // El port nació en el navegador y dejó restos repartidos: «Characters are
  // saved in this browser», «Ctrl+W closes the tab in a browser tab. Go
  // fullscreen…», «a browser tab is already a window». En la cáscara no son
  // imprecisos: **son falsos**, y un aviso que no es verdad es peor que no
  // avisar — lo dice la cabecera de `escritorio/precarga.cjs` desde el 72.
  //
  // Esto no se revisa a mano con un `grep`, porque lo que importa no es lo que
  // hay escrito en los fuentes sino lo que acaba EN PANTALLA: una cadena puede
  // estar en el código y no enseñarse nunca, y otra puede componerse de dos
  // trozos que por separado no dicen «browser». Así que se barre el DOM.
  await pag.locator(".ms-menu-op").filter({ hasText: /^Name Character$/ }).click();
  await pag.waitForTimeout(800);
  const barrido = await pag.evaluate(() => {
    const textos = [...document.querySelectorAll("*")]
      .filter((n) => n.childElementCount === 0)
      .map((n) => (n.textContent ?? "").trim())
      .filter(Boolean);
    const titulos = [...document.querySelectorAll("[title]")].map((n) => n.title);
    const todo = [...textos, ...titulos];
    return {
      cuantos: todo.length,
      culpables: todo.filter((t) => /\bbrowser\b|\btab\b/i.test(t)).slice(0, 5),
    };
  });
  // CONTROL POSITIVO, y hace falta: si el barrido leyera cero nodos, «no hay
  // ninguna mención» saldría verde con la pantalla llena de ellas. Es el verde
  // vacío del apartado 4, que aquí entra por la puerta de un `querySelectorAll`
  // que no encuentra nada.
  control("CONTROL POSITIVO: el barrido LEE texto de la pantalla",
    barrido.cuantos > 20, `${barrido.cuantos} nodos con texto`);
  control("ni una mención al navegador en lo que el jugador lee",
    barrido.culpables.length === 0, barrido.culpables.join(" | ") || "ninguna");

  // ── 7. Lo que NO se mide, dicho aquí y no descubierto luego ─────────────
  console.log("\n  pendiente (declarado, y NO contado entre los verdes):");
  console.log("    - que un acelerador de ventana se haya vencido de verdad. Las");
  console.log("      teclas de Playwright entran por el protocolo de depuración y");
  console.log("      no pasan por los aceleradores: con el menú por omisión PUESTO,");
  console.log("      Ctrl+W llegaba igual y no cerraba la ventana. Medirlo de verdad");
  console.log("      pide inyección a nivel del sistema operativo, que no hay.");
  console.log("    - el contraste con un navegador: el Chromium de Playwright no");
  console.log("      tiene pestaña que cerrar.");
  console.log("    - el camino de producción (`dist/` servido por servidor.js):");
  console.log("      esta sonda sigue midiendo la rama de desarrollo, con Vite");
  console.log("      detrás. YA NO ESTÁ SIN MEDIR: desde el 74 lo mide");
  console.log("      `npm run sonda:produccion`, que es una sonda aparte porque");
  console.log("      son dos servidores distintos y conviene saber cuál falló.");
  console.log("    - que «Quit» CIERRE el proceso. Medirlo mata la aplicación, y");
  console.log("      con ella todo lo que viniera después, así que no puede vivir");
  console.log("      en una sonda con otros controles detrás. Se midió a mano el");
  console.log("      73 y cerró; lo que sí se mide aquí es la pregunta y que");
  console.log("      «Cancel» NO cierra, que es la mitad que puede romperse sola.");
} finally {
  await app?.close().catch(() => {});
}

// EL MARCADOR, calculado sobre lo que se DECLARÓ y no sobre lo que llegó a
// correr. Si la sonda se va por un `catch` a mitad, el total no puede encogerse
// para que el porcentaje siga saliendo bonito: eso fue el fallo del 65.
const DECLARADOS = 18;
const bien = controles.filter((c) => c.bien).length;
console.log(`\n  ${bien} de ${DECLARADOS} controles en verde` +
  (controles.length < DECLARADOS ? `  (sólo se ejecutaron ${controles.length})` : ""));
if (bien < DECLARADOS) process.exit(1);
