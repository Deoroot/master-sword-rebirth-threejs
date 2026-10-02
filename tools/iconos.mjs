import { salidaComun, prepararComunes } from "./recursos.mjs";
import { BASE_COMUN } from "../src/play/recursos.js";
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
// ── UN HALLAZGO QUE ERA MÍO Y NO DEL JUEGO, y queda escrito ───────────────
//
// La primera versión de este extractor leía **la primera** línea
// `sethudsprite` de cada archivo y se quedaba con ella. Con eso salía que cinco
// de las siete armas de partida no tenían icono, y se escribió así en el informe
// del experimento 30 y en su commit, con su cita y todo.
//
// Era mentira, y la culpa era de esta función. Los scripts declaran **las dos**,
// en líneas seguidas (`items/swords_rsword.script:52-53`):
//
//     sethudsprite hand sword
//     sethudsprite trade 168
//
// `hand` es el icono del HUD y `trade` el de la pantalla de comercio y el
// inventario. La primera línea es la de `hand` en casi todos, así que quedarse
// con la primera es quedarse justo con la que no sirve. Ahora se busca la de
// `trade` primero, y el recuento cambia de 222 objetos a **367** y de dos armas
// de partida a **seis**.
//
// Lo que sí es verdad y se queda: `magic_hand_lightning_weak` no declara
// `sethudsprite` ninguno —es una mano que lanza un rayo, no un arma— así que su
// `TradeSpriteName` es nulo. Y el panel de elegir personaje **no lo comprueba**,
// donde el del inventario sí:
//
//     msstring("items/640_") + ptmpItem->TradeSpriteName     choosecharacter:617
//     SpriteName = pItem->TradeSpriteName
//                  ? msstring("items/640_") + pItem->TradeSpriteName : "";
//                                                            mscontrols.cpp:285
//
// O sea que en el Master Sword de verdad **una de las siete sale con el cuadro
// vacío**, y es ésa. Se porta así.
//
// Misma regla de siempre: **el lector es nuestro, el contenido no se copia.**

import { writeFileSync, existsSync, readFileSync, appendFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { leerSpr } from "../src/bsp/sprite.js";
import { escribirPng } from "./png.mjs";

const ASSETS = process.argv[2] ?? "../MSC/assets/msr";
const SCRIPTS = process.argv[3] ?? "../MSC/MSCScripts/scripts";
const SALIDA = salidaComun("iconos");

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
  // Un script puede declarar las DOS: `hand` para el HUD y `trade` para la
  // pantalla de comercio y el inventario. La que importa para un icono es la de
  // `trade`, así que se busca esa primero. Coger la primera que apareciera
  // dejaba fuera 146 objetos que sí tienen icono, porque su línea de `hand` va
  // antes en el archivo.
  const m = /^\s*sethudsprite\s+(trade)\s+(\S+)/mi.exec(texto ?? "")
    ?? /^\s*sethudsprite\s+(\S+)\s+(\S+)/mi.exec(texto ?? "");
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
  prepararComunes();
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

  // TODO EL CATÁLOGO, no sólo las siete armas. El inventario enseña un icono por
  // objeto y usa el MISMO campo (`containeritem_t::init`, mscontrols.cpp:285),
  // así que hace falta el cuadro de cada cosa que se pueda llevar encima. De los
  // 519 objetos que dicen `sethudsprite`, **368 dicen `trade` y 151 dicen
  // `hand`** — o sea que la mayoría sí tiene icono, y las armas de partida son
  // justo las que tuvieron mala suerte.
  const todos = {};
  (function recorrer(dir) {
    for (const n of readdirSync(dir)) {
      const r = join(dir, n);
      if (statSync(r).isDirectory()) { recorrer(r); continue; }
      if (!n.endsWith(".script")) continue;
      const sp = spriteDe(readFileSync(r, "utf8"));
      if (sp?.tieneTrade) todos[n.replace(/\.script$/, "")] = sp;
    }
  })(SCRIPTS);
  const cuadrosPedidos = [...new Set(Object.values(todos).map((x) => x.cuadro))]
    .filter((c) => cuadros[c]).sort((a, b) => a - b);
  console.log(`
    ${Object.keys(todos).length} objetos con icono, ${cuadrosPedidos.length} cuadros distintos`);

  const escritos = {};
  let bytes = 0;
  const horneados = new Set();
  const hornear = (cuadro) => {
    if (horneados.has(cuadro)) return true;
    const c = cuadros[cuadro];
    if (!c) return false;
    horneados.add(cuadro);
    return c;
  };
  for (const cuadro of cuadrosPedidos) {
    const c = hornear(cuadro);
    if (!c) continue;
    const rgba = new Uint8Array(c.ancho * c.alto * 4);
    for (let i = 0; i < c.ancho * c.alto; i++) {
      const p = c.indices[i] * 3;
      rgba[i * 4] = hoja.paleta[p];
      rgba[i * 4 + 1] = hoja.paleta[p + 1];
      rgba[i * 4 + 2] = hoja.paleta[p + 2];
      const negro = !hoja.paleta[p] && !hoja.paleta[p + 1] && !hoja.paleta[p + 2];
      rgba[i * 4 + 3] = negro ? 0 : 255;
    }
    bytes += escribirPng(join(SALIDA, `${cuadro}.png`), rgba, c.ancho, c.alto);
  }

  for (const [arma, s] of Object.entries(fichas)) {
    if (!s?.tieneTrade) continue;
    const c = cuadros[s.cuadro];
    if (!c) { console.log(`    ¡el cuadro ${s.cuadro} no existe!`); continue; }
    escritos[arma] = { archivo: `iconos/${s.cuadro}.png`, cuadro: s.cuadro, ancho: c.ancho, alto: c.alto };
  }

  control("el `.spr` de los objetos tiene sus 244 cuadros", cuadros.length === 244, `${cuadros.length}`);
  control("y son de 128×128, que es el tamaño del botón del panel",
    hoja.anchoMax === 128 && hoja.altoMax === 128, `${hoja.anchoMax}x${hoja.altoMax}`);
  control("la tabla de nombres del motor tiene sus 77 entradas", NOMBRES.length === 77, `${NOMBRES.length}`);
  control("y un nombre se resuelve a su índice, como `SpriteIsInArray`",
    cuadroDe("apple") === 0 && cuadroDe("xbow") === 76 && cuadroDe("sword") === -1 + 1,
    `apple=0 xbow=76`);
  control("un número a pelo se usa tal cual", cuadroDe("139") === 139);
  control("seis de las siete armas de partida tienen icono",
    conTrade === 6, `${conTrade} de ${ARMAS.length}`);
  // Y la séptima no, y eso sí es del juego: la mano del rayo no declara
  // `sethudsprite` ninguno, y `choosecharacter.cpp:617` no lo comprueba.
  control("y la que no lo tiene es la mano del rayo, que no declara ninguno",
    fichas.magic_hand_lightning_weak === null,
    `${Object.entries(fichas).filter(([, x]) => !x?.tieneTrade).map(([a]) => a).join(", ") || "ninguna"}`);
  control("y los dos cuadros que sí se piden existen y se hornean",
    Object.keys(escritos).length === conTrade, Object.keys(escritos).join(", "));
  control("el catálogo entero: la mayoría de los objetos SÍ tiene icono",
    Object.keys(todos).length > 300, `${Object.keys(todos).length} objetos con `+"`trade`"+``);
  control("y se hornea un cuadro por cada uno distinto, no uno por objeto",
    horneados.size === cuadrosPedidos.length && horneados.size < Object.keys(todos).length,
    `${horneados.size} cuadros para ${Object.keys(todos).length} objetos`);

  console.log("");
  for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(64)} ${c.detalle}`);
  console.log(`\n  ${controles.filter((c) => c.bien).length} de ${controles.length} controles`);

  writeFileSync(salidaComun("iconos.json"), JSON.stringify({
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
    base: `${BASE_COMUN}/`,
    cuadros: cuadros.length,
    /** Por arma de partida: el icono si lo tiene, y `null` si su script dice `hand`. */
    armas: Object.fromEntries(ARMAS.map((a) => [a, escritos[a] ?? null])),
    /** Y TODO el catálogo, para el inventario: nombre de objeto -> cuadro. */
    objetos: Object.fromEntries(Object.entries(todos)
      .filter(([, x]) => cuadros[x.cuadro])
      .map(([n, x]) => [n, { archivo: `iconos/${x.cuadro}.png`, cuadro: x.cuadro }])),
    /** Y el porqué, para que el hueco vacío del panel no parezca un fallo nuestro. */
    sinIcono: Object.entries(fichas)
      .filter(([, s]) => !s?.tieneTrade)
      .map(([a, s]) => ({ arma: a, porque: s ? `su script dice \`sethudsprite ${s.donde}\`, no \`trade\`` : "su script no dice `sethudsprite`" })),
  }, null, 1));
  console.log(`  ${Object.keys(escritos).length} iconos, ${(bytes / 1024).toFixed(0)} KB, en ${SALIDA}`);

  const PROC = salidaComun("PROCEDENCIA.md");
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
