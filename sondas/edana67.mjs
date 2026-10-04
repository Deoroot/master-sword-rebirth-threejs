// EDANA, VIVA — experimento 67.
//
//   npm run sonda:edana67
//
// El 60 midió que los siete vecinos que estaban mudos hablan. Lo que nadie
// había medido de Edana es lo demás: si su taberna se llena, si sus jabalíes
// pelean y si el guion del jugador enciende el mapa. Las tres cosas estaban
// escritas en el `.bsp` y ninguna llegaba a pasar.
//
// ── LOS TRES HUECOS QUE ESTO MIDE ──────────────────────────────────────────
//
// 1. **`scriptfile` ganaba al revés.** `msmonsterserver.cpp:415-416` dice que
//    `scriptfile` escribe siempre y `defscriptfile` sólo si no hay nada. El
//    extractor hacía lo contrario, y por eso **3 373 criaturas de 81 mapas**
//    salían con el guion de su clase. En Edana eran 10: cinco sacerdotes y el
//    viejo eran «Commoner», el cofre del alcalde un cofre cualquiera, y el jefe
//    de los jabalíes un jabalí de 20 de vida en vez del de 60.
//
// 2. **`usetrigger` no existía.** Es el único comando del lenguaje que cruza al
//    `.bsp` (`scriptcmds.cpp:7054`), y el guion del jugador lo usa:
//    `game_player_putinworld` -> `callevent 1.0 activate_stuff` ->
//    `usetrigger player_joined`. Sin él, el mapa no se enciende.
//
// 3. **`SF_MULTIMAN_THREAD` se extraía y no se usaba.** Un `multi_manager` con
//    esa bandera se CLONA y corre la copia (`triggers.cpp:469-474`); el
//    original nunca se bloquea. Sin clonar, la cadena de la taberna se rechaza
//    a sí misma en el segundo ciclo.
//
// ── LAS FORMAS DE QUE ESTO PAREZCA FUNCIONAR Y ESTÉ MAL ────────────────────
//
//   1. «los 48 están montados»                -> ya estaba verde en el 60 con
//                                                seis de ellos equivocados. Se
//                                                piden los NOMBRES.
//   2. «la vida del jefe es 60» leyendo el     -> se lee del bicho MONTADO
//      JSON                                      en la partida
//   3. «`player_joined` se disparó»            -> se leen las DOS puntas: lo que
//                                                el guion pidió y lo que el bus
//                                                recibió
//   4. «hay parroquianos en la taberna»        -> ya los había antes, porque el
//                                                área nace activa. Lo que mide
//                                                la cadena es el CONTADOR y el
//                                                clon, que antes no corrían
//   5. «el jabalí tiene animación de golpe»    -> se mira la VIDA del jugador

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";
import { readFileSync, mkdirSync } from "node:fs";

const PORT = 5267;
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (habia ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = await arrancarVite(PORT);
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });

// LA CAÍDA ES UNA ROJA, NO UNA NOTA AL PIE. La lección del 65: un «X de Y»
// donde Y se calcula al final no puede bajar nunca, así que si esta sonda se va
// por el `catch`, el control que falta se cuenta como fallo.
try {

// ── 0. LO HORNEADO, antes de abrir nada ────────────────────────────────────
const bichos = JSON.parse(readFileSync("build/edana/bichos.json", "utf8"));
const malla = JSON.parse(readFileSync("build/edana/malla.json", "utf8"));
const contador = malla.disparadores.find((e) => e.clase === "ms_counter");
console.log(`
  HORNEADO
    bichos          ${bichos.colocados.length} colocados
    ms_counter      «${contador?.nombre}» count ${contador?.cuenta} -> ${contador?.objetivo}`);
control("el `ms_counter` de Edana trae su `count`, que antes no se extraía",
  contador?.cuenta === 8, `${contador?.cuenta}`);

// ── 1. SE ENTRA A EDANA POR EL MENÚ ────────────────────────────────────────
await entrarPorElMenu(pag, PORT, { mapa: "edana" });
mkdirSync("build/edana/vistas", { recursive: true });
await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
await pag.waitForTimeout(2000);

const censo = await pag.evaluate(() => ({
  mapa: window.probe.vgui2.mapaDeLaPartida(),
  npcs: window.probe.vgui.npcs(),
}));
control("se ha entrado a Edana y no a Gate City", censo.mapa === "edana", `${censo.mapa}`);

// ── 2. LOS SEIS QUE ERAN «COMMONER» ────────────────────────────────────────
//
// El control del 60 —«los 48 del censo están montados»— estaba verde con seis
// de ellos equivocados, porque contaba cabezas. Aquí se piden los nombres, que
// es lo único que distingue un sacerdote de un paisano.
const NOMBRES_QUE_FALTABAN = [
  "High Priest", "Priest of Urdual", "Sembelbin", "Old man",
  "Huge Aggressive Wild Boar", "Ferocious Wild Boar",
];
const puestos = new Set(censo.npcs.map((i) => i.nombre));
const faltan = NOMBRES_QUE_FALTABAN.filter((n) => !puestos.has(n));
console.log(`\n  LOS QUE ERAN «COMMONER»
    montados        ${censo.npcs.length}
    nombres nuevos  ${NOMBRES_QUE_FALTABAN.filter((n) => puestos.has(n)).join(", ") || "ninguno"}`);
control("los seis vecinos de Edana que eran genéricos están con su nombre",
  faltan.length === 0, faltan.join(", ") || "todos");
// Y el negativo: los tres «Commoner» que quedan son los tres que el mapa pide
// por su nombre (`scriptfile "NPCs/default_human"` y sin `defscriptfile`). Si
// fueran diez, la precedencia seguiría al revés.
//
// Y SE FILTRA POR GUION, NO POR NOMBRE: los 11 parroquianos sentados de la
// taberna son `deralia/commoner_sitting` y también se llaman «Commoner», así
// que contar por nombre daba 14 y el control se puso rojo con el arreglo bien
// puesto. Es la misma trampa que el nombre de la clase del 02, al revés.
const genericos = censo.npcs.filter((i) => i.script === "NPCs/default_human");
control("y sólo quedan los TRES paisanos anónimos que el mapa pide de verdad",
  genericos.length === 3, `${genericos.length}`);

// ── 3. EL JEFE DE LOS JABALÍES, LEÍDO DEL BICHO MONTADO ────────────────────
// `probe.ia.estado(n)` da la vida del hostil `n` tal como la tiene la
// instancia montada, que es lo que hay que leer: el JSON ya se comprueba en
// `test/bichos_guion67.test.mjs` y aquí lo que se mide es la partida.
const jabalies = await pag.evaluate(() => {
  const hostiles = window.probe.ia.censo().lista.filter((x) => x.hostil);
  const fuera = [];
  for (let n = 0; n < hostiles.length; n++) {
    const e = window.probe.ia.estado(n);
    if (e) fuera.push({ n, nombre: e.nombre, vida: e.vida, vidaMaxima: e.vidaMaxima });
  }
  return fuera;
});
const jefe = jabalies.find((j) => j.nombre === "Huge Aggressive Wild Boar") ?? null;
console.log(`\n  EL JEFE JABALÍ
    hostiles        ${jabalies.map((j) => `${j.nombre} ${j.vida}/${j.vidaMaxima}`).join(" · ")}`);
control("el jefe de los jabalíes tiene 60 de vida en la PARTIDA, no 20",
  jefe !== null && jefe.vidaMaxima === 60, jefe ? `${jefe.vidaMaxima}` : "no está");

// ── 4. LAS DOS PUNTAS DEL CABLE ────────────────────────────────────────────
//
// `disparados` es lo que el guion del jugador PIDIÓ; `cuenta` es lo que el bus
// RECIBIÓ. Con las dos se distingue «el evento no corrió» de «corrió y el cable
// está roto», que en pantalla son la misma taberna vacía.
//
// El `callevent 1.0 activate_stuff` pide un segundo, y el reloj del guion lo
// mueve `paso()`, así que hay que esperar de verdad.
await pag.waitForTimeout(3000);
const cable = await pag.evaluate(() => ({
  pedidos: window.probe.jugador.disparados(),
  bus: window.probe.mundo.disparadores(),
  noSoportados: window.probe.jugador.noSoportados(),
  // Las guardas que deciden si la cadena corre, leídas del guion. Sin esto, un
  // cero no dice si el evento no corrió o si corrió y la guarda era falsa, que
  // son dos arreglos distintos con el mismo síntoma.
  sincronizado: window.probe.jugador.variable("PLR_LIGHTS_SYNCED"),
  enElMundo: window.probe.jugador.variable("PLR_IN_WORLD"),
  primeraVez: window.probe.jugador.variable("HAD_FIRST_SPAWN"),
}));
console.log(`\n  EL CABLE JUGADOR -> MAPA
    el guion pidió  ${cable.pedidos.join(", ") || "nada"}
    el bus recibió  player_joined x${cable.bus.cuenta.player_joined ?? 0}
    guardas         PLR_LIGHTS_SYNCED=${cable.sincronizado} · PLR_IN_WORLD=${cable.enElMundo} · HAD_FIRST_SPAWN=${cable.primeraVez}
    no soporta      ${cable.noSoportados.join(", ") || "nada"}`);
// EL CONTROL POSITIVO DEL CERO, que la casa exige: si el camino del juego da
// cero, hay que poder demostrar que se habría visto. Se llama el evento a mano
// y se mira si el guion lo contesta. Un cero aquí acusa al guion; un cero
// arriba con esto en verde acusa a quien tenía que llamarlo.
const aMano = await pag.evaluate(() => {
  const antes = window.probe.jugador.disparados().length;
  const contesto = window.probe.jugador.llamar("game_player_putinworld", []);
  return { contesto, nuevos: window.probe.jugador.disparados().length - antes };
});
console.log(`    a mano          contesta ${aMano.contesto}`);
control("el evento existe y el guion lo contesta (control positivo del cero)",
  aMano.contesto === true, `contesta ${aMano.contesto}`);
control("el guion del jugador pide `usetrigger player_joined`",
  cable.pedidos.includes("player_joined"), cable.pedidos.join(", "));
control("y le llega al bus del mapa: las dos puntas del cable",
  (cable.bus.cuenta.player_joined ?? 0) >= 1, `${cable.bus.cuenta.player_joined ?? 0}`);
control("y ningún `usetrigger` se ha quedado sin bus",
  !cable.noSoportados.some((x) => /usetrigger/.test(x)),
  cable.noSoportados.filter((x) => /usetrigger/.test(x)).join(", "));

// ── 5. LA CADENA DE LA TABERNA, QUE NECESITA EL CLON ───────────────────────
//
// `player_joined` -> `patronmm1` -> {`patroncounter`, `patronspawn`,
// `patronspawnreset` +1s} -> y el relé vuelve a `patronmm1`. Sin el clon del
// `multi_manager`, el segundo ciclo se rechaza a sí mismo y el contador se
// queda en 1 de 8. Se mira el CONTADOR y no los parroquianos: los parroquianos
// ya estaban antes, porque su área nace activa (`msmapents.cpp:740-748`), así
// que contarlos sería un verde que mide otra cosa.
console.log(`\n  LA CADENA DE LA TABERNA (12 s)`);
await pag.waitForTimeout(12000);
const cadena = await pag.evaluate(() => window.probe.mundo.disparadores());
// SE CUENTA `patroncounter`, NO `patronmm1`, y lo enseñó la rotura a propósito:
// `cuenta` del bus cuenta **intentos** de disparo, no ejecuciones. Con el clon
// apagado, `patronspawnreset` y `patronkiller` siguen INTENTANDO disparar
// `patronmm1` —y el manager los rechaza por tener el `Use` desactivado—, así que
// `cuenta.patronmm1` subía igual y el control se quedaba verde con la bandera
// sin portar. `patroncounter` sólo se intenta si el manager CORRIÓ de verdad.
// Apartado 4 de CLAUDE.md, la variante «un verde que mide otra cosa».
const ciclos = cadena.cuenta.patroncounter ?? 0;
const cuenta8 = cadena.cuenta.patronkiller ?? 0;
console.log(`    patronmm1       x${cadena.cuenta.patronmm1 ?? 0} intentos
    patroncounter   x${ciclos} ciclos de verdad
    patronkiller    x${cuenta8}
    entidades vivas ${cadena.vivos} de ${cadena.n}`);
// Más de uno es lo que discrimina: sin el clon es exactamente 1, y «>= 1» habría
// seguido verde con la bandera sin portar. Es la lección del 66 con el umbral.
control("la cadena de la taberna da MÁS DE UN ciclo: el clon del `multi_manager`",
  ciclos > 1, `${ciclos} ciclos`);
control("y el `ms_counter` llega a cero y dispara `patronkiller`",
  cuenta8 >= 1, `${cuenta8}`);
// El contador se borra al llegar a cero (`m_flWait = -1` -> `SUB_Remove`), así
// que quedan menos entidades vivas que al empezar.
control("y el contador se borra al agotarse, como el motor",
  cadena.vivos < cadena.n, `${cadena.vivos} de ${cadena.n}`);

// ── 6. LAS ESCENAS DE NPC: LAS MISIONES DE EDANA ───────────────────────────
//
// `ms_npcscript` es el `scripted_sequence` de Master Sword, y Edana trae 18. Son
// sus misiones: el libro de Urdauf y Sumdale, la sidra de Bryan y la tabernera,
// las pruebas del alcalde y el jabalí del viejo. **15 de los 18 son del tipo 2**
// —lanzar un evento en un NPC— y ése es el que está portado.
//
// Se dispara uno por su nombre, como lo dispararía el mapa, y se mira las DOS
// cosas: que la escena llegue al NPC y que el NPC **tenga ese evento**. Un NPC
// sin el evento es un guion incompleto, y eso no es lo mismo que un cable roto.
console.log(`
  LAS ESCENAS DE NPC`);
// SE DISPARA Y SE ESPERA UN FOTOGRAMA, porque `disparar` deja los efectos en la
// bandeja y quien los aplica es el bucle del juego (`aplicarDisparos`). El primer
// pase leía `escenasDeNpc()` en la misma vuelta y daba cero con todo bien: no
// medía el cable, medía su propia prisa.
await pag.evaluate(() => {
  // `boarsdead` es el `killtarget` del jefe jabalí: matarlo avisa al viejo.
  // `askbook` es el libro y `cider` la sidra.
  for (const n of ["boarsdead", "askbook", "cider", "oldmanname"]) window.probe.mundo.disparar(n);
});
await pag.waitForTimeout(600);
const escenas = await pag.evaluate(() => ({
  escenas: window.probe.mundo.escenasDeNpc(),
  sinPortar: window.probe.mundo.disparadores().sinPortar,
}));
for (const e of escenas.escenas) console.log(`    ${e.npc.padEnd(10)} ${e.evento.padEnd(20)} contesta ${e.contesto}`);
control("una escena de mapa llega a su NPC por el `targetname`",
  escenas.escenas.length >= 3, `${escenas.escenas.length} escenas`);
// El del viejo es el que cierra la misión del jabalí, y es el que interesa: su
// `trig_boarsdead` lo dispara el `killtarget` del jefe al morir.
const delViejo = escenas.escenas.find((e) => e.npc === "oldman" && e.evento === "trig_boarsdead");
control("y el viejo del huerto contesta a `trig_boarsdead`: la misión del jabalí",
  Boolean(delViejo?.contesto), delViejo ? `contesta ${delViejo.contesto}` : "no llegó");
// El negativo: que NO todas contesten. Si las cuatro dijeran `true` habría que
// mirar si `llamar` devuelve algo útil o siempre lo mismo.
const contestadas = escenas.escenas.filter((e) => e.contesto).length;
console.log(`    contestan       ${contestadas} de ${escenas.escenas.length}`);

// ── 7. ¿PELEAN LOS JABALÍES? Nadie lo había medido en Edana ────────────────
//
// Las sondas de combate del proyecto —`mundo`, `ia`, `golpe`— corren todas en
// Gate City. Edana tiene seis jabalíes hostiles, dos despiertos, y que ataquen
// no lo había comprobado nadie. Se mide la VIDA DEL JUGADOR, no la animación:
// un jabalí embistiendo con daño cero se ve igual de bien.
//
// Se le planta al jugador delante del jabalí más cercano y se le deja pegarse
// diez segundos, sin defenderse.
const censoIa = await pag.evaluate(() => window.probe.ia.censo());
const despiertos = censoIa.lista.filter((x) => x.hostil && !x.dormido);
console.log(`\n  LOS JABALÍES
    hostiles        ${censoIa.hostiles} de ${censoIa.total}, ${despiertos.length} despiertos`);
control("Edana tiene hostiles despiertos con los que pelear",
  despiertos.length > 0, `${despiertos.length} despiertos de ${censoIa.hostiles}`);

// Se le pone al jugador al lado del hostil 0 y se le deja diez segundos sin
// defenderse. `probe.ia.irA` es el camino que usan `sonda:ia` y `sonda:mundo`
// en Gate City desde el 21; lo que nadie había hecho es correrlo en Edana.
// El daño que el bicho DECLARA, del horneado. Va al lado de la vida perdida a
// propósito: si el daño es `null` el hueco está en el guion y no en la IA, y
// son dos arreglos distintos. Los jabalíes lo tenían a `null` hasta el 67.
const dano = bichos.colocados.find((b) => /Wild Boar/.test(b.nombre ?? ""))?.ia?.dano ?? null;
const antes = await pag.evaluate(() => {
  window.probe.ia.irA(0, 1.5, 0);
  return { vida: window.probe.sesion.vitales()?.vida ?? null, golpes: window.probe.ia.golpes };
});
// SE MIRA CADA MEDIO SEGUNDO Y SE GUARDA EL MÍNIMO, y no el valor del final.
//
// El primer pase leía la vida una sola vez a los diez segundos y la sonda se
// cayó con un `null`: **cuatro jabalíes matan a un personaje nuevo de 15 de
// vida**, y al morir la sesión se queda sin personaje. O sea que la medida
// desaparecía justo cuando el resultado era el más contundente posible. Con el
// mínimo, morir cuenta como lo que es: el máximo daño medible.
let minVida = antes.vida ?? 0;
let murio = false;
// Y los atacantes TAMBIÉN se muestrean, por la misma razón: al morir el jugador
// nadie le caza, así que leerlo al final daba «objetivo null» justo cuando el
// resultado era que te habían matado. Se guarda quién te fichó en algún momento.
const fichadoPor = new Set();
for (let i = 0; i < 20; i++) {
  await pag.waitForTimeout(500);
  const v = await pag.evaluate(() => ({
    vida: window.probe.sesion.vitales()?.vida ?? null,
    atacantes: window.probe.ia.atacantes(),
  }));
  for (const a of v.atacantes) fichadoPor.add(a);
  if (v.vida === null) { murio = true; minVida = 0; break; }
  minVida = Math.min(minVida, v.vida);
}
const despues = await pag.evaluate(() => ({
  vida: window.probe.sesion.vitales()?.vida ?? 0,
  golpes: window.probe.ia.golpes,
  atacantes: window.probe.ia.atacantes(),
  estado: window.probe.ia.estado(0),
  // La ficha del bicho, para poder distinguir «no quiere pegar» de «pega y no
  // hace daño»: si `dano` o `aciertos` son nulos, el guion no los declaró y el
  // hueco está en el guion, no en la IA.
  ficha: null,
}));
console.log(`    vida            ${antes.vida} -> ${minVida} en 10 s${murio ? " (MUERTO)" : ""}
    golpes          ${antes.golpes} -> ${despues.golpes}
    te fichan       ${[...fichadoPor].join(", ") || "ninguno"}
    el hostil 0     persigue «${despues.estado?.objetivo}», quiere «${despues.estado?.intencion}»
                    rango ${despues.estado?.rango} · anim «${despues.estado?.animacion}» · frenado ${despues.estado?.frenado}
    su daño         ${JSON.stringify(dano)}`);
// Dos controles y NO uno, porque miden cosas distintas: que te fiche y que te
// pegue. Un jabalí que te persigue y no hace daño se ve igual de vivo.
control("un jabalí de Edana te ficha: te tiene por objetivo",
  fichadoPor.size > 0, [...fichadoPor].join(", ") || "ninguno");
// El umbral es «baja» y no «se mueve», por la lección del 66: el jugador se
// regenera solo desde el 64, así que la vida SUBE si no pega nadie. Bajar sólo
// lo puede haber hecho el jabalí, y el contador de golpes está al lado como
// segundo testigo por si el daño fuera cero.
control("Y TE PEGA: la vida baja a su lado, con la regeneración en contra",
  minVida < antes.vida, `${antes.vida} -> ${minVida}${murio ? " y muere" : ""}`);
control("y el contador de golpes recibidos sube, que es el otro testigo",
  despues.golpes > antes.golpes, `${antes.golpes} -> ${despues.golpes}`);

await pag.screenshot({ path: "build/edana/vistas/edana67.png" });

} catch (e) {
  console.log(`\n  LA SONDA SE HA CAÍDO: ${String(e).slice(0, 300)}`);
  control("LA SONDA LLEGA AL FINAL", false, String(e).slice(0, 120));
}

// ── el veredicto ───────────────────────────────────────────────────────────
console.log("\n  CONTROLES");
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(72)} ${c.detalle}`);
const mal = controles.filter((c) => !c.bien);
console.log(`\n  ${controles.length - mal.length} de ${controles.length} en verde`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);
console.log(`  captura:        build/edana/vistas/edana67.png\n`);

await nav.close(); matar(dev);
process.exit(mal.length || errores.length ? 1 : 0);
