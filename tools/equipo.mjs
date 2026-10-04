// EL EQUIPO QUE SE VE PUESTO: los modelos que el muñeco del HUD y la pantalla
// de elección le cuelgan al cuerpo del personaje. El 101.
//
//   npm run equipo
//
// Regla del 02: se escribe el lector, lo extraído va a `build/msr/equipo/`, y
// ni un byte pasa a `public/`.
//
// ── Qué se hornea, y quién lo decide ───────────────────────────────────────
//
// No hay lista escrita a mano. Para cada objeto con guion horneado
// (`build/msr/objetosguion.json`) se pregunta a `aspectoDe` —la MISMA función
// que usa el juego, src/play/equipovisto.js— cómo se ve en los cuatro estados
// en que puede estar a la vista (mano derecha, mano izquierda, puesto, y recién
// cargado para la pantalla de elección) y con los dos géneros. De ahí salen los
// pares (modelo, `body`), y ésos son los que se hornean.
//
// O sea que este horneado DEPENDE de `npm run objetos:guion`: un objeto que no
// tenga guion horneado no sale aquí, y en el juego se quedará sin dibujar —
// diciéndolo (`piezasConCuerpo` devuelve `porque`).
//
// El `body` se pliega con `cuerpoDe`, que es `cl_entity_s::SetBody`
// (clrenderent.cpp:102-117), contra las `bodyparts` leídas del `.mdl`.
//
// ── Sólo la secuencia 0 ────────────────────────────────────────────────────
//
// Estos modelos no se animan con sus secuencias: el motor los ata al cuerpo
// (`ItemEnt.AttachTo(Ent)`, `framerate = 0`, clrenderent.cpp:329-331) y se
// mueven con los huesos DE ÉL. Se emite la 0 porque `extraerBicho` la emite
// siempre; el navegador no la usa. El oráculo de la caja sí se pasa: es gratis
// y es el juez de que el archivo se lee bien.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";

import { leerMdl, TAM } from "../src/bsp/mdl.js";
import { salidaComun, prepararComunes } from "./recursos.mjs";
import { extraerBicho } from "./bicho.mjs";
import { GuionesDeObjeto } from "../src/play/guionobjeto.js";
import {
  aspectoDe, cuerpoDe, claveDeModelo, MANO, cuerpoGuardado, MODELO_DEL_CUERPO,
} from "../src/play/equipovisto.js";

const MODELOS = "../MSC/assets/msr/models";
const GUIONES = salidaComun("objetosguion.json");
const SALIDA = salidaComun("equipo");

if (!existsSync(GUIONES)) {
  console.error(`  FALLO: falta ${GUIONES}. Pasa antes \`npm run objetos:guion\`.`);
  process.exit(1);
}
prepararComunes();
mkdirSync(SALIDA, { recursive: true });

const guiones = new GuionesDeObjeto(JSON.parse(readFileSync(GUIONES, "utf8")));

/** Las `bodyparts` de un `.mdl`: cuántos submodelos y con qué base. */
function partesDe(m) {
  const out = [];
  for (let bp = 0; bp < m.nBodyparts; bp++) {
    const ob = m.offBodyparts + bp * TAM.bodypart;
    out.push({
      nombre: m.buf.toString("latin1", ob, ob + 64).split("\0")[0],
      n: m.buf.readInt32LE(ob + 64),
      base: m.buf.readInt32LE(ob + 68),
    });
  }
  return out;
}

// --- 1. qué pide cada objeto ------------------------------------------------
const ESTADOS = [
  ["mano", MANO.derecha], ["mano", MANO.izquierda], ["puesto", MANO.izquierda], ["carga", MANO.izquierda],
];
/** clave del modelo -> { ruta, pedidos: Map<JSON de cuerpos, Set<objeto>> } */
const pedidos = new Map();
let conModelo = 0;
for (const id of guiones.ids) {
  let alguno = false;
  for (const genero of ["male", "female"]) {
    for (const [estado, mano] of ESTADOS) {
      const a = aspectoDe({ guiones, id, estado, mano, genero });
      if (!a?.modelo) continue;
      alguno = true;
      const clave = claveDeModelo(a.modelo);
      if (!pedidos.has(clave)) pedidos.set(clave, { ruta: a.modelo, pedidos: new Map() });
      const k = JSON.stringify(a.cuerpos);
      const p = pedidos.get(clave).pedidos;
      if (!p.has(k)) p.set(k, new Set());
      p.get(k).add(id);
    }
  }
  if (alguno) conModelo++;
}

// --- 1b. EL CUERPO CON PARTES ESCONDIDAS (el 101b) ---------------------------
//
// Una coraza le dice a su dueño que esconda lo que tapa (`ext_setbodytype`), y
// la pantalla de elección dibuja el cuerpo con ese `body`. Son el mismo
// `human/reference.mdl` con otro número, y salen de correr el guion del
// jugador con cada objeto puesto: ver `cuerpoGuardado`. Depende de
// `build/msr/jugador.json` (`npm run jugador`).
const JUGADOR = salidaComun("jugador.json");
if (!existsSync(JUGADOR)) {
  console.error(`  FALLO: falta ${JUGADOR}. Pasa antes \`npm run jugador\`.`);
  process.exit(1);
}
{
  const fichaDelJugador = JSON.parse(readFileSync(JUGADOR, "utf8"));
  const clave = claveDeModelo(MODELO_DEL_CUERPO);
  pedidos.set(clave, { ruta: MODELO_DEL_CUERPO, pedidos: new Map() });
  for (const genero of ["male", "female"]) {
    for (const id of [null, ...guiones.ids]) {
      const objetos = id ? [{ id, puesto: true }] : [];
      const cuerpos = cuerpoGuardado({ personaje: { genero, objetos }, guiones, fichaDelJugador });
      const k = JSON.stringify(cuerpos);
      const p = pedidos.get(clave).pedidos;
      if (!p.has(k)) p.set(k, new Set());
      p.get(k).add(id ?? `(sin nada, ${genero})`);
    }
  }
}

// --- 2. hornear cada (modelo, body) ----------------------------------------
const modelos = {};
const sinArchivo = [];
let carpetas = 0, bytes = 0;
const eximidos = [];
const alReves = [];
const BOBINADO = "normales al revés del giro en el propio archivo; el motor recorta por el giro y no por la normal";
const RAZON = "la caja de secuencia del archivo no describe este submodelo; se dibuja atado a los huesos del cuerpo (AttachTo, clrenderent.cpp:329)";
console.log(`\n  ${guiones.ids.length} objetos con guion, ${conModelo} con modelo a la vista, ${pedidos.size} modelos distintos\n`);
for (const [clave, { ruta, pedidos: p }] of [...pedidos].sort()) {
  const archivo = `${MODELOS}/${clave}.mdl`;
  if (!existsSync(archivo)) {
    // Un `setmodel MODEL_WORLD` sin resolver, o un modelo que vive en `valve/`
    // (CLAUDE.md §2). El motor tampoco lo dibuja si `Mod_ForName` no lo
    // encuentra; aquí se apunta para que no sea un hueco callado.
    sinArchivo.push({ modelo: ruta, objetos: [...new Set([...p.values()].flatMap((s) => [...s]))] });
    continue;
  }
  const m = leerMdl(archivo);
  const partes = partesDe(m);
  const cuerpos = {};
  for (const [k, objetos] of p) {
    const body = cuerpoDe(partes, JSON.parse(k));
    if (cuerpos[body]) { for (const o of objetos) cuerpos[body].objetos.add(o); continue; }
    // EL ORÁCULO DE LA CAJA, POR SUBMODELO. Un `.mdl` de equipo trae UNA caja
    // de secuencia para decenas de submodelos, y sólo describe a algunos: de
    // `p_armorvest_new` unas corazas caben y otras no, con el mismo esqueleto y
    // la misma descompresión. Así que se pasa el juez, y a quien no lo pasa se
    // le exime CON LA RAZÓN y se cuenta — no se le quita el juez a todos.
    const opciones = { cuerpo: body, base: MODELOS, salida: SALIDA, raizSalida: salidaComun(), quiero: [], callar: true, bobinadoContraNormal: BOBINADO };
    let r, eximido = null;
    try {
      r = extraerBicho(`${clave}.mdl`, opciones);
    } catch (e) {
      if (!/caja/.test(String(e?.message))) throw e;
      eximido = String(e.message);
      r = extraerBicho(`${clave}.mdl`, { ...opciones, sinOraculoDeCaja: RAZON });
    }
    if (!r) { console.error(`  FALLO: no se pudo extraer ${clave} body ${body}`); process.exit(1); }
    if (eximido) eximidos.push({ clave, body, porque: eximido });
    if (r.bobinadoEximido) alReves.push({ clave, body });
    cuerpos[body] = { carpeta: r.carpeta, triangulos: r.triangulos, objetos: new Set(objetos) };
    carpetas++; bytes += r.bytes ?? 0;
  }
  modelos[clave] = {
    modelo: `models/${clave}.mdl`,
    // Lo que `cuerpoDe` necesita para plegar los `setmodelbody` en el navegador.
    partes: partes.map(({ n, base }) => ({ n, base })),
    cuerpos: Object.fromEntries(Object.entries(cuerpos).map(([b, c]) =>
      [b, { carpeta: c.carpeta, triangulos: c.triangulos, objetos: [...c.objetos].sort() }])),
  };
  const vacios = Object.values(cuerpos).filter((c) => !c.triangulos).length;
  console.log(
    `  ${clave.padEnd(30)} ${String(Object.keys(cuerpos).length).padStart(3)} cuerpos` +
    `  partes ${partes.map((x) => `${x.n}×${x.base}`).join(" ")}` +
    (vacios ? `  (${vacios} sin triángulos)` : "")
  );
}

// CONTROL: un `body` que no dibuja nada es un submodelo `blank`, y eso es
// legítimo — pero si TODOS los de un modelo salen vacíos, lo que está mal es la
// cuenta del `body`, y no daría error: daría un personaje desnudo.
for (const [clave, m] of Object.entries(modelos)) {
  if (Object.values(m.cuerpos).every((c) => !c.triangulos)) {
    console.error(`  FALLO: ningún cuerpo de ${clave} tiene triángulos. El \`body\` no se está plegando bien.`);
    process.exit(1);
  }
}

writeFileSync(salidaComun("equipo.json"), JSON.stringify({
  procedencia: "derivado local de los modelos de equipo de Master Sword Rebirth (models/armor, models/weapons, models/misc). No redistribuible.",
  de: "build/msr/objetosguion.json: cada par (modelo, body) sale de correr el guion del objeto",
  modelos,
  sinArchivo,
  eximidosDelOraculoDeCaja: eximidos,
  normalesAlReves: alReves,
}, null, 1));
console.log(`\n  oráculo de la caja: ${carpetas - eximidos.length} de ${carpetas} lo pasan; ${eximidos.length} eximidos con razón`);
console.log(`  normales al revés del giro: ${alReves.map((x) => `${x.clave} b${x.body}`).join(", ") || "ninguno"}`);

console.log(`\n  ${carpetas} carpetas en build/msr/equipo/, ${(bytes / 1024 / 1024).toFixed(1)} MB de malla`);
if (sinArchivo.length) {
  console.log(`  sin archivo en ../MSC/assets/msr/models (no se dibujan):`);
  for (const s of sinArchivo) console.log(`    ${s.modelo}  <- ${s.objetos.slice(0, 6).join(", ")}${s.objetos.length > 6 ? "…" : ""}`);
}
console.log(`  escrito en      build/msr/equipo.json\n`);
