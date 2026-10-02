// LOS ALMIARES, EL BOTÓN Y LA MANZANA — experimento 69.
//
//   npm run sonda:edana69
//
// Tres clases que llevaban desde el 48 horneadas como pared o sin leer:
// `func_breakable`, `func_button` y `msitem_spawn`. Veinte rompibles entre los
// dos mapas y ni uno se rompía.
//
// > **CORRECCIÓN DEL 71.** Esta sonda decía que la manzana del manzano «no
// > cae: no hay objetos en el suelo», y era verdad hasta el 71. Ya los hay
// > (`src/play/suelo.js`), así que ese control medía un hueco que se ha
// > cerrado y se ha cambiado por la medida de lo que pasa ahora. Ver
// > `doc/SUELO_71.md`.
//
// ── EL CORRAL DE LA CLOACA ─────────────────────────────────────────────────
//
//   hay  *98   madera,  5 de vida
//   hay  *99   madera, 10
//   hay  *100  madera,  8   target -> sewer_door
//   hay  *101  madera, 11
//
//   sewer_door son DOS entidades: un `func_door` (que apunta de vuelta a `hay`)
//   y un `trigger_relay` (killtarget `sewer_open`).
//
// ── LA MANZANA ────────────────────────────────────────────────────────────
//
//   func_button appledrop  ->  multi_manager appledropMM  ->  apple5spawn
//                                                              ├ msitem_spawn health_apple
//                                                              └ env_render (apaga el adorno)
//
// ── LO QUE FALTABA, Y POR QUÉ NINGUNO DABA ERROR ──────────────────────────
//
// 1. **Los veinte estaban dentro del trimesh del mundo.** Un almiar horneado en
//    la malla de colisión es una pared con forma de almiar: se dibuja, se choca
//    y no se rompe. Sacarlos sin darles su malla deja veinte agujeros por los que
//    se pasa andando, así que el horneado tiene un control que lo para.
//
// 2. **`health` de un `func_button` NO ES VIDA.** `CBaseButton::TakeDamage` no la
//    resta en ninguna de sus 28 líneas (buttons.cpp:439-466): es la bandera que
//    hace `takedamage = DAMAGE_YES`. El de la manzana tiene `health 2` y se abre
//    con UN golpe de cualquier tamaño.
//
// 3. **`spawnstart` de un `msitem_spawn` significa lo contrario de lo que suena**,
//    igual que en el 68 y con la misma línea (gispawn.cpp:94-98). Los cuatro de
//    Edana lo traen: ninguno sale solo.
//
// 4. **`duration` no la lee nadie.** `KeyValue` conoce tres claves y `duration` no
//    es un campo de `entvars_t` (gispawn.cpp:84-104). Dos de los cuatro la traen.
//
// 5. **`env_render` no alcanzaba a nada.** Portado desde el 49, y **seis de los
//    siete de Edana apuntan a un `env_model`** —los platos de sopa de la taberna
//    y la manzana del huerto—, que no es una entidad del cableado. Los adornos se
//    horneaban sin nombre, 0 de 46. Gate City tiene CERO `env_render`: la trampa
//    del 62 otra vez, y otra vez el segundo mapa.
//
// ── LO QUE SIGUE ROTO Y SE MIDE COMO ROTO ─────────────────────────────────
//
// El bucle del corral —romper uno y que la puerta reviente los otros tres— NO se
// cierra, porque **`func_door` no está portado**: Edana tiene 3 puertas
// deslizantes y `montarPuertas` sólo coge las 7 giratorias. Así que la de la
// cloaca sigue siendo pared y no devuelve el disparo. Se mide el eslabón que sí
// llega y se cuenta el que no.
//
// CORRECCIÓN DEL 70: el bucle SÍ se cierra, y el párrafo de arriba tiene además
// un dato falso. La tapa de la cloaca **no era pared**: no estaba en la malla de
// colisión de nadie —ésa es el modelo 0 más `func_wall`—, estaba sólo dibujada y
// se pasaba andando. Esta sonda mide hasta que la tapa ARRANCA; el bucle entero,
// con los otros tres cayendo 1,26 s después, es `npm run sonda:edana70`.
//
// ── LAS FORMAS DE QUE ESTO PAREZCA FUNCIONAR Y ESTÉ MAL ───────────────────
//
//   1. «el almiar desaparece»         -> podría ser sólo el dibujo. Se mide que
//                                        ANTES no se podía pasar y DESPUÉS sí
//   2. «se rompe al golpearlo»        -> podría romperse al mirarlo si el cono
//                                        midiera en las unidades equivocadas.
//                                        Control: desde lejos NO se rompe
//   3. «la vida baja»                 -> baja el doble, porque una espada es
//                                        `DMG_CLUB`. Se mide el factor, no que
//                                        baje
//   4. «el botón dispara»             -> y dispara UNA vez. El segundo golpe
//                                        tiene que no hacer nada
//   5. «sale una manzana»             -> no sale: no hay objetos en el suelo en
//                                        este port. Se mide que el APARECEDOR
//                                        llega, con su guion y su nombre

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";
import { readFileSync, mkdirSync } from "node:fs";

const PORT = 5269;
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (habia ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { shell: true, stdio: "ignore" });
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
await new Promise((r) => setTimeout(r, 6000));
const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });

// La caída es una ROJA y no una nota al pie: la lección del 65.
try {

// ── 0. LO HORNEADO ─────────────────────────────────────────────────────────
const malla = JSON.parse(readFileSync("build/edana/malla.json", "utf8"));
const gc = JSON.parse(readFileSync("build/gatecity/malla.json", "utf8"));
const rompH = malla.disparadores.filter((d) => d.clase === "func_breakable");
const botonH = malla.disparadores.find((d) => d.clase === "func_button");
const itemsH = malla.disparadores.filter((d) => d.clase === "msitem_spawn");
const mallasH = malla.interactivas.rompibles ?? [];

console.log(`
  HORNEADO DE EDANA
    almiares        ${rompH.length}, vidas ${rompH.map((d) => d.vida).sort((a, b) => a - b).join("/")}` +
  `, de ${[...new Set(mallasH.map((m) => m.materialNombre))].join(" y ")}`);
for (const d of rompH) {
  console.log(`      vida ${String(d.vida).padStart(2)}  nombre ${String(d.nombre).padEnd(5)}` +
    `  target-> ${d.objetivo ?? "-"}`);
}
console.log(`    botón           vida ${botonH?.vida}, espera ${botonH?.espera}, target-> ${botonH?.objetivo}`);
for (const d of itemsH) {
  console.log(`      item_spawn    ${String(d.nombre ?? "(sin nombre)").padEnd(12)} guion ${String(d.guion).padEnd(13)}` +
    ` porDisparo ${d.porDisparo}  duración IGNORADA ${d.duracionIgnorada ?? "-"}`);
}

control("los cuatro almiares se llaman `hay` y son de MADERA, no de metal",
  rompH.length === 4 && rompH.every((d) => d.nombre === "hay" && d.material === 1) &&
  mallasH.every((m) => m.materialNombre === "madera"),
  `${rompH.length} · ${[...new Set(mallasH.map((m) => m.materialNombre))].join(",")}`);
control("sólo UNO de los cuatro abre la cloaca, y es el de 8 de vida",
  rompH.filter((d) => d.objetivo).length === 1 &&
  rompH.find((d) => d.objetivo)?.vida === 8 &&
  rompH.find((d) => d.objetivo)?.objetivo === "sewer_door",
  `${rompH.find((d) => d.objetivo)?.vida} -> ${rompH.find((d) => d.objetivo)?.objetivo}`);
control("el botón de la manzana: `health 2` y `wait -1`, o sea un golpe y para siempre",
  botonH?.vida === 2 && botonH?.espera === -1 && botonH?.objetivo === "appledropMM",
  `vida ${botonH?.vida}, espera ${botonH?.espera}`);
control("los cuatro `msitem_spawn` esperan disparo, y a TRES no les puede llegar",
  itemsH.length === 4 && itemsH.every((d) => d.porDisparo) &&
  itemsH.filter((d) => !d.nombre).length === 3,
  `${itemsH.filter((d) => !d.nombre).length} sin nombre de ${itemsH.length}`);
control("y `duration` está en el mapa marcada como ignorada, no leída en silencio",
  itemsH.filter((d) => d.duracionIgnorada).length === 2,
  itemsH.map((d) => d.duracionIgnorada).filter(Boolean).join(" y "));
// Gate City, el segundo caso, y aquí hay MÁS y no menos.
const rompGC = gc.disparadores.filter((d) => d.clase === "func_breakable");
control("GATE CITY tiene 16 rompibles y ni un botón ni un aparecedor de objetos",
  rompGC.length === 16 && gc.disparadores.filter((d) => d.clase === "func_button").length === 0 &&
  gc.disparadores.filter((d) => d.clase === "msitem_spawn").length === 0,
  `${rompGC.length} rompibles, ${rompGC.filter((d) => !d.nombre && !d.objetivo).length} sin cable`);
control("y sus CUATRO bolsas de crías de rata son de carne con 1 de vida",
  rompGC.filter((d) => String(d.objetivo ?? "").startsWith("spawn_babies") &&
    d.material === 3 && d.vida === 1).length === 4,
  `${rompGC.filter((d) => String(d.objetivo ?? "").startsWith("spawn_babies")).length} bolsas`);

// ── 1. SE ENTRA A EDANA POR EL MENÚ ────────────────────────────────────────
await entrarPorElMenu(pag, PORT, { mapa: "edana" });
mkdirSync("build/edana/vistas", { recursive: true });
await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
await pag.waitForTimeout(2500);
const mapa = await pag.evaluate(() => window.probe.vgui2.mapaDeLaPartida());
control("se ha entrado a Edana y no a Gate City", mapa === "edana", `${mapa}`);

// ── 2. LOS CUATRO ESTÁN MONTADOS, EN PIE Y CHOCANDO ────────────────────────
const alEntrar = await pag.evaluate(() => window.probe.mundo.rompibles());
console.log(`\n  AL ENTRAR
    montados        ${alEntrar.length}, en pie ${alEntrar.filter((r) => r.enPie).length}` +
  `, con colisionador ${alEntrar.filter((r) => r.choca).length}`);
for (const r of alEntrar) {
  console.log(`      ${String(r.nombre).padEnd(5)} vida ${String(r.vida).padStart(2)}/${r.vidaInicial}` +
    `  target-> ${String(r.objetivo ?? "-").padEnd(11)} en [${r.centro.map((v) => v.toFixed(1)).join(", ")}]`);
}
control("los cuatro almiares están montados, en pie y con su colisionador",
  alEntrar.length === 4 && alEntrar.every((r) => r.enPie && r.choca && r.visible),
  `${alEntrar.filter((r) => r.enPie && r.choca).length} de ${alEntrar.length}`);
control("y su vida al entrar es la del mapa, sin tocar",
  alEntrar.every((r) => r.vida === r.vidaInicial),
  alEntrar.map((r) => r.vida).join("/"));

// ── 3. EL CONTROL QUE DECIDE EL EXPERIMENTO: ANTES ES SÓLIDO ───────────────
//
// «El almiar desaparece» se vería igual si sólo hubiéramos apagado el dibujo. Lo
// que hay que medir es el CHOQUE, y en los dos sentidos: que antes no se puede
// pasar y que después sí. Sin el «antes», el «después» no dice nada — podría no
// haber habido nunca colisión ahí, que es exactamente lo que pasaba hasta ahora
// en las nueve puertas del 48.
//
// Se le PREGUNTA A RAPIER si hay algo sólido en el centro de cada almiar, con un
// rayo corto que sólo puede tocar al almiar. Y es la tercera versión de esta
// medida, porque las dos primeras eran falsas:
//
//   1. teletransportar al jugador dentro de la caja: `poner` no resuelve
//      colisiones, así que entra igual con el almiar puesto. No medía nada.
//   2. ANDAR contra el montón: los cuatro caben en dos metros, así que romper
//      uno lo tapa el de al lado; y rompiendo los cuatro queda **la pared de la
//      casa** detrás. Daba 3,33 m antes y 3,33 m después, con el trabajo bien
//      hecho — un control que no podía distinguir nada.
//
// Un rayo de medio metro centrado en la caja sí. Y se le pregunta a la física y
// no a nuestro `choca`: si el colisionador se quitara de la lista y no del mundo,
// `choca` diría `false` y el jugador seguiría chocando.
const elDeOcho = alEntrar.findIndex((r) => r.objetivo === "sewer_door");
const solidos = async () => pag.evaluate(() =>
  window.probe.mundo.rompibles().map((r) => ({
    tapa: window.probe.mundo.solidoEn(r.centro, 1.5),
    // Y la ALTURA de lo primero sólido que hay ahí, que es el número que cambia.
    altura: window.probe.mundo.alturaSolidaBajo([r.centro[0], r.centro[1] + 2, r.centro[2]], 5),
    tapaEsperada: Math.round((r.centro[1] + r.alto / 2) * 1000) / 1000,
  })));
const solidoAntes = await solidos();
console.log(`\n  ANTES DE ROMPER (el control del choque, con un rayo de arriba abajo)`);
for (const s of solidoAntes) {
  console.log(`      sólido ${String(s.tapa).padEnd(5)}  lo primero a ${String(s.altura).padStart(7)} m` +
    `  (su tapa está a ${s.tapaEsperada} m)`);
}
// La altura se compara contra LAS CUATRO TAPAS y no contra la suya: los cuatro
// almiares se solapan —uno está encima de otro— así que el rayo de uno se para en
// la tapa del vecino. Exigir la propia daba un rojo con el trabajo bien hecho.
const tapas = solidoAntes.map((s) => s.tapaEsperada);
control("los cuatro tienen geometría sólida de verdad en su sitio, a la altura de una tapa",
  solidoAntes.length === 4 && solidoAntes.every((s) => s.tapa === true) &&
  solidoAntes.every((s) => tapas.some((t) => Math.abs(s.altura - t) < 0.1)),
  `${solidoAntes.filter((s) => s.tapa).length} de ${solidoAntes.length} sólidos, ` +
  `tapas a ${[...new Set(tapas)].join(" y ")} m`);

// ── 4. SE GOLPEA, Y LA VIDA BAJA EL DOBLE ──────────────────────────────────
//
// `if (bitsDamageType & DMG_CLUB) flDamage *= 2` (func_break.cpp:565-567). Lo que
// se mide es el FACTOR y no que baje: bajar también bajaría sin doblar, y
// entonces el almiar de 8 aguantaría un golpe más de la cuenta.
const unGolpe = await pag.evaluate((k) => {
  const antes = window.probe.mundo.rompibles()[k].vida;
  const luego = window.probe.mundo.golpearRompible(k, 3);
  return { antes, vida: luego.vida, roto: luego.roto };
}, elDeOcho);
console.log(`\n  UN GOLPE DE 3 AL ALMIAR DE 8
    vida            ${unGolpe.antes} -> ${unGolpe.vida}  (roto: ${unGolpe.roto})`);
control("un golpe de 3 con espada quita SEIS, no tres: `DMG_CLUB` vale el doble",
  unGolpe.antes - unGolpe.vida === 6, `${unGolpe.antes} -> ${unGolpe.vida}`);
control("y con 8 de vida, un golpe de 3 no lo tumba todavía",
  unGolpe.roto === false && unGolpe.vida === 2, `queda ${unGolpe.vida}`);

// ── 5. EL SEGUNDO GOLPE LO ROMPE, Y ENTONCES SE PUEDE PASAR ────────────────
const alRomper = await pag.evaluate((k) => {
  const r = window.probe.mundo.golpearRompible(k, 3);
  return {
    r,
    enPie: window.probe.mundo.rompiblesEnPie(),
    rotos: window.probe.mundo.rotos(),
    sinPortar: window.probe.mundo.disparadores().sinPortar ?? {},
    // El 70: la tapa, para poder ver que el disparo del almiar la ha puesto en
    // marcha. Antes esto no existía y lo único medible era el contador de «esto
    // no lo sé hacer».
    puerta: (window.probe.mundo.correderas() ?? [])
      .filter((c) => c.nombre === "sewer_door")
      .map((c) => window.probe.mundo.estadoPuerta(c.entidad))[0] ?? null,
  };
}, elDeOcho);
console.log(`\n  AL ROMPERLO
    roto            ${alRomper.r.roto}, visible ${alRomper.r.visible}, choca ${alRomper.r.choca}
    en pie          ${alRomper.enPie} de 4
    rotos           ${alRomper.rotos.map((x) => `${x.nombre}(${x.por})`).join(", ") || "ninguno"}`);
control("el segundo golpe lo rompe: deja de verse Y deja de chocar",
  alRomper.r.roto === true && alRomper.r.visible === false && alRomper.r.choca === false,
  `roto ${alRomper.r.roto}, visible ${alRomper.r.visible}, choca ${alRomper.r.choca}`);
control("y se anota cuál se rompió y por qué, aunque `Die` le quite el nombre",
  alRomper.rotos.length === 1 && alRomper.rotos[0].nombre === "hay" &&
  alRomper.rotos[0].por === "dano",
  `${alRomper.rotos.map((x) => `${x.nombre}/${x.por}`).join(",")}`);
// ── CORRECCIÓN DEL 70 ──────────────────────────────────────────────────────
//
// Estos dos controles decían «los otros tres siguen en pie: el bucle lo corta
// `func_door`, sin portar» y «la puerta de la cloaca SÍ ha recibido su disparo,
// contado y no tragado» (`sinPortar.usar > 0`). El segundo se puso rojo al
// portar las deslizantes —`usar=0`, porque ya no hay nada sin portar que
// contar— y el primero siguió verde **por otro motivo**: la tapa tarda 1,26 s
// en llegar arriba y esta lectura es inmediata.
//
// Así que el primero se queda, con el motivo correcto, y el segundo se cambia
// por el que mide lo mismo ahora: que la puerta ha ARRANCADO. El bucle entero
// —esperar a que llegue y ver caer los otros tres— se mide en `edana70`, que es
// su sonda.
control("los otros tres siguen en pie EN ESTE INSTANTE: la tapa tarda 1,26 s",
  alRomper.enPie === 3, `${alRomper.enPie} en pie de 4`);
control("y la tapa de la cloaca ha ARRANCADO con el disparo del almiar (el 70)",
  alRomper.puerta?.estado === "subiendo",
  `estado ${alRomper.puerta?.estado ?? "ninguno"}, usar sin portar=${alRomper.sinPortar.usar ?? 0}`);

// ── 6. EL CONO: DESDE LEJOS NO SE ROMPE ────────────────────────────────────
//
// El control de la unidad. Si el cono midiera los almiares en metros y el alcance
// del arma en unidades de GoldSrc, un almiar a tres metros saldría a tres
// unidades y se rompería sin acercarse: el pueblo se derrumbaría al mirarlo. Se
// mide con el mandoble DE VERDAD —`atacar()`, el mismo `tic` del bucle— y no con
// el atajo, porque el atajo se salta justo el cono.
const otro = alEntrar.findIndex((r) => r.enPie && r.objetivo !== "sewer_door");
const deLejos = await pag.evaluate(async (k) => {
  const r = window.probe.mundo.rompibles()[k];
  // A veinte metros, mirándolo.
  window.probe.mundo.poner(r.centro[0] + 20, r.centro[1], r.centro[2]);
  window.probe.mundo.mirar(r.centro[0], r.centro[1], r.centro[2]);
  window.probe.golpe.atacar(2);
  return window.probe.mundo.rompibles()[k];
}, otro);
console.log(`\n  DESDE VEINTE METROS
    vida            ${deLejos.vida}/${deLejos.vidaInicial}, roto ${deLejos.roto}`);
control("EL CONTROL DE LA UNIDAD: a veinte metros el mandoble no le toca",
  deLejos.roto === false && deLejos.vida === deLejos.vidaInicial,
  `vida ${deLejos.vida} de ${deLejos.vidaInicial}`);

// Y el positivo al lado: de cerca, el MISMO mandoble sí entra. «De cerca» se
// calcula con el ALCANCE DEL ARMA y descontando la altura, no a ojo: a un metro
// en horizontal el centro de un almiar está a 1,56 m del ojo, y la espada no
// llega. Me lo tragué una pasada creyendo que el cono estaba mal.
const deCerca = await pag.evaluate(async (k) => {
  const sitio = window.probe.mundo.irAlRompible(k, 0.5);
  const antes = window.probe.mundo.rompibles()[k].vida;
  for (let i = 0; i < 8 && !window.probe.mundo.rompibles()[k].roto; i++) {
    window.probe.golpe.atacar(1.6);
  }
  const r = window.probe.mundo.rompibles()[k];
  return { sitio, antes, vida: r.vida, roto: r.roto, impactos: window.probe.golpe.estado.impactos };
}, otro);
console.log(`  DE CERCA, EL MISMO MANDOBLE
    alcance         ${deCerca.sitio.alcance.toFixed(2)} m · se pone a ` +
  `${deCerca.sitio.horizontal.toFixed(2)} m en horizontal, ${deCerca.sitio.distanciaAlOjo.toFixed(2)} m del ojo
    vida            ${deCerca.antes} -> ${deCerca.vida}, roto ${deCerca.roto}`);
control("EL CONTROL POSITIVO: de cerca el mismo mandoble sí le da y lo rompe",
  deCerca.roto === true || deCerca.vida < deCerca.antes,
  `${deCerca.antes} -> ${deCerca.vida}, roto ${deCerca.roto}`);

// ── 6b. EL CONTROL DEL CHOQUE, con el montón entero ────────────────────────
//
// Va aquí y no arriba porque el cono necesitaba un almiar en pie. Se rompen los
// que queden —por el MISMO `danar`, no por un atajo— y se vuelve a preguntar.
await pag.evaluate(() => {
  const rs = window.probe.mundo.rompibles();
  for (let k = 0; k < rs.length; k++) {
    for (let i = 0; i < 12 && !window.probe.mundo.rompibles()[k].roto; i++) {
      window.probe.mundo.golpearRompible(k, 3);
    }
  }
});
const solidoDespues = await solidos();
const enPieAlFinal = await pag.evaluate(() => window.probe.mundo.rompiblesEnPie());
console.log(`\n  CON EL MONTÓN ENTERO ROTO
    en pie          ${enPieAlFinal} de 4`);
for (let i = 0; i < solidoDespues.length; i++) {
  const a = solidoDespues[i].altura;
  console.log(`      antes ${String(solidoAntes[i].altura).padStart(7)} m -> ahora ` +
    (a === null ? "NADA en cinco metros: debajo está el pozo de la cloaca" : `${a} m`));
}
control("los cuatro se rompen a golpes, ninguno en pie",
  enPieAlFinal === 0, `${enPieAlFinal} en pie`);
// EL CONTROL DEL CHOQUE. El rayo se paraba en la tapa del almiar y ahora se para
// más abajo: en el suelo, o en el almiar que había debajo. Lo que se pide es que
// BAJE, no un valor concreto, porque uno de los cuatro está encima de otro.
control("EL CONTROL DEL CHOQUE: el rayo se paraba en su tapa y ahora baja",
  solidoDespues.every((s, i) => s.altura === null || s.altura < solidoAntes[i].altura - 0.2),
  solidoDespues.map((s, i) => `${(solidoAntes[i].altura - (s.altura ?? -9)).toFixed(1)}`).join("/") + " m");

// ── 7. EL BOTÓN DE LA MANZANA ──────────────────────────────────────────────
//
// Y ENTRE LOS DOS GOLPES SE ESPERA DE VERDAD: el botón dispara a un
// `multi_manager`, que reparte sus objetivos en el tiempo (`#0` es «ya», pero lo
// resuelve su `Think`, no la misma llamada). Leyendo `objetosSueltos()` en el
// mismo `evaluate` salía cero y parecía que la cadena no llegaba.
const sitio = await pag.evaluate(() => window.probe.mundo.irAlBoton(1.2));
const uno = await pag.evaluate(() => window.probe.mundo.golpearBoton(1));
await pag.waitForTimeout(700);
const objetos1 = await pag.evaluate(() => window.probe.mundo.objetosSueltos());
const dos = await pag.evaluate(() => window.probe.mundo.golpearBoton(99));
await pag.waitForTimeout(700);
const boton = await pag.evaluate(() => ({
  objetos2: window.probe.mundo.objetosSueltos(),
  pulsados: window.probe.mundo.botonesPulsados(),
  sinPortar: window.probe.mundo.disparadores().sinPortar ?? {},
}));
boton.sitio = sitio; boton.uno = uno; boton.dos = dos; boton.objetos1 = objetos1;
console.log(`\n  EL BOTÓN DE LA MANZANA
    primer golpe    hizo ${boton.uno.hizo}, pulsado ${boton.uno.pulsado}, vida ${boton.uno.vida}
    segundo golpe   hizo ${boton.dos.hizo}
    pulsados        ${boton.pulsados.join(", ") || "ninguno"}
    objetos         ${boton.objetos2.map((o) => `${o.nombre}:${o.guion} (vez ${o.vez})`).join(", ") || "ninguno"}`);
control("UN golpe de 1 abre un botón de `health 2`: `health` no es vida",
  boton.uno.hizo === true && boton.uno.vida === 2,
  `hizo ${boton.uno.hizo}, la vida sigue en ${boton.uno.vida}`);
control("y `wait -1` lo deja pulsado: el segundo golpe, de 99, no hace nada",
  boton.dos.hizo === false && boton.objetos2.length === boton.objetos1.length,
  `${boton.objetos1.length} objetos antes, ${boton.objetos2.length} después`);
control("el aparecedor de la manzana se dispara UNA vez, con su guion y su nombre",
  boton.objetos2.length === 1 && boton.objetos2[0].guion === "health_apple" &&
  boton.objetos2[0].nombre === "apple5spawn" && boton.objetos2[0].vez === 1,
  `${boton.objetos2.map((o) => `${o.nombre}/${o.guion}`).join(",")}`);
// ── CORRECCIÓN DEL 71 ─────────────────────────────────────────────────────
//
// Aquí había un control que decía:
//
//   «y se dice en voz alta que la manzana no cae: no hay objetos en el suelo»
//     (boton.sinPortar["objeto_aparece: no hay objetos en el suelo"] ?? 0) === 1
//
// y era correcto hasta el 71, que portó los objetos en el suelo. Ese aviso ya
// no existe: la manzana cae. Se cambia por la medida de lo que pasa ahora —que
// la manzana está DE VERDAD en el mundo— porque un control que sólo dijera
// «ya no hay aviso» estaría verde también el día que el aparecedor dejara de
// dispararse.
const enElSuelo = await pag.evaluate(() => window.probe.mundo.suelo());
console.log(`    en el suelo     ${enElSuelo.map((o) => `${o.guion} (${o.estado})`).join(", ") || "nada"}`);
control("y la manzana CAE: desde el 71 hay objetos en el suelo, y hay uno",
  enElSuelo.length === 1 && enElSuelo[0].guion === "health_apple",
  enElSuelo.map((o) => `${o.guion}:${o.estado}`).join(", ") || "ninguno");
control("y ya no se cuenta como hueco: ese aviso del 69 ha desaparecido",
  (boton.sinPortar["objeto_aparece: no hay objetos en el suelo"] ?? 0) === 0,
  Object.entries(boton.sinPortar).filter(([k]) => /objeto|render/.test(k))
    .map(([k, v]) => `${k}=${v}`).join(" · ").slice(0, 110) || "ninguno");
// ── CORRECCIÓN DEL 76 ───────────────────────────────────────────────────────
//
// Aquí ponía:
//
//     control("y que el `env_render` del árbol apunta a un ADORNO, que es el
//       otro hueco", (boton.sinPortar["render: el objetivo es un adorno"] ?? 0) > 0, ...)
//
// y era verdad cuando se escribió: el 69 descubrió que seis de los siete
// `env_render` de Edana apuntan a un `env_model` y que los adornos se horneaban
// sin nombre, así que la regla no alcanzaba a nadie. **El 76 lo cerró**: un
// adorno con `targetname` ya no se funde en la malla de los 46 y el
// `env_render` lo apaga. Ese aviso ya no existe, y por eso este control se
// quedó rojo con el trabajo bien hecho.
//
// Se cambia por la medida de lo que pasa AHORA —que la manzana del árbol se
// apaga de verdad— y no por un «ya no hay aviso», que estaría verde también el
// día que el `env_render` dejara de dispararse. Misma razón que el control de
// arriba.
const adornoDelArbol = await pag.evaluate(() => window.probe.mundo.adornosLlamados("apple5")[0] ?? null);
control("y la manzana del ÁRBOL se ha apagado: el otro hueco se cerró en el 76",
  adornoDelArbol && adornoDelArbol.visible === false && adornoDelArbol.cambios >= 1,
  adornoDelArbol ? `visible ${adornoDelArbol.visible}, cambios ${adornoDelArbol.cambios}` : "no está");

await pag.screenshot({ path: "build/edana/vistas/edana69.png" });

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
console.log(`  captura:        build/edana/vistas/edana69.png\n`);

await nav.close(); matar(dev);
process.exit(mal.length || errores.length ? 1 : 0);
