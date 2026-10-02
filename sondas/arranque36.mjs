// POR DÓNDE SE ENTRA AL JUEGO, en un Chrome de verdad.
//
//   npm run sonda:arranque36
//
// Hasta el 36 este port arrancaba directo en la pantalla de personajes. Eso YA
// era «Establish a Kingdom» —montar una partida local— sólo que ocurría sola, en
// silencio y sin que nadie la pidiera. Esta sonda comprueba que ahora hay puerta.
//
// ── POR QUÉ ÉSTA NO ENTRA POR EL MENÚ con el ayudante común (59) ─────────
//
// Porque ÉSTA ES la entrada. `sondas/entrar.mjs` recorre el menú de una
// tirada para que las demás lleguen dentro; aquí el recorrido es lo que se
// mide, paso a paso, y su apartado 7 abre una segunda pestaña con `?map=`
// **a propósito**: es el control positivo que demuestra que sin `?map=` hay
// menú y con `?map=` no lo hay. Usar el ayudante sería medirlo con él mismo.
//
// ── Ésta era la única sonda que cargaba la página SIN `?map=` ─────────────
//
// Desde el 59 ya no: son veintisiete.
//
// Y eso es el experimento: `?map=` es la línea de comandos del juego
// (`hl.exe +map <mapa>` entra sin pasar por el menú), y las otras veinte sondas
// la llevan puesta desde siempre, así que ninguna ve el menú. Si esta sonda
// también la llevara, el cambio de arranque no lo probaría nadie.
//
// El control positivo va al final y es justo ése: **con `?map=` NO sale el
// menú**. Sin él, «sale el menú» estaría verde en una página que no hubiera
// cambiado nada.
//
// Las formas de que esto esté verde midiendo nada:
//
//   1. el menú sale y no se puede pulsar        -> pulsar con el ratón de verdad
//   2. «Establish a Kingdom» sigue apagada      -> mirar `disabled`, no el texto
//   3. abre una ventana vacía                   -> mirar sus pestañas y sus filas
//   4. la lista de mapas miente                 -> tiene que decir UNO
//   5. «Start» no entra                         -> tiene que salir el personaje
//   6. el menú sale SIEMPRE, con `?map=` o sin  -> el control positivo del final

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { esNuestro, liberarPuerto } from "./mismo.mjs";
import { MAPAS_PORTADOS } from "../src/play/mapa.js";
import { mkdirSync } from "node:fs";

const PORT = 5220;
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
  const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
  pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
  // SIN `?map=`. Es lo que distingue a esta sonda de las otras veinte.
  await pag.goto(`http://localhost:${PORT}/`, { waitUntil: "load" });
  await esNuestro(pag, PORT);
  mkdirSync("build/gatecity/vistas", { recursive: true });

  await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
  await pag.waitForTimeout(800);

  // ── 1. LO PRIMERO QUE SE VE ES EL MENÚ ───────────────────────────────────
  const entrada = await pag.evaluate(() => ({
    menu: !document.querySelector(".ms-menu")?.hidden,
    personajes: window.probe.vgui.abierto(),
    opciones: [...document.querySelectorAll(".ms-menu-op")].map((n) => n.textContent.trim()),
  }));
  control("lo primero que se ve es el MENÚ PRINCIPAL, no elegir personaje",
    entrada.menu === true && entrada.personajes === null,
    `menú ${entrada.menu}, panel ${entrada.personajes}`);
  control("y trae las entradas de gamemenu.res",
    entrada.opciones.includes("Visit a Kingdom") && entrada.opciones.includes("Establish a Kingdom"),
    entrada.opciones.filter(Boolean).join(" · "));

  // ── 1b. DETRÁS DEL MENÚ HAY UNA ESCENA, NO UNA PARTIDA ───────────────────
  //
  // Lo que esto arregla, medido antes de arreglarlo y con el menú delante:
  //
  //   NPC             69 montados, 33 hostiles
  //   ¿se mueven?     45 de los 69 se movieron en 4 s, hasta 3,74 m
  //   jugador         existe, con posición
  //   sesion          true
  //
  // O sea que arrancar el juego era entrar a Gate City con treinta y tres
  // monstruos cazando, y el menú una tapa encima. Un mapa de fondo del motor
  // no es eso: al jugador le ponen `FL_GODMODE|FL_NOTARGET` —«don't attack
  // player in background mode», sv_client.c:1422-1423— y lo congelan
  // (`sv_background_freeze`, sv_main.c:111). Aquí se va más lejos y no se
  // monta ninguno, porque sin jugador no hay a quién no atacar; está
  // declarado en `src/play/fondomenu.js`.
  //
  // ── CORRECCIÓN, antes de que este control mienta ─────────────────────
  //
  // La primera versión de esto exigía además que NO hubiera cuerpo de jugador
  // y que no hubiera sesión. Al medirlo con cuidado, dos de los tres cargos
  // eran una mala lectura mía:
  //
  //   `sesion: true`   era `Boolean(S.sesion)`, o sea que el OBJETO existe.
  //                    El estado real es «fuera» y `personaje` es `null`:
  //                    no hay ninguna partida corriendo. No había nada que
  //                    arreglar ahí.
  //   el cuerpo        existe, sí, pero **no se mueve**: con el menú delante
  //                    y la tecla de andar puesta 1,2 s se anduvo 0,000 m.
  //                    Eso es exactamente lo que hace el motor en un mapa de
  //                    fondo (`sv_background_freeze`, sv_main.c:111), así que
  //                    quitarlo no sería más fiel, sería menos. Y la cámara
  //                    del menú ES la del jugador conducida desde fuera, así
  //                    que quitar el cuerpo se llevaría el paseo del 52.
  //
  // Lo que queda, que es el cargo de verdad, es la simulación: 69 NPC y 33
  // hostiles cazando un cuerpo congelado. Así que el control del cuerpo pasa
  // a medir lo que importa —que esté quieto— en vez de que no exista.
  //
  // Se espera de verdad antes de contar: un censo leído en el fotograma uno
  // daría cero también con los 69 en camino.
  await pag.waitForTimeout(3000);
  const detras = await pag.evaluate(() => ({
    npc: window.probe.ia?.censo?.()?.total ?? null,
    hostiles: window.probe.ia?.censo?.()?.hostiles ?? null,
    estado: window.probe.sesion?.estado?.() ?? null,
    personaje: window.probe.sesion?.personaje ?? null,
    tri: window.probe.level?.mesh?.triangleCount ?? 0,
  }));

  // CUÁNTOS TRIÁNGULOS DIBUJA EL FOTOGRAMA ENTERO, no la última pasada.
  //
  // Esto era `renderer.info.render.triangles` leído sin más, y daba **1**.
  // No era un fallo del dibujo: durante el paseo del menú se dibuja en dos
  // pasadas —la escena a un destino intermedio y luego el destino a la
  // pantalla (`src/render/pasadamenu.js:95-97`)— y la segunda es el triángulo
  // grande de pantalla completa, `[-1,-1, 3,-1, -1,3]`. Three.js pone a cero
  // `info.render` en CADA `render()`, así que lo que se leía era el triángulo
  // del compositor y el control se ponía rojo con el pueblo perfectamente
  // dibujado. Un contador que se reinicia por pasada mide una pasada (61).
  //
  // Con `autoReset` apagado, `info` acumula las dos y el número es el del
  // fotograma. Se deja como estaba al salir.
  const dibujados = await pag.evaluate(async () => {
    const info = window.probe.renderer?.info;
    if (!info) return 0;
    const antes = info.autoReset;
    info.autoReset = false;
    info.reset();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const n = info.render.triangles;
    info.autoReset = antes;
    return n;
  });
  detras.dibujados = dibujados;
  control("detrás del menú NO hay monstruos montados",
    detras.npc === 0, `${detras.npc} NPC, ${detras.hostiles} hostiles`);
  control("ni partida empezada: nadie ha elegido personaje todavía",
    detras.estado === "fuera" && detras.personaje === null,
    `estado ${JSON.stringify(detras.estado)}, personaje ${JSON.stringify(detras.personaje)}`);
  // EL CUERPO SÍ ESTÁ, Y CONGELADO, que es lo que hace el motor. Se mide
  // andando de verdad, no leyendo una bandera: `sv_background_freeze` no es
  // un `if` que se pueda preguntar, es un efecto.
  const antesQuieto = await pag.evaluate(() => [...window.probe.player.feet]);
  await pag.keyboard.down("KeyW");
  await pag.waitForTimeout(1200);
  await pag.keyboard.up("KeyW");
  const trasQuieto = await pag.evaluate(() => [...window.probe.player.feet]);
  const seMovio = Math.hypot(trasQuieto[0] - antesQuieto[0], trasQuieto[2] - antesQuieto[2]);
  control("el cuerpo está pero NO se mueve, como en un mapa de fondo del motor",
    seMovio < 0.05, `${seMovio.toFixed(3)} m con la W puesta 1,2 s`);
  // EL CONTRARIO, y hace falta: «cero NPC» y «no se cargó nada» se ven igual.
  // Si el fondo estuviera vacío, los dos controles de arriba saldrían verdes
  // sobre una pantalla negra — que es la primera fila de la tabla del
  // apartado 4, la del laboratorio.
  control("CONTROL: y sin embargo hay una escena cargada y dibujándose",
    detras.tri > 1000 && detras.dibujados > 1000,
    `${detras.tri} tri en el nivel, ${detras.dibujados} dibujados`);

  // ── 2. «ESTABLISH A KINGDOM» YA NO ESTÁ APAGADA ──────────────────────────
  // El menú NO usa `disabled`: marca las entradas apagadas con
  // `data-sirve="no"` (`src/juego/menums.js:136`). Mirar `disabled` daba `false`
  // en las dos, así que este control salía verde con la entrada apagada. Lo
  // cazó el control de la ventana, que no abría.
  const estado = await pag.evaluate(() => {
    const de = (t) => [...document.querySelectorAll(".ms-menu-op")]
      .find((n) => n.textContent.trim() === t)?.dataset?.sirve ?? "no existe";
    return { montar: de("Establish a Kingdom"), visitar: de("Visit a Kingdom"), salir: de("Quit") };
  });
  control("«Establish a Kingdom» y «Visit a Kingdom» se pueden elegir",
    estado.montar === "si" && estado.visitar === "si", JSON.stringify(estado));
  control("y «Quit» sigue apagada, porque una pestaña no se cierra sola",
    estado.salir === "no", `Quit: ${estado.salir}`);

  // ── 2b. «OPTIONS» SE ABRE **ENCIMA DEL MENÚ**, no encima del mapa ────────
  //
  // El fallo que se veía jugando: `main.js` cerraba el menú antes de abrir la
  // ventana, así que Options salía flotando sobre el mundo y sobre el HUD. En
  // el juego una ventana se abre sobre la vista donde estabas. Sus dos
  // hermanas de la misma función —«Visit a Kingdom» y «Establish a Kingdom»—
  // ya se quedaban detrás; Options era la única que no.
  //
  // La entrada se busca por `data-que="opciones"` y no por su texto: la
  // etiqueta sale de `gamemenu.res`, y el comando es el mismo que el de «Name
  // Character» (`play/menu.js:42-45`), que sí cierra el menú a propósito.
  const hayOpciones = await pag.evaluate(() =>
    !!document.querySelector('.ms-menu-op[data-que="opciones"][data-sirve="si"]'));
  control("el menú trae una entrada «Options» que se puede elegir",
    hayOpciones === true, `data-que="opciones": ${hayOpciones}`);

  await pag.click('.ms-menu-op[data-que="opciones"]');
  await pag.waitForTimeout(400);
  const conOpciones = await pag.evaluate(() => ({
    ventana: window.probe.vgui2.estado().opciones?.pestana ?? null,
    menu: !document.querySelector(".ms-menu")?.hidden,
    tapado: window.probe.menu.estado().tapado,
  }));
  // LA LÍNEA BASE SE TOMA DESPUÉS DE ABRIR, no antes: pulsar «Options» con el
  // ratón marca esa misma entrada (`menums.js`, el `click` hace `elegida = i`),
  // así que una foto anterior al clic compararía contra otra cosa y el control
  // saldría rojo por el motivo equivocado.
  const marcada = await pag.evaluate(() => window.probe.menu.estado().elegida);
  control("«Options» abre la ventana de Valve",
    conOpciones.ventana !== null, `pestaña ${conOpciones.ventana}`);
  control("Y EL MENÚ SIGUE DETRÁS, que es el fallo: no se cierra",
    conOpciones.menu === true, `menú abierto: ${conOpciones.menu}`);
  control("el menú se sabe tapado, así que no atiende a nadie",
    conOpciones.tapado === true, `tapado: ${conOpciones.tapado}`);

  // EL GUARDIA. Con el menú detrás, el `Enter` se lo queda la ventana Y ADEMÁS
  // activaba la opción que hubiera debajo, a ciegas. Las flechas movían la
  // marca por detrás igual. Se mide con teclas de verdad, no llamando a
  // `elegir()`: lo que se quiere probar es el reparto del teclado.
  await pag.keyboard.press("ArrowDown");
  await pag.keyboard.press("ArrowDown");
  await pag.keyboard.press("Enter");
  await pag.waitForTimeout(350);
  const trasTeclas = await pag.evaluate(() => ({
    elegida: window.probe.menu.estado().elegida,
    abiertas: window.probe.vgui2.abiertas(),
    menu: !document.querySelector(".ms-menu")?.hidden,
  }));
  control("con la ventana delante, las flechas NO mueven la marca de detrás",
    trasTeclas.elegida === marcada,
    `al abrir ${marcada} · tras las flechas ${trasTeclas.elegida}`);
  control("y el Enter NO pulsa la entrada que hay debajo de la ventana",
    trasTeclas.abiertas === 1 && trasTeclas.menu === true,
    `${trasTeclas.abiertas} ventana(s), menú ${trasTeclas.menu}`);

  await pag.screenshot({ path: "build/gatecity/vistas/arranque36_opciones.png" });
  console.log(`    captura         build/gatecity/vistas/arranque36_opciones.png`);

  // La Escape cierra la ventana y devuelve el menú, que es la vuelta.
  await pag.keyboard.press("Escape");
  await pag.waitForTimeout(350);
  const trasCerrar = await pag.evaluate(() => ({
    abiertas: window.probe.vgui2.abiertas(),
    menu: !document.querySelector(".ms-menu")?.hidden,
    tapado: window.probe.menu.estado().tapado,
  }));
  control("la Escape cierra Options y deja el menú donde estaba",
    trasCerrar.abiertas === 0 && trasCerrar.menu === true, JSON.stringify(trasCerrar));

  // CONTROL POSITIVO DEL GUARDIA. Sin esto, los dos controles de arriba
  // estarían verdes con un menú que no responde NUNCA —que es exactamente la
  // forma de fallo del 35 y del 38: el verde del valor de reposo—. Aquí se
  // comprueba que la misma flecha que no hacía nada hace tres líneas, ahora sí.
  await pag.keyboard.press("ArrowDown");
  await pag.waitForTimeout(250);
  const yaResponde = await pag.evaluate(() => window.probe.menu.estado().elegida);
  control("CONTROL POSITIVO: cerrada la ventana, la flecha vuelve a mover el menú",
    trasCerrar.tapado === false && yaResponde !== marcada,
    `tapado ${trasCerrar.tapado} · ${marcada} -> ${yaResponde}`);

  // ── 3. Y ABRE «CREATE SERVER», con el ratón ──────────────────────────────
  for (const b of await pag.$$(".ms-menu-op")) {
    if ((await b.textContent()).trim() === "Establish a Kingdom") { await b.click(); break; }
  }
  await pag.waitForTimeout(400);
  const cs = await pag.evaluate(() => window.probe.vgui2.estado().crearServidor);
  control("«Establish a Kingdom» abre la ventana «Create Server»",
    !!cs, JSON.stringify(cs?.pestana ?? null));
  const pest = await pag.$$eval(".v2-pestana", (ns) => ns.map((n) => n.textContent));
  control("con sus dos pestañas, Server y Game",
    JSON.stringify(pest) === JSON.stringify(["Server", "Game"]), pest.join(" · "));

  // ── 4. LA LISTA DE MAPAS DICE LA VERDAD ──────────────────────────────────
  await pag.click(".v2-desplegable");
  await pag.waitForTimeout(200);
  const mapas = await pag.$$eval(".v2-lista-abierta > button", (ns) => ns.map((n) => n.textContent));
  // LA CUENTA SE CALCULA. Estaba escrita —«enseña UNO», `length === 2`— y el
  // día que Edana entró en `MAPAS_PORTADOS` (el 50) esto se puso rojo diciendo
  // que la lista mentía, cuando la que mentía era la sonda. Lo que hay que
  // comprobar es que la ventana enseña **lo que la lista promete y nada más**.
  const esperados = ["< Random Map >", ...MAPAS_PORTADOS];
  control(`la lista de mapas enseña los ${MAPAS_PORTADOS.length} portados y ninguno más`,
    JSON.stringify(mapas) === JSON.stringify(esperados),
    `${mapas.join(" · ")}   (esperados: ${esperados.join(" · ")})`);
  // La Escape con la lista abierta cierra LA LISTA, no la ventana. Es lo que
  // hace el juego, y aquí no lo hacía: «Create Server» se iba entera y la
  // pestaña siguiente ya no existía. Este control lo fija.
  await pag.keyboard.press("Escape");
  await pag.waitForTimeout(250);
  const trasEscape = await pag.evaluate(() => ({
    lista: !!document.querySelector(".v2-lista-abierta"),
    ventana: !!window.probe.vgui2.estado().crearServidor,
  }));
  control("la Escape cierra el DESPLEGABLE, y la ventana se queda",
    trasEscape.lista === false && trasEscape.ventana === true, JSON.stringify(trasEscape));

  // ── 4b. Y SE ELIGE UNO A MANO, porque `< Random Map >` ya sortea ─────────
  //
  // Hasta el 50 la fila venía con `< Random Map >` y había **un** mapa, así
  // que «Start entra con el mapa de la fila» y «Start entra con gatecity»
  // eran la misma frase. Con dos portados, dejar el valor por omisión
  // convierte el control de abajo en una moneda al aire: la mitad de las
  // veces saldría rojo con todo bien.
  //
  // Así que aquí se elige Gate City **con el ratón**, que además es lo que
  // esta sonda tiene que medir — el camino del jugador. La otra mitad, que
  // elegir el OTRO trae el otro, se mide en `sonda:edana50`: ése es el
  // control que separa «se aplicó la fila» de «siempre sale el mismo».
  await pag.click(".v2-desplegable");
  await pag.waitForTimeout(200);
  for (const b of await pag.$$(".v2-lista-abierta > button")) {
    if ((await b.textContent()).trim() === "gatecity") { await b.click(); break; }
  }
  await pag.waitForTimeout(200);
  const elegido = await pag.evaluate(() =>
    window.probe.vgui2.estado().crearServidor.valores.mapa);
  control("elegir «gatecity» en el desplegable deja la fila «Map» con ese valor",
    elegido === "gatecity", `fila «Map»: ${JSON.stringify(elegido)}`);

  // ── 5. LAS TRES CASILLAS QUE CUADRAN CON LOS CVARS ───────────────────────
  await pag.click(".v2-pestana:nth-child(2)");             // Game
  await pag.waitForTimeout(200);
  const casillas = await pag.evaluate(() => {
    const v = window.probe.vgui2.estado().crearServidor.valores;
    return { votarHora: v.votarHora, pvp: v.pvp, central: v.central };
  });
  control("«Allow time change votes» marcada, PvP y Central sin marcar",
    casillas.votarHora === true && casillas.pvp === false && casillas.central === false,
    JSON.stringify(casillas));

  await pag.screenshot({ path: "build/gatecity/vistas/arranque36.png" });
  console.log(`    captura         build/gatecity/vistas/arranque36.png`);

  // ── 6. «START» ENTRA AL JUEGO ────────────────────────────────────────────
  for (const b of await pag.$$(".v2-boton")) {
    if ((await b.textContent()) === "Start") { await b.click(); break; }
  }
  // EL ORDEN: NO SE ABRE EL MUNDO VACÍO ────────────────────────────────────
  //
  // Este control existe porque una rotura a propósito **no puso nada rojo**.
  // Se probó el orden que parece natural —cerrar el menú y poblar después— y
  // la sonda daba 29 de 29: los bichos acababan llegando, así que todos los
  // controles del final los veían. Lo que no veía nadie es que entre medias
  // hay **5 610 ms de Gate City vacía** con el jugador ya dentro y el menú ya
  // fuera. Un fallo de cinco segundos y medio que ningún verde contradice.
  //
  // Así que se mira en el borde: en cuanto el menú se cierra, tiene que haber
  // pueblo. Se espera al menú y no a `newchar` a propósito — `newchar` llega
  // después de `sesion.arrancar()` y para entonces ya se ha perdido el
  // instante que importa.
  await pag.waitForFunction(() => document.querySelector(".ms-menu")?.hidden === true,
    null, { timeout: 60000 });
  const alAbrirse = await pag.evaluate(() => window.probe.ia?.censo?.()?.total ?? null);
  control("al cerrarse el menú el mundo YA está poblado, no se abre vacío",
    alAbrirse > 0, `${alAbrirse} NPC en el fotograma en que el menú se va`);

  // SE ESPERA AL EFECTO, NO A UN RELOJ. Desde el 53 «Start» al mismo mapa del
  // fondo monta los 69 bichos aquí mismo, y eso tarda **5 610 ms medidos**:
  // con el `waitForTimeout(1500)` que había, esta sonda medía el instante de
  // antes y habría dicho que «Start» no lleva a ninguna parte. Alargar el
  // reloj habría sido esconderlo — el número volvería a quedarse corto el día
  // que el mapa traiga más modelos.
  await pag.waitForFunction(() => window.probe.vgui.abierto() === "newchar",
    null, { timeout: 60000 });
  const dentro = await pag.evaluate(() => ({
    menu: !document.querySelector(".ms-menu")?.hidden,
    panel: window.probe.vgui.abierto(),
    ventanas: window.probe.vgui2.abiertas(),
  }));
  control("«Start» cierra el menú y lleva a elegir personaje",
    dentro.menu === false && dentro.panel === "newchar", JSON.stringify(dentro));
  control("y no se deja ninguna ventana de Valve abierta por detrás",
    dentro.ventanas === 0, `${dentro.ventanas} abiertas`);

  // ── 6b. LA FILA «MAP» LLEGA AL JUEGO ─────────────────────────────────────
  //
  // Estaba contada como viva y no hacía nada: `alEmpezar` sólo miraba
  // `pantallaCompleta` y el valor de la fila se tiraba. Ahora «Start» lo
  // resuelve con `mapaElegido()` y entra con lo que salga.
  //
  // Se mide LO APLICADO, no lo que la ventana enseñaba: son dos cosas y hasta
  // ahora sólo existía la segunda. El control positivo va en el apartado 7.
  //
  // Y el valor que se exige es el que se eligió a mano en el 4b, no una
  // constante: con `< Random Map >` puesto esto sería un sorteo desde el 50.
  const conQue = await pag.evaluate(() => window.probe.vgui2.mapaDeLaPartida());
  control("«Start» entra con el mapa que resuelve la fila «Map»",
    conQue === elegido, `elegido ${JSON.stringify(elegido)} · aplicado ${JSON.stringify(conQue)}`);

  // ── 6c. EL POSITIVO DEL 1b: JUGANDO SÍ HAY PARTIDA ──────────────────────
  //
  // Sin esto, «detrás del menú no hay monstruos» estaría verde también con un
  // censo roto, con los bichos que no se montan nunca, o con `probe.ia`
  // devolviendo `null` por un renombrado. **Un cero sin control positivo no es
  // un resultado**: aquí se comprueba que el mismo censo que decía 0 dice 69
  // en cuanto hay partida.
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda36", "swords_rsword"));
  await pag.waitForTimeout(2500);
  const jugando = await pag.evaluate(() => ({
    npc: window.probe.ia?.censo?.()?.total ?? null,
    hostiles: window.probe.ia?.censo?.()?.hostiles ?? null,
    jugador: window.probe.player ? [...window.probe.player.feet] : null,
  }));
  control("CONTROL POSITIVO: empezada la partida, los monstruos SÍ están",
    jugando.npc > 0 && jugando.npc !== detras.npc,
    `detrás del menú ${detras.npc} → jugando ${jugando.npc} (${jugando.hostiles} hostiles)`);
  // Y EL CONTRARIO DEL CUERPO CONGELADO. Sin esto, «no se mueve con el menú
  // delante» estaría verde con un jugador que no se mueve NUNCA — que es el
  // experimento 37 con otra ropa, y ya costó una sesión.
  const antesAnda = await pag.evaluate(() => [...window.probe.player.feet]);
  await pag.keyboard.down("KeyW");
  await pag.waitForTimeout(1200);
  await pag.keyboard.up("KeyW");
  const trasAnda = await pag.evaluate(() => [...window.probe.player.feet]);
  const anduvo = Math.hypot(trasAnda[0] - antesAnda[0], trasAnda[2] - antesAnda[2]);
  control("CONTROL POSITIVO: y jugando el mismo cuerpo SÍ anda",
    anduvo > 0.5 && seMovio < 0.05,
    `con el menú ${seMovio.toFixed(3)} m → jugando ${anduvo.toFixed(2)} m`);

  // ── 7. EL CONTROL POSITIVO: con `?map=` NO hay menú ──────────────────────
  //
  // Sin esto, «sale el menú» saldría verde en una página que no hubiera cambiado
  // nada, y las otras veinte sondas seguirían funcionando por casualidad.
  const otra = await nav.newPage({ viewport: { width: 1200, height: 800 } });
  await otra.goto(`http://localhost:${PORT}/?map=gatecity`, { waitUntil: "load" });
  await otra.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
  await otra.waitForTimeout(800);
  const atajo = await otra.evaluate(() => ({
    menu: !document.querySelector(".ms-menu")?.hidden,
    panel: window.probe.vgui.abierto(),
    mapa: window.probe.vgui2.mapaDeLaPartida(),
  }));
  control("CONTROL POSITIVO: con `?map=` se entra directo, como con `+map`",
    atajo.menu === false && atajo.panel === "newchar", JSON.stringify(atajo));
  // Y EL POSITIVO DE LA FILA «MAP». Sin esto, «Start entra con el mapa de la
  // fila» estaría verde aunque el juego dijera «gatecity» SIEMPRE, por una
  // constante escrita en otro sitio: sólo hay un mapa portado, así que el
  // valor correcto y el valor de reposo son el mismo string. Aquí no se pasa
  // por la ventana, así que nadie ha resuelto ninguna fila y tiene que ser
  // `null`. Es la diferencia entre «se aplicó» y «coincide».
  control("CONTROL POSITIVO: sin pasar por la ventana no hay mapa resuelto",
    atajo.mapa === null, `mapa aplicado: ${JSON.stringify(atajo.mapa)}`);
  await otra.close();
} catch (e) {
  errores.push(`la sonda se cayó: ${String(e).slice(0, 300)}`);
  // ── Y SE CUENTA COMO UNA ROJA, que hasta el 65 no se contaba ────────────
  //
  // Esta sonda declara 30 controles y llevaba tiempo **cayéndose en el 22**:
  // el `waitForFunction` de «el menú se cierra» agota sus 60 segundos y los
  // ocho de después —entre ellos «Start entra con el mapa que resuelve la fila
  // Map», que es el control del experimento 50— no llegaban a correr. Y el
  // resumen decía «22 de 22 en verde», con el fallo en una nota al pie.
  //
  // Un recuento que sólo cuenta lo que se ejecutó no puede bajar: es el
  // apartado 4 aplicado al propio marcador. Ahora la caída ES una roja, así
  // que el «X de Y» no puede volver a salir limpio con un tercio sin correr.
  controles.push({
    que: "LA SONDA LLEGA AL FINAL: si no, lo de abajo cuenta sólo lo que corrió",
    bien: false,
    detalle: String(e?.message ?? e).slice(0, 90),
  });
}

console.log("\n  CONTROLES");
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(66)} ${c.detalle}`);
const mal = controles.filter((c) => !c.bien);
console.log(`\n  ${controles.length - mal.length} de ${controles.length} en verde`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}\n`);

await nav?.close();
matar(dev);
process.exit(mal.length || errores.length || !controles.length ? 1 : 0);
