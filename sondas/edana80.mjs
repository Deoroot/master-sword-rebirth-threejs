// PEGARLE A UNA RATA — experimento 80.
//
//   npm run sonda:edana80
//
// Las tres sondas de combate del proyecto —`golpe`, `ia`, `consecuencias`—
// miden todas contra goblins y zombis, que son grandes. Esta mide contra una
// **rata del templo de Edana**, de 32 unidades de alto, y con eso salen tres
// cosas que llevaban escondidas desde el 21:
//
//   1. el bicho ataca y su animación hace cosas raras;
//   2. la espada suena a golpe contra piedra con la rata delante;
//   3. y no le hace daño hasta que te pegas mucho más.
//
// ── POR QUÉ UNA SONDA Y NO SÓLO `test/combate80.test.mjs` ─────────────────
//
// Porque las pruebas de Node ya demuestran las dos reglas —que `CAnimOnce` no
// deja pisar una animación de una vez, y que el segundo intento de `DoDamage`
// hiere al bicho en vez de sonar a piedra— y **ninguna de las dos puede ver el
// viaje**. El viaje es: el ciclo del bicho corre dentro del bucle de
// fotogramas, el rayo lo tira Rapier contra colisionadores de verdad, y el
// sonido lo decide `pegar` en `main.js`, que no tiene ni una prueba de Node.
// Los tres fallos seguidos del 63 estaban en costuras como ésa.
//
// ── LAS FORMAS DE QUE ESTO PAREZCA FUNCIONAR Y ESTÉ MAL ──────────────────
//
//   - **«la rata recibe daño» con la rata equivocada.** Las ratas son tres y
//     salen de un `msarea_monsterspawn`: se eligen por `script` y se dice
//     cuál. Y el 79 acaba de enseñar que elegir por nombre puede resolver a
//     quien no existía.
//   - **«no suena a piedra» porque no suena nada.** Va con control negativo:
//     contra una pared el `hitwall` SÍ tiene que subir.
//   - **«el golpe entró» sin saber por dónde.** La esfera y la línea son dos
//     caminos y el arreglo es el segundo: si no se cuenta `porLaLinea`,
//     arreglarlo o no se ve igual.
//   - **«la animación de ataque se puso».** Eso es cierto con el fallo y sin
//     él: lo que los separa es CUÁNTO duró, así que se graban tramos dentro de
//     la página (un `evaluate` no mide décimas — el 75).
//   - **«el cilindro está»** leído de nuestra propia contabilidad. El 69 ya
//     enseñó que eso se queda verde con la física rota: aquí lo contesta un
//     rayo, y el rayo dice DE QUIÉN es lo que ha tocado.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { liberarPuerto } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PORT = 5280;
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
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });
/**
 * UN CONTROL QUE NO SE PUEDE MEDIR HOY no se cuenta entre los verdes.
 *
 * Es la regla del 50 llevada al marcador: con un solo caso posible, el valor
 * correcto y el valor de reposo son el mismo y el control no puede fallar. Antes
 * que apuntarlo verde, se declara pendiente y se dice por qué.
 */
const pendiente = (que, porQue) => controles.push({ que, bien: null, detalle: porQue });

const VISTAS = "build/edana/vistas";
mkdirSync(VISTAS, { recursive: true });
const U = 39.37;
const GUION_RATA = "giantrat";

/** La distancia horizontal entre dos puntos de escena, en UNIDADES. */
const plano = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]) * U;

try {

// ── 0. EL HORNEADO, antes de abrir el navegador ────────────────────────────
//
// Los dos tamaños de la misma rata, que es el tercer fallo del 80 y el único
// que se puede ver sin arrancar nada.
const censo = JSON.parse(readFileSync("build/edana/bichos.json", "utf8"));
const ratas = censo.colocados.filter((c) => String(c.script ?? "").includes(GUION_RATA));
const ficha = JSON.parse(readFileSync(`build/edana/bichos/${ratas[0].clave}/bicho.json`, "utf8"));
const medida = ficha.cajaMedida ?? ficha.caja;
const anchoMedido = Math.min(medida.max[0] - medida.min[0], medida.max[1] - medida.min[1]);
const altoMedido = medida.max[2] - medida.min[2];

console.log(`\n  LA RATA DEL TEMPLO, Y SUS DOS TAMAÑOS
    cuántas hay       ${ratas.length}   (área ${ratas[0].aparecedor?.area}, ${ratas[0].aparecedor?.vidas} vidas)
    vida              ${ratas[0].hp}
    alcance de golpe  ${ratas[0].ia?.alcanceDeGolpe} u
    el casco del GUION    ancho ${ratas[0].ancho}  alto ${ratas[0].alto}      <- \`UTIL_SetSize\`, msmonsterserver.cpp:244
    la caja MEDIDA        ancho ${anchoMedido.toFixed(1)}  alto ${altoMedido.toFixed(1)}  <- de donde sale el colisionador`);

control("el guion de la rata dice 32x32x32, que es su casco en el motor",
  ratas[0].ancho === 32 && ratas[0].alto === 32, `${ratas[0].ancho}x${ratas[0].alto}`);
control("y la caja medida de la malla NO coincide: son dos tamaños para un bicho",
  Math.abs(altoMedido - ratas[0].alto) > 1,
  `alto medido ${altoMedido.toFixed(1)} contra ${ratas[0].alto} del guion`);

// LA ARITMÉTICA DE LA FRANJA, con los números del juego y escritos a mano.
// `alcance 60` de `swords_rsword`, `CAJA.ojo` 64, centro de la rata a 16.
const armas = JSON.parse(readFileSync("build/gatecity/armas.json", "utf8"));
const espada = armas.armas.find((a) => a.id === "swords_rsword");
const alcance = espada.ataques[0].alcance;
const vertical = 64 - ratas[0].alto / 2;
const horizontal = Math.sqrt(alcance ** 2 - vertical ** 2);
console.log(`\n  POR QUÉ NO SE LE PUEDE PEGAR, EN NÚMEROS
    alcance del arma  ${alcance} u        (swords_rsword)
    el ojo baja       ${vertical} u        (ojo 64 - centro de la rata ${ratas[0].alto / 2})
    radio horizontal  ${horizontal.toFixed(1)} u      <- lo que le queda a la ESFERA
    los cuerpos ya separan  ${16 + ratas[0].ancho / 2} u
    FRANJA ÚTIL       ${(horizontal - 16 - ratas[0].ancho / 2).toFixed(1)} u, o sea ${((horizontal - 16 - ratas[0].ancho / 2) / U * 100).toFixed(0)} cm`);
control("la franja en la que la esfera alcanza a una rata es menor que 10 u",
  horizontal - 16 - ratas[0].ancho / 2 < 10,
  `${(horizontal - 16 - ratas[0].ancho / 2).toFixed(1)} u`);

// Y GATE CITY, que es por donde esto no se veía: sus «ratas» son arañas (67).
if (existsSync("build/gatecity/bichos.json")) {
  const gc = JSON.parse(readFileSync("build/gatecity/bichos.json", "utf8"));
  const n = gc.colocados.filter((c) => String(c.script ?? "").includes(GUION_RATA));
  control("Gate City no tiene ni una rata: el hueco lo enseña el segundo mapa",
    n.length === 0, `${n.length}`);
}

// ── 1. SE ENTRA POR EL MENÚ ────────────────────────────────────────────────
await entrarPorElMenu(pag, PORT, { mapa: "edana" });
await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
await pag.waitForTimeout(2500);

const mapa = await pag.evaluate(() => window.probe.vgui2.mapaDeLaPartida());
control("se ha entrado a Edana y no a Gate City", mapa === "edana", `${mapa}`);

// LAS RATAS NACEN DORMIDAS: son la ficha de un área. Se espera a que salga una,
// y si no sale no hay nada que medir — eso es un rojo, no una nota al pie.
const salio = await pag.waitForFunction(
  (g) => Boolean(window.probe.ia.bicho(g)) && !window.probe.ia.bicho(g).dormido,
  GUION_RATA, { timeout: 60000 },
).then(() => true).catch(() => false);
control("una rata ha aparecido: sin eso no hay nada que medir", salio);
if (!salio) throw new Error("ninguna rata apareció en 60 s");

const ap = await pag.evaluate(() => window.probe.ia.apariciones());
const rata = await pag.evaluate((g) => window.probe.ia.bicho(g), GUION_RATA);
console.log(`\n  LA RATA EN EL MUNDO
    apariciones       ${ap.enElMundo} en el mundo de ${ap.de}, ${ap.dormidos} dormidos, ${ap.conCilindro} con cilindro
    guion             ${rata.guion}
    donde (unidades)  ${rata.unidades.map((v) => v.toFixed(1)).join(", ")}
    vida              ${rata.vida} / ${rata.vidaMaxima}
    cilindro          ${rata.cilindro ? `alto ${rata.cilindro.alto.toFixed(1)} u, radio ${rata.cilindro.radio.toFixed(1)} u` : "NINGUNO"}
    del guion         ancho ${rata.delGuion.ancho}  alto ${rata.delGuion.alto}`);

control("la rata elegida es por su GUION y está viva y en el mundo",
  rata.guion.includes(GUION_RATA) && !rata.dormido && !rata.muerto && rata.vida > 0,
  `${rata.guion}, vida ${rata.vida}`);

// ── 2. ¿HAY UN CUERPO DONDE ESTÁ LA RATA? Se lo pregunta un rayo ──────────
//
// Y no a nuestra contabilidad: `cilindro` arriba sale de `bichosSolidos`, que
// es nuestra lista. El 69 ya enseñó que `choca === false` se queda verde con la
// física parando al jugador. Esto es un rayo horizontal que entra desde fuera.
const aMedia = await pag.evaluate((g) => window.probe.ia.hayCuerpoEn(g, { aQue: 16 }), GUION_RATA);
const porEncima = await pag.evaluate((g) => window.probe.ia.hayCuerpoEn(g, { aQue: 120 }), GUION_RATA);
console.log(`\n  EL CUERPO DE LA RATA, SEGÚN UN RAYO
    a 16 u del suelo  ${aMedia.toca ? `toca ${aMedia.deQuien} a ${aMedia.aQueDistancia.toFixed(1)} u del eje` : "NO TOCA NADA"}
    a 120 u (su aire) ${porEncima.toca ? `toca ${porEncima.deQuien} a ${porEncima.aQueDistancia.toFixed(1)} u` : "no toca nada"}`);

control("a la altura de la rata, el rayo toca A LA RATA y no al mundo",
  aMedia.toca === true && aMedia.deQuien === "el mismo",
  `${aMedia.toca ? aMedia.deQuien : "no toca"}`);
control("NEGATIVO: por encima de su cabeza el rayo NO la toca",
  porEncima.deQuien !== "el mismo",
  `${porEncima.toca ? porEncima.deQuien : "no toca nada"}`);

// ── 2b. ¿SE PUEDE ANDAR A TRAVÉS DE LA RATA? ──────────────────────────────
//
// Es lo que el jugador cuenta, y hasta aquí sólo sabíamos que el cilindro
// existe. Existir no es parar: el 69 midió tres veces una ausencia con un
// instrumento que no podía ver la presencia.
//
// Se anda contra ella Y se anda hacia el lado libre, y se comparan los dos. Sin
// el segundo, «avanzó poco» tiene otra explicación que ya costó una sesión en el
// 69: que el jugador se estuviera CAYENDO, que en el aire avanza 27 cm en dos
// segundos y medio.
const contra = await pag.evaluate(async ({ r, d }) => {
  const paso = async (signo) => {
    window.probe.mundo.poner(r.donde[0] + signo * d, r.donde[1] + 0.05, r.donde[2]);
    // Primero se deja caer al suelo sin andar: el 69 otra vez — andar desde 20 cm
    // de alto no mide el choque, mide la caída.
    window.probe.mundo.mirar(r.donde[0], r.donde[1] + 0.2, r.donde[2]);
    const salida = window.probe.mundo.donde().pies;
    let min = Infinity;
    for (let k = 0; k < 30; k++) {
      window.probe.sonido.andando(0.1, { correr: false });
      const p = window.probe.mundo.donde().pies;
      const ejes = Math.hypot(p[0] - r.donde[0], p[2] - r.donde[2]);
      if (ejes < min) min = ejes;
    }
    const fin = window.probe.mundo.donde().pies;
    return { min, andado: Math.hypot(fin[0] - salida[0], fin[2] - salida[2]) };
  };
  const hacia = await paso(1);
  // Y HACIA EL LADO LIBRE: se mira al revés y se anda lo mismo.
  window.probe.mundo.poner(r.donde[0] + d, r.donde[1] + 0.05, r.donde[2]);
  window.probe.mundo.mirar(r.donde[0] + d * 3, r.donde[1] + 0.2, r.donde[2]);
  const salida = window.probe.mundo.donde().pies;
  for (let k = 0; k < 30; k++) window.probe.sonido.andando(0.1, { correr: false });
  const fin = window.probe.mundo.donde().pies;
  return { hacia, libre: Math.hypot(fin[0] - salida[0], fin[2] - salida[2]) };
}, { r: rata, d: 2.0 });

console.log(`\n  ANDANDO CONTRA LA RATA (desde 2 m, tres segundos)
    lo más cerca que llegó  ${(contra.hacia.min * U).toFixed(1)} u de su eje
    los cuerpos separan     ${(16 + rata.delGuion.ancho / 2).toFixed(1)} u (jugador 16 + rata ${rata.delGuion.ancho / 2})
    andado contra ella      ${(contra.hacia.andado * U).toFixed(1)} u
    andado hacia el lado libre ${(contra.libre * U).toFixed(1)} u   <- el control positivo`);

control("control positivo: hacia el lado libre el jugador SÍ anda",
  contra.libre * U > 100, `${(contra.libre * U).toFixed(1)} u en 3 s`);
control("y contra la rata se para: no se la atraviesa",
  contra.hacia.min * U > 20,
  `llegó a ${(contra.hacia.min * U).toFixed(1)} u del eje`);

// ── 3. LA ANIMACIÓN DE SU ATAQUE, grabada fotograma a fotograma ──────────
//
// Y NO CONTRA LA RATA, que es lo que esta sonda enseñó en su primera pasada:
// una rata **no ataca nunca al jugador**, y eso es correcto. `vermin` es RECELO
// con `human`, y RECELO no es enemigo —`esEnemigo(RELACION.RECELO) === false`,
// que `test/juego_ia` ya defiende con su cita—. El primer montaje de este
// control pedía ocho segundos de ataques a un bicho que no tiene ninguno y daba
// «0 ataques en 8 s»: un rojo honrado, pero del instrumento.
//
// Los hostiles de Edana son SEIS, todos jabalíes, y dos de ellos están puestos a
// mano en el mapa —no salen de un área—, así que están al entrar.
const GUION_HOSTIL = "monsters/boar";
const jabali = await pag.evaluate((g) => window.probe.ia.bicho(g), GUION_HOSTIL);
control("hay un jabalí hostil en el mundo: es quien puede atacar",
  Boolean(jabali) && !jabali.dormido && !jabali.muerto,
  jabali ? `${jabali.nombre}, vida ${jabali.vida}, alcance ${jabali.alcanceDeGolpe} u` : "ninguno");

await pag.evaluate((r) => {
  // Al lado y NO encima: `poner` no resuelve colisiones (el 69), así que
  // teletransportarse dentro de la caja mide otra cosa.
  window.probe.mundo.poner(r.donde[0] + 1.2, r.donde[1] + 0.1, r.donde[2]);
  window.probe.mundo.mirar(r.donde[0], r.donde[1] + 0.5, r.donde[2]);
}, jabali);
await pag.waitForTimeout(500);
await pag.evaluate((g) => window.probe.ia.grabarAnimacion(g, { segundos: 8 }), GUION_HOSTIL);
await pag.waitForTimeout(9000);
const cinta = await pag.evaluate(() => window.probe.ia.cinta());
const nombreDelGolpe = jabali?.anim ? await pag.evaluate((g) => {
  const i = window.probe.ia._buscar(g);
  return i?.ficha?.ia?.golpe ?? null;
}, GUION_HOSTIL) : null;
const duraAtaque = await pag.evaluate(({ g, a }) => {
  const i = window.probe.ia._buscar(g);
  const s = (i?.secuencias ?? []).find((x) => x.nombre === a);
  return s ? s.fotogramas / s.fps : null;
}, { g: GUION_HOSTIL, a: nombreDelGolpe });

const tramos = (cinta?.tramos ?? []).filter((t) => !t.alBorde);
const deAtaque = tramos.filter((t) => t.nombre === nombreDelGolpe);
console.log(`\n  EL CRONOGRAMA DEL JABALÍ (${cinta?.tramos.length} tramos; su \`${nombreDelGolpe}\` dura ${duraAtaque}s)
    ${tramos.map((t) => `${String(t.nombre).padEnd(14)} ${t.dura.toFixed(2)}s`).join("\n    ")}`);

control("el jabalí llega a atacar: control positivo del cronograma",
  deAtaque.length >= 1, `${deAtaque.length} ataques en 8 s`);
if (deAtaque.length >= 1) {
  // EL UMBRAL VA AL 80 %, Y NO ES HOLGURA POR GUSTO.
  //
  // El muestreo es por `requestAnimationFrame` y el tramo pierde una muestra en
  // cada punta; con el pueblo entero delante, el navegador además se salta
  // fotogramas. Con la tolerancia en 50 ms esto salió **rojo con el trabajo bien
  // hecho** —un tramo de 1581 ms de 1667, cinco fotogramas de menos— mientras la
  // pasada anterior daba los tres completos. Un control que falla una vez de cada
  // dos sin que nada esté roto es ruido con forma de rojo y gasta la sesión
  // siguiente (el 76).
  //
  // Y se puede bajar sin perder el fallo porque la señal es enorme: con `pon()`
  // sin guarda el ataque duraba **el 7 %** de su archivo (120 ms de 1667). Entre
  // el 7 % y el 80 % hay un factor diez; entre el 95 % y el 80 %, mi rejilla.
  const corto = deAtaque.find((t) => t.dura < duraAtaque * 0.8);
  const largo = deAtaque.find((t) => t.dura > duraAtaque + 0.25);
  control("A. ningún ataque se corta antes de acabar (`CAnimOnce`)",
    !corto, corto ? `uno duró ${(corto.dura * 1000).toFixed(0)} ms de ${duraAtaque * 1000}` : "todos completos");
  control("B. y ninguno se queda congelado al acabar",
    !largo, largo ? `uno se quedó ${(largo.dura * 1000).toFixed(0)} ms` : "todos se sueltan");
} else {
  pendiente("A y B del cronograma", "la rata no atacó en la ventana: sin ataque no hay tramo que medir");
}

// ── 4. LA ESPADA, DESDE LA FRANJA MUERTA ─────────────────────────────────
//
// El jugador a `horizontal + 4` unidades del eje de la rata: fuera del alcance
// de la esfera y dentro del de la línea. Ahí es donde el jugador oía el clang.
// Los contadores vienen DENTRO de lo que devuelve `atacar`, ya restados: la
// primera versión los leía de `window.probe.porLaLinea`, que no existe —
// `montarSonda` construye su propia superficie y un getter de `main.js` no
// aparece ahí. El síntoma fue `NaN` en tres controles, que al menos se ve.
const antesDeGolpear = { rata: await pag.evaluate((g) => window.probe.ia.bicho(g), GUION_RATA) };
const lejos = (horizontal + 4) / U;
const sitio = await pag.evaluate(({ r, d }) => {
  window.probe.mundo.poner(r.donde[0] + d, r.donde[1] + 0.1, r.donde[2]);
  window.probe.mundo.mirar(r.donde[0], r.donde[1] + 0.4, r.donde[2]);
  return window.probe.mundo.donde();
}, { r: antesDeGolpear.rata, d: lejos });
await pag.waitForTimeout(200);

// LA DISTANCIA DE VERDAD, medida y no supuesta: la rata se mueve, así que el
// número que vale es el de justo antes de blandir. El 69 y el 75: comprueba que
// el que mide está de pie y a la distancia que cree.
const aQue = await pag.evaluate((g) => {
  const r = window.probe.ia.bicho(g);
  const p = window.probe.mundo.donde();
  return { d: Math.hypot(r.donde[0] - p.pies[0], r.donde[2] - p.pies[2]), vida: r.vida };
}, GUION_RATA);
const dU = aQue.d * U;

const golpe = await pag.evaluate(() => window.probe.golpe.atacar(1.6));
const despues = await pag.evaluate((g) => window.probe.ia.bicho(g), GUION_RATA);

console.log(`\n  UN MANDOBLE DESDE LA FRANJA MUERTA
    a qué distancia   ${dU.toFixed(1)} u del eje de la rata (la esfera llega a ${horizontal.toFixed(1)})
    mandobles         ${golpe.golpes}   impactos ${golpe.impactos}
    por la LÍNEA      ${golpe.porLaLinea}
    contra la PARED   ${golpe.contraPared}
    vida de la rata   ${aQue.vida} -> ${despues.vida}${despues.muerto ? "  (muerta)" : ""}`);

control("se ha blandido de verdad: control positivo del mandoble",
  golpe.golpes >= 1, `${golpe.golpes} mandobles`);
control("desde fuera del alcance de la esfera, la rata RECIBE DAÑO",
  despues.vida < aQue.vida || despues.muerto,
  `${aQue.vida} -> ${despues.vida}`);
control("y entró por la LÍNEA, que es el segundo intento del motor",
  golpe.porLaLinea >= 1, `${golpe.porLaLinea} por la línea`);
control("y NO sonó el golpe contra piedra: una rata no es una pared",
  golpe.contraPared === 0, `${golpe.contraPared} veces`);

// ── 5. EL CONTROL NEGATIVO DEL CLANG ─────────────────────────────────────
//
// «No suena a piedra» se cumple no sonando nunca, y eso sería otro juego. Se
// mira una pared de verdad y el `hitwall` TIENE que subir. Sin esto, el control
// de arriba es el verde vacío del apartado 4 de CLAUDE.md.
// ── Y SE MIRA AL SUELO, NO A LOS LADOS ───────────────────────────────────
//
// La primera versión giraba sobre el sitio probando dieciséis rumbos
// horizontales y salió **roja con el trabajo bien hecho**: en esa sala del
// templo no hay una pared a menos de 60 unidades en ninguno de los dieciséis, y
// un rayo horizontal no encuentra el suelo. Lo que mide eso es el tamaño de la
// habitación. El suelo, en cambio, está siempre debajo de los pies.
const paredes = await pag.evaluate(async () => {
  // Se BUSCA la pared en vez de suponerla, y además SE VA ANDANDO HASTA ELLA.
  // Este control nació rojo tres veces con el código bien: por elegir rumbos
  // horizontales donde no había piedra, por mirar al suelo (que a 64 unidades de
  // ojo no lo alcanza una espada de 60), y por buscarla a 60 u desde donde el
  // jugador se había quedado — en medio del templo, con la piedra más cercana a
  // más de metro y medio. El instrumento tiene que ir a donde se puede medir.
  const lejos = window.probe.ia.mundoATiro(600);
  if (lejos) {
    window.probe.mundo.mirar(lejos.hacia[0], lejos.hacia[1], lejos.hacia[2]);
    for (let k = 0; k < 40; k++) window.probe.sonido.andando(0.1, { correr: false });
  }
  const w = window.probe.ia.mundoATiro(60);
  if (!w) return { sinPared: true, subio: 0, golpes: 0, impactos: 0, busco: lejos?.aQue ?? null };
  window.probe.mundo.mirar(w.hacia[0], w.hacia[1], w.hacia[2]);
  const r = window.probe.golpe.atacar(1.6);
  return { subio: r.contraPared, golpes: r.golpes, impactos: r.impactos, aQue: w.aQue, rumbos: w.rumbos };
});
console.log(`\n  EL CONTROL NEGATIVO DEL CLANG (buscando la piedra, no suponiéndola)
    piedra a tiro     ${paredes.sinPared ? "NO HAY a 60 u en ninguna dirección" : `${paredes.aQue.toFixed(1)} u (rumbo ${paredes.rumbos} de 24)`}
    mandobles         ${paredes.golpes}, impactos ${paredes.impactos}
    el \`hitwall\` subió ${paredes.subio} veces`);
if (paredes.sinPared) {
  // No se apunta un verde y tampoco un rojo del juego: es el instrumento el que
  // no se puede montar donde quedó el jugador. Declararlo pendiente es la regla
  // del 50 llevada al marcador.
  pendiente("NEGATIVO: contra la piedra el `hitwall` SÍ suena",
    "no hay mundo a 60 u desde donde quedó el jugador");
} else {
  control("NEGATIVO: contra la piedra el `hitwall` SÍ suena",
    paredes.subio >= 1, `subió ${paredes.subio} con la piedra a ${paredes.aQue.toFixed(1)} u`);
}

control("y la página no ha tirado ni un error", errores.length === 0, errores.join(" | "));

} catch (e) {
  // LA CAÍDA ES UNA ROJA Y NO UNA NOTA AL PIE. Es la lección del 65: un «X de Y»
  // donde Y se calcula al final no puede bajar nunca, y `arranque36` remató
  // «22 de 22» cayéndose en el control 22 de 30.
  control("LA SONDA HA LLEGADO AL FINAL", false, String(e).slice(0, 300));
} finally {
  const verdes = controles.filter((c) => c.bien === true).length;
  const rojos = controles.filter((c) => c.bien === false).length;
  const pend = controles.filter((c) => c.bien === null).length;
  console.log("\n  CONTROLES");
  for (const c of controles) {
    const marca = c.bien === null ? "  ?" : c.bien ? "  +" : "  X";
    console.log(`${marca} ${c.que}${c.detalle ? `   (${c.detalle})` : ""}`);
  }
  // Y el total se cuenta sobre los que SE DECLARARON, no sobre los que corrieron.
  console.log(`\n  ${verdes} de ${verdes + rojos} en verde${pend ? `, ${pend} pendiente(s)` : ""}`);
  await nav.close();
  matar(dev);
  process.exit(rojos ? 1 : 0);
}
