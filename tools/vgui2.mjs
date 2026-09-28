// EL ESQUEMA DE VGUI2: los colores, las letras y los bordes de las ventanas de
// Valve —«Options», «Servers», «Create Server»—, y las cadenas que llevan dentro.
//
//   npm run vgui2
//
// ── Esto NO es el VGUI del 29 ───────────────────────────────────────────────
//
// En la misma pantalla del juego conviven DOS sistemas de interfaz, y la captura
// del menú principal los enseña a la vez:
//
//   VGUI1   los paneles del mod: la hoja de personaje, el inventario, el menú
//           de la F. Letra Sitka, esquemas en `*_textscheme.txt`, y los lee
//           `tools/vgui.mjs` desde el experimento 29.
//   VGUI2   las ventanas de Valve: «Options» con sus siete pestañas, el
//           navegador de servidores y «Create Server». Letra Verdana/Tahoma,
//           esquema en `resource/TrackerScheme.res`, y es lo que lee ESTE
//           archivo.
//
// No se mezclan y no deben heredar colores el uno del otro. Por eso hay dos
// extractores, dos `.json` y dos carpetas (`src/vgui/` y `src/vgui2/`).
//
// ── El alfa va al DERECHO aquí, y al revés en el otro ───────────────────────
//
// Es la trampa de juntar los dos sistemas. En VGUI1 el cuarto número de
// `COLOR(r,g,b,a)` es la TRANSPARENCIA: 255 es invisible (ver `deVgui()` en
// `src/juego/paleta.js`). En VGUI2 es el alfa normal: 255 es opaco.
//
// No hay que creérselo, está en el propio archivo y se ve en la captura:
//
//     "TitleBG"    "206 206 206 0"     // la barra de título
//     "BaseText"   "196 220 255 220"   // el texto de las listas
//
// Si el alfa estuviera invertido, la barra de título sería una banda gris clara
// opaca y el texto de la lista de servidores sería casi invisible. En la captura
// la barra de título no existe y el texto se lee. Va al derecho.
//
// ── De dónde sale este esquema, que tiene su historia ──────────────────────
//
// `TrackerScheme.res` es el esquema de la plataforma de Steam, y el que trae el
// mod es una copia con los colores cambiados. Lo dicen sus propios comentarios
// (`//swapping 0 170 255 for 196 220 255`, línea 2) y lo confirma un resto que
// se les quedó dentro:
//
//     // from kTeamColors in AvHSharedUtil.cpp
//     "team1"  "125 165 210 255"
//                                     TrackerScheme.res:59-64
//
// `AvHSharedUtil.cpp` es de **Natural Selection**. O sea que el azul de las
// ventanas de Master Sword viene de pasar por NS antes. No cambia nada de lo que
// hay que portar, pero explica por qué el esquema trae `BuddyButton` y `Chat`,
// que son de la lista de amigos de Steam y aquí no pinta nadie.
//
// ── Lo que este extractor NO puede darnos ──────────────────────────────────
//
// **La disposición.** El código de `GameUI.dll` no es público y en GoldSrc esas
// ventanas no se colocan con un `.res`: se construyen en C++. Así que de aquí
// salen los colores, las letras, los bordes y las cadenas —que son hechos con su
// archivo— pero dónde va cada control se mide de las capturas de pantalla. Está
// dicho en `doc/VGUI2_34.md` y no se disimula citándolo como si fuera código.
//
// Y de siempre: **el lector es nuestro, el contenido no se copia.** Todo sale a
// `build/`, que está en `.gitignore`, y **no se mueve un byte a `public/`.**

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";

const ASSETS = process.argv[2] ?? "../MSC/assets/msr";
const SALIDA = resolve("build/gatecity");

const RUTA_ESQUEMA = `${ASSETS}/resource/TrackerScheme.res`;
const RUTA_CADENAS = `${ASSETS}/resource/gameui_english.txt`;

// Las funciones de leer se exportan para que `test/vgui2.test.mjs` las use sin
// navegador y sin horneo. Hornear sólo pasa si a este archivo lo llaman como
// programa, igual que en `tools/vgui.mjs:180` y `tools/menus.mjs:267`.
const ME_HAN_LLAMADO = process.argv[1]?.endsWith("vgui2.mjs");

// ── EL LECTOR DE KEYVALUES ──────────────────────────────────────────────────
//
// `gamemenu.res` se podía leer con una expresión regular porque es plano.
// `TrackerScheme.res` no: son 833 líneas con cuatro niveles de anidamiento
// (`Borders` → `InsetBorder` → `Left` → `"1"` → `color`/`offset`) y además
// mezcla en el mismo bloque pares sueltos y subbloques —`BaseBorder
// "InsetBorder"` está al lado de `InsetBorder { … }`—. Eso necesita un lector
// de verdad.
//
// El formato es el de Valve: nombre entre comillas o pelado, y detrás o un valor
// entre comillas o un `{`. Comentarios `//` hasta el final de línea.
//
/** Parte un texto de KeyValues en objetos anidados. Devuelve el bloque raíz. */
export function leerKeyValues(texto) {
  const fichas = [];
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (c === "/" && texto[i + 1] === "/") {            // comentario hasta el \n
      while (i < texto.length && texto[i] !== "\n") i++;
      continue;
    }
    if (c === '"') {                                     // cadena entre comillas
      let j = i + 1, s = "";
      while (j < texto.length && texto[j] !== '"') { s += texto[j]; j++; }
      fichas.push({ t: "v", s });
      i = j + 1;
      continue;
    }
    if (c === "{" || c === "}") { fichas.push({ t: c }); i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    let j = i, s = "";                                   // palabra pelada
    while (j < texto.length && !/[\s{}"]/.test(texto[j])) { s += texto[j]; j++; }
    fichas.push({ t: "v", s });
    i = j;
  }

  let p = 0;
  // Un bloque se lee hasta su `}`. Las claves repetidas ganan la última, que es
  // lo que hace el motor al mezclar esquemas.
  const bloque = () => {
    const o = {};
    while (p < fichas.length) {
      const f = fichas[p];
      if (f.t === "}") { p++; break; }
      if (f.t !== "v") { p++; continue; }
      const clave = f.s;
      p++;
      const sig = fichas[p];
      if (!sig) break;
      if (sig.t === "{") { p++; o[clave] = bloque(); }
      else if (sig.t === "v") { p++; o[clave] = sig.s; }
      else p++;                                          // un `}` suelto: se tira
    }
    return o;
  };

  // El archivo entero es `Scheme { … }`: un par nombre/bloque sin envolver.
  const raiz = bloque();
  return raiz;
}

// ── LOS COLORES ─────────────────────────────────────────────────────────────
//
// Un color del esquema es `"r g b a"`. Y casi todo lo demás **no es un color: es
// el NOMBRE de un color**, que hay que resolver contra la tabla:
//
//     "FgColor"  "ControlText"    ->  ControlText  ->  "196 220 255 200"
//
// Resolver aquí y no en el navegador es a propósito: así la ficha que se hornea
// no obliga a quien la lee a traer la tabla entera, y un nombre que no existe se
// ve al hornear y no en mitad de una partida.
/** `"196 220 255 200"` → `[196,220,255,200]`. Devuelve `null` si no lo es. */
export function colorDe(txt) {
  if (typeof txt !== "string") return null;
  const n = txt.trim().split(/\s+/);
  if (n.length < 3 || n.length > 4) return null;
  if (!n.every((x) => /^\d+$/.test(x))) return null;
  const [r, g, b, a = "255"] = n;
  return [+r, +g, +b, +a];
}

/**
 * Resuelve un valor que puede ser un color literal o el nombre de uno.
 * Los que no son ni una cosa ni otra (`"6"`, `"resource/icon_steam"`, `"0.03"`)
 * se devuelven tal cual: el esquema mezcla medidas y rutas con los colores.
 */
export function resolver(valor, colores, sinResolver) {
  const lit = colorDe(valor);
  if (lit) return lit;
  if (typeof valor === "string" && colores[valor]) return colores[valor];
  if (typeof valor === "string" && /^[A-Za-z]/.test(valor) && valor.includes(" ") === false
      && !valor.includes("/") && !/^\d/.test(valor) && sinResolver) {
    // Un nombre que parece de color y no está en la tabla: se apunta, porque es
    // un error del esquema y se quiere ver al hornear.
    sinResolver.add(valor);
  }
  return valor;
}

/** Recorre un bloque de BaseSettings resolviendo nombres de color a números. */
function resolverBloque(bloque, colores, sinResolver) {
  const o = {};
  for (const [k, v] of Object.entries(bloque)) {
    o[k] = typeof v === "object" ? resolverBloque(v, colores, sinResolver)
                                 : resolver(v, colores, sinResolver);
  }
  return o;
}

// ── LAS LETRAS ──────────────────────────────────────────────────────────────
//
// Una fuente del esquema no es una fuente: es una LISTA en orden de preferencia,
// y el comentario del propio archivo dice la regla:
//
//     // fonts are used in order that they are listed
//     // fonts listed later in the order will only be used if they fulfill a
//     // range not already filled
//     // if a font fails to load then the subsequent fonts will replace
//                                     TrackerScheme.res:186-189
//
// Y algunas entradas llevan `yres "600 767"`, que es **para qué altura de
// pantalla vale esa variante**. Es el mismo mecanismo que el `g_ResArray` de
// VGUI1 (`vgui_schememanager.cpp:108-128`, portado en `src/vgui/esquema.js`),
// pero escrito en el archivo en vez de en el código, y por rangos en vez de por
// escalones. `EngineFont` tiene cinco tamaños por altura y dos de repuesto sin
// rango, que valen para cualquiera.
/** Convierte el bloque `Fonts` en `{nombre: [variantes…]}`. */
export function leerFuentes(bloque) {
  const fuentes = {};
  for (const [nombre, variantes] of Object.entries(bloque ?? {})) {
    if (typeof variantes !== "object") continue;
    const lista = [];
    for (const clave of Object.keys(variantes).sort((a, b) => +a - +b)) {
      const v = variantes[clave];
      if (typeof v !== "object") continue;
      const f = { nombre: v.name ?? "", alto: +(v.tall ?? 0), grosor: +(v.weight ?? 0) };
      if (v.yres) {
        const [a, b] = String(v.yres).trim().split(/\s+/).map(Number);
        f.yres = [a, b];
      }
      if (v.antialias === "1") f.suavizada = true;
      if (v.dropshadow === "1") f.sombra = true;
      if (v.underline === "1") f.subrayada = true;
      if (v.symbol === "1") f.simbolos = true;
      lista.push(f);
    }
    fuentes[nombre] = lista;
  }
  return fuentes;
}

// ── LOS BORDES ──────────────────────────────────────────────────────────────
//
// Esto es lo que da el aspecto de las ventanas, y es más simple de lo que
// parece: un borde son cuatro lados, y cada lado una lista de líneas de un píxel
// con su color y su `offset`. `RaisedBorder` tiene el claro arriba y a la
// izquierda; `InsetBorder` lo tiene al revés. Son los dos biseles de toda la
// interfaz de Windows de 1998, y el esquema los nombra para cada control:
//
//     ButtonBorder  "RaisedBorder"      un botón sale hacia fuera
//     ComboBoxBorder "InsetBorder"      un desplegable está hundido
//                                     TrackerScheme.res:353-359
//
// Los alias se guardan aparte porque son indirecciones, no bordes: `BaseBorder`
// no existe, es otro nombre de `InsetBorder`.
/** Separa el bloque `Borders` en `{bordes, alias}`. */
export function leerBordes(bloque) {
  const bordes = {};
  const alias = {};
  for (const [nombre, v] of Object.entries(bloque ?? {})) {
    if (typeof v === "string") { alias[nombre] = v; continue; }
    const b = { lados: {} };
    if (v.inset) b.inset = String(v.inset).trim().split(/\s+/).map(Number);
    for (const lado of ["Left", "Right", "Top", "Bottom"]) {
      const l = v[lado];
      if (typeof l !== "object") continue;
      const lineas = [];
      for (const clave of Object.keys(l).sort((a, b2) => +a - +b2)) {
        const linea = l[clave];
        if (typeof linea !== "object") continue;
        lineas.push({
          color: linea.color ?? "",
          offset: String(linea.offset ?? "0 0").trim().split(/\s+/).map(Number),
          // El número de la clave NO es el orden: es el GROSOR en píxeles del
          // trazo, y `TitleButtonBorder` lo usa —su `Top` es la clave "4", una
          // línea de cuatro píxeles—. Guardarlo es lo que separa un marco de
          // ventana de un botón.
          grosor: +clave,
        });
      }
      b.lados[lado] = lineas;
    }
    bordes[nombre] = b;
  }
  return { bordes, alias };
}

// ── LAS CADENAS ─────────────────────────────────────────────────────────────
//
// `gameui_english.txt` es UTF-16 con BOM, como todos los `*_english.txt` de
// Valve. Leerlo como UTF-8 da una cadena con un cero entre cada letra: parece
// que funciona y no encuentra nada. Ya mordió una vez en `tools/menu.mjs:88-99`.
function leerCadenas(ruta) {
  if (!existsSync(ruta)) return { cadenas: {}, utf16: false, archivo: null };
  const crudo = readFileSync(ruta);
  const utf16 = crudo.length > 1 && crudo[0] === 0xff && crudo[1] === 0xfe;
  const texto = utf16 ? crudo.toString("utf16le") : crudo.toString("utf8");
  const cadenas = {};
  const re = /"([^"]+)"\s+"([^"]*)"/g;
  let m;
  while ((m = re.exec(texto))) {
    if (m[1] === "Language" || m[1] === "Tokens" || m[1] === "lang") continue;
    cadenas[`#${m[1]}`] = m[2];
  }
  return { cadenas, utf16, archivo: ruta };
}

// ── HORNEAR ─────────────────────────────────────────────────────────────────

if (!ME_HAN_LLAMADO) {
  // Importado desde una prueba: aquí se acaba.
} else {
if (!existsSync(RUTA_ESQUEMA)) {
  console.error(`No encuentro ${RUTA_ESQUEMA}. Pásame la carpeta del juego.`);
  process.exit(1);
}

const crudo = readFileSync(RUTA_ESQUEMA, "utf8");
const raiz = leerKeyValues(crudo);
const esquema = raiz.Scheme ?? raiz;

const colores = {};
for (const [k, v] of Object.entries(esquema.Colors ?? {})) {
  const c = colorDe(v);
  if (c) colores[k] = c;
}

const sinResolver = new Set();
const base = resolverBloque(esquema.BaseSettings ?? {}, colores, sinResolver);
const fuentes = leerFuentes(esquema.Fonts);
const { bordes, alias } = leerBordes(esquema.Borders);
const { cadenas, utf16, archivo } = leerCadenas(RUTA_CADENAS);

mkdirSync(SALIDA, { recursive: true });
const ficha = {
  de: "resource/TrackerScheme.res",
  colores, base, fuentes, bordes, alias, cadenas,
};
writeFileSync(`${SALIDA}/vgui2.json`, JSON.stringify(ficha, null, 1));

// ── LA CUENTA ───────────────────────────────────────────────────────────────

const nFuentes = Object.keys(fuentes).length;
const nVariantes = Object.values(fuentes).reduce((s, l) => s + l.length, 0);
const conYres = Object.values(fuentes).flat().filter((f) => f.yres).length;

console.log(`EL ESQUEMA DE VGUI2  (${RUTA_ESQUEMA})`);
console.log(`  colores        ${Object.keys(colores).length}`);
console.log(`  base settings  ${Object.keys(base).length} claves`);
console.log(`  fuentes        ${nFuentes} nombres, ${nVariantes} variantes, ${conYres} con rango de altura`);
console.log(`  bordes         ${Object.keys(bordes).length}, y ${Object.keys(alias).length} alias`);
console.log(`  cadenas        ${Object.keys(cadenas).length}${utf16 ? " (UTF-16, como debe ser)" : " (¡no era UTF-16!)"}`);
if (sinResolver.size) {
  console.log(`  sin resolver   ${[...sinResolver].join(", ")}`);
}
console.log(`\n  -> build/gatecity/vgui2.json`);

// ── LA PROCEDENCIA ──────────────────────────────────────────────────────────
//
// Misma regla que el resto de extractores: lo horneado dice de qué archivo salió.
const PROC = `${SALIDA}/PROCEDENCIA.md`;
if (existsSync(PROC)) {
  const marca = "## El esquema de VGUI2";
  const ya = readFileSync(PROC, "utf8");
  if (!ya.includes(marca)) {
    appendFileSync(PROC, `

${marca}

\`build/gatecity/vgui2.json\` sale de \`npm run vgui2\`, y de dos archivos del mod:

| de | qué sale |
| --- | --- |
| \`resource/TrackerScheme.res\` | ${Object.keys(colores).length} colores, ${Object.keys(base).length} ajustes base, ${nFuentes} fuentes y ${Object.keys(bordes).length} bordes |
| \`resource/gameui_english.txt\` | ${Object.keys(cadenas).length} cadenas de la interfaz, en UTF-16 |

**Lo que NO sale de aquí es la disposición**: el código de \`GameUI.dll\` no es
público y esas ventanas se construyen en C++, no con un \`.res\`. Dónde va cada
control está medido de capturas de pantalla, y eso se dice en el informe.

Esto es el esquema de **VGUI2** (las ventanas de Valve). El de **VGUI1** (los
paneles del mod) es \`vgui.json\` y sale de los \`*_textscheme.txt\`. No se mezclan.
`);
  }
}
}
