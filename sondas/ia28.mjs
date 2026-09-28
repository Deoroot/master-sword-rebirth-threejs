// EL 28 EN PANTALLA: dos navegadores y UN pueblo.
//
//   npm run sonda:ia28
//
// `npm test` comprueba 38 reglas nuevas de la manada y de la fauna —que el dado
// es uno, que la foto de un bicho es delta, que el daño se recorta, que el
// rebobinado interpola—. **Ninguna de las 38 dice que dos jugadores vean lo
// mismo**, y eso es exactamente lo que el paso 5 viene a arreglar: hasta el 27
// cada pestaña simulaba sus propios 69 bichos con su propio `Math.random`, así
// que dos jugadores en la misma plaza veían dos pueblos — y nada lo decía,
// porque cada uno veía un pueblo perfectamente coherente.
//
// Las formas de que esto parezca funcionar y esté mal:
//
//    1. los bichos se dibujan y no se mueven      -> no llegan las fotos
//    2. se mueven y cada navegador ve otra cosa   -> siguen simulando ellos
//    3. los dos ven lo mismo porque los dos están quietos -> hace falta el
//       control de que se mueven de verdad, y no un poco
//    4. se mueven a saltos                        -> no se interpolan
//    5. uno mata un goblin y el otro lo sigue viendo vivo -> la vida en el
//       navegador
//    6. el cliente manda «este goblin tiene 0 de vida» y cuela -> no hay techo
//    7. se puede pegar desde el otro lado del mapa -> no se mide la distancia
//    8. se mide la distancia contra el PRESENTE y pegarle a uno que corre falla
//       siempre -> no se rebobina
//    9. muere, y el cadáver sigue siendo un muro invisible en la calle

import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { esNuestro } from "./mismo.mjs";
import { mkdirSync, rmSync } from "node:fs";

const PUERTO_WEB = 5213;
const PUERTO_PARTIDA = 5214;
const PERSONAJES = "build/partidas/sonda28/personajes";

try { rmSync("build/partidas/sonda28", { recursive: true, force: true }); } catch { /* no estaba */ }

/**
 * Deja libre un puerto matando a quien lo tenga. La lección del 27: una vuelta
 * que se cae deja vivo el servidor, y la siguiente mide **el proceso viejo**.
 */
function liberarPuerto(puerto) {
  const r = spawnSync("cmd", ["/c", `netstat -ano | findstr LISTENING | findstr :${puerto}`], { encoding: "utf8" });
  const pids = new Set(String(r.stdout ?? "").split(/\r?\n/)
    .map((l) => l.trim().split(/\s+/).pop()).filter((x) => /^[0-9]+$/.test(x) && x !== "0"));
  for (const pid of pids) spawnSync("taskkill", ["/F", "/T", "/PID", pid], { stdio: "ignore", shell: true });
  return [...pids];
}
const liberados = [...liberarPuerto(PUERTO_WEB), ...liberarPuerto(PUERTO_PARTIDA)];
if (liberados.length) console.log(`  (habia ${liberados.length} proceso(s) ocupando los puertos: matados)`);

const dev = spawn("npx", ["vite", "--port", String(PUERTO_WEB), "--strictPort"], { shell: true, stdio: "ignore" });
// Sin `shell: true`: así el `pid` es el de Node y matarlo lo mata de verdad.
const partida = spawn(process.execPath, [
  "tools/servidor.mjs", "--puerto", String(PUERTO_PARTIDA),
  "--nombre", "La sonda del 28", "--personajes", PERSONAJES, "--siempre",
], { stdio: ["ignore", "pipe", "pipe"] });
const salidaDelServidor = [];
partida.stdout.on("data", (b) => salidaDelServidor.push(String(b)));
partida.stderr.on("data", (b) => salidaDelServidor.push(`ERR ${b}`));
const matar = (p) => { try { spawnSync("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch { /* ya estaba */ } };

await new Promise((r) => setTimeout(r, 9000));   // vite y el mapa del servidor

const nav = await chromium.launch();
const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
// FUERA del `try`, y no es un detalle de estilo: dentro, la última línea del
// archivo —la que decide el código de salida— no lo ve.
const errores = [];

try {
const ANCHO = 1200, ALTO = 800;
const abrir = async (quien) => {
  const pag = await nav.newPage({ viewport: { width: ANCHO, height: ALTO } });
  pag.on("pageerror", (e) => {
    const traza = String(e.stack ?? "").split(/\r?\n/).slice(1, 4).join(" <- ");
    errores.push(`${quien}: ${String(e).slice(0, 160)} | ${traza.slice(0, 300)}`);
  });
  await pag.goto(`http://localhost:${PUERTO_WEB}/?map=gatecity&red=ws://localhost:${PUERTO_PARTIDA}/juego`, { waitUntil: "load" });
  await esNuestro(pag, PUERTO_WEB);
  await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
  return pag;
};

const ana = await abrir("ana");
const beto = await abrir("beto");
mkdirSync("build/gatecity/vistas", { recursive: true });

// ── 1. ENTRAR ───────────────────────────────────────────────────────────────
console.log(`\n  ENTRAR`);
await ana.evaluate(() => window.probe.sesion.nuevo("Ana", "swords_rsword"));
await esperar(600);
await beto.evaluate(() => window.probe.sesion.nuevo("Beto", "swords_rsword"));
await esperar(2000);

const dentro = await Promise.all([ana, beto].map((p) => p.evaluate(() => window.probe.red.estado())));
control("los dos entran y reciben fotos",
  dentro.every((d) => d.dentro && d.fotos > 0), `fotos ${dentro.map((d) => d.fotos).join(" y ")}`);

const cuantos = await Promise.all([ana, beto].map((p) => p.evaluate(() => window.probe.red.bichos().length)));
console.log(`    bichos          ana ${cuantos[0]} · beto ${cuantos[1]}`);
control("los dos tienen el censo entero de Gate City montado",
  cuantos[0] === 69 && cuantos[1] === 69, `${cuantos.join(" y ")}`);

// Las muestras: si no llegara ninguna, los bichos estarían dibujados y quietos
// en su sitio de nacimiento — que es el fallo número 1 y se ve igual de bien.
const muestras = await ana.evaluate(() => window.probe.red.muestras());
const conMuestras = muestras.filter((m) => m.n > 0).length;
console.log(`    fotos de bichos ${conMuestras} de 69 bichos tienen muestras del servidor`);
control("las fotos de los bichos LLEGAN: no están dibujados y quietos",
  conMuestras >= 60, `${conMuestras} de 69`);

// ── 2. SE MUEVEN, Y ES EL SERVIDOR EL QUE LOS MUEVE ────────────────────────
console.log(`\n  SE MUEVEN`);
// LOS DOS NAVEGADORES, y no sólo uno. Hace falta porque el control de abajo —el
// que compara los dos pueblos— saldría PERFECTO si las dos pestañas estuvieran
// congeladas en el punto de nacimiento: cero diferencia y cero juego. Y una
// pestaña de fondo en headless se queda sin `requestAnimationFrame` de verdad,
// así que no es un miedo teórico.
const leer = () => Promise.all([
  ana.evaluate(() => window.probe.red.bichos()),
  beto.evaluate(() => window.probe.red.bichos()),
]);
const antes = await leer();
await esperar(4000);
const despues = await leer();
const cuenta = (a, b) => {
  const movidos = b.filter((x, n) => Math.hypot(x.donde[0] - a[n].donde[0], x.donde[2] - a[n].donde[2]) > 0.3).length;
  const total = b.reduce((s, x, n) => s + Math.hypot(x.donde[0] - a[n].donde[0], x.donde[2] - a[n].donde[2]), 0);
  return { movidos, total };
};
const enAna = cuenta(antes[0], despues[0]);
const enBeto = cuenta(antes[1], despues[1]);
console.log(`    en 4 s          ana: ${enAna.movidos} bichos, ${enAna.total.toFixed(1)} m · ` +
  `beto: ${enBeto.movidos} bichos, ${enBeto.total.toFixed(1)} m`);
control("los bichos se mueven, y no un poco: `SetWanderDest` corre en el servidor",
  enAna.movidos >= 5 && enAna.total > 5, `${enAna.movidos} bichos, ${enAna.total.toFixed(1)} m`);
control("y se mueven en LAS DOS pestañas: ninguna está congelada",
  enBeto.movidos >= 5 && enBeto.total > 5, `beto: ${enBeto.movidos} bichos, ${enBeto.total.toFixed(1)} m`);

// ── 3. EL CONTROL QUE DECIDE EL EXPERIMENTO ─────────────────────────────────
console.log(`\n  UN SOLO PUEBLO`);
// Las dos lecturas A LA VEZ. Cada navegador dibuja `ex_interp` en el pasado
// según SU reloj, así que no van a dar el milímetro; lo que no puede pasar es
// que den sitios distintos.
const [deAna, deBeto] = await Promise.all([
  ana.evaluate(() => window.probe.red.bichos()),
  beto.evaluate(() => window.probe.red.bichos()),
]);
const diferencias = deAna.map((b, n) => Math.hypot(
  b.donde[0] - deBeto[n].donde[0], b.donde[2] - deBeto[n].donde[2])).sort((a, b) => a - b);
const mediana = diferencias[Math.floor(diferencias.length / 2)];
const peor = diferencias[diferencias.length - 1];
console.log(`    diferencia      mediana ${(mediana * 1000).toFixed(0)} mm · peor ${(peor * 100).toFixed(1)} cm`);
control("LOS DOS NAVEGADORES VEN LOS MISMOS BICHOS EN EL MISMO SITIO",
  mediana < 0.15 && peor < 1.5, `mediana ${(mediana * 1000).toFixed(0)} mm, peor ${(peor * 100).toFixed(1)} cm`);
const animacionesIguales = deAna.filter((b, n) => b.animacion === deBeto[n].animacion).length;
console.log(`    animación       ${animacionesIguales} de 69 coinciden`);
control("y con la misma animación puesta: el sorteo de la pose lo hace el servidor",
  animacionesIguales >= 65, `${animacionesIguales} de 69`);
const vidasIguales = deAna.filter((b, n) => b.vida === deBeto[n].vida).length;
control("y con la misma vida",
  vidasIguales === 69, `${vidasIguales} de 69`);

// ── 3b. LO QUE CUESTA QUE LOS BICHOS SEAN SÓLIDOS EN LOS DOS LADOS ─────────
//
// Y hay que medirlo, porque el 28 lo empeora a propósito. El servidor tiene los
// cilindros de los 69 en su sitio de AHORA; el navegador los tiene donde los
// dibuja, que es `ex_interp` en el pasado. O sea que si pasas rozando a un
// goblin que anda, el servidor te para medio paso antes o después que tu
// predicción — y eso es error de predicción de verdad, no un fallo.
//
// La primera vez apareció solo, en la sonda del 27: 110 mm donde siempre había
// 0,5. Se repitió dos veces más y dio 0,3 y 0,6, o sea que era un roce. Aquí se
// mide a propósito y se le pone un número, que es la diferencia entre «a veces
// falla» y «cuesta esto».
console.log(`\n  LO QUE CUESTA`);
await ana.bringToFront();
await ana.evaluate(() => {
  const d = window.probe.sesion.donde().dice;
  if (Number.isFinite(d?.yaw)) window.probe.player.yaw = d.yaw;
});
await ana.keyboard.down("KeyW");
await esperar(3000);
await ana.keyboard.up("KeyW");
await esperar(600);
const andando = await ana.evaluate(() => window.probe.red.estado());
console.log(`    andando 3 s     error último ${(andando.errorUltimo * 1000).toFixed(1)} mm · ` +
  `máximo ${(andando.errorMaximo * 1000).toFixed(0)} mm · ${andando.correcciones} correcciones`);
control("andando con 69 bichos sólidos en los dos lados, la predicción sigue acertando",
  andando.errorUltimo < 0.5, `${(andando.errorUltimo * 1000).toFixed(1)} mm`);

// ── 4. MATAR UNO, Y QUE EL OTRO LO VEA ─────────────────────────────────────
console.log(`\n  MATAR`);
const victima = await ana.evaluate(() => window.probe.red.masCerca());
console.log(`    víctima         #${victima.id} ${victima.nombre}, a ${victima.distancia.toFixed(1)} m, con ${victima.vida} de vida`);

// 4a. LA DISTANCIA, **sobre un bicho vivo y antes que nada**.
//
// El orden importa y lo aprendí a la primera vuelta: este control iba después
// del de matar, así que medía «0 → 0» sobre un cadáver. Trece de trece en verde
// y dos controles que no medían nada, que es el peor resultado posible.
const vidaAntesDeLejos = victima.vida;
await ana.evaluate((id) => window.probe.red.pegarA(id, 50, 10), victima.id);
await esperar(600);
const trasLejos = (await ana.evaluate(() => window.probe.red.bichos()))[victima.id];
const dijoLejos = await ana.evaluate(() => window.probe.red.ultimoGolpe());
console.log(`    alcance de 10 u ${trasLejos.vida} de vida (antes ${vidaAntesDeLejos}) · el servidor dice «${dijoLejos?.porque ?? "?"}»`);
control("un golpe que no llega no quita vida: el servidor mide la distancia",
  trasLejos.vida === vidaAntesDeLejos && vidaAntesDeLejos > 0 && dijoLejos?.lejos === true,
  `${vidaAntesDeLejos} → ${trasLejos.vida}, lejos=${dijoLejos?.lejos}`);

// 4b. EL TECHO. Se le manda 9 999 de daño, que es lo que mandaría un tramposo.
//
// Y se comprueba **el número al que recorta**, no que el bicho no sobreviva: con
// 80 de vida, cualquier recorte por encima de 80 lo mata igual y el control
// pasaría sin comprobar nada. La espada oxidada de salida hace 90 de base con 50
// de rango y duplica al cargar, y el crítico multiplica por 1,5:
//
//     (90 × 2 + 50) × 1,0 × 1,5 = 345
//
// Las tres piezas son del motor y están en `src/play/golpe.js` desde el 18.
const TECHO_DE_LA_ESPADA_OXIDADA = 345;
const vidaAntes = trasLejos.vida;
await ana.evaluate((id) => window.probe.red.pegarA(id, 9999), victima.id);
await esperar(600);
const trasElGolpe = (await ana.evaluate(() => window.probe.red.bichos()))[victima.id];
const dijoElGolpe = await ana.evaluate(() => window.probe.red.ultimoGolpe());
console.log(`    9 999 de daño   recortado a ${dijoElGolpe?.tope} (el techo de la espada) · ` +
  `le quedan ${trasElGolpe.vida} de ${vidaAntes}`);
control("EL TECHO DEL DAÑO: 9 999 se recorta a lo más que puede hacer ESA espada",
  Math.round(dijoElGolpe?.tope ?? 0) === TECHO_DE_LA_ESPADA_OXIDADA,
  `recortó a ${dijoElGolpe?.tope}, esperado ${TECHO_DE_LA_ESPADA_OXIDADA}`);

// 4c. MATARLO, y que Beto lo vea muerto.
for (let k = 0; k < 40; k++) {
  const v = (await ana.evaluate(() => window.probe.red.bichos()))[victima.id];
  if (v.muerto) break;
  await ana.evaluate((id) => window.probe.red.pegarA(id, 9999), victima.id);
  await esperar(250);
}
await esperar(800);
const [muertoParaAna, muertoParaBeto] = await Promise.all([
  ana.evaluate((id) => window.probe.red.bichos()[id], victima.id),
  beto.evaluate((id) => window.probe.red.bichos()[id], victima.id),
]);
console.log(`    ana ve          muerto=${muertoParaAna.muerto} vida=${muertoParaAna.vida} anim='${muertoParaAna.animacion}'`);
console.log(`    beto ve         muerto=${muertoParaBeto.muerto} vida=${muertoParaBeto.vida} anim='${muertoParaBeto.animacion}'`);
control("Ana lo mata Y BETO LO VE MUERTO: la vida vive en el servidor",
  muertoParaAna.muerto === true && muertoParaBeto.muerto === true,
  `ana ${muertoParaAna.muerto} · beto ${muertoParaBeto.muerto}`);
control("y los dos le ven la animación de morir puesta",
  muertoParaAna.animacion === muertoParaBeto.animacion && Boolean(muertoParaAna.animacion),
  `'${muertoParaAna.animacion}' y '${muertoParaBeto.animacion}'`);

// Y la experiencia la ha apuntado el servidor, en el personaje que él guarda.
const anaTrasMatar = await ana.evaluate(() => ({
  sucesos: window.probe.hud?.ultimos?.() ?? null,
  red: window.probe.red.estado(),
}));
void anaTrasMatar;

// ── 5. LA CAPTURA ───────────────────────────────────────────────────────────
const sitio = muertoParaAna.donde;
await ana.evaluate(([x, y, z]) => window.probe.mundo.mirar(x, y + 0.9, z), sitio);
await esperar(400);
await ana.screenshot({ path: "build/gatecity/vistas/ia28.png" });
console.log(`\n    captura         build/gatecity/vistas/ia28.png`);

// ── 6. Y NADA DE ESTO ROMPE LA PÁGINA ──────────────────────────────────────
console.log(`\n  EL MUNDO SIGUE EN PIE`);
const mundo = await ana.evaluate(() => ({
  triangulos: window.probe.level?.mesh?.triangleCount ?? 0,
  hud: window.probe.hud?.estado()?.visible ?? null,
}));
control("el mapa sigue dibujado y el HUD en pie con la manada al otro lado",
  mundo.triangulos > 40000 && mundo.hud !== false, JSON.stringify(mundo));
control("el servidor no ha escupido ningún error",
  !salidaDelServidor.some((l) => l.startsWith("ERR")),
  salidaDelServidor.filter((l) => l.startsWith("ERR")).join(" ").slice(0, 160) || "ninguno");

// Lo que el servidor dice de su propia fauna, que es la otra mitad del oráculo.
const dijo = salidaDelServidor.join("");
const vivos = dijo.match(/vivos (\d+)/)?.[1] ?? null;
console.log(`    el servidor dice: ${dijo.split("\n").filter((l) => l.includes("t=")).pop() ?? "(nada)"}`);
void vivos;

console.log(`\n  ── ${controles.filter((c) => c.bien).length} de ${controles.length} controles ──`);
for (const c of controles) console.log(`  ${c.bien ? "sí" : "NO"}  ${c.que}${c.detalle ? `  [${c.detalle}]` : ""}`);
console.log(`\n  errores de página: ${errores.length ? errores.join(" · ") : "ninguno"}`);

} catch (e) {
  const porque = String(e?.message ?? e).split("\n")[0];
  console.log(`\n  LA SONDA SE HA CAÍDO: ${porque}`);
  console.log(`  el servidor dijo:\n${salidaDelServidor.join("")}`);
  controles.push({ que: `la sonda termina sin caerse (${porque})`, bien: false, detalle: "" });
} finally {
  await nav.close().catch(() => {});
  matar(partida);
  matar(dev);
}
process.exit(controles.length && controles.every((c) => c.bien) && !errores.length ? 0 : 1);
