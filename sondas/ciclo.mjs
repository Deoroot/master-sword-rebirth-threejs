// EL CICLO DE SESIÓN, mirado en la pantalla y no sólo en Node.
//
// Las 36 comprobaciones de `test/juego_sesion.test.mjs` dicen que la máquina de
// estados funciona. No dicen que la cápsula se mueva al templo, que es otra
// cosa — la lección del 06: **un dato bien calculado que nadie lee no da
// error.** Esto recorre el ciclo entero con el ratón y mide lo que sale.
//
// Recorrido: arrancar → crear → entrar → ¿dónde están los pies? → morir →
// ¿pantalla de muerte, oro cobrado? → reaparecer → ¿de vuelta al templo?
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const PORT = 5194;
const dev = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { shell: true, stdio: "ignore" });
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
await new Promise((r) => setTimeout(r, 6000));
const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1200, height: 820 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
await pag.goto(`http://localhost:${PORT}/?map=gatecity`, { waitUntil: "load" });
mkdirSync("build/gatecity/vistas", { recursive: true });
const foto = async (n) => { await pag.waitForTimeout(400); await pag.screenshot({ path: `build/gatecity/vistas/ciclo-${n}.png` }); };

const controles = [];
const control = (que, bien, detalle = "") => { controles.push({ que, bien, detalle }); };

// ── 0. LA PANTALLA SALE ANTES QUE EL MAPA ──────────────────────────────────
//
// Es lo que hace el juego: eliges personaje y DESPUÉS se carga el mapa. Antes
// lo hacíamos al revés y había que esperar a los 41 650 triángulos para poder
// escribir un nombre.
//
// Se mide en el orden en que ocurren: se espera a que aparezca la pantalla de
// personajes y se comprueba que en ese instante el mapa TODAVÍA no está.
await pag.waitForSelector(".mx-velo", { timeout: 60000 });
const alSalirLaPantalla = await pag.evaluate(() => ({
  mapa: window.probe?.ready === true,
  ms: Math.round(performance.now()),
}));
console.log(`  la pantalla sale a los ${alSalirLaPantalla.ms} ms · ¿mapa ya cargado? ` +
  `${alSalirLaPantalla.mapa ? "sí" : "todavía no"}`);
control("la pantalla de personajes sale ANTES que el mapa", alSalirLaPantalla.mapa === false,
  `a los ${alSalirLaPantalla.ms} ms`);
await foto("0-antes-del-mapa");

await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
const cuandoElMapa = await pag.evaluate(() => Math.round(performance.now()));
console.log(`  el mapa termina a los  ${cuandoElMapa} ms → ${cuandoElMapa - alSalirLaPantalla.ms} ms de ventaja`);
control("y con ventaja de verdad", cuandoElMapa - alSalirLaPantalla.ms > 200,
  `${cuandoElMapa - alSalirLaPantalla.ms} ms antes`);

// ── 0b. el HUD del experimento 03 ya no está ───────────────────────────────
const hud = await pag.evaluate(() => {
  const h = document.getElementById("hud");
  return { escondido: h?.hidden ?? null, existe: Boolean(h) };
});
console.log(`  el HUD del experimento: ${hud.escondido ? "escondido" : "A LA VISTA"}`);
control("el HUD del experimento 03 está escondido", hud.escondido === true);
// Pero NO borrado: F3 lo enseña, porque es la única forma de mirar la física
// a ojo mientras se trabaja.
await pag.keyboard.press("F3");
await pag.waitForTimeout(150);
control("y F3 lo enseña", (await pag.evaluate(() => document.getElementById("hud").hidden)) === false);
await pag.keyboard.press("F3");
await pag.waitForTimeout(150);
control("y lo vuelve a esconder", (await pag.evaluate(() => document.getElementById("hud").hidden)) === true);

// ── 1. se llega y la sesión pide elegir ────────────────────────────────────
const alLlegar = await pag.evaluate(() => window.probe.sesion.estado());
console.log(`  al llegar:            ${alLlegar}`);
control("al llegar pide elegir personaje", alLlegar === "eligiendo", alLlegar);
control("y la pantalla está puesta", await pag.evaluate(() => Boolean(document.querySelector(".mx-velo"))));
await foto("1-llegada");

// Y sin personaje no se anda. Éste es el sitio donde se puede comprobar «quien
// no está jugando no se mueve» sin que la propia tecla signifique otra cosa:
// estando MUERTO, pulsar W es la orden de levantarse (`PlayerDeathThink`
// espera justamente a que se pulse un botón), así que allí W tiene que mover.
const quieto0 = await pag.evaluate(() => window.probe.player.feet);
await pag.keyboard.down("KeyW");
await pag.waitForTimeout(800);
await pag.keyboard.up("KeyW");
const quieto1 = await pag.evaluate(() => window.probe.player.feet);
const seMovio = Math.hypot(quieto1[0] - quieto0[0], quieto1[2] - quieto0[2]);
console.log(`  andando sin personaje: ${seMovio.toFixed(3)} m`);
control("sin personaje no se anda", seMovio < 0.05, `${seMovio.toFixed(3)} m con W apretada`);

// ── 1b. ESCRIBIR UN NOMBRE NO PUEDE TOCAR EL JUEGO ─────────────────────────
//
// Esto lo encontró quien lo jugó, y era peor de lo que parecía: cada letra del
// nombre llegaba también a las perillas del visor. Teclear «Kendra» te MATABA
// (la K), «Theobold» te teletransportaba (la T) y la R te devolvía a la cueva.
//
// El control se escribe con un nombre que lleva las cuatro teclas a propósito.
await pag.evaluate(() => window.probe.personaje.crear());
await pag.waitForTimeout(300);
const antesDeEscribir = await pag.evaluate(() => ({
  pies: window.probe.player.feet, estado: window.probe.sesion.estado(),
}));
await pag.fill(".mx-input", "");
await pag.click(".mx-input");
await pag.keyboard.type("KendraTheobold ORL", { delay: 25 });
const trasEscribir = await pag.evaluate(() => ({
  pies: window.probe.player.feet, estado: window.probe.sesion.estado(),
  escrito: document.querySelector(".mx-input")?.value ?? "",
}));
const movido = Math.hypot(
  trasEscribir.pies[0] - antesDeEscribir.pies[0],
  trasEscribir.pies[2] - antesDeEscribir.pies[2]);
console.log(`  escribiendo el nombre: «${trasEscribir.escrito}» · el jugador se movió ${movido.toFixed(3)} m`);
control("el nombre se escribe entero", trasEscribir.escrito === "KendraTheobold ORL", trasEscribir.escrito);
control("y escribirlo no mueve al jugador", movido < 0.05, `${movido.toFixed(3)} m`);
control("ni lo mata, aunque el nombre lleve una K",
  trasEscribir.estado === antesDeEscribir.estado,
  `${antesDeEscribir.estado} → ${trasEscribir.estado}`);
await pag.evaluate(() => window.probe.personaje.elegir());
await pag.waitForTimeout(300);

// ── 2. el sitio medido ─────────────────────────────────────────────────────
const ap = await pag.evaluate(() => window.probe.sesion.aparicion());
console.log(`  aparición:            ${ap?.nacimiento?.nombre} · luz ${ap?.nacimiento?.luz}/255 · ` +
  `${ap?.nacimiento?.hostiles15} hostiles a 15 m`);
control("hay un punto de aparición medido", Boolean(ap?.nacimiento?.escena), ap?.criterio?.regla ?? "");
control("y no tiene hostiles cerca", ap?.nacimiento?.hostiles15 === 0);

// ── 3. crear y entrar ──────────────────────────────────────────────────────
await pag.evaluate(() => window.probe.sesion.nuevo("Sonda"));
await pag.waitForTimeout(500);
const estado = await pag.evaluate(() => window.probe.sesion.estado());
const donde = await pag.evaluate(() => window.probe.sesion.donde());
console.log(`  tras entrar:          ${estado} · entrada '${donde.entrada}'`);
console.log(`  la sesión dice:       (${donde.dice.escena.map((v) => v.toFixed(1)).join(", ")})`);
console.log(`  los pies están en:    (${donde.pies.map((v) => v.toFixed(1)).join(", ")})  → desvío ${donde.desvio.toFixed(2)} m`);
control("entrar deja JUGANDO", estado === "jugando", estado);
control("un personaje recién creado NACE", donde.entrada === "nuevo", donde.entrada);
// Un metro de margen: la cápsula cae los 10 cm que se le suman al aparecer y
// el suelo del templo no es perfectamente plano.
control("la cápsula está DONDE dice la sesión", donde.desvio < 1.0, `${donde.desvio.toFixed(2)} m`);
control("la pantalla obligatoria se ha quitado", !(await pag.evaluate(() => Boolean(document.querySelector(".mx-velo")))));
await foto("2-templo");

// El control que separa «está en el templo» de «está en cualquier sitio»: la
// llegada del mapa está a 47 m del pueblo, en una cueva. Si los pies acabaran
// ahí, esta distancia lo canta.
const aLaCueva = await pag.evaluate(() => {
  const s = window.probe.level.start, p = window.probe.player.feet;
  return Math.hypot(p[0] - s[0], p[1] - s[1], p[2] - s[2]);
});
console.log(`  a la llegada del mapa: ${aLaCueva.toFixed(1)} m`);
control("y NO en la cueva que trae el mapa", aLaCueva > 20, `${aLaCueva.toFixed(1)} m de ms_player_begin`);

// ── 4. se ve algo ──────────────────────────────────────────────────────────
//
// El templo se eligió por su luz. Si la pantalla sale negra, la medida del
// mapa de luz y lo que se dibuja no son lo mismo, y eso ya ha pasado una vez.
const brillo = await pag.evaluate(async () => {
  const c = document.getElementById("view");
  const lienzo = document.createElement("canvas");
  lienzo.width = 300; lienzo.height = 200;
  lienzo.getContext("2d").drawImage(c, 0, 0, 300, 200);
  const d = lienzo.getContext("2d").getImageData(0, 0, 300, 200).data;
  let suma = 0, oscuros = 0;
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    suma += l; if (l < 8) oscuros++;
  }
  const n = d.length / 4;
  return { medio: suma / n, negro: oscuros / n };
});
console.log(`  la pantalla:          luminancia media ${brillo.medio.toFixed(1)} · ${(brillo.negro * 100).toFixed(1)} % en negro`);
control("desde el templo se ve algo", brillo.medio > 12 && brillo.negro < 0.5,
  `media ${brillo.medio.toFixed(1)}, negro ${(brillo.negro * 100).toFixed(1)} %`);

// ── 5. morir ───────────────────────────────────────────────────────────────
const antes = await pag.evaluate(() => window.probe.sesion.vitales());
// Oro suficiente para que el impuesto del 1 % no salga a cero por truncar.
await pag.evaluate(() => { window.probe.sesion.vitales(); });
await pag.evaluate(() => { const s = window.probe.sesion; s.danar(1); });
await pag.evaluate(() => { window.probe.sesion.matar({ porQue: "la sonda", deQuien: "nadie" }); });
await pag.waitForTimeout(400);
const trasMorir = await pag.evaluate(() => window.probe.sesion.estado());
const vitales = await pag.evaluate(() => window.probe.sesion.vitales());
const hayMuerte = await pag.evaluate(() => Boolean(document.querySelector(".mx-velo.mx-muerte")));
const texto = await pag.evaluate(() => document.querySelector(".mx-caido")?.textContent ?? "");
console.log(`  tras morir:           ${trasMorir} · vida ${vitales.vida}/${vitales.vidaMax} · oro ${vitales.oro} (antes ${antes.oro})`);
console.log(`  la pantalla dice:     «${texto}»`);
control("morir deja la vida a cero", vitales.vida === 0);
control("y sale la pantalla de muerte", hayMuerte);
control("con el anuncio del motor", /has fallen!$/.test(texto), texto);
// Con 10 monedas el impuesto trunca a cero, y eso es lo correcto: se comprueba
// que NO haya cobrado, que es tan importante como que cobre.
control("el impuesto del 1 % trunca a cero con el oro de partida",
  antes.oro < 100 ? vitales.oro === antes.oro : vitales.oro === antes.oro - Math.trunc(antes.oro * 0.01),
  `${antes.oro} → ${vitales.oro}`);
await foto("3-muerte");

// La pantalla de muerte NO se puede cerrar.
await pag.keyboard.press("Escape");
await pag.waitForTimeout(200);
control("y no se puede cerrar con Esc",
  await pag.evaluate(() => Boolean(document.querySelector(".mx-velo.mx-muerte"))));

// Y muerto se SIGUE muerto mientras no se pida volver. La primera versión de
// esta sonda comprobaba «un muerto no anda» pulsando W, y medía lo contrario
// de lo que hace el motor: estando muerto, **pulsar un botón es la orden de
// levantarse**. Lo que hay que comprobar es que sin pedirlo no se vuelve.
await pag.waitForTimeout(900);
control("muerto se sigue muerto sin pedir volver",
  await pag.evaluate(() => window.probe.sesion.estado()) === "muerto");

// ── 6. reaparecer, con W, que es como lo hace el motor ─────────────────────
await pag.keyboard.press("KeyW");
await pag.waitForTimeout(400);
const porTecla = await pag.evaluate(() => window.probe.sesion.estado());
console.log(`  tras pulsar W muerto: ${porTecla}`);
// `if (fAnyButtonDown) return;` y luego «wait for any button down»: soltar
// todas y volver a pulsar una es literalmente el camino de `PlayerDeathThink`.
control("pulsar un botón estando muerto levanta", porTecla === "jugando", porTecla);
await pag.waitForTimeout(400);
const vuelta = await pag.evaluate(() => window.probe.sesion.donde());
const revive = await pag.evaluate(() => window.probe.sesion.vitales());
console.log(`  tras reaparecer:      ${await pag.evaluate(() => window.probe.sesion.estado())} · ` +
  `entrada '${vuelta.entrada}' · vida ${revive.vida}/${revive.vidaMax} · desvío ${vuelta.desvio.toFixed(2)} m`);
control("reaparecer devuelve la vida entera", revive.vida === revive.vidaMax, `${revive.vida}/${revive.vidaMax}`);
control("y la entrada es 'muerte' (JN_TRAVEL)", vuelta.entrada === "muerte", vuelta.entrada);
control("y vuelve al mismo sitio", vuelta.desvio < 1.0, `${vuelta.desvio.toFixed(2)} m`);

// Y ahora sí anda.
const p0 = await pag.evaluate(() => window.probe.player.feet);
await pag.keyboard.down("KeyW");
await pag.waitForTimeout(900);
await pag.keyboard.up("KeyW");
const p1 = await pag.evaluate(() => window.probe.player.feet);
const anda = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
console.log(`  andando vivo:         ${anda.toFixed(2)} m`);
// El control POSITIVO del anterior: sin esto, «un muerto no anda» lo pasaría
// también un mundo en el que nadie anda nunca.
control("y vivo SÍ anda", anda > 0.5, `${anda.toFixed(2)} m con W apretada`);
await foto("4-reaparecido");

// ── 7. guardar ─────────────────────────────────────────────────────────────
const guardados = await pag.evaluate(() => window.probe.sesion.listar());
console.log(`  personajes guardados: ${guardados.length} (${guardados.map((g) => g.nombre).join(", ")})`);
control("el personaje está guardado", guardados.some((g) => g.nombre === "Sonda"));

// ── el veredicto ───────────────────────────────────────────────────────────
console.log("\n  CONTROLES");
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(52)} ${c.detalle}`);
const mal = controles.filter((c) => !c.bien);
console.log(`\n  ${controles.length - mal.length} de ${controles.length} en verde`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);

await nav.close(); matar(dev);
process.exit(mal.length || errores.length ? 1 : 0);
