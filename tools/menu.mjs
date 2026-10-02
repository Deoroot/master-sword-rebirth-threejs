import { salidaComun, prepararComunes } from "./recursos.mjs";
// EL MENÚ PRINCIPAL DE MASTER SWORD: el fondo, el título y lo que dice cada opción.
//
//   npm run menu
//
// ── Qué se hornea ───────────────────────────────────────────────────────────
//
// El menú del juego no es una pantalla dibujada: son **cuatro archivos de texto
// y catorce imágenes**, y el motor los junta.
//
//   resource/gamemenu.res          las opciones, en orden, con su comando
//   resource/BackgroundLayout.txt  el mosaico del fondo, pieza por pieza
//   resource/background/*.tga      las doce piezas
//   resource/game_menu.tga         el título, y `_mouseover` para cuando pasas
//   gfx/shell/kb_def.lst           qué tecla hace qué de fábrica
//   gfx/shell/kb_act.lst           cómo se llama cada acción en la lista
//   gfx/shell/colors.lst           los colores de los avisos
//   sound/ui/*.wav                 los TRES sonidos que tiene toda la interfaz
//
// El fondo va en un mosaico y no en una imagen porque Half-Life no admitía
// texturas de más de 256 px: doce piezas de 256×256 puestas en cuadrícula. Las
// junto aquí para no tener que juntarlas en el navegador.
//
// ── Dos cosas que sólo se ven leyendo el `.res` ──────────────────────────────
//
// 1. **«Name Character» y «Options» llevan al MISMO sitio.** Las dos dicen
//    `"command" "OpenOptionsDialog"`. No es que nombrar al personaje esté en
//    las opciones: es que la entrada quedó a medias y apunta donde la de al
//    lado. Se porta así, con el aviso.
//
// 2. **La mitad de las entradas están comentadas**, incluidas «New Game»,
//    «Load Game» y «Save Game». En un juego que sólo se juega en servidor no
//    hay partida que guardar, y el menú lo dice tachando las opciones en vez
//    de borrarlas. Y las que quedan están renombradas: no es «Find Servers»,
//    es **«Visit a Kingdom»**.
//
// Y de siempre: **el lector es nuestro, el contenido no se copia.** Todo sale a
// `build/`, que está en `.gitignore`, y **no se mueve un byte a `public/`.**

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, appendFileSync } from "node:fs";

import { decodificarTga } from "../src/bsp/tga.js";
import { escribirPng } from "./png.mjs";

const ASSETS = process.argv[2] ?? "../MSC/assets/msr";
const SALIDA = salidaComun("menu");
prepararComunes();
const SND = salidaComun("snd/ui");

if (!existsSync(`${ASSETS}/resource/gamemenu.res`)) {
  console.error(`No encuentro ${ASSETS}/resource/gamemenu.res. Pásame la carpeta del juego.`);
  process.exit(1);
}

const leer = (r) => readFileSync(`${ASSETS}/${r}`, "utf8");

// ── 1. LAS OPCIONES ─────────────────────────────────────────────────────────
//
// `gamemenu.res` está en el formato de VGUI: bloques con llaves y pares de
// cadenas entre comillas. Lo que hay que respetar es que **el orden importa** y
// que los números de bloque tienen huecos (falta el 4, 5, 6, 10 y 12, que están
// comentados): la numeración es la del archivo, no la posición en pantalla.
function leerRes(texto) {
  // Fuera los comentarios de línea ANTES de nada. Si no, las seis entradas
  // comentadas entran como opciones y el menú sale con «New Game».
  const limpio = texto.replace(/^[ \t]*\/\/.*$/gm, "");
  const entradas = [];
  const re = /"(\d+)"\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(limpio))) {
    const cuerpo = m[2];
    const par = (k) => {
      const r = new RegExp(`"${k}"\\s*"([^"]*)"`, "i").exec(cuerpo);
      return r ? r[1] : null;
    };
    entradas.push({
      n: Number(m[1]),
      etiqueta: par("label") ?? "",
      comando: par("command") ?? "",
      soloEnJuego: par("OnlyInGame") === "1",
      noMulti: par("notmulti") === "1",
    });
  }
  return entradas;
}

const entradas = leerRes(leer("resource/gamemenu.res"));

// Los `#GameUI_*` son claves de traducción. El archivo es UTF-16 con BOM, que es
// lo que Valve usa para los `*_english.txt`, y leerlo como UTF-8 da una cadena
// con un cero entre cada letra: parece funcionar y no encuentra nada.
function leerTraducciones(ruta) {
  const crudo = readFileSync(`${ASSETS}/${ruta}`);
  const utf16 = crudo.length > 1 && crudo[0] === 0xff && crudo[1] === 0xfe;
  const texto = utf16 ? crudo.toString("utf16le") : crudo.toString("utf8");
  const m = {};
  const re = /"([^"]+)"\s+"([^"]*)"/g;
  let r;
  while ((r = re.exec(texto))) m[`#${r[1]}`] = r[2];
  return { m, utf16 };
}
const trad = leerTraducciones("resource/gameui_english.txt");
for (const e of entradas) e.texto = e.etiqueta.startsWith("#") ? (trad.m[e.etiqueta] ?? e.etiqueta) : e.etiqueta;

// ── 2. EL FONDO ─────────────────────────────────────────────────────────────
function leerDisposicion(texto) {
  const piezas = [];
  let resolucion = [800, 600];
  for (const linea of texto.split(/\r?\n/)) {
    const t = linea.trim();
    if (!t) continue;
    const campos = t.split(/\s+/);
    if (campos[0] === "resolution") { resolucion = [Number(campos[1]), Number(campos[2])]; continue; }
    // `<ruta> scaled <x> <y>`
    piezas.push({ ruta: campos[0], x: Number(campos[2]), y: Number(campos[3]) });
  }
  return { resolucion, piezas };
}
const disp = leerDisposicion(leer("resource/BackgroundLayout.txt"));

mkdirSync(SALIDA, { recursive: true });

const tgas = disp.piezas.map((p) => ({ ...p, tga: decodificarTga(readFileSync(`${ASSETS}/${p.ruta}`), p.ruta) }));
const anchoFondo = Math.max(...tgas.map((p) => p.x + p.tga.ancho));
const altoFondo = Math.max(...tgas.map((p) => p.y + p.tga.alto));
const fondo = new Uint8Array(anchoFondo * altoFondo * 4);
for (const p of tgas) {
  for (let y = 0; y < p.tga.alto; y++) {
    for (let x = 0; x < p.tga.ancho; x++) {
      const src = (y * p.tga.ancho + x) * 4;
      const dst = ((p.y + y) * anchoFondo + (p.x + x)) * 4;
      fondo[dst] = p.tga.rgba[src];
      fondo[dst + 1] = p.tga.rgba[src + 1];
      fondo[dst + 2] = p.tga.rgba[src + 2];
      fondo[dst + 3] = 255;
    }
  }
}
let bytes = escribirPng(`${SALIDA}/fondo.png`, fondo, anchoFondo, altoFondo);

// ── 3. EL LOGOTIPO, Y EL CRÉDITO QUE LLEVA DENTRO ───────────────────────────
//
// 240×32 y blanco puro con alfa. Por el tamaño parecía la placa de un botón y
// la monté detrás de cada opción; la primera captura lo desmintió de golpe: es
// el **logotipo «MASTER SWORD» con «ART BY: ANDERS FINÉR» debajo**, o sea el
// título del juego y el crédito del pintor del fondo, que es la misma persona.
// Va una vez y arriba, no siete veces detrás del texto.
//
// Las dos imágenes son blanco puro y sólo se diferencian en el alfa (1 907
// píxeles contra 4 452): no son dos dibujos, es el mismo encendiéndose. El
// color se lo pone el motor por encima.
const titulos = {};
for (const [clave, ruta] of [["titulo", "resource/game_menu.tga"], ["tituloEncima", "resource/game_menu_mouseover.tga"]]) {
  const tga = decodificarTga(readFileSync(`${ASSETS}/${ruta}`), ruta);
  const n = escribirPng(`${SALIDA}/${clave}.png`, tga.rgba, tga.ancho, tga.alto);
  bytes += n;
  let opacos = 0, blancos = 0;
  for (let i = 0; i < tga.rgba.length; i += 4) {
    if (tga.rgba[i + 3] <= 10) continue;
    opacos++;
    if (tga.rgba[i] === 255 && tga.rgba[i + 1] === 255 && tga.rgba[i + 2] === 255) blancos++;
  }
  titulos[clave] = {
    archivo: `menu/${clave}.png`, de: ruta, ancho: tga.ancho, alto: tga.alto,
    bpp: tga.bpp, conAlfa: tga.conAlfa, opacos, blancos, bytes: n,
  };
}

// ── 4. LOS SONIDOS. Tres, y los tres de un botón ────────────────────────────
mkdirSync(SND, { recursive: true });
const sonidos = {};
for (const [clave, w] of [["encima", "buttonrollover"], ["elegir", "buttonclick"], ["confirmar", "buttonclickrelease"]]) {
  const origen = `${ASSETS}/sound/ui/${w}.wav`;
  if (!existsSync(origen)) continue;
  copyFileSync(origen, `${SND}/${w}.wav`);
  sonidos[clave] = { archivo: `snd/ui/${w}.wav`, de: `sound/ui/${w}.wav` };
}

// ── 5. LAS TECLAS DE FÁBRICA ────────────────────────────────────────────────
//
// Esto es lo que contesta a «el 1 y el 2 en realidad podrían ser otras»: el
// juego no tiene el 1 escrito en ninguna parte del código. Lo tiene en
// `kb_def.lst`, que es una tabla de dos columnas, y el nombre bonito de cada
// acción está en `kb_act.lst`, que es otra.
function leerLst(texto) {
  const filas = [];
  for (const linea of texto.split(/\r?\n/)) {
    const t = linea.trim();
    if (!t || t.startsWith("//")) continue;
    // Los dos archivos tienen filas sin espacio entre las comillas
    // (`"MOUSE1""+attack"`), así que no vale partir por espacios.
    const m = /^"([^"]*)"\s*"([^"]*)"/.exec(t);
    if (m) filas.push([m[1], m[2]]);
  }
  return filas;
}
const porDefecto = leerLst(leer("gfx/shell/kb_def.lst"));
const nombres = Object.fromEntries(leerLst(leer("gfx/shell/kb_act.lst")).filter(([a]) => a !== "blank"));
const teclas = porDefecto.map(([tecla, comando]) => ({ tecla, comando, nombre: nombres[comando] ?? null }));

// Y los colores de los avisos, que es la cuarta tabla.
const colores = {};
for (const [clave, v] of leerLst(leer("gfx/shell/colors.lst").replace(/^([A-Z_]+)\s+([\d\s]+)$/gm, '"$1" "$2"'))) {
  const n = v.trim().split(/\s+/).map(Number);
  if (n.length === 3 && n.every((x) => Number.isFinite(x))) colores[clave] = n;
}

// ── CONTROLES ───────────────────────────────────────────────────────────────
const malos = [];
const control = (que, bien, detalle = "") => {
  if (!bien) malos.push(`${que} — ${detalle}`);
  console.log(`  ${bien ? "ok  " : "MAL "} ${que.padEnd(58)} ${detalle}`);
};
console.log("\n  CONTROLES");

// 1. Las opciones comentadas NO entran. Es el fallo fácil de este formato: un
//    `//` delante de un bloque de llaves no se lo salta ningún parser que sólo
//    busque llaves, y el menú sale con «New Game» y «Save Game», que no existen.
control("las cinco entradas comentadas no entran", entradas.length === 10,
  `${entradas.length} de 15 números, faltan ${[...Array(15)].map((_, i) => i + 1).filter((n) => !entradas.some((e) => e.n === n)).join(", ")}`);
control("y no hay ninguna de partida de un jugador",
  !entradas.some((e) => /NewGame|LoadGame|SaveGame/.test(e.comando)),
  "ni New/Load/Save Game");

// 2. Tres de las nueve están EN BLANCO a propósito: son los separadores del
//    menú (etiqueta y comando vacíos). Quien las filtre por «tiene comando»
//    junta las opciones y pierde el espaciado.
const blancas = entradas.filter((e) => !e.etiqueta && !e.comando);
control("tres entradas son separadores en blanco", blancas.length === 3,
  `números ${blancas.map((e) => e.n).join(", ")}`);

// 3. LA COINCIDENCIA QUE PARECE UN ERROR DE LECTURA Y NO LO ES.
const conOpciones = entradas.filter((e) => e.comando === "OpenOptionsDialog");
control("«Name Character» y «Options» comparten comando", conOpciones.length === 2,
  conOpciones.map((e) => `«${e.texto}»`).join(" y ") + " → OpenOptionsDialog");

// 4. Las traducciones. Si el UTF-16 se lee como UTF-8 esto sale a cero y las
//    etiquetas se quedan en `#GameUI_GameMenu_Quit`, que es lo que vería el
//    jugador.
control("el archivo de textos es UTF-16 y se ha leído como tal", trad.utf16,
  `${Object.keys(trad.m).length} claves`);
const sinTraducir = entradas.filter((e) => e.etiqueta.startsWith("#") && e.texto === e.etiqueta);
control("todas las claves #GameUI_* tienen texto", sinTraducir.length === 0,
  sinTraducir.length ? sinTraducir.map((e) => e.etiqueta).join(", ") : "las tres");

// 5. EL FONDO. Doce piezas y el mosaico cierra sin agujeros ni solapes.
// Y las piezas NO son doce cuadrados de 256: la última columna y la última fila
// vienen recortadas a 32×256 y 256×88, porque 800 no es múltiplo de 256. Quien
// dé por hecho el cuadrado deja 224 px negros a la derecha.
control("el fondo son doce piezas, y no todas del mismo tamaño",
  tgas.length === 12 && new Set(tgas.map((p) => `${p.tga.ancho}×${p.tga.alto}`)).size > 1,
  [...new Set(tgas.map((p) => `${p.tga.ancho}×${p.tga.alto}`))].join(", "));
{
  // El oráculo de verdad: que la suma de las áreas de las piezas sea
  // exactamente el área del lienzo. Con un solape o un hueco no cuadra, y un
  // mosaico mal montado se ve raro pero no da error.
  const area = tgas.reduce((s, p) => s + p.tga.ancho * p.tga.alto, 0);
  control("el mosaico cierra: sin huecos ni solapes", area === anchoFondo * altoFondo,
    `${area} px de piezas contra ${anchoFondo}×${altoFondo} = ${anchoFondo * altoFondo}`);
}
control(`la resolución declarada es ${disp.resolucion.join("×")} y el mosaico mide ${anchoFondo}×${altoFondo}`,
  disp.resolucion[0] === 800 && disp.resolucion[1] === 600,
  anchoFondo !== disp.resolucion[0] ? "el mosaico es MÁS GRANDE: el motor lo escala" : "");

// 6. El logotipo y su versión encendida. Son la MISMA imagen con distinto alfa,
//    y las dos son blanco puro: el color lo pone el motor. Un extractor que
//    mire sólo el tamaño diría que son iguales — pesan casi lo mismo.
control("el logotipo es una tira de 240×32 con alfa",
  titulos.titulo.ancho === 240 && titulos.titulo.alto === 32 && titulos.titulo.conAlfa,
  `${titulos.titulo.ancho}×${titulos.titulo.alto}, ${titulos.titulo.bpp} bits`);
control("los dos son BLANCO PURO: lo que cambia es sólo el alfa",
  titulos.titulo.blancos === titulos.titulo.opacos && titulos.tituloEncima.blancos === titulos.tituloEncima.opacos,
  `${titulos.titulo.opacos} píxeles encendidos contra ${titulos.tituloEncima.opacos} al iluminarse`);

// 7. LOS SONIDOS. Toda la interfaz del juego suena con tres archivos.
control("los tres sonidos de la interfaz están", Object.keys(sonidos).length === 3,
  Object.values(sonidos).map((s) => s.de.split("/").pop()).join(", "));

// 8. LAS TECLAS, que es lo que contesta a «podrían ser otras».
const buscar = (c) => teclas.filter((t) => t.comando === c).map((t) => t.tecla);
control("el 1 cicla armas y el 2 hechizos, PERO SON UN BIND",
  buscar("quickslot weapon").includes("1") && buscar("quickslot spell").includes("2"),
  `${buscar("quickslot weapon")} / ${buscar("quickslot spell")}`);
control("la 3 NO es munición: abre el inventario",
  teclas.some((t) => t.tecla === "3" && t.comando === "inventory"),
  `la munición es la ${buscar("quickslot arrow").join(" y la ")}`);
{
  const ranuras = teclas.filter((t) => /^\+quickslot \d+$/.test(t.comando));
  const conF = ranuras.filter((t) => /^F\d+$/.test(t.tecla));
  control("las doce ranuras están en F1..F12 y CINCO además en el 6..0",
    conF.length === 12 && ranuras.length === 17,
    `${ranuras.length} binds para 12 ranuras`);
}
control("y todas las acciones de ranura tienen nombre en kb_act.lst",
  teclas.filter((t) => /^\+quickslot/.test(t.comando)).every((t) => t.nombre),
  "«Quickslot 1 (hold to define)» es la única que dice cómo se graba");

// ── EL FICHERO ──────────────────────────────────────────────────────────────
const ficha = {
  procedencia: {
    assets: ASSETS,
    cuando: new Date().toISOString().slice(0, 10),
    nota: "Extraído de una instalación de Master Sword Rebirth. No se distribuye.",
  },
  entradas,
  fondo: {
    archivo: "menu/fondo.png",
    de: "resource/background/*.tga vía BackgroundLayout.txt",
    ancho: anchoFondo, alto: altoFondo,
    resolucionDeclarada: disp.resolucion,
    piezas: tgas.length,
  },
  ...titulos,
  sonidos,
  colores,
  teclas,
};
writeFileSync(`${SALIDA}/../menu.json`, JSON.stringify(ficha, null, 1));

// ── LA PROCEDENCIA ─────────────────────────────────────────────────────────
const PROC = salidaComun("PROCEDENCIA.md");
const MARCA = "## El menú";
if (existsSync(PROC) && !readFileSync(PROC, "utf8").includes(MARCA)) {
  appendFileSync(PROC, `
${MARCA}

\`menu.json\`, \`menu/*.png\` y \`snd/ui/*.wav\` los escribe \`node tools/menu.mjs\`.

El fondo son **doce piezas** de \`resource/background/\` juntadas en una imagen de
${anchoFondo}×${altoFondo} (Half-Life no admitía texturas de más de 256 px). Lo pintó
**Anders Finér**, y lo dice el propio logotipo: \`resource/game_menu.tga\` es la
tira «MASTER SWORD / ART BY: ANDERS FINÉR», con su gemelo \`_mouseover\` encendido.
Las opciones salen de
\`resource/gamemenu.res\` con los textos de \`resource/gameui_english.txt\`, que es
UTF-16.

Las teclas de fábrica salen de \`gfx/shell/kb_def.lst\` y sus nombres de
\`kb_act.lst\`: **son configuración, no código.** El \`1\` de ciclar armas es un
\`bind\`, y cualquiera lo tiene cambiado.

Vale lo de siempre: **está en \`build/\`, que está en \`.gitignore\`, y no se mueve
un byte a \`public/\`.**
`);
}

console.log(`\n  ${entradas.length} opciones, fondo de ${anchoFondo}×${altoFondo} en ${tgas.length} piezas, ` +
  `${Object.keys(sonidos).length} sonidos, ${teclas.length} teclas, ${(bytes / 1024).toFixed(0)} KB`);
console.log(`\n  escrito en      build/msr/menu.json\n`);
if (malos.length) {
  console.error(`  ${malos.length} controles en rojo:\n${malos.map((m) => `    ${m}`).join("\n")}`);
  process.exit(1);
}
