// LAS ARMAS DE PARTIDA, con su modelo y su ficha de ataque.
//
//   npm run armas
//
// Un arma de Master Sword son DOS modelos y ninguno es sólo suyo:
//
//   `MODEL_VIEW`   el de primera persona, con los brazos. `v_1hswords.mdl` son
//                  4,5 MB con **veintiún filos** dentro, y `MODEL_VIEW_IDX`
//                  dice cuál: el 1 es `rusted`.
//   `MODEL_WORLD`  el de tercera persona. `p_weapons1.mdl` trae **117
//                  submodelos**, y `MODEL_BODY_OFS` es el de la mano derecha;
//                  los tres siguientes son la izquierda, el suelo y la vaina.
//
// O sea que la mitad del trabajo es elegir el submodelo bueno, y equivocarse no
// da ningún error: da OTRA arma en la mano. El control está abajo — el nombre
// del submodelo tiene que casar con el del arma.
//
// Misma regla del 02 que todo lo demás: **el lector es nuestro, el contenido no
// se copia.** Lo extraído vive en `build/gatecity/armas/`, que está en
// `.gitignore`, y no se mueve un byte a `public/`.

import { writeFileSync, mkdirSync, existsSync, appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { leerMdl, TAM } from "../src/bsp/mdl.js";
import { leerFichaObjeto } from "../src/bsp/script.js";
import { extraerBicho, nombreArchivo } from "./bicho.mjs";

const SCRIPTS = process.argv[2] ?? "../MSC/MSCScripts/scripts";
const MODELOS = "../MSC/assets/msr/models";
const SALIDA = resolve("build/gatecity/armas");

if (!existsSync(`${SCRIPTS}/items`)) {
  console.error(`No encuentro ${SCRIPTS}/items. Pásame la carpeta scripts/ de MSR.`);
  process.exit(1);
}

/**
 * El nombre del submodelo que elige un `body`, que es el ORÁCULO de todo esto.
 *
 * El motor compone el `body` de una entidad con la fórmula de `R_StudioSetupModel`:
 *
 *     index = (body / pbodypart->base) % pbodypart->nummodels
 *
 * así que el mismo número significa cosas distintas en cada `bodypart`. Aquí se
 * saca el NOMBRE del submodelo elegido para poder comprobar que un arma llamada
 * `rustedsword` acaba en un submodelo llamado `rustedsword…` y no en el hacha.
 */
function submodelosDe(ruta, cuerpo) {
  const m = leerMdl(ruta);
  const out = [];
  for (let bp = 0; bp < m.nBodyparts; bp++) {
    const ob = m.offBodyparts + bp * TAM.bodypart;
    const parte = m.buf.toString("latin1", ob, ob + 64).split("\0")[0];
    const n = m.buf.readInt32LE(ob + 64);
    const base = m.buf.readInt32LE(ob + 68);
    const off = m.buf.readInt32LE(ob + 72);
    if (n < 1) continue;
    const i = n > 1 && base > 0 ? Math.floor(cuerpo / base) % n : 0;
    const om = off + i * TAM.modelo;
    out.push({
      parte, indice: i, de: n,
      nombre: m.buf.toString("latin1", om, om + 64).split("\0")[0],
      vertices: m.buf.readInt32LE(om + 80),
    });
  }
  return { submodelos: out, secuencias: m.nSeq };
}

const armas = [];
const avisos = [];

// Las siete de `reg.newchar.weaponlist` más los puños, que los tiene todo el
// mundo siempre y son el único ataque que no se puede perder.
const PEDIDAS = [
  "items/fist_bare",
  "items/swords_rsword", "items/bows_treebow", "items/smallarms_rknife",
  "items/axes_rsmallaxe", "items/blunt_hammer1", "items/polearms_qs",
  "items/magic_hand_lightning_weak",
];

console.log(`\nlas armas de partida de Master Sword — ${PEDIDAS.length} fichas\n`);

for (const ruta of PEDIDAS) {
  const f = leerFichaObjeto(SCRIPTS, ruta);
  if (!f) { avisos.push(`${ruta}: no está el script`); continue; }

  const arma = {
    id: f.id, nombre: f.nombre, descripcion: f.descripcion,
    peso: f.peso, tamano: f.tamano, valor: f.valor, tipo: f.tipo,
    habilidad: f.arma?.habilidad ?? null,
    ataques: f.ataques, multiplicadorDeCarga: f.multiplicadorDeCarga,
    animaciones: f.animaciones, sonidos: f.sonidos,
    enMano: { ...f.enMano }, enElMundo: { ...f.enElMundo },
  };

  // --- el modelo de primera persona ---------------------------------------
  if (f.enMano.modelo && f.enMano.modelo !== "none") {
    const rel = f.enMano.modelo.replace(/^models\//, "");
    const ruta3d = `${MODELOS}/${rel}`;
    if (!existsSync(ruta3d)) {
      avisos.push(`${f.id}: falta ${rel}`);
    } else {
      const { submodelos } = submodelosDe(ruta3d, f.enMano.submodelo);
      // Las secuencias que el script nombra, por número, y ninguna más: el
      // archivo de las espadas tiene 25 y un arma usa seis.
      const quiero = [
        f.animaciones.sacar, f.animaciones.parado, f.animaciones.guardar,
        ...f.animaciones.ataque,
        // El arco no tiene `ANIM_ATTACK`: tiene tensar y soltar, y sin ellas el
        // arco se queda quieto mientras dispara. Hasta el 23 sólo se emitía
        // `idle1` de `v_bows.mdl` — una secuencia de cuatro.
        f.animaciones.tensar, f.animaciones.disparar,
      ].filter((v) => v !== null && v !== undefined);
      const r = extraerBicho(rel, {
        cuerpo: f.enMano.submodelo, base: MODELOS, salida: SALIDA,
        quiero: quiero.length ? quiero : null, callar: true,
      });
      arma.enMano.clave = r?.clave ?? null;
      arma.enMano.submodelos = submodelos;
      arma.enMano.secuencias = r?.secuencias ?? [];
      arma.enMano.bytes = r?.bytes ?? 0;
    }
  }

  // --- y el de tercera, que es el que se ve desde fuera -------------------
  if (f.enElMundo.modelo && f.enElMundo.modelo !== "none" && f.enElMundo.cuerpo !== null) {
    const rel = f.enElMundo.modelo.replace(/^models\//, "");
    const ruta3d = `${MODELOS}/${rel}`;
    if (!existsSync(ruta3d)) {
      avisos.push(`${f.id}: falta ${rel}`);
    } else {
      const { submodelos } = submodelosDe(ruta3d, f.enElMundo.cuerpo);
      const r = extraerBicho(rel, {
        cuerpo: f.enElMundo.cuerpo, base: MODELOS, salida: SALIDA,
        // Del modelo del mundo sólo hace falta estar quieto en la mano.
        quiero: [`${f.enElMundo.animaciones}_idle`], callar: true,
      });
      arma.enElMundo.clave = r?.clave ?? null;
      arma.enElMundo.submodelos = submodelos;
      arma.enElMundo.bytes = r?.bytes ?? 0;
    }
  }

  armas.push(arma);
  const enMano = arma.enMano.submodelos?.map((s) => `${s.nombre}`).join("+") ?? "—";
  const mundo = arma.enElMundo.submodelos?.[0]?.nombre ?? "—";
  console.log(`  ${arma.id.padEnd(30)} ${String(arma.nombre ?? "").padEnd(20)}`);
  console.log(`      en mano   ${String(arma.enMano.modelo ?? "—").padEnd(32)} body ${String(arma.enMano.submodelo).padStart(3)}  ${enMano}`);
  console.log(`      en mundo  ${String(arma.enElMundo.modelo ?? "—").padEnd(32)} body ${String(arma.enElMundo.cuerpo ?? "—").padStart(3)}  ${mundo}`);
  if (arma.ataques.length) {
    for (const a of arma.ataques) {
      console.log(`      ataque    ${String(a.tipo).padEnd(26)} ${String(a.dano ?? "—").padStart(4)}+d${a.danoRango ?? 0} ` +
        `alcance ${String(a.alcance ?? "—").padStart(4)} u  golpea a ${a.retardo ?? "—"} de ${a.duracion ?? "—"} s  ` +
        `${a.teclas.join("+")}${a.carga ? ` carga ${a.carga}` : ""}`);
    }
  }
}

// ── LAS FLECHAS, que son otro objeto y no una parte del arco ───────────────
//
// Un arco no lleva daño: lo lleva la flecha, y la flecha es un objeto entero con
// su nombre, su peso, su valor y su modelo. Aquí van las dos que se pueden tener
// al empezar:
//
//   `proj_arrow_generic`  la GRATIS, y es gratis de verdad: cuando el jugador no
//                         lleva munición, el motor le da ésta y **no la gasta**
//                         (`if (!GENERIC) pArrow->iQuantity -= iAmt`,
//                         giattack.cpp:947). Un arco nunca se queda sin flechas.
//   `proj_arrow_wooden`   la de comprar: el doble de daño y cae menos.
//
// Las dos salen del mismo `arrows.mdl` con el mismo submodelo, así que se emite
// una vez.
const FLECHAS = ["items/proj_arrow_generic", "items/proj_arrow_wooden"];
const flechas = [];
console.log("\n  las flechas\n");
for (const ruta of FLECHAS) {
  const f = leerFichaObjeto(SCRIPTS, ruta);
  if (!f) { avisos.push(`${ruta}: no está el script`); continue; }
  const p = f.proyectil;
  const flecha = {
    id: f.id, nombre: f.nombre, descripcion: f.descripcion,
    peso: f.peso, tamano: f.tamano, valor: f.valor,
    apilable: f.apilable, sonidos: f.sonidos,
    modelo: f.enElMundo.modelo ?? f.modelo, clave: null, ...p,
  };
  const rel = String(flecha.modelo ?? "").replace(/^models\//, "");
  if (rel && existsSync(`${MODELOS}/${rel}`)) {
    // `game_tossprojectile` pone `ANIM_DROPPED`, que en `proj_arrow_base` es
    // `idle1`; `idle2` es la de tenerla en la mano. Se emiten las dos, que entre
    // las dos no llegan a 30 KB.
    const r = extraerBicho(rel, {
      cuerpo: p.submodelo ?? 0, base: MODELOS, salida: SALIDA,
      quiero: ["idle1", "idle2"], callar: true,
    });
    flecha.clave = r?.clave ?? null;
    flecha.secuencias = r?.secuencias ?? [];
    flecha.bytes = r?.bytes ?? 0;
  } else if (rel) {
    avisos.push(`${f.id}: falta ${rel}`);
  }
  flechas.push(flecha);
  console.log(`  ${flecha.id.padEnd(24)} ${String(flecha.nombre).padEnd(16)} ` +
    `daño ${flecha.dano?.min}-${flecha.dano?.max} ${flecha.tipoDano}  ` +
    `gravedad ${flecha.gravedad}  dura ${flecha.duraEnElSuelo} s  ` +
    `${flecha.clave ?? "sin modelo"} (${(flecha.secuencias ?? []).join(", ")})`);
}

// ── LOS CONTROLES ──────────────────────────────────────────────────────────
//
// Sin esto lo único que se sabe es que el extractor no se ha caído.
const malos = [];
const control = (que, bien, detalle = "") => {
  if (!bien) malos.push(`${que} — ${detalle}`);
  console.log(`  ${bien ? "ok  " : "MAL "} ${que.padEnd(58)} ${detalle}`);
};
console.log("\n  CONTROLES");

// 1. EL ORÁCULO DEL SUBMODELO, y el bueno no es el que se me ocurrió primero.
//
// Lo primero que escribí fue «el nombre del submodelo tiene que parecerse al del
// arma», y eso suspendía a dos armas BUENAS: el `rknife` sale en un submodelo
// llamado `rdagger` —cuchillo y daga son la misma cosa con dos palabras— y el
// `rsmallaxe` en `rustedaxe`, donde lo único común es «axe». Un control que
// castiga la respuesta correcta por el vocabulario no es un control.
//
// El oráculo de verdad está en el propio script: `game_fall` hace
//
//     local L_SUBMODEL MODEL_BODY_OFS   inc L_SUBMODEL 2   setmodelbody 0 …
//
// o sea que **dos submodelos más allá está el del suelo**. Así que si
// `MODEL_BODY_OFS` apunta a la mano de un arma, `+2` tiene que llamarse
// `<lo mismo>_floor`. Eso lo dice el motor y no mi diccionario, y además
// comprueba justo lo que importa: que el número cae en el juego de cuatro
// submodelos del arma y no en el del vecino.
//
// SALVO EN LA FAMILIA DE LAS ASTAS, que declara el del suelo aparte
// (`PMODEL_IDX_FLOOR`) y además lo pone ANTES que la mano: en el bastón el
// suelo es el 61 y la mano el 62. Con el `+2` a ciegas, el control acusaba al
// bastón de caer en el juego de `evilfshard_rhand`, dos armas más allá — y el
// bastón estaba bien. Cuando el script dice dónde está el suelo, se le hace
// caso; el `+2` es para cuando no lo dice.
for (const a of armas) {
  if (!a.enElMundo.clave || a.enElMundo.cuerpo === null) continue;
  const rel = a.enElMundo.modelo.replace(/^models\//, "");
  const iSuelo = a.enElMundo.suelo ?? a.enElMundo.cuerpo + 2;
  const donde = a.enElMundo.suelo === null || a.enElMundo.suelo === undefined
    ? "dos más allá" : `en el ${iSuelo}, como dice el script`;
  const mano = submodelosDe(`${MODELOS}/${rel}`, a.enElMundo.cuerpo).submodelos[0];
  const suelo = submodelosDe(`${MODELOS}/${rel}`, iSuelo).submodelos[0];
  const raiz = suelo.nombre.replace(/_floor$/i, "");
  control(`el ${a.id} del mundo cae en el juego de ${raiz}`,
    /_floor$/i.test(suelo.nombre) && mano.nombre.startsWith(raiz),
    `${mano.nombre} y, ${donde}, ${suelo.nombre}`);
}

// 2. Y el de la mano no puede ser el submodelo 0 de un archivo con veintiuno
//    a menos que el script pida el 0: ése es el fallo que deja a todo el mundo
//    con la primera espada del fichero.
for (const a of armas) {
  const cuchilla = a.enMano.submodelos?.find((s) => s.de > 1);
  if (!cuchilla) continue;
  control(`el filo de ${a.id} sale del body que pide el script`,
    cuchilla.indice === a.enMano.submodelo % cuchilla.de,
    `body ${a.enMano.submodelo} -> ${cuchilla.indice} de ${cuchilla.de}`);
}

// 3. Las secuencias que pide el script tienen que estar en el archivo. Si no,
//    el arma se queda quieta al blandirla y no da error.
for (const a of armas) {
  if (!a.enMano.clave) continue;
  const pide = [a.animaciones.parado, ...a.animaciones.ataque].filter((v) => v !== null);
  control(`${a.id} trae sus ${pide.length} secuencias`,
    a.enMano.secuencias.length >= pide.length,
    `${a.enMano.secuencias.length} emitidas: ${a.enMano.secuencias.join(", ")}`);
}

// 4. Un arma cuerpo a cuerpo tiene que traer los dos relojes. Con `retardo` a
//    cero el daño cae en el fotograma del clic, que se juega como una pistola.
for (const a of armas) {
  const cac = a.ataques.find((x) => x.tipo === "strike-land");
  if (!cac) continue;
  control(`${a.id} trae los dos relojes`,
    cac.retardo > 0 && cac.duracion > cac.retardo,
    `golpea a ${cac.retardo} de ${cac.duracion} s`);
}

// 5. EL ARCO, y son cuatro controles porque son cuatro maneras de tener un arco
//    que no dispara. Ninguna da error: dan un arco silencioso, o quieto, o que
//    tira la flecha a los pies.
for (const a of armas) {
  const tiro = a.ataques.find((x) => x.tipo === "charge-throw-projectile");
  if (!tiro) continue;
  control(`${a.id} declara los dos tiempos de tensar`,
    Array.isArray(tiro.sostener) && tiro.sostener.length === 2 && tiro.sostener[1] > 0,
    // Sin el segundo, `flTimeHeldAdjusted` vale 0 por el ternario del motor y la
    // flecha sale con velocidad cero.
    `${(tiro.sostener ?? []).join(";")} s`);
  // El cono puede no existir —el motor sólo lo lee con dos trozos— y entonces
  // el arma tira perfecta. Lo que no puede es venir del revés.
  control(`el cono de ${a.id} está en el orden del motor`,
    !tiro.cono || (tiro.cono.length === 2 && tiro.cono[0] >= tiro.cono[1]),
    tiro.cono ? `${tiro.cono.join(";")} grados` : "sin cono: tira perfecto");
  control(`${a.id} dice de qué munición tira`, Boolean(tiro.proyectil), `${tiro.proyectil}`);
  // Tres y no cuatro: `v_bows.mdl` trae cuatro secuencias y el juego usa tres,
  // porque el `ANIM_DEPLOY 1` de `bows_base` no lo toca nadie.
  if (a.animaciones.tensar !== null) {
    control(`${a.id} trae sus tres secuencias del tiro`,
      (a.enMano.secuencias ?? []).length >= 3,
      `${(a.enMano.secuencias ?? []).join(", ")}`);
  }
}

// 6. Y la flecha tiene que traer daño y modelo. El daño es un dado del script
//    (`$rand(30,60)`) y leerlo como un número deja la flecha a cero, que no se
//    ve como un error: se ve como un arco que no hace nada.
for (const f of flechas) {
  control(`${f.id} trae su dado de daño`,
    Boolean(f.dano) && f.dano.max > 0, `${f.dano?.min}-${f.dano?.max}`);
  control(`${f.id} cae menos que una piedra`,
    f.gravedad > 0 && f.gravedad < 1, `gravity ${f.gravedad} de ${1}`);
  control(`${f.id} trae su modelo`, Boolean(f.clave), `${f.clave}`);
}

const bytes = armas.reduce((s, a) => s + (a.enMano.bytes ?? 0) + (a.enElMundo.bytes ?? 0), 0)
  + flechas.reduce((s, f) => s + (f.bytes ?? 0), 0);
mkdirSync(SALIDA, { recursive: true });
writeFileSync(`${SALIDA}/../armas.json`, JSON.stringify({
  procedencia: {
    scripts: SCRIPTS, modelos: MODELOS,
    cuando: new Date().toISOString().slice(0, 10),
    nota: "Extraído de una instalación de Master Sword Rebirth. No se distribuye.",
  },
  armas, flechas,
}, null, 1));

// ── LA PROCEDENCIA, que es parte del trabajo y no papeleo ─────────────────
const PROC = resolve("build/gatecity/PROCEDENCIA.md");
const MARCA = "## Las ARMAS";
if (existsSync(PROC) && !readFileSync(PROC, "utf8").includes(MARCA)) {
  appendFileSync(PROC, `
${MARCA}

\`armas/\` lo llena \`node tools/armas.mjs\` con el mismo lector de \`.mdl\` que los
bichos: se lee el formato y se emite malla, esqueleto y las secuencias que el
script del arma nombra. El \`.script\` del objeto —de \`../MSC/MSCScripts/\`— da los
números del ataque, que tampoco se copian: se leen y se escriben en
\`armas.json\`.

Se emite **un submodelo de cada archivo**, que es lo que el arma usa:
\`v_1hswords.mdl\` trae veintiún filos y \`p_weapons1.mdl\` ciento diecisiete
piezas, y de ahí sale la que dicen \`MODEL_VIEW_IDX\` y \`MODEL_BODY_OFS\`.

Vale lo de siempre: **está en \`build/\`, que está en \`.gitignore\`, y no se mueve
un byte a \`public/\`.**
`);
}

console.log(`\n  ${armas.length} armas y ${flechas.length} flechas, ` +
  `${(bytes / 1024 / 1024).toFixed(2)} MB de malla y animación`);
if (avisos.length) console.log(`\n  AVISOS\n${avisos.map((a) => `    ${a}`).join("\n")}`);
console.log(`\n  escrito en      build/gatecity/armas.json\n`);
if (malos.length) {
  console.error(`  ${malos.length} controles en rojo:\n${malos.map((m) => `    ${m}`).join("\n")}`);
  process.exit(1);
}
