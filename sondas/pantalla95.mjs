// EL FUNDIDO SIN BANDERAS Y EL TEMBLOR DE LA VISTA — experimento 95, pieza A.
//
//   node sondas/pantalla95.mjs
//
// Dos cosas de Master Sword que sólo se ven, medidas donde se ven:
//
//   1. `Effects_GetFade` (hudscript.cpp:250-282) borra las banderas del fundido
//      cada vez que se calcula la vista, ANTES de pintarlo. Un `fadeout` no
//      sube desde el principio: no hay nada durante su duración. Se mide en el
//      `style` del `div` del velo, fotograma a fotograma, con la sangre de
//      demonio (`effect screenfade ent_me 0.5 3 (255,0,0) 255 fadeout`,
//      effects/demon_blood.script:18).
//   2. `effect screenshake` mueve la CÁMARA: se lee `camera.position` menos el
//      ojo del jugador y el alabeo de `camera.rotation.z`, fotograma a
//      fotograma —no el número del temblor, que podría moverse sin llegar a la
//      vista (el «se mide el efecto» del apartado 3)—. Dos caminos del juego:
//      el terremoto de `ext_quake_fx` (`$get(ent_me,origin)`, la puerta de
//      `callexternal players`, traps/quake.script:136) y el latido de la sangre
//      de demonio (`$relpos(0,0,0)`, radio 32).
//
// Entra por el menú (CLAUDE.md §3), Gate City, un jugador.
//
// Controles negativos: antes de nada la cámara está en el ojo; en el AIRE el
// terremoto no le llega (util.cpp:1079); y al acabar vuelve al ojo. El techo
// de 16 unidades (4.12) se mide en la cámara: el guion pide 50.

import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto, lanzarVite, esperarHttp } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PUERTO_WEB = 5951;
const liberados = liberarPuerto(PUERTO_WEB);
if (liberados.length) console.log(`  (había ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = lanzarVite(PUERTO_WEB);
const matar = (p) => { if (!p) return; try { spawnSync("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// El marcador NO puede bajar (el 65 y el 86).
const DECLARADOS = 14;
const controles = [];
const control = (que, bien, detalle = "") => { controles.push({ que, bien: Boolean(bien), detalle }); console.log(`  ${bien ? "sí" : "NO"}  ${que}  [${detalle}]`); return bien; };
const errores = [];

/** Cuánto se separa la cámara del ojo, en UNIDADES del motor, y el alabeo máximo. */
function resumen(muestras, U, desde = 0, hasta = Infinity) {
  const m = muestras.filter((x) => x.t >= desde && x.t < hasta);
  let eje = 0, total = 0, alabeo = 0;
  for (const x of m) {
    eje = Math.max(eje, ...x.d.map((v) => Math.abs(v) * U));
    total = Math.max(total, Math.hypot(...x.d) * U);
    alabeo = Math.max(alabeo, Math.abs(x.alabeo));
  }
  return { n: m.length, eje, total, alabeo };
}

const parar = (pag) => pag.addInitScript(() => {
  // El árbol es compartido: sin esto el recargado en caliente de Vite tira la
  // partida a media medida (copiado de efectosred93, con sus constantes).
  const Real = window.WebSocket;
  const Falso = function (url, protos) {
    const esHmr = protos === "vite-hmr" || (Array.isArray(protos) && protos.includes("vite-hmr"));
    if (!esHmr) return new Real(url, protos);
    return { close() {}, send() {}, addEventListener() {}, removeEventListener() {}, readyState: 3 };
  };
  Object.assign(Falso, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  Falso.prototype = Real.prototype;
  window.WebSocket = Falso;
});

await esperarHttp(`http://localhost:${PUERTO_WEB}/`, { tope: 90_000, proceso: dev, quien: "vite" });   // el 98: en vez de dormir
const nav = await chromium.launch();
try {
  const pag = await nav.newPage({ viewport: { width: 1000, height: 700 } });
  pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
  await parar(pag);
  await entrarPorElMenu(pag, PUERTO_WEB, { mapa: "gatecity" });
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
  await pag.waitForTimeout(3000);
  const mapa = await pag.evaluate(() => window.probe.vgui2.mapaDeLaPartida());
  control("se ha entrado a Gate City por el menú", mapa === "gatecity", String(mapa));
  const U = await pag.evaluate(() => window.probe.level?.unitsPerMetre ?? window.probe.muerte.cielo().unidadesPorMetro);

  // ── 0. EN REPOSO ──────────────────────────────────────────────────────────
  const reposo = resumen(await pag.evaluate(() => window.probe.pantalla95.muestrear(1)), U);
  console.log(`    reposo          cámara a ${reposo.eje.toFixed(3)} u del ojo, alabeo ${reposo.alabeo.toFixed(3)}° (${reposo.n} fotogramas)`);
  control("CONTROL NEGATIVO: en reposo la cámara está en el ojo y sin alabeo",
    reposo.n >= 5 && reposo.eje < 0.05 && reposo.alabeo < 0.01, `${reposo.eje.toFixed(3)} u, ${reposo.alabeo.toFixed(3)}°`);

  // ── 1. EL TERREMOTO: `callexternal players ext_quake_fx 3` ────────────────
  const terremoto = await pag.evaluate(async () => {
    const r0 = window.probe.pantalla95.reloj();
    const llamado = window.probe.pantalla95.llamar("ext_quake_fx", ["3"]);
    const m = await window.probe.pantalla95.muestrear(1.5);
    return { r0, llamado, m, t: window.probe.pantalla95.temblores().at(-1) ?? null, no: window.probe.pantalla95.noSoportados() };
  });
  const t1 = resumen(terremoto.m, U);
  console.log(`    terremoto       decidido ${JSON.stringify(terremoto.t?.mensaje)} · centro ${JSON.stringify(terremoto.t?.centro)} · origen ${JSON.stringify(terremoto.t?.origen?.map((v) => +v.toFixed(1)))}`);
  console.log(`    la cámara       hasta ${t1.eje.toFixed(2)} u por eje (${t1.total.toFixed(2)} en total), alabeo hasta ${t1.alabeo.toFixed(2)}°`);
  control("el guion del jugador corre `ext_quake_fx` y su `effect screenshake` le llega (de pie, a 0 u del centro)",
    terremoto.llamado && terremoto.t?.mensaje?.amplitud === 65535 && terremoto.t?.enSuelo === true,
    JSON.stringify(terremoto.t) + " · " + terremoto.no.filter((x) => /shake|relpos|origin/.test(x)).join(" | "));
  control("`$get(ent_me,origin)` es el jugador y no el origen del mapa",
    terremoto.t && Math.hypot(...terremoto.t.centro.map((v, k) => v - terremoto.t.origen[k])) < 1 && Math.hypot(...terremoto.t.centro) > 10,
    `${JSON.stringify(terremoto.t?.centro)}`);
  control("LA CÁMARA TIEMBLA: se separa del ojo más de 2 unidades",
    t1.eje > 2, `${t1.eje.toFixed(2)} u`);
  // El guion pide 50; en 4.12 el techo es 15,9998 y el desplazamiento por eje
  // es `offset · fracción²·sin(…)`, con |offset| ≤ amplitud. Sin el techo
  // llegaría hasta 50.
  control("EL TECHO DE 16 UNIDADES: ningún eje pasa de 16 aunque el guion pida 50, y el alabeo de 4°",
    t1.eje <= 16.01 && t1.alabeo <= 4.01, `${t1.eje.toFixed(2)} u, ${t1.alabeo.toFixed(2)}°`);
  control("y también ALABEA la vista (`applied_angle` al ROLL)", t1.alabeo > 0.2, `${t1.alabeo.toFixed(2)}°`);
  // Hasta los 3,2 s DEL JUEGO desde que empezó (el bucle topa el paso a 0,1 s).
  await pag.evaluate((t) => window.probe.pantalla95.esperarA(() => window.probe.pantalla95.reloj() > t, 120), terremoto.r0 + 3.2);
  const tras = resumen(await pag.evaluate(() => window.probe.pantalla95.muestrear(0.5)), U);
  control("a los 3 s se acaba: la cámara vuelve al ojo", tras.eje < 0.05 && tras.alabeo < 0.01, `${tras.eje.toFixed(3)} u, ${tras.alabeo.toFixed(3)}°`);

  // ── 2. EN EL AIRE NO TIEMBLA ───────────────────────────────────────────────
  const aire = await pag.evaluate(async () => {
    const p = window.probe.player;
    // Se le sube un metro y se le suelta. Ni cuatro metros (¿techo?) ni un
    // empujón hacia arriba (`p.vel`, lo que hace `addvelocity`) lo despegaron:
    // con `grounded` el paso de `player.js` cambia la subida por el «pegado al
    // suelo» (player.js:345-347). Ver doc/PANTALLA_95.md.
    const f = p.feet;
    p.colocar([f[0], f[1] + 1, f[2]]);
    const despego = await window.probe.pantalla95.esperarA(() => !p.grounded, 20);
    const subido = p.feet[1] - f[1];
    const enSuelo = p.grounded;
    const llamado = window.probe.pantalla95.llamar("ext_quake_fx", ["3"]);
    const t = window.probe.pantalla95.temblores().at(-1) ?? null;
    const m = await window.probe.pantalla95.muestrear(0.4);
    const trasMuestrear = p.feet[1] - f[1], vel = [...p.vel];
    // Y se le devuelve a donde estaba: en este sitio, un metro arriba el cuerpo
    // se queda ENGANCHADO (cae a −1 040 u/s sin moverse: el colisionador se
    // solapa con algo), y la medida siguiente se haría con el jugador en el aire.
    // Y SIN la caída que acumuló enganchado: si no, al posarse le cobra una
    // caída de mil unidades por segundo y lo mata (pasó: el velo de 128 que leyó
    // el control del fundido era el de la MUERTE, `player.cpp:740`).
    p.colocar(f, { velocidad: [0, 0, 0] });
    p.caida = 0;
    return { despego, subido, enSuelo, llamado, t, m, trasMuestrear, vel };
  });
  const ta = resumen(aire.m, U);
  console.log(`    en el aire      subido ${aire.subido?.toFixed(2)} m (tras muestrear ${aire.trasMuestrear?.toFixed(2)} m, vel ${JSON.stringify(aire.vel?.map((v) => +v.toFixed(1)))}), despegó ${aire.despego}, en suelo ${aire.enSuelo} · decidido ${JSON.stringify(aire.t?.mensaje)} · cámara ${ta.eje.toFixed(3)} u`);
  control("CONTROL NEGATIVO: en el AIRE el mismo terremoto no le llega (FL_ONGROUND, util.cpp:1079) y la cámara no se mueve",
    aire.enSuelo === false && aire.llamado && aire.t?.enSuelo === false && aire.t?.mensaje === null && ta.eje < 0.05,
    `suelo ${aire.enSuelo}, ${JSON.stringify(aire.t?.mensaje)}, ${ta.eje.toFixed(3)} u`);
  // Que caiga, se pose y se acabe cualquier temblor (3,2 s de juego).
  const posado = await pag.evaluate(() => { const t = window.probe.pantalla95.reloj() + 3.2; return window.probe.pantalla95.esperarA(() => window.probe.pantalla95.reloj() > t && window.probe.player.grounded, 120); });
  const vivo = await pag.evaluate(() => window.probe.sesion.vitales());
  console.log(`    posado          ${posado} · vida ${vivo?.vida}`);

  // ── 3. LA SANGRE DE DEMONIO: `fadeout` sin banderas, y su latido ──────────
  // `applyeffect … "effects/demon_blood" 60.0 -5` (items/mana_demon_blood.script:54),
  // con intensidad 0 para que no le quite vida (el tinte del golpe sería otro rojo).
  const sangre = await pag.evaluate(async () => {
    const r = window.probe.pantalla95.aplicar("effects/demon_blood", ["60", "0"]);
    const m = await window.probe.pantalla95.muestrear(1.7);
    return { r, m, t: window.probe.pantalla95.temblores().at(-1) ?? null, no: window.probe.pantalla95.noSoportados(), temblor: window.probe.pantalla95.temblor() };
  });
  const ventana = (a, b) => sangre.m.filter((x) => x.t >= a && x.t < b);
  const primera = ventana(0, 0.42), subida = ventana(0.62, 0.96);
  const maxPrimera = Math.max(0, ...primera.map((x) => x.alfa));
  const maxSubida = Math.max(0, ...subida.map((x) => x.alfa));
  const rojo = subida.find((x) => x.alfa > 0)?.rgb;
  console.log(`    sangre          puesta ${sangre.r.puesto} · alfa 0-0,42 s ≤ ${maxPrimera} (${primera.length} fot.) · 0,62-0,96 s hasta ${maxSubida} (${subida.length} fot.) · color ${JSON.stringify(rojo)}`);
  control("la sangre de demonio se pone por la puerta de `applyeffect`", sangre.r.puesto === true, JSON.stringify(sangre.r));
  // Con las banderas (el motor de HL), a los 0,25 s el velo ya iría por 128.
  control("EFFECTS_GETFADE: durante la duración del `fadeout` (0,5 s) el velo NO se pinta",
    primera.length >= 3 && maxPrimera === 0, `máximo ${maxPrimera} en ${primera.length} fotogramas`);
  control("CONTROL POSITIVO: después SÍ sube, en rojo, y se mezcla (no multiplica)",
    maxSubida > 60 && rojo?.[0] === 255 && rojo?.[1] === 0 && subida.every((x) => x.mezcla === "normal"),
    `hasta ${maxSubida}, ${JSON.stringify(rojo)}`);
  // El latido es a 1,0 s (`callevent 1.0 demon_blood_loop`) y tiembla 1 s.
  const latido = resumen(sangre.m, U, 1.05, 1.7);
  console.log(`    latido          ${JSON.stringify(sangre.t?.mensaje)} de ${sangre.t?.de} a los ${(sangre.t?.t - sangre.r.t).toFixed(2)} s · ` +
    `cámara hasta ${latido.eje.toFixed(2)} u en ${latido.n} fot. (muestras hasta ${sangre.m.at(-1)?.t.toFixed(2)} s) · decisión ${JSON.stringify(sangre.t)} · ` +
    `suelo en las muestras ${sangre.m.map((x) => (x.enSuelo ? 1 : 0)).join("")}`);
  control("el latido (`$relpos(0,0,0)`, radio 32) sale del guion del EFECTO y mueve la cámara",
    sangre.t?.de === "effects/demon_blood" && sangre.t?.mensaje?.amplitud === 65535 && latido.eje > 1,
    `${sangre.t?.de}, ${latido.eje.toFixed(2)} u · ${sangre.no.filter((x) => /shake|relpos/.test(x)).join(" | ")}`);
} catch (e) {
  console.log(`\n  LA SONDA SE HA CAÍDO: ${String(e?.message ?? e).split("\n")[0]}`);
  controles.push({ que: `la sonda termina sin caerse (${String(e?.message ?? e).split("\n")[0]})`, bien: false, detalle: "" });
} finally {
  control("ni un error de página", errores.length === 0, errores.slice(0, 3).join(" · ") || "ninguno");
  await nav.close().catch(() => {});
  matar(dev);
}

const bien = controles.filter((c) => c.bien).length;
console.log(`\n  ── ${bien} de ${DECLARADOS} controles ──`);
if (controles.length !== DECLARADOS) console.log(`  corrieron ${controles.length} de ${DECLARADOS} declarados`);
for (const c of controles) if (!c.bien) console.log(`  NO  ${c.que}${c.detalle ? `  [${c.detalle}]` : ""}`);
process.exit(controles.length === DECLARADOS && controles.every((c) => c.bien) ? 0 : 1);
