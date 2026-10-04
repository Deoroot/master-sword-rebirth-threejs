// LAS TRES OLEADAS DEL CORRAL DE EDANA — experimento 68.
//
//   npm run sonda:edana68
//
// El usuario se acordaba de que «el jefe jabalí aparecía después de matar x
// cantidad de jabalíes normales». El mapa le da la razón, con más detalle del
// que se puede deducir jugando: quince jabalíes en tres oleadas encadenadas, y
// luego el grande de 60 de vida.
//
//   boars1 (msarea_monsterspawn, nace activa, lleva el reloj)
//     ficha sin nombre  lives 5              perishtarget wave2
//     ficha boar2       lives 5 spawnstart 1 perishtarget wave3_1
//     ficha boar3       lives 5 spawnstart 1 perishtarget wave3_2
//     ficha boarboss    lives 1 spawnstart 1 killtarget   boarsdead
//   wave2    mstrig_multi  -> boar2, boar3
//   wave3_1  trigger_relay -> wave3   (delay 4)
//   wave3_2  trigger_relay -> wave3   (delay 4)
//   wave3    multisource   -> boarboss
//
// ── LO QUE FALTABA, Y POR QUÉ NO DABA ERROR ────────────────────────────────
//
// 1. **`spawnstart` significa lo contrario de lo que suena**: es
//    `m_fSpawnOnTrigger = true` (msmapents.cpp:827-844), «no salgas hasta que te
//    llamen». Sin portarlo, las cuatro oleadas salían a la vez y el jefe estaba
//    en el corral desde el primer segundo. Verde por todas partes: hay jabalíes.
//
// 2. **`perishtarget` estaba declarado como NO portado** en la cabecera de
//    `src/play/aparecer.js`, con la razón correcta —«ninguna de las 38
//    plantillas de Gate City usa ninguno»— y la conclusión equivocada. Sexta vez
//    que el hueco lo enseña el segundo mapa.
//
// 3. **`fireallperish` sólo llegaba al aparecedor, no al mapa.** Es
//    `FireTargets` a secas (msmapents.cpp:1296), o sea que puede nombrar
//    cualquier entidad; se reinyectaba sólo en las áreas y bastaba en Gate City
//    por casualidad, porque allí apunta a otra área.
//
// 4. **`CMultiSource::Register` no estaba portado.** `entradas` se leía en dos
//    sitios y no se escribía en ninguno: la reja permanentemente abierta Y el
//    `Use` rechazando a todos. Dos huecos que se tapaban el uno al otro, y las
//    siete pruebas del 49 verdes porque escribían `entradas: [2, 3]` a mano.
//
// ── Y EL FINAL DE LA CADENA ESTÁ ROTO EN EL MOD, dos veces ─────────────────
//
// a) `wave3_1` y `wave3_2` tienen `delay 4`, y un retraso no lo sirve quien lo
//    pidió: `CBaseDelay::SUB_UseTargets` crea una entidad nueva llamada
//    `"DelayedUse"` (subs.cpp:252-269) y es ésa la que llama. El multisource no
//    la tiene registrada y la rechaza. **Lo avisa el propio mod, por su nombre,
//    en la primera línea de `CMultiSource::Use`** (buttons.cpp:173-176).
// b) Y si colara, detrás está la `SUB_UseTargets` de `CBaseEntity`, con la
//    condición invertida (subs.cpp:197), que tampoco dispararía.
//
// O sea que **el jefe jabalí no sale, y no es nuestro fallo**. Esta sonda lo
// mide en las dos direcciones: que las tres oleadas SÍ se encadenan hasta el
// último eslabón, y que el último no pasa — con el control positivo al lado
// (llamado a mano, el jefe sale), porque si no sería un cero sin testigo.
//
// ── LAS FORMAS DE QUE ESTO PAREZCA FUNCIONAR Y ESTÉ MAL ────────────────────
//
//   1. «hay jabalíes en el corral»        -> los había antes, y de más. Se mide
//                                            CUÁNTOS y CUÁLES a la vez
//   2. «el jefe no está»                  -> también estaría ausente si el área
//                                            no existiera. Control positivo:
//                                            llamado a mano, sale
//   3. «las oleadas 2 y 3 están dormidas» -> valor de reposo. Se comprueba que
//                                            DESPIERTAN al agotar la anterior
//   4. «wave2 se disparó»                 -> `cuenta` del bus cuenta INTENTOS,
//                                            no ejecuciones (lección del 67).
//                                            Se lee el estado de la FICHA

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";
import { readFileSync, mkdirSync } from "node:fs";

const PORT = 5268;
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

// La caída es una ROJA y no una nota al pie: la lección del 65.
try {

// ── 0. LO HORNEADO ─────────────────────────────────────────────────────────
const bichos = JSON.parse(readFileSync("build/edana/bichos.json", "utf8"));
const malla = JSON.parse(readFileSync("build/edana/malla.json", "utf8"));
const corral = bichos.colocados.filter((c) => c.aparecedor?.area === "boars1");
const jefeH = corral.find((c) => c.aparecedor.nombre === "boarboss");
console.log(`
  HORNEADO
    corral          ${corral.length} fichas en boars1`);
for (const c of corral) {
  const a = c.aparecedor;
  console.log(`      ${(a.nombre ?? "(sin nombre)").padEnd(12)} vidas ${String(a.vidas).padStart(2)}` +
    `  porDisparo ${String(a.porDisparo).padEnd(5)}  perece-> ${a.alPerecer ?? "-"}` +
    `  muere-> ${c.alMorir ?? "-"}`);
}
control("las cuatro fichas del corral traen `spawnstart` y `perishtarget`",
  corral.length === 4 && corral.filter((c) => c.aparecedor.porDisparo).length === 3
  && corral.filter((c) => c.aparecedor.alPerecer).length === 3,
  `${corral.length} fichas`);
control("el jefe tiene 60 de vida, UNA sola vida, y avisa a `boarsdead` al morir",
  jefeH?.hp === 60 && jefeH?.aparecedor.vidas === 1 && jefeH?.alMorir === "boarsdead",
  `hp ${jefeH?.hp}, vidas ${jefeH?.aparecedor.vidas}, killtarget ${jefeH?.alMorir}`);
// Las cuentas se calculan, no se escriben.
const normales = corral.filter((c) => c.aparecedor.nombre !== "boarboss");
const total = normales.reduce((s, c) => s + c.aparecedor.vidas, 0);
control("son QUINCE jabalíes normales antes del jefe, en tres oleadas de cinco",
  total === 15 && normales.length === 3, `${total} vidas en ${normales.length} oleadas`);

// ── 1. SE ENTRA A EDANA POR EL MENÚ ────────────────────────────────────────
await entrarPorElMenu(pag, PORT, { mapa: "edana" });
mkdirSync("build/edana/vistas", { recursive: true });
await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
await pag.waitForTimeout(2500);
const mapa = await pag.evaluate(() => window.probe.vgui2.mapaDeLaPartida());
control("se ha entrado a Edana y no a Gate City", mapa === "edana", `${mapa}`);

// ── 2. AL ENTRAR, SÓLO LA PRIMERA OLEADA ───────────────────────────────────
//
// Esto es lo que `spawnstart` compra, y sin portarlo el corral tenía los cuatro
// desde el primer segundo — incluido el jefe. Se pide el estado de las CUATRO
// fichas y no «cuántos jabalíes hay», porque cuántos hay no distingue un jefe
// dormido de un jefe que ya salió y se murió.
const estado = () => pag.evaluate(() => ({
  jefe: window.probe.mundo.fichaLlamada("boarboss"),
  b2: window.probe.mundo.fichaLlamada("boar2"),
  b3: window.probe.mundo.fichaLlamada("boar3"),
  despertadas: window.probe.mundo.despertadas(),
  // `censo()` devuelve `{total, hostiles, lista}` y no un array: la primera
  // versión de esta sonda le hizo `.filter` y se cayó en el segundo control.
  censo: window.probe.ia.censo().lista
    .filter((i) => /Boar/i.test(i.nombre ?? "") && !i.dormido).length,
}));
const e0 = await estado();
console.log(`\n  AL ENTRAR
    jabalíes en pie ${e0.censo}
    boar2           ${e0.b2?.puesto ? "puesto" : "dormido"}, despertada ${e0.b2?.despertada}
    boar3           ${e0.b3?.puesto ? "puesto" : "dormido"}, despertada ${e0.b3?.despertada}
    boarboss        ${e0.jefe?.puesto ? "PUESTO" : "dormido"}, apariciones ${e0.jefe?.apariciones}`);
control("las tres fichas con `spawnstart` están dormidas al entrar",
  e0.b2?.despertada === false && e0.b3?.despertada === false && e0.jefe?.despertada === false,
  `b2 ${e0.b2?.despertada}, b3 ${e0.b3?.despertada}, jefe ${e0.jefe?.despertada}`);
control("y el jefe NO está en el corral al llegar al pueblo",
  e0.jefe?.puesto === false && e0.jefe?.apariciones === 0,
  `puesto ${e0.jefe?.puesto}, apariciones ${e0.jefe?.apariciones}`);

// ── 3. SE MATA EL CORRAL, Y LA CADENA CORRE ────────────────────────────────
//
// No se pelea: matar quince jabalíes con un personaje de 15 de vida es otra
// sonda. Se les quita la vida por la vía del juez de daño, que es la misma por
// la que morirían peleando, y se deja correr el reloj para que el área los
// repare las cinco veces que le tocan.
// DOS COSAS QUE COSTARON UNA VUELTA CADA UNA, apuntadas porque no se deducen:
//
// 1. `probe.golpe.matar(n)` y `victima(n)` indexan sobre **los hostiles**, no
//    sobre `censo().lista`, y la lista se reordena; hay que rebuscar el índice.
// 2. **`censo().lista` no trae `muerto`**, sólo `dormido`. La primera versión
//    filtraba por `!dormido` y se pasó 720 llamadas rematando cadáveres, con
//    `wave2` sin disparar y la sonda diciendo «matados 720». Un cadáver de Master
//    Sword tarda en desvanecerse, y hasta que lo hace sigue en el censo despierto.
//    El `muerto` está en `victima(n)`, así que se pregunta ahí antes de pegar.
const matarJabalies = () => pag.evaluate(() => {
  const muertos = [];
  const hostiles = () => window.probe.ia.censo().lista.filter((x) => x.hostil);
  for (let vuelta = 0; vuelta < 20; vuelta++) {
    const l = hostiles();
    let k = -1;
    for (let j = 0; j < l.length; j++) {
      if (!/Boar/i.test(l[j].nombre ?? "") || l[j].dormido) continue;
      const v = window.probe.golpe.victima(j);
      if (!v || v.muerto) continue;             // el cadáver que aún no se ha ido
      k = j; break;
    }
    if (k < 0) break;
    muertos.push(window.probe.golpe.victima(k)?.nombre ?? "?");
    window.probe.golpe.matar(k);
  }
  return muertos;
});
// El reloj: la primera oleada reaparece con `delaylow 5`/`delayhigh 25`, así que
// cinco vidas pueden ser dos minutos y medio. Se espera por el ESTADO y no por un
// número de vueltas, con un tope generoso, y se anota lo que se ha tardado.
let muertos = 0;
const t0 = Date.now();
for (let vuelta = 0; vuelta < 400; vuelta++) {
  muertos += (await matarJabalies()).length;
  await pag.waitForTimeout(700);
  const e = await estado();
  if (e.jefe?.puesto || (e.b2?.agotada && e.b3?.agotada)) break;
}
const tardo = Math.round((Date.now() - t0) / 1000);
const e1 = await estado();
console.log(`\n  DESPUÉS DE VACIAR EL CORRAL
    matados         ${muertos} en ${tardo} s
    boar2           apariciones ${e1.b2?.apariciones}, agotada ${e1.b2?.agotada}
    boar3           apariciones ${e1.b3?.apariciones}, agotada ${e1.b3?.agotada}
    despertadas     ${e1.despertadas.join(", ") || "ninguna"}
    boarboss        ${e1.jefe?.puesto ? "PUESTO" : "dormido"}, despertada ${e1.jefe?.despertada}`);

// LA SEGUNDA OLEADA DESPIERTA: esto es el `perishtarget` de la primera llegando
// al `mstrig_multi wave2` del mapa y volviendo a las fichas. Es el viaje entero,
// y ninguna prueba de las dos mitades podía verlo.
control("agotada la primera oleada, `wave2` DESPIERTA a boar2 y a boar3",
  e1.b2?.despertada === true && e1.b3?.despertada === true,
  `b2 ${e1.b2?.despertada}, b3 ${e1.b3?.despertada}`);
control("y las dos han salido de verdad, no sólo despertado",
  (e1.b2?.apariciones ?? 0) > 0 && (e1.b3?.apariciones ?? 0) > 0,
  `b2 x${e1.b2?.apariciones}, b3 x${e1.b3?.apariciones}`);
control("las dos oleadas se agotan: cinco vidas cada una",
  e1.b2?.agotada === true && e1.b3?.agotada === true,
  `b2 ${e1.b2?.apariciones}/5, b3 ${e1.b3?.apariciones}/5`);

// ── 4. Y EL ÚLTIMO ESLABÓN NO PASA, QUE ES DEL MOD ─────────────────────────
const ms = await pag.evaluate(() => {
  const d = window.probe.mundo.disparadores();
  return { avisos: d.avisos ?? null, cuenta: d.cuenta ?? null };
});
control("EL FALLO DEL MOD: el jefe no sale, porque los relés tienen `delay`",
  e1.jefe?.despertada === false && e1.jefe?.puesto === false,
  `despertada ${e1.jefe?.despertada} — buttons.cpp:173-176, la copia DelayedUse`);

// EL CONTROL POSITIVO, sin el cual lo de arriba es un cero sin testigo: si se le
// llama a mano —que es lo que haría el multisource si el mod no estuviera
// roto— el jefe sale, con sus 60 de vida.
const jefeVivo = await pag.evaluate(async () => {
  window.probe.mundo.disparar("boarboss");
  await new Promise((r) => setTimeout(r, 1200));
  const f = window.probe.mundo.fichaLlamada("boarboss");
  const hostiles = window.probe.ia.censo().lista.filter((x) => x.hostil);
  const k = hostiles.findIndex((x) => /Huge Aggressive/i.test(x.nombre ?? "") && !x.dormido);
  return { ficha: f, nombre: k < 0 ? null : hostiles[k].nombre, k, vida: k < 0 ? null : window.probe.golpe.victima(k)?.vida };
});
await pag.waitForTimeout(1500);
const e2 = await estado();
console.log(`\n  EL CONTROL POSITIVO (llamado a mano)
    boarboss        ${e2.jefe?.puesto ? "PUESTO" : "dormido"}, apariciones ${e2.jefe?.apariciones}
    en el censo     ${jefeVivo.nombre ?? "no está"} con ${jefeVivo.vida ?? "?"} de vida`);
control("llamado a mano el jefe SÍ sale, así que el cero de arriba es del mod",
  e2.jefe?.puesto === true && e2.jefe?.apariciones === 1,
  `puesto ${e2.jefe?.puesto}, apariciones ${e2.jefe?.apariciones}`);
control("y es el de 60 de vida, no el jabalí de 20 de la plantilla",
  jefeVivo.vida === 60, `${jefeVivo.vida}`);

// ── 5. AL MORIR EL JEFE, EL VIEJO SE ENTERA ────────────────────────────────
//
// `killtarget` en un `msmonster_*` NO mata: dispara (msmonsterserver.cpp:2568).
// Es la otra mitad de la misión: el jefe avisa a `boarsdead`, que es el
// `ms_npcscript` que le cuenta al viejo del huerto que ya está hecho.
const antesEsc = await pag.evaluate(() => window.probe.mundo.escenasDeNpc().length);
await pag.evaluate(() => {
  const hostiles = window.probe.ia.censo().lista.filter((x) => x.hostil);
  const k = hostiles.findIndex((x) => /Huge Aggressive/i.test(x.nombre ?? "") && !x.dormido);
  if (k >= 0) window.probe.golpe.matar(k);
});
await pag.waitForTimeout(1500);
const escenas = await pag.evaluate(() => window.probe.mundo.escenasDeNpc());
const delViejo = escenas.slice(antesEsc).filter((s) => s.evento === "trig_boarsdead");
console.log(`\n  AL MORIR EL JEFE
    escenas nuevas  ${escenas.length - antesEsc}
    del viejo       ${delViejo.map((s) => `${s.npc}.${s.evento} contestó=${s.contesto}`).join(", ") || "ninguna"}`);
control("muerto el jefe, su `killtarget` llega al viejo del huerto",
  delViejo.length > 0, delViejo.length ? `${delViejo[0].npc}` : "no ha llegado");

await pag.screenshot({ path: "build/edana/vistas/edana68.png" });

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
console.log(`  captura:        build/edana/vistas/edana68.png\n`);

await nav.close(); matar(dev);
process.exit(mal.length || errores.length ? 1 : 0);
