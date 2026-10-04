// LOS OBJETOS EN EL SUELO: su modelo, su submodelo y su animación — el 71.
//
// ── Qué hornea esto y por qué no lo hacía `tools/armas.mjs` ────────────────
//
// `armas.mjs` extrae dos modelos por arma: el de primera persona y el de la
// MANO. Ninguno de los dos sirve para una cosa tirada en el suelo, porque un
// `.mdl` de objetos de Master Sword trae **tres submodelos por cosa** —mano
// derecha, mano izquierda y suelo— y hasta hoy el del suelo no se emitía:
// nadie lo necesitaba, porque en este puerto no había objetos en el suelo.
//
// Y el número del submodelo del suelo **no está escrito en ningún sitio**: lo
// calcula el evento `game_fall` del guion, con dos o tres órdenes, y cada
// familia de objetos con una cuenta distinta. Eso lo resuelve `caidaDe` en
// `src/bsp/script.js`, con su cita; aquí se usa y se COMPRUEBA.
//
// ── A quién se le hornea el modelo ─────────────────────────────────────────
//
// A los objetos que pueden acabar en el suelo de verdad, y hoy son DOS vías:
//
//   1. el `scriptfile` de cada `msitem_spawn` de Edana y de Gate City, que es
//      lo que un mapa puede soltar (el 71);
//   2. y lo que el JUGADOR puede llevar y por tanto soltar con la `c`: las
//      siete armas entre las que se elige al crear el personaje y los cuatro
//      objetos gratis, leídos de `nuevoPersonaje` de `build/msr/objetos.json`
//      (el 75, `CGenericItem::Drop`).
//
// No a los 760 del catálogo: son 221 MB de `.mdl` y el jugador no puede ver ni
// uno. La lista crece por una vía nueva y no por adivinarla — cuando haya botín
// de cadáver, entrará por ahí.
//
// Y la segunda vía es además el SEGUNDO CASO que le faltaba al lector de
// `game_fall`: una espada va por `base_weapon`, que cuenta `+2`, y la manzana
// por `health_apple`, que lo anula con `+1`. Con un solo caso el oráculo del
// `_floor` no podía distinguir «he leído el guion» de «he acertado el número».
//
// La regla del 02: **el lector es nuestro, el contenido no se copia.** Lo
// extraído vive en `build/msr/suelo/`, que está en `.gitignore`, y no se mueve
// un byte a `public/`.
//
//     npm run suelo

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";

import { leerMdl, TAM } from "../src/bsp/mdl.js";
import { leerFichaObjeto } from "../src/bsp/script.js";
import { extraerBicho } from "./bicho.mjs";
import { salidaComun, prepararComunes } from "./recursos.mjs";

const SCRIPTS = process.argv[2] ?? "../MSC/MSCScripts/scripts";
const MODELOS = "../MSC/assets/msr/models";
const SALIDA = salidaComun("suelo");
prepararComunes();

if (!existsSync(`${SCRIPTS}/items`)) {
  console.error(`No encuentro ${SCRIPTS}/items. Pásame la carpeta scripts/ de MSR.`);
  process.exit(1);
}

let fallos = 0;
function control(texto, bien, detalle = "") {
  console.log(`    ${bien ? "ok  " : "MAL "} ${texto.padEnd(62)} ${detalle}`);
  if (!bien) fallos++;
}

/**
 * El nombre del submodelo que elige un `body`. Es el ORÁCULO, y es el mismo que
 * usa `tools/armas.mjs`: `index = (body / base) % nummodels`
 * (`R_StudioSetupModel`). Un objeto del suelo tiene que caer en un submodelo
 * que se llame `<algo>_floor`, y si no, el número está mal.
 */
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
    out.push({
      indice: i, de: n,
      nombre: m.buf.toString("latin1", om, om + 64).split("\0")[0],
      vertices: m.buf.readInt32LE(om + 80),
    });
  }
  return out[0] ?? null;
}

// ── 1. QUIÉN PUEDE ACABAR EN EL SUELO, leído de los mapas horneados ────────
//
// De `malla.json`, que es lo que el navegador carga. Se lee del horneado y no
// del `.bsp` a propósito: lo que importa es lo que el juego va a pedir.
const MAPAS = ["edana", "gatecity"];
const pedidos = new Map();   // guion -> [de dónde sale]
const apunta = (guion, de) => {
  if (!pedidos.has(guion)) pedidos.set(guion, []);
  if (!pedidos.get(guion).includes(de)) pedidos.get(guion).push(de);
};

for (const mapa of MAPAS) {
  const ruta = `build/${mapa}/malla.json`;
  if (!existsSync(ruta)) { console.log(`  (${mapa} no está horneado, se salta)`); continue; }
  const m = JSON.parse(readFileSync(ruta, "utf8"));
  for (const d of m.disparadores ?? []) {
    if (d.clase !== "msitem_spawn" || !d.guion) continue;
    apunta(d.guion, mapa);
  }
}

// La segunda vía: lo que el jugador lleva encima. Sale del mismo sitio del que
// `src/juego/personaje.js` arma el personaje nuevo —`reg.newchar.*` de
// `global.script`, leído por `tools/objetos.mjs`—, así que si mañana hay otra
// arma de salida entra aquí sola y no hay que acordarse.
{
  const ruta = "build/msr/objetos.json";
  if (!existsSync(ruta)) {
    console.log(`  (${ruta} no está, se salta lo que el jugador puede soltar)`);
  } else {
    const { nuevoPersonaje: n } = JSON.parse(readFileSync(ruta, "utf8"));
    for (const g of n?.armas ?? []) apunta(g, "mano");
    for (const g of n?.gratis ?? []) apunta(g, "mochila");
  }
}

// LA TERCERA VÍA: LO QUE SUELTA UN BICHO AL MORIR — el 82.
//
// Faltaba, y el síntoma era exactamente el del 63: las dos mitades en verde y
// el viaje roto. El jabalí nacía con su pellejo encima y la muerte lo anunciaba,
// pero `Suelo.soltar` no encontraba el guion en este manifiesto y devolvía
// `null` **en silencio** — o sea que «el jabalí no suelta nada» y «el jabalí
// suelta algo que no sabemos dibujar» se veían igual.
//
// Sale de `ia.botin`, que `tools/bichos.mjs` hornea de los `DROP_ITEM` del
// guion. Así que si mañana un bicho nuevo declara otro objeto, entra aquí solo:
// es la misma idea que la vía del jugador, no una lista escrita a mano.
for (const mapa of MAPAS) {
  const ruta = `build/${mapa}/bichos.json`;
  if (!existsSync(ruta)) { console.log(`  (${mapa} no tiene censo de bichos, se salta su botín)`); continue; }
  const b = JSON.parse(readFileSync(ruta, "utf8"));
  for (const c of b.colocados ?? []) {
    for (const d of c.ia?.botin ?? []) {
      if (d?.objeto) apunta(d.objeto, `${mapa}:botín`);
    }
  }
}

// LA CUARTA VÍA: TODO LO QUE SE PUEDE EMPUÑAR — el 96.
//
// Desde que `tools/armas.mjs` hornea las 209 armas y hechizos del catálogo, un
// jugador puede llevar en la mano cualquiera de ellas, y la `c` la suelta. Si
// aquí no estaba, `Suelo.tirar` devolvía `null` («objeto_sin_guion») y
// `soltarDelInventario` se callaba: la Novablade **se quedaba en la mano** y no
// pasaba nada. Sale de la misma lista que `armas.mjs` —`arma` o `hechizo` en
// `objetos.json`—, así que crecen juntas.
//
// El navegador NO carga estas al entrar (`cargarSuelo` las marca perezosas por
// esta etiqueta): son doscientas y se pide cada una la primera vez que cae.
const EMPUNABLE = "empuñable";
{
  const ruta = "build/msr/objetos.json";
  if (existsSync(ruta)) {
    const { objetos: todos } = JSON.parse(readFileSync(ruta, "utf8"));
    for (const o of todos ?? []) if (o.tipo === "arma" || o.tipo === "hechizo") apunta(o.id, EMPUNABLE);
  }
}

console.log(`\nlo que puede acabar en el suelo — ${pedidos.size} guiones distintos\n`);

const objetos = [];
const sinGuion = [];
const avisos = [];

for (const [guion, mapas] of [...pedidos].sort()) {
  // `NewGenericItem(scriptfile)` devuelve NULL si el guion no existe, y
  // entonces el aparecedor **no pone nada** y no da un error
  // (gispawn.cpp:38-39). Eso es un resultado del mapa, no un fallo nuestro.
  const f = leerFichaObjeto(SCRIPTS, `items/${guion}`);
  if (!f) { sinGuion.push({ guion, mapas }); continue; }

  const rel = (f.enElMundo.modeloSuelo ?? f.enElMundo.modelo ?? "").replace(/^models\//, "");
  const cuerpo = f.enElMundo.cuerpoSuelo;
  const ficha = {
    id: f.id, guion, mapas, nombre: f.nombre, descripcion: f.descripcion,
    peso: f.peso, valor: f.valor, tipo: f.tipo,
    modelo: rel || null, cuerpo, animacion: f.enElMundo.animacionSuelo,
    sinLeer: f.enElMundo.sueloSinLeer, clave: null, submodelo: null, bytes: 0,
    // EL 97: su `game_fall` hace `deleteme` (`caidaDe`): se borra al soltarlo.
    seBorraAlCaer: Boolean(f.enElMundo.seBorraAlCaer),
  };

  if (!rel || rel === "none" || cuerpo === null) {
    avisos.push(`${guion}: sin modelo del suelo (${f.enElMundo.sueloSinLeer ?? "no declara MODEL_WORLD"})`);
    objetos.push(ficha);
    continue;
  }
  const ruta3d = `${MODELOS}/${rel}`;
  if (!existsSync(ruta3d)) { avisos.push(`${guion}: falta ${rel}`); objetos.push(ficha); continue; }

  ficha.submodelo = submodeloDe(ruta3d, cuerpo);
  const r = extraerBicho(rel, {
    cuerpo, base: MODELOS, salida: SALIDA, raizSalida: salidaComun(),
    // De un objeto tirado sólo hace falta su postura de estar tirado. El
    // `playanim` del `game_fall` la nombra; cuando no la nombra, el motor se
    // queda en la secuencia 0 y aquí se emite la 0 para poder dibujar lo mismo.
    quiero: f.enElMundo.animacionSuelo ? [f.enElMundo.animacionSuelo] : null,
    callar: true,
  });
  ficha.clave = r?.clave ?? null;
  ficha.bytes = r?.bytes ?? 0;
  ficha.secuencias = r?.secuencias ?? [];
  objetos.push(ficha);

  console.log(`  ${guion.padEnd(18)} ${String(f.nombre ?? "").padEnd(14)} ` +
    `${rel.padEnd(22)} body ${String(cuerpo).padStart(3)}  ` +
    `${ficha.submodelo?.nombre ?? "—"}  ${ficha.animacion ?? "(sin animación)"}`);
}

for (const s of sinGuion) {
  console.log(`  ${s.guion.padEnd(18)} NO EXISTE items/${s.guion}.script — ` +
    `su aparecedor no pone nada (gispawn.cpp:38-39)`);
}
for (const a of avisos) console.log(`  aviso: ${a}`);

// ── 2. LOS CONTROLES ───────────────────────────────────────────────────────
console.log(`\n  controles`);

// 1. EL ORÁCULO. Un objeto tirado cae en un submodelo que se llama `_floor`, y
//    eso lo dice el archivo y no mi diccionario. Es el control que separa «he
//    leído el `game_fall`» de «he acertado el número»: con el `+2` de la base
//    en vez del `+1` que la manzana declara, el submodelo es `oldbook_rhand` y
//    la manzana cae del árbol convertida en un libro viejo.
//    PERO ESTE CONTROL HEREDA EL SUPUESTO DE LA CLASE PARA LA QUE SE ESCRIBIÓ,
//    que es el 69 con otra ropa, y el 82 lo encontró al traer el botín de los
//    bichos: los tres pellejos (`skin_boar`, `skin_boar_heavy`, `skin_ratpelt`)
//    salían en ROJO cayendo en `apple_rhand`, el submodelo 0.
//
//    Y es correcto que caigan ahí. Su plantilla es `items/base_miscitem`, cuyo
//    `game_fall` sólo calcula el submodelo dentro de este `if`:
//
//        if ( MODEL_WORLD equals 'misc/p_misc.mdl' )   <- comillas SIMPLES
//
//    y una comilla simple no agrupa en este motor: `GetConst` no encuentra una
//    constante que se llame `'misc/p_misc.mdl'` y **devuelve el texto tal cual,
//    comillas incluidas** (script.cpp:350-354), que es lo que `FStrEq` compara
//    (scriptcmds.cpp:3997). Así que la condición es falsa SIEMPRE y el `else`
//    —`setmodelbody 0 0`— es la única rama que corre, en el juego también.
//
//    O sea que un pellejo tirado sale con el submodelo 0 en Master Sword, y
//    este puerto lo reproduce. Pedirle un `_floor` sería pedirle que se vea
//    mejor que el original. Se exime y se dice por qué, en vez de bajar el
//    listón para todos: para un arma el control sigue mordiendo igual.
//
//    ── CORRECCIÓN (2026-10-04): LO DE ARRIBA ERA FALSO ──────────────────────
//
//    `GetConst` es de la CARGA del guion. Al ejecutar, cada parámetro pasa por
//    `GetVar` (script.cpp:5745), que a un literal entre comillas simples le
//    QUITA las comillas y no lo resuelve (script.cpp:4405-4409). La condición es
//    cierta y los tres pellejos caen en su `_floor`, en el juego y —desde hoy—
//    aquí. Lo vio el usuario: la rata del anexo soltaba una manzana que al
//    cogerla era un pellejo. La exención se quita y el control vuelve a morder
//    para ellos. La regla está en `caidaDe` (src/bsp/script.js).
const SIN_FLOOR_PORQUE_EL_MOD = {
  // Dos del 96, con la cita entera en `SIN_FAMILIA_PORQUE_EL_MOD` de
  // tools/armas.mjs, que es el control que las encontró. (Los guanteletes de
  // hierro caen en `pole_floor`, que SÍ se llama `_floor`: aquí no hacen falta,
  // y lo suyo es `BORRA_AL_CAER`, más abajo.)
  blunt_staff_f_old: "MODEL_BODY_OFS 28 ya es un `_floor`; el +2 cae en `affliction_rhand` (blunt_staff_f_old.script:24)",
  bows_crossbow_heavy33: "NO_WORLD_MODEL 1 resta uno (base_weapon.script:65): cae en `xbow_p_lefthand`",
};
for (const o of objetos) {
  if (!o.submodelo || o.submodelo.de === 1) continue;
  if (SIN_FLOOR_PORQUE_EL_MOD[o.id]) {
    console.log(`    ··   el ${o.id} cae en \`${o.submodelo.nombre}\` Y ESO ES FIEL      ${SIN_FLOOR_PORQUE_EL_MOD[o.id]}`);
    continue;
  }
  control(`el ${o.id} del suelo cae en un submodelo \`_floor\``,
    /_floor$/i.test(o.submodelo.nombre),
    `body ${o.cuerpo} de ${o.submodelo.de} -> ${o.submodelo.nombre}`);
}

// 2. Y EL CONTRASTE, que es lo que hace que el de arriba no sea decorativo: se
//    calcula a mano lo que daría la fórmula vieja y se enseña qué sale. Si
//    coincidieran siempre, el lector de `game_fall` no haría falta.
const discrepan = [];
for (const o of objetos) {
  if (!o.submodelo || o.submodelo.de === 1) continue;
  const f = leerFichaObjeto(SCRIPTS, `items/${o.guion}`);
  if (f?.enElMundo.cuerpo === null || f?.enElMundo.cuerpo === undefined) continue;
  const otro = submodeloDe(`${MODELOS}/${o.modelo}`, f.enElMundo.cuerpo + 2);
  const mal = !/_floor$/i.test(otro?.nombre ?? "");
  if (mal) discrepan.push(`${o.id} -> ${otro?.nombre}`);
  console.log(`         (con la fórmula \`mano+2\`, ${o.id} saldría ${f.enElMundo.cuerpo + 2} ` +
    `-> ${otro?.nombre ?? "—"}${mal ? "   <- NO es del suelo" : ""})`);
}
// Y el contraste pasa a ser un CONTROL, que es lo que el 71 no pudo tener: con
// un solo caso —la manzana— «he leído el guion» y «he acertado el número» eran
// el mismo verde. Con los once de hoy la fórmula vieja falla en varios, así que
// el lector de `game_fall` tiene que estar leyendo de verdad. Si esta línea se
// pone en rojo, el `+2` bastaría y `caidaDe` sería adorno.
control(`la fórmula \`mano+2\` NO vale: falla en alguno`,
  discrepan.length > 0, `${discrepan.length} de ${objetos.length}: ${discrepan.join(", ") || "ninguno"}`);

// 3. Un objeto con animación tiene que traerla emitida: sin ella se dibuja en
//    el fotograma 0 de la secuencia 0, que en `p_misc.mdl` es `idle` y no es la
//    suya. No da error: da una manzana en la postura de otra cosa.
//
//    EL 96: con las armas entran tres casos que este control no podía ver con
//    trece objetos. Los que NO TIENEN modelo del mundo (`fist_bare`,
//    `base_weapon_new`) no tienen nada que animar: los cuenta el control 4 de
//    abajo. El huérfano (`HUERFANOS`) tampoco, y lo cuenta también el 4. Y los
//    dos guanteletes de hierro se BORRAN al caer (`BORRA_AL_CAER`): su animación
//    `gauntlets_floor_idle` no existe en `p_weapons3.mdl` porque en el juego no
//    llegan a posarse. Que aquí sí se posen es un PENDIENTE de `src/play/suelo.js`.
const HUERFANOS = {
  crossbow_heavy: "sus tres modelos (weapons/bows/v_, p_ y w_crossbow.mdl) no existen en assets/msr " +
    "y ningún guion ni mapa nombra el objeto: es un resto del mod que el motor ni podría precachear",
};
const BORRA_AL_CAER = {
  blunt_gauntlets_fe1: "`game_fall` -> `deleteme` (blunt_gauntlets_fe1.script:242-244)",
  blunt_gauntlets_fe2: "incluye blunt_gauntlets_fe1 (blunt_gauntlets_fe2.script:81)",
};
for (const o of objetos) {
  if (!o.animacion) continue;
  if (!o.modelo || o.modelo === "none" || HUERFANOS[o.id]) continue;
  if (BORRA_AL_CAER[o.id]) {
    console.log(`    ··   ${o.id} no se posa nunca: ${BORRA_AL_CAER[o.id]} — el 97: \`Suelo.tirar\` lo borra`);
    continue;
  }
  control(`${o.id} trae su animación de estar tirado`,
    (o.secuencias ?? []).includes(o.animacion),
    `${o.animacion}: ${(o.secuencias ?? []).join(", ") || "ninguna emitida"}`);
}
// EL 97: la lista POR NOMBRE de arriba y lo que LEE `caidaDe` (`deleteme` en el
// `game_fall`) tienen que ser lo mismo. Si un guion nuevo se borra al caer, o
// si el lector deja de verlo en los guanteletes, esto se pone rojo.
//
// La primera pasada se puso ROJA con el trabajo bien hecho: además de los dos
// guanteletes, `caidaDe` lee `deleteme` en los 31 HECHIZOS (`magic_hand_*`,
// todos heredan el `game_fall` de su base). Y es verdad, y además en el motor ni
// llegan ahí: `Drop` de un hechizo lo deshace antes de `FallInit` («Dropping
// spells fizzles them», genericitem.cpp:1371-1376). Así que la lista por
// nombre es de los que NO son hechizos, y los hechizos se exigen todos.
{
  const leidos = objetos.filter((o) => o.seBorraAlCaer && o.tipo !== "hechizo").map((o) => o.id).sort();
  const nombrados = Object.keys(BORRA_AL_CAER).sort();
  control("los que se borran al caer (no hechizos) son los que lee `caidaDe` (deleteme)",
    leidos.join(",") === nombrados.join(","), `leídos ${leidos.join(", ") || "ninguno"}`);
  const hechizos = objetos.filter((o) => o.tipo === "hechizo");
  const borran = hechizos.filter((o) => o.seBorraAlCaer).length;
  control("y los hechizos también se borran al caer", hechizos.length > 0 && borran === hechizos.length,
    `${borran} de ${hechizos.length}`);
}

// 4. Y que no se quede ninguno sin modelo **de los que el motor dibujaría**.
//
//    La diferencia la pone `Drop`: el modelo del mundo se pone sólo
//    `if (WorldModel.len())`, y dentro de ese `if` está el `ClearBits(pev->effects,
//    EF_NODRAW)` (genericitem.cpp:1345-1352). Un guion con `setworldmodel none`
//    deja `WorldModel` en cadena vacía (:1961-1962), así que al soltarlo **no se
//    le quita el NODRAW: está en el suelo y no se ve**. La mano de relámpago es
//    exactamente ese caso (magic_hand_base.script:24), y por eso no traer malla
//    es lo correcto y no un hueco. Separarlos es lo que impide que este control
//    se convierta en «los que he conseguido extraer».
{
  const sinMundo = objetos.filter((o) => !o.modelo || o.modelo === "none");
  const mudos = objetos.filter((o) => !o.clave && !sinMundo.includes(o) && !HUERFANOS[o.id]);
  for (const id of Object.keys(HUERFANOS)) {
    const o = objetos.find((x) => x.id === id);
    if (o) console.log(`    ··   ${id} sin malla Y ES DEL MOD — ${HUERFANOS[id]}`);
    // La salida de la exención: si un día el modelo aparece, sobra.
    if (o) control(`la exención de huérfano de ${id} sigue haciendo falta`, !o.clave, o.clave ?? "sin malla");
  }
  control(`todos los que TIENEN modelo del mundo traen malla`,
    mudos.length === 0, mudos.length ? mudos.map((o) => o.id).join(", ") : "ninguno sin malla");
  control(`y los que no, el motor tampoco los dibuja (EF_NODRAW)`,
    sinMundo.every((o) => !o.clave),
    sinMundo.length ? sinMundo.map((o) => o.id).join(", ") : "ninguno");
}

mkdirSync(SALIDA, { recursive: true });
writeFileSync(salidaComun("suelo.json"), JSON.stringify({
  procedencia: "derivado local de los .script y .mdl de Master Sword Rebirth, leídos no copiados. No redistribuible.",
  scripts: SCRIPTS, modelos: MODELOS,
  mapas: MAPAS,
  objetos,
  sinGuion,
}, null, 1));

const bytes = objetos.reduce((s, o) => s + (o.bytes ?? 0), 0);
console.log(`\n  escrito en      build/msr/suelo.json (${objetos.length} objetos, ${(bytes / 1024).toFixed(0)} KB de malla)\n`);
if (fallos) { console.error(`  ${fallos} control(es) en rojo.`); process.exit(1); }
