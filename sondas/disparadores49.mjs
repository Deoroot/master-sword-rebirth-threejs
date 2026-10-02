// EL CABLEADO DEL MAPA, en un Chrome de verdad.
//
//   npm run sonda:disparadores49
//
// El 49 portó `target`/`targetname`: una entidad nombra a otra y la usa. En
// Node hay 44 comprobaciones de la regla. Lo que Node **no** puede ver es si
// andar por el sitio dispara algo, que es la mitad del asunto: el disparo
// llega por TOCAR, y tocar es el casco del jugador contra el brush.
//
// ── Por qué esto puede estar verde sin medir nada, y qué se hace ──────────
//
// Es el apartado 4 de CLAUDE.md con una forma nueva y peligrosa: **en Gate
// City la cadena entera acaba en un área que la ignora**, así que «no pasa
// nada en pantalla» es el resultado CORRECTO. Un bus que no funcionara daría
// exactamente la misma pantalla.
//
// Contra eso no vale mirar el mundo: hay que mirar la CUENTA de disparos, que
// es lo que distingue «once llegadas ignoradas» de «cero llegadas». Y al lado,
// tres controles:
//
//   1. antes de entrar en el volumen la cuenta es CERO (si no, lo de después
//      no mide el paso, mide que ya estaba);
//   2. el `trigger_once` DESAPARECE al dispararse, que es un cambio de estado
//      independiente de la cuenta;
//   3. el multi_manager reparte en el tiempo: a 1 s van dos y a 5 s van seis.
//
// La sonda se COLOCA en el volumen con `probe.mundo.poner`, como hace
// `sonda:mapa` para llegar al estanque.
//
// CORRECCIÓN DEL 59: esto decía «se entra por `?map=` porque lo que se mide es
// el mapa y no el arranque». Se entra por el menú, como todas.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";
import { readFileSync, existsSync } from "node:fs";

const MAPA = "gatecity";
const PORT = 5246;
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
 * Un punto DENTRO de un disparador, sacado de su propio horneado.
 *
 * No se escribe a mano: se muestrea su caja con un dado con semilla y se
 * promedian los que caen dentro de alguna pieza. Un centroide de puntos
 * interiores de un convexo está dentro; con varias piezas puede no estarlo, y
 * por eso se comprueba al final y se devuelve `null` si no cuadra.
 */
function puntoDentro(d) {
  let a = 20240501;
  const rnd = () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; };
  const enPieza = (ps, p) => ps.every((q) => q.n[0] * p[0] + q.n[1] * p[1] + q.n[2] * p[2] - q.d <= 0);
  const dentro = [];
  for (let i = 0; i < 40000 && dentro.length < 200; i++) {
    const p = [0, 1, 2].map((k) => d.caja.min[k] + rnd() * (d.caja.max[k] - d.caja.min[k]));
    if (d.piezas.some((ps) => enPieza(ps, p))) dentro.push(p);
  }
  if (!dentro.length) return null;
  const c = [0, 1, 2].map((k) => dentro.reduce((s, p) => s + p[k], 0) / dentro.length);
  return d.piezas.some((ps) => enPieza(ps, c)) ? c : dentro[0];
}

try {
  const ruta = `build/${MAPA}/malla.json`;
  if (!existsSync(ruta)) throw new Error(`falta ${ruta}: corre \`npm run mapa\``);
  const m = JSON.parse(readFileSync(ruta, "utf8"));
  const tocables = (m.disparadores ?? []).filter((d) => d.piezas);

  nav = await chromium.launch();
  const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
  pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
  // POR EL MENÚ (59). El comentario de arriba decía que aquí `?map=` valía
  // porque lo que se mide es el mapa y no el arranque. Es cierto que se mide
  // el mapa; no lo es que por eso dé igual el camino — el montaje por `?map=`
  // y el del menú no son el mismo, y una sonda que sólo conoce uno no puede
  // notar cuando el otro se rompe. Cuesta unos segundos y cierra el hueco.
  await entrarPorElMenu(pag, PORT, { mapa: MAPA });
  // Un personaje: sin él el bucle no corre y nada de esto se mueve.
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda"));
  await pag.waitForTimeout(1200);

  // ── 0. EL CABLEADO LLEGÓ AL NAVEGADOR ────────────────────────────────────
  const inicio = await pag.evaluate(() => window.probe.mundo.disparadores());
  control("el mapa trae sus 39 entidades cableadas y 5 se tocan",
    inicio?.n === 39 && inicio.tocables === 5, JSON.stringify({ n: inicio?.n, tocables: inicio?.tocables }));
  control("CONTROL: y todavía no se ha disparado NADA (si no, lo de abajo no mide)",
    inicio?.total === 0, `${inicio?.total} disparos`);
  control("el reloj del bus corre con el bucle, no con el de pared",
    inicio?.reloj > 0.3, `${inicio?.reloj} s`);

  // ── 1. ANDAR HASTA UN trigger_once LO DISPARA ────────────────────────────
  //
  // Se elige el que va DIRECTO a un área (`spawners1`), no el que pasa por un
  // multi_manager: así el número de abajo es uno y no cuatro.
  const directo = tocables.find((d) => d.objetivo === "spawners1");
  const p = puntoDentro(directo);
  control("se encuentra un punto dentro del trigger_once de `spawners1`",
    Boolean(p), p ? p.map((v) => v.toFixed(1)).join(", ") : "ninguno de 40 000 puntos cae dentro");

  if (p) {
    const U = m.unidadesPorMetro;
    // Los pies medio jugador por debajo del punto: lo que el motor prueba es
    // el `origin`, que está 36 unidades sobre los pies.
    await pag.evaluate(([x, y, z]) => window.probe.mundo.poner(x, y, z),
      [p[0], p[1] - 36 / U, p[2]]);
    await pag.waitForTimeout(600);
    const tras = await pag.evaluate(() => window.probe.mundo.disparadores());
    control("estar dentro del volumen DISPARA su objetivo",
      (tras?.cuenta?.spawners1 ?? 0) >= 1, JSON.stringify(tras?.cuenta ?? {}));
    control("CONTROL: y el trigger_once desaparece, que es otro cambio distinto",
      tras?.vivos === inicio.vivos - 1 && tras.tocables === 4,
      `vivos ${inicio.vivos} -> ${tras?.vivos}, tocables ${tras?.tocables}`);
    control("y sólo disparó UNA vez, aunque la sonda siga dentro",
      (tras?.cuenta?.spawners1 ?? 0) === 1, `${tras?.cuenta?.spawners1}`);
  }

  // ── 2. EL MULTI_MANAGER REPARTE EN EL TIEMPO ─────────────────────────────
  //
  // `mm_zombies` tiene cuatro objetivos a 1, 2, 3 y 4 s. Las dos tomas son el
  // control la una de la otra: si salieran todos de golpe, la primera fallaría.
  const zombis = tocables.find((d) => d.objetivo === "mm_zombies");
  const pz = zombis ? puntoDentro(zombis) : null;
  if (pz) {
    const U = m.unidadesPorMetro;
    await pag.evaluate(([x, y, z]) => window.probe.mundo.poner(x, y, z),
      [pz[0], pz[1] - 36 / U, pz[2]]);
    await pag.waitForTimeout(1400);
    const a = await pag.evaluate(() => window.probe.mundo.disparadores());
    const spawners = (c) => ["spawners6", "spawners7", "spawners8", "spawners9"]
      .filter((n) => (c?.[n] ?? 0) > 0).length;
    control("a ~1,4 s del multi_manager han salido uno o dos de sus cuatro",
      spawners(a?.cuenta) >= 1 && spawners(a?.cuenta) <= 2,
      `${spawners(a?.cuenta)} de 4: ${JSON.stringify(a?.cuenta)}`);
    await pag.waitForTimeout(3500);
    const b = await pag.evaluate(() => window.probe.mundo.disparadores());
    control("y a ~5 s han salido los cuatro, en su orden",
      spawners(b?.cuenta) === 4, `${spawners(b?.cuenta)} de 4`);
    control("CONTROL: el retraso es de verdad, no salieron todos de golpe",
      spawners(a?.cuenta) < spawners(b?.cuenta),
      `${spawners(a?.cuenta)} a 1,4 s contra ${spawners(b?.cuenta)} a 5 s`);
  }

  // ── 3. Y EL FINAL DE LA CADENA: NO PASA NADA, Y ESO ES LO CORRECTO ───────
  //
  // `CAreaMonsterSpawn::ResetUse` sale por la primera puerta si el área ya
  // está activa y no tiene `resetwhen` (msmapents.cpp:755-759), y las 16 de
  // Gate City están las dos cosas. El bus lo cuenta como `area_ignora`.
  const fin = await pag.evaluate(() => window.probe.mundo.disparadores());
  control("todas las llegadas a un área de aparición se IGNORAN",
    (fin?.sinPortar?.area_ignora ?? 0) >= 5 && (fin?.sinPortar?.area_reinicia ?? 0) === 0,
    JSON.stringify(fin?.sinPortar ?? {}));
  control("CONTROL: y no es que no llegaran — llegaron y están contadas",
    fin?.total >= 6, `${fin?.total} disparos en total`);

  control("y no hubo errores de JavaScript", errores.length === 0, errores.join(" · ").slice(0, 300));
} catch (e) {
  control("la sonda termina", false, String(e).slice(0, 300));
} finally {
  if (nav) await nav.close();
  matar(dev);
}

console.log("\n  EL CABLEADO DEL MAPA — experimento 49\n");
for (const c of controles) {
  console.log(`   ${c.bien ? "ok  " : "FALLA"} ${c.que}${c.detalle ? `\n          ${c.detalle}` : ""}`);
}
const bien = controles.filter((c) => c.bien).length;
console.log(`\n   ${bien}/${controles.length}\n`);
process.exit(bien === controles.length ? 0 : 1);
