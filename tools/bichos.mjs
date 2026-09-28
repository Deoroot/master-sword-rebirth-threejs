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

import { writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  leerBsp, leerModelos, leerTexinfo, leerEntidades, leerCaras, origen, aEscena,
  UNIDADES_POR_METRO as U,
} from "../src/bsp/lector.js";
import { leerFichaNpc, modeloYAnimaciones, leerRazas, relacionDeRazas, esEnemigo, RAZA_DEL_JUGADOR,
  MUERTES_DE_REPUESTO, muerteQueExiste } from "../src/bsp/script.js";
import { sueloBajo, sePuedeEstar } from "../src/bsp/arbol.js";
import { luzEnSuelo, colorDeAdorno } from "../src/bsp/luz.js";
import { tablasDeGamma, AJUSTES } from "../src/bsp/gamma.js";
import { leerMdl, TAM } from "../src/bsp/mdl.js";
import { extraerBicho, nombreArchivo } from "./bicho.mjs";
import { ACT, animacionDeParado } from "../src/play/actividad.js";

const RUTA = process.argv.find((a) => a.endsWith(".bsp")) ?? "../MSC/assets/msr/maps/gatecity.bsp";
const SCRIPTS = "../MSC/MSCScripts/scripts";
const MODELOS = "../MSC/assets/msr/models";
const SALIDA = resolve("build/gatecity");
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

const ES_BICHO = /^(msmonster_|ms_npc$|msworlditem_)/;
const puestos = entidades.filter((e) => ES_BICHO.test(e.classname ?? ""));
console.log(`\n  entidades       ${puestos.length} de bicho o NPC en ${bsp.nombre}.bsp`);

// --- 1. resolver cada entidad a su ficha ------------------------------------
const fichas = new Map();     // script -> ficha
const sinScript = new Map();
const sinModelo = new Map();
for (const e of puestos) {
  const s = e.defscriptfile ?? e.scriptfile;
  if (!s) { sinScript.set(e.classname, (sinScript.get(e.classname) ?? 0) + 1); continue; }
  if (fichas.has(s)) continue;
  const f = leerFichaNpc(SCRIPTS, s);
  const m = modeloYAnimaciones(f);
  if (!f) { sinScript.set(s, (sinScript.get(s) ?? 0) + 1); continue; }
  if (!m) { sinModelo.set(s, (sinModelo.get(s) ?? 0) + 1); continue; }
  fichas.set(s, m);
}
console.log(`  scripts         ${fichas.size} resueltos de ${new Set(puestos.map((e) => e.defscriptfile ?? e.scriptfile).filter(Boolean)).size}`);
if (sinScript.size) console.log(`    sin fichero   ${[...sinScript].map(([k, n]) => `${n}× ${k}`).join(", ")}`);
if (sinModelo.size) console.log(`    sin setmodel  ${[...sinModelo].map(([k, n]) => `${n}× ${k}`).join(", ")}`);

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

// --- 3. extraer cada (modelo, cuerpo) distinto ------------------------------
const quiere = new Map();   // clave -> Set de secuencias pedidas
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
  m.clave = clave;
}

console.log(`\n  modelos         ${quiere.size} distintos (modelo + bodypart)`);
const emitidos = new Map();
for (const [clave, { modelo, cuerpo }] of deClave) {
  let r = null;
  try {
    r = extraerBicho(modelo, {
      cuerpo, quiero: quiere.get(clave), callar: true,
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
}

// --- 4. dónde va cada uno, y con qué luz ------------------------------------
//
// La luz es la misma que la de los adornos y por la misma razón: `R_LightVec`
// muestrea UN luxel del suelo y `R_StudioSetupLighting` lo convierte en una
// intensidad escalar por un color normalizado, que multiplica el modelo entero.
// Para un bicho QUIETO eso es exacto; para uno que anda es el luxel de donde
// nació, y **se dice**: lo correcto es volver a muestrear al moverse, y eso pide
// el árbol BSP en el navegador, que hoy sólo está en Node.
const colocados = [];
let conLuz = 0, caidos = 0, colgados = 0, dentroDeRoca = 0;
const brillos = [];
const caidas = [];
for (const e of puestos) {
  const s = e.defscriptfile ?? e.scriptfile;
  const m = s ? fichas.get(s) : null;
  if (!m || !m.clave || !emitidos.has(m.clave)) continue;
  const o = origen(e);
  if (!o) continue;
  const ang = String(e.angles ?? "0 0 0").trim().split(/\s+/).map(Number);
  // LOS PIES EN EL SUELO, preguntándoselo al árbol BSP.
  //
  // El `origin` de una entidad de monstruo es donde lo dejó el mapeador, no
  // donde acaba: el motor le hace un `DROP_TO_FLOOR` al nacer. Sin esto, medido
  // con el arnés de física, **22 de 69 no tenían suelo debajo y 15 flotaban o
  // estaban hundidos** — y eso no da error, da bichos andando por el aire y
  // medio metidos en el adoquín.
  //
  // Es exactamente lo que ya costó una ronda con el punto de llegada del
  // jugador, cuyo `origin` está 54 unidades sobre el suelo.
  const suelo = sueloBajo(bsp, o);
  const pies = suelo === null ? o : [o[0], o[1], suelo];
  if (suelo !== null && Math.abs(o[2] - suelo) > 1) { caidos++; caidas.push(o[2] - suelo); }
  if (suelo === null) colgados++;
  if (!sePuedeEstar(bsp, [o[0], o[1], o[2] + 8])) dentroDeRoca++;
  const luxel = luzEnSuelo(carasDelMundo, bsp.lumps.luz.datos, pies);
  if (luxel) { conLuz++; brillos.push(Math.max(...luxel)); }
  colocados.push({
    clase: e.classname,
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
  });
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

writeFileSync(`${SALIDA}/bichos.json`, JSON.stringify({
  mapa: bsp.nombre,
  procedencia: "derivado local de gatecity.bsp y de los .mdl y .script de Master Sword Rebirth. No redistribuible.",
  unidadesPorMetro: U,
  // LA TABLA DE RAZAS ENTERA, 26 razas y 3,3 KB. Hasta ahora sólo viajaba la
  // relación de cada bicho CON EL JUGADOR, y para avisar a los aliados hace
  // falta la relación entre dos bichos: `$get_tsphere(ally, alcance)` mira la
  // tabla, no el nombre del script. Sin ella, «aliado» tendría que ser «del
  // mismo script», y entonces un goblin no avisaría a un hobgoblin.
  razas: [...razas].map(([clave, r]) => [clave, r]),
  modelos: [...emitidos].map(([clave, r]) => ({ clave, ...r })),
  colocados,
}, null, 1));
console.log(`\n  escrito en      build/gatecity/bichos.json y build/gatecity/bichos/\n`);
