// EL SONIDO, medido y no escuchado.
//
// Una sonda no oye, y por eso casi todo lo que falla en el audio de una página
// falla EN SILENCIO Y SIN ERROR: el contexto se queda suspendido, el archivo
// devuelve 404, el oyente no se mueve, el buffer no decodifica. Lo que sí se
// puede mirar es el estado del `AudioContext`, cuántas fuentes se han
// arrancado, qué material dice el suelo bajo los pies y qué pide cada zona.
//
// Y una advertencia que es parte del resultado: **de Gate City sólo va a sonar
// el 0,5 % del suelo**, porque `pl_step*.wav` (piedra) y `pl_dirt*.wav` no
// están en Rebirth — es standalone y no lleva la carpeta `valve` de Half-Life.
// Eso no es un fallo de esto: es lo que hay en el juego.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const PORT = 5198;
const dev = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { shell: true, stdio: "ignore" });
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
await new Promise((r) => setTimeout(r, 6000));

// `--autoplay-policy` es lo que permite comprobar el RESTO del sistema sin un
// gesto real. NO se usa para tapar el problema: hay un control más abajo que
// comprueba que el contexto nace suspendido de todas formas, que es lo que le
// va a pasar al jugador.
const nav = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
const fallos404 = [];
pag.on("response", (r) => { if (r.status() === 404 && /\/snd\//.test(r.url())) fallos404.push(r.url().split("/snd/")[1]); });
await pag.goto(`http://localhost:${PORT}/?map=gatecity`, { waitUntil: "load" });

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });

await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
await pag.evaluate(() => window.probe.sesion.nuevo("Sonda"));
await pag.waitForTimeout(400);

// ── 1. EL CATÁLOGO ─────────────────────────────────────────────────────────
const antes = await pag.evaluate(() => window.probe.sonido.estado);
console.log(`  catálogo: ${JSON.stringify(antes.catalogo)}`);
control("el catálogo de sonido carga", Boolean(antes.catalogo));
control("y trae las cuatro canciones del mapa", antes.catalogo?.musica.length === 4,
  (antes.catalogo?.musica ?? []).join(", "));
control("y declara lo que NO está en el juego", (antes.catalogo?.faltan ?? 0) > 0,
  `${antes.catalogo?.faltan} archivos, de la carpeta valve de Half-Life`);
control("y los que están y no suenan", (antes.catalogo?.mudos ?? 0) === 4,
  `${antes.catalogo?.mudos} (pl_ladder*, 10 ms)`);

// ── 2. EL GESTO, que es la regla del navegador y no del juego ──────────────
control("el contexto NO está despierto al cargar", !antes.despierto, antes.contexto);
await pag.evaluate(() => window.probe.sonido.despertar());
await pag.waitForTimeout(600);
const desp = await pag.evaluate(() => window.probe.sonido.estado);
console.log(`  contexto: ${antes.contexto} -> ${desp.contexto}`);
control("y despierta cuando se le pide desde un gesto", desp.despierto, desp.contexto);

// ── 3. EL AMBIENTE, que arranca al despertar ───────────────────────────────
console.log(`  fuentes arrancadas al despertar: ${desp.arrancadas}`);
// Tres `ambient_generic` con archivo, menos los que empiezan callados. El
// cuarto (`ambience/drips.wav`) no está en el juego.
control("los sonidos de ambiente arrancan solos", desp.arrancadas >= 1, `${desp.arrancadas} fuentes`);
// «¿Ha dado 404?» NO comprueba nada, y esto salió de esta misma sonda: el
// servidor de desarrollo devuelve `index.html` con estado 200 para lo que no
// existe, así que el archivo que falta llegaba como HTML y sólo lo cazó el
// decodificador, dos pasos más tarde. Lo que se pide es que NO se pida nada
// que el catálogo ya diga que no está.
control("y no se pide ningún archivo que el catálogo dice que no está",
  desp.ambienteSinArchivo >= 1 && desp.fallos.length === 0,
  `${desp.ambienteSinArchivo} saltado (ambience/drips.wav, de Half-Life), ${desp.fallos.length} fallos`);
control("y ninguno da 404 — que además no bastaría", fallos404.length === 0, fallos404.join(", ") || "ninguno");

// ── 4. QUÉ SE PISA ─────────────────────────────────────────────────────────
//
// El trazo hacia abajo tiene que dar un material, y tiene que dar materiales
// DISTINTOS en sitios distintos: si diera siempre 'piedra' estaría midiendo el
// `default:` y no el suelo, y eso se ve igual de bien que funcionando.
// La primera versión de esto dejaba caer al jugador en una rejilla sobre la
// caja del mapa: daba 'piedra' las cuarenta veces. No porque el mapa sea de
// piedra, sino porque lo soltaba a la altura del TECHO y el trazo del motor
// son 64 unidades — medía el `default:` del `switch`. Ahora se pregunta encima
// de una cara de la que se SABE la textura.
const manifiesto = JSON.parse(readFileSync("build/gatecity/malla.json", "utf8"));
const catalogo = JSON.parse(readFileSync("build/gatecity/sonido.json", "utf8"));
const sitios = await pag.evaluate(() => window.probe.mundo.sitios());

// Una textura declarada de cada material que este mapa tenga, de la tabla real.
const porMaterial = new Map();
for (const g of manifiesto.grupos) {
  const m = catalogo.materiales[(g.texture ?? "").slice(0, 12).toUpperCase()];
  if (m && !porMaterial.has(m)) porMaterial.set(m, g.texture);
}
console.log(`  texturas declaradas en el mapa: ${[...porMaterial].map(([m, t]) => `${m}=${t}`).join(", ")}`);

const leidos = new Map();
for (const [mat, tex] of porMaterial) {
  const p = await pag.evaluate((t) => window.probe.sonido.puntoSobre(t), tex);
  if (!p) { leidos.set(mat, "(sin cara horizontal)"); continue; }
  const m = await pag.evaluate((p) => {
    window.probe.mundo.poner(p[0], p[1], p[2]);
    return window.probe.sonido.suelo();
  }, p);
  leidos.set(mat, m);
}
// Y una de piedra: una textura que NO está declarada tiene que dar el default.
const sinDeclarar = manifiesto.grupos.find((g) =>
  g.texture && !catalogo.materiales[g.texture.slice(0, 12).toUpperCase()] && g.texture.startsWith("wood_"));
if (sinDeclarar) {
  const p = await pag.evaluate((t) => window.probe.sonido.puntoSobre(t), sinDeclarar.texture);
  if (p) {
    const m = await pag.evaluate((p) => {
      window.probe.mundo.poner(p[0], p[1], p[2]);
      return window.probe.sonido.suelo();
    }, p);
    leidos.set(`sin declarar (${sinDeclarar.texture})`, m);
  }
}
for (const [k, v] of leidos) console.log(`  encima de ${k.padEnd(28)} -> ${v}`);

const aciertos = [...porMaterial.keys()].filter((m) => leidos.get(m) === m);
control("el trazo al suelo acierta el material de la cara", aciertos.length === porMaterial.size,
  `${aciertos.length} de ${porMaterial.size}: ${[...leidos].map(([k, v]) => `${k}->${v}`).join(", ")}`);
control("y devuelve materiales DISTINTOS, no siempre el default",
  new Set([...leidos.values()]).size > 1, [...new Set(leidos.values())].join(", "));
const madera = [...leidos].find(([k]) => k.startsWith("sin declarar"));
control("una textura sin declarar suena a PIEDRA, como en el juego original",
  !madera || madera[1] === "piedra", madera ? `${madera[0]} -> ${madera[1]}` : "no había");

// ── 5. LA REGLA, en el navegador y con los mismos números que en node ──────
const corriendo = await pag.evaluate(() => window.probe.sonido.simular(300, 3, { material: "tierra" }));
const andando = await pag.evaluate(() => window.probe.sonido.simular(150, 3, { material: "tierra" }));
console.log(`  a 300 u/s: ${corriendo.length} pasos · a 150 u/s: ${andando.length} pasos`);
control("corriendo da pasos", corriendo.length >= 10, `${corriendo.length} en 3 s`);
control("y andando NO: el corte de 220 de multijugador", andando.length === 0, `${andando.length}`);
control("y los cuatro pies alternan", new Set(corriendo.map((p) => p.muestra >= 2)).size === 2);

// ── 6. LA MÚSICA POR ZONAS ─────────────────────────────────────────────────
//
// Hay que llegar a una zona de música, y son cajas finas: se prueba el centro
// de cada una hasta que alguna conteste.
const zonasMusica = (manifiesto.interactivas?.zonas ?? []).filter((z) => z.clase === "msarea_music" && z.musica);
console.log(`  ${zonasMusica.length} zonas de música con canción`);
let pedida = null, cual = null;
for (const z of zonasMusica) {
  const c = [0, 1, 2].map((k) => (z.caja.min[k] + z.caja.max[k]) / 2);
  const r = await pag.evaluate((p) => {
    window.probe.mundo.poner(p[0], p[1], p[2]);
    return window.probe.sonido.zona();
  }, c);
  if (r) { pedida = r; cual = z.musica; break; }
}
console.log(`  dentro de una zona, pide: ${pedida ?? "nada"}`);
control("estar en una zona de música pide su canción", Boolean(pedida), `${pedida} (esperada ${cual})`);
if (pedida) {
  await pag.waitForTimeout(2500);
  const conMusica = await pag.evaluate(() => window.probe.sonido.estado);
  console.log(`  fuentes: ${desp.arrancadas} -> ${conMusica.arrancadas}`);
  control("y la canción llega a sonar de verdad", conMusica.arrancadas > desp.arrancadas,
    `${conMusica.arrancadas - desp.arrancadas} fuente nueva`);
  control("y sin errores al decodificar el mp3", conMusica.fallos.length === 0,
    conMusica.fallos.join(" | ") || "ninguno");
}

// ── 7. LA PUERTA PIDE SU SONIDO, aunque no lo tenga ────────────────────────
//
// Se cuenta el PEDIDO y no el sonido, porque `doors/doormove9.wav` es de
// Half-Life y Rebirth no lo trae. Sin este contador, «la puerta no hace ruido»
// no distingue entre no pedirlo (fallo nuestro) y no tenerlo (el juego).
const puerta = sitios.puertas[0];
const cp = [0, 1, 2].map((k) => (puerta.caja.min[k] + puerta.caja.max[k]) / 2);
const pedidosAntes = (await pag.evaluate(() => window.probe.sonido.estado)).pedidosDePuerta;
await pag.evaluate((p) => window.probe.mundo.poner(p[0], p[1], p[2]), [cp[0], cp[1], cp[2]]);
await pag.waitForTimeout(1200);
const pedidosDespues = (await pag.evaluate(() => window.probe.sonido.estado)).pedidosDePuerta;
console.log(`  pedidos de sonido de puerta: ${pedidosAntes} -> ${pedidosDespues}`);
control("abrir una puerta PIDE su sonido", pedidosDespues > pedidosAntes,
  `${pedidosDespues - pedidosAntes} vez, movesnd 9 = doors/doormove9.wav`);

const fin = await pag.evaluate(() => window.probe.sonido.estado);
control("y los pasos sin archivo se cuentan, no se tragan", typeof fin.sinArchivo === "number",
  `${fin.sinArchivo} pedidos sin archivo`);
// Desde el 26 la piedra y la tierra SÍ tienen muestras, y son NUESTRAS:
// `pl_step*` y `pl_dirt*` siguen sin estar en el mod y los genera
// `tools/sonido.mjs`. Este control está aquí para que no se olvide cuál es
// cuál — un catálogo lleno es justo cuando deja de verse.
control("la piedra y la tierra suenan con muestras GENERADAS, no leídas",
  fin.catalogo?.generados?.piedra === 4 && fin.catalogo?.generados?.tierra === 4,
  `piedra ${fin.catalogo?.generados?.piedra}, tierra ${fin.catalogo?.generados?.tierra} de 4`);
control("y los de Valve siguen contados como ausentes",
  (fin.catalogo?.faltan ?? 0) > 0, `${fin.catalogo?.faltan} archivos que el juego no tiene`);

// ── el veredicto ───────────────────────────────────────────────────────────
console.log("\n  CONTROLES");
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(52)} ${c.detalle}`);
const mal = controles.filter((c) => !c.bien);
console.log(`\n  ${controles.length - mal.length} de ${controles.length} en verde`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);

await nav.close(); matar(dev);
process.exit(mal.length || errores.length ? 1 : 0);
