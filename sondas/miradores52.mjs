// ELEGIR LOS MIRADORES DEL MENÚ, MIRANDO.
//
//   npm run sonda:miradores52
//
// Esto NO es un control: no dice «bien» ni «mal». Es la herramienta con la que
// se rellena `MIRADORES` en `src/play/miradores.js`, y está aquí porque la
// alternativa —escribir coordenadas leyendo el `.bsp` y confiar— es como se
// consigue una cámara de menú que se pasa noventa segundos mirando una pared.
//
// Lo que hace:
//
//   1. arranca el juego, abre el menú y le pone miradores de prueba;
//   2. fotografía cada uno desde varios puntos de su recorrido;
//   3. junta todo en UNA hoja de contactos, `build/gatecity/vistas/miradores52.png`.
//
// Y conduce **el mismo `paseoMenu` que usa el juego**, por `probe.miradores`. Una
// sonda que volara por su cuenta mediría un recorrido que el jugador no va a
// ver, que es justo el aviso de CLAUDE.md sobre las sondas que entran por un
// atajo.
//
// Las coordenadas van como las acepta la tabla: **ejes de la escena (los de
// Three) multiplicados por las unidades por metro**. `probe.miradores.donde()`
// las devuelve ya en esa forma, para que lo que se imprime se pueda pegar en la
// tabla sin convertir nada a mano — que es donde se pierden los signos.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { esNuestro, liberarPuerto, arrancarVite } from "./mismo.mjs";
import { mkdirSync, readFileSync } from "node:fs";

const PORT = 5614;   // el 98: era 5219, compartido con otra sonda (test/puertos98.test.mjs)
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (habia ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = await arrancarVite(PORT);
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
const nav = await chromium.launch();
// La hoja de contactos se arma con capturas pequeñas: doce a tamaño completo son
// veinte megas de PNG para mirarlas una vez.
const ANCHO = 520, ALTO = 325;
const pag = await nav.newPage({ viewport: { width: ANCHO, height: ALTO } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));

// SIN `?map=`: se entra por donde entra el jugador, y eso deja el menú abierto
// con el mapa ya cargado detrás. Es la condición que se mide, no un atajo.
await pag.goto(`http://localhost:${PORT}/`, { waitUntil: "load" });
await esNuestro(pag, PORT);
mkdirSync("build/gatecity/vistas", { recursive: true });
await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });

const U = JSON.parse(readFileSync("build/gatecity/malla.json", "utf8")).unidadesPorMetro;
const malla = JSON.parse(readFileSync("build/gatecity/malla.json", "utf8"));
// El pueblo más grande del mapa, que es la plaza de Gate City. `escena` viene en
// metros; la tabla los quiere multiplicados por U.
const plaza = malla.pueblos.slice().sort((a, b) => b.area - a.area)[0];
const C = plaza.escena.map((v) => v * U);
console.log(`\n  la plaza (pueblo ${plaza.indice}, ${Math.round(plaza.area)} m2) en [${C.map(Math.round).join(", ")}]`);
console.log(`  la caja del mapa  min [${malla.caja.min.map((v) => Math.round(v * U)).join(", ")}]  max [${malla.caja.max.map((v) => Math.round(v * U)).join(", ")}]`);

/**
 * Los candidatos: un anillo alrededor de la plaza a dos alturas.
 *
 * No se eligen «a ojo pero en código»: se barre y se mira. Lo que decide es la
 * hoja de contactos, y lo que se busca es lo que pedía el mockup —una silueta
 * fuerte a contraluz contra el cielo—, o sea cielo arriba, algo oscuro delante
 * y profundidad; no una pared a dos metros ni un descampado.
 */
// El barrido se elige por la línea de órdenes: `-- 1`, `-- 2`… Se itera, y cada
// uno queda escrito con lo que enseñó, que es lo que pide el cuaderno.
const BARRIDO = process.argv[2] ?? "2";

/**
 * DÓNDE HAY CIELO, que es la pregunta que el barrido 1 contestó mal.
 *
 * El barrido 1 puso un anillo de 38 m alrededor de la plaza a 4 y a 11 m de
 * alto, mirando al centro. Las dieciséis salieron **sin un píxel de cielo** y la
 * mitad dentro de una pared: 38 m no sacan la cámara del pueblo, y mirar al
 * centro la deja siempre apuntando hacia abajo y hacia dentro.
 *
 * `sondas/dondecielo.mjs` lo contesta sin abrir el navegador, leyendo las caras
 * con textura `sky*` del `.bsp`: **137 caras, la mayor de 427 m2**, y todas
 * arriba —el cielo de Gate City es un techo agujereado, no un horizonte—. La
 * mayor está en GoldSrc (1785, 1142, 304), que en los ejes de la escena por U
 * es [1785, 304, -1142].
 *
 * O sea que aquí no hay «silueta a contraluz contra el cielo» a la altura de los
 * ojos: si se quiere cielo hay que mirar HACIA ARRIBA, desde debajo del hueco.
 */
const CIELO = [1785, 304, -1142];

const candidatos = [];
if (BARRIDO === "1") {
  const RADIO = 38 * U, ANGULOS = 8;
  for (const alto of [4 * U, 11 * U]) {
    for (let i = 0; i < ANGULOS; i++) {
      const a = (i / ANGULOS) * Math.PI * 2;
      candidatos.push({
        nombre: `r${Math.round(alto / U)}m·${Math.round((a * 180) / Math.PI)}°`,
        // Dos puntos juntos: `paseoDeMenu` pide dos para valer, y para una foto
        // fija basta con que el segundo esté al lado.
        puntos: [
          [C[0] + Math.cos(a) * RADIO, C[1] + alto, C[2] + Math.sin(a) * RADIO],
          [C[0] + Math.cos(a + 0.05) * RADIO, C[1] + alto, C[2] + Math.sin(a + 0.05) * RADIO],
        ],
        mirar: [C[0], C[1] + 2 * U, C[2]],
        segundos: 90,
      });
    }
  }
} else if (BARRIDO === "3") {
  // ── BARRIDO 3: LA CALLE, que es lo que este mapa de verdad tiene ──────────
  //
  // Los barridos 1 y 2 buscaban el encuadre del mockup —una silueta a contraluz
  // contra el cielo— y ninguno lo encontró, porque **en Gate City no existe**:
  // el barrido 2 fue derecho a la mayor cara de cielo del mapa y lo que hay
  // debajo son helechos y roca. Gate City es un pueblo de noche con faroles.
  //
  // Así que el encuadre que se busca cambia, y se dice en vez de disimularlo:
  // una calle en profundidad, con faroles que den puntos de luz cálidos sobre
  // un fondo oscuro. Los cuatro sitios salen del barrido 1, que son los que
  // salieron legibles; lo que se barre aquí es la ALTURA y la distancia.
  const SITIOS = [
    { nombre: "mercado", a: Math.PI * 0.25 },
    { nombre: "puerta", a: Math.PI * 1.25 },
    { nombre: "muralla", a: Math.PI * 1.0 },
    { nombre: "cuesta", a: Math.PI * 1.5 },
  ];
  for (const s of SITIOS) {
    for (const alto of [1.8 * U, 6 * U]) {
      const r = 30 * U;
      candidatos.push({
        nombre: `${s.nombre}·${Math.round(alto / U)}m`,
        puntos: [
          [C[0] + Math.cos(s.a) * r, C[1] + alto, C[2] + Math.sin(s.a) * r],
          [C[0] + Math.cos(s.a + 0.05) * r, C[1] + alto, C[2] + Math.sin(s.a + 0.05) * r],
        ],
        // A la altura de los ojos sobre la plaza, para que el horizonte quede
        // alto y la calle se vea en profundidad en vez de en picado.
        mirar: [C[0], C[1] + 1.7 * U, C[2]],
        segundos: 90,
      });
    }
  }
} else {
  // BARRIDO 2: debajo del hueco de cielo, bajo y mirando hacia arriba.
  const RADIO = [12 * U, 24 * U], ANGULOS = 4;
  for (const r of RADIO) {
    for (const alto of [-10 * U, -4 * U]) {
      for (let i = 0; i < ANGULOS; i++) {
        const a = (i / ANGULOS) * Math.PI * 2;
        candidatos.push({
          nombre: `c${Math.round(r / U)}m/${Math.round(alto / U)}m·${Math.round((a * 180) / Math.PI)}°`,
          puntos: [
            [CIELO[0] + Math.cos(a) * r, alto, CIELO[2] + Math.sin(a) * r],
            [CIELO[0] + Math.cos(a + 0.05) * r, alto, CIELO[2] + Math.sin(a + 0.05) * r],
          ],
          // Al hueco de cielo: desde abajo eso apunta hacia arriba solo, sin
          // tener que escribir un cabeceo a mano.
          mirar: CIELO,
          segundos: 90,
        });
      }
    }
  }
}

const tiros = [];
for (const c of candidatos) {
  const valio = await pag.evaluate((m) => window.probe.miradores.poner(m), c);
  if (!valio) { console.log(`  ${c.nombre.padEnd(12)} NO VALE`); continue; }
  await pag.evaluate(() => window.probe.miradores.en(0));
  // Dos fotogramas: el primero deja la cámara puesta, el segundo la dibuja.
  await pag.waitForTimeout(220);
  const png = await pag.screenshot({ type: "png" });
  const donde = await pag.evaluate(() => window.probe.miradores.donde());
  tiros.push({ nombre: c.nombre, png: png.toString("base64"), donde, mirador: c });
  console.log(`  ${c.nombre.padEnd(12)} pos [${donde.pos.map(Math.round).join(", ")}]`);
}

// ── LA HOJA DE CONTACTOS ────────────────────────────────────────────────────
//
// Se arma en el propio navegador y se fotografía, que es más corto que traerse
// una biblioteca de imágenes para pegar doce PNG en una rejilla.
const hoja = await nav.newPage({ viewport: { width: ANCHO * 4, height: ALTO * Math.ceil(tiros.length / 4) } });
await hoja.setContent(`<style>
  body { margin:0; background:#111; display:grid; grid-template-columns:repeat(4,${ANCHO}px); }
  figure { margin:0; position:relative; }
  img { display:block; width:${ANCHO}px; }
  figcaption { position:absolute; left:6px; top:4px; color:#ffdf9a; font:bold 15px monospace;
    text-shadow:0 1px 3px #000,0 0 6px #000; }
</style>` + tiros.map((t) => `<figure><img src="data:image/png;base64,${t.png}">
  <figcaption>${t.nombre}</figcaption></figure>`).join(""));
await hoja.waitForTimeout(400);
await hoja.screenshot({ path: "build/gatecity/vistas/miradores52.png", fullPage: true });

console.log(`\n  hoja de contactos  build/gatecity/vistas/miradores52.png  (${tiros.length} candidatos)`);
console.log(`  errores de pagina: ${errores.length ? errores.join(" | ") : "ninguno"}`);

await nav.close();
matar(dev);
process.exit(0);
