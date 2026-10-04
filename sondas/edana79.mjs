// LOS NPC OYEN LO QUE DICES — experimento 79.
//
//   npm run sonda:edana79
//
// Pulsas la F delante del capitán de la guardia de Edana, eliges «Say Hello»,
// y **el capitán contesta**. Hasta hoy esa opción imprimía
//
//     Edrin, Captain of the Guard says,  "Hello"
//
// —las palabras del jugador bajo el nombre del NPC— y no la oía nadie.
//
// ── LAS DOS COSAS QUE ESTABAN ROTAS, Y SON DISTINTAS ──────────────────────
//
// 1. **`hp 700/700` daba `null`.** `atof` de C lee el prefijo numérico y
//    abandona en la barra; `Number` da `NaN`. Un NPC sin vida no entra en
//    `Manada.vivos()` —que exige `vida > 0`— y de esa lista sale
//    `candidatosDeGolpe()`, con la que el menú decide a quién tienes delante.
//    **Edrin no se podía golpear NI hablar**, y no daba un error. Son 21
//    guiones del juego con esa forma y **10 NPC de los tres mapas portados**:
//    8 de los 48 de Edana —Edrin y los seis sacerdotes— y 2 de los 69 de Gate
//    City. Lo peor: `atof` ya estaba escrito en `src/bsp/script.js`, con su
//    cita y con «No es `Number()`» encima, y el lector de fichas no lo usaba.
//
// 2. **`catchspeech` llevaba desde el 43 registrado y mudo.** El comentario
//    que lo explicaba decía «este puerto no tiene chat de texto», y eso dejó
//    de ser verdad en el 61. Son **208 grupos de frases en 21 de los 27
//    guiones de Edana** y 89 en 15 de los 25 de Gate City, ninguno sonando.
//
// ── POR QUÉ ESTA SONDA Y NO UNA PRUEBA DE NODE ───────────────────────────
//
// Porque las pruebas de `test/oir79.test.mjs` ya demuestran que `oirFrase`
// elige bien y que un `GuionDeNpc` montado con la ficha de Edrin contesta a
// «Hello». Lo que no pueden ver es **el viaje**: que el panel traiga esa
// opción, que pulsarla con el ratón llegue a `UseMenuOption`, que de ahí salga
// la voz del jugador, que el reparto encuentre a Edrin en rango y que su
// respuesta acabe en la consola. Son seis piezas y el fallo de este proyecto
// vive en las costuras (el 63, tres seguidos).
//
// ── LAS FORMAS DE QUE ESTO PAREZCA FUNCIONAR Y ESTÉ MAL ──────────────────
//
//   lo que se vería                  lo que estaría pasando
//   ──────────────────────────────── ────────────────────────────────────────
//   «sale una línea en la consola»   la línea del propio jugador, que sale
//                                    igual sin que nadie la oiga. Por eso se
//                                    mira QUIÉN la firma y se exige además
//                                    una línea de Edrin DESPUÉS
//   «Edrin dice algo»                Edrin habla solo: tiene un bloque con
//                                    `repeatdelay` que suelta frases cada
//                                    pocos segundos. Por eso se toma una
//                                    muestra de su parloteo ANTES, y lo que
//                                    se exige es una de las frases de
//                                    `say_hi`, que ese bloque no dice
//   «contesta porque está cerca»     contestaría igual desde el otro extremo
//                                    del mapa si el rango no se midiera. El
//                                    control negativo le habla desde 500
//                                    unidades, que es más que las 300 de
//                                    `SPEECH_LOCAL_RANGE`
//   «la opción say funciona»         pero por su retrollamada y no por la
//                                    voz. Por eso se comprueba antes que la
//                                    opción **no tiene** retrollamada: lo
//                                    único que puede hacer es hacerte hablar

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PORT = 5279;
const liberados = liberarPuerto(PORT);
if (liberados) console.log(`  (puerto ${PORT} liberado: ${liberados})`);
const dev = await arrancarVite(PORT);
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });

const VISTAS = "build/edana/vistas";
mkdirSync(VISTAS, { recursive: true });

/**
 * Las líneas de la consola DEL CHAT, que es OTRA CAJA.
 *
 * El 60 ya lo dejó dicho: «cuando una regla devuelve *qué* y otra cosa decide
 * *dónde*, hay que probar las dos». Aquí son dos consolas distintas — la de
 * sucesos abajo a la derecha y la del chat a la izquierda — y un grito global
 * sólo sale en la del chat. Buscarlo en la de sucesos daba un rojo con el
 * juego bien, que es como se encontró.
 */
const consolaChat = () => pag.evaluate(() =>
  (window.probe.chat.estado()?.lineas ?? []).map((l) => (typeof l === "string" ? l : l.texto ?? "")));

/** Las líneas de la consola de sucesos, de arriba abajo. */
const consola = async () => {
  // EL 100: lo que DICE un NPC ya no sale en la consola de sucesos sino en la
  // del chat (`PrintSayText`, vgui_hud.cpp:310-313), así que leer sólo la
  // primera es medir un panel vacío con el juego bien. `visto()` trae lo que se
  // ve en LAS DOS, en orden de llegada, y el número de llegada de cada línea.
  const v = await pag.evaluate(() => window.probe.misiones.visto());
  const out = v.map((l) => l.texto ?? "");
  out.n = v.map((l) => l.n ?? 0);
  return out;
};

/**
 * Lo nuevo desde una foto anterior de la consola.
 *
 * ── Y NO ES `ahora.slice(antes.length)` ──────────────────────────────────
 *
 * Eso fue la primera versión y mintió en la primera pasada: **la consola es
 * un anillo**, tiene un tope de líneas y las viejas se caen por arriba. Si
 * caben diez y ya había diez, decir tres frases deja la lista en diez otra
 * vez, `ahora.length - antes.length` es cero y «lo nuevo» sale vacío — con
 * tres líneas nuevas delante. Así se perdió la línea del propio jugador y
 * tres controles salieron rojos con el juego bien.
 *
 * Lo que vale es buscar el solape: el trozo del principio de `ahora` que es
 * la cola de `antes`. Lo que quede después es lo que ha pasado.
 */
function nuevasDesde(antes, ahora) {
  // EL 100: con dos consolas mezcladas el solape ya no vale —cada una suelta
  // sus líneas viejas a su ritmo, y una que se va de EN MEDIO lo rompe—, y
  // tampoco hace falta: cada línea trae su número de llegada.
  if (antes.n && ahora.n) {
    const tope = Math.max(0, ...antes.n);
    return ahora.filter((_, k) => ahora.n[k] > tope);
  }
  for (let k = Math.min(antes.length, ahora.length); k > 0; k--) {
    const cabeza = ahora.slice(0, k).join("\u0000");
    if (antes.slice(antes.length - k).join("\u0000") === cabeza) return ahora.slice(k);
  }
  // Sin solape: o la consola se ha vaciado o todo es nuevo.
  return ahora;
}

/**
 * Plantar al jugador delante de alguien hasta que el JUEGO diga que le ve.
 *
 * No vale con ponerse cerca: `aQuien` usa el mismo cono y la misma traza que
 * la espada (`elegirObjetivo`), así que un sitio puede estar a un metro y
 * tener una esquina en medio. Se prueban cuatro y se devuelve si alguno valió
 * — y si ninguno valió, se dice, porque un «no le ve» silencioso convertiría
 * todos los controles de abajo en verdes vacíos.
 */
async function plantarseDelante(id) {
  for (const [dx, dz] of [[0, -1.0], [0, 1.0], [-1.0, 0], [1.0, 0], [0, -1.6], [1.6, 0]]) {
    const q = await pag.evaluate((i) => {
      const n = window.probe.vgui.npcs().find((x) => x.id === i);
      return n ? n.donde : null;
    }, id);
    if (!q) return null;
    await pag.evaluate((a) => {
      window.probe.mundo.poner(a.q[0] + a.dx, a.q[1], a.q[2] + a.dz);
      // TRES NÚMEROS. Con un array dentro el `yaw` es `NaN` y el cuerpo deja
      // de simularse: es el fallo que el 78 encontró heredado del 77.
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

try {
  // ── 1. EL HORNEADO: QUIÉN TIENE VIDA ───────────────────────────────────
  //
  // Va primero porque es la condición de todo lo demás, y porque se puede
  // contar sin abrir el navegador. «Las cuentas se calculan, no se escriben».
  console.log(`\n  LA VIDA DE LOS NPC, CONTADA DEL HORNEADO`);
  const censos = {};
  for (const m of ["gatecity", "edana", "gertenheld_forest2"]) {
    const j = JSON.parse(readFileSync(`build/${m}/bichos.json`, "utf8"));
    censos[m] = { total: j.colocados.length, sinVida: j.colocados.filter((c) => !c.hp).length };
    console.log(`    ${m.padEnd(20)} ${String(censos[m].total).padStart(3)} colocados, ${censos[m].sinVida} sin vida`);
  }
  const sinVida = Object.values(censos).reduce((a, c) => a + c.sinVida, 0);
  control("ningún NPC de los tres mapas nace sin vida (`hp 700/700` ya son 700)",
    sinVida === 0, `${sinVida} sin vida de ${Object.values(censos).reduce((a, c) => a + c.total, 0)}`);

  const edana = JSON.parse(readFileSync("build/edana/bichos.json", "utf8"));
  const fichaEdrin = edana.colocados.find((c) => c.objetivo === "edrin");
  control("y el capitán de la guardia trae sus 700, que es lo que dice su guion",
    fichaEdrin?.hp === 700, `hp = ${fichaEdrin?.hp}`);

  // ── 2. SE ENTRA POR EL MENÚ ────────────────────────────────────────────
  await entrarPorElMenu(pag, PORT, { mapa: "edana" });
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
  await pag.waitForFunction(() => window.probe?.mundo?.adornos, null, { timeout: 60000 });
  await pag.waitForTimeout(4000);

  const npcs = await pag.evaluate(() => window.probe.vgui.npcs()
    .map((i) => ({ id: i.id, nombre: i.nombre, script: i.script, donde: i.donde })));
  const edrin = npcs.find((n) => n.script === "edana/edrin");
  const bryan = npcs.find((n) => n.script === "edana/bryan");
  console.log(`\n  EN EL MAPA\n    NPC montados    ${npcs.length}`);
  control("se ha entrado a Edana y están sus 48",
    npcs.length === edana.colocados.length, `${npcs.length} de ${edana.colocados.length}`);
  control("y el capitán está montado", Boolean(edrin), edrin ? edrin.nombre : "no está");
  if (!edrin) throw new Error("sin Edrin no hay experimento");

  // ── 3. EL JUEGO LE VE: LO QUE EL `hp` ARREGLÓ ─────────────────────────
  //
  // Éste es el control del primer fallo, y se mide por donde se notaba: no
  // «su `hp` es 700» —eso ya está arriba— sino **que la F le encuentra**.
  console.log(`\n  ¿LE VE EL JUEGO?`);
  const visto = await plantarseDelante(edrin.id);
  console.log(`    delante         ${visto ? visto.nombre : "NADIE"}`);
  control("el jugador puede PONERSE DELANTE del capitán y el juego le ve",
    Boolean(visto), visto ? `desde ${visto.dx},${visto.dz}` : "ningún sitio de seis");
  // El control positivo del instrumento: con un NPC que nunca estuvo roto
  // —Bryan trae `hp 25`— el mismo código tiene que dar lo mismo. Si éste
  // fallara, lo que está roto es la sonda y no el juego.
  const vistoBryan = bryan ? await plantarseDelante(bryan.id) : null;
  control("y también a uno que nunca estuvo roto, que es el control del instrumento",
    Boolean(vistoBryan), vistoBryan ? vistoBryan.nombre : "tampoco a Bryan");

  // ── 4. LA OPCIÓN `say`, Y QUE NO PUEDE HACER NADA MÁS ─────────────────
  if (!visto) throw new Error("no se le puede hablar");
  await plantarseDelante(edrin.id);
  await pag.keyboard.press("KeyF");
  await pag.waitForTimeout(800);
  const panel = await pag.evaluate((id) => ({
    cual: window.probe.vgui.abierto(),
    botones: window.probe.vgui.botones(),
    opciones: window.probe.misiones.opcionesDe(id),
  }), edrin.id);
  console.log(`\n  SU MENÚ\n    ${panel.botones.map((b) => b.texto).join(" | ")}`);
  const iSay = (panel.opciones ?? []).findIndex((o) => o.tipo === "say");
  const laOpcion = iSay >= 0 ? panel.opciones[iSay] : null;
  control("el panel es el suyo y trae una opción de tipo `say`",
    panel.cual === "interact" && iSay >= 0,
    laOpcion ? `«${laOpcion.titulo}» dice «${laOpcion.datos}»` : "ninguna");
  // LO QUE HACE QUE ESTO MIDA LA VOZ Y NO OTRA COSA: la opción no lleva
  // retrollamada. Si la llevara, Edrin podría contestar por ella y el verde no
  // diría nada sobre `catchspeech`.
  control("y esa opción NO tiene retrollamada: lo único que puede hacer es que hables",
    laOpcion !== null && !laOpcion.respuesta, `respuesta = «${laOpcion?.respuesta ?? ""}»`);

  // ── 5. SU PARLOTEO DE FONDO, ANTES DE DECIR NADA ──────────────────────
  //
  // Edrin habla solo. Si no se mide su parloteo antes, «Edrin ha dicho algo»
  // es el valor de reposo — el apartado 4 entero.
  const antesDeHablar = await consola();
  await pag.waitForTimeout(6000);
  const soloSuyo = nuevasDesde(antesDeHablar, await consola());
  console.log(`\n  SU PARLOTEO SOLO (6 s)`);
  for (const l of soloSuyo) console.log(`    ${l}`);
  // Y lo que hay que afirmar NO es «habla solo» —si no habla, mejor— sino que
  // lo que diga por su cuenta no es un saludo, que es lo que el control de
  // abajo busca. Un control que afirma `true` no es un control.
  const SALUDOS = /Hail|Greetings|Well met|traveller|traveler/i;
  control("lo que Edrin suelta por su cuenta NO es un saludo, que es lo que se va a medir",
    !soloSuyo.some((l) => SALUDOS.test(l)),
    soloSuyo.length ? soloSuyo.join(" / ") : "no dice nada solo");

  // ── 6. SE PULSA LA OPCIÓN, CON EL RATÓN ───────────────────────────────
  const antes = await consola();
  const boton = panel.botones[iSay];
  console.log(`\n  SE PULSA «${laOpcion.titulo}» en (${boton.centro}, ${boton.arriba})`);
  await pag.mouse.click(boton.centro, boton.arriba + 8);
  await pag.waitForTimeout(2500);
  await pag.evaluate(() => window.probe.hud.avanzar(1.0));
  const dicho = nuevasDesde(antes, await consola());
  console.log(`  LO QUE SALE`);
  for (const l of dicho) console.log(`    ${l}`);
  await pag.screenshot({ path: `${VISTAS}/edana79.png` });

  // LA FRASE ES DEL JUGADOR. Éste es el control del segundo fallo y es exacto:
  // antes del 79 la misma línea salía firmada por el capitán.
  const mia = dicho.find((l) => l.startsWith("Sonda says,"));
  const suplantada = dicho.find((l) => /^Edrin.*says,\s+"Hello"/.test(l));
  control("lo que dices sale con TU nombre, no con el del NPC",
    Boolean(mia) && !suplantada, mia ?? "no sale");
  control("y nadie firma «Hello» por ti, que es lo que pasaba antes",
    !suplantada, suplantada ?? "nadie");

  // Y EDRIN CONTESTA. No «dice algo»: dice una de las frases de `say_hi`, que
  // su bloque de parloteo no dice.
  // ── Y NO VALE QUE REPITA LO QUE HAS DICHO ───────────────────────────
  //
  // `Say Hello` sortea su texto entre «Hail!», «Hello», «Greetings» y «Hi».
  // El primer control decía «una línea de Edrin que contenga un saludo» — y
  // con el arreglo roto a propósito, Edrin imprimía TU frase bajo su nombre,
  // así que si el sorteo había sacado «Hail!» **el control seguía verde con
  // el fallo puesto**, una vez de cada dos. Lo cazó la rotura deliberada y no
  // una pasada normal: el apartado 4, otra vez, y esta vez en un control que
  // acababa de escribir.
  //
  // Lo que vale es que diga algo que NO es lo que tú dijiste.
  const loQueDije = (laOpcion.datos ?? "").trim().toLowerCase();
  const entrecomillado = (l) => (l.match(/says,\s+"(.*)"$/)?.[1] ?? "").trim().toLowerCase();
  const respuesta = dicho.find((l) => /^Edrin/.test(l) && SALUDOS.test(l)
    && entrecomillado(l) !== loQueDije && entrecomillado(l) !== "");
  control("EL CAPITÁN CONTESTA AL SALUDO, que es lo que `catchspeech` no hacía",
    Boolean(respuesta), respuesta ?? (dicho.filter((l) => /^Edrin/.test(l)).join(" / ") || "no contesta"));
  // Y contesta DESPUÉS de que hables, no antes: el orden distingue una
  // respuesta de una coincidencia con su parloteo.
  control("y contesta después de que hables, no antes",
    Boolean(mia && respuesta) && dicho.indexOf(respuesta) > dicho.indexOf(mia),
    `tú en ${dicho.indexOf(mia)}, él en ${dicho.indexOf(respuesta)}`);

  // ── 7. EL RANGO: DESDE LEJOS NO TE OYE ────────────────────────────────
  //
  // El control negativo, y con su positivo al lado. `SPEECH_LOCAL_RANGE` son
  // 300 unidades y se mide en 2D (`Length2D`), así que se habla desde 500.
  console.log(`\n  EL RANGO (SPEECH_LOCAL_RANGE = 300 unidades, en 2D)`);
  // `unidadesPorMetro` es una FUNCIÓN. Leerla sin llamarla daba el objeto, y
  // `500 / función` es `NaN`: el jugador acabó teletransportado a `NaN` y
  // **medio pueblo le saludó desde el otro extremo del mapa**. De ahí salió el
  // arreglo del `Number.isFinite` en `hablaElJugador`, así que el fallo de la
  // sonda destapó uno del juego.
  const U = await pag.evaluate(() => window.probe.mundo.unidadesPorMetro());
  if (!Number.isFinite(U)) throw new Error(`la escala del mundo no es un número: ${U}`);
  const lejos = 500 / U;
  await pag.evaluate((a) => {
    window.probe.mundo.poner(a.q[0] + a.lejos, a.q[1], a.q[2]);
  }, { q: edrin.donde, lejos });
  await pag.waitForTimeout(1200);
  const antesLejos = await consola();
  const deLejos = await pag.evaluate(() => window.probe.mundo.hablaElJugador?.("Hello") ?? null);
  await pag.waitForTimeout(600);
  const trasLejos = nuevasDesde(antesLejos, await consola());
  console.log(`    desde ${Math.round(lejos * U)} unidades: oyeron ${deLejos?.oyeron ?? "?"}, contestaron ${deLejos?.contestaron?.length ?? "?"}`);
  control("desde 500 unidades el capitán no te oye",
    deLejos !== null && !(deLejos.contestaron ?? []).some((c) => c.id === edrin.id),
    `contestaron ${JSON.stringify(deLejos?.contestaron ?? [])}`);
  // EL POSITIVO: la misma llamada, desde cerca, SÍ. Sin esto el cero de arriba
  // no es un resultado — podría ser que la llamada no haga nada nunca.
  await pag.evaluate((q) => window.probe.mundo.poner(q[0], q[1], q[2] - 1.0), edrin.donde);
  await pag.waitForTimeout(1200);
  const deCerca = await pag.evaluate(() => window.probe.mundo.hablaElJugador?.("Hello") ?? null);
  console.log(`    desde 40 unidades:  oyeron ${deCerca?.oyeron ?? "?"}, contestaron ${deCerca?.contestaron?.length ?? "?"}`);
  control("y desde un metro SÍ: el control positivo del cero de arriba",
    Boolean((deCerca?.contestaron ?? []).some((c) => c.id === edrin.id)),
    `contestaron ${JSON.stringify(deCerca?.contestaron ?? [])}`);
  control("y oye más gente de cerca que de lejos, que es la regla entera",
    (deCerca?.oyeron ?? 0) > (deLejos?.oyeron ?? 0),
    `${deCerca?.oyeron} contra ${deLejos?.oyeron}`);

  // ── 8. `game_heardtext` NO ES `HearPhrase` ────────────────────────────
  //
  // Son dos puertas y el mod las llama por separado. Decir algo que no está
  // en ninguna lista tiene que llegar igual al `game_heardtext` de los de
  // alrededor y no disparar ninguna frase.
  const nada = await pag.evaluate(() => window.probe.mundo.hablaElJugador?.("qwrtypz") ?? null);
  console.log(`\n  LAS DOS PUERTAS\n    «qwrtypz»: oyeron ${nada?.oyeron}, contestaron ${nada?.contestaron?.length}`);
  control("una palabra que no está en ninguna lista la OYEN y no la contesta nadie",
    (nada?.oyeron ?? 0) > 0 && (nada?.contestaron?.length ?? 1) === 0,
    `oyeron ${nada?.oyeron}, contestaron ${nada?.contestaron?.length}`);

  // ── 9. EL CHAT, QUE ES LA OTRA PUERTA ─────────────────────────────────
  //
  // La opción de menú y el chat acaban los dos en `CMSMonster::Speak`. Esto se
  // escribe a mano con el teclado, abriendo el cajetín con su tecla, porque es
  // lo que hace una persona.
  console.log(`\n  POR EL CHAT, ESCRIBIENDO`);
  await plantarseDelante(edrin.id);
  const antesChat = await consola();
  await pag.keyboard.press("KeyU");                 // el canal local, `config.cfg`
  await pag.waitForTimeout(400);
  const abierto = await pag.evaluate(() => window.probe.chat.estado()?.escribiendo ?? false);
  await pag.keyboard.type("hail", { delay: 60 });
  await pag.keyboard.press("Enter");
  await pag.waitForTimeout(2500);
  await pag.evaluate(() => window.probe.hud.avanzar(1.0));
  const trasChat = nuevasDesde(antesChat, await consola());
  for (const l of trasChat) console.log(`    ${l}`);
  control("la tecla del canal local abre el cajetín del chat",
    abierto, `escribiendo = ${abierto}`);
  control("Y ESCRIBIENDO «hail» EN EL CHAT TAMBIÉN CONTESTA",
    trasChat.some((l) => /^Edrin/.test(l) && SALUDOS.test(l)),
    trasChat.filter((l) => /^Edrin/.test(l)).join(" / ") || "no contesta");

  // ── 9b. UN GRITO GLOBAL NO LO CONTESTA UN NPC ─────────────────────────
  //
  // La guarda del mod es `SpeechType == SPEECH_LOCAL`, no «está en rango». Sin
  // este control, la línea que la pone no se puede romper en rojo — y el 78
  // enseñó que una pieza que no se puede romper en rojo sobra o se mide.
  console.log(`\n  UN GRITO GLOBAL (la tecla Y)`);
  await plantarseDelante(edrin.id);
  const antesGrito = await consola();
  const antesGritoChat = await consolaChat();
  await pag.keyboard.press("KeyY");
  await pag.waitForTimeout(400);
  await pag.keyboard.type("hail", { delay: 60 });
  await pag.keyboard.press("Enter");
  await pag.waitForTimeout(2200);
  await pag.evaluate(() => window.probe.hud.avanzar(1.0));
  const trasGrito = nuevasDesde(antesGrito, await consola());
  for (const l of trasGrito) console.log(`    ${l}`);
  control("gritando «hail» a un metro el capitán NO contesta: es el canal, no la distancia",
    !trasGrito.some((l) => /^Edrin/.test(l) && SALUDOS.test(l)),
    trasGrito.filter((l) => /^Edrin/.test(l)).join(" / ") || "no contesta, bien");
  // Y que el grito SÍ salió, que si no esto mide que la tecla no funciona.
  // En la consola DEL CHAT, que es donde va un global: ver `consolaChat`.
  const trasGritoChat = nuevasDesde(antesGritoChat, await consolaChat());
  for (const l of trasGritoChat) console.log(`    [chat] ${l}`);
  control("pero el grito sale, en la consola del chat: el positivo del de arriba",
    trasGritoChat.some((l) => /hail/i.test(l)), trasGritoChat.join(" / ").slice(0, 80));

  // ── 9c. UNA DISTANCIA QUE NO ES UN NÚMERO NO ES «EN RANGO» ────────────
  //
  // Este control existe porque el fallo lo metí yo y lo destapó la primera
  // pasada: con el jugador en `NaN`, `NaN > rango` es false y **medio pueblo
  // contestó desde el otro extremo del mapa** — dieciocho NPC a la vez. La
  // guarda `Number.isFinite` que lo arregla no se podía romper en rojo sin
  // volver a producir el `NaN`, así que se produce a propósito.
  // Teletransportar a `NaN` hace que el audio posicional se queje, una vez por
  // fuente y por fotograma. Son errores DE ESTA SONDA y no del juego, así que
  // se apartan en vez de taparse: cualquier otro sigue contando como rojo.
  const erroresAntesDelNaN = errores.length;
  console.log(`\n  CON EL JUGADOR EN «NaN»`);
  await pag.evaluate(() => window.probe.mundo.poner(NaN, NaN, NaN));
  await pag.waitForTimeout(600);
  const enNaN = await pag.evaluate(() => window.probe.mundo.hablaElJugador?.("hello") ?? null);
  console.log(`    oyeron ${enNaN?.oyeron}, contestaron ${enNaN?.contestaron?.length}, sin sitio ${enNaN?.sinSitio}`);
  control("con una distancia que no es un número NO oye nadie, en vez de oír todos",
    (enNaN?.contestaron?.length ?? 1) === 0 && (enNaN?.sinSitio ?? 0) > 0,
    `contestaron ${enNaN?.contestaron?.length}, sin sitio ${enNaN?.sinSitio}`);

  // ── 10. Y LA SEGUNDA MISIÓN, QUE ES EL SEGUNDO CASO ───────────────────
  //
  // La lección del 50: con un solo NPC contestando, «funciona» y «funciona
  // para éste» son lo mismo. Bryan oye «cider» y «apple», que son dos cadenas
  // de Edana distintas de la de Edrin.
  if (bryan) {
    console.log(`\n  EL SEGUNDO CASO: BRYAN`);
    await plantarseDelante(bryan.id);
    const antesB = await consola();
    const r = await pag.evaluate(() => window.probe.mundo.hablaElJugador?.("got any apples?") ?? null);
    await pag.waitForTimeout(1500);
    await pag.evaluate(() => window.probe.hud.avanzar(1.0));
    const trasB = nuevasDesde(antesB, await consola());
    for (const l of trasB) console.log(`    ${l}`);
    control("Bryan el verdulero oye «apples» y contesta lo suyo",
      (r?.contestaron ?? []).some((c) => c.id === bryan.id && c.evento === "say_apple"),
      JSON.stringify(r?.contestaron ?? []));
    control("y lo que contesta no es lo que contesta Edrin",
      trasB.some((l) => /apple/i.test(l)),
      trasB.join(" / ").slice(0, 120));
  }

  // ── EL INFORME ─────────────────────────────────────────────────────────
  console.log(`\n  CONTROLES`);
  for (const c of controles) {
    console.log(`  ${(c.bien ? "ok  " : "FALLA")} ${c.que.padEnd(72)} ${c.detalle}`);
  }
  const bien = controles.filter((c) => c.bien).length;
  console.log(`\n  ${bien} de ${controles.length} en verde`);
  const delNaN = errores.slice(erroresAntesDelNaN).filter((e) => /AudioParam/.test(e)).length;
  const deVerdad = errores.filter((e, k) => !(k >= erroresAntesDelNaN && /AudioParam/.test(e)));
  console.log(`  errores de página: ${deVerdad.length ? deVerdad.join(" | ") : "ninguno"}` +
    (delNaN ? `  (+${delNaN} del audio, que los provoca el \`NaN\` a propósito de esta sonda)` : ""));
  console.log(`  captura:        ${VISTAS}/edana79.png`);
  if (bien !== controles.length || deVerdad.length) process.exitCode = 1;
} catch (e) {
  // «Un "X de Y" donde Y se calcula al final no puede bajar nunca»: una caída
  // es una ROJA y no una nota al pie. Es la lección del 65.
  console.log(`\n  LA SONDA SE HA CAÍDO: ${e.message}`);
  console.log(`  llevaba ${controles.filter((c) => c.bien).length} de ${controles.length} controles`);
  process.exitCode = 1;
} finally {
  await nav.close();
  matar(dev);
}
