// EL 62 EN PANTALLA: dos navegadores y UN vendedor.
//
//   npm run sonda:tienda62
//
// Hasta el 61 cada navegador corría su copia del guion de cada NPC. Con un
// jugador es lo mismo; con dos son **dos vendedores distintos con el mismo
// nombre**, cada uno con su estante y su oro, y los dos podían comprar la
// última daga sin enterarse. `npm test` no puede ver eso: las reglas están bien
// y lo que estaba mal es **quién las ejecuta**.
//
// Las formas de que esto parezca funcionar y esté mal:
//
//    1. el menú de la F sale del navegador       -> el guion sigue siendo local
//    2. sale del servidor y el estante no        -> `npcstore.offer` sin mandar
//    3. llega el estante y comprar resta en casa -> dos oros distintos
//    4. resta en el servidor y el otro no lo ve  -> no se remanda el estante
//    5. los dos abren la tienda a la vez         -> falta `MONSTER_TRADING`
//    6. el segundo se queda fuera para siempre   -> falta la correa de 128
//    7. todo bien y el personaje no se guarda    -> el disco del servidor

import { spawn, spawnSync } from "node:child_process";
import { lanzarVite, esperarHttp } from "./mismo.mjs";
import { chromium } from "playwright";
import { entrarPorElMenu } from "./entrar.mjs";
import { mkdirSync, rmSync } from "node:fs";

const PUERTO_WEB = 5217;
const PUERTO_PARTIDA = 5218;
const PERSONAJES = "build/partidas/tienda62/personajes";
const MAPA = "edana";
/** El herrero. Tiene «Shop» y sólo «Shop». */
const VENDEDOR = "edana/weaponsmith";
/**
 * Donde nacen los dos, que es al lado del herrero.
 *
 * Con red el cuerpo lo mueve el servidor, así que `probe.mundo.poner()` es una
 * mentira que la reconciliación deshace. Y el herrero está a 107 m del
 * `ms_player_begin` de Edana: andarlos mediría el camino, que no está portado.
 * Así que el servidor los hace nacer aquí, que es una perilla del operador.
 */
// DOS METROS DEL HERRERO, NO CUARENTA CENTÍMETROS.
//
// El primero, «53.4,-7.3,42.5», caía prácticamente ENCIMA de Krythos —él está
// en 53.44,-7.72,41.45— o sea dentro de su cilindro. Y entonces el jugador no
// puede andar: la tecla llega (`pulsada("adelante")` decía `true`), el puntero
// está capturado y nada atrapa el ratón, y el cuerpo se movía **0,00 m** en
// diez direcciones seguidas. No era la sonda ni el servidor: estaba encajada.
// Dos metros siguen dentro de la correa de 128 unidades (son 79) y dejan sitio
// para darse la vuelta.
const NACER = "51.7,-7.6,42.5";

try { rmSync("build/partidas/tienda62", { recursive: true, force: true }); } catch {}

function liberarPuerto(puerto) {
  const r = spawnSync("cmd", ["/c", `netstat -ano | findstr LISTENING | findstr :${puerto}`], { encoding: "utf8" });
  const pids = new Set(String(r.stdout ?? "").split(/\r?\n/)
    .map((l) => l.trim().split(/\s+/).pop()).filter((x) => /^[0-9]+$/.test(x) && x !== "0"));
  for (const pid of pids) spawnSync("taskkill", ["/F", "/T", "/PID", pid], { stdio: "ignore", shell: true });
  return [...pids];
}
const liberados = [...liberarPuerto(PUERTO_WEB), ...liberarPuerto(PUERTO_PARTIDA)];
if (liberados.length) console.log(`  (habia ${liberados.length} proceso(s) ocupando los puertos: matados)`);

const dev = lanzarVite(PUERTO_WEB);
const partida = spawn(process.execPath, [
  "tools/servidor.mjs", "--puerto", String(PUERTO_PARTIDA),
  "--nombre", "La tienda", "--personajes", PERSONAJES, "--mapa", MAPA,
  // SIN `--sinbichos`: los NPC de los que hablamos SON la fauna. Con la fauna
  // apagada el servidor no monta los guiones —`if (guiones && this.fauna)`— y
  // la F devuelve un menú vacío, que es lo que dio la primera vuelta.
  "--nacer", NACER,
  // Y EL ORO LO DA EL SERVIDOR. `probe.misiones.oro(5000)` pinta un 5000 en el
  // navegador y el servidor —que es quien resta— sigue sin un duro: contestaba
  // «You can't afford Sharp Knife», que era verdad, y el control leía el 5000
  // de la pantalla. La misma frontera que `--nacer`.
  "--oro", "5000",
], { stdio: ["ignore", "pipe", "pipe"] });
const salidaDelServidor = [];
partida.stdout.on("data", (b) => salidaDelServidor.push(String(b)));
partida.stderr.on("data", (b) => salidaDelServidor.push(`ERR ${b}`));
const matar = (p) => { try { spawnSync("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

// vite y el mapa del servidor: se les PREGUNTA en vez de dormir a ciegas (el 98;
// el servidor no abre el puerto hasta haber cargado el mapa, servidor.mjs:241).
await esperarHttp(`http://localhost:${PUERTO_WEB}/`, { tope: 90_000, proceso: dev, quien: "vite" });
await esperarHttp(`http://localhost:${PUERTO_PARTIDA}/partidas`, { tope: 90_000, proceso: partida, quien: "el servidor de partida" });

const nav = await chromium.launch();
const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const errores = [];

try {
const abrir = async (quien) => {
  const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
  pag.on("pageerror", (e) => errores.push(`${quien}: ${String(e).slice(0, 180)}`));
  pag.on("console", (m) => { if (m.type() === "warning" || m.type() === "error") errores.push(`${quien} ${m.type()}: ${m.text().slice(0, 200)}`); });
  pag.on("framenavigated", (f) => { if (f === pag.mainFrame()) console.log(`    (${quien} navega: ${f.url().slice(-80)})`); });
  // CON UN REINTENTO, y dicho por qué: la entrada por el menú recarga cuando el
  // mapa elegido no es el del fondo, y un clic que provoca su propia navegación
  // se cae de vez en cuando con «element was detached» o «waiting for
  // navigation to finish». No es del juego: es de manejar el navegador. Se
  // reintenta una vez y se dice si hizo falta, en vez de dar un rojo que no
  // mide nada.
  for (let intento = 1; ; intento++) {
    try {
      await entrarPorElMenu(pag, PUERTO_WEB, {
        mapa: MAPA, extra: `red=ws://localhost:${PUERTO_PARTIDA}/juego`,
      });
      break;
    } catch (e) {
      if (intento >= 3) throw e;
      console.log(`    (${quien}: la entrada falló «${String(e?.message ?? e).slice(0, 60)}», intento ${intento + 1})`);
      await esperar(1500);
    }
  }
  await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
  return pag;
};

const ana = await abrir("ana");
const beto = await abrir("beto");
mkdirSync(`build/${MAPA}/vistas`, { recursive: true });

await ana.evaluate(() => window.probe.sesion.nuevo("Ana", "swords_rsword"));
await esperar(600);
await beto.evaluate(() => window.probe.sesion.nuevo("Beto", "swords_rsword"));
await esperar(2000);

const dentro = await Promise.all([ana, beto].map((p) => p.evaluate(() => window.probe.red.estado())));
control("los dos están dentro de la misma partida",
  dentro.every((d) => d.dentro && d.fotos > 0), `fotos ${dentro.map((d) => d.fotos).join(" y ")}`);

// El oro se lo ha dado el servidor al entrar (`--oro 5000`). Aquí sólo se
// comprueba que llegó: un control de la compra que empiece sin dinero mide la
// falta de dinero.
const oroAlEntrar = await Promise.all([ana, beto].map((p) => p.evaluate(() => window.probe.sesion.personaje?.oro ?? 0)));
console.log(`    oro al entrar   ana ${oroAlEntrar[0]} · beto ${oroAlEntrar[1]}  (--oro del servidor)`);
control("el oro viene del SERVIDOR, que es quien resta al comprar",
  oroAlEntrar.every((o) => o === 5000), oroAlEntrar.join(" y "));

/**
 * ESPERA A QUE ESTE ABIERTO UN PANEL CONCRETO.
 *
 * «Se espera al efecto, no a un reloj». Con red, entre pulsar «Shop» y que se
 * abra el selector hay una ida y vuelta al servidor MAS lo que tarde el guion
 * del vendedor en llegar a su `npcstore.offer` —que puede llevar `wait`—, y eso
 * no cabe en un `esperar(1200)`: la vuelta en la que no llego, el clic
 * siguiente no encontraba boton y la sonda medía una pantalla vacia.
 */
const esperarPanel = async (pag, nombre, timeout = 20000) => {
  try {
    await pag.waitForFunction((n) => window.probe.vgui.abierto() === n, nombre, { timeout });
    return true;
  } catch { return false; }
};

/**
 * ESPERA A QUE EL ESTANTE DEJE DE CRECER.
 *
 * El guion del vendedor no llena la tienda de golpe: `addstoreitem` va cayendo
 * a lo largo de varios pasos del servidor. Leer las filas «un rato despues» da
 * 18 una vuelta, 16 la siguiente y 1 la de mas alla — y entonces el control no
 * mide la tienda, mide cuando miraste. Se espera a que dos lecturas seguidas
 * den lo mismo, que es el efecto y no el reloj.
 */
const estanteQuieto = async (pag, { vueltas = 25, cada = 400 } = {}) => {
  let antes = -1;
  // Y SE EXIGE MAS DE UNA FILA. Con `n > 0` bastaba, y una vuelta dio «1
  // fila»: el guion habia soltado el primer `addstoreitem` y aun no el
  // segundo, asi que dos lecturas seguidas daban 1 y la sonda se lo creyo.
  // Un estante de una fila no es un estante quieto: es uno a medio llenar.
  for (let i = 0; i < vueltas; i++) {
    await esperar(cada);
    const n = await pag.evaluate(() => window.probe.vgui.tienda.filas().length);
    if (n > 1 && n === antes) return n;
    antes = n;
  }
  return antes;
};

/**
 * SE ACERCA AL VENDEDOR ANDANDO, hasta que la F le apunte a EL.
 *
 * Nacer pegado al herrero encaja al jugador contra su cilindro y ya no puede
 * andar en ninguna direccion; nacer a dos metros le deja andar pero la F le
 * apunta a si mismo y devuelve el menu del jugador («Sit Down (Rest)», «Emote:
 * Nod Yes»...). O sea que el sitio bueno no se puede elegir de antemano: se
 * anda hasta el, que es lo que hace un jugador.
 *
 * Se espera al EFECTO —a que `delante()` sea el vendedor— y no a un reloj.
 */
const acercarse = async (pag, quien) => {
  for (let i = 0; i < 14; i++) {
    const a = await pag.evaluate(() => window.probe.vgui.delante());
    if (a !== null) return a;
    await pag.keyboard.down("KeyW");
    await esperar(180);
    await pag.keyboard.up("KeyW");
    await esperar(220);
  }
  return pag.evaluate(() => window.probe.vgui.delante());
};

/** Se coloca delante del herrero y se le mira. La vista SÍ viaja en la orden. */
const mirarAlHerrero = async (pag) => pag.evaluate((s) => {
  const q = window.probe.vgui.npcs().find((i) => i.script === s);
  if (!q) return null;
  window.probe.mundo.mirar(q.donde[0], q.donde[1] + 0.9, q.donde[2]);
  return { id: q.id, nombre: q.nombre, donde: q.donde, mio: window.probe.player.feet };
}, VENDEDOR);

const elHerreroDeAna = await mirarAlHerrero(ana);
const elHerreroDeBeto = await mirarAlHerrero(beto);
const lejos = elHerreroDeAna
  ? Math.hypot(elHerreroDeAna.donde[0] - elHerreroDeAna.mio[0], elHerreroDeAna.donde[2] - elHerreroDeAna.mio[2])
  : null;
console.log(`\n  EL HERRERO`);
console.log(`    quién           ${elHerreroDeAna ? `${elHerreroDeAna.nombre} #${elHerreroDeAna.id}` : "NO ESTÁ"}`);
console.log(`    a               ${lejos?.toFixed(2)} m de Ana = ${(lejos * 39.37).toFixed(0)} unidades (la correa son 128)`);
control("el herrero está en el mapa y los dos nacen a su lado, dentro de la correa",
  elHerreroDeAna !== null && (lejos ?? 999) * 39.37 < 128,
  `${((lejos ?? 0) * 39.37).toFixed(0)} unidades`);
control("y es EL MISMO herrero para los dos: una entidad, no una copia por navegador",
  elHerreroDeAna?.id === elHerreroDeBeto?.id,
  `ana #${elHerreroDeAna?.id} · beto #${elHerreroDeBeto?.id}`);

// ── 1. EL MENÚ LO CONSTRUYE EL SERVIDOR ────────────────────────────────────
console.log(`\n  LA F`);
const aQuienMiraAna = await acercarse(ana);
console.log(`    Ana tiene delante a ${aQuienMiraAna?.nombre ?? "NADIE"}`);
await ana.keyboard.press("KeyF");
await esperar(1200);
const menuDeAna = await ana.evaluate(() => ({
  cual: window.probe.vgui.abierto(),
  botones: window.probe.vgui.botones().map((b) => b.texto),
}));
console.log(`    Ana ve          ${menuDeAna.cual} [${menuDeAna.botones.join(" | ")}]`);
control("la F abre el menú del herrero, y las opciones han venido del servidor",
  menuDeAna.botones.some((t) => /^Shop$/.test(t)), menuDeAna.botones.join(", "));

// ── 2. «SHOP» Y EL ESTANTE POR EL CABLE ────────────────────────────────────
console.log(`\n  EL ESTANTE`);
const pulsar = async (pag, patron) => pag.evaluate((t) => {
  // POR EXPRESION, no por texto exacto: «    1. Buy» trae cuatro espacios
  // delante —el numero va DENTRO del texto, de titles.txt— y compararlo con
  // `trim()` no acierta nunca. La primera vuelta de esta sonda dio «store con
  // 0 filas» por eso, y parecia que no llegaba el estante.
  const re = new RegExp(t);
  const b = [...document.querySelectorAll(".vg-boton")].find((x) => re.test(x.textContent));
  if (b) b.click();
  return Boolean(b);
}, patron);
await pulsar(ana, "^Shop$");
const selectorDeAna = await esperarPanel(ana, "store");
console.log(`    el selector     ${selectorDeAna ? "abierto" : "NO SE ABRIO"}`);
control("«Shop» abre el selector, que ha pedido el guion del servidor",
  selectorDeAna, selectorDeAna ? "store" : "nada");
await pulsar(ana, "1\\. Buy");
await esperarPanel(ana, "storebuy");

const cuantas = await estanteQuieto(ana);
console.log(`    el estante se queda en ${cuantas} filas`);
const estanteDeAna = await ana.evaluate(() => ({
  cual: window.probe.vgui.abierto(),
  filas: window.probe.vgui.tienda.filas(),
}));
console.log(`    Ana abre        ${estanteDeAna.cual} · ${estanteDeAna.filas.length} filas`);
control("«Shop» abre la lista y trae objetos, que los ha mandado el servidor",
  estanteDeAna.filas.length > 0, `${estanteDeAna.filas.length} filas`);

const laPrimera = estanteDeAna.filas[0] ?? null;
const existenciasDeAna = await ana.evaluate((id) => (window.probe.vgui.tienda.existencias() ?? []).find((l) => l.id === id)?.cantidad ?? null, laPrimera?.id);
console.log(`    la primera      ${laPrimera?.id} · existencias ${existenciasDeAna}`);

// ── 3. COMPRAR, Y QUE LA RESTA SEA UNA ─────────────────────────────────────
console.log(`\n  COMPRAR`);
const oroAntes = await ana.evaluate(() => window.probe.sesion.personaje?.oro ?? 0);
const objetosAntes = await ana.evaluate(() => (window.probe.sesion.personaje?.objetos ?? []).length);
await ana.evaluate(() => window.probe.vgui.tienda.senalar(0));
await esperar(300);
const precioTexto = await ana.evaluate(() => window.probe.vgui.tienda.precio());
const precio = Number(String(precioTexto ?? "").replace(/[^0-9]/g, "")) || 0;
console.log(`    el panel dice  ${JSON.stringify(precioTexto)} -> ${precio}`);
await ana.evaluate(() => window.probe.vgui.tienda.pulsar(0));
await esperar(1500);
const loDicho = await ana.evaluate(() => (window.probe.hud.estado()?.consola?.lineas ?? []).map((l) => l.texto));
console.log(`    el servidor dijo ${JSON.stringify(loDicho.slice(-4))}`);
const oroDespues = await ana.evaluate(() => window.probe.sesion.personaje?.oro ?? 0);
const objetosDespues = await ana.evaluate(() => (window.probe.sesion.personaje?.objetos ?? []).length);
console.log(`    oro             ${oroAntes} -> ${oroDespues}  (precio ${precio})`);
console.log(`    objetos         ${objetosAntes} -> ${objetosDespues}`);
control("comprar baja el oro, y lo baja el precio que dijo el servidor",
  oroDespues === oroAntes - precio, `${oroAntes} -> ${oroDespues}, precio ${precio}`);
control("y el objeto aparece en el personaje",
  objetosDespues === objetosAntes + 1, `${objetosAntes} -> ${objetosDespues}`);

// ── 4. EL VENDEDOR ATIENDE A UNO: BETO SE QUEDA FUERA ──────────────────────
//
// `if (!HasConditions(MONSTER_TRADING))` ... `else -> _busy`, npcscript.cpp:875.
// No es que vean el mismo estante: es que el original hace **cola de uno**.
console.log(`\n  UNO A LA VEZ`);
await acercarse(beto);
await beto.keyboard.press("KeyF");
await esperar(1000);
await pulsar(beto, "^Shop$");
await esperar(1400);
const betoTrasShop = await beto.evaluate(() => ({
  cual: window.probe.vgui.abierto(),
  filas: window.probe.vgui.tienda.filas().length,
}));
console.log(`    Beto ve         ${betoTrasShop.cual} · ${betoTrasShop.filas} filas`);
control("con Ana comerciando, a Beto NO se le abre la tienda: es el `_busy` del mod",
  betoTrasShop.cual !== "storebuy" && betoTrasShop.filas === 0,
  `abierto ${betoTrasShop.cual}, ${betoTrasShop.filas} filas`);

// LA PRUEBA DE QUE EL ESTANTE ES UNO: Ana se va —lo que suelta el trato por la
// correa—, Beto abre la tienda y **ve la existencia ya bajada**. Si cada uno
// tuviera su copia, Beto vería la de fábrica.
console.log(`\n  EL MISMO ESTANTE`);
// SE CIERRA EL PANEL POR SU NOMBRE, NO CON ESCAPE. La Escape con la tienda
// delante abre el menú del juego —«Esc menu», lo dice el propio HUD— y el menú
// se come la W: Ana se quedaba clavada a 44 unidades del herrero vuelta tras
// vuelta, y el control de abajo leía «a Beto no se le abre», que era verdad
// y no medía la correa.
await ana.evaluate(() => { const v = window.probe.vgui; if (v.abierto()) v.cerrar?.(); });
await esperar(400);
const anaSinPanel = await ana.evaluate(() => window.probe.vgui.abierto());
console.log(`    panel de Ana    ${anaSinPanel ?? "cerrado"}`);
// Ana se aleja andando de verdad, que es lo que acaba el trato en el mod.
//
// SE ANDA HASTA ESTAR LEJOS, NO CUATRO SEGUNDOS. Con un reloj fijo la sonda
// daba «d= 44.5 u» cuarenta veces seguidas: Ana no se había movido ni un
// centímetro —un muro, o la W que se comió el panel al cerrarse— y el control
// leía «a Beto no se le abre», que era verdad y no medía la correa. Se anda
// hasta pasar la correa, girando si se atasca, como en `sonda:chat61`.
const lejosDelHerrero = async () => ana.evaluate((s) => {
  const q = window.probe.vgui.npcs().find((i) => i.script === s);
  const yo = window.probe.player.feet;
  if (!q?.donde) return null;
  return Math.hypot(q.donde[0] - yo[0], q.donde[1] - yo[1], q.donde[2] - yo[2]);
}, VENDEDOR);
const piesAntes = await ana.evaluate(() => [...window.probe.player.feet]);
await ana.evaluate(() => { window.probe.player.yaw += Math.PI; });
await ana.keyboard.down("KeyW");
let distanciaFinal = null;
for (let i = 0; i < 10; i++) {
  await esperar(1500);
  distanciaFinal = (await lejosDelHerrero()) ?? 0;
  if (distanciaFinal * 39.37 > 200) break;          // 200 y no 128: margen
  await ana.evaluate(() => { window.probe.player.yaw += Math.PI / 3; });
}
await ana.keyboard.up("KeyW");
await esperar(1200);
const piesDespues = await ana.evaluate(() => [...window.probe.player.feet]);
console.log(`    Ana anduvo      ${Math.hypot(piesDespues[0] - piesAntes[0], piesDespues[2] - piesAntes[2]).toFixed(2)} m`);
distanciaFinal = (await lejosDelHerrero()) ?? 0;
console.log(`    Ana se va a     ${(distanciaFinal * 39.37).toFixed(0)} unidades (la correa son 128)`);
// EL CONTROL POSITIVO DEL CERO DE ABAJO: si Ana no se ha ido, «a Beto no se le
// abre» no dice nada de la correa.
control("Ana se ha ido de verdad, más allá de la correa de 128",
  distanciaFinal * 39.37 > 128, `${(distanciaFinal * 39.37).toFixed(0)} unidades`);

await beto.evaluate(() => { const v = window.probe.vgui; if (v.abierto()) v.cerrar?.(); });
await esperar(300);
await acercarse(beto);
await beto.keyboard.press("KeyF");
await esperar(1000);
await pulsar(beto, "^Shop$");
await esperarPanel(beto, "store");
await pulsar(beto, "1\\. Buy");
await esperarPanel(beto, "storebuy");
await estanteQuieto(beto);
const estanteDeBeto = await beto.evaluate(() => ({
  cual: window.probe.vgui.abierto(),
  filas: window.probe.vgui.tienda.filas(),
}));
const existenciasDeBeto = await beto.evaluate((id) => (window.probe.vgui.tienda.existencias() ?? []).find((l) => l.id === id)?.cantidad ?? null, laPrimera?.id);
console.log(`    Beto abre       ${estanteDeBeto.cual} · ${estanteDeBeto.filas.length} filas`);
console.log(`    existencias     Ana vio ${existenciasDeAna}, Beto ve ${existenciasDeBeto}`);
control("en cuanto Ana se aleja, a Beto SÍ se le abre: la correa suelta el trato",
  estanteDeBeto.filas.length > 0, `${estanteDeBeto.filas.length} filas`);
control("y Beto ve la existencia QUE ANA BAJÓ: el estante es uno, no una copia por navegador",
  existenciasDeBeto !== null && existenciasDeBeto === existenciasDeAna - 1,
  `${existenciasDeAna} -> ${existenciasDeBeto}`);

await ana.screenshot({ path: `build/${MAPA}/vistas/tienda62.png` });
console.log(`    captura         build/${MAPA}/vistas/tienda62.png`);

control("y el servidor no ha escupido ningún error",
  !salidaDelServidor.some((l) => l.startsWith("ERR")),
  salidaDelServidor.filter((l) => l.startsWith("ERR")).join(" ").slice(0, 200) || "ninguno");

console.log(`\n  ── ${controles.filter((c) => c.bien).length} de ${controles.length} controles ──`);
for (const c of controles) console.log(`  ${c.bien ? "sí" : "NO"}  ${c.que}${c.detalle ? `  [${c.detalle}]` : ""}`);
console.log(`\n  errores de página: ${errores.length ? errores.join(" · ") : "ninguno"}`);

} catch (e) {
  console.log(`\n  LA SONDA SE HA CAÍDO: ${e?.message ?? e}`);
  console.log(`  de la pagina: ${errores.length ? errores.slice(0, 15).join("\n    ") : "nada"}`);
  console.log(`  el servidor dijo:\n${salidaDelServidor.join("").split("\n").map((l) => `  ${l}`).join("\n")}`);
} finally {
  await nav.close();
  matar(partida); matar(dev);
}

process.exit(controles.length && controles.every((c) => c.bien) && !errores.length ? 0 : 1);
