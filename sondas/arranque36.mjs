// POR DÓNDE SE ENTRA AL JUEGO, en un Chrome de verdad.
//
//   npm run sonda:arranque36
//
// Hasta el 36 este port arrancaba directo en la pantalla de personajes. Eso YA
// era «Establish a Kingdom» —montar una partida local— sólo que ocurría sola, en
// silencio y sin que nadie la pidiera. Esta sonda comprueba que ahora hay puerta.
//
// ── Ésta es la única sonda que carga la página SIN `?map=` ────────────────
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
  control("la lista de mapas enseña UNO, que es el que hay portado",
    mapas.length === 2 && mapas.includes("gatecity"), mapas.join(" · "));
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
  await pag.waitForTimeout(1500);
  const dentro = await pag.evaluate(() => ({
    menu: !document.querySelector(".ms-menu")?.hidden,
    panel: window.probe.vgui.abierto(),
    ventanas: window.probe.vgui2.abiertas(),
  }));
  control("«Start» cierra el menú y lleva a elegir personaje",
    dentro.menu === false && dentro.panel === "newchar", JSON.stringify(dentro));
  control("y no se deja ninguna ventana de Valve abierta por detrás",
    dentro.ventanas === 0, `${dentro.ventanas} abiertas`);

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
  }));
  control("CONTROL POSITIVO: con `?map=` se entra directo, como con `+map`",
    atajo.menu === false && atajo.panel === "newchar", JSON.stringify(atajo));
  await otra.close();
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
