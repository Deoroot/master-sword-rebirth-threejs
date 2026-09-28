// EL HUD DE MASTER SWORD, medido en la pantalla de verdad.
//
//   npm run sonda:hud
//
// `npm test` comprueba la REGLA: qué cuadro toca, cuándo se encoge una línea,
// de qué color va la cifra. Nada de eso dice que se VEA. Un HUD es el sistema
// donde más fácil es tener la regla perfecta y la pantalla vacía, porque el
// único testigo es un píxel.
//
// Las formas de que esto parezca funcionar y esté mal:
//
//    1. las barras no se montan               -> falta `npm run hud` y nadie avisa
//    2. se montan y no cargan la imagen       -> la ruta del `.png` es relativa a otra cosa
//    3. cargan y enseñan siempre el cuadro 0  -> el `background-size` no cuenta los 43
//    4. enseñan siempre el último             -> se olvidó el signo del `background-position`
//    5. la barra no se mueve al perder vida   -> el HUD no está en el bucle
//    6. salta de golpe                        -> se pintó el valor y no el que persigue
//    7. las cuatro enseñan lo mismo           -> se leyó el mismo máximo para todas
//    8. están fuera de la pantalla            -> el BAR_SCALE del motor a esta resolución
//    9. la consola no sale                    -> `say()` seguía atrapando los sucesos
//   10. sale y no se va nunca                 -> falta el decaimiento en el bucle
//   11. sale y se va enseguida               -> el reloj del decaimiento no es el del juego
//   12. todas las líneas del mismo color      -> se perdió el tipo por el camino
//   13. el HUD tapa la hoja de personaje      -> falta `ShowHUD()`
//   14. y la de siempre: la sonda pinta a mano y el bucle no llama a nada.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { esNuestro, liberarPuerto } from "./mismo.mjs";
import { mkdirSync } from "node:fs";

const PORT = 5207;
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
// El mundo quieto: aquí se mide lo que pone la pantalla y un goblin mordiendo
// por detrás cambia la vida a mitad de medida.
await pag.evaluate(() => window.probe.vivo.congelarPaseo(true));
await pag.evaluate(() => window.probe.hud.avanzar(3));

// ── 1. ESTÁ MONTADO Y LAS CUATRO BARRAS ESTÁN EN LA PANTALLA ───────────────
//
// Se mide con `getBoundingClientRect` del navegador, no con lo que dice el
// módulo: lo que dice el módulo es la cuenta, y lo que importa es dónde acabó
// el `div`.
const sitio = await pag.evaluate(() => {
  const out = {};
  for (const n of document.querySelectorAll(".ms-barra")) {
    const r = n.getBoundingClientRect();
    out[[...n.classList].join(".")] = null;
  }
  const claves = ["vida", "peso", "mana", "aguante"];
  const cajas = [...document.querySelectorAll(".ms-barra")].map((n) => {
    const r = n.getBoundingClientRect();
    return {
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      fondo: getComputedStyle(n).backgroundImage,
      pos: getComputedStyle(n).backgroundPosition,
      cifra: n.firstChild?.textContent ?? null,
    };
  });
  const em = document.querySelector(".ms-emblema");
  return {
    hay: Boolean(window.probe.hud.hay()),
    n: cajas.length, cajas, claves,
    emblema: em ? { ...em.getBoundingClientRect().toJSON(), cargada: em.complete && em.naturalWidth > 0 } : null,
    pantalla: { w: innerWidth, h: innerHeight },
    estado: window.probe.hud.estado(),
  };
});

console.log(`\n  HUD montado: ${sitio.hay ? "sí" : "NO"} — ${sitio.n} barras en una pantalla de ` +
  `${sitio.pantalla.w}×${sitio.pantalla.h}`);
for (let i = 0; i < sitio.cajas.length; i++) {
  const c = sitio.cajas[i];
  console.log(`    ${sitio.claves[i].padEnd(8)} ${String(c.x).padStart(4)},${String(c.y).padStart(4)} ` +
    `de ${c.w}×${c.h}  fondo ${c.pos}  cifra '${c.cifra}'`);
}
control("el HUD está montado", sitio.hay === true, "");
control("y tiene las cuatro barras", sitio.n === 4, `${sitio.n}`);
control("las cuatro tienen su imagen puesta",
  sitio.cajas.every((c) => c.fondo && c.fondo !== "none"),
  sitio.cajas.filter((c) => !c.fondo || c.fondo === "none").length + " sin imagen");
// Que estén DENTRO. A 1200×800 el BAR_SCALE del motor sale 0,487, o sea barras
// de 156×19: pequeñas, pero dentro. Lo que este control caza es lo contrario —
// una resolución en la que la cuenta del motor las saque de la pantalla.
control("las cuatro caben enteras dentro de la ventana",
  sitio.cajas.every((c) => c.x >= 0 && c.y >= 0 && c.x + c.w <= sitio.pantalla.w && c.y + c.h <= sitio.pantalla.h),
  sitio.cajas.map((c) => `${c.x}+${c.w}`).join(" "));
control("y ninguna tiene tamaño cero", sitio.cajas.every((c) => c.w > 20 && c.h > 4),
  sitio.cajas.map((c) => `${c.w}×${c.h}`).join(" "));
control("el emblema está cargado y es cuadrado",
  Boolean(sitio.emblema?.cargada) && Math.abs(sitio.emblema.width - sitio.emblema.height) < 2,
  sitio.emblema ? `${Math.round(sitio.emblema.width)}×${Math.round(sitio.emblema.height)}` : "no hay");

// La pareja que sorprende: vida y PESO a la izquierda, maná y aguante a la
// derecha. Se mide en la pantalla, no en la cuenta.
{
  const [vida, peso, mana, aguante] = sitio.cajas;
  control("vida y peso comparten columna, maná y aguante la otra",
    vida.x === peso.x && mana.x === aguante.x && mana.x > vida.x,
    `${vida.x} / ${mana.x}`);
  control("y el emblema está justo en la juntura",
    sitio.emblema && Math.abs(sitio.emblema.x - (vida.x + vida.w)) <= 2,
    `emblema en ${Math.round(sitio.emblema?.x ?? -1)}, barra acaba en ${vida.x + vida.w}`);
}

// ── 2. LA BARRA SIGUE A LA VIDA, Y NO DE GOLPE ─────────────────────────────
//
// El control de verdad de este experimento. Se le quita vida al personaje por
// donde se la quita el juego (`sesion.danar`) y se mira qué cuadro enseña el
// `div` antes, a mitad y al final.
const vitales = await pag.evaluate(() => window.probe.sesion.vitales());
console.log(`\n  el personaje: ${vitales.vida}/${vitales.vidaMax} de vida, ` +
  `${vitales.mana}/${vitales.manaMax} de maná`);

const persecucion = await pag.evaluate((max) => {
  const cuadro = () => window.probe.hud.estado().barras.vida.cuadro;
  const lleno = cuadro();
  window.probe.sesion.danar(Math.round(max * 0.8), { porQue: "la sonda", tipo: "trampa" });
  const justoDespues = cuadro();
  window.probe.hud.avanzar(0.1);
  const aUnaDecima = cuadro();
  window.probe.hud.avanzar(3);
  const alFinal = cuadro();
  return {
    lleno, justoDespues, aUnaDecima, alFinal,
    cifra: window.probe.hud.estado().barras.vida.cifra,
    color: window.probe.hud.estado().barras.vida.color,
    vida: window.probe.sesion.vitales().vida,
  };
}, vitales.vidaMax);

console.log(`  cuadros de la barra de vida: lleno ${persecucion.lleno} → justo tras el golpe ` +
  `${persecucion.justoDespues} → a una décima ${persecucion.aUnaDecima} → al final ${persecucion.alFinal} ` +
  `(cifra '${persecucion.cifra}', ${persecucion.color})`);
control("la barra arranca llena", persecucion.lleno >= 40, `cuadro ${persecucion.lleno}`);
control("y baja al perder vida", persecucion.alFinal < persecucion.lleno,
  `${persecucion.lleno} → ${persecucion.alFinal}`);
// La persecución: el motor mueve la barra a 24 puntos por segundo para un
// personaje de 25 de vida, o sea que a la décima de segundo NO ha llegado. Si
// llega, es que se está pintando el valor y no el que persigue — y entonces el
// vaso da un salto seco que no es el del juego.
control("NO salta de golpe: a la décima de segundo todavía va por el camino",
  persecucion.aUnaDecima > persecucion.alFinal && persecucion.aUnaDecima < persecucion.lleno,
  `${persecucion.lleno} → ${persecucion.aUnaDecima} → ${persecucion.alFinal}`);
control("la cifra dice lo que queda", (persecucion.cifra ?? "").startsWith(`${Math.trunc(persecucion.vida)}/`),
  `'${persecucion.cifra}' con ${persecucion.vida} de vida`);
control("y por debajo de un cuarto se pone ROJA",
  persecucion.color.replace(/\s/g, "") === "rgb(250,0,0)", persecucion.color);

// EL PESO NO SE PONE ROJO aunque esté muy por debajo del cuarto: `m_Type != 2`.
{
  const peso = await pag.evaluate(() => window.probe.hud.estado().barras.peso);
  console.log(`  el peso: cifra '${peso.cifra}', ${peso.color}`);
  control("el peso NO se pone rojo aunque sea bajo: en el peso poco es bueno",
    peso.color.replace(/\s/g, "") === "rgb(255,255,255)", peso.color);
}

// Y las cuatro barras no enseñan el mismo cuadro, que es lo que pasaría si se
// leyera el mismo máximo para todas.
{
  const b = await pag.evaluate(() => window.probe.hud.estado().barras);
  const cuadros = ["vida", "peso", "mana", "aguante"].map((k) => b[k].cuadro);
  console.log(`  cuadros de las cuatro: ${cuadros.join(", ")}`);
  control("las cuatro barras no enseñan todas lo mismo", new Set(cuadros).size > 1, cuadros.join(", "));
}

// ── 3. LA CONSOLA DE SUCESOS ───────────────────────────────────────────────
//
// Por la MISMA puerta que el juego: `probe.hud.suceso` llama a la misma función
// `suceso()` que llaman el golpe, la flecha y el escudo.
const uno = await pag.evaluate(() => {
  // Con la consola vacía: al aparecer, el juego ya ha dicho dónde has caído, y
  // medir «un suceso pone una línea» encima de eso mide otra cosa.
  window.probe.hud.avanzar(40);
  window.probe.hud.suceso("ataque", "6.3 de daño a un Goblin — le quedan 44 de 50");
  return window.probe.hud.estado().consola;
});
console.log(`\n  un suceso: ${uno.visibles} línea visible, ${uno.total} en el historial`);
// Una visible, y el historial de antes SIGUE AHÍ: decaer es dejar de verse, no
// borrarse. Es lo que hace que RePág sirva para algo, y es la diferencia de
// fondo con la línea de estado, que al escribir encima perdía lo anterior.
control("un suceso pone una línea visible", uno.visibles === 1, `${uno.visibles} visibles`);
control("y lo que ya había decaído sigue en el historial",
  uno.total > 1, `${uno.total} en memoria`);

// El color en el DOM, que es donde importa. `HUDEVENT_ATTACK` es (178,119,0) y
// no el naranja de (255,170,0): está escrito `255 * 0.7`.
const pintado = await pag.evaluate(() => {
  const n = document.querySelector(".ms-consola > div");
  const r = n?.getBoundingClientRect();
  return {
    color: n ? getComputedStyle(n).color : null,
    texto: n?.textContent ?? null,
    fondo: getComputedStyle(document.querySelector(".ms-consola")).backgroundColor,
    caja: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null,
    pantalla: { w: innerWidth, h: innerHeight },
  };
});
console.log(`  pintada en ${pintado.caja?.x},${pintado.caja?.y} de ${pintado.caja?.w}×${pintado.caja?.h}, ` +
  `${pintado.color} sobre ${pintado.fondo}`);
control("con el ámbar oscuro del motor (178,119,0), no el naranja vivo",
  pintado.color?.replace(/\s/g, "") === "rgb(178,119,0)", pintado.color);
control("sobre el fondo casi negro con un punto de azul",
  /rgba?\(0,\s*0,\s*20/.test(pintado.fondo ?? ""), pintado.fondo);
control("abajo a la derecha, que es donde la pone el motor",
  pintado.caja.x > pintado.pantalla.w / 2 && pintado.caja.y > pintado.pantalla.h / 2,
  `${pintado.caja.x},${pintado.caja.y}`);

// Cinco visibles como mucho, y el historial sigue creciendo por detrás.
const muchas = await pag.evaluate(() => {
  for (let i = 0; i < 9; i++) window.probe.hud.suceso("normal", `suceso numero ${i}`);
  return {
    ...window.probe.hud.estado().consola,
    enElDom: document.querySelectorAll(".ms-consola > div").length,
  };
});
console.log(`  nueve más: ${muchas.visibles} visibles, ${muchas.total} en el historial, ` +
  `${muchas.enElDom} en el DOM`);
control("nunca se ven más de cinco: `ms_evthud_size 5`", muchas.visibles === 5, `${muchas.visibles}`);
control("y en el DOM hay exactamente las que se ven", muchas.enElDom === 5, `${muchas.enElDom}`);
control("el historial se queda en diez: `ms_evthud_history 10`", muchas.total === 10, `${muchas.total}`);

// El decaimiento, con el reloj del juego. Cinco segundos por línea, así que
// veinticinco para vaciarla del todo. Se comprueba a los 6 y a los 30.
const decae = await pag.evaluate(() => {
  const a = window.probe.hud.estado().consola.visibles;
  window.probe.hud.avanzar(6);
  const b = window.probe.hud.estado().consola.visibles;
  window.probe.hud.avanzar(24);
  const c = window.probe.hud.estado().consola.visibles;
  return { a, b, c, enElDom: document.querySelectorAll(".ms-consola > div").length };
});
console.log(`  decaimiento: ${decae.a} → ${decae.b} a los 6 s → ${decae.c} a los 30 s`);
control("a los seis segundos ha caído UNA, no todas", decae.b === decae.a - 1, `${decae.a} → ${decae.b}`);
control("y a los treinta no queda ninguna", decae.c === 0, `${decae.c}`);
control("y el DOM se queda vacío con ellas", decae.enElDom === 0, `${decae.enElDom} nodos`);

// RePág trae de vuelta el historial. Es lo que hace que un aviso que se fue no
// esté perdido, que era justo lo que pasaba con la línea de estado.
const atras = await pag.evaluate(() => {
  window.probe.hud.desplazar(false);
  const c = window.probe.hud.estado().consola;
  return { ...c, textos: c.lineas.map((l) => l.texto) };
});
console.log(`  RePág: ${atras.visibles} líneas recuperadas — ${atras.textos.join(" | ").slice(0, 70)}…`);
control("RePág recupera el historial que ya se había ido",
  atras.visibles === 5, `${atras.visibles}`);
control("y son las de antes, no líneas en blanco",
  atras.textos.every((t) => t && t.length > 0), atras.textos.length + " con texto");

// Los seis colores, cada uno el suyo en el DOM.
const seis = await pag.evaluate(() => {
  window.probe.hud.avanzar(40);      // limpia
  for (const t of ["normal", "nopuedes", "ataque", "atacado", "bueno"]) {
    window.probe.hud.suceso(t, `esto es ${t}`);
  }
  return [...document.querySelectorAll(".ms-consola > div")]
    .map((n) => ({ t: n.textContent, c: getComputedStyle(n).color.replace(/\s/g, "") }));
});
console.log(`\n  los colores: ${seis.map((s) => `${s.t.replace("esto es ", "")}=${s.c}`).join("  ")}`);
control("los cinco tipos salen con sus cinco colores distintos",
  new Set(seis.map((s) => s.c)).size === 5, seis.map((s) => s.c).join(" "));
control("y el de «te han atacado» es el rojo (240,0,0)",
  seis.find((s) => s.t.includes("atacado"))?.c === "rgb(240,0,0)",
  seis.find((s) => s.t.includes("atacado"))?.c ?? "—");

// ── 4. QUE TE PEGUEN SE DICE, y por el camino del juego ────────────────────
//
// No se llama a `suceso()` a mano: se le pega al jugador con un bicho, que es
// el camino que recorre `arnesDeGolpe.alPegar`.
const pegado = await pag.evaluate(() => {
  window.probe.hud.avanzar(40);
  const antes = window.probe.hud.estado().consola.total;
  window.probe.sesion.danar(2, { porQue: "un Goblin", tipo: "golpe" });
  // El daño por `danar` directo no pasa por el arnés, así que este control mide
  // lo otro: que la barra reaccione a una vida que baja por donde sea.
  window.probe.hud.avanzar(2);
  return { antes, vida: window.probe.sesion.vitales().vida, cifra: window.probe.hud.estado().barras.vida.cifra };
});
control("la barra refleja cualquier pérdida de vida, venga de donde venga",
  (pegado.cifra ?? "").startsWith(`${Math.trunc(pegado.vida)}/`),
  `'${pegado.cifra}' con ${pegado.vida}`);

// ── 5. CON UN PANEL DELANTE, EL HUD SE ESCONDE ─────────────────────────────
//
// `ShowHUD()` mira `MSCLGlobals::CharPanelActive` lo primero. Sin esto, las
// cuatro barras se quedan encima de la hoja de personaje.
const conPanel = await pag.evaluate(() => {
  window.probe.interfaz.hoja();
  window.probe.hud.avanzar(0.2);
  const escondido = document.querySelector(".ms-hud").hidden;
  window.probe.interfaz.cerrar();
  window.probe.hud.avanzar(0.2);
  return { escondido, vuelve: !document.querySelector(".ms-hud").hidden };
});
control("con la hoja de personaje abierta el HUD desaparece",
  conPanel.escondido === true, `hidden ${conPanel.escondido}`);
control("y vuelve al cerrarla", conPanel.vuelve === true, "");

// ── 6. LA LÍNEA DE ESTADO YA NO HACE DE CONSOLA ────────────────────────────
const estatus = await pag.evaluate(() => window.probe.hud.estatus());
console.log(`\n  la línea de carga: ${estatus.escondida ? "escondida" : `VISIBLE con '${estatus.texto}'`}`);
control("la línea de estado del experimento 03 está escondida jugando",
  estatus.escondida === true, `'${estatus.texto}'`);

// ── 7. UNA CAPTURA, con la consola llena y la vida baja ────────────────────
await pag.evaluate(() => {
  window.probe.hud.avanzar(40);
  window.probe.hud.suceso("ataque", "6.3 de daño a un Goblin — le quedan 44 de 50");
  window.probe.hud.suceso("atacado", "Goblin te da: 4.0 de daño");
  window.probe.hud.suceso("bueno", "Has matado a un Goblin — 25 de experiencia, ¡1 punto de habilidad!");
  window.probe.hud.suceso("nopuedes", "Se te ha acabado la munición");
  window.probe.hud.suceso("normal", "Goblin ha avisado a 2 aliados al morir");
  window.probe.hud.avanzar(0.2);
});
await pag.screenshot({ path: "build/gatecity/vistas/hud.png" });
await pag.screenshot({
  path: "build/gatecity/vistas/hud_abajo.png",
  clip: { x: 0, y: ALTO - 220, width: ANCHO, height: 220 },
});

// ── 8. NADA DE ESTO ROMPE EL MUNDO ─────────────────────────────────────────
const final = await pag.evaluate(() => {
  window.probe.reaccion.avanzar(2);
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
console.log(`  capturas:       build/gatecity/vistas/hud.png y hud_abajo.png\n`);

await nav.close(); matar(dev);
process.exit(mal.length || errores.length ? 1 : 0);
