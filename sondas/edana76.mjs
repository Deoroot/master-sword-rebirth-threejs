// LA MANZANA DEL ÁRBOL SE APAGA, Y LA SOPA APARECE — experimento 76.
//
//   npm run sonda:edana76
//
// El 71 hizo caer la manzana del manzano de Edana y el 75 la hizo tirar. Las dos
// veces quedó lo mismo sin hacer: **la manzana del árbol seguía colgando**. El
// mapa sí lo manda, y por un camino que llevaba cuatro experimentos escrito y
// sin alcanzar a nada.
//
// ── LA CADENA ─────────────────────────────────────────────────────────────
//
//   algo dispara "apple5spawn"
//        │
//        ├──► msitem_spawn  apple5spawn ──► la manzana CAE   (el 71)
//        │
//        └──► env_render    apple5spawn ──► rendermode 4, renderamt 0
//                                │            sobre "apple5"
//                                ▼
//                      CRenderFxManager::Use      triggers.cpp:535-557
//                                │
//                                ▼
//                      R_AddEntity: !R_ModelOpaque && CL_FxBlend <= 0
//                                                     ref/gl/gl_rmain.c:252
//
// **Dos entidades con el mismo `targetname`**, y por eso un disparo hace las dos
// cosas: el objeto nace en el suelo y el adorno se apaga.
//
// ── LO QUE NO ERA COMO PARECÍA ────────────────────────────────────────────
//
// 1. **El 69 escribió aquí que no se podía, y la razón caducó.** Decía —en
//    `src/main.js`— que los 46 adornos van fundidos en una sola malla, así que
//    esconder uno no es apagar un nodo. Cierto, y el arreglo no era buscar el
//    trozo: **un adorno con nombre ya no se funde**. En GoldSrc cada
//    `env_model` es su propia entidad con su propio estado de dibujo; fundirlos
//    era una optimización NUESTRA, y el que puede cambiar es justo el que no
//    puede ir fundido. Son 9 de 46 en Edana y 0 de 101 en Gate City.
//
// 2. **Cuatro adornos NACEN invisibles, y este puerto los dibujaba.** Los
//    cuatro platos de sopa de la taberna traen `rendermode 4` y `renderamt 0`
//    en el `.bsp`: el motor **no los añade a la lista de dibujo**. Aquí estaban
//    en la mesa desde el primer fotograma, con las mesas vacías. No es que
//    faltara el `env_render`: es que faltaba el estado de nacimiento.
//
// 3. **Y el `env_render` del plato SE LLAMA IGUAL que el aparecedor del
//    parroquiano.** `patronspawn` elige uno al azar de `patron1`..`patron12`, y
//    en cuatro de esos doce nombres hay además un `env_render`: **el plato de
//    sopa aparece cuando se sienta el cliente.** Nadie había portado la mitad
//    del plato.
//
// 4. **`patron9` tiene plato y NO tiene parroquiano.** El mapeador se dejó el
//    aparecedor. Es un descuido suyo y aquí es el instrumento: es el único de
//    los cuatro nombres que mueve UNA sola cosa, así que es el que se puede
//    medir contando píxeles sin que un monstruo que aparece a la vez ensucie la
//    cuenta.
//
// 5. **La mitad de la regla que se olvida.** `renderamt 0` esconde **sólo si el
//    modo no es 0**, porque `R_ModelOpaque(rm)` es `rm == kRenderNormal`
//    (ref/gl/gl_local.h:87). Con `rendermode 0` el `renderamt` no se mira.
//
// ── LAS FORMAS DE QUE ESTO PAREZCA FUNCIONAR Y ESTÉ MAL ───────────────────
//
//   lo que se vería                  lo que estaría pasando
//   ──────────────────────────────── ────────────────────────────────────────
//   `censo()` dice `visible: false`  nuestra propia contabilidad, que es lo
//   y el control se pone verde       que el 69 leyó en `choca === false` y se
//                                    quedó verde con el arreglo roto. Aquí se
//                                    cuentan PÍXELES de una captura y los
//                                    triángulos que dice la TARJETA
//   los píxeles de la ventana        ruido: la taberna tiene antorchas y
//   cambian                          parroquianos. Antes de disparar nada se
//                                    toman DOS capturas seguidas y se mide el
//                                    suelo de ruido; si el ruido es del orden
//                                    de la señal, el control es rojo
//   «la manzana del árbol se apaga»  pero se apagan las cinco. Edana tiene
//                                    CUATRO adornos llamados `apple1` y el
//                                    `env_render` busca `apple5`: las otras
//                                    cuatro tienen que seguir ahí
//   el plato aparece                 pero porque el disparo trae un parroquiano
//                                    delante. Por eso se mide con `patron9`,
//                                    que no tiene aparecedor
//
// ── LO QUE ESTA SONDA NO MIDE ─────────────────────────────────────────────
//
//   El `env_render` sobre una entidad del CABLEADO: Edana tiene uno
//   (`renderFountainNormal`, una `func_water`) y sigue contándose sin portar.
//   Las quince ramas de `CL_FxBlend` que no son la del `renderfx 0`: no están
//   escritas porque `renderfx` vale 0 en las 229 cosas con aspecto de los dos
//   mapas, y `src/play/aspecto.js` lo dice con la tabla de lo que pediría cada
//   una. Y el alfa intermedio: los dos mapas sólo usan 0 y 255.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";
import { leerPng } from "../tools/png.mjs";
import { readFileSync, existsSync, mkdirSync } from "node:fs";

const PORT = 5273;
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

const VISTAS = "build/edana/vistas";
mkdirSync(VISTAS, { recursive: true });

/** Cuántos píxeles cambian entre dos recortes, con el mismo umbral que `diffpng`. */
function cambian(a, b) {
  if (!a || !b) return { n: -1, de: 0, max: 0, sinFoto: true };
  const A = leerPng(a), B = leerPng(b);
  if (A.rgba.length !== B.rgba.length) return { n: -1, de: 0, max: 0 };
  let n = 0, max = 0;
  for (let i = 0; i < A.rgba.length; i += 4) {
    const d = Math.abs(A.rgba[i] - B.rgba[i]) + Math.abs(A.rgba[i + 1] - B.rgba[i + 1]) +
      Math.abs(A.rgba[i + 2] - B.rgba[i + 2]);
    if (d > 8) n++;
    if (d > max) max = d;
  }
  return { n, de: A.rgba.length / 4, max };
}

/**
 * Un recorte de la pantalla alrededor de un punto del mundo.
 *
 * La ventana y no la pantalla entera, porque lo que se mide es una cosa de un
 * palmo en un pueblo con antorchas: un recuento global mide el ruido.
 */
async function recorte(nombre, p, lado = 150) {
  const en = await pag.evaluate((q) => window.probe.mundo.puntoEnPantalla(q), p);
  // SIN RECORTAR AL BORDE. El primer intento hacía `clamp` a la pantalla cuando
  // el punto se salía, y entonces fotografiaba una esquina quieta y medía cero
  // píxeles de cambio: un verde al revés —un rojo que no significaba nada— por
  // mirar donde la cosa no está. Si no está dentro, se dice.
  if (!en || !en.dentro) return { en, ruta: null, fuera: true };
  const lx = Math.min(lado, en.ancho), ly = Math.min(lado, en.alto);
  const x = Math.max(0, Math.min(en.ancho - lx, en.x - Math.round(lx / 2)));
  const y = Math.max(0, Math.min(en.alto - ly, en.y - Math.round(ly / 2)));
  const ruta = `${VISTAS}/edana76-${nombre}.png`;
  await pag.screenshot({ path: ruta, clip: { x, y, width: lx, height: ly } });
  return { en, ruta, caja: { x, y, lado: lx } };
}

try {

// ── 0. EL HORNEADO, antes de abrir el navegador ────────────────────────────
const malla = JSON.parse(readFileSync("build/edana/malla.json", "utf8"));
const nombrados = malla.adornos?.nombrados ?? [];
const colocaciones = malla.adornos?.colocaciones ?? [];
const rs = (malla.disparadores ?? []).filter((x) => x.clase === "env_render");

console.log(`\n  EL HORNEADO: LOS ADORNOS QUE NO SE FUNDEN
    colocaciones      ${colocaciones.length}, con targetname ${colocaciones.filter((c) => c.nombre).length}
    sueltos           ${nombrados.length}
    ${nombrados.map((s) => `${s.nombre.padEnd(14)} modo ${s.render?.modo} amt ${String(s.render?.cantidad).padStart(3)} ` +
      `${s.grupos.length} grupos, ${s.vertices} vértices`).join("\n    ")}`);

control("los sueltos son exactamente las colocaciones CON nombre",
  nombrados.length === colocaciones.filter((c) => c.nombre).length && nombrados.length > 0,
  `${nombrados.length} de ${colocaciones.filter((c) => c.nombre).length}`);

const apagados = nombrados.filter((s) => (s.render?.modo ?? 0) !== 0 && (s.render?.cantidad ?? 255) <= 0);
control("CUATRO platos de sopa nacen invisibles en el `.bsp`",
  apagados.length === 4 && apagados.every((s) => /soup$/.test(s.nombre)),
  apagados.map((s) => s.nombre).join(", ") || "ninguno");
// El otro lado, porque si TODO naciera apagado el control de arriba pasaría igual.
control("y las cinco manzanas nacen visibles",
  nombrados.filter((s) => /^apple/.test(s.nombre)).length === 5 &&
  nombrados.filter((s) => /^apple/.test(s.nombre)).every((s) => (s.render?.cantidad ?? 255) === 255),
  `${nombrados.filter((s) => /^apple/.test(s.nombre)).length} manzanas`);

control("CUATRO se llaman `apple1` y una `apple5`, que es la que el mapa apaga",
  nombrados.filter((s) => s.nombre === "apple1").length === 4 &&
  nombrados.filter((s) => s.nombre === "apple5").length === 1,
  `apple1 x${nombrados.filter((s) => s.nombre === "apple1").length}, apple5 x${nombrados.filter((s) => s.nombre === "apple5").length}`);

const dosCosas = (malla.disparadores ?? []).filter((x) => x.nombre === "apple5spawn").map((x) => x.clase).sort();
control("`apple5spawn` son DOS entidades: el aparecedor y el `env_render`",
  dosCosas.join(",") === "env_render,msitem_spawn", dosCosas.join(", "));

const nueve = (malla.disparadores ?? []).filter((x) => x.nombre === "patron9");
control("`patron9` es SÓLO el `env_render`: no trae parroquiano (el instrumento)",
  nueve.length === 1 && nueve[0].clase === "env_render",
  nueve.map((x) => x.clase).join(", "));

// Y la cuenta de Gate City, que es por donde esto no se veía.
if (existsSync("build/gatecity/malla.json")) {
  const gc = JSON.parse(readFileSync("build/gatecity/malla.json", "utf8"));
  const gcn = gc.adornos?.nombrados ?? [];
  const gcr = (gc.disparadores ?? []).filter((x) => x.clase === "env_render");
  console.log(`    Gate City        ${gcn.length} adornos con nombre, ${gcr.length} env_render`);
  control("Gate City tiene CERO: es por donde esto llevaba cuatro experimentos sin verse",
    gcn.length === 0 && gcr.length === 0, `${gcn.length} sueltos, ${gcr.length} env_render`);
}

// ── 1. SE ENTRA POR EL MENÚ ────────────────────────────────────────────────
await entrarPorElMenu(pag, PORT, { mapa: "edana" });
await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
await pag.waitForTimeout(2500);
await pag.waitForFunction(() => window.probe?.mundo?.adornos, null, { timeout: 30000 });

const mapa = await pag.evaluate(() => window.probe.vgui2.mapaDeLaPartida());
control("se ha entrado a Edana y no a Gate City", mapa === "edana", `${mapa}`);

const alEntrar = await pag.evaluate(() => window.probe.mundo.adornos());
console.log(`\n  AL ENTRAR
    ${alEntrar.map((a) => `${a.nombre.padEnd(14)} visible ${String(a.visible).padEnd(5)} alfa ${a.alfa.toFixed(2)} cambios ${a.cambios}`).join("\n    ")}`);

control("el visor monta los nueve sueltos", alEntrar.length === nombrados.length,
  `${alEntrar.length} de ${nombrados.length}`);
// EL CONTROL NEGATIVO, y es la mitad del experimento: ningún plato se dibuja
// por las buenas.
//
// Lo que se afirma NO es «al entrar están los cuatro apagados», que es una
// carrera: `player_joined` llena la taberna en el primer segundo y la segunda
// pasada de esta sonda ya pilló uno encendido. Lo que no depende del instante es
// que **ninguno esté encendido sin que algo lo haya encendido**: `cambios` es
// cuántos `env_render` le han llegado, y un plato visible con cero cambios sería
// el estado de nacimiento ignorado.
const platosAlEntrar = alEntrar.filter((a) => /soup$/.test(a.nombre));
control("NEGATIVO: ningún plato se dibuja sin que un `env_render` lo haya puesto",
  platosAlEntrar.every((a) => !a.visible || a.cambios >= 1),
  platosAlEntrar.map((a) => `${a.nombre}:${a.visible}/${a.cambios}`).join(" "));
control("y los nueve están colgados de la escena con su geometría",
  alEntrar.every((a) => a.enEscena && a.vertices > 0),
  `${alEntrar.filter((a) => a.enEscena).length} en escena`);
// Los sueltos tienen material PROPIO —hace falta para cambiarles el alfa sin
// tocar a los otros 45—, y por eso hay que meterlos a mano en la lista que
// recorren las perillas del mapa de luz y las texturas. Una perilla que deja
// fuera nueve adornos sin decirlo es el ajuste callado de CLAUDE.md §5.
control("y sus materiales están en la lista que recorren las perillas",
  alEntrar.every((a) => a.enLaLista),
  `${alEntrar.filter((a) => a.enLaLista).length} de ${alEntrar.length}`);
// La lección del 71: que el nodo esté donde dice el manifiesto, en los tres ejes.
const lejos = alEntrar.filter((a) =>
  Math.hypot(...a.primerVertice.map((n, i) => n - a.escena[i])) > 1.5);
control("y sus vértices están donde dice el manifiesto, no en el origen del mapa",
  lejos.length === 0 && alEntrar.every((a) => Math.hypot(...a.escena) > 1),
  lejos.map((a) => a.nombre).join(", ") || "los nueve");
control("POSITIVO al lado: las cinco manzanas sí",
  alEntrar.filter((a) => /^apple/.test(a.nombre)).every((a) => a.visible && a.alfa === 1),
  alEntrar.filter((a) => /^apple/.test(a.nombre)).map((a) => `${a.nombre}:${a.visible}`).join(" "));

// ── 2. LA TABERNA SE LLENA SOLA, Y LOS PLATOS SE PONEN ───────────────────
//
// Esto es el camino del juego y no hace falta tocar nada: el guion del jugador
// pide `usetrigger player_joined` (player_main.script:139), eso llama a
// `patronmm1` y de ahí sale `patronspawn`, un `multi_manager` con `random 1` que
// **sortea uno de patron1..patron12**. En cuatro de esos doce nombres hay además
// un `env_render`, así que el plato se pone cuando se sienta el cliente.
//
// Y es lo primero que esta sonda midió mal: se plantó delante del plato y lo
// disparó a mano, con el plato **ya encendido por la cadena**, así que la cuenta
// de píxeles salió cero y el verde habría sido «no cambia nada».
await pag.waitForTimeout(3000);
const solos = await pag.evaluate(() => window.probe.mundo.adornos());
const platos = solos.filter((a) => /soup$/.test(a.nombre));
const cuenta = await pag.evaluate(() => window.probe.mundo.disparadores().cuenta);

console.log(`\n  LA CADENA, SOLA (nadie ha tocado nada)
    player_joined     x${cuenta.player_joined ?? 0}
    patronspawn       x${cuenta.patronspawn ?? 0}
    ${platos.map((a) => `${a.nombre.padEnd(14)} visible ${String(a.visible).padEnd(5)} cambios ${a.cambios}`).join("\n    ")}`);

control("la cadena de la taberna corre sola: `patronspawn` se ha disparado",
  (cuenta.patronspawn ?? 0) >= 1, `x${cuenta.patronspawn ?? 0}`);

// Y AHORA EL SORTEO, HASTA QUE SALGA UNO.
//
// «¿Ha salido ya un plato?» no sirve de control: `patronspawn` tiene `random 1`
// y elige UNO de doce, y sólo cuatro de los doce nombres llevan plato. Con los
// cinco ciclos que da `player_joined`, la probabilidad de que no salga ninguno
// es (8/12)^5 = 13 %, y esta sonda cayó en ese 13 % en una pasada. Un control
// que falla una vez de cada ocho sin que nada esté roto es ruido con forma de
// rojo. Lo que se mide es que el sorteo LLEGA al plato, dándole vueltas.
// Los que YA estuvieran puestos por la cadena sola, que si no la cuenta de abajo
// se cobra el trabajo de otro: en una pasada salió «2 puestos en 1 tirada».
const puestosAntes = platos.filter((a) => a.visible).length;
const sorteo = await pag.evaluate(async () => {
  for (let i = 1; i <= 40; i++) {
    window.probe.mundo.disparaDelMapa("patronspawn");
    await new Promise((r) => setTimeout(r, 30));
    const p = window.probe.mundo.adornos().filter((a) => /soup$/.test(a.nombre));
    if (p.some((a) => a.visible)) return { tiradas: i, puestos: p.filter((a) => a.visible).length };
  }
  return { tiradas: 40, puestos: 0 };
});
const trasSorteo = await pag.evaluate(() => window.probe.mundo.adornos().filter((a) => /soup$/.test(a.nombre)));
console.log(`    sorteo            un plato en ${sorteo.tiradas} tiradas de patronspawn
    ${trasSorteo.map((a) => `${a.nombre.padEnd(14)} visible ${String(a.visible).padEnd(5)} cambios ${a.cambios}`).join("\n    ")}`);

const nuevos = trasSorteo.filter((a) => a.visible).length - puestosAntes;
control("el sorteo del mapa acaba poniendo un plato: la cadena entera funciona",
  trasSorteo.some((a) => a.visible), `${trasSorteo.filter((a) => a.visible).length} puestos`);
// El contraste que impide leer esto como «se encienden todos de golpe»: cada
// tirada elige UN nombre, así que no pueden aparecer más platos nuevos que
// tiradas. Se cuentan los NUEVOS: la cadena sola ya había puesto alguno, y
// contarlos todos se cobraba el trabajo de otro (salió «2 en 1 tirada»).
control("y enciende como mucho UNO por tirada, no los cuatro de golpe",
  nuevos >= 0 && nuevos <= sorteo.tiradas,
  `${nuevos} nuevos en ${sorteo.tiradas} tiradas (${puestosAntes} ya estaban)`);

// ── 2b. EL EFECTO EN LA PANTALLA, CON UN PLATO APAGADO A PROPÓSITO ───────
//
// `patron9` es el único de los cuatro que **no trae parroquiano** —el mapeador
// se dejó el aparecedor—, así que al dispararlo lo único que puede cambiar en
// la pantalla es el plato. Por eso es el que se mide.
//
// Para partir de apagado se usa `aspectoDeAdorno`, que es un INSTRUMENTO y no
// un camino del juego: deja el plato como nace. El encendido que se mide lo
// sigue haciendo el bus con `disparaDelMapa`.
const plato = nombrados.find((s) => s.nombre === "patron9soup");
// SE BUSCA UN SITIO DESDE EL QUE SE VEA, con un rayo. Plantarse a mano «delante»
// fue la primera medida de esta sonda y la cámara acabó **dentro de una mesa**:
// el plato salía en el centro de la pantalla y detrás del tablero, así que
// encenderlo no cambiaba un píxel. El punto proyectado no dice si se ve.
//
// Y se apunta al CENTRO DE SUS VÉRTICES, no a `escena`: `escena` es el `origin`
// de la entidad del `.bsp` y el plato está 0,8 m por encima del suyo. Las dos
// primeras pasadas de esta sonda fotografiaron la mesa de debajo.
const sitio = await pag.evaluate(() => {
  // Encendido para buscar: un rayo no choca con lo que no se dibuja.
  window.probe.mundo.aspectoDeAdorno("patron9soup", { modo: 4, cantidad: 255, fx: 0 });
  return window.probe.mundo.plantarseAnte("patron9soup");
});
await pag.waitForTimeout(1200);
const centroPlato = (await pag.evaluate(() => window.probe.mundo.adornosLlamados("patron9soup")[0])).centro;
const mirando = await pag.evaluate((p) => window.probe.mundo.puntoEnPantalla(p), centroPlato);
const delante = await pag.evaluate((p) => window.probe.mundo.loQueSeVe(p), centroPlato);
console.log(`\n  EL CENTRO DE SUS VÉRTICES NO ES SU ORIGEN
    escena (origin)   ${plato.escena.map((n) => n.toFixed(2)).join(", ")}
    centro real       ${centroPlato.map((n) => n.toFixed(2)).join(", ")}
    separación        ${Math.hypot(...centroPlato.map((n, i) => n - plato.escena[i])).toFixed(2)} m`);
control("hay un sitio desde el que SE VE el plato, comprobado con un rayo",
  Boolean(sitio) && delante?.[0]?.que === "adorno:patron9soup",
  sitio ? `radio ${sitio.radio} m, rumbo ${sitio.rumbo}°, primero ${delante?.[0]?.que}` : "no hay");
// Y se deja apagado, que es de donde se quiere partir.
await pag.evaluate(() => window.probe.mundo.aspectoDeAdorno("patron9soup", { modo: 4, cantidad: 0, fx: 0 }));
await pag.waitForTimeout(500);

console.log(`\n  EN LA TABERNA, DELANTE DE patron9soup
    plato en escena   ${plato.escena.map((n) => n.toFixed(2)).join(", ")}
    en pantalla       ${mirando ? `${mirando.x},${mirando.y} de ${mirando.ancho}x${mirando.alto}, a ${mirando.distancia} m, dentro ${mirando.dentro}` : "FUERA"}`);

control("la sonda está mirando el plato y lo tiene en pantalla, no a la espalda",
  Boolean(mirando?.dentro) && mirando.distancia < 4,
  mirando ? `${mirando.x},${mirando.y} a ${mirando.distancia} m, delante ${mirando.delante}` : "null");

// EL SUELO DE RUIDO. Dos capturas seguidas sin tocar nada: si la taberna se
// mueve tanto como el plato, contar píxeles no sirve y hay que saberlo ANTES.
const r0 = await recorte("0-antes", centroPlato, 110);
await pag.waitForTimeout(600);
const r0b = await recorte("0-antes-b", centroPlato, 110);
const ruido = cambian(r0.ruta, r0b.ruta);

// Y ahora el disparo, POR DONDE LO DISPARA EL JUEGO.
// Dos medidas del dibujo antes de tocar nada: si el contador se mueve solo, su
// diferencia después no significa nada.
const dib0 = await pag.evaluate(() => window.probe.mundo.dibujado());
const antesDibujo = await pag.evaluate(() => window.probe.mundo.dibujado());
control("INSTRUMENTO: el contador de la tarjeta está quieto con la escena quieta",
  dib0.triangulos === antesDibujo.triangulos,
  `${dib0.triangulos} y ${antesDibujo.triangulos}`);
const antesPlato = await pag.evaluate(() => window.probe.mundo.adornosLlamados("patron9soup")[0]);
const llego = await pag.evaluate(() => window.probe.mundo.disparaDelMapa("patron9"));
await pag.waitForTimeout(900);
const trasDibujo = await pag.evaluate(() => window.probe.mundo.dibujado());
const r1 = await recorte("1-sopa", centroPlato, 110);
const senal = cambian(r0b.ruta, r1.ruta);
const trasPlato = await pag.evaluate(() => window.probe.mundo.adornos());
const sinPortar = await pag.evaluate(() => window.probe.mundo.disparadores().sinPortar);
const elPlato = trasPlato.find((a) => a.nombre === "patron9soup");

console.log(`
  SE DISPARA patron9 (partiendo de apagado a mano)
    antes             visible ${antesPlato?.visible}
    llegó a (bus)     ${llego} entidades
    ruido de fondo    ${ruido.n} de ${ruido.de} px (dos capturas sin tocar nada)
    señal             ${senal.n} de ${senal.de} px, diferencia mayor ${senal.max}
    triángulos        ${antesDibujo.triangulos} -> ${trasDibujo.triangulos}  (${trasDibujo.triangulos - antesDibujo.triangulos})
    llamadas          ${antesDibujo.llamadas} -> ${trasDibujo.llamadas}
    el plato          visible ${elPlato?.visible}, alfa ${elPlato?.alfa}`);

control("PUNTO DE PARTIDA: el plato estaba apagado antes del disparo",
  antesPlato?.visible === false, `visible ${antesPlato?.visible}`);
// El `env_render` SÍ está en el bus —lo que no está es su víctima—, así que
// llegar a una entidad es lo correcto y no cero. Las dos mitades, por separado.
control("el disparo llega al `env_render`, que sí es del bus", llego === 1, `${llego}`);

// LA TABERNA NO ESTÁ QUIETA, y eso no es un fallo: hay parroquianos andando y
// antorchas. El primer umbral pedía menos de 200 px y salía rojo con el trabajo
// bien hecho —medía la taberna, no la pieza—. Lo que tiene que cumplirse para
// que contar píxeles signifique algo es que el ruido NO se coma la ventana.
control("INSTRUMENTO: el ruido de fondo no se come la ventana",
  ruido.n >= 0 && ruido.n < ruido.de * 0.15,
  `${ruido.n} de ${ruido.de} px (${((ruido.n / ruido.de) * 100).toFixed(1)} %)`);
control("EL EFECTO: el plato aparece en la PANTALLA, muy por encima del ruido",
  !senal.sinFoto && senal.n > Math.max(300, ruido.n * 5),
  senal.sinFoto ? "no había foto: el plato no estaba en pantalla" : `${senal.n} px contra ${ruido.n} de ruido`);
// Y la cuenta exacta: lo que crece tiene que ser lo que trae ESE adorno, ni más
// ni menos. `vertices / 3` son sus triángulos, del manifiesto.
control("y la TARJETA dibuja exactamente los triángulos del plato de más",
  trasDibujo.triangulos - antesDibujo.triangulos === plato.vertices / 3,
  `+${trasDibujo.triangulos - antesDibujo.triangulos} contra ${plato.vertices / 3} del plato`);
control("nuestra contabilidad dice lo mismo: visible y alfa 1",
  elPlato?.visible === true && elPlato?.alfa === 1, JSON.stringify(elPlato));

await pag.screenshot({ path: `${VISTAS}/edana76-taberna.png` });

// ── 3. LA MANZANA DEL ÁRBOL: LA OTRA DIRECCIÓN, Y LA CADENA DEL 71 ───────
const man = nombrados.find((s) => s.nombre === "apple5");
const sitioMan = await pag.evaluate(() => window.probe.mundo.plantarseAnte("apple5"));
const centroMan = (await pag.evaluate(() => window.probe.mundo.adornosLlamados("apple5")[0])).centro;
// LA MANZANA CUELGA A TRES METROS, así que `plantarseAnte` deja al jugador en el
// aire y **se cae** mientras la sonda espera. Hay que dejarlo posarse y volver a
// apuntar: la primera pasada midió desde el suelo con la vista donde estaba
// antes de caer, y la ventana salió fuera de pantalla. Es el primo del aviso del
// 69 —«comprueba que el que mide está de pie»— con la caída de por medio.
await pag.waitForTimeout(1500);
await pag.evaluate((p) => window.probe.mundo.mirar(p[0], p[1], p[2]), centroMan);
await pag.waitForTimeout(900);
const mirandoMan = await pag.evaluate((p) => window.probe.mundo.puntoEnPantalla(p), centroMan);
const delanteMan = await pag.evaluate((p) => window.probe.mundo.loQueSeVe(p), centroMan);
control("hay un sitio desde el que SE VE la manzana del árbol, con rayo",
  Boolean(sitioMan) && delanteMan?.[0]?.que === "adorno:apple5",
  sitioMan ? `radio ${sitioMan.radio} m, rumbo ${sitioMan.rumbo}°, primero ${delanteMan?.[0]?.que}` : "no hay");

// Dónde cae en pantalla el OBJETO que va a nacer, para decir si se mete en la
// misma ventana que el adorno: si se mete, los píxeles tienen dos causas y hay
// que decirlo en vez de cobrarse el verde.
const spawner = (malla.disparadores ?? []).find((x) => x.nombre === "apple5spawn" && x.clase === "msitem_spawn");
const dondeNace = await pag.evaluate((p) => window.probe.mundo.puntoEnPantalla(p), spawner.escena);

const m0 = await recorte("2-manzana-antes", centroMan, 110);
await pag.waitForTimeout(600);
const m0b = await recorte("2-manzana-antes-b", centroMan, 110);
const ruidoM = cambian(m0.ruta, m0b.ruta);

const antesSuelo = await pag.evaluate(() => window.probe.mundo.suelo().length);
const llego2 = await pag.evaluate(() => window.probe.mundo.disparaDelMapa("apple5spawn"));
await pag.waitForTimeout(1200);
const m1 = await recorte("3-manzana-despues", centroMan, 110);
const senalM = cambian(m0b.ruta, m1.ruta);
const trasMan = await pag.evaluate(() => window.probe.mundo.adornos());
const suelo = await pag.evaluate(() => window.probe.mundo.suelo());

const a5 = trasMan.find((a) => a.nombre === "apple5");
const a1 = trasMan.filter((a) => a.nombre === "apple1");
console.log(`\n  SE DISPARA apple5spawn (el aparecedor Y el env_render)
    manzana en        ${man.escena.map((n) => n.toFixed(2)).join(", ")}
    en pantalla       ${mirandoMan ? `${mirandoMan.x},${mirandoMan.y} a ${mirandoMan.distancia} m` : "FUERA"}
    el objeto nace en ${dondeNace ? `${dondeNace.x},${dondeNace.y}` : "fuera de pantalla"} ` +
  `(${dondeNace && mirandoMan ? `a ${Math.round(Math.hypot(dondeNace.x - mirandoMan.x, dondeNace.y - mirandoMan.y))} px del adorno` : "—"})
    llegó a (bus)     ${llego2} entidades
    ruido             ${ruidoM.n} de ${ruidoM.de} px
    señal             ${senalM.n} de ${senalM.de} px
    apple5            visible ${a5?.visible}, cambios ${a5?.cambios}
    las cuatro apple1 ${a1.map((a) => a.visible).join(", ")}
    objetos en suelo  ${antesSuelo} -> ${suelo.length}  (${suelo.map((o) => o.guion).join(", ")})`);

control("UN disparo hace las DOS cosas: el adorno se apaga y el objeto nace",
  a5?.visible === false && suelo.length > antesSuelo,
  `apple5 visible ${a5?.visible}, suelo ${antesSuelo} -> ${suelo.length}`);
control("el objeto que nace es una manzana, que es lo que cuelga del árbol",
  suelo.some((o) => o.guion === "health_apple"),
  suelo.map((o) => o.guion).join(", ") || "ninguno");
control("CONTROL: las otras CUATRO manzanas siguen ahí (busca `apple5`, no `apple*`)",
  a1.length === 4 && a1.every((a) => a.visible), `${a1.filter((a) => a.visible).length} de ${a1.length}`);
control("y le ha cambiado el aspecto UNA vez, no cinco",
  a5?.cambios === 1 && a1.every((a) => a.cambios === 0),
  `apple5 ${a5?.cambios}, apple1 ${a1.map((a) => a.cambios).join("/")}`);
// La ventana de píxeles de aquí tiene DOS causas si el objeto nace dentro, así
// que lo que se afirma es lo que se puede afirmar: que la pantalla cambia.
control("la PANTALLA cambia donde estaba la manzana, por encima del ruido",
  !senalM.sinFoto && senalM.n > Math.max(200, ruidoM.n * 5),
  senalM.sinFoto ? "no había foto: la manzana no estaba en pantalla" : `${senalM.n} px contra ${ruidoM.n} de ruido`);

await pag.screenshot({ path: `${VISTAS}/edana76-huerto.png` });

// ── 4. LOS DOS CONTADORES, QUE EL 69 CONTABA JUNTOS ──────────────────────
//
// `renderBEANS` es el nombre de DOS `env_render` a la vez, y cada uno cae en un
// cajón distinto:
//
//   renderBEANS -> renderfountainBEANS   no existe ni como entidad ni como
//                                        adorno: es una errata del mapa
//   renderBEANS -> renderFountainNormal  es una `func_water`, o sea del bus:
//                                        eso es un hueco NUESTRO
//
// Dispararlo es la manera de comprobar que los dos cajones son dos y no uno. El
// 69 los contaba juntos, y así «el mapa cita un nombre que no existe» y «esto no
// lo sabemos hacer» se leían como el mismo número.
const antesConteo = await pag.evaluate(() => ({ ...window.probe.mundo.disparadores().sinPortar }));
await pag.evaluate(() => window.probe.mundo.disparaDelMapa("renderBEANS"));
await pag.waitForTimeout(400);
const finSinPortar = await pag.evaluate(() => window.probe.mundo.disparadores().sinPortar);
const delta = (k) => (finSinPortar[k] ?? 0) - (antesConteo[k] ?? 0);

console.log(`\n  LO QUE EL BUS PIDIÓ Y NO SE SABE HACER (tras disparar renderBEANS)
    ${Object.entries(finSinPortar).map(([k, v]) => `${k.padEnd(40)} ${v}`).join("\n    ") || "nada"}`);

control("una errata del mapa se cuenta como «el objetivo no existe»",
  delta("render: el objetivo no existe") === 1, `+${delta("render: el objetivo no existe")}`);
// DOS y no uno, y es la regla de `CRenderFxManager::Use`: **a todas las que se
// llamen así**. `renderFountainNormal` es el nombre de DOS `func_water`, así que
// un disparo produce dos salidas. La primera versión de este control pedía 1 y
// salió rojo con el trabajo bien hecho — lo que estaba mal era mi cuenta.
const aguas = (malla.disparadores ?? []).filter((x) => x.nombre === "renderFountainNormal").length;
control("y un `env_render` sobre entidades del CABLEADO se cuenta aparte, una por víctima",
  delta("render") === aguas && aguas === 2,
  `+${delta("render")} para ${aguas} \`func_water\` que se llaman igual`);

} catch (err) {
  console.log(`\n  LA SONDA SE HA CAÍDO: ${String(err).slice(0, 400)}`);
  control("LA SONDA LLEGA AL FINAL", false, String(err).slice(0, 160));
}

// ── el veredicto ───────────────────────────────────────────────────────────
console.log("\n  CONTROLES");
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(74)} ${c.detalle}`);
const mal = controles.filter((c) => !c.bien);
console.log(`\n  ${controles.length - mal.length} de ${controles.length} en verde`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);
console.log(`  capturas:       ${VISTAS}/edana76-*.png\n`);

await nav.close(); matar(dev);
process.exit(mal.length || errores.length ? 1 : 0);
