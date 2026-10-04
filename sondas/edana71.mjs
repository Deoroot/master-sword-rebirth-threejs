// LA MANZANA CAE — experimento 71.
//
//   npm run sonda:edana71
//
// El 69 portó el aparecedor y el 70 cerró la cadena que lo dispara. Los dos
// acabaron en el mismo sitio: una línea de `src/main.js` que decía «aquí
// aparecería una manzana» y un contador de lo que falta. Faltaba la pieza
// entera —**este puerto no tenía ni un objeto en el suelo**— y esto es la
// pieza.
//
// ── LA CADENA, Y AHORA TIENE FINAL ────────────────────────────────────────
//
//   func_button appledrop (health 2, wait −1)
//        │ target
//        ▼
//   multi_manager appledropMM   #0 -> apple5spawn
//        │
//        ├─ msitem_spawn apple5spawn  (scriptfile health_apple, a 143 u de alto)
//        │       └─ 0,1 s después: `Fall()` -> `FallInit()` -> cae
//        │              └─ al tocar el suelo: se tumba, suena, y dura 120 s
//        └─ env_render apple5spawn -> apple5 (el adorno del árbol: NO está)
//
// ── LO QUE NO ERA COMO PARECÍA ────────────────────────────────────────────
//
// 1. **El submodelo de estar tirado no es una fórmula.** Un `.mdl` de objetos
//    trae tres submodelos por cosa —mano derecha, izquierda y suelo— y el
//    número lo calcula el `game_fall` del guion. `base_drink`, de la que hereda
//    la manzana, dice `+2`; la manzana **lo anula** y dice `+1`. Con el `+2`,
//    `MODEL_BODY_OFS 1` más dos da el submodelo 3 de `p_misc.mdl`, que se llama
//    `oldbook_rhand`: una manzana que al caer del árbol se vuelve un libro
//    viejo, sin un solo error.
//
// 2. **El alcance de recoger no son 64 unidades.** `FindEntityInSphere` mide
//    contra la CAJA del objeto y no contra su origen (pr_cmds.cpp:871-882), y
//    la caja de un objeto es ±24 (weapons.cpp:345-349). O sea **88 en
//    horizontal**. Medido contra el origen hay que pisar la manzana.
//
// 3. **El cono no tiene techo**: el producto escalar es en 2D, «making the view
//    cone infinitely tall» (combat.cpp:1150). Si fuera en 3D, mirar al suelo
//    —que es lo que uno hace para coger algo— dejaría de funcionar.
//
// 4. **`m_flFieldOfView` del jugador es 0,5 y no 0,1.** Las dos asignaciones
//    están dentro de `CBasePlayer::Spawn` (player.cpp:2627 y :2682) y gana la
//    segunda. Son ±60° en vez de ±84°.
//
// 5. **El menú de «Gather items» del motor no sale nunca.** Hay un
//    `ItemCount = 1;` a pelo justo antes del `if (ItemCount == 1)`
//    (player.cpp:5199), puesto contra un exploit de duplicación en 2010 y
//    dejado ahí. Se porta con el fallo.
//
// ── LO QUE SIGUE SIN PORTAR, CON LA CUENTA ────────────────────────────────
//
//   SOLTAR del inventario   `CGenericItem::Drop` (genericitem.cpp:1319-1383),
//                           que es la OTRA manera de que algo acabe en el
//                           suelo. Por eso la tecla `c` no hace nada
//   `container`             0 de los 4 aparecedores de Edana
//   `ITEM_NOPICKUP`,        0 de los 2 objetos que un mapa portado puede
//   `PICKUP_ALLOW_LIST`,    dejar en el suelo
//   `ITEM_GROUPABLE`
//   el botín de un cadáver  entra en la misma lista (player.cpp:5096-5109) y
//                           no es un objeto: es oro
//
// ── LAS FORMAS DE QUE ESTO PAREZCA FUNCIONAR Y ESTÉ MAL ───────────────────
//
//   1. «la manzana aparece»  -> podría ser sólo nuestro apunte. Se leen DOS
//                               fuentes: el bus y los nodos de Three
//   2. «cae»                 -> podría nacer ya en el suelo. Se mide la altura
//                               al nacer (3,6 m) contra la de después
//   3. «se puede coger»      -> podría cogerse todo desde cualquier sitio. Tres
//                               controles: de espaldas no, a diez metros no,
//                               delante sí
//   4. «se coge una»         -> podría ser que sólo haya una. Se sueltan DOS y
//                               se comprueba que la otra sigue ahí
//   5. «está en el inventario» -> se lee de `personaje.objetos`, que es la misma
//                               lista que llena una compra

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";
import { readFileSync, existsSync, mkdirSync } from "node:fs";

const PORT = 5271;
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

try {

// ── 0. LO HORNEADO ─────────────────────────────────────────────────────────
const malla = JSON.parse(readFileSync("build/edana/malla.json", "utf8"));
const gc = JSON.parse(readFileSync("build/gatecity/malla.json", "utf8"));
const suelo = existsSync("build/msr/suelo.json")
  ? JSON.parse(readFileSync("build/msr/suelo.json", "utf8")) : { objetos: [], sinGuion: [] };
const spawners = malla.disparadores.filter((d) => d.clase === "msitem_spawn");
/** La escala, leída del horneado y no escrita: es una cuenta, no una constante. */
const U = malla.unidadesPorMetro;

console.log(`
  HORNEADO`);
for (const o of suelo.objetos) {
  console.log(`    ${String(o.id).padEnd(14)} ${String(o.nombre).padEnd(10)} ${String(o.modelo).padEnd(22)} ` +
    `body ${String(o.cuerpo).padStart(2)} -> ${String(o.submodelo?.nombre ?? "—").padEnd(14)} ${o.animacion ?? "(sin animación)"}`);
}
for (const s of suelo.sinGuion) console.log(`    ${String(s.guion).padEnd(14)} no existe su .script: su aparecedor no pone nada`);

const manzana = suelo.objetos.find((o) => o.id === "health_apple");
control("la manzana del suelo sale del submodelo `apple_floor`, no de una fórmula",
  manzana?.cuerpo === 2 && manzana?.submodelo?.nombre === "apple_floor",
  `body ${manzana?.cuerpo} -> ${manzana?.submodelo?.nombre}`);
control("CONTRASTE: con el `+2` de su base saldría el submodelo 3, `oldbook_rhand`",
  manzana?.cuerpo !== 3, `su base dice +2 (=3) y su \`[override]\` dice +1 (=${manzana?.cuerpo})`);
control("y trae su postura de estar tirado emitida",
  (manzana?.secuencias ?? []).includes("apple_floor_idle"),
  (manzana?.secuencias ?? []).join(", ") || "ninguna");
control("los cuatro aparecedores de Edana, y uno con un guion que no existe",
  spawners.length === 4 && suelo.sinGuion.length === 1 && suelo.sinGuion[0].guion === "log",
  `${spawners.length} aparecedores, ${suelo.objetos.length} guiones con modelo`);
// GATE CITY: el segundo caso, y otra vez cero.
control("GATE CITY no tiene ni un aparecedor: el hueco lo enseña el otro mapa",
  gc.disparadores.filter((d) => d.clase === "msitem_spawn").length === 0,
  `${gc.disparadores.filter((d) => d.clase === "msitem_spawn").length}`);

// ── 1. SE ENTRA A EDANA POR EL MENÚ ────────────────────────────────────────
await entrarPorElMenu(pag, PORT, { mapa: "edana" });
mkdirSync("build/edana/vistas", { recursive: true });
await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
await pag.waitForTimeout(2500);
const mapa = await pag.evaluate(() => window.probe.vgui2.mapaDeLaPartida());
control("se ha entrado a Edana y no a Gate City", mapa === "edana", `${mapa}`);

const alEntrar = await pag.evaluate(() => ({
  suelo: window.probe.mundo.suelo(),
  nodos: window.probe.mundo.nodosDelSuelo(),
  catalogo: window.probe.mundo.catalogoDelSuelo().map((o) => o.id),
}));
console.log(`\n  AL ENTRAR
    en el suelo     ${alEntrar.suelo.length}
    nodos montados  ${alEntrar.nodos.length}
    catálogo        ${alEntrar.catalogo.join(", ") || "vacío"}`);
control("EL CONTROL NEGATIVO: al entrar no hay NADA tirado por el suelo",
  alEntrar.suelo.length === 0 && alEntrar.nodos.length === 0,
  `${alEntrar.suelo.length} en el bus, ${alEntrar.nodos.length} nodos`);
// CORRECCIÓN DEL 75: esto decía «con sus DOS objetos» y pedía `length === 2`.
// Era verdad el día que se escribió —el catálogo del suelo sólo traía lo que un
// `msitem_spawn` puede soltar— y dejó de serlo en cuanto el 75 añadió lo que el
// jugador puede tirar con la `c`: son 13. La cifra escrita a mano se quedó
// vieja y se puso roja, que es lo que tenía que pasar. Lo que esta sonda mide
// es que la manzana y el leño están, no cuántos hay en total.
control("y el catálogo del suelo ha llegado al juego, con la manzana y el leño",
  alEntrar.catalogo.includes("health_apple") && alEntrar.catalogo.includes("item_log"),
  `${alEntrar.catalogo.length} guiones: ${alEntrar.catalogo.join(", ") || "vacío"}`);

// ── 2. SE GOLPEA LA MANZANA DEL ÁRBOL ──────────────────────────────────────
//
// Por el botón, que es por donde entra el jugador: `health 2` no es vida, un
// golpe lo abre (el 69). Y entre el golpe y la lectura se espera de verdad: el
// `multi_manager` reparte en el tiempo y lo resuelve su `Think`.
await pag.evaluate(() => window.probe.mundo.irAlBoton(1.2));
await pag.evaluate(() => window.probe.mundo.golpearBoton(1));
await pag.waitForTimeout(120);
const recienNacida = await pag.evaluate(() => window.probe.mundo.suelo());
console.log(`\n  RECIÉN GOLPEADA LA MANZANA DEL ÁRBOL
    ${recienNacida.map((o) => `${o.guion} '${o.nombre}' ${o.estado} a ${(o.donde[1] / U).toFixed(2)} m`).join("\n    ") || "nada"}`);
control("el aparecedor suelta UNA manzana, con el nombre DEL APARECEDOR",
  recienNacida.length === 1 && recienNacida[0].guion === "health_apple" &&
  recienNacida[0].nombre === "apple5spawn",
  recienNacida.map((o) => `${o.guion}/${o.nombre}`).join(", ") || "ninguna");
const altoAlNacer = recienNacida[0]?.donde[1] ?? 0;

// ── 3. Y CAE ───────────────────────────────────────────────────────────────
//
// «Cae» no se puede leer de nuestro apunte: se compara la altura de nacer con
// la de después, y se pregunta a los NODOS de Three, que es otra fuente.
await pag.waitForTimeout(1500);
const caida = await pag.evaluate(() => ({
  suelo: window.probe.mundo.suelo(),
  nodos: window.probe.mundo.nodosDelSuelo(),
  cuentas: window.probe.mundo.cuentasDelSuelo(),
}));
const m = caida.suelo[0];
const nodo = caida.nodos[0];
console.log(`\n  DESPUÉS DE CAER
    estado          ${m?.estado}
    nació a         ${(altoAlNacer / U).toFixed(2)} m
    está a          ${((m?.donde[1] ?? 0) / U).toFixed(2)} m
    el NODO está a  [${(nodo?.posicion ?? []).map((v) => v.toFixed(2)).join(", ")}]
    ángulos         ${JSON.stringify(m?.angulos)}
    le quedan       ${m?.leQueda?.toFixed(1)} s
    cuentas         ${JSON.stringify(caida.cuentas)}`);
control("la manzana ha tocado el suelo: `FallThink` con `FL_ONGROUND`",
  m?.estado === "suelo" && caida.cuentas.aterrizados === 1,
  `${m?.estado}, ${caida.cuentas.aterrizados} aterrizaje(s)`);
control("Y HA CAÍDO DE VERDAD: está más abajo de donde nació",
  m && altoAlNacer - m.donde[1] > 20,
  `${((altoAlNacer - (m?.donde[1] ?? 0)) / U).toFixed(2)} m de caída`);
// LOS TRES EJES, y no sólo la altura. La primera versión comparaba sólo la
// `y`, y la manzana cae a 0,00 m: un nodo que no se hubiera movido NUNCA está
// en (0, 0, 0), o sea que también tenía `y` cero y el control salía verde con
// el dibujo clavado en el origen del mapa. Lo destapó romperlo a propósito.
control("el NODO de Three está donde dice el bus en los TRES ejes, no en el origen",
  nodo && [0, 1, 2].every((k) => Math.abs(nodo.posicion[k] - m.donde[k] / U) < 0.01) &&
  Math.hypot(...nodo.posicion) > 1,
  `nodo [${(nodo?.posicion ?? []).map((v) => v.toFixed(2)).join(", ")}], ` +
  `bus [${(m?.donde ?? []).map((v) => (v / U).toFixed(2)).join(", ")}]`);
control("al tocar el suelo se TUMBA: cabeceo y alabeo a cero",
  m && m.angulos[0] === 0 && m.angulos[2] === 0, JSON.stringify(m?.angulos));
control("y el reloj de caducar se reinicia al aterrizar: le quedan los 120 s",
  m && m.leQueda > 118 && m.leQueda <= 120, `${m?.leQueda?.toFixed(1)} s`);

// ── 3b. EL RUIDO QUE NO HAY, Y POR QUÉ ─────────────────────────────────────
//
// `items/weapondrop1.wav` no está en `assets/msr`. No es que el juego no lo
// tenga: es de `valve/`, y el motor monta `valve/` detrás siempre. Se mide en
// vez de taparse, y se mide que el juego lo PIDE — que es lo que hará falta el
// día que la copia lo traiga.
// Se mira lo que el juego PIDE y no lo que suena: el audio tiene delante la
// puerta de `despierto` —sin un clic de verdad el contexto está suspendido—, y
// con ella «no ha sonado» no distingue «no lo pide» de «no hay contexto». Es la
// lección del 66: cuando dos cosas apagan lo mismo, se mide la de antes.
const ruido = await pag.evaluate(() => window.probe.mundo.caidasDelSuelo());
const hayWav = existsSync("build/msr/snd/items/weapondrop1.wav");
console.log(`\n  EL RUIDO DE CAER
    pedido          ${ruido.map((c) => `${c.guion}: ${c.sonido} tono ${c.tono}`).join(" | ") || "nada"}
    ¿está el .wav?  ${hayWav ? "sí" : "NO — es de valve/, y esta copia no lo trae"}`);
control("el golpe contra el suelo se pide, con su tono entre 95 y 124",
  ruido.length === 1 && ruido[0].sonido === "items/weapondrop1.wav" &&
  ruido[0].tono >= 95 && ruido[0].tono <= 124,
  ruido.map((c) => `${c.sonido} tono ${c.tono}`).join(", ") || "nada");
control("y el .wav NO está en `assets/msr`: es de `valve/`, que el motor monta detrás",
  !hayWav, hayWav ? "está" : "falta, y es correcto que falte");

// ── 4. EL ALCANCE Y EL CONO, con sus negativos ─────────────────────────────
const lejos = await pag.evaluate((i) => {
  window.probe.mundo.irAlObjeto(i, 10);
  return { aMano: window.probe.mundo.aManoAhora(), por: window.probe.mundo.porQueNoSeCoge(i) };
}, m.i);
const deEspaldas = await pag.evaluate((i) => {
  window.probe.mundo.irAlObjeto(i, 1);
  const o = window.probe.mundo.suelo().find((x) => x.i === i);
  const U = 39.37;  // sólo dentro del navegador, donde no llega `malla`
  // Mismo sitio, mirando al revés: lo único que cambia es el rumbo.
  window.probe.mundo.mirar(o.donde[0] / U + 20, o.donde[1] / U, o.donde[2] / U);
  return { aMano: window.probe.mundo.aManoAhora(), por: window.probe.mundo.porQueNoSeCoge(i) };
}, m.i);
const delante = await pag.evaluate((i) => {
  window.probe.mundo.irAlObjeto(i, 1);
  return { aMano: window.probe.mundo.aManoAhora(), por: window.probe.mundo.porQueNoSeCoge(i) };
}, m.i);
console.log(`\n  EL ALCANCE Y EL CONO
    a 10 m          ${lejos.aMano.length} a mano · ${lejos.por?.por ?? "vale"} (${lejos.por?.distancia?.toFixed(0)} u)
    de espaldas     ${deEspaldas.aMano.length} a mano · ${deEspaldas.por?.por ?? "vale"} (punto ${deEspaldas.por?.punto?.toFixed(2)})
    a 1 m, de frente ${delante.aMano.length} a mano · punto ${delante.por?.punto?.toFixed(2)}`);
control("a diez metros no se coge, y el motivo es la distancia",
  lejos.aMano.length === 0 && lejos.por?.por === "lejos", lejos.por?.por ?? "—");
control("de espaldas tampoco, y el motivo es el cono",
  deEspaldas.aMano.length === 0 && deEspaldas.por?.por === "fuera del cono",
  `${deEspaldas.por?.por} (punto ${deEspaldas.por?.punto?.toFixed(2)})`);
control("CONTROL POSITIVO: a un metro y de frente SÍ está a mano",
  delante.aMano.length === 1 && delante.aMano[0].guion === "health_apple",
  `${delante.aMano.length} a mano`);

// ── 5. SE COGE LA MANZANA Y VA A LA MOCHILA ────────────────────────────────
const cogida = await pag.evaluate(() => {
  // Recolocar justo antes: entre dos `evaluate` el jugador se cae y se mueve,
  // y lo que se mide aquí es la tecla, no dónde ha ido a parar el que mide.
  window.probe.mundo.irAlObjeto(window.probe.mundo.suelo()[0]?.i, 1);
  return {
    cogido: window.probe.mundo.coger(),
    suelo: window.probe.mundo.suelo(),
    cuentas: window.probe.mundo.cuentasDelSuelo(),
    nodos: window.probe.mundo.nodosDelSuelo().length,
    mochila: window.probe.sesion.personaje?.objetos ?? [],
  };
});
console.log(`\n  LA TECLA x, CON LA MANZANA DELANTE
    se ha cogido    ${JSON.stringify(cogida.cogido)}
    queda en suelo  ${cogida.suelo.map((o) => o.guion).join(", ") || "nada"}
    nodos           ${cogida.nodos}
    en la mochila   ${cogida.mochila.map((o) => `${o.id}×${o.n}`).join(", ")}`);
control("se coge, y el suelo se queda vacío",
  cogida.cogido?.guion === "health_apple" && cogida.suelo.length === 0,
  `${cogida.cogido?.guion}, quedan ${cogida.suelo.length}`);
control("el nodo de Three desaparece con ella: no se queda una manzana fantasma",
  cogida.nodos === 0, `${cogida.nodos} nodos`);
control("y ENTRA EN LA MOCHILA, por la misma lista que llena una compra",
  cogida.mochila.some((o) => o.id === "health_apple"),
  cogida.mochila.map((o) => o.id).join(", "));

// ── 6. DOS COSAS DELANTE, Y SÓLO SE COGE UNA ───────────────────────────────
//
// El `ItemCount = 1` de player.cpp:5199. Y no hace falta mover nada a mano:
// **Edana tiene DOS `msitem_spawn` de leño en el MISMO punto**, (480, −200,
// −136). Se disparan los dos y quedan dos leños uno encima del otro.
//
// Además el leño es el SEGUNDO CASO del lector de `game_fall`: la manzana se va
// por su `[override]` con `+1` y el leño por la rama del `else` de
// `base_miscitem`, con el submodelo 0. Con un solo objeto, un lector que
// devolviera siempre `+1` estaría igual de verde — la trampa del 50.
const dos = await pag.evaluate(() => {
  const r = window.probe.mundo.soltarPorGuion("item_log");
  return { disparo: r, suelo: window.probe.mundo.suelo() };
});
await pag.waitForTimeout(1500);
// SE COLOCA Y SE LEE EN LA MISMA LLAMADA, a propósito. `poner` deja al jugador
// en el aire y el bucle lo baja; leerlo un par de fotogramas después daba un
// resultado distinto cada vez. Lo que hay que medir es si DOS cosas caben en la
// esfera y en el cono, no dónde acaba de caer el que mide.
const conDos = await pag.evaluate(() => {
  const s = window.probe.mundo.suelo();
  if (s.length) window.probe.mundo.irAlObjeto(s[0].i, 1);
  return {
    suelo: s, aMano: window.probe.mundo.aManoAhora(), nodos: window.probe.mundo.nodosDelSuelo(),
    porQue: s.map((o) => window.probe.mundo.porQueNoSeCoge(o.i)),
  };
});
console.log(`\n  DOS LEÑOS EN EL MISMO PUNTO
    disparados      ${JSON.stringify(dos.disparo)}
    en el suelo     ${conDos.suelo.map((o) => `${o.guion}#${o.i} ${o.estado}`).join(", ") || "nada"}
    a mano          ${conDos.aMano.map((c) => `${c.guion}#${c.i}`).join(", ") || "ninguna"}
    por qué         ${JSON.stringify(conDos.porQue)}`);
control("los dos aparecedores de leño sueltan dos leños, y los dos caen",
  conDos.suelo.length === 2 && conDos.suelo.every((o) => o.guion === "item_log" && o.estado === "suelo"),
  conDos.suelo.map((o) => `${o.guion}:${o.estado}`).join(", "));
control("con los dos delante, los DOS están a mano",
  conDos.aMano.length === 2, `${conDos.aMano.length} a mano`);

const uno = await pag.evaluate(() => {
  // Se recoloca justo antes, por lo mismo de arriba: entre dos `evaluate` el
  // jugador se ha caído y se ha movido, y lo que se mide aquí es la tecla.
  window.probe.mundo.irAlObjeto(window.probe.mundo.suelo()[0]?.i, 1);
  return {
    antes: window.probe.mundo.aManoAhora().length,
    cogido: window.probe.mundo.coger(),
    suelo: window.probe.mundo.suelo(),
    nodos: window.probe.mundo.nodosDelSuelo().length,
    mochila: window.probe.sesion.personaje?.objetos ?? [],
  };
});
console.log(`    tras la tecla   ${JSON.stringify(uno.cogido)}, a mano antes ${uno.antes}, quedan ${uno.suelo.length}`);
control("EL FALLO QUE SE PORTA: `ItemCount = 1` deja el segundo en el suelo",
  uno.cogido?.dejados === 1 && uno.suelo.length === 1,
  `dejados ${uno.cogido?.dejados}, quedan ${uno.suelo.length}`);
control("y los nodos siguen a la lista: queda uno dibujado, no dos ni cero",
  uno.nodos === 1, `${uno.nodos} nodos`);

await pag.screenshot({ path: "build/edana/vistas/edana71.png" });

} catch (e) {
  console.log(`\n  LA SONDA SE HA CAÍDO: ${String(e).slice(0, 300)}`);
  control("LA SONDA LLEGA AL FINAL", false, String(e).slice(0, 120));
}

// ── el veredicto ───────────────────────────────────────────────────────────
console.log("\n  CONTROLES");
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(74)} ${c.detalle}`);
const mal = controles.filter((c) => !c.bien);
console.log(`\n  ${controles.length - mal.length} de ${controles.length} en verde`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);
console.log(`  captura:        build/edana/vistas/edana71.png\n`);

await nav.close(); matar(dev);
process.exit(mal.length || errores.length ? 1 : 0);
