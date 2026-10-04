// SE SUELTA, Y NO SE DEJA CAER: SE TIRA — experimento 75.
//
//   npm run sonda:edana75
//
// El 71 puso objetos en el suelo por la vía del mapa: la manzana del manzano de
// Edana. La otra vía es el jugador, y era la que faltaba: `bind "c" "drop"`
// está en `config.cfg:16` y la tecla está en la tabla de `src/juego/teclas.js`
// **desde el experimento 24**, sin que nada la leyera.
//
// ── LA CADENA ─────────────────────────────────────────────────────────────
//
//   tecla c  ->  "drop"              config.cfg:16
//        │
//        ▼
//   ClientCommand2, rama "drop"      client.cpp:931-957
//        │  UTIL_MakeVectors(pev->angles)   <- el TERCIO, aquí empieza
//        ▼
//   CBasePlayer::DropItem            playershared.cpp:943-990
//        │  v_forward*175 + (0,0,60)
//        ▼
//   CGenericItem::Drop               genericitem.cpp:1319-1383
//        │  origin = ojo + v_forward*10;  game_drop;  RemoveItem
//        ▼
//   FallInit  ->  el mismo del 71: tamaño punto, game_fall, reloj de 120 s
//        │
//        ▼
//   FallThink  **sólo si FL_ONGROUND**   <- y aquí está el segundo caso
//
// ── LO QUE NO ERA COMO PARECÍA ────────────────────────────────────────────
//
// 1. **Soltar mirando al suelo tira el objeto HACIA ARRIBA.** El `v_forward`
//    con el que se calculan el sitio y la velocidad sale de `pev->angles`, y el
//    `pev->angles` de un cliente lo escribe el motor:
//    `v.angles[0] = -pmove->angles[0] / 3.0` (sv_user.cpp:993). Un tercio del
//    cabeceo de la vista **y con el signo dado la vuelta**. Mirando 60° al
//    suelo el objeto sale 20° hacia arriba, y lo más abajo que se puede soltar
//    algo es 30° por encima de la horizontal: no hay manera de dejar nada a los
//    pies. Por eso en Master Sword soltar parece lanzar.
//
// 2. **Un suelo que no es suelo.** `FallThink` sólo se tumba, suena y reinicia
//    el reloj con `FL_ONGROUND` (genericitem.cpp:1397); si no, reintenta cada
//    0,1 s para siempre (:1413). Y a un objeto de tamaño punto le da
//    `FL_ONGROUND` un `SV_PointContents` una unidad por debajo
//    (sv_phys.cpp:1081-1109) que mira el **hull del modelo del mundo** y de las
//    entidades sólo las `SOLID_NOT` (world.cpp:625-626 y 695-709). Una
//    `func_door` es `SOLID_BSP`: **lo que se queda sobre la tapa de la cloaca
//    de Edana no toca suelo nunca.** Es el segundo caso que le faltaba a la
//    pieza del 71, donde todo caía contra el modelo 0 y esa rama no corría.
//
// 3. **`CanDrop` tiene tres candados y dos no cierran nada.**
//    `fNextActionTime` se declara (weapons.h:202), se lee dos veces y **no se
//    asigna en ningún sitio del mod**: vale cero y la pregunta es `time < 0`.
//    Y a `m_PrefHand == HAND_PLAYERHANDS` se llega con `sethand undroppable`,
//    que **no sale en ninguno de los 2 884 guiones**. O sea que todo lo que
//    llevas encima se puede soltar, y lo único que lo impide es estar a media
//    estocada.
//
// 4. **El «pulsa otra vez para soltar» está muerto por una tautología.**
//    `bDropAttempted = true;` y la línea siguiente pregunta
//    `if ((bDropAttempted && ...IsPlayer()) || !...IsPlayer())`, que es cierta
//    siempre. Las dos ramas del `else if` —incluida la que haría que soltar un
//    hechizo lo deshiciera— no se ejecutan jamás, y el temporizador de los 100
//    tics que las remataba está comentado (:1512-1524). Es el hermano del
//    `ItemCount = 1` del 71, en el mismo archivo.
//
// 5. **El oráculo del `_floor` se puede engañar.** Con la fórmula vieja del
//    `+2`, `sheath_back` cae en `oldbook_floor`: pasa el control del nombre y
//    es el modelo de otra cosa. Por eso el contraste del horneado ya no se
//    imprime: es un control, y lo que afirma es que la fórmula FALLA.
//
// ── LAS FORMAS DE QUE ESTO PAREZCA FUNCIONAR Y ESTÉ MAL ───────────────────
//
//   lo que se vería                  lo que estaría pasando
//   ──────────────────────────────── ────────────────────────────────────────
//   el objeto cae al suelo           pero con el cabeceo de la VISTA en vez
//   delante de ti y se tumba         del tercio, y entonces lo estás dejando
//                                    y no tirando. Se mide el ángulo, no que
//                                    haya caído: con la vista a 60° los dos
//                                    acaban en el suelo
//   se tira y aparece en el suelo    pero el nodo de Three se queda en el
//                                    origen del mapa. Se comparan los TRES
//                                    ejes y se pide que el nodo esté lejos
//                                    del cero (la lección del 71)
//   sobre la tapa no se tumba        pero porque no ha llegado a chocar con
//                                    nada. El control positivo de al lado
//                                    —soltar a un metro, en el suelo de
//                                    verdad— tiene que salir TUMBADO
//   «a media estocada no se suelta»   pero el brazo estaba quieto y se estaba
//                                    midiendo el reposo. `soltarAtacando`
//                                    comprueba primero que está atacando
//
// ── LO QUE ESTA SONDA NO MIDE ─────────────────────────────────────────────
//
//   El resbalar de `SV_FlyMove` (aquí un rayo para el objeto en seco), el
//   `game_drop` de los otros quince guiones, los hechizos —este puerto no
//   tiene— y soltar algo de DENTRO del zurrón. Está contado en la cabecera de
//   `src/play/suelo.js` con la cuenta de hoy.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";
import { readFileSync, existsSync, mkdirSync } from "node:fs";

const PORT = 5272;
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

mkdirSync("build/edana/vistas", { recursive: true });

try {

// ── 0. EL HORNEADO, antes de abrir el navegador ────────────────────────────
const malla = JSON.parse(readFileSync("build/edana/malla.json", "utf8"));
const suelo = JSON.parse(readFileSync("build/msr/suelo.json", "utf8"));
const objetos = JSON.parse(readFileSync("build/msr/objetos.json", "utf8"));
const U = malla.unidadesPorMetro;

const delJugador = (objetos.nuevoPersonaje?.armas ?? []).concat(objetos.nuevoPersonaje?.gratis ?? []);
const horneados = suelo.objetos.filter((o) => delJugador.includes(o.guion));
console.log(`\n  EL HORNEADO DE LO QUE SE PUEDE SOLTAR
    el jugador puede llevar  ${delJugador.length} guiones
    horneados con su suelo   ${horneados.length}
    ${horneados.map((o) => `${o.guion.padEnd(20)} body ${String(o.cuerpo).padStart(3)} -> ${o.submodelo?.nombre ?? "(sin modelo del mundo)"}`).join("\n    ")}`);

control("lo que el jugador puede llevar trae su submodelo del suelo horneado",
  horneados.length === delJugador.length,
  `${horneados.length} de ${delJugador.length}`);

const espada = suelo.objetos.find((o) => o.guion === "swords_rsword");
control("la espada cae en `rustedswordshortsword_floor`, por `base_weapon` (+2)",
  /_floor$/i.test(espada?.submodelo?.nombre ?? ""),
  `body ${espada?.cuerpo} -> ${espada?.submodelo?.nombre}`);

// EL SEGUNDO CASO del lector de `game_fall`, que es lo que el 71 no pudo tener:
// con un solo objeto «he leído el guion» y «he acertado el número» son el mismo
// verde. La espada suma 2 y la manzana 1, así que ninguna fórmula única vale.
const manzana = suelo.objetos.find((o) => o.guion === "health_apple");
control("SEGUNDO CASO: la espada y la manzana NO usan la misma cuenta",
  espada && manzana && espada.cuerpo - manzana.cuerpo !== 0 &&
  espada.animacion === "shortsword_floor_idle" && manzana.animacion === "apple_floor_idle",
  `espada ${espada?.animacion}, manzana ${manzana?.animacion}`);

// EL 96: `tools/suelo.mjs` mete desde el 96 todo lo empuñable, y ya no es UNA
// mano sin modelo del mundo sino 33: los 31 hechizos (todos `setworldmodel
// none`, magic_hand_base.script:24), los puños y la plantilla
// `base_weapon_new`. El `length === 1` era el supuesto de la lista del 75, no
// la regla; la regla —la de relámpago está, y ninguna sin modelo trae malla—
// se sigue exigiendo entera.
const sinMundo = suelo.objetos.filter((o) => !o.modelo || o.modelo === "none");
control("la mano de relámpago no trae malla, y el motor tampoco la dibuja",
  sinMundo.some((o) => o.guion === "magic_hand_lightning_weak") && sinMundo.every((o) => !o.clave),
  `${sinMundo.length} sin modelo del mundo, ${sinMundo.filter((o) => o.clave).length} con malla`);

const tapa = (malla.interactivas?.correderas ?? []).find((c) => c.nombre === "sewer_door");
control("Edana tiene la tapa de la cloaca, que es la `func_door` del segundo caso",
  Boolean(tapa), tapa ? `sewer_door, recorrido ${tapa.recorrido.toFixed(2)} m` : "no está");

// ── 1. SE ENTRA POR EL MENÚ ────────────────────────────────────────────────
await entrarPorElMenu(pag, PORT, { mapa: "edana" });
// El menú deja al jugador en el panel `newchar`; el personaje lo crea quien
// entra, y aquí hace falta de verdad: soltar es soltar lo que uno LLEVA.
await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
await pag.waitForTimeout(2500);
await pag.waitForFunction(() => window.probe?.mundo?.suelo, null, { timeout: 30000 });

const mapa = await pag.evaluate(() => window.probe.vgui2.mapaDeLaPartida());
control("se ha entrado a Edana y no a Gate City", mapa === "edana", `${mapa}`);

const alEntrar = await pag.evaluate(() => ({
  suelo: window.probe.mundo.suelo().length,
  cuentas: window.probe.mundo.cuentasDelSuelo(),
  mano: window.probe.mundo.loQueLlevaLaMano(),
  catalogo: window.probe.mundo.catalogoDelSuelo().map((o) => o.guion),
}));
console.log(`\n  AL ENTRAR
    en el suelo     ${alEntrar.suelo}
    en la mano      ${alEntrar.mano}
    catálogo        ${alEntrar.catalogo.length} guiones`);
control("EL CONTROL NEGATIVO: al entrar no hay nada tirado",
  alEntrar.suelo === 0 && alEntrar.cuentas.tirados === 0,
  `${alEntrar.suelo} en el suelo, ${alEntrar.cuentas.tirados} tirados`);
control("y el catálogo del suelo trae ya lo que el jugador puede soltar",
  alEntrar.catalogo.length >= 12 && alEntrar.catalogo.includes("swords_rsword"),
  `${alEntrar.catalogo.length} guiones`);

// Se pone la espada oxidada en la mano: el personaje de partida trae la que
// eligió el menú y lo que se mide aquí es soltar un arma concreta.
const conEspada = await pag.evaluate(() => window.probe.mundo.empunarPorId("swords_rsword"));
control("CONTROL POSITIVO del instrumento: la mano lleva la espada",
  conEspada === "swords_rsword", `${conEspada}`);

// ── 2. EL TERCIO, medido sin soltar nada ───────────────────────────────────
//
// Mirando al suelo. Se lee el `pev->angles` que saldría y el `v_forward` que
// sale de él: el cabeceo no es el de la vista y la vertical del empuje es
// POSITIVA, o sea que el objeto saldría hacia arriba mirando hacia abajo.
const tercio = await pag.evaluate(() => {
  // Mirar 60 grados al suelo, desde donde sea: lo que se mide es el ángulo.
  const { ojo: p } = window.probe.mundo.donde();
  window.probe.mundo.mirar(p[0], p[1] - Math.tan((60 * Math.PI) / 180) * 3, p[2] - 3);
  return window.probe.mundo.rumboDeSoltarAhora();
});
const vista = (Math.asin(-tercio.mirando[1]) * 180) / Math.PI;
const salida = (Math.asin(tercio.forward[1]) * 180) / Math.PI;
console.log(`\n  EL TERCIO, CON LA VISTA EN EL SUELO
    la vista mira   ${vista.toFixed(1)}° hacia ABAJO
    pev->angles[0]  ${tercio.angulos[0].toFixed(2)}   (la vista daría ${vista.toFixed(2)})
    el empuje sale  ${salida.toFixed(1)}° hacia ${salida > 0 ? "ARRIBA" : "abajo"}`);
control("mirando al suelo, el objeto sale HACIA ARRIBA: el signo está del revés",
  salida > 0 && vista > 30, `vista ${vista.toFixed(1)}° abajo, empuje ${salida.toFixed(1)}° arriba`);
control("y es un TERCIO de la vista, no la vista: lo más abajo son 30° arriba",
  Math.abs(Math.abs(tercio.angulos[0]) - vista / 3) < 0.5,
  `|${tercio.angulos[0].toFixed(2)}| contra ${vista.toFixed(2)}/3 = ${(vista / 3).toFixed(2)}`);

// ── 3. SE SUELTA, Y SE TIRA ────────────────────────────────────────────────
//
// Al frente, para que el vuelo se vea en la horizontal. Se mide el ojo ANTES,
// porque el sitio de salida es `ojo + v_forward*10` y eso es lo que distingue
// «lo ha puesto donde el jugador» de «lo ha puesto en el cero».
const tiro = await pag.evaluate(() => {
  const { ojo: p } = window.probe.mundo.donde();
  window.probe.mundo.mirar(p[0], p[1], p[2] - 3);   // al frente
  const ojo = p;
  return {
    ojo, antes: window.probe.mundo.loQueLlevaLaMano(),
    soltado: window.probe.mundo.soltar(),
    despues: window.probe.mundo.loQueLlevaLaMano(),
    suelo: window.probe.mundo.suelo(),
    cuentas: window.probe.mundo.cuentasDelSuelo(),
  };
});
console.log(`\n  LA TECLA c, CON LA ESPADA EN LA MANO
    en la mano antes ${tiro.antes}  ->  después ${tiro.despues}
    soltado          ${JSON.stringify(tiro.soltado)}
    velocidad        [${(tiro.soltado?.velocidad ?? []).map((v) => v.toFixed(0)).join(", ")}] u/s
    en el suelo      ${tiro.suelo.map((o) => `${o.guion} ${o.estado}`).join(", ") || "nada"}`);
control("la `c` suelta lo que lleva la mano, y la mano se queda vacía",
  tiro.soltado?.guion === "swords_rsword" && tiro.despues === null,
  `${tiro.soltado?.guion}, mano ${tiro.despues}`);
control("sale TIRADO y no soltado: 175 de empuje y 60 de alzado",
  tiro.soltado && Math.hypot(tiro.soltado.velocidad[0], tiro.soltado.velocidad[2]) > 150 &&
  tiro.soltado.velocidad[1] > 40,
  `horizontal ${Math.hypot(tiro.soltado?.velocidad[0] ?? 0, tiro.soltado?.velocidad[2] ?? 0).toFixed(0)}, vertical ${(tiro.soltado?.velocidad[1] ?? 0).toFixed(0)}`);

// ── 4. VUELA, CAE Y SE TUMBA ───────────────────────────────────────────────
const nacio = tiro.soltado?.donde ?? [0, 0, 0];
await pag.waitForTimeout(2000);
const cayo = await pag.evaluate(() => ({
  suelo: window.probe.mundo.suelo(),
  nodos: window.probe.mundo.nodosDelSuelo(),
  caidas: window.probe.mundo.caidasDelSuelo(),
  cuentas: window.probe.mundo.cuentasDelSuelo(),
}));
const e = cayo.suelo.find((o) => o.guion === "swords_rsword");
const nodo = cayo.nodos.find((n) => n.guion === "swords_rsword");
const avance = e ? Math.hypot(e.donde[0] - nacio[0], e.donde[2] - nacio[2]) : 0;
console.log(`\n  DESPUÉS DE VOLAR
    estado          ${e?.estado}
    salió de        [${nacio.map((v) => (v / U).toFixed(2)).join(", ")}] m
    está en         [${(e?.donde ?? []).map((v) => (v / U).toFixed(2)).join(", ")}] m
    ha avanzado     ${(avance / U).toFixed(2)} m en horizontal
    el NODO está en [${(nodo?.posicion ?? []).map((v) => v.toFixed(2)).join(", ")}]
    cabeceo nodo    ${nodo?.cabeceo?.toFixed(1)}°
    ángulos         ${JSON.stringify(e?.angulos)}
    le quedan       ${e?.leQueda?.toFixed(1)} s
    sonidos         ${JSON.stringify(cayo.caidas)}`);
control("ha VOLADO: ha avanzado más de un metro en horizontal",
  avance / U > 1, `${(avance / U).toFixed(2)} m`);
control("y ha tocado suelo: `FallThink` con `FL_ONGROUND`",
  e?.estado === "suelo" && cayo.cuentas.aterrizados >= 1,
  `${e?.estado}, ${cayo.cuentas.aterrizados} aterrizaje(s)`);
control("al tocar suelo SE TUMBA: cabeceo y alabeo a cero",
  e && e.angulos[0] === 0 && e.angulos[2] === 0, JSON.stringify(e?.angulos));
control("el NODO de Three está donde dice el bus, en los TRES ejes y lejos del cero",
  nodo && e && [0, 1, 2].every((k) => Math.abs(nodo.posicion[k] - e.donde[k] / U) < 0.05) &&
  Math.hypot(...nodo.posicion) > 1,
  `nodo [${(nodo?.posicion ?? []).map((v) => v.toFixed(2)).join(", ")}] contra bus [${(e?.donde ?? []).map((v) => (v / U).toFixed(2)).join(", ")}]`);
// EL RELOJ, medido por la CUENTA y no por lo que quede.
//
// «le quedan 118,4 s» no distingue nada: los 1,6 que faltan son la espera de
// esta sonda. Lo que separa «el reloj se ha vuelto a poner al aterrizar» de
// «es el que puso `FallInit`» es la SUMA: si se reinició al tocar suelo,
// `leQueda + vida` pasa de 120 en lo que tardó en volar; si no, vale 120 justo.
// Es la misma cuenta en el caso de la tapa, y ahí sale 120 — por eso ésta vale.
control("y el reloj se REINICIA al aterrizar (`m_TimeExpire` de `FallThink`)",
  e && e.leQueda + e.vida > 120.3,
  `quedan ${e?.leQueda?.toFixed(2)} + vida ${e?.vida?.toFixed(2)} = ${((e?.leQueda ?? 0) + (e?.vida ?? 0)).toFixed(2)}`);
control("pide su golpe contra el suelo, con el tono del dado",
  cayo.caidas.length >= 1 && cayo.caidas[0].tono >= 95 && cayo.caidas[0].tono <= 124,
  `${cayo.caidas.length} sonido(s), tono ${cayo.caidas[0]?.tono}`);

// Y se recoge, que es cerrar el círculo del 71 con un objeto del 75.
const recogida = await pag.evaluate(() => {
  // Se recoloca DENTRO de la misma llamada: entre dos `evaluate` el jugador se
  // cae y se mueve, y lo que se mide aquí es la tecla (la lección del 71).
  const o = window.probe.mundo.suelo().find((x) => x.guion === "swords_rsword");
  window.probe.mundo.irAlObjeto(o?.i, 1);
  return {
    aMano: window.probe.mundo.aManoAhora(),
    porQue: window.probe.mundo.porQueNoSeCoge(o?.i),
    cogido: window.probe.mundo.coger(),
    suelo: window.probe.mundo.suelo().map((x) => x.guion),
    mochila: window.probe.sesion.personaje?.objetos ?? [],
  };
});
console.log(`    a mano          ${recogida.aMano.length} · ${JSON.stringify(recogida.porQue)}
    recogida        ${JSON.stringify(recogida.cogido)} -> mochila ${recogida.mochila.map((o) => `${o.id}×${o.n}`).join(", ")}`);
control("la espada tirada se vuelve a coger con la `x` y entra en la mochila",
  recogida.cogido?.guion === "swords_rsword" &&
  !recogida.suelo.includes("swords_rsword") &&
  recogida.mochila.some((o) => o.id === "swords_rsword"),
  `${recogida.cogido?.guion}, quedan ${recogida.suelo.join(", ") || "nada"}`);

// ── 4b. LO SOLTADO NACE YA EN MARCHA, lo del aparecedor no ────────────────
//
// `Drop` llama a `FallInit` en el acto (genericitem.cpp:1357) y le deja una
// velocidad; un `msitem_spawn` deja el objeto quieto y marcado `GI_JUSTSPAWNED`,
// y no cae hasta su primer `Think`, 0,1 s después (:611).
//
// Se mide en el MISMO `evaluate` y a los cero milisegundos, a propósito. La
// primera versión de esto esperaba 50 ms y leía el estado de los dos: salió
// verde con los dos «cayendo», porque el bucle fijo gasta de una vez el tiempo
// acumulado mientras la sonda estaba parada en el `evaluate` anterior y el
// objeto nuevo se come los 0,1 s en el primer fotograma. Un reloj de pared
// medido a través de un `evaluate` no mide décimas. Los 0,1 s exactos los mide
// `test/soltar75.test.mjs`, que avanza el paso él mismo.
const carrera = await pag.evaluate(() => {
  window.probe.mundo.empunarPorId("smallarms_rknife");
  window.probe.mundo.soltarPorGuion("item_log");
  const soltado = window.probe.mundo.soltar();
  const s = window.probe.mundo.suelo();
  return {
    soltado,
    tirado: s.find((o) => o.guion === "smallarms_rknife"),
    nacido: s.find((o) => o.guion === "item_log"),
  };
});
const vt = carrera.tirado?.velocidad ?? [0, 0, 0];
const vn = carrera.nacido?.velocidad ?? [0, 0, 0];
console.log(`
  LO SOLTADO NACE EN MARCHA
    el cuchillo     ${carrera.tirado?.estado}, tirado ${carrera.tirado?.tirado}, velocidad [${vt.map((v) => v.toFixed(0)).join(", ")}]
    el leño         ${carrera.nacido?.estado}, tirado ${carrera.nacido?.tirado}, velocidad [${vn.map((v) => v.toFixed(0)).join(", ")}]`);
control("lo SOLTADO nace con velocidad y marcado, lo del aparecedor quieto",
  carrera.tirado?.tirado === true && Math.hypot(...vt) > 150 &&
  carrera.nacido?.tirado === false && Math.hypot(...vn) === 0,
  `cuchillo ${Math.hypot(...vt).toFixed(0)} u/s, leño ${Math.hypot(...vn).toFixed(0)} u/s`);

// ── 5. A MEDIA ESTOCADA NO SE SUELTA ───────────────────────────────────────
const estocada = await pag.evaluate(() => {
  window.probe.mundo.empunarPorId("swords_rsword");
  const habia = window.probe.mundo.suelo().length;
  return {
    habia,
    r: window.probe.mundo.soltarAtacando(6),
    suelo: window.probe.mundo.suelo().length,
    mano: window.probe.mundo.loQueLlevaLaMano(),
    cuentas: window.probe.mundo.cuentasDelSuelo(),
  };
});
console.log(`\n  LA `+"`c`"+` A MEDIA ESTOCADA
    atacaba         ${estocada.r?.atacando} (fase ${estocada.r?.fase})
    soltado         ${JSON.stringify(estocada.r?.soltado)}
    en el suelo     ${estocada.habia} -> ${estocada.suelo} · en la mano ${estocada.mano}`);
control("CONTROL POSITIVO: el brazo estaba atacando de verdad",
  estocada.r?.atacando === true, `${estocada.r?.atacando}, fase ${estocada.r?.fase}`);
control("`if (CurrentAttack) return false;` — no se suelta y se queda en la mano",
  estocada.r?.soltado === null && estocada.suelo === estocada.habia &&
  estocada.mano === "swords_rsword" && estocada.cuentas.sueltasNegadas >= 1,
  `suelo ${estocada.habia} -> ${estocada.suelo}, mano ${estocada.mano}, negadas ${estocada.cuentas.sueltasNegadas}`);

// ── 6. EL SUELO QUE NO ES SUELO: encima de una entidad de brush ────────────
//
// Encima de una entidad de brush —`SOLID_BSP`— el motor no da `FL_ONGROUND`,
// así que lo soltado se queda quieto SIN tumbarse, SIN sonar y con el reloj de
// haberlo soltado. Y al lado va el control positivo —el mismo tiro contra el
// suelo de verdad—, porque si no, un objeto que no hubiera chocado con nada
// daría igual de verde.
//
// Se tira desde el borde de la tapa de la cloaca, que es lo que hay en Edana a
// ras de algo que no es el mundo. **SOBRE QUÉ cae no se da por supuesto:** la
// primera versión de este control decía «sobre una `func_door`» y la espada
// acabó encima de uno de los cuatro ALMIARES, que están justo ahí y más altos
// (−6,91 m contra los −8,23 de la tapa). Un `func_breakable` es igual de
// `SOLID_BSP` y la regla es la misma, pero decirlo mal habría sido escribir una
// cita que no es lo que se midió. Así que se mira la altura y se dice cuál.
const sobreLaTapa = await pag.evaluate(() => {
  // El suelo se vacía primero, para que lo que se lea luego sea de este tiro.
  for (let k = 0; k < 6; k++) {
    const o = window.probe.mundo.suelo()[0];
    if (!o) break;
    window.probe.mundo.irAlObjeto(o.i, 1);
    if (!window.probe.mundo.coger()) break;
  }
  // EL BRAZO, DE VUELTA AL REPOSO. La sección de antes lo dejó a media
  // estocada a propósito, y `CanDrop` sigue diciendo que no mientras lo esté:
  // sin esto, esta sección medía la tapa con la `c` bloqueada por el ataque de
  // la anterior y no soltaba nada. `atacar` con el botón arriba empieza
  // soltándolo hasta que el brazo está quieto, que es justo lo que hace falta.
  window.probe.golpe.atacar(0.05, { pulsado: false });
  window.probe.mundo.empunarPorId("swords_rsword");
  // AL BORDE DE ACÁ Y MIRANDO AL DE ALLÁ, pegado a la tapa. No en el centro y
  // a un metro: un objeto soltado sale a 175 u/s y como poco 30° de subida, o
  // sea que desde el centro vuela 2,8 m y se pasa la tapa de largo. La primera
  // versión de esta sonda hacía eso y leía «suelo»: medía que mi tiro no llega,
  // no que una `func_door` no es suelo.
  const d = window.probe.mundo.irSobreCorredera("sewer_door", { alto: 0.1 });
  return { donde: d, soltado: window.probe.mundo.soltar() };
});
await pag.waitForTimeout(2000);
const enLaTapa = await pag.evaluate(() => ({
  suelo: window.probe.mundo.suelo(),
  posados: window.probe.mundo.posados(),
  caidas: window.probe.mundo.caidasDelSuelo().length,
  cuentas: window.probe.mundo.cuentasDelSuelo(),
  nodos: window.probe.mundo.nodosDelSuelo(),
}));
const sonidosAntes = cayo.caidas.length;
const t = enLaTapa.suelo.find((o) => o.guion === "swords_rsword");
const nodoT = enLaTapa.nodos.find((n) => n.guion === "swords_rsword");
console.log(`
  SOLTADO SOBRE LA TAPA DE LA CLOACA
    la tapa mide    ${(sobreLaTapa.donde?.tamano ?? []).map((v) => v.toFixed(2)).join(" x ")} m, arriba a ${sobreLaTapa.donde?.arriba?.toFixed(2)}
    los pies en     [${(sobreLaTapa.donde?.pies ?? []).map((v) => v.toFixed(2)).join(", ")}]
    soltado         ${JSON.stringify(sobreLaTapa.soltado)}
    estado          ${t?.estado}
    ángulos         ${JSON.stringify(t?.angulos)}
    quedan + vida   ${t?.leQueda?.toFixed(2)} + ${t?.vida?.toFixed(2)} = ${((t?.leQueda ?? 0) + (t?.vida ?? 0)).toFixed(2)}
    posados         ${JSON.stringify(enLaTapa.posados)}
    cabeceo nodo    ${nodoT?.cabeceo?.toFixed(2)}°
    sonidos totales ${enLaTapa.caidas} (antes de esto, ${sonidosAntes})`);
// SOBRE CUÁL ha caído, leído del manifiesto y no supuesto.
const brushes = [
  ...(malla.interactivas?.correderas ?? []).map((c) => ({ que: `func_door ${c.nombre}`, top: c.caja.max[1] })),
  ...(malla.interactivas?.rompibles ?? []).map((r, k) => ({ que: `func_breakable #${k}`, top: r.caja.max[1] })),
  ...(malla.interactivas?.puertas ?? []).map((p) => ({ que: `func_door_rotating ${p.nombre ?? ""}`, top: p.caja.max[1] })),
];
const alto = (t?.donde?.[1] ?? 0) / U;
const sobre = brushes
  .map((b) => ({ ...b, d: Math.abs(b.top - alto) }))
  .sort((a, b) => a.d - b.d)[0];
console.log(`    ha caído sobre  ${sobre?.que} (su techo está a ${sobre?.top?.toFixed(2)} m, el objeto a ${alto.toFixed(2)})`);
control("sobre una entidad de BRUSH no toca suelo: se queda `posado`",
  t?.estado === "posado" && enLaTapa.cuentas.posados >= 1,
  `${t?.estado}, ${enLaTapa.cuentas.posados} posado(s)`);
control("y se ha quedado sobre una de verdad, no en el aire: coincide su techo",
  sobre && sobre.d < 0.1, `${sobre?.que}, a ${sobre?.d?.toFixed(3)} m de su techo`);
control("y por eso NO se tumba: conserva el cabeceo del tercio",
  t && t.angulos[0] !== 0, `cabeceo ${t?.angulos[0]?.toFixed(2)}`);
control("ni suena: el `EMIT_SOUND_DYN` está dentro del `if (FL_ONGROUND)`",
  enLaTapa.caidas === sonidosAntes,
  `${enLaTapa.caidas} sonidos, los mismos ${sonidosAntes} que antes de esto`);
// LA MISMA CUENTA que la de aterrizar, y aquí tiene que dar 120 justo: el reloj
// es el que puso `FallInit` al soltarlo y nadie lo ha vuelto a poner.
control("ni reinicia el reloj: `leQueda + vida` sigue valiendo 120",
  t && Math.abs(t.leQueda + t.vida - 120) < 0.3,
  `${((t?.leQueda ?? 0) + (t?.vida ?? 0)).toFixed(2)}`);
control("el nodo de Three también sale inclinado, con el signo del renderizador",
  nodoT && t && Math.abs(nodoT.cabeceo) > 1 &&
  Math.abs(nodoT.cabeceo + t.angulos[0]) < 0.01,
  `nodo ${nodoT?.cabeceo?.toFixed(2)}° contra angles ${t?.angulos[0]?.toFixed(2)}`);

// EL CONTROL POSITIVO: el mismo tiro, con el jugador en el suelo de verdad.
// Sin esto, un objeto que no hubiera chocado con nada —o una traza que no
// distinga nada— daría igual de verde.
await pag.evaluate(() => {
  window.probe.mundo.empunarPorId("axes_rsmallaxe");
  // Al lado de la tapa y no encima, y al ras del suelo que haya ahí.
  const cen = window.probe.mundo.centroDeCorredera("sewer_door");
  window.probe.mundo.poner(cen[0] + 5, cen[1] + 3, cen[2]);
  const { ojo: p } = window.probe.mundo.donde();
  window.probe.mundo.mirar(p[0], p[1] - 10, p[2] - 0.3);
  return window.probe.mundo.soltar();
});
await pag.waitForTimeout(2500);
const posito = await pag.evaluate(() => ({
  suelo: window.probe.mundo.suelo(),
  cuentas: window.probe.mundo.cuentasDelSuelo(),
}));
const h = posito.suelo.find((o) => o.guion === "axes_rsmallaxe");
console.log(`
  CONTROL POSITIVO: EL MISMO TIRO, FUERA DE LA TAPA
    estado          ${h?.estado}
    ángulos         ${JSON.stringify(h?.angulos)}
    quedan + vida   ${((h?.leQueda ?? 0) + (h?.vida ?? 0)).toFixed(2)}`);
control("CONTROL POSITIVO: a cinco metros de la tapa, el hacha SÍ toca suelo",
  h?.estado === "suelo" && h.angulos[0] === 0 && h.leQueda + h.vida > 120.3,
  `${h?.estado}, cabeceo ${h?.angulos[0]}, suma ${((h?.leQueda ?? 0) + (h?.vida ?? 0)).toFixed(2)}`);

await pag.screenshot({ path: "build/edana/vistas/edana75.png" });

} catch (err) {
  console.log(`\n  LA SONDA SE HA CAÍDO: ${String(err).slice(0, 400)}`);
  control("LA SONDA LLEGA AL FINAL", false, String(err).slice(0, 160));
}

// ── el veredicto ───────────────────────────────────────────────────────────
console.log("\n  CONTROLES");
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(74)} ${c.detalle}`);
const mal = controles.filter((c) => !c.bien);
console.log(`\n  ${controles.length - mal.length} de ${controles.length} en verde`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);
console.log(`  captura:        build/edana/vistas/edana75.png\n`);

await nav.close(); matar(dev);
process.exit(mal.length || errores.length ? 1 : 0);
