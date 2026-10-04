// LAS SEIS OPCIONES DE TU PROPIO MENÚ — experimento 85.
//
//   npm run sonda:menujugador85
//
// Lo reportó el usuario: «con la F abro el menú, pulso "Sit Down (Rest)" y sale
// *That is not implemented yet*; y lo mismo todas las demás opciones de ese
// menú. En el original salía una animación de sentarse y el jugador recuperaba
// vida, maná y energía poco a poco».
//
// ── POR QUÉ ESTO NO LO PUEDE MEDIR `npm test` ──────────────────────────────
//
// Las 52 pruebas de `test/menujugador85.test.mjs` llegan hasta
// `InteraccionesNpc.elegido`, que es la costura que estaba rota, y eso ya es
// mucho. **Lo que no pueden ver es ninguna de las cuatro cosas de abajo**, y
// las cuatro son justamente lo que el usuario ve:
//
//   1. que la F abra TU menú y no el de un vecino                  (el panel)
//   2. que un clic del ratón en «Sit Down (Rest)» llegue a la regla (el reparto)
//   3. que la cámara baje de verdad                                (la física)
//   4. que el muñeco del HUD se siente                             (el visor)
//
// Y la 2 es la del 29: **no hay `probe.emociones.sentar()`**. Se pulsa la F y se
// hace clic en el botón por su texto, porque el fallo medido es exactamente que
// el estado se podía poner a mano y el juego seguía roto.
//
// ── LAS FORMAS DE QUE ESTO PAREZCA FUNCIONAR Y ESTÉ MAL ────────────────────
//
//   - **«se sentó» leyendo el estado.** El estado es nuestro. Lo que se mide es
//     `camara().distancia`, que es la separación entre el ojo del cuerpo y la
//     cámara en unidades del motor: 0 de pie y 28 sentado. Ése no lo escribe
//     nadie, sale de la cámara del juego.
//   - **«no me puedo mover» sin probar que sí me podía.** Andar sentado y leer
//     que no avanzo mide igual de bien un jugador atascado contra una pared. Hay
//     control positivo: la misma tecla, los mismos segundos, de pie.
//   - **«el aguante volvió» contando la regeneración normal.** El aguante sube
//     solo a 0,6+fuerza/10 por segundo, así que en los cinco segundos del ciclo
//     se llenaría igual sin sentarse. Lo que lo separa es el `IsActing()` de
//     `fatigue.cpp:77-79`, que este experimento portó: sentado NO sube solo, así
//     que si sube es del `drainstamina -1000` y de nada más.
//   - **«sale la descripción» con la mano vacía.** `ShowWeaponDesc` empieza con
//     `if (!pItem) return;`. La sonda empuña una espada a propósito y comprueba
//     que el texto es el del catálogo, no uno cualquiera.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PORT = 5285;
const liberados = liberarPuerto(PORT);
if (liberados) console.log(`  (puerto ${PORT} liberado: ${liberados})`);
const dev = await arrancarVite(PORT);
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));

// vite-hmr fuera: otra sesión guardando un archivo recarga la página y se lleva
// `window.probe` a mitad de pasada.
await pag.addInitScript(() => {
  const Real = window.WebSocket;
  window.WebSocket = function (url, protos) {
    const esHmr = protos === "vite-hmr" || (Array.isArray(protos) && protos.includes("vite-hmr"));
    if (!esHmr) return new Real(url, protos);
    return { close() {}, send() {}, addEventListener() {}, removeEventListener() {}, readyState: 3 };
  };
});

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Abre el panel con la F de verdad y devuelve sus botones. */
async function abrirMenu() {
  await pag.keyboard.press("KeyF");
  await esperar(700);
  return pag.evaluate(() => ({
    cual: window.probe.vgui.abierto(),
    titulo: window.probe.vgui.panel()?.titulo ?? null,
    botones: window.probe.vgui.botones(),
    opciones: window.probe.vgui.opciones(),
    delante: window.probe.vgui.delante(),
  }));
}

/** Pulsa un botón por su TEXTO, con el ratón, como una persona. */
async function pulsar(botones, texto) {
  const b = botones.find((x) => x.texto === texto);
  if (!b) return false;
  await pag.mouse.click(b.centro, b.arriba + 6);
  await esperar(350);
  return true;
}

// `probe.muerte.camara()` y no `probe.mundo.camara()`, que no existe: la cámara
// la lee el bloque de la muerte porque es donde viven sus DOS ramas, y llama a la
// del juego en vez de recalcularla — el aviso del 65. Lo que se usa de ella es
// `distancia`, que es `|ojo − cámara|` en unidades del motor.
const leer = () => pag.evaluate(() => ({
  e: window.probe.emociones.estado(),
  v: window.probe.emociones.vitales(),
  muneco: window.probe.emociones.muneco(),
  deUnPase: window.probe.emociones.deUnPase(),
  camara: window.probe.muerte.camara(),
  pies: window.probe.mundo.donde().pies,
}));

/**
 * Las líneas que se VEN en la consola de sucesos, abajo a la derecha.
 *
 * Y se devuelven además PEGADAS, que es la lección del 81: **la consola parte
 * las líneas largas**, y una frase de setenta caracteres no cabe en una entrada.
 * La primera pasada de esta sonda leyó `"impact"` —la última palabra de la
 * descripción de la espada— y dio por roto algo que funcionaba. El instrumento
 * leía bien y la unidad de lectura era la equivocada.
 */
const consola = async () => {
  const lineas = await pag.evaluate(() =>
    (window.probe.hud.estado()?.consola?.lineas ?? []).map((l) => String(l.texto ?? "")));
  return { lineas, bloque: lineas.join(" ").replace(/\s+/g, " ").trim() };
};

try {
  await entrarPorElMenu(pag, PORT, { mapa: "edana" });
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
  // La pantalla de personajes es un panel y está abierta al arrancar: con ella
  // delante la F no llega. Hay que esperar a que se cierre, no suponerlo.
  await pag.waitForFunction(() => window.probe.vgui.abierto() === null, null, { timeout: 120000 });
  await pag.waitForFunction(() => (window.probe.reaccion.censo() ?? []).length > 0, { timeout: 120000 });
  // El puntero se atrapa con un clic en el mapa, que es lo que hace el jugador.
  await pag.click("#view", { position: { x: 600, y: 400 } });
  await esperar(1200);

  // ── 0. NO HAY NADIE DELANTE, que es lo que hace que el menú sea el MÍO ──
  //
  // `else pMonster = pPlayer;` (client.cpp:679-682): la F abre tu propio menú
  // SÓLO si el cono de 72 unidades está vacío. Sin comprobarlo, un vecino de
  // Edana delante convertiría todo lo de abajo en la medida de otro menú.
  console.log(`\n  QUIÉN TENGO DELANTE`);
  let delante = await pag.evaluate(() => window.probe.vgui.delante());
  // Girando con `mirar`, que toma TRES NÚMEROS — con un array dentro da `NaN` y
  // el cuerpo deja de simularse sin decir nada (el 78). Se le da un punto a diez
  // metros en el rumbo que toque, calculado desde los pies.
  for (let giro = 1; giro <= 8 && delante; giro++) {
    await pag.evaluate((a) => {
      const p = window.probe.mundo.donde().pies;
      window.probe.mundo.mirar(p[0] + 10 * Math.cos(a), p[1], p[2] + 10 * Math.sin(a));
    }, (giro * Math.PI) / 4);
    await esperar(250);
    delante = await pag.evaluate(() => window.probe.vgui.delante());
  }
  console.log(`    delante         ${delante ? (delante.ficha?.nombre ?? "alguien") : "nadie"}`);
  control("no hay nadie en el cono de 72 unidades, así que el menú será el MÍO",
    delante === null, delante ? `tengo delante a ${delante.ficha?.nombre ?? "alguien"}` : "");

  // ── 1. LAS SEIS OPCIONES, con la F y con mi nombre ──────────────────────
  console.log(`\n  EL MENÚ`);
  const SEIS = ["Sit Down (Rest)", "Emote: Nod Yes", "Emote: Nod No",
    "Emote: Stand At Attention", "Item Desc", "Forgive Last PK"];
  let menu = await abrirMenu();
  console.log(`    F -> panel      ${menu.cual} · título ${JSON.stringify(menu.titulo)}`);
  console.log(`    botones         ${menu.botones.map((b) => b.texto).join(" | ")}`);
  const faltan = SEIS.filter((t) => !menu.botones.some((b) => b.texto === t));
  control("LA F ABRE MI PROPIO MENÚ, con sus seis opciones",
    menu.cual === "interact" && faltan.length === 0,
    faltan.length ? `faltan: ${faltan.join(", ")}` : `las seis y el Cancel: ${menu.botones.length} botones`);

  // ── 2. EL FALLO DEL REPORTE: un clic en «Sit Down (Rest)» ───────────────
  console.log(`\n  SENTARSE`);
  const antesDeSentarse = await leer();
  console.log(`    antes           sentado ${antesDeSentarse.e.sentado} · cámara a ${antesDeSentarse.camara.distancia.toFixed(1)} u del ojo`);
  // El control positivo del instrumento: de pie la cámara ESTÁ en el ojo. Sin
  // esto, «28 unidades sentado» podría ser que la cámara siempre está lejos.
  control("EL INSTRUMENTO VE LA DIFERENCIA: de pie la cámara está EN el ojo",
    antesDeSentarse.camara.distancia < 1,
    `${antesDeSentarse.camara.distancia.toFixed(3)} u`);

  const pulsado = await pulsar(menu.botones, "Sit Down (Rest)");
  await esperar(1400);                       // VIEW_LOWERTIME es 1 segundo
  const sentado = await leer();
  console.log(`    tras el clic    sentado ${sentado.e.sentado} · postura ${sentado.e.postura} · muñeco ${sentado.muneco}`);
  console.log(`    cámara          ${sentado.camara.distancia.toFixed(1)} u por debajo del ojo (el guion dice 28)`);
  const sinQuejas = /not implemented/i.test((await consola()).bloque) ? 1 : 0;

  control("UN CLIC DEL RATÓN EN «Sit Down (Rest)» SIENTA AL JUGADOR",
    pulsado && sentado.e.sentado === true, pulsado ? "" : "no se encontró el botón");
  control("Y YA NO DICE «That is not implemented yet»",
    sinQuejas === 0, `${sinQuejas} línea(s) en la consola`);
  control("LA CÁMARA BAJA LAS 28 UNIDADES DEL GUION, medidas en la cámara del juego",
    Math.abs(sentado.camara.distancia - 28) < 1.5,
    `${sentado.camara.distancia.toFixed(2)} u contra 28 de `
    + "`const VIEW_LOWERHEIGHT -28`");
  control("y el muñeco del HUD se sienta: `playanim hold sitdown`",
    sentado.muneco === "sitdown", `el muñeco tiene «${sentado.muneco}»`);

  // ── 3. LOS CANDADOS, con su control positivo ────────────────────────────
  //
  // El 70: un control positivo no sólo dice que el instrumento ve, también dice
  // dónde estaba apuntando mal. Andar sentado y no avanzar mide igual de bien
  // un jugador encajado en una pared, así que se anda LO MISMO de pie después.
  console.log(`\n  LOS CANDADOS`);
  const antesDeAndar = sentado.pies;
  await pag.keyboard.down("KeyW");
  await esperar(1500);
  await pag.keyboard.up("KeyW");
  await esperar(200);
  const trasAndarSentado = await leer();
  const andadoSentado = Math.hypot(
    trasAndarSentado.pies[0] - antesDeAndar[0], trasAndarSentado.pies[2] - antesDeAndar[2]);
  console.log(`    sentado, 1,5 s de W -> ${(andadoSentado * 39.37).toFixed(1)} u`);
  control("sentado no se anda: `setvard game.effect.canmove 0`",
    andadoSentado * 39.37 < 4, `${(andadoSentado * 39.37).toFixed(2)} u`);

  // ── 4. EL CICLO DE DESCANSAR, medido por el AGUANTE ─────────────────────
  //
  // Se mide por el aguante y no por la vida porque un personaje nuevo nace con
  // la vida al tope, y curar a quien está al tope no mueve el número: sería un
  // cero sin forma de distinguirlo de «el ciclo no corre».
  //
  // El aguante sirve porque desde este experimento sentado NO se regenera solo
  // (`IsActing()`, fatigue.cpp:77-79), así que lo único que puede subirlo es el
  // `drainstamina ent_me -1000` de la vuelta del ciclo.
  console.log(`\n  EL CICLO DE DESCANSAR`);
  // Primero gastarlo: de pie, corriendo. Hay que levantarse para poder correr.
  menu = await abrirMenu();
  await pulsar(menu.botones, "Stand Up");
  await esperar(1400);
  await pag.keyboard.down("ShiftLeft");
  await pag.keyboard.down("KeyW");
  await esperar(3500);
  await pag.keyboard.up("KeyW");
  await pag.keyboard.up("ShiftLeft");
  await esperar(100);
  const gastado = await leer();
  console.log(`    tras correr     aguante ${gastado.v.aguante.toFixed(2)}`);
  // El umbral sale del MÁXIMO del personaje y no de un número escrito: el
  // aguante máximo se deriva de las habilidades, y la primera pasada comparó
  // contra el 3 del perfil y leyó «quedan 5,55 de 3». El 75 en una sonda.
  const maxAguante = gastado.v.aguanteMax ?? 3;
  control("CONTROL POSITIVO DEL INSTRUMENTO: correr gasta aguante",
    gastado.v.aguante < maxAguante - 1,
    `queda ${gastado.v.aguante.toFixed(2)} de ${maxAguante.toFixed(2)}`);

  menu = await abrirMenu();
  await pulsar(menu.botones, "Sit Down (Rest)");
  await esperar(1500);
  const reciénSentado = await leer();
  console.log(`    recién sentado  aguante ${reciénSentado.v.aguante.toFixed(2)} · vueltas ${reciénSentado.e.vueltas}`);
  // Y aquí está la mitad que separa los dos mecanismos: sentado y antes de la
  // primera vuelta, el aguante NO ha subido. Si subiera, sería la regeneración
  // normal y el control de abajo no mediría el `drainstamina`.
  // Y pide estar sentado de verdad: sin sentarse, «el aguante no ha subido» es
  // falso de todas formas —de pie sube solo— pero con el muñeco quieto y el
  // aguante al tope saldría verde por el techo. Las dos mitades, entonces.
  control("SENTADO EL AGUANTE NO SUBE SOLO: el `IsActing()` de fatigue.cpp",
    reciénSentado.e.sentado === true
    && reciénSentado.v.aguante <= gastado.v.aguante + 0.15,
    `sentado ${reciénSentado.e.sentado}: ${gastado.v.aguante.toFixed(2)} -> ${reciénSentado.v.aguante.toFixed(2)} en segundo y medio`);

  // ── NO SE ESPERA AL RELOJ DE PARED: SE ESPERA A LA VUELTA ──────────────
  //
  // El ciclo corre con el **tiempo del juego** (`emociones.paso(dtB)`), y con un
  // Chromium cargando Edana cinco segundos de pared no son cinco de juego: dos
  // pasadas de esta sonda dieron rojo con el trabajo bien hecho porque la vuelta
  // no había llegado. Es el 75 —«cuando lo que mides va bajando solo, el umbral
  // mide tu espera»— por el otro lado: aquí el umbral medía mi espera contra un
  // reloj que no es el mío. Se espera a que la vuelta OCURRA, con tope.
  const vueltasAntes = reciénSentado.e.vueltas;
  let llegó = true;
  try {
    await pag.waitForFunction(
      (n) => (window.probe.emociones.estado()?.vueltas ?? 0) > n,
      vueltasAntes, { timeout: 30000 });
  } catch { llegó = false; }
  const descansado = await leer();
  control("la vuelta del ciclo LLEGA, y no en un plazo cualquiera: cinco segundos de juego",
    llegó, `esperé 30 s de pared y la vuelta ${vueltasAntes + 1} no llegó`);
  console.log(`    tras una vuelta aguante ${descansado.v.aguante.toFixed(2)} · vueltas ${descansado.e.vueltas} · dado ${JSON.stringify(descansado.e.dado)}`);
  control("UNA VUELTA DEL CICLO DEVUELVE EL AGUANTE: `drainstamina ent_me -1000`",
    descansado.e.vueltas > reciénSentado.e.vueltas && descansado.v.aguante > gastado.v.aguante + 0.5,
    `${reciénSentado.v.aguante.toFixed(2)} -> ${descansado.v.aguante.toFixed(2)} en la vuelta ${descansado.e.vueltas}`);
  control("y la vuelta regala vida y maná acumulados, no un paso fijo",
    (descansado.e.dado ?? []).length > 0 && descansado.e.vidaAcumulada > 1,
    `acumulado vida ${descansado.e.vidaAcumulada}, maná ${descansado.e.manaAcumulada}`);

  // ── 5. SENTADO EL MENÚ ENCOGE ───────────────────────────────────────────
  //
  // `if ( !$get(ent_me,sitting) )` es la ÚNICA condición de este menú, y estaba
  // portada y sin ejecutarse nunca: nadie le pasaba el estado.
  console.log(`\n  EL MENÚ SENTADO`);
  menu = await abrirMenu();
  console.log(`    botones         ${menu.botones.map((b) => b.texto).join(" | ")}`);
  const soloTres = menu.botones.filter((b) => b.texto !== "Cancel");
  control("SENTADO EL MENÚ ENCOGE A TRES Y LA PRIMERA DICE «Stand Up»",
    soloTres.length === 3 && soloTres[0].texto === "Stand Up",
    `${soloTres.length} opciones: ${soloTres.map((b) => b.texto).join(", ")}`);

  await pulsar(menu.botones, "Stand Up");
  await esperar(1500);
  const dePie = await leer();
  console.log(`    tras «Stand Up» sentado ${dePie.e.sentado} · cámara a ${dePie.camara.distancia.toFixed(2)} u`);
  // Y EXIGE LA TRANSICIÓN, no el estado. La rotura deliberada de la costura dejó
  // este control VERDE: con nadie sentándose nunca, `sentado === false` y la
  // cámara en el ojo son el valor de reposo. Ahora pide que ANTES estuviera
  // sentado y hundido, que es lo único que no se cumple solo.
  control("«Stand Up» levanta, y la vista vuelve por la MISMA rampa",
    reciénSentado.e.sentado === true && reciénSentado.camara.distancia > 20
    && dePie.e.sentado === false && dePie.camara.distancia < 1,
    `${reciénSentado.camara.distancia.toFixed(2)} u sentado -> ${dePie.camara.distancia.toFixed(2)} u de pie`);

  // El control positivo del candado: la misma tecla y los mismos segundos.
  const antesDeAndarDePie = dePie.pies;
  await pag.keyboard.down("KeyW");
  await esperar(1500);
  await pag.keyboard.up("KeyW");
  await esperar(200);
  const trasAndarDePie = await leer();
  const andadoDePie = Math.hypot(
    trasAndarDePie.pies[0] - antesDeAndarDePie[0], trasAndarDePie.pies[2] - antesDeAndarDePie[2]);
  console.log(`    de pie, 1,5 s de W -> ${(andadoDePie * 39.37).toFixed(1)} u`);
  control("CONTROL POSITIVO DEL CANDADO: de pie, esa misma W SÍ anda",
    andadoDePie * 39.37 > 20,
    `${(andadoDePie * 39.37).toFixed(1)} u de pie contra ${(andadoSentado * 39.37).toFixed(1)} sentado`);

  // ── 6. LOS TRES EMOTES ──────────────────────────────────────────────────
  console.log(`\n  LOS EMOTES`);
  menu = await abrirMenu();
  await pulsar(menu.botones, "Emote: Nod No");
  await esperar(150);
  const asintiendo = await leer();
  console.log(`    Nod No          emoción ${asintiendo.e.emocion} · muñeco ${asintiendo.muneco} · de un pase ${asintiendo.deUnPase}`);
  // `nod_no` es la animación que FALTABA en el horneado del cuerpo: la lista
  // blanca salía de `global.script` y este nombre está en `emote_no.script`. Sin
  // rehornear, el visor caía a la secuencia 0 y el muñeco decía SÍ.
  control("«Emote: Nod No» pone `nod_no` en el muñeco, y no la secuencia 0",
    asintiendo.e.emocion === "player_nodno" && asintiendo.muneco === "nod_no",
    `el muñeco tiene «${asintiendo.muneco}» (si dice nod_yes, falta rehornear el cuerpo)`);

  await pag.keyboard.down("KeyW");
  await esperar(600);
  await pag.keyboard.up("KeyW");
  await esperar(200);
  const trasMoverse = await leer();
  console.log(`    tras andar      emoción ${trasMoverse.e.emocion} · muñeco ${trasMoverse.muneco}`);
  // Igual: `emocion === null` es el valor de reposo. Hay que haber tenido una.
  control("y andar lo cancela: `game_animate` + `if game.player.speed`",
    asintiendo.e.emocion === "player_nodno" && trasMoverse.e.emocion === null,
    `de ${asintiendo.e.emocion} a ${trasMoverse.e.emocion}`);

  // ── 7. «Item Desc» Y «Forgive Last PK» ──────────────────────────────────
  console.log(`\n  LAS DOS DEL CLIENTE`);
  // La descripción se compara con la del CATÁLOGO, no con «algo salió». Un texto
  // plausible en el sitio correcto es más difícil de ver que uno ausente — el 65.
  // Se lee del horneado, en Node, y no por una puerta del probe: así la
  // comparación no puede salir del mismo sitio que lo que mide.
  const laDeLaEspada = (JSON.parse(readFileSync("build/msr/objetos.json", "utf8"))
    .objetos.find((o) => o.id === "swords_rsword")?.descripcion) ?? null;
  menu = await abrirMenu();
  await pulsar(menu.botones, "Item Desc");
  await esperar(400);
  const trasDesc = await consola();
  console.log(`    Item Desc       ${JSON.stringify(trasDesc.bloque.slice(-90))}`);
  console.log(`    del catálogo    ${JSON.stringify(laDeLaEspada)}`);
  control("«Item Desc» escribe LA DESCRIPCIÓN DEL CATÁLOGO de lo que empuño",
    Boolean(laDeLaEspada) && trasDesc.bloque.includes(laDeLaEspada),
    `el catálogo dice ${JSON.stringify(laDeLaEspada)}`);

  menu = await abrirMenu();
  await pulsar(menu.botones, "Forgive Last PK");
  await esperar(400);
  const trasPerdon = await consola();
  console.log(`    Forgive         ${JSON.stringify(trasPerdon.bloque.slice(-90))}`);
  // Con un solo jugador el original cae en el `else` del comando y escribe ESTA
  // línea. O sea que «no te ha matado nadie» no es un hueco nuestro.
  control("«Forgive Last PK» contesta lo que contesta el original con un jugador",
    trasPerdon.bloque.includes("Forgive: Use this command to remove your accidental death"),
    trasPerdon.bloque.slice(-120));

  control("y la página no ha dado ni un error", errores.length === 0,
    errores.slice(0, 3).join(" · "));
} catch (e) {
  // Una caída es un ROJO y no una nota al pie: el 65 remató con «22 de 22» una
  // sonda que se había caído en el control 22 de 30.
  control("la sonda llega al final sin caerse", false, String(e).slice(0, 300));
} finally {
  const verdes = controles.filter((c) => c.bien === true).length;
  const rojos = controles.filter((c) => c.bien === false).length;
  console.log("");
  for (const c of controles) {
    console.log(`${c.bien ? "  ok" : "FALLA"}  ${c.que}${c.detalle ? `\n        ${c.detalle}` : ""}`);
  }
  console.log(`\n── ${verdes} de ${verdes + rojos} controles ──\n`);
  await nav.close();
  matar(dev);
  process.exit(rojos > 0 ? 1 : 0);
}
