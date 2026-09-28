// EL INVENTARIO, en un Chrome de verdad.
//
//   npm run sonda:inventario31
//
// Lo que este experimento retira es una rejilla que nos inventamos. Así que el
// primer control no es «¿sale el panel?» sino **«¿se ha ido la rejilla?»**: un
// panel nuevo encima del viejo, con los dos respondiendo a la `i`, sería peor
// que no haber tocado nada.
//
// Las formas de que esto parezca funcionar y esté mal:
//
//    1. sale el panel Y la rejilla                -> dos paneles, una tecla
//    2. sale sólo el panel y no tiene las piezas  -> equipo, contenedor, info
//    3. tiene las piezas y están vacías           -> hay que mirar lo que lleva
//    4. la columna del equipo mide lo que parece  -> `GEARPNL_SIZE_X` es YRES(80)
//    5. el contenedor tiene ancho propio          -> mide LO QUE SOBRA
//    6. señalar un objeto no dice nada            -> el panel de información
//    7. la rueda mueve el juego                   -> con panel, es del panel

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { esNuestro, liberarPuerto } from "./mismo.mjs";
import { mkdirSync } from "node:fs";

const PORT = 5219;
// Se mata a quien estuviera en el puerto ANTES de arrancar el nuestro.
// `--strictPort` hace que el nuestro falle si esta ocupado, y con
// `stdio: "ignore"` ese fallo no se ve: la sonda acaba midiendo el programa
// de otro. Ver `sondas/mismo.mjs`.
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
  // Para que haya algo que mirar dentro: las siete armas de partida.
  await pag.evaluate(() => window.probe.ranuras.armarse());
  await pag.evaluate(() => window.probe.hud.avanzar(20));
  await pag.click("#view", { position: { x: 600, y: 400 } });
  // El control positivo del puntero, antes de abrir: sin esto, «al abrir se
  // suelta» saldría verde en un navegador que nunca lo hubiera atrapado.
  const punteroJugando = await pag.evaluate(() => window.probe.vgui.puntero());
  control("jugando, el clic en el mapa ATRAPA el puntero", punteroJugando === true,
    "si esto sale rojo, el control del ratón de abajo no mide nada");

  // ── 1. LA `i` LO ABRE, Y LA REJILLA NO SALE ─────────────────────────────
  console.log(`\n  LA TECLA`);
  await pag.keyboard.press("KeyI");
  await new Promise((r) => setTimeout(r, 900));
  const abierto = await pag.evaluate(() => ({
    cual: window.probe.vgui.abierto(),
    panel: window.probe.vgui.panel(),
    rejilla: document.querySelectorAll(".mx-casilla, .mx-rejilla").length,
    velo: Boolean(document.querySelector(".mx-velo")),
    equipo: [...document.querySelectorAll(".vg-inv-lista")][0]?.getBoundingClientRect(),
    contenedor: [...document.querySelectorAll(".vg-inv-lista")][1]?.getBoundingClientRect(),
    filasEquipo: [...document.querySelectorAll(".vg-inv-lista")][0]?.children.length ?? 0,
    equipoTextos: [...([...document.querySelectorAll(".vg-inv-lista")][0]?.children ?? [])]
      .map((n) => n.textContent.trim()),
    filas: [...([...document.querySelectorAll(".vg-inv-lista")][1]?.children ?? [])].map((n) => n.textContent),
  }));
  console.log(`    i -> panel      ${abierto.cual}`);
  console.log(`    rejilla vieja   ${abierto.rejilla} casillas · velo ${abierto.velo}`);
  console.log(`    equipo          ${Math.round(abierto.equipo?.width ?? 0)}x${Math.round(abierto.equipo?.height ?? 0)} px, ${abierto.filasEquipo} entrada(s)`);
  console.log(`    contenedor      ${Math.round(abierto.contenedor?.width ?? 0)} px de ancho`);
  console.log(`    dentro          ${JSON.stringify(abierto.filas)}`);
  control("la `i` abre el inventario, y es el panel de VGUI",
    abierto.cual === "inventory", `${abierto.cual}`);
  control("LA REJILLA INVENTADA SE HA IDO: no sale ninguna casilla",
    abierto.rejilla === 0 && abierto.velo === false,
    `${abierto.rejilla} casillas, velo ${abierto.velo}`);
  const piezas = await pag.evaluate(() => ({
    listas: document.querySelectorAll(".vg-inv-lista").length,
    info: [...document.querySelectorAll(".vg-etiqueta")].filter((n) => /Gold: /.test(n.textContent)).length,
  }));
  control("y están las tres piezas del original: equipo, contenedor e información",
    piezas.listas === 2 && piezas.info === 1,
    `${piezas.listas} listas, ${piezas.info} etiqueta de oro`);
  // ── LA COLUMNA ES LA DEL JUEGO, no una entrada inventada ────────────────
  //
  // Antes este control pedía «tres o más objetos dentro» y salía verde con la
  // columna puesta a una sola entrada, «Pack», y todo lo que llevas amontonado
  // a la derecha. Lo que hay que comprobar es la COLUMNA: las manos primero y
  // detrás los cuatro contenedores de `reg.newchar.freeitems`
  // (`global.script:29`), con sus nombres del catálogo.
  const COLUMNA = ["Player Hands", "Heavy Weapon Holster", "Back Sword Sheath",
    "Dagger Sheath", "Small Sack"];
  const faltanCajas = COLUMNA.filter((n) => !abierto.equipoTextos.includes(n));
  control("la columna son LAS MANOS y los cuatro contenedores de partida",
    !faltanCajas.length,
    faltanCajas.length ? `faltan: ${faltanCajas.join(", ")}` : abierto.equipoTextos.join(" · "));
  // Y ninguno lleva comillas: 125 de los 861 scripts de `items/` escriben su
  // `name` entrecomillado y el lector se las quedaba. «Back Sword Sheath» es
  // uno de ellos, y lo lleva encima todo el mundo desde el primer minuto.
  control("y ningún nombre sale con las comillas del script",
    !abierto.equipoTextos.some((t) => t.includes('"')), abierto.equipoTextos.join(" · "));
  // `m_Selected == 0` son las manos, así que al abrir se ve lo que llevas en
  // ellas: el arma que elegiste al crear el personaje, y sólo ella.
  control("y al abrir enseña LAS MANOS, con el arma de partida dentro",
    abierto.filas.length === 1 && /Sword|Bow|Knife|Axe|Hammer|Staff|Lightning/i.test(abierto.filas[0]),
    `${abierto.filas.length} objeto(s): ${abierto.filas.join(", ")}`);

  // ── 1b. EL RATÓN, que es lo que hacía este panel inservible ─────────────
  //
  // El panel se abría entero y bien —columna, contenedor, información, todo lo
  // que mide esta sonda en verde— y **no se podía pulsar ni una fila**: el
  // puntero seguía atrapado en el `canvas`, así que los clics nunca llegaban al
  // DOM. Ningún control lo veía porque todos preguntaban por lo que se dibuja y
  // ninguno intentaba tocarlo, y el teclado (el `1` de más abajo) sí funcionaba,
  // que es lo que lo hacía difícil de creer.
  console.log(`\n  EL RATÓN`);
  const punteroConPanel = await pag.evaluate(() => window.probe.vgui.puntero());
  console.log(`    puntero         ${punteroConPanel ? "ATRAPADO (mal)" : "libre"}`);
  control("con el inventario abierto EL PUNTERO SE SUELTA",
    punteroConPanel === false,
    punteroConPanel ? "atrapado: el panel se ve y no se puede pulsar" : "libre");
  // Y se pulsa de verdad: la segunda entrada de la columna es un contenedor, así
  // que el título tiene que dejar de ser el de las manos.
  const columna = await pag.evaluate(() => {
    const filas = [...([...document.querySelectorAll(".vg-inv-lista")][0]?.children ?? [])];
    return filas.map((n) => {
      const c = n.getBoundingClientRect();
      return { texto: n.textContent.trim(), x: Math.round(c.x + c.width / 2), y: Math.round(c.y + c.height / 2) };
    });
  });
  const tituloAntes = await pag.evaluate(() =>
    [...document.querySelectorAll(".vg-etiqueta")].map((n) => n.textContent).find((t) => /hands|Hands/.test(t)) ?? null);
  if (columna[1]) {
    await pag.mouse.click(columna[1].x, columna[1].y);
    await new Promise((r) => setTimeout(r, 400));
  }
  const elegidoAhora = await pag.evaluate(() =>
    [...([...document.querySelectorAll(".vg-inv-lista")][0]?.children ?? [])]
      .filter((n) => n.dataset.elegida === "si").map((n) => n.textContent.trim()));
  console.log(`    clic en         ${JSON.stringify(columna[1]?.texto ?? null)} -> ${JSON.stringify(elegidoAhora)}`);
  control("UN CLIC DEL RATÓN EN LA COLUMNA ELIGE ESE CONTENEDOR",
    Boolean(columna[1]) && elegidoAhora.length > 0
      && elegidoAhora.some((t) => t === columna[1].texto),
    columna[1] ? `pulsado ${JSON.stringify(columna[1].texto)}, marcado ${JSON.stringify(elegidoAhora)}` : "la columna no tiene segunda fila");
  // Y EL TÍTULO CAMBIA, que es lo que lo convierte en un resultado y no en dos
  // clases de CSS: el panel dice «Player hands» con las manos elegidas y el
  // nombre del contenedor con un contenedor (vgui_containerlist.cpp:135-167).
  const tituloConBolsa = await pag.evaluate(() =>
    [...document.querySelectorAll(".vg-etiqueta")].map((n) => n.textContent)
      .find((t) => /Player hands|Holster|Sheath|Sack/.test(t)) ?? null);
  control("y el título del panel pasa a ser el del contenedor, no «Player hands»",
    tituloConBolsa !== null && tituloConBolsa !== tituloAntes && !/hands/i.test(tituloConBolsa),
    `${JSON.stringify(tituloAntes)} -> ${JSON.stringify(tituloConBolsa)}`);
  // Se vuelve a las manos para que el resto de la sonda mida lo de siempre.
  if (columna[0]) {
    await pag.mouse.click(columna[0].x, columna[0].y);
    await new Promise((r) => setTimeout(r, 400));
  }
  const vueltaAManos = await pag.evaluate(() =>
    [...document.querySelectorAll(".vg-etiqueta")].map((n) => n.textContent).find((t) => /hands|Hands/.test(t)) ?? null);
  control("y otro clic vuelve a las manos: la columna es un selector, no un botón",
    Boolean(vueltaAManos) && vueltaAManos === tituloAntes,
    `${JSON.stringify(tituloAntes)} -> ${JSON.stringify(tituloConBolsa)} -> ${JSON.stringify(vueltaAManos)}`);

  // ── 2. LAS DOS MEDIDAS RARAS DEL ORIGINAL ───────────────────────────────
  console.log(`\n  LAS MEDIDAS`);
  // `GEARPNL_SIZE_X` es **YRES(80)**, no XRES: el ancho de la columna se calcula
  // con la escala VERTICAL. A 1200x800 eso son 133 px y no los 150 que daría
  // XRES(80). En 4:3 coincidirían; en 16:10 no.
  const porY = Math.round(80 * (ALTO / 480));
  const porX = Math.round(80 * (ANCHO / 640));
  console.log(`    columna         ${Math.round(abierto.equipo?.width ?? 0)} px · YRES(80)=${porY} · XRES(80)=${porX}`);
  control("EL ANCHO DE LA COLUMNA SALE DE `YRES(80)`, que es la escala vertical",
    Math.abs((abierto.equipo?.width ?? 0) - porY) <= 3 && porY !== porX,
    `${Math.round(abierto.equipo?.width ?? 0)} px, YRES(80)=${porY} y no XRES(80)=${porX}`);
  // Y el contenedor mide LO QUE SOBRA.
  const sobra = ANCHO - (Math.round(5 * (ANCHO / 640)) + porY + Math.round(5 * (ANCHO / 640)) + Math.round(5 * (ANCHO / 640)));
  control("y el contenedor no tiene ancho propio: mide lo que sobra hasta el borde",
    Math.abs((abierto.contenedor?.width ?? 0) - sobra) <= 6,
    `${Math.round(abierto.contenedor?.width ?? 0)} px, esperado ~${sobra}`);

  // ── 3. SEÑALAR UN OBJETO LO DESCRIBE ────────────────────────────────────
  console.log(`\n  LA INFORMACIÓN`);
  const antes = await pag.evaluate(() =>
    [...document.querySelectorAll(".vg-etiqueta")].map((n) => n.textContent).filter(Boolean));
  await pag.keyboard.press("Digit1");
  await new Promise((r) => setTimeout(r, 400));
  const tras = await pag.evaluate(() => ({
    etiquetas: [...document.querySelectorAll(".vg-etiqueta")].map((n) => n.textContent).filter(Boolean),
    elegidas: document.querySelectorAll('.vg-inv-fila[data-elegida="si"]').length,
  }));
  console.log(`    1 -> elegidas ${tras.elegidas} · ${JSON.stringify(tras.etiquetas.filter((t) => /Weight|Quality|Quantity/.test(t)))}`);
  control("el 1 señala el primer objeto",
    tras.elegidas > (antes.filter((t) => t === "si").length ?? 0) || tras.elegidas >= 2,
    `${tras.elegidas} filas marcadas`);
  control("y el panel de información dice su peso",
    tras.etiquetas.some((t) => /^Weight: /.test(t)),
    tras.etiquetas.find((t) => /^Weight: /.test(t)) ?? "nada");
  control("el oro se ve, y en la fuente de título",
    tras.etiquetas.some((t) => /^Gold: /.test(t)),
    tras.etiquetas.find((t) => /^Gold: /.test(t)) ?? "nada");

  await pag.screenshot({ path: "build/gatecity/vistas/inventario31.png" });
  console.log(`    captura         build/gatecity/vistas/inventario31.png`);

  // ── 4. CON EL PANEL DELANTE EL JUEGO NO CORRE ───────────────────────────
  console.log(`\n  EL JUEGO, DETRÁS`);
  const p0 = await pag.evaluate(() => window.probe.player.feet);
  await pag.keyboard.down("KeyW");
  await new Promise((r) => setTimeout(r, 1000));
  await pag.keyboard.up("KeyW");
  const p1 = await pag.evaluate(() => window.probe.player.feet);
  const movido = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
  control("con el inventario abierto la W no mueve al jugador", movido < 0.05,
    `${(movido * 100).toFixed(1)} cm`);
  // La rueda es del panel: `else if (!m_pCurrentMenu)` es lo único que deja
  // llegar la rueda al HUD.
  const arma0 = await pag.evaluate(() => window.probe.golpe.estado.arma ?? null);
  await pag.mouse.wheel(0, 200);
  await new Promise((r) => setTimeout(r, 300));
  const arma1 = await pag.evaluate(() => window.probe.golpe.estado.arma ?? null);
  control("y la rueda es del panel: no cambia de arma", arma0 === arma1, `${arma0} -> ${arma1}`);

  // ── 5. Y LA `i` LO CIERRA ───────────────────────────────────────────────
  await pag.keyboard.press("KeyI");
  await new Promise((r) => setTimeout(r, 400));
  const cerrado = await pag.evaluate(() => window.probe.vgui.abierto());
  control("la `i` lo cierra: es un interruptor", cerrado === null, `${cerrado}`);
  const p2 = await pag.evaluate(() => window.probe.player.feet);
  await pag.keyboard.down("KeyW");
  await new Promise((r) => setTimeout(r, 1000));
  await pag.keyboard.up("KeyW");
  const p3 = await pag.evaluate(() => window.probe.player.feet);
  const movido2 = Math.hypot(p3[0] - p2[0], p3[2] - p2[2]);
  control("EL CONTROL POSITIVO: cerrado, la misma W sí mueve", movido2 > 0.5,
    `${(movido2 * 100).toFixed(1)} cm`);
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
