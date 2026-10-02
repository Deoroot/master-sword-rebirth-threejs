// EDANA POR LA PUERTA — experimento 50.
//
//   npm run sonda:edana50
//
// El 48 abrió Edana y la dejó **fuera del menú a propósito**, con su motivo
// escrito: ofrecerla sería prometer un pueblo sin NPC, porque las herramientas
// que extraen bichos, guiones y menús escribían todas en `build/gatecity`.
//
// Ese motivo caducó. `build/edana` trae 42 colocaciones de NPC —las 42 con su
// guion—, 139 guiones y sus menús, y lo que no es de un mapa vive en
// `build/msr`. Así que Edana entra en `MAPAS_PORTADOS`, y **una promesa en esa
// lista no vale nada hasta que alguien recorre el camino del jugador**: eso es
// esta sonda.
//
// ── Por qué ésta NO lleva `?map=`, y `sonda:edana48` sí ───────────────────
//
// Son dos preguntas distintas y hacen falta las dos. El 48 pregunta «¿se abre
// y se anda este `.bsp`?» y para eso `?map=` sobra y basta — es la línea de
// órdenes del juego, `hl.exe +map edana`. Ésta pregunta «¿**se llega**?», y
// esa sólo tiene una respuesta válida: menú principal, «Establish a Kingdom»,
// la fila «Map», «Start». Si su camino no pasa por `menuselect`, no cuenta.
//
// ── Y es la otra mitad de un control que llevaba desde el 36 sin pareja ───
//
// `sonda:arranque36` comprueba que «Start» entra con el mapa que resuelve la
// fila. Con UN mapa portado eso estaba verde también con un `"gatecity"`
// escrito a mano en cualquier parte: el valor correcto y el valor de reposo
// eran la misma cadena. Aquí se elige **el otro**, que es lo único que
// distingue «se aplicó la fila» de «siempre sale el mismo».
//
// ── Las formas de que esto esté verde sin medir nada ──────────────────────
//
//   1. el menú ofrece «edana» y «Start» abre     -> se leen los números del
//      Gate City igual                              nivel, y el negativo de
//                                                   Gate City al lado
//   2. «tiene NPC» leyendo el manifiesto         -> se cuenta lo que el juego
//                                                   MONTÓ, `probe.ia.censo()`
//   3. aparece dentro de la roca y se ve igual   -> se compara con el punto
//      en una captura                               que eligió el extractor,
//                                                   y se anda
//   4. la lista de mapas se escribe a mano       -> sale de `MAPAS_PORTADOS`

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { esNuestro, liberarPuerto } from "./mismo.mjs";
import { MAPAS_PORTADOS } from "../src/play/mapa.js";
import { existsSync, readFileSync, mkdirSync } from "node:fs";

const PORT = 5250;
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
  if (!existsSync("build/edana/malla.json")) {
    throw new Error("falta build/edana: corre `node tools/gatecity.mjs --mapa edana`");
  }
  // Lo que el extractor decidió, para comparar contra lo que el juego hace.
  // No es un número escrito: es el archivo que `npm run mapa:aparicion` dejó.
  const aparicion = JSON.parse(readFileSync("build/edana/aparicion.json", "utf8"));
  const censoHorneado = JSON.parse(readFileSync("build/edana/bichos.json", "utf8"));
  const mallaEdana = JSON.parse(readFileSync("build/edana/malla.json", "utf8"));
  // Y los del OTRO mapa, para el control negativo. Leídos, no escritos.
  const mallaGatecity = JSON.parse(readFileSync("build/gatecity/malla.json", "utf8"));
  const censoGatecity = JSON.parse(readFileSync("build/gatecity/bichos.json", "utf8"));
  const triGatecity = mallaGatecity.triangulos;
  const clipGatecity = mallaGatecity.monsterclip.length;

  nav = await chromium.launch();
  const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
  pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
  // SIN `?map=`. Es la puerta o no es nada.
  await pag.goto(`http://localhost:${PORT}/`, { waitUntil: "load" });
  await esNuestro(pag, PORT);
  mkdirSync("build/edana/vistas", { recursive: true });

  await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
  await pag.waitForTimeout(800);

  // ── 1. LA PUERTA ─────────────────────────────────────────────────────────
  const menu = await pag.evaluate(() => !document.querySelector(".ms-menu")?.hidden);
  control("se entra por el menú principal, sin `?map=`", menu === true, `menú: ${menu}`);

  for (const b of await pag.$$(".ms-menu-op")) {
    if ((await b.textContent()).trim() === "Establish a Kingdom") { await b.click(); break; }
  }
  await pag.waitForTimeout(400);
  const cs = await pag.evaluate(() => !!window.probe.vgui2.estado().crearServidor);
  control("«Establish a Kingdom» abre «Create Server»", cs === true, `ventana: ${cs}`);

  // ── 2. EDANA ESTÁ EN LA LISTA, Y LA LISTA NO SE ESCRIBE AQUÍ ─────────────
  //
  // La cuenta se calcula: la sonda importa `MAPAS_PORTADOS` y exige que la
  // ventana enseñe eso y nada más. Escribir «dos» aquí sería volver a tener
  // que tocar la sonda el día del tercero.
  await pag.click(".v2-desplegable");
  await pag.waitForTimeout(250);
  const mapas = await pag.$$eval(".v2-lista-abierta > button", (ns) => ns.map((n) => n.textContent.trim()));
  const esperados = ["< Random Map >", ...MAPAS_PORTADOS];
  control(`el desplegable enseña los ${MAPAS_PORTADOS.length} portados y ninguno más`,
    JSON.stringify(mapas) === JSON.stringify(esperados),
    `${mapas.join(" · ")}   (esperados: ${esperados.join(" · ")})`);
  control("y «edana» es una de las entradas que se pueden elegir",
    mapas.includes("edana"), mapas.join(" · "));

  // ── 3. SE ELIGE EDANA CON EL RATÓN ───────────────────────────────────────
  for (const b of await pag.$$(".v2-lista-abierta > button")) {
    if ((await b.textContent()).trim() === "edana") { await b.click(); break; }
  }
  await pag.waitForTimeout(250);
  const fila = await pag.evaluate(() =>
    window.probe.vgui2.estado().crearServidor.valores.mapa);
  control("la fila «Map» se queda con «edana»", fila === "edana", `fila: ${JSON.stringify(fila)}`);

  await pag.screenshot({ path: "build/edana/vistas/edana50_menu.png" });

  // ── 4. «START» ENTRA, Y ENTRA AL QUE SE ELIGIÓ ───────────────────────────
  //
  // Cambiar de mapa **recarga la página**: es el `CL_Disconnect()` +
  // `Host_Map()` del motor (rehlds/engine/host_cmd.cpp:970, :1021), y en el
  // navegador un nivel nuevo es una navegación. Así que aquí se espera a la
  // navegación y a que el `probe` de la página NUEVA esté listo; medir sin
  // esperar leería la página vieja, que es la de Gate City.
  const antesDeStart = pag.url();
  for (const b of await pag.$$(".v2-boton")) {
    if ((await b.textContent()) === "Start") { await b.click(); break; }
  }
  // La espera NO tumba la sonda si no llega: si «Start» no recarga, lo que
  // hace falta es que los controles de abajo digan **qué mundo hay entonces**
  // —los 69 NPC de Gate City, en la rotura que probó esto—. Una sonda que se
  // cae en la primera línea da un rojo y ninguna pista.
  let recargo = true;
  try { await pag.waitForURL((u) => String(u) !== antesDeStart, { timeout: 20000 }); }
  catch { recargo = false; }
  const url = pag.url();
  control("«Start» con otro mapa recarga, como `map <levelname>` en el motor",
    recargo && /[?&]map=edana\b/.test(url) && /[?&]menu=1\b/.test(url),
    recargo ? url.replace(/^https?:\/\/[^/]+/, "") : "no recargó: sigue en la página de antes");
  await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
  await pag.waitForTimeout(1000);

  const dentro = await pag.evaluate(() => ({
    menu: !document.querySelector(".ms-menu")?.hidden,
    panel: window.probe.vgui.abierto(),
    mapa: window.probe.vgui2.mapaDeLaPartida(),
  }));
  control("y lleva a elegir personaje, sin el menú delante",
    dentro.menu === false && dentro.panel === "newchar", JSON.stringify(dentro));
  // EL CONTROL QUE EL 36 NO PODÍA TENER. Con un solo mapa, «entra con el de la
  // fila» y «entra con gatecity» eran indistinguibles: la cadena correcta y la
  // de reposo eran la misma. Aquí se eligió EL OTRO.
  control("EL DISCRIMINANTE: eligiendo el OTRO mapa, se entra al otro",
    dentro.mapa === "edana", `mapa aplicado: ${JSON.stringify(dentro.mapa)}`);

  // Un personaje, que hace falta para que la sesión mande. La pantalla de
  // crear personaje la mide `sonda:personaje30`; aquí sólo se cruza.
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
  await pag.waitForTimeout(2500);

  // ── 5. LO QUE SE CARGÓ ES EDANA ──────────────────────────────────────────
  const n = await pag.evaluate(() => ({
    nombre: window.probe.level.name,
    triangulos: window.probe.level.mesh.triangleCount,
    monsterclip: window.probe.level.monsterclip.length,
    pueblos: window.probe.level.pueblos.length,
    dibujados: window.probe.renderer.info.render.triangles,
  }));
  control("el manifiesto cargado dice que es «edana»", n.nombre === "edana", String(n.nombre));
  control(`y trae los ${mallaEdana.triangulos} triángulos que el extractor midió en edana.bsp`,
    n.triangulos === mallaEdana.triangulos,
    `${n.triangulos} tri, ${n.monsterclip} monsterclip`);
  // EL NEGATIVO, con el número del otro mapa LEÍDO y no escrito: la sonda del
  // 48 llevaba «33 941 tri» en el texto y Gate City tiene 41 494. Un número de
  // adorno en el mensaje de un control es un número que nadie vuelve a mirar.
  control(`CONTROL NEGATIVO: NO son los de Gate City (${triGatecity} tri, ${clipGatecity} monsterclip)`,
    n.triangulos !== triGatecity && n.monsterclip !== clipGatecity,
    "si coincidieran, esto estaría midiendo el otro mapa");
  control("el renderer dibujó triángulos en el último fotograma",
    n.dibujados > 1000, `${n.dibujados} tri`);

  // ── 6. Y TIENE PUEBLO, que es lo que el 48 decía que le faltaba ──────────
  //
  // No se lee el manifiesto: se cuenta lo que el juego MONTÓ. Un `bichos.json`
  // con 42 filas y un mundo con cero se ven igual desde el disco.
  const censo = await pag.evaluate(() => window.probe.ia.censo());
  control(`el juego montó los ${censoHorneado.colocados.length} NPC de Edana, no cero`,
    censo.total === censoHorneado.colocados.length,
    `${censo.total} montados de ${censoHorneado.colocados.length} horneados, ${censo.hostiles} hostiles`);
  control(`CONTROL NEGATIVO: y no son los ${censoGatecity.colocados.length} de Gate City`,
    censo.total !== censoGatecity.colocados.length, `${censo.total}`);
  // El motivo del 48 era «un pueblo sin NPC». Un pueblo son los que NO atacan.
  const amigos = censo.lista.filter((x) => !x.hostil).length;
  control("y entre ellos hay NPC no hostiles, que es lo que hace un pueblo",
    amigos > 0, `${amigos} no hostiles de ${censo.total}`);

  // ── 7. APARECE DONDE EL EXTRACTOR DIJO ───────────────────────────────────
  //
  // El trabajo del 50 en `tools/aparicion.mjs` fue decidir que en Edana se
  // respeta el `ms_player_begin` del mapa. Esto comprueba que esa decisión
  // **llega al mundo**, y no se queda en un `.json` que nadie lee.
  const pies = await pag.evaluate(() => [...window.probe.player.feet]);
  const esperado = aparicion.nacimiento.escena;
  const lejos = Math.hypot(pies[0] - esperado[0], pies[2] - esperado[2]);
  control("aparece donde dice `build/edana/aparicion.json`, no en el origen",
    lejos < 2, `a ${lejos.toFixed(2)} m del punto horneado ` +
      `(${esperado.map((v) => v.toFixed(1)).join(", ")})`);
  control(`y ese punto es el \`${aparicion.nacimiento.nombre}\` del mapa, respetado`,
    aparicion.criterio.seCambioElPuntoDelMapa === false,
    `se cambió: ${aparicion.criterio.seCambioElPuntoDelMapa}`);

  // ── 8. SE PUEDE ESTAR EN ÉL ──────────────────────────────────────────────
  await pag.keyboard.down("KeyW");
  await pag.waitForTimeout(1200);
  await pag.keyboard.up("KeyW");
  await pag.waitForTimeout(400);
  const tras = await pag.evaluate(() => ({
    pies: [...window.probe.player.feet],
    enSuelo: window.probe.player.grounded,
    pulsada: window.probe.teclas.pulsada("adelante"),
  }));
  const anduvo = Math.hypot(tras.pies[0] - pies[0], tras.pies[2] - pies[2]);
  control("con la W puesta se anda por el suelo de Edana",
    anduvo > 0.5, `${anduvo.toFixed(2)} m en 1,2 s, en suelo: ${tras.enSuelo}`);
  control("CONTROL: y la tecla estaba suelta al mirar, no colgada",
    tras.pulsada === false, `pulsada=${tras.pulsada}`);
  control("y no se ha caído del mundo", tras.pies[1] > -200, `y = ${tras.pies[1].toFixed(1)} m`);

  await pag.screenshot({ path: "build/edana/vistas/edana50.png" });
  console.log(`    capturas        build/edana/vistas/edana50_menu.png, edana50.png`);

  control("y no hubo errores de JavaScript", errores.length === 0, errores.join(" · ").slice(0, 300));
} catch (e) {
  control("la sonda termina", false, String(e).slice(0, 300));
} finally {
  if (nav) await nav.close();
  matar(dev);
}

console.log("\n  EDANA POR LA PUERTA — experimento 50\n");
for (const c of controles) {
  console.log(`   ${c.bien ? "ok  " : "FALLA"} ${c.que}${c.detalle ? `\n          ${c.detalle}` : ""}`);
}
const bien = controles.filter((c) => c.bien).length;
console.log(`\n   ${bien}/${controles.length}\n`);
process.exit(bien === controles.length ? 0 : 1);
