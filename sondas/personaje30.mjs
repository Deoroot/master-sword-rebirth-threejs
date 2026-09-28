// CREAR PERSONAJE, en un Chrome de verdad.
//
//   npm run sonda:personaje30
//
// Ésta es la primera pantalla que ve quien abre el juego, así que la sonda no
// tiene que provocarla: **abre la página y ya tiene que estar ahí**. Si hay que
// llamar a algo para que aparezca, es que no es la pantalla de entrada.
//
// Las formas de que esto parezca funcionar y esté mal:
//
//    1. el panel se abre desde la sonda        -> no es la pantalla de entrada
//    2. sale y es la vieja                     -> hay que mirar QUÉ panel es
//    3. es la nueva y tiene una sola etapa     -> las tres, y en orden
//    4. tres etapas y no se puede volver       -> el botón «Back»
//    5. se vuelve y el nombre se pierde        -> escribir, ir, volver, mirar
//    6. escribir un nombre dispara las ranuras -> el campo se come sus teclas
//    7. se crea el personaje y no se entra     -> el mapa tiene que cargar
//    8. la rejilla de armas está centrada      -> NO tiene que estarlo: hay dos
//                                                 fallos de medida que se portan
//    9. las siete armas tienen icono           -> sólo dos, y es del juego
//   10. los personajes son dibujos             -> son modelos, y se animan

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { esNuestro, liberarPuerto } from "./mismo.mjs";
import { mkdirSync } from "node:fs";

const PORT = 5216;
// Se mata a quien estuviera en el puerto ANTES de arrancar el nuestro.
// `--strictPort` hace que el nuestro falle si esta ocupado, y con
// `stdio: "ignore"` ese fallo no se ve: la sonda acaba midiendo el programa
// de otro. Ver `sondas/mismo.mjs`.
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (habia ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { shell: true, stdio: "ignore" });
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
await new Promise((r) => setTimeout(r, 6000));

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });
const errores = [];
let nav = null;

try {
  nav = await chromium.launch();
  const ANCHO = 1200, ALTO = 800;
  const pag = await nav.newPage({ viewport: { width: ANCHO, height: ALTO } });
  pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
  await pag.goto(`http://localhost:${PORT}/?map=gatecity`, { waitUntil: "load" });
  await esNuestro(pag, PORT);
  mkdirSync("build/gatecity/vistas", { recursive: true });

  await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
  // Se borra lo que hubiera de otra vuelta: la sonda tiene que empezar sin
  // personajes, que es lo que ve alguien que entra por primera vez.
  await pag.evaluate(async () => {
    for (const c of await window.probe.sesion.listar()) await window.probe.sesion.borrar(c.id);
  });
  await pag.reload({ waitUntil: "load" });
  await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
  await new Promise((r) => setTimeout(r, 1200));

  // ── 1. ES LA PANTALLA DE ENTRADA ────────────────────────────────────────
  console.log(`\n  LA ENTRADA`);
  const entrada = await pag.evaluate(() => ({
    cual: window.probe.vgui.abierto(),
    panel: window.probe.vgui.panel(),
    botones: window.probe.vgui.botones().map((b) => ({ t: b.texto, x: b.centro, y: b.arriba })),
    vieja: Boolean(document.querySelector(".mx-velo")),
    retratos: window.probe.interfaz?.retratos ?? null,
  }));
  console.log(`    panel abierto   ${entrada.cual}`);
  console.log(`    título          ${JSON.stringify(entrada.panel?.titulo)}`);
  console.log(`    botones         ${entrada.botones.map((b) => `${JSON.stringify(b.t)}@${b.x}`).join(" ")}`);
  control("al abrir el juego SALE SOLA la pantalla de personajes",
    entrada.cual === "newchar", `${entrada.cual}`);
  control("y es el panel de VGUI, no la pantalla vieja de `interfaz`",
    entrada.vieja === false, entrada.vieja ? "sigue el velo mx-velo" : "sin mx-velo");
  control("con sus TRES ranuras, que es lo que tiene el original",
    entrada.botones.filter((b) => b.t === "Create").length === 3,
    `${entrada.botones.filter((b) => b.t === "Create").length} ranuras vacías`);

  // EL FALLO DEL ESPACIADOR, medido en pantalla. `XRES(16) * XRES(1)` a 1200 px
  // da 30*2 = 60 donde tocaban 30, o sea el doble de hueco entre personajes.
  const xs = entrada.botones.filter((b) => b.t === "Create").map((b) => b.x).sort((a, b) => a - b);
  const hueco = xs.length === 3 ? xs[1] - xs[0] : 0;
  const anchoRanura = Math.round(110 * (ANCHO / 640));
  const espSano = Math.round(16 * (ANCHO / 640));
  const espRoto = Math.round(16 * (ANCHO / 640)) * Math.round(1 * (ANCHO / 640));
  console.log(`    hueco medido    ${hueco - anchoRanura} px · sano ${espSano} · roto ${espRoto}`);
  control("EL FALLO PORTADO: el hueco entre personajes es el doble del que tocaba",
    Math.abs((hueco - anchoRanura) - espRoto) <= 3,
    `${hueco - anchoRanura} px, esperado ${espRoto} (el bueno sería ${espSano})`);

  // ── 2. LOS PERSONAJES SON MODELOS ───────────────────────────────────────
  // ESTE CONTROL ESTUVO VERDE MIDIENDO NADA, y tapó el fallo entero.
  //
  // Contaba `c.width > 0 && c.height > 0` sobre los lienzos, y **un `<canvas>`
  // recién creado mide 300x150** por definición del elemento: el control estaba
  // en verde con los tres retratos sin montar, que es exactamente lo que pasaba
  // —el registro monta los paneles escondidos, la caja medía 0x0,
  // `Retratos.montar()` se rendía en silencio y nadie lo reintentaba. Ver
  // `src/vgui/personaje.js:_montarRetratos`.
  //
  // Ahora se mira lo que no se puede fingir: cuántos retratos están VIVOS —o
  // sea, animándose— y que el lienzo tenga la resolución de su caja y no la de
  // fábrica.
  const conRetrato = await pag.evaluate(() => ({
    lienzos: document.querySelectorAll(".vg-char-retrato").length,
    deFabrica: [...document.querySelectorAll(".vg-char-retrato")]
      .filter((c) => c.width === 300 && c.height === 150).length,
    conSuCaja: [...document.querySelectorAll(".vg-char-retrato")].filter((c) => {
      const r = c.parentElement?.getBoundingClientRect();
      return r?.width > 0 && Math.abs(c.width - Math.round(r.width * Math.min(2, devicePixelRatio || 1))) <= 2;
    }).length,
    vivos: window.probe.vgui.retratosVivos?.() ?? 0,
  }));
  console.log(`    retratos        ${conRetrato.vivos} vivos · ${conRetrato.conSuCaja} de ` +
    `${conRetrato.lienzos} lienzos con la resolución de su caja · ${conRetrato.deFabrica} sin tocar`);
  control("los personajes son MODELOS, no dibujos: tres retratos ANIMÁNDOSE",
    conRetrato.vivos >= 3, `${conRetrato.vivos} vivos`);
  control("y sus lienzos tienen la resolución de su caja, no la de fábrica",
    conRetrato.conSuCaja >= 3, `${conRetrato.conSuCaja} de ${conRetrato.lienzos}`);

  await pag.screenshot({ path: "build/gatecity/vistas/personaje30-elegir.png" });

  // ── 3. LAS TRES ETAPAS ──────────────────────────────────────────────────
  console.log(`\n  LAS TRES ETAPAS`);
  // Con el 1, que es `SlotInput(dígito − 1)` y la tecla de verdad.
  await pag.keyboard.press("Digit1");
  await new Promise((r) => setTimeout(r, 500));
  const quien = await pag.evaluate(() => ({
    etapa: window.probe.vgui.etapa(),
    titulo: window.probe.vgui.panel()?.titulo,
    campo: Boolean(document.querySelector(".vg-char-campo:not([hidden])")),
    botones: window.probe.vgui.botones().map((b) => b.texto),
  }));
  console.log(`    1 -> etapa ${quien.etapa}  ${JSON.stringify(quien.titulo)} · ${JSON.stringify(quien.botones)}`);
  control("el 1 abre la ranura vacía y pasa a la etapa de «quién eres»",
    quien.etapa === 1, `etapa ${quien.etapa}`);
  control("con el campo del nombre y los dos géneros",
    quien.campo && quien.botones.includes("Male") && quien.botones.includes("Female"),
    `campo=${quien.campo} · ${quien.botones.join(", ")}`);

  // EL CAMPO SE COME SUS TECLAS. Sin esto, escribir un nombre con un número
  // dentro dispara la ranura y sales de la etapa a mitad de escribir.
  await pag.click(".vg-char-campo");
  await pag.keyboard.type("Ana2");
  await new Promise((r) => setTimeout(r, 300));
  const tecleado = await pag.evaluate(() => ({
    etapa: window.probe.vgui.etapa(),
    valor: document.querySelector(".vg-char-campo")?.value,
  }));
  console.log(`    escrito «Ana2»  etapa ${tecleado.etapa} · campo ${JSON.stringify(tecleado.valor)}`);
  control("escribir un nombre CON UN NÚMERO no dispara la ranura",
    tecleado.etapa === 1 && tecleado.valor === "Ana2",
    `etapa ${tecleado.etapa}, campo ${JSON.stringify(tecleado.valor)}`);

  // Volver atrás y comprobar que se vuelve, que es lo que el «Back» hace.
  const atras = await pag.evaluate(() => {
    const b = [...document.querySelectorAll("button.vg-boton")]
      .find((n) => !n.hidden && n.textContent === "Back");
    b?.click();
    return Boolean(b);
  });
  await new Promise((r) => setTimeout(r, 400));
  const volvio = await pag.evaluate(() => window.probe.vgui.etapa());
  control("y el «Back» vuelve a la lista de personajes", atras && volvio === 0, `etapa ${volvio}`);

  // ── 4. LAS ARMAS ────────────────────────────────────────────────────────
  console.log(`\n  LAS ARMAS`);
  await pag.keyboard.press("Digit1");
  await new Promise((r) => setTimeout(r, 400));
  await pag.click(".vg-char-campo");
  await pag.evaluate(() => { const c = document.querySelector(".vg-char-campo"); c.value = ""; c.dispatchEvent(new Event("input")); });
  await pag.keyboard.type("Sonda");
  await pag.keyboard.press("Enter");
  await new Promise((r) => setTimeout(r, 600));
  const armas = await pag.evaluate(() => ({
    etapa: window.probe.vgui.etapa(),
    titulo: window.probe.vgui.panel()?.titulo,
    botones: window.probe.vgui.botones().map((b) => ({ t: b.texto, x: b.centro })),
    nombres: [...document.querySelectorAll(".vg-etiqueta")].map((n) => n.textContent).filter(Boolean),
    iconos: [...document.querySelectorAll(".vg-char-icono")].filter((n) => !n.hidden).length,
    todos: document.querySelectorAll(".vg-char-icono").length,
  }));
  console.log(`    Enter -> etapa ${armas.etapa}  ${JSON.stringify(armas.titulo)}`);
  console.log(`    iconos          ${armas.iconos} de ${armas.todos} armas`);
  control("el Enter del campo pasa a elegir arma", armas.etapa === 2, `etapa ${armas.etapa}`);
  control("hay siete armas, que son las de `reg.newchar.weaponlist`",
    armas.todos === 7, `${armas.todos}`);
  // SEIS de las siete. La séptima es la mano del rayo, que no declara
  // `sethudsprite` ninguno, y el panel de elegir personaje no lo comprueba
  // (`choosecharacter.cpp:617` contra `mscontrols.cpp:285`): sale con el cuadro
  // vacío en el juego de verdad también.
  //
  // La primera versión de este control decía DOS, y estaba mal: el extractor
  // leía la primera línea `sethudsprite` de cada script y los scripts declaran
  // las dos, `hand` y `trade`, en líneas seguidas. El control estaba en verde
  // sobre una cuenta equivocada.
  control("seis de las siete armas tienen icono, y la séptima no declara ninguno",
    armas.iconos === 6, `${armas.iconos} de ${armas.todos}`);

  await pag.screenshot({ path: "build/gatecity/vistas/personaje30-arma.png" });

  // ── 5. Y SE ENTRA AL JUEGO ──────────────────────────────────────────────
  console.log(`\n  ENTRAR`);
  await pag.keyboard.press("Digit1");
  await pag.waitForFunction(() => window.probe.vgui.abierto() === null, null, { timeout: 60000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 2500));
  const dentro = await pag.evaluate(() => ({
    panel: window.probe.vgui.abierto(),
    estado: window.probe.sesion.estado(),
    personaje: window.probe.sesion.personaje?.nombre ?? null,
    arma: window.probe.sesion.personaje?.manos?.derecha ?? null,
    retratos: window.probe.interfaz?.retratos ?? 0,
    hud: window.probe.hud.estado()?.visible ?? false,
  }));
  console.log(`    estado          ${dentro.estado} · ${JSON.stringify(dentro.personaje)} · ${JSON.stringify(dentro.arma)}`);
  control("elegir un arma crea el personaje y ENTRA al juego",
    dentro.estado === "jugando" && dentro.personaje === "Sonda",
    `${dentro.estado} / ${dentro.personaje}`);
  control("el panel se cierra al entrar", dentro.panel === null, `${dentro.panel}`);
  control("y el HUD del juego aparece detrás", dentro.hud === true, `${dentro.hud}`);
  // Y los retratos se sueltan: si no, tres esqueletos siguen animándose para
  // unos `canvas` que ya no están, y la pantalla va cada vez más despacio.
  const vivos = await pag.evaluate(() => window.probe.vgui.retratosVivos());
  control("los retratos se sueltan al entrar: no se quedan animando en vacío",
    vivos === 0, `${vivos} vivos`);

  // ── 6. Y EL PERSONAJE ESTÁ GUARDADO ─────────────────────────────────────
  const guardado = await pag.evaluate(() => window.probe.sesion.listar());
  control("el personaje queda guardado y sale en la lista",
    guardado.length === 1 && guardado[0].nombre === "Sonda",
    `${guardado.length}: ${guardado.map((c) => c.nombre).join(", ")}`);

  await pag.screenshot({ path: "build/gatecity/vistas/personaje30-dentro.png" });
  console.log(`    capturas        build/gatecity/vistas/personaje30-*.png`);
} catch (e) {
  errores.push(`la sonda se cayó: ${String(e).slice(0, 300)}`);
}

console.log("\n  CONTROLES");
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(66)} ${c.detalle}`);
const mal = controles.filter((c) => !c.bien);
console.log(`\n  ${controles.length - mal.length} de ${controles.length} en verde`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}\n`);

await nav?.close();
matar(dev);
process.exit(mal.length || errores.length || !controles.length ? 1 : 0);
