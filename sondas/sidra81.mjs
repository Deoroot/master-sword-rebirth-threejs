// LA MISIÓN DE LA SIDRA, DE PUNTA A PUNTA — experimento 81.
//
//   npm run sonda:sidra81
//
// Le preguntas a Sylphiel por trabajo, te manda a Bryan, se lo dices a Bryan y
// Bryan **se lo cuenta a ella por su cuenta**. Tres NPC hablando entre sí sin
// que el jugador lleve nada en la mochila: la misión es el estado que se pasan.
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
import { liberarPuerto } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PORT = 5281;
const liberados = liberarPuerto(PORT);
if (liberados) console.log(`  (puerto ${PORT} liberado: ${liberados})`);
const dev = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { shell: true, stdio: "ignore" });
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
await new Promise((r) => setTimeout(r, 7000));

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

  // ── 7. ELLA LO SABE SIN QUE SE LO CUENTES ─────────────────────────────
  console.log(`\n  SYLPHIEL OTRA VEZ: «cider»`);
  await plantarseDelante(sylphiel.id);
  const trasVuelta = await decirPorElChat("cider");
  for (const l of trasVuelta) console.log(`    ${l}`);
  const dijoSyl2 = loDicho(trasVuelta, "Sylphiel");
  control("Y ELLA YA LO SABE: no te vuelve a mandar a Bryan",
    dijoSyl2.length > 0 && !dijoSyl2.some((l) => /Didn't I ask you/i.test(l)),
    dijoSyl2.join(" / ").slice(0, 120) || "no contesta");

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
  const bien = controles.filter((c) => c.bien).length;
  console.log(`\n  ${bien} de ${controles.length} en verde`);
  console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);
  if (bien !== controles.length || errores.length) process.exitCode = 1;
  // El cierre va en el `finally` y cierra LAS DOS cosas: navegador y servidor.
  // Una sonda que se va por un `catch` sin esto deja un Chromium y un vite
  // vivos, y cuatro sesiones a la vez los acumulan.
  await nav.close();
  matar(dev);
}
