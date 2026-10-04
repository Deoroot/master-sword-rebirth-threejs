// LA TAPA DE LA CLOACA — experimento 70.
//
//   npm run sonda:edana70
//
// El 69 dejó el bucle del corral de Edana abierto por una pieza: `func_door`.
// Rompías el almiar de 8 de vida, el disparo salía, la puerta lo recibía... y
// ahí se paraba, porque las tres deslizantes del mapa no estaban portadas. Esto
// las porta y cierra el bucle.
//
// ── LA CADENA ENTERA, Y AHORA LLEGA HASTA EL FINAL ────────────────────────
//
//   func_breakable *100 «hay», 8 de vida
//        │ target
//        ▼
//   sewer_door, que son DOS entidades con el mismo nombre
//        ├─ func_door *150 (la tapa, 128×144×4, wait −1, target «hay»)
//        │       └─ al LLEGAR arriba dispara «hay» -> mueren los otros TRES
//        └─ trigger_relay
//               ├─ killtarget sewer_open
//               └─ target lightbeammm (multi_manager)
//                        ├─ t=0,0  sewerbeam   (func_door *154, el haz de luz)
//                        └─ t=0,5  sewerlight  (no existe en el mapa)
//
// ── LO QUE NO ERA COMO YO CREÍA ───────────────────────────────────────────
//
// 1. **Las tres `func_door` no estaban en la colisión de nadie.** Las rotatorias
//    del 48 y los almiares del 69 estaban horneados DENTRO del trimesh del
//    mundo: eran pared. Una `func_door` no. La malla de colisión es el modelo 0
//    más `func_wall`, así que la tapa de la cloaca era una lámina de cuatro
//    unidades **sólo dibujada**: se pasaba andando. Esto no es sacarla de la
//    pared, es darle el colisionador que nunca tuvo.
//
// 2. **`health` no, pero el RECORRIDO tampoco es un número de la entidad.** Sale
//    de `size − 2 − lip` (doors.cpp:300): una deslizante se mete dentro de sí
//    misma. 80−2−8 = 70 para `door1`, 128−2−0 = 126 para las dos de la cloaca.
//    El −2 es de Valve y lo explica su propio comentario: el motor engorda las
//    cajas una unidad por lado.
//
// 3. **Una puerta con `targetname` no se abre al tocarla**, traiga o no traiga
//    `SF_DOOR_USE_ONLY`. Es una salida temprana de `DoorTouch` con su comentario
//    delante (doors.cpp:531-538). Las tres de Edana lo tienen — y **también dos
//    de las siete rotatorias**, las hojas de la casa del alcalde, que desde el
//    48 se abrían solas al acercarse. Cinco de siete daban el mismo resultado
//    con la regla mal, que es por qué duró veintidós experimentos.
//
// 4. **`DoorHitTop` dispara AL LLEGAR, no al arrancar** (doors.cpp:673). Si
//    disparara al arrancar los tres almiares caerían 1,26 s antes y la escena
//    parecería igual de correcta.
//
// ── LO QUE SIGUE SIN PORTAR, CON LA CUENTA ────────────────────────────────
//
//   `CBaseDoor::Blocked`   0 de las 3. Las dos de la cloaca traen `wait -1` y
//                          con espera negativa el motor NO invierte (aplasta), y
//                          las dos traen `dmg 0`. Y `door1`, que sí invertiría
//                          con `dmg 50000`, no la puede abrir NADIE: tiene
//                          nombre y no hay una sola entidad que la apunte
//   el modo ADITIVO        1 de las 3. `sewerbeam` es `rendermode 5` y sale de
//                          la malla del mundo, donde sí era transparente: aquí
//                          se monta opaco
//   `netname`              0 de las 3
//
// ── LAS FORMAS DE QUE ESTO PAREZCA FUNCIONAR Y ESTÉ MAL ───────────────────
//
//   1. «la tapa se abre»        -> podría moverse sólo el dibujo. Se mide con un
//                                  RAYO antes y después, no con nuestro apunte
//   2. «ya no está»             -> podría no haber estado nunca. Control: antes
//                                  de romper el almiar el rayo SÍ la encuentra
//   3. «caen los cuatro»        -> podrían caer todos a la vez. Se mide a los
//                                  0,5 s, con la tapa a medio camino: TRES en pie
//   4. «la puerta del alcalde
//      se abre»                 -> es que NO tiene que abrirse al acercarse. Y
//                                  el control positivo va al lado: una de las
//                                  cinco sin nombre sí se abre
//   5. «el haz de luz se mueve» -> y no choca, que es lo que dice su bandera

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";
import { readFileSync, mkdirSync } from "node:fs";

const PORT = 5270;
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
const desl = malla.interactivas.correderas ?? [];
const rot = malla.interactivas.puertas ?? [];

console.log(`
  HORNEADO DE EDANA`);
for (const p of desl) {
  console.log(`    ${String(p.nombre).padEnd(11)} recorre ${String(Math.round(p.recorridoUnidades)).padStart(3)} u ` +
    `a ${Math.round(p.velocidad * malla.unidadesPorMetro)} u/s, espera ${String(p.espera).padStart(2)}, ` +
    `${p.atravesable ? "NO choca" : "choca   "}, rendermode ${p.render.modo}, ${p.triangulos} tri`);
}
control("tres `func_door`, con el recorrido calculado de `size − 2 − lip`",
  desl.length === 3 &&
  JSON.stringify(desl.map((p) => Math.round(p.recorridoUnidades)).sort((a, b) => a - b)) === "[70,126,126]",
  desl.map((p) => Math.round(p.recorridoUnidades)).join("/"));
control("LAS TRES tienen `targetname` y NINGUNA `SF_DOOR_USE_ONLY`: no se tocan",
  desl.filter((p) => p.nombre).length === 3 && desl.filter((p) => p.soloUsar).length === 0,
  `${desl.filter((p) => p.nombre).length} con nombre, ${desl.filter((p) => p.soloUsar).length} con la bandera`);
control("y el haz de luz es el único atravesable, que es lo que dice su bandera 8",
  desl.filter((p) => p.atravesable).length === 1 &&
  desl.find((p) => p.atravesable)?.nombre === "sewerbeam",
  desl.find((p) => p.atravesable)?.nombre ?? "ninguno");
control("DOS de las siete rotatorias tienen nombre: las hojas de la casa del alcalde",
  rot.filter((p) => p.nombre === "door2").length === 2 && rot.filter((p) => p.nombre).length === 2,
  `${rot.filter((p) => p.nombre).length} de ${rot.length}`);
// GATE CITY, el segundo caso, y aquí el número es cero por séptima vez.
control("GATE CITY tiene CERO `func_door`: otra vez el hueco lo enseña el otro mapa",
  (gc.interactivas.correderas ?? []).length === 0 &&
  gc.disparadores.filter((d) => d.clase === "func_door").length === 0,
  `${(gc.interactivas.correderas ?? []).length} deslizantes, ${gc.interactivas.puertas.length} rotatorias`);
control("y sus nueve rotatorias no tienen nombre: la corrección no les cambia nada",
  gc.interactivas.puertas.filter((p) => p.nombre).length === 0,
  `${gc.interactivas.puertas.filter((p) => p.nombre).length} con nombre de ${gc.interactivas.puertas.length}`);

// ── 1. SE ENTRA A EDANA POR EL MENÚ ────────────────────────────────────────
await entrarPorElMenu(pag, PORT, { mapa: "edana" });
mkdirSync("build/edana/vistas", { recursive: true });
await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
await pag.waitForTimeout(2500);
const mapa = await pag.evaluate(() => window.probe.vgui2.mapaDeLaPartida());
control("se ha entrado a Edana y no a Gate City", mapa === "edana", `${mapa}`);

// ── 2. MONTADAS, CERRADAS Y CON EL COLISIONADOR QUE LES FALTABA ────────────
const alEntrar = await pag.evaluate(() => ({
  censo: window.probe.mundo.correderas(),
  estados: window.probe.mundo.censoDePuertas(),
}));
console.log(`\n  AL ENTRAR
    montadas        ${alEntrar.censo.length}, con colisionador ${alEntrar.censo.filter((c) => c.choca).length}
    estados         ${JSON.stringify(alEntrar.estados)}`);
for (const c of alEntrar.censo) {
  console.log(`      ${String(c.nombre).padEnd(11)} fracción ${c.fraccion}  en ` +
    `[${c.posicion.map((v) => v.toFixed(2)).join(", ")}]  recorrido ${c.recorrido.toFixed(2)} m`);
}
control("las tres están montadas y las dos que chocan tienen su colisionador",
  alEntrar.censo.length === 3 && alEntrar.censo.filter((c) => c.choca).length === 2,
  `${alEntrar.censo.filter((c) => c.choca).length} de 3`);
control("y las tres nacen CERRADAS, que es `TS_AT_BOTTOM`",
  alEntrar.estados.abajo === 3 && alEntrar.estados.arriba === 0,
  JSON.stringify(alEntrar.estados));

// ── 3. EL CONTROL QUE DECIDE EL EXPERIMENTO: LA TAPA ES SÓLIDA ─────────────
//
// «La tapa se abre» se vería igual si sólo se moviera el dibujo, y «ya no está»
// se vería igual si no hubiera estado nunca — que es justo lo que pasaba hasta
// hoy. Así que se le pregunta a un RAYO, en el centro de la tapa, antes y
// después. Y el rayo entra desde fuera: un trimesh no tiene interior (el 69).
const antes = await pag.evaluate(() => {
  const c = window.probe.mundo.centroDeCorredera("sewer_door");
  return { centro: c, altura: window.probe.mundo.alturaSolidaBajo(c, 3) };
});
console.log(`\n  LA TAPA, CERRADA
    centro          [${antes.centro.map((v) => v.toFixed(2)).join(", ")}]
    lo sólido bajo  ${antes.altura === null ? "NADA" : `${antes.altura.toFixed(3)} m`}`);
control("con la tapa cerrada, un rayo vertical en su centro encuentra algo sólido",
  antes.altura !== null, `${antes.altura === null ? "nada" : antes.altura.toFixed(3)} m`);

// ── 4. SE ROMPE EL ALMIAR DE 8 Y SE MIRA A MEDIO CAMINO ────────────────────
//
// A los 0,5 s la tapa va por la mitad (126 u a 100 u/s son 1,26 s) y los otros
// tres almiares TIENEN QUE SEGUIR EN PIE: `DoorHitTop` dispara al llegar, no al
// arrancar. Si cayeran ya, la escena parecería igual de correcta y estaría mal.
await pag.evaluate(() => window.probe.mundo.romperElDeLaCloaca(20));
await pag.waitForTimeout(500);
const aMedias = await pag.evaluate(() => ({
  tapa: window.probe.mundo.correderas().find((c) => c.nombre === "sewer_door"),
  enPie: window.probe.mundo.rompiblesEnPie(),
  movidas: window.probe.mundo.puertasMovidas(),
}));
console.log(`\n  A MEDIO CAMINO (0,5 s)
    fracción        ${aMedias.tapa.fraccion.toFixed(3)}
    almiares en pie ${aMedias.enPie}
    tramos movidos  ${aMedias.movidas.map((m) => `${m.nombre}:${m.hacia}`).join(", ") || "ninguno"}`);
control("a medio camino la tapa está a medio camino, no abierta del todo",
  aMedias.tapa.fraccion > 0.1 && aMedias.tapa.fraccion < 0.95,
  `${aMedias.tapa.fraccion.toFixed(3)}`);
control("y los otros TRES almiares siguen en pie: la puerta dispara al LLEGAR",
  aMedias.enPie === 3, `${aMedias.enPie} en pie`);

// ── 5. Y AL LLEGAR ARRIBA SE CIERRA EL BUCLE ───────────────────────────────
await pag.waitForTimeout(1500);
const despues = await pag.evaluate(() => {
  const c = window.probe.mundo.centroDeCorredera("sewer_door");
  return {
    censo: window.probe.mundo.correderas(),
    altura: window.probe.mundo.alturaSolidaBajo(c, 3),
    enPie: window.probe.mundo.rompiblesEnPie(),
    rotos: window.probe.mundo.rotos(),
    abiertas: window.probe.mundo.puertasAbiertas(),
    tapa: window.probe.mundo.estadoPuerta(
      window.probe.mundo.correderas().find((x) => x.nombre === "sewer_door").entidad),
  };
});
const tapa = despues.censo.find((c) => c.nombre === "sewer_door");
const haz = despues.censo.find((c) => c.nombre === "sewerbeam");
console.log(`\n  ABIERTA
    tapa            fracción ${tapa.fraccion}, en [${tapa.posicion.map((v) => v.toFixed(2)).join(", ")}]
    haz de luz      fracción ${haz.fraccion}, choca ${haz.choca}
    lo sólido bajo  ${despues.altura === null ? "NADA" : `${despues.altura.toFixed(3)} m`}
    almiares en pie ${despues.enPie}
    rotos           ${despues.rotos.map((r) => `${r.nombre ?? "(sin nombre)"}/${r.por}`).join(", ")}
    llegaron arriba ${despues.abiertas.join(", ") || "ninguna"}`);
control("LA TAPA SE HA CORRIDO DE VERDAD: su nodo está a su recorrido de distancia",
  Math.abs(Math.hypot(...tapa.posicion) - 0) >= 0 &&
  Math.abs(tapa.fraccion - 1) < 1e-6 &&
  Math.abs(Math.hypot(tapa.posicion[0], tapa.posicion[1], tapa.posicion[2]) - tapa.recorrido) < 0.01,
  `fracción ${tapa.fraccion}, |posición| ${Math.hypot(...tapa.posicion).toFixed(3)} m de ${tapa.recorrido.toFixed(3)}`);
control("Y YA NO ESTORBA: el mismo rayo que antes daba sólido ahora no encuentra nada",
  despues.altura === null || Math.abs(despues.altura - antes.altura) > 0.1,
  `antes ${antes.altura?.toFixed(3)} · después ${despues.altura === null ? "nada" : despues.altura.toFixed(3)}`);
control("EL BUCLE CERRADO: los cuatro almiares caídos, tres por el disparo de la tapa",
  despues.enPie === 0 && despues.rotos.length === 4 &&
  despues.rotos.filter((r) => r.por === "disparo").length === 3,
  `${despues.rotos.length} rotos, ${despues.rotos.filter((r) => r.por === "disparo").length} por disparo`);
control("y el haz de luz también se ha corrido, sin colisionador",
  haz.fraccion === 1 && haz.choca === false, `fracción ${haz.fraccion}, choca ${haz.choca}`);
control("la tapa lleva UNA vuelta y no vuelve a bajar: `wait -1`",
  despues.tapa.vueltas === 1 && despues.tapa.volvera === false && despues.tapa.estado === "arriba",
  `${despues.tapa.vueltas} vuelta(s), volverá ${despues.tapa.volvera}`);

// ── 6. LA PUERTA DEL ALCALDE NO SE ABRE AL ACERCARSE ───────────────────────
//
// Y con su control positivo al lado, que es lo que separa «la regla funciona»
// de «no se abre ninguna»: una de las cinco SIN nombre sí tiene que abrirse.
// Y AL JUGADOR SE LE PONE DELANTE DEL VANO, NO DENTRO.
//
// Escrito primero en el CENTRO de la caja, y el control positivo salió rojo:
// `estado abriendo, ángulo 0,0°` después de segundo y medio. No era la regla,
// era el sitio — `CBaseDoor::Blocked` invierte la hoja cuando barre a alguien,
// y de pie en el vano la puerta rebota en el mismo grado para siempre. Está
// documentado en `src/play/puertas.js` desde el 48 («se paraba a 10° para
// siempre») y aun así lo volví a pisar.
//
// Lo peor no es el rojo: es que el control de al lado, «la del alcalde NO se
// abre», salía **verde por el mismo motivo**. Con las dos puertas en el centro
// del vano, ese verde no medía la corrección del `targetname`: medía que la
// hoja rebotaba. El verde vacío del apartado 4, y esta vez en la prueba que era
// el titular del experimento.
//
// Así que se sale por el eje FINO de la hoja —una puerta es una tabla, así que
// su caja es delgada en un eje horizontal— medio metro fuera, que está dentro
// del `ALCANCE` de 34 unidades y fuera de por donde barre.
const puertaDe = async (nombre) => pag.evaluate((n) => {
  const r = window.probe.mundo.rotatorias();
  const i = n === null ? r.findIndex((p) => !p.nombre) : r.findIndex((p) => p.nombre === n);
  if (i < 0) return null;
  const f = window.probe.mundo.sitios().puertas[i];
  const c = [0, 1, 2].map((k) => (f.caja.min[k] + f.caja.max[k]) / 2);
  const ancho = [0, 1, 2].map((k) => f.caja.max[k] - f.caja.min[k]);
  const fino = ancho[0] < ancho[2] ? 0 : 2;     // el eje horizontal delgado
  const fuera = [...c];
  fuera[fino] = c[fino] - (ancho[fino] / 2 + 0.5);
  window.probe.mundo.poner(fuera[0], fuera[1] + 0.2, fuera[2]);
  window.probe.mundo.mirar(c[0], c[1], c[2]);
  return { i, centro: c, desde: fuera };
}, nombre);

const alcalde = await puertaDe("door2");
await pag.waitForTimeout(1200);
const trasEmpujar = await pag.evaluate((i) => window.probe.mundo.rotatorias()[i], alcalde.i);
const libre = await puertaDe(null);
await pag.waitForTimeout(1200);
const trasEmpujar2 = await pag.evaluate((i) => window.probe.mundo.rotatorias()[i], libre.i);
console.log(`\n  LAS ROTATORIAS, EMPUJADAS CON EL CUERPO
    door2 (con nombre)   estado ${trasEmpujar.estado}, ángulo ${trasEmpujar.angulo.toFixed(1)}°
    sin nombre           estado ${trasEmpujar2.estado}, ángulo ${trasEmpujar2.angulo.toFixed(1)}°`);
control("la puerta del alcalde NO se abre al plantarse en su vano: tiene `targetname`",
  trasEmpujar.angulo < 1, `${trasEmpujar.angulo.toFixed(1)}°`);
control("CONTROL POSITIVO: una de las cinco sin nombre sí se abre al acercarse",
  trasEmpujar2.angulo > 5, `${trasEmpujar2.angulo.toFixed(1)}°`);

// ── 7. Y SÍ SE ABRE CUANDO LA DISPARA QUIEN DEBE ───────────────────────────
const porElCable = await pag.evaluate(() => {
  window.probe.mundo.disparar("door2");
  return window.probe.mundo.rotatorias().filter((p) => p.nombre === "door2");
});
await pag.waitForTimeout(1200);
const abiertaYa = await pag.evaluate(() => window.probe.mundo.rotatorias().filter((p) => p.nombre === "door2"));
console.log(`    tras el disparo      ${abiertaYa.map((p) => `${p.estado} ${p.angulo.toFixed(1)}°`).join(" · ")}`);
control("y LAS DOS hojas se abren cuando el cableado las dispara por su nombre",
  abiertaYa.length === 2 && abiertaYa.every((p) => p.angulo > 5),
  `${porElCable.length} hojas, ángulos ${abiertaYa.map((p) => p.angulo.toFixed(0)).join("/")}`);

await pag.screenshot({ path: "build/edana/vistas/edana70.png" });

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
console.log(`  captura:        build/edana/vistas/edana70.png\n`);

await nav.close(); matar(dev);
process.exit(mal.length || errores.length ? 1 : 0);
