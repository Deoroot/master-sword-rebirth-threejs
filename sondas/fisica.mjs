// LA FÍSICA DE MASTER SWORD, medida en el mapa de verdad.
//
// Las 50 comprobaciones de `test/juego_movimiento.test.mjs` dicen que las
// fórmulas están bien copiadas. No dicen que el jugador ande a esa velocidad
// en Gate City: entre las dos cosas están la conversión de unidades —que es
// justo donde estaba el fallo del 23 %— y el controlador de Rapier.
//
// Esto cronometra al jugador andando por el templo y compara con lo que el
// motor promete.
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { esNuestro, liberarPuerto, arrancarVite } from "./mismo.mjs";
import { mkdirSync } from "node:fs";

const PORT = 5195;
// Se mata a quien estuviera en el puerto ANTES de arrancar el nuestro.
// `--strictPort` hace que el nuestro falle si esta ocupado, y con
// `stdio: "ignore"` ese fallo no se ve: la sonda acaba midiendo el programa
// de otro. Ver `sondas/mismo.mjs`.
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (habia ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = await arrancarVite(PORT);
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1200, height: 820 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
await pag.goto(`http://localhost:${PORT}/?map=gatecity`, { waitUntil: "load" });
await esNuestro(pag, PORT);
await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
mkdirSync("build/gatecity/vistas", { recursive: true });

const controles = [];
const control = (que, bien, detalle = "") => { controles.push({ que, bien, detalle }); };

await pag.evaluate(() => window.probe.sesion.nuevo("Andarin"));
await pag.waitForTimeout(600);

const U = await pag.evaluate(() => window.probe.level.unitsPerMetre);
console.log(`  unidades por metro:   ${U}`);
control("el mapa declara 39,37 u/m", Math.abs(U - 39.37) < 0.01, String(U));

const perfil = await pag.evaluate(() => {
  const P = window.probe.player.perfil;
  return { msr: P.msr, uPorM: P.unidadesPorMetro, alto: P.height, ojo: P.eye, escalon: P.stepHeight, radio: P.radius };
});
console.log(`  perfil:               ${perfil.msr ? "Master Sword" : "QUAKE (mal)"} · ` +
  `alto ${perfil.alto.toFixed(3)} m · ojo ${perfil.ojo.toFixed(3)} · escalón ${perfil.escalon.toFixed(3)}`);
control("usa el perfil de Master Sword", perfil.msr === true);
control("la caja mide 72 u de alto", Math.abs(perfil.alto * U - 72) < 0.01, `${(perfil.alto * U).toFixed(1)} u`);
control("el ojo está a 64 u, no a 56", Math.abs(perfil.ojo * U - 64) < 0.01, `${(perfil.ojo * U).toFixed(1)} u`);
control("el escalón es 18 u, no 16", Math.abs(perfil.escalon * U - 18) < 0.01, `${(perfil.escalon * U).toFixed(1)} u`);

// ── andar ──────────────────────────────────────────────────────────────────
//
// Se cronometra en un tramo despejado: se mira al rumbo medido del punto de
// aparición, que tiene 12,6 m libres por delante.
//
// **Y hay que girar al jugador según la tecla.** El rumbo medido del punto de
// aparición sólo garantiza hueco HACIA DELANTE; la primera versión de esta
// sonda cronometró la S y la D contra la pared de al lado y dio 0,00 y 0,55
// m/s, acusando a un código correcto. Con yaw θ el jugador avanza a
// (−sen θ, −cos θ), retrocede a lo contrario, y su costado derecho es el
// frente de θ − π/2. Así que para medir cada tecla se le pone el rumbo que
// manda ESA tecla hacia el hueco.
const GIRO = { KeyW: 0, KeyS: Math.PI, KeyD: Math.PI / 2, KeyA: -Math.PI / 2 };

async function cronometrar(tecla, segundos = 1.6) {
  await pag.evaluate(() => window.probe.sesion.reaparecer?.());
  await pag.evaluate((giro) => {
    const d = window.probe.sesion.donde().dice;
    if (Number.isFinite(d?.yaw)) window.probe.player.yaw = d.yaw + giro;
  }, GIRO[tecla] ?? 0);
  await pag.waitForTimeout(250);
  await pag.keyboard.down(tecla);
  // Medio segundo para que la aceleración del motor llegue a régimen: con
  // `sv_accelerate 10` se tarda una décima larga en alcanzar la velocidad.
  await pag.waitForTimeout(500);
  const a = await pag.evaluate(() => window.probe.player.feet);
  const t0 = Date.now();
  await pag.waitForTimeout(segundos * 1000);
  const b = await pag.evaluate(() => window.probe.player.feet);
  const dt = (Date.now() - t0) / 1000;
  await pag.keyboard.up(tecla);
  await pag.waitForTimeout(200);
  return Math.hypot(b[0] - a[0], b[2] - a[2]) / dt;
}

const esperada = await pag.evaluate(() => {
  // Lo que el modelo dice que debería andar ESTE personaje.
  const v = window.probe.fisica.vitales();
  return v.andando;
});
console.log(`\n  el modelo dice:       ${esperada.toFixed(1)} u/s = ${(esperada / U).toFixed(2)} m/s`);

const alante = await cronometrar("KeyW");
const atras = await cronometrar("KeyS");
const lado = await cronometrar("KeyD");
console.log(`  cronometrado adelante ${(alante * U).toFixed(1)} u/s = ${alante.toFixed(2)} m/s`);
console.log(`  cronometrado atrás    ${(atras * U).toFixed(1)} u/s = ${atras.toFixed(2)} m/s`);
console.log(`  cronometrado de lado  ${(lado * U).toFixed(1)} u/s = ${lado.toFixed(2)} m/s`);

// Margen del 12 %: el tramo no es infinito, hay rozamiento de borde y el
// controlador de Rapier recorta un poco al deslizar. Lo que se juzga es que
// esté en el sitio, no al decimal.
control("anda a la velocidad que dice el modelo",
  Math.abs(alante * U - esperada) / esperada < 0.12,
  `${(alante * U).toFixed(1)} contra ${esperada.toFixed(1)} u/s`);
control("y NO a la de Quake, que era un 23 % más",
  Math.abs(alante * U - esperada * 1.23) / esperada > 0.12,
  `con el perfil viejo habrían sido ${(esperada * 1.23).toFixed(1)} u/s`);
control("hacia atrás va a la MITAD", Math.abs(atras / alante - 0.5) < 0.08,
  `razón ${(atras / alante).toFixed(3)}, tenía que ser 0,5`);
control("de lado va al 80 %", Math.abs(lado / alante - 0.8) < 0.08,
  `razón ${(lado / alante).toFixed(3)}, tenía que ser 0,8`);

// ── correr ─────────────────────────────────────────────────────────────────
await pag.evaluate(() => window.probe.sesion.reaparecer?.());
await pag.waitForTimeout(250);
await pag.evaluate(() => {
  const d = window.probe.sesion.donde().dice;
  if (Number.isFinite(d?.yaw)) window.probe.player.yaw = d.yaw;
});
const aguante0 = await pag.evaluate(() => window.probe.fisica.aguante());
await pag.keyboard.down("ShiftLeft");
await pag.keyboard.down("KeyW");
await pag.waitForTimeout(700);
const corriendo = await pag.evaluate(() => ({ corre: window.probe.fisica.corriendo(), v: window.probe.player.rapidez }));
await pag.waitForTimeout(800);
const aguante1 = await pag.evaluate(() => window.probe.fisica.aguante());
await pag.keyboard.up("KeyW");
await pag.keyboard.up("ShiftLeft");
console.log(`\n  corriendo:            ${corriendo.corre ? "sí" : "NO"} · ${corriendo.v.toFixed(0)} u/s · ` +
  `aguante ${aguante0.toFixed(2)} → ${aguante1.toFixed(2)}`);
control("con Mayús y adelante, corre", corriendo.corre === true);
control("y corriendo va más rápido que andando", corriendo.v > alante * U * 1.2,
  `${corriendo.v.toFixed(0)} contra ${(alante * U).toFixed(0)} u/s`);
control("correr gasta aguante", aguante1 < aguante0, `${aguante0.toFixed(2)} → ${aguante1.toFixed(2)}`);

// Y se recupera al parar. El control positivo del anterior.
await pag.waitForTimeout(1500);
const aguante2 = await pag.evaluate(() => window.probe.fisica.aguante());
console.log(`  parado 1,5 s:         aguante ${aguante1.toFixed(2)} → ${aguante2.toFixed(2)}`);
control("y parado se recupera", aguante2 > aguante1, `${aguante1.toFixed(2)} → ${aguante2.toFixed(2)}`);

// ── saltar ─────────────────────────────────────────────────────────────────
await pag.evaluate(() => window.probe.sesion.reaparecer?.());
await pag.waitForTimeout(400);
const suelo = await pag.evaluate(() => window.probe.player.feet[1]);
await pag.keyboard.press("Space");
let cima = suelo;
for (let i = 0; i < 40; i++) {
  await pag.waitForTimeout(25);
  const y = await pag.evaluate(() => window.probe.player.feet[1]);
  if (y > cima) cima = y;
}
const subida = (cima - suelo) * U;
console.log(`\n  el salto sube:        ${subida.toFixed(1)} u = ${(subida / U).toFixed(2)} m  (el motor: 45 u)`);
// Margen de 6 unidades: el muestreo cada 25 ms puede perderse la cima.
control("el salto sube sus ~45 unidades", Math.abs(subida - 45) < 6, `${subida.toFixed(1)} u`);

// ── la caída ───────────────────────────────────────────────────────────────
const caida = await pag.evaluate(() => ({
  seguro: window.probe.fisica.danoDeCaida(580),
  algo: window.probe.fisica.danoDeCaida(800),
  mortal: window.probe.fisica.danoDeCaida(1024),
}));
console.log(`  daño de caída:        580 u/s → ${caida.seguro} · 800 → ${caida.algo.toFixed(1)} · 1024 → ${caida.mortal.toFixed(0)}`);
control("hasta 580 u/s no duele", caida.seguro === 0);
control("y a 1024 son 100 exactos", Math.abs(caida.mortal - 100) < 0.01);

// ── las teclas ─────────────────────────────────────────────────────────────
const t = await pag.evaluate(() => window.probe.teclas.mapa());
console.log(`\n  teclas:               adelante ${t.adelante} · hoja ${t.hoja} · usar ${t.usar} · correr ${t.correr}`);
control("los valores por defecto son los del config.cfg del juego",
  t.adelante === "KeyW" && t.hoja === "KeyP" && t.usar === "KeyE" && t.correr === "ShiftLeft",
  `hoja=${t.hoja} (el juego: bind "p" "playerinfo")`);

const conflicto = await pag.evaluate(() => {
  const r = window.probe.teclas.asignar("saltar", "KeyW");
  const m = window.probe.teclas.mapa();
  window.probe.teclas.porDefecto();
  return { robadaA: r.robadaA, adelanteDespues: m.adelante ?? null };
});
console.log(`  al asignar W a saltar: se la quita a [${conflicto.robadaA}], adelante queda ${conflicto.adelanteDespues}`);
control("una tecla sólo puede hacer una cosa",
  conflicto.robadaA.includes("adelante") && conflicto.adelanteDespues === null);

await pag.screenshot({ path: "build/gatecity/vistas/fisica.png" });
await pag.evaluate(() => window.probe.personaje.opciones());
await pag.waitForTimeout(400);
await pag.screenshot({ path: "build/gatecity/vistas/ui-opciones.png" });
control("la pantalla de opciones se abre y lista las acciones",
  (await pag.evaluate(() => document.querySelectorAll(".mx-tecla").length)) >= 15,
  `${await pag.evaluate(() => document.querySelectorAll(".mx-tecla").length)} acciones`);

console.log("\n  CONTROLES");
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(50)} ${c.detalle}`);
const mal = controles.filter((c) => !c.bien);
console.log(`\n  ${controles.length - mal.length} de ${controles.length} en verde`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);

await nav.close(); matar(dev);
process.exit(mal.length || errores.length ? 1 : 0);
