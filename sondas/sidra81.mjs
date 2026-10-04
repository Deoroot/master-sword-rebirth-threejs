// LA MISIÓN DE LA SIDRA, DE PUNTA A PUNTA — experimento 81.
//
//   npm run sonda:sidra81
//
// Le preguntas a Sylphiel por trabajo, te manda a Bryan, se lo dices a Bryan y
// Bryan **se lo cuenta a ella por su cuenta**. Tres NPC hablando entre sí sin
// que el jugador lleve nada en la mochila: la misión es el estado que se pasan.
//
// ── LOS NUEVE PASOS, Y HASTA EL 85 ESTO MEDÍA TRES ───────────────────────
//
// La cadena entera se midió en el 83 tecleando en el chat en una partida de
// verdad, y son **nueve pasos y no cuatro**. La tabla es del §11 de
// `doc/GUIONES_82.md` y se copia de ahí, no se deduce:
//
//   | paso | quién | qué queda |
//   | 1  | `job` a Sylphiel   | `cider_1 0 → 0`, llama a `cider` de Bryan |
//   | 2  | `cider` a Bryan    | `cider_1 2`, `cider_2 1` |
//   | 3  | `cider` a Sylphiel | «Thanks for the help», y a los 5 s `say_reward3` |
//   | 3b | (sola)             | `cider_1 3`, `cider_2 2`, **oro 10 → 15** |
//   | 4  | `cider` a Sylphiel | «I still haven't gotten that cider shipment» · `cider_1 1` |
//   | 5  | `cider` a Bryan    | «head over to Krythos» · **`CIDER` de Krythos 0 → 1** |
//   | 6  | `cider` a Krythos  | explica, y a los 3 s su `say_cider2` |
//   | 6b | (solo)             | `CIDER 99`, y su `callexternal wench ciderreward` |
//   | 7  | (Sylphiel)         | **`cider_1 4`, `cider_2 3`** — la misión cerrada |
//
// Hasta el 85 esto era **una medida y no un control**: la sonda paraba en el
// tercero y los seis últimos estaban declarados pendientes. Ahora los nueve
// tienen control, y por eso el oro y los contadores de los tres NPC se leen
// aquí en vez de creerse.
//
// Lo que el 83 dejó escrito y aquí se respeta, para no volver a pagarlo:
//
//   - **El pago llega tarde.** Son dos relojes encadenados, no uno: al `+5 s`
//     de `say_reward3` le sigue un `callevent 2 cider3`, así que `cider_1 3`
//     tarda unos SIETE segundos. Por eso no se espera un tiempo: se espera a
//     que la lectura cumpla. Ver `esperarA`.
//   - **El `CIDER` de Bryan no se queda quieto**: un segundo después de
//     mandarte a Krythos, su `callevent 1 say_cider_2` lo pone a 3. Así que su
//     2 se comprueba en el paso 4 y en el 5 se mira a Krythos.
//   - **Krythos abre el menú con DOS botones** y los otros con cuatro. No es
//     una anomalía y no se persigue: no declara `game_menu_getoptions` propio
//     y hereda los de `base_chat`.
//
// ── POR QUÉ HACÍA FALTA UNA SONDA Y NO BASTA `test/sidra81.test.mjs` ─────
//
// Las pruebas de Node ya demuestran que la cadena corre cuando se la llama a
// mano. Lo que no pueden ver es el VIAJE: que el `catchspeech` del guion se
// dispare con lo que el jugador teclea, que el reparto encuentre a Sylphiel en
// rango, que `$cansee` tenga rayo de verdad contra la geometría de la taberna,
// que `$get_by_name(bryan)` resuelva contra la manada montada y que la
// respuesta acabe en la consola. Son cinco costuras, y el fallo de este
// proyecto vive en las costuras (el 63, tres seguidos).
//
// ── LOS CUATRO HUECOS QUE LA TAPABAN, PARA QUE NO SE BUSQUEN OTRA VEZ ────
//
// 1. **`eventname` no nombraba nada.** 570 declaraciones en 202 ficheros, las
//    570 sangradas, y el analizador sólo conocía la forma corta. Un bloque sin
//    nombre **se ejecuta entero al nacer** (el 60), así que Sylphiel corría su
//    `say_reward3` en el primer fotograma y regalaba el oro de la misión.
// 2. **`callexternal` entre NPC no llegaba.** `llamarExterno` seguía siendo el
//    `=> {}` que el 66 arregló en los otros dos entornos y no en éste.
// 3. **Ningún NPC estaba en el registro de nombres**, así que
//    `$get_by_name(wench)` devolvía «0» en todas las partidas.
// 4. **`$cansee` no existía como getter**, y con el `if` VIEJO eso no se salta
//    una línea: abandona el bloque (el 67). El `say_job` de Sylphiel moría en
//    su primera línea.
//
// ── LAS FORMAS DE QUE ESTO PAREZCA FUNCIONAR Y ESTÉ MAL ──────────────────
//
//   lo que se vería                  lo que estaría pasando
//   ──────────────────────────────── ────────────────────────────────────────
//   «Bryan contesta a cider»         contesta la línea de la SEGUNDA vuelta
//                                    («she still hasn't gotten it»), que es lo
//                                    que pasaba con el contador adelantado
//                                    desde el nacimiento. Por eso se mira QUÉ
//                                    línea y no que hable
//   «Sylphiel sabe que has ido»      lo sabría igual si su contador estuviera
//                                    puesto de antes. Por eso se le pregunta a
//                                    Bryan ANTES que a ella (control negativo):
//                                    sin el recado, Bryan no dice nada
//   «la consola tiene líneas nuevas» las suyas propias: los tres hablan solos
//                                    con `repeatdelay`. Por eso cada control
//                                    exige la frase concreta y firmada

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PORT = 5618;   // el 98: era 5281, compartido con otra sonda (test/puertos98.test.mjs)
const liberados = liberarPuerto(PORT);
if (liberados) console.log(`  (puerto ${PORT} liberado: ${liberados})`);
const dev = await arrancarVite(PORT);
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));

/**
 * **SE CORTA EL HILO DE RECARGA DE VITE** — y esto no es una comodidad.
 *
 * El árbol está compartido con otras sesiones. En cuanto una guarda un
 * archivo, vite recarga la página, y una recarga a mitad de pasada **se lleva
 * `window.probe` por delante**: la sonda sigue pulsando contra una pantalla
 * que está volviendo a cargar y lee `undefined`. Pasó dos veces seguidas, con
 * el juego bien, y lo que se veía era «la sidra no funciona».
 *
 * Es la familia del 65 con otra ropa: el instrumento medía su propia
 * interrupción. La sonda quiere **la página que cargó**, no la última versión
 * del disco; si alguien cambia el código a mitad, lo que mida ya no sería de
 * una sola versión y no valdría igual.
 *
 * El canal se reconoce por su subprotocolo, `vite-hmr`, que es como lo abre
 * el cliente de vite. Cualquier otro WebSocket —el del multijugador— pasa.
 */
await pag.addInitScript(() => {
  const Real = window.WebSocket;
  window.WebSocket = function (url, protos) {
    const esHmr = protos === "vite-hmr"
      || (Array.isArray(protos) && protos.includes("vite-hmr"));
    if (!esHmr) return new Real(url, protos);
    return { close() {}, send() {}, addEventListener() {}, removeEventListener() {}, readyState: 3 };
  };
});

// ── EL MARCADOR SE DECLARA ANTES DE EMPEZAR ──────────────────────────────
//
// El 65, y hasta el 85 esta sonda no lo cumplía: el recuento era
// `${bien} de ${controles.length}`, o sea **con el denominador calculado al
// final**. Apuntar una roja en el `catch` no lo arregla — los controles que no
// llegaron a correr no están en la lista, así que una caída en el tercero de
// veinticinco imprimía «2 de 4» y eso se lee como «casi todo bien».
//
// *Un «X de Y» donde Y se calcula al final no puede bajar nunca.* Aquí Y está
// escrito, y lo que no corra cuenta como rojo con su motivo.
const DECLARADOS = 25;
const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });

const VISTAS = "build/edana/vistas";
mkdirSync(VISTAS, { recursive: true });

const consola = () => pag.evaluate(() =>
  (window.probe.hud.estado()?.consola?.lineas ?? []).map((l) => (typeof l === "string" ? l : l.texto ?? "")));

/**
 * Lo nuevo desde una foto anterior. **No es `ahora.slice(antes.length)`**: la
 * consola es un anillo y las viejas se caen por arriba, así que tres líneas
 * nuevas pueden dejar la lista igual de larga. Se busca el solape. El 79 pagó
 * tres rojos con el juego bien por no hacerlo.
 */
function nuevasDesde(antes, ahora) {
  for (let k = Math.min(antes.length, ahora.length); k > 0; k--) {
    if (antes.slice(antes.length - k).join("\u0000") === ahora.slice(0, k).join("\u0000")) return ahora.slice(k);
  }
  return ahora;
}

/**
 * Plantar al jugador delante de alguien hasta que EL JUEGO diga que le ve.
 *
 * Dos cosas aprendidas por otros y que aquí se aplican: el objetivo se cruza
 * por POSICIÓN y no por nombre —en esa taberna hay varios «Patron»— y los
 * sitios se prueban en orden, porque `aQuien` usa el mismo cono y la misma
 * traza que la espada y una esquina a un metro descarta el sitio.
 */
async function plantarseDelante(id) {
  for (const [dx, dz] of [[0, -1.0], [0, 1.0], [-1.0, 0], [1.0, 0], [0, -1.6], [1.6, 0], [-1.6, 0], [0, 1.6]]) {
    const q = await pag.evaluate((i) => {
      const n = window.probe.vgui.npcs().find((x) => x.id === i);
      return n ? n.donde : null;
    }, id);
    if (!q) return null;
    await pag.evaluate((a) => {
      // TRES NÚMEROS. Con un array dentro el `yaw` es `NaN` y el cuerpo deja
      // de simularse: el fallo del 78 heredado del 77.
      window.probe.mundo.poner(a.q[0] + a.dx, a.q[1], a.q[2] + a.dz);
      window.probe.mundo.mirar(a.q[0], a.q[1] + 0.9, a.q[2]);
    }, { q, dx, dz });
    await pag.waitForTimeout(800);
    const d = await pag.evaluate(() => {
      const x = window.probe.vgui.delante();
      return x ? { id: x.id ?? null, nombre: x.nombre ?? null } : null;
    });
    if (d && d.id === id) return { ...d, dx, dz };
  }
  return null;
}

/** Decirle algo al de delante por el chat local, con el teclado. */
async function decirPorElChat(texto) {
  const antes = await consola();
  await pag.keyboard.press("KeyU");                 // el canal local, `config.cfg`
  await pag.waitForTimeout(400);
  await pag.keyboard.type(texto, { delay: 60 });
  await pag.keyboard.press("Enter");
  await pag.waitForTimeout(2600);
  await pag.evaluate(() => window.probe.hud.avanzar(1.0));
  return nuevasDesde(antes, await consola());
}

/** Lo que dice UN NPC concreto, descartando el eco del propio jugador. */
const loDicho = (lineas, quien) => lineas.filter((l) => new RegExp(`^${quien}`, "i").test(l));

/**
 * ESPERAR A QUE EL JUEGO LLEGUE, Y DECIR CUÁNTO HA TARDADO.
 *
 * La mitad de esta misión la sirven relojes del mod, no el jugador: `say_job`
 * arma un `calleventtimed 4 reset`, `say_reward` encadena
 * `+2 s say_reward2 → +3 s say_reward3 → +2 s cider3`, y Krythos un
 * `calleventtimed 3 say_cider2`. O sea que **entre teclear y el efecto pasan
 * segundos**, y con un `waitForTimeout` fijo el control mide mi espera y no la
 * regla: el 75 —«cuando lo que mides va con retraso, el umbral mide tu
 * espera»— y es la trampa que ya se pagó una vez aquí leyendo «oro 10» a los
 * 3 s cuando el pago entra a los 5.
 *
 * Así que no se espera un tiempo: se espera **a que la lectura cumpla**, con
 * un tope, y se devuelve el tiempo que tardó para que salga impreso. Si un día
 * tarda 14 s, se verá en el informe en vez de salir rojo sin motivo.
 *
 * Leer es pasivo —son variables del guion— así que preguntar muchas veces no
 * cambia lo que se mide. *Acercarse a medir puede cambiar lo que se mide* (el
 * 78), y aquí no: no se mueve al jugador ni se teclea nada.
 */
async function esperarA(leer, cumple, { tope = 20000, cada = 400 } = {}) {
  const t0 = Date.now();
  let valor = null;
  for (;;) {
    valor = await leer();
    if (cumple(valor)) return { ok: true, ms: Date.now() - t0, valor };
    if (Date.now() - t0 >= tope) return { ok: false, ms: Date.now() - t0, valor };
    await pag.waitForTimeout(cada);
  }
}

/** Las variables de un NPC, en bruto. */
const varsDe = (id, claves) => pag.evaluate(
  (a) => window.probe.mundo.variablesDeNpc(a.id, a.claves), { id, claves });

/** El oro del personaje, que es lo que un pago tiene que mover. */
const oro = () => pag.evaluate(() => window.probe.misiones.bolsa().oro);

/**
 * **LA CONSOLA PARTE LAS LÍNEAS LARGAS**, y eso puso dos controles en rojo con
 * la misión funcionando.
 *
 * «I have a task for you... check on my cider shipment.» no cabe de una vez:
 * la consola la reparte en varias entradas y sólo la primera empieza por el
 * nombre del NPC. Buscar la frase dentro de las líneas FIRMADAS no la
 * encuentra nunca, por bien que vaya el juego.
 *
 * Así que la frase se busca en el bloque entero y la firma se comprueba
 * aparte. Eso lo hace un pelo más flojo —la frase podría venir del eco del
 * propio jugador—, y por eso cada control que lo usa pide ADEMÁS una línea
 * firmada por el NPC, y la sonda no teclea nunca ninguna de las frases que
 * busca: lo que teclea son «job», «cider» y «qwrtypz».
 */
const elBloque = (lineas) => lineas.join(" ");

try {
  // ── 1. SE ENTRA POR EL MENÚ ────────────────────────────────────────────
  //
  // «Si su camino no pasa por `menuselect`, no cuenta.»
  await entrarPorElMenu(pag, PORT, { mapa: "edana" });
  await pag.waitForTimeout(2500);

  /**
   * **HAY QUE CREAR UN PERSONAJE, Y ESTO ME COSTÓ EL EXPERIMENTO.**
   *
   * `entrarPorElMenu` **no crea ninguno a propósito** y lo dice en su
   * cabecera: «quien quiera un personaje llama a `probe.sesion.nuevo(...)`».
   * Sin él, `sesion.personaje` es `null`, y `$cansee` —que pregunta por el
   * jugador que el NPC tiene delante— no puede contestar y devuelve «0».
   * Desde fuera eso se ve como «el NPC no te ve», o sea idéntico a un fallo
   * del rayo: me llevó a diagnosticar durante media sesión el archivo de otra
   * sesión, que estaba bien.
   *
   * Y la pista falsa que lo alargó: `probe.misiones.bolsa()` devuelve
   * `{oro, objetos, manos}` **siempre**, así que `!!bolsa()` es `true` con el
   * personaje a `null`. Un objeto con los campos vacíos no es un personaje.
   * Por eso el control de abajo mira el NOMBRE y no la verdad del objeto.
   */
  const quienSoy = await pag.evaluate(async () => {
    const p = await window.probe.sesion.nuevo("Sonda");
    return { nombre: p?.nombre ?? null, vida: p?.vida ?? null };
  });
  await pag.waitForTimeout(1200);
  console.log(`\n  EL PERSONAJE: ${quienSoy.nombre ?? "(ninguno)"}, vida ${quienSoy.vida}`);
  control("hay un personaje creado y vivo (sin esto, `$cansee` no puede contestar)",
    Boolean(quienSoy.nombre) && (quienSoy.vida ?? 0) > 0,
    `nombre ${quienSoy.nombre}, vida ${quienSoy.vida}`);

  const gente = await pag.evaluate(() => window.probe.vgui.npcs().map((n) => ({ id: n.id, nombre: n.nombre })));
  const busca = (re) => gente.find((n) => re.test(n.nombre ?? ""));
  const sylphiel = busca(/Sylphiel/i), bryan = busca(/Bryan/i), krythos = busca(/Krythos/i);
  console.log(`\n  LOS TRES DE LA MISIÓN`);
  for (const [q, n] of [["Sylphiel", sylphiel], ["Bryan", bryan], ["Krythos", krythos]]) {
    console.log(`    ${q.padEnd(10)} ${n ? `id ${n.id} — ${n.nombre}` : "NO ESTÁ"}`);
  }
  control("los tres NPC de la sidra están montados y nombrados",
    Boolean(sylphiel && bryan && krythos),
    `${[["Sylphiel", sylphiel], ["Bryan", bryan], ["Krythos", krythos]].filter(([, n]) => !n).map(([q]) => q).join(", ") || "los tres"}`);
  if (!sylphiel || !bryan) throw new Error("sin Sylphiel o sin Bryan no hay nada que medir");

  // ── 2. EL REGISTRO DE NOMBRES, CONTRA LA PARTIDA VIVA ──────────────────
  //
  // `$get_by_name` es la mitad del `callexternal`. Si esto no resuelve, lo de
  // abajo no puede funcionar y conviene saberlo aquí y no al final.
  const asas = await pag.evaluate(() =>
    ["wench", "bryan", "krythos", "qwrtypz"].map((n) => [n, window.probe.mundo.nombreDeEntidad(n)]));
  console.log(`\n  EL REGISTRO DE NOMBRES`);
  for (const [n, a] of asas) console.log(`    ${n.padEnd(10)} ${a ?? "(no resuelve)"}`);
  control("`$get_by_name` resuelve a los tres NPC de la misión",
    asas.filter(([n, a]) => n !== "qwrtypz" && a).length === 3,
    asas.map(([n, a]) => `${n}:${a ? "sí" : "no"}`).join(" "));
  control("y un nombre que no existe sigue sin resolver (el control negativo)",
    asas.find(([n]) => n === "qwrtypz")?.[1] === null);

  // ── 3. EL CONTROL NEGATIVO, Y VA ANTES A PROPÓSITO ─────────────────────
  //
  // Bryan tiene TRES bloques `say_cider`, separados por `if CIDER equals N`
  // del tipo VIEJO — el que abandona el bloque entero. Con `CIDER` a 0, los
  // tres abandonan y Bryan no dice nada de la sidra.
  //
  // Esto se mide PRIMERO porque es lo que demuestra que lo de después vino
  // del recado y no estaba puesto de antes. Si se midiera al final, el estado
  // ya estaría movido y el control no podría fallar.
  console.log(`\n  ANTES DE HABLAR CON SYLPHIEL: «cider» A BRYAN`);
  const anteBryan = await plantarseDelante(bryan.id);
  control("el juego pone a Bryan delante del jugador", Boolean(anteBryan),
    anteBryan ? `desde (${anteBryan.dx}, ${anteBryan.dz})` : "a ninguno de los ocho sitios");
  const prematuro = await decirPorElChat("cider");
  for (const l of prematuro) console.log(`    ${l}`);
  const dijoPrematuro = loDicho(prematuro, "Bryan");
  control("SIN el recado, Bryan no sabe nada de ninguna sidra",
    !dijoPrematuro.some((l) => /cider/i.test(l)),
    dijoPrematuro.join(" / ") || "no dice nada de la sidra, bien");

  // ── 4. SYLPHIEL DA LA MISIÓN ───────────────────────────────────────────
  console.log(`\n  SYLPHIEL: «job»`);
  const anteSyl = await plantarseDelante(sylphiel.id);
  control("el juego pone a Sylphiel delante del jugador", Boolean(anteSyl),
    anteSyl ? `desde (${anteSyl.dx}, ${anteSyl.dz})` : "a ninguno de los ocho sitios");
  const trasJob = await decirPorElChat("job");
  for (const l of trasJob) console.log(`    ${l}`);
  const dijoSyl = loDicho(trasJob, "Sylphiel");
  control("SYLPHIEL TE MANDA A POR LA SIDRA: su `catchspeech` dispara su `say_job`",
    dijoSyl.length > 0 && /cider shipment/i.test(elBloque(trasJob)),
    dijoSyl.join(" / ").slice(0, 120) || "no contesta");
  // Y que no sea el eco del jugador firmado con su nombre, que es lo que
  // pasaba antes del 79 y se vería exactamente igual de bien.
  control("y lo que sale es SUYO, no el eco de lo que tecleaste",
    !dijoSyl.some((l) => /"\s*job\s*"/i.test(l)),
    dijoSyl.join(" / ").slice(0, 80));

  // ── 5. EL RECADO HA LLEGADO A BRYAN, Y ES LA PRUEBA DEL `callexternal` ─
  //
  // Lo que ha cambiado en Bryan no lo ha hecho el jugador: lo ha hecho
  // Sylphiel con `callexternal $get_by_name(bryan) cider`. El jugador no
  // lleva nada encima.
  console.log(`\n  BRYAN: «cider», AHORA SÍ`);
  await plantarseDelante(bryan.id);
  const trasCider = await decirPorElChat("cider");
  for (const l of trasCider) console.log(`    ${l}`);
  const dijoBryan = loDicho(trasCider, "Bryan");
  control("BRYAN SABE LO DE LA SIDRA, y sólo puede habérselo dicho Sylphiel",
    dijoBryan.some((l) => /cider/i.test(l)),
    dijoBryan.join(" / ").slice(0, 120) || "no contesta");
  // ── el control que distingue «corre» de «corre DESDE EL PRINCIPIO» ────
  //
  // Con los 570 `eventname` sin nombrar, el contador de Bryan venía puesto
  // desde el nacimiento y contestaba la línea de la SEGUNDA vuelta. Las dos
  // líneas hablan de sidra, así que un control que sólo pidiera «cider» habría
  // salido verde con el fallo puesto. Es el del 65, y por eso se pide la frase.
  control("y contesta la línea de la PRIMERA vuelta, no la del contador adelantado",
    dijoBryan.length > 0 && /on it.s way/i.test(elBloque(trasCider))
      && !/still hasn.t gotten/i.test(elBloque(trasCider)),
    dijoBryan.join(" / ").slice(0, 120));

  // ── 6. Y EL RECADO VUELVE: BRYAN AVISA A SYLPHIEL ─────────────────────
  //
  // El segundo `callexternal` de la cadena, y en el sentido contrario. Se lee
  // en el estado del guion de ella, que es donde el mod lo escribe.
  const vars = await pag.evaluate((id) =>
    window.probe.mundo.variablesDeNpc(id, ["cider_1", "cider_2"]), sylphiel.id);
  const estadoSyl = { cider1: vars?.cider_1 ?? null, cider2: vars?.cider_2 ?? null };
  console.log(`\n  EL ESTADO DE SYLPHIEL: cider_1 = ${estadoSyl.cider1}, cider_2 = ${estadoSyl.cider2}`);
  control("BRYAN SE LO HA CONTADO A ELLA: el `callexternal` de vuelta",
    estadoSyl.cider1 === "2" && estadoSyl.cider2 === "1",
    `cider_1 = ${estadoSyl.cider1}, cider_2 = ${estadoSyl.cider2}`);

  // ── PASO 3. ELLA LO SABE SIN QUE SE LO CUENTES, Y TE DA LAS GRACIAS ───
  //
  // Con `cider_1` a 2, los dos `say_cider` con guarda abandonan —el de
  // `equals 1` y el de `equals 3`— y corre el tercero, que **no tiene guarda**
  // y hace `callevent say_reward` (barwench.script:186-190). De ahí sale
  // «Thanks for the help.» y, con ella, la cadena de relojes del pago.
  //
  // EL ORO SE LEE AQUÍ, ANTES, porque es la referencia del paso 3b.
  const oroAntes = await oro();
  console.log(`\n  SYLPHIEL OTRA VEZ: «cider»   (oro de salida: ${oroAntes})`);
  await plantarseDelante(sylphiel.id);
  const trasVuelta = await decirPorElChat("cider");
  for (const l of trasVuelta) console.log(`    ${l}`);
  const dijoSyl2 = loDicho(trasVuelta, "Sylphiel");
  control("Y ELLA YA LO SABE: no te vuelve a mandar a Bryan",
    dijoSyl2.length > 0 && !dijoSyl2.some((l) => /Didn't I ask you/i.test(l)),
    dijoSyl2.join(" / ").slice(0, 120) || "no contesta");
  // Y la frase afirmativa, que es la que distingue «no me riñe» de «me da las
  // gracias»: sin ésta, un NPC mudo pasaría el control de arriba.
  control("PASO 3 · te da las gracias: su `say_reward` entra por el bloque sin guarda",
    /Thanks for the help/i.test(elBloque(trasVuelta)) && dijoSyl2.length > 0,
    dijoSyl2.join(" / ").slice(0, 120) || "no contesta");

  // ── PASO 3b. EL PAGO, QUE LLEGA SOLO Y TARDE ──────────────────────────
  //
  // Nadie teclea nada aquí: es la cadena de relojes de ella.
  //
  //     say_reward   →  calleventtimed 2 say_reward2      :205-214
  //     say_reward2  →  callevent 3 say_reward3           :215-219
  //     say_reward3  →  offer gold 5, cider_1 99, cider_2 2
  //                     y callevent 2 cider3              :220-230
  //     cider3       →  setvar cider_1 3                  :170-173
  //
  // O sea **siete segundos** desde «Thanks for the help» hasta que `cider_1`
  // vale 3, y no cinco: el §11 de `doc/GUIONES_82.md` apunta el estado final
  // —`cider_1 3`— junto al plazo de `say_reward3`, que es el del PAGO. Son dos
  // relojes encadenados y el segundo no estaba contado. Se espera a la lectura
  // y no al reloj, así que da igual.
  const llegoElPago = await esperarA(
    () => varsDe(sylphiel.id, ["cider_1", "cider_2"]),
    (v) => v?.cider_1 === "3" && v?.cider_2 === "2");
  const oroDespues = await oro();
  console.log(`\n  EL PAGO (nadie teclea): cider_1 = ${llegoElPago.valor?.cider_1}, ` +
    `cider_2 = ${llegoElPago.valor?.cider_2}, oro ${oroAntes} → ${oroDespues}   (${llegoElPago.ms} ms)`);
  control("PASO 3b · el pago cierra su tramo solo: `cider_1 3` y `cider_2 2`",
    llegoElPago.ok,
    `cider_1 = ${llegoElPago.valor?.cider_1}, cider_2 = ${llegoElPago.valor?.cider_2} tras ${llegoElPago.ms} ms`);
  // `offer ent_lastspoke gold 5` (:227). Cinco monedas exactas, no «más»: un
  // umbral de «>» lo pasaría igual otro pago, y en esta misión hay un segundo
  // (`gold 7`, :252) que sólo entra por la otra rama.
  control("PASO 3b · y paga CINCO monedas, las de su `offer gold 5`",
    oroAntes !== null && oroDespues === oroAntes + 5,
    `oro ${oroAntes} → ${oroDespues}`);

  // ── PASO 4. LA SEGUNDA VUELTA: «no me ha llegado» ─────────────────────
  //
  // Ahora `cider_1` vale 3, así que el `say_cider` de `equals 3` sí corre
  // (:175-185): te manda otra vez a Bryan, se pone `cider_1 1` y le avisa a él
  // con `callexternal $get_by_name(bryan) cider3`, que en Bryan es
  // `setvar CIDER 2` (bryan.script:252-254).
  const cidBryanAntes = (await varsDe(bryan.id, ["CIDER"]))?.CIDER ?? null;
  console.log(`\n  SYLPHIEL, TERCERA VEZ: «cider»   (CIDER de Bryan antes: ${cidBryanAntes})`);
  await plantarseDelante(sylphiel.id);
  const trasQueja = await decirPorElChat("cider");
  for (const l of trasQueja) console.log(`    ${l}`);
  const dijoQueja = loDicho(trasQueja, "Sylphiel");
  control("PASO 4 · se queja de que la sidra no ha llegado y te manda otra vez a Bryan",
    /still haven.t gotten that cider shipment/i.test(elBloque(trasQueja)) && dijoQueja.length > 0,
    dijoQueja.join(" / ").slice(0, 120) || "no contesta");
  // Y el `callexternal` de ida, que es lo que el jugador NO lleva encima.
  const trasQuejaVars = await esperarA(
    () => Promise.all([varsDe(sylphiel.id, ["cider_1"]), varsDe(bryan.id, ["CIDER"])]),
    ([s, b]) => s?.cider_1 === "1" && b?.CIDER === "2");
  console.log(`    cider_1 de ella = ${trasQuejaVars.valor?.[0]?.cider_1}, ` +
    `CIDER de Bryan = ${trasQuejaVars.valor?.[1]?.CIDER}   (${trasQuejaVars.ms} ms)`);
  control("PASO 4 · y se lo dice a Bryan: `cider_1 1` en ella y `CIDER 2` en él",
    trasQuejaVars.ok,
    `cider_1 = ${trasQuejaVars.valor?.[0]?.cider_1}, CIDER = ${trasQuejaVars.valor?.[1]?.CIDER}` +
    ` (antes ${cidBryanAntes}) tras ${trasQuejaVars.ms} ms`);

  // ── PASO 5. BRYAN TE MANDA A KRYTHOS ──────────────────────────────────
  //
  // Con `CIDER` a 2 entra el segundo `say_cider` de Bryan (:256-262) y pasa el
  // recado al tercer NPC: `callexternal $get_by_name(krythos) cider4`, que es
  // `setvar CIDER 1` en Krythos (weaponsmith.script:132-135).
  //
  // Ojo con el `callevent 1 say_cider_2` de la línea 261: un segundo después
  // Bryan se pone `CIDER 3`, así que su valor 2 **no se queda quieto**. Por eso
  // lo de Bryan se comprobó arriba y aquí se mira a Krythos.
  console.log(`\n  BRYAN, SEGUNDA VEZ: «cider»`);
  await plantarseDelante(bryan.id);
  const trasKrythos = await decirPorElChat("cider");
  for (const l of trasKrythos) console.log(`    ${l}`);
  const dijoBryan2 = loDicho(trasKrythos, "Bryan");
  control("PASO 5 · Bryan te manda a Krythos a la Plaza de los Mercaderes",
    /head over to Krythos/i.test(elBloque(trasKrythos)) && dijoBryan2.length > 0,
    dijoBryan2.join(" / ").slice(0, 120) || "no contesta");
  if (!krythos) {
    // Declarado en rojo y no saltado en silencio: un paso que no corre tiene
    // que verse. Los tres de Krythos caen aquí con su motivo.
    control("PASO 5 · el recado llega a Krythos: su `CIDER` pasa a 1", false, "Krythos no está montado");
    control("PASO 6 · Krythos explica lo del envío", false, "Krythos no está montado");
    control("PASO 6b · su `say_cider2` cierra con `CIDER 99`", false, "Krythos no está montado");
    control("PASO 7 · LA MISIÓN QUEDA CERRADA: `cider_1 4` y `cider_2 3`", false, "Krythos no está montado");
  } else {
    const llegoAKrythos = await esperarA(
      () => varsDe(krythos.id, ["CIDER"]), (v) => v?.CIDER === "1");
    console.log(`    CIDER de Krythos = ${llegoAKrythos.valor?.CIDER}   (${llegoAKrythos.ms} ms)`);
    control("PASO 5 · el recado llega a Krythos: su `CIDER` pasa a 1",
      llegoAKrythos.ok, `CIDER = ${llegoAKrythos.valor?.CIDER} tras ${llegoAKrythos.ms} ms`);

    // ── PASO 6. KRYTHOS EXPLICA ─────────────────────────────────────────
    //
    // Y con DOS botones en el menú y no cuatro, que parece una anomalía y no lo
    // es: Krythos **no declara `game_menu_getoptions` propio** y hereda los de
    // `base_chat`. Está dicho en el §11 para que no se persiga.
    console.log(`\n  KRYTHOS: «cider»`);
    await plantarseDelante(krythos.id);
    const trasExplica = await decirPorElChat("cider");
    for (const l of trasExplica) console.log(`    ${l}`);
    const dijoKry = loDicho(trasExplica, "Krythos");
    control("PASO 6 · Krythos explica lo del envío",
      /shipment was waylaid/i.test(elBloque(trasExplica)) && dijoKry.length > 0,
      dijoKry.join(" / ").slice(0, 120) || "no contesta");

    // ── PASO 6b. SU RELOJ, Y EL `callexternal` QUE CIERRA LA MISIÓN ─────
    //
    //     say_cider   →  calleventtimed 3 say_cider2     weaponsmith.script:141
    //     say_cider2  →  CIDER 99
    //                    callexternal $get_by_name(wench) ciderreward     :147
    //     ciderreward →  cider_2 3, cider_1 4            barwench.script:192-199
    //
    // Nadie teclea: es el tercer NPC avisando a la primera por su cuenta, tres
    // segundos después, con el jugador plantado delante de un herrero.
    const cerro = await esperarA(
      () => varsDe(krythos.id, ["CIDER"]), (v) => v?.CIDER === "99");
    console.log(`\n  SU RELOJ: CIDER de Krythos = ${cerro.valor?.CIDER}   (${cerro.ms} ms)`);
    control("PASO 6b · su `say_cider2` cierra con `CIDER 99`",
      cerro.ok, `CIDER = ${cerro.valor?.CIDER} tras ${cerro.ms} ms`);

    // ── PASO 7. LA MISIÓN, CERRADA EN EL ESTADO DE ELLA ────────────────
    //
    // Es el final de la cadena y el control que da nombre al experimento: dos
    // números en el guion de Sylphiel puestos por un NPC que está al otro lado
    // del pueblo, sin que el jugador haya llevado nada ni hablado con ella.
    const cerrada = await esperarA(
      () => varsDe(sylphiel.id, ["cider_1", "cider_2"]),
      (v) => v?.cider_1 === "4" && v?.cider_2 === "3");
    console.log(`\n  LA MISIÓN: cider_1 = ${cerrada.valor?.cider_1}, ` +
      `cider_2 = ${cerrada.valor?.cider_2}   (${cerrada.ms} ms)`);
    control("PASO 7 · LA MISIÓN QUEDA CERRADA: `cider_1 4` y `cider_2 3`",
      cerrada.ok,
      `cider_1 = ${cerrada.valor?.cider_1}, cider_2 = ${cerrada.valor?.cider_2} tras ${cerrada.ms} ms`);
  }

  // ── 8. CONTROL DE INSTRUMENTO ─────────────────────────────────────────
  //
  // Una palabra que no está en ninguna lista de `catchspeech`. Si esto hiciera
  // hablar a alguien de la sidra, todo lo de arriba estaría midiendo otra cosa
  // — por ejemplo el parloteo de `repeatdelay`, que no para nunca.
  console.log(`\n  UNA PALABRA QUE NO ESTÁ EN NINGUNA LISTA`);
  await plantarseDelante(sylphiel.id);
  const trasNada = await decirPorElChat("qwrtypz");
  for (const l of trasNada) console.log(`    ${l}`);
  control("«qwrtypz» no dispara ninguna frase de la misión",
    !trasNada.some((l) => /cider/i.test(l)),
    trasNada.filter((l) => /cider/i.test(l)).join(" / ") || "ninguna, bien");

  // ── 9. `$cansee` CON GEOMETRÍA DE VERDAD ──────────────────────────────
  //
  // El `say_job` empieza con `if $cansee(player,128)`. Desde lejos tiene que
  // dar «no», y eso es lo que separa «el getter devuelve 1 siempre» de «el
  // getter mide». 128 unidades son unos 3,25 m.
  await plantarseDelante(sylphiel.id);
  const deCerca = await pag.evaluate((id) => window.probe.mundo.ve(id, "128"), sylphiel.id);
  const deLejos = await pag.evaluate((id) => {
    const n = window.probe.vgui.npcs().find((x) => x.id === id);
    const d = n?.donde ?? [0, 0, 0];
    window.probe.mundo.poner(d[0] + 30, d[1], d[2]);
    return window.probe.mundo.ve(id, "128");
  }, sylphiel.id);
  console.log(`\n  $cansee(player,128): de cerca «${deCerca}», a 30 m «${deLejos}»`);
  control("`$cansee(player,128)` dice que sí de cerca y que no a 30 m",
    deCerca === "1" && deLejos === "0", `cerca «${deCerca}», lejos «${deLejos}»`);

  await pag.screenshot({ path: `${VISTAS}/sidra81.png` });
} catch (e) {
  // «Un "X de Y" donde Y se calcula al final no puede bajar nunca»: una caída
  // es una ROJA y no una nota al pie. La lección del 65.
  //
  // Y la primera versión de esto imprimía «0 de 0 en verde» al caerse antes
  // del primer control, que es exactamente el marcador que no puede bajar: un
  // cero sobre cero se lee como «nada que objetar». Por eso la caída se apunta
  // COMO UN CONTROL MÁS, en rojo, y el recuento de abajo la cuenta.
  console.log(`\n  LA SONDA SE HA CAÍDO: ${e.message}`);
  control("la sonda llega hasta el final sin caerse", false, e.message.slice(0, 140));
  process.exitCode = 1;
} finally {
  console.log("");
  for (const c of controles) console.log(`  ${c.bien ? "ok  " : "FALLA"} ${c.que}${c.detalle ? `  — ${c.detalle}` : ""}`);
  // El denominador es el DECLARADO. Lo que no llegó a correr se cuenta y se
  // dice, que es la única forma de que el marcador pueda bajar.
  const faltan = DECLARADOS - controles.length;
  if (faltan > 0) console.log(`  FALLA ${faltan} control(es) no llegaron a correr`);
  if (faltan < 0) console.log(`  FALLA hay ${-faltan} control(es) más que los ${DECLARADOS} declarados: actualiza DECLARADOS`);
  const bien = controles.filter((c) => c.bien).length;
  const mal = (controles.length - bien) + Math.abs(faltan);
  console.log(`\n  ${DECLARADOS - mal} de ${DECLARADOS} en verde`);
  console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);
  if (mal || errores.length) process.exitCode = 1;
  // El cierre va en el `finally` y cierra LAS DOS cosas: navegador y servidor.
  // Una sonda que se va por un `catch` sin esto deja un Chromium y un vite
  // vivos, y cuatro sesiones a la vez los acumulan.
  await nav.close();
  matar(dev);
}
