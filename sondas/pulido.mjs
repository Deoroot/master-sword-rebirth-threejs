// EL 26 EN PANTALLA: las ranuras que vuelven, la barra de carga y el aterrizaje.
//
//   npm run sonda:pulido
//
// `npm test` comprueba la regla: que `cargarRanuras` apaga la que ya no llevas,
// que el nivel 4 es (45,100,0), que a 349 u/s no suena nada. Ninguna de esas 29
// pruebas dice que el juego haga nada de eso.
//
// Las formas de que esto parezca funcionar y esté mal:
//
//    1. graba la ranura y no toca el documento   -> `apuntarRanuras` no se llama
//    2. la guarda y al aparecer no la lee        -> falta en el `al("aparece")`
//    3. la lee y apunta a un objeto que no está  -> falta la comprobación
//    4. la apaga SIEMPRE                         -> la mano no cuenta como llevar
//    5. la barra no se pinta                     -> `cargaBruta` no llega al HUD
//    6. se pinta y no cambia de color            -> se pasó un tanto por uno
//    7. cambia de color y no pone el número      -> la etiqueta no se escribe
//    8. suena en cada fotograma                  -> falta la memoria del nivel
//    9. suena en la segunda carga                -> se ha "arreglado" el bug
//   10. aterrizar no suena                       -> la regla quedó dentro del
//                                                   `if (audio.despierto)`
//   11. suena siempre, hasta de un salto pequeño -> falta el umbral de 350
//   12. correr sigue mudo                        -> `npm run sonido` sin generar

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";
import { mkdirSync } from "node:fs";

const PORT = 5209;
// Se mata a quien estuviera en el puerto ANTES de arrancar el nuestro.
// `--strictPort` hace que el nuestro falle si esta ocupado, y con
// `stdio: "ignore"` ese fallo no se ve: la sonda acaba midiendo el programa
// de otro. Ver `sondas/mismo.mjs`.
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (habia ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = await arrancarVite(PORT);
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
const nav = await chromium.launch();
const ANCHO = 1200, ALTO = 800;
const pag = await nav.newPage({ viewport: { width: ANCHO, height: ALTO } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
// SE ENTRA POR EL MENÚ, como el jugador (57). Antes era `?map=gatecity`,
// que se salta el menú: carga el nivel y arranca la sesión de una pasada,
// que es un montaje que el jugador no ve nunca. Ver `sondas/entrar.mjs`.
await entrarPorElMenu(pag, PORT);
mkdirSync("build/gatecity/vistas", { recursive: true });

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });

await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
await pag.evaluate(() => window.probe.vivo.congelarPaseo(true));
await pag.evaluate(() => window.probe.ranuras.armarse());
await pag.evaluate(() => window.probe.hud.avanzar(40));

// ── 1. LA RANURA SOBREVIVE, que era la deuda del 25 ────────────────────────
const grabar = await pag.evaluate(() => {
  window.probe.ranuras.pulsar(3);
  window.probe.hud.avanzar(2.5);          // los dos segundos de aguante y algo
  return window.probe.ranuras.estado();
});
console.log(`\n  LAS RANURAS`);
console.log(`    grabada la 3    ${grabar.guardadas[2] ?? "(vacía)"}`);
console.log(`    en el documento ${grabar.enElPersonaje[2] ?? "(nada)"}`);
control("aguantar la tecla 3 graba lo que llevas en la mano",
  Boolean(grabar.guardadas[2]), `${grabar.guardadas[2]}`);
control("y la ranura va al DOCUMENTO del personaje, no sólo a la memoria",
  Boolean(grabar.enElPersonaje[2]), `${grabar.enElPersonaje[2]}`);
control("las 36 están en el documento, vacías incluidas",
  grabar.enElPersonaje.length === 36, `${grabar.enElPersonaje.length}`);

const vuelve = await pag.evaluate(() => window.probe.ranuras.recobrar());
control("al aparecer se recobra: la ranura sigue ahí",
  Boolean(vuelve.guardadas[2]), `${vuelve.guardadas[2]}`);
control("y sigue sabiendo su nombre, que no se guarda",
  String(vuelve.guardadas[2] ?? "").toLowerCase().includes("sword"), `${vuelve.guardadas[2]}`);

// El otro lado, que es el del motor: `QuickSlot.Active = bFound`.
const sinEspada = await pag.evaluate(() => window.probe.ranuras.recobrar("swords_rsword"));
control("una ranura con un objeto que ya no llevas SE APAGA",
  sinEspada.guardadas[2] === null, `${sinEspada.guardadas[2]}`);
control("y las demás no se tocan",
  sinEspada.guardadas.filter(Boolean).length === 0, `${sinEspada.guardadas.filter(Boolean).length} puestas`);

// Y que la de la MANO cuenta como llevada: es el fallo 4 de la lista de arriba.
const conLaDeLaMano = await pag.evaluate(async () => {
  await window.probe.ranuras.empunar("axes_rsmallaxe");
  window.probe.ranuras.pulsar(5);
  window.probe.hud.avanzar(2.5);
  return window.probe.ranuras.recobrar();
});
control("una ranura con el arma que llevas PUESTA sobrevive",
  Boolean(conLaDeLaMano.guardadas[4]), `${conLaDeLaMano.guardadas[4]}`);

// ── 2. LA BARRA DE CARGA ───────────────────────────────────────────────────
//
// CON EL BASTÓN, y no con la espada, que es lo que el 40 corrigió.
//
// El tope de carga es del ARMA —`V_min(Charge, HighestCharge)`,
// giattack.cpp:1110— y encima se salta los ataques para los que no tienes
// destreza (`giattack.cpp:617-623`). La espada oxidada registra un solo
// cargado y lo pide a `reqskill 2`, así que con un personaje recién hecho
// —swordsmanship proficiency 0— **no tiene carga ninguna**: ni barra, ni
// niveles, ni sonido. Esta sonda la usaba y medía nuestro fallo de entonces,
// que era un reloj sin tope subiendo por niveles que el arma no tiene.
//
// El bastón sí sirve: registra DOS cargados, a 100 % y 200 %, los dos con
// `reqskill 0`. Así que llega de verdad al nivel 2 y las cinco medidas de
// abajo —color, número, sonido por subida— siguen teniendo algo que medir.
const carga = await pag.evaluate(async () => {
  await window.probe.ranuras.empunar("polearms_qs");
  window.probe.hud.avanzar(1);
  return window.probe.golpe.cargar(2.4);
});
console.log(`\n  LA BARRA DE CARGA`);
console.log(`    carga           ${carga.carga.toFixed(2)} unidades en ${carga.cargando.toFixed(2)} s`);
console.log(`    visible         ${carga.fotogramasVisible} fotogramas`);
console.log(`    colores         ${carga.colores.join(" | ") || "(ninguno)"}`);
console.log(`    números         ${carga.niveles.map((n) => `"${n}"`).join(" ") || "(ninguno)"}`);
console.log(`    primera         x=${carga.primera?.x} y=${carga.primera?.y} relleno ${carga.primera?.relleno}`);
console.log(`    sonidos         ${carga.sonidos}`);
control("la barra SE VE mientras se carga", carga.fotogramasVisible > 0,
  `${carga.fotogramasVisible} fotogramas`);
// El arma va en la DERECHA, y la barra de la derecha sale a 304 **+** 30:
// `LEFT_HAND == 0` (genericitem.h:15-23) y `Bar = m_Hand < 2 ? m_Hand : 1`
// (vgui_health.h:234). Hasta el 40 los dos nombres estaban cambiados y la
// barra que se encendía era la del otro lado, que es lo que se veía jugando.
control("sale a 304 + 30 de 640, del lado de su mano y con la errata portada",
  carga.primera && Math.abs(carga.primera.x - (304 + 30) * (ANCHO / 640)) < 2,
  `x=${carga.primera?.x}, esperado ${Math.round((304 + 30) * (ANCHO / 640))}`);
control("y es la barra de la mano DERECHA, que es donde está el arma",
  carga.primera?.mano === "derecha", `${carga.primera?.mano}`);
control("el primer nivel se pinta NEGRO",
  carga.colores.some((c) => /rgba\(0, 0, 0/.test(c)), carga.colores[0] ?? "");
control("y al segundo cambia a rojo",
  carga.colores.some((c) => /rgba\(100, 0, 0/.test(c)), carga.colores.join(" "));
control("el número de la etiqueta aparece en el SEGUNDO nivel, no en el primero",
  carga.niveles.includes(" ") && carga.niveles.includes("1"),
  carga.niveles.map((n) => `"${n}"`).join(" "));
// En 2,4 s se pasa del nivel 1 al 3 —los niveles caen en segundos enteros—,
// o sea DOS subidas. Lo que se comprueba es que suena por subida y no por
// fotograma: la barra estuvo visible 145 y sonó 2 veces.
control("suena una vez por subida de nivel, no en cada fotograma",
  carga.sonidos === 2, `${carga.sonidos} sonidos en ${carga.fotogramasVisible} fotogramas, niveles ${carga.niveles.length}`);

// Y EL NEGATIVO, que es el fallo que el jugador vio: la espada oxidada pide
// `reqskill 2` para su único cargado, y un personaje recién hecho tiene
// swordsmanship proficiency 0. `GetHighestAttackCharge()` devuelve 0, así que
// `ActivateButtonDown` ni arranca el reloj: cero barra, y es lo correcto.
const espada = await pag.evaluate(async () => {
  await window.probe.ranuras.empunar("swords_rsword");
  window.probe.hud.avanzar(1);
  return window.probe.golpe.cargar(2.4);
});
console.log(`    espada oxidada  destreza ${espada.destreza}, tope ${espada.tope}, carga ${espada.carga.toFixed(2)}, ${espada.fotogramasVisible} fotogramas`);
control("sin la destreza que pide, la espada no carga NADA y no hay barra",
  espada.fotogramasVisible === 0 && espada.carga === 0,
  `carga ${espada.carga}, ${espada.fotogramasVisible} fotogramas con destreza ${espada.destreza}`);
control("y el tope es del ARMA: 0 la espada sin destreza, 2,5 el bastón",
  espada.tope === 0 && carga.tope === 2.5,
  `espada ${espada.tope}, bastón ${carga.tope}`);

// De vuelta al bastón para lo que queda, que es lo que sí carga.
await pag.evaluate(async () => {
  await window.probe.ranuras.empunar("polearms_qs");
  window.probe.hud.avanzar(1);
});

// LA CAPTURA, y con el ratón de VERDAD apretado.
//
// La primera versión la tomaba justo después de `cargar()`, y salía sin barra:
// la puerta deja de pulsar al volver, el bucle sigue corriendo y en un
// milisegundo la barra ya se ha ido. Así que se hace como lo hace un jugador
// —clic, soltar en medio del mandoble, y volver a apretar sin soltar—, que
// además comprueba que el camino del ratón de verdad también carga.
await pag.mouse.move(ANCHO / 2, ALTO / 2);
await pag.mouse.click(ANCHO / 2, ALTO / 2);
await pag.waitForTimeout(300);
const conPuntero = await pag.evaluate(() => Boolean(document.pointerLockElement));
console.log(`    puntero capturado: ${conPuntero}`);
await pag.mouse.down();
await pag.waitForTimeout(200);
await pag.mouse.up();
await pag.mouse.down();
await pag.waitForTimeout(1400);
const enPantalla = await pag.evaluate(() => window.probe.hud.estado().carga.find((c) => c.visible) ?? null);
control("y con el ratón de verdad —clic, soltar, apretar— también carga y se ve",
  Boolean(enPantalla), enPantalla ? `nivel "${enPantalla.nivel}", relleno ${enPantalla.relleno}` : "no se ve");
await pag.screenshot({
  path: "build/gatecity/vistas/carga.png",
  clip: { x: 0, y: ALTO - 220, width: ANCHO, height: 220 },
});
await pag.mouse.up();

// El fallo del motor, portado: `mCurChargeLevel` no se reinicia al soltar.
const segunda = await pag.evaluate(() => {
  window.probe.golpe.soltar(1.5);
  return window.probe.golpe.cargar(2.4);
});
// `mCurChargeLevel` no se reinicia al soltar, y aun así la segunda carga
// suena igual: se recarga desde cero y el primer fotograma lo devuelve al 1.
// Lo escribí al revés en la primera versión y esta medida me corrigió.
control("y la segunda carga suena igual que la primera",
  segunda.sonidos === 2, `${segunda.sonidos} sonidos en la segunda`);
control("pero la barra se ve igual en la segunda",
  segunda.fotogramasVisible > 0, `${segunda.fotogramasVisible} fotogramas`);
await pag.evaluate(() => window.probe.golpe.soltar(1.5));

// ── 3. ATERRIZAR ───────────────────────────────────────────────────────────
//
// `probe.mundo.caer` mete velocidad de caída directamente, porque soltar al
// jugador desde una altura mide la GEOMETRÍA del mapa y no la regla.
//
// Y NO con `probe.mundo.caer`: eso le mete velocidad al jugador que ya está
// apoyado, y `ultimaCaida` sólo se escribe en el fotograma en que se PASA de
// aire a suelo. La primera versión de esta sonda leía tres veces el mismo
// aterrizaje —el del propio nacimiento— y daba tres ceros idénticos y
// convincentes. Se le sube y se le deja caer, que es lo que hace un jugador.
const caida = async (metros) => {
  const antes = await pag.evaluate(() => window.probe.sonido.estado.aterrizajes.length);
  await pag.evaluate((m) => {
    const p = window.probe.mundo.donde().pies;
    window.probe.mundo.poner(p[0], p[1] + m, p[2]);
  }, metros);
  for (let i = 0; i < 40; i++) {
    await pag.waitForTimeout(100);
    const e = await pag.evaluate(() => window.probe.sonido.estado.aterrizajes);
    if (e.length > antes) return e[e.length - 1];
  }
  return null;
};
console.log(`\n  EL ATERRIZAJE`);
// Las tres alturas salen de los umbrales del motor: 350 u/s son 1,6 m de
// caída libre, 580 son 4,3 m y 1 024 son 13,5 m.
const suave = await caida(1);
const media = await caida(3);
const dura = await caida(14);
for (const [k, c] of [["desde 1 m", suave], ["desde 3 m", media], ["desde 14 m", dura]]) {
  console.log(`    ${k.padEnd(10)} caída medida ${c?.caida ?? "?"} · volumen ${c?.volumen ?? "?"}` +
    `${c?.voz ? `, voz ${c.voz}` : ""}${c?.golpe ? `, dado ${c.golpe}` : ""} sobre ${c?.material ?? "?"}`);
}
control("desde un metro el aterrizaje es MUDO: el umbral son 350 u/s",
  suave?.volumen === 0, `caída ${suave?.caida} u/s, volumen ${suave?.volumen}`);
control("desde tres metros suena, al 0,85", media?.volumen === 0.85,
  `caída ${media?.caida} u/s, volumen ${media?.volumen}`);
control("desde catorce metros suena a tope y GRITA de dolor",
  dura?.volumen === 1 && dura?.voz === "player/fallpain3.wav",
  `${dura?.volumen}, ${dura?.voz}`);
control("y con daño sale una de las cinco caras del dado",
  Boolean(dura?.golpe), `${dura?.golpe}`);
control("el material bajo los pies es el que decide la muestra",
  Boolean(dura?.material), `${dura?.material}`);

// ── 4. CORRER YA NO ES MUDO ────────────────────────────────────────────────
const snd = await pag.evaluate(() => window.probe.sonido.estado);
console.log(`\n  EL SONIDO DE LOS PASOS`);
console.log(`    por material    ${Object.entries(snd.catalogo.pasos).map(([k, n]) => `${k} ${n}`).join(", ")}`);
console.log(`    generados       ${Object.entries(snd.catalogo.generados).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(", ") || "ninguno"}`);
console.log(`    del jugador     ${snd.catalogo.jugador.length}: ${snd.catalogo.jugador.join(", ")}`);
control("la piedra tiene sus cuatro muestras (el 92 % de lo que se pisa)",
  snd.catalogo.pasos.piedra === 4, `${snd.catalogo.pasos.piedra}`);
control("la tierra también", snd.catalogo.pasos.tierra === 4, `${snd.catalogo.pasos.tierra}`);
// Y LO IMPORTANTE: que se sepa que son NUESTRAS. El mod no las tiene.
control("y las ocho están declaradas GENERADAS, no leídas",
  snd.catalogo.generados.piedra === 4 && snd.catalogo.generados.tierra === 4,
  `piedra ${snd.catalogo.generados.piedra}, tierra ${snd.catalogo.generados.tierra}`);
control("la hierba sigue siendo del juego, que sí la trae (pl_duct*)",
  snd.catalogo.pasos.hierba === 4 && !snd.catalogo.generados.hierba,
  `${snd.catalogo.pasos.hierba} leídas`);
control("los que faltan siguen declarados faltando",
  snd.catalogo.faltan > 0, `${snd.catalogo.faltan}`);
control("la barra de carga tiene su wav, que sí está en el mod",
  snd.catalogo.jugador.includes("magic/chargebar_alt1.wav"), "");
control("y las tres caras `common/bodydrop*` NO están: son de Valve",
  !snd.catalogo.jugador.some((s) => s.startsWith("common/")),
  snd.catalogo.jugador.filter((s) => s.startsWith("common/")).join(", ") || "ninguna, como en el juego");

// ── 4b. Y LA PREGUNTA QUE NADIE HABÍA HECHO: ¿en qué unidad va la velocidad?
//
// La regla compara contra números del motor —220 para el corte, 210 para
// separar andar de correr— y el bucle le pasa `player.vel`. Si la unidad no
// es la misma, no hay error: hay un juego que suena a carrera andando.
const andar = await pag.evaluate(() => window.probe.sonido.andando(1.5, { correr: false }));
const correr = await pag.evaluate(() => window.probe.sonido.andando(1.5, { correr: true }));
console.log(`
  LA UNIDAD DE LA VELOCIDAD`);
console.log(`    andando         máxima ${andar.maxima.toFixed(0)} · vel ${andar.horizontal.toFixed(1)} · como la lee el bucle ${andar.comoLaLeeElBucle.toFixed(0)}`);
console.log(`    corriendo       máxima ${correr.maxima.toFixed(0)} · vel ${correr.horizontal.toFixed(1)} · como la lee el bucle ${correr.comoLaLeeElBucle.toFixed(0)}`);
control("andando se anda a la velocidad que dice el personaje, en unidades/s",
  Math.abs(andar.horizontal - andar.maxima) < 15,
  `${andar.horizontal.toFixed(1)} contra ${andar.maxima.toFixed(0)}`);
control("y el bucle le pasa a los pasos ESA velocidad, no otra unidad",
  Math.abs(andar.comoLaLeeElBucle - andar.horizontal) < 15,
  `el bucle lee ${andar.comoLaLeeElBucle.toFixed(0)} y la velocidad es ${andar.horizontal.toFixed(1)}`);
control("andando se queda por DEBAJO del corte de 220, o sea mudo",
  andar.horizontal < 220, `${andar.horizontal.toFixed(0)} u/s`);
control("y corriendo lo pasa", correr.horizontal > 220, `${correr.horizontal.toFixed(0)} u/s`);

// La regla de los pasos, corrida sin tocar el audio: correr da pasos y andar no.
const andando = await pag.evaluate(() => window.probe.sonido.simular(180, 3).length);
const corriendo = await pag.evaluate(() => window.probe.sonido.simular(320, 3).length);
control("andar a 180 u/s sigue siendo mudo en multijugador (el corte de 220)",
  andando === 0, `${andando} pasos`);
control("y correr a 320 da pasos", corriendo > 5, `${corriendo} pasos en 3 s`);

// ── 5. NADA DE ESTO ROMPE EL MUNDO ─────────────────────────────────────────
// Y OJO: catorce metros MATAN, así que a estas alturas el personaje está
// muerto y el HUD escondido. Eso no es un fallo — es `seVeElHud`— y la
// primera versión de esta sonda lo contó como uno. Se reaparece y se mira.
const muerto = await pag.evaluate(() => {
  window.probe.hud.avanzar(0.2);
  return window.probe.hud.estado().visible;
});
control("catorce metros matan, y con el jugador muerto el HUD se esconde",
  muerto === false, `visible ${muerto}`);
const final = await pag.evaluate(async () => {
  await window.probe.sesion.reaparecer();
  window.probe.hud.avanzar(2);
  return { hud: window.probe.hud.estado(), golpe: window.probe.golpe.estado };
});
control("y al reaparecer vuelve", final.hud.visible === true, "");
control("y el arma sigue en la mano", final.golpe.triangulos > 0, `${final.golpe.triangulos} triángulos`);

// ── el veredicto ───────────────────────────────────────────────────────────
console.log("\n  CONTROLES");
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(70)} ${c.detalle}`);
const mal = controles.filter((c) => !c.bien);
console.log(`\n  ${controles.length - mal.length} de ${controles.length} en verde`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);
console.log(`  captura:        build/gatecity/vistas/carga.png\n`);

await nav.close(); matar(dev);
process.exit(mal.length || errores.length ? 1 : 0);
