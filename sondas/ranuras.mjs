// LAS RANURAS RÁPIDAS, EL MENÚ Y EL CENSO DE LAS SIETE ARMAS.
//
//   npm run sonda:ranuras
//
// `npm test` comprueba la REGLA —cuándo se apaga la etiqueta, qué comando sale,
// cuándo graba una ranura—. Nada de eso dice que pulsar el 1 haga algo.
//
// Las formas de que esto parezca funcionar y esté mal:
//
//    1. el 1 no llega                     -> la acción no está en el mapa de teclas
//    2. llega y no pinta                  -> falta `hudMs.ranura(...)` después de ciclar
//    3. pinta y no se va                  -> el reloj de la espera no está en el bucle
//    4. se va sola en dos segundos        -> se puso 2 en vez de 2,5
//    5. el clic equipa Y ADEMÁS ataca     -> falta comerse el botón
//    6. equipa pero el modelo no cambia   -> `empunar()` no se llamó
//    7. equipa y el arma vieja se pierde  -> falta devolverla a la mochila
//    8. la F1 graba en cada repetición    -> falta mirar `e.repeat`
//    9. graba al pulsar y no al aguantar  -> el cronómetro no corre
//   10. el menú sale sin fondo            -> falta `npm run menu` y nadie avisa
//   11. el menú sale y el juego sigue     -> las teclas no se bloquean detrás
//   12. las opciones que no sirven callan -> hay que decir POR QUÉ
//   13. y el censo: siete armas, y una no se puede ni empuñar.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { esNuestro, liberarPuerto } from "./mismo.mjs";
import { mkdirSync } from "node:fs";

const PORT = 5208;
// Se mata a quien estuviera en el puerto ANTES de arrancar el nuestro.
// `--strictPort` hace que el nuestro falle si esta ocupado, y con
// `stdio: "ignore"` ese fallo no se ve: la sonda acaba midiendo el programa
// de otro. Ver `sondas/mismo.mjs`.
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (habia ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { shell: true, stdio: "ignore" });
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
await new Promise((r) => setTimeout(r, 6000));
const nav = await chromium.launch();
const ANCHO = 1200, ALTO = 800;
const pag = await nav.newPage({ viewport: { width: ANCHO, height: ALTO } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
await pag.goto(`http://localhost:${PORT}/?map=gatecity`, { waitUntil: "load" });
await esNuestro(pag, PORT);
mkdirSync("build/gatecity/vistas", { recursive: true });

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });

await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
await pag.evaluate(() => window.probe.vivo.congelarPaseo(true));
// Sin esto no hay nada que ciclar: en Gate City no hay tiendas y un personaje
// nuevo lleva UNA arma. Es la tecla N, y está declarada como andamio.
await pag.evaluate(() => window.probe.ranuras.armarse());
await pag.evaluate(() => window.probe.hud.avanzar(40));   // la consola limpia

// ── 1. EL CENSO DE LAS SIETE ARMAS DE PARTIDA ──────────────────────────────
//
// Esto lo debía desde el 21 y ya van cuatro experimentos. `reg.newchar` ofrece
// siete armas y el juego se ha estado probando con una. El control no sabe de
// ranuras: empuña cada una y mira que salga algo con lo que pegar.
const censo = await pag.evaluate(async () => {
  const lista = window.probe.ranuras.armasDePartida();
  const filas = [];
  for (const id of lista) filas.push({ id, ...(await window.probe.ranuras.empunar(id)) });
  return { lista, filas };
});
console.log(`\n  EL CENSO — las ${censo.lista.length} armas de reg.newchar.weaponlist`);
for (const f of censo.filas) {
  console.log(`    ${f.id.padEnd(20)} ${(f.nombre ?? "?").padEnd(22)} ` +
    `${f.ataques} ataque(s)${f.esDeTiro ? ", de tiro" : ""}${f.conModelo ? "" : "  SIN MODELO"}`);
}
control("las siete armas de partida están en el catálogo",
  censo.lista.length === 7, `${censo.lista.length}`);
control("las siete se empuñan", censo.filas.every((f) => f.arma === f.id),
  censo.filas.filter((f) => f.arma !== f.id).map((f) => f.id).join(", ") || "todas");
// Y AQUÍ ESTÁ LO QUE EL CENSO VINO A BUSCAR.
//
// De las siete «armas» de partida, **una no es un arma**:
// `magic_hand_lightning_weak` es `tipo: hechizo`, una mano que lanza un rayo.
// Nuestro lector le saca CERO ataques, y no porque el script no los tenga: los
// declara `magic_hand_base.script:106` dentro de un `if ( MELEE_RANGE isnot
// 'MELEE_RANGE' )` —el modismo de «¿está definida esta constante?»— y el lector
// no evalúa condicionales. O sea que el rayo hace 25 de daño a 500 unidades y
// para nosotros no existe. Queda DECLARADO y no se pinta de verde.
const HECHIZO = "magic_hand_lightning_weak";
const armasDeVerdad = censo.filas.filter((f) => f.id !== HECHIZO);
control("las seis armas de verdad tienen al menos un ataque",
  armasDeVerdad.every((f) => f.ataques > 0),
  armasDeVerdad.map((f) => `${f.ataques}`).join(", "));
control(`y la séptima es un HECHIZO, no un arma: ${HECHIZO}`,
  censo.filas.find((f) => f.id === HECHIZO)?.ataques === 0,
  "nuestro lector no ve su ataque — está tras un `if isnot` (magic_hand_base:106)");
control("las siete traen su modelo de mano",
  censo.filas.every((f) => f.conModelo),
  censo.filas.filter((f) => !f.conModelo).map((f) => f.id).join(", ") || "todas");
// Y que el botón haga algo: el golpe de verdad, arma por arma.
const golpes = await pag.evaluate(async () => {
  const out = [];
  for (const id of window.probe.ranuras.armasDePartida()) {
    await window.probe.ranuras.empunar(id);
    // `probe.golpe.atacar` es la MISMA máquina que corre el bucle: aguanta el
    // botón tres segundos con el paso fijo y cuenta los mandobles.
    out.push({ id, ...window.probe.golpe.atacar(3) });
  }
  return out;
});
console.log(`\n    aguantar el botón tres segundos con cada una:`);
for (const g of golpes) {
  console.log(`      ${g.id.padEnd(20)} ${g.empiezos} empieza / ${g.finales} acaba / ` +
    `${g.golpes} golpe(s), fase '${g.fase}'`);
}
control("con las seis armas, aguantar el botón arranca un ataque",
  golpes.filter((g) => g.id !== HECHIZO).every((g) => g.empiezos > 0),
  golpes.filter((g) => g.id !== HECHIZO && !(g.empiezos > 0)).map((g) => g.id).join(", ") || "las seis");

// Se vuelve a la espada para el resto de la sonda.
await pag.evaluate(() => window.probe.ranuras.empunar("swords_rsword"));

// ── 2. CICLAR ARMAS: LA ETIQUETA SALE, CAMBIA Y SE VA SOLA ─────────────────
const ciclo = await pag.evaluate(() => {
  const pasos = [];
  for (let i = 0; i < 4; i++) {
    const e = window.probe.ranuras.ciclar("weapon");
    pasos.push({ texto: e.enPantalla?.texto ?? null, visible: Boolean(e.enPantalla?.visible), color: e.enPantalla?.color ?? null });
  }
  return pasos;
});
console.log(`\n  CICLAR ARMAS`);
for (const p of ciclo) console.log(`    ${p.visible ? "•" : " "} '${p.texto}'  ${p.color}`);
control("la primera pulsación enseña un arma en la pantalla",
  ciclo[0].visible && Boolean(ciclo[0].texto), `'${ciclo[0].texto}'`);
control("y la segunda enseña OTRA", ciclo[1].texto !== ciclo[0].texto,
  `'${ciclo[0].texto}' → '${ciclo[1].texto}'`);
control("la etiqueta es blanca, que es el color de los objetos",
  /255,\s*255,\s*255/.test(ciclo[0].color ?? ""), ciclo[0].color ?? "");
{
  // Dónde cae: `XRES(170)` a 1200 de ancho son 319 px, o sea a la derecha del
  // emblema. Si sale en el 0 está encima de la barra de vida.
  const sitio = await pag.evaluate(() => {
    const n = document.querySelector(".ms-ranura");
    const r = n.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), h: Math.round(r.height), alto: innerHeight };
  });
  console.log(`    la tira está en x=${sitio.x}, y=${sitio.y} de ${sitio.alto}, alto ${sitio.h}`);
  control("la etiqueta está a la derecha del emblema, no encima de las barras",
    sitio.x > 300, `x=${sitio.x} (XRES(170) de 1200)`);
  control("y pegada al borde de abajo", sitio.y + sitio.h >= sitio.alto - 1,
    `${sitio.y}+${sitio.h} de ${sitio.alto}`);
}

// LA ESPERA TIRA LO QUE HAYA, no lo elige.
const espera = await pag.evaluate(() => {
  window.probe.ranuras.ciclar("weapon");
  const antes = window.probe.ranuras.estado();
  window.probe.hud.avanzar(2.2);
  const medio = window.probe.ranuras.estado();
  window.probe.hud.avanzar(0.6);
  const luego = window.probe.ranuras.estado();
  return {
    arma: antes.enMano,
    puesta: Boolean(antes.enPantalla?.visible),
    a22: Boolean(medio.enPantalla?.visible),
    a28: Boolean(luego.enPantalla?.visible),
    armaLuego: luego.enMano,
  };
});
console.log(`\n  LA ESPERA: puesta ${espera.puesta} · a 2,2 s ${espera.a22} · a 2,8 s ${espera.a28}`);
control("a los 2,2 s la etiqueta sigue puesta", espera.a22 === true, "ms_quickslot_timeout 2.5");
control("a los 2,8 s ya no está", espera.a28 === false, "");
control("y el arma NO ha cambiado: la espera cancela, no elige",
  espera.armaLuego === espera.arma, `${espera.arma} → ${espera.armaLuego}`);

// ── 3. EL BOTÓN DE ATACAR ACEPTA, Y SE LO COME ─────────────────────────────
const acepta = await pag.evaluate(() => {
  const antes = window.probe.ranuras.estado().enMano;
  window.probe.ranuras.ciclar("weapon");
  const ofrecida = window.probe.ranuras.estado().enPantalla?.texto ?? null;
  const comido = window.probe.ranuras.confirmar();
  window.probe.hud.avanzar(0.3);
  const luego = window.probe.ranuras.estado();
  return {
    antes, ofrecida, comido, ahora: luego.enMano,
    etiqueta: Boolean(luego.enPantalla?.visible),
    segundo: window.probe.ranuras.confirmar(),
  };
});
console.log(`\n  ACEPTAR: '${acepta.ofrecida}' → en la mano '${acepta.ahora}' (antes '${acepta.antes}')`);
control("aceptar cambia el arma de la mano", acepta.ahora !== acepta.antes,
  `${acepta.antes} → ${acepta.ahora}`);
control("y devuelve `true` para que el golpe se lo coma", acepta.comido === true,
  "clplayer.cpp:558 — si no, cambiar de arma ataca");
control("la etiqueta se apaga al aceptar", acepta.etiqueta === false, "");
control("y con la etiqueta apagada el botón YA NO se come nada",
  acepta.segundo === false, "el segundo clic sí tiene que pegar");
{
  // El oráculo de que el arma vieja no se ha perdido no es mirar la mochila:
  // es que el ciclador vuelva a ofrecerla. Eso comprueba las dos cosas a la
  // vez —que está guardada y que se puede recuperar— y es lo que el jugador
  // nota si falla.
  const vuelve = await pag.evaluate((vieja) => {
    for (let i = 0; i < 8; i++) {
      const e = window.probe.ranuras.ciclar("weapon");
      if (!e.enPantalla?.visible) break;
    }
    window.probe.hud.avanzar(3);
    const vistos = [];
    for (let i = 0; i < 8; i++) {
      const e = window.probe.ranuras.ciclar("weapon");
      if (!e.enPantalla?.visible) break;
      vistos.push(e.etiqueta?.id ?? null);
    }
    window.probe.hud.avanzar(3);
    return { vistos, vieja };
  }, acepta.antes);
  console.log(`    el arma vieja vuelve a ofrecerse: ${vuelve.vistos.includes(vuelve.vieja)}`);
  control("el arma que llevabas vuelve a la mochila y se puede volver a elegir",
    vuelve.vistos.includes(vuelve.vieja), `${vuelve.vieja} en [${vuelve.vistos.join(", ")}]`);
}

// ── 4. LA MUNICIÓN, que es el ciclo con las dos infinitas delante ──────────
const muni = await pag.evaluate(async () => {
  await window.probe.ranuras.empunar("bows_shortbow");
  window.probe.hud.avanzar(3);
  const a = window.probe.ranuras.ciclar("arrow");
  return { texto: a.enPantalla?.texto ?? null, color: a.enPantalla?.color ?? null };
});
console.log(`\n  MUNICIÓN con un arco: '${muni.texto}'  ${muni.color}`);
control("con un arco la primera munición es la de balde y lo dice",
  (muni.texto ?? "").includes("Infinite"), `'${muni.texto}'`);
control("y va en verde, que es el color de la munición",
  /0,\s*255,\s*128/.test(muni.color ?? ""), muni.color ?? "");

// ── 5. LOS HECHIZOS: no hay ninguno, y eso se nota sin romperse ────────────
const hech = await pag.evaluate(() => {
  const e = window.probe.ranuras.ciclar("spell");
  return { visible: Boolean(e.enPantalla?.visible) };
});
control("sin hechizos aprendidos, el 2 no enseña nada y no se rompe",
  hech.visible === false, "m_SpellList vacía");

// ── 6. LAS DOCE RANURAS ────────────────────────────────────────────────────
await pag.evaluate(() => { window.probe.ranuras.ciclar("weapon"); window.probe.hud.avanzar(3); });
const graba = await pag.evaluate(() => {
  const arma = window.probe.ranuras.estado().enMano;
  window.probe.ranuras.pulsar(1);
  window.probe.hud.avanzar(1.5);
  const aMedias = window.probe.ranuras.estado().guardadas[0];
  window.probe.hud.avanzar(1.0);
  const grabada = window.probe.ranuras.estado().guardadas[0];
  return { arma, aMedias, grabada };
});
console.log(`\n  RANURAS: a 1,5 s '${graba.aMedias}' · a 2,5 s '${graba.grabada}'`);
control("aguantar la F1 un segundo y medio NO graba", graba.aMedias === null, `${graba.aMedias}`);
control("y aguantarla dos y medio sí", graba.grabada !== null, `${graba.grabada}`);

const usa = await pag.evaluate(async () => {
  // Se cambia de arma a mano y se pulsa la ranura para volver a la de antes.
  const guardada = window.probe.ranuras.estado().guardadas[0];
  await window.probe.ranuras.empunar("axes_handaxe");
  const antes = window.probe.ranuras.estado().enMano;
  window.probe.ranuras.pulsar(1);
  window.probe.hud.avanzar(0.3);
  const r = window.probe.ranuras.soltar(1);
  window.probe.hud.avanzar(0.3);
  return { guardada, antes, ahora: window.probe.ranuras.estado().enMano, orden: r.orden };
});
console.log(`    pulsarla y soltarla: '${usa.antes}' → '${usa.ahora}' (guardaba '${usa.guardada}')`);
control("pulsar y soltar la F1 antes de dos segundos equipa lo que guardaba",
  usa.ahora !== usa.antes && Boolean(usa.orden), `${usa.antes} → ${usa.ahora}`);

const vacia = await pag.evaluate(() => {
  window.probe.ranuras.pulsar(7);
  window.probe.hud.avanzar(0.3);
  const r = window.probe.ranuras.soltar(7);
  return { orden: r.orden };
});
control("una ranura vacía no hace nada y no dice nada", vacia.orden === null, "");

const corre = await pag.evaluate(() => {
  const a = window.probe.ranuras.desplazar(12);
  const b = window.probe.ranuras.desplazar(24);
  const c = window.probe.ranuras.desplazar(0);
  return { a: a.desplazamiento, b: b.desplazamiento, c: c.desplazamiento, n: a.guardadas.length };
});
control("hay 36 ranuras y dos desplazamientos para llegar a ellas",
  corre.n === 36 && corre.a === 12 && corre.b === 24 && corre.c === 0,
  `${corre.n} ranuras, ${corre.a}/${corre.b}/${corre.c}`);

// ── 7. EL MENÚ PRINCIPAL ───────────────────────────────────────────────────
const menu = await pag.evaluate(() => {
  const abierto = window.probe.menu.abrir(true);
  const n = document.querySelector(".ms-menu");
  const fondo = getComputedStyle(n).backgroundImage;
  return { ...abierto, fondo, visible: !n.hidden, rect: n.getBoundingClientRect().toJSON() };
});
console.log(`\n  EL MENÚ — ${menu.opciones.length} opciones y ${menu.separadores} separadores`);
for (const o of menu.opciones) console.log(`    ${o.sirve ? "•" : "·"} ${o.texto.padEnd(24)} ${o.que}`);
control("el menú se abre y se ve", menu.abierto === true && menu.visible === true, "");
control("y tapa la pantalla entera",
  menu.rect.width >= ANCHO - 1 && menu.rect.height >= ALTO - 1,
  `${Math.round(menu.rect.width)}×${Math.round(menu.rect.height)}`);
control("trae el fondo de la torre horneado",
  menu.fondo && menu.fondo.includes("fondo.png"),
  menu.conFondo ? "menu/fondo.png" : "SIN FONDO — falta `npm run menu`");
control("con partida detrás salen «Resume game» y «Disconnect»",
  menu.opciones.some((o) => o.que === "cerrar") && menu.opciones.some((o) => o.que === "desconectar"),
  menu.opciones.map((o) => o.texto).join(" / "));
// Son DOS y no tres, y es correcto: `gamemenu.res` trae tres entradas en
// blanco, pero la del número 7 lleva `notmulti` y Master Sword es sólo
// multijugador, así que ese hueco no se ve nunca. El separador es la única
// entrada del archivo que esa bandera llega a esconder.
control("los separadores del menú están, y son dos de los tres del archivo",
  menu.separadores === 2, `${menu.separadores} — el tercero lleva 'notmulti'`);
control("«Name Character» y «Options» van a sitios distintos",
  menu.opciones.some((o) => o.que === "nombrar") && menu.opciones.some((o) => o.que === "opciones"),
  "el archivo del juego las manda a las dos a OpenOptionsDialog");

const sinPartida = await pag.evaluate(() => {
  window.probe.menu.cerrar();
  return window.probe.menu.abrir(false);
});
control("sin partida, «Resume game» y «Disconnect» no salen",
  !sinPartida.opciones.some((o) => o.que === "cerrar" || o.que === "desconectar"),
  sinPartida.opciones.map((o) => o.texto).join(" / "));

const apagadas = await pag.evaluate(() => {
  window.probe.menu.cerrar();
  window.probe.menu.abrir(true);
  // Bajar hasta «Visit a Kingdom», que es la primera que no sirve.
  let e = window.probe.menu.estado();
  for (let i = 0; i < 12 && e.elegida !== "Visit a Kingdom"; i++) e = window.probe.menu.mover(1);
  const r = window.probe.menu.elegir();
  return { elegida: e.elegida, r, pie: window.probe.menu.estado().pie };
});
console.log(`    al elegir una que no sirve: "${apagadas.pie}"`);
control("las flechas se mueven saltando los separadores",
  apagadas.elegida === "Visit a Kingdom", `${apagadas.elegida}`);
control("y una opción que no sirve DICE por qué, no calla",
  Boolean(apagadas.pie) && apagadas.pie.includes("no servers yet"), `"${apagadas.pie}"`);

await pag.screenshot({ path: "build/gatecity/vistas/menu.png" });

const cierra = await pag.evaluate(() => {
  window.probe.menu.cerrar();
  window.probe.hud.avanzar(0.2);
  return { abierto: window.probe.menu.estado().abierto, hud: window.probe.hud.estado().visible };
});
control("se cierra y el juego vuelve", cierra.abierto === false && cierra.hud === true, "");

// ── 8. UNA CAPTURA CON LA ETIQUETA PUESTA ──────────────────────────────────
await pag.evaluate(() => {
  window.probe.hud.avanzar(40);
  window.probe.ranuras.ciclar("weapon");
  window.probe.hud.suceso("bueno", "Ranura 1: Rusty Sword");
  window.probe.hud.avanzar(0.2);
});
await pag.screenshot({
  path: "build/gatecity/vistas/ranuras.png",
  clip: { x: 0, y: ALTO - 200, width: ANCHO, height: 200 },
});

// ── 9. NADA DE ESTO ROMPE EL MUNDO ─────────────────────────────────────────
const final = await pag.evaluate(() => {
  window.probe.hud.avanzar(2);
  return { golpe: window.probe.golpe.estado, hud: window.probe.hud.estado() };
});
control("el arma sigue en la mano después de todo esto",
  final.golpe.triangulos > 0, `${final.golpe.triangulos} triángulos`);
control("y el HUD sigue en pie", final.hud.visible === true, "");

// ── el veredicto ───────────────────────────────────────────────────────────
console.log("\n  CONTROLES");
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(64)} ${c.detalle}`);
const mal = controles.filter((c) => !c.bien);
console.log(`\n  ${controles.length - mal.length} de ${controles.length} en verde`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);
console.log(`  capturas:       build/gatecity/vistas/menu.png y ranuras.png\n`);

await nav.close(); matar(dev);
process.exit(mal.length || errores.length ? 1 : 0);
