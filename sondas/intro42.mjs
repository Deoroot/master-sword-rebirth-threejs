// CÓMO TE RECIBE EL MAPA, en un Chrome de verdad.
//
//   npm run sonda:intro42
//
// Gate City se declara a sí mismo un mapa de nivel 10-25 y hasta ahora el juego
// no lo decía. Un personaje recién hecho entraba a un pueblo con 8 goblins y 22
// enanos zombi sin un solo aviso, y la primera pista era morirse.
//
// La regla está en `src/play/intro.js` y la cubren 17 comprobaciones de Node.
// Lo que Node NO puede ver es si esos textos llegan a la pantalla, y cuándo.
// Eso es lo que mide esto.
//
// ── Esta sonda entra por el menú, como el jugador ─────────────────────────
//
// Sin `?map=`, que es la línea de comandos del juego. La presentación la
// dispara `game_player_putinworld`, o sea aparecer en el mundo; si la sonda
// entrara por el atajo mediría otro camino.
//
// ── Las formas de que esto esté verde sin medir nada ──────────────────────
//
// La que más caro ha salido en este proyecto es el control que lee el valor de
// reposo. Aquí el valor de reposo es «la consola tiene líneas», que es verdad
// desde el primer segundo porque al aparecer ya se escriben dos. Contra eso:
//
//   1. una consola con texto cualquiera        -> se busca el TEXTO exacto
//   2. los avisos ya estaban al aparecer       -> se mira en t≈1 s que NO están
//   3. salen todos de golpe                    -> se mira el nombre ANTES que
//                                                 la dificultad, en dos tomas
//   4. el aviso sale siempre, se mire a quien  -> el negativo del apartado 5:
//      se mire                                    con vida en la banda, no sale

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { esNuestro, liberarPuerto } from "./mismo.mjs";
import { mkdirSync } from "node:fs";

const PORT = 5224;
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (habia ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { shell: true, stdio: "ignore" });
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
await new Promise((r) => setTimeout(r, 6000));

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });
const errores = [];
let nav = null;

/**
 * Todo lo que hay escrito en la consola de sucesos, en una sola cadena.
 *
 * `consola.lineas` son las VISIBLES, no el historial: la consola se encoge
 * sola cada `ms_evthud_decaytime` (5 s por defecto, hud.js:46). Por eso las
 * tomas de abajo se hacen justo después de cada aviso y no todas al final.
 */
// Se unen con un espacio y se colapsan los blancos a propósito: la consola
// PARTE las líneas largas para que quepan, así que «carved deep inside the
// mountains» puede llegar cortada en dos. Buscando sobre el texto pegado, el
// corte no cambia el resultado.
const leerConsola = (pag) => pag.evaluate(() =>
  (window.probe?.hud?.estado()?.consola?.lineas ?? []).map((l) => l.texto).join(" ").replace(/\s+/g, " "));

/** Si la página se recarga, `window.probe` desaparece y todo lo de abajo miente. */
const sigueViva = (pag) => pag.evaluate(() => Boolean(window.probe?.hud));

try {
  nav = await chromium.launch();
  const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
  pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
  // SIN `?map=`: por la puerta.
  await pag.goto(`http://localhost:${PORT}/`, { waitUntil: "load" });
  await esNuestro(pag, PORT);
  mkdirSync("build/gatecity/vistas", { recursive: true });

  await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
  await pag.waitForTimeout(800);

  // ── 0. EL DATO EXTRAÍDO ESTÁ ─────────────────────────────────────────────
  //
  // Si no está, todo lo de abajo saldría rojo por una razón que no es la que
  // se está midiendo. Se dice aquí para no diagnosticarlo dos veces.
  const ficha = await pag.evaluate(() => fetch("build/gatecity/mapa.json").then((r) => (r.ok ? r.json() : null)).catch(() => null));
  control("`build/gatecity/mapa.json` existe (npm run mapainfo)", Boolean(ficha),
    ficha ? `dificultad: ${ficha.dificultad}` : "no está: corre `npm run mapainfo`");
  control("y trae la banda que Gate City declara de sí mismo",
    ficha?.dificultad === "Levels 10-25 / 100-400hp", String(ficha?.dificultad));
  control("y el umbral de 100 hp por debajo del cual avisa",
    ficha?.avisoVida === 100, String(ficha?.avisoVida));

  // ── 1. ENTRAR POR EL MENÚ ────────────────────────────────────────────────
  for (const b of await pag.$$(".ms-menu button, .ms-menu .ms-item")) {
    if ((await b.textContent())?.includes("Establish a Kingdom")) { await b.click(); break; }
  }
  await pag.waitForTimeout(600);
  for (const b of await pag.$$(".v2-boton")) {
    if ((await b.textContent()) === "Start") { await b.click(); break; }
  }
  await pag.waitForTimeout(1200);
  const enPersonajes = await pag.evaluate(() => window.probe.vgui.abierto());
  control("«Establish a Kingdom» → «Start» lleva a la pantalla de personajes",
    enPersonajes === "newchar", String(enPersonajes));

  // Y se crea uno, que es lo que dispara `game_player_putinworld`.
  const t0 = Date.now();
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda"));
  await pag.waitForFunction(() => window.probe.sesion.hay() === true, null, { timeout: 60000 });

  // ── 2. EL CONTROL POSITIVO, Y VA ANTES ───────────────────────────────────
  //
  // Recién aparecido la consola YA tiene texto —«Sonda arrives at…» y la línea
  // de teclas—, así que «la consola tiene algo» valdría verde sin que este
  // experimento existiera. Lo que tiene que ser verdad ahora es que los tres
  // avisos NO están todavía.
  await pag.waitForTimeout(1000);
  const alAparecer = await leerConsola(pag);
  control("al aparecer la consola ya escribe (si no, lo de abajo no mide nada)",
    alAparecer.trim().length > 0, `${alAparecer.split("\n").length} líneas`);
  control("pero la presentación NO está todavía a 1 s",
    !alAparecer.includes("Gatecity") && !alAparecer.includes("Intended Difficulty"),
    alAparecer.replace(/\n/g, " | ").slice(0, 160));

  // ── 3. A LOS 10 s SALE EL NOMBRE, Y LA DIFICULTAD AÚN NO ─────────────────
  //
  // Las dos mitades importan. Que salga el nombre prueba que la cadena corre;
  // que la dificultad todavía no, prueba que los tres segundos de
  // `callevent 3.0 give_map_diff` son de verdad y no salen los dos juntos.
  await pag.waitForTimeout(Math.max(0, 11500 - (Date.now() - t0)));
  const aLos11 = await leerConsola(pag);
  control("a los ~11 s sale el nombre del mapa y su descripción",
    aLos11.includes("Gatecity") && aLos11.includes("carved deep inside the mountains"),
    aLos11.replace(/\n/g, " | ").slice(0, 160));
  control("y la dificultad AÚN no: los 3 s de `give_map_diff` son de verdad",
    !aLos11.includes("Intended Difficulty"),
    aLos11.includes("Intended Difficulty") ? "salió antes de tiempo" : "todavía no, bien");

  // ── 4. A LOS 13 s, LA BANDA Y EL AVISO ───────────────────────────────────
  await pag.waitForTimeout(Math.max(0, 14500 - (Date.now() - t0)));
  control("la página no se ha recargado por el camino",
    await sigueViva(pag), "si se recarga, `window.probe` desaparece y nada de esto mide");
  const aLos14 = await leerConsola(pag);
  control("a los ~14 s el juego dice para qué nivel está hecho el mapa",
    aLos14.includes("Intended Difficulty") && aLos14.includes("Levels 10-25"),
    aLos14.replace(/\n/g, " | ").slice(0, 200));
  control("y avisa de que a un personaje recién hecho le viene grande",
    aLos14.includes("This area maybe too difficult at your level!"),
    aLos14.includes("WARNING") ? "sale el WARNING" : "NO sale el aviso");

  await pag.screenshot({ path: "build/gatecity/vistas/intro42.png" });
  console.log(`    captura         build/gatecity/vistas/intro42.png`);

  // ── 5. EL NEGATIVO: con vida en la banda, el aviso NO sale ───────────────
  //
  // Sin esto, «sale el WARNING» estaría verde con un aviso que saliera SIEMPRE,
  // que es exactamente el fallo que este proyecto ha cometido cinco veces.
  //
  // La vida máxima sale de los atributos y no hay forma de pedirla por la
  // sonda, así que esto se mide donde sí se puede: por la regla, con la misma
  // ficha que acaba de leerse del disco. No es el navegador, y se dice.
  const negativo = await pag.evaluate(async (f) => {
    const { presentacion } = await import("/src/play/intro.js");
    return {
      flojo: presentacion(f, 12).map((a) => a.titulo),
      fuerte: presentacion(f, 150).map((a) => a.titulo),
    };
  }, ficha);
  control("con 150 hp —dentro de la banda— el aviso NO sale",
    negativo.fuerte.length === 2 && !negativo.fuerte.includes("WARNING"),
    JSON.stringify(negativo.fuerte));
  control("y con 12 hp sí: la diferencia es el personaje, no el mapa",
    negativo.flojo.includes("WARNING"), JSON.stringify(negativo.flojo));

  control("y no hubo errores de JavaScript", errores.length === 0, errores.join(" · ").slice(0, 200));
} catch (e) {
  control("la sonda termina", false, String(e).slice(0, 300));
} finally {
  if (nav) await nav.close();
  matar(dev);
}

console.log("\n  CÓMO TE RECIBE EL MAPA — experimento 42\n");
for (const c of controles) {
  console.log(`   ${c.bien ? "ok  " : "FALLA"} ${c.que}${c.detalle ? `\n          ${c.detalle}` : ""}`);
}
const bien = controles.filter((c) => c.bien).length;
console.log(`\n   ${bien}/${controles.length}\n`);
process.exit(bien === controles.length ? 0 : 1);
