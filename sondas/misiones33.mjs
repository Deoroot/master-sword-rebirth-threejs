// LA MISIÓN DEL ALCALDE, HECHA COMO LA HACE UN JUGADOR, en un Chrome de verdad.
//
//   npm run sonda:misiones33
//
// `npm test` comprueba 88 cosas del intérprete, del pago y del guardado.
// Ninguna de esas 88 dice que pulsar la F delante del alcalde y teclear un
// número entregue la cabeza del goblin.
//
// Y ÉSE es el fallo que esta sonda existe para no cometer. La forma de que el
// 33 esté verde sin que la misión se pueda hacer es exactamente la del 29: un
// `Map` de misiones con pruebas de Node en verde, y el jugador delante del
// alcalde sin poder darle nada.
//
// Por eso aquí **no se llama a `elegir()` en ningún control**. Se pulsa la F
// con el teclado y se teclea el número, como los teclea una persona.
// `probe.misiones` sólo LEE y prepara la mochila.
//
// Las formas de que esto esté verde midiendo nada:
//
//    1. la sonda elige la opción por código   -> no se prueba `menuselect`. Prohibido.
//    2. se elige y no pasa nada               -> hay que medir el INVENTARIO, no el panel
//    3. pasa algo y no es el pago             -> hay que medir el oro ANTES y DESPUÉS
//    4. se cobra y no se recompensa           -> las dos mitades, por separado
//    5. se cobra siempre                      -> EL CONTROL POSITIVO: sin la cabeza, nada
//    6. el mensaje sale y el cobro también    -> con el control se miran las dos cosas
//    7. la misión no se cierra                -> la opción tiene que DESAPARECER después
//    8. se cierra y no se guarda              -> hay que releer el personaje del almacén
//    9. el NPC de delante es otro             -> hay que comprobar que es el alcalde
//   10. el guion no está horneado             -> se mide el respaldo del 29, no esto

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";
import { mkdirSync } from "node:fs";

const PORT = 5216;
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (habia ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { shell: true, stdio: "ignore" });
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
await new Promise((r) => setTimeout(r, 6000));

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });
const errores = [];
let nav = null;

/** Adelanta el reloj del juego sin dormir: es el mismo `pasoDelHud` del bucle. */
const correrElTiempo = async (pag, segundos) => {
  await pag.evaluate((s) => { for (let i = 0; i < s * 10; i++) window.probe.hud.avanzar(0.1); }, segundos);
  await new Promise((r) => setTimeout(r, 120));
};

/**
 * El texto seguido de la consola, SIN los prefijos de tipo y SIN los cortes.
 *
 * La consola parte las líneas que no caben («You have proven» / «your worth!»,
 * `partir()` en `src/play/hud.js`), así que buscar una frase entera en las
 * líneas sueltas no la encuentra. Un primer intento de esta sonda salió en
 * rojo por eso, con el alcalde diciendo exactamente lo que tenía que decir.
 */
const seguido = (lineas) => lineas.map((l) => String(l).replace(/^[a-z]+: /, "")).join(" ");

/** Pulsa el botón número `i` (0-based) como lo pulsa una persona: con el dígito. */
const teclearOpcion = async (pag, i) => {
  // `SlotInput(dígito − 1)`: el 1 es el botón 0. El 0 da la ranura −1 y no
  // elige nada, que es el fallo portado del 29.
  await pag.keyboard.press(`Digit${i + 1}`);
  await new Promise((r) => setTimeout(r, 300));
};

try {
  nav = await chromium.launch();
  const ANCHO = 1200, ALTO = 800;
  const pag = await nav.newPage({ viewport: { width: ANCHO, height: ALTO } });
  pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
  // EL CORTE DEL `vite-hmr`, el mismo que `sondas/jugador64.mjs`. Con varias
  // sesiones guardando a la vez, Vite recarga la página a media pasada y la
  // sonda se cae por donde le toque: una vez fue un `waitForFunction` agotado
  // que remató con «0 de 0 en verde» —la forma del 65, un marcador que sólo
  // cuenta lo que llegó a correr— y la siguiente un `window.probe` undefined
  // leyendo `.sesion`. Dos síntomas de la misma causa, ninguno del juego.
  //
  // Esto apaga SÓLO el socket de recarga en caliente: cualquier otro
  // `WebSocket` —el del multijugador— sigue siendo el de verdad. Si la página
  // se recargara por otro motivo, se seguiría viendo igual.
  await pag.addInitScript(() => {
    const Real = window.WebSocket;
    window.WebSocket = function (url, protos) {
      const esHmr = protos === "vite-hmr" || (Array.isArray(protos) && protos.includes("vite-hmr"));
      if (!esHmr) return new Real(url, protos);
      return { close() {}, send() {}, addEventListener() {}, removeEventListener() {}, readyState: 3 };
    };
  });
  // SE ENTRA POR EL MENÚ, como el jugador (57). Antes era `?map=gatecity`,
  // que se salta el menú: carga el nivel y arranca la sesión de una pasada,
  // que es un montaje que el jugador no ve nunca. Ver `sondas/entrar.mjs`.
  await entrarPorElMenu(pag, PORT);
  mkdirSync("build/gatecity/vistas", { recursive: true });

  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
  await pag.waitForFunction(() => window.probe.vgui.abierto() === null, null, { timeout: 60000 });
  await pag.evaluate(() => window.probe.vivo.congelarPaseo(true));
  await pag.evaluate(() => window.probe.hud.avanzar(40));

  // ── 0. LOS GUIONES ESTÁN HORNEADOS ───────────────────────────────────────
  //
  // Sin esto la sonda mediría el RESPALDO del 29 —la ficha de `menus.json`—
  // y todos los controles de abajo saldrían en rojo por el motivo equivocado.
  console.log(`\n  LOS GUIONES`);
  const cimientos = await pag.evaluate(() => ({
    hay: window.probe.misiones.hay(),
    censo: window.probe.misiones.censo(),
    misiones: window.probe.misiones.puestas(),
  }));
  console.log(`    horneados       ${cimientos.hay}`);
  if (cimientos.censo) {
    const c = cimientos.censo;
    console.log(`    censo           ${c.conMenu} scripts con menú`);
    console.log(`                    ${c.menuCabe} con el MENÚ entero · ${c.algunaOpcion} con ALGUNA opción · ${c.caben} ENTEROS`);
  }
  control("los guiones de los NPC están horneados (`npm run guiones`)", cimientos.hay === true);
  control("y traen el censo medido: el resultado del experimento es una cuenta",
    Boolean(cimientos.censo?.conMenu), JSON.stringify(cimientos.censo));
  control("un personaje nuevo no trae ninguna misión puesta",
    Array.isArray(cimientos.misiones) && cimientos.misiones.length === 0,
    JSON.stringify(cimientos.misiones));

  // ── 1. DELANTE DEL ALCALDE, con la cabeza del goblin ─────────────────────
  //
  // La cabeza se pone a mano y se dice: en el juego sale de matar al jefe
  // goblin, que está en las cuevas y no cabe en esta sonda. Lo que se mide es
  // lo de DESPUÉS, que es lo que el 33 vino a hacer.
  console.log(`\n  DELANTE DEL ALCALDE`);
  const puesto = await pag.evaluate(() => {
    const quien = window.probe.vgui.npcs().find((i) => /gatecity\/mayor/.test(i.script ?? ""));
    if (!quien) return null;
    window.probe.misiones.dar("item_goblinhead", 1);
    window.probe.mundo.poner(quien.donde[0], quien.donde[1], quien.donde[2] - 1.0);
    window.probe.mundo.mirar(quien.donde[0], quien.donde[1] + 0.9, quien.donde[2]);
    return { id: quien.id, nombre: quien.nombre, script: quien.script };
  });
  console.log(`    quién           ${puesto ? `${puesto.nombre} (${puesto.script})` : "NO ESTÁ"}`);
  control("el alcalde de Gate City está en el mapa y es a quien miramos",
    puesto !== null && /mayor/.test(puesto?.script ?? ""), JSON.stringify(puesto));
  await pag.waitForFunction(() => window.probe.vgui.delante() !== null, null, { timeout: 15000 }).catch(() => {});

  // LA F, con el teclado.
  await pag.keyboard.press("KeyF");
  await new Promise((r) => setTimeout(r, 900));
  const menu = await pag.evaluate((id) => ({
    cual: window.probe.vgui.abierto(),
    titulo: window.probe.vgui.panel()?.titulo,
    botones: window.probe.vgui.botones().map((b) => b.texto),
    opciones: window.probe.misiones.opcionesDe(id),
    bolsa: window.probe.misiones.bolsa(),
  }), puesto?.id);
  console.log(`    F -> panel      ${menu.cual} · título ${JSON.stringify(menu.titulo)}`);
  console.log(`    botones         ${menu.botones.map((t) => JSON.stringify(t)).join(" ")}`);
  console.log(`    lo que hay detrás ${JSON.stringify(menu.opciones)}`);
  control("LA F ABRE EL MENÚ DEL ALCALDE, por la tabla de teclas del juego",
    menu.cual === "interact" && /Vilhelm/.test(menu.titulo ?? ""), `${menu.cual} · ${menu.titulo}`);
  // LAS SIETE del script, no las cuatro que leía la ficha del 29: tres son de
  // `monsters/base_chat`, que el lector de entonces no seguía.
  control("las opciones salen de EJECUTAR su `game_menu_getoptions`, con las de `base_chat`",
    menu.botones.includes("Hail") && menu.botones.includes("Ask about Jobs"),
    menu.botones.join(", "));
  const iDar = menu.botones.indexOf("Give Goblin's Head");
  console.log(`    «Give Goblin's Head» es el botón ${iDar} -> se teclea el ${iDar + 1}`);
  control("con la cabeza encima, «Give Goblin's Head» ESTÁ en el menú", iDar >= 0, `${iDar}`);
  control("y es de tipo `payment`, que es lo que la cobra",
    menu.opciones?.[iDar]?.tipo === "payment", JSON.stringify(menu.opciones?.[iDar]));

  await pag.screenshot({ path: "build/gatecity/vistas/misiones33-menu.png" });

  // ── 2. EL CONTROL POSITIVO, y va ANTES de hacer la misión ────────────────
  //
  // Sin la cabeza la opción NO se ofrece —el `if` viejo de `mayor.script:130`
  // abandona el bloque—, así que el único camino que un jugador tiene para
  // llegar a la rama del «no puedes» es perderla con el menú abierto: el
  // servidor guardó la lista al abrirlo (`m_MenuOptions`, :2917) y la vuelve a
  // comprobar al elegir.
  console.log(`\n  EL CONTROL POSITIVO: pagar SIN la cabeza`);
  const antesDelControl = await pag.evaluate(() => {
    window.probe.misiones.quitar("item_goblinhead");
    return window.probe.misiones.bolsa();
  });
  console.log(`    antes           oro ${antesDelControl.oro} · ${JSON.stringify(antesDelControl.objetos)}`);
  await teclearOpcion(pag, iDar);
  await correrElTiempo(pag, 12);
  const trasElControl = await pag.evaluate(() => ({
    bolsa: window.probe.misiones.bolsa(),
    consola: window.probe.misiones.dicho(),
    panel: window.probe.vgui.abierto(),
  }));
  const dijo = seguido(trasElControl.consola);
  console.log(`    después         oro ${trasElControl.bolsa.oro} · ${JSON.stringify(trasElControl.bolsa.objetos)}`);
  console.log(`    la consola dice ${dijo.slice(-160)}`);
  control("NO SE COBRÓ NADA: el oro no se movió",
    trasElControl.bolsa.oro === antesDelControl.oro,
    `${antesDelControl.oro} -> ${trasElControl.bolsa.oro}`);
  control("y el juego dice QUÉ falta, con el nombre del objeto, no con su clave",
    /can't afford the payment of Goblin Chief's Head/.test(dijo), dijo.slice(-200));
  control("y el alcalde NO dio las gracias: `say_ending` no se llamó",
    !/proven your worth/.test(dijo), dijo.slice(-200));
  control("el panel se cerró al elegir, como cualquier opción",
    trasElControl.panel === null, `${trasElControl.panel}`);

  // ── 3. Y AHORA LA MISIÓN, ENTERA ─────────────────────────────────────────
  console.log(`\n  LA MISIÓN`);
  const antes = await pag.evaluate((id) => {
    window.probe.misiones.dar("item_goblinhead", 1);
    return { bolsa: window.probe.misiones.bolsa(), consola: window.probe.misiones.dicho().length };
  }, puesto?.id);
  console.log(`    antes           oro ${antes.bolsa.oro} · ${JSON.stringify(antes.bolsa.objetos)}`);

  await pag.keyboard.press("KeyF");
  await new Promise((r) => setTimeout(r, 900));
  const menu2 = await pag.evaluate(() => window.probe.vgui.botones().map((b) => b.texto));
  const iDar2 = menu2.indexOf("Give Goblin's Head");
  console.log(`    menú            ${menu2.map((t) => JSON.stringify(t)).join(" ")}`);
  control("la opción vuelve a estar con la cabeza encima", iDar2 >= 0, menu2.join(", "));

  await teclearOpcion(pag, iDar2);
  // Las frases van encadenadas con `calleventtimed 3`: sin adelantar el reloj
  // la recompensa no ha llegado todavía, y medir aquí daría un rojo que no es.
  const aMitad = await pag.evaluate(() => window.probe.misiones.bolsa());
  await correrElTiempo(pag, 12);
  const despues = await pag.evaluate(() => ({
    bolsa: window.probe.misiones.bolsa(),
    consola: window.probe.misiones.dicho(),
    pendientes: window.probe.misiones.pendientes(),
  }));
  const dijo2 = seguido(despues.consola);
  console.log(`    al cobrar       oro ${aMitad.oro} · ${JSON.stringify(aMitad.objetos)}`);
  console.log(`    al terminar     oro ${despues.bolsa.oro} · ${JSON.stringify(despues.bolsa.objetos)}`);
  console.log(`    la consola dice ${dijo2.slice(-260)}`);

  control("LA CABEZA SALIÓ DEL INVENTARIO, y en el mismo momento del cobro",
    !aMitad.objetos.some((o) => /item_goblinhead/.test(o)),
    JSON.stringify(aMitad.objetos));
  control("el alcalde contesta lo que dice su script",
    /proven your worth/.test(dijo2), dijo2.slice(-260));
  control("LA RECOMPENSA ENTRÓ: el oro subió entre 50 y 60, que es `$rand(50,60)`",
    despues.bolsa.oro - antes.bolsa.oro >= 50 && despues.bolsa.oro - antes.bolsa.oro <= 60,
    `${antes.bolsa.oro} -> ${despues.bolsa.oro}`);
  control("y las frases con retardo llegaron todas: no queda ninguna en la cola",
    despues.pendientes === 0, `${despues.pendientes} pendientes`);

  await pag.screenshot({ path: "build/gatecity/vistas/misiones33-hecha.png" });

  // ── 4. Y LA MISIÓN SE CIERRA ─────────────────────────────────────────────
  //
  // `setvard QUEST_GOBLINCHIEF 1` (mayor.script:171) y `if( !QUEST_GOBLINCHIEF )`
  // (:128): la opción tiene que desaparecer aunque traigas otra cabeza.
  console.log(`\n  LA MISIÓN SE CIERRA`);
  await pag.evaluate(() => window.probe.misiones.dar("item_goblinhead", 1));
  await pag.keyboard.press("KeyF");
  await new Promise((r) => setTimeout(r, 900));
  const menu3 = await pag.evaluate(() => window.probe.vgui.botones().map((b) => b.texto));
  console.log(`    menú            ${menu3.map((t) => JSON.stringify(t)).join(" ")}`);
  control("con la misión hecha, la opción DESAPARECE aunque traigas otra cabeza",
    !menu3.includes("Give Goblin's Head"), menu3.join(", "));
  control("pero el resto del menú sigue ahí: no se ha roto el NPC",
    menu3.includes("Hail"), menu3.join(", "));
  await pag.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 200));

  // ── 5. EL GUARDADO, que es lo que este proyecto ya ha pagado una vez ─────
  console.log(`\n  EL GUARDADO`);
  const guardado = await pag.evaluate(async () => {
    const p = window.probe.sesion.personaje;
    const oro = p.oro;
    await window.probe.sesion.salir();               // guarda al desconectar
    const lista = await window.probe.sesion.listar();
    const cual = lista.find((x) => x.nombre === "Sonda") ?? lista[0];
    await window.probe.sesion.entrar(cual.id);
    const q = window.probe.sesion.personaje;
    return { antes: oro, despues: q.oro, misiones: q.misiones ?? null, nombre: q.nombre };
  });
  console.log(`    ida y vuelta    oro ${guardado.antes} -> ${guardado.despues} · misiones ${JSON.stringify(guardado.misiones)}`);
  control("el oro de la recompensa SOBREVIVE a guardar y volver a entrar",
    guardado.despues === guardado.antes, `${guardado.antes} -> ${guardado.despues}`);
  control("y el personaje releído trae su lista de misiones, aunque esté vacía",
    Array.isArray(guardado.misiones), JSON.stringify(guardado.misiones));

  // ── 6. LO QUE EL GUION NO SABE HACER, DICHO ──────────────────────────────
  //
  // Si esta lista estuviera vacía sería que el intérprete se está tragando lo
  // que no entiende, que es la única forma de que un puerto parcial parezca
  // completo.
  const sinces = await pag.evaluate((id) => window.probe.misiones.noSoportados(id), puesto?.id);
  console.log(`\n  LO QUE NO SABE HACER`);
  console.log(`    ${(sinces ?? []).join(" · ")}`);
  control("el guion APUNTA lo que no sabe hacer en vez de tragárselo",
    Array.isArray(sinces) && sinces.length > 0, `${sinces?.length}`);

  // ── 7. Y EL JUEGO SIGUE EN PIE ───────────────────────────────────────────
  const final = await pag.evaluate(() => {
    window.probe.hud.avanzar(1);
    return { hud: window.probe.hud.estado().visible, panel: window.probe.vgui.abierto() };
  });
  control("el HUD sigue en pie y no hay ningún panel atascado",
    final.hud === true, JSON.stringify(final));
} catch (e) {
  errores.push(`la sonda se cayó: ${String(e).slice(0, 300)}`);
}

console.log("\n  CONTROLES");
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(68)} ${c.detalle}`);
const mal = controles.filter((c) => !c.bien);
console.log(`\n  ${controles.length - mal.length} de ${controles.length} en verde`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}\n`);

await nav?.close();
matar(dev);
process.exit(mal.length || errores.length || !controles.length ? 1 : 0);
