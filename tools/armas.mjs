import { salidaComun, prepararComunes } from "./recursos.mjs";
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
// se copia.** Lo extraído vive en `build/msr/armas/`, que está en
// `.gitignore`, y no se mueve un byte a `public/`.

import { writeFileSync, mkdirSync, existsSync, appendFileSync, readFileSync } from "node:fs";

import { leerMdl, TAM } from "../src/bsp/mdl.js";
import { leerSecuencias, leerHuesos, clavesDeSecuencia, cabeEnLaCaja } from "../src/bsp/mdlanim.js";
import { leerFichaObjeto } from "../src/bsp/script.js";
import { PROYECTILES_DE_GUION } from "../src/play/proyectilguion.js";
import { BOLA_DE_MANA } from "../src/play/orion.js";
import { ESTALLIDOS } from "../src/play/fenix.js";
import { extraerBicho, verticesCrudos } from "./bicho.mjs";
import { vistaDeArma } from "./animvista.mjs";

const SCRIPTS = process.argv[2] ?? "../MSC/MSCScripts/scripts";
const MODELOS = "../MSC/assets/msr/models";
const SALIDA = salidaComun("armas");
prepararComunes();

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
//
// Hasta el 96 era la lista ENTERA de lo que se horneaba, y eso tenía un efecto
// que no daba ningún error: `empunar` busca el arma en este catálogo y, si no
// está, **cae a los puños** (src/main.js, `catalogos.armas?.get(id) ??
// catalogos.armas?.get("fist_bare")`). Un personaje con una Novablade en la mano
// pegaba con los puños, se veía con los puños y el ciclador ni la enseñaba —
// mientras `personaje.manos.derecha` decía `swords_novablade12`. Ver
// doc/ARMAS_96.md. Ahora estas ocho sólo marcan `dePartida`.
const PEDIDAS = [
  "items/fist_bare",
  "items/swords_rsword", "items/bows_treebow", "items/smallarms_rknife",
  "items/axes_rsmallaxe", "items/blunt_hammer1", "items/polearms_qs",
  "items/magic_hand_lightning_weak",
];

// ── QUÉ SE HORNEA DESDE EL 96: todo lo que se puede empuñar ────────────────
//
// El criterio es el del motor y no una lista: se empuña lo que el catálogo de
// objetos (`build/msr/objetos.json`, de `tools/objetos.mjs`, que corre antes
// que esto en `npm run recursos`) clasifica como `arma` o `hechizo`. Son 178 +
// 31; los hechizos comparten TODOS el mismo modelo de vista (`v_martialarts`,
// body 0, el de los puños), así que cuestan cero bytes de malla.
//
// Los bytes y el tiempo están medidos en doc/ARMAS_96.md. El navegador sólo
// carga este JSON al arrancar; la malla de cada arma se pide la primera vez que
// se empuña (`modelosDeArma` en src/main.js), así que hornear 200 armas no
// cuesta nada en el arranque.
const CATALOGO = salidaComun("objetos.json");
if (!existsSync(CATALOGO)) {
  console.error(`No encuentro ${CATALOGO}. Va antes \`npm run objetos\` (lo hace \`npm run recursos\`).`);
  process.exit(1);
}
const catalogo = JSON.parse(readFileSync(CATALOGO, "utf8"));
const EMPUNABLES = new Set(["arma", "hechizo"]);
const LISTA = [...new Set([
  ...PEDIDAS,
  ...catalogo.objetos.filter((o) => EMPUNABLES.has(o.tipo)).map((o) => o.ruta ?? `items/${o.id}`),
])];
const DE_PARTIDA = new Set(PEDIDAS.map((r) => r.replace(/^items\//, "")));

console.log(`\nlas armas de Master Sword — ${LISTA.length} fichas (${PEDIDAS.length} de partida)\n`);
const t0 = Date.now();

// ── 1. LEER TODAS LAS FICHAS, sin extraer nada todavía ────────────────────
//
// Antes se extraía arma por arma, y con ocho armas daba igual. Con doscientas
// no: VARIAS ARMAS COMPARTEN EL MISMO `(archivo, body)` —127 pares de vista y
// 124 de mundo para 178 armas— y cada `extraerBicho` sobrescribe la carpeta con
// SUS secuencias. Extraídas una detrás de otra, la última se quedaba con la
// carpeta y las demás perdían las suyas: un hacha que comparte filo con otra y
// pide la animación 5 se quedaba sin ella, sin un error. Así que primero se
// junta lo que pide cada carpeta y luego se extrae UNA vez con la unión.
const fichas = [];
const cotejo = [];
for (const ruta of LISTA) {
  const f = leerFichaObjeto(SCRIPTS, ruta);
  if (!f) { avisos.push(`${ruta}: no está el script`); continue; }
  // ── LA SECUENCIA DE CADA ATAQUE, que no es un campo del ataque ───────────
  //
  // La pone el `playviewanim` del evento `<retorno>_start` (giattack.cpp:345,
  // genericitem.cpp:2015-2033), así que se corre ese evento con el intérprete
  // y se apunta lo que deja puesto. Ver tools/animvista.mjs, que lleva las
  // citas y lo que se supone del que empuña. Va en `vista` de cada ataque; el
  // que no la tenga (un guion sin eventos) se queda con el sorteo de antes.
  const v = vistaDeArma(ruta, f.ataques, SCRIPTS);
  if (v) {
    f.ataques.forEach((a, i) => {
      const w = v.vistas[i];
      a.vista = {
        existe: w.existe, secuencias: w.secuencias, tardias: w.tardias.map((x) => ({ t: x.t, indice: x.indice })),
        sinModelo: w.sinModelo, otroModelo: w.otroModelo,
        sinResolver: w.sinResolver || w.tardias.some((x) => x.sinResolver),
      };
    });
    // EL COTEJO: lo que registra el intérprete contra lo que leyó la ficha.
    cotejo.push({ id: f.id, ficha: f.ataques.map((a) => a.retorno ?? "?"), interprete: v.registrados.map((r) => r.retorno) });
  }
  fichas.push(f);
}

/** Las secuencias que piden los ataques de una ficha por su `vista`. */
const deLaVista = (f) => f.ataques.flatMap((a) => [
  ...(a.vista?.secuencias ?? []), ...(a.vista?.tardias ?? []).map((x) => x.indice),
]);

const relDe = (m) => String(m ?? "").replace(/^models\//, "");
const tieneModelo = (m) => Boolean(m) && m !== "none";
/** clave de grupo -> { rel, cuerpo, quiero:Set, armas:[] } */
const grupos = new Map();
const pedir = (lado, rel, cuerpo, quiero, id) => {
  const k = `${lado}|${rel}|${cuerpo}`;
  if (!grupos.has(k)) grupos.set(k, { lado, rel, cuerpo, quiero: new Set(), armas: [], todas: false });
  const g = grupos.get(k);
  if (quiero === null) g.todas = true;
  else for (const q of quiero) g.quiero.add(String(q).toLowerCase());
  g.armas.push(id);
  return g;
};

const pedidoDe = new Map(); // id -> { vista, mundo, quieroVista }
for (const f of fichas) {
  const p = { vista: null, mundo: null, quieroVista: [] };
  if (tieneModelo(f.enMano.modelo)) {
    const rel = relDe(f.enMano.modelo);
    if (!existsSync(`${MODELOS}/${rel}`)) avisos.push(`${f.id}: falta ${rel}`);
    else {
      // Las secuencias que el script nombra, por número, y ninguna más: el
      // archivo de las espadas tiene 25 y un arma usa seis.
      const quiero = [
        f.animaciones.sacar, f.animaciones.parado, f.animaciones.guardar,
        ...f.animaciones.ataque,
        // El arco no tiene `ANIM_ATTACK`: tiene tensar y soltar, y sin ellas el
        // arco se queda quieto mientras dispara. Hasta el 23 sólo se emitía
        // `idle1` de `v_bows.mdl` — una secuencia de cuatro.
        f.animaciones.tensar, f.animaciones.disparar,
        // Y las que pone el `<retorno>_start` de cada ataque: la estocada de la
        // Blood Drinker es la 3 y no está entre sus `ANIM_ATTACK`.
        ...deLaVista(f),
      ].filter((v) => v !== null && v !== undefined);
      p.quieroVista = quiero;
      p.vista = pedir("vista", rel, f.enMano.submodelo ?? 0, quiero.length ? quiero : null, f.id);
    }
  }
  if (tieneModelo(f.enElMundo.modelo) && f.enElMundo.cuerpo !== null && f.enElMundo.cuerpo !== undefined) {
    const rel = relDe(f.enElMundo.modelo);
    if (!existsSync(`${MODELOS}/${rel}`)) avisos.push(`${f.id}: falta ${rel}`);
    // Del modelo del mundo sólo hace falta estar quieto en la mano.
    else p.mundo = pedir("mundo", rel, f.enElMundo.cuerpo, [`${f.enElMundo.animaciones}_idle`], f.id);
  }
  pedidoDe.set(f.id, p);
}

// ── 2. EXTRAER UNA VEZ POR CARPETA ─────────────────────────────────────────
//
// ── Y EL ORÁCULO DE LA CAJA, QUE CON LAS 200 ARMAS PARA EL HORNEADO ────────
//
// Con las ocho de partida no saltó nunca. Con todas, DOS ARCHIVOS lo suspenden:
//
//     v_2hblunts.mdl    (siete pares: blunt_bf, blunt_staff_i...)  el peor a 27,6 u
//     v_1hswordssb.mdl  (las seis del archivo, body 0 incluido)    el peor a 58,4 u
//
// y el segundo con **0 de 8 secuencias** dentro de su caja también en el body 0.
// La pregunta es la del 89 y la de `reference.mdl`: ¿la lectura está mal, o las
// cajas no describen la malla? El juez de la rigidez, que resolvió aquello, NO
// SIRVE aquí, medido: en `v_1hswordssb` da 0,000 u tanto bien leído como sin la
// escala de compresión (cinco huesos, ninguno se estira), o sea que no sabe
// decir que no; y en `v_1hswords` —que pasa la caja 25/25 a 0,0— da 1 728 u por
// el hueso `smdimport` de `crethrow`, que se va volando porque ES el lanzamiento.
//
// El juez que sí separa es el CONTRASTE con la lectura rota, el mismo que lleva
// al lado el de la rigidez: la caja medida con la escala de compresión quitada.
//
//     archivo#body             nuestra lectura    sin la escala
//     v_2hblunts#11              9/23  27,6 u      8/23  20 130 u
//     v_1hswordssb#0             0/8   43,5 u      0/8   18 878 u
//     v_1hswordssb#2             0/8   58,4 u      0/8   18 884 u
//     v_1hswords#1 (control)    25/25   0,0 u      0/25  66 163 u
//
// Entre lo nuestro y lo roto hay **tres órdenes de magnitud**, igual que en
// `reference.mdl` (2,9 contra 815). Así que la caja de esos dos archivos no
// describe su malla y la descompresión está bien. Se exime CON EL NÚMERO y sólo
// cuando el contraste lo dice: nuestra lectura por debajo de `HOLGURA` y la rota
// al menos `SEPARA` veces más lejos. Si un día un archivo suspende la caja y el
// contraste no separa, el horneado se para como antes.
const HOLGURA = 64;   // u: media vista de la pantalla; lo roto da 18 000
const SEPARA = 100;
function contrasteDeCaja(rel, cuerpo) {
  const m = leerMdl(`${MODELOS}/${rel}`);
  const huesos = leerHuesos(m);
  const secs = leerSecuencias(m);
  const v = verticesCrudos(m, cuerpo);
  const peorCon = (hs) => {
    let peor = 0, caben = 0;
    for (const s of secs) {
      const r = cabeEnLaCaja(s, clavesDeSecuencia(m, s, hs), hs, v);
      if (r.cabe) caben++;
      peor = Math.max(peor, r.peor);
    }
    return { peor, caben };
  };
  const bien = peorCon(huesos);
  const roto = peorCon(huesos.map((h) => ({ ...h, escala: [1, 1, 1, 1, 1, 1] })));
  return { bien, roto, de: secs.length, separa: bien.peor <= HOLGURA && roto.peor >= SEPARA * Math.max(1, bien.peor) };
}

const extraido = new Map(); // grupo -> resultado de extraerBicho
const eximidos = [];        // los que pasaron por el contraste, con sus números
for (const g of grupos.values()) {
  const opciones = {
    cuerpo: g.cuerpo, base: MODELOS, salida: SALIDA, raizSalida: salidaComun(),
    quiero: g.todas && !g.quiero.size ? null : [...g.quiero], callar: true,
  };
  let r;
  try {
    r = extraerBicho(g.rel, opciones);
  } catch (e) {
    if (!/de su caja|cabe en su caja/.test(String(e?.message))) throw e;
    const c = contrasteDeCaja(g.rel, g.cuerpo);
    const numeros = `nuestra ${c.bien.caben}/${c.de} a ${c.bien.peor.toFixed(1)} u, ` +
      `sin la escala ${c.roto.caben}/${c.de} a ${c.roto.peor.toFixed(0)} u`;
    if (!c.separa) throw new Error(`${g.rel}#${g.cuerpo}: suspende la caja y el contraste no separa (${numeros})`);
    const razon = `las cajas de secuencia de ${g.rel} no describen su malla; ` +
      `el contraste con la lectura rota separa (${numeros}). Ver tools/armas.mjs`;
    r = extraerBicho(g.rel, { ...opciones, sinOraculoDeCaja: razon });
    eximidos.push({ rel: g.rel, cuerpo: g.cuerpo, armas: g.armas, numeros });
  }
  extraido.set(g, r);
}
const segundos = (Date.now() - t0) / 1000;

// ── 3. LA FICHA DE CADA ARMA ───────────────────────────────────────────────
for (const f of fichas) {
  const arma = {
    id: f.id, nombre: f.nombre, descripcion: f.descripcion,
    peso: f.peso, tamano: f.tamano, valor: f.valor, tipo: f.tipo,
    dePartida: DE_PARTIDA.has(f.id),
    habilidad: f.arma?.habilidad ?? null,
    ataques: f.ataques, multiplicadorDeCarga: f.multiplicadorDeCarga,
    animaciones: f.animaciones, sonidos: f.sonidos,
    enMano: { ...f.enMano }, enElMundo: { ...f.enElMundo },
  };
  const p = pedidoDe.get(f.id);
  if (p?.vista) {
    const r = extraido.get(p.vista);
    arma.enMano.clave = r?.clave ?? null;
    arma.enMano.submodelos = submodelosDe(`${MODELOS}/${p.vista.rel}`, p.vista.cuerpo).submodelos;
    arma.enMano.secuencias = r?.secuencias ?? [];
    arma.enMano.detalleSecuencias = r?.detalleSecuencias ?? [];
    arma.enMano.pedidas = p.quieroVista;
    // Cuántas trae el ARCHIVO, no cuántas se emiten: hay guiones que piden una
    // que no existe (las espadas a dos manos piden `ANIM_SHEATH 7` y
    // `v_2hswords.mdl` tiene siete, de la 0 a la 6), y entonces el motor pone
    // la 0 (`if (sequence >= numseq) sequence = 0`, studiomodelrenderer.cpp:968).
    arma.enMano.secuenciasEnElArchivo = r?.oraculo?.de ?? null;
    arma.enMano.bytes = r?.bytes ?? 0;
    arma.enMano.compartida = p.vista.armas.length;
  }
  if (p?.mundo) {
    const r = extraido.get(p.mundo);
    arma.enElMundo.clave = r?.clave ?? null;
    arma.enElMundo.submodelos = submodelosDe(`${MODELOS}/${p.mundo.rel}`, p.mundo.cuerpo).submodelos;
    arma.enElMundo.secuencias = r?.secuencias ?? [];
    arma.enElMundo.bytes = r?.bytes ?? 0;
  }
  armas.push(arma);
  if (!arma.dePartida && !process.env.ARMAS_TODO) continue;
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
console.log(`\n  (las ${armas.length - DE_PARTIDA.size} que no son de partida no se listan; ARMAS_TODO=1 las enseña)`);

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
//
// DESDE EL 96, además, toda la munición que una de las armas horneadas pueda
// tirar: las flechas y saetas del catálogo (`proj_arrow_*`, `proj_bolt_*`) que
// casan por TEXTO con `sProjectileType` (giattack.cpp, ver `municion` en
// src/juego/arco.js), y los proyectiles con nombre propio que un ataque declara
// tal cual (`proj_arrow_phx` del Firebird, `proj_pole_spear` de las astas...).
const FLECHAS_DE_PARTIDA = ["items/proj_arrow_generic", "items/proj_arrow_wooden"];
const nombrados = new Set();
for (const f of fichas) {
  for (const a of f.ataques ?? []) {
    if (a.tipo === "charge-throw-projectile" && /^proj_/.test(String(a.proyectil ?? ""))) nombrados.add(a.proyectil);
  }
}
const FLECHAS = [...new Set([
  ...FLECHAS_DE_PARTIDA,
  ...catalogo.objetos.filter((o) => o.tipo === "proyectil" && /^proj_(arrow|bolt)_/.test(o.id)).map((o) => `items/${o.id}`),
  ...[...nombrados].map((id) => `items/${id}`),
])];
const flechas = [];
console.log(`\n  las flechas — ${FLECHAS.length} (las ${FLECHAS_DE_PARTIDA.length} de partida se listan)\n`);
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
      cuerpo: p.submodelo ?? 0, base: MODELOS, salida: SALIDA, raizSalida: salidaComun(),
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
//
// EL 96, AL PASAR DE 8 ARMAS A 200: el `+2` a ciegas suspendía a DOCE, y diez
// estaban bien. Los guanteletes y la ballesta ligera caen en el `+1`
// (`gauntlets_rhand`, `gauntlets_floor`: no tienen mano izquierda), y eso no lo
// adivina ninguna fórmula: lo calcula su `game_fall`. Ese lector existe desde el
// 71 —`caidaDe` en src/bsp/script.js, que da `cuerpoSuelo`— y `tools/suelo.mjs`
// ya se fía de él; este control seguía con el `+2` del 23. Ahora pregunta en
// este orden: lo que calcula el `game_fall`, lo que declara `PMODEL_IDX_FLOOR`
// y, sólo si no hay ninguno de los dos, el `+2`. Y dice cuántas discrepan del
// `+2` (el contraste del 71: si fueran cero, el lector sobraría).
//
// Y TRES QUE SUSPENDEN CON EL SUELO BIEN LEÍDO, eximidas por nombre y con la
// cita, no bajando el listón:
const SIN_FAMILIA_PORQUE_EL_MOD = {
  blunt_gauntlets_fe1: "su `game_fall` es `deleteme` (blunt_gauntlets_fe1.script:242-244): " +
    "al soltarlo se BORRA y no llega a estar en el suelo; el `+1` de la base cae en `pole_floor`, que no se ve nunca",
  blunt_gauntlets_fe2: "incluye blunt_gauntlets_fe1 (blunt_gauntlets_fe2.script:81), con su `deleteme`",
  blunt_staff_f_old: "`MODEL_BODY_OFS 28` (blunt_staff_f_old.script:24) cae en `phlames_floor`: " +
    "el bastón viejo se empuña con el submodelo del SUELO de otro. Es el dato del guion",
  bows_crossbow_heavy33: "declara `NO_WORLD_MODEL 1` (bows_crossbow_heavy33.script:22) y `base_weapon` resta " +
    "uno por eso (base_weapon.script:65): cae en `xbow_p_lefthand`, aunque el archivo SÍ trae `xbow_p_floor` en el 15",
};
const discrepanDelMasDos = [];
const eximidasUsadas = new Set();
for (const a of armas) {
  if (!a.enElMundo.clave || a.enElMundo.cuerpo === null) continue;
  const rel = a.enElMundo.modelo.replace(/^models\//, "");
  const leido = a.enElMundo.cuerpoSuelo ?? a.enElMundo.suelo ?? null;
  const iSuelo = leido ?? a.enElMundo.cuerpo + 2;
  const donde = a.enElMundo.cuerpoSuelo !== null && a.enElMundo.cuerpoSuelo !== undefined
    ? `en el ${iSuelo}, como calcula su game_fall`
    : leido !== null ? `en el ${iSuelo}, como dice PMODEL_IDX_FLOOR` : "dos más allá";
  if (leido !== null && leido !== a.enElMundo.cuerpo + 2) discrepanDelMasDos.push(a.id);
  const mano = submodelosDe(`${MODELOS}/${rel}`, a.enElMundo.cuerpo).submodelos[0];
  const suelo = submodelosDe(`${MODELOS}/${rel}`, iSuelo).submodelos[0];
  const raiz = suelo.nombre.replace(/_floor$/i, "");
  const bien = /_floor$/i.test(suelo.nombre) && mano.nombre.startsWith(raiz);
  if (!bien && SIN_FAMILIA_PORQUE_EL_MOD[a.id]) {
    eximidasUsadas.add(a.id);
    console.log(`  ··   el ${a.id} del mundo: ${mano.nombre} / ${suelo.nombre} Y ES FIEL — ${SIN_FAMILIA_PORQUE_EL_MOD[a.id]}`);
    continue;
  }
  control(`el ${a.id} del mundo cae en el juego de ${raiz}`, bien,
    `${mano.nombre} y, ${donde}, ${suelo.nombre}`);
}
// La exención tiene su propio control de salida: si una eximida pasa sin ella,
// la razón es falsa y hay que quitarla (lo mismo que `sinOraculoDeCaja` en
// bicho.mjs).
for (const id of Object.keys(SIN_FAMILIA_PORQUE_EL_MOD)) {
  control(`la exención de ${id} sigue haciendo falta`, eximidasUsadas.has(id),
    eximidasUsadas.has(id) ? "suspende sin ella" : "pasa sin ella: quítala");
}
control("el `+2` NO vale para todas: el game_fall discrepa en alguna",
  discrepanDelMasDos.length > 0, `${discrepanDelMasDos.length} de ${armas.length}`);

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
//
//    EL 96 lo cambió de CONTAR a COMPROBAR UNA POR UNA, en las dos direcciones:
//    contaba `emitidas >= pedidas` con las pedidas repetidas, y la Novablade
//    pide `ANIM_ATTACK1..3 = 2, 2, 2` —tres veces la misma— y suspendía con
//    sus tres secuencias bien emitidas (once espadas a dos manos igual). Y al
//    revés era peor: con carpetas compartidas, `secuencias` trae las que piden
//    LAS OTRAS armas de la carpeta, y contar habría aprobado un arma a la que le
//    faltara la suya. Ahora cada índice pedido tiene que estar en
//    `detalleSecuencias`, por índice o por nombre.
for (const a of armas) {
  if (!a.enMano.clave) continue;
  // Y las de la `vista` de sus ataques, que pueden no estar en `ANIM_ATTACK`.
  // Menos las que el ARCHIVO no tiene: un guion puede pedir una secuencia que
  // no existe y entonces el motor pone la 0 (`if (sequence >= numseq) sequence
  // = 0`, studiomodelrenderer.cpp:968); ésas se cuentan aparte, más abajo.
  const tope = a.enMano.secuenciasEnElArchivo ?? Infinity;
  const deVista = a.ataques.flatMap((x) => [...(x.vista?.secuencias ?? []), ...(x.vista?.tardias ?? []).map((y) => y.indice)])
    .filter((i) => i < tope);
  const pide = [...new Set([a.animaciones.parado, ...a.animaciones.ataque, ...deVista]
    .filter((v) => v !== null && v !== undefined).map(String))];
  // DE DISCO, no de lo que devolvió la extracción: la rotura deliberada del
  // 96 (extraer arma por arma) dejó este control VERDE con la carpeta de los
  // puños pisada por la del relámpago, porque cada arma leía SU extracción.
  const enDisco = JSON.parse(readFileSync(`${SALIDA}/${a.enMano.clave}/bicho.json`, "utf8")).secuencias;
  const hay = new Set(enDisco.flatMap((s) => [String(s.indice), String(s.nombre).toLowerCase()]));
  const faltan = pide.filter((p) => !hay.has(p.toLowerCase()));
  control(`${a.id} trae sus ${pide.length} secuencias`, faltan.length === 0,
    faltan.length ? `faltan ${faltan.join(", ")}` : `${pide.join(", ")} de ${a.enMano.secuencias.join(", ")}`);
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
//
//    La ballesta de repetición dice `0;0` DE VERDAD (bows_sxbow.script:61): tira
//    saetas `HITSCAN_BOLT`, que no vuelan, así que la velocidad le da igual. Se
//    exime por nombre; el control sigue mordiendo a cualquier arco que la lea mal.
const TENSAR_CERO_PORQUE_EL_MOD = {
  bows_sxbow: "`local reg.attack.hold_min&max 0;0` (bows_sxbow.script:61); sus saetas son HITSCAN_BOLT",
};
for (const a of armas) {
  const tiro = a.ataques.find((x) => x.tipo === "charge-throw-projectile");
  if (!tiro) continue;
  const tensa = Array.isArray(tiro.sostener) && tiro.sostener.length === 2 && tiro.sostener[1] > 0;
  if (!tensa && TENSAR_CERO_PORQUE_EL_MOD[a.id]) {
    console.log(`  ··   ${a.id} no tensa (${(tiro.sostener ?? []).join(";")}) Y ES FIEL — ${TENSAR_CERO_PORQUE_EL_MOD[a.id]}`);
  } else control(`${a.id} declara los dos tiempos de tensar`, tensa,
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

// 5b. EL 98: LAS ASTAS QUE LANZAN, y son las que lo dicen, no todas. `polearms_base`
//     registra el lanzamiento fuerte DENTRO de `if ( POLE_CAN_POWER_THROW )`
//     (polearms_base.script:298) y declara la constante a 0 (:117); un asta lo
//     tiene sólo si declara `const POLE_CAN_POWER_THROW 1` antes de incluirla
//     (`const` gana el primero, script.cpp:5419-5433). Hasta el 98 el lector no
//     miraba la condición y SEIS astas —qs, ba, hal, nag, sp, har— salían con un
//     tiro que en el juego no existe. El control lee el guion crudo de cada asta y
//     exige que tenga lanzamiento justo si lo declara: en los dos sentidos.
{
  const astas = armas.filter((a) => /^polearms_/.test(a.id) && a.id !== "polearms_test");
  let bien = 0;
  const mal = [];
  for (const a of astas) {
    const ruta = `${SCRIPTS}/items/${a.id}.script`;
    const declara = existsSync(ruta) && /^\s*const\s+POLE_CAN_POWER_THROW\s+1\b/m.test(readFileSync(ruta, "latin1"));
    const tiene = a.ataques.some((x) => x.tipo === "charge-throw-projectile");
    if (declara === tiene) bien++; else mal.push(`${a.id} (declara ${declara}, tiene ${tiene})`);
  }
  const lanzan = astas.filter((a) => a.ataques.some((x) => x.tipo === "charge-throw-projectile")).length;
  control("un asta lanza si y sólo si declara POLE_CAN_POWER_THROW 1 (polearms_base.script:298)",
    mal.length === 0 && astas.length > 0,
    `${bien} de ${astas.length} bien, ${lanzan} lanzan${mal.length ? `; mal: ${mal.join(", ")}` : ""}`);
}

// 5c. LA SECUENCIA DE CADA ATAQUE (tools/animvista.mjs). Tres controles, y el
//     primero es el que defiende a los otros dos: si el intérprete y el lector
//     de fichas no registran los mismos ataques EN EL MISMO ORDEN, la `vista`
//     de uno se le colgaría a otro sin dar error.
const vistas = { ataques: 0, conSecuencia: 0, soloDespues: 0, noTocan: 0, sinResolver: [], sinModelo: [], otroModelo: [], fueraDelArchivo: [] };
{
  // El cotejo mira sólo los ataques que la ficha se ha quedado: el lector tira
  // los de detrás de un `if` viejo falso (el 99) y el intérprete no los llega a
  // registrar, así que los dos tienen que dar la misma lista.
  const mal = cotejo.filter((c) => c.ficha.join(",") !== c.interprete.map((r) => (r === "reg.attack.callback" ? "?" : r)).join(","));
  // NO para el horneado: la `vista` se cuelga por el NOMBRE del retorno de cada
  // ataque de la ficha y no por su índice, así que un orden distinto no la
  // descoloca. Se cuenta y se guarda, que es un hueco del lector y no de esto.
  vistas.cotejoDistinto = mal.map((c) => `${c.id}: ficha [${c.ficha}] intérprete [${c.interprete}]`);
  for (const a of armas) {
    for (const x of a.ataques) {
      if (!x.vista) continue;
      vistas.ataques++;
      if (x.vista.secuencias.length) vistas.conSecuencia++;
      else if (x.vista.tardias.length) vistas.soloDespues++;
      else vistas.noTocan++;
      if (x.vista.sinResolver) vistas.sinResolver.push(`${a.id}/${x.retorno}`);
      if (x.vista.sinModelo) vistas.sinModelo.push(`${a.id}/${x.retorno}`);
      if (x.vista.otroModelo.length) vistas.otroModelo.push(`${a.id}/${x.retorno}`);
      const tope = a.enMano.secuenciasEnElArchivo;
      if (tope !== null && tope !== undefined && [...x.vista.secuencias, ...x.vista.tardias.map((y) => y.indice)].some((i) => i >= tope)) {
        vistas.fueraDelArchivo.push(`${a.id}/${x.retorno}`);
      }
    }
  }
  const de = (id, retorno) => armas.find((a) => a.id === id)?.ataques.find((x) => x.retorno === retorno)?.vista ?? null;
  // El número va escrito A MANO, con su cita: es la regla (CLAUDE.md §4, el 75).
  const bd = de("swords_blood_drinker", "special_01");
  control("el golpe cargado de la Blood Drinker pone ANIM_LUNGE, la 3 (swords_blood_drinker.script:20 y :187)",
    JSON.stringify(bd?.secuencias) === "[3]", JSON.stringify(bd?.secuencias));
  const bn = de("swords_blood_drinker", "melee");
  control("y el normal, ANIM_ATTACK1, la 2 (:16 y :56; base_melee.script:137)",
    JSON.stringify(bn?.secuencias) === "[2]", JSON.stringify(bn?.secuencias));
  const q1 = de("polearms_qs", "attack_poke1"), q2 = de("polearms_qs", "attack_poke2");
  control("el bastón: la estocada es VANIM_POKE1, la 4, y la cargada VANIM_POKE2, la 5 (polearms_base.script:36-37, :480, :486, :531)",
    JSON.stringify(q1?.secuencias) === "[4]" && JSON.stringify(q2?.secuencias) === "[5]",
    `${JSON.stringify(q1?.secuencias)} y ${JSON.stringify(q2?.secuencias)}`);
  const rs = de("swords_rsword", "melee");
  control("la espada oxidada sortea entre sus tres, una por cara del dado (swords_base_onehanded.script:26-35)",
    JSON.stringify(rs?.secuencias) === "[2,3,4]", JSON.stringify(rs?.secuencias));
  console.log(`
  la vista de los ataques: ${vistas.ataques} ataques, ${vistas.conSecuencia} ponen secuencia al empezar, ` +
    `${vistas.soloDespues} sólo después, ${vistas.noTocan} no la tocan; ${vistas.sinResolver.length} sin resolver, ` +
    `${vistas.sinModelo.length} quitan el modelo, ${vistas.otroModelo.length} usan otro modelo, ` +
    `${vistas.fueraDelArchivo.length} piden una que el archivo no tiene; cotejo distinto en ${vistas.cotejoDistinto.length} armas`);
}

// 6. Y la flecha tiene que traer daño y modelo. El daño es un dado del script
//    (`$rand(30,60)`) y leerlo como un número deja la flecha a cero, que no se
//    ve como un error: se ve como un arco que no hace nada.
//
// ── EL 96: LA MUNICIÓN QUE NO ES UNA FLECHA DE ARCO ───────────────────────
//
// Estos dos controles se escribieron para dos flechas de arco, y con las 39 de
// hoy heredan su supuesto (el 69). Dos clases de excepción, que NO son la misma:
//
//   PLACEHOLDER: `PROJ_DAMAGE 0` o `1` «via tossprojectile only». El daño de
//     estos proyectiles NO es un dado: lo hace su propio guion con `xdodamage`
//     al chocar (proj_pole_spear.script:67, proj_arrow_spiral.script:100...).
//     Ojo con los de `1`: el control viejo los APROBABA (`max > 0`), o sea que
//     la lanza arrojadiza del bastón salía verde con 1 de daño. El 4 del
//     CLAUDE.md. Aquí se dicen todos, y su daño de verdad es un PENDIENTE: este
//     puerto no corre el guion de un proyectil.
//   COMILLAS: `proj_arrow_frost` escribe `'$rand(60,100)'` entre comillas
//     simples (proj_arrow_frost.script:10). El lector no lo lee, y qué hace el
//     motor con esas comillas en un `const` no está medido. PENDIENTE, no fiel.
//     (EL 97: medido. Un `const` pasa al cargar por `GetVar`, que trata lo que
//     va entre comillas simples como un literal y se las QUITA (script.cpp:41,
//     :4406-4410, :5410): guarda `$rand(60,100)`, igual que la flecha gratis
//     guarda `$rand(30,60)`. Pega 60-100. Lo lee `valorDeConst` en
//     src/bsp/script.js, y el control de abajo exige ESE dado.)
//
// Ninguna de las dos se aprueba: se escriben aparte y se cuentan.
//
// EL 97: el daño de guion de los doce está en `src/play/proyectilguion.js`
// (`PROYECTILES_DE_GUION`), y la lista de aquí tiene que ser la misma: si un
// proyectil nuevo trae un daño de relleno, o si la tabla pierde uno, rojo. Los
// que la tabla marca `portado: false` siguen en `pendientes`.
const DANO_POR_GUION = new Set([
  "proj_pole_a", "proj_pole_dra", "proj_pole_harpoon", "proj_pole_holy", "proj_pole_ph",
  "proj_pole_sl", "proj_pole_spear", "proj_pole_ti", "proj_pole_trident",
  "proj_arrow_spiral", "proj_ub", "proj_arrow_phx",
]);
// EL 97: ya se lee. Se queda como lista de los que tienen que traer EXACTAMENTE
// el dado de su línea entrecomillada.
const DANO_ENTRECOMILLADO = { proj_arrow_frost: { min: 60, max: 100, cita: "proj_arrow_frost.script:10" } };
{
  const enTabla = Object.keys(PROYECTILES_DE_GUION).sort().join(",");
  control("la lista de daño de relleno es la tabla de src/play/proyectilguion.js",
    [...DANO_POR_GUION].sort().join(",") === enTabla, `${DANO_POR_GUION.size} aquí, ${Object.keys(PROYECTILES_DE_GUION).length} en la tabla`);
}
const pendientes = [];
/** La línea `gravity N` del propio guion del proyectil, para citarla. */
function gravedadDelGuion(id) {
  const ruta = `${SCRIPTS}/items/${id}.script`;
  if (!existsSync(ruta)) return null;
  const lineas = readFileSync(ruta, "latin1").split(/\r?\n/);
  for (let i = 0; i < lineas.length; i++) {
    const m = lineas[i].match(/^\s*gravity\s+([\d.]+)/i);
    if (m) return { valor: Number(m[1]), cita: `${id}.script:${i + 1}` };
  }
  return null;
}
for (const f of flechas) {
  if (DANO_POR_GUION.has(f.id)) {
    const r = PROYECTILES_DE_GUION[f.id];
    if (!r?.portado) pendientes.push(`${f.id}: daño ${f.dano?.min}-${f.dano?.max} es el PROJ_DAMAGE de relleno; el de verdad lo hace su guion (${r?.cita ?? "?"}) y no está portado`);
    control(`${f.id} declara el daño de relleno (≤ 1), no un dado`, (f.dano?.max ?? 0) <= 1,
      `${f.dano?.min}-${f.dano?.max}: si fuera un dado, sobraría de la lista`);
  } else if (DANO_ENTRECOMILLADO[f.id]) {
    const q = DANO_ENTRECOMILLADO[f.id];
    control(`${f.id} trae el dado de su línea entre comillas simples (${q.cita})`,
      f.dano?.min === q.min && f.dano?.max === q.max, `${f.dano?.min}-${f.dano?.max}`);
  } else {
    control(`${f.id} trae su dado de daño`,
      Boolean(f.dano) && f.dano.max > 0, `${f.dano?.min}-${f.dano?.max}`);
  }
  // LA GRAVEDAD. Una flecha de arco cae menos que una piedra, y eso sigue
  // mordiendo. Pero una saeta `HITSCAN_BOLT` dice `gravity 0` y la del Fénix
  // `gravity 1` DE VERDAD: para ésas, lo que se exige es que lo leído sea
  // exactamente lo que escribe su guion, y se cita la línea.
  const g = gravedadDelGuion(f.id);
  if (f.gravedad > 0 && f.gravedad < 1) {
    control(`${f.id} cae menos que una piedra`, true, `gravity ${f.gravedad} de 1`);
  } else {
    control(`${f.id} cae como dice su guion`, g !== null && g.valor === f.gravedad,
      `gravity ${f.gravedad}, y ${g ? `${g.cita} dice ${g.valor}` : "su guion no la escribe"}`);
  }
  control(`${f.id} trae su modelo`, Boolean(f.clave), `${f.clave}`);
}

// ── EL 100: LA BOLA DE MANÁ DEL ORION BOW, que no es una flecha ────────────
//
// `items/proj_mana2` es un NPC (`createnpc`, bows_orion1.script:189) con
// `setmodel none` (proj_mana2.script:21): lo que se VE es un efecto de cliente
// con el submodelo 13 de `weapons/projectiles.mdl` (proj_mana2_cl.script:2,
// :57). No tiene ficha de objeto que leer, así que sus números vienen de
// `BOLA_DE_MANA` (src/play/orion.js), con su cita, y aquí sólo se hornea el
// modelo. Va en una lista aparte (`bolas`) y no en `flechas`: no es munición,
// no tiene dado y los controles de arriba no le aplican.
const bolas = [];
{
  const b = BOLA_DE_MANA;
  const bola = { id: b.id, modelo: b.modelo, submodelo: b.submodelo, clave: null, secuencias: [], bytes: 0 };
  if (existsSync(`${MODELOS}/${b.modelo}`)) {
    const r = extraerBicho(b.modelo, {
      cuerpo: b.submodelo, base: MODELOS, salida: SALIDA, raizSalida: salidaComun(),
      quiero: null, callar: true,
    });
    bola.clave = r?.clave ?? null;
    bola.secuencias = r?.secuencias ?? [];
    bola.bytes = r?.bytes ?? 0;
    bola.pieza = submodelosDe(`${MODELOS}/${b.modelo}`, b.submodelo).submodelos[0]?.nombre ?? null;
  } else avisos.push(`${b.id}: falta ${b.modelo}`);
  bolas.push(bola);
  console.log(`\n  la bola de maná   ${bola.clave ?? "sin modelo"} (submodelo ${b.submodelo}: ${bola.pieza ?? "?"})`);
  control(`${b.id} trae su modelo`, Boolean(bola.clave), `${bola.clave}`);
  // El oráculo del nombre, como con las armas: el 13 de `projectiles.mdl` es
  // `aura_01`, un aura; si sale una lanza o una flecha, el número está mal.
  control(`${b.id} es el submodelo «aura_01» (proj_mana2_cl.script:57)`, bola.pieza === "aura_01", `${bola.pieza}`);
}

// ── LOS ESTALLIDOS: lo que se VE cuando un proyectil revienta ─────────────
//
// La llamarada de la flecha del Fénix es el submodelo 51 de
// `weapons/projectiles.mdl` puesto como entidad temporal por su guion de cliente
// (proj_arrow_phx_cl.script:36, :70), con la secuencia 8 (:72). No es munición
// ni tiene ficha de objeto: sus números vienen de `ESTALLIDOS`
// (src/play/fenix.js), con su cita, y aquí sólo se hornea el modelo — una sola
// secuencia, la suya, que el archivo tiene 23 y enteras pesan 1,2 MB.
const estallidos = [];
for (const e of Object.values(ESTALLIDOS)) {
  const fila = {
    id: e.proyectil, guion: e.guion, modelo: e.modelo, submodelo: e.submodelo,
    secuencia: e.secuencia, clave: null, secuencias: [], bytes: 0, pieza: null,
    sonido: e.sonido.archivo,
  };
  if (existsSync(`${MODELOS}/${e.modelo}`)) {
    const nombres = leerSecuencias(leerMdl(`${MODELOS}/${e.modelo}`)).map((s) => s.nombre);
    fila.nombreDeSecuencia = nombres[e.secuencia] ?? null;
    const r = extraerBicho(e.modelo, {
      cuerpo: e.submodelo, base: MODELOS, salida: SALIDA, raizSalida: salidaComun(),
      quiero: fila.nombreDeSecuencia ? [fila.nombreDeSecuencia] : null, callar: true,
    });
    fila.clave = r?.clave ?? null;
    fila.secuencias = r?.secuencias ?? [];
    fila.bytes = r?.bytes ?? 0;
    fila.pieza = submodelosDe(`${MODELOS}/${e.modelo}`, e.submodelo).submodelos[0]?.nombre ?? null;
  } else avisos.push(`${e.proyectil}: falta ${e.modelo}`);
  estallidos.push(fila);
  console.log(`
  el estallido de ${fila.id}   ${fila.clave ?? "sin modelo"} ` +
    `(submodelo ${e.submodelo}: ${fila.pieza ?? "?"}, secuencia ${e.secuencia}: ${fila.nombreDeSecuencia ?? "?"})`);
  control(`el estallido de ${fila.id} trae su modelo`, Boolean(fila.clave), `${fila.clave}`);
  control(`el estallido de ${fila.id} trae su secuencia ${e.secuencia}`,
    Boolean(fila.nombreDeSecuencia) && fila.secuencias.includes(fila.nombreDeSecuencia),
    `${fila.nombreDeSecuencia} en [${fila.secuencias.join(", ")}]`);
  // Y que el proyectil al que pertenece esté entre las flechas horneadas: un
  // estallido de algo que no se puede tirar es una regla que no corre (el 62).
  control(`el estallido de ${fila.id} es de un proyectil horneado`,
    flechas.some((f) => f.id === fila.id), flechas.some((f) => f.id === fila.id) ? "sí" : "no está en `flechas`");
}

// Los bytes de VERDAD, por carpeta y no por arma: con carpetas compartidas,
// sumar por arma cuenta dos veces la misma malla (daba 203 MB con 146 en disco).
const porCarpeta = new Map();
for (const r of [...extraido.values()]) if (r?.clave) porCarpeta.set(r.clave, r.bytes ?? 0);
for (const f of flechas) if (f.clave) porCarpeta.set(f.clave, f.bytes ?? 0);
for (const b of bolas) if (b.clave) porCarpeta.set(b.clave, b.bytes ?? 0);
for (const e of estallidos) if (e.clave) porCarpeta.set(e.clave, e.bytes ?? 0);
const bytes = [...porCarpeta.values()].reduce((s, b) => s + b, 0);
const sinModeloEnMano = armas.filter((a) => !a.enMano.clave).map((a) => a.id);
mkdirSync(SALIDA, { recursive: true });
writeFileSync(`${SALIDA}/../armas.json`, JSON.stringify({
  procedencia: {
    scripts: SCRIPTS, modelos: MODELOS,
    cuando: new Date().toISOString().slice(0, 10),
    nota: "Extraído de una instalación de Master Sword Rebirth. No se distribuye.",
  },
  // Lo que se horneó y lo que no, CALCULADO, para que la prueba y la sonda del
  // 96 lo lean y no lo vuelva a contar nadie a mano.
  resumen: {
    armas: armas.length, dePartida: armas.filter((a) => a.dePartida).length,
    conModeloEnMano: armas.length - sinModeloEnMano.length, sinModeloEnMano,
    conModeloEnElMundo: armas.filter((a) => a.enElMundo.clave).length,
    carpetas: porCarpeta.size, bytes, segundos: Math.round(segundos),
    eximidosDeLaCaja: eximidos, pendientes, avisos,
    // La secuencia de vista de cada ataque, contada (tools/animvista.mjs).
    vistas,
  },
  armas, flechas, bolas, estallidos,
}, null, 1));

// ── LA PROCEDENCIA, que es parte del trabajo y no papeleo ─────────────────
const PROC = salidaComun("PROCEDENCIA.md");
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

// Y LA SEGUNDA MARCA, la del 96: la primera dice «un submodelo de cada archivo»
// y desde hoy son todos los empuñables, con sus dos exenciones de la caja.
const MARCA96 = "## Las ARMAS, todas (96)";
if (existsSync(PROC) && !readFileSync(PROC, "utf8").includes(MARCA96)) {
  appendFileSync(PROC, [
    "", MARCA96, "",
    "Desde el experimento 96, `npm run armas` hornea **todo lo que el catálogo de",
    "objetos clasifica como `arma` o `hechizo`** (`build/msr/objetos.json`), no sólo",
    "las ocho de partida, y la munición que esas armas tiran. Cada carpeta de",
    "`armas/` es un par `(archivo .mdl, body)` y se extrae UNA vez con la unión de",
    "las secuencias que piden todas las armas que la comparten.",
    "",
    "Dos archivos —`viewmodels/v_2hblunts.mdl` y `viewmodels/v_1hswordssb.mdl`— se",
    "hornean sin el oráculo de la caja porque sus cajas de secuencia no describen su",
    "malla; el contraste con la lectura rota (escala de compresión quitada) separa por",
    "tres órdenes de magnitud. Los números van en `armas.json` → `resumen`, y la",
    "explicación en `tools/armas.mjs` y `doc/ARMAS_96.md`.",
    "",
    "Sigue en `build/` y no se mueve un byte a `public/`.",
    "",
  ].join("\n"));
}

console.log(`\n  ${armas.length} armas y ${flechas.length} flechas en ${porCarpeta.size} carpetas, ` +
  `${(bytes / 1024 / 1024).toFixed(2)} MB de malla y animación, ${segundos.toFixed(0)} s de extracción`);
console.log(`  sin modelo en la mano: ${sinModeloEnMano.join(", ") || "ninguna"}`);
if (eximidos.length) {
  console.log("\n  SIN EL ORÁCULO DE LA CAJA (el contraste separa)");
  for (const e of eximidos) console.log(`    ${e.rel}#${e.cuerpo} (${e.armas.join(", ")}): ${e.numeros}`);
}
if (pendientes.length) console.log(`\n  PENDIENTES (no aprobados: dichos)\n${pendientes.map((p) => `    ${p}`).join("\n")}`);
if (avisos.length) console.log(`\n  AVISOS\n${avisos.map((a) => `    ${a}`).join("\n")}`);
console.log(`\n  escrito en      build/msr/armas.json\n`);
if (malos.length) {
  console.error(`  ${malos.length} controles en rojo:\n${malos.map((m) => `    ${m}`).join("\n")}`);
  process.exit(1);
}
