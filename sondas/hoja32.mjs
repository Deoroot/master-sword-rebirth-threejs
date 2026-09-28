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
import { esNuestro, liberarPuerto } from "./mismo.mjs";
import { mkdirSync } from "node:fs";

const PORT = 5221;
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
  await pag.goto(`http://localhost:${PORT}/?map=gatecity`, { waitUntil: "load" });
  await esNuestro(pag, PORT);
  mkdirSync("build/gatecity/vistas", { recursive: true });

  await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
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
console.log(`\n  ${controles.length - mal.length} de ${controles.length} en verde`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}\n`);

await nav?.close();
matar(dev);
process.exit(mal.length || errores.length || !controles.length ? 1 : 0);
