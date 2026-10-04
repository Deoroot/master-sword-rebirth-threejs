// EDRIN ANDA — experimento 77.
//
//   npm run sonda:edana77
//
// `ms_npcscript` tiene cinco tipos y el 67 portó uno. Los otros cuatro salían
// contados como «usar» con la razón escrita al lado: mover a un NPC pide
// hablarle al rebaño y a la física. Eso sigue siendo verdad; lo que faltaba era
// a quién pasarle el recado.
//
// ── LA CADENA, QUE ES TODA LA MEDIDA ──────────────────────────────────────
//
//   el jugador pisa un trigger_multiple (*109, wait 15)
//        │
//        ▼
//   ms_npcscript  edrinstrict1   type 4   moveanim run
//        │        target edrin   angles 0 260 0
//        │        eventname trig_flowercompliant
//        │        firewhendone edrinspot   firedelay 4
//        │
//        ├──► Edrin CORRE 125 unidades hasta el punto de la entidad
//        ├──► al llegar: game_stopmoving, luego game_reached_dest
//        ├──► gira a 260°  (npcact.cpp:249 pisa el giro de la marcha)
//        ├──► trig_flowercompliant ──► «Hey! Stay out of there!»
//        │
//        └──► 4 s después dispara  edrinspot
//                  │
//                  ▼
//             ms_npcscript  edrinspot  type 0  moveanim walk  angles 0 270 0
//                  └──► Edrin VUELVE andando y se queda mirando a 270°
//
// ── LO QUE NO ES COMO PARECE ──────────────────────────────────────────────
//
// 1. **«Edrin está en `edrinspot`» ES CIERTO ANTES DE EMPEZAR.** Su sitio de
//    nacer y el del `ms_npcscript` están a **32 unidades**, y su proximidad es
//    `width * 1.1` = **35,2**. O sea que `edrinspot` disparado con Edrin en
//    casa no le hace andar un paso: le gira la cara y acaba. Un control que
//    midiera «ha llegado a edrinspot» estaría leyendo el valor de reposo — el
//    apartado 4 de CLAUDE.md entero. Por eso lo que se mide aquí es **el viaje
//    a las flores**, que son 125 unidades, y la vuelta.
//
// 2. **HAY DOS MECANISMOS QUE MANDAN A EDRIN A CASA**, y eso lo escribió el
//    propio mod:
//
//        //As of JUN2007b, Edrin picked up a bug where he refuses to walk home
//        //after his flowers are trampled. This forces him to do so, but it
//        //worries me that this has happened                edana/edrin.script:163
//
//    El mapa lo manda con `edrinspot`, y su guion lo manda otra vez solo, con
//    `setmovedest HOME_LOC 5` en su propio `go_home`. **A sitios distintos**:
//    `HOME_LOC` es donde nació (1408 192 −64) y `edrinspot` está en
//    (1408 224 −96), 32 unidades más allá. «Edrin ha vuelto a casa» no dice
//    cuál de los dos lo mandó.
//
//    Aquí eso se resuelve sin trampa porque **el segundo está muerto**:
//    `setmovedest` entra por el gancho `irA`, que era un `=> {}` desde el 43
//    (el `=> {}` de relleno del apartado 4). Este experimento no lo levanta:
//    lo deja contado. Así que el único que puede mover a Edrin es el mapa, y
//    por eso esta medida es limpia. El día que `irA` llegue a algo, este
//    control deja de distinguir y hay que separarlos por el destino.
//
// 3. **El tipo 0 que apunta al sacerdote NO TIENE `targetname`**, así que en el
//    juego tampoco lo dispara nadie — y además trae un `eventname` que su tipo
//    ni mira. Es del mapa, no nuestro, y sigue contado.
//
// ── LAS FORMAS DE QUE ESTO PAREZCA FUNCIONAR Y ESTÉ MAL ───────────────────
//
//   lo que se vería                  lo que estaría pasando
//   ──────────────────────────────── ────────────────────────────────────────
//   «Edrin está en el punto»         siempre lo estuvo: 32 < 35,2. Se mide el
//                                    VIAJE, con la posición de antes guardada
//   `i.donde` se ha movido           nuestra propia contabilidad. Se compara
//                                    con el NODO DE THREE, que es lo que se
//                                    ve, igual que hizo el 71
//   el NPC acaba a 260°              puede que no haya girado nunca: nace a
//                                    270 y la entidad pide 260, diez grados.
//                                    Por eso se mide ADEMÁS el rumbo de la
//                                    marcha a mitad de camino, que es 230,2°
//   la escena «acaba»                puede acabar por el camino del CORTE, que
//                                    dispara otra cosa. Se lee el diario y se
//                                    comprueba que no está cortada
//   los píxeles cambian              un pueblo con antorchas y 48 vecinos. Se
//                                    mide el suelo de ruido antes de disparar
//
// ── LO QUE ESTA SONDA NO MIDE ─────────────────────────────────────────────
//
//   Los tipos 1 y 3 (`SCRIPT_PLAYANIM` y `MOVE_PLAYANIM`): 25 en el juego y
//   **cero en los dos mapas portados**, así que su control se declara pendiente
//   en vez de contarse entre los verdes (la variante del 50). La rama está
//   escrita y las pruebas de Node la recorren con un NPC de mentira; que la
//   animación se vea acabar no lo mide nadie todavía.
//   El `setmovedest` de los guiones, que sigue siendo un `=> {}`.
//   El grafo de nodos: aquí se anda recto y, si se choca, se para.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";
import { leerPng } from "../tools/png.mjs";
import { readFileSync, existsSync, mkdirSync } from "node:fs";

const PORT = 5277;
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
const U = 39.37;

/** Cuántos píxeles cambian entre dos capturas, con el umbral de `diffpng`. */
function cambian(a, b) {
  if (!a || !b) return { n: -1, de: 0, sinFoto: true };
  const A = leerPng(a), B = leerPng(b);
  if (A.rgba.length !== B.rgba.length) return { n: -1, de: 0 };
  let n = 0;
  for (let i = 0; i < A.rgba.length; i += 4) {
    const d = Math.abs(A.rgba[i] - B.rgba[i]) + Math.abs(A.rgba[i + 1] - B.rgba[i + 1]) +
      Math.abs(A.rgba[i + 2] - B.rgba[i + 2]);
    if (d > 8) n++;
  }
  return { n, de: A.rgba.length / 4 };
}

const foto = async (nombre) => {
  const ruta = `${VISTAS}/edana77-${nombre}.png`;
  await pag.screenshot({ path: ruta });
  return ruta;
};

/** La distancia horizontal entre dos puntos de escena, en METROS. */
const plano = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

try {

// ── 0. EL HORNEADO, antes de abrir el navegador ────────────────────────────
const malla = JSON.parse(readFileSync("build/edana/malla.json", "utf8"));
const scripts = (malla.disparadores ?? [])
  .filter((d) => d.clase === "ms_npcscript" || d.clase === "mstrig_act");
const mueven = scripts.filter((d) => [0, 3, 4].includes(d.tipo ?? 0));
const flores = scripts.find((d) => d.nombre === "edrinstrict1");
const sitio = scripts.find((d) => d.nombre === "edrinspot");
const trigger = (malla.disparadores ?? []).find((d) => d.objetivo === "edrinstrict1");

console.log(`\n  EL HORNEADO: LOS \`ms_npcscript\` DE EDANA
    en total          ${scripts.length}
    por tipo          ${[0, 1, 2, 3, 4].map((t) => `${t}:${scripts.filter((d) => (d.tipo ?? 0) === t).length}`).join("  ")}
    los que MUEVEN    ${mueven.length}
    ${mueven.map((d) => `${String(d.nombre ?? "(sin nombre)").padEnd(14)} tipo ${d.tipo ?? 0}  -> ${d.npc}` +
      `  moveanim ${String(d.animDeAndar ?? "-").padEnd(5)} angles ${(d.angulos ?? []).join(" ")}` +
      `${d.alAcabar ? `  firewhendone ${d.alAcabar} (+${d.retrasoAlAcabar}s)` : ""}`).join("\n    ")}`);

control("Edana trae TRES `ms_npcscript` que mueven: dos del tipo 0 y uno del 4",
  mueven.length === 3 && mueven.filter((d) => (d.tipo ?? 0) === 0).length === 2 &&
  mueven.filter((d) => d.tipo === 4).length === 1,
  mueven.map((d) => d.tipo ?? 0).join(","));

control("`edrinstrict1` es el del tipo 4 y encadena con `edrinspot` a los 4 s",
  flores?.tipo === 4 && flores?.alAcabar === "edrinspot" && flores?.retrasoAlAcabar === 4 &&
  flores?.eventoDelNpc === "trig_flowercompliant",
  `${flores?.alAcabar} +${flores?.retrasoAlAcabar}s, evento ${flores?.eventoDelNpc}`);

control("y lo dispara un `trigger_multiple` que se pisa, no un atajo",
  Boolean(trigger?.caja), trigger ? `caja ${trigger.caja.min.map((v) => v.toFixed(1)).join(",")} .. ${trigger.caja.max.map((v) => v.toFixed(1)).join(",")}` : "no hay");

// EL VALOR DE REPOSO, MEDIDO ANTES DE ABRIR NADA.
//
// La primera versión de esta línea decía «a menos de una proximidad de donde
// Edrin nace» y enseñaba **151 u**, que es la distancia entre los DOS
// `ms_npcscript`. Una etiqueta que no dice lo que mide es peor que no medir:
// el número correcto sale del censo de bichos, que es donde está Edrin.
const censo = JSON.parse(readFileSync("build/edana/bichos.json", "utf8"));
const edrinNace = censo.colocados.find((c) => c.objetivo === "edrin");
const dCasaSitio = plano(edrinNace.escena, sitio.escena) * U;
control("AVISO: `edrinspot` cae DENTRO de la proximidad de donde Edrin nace",
  dCasaSitio < 35.2, `${dCasaSitio.toFixed(0)} u contra una proximidad de 35,2`);
control("y las flores, en cambio, están lejos de verdad: ahí sí hay viaje",
  plano(edrinNace.escena, flores.escena) * U > 100,
  `${(plano(edrinNace.escena, flores.escena) * U).toFixed(0)} u`);

// Gate City, que es por donde esto no se veía.
if (existsSync("build/gatecity/malla.json")) {
  const gc = JSON.parse(readFileSync("build/gatecity/malla.json", "utf8"));
  const n = (gc.disparadores ?? []).filter((d) => d.clase === "ms_npcscript" || d.clase === "mstrig_act");
  control("Gate City tiene CERO `ms_npcscript`: el hueco lo enseña el segundo mapa",
    n.length === 0, `${n.length}`);
}

// ── 1. SE ENTRA POR EL MENÚ ────────────────────────────────────────────────
await entrarPorElMenu(pag, PORT, { mapa: "edana" });
await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
await pag.waitForTimeout(2500);
await pag.waitForFunction(() => window.probe?.mundo?.npc?.("edrin"), null, { timeout: 30000 });

const mapa = await pag.evaluate(() => window.probe.vgui2.mapaDeLaPartida());
control("se ha entrado a Edana y no a Gate City", mapa === "edana", `${mapa}`);

const alEntrar = await pag.evaluate(() => window.probe.mundo.npc("edrin"));
console.log(`\n  EDRIN AL ENTRAR
    nombre            ${alEntrar.nombre}
    nodo              ${alEntrar.nodo.map((v) => v.toFixed(2)).join(", ")}
    rumbo             ${alEntrar.yaw.toFixed(1)}°
    pasea             ${alEntrar.pasea}   en escena ${alEntrar.enEscena}   destino ${alEntrar.mandado ? "sí" : "no"}`);

control("Edrin está en el mundo y por su `targetname`, no por índice de hostil",
  alEntrar.objetivo === "edrin" && !alEntrar.muerto && !alEntrar.dormido, alEntrar.nombre);
control("NEGATIVO: al entrar no tiene destino ni está en ninguna escena",
  !alEntrar.mandado && !alEntrar.enEscena && alEntrar.llegadas === 0,
  `llegadas ${alEntrar.llegadas}`);
control("y nace mirando a 270°, que es lo que dice el mapa",
  Math.abs(alEntrar.yaw - 270) < 1, `${alEntrar.yaw.toFixed(1)}°`);
// El valor de reposo, medido en el juego y no en el horneado.
const yaEstaba = await pag.evaluate(([p, prox]) => {
  const n = window.probe.mundo.npc("edrin");
  return Math.hypot(n.nodo[0] - p[0], n.nodo[2] - p[2]) * 39.37 <= prox;
}, [sitio.escena, 35.2]);
control("CUIDADO: Edrin YA cumple «ha llegado a edrinspot» sin haberse movido",
  yaEstaba === true, "32 u contra una proximidad de 35,2 — por eso se mide el VIAJE");

// Que no pasea: `roam 0` en su guion. Importa porque si paseara, «se ha
// movido» no diría quién lo movió.
control("y NO pasea por su cuenta (`roam 0`): lo que se mueva, lo mueve el mapa",
  alEntrar.pasea === false, `pasea ${alEntrar.pasea}`);

// ── 2. EL SUELO DE RUIDO, antes de disparar nada ───────────────────────────
//
// Dos capturas seguidas desde el mismo sitio, mirando a Edrin. Lo que cambie
// entre ellas es el pueblo moviéndose, y la señal tiene que ser mayor que eso.
await pag.evaluate((p) => {
  window.probe.mundo.poner(p[0] + 3, p[1] + 1.6, p[2] + 3);
  // ── CORRECCIÓN DEL 78 ──────────────────────────────────────────────────
  //
  // Esto decía `mirar(p)`, con el punto en un array, y **`mirar` toma tres
  // números** (`src/dev/sonda.js:1232`). Con un array dentro, `x - p[0]` da
  // `NaN`, el `yaw` del jugador se queda en `NaN` y a partir de ahí el cuerpo
  // deja de simularse: ni cae, ni pisa un volumen. O sea que esta sonda nunca
  // apuntó la cámara a Edrin, y sus dos controles de píxeles midieron lo que
  // hubiera delante — que cambiaba igual, porque el pueblo estaba vivo.
  //
  // Lo destapó el 78 al copiar la llamada: allí el jugador tenía que PISAR un
  // `trigger_once` después de mirar, y con el cuerpo congelado no lo pisaba.
  // Las dieciocho llamadas de las otras sondas pasan tres números.
  window.probe.mundo.mirar(p[0], p[1], p[2]);
}, alEntrar.nodo);
await pag.waitForTimeout(900);
const ruidoA = await foto("ruido-a");
await pag.waitForTimeout(700);
const ruidoB = await foto("ruido-b");
const ruido = cambian(ruidoA, ruidoB);
console.log(`\n  SUELO DE RUIDO    ${ruido.n} px de ${ruido.de} entre dos capturas sin tocar nada`);

// ── 3. SE PISAN LAS FLORES ────────────────────────────────────────────────
//
// Dentro del `trigger_multiple`, que es por donde entra el jugador. No se
// llama a `probe.dispara`: eso sería el atajo que el apartado 3 de CLAUDE.md
// prohíbe, y además no mediría que el volumen del mapa alcanza a nadie.
const centro = [
  (trigger.caja.min[0] + trigger.caja.max[0]) / 2,
  trigger.caja.min[1] + 0.3,
  (trigger.caja.min[2] + trigger.caja.max[2]) / 2,
];
const antes = await pag.evaluate(() => window.probe.mundo.npc("edrin"));
const fotoAntes = await foto("antes");

await pag.evaluate((c) => window.probe.mundo.poner(c[0], c[1], c[2]), centro);
await pag.waitForTimeout(400);
// Y se mira a Edrin desde dentro de las flores, para que la foto tenga sujeto.
await pag.evaluate((p) => window.probe.mundo.mirar(p[0], p[1], p[2]), antes.nodo);  // tres números: la corrección del 78
await pag.waitForTimeout(300);

const alPisar = await pag.evaluate(() => ({
  edrin: window.probe.mundo.npc("edrin"),
  escenas: window.probe.mundo.escenas(),
}));
console.log(`\n  AL PISAR LAS FLORES
    destino           ${alPisar.edrin.mandado ? alPisar.edrin.mandado.origen.map((v) => v.toFixed(0)).join(", ") : "ninguno"}
    proximidad        ${alPisar.edrin.mandado?.proximidad ?? "-"}
    anim pedida       ${alPisar.edrin.animPedida}
    en escena         ${alPisar.edrin.enEscena}
    escenas vivas     ${alPisar.escenas.corriendo.map((s) => `${s.nombre} tipo ${s.tipo} ${s.fase}`).join(" | ") || "ninguna"}`);

control("pisar el `trigger_multiple` arranca la escena: Edrin tiene destino",
  Boolean(alPisar.edrin.mandado), alPisar.edrin.mandado ? "sí" : "no");
control("y queda EN ESCENA, que es el `MONSTERSTATE_SCRIPT` del tipo 4",
  alPisar.edrin.enEscena === true, `${alPisar.edrin.enEscena}`);
control("con la animación que pide el mapa: `moveanim run`",
  alPisar.edrin.animPedida === "run", `${alPisar.edrin.animPedida}`);
control("la proximidad es `width * 1.1` y no un número elegido",
  Math.abs((alPisar.edrin.mandado?.proximidad ?? 0) - 35.2) < 0.01,
  `${alPisar.edrin.mandado?.proximidad}`);
// Y el destino es el de LA ENTIDAD, que es lo que distingue «anda» de «anda
// a donde sea».
const destinoEsperado = flores.escena.map((v) => v * U);
control("el destino es el `origin` del `ms_npcscript`, no otro sitio",
  alPisar.edrin.mandado &&
  plano(alPisar.edrin.mandado.origen, destinoEsperado) < 1,
  alPisar.edrin.mandado ? alPisar.edrin.mandado.origen.map((v) => v.toFixed(0)).join(", ") : "-");

// ── 4. ¿SE MUEVE EL DIBUJO? ────────────────────────────────────────────────
//
// A mitad de camino: el rumbo de la MARCHA, que no es ni el de nacer (270) ni
// el que la entidad pedirá al llegar (260). Sin esta medida, «acaba a 260» no
// distingue haber girado de no haberse movido.
await pag.waitForTimeout(500);
const enMarcha = await pag.evaluate(() => window.probe.mundo.npc("edrin"));
console.log(`    en marcha         nodo ${enMarcha.nodo.map((v) => v.toFixed(2)).join(", ")}  rumbo ${enMarcha.yaw.toFixed(1)}°  frenado ${enMarcha.frenado}`);
control("a mitad de camino mira al RUMBO DE LA MARCHA (230,2°), ni a 270 ni a 260",
  Math.abs(enMarcha.yaw - 230.2) < 12, `${enMarcha.yaw.toFixed(1)}°`);

// Y se espera a que llegue, con tope: si no llega, se dice.
await pag.waitForFunction(() => !window.probe.mundo.npc("edrin").mandado, null, { timeout: 20000 })
  .catch(() => {});
await pag.waitForTimeout(400);
const alLlegar = await pag.evaluate(() => ({
  edrin: window.probe.mundo.npc("edrin"),
  escenas: window.probe.mundo.escenas(),
  dichos: window.probe.hud.estado()?.consola ?? null,
  escenasDeNpc: window.probe.mundo.escenasDeNpc(),
}));
const fotoLlegada = await foto("en-las-flores");

const recorrido = plano(alLlegar.edrin.nodo, antes.nodo) * U;
console.log(`\n  HA LLEGADO A LAS FLORES
    nodo              ${alLlegar.edrin.nodo.map((v) => v.toFixed(2)).join(", ")}
    recorrido         ${recorrido.toFixed(0)} unidades
    rumbo             ${alLlegar.edrin.yaw.toFixed(1)}°
    llegadas          ${alLlegar.edrin.llegadas}
    diario            ${alLlegar.escenas.diario.map((d) => d.que).join(" -> ")}`);

control("EL NODO DE THREE se ha movido, no sólo la cuenta",
  recorrido > 60, `${recorrido.toFixed(0)} u`);
control("y ha llegado al punto de la entidad, dentro de su proximidad",
  plano(alLlegar.edrin.nodo, flores.escena) * U <= 35.2 + 1,
  `${(plano(alLlegar.edrin.nodo, flores.escena) * U).toFixed(0)} u del punto`);
control("la manada lo da por llegado una vez, no sesenta",
  alLlegar.edrin.llegadas === 1, `${alLlegar.edrin.llegadas}`);
control("acaba mirando a 260°, que es el `angles` de la ENTIDAD (npcact.cpp:249)",
  Math.abs(alLlegar.edrin.yaw - 260) < 1.5, `${alLlegar.edrin.yaw.toFixed(1)}°`);
// ── Y SIGUE EN ESCENA, QUE ES LO CORRECTO ────────────────────────────────
//
// Este control decía lo contrario y salió rojo con el trabajo bien hecho. Lo
// que suelta al NPC es `FireTarget` (`m_MonsterState = MONSTERSTATE_NONE`,
// npcact.cpp:309), y con un `firedelay` **`FireTarget` no corre hasta cuatro
// segundos después** (`:295-299`). O sea que durante esos cuatro segundos
// Edrin sigue en `MONSTERSTATE_SCRIPT` — y eso tiene consecuencia: en esa
// ventana la guarda de `Act` (`:128`) rechaza cualquier otra escena sobre él.
// Lo raro era mi control, no el código.
control("durante el `firedelay` SIGUE en escena: `FireTarget` todavía no ha corrido",
  alLlegar.edrin.enEscena === true, `${alLlegar.edrin.enEscena}`);

// El evento del tipo 4 ha llegado a SU GUION, y el guion ha contestado.
const flower = alLlegar.escenasDeNpc.filter((e) => e.evento === "trig_flowercompliant");
control("el tipo 4 le lanza `trig_flowercompliant` a su guion, y contesta",
  flower.length >= 1 && flower.every((e) => e.contesto), `${flower.length} llamadas`);
// Y eso se ve en pantalla, que es la prueba de que el guion corrió de verdad.
const dijo = (alLlegar.dichos?.lineas ?? []).map((l) => String(l.texto ?? l)).join(" | ");
control("y el jugador lo LEE: «Hey! Stay out of there!»",
  /stay out of there/i.test(dijo), dijo.slice(-90) || "(consola vacía)");

// Que ha pasado por el camino bueno hasta aquí: anda, lanza el evento y se
// pone a esperar. Si hubiera habido un corte no habría `espera` ninguna — el
// `m_EarlyBreak` se salta el `firedelay` (npcact.cpp:295). El «acaba» se mira
// más abajo, cuando de verdad ha acabado: aquí todavía está esperando, y
// pedirlo ahora era medir el instante equivocado.
const pasos = alLlegar.escenas.diario.filter((d) => d.nombre === "edrinstrict1").map((d) => d.que);
control("el camino es `anda -> evento -> espera`, el del tipo 4 sin cortes",
  pasos.join(" ") === "anda evento espera", pasos.join(" -> ") || "nada");

const pix = cambian(fotoAntes, fotoLlegada);
console.log(`    píxeles           ${pix.n} de ${pix.de} cambian, contra ${ruido.n} de ruido`);
control("la PANTALLA cambia al andar Edrin, por encima del ruido",
  pix.n > Math.max(ruido.n * 3, 2000), `${pix.n} px contra ${ruido.n} de ruido`);

// ── 5. Y CUATRO SEGUNDOS DESPUÉS, VUELVE ──────────────────────────────────
//
// Es la segunda mitad y el único sitio donde el tipo 0 de verdad mueve algo:
// `edrinspot` desde las flores son 151 unidades, muy por encima de los 35,2.
const esperando = alLlegar.escenas.corriendo.find((s) => s.nombre === "edrinstrict1");
control("mientras espera sus 4 s la escena sigue viva, en `esperandoElDisparo`",
  esperando?.fase === "esperandoElDisparo", esperando?.fase ?? "ninguna");

await pag.waitForFunction(() => window.probe.mundo.npc("edrin").mandado, null, { timeout: 12000 })
  .catch(() => {});
const volviendo = await pag.evaluate(() => ({
  edrin: window.probe.mundo.npc("edrin"),
  escenas: window.probe.mundo.escenas(),
}));
console.log(`\n  LA VUELTA
    destino           ${volviendo.edrin.mandado ? volviendo.edrin.mandado.origen.map((v) => v.toFixed(0)).join(", ") : "ninguno"}
    anim pedida       ${volviendo.edrin.animPedida}
    escenas vivas     ${volviendo.escenas.corriendo.map((s) => `${s.nombre} ${s.fase}`).join(" | ") || "ninguna"}`);

control("el `firewhendone` dispara `edrinspot` y Edrin vuelve a tener destino",
  Boolean(volviendo.edrin.mandado), volviendo.edrin.mandado ? "sí" : "no");
control("y ahora ANDA (`moveanim walk`), no corre: son dos escenas distintas",
  volviendo.edrin.animPedida === "walk", `${volviendo.edrin.animPedida}`);
const destinoVuelta = sitio.escena.map((v) => v * U);
control("el destino de la vuelta es el de `edrinspot`, no el de las flores",
  volviendo.edrin.mandado && plano(volviendo.edrin.mandado.origen, destinoVuelta) < 1,
  volviendo.edrin.mandado ? volviendo.edrin.mandado.origen.map((v) => v.toFixed(0)).join(", ") : "-");

await pag.waitForFunction(() => !window.probe.mundo.npc("edrin").mandado, null, { timeout: 20000 })
  .catch(() => {});
await pag.waitForTimeout(500);
const enCasa = await pag.evaluate(() => ({
  edrin: window.probe.mundo.npc("edrin"),
  escenas: window.probe.mundo.escenas(),
}));
const fotoCasa = await foto("en-casa");
const vuelta = plano(enCasa.edrin.nodo, alLlegar.edrin.nodo) * U;
console.log(`    ha vuelto         ${vuelta.toFixed(0)} u, nodo ${enCasa.edrin.nodo.map((v) => v.toFixed(2)).join(", ")}, rumbo ${enCasa.edrin.yaw.toFixed(1)}°`);

// EL UMBRAL NO SE INVENTA: la vuelta tiene que ser más que la proximidad,
// porque menos que eso es exactamente lo que `edrinspot` hace cuando Edrin ya
// está en casa — no andar. La primera versión pedía 100 u «porque los puntos
// están a 151», y salió roja con 81: los dos viajes paran en el BORDE de su
// círculo de proximidad, así que lo andado es siempre menos que la distancia
// entre los puntos. El umbral medía mi aritmética.
control("vuelve andando de verdad: más que una proximidad entera",
  vuelta > 35.2 * 2, `${vuelta.toFixed(0)} u, contra 35,2 de proximidad`);
control("y acaba mirando a 270°, el `angles` de `edrinspot`",
  Math.abs(enCasa.edrin.yaw - 270) < 1.5, `${enCasa.edrin.yaw.toFixed(1)}°`);
control("ha llegado DOS veces en total: una por escena",
  enCasa.edrin.llegadas === 2, `${enCasa.edrin.llegadas}`);
control("y no queda ninguna escena corriendo",
  enCasa.escenas.corriendo.length === 0, `${enCasa.escenas.corriendo.length} vivas`);
// AHORA sí: ya ha acabado, y por el camino bueno.
const acabadas = enCasa.escenas.diario.filter((d) => d.que === "acaba");
control("NEGATIVO: las dos escenas acaban BIEN, ninguna cortada",
  acabadas.length === 2 && acabadas.every((d) => d.cortada === false),
  acabadas.map((d) => `${d.nombre}:${d.cortada ? "cortada" : "bien"}`).join(", ") || "ninguna");
// Y el control positivo del `MONSTERSTATE_SCRIPT`: estaba puesto durante el
// `firedelay` y ahora está quitado. Sin este par, «sigue en escena» no se
// distinguiría de «nunca se suelta».
control("y `FireTarget` lo ha soltado: ya no está en escena (npcact.cpp:309)",
  enCasa.edrin.enEscena === false, `${enCasa.edrin.enEscena}`);
// Vuelve a donde estaba, y eso se ve.
control("acaba a menos de una proximidad de donde empezó",
  plano(enCasa.edrin.nodo, antes.nodo) * U <= 35.2 + 2,
  `${(plano(enCasa.edrin.nodo, antes.nodo) * U).toFixed(0)} u de su sitio`);
const pixCasa = cambian(fotoLlegada, fotoCasa);
control("y la pantalla vuelve a cambiar en la vuelta",
  pixCasa.n > Math.max(ruido.n * 3, 2000), `${pixCasa.n} px contra ${ruido.n} de ruido`);

// ── 6. LOS CONTADORES ─────────────────────────────────────────────────────
const cuentas = await pag.evaluate(() => window.probe.mundo.disparadores().sinPortar);
console.log(`\n  LO QUE SIGUE SIN PORTARSE
    ${Object.entries(cuentas).map(([k, v]) => `${k.padEnd(42)} ${v}`).join("\n    ") || "nada"}`);

control("ya no se cuenta ningún `ms_npcscript` como «usar» sin portar",
  !Object.keys(cuentas).some((k) => /ms_npcscript/.test(k)),
  Object.keys(cuentas).filter((k) => /ms_npcscript/.test(k)).join(", ") || "ninguno");

// El del sacerdote: sin `targetname`, nadie lo dispara. Se comprueba que el
// mundo tampoco lo dispara por su cuenta.
control("el tipo 0 sin `targetname` no lo dispara nadie, como en el juego",
  (enCasa.escenas.diario ?? []).every((d) => d.npc !== "priest"),
  `${(enCasa.escenas.diario ?? []).filter((d) => d.npc === "priest").length} escenas del sacerdote`);

// ── 7. Y LA ROTURA QUE NO SE PUEDE FINGIR ─────────────────────────────────
//
// Se dispara `edrinspot` con Edrin YA en su sitio. Es el caso del aviso 1: la
// escena arranca, se da por llegada en el acto y le gira la cara. Lo que NO
// puede pasar es que ande.
const antesDelSegundo = await pag.evaluate(() => window.probe.mundo.npc("edrin"));
await pag.evaluate(() => window.probe.mundo.disparaDelMapa("edrinspot"));
await pag.waitForTimeout(600);
const trasElSegundo = await pag.evaluate(() => window.probe.mundo.npc("edrin"));
const movio = plano(trasElSegundo.nodo, antesDelSegundo.nodo) * U;
control("`edrinspot` con Edrin en casa NO le hace andar: 32 u < 35,2 de proximidad",
  movio < 5, `se ha movido ${movio.toFixed(1)} u`);
control("pero la escena sí corre: le sube la cuenta de llegadas",
  trasElSegundo.llegadas > antesDelSegundo.llegadas,
  `${antesDelSegundo.llegadas} -> ${trasElSegundo.llegadas}`);

// ── RESUMEN ───────────────────────────────────────────────────────────────
const bien = controles.filter((c) => c.bien).length;
console.log(`\n  CONTROLES`);
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(74)} ${c.detalle}`);
console.log(`\n  ${bien} de ${controles.length} en verde`);
// CORRECCIÓN DEL 78: ya tienen caso. `gertenheld_forest2` entró como tercer
// mapa portado y `sondas/gertenheld78.mjs` los recorre, 49 de 49.
console.log(`  (los tipos 1 y 3 los mide \`npm run sonda:gertenheld78\` desde el 78)`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);
console.log(`  capturas:       ${VISTAS}/edana77-*.png\n`);

await nav.close();
matar(dev);
process.exit(bien === controles.length && errores.length === 0 ? 0 : 1);

} catch (e) {
  // UNA CAÍDA ES UNA ROJA, NO UNA NOTA AL PIE. El 65 remató «22 de 22» con la
  // sonda caída en el control 22 de 30: un «X de Y» donde la Y se calcula al
  // final no puede bajar nunca.
  console.log(`\n  LA SONDA SE HA CAÍDO: ${e.message}`);
  console.log(`  llevaba ${controles.filter((c) => c.bien).length} de ${controles.length} controles corridos`);
  for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(74)} ${c.detalle}`);
  try { await nav.close(); } catch {}
  matar(dev);
  process.exit(1);
}
