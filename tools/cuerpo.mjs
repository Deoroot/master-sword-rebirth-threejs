import { salidaComun, prepararComunes } from "./recursos.mjs";
// EL CUERPO DEL PERSONAJE: el modelo que sale en la pantalla de elección, en la
// de creación y en el inventario.
//
//   npm run cuerpo
//
// Regla del 02, igual que todo lo demás: se escribe el lector, lo extraído va a
// `build/`, y ni un byte pasa a `public/`.
//
// ── El modelo no es el que yo había escrito en el plan ──────────────────────
//
// En `MOCKUPS_13.md` dejé apuntado que la vista usaría `human/male1/male1.mdl` y
// `human/female1/female1.mdl`, uno por género. **Las dos mitades de esa frase
// son falsas**, y el código del mod lo dice sin ambigüedad:
//
//     vgui_choosecharacter.cpp:1190   Init( Idx, MODEL_HUMAN_REF );
//     player/modeldefs.h:3            // YOU NEED THIS (MODEL_HUMAN_REF) for
//                                     // animations even though it's the exact
//                                     // same as male1.... queer the way the
//                                     // engine works
//     player/modeldefs.h:5            #define MODEL_HUMAN_REF "models/human/reference.mdl"
//
// El modelo es `reference.mdl`. Y no es intercambiable con `male1.mdl`: la
// pantalla pide seis animaciones por nombre y **`male1.mdl` no tiene dos de
// ellas**, medido con nuestro propio lector:
//
//     reference.mdl   65 sec   idle attention stretch jump run sitdown   las 6
//     male1.mdl       58 sec   idle          jump run sitdown            faltan `attention` y `stretch`
//     female1.mdl     45 sec   las 6 — pero ver abajo
//
// `attention` es justamente la postura en la que está un personaje sin arma en
// la mano, o sea la que se ve **por defecto** al abrir la pantalla. Con
// `male1.mdl` no se habría visto un error: se habría visto a los tres
// personajes en `nod_yes`, que es la secuencia 0 y la que el motor pone cuando
// le piden una que no hay. Un personaje asintiendo con la cabeza en bucle pasa
// por «la animación de reposo es rara».
//
// ── Y el género no es un archivo: es un SUBMODELO ──────────────────────────
//
// `female1.mdl` existe en el disco y **el juego no lo carga nunca**:
//
//     modeldefs.h:13   #define MODEL_HUMAN_FEMALE1 "models/human/male1/male1.mdl"
//     modeldefs.h:18   //#define MODEL_HUMAN_FEM_HEAD "models/human/female1/head.mdl"
//
// El define femenino apunta al modelo masculino y las rutas de `female1/` están
// comentadas. Lo que de verdad cambia el género es el `body` de la entidad:
//
//     vgui_choosecharacter.cpp:1329   int gv = (gender == GENDER_MALE) ? 1 : 2;
//                                     m_Ent.SetBody(0, gv); ... SetBody(3, gv);
//
// y los cuatro `bodypart` de `reference.mdl` traen exactamente tres submodelos
// cada uno, leídos del archivo:
//
//     bp0 "legs"  base=1   [blank, legs_visible,  legs_visible_female ]
//     bp1 "head"  base=3   [blank, head_visible,  head_visible_female ]
//     bp2 "torso" base=9   [blank, torso_visible, torso_visible_female]
//     bp3 "arms"  base=27  [blank, arms_visible,  arms_visible_female ]
//
// Las bases 1, 3, 9, 27 son potencias de tres: `body` es **un número en base 3
// con un dígito por parte**, que es lo que el motor decodifica con
// `(body / base) % nummodels`. Así que los dos cuerpos no se eligen, se
// calculan: 1+3+9+27 = **40** para el hombre y 2+6+18+54 = **80** para la
// mujer. Aquí no hay ninguna constante escrita a mano.
//
// El submodelo 0 de cada parte es `blank`, y ése es el mecanismo de la armadura:
// una pieza de equipo marca la parte que tapa, el motor esconde el miembro
// propio y dibuja el suyo (`GearInfo.Flags`, `BodyParts[]` en esa misma
// función). No está portado —los objetos de cuerpo quedaron para después— pero
// el hueco por donde entra ya se sabe cuál es, y el control de aquí abajo lo
// usa.

import { writeFileSync, readFileSync, mkdirSync } from "node:fs";

import { leerMdl, TAM, texturasDe, mallaDe, porMatriz } from "../src/bsp/mdl.js";
import {
  leerSecuencias, leerHuesos, rigidezDeModelo, RIGIDO,
  clavesDeSecuencia, matricesEnFotograma,
} from "../src/bsp/mdlanim.js";
import { UNIDADES_POR_METRO as U } from "../src/bsp/lector.js";
import { extraerBicho, verticesCrudos } from "./bicho.mjs";

const MODELOS = "../MSC/assets/msr/models";
const MODELO = "human/reference";              // MODEL_HUMAN_REF
const SALIDA = salidaComun("cuerpos");
prepararComunes();

/**
 * Las seis animaciones de la pantalla, y **son datos y no código**: el cliente
 * las lee del registro de scripts, no las trae dentro.
 *
 *     scriptcmds.cpp:4922   DefaultHUDCharAnims.Idle_Weapon = SCRIPTVAR("reg.hud.char.active_weapon")
 *     global.script:43-48   local reg.hud.char.active_weapon 'idle'
 *                           local reg.hud.char.active_noweap 'attention'
 *                           local reg.hud.char.figet         'stretch'   (sic)
 *                           local reg.hud.char.highlight     'jump'
 *                           local reg.hud.char.upload        'run'
 *                           local reg.hud.char.inactive      'sitdown'
 *
 * Los nombres van tal cual, con la errata de `figet` incluida, porque es la
 * clave que hay que buscar si algún día esto falla.
 */
export const ANIMACIONES = {
  conArma: "idle",
  sinArma: "attention",
  tic: "stretch",
  senalado: "jump",
  subiendo: "run",
  inactivo: "sitdown",
};

/**
 * LAS DE LAS EMOCIONES — el 85, y es el 78 otra vez con otra ropa.
 *
 * La lista blanca de arriba sale de `global.script`, que es donde la PANTALLA DE
 * PERSONAJE dice qué animaciones quiere. Y el muñeco del HUD —`ms_lildude`, el
 * de abajo a la izquierda— usa el mismo horneado y le pide otras: las que pone
 * `playanim` cuando eliges una opción de tu propio menú, y ésas están en cuatro
 * archivos distintos (`player/emote_*.script`).
 *
 *     playanim hold sitdown         emote_sit&stand.script:54
 *     playanim once nod_yes         emote_yes.script:25
 *     playanim once nod_no          emote_no.script:25
 *     playanim hold attention       emote_idle.script:25
 *
 * Tres de las cuatro ya estaban por casualidad: `sitdown` y `attention` porque
 * la pantalla las pide también, y `nod_yes` porque **es la secuencia 0** y el
 * extractor emite siempre la primera. La que faltaba era `nod_no`, y no habría
 * dado ningún error: el visor cae a la primera secuencia que tenga, así que
 * «Emote: Nod No» habría hecho que el muñeco dijera **sí**.
 *
 * *El 78, literal: una lista blanca sólo mira donde sabe mirar, y el nombre puede
 * venir de otro archivo.*
 */
export const ANIMACIONES_DE_EMOCION = ["sitdown", "nod_yes", "nod_no", "attention"];

/**
 * Los dos cuerpos, CALCULADOS de las bases del archivo y no escritos.
 *
 * `digito` es 1 para el hombre y 2 para la mujer, que es el `gv` del cliente.
 */
export function cuerpoDe(m, digito) {
  let body = 0;
  for (let bp = 0; bp < m.nBodyparts; bp++) {
    const ob = m.offBodyparts + bp * TAM.bodypart;
    const nModelos = m.buf.readInt32LE(ob + 64);
    const base = m.buf.readInt32LE(ob + 68);
    if (nModelos <= digito) {
      throw new Error(
        `${m.nombre}: el bodypart ${bp} sólo tiene ${nModelos} submodelo(s) y el género pide el ${digito}`
      );
    }
    body += digito * base;
  }
  return body;
}

/**
 * EL MARCO: la caja que de verdad ocupa el cuerpo en las animaciones que se
 * emiten, animando los vértices y midiéndolos.
 *
 * No se usan los `bbmin`/`bbmax` del archivo, y **es el motivo de todo lo
 * anterior**: los de `reference.mdl` no describen su malla. Encuadrar la cámara
 * con ellos daría una figura cortada o diminuta según la secuencia, sin ningún
 * error de por medio.
 *
 * Y se mide sobre TODAS las secuencias que se emiten, no sobre la de reposo:
 * `jump` levanta al personaje del suelo y `sitdown` lo baja. Con la cámara
 * ajustada sólo a `attention`, la animación de señalar —que es `jump`— se sale
 * del cuadro. En el original eso no pasa porque la figura ocupa el 24 % de una
 * pantalla entera y le sobra sitio por todos lados; en una tarjeta de 132 px no
 * sobra nada.
 */
function marcoDe(m, huesos, secuencias, cuerpo, nombres) {
  const verts = verticesCrudos(m, cuerpo);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const pedidas = new Set(nombres.map((n) => n.toLowerCase()));
  for (const s of secuencias) {
    if (!pedidas.has(s.nombre.toLowerCase())) continue;
    const pistas = clavesDeSecuencia(m, s, huesos);
    for (let f = 0; f < Math.max(1, s.nFotogramas); f++) {
      const M = matricesEnFotograma(pistas, huesos, f);
      for (const { hueso, v } of verts) {
        const w = porMatriz(M[hueso] ?? M[0], v);
        for (let k = 0; k < 3; k++) {
          if (w[k] < min[k]) min[k] = w[k];
          if (w[k] > max[k]) max[k] = w[k];
        }
      }
    }
  }
  return { min, max };
}

/** Cuántos submodelos y con qué nombre trae cada parte. Para el informe. */
function partesDe(m) {
  const out = [];
  for (let bp = 0; bp < m.nBodyparts; bp++) {
    const ob = m.offBodyparts + bp * TAM.bodypart;
    const nModelos = m.buf.readInt32LE(ob + 64);
    const base = m.buf.readInt32LE(ob + 68);
    const off = m.buf.readInt32LE(ob + 72);
    const subs = [];
    for (let i = 0; i < nModelos; i++) {
      subs.push(m.buf.toString("latin1", off + i * TAM.modelo, off + i * TAM.modelo + 64).split("\0")[0]);
    }
    out.push({
      nombre: m.buf.toString("latin1", ob, ob + 64).split("\0")[0],
      base, submodelos: subs,
    });
  }
  return out;
}

// --- los controles, antes de escribir nada ---------------------------------

const ruta = `${MODELOS}/${MODELO}.mdl`;
const m = leerMdl(ruta);
if (!m.cuadra) {
  console.error(`  FALLO: ${MODELO}.mdl dice medir ${m.largo} y mide ${m.bytes}`);
  process.exit(1);
}
const secuencias = leerSecuencias(m);
const tiene = (n) => secuencias.some((s) => s.nombre.toLowerCase() === n.toLowerCase());

console.log(`\n  modelo          ${MODELO}.mdl · ${secuencias.length} secuencias, ${m.nBodyparts} partes`);
for (const p of partesDe(m)) {
  console.log(`    ${p.nombre.padEnd(6)} base=${String(p.base).padStart(2)}  [${p.submodelos.join(", ")}]`);
}

// CONTROL 1: las seis animaciones que la pantalla pide por NOMBRE.
const faltan = Object.entries(ANIMACIONES).filter(([, n]) => !tiene(n));
if (faltan.length) {
  console.error(`  FALLO: ${MODELO}.mdl no trae ${faltan.map(([k, n]) => `'${n}' (${k})`).join(", ")}`);
  process.exit(1);
}
console.log(`    animaciones   las 6 de global.script: ${Object.values(ANIMACIONES).join(", ")}`);

// CONTROL 1b (85): y las cuatro de las emociones, que vienen de OTROS cuatro
// archivos. Va aparte del control de arriba a propósito: si se metieran en el
// mismo `ANIMACIONES`, el día que alguien toque `global.script` no se sabría
// cuál de las dos listas se ha quedado corta.
{
  const sinEllas = ANIMACIONES_DE_EMOCION.filter((n) => !tiene(n));
  if (sinEllas.length) {
    console.error(`  FALLO: ${MODELO}.mdl no trae las emociones ${sinEllas.join(", ")}`);
    process.exit(1);
  }
  console.log(`    emociones     las 4 de player/emote_*.script: ${ANIMACIONES_DE_EMOCION.join(", ")}`);
}

// Y su CONTROL DE CONTROL: el modelo que yo había apuntado en el plan falla
// aquí. Sin esto, «las seis están» es una comprobación que no sabe decir no.
{
  const otro = leerMdl(`${MODELOS}/human/male1/male1.mdl`);
  const sec = leerSecuencias(otro).map((s) => s.nombre.toLowerCase());
  const sinEllas = Object.values(ANIMACIONES).filter((n) => !sec.includes(n.toLowerCase()));
  if (!sinEllas.length) {
    console.error(`  FALLO: male1.mdl también las trae todas, así que este control no distingue nada.`);
    process.exit(1);
  }
  console.log(`    (male1.mdl no trae ${sinEllas.join(", ")} — por eso el modelo es reference.mdl)`);
}

const HOMBRE = cuerpoDe(m, 1);
const MUJER = cuerpoDe(m, 2);
console.log(`    cuerpos       hombre body=${HOMBRE}, mujer body=${MUJER} (base 3, calculado de las bases del archivo)`);

// CONTROL 2: los dos cuerpos tienen que dar mallas DISTINTAS. Si el `body` no
// se decodifica bien, los dos salen iguales y no hay error: hay un juego donde
// elegir mujer no hace nada.
const texturas = texturasDe(m);
const mallas = {
  vacio: mallaDe(m, texturas, { cuerpo: 0 }),
  hombre: mallaDe(m, texturas, { cuerpo: HOMBRE }),
  mujer: mallaDe(m, texturas, { cuerpo: MUJER }),
};
if (mallas.hombre.triangulos === mallas.mujer.triangulos) {
  const iguales = mallas.hombre.grupos.every((g, i) =>
    g.pos.length === mallas.mujer.grupos[i]?.pos.length &&
    g.pos.every((v, j) => v === mallas.mujer.grupos[i].pos[j]));
  if (iguales) {
    console.error(`  FALLO: hombre y mujer dan la MISMA malla. El \`body\` no se está decodificando.`);
    process.exit(1);
  }
}
// CONTROL 3: `body = 0` son los cuatro `blank`, o sea ningún triángulo. Es el
// oráculo de la base 3: con las bases leídas como paso en vez de como potencia,
// el cero deja de caer en `blank` y esto lo caza.
if (mallas.vacio.triangulos !== 0) {
  console.error(`  FALLO: body=0 debería ser los cuatro 'blank' y da ${mallas.vacio.triangulos} triángulos.`);
  process.exit(1);
}
console.log(
  `    mallas        body=0 ${mallas.vacio.triangulos} tri (los cuatro 'blank'), ` +
  `hombre ${mallas.hombre.triangulos}, mujer ${mallas.mujer.triangulos}`
);

// CONTROL 4: EL ORÁCULO DE LA RIGIDEZ, que es el que manda para este archivo.
//
// El de la caja no vale aquí y está explicado en `rigidezDeModelo`: las cajas de
// `reference.mdl` no describen su propia malla, y se comprobó que no es nuestra
// lectura. Este otro no lee ninguna caja: mide que los huesos no se estiren.
const huesos = leerHuesos(m);
const rig = rigidezDeModelo(m, huesos, secuencias);
console.log(
  `    rigidez       el hueso que más se estira varía ${rig.peor.toFixed(3)} u en ${rig.donde}, ` +
  `media ${rig.media.toExponential(1)} u (tope ${RIGIDO})`
);
if (rig.peor > RIGIDO) {
  console.error(`  FALLO: ${MODELO}.mdl estira un hueso ${rig.peor.toFixed(1)} u. La descompresión está mal.`);
  process.exit(1);
}
// Y su control: con la escala de compresión quitada esto tiene que reventar. Sin
// esta línea, «la rigidez está bien» es otra comprobación que no sabe decir no.
{
  const sinEscala = huesos.map((h) => ({ ...h, escala: [1, 1, 1, 1, 1, 1] }));
  const roto = rigidezDeModelo(m, sinEscala, secuencias);
  if (roto.peor <= RIGIDO) {
    console.error(`  FALLO: sin la escala de compresión la rigidez da ${roto.peor.toFixed(1)} u y pasa. El juez no distingue.`);
    process.exit(1);
  }
  console.log(`    (sin la escala de compresión daría ${roto.peor.toFixed(0)} u — ${(roto.peor / rig.peor).toFixed(0)} veces más)`);
}

// --- y ahora sí, a disco ---------------------------------------------------

mkdirSync(SALIDA, { recursive: true });
// Las seis de la pantalla MÁS las cuatro de las emociones (85). Sin duplicar, y
// con `nod_no`, que es la que faltaba y no daba error: ver
// `ANIMACIONES_DE_EMOCION`.
const quiero = [...new Set([...Object.values(ANIMACIONES), ...ANIMACIONES_DE_EMOCION])];
const RAZON = "las cajas de secuencia de reference.mdl no describen su propia malla; " +
  "manda el oráculo de la rigidez (src/bsp/mdlanim.js)";
const generos = {};
let dueñoDeLasPistas = null;
for (const [genero, digito] of [["male", 1], ["female", 2]]) {
  console.log(`\n  ${genero}`);
  const r = extraerBicho(`${MODELO}.mdl`, {
    cuerpo: cuerpoDe(m, digito), base: MODELOS, salida: SALIDA, raizSalida: salidaComun(), quiero,
    sinOraculoDeCaja: RAZON,
    // El primero las trae; el segundo las toma prestadas.
    pistasDe: dueñoDeLasPistas,
  });
  if (!r) {
    console.error(`  FALLO: no está ${ruta}`);
    process.exit(1);
  }
  const marco = marcoDe(m, huesos, secuencias, cuerpoDe(m, digito), quiero);
  console.log(
    `    marco         ${marco.max[2] - marco.min[2] >= 0 ? (marco.max[2] - marco.min[2]).toFixed(1) : "?"} u de alto ` +
    `× ${(marco.max[1] - marco.min[1]).toFixed(1)} de ancho, con las ${quiero.length} animaciones`
  );
  generos[genero] = { ...r, genero, digito, marco };
  dueñoDeLasPistas ??= r.clave;
}

// CONTROL 5: que compartir las pistas sea CIERTO.
//
// «El `body` no toca los huesos» es una afirmación sobre el formato, y si fuera
// falsa el resultado no sería un error: sería una mujer animada con el esqueleto
// de otro cuerpo, que es exactamente el tipo de fallo que se ve como «la
// animación femenina va un poco rara». Así que se comprueba, comparando el
// esqueleto y las pistas de los dos `body` hueso a hueso y clave a clave.
{
  const iguales = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const fichaA = JSON.parse(readFileSync(`${SALIDA}/${generos.male.clave}/bicho.json`, "utf8"));
  const fichaB = JSON.parse(readFileSync(`${SALIDA}/${generos.female.clave}/bicho.json`, "utf8"));
  if (!iguales(fichaA.huesos.map((h) => `${h.nombre}|${h.padre}|${h.pos}|${h.quat}`),
               fichaB.huesos.map((h) => `${h.nombre}|${h.padre}|${h.pos}|${h.quat}`))) {
    console.error(`  FALLO: los dos géneros NO tienen el mismo esqueleto, así que no pueden compartir pistas.`);
    process.exit(1);
  }
  if (!iguales(fichaA.secuencias.map((s) => `${s.indice}|${s.nombre}|${s.fotogramas}|${s.fps}`),
               fichaB.secuencias.map((s) => `${s.indice}|${s.nombre}|${s.fotogramas}|${s.fps}`))) {
    console.error(`  FALLO: los dos géneros declaran secuencias distintas.`);
    process.exit(1);
  }
  if (fichaB.pistasDe !== generos.male.clave) {
    console.error(`  FALLO: la ficha femenina dice que sus pistas son de '${fichaB.pistasDe}'.`);
    process.exit(1);
  }
  // Y que de verdad NO las lleve: si las llevara, no habríamos ahorrado nada y
  // el navegador cargaría dos copias sin que nadie se enterase.
  const sobrantes = Object.keys(fichaB.bin.tramos).filter((k) => k.startsWith("sec"));
  if (sobrantes.length) {
    console.error(`  FALLO: la ficha femenina todavía trae ${sobrantes.length} tramos de pista.`);
    process.exit(1);
  }
  console.log(
    `\n  pistas          compartidas: ${generos.male.clave} las trae, ${generos.female.clave} las usa · ` +
    `${(generos.male.bytes / 1024).toFixed(0)} + ${(generos.female.bytes / 1024).toFixed(0)} KB ` +
    `en vez de ${((generos.male.bytes * 2) / 1024).toFixed(0)}`
  );
}

writeFileSync(`${salidaComun()}/cuerpos.json`, JSON.stringify({
  procedencia: `derivado local de models/${MODELO}.mdl de Master Sword Rebirth. No redistribuible.`,
  modelo: `models/${MODELO}.mdl`,
  unidadesPorMetro: U,
  // El juez que de verdad manda para este archivo, dicho en el manifiesto para
  // que no haya que ir a buscarlo.
  oraculo: { rigidez: { peor: rig.peor, donde: rig.donde, media: rig.media, tope: RIGIDO }, caja: RAZON },
  animaciones: ANIMACIONES,
  // El encuadre del original, para que la vista no se lo invente. Son los
  // números de `CRenderChar`: el modelo va a 5 unidades por delante del ojo,
  // 0,4 por encima, a escala 0,025, y girado 180° para mirar a la cámara.
  // El encuadre del original, para que la vista sepa de qué se aparta. Son los
  // números de `CRenderChar`: el modelo va a 5 unidades por delante del ojo,
  // 0,4 por encima, a escala 0,025, separados 2, y girado 180° para mirar a la
  // cámara. Con `default_fov 90` (hud.cpp:325) y 4:3, la vista mide 10 × 7,5
  // unidades a esa distancia, así que una figura de 72 u × 0,025 = 1,8 ocupa el
  // **24 % del alto**. Lo que se copia es el giro y las animaciones; el tamaño
  // no, y por eso está escrito aquí al lado de lo que sí.
  encuadre: { distancia: 5, alto: 0.4, escala: 0.025, separacion: 2, giro: 180, fov: 90, fraccionDelAlto: 0.24 },
  generos,
}, null, 1));
console.log(`\n  escrito en      build/msr/cuerpos.json y build/msr/cuerpos/\n`);
