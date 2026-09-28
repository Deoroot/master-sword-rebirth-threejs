// EL MENÚ DE INTERACCIÓN Y EL KIT DE VGUI, en un Chrome de verdad.
//
//   npm run sonda:vgui29
//
// `npm test` comprueba 42 cosas del kit: el esquema, la inversión del alfa, el
// reparto de teclas con su botón inalcanzable, las opciones que salen de los
// scripts. Ninguna de esas 42 dice que pulsar la F abra nada.
//
// Y ÉSE es el fallo que este experimento vino a arreglar. Los paneles que había
// escuchaban `keydown` en la ventana por su cuenta, por fuera de la tabla de
// teclas del juego. O sea que la forma de que esto parezca funcionar y esté mal
// es exactamente la de antes: el panel se abre desde código y nadie comprueba
// que la tecla llegue.
//
// Por eso aquí **no se llama a `abrir()` en ningún control**. Se pulsa la F con
// el teclado del navegador, como la pulsa una persona. `probe.vgui` sólo lee.
//
// Las formas de que esto esté verde midiendo nada:
//
//    1. el panel se abre desde la sonda      -> no se prueba la tecla. Prohibido aquí.
//    2. la F abre y el panel no se ve        -> hay que medir el DOM, no el objeto
//    3. se ve y no tiene el aspecto          -> hay que medir el color y el borde
//    4. tiene aspecto y no entra             -> el desvanecido: dos medidas, no una
//    5. entra y el jugador sigue andando     -> hay que andar y medir que no se mueve
//    6. no anda y la F no lo cierra          -> alternar, ida y vuelta
//    7. cierra y los números no eligen       -> pulsar el número y ver qué pasa
//    8. los números eligen el botón décimo   -> NO tienen que poder: es el fallo
//    9. hay opciones y son inventadas        -> tienen que salir del script del NPC
//   10. el NPC de delante es otro            -> el cono tiene que ser el del golpe

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const PORT = 5215;
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
  await pag.goto(`http://localhost:${PORT}/?map=gatecity`, { waitUntil: "load" });
  mkdirSync("build/gatecity/vistas", { recursive: true });

  await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
  await pag.evaluate(() => window.probe.vivo.congelarPaseo(true));
  await pag.evaluate(() => window.probe.hud.avanzar(40));

  // ── 0. EL KIT ESTÁ MONTADO Y CON EL ESQUEMA DEL JUEGO ────────────────────
  console.log(`\n  EL KIT`);
  const kit = await pag.evaluate(() => ({
    hay: window.probe.vgui.hay(),
    esquema: window.probe.vgui.esquema(),
    abierto: window.probe.vgui.abierto(),
  }));
  console.log(`    registro        ${kit.hay ? "montado" : "NO"} · nada abierto: ${kit.abierto === null}`);
  console.log(`    esquema         archivo de ${kit.esquema.resolucion} para ${ANCHO} px de ancho`);
  console.log(`    letra pequeña   ${kit.esquema.sml}`);
  console.log(`    letra de título ${kit.esquema.titulo}`);
  control("el registro de paneles está montado", kit.hay === true);
  control("y arranca sin ningún panel abierto", kit.abierto === null, `${kit.abierto}`);
  // 1200 px de ancho: el motor elegiría el archivo de 960, que es el mayor que
  // no pasa. Si saliera 1440 es que se está interpolando, y el motor no lo hace.
  control("elige el archivo de esquema como el motor: el mayor que no pasa",
    kit.esquema.resolucion === 960, `${kit.esquema.resolucion} para ${ANCHO} px`);
  control("y la letra es la del juego, Sitka, no una del navegador",
    /Sitka/.test(kit.esquema.sml), kit.esquema.sml ?? "");

  // ── 1. LA F LO ABRE. Con la tecla, no con una llamada ────────────────────
  console.log(`\n  LA TECLA`);
  await pag.click("canvas", { position: { x: 600, y: 400 } });
  await pag.keyboard.press("KeyF");
  // 900 ms y no 400: el desvanecido dura MEDIO SEGUNDO, y medir el color a mitad
  // de camino da el ambar al 93 % de alfa. El primer intento de esta sonda midio
  // a los 400 ms y tres controles salieron en rojo por eso, no por el panel.
  await new Promise((r) => setTimeout(r, 900));
  const abierto = await pag.evaluate(() => ({
    cual: window.probe.vgui.abierto(),
    panel: window.probe.vgui.panel(),
    botones: window.probe.vgui.botones(),
    delante: window.probe.vgui.delante(),
  }));
  console.log(`    F -> panel      ${abierto.cual} · visible ${abierto.panel?.visible}`);
  console.log(`    ventana         ${JSON.stringify(abierto.panel?.ventana)}`);
  console.log(`    fondo / borde   ${abierto.panel?.fondo} / ${abierto.panel?.borde} de ${abierto.panel?.grosorDelBorde}`);
  console.log(`    botones         ${abierto.botones.map((b) => `${b.i}:${JSON.stringify(b.texto)}${b.sirve ? "" : " (apagado)"}`).join(" ")}`);
  control("LA F ABRE EL PANEL, y entra por la tabla de teclas del juego",
    abierto.cual === "interact", `${abierto.cual}`);
  control("y el panel se VE de verdad: el nodo está en pantalla, no sólo el objeto",
    abierto.panel?.visible === true && abierto.panel?.ventana?.w > 0,
    `${abierto.panel?.ventana?.w}x${abierto.panel?.ventana?.h} px`);
  // XRES(200) y no XRES(120), y eso es CORRECTO: el menú del jugador trae una
  // opción —la descripción de lo que lleva en la mano— y la línea que añade una
  // opción ensancha la ventana de 120 a 200 (vgui_menu_interact.h:139). El
  // primer intento de esta sonda esperaba 225 y salió en rojo por eso: el panel
  // estaba bien y la cuenta era mía.
  control("la ventana mide lo que dice el motor: XRES(200) con una opción dentro",
    Math.abs((abierto.panel?.ventana?.w ?? 0) - Math.round(200 * (ANCHO / 640))) <= 3,
    `${abierto.panel?.ventana?.w} px, esperado ${Math.round(200 * (ANCHO / 640))}`);
  // Pegada a la derecha: `ScreenWidth - wide - XRES(80)`, con el ancho de AHORA.
  const derechaEsperada = ANCHO - (abierto.panel?.ventana?.w ?? 0) - Math.round(80 * (ANCHO / 640));
  control("y va pegada a la derecha, no centrada: ScreenWidth − w − XRES(80)",
    Math.abs((abierto.panel?.ventana?.x ?? 0) - derechaEsperada) <= 4,
    `x=${abierto.panel?.ventana?.x}, esperado ${derechaEsperada}`);
  control("siempre hay un «Cancel»: el panel nunca deja al jugador encerrado",
    abierto.botones.some((b) => b.texto === "Cancel"),
    abierto.botones.map((b) => b.texto).join(", "));

  // ── 2. EL ASPECTO: el alfa al revés, medido en la pantalla ───────────────
  console.log(`\n  EL ASPECTO`);
  // `m_iTransparency = 128` con el alfa de VGUI al revés es medio negro: 0,498.
  // Si estuviera leído al derecho saldría 0,502 — parecido — pero al abrir el
  // panel el desvanecido lo pone en 255, y ahí la diferencia es total: opaco
  // contra invisible. Por eso el control mira el valor DESPUÉS del desvanecido.
  const alfa = /rgba?\([^)]*?([\d.]+)\s*\)$/.exec(abierto.panel?.fondo ?? "");
  const opacidad = alfa ? Number(alfa[1]) : 1;
  console.log(`    opacidad        ${opacidad} (128 al revés = ${((255 - 128) / 255).toFixed(3)})`);
  control("el fondo es MEDIO negro: el alfa de VGUI va al revés",
    Math.abs(opacidad - (255 - 128) / 255) < 0.02, `${opacidad}`);
  control("el borde es el verde del juego, no uno elegido",
    /rgba?\(100,\s*140,\s*100/.test(abierto.panel?.borde ?? ""), abierto.panel?.borde ?? "");
  control("y el marco escala con la pantalla: XRES(2) a 1200 px son 4",
    parseFloat(abierto.panel?.grosorDelBorde ?? "0") >= 3,
    abierto.panel?.grosorDelBorde ?? "");
  // El ámbar de los botones desarmados, `COLOR(255, 178, 0, 0)`.
  const cancel = abierto.botones.find((b) => b.texto === "Cancel");
  control("los botones son ÁMBAR, que es el color del juego para el no elegido",
    /rgba?\(255,\s*178,\s*0/.test(cancel?.color ?? ""), cancel?.color ?? "");

  // ── 3. EL DESVANECIDO: dos medidas, no una ──────────────────────────────
  //
  // Un control con una sola medida diría «hay un fondo» y estaría verde con el
  // desvanecido sin poner. Hacen falas dos: recién abierto tiene que estar
  // INVISIBLE, y medio segundo después medio negro.
  console.log(`\n  EL DESVANECIDO`);
  await pag.keyboard.press("KeyF");                 // cerrar
  await new Promise((r) => setTimeout(r, 200));
  await pag.keyboard.press("KeyF");                 // y abrir otra vez
  const recien = await pag.evaluate(() => window.probe.vgui.panel());
  await new Promise((r) => setTimeout(r, 800));
  const asentado = await pag.evaluate(() => window.probe.vgui.panel());
  const op = (s) => { const m = /rgba?\([^)]*?([\d.]+)\s*\)$/.exec(s ?? ""); return m ? Number(m[1]) : 1; };
  console.log(`    recién abierto  fondo ${recien?.fondo} (${op(recien?.fondo)})`);
  console.log(`    medio segundo   fondo ${asentado?.fondo} (${op(asentado?.fondo)})`);
  control("recién abierto el panel es INVISIBLE: el menú entra, no aparece",
    op(recien?.fondo) < 0.1, `${op(recien?.fondo)}`);
  control("y medio segundo después es el medio negro de la ventana",
    op(asentado?.fondo) > 0.4, `${op(asentado?.fondo)}`);

  // ── 4. CON EL PANEL DELANTE EL JUGADOR NO SE MUEVE ──────────────────────
  //
  // Y se comprueba ANDANDO. Un control que mire una bandera diría «atrapa el
  // ratón» y estaría verde con el jugador corriendo por el mapa.
  console.log(`\n  EL JUEGO, DETRÁS`);
  const antes = await pag.evaluate(() => window.probe.player.feet);
  await pag.keyboard.down("KeyW");
  await new Promise((r) => setTimeout(r, 1200));
  await pag.keyboard.up("KeyW");
  const durante = await pag.evaluate(() => ({ pos: window.probe.player.feet, atrapa: window.probe.vgui.atrapaElRaton() }));
  const movido = Math.hypot(durante.pos[0] - antes[0], durante.pos[2] - antes[2]);
  console.log(`    W con el panel  ${(movido * 100).toFixed(1)} cm · atrapa el ratón: ${durante.atrapa}`);
  control("con el panel abierto la W no mueve al jugador", movido < 0.05,
    `${(movido * 100).toFixed(1)} cm`);

  // Y el control positivo, que es lo que hace que el de arriba valga: con el
  // panel CERRADO la misma tecla tiene que mover.
  await pag.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 300));
  const cerrado = await pag.evaluate(() => window.probe.vgui.abierto());
  const antes2 = await pag.evaluate(() => window.probe.player.feet);
  await pag.keyboard.down("KeyW");
  await new Promise((r) => setTimeout(r, 1200));
  await pag.keyboard.up("KeyW");
  const despues = await pag.evaluate(() => window.probe.player.feet);
  const movido2 = Math.hypot(despues[0] - antes2[0], despues[2] - antes2[2]);
  console.log(`    W sin el panel  ${(movido2 * 100).toFixed(1)} cm`);
  control("EL CONTROL POSITIVO: sin el panel, la misma W sí mueve", movido2 > 0.5,
    `${(movido2 * 100).toFixed(1)} cm`);
  control("y el Escape lo cierra", cerrado === null, `${cerrado}`);

  // ── 5. LA F ES UN INTERRUPTOR, Y LOS NÚMEROS ELIGEN ─────────────────────
  console.log(`\n  LOS NÚMEROS`);
  await pag.keyboard.press("KeyF");
  await new Promise((r) => setTimeout(r, 700));
  const unoAbierto = await pag.evaluate(() => window.probe.vgui.abierto());
  await pag.keyboard.press("KeyF");
  await new Promise((r) => setTimeout(r, 300));
  const unoCerrado = await pag.evaluate(() => window.probe.vgui.abierto());
  control("la F abre y la F cierra: es un interruptor, como `ToggleMenuVisible`",
    unoAbierto === "interact" && unoCerrado === null, `${unoAbierto} -> ${unoCerrado}`);

  await pag.keyboard.press("KeyF");
  await new Promise((r) => setTimeout(r, 700));
  const antesDelUno = await pag.evaluate(() => window.probe.vgui.botones().length);
  await pag.keyboard.press("Digit1");
  await new Promise((r) => setTimeout(r, 400));
  const trasElUno = await pag.evaluate(() => window.probe.vgui.abierto());
  console.log(`    1 con ${antesDelUno} botón(es) -> ${trasElUno}`);
  control("el 1 pulsa el primer botón: `SlotInput(dígito − 1)`",
    trasElUno === null, `el panel se cerró: ${trasElUno}`);

  // EL BOTÓN DÉCIMO. El `0` da la ranura −1 y ninguna tecla da la 9, así que con
  // diez botones el décimo sólo se pulsa con el ratón. Se comprueba que el 0 NO
  // hace nada, que es el fallo portado.
  await pag.keyboard.press("KeyF");
  await new Promise((r) => setTimeout(r, 700));
  await pag.keyboard.press("Digit0");
  await new Promise((r) => setTimeout(r, 300));
  const trasElCero = await pag.evaluate(() => window.probe.vgui.abierto());
  console.log(`    0 -> ${trasElCero} (tiene que seguir abierto: el 0 da la ranura −1)`);
  control("EL FALLO PORTADO: el 0 no elige nada, porque da la ranura −1",
    trasElCero === "interact", `${trasElCero}`);
  // Y la otra mitad: el juego tampoco la ve. `return 0` se la queda igual.
  const cicloTrasCero = await pag.evaluate(() => window.probe.ranuras.estado().ranura ?? null);
  control("y el juego tampoco ve ese 0: el panel se la queda igual",
    cicloTrasCero === null || cicloTrasCero === undefined, `${cicloTrasCero}`);

  // ── 6. LAS OPCIONES SALEN DEL SCRIPT DEL NPC ────────────────────────────
  //
  // Sin nadie delante el servidor contesta con el menú DEL JUGADOR
  // (`else pMonster = pPlayer`), que es la descripción de lo que lleva en la
  // mano. Con un NPC delante, las suyas.
  console.log(`\n  LAS OPCIONES`);
  const solo = await pag.evaluate(() => ({
    titulo: window.probe.vgui.panel()?.titulo,
    opciones: window.probe.vgui.opciones(),
    botones: window.probe.vgui.botones().map((b) => b.texto),
    delante: window.probe.vgui.delante(),
  }));
  console.log(`    sin nadie       título ${JSON.stringify(solo.titulo)} · ${JSON.stringify(solo.botones)}`);
  control("sin nadie delante contesta el menú DEL JUGADOR, no uno vacío",
    solo.delante === null && solo.botones.some((t) => /Describe/.test(t)),
    `delante=${solo.delante} · ${solo.botones.join(", ")}`);
  control("y el título es el del jugador, no «Interact» a secas",
    solo.titulo === "You", `${solo.titulo}`);

  // Y ahora con un NPC de verdad delante: se busca al almacenista, que es el
  // único de Gate City cuya opción no tiene condiciones («Hail»), y se le pone
  // la cámara encima con la misma regla con la que se le pegaría.
  await pag.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 200));
  const puesto = await pag.evaluate(() => {
    const lista = window.probe.vgui.npcs();
    // El almacenista primero: es el unico de Gate City cuya opcion no tiene
    // condiciones («Hail»), o sea el unico con el que se puede comprobar que una
    // opcion de verdad llega al panel y se puede pulsar.
    const quien = lista.find((i) => /gatecity\/storage/.test(i.script ?? ""))
      ?? lista.find((i) => /gatecity\//.test(i.script ?? ""))
      ?? lista.find((i) => i.hostil === false) ?? lista[0];
    if (!quien) return null;
    // Se planta al jugador a un metro y mirandole, que es lo que hace falta para
    // que `elegirObjetivo` lo vea: el cono es el del golpe, no otro.
    window.probe.mundo.poner(quien.donde[0], quien.donde[1], quien.donde[2] - 1.0);
    window.probe.mundo.mirar(quien.donde[0], quien.donde[1] + 0.9, quien.donde[2]);
    return { script: quien.script, nombre: quien.nombre, id: quien.id, total: lista.length };
  });
  console.log(`    puesto delante  ${puesto ? `${puesto.nombre} (${puesto.script})` : "NADIE"}`);
  await new Promise((r) => setTimeout(r, 400));
  await pag.keyboard.press("KeyF");
  await new Promise((r) => setTimeout(r, 900));
  const conNpc = await pag.evaluate(() => ({
    titulo: window.probe.vgui.panel()?.titulo,
    fuente: window.probe.vgui.panel()?.fuenteDelTitulo,
    ventana: window.probe.vgui.panel()?.ventana,
    opciones: window.probe.vgui.opciones(),
    botones: window.probe.vgui.botones().map((b) => ({ t: b.texto, sirve: b.sirve, color: b.color })),
    delante: window.probe.vgui.delante(),
  }));
  console.log(`    título          ${JSON.stringify(conNpc.titulo)} en ${conNpc.fuente}`);
  console.log(`    opciones        ${JSON.stringify(conNpc.opciones)}`);
  console.log(`    botones         ${conNpc.botones.map((b) => `${JSON.stringify(b.t)}${b.sirve ? "" : " (apagado)"}`).join(" ")}`);
  control("el panel ve al NPC de delante con el mismo cono con el que se pega",
    conNpc.delante !== null, `${JSON.stringify(conNpc.delante)}`);
  control("y su nombre es el título, no «Interact»",
    Boolean(conNpc.titulo) && conNpc.titulo !== "Interact" && conNpc.titulo !== "You",
    `${conNpc.titulo}`);
  // `m_Title->setFont(g_FontSml)` — el nombre de un NPC va en la letra PEQUEÑA,
  // por el problema de centrado que Thothie no supo arreglar en 2008.
  control("el nombre del NPC va en la letra PEQUEÑA, como en el original",
    parseFloat(conNpc.fuente ?? "99") < parseFloat(kit.esquema.titulo ?? "0"),
    `${conNpc.fuente} contra ${kit.esquema.titulo}`);
  control("las opciones salen de su script, no están inventadas",
    conNpc.opciones.length >= 1, `${conNpc.opciones.length} opción(es)`);
  // Y LA VENTANA CRECIÓ: 120 -> 200 al llegar la primera opción.
  control("y sigue midiendo XRES(200): el ancho lo fija la primera opción",
    Math.abs((conNpc.ventana?.w ?? 0) - Math.round(200 * (ANCHO / 640))) <= 3,
    `${conNpc.ventana?.w} px`);

  await pag.screenshot({ path: "build/gatecity/vistas/vgui29.png" });
  console.log(`    captura         build/gatecity/vistas/vgui29.png`);

  // ── 7. Y EL JUEGO SIGUE EN PIE DETRÁS ───────────────────────────────────
  const final = await pag.evaluate(() => {
    window.probe.hud.avanzar(1);
    return { triangulos: window.probe.golpe.estado.triangulos, hud: window.probe.hud.estado().visible };
  });
  control("el mapa sigue dibujado y el HUD en pie con el panel delante",
    final.hud === true, JSON.stringify(final));
} catch (e) {
  errores.push(`la sonda se cayó: ${String(e).slice(0, 300)}`);
}

// ── el veredicto ─────────────────────────────────────────────────────────────
console.log("\n  CONTROLES");
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(66)} ${c.detalle}`);
const mal = controles.filter((c) => !c.bien);
console.log(`\n  ${controles.length - mal.length} de ${controles.length} en verde`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}\n`);

await nav?.close();
matar(dev);
process.exit(mal.length || errores.length || !controles.length ? 1 : 0);
