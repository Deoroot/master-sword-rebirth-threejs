// UN SEGUNDO MAPA, en un Chrome de verdad.
//
//   npm run sonda:edana48
//
// El 47 sacó «gatecity» de las costuras del código; el 48 lo saca de las
// costuras del EXTRACTOR, que es donde estaban las cuatro guardas que paraban
// a Edana. Esto mide lo único que ni Node ni el horneado pueden ver: que el
// segundo mapa se abre, se dibuja y se puede andar.
//
// ── POR QUÉ ÉSTA NO ENTRA POR EL MENÚ, y `sonda:edana50` sí ──────────────
//
// La regla de la casa es que si el camino no pasa por `menuselect`, no cuenta.
// Vale, y aquí no se está midiendo el camino del jugador: **Edana no está en
// el menú a propósito**. `MAPAS_PORTADOS` es lo que ofrece «Create Server», y
// ofrecerla sería prometer un pueblo con sus NPC — que no tiene, porque las
// doce herramientas que extraen bichos, guiones y menús siguen escribiendo en
// `build/gatecity`. Lo que se mide aquí es lo que hay: el mapa carga y se anda.
// Las 22 sondas de Gate City siguen entrando por la puerta.
//
// ── Las formas de que esto esté verde sin medir nada ──────────────────────
//
//   1. carga Gate City y nadie lo nota   -> se comparan los números del nivel
//                                           con los del `.bsp` de Edana
//   2. «no hubo errores» con la página   -> se exige `probe.ready` y triángulos
//      en blanco                            dibujados, no ausencia de rojo
//   3. el mapa se cae al de por defecto  -> se lee el nombre del manifiesto
//   4. un mapa que no existe pasaría      -> se pide `?map=nohay` y TIENE que
//      igual                                 quejarse

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { esNuestro, liberarPuerto, arrancarVite } from "./mismo.mjs";
import { existsSync, readFileSync } from "node:fs";

const PORT = 5241;
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (habia ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = await arrancarVite(PORT);
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });
const errores = [];
let nav = null;

try {
  if (!existsSync("build/edana/malla.json")) {
    throw new Error("falta build/edana: corre `node tools/gatecity.mjs --mapa edana`");
  }
  nav = await chromium.launch();
  const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
  pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
  await pag.goto(`http://localhost:${PORT}/?map=edana`, { waitUntil: "load" });
  await esNuestro(pag, PORT);

  await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
  // Un personaje, que hace falta para que la sesión mande: sin él el bucle
  // no mueve al jugador y «se anda» saldría rojo por otra razón.
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda"));
  await pag.waitForTimeout(1500);

  // ── 1. ES EDANA, Y SE COMPRUEBA CON SUS NÚMEROS ──────────────────────────
  //
  // «Cargó algo» sería verde con Gate City detrás. Los que se comparan son los
  // que escribió el extractor leyendo `edana.bsp`, y no se parecen a los de
  // Gate City en ninguna cifra.
  const n = await pag.evaluate(() => ({
    nombre: window.probe.level.name,
    triangulos: window.probe.level.mesh.triangleCount,
    vertices: window.probe.level.mesh.vertexCount,
    colision: window.probe.level.colision.triangleCount,
    monsterclip: window.probe.level.monsterclip.length,
    pueblos: window.probe.level.pueblos.length,
    unidades: window.probe.level.unitsPerMetre,
  }));
  control("el manifiesto cargado dice que es «edana»", n.nombre === "edana", String(n.nombre));
  // ── CORRECCIÓN DEL 70 ───────────────────────────────────────────────────
  //
  // Estos dos números estaban ESCRITOS —33 087 triángulos y 28 511 de
  // colisión— y llevaban rojos desde el 69 sin que nadie los mirara: sacar los
  // rompibles de la malla quieta y de la colisión se llevó 48 de cada una, y
  // el 70 se llevó otros 56 de la quieta con las deslizantes. Cada clase que
  // sale del mundo para tener malla propia los mueve, así que una cifra escrita
  // aquí envejece sola — que es justo lo que dice el apartado 5 de CLAUDE.md.
  //
  // Se calculan, y de donde dice el propio control: «los que escribió el
  // extractor leyendo `edana.bsp`». Sigue comparando dos cosas distintas —el
  // archivo contra lo que el navegador tiene montado— y el control negativo
  // contra las cifras de Gate City se queda igual.
  const horneado = JSON.parse(readFileSync("build/edana/malla.json", "utf8"));
  const triDelHorneado = horneado.bin.tramos.indices.n / 3;
  const triDeColision = horneado.bin.tramos.choqueIndices.n / 3;
  control(`y trae los ${triDelHorneado} triángulos que el extractor midió en edana.bsp`,
    n.triangulos === triDelHorneado, `${n.triangulos} tri, ${n.vertices} vértices`);
  control("con su malla de colisión y sus 7 brushes de monsterclip",
    n.colision === triDeColision && n.monsterclip === 7,
    `colisión ${n.colision} tri (el horneado dice ${triDeColision}), monsterclip ${n.monsterclip}`);
  control("CONTROL NEGATIVO: NO son los de Gate City (33 941 tri, 101 monsterclip)",
    n.triangulos !== 33941 && n.monsterclip !== 101, "si coincidieran, esto estaría midiendo el otro mapa");
  control("Edana no tiene msarea_town, y el nivel lo dice sin inventarse ocho",
    n.pueblos === 0, `${n.pueblos} pueblos`);

  // ── 2. SE DIBUJA ─────────────────────────────────────────────────────────
  //
  // «No hubo errores» es el valor de reposo de una pantalla negra. Lo que se
  // mira es lo que el renderer contó en el último fotograma.
  const r = await pag.evaluate(() => ({
    triangulos: window.probe.renderer.info.render.triangles,
    llamadas: window.probe.renderer.info.render.calls,
    texturas: window.probe.renderer.info.memory.textures,
  }));
  control("el renderer dibujó triángulos en el último fotograma",
    r.triangulos > 1000, `${r.triangulos} tri en ${r.llamadas} llamadas`);
  control("y hay texturas cargadas, no un material plano",
    r.texturas > 20, `${r.texturas} texturas`);

  // ── 3. SE PUEDE ESTAR EN ÉL ──────────────────────────────────────────────
  //
  // Aparecer dentro de la roca o caerse por el mundo se ve igual que cargar
  // bien en una captura. Se anda un segundo y se mira que siga en pie.
  const antes = await pag.evaluate(() => [...window.probe.player.feet]);
  await pag.keyboard.down("KeyW");
  await pag.waitForTimeout(1200);
  await pag.keyboard.up("KeyW");
  await pag.waitForTimeout(400);
  const despues = await pag.evaluate(() => ({
    pies: [...window.probe.player.feet],
    enSuelo: window.probe.player.grounded,
    pulsada: window.probe.teclas.pulsada("adelante"),
  }));
  const anduvo = Math.hypot(despues.pies[0] - antes[0], despues.pies[2] - antes[2]);
  control("con la W puesta, el jugador se mueve por el suelo de Edana",
    anduvo > 0.5, `${anduvo.toFixed(2)} m en 1,2 s, en suelo: ${despues.enSuelo}`);
  // EL CONTROL DE LA TECLA, que es el que separa «no se mueve» de «la sonda no
  // está pulsando». Sin personaje la W llegaba igual y el jugador no andaba, y
  // media hora se fue en diagnosticar el mapa en vez de la sonda.
  control("CONTROL: y la tecla estaba suelta al mirar, no colgada",
    despues.pulsada === false, `pulsada=${despues.pulsada}`);
  control("y no se ha caído del mundo",
    despues.pies[1] > -200, `y = ${despues.pies[1].toFixed(1)} m`);

  // ── 4. EL AGUA DE SEIS BRUSHES, MEDIDA COMO AGUA ─────────────────────────
  //
  // Lo que el 48 arregló de verdad. Y no vale con mirar que `piezas` esté en
  // el `.json`: eso es leer el valor de reposo. Lo que se mide es lo que el
  // juego CONTESTA — `volumenes.nivelDeAguaEn`, el mismo camino que corre en
  // el bucle— en puntos de la caja del estanque de seis brushes.
  //
  // El control es la pareja de números: dentro de la caja moja POCO (el
  // horneado midió el 6 %) y **más que nada**. Con la caja en vez de las
  // piezas mojaría el 100 %; con los planos del revés, el 0 %.
  const mojado = await pag.evaluate(() => {
    const agua = window.probe.level.manifiesto.interactivas?.agua ?? [];
    if (!agua.length) return null;
    // El de más piezas, que es el que no existía antes del 48.
    const a = [...agua].sort((x, y) => (y.piezas?.length ?? 0) - (x.piezas?.length ?? 0))[0];
    let s = 123456789;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    let dentro = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const p = [0, 1, 2].map((k) => a.caja.min[k] + rnd() * (a.caja.max[k] - a.caja.min[k]));
      if (window.probe.mundo.medio(p).agua > 0) dentro++;
    }
    return { piezas: a.piezas?.length ?? null, frac: dentro / N, n: agua.length,
      todas: agua.map((x) => x.piezas?.length ?? null) };
  });
  control("los seis volúmenes de agua llegan con piezas, y tres tienen más de una",
    mojado?.n === 6 && mojado.todas.filter((k) => k > 1).length === 3,
    JSON.stringify(mojado?.todas));
  control("el de diez brushes moja de verdad en el navegador",
    mojado?.frac > 0.01, `moja el ${((mojado?.frac ?? 0) * 100).toFixed(1)} % de su caja`);
  control("CONTROL: y NO moja toda su caja, que es lo que haría la envolvente",
    mojado?.frac < 0.5, `${((mojado?.frac ?? 0) * 100).toFixed(1)} % (con la caja sería el 100 %)`);

  // ── 5. UN MAPA QUE NO EXISTE NO PASA EN SILENCIO ─────────────────────────
  const avisos = [];
  const pag2 = await nav.newPage({ viewport: { width: 800, height: 600 } });
  pag2.on("console", (m) => { if (m.type() === "warning" || m.type() === "error") avisos.push(m.text().slice(0, 200)); });
  await pag2.goto(`http://localhost:${PORT}/?map=..%2F..%2Fetc`, { waitUntil: "load" });
  await pag2.waitForTimeout(3000);
  control("`?map=../../etc` se rechaza por el nombre y se dice por consola",
    avisos.some((a) => /no es un nombre de mapa|«\.\.\/\.\.\/etc»/i.test(a)),
    avisos.join(" · ").slice(0, 200) || "no dijo nada");
  await pag2.close();

  control("y no hubo errores de JavaScript", errores.length === 0, errores.join(" · ").slice(0, 300));
} catch (e) {
  control("la sonda termina", false, String(e).slice(0, 300));
} finally {
  if (nav) await nav.close();
  matar(dev);
}

console.log("\n  UN SEGUNDO MAPA — experimento 48\n");
for (const c of controles) {
  console.log(`   ${c.bien ? "ok  " : "FALLA"} ${c.que}${c.detalle ? `\n          ${c.detalle}` : ""}`);
}
const bien = controles.filter((c) => c.bien).length;
console.log(`\n   ${bien}/${controles.length}\n`);
process.exit(bien === controles.length ? 0 : 1);
