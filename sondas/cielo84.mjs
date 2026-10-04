// LA CAJA DE CIELO, en un Chrome de verdad — experimento 84.
//
//   npm run sonda:cielo84
//
// El encargo, literal: «cuando salto fuera del templo el skybox se mueve.»
//
// ── Qué dice el motor, que es lo que decide si eso es un fallo ─────────────
//
// Un cielo de GoldSrc sigue al que mira en POSICIÓN y no en rotación: gira con
// la vista y no se traslada JAMÁS respecto a ella. Sus vértices se construyen
// sumándole el origen de vista, cara por cara:
//
//     b[0] = s * (farclip >> 1); ...
//     v[j] = (k < 0) ? -b[-k-1] : b[k-1];
//     v[j] += RI.cullorigin[j];
//                                     gl_warp.c:234-243
//     VectorCopy( RI.vieworg, RI.cullorigin );
//                                     gl_rmain.c:359
//
// `cullorigin` es `vieworg`, o sea **el origen de VISTA y no el ojo del cuerpo**.
// Esa distinción es todo el experimento: el puerto anclaba la caja al ojo, y el
// ojo y la vista no son el mismo punto en cuanto el guion del jugador mueve la
// cámara — que es justo lo que hace un salto al aterrizar.
//
// ── Por qué esto NO se mide contando píxeles ──────────────────────────────
//
// Se podría fotografiar el cielo antes y después de saltar, y sería una medida
// peor por dos motivos que el cuaderno ya pagó:
//
//   - en pantalla entera el ruido del mapa se come la señal (el 78: un control
//     a 1,89 de ratio que no pasaba **con el trabajo bien hecho**), y
//   - un cielo que se mueve un poco y un cielo que no se mueve se parecen mucho
//     en píxeles, así que haría falta un umbral, y un umbral aquí mediría la
//     velocidad del salto y no la regla.
//
// Lo que no necesita umbral ni depende de lo que haya delante es **la resta**:
// la diferencia entre el nodo del cielo y la cámara tiene que ser la MISMA en
// todos los fotogramas. Si cambia, hay paralaje. Y si no cambia, no lo hay, por
// mucho o poco que se haya movido el jugador.
//
// ── Las formas de que esto parezca funcionar y esté mal ───────────────────
//
//   1. no hay caja de cielo en el mapa      -> se mediría un nodo que nadie
//                                              dibuja, y las caras de cielo del
//                                              mapa SÍ tienen paralaje porque son
//                                              geometría del mundo
//   2. la diferencia no cambia porque el     -> control positivo: la cámara TIENE
//      jugador no se ha movido                  que haberse movido mucho
//   3. el salto no ocurre                    -> hay que ver `enElAire`
//   4. se leen cielo y cámara en dos         -> el 75: un `evaluate` no mide
//      llamadas distintas                       décimas. Van en UNA (`muerte.cielo()`)

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const MAPA = "edana";
const PORT = 5239;
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (habia ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = await arrancarVite(PORT);
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

// Ver el final: el «X de Y» se calcula sobre los DECLARADOS y no sobre los que
// llegaron a correr, que es el fallo del 65.
const DECLARADOS = 6;

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });
const errores = [];
let nav = null;

/** El módulo de un vector, para hablar de la resta en una sola cifra. */
const modulo = (v) => Math.hypot(v[0], v[1], v[2]);

try {
  nav = await chromium.launch();
  const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
  pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));

  // VITE RECARGA LA PÁGINA cuando otra de las sesiones guarda, y la recarga se
  // lleva `window.probe`. Lo grave no es el rojo: es que una pasada que se
  // recarga a la mitad mide DOS versiones del código a la vez, y eso puede salir
  // verde. Se corta por el SUBPROTOCOLO, así que el WebSocket del multijugador
  // sigue pasando. Límite honesto: `addInitScript` sólo rige para los documentos
  // siguientes, así que una recarga anterior a esta línea se colaría.
  await pag.addInitScript(() => {
    const Real = window.WebSocket;
    window.WebSocket = function (url, protos) {
      const esHmr = protos === "vite-hmr" || (Array.isArray(protos) && protos.includes("vite-hmr"));
      if (!esHmr) return new Real(url, protos);
      return { close() {}, send() {}, addEventListener() {}, removeEventListener() {}, readyState: 3 };
    };
  });

  await entrarPorElMenu(pag, PORT, { mapa: MAPA });
  // `entrarPorElMenu` NO crea personaje a propósito, y sin él no se anda (el 81,
  // donde esto costó dos sesiones).
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
  await pag.waitForFunction(() => window.probe.vgui.abierto() === null, null, { timeout: 60000 });
  await pag.click("#view", { position: { x: 600, y: 400 } });
  await new Promise((r) => setTimeout(r, 600));

  const leer = () => pag.evaluate(() => window.probe.muerte.cielo());

  // ── 1. HAY CAJA DE CIELO, Y SE DIBUJA ───────────────────────────────────
  //
  // Primero esto, porque sin la caja todo lo de abajo mediría un nodo que nadie
  // pinta. Y el caso importa: SIN caja, las caras de cielo del propio mapa se
  // dibujan como geometría del mundo (`bsp_escena.js`), y ésas sí se quedan
  // atrás al saltar — o sea que «el cielo se mueve» también describiría eso, con
  // otra causa y otro arreglo.
  console.log(`\n  LA CAJA`);
  const i0 = await leer();
  console.log(`    mapa            ${MAPA}`);
  console.log(`    nodo «cielo»    hay=${i0.hay} visible=${i0.visible}`);
  console.log(`    cielo           ${JSON.stringify(i0.cielo?.map((v) => +v.toFixed(2)))}`);
  console.log(`    cámara          ${JSON.stringify(i0.camara.map((v) => +v.toFixed(2)))}`);
  control("el mapa trae caja de cielo y se dibuja",
    i0.hay === true && i0.visible === true, `hay=${i0.hay} visible=${i0.visible}`);

  // ── 2. QUIETO, LA DIFERENCIA NO CAMBIA ──────────────────────────────────
  //
  // La línea base. Si esto ya variara, el fallo no sería del salto.
  console.log(`\n  QUIETO`);
  const quietas = [];
  for (let i = 0; i < 8; i++) {
    quietas.push((await leer()).diferencia);
    await new Promise((r) => setTimeout(r, 70));
  }
  const derivaDe = (lista) => {
    const base = lista[0];
    return Math.max(...lista.map((d) => modulo([d[0] - base[0], d[1] - base[1], d[2] - base[2]])));
  };
  const derivaQuieto = derivaDe(quietas);
  const uPorM = i0.unidadesPorMetro;
  console.log(`    deriva quieto   ${(derivaQuieto * uPorM).toFixed(3)} unidades del motor`);
  control("quieto, la diferencia cielo↔cámara no se mueve",
    derivaQuieto * uPorM < 0.01, `${(derivaQuieto * uPorM).toFixed(4)} u`);

  // ── 3. SALTANDO ─────────────────────────────────────────────────────────
  //
  // El caso del encargo. Se salta y se muestrea seguido, porque lo que se busca
  // aparece en el aterrizaje y dura poco.
  console.log(`\n  SALTANDO`);
  const muestras = [];
  await pag.keyboard.press("Space");
  for (let i = 0; i < 40; i++) {
    muestras.push(await leer());
    await new Promise((r) => setTimeout(r, 45));
  }
  const derivaSalto = derivaDe([quietas.at(-1), ...muestras.map((m) => m.diferencia)]);
  const alturas = muestras.map((m) => m.camara[1]);
  const recorrido = (Math.max(...alturas) - Math.min(...alturas)) * uPorM;
  const huboAire = muestras.some((m) => m.enElAire);
  console.log(`    en el aire      ${huboAire ? "sí" : "NO (no se ha saltado)"}`);
  console.log(`    la cámara subió ${recorrido.toFixed(1)} unidades del motor`);
  console.log(`    deriva saltando ${(derivaSalto * uPorM).toFixed(3)} unidades del motor`);
  // Los dos controles positivos van ANTES del que importa, porque son los que lo
  // hacen significar algo: una diferencia que no cambia porque nada se ha movido
  // es un cero sin control positivo.
  control("CONTROL POSITIVO: el salto ocurre de verdad",
    huboAire, huboAire ? "se le vio en el aire" : "nunca despegó: lo de abajo no mide nada");
  control("CONTROL POSITIVO: la cámara se mueve MUCHO durante el salto",
    recorrido > 20, `${recorrido.toFixed(1)} u de recorrido vertical`);
  control("SALTANDO, EL CIELO NO SE MUEVE RESPECTO A LA CÁMARA",
    derivaSalto * uPorM < 0.01,
    `${(derivaSalto * uPorM).toFixed(3)} u de paralaje (la cámara hizo ${recorrido.toFixed(1)} u)`);

  // ── 4. Y ANDANDO, QUE ES EL OTRO MOVIMIENTO ─────────────────────────────
  //
  // Un cielo mal anclado al ojo también derivaría andando, sólo que menos y por
  // eso no se ve. Va aparte para que el informe diga cuál de los dos falla.
  console.log(`\n  ANDANDO`);
  await pag.keyboard.down("KeyW");
  const andando = [];
  for (let i = 0; i < 20; i++) {
    andando.push(await leer());
    await new Promise((r) => setTimeout(r, 50));
  }
  await pag.keyboard.up("KeyW");
  const derivaAndar = derivaDe(andando.map((m) => m.diferencia));
  const p0 = andando[0].pies, p1 = andando.at(-1).pies;
  const avance = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) * uPorM;
  console.log(`    avanzó          ${avance.toFixed(1)} unidades del motor`);
  console.log(`    deriva andando  ${(derivaAndar * uPorM).toFixed(3)} unidades del motor`);
  control("ANDANDO TAMPOCO, con el jugador recorriendo metros",
    avance > 20 && derivaAndar * uPorM < 0.01,
    `${(derivaAndar * uPorM).toFixed(3)} u de paralaje en ${avance.toFixed(1)} u andadas`);
} catch (e) {
  errores.push(`la sonda se cayó: ${String(e).slice(0, 300)}`);
}

console.log("\n  CONTROLES");
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(58)} ${c.detalle}`);
const mal = controles.filter((c) => !c.bien);
console.log(`\n  ${controles.length - mal.length} de ${DECLARADOS} en verde`);
if (controles.length !== DECLARADOS) {
  console.log(`  !! FALTAN ${DECLARADOS - controles.length}: la sonda no llegó al final`);
}
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}\n`);

await nav?.close();
matar(dev);
process.exit(mal.length || errores.length || controles.length !== DECLARADOS ? 1 : 0);
