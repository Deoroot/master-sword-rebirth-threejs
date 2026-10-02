import { salidaComun, prepararComunes } from "./recursos.mjs";
// LOS ESCUDOS, con su modelo de primera mano y el de la espalda.
//
//   npm run escudos
//
// Un escudo son los mismos dos modelos que un arma —`v_shields.mdl` para la
// vista y `p_weapons2.mdl` para el mundo— pero con una diferencia que cuesta
// caro si se pasa por alto: **un escudo va en la mano izquierda**.
//
//     base_weapon/game_deploy:   L_SUBMODEL = MODEL_BODY_OFS + 1 - hand_index
//
// Con la derecha (índice 1) sale el propio `MODEL_BODY_OFS`; con la izquierda
// (índice 0), **uno más**. Y el archivo tiene los cuatro seguidos:
//
//     61 buckler_rhand   62 buckler_lhand   63 buckler_floor   64 buckler_sheath
//
// O sea que leer `MODEL_BODY_OFS` y usarlo tal cual pone en la mano izquierda un
// escudo dibujado para la derecha, que se ve como un escudo del revés y no da
// ningún error. Los controles de abajo comprueban los cuatro nombres.
//
// Y `game_wear` usa `+3` —el de la espalda— que es el que se ve cuando lo llevas
// guardado. Se hornea también, porque un escudo desplegado y uno guardado son dos
// estados del juego (`IS_DEPLOYED`) y no la misma cosa.
//
// Misma regla del 02: **el lector es nuestro, el contenido no se copia.** Lo
// extraído vive en `build/msr/armas/` —al lado de las armas, que comparten
// archivo— y no se mueve un byte a `public/`.

import { writeFileSync, mkdirSync, existsSync, appendFileSync, readFileSync } from "node:fs";

import { leerMdl, TAM } from "../src/bsp/mdl.js";
import { leerFichaObjeto } from "../src/bsp/script.js";
import { conoDelMotor, semianguloReal, danoEsperado, POSTURA } from "../src/play/escudo.js";
import { extraerBicho } from "./bicho.mjs";

const SCRIPTS = process.argv[2] ?? "../MSC/MSCScripts/scripts";
const MODELOS = "../MSC/assets/msr/models";
const SALIDA = salidaComun("armas");
prepararComunes();

if (!existsSync(`${SCRIPTS}/items`)) {
  console.error(`No encuentro ${SCRIPTS}/items. Pásame la carpeta scripts/ de MSR.`);
  process.exit(1);
}

/** El nombre del submodelo que elige un `body`. Misma fórmula que en `armas.mjs`. */
function submodeloDe(ruta, cuerpo) {
  const m = leerMdl(ruta);
  const out = [];
  for (let bp = 0; bp < m.nBodyparts; bp++) {
    const ob = m.offBodyparts + bp * TAM.bodypart;
    const n = m.buf.readInt32LE(ob + 64);
    const base = m.buf.readInt32LE(ob + 68);
    const off = m.buf.readInt32LE(ob + 72);
    if (n < 1) continue;
    const i = n > 1 && base > 0 ? Math.floor(cuerpo / base) % n : 0;
    const om = off + i * TAM.modelo;
    out.push({ indice: i, de: n, nombre: m.buf.toString("latin1", om, om + 64).split("\0")[0] });
  }
  return out;
}

/** Los siete escudos del juego. Los seis normales y el de fuego, que va aparte. */
const PEDIDOS = [
  "items/shields_wooden", "items/shields_buckler", "items/shields_ironshield",
  "items/shields_lironshield", "items/shields_rune", "items/shields_urdual",
  "items/shields_f",
];

/** Lo que el escudo pide al modelo de vista, por NÚMERO. */
const ANIMS = { levantar: 0, empujar: 1, bajar: 2 };

const escudos = [];
const avisos = [];

console.log(`\nlos escudos de Master Sword — ${PEDIDOS.length} fichas\n`);

for (const ruta of PEDIDOS) {
  const f = leerFichaObjeto(SCRIPTS, ruta);
  if (!f) { avisos.push(`${ruta}: no está el script`); continue; }
  if (!f.escudo) { avisos.push(`${ruta}: no declara AM_SHIELD`); continue; }

  const e = {
    id: f.id, nombre: f.nombre, descripcion: f.descripcion,
    peso: f.peso, tamano: f.tamano, valor: f.valor, calidad: f.calidad,
    mano: f.mano, manoNumero: f.manoNumero,
    vestible: f.vestible, ranuras: f.ranuras,
    ataque: f.arma, escudo: f.escudo,
    animaciones: ANIMS,
    // `SOUND_BLOCK` cuando para y `SOUND_SWIPE` al levantarlo, que en la base es
    // el mismo `cbar_miss1` que un mandoble: el escudo se «blande».
    sonidos: { bloqueo: f.escudo.sonidoDeBloqueo, blandir: f.sonidos?.blandir ?? null },
    enMano: { ...f.enMano }, enElMundo: { ...f.enElMundo },
    // Lo que de verdad decide cuánto daño te llevas, que es lo único que un
    // jugador nota: la media de cada postura. Va horneado para que la sonda no
    // tenga que recalcularlo y para poder ordenarlos por «cuánto sirve».
    medias: {
      arriba: danoEsperado(f.escudo, POSTURA.ARRIBA),
      abajo: danoEsperado(f.escudo, POSTURA.ABAJO),
    },
  };

  // --- el modelo de vista: un escudo de los cinco que trae el archivo ------
  if (f.enMano.modelo && f.enMano.modelo !== "none") {
    const rel = f.enMano.modelo.replace(/^models\//, "");
    if (!existsSync(`${MODELOS}/${rel}`)) avisos.push(`${f.id}: falta ${rel}`);
    else {
      const r = extraerBicho(rel, {
        cuerpo: f.enMano.submodelo, base: MODELOS, salida: SALIDA, raizSalida: salidaComun(),
        quiero: Object.values(ANIMS), callar: true,
      });
      e.enMano.clave = r?.clave ?? null;
      e.enMano.submodelos = submodeloDe(`${MODELOS}/${rel}`, f.enMano.submodelo);
      e.enMano.secuencias = r?.secuencias ?? [];
      e.enMano.bytes = r?.bytes ?? 0;
    }
  }

  // --- y el del mundo, DOS veces: en la mano izquierda y a la espalda ------
  if (f.enElMundo.modelo && f.enElMundo.modelo !== "none" && f.enElMundo.cuerpo !== null) {
    const rel = f.enElMundo.modelo.replace(/^models\//, "");
    if (!existsSync(`${MODELOS}/${rel}`)) avisos.push(`${f.id}: falta ${rel}`);
    else {
      // `+1` porque va en la izquierda, y `+3` es el de la espalda.
      const enLaIzquierda = f.enElMundo.cuerpo + 1;
      const aLaEspalda = f.enElMundo.cuerpo + 3;
      const r = extraerBicho(rel, {
        cuerpo: enLaIzquierda, base: MODELOS, salida: SALIDA, raizSalida: salidaComun(),
        quiero: [`${f.enElMundo.animaciones}_idle`], callar: true,
      });
      const g = extraerBicho(rel, {
        cuerpo: aLaEspalda, base: MODELOS, salida: SALIDA, raizSalida: salidaComun(),
        quiero: [`${f.enElMundo.animaciones}_idle`], callar: true,
        // Mismo archivo y mismo esqueleto: las pistas ya están en el otro.
        pistasDe: r?.clave ?? null,
      });
      e.enElMundo.cuerpoEnLaMano = enLaIzquierda;
      e.enElMundo.cuerpoALaEspalda = aLaEspalda;
      e.enElMundo.clave = r?.clave ?? null;
      e.enElMundo.claveGuardado = g?.clave ?? null;
      e.enElMundo.submodelos = submodeloDe(`${MODELOS}/${rel}`, enLaIzquierda);
      e.enElMundo.bytes = (r?.bytes ?? 0) + (g?.bytes ?? 0);
    }
  }

  escudos.push(e);
  console.log(`  ${e.id.padEnd(22)} ${String(e.nombre ?? "").padEnd(20)} ${String(e.valor ?? "—").padStart(5)} oro`);
  console.log(`      arriba    ${String(e.escudo.bloqueoArriba).padStart(3)} % de bloqueo y pasa el ` +
    `${Math.round((e.escudo.danoQuePasa ?? 1) * 100)} %   ->  te llevas ${(e.medias.arriba * 100).toFixed(0)} %`);
  console.log(`      abajo     ${String(e.escudo.bloqueoAbajo).padStart(3)} % de anular el golpe entero` +
    `                ->  te llevas ${(e.medias.abajo * 100).toFixed(0)} %`);
  console.log(`      parry     x${e.escudo.multiplicadorDeParry}   (muertos: base ${e.escudo.parryBaseMuerto}, ` +
    `aguante ${e.escudo.aguanteMuerto}, nopush ${e.escudo.noEmpujaMuerto})`);
  console.log(`      en mano   ${String(e.enMano.modelo ?? "—").padEnd(28)} idx ${String(e.enMano.submodelo).padStart(2)}  ` +
    `${e.enMano.submodelos?.map((s) => s.nombre).join(" + ") ?? "—"}`);
  console.log(`      en mundo  ${String(e.enElMundo.modelo ?? "—").padEnd(28)} body ${String(e.enElMundo.cuerpoEnLaMano ?? "—").padStart(3)} ` +
    `${e.enElMundo.submodelos?.map((s) => s.nombre).join(" + ") ?? "—"}`);
}

// ── LOS CONTROLES ──────────────────────────────────────────────────────────
const malos = [];
const control = (que, bien, detalle = "") => {
  if (!bien) malos.push(`${que} — ${detalle}`);
  console.log(`  ${bien ? "ok  " : "MAL "} ${que.padEnd(58)} ${detalle}`);
};
console.log("\n  CONTROLES");

// 1. EL ORÁCULO DE LA MANO IZQUIERDA. `MODEL_BODY_OFS` es la mano DERECHA y un
//    escudo va en la izquierda: el submodelo tiene que acabar en `_lhand`, y el
//    de la espalda en `_sheath`. Si uno de los dos falla, el número está movido y
//    el escudo que se ve es otro.
for (const e of escudos) {
  if (!e.enElMundo.clave) continue;
  const rel = e.enElMundo.modelo.replace(/^models\//, "");
  const mano = submodeloDe(`${MODELOS}/${rel}`, e.enElMundo.cuerpoEnLaMano)[0];
  const espalda = submodeloDe(`${MODELOS}/${rel}`, e.enElMundo.cuerpoALaEspalda)[0];
  const raiz = mano.nombre.replace(/_lhand$/i, "");
  control(`${e.id} sale en la mano IZQUIERDA y su vaina es la suya`,
    /_lhand$/i.test(mano.nombre) && espalda.nombre === `${raiz}_sheath`,
    `${mano.nombre} y, dos más allá, ${espalda.nombre}`);
}

// 2. El de la vista tiene que ser el escudo que pide, no el primero del archivo:
//    `v_shields.mdl` trae cinco y el índice equivocado da otro escudo.
for (const e of escudos) {
  const pieza = e.enMano.submodelos?.find((s) => s.de > 1);
  if (!pieza) continue;
  control(`el escudo de vista de ${e.id} es el que pide el script`,
    pieza.indice === e.enMano.submodelo % pieza.de,
    `idx ${e.enMano.submodelo} -> ${pieza.indice} de ${pieza.de}: ${pieza.nombre}`);
}

// 3. Las tres secuencias del escudo tienen que estar. Sin la de bajar, el escudo
//    se queda levantado en pantalla después de soltarlo.
for (const e of escudos) {
  if (!e.enMano.clave) continue;
  control(`${e.id} trae sus tres secuencias de vista`,
    (e.enMano.secuencias?.length ?? 0) >= 3,
    `${e.enMano.secuencias?.length ?? 0}: ${(e.enMano.secuencias ?? []).join(", ")}`);
}

// 4. Y el ataque tiene que ser `hold-strike`. Si sale `strike-land` es que el
//    lector se ha vuelto a tragar el registro fantasma de `base_melee` — que es
//    justo el fallo que este experimento arregló.
for (const e of escudos) {
  control(`${e.id} registra un hold-strike y nada más`,
    e.ataque?.tipo === "hold-strike",
    `${e.ataque?.tipo ?? "—"}, teclas ${(e.ataque?.teclas ?? []).join("+")}`);
}

// 5. EL CONO, que es la cifra que decide si el escudo sirve o no. No es un
//    control de extracción: es que la cuenta del motor esté escrita y medida.
control("el cono de 175 grados mide 53,2 de verdad",
  Math.abs(semianguloReal(175) * 2 - 53.24) < 0.01,
  `umbral ${conoDelMotor(175).toFixed(4)} -> ±${semianguloReal(175).toFixed(2)}°`);

// 6. Y el orden por utilidad, que es lo único que un jugador nota: el escudo
//    urdualiano tiene que ser el mejor y el de madera el peor.
const porUtilidad = [...escudos].sort((a, b) => a.medias.arriba - b.medias.arriba);
control("el mejor escudo arriba es el urdualiano y el peor el de madera",
  porUtilidad[0]?.id === "shields_urdual" && porUtilidad.at(-1)?.id === "shields_wooden",
  porUtilidad.map((e) => `${e.id.replace("shields_", "")} ${(e.medias.arriba * 100).toFixed(0)}%`).join(" < "));

const bytes = escudos.reduce((s, e) => s + (e.enMano.bytes ?? 0) + (e.enElMundo.bytes ?? 0), 0);
mkdirSync(SALIDA, { recursive: true });
writeFileSync(`${SALIDA}/../escudos.json`, JSON.stringify({
  procedencia: {
    scripts: SCRIPTS, modelos: MODELOS,
    cuando: new Date().toISOString().slice(0, 10),
    nota: "Extraído de una instalación de Master Sword Rebirth. No se distribuye.",
  },
  // El cono real, horneado, para que el navegador no tenga que saber de radianes.
  cono: { declarado: 175, umbral: conoDelMotor(175), semianguloReal: semianguloReal(175) },
  escudos,
}, null, 1));

// ── LA PROCEDENCIA ─────────────────────────────────────────────────────────
const PROC = salidaComun("PROCEDENCIA.md");
const MARCA = "## Los ESCUDOS";
if (existsSync(PROC) && !readFileSync(PROC, "utf8").includes(MARCA)) {
  appendFileSync(PROC, `
${MARCA}

\`escudos.json\` y las carpetas \`viewmodels_v_shields_b*\` / \`weapons_p_weapons2_b*\`
las escribe \`node tools/escudos.mjs\` con el mismo lector de \`.mdl\` que las armas y
los bichos. De \`v_shields.mdl\` —cinco escudos en un archivo— se emite **uno**, el
que dice \`MODEL_VIEW_IDX\`, con sus tres secuencias; de \`p_weapons2.mdl\` —127
piezas— se emiten **dos**: la de la mano izquierda (\`MODEL_BODY_OFS + 1\`) y la de
la espalda (\`+ 3\`).

Los números del bloqueo no se copian: se leen del \`.script\` y se escriben en
\`escudos.json\`.

Vale lo de siempre: **está en \`build/\`, que está en \`.gitignore\`, y no se mueve
un byte a \`public/\`.**
`);
}

console.log(`\n  ${escudos.length} escudos, ${(bytes / 1024 / 1024).toFixed(2)} MB de malla y animación`);
if (avisos.length) console.log(`\n  AVISOS\n${avisos.map((a) => `    ${a}`).join("\n")}`);
console.log(`\n  escrito en      build/msr/escudos.json\n`);
if (malos.length) {
  console.error(`  ${malos.length} controles en rojo:\n${malos.map((m) => `    ${m}`).join("\n")}`);
  process.exit(1);
}
