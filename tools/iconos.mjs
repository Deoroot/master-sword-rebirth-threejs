// LOS ICONOS DE LOS OBJETOS: 244 cuadros de 128×128 en un solo `.spr`.
//
//   npm run iconos
//
// La pantalla de elegir arma de Master Sword enseña un cuadro de 128×128 por
// arma, y todos salen del mismo archivo:
//
//     Weapon_MainBtnImg[i] = new CImageDelayed(
//         msstring("items/640_") + ptmpItem->TradeSpriteName, false, true, ix, iy, iw, ih);
//     Weapon_MainBtnImg[i]->SetFrame(ptmpItem->SpriteFrame);
//                                     vgui_choosecharacter.cpp:617-621
//
// `TradeSpriteName` es siempre `"allitems"` —está en el propio motor,
// `#define INV_SPRITE "allitems"` (shurispritedefs.h:3)— así que el archivo es
// `sprites/items/640_allitems.spr` y lo que cambia es el CUADRO.
//
// ── Cómo elige el cuadro un objeto ─────────────────────────────────────────
//
// El script del objeto dice `sethudsprite <dónde> <cuál>`:
//
//     if (Params[0] == "hand")  HandSpriteName  = INV_SPRITE;
//     else if (Params[0] == "trade") TradeSpriteName = INV_SPRITE;
//     int SpriteIndex = SpriteIsInArray(Params[1].c_str());
//     if (SpriteIndex != -1) SpriteFrame = SpriteIndex;
//     else                   SpriteFrame = atoi(Params[1]);
//                                     genericitem.cpp:1765-1782
//
// O sea que `<cuál>` puede ser un NOMBRE de los 77 de `SpriteArray`
// (shurispritedefs.h:5-84) o un número de cuadro a pelo. Y los dos caminos
// existen en los scripts de verdad: `sethudsprite hand sword` y
// `sethudsprite trade 47`.
//
// ── Y AQUÍ HAY UN FALLO DE LOS DATOS DEL JUEGO QUE SE VE EN PANTALLA ───────
//
// Mira otra vez las tres líneas de arriba: **`SpriteFrame` se pone siempre, pero
// `TradeSpriteName` sólo si el primer parámetro es `trade`.** De las siete armas
// de partida de Gate City:
//
//     swords_rsword              sethudsprite hand  sword
//     bows_treebow               sethudsprite trade 47
//     smallarms_rknife           sethudsprite hand  merldagger
//     axes_rsmallaxe             sethudsprite hand  176
//     blunt_hammer1              sethudsprite hand  item
//     magic_hand_lightning_weak  (ninguna)
//     polearms_qs                sethudsprite trade 139
//
// **Cinco de las siete dicen `hand`**, así que se quedan sin `TradeSpriteName` y
// la pantalla de elegir arma les pide `items/640_` a secas. Y ahí el panel de
// elegir personaje NO comprueba nada:
//
//     msstring("items/640_") + ptmpItem->TradeSpriteName     choosecharacter:617
//     SpriteName = pItem->TradeSpriteName
//                  ? msstring("items/640_") + pItem->TradeSpriteName : "";
//                                                            mscontrols.cpp:285
//
// La segunda línea sí lo comprueba; la primera no. O sea que en el Master Sword
// de verdad **cinco de las siete armas de partida salen sin icono**, con su
// cuadro vacío y su nombre debajo. Se porta así, y por eso este extractor saca
// sólo los cuadros que alguien pide de verdad con `trade` — que son dos.
//
// Misma regla de siempre: **el lector es nuestro, el contenido no se copia.**

import { writeFileSync, existsSync, readFileSync, appendFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

import { leerSpr } from "../src/bsp/sprite.js";
import { escribirPng } from "./png.mjs";

const ASSETS = process.argv[2] ?? "../MSC/assets/msr";
const SCRIPTS = process.argv[3] ?? "../MSC/MSCScripts/scripts";
const SALIDA = resolve("build/gatecity/iconos");

/**
 * Los 77 nombres de `SpriteArray`, en su orden, que ES el número de cuadro.
 * `shurispritedefs.h:5-84`. Son identificadores del motor, no contenido.
 */
export const NOMBRES = [
  "apple", "armor1", "armor2", "armor3", "axe", "backsheath", "battleaxe",
  "boarskin", "book", "bpot", "breastplate", "broadarrow", "chainmail",
  "crafted", "crestedana", "dragonsword", "dreadscythe", "ebook", "expbolt",
  "firearrow", "firemagic", "firemana", "gauntlets", "gold", "gpot", "greataxe",
  "hammer", "helm1", "helm2", "helm3", "hugger", "hvybackpack", "iceblade",
  "ironshield", "katana", "key", "leather", "letter", "log", "longbow",
  "longsword", "lostblade", "mace", "machete", "maul", "merldagger", "mhealth",
  "orcbow", "orionbow", "orionsword", "package", "platehelm", "plateleggins",
  "quiver", "ratpelt", "rdagger", "ring", "ringmail", "runeaxe", "runeshield",
  "rustyhammer", "scythe", "sheath1", "sheath2", "shortsword", "silverarrow",
  "skullblade", "smallaxe", "torch", "treebow", "warhammer", "watermagic",
  "watermana", "wclub1", "weaponsmithaxe", "woodenarrow", "xbow",
];

/** `SpriteIsInArray(name)`, y si no está, `atoi`. `genericitem.cpp:1776-1779`. */
export function cuadroDe(cual) {
  const i = NOMBRES.indexOf(String(cual ?? "").toLowerCase());
  if (i !== -1) return i;
  const n = parseInt(cual, 10);
  return Number.isFinite(n) ? n : 0;       // `atoi` de algo que no es un número da 0
}

/**
 * El `sethudsprite` de un script de objeto.
 *
 * Devuelve `{ donde, cual, cuadro, tieneTrade }`. `tieneTrade` es el fallo de
 * arriba: sin él el objeto no tiene icono en la pantalla de elegir arma.
 */
export function spriteDe(texto) {
  const m = /^\s*sethudsprite\s+(\S+)\s+(\S+)/mi.exec(texto ?? "");
  if (!m) return null;
  const donde = m[1].toLowerCase();
  const cual = m[2].replace(/^['"]|['"]$/g, "");
  return { donde, cual, cuadro: cuadroDe(cual), tieneTrade: donde === "trade" };
}

/** Busca el `.script` de un objeto por su nombre, en todo el árbol. */
function buscarScript(dir, nombre) {
  for (const n of readdirSync(dir)) {
    const r = join(dir, n);
    if (statSync(r).isDirectory()) { const x = buscarScript(r, nombre); if (x) return x; }
    else if (n === `${nombre}.script`) return r;
  }
  return null;
}

// ── LO QUE SE EJECUTA ───────────────────────────────────────────────────────
if (process.argv[1]?.endsWith("iconos.mjs")) {
  const spr = `${ASSETS}/sprites/items/640_allitems.spr`;
  if (!existsSync(spr)) {
    console.error(`No encuentro ${spr}. Pásame la carpeta del juego.`);
    process.exit(1);
  }
  mkdirSync(SALIDA, { recursive: true });

  const controles = [];
  const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });

  const hoja = leerSpr(spr);
  const cuadros = hoja.cuadros;
  console.log(`\n  ICONOS DE OBJETO  (${spr})\n`);
  console.log(`    ${cuadros.length} cuadros de hasta ${hoja.anchoMax}x${hoja.altoMax}, mezcla ${hoja.mezcla}`);

  // Las siete de `reg.newchar.weaponlist`, que es de donde salen los botones.
  // `global.script:26`.
  const ARMAS = "swords_rsword;bows_treebow;smallarms_rknife;axes_rsmallaxe;blunt_hammer1;magic_hand_lightning_weak;polearms_qs".split(";");
  const fichas = {};
  let conTrade = 0;
  for (const a of ARMAS) {
    const ruta = buscarScript(SCRIPTS, a);
    const s = ruta ? spriteDe(readFileSync(ruta, "utf8")) : null;
    fichas[a] = s;
    if (s?.tieneTrade) conTrade++;
    console.log(`    ${a.padEnd(26)} ${s ? `${s.donde} ${s.cual} -> cuadro ${s.cuadro}` : "sin sethudsprite"}` +
      `${s && !s.tieneTrade ? "   SIN ICONO en elegir arma (dice `hand`)" : ""}`);
  }

  // Sólo se hornean los cuadros que alguien pide con `trade`: los demás no se
  // enseñan en ningún sitio de este juego todavía.
  const escritos = {};
  let bytes = 0;
  for (const [arma, s] of Object.entries(fichas)) {
    if (!s?.tieneTrade) continue;
    const c = cuadros[s.cuadro];
    if (!c) { console.log(`    ¡el cuadro ${s.cuadro} no existe!`); continue; }
    const rgba = new Uint8Array(c.ancho * c.alto * 4);
    for (let i = 0; i < c.ancho * c.alto; i++) {
      const p = c.indices[i] * 3;
      rgba[i * 4] = hoja.paleta[p];
      rgba[i * 4 + 1] = hoja.paleta[p + 1];
      rgba[i * 4 + 2] = hoja.paleta[p + 2];
      // EL ALFA, y aquí hay una decisión NUESTRA que conviene decir.
      //
      // La hoja es `SPR_ADDITIVE` (`formato 1`), o sea que el motor la SUMA al
      // fotograma: el negro no aporta nada y por eso el fondo desaparece. Copiar
      // eso literalmente sería poner `alfa = max(r,g,b)`, y se probó: el arco de
      // Treebow está pintado en marrones de 44,12,4, así que sale al 17 % de
      // opacidad — un fantasma. En el juego no se ve así porque VGUI lo dibuja
      // sobre un panel oscuro y lo suma; sobre una página web no hay nada que
      // sumar.
      //
      // Así que el fondo —el negro puro, que son 11 180 de los 16 384 píxeles—
      // se hace transparente y lo demás opaco. El color no cambia; cambia que se
      // vea. Es la misma decisión que ya se tomó con el fondo de los paneles en
      // `paleta.js`, y por el mismo motivo.
      const negro = !hoja.paleta[p] && !hoja.paleta[p + 1] && !hoja.paleta[p + 2];
      rgba[i * 4 + 3] = negro ? 0 : 255;
    }
    const nombre = `${s.cuadro}.png`;
    bytes += escribirPng(join(SALIDA, nombre), rgba, c.ancho, c.alto);
    escritos[arma] = { archivo: `iconos/${nombre}`, cuadro: s.cuadro, ancho: c.ancho, alto: c.alto };
  }

  control("el `.spr` de los objetos tiene sus 244 cuadros", cuadros.length === 244, `${cuadros.length}`);
  control("y son de 128×128, que es el tamaño del botón del panel",
    hoja.anchoMax === 128 && hoja.altoMax === 128, `${hoja.anchoMax}x${hoja.altoMax}`);
  control("la tabla de nombres del motor tiene sus 77 entradas", NOMBRES.length === 77, `${NOMBRES.length}`);
  control("y un nombre se resuelve a su índice, como `SpriteIsInArray`",
    cuadroDe("apple") === 0 && cuadroDe("xbow") === 76 && cuadroDe("sword") === -1 + 1,
    `apple=0 xbow=76`);
  control("un número a pelo se usa tal cual", cuadroDe("139") === 139);
  control("EL FALLO DE LOS DATOS: sólo 2 de las 7 armas de partida tienen icono",
    conTrade === 2, `${conTrade} con \`trade\`, ${ARMAS.length - conTrade} con \`hand\``);
  control("y los dos cuadros que sí se piden existen y se hornean",
    Object.keys(escritos).length === conTrade, Object.keys(escritos).join(", "));

  console.log("");
  for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(64)} ${c.detalle}`);
  console.log(`\n  ${controles.filter((c) => c.bien).length} de ${controles.length} controles`);

  writeFileSync(resolve("build/gatecity/iconos.json"), JSON.stringify({
    procedencia: {
      assets: ASSETS, scripts: SCRIPTS,
      cuando: new Date().toISOString().slice(0, 10),
      nota: "Cuadros de sprites/items/640_allitems.spr de una instalación de Master Sword Rebirth. No se distribuye.",
      citas: [
        "vgui_choosecharacter.cpp:617-621  el botón de arma pide items/640_<TradeSpriteName> y un cuadro",
        "shurispritedefs.h:2-84  INV_SPRITE «allitems» y los 77 nombres de cuadro",
        "genericitem.cpp:1765-1782  sethudsprite: `hand` no pone TradeSpriteName, `trade` sí",
        "global.script:26  reg.newchar.weaponlist, las siete armas de partida",
      ],
    },
    base: "build/gatecity/",
    cuadros: cuadros.length,
    /** Por arma: el icono si lo tiene, y `null` si su script dice `hand`. */
    armas: Object.fromEntries(ARMAS.map((a) => [a, escritos[a] ?? null])),
    /** Y el porqué, para que el hueco vacío del panel no parezca un fallo nuestro. */
    sinIcono: Object.entries(fichas)
      .filter(([, s]) => !s?.tieneTrade)
      .map(([a, s]) => ({ arma: a, porque: s ? `su script dice \`sethudsprite ${s.donde}\`, no \`trade\`` : "su script no dice `sethudsprite`" })),
  }, null, 1));
  console.log(`  ${Object.keys(escritos).length} iconos, ${(bytes / 1024).toFixed(0)} KB, en ${SALIDA}`);

  const PROC = resolve("build/gatecity/PROCEDENCIA.md");
  const MARCA = "## Los iconos de los objetos";
  if (existsSync(PROC) && !readFileSync(PROC, "utf8").includes(MARCA)) {
    appendFileSync(PROC, `
${MARCA}

\`iconos.json\` y \`iconos/*.png\` los escribe \`node tools/iconos.mjs\` de
\`sprites/items/640_allitems.spr\`, que son 244 cuadros de 128×128. Se hornean
**sólo los que alguien pide de verdad**, que hoy son dos: las otras cinco armas de
partida dicen \`sethudsprite hand\` en vez de \`trade\` y en el propio juego salen
sin icono.

Vale lo de siempre: **está en \`build/\`, que está en \`.gitignore\`, y no se mueve
un byte a \`public/\`.**
`);
  }

  process.exit(controles.every((c) => c.bien) ? 0 : 1);
}
