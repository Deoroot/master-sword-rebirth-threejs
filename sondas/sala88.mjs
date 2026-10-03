// LA SALA DEL 88: ¿un mapa NUESTRO se juega aquí?
//
//   npm run contenido -- sala88
//   npm run mapa -- --mapa sala88; npm run mapa:bichos -- --mapa sala88
//   npm run mapa:aparicion -- --mapa sala88; npm run guiones -- --mapa sala88
//   npm run mapainfo -- --mapa sala88; npm run sonido -- --mapa sala88
//   node sondas/sala88.mjs
//
// Es la mitad de este lado de la prueba del tubo: la otra mitad es Xash3D, que
// cargó el mismo `.bsp` con `map sala88` (doc/CONTENIDO_88.md). Aquí se entra
// POR EL MENÚ, que es lo único que cuenta (CLAUDE.md §3), y se mide lo que un
// mapa compilado por nosotros —con otro compilador que los oficiales, aunque de
// la misma familia— podría tener roto sin dar un solo error:
//
//   1. que se nace sobre el suelo y se queda ahí (la colisión del suelo);
//   2. que una pared para al jugador (la de las paredes), con su control
//      positivo: que antes haya andado de verdad;
//   3. que la pantalla no es negra (la luz de hlrad, leída por nuestro lector),
//      con la lección del laboratorio: luminancia Y variedad, no «píxeles que
//      no son de la niebla»;
//   4. que la rata está, y que muerde cuando se le pega.
//
// Lo que NO mide: si se SIENTE como Master Sword. Eso se compara con Xash, que
// es el oráculo, y las cifras que hay que comparar las imprime al final.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { liberarPuerto } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";
import { leerPng } from "../tools/png.mjs";

const PORT = 5288;
const MAPA = "sala88";
const U = 39.37;
// La geometría, en UNIDADES, copiada de contenido/sala88.mjs. Va escrita a mano
// y no importada a propósito: si alguien mueve la pared en la descripción y no
// aquí, esta sonda tiene que ponerse roja (el 75: cuando el número ES la regla,
// no se mide con la misma constante).
const PARED_OESTE_U = -768;
const RADIO_JUGADOR_U = 16;

const liberados = liberarPuerto(PORT);
if (liberados) console.log(`  (puerto ${PORT} liberado: ${liberados})`);
const dev = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { shell: true, stdio: "ignore" });
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
await new Promise((r) => setTimeout(r, 7000));

const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));

const controles = [];
const control = (que, bien, detalle = "") => { controles.push({ que, bien, detalle }); return bien; };
const VISTAS = `build/${MAPA}/vistas`;
mkdirSync(VISTAS, { recursive: true });
const pies = () => pag.evaluate(() => window.probe.mundo.donde().pies);
const vida = () => pag.evaluate(() => window.probe.emociones.vitales()?.vida ?? null);

/** Luminancia media, fracción en negro y cuántos colores distintos hay (a 4 bits por canal). */
async function brilloDeLaPantalla(nombre) {
  const ruta = `${VISTAS}/${nombre}.png`;
  await pag.screenshot({ path: ruta });
  const { rgba } = leerPng(ruta);
  let suma = 0, negros = 0;
  const colores = new Set();
  for (let i = 0; i < rgba.length; i += 4) {
    const l = 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
    suma += l; if (l < 8) negros++;
    colores.add(((rgba[i] >> 4) << 8) | ((rgba[i + 1] >> 4) << 4) | (rgba[i + 2] >> 4));
  }
  const n = rgba.length / 4;
  return { medio: suma / n, negro: negros / n, colores: colores.size, ruta };
}

try {
  await entrarPorElMenu(pag, PORT, { mapa: MAPA });
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
  await pag.waitForFunction(() => window.probe.sesion.estado() === "jugando", null, { timeout: 60000 })
    .catch(() => {});
  const mapa = await pag.evaluate(() => window.probe.vgui2.mapaDeLaPartida());
  control("se entra por el menú y el mapa es la sala", mapa === MAPA, `mapa ${mapa}`);

  // ── 1. EL SUELO ──────────────────────────────────────────────────────────
  // Dos lecturas separadas un segundo: si el suelo no chocara, la segunda
  // estaría más abajo que la primera. El suelo del hueco está a z = 0.
  await pag.waitForTimeout(1500);
  const p1 = await pies();
  await pag.waitForTimeout(1000);
  const p2 = await pies();
  control("se nace sobre el suelo, a la altura del suelo",
    Math.abs(p2[1]) < 0.1, `pies a ${p2[1].toFixed(3)} m (el suelo está a 0)`);
  control("y se queda ahí: no cae", Math.abs(p2[1] - p1[1]) < 0.01,
    `${p1[1].toFixed(3)} → ${p2[1].toFixed(3)} m en 1 s`);

  // ── 2. LA PARED ──────────────────────────────────────────────────────────
  // Se mira al oeste y se anda. Sin colisión el jugador pasaría de largo la
  // pared; con ella, se para a un radio de su cara.
  const antes = await pies();
  await pag.evaluate((p) => window.probe.mundo.mirar(p[0] - 10, p[1] + 1.6, p[2]), antes);
  await pag.keyboard.down("KeyW");
  await pag.waitForTimeout(3000);
  await pag.keyboard.up("KeyW");
  await pag.waitForTimeout(300);
  const tras = await pies();
  const anduvo = antes[0] - tras[0];
  const tope = (PARED_OESTE_U + RADIO_JUGADOR_U) / U;
  control("CONTROL: andando hacia el oeste, el jugador se mueve de verdad",
    anduvo > 1, `${anduvo.toFixed(2)} m hacia el oeste`);
  control("y la pared lo para a un radio de su cara",
    Math.abs(tras[0] - tope) < 0.1, `x = ${tras[0].toFixed(3)} m, el tope es ${tope.toFixed(3)} m`);

  // ── 3. LA LUZ ────────────────────────────────────────────────────────────
  // Mirando hacia el pasillo, que es la vista con más profundidad del mapa.
  await pag.evaluate((p) => window.probe.mundo.mirar(p[0] + 10, p[1] + 1.4, p[2]), tras);
  await pag.waitForTimeout(500);
  const b = await brilloDeLaPantalla("sala88-pasillo");
  control("la pantalla NO es negra: luminancia media",
    b.medio > 30 && b.negro < 0.3, `media ${b.medio.toFixed(1)}/255, ${(b.negro * 100).toFixed(1)} % en negro`);
  control("y tiene textura, no un color plano", b.colores > 50, `${b.colores} colores distintos a 4 bits`);

  // ── 4. LA RATA ───────────────────────────────────────────────────────────
  const rata0 = await pag.evaluate(() => window.probe.ia.bicho("monsters/giantrat"));
  control("la rata está en el mapa y viva", Boolean(rata0) && rata0.vida > 0 && !rata0.muerto,
    rata0 ? `${rata0.nombre}, vida ${rata0.vida}/${rata0.vidaMaxima}, en (${rata0.unidades.map((v) => v.toFixed(0)).join(", ")}) u` : "no está");

  // Al lado y no encima: `poner` no resuelve colisiones (el 69).
  const plantarse = async () => pag.evaluate(() => {
    const r = window.probe.ia.bicho("monsters/giantrat");
    window.probe.mundo.poner(r.donde[0] - 1.0, r.donde[1] + 0.1, r.donde[2]);
    window.probe.mundo.mirar(r.donde[0], r.donde[1] + 0.2, r.donde[2]);
    return r;
  });
  await plantarse();
  const vidaQuieto0 = await vida();
  // Mientras se espera, se la vuelve a encarar: la separación es lo que se
  // fija, no el punto (el 82).
  for (let i = 0; i < 6; i++) { await pag.waitForTimeout(500); await plantarse(); }
  const vidaQuieto1 = await vida();

  // Un espadazo, y luego esperar el mordisco.
  const golpe = await pag.evaluate(() => {
    const S = window.probe;
    const r0 = S.ia.bicho("monsters/giantrat");
    S.golpe.atacar(1.2);
    const r1 = S.ia.bicho("monsters/giantrat");
    return { antes: r0.vida, despues: r1.vida };
  });
  control("el espadazo le quita vida a la rata", golpe.despues < golpe.antes,
    `${golpe.antes} → ${golpe.despues}`);
  const vidaAntes = await vida();
  let vidaDespues = vidaAntes, t = 0;
  while (t < 15000 && vidaDespues >= vidaAntes) {
    await pag.waitForTimeout(500); t += 500;
    await plantarse();
    vidaDespues = await vida();
  }
  control("y la rata muerde: el jugador pierde vida", vidaDespues < vidaAntes,
    `${vidaAntes} → ${vidaDespues} en ${(t / 1000).toFixed(1)} s`);

  // ── LO QUE HAY QUE COMPARAR CON XASH ─────────────────────────────────────
  console.log(`\n  PARA COMPARAR CON XASH (el oráculo)`);
  console.log(`    la rata          ${rata0?.nombre} · vida ${rata0?.vidaMaxima}`);
  console.log(`    quieto a su lado 3 s sin pegarle: vida ${vidaQuieto0} → ${vidaQuieto1}` +
    ` (${vidaQuieto1 < vidaQuieto0 ? "MUERDE SIN QUE LA TOQUES" : "no muerde sin que la toques"})`);
  console.log(`    tras un espadazo muerde a los ${(t / 1000).toFixed(1)} s, ${vidaAntes - vidaDespues} de daño`);
  console.log(`    la luz           media ${b.medio.toFixed(1)}/255 mirando al pasillo (${b.ruta})`);

  const bien = controles.filter((c) => c.bien).length;
  console.log(`\n  CONTROLES`);
  for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(62)} ${c.detalle}`);
  console.log(`\n  ${bien} de ${controles.length} en verde`);
  console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}\n`);
  await nav.close();
  matar(dev);
  process.exit(bien === controles.length && errores.length === 0 ? 0 : 1);
} catch (e) {
  // UNA CAÍDA ES UNA ROJA, NO UNA NOTA AL PIE — la lección del 65.
  console.log(`\n  LA SONDA SE HA CAÍDO: ${e.message}`);
  console.log(`  llevaba ${controles.filter((c) => c.bien).length} de ${controles.length} controles corridos`);
  for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(62)} ${c.detalle}`);
  console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);
  try { await nav.close(); } catch {}
  matar(dev);
  process.exit(1);
}
