// EL MENÚ PRINCIPAL CON FONDO VIVO, medido en la pantalla.
//
//   npm run sonda:menu52
//
// Las reglas del recorrido —la curva, la ida y vuelta, el paralaje— ya las
// comprueban 21 pruebas de Node sin navegador. Esto mide lo único que ninguna de
// ellas puede: **que detrás del menú haya un mapa y que se esté moviendo**.
//
// Las formas de que esto parezca funcionar y esté mal, que son las que dictan
// los controles de abajo:
//
//   1. la capa sigue opaca                 -> el mapa pasea detrás de la pintura
//   2. el mapa no se dibuja                -> negro, y «no es la pintura» da verde
//   3. la cámara no se mueve               -> una foto fija, que es lo que había
//   4. la cámara se mueve pero es la del jugador -> se rompe la partida al entrar
//   5. los dos miradores dan la misma vista -> el recorrido se ignora (el 50)
//   6. el HUD se ve por encima              -> barras de vida flotando sobre el pueblo
//   7. el arma viaja con la cámara          -> una espada clavada delante del menú
//   8. sin mirador no vuelve la pintura     -> un menú negro cuando algo falla
//
// Y EL CONTROL QUE MÁS IMPORTA es el par del punto 3: «cambian píxeles entre dos
// fotogramas» no vale solo. Hace falta al lado la MISMA medida con la pintura
// puesta, que tiene que dar casi cero. Sin ese negativo, un fondo que parpadease
// por cualquier otro motivo pasaría por «la cámara se mueve».

import { createServer } from "vite";
import { chromium } from "playwright";
import { esNuestro } from "./mismo.mjs";
import { mkdirSync } from "node:fs";
import { leerPng } from "../tools/png.mjs";

// Revisión 57: servidor propio en puerto libre, sin interrumpir otros procesos.
const dev = await createServer({ server: { host: "127.0.0.1", port: 0,
  hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
let nav;
try {
await dev.listen();
const PORT = dev.httpServer.address().port;
nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));

// SIN `?map=`. Es el aviso de CLAUDE.md: una sonda que entra por un atajo mide
// otro juego. El jugador entra por aquí desde el experimento 36.
await pag.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load" });
await esNuestro(pag, PORT);
const DIR = process.env.MENU_CAPTURAS || "build/gatecity/vistas";
mkdirSync(DIR, { recursive: true });

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });

await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });

/** Una captura a disco, y de vuelta su mapa de píxeles. */
let n = 0;
const tirar = async (nombre) => {
  const ruta = `${DIR}/menu52_${nombre}.png`;
  await pag.screenshot({ path: ruta });
  n++;
  return { ruta, img: leerPng(ruta) };
};

/** Qué fracción de píxeles cambia entre dos capturas, y cuánto el que más. */
const cambio = (a, b) => {
  let cuantos = 0, mayor = 0;
  for (let i = 0; i < a.rgba.length; i += 4) {
    const d = Math.abs(a.rgba[i] - b.rgba[i])
      + Math.abs(a.rgba[i + 1] - b.rgba[i + 1])
      + Math.abs(a.rgba[i + 2] - b.rgba[i + 2]);
    if (d > 8) cuantos++;
    if (d > mayor) mayor = d;
  }
  return { fraccion: cuantos / (a.rgba.length / 4), mayor };
};

/** El brillo medio, para distinguir «hay mapa» de «hay negro». */
const luz = (img) => {
  let s = 0;
  for (let i = 0; i < img.rgba.length; i += 4) {
    s += 0.2126 * img.rgba[i] + 0.7152 * img.rgba[i + 1] + 0.0722 * img.rgba[i + 2];
  }
  return s / (img.rgba.length / 4);
};

// ── 1. LA CAPA, Y QUE DETRÁS HAYA ALGO ─────────────────────────────────────
console.log("\n  LA PRIMERA PANTALLA");
const e0 = await pag.evaluate(() => window.probe.menu.estado?.() ?? window.probe.menuMs?.estado());
console.log(`    estado          abierto ${e0.abierto}, fondoVivo ${e0.fondoVivo}, pintura ${e0.pinturaPuesta}`);
control("lo primero que se ve es el menú, como desde el 36", e0.abierto === true, `abierto ${e0.abierto}`);
control("y trae las entradas de gamemenu.res, que no se han tocado",
  e0.opciones.length >= 5, e0.opciones.map((o) => o.texto).join(" · "));

// ── EL VOLUMEN DE LOS SONIDOS DEL MENÚ — el 84 ────────────────────────────
//
// Lo reportó el usuario: «las de sonido no afectan el volumen que pasa cuando
// pasas el mouse por una de las opciones del menú principal, de hecho parece que
// no funciona para nada».
//
// Y esta sonda es el sitio donde se mide, porque **está en el menú y no hay mapa
// cargado**, que es la mitad del fallo: quien reparte los ajustes
// (`aplicarAjustes`, src/main.js) no existe hasta que carga un mapa, así que
// aquí no había nadie a quien decírselo. Un `new Audio()` nace con `volume = 1`
// y el `config.cfg` de Master Sword trae `volume "0.120000"`: sonaba a 8,3 veces
// lo que el jugador tenía puesto.
//
// Se lee del `volume` de los propios elementos y no de la variable que lo
// guarda: «el ajuste se apuntó» y «el ajuste llegó» son dos cosas, y el fallo
// era justo la segunda.
const volMenu = await pag.evaluate(() => window.probe.menu.volumen());
console.log(`    volumen sonidos ${volMenu} (config.cfg: 0.12 · un Audio nuevo: 1)`);
control("los sonidos del menú suenan al volumen del `config.cfg`, no a 1",
  volMenu !== null && Math.abs(volMenu - 0.12) < 1e-6,
  volMenu === null ? "sin sonidos horneados: no se puede medir" : `${volMenu}`);
// EL CONTROL POSITIVO, que es el que impide que lo de arriba sea un cero vacío:
// si no hubiera sonidos montados, `volumen` daría `null` y una comparación
// descuidada lo habría dejado pasar. Y además fija el número que delata el fallo:
// 1 es el valor de reposo de un `Audio`, o sea el valor que tenía ANTES.
control("CONTROL POSITIVO: hay sonidos montados y NO están al 1 de reposo",
  volMenu !== null && volMenu !== 1,
  `${volMenu}; el fallo del 84 daba exactamente 1`);
// ── EL 72 DIO LA VUELTA A ESTAS DOS ───────────────────────────────────────
//
// Hasta el 71 aquí se exigía `fondoVivo === true`: la primera pantalla era la
// escena de la torre. **Desde el 72 es la pintura de Anders Finér**, que es el
// arte real del menú, y la torre queda apagada tras `ESCENA_DEL_MENU` en
// `src/play/fondomenu.js` — con su razón escrita, porque un apagado callado es
// el apartado 4 de CLAUDE.md.
//
// Así que lo que se mide aquí ahora es la decisión nueva. Lo de la torre no se
// deja de medir: se enciende justo debajo y el resto de la sonda sigue igual.
control("la primera pantalla trae la PINTURA (decisión del 72)",
  e0.fondoVivo === false && e0.pinturaPuesta === true,
  `fondoVivo ${e0.fondoVivo}, pintura ${e0.pinturaPuesta}`);
control("y la pintura que se pone es la del juego, no un color de relleno",
  typeof e0.conFondo === "boolean" ? e0.conFondo === true : true,
  `conFondo ${e0.conFondo}`);

// ── Y AHORA SE ENCIENDE LA TORRE, que es lo que esta sonda mide ───────────
//
// `fondo(true)` monta la escena bajo demanda desde el 72 (antes ya estaba
// montada al arrancar). Lo que viene detrás no ha cambiado una línea.
const e1 = await pag.evaluate(() => window.probe.miradores.fondo(true));
control("la escena de la torre se enciende a petición y pide fondo vivo",
  e1?.fondoVivo === true && e1?.pinturaPuesta === false,
  `fondoVivo ${e1?.fondoVivo}, pintura ${e1?.pinturaPuesta}`);

const a1 = await tirar("vivo_a");
const brillo = luz(a1.img);
console.log(`    brillo medio    ${brillo.toFixed(1)} / 255`);
// El umbral no se inventa: una pantalla negra da 0,0 y ésta se midió en ~24.
// Se pone en 6 para que sea el negro lo que falle y no un mapa oscuro.
control("detrás hay mapa dibujado y no negro", brillo > 6, `brillo ${brillo.toFixed(1)}`);

// ── 2. QUE SE MUEVA, Y EL NEGATIVO QUE LO HACE VALER ───────────────────────
console.log("\n  ¿SE MUEVE?");
// El motor acota dt: doce segundos de pared con SwiftShader no equivalen a
// doce de animación. Se observa el reloj real del cielo, sin adelantarlo ni
// llamar paso desde la sonda. Si el bucle deja de animar, agota el plazo.
await pag.evaluate(() => {
  const r=window.probe.renderer,original=r.render;
  r.render=function(escena,camara) {
    const reloj=escena.getObjectByName("cielo")?.material.uniforms.tiempo;
    if(reloj) { window.relojCielo52=reloj;this.render=original; }
    return original.call(this,escena,camara);
  };
});
await pag.waitForFunction(()=>window.relojCielo52,null,{timeout:60000});
const esperarAnimacion=async()=>{
  const inicio=await pag.evaluate(()=>window.relojCielo52.value);
  await pag.waitForFunction(t=>window.relojCielo52.value-t>=8,inicio,{timeout:120000});
};
await esperarAnimacion();
const a2 = await tirar("vivo_b");
const movio = cambio(a1.img, a2.img);
console.log(`    con fondo vivo  ${(movio.fraccion * 100).toFixed(2)} % de píxeles cambian en 8 s de animación`);
control("la escena se mueve: cambian píxeles entre dos fotogramas separados",
  movio.fraccion > 0.02, `${(movio.fraccion * 100).toFixed(2)} %`);

// EL NEGATIVO. La misma medida con la pintura puesta: si esto también cambiara,
// lo de arriba no estaría midiendo la cámara sino cualquier otra cosa que se
// mueva en la pantalla.
await pag.evaluate(() => window.probe.miradores.fondo(false));
// Corrección 57: 300 ms no garantizan que la pintura esté descargada. La primera
// captura llegó a medir negro y la segunda la imagen: un falso movimiento del 91%.
await pag.evaluate(async () => {
  const fondo=getComputedStyle(document.querySelector(".ms-menu")).backgroundImage;
  const imagen=new Image();
  imagen.src=fondo.slice(4,-1).replace(/^["']|["']$/g, "");
  await imagen.decode();
  await document.fonts.ready;
});
await pag.waitForTimeout(300);
const p1 = await tirar("pintura_a");
await esperarAnimacion();
const p2 = await tirar("pintura_b");
const quieto = cambio(p1.img, p2.img);
console.log(`    con la pintura  ${(quieto.fraccion * 100).toFixed(2)} % en el mismo rato`);
control("NEGATIVO: con la pintura puesta NO cambia nada, así que arriba se midió la cámara",
  quieto.fraccion < 0.005, `${(quieto.fraccion * 100).toFixed(2)} %`);
control("y la pintura vuelve de verdad, que es el respaldo obligatorio",
  (await pag.evaluate(() => window.probe.menu.estado().pinturaPuesta)) === true);

// Y SE VUELVE A ENCENDER, que se me olvidó y lo cazó el negativo de más abajo.
// Sin esta línea, todo el bloque del trayecto medía **la pintura quieta**: las
// seis muestras salían idénticas (brillo 84,8, silueta 38,4 %, centro 0,48) y
// los dos primeros controles del trayecto pasaban en verde sobre una sola
// imagen repetida. El que lo dijo fue «las dos puntas no son la misma imagen»,
// que dio 0,00 %. Es justo para lo que estaba puesto.
await pag.evaluate(() => window.probe.miradores.fondo(true));
await pag.waitForTimeout(300);

// ── 3. EL TRAYECTO ENTERO, NO SOLO UN PUNTO ────────────────────────────────
//
// **Este es el control que faltaba, y la lección la pagaron dos experimentos.**
//
// Los miradores de Gate City del 52 se eligieron de UNA foto en `s = 0`, y la
// sonda medía que la cámara se movía. Las dos cosas daban verde y aun así el
// encuadre se rompía por el camino: se vio jugando, con un tejado cortando el
// tercio superior. Y el 53 se encontró la misma forma con otra ropa — una
// rotura a propósito que no puso nada rojo porque el control miraba el estado
// final y no el momento en que el mecanismo actuaba.
//
// Las dos son el mismo defecto: **el control mira el resultado y no el
// recorrido.** Así que aquí se recorre.
console.log("\n  EL TRAYECTO");
const tabla = await pag.evaluate(() => window.probe.miradores.tabla());
console.log(`    escena          ${tabla.escena}, «${tabla.mirador}», ${tabla.puntos} puntos, ${tabla.segundos}s`);
control("detrás del menú está la escena de la torre, no un mapa",
  tabla.escena === "torre", `${tabla.escena}`);

const PASOS = [0, 0.2, 0.4, 0.6, 0.8, 1];
const alLargo = [];
for (const s of PASOS) {
  await pag.evaluate((v) => window.probe.miradores.en(v), s);
  await pag.waitForTimeout(220);
  const img = (await tirar(`trayecto_${String(s).replace(".", "")}`)).img;
  // Tres medidas por punto, y las tres tienen que aguantar EN TODOS:
  //   - brillo medio: ni pantalla negra ni pantalla lavada;
  //   - qué fracción es silueta (oscura): si es 0 la torre se salió del cuadro,
  //     y si es casi 1 la cámara se metió dentro de algo;
  //   - dónde cae el centro de masa de lo oscuro: la torre tiene que quedarse
  //     en la mitad DERECHA, porque el menú escribe a la izquierda.
  // SOLO POR ENCIMA DEL HORIZONTE, y esto costó dos rojos.
  //
  // La primera versión contaba los píxeles oscuros de TODO el cuadro y los
  // llamaba «la silueta». En un atardecer el suelo también es oscuro, así que
  // salía un 74 % de «silueta» y el centro de masa caía a la izquierda —donde
  // está el suelo, no la torre—. La medida no estaba midiendo la torre: estaba
  // midiendo la noche.
  //
  // Arriba del horizonte lo único oscuro que hay es la torre, porque detrás
  // tiene cielo. Así que el recuento se limita a la mitad superior, que es
  // donde la pregunta «¿se ve la torre y dónde?» tiene respuesta.
  let suma = 0, oscuros = 0;
  const w = img.ancho, h = img.alto;
  const hasta = Math.floor(h * 0.52);
  // Por COLUMNAS, para poder buscar el pico en vez de la media.
  const porColumna = new Float64Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const l = 0.2126 * img.rgba[o] + 0.7152 * img.rgba[o + 1] + 0.0722 * img.rgba[o + 2];
      suma += l;
      // EL UMBRAL ES 18 Y NO 42, y también se midió en vez de elegirse.
      //
      // Con 42 el control daba 68 % de «silueta» y el centro a la izquierda: a
      // esa altura el cielo del atardecer TAMBIÉN cae por debajo —el violeta de
      // arriba ronda 34— así que el umbral no separaba la torre del cielo, sólo
      // la noche del sol. La torre está casi a negro (unos 10) porque la niebla
      // empieza más allá de ella; 18 cae en el hueco entre las dos cosas.
      // Corrección 57: piedra en sRGB con detalle, ya no negro sin conversión.
      // Se excluye la columna del menú y su viñeta. El cielo diurno queda por
      // encima de 85; la piedra por debajo. torre57 comprueba además que quitar
      // la torre cambia píxeles, para no confundir una nube oscura con ella.
      if (y < hasta && x > w * .4 && l < 85) { oscuros++; porColumna[x]++; }
    }
  }
  const n = w * h;
  // DÓNDE ESTÁ LA TORRE: el pico del histograma por columnas, no el centro de
  // masa de todo lo oscuro.
  //
  // El centro de masa daba 0,43 —a la izquierda— con la torre visiblemente a
  // 0,67, porque el cénit del atardecer es oscuro y las esquinas de arriba
  // pesaban tanto como el sujeto. Lo que distingue a la torre del cielo no es
  // ser oscura: es ser una COLUMNA continua de oscuro. Una ventana de 5 % del
  // ancho suaviza el histograma lo justo para que el pico sea el fuste y no un
  // píxel suelto.
  const vent = Math.max(3, Math.floor(w * 0.05));
  let mejor = 0, mejorX = 0;
  for (let x = 0; x + vent < w; x++) {
    let acc = 0;
    for (let k = 0; k < vent; k++) acc += porColumna[x + k];
    if (acc > mejor) { mejor = acc; mejorX = x + vent / 2; }
  }
  alLargo.push({
    s, brillo: suma / n, silueta: oscuros / (w * hasta),
    centro: mejor > 0 ? mejorX / w : null,
  });
}
for (const p of alLargo) {
  console.log(`    s=${String(p.s).padEnd(4)} brillo ${p.brillo.toFixed(1).padStart(5)}  silueta ${(p.silueta * 100).toFixed(1).padStart(5)} %  centro ${p.centro === null ? "—" : p.centro.toFixed(2)}`);
}
control("EN TODO EL TRAYECTO hay luz: ni un punto a pantalla negra",
  alLargo.every((p) => p.brillo > 12),
  `mínimo ${Math.min(...alLargo.map((p) => p.brillo)).toFixed(1)}`);
control("EN TODO EL TRAYECTO se ve la torre, y no se come el cuadro",
  alLargo.every((p) => p.silueta > 0.02 && p.silueta < 0.40),
  `silueta ${(Math.min(...alLargo.map((p) => p.silueta)) * 100).toFixed(1)}–${(Math.max(...alLargo.map((p) => p.silueta)) * 100).toFixed(1)} %`);
control("y NUNCA se cruza a la mitad izquierda, donde escribe el menú",
  alLargo.every((p) => p.centro !== null && p.centro > 0.5),
  `centro mínimo ${Math.min(...alLargo.map((p) => p.centro ?? 0)).toFixed(2)}`);
// El negativo del trayecto: los seis puntos tienen que ser DISTINTOS entre sí.
// Si el recorrido no se aplicara, los seis darían lo mismo y los tres controles
// de arriba pasarían igual — verdes sobre una sola imagen repetida.
await pag.evaluate(() => window.probe.miradores.en(0));
await pag.waitForTimeout(220);
const uno = (await tirar("cmp_0")).img;
await pag.evaluate(() => window.probe.miradores.en(1));
await pag.waitForTimeout(220);
const otro = (await tirar("cmp_1")).img;
const entrePuntas = cambio(uno, otro);
console.log(`    las dos puntas se diferencian en ${(entrePuntas.fraccion * 100).toFixed(2)} %`);
control("NEGATIVO: las dos puntas del recorrido NO son la misma imagen",
  entrePuntas.fraccion > 0.02, `${(entrePuntas.fraccion * 100).toFixed(2)} %`);

// ── 4. EL PARALAJE ─────────────────────────────────────────────────────────
console.log("\n  EL PARALAJE");
await pag.evaluate(() => window.probe.miradores.en(0.5));
await pag.mouse.move(600, 400);
await pag.waitForTimeout(900);
const centro = await pag.evaluate(() => window.probe.miradores.donde());
await pag.mouse.move(1150, 400);
await pag.waitForTimeout(1200);
const lado = await pag.evaluate(() => window.probe.miradores.donde());
const giro = Math.abs(lado.yaw - centro.yaw);
console.log(`    yaw centro ${centro.yaw.toFixed(4)}  yaw derecha ${lado.yaw.toFixed(4)}  -> ${(giro * 180 / Math.PI).toFixed(2)}°`);
control("mover el ratón mueve la cámara", giro > 0.005, `${(giro * 180 / Math.PI).toFixed(2)}°`);
// El negativo: el recorrido también mueve el yaw solo, así que hay que
// comprobar que quieto se mueve MUCHO menos que con el ratón. Sin esto, «el
// yaw cambió» sería verdad igual sin tocar el ratón.
const q1 = await pag.evaluate(() => window.probe.miradores.donde());
await pag.waitForTimeout(1200);
const q2 = await pag.evaluate(() => window.probe.miradores.donde());
const soloElPaseo = Math.abs(q2.yaw - q1.yaw);
console.log(`    sin tocar el ratón, el paseo solo gira ${(soloElPaseo * 180 / Math.PI).toFixed(2)}° en el mismo rato`);
control("NEGATIVO: el ratón mueve más que el propio paseo, así que se midió el paralaje",
  giro > soloElPaseo * 2, `${(giro * 180 / Math.PI).toFixed(2)}° contra ${(soloElPaseo * 180 / Math.PI).toFixed(2)}°`);

// ── 5. LO QUE NO SE TIENE QUE VER ──────────────────────────────────────────
console.log("\n  LO QUE NO SE VE CON EL MENÚ DELANTE");
const hud = await pag.evaluate(() => {
  const n = document.querySelector(".ms-hud");
  return { existe: Boolean(n), oculto: n ? n.hidden : null };
});
console.log(`    HUD             existe ${hud.existe}, oculto ${hud.oculto}`);
control("el HUD está escondido: si no, las barras de vida flotan sobre el pueblo",
  hud.oculto === true, `oculto ${hud.oculto}`);

const paseando = await pag.evaluate(() => window.probe.miradores.donde().paseando);
control("la cámara la lleva el menú, no el jugador", paseando === true, `paseando ${paseando}`);

// ── 6. EL RESPALDO ─────────────────────────────────────────────────────────
console.log("\n  EL RESPALDO");
const malo = await pag.evaluate(() => window.probe.miradores.poner({ puntos: [[0, 0, 0]], mirar: null, segundos: 90 }));
control("un mirador sin puntos suficientes se rechaza en vez de dejar la cámara suelta",
  malo === false, `devolvió ${malo}`);

// ── 7. Y QUE ENTRAR A JUGAR DEVUELVA LA CÁMARA ─────────────────────────────
//
// Es el punto 4 de la lista de arriba: la cámara del menú es la MISMA que la del
// jugador, así que si al entrar no se la devuelve, se empieza a jugar volando.
console.log("\n  AL ENTRAR A JUGAR");
// Corrección 57: desde el 53 el menú inicial no trae sesión; crear un personaje
// por sonda aquí era un atajo inválido. Se entra desde Create Server de verdad.
await pag.locator(".ms-menu-op").filter({ hasText: /^Establish a Kingdom$/ }).click();
await pag.locator(".v2-desplegable").click();
await pag.locator(".v2-lista-abierta > button").filter({ hasText: /^edana$/ }).click();
await pag.locator(".v2-boton").filter({ hasText: /^Start$/ }).click();
await pag.waitForURL(/map=edana/);
await pag.waitForFunction(() => window.probe?.ready, null, { timeout: 120000 });
const dentro = await pag.evaluate(() => window.probe.miradores.donde());
console.log(`    paseando        ${dentro.paseando}`);
control("CONTROL POSITIVO: cerrado el menú, la cámara vuelve al jugador",
  dentro.paseando === false, `paseando ${dentro.paseando}`);

// ── EL RESUMEN ─────────────────────────────────────────────────────────────
console.log("\n  CONTROLES");
for (const c of controles) {
  console.log(`  ${c.bien ? "ok  " : "FALLA"} ${c.que.padEnd(66)} ${c.detalle}`);
}
const bien = controles.filter((c) => c.bien).length;
console.log(`\n  ${bien} de ${controles.length} en verde`);
console.log(`  capturas: ${n} en ${DIR}/menu52_*.png`);
console.log(`  errores de pagina: ${errores.length ? errores.join(" | ") : "ninguno"}`);

process.exitCode = bien === controles.length && errores.length === 0 ? 0 : 1;
} finally {
  await nav?.close();
  await dev.close();
}
