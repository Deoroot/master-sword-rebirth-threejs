// UN PERSONAJE DE PRUEBAS «UN POCO AVANZADO» — experimento 96.
//
//   npm run personaje                          Veteran, para gatecity y para el solitario
//   npm run personaje -- --mapa edana          con servidor, en la carpeta de Edana
//   npm run personaje -- --nombre Ana --genero female
//
// Escribe EL MISMO personaje en dos sitios, porque el juego los guarda en dos:
//
//   1. CON SERVIDOR: `build/partidas/<mapa>/personajes/<id>.json`, que es la
//      carpeta que abre `tools/servidor.mjs` (`CARPETA`, línea 50) con el
//      almacén de archivos del servidor (`src/red/archivos.js`). Se escribe
//      CON ese almacén y no con un `writeFile` propio: así sale con su respaldo
//      `.bak.json` y su renombrado atómico, como un guardado de partida.
//
//   2. EN SOLITARIO: el personaje vive en el IndexedDB del navegador
//      («mydra-personajes», `src/juego/almacen.js`), y Node no puede escribir
//      ahí. Se deja `build/personajes/<nombre>.json` con el ENVOLTORIO de
//      exportar (`exportar()`, el mismo del botón «export») y el juego lo
//      importa al abrir la página con `?personaje=<nombre>` — sólo en
//      desarrollo. Ver `src/dev/personajepruebas.js` y doc/PERSONAJE_96.md.
//
// ── Lo que NO es ───────────────────────────────────────────────────────────
//
// Master Sword no tiene nada parecido: un personaje se hace con
// `CreateChar()` y se sube matando. Esto es un ATAJO DE PRUEBAS y se dice: las
// habilidades se escriben directamente en el documento, que es lo que el
// servidor de la partida NO deja hacer al cliente (`_elegir`,
// src/red/partida.js: «si mandara el personaje, ponerse Swordsmanship a 100
// sería editar un JSON»). Aquí se edita el JSON porque es de pruebas, y por
// eso escribe en el disco del servidor y no por el cable.
//
// ── Por qué estos números y no otros ───────────────────────────────────────
//
// Cada objeto pide algo, y lo pide el GUION, no el catálogo: la tabla
// `REQUISITOS` de abajo lleva cada número con su archivo y su línea, y
// `test/personaje96.test.mjs` comprueba que la línea citada dice ese número.
// Las habilidades se eligen por encima de lo pedido y **por debajo de 45**,
// que es `CHAR_LEVEL_CAP` (cbase.h:142, `TOPE_APRENDIZAJE` en
// src/juego/stats.js): un personaje así PUEDE existir entrenando. Con más de
// 45 sería un personaje imposible, y probar con uno imposible mide otro juego.
//
// La vida y el maná NO se escriben a mano: salen de `derivadas(atributosDe())`,
// la misma cuenta que `Sesion._recortarVitales` usa para recortar. Escribir
// 500 a pelo y que el juego lo recortara a 480 sería un personaje que dice una
// cosa en el disco y otra en la pantalla.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { crearPersonaje, abrirPersonaje, VERSION, loQueLleva } from "../src/juego/personaje.js";
import { exportar } from "../src/juego/almacen.js";
import { atributosDe, derivadas, TOPE_APRENDIZAJE } from "../src/juego/stats.js";
import { habilidadDeGuion } from "../src/play/habilidad.js";
import { carga } from "../src/juego/inventario.js";

/** Los cuatro contenedores de partida: `reg.newchar.freeitems`, global.script:29. */
const CONTENEDORES = ["sheath_belt_holster", "sheath_back", "sheath_dagger", "pack_sack"];

/**
 * Lo que lleva. La armadura y el casco los pidió el usuario por su nombre; las
 * cuatro armas son una por habilidad de combate distinta, para poder probar
 * espada, hacha, arco y arma pequeña con el mismo personaje.
 */
export const OBJETOS = Object.freeze([
  "armor_pheonix55",       // Armor of the Phoenix
  "armor_helm_gray",       // Helmet of Stability
  "swords_blood_drinker",  // Blood Drinker — a dos manos, va en la mano
  "axes_dragon",           // Dragon Axe
  "bows_firebird",         // Phoenix Bow
  "smallarms_k_fire",      // Kharaztorant Fire Blade
]);

/** Lo que llega vestido. */
export const PUESTOS = Object.freeze(["armor_pheonix55", "armor_helm_gray"]);

/** La que va en la mano al entrar. */
export const EN_LA_MANO = "swords_blood_drinker";

/** «Oro de sobra». Un número redondo y nuestro, no del juego. */
export const ORO = 100000;

/**
 * Las habilidades, propiedad por propiedad. Lo que no esté aquí se queda como
 * lo deja `CreateChar` (potencia 1, parry 1, cada escuela 1).
 *
 * Las de arma van IGUALES en sus tres propiedades a propósito: el motor mira
 * DOS cosas distintas y así las dos dan el mismo número —
 *
 *   - `$get(ent_owner, skill.swordsmanship)` al sacar el arma, que es la
 *     MEDIA (`CStat::Value`, ver src/play/habilidad.js);
 *   - `reg.attack.reqskill` contra la COMPETENCIA, la propiedad 0
 *     (`GetSkillStat(StatProf, PropProf)`, giattack.cpp:313-316, con
 *     `PropProf = 0` cuando `reg.attack.stat` no nombra propiedad, :535-545).
 */
export const HABILIDADES = Object.freeze({
  swordsmanship: { proficiency: 40, balance: 40, power: 40 },
  axehandling: { proficiency: 35, balance: 35, power: 35 },
  archery: { proficiency: 30, balance: 30, power: 30 },
  smallarms: { proficiency: 25, balance: 25, power: 25 },
  parry: { proficiency: 25 },
  // El fuego por encima de 20 ESTRICTO: la armadura del fénix pregunta
  // `> 20` y no `>= 20` (armor_pheonix55.script:93). Con 20 justos no sale ni
  // el aviso de «no tienes bastante» (`< 20`, :92) ni el efecto: un hueco del
  // mod, y con 25 no se cae en él.
  spellcasting: { fire: 25, ice: 5, lightning: 5, divination: 5, affliction: 5 },
});

/**
 * Lo que pide cada objeto, CITADO. `que` dice qué se compara:
 *
 *   skill.<h>          `$get(ent_owner, skill.<h>)`: la media de la habilidad
 *   prof.<h>           la competencia (propiedad 0), que es lo que mira `reqskill`
 *   skill.spellcasting.fire   la escuela de fuego
 *   stat.strength      la fuerza, DERIVADA de las habilidades (`atributosDe`)
 *
 * `estricto` es para los `>` del guion: con `estricto` el mínimo NO basta.
 * `cita` es `archivo:línea` dentro de ../MSC/MSCScripts/scripts/, y la prueba
 * comprueba que en esa línea está escrito `numero`.
 */
export const REQUISITOS = Object.freeze([
  { objeto: "armor_pheonix55", que: "stat.strength", minimo: 40, cita: "items/armor_pheonix55.script:16",
    por: "ARMOR_STR_REQ; por debajo, effect_slow cada 10 s (items/armor_base.script:99, :175-185)" },
  { objeto: "armor_pheonix55", que: "skill.spellcasting.fire", minimo: 15, cita: "items/armor_pheonix55.script:48",
    por: "convierte en maná el daño de fuego" },
  { objeto: "armor_pheonix55", que: "skill.spellcasting.fire", minimo: 20, estricto: true, cita: "items/armor_pheonix55.script:93",
    por: "activa el elemento (y con 20 justos no hace nada, ver :92)" },
  { objeto: "swords_blood_drinker", que: "skill.swordsmanship", minimo: 30, cita: "items/swords_blood_drinker.script:12",
    por: "BASE_LEVEL_REQ, comprobado al sacarla (items/base_melee.script:70)" },
  { objeto: "swords_blood_drinker", que: "prof.swordsmanship", minimo: 32, cita: "items/swords_blood_drinker.script:117",
    por: "reqskill del ataque cargado" },
  { objeto: "swords_blood_drinker", que: "prof.swordsmanship", minimo: 34, cita: "items/swords_blood_drinker.script:140",
    por: "reqskill del segundo ataque cargado" },
  { objeto: "axes_dragon", que: "skill.axehandling", minimo: 20, cita: "items/axes_dragon.script:4",
    por: "BASE_LEVEL_REQ (MELEE_STAT axehandling, items/axes_greataxe.script:31)" },
  { objeto: "axes_dragon", que: "prof.axehandling", minimo: 24, cita: "items/axes_base_twohanded.script:119",
    por: "reqskill 4 + BASE_LEVEL_REQ 20 (la suma es la de :121)" },
  { objeto: "axes_dragon", que: "skill.spellcasting.fire", minimo: 20, cita: "items/axes_dragon.script:5",
    por: "BURN_LEVEL_REQ, el aliento de fuego (:53)" },
  { objeto: "bows_firebird", que: "skill.archery", minimo: 25, cita: "items/bows_firebird.script:6",
    por: "BASE_LEVEL_REQ, comprobado al sacarlo (items/base_ranged.script:67)" },
  { objeto: "smallarms_k_fire", que: "skill.smallarms", minimo: 15, cita: "items/smallarms_k_fire.script:2",
    por: "BASE_LEVEL_REQ" },
  { objeto: "smallarms_k_fire", que: "prof.smallarms", minimo: 19, cita: "items/smallarms_base.script:149",
    por: "reqskill 4 + BASE_LEVEL_REQ 15 (la suma es la de :151)" },
  { objeto: "smallarms_k_fire", que: "prof.smallarms", minimo: 17, cita: "items/smallarms_k_fire.script:128",
    por: "reqskill del cuchillo lanzado" },
]);

/** El número que el motor compararía, para un `que` de la tabla. */
export function valorPara(p, que) {
  if (que === "stat.strength") return atributosDe(p.habilidades).strength;
  if (que.startsWith("prof.")) {
    // `.prof` es la subhabilidad 0 (scriptcmds.cpp:1654, src/play/habilidad.js).
    return Number(habilidadDeGuion(p, `skill.${que.slice(5)}.prof`));
  }
  return Number(habilidadDeGuion(p, que));
}

/** Los requisitos que el personaje NO cumple. Vacío es lo bueno. */
export function incumplidos(p, requisitos = REQUISITOS) {
  const fuera = [];
  for (const r of requisitos) {
    const v = valorPara(p, r.que);
    const pasa = r.estricto ? v > r.minimo : v >= r.minimo;
    if (!pasa) fuera.push({ ...r, tiene: v });
  }
  return fuera;
}

/** El id: fijo por nombre, para que volver a generarlo PISE al anterior. */
export function idDePruebas(nombre) {
  const limpio = String(nombre).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!limpio) throw new Error(`«${nombre}» no deja ningún carácter para el id`);
  return `pruebas-${limpio}`;
}

/**
 * Fabrica el documento. Parte de `crearPersonaje` —la forma la pone el código
 * del juego, no esta herramienta— y sólo cambia lo que hay que cambiar.
 */
export function fabricar({ nombre = "Veteran", genero = "male", ahora = null } = {}) {
  const base = crearPersonaje({ nombre, genero, ahora });
  const p = {
    ...base,
    id: idDePruebas(nombre),
    oro: ORO,
    // EL 96: la armadura y el casco llegan PUESTOS (`puesto: true`, el campo que
    // trajo doc/ARMADURA_96.md), porque el panel del inventario todavía no mueve
    // objetos y no habría otra forma de ponérselos jugando.
    objetos: [...CONTENEDORES, ...OBJETOS].filter((id) => id !== EN_LA_MANO).map((id) =>
      PUESTOS.includes(id) ? { id, n: 1, puesto: true } : { id, n: 1 }),
    // EL 97: la Blood Drinker va SÓLO en la mano. En la versión 1 del registro
    // estaba también en `objetos` y quedaba duplicada (src/juego/personaje.js,
    // `VERSION`); `OBJETOS` la sigue nombrando porque es lo que LLEVA.
    manos: { derecha: EN_LA_MANO, izquierda: null },
  };
  for (const [h, props] of Object.entries(HABILIDADES)) {
    for (const [prop, valor] of Object.entries(props)) {
      if (!p.habilidades[h]?.[prop]) throw new Error(`la habilidad ${h}.${prop} no existe en el registro`);
      if (valor > TOPE_APRENDIZAJE) throw new Error(`${h}.${prop} = ${valor} pasa de CHAR_LEVEL_CAP (${TOPE_APRENDIZAJE})`);
      p.habilidades[h][prop] = { valor, exp: 0 };
    }
  }
  const d = derivadas(atributosDe(p.habilidades));
  p.vida = d.vidaMax;
  p.mana = d.manaMax;
  return p;
}

/** Comprueba el documento contra el catálogo horneado. Devuelve los problemas. */
export function contraElCatalogo(p, catalogo) {
  const porId = new Map(catalogo.objetos.map((o) => [o.id, o]));
  const problemas = [];
  // `loQueLleva`: la lista Y las manos (el peso es el de todo el `Gear`).
  for (const o of loQueLleva(p)) if (!porId.has(o.id)) problemas.push(`'${o.id}' no está en el catálogo`);
  const c = carga(loQueLleva(p).map((o) => ({ ...o, ficha: porId.get(o.id) })), derivadas(atributosDe(p.habilidades)).carga);
  if (c.pasado) problemas.push(`lleva ${c.peso} y puede ${c.capacidad}`);
  return { problemas, carga: c };
}

// ── la línea de órdenes ────────────────────────────────────────────────────

const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (esPrincipal) {
  const args = process.argv.slice(2);
  const valor = (n, porDefecto) => {
    const i = args.indexOf(`--${n}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : porDefecto;
  };
  const { MAPA_POR_DEFECTO, esNombreDeMapa } = await import("../src/play/mapa.js");
  const { AlmacenArchivos } = await import("../src/red/archivos.js");

  const MAPA = valor("mapa", MAPA_POR_DEFECTO);
  if (!esNombreDeMapa(MAPA)) { console.error(`«${MAPA}» no es un nombre de mapa`); process.exit(1); }
  const NOMBRE = valor("nombre", "Veteran");
  const GENERO = valor("genero", "male");
  if (!["male", "female"].includes(GENERO)) { console.error("--genero es male o female"); process.exit(1); }

  const p = fabricar({ nombre: NOMBRE, genero: GENERO });

  // El mismo cargador que el juego, antes de escribir nada: si avisa de algo,
  // el documento no tiene la forma que el juego espera.
  const { avisos } = abrirPersonaje(structuredClone(p));
  if (avisos.length) { console.error("el cargador avisa:", avisos); process.exit(1); }
  const fuera = incumplidos(p);
  if (fuera.length) {
    for (const r of fuera) console.error(`  NO cumple ${r.objeto}: ${r.que} ${r.estricto ? ">" : ">="} ${r.minimo} (tiene ${r.tiene}) — ${r.cita}`);
    process.exit(1);
  }
  const rutaCatalogo = "build/msr/objetos.json";
  if (existsSync(rutaCatalogo)) {
    const { problemas, carga: c } = contraElCatalogo(p, JSON.parse(await readFile(rutaCatalogo, "utf8")));
    if (problemas.length) { console.error("contra el catálogo:", problemas); process.exit(1); }
    console.log(`  carga         ${c.peso} de ${c.capacidad}`);
  } else {
    console.warn(`  sin ${rutaCatalogo}: no se comprueba que los objetos existan (npm run objetos)`);
  }

  // 1. Con servidor.
  const carpeta = `build/partidas/${MAPA}/personajes`;
  await new AlmacenArchivos({ carpeta }).escribir(p);
  // 2. En solitario: el envoltorio de «export», que el juego sabe importar.
  const solo = `build/personajes/${p.id.replace(/^pruebas-/, "")}.json`;
  await mkdir(dirname(solo), { recursive: true });
  await writeFile(solo, exportar(p), "utf8");

  const a = atributosDe(p.habilidades);
  console.log(`\n  ${p.nombre} (${p.id}), versión ${VERSION} del registro`);
  console.log(`  vida ${p.vida} · maná ${p.mana} · oro ${p.oro}`);
  console.log(`  atributos     ${Object.entries(a).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  console.log(`  requisitos    ${REQUISITOS.length} de ${REQUISITOS.length} cumplidos`);
  console.log(`\n  CON SERVIDOR  ${carpeta}/${p.id}.json`);
  console.log(`                npm run servidor${MAPA === MAPA_POR_DEFECTO ? "" : ` -- --mapa ${MAPA}`}`);
  console.log(`                y en el navegador: http://localhost:5173/?red=1`);
  console.log(`  EN SOLITARIO  ${solo}`);
  console.log(`                npm run dev, y abre http://localhost:5173/?personaje=${p.id.replace(/^pruebas-/, "")}`);
  console.log(`                (sólo en desarrollo: lo importa al IndexedDB y sale en «Choose your character»)\n`);
}

// Para quien lo importe sin ejecutarlo (la prueba): la raíz del proyecto.
export const RAIZ = fileURLToPath(new URL("..", import.meta.url));
