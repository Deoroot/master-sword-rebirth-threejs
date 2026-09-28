// Los fotogramas de Gate City, medidos, con las vistas CALCULADAS del `.bsp`.
//
//   node tools/gatecity_shot.mjs          -> build/gatecity/vistas/
//   node tools/gatecity_shot.mjs --keep   deja servidor y navegador abiertos
//
// Ni una coordenada de cámara escrita a mano: cada toma sale del archivo. El punto
// de llegada, el centro del `msarea_town` mayor, la cara de techo más grande —o
// sea la bóveda—, el agua, la reja calada y el farol emisivo. Es la misma regla
// que gobierna la geometría aplicada a dónde se pone la cámara.
//
// ── Lo que se mide, y por qué estas cifras y no otras ───────────────────────
//
//   se VE          fracción de pantalla con luminancia por encima de 32/255. La
//                  COBERTURA no vale: mide píxeles que no son del color de la
//                  niebla, y aquí la niebla es casi negra igual que en el jharro,
//                  donde un pasillo a oscuras marcó el 95,7 % siendo una pantalla
//                  negra.
//   aporta la luz  cuántos píxeles CAMBIAN al apagar el mapa de luz. Ésta es LA
//                  cifra de la sesión: es lo que el jharro tiene a cero y lo que
//                  ninguna cantidad de luces dinámicas sin sombra iguala. Y es un
//                  número, no una impresión.
//   aporta textura cuántos cambian al quitar las texturas. La otra mitad del
//                  veredicto de quien lo jugó.
//   colores        una pantalla de un solo color es un mundo vacío que compila.
//   control        con el mundo apagado, la pantalla tiene que ser niebla. Sin
//                  esta pareja de números «se ve Gate City» sólo dice que se ve
//                  algo.

import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import {
  leerBsp, leerModelos, leerTexinfo, leerTexturas, leerEntidades, origen,
  leerCaras, UNIDADES_POR_METRO,
} from "../src/bsp/lector.js";
import { readFileSync } from "node:fs";
import { parcheDeLuz, tieneLuz } from "../src/bsp/lector.js";
import { NIEBLA } from "../src/render/bsp_escena.js";
import { escribirPng } from "./png.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "build", "gatecity", "vistas");
const RUTA = process.argv.find((a) => a.endsWith(".bsp")) ?? "../MSC/assets/msr/maps/gatecity.bsp";
const PORT = 5198;
const KEEP = process.argv.includes("--keep");
const OJOS = 1.7;
const U = UNIDADES_POR_METRO;

if (!existsSync(join(ROOT, "build", "gatecity", "malla.json"))) {
  console.error("falta build/gatecity/malla.json — ejecuta primero: npm run gatecity");
  process.exit(2);
}

// El color de la niebla, en bytes, y SACADO DE LA ESCENA, no copiado: un fondo
// copiado que se desincroniza da coberturas que no significan nada y que además
// parecen razonables.
// El color del fondo se le PREGUNTA al render, no se calcula aqui.
//
// Estaba escrito como `NIEBLA` desglosado en tres bytes, y eso dejo de valer en
// cuanto Gate City paso a dibujar en el espacio del motor: sin la codificacion
// sRGB de salida, el mismo color de niebla llega al framebuffer con otros
// numeros. El control del «mundo apagado» paso de `cobertura 0,00 %` a
// `100,00 %` sin que nada estuviera mal — la sonda comparaba contra un color que
// ya no era el que se pintaba.
//
// Se rellena mas abajo, leyendo un pixel del fotograma con el mundo apagado.
let FONDO = [(NIEBLA >> 16) & 255, (NIEBLA >> 8) & 255, NIEBLA & 255];

// --- las vistas, todas derivadas del archivo ---------------------------------

const bsp = leerBsp(RUTA);
const modelos = leerModelos(bsp);
const texinfos = leerTexinfo(bsp);
const texturas = leerTexturas(bsp);
const entidades = leerEntidades(bsp);
const carasMundo = leerCaras(bsp, modelos[0], texinfos);

/** Un punto en unidades de GoldSrc a metros y ejes de Three.js. */
const aM = (p) => [p[0] / U, p[2] / U, -p[1] / U];

/** La caja del modelo de una entidad, si la tiene. */
const cajaDe = (e) => (/^\*\d+$/.test(e.model ?? "") ? modelos[Number(e.model.slice(1))] : null);
const centroCaja = (m) => aM([(m.mins[0] + m.maxs[0]) / 2, (m.mins[1] + m.maxs[1]) / 2, (m.mins[2] + m.maxs[2]) / 2]);
const centroCara = (c) => {
  const s = c.puntos.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]);
  return aM(s.map((v) => v / c.puntos.length));
};

// El manifiesto que escribió el extractor. Las vistas que dependen de dónde se
// puede ESTAR salen de ahí y no se vuelven a calcular aquí: el punto de llegada y
// los ocho pueblos se los preguntó al árbol BSP, y calcularlos dos veces es tener
// dos sitios donde pueden dejar de ser el mismo.
const manifiesto = JSON.parse(readFileSync(join(ROOT, "build", "gatecity", "malla.json"), "utf8"));

const VISTAS = [];

// 1. La llegada: `ms_player_begin`, con los pies donde el árbol BSP dice que está
//    el suelo, y mirando al rumbo que el visor CALCULA con rayos.
//
//    Las dos cosas costaron una ronda de alguien jugándolo. El punto: aquí se
//    cogía el primer `ms_player_*`, que es una REAPARICIÓN cualquiera, porque
//    escribí que `ms_player_begin` no estaba en el mapa y sí está. Y el rumbo: la
//    entidad trae `angles "0 0 0"`, o sea que no dice nada, y apuntar «al centro
//    del mapa» era apuntar a la pared de al lado — 1,6 m andados en doce segundos,
//    que es exactamente lo que parece un mundo roto.
{
  const p = manifiesto.entrada.pies;
  VISTAS.push({ nombre: "llegada", rumboDelVisor: true, desde: [p[0], p[1] + OJOS, p[2]] });
}

// 2. El pueblo: el suelo del `msarea_town` mayor, que es a donde lleva la tecla T
//    del visor. Y la vista es la de alguien de pie ahí, mirando a lo largo.
//
//    La primera versión ponía la cámara en la esquina de la caja de la zona, y la
//    caja abarca también roca: se metía dentro de la piedra y la toma marcaba el
//    2,1 % de pantalla visible. Un fallo de cámara con pinta de sitio oscuro.
{
  const p = manifiesto.pueblos[0];
  if (p) {
    // Mirando hacia el segundo pueblo, que es una dirección del mapa y no un
    // rumbo elegido.
    const otro = manifiesto.pueblos[1] ?? manifiesto.pueblos[0];
    VISTAS.push({
      nombre: "pueblo",
      desde: [p.escena[0], p.escena[1] + OJOS, p.escena[2]],
      hacia: [otro.escena[0], p.escena[1] + OJOS - 0.15, otro.escena[2]],
    });
    // Y el mismo, desde ocho metros de altura: es donde se ve si el pueblo es un
    // pueblo o son cuatro paredes.
    VISTAS.push({
      nombre: "pueblo-en-picado",
      desde: [p.escena[0] + 6, p.escena[1] + 8, p.escena[2] + 6],
      hacia: [p.escena[0], p.escena[1], p.escena[2]],
    });
  }
}

// 3. La bóveda: la cara de TECHO más grande del mundo, vista desde abajo. Es el
//    16 % de altura libre por encima de ocho metros, o sea el contraste.
{
  const techo = carasMundo
    .filter((c) => c.normal[2] < -0.7 && texturas[c.miptex]?.nombre !== "sky")
    .sort((a, b) => b.area - a.area)[0];
  if (techo) {
    const c = centroCara(techo);
    VISTAS.push({
      nombre: "boveda",
      desde: [c[0], c[1] - 6, c[2] + 10],
      hacia: [c[0], c[1] - 0.5, c[2]],
    });
  }
}

// 4. El suelo ILUMINADO mayor, en picado: es donde se ve si el mapa de luz tiene
//    formas o es un baño de color.
//
//    «Iluminado» no es adorno y lo dijo una captura en negro: la cara de suelo
//    más grande del mapa son 427 m² y está en una zona a la que no llega una sola
//    luz, así que la toma salía vacía —0,3 % de pantalla, 76 colores— y parecía un
//    fallo del visor. El criterio se saca del propio mapa de luz: se le pregunta a
//    cada cara cuánto brilla su parche.
{
  const brilloDe = (c) => {
    if (!tieneLuz(c)) return 0;
    const p = parcheDeLuz(c.puntos, c.texinfo);
    const n = p.ancho * p.alto;
    const d = bsp.lumps.luz.datos;
    let s = 0;
    for (let k = 0; k < n; k++) {
      const o = c.lightofs + k * 3;
      s += 0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2];
    }
    return s / n;
  };
  const suelo = carasMundo
    .filter((c) => c.normal[2] > 0.7 && brilloDe(c) > 40)
    .sort((a, b) => b.area - a.area)[0];
  if (suelo) {
    const c = centroCara(suelo);
    VISTAS.push({
      nombre: "suelo-iluminado",
      desde: [c[0], c[1] + 7, c[2] + 7],
      hacia: [c[0], c[1], c[2]],
    });
  }
}

// 5. El agua: el `func_water` mayor. Es una de las dos clases de textura
//    especiales que el lector distingue, y quieta se lee como suelo azul.
{
  const aguas = entidades
    .filter((e) => e.classname === "func_water" && cajaDe(e))
    .map((e) => cajaDe(e))
    .sort((a, b) => (b.maxs[0] - b.mins[0]) * (b.maxs[1] - b.mins[1]) -
      (a.maxs[0] - a.mins[0]) * (a.maxs[1] - a.mins[1]));
  if (aguas[0]) {
    const c = centroCaja(aguas[0]);
    VISTAS.push({ nombre: "agua", desde: [c[0] + 6, c[1] + 3, c[2] + 6], hacia: [c[0], c[1], c[2]] });
  }
}

// 6. La reja: las caras de `{grate1b`, la única textura CALADA del mapa. Dibujada
//    opaca es una plancha, y eso se ve sólo si se va a mirar.
{
  const iReja = texturas.findIndex((t) => t?.nombre.startsWith("{"));
  const reja = carasMundo.filter((c) => c.miptex === iReja).sort((a, b) => b.area - a.area)[0] ??
    todasLasCarasDeTextura(iReja).sort((a, b) => b.area - a.area)[0];
  if (reja) {
    const c = centroCara(reja);
    const n = [reja.normal[0] / U, reja.normal[2] / U, -reja.normal[1] / U];
    VISTAS.push({
      nombre: "reja-calada",
      desde: [c[0] + n[0] * 120, c[1] + n[1] * 120 + 0.3, c[2] + n[2] * 120],
      hacia: [c[0], c[1], c[2]],
    });
  }
}

// 7. El farol: `pi_lantern` es la textura que `info_texlights` declara emisiva, o
//    sea la fuente de la luz que está horneada. Es donde el mapa de luz tiene que
//    tener su punto más claro, y si no lo tiene, está mal leído.
{
  const iFarol = texturas.findIndex((t) => t?.nombre === "pi_lantern");
  const farol = todasLasCarasDeTextura(iFarol).sort((a, b) => b.area - a.area)[0];
  if (farol) {
    const c = centroCara(farol);
    VISTAS.push({ nombre: "farol", desde: [c[0] + 2.5, c[1] + 1.2, c[2] + 2.5], hacia: [c[0], c[1], c[2]] });
  }
}

// 8. Aérea: y es un CONTROL, no una vista.
//
//    Un mapa de GoldSrc está sellado y todas sus caras miran hacia dentro, así
//    que **desde fuera no se tiene que ver nada**. Que esta toma marque casi cero
//    es lo que dice que el bobinado está bien.
//
//    Y es la sonda que faltaba. Con las caras al revés —como salieron las 12 680
//    a la primera— esta misma vista enseñaba la silueta del mapa entero, porque se
//    veían los reversos: una foto preciosa de un mundo que se atraviesa. La
//    primera versión de esta vista se llamaba «aérea» y yo la leí como «se ve el
//    plano del mapa desde arriba, bien».
{
  const c = aM(modelos[0].mins.map((v, i) => (v + modelos[0].maxs[i]) / 2));
  VISTAS.push({
    nombre: "desde-fuera", control: true,
    desde: [c[0], c[1] + 120, c[2] + 40], hacia: [c[0], c[1], c[2]],
  });
}


// 9. El RAYO DE LUZ: el `func_illusionary` aditivo mayor.
//
//    Existe porque lo encontró quien comparó las capturas: «los rayos de luz en el
//    templo del juego son transparentes pero veo que en el demo es sólido». Eran 31
//    entidades con `rendermode 5` dibujadas opacas, o sea bloques amarillos macizos
//    en mitad del templo — y un bloque amarillo bajo un tragaluz **parece
//    deliberado**, que es por lo que aguantó tantas rondas.
//
//    La toma se mide con la pareja de siempre: cuántos píxeles cambian al apagarlo.
//    Un rayo aditivo que se ve tiene que cambiar la pantalla; uno opaco también, así
//    que lo que discrimina es MIRARLO — y por eso esta vista existe.
{
  let mejor = null;
  for (const e of entidades) {
    if (Number(e.rendermode ?? 0) !== 5 || !/^\*\d+$/.test(e.model ?? "")) continue;
    const m = modelos[Number(e.model.slice(1))];
    const cs = leerCaras(bsp, m, texinfos);
    const area = cs.reduce((a, c) => a + c.area, 0);
    if (!mejor || area > mejor.area) mejor = { area, m, cs };
  }
  if (mejor) {
    const c = aM([
      (mejor.m.mins[0] + mejor.m.maxs[0]) / 2,
      (mejor.m.mins[1] + mejor.m.maxs[1]) / 2,
      (mejor.m.mins[2] + mejor.m.maxs[2]) / 2,
    ]);
    VISTAS.push({
      nombre: "rayo-de-luz",
      desde: [c[0] + 5, c[1] + 1, c[2] + 5],
      hacia: [c[0], c[1], c[2]],
    });
  }
}

// 10. LOS ADORNOS, de cerca y a tamano de leerlos.
//
//     Los 101 `env_model` son lo ultimo que faltaba, y un `.mdl` mal leido no da
//     error: da un adorno. Las cuatro formas de estar mal —el bobinado de las
//     tiras, las UV en pixeles, los huesos sin componer y el orden del
//     cuaternion— salen todas como «un mueble raro», y a veinte metros un mueble
//     raro pasa por un mueble.
//
//     Asi que la vista se planta a tres metros del adorno con mas triangulos que
//     tenga el mapa, a la altura de los ojos, con el sitio elegido por el propio
//     manifiesto y no a mano.
{
  const ad = manifiesto.adornos;
  if (ad?.grupos?.length) {
    // El centro del grupo con mas triangulos, sacado de las posiciones que ya
    // estan en el binario. Es el adorno que mas superficie ocupa, o sea el que
    // mas dice si esta bien.
    const bin = readFileSync(join(ROOT, "build", "gatecity", manifiesto.bin.archivo));
    const t = manifiesto.bin.tramos.adornoPositions;
    const pos = new Float32Array(bin.buffer, bin.byteOffset + t.off, t.n);
    const mayor = ad.grupos.reduce((m, g) => (g.count > m.count ? g : m));
    let x = 0, y = 0, z = 0, ymin = Infinity;
    for (let i = mayor.start; i < mayor.start + mayor.count; i++) {
      x += pos[i * 3]; y += pos[i * 3 + 1]; z += pos[i * 3 + 2];
      if (pos[i * 3 + 1] < ymin) ymin = pos[i * 3 + 1];
    }
    const n = mayor.count;
    const c = [x / n, y / n, z / n];
    // El SITIO desde donde mirarlo se MIDE, no se elige.
    //
    // La primera version ponia la camara en la diagonal +X +Z a dos metros, y ese
    // punto cayo dentro de la habitacion de al lado: la toma salio mirando a una
    // pared de madera, con el adorno detras. Un fotograma perfectamente nitido de
    // ningun sitio — el mismo fallo que ya tuvo la vista del pueblo.
    //
    // Asi que se prueban ocho puntos alrededor y se elige el que mas cambia al
    // apagar los adornos, que es exactamente la magnitud que luego se reporta.
    VISTAS.push({
      nombre: "adorno", centro: c, suelo: ymin,
      rodear: [2.2, 3.5],
      desde: [c[0] + 2.2, ymin + 1.5, c[2] + 2.2],
      hacia: c,
    });
  }
}

// 11. `--sinluz` NO tiene aqui su control, y es a proposito.
//
//     La perilla manda las 1 133 caras sin mapa de luz al luxel BLANCO para poder
//     mirar donde estan, y lo primero que puse fue una vista plantada delante de
//     la cara sin mapa de luz mayor: con la perilla tenia que salir blanca y sin
//     ella negra. Salio IDENTICA las dos veces, hasta en el numero de colores.
//
//     Un control que da el mismo numero en los dos lados no controla nada, y
//     perseguir por que —la cara elegida, el punto de vista, el glow que tapa— es
//     perseguir la sonda en vez del asunto. El oraculo de esta perilla no es una
//     captura: es contar cuantos vertices de la malla apuntan a cada luxel
//     reservado, que es exacto, va en las dos direcciones y no depende de donde se
//     ponga una camara. Esta en `test/bsp.test.mjs`.

// 12. LAS DOS CAPTURAS DE QUIEN LO JUEGA, reproducidas desde el archivo.
//
//     Vinieron con la posicion escrita en el HUD, y eso las convierte en algo que
//     no era ninguna de las nueve anteriores: un fotograma que se puede volver a
//     sacar y MEDIR. Las nueve mias las elijo yo, y por tanto miden lo que yo creo
//     que hay que mirar; estas dos miden lo que de verdad se ve jugando.
//
//     El HUD imprime `aEscena(p) * 39,37`, o sea [x, z, -y] en unidades. Deshecho
//     el cambio de ejes se recupera el punto del `.bsp`, y de ahi la camara.
//
//     El rumbo NO viene en el HUD, asi que se barren ocho y se guarda el que mas
//     negro puro tiene: es la unica forma honesta de buscar el problema que
//     senalan en vez de una vista comoda.
for (const [nombre, hud] of [
  ["captura-pueblo", [-411, -575, 602]],
  ["captura-tunel", [-187, -575, -1342]],
  // La CALLE. Esta es distinta de las otras dos y es la que manda ahora: es el
  // unico sitio del que hay una captura del JUEGO ORIGINAL, asi que es donde la
  // iluminacion se puede calibrar contra un histograma en vez de contra una
  // opinion. Ver `tools/comparar.mjs` y `build/referencia/juego-calle.png`.
  ["captura-calle", [-217, -575, 577]],
]) {
  // del HUD al .bsp: [x, z, -y] -> [x, y, z]
  //
  // Y hay que subir los ojos. El HUD imprime `player.feet`, no `player.eye`, asi
  // que poner la camara en la coordenada del HUD la pone a ras de suelo — y el
  // glow, que es una luz puntual a dos metros, quema el suelo entero. El primer
  // intento salia con la mitad de abajo de la pantalla en amarillo blanco y yo
  // podia haberlo leido como «hay demasiado overbright».
  const pies = aM([hud[0], -hud[2], hud[1]]);
  VISTAS.push({ nombre, desde: [pies[0], pies[1] + OJOS, pies[2]], barrerRumbo: true });
  // Y la calle, ademas, con rumbo FIJO: la del barrido busca el peor rumbo —el de
  // mas negro— y eso sirve para cazar agujeros, no para comparar con una captura
  // del juego que mira a una direccion concreta.
  if (nombre === "captura-calle") {
    const camara = { ojo: [hud[0], -hud[2], hud[1] + OJOS * U], yaw: Math.PI, pitch: 0 };
    VISTAS.push({ nombre: "calle-como-el-juego", desde: [pies[0], pies[1] + OJOS, pies[2]], camara });
    // Y la MISMA sin el glow, que es la que se compara con la captura del juego:
    // en ella el jugador no lleva el hechizo puesto, asi que compararla con la
    // nuestra con glow es comparar dos iluminaciones distintas y culpar a la
    // horneada de lo que pone la puntual.
    VISTAS.push({
      nombre: "calle-sin-glow", sinGlow: true,
      desde: [pies[0], pies[1] + OJOS, pies[2]], camara,
    });
  }
}

function todasLasCarasDeTextura(i) {
  if (i < 0) return [];
  const out = [];
  for (const m of modelos) for (const c of leerCaras(bsp, m, texinfos)) if (c.miptex === i) out.push(c);
  return out;
}

/**
 * De un punto de vista en metros a lo que pide `probe.fly`.
 *
 * El yaw sale de invertir la fórmula de `player.js` —con yaw 0 se mira hacia −Z y
 * el avance es (−sen, −cos)—, no de probar signos hasta que cuadre. Y `fly` recibe
 * unidades de GoldSrc, que es lo que el nivel declara en `unitsPerMetre`.
 */
function vista(desde, hacia) {
  const d = [hacia[0] - desde[0], hacia[1] - desde[1], hacia[2] - desde[2]];
  const plano = Math.hypot(d[0], d[2]);
  return {
    ojo: [desde[0] * U, -desde[2] * U, desde[1] * U],
    yaw: Math.atan2(-d[0], -d[2]),
    pitch: Math.atan2(d[1], plano),
  };
}

// --- el arnés ----------------------------------------------------------------

function arrancaServidor() {
  const proc = spawn(
    process.execPath,
    [join(ROOT, "node_modules", "vite", "bin", "vite.js"), "--port", String(PORT), "--strictPort"],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] }
  );
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("vite no arrancó")), 30000);
    proc.stdout.on("data", (d) => {
      if (d.toString().includes("ready in")) { clearTimeout(timer); resolve(proc); }
    });
    proc.on("error", reject);
  });
}

const server = await arrancaServidor();
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: !KEEP,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
const errores = [];
page.on("pageerror", (e) => errores.push(String(e?.message ?? e)));
page.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });

await page.goto(`http://localhost:${PORT}/?map=gatecity`, { waitUntil: "load" });
await page.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
await page.evaluate(() => window.probe.pause());
FONDO = await page.evaluate(() => {
  const p = window.probe;
  p.setMapa(false); p.setCarteles(false); p.setAdornos(false);
  p.fly([0, 0, 0], 0, 0);
  const c = document.getElementById("view");
  const gl = c.getContext("webgl2") ?? c.getContext("webgl");
  const px = new Uint8Array(4);
  gl.readPixels(1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  p.setMapa(true); p.setCarteles(true); p.setAdornos(true);
  return [px[0], px[1], px[2]];
});
const texto = await page.evaluate(() => document.getElementById("status").textContent);

/** Dibuja y mide en la MISMA tarea: separarlo devuelve NEGRO, no el fondo. */
async function medir(v) {
  return page.evaluate(
    ({ bg, ojo, yaw, pitch }) => {
      const canvas = document.getElementById("view");
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      const w = canvas.width, h = canvas.height;
      const leer = () => {
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return px;
      };
      // El orden importa, y el primer intento lo tenía mal.
      //
      // Lo que aporta el MAPA DE LUZ hay que medirlo sobre el mapa horneado, o sea
      // con el glow APAGADO. Midiéndolo con el glow puesto, el glow tapa el efecto
      // de apagar la luz horneada y la sonda decía «el mapa de luz casi no cambia
      // nada en 5 de 9 vistas» — acusando a lo que sí funciona.
      window.probe.fly(ojo, yaw, pitch);
      const con = leer();                       // lo que se ve: mapa + glow
      window.probe.setGlow(false);
      window.probe.fly(ojo, yaw, pitch);
      const sinGlow = leer();                   // el mapa como lo horneó el compilador
      window.probe.setLuz(false);
      window.probe.fly(ojo, yaw, pitch);
      const sinLuz = leer();                    // y sin su luz horneada
      window.probe.setLuz(true);
      window.probe.setTexturas(false);
      window.probe.fly(ojo, yaw, pitch);
      const sinTex = leer();                    // y sin texturas
      window.probe.setTexturas(true);
      window.probe.setGlow(true);
      window.probe.fly(ojo, yaw, pitch);

      const colores = new Set();
      const luces = [];
      const sinLuces = [];
      let cobertura = 0, visible = 0, cambiaLuz = 0, cambiaTex = 0, visibleSinGlow = 0;
      let negro = 0, cambiaGlow = 0;
      const dif = (a, b, i) =>
        Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      for (let i = 0; i < con.length; i += 4) {
        if (Math.abs(con[i] - bg[0]) + Math.abs(con[i + 1] - bg[1]) + Math.abs(con[i + 2] - bg[2]) > 24) {
          cobertura++;
          colores.add((con[i] << 16) | (con[i + 1] << 8) | con[i + 2]);
        }
        // Contra `sinGlow`, no contra `con`: los dos son el mapa horneado.
        if (dif(sinGlow, sinLuz, i) > 24) cambiaLuz++;
        if (dif(sinGlow, sinTex, i) > 24) cambiaTex++;
        const l = 0.2126 * con[i] + 0.7152 * con[i + 1] + 0.0722 * con[i + 2];
        luces.push(l);
        if (l > 32) visible++;
        // Negro PURO, que es distinto de oscuro y es lo que se reprocha.
        //
        // Un mapa de luz horneado no da nunca cero: el atlas tiene la mediana en
        // 137 y el percentil 10 en 85. Un pixel a cero sale de otra cosa — una
        // cara sin mapa de luz pintada de negro liso, o una textura negra. Asi que
        // «esta oscuro» y «esta negro» son dos reproches con dos causas, y hasta
        // ahora la sonda solo sabia medir el primero.
        if (l < 4) negro++;
        if (dif(con, sinGlow, i) > 24) cambiaGlow++;
        const g = 0.2126 * sinGlow[i] + 0.7152 * sinGlow[i + 1] + 0.0722 * sinGlow[i + 2];
        sinLuces.push(g);
        if (g > 32) visibleSinGlow++;
      }
      luces.sort((a, b) => a - b);
      sinLuces.sort((a, b) => a - b);
      const n = w * h;
      return {
        cobertura: cobertura / n,
        visible: visible / n,
        colores: colores.size,
        aportaLuz: cambiaLuz / n,
        aportaTextura: cambiaTex / n,
        brilloMediano: luces[Math.floor(n / 2)],
        brilloP90: luces[Math.floor(n * 0.9)],
        visibleSinGlow: visibleSinGlow / n,
        brilloSinGlow: sinLuces[Math.floor(n / 2)],
        quemado: luces.filter((x) => x > 250).length / n,
        negroPuro: negro / n,
        aportaGlow: cambiaGlow / n,
      };
    },
    { bg: FONDO, ...v.camara ?? (v.rumboDelVisor ? await vistaDelVisor(v) : vista(v.desde, v.hacia)) }
  );
}

/**
 * De una vista con `barrerRumbo`, la camara del rumbo con mas negro puro.
 *
 * Buscar el PEOR rumbo y no el mejor, a proposito: la vista existe para medir un
 * reproche, y una vista elegida por lo bien que sale no mide nada. Con el rumbo
 * mas oscuro, si el numero sale bajo, sale bajo en los ocho.
 */
async function peorRumbo(v) {
  let peor = null;
  for (let i = 0; i < 8; i++) {
    const yaw = (i * Math.PI) / 4;
    const camara = { ojo: [v.desde[0] * U, -v.desde[2] * U, v.desde[1] * U], yaw, pitch: 0 };
    const m = await medir({ ...v, camara });
    if (!peor || m.negroPuro > peor.m.negroPuro) peor = { camara, m, yaw };
  }
  return peor;
}

/** Una vista que toma el rumbo del propio visor, no de aquí. */
async function vistaDelVisor(v) {
  const yaw = await page.evaluate(() => window.probe.rumbo);
  return {
    ojo: [v.desde[0] * U, -v.desde[2] * U, v.desde[1] * U],
    yaw,
    pitch: 0,
  };
}

console.log(`\n${texto}\n`);
const fichas = [];
/**
 * De una vista con `rodear`, el punto desde el que mas se ve lo que se quiere ver.
 *
 * Se prueban ocho angulos por cada radio y se mide cuanto CAMBIA la pantalla al
 * apagar los adornos. Es la misma vara que luego se reporta, y por tanto la vista
 * no puede estar elegida para que el numero salga bien por otro motivo: si el
 * mejor de dieciseis puntos da cero, es que no se dibujan.
 */
async function mejorSitio(v) {
  let mejor = null;
  for (const r of v.rodear) {
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const desde = [v.centro[0] + Math.cos(a) * r, v.suelo + 1.5, v.centro[2] + Math.sin(a) * r];
      const camara = vista(desde, v.centro);
      await page.evaluate(() => window.probe.setAdornos(true));
      const con = await medir({ camara });
      await page.evaluate(() => window.probe.setAdornos(false));
      const sin = await medir({ camara });
      await page.evaluate(() => window.probe.setAdornos(true));
      const cambia = Math.abs(con.colores - sin.colores) + Math.abs(con.cobertura - sin.cobertura) * 10000;
      if (!mejor || cambia > mejor.cambia) mejor = { camara, cambia, desde };
    }
  }
  return mejor;
}

for (const v of VISTAS) {
  if (v.rodear) {
    const m = await mejorSitio(v);
    v.camara = m.camara;
    v.desde = m.desde;
  }
  if (v.barrerRumbo) {
    const p = await peorRumbo(v);
    v.camara = p.camara;
    v.rumboGrados = Math.round((p.yaw * 180) / Math.PI);
  }
  if (v.sinGlow) await page.evaluate(() => window.probe.setGlow(false));
  const m = await medir(v);
  if (v.sinGlow) {
    // `medir()` vuelve a encender el glow al final, asi que la captura se saca
    // aparte y con el apagado a proposito.
    await page.evaluate(({ ojo, yaw, pitch }) => {
      window.probe.setGlow(false);
      window.probe.fly(ojo, yaw, pitch);
    }, v.camara);
  }
  await page.screenshot({ path: join(OUT, `${v.nombre}.png`) });
  // Y el fotograma CRUDO, leído del framebuffer y sin el HUD.
  //
  // Hace falta porque una captura de pantalla lleva encima la caja de controles y
  // la barra de estado, que son DOM. Midiendo sobre ella, la sonda del perfil de
  // las lámparas encontró su punto más claro en (908, 26) —la esquina de la caja
  // de controles— y dio «el punto más claro del mapa vale 72» durante dos vueltas.
  // Para comparar con una captura del juego hace falta el mapa, no la interfaz.
  if (v.sinGlow || v.crudo) {
    const crudo = await page.evaluate(() => {
      const c = document.getElementById("view");
      const gl = c.getContext("webgl2") ?? c.getContext("webgl");
      const px = new Uint8Array(c.width * c.height * 4);
      gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return { datos: Array.from(px), ancho: c.width, alto: c.height };
    });
    // `readPixels` devuelve la primera fila ABAJO. Se le da la vuelta.
    const vuelta = new Uint8Array(crudo.datos.length);
    for (let y = 0; y < crudo.alto; y++) {
      const src = (crudo.alto - 1 - y) * crudo.ancho * 4;
      vuelta.set(crudo.datos.slice(src, src + crudo.ancho * 4), y * crudo.ancho * 4);
    }
    escribirPng(join(OUT, `${v.nombre}-crudo.png`), vuelta, crudo.ancho, crudo.alto);
  }
  if (v.sinGlow) await page.evaluate(() => window.probe.setGlow(true));
  fichas.push({ vista: v.nombre, control: Boolean(v.control), rumbo: v.rumboGrados, ...m });
  console.log(
    `  ${v.nombre.padEnd(16)} se VE ${(m.visible * 100).toFixed(1).padStart(5)} %  ` +
      `(sin glow ${(m.visibleSinGlow * 100).toFixed(1).padStart(5)} %)  ` +
      `brillo ${String(Math.round(m.brilloMediano)).padStart(3)}  ` +
      `NEGRO ${(m.negroPuro * 100).toFixed(1).padStart(5)} %  ` +
      `aporta la luz ${(m.aportaLuz * 100).toFixed(1).padStart(5)} %  ` +
      `el glow ${(m.aportaGlow * 100).toFixed(1).padStart(5)} %  ` +
      `${String(m.colores).padStart(6)} colores`
  );
}

// --- lo que aportan los ADORNOS ----------------------------------------------
//
// La vara es la misma que la del kit en Corinth: no la cobertura —que en un
// interior ya esta saturada— sino cuantos pixeles CAMBIAN al quitarlos. Y se mide
// en la vista que los tiene delante, no de media: 101 adornos repartidos por un
// mapa de 33 000 m2 no salen en la mayoria de las tomas, y promediarlos diria
// «los adornos no aportan nada» midiendo sitios donde no hay ninguno.
const vistaAdorno = VISTAS.find((v) => v.nombre === "adorno");
let aportanAdornos = null;
if (vistaAdorno) {
  const con = await medir(vistaAdorno);
  await page.evaluate(() => window.probe.setAdornos(false));
  const sin = await medir(vistaAdorno);
  await page.evaluate(() => window.probe.setAdornos(true));
  const cuenta = await page.evaluate(() => window.probe.adornos);
  // Cuantos pixeles CAMBIAN, contados uno a uno en la misma tarea.
  //
  // El comentario de arriba ya decia «no la cobertura, que en un interior ya esta
  // saturada» y el codigo restaba coberturas igualmente: `|0,991 − 0,991| = 0,000`
  // en una vista plantada a tres metros del adorno mayor, con el aviso «o no se
  // dibuja, o la vista no lo enfoca» impreso debajo. Se dibujaba. La leccion de
  // Corinth estaba escrita y no estaba aplicada.
  const cambiados = await page.evaluate(({ ojo, yaw, pitch }) => {
    const c = document.getElementById("view");
    const gl = c.getContext("webgl2") ?? c.getContext("webgl");
    const leer = () => {
      const px = new Uint8Array(c.width * c.height * 4);
      gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return px;
    };
    window.probe.setAdornos(true);
    window.probe.fly(ojo, yaw, pitch);
    const a = leer();
    window.probe.setAdornos(false);
    window.probe.fly(ojo, yaw, pitch);
    const b = leer();
    window.probe.setAdornos(true);
    window.probe.fly(ojo, yaw, pitch);
    let n = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) n++;
    }
    return n / (c.width * c.height);
  }, vistaAdorno.camara);
  aportanAdornos = {
    ...cuenta,
    cambia: cambiados,
    colores: con.colores - sin.colores,
    visible: con.visible - sin.visible,
  };
  console.log(`\n  los adornos              ${cuenta.n} colocados de ${cuenta.ficheros} .mdl, ` +
    `${cuenta.triangulos} triángulos; en la vista que los tiene delante ocupan el ` +
    `${(aportanAdornos.cambia * 100).toFixed(1)} % de la pantalla y añaden ${aportanAdornos.colores} colores`);
  if (aportanAdornos.cambia < 0.01) {
    console.log(`MIRAR: plantado a tres metros del adorno mayor, quitarlo no cambia nada. O no se dibuja, o la vista no lo enfoca.`);
  }
}

// --- el control del bobinado: de frente contra por detrás --------------------
//
// Desde dentro del pueblo, que es una sala cerrada. Con el bobinado bien, la cara
// frontal tapa la pantalla y la trasera casi nada.
// Y la vara es `aportaLuz` —qué fracción de la pantalla CAMBIA al apagar el mapa
// de luz, o sea qué fracción ES geometría iluminada— y no `visible`, que mide
// luminancia. Con `visible` daba 9,8 % de frente contra 7,3 % por detrás y acusaba
// al código bueno: la sala es oscura de por sí, así que la mayoría de sus píxeles
// no pasan de 32 mire la cara hacia donde mire. Cuarto error de sonda de la sesión
// y el tercero por medir la cosa equivocada con la sonda bien puesta.
const vistaSala = VISTAS.find((v) => v.nombre === "suelo-iluminado") ?? VISTAS[0];
const bobinado = { frontal: (await medir(vistaSala)).aportaLuz };
await page.evaluate(() => window.probe.setLado(true));
bobinado.trasera = (await medir(vistaSala)).aportaLuz;
await page.screenshot({ path: join(OUT, "control-bobinado.png") });
await page.evaluate(() => window.probe.setLado(false));

// --- el control: con el mundo apagado, niebla y nada más ---------------------
await page.evaluate(() => { window.probe.setMapa(false); window.probe.setCarteles(false); });
const vacio = await medir(VISTAS[0]);
await page.screenshot({ path: join(OUT, "control-vacio.png") });
await page.evaluate(() => { window.probe.setMapa(true); window.probe.setCarteles(true); });

// --- y se anda: lo que ninguna captura dice ----------------------------------
//
// Doce segundos con la W puesta desde el punto de llegada. No mide bonito: mide
// que el suelo esté donde parece y que el jugador no nazca dentro de la roca.
const marcha = await page.evaluate(async () => {
  const p = window.probe;
  const pies = [p.level.startUnits[0], p.level.startUnits[1], p.level.startUnits[2] - 18];
  const rumbos = [];
  for (let i = 0; i < 8; i++) {
    const yaw = (i / 8) * Math.PI * 2;
    p.resume();
    p.place(pies, yaw, 0);
    const a = p.player.feet.slice();
    p.keys.add("KeyW");
    await new Promise((r) => setTimeout(r, 2500));
    p.keys.delete("KeyW");
    const b = p.player.feet.slice();
    p.pause();
    rumbos.push({
      yaw: Math.round((yaw * 180) / Math.PI),
      andado: Math.hypot(b[0] - a[0], b[2] - a[2]),
      enSuelo: p.player.grounded,
      caida: a[1] - b[1],
    });
  }
  // Y la de verdad: desde el rumbo que el visor calcula, doce segundos.
  p.resume();
  p.restart();
  const a = p.player.feet.slice();
  p.keys.add("KeyW");
  await new Promise((r) => setTimeout(r, 12000));
  p.keys.delete("KeyW");
  const b = p.player.feet.slice();
  p.pause();
  return {
    rumbos,
    mejor: rumbos.reduce((m, r) => (r.andado > m.andado ? r : m)),
    delVisor: {
      yaw: Math.round((p.rumbo * 180) / Math.PI),
      andado: Math.hypot(b[0] - a[0], b[2] - a[2]),
      enSuelo: p.player.grounded,
      desde: a, hasta: b,
    },
  };
});
await page.screenshot({ path: join(OUT, "andando.png") });

writeFileSync(join(OUT, "fichas.json"), JSON.stringify({ fichas, vacio, bobinado, marcha, errores }, null, 2));

console.log(`\n  control bobinado         de frente hay geometría en el ${(bobinado.frontal * 100).toFixed(1)} % ` +
  `de la pantalla, por detrás en el ${(bobinado.trasera * 100).toFixed(1)} %`);
console.log(`  control (mundo apagado)  se ve ${(vacio.visible * 100).toFixed(2)} %, cobertura ${(vacio.cobertura * 100).toFixed(2)} %`);
console.log(`  marcha, 8 rumbos x 2,5 s ${marcha.rumbos.map((r) => r.andado.toFixed(1)).join(" ")} m ` +
  `-> el mejor ${marcha.mejor.andado.toFixed(1)} m a ${marcha.mejor.yaw}°`);
console.log(`  marcha del visor, 12 s   ${marcha.delVisor.andado.toFixed(1)} m a ${marcha.delVisor.yaw}°, ` +
  `acabó ${marcha.delVisor.enSuelo ? "en suelo" : "EN EL AIRE"}`);
if (errores.length) console.log(`  errores de consola: ${errores.slice(0, 4).join(" | ")}`);

await browser.close();
if (!KEEP) server.kill();

// --- el veredicto ------------------------------------------------------------
let mal = 0;
console.log();
if (vacio.cobertura > 0.02) {
  console.log(`FALLO DE LA SONDA: con el mundo apagado se ve el ${(vacio.cobertura * 100).toFixed(1)} %`);
  mal++;
}
if (errores.length) {
  console.log(`FALLO: la consola del navegador escupió ${errores.length} errores`);
  mal++;
}
const sinAporteDeLuz = fichas.filter((f) => f.aportaLuz < 0.2);
if (sinAporteDeLuz.length > fichas.length / 2) {
  console.log(
    `FALLO: el mapa de luz casi no cambia nada en ${sinAporteDeLuz.length} de ${fichas.length} vistas. ` +
      `Si apagarlo no cambia la pantalla, no se está aplicando.`
  );
  mal++;
}
// El control del bobinado. Ver `probe.setLado()`: desde DENTRO de una sala, con
// el bobinado bien, la cara frontal tapa mucho más que la trasera.
if (bobinado.frontal < bobinado.trasera * 1.5) {
  console.log(
    `FALLO DEL BOBINADO: de frente hay geometría en el ${(bobinado.frontal * 100).toFixed(1)} % ` +
      `de la pantalla y por detrás en el ${(bobinado.trasera * 100).toFixed(1)} %. Desde dentro de ` +
      `una sala la cara frontal tiene que taparla casi entera: si empatan, las caras van al revés.`
  );
  mal++;
}
// Lo que se ve CON el glow, que es como se jugaba. Sin él la referencia es un
// mapa a oscuras a propósito: el 63 % de su superficie iluminada está por debajo
// de 32/255, y por eso el juego daba un hechizo para verlo.
const reales = fichas.filter((f) => !f.control);
const flojas = reales.filter((f) => f.visible < 0.25);
if (flojas.length) {
  console.log(`MIRAR: ${flojas.length} vistas donde se ve menos del 25 % con el glow — ` +
    flojas.map((f) => `${f.vista} ${(f.visible * 100).toFixed(1)} %`).join(", "));
}
const media = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
console.log(
  `
  lo que aporta el glow    de media, se ve el ${(media(reales.map((f) => f.visible)) * 100).toFixed(1)} % ` +
    `de la pantalla con él y el ${(media(reales.map((f) => f.visibleSinGlow)) * 100).toFixed(1)} % sin él`
);
const quemadas = fichas.filter((f) => f.quemado > 0.15);
if (quemadas.length) {
  console.log(`MIRAR: ${quemadas.length} vistas con más del 15 % quemado — baja el overbright`);
}
// El control de esta sonda: que el MEJOR de ocho rumbos ande. Si ninguno anda, el
// mundo no es transitable; si anda alguno y el del visor no, lo que falla es el
// rumbo, no el mundo. Sin la pareja, un solo número no distingue las dos cosas —
// y la primera vez dijo «1,6 m» con el mundo perfectamente andable.
if (marcha.mejor.andado < 3) {
  console.log(`FALLO: ninguno de los ocho rumbos anda más de 3 m. El mundo no es transitable.`);
  mal++;
} else if (marcha.delVisor.andado < 3) {
  console.log(`MIRAR: el mundo anda (${marcha.mejor.andado.toFixed(1)} m) pero el rumbo de llegada no.`);
}
console.log(`\n  ${VISTAS.length} fotogramas en build/gatecity/vistas/ — y hay que MIRARLOS.\n`);
process.exit(mal ? 1 : 0);
