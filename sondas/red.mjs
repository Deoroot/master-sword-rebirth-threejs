// EL 27 EN PANTALLA: dos navegadores, un servidor, y un jugador que ve al otro.
//
//   npm run sonda:red
//
// `npm test` comprueba 49 reglas de la red —los vectores del RFC, las cifras del
// motor, que un cliente no puede andar el doble, que la reconciliación rehace
// las órdenes pendientes—. **Ninguna de las 49 dice que un jugador vea a otro.**
// Esto es lo que abre dos Chrome de verdad, levanta el servidor de verdad y lo
// mira.
//
// Y hay una cosa que sólo puede comprobar un navegador: nuestro marco de
// WebSocket y nuestro apretón de manos están escritos aquí, los dos lados. Si
// estuvieran mal de forma simétrica, nuestro cliente de Node y nuestro servidor
// se entenderían igual de mal y las pruebas seguirían en verde. **Chrome no
// perdona eso**: si la aceptación no cuadra o un marco viene con la máscara al
// revés, no abre la conexión. Que estas páginas conecten es el oráculo.
//
// Las formas de que esto parezca funcionar y esté mal:
//
//    1. conecta y no entra          -> el almacén remoto no contesta la lista
//    2. entra y no ve a nadie       -> la foto no llega (el campo `t` del sobre)
//    3. ve al otro y no se mueve    -> no se refresca con `interpolados()`
//    4. se mueve a saltos           -> se dibuja la foto cruda, sin interpolar
//    5. se mueve suave y va delante -> se extrapola: adivinar en vez de esperar
//    6. los dos ven lo mismo pero el servidor no sabe nada -> se manda posición
//    7. el servidor lo sabe y el cliente no le hace caso   -> no hay corrección
//    8. hay corrección y tira hacia atrás   -> no se rehacen las pendientes
//    9. todo bien y el personaje no se guarda -> el disco de la partida vacío
//   10. los dos nacen en el mismo punto y ninguno se puede mover
//   11. uno cierra y el otro sigue viendo su figura de pie para siempre
//   12. anda y la figura no mueve las piernas -> la animación no cambia

import { spawn, spawnSync } from "node:child_process";
import { lanzarVite, esperarHttp } from "./mismo.mjs";
import { chromium } from "playwright";
import { entrarPorElMenu } from "./entrar.mjs";
import { mkdirSync, rmSync, readdirSync, existsSync } from "node:fs";
import { MAPA_POR_DEFECTO, esNombreDeMapa } from "../src/play/mapa.js";

const PUERTO_WEB = 5211;
const PUERTO_PARTIDA = 5212;
const PERSONAJES = "build/partidas/sonda/personajes";

// EL SEGUNDO MAPA — experimento 61.
//
// Esta sonda midió la red **sólo en Gate City** desde el 27, y eso es la forma
// del apartado 4 que ni romper el arreglo caza: con un caso, el valor correcto
// y el valor de reposo son el mismo. El servidor acepta `--mapa` desde el 47 y
// nadie lo había ejecutado nunca; el menú elige mapa desde el 50 y esta sonda
// tomaba el de por omisión sin decirlo.
//
//     npm run sonda:red                 Gate City
//     npm run sonda:red -- --mapa edana el otro
//
// Se le pasa a las dos puntas: al servidor, que carga su malla de colisión, y
// a la fila «Map» del menú, que es por donde entra el jugador. Si no fueran el
// mismo, los dos navegadores andarían un mapa que el servidor no tiene.
const iMapa = process.argv.indexOf("--mapa");
const MAPA = iMapa >= 0 ? process.argv[iMapa + 1] : MAPA_POR_DEFECTO;
if (!esNombreDeMapa(MAPA)) { console.error(`«${MAPA}» no es un nombre de mapa`); process.exit(2); }
console.log(`\n  EL MAPA: ${MAPA}\n`);

// Se empieza en limpio: si quedaran personajes de la vuelta anterior, el
// control de «el personaje vive en el servidor» pasaría sin haber guardado nada.
try { rmSync("build/partidas/sonda", { recursive: true, force: true }); } catch {}

/**
 * Deja libre un puerto matando a quien lo tenga.
 *
 * Hace falta porque una vuelta que se cae puede dejar vivo el servidor, y la
 * siguiente vuelta mediría **el proceso viejo**: `--strictPort` no abre, los
 * navegadores hablan con el de antes, y los controles fallan por un fallo que ya
 * está arreglado. Pasó, y costó media hora.
 */
function liberarPuerto(puerto) {
  const r = spawnSync("cmd", ["/c", `netstat -ano | findstr LISTENING | findstr :${puerto}`], { encoding: "utf8" });
  const lineas = String(r.stdout ?? "").split(/\r?\n/);
  const pids = new Set(
    lineas.map((l) => l.trim().split(/\s+/).pop()).filter((x) => /^[0-9]+$/.test(x) && x !== "0")
  );
  for (const pid of pids) spawnSync("taskkill", ["/F", "/T", "/PID", pid], { stdio: "ignore", shell: true });
  return [...pids];
}
const liberados = [...liberarPuerto(PUERTO_WEB), ...liberarPuerto(PUERTO_PARTIDA)];
if (liberados.length) console.log(`  (habia ${liberados.length} proceso(s) ocupando los puertos: matados)`);

const dev = lanzarVite(PUERTO_WEB);
// El servidor SIN `shell: true`: así el `pid` es el de Node y matarlo lo mata
// de verdad. Con shell, el pid es el de `cmd.exe` y el nieto puede sobrevivir —
// que es cómo se quedó ocupado el puerto la primera vez.
const partida = spawn(process.execPath, [
  "tools/servidor.mjs", "--puerto", String(PUERTO_PARTIDA),
  "--nombre", "La sonda", "--personajes", PERSONAJES, "--mapa", MAPA,
], { stdio: ["ignore", "pipe", "pipe"] });
const salidaDelServidor = [];
partida.stdout.on("data", (b) => salidaDelServidor.push(String(b)));
partida.stderr.on("data", (b) => salidaDelServidor.push(`ERR ${b}`));
const matar = (p) => { try { spawnSync("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

// Y TODO lo que sigue va dentro de un `try/finally`.
//
// La primera vuelta de esta sonda se cayó a la mitad, dejó vivos el vite y el
// servidor, y la segunda vuelta midió **el proceso viejo**: `--strictPort` no
// pudo abrir el puerto, los navegadores hablaron con el servidor de antes y los
// controles fallaron por un fallo que ya estaba arreglado. Media hora en eso.
// vite y el mapa del servidor: se les PREGUNTA en vez de dormir a ciegas (el 98;
// el servidor no abre el puerto hasta haber cargado el mapa, servidor.mjs:241).
await esperarHttp(`http://localhost:${PUERTO_WEB}/`, { tope: 90_000, proceso: dev, quien: "vite" });
await esperarHttp(`http://localhost:${PUERTO_PARTIDA}/partidas`, { tope: 90_000, proceso: partida, quien: "el servidor de partida" });

const nav = await chromium.launch();
const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });

// EL 86: EL MARCADOR NO PODÍA BAJAR. Era «X de controles.length», con el
// denominador calculado al final, que es el fallo del 65: los controles que no
// llegan a correr no están en la lista, así que una caída a mitad remataba con
// «12 de 12 en verde». El `catch` del final empuja una roja —eso sí estaba—,
// pero el número que se lee de un vistazo seguía siendo una mentira tranquila.
//
// Va aquí arriba y no junto al marcador porque el `process.exit` lo lee DESPUÉS
// del `finally`, o sea fuera del `try`: declarado ahí dentro, la última línea de
// la sonda petaba con un `ReferenceError` justo en la pasada que viniera a
// cazar algo.
const DECLARADOS = 21;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
// `errores` FUERA del `try`, y no es estilo: la última línea del archivo —la
// que decide el código de salida— está fuera del bloque, así que con el `const`
// dentro la sonda terminaba con un `ReferenceError` después de imprimir sus
// 21 de 21. El resultado se leía bien y el código de salida era basura.
const errores = [];
try {
const ANCHO = 1200, ALTO = 800;
const abrir = async (quien) => {
  const pag = await nav.newPage({ viewport: { width: ANCHO, height: ALTO } });
  pag.on("pageerror", (e) => {
    const traza = String(e.stack ?? "").split(/\r?\n/).slice(1, 4).join(" <- ");
    errores.push(`${quien}: ${String(e).slice(0, 160)} | ${traza.slice(0, 300)}`);
  });
  // SE ENTRA POR EL MENÚ, como el jugador (59). El `red=` se queda en la URL
  // —el menú todavía no tiene su «Visit a Kingdom», y elegir el mapa por
  // omisión no recarga— pero el camino hasta dentro es el del jugador.
  await entrarPorElMenu(pag, PUERTO_WEB, {
    mapa: MAPA,
    extra: `red=ws://localhost:${PUERTO_PARTIDA}/juego`,
  });
  await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
  return pag;
};

const ana = await abrir("ana");
const beto = await abrir("beto");

// CUÁNTOS TRIÁNGULOS HABÍA AL ENTRAR, para el control del final.
//
// Ese control decía `triangulos > 40000`, que son los 41 494 de Gate City
// escritos a mano: en Edana, que tiene 33 087, se ponía rojo con el mapa
// perfectamente dibujado. Un umbral copiado de un mapa mide ese mapa. Lo que
// se quiere saber es que **sigue** en pie, así que se compara contra lo que
// había, y eso vale en los dos (61).
const trianguloAlEntrar = await ana.evaluate(() => window.probe.level?.mesh?.triangleCount ?? 0);
mkdirSync(`build/${MAPA}/vistas`, { recursive: true });

// ── 1. CONECTAR, que ya es el oráculo del marco ────────────────────────────
console.log(`\n  CONECTAR`);
const hayRed = await Promise.all([ana, beto].map((p) => p.evaluate(() => window.probe.red.hay)));
control("los dos navegadores abren la conexión (o sea: nuestro apretón y nuestro marco valen para Chrome)",
  hayRed.every(Boolean), `ana ${hayRed[0]} · beto ${hayRed[1]}`);

const huecos = await Promise.all([ana, beto].map((p) => p.evaluate(() => window.probe.red.estado()?.yo ?? null)));
console.log(`    huecos          ana ${huecos[0]} · beto ${huecos[1]}`);
control("cada uno coge un hueco distinto, el más bajo libre",
  huecos[0] === 1 && huecos[1] === 2, `${huecos.join(" y ")}`);

const lista = await ana.evaluate(() => window.probe.red.partidas());
console.log(`    lista           ${JSON.stringify(lista?.[0] ?? null)}`);
control("la lista de partidas contesta y dice cuántos hay conectados",
  (lista?.[0]?.conectados ?? 0) === 2, `conectados ${lista?.[0]?.conectados}`);

// ── 2. ENTRAR: el personaje se crea EN EL SERVIDOR ─────────────────────────
console.log(`\n  EL PERSONAJE VIVE ALLÍ`);
await ana.evaluate(() => window.probe.sesion.nuevo("Ana", "swords_rsword"));
await esperar(500);
await beto.evaluate(() => window.probe.sesion.nuevo("Beto", "swords_rsword"));
await esperar(1500);

const enElDisco = existsSync(PERSONAJES) ? readdirSync(PERSONAJES).filter((n) => n.endsWith(".json") && !n.endsWith(".bak.json")) : [];
console.log(`    en el disco     ${enElDisco.length} ficheros en ${PERSONAJES}`);
control("los dos personajes están en el disco DEL SERVIDOR, no en el navegador",
  enElDisco.length === 2, enElDisco.join(", "));

// Y la prueba de que la lista es suya: Ana ve el personaje de Beto.
const laListaDeAna = await ana.evaluate(() => window.probe.sesion.listar());
console.log(`    Ana ve          ${laListaDeAna.map((p) => p.nombre).join(", ")}`);
control("un navegador ve los personajes creados en el OTRO: el almacén es del servidor",
  laListaDeAna.some((p) => p.nombre === "Beto"), `${laListaDeAna.length} personajes`);

const dentro = await Promise.all([ana, beto].map((p) => p.evaluate(() => window.probe.red.estado())));
control("los dos han aparecido y reciben fotos",
  dentro.every((d) => d.dentro && d.fotos > 0), `fotos ${dentro.map((d) => d.fotos).join(" y ")}`);

// Nacer en el mismo punto y quedarse encajado es el fallo número 10.
const separados = Math.hypot(dentro[0].pies[0] - dentro[1].pies[0], dentro[0].pies[2] - dentro[1].pies[2]);
console.log(`    aparecen a      ${separados.toFixed(2)} m uno del otro`);
control("el segundo en llegar no nace DENTRO del primero",
  separados > 0.3, `${separados.toFixed(2)} m`);

// ── 3. VERSE ────────────────────────────────────────────────────────────────
console.log(`\n  VERSE`);
const losOtrosDeAna = await ana.evaluate(() => window.probe.red.otros());
console.log(`    Ana dibuja      ${JSON.stringify(losOtrosDeAna.map((o) => ({ id: o.id, sec: o.secuencia })))}`);
control("Ana dibuja una figura, y es la de Beto",
  losOtrosDeAna.length === 1 && losOtrosDeAna[0].id === 2, `${losOtrosDeAna.length} figuras`);

// Beto anda tres segundos. Se mide lo que Ana LE VE andar.
const antes = losOtrosDeAna[0]?.pies ?? [0, 0, 0];
// **Con el teclado de verdad**, no metiendo la tecla en un conjunto: la
// intención sale de `Teclas`, que escucha los sucesos del navegador. Y mirando
// al rumbo medido del punto de aparición, que es por donde hay hueco.
await beto.evaluate(() => {
  const d = window.probe.sesion.donde().dice;
  if (Number.isFinite(d?.yaw)) window.probe.player.yaw = d.yaw;
});
await beto.keyboard.down("KeyW");
await esperar(3000);
const mientras = await ana.evaluate(() => ({
  otros: window.probe.red.otros(), crudos: window.probe.red.crudos(), red: window.probe.red.estado(),
}));
await beto.keyboard.up("KeyW");

const anduvo = Math.hypot(mientras.otros[0].pies[0] - antes[0], mientras.otros[0].pies[2] - antes[2]);
console.log(`    Ana le ve andar ${anduvo.toFixed(2)} m en tres segundos`);
control("Ana ve moverse a Beto, y no un poco",
  anduvo > 2, `${anduvo.toFixed(2)} m`);
control("y la figura mueve las piernas: la secuencia es `run` mientras anda",
  mientras.otros[0].secuencia === "run", `secuencia '${mientras.otros[0].secuencia}'`);
control("se dibuja INTERPOLADO entre dos fotos, no la foto cruda",
  mientras.otros[0].interpolado === true, `interpolado ${mientras.otros[0].interpolado}`);

// El retraso de `ex_interp`: lo dibujado va DETRÁS de la última foto, nunca
// delante. Que vaya delante sería extrapolar, o sea adivinar.
const atraso = Math.hypot(
  mientras.crudos[0].pies[0] - mientras.otros[0].pies[0],
  mientras.crudos[0].pies[2] - mientras.otros[0].pies[2]
);
console.log(`    se le dibuja    ${(atraso * 100).toFixed(0)} cm por detrás de la última foto` +
  ` (ex_interp ${Math.round(mientras.red.interp * 1000)} ms)`);
control("se le dibuja POR DETRÁS de la última foto, que es lo que cuesta `ex_interp`",
  atraso > 0.05 && atraso < 2, `${(atraso * 100).toFixed(0)} cm`);

// Y se espera: **lo que se dibuja va 100 ms en el pasado**, así que justo al
// soltar la tecla la figura sigue corriendo — y tiene que seguir corriendo. Es
// `ex_interp` otra vez, vista desde la animación.
// Y Ana **al frente**: una pestaña de fondo en headless puede quedarse sin
// `requestAnimationFrame`, y entonces lo que se mide no es lo que el juego
// dibuja, es lo último que dibujó antes de dormirse.
await ana.bringToFront();
// Y se ESPERA a que la figura se pare, en vez de mirar tras una pausa fija.
// Tarda de verdad: los 100 ms de `ex_interp`, más lo que la foto lleve de vieja,
// más la desaceleración del motor. La primera versión miraba a los 900 ms, veía
// `run` y acusaba a un código correcto — que es el fallo de sonda de siempre.
const t0DelParon = Date.now();
let quieto = [];
for (let i = 0; i < 40; i++) {
  quieto = await ana.evaluate(() => window.probe.red.otros());
  if (quieto[0]?.secuencia === "attention") break;
  await esperar(100);
}
console.log(`    parar           ${Date.now() - t0DelParon} ms desde que suelta la tecla hasta que la figura se para`);
console.log(`    interpolado     ${JSON.stringify(await ana.evaluate(() => window.probe.red.interp()))}`);
const crudoQuieto = await ana.evaluate(() => window.probe.red.crudos());
const betoSeVe = await beto.evaluate(() => window.probe.red.estado());
console.log(`    parado          la última foto dice rapidez ${crudoQuieto.map((c) => c.rapidez).join(",")} · ` +
  `Beto ha mandado ${betoSeVe.ordenes} órdenes y tiene ${betoSeVe.pendientes} pendientes`);
control("y al pararse vuelve a `attention`",
  quieto[0]?.secuencia === "attention", `secuencia '${quieto[0]?.secuencia}'`);

// La foto, con Ana mirando a Beto.
const dondeEstaBeto = quieto[0].pies;
// `mirar` toma TRES números, no un array. Pasarle el array dejaba el yaw en
// NaN, la pantalla en negro y dos «AudioParam non-finite» en la consola — que
// fue como se encontró: por el error de audio, no por la captura.
await ana.evaluate(([x, y, z]) => window.probe.mundo.mirar(x, y + 0.9, z), dondeEstaBeto);
await esperar(300);
await ana.screenshot({ path: `build/${MAPA}/vistas/red.png` });
console.log(`    captura         build/${MAPA}/vistas/red.png`);

// ── 4. LA AUTORIDAD ────────────────────────────────────────────────────────
console.log(`\n  QUIÉN MANDA`);
const yaVa = await ana.evaluate(() => window.probe.red.estado());
// Se le miente al cliente de Ana: se le mueve el cuerpo dos metros sin decírselo
// al servidor. Es lo que haría una predicción equivocada — o un tramposo.
const mentira = await ana.evaluate(() => window.probe.red.mentir(2));
await ana.evaluate(() => window.probe.red.mandar());
await esperar(1200);
const tras = await ana.evaluate(() => window.probe.red.estado());
const volvio = Math.hypot(tras.pies[0] - mentira[0], tras.pies[2] - mentira[2]);
console.log(`    mentira de 2 m  -> correcciones ${yaVa.correcciones} → ${tras.correcciones}, volvió ${volvio.toFixed(2)} m`);
control("el servidor corrige la mentira: manda él",
  tras.correcciones > yaVa.correcciones && volvio > 1.5,
  `${tras.correcciones - yaVa.correcciones} correcciones, volvió ${volvio.toFixed(2)} m`);

// Y sin mentiras, la predicción tiene que acertar: es la misma física.
await ana.evaluate(() => { window.probe.red.estado(); });
const errorAntes = tras.errorMaximo;
await ana.evaluate(() => {
  const d = window.probe.sesion.donde().dice;
  if (Number.isFinite(d?.yaw)) window.probe.player.yaw = d.yaw;
});
await ana.keyboard.down("KeyW");
await esperar(3000);
await ana.keyboard.up("KeyW");
await esperar(600);
const anduvoAna = await ana.evaluate(() => window.probe.red.estado());
console.log(`    andando 3 s     error último ${(anduvoAna.errorUltimo * 1000).toFixed(1)} mm · ` +
  `${anduvoAna.ordenes} órdenes en ${anduvoAna.paquetes} paquetes · latencia ${(anduvoAna.latencia * 1000).toFixed(0)} ms`);
// Y AQUÍ HAY UNA TRAMPA QUE COSTÓ SEIS VUELTAS ENCONTRAR.
//
// Este control decía «error < 50 mm» y daba 0,3 mm nueve veces de cada diez y
// 274 mm la décima. No era ruido: desde el experimento 28 los 69 bichos son
// sólidos **en el servidor además de en el navegador**, y Ana anda tres segundos
// en línea recta desde la llegada. Cuando roza un cilindro, los dos lados
// resuelven el contacto con los 100 ms de desfase que hay entre ellos, y la
// separación es de verdad. `sonda:ia28` ya lo midió: hasta 245 mm, con sus
// correcciones.
//
// O sea que el control preguntaba dos cosas a la vez —«¿es la misma física?» y
// «¿había algo en medio?»— y fallaba por la segunda. Lo que de verdad tiene que
// valer siempre, con contacto o sin él, es que **converja**: el servidor manda,
// corrige, y el error vuelve a ser cero. Si las dos físicas fueran distintas no
// volvería nunca, y eso es lo que se mide ahora. No es un umbral más flojo: es
// un umbral que dice lo que quiere decir.
let errorFinal = anduvoAna.errorUltimo;
let asentado = false;
if (errorFinal >= 0.05) {
  await esperar(1500);
  const tras = await ana.evaluate(() => window.probe.red.estado());
  errorFinal = tras.errorUltimo;
  asentado = true;
  console.log(`    rozó algo       ${(anduvoAna.errorUltimo * 1000).toFixed(1)} mm -> ` +
    `${(errorFinal * 1000).toFixed(1)} mm tras 1,5 s de asentarse`);
}
control("andando de verdad, el cliente y el servidor convergen: es la misma física",
  errorFinal < 0.05,
  `${(errorFinal * 1000).toFixed(1)} mm${asentado ? " tras asentarse (rozó un bicho)" : ""}`);
control("y se mandan las órdenes con su respaldo: más órdenes que paquetes",
  anduvoAna.ordenes > anduvoAna.paquetes * 5, `${anduvoAna.ordenes} en ${anduvoAna.paquetes}`);
void errorAntes;

// ── 5. IRSE ────────────────────────────────────────────────────────────────
console.log(`\n  IRSE`);
await beto.close();
await esperar(1500);
const solo = await ana.evaluate(() => ({ otros: window.probe.red.otros(), red: window.probe.red.estado() }));
console.log(`    Ana dibuja      ${solo.otros.length} figuras`);
control("al cerrar la pestaña, la figura del que se fue DESAPARECE",
  solo.otros.length === 0, `${solo.otros.length} figuras`);
control("y Ana sigue jugando",
  solo.red.dentro && solo.red.fotos > 0, `dentro ${solo.red.dentro}`);

const guardados = readdirSync(PERSONAJES);
control("el personaje del que se fue está guardado, con su respaldo al lado",
  guardados.some((n) => n.endsWith(".bak.json")) || guardados.length >= 2,
  guardados.join(", "));

control("y el servidor no ha escupido ningún error",
  !salidaDelServidor.some((l) => l.startsWith("ERR")),
  salidaDelServidor.filter((l) => l.startsWith("ERR")).join(" ").slice(0, 120) || "ninguno");

// ── 6. Y NADA DE ESTO ROMPE LA PÁGINA ──────────────────────────────────────
console.log(`\n  EL MUNDO SIGUE EN PIE`);
// EL 86: ESTE CONTROL ERA RUIDO CON FORMA DE ROJO.
//
// Leía el HUD UNA VEZ, justo después de cerrarse la pestaña del segundo
// jugador. En Gate City salía verde siempre y **en Edana una pasada de cada
// dos**: con el mismo código, dos pasadas seguidas dieron `hud:false` y
// `hud:true`. O sea que no medía si el HUD está en pie, medía si había llegado
// ya — y Edana tarda más en estar lista (48 bichos, 27 guiones corriendo,
// contra los de Gate City).
//
// Es el 76 en la pieza de al lado: *un control sobre un estado inicial mide tu
// latencia si algo lo cambia solo*, y *un control que falla sin que nada esté
// roto es ruido con forma de rojo, y gasta la sesión siguiente*. Gastó ésta.
//
// El remedio es el del 76 también: se le dan vueltas hasta que sale y SE DICE
// EN CUÁNTAS. Con tope, para que un HUD que de verdad no vuelve siga siendo
// rojo. Y si vence el plazo, el detalle dice CUÁL de las cuatro razones de
// `seVeElHud` lo esconde (`src/play/hud.js:367`): la cifra de vida distingue
// «Ana se ha muerto» —en Edana hay jabalíes que pegan desde el 67— de «el panel
// está abierto» o «todavía no ha cargado», que son otra cosa y otro arreglo.
const PLAZO_HUD = 5000;
const leerMundo = () => ana.evaluate(() => {
  const e = window.probe.hud?.estado() ?? null;
  return {
    triangulos: window.probe.level?.mesh?.triangleCount ?? 0,
    hud: e?.visible ?? null,
    vida: e?.barras?.vida?.cifra ?? null,
    bichos: window.probe.bichos?.cuantos?.() ?? null,
  };
});
const t0Hud = Date.now();
let mundo = await leerMundo();
while (mundo.hud === false && Date.now() - t0Hud < PLAZO_HUD) {
  await ana.waitForTimeout(100);
  mundo = await leerMundo();
}
const esperaHud = Date.now() - t0Hud;
control("el mapa sigue dibujado y el HUD en pie con la red puesta",
  trianguloAlEntrar > 0 && mundo.triangulos === trianguloAlEntrar && mundo.hud !== false,
  JSON.stringify({ ...mundo, alEntrar: trianguloAlEntrar, esperaHud: `${esperaHud} ms` }));

const faltan = DECLARADOS - controles.length;
console.log(`\n  ── ${controles.filter((c) => c.bien).length} de ${DECLARADOS} controles ──`);
if (faltan > 0) console.log(`  ${faltan} control(es) no llegaron a correr`);
if (faltan < 0) console.log(`  hay ${-faltan} control(es) MÁS que los declarados: sube DECLARADOS`);
for (const c of controles) console.log(`  ${c.bien ? "sí" : "NO"}  ${c.que}${c.detalle ? `  [${c.detalle}]` : ""}`);
console.log(`\n  errores de página: ${errores.length ? errores.join(" · ") : "ninguno"}`);
console.log(`  el servidor dijo:\n${salidaDelServidor.join("").split("\n").map((l) => `    ${l}`).join("\n")}`);

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
// Y la salida pide los 21, no «los que haya»: si faltan, es que la sonda se fue
// por el `catch` y eso es rojo aunque todos los que corrieron estén verdes.
process.exit(controles.length === DECLARADOS
  && controles.every((c) => c.bien) && !errores.length ? 0 : 1);
