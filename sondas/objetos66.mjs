// LOS OBJETOS CORREN SU GUION, Y ESO ES LO QUE LE AFECTA AL JUGADOR — el 66.
//
//   npm run sonda:objetos66
//
// LO QUE ESTO EXISTE PARA MEDIR es que un objeto en la mochila **está vivo**: que
// arranca su guion al entrar, que sus bucles de `repeatdelay` corren sin que
// nadie los llame, que le habla al jugador por `callexternal ent_owner` y que lo
// que le hace **se ve en la vida del personaje**.
//
// El caso lo trajo el usuario de memoria: «el hechizo de regeneración, cuando lo
// equipabas tu vida regeneraba rápidamente». Está escrito en
// `items/magic_hand_div_rejuvenate.script:155-179` y hasta hoy no lo corría
// nadie.
//
// Por qué hace falta una sonda: las pruebas de Node ya demuestran que el objeto
// sabe curar si alguien lo monta y le da un reloj. Lo que no pueden ver es **si
// el juego lo monta** y **si el reloj corre en el bucle de fotogramas**, que son
// las dos costuras donde este proyecto se equivoca (apartado 4 de CLAUDE.md).
//
// Las formas de que esto parezca funcionar y esté mal:
//
//   1. la tabla no se carga        -> `probe.objetos.hay()` es false y todo lo
//                                     demás son ceros que pasan solos
//   2. se carga y nadie monta      -> `vivos` vacío con la mochila llena
//   3. monta y el reloj no corre   -> bucles armados y la vida quieta: es el
//                                     fallo del 65 con `programar`
//   4. la vida sube por otra cosa  -> hace falta el MISMO personaje sin el
//                                     objeto, o «subió» no dice nada
//   5. llama y el jugador no oye   -> `pedidos` con `contestado: false`
//   6. el objeto comprado no vive  -> la costura de comprar → montar

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";
import { mkdirSync } from "node:fs";

const PORT = 5238;
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
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const HECHIZO = "magic_hand_div_rejuvenate";

try {

// Por el menú, como el jugador: los guiones de objeto se montan con el
// `aparece` de la sesión, así que entrar por un atajo mediría otro juego.
await entrarPorElMenu(pag, PORT);
mkdirSync("build/gatecity/vistas", { recursive: true });
await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
await esperar(1200);

// ── 0. EL CONTROL DE TODO LO DEMÁS ─────────────────────────────────────────
const hay = await pag.evaluate(() => window.probe.objetos.hay());
const horneados = await pag.evaluate(() => window.probe.objetos.horneados());
console.log(`\n  LA TABLA`);
console.log(`    cargada         ${hay}, ${horneados} objetos con guion`);
control("los guiones de objeto están cargados: sin esto, todo lo de abajo son ceros que pasan solos",
  hay && horneados > 100, `${hay} · ${horneados}`);

// ── 1. LO QUE EL PERSONAJE YA LLEVA ESTÁ VIVO ──────────────────────────────
//
// Un personaje nuevo nace con su arma y sus fundas. Que esos objetos corran su
// guion es lo primero, porque si no hay ninguno vivo todo lo demás mide el
// objeto que añada la sonda y no el juego.
const vivosAlNacer = await pag.evaluate(() => window.probe.objetos.vivos());
console.log(`\n  LO QUE LLEVA AL NACER`);
console.log(`    vivos           ${vivosAlNacer.length}: ${vivosAlNacer.map((v) => v.id).join(", ") || "ninguno"}`);
control("los objetos con los que nace el personaje corren su guion",
  vivosAlNacer.length > 0, vivosAlNacer.map((v) => v.id).join(" "));
control("y todos los montados tienen guion de verdad, no una cáscara",
  vivosAlNacer.length > 0 && vivosAlNacer.every((v) => v.hay),
  JSON.stringify(vivosAlNacer.map((v) => v.hay)));

// ── 2. EL HECHIZO, QUE ES EL CASO CON NOMBRE ───────────────────────────────
//
// Se le mete a la mochila y se pide la sincronización, que es exactamente la
// costura que recorre el jugador al comprarlo en una tienda.
console.log(`\n  EL HECHIZO DE REJUVENECER`);
const montados = await pag.evaluate((id) => {
  const p = window.probe.sesion.personaje;
  p.objetos = [...(p.objetos ?? []), { id, n: 1 }];
  return window.probe.objetos.sincronizar();
}, HECHIZO);
const vivos = await pag.evaluate(() => window.probe.objetos.vivos());
const elHechizo = vivos.find((v) => v.id === HECHIZO) ?? null;
console.log(`    montados        ${montados} nuevo(s)`);
console.log(`    bucles          ${elHechizo ? elHechizo.bucles.join(", ") || "NINGUNO" : "no está vivo"}`);
control("meter el objeto en la mochila ARRANCA su guion: es la costura de comprar",
  montados >= 1 && Boolean(elHechizo), `${montados} · ${Boolean(elHechizo)}`);
// `repeatdelay` es una directiva del CARGADOR (script.cpp:5377-5382): estos dos
// bucles se arman por existir el archivo, y nadie los llama nunca.
control("sus dos bucles están armados sin que nadie los llame",
  Boolean(elHechizo) && elHechizo.bucles.includes("passive_regen")
    && elHechizo.bucles.includes("enable_passive_regen_check"),
  elHechizo ? elHechizo.bucles.join(" ") : "ninguno");

// ── 3. Y LA VIDA SUBE, CON SU CONTROL NEGATIVO AL LADO ─────────────────────
//
// Se hiere primero: con la vida al máximo el guion no cura —su propia guarda,
// `if ( MY_CUR_HEALTH < MY_MAX_HEALTH )`— y «no cambió nada» pasaría solo.
//
// Y hace falta medir DOS veces con el mismo personaje herido igual: una con el
// hechizo y otra sin él. El jugador tiene su propia regeneración desde el 64
// —1 de vida cada 12 s— así que «la vida subió» NO demuestra que sea el objeto.
//
// SE HIERE A 1 Y NO A 20, y eso lo enseñó esta sonda: un personaje nuevo tiene
// **15** de vida máxima, y curar a alguien que está por encima del tope en
// Master Sword **se la BAJA** —`V_min(Max - Current, Amt)` sale negativo,
// msmonsterserver.cpp:1990—. Con la vida puesta a 20 el control leía −5 y el
// juego estaba bien: la sonda medía un estado imposible.
//
// LA VENTANA SON SEIS SEGUNDOS Y NO DOS, y el motivo está en el guion: el
// hechizo no cura desde el primer instante. `add_delay` pone
// `REGEN_DELAY = game.time + SPELL_PREPARE_TIME` y la puerta la abre el OTRO
// bucle, que mira cada segundo si ya toca (`enable_passive_regen_check`). O sea
// que hay una espera de preparación más un tic de granularidad, y con dos
// segundos el control leía cero con el juego correcto.
//
// Lo que se mide es el SALTO y no el ritmo: a 4,1 de vida cada medio segundo,
// desde 1 se toca el tope de 15 enseguida. El ritmo exacto lo fijan las pruebas
// de Node, que pueden poner la vida máxima que quieran; aquí lo que hace falta
// saber es que el objeto está vivo dentro del bucle de fotogramas del juego.
async function curadoEn(segundos, conHechizo) {
  await pag.evaluate((quitar) => {
    const p = window.probe.sesion.personaje;
    if (quitar) p.objetos = (p.objetos ?? []).filter((o) => o.id !== "magic_hand_div_rejuvenate");
    window.probe.objetos.sincronizar();
    p.vida = 1;
  }, !conHechizo);
  const antes = await pag.evaluate(() => window.probe.sesion.personaje.vida);
  await esperar(segundos * 1000);
  const luego = await pag.evaluate(() => window.probe.sesion.personaje.vida);
  return { antes, luego, subio: luego - antes };
}
console.log(`\n  LA CURACIÓN, EN SEIS SEGUNDOS`);
const sinEl = await curadoEn(6, false);
console.log(`    sin el hechizo  ${sinEl.antes} -> ${sinEl.luego}  (+${sinEl.subio.toFixed(1)})`);
// Se vuelve a meter para la segunda mitad.
await pag.evaluate((id) => {
  const p = window.probe.sesion.personaje;
  p.objetos = [...(p.objetos ?? []), { id, n: 1 }];
  window.probe.objetos.sincronizar();
}, HECHIZO);
const conEl = await curadoEn(6, true);
console.log(`    con el hechizo  ${conEl.antes} -> ${conEl.luego}  (+${conEl.subio.toFixed(1)})`);

// EL UMBRAL NO ES «> 0», y esto lo enseñó la rotura a propósito: con el paso de
// los objetos desconectado la vida subía **+1** —la regeneración del propio
// jugador, del 64— y el control se quedaba VERDE con el hechizo muerto. Es el
// apartado 4 de CLAUDE.md en su forma más pura: el valor de reposo pasaba la
// prueba. El jugador solo da 1 de vida cada 12 s, así que en seis segundos no
// puede pasar de 1: pedir más de 3 separa los dos mecanismos.
control("con el hechizo encima la vida sube sola, y MÁS de lo que da el jugador solo",
  conEl.subio > 3, `+${conEl.subio.toFixed(1)}`);
control("y sube MUCHO más que sin él: es el objeto y no la regeneración del jugador",
  conEl.subio > sinEl.subio * 3 + 1, `sin ${sinEl.subio.toFixed(1)} · con ${conEl.subio.toFixed(1)}`);

// ── 4. Y LE HABLA AL JUGADOR, QUE CONTESTA ─────────────────────────────────
//
// `callexternal ent_owner <evento>` era un no-op en TODO el proyecto, en el
// entorno de los NPC y en el del jugador. Se miden las dos mitades por separado
// —que el objeto llame y que el jugador conteste— porque la del 60 enseñó que
// cuando una regla decide *qué* y otra cosa decide *a quién*, hay que probar las
// dos: ninguna prueba de la primera ve la segunda.
const pedidos = await pag.evaluate((id) => window.probe.objetos.pedidos(id), HECHIZO);
const contestados = (pedidos ?? []).filter((x) => x.contestado);
console.log(`\n  LO QUE EL OBJETO LE PIDE AL JUGADOR`);
console.log(`    peticiones      ${(pedidos ?? []).length}, contestadas ${contestados.length}`);
console.log(`    eventos         ${[...new Set((pedidos ?? []).map((x) => x.evento))].join(", ") || "ninguno"}`);
control("el objeto le PIDE cosas al guion del jugador: `callexternal ent_owner` llega",
  (pedidos ?? []).length > 0, String((pedidos ?? []).length));
control("y el jugador CONTESTA: las dos mitades del camino, medidas aparte",
  contestados.length > 0, `${contestados.length} de ${(pedidos ?? []).length}`);

await pag.screenshot({ path: "build/gatecity/vistas/objetos66.png" });

// ── 5. QUITARLO LO APAGA ───────────────────────────────────────────────────
//
// En el motor el objeto se destruye al salir del inventario y sus bucles paran.
// Sin esto el hechizo curaría desde el limbo, y el control de arriba —«sube más
// con él»— seguiría verde, porque nunca se le quita.
await pag.evaluate(() => {
  const p = window.probe.sesion.personaje;
  p.objetos = (p.objetos ?? []).filter((o) => o.id !== "magic_hand_div_rejuvenate");
  window.probe.objetos.sincronizar();
  p.vida = 1;
});
const quedan = await pag.evaluate(() => window.probe.objetos.vivos());
const antesDeNada = await pag.evaluate(() => window.probe.sesion.personaje.vida);
await esperar(2000);
const despues = await pag.evaluate(() => window.probe.sesion.personaje.vida);
console.log(`\n  AL QUITARLO`);
console.log(`    sigue vivo      ${quedan.some((v) => v.id === HECHIZO)}`);
console.log(`    vida en 2 s     ${antesDeNada} -> ${despues}`);
control("quitarlo de la mochila apaga su guion: no cura desde el limbo",
  !quedan.some((v) => v.id === HECHIZO) && (despues - antesDeNada) < conEl.subio,
  `${antesDeNada} -> ${despues}`);

// ── 6. LO QUE LOS OBJETOS PIDEN Y NO SABEMOS HACER ─────────────────────────
//
// No es un control: es la cuenta, y se dice porque los guiones de objeto NO
// caben enteros —57 % de sus eventos— y callarlo haría parecer que sí.
const noSop = await pag.evaluate(() => window.probe.objetos.noSoportados());
const cuenta = new Map();
for (const x of noSop) {
  const k = String(x).replace(/^[^:]*:\s*/, "");
  cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
}
console.log(`\n  LO QUE FALTA POR PORTAR (no es un control)`);
console.log(`    ${[...cuenta].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} x${v}`).join(", ") || "nada"}`);

control("y no hubo errores de JavaScript", errores.length === 0, errores.slice(0, 2).join(" · "));

} catch (e) {
  // LA CAÍDA ES UNA ROJA, no una nota al pie. Es la lección del 65: un «X de Y»
  // donde Y se calcula al final no puede bajar nunca, así que `arranque36` decía
  // «22 de 22» con ocho controles sin ejecutar.
  console.log(`\n  LA SONDA SE HA CAÍDO: ${e?.message ?? e}`);
  console.log(`  de la pagina: ${errores.length ? errores.slice(0, 10).join("\n    ") : "nada"}`);
  control("LA SONDA LLEGA AL FINAL: si no, lo de abajo cuenta sólo lo que corrió", false,
    String(e?.message ?? e).slice(0, 80));
} finally {
  console.log(`\n  ── ${controles.filter((c) => c.bien).length} de ${controles.length} controles ──`);
  for (const c of controles) console.log(`  ${c.bien ? "sí" : "NO"}  ${c.que}${c.detalle ? `  [${c.detalle}]` : ""}`);
  console.log(`\n  captura         build/gatecity/vistas/objetos66.png`);
  console.log(`  errores de página: ${errores.length ? errores.join(" · ") : "ninguno"}`);
  await nav.close();
  matar(dev);
}
