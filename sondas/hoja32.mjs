// CHARACTER INFO, en un Chrome de verdad.
//
//   npm run sonda:hoja32
//
// El cuarto y último panel. Lo que lo distingue de los otros tres es
// `m_NoMouse = true`: **se lee sin soltar el puntero**, así que con la hoja
// delante el jugador sigue pudiendo girar la cámara y andar. Es lo contrario de
// lo que hacen los otros, y copiarlo al revés cambia cómo se juega.
//
// Las formas de que esto parezca funcionar y esté mal:
//
//    1. la P abre la hoja vieja                  -> hay que mirar QUÉ se abre
//    2. abre la nueva y congela al jugador       -> `m_NoMouse`: NO debe
//    3. no congela y no enseña nada              -> los seis datos y las nueve
//    4. enseña y los números están inventados    -> tienen que ser del personaje
//    5. RePág no cambia de habilidad             -> `MENUFLAG_TRAPSTEPINPUT`
//    6. cambia y el panel de al lado no          -> es el detalle de la elegida
//    7. la elegida no se distingue               -> `Color_SelectedText` es rojo

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";
import { mkdirSync } from "node:fs";

const PORT = 5221;
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (habia ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { shell: true, stdio: "ignore" });
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
await new Promise((r) => setTimeout(r, 6000));

// Cuántos controles TIENE que haber. No es decoración: si la sonda se va por el
// `catch` a mitad, el «X de Y» de abajo se calcularía sobre los que llegaron a
// correr y no podría bajar nunca — el experimento 65, que remató con «22 de 22
// en verde» habiéndose caído en el 22 de 30.
const DECLARADOS = 21;

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });
const errores = [];
let nav = null;

try {
  nav = await chromium.launch();
  const ANCHO = 1200, ALTO = 800;
  const pag = await nav.newPage({ viewport: { width: ANCHO, height: ALTO } });
  pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));

  // VITE RECARGA LA PÁGINA cuando otra sesión guarda un archivo, y la recarga se
  // lleva `window.probe`. Lo grave no es el rojo: es que **una pasada que se
  // recarga a la mitad está midiendo dos versiones del código a la vez**, y eso
  // puede salir verde. Se corta el canal de HMR por su SUBPROTOCOLO, así que el
  // WebSocket del multijugador sigue pasando.
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
  await pag.evaluate(() => window.probe.hud.avanzar(20));
  await pag.click("#view", { position: { x: 600, y: 400 } });

  // ── 1. LA P ABRE LA HOJA PORTADA ────────────────────────────────────────
  console.log(`\n  LA TECLA`);
  await pag.keyboard.press("KeyP");
  await new Promise((r) => setTimeout(r, 900));
  const abierto = await pag.evaluate(() => ({
    cual: window.probe.vgui.abierto(),
    panel: window.probe.vgui.panel(),
    vieja: Boolean(document.querySelector(".mx-hoja")),
    etiquetas: [...document.querySelectorAll(".vg-etiqueta")].map((n) => n.textContent).filter(Boolean),
  }));
  console.log(`    p -> panel      ${abierto.cual} · hoja vieja: ${abierto.vieja}`);
  console.log(`    ventana         ${JSON.stringify(abierto.panel?.ventana)}`);
  control("la `p` abre Character Info, y es el panel de VGUI",
    abierto.cual === "stats", `${abierto.cual}`);
  control("y no la hoja vieja de `interfaz`", abierto.vieja === false, `${abierto.vieja}`);
  // 330 de referencia a 1200 px de ancho.
  control("la ventana mide lo que dice el motor: XRES(330)×YRES(270)",
    Math.abs((abierto.panel?.ventana?.w ?? 0) - Math.round(330 * (ANCHO / 640))) <= 4,
    `${abierto.panel?.ventana?.w}x${abierto.panel?.ventana?.h}`);

  // ── 2. `m_NoMouse`: EL JUGADOR SIGUE ANDANDO ────────────────────────────
  //
  // El control que distingue este panel de los otros tres, y el que estaría en
  // verde por accidente si se copiara mal: con la hoja delante hay que PODER
  // moverse.
  console.log(`\n  m_NoMouse`);
  const p0 = await pag.evaluate(() => window.probe.player.feet);
  await pag.keyboard.down("KeyW");
  await new Promise((r) => setTimeout(r, 1200));
  await pag.keyboard.up("KeyW");
  const p1 = await pag.evaluate(() => window.probe.player.feet);
  const movido = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
  const atrapa = await pag.evaluate(() => window.probe.vgui.atrapaElRaton());
  console.log(`    W con la hoja   ${(movido * 100).toFixed(1)} cm · atrapa el ratón: ${atrapa}`);
  control("CON LA HOJA DELANTE EL JUGADOR SIGUE ANDANDO: `m_NoMouse = true`",
    movido > 0.5 && atrapa === false, `${(movido * 100).toFixed(1)} cm, atrapa=${atrapa}`);
  // Y EL PUNTERO TAMPOCO SE SUELTA, que es la otra mitad de `m_NoMouse` y la que
  // se habría portado al revés con más facilidad: `VGUI_MainPanel::
  // UpdateCursorState` sale por la puerta de atrás sin tocar el cursor cuando el
  // panel lo declara (vgui_global.cpp:103-108). Una hoja de personaje que te
  // quita la cámara para leerla sería nuestra invención, no el juego.
  const punteroConHoja = await pag.evaluate(() => window.probe.vgui.puntero());
  console.log(`    puntero         ${punteroConHoja ? "atrapado, como debe" : "SUELTO (mal)"}`);
  control("y el puntero sigue siendo del juego: la hoja se lee sin perder la cámara",
    punteroConHoja === true, punteroConHoja ? "" : "suelto: mirar la hoja no puede costar el ratón");
  // Y el control que hace que el de arriba signifique algo: el inventario, que
  // NO tiene `m_NoMouse`, sí congela. Si los dos dejaran andar, «m_NoMouse» no
  // estaría implementado, estaría ausente.
  await pag.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 300));
  await pag.keyboard.press("KeyI");
  await new Promise((r) => setTimeout(r, 700));
  const p2 = await pag.evaluate(() => window.probe.player.feet);
  await pag.keyboard.down("KeyW");
  await new Promise((r) => setTimeout(r, 1200));
  await pag.keyboard.up("KeyW");
  const p3 = await pag.evaluate(() => window.probe.player.feet);
  const movido2 = Math.hypot(p3[0] - p2[0], p3[2] - p2[2]);
  console.log(`    W con el invent.${(movido2 * 100).toFixed(1)} cm`);
  control("EL CONTRASTE: el inventario, que no lo tiene, sí congela",
    movido2 < 0.05, `${(movido2 * 100).toFixed(1)} cm`);
  const punteroConInv = await pag.evaluate(() => window.probe.vgui.puntero());
  console.log(`    puntero         ${punteroConInv ? "ATRAPADO (mal)" : "suelto, como debe"}`);
  control("y EL CONTRASTE DEL PUNTERO: el inventario sí lo suelta",
    punteroConInv === false, punteroConInv ? "atrapado: no se podría pulsar nada" : "suelto");
  await pag.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 300));

  // ── 3. LOS NÚMEROS SON DEL PERSONAJE ────────────────────────────────────
  console.log(`\n  LO QUE DICE`);
  await pag.keyboard.press("KeyP");
  await new Promise((r) => setTimeout(r, 800));
  const dice = await pag.evaluate(() => ({
    // SÓLO las del panel abierto. Los otros tres paneles siguen montados y
    // escondidos, y `querySelectorAll` los encuentra igual: sin acotar, el «Gold:
    // 10» del inventario se contaba como un dato general de la hoja y salían
    // ocho donde hay seis.
    etiquetas: [...document.querySelectorAll(".vg-hoja .vg-etiqueta")]
      .filter((n) => n.offsetParent !== null).map((n) => n.textContent).filter(Boolean),
    verdad: {
      nombre: window.probe.sesion.personaje?.nombre,
      oro: window.probe.sesion.personaje?.oro,
    },
  }));
  const gen = dice.etiquetas.filter((t) => /^(Name|Gold|Health|Mana|Stamina|Weight):/.test(t));
  // Las habilidades son las nueve etiquetas de la SEGUNDA columna: contarlas por
  // su nombre obliga a escribir los nueve aquí y a mantenerlos, que es duplicar
  // el catálogo dentro de la sonda. Se cuentan por dónde están.
  const hab = await pag.evaluate(() => {
    // Dentro de LA VENTANA —no del panel de la habilidad, que va fuera y a la
    // derecha—, la columna de la derecha. Se agrupa por la x y se coge la mayor:
    // así no hay que escribir los nueve nombres aquí y mantenerlos.
    const cajas = [...document.querySelectorAll(".vg-hoja > div")];
    const ventana = cajas.sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x)[0];
    const ns = [...ventana.querySelectorAll(".vg-etiqueta")]
      .filter((n) => n.offsetParent && /: /.test(n.textContent));
    const columna = Math.max(...ns.map((n) => Math.round(n.getBoundingClientRect().x)));
    return ns.filter((n) => Math.round(n.getBoundingClientRect().x) === columna).map((n) => n.textContent);
  });
  console.log(`    generales       ${JSON.stringify(gen)}`);
  console.log(`    habilidades     ${hab.length}`);
  control("enseña los seis datos generales que enseña el original",
    gen.length === 6, `${gen.length}: ${gen.map((t) => t.split(":")[0]).join(", ")}`);
  control("y son los del personaje, no un ejemplo",
    gen.includes(`Name: ${dice.verdad.nombre}`) && gen.includes(`Gold: ${dice.verdad.oro}`),
    `${gen[0]} / ${gen[1]}`);
  // Y NINGUNO ES CERO, que es el control que faltaba: la primera versión leía
  // `d.vida` donde la clave es `d.vidaMax`, y la hoja decía «Health: 0» con el
  // HUD gritando 15/15 tres centímetros más abajo. Todos los controles en verde.
  const ceros = gen.filter((t) => /^(Health|Mana|Stamina|Weight): 0$/.test(t));
  control("y ninguno sale a cero teniendo el HUD números de verdad",
    ceros.length === 0, ceros.length ? ceros.join(", ") : "ninguno a cero");
  control("y las nueve habilidades", hab.length === 9, `${hab.length}`);

  // ── 4. REPÁG Y AVPÁG CAMBIAN DE HABILIDAD ───────────────────────────────
  console.log(`\n  REPÁG / AVPÁG`);
  const titulo = () => pag.evaluate(() => {
    const ns = [...document.querySelectorAll(".vg-etiqueta")].map((n) => n.textContent);
    return { elegida: document.querySelectorAll('[data-elegida="si"]').length, todas: ns };
  });
  // El panel de la habilidad va FUERA de la ventana y a su derecha, así que se
  // identifica por su sitio y no por el orden en el árbol.
  const detalle = () => pag.evaluate(() => {
    const cajas = [...document.querySelectorAll(".vg-hoja > div")];
    const info = cajas.sort((a, b) => b.getBoundingClientRect().x - a.getBoundingClientRect().x)[0];
    return [...(info?.querySelectorAll(".vg-etiqueta") ?? [])].map((n) => n.textContent).filter(Boolean);
  });
  const antes = await detalle();
  await pag.keyboard.press("PageDown");
  await new Promise((r) => setTimeout(r, 400));
  const despues = await detalle();
  console.log(`    antes           ${JSON.stringify(antes.slice(0, 2))}`);
  console.log(`    tras AvPág      ${JSON.stringify(despues.slice(0, 2))}`);
  control("AvPág cambia la habilidad elegida, y el panel de al lado con ella",
    antes[0] !== despues[0] && Boolean(despues[0]), `${antes[0]} -> ${despues[0]}`);
  await pag.keyboard.press("PageUp");
  await new Promise((r) => setTimeout(r, 400));
  const vuelta = await detalle();
  control("y RePág vuelve", vuelta[0] === antes[0], `${vuelta[0]}`);

  // El rojo de la elegida: `Color_SelectedText = COLOR(255, 0, 0, 0)`.
  //
  // `offsetParent !== null` no es adorno: cuenta sólo lo que SE VE. Sin él esto
  // barría el documento entero y contaba también el botón «Tiled» del
  // inventario, que es rojo porque está armado (`armado = [255,0,0,0]`,
  // widgets.js:289) y sigue en el DOM con su panel escondido. O sea que el
  // experimento 31 puso un segundo rojo en la página y este control se volvió
  // rojo sin que nada de la hoja cambiara — y no se vio porque esta sonda no se
  // volvió a pasar. Una etiqueta roja que nadie puede ver no es una etiqueta
  // roja.
  const rojo = await pag.evaluate(() =>
    [...document.querySelectorAll(".vg-etiqueta")]
      .filter((n) => n.offsetParent !== null && getComputedStyle(n).color === "rgb(255, 0, 0)")
      .map((n) => n.textContent));
  control("la elegida se pinta en ROJO, que es `Color_SelectedText`",
    rojo.length === 1, `${rojo.length}: ${rojo[0] ?? "ninguna"}`);

  // ── 6. LOS DOS FORMATOS, QUE SON DOS A PROPÓSITO ────────────────────────
  //
  // `vgui_stats.cpp` pinta las habilidades en dos sitios con dos formatos
  // distintos, y la confusión entre ellos es el encargo que llegó a esta sesión
  // descrito al revés. Lo que dice el motor:
  //
  //   la lista de la IZQUIERDA, nombre y número y nada más
  //     "%s: %i\n"                                  vgui_stats.cpp:277
  //   el panel de la DERECHA, con el porcentaje
  //     "%s: %i (%.2f%%%%) [%i left]\n"             vgui_stats.cpp:344
  //
  // O sea que añadir el porcentaje a la fila elegida de la izquierda sería
  // inventarse un Master Sword que no existe. Los dos controles van juntos para
  // que el segundo no se pueda «arreglar» sin ver el primero.
  console.log(`\n  LOS DOS FORMATOS`);
  const CON_PORCENTAJE = /^[A-Z][A-Za-z ]*: -?\d+ \(\d+\.\d{2}%\) \[-?\d+ left\]$/;
  const filasDerecha = await detalle();
  const cuerpoDerecha = filasDerecha.filter((t) => /: /.test(t));
  console.log(`    derecha         ${JSON.stringify(cuerpoDerecha)}`);
  console.log(`    izquierda       ${JSON.stringify(hab.slice(0, 3))} …`);
  control("el panel de la DERECHA trae `(%.2f%%)` y `[%i left]`",
    cuerpoDerecha.length > 0 && cuerpoDerecha.every((t) => CON_PORCENTAJE.test(t)),
    cuerpoDerecha.length ? cuerpoDerecha[0] : "ni una fila");
  // El nombre sale de `SkillTypeList`, no de la clave interna. Lo que había antes
  // era `${p.clave}`, o sea «proficiency» en minúscula — el fallo que delata que
  // nadie había comparado este panel con el original.
  control("y el nombre es el de `SkillTypeList`, con mayúscula y no la clave interna",
    cuerpoDerecha.every((t) => /^[A-Z]/.test(t)) && !cuerpoDerecha.some((t) => /^[a-z]/.test(t)),
    cuerpoDerecha.map((t) => t.split(":")[0]).join(", "));
  // Y LA FIDELIDAD POR EL OTRO LADO: la izquierda NO lo lleva.
  const izquierdaConPct = hab.filter((t) => /%/.test(t) || /left/.test(t));
  control("y la lista de la IZQUIERDA NO lo lleva, que es lo que hace el original",
    izquierdaConPct.length === 0,
    izquierdaConPct.length ? `inventado en ${izquierdaConPct.length}: ${izquierdaConPct[0]}` : "nombre y número");
  // EL CONTROL POSITIVO del de arriba, que mide una AUSENCIA: el mismo detector,
  // sobre una entrada que sí la tiene. Sin esto, un `hab` vacío —o un selector
  // que dejara de encontrar la columna— daría «ninguna lleva porcentaje» en verde
  // con la pantalla llena de ellos.
  control("CONTROL POSITIVO: el detector de porcentaje sí lo ve donde está",
    hab.length === 9 && cuerpoDerecha.some((t) => /%/.test(t) && /left/.test(t)),
    `${hab.length} filas leídas a la izquierda, ${cuerpoDerecha.filter((t) => /%/.test(t)).length} con % a la derecha`);

  // ── 7. PARRY ESCONDE EL PANEL ENTERO ────────────────────────────────────
  //
  //     if (m_ActiveStat < 0 || msstring(SkillStatList[m_ActiveStat].Name) == "Parry")
  //     { m_InfoPanel->setVisible(false); return; }
  //                                     vgui_stats.cpp:295-299
  //
  // Parry tiene UNA propiedad, así que un panel de cinco renglones para un número
  // no dice nada y el original lo retira.
  console.log(`\n  PARRY`);
  const iParry = hab.findIndex((t) => /^Parry:/.test(t));
  // Se cuentan las cajas VISIBLES de primer nivel, y no se busca «la de la
  // derecha»: una caja escondida mide `x = 0`, así que ordenar por `x` y coger la
  // mayor devuelve LA VENTANA en cuanto el panel se esconde — que es justo el caso
  // que este control viene a medir. La primera versión de este lector hacía eso y
  // decía «se ve» con el panel escondido, leyendo la ventana y creyendo que leía
  // el panel. Es el aviso del 69 —comprueba que tu instrumento podía ver la
  // ausencia— y el del 78: el selector seguía devolviendo algo, sólo que otra cosa.
  //
  // `.vg-hoja` tiene exactamente dos hijas: la ventana y el panel de la habilidad.
  const cajasVisibles = () => pag.evaluate(() =>
    [...document.querySelectorAll(".vg-hoja > div")].filter((n) => n.offsetParent !== null).length);
  const panelDerechoSeVe = async () => (await cajasVisibles()) === 2;
  const verseAntes = await panelDerechoSeVe();
  for (let i = 0; i < iParry; i++) {
    await pag.keyboard.press("PageDown");
    await new Promise((r) => setTimeout(r, 150));
  }
  await new Promise((r) => setTimeout(r, 400));
  const verseConParry = await panelDerechoSeVe();
  console.log(`    Parry es la ${iParry + 1}ª · cajas visibles antes: ${verseAntes ? 2 : "≠2"} · con Parry: ${await cajasVisibles()}`);
  control("con `Parry` elegido el panel de la derecha SE ESCONDE",
    iParry >= 0 && verseConParry === false, `Parry en la posición ${iParry}, panel visible=${verseConParry}`);
  // El control positivo, que es el que hace que el de arriba signifique algo: si
  // el panel estuviera escondido SIEMPRE —o si el lector mirara la caja
  // equivocada— lo de arriba saldría verde sin que Parry tuviera nada que ver.
  control("CONTROL POSITIVO: con cualquier otra habilidad sí se ve",
    verseAntes === true, `antes de llegar a Parry: ${verseAntes}`);
  // Y se vuelve a una habilidad normal para que la captura sea la útil.
  await pag.keyboard.press("PageDown");
  await new Promise((r) => setTimeout(r, 400));

  await pag.screenshot({ path: "build/gatecity/vistas/hoja32.png" });
  console.log(`    captura         build/gatecity/vistas/hoja32.png`);

  // ── 5. Y LA P LA CIERRA ─────────────────────────────────────────────────
  await pag.keyboard.press("KeyP");
  await new Promise((r) => setTimeout(r, 400));
  control("la `p` la cierra: es un interruptor",
    (await pag.evaluate(() => window.probe.vgui.abierto())) === null);
} catch (e) {
  errores.push(`la sonda se cayó: ${String(e).slice(0, 300)}`);
}

console.log("\n  CONTROLES");
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(66)} ${c.detalle}`);
const mal = controles.filter((c) => !c.bien);
// Sobre los DECLARADOS y no sobre los que corrieron. Ver arriba.
console.log(`\n  ${controles.length - mal.length} de ${DECLARADOS} en verde`);
if (controles.length !== DECLARADOS) {
  console.log(`  !! FALTAN ${DECLARADOS - controles.length}: la sonda no llegó al final`);
}
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}\n`);

await nav?.close();
matar(dev);
process.exit(mal.length || errores.length || controles.length !== DECLARADOS ? 1 : 0);
