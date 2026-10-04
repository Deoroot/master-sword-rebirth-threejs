// EL CENSO DE BICHOS de Gate City: quién hay, dónde, con qué modelo y con qué
// animación.
//
//   npm run gatecity:bichos
//
// Tres piezas que hasta ahora no se habían juntado:
//
//   el `.bsp`     dice DÓNDE y con qué rumbo: 69 entidades `msmonster_*`,
//                 `ms_npc` y `msworlditem_*`, cada una con un `defscriptfile`.
//   el `.script`  dice QUÉ: el modelo, el `bodypart` y las dos animaciones.
//   el `.mdl`     dice CÓMO se ve y cómo se mueve.
//
// ── Y por qué hace falta el paso del medio ─────────────────────────────────
//
// Porque **el `classname` de la entidad es decorativo**:
//
//     msmonster_skeleton   defscriptfile "monsters/spider"   -> una ARAÑA
//     msmonster_orcwarrior defscriptfile "monsters/goblin"    -> un GOBLIN
//
// Deducir el bicho del nombre de la clase da tres de cada cuatro equivocados, y
// no da error: da un mapa poblado de criaturas plausibles que no son las del
// juego. Es la misma trampa que `gl_overbright`, con otra ropa.
//
// Regla del 02, igual que siempre: se escribe el lector, lo extraído va a
// `build/`, y ni un byte pasa a `public/`.

import { writeFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";

import {
  leerBsp, leerModelos, leerTexinfo, leerEntidades, leerCaras, origen, aEscena,
  UNIDADES_POR_METRO as U,
} from "../src/bsp/lector.js";
import { leerFichaNpc, modeloYAnimaciones, leerRazas, relacionDeRazas, esEnemigo, RAZA_DEL_JUGADOR,
  MUERTES_DE_REPUESTO, muerteQueExiste, guionDeEntidad, atof } from "../src/bsp/script.js";
import { sueloBajo, sePuedeEstar } from "../src/bsp/arbol.js";
import { luzEnSuelo, colorDeAdorno } from "../src/bsp/luz.js";
import { tablasDeGamma, AJUSTES } from "../src/bsp/gamma.js";
import { leerMdl, TAM } from "../src/bsp/mdl.js";
import { extraerBicho, nombreArchivo, animacionesDelGuion } from "./bicho.mjs";
import { ACT, animacionDeParado } from "../src/play/actividad.js";
import { creablesDe } from "./creables.mjs";

import { mapaDeArgv, bspDe, salidaDe, scriptsDe } from "./mapa.mjs";
const MAPA = mapaDeArgv();
const RUTA = bspDe(MAPA);
const SCRIPTS = scriptsDe(MAPA);
const MODELOS = "../MSC/assets/msr/models";
const SALIDA = salidaDe(MAPA);
const TABLA = tablasDeGamma(AJUSTES).luz;

// Además de las que pida el script, estas por si acaso: son los nombres que usa
// medio `monsters/` y salen gratis si el modelo no las tiene.
const COMUNES = ["idle", "idle1", "walk", "run", "die", "death"];

const bsp = leerBsp(RUTA);
const entidades = leerEntidades(bsp);
const modelos = leerModelos(bsp);
const texinfos = leerTexinfo(bsp);
const carasDelMundo = leerCaras(bsp, modelos[0], texinfos);

// LA TABLA DE RAZAS, que es quien decide quién te ataca. 178 líneas de datos
// en `races.script`, y sin ella la única forma de saberlo sería mirarles la
// cara.
const razas = leerRazas(SCRIPTS);
if (!razas) { console.error(`  FALLO: no se puede leer ${SCRIPTS}/races.script`); process.exit(1); }

// LO QUE TAMBIÉN ES SUELO, y hasta hoy no lo era para este extractor.
//
// Tiene que ser **la misma lista que `SOLIDAS` de tools/gatecity.mjs**, la que
// entra en la malla de colisión. Cuando no coinciden, el mundo donde se colocan
// los bichos y el mundo donde caminan son dos mundos distintos: las cuatro
// `msmonster_giantrat` acabaron veinte unidades dentro de su propia
// `func_breakable` y no se movieron en cinco minutos, sin un solo error.
const SOLIDAS = new Set(["func_wall", "func_breakable"]);
const solidasConBrushes = entidades
  .filter((e) => SOLIDAS.has(e.classname ?? "") && /^\*\d+$/.test(e.model ?? ""))
  .map((e) => ({
    modelo: Number(e.model.slice(1)),
    origin: String(e.origin ?? "0 0 0").trim().split(/\s+/).map(Number),
  }));

// EL 63: `msnpc_` también, y no es un caso raro.
//
// Todos los `classname` de bicho del mod son la MISMA clase de C++:
//
//     LINK_ENTITY_TO_CLASS(ms_npc, CMSMonster);
//     LINK_ENTITY_TO_CLASS(msnpc_human1, CMSMonster);
//     LINK_ENTITY_TO_CLASS(msmonster_orcwarrior, CMSMonster);
//                                        msmonsterserver.cpp:38-59
//
// así que dejar fuera una familia entera no da un error: da menos gente. Gate
// City no tiene ni un `msnpc_*` y por eso nadie lo vio; **Edana tiene seis**, y
// se veía como que al pueblo le faltaban vecinos. Cuarta vez seguida —50, 60,
// 61, 63— que el fallo lo enseña el segundo mapa.
const ES_BICHO = /^(msmonster_|msnpc_|ms_npc$|msworlditem_)/;
const puestos = entidades.filter((e) => ES_BICHO.test(e.classname ?? ""));
console.log(`\n  entidades       ${puestos.length} de bicho o NPC en ${bsp.nombre}.bsp`);

// Y LO QUE SE DEJA FUERA SE DICE. Un filtro que descarta en silencio es un
// sitio donde cabe un pueblo entero sin que salte nada: los seis
// `msnpc_human1` de Edana estuvieron fuera del censo desde que se extrajo el
// mapa. Esto no arregla el filtro —eso es la lista de arriba—, hace que la
// próxima familia que falte se vea en la misma línea en que se hornea.
const descartadas = new Map();
for (const e of entidades) {
  const c = e.classname ?? "";
  if (ES_BICHO.test(c) || !/npc|monster/i.test(c)) continue;
  descartadas.set(c, (descartadas.get(c) ?? 0) + 1);
}
if (descartadas.size) {
  console.log(`  fuera del censo ${[...descartadas].map(([c, n]) => `${c} x${n}`).join(", ")}`);
  console.log("                  (spawners y clips van aparte; si aquí sale un bicho, el filtro se quedó corto)");
}

// --- 1. resolver cada entidad a su ficha ------------------------------------
const fichas = new Map();     // script -> ficha
const sinScript = new Map();
const sinModelo = new Map();
for (const e of puestos) {
  const s = guionDeEntidad(e);
  if (!s) { sinScript.set(e.classname, (sinScript.get(e.classname) ?? 0) + 1); continue; }
  if (fichas.has(s)) continue;
  // Con el MAPA (el 93): `game.map.name` decide de verdad en unos cuantos
  // guiones —el jefe goblin sólo es jefe en `goblintown`
  // (monsters/goblinchief.script:5-19)—, y sin decírselo esas fichas salen
  // con lo que dependa de él declarado dudoso.
  const f = leerFichaNpc(SCRIPTS, s, { mapa: MAPA });
  const m = modeloYAnimaciones(f);
  if (!f) { sinScript.set(s, (sinScript.get(s) ?? 0) + 1); continue; }
  if (!m) { sinModelo.set(s, (sinModelo.get(s) ?? 0) + 1); continue; }
  fichas.set(s, m);
}
console.log(`  scripts         ${fichas.size} resueltos de ${new Set(puestos.map(guionDeEntidad).filter(Boolean)).size}`);
if (sinScript.size) console.log(`    sin fichero   ${[...sinScript].map(([k, n]) => `${n}× ${k}`).join(", ")}`);
if (sinModelo.size) console.log(`    sin setmodel  ${[...sinModelo].map(([k, n]) => `${n}× ${k}`).join(", ")}`);

// --- 1b. LO QUE UN GUION PUEDE CREAR CON `createnpc` -----------------------
//
// «Any media used by createnpc <script_name> must be precached beforehand»
// (scriptcmds.cpp:2765). Aquí «precargado» es HORNEADO: la ficha, el modelo y
// el guion de lo creado tienen que estar en `build/<mapa>/` o el comando no
// tiene con qué hacerlo (`MundoDeCreados.crear` lo cuenta en `sinFicha`).
//
// Se parte de los guiones de las criaturas colocadas en ESTE mapa y de los de
// las armas del catálogo (`build/msr/armas.json`), que no son de ningún mapa:
// la Blood Drinker lanza su invocación se empuñe donde se empuñe. Y se sigue en
// cadena. Ver `tools/creables.mjs`, que dice también lo que no resuelve.
//
// Entran en `fichas` como una más, así que las vueltas de abajo —animaciones
// del guion, extracción del modelo— las tratan igual que a un bicho del mapa.
// Lo que no tiene modelo de verdad (`none`, `null.mdl`, un `PARAM1`) se cuenta
// y se deja fuera: son efectos sin cuerpo, y crearlos pide otra pieza.
const ARMAS_JSON = "build/msr/armas.json";
const idsDeArmas = existsSync(ARMAS_JSON)
  ? (JSON.parse(readFileSync(ARMAS_JSON, "utf8")).armas ?? []).map((a) => a.id) : [];
const censoCreables = creablesDe([
  ...[...fichas.keys()].map((ruta) => ({ ruta, de: "mapa" })),
  ...idsDeArmas.map((id) => ({ ruta: `items/${id}`, de: "arma" })),
], SCRIPTS);
// Y cuáles de ésos salen de un guion DEL MAPA (y no sólo de un arma): sus
// modelos se cargan al entrar, como los de los colocados. Los que sólo crea un
// arma se cargan cuando esa arma se empuña (`aPeticion`, abajo), que es el
// `precache` del motor: nueve megas de invocaciones no se le cobran a quien
// entra al mapa con una espada corta.
const creablesDelMapa = new Set(creablesDe(
  [...fichas.keys()].map((ruta) => ({ ruta, de: "mapa" })), SCRIPTS).creables.keys());
const creables = new Map();          // script -> { por }
const creablesSinModelo = [];
for (const [s, info] of censoCreables.creables) {
  let m = fichas.get(s) ?? null;
  if (!m) {
    let f = null;
    try { f = leerFichaNpc(SCRIPTS, s, { mapa: MAPA }); } catch { f = null; }
    m = f ? modeloYAnimaciones(f) : null;
    const ruta = m?.modelo ? `${MODELOS}/${m.modelo}` : null;
    if (!m || !ruta || !/\.mdl$/i.test(m.modelo) || /(^|\/)null\.mdl$/i.test(m.modelo) || !existsSync(ruta)) {
      creablesSinModelo.push(`${s} (${m?.modelo ?? "sin setmodel"})`);
      continue;
    }
    fichas.set(s, m);
  }
  creables.set(s, { por: [...new Set(info.por)] });
}
console.log(`\n  createnpc       ${creables.size} guiones creables con modelo ` +
  `(${[...creables.keys()].filter((s) => puestos.some((e) => guionDeEntidad(e) === s)).length} ya colocados en el mapa); ` +
  `${creablesSinModelo.length} sin modelo que hornear; raíces: ${new Set(puestos.map(guionDeEntidad).filter(Boolean)).size} guiones del mapa y ${idsDeArmas.length} armas`);
if (creablesSinModelo.length) console.log(`    sin modelo    ${creablesSinModelo.slice(0, 8).join(", ")}${creablesSinModelo.length > 8 ? `, y ${creablesSinModelo.length - 8} más` : ""}`);
if (censoCreables.sinResolver.size) {
  const nombres = new Map();
  for (const lista of censoCreables.sinResolver.values()) for (const n of lista) nombres.set(n, (nombres.get(n) ?? 0) + 1);
  console.log(`    sin resolver  ${[...nombres].map(([n, k]) => `${n} x${k}`).join(", ")} (el nombre del guion no es un literal ni una constante con ruta)`);
}

// --- 2. el `body` compuesto, que es lo que elige el hacha del enano ---------
//
// `setmodelbody i v` pone el submodelo `v` en el `bodypart` i. El número que
// `mallaDe()` pide es el de base mixta que el motor compone con las `base` del
// propio modelo, así que hay que abrir el `.mdl` para saberlo.
function cuerpoDe(rutaModelo, pares) {
  if (!pares?.length) return 0;
  const ruta = `${MODELOS}/${rutaModelo}`;
  if (!existsSync(ruta)) return 0;
  const m = leerMdl(ruta);
  let cuerpo = 0;
  for (const [i, v] of pares) {
    if (i >= m.nBodyparts) continue;
    const ob = m.offBodyparts + i * TAM.bodypart;
    const nModelos = m.buf.readInt32LE(ob + 64);
    const base = m.buf.readInt32LE(ob + 68);
    if (nModelos <= 1 || base <= 0) continue;
    cuerpo += (v % nModelos) * base;
  }
  return cuerpo;
}

// --- 2b. LAS ANIMACIONES QUE PIDE EL MAPA, que no están en ninguna ficha ----
//
// Experimento 78. Un `ms_npcscript` nombra sus propias animaciones en el
// `.bsp` —`actionanim` y `moveanim`— y el NPC al que se las pone no las
// declara en su guion: son del MAPA, no de la criatura. Así que la lista
// blanca de abajo, que sale de la ficha, **no las pedía nunca**, y ninguna
// animación de escena del juego se había horneado jamás.
//
// No daba error porque el visor cae a la secuencia 0: el NPC «hace» la escena
// quieto en su pose de reposo. Es el mismo caso que el goblin que atacaba sin
// animación, comentado quince líneas más abajo, con la diferencia de que ahí
// el nombre estaba en el guion y aquí está en el mapa, que es un sitio que
// esta herramienta no miraba para esto.
//
// Y no se vio en el 77 **por casualidad**: las dos escenas que mueven a Edrin
// piden `walk` y `run`, y su ficha ya nombraba las dos (`andando` y
// `ia.corriendo`). El valor de reposo otra vez; lo enseña el tercer mapa.
const animDeEscenas = new Map();   // script -> Set de nombres
for (const e of entidades) {
  if (e.classname !== "ms_npcscript" && e.classname !== "mstrig_act") continue;
  if (!e.target) continue;
  for (const p of puestos.filter((x) => x.targetname === e.target)) {
    const s = guionDeEntidad(p);
    if (!s || !fichas.has(s)) continue;
    if (!animDeEscenas.has(s)) animDeEscenas.set(s, new Set());
    for (const a of [e.actionanim, e.moveanim]) {
      if (a) animDeEscenas.get(s).add(String(a).toLowerCase());
    }
  }
}

// --- 2c. LAS ANIMACIONES QUE PIDE EL GUION, y no la ficha -------------------
//
// Experimento 93 (doc/HORNEADO_93.md). La lista blanca de abajo salía de la
// FICHA —`setidleanim`, `setmoveanim` del nacimiento y las `ANIM_*` que `iaDe`
// sabe leer— y un guion pide muchas más con `playanim`: la araña de Gate City
// salta con `playanim critical ANIM_LATCH_ATTACK` y
// `const ANIM_LATCH_ATTACK jumpmiss` (spider.script:80-83, :106), y `jumpmiss`
// no estaba en ninguna lista. El visor caía a la secuencia 0, el evento 600 del
// fotograma 22 —`frame_jump`— no salía nunca y la araña se quedaba congelada
// a medio salto con `CAN_HUNT 0`. Es el 78 con otra ropa: *una lista blanca
// sólo mira donde sabe mirar*, y el nombre estaba en otro evento.
//
// Los tres comandos que ponen una secuencia por NOMBRE en un monstruo
// (npcscript.cpp:1458-1555): `setidleanim <anim>`, `setmoveanim <anim>` y
// `playanim <tipo> <anim>` —el nombre es el SEGUNDO parámetro; con uno solo,
// `playanim break`, no hay nombre (:1491-1498)—. `setactionanim` está comentado
// en el motor (:58, :1480-1485) y no se mira.
//
// Se recorren TODOS los bloques del guion y de sus `#include` (los de
// `[client]` no, igual que `partirScript`), no sólo los del nacimiento: un
// `playanim` vive en el evento que lo usa. Y el parámetro se resuelve contra
// TODAS las asignaciones de la variable (`const`/`setvar`/`setvard`/`setvarg`/
// `local`), no sólo la primera, porque aquí la pregunta es «qué nombres puede
// llegar a pedir», no «cuál tiene al nacer». Lo que no se resuelve a un nombre
// —un `$función(...)`, un número— se cuenta y se dice.
//
// Pedir de más no rompe nada: `extraerBicho` sólo emite las que el MODELO trae
// (tools/bicho.mjs:259-274). Lo que cuesta es tamaño, y se mide.
const sinResolver = new Map();      // script -> Set de parámetros que no son nombre
const animDelGuion = new Map();     // script -> Set de nombres
for (const s of fichas.keys()) {
  const r = animacionesDelGuion(SCRIPTS, s);
  animDelGuion.set(s, r.nombres);
  if (r.sinResolver.size) sinResolver.set(s, r.sinResolver);
}

// --- 3. extraer cada (modelo, cuerpo) distinto ------------------------------
const quiere = new Map();   // clave -> Set de secuencias pedidas
const soloGuion = new Map(); // clave -> Set de las que SÓLO pide el guion (para medir)
const deClave = new Map();  // clave -> {modelo, cuerpo}
for (const [s, m] of fichas) {
  const cuerpo = cuerpoDe(m.modelo, m.cuerpos);
  const clave = `${nombreArchivo(m.modelo.replace(/\.mdl$/i, ""))}${cuerpo ? `_b${cuerpo}` : ""}`;
  if (!quiere.has(clave)) { quiere.set(clave, new Set(COMUNES)); deClave.set(clave, { modelo: m.modelo, cuerpo }); }
  // TODAS las animaciones que la ficha nombra, no sólo las dos de estar quieto y
  // andar. Esto faltaba, y no daba error: el goblin declara
  // `ANIM_ATTACK battleaxe_swing1_L` y `ANIM_DEATH die_fallback`, su modelo trae
  // las dos entre sus 36 secuencias, y como no se pedían **no se horneaban**.
  // El visor pedía un nombre que no estaba en el manifiesto y caía a la
  // secuencia 0, así que el goblin atacaba y se moría parado. Con tres
  // secuencias horneadas de 36 no hay consecuencia del golpe que se pueda ver.
  for (const a of [
    m.parado, m.andando, m.ia?.corriendo, m.ia?.golpe, m.ia?.muerte,
    m.ia?.esquiva, m.ia?.struck?.animacion, m.ia?.encogerse?.animacion,
  ]) if (a) quiere.get(clave).add(String(a).toLowerCase());
  // Y los cinco nombres de repuesto de la muerte, porque el motor los prueba
  // (`base_npc.script:280`) y hay que tener horneado el que gane.
  for (const a of MUERTES_DE_REPUESTO) quiere.get(clave).add(a);
  // Y las del mapa, de la vuelta de arriba.
  for (const a of animDeEscenas.get(s) ?? []) quiere.get(clave).add(a);
  m.clave = clave;
}
// Y las del guion, al final y aparte, para poder decir cuántas pone SÓLO él.
for (const [s, m] of fichas) {
  const q = quiere.get(m.clave);
  if (!soloGuion.has(m.clave)) soloGuion.set(m.clave, new Set());
  for (const a of animDelGuion.get(s) ?? []) if (!q.has(a)) { q.add(a); soloGuion.get(m.clave).add(a); }
}
// (Este bucle va DESPUÉS del de las fichas a propósito: si otra ficha con el
// mismo modelo ya nombraba la secuencia, no cuenta como «sólo del guion».)
{
  const n = [...animDelGuion.values()].reduce((a, v) => a + v.size, 0);
  const sr = [...sinResolver.values()].reduce((a, v) => a + v.size, 0);
  console.log(`\n  del guion       ${n} nombres de animación en ${animDelGuion.size} guiones ` +
    `(playanim/setidleanim/setmoveanim); ${sr} parámetros que no son un nombre`);
}

// Un ajuste no puede quedarse callado (apartado 5 de CLAUDE.md): se dice qué
// ha pedido el mapa y a quién, y se dice también cuando no pide nada.
{
  const pares = [...animDeEscenas].filter(([, v]) => v.size);
  const cuantas = pares.reduce((a, [, v]) => a + v.size, 0);
  console.log(`\n  del mapa        ${cuantas} animaciones pedidas por ms_npcscript en ${pares.length} guiones` +
    (pares.length ? "" : " (ninguna: este mapa no tiene escenas con animación)"));
  for (const [s, v] of pares) console.log(`    ${s.padEnd(26)} ${[...v].join(" ")}`);
}

// Las que entran SÓLO porque las pide el guion: ni la 0 ni las de ACT_IDLE,
// que `extraerBicho` emite siempre (tools/bicho.mjs:272-274).
const nuevasDelGuion = (clave, r) => (r.detalleSecuencias ?? [])
  .filter((x) => x.indice !== 0 && x.actividad !== ACT.IDLE && soloGuion.get(clave)?.has(x.nombre.toLowerCase()))
  .map((x) => x.nombre);
console.log(`\n  modelos         ${quiere.size} distintos (modelo + bodypart)`);
const emitidos = new Map();
for (const [clave, { modelo, cuerpo }] of deClave) {
  let r = null;
  try {
    r = extraerBicho(modelo, {
      cuerpo, quiero: quiere.get(clave), callar: true,
      salida: `${SALIDA}/bichos`, raizSalida: SALIDA,
      // ACT_IDLE va siempre, la nombre alguien o no: dieciséis de los sesenta
      // y nueve no la nombran y el motor la busca por aquí.
      actividades: [ACT.IDLE],
    });
  } catch (err) {
    console.error(`    FALLO: ${modelo}: ${err.message}`);
    process.exit(1);
  }
  if (!r) { console.log(`    FALTA         ${modelo}`); continue; }
  emitidos.set(clave, r);
  console.log(`    ${modelo.padEnd(26)} ${String(r.triangulos).padStart(5)} tri, ${String(r.huesos).padStart(3)} huesos, ` +
    `${String(r.secuencias.length).padStart(2)} sec emitidas, ${(r.bytes / 1024).toFixed(0).padStart(5)} KB · ` +
    `oráculo ${r.oraculo.caben}/${r.oraculo.de}, el peor a ${r.oraculo.peor.toFixed(1)} u`);
  const nuevas = nuevasDelGuion(clave, r);
  if (nuevas.length) console.log(`      + del guion  ${nuevas.join(" ")}`);
}
{
  let sec = 0, bichos = 0;
  for (const [clave, r] of emitidos) {
    const n = nuevasDelGuion(clave, r).length;
    sec += n; if (n) bichos++;
  }
  const kb = [...emitidos.values()].reduce((a, r) => a + r.bytes, 0) / 1024;
  console.log(`\n  sólo del guion  ${sec} secuencias horneadas en ${bichos} de ${emitidos.size} modelos; ` +
    `${kb.toFixed(0)} KB de modelos en total`);
}

// --- 4. dónde va cada uno, y con qué luz ------------------------------------
//
// La luz es la misma que la de los adornos y por la misma razón: `R_LightVec`
// muestrea UN luxel del suelo y `R_StudioSetupLighting` lo convierte en una
// intensidad escalar por un color normalizado, que multiplica el modelo entero.
// Para un bicho QUIETO eso es exacto; para uno que anda es el luxel de donde
// nació, y **se dice**: lo correcto es volver a muestrear al moverse, y eso pide
// el árbol BSP en el navegador, que hoy sólo está en Node.
let colocados = [];
let conLuz = 0, caidos = 0, colgados = 0, dentroDeRoca = 0;
const brillos = [];
const caidas = [];
for (const e of puestos) {
  const s = guionDeEntidad(e);
  const m = s ? fichas.get(s) : null;
  if (!m || !m.clave || !emitidos.has(m.clave)) continue;
  const o = origen(e);
  if (!o) continue;
  const ang = String(e.angles ?? "0 0 0").trim().split(/\s+/).map(Number);
  // LOS PIES EN EL SUELO, preguntándoselo al árbol BSP.
  //
  // El `origin` de una entidad de monstruo es donde lo dejó el mapeador, no
  // donde acaba. Sin esto, medido con el arnés de física, **22 de 69 no tenían
  // suelo debajo y 15 flotaban o estaban hundidos** — y eso no da error, da
  // bichos andando por el aire y medio metidos en el adoquín.
  //
  // CORRECCIÓN DEL 84: la conclusión es correcta y la razón que había escrita
  // aquí NO. Decía «el motor le hace un `DROP_TO_FLOOR` al nacer», y para un
  // `ms_npc` eso es falso: `CMSMonster::Spawn` no lo llama, y los dos
  // `DROP_TO_FLOOR` de `msmonsterserver.cpp` están en código de MOVIMIENTO
  // (`:688` dentro de `CheckLocalMove`, `:847` dentro de `MoveExec`). Quien los
  // baja es la gravedad: `pev->movetype = MOVETYPE_STEP` (`:170`).
  //
  // El resultado es el mismo y por eso la línea se queda, pero la razón importa,
  // porque un `DROP_TO_FLOOR` y la gravedad **no caen igual** donde el camino
  // está obstruido: el primero se rinde si tiene que bajar más de 256 unidades,
  // y la segunda se para en lo primero sólido. Si algún día un NPC aparece donde
  // no debe, el modelo a comparar es la gravedad y no un salto instantáneo.
  //
  // Y lo que da sentido a bajarlos a los PIES y no al centro: el casco de un
  // `ms_npc` tiene `mins.z = 0` y `maxs.z = m_Height`
  // —`UTIL_SetSize(pev, Vector(-(m_Width/2), -(m_Width/2), 0), ...)`,
  // msmonsterserver.cpp:244—, o sea que **su `origin` ya son sus pies**. La
  // misma función escribe `pev->view_ofs = Vector(0, 0, m_Height)` seis líneas
  // después, que es el ojo que corrigió el 81.
  //
  // Es exactamente lo que ya costó una ronda con el punto de llegada del
  // jugador, cuyo `origin` está 54 unidades sobre el suelo.
  // Y con las entidades que TAMBIÉN chocan, que es lo que faltaba: ver `SOLIDAS`
  // abajo. El árbol del mundo no sabe que hay una caja rompible ahí.
  const suelo = sueloBajo(bsp, o, { extras: solidasConBrushes });
  const pies = suelo === null ? o : [o[0], o[1], suelo];
  if (suelo !== null && Math.abs(o[2] - suelo) > 1) { caidos++; caidas.push(o[2] - suelo); }
  if (suelo === null) colgados++;
  if (!sePuedeEstar(bsp, [o[0], o[1], o[2] + 8])) dentroDeRoca++;
  const luxel = luzEnSuelo(carasDelMundo, bsp.lumps.luz.datos, pies);
  if (luxel) { conLuz++; brillos.push(Math.max(...luxel)); }
  colocados.push({
    clase: e.classname,
    // EL `targetname` DEL MAPA (el 67), que NO es el nombre que se lee en
    // pantalla: `nombre` es lo que dice su guion («Priest of Urdual») y esto es
    // con lo que el mapa le habla («priest»). Hacía falta porque los 18
    // `ms_npcscript` de Edana nombran a su NPC por aquí, y sin esto la mitad de
    // las misiones del pueblo no tenían a quién dirigirse.
    objetivo: e.targetname ?? null,
    // LOS CUATRO PARÁMETROS CON LOS QUE EL MAPA LE HABLA AL GUION (el 82).
    //
    // `params` no es una clave que el motor entienda por sí misma: es **el
    // cuarto argumento de `game_postspawn`**, y lo interpreta el guion del
    // propio NPC. Los cuatro salen de aquí, en este orden:
    //
    //     msstringlist Parameters;
    //     Parameters.add(m_title);
    //     Parameters.add(FloatToString(m_DMGMulti));
    //     Parameters.add(FloatToString(m_HPMulti));
    //     Parameters.add(m_addparams);
    //     CallScriptEvent("game_postspawn", &Parameters);
    //                                       msmonsterserver.cpp:284-290
    //
    // Y los dos valores de reposo son del motor y no nuestros, puestos justo
    // encima de esas líneas (:273-280): un `title` vacío vale **`"default"`** y
    // un `params` vacío vale **`"none"`**, que es la cadena que el guion
    // compara (`if ( PARAM4 isnot 'none' )`, base_self_adjust.script:45). Si
    // aquí se pusiera `null` o `""`, esa condición sería cierta y todos los
    // bichos del juego entrarían en el reparto con una lista vacía.
    //
    // Los multiplicadores los filtra el propio `KeyValue` **y sólo los coge si
    // son mayores que 1** (:396-406), con `atof`, que no es `Number` — ésa es
    // la del 79, y por eso se usa el `atof` de `script.js` y no `parseFloat`
    // suelto. Por debajo de 1 el motor ni los guarda, así que el valor que
    // llega al evento es el 1 de `CMSMonster::PostSpawn` (:277-280).
    //
    // Y los CUATRO son **cadenas**, porque en este lenguaje un parámetro lo es
    // siempre. Los dos números pasan por
    //
    //     #define FloatToString( a ) UTIL_VarArgs( "%.2f", a )
    //                                            sharedutil.h:49
    //
    // así que lo que el guion lee no es `1` sino **`"1.00"`**. Da igual para
    // `if ( L_IN_DMGMULTI > 1 )`, que compara números, y no da igual para
    // cualquier `equals`: por eso se hornea con sus dos decimales y no se
    // «limpia». Horneamos lo que el evento recibe, no lo que es cómodo leer.
    postspawn: {
      titulo: e.title || "default",
      dmgmulti: (atof(e.dmgmulti) > 1 ? atof(e.dmgmulti) : 1).toFixed(2),
      hpmulti: (atof(e.hpmulti) > 1 ? atof(e.hpmulti) : 1).toFixed(2),
      params: e.params || "none",
    },
    script: s,
    clave: m.clave,
    nombre: m.nombre,
    hp: m.hp,
    // El alto declarado por el script, que es lo que hay que usar para saber
    // dónde tiene los ojos y para la cápsula del día que se muevan.
    ancho: m.ancho, alto: m.alto,
    parado: m.parado, andando: m.andando,
    // La familia de piel. El script da un rango —`$rand(1,6)` para los enanos—
    // y aquí se elige con el propio `origin`, no con `Math.random()`: dos
    // ejecuciones tienen que dar el mismo pueblo o una captura no se puede
    // volver a sacar.
    piel: m.piel
      ? m.piel.min + (Math.abs(Math.round(o[0]) * 31 + Math.round(o[1]) * 17 + Math.round(o[2]) * 7)
          % (m.piel.max - m.piel.min + 1))
      : 0,
    unidades: o,
    pies,
    escena: aEscena(pies),
    // El yaw de GoldSrc es `angles[1]` y gira alrededor de +Z; en ejes de
    // Three.js eso es −Y, y el modelo mira a +X con yaw 0.
    yaw: (ang[1] || 0),
    luz: colorDeAdorno(luxel, TABLA),
    // LA FICHA DE COMBATE, y con ella la respuesta a «¿éste me ataca?».
    //
    // No se deduce del aspecto ni de `CAN_HUNT`: la da la tabla de razas de
    // `races.script` contra la raza del jugador, que el motor devuelve a
    // fuego como `human` (script.cpp:1546). En Gate City salen 33 hostiles de
    // 69, y los otros 36 no son un descuido: 25 humanos, 4 ratas y 1 guardia
    // que RECELAN —sólo atacan si les atacas— y 3 aliados.
    ia: m.ia,
    relacion: relacionDeRazas(razas, m.ia?.raza, RAZA_DEL_JUGADOR),
    hostil: esEnemigo(relacionDeRazas(razas, m.ia?.raza, RAZA_DEL_JUGADOR)),
    // EL APARECEDOR, y sin esto 38 de los 69 estaban mal desde el experimento 07.
    //
    // Una entidad de bicho con `spawnarea` **no es un monstruo**: es la ficha que
    // usará su área, y el motor la borra en cuanto la registra:
    //
    //   CMSMonster::Spawn:     if (m_iszMonsterSpawnArea.len()) {
    //                            SetBits(pev->effects, EF_NODRAW); return; }   :228
    //   CMSMonster::Activate:  if (!m_fSpawnOnTrigger) SUB_Remove();           :129
    //
    // En Gate City son **38 de 69**, y son todos los hostiles: los 8 goblins, los
    // 22 enanos zombi, las 3 arañas, el cofre y las 4 crías. Lo que el jugador ve
    // no es un pueblo con monstruos de pie: es un pueblo donde a los **3
    // segundos** aparecen (`nextthink = ltime + 3.0`, msmapents.cpp:744) y, al
    // matarlos, **vuelven** — que es el «monster respawn» que el README lleva
    // apuntado como pendiente desde el 28.
    //
    // El sitio NO se sortea: ninguna de las 16 áreas de Gate City pone
    // `spawnloc 1`, y `SPAWNLOC_FIXED` es el cero por omisión, así que aparecen
    // **en el origen de su propia plantilla** — o sea justo donde el censo ya los
    // ponía. La posición estaba bien; lo que faltaba era el cuándo y el volver.
    aparecedor: e.spawnarea ? {
      area: e.spawnarea,
      // `if (!m_Lives) m_Lives = -1; //zero == infinite lives` (:202-203). 16 de
      // las 38 no dicen `lives` y por tanto vuelven para siempre.
      vidas: e.lives === undefined ? -1 : (Number(e.lives) || -1),
      // `RANDOM_FLOAT(delaylow, delayhigh)` al morir (msmapents.cpp:987). De 1-2 s
      // en las bolsas de crías a 300-500 s en los goblins.
      esperaMin: Number(e.delaylow ?? 0) || 0,
      esperaMax: Number(e.delayhigh ?? 0) || 0,
      // `if (!m_SpawnChance) m_SpawnChance = 100.0` (:204-205). Las 38 de Gate
      // City dicen 100, así que este camino no se ejerce aquí — se porta con su
      // cita y con una prueba que lo ejerce a mano, o sería código muerto sin
      // comprobar.
      probabilidad: e.spawnchance === undefined ? 100 : (Number(e.spawnchance) || 100),
      // EL NOMBRE DE LA FICHA (el 68). `MSQuery` despierta UNA ficha, y la busca
      // por la entidad de plantilla, o sea por su `targetname` (msmapents.cpp:
      // 1302-1315). Sin esto no hay forma de decirle «tú, el jefe, sal ya».
      nombre: e.targetname ?? null,
      // `spawnstart` (el 68). **La clave hace lo CONTRARIO de lo que suena:**
      //
      //   else if (FStrEq(pkvd->szKeyName, "spawnstart"))
      //     m_fSpawnOnTrigger = (atoi(pkvd->szValue)) ? true : false;   :827-844
      //
      // o sea `spawnstart 1` = «NO salgas hasta que te llamen», consumido en
      //
      //   if (spawnontrigger && !triggered && lives == livesleft) continue;  :1210
      //
      // Encima de esas líneas hay **cuatro intentos de Thothie de arreglar el
      // nombre, comentados uno debajo de otro** («various attempts to force
      // monster spawn to spawnstart 1 - fail»), así que el nombre al revés es
      // deliberado a estas alturas: lo que se porta es lo que hace el código.
      //
      // Ojo a la condición de la tercera mitad: `lives == livesleft`, o sea que
      // esto sólo frena la PRIMERA aparición. Una vez ha salido y ha muerto,
      // vuelve por su cuenta sin que nadie la llame.
      porDisparo: Boolean(Number(e.spawnstart ?? 0)),
      // `perishtarget` (el 68), que este mismo archivo daba por NO portado —
      // porque ninguna de las 38 plantillas de Gate City lo usa, y las de Edana
      // sí. Sexta vez que el hueco lo enseña el segundo mapa.
      //
      //   else if (lives > 0 && !livesleft)
      //     FireTargets(STRING(pMonsterData->perishtarget), ...);     :989-990
      //
      // Va en `RespawnMonster`, o sea en la rama de «no te repongo»: se dispara
      // UNA vez, cuando muere la última vida. No confundir con `fireallperish`,
      // que es del área entera y ya estaba.
      alPerecer: e.perishtarget ?? null,
    } : null,
    // `killtarget` DEL MONSTRUO (el 68), que **no mata: dispara**.
    //
    //   //MAR2008b fire targets here instead of in death fade, in case gibs
    //   if (m_iszKillTarget.len() > 0)
    //     FireTargets(m_iszKillTarget, this, this, USE_TOGGLE, 0);   :2568-2569
    //
    // Es una clave de `CMSMonster` y NO la `killtarget` de `CBaseDelay`, que sí
    // borra entidades (`SUB_UseTargets`, subs.cpp:289-302). Dos claves con el
    // mismo nombre y efectos opuestos según en qué entidad estén; se llama
    // `alMorir` aquí para que no se pueda confundir con `matar`, que es la otra.
    //
    // Se dispara en CADA muerte del bicho y no sólo en la última, porque está en
    // el camino de la muerte y no en el del aparecedor. Con `lives 1` da igual;
    // con vidas de sobra, no.
    //
    // En Edana es el jefe jabalí avisando a `boarsdead`, que es el `ms_npcscript`
    // que le cuenta al viejo del huerto que ya está hecho.
    alMorir: e.killtarget ?? null,
  });
}
// --- 2b. las áreas de aparición -------------------------------------------
//
// `spawnstart 1` es `bSpawnImmediately` y **ninguna de las 16 pone
// `spawntrigger`**, así que las 16 arrancan activas: `m_fActive = true` y
// `nextthink = ltime + 3.0` (msmapents.cpp:741-744). El primer bicho de cada área
// sale a los 3 s y los siguientes cada 0,2 s (`flNextSpawnTime`, :1213).
const ES_AREA = /^(msarea_monsterspawn|ms_monsterspawn)$/;
const areas = entidades.filter((e) => ES_AREA.test(e.classname ?? "")).map((e) => {
  const o = origen(e);
  return {
    nombre: e.targetname ?? null,
    clase: e.classname,
    // `spawnloc`: 0 fijo, 1 al azar dentro del volumen. Ninguna de Gate City lo
    // dice, y el cero es el valor por omisión (`m_SpawnLoc` sin inicializar en
    // una entidad que nace a ceros), así que las 16 son FIJAS. Se lee de todas
    // formas: un mapa futuro sí puede decir 1, y entonces el volumen importa.
    sorteaSitio: Number(e.spawnloc ?? 0) === 1,
    // `spawnstart` -> `bSpawnImmediately`; `spawntrigger` -> `m_fSpawnOnTrigger`.
    deGolpe: Number(e.spawnstart ?? 0) === 1,
    porDisparo: Boolean(Number(e.spawntrigger ?? 0)),
    // `fireallperish`: lo que se dispara cuando TODAS se quedan sin vidas.
    alAcabarse: e.fireallperish ?? null,
    unidades: o ?? null,
    escena: o ? aEscena(o) : null,
    modelo: /^\*\d+$/.test(e.model ?? "") ? Number(e.model.slice(1)) : null,
  };
});
const porArea = new Map();
for (const c of colocados) if (c.aparecedor) porArea.set(c.aparecedor.area, (porArea.get(c.aparecedor.area) ?? 0) + 1);
const sinArea = [...porArea.keys()].filter((n) => !areas.some((a) => a.nombre === n));
console.log(`\n  areas           ${areas.length} de aparición ` +
  `(${areas.filter((a) => a.modelo !== null).length} de volumen, ${areas.filter((a) => a.modelo === null).length} de punto); ` +
  `${areas.filter((a) => a.sorteaSitio).length} sortean el sitio`);
console.log(`    plantillas    ${colocados.filter((c) => c.aparecedor).length} de ${colocados.length} bichos son FICHA de un área y no un monstruo de pie`);

// UNA PLANTILLA SIN ÁREA: el motor avisa y SIGUE, y nosotros también.
//
// Hasta aquí esto paraba el horneado, con este motivo escrito al lado: «el
// motor lo avisa por consola y sigue; aquí se para, porque un bicho que no
// existe no se ve por ningún lado». El motivo era bueno y la regla, de un
// solo mapa: en Gate City no pasa nunca, y en Edana hay una plantilla que
// apunta a `patron9`, un área que el mapa no tiene. Con eso, la extracción de
// los NPC de Edana no llegaba al final.
//
// Y lo que hace el motor está escrito, `msmonsterserver.cpp:106-130`:
//
//     while ((peSpawnArea = FIND_ENTITY_BY_TARGETNAME(peSpawnArea, m_iszMonsterSpawnArea)) ...)
//     if (SpawnsFound) { ... } else
//         ALERT(at_console, "ERROR: msarea_monsterspawn named %s NOT FOUND\n", ...);
//     if (!m_fSpawnOnTrigger) SUB_Remove();
//
// Avisa, no aparece a nadie y **borra la plantilla**. O sea que el mapa se
// juega con ese bicho ausente, y portarlo es dejarlo ausente — no pararse.
//
// El control que SÍ se queda es otro, y no es un umbral: si **ninguna**
// plantilla encuentra su área, no es un mapa con una errata, es que estamos
// leyendo mal los nombres. Eso sigue parando.
const plantillas = colocados.filter((c) => c.aparecedor);
const huerfanas = plantillas.filter((c) => sinArea.includes(c.aparecedor.area));
if (sinArea.length) {
  console.log(`    sin área      ${huerfanas.length} plantilla(s) apuntan a un área que no está ` +
    `(${sinArea.join(", ")}): el motor las borra al cargar y aquí también`);
}
if (plantillas.length && huerfanas.length === plantillas.length) {
  console.error(`  FALLO: NINGUNA de las ${plantillas.length} plantillas encuentra su área. ` +
    `Eso no es una errata del mapa: es que los nombres se están leyendo mal.`);
  process.exit(1);
}
// Se van de la lista, como las borra el motor. Contadas arriba, no en silencio.
if (huerfanas.length) {
  const fuera = new Set(huerfanas);
  colocados = colocados.filter((c) => !fuera.has(c));
}
brillos.sort((a, b) => a - b);
console.log(`\n  colocados       ${colocados.length} de ${puestos.length} entidades`);
caidas.sort((a, b) => a - b);
console.log(`    al suelo      ${caidos} cayeron más de 1 unidad (mediana ${caidas.length ? caidas[caidas.length >> 1].toFixed(0) : "-"}, ` +
  `la mayor ${caidas.length ? caidas[caidas.length - 1].toFixed(0) : "-"}); ${colgados} sin suelo debajo; ` +
  `${dentroDeRoca} con el origin dentro de la roca`);
console.log(`    luz           ${conLuz} con suelo con mapa de luz debajo; luxel del suelo: ` +
  `mediana ${brillos.length ? brillos[brillos.length >> 1] : "-"}, ` +
  `el más oscuro ${brillos[0] ?? "-"}, el más claro ${brillos[brillos.length - 1] ?? "-"} sobre 255`);
const pieles = new Map();
for (const c of colocados) pieles.set(c.clave, (pieles.get(c.clave) ?? new Set()).add(c.piel));
console.log(`    pieles        ${[...pieles].filter(([, s]) => s.size > 1).map(([k, s]) => `${k}: ${[...s].sort().join(",")}`).join("; ") || "todas la 0"}`);
const porClave = new Map();
for (const c of colocados) porClave.set(c.clave, (porClave.get(c.clave) ?? 0) + 1);
for (const [k, n] of [...porClave].sort((a, b) => b[1] - a[1])) {
  const ej = colocados.find((c) => c.clave === k);
  console.log(`    ${String(n).padStart(3)}×  ${k.padEnd(26)} ${(ej.nombre ?? "?").padEnd(24)} ` +
    `parado '${ej.parado ?? "-"}', andando '${ej.andando ?? "-"}'`);
}

// El control: si ninguno se coloca, el censo no significa nada.
if (!colocados.length) {
  console.error(`  FALLO: ni una entidad de bicho se ha podido colocar.`);
  process.exit(1);
}
// Y el otro: una animación pedida que el modelo no tiene sale en el manifiesto
// como `null` y el visor pondría la secuencia 0 sin decir nada.
// LA CADENA DE REPUESTO DE LA MUERTE. Se aplica aquí y no en el lector porque
// hace falta saber qué secuencias trae el modelo, y el lector no abre `.mdl`.
let sustituidas = 0;
for (const c of colocados) {
  if (!c.ia) continue;
  // También cuando la ficha NO declara muerte: el motor comprueba
  // `$anim_exists(ANIM_DEATH)` con la constante sin resolver, o sea que tampoco
  // existe, y entra en la misma cadena. El zombi enano de ballesta es ése.
  const r = emitidos.get(c.clave);
  if (!r) continue;
  const buena = muerteQueExiste(c.ia.muerte, r.secuencias);
  if (buena !== c.ia.muerte) { c.ia.muerteDeclarada = c.ia.muerte; c.ia.muerte = buena; sustituidas++; }
}
if (sustituidas) console.log(`    muertes       ${sustituidas} sustituidas por la cadena de repuesto del motor`);

const faltan = [];
for (const c of colocados) {
  const r = emitidos.get(c.clave);
  for (const [k, a] of [
    ["parado", c.parado], ["andando", c.andando],
    ["corriendo", c.ia?.corriendo], ["golpe", c.ia?.golpe], ["muerte", c.ia?.muerte],
    ["esquiva", c.ia?.esquiva], ["encogerse", c.ia?.struck?.animacion ?? c.ia?.encogerse?.animacion],
  ]) {
    if (a && !r.secuencias.some((x) => x.toLowerCase() === a.toLowerCase())) {
      faltan.push(`${c.clave} no tiene '${a}' (${k})`);
    }
  }
}
if (faltan.length) {
  console.log(`    OJO           ${new Set(faltan).size} animaciones pedidas que el modelo no trae:`);
  for (const f of [...new Set(faltan)].slice(0, 6)) console.log(`                  ${f}`);
}

// --- LA ANIMACIÓN DE ESTAR PARADO, que hasta el 21 se resolvía mal ---------
//
// `setidleanim` la nombra; si no, el motor pide la ACTIVIDAD ACT_IDLE y, si el
// modelo tampoco la trae, la secuencia 0. Lo que NUNCA hace es caer en la de
// andar, que es lo que hacíamos: de ahí los aldeanos plantados en mitad de una
// zancada. Aquí no se elige nada —el sorteo con peso es del navegador—, sólo se
// deja escrito de dónde va a salir la de cada uno, para poder contarlo.
const deDonde = { "la nombra su script": 0, "por actividad ACT_IDLE": 0, "no hay ACT_IDLE: la secuencia 0": 0 };
for (const c of colocados) {
  const r = emitidos.get(c.clave);
  if (!r) continue;
  const d = animacionDeParado({ nombrado: c.parado, secuencias: r.detalleSecuencias ?? [] });
  c.paradoPorque = d.porque;
  deDonde[d.porque] = (deDonde[d.porque] ?? 0) + 1;
}
console.log(`\n  parado          ` +
  `${deDonde["la nombra su script"]} lo nombran, ` +
  `${deDonde["por actividad ACT_IDLE"]} por ACT_IDLE, ` +
  `${deDonde["no hay ACT_IDLE: la secuencia 0"]} caen a la secuencia 0`);

// --- LO CREABLE, con la forma de un colocado -------------------------------
const fichasCreables = {};
const aPeticion = new Set();
{
  let kb = 0;
  const soloCreables = new Set();
  for (const [s, info] of creables) {
    const m = fichas.get(s);
    const r = m?.clave ? emitidos.get(m.clave) : null;
    if (!r) continue;
    const relacion = relacionDeRazas(razas, m.ia?.raza, RAZA_DEL_JUGADOR);
    const ia = m.ia ? { ...m.ia } : m.ia;
    if (ia) ia.muerte = muerteQueExiste(ia.muerte, r.secuencias);
    fichasCreables[s] = {
      clase: "ms_npc",                 // `CREATE_NAMED_ENTITY("ms_npc")`, scriptcmds.cpp:2778
      script: s, clave: m.clave, nombre: m.nombre, hp: m.hp,
      ancho: m.ancho, alto: m.alto, parado: m.parado, andando: m.andando,
      piel: m.piel ? m.piel.min : 0,
      ia, relacion, hostil: esEnemigo(relacion),
      // Los cuatro de `game_postspawn` con sus valores de reposo del motor
      // (msmonsterserver.cpp:273-280): lo creado no tiene claves de mapa.
      postspawn: { titulo: "default", dmgmulti: "1.00", hpmulti: "1.00", params: "none" },
      paradoPorque: animacionDeParado({ nombrado: m.parado, secuencias: r.detalleSecuencias ?? [] }).porque,
      por: info.por,
      // ¿Lo crea algún guion del mapa, o sólo un arma? Ver `creablesDelMapa`.
      delMapa: creablesDelMapa.has(s),
    };
    if (!colocados.some((c) => c.clave === m.clave)) soloCreables.add(m.clave);
  }
  for (const k of soloCreables) kb += (emitidos.get(k)?.bytes ?? 0) / 1024;
  // A PETICIÓN: los modelos que no usa ningún colocado ni ningún creable del mapa.
  const alEntrar = new Set([
    ...colocados.map((c) => c.clave),
    ...Object.values(fichasCreables).filter((f) => f.delMapa).map((f) => f.clave),
  ]);
  let kbPeticion = 0;
  for (const k of soloCreables) if (!alEntrar.has(k)) { aPeticion.add(k); kbPeticion += (emitidos.get(k)?.bytes ?? 0) / 1024; }
  console.log(`\n  creables        ${Object.keys(fichasCreables).length} fichas; ${soloCreables.size} modelos horneados SÓLO por ellas, ${kb.toFixed(0)} KB; ` +
    `de ellos ${aPeticion.size} se cargan A PETICIÓN al empuñar su arma (${kbPeticion.toFixed(0)} KB) y ${soloCreables.size - aPeticion.size} al entrar (${(kb - kbPeticion).toFixed(0)} KB)`);
}

mkdirSync(SALIDA, { recursive: true });
writeFileSync(`${SALIDA}/bichos.json`, JSON.stringify({
  mapa: bsp.nombre,
  procedencia: `derivado local de ${MAPA}.bsp y de los .mdl y .script de Master Sword Rebirth. No redistribuible.`,
  unidadesPorMetro: U,
  // LA TABLA DE RAZAS ENTERA, 26 razas y 3,3 KB. Hasta ahora sólo viajaba la
  // relación de cada bicho CON EL JUGADOR, y para avisar a los aliados hace
  // falta la relación entre dos bichos: `$get_tsphere(ally, alcance)` mira la
  // tabla, no el nombre del script. Sin ella, «aliado» tendría que ser «del
  // mismo script», y entonces un goblin no avisaría a un hobgoblin.
  razas: [...razas].map(([clave, r]) => [clave, r]),
  modelos: [...emitidos].map(([clave, r]) => ({ clave, ...r, ...(aPeticion.has(clave) ? { aPeticion: true } : {}) })),
  colocados,
  // LO QUE SE PUEDE CREAR CON `createnpc` (ver 1b): la ficha de cada guion, con
  // la forma de un colocado y sin sitio. El sitio lo pone el comando.
  creables: fichasCreables,
  // LAS 16 ÁREAS DE APARICIÓN: `CAreaMonsterSpawn`, msmapents.cpp:1320-1321, que
  // es la misma clase para las dos clases de entidad (9 de volumen con brushes y
  // 7 de punto). Se emiten aunque el sitio no se sortee, porque el área es quien
  // lleva el reloj y quien se reinicia cuando algo la dispara — la bolsa rompible
  // de las crías apunta a la suya con `target`.
  areas,
}, null, 1));
console.log(`\n  escrito en      ${SALIDA}/bichos.json y ${SALIDA}/bichos/\n`);
