// LAS COLUMNAS DE HUMO Y LA SALA QUE SUENA — experimento 82.
//
//   npm run sonda:edana82
//
// Las tres clases que Edana contaba desde el 67 y nadie leía: `env_sound` (11),
// `env_beam` (2) y `speaker` (1). **Gate City tiene cero de las tres**, que es
// por lo que esto no se podía medir hasta que hubo un segundo mapa — la trampa
// del 50, duodécima vez.
//
// ── POR DÓNDE ENTRA ───────────────────────────────────────────────────────
//
// Por `menuselect`, con `--mapa edana` elegido A MANO en la fila «Map». Las dos
// cosas son la regla de la casa y las dos tienen su motivo escrito en
// `sondas/entrar.mjs`: con dos mapas portados, dejar la fila sin tocar es una
// moneda al aire.
//
// ── LO QUE MIDE, Y CÓMO SE DISTINGUE DE UN CERO ──────────────────────────
//
// 1. **Que el humo esté en el mundo**, preguntándole a la escena, no al
//    manifiesto: un haz montado tiene cuatro vértices y una textura.
// 2. **Que el humo se vea en PANTALLA**, contando píxeles donde debería estar y
//    comparándolos con los de mirar al lado. Un control de píxeles sin su
//    contrario es el fallo del laboratorio: «95,7 % de cobertura» sobre una
//    pantalla negra.
// 3. **Que el lado del haz gire con la cámara.** Es lo único que distingue un
//    haz de un plano pegado: si no girara, de canto desaparecería.
// 4. **Que el `room_type` del jugador cambie al andar**, y que el que gane sea
//    el más cercano.
//
// ── LO QUE NO MIDE, DICHO AQUÍ ARRIBA ───────────────────────────────────
//
// Que la reverberación **se oiga** dentro de la partida. La cola está medida en
// `npm run sonda:reverberacion82`, contra la cadena de `audio.js` en un
// `OfflineAudioContext`; lo que esta sonda mira es que el NÚMERO llegue. Son
// dos cosas y el 60 enseñó que hay que probar las dos: una regla dice *qué* y
// otra decide *dónde*, y la segunda no la ve ninguna prueba de la primera.
//
// Y el `speaker`: su primer anuncio cae entre 5 y 15 segundos de nacer y los
// siguientes entre 15 y 135, así que **esta sonda no espera a oírlo**. Mide que
// está montado y con su grupo resuelto. Lo que no se puede medir en una pasada
// de sonda se dice, no se cuenta.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PORT = 5620;   // el 98: era 5283, compartido con otra sonda (test/puertos98.test.mjs)
const liberados = liberarPuerto(PORT);
const dev = await arrancarVite(PORT);   // el 98: espera a que conteste
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch { /* ya no está */ } };

// El marcador se DECLARA (el 65): un «X de Y» donde Y se calcula al final no
// puede bajar nunca.
const PREVISTOS = 18;
const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });

let nav = null;
try {
  nav = await chromium.launch();
  const pag = await nav.newPage({ viewport: { width: 1000, height: 700 } });
  // Se corta el HMR de vite: con varias sesiones guardando, una recarga a
  // mitad de pasada se lleva `window.probe` y lo que sale es un `TypeError`
  // disfrazado de roja. Medido hoy en `sonda:mundo`. Receta de `sidra81.mjs`.
  await pag.addInitScript(() => {
    const Real = window.WebSocket;
    window.WebSocket = function (url, protos) {
      const esHmr = protos === "vite-hmr" || (Array.isArray(protos) && protos.includes("vite-hmr"));
      if (!esHmr) return new Real(url, protos);
      return { close() {}, send() {}, addEventListener() {}, removeEventListener() {}, readyState: 3 };
    };
  });
  const errores = [];
  pag.on("pageerror", (e) => errores.push(String(e)));

  // Esperar a que vite conteste. `entrarPorElMenu` navega a la primera y un
  // `ERR_CONNECTION_REFUSED` tira la pasada entera antes de medir nada.
  for (let i = 0; i < 90; i++) {
    try { const r = await pag.goto(`http://localhost:${PORT}/`, { timeout: 2000 }); if (r) break; }
    catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  await entrarPorElMenu(pag, PORT, { mapa: "edana" });
  await pag.evaluate(() => window.probe.sesion.nuevo({ nombre: "Humo" }));
  await pag.waitForFunction(() => Array.isArray(window.probe?.mundo?.haces?.()), null, { timeout: 180000 });

  const U = await pag.evaluate(() => window.probe.mundo.unidadesPorMetro());
  const aEscena = (u) => [u[0] / U, u[2] / U, -u[1] / U];

  // ── 1. ESTÁN EN EL MUNDO ───────────────────────────────────────────────
  const montados = await pag.evaluate(() => window.probe.mundo.haces());
  control("los haces están montados y son DOS",
    montados?.length === 2, `${montados?.length ?? "ninguno"}`);
  control("se llaman como el mapa los llama",
    (montados ?? []).map((h) => h.nombre).sort().join(",") === "smoke1,smoke2",
    JSON.stringify((montados ?? []).map((h) => h.nombre)));
  control("los dos tienen sus cuatro vértices y su textura",
    (montados ?? []).every((h) => h.vertices === 4 && h.conTextura),
    JSON.stringify((montados ?? []).map((h) => [h.vertices, h.conTextura])));
  control("y los dos en mezcla ADITIVA, que lo dice la cabecera del propio .spr",
    (montados ?? []).every((h) => h.aditivo), JSON.stringify((montados ?? []).map((h) => h.aditivo)));
  control("los dos nacen encendidos (SF_BEAM_STARTON, spawnflags 129)",
    (montados ?? []).every((h) => h.visible), JSON.stringify((montados ?? []).map((h) => h.visible)));
  // `BEAM_FSHADEIN`: el brillo arranca en 0 en el inicio y vale 1 en el fin. Es
  // lo que hace que la columna se deshaga arriba en vez de cortarse en seco, y
  // si estuviera al revés el humo saldría del aire y acabaría en el suelo.
  control("el fundido va de 0 a 1 y no al revés (BEAM_FSHADEIN)",
    (montados ?? []).every((h) => h.brilloInicio === 0 && h.brilloFin === 1),
    JSON.stringify((montados ?? []).map((h) => [h.brilloInicio, h.brilloFin])));
  // ── EL ANCHO, Y ESTE CONTROL NACIÓ MAL ────────────────────────────────
  //
  // `BoltWidth 255` por la décima del delta son 25,5 unidades de MEDIO ancho,
  // o sea 51 unidades de ancho total: 1,30 m. Con la lectura literal —sin la
  // décima— serían 13 m, y la columna saldría tres veces más ancha que alta.
  //
  // La primera versión comparaba `|lado|` contra el MEDIO ancho y salió roja
  // con el código bien: **1,295 contra 0,648, que es exactamente el doble**.
  // El vector va del vértice 0 al 1, o sea de un lado al otro, así que su largo
  // es el ancho ENTERO. Lo confundí yo al escribir la prueba, no el que dibuja;
  // se deja escrito porque un factor de dos entre «medio» y «entero» es la
  // clase de cosa que se arregla cambiando el umbral y tapando el fallo.
  const anchoEsperado = (2 * 255 * 0.1) / U;
  control("el ancho es 51 unidades: la décima del delta está aplicada",
    (montados ?? []).every((h) => Math.abs(Math.hypot(...h.lado) - anchoEsperado) < anchoEsperado * 0.02),
    `${(montados ?? []).map((h) => Math.hypot(...h.lado).toFixed(3))} contra ${anchoEsperado.toFixed(3)} m`);
  // Y el control que lo convierte en una medida y no en una comprobación de
  // aritmética: sin la décima el ancho sería 13 m, o sea **más ancho que alto**.
  // La columna mide 184 unidades (4,67 m) de alto.
  control("y por tanto la columna es más ALTA que ancha, como una columna de humo",
    (montados ?? []).every((h) => Math.hypot(...h.lado) < 184 / U),
    `${anchoEsperado.toFixed(2)} m de ancho contra ${(184 / U).toFixed(2)} m de alto`);

  // ── 2. EL LADO GIRA CON LA CÁMARA ──────────────────────────────────────
  //
  // El control que separa un haz de un plano pegado: si el lado no girara, de
  // canto desaparecería. Se compara el VECTOR y no su largo, porque la anchura
  // en el mundo no cambia — lo que cambia es hacia dónde apunta.
  const lados = await pag.evaluate(async () => {
    const p = window.probe.mundo;
    const leer = () => p.haces()[0].lado;
    p.mirar(1000, 0, 0);
    await p.dibujado();
    const a = leer();
    p.mirar(0, 0, 1000);
    await p.dibujado();
    const b = leer();
    return { a, b };
  });
  const largoA = Math.hypot(...lados.a), largoB = Math.hypot(...lados.b);
  control("el haz tiene ancho de verdad (no es una línea)", largoA > 0.01, `${largoA.toFixed(3)} m`);
  control("y su LADO gira al girar la cámara: es un cartel con eje",
    Math.hypot(lados.a[0] - lados.b[0], lados.a[1] - lados.b[1], lados.a[2] - lados.b[2]) > largoA * 0.5,
    `${JSON.stringify(lados.a.map((v) => +v.toFixed(2)))} -> ${JSON.stringify(lados.b.map((v) => +v.toFixed(2)))}`);
  control("mientras su ANCHURA no cambia: gira el lado, no el tamaño",
    Math.abs(largoA - largoB) < largoA * 0.02, `${largoA.toFixed(3)} contra ${largoB.toFixed(3)} m`);

  // ── 3. SE VE DESDE EL MUNDO, con la técnica del 76 ─────────────────────
  //
  // No hay contador de píxeles y no se inventa uno: se usa lo que ya está
  // probado desde el 76 —`puntoEnPantalla` y `loQueSeVe`—, que es la misma
  // pregunta hecha al revés: ¿cae el centro del haz dentro de la ventana, y hay
  // algo del mundo tapándolo?
  //
  // Y con su CONTROL CONTRARIO: desde el otro lado de la muralla no se ve. Sin
  // él, «se ve» lo cumpliría igual una función que dice que todo se ve.
  const vista = await pag.evaluate(async (centro) => {
    const p = window.probe.mundo;
    const mirarYver = async (donde) => {
      p.poner(donde[0], donde[1], donde[2]);
      p.mirar(centro[0], centro[1], centro[2]);
      await p.dibujado();
      return { pantalla: p.puntoEnPantalla(centro), tapa: p.loQueSeVe(centro, { cuantos: 1 }) };
    };
    return {
      // A cuatro metros al este del haz y a su altura.
      cerca: await mirarYver([centro[0] + 4, centro[1], centro[2]]),
      // Y lejísimos, donde la geometría del pueblo se interpone.
      lejos: await mirarYver([centro[0] + 60, centro[1], centro[2] + 60]),
    };
  }, aEscena([432, -224, 300]));
  control("desde cuatro metros, el centro del haz cae DENTRO de la ventana",
    Boolean(vista.cerca.pantalla?.dentro ?? (vista.cerca.pantalla && vista.cerca.pantalla.x >= 0)),
    JSON.stringify(vista.cerca.pantalla));
  control("y no hay nada del mundo tapándolo",
    Array.isArray(vista.cerca.tapa) && vista.cerca.tapa.length === 0,
    JSON.stringify(vista.cerca.tapa));
  control("CONTROL CONTRARIO: desde sesenta metros SÍ hay algo en medio",
    Array.isArray(vista.lejos.tapa) && vista.lejos.tapa.length > 0,
    JSON.stringify(vista.lejos.tapa));

  // ── 4. LA SALA CAMBIA AL ANDAR ─────────────────────────────────────────
  //
  // Los once `env_sound` de Edana tienen tipos 0, 11 y 13. Se planta al jugador
  // en el origen de dos de ellos **con tipos distintos** y se lee qué sala
  // tiene puesta. Con un solo punto no se podría distinguir (el 50), y se lee
  // también el DUEÑO: sin él, «la sala es la 13» no separa el reparto de un
  // valor que se quedó pegado.
  //
  // ── EL 98: ESTOS DOS CONTROLES ESTUVIERON ROJOS DESDE QUE NACIERON ───────
  //
  // Plantaban los PIES 52 unidades por encima del origen de cada `env_sound`
  // (-60 sobre -112, 230 sobre 178), y el ojo va 64 más arriba: 116 unidades
  // sobre el origen. Las dos salas miden 160 y 192 de suelo a techo, con el
  // techo a +80 y +78 del origen, así que **el ojo quedaba 36 y 38 unidades
  // DENTRO del techo**, en la planta de arriba. La traza del motor
  // (sound.cpp:896-922) va del origen de la fuente al ojo, y chocaba con la
  // cara de abajo del techo a 80 y 78 unidades de 116: «pared en medio» en las
  // once, nadie gana, y el `tipo` se queda en el 13 del sitio de nacer (las dos
  // NOTE de sound.cpp:975-980). El reparto y la traza estaban bien; el que medía
  // tenía la cabeza en el piso de arriba. Medido fuera del navegador sobre la
  // malla del mundo, rayo a rayo (doc/ROJOS_98.md).
  //
  // Ahora los pies van al SUELO de cada sala, medido igual: -192 (80 bajo el
  // origen) y 64 (114 bajo el suyo), una unidad por encima. Y se lee además si
  // la fuente que se espera alcanza al jugador, que es la precondición: sin
  // ella, «no dice 11» no distingue el reparto de un jugador mal plantado.
  //
  // Un clic de verdad para despertar el audio: un `AudioContext` nace
  // suspendido y `resume()` sólo funciona dentro del manejador de un gesto. El
  // de Playwright es un evento confiado, así que vale.
  await pag.mouse.click(500, 350);
  const salas = await pag.evaluate(async ({ once, trece }) => {
    const p = window.probe.mundo;
    const ver = async (donde) => {
      p.poner(donde[0], donde[1], donde[2]);
      for (let i = 0; i < 3; i++) await p.dibujado();
      return { ...p.sala(), pies: p.donde().pies };
    };
    return { once: await ver(once), trece: await ver(trece) };
  }, { once: aEscena([-1432, -416, -191]), trece: aEscena([-1488, 976, 65]) });
  // La fuente 1 es la de tipo 11 en [-1432,-416,-112] y la 0 la de tipo 13 en
  // [-1488,976,178], en el orden del manifiesto.
  const leAlcanza = (s, clave) => {
    const v = (s.vistos ?? []).find((x) => x.clave === clave);
    return v ? (v.alcanza ? `la ${clave} le alcanza a ${v.distancia} u` : `la ${clave} NO: ${v.porQueNo}`) : `la ${clave} no está`;
  };
  control("el mapa trae sus once fuentes de sala",
    salas.once.fuentes === 11, String(salas.once.fuentes));
  control("en un env_sound de tipo 11 la REGLA dice 11",
    salas.once.tipo === 11, `${salas.once.tipo} (dueño ${salas.once.dueño}; ${leAlcanza(salas.once, 1)})`);
  control("y en uno de tipo 13 dice 13, con OTRO dueño: el reparto corre",
    salas.trece.tipo === 13 && salas.trece.dueño !== salas.once.dueño,
    `${salas.trece.tipo} (dueño ${salas.trece.dueño}; ${leAlcanza(salas.trece, 0)})`);
  // Y la otra mitad, que es la del 60: que el número LLEGUE al audio. Una
  // regla dice *qué* y otra decide *dónde*, y la segunda no la ve ninguna
  // prueba de la primera.
  control("y el número llega al audio, que es la otra mitad del viaje",
    salas.trece.audioDespierto && salas.trece.enElAudio === salas.trece.tipo,
    `audio ${salas.trece.audioDespierto ? "despierto" : "DORMIDO"}, tiene ${salas.trece.enElAudio}`);

  control("ningún error de página", errores.length === 0, errores.slice(0, 2).join(" | "));
} catch (e) {
  control("la sonda llegó al final", false, `se cayó: ${e.message}`);
} finally {
  if (nav) { try { await nav.close(); } catch { /* ya estaba cerrado */ } }
  matar(dev);
}

console.log(`\nLAS COLUMNAS DE HUMO Y LA SALA QUE SUENA — experimento 82`);
if (liberados) console.log(`  (puerto ${PORT} liberado antes de empezar)`);
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(76)} ${c.detalle}`);
const faltan = PREVISTOS - controles.length;
if (faltan > 0) console.log(`  MAL  ${String(`${faltan} control(es) no llegaron a correr`).padEnd(76)}`);
const mal = controles.filter((c) => !c.bien).length + Math.max(0, faltan);
console.log(`\n  ${PREVISTOS - mal} de ${PREVISTOS} en verde`);
process.exit(mal ? 1 : 0);
