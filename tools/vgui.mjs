// EL ESQUEMA DE VGUI: de dónde saca Master Sword su letra y sus colores.
//
//   npm run vgui
//
// Los paneles de VGUI no llevan ningún color escrito: piden un **esquema** por su
// nombre y el esquema dice la fuente, el tamaño, el grosor y seis colores.
//
//     g_FontSml   = getFont(getSchemeHandle("Briefing Text"));
//     g_FontTitle = getFont(getSchemeHandle("Title Font"));
//     g_FontID    = getFont(getSchemeHandle("ID Text"));
//                                     vgui_teamfortressviewport.cpp:563-565
//
// Y los esquemas están en `*_textscheme.txt`, cuatro archivos, uno por
// resolución. Esto los lee los cuatro y escribe `build/gatecity/vgui.json`, que
// es lo que `src/vgui/esquema.js` consume en el navegador.
//
// ── Cómo elige el motor el archivo ─────────────────────────────────────────
//
//     static int g_ResArray[] = { 640, 960, 1440, 1920 };
//     int resNum = ARRAYSIZE(g_ResArray) - 1;
//     while (g_ResArray[resNum] > xRes) resNum--;
//                                       vgui_schememanager.cpp:108-128
//
// O sea: **el mayor que no pase del ancho de pantalla**, y si ese archivo no
// está, va bajando. No interpola: a 1439 px de ancho usa el de 960 tal cual. Por
// eso el tamaño de letra no escala suave, escala a saltos — y por eso aquí se
// guardan los cuatro y se elige igual, en vez de multiplicar 14 por algo.
//
// ── El formato, y los dos fallos que trae ──────────────────────────────────
//
// Tripletes `nombre = valor` (vgui_schememanager.cpp:208-236), con `//` de
// comentario y las comillas como un solo testigo. `SchemeName` abre un esquema
// nuevo. Los colores en cascada: si falta `FgColorArmed` se copia `FgColor`, si
// falta `FgColorMousedown` se copia el armado, y el fondo igual desde `BgColor`
// que por defecto es transparente (:246-270).
//
// Y AQUÍ HAY DOS FALLOS DEL MOTOR, que se portan CON EL FALLO porque el aspecto
// del juego es el que sale con ellos:
//
//   1. **la cascada se aplica al abrir el esquema SIGUIENTE**, no al cerrar el
//      actual, y después del bucle no hay un último volcado (:239-282, y el
//      bucle acaba en :357 sin nada detrás). Así que **el último esquema del
//      archivo no recibe nunca sus valores por defecto**: en los cuatro
//      archivos el último es «ID Text», que no declara `FgColor`, y se queda con
//      negro transparente en vez del blanco opaco que le tocaría. Es el esquema
//      del panel de identificación del objetivo, que está en el pendiente — o
//      sea que el fallo hoy no se ve, y cuando se haga ese panel habrá que
//      recordar que su letra sale así **en el original también**.
//
//   2. `BorderColor` pone `hasMouseDownBgColor = true` (:342-346), que es otra
//      variable. Un esquema que declare `BorderColor` y no `BgColorMousedown` se
//      queda sin la cascada del fondo pulsado. Ninguno de los cuatro archivos
//      declara `BorderColor`, así que hoy no hace nada; se porta igual y se
//      comprueba, porque el día que alguien añada uno la diferencia aparece.
//
// Misma regla de siempre: **el lector es nuestro, el contenido no se copia.**

import { writeFileSync, existsSync, readFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";

const ASSETS = process.argv[2] ?? "../MSC/assets/msr";
const SALIDA = resolve("build/gatecity/vgui.json");

/** Las cuatro resoluciones del motor, en orden. */
export const RESOLUCIONES = [640, 960, 1440, 1920];

/**
 * `COM_ParseFile` del motor: testigos separados por espacios, `//` hasta el
 * final de línea, y lo que va entre comillas es UN testigo aunque tenga espacios
 * —que es lo que hace que `"Primary Button Text"` sea un nombre y no tres—.
 */
export function testigos(texto) {
  const fuera = [];
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (c === "/" && texto[i + 1] === "/") { while (i < texto.length && texto[i] !== "\n") i++; continue; }
    if (c === " " || c === "\t" || c === "\r" || c === "\n") { i++; continue; }
    if (c === '"') {
      let j = i + 1;
      while (j < texto.length && texto[j] !== '"') j++;
      fuera.push(texto.slice(i + 1, j));
      i = j + 1;
      continue;
    }
    let j = i;
    while (j < texto.length && !' \t\r\n"'.includes(texto[j])) j++;
    fuera.push(texto.slice(i, j));
    i = j;
  }
  return fuera;
}

const rgba = (s) => {
  const n = String(s).trim().split(/\s+/).map(Number);
  return n.length === 4 && n.every(Number.isFinite) ? n : null;
};

/**
 * Lee un `*_textscheme.txt` y devuelve sus esquemas por nombre.
 *
 * `conFallos` en `false` arregla los dos fallos de arriba, y **sólo existe para
 * que la prueba pueda demostrar que los fallos están de verdad**: si no se puede
 * ver la diferencia, decir «se porta con el fallo» no significa nada.
 */
export function leerEsquemas(texto, { conFallos = true } = {}) {
  const t = testigos(texto);
  const esquemas = [];
  let e = null;
  const tiene = {};

  const cascada = (x) => {
    if (!x) return;
    if (!tiene.fg) x.fg = [255, 255, 255, 255];
    if (!tiene.fgArmado) x.fgArmado = [...x.fg];
    if (!tiene.fgPulsado) x.fgPulsado = [...x.fgArmado];
    if (!tiene.bg) x.bg = [0, 0, 0, 0];
    if (!tiene.bgArmado) x.bgArmado = [...x.bg];
    if (!tiene.bgPulsado) x.bgPulsado = [...x.bgArmado];
    if (!x.tamano) x.tamano = 17;
    if (!x.fuente) x.fuente = "Courier";
  };

  for (let i = 0; i + 2 < t.length || (i < t.length && t[i + 1] === "="); i += 3) {
    const nombre = t[i], igual = t[i + 1], valor = t[i + 2];
    if (igual !== "=") break;                      // el motor también se para aquí
    const clave = nombre.toLowerCase();

    if (clave === "schemename") {
      cascada(e);                                  // FALLO 1: al abrir el siguiente
      e = {
        nombre: valor, fuente: "", tamano: 0, peso: 0,
        cursiva: false, subrayado: false, tachado: false,
        fg: null, bg: null, fgArmado: null, bgArmado: null, fgPulsado: null, bgPulsado: null,
        borde: null,
      };
      esquemas.push(e);
      for (const k of Object.keys(tiene)) delete tiene[k];
      continue;
    }
    if (!e) break;                                 // el archivo TIENE que empezar por SchemeName

    switch (clave) {
      case "fontname": e.fuente = valor; break;
      case "fontsize": e.tamano = parseInt(valor, 10) || 0; break;
      case "fontweight": e.peso = parseInt(valor, 10) || 0; break;
      case "italic": e.cursiva = parseInt(valor, 10) >= 1; break;
      case "underline": e.subrayado = parseInt(valor, 10) >= 1; break;
      case "strikethrough": e.tachado = parseInt(valor, 10) >= 1; break;
      case "fgcolor": e.fg = rgba(valor); tiene.fg = true; break;
      case "bgcolor": e.bg = rgba(valor); tiene.bg = true; break;
      case "fgcolorarmed": e.fgArmado = rgba(valor); tiene.fgArmado = true; break;
      case "bgcolorarmed": e.bgArmado = rgba(valor); tiene.bgArmado = true; break;
      case "fgcolormousedown": e.fgPulsado = rgba(valor); tiene.fgPulsado = true; break;
      case "bgcolormousedown": e.bgPulsado = rgba(valor); tiene.bgPulsado = true; break;
      case "bordercolor":
        e.borde = rgba(valor);
        // FALLO 2: el motor marca la variable de OTRO color.
        if (conFallos) tiene.bgPulsado = true; else tiene.borde = true;
        break;
      default: break;
    }
  }
  // FALLO 1, la otra mitad: el motor NO hace esto, y por eso el último esquema
  // del archivo se queda sin valores por defecto.
  if (!conFallos) cascada(e);

  return Object.fromEntries(esquemas.map((x) => [x.nombre, x]));
}

/** El archivo que el motor elegiría para un ancho de pantalla dado. */
export function resolucionPara(ancho, disponibles = RESOLUCIONES) {
  const orden = [...disponibles].sort((a, b) => a - b);
  let i = orden.length - 1;
  while (i >= 0 && orden[i] > ancho) i--;
  return i < 0 ? null : orden[i];
}

// ── LO QUE SE EJECUTA ───────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` ||
    process.argv[1]?.endsWith("vgui.mjs")) {

  if (!existsSync(`${ASSETS}/640_textscheme.txt`)) {
    console.error(`No encuentro ${ASSETS}/640_textscheme.txt. Pásame la carpeta del juego.`);
    process.exit(1);
  }

  const controles = [];
  const control = (que, bien, detalle = "") => { controles.push({ que, bien, detalle }); };

  const porResolucion = {};
  for (const r of RESOLUCIONES) {
    const ruta = `${ASSETS}/${r}_textscheme.txt`;
    if (!existsSync(ruta)) { console.log(`  falta ${r}_textscheme.txt`); continue; }
    porResolucion[r] = leerEsquemas(readFileSync(ruta, "utf8"));
  }

  const hay = Object.keys(porResolucion).map(Number);
  console.log(`\n  ESQUEMAS DE VGUI  (${ASSETS})\n`);
  for (const r of hay) {
    const e = porResolucion[r];
    console.log(`    ${String(r).padStart(4)}  ${Object.keys(e).length} esquemas · ` +
      `Briefing ${e["Briefing Text"]?.tamano} · Title ${e["Title Font"]?.tamano} · ` +
      `fuente ${e["Briefing Text"]?.fuente}`);
  }

  // ── los controles ─────────────────────────────────────────────────────────
  control("están los cuatro archivos del motor", hay.length === 4, hay.join(", "));
  control("y los tres esquemas que el código pide de verdad",
    hay.every((r) => ["Briefing Text", "Title Font", "ID Text"].every((n) => porResolucion[r][n])),
    "Briefing Text, Title Font, ID Text");

  const b640 = porResolucion[640]?.["Briefing Text"], b1920 = porResolucion[1920]?.["Briefing Text"];
  const cuerpo = RESOLUCIONES.map((r) => porResolucion[r]?.["Briefing Text"]?.tamano);
  control("la letra del cuerpo apenas escala: de 640 a 1920 sube dos puntos",
    b640 && b1920 && b1920.tamano > b640.tamano && b1920.tamano < b640.tamano * 2,
    `Briefing Text ${b640?.tamano} -> ${b1920?.tamano}`);
  // Y NO CRECE EN ORDEN, que es un hallazgo de los datos del propio juego: el
  // archivo de 1440 pone 21 donde el de 1920 pone 16. O sea que a 1440 px de
  // ancho el texto del cuerpo se ve MÁS GRANDE que a 1920. No es un error de
  // lectura —están así en los cuatro archivos— y no se arregla: se lee lo que
  // dice el juego. Pero queda medido, porque el día que una pantalla se vea con
  // la letra desproporcionada, ésta es la razón y no un fallo nuestro.
  control("HALLAZGO: los tamaños del cuerpo NO van en orden en los archivos del juego",
    cuerpo[2] > cuerpo[3],
    `640:${cuerpo[0]} 960:${cuerpo[1]} 1440:${cuerpo[2]} 1920:${cuerpo[3]} — el de 1440 es el mayor`);
  control("el título es más grande que el texto",
    porResolucion[640]?.["Title Font"].tamano > b640.tamano,
    `${porResolucion[640]?.["Title Font"].tamano} contra ${b640?.tamano}`);
  control("y el ámbar del título es el del juego, no uno elegido",
    JSON.stringify(porResolucion[640]?.["Title Font"].fg) === JSON.stringify([255, 170, 0, 255]),
    `FgColor ${porResolucion[640]?.["Title Font"].fg?.join(" ")}`);

  // el fallo 1, demostrado: el último esquema del archivo se queda sin cascada
  const conFallo = porResolucion[640]["ID Text"];
  const sinFallo = leerEsquemas(readFileSync(`${ASSETS}/640_textscheme.txt`, "utf8"), { conFallos: false })["ID Text"];
  control("EL FALLO DEL MOTOR: el último esquema no recibe sus valores por defecto",
    conFallo.fg === null && JSON.stringify(sinFallo.fg) === JSON.stringify([255, 255, 255, 255]),
    `'ID Text' se queda en ${JSON.stringify(conFallo.fg)}; le tocaba 255 255 255 255`);

  control("a 1439 px de ancho el motor usa el archivo de 960, no interpola",
    resolucionPara(1439, hay) === 960, `${resolucionPara(1439, hay)}`);
  control("y por debajo de 640 no hay archivo ninguno",
    resolucionPara(639, hay) === null, `${resolucionPara(639, hay)}`);

  for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(62)} ${c.detalle}`);
  console.log(`\n  ${controles.filter((c) => c.bien).length} de ${controles.length} controles`);

  writeFileSync(SALIDA, JSON.stringify({
    procedencia: {
      assets: ASSETS,
      cuando: new Date().toISOString().slice(0, 10),
      nota: "Leído de *_textscheme.txt de una instalación de Master Sword Rebirth. No se distribuye.",
      citas: [
        "vgui_schememanager.cpp:108-128  qué archivo se elige para cada resolución",
        "vgui_schememanager.cpp:208-236  el formato: tripletes nombre = valor",
        "vgui_schememanager.cpp:239-282  la cascada de colores, y el fallo del último esquema",
        "vgui_teamfortressviewport.cpp:563-565  g_FontSml, g_FontTitle, g_FontID",
      ],
    },
    resoluciones: hay,
    /** Los tres que el código del mod pide por su nombre. */
    manijas: { sml: "Briefing Text", title: "Title Font", id: "ID Text" },
    esquemas: porResolucion,
  }, null, 1));
  console.log(`  escrito ${SALIDA}`);

  const PROC = resolve("build/gatecity/PROCEDENCIA.md");
  const MARCA = "## El esquema de VGUI";
  if (existsSync(PROC) && !readFileSync(PROC, "utf8").includes(MARCA)) {
    appendFileSync(PROC, `
${MARCA}

\`vgui.json\` lo escribe \`node tools/vgui.mjs\` leyendo los cuatro
\`*_textscheme.txt\` del juego (640, 960, 1440, 1920). No trae imágenes: son la
fuente, el tamaño, el grosor y los seis colores de cada esquema, que es de donde
los paneles de VGUI sacan su aspecto.

Se portan además los dos fallos del lector del motor —el último esquema del
archivo no recibe sus valores por defecto, y \`BorderColor\` marca la variable de
otro color— porque el aspecto del juego es el que sale CON ellos. Están
comentados en el extractor y comprobados en \`test/vgui.test.mjs\`.

Vale lo de siempre: **está en \`build/\`, que está en \`.gitignore\`, y no se mueve
un byte a \`public/\`.**
`);
  }

  process.exit(controles.every((c) => c.bien) ? 0 : 1);
}
