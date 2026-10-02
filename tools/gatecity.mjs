// Extrae un `.bsp` de Master Sword a `build/<mapa>/` para poder dibujarlo.
//
//   node tools/gatecity.mjs [ruta.bsp | --mapa <nombre>]
//
// ── Dónde va lo que sale, y por qué importa ─────────────────────────────────
//
// **Todo a `build/<mapa>/`, que no se publica y está en `.gitignore`.** El
// `.bsp` se queda donde está, en `../MSC/assets/msr/maps/`; no se copia, no entra
// en el repo y no se redistribuye nada sacado de él. La regla del 02 —ningún
// asset sin licencia al lado— no se relaja: lo que es nuestro es el LECTOR, que
// vale para cualquier mapa, igual que `tools/kit.mjs` lo es para los `.glb`.
//
// El navegador lo sirve el servidor de desarrollo apuntando a `build/`. No pasa un
// byte a `public/`.
//
// ── Qué sale ────────────────────────────────────────────────────────────────
//
//   malla.bin     posiciones, normales, UV, UV de luz e índices, uno detrás de
//                 otro. Binario porque son 21 MB de números y un JSON con eso
//                 dentro tarda más en parsear que el `.bsp` en leerse.
//   malla.json    el manifiesto: los tramos del binario, los grupos por textura,
//                 las luces, la entrada y la caja.
//   luz.png       el atlas de mapa de luz
//   tex/*.png     las 92 texturas
//   PROCEDENCIA.md

import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

import {
  leerBsp, leerModelos, leerTexinfo, leerTexturas, leerEntidades, origen,
  leerCaras, UNIDADES_POR_METRO, aEscena, vectorAEscena, tieneLuz, parcheDeLuz,
} from "../src/bsp/lector.js";
import { decodificarMiptex, variedadDeImagen, claseDeTextura, CLASES } from "../src/bsp/miptex.js";
import {
  contabilidad, empaquetar, pintarAtlas, histograma, luzEnSuelo, reservarAdornos,
  estilosAnimados, cuboDeCara, claveDeCubo, variantesDeCubo,
} from "../src/bsp/luz.js";
import { emitirMalla, conEntidad, reservarLuxeles, MODOS_RENDER } from "../src/bsp/malla.js";
import { leerLlegada, sePuedeEstar, contenidoEn } from "../src/bsp/arbol.js";
import { monsterclipDeMapa, piezasEnEscena, OCUPADO, SOLIDO, CLIP_MINS, CLIP_MAXS } from "../src/bsp/clip.js";
import { usoDeTriggerstate, objetivosDeManager } from "../src/play/disparadores.js";
// EL 76: la regla de «¿se dibuja?» en el único sitio donde está escrita, para
// que el extractor y el visor no puedan contestarla distinto.
import { seDibuja as seDibujaAdorno } from "../src/play/aspecto.js";
import { leerSpr, tiraDeSpr, rectanguloDeCuadro } from "../src/bsp/sprite.js";
import { SUSTITUTOS } from "../src/bsp/halo.js";
import { tablasDeGamma, AJUSTES } from "../src/bsp/gamma.js";
import { decodificarTga, CARAS_DE_CIELO } from "../src/bsp/tga.js";
import { leerMdl, texturasDe, mallaDe, matrizDeAngulos, porMatriz, direccionPorMatriz, verticesCrudos } from "../src/bsp/mdl.js";
import { leerSecuencias, leerHuesos, clavesDeSecuencia, matricesEnFotograma, recorridoDeModelo, SE_MUEVE } from "../src/bsp/mdlanim.js";
import { extraerBicho } from "./bicho.mjs";
import { escribirPng } from "./png.mjs";
import { mapaDeArgv, bspDe, salidaDe, creditoDe } from "./mapa.mjs";

// La ruta es el primer argumento que acabe en `.bsp`, no `argv[2]`: con
// `--gamma 3.4` delante, `argv[2]` es «--gamma» y el lector intentaba abrirlo.
// El 47: la salida sale del MAPA, no de una cadena. Antes se le podía dar
// `edana.bsp` y lo escribía igualmente en `build/gatecity/`, que es el peor de
// los dos fallos posibles: no avisa y deja un mapa pisado por otro.
const MAPA = mapaDeArgv();
const RUTA = bspDe(MAPA);
const SALIDA = salidaDe(MAPA);
const U = UNIDADES_POR_METRO;
const m2 = (u) => u / (U * U);

// La rampa de gamma va arriba porque la usan las tres cosas que se hornean: las
// texturas, los carteles y el atlas de luz. Declarada donde se usa por primera
// vez, la del cielo la pedía antes de existir.
// Las tablas de gamma del MOTOR, con los ajustes con los que corre el juego. Ver
// `src/bsp/gamma.js`: aquí había dos exponentes elegidos a ojo y los dos estaban
// mal. `--gamma` y `--texgamma` siguen existiendo para poder barrerlos y
// comparar, pero ya no eligen nada de fábrica.
const AJ = {
  ...AJUSTES,
  ...(arg("--gamma") ? { gamma: Number(arg("--gamma")) } : {}),
  ...(arg("--texgamma") ? { texgamma: Number(arg("--texgamma")) } : {}),
  ...(arg("--brillo") ? { brightness: Number(arg("--brillo")) } : {}),
  ...(process.argv.includes("--overbright") ? { overbright: true } : {}),
};
const TABLAS = tablasDeGamma(AJ);
const GAMMA = AJ.gamma;
// La tabla que el motor pasa por la paleta de cada textura al cargarla
// (`model.cpp` para las del mapa, `l_studio.cpp` para las de los modelos).
const GAMMA_TEX = AJ.texgamma;
const RAMPA_TEX = TABLAS.tex;

const bsp = leerBsp(RUTA);
const modelos = leerModelos(bsp);
const texinfos = leerTexinfo(bsp);
const texturas = leerTexturas(bsp);
const entidades = leerEntidades(bsp);

console.log(`\n${bsp.nombre}.bsp — ${(bsp.bytes / 1048576).toFixed(2)} MB, ${U} unidades/m\n`);

// --- 1. las caras, modelo a modelo, con el origin de su entidad --------------
//
// Un modelo de entidad puede estar desplazado. Se anota el desplazamiento y NO se
// aplica a los puntos: ver `conDesplazamiento()`.
const porModelo = new Map();
for (const e of entidades) {
  if (/^\*\d+$/.test(e.model ?? "")) porModelo.set(Number(e.model.slice(1)), e);
}

let caras = leerCaras(bsp, modelos[0], texinfos).map((c) => ({ ...c, modelo: 0 }));
let entidadesConBrushes = 0, desplazadas = 0;
const porModo = new Map();
for (let i = 1; i < modelos.length; i++) {
  const e = porModelo.get(i);
  const o = e ? origen(e) : null;
  const cs = leerCaras(bsp, modelos[i], texinfos).map((c) => ({ ...c, modelo: i, clase: e?.classname }));
  entidadesConBrushes++;
  if (o && (o[0] || o[1] || o[2])) desplazadas++;
  const marcadas = conEntidad(cs, e, origen);
  const modo = Number(e?.rendermode ?? 0) || 0;
  const g = porModo.get(modo) ?? { n: 0, area: 0 };
  g.n++; g.area += cs.reduce((a, c) => a + c.area, 0);
  porModo.set(modo, g);
  caras = caras.concat(marcadas);
}

const areaTotal = caras.reduce((a, c) => a + c.area, 0);
console.log(`  caras           ${caras.length} (${modelos[0].caras} del mundo + el resto en ${entidadesConBrushes} entidades)`);
console.log(`  superficie      ${m2(areaTotal).toFixed(0)} m²`);
console.log(`  desplazadas     ${desplazadas} entidades con origin distinto de cero`);

// El censo de entidades con brushes, por clase.
//
// Se imprime porque la pregunta «¿cuáles de éstas se dibujan?» parecía un
// problema y no lo es: **el compilador ya les quitó las caras a las invisibles.**
// Los 101 `func_monsterclip`, los 30 `msarea_*`, los 6 `trigger_*` y los 2
// `func_ladder` traen CERO caras, así que no hay nada que decidir ni nada que
// filtrar. Si un `.bsp` distinto sí las trajera, esto lo diría en una línea en vez
// de dibujar 101 cajas de roca en mitad del sitio.
const censo = new Map();
for (const c of caras.filter((c) => c.modelo > 0)) {
  const g = censo.get(c.clase ?? "(sin entidad)") ?? { caras: 0, area: 0, modelos: new Set() };
  g.caras++; g.area += c.area; g.modelos.add(c.modelo);
  censo.set(c.clase ?? "(sin entidad)", g);
}
const sinCaras = [...porModelo.values()].reduce((m, e) => {
  const i = Number(e.model.slice(1));
  if (modelos[i].caras === 0) m.set(e.classname, (m.get(e.classname) ?? 0) + 1);
  return m;
}, new Map());
console.log(`  con brushes     ${[...censo].sort((a, b) => b[1].area - a[1].area)
  .map(([c, g]) => `${g.modelos.size} ${c} (${m2(g.area).toFixed(0)} m²)`).join(", ")}`);
console.log(`    sin caras     ${[...sinCaras].map(([c, n]) => `${n} ${c}`).join(", ")} — invisibles, el compilador se las comió`);

// Lo que CHOCA no es lo que se dibuja, y la diferencia son dos clases enteras:
// `func_illusionary` son 859 m² que se ven y se atraviesan —el motor los declara
// no sólidos— y `func_water` son 451 m² de agua por la que se nada. Meterlos en
// el trimesh deja al jugador clavado delante de una cortina de humo, que es la
// lección de la cuerda del torno de Corinth otra vez.
// El censo de modos de dibujo, que es lo que faltaba usar.
//
// Lo señaló quien comparó las capturas: «los rayos de luz en el templo del juego
// son transparentes pero en el demo es sólido». Las 31 entidades de modo ADITIVO
// son esos rayos, y estaban opacas. Estaba medido desde el principio.
console.log(`  modos de dibujo ${[...porModo].sort((a, b) => b[1].area - a[1].area)
  .map(([m, g]) => `${g.n} ${MODOS_RENDER[m] ?? m} (${m2(g.area).toFixed(0)} m²)`).join(", ")}`);

// `func_door_rotating` YA NO está aquí, y es un cambio con consecuencia.
//
// Estaba: una puerta horneada dentro del trimesh del mundo es una pared que
// resulta que tiene forma de puerta. Ahora cada una sale con su propia malla y
// su propio colisionador, que es lo que permite que gire. El control de que esto
// no se quede a medias está abajo: si el número de puertas emitidas no cuadra
// con el de entidades `func_door_rotating`, el horneado para — porque quitarlas
// de la colisión sin darles la suya deja nueve agujeros por los que se pasa
// andando, y eso no da error.
// Y `func_breakable` TAMPOCO está aquí desde el 69, por la misma razón y con la
// misma consecuencia: un almiar horneado en el trimesh del mundo es una pared
// que resulta que tiene forma de almiar. Los cuatro de Edana y los dieciséis de
// Gate City existían como dibujo y como obstáculo y **no como algo que se
// rompe**, que es la mitad de para qué están puestos: uno abre la cloaca y
// cuatro de Gate City sueltan las crías de rata.
// Y `func_door` TAMPOCO desde el 70, con una diferencia que conviene decir
// entera porque cambia lo que es un arreglo y lo que es un estreno: las
// deslizantes **no estaban en la colisión de nadie**. `solidas` es el modelo 0
// más `func_wall`, así que una `func_door` nunca entró ahí. Estaban sólo
// dibujadas, quietas y atravesables: la tapa de la cloaca de Edana era una
// lámina de 4 unidades por la que se pasaba andando. O sea que esto no las saca
// del trimesh —nunca estuvieron— sino que les da **el colisionador que les
// faltaba** y además las mueve.
const SOLIDAS = new Set(["func_wall"]);
const MOVIBLES = new Set(["func_door_rotating"]);
const CORREDERAS = new Set(["func_door"]);
const ROMPIBLES = new Set(["func_breakable"]);
// Las que se llevan su malla y su colisionador APARTE, por moverse o por poder
// desaparecer. El reparto son tres listas y no dos —ver el comentario de
// `dibujables`— y quien entra aquí tiene que salir de las OTRAS DOS: de la
// colisión, para poder dejar de chocar, y de la malla quieta, para no dejar un
// fantasma dibujado en su sitio.
const APARTE = new Set([...MOVIBLES, ...CORREDERAS, ...ROMPIBLES]);

// LOS 101 `func_monsterclip`, leídos del ÁRBOL y no de las caras.
//
// No tienen caras —el compilador se las come, y hay una prueba desde el 12 que lo
// dice— así que no hay forma de sacarlos de `caras`. Están en el árbol de
// colisión de su modelo, que es de donde los saca `src/bsp/clip.js`.
const red5 = (v) => Math.round(v * 1e5) / 1e5;
const monsterclip = monsterclipDeMapa(bsp, entidades);
console.log(`  monsterclip     ${monsterclip.brushes.length} brushes en ` +
  `${monsterclip.brushes.reduce((a, b) => a + b.piezas.length, 0)} piezas convexas` +
  `${monsterclip.vacias ? `, ${monsterclip.vacias} entidades sin una hoja sólida` : ""}` +
  ` — la valla de los bichos, fuera de la colisión del jugador a propósito`);
if (!monsterclip.brushes.length) {
  // Un mapa puede no tener ninguno; Gate City tiene 101. Cero con 101 entidades
  // en el `.bsp` sería el lector roto, y eso NO se ve en ninguna captura.
  const cuantos = entidades.filter((e) => e.classname === "func_monsterclip").length;
  if (cuantos) { console.error(`  FALLO: ${cuantos} func_monsterclip en el .bsp y 0 leídos`); process.exit(1); }
}
const solidas = caras.filter((c) => c.modelo === 0 || SOLIDAS.has(c.clase));
// Y LO QUE SE DIBUJA, que es donde se me quedó el trabajo a medias.
//
// Saqué las puertas de la colisión y les di malla propia, pero seguí emitiendo
// la malla del mundo con TODAS las caras. Resultado: cada puerta se dibujaba dos
// veces, una en la hoja que gira y otra clavada en el marco. Al abrirla quedaba
// un FANTASMA en su sitio, y se atravesaba —porque la copia quieta ya no tenía
// colisionador—, así que parecía un fallo de física y era un fallo de reparto.
//
// El reparto correcto son tres listas y no dos: lo que choca, lo que se dibuja
// quieto, y lo que se lleva las dos cosas aparte porque se mueve.
const dibujables = caras.filter((c) => !APARTE.has(c.clase));
console.log(`  chocan          ${solidas.length} caras: el mundo más ${[...SOLIDAS].join(", ")}`);
console.log(`  aparte          ${caras.length - dibujables.length} caras de ${[...APARTE].join(", ")}, ` +
  `que se mueven o se rompen: fuera de la malla quieta Y fuera de la colisión, con las suyas`);

const mundoSpawn = entidades.find((e) => e.classname === "worldspawn") ?? {};
// El color del cielo sale de `light_environment`, que es lo que el compilador usó
// para iluminar con él: `_light` es "R G B brillo".
const amb = (entidades.find((e) => e.classname === "light_environment")?._light ?? "255 255 255 100")
  .trim().split(/\s+/).map(Number);
const colorCielo = [amb[0] ?? 255, amb[1] ?? 255, amb[2] ?? 255]
  .map((v) => RAMPA_TEX[Math.min(255, Math.round((v * (amb[3] ?? 100)) / 255))]);
console.log(`  cielo           color ${colorCielo.join(",")} de light_environment "${amb.join(" ")}"`);

// --- 2. las texturas ---------------------------------------------------------
//
// Y van con la RAMPA DE GAMMA horneada, igual que el atlas de luz.
//
// Es la corrección que trajo comparar con capturas del juego. GoldSrc sube su rampa
// por hardware sobre el fotograma ENTERO, o sea sobre el producto de la textura por
// el mapa de luz: `ramp(t·l) = ramp(t)·ramp(l)`. Aplicándola sólo al mapa de luz
// falta el factor `ramp(t)`, y eso se ve de dos formas a la vez — más oscuro Y más
// saturado, porque una potencia con exponente menor que uno desatura.
//
// Horneada en las dos, el producto sale exacto y el material sigue sin llevar ni
// una línea de shader.
mkdirSync(`${SALIDA}/tex`, { recursive: true });
const lumpTex = bsp.lumps.texturas.datos;
const imagenes = [];
const planas = [];
let bytesTex = 0;
for (const t of texturas) {
  if (!t) { console.log(`  AVISO: una entrada de textura sin cabecera`); continue; }
  const img = decodificarMiptex(lumpTex, t.off);
  if (!img) { console.log(`  AVISO: ${t.nombre} pide un .wad externo`); continue; }
  // La rampa, en los tres canales y no en el alfa. **Y no a las CALADAS.**
  //
  // El motor decide la rampa al montar la paleta, no al dibujar
  // (`Image_SetPalette`, `engine/common/imagelib/img_utils.c`): una textura `{`
  // entra por `LUMP_MASKED` y una normal por `LUMP_TEXGAMMA`, y sólo la segunda
  // pasa por `texgammatable`. Es una sola textura en este mapa —`{grate1b`— y la
  // diferencia es de un 15 % en los medios tonos, pero es la diferencia entre
  // leer el motor y suponerlo.
  if (!img.calada) {
    for (let i = 0; i < img.rgba.length; i += 4) {
      img.rgba[i] = RAMPA_TEX[img.rgba[i]];
      img.rgba[i + 1] = RAMPA_TEX[img.rgba[i + 1]];
      img.rgba[i + 2] = RAMPA_TEX[img.rgba[i + 2]];
    }
  }
  const v = variedadDeImagen(img.rgba);
  if (v.colores <= 1) planas.push({ nombre: img.nombre, ...v });
  bytesTex += escribirPng(`${SALIDA}/tex/${nombreArchivo(img.nombre)}.png`, img.rgba, img.ancho, img.alto);
  imagenes.push({ ...t, ...v, clase: img.clase, calada: img.calada });
}
const porClase = new Map();
for (const i of imagenes) porClase.set(i.clase, (porClase.get(i.clase) ?? 0) + 1);
console.log(`\n  texturas        ${imagenes.length} decodificadas de ${texturas.length}, ${(bytesTex / 1024).toFixed(0)} KB en PNG`);
console.log(`    por clase     ${[...porClase].map(([c, n]) => `${n} ${c}`).join(", ")}`);
const medColores = mediana(imagenes.map((i) => i.colores));
console.log(`    colores       mediana ${medColores} distintos por textura`);
// La sonda de la paleta, corregida DESPUÉS de que se equivocara.
//
// Primero exigía que ninguna textura fuera de un solo color, y acusó a cuatro:
// `1white`, `black`, `yellow` y `sky`. Las cuatro son de un solo color a
// propósito y lo dicen en el nombre. O sea que la sonda estaba bien escrita para
// el fallo equivocado: **una paleta mal leída no estropea cuatro texturas de
// noventa y dos, estropea las noventa y dos.** Lo que hay que exigir es la
// proporción y la mediana, y el control está en `test/bsp_luz.test.mjs`, que
// rompe el desplazamiento de la paleta a mano y comprueba que esta cifra se
// derrumba. Una sonda sin control es una sonda que dice que sí; y una sonda con
// control pero mal escrita acusa a quien no es, que es lo que pasó aquí.
const vivas = imagenes.filter((i) => i.colores > 1).length;
console.log(`    control       ${vivas} de ${imagenes.length} con más de un color ` +
  `(${((vivas / imagenes.length) * 100).toFixed(0)} %); planas a propósito: ${planas.map((p) => p.nombre).join(", ") || "ninguna"}`);
if (vivas / imagenes.length < 0.9 || medColores < 16) {
  console.error(`    FALLO: la paleta se está leyendo mal. Con el desplazamiento roto esto se va al 0 %.`);
  process.exit(1);
}

// --- 3. el mapa de luz -------------------------------------------------------
const cuentas = contabilidad(caras, bsp.lumps.luz.len, bsp.lumps.luz.datos);
console.log(`\n  mapa de luz     ${(bsp.lumps.luz.len / 1048576).toFixed(2)} MB en el archivo`);
console.log(`    caras con luz ${cuentas.caras}; sin luz ${cuentas.sinLuz} (${cuentas.sinLuzPorMenosUno} con lightofs=-1, ${cuentas.sinLuzPorEstilos} con styles a 255)`);
console.log(`    contabilidad  ${cuentas.bytes} bytes sumados contra ${cuentas.bytesDelLump} del lump ` +
  `-> ${cuentas.cuadra
    ? (cuentas.cola === 0 ? "CUADRA EXACTO" : `CUADRA (${cuentas.cola} B de cola, todos ceros)`)
    : `FALLO: ${cuentas.solapes} solapes, ${cuentas.huecos} huecos, ${cuentas.desbordan} se salen` +
      (cuentas.colaCeros === false ? `, y la cola de ${cuentas.cola} B NO es ceros` : "")}`);
console.log(`    luxels        ${cuentas.luxels}, parche mayor ${cuentas.parcheMayor}×${cuentas.parcheMayor}`);
if (!cuentas.cuadra) {
  console.error(`\n  El mapa de luz no se está leyendo bien. Sin esto lo demás no vale.`);
  process.exit(1);
}

const atlas = empaquetar(caras, { ancho: 1024 });

// La rampa de gamma se BARRE y se imprime, no se elige a ojo. Lo que se mira es
// la pareja: cuánto sube la mediana y cuánto se come del contraste. Subirla hasta
// que se vea bien es exactamente el error que el jharro ya cometió con el radio
// de los faroles: la caverna salía a 185 de 255, toda iluminada por igual.
console.log(`
  rampa de gamma  barrido del mapa de luz, con el overbright ${AJ.overbright ? "encendido" : "apagado"} ya aplicado ` +
  `(la elegida es ${GAMMA}, y la de las texturas ${GAMMA_TEX})`);
console.log(`    gamma   mediana   p10    p90   contraste p90-p10`);
for (const g of [1, 1.6, 2.2, 2.8, 3.4]) {
  const px = pintarAtlas(atlas, bsp.lumps.luz.datos, { ajustes: { ...AJ, gamma: g } });
  const ls = [];
  for (const it of atlas.items) {
    for (let y = 0; y < it.alto; y++) {
      for (let x = 0; x < it.ancho; x++) {
        const i = ((it.y + y) * atlas.ancho + (it.x + x)) * 4;
        ls.push(0.2126 * px.rgba[i] + 0.7152 * px.rgba[i + 1] + 0.0722 * px.rgba[i + 2]);
      }
    }
  }
  ls.sort((a, b) => a - b);
  const q = (f) => ls[Math.floor((ls.length - 1) * f)];
  console.log(`    ${String(g).padStart(5)}   ${q(0.5).toFixed(0).padStart(7)}   ` +
    `${q(0.1).toFixed(0).padStart(4)}  ${q(0.9).toFixed(0).padStart(5)}   ` +
    `${(q(0.9) - q(0.1)).toFixed(0).padStart(11)}${g === GAMMA ? "   <-" : ""}`);
}

// ── EL PARPADEO: un atlas por CUBO de estilos, y una variante por estado ──────
//
// La explicación entera está en `src/bsp/luz.js`. En corto: la rampa de gamma va
// DESPUÉS de sumar los estilos, así que no se pueden sumar atlas ya horneados —
// pero los estilos sólo pasan por unos pocos valores, así que el ciclo entero
// tiene un número pequeño de estados y se hornean todos. No es una aproximación
// del parpadeo: es el parpadeo, con materiales de fábrica.
mkdirSync(`${SALIDA}/luz`, { recursive: true });
const ANIMADOS = estilosAnimados();
const cubos = new Map();
for (const c of caras) {
  if (!tieneLuz(c)) continue;
  const cubo = cuboDeCara(c, ANIMADOS);
  const clave = claveDeCubo(cubo);
  if (!cubos.has(clave)) cubos.set(clave, { clave, estilos: cubo, caras: [] });
  cubos.get(clave).caras.push(c);
}
// El ancho de cada atlas no se elige a mano: se prueban las potencias de dos y
// se coge la que da menos área, penalizando las formas muy alargadas. Una
// textura de 128×4096 cabe en área pero es la clase de cosa que algún driver
// trata distinto.
function empaquetarAjustado(lista) {
  let mejor = null;
  for (const ancho of [64, 128, 256, 512, 1024]) {
    let a;
    try { a = empaquetar(lista, { ancho }); } catch { continue; }
    if (a.alto > 4096) continue;
    const forma = Math.max(a.ancho, a.alto) / Math.min(a.ancho, a.alto);
    const coste = a.ancho * a.alto * (1 + forma / 8);
    if (!mejor || coste < mejor.coste) mejor = Object.assign(a, { coste });
  }
  return mejor;
}

const listaCubos = [...cubos.values()].sort((a, b) => a.estilos.length - b.estilos.length || b.caras.length - a.caras.length);
let bytesLuzTotal = 0, texelsTotal = 0, leidosTotal = 0;
console.log(`\n    parpadeo      estilos animados en este mapa: ${ANIMADOS.filter((e) => cubos.has(String(e)) || [...cubos.keys()].some((k) => k.split("+").includes(String(e)))).join(", ") || "ninguno"}`);
console.log(`      cubo      caras   atlas       variantes    KB`);
for (const cu of listaCubos) {
  cu.atlas = Object.assign(empaquetarAjustado(cu.caras), { cubo: cu.clave });
  cu.variantes = variantesDeCubo(cu.estilos);
  cu.pintados = cu.variantes.map((valores) =>
    pintarAtlas(cu.atlas, bsp.lumps.luz.datos, { tablas: TABLAS, valores }));
  leidosTotal += cu.pintados[0].leidos;
  texelsTotal += cu.variantes.length * cu.atlas.ancho * cu.atlas.alto;
}
// EL CONTROL DEL REPARTO, y es el que pedía el plan del 06 antes de escribir
// una línea: **con todos los estilos a su valor medio, los cubos tienen que dar
// el atlas de siempre, luxel a luxel**.
//
// Repartir 14 527 caras en cuatro atlas nuevos y recalcular sus UV es la clase
// de cambio que sale casi bien: una cara en el cubo equivocado mira a un atlas
// que también tiene luz, así que se ilumina — con la luz de otro sitio. Eso no
// se ve como un fallo, se ve como el mapa. Igual que las 12 680 caras al revés
// se vieron como oscuridad.
//
// El juez no es una captura: es el atlas entero que ya se sabía bueno.
{
  const medio = pintarAtlas(atlas, bsp.lumps.luz.datos, { tablas: TABLAS });
  const dondeEstaba = new Map(atlas.items.map((i) => [i.cara, i]));
  let comparados = 0, distintos = 0, peor = 0;
  for (const cu of listaCubos) {
    const suyo = pintarAtlas(cu.atlas, bsp.lumps.luz.datos, { tablas: TABLAS });
    for (const it of cu.atlas.items) {
      const antes = dondeEstaba.get(it.cara);
      if (!antes) { distintos += it.ancho * it.alto; continue; }
      for (let ty = 0; ty < it.alto; ty++) {
        for (let tx = 0; tx < it.ancho; tx++) {
          const a = ((antes.y + ty) * atlas.ancho + (antes.x + tx)) * 4;
          const b = ((it.y + ty) * cu.atlas.ancho + (it.x + tx)) * 4;
          comparados++;
          for (let k = 0; k < 3; k++) {
            const d = Math.abs(medio.rgba[a + k] - suyo.rgba[b + k]);
            if (d) { distintos++; peor = Math.max(peor, d); break; }
          }
        }
      }
    }
  }
  console.log(`    control       a valor medio, ${comparados} luxels contra el atlas de siempre: ` +
    `${distintos} distintos${distintos ? `, el peor por ${peor}` : " (IDÉNTICO)"}`);
  if (distintos) {
    console.error(`    FALLO: el reparto en cubos cambia el mapa de luz. Sin esto, el parpadeo tapa un fallo de reparto.`);
    process.exit(1);
  }
}

// La QUIETA es la que lleva los luxeles de servicio —el negro de las caras sin
// mapa de luz y el blanco de `--sinluz`— y también los de los adornos, porque su
// malla es otra y mira a este atlas.
const quieta = listaCubos.find((c) => c.clave === "quieta");
const atlasQuieta = quieta.atlas;
const pintado = quieta.pintados[0];
Object.assign(atlasQuieta, reservarLuxeles(atlasQuieta, pintado.rgba));

const hist = histograma(atlas, bsp.lumps.luz.datos);
for (const cu of listaCubos) {
  let bytesCubo = 0;
  cu.archivos = cu.pintados.map((p, i) => {
    const archivo = `luz/${cu.clave}-${i}.png`;
    bytesCubo += escribirPng(`${SALIDA}/${archivo}`, p.rgba, cu.atlas.ancho, cu.atlas.alto);
    return archivo;
  });
  bytesLuzTotal += bytesCubo;
  console.log(`      ${cu.clave.padEnd(8)} ${String(cu.caras.length).padStart(6)}   ` +
    `${`${cu.atlas.ancho}×${cu.atlas.alto}`.padEnd(11)} ${String(cu.variantes.length).padStart(6)}   ` +
    `${(bytesCubo / 1024).toFixed(0).padStart(6)}`);
}
console.log(`    atlas         ${texelsTotal * 4 / 1048576} MB en textura, ${(bytesLuzTotal / 1024).toFixed(0)} KB en disco, ` +
  `${listaCubos.reduce((s, c) => s + c.variantes.length, 0)} PNG`);
console.log(`    luxels leídos ${leidosTotal} de ${cuentas.luxels} esperados ${leidosTotal === cuentas.luxels ? "(cuadra)" : "(FALLO)"}`);
if (leidosTotal !== cuentas.luxels) {
  console.error(`    FALLO: el reparto en cubos ha perdido ${cuentas.luxels - leidosTotal} luxels.`);
  process.exit(1);
}
console.log(`    histograma    media ${hist.media.toFixed(0)}/255, desviación ${hist.desviacion.toFixed(1)}, ` +
  `${hist.cubetasVivas} de 16 cubetas vivas, la mayor ${(hist.mayor * 100).toFixed(0)} %`);
console.log(`      ${hist.cubetas.map((c) => barra(c / Math.max(...hist.cubetas))).join("")}`);
// El control: un histograma PLANO significa que se ha leído mal, y el mundo se
// vería uniformemente iluminado — el aspecto del jharro de hoy.
if (hist.cubetasVivas < 4 || hist.desviacion < 8) {
  console.error(`    FALLO: el histograma es casi plano. Un mapa de luz plano es un mapa de luz mal leído.`);
  process.exit(1);
}

// --- 4. la malla -------------------------------------------------------------
// El cielo SÍ se emite.
//
// Son 3 822 m², el 11,6 % de la superficie, y descartarlos deja agujeros negros
// del tamaño de media pantalla en cualquier vista al aire libre. GoldSrc dibuja
// ahí una caja de seis `.tga` externos —`skyname` vale `nature1`— que NO están en
// el `.bsp`: ese es un hueco real y va al informe. Lo que sí está en el archivo es
// el color, en el `_light` de `light_environment`, así que el cielo se dibuja de
// ese color plano y sin mapa de luz. Es menos que una caja de cielo y es lo que
// el archivo da.
// `--sinluz` manda las caras sin mapa de luz al luxel BLANCO en vez de al negro.
// Es para MIRAR dónde están: sobre un mapa cuya mediana de pantalla es 48 sobre
// 255, una cara a plena luz se ve de lejos y se ve entera. Sin esto, «esto está
// negro» y «esto no tiene mapa de luz» son el mismo fotograma.
const SINLUZ_AL = process.argv.includes("--sinluz") ? "blanco" : "negro";
const malla = emitirMalla(dibujables, texturas, listaCubos.map((c) => c.atlas), { conCielo: true, sinLuzAl: SINLUZ_AL });
console.log(`\n  malla           ${malla.triangleCount} triángulos, ${malla.vertexCount} vértices, ${malla.groups.length} grupos por textura`);
console.log(`    cielo         ${m2(malla.cielo).toFixed(0)} m² de caras de cielo (skyname '${mundoSpawn.skyname ?? "?"}': 6 .tga de gfx/env/, que no están en el .bsp pero sí al lado)`);
// Y el censo de lo que NO tiene mapa de luz, que hay que mirar dos veces.
//
// Son el 17,9 % de la superficie del mapa, y no todas son lo mismo:
//
//   cielo  3 822 m². Va con su material plano, no por el mapa de luz.
//   agua     280 m². GoldSrc dibuja el agua a plena luz de su textura, en su
//            propia pasada, sin modular por la luz horneada.
//   lo demás 2 147 m², de los que **2 051 están a la vista** —se comprobó con el
//            árbol BSP, mirando si delante de cada cara hay hueco o roca— y van
//            NEGRAS, que es lo que hace el motor cuando una cara no tiene
//            muestras. Pintarlas blancas, que es lo que hacía la primera versión,
//            deja 751 caras a plena luz en mitad de una cueva, y eso es lo que vio
//            quien lo anduvo.
{
  const sinLuzCaras = caras.filter((c) => !tieneLuz(c));
  const porClase = new Map();
  for (const c of sinLuzCaras) {
    const cl = claseDeTextura(texturas[c.miptex]?.nombre ?? "").clase;
    porClase.set(cl, (porClase.get(cl) ?? 0) + c.area);
  }
  const otras = sinLuzCaras.filter((c) => {
    const cl = claseDeTextura(texturas[c.miptex]?.nombre ?? "").clase;
    return cl !== CLASES.cielo && cl !== CLASES.agua;
  });
  const aLaVista = otras.filter((c) => {
    const t = centroDeCara(c);
    return sePuedeEstar(bsp, [t[0] + c.normal[0] * 4, t[1] + c.normal[1] * 4, t[2] + c.normal[2] * 4]);
  });
  console.log(`    sin mapa luz  ${sinLuzCaras.length} caras, ${m2(sinLuzCaras.reduce((a, c) => a + c.area, 0)).toFixed(0)} m² ` +
    `(${(m2(sinLuzCaras.reduce((a, c) => a + c.area, 0)) / m2(areaTotal) * 100).toFixed(1)} % del mapa)`);
  console.log(`                  ${[...porClase].map(([c, a]) => `${c} ${m2(a).toFixed(0)} m²`).join(", ")}`);
  console.log(`                  de las que no son cielo ni agua, ${aLaVista.length} de ${otras.length} están A LA VISTA ` +
    `(${m2(aLaVista.reduce((a, c) => a + c.area, 0)).toFixed(0)} m²) y van NEGRAS, como el motor`);
}

// Y cuánto del mapa es oscuro de verdad, que es la pregunta que dejó quien lo
// jugó: «el mapa era muy oscuro y sólo se podía guiar con el hechizo glow».
{
  const d = bsp.lumps.luz.datos;
  const cubos = new Array(8).fill(0);
  let conLuz = 0;
  for (const c of caras) {
    if (!tieneLuz(c)) continue;
    const p = parcheDeLuz(c.puntos, c.texinfo), n = p.ancho * p.alto;
    let s = 0;
    for (let k = 0; k < n; k++) {
      let r = 0, g = 0, b = 0;
      for (let e = 0; e < c.nEstilos; e++) {
        const o = c.lightofs + (e * n + k) * 3;
        r += d[o]; g += d[o + 1]; b += d[o + 2];
      }
      s += 0.2126 * Math.min(255, r) + 0.7152 * Math.min(255, g) + 0.0722 * Math.min(255, b);
    }
    conLuz += m2(c.area);
    cubos[Math.min(7, Math.floor(s / n / 32))] += m2(c.area);
  }
  console.log(`
  cuánto es oscuro  el mapa de luz, por SUPERFICIE y en bandas de 32/255:`);
  cubos.forEach((a, i) => console.log(
    `    ${String(i * 32).padStart(3)}-${String(i * 32 + 32).padEnd(4)} ${a.toFixed(0).padStart(6)} m²  ` +
      `${(a / conLuz * 100).toFixed(1).padStart(5)} %  ${"#".repeat(Math.round(a / conLuz * 40))}`
  ));
  console.log(`    -> el ${(cubos[0] / conLuz * 100).toFixed(0)} % de la superficie iluminada está por debajo de 32/255.`);
  console.log(`       Eso no es un fallo: es el mapa. Se jugaba con el hechizo 'glow' encendido.`);
}
if (malla.descartadas) console.log(`    AVISO: ${malla.descartadas} caras sin textura o sin texinfo`);

// La malla de colisión: sin mapa de luz, sin UV, y CON el cielo.
//
// Con el cielo porque sella: un mapa de GoldSrc está cerrado por una caja de
// `sky`, y sin ella el jugador que salte donde no debe se cae del mundo y la
// prueba de marcha lo cuenta como un agujero en el suelo. Se dibuja no, se choca
// sí — el mismo reparto que el `sello01` de Corinth, sólo que aquí al revés.
const choque = emitirMalla(solidas, texturas, null, { conCielo: true });
console.log(`    colisión      ${choque.triangleCount} triángulos (con el cielo, que sella)`);

// --- 3b. LO QUE SE COMPORTA: puertas, agua, escaleras, zonas -----------------
//
// Hasta ahora el mapa era geometría: todo lo que no fuera una pared, no era
// nada. Las nueve puertas estaban horneadas cerradas, los 451 m² de agua se
// dibujaban y se atravesaban, las dos escaleras no existían y el plano de la
// muerte del fondo del mapa tampoco.
//
// Aquí sale a `malla.json` lo que hace falta para que se comporten, y **los
// números son del `.bsp`**: `distance 90`, `speed 100`, `wait 4` los trae cada
// puerta; la caja de cada volumen es la de su modelo de brushes.
//
// Lo que NO sale: `msarea_transition` (llevan a `mscave` y a `underpath`, que
// son otros mapas y no están) y `trigger_once` (los cinco disparan generadores
// de monstruos, que es el paso de los NPC). Se emiten igual como zonas, con su
// destino escrito, porque el dato es del mapa y buscarlo otra vez cuesta más que
// guardarlo.

/** La caja de un modelo de brushes, en coordenadas de escena y ya ordenada. */
function cajaDeModelo(m, desplazamiento = null) {
  const d = desplazamiento ?? [0, 0, 0];
  const a = aEscena([m.mins[0] + d[0], m.mins[1] + d[1], m.mins[2] + d[2]]);
  const b = aEscena([m.maxs[0] + d[0], m.maxs[1] + d[1], m.maxs[2] + d[2]]);
  // El cambio de ejes niega la Y del `.bsp`, así que el mínimo y el máximo se
  // cruzan en Z. Sin volver a ordenarlos, la caja sale invertida en un eje y
  // «estoy dentro» es siempre falso — que no da error, da agua que no moja.
  return {
    min: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])],
    max: [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])],
  };
}

const num = (v, sino) => (Number.isFinite(Number(v)) ? Number(v) : sino);

// LAS PUERTAS, cada una con su malla propia y en coordenadas de su bisagra.
//
// Emitirlas SIN el desplazamiento de la entidad es lo que las deja ya centradas
// en la bisagra, y no es un truco: `aEscena` es lineal, así que
// `aEscena(p + origin) − aEscena(origin) = aEscena(p)`. O sea que el punto local
// es el punto crudo del `.bsp`, y no hay que restar nada después.
const puertas = [];
const mallasDePuerta = [];
for (let i = 1; i < modelos.length; i++) {
  const e = porModelo.get(i);
  if (!e || !MOVIBLES.has(e.classname)) continue;
  const o = origen(e) ?? [0, 0, 0];
  // LAS MISMAS caras que ya pasaron por el empaquetado de luz, y no unas
  // releídas del `.bsp`.
  //
  // Esto lo escribí mal y el fallo tardó en verse porque se tapaba con otro:
  // `emitirMalla` busca el sitio de cada cara en el atlas **por identidad de
  // objeto** (`new Map(items.map((i) => [i.cara, ...]))`). Releerlas del
  // archivo da objetos nuevos, que no están en ese mapa, así que las nueve
  // puertas se iban al luxel NEGRO — y no daba ningún error, daba puertas
  // negras. No se notaba porque la copia horneada en el mundo, la del
  // fantasma, sí estaba iluminada y era la que se veía.
  const suyas = caras.filter((c) => c.modelo === i);
  const m = emitirMalla(suyas, texturas, listaCubos.map((c) => c.atlas), { conCielo: true, sinLuzAl: SINLUZ_AL });
  const choquePuerta = emitirMalla(suyas, texturas, null, { conCielo: true });
  // Y como estas caras vienen con el `origin` de su entidad ya sumado, la
  // malla sale en coordenadas del MUNDO. Se le resta la bisagra para dejarla
  // local, que es lo que necesita el nodo que gira. `aEscena` es lineal, así
  // que restar después es exactamente lo mismo que no sumar antes.
  const bis = aEscena(o);
  for (const malla of [m, choquePuerta]) {
    for (let k = 0; k < malla.positions.length; k += 3) {
      malla.positions[k] -= bis[0];
      malla.positions[k + 1] -= bis[1];
      malla.positions[k + 2] -= bis[2];
    }
  }
  puertas.push({
    modelo: i,
    tramo: `puerta${i}`,
    // EL 70: el índice en el lump de entidades y el nombre, que hasta ahora no
    // salían porque nadie las disparaba. Son lo que empareja la hoja con su
    // fila del cableado — `door2` de Edana son DOS hojas con el mismo nombre.
    entidad: entidades.indexOf(e),
    nombre: e.targetname ?? null,
    bisagra: aEscena(o),
    // Los tres números de la entidad. `distance` en grados, `speed` en grados
    // por segundo y `wait` en segundos antes de volver a cerrarse.
    grados: num(e.distance, 90),
    velocidad: num(e.speed, 100),
    espera: num(e.wait, 4),
    // `movesnd` es un ÍNDICE en la tabla de `doors.cpp:340+`, no un nombre.
    // Las nueve traen 9. El 0 es «sin sonido», y por eso no se inventa uno.
    sonido: num(e.movesnd, 0) ? `doors/doormove${num(e.movesnd, 0)}.wav` : null,
    // `spawnflags`, de `doors.h:19`. Y los había puesto MAL: escribí que el
    // bit 1 era ROTATE_BACKWARDS y es START_OPEN; el de girar al revés es el 2.
    //   1   SF_DOOR_START_OPEN         empieza abierta
    //   2   SF_DOOR_ROTATE_BACKWARDS   gira al revés
    //   8   SF_DOOR_PASSABLE           no choca
    //   16  SF_DOOR_ONEWAY             SIEMPRE al mismo lado, sin mirar a quién
    //   64  SF_DOOR_ROTATE_Z           bisagra horizontal (trampilla)
    //   128 SF_DOOR_ROTATE_X
    //   256 SF_DOOR_USE_ONLY           no se abre al tocarla
    // Ninguna de las nueve trae ninguno, así que el error no cambiaba nada
    // hoy — y por eso habría sobrevivido hasta el mapa que sí las use.
    banderas: num(e.spawnflags, 0),
    // En ejes de Three, el giro de la puerta (el yaw del `.bsp`) es sobre +Y.
    eje: (num(e.spawnflags, 0) & 128) ? "x" : (num(e.spawnflags, 0) & 64) ? "z" : "y",
    sentido: (num(e.spawnflags, 0) & 2) ? -1 : 1,
    // Sin ONEWAY el sentido lo decide QUIÉN la abre, no la entidad: ver
    // `CBaseDoor::DoorGoUp`. Con él, manda `sentido` y punto.
    unaSolaDireccion: Boolean(num(e.spawnflags, 0) & 16),
    empiezaAbierta: Boolean(num(e.spawnflags, 0) & 1),
    atravesable: Boolean(num(e.spawnflags, 0) & 8),
    // Y OJO: `soloUsar` NO es lo único que impide abrirla al tocarla. Ver
    // `nombre`, arriba, y `src/play/puertas.js`: `CBaseDoor::DoorTouch` sale en
    // la primera línea si la puerta tiene `targetname` (doors.cpp:533-538).
    soloUsar: Boolean(num(e.spawnflags, 0) & 256),
    caja: cajaDeModelo(modelos[i], o),
    grupos: m.groups,
    triangulos: m.triangleCount,
  });
  mallasDePuerta.push({ dibujo: m, choque: choquePuerta });
}

// EL CONTROL de que quitarlas de la colisión no las ha perdido.
{
  const cuantas = entidades.filter((e) => MOVIBLES.has(e.classname)).length;
  if (puertas.length !== cuantas) {
    console.error(`  FALLO: hay ${cuantas} puertas en el .bsp y se han emitido ${puertas.length}. ` +
      `Quitarlas de la colisión sin emitirlas deja agujeros por los que se pasa andando.`);
    process.exit(1);
  }
  const sinTriangulos = puertas.filter((p) => !p.triangulos);
  if (sinTriangulos.length) {
    console.error(`  FALLO: ${sinTriangulos.length} puertas sin un solo triángulo.`);
    process.exit(1);
  }

  // Y EL FANTASMA: que la hoja que gira no esté ADEMÁS en la malla quieta.
  //
  // Contar caras no vale, porque el fallo era que la puerta estaba en las DOS
  // mallas y las dos cuentas salían bien por separado.
  //
  // Y mirar «dentro de la caja de la puerta» tampoco. Lo escribí así primero y
  // PASABA con el fallo puesto a propósito: una puerta es una TABLA, así que sus
  // vértices están EN las caras de su propia caja y nunca dentro de ella
  // encogida. No comprobaba nada.
  //
  // Lo que sí distingue: la hoja se emite en coordenadas de su bisagra, así que
  // sus vértices llevados al mundo son exactamente los que tendría la copia
  // quieta. Se buscan uno a uno. Que alguno suelto coincida con una jamba es
  // posible; que coincida la mayoría es la puerta emitida dos veces.
  const enElMundo = new Set();
  const clavePunto = (x, y, z) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
  for (let v = 0; v < malla.positions.length; v += 3) {
    enElMundo.add(clavePunto(malla.positions[v], malla.positions[v + 1], malla.positions[v + 2]));
  }
  for (let k = 0; k < puertas.length; k++) {
    const p = puertas[k], q = mallasDePuerta[k].dibujo.positions;
    let coinciden = 0;
    for (let v = 0; v < q.length; v += 3) {
      if (enElMundo.has(clavePunto(q[v] + p.bisagra[0], q[v + 1] + p.bisagra[1], q[v + 2] + p.bisagra[2]))) coinciden++;
    }
    const parte = coinciden / (q.length / 3);
    if (parte > 0.5) {
      console.error(`  FALLO: la puerta ${p.tramo} tiene el ${(parte * 100).toFixed(0)} % de sus vértices ` +
        `también en la malla quieta. Está emitida dos veces: al abrirla queda un fantasma que se atraviesa.`);
      process.exit(1);
    }
  }
  console.log(`    sin fantasma  ninguna de las ${puertas.length} hojas está además en la malla quieta`);

  // Y QUE TENGAN LUZ, que es el otro fallo que el fantasma estaba tapando.
  //
  // Una cara que no encuentra su sitio en el atlas se manda al luxel de
  // servicio, y eso no es un error: es una puerta negra.
  //
  // El umbral no se inventa: **38 de las 66 caras de puerta no tienen mapa de
  // luz en el `.bsp`** —son cantos y traseras que el compilador nunca iluminó—
  // así que una parte de ese negro es correcta y copiarla es lo que toca. Lo
  // que se pide es que las que SÍ lo tienen lo usen, comparando con el dato de
  // origen en vez de con un número puesto a ojo.
  const negro = atlasQuieta.negro;
  let alLuxel = 0, totalV = 0;
  for (const { dibujo } of mallasDePuerta) {
    for (let v = 0; v < dibujo.uvs1.length; v += 2) {
      totalV++;
      if (Math.abs(dibujo.uvs1[v] - negro[0]) < 1e-6 && Math.abs(dibujo.uvs1[v + 1] - negro[1]) < 1e-6) alLuxel++;
    }
  }
  const carasDePuerta = caras.filter((c) => MOVIBLES.has(c.clase));
  const conLuzEnElBsp = carasDePuerta.filter((c) => tieneLuz(c)).length;
  const esperadoIluminado = conLuzEnElBsp / carasDePuerta.length;
  const salioIluminado = 1 - alLuxel / totalV;
  if (Math.abs(salioIluminado - esperadoIluminado) > 0.15) {
    console.error(`  FALLO: el ${(salioIluminado * 100).toFixed(0)} % de los vértices de puerta tiene mapa ` +
      `de luz, y el .bsp lo tiene para el ${(esperadoIluminado * 100).toFixed(0)} % de sus caras. ` +
      `Si sale muy por debajo, las caras no están en el atlas y las puertas se dibujarán NEGRAS sin dar error.`);
    process.exit(1);
  }
  console.log(`    con luz       ${totalV - alLuxel} de ${totalV} vértices (${(salioIluminado * 100).toFixed(0)} %), ` +
    `y el .bsp ilumina ${conLuzEnElBsp} de ${carasDePuerta.length} caras (${(esperadoIluminado * 100).toFixed(0)} %)`);
}

// LO QUE SE ROMPE (el 69): `func_breakable`, con su malla y su colisionador.
//
// El molde es el de las puertas y por la misma razón, pero un rompible es más
// fácil que una puerta: no gira. Así que la malla se emite en coordenadas del
// MUNDO y el nodo se queda en el origen — que es lo que sale solo de restar
// `aEscena(origin)` cuando la entidad no trae `origin`, y ninguno de los veinte
// de los dos mapas lo trae. Si algún día uno lo trae, esto sigue valiendo: la
// malla queda local a su origen y el nodo se coloca ahí.
//
// ── Los números, y el primero engaña ──────────────────────────────────────
//
//   health    la vida, y se resta de verdad (`pev->health -= flDamage`,
//             func_break.cpp:575). Los almiares de Edana traen 5, 8, 10 y 11.
//   material  el sonido y los cascotes al romperse, y **el comentario del
//             propio mod miente**: dice «0:glass, 1:metal, 2:flesh, 3:wood»
//             (func_break.cpp:92) y el enum es otro (func_break.h:24-35).
//   spawnflags cómo se puede romper, y sin ninguna sólo a golpes.
const MATERIALES = ["cristal", "madera", "metal", "carne", "bloque",
  "placa", "ordenador", "cristal_irrompible", "roca", "ninguno"];
const rompibles = [];
const mallasDeRompible = [];
for (let i = 1; i < modelos.length; i++) {
  const e = porModelo.get(i);
  if (!e || !ROMPIBLES.has(e.classname)) continue;
  const o = origen(e) ?? [0, 0, 0];
  // LAS MISMAS caras que ya pasaron por el empaquetado de luz, por identidad de
  // objeto: releerlas del `.bsp` las mandaría al luxel negro sin dar error. Es
  // el mismo aviso que llevan las puertas encima, y se cumple igual.
  const suyas = caras.filter((c) => c.modelo === i);
  const m = emitirMalla(suyas, texturas, listaCubos.map((c) => c.atlas), { conCielo: true, sinLuzAl: SINLUZ_AL });
  const choque = emitirMalla(suyas, texturas, null, { conCielo: true });
  const anc = aEscena(o);
  for (const malla of [m, choque]) {
    for (let k = 0; k < malla.positions.length; k += 3) {
      malla.positions[k] -= anc[0];
      malla.positions[k + 1] -= anc[1];
      malla.positions[k + 2] -= anc[2];
    }
  }
  const mat = num(e.material, 1);
  rompibles.push({
    modelo: i,
    tramo: `rompible${i}`,
    // El índice en el lump de entidades, que es la misma `entidad` que lleva su
    // fila del cableado. Es por donde se emparejan la malla y la regla: sin él
    // habría que casarlas por posición, y los rompibles sin nombre ni objetivo
    // NO están en la lista del cableado, así que los índices no coinciden.
    entidad: entidades.indexOf(e),
    ancla: anc,
    // `material`: fuera de rango vuelve a madera, y no es un valor por omisión
    // inventado — lo hace el mod: `if ((i < 0) || (i >= matLastMaterial))
    // m_Material = matWood;` (func_break.cpp:89-94). `material 8` de Gate City
    // sí está en rango: es `matRocks`.
    material: mat >= 0 && mat < MATERIALES.length ? mat : 1,
    materialNombre: MATERIALES[mat >= 0 && mat < MATERIALES.length ? mat : 1],
    vida: num(e.health, 0),
    caja: cajaDeModelo(modelos[i], o),
    grupos: m.groups,
    triangulos: m.triangleCount,
  });
  mallasDeRompible.push({ dibujo: m, choque });
}

// EL MISMO CONTROL que las puertas, y por el mismo motivo: sacar veinte brushes
// de la colisión sin emitirlos deja veinte agujeros por los que se pasa andando,
// y eso no da error — da un pueblo con boquetes.
{
  const cuantos = entidades.filter((e) => ROMPIBLES.has(e.classname)).length;
  if (rompibles.length !== cuantos) {
    console.error(`  FALLO: hay ${cuantos} func_breakable en el .bsp y se han emitido ${rompibles.length}. ` +
      `Quitarlos de la colisión sin emitirlos deja agujeros por los que se pasa andando.`);
    process.exit(1);
  }
  const sinTriangulos = rompibles.filter((p) => !p.triangulos);
  if (sinTriangulos.length) {
    console.error(`  FALLO: ${sinTriangulos.length} func_breakable sin un solo triángulo.`);
    process.exit(1);
  }
  // Y EL FANTASMA, que en los rompibles se ve al revés que en las puertas: una
  // puerta emitida dos veces deja la copia quieta al abrirse; un almiar emitido
  // dos veces se rompe, suena, dispara la cloaca **y sigue ahí**. El jugador no
  // ve un fallo de reparto: ve que romper el almiar no hace nada.
  //
  // ── Y el control de las puertas NO se puede copiar aquí ───────────────────
  //
  // Lo copié, y se puso rojo en la primera pasada de Gate City con la emisión
  // BIEN. El heurístico de las puertas —«si la mayoría de sus vértices están
  // además en la malla quieta, está emitida dos veces»— se sostiene en que una
  // hoja cuelga en el vano y no comparte esquinas con el marco. Un rompible es
  // lo contrario: es un TAPÓN metido en un hueco. Medido en el `.bsp` crudo,
  // antes de pasar por nada de esto: **12 de los 18 vértices del `*61` de Gate
  // City ya están en el modelo 0**, o sea en el mundo. Es una caja de
  // 36 × 42 × 16 unidades encajada en un agujero de la pared, y comparte las
  // esquinas por construcción.
  //
  // Así que aquí se hace la pregunta EXACTA en vez de la parecida, que además es
  // la que describe el fallo de verdad: ¿han quedado caras de rompible en alguna
  // de las otras dos listas? Si la respuesta es cero, no hay fantasma, y no hace
  // falta ningún umbral.
  const enLaQuieta = caras.filter((c) => ROMPIBLES.has(c.clase) && dibujables.includes(c)).length;
  const enLaColision = solidas.filter((c) => ROMPIBLES.has(c.clase)).length;
  if (enLaQuieta || enLaColision) {
    console.error(`  FALLO: ${enLaQuieta} caras de func_breakable siguen en la malla quieta y ` +
      `${enLaColision} en la de colisión. Emitido dos veces: al romperlo se queda puesto.`);
    process.exit(1);
  }
  if (rompibles.length) {
    console.log(`  se rompen       ${rompibles.length} func_breakable ` +
      `(${rompibles.reduce((a, p) => a + p.triangulos, 0)} tri), vida ` +
      `${[...new Set(rompibles.map((p) => p.vida))].sort((a, b) => a - b).join("/")}, ` +
      `de ${[...new Set(rompibles.map((p) => p.materialNombre))].join(" y ")}`);
    console.log(`    sin fantasma  0 de sus ${caras.filter((c) => ROMPIBLES.has(c.clase)).length} caras ` +
      `están además en la malla quieta o en la de colisión`);
  }
}

// LO QUE SE DESLIZA (el 70): `func_door`, que es la puerta LINEAL.
//
// Tres en Edana y cero en Gate City, y el cero vuelve a ser el motivo de que
// nadie las echara de menos en dos años de port. Son:
//
//   door1      *11, 80×12×128, movedir +x, lip 8, wait 3, dmg 50000
//   sewer_door *150, 128×144×4, movedir −x, wait −1 — la TAPA de la cloaca
//   sewerbeam  *154, 128×144×276, movedir −x, wait −1, spawnflags 8 y
//              rendermode 5: el haz de luz que baja al alcantarillado
//
// ── El recorrido, que no es un número de la entidad ────────────────────────
//
//     m_vecPosition2 = m_vecPosition1 + (pev->movedir *
//       (fabs(movedir.x * (size.x - 2)) + fabs(movedir.y * (size.y - 2))
//        + fabs(movedir.z * (size.z - 2)) - m_flLip));      doors.cpp:300
//
// O sea: **una puerta lineal se mete dentro de sí misma**. Recorre su propio
// tamaño en la dirección en que abre, menos el `lip` que deja asomando, menos
// 2 unidades — y ese −2 lo explica el propio comentario de Valve en esa línea:
// *«the engine expands bboxes by 1 in all directions»*. Escribirlo sin el −2
// deja la tapa 2 unidades corrida y no da error: da una rendija.
//
// `lip` NO tiene valor por omisión en el código, aunque el comentario QUAKED de
// arriba del archivo diga «lip 8 default» (doors.cpp:261). `m_flLip` sale de
// `CBaseToggle::KeyValue` (subs.cpp:392-396) y si la clave no está se queda en
// cero. Es el mismo caso del 64: el comentario y el código no dicen lo mismo, y
// aquí manda el código. `door1` trae `lip 8`; las otras dos no traen ninguno.
const correderas = [];
const mallasDeCorredera = [];
for (let i = 1; i < modelos.length; i++) {
  const e = porModelo.get(i);
  if (!e || !CORREDERAS.has(e.classname)) continue;
  const o = origen(e) ?? [0, 0, 0];
  // LAS MISMAS caras que ya pasaron por el empaquetado de luz, por identidad de
  // objeto. Mismo aviso que llevan encima las puertas y los rompibles.
  const suyas = caras.filter((c) => c.modelo === i);
  const m = emitirMalla(suyas, texturas, listaCubos.map((c) => c.atlas), { conCielo: true, sinLuzAl: SINLUZ_AL });
  const choque = emitirMalla(suyas, texturas, null, { conCielo: true });
  const anc = aEscena(o);
  for (const malla of [m, choque]) {
    for (let k = 0; k < malla.positions.length; k += 3) {
      malla.positions[k] -= anc[0];
      malla.positions[k + 1] -= anc[1];
      malla.positions[k + 2] -= anc[2];
    }
  }
  const sf = num(e.spawnflags, 0);
  const md = direccionDe((e.angles ?? "0 0 0").trim().split(/\s+/).map(Number));
  const tam = [0, 1, 2].map((j) => modelos[i].maxs[j] - modelos[i].mins[j]);
  const labio = num(e.lip, 0);
  const recorrido = Math.abs(md[0] * (tam[0] - 2)) + Math.abs(md[1] * (tam[1] - 2)) +
    Math.abs(md[2] * (tam[2] - 2)) - labio;
  correderas.push({
    modelo: i,
    tramo: `corredera${i}`,
    entidad: entidades.indexOf(e),
    nombre: e.targetname ?? null,
    ancla: anc,
    // La dirección en ejes de escena, ya unitaria. Se redondea porque un yaw de
    // 180 da un seno de 1,2e−16 y arrastrar eso a la escena no es más fiel: es
    // más ruido. El RECORRIDO se calcula antes, con el vector crudo, que es lo
    // que hace el motor.
    direccion: vectorAEscena(md).map((v) => Math.round(v * 1e6) / 1e6),
    // En metros y en metros por segundo, que es en lo que mide la escena. El
    // `.bsp` los da en unidades de GoldSrc.
    recorrido: recorrido / U,
    recorridoUnidades: recorrido,
    labio,
    // `if (pev->speed == 0) pev->speed = 100` (doors.cpp:295).
    velocidad: (num(e.speed, 0) || 100) / U,
    // `wait` sin valor por omisión en el código: cero si no está. −1 es «no
    // vuelve nunca» (doors.cpp:657-661), y lo traen dos de las tres.
    espera: num(e.wait, 0),
    // `pev->dmg`: lo que hace al que la traba (doors.cpp:735-737). `door1` trae
    // 50 000, que es matar a cualquiera.
    dano: num(e.dmg, 0),
    banderas: sf,
    empiezaAbierta: Boolean(sf & 1),
    // `SF_DOOR_PASSABLE` → `pev->solid = SOLID_NOT` (doors.cpp:277-281). El haz
    // de luz la trae: se dibuja y no choca, así que no lleva colisionador.
    atravesable: Boolean(sf & 8),
    sinRetorno: Boolean(sf & 32),   // SF_DOOR_NO_AUTO_RETURN
    soloUsar: Boolean(sf & 256),    // SF_DOOR_USE_ONLY
    // El modo de dibujo, que en el haz de luz es lo que lo hace un haz: sacarlo
    // de la malla del mundo y montarlo opaco lo convertiría en un pilar.
    render: { modo: num(e.rendermode, 0), cantidad: num(e.renderamt, 255) },
    sonido: num(e.movesnd, 0) ? `doors/doormove${num(e.movesnd, 0)}.wav` : null,
    caja: cajaDeModelo(modelos[i], o),
    grupos: m.groups,
    triangulos: m.triangleCount,
  });
  mallasDeCorredera.push({ dibujo: m, choque });
}

// EL MISMO CONTROL, con la pregunta EXACTA y no con el umbral de las puertas
// rotatorias: una `func_door` es un TAPÓN metido en un hueco, igual que un
// rompible, y comparte esquinas con el mundo por construcción. El heurístico de
// la hoja que cuelga en el vano no vale aquí — es la lección del 69 y está
// escrita entera en el control de los rompibles, veinte líneas más arriba.
{
  const cuantas = entidades.filter((e) => CORREDERAS.has(e.classname)).length;
  if (correderas.length !== cuantas) {
    console.error(`  FALLO: hay ${cuantas} func_door en el .bsp y se han emitido ${correderas.length}.`);
    process.exit(1);
  }
  const sinTriangulos = correderas.filter((p) => !p.triangulos);
  if (sinTriangulos.length) {
    console.error(`  FALLO: ${sinTriangulos.length} func_door sin un solo triángulo.`);
    process.exit(1);
  }
  const enLaQuieta = caras.filter((c) => CORREDERAS.has(c.clase) && dibujables.includes(c)).length;
  const enLaColision = solidas.filter((c) => CORREDERAS.has(c.clase)).length;
  if (enLaQuieta || enLaColision) {
    console.error(`  FALLO: ${enLaQuieta} caras de func_door siguen en la malla quieta y ` +
      `${enLaColision} en la de colisión. Emitida dos veces: al abrirla queda un fantasma.`);
    process.exit(1);
  }
  // Y UN CONTROL QUE NO TIENEN LAS OTRAS DOS CLASES: que el recorrido sea
  // POSITIVO. `ASSERTSZ(m_vecPosition1 != m_vecPosition2, "door start/end
  // positions are equal")` está en el motor (doors.cpp:301) y es exactamente el
  // fallo que se puede colar aquí: un `lip` mayor que el tamaño, o un `angles`
  // mal leído que deje la componente grande a cero, da una puerta que «se abre»
  // sin moverse. No da error: da una puerta que no hace nada, que es el verde
  // vacío del apartado 4 con forma de puerta.
  //
  // Y se pregunta por el SIGNO y no por `Math.abs`, que es como lo escribí
  // primero. Al romperlo a propósito —`lip` doscientas unidades de más— salió
  // **−130/−74/−74** y el control **se quedó verde**: con el valor absoluto, un
  // recorrido dado la vuelta es un recorrido grande. Y un recorrido negativo no
  // es un caso teórico ni un error del mapa que haya que respetar: es la puerta
  // metiéndose en la pared en vez de en su hueco, o sea la señal de que el
  // `lip` o el `angles` se han leído mal aquí. El control tenía la forma del
  // apartado 4: medía que el número era grande, no que era el bueno.
  const quietas = correderas.filter((p) => p.recorridoUnidades < 1);
  if (quietas.length) {
    console.error(`  FALLO: ${quietas.length} func_door con recorrido nulo o invertido ` +
      `(${quietas.map((p) => `${p.nombre ?? p.tramo}: ${p.recorridoUnidades.toFixed(2)} u`).join(", ")}). ` +
      `Se abrirían sin moverse, o hacia dentro de la pared.`);
    process.exit(1);
  }
  if (correderas.length) {
    console.log(`  se deslizan     ${correderas.length} func_door ` +
      `(${correderas.reduce((a, p) => a + p.triangulos, 0)} tri), recorren ` +
      `${correderas.map((p) => p.recorridoUnidades.toFixed(0)).join("/")} u a ` +
      `${correderas.map((p) => (p.velocidad * U).toFixed(0)).join("/")} u/s, ` +
      `${correderas.filter((p) => p.espera < 0).length} sin retorno, ` +
      `${correderas.filter((p) => p.atravesable).length} atravesable`);
    // Y LO QUE DECIDE SI SE PUEDEN TOCAR, que es la sorpresa del 70 y no una
    // bandera: `CBaseDoor::DoorTouch` sale en la primera línea si la puerta
    // tiene `targetname` —*«If door is somebody's target, then touching does
    // nothing»*, doors.cpp:533-538—. Las TRES de Edana lo tienen, así que
    // ninguna se abre al acercarse, traiga o no traiga `SF_DOOR_USE_ONLY`
    // (que no lo trae ninguna).
    console.log(`    por disparo   ${correderas.filter((p) => p.nombre).length} de ${correderas.length} ` +
      `tienen targetname, así que NINGUNA se abre al tocarla (doors.cpp:533-538)`);
  }
}

/**
 * LA FORMA de un volumen, que es lo que hace falta para preguntar si estás
 * dentro — y no su caja.
 *
 * Aquí me equivoqué dos veces, y las dos las cazó el mismo control.
 *
 * **La primera** fue escribir que los volúmenes de Gate City eran «brushes
 * rectangulares, así que su caja ES el volumen». El estanque grande **no lo
 * es**: es un contorno irregular de 19,7 × 8,9 m con normales como
 * (−0,65, −0,76, 0). Preguntar con la envolvente daba «estás en el agua» sobre
 * un rectángulo mucho mayor que la charca, o sea nadar en la orilla.
 *
 * **La segunda, corregida en el 48**, fue sacar los planos de las CARAS del
 * modelo y exigir que el resultado fuera convexo. Se sostenía en que «un brush
 * de GoldSrc es convexo por construcción», que es verdad — pero **una entidad
 * no es un brush: es un modelo, y puede tener varios**. En Gate City daba la
 * casualidad de que cada `func_water` era uno solo; en Edana hay un
 * `func_water` de seis brushes y otro de diez, y la guarda de convexidad
 * paraba el horneado entero. Con razón: la unión de seis brushes no es convexa
 * y meterla en una sola lista de planos habría dado un volumen vacío.
 *
 * Y el mismo error tapaba otro más callado: **los volúmenes invisibles se
 * contestaban con la caja**. Las escaleras, los `trigger_hurt` y las
 * `msarea_*` vienen sin caras —el compilador se las come— así que no había
 * planos que sacar. Pero sí los tienen: el `trigger_hurt` de Gate City son
 * CINCO brushes, y `msarea_music *287` son cuatro. Se estaban respondiendo con
 * una envolvente que los cubre a todos y al hueco entre ellos.
 *
 * Ahora la forma sale del sitio donde el motor la tiene: **el árbol BSP del
 * modelo**. Cada hoja ocupada es una pieza convexa —la intersección de los
 * medios espacios que se cruzan para llegar a ella— y «dentro» es estar dentro
 * de ALGUNA. Ver `src/bsp/clip.js`, que ya lo hacía para los
 * `func_monsterclip`.
 *
 * ── Y NO HAY UNA REGLA, HAY DOS. Esto tampoco lo sabía ─────────────────────
 *
 * Al ir a buscar la cita para justificar «hull 0» resultó que el agua y los
 * disparadores no se prueban igual, y la diferencia es de un jugador de ancho.
 *
 *   **EL AGUA** — `PM_LinkContents`, pmovetst.cpp:134-156:
 *
 *       if (pmove->physents[i].solid || model == NULL) continue;
 *       if (PM_HullPointContents(model->hulls, model->hulls[0].firstclipnode, test) != -1)
 *           return pe->skin;
 *
 *   O sea: **hull 0**, dentro es **cualquier contenido que no sea vacío**, y
 *   lo que vale como contenido no es la hoja sino el `skin` DE LA ENTIDAD. Eso
 *   es exactamente `OCUPADO`, y explica por qué en Edana hay `func_water` con
 *   las hojas en −2 y otros en −3: da igual, manda el `skin`.
 *
 *   **LOS DISPARADORES** — `SV_TouchLinks`, world.cpp:362-377:
 *
 *       if (!BoundsIntersect(...)) continue;
 *       hull = SV_HullForBsp(touch, ent->v.mins, ent->v.maxs, offset);
 *       VectorSubtract(ent->v.origin, offset, localPosition);
 *       if (SV_HullPointContents(hull, hull->firstclipnode, localPosition) != CONTENTS_SOLID)
 *           continue;
 *
 *   O sea: la caja primero —de ahí que `caja` se conserve, y no es sólo un
 *   filtro barato: es parte de la regla—, y luego **el casco del tamaño del
 *   que toca**, con `CONTENTS_SOLID` exacto. `SV_HullForBsp` (world.cpp:177-212)
 *   elige por el tamaño: un jugador de pie (32×32×72) cae en el **hull 1** y
 *   agachado (32×32×36) en el **hull 3**. Y el `offset` sale cero para los dos,
 *   porque `clip_mins` del casco es el `mins` del jugador, así que el punto que
 *   se prueba es **el `origin` del jugador tal cual** — el centro de su caja,
 *   36 unidades por encima de los pies, o 18 agachado.
 *
 * La diferencia no es cosmética: el hull 1 es el brush **engordado media caja
 * de jugador**, así que con él disparas al TOCAR la zona y con el hull 0 sólo
 * cuando tu centro está dentro. Preguntar con el 0 encoge cada zona del mapa
 * en 16 unidades por lado, y eso es un bordillo entero.
 */

/** Los volúmenes de una clase, con sus piezas y las claves que se le pidan. */
const volumenesDe = (clase, extra = () => ({}), { hulls = null } = {}) => entidades
  .filter((e) => e.classname === clase && /^\*\d+$/.test(e.model ?? ""))
  .map((e) => {
    const i = Number(e.model.slice(1));
    const o = origen(e) ?? [0, 0, 0];
    // `piezasEnEscena` ya gira los ejes, divide por las unidades por metro y
    // suma el `origin` ANTES de girar, que es el orden que importa.
    //
    // Y se VOLTEAN los planos. `clip.js` dice «dentro es `n·p >= dist`» porque
    // así es el árbol; `volumenes.js` pregunta «`n·p - d <= 0`» porque así
    // estaban los planos sacados de las caras, que miran hacia fuera. Las dos
    // formas son la misma multiplicada por −1, y confundirlas no da error: da
    // un volumen del revés, que es todo el mapa menos el charco.
    const saca = (hull, contenidos) => piezasEnEscena(bsp, i, { hull, origin: o, contenidos })
      .piezas.map((ps) => ps.map((p) => ({ n: [-p.n[0], -p.n[1], -p.n[2]], d: -p.dist })));

    const piezas = hulls
      ? saca(hulls.dePie, (c) => c === SOLIDO)
      : saca(0, OCUPADO);
    if (!piezas.length) {
      console.error(`  FALLO: el modelo *${i} de ${clase} no tiene ni una hoja ocupada en su árbol. ` +
        `Un volumen vacío no da error en el juego: no moja, no hace daño y no suena.`);
      process.exit(1);
    }
    return {
      modelo: i,
      // LA CAJA, y para los disparadores también se engorda.
      //
      // No es un filtro barato que se pueda estrechar sin consecuencias: el
      // motor prueba `BoundsIntersect(caja del jugador, caja de la entidad)`
      // ANTES del casco, y «la caja del jugador toca la de la entidad» es lo
      // mismo que «el origin del jugador está en la caja de la entidad
      // engordada media caja de jugador». Dejarla sin engordar recortaría
      // justo lo que el casco 1 añade.
      caja: hulls
        ? cajaDeModelo({
            mins: modelos[i].mins.map((v, k) => v - CLIP_MAXS[hulls.dePie][k]),
            maxs: modelos[i].maxs.map((v, k) => v - CLIP_MINS[hulls.dePie][k]),
          }, origen(e))
        : cajaDeModelo(modelos[i], origen(e)),
      // Una lista de listas de planos: dentro es estar dentro de alguna.
      piezas,
      // El casco de agachado, sólo para lo que se prueba con el del jugador.
      ...(hulls ? { piezasAgachado: saca(hulls.agachado, (c) => c === SOLIDO) } : {}),
      ...extra(e),
    };
  });

/** Las clases que el motor prueba con el casco del jugador. Ver arriba. */
const COMO_DISPARADOR = { hulls: { dePie: 1, agachado: 3 } };

const agua = volumenesDe("func_water", (e) => ({
  // `skin` es el contenido: −3 es `CONTENTS_WATER`. Se guarda porque −4
  // (`CONTENTS_SLIME`) y −5 (`CONTENTS_LAVA`) hacen daño y el agua no.
  contenido: num(e.skin, -3),
  oleaje: num(e.WaveHeight, 0),
}));
const escaleras = volumenesDe("func_ladder");
const dano = volumenesDe("trigger_hurt", (e) => ({ dano: num(e.dmg, 0) }), COMO_DISPARADOR);

// Las zonas que todavía no hacen nada, emitidas igual: el dato es del mapa.
const zonas = [
  ...volumenesDe("msarea_town", (e) => ({ clase: "msarea_town", nombre: e.targetname ?? null }), COMO_DISPARADOR),
  // LA MÚSICA, y la clave no se llama como yo pensaba: salía `null` en las once.
  //
  // `CAreaMusic::KeyValue` (msmapents.cpp:611) acepta DOS formas, y Gate City
  // usa la vieja en las once:
  //
  //     if (keyName == "song")                    m_sSong = pkvd->szValue;
  //     else if (keyName.find(".mp3") != npos)    m_sSong = pkvd->szKeyName;
  //
  // O sea que en la forma legacy **la clave ES el nombre del archivo** y el
  // valor es la duración: `"mscave.mp3": "3:17"`. Buscar un valor era buscar
  // donde no está.
  //
  // Y con la clave bien leída sale el otro dato: 7 de las 11 traen canción
  // (`mscave`, `msgatecity`, `Stamp_Your_Feet`, `MSEndlessRiver`) y **4 no
  // traen ninguna**; con `m_sSong` vacío `MusicTouch` se va en la primera línea.
  // No son zonas de música rotas: son zonas que no hacen nada, y el mapa se
  // jugaba así.
  ...volumenesDe("msarea_music", (e) => ({
    clase: "msarea_music",
    musica: e.song ?? Object.keys(e).find((k) => /\.(mp3|ogg)$/i.test(k)) ?? null,
    grupo: e.targetname ?? null,
  }), COMO_DISPARADOR),
  ...volumenesDe("msarea_transition", (e) => ({
    clase: "msarea_transition", destino: e.destmap ?? null, comoSeLlama: e.destname ?? null }), COMO_DISPARADOR),
  ...volumenesDe("trigger_once", (e) => ({ clase: "trigger_once", dispara: e.target ?? null }), COMO_DISPARADOR),
];

// --- 3c. EL CABLEADO: quién nombra a quién ----------------------------------
//
// Todo lo de arriba son volúmenes: sitios donde estás o no estás. Esto es la
// otra mitad de cómo se programa un mapa de GoldSrc — una entidad que nombra a
// otra y la **usa**— y hasta el 49 no había nada.
//
// Aquí sólo se LEE y se coloca. La regla está en `src/play/disparadores.js`,
// que es puro y cita el motor línea a línea.
//
// El `spawnflags`, el `delay` y el `killtarget` se sacan siempre, de cualquier
// clase, porque el bus los necesita de todas: son de `CBaseDelay`, no de una
// entidad concreta.
const CLASES_CON_CABLE = new Set([
  "trigger_once", "trigger_multiple", "trigger", "trigger_relay", "mstrig_relay",
  "multi_manager", "mstrig_multi", "multisource", "trigger_changetarget",
  "env_render", "trigger_teleport", "trigger_push", "trigger_hurt",
  "msarea_monsterspawn", "ms_monsterspawn", "msarea_transition", "msarea_music",
  "msarea_town", "func_door", "func_door_rotating", "func_breakable",
  "func_button", "msitem_spawn",
  "func_wall", "func_rotating", "func_pendulum", "func_ladder",
  "func_water", "trigger_changelevel", "trigger_counter", "ms_counter",
  // El 67. `LINK_ENTITY_TO_CLASS(ms_npcscript, NPCScript)` y
  // `LINK_ENTITY_TO_CLASS(mstrig_act, NPCScript)` son la MISMA clase
  // (`npcact.cpp:54-55`), así que las dos entran.
  "ms_npcscript", "mstrig_act",
]);

/** Los destinos de un teletransporte: `info_teleport_destination` con ese nombre. */
const destinosDeTele = (nombre) => entidades
  .filter((x) => x.classname === "info_teleport_destination" && x.targetname === nombre)
  .map((x) => ({
    unidades: origen(x) ?? [0, 0, 0],
    escena: aEscena(origen(x) ?? [0, 0, 0]),
    angulos: (x.angles ?? "0 0 0").trim().split(/\s+/).map(Number),
  }));

/**
 * `SetMovedir`, `subs.cpp:333-349`: de dónde mira una entidad a hacia dónde
 * empuja. Los dos ángulos mágicos son de QuakeEd, que sólo escribía un número.
 */
function direccionDe(angulos) {
  const [p, y, r] = angulos;
  if (p === 0 && y === -1 && r === 0) return [0, 0, 1];
  if (p === 0 && y === -2 && r === 0) return [0, 0, -1];
  const rad = Math.PI / 180;
  return [
    Math.cos(y * rad) * Math.cos(p * rad),
    Math.sin(y * rad) * Math.cos(p * rad),
    -Math.sin(p * rad),
  ];
}

/** Las clases cuyo disparo llega por TOCARLAS y no por que las usen. */
const TOCABLES = new Set(["trigger_once", "trigger_multiple", "trigger",
  "trigger_teleport", "trigger_push"]);

const conCable = entidades
  .map((e, i) => ({ e, i }))
  .filter(({ e }) => CLASES_CON_CABLE.has(e.classname ?? "") &&
    (e.targetname || e.target || e.killtarget || e.classname === "multi_manager" ||
     e.classname === "mstrig_multi" || e.classname === "multisource" ||
     // El 69: los rompibles y los aparecedores de objetos entran TODOS, con
     // nombre o sin él. Once de los dieciséis `func_breakable` de Gate City no
     // tienen ni `targetname` ni `target` —son rocas, no disparan nada— y aun
     // así hay que saber su vida y su material para poder romperlos. Y tres de
     // los cuatro `msitem_spawn` de Edana no tienen nombre, que es un resultado
     // y no una falta: entran para poder contarlos.
     ROMPIBLES.has(e.classname) || e.classname === "msitem_spawn"));

const disparadores = conCable.map(({ e, i }, k) => {
  const brush = /^\*\d+$/.test(e.model ?? "");
  const modelo = brush ? Number(e.model.slice(1)) : null;
  const o = origen(e) ?? [0, 0, 0];
  const angulos = (e.angles ?? "0 0 0").trim().split(/\s+/).map(Number);
  const d = {
    k,                                   // índice dentro de esta lista
    entidad: i,                          // índice dentro del lump de entidades
    clase: e.classname,
    nombre: e.targetname ?? null,
    objetivo: e.target ?? null,
    matar: e.killtarget ?? null,
    retraso: num(e.delay, 0),
    banderas: num(e.spawnflags, 0),
    maestro: e.master ?? null,
    mensaje: e.message ?? null,
    evento: e.scriptevent ?? null,       // FEB2010_23: dispara un evento de guion
    sonido: e.noise ?? null,
    unidades: o,
    escena: aEscena(o),
  };
  // Los tres filtros que ninguno de los dos mapas usa. Se sacan igual, porque
  // si algún día un mapa los trae, el bus tiene que poder decir que no los hace
  // en vez de ignorarlos en silencio.
  if (e.reqhp) d.reqhp = e.reqhp;
  if (e.reqavghp) d.reqavghp = e.reqavghp;
  if (e.reqplayers) d.reqjugadores = e.reqplayers;
  if (e.reqelsetarget) d.objetivoSiNo = e.reqelsetarget;

  switch (e.classname) {
    case "trigger_once":
      // `CTriggerOnce::Spawn` pone `m_flWait = -1` SIEMPRE, ignorando el `wait`
      // del mapa (triggers.cpp:1253). Edana tiene un `trigger_multiple` con
      // `wait 4` y un `trigger_once` con `style 32`; el `wait` del once no
      // existiría aunque lo pusiera.
      d.espera = -1;
      break;
    case "trigger_multiple":
    case "trigger":
      // `if (m_flWait == 0) m_flWait = 0.2` (triggers.cpp:1206-1207).
      d.espera = num(e.wait, 0) || 0.2;
      break;
    case "trigger_relay":
    case "mstrig_relay":
      d.uso = usoDeTriggerstate(e.triggerstate);
      d.probabilidad = num(e.random, 0);
      break;
    case "multi_manager":
    case "mstrig_multi":
      d.objetivos = objetivosDeManager(Object.entries(e));
      d.alAzar = num(e.random, 0);
      break;
    case "trigger_changetarget":
      d.objetivoNuevo = e.m_iszNewTarget ?? null;
      break;
    case "ms_npcscript":
    case "mstrig_act":
      // EL DIRECTOR DE ESCENAS DE LOS NPC (el 67). Un `scripted_sequence` de
      // Half-Life, pero de Master Sword: coge al NPC que nombra su `target` y le
      // hace moverse, poner una animación o **lanzar un evento de su guion**.
      //
      //     enum { SCRIPT_MOVE = 0, SCRIPT_PLAYANIM, SCRIPT_RUNEVENT,
      //            SCRIPT_MOVE_PLAYANIM, SCRIPT_MOVE_RUNEVENT };
      //                                            npcact.cpp:17-23
      //
      // Los 18 de Edana son sus misiones: el libro (`askbook`/`bookfound`), la
      // sidra (`cider`..`cider4`), las pruebas del alcalde (`evidence_found`),
      // el jabalí del viejo (`trig_boarsdead`, que es el `killtarget` del jefe)
      // y Edrin con su flor. **15 de los 18 son del tipo 2**, el que sólo lanza
      // un evento, y por eso ése es el que se porta entero.
      d.tipo = num(e.type, 0);
      // EL 77: el rumbo con el que acaba el NPC. `MoveThink` se lo copia al
      // llegar (`pMonster->pev->angles = pev->angles`, npcact.cpp:249) y
      // `PlayAnim` también (`:193`), así que es parte de la escena y no
      // decoración de la entidad. Va aquí y no en el bloque común porque sólo
      // esta clase lo usa para algo.
      d.angulos = angulos;
      // `target` ya va en `d.objetivo`, y aquí ES EL NPC, no una entidad a la
      // que disparar. Se le pone nombre propio para que el bus no lo confunda
      // con un objetivo de `FireTargets`: disparar al NPC sería otra cosa.
      d.npc = e.target ?? null;
      // Y `scriptevent` ya ocupa `d.evento`, que es otra cosa (FEB2010_23), así
      // que el evento del NPC va aparte.
      d.eventoDelNpc = e.eventname ?? null;
      d.animDeAndar = e.moveanim ?? null;
      d.animDeAccion = e.actionanim ?? null;
      d.alAcabar = e.firewhendone ?? null;
      d.alCortarse = e.fireonbreak ?? null;
      d.retrasoAlAcabar = num(e.firedelay, 0);
      // `m_fStopAI`: si para la IA mientras corre. Sin esto, `Act` se niega a
      // empezar cuando el NPC tiene enemigo.
      d.paraLaIa = Boolean(num(e.stopai, 0));
      break;
    case "ms_counter":
    case "trigger_counter":
      // `count` -> `m_cTriggersLeft` (triggers.cpp:688-691), y el DOS de
      // repuesto lo pone el `Spawn`, no el mapa:
      //
      //     if (m_cTriggersLeft == 0) m_cTriggersLeft = 2;   triggers.cpp:1655
      //
      // Se resuelve aquí porque es el valor con el que nace la entidad. El de
      // Edana trae `count 8`: los ocho parroquianos que hay que matar.
      d.cuenta = num(e.count, 0) || 2;
      break;
    case "env_render":
      d.renderfx = num(e.renderfx, 0);
      d.renderamt = num(e.renderamt, 0);
      d.rendermode = num(e.rendermode, 0);
      d.rendercolor = (e.rendercolor ?? "0 0 0").trim().split(/\s+/).map(Number);
      break;
    case "trigger_teleport":
      d.destinos = destinosDeTele(e.target ?? "");
      break;
    case "trigger_push":
      // `if (pev->angles == g_vecZero) pev->angles.y = 360` ANTES de
      // `SetMovedir` (triggers.cpp:2193-2194), y un yaw de 360 es un yaw de 0.
      d.direccion = direccionDe(angulos.every((v) => v === 0) ? [0, 360, 0] : angulos);
      d.velocidad = num(e.speed, 0) || 100;
      break;
    case "msarea_monsterspawn":
    case "ms_monsterspawn":
      d.reiniciarCuando = num(e.resetwhen, 0);
      d.porDisparo = Boolean(num(e.spawntrigger, 0));
      break;
    case "func_door":
    case "func_door_rotating":
      // EL 70. Lo que el BUS necesita de una puerta, que es poco: cuánto tarda
      // en abrirse, cuánto espera arriba y si vuelve sola. El recorrido, la
      // dirección y la malla están en `interactivas.correderas` / `puertas`,
      // porque son de dibujar y de chocar; esto es de disparar.
      //
      //   `CBaseDoor::Use` sólo hace algo si está ABAJO, o arriba con
      //   `SF_DOOR_NO_AUTO_RETURN` — y entonces cierra (doors.cpp:549-553).
      //   `DoorHitTop` y `DoorHitBottom` disparan su `target` al LLEGAR
      //   (doors.cpp:680 y :715), no al arrancar. Por eso el almiar de la
      //   cloaca no se lleva a sus tres hermanos hasta que la tapa termina.
      d.espera = num(e.wait, 0);
      d.velocidad = num(e.speed, 0) || 100;
      d.sinRetorno = Boolean(num(e.spawnflags, 0) & 32);
      d.empiezaAbierta = Boolean(num(e.spawnflags, 0) & 1);
      // El tiempo que tarda, que para la deslizante sale del recorrido y para
      // la rotatoria de los grados. Se calcula aquí y no en el bus porque el
      // bus no conoce la geometría — y no se escribe a mano: es una cuenta.
      if (e.classname === "func_door" && brush) {
        const md = direccionDe(angulos);
        const t = [0, 1, 2].map((j) => modelos[modelo].maxs[j] - modelos[modelo].mins[j]);
        const rec = Math.abs(md[0] * (t[0] - 2)) + Math.abs(md[1] * (t[1] - 2)) +
          Math.abs(md[2] * (t[2] - 2)) - num(e.lip, 0);
        d.recorrido = rec;
        d.duracion = Math.abs(rec) / d.velocidad;
      } else if (e.classname === "func_door_rotating") {
        d.recorrido = num(e.distance, 90);
        d.duracion = Math.abs(d.recorrido) / d.velocidad;
      }
      break;
    case "func_breakable":
      // EL 69. `pev->health -= flDamage` (func_break.cpp:575): la vida SÍ se
      // resta, al contrario que en el botón de abajo.
      d.vida = num(e.health, 0);
      d.material = num(e.material, 1);
      // `explosion` NO es «explota»: `KeyValue` compara con las CADENAS
      // "directed" y "random" y cualquier otra cosa cae en `expRandom`
      // (func_break.cpp:78-87), que es además el valor por omisión. Y estallar
      // depende de otra clave: `Explodable()` es `pev->impulse > 0`
      // (func_break.h:66-67) y el impulso lo pone `explodemagnitude`. Los cinco
      // de Gate City traen `explosion 1` y ningún `explodemagnitude`: **no
      // explotan**. Se saca para poder decir que no hace nada.
      d.explosionDirigida = String(e.explosion ?? "").toLowerCase() === "directed";
      d.magnitud = num(e.explodemagnitude, 0);
      // `spawnobject` está MUERTO en este mod: `KeyValue` tiene la asignación
      // comentada y se lo pasa a `CBaseDelay::KeyValue` (func_break.cpp:115-121),
      // que no conoce la clave. Así que `m_iszSpawnObject` es siempre nulo y la
      // línea que lo usa en `Die` (func_break.cpp:827) no se ejecuta nunca.
      // Ninguno de los dos mapas la trae; se saca para que se vea si aparece.
      d.objetoAlRomperse = e.spawnobject ?? null;
      break;
    case "func_button":
      // EL 69, Y `health` NO ES VIDA AQUÍ. `CBaseButton::TakeDamage`
      // (buttons.cpp:439-466) no toca `pev->health` en ninguna de sus 28 líneas:
      // sólo mira si puede responder y activa. `pev->health > 0` es lo único que
      // hace que el botón acepte daño (`pev->takedamage = DAMAGE_YES`,
      // buttons.cpp:531-534), o sea que es una BANDERA de «se puede golpear», y
      // el botón de la manzana se abre con **un** golpe de cualquier tamaño
      // teniendo `health 2`.
      d.vida = num(e.health, 0);
      // `if (m_flWait == 0) m_flWait = 1` (buttons.cpp:536). Y el −1 es lo que
      // hace `m_fStayPushed = TRUE` (buttons.cpp:552): se queda pulsado, o sea
      // que dispara UNA vez y no vuelve.
      d.espera = num(e.wait, 0) || 1;
      // `if (pev->speed == 0) pev->speed = 40` (buttons.cpp:528).
      d.velocidad = num(e.speed, 0) || 40;
      break;
    case "msitem_spawn":
      // EL 69, y `spawnstart` vuelve a significar LO CONTRARIO de lo que suena,
      // igual que en los aparecedores de bichos del 68 y con la misma línea:
      //
      //     m_fSpawnOnTrigger = (atoi(pkvd->szValue)) ? true : false;
      //                                                gispawn.cpp:94-98
      //
      // y `Spawn` sólo pone el `Think` que coloca el objeto **si NO está
      // puesta** (gispawn.cpp:26-33). Los cuatro de Edana traen 1: ninguno sale
      // solo.
      d.porDisparo = Boolean(num(e.spawnstart, 0));
      d.guion = e.scriptfile ?? null;
      // `container`: en vez de en el suelo, dentro de la mochila del objeto que
      // se llame así (gispawn.cpp:64-83). Ninguno de los dos mapas lo usa.
      d.contenedor = e.container ?? null;
      // `duration` NO LA LEE NADIE. `CBaseGISpawn::KeyValue` conoce tres claves
      // —`scriptfile`, `container` y `spawnstart`— y lo demás va a
      // `CBaseEntity::KeyValue` (gispawn.cpp:84-104), que sólo asigna campos de
      // `entvars_t`, y `duration` no es uno. Dos de los cuatro de Edana la
      // traen (90 000 y 60) y en el juego original tampoco hacían nada. Se saca
      // para poder decirlo en vez de suponerlo.
      d.duracionIgnorada = e.duration ?? null;
      // EL 71: el objeto hereda también los ÁNGULOS del aparecedor
      // (`pItem->pev->angles = pev->angles`, gispawn.cpp:57), y los va a
      // perder casi enteros en cuanto toque el suelo —`FallThink` pone a cero
      // el cabeceo y el alabeo (genericitem.cpp:1403-1404)— pero el rumbo se
      // queda. Los cuatro de Edana traen `0 0 0`; se saca igual, porque un
      // valor por omisión escrito en el que dibuja es un sitio donde el día que
      // un mapa gire un objeto no se entera nadie.
      d.angulos = (e.angles ?? "0 0 0").trim().split(/\s+/).map(Number);
      break;
    default: break;
  }
  // LA CAJA de lo que se rompe y se pulsa (el 69), que hace falta para saber
  // DÓNDE está. Su `origin` no sirve: un brush no lo trae, así que `escena` sale
  // el cero del mapa — y un botón en el cero es un botón que nadie encuentra.
  if (brush && (ROMPIBLES.has(e.classname) || e.classname === "func_button")) {
    d.caja = cajaDeModelo(modelos[modelo], o);
  }
  // Los volúmenes que se TOCAN: con el casco del jugador, como el 48.
  if (brush && TOCABLES.has(e.classname)) {
    const r = piezasEnEscena(bsp, modelo, { hull: 1, origin: o, contenidos: (c) => c === SOLIDO });
    const r3 = piezasEnEscena(bsp, modelo, { hull: 3, origin: o, contenidos: (c) => c === SOLIDO });
    d.caja = cajaDeModelo({
      mins: modelos[modelo].mins.map((v, j) => v - CLIP_MAXS[1][j]),
      maxs: modelos[modelo].maxs.map((v, j) => v - CLIP_MINS[1][j]),
    }, origen(e));
    const voltea = (ps) => ps.map((p) => ({ n: [-p.n[0], -p.n[1], -p.n[2]], d: -p.dist }));
    d.piezas = r.piezas.map(voltea);
    d.piezasAgachado = r3.piezas.map(voltea);
  }
  return d;
});


// EL INFORME DEL CABLEADO, y lo que de verdad importa de él es la última
// línea: **a cuántos nombres citados no responde nadie**. Un `target` que no
// existe no da error en el motor —`FireTargets` recorre cero entidades— así que
// es el fallo de lectura que se vería igual que «funciona».
{
  const nombres = new Map();
  for (const d of disparadores) if (d.nombre) nombres.set(d.nombre, (nombres.get(d.nombre) ?? 0) + 1);
  const citados = new Set();
  for (const d of disparadores) {
    if (d.objetivo) citados.add(d.objetivo);
    if (d.matar) citados.add(d.matar);
    for (const o of d.objetivos ?? []) citados.add(o.nombre);
  }
  // Los nombres que existen en el mapa entero, no sólo entre los disparadores:
  // un `target` puede apuntar a un `env_model` o a un monstruo.
  const todosLosNombres = new Set(entidades.map((e) => e.targetname).filter(Boolean));
  const huerfanos = [...citados].filter((t) => !todosLosNombres.has(t));
  const porClase = new Map();
  for (const d of disparadores) porClase.set(d.clase, (porClase.get(d.clase) ?? 0) + 1);
  const tocables = disparadores.filter((d) => d.piezas);
  console.log(`\n  cableado        ${disparadores.length} entidades con nombre u objetivo, ` +
    `${nombres.size} nombres distintos, ${citados.size} citados`);
  console.log(`    por clase     ${[...porClase].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${n} ${c}`).join(", ")}`);
  console.log(`    se tocan      ${tocables.length} con volumen ` +
    `(${tocables.reduce((a, d) => a + d.piezas.length, 0)} brushes de pie)`);
  const repes = [...nombres].filter(([, n]) => n > 1);
  console.log(`    nombres repetidos ${repes.length}` +
    (repes.length ? `: ${repes.map(([n, c]) => `${n}×${c}`).join(", ")} — FireTargets los usa a TODOS` : ""));
  console.log(`    sin destinatario ${huerfanos.length}${huerfanos.length ? `: ${huerfanos.join(", ")}` : ""}`);
}

// EL AMBIENTE, que no es un volumen sino un PUNTO.
//
// `ambient_generic` lleva el `.wav` en `message`, el volumen en `health` (0..10,
// y el motor lo divide entre 10) y el radio en `radius`. `spawnflags & 2` es
// SF_AMBIENT_SOUND_START_SILENT y `& 1` es que suene en bucle todo el mapa en
// vez de atenuarse — sin mirarlas, una antorcha se oiría desde el otro lado.
const ambiente = entidades
  .filter((e) => e.classname === "ambient_generic" && e.message)
  .map((e) => ({
    sonido: e.message,
    donde: aEscena((e.origin ?? "0 0 0").trim().split(/\s+/).map(Number)),
    volumen: (num(e.health, 10)) / 10,
    radio: num(e.radius, 1250) / U,
    // `pitch` es 100 = normal; el motor lo usa como porcentaje de velocidad.
    tono: num(e.pitch, 100) / 100,
    empiezaCallado: Boolean(num(e.spawnflags, 0) & 2),
    sinAtenuar: Boolean(num(e.spawnflags, 0) & 1),
  }));

// ── EL 82: LAS TRES CLASES QUE EDANA CONTABA Y NADIE LEÍA ──────────────────
//
// Las tres son entidades de PUNTO y las tres estaban contadas desde el 67 sin
// hornearse. Gate City tiene **cero de las tres**, y eso es justo la trampa del
// 50: con un mapa el valor correcto y el valor de reposo son la misma lista
// vacía. Por eso se hornean leyendo `entidades`, que es el `.bsp` crudo, y por
// eso las cuentas de abajo se imprimen SIEMPRE, también cuando son cero: un
// cero dicho es un dato, un cero callado es el sitio donde vive una regla
// muerta (el 69).

// LA REVERBERACIÓN: `env_sound`, 333 en 29 mapas, 11 en Edana.
//
// No emite ningún sonido: le pone al JUGADOR su `room_type`, que es el preset
// del DSP del motor. Las dos claves son todo lo que el motor lee de la entidad
// (`CEnvSound::KeyValue`, sound.cpp:879-891, las dos con `atof`), y el resto de
// la regla —quién gana cuando dos alcanzan al jugador— es de
// `src/play/reverberacion.js`, que la cita línea a línea.
//
// `roomtype` puede FALTAR: 56 de los 333 no la traen, y el valor de reposo de
// un `float` sin inicializar en el motor es el 0 del `pev` recién puesto a
// cero, o sea el preset «off». Dos de los once de Edana están así, y eso **no
// es un descuido del mapeador**: es cómo se apaga la reverberación de una zona
// metiendo un `env_sound` sin tipo dentro de otro más grande.
const reverberacion = entidades
  .filter((e) => e.classname === "env_sound")
  .map((e) => ({
    unidades: origen(e) ?? [0, 0, 0],
    donde: aEscena(origen(e) ?? [0, 0, 0]),
    // `m_flRadius`, en unidades. Se guardan las dos porque la regla compara en
    // unidades (es una longitud de traza del motor) y el dibujo va en metros.
    radio: num(e.radius, 0),
    radioEnMetros: num(e.radius, 0) / U,
    tipo: num(e.roomtype, 0),
    // Que la clave viniera o no, dicho y no deducido del cero: si no se
    // distingue, un mapa sin `roomtype` y un mapa con `roomtype 0` son la
    // misma cosa y no se puede medir que se leyó.
    declaraTipo: e.roomtype !== undefined,
  }));

// LAS COLUMNAS DE HUMO: `env_beam`, 83 en 20 mapas, 2 en Edana.
//
// Un haz entre DOS entidades que se nombran por `LightningStart` y
// `LightningEnd`:
//
//     edict_t *pStart = FIND_ENTITY_BY_TARGETNAME(NULL, STRING(m_iszStartEntity));
//     edict_t *pEnd   = FIND_ENTITY_BY_TARGETNAME(NULL, STRING(m_iszEndEntity));
//     ...
//     if (beamType == BEAM_POINTS || ...) { SetStartPos(pStart->v.origin);
//                                           SetEndPos(pEnd->v.origin); }
//                                            effects.cpp:850-887
//
// Y AQUÍ ESTABA EL RIESGO, que se comprobó ANTES de escribir el bucle: las dos
// puntas son `info_target`, y un `info_target` **no es un adorno**. Si se
// buscaran en la lista de adornos horneados no se encontraría ninguna, porque
// los adornos se hornean casi todos sin nombre —el fallo del `env_render` del
// 69, 0 de 46— y el bucle recorrería cero elementos sin decir nada. Se
// resuelven contra `entidades`, el `.bsp` crudo, igual que `destinosDeTele`.
// Los cuatro `info_target` de Edana (`smoke1a`/`smoke1b`/`smoke2a`/`smoke2b`)
// traen su `targetname` ahí, y por eso esto puede existir.
//
// `life 0` no es «dura cero»: es lo que hace que el haz sea PERMANENTE.
//
//     inline BOOL ServerSide(void) {
//       if (m_life == 0 && !(pev->spawnflags & SF_BEAM_RING)) return TRUE;
//       return FALSE; }                       effects.cpp:365-370
//
// Un haz `ServerSide` se monta una vez en `Activate` y se queda; el otro es el
// del rayo que golpea cada `m_restrike`. **Las dos de Edana no traen `life`**,
// o sea que son de las permanentes, que es lo que hace de ellas una columna de
// humo quieta y no un relámpago.
const SF_BEAM = { ARRANCA_ENCENDIDO: 1, CONMUTA: 2, AL_AZAR: 4, ANILLO: 8, ENTRA: 0x80, SALE: 0x100 };
const puntaDeHaz = (nombre) => {
  const e = entidades.find((x) => x.targetname === nombre && origen(x));
  return e ? { nombre, unidades: origen(e), donde: aEscena(origen(e)), clase: e.classname } : null;
};
const haces = entidades
  .filter((e) => e.classname === "env_beam" || e.classname === "env_lightning")
  .map((e) => {
    const banderas = num(e.spawnflags, 0);
    const vida = num(e.life, 0);
    return {
      objetivo: e.targetname ?? null,
      unidades: origen(e) ?? [0, 0, 0],
      inicio: puntaDeHaz(e.LightningStart ?? ""),
      fin: puntaDeHaz(e.LightningEnd ?? ""),
      // `SetTexture(m_spriteTexture)`: el `.spr` con el que se pinta. El de las
      // dos de Edana es `sprites/smoke.spr`.
      sprite: e.texture ?? null,
      // ── EL ANCHO VA EN DÉCIMAS, Y LA DÉCIMA NO ESTÁ EN NINGÚN `.cpp` ───
      //
      // Esto decía «el motor lo guarda en décimas (`m_boltWidth = atoi * 0.1`)»
      // y **era falso**: `KeyValue` hace `m_boltWidth = atoi(szValue)` a pelo
      // (effects.cpp:511) y `SetWidth` lo copia tal cual —
      // `inline void SetWidth(int width) { pev->scale = width; }`,
      // effects.h:133—. Buscar el 0,1 en el C++ no lo encuentra, porque no está
      // ahí: está en un **asset del juego**.
      //
      //     custom_entity_state_t gamedll Custom_Encode
      //     {
      //       ...
      //       DEFINE_DELTA_POST( scale, DT_FLOAT, 8, 1.0, 0.1 ),
      //                                      assets/msr/delta.lst:219-231
      //
      // `custom_entity_state_t` es el bloque de delta de las entidades
      // personalizadas, que es lo que ES un haz (`pev->flags |= FL_CUSTOMENTITY`,
      // effects.cpp:858, y el cliente lo coge por `ET_BEAM`). O sea que el
      // `scale` viaja en **8 bits con posmultiplicador 0,1**, y lo que el
      // dibujante recibe (`ent->curstate.scale`, gl_beams.c:1195) es la décima
      // parte de lo que escribió el mapeador.
      //
      // **Y el dato lo confirma:** las dos de Edana traen `BoltWidth 255`, que
      // es exactamente el máximo de un campo de 8 bits. Con la lectura literal
      // el medio ancho serían 255 unidades —una columna de humo de trece metros
      // de ancha y cuatro y medio de alta—; con la décima son 25,5, o sea metro
      // y pico. *El número redondo del mapa era la pista de cuántos bits tiene
      // el campo.*
      //
      // Se hornea el valor CRUDO y la décima la aplica quien dibuja, que es
      // donde el motor la aplica.
      ancho: num(e.BoltWidth, 0),
      ruido: num(e.NoiseAmplitude, 0),
      // `pev->renderamt` es el brillo 0..255 y `rendercolor` el tinte.
      brillo: num(e.renderamt, 0),
      color: (e.rendercolor ?? "255 255 255").trim().split(/\s+/).map(Number),
      // `SetScrollRate(m_speed)`: a qué velocidad corre la textura por el haz.
      // Es lo que hace que el humo SUBA sin que el haz se mueva.
      desplazamiento: num(e.TextureScroll, 0),
      fotogramas: num(e.framerate, 0),
      fotogramaInicial: num(e.framestart, 0),
      vida,
      // La palabra del motor, no una nuestra: `ServerSide()`.
      permanente: vida === 0 && !(banderas & SF_BEAM.ANILLO),
      recarga: num(e.StrikeTime, 0),
      dano: num(e.damage, 0),
      banderas,
      arrancaEncendido: Boolean(banderas & SF_BEAM.ARRANCA_ENCENDIDO),
      // `BEAM_FSHADEIN`/`BEAM_FSHADEOUT`, effects.cpp:902-905: el haz se
      // desvanece por un extremo. Las dos de Edana traen `ENTRA` (129 = 1|128),
      // y es lo que hace que el humo se deshaga arriba en vez de cortarse.
      fundeEntrando: Boolean(banderas & SF_BEAM.ENTRA),
      fundeSaliendo: Boolean(banderas & SF_BEAM.SALE),
    };
  });

// EL PREGONERO: `speaker`, **1 en los 93 mapas** y está en Edana.
//
// `message` no es un `.wav`: es el nombre de un GRUPO de frases de
// `sound/sentences.txt`, y el motor saca una al azar del grupo:
//
//     if (szSoundFile[0] == '!') { ...una sola, y se apaga... }
//     else { if (SENTENCEG_PlayRndSz(ENT(pev), szSoundFile, flvolume,
//                                    flattenuation, flags, pitch) < 0) ... }
//                                            sound.cpp:1884-1899
//
// El volumen sale de `health`, que no es vida: `float flvolume = pev->health *
// 0.1` (:1827). El de Edana trae `health 5`, o sea medio volumen, y
// `message "WILD"`, que son las 19 frases de ambiente de campo abierto del
// `sentences.txt` del mod —codornices, abejas, halcones, viento y un chochín—.
//
// Los tiempos son dos y los dos al azar: la primera a `RANDOM_FLOAT(5, 15)`
// segundos de nacer (:1821) y las demás cada `RANDOM_FLOAT(0.25*60, 2.25*60)`
// (:1901), o sea entre 15 segundos y dos minutos y cuarto.
const SPEAKER_START_SILENT = 1;                             // util.h:437
const pregoneros = entidades
  .filter((e) => e.classname === "speaker")
  .map((e) => ({
    objetivo: e.targetname ?? null,
    unidades: origen(e) ?? [0, 0, 0],
    donde: aEscena(origen(e) ?? [0, 0, 0]),
    grupo: e.message ?? null,
    // Una sola frase, no un grupo, si empieza por `!`. Ninguno del juego lo
    // hace —hay uno— pero la rama existe en el motor y se dice cuál se tomó.
    unaSola: String(e.message ?? "").startsWith("!"),
    volumen: num(e.health, 0) * 0.1,
    atenuacion: 0.3,                                        // sound.cpp:1828
    tono: 100,                                              // sound.cpp:1830
    empiezaCallado: Boolean(num(e.spawnflags, 0) & SPEAKER_START_SILENT),
  }));

console.log(
  `  punto y oído    ${ambiente.length} ambient_generic, ${reverberacion.length} env_sound, ` +
  `${haces.length} env_beam, ${pregoneros.length} speaker`
);
if (reverberacion.length) {
  const tipos = [...new Set(reverberacion.map((r) => r.tipo))].sort((a, b) => a - b);
  console.log(`    env_sound     tipos ${tipos.join(", ")}` +
    ` · ${reverberacion.filter((r) => !r.declaraTipo).length} sin declarar tipo`);
}
// Las dos puntas de cada haz, DICHAS. Un haz al que le falta una punta no se
// puede dibujar, y callarlo es el bucle que recorre cero del 69.
for (const h of haces) {
  const falta = [!h.inicio && "inicio", !h.fin && "fin"].filter(Boolean);
  console.log(`    env_beam      ${h.objetivo ?? "(sin nombre)"} ${h.sprite ?? "(sin sprite)"}` +
    ` ${h.permanente ? "permanente" : `rayo cada ${h.recarga} s`}` +
    (falta.length ? `  ¡SIN ${falta.join(" ni ")}!` : ` ${h.inicio.nombre}→${h.fin.nombre}`));
}
for (const p of pregoneros) {
  console.log(`    speaker       grupo ${p.grupo} a ${p.volumen.toFixed(1)} de volumen` +
    `${p.empiezaCallado ? ", empieza callado" : ""}`);
}

console.log(
  `  se comportan    ${puertas.length} puertas (${puertas.reduce((a, p) => a + p.triangulos, 0)} tri), ` +
  `${agua.length} de agua, ${escaleras.length} escaleras, ${dano.length} de daño, ${zonas.length} zonas`
);
console.log(
  `    puertas       ${puertas[0]?.grados}° a ${puertas[0]?.velocidad}°/s, esperan ${puertas[0]?.espera} s · ` +
  `${puertas.filter((p) => p.eje === "y").length} de eje vertical, ${puertas.filter((p) => p.soloUsar).length} de sólo usar`
);
// CUÁNTO SOBRA la caja envolvente, que es la cifra que justifica los planos.
//
// Se mide muestreando: cuántos puntos de la caja están de verdad dentro del
// poliedro. Para una caja daría el 100 %; el estanque grande da bastante menos,
// y ese resto es el agua que habríamos inventado en la orilla.
//
// **EL DADO VA CON SEMILLA, y eso lo destapó el 47.** Estaba con `Math.random`
// suelto, así que dos horneados del mismo `.bsp` daban `llenaLaCaja` 0.808 y
// 0.804 — y con ellos dos `malla.json` distintos. Lo encontré comparando el
// archivo de antes y el de después de parametrizar el extractor, para
// comprobar que el refactor no había cambiado nada: **no se podía comprobar**,
// porque el ruido del muestreo tapaba cualquier cambio de verdad.
//
// Es el fallo del experimento 28 otra vez —un `Math.random` sin inyectar donde
// dos partes tienen que ver lo mismo—, aquí entre dos extracciones en vez de
// entre dos jugadores. Un generador de una línea basta: lo que se quiere es
// que la estimación sea la misma, no que sea imprevisible.
/** `mulberry32`: un generador de 32 bits, determinista y suficiente para esto. */
function dadoDe(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cuantoSobra(v, n = 20000) {
  if (!v.piezas?.length) return null;
  // La semilla es fija: la misma caja da siempre la misma estimación.
  const azar = dadoDe(0x5eed);
  const enPieza = (ps, p) => ps.every((q) => q.n[0] * p[0] + q.n[1] * p[1] + q.n[2] * p[2] - q.d <= 0.01);
  let dentro = 0;
  for (let i = 0; i < n; i++) {
    const p = [0, 1, 2].map((k) => v.caja.min[k] + azar() * (v.caja.max[k] - v.caja.min[k]));
    if (v.piezas.some((ps) => enPieza(ps, p))) dentro++;
  }
  return dentro / n;
}
for (const a of agua) {
  const t = a.caja.max.map((v, k) => (v - a.caja.min[k]).toFixed(1)).join(" × ");
  const f = cuantoSobra(a);
  a.llenaLaCaja = f === null ? null : Number(f.toFixed(3));
  console.log(
    `    agua          ${t} m, contenido ${a.contenido}, oleaje ${a.oleaje} · ` +
    `${a.piezas.length} ${a.piezas.length === 1 ? "brush" : "brushes"}, ` +
    `${a.piezas.reduce((s, ps) => s + ps.length, 0)} planos, llena el ${(f * 100).toFixed(0)} % de su caja`
  );
}
for (const e of escaleras) {
  const t = e.caja.max.map((v, k) => (v - e.caja.min[k]).toFixed(2)).join(" × ");
  const f = cuantoSobra(e);
  console.log(`    escalera      ${t} m · ${e.piezas.length} brushes del árbol ` +
    `(sin caras: el compilador se las comió), llena el ${(f * 100).toFixed(0)} % de su caja`);
}

// EL CONTROL: que usar las piezas en vez de la caja cambie algo de verdad.
//
// Si todos los volúmenes llenaran su caja, los planos serían trabajo para nada
// y bastaría la envolvente. El estanque grande dice que no.
{
  const conPlanos = agua.filter((a) => a.piezas?.length);
  const peor = Math.min(...conPlanos.map((a) => a.llenaLaCaja));
  if (!(peor < 0.9)) {
    console.error(
      `  FALLO: todos los volúmenes llenan su caja (el peor, el ${(peor * 100).toFixed(0)} %). ` +
      `Entonces los planos no hacen falta y sobra la mitad de esta sección.`
    );
    process.exit(1);
  }
  console.log(
    `    los planos    hacen falta: el peor volumen llena el ${(peor * 100).toFixed(0)} % de su caja, ` +
    `o sea que con la envolvente el ${((1 - peor) * 100).toFixed(0)} % sería agua inventada`
  );
}

// LO QUE EL 48 CORRIGIÓ, medido: los volúmenes INVISIBLES.
//
// Hasta el 48 éstos se contestaban con la caja, porque sus planos se sacaban de
// las caras y el compilador se las come. La cifra de abajo es cuánto de esa
// caja no es el volumen: daño que se cobraba fuera del `trigger_hurt`, música
// que sonaba fuera de su zona. No se ve, y por eso hay que contarlo.
{
  const todos = [...agua, ...escaleras, ...dano, ...zonas];
  const varios = todos.filter((v) => v.piezas.length > 1);
  const conHueco = todos
    .map((v) => ({ v, f: cuantoSobra(v) }))
    .filter((x) => x.f !== null && x.f < 0.99)
    .sort((a, b) => a.f - b.f);
  console.log(
    `    piezas        ${todos.length} volúmenes, ${todos.reduce((s, v) => s + v.piezas.length, 0)} brushes; ` +
    `${varios.length} tienen más de uno (el mayor, ${Math.max(...todos.map((v) => v.piezas.length))})`
  );
  // EL CONTROL DEL SIGNO, que es el fallo más barato de cometer aquí: los
  // planos del árbol miran hacia DENTRO y los que espera `volumenes.js` hacia
  // fuera. Voltearlos mal no da error, da el volumen del revés —todo el mapa
  // menos el charco— y en pantalla es agua que no moja y música que suena en
  // todas partes. Con el signo cambiado, TODOS los volúmenes salen vacíos.
  const vacios = todos.filter((v) => cuantoSobra(v) === 0).length;
  if (vacios > todos.length / 2) {
    console.error(`  FALLO: ${vacios} de ${todos.length} volúmenes no contienen ni uno de los ` +
      `20 000 puntos de su propia caja. Eso es tener los planos del revés.`);
    process.exit(1);
  }
  console.log(
    `    no son su caja ${conHueco.length} de ${todos.length}` +
    (conHueco.length
      ? `; el peor llena el ${(conHueco[0].f * 100).toFixed(0)} % ` +
        `(${conHueco[0].v.clase ?? "agua/escalera/daño"}, modelo *${conHueco[0].v.modelo})`
      : "")
  );
}

// El reparto de superficie por textura y el tamaño de cara.
//
// Se miden DOS VECES: sobre las caras del mundo y sobre todas. No es celo: las
// cifras de referencia de este experimento —80 texturas, 10 para el 80 %, mediana
// de 0,47 m²— están medidas sobre el modelo 0, porque es lo que `bsp.mjs` leía.
// Dando la de todas las caras salen 92, 11 y 0,29, que no son peores ni mejores:
// son OTRA medida, y compararlas con las de antes es el error de denominador de
// siempre con otra ropa.
function variedad(cs) {
  const porTex = new Map();
  for (const c of cs) {
    const n = texturas[c.miptex]?.nombre;
    if (n) porTex.set(n, (porTex.get(n) ?? 0) + c.area);
  }
  const reparto = [...porTex].map(([n, a]) => ({ n, m2: m2(a) })).sort((x, y) => y.m2 - x.m2);
  const total = reparto.reduce((s, t) => s + t.m2, 0);
  const paraCubrir = (f) => {
    let s = 0;
    for (let i = 0; i < reparto.length; i++) { s += reparto[i].m2; if (s / total >= f) return i + 1; }
    return reparto.length;
  };
  const areas = cs.map((c) => m2(c.area)).sort((a, b) => a - b);
  return {
    texturas: reparto.length, total,
    c50: paraCubrir(0.5), c80: paraCubrir(0.8), c95: paraCubrir(0.95),
    mediana: areas[Math.floor(areas.length / 2)], mayor: areas.at(-1),
    mayorTextura: reparto[0] ? reparto[0].m2 / total : 0,
  };
}
const delMundo = variedad(caras.filter((c) => c.modelo === 0));
const deTodo = variedad(caras);
for (const [etiqueta, v] of [["mundo", delMundo], ["todo ", deTodo]]) {
  console.log(`    ${etiqueta}         ${v.texturas} texturas en ${v.total.toFixed(0)} m²; ` +
    `${v.c50}/${v.c80}/${v.c95} para el 50/80/95 %; la mayor ${(v.mayorTextura * 100).toFixed(0)} %; ` +
    `cara mediana ${v.mediana.toFixed(2)} m², la mayor ${v.mayor.toFixed(0)}`);
}
const reparto = [];

// --- 5. las luces y la entrada ----------------------------------------------
const luces = entidades
  .filter((e) => /^light/.test(e.classname ?? "") && origen(e))
  .map((e) => ({ posicion: aEscena(origen(e)), light: Number(e.light ?? 300) }));

// La llegada sale de `ms_player_begin`, que SÍ está en este mapa — ver el
// comentario de `leerLlegada()`: escribí aquí que no existía, con la clase a la
// vista en la lista de entidades, y lo encontró alguien andando el mapa un minuto.
const llegada = leerLlegada(bsp, entidades, origen);
const entrada = llegada.unidades;
console.log(`\n  entrada         ${llegada.clase} en ${entrada.map((v) => (v / U).toFixed(1)).join(", ")} m, ` +
  `${llegada.alturaSobreElSuelo} unidades (${(llegada.alturaSobreElSuelo / U).toFixed(2)} m) sobre el suelo`);
console.log(`                  y ${llegada.reapariciones} ms_player_spawn, que son REAPARICIONES, no la llegada`);
console.log(`  luces           ${luces.length}`);

// --- los pueblos, para poder llegar a los interiores -------------------------
//
// Ocho `msarea_town`, y lo que hace falta de cada uno no es su caja: es un sitio
// DE VERDAD donde se puede estar. La caja abarca también la roca —el centro de la
// mayor cae en sólido, lo dijo el árbol— así que el punto se saca de la cara de
// suelo mayor que cae dentro, y se comprueba que encima esté vacío.
//
// Existe porque quien lo anduvo dijo «el lugar de inicio está fuera de los
// interiores», y tenía razón a medias: Gate City deja 40 m de cueva entre la
// llegada y la primera casa, a propósito. Lo que faltaba era poder IR a mirarlas.
// EL CIELO NO ES UN SUELO, y mira hacia arriba igual que uno (experimento 78).
// La cara de abajo de la caja de cielo cumple `normal[2] > 0.7` y es de las más
// grandes del mapa, así que encabezaba esta lista ordenada por área. Encima de
// ella está el propio brush de cielo —sólido— y debajo está el mundo —hueco—:
// **contesta justo al revés que un suelo**. Se filtra por nombre de textura,
// que es como lo identifica ya `tools/gatecity_shot.mjs:145`.
const suelosDelMundo = caras
  .filter((c) => c.modelo === 0 && c.normal[2] > 0.7 &&
    (texturas[c.miptex]?.nombre ?? "").toLowerCase() !== "sky")
  .sort((a, b) => b.area - a.area);
const pueblos = entidades
  .filter((e) => e.classname === "msarea_town" && /^\*\d+$/.test(e.model ?? ""))
  .map((e) => modelos[Number(e.model.slice(1))])
  .sort((a, b) => (b.maxs[0] - b.mins[0]) * (b.maxs[1] - b.mins[1]) -
    (a.maxs[0] - a.mins[0]) * (a.maxs[1] - a.mins[1]))
  .map((m, i) => {
    const dentro = suelosDelMundo.filter((c) => {
      const p = c.puntos[0];
      return p[0] >= m.mins[0] && p[0] <= m.maxs[0] && p[1] >= m.mins[1] &&
        p[1] <= m.maxs[1] && p[2] >= m.mins[2] - 64 && p[2] <= m.maxs[2];
    });
    // El primero de los suelos grandes con hueco encima. Sin la comprobación, uno
    // de los ocho colocaba la cámara dentro de la roca.
    const bueno = dentro.find((c) => {
      const ctr = centroDeCara(c);
      return sePuedeEstar(bsp, [ctr[0], ctr[1], ctr[2] + 24]);
    });
    if (!bueno) return null;
    const ctr = centroDeCara(bueno);
    return {
      indice: i,
      pies: ctr,
      area: m2((m.maxs[0] - m.mins[0]) * (m.maxs[1] - m.mins[1])),
      suelos: dentro.length,
      suelo: m2(dentro.reduce((a, c) => a + c.area, 0)),
    };
  })
  .filter(Boolean);
const alPueblo = pueblos.length
  ? Math.min(...pueblos.map((p) => Math.hypot(p.pies[0] - entrada[0], p.pies[1] - entrada[1]) / U))
  : null;
// EL CONTROL DEL ÁRBOL, que sin él nada de lo de arriba dice nada.
//
// Tres preguntas cuya respuesta se sabe de antemano: fuera del mapa tiene que
// salir SÓLIDO, un palmo por ENCIMA de una cara de suelo VACÍO, y un palmo por
// DEBAJO otra vez SÓLIDO.
//
// La tercera es del 48 y es la que faltaba. Antes sólo se pedía «encima sale
// vacío al menos 150 de 200 veces», y eso es dos cosas malas a la vez: es un
// número afinado sobre Gate City —que da 182— y **no distingue un árbol que
// funciona de un árbol que contesta VACÍO a todo**. Edana da 141 y paraba el
// horneado; mirando por qué se ve que no es peor lectura sino otro mapa:
// tiene sótanos y alcantarillas, y muchas caras de suelo miran a un hueco
// cerrado. Bajar el 150 habría sido tapar el agujero del control con el
// síntoma; lo que hay que exigir es que las dos preguntas se contesten
// DISTINTO, y eso no depende del mapa.
//
// ── CORRECCIÓN DEL 78: el umbral estaba bien y LA MUESTRA estaba mal ────────
//
// Lo de arriba sigue siendo cierto y no era suficiente. La muestra eran **las
// 200 caras de suelo más grandes**, y la más grande de un mapa al aire libre
// es el cielo, que contesta al revés (ver `suelosDelMundo`). De once mapas
// medidos, SEIS fallaban este control con el árbol leyendo perfectamente:
// gertenheld_forest2 daba −19 y paraba el horneado, hemlock −2, deralia 7,
// helena 14, thornlands_north 22, old_helena 28. Y **Edana pasaba por un
// punto**: 51 con las 200 mayores, 84 con todas.
//
// Dos cambios, y hacen falta los dos:
//
//   1. el cielo sale de `suelosDelMundo`, porque no es un suelo;
//   2. **no se muestrea**. Preguntar sólo por las mayores era elegir las caras
//      menos representativas que hay; el árbol se recorre entero, que son unos
//      miles de preguntas y no se nota. Así la muestra deja de ser un número
//      afinado sobre un mapa, que es el mismo fallo que el 48 arregló en el
//      umbral y dejó aquí al lado.
//
// Con los dos: 61 (gatecity), 84 (edana), 94 (gertenheld_forest2), y el peor
// de los once es 61.
{
  const fuera = contenidoEn(bsp, [modelos[0].maxs[0] + 500, modelos[0].maxs[1] + 500, modelos[0].maxs[2] + 500]);
  const muestra = suelosDelMundo.map(centroDeCara);
  const n = muestra.length;
  const encima = muestra.filter((t) => sePuedeEstar(bsp, [t[0], t[1], t[2] + 24])).length;
  const debajo = muestra.filter((t) => sePuedeEstar(bsp, [t[0], t[1], t[2] - 24])).length;
  const separa = (encima - debajo) / n;
  console.log(`  árbol BSP       ${bsp.lumps.nodos.len / 24} nodos, ${bsp.lumps.hojas.len / 28} hojas`);
  console.log(`    control       fuera del mapa -> ${fuera.nombre}; de ${n} caras de suelo, ` +
    `${encima} tienen hueco encima y ${debajo} debajo -> separa ${(separa * 100).toFixed(0)} puntos`);
  if (fuera.vacio || separa < 0.5) {
    console.error(`    FALLO: el recorrido del árbol no discrimina. Un árbol que contesta lo mismo ` +
      `encima y debajo de un suelo no está leyendo el árbol.`);
    process.exit(1);
  }
}
// Los `msarea_town` son de Gate City: Edana no tiene ni uno, y eso no es un
// fallo del extractor. Se dice el denominador que trae el mapa en vez del 8 de
// Gate City, y con cero no se inventa un «el mayor».
{
  const hay = entidades.filter((e) => e.classname === "msarea_town" && /^\*\d+$/.test(e.model ?? "")).length;
  console.log(`  pueblos         ${pueblos.length} de ${hay} msarea_town con un suelo donde estar` +
    (alPueblo === null ? "" : `; el más cercano a la llegada, a ${alPueblo.toFixed(0)} m`));
  if (pueblos.length) {
    console.log(`                  el mayor: ${pueblos[0].area.toFixed(0)} m² de caja, ` +
      `${pueblos[0].suelo.toFixed(0)} m² de suelo en ${pueblos[0].suelos} caras`);
  }
}

// --- los carteles: las antorchas ---------------------------------------------
//
// `env_sprite` apunta a un `.spr` que NO está dentro del `.bsp`, pero SÍ está al
// lado, en `../MSC/assets/msr/sprites/`. Así que se aplica la misma regla que al
// mapa: **se escribe el lector, no se copia el contenido** — el lector vale para
// cualquier `.spr` de GoldSrc y lo extraído va a `build/<mapa>/spr/`.
//
// Y esto es lo que contesta a «el mapa original emitía luces desde antorchas».
// La luz ya estaba —`pi_lantern` tiene el mapa de luz a 181 sobre 255 de mediana
// y `rock_07` a 17, un factor de diez— y lo que faltaba era la LLAMA: `Fire1.spr`
// puesto 55 veces. El charco de luz en la roca lo teníamos; la fuente era
// invisible.
const RAIZ_ASSETS = RUTA.replace(/maps[\\/][^\\/]+$/, "");
const carteles = [];
const spritesLeidos = new Map();
const spritesQueFaltan = new Set();
const spritesSustituidos = new Map();
for (const e of entidades) {
  if (!/^env_(sprite|glow)$/.test(e.classname ?? "") || !e.model || !origen(e)) continue;
  const rutaSpr = RAIZ_ASSETS + e.model;
  const base = e.model.replace(/^.*[\\/]/, "").toLowerCase();
  if (!spritesLeidos.has(e.model)) {
    if (!existsSync(rutaSpr) && SUSTITUTOS[base]) {
      // El sustituto GENERADO. Ver `src/bsp/halo.js`: `glow01.spr` no está en la
      // carpeta de MSC porque es del Half-Life base, y las 23 `env_glow` que lo
      // usan son el halo de las lámparas — o sea lo que se ve cuando una lámpara
      // emite. Sin él la luz está horneada y la fuente es invisible, que es
      // exactamente lo que se reprochó: «las lámparas no están emitiendo luz».
      const sus = SUSTITUTOS[base];
      const tira = sus.generar();
      const archivo = `spr/${base.replace(/\.spr$/i, "")}.png`;
      escribirPng(`${SALIDA}/${archivo}`, tira.rgba, tira.ancho, tira.alto);
      spritesSustituidos.set(e.model, sus.porque);
      spritesLeidos.set(e.model, {
        // Una cabecera de mentira pero declarada: el rectángulo sale de `halo.js`
        // y no de un archivo, y por eso `cuadra` no significa nada aquí.
        spr: {
          mezcla: sus.mezcla, orientacion: sus.orientacion, generado: true,
          cuadros: [{ origenX: -sus.ancho / 2, origenY: sus.alto / 2, ancho: sus.ancho, alto: sus.alto }],
        },
        tira, archivo,
      });
    } else if (!existsSync(rutaSpr)) { spritesQueFaltan.add(e.model); spritesLeidos.set(e.model, null); }
    else {
      const spr = leerSpr(rutaSpr);
      if (!spr.cuadra) {
        console.error(`    FALLO: ${e.model} no cuadra: el recorrido acaba en ${spr.fin} de ${spr.bytes} bytes`);
        process.exit(1);
      }
      const tira = tiraDeSpr(spr);
      // La llama también pasa por la rampa: el motor la aplica al fotograma
      // entero, y una antorcha sin rampa sobre un mundo con rampa se ve apagada.
      for (let i = 0; i < tira.rgba.length; i += 4) {
        tira.rgba[i] = RAMPA_TEX[tira.rgba[i]];
        tira.rgba[i + 1] = RAMPA_TEX[tira.rgba[i + 1]];
        tira.rgba[i + 2] = RAMPA_TEX[tira.rgba[i + 2]];
      }
      const archivo = `spr/${e.model.replace(/^.*[\\/]/, "").replace(/\.spr$/i, "")}.png`;
      escribirPng(`${SALIDA}/${archivo}`, tira.rgba, tira.ancho, tira.alto);
      spritesLeidos.set(e.model, { spr, tira, archivo });
    }
  }
  const s = spritesLeidos.get(e.model);
  if (!s) continue;
  const escala = Number(e.scale ?? 1) || 1;
  const r = rectanguloDeCuadro(s.spr.cuadros[0], escala);
  const o = origen(e);
  carteles.push({
    modelo: e.model,
    // El centro del rectángulo, no el `origin`: el cuadro trae su propio origen y
    // darlo por centrado pone la llama medio metro al lado de su palo.
    escena: aEscena([o[0] + r.centroX, o[1], o[2] + r.centroY]),
    // En metros, ya convertido: el navegador no vuelve a dividir por 39,37.
    ancho: r.ancho / U,
    alto: r.alto / U,
    cuadros: s.tira.cuadros,
    porSegundo: Number(e.framerate ?? 10) || 10,
    mezcla: s.spr.mezcla,
    orientacion: s.spr.orientacion,
    // `renderamt` es la opacidad en 0..255 y `rendercolor` el tinte. En los
    // aditivos el tinte suele venir a "0 0 0", que NO significa negro: significa
    // «sin tinte», y multiplicar por él apaga la llama entera.
    opacidad: Math.min(1, (Number(e.renderamt ?? 255) || 255) / 255),
    // `rendercolor`, con la trampa de siempre: "0 0 0" NO es negro, es «sin
    // tinte». Las 57 antorchas vienen así y las 23 `env_glow` vienen a
    // "255 255 128", que es el blanco de vela del mapa entero. Aplicarle el negro
    // a una antorcha la apaga; no aplicarle el suyo a un halo lo deja blanco de
    // quirófano en un mapa que no tiene un solo blanco frío.
    tinte: (() => {
      const c = String(e.rendercolor ?? "0 0 0").trim().split(/\s+/).map(Number);
      if (c.length !== 3 || c.some((v) => !Number.isFinite(v)) || c.every((v) => v === 0)) return null;
      // Por la rampa también: el tinte multiplica una textura que ya la lleva.
      return c.map((v) => RAMPA_TEX[Math.max(0, Math.min(255, Math.round(v)))] / 255);
    })(),
  });
}
const porSprite = new Map();
for (const c of carteles) porSprite.set(c.modelo, (porSprite.get(c.modelo) ?? 0) + 1);
console.log(`  carteles        ${carteles.length} colocados de ${porSprite.size} ficheros .spr leídos`);
for (const [m, n] of [...porSprite].sort((a, b) => b[1] - a[1])) {
  const s = spritesLeidos.get(m);
  console.log(`    ${String(n).padStart(3)}x  ${m.padEnd(22)} ${s.tira.anchoCuadro}×${s.tira.altoCuadro}, ` +
    `${s.tira.cuadros} cuadros, ${s.spr.mezcla}, ${s.spr.orientacion}`);
}
for (const [m, porque] of spritesSustituidos) {
  console.log(`    GENERADO      ${m.padEnd(22)} ${porque}`);
}
if (spritesQueFaltan.size) {
  console.log(`    FALTAN        ${[...spritesQueFaltan].join(", ")} — no están en ${RAIZ_ASSETS}`);
}

// --- EL 82: EL SPRITE DE UN `env_beam`, QUE ES DE HALF-LIFE ------------------
//
// El haz no se pinta con un modelo sino con un `.spr` estirado entre sus dos
// puntas, y el nombre lo trae la clave `texture` y no `model`: por eso el bucle
// de arriba, que mira `env_sprite`/`env_glow`, no lo veía.
//
// **Y AQUÍ VUELVE EL AVISO DE LAS DOS BUILDS, por segunda vez en el mismo
// experimento.** Las dos columnas de humo de Edana piden `sprites/smoke.spr`, y
// en `assets/msr/sprites/` **no está**: hay un `bigsmoke.spr`, que es otro. La
// conclusión fácil —«el mod no trae el sprite del humo»— es la equivocada:
// `smoke.spr` es de Half-Life y vive en `valve/sprites/`, que el motor monta
// detrás siempre. Medido aquí: 32×64, **5 cuadros y mezcla ADITIVA**, que es
// exactamente lo que hace falta para una columna de humo.
//
// Así que se busca en los dos sitios y en el orden de GoldSrc —primero el mod,
// después `valve/`—, igual que `traer()` en `tools/sonido.mjs` y que el bloque
// de `tools/efectos.mjs`. Y si no está, se dice CUÁL falta y DE DÓNDE sale, no
// un «falta un sprite»: lo que distingue un hueco del puerto de un fichero que
// esta instalación no trae es poder leer la frase.
const HL_PEDIDA = process.env.HALFLIFE;
const HL_CANDIDATOS = HL_PEDIDA === "none" ? []
  : HL_PEDIDA ? [HL_PEDIDA]
  : ["C:/Juegos/Steam/steamapps/common/Half-Life",
     "C:/Program Files (x86)/Steam/steamapps/common/Half-Life"];
const VALVE_SPR = HL_CANDIDATOS.map((d) => `${d}/valve/`).find((d) => existsSync(`${d}sprites`)) ?? null;

const spritesDeHaz = new Map();
for (const h of haces) {
  if (!h.sprite) continue;
  if (!spritesDeHaz.has(h.sprite)) {
    const enMod = RAIZ_ASSETS + h.sprite;
    const enValve = VALVE_SPR ? VALVE_SPR + h.sprite : null;
    const ruta = existsSync(enMod) ? enMod : (enValve && existsSync(enValve) ? enValve : null);
    if (!ruta) {
      spritesDeHaz.set(h.sprite, null);
      console.log(`    HAZ SIN SPRITE ${h.sprite}: no está en ${RAIZ_ASSETS}sprites/ ni en valve/sprites/`);
      console.log(`                  es de Half-Life. Para traerlo: HALFLIFE=<raíz> npm run mapa`);
    } else {
      const spr = leerSpr(ruta);
      if (!spr.cuadra) {
        console.error(`    FALLO: ${h.sprite} no cuadra: acaba en ${spr.fin} de ${spr.bytes} bytes`);
        process.exit(1);
      }
      const tira = tiraDeSpr(spr);
      // Por la rampa de textura, como los carteles: el `.spr` trae su paleta en
      // el espacio del motor y saltarse la rampa deja el humo gris plano.
      for (let i = 0; i < tira.rgba.length; i += 4) {
        tira.rgba[i] = RAMPA_TEX[tira.rgba[i]];
        tira.rgba[i + 1] = RAMPA_TEX[tira.rgba[i + 1]];
        tira.rgba[i + 2] = RAMPA_TEX[tira.rgba[i + 2]];
      }
      const archivo = `spr/${h.sprite.replace(/^.*[\\/]/, "").replace(/\.spr$/i, "")}.png`;
      escribirPng(`${SALIDA}/${archivo}`, tira.rgba, tira.ancho, tira.alto);
      spritesDeHaz.set(h.sprite, {
        archivo, cuadros: tira.cuadros,
        anchoCuadro: tira.anchoCuadro, altoCuadro: tira.altoCuadro,
        mezcla: spr.mezcla, deValve: ruta === enValve,
      });
    }
  }
  h.textura = spritesDeHaz.get(h.sprite);
}
if (haces.length) {
  for (const [n, s] of spritesDeHaz) {
    console.log(`    haz           ${n.padEnd(22)} ${s ? `${s.anchoCuadro}×${s.altoCuadro}, ${s.cuadros} cuadros, ${s.mezcla}${s.deValve ? " — DE HALF-LIFE (valve/)" : ""}` : "NO ESTÁ"}`);
  }
}

// --- LOS ADORNOS: los 101 `env_model` ----------------------------------------
//
// Apuntan a 17 ficheros `.mdl` que NO están dentro del `.bsp` pero SÍ al lado, en
// `../MSC/assets/msr/models/`. Misma regla que con el mapa: se escribe el lector
// —`src/bsp/mdl.js`—, lo extraído va a `build/`, no se copia un byte a `public/`.
//
// Cada adorno se lleva entero a mundo AQUÍ y no en el navegador: el vértice pasa
// por su hueso, por la rotación y la escala de la entidad y por su origen, todo en
// espacio de GoldSrc, y sólo al final cambia de ejes. Así el navegador recibe una
// malla ya puesta y hay UN sitio donde el 39,37 puede volverse 32, no 101.
//
// La luz de cada uno sale de `luzEnSuelo()`: el motor no le da mapa de luz a un
// modelo, le da **el luxel del suelo que tiene debajo**. Ver el comentario en
// `src/bsp/luz.js`.
const adornos = { modelos: [], sprites: [] };
for (const e of entidades) {
  if (e.classname === "env_model" && e.model) adornos.modelos.push(e.model);
  if (e.classname === "env_sprite" && e.model) adornos.sprites.push(e.model);
}

const RAIZ_MODELOS = RUTA.replace(/maps[\\/][^\\/]+$/, "");
const mdlLeidos = new Map();
const mdlQueFaltan = new Set();
/**
 * La caja sólida de un `env_model`, o `null` si no choca.
 *
 * `mins`/`maxs` van en unidades y RELATIVOS al origen de la entidad, que es lo
 * que hace `UTIL_SetSize`. Se devuelven ya en escena y ya sumados al origen,
 * porque quien los use no tiene por qué saber ninguna de las dos cosas.
 */
function solidoDeAdorno(e) {
  if (!Number(e.dmg || 0)) return null;
  const tres = (v) => String(v ?? "").trim().split(/\s+/).map(Number);
  const mn = tres(e.mins), mx = tres(e.maxs);
  if (mn.length !== 3 || mx.length !== 3 || [...mn, ...mx].some((x) => !Number.isFinite(x))) return null;
  const o = origen(e) ?? [0, 0, 0];
  const a = aEscena([o[0] + mn[0], o[1] + mn[1], o[2] + mn[2]]);
  const b = aEscena([o[0] + mx[0], o[1] + mx[1], o[2] + mx[2]]);
  return {
    min: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])],
    max: [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])],
  };
}

const colocaciones = [];
// Los que SE MUEVEN salen de la malla fundida y van por el camino de los
// bichos, con esqueleto y `AnimationMixer`. Ver `recorridoDeModelo()`: son 3
// modelos de 17 y 10 colocaciones de 101, y ninguno se mueve más de 8 cm.
const vivos = [];
const recorridos = new Map();
const adornosPosados = new Map();
const carasDelMundo = caras.filter((c) => c.modelo === 0);
for (const e of entidades) {
  if (e.classname !== "env_model" || !e.model || !origen(e)) continue;
  if (!mdlLeidos.has(e.model)) {
    const ruta = RAIZ_MODELOS + e.model;
    if (!existsSync(ruta)) { mdlQueFaltan.add(e.model); mdlLeidos.set(e.model, null); }
    else {
      const m = leerMdl(ruta);
      if (!m.cuadra) {
        console.error(`    FALLO: ${e.model} dice medir ${m.largo} bytes y mide ${m.bytes}`);
        process.exit(1);
      }
      mdlLeidos.set(e.model, { m, tex: texturasDe(m), mallas: new Map() });
    }
  }
  const info = mdlLeidos.get(e.model);
  if (!info) continue;
  if (!recorridos.has(e.model)) {
    const hs = leerHuesos(info.m);
    recorridos.set(e.model, recorridoDeModelo(info.m, hs, verticesCrudos(info.m)));
  }
  const cuerpo = Number(e.body ?? 0) || 0;
  // LA SECUENCIA que pide la entidad, en su primer fotograma.
  //
  // `env_model` declara `sequence` y no siempre es la 0: las 24
  // `p_swords.mdl` piden la 1 y los dos `p_shields.mdl` la 2, que son sus
  // posturas de EXPOSICION —espadas en un perchero, escudos apoyados—.
  // Dibujados en su postura de reposo salían como un amasijo colgando de un
  // poste, y eso pasa por «ese adorno es raro» porque nadie sabe qué forma
  // debería tener.
  //
  // Se hornea el fotograma 0 y no se anima: un adorno quieto en su postura
  // buena es correcto; animarlo es el trabajo de los bichos y está al lado, en
  // `src/render/bichos.js`.
  const secuencia = Number(e.sequence ?? 0) || 0;
  const clave = `${cuerpo}#${secuencia}`;
  if (!info.mallas.has(clave)) {
    // Y se posa SIEMPRE, también con `sequence 0`.
    //
    // La postura de REPOSO de un `.mdl` —los `value[]` de cada hueso— **no es**
    // el fotograma 0 de su secuencia 0. En la mayoría se parecen, y por eso
    // pasó: los 101 adornos se veían bien menos unos pocos. `props/Lamp.mdl`
    // era uno de los que no, y en pantalla era un amasijo negro y amarillo
    // encima de un poste que uno mira y no sabe qué debería ser.
    let matrices = null;
    const secs = leerSecuencias(info.m);
    const s = secs[secuencia] ?? secs[0];
    if (s) {
      const hs = leerHuesos(info.m);
      matrices = matricesEnFotograma(clavesDeSecuencia(info.m, s, hs), hs, 0);
      adornosPosados.set(e.model, `${s.nombre} (${secs[secuencia] ? secuencia : 0})`);
    }
    const ml = mallaDe(info.m, info.tex, { cuerpo, matrices });
    if (!ml.cuadra) {
      console.error(`    FALLO: ${e.model} body ${cuerpo}: ${ml.leidos} triángulos leídos de ${ml.esperados} que dice la cabecera`);
      process.exit(1);
    }
    // El bobinado, contra las normales del propio archivo. Ver `mallaDe()`: un
    // modelo al revés no desaparece, sale APOLILLADO, y eso pasa por «el adorno
    // es raro» en cualquier captura.
    if (!ml.bobinadoBien) {
      console.error(`    FALLO: ${e.model}: ${ml.sueltos} de ${ml.contraNormal + ml.aFavor} ` +
        `triángulos giran en contra de su normal y NO son de doble cara ` +
        `(${ml.contraNormal} en contra, ${ml.gemelos} con gemelo)`);
      process.exit(1);
    }
    info.mallas.set(clave, ml);
  }
  const o = origen(e);
  const a = String(e.angles ?? "0 0 0").trim().split(/\s+/).map(Number);
  const escala = Number(e.scale ?? 1) || 1;
  const anda = recorridos.get(e.model);
  if (anda.recorrido > SE_MUEVE) {
    // Uno que se mueve: no entra en la malla fundida. Se anota con lo que
    // `cargarBichos` necesita y se extrae aparte, con su esqueleto.
    vivos.push({
      modelo: e.model, cuerpo, origen: o, yaw: a[1] || 0, escala,
      pitchRoll: Boolean(a[0] || a[2]),
      secuencia: anda.secuencia?.nombre ?? null,
      recorrido: anda.recorrido,
      luz: luzEnSuelo(carasDelMundo, bsp.lumps.luz.datos, o),
    });
    continue;
  }
  colocaciones.push({
    modelo: e.model, cuerpo: clave, origen: o,
    // EL 69: su `targetname`, que hacía falta y no estaba.
    //
    // `env_render` está portado desde el 49 y **seis de los siete de Edana
    // apuntan a un `env_model`**: los cuatro platos de sopa de la taberna
    // (`patronNsoup`) y la manzana del huerto (`apple5`). Los adornos se
    // horneaban sin nombre, o sea 0 de 46, así que `_render` recorría cero
    // entidades y no daba ningún error: daba una regla portada, citada y en
    // verde que no había alcanzado nunca a nadie. Gate City tiene **cero**
    // `env_render`, y por eso no se veía.
    nombre: e.targetname ?? null,
    // El modo de dibujo con el que NACE, que es con el que hay que volver si
    // algo lo enciende: `rendermode 4` y `renderamt 255` es la manzana visible,
    // y el `env_render` la deja en 0.
    render: {
      modo: num(e.rendermode, 0), cantidad: num(e.renderamt, 255),
      fx: num(e.renderfx, 0),
    },
    R: matrizDeAngulos(a[0] || 0, a[1] || 0, a[2] || 0),
    escala,
    luz: luzEnSuelo(carasDelMundo, bsp.lumps.luz.datos, o),
    // SI CHOCA, Y CON QUÉ CAJA. Las dos cosas son de la entidad y ninguna se
    // deduce del modelo:
    //
    //     msmapents.cpp:311   if (pev->dmg) {
    //                           pev->solid = SOLID_SLIDEBOX;
    //                           UTIL_SetSize(pev, vMins, vMaxs);
    //                         }
    //
    // O sea que un `env_model` **sólo es sólido si trae `dmg`**, y entonces su
    // tamaño es el `mins`/`maxs` que escribió el mapeador, no la caja del
    // `.mdl`. En Gate City eso son 79 de 101: los otros 22 —helechos, flores,
    // espadas colgadas— se atraviesan en el juego original también, así que
    // ponerles colisión sería «arreglar» algo que no está roto.
    solido: solidoDeAdorno(e),
  });
}

// El luxel de cada adorno, en el atlas que ya está pintado.
const uvAdornos = reservarAdornos(
  atlasQuieta, pintado.rgba, colocaciones.map((c) => c.luz ?? [0, 0, 0]),
  { tablas: TABLAS }
);
// Y se reescribe el PNG de la quieta, porque los luxeles nuevos van encima de
// los que ya estaban. Los adornos van al atlas QUIETO: su luz sale de un solo
// luxel del suelo (`R_LightPoint`) y hoy no parpadea. Queda dicho.
escribirPng(`${SALIDA}/${quieta.archivos[0]}`, pintado.rgba, atlasQuieta.ancho, atlasQuieta.alto);

// ── LOS ADORNOS QUE SE MUEVEN ────────────────────────────────────────────────
//
// Salen de la malla fundida y van por el camino de los bichos, que ya está
// escrito y probado: `extraerBicho` saca el esqueleto y las pistas, y
// `cargarBichos` monta el `SkinnedMesh`. Aquí sólo hay que escribirles un
// manifiesto con la misma forma.
//
// Y son POCOS a propósito: 10 de 101. Los otros 91 siguen fundidos en una malla
// porque **no se mueven** — catorce de los diecisiete modelos dejan sus
// vértices exactamente donde estaban, aunque tres de ellos declaren secuencias
// de 101, 10 y 7 fotogramas. Una secuencia larga no es movimiento.
if (vivos.length) {
  console.log(`
  adornos vivos   ${vivos.length} colocaciones de ${new Set(vivos.map((v) => v.modelo)).size} modelos que SÍ se mueven`);
  const emitidos = new Map();
  for (const v of vivos) {
    const rel = v.modelo.replace(/^models[\/]/, "").replace(/\.mdl$/i, "");
    const clave = `${nombreArchivo(rel)}${v.cuerpo ? `_b${v.cuerpo}` : ""}`;
    if (!emitidos.has(clave)) {
      const r = extraerBicho(rel, { cuerpo: v.cuerpo, base: `${RAIZ_MODELOS}models`, salida: `${SALIDA}/bichos`, raizSalida: SALIDA, callar: true });
      if (!r) continue;
      emitidos.set(clave, r);
      console.log(`      ${rel.padEnd(34)} ${String(r.triangulos).padStart(5)} tri, ${String(r.huesos).padStart(2)} huesos, ` +
        `secuencias ${r.secuencias.join("/")}, oráculo ${r.oraculo.caben}/${r.oraculo.de}`);
    }
    v.clave = clave;
  }
  // El aviso que no se disimula: `cargarBichos` sólo aplica el YAW y no la
  // escala. Si algún `env_model` vivo trae `pitch`, `roll` o `scale`, aquí sale
  // dicho en vez de salir torcido en pantalla.
  const conEscala = vivos.filter((v) => v.escala !== 1);
  const torcidos = vivos.filter((v) => v.pitchRoll);
  console.log(`      ${conEscala.length} con scale distinto de 1 (se aplica), ` +
    `${torcidos.length} con pitch o roll${torcidos.length ? " — ESTE CAMINO SOLO APLICA EL YAW" : " (o sea ninguno: sólo hace falta el yaw)"}`);
  writeFileSync(`${SALIDA}/adornosvivos.json`, JSON.stringify({
    mapa: bsp.nombre,
    procedencia: `derivado local de ${creditoDe(MAPA)} y de los .mdl de Master Sword Rebirth. No redistribuible.`,
    unidadesPorMetro: UNIDADES_POR_METRO,
    modelos: [...emitidos].map(([clave, r]) => ({ clave, ...r })),
    colocados: vivos.filter((v) => v.clave).map((v) => ({
      clave: v.clave,
      nombre: v.modelo.replace(/^.*[\/]/, "").replace(/\.mdl$/i, ""),
      escena: aEscena(v.origen),
      yaw: v.yaw,
      // Su animación es la única que tienen, y se queda en bucle: un adorno no
      // pasea, no tiene guion y no cambia de estado.
      parado: v.secuencia, andando: null, piel: 0, escala: v.escala,
      luz: v.luz,
      recorrido: v.recorrido,
    })),
  }, null, 1));
}

/**
 * El PNG de una textura de `.mdl`, escrito si no estaba, y su ruta relativa.
 *
 * Se saca aquí porque desde el **76** hay dos caminos que lo necesitan —los
 * adornos fundidos y los que van sueltos— y una textura usada sólo por un
 * adorno con nombre tiene que escribirse igual. Cuando esto estaba dentro del
 * bucle del fundido, un adorno suelto con textura propia habría salido con el
 * material en gris y sin dar error.
 */
function pngDeTextura(modelo, textura) {
  const archivo = `mdl/${nombreArchivo(modelo.replace(/^.*[\\/]/, "").replace(/\.mdl$/i, "") + "_" + textura.nombre.replace(/\.[a-z]+$/i, ""))}.png`;
  if (!existsSync(`${SALIDA}/${archivo}`)) {
    // La rampa de gamma también aquí: un adorno sin ella al lado de una pared con
    // ella se ve como una calcomanía oscura pegada encima. Y la misma excepción
    // que en el mundo: `Image_LoadMDL` manda las texturas con
    // `STUDIO_NF_MASKED` por `LUMP_MASKED`, que NO pasa por `texgammatable`
    // (`engine/common/imagelib/img_wad.c`, línea 192).
    const rgba = Uint8Array.from(textura.rgba);
    if (!textura.recortado) {
      for (let i = 0; i < rgba.length; i += 4) {
        rgba[i] = RAMPA_TEX[rgba[i]];
        rgba[i + 1] = RAMPA_TEX[rgba[i + 1]];
        rgba[i + 2] = RAMPA_TEX[rgba[i + 2]];
      }
    }
    escribirPng(`${SALIDA}/${archivo}`, rgba, textura.ancho, textura.alto);
  }
  return archivo;
}

// Un tramo por textura de modelo, con las colocaciones ya fundidas dentro:
// 101 adornos de 17 ficheros caben en un puñado de `drawcalls` en vez de 101.
//
// ── Y DESDE EL 76, UN ADORNO CON NOMBRE NO SE FUNDE ─────────────────────────
//
// Porque en GoldSrc cada `env_model` es su propia entidad con su propio estado
// de dibujo, y fundirlos es una optimización NUESTRA. El que puede cambiar de
// estado es justo el que no puede ir fundido: esconder uno de los 46 no es
// apagar un nodo, es saber qué trozo de la geometría es suyo.
//
//     if (!R_ModelOpaque(clent->curstate.rendermode) && CL_FxBlend(clent) <= 0)
//             return true;    // invisible          ref/gl/gl_rmain.c:252
//
// `R_ModelOpaque(rm)` es `rm == kRenderNormal` (gl_local.h:87), o sea que un
// adorno con `rendermode 4` —`kRenderTransAlpha`, const.h:693— y `renderamt 0`
// **ni se añade a la lista de dibujo**. Y eso no es un caso de laboratorio: los
// cuatro platos de sopa de la taberna de Edana NACEN así, y su `env_render` los
// pone a 255 cuando se sienta el parroquiano. En la otra dirección, la manzana
// del huerto nace a 255 y el suyo la pone a 0.
//
// Son 9 de 46 en Edana y 0 de 101 en Gate City, que es por donde esto llevaba
// cuatro experimentos sin verse.
const gruposAdorno = new Map();
const nombrados = [];
for (let i = 0; i < colocaciones.length; i++) {
  const c = colocaciones[i];
  const info = mdlLeidos.get(c.modelo);
  const ml = info.mallas.get(c.cuerpo);
  const uv1 = uvAdornos[i];
  // El que tiene `targetname` se lleva sus propios arrays; el resto, al fundido.
  const suyo = c.nombre
    ? { nombre: c.nombre, modelo: c.modelo, cuerpo: c.cuerpo, origen: c.origen,
        escena: aEscena(c.origen), luz: c.luz, render: c.render,
        pos: [], nor: [], uv: [], uvl: [], grupos: [] }
    : null;
  if (suyo) nombrados.push(suyo);
  for (const g of ml.grupos) {
    let d;
    if (suyo) {
      d = suyo;
      suyo.grupos.push({
        // Relativo a SU malla; el desplazamiento al buffer común se suma luego.
        start: suyo.pos.length / 3, count: g.pos.length / 3,
        textura: g.textura.nombre, archivo: pngDeTextura(c.modelo, g.textura),
        recortado: g.textura.recortado, aditivo: g.textura.aditivo, plenaLuz: g.textura.plenaLuz,
      });
    } else {
      const clave = `${c.modelo}#${g.textura.nombre}`;
      if (!gruposAdorno.has(clave)) {
        gruposAdorno.set(clave, {
          clave, modelo: c.modelo, textura: g.textura,
          pos: [], nor: [], uv: [], uvl: [],
        });
      }
      d = gruposAdorno.get(clave);
    }
    for (let k = 0; k < g.pos.length; k += 3) {
      // hueso -> modelo ya está hecho; aquí van escala, rotación y origen, todo
      // en unidades de GoldSrc, y el cambio de ejes al final.
      const v = porMatriz(c.R, [g.pos[k] * c.escala, g.pos[k + 1] * c.escala, g.pos[k + 2] * c.escala]);
      const w = aEscena([v[0] + c.origen[0], v[1] + c.origen[1], v[2] + c.origen[2]]);
      d.pos.push(w[0], w[1], w[2]);
      const n = direccionPorMatriz(c.R, [g.nor[k], g.nor[k + 1], g.nor[k + 2]]);
      const nw = vectorAEscena(n);
      d.nor.push(nw[0], nw[1], nw[2]);
      d.uv.push(g.uv[(k / 3) * 2], g.uv[(k / 3) * 2 + 1]);
      d.uvl.push(uv1[0], uv1[1]);
    }
  }
}

// A un solo juego de arrays, con un `group` por material.
const adPos = [], adNor = [], adUv = [], adUvl = [], adGrupos = [];
for (const d of gruposAdorno.values()) {
  const inicio = adPos.length / 3;
  adPos.push(...d.pos); adNor.push(...d.nor); adUv.push(...d.uv); adUvl.push(...d.uvl);
  adGrupos.push({
    start: inicio, count: adPos.length / 3 - inicio,
    modelo: d.modelo, textura: d.textura.nombre, archivo: pngDeTextura(d.modelo, d.textura),
    recortado: d.textura.recortado, aditivo: d.textura.aditivo, plenaLuz: d.textura.plenaLuz,
  });
}
const mallaAdornos = {
  positions: Float32Array.from(adPos),
  normals: Float32Array.from(adNor),
  uvs: Float32Array.from(adUv),
  uvs1: Float32Array.from(adUvl),
  grupos: adGrupos,
};

// Y los nombrados, al MISMO binario y en un solo juego de arrays: cada uno sabe
// dónde empieza lo suyo, y el visor les monta una malla por colocación. Son
// nueve `drawcalls` más en Edana y cero en Gate City.
const nomPos = [], nomNor = [], nomUv = [], nomUvl = [];
for (const s of nombrados) {
  const base = nomPos.length / 3;
  nomPos.push(...s.pos); nomNor.push(...s.nor); nomUv.push(...s.uv); nomUvl.push(...s.uvl);
  for (const g of s.grupos) g.start += base;
  s.vertices = s.pos.length / 3;
  delete s.pos; delete s.nor; delete s.uv; delete s.uvl;
}
const mallaNombrados = {
  positions: Float32Array.from(nomPos),
  normals: Float32Array.from(nomNor),
  uvs: Float32Array.from(nomUv),
  uvs1: Float32Array.from(nomUvl),
};

const conLuz = colocaciones.filter((c) => c.luz).length;
const brillos = colocaciones.filter((c) => c.luz)
  .map((c) => 0.2126 * c.luz[0] + 0.7152 * c.luz[1] + 0.0722 * c.luz[2])
  .sort((a, b) => a - b);
console.log(`\n  adornos         ${colocaciones.length} colocados de ${mdlLeidos.size} ficheros .mdl leídos, ` +
  `${adPos.length / 9} triángulos en ${adGrupos.length} grupos`);
// EL 76: los que van sueltos y en qué estado nacen. Se dice aunque sean cero,
// porque «cero» aquí significa «este mapa no tiene ninguno» y es un dato: Gate
// City no tiene ni un `env_model` con nombre, y por eso esto no se veía.
{
  const apagados = nombrados.filter((s) => !seDibujaAdorno(s.render));
  console.log(`    sueltos       ${nombrados.length} con targetname, ` +
    `${nomPos.length / 9} triángulos (no se funden: pueden cambiar de aspecto)` +
    `${nombrados.length ? `\n                  nacen APAGADOS ${apagados.length}: ${apagados.map((s) => s.nombre).join(", ") || "ninguno"}` : ""}`);
  for (const s of nombrados) {
    console.log(`      ${s.nombre.padEnd(22)} ${s.modelo.replace(/^models[\\/]/, "").padEnd(22)} ` +
      `modo ${s.render?.modo ?? 0} amt ${String(s.render?.cantidad ?? 255).padStart(3)} ` +
      `-> ${seDibujaAdorno(s.render) ? "se dibuja" : "INVISIBLE"}`);
  }
}
for (const [f, info] of mdlLeidos) {
  if (!info) continue;
  const n = colocaciones.filter((c) => c.modelo === f).length;
  const cuerpos = new Set(colocaciones.filter((c) => c.modelo === f).map((c) => c.cuerpo));
  const posado = adornosPosados.get(f);
  const ml = [...info.mallas.values()][0];
  console.log(`    ${String(n).padStart(3)}x  ${f.replace(/^models[\\/]/, "").padEnd(34)} ` +
    `${String(ml.triangulos).padStart(4)} tri, ${info.tex.length} tex, ${info.m.nHuesos} huesos` +
    `${cuerpos.size > 1 ? `, ${cuerpos.size} cuerpos` : ""}` +
    `${posado ? `, posado en '${posado}'` : ""}`);
}
console.log(`    luz           ${conLuz} de ${colocaciones.length} tienen suelo con mapa de luz debajo; ` +
  `brillo del suelo: mediana ${brillos.length ? brillos[brillos.length >> 1].toFixed(0) : "-"}, ` +
  `el más oscuro ${brillos.length ? brillos[0].toFixed(0) : "-"}, el más claro ${brillos.length ? brillos[brillos.length - 1].toFixed(0) : "-"} sobre 255`);
// El control de que la luz de los adornos NO es plana: si todos salen igual, o el
// muestreo está mal o se está leyendo el mismo luxel 101 veces — que es lo que
// pasaría si `luzEnSuelo` devolviera siempre la primera cara.
if (brillos.length > 10 && brillos[brillos.length - 1] - brillos[0] < 16) {
  console.error(`    FALLO: los 101 adornos tienen casi la misma luz. Eso es un muestreo plano, no un mapa.`);
  process.exit(1);
}
if (mdlQueFaltan.size) {
  console.log(`    FALTAN        ${[...mdlQueFaltan].join(", ")}`);
}

// --- 5 bis. LAS TEXTURAS DE DETALLE y EL CIELO, que viven fuera del `.bsp` ---
//
// Las dos cosas son `.tga` sueltos del mod, al lado del mapa, y las dos las lee
// `src/bsp/tga.js`. Misma regla del 02 que todo lo demás: se escribe el lector,
// lo extraído va a `build/` y ni un byte pasa a `public/`.
//
// ── El detalle: qué es y qué NO es ─────────────────────────────────────────
//
// `maps/<mapa>_detail.txt` empareja texturas del mundo con un `.tga` y dos
// escalas. `opengl.cfg` trae `r_detailtextures "1"`, así que el juego las dibuja.
//
// El motor las mezcla en una SEGUNDA pasada sobre la misma geometría
// (`R_RenderDetails`, `ref/gl/gl_rsurf.c`):
//
//     pglBlendFunc( GL_DST_COLOR, GL_SRC_COLOR );   // = 2·src·dst
//     pglDepthFunc( GL_EQUAL );
//
// o sea `base × detalle × 2`. Con el detalle a un gris medio eso deja el píxel
// como estaba: **conserva la media y añade contraste local**, que es justo lo
// que la comparación con la captura del juego echa en falta (contraste local p90
// 13,8 contra 21,8).
//
// Y la UV es la de la TEXTURA multiplicada por las dos escalas del fichero. No
// es una UV nueva: `DrawGLPoly(fa->polys, glt->xscale, glt->yscale)` multiplica
// las que ya hay, y `R_ParseDetailTextures` mete las escalas del `.txt` en el
// `gl_texture_t` de la textura BASE. Por eso aquí no se emite un tercer juego de
// UV: viaja como `repeat` del material.
//
// Al detalle NO se le aplica la rampa de `texgamma`. Es un `.tga`, no un `miptex`
// con paleta, y `Image_SetPalette` —que es quien la aplica— no llega a correr.
const DETALLE = new Map();
{
  const txt = RUTA.replace(/\.bsp$/i, "_detail.txt");
  if (existsSync(txt)) {
    mkdirSync(`${SALIDA}/detail`, { recursive: true });
    const lineas = readFileSync(txt, "latin1").split(/\r?\n/);
    const yaEscrito = new Set();
    let puestas = 0, sinFichero = new Set(), sinTextura = [];
    // El nombre del mundo se compara SIN distinguir mayúsculas: el motor usa
    // `Q_stricmp`, y el fichero trae `C.Web` donde el `.bsp` trae `c.web`.
    const porNombre = new Map(imagenes.map((t) => [t.nombre.toLowerCase(), t]));
    for (const l of lineas) {
      const p = l.trim().split(/\s+/);
      if (p.length < 4 || l.trim().startsWith("//")) continue;
      const [nombre, rel, sx, sy] = p;
      const ex = Number(sx), ey = Number(sy);
      if (!(ex > 0) || !(ey > 0)) continue;
      if (!porNombre.has(nombre.toLowerCase())) { sinTextura.push(nombre); continue; }
      const tga = resolve(dirname(RUTA), "..", "gfx", `${rel}.tga`);
      if (!existsSync(tga)) { sinFichero.add(rel); continue; }
      const archivo = `detail/${nombreArchivo(rel.replace(/^.*[\\/]/, ""))}.png`;
      if (!yaEscrito.has(archivo)) {
        const img = decodificarTga(readFileSync(tga), rel);
        escribirPng(`${SALIDA}/${archivo}`, img.rgba, img.ancho, img.alto);
        yaEscrito.add(archivo);
      }
      DETALLE.set(porNombre.get(nombre.toLowerCase()).nombre, { archivo, escala: [ex, ey] });
      puestas++;
    }
    console.log(`\n  detalle         ${puestas} de ${lineas.filter((l) => l.trim()).length} líneas de ` +
      `${txt.replace(/^.*[\\/]/, "")} emparejadas con una textura del mundo, ` +
      `${yaEscrito.size} .tga leídos`);
    if (sinTextura.length) console.log(`    sin textura   ${sinTextura.length} nombres que este mapa no usa: ${sinTextura.slice(0, 6).join(", ")}${sinTextura.length > 6 ? "…" : ""}`);
    if (sinFichero.size) console.log(`    FALTAN        ${[...sinFichero].join(", ")}`);
    // El control: si no se empareja NINGUNA, el detalle no se dibuja y el mapa se
    // ve exactamente igual, sin que nada falle.
    if (puestas === 0) {
      console.error(`    FALLO: ni una línea del fichero de detalle casa con una textura del mapa.`);
      process.exit(1);
    }
  } else {
    console.log(`\n  detalle         no hay ${txt.replace(/^.*[\\/]/, "")} al lado del mapa`);
  }
}

// El CIELO: seis `.tga` de `gfx/env/`, en el orden que nombra GoldSrc.
let cieloCaras = null;
if (mundoSpawn.skyname) {
  const dir = resolve(dirname(RUTA), "..", "gfx", "env");
  const caras = {};
  let faltan = [];
  for (const c of CARAS_DE_CIELO) {
    // GoldSrc los busca sin distinguir mayúsculas y con `.tga` o `.bmp`. Aquí
    // sólo `.tga`, que es lo que trae este mod, y se dice si falta alguno.
    const ruta = [`${mundoSpawn.skyname}${c}.tga`, `${mundoSpawn.skyname}${c}.TGA`]
      .map((n) => resolve(dir, n)).find(existsSync);
    if (!ruta) { faltan.push(c); continue; }
    const img = decodificarTga(readFileSync(ruta), `${mundoSpawn.skyname}${c}`);
    const archivo = `env/${nombreArchivo(mundoSpawn.skyname + c)}.png`;
    mkdirSync(`${SALIDA}/env`, { recursive: true });
    escribirPng(`${SALIDA}/${archivo}`, img.rgba, img.ancho, img.alto);
    caras[c] = { archivo, ancho: img.ancho, alto: img.alto };
  }
  if (faltan.length) {
    console.log(`  cielo           faltan ${faltan.join(", ")} de ${mundoSpawn.skyname}: se dibuja plano`);
  } else {
    cieloCaras = caras;
    console.log(`  cielo           ${mundoSpawn.skyname}: las 6 caras leídas de gfx/env/ ` +
      `(${caras.up.ancho}×${caras.up.alto}), en vez del color plano de light_environment`);
  }
}

// --- 6. a disco --------------------------------------------------------------
const tramos = {};
let off = 0;
const partes = [
  ["positions", malla.positions], ["normals", malla.normals],
  ["uvs", malla.uvs], ["uvs1", malla.uvs1], ["indices", malla.indices],
  ["choquePositions", choque.positions], ["choqueIndices", choque.indices],
  ["adornoPositions", mallaAdornos.positions], ["adornoNormals", mallaAdornos.normals],
  ["adornoUvs", mallaAdornos.uvs], ["adornoUvs1", mallaAdornos.uvs1],
  // Los adornos CON NOMBRE (el 76), que no van fundidos. Mismo binario.
  ["adornoNomPositions", mallaNombrados.positions], ["adornoNomNormals", mallaNombrados.normals],
  ["adornoNomUvs", mallaNombrados.uvs], ["adornoNomUvs1", mallaNombrados.uvs1],
  // Cada puerta, su malla de dibujo y su malla de choque. Van en el mismo
  // binario que todo lo demás y no en nueve ficheros: son 4 KB entre las nueve.
  ...puertas.flatMap((p, k) => [
    [`${p.tramo}Positions`, mallasDePuerta[k].dibujo.positions],
    [`${p.tramo}Normals`, mallasDePuerta[k].dibujo.normals],
    [`${p.tramo}Uvs`, mallasDePuerta[k].dibujo.uvs],
    [`${p.tramo}Uvs1`, mallasDePuerta[k].dibujo.uvs1],
    [`${p.tramo}Indices`, mallasDePuerta[k].dibujo.indices],
    [`${p.tramo}ChoquePositions`, mallasDePuerta[k].choque.positions],
    [`${p.tramo}ChoqueIndices`, mallasDePuerta[k].choque.indices],
  ]),
  // Y cada deslizante (el 70), igual. Mismo binario y mismos siete tramos.
  ...correderas.flatMap((p, k) => [
    [`${p.tramo}Positions`, mallasDeCorredera[k].dibujo.positions],
    [`${p.tramo}Normals`, mallasDeCorredera[k].dibujo.normals],
    [`${p.tramo}Uvs`, mallasDeCorredera[k].dibujo.uvs],
    [`${p.tramo}Uvs1`, mallasDeCorredera[k].dibujo.uvs1],
    [`${p.tramo}Indices`, mallasDeCorredera[k].dibujo.indices],
    [`${p.tramo}ChoquePositions`, mallasDeCorredera[k].choque.positions],
    [`${p.tramo}ChoqueIndices`, mallasDeCorredera[k].choque.indices],
  ]),
  // Y cada rompible, igual. Mismo binario y mismos siete tramos.
  ...rompibles.flatMap((p, k) => [
    [`${p.tramo}Positions`, mallasDeRompible[k].dibujo.positions],
    [`${p.tramo}Normals`, mallasDeRompible[k].dibujo.normals],
    [`${p.tramo}Uvs`, mallasDeRompible[k].dibujo.uvs],
    [`${p.tramo}Uvs1`, mallasDeRompible[k].dibujo.uvs1],
    [`${p.tramo}Indices`, mallasDeRompible[k].dibujo.indices],
    [`${p.tramo}ChoquePositions`, mallasDeRompible[k].choque.positions],
    [`${p.tramo}ChoqueIndices`, mallasDeRompible[k].choque.indices],
  ]),
];
for (const [nombre, arr] of partes) {
  tramos[nombre] = { off, bytes: arr.byteLength, n: arr.length };
  off += arr.byteLength;
}
const bin = Buffer.alloc(off);
for (const [nombre, arr] of partes) {
  Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).copy(bin, tramos[nombre].off);
}
writeFileSync(`${SALIDA}/malla.bin`, bin);

const cajaMin = [...aEscena(modelos[0].mins)], cajaMax = [...aEscena(modelos[0].maxs)];
const manifiesto = {
  mapa: bsp.nombre,
  procedencia: `derivado local de ${creditoDe(MAPA)}. No redistribuible. Ver PROCEDENCIA.md`,
  unidadesPorMetro: U,
  bin: { archivo: "malla.bin", tramos },
  // Cada grupo se lleva su textura de detalle, si la tiene: el grupo ya es
  // «una textura + un modo de dibujo», que es exactamente la unidad a la que el
  // fichero de detalle asigna su `.tga` y sus dos escalas.
  grupos: malla.groups.map((g) => (DETALLE.has(g.texture) ? { ...g, detalle: DETALLE.get(g.texture) } : g)),
  // LO QUE SE COMPORTA. Las puertas con su bisagra y sus tres números, y los
  // volúmenes que hay que saber si te contienen. Ver la sección 3b.
  interactivas: {
    puertas: puertas.map((p) => ({
      ...p,
      grupos: p.grupos.map((g) => (DETALLE.has(g.texture) ? { ...g, detalle: DETALLE.get(g.texture) } : g)),
    })),
    correderas: correderas.map((p) => ({
      ...p,
      grupos: p.grupos.map((g) => (DETALLE.has(g.texture) ? { ...g, detalle: DETALLE.get(g.texture) } : g)),
    })),
    rompibles: rompibles.map((p) => ({
      ...p,
      grupos: p.grupos.map((g) => (DETALLE.has(g.texture) ? { ...g, detalle: DETALLE.get(g.texture) } : g)),
    })),
    agua, escaleras, dano, zonas, ambiente,
    // El 82. Las tres de Edana: la reverberación, las columnas de humo y el
    // pregonero. Van dentro de `interactivas` y no en `disparadores` porque
    // ninguna de las tres es cableado: son puntos que actúan por cercanía.
    reverberacion, haces, pregoneros,
  },
  // EL CABLEADO. Ver la sección 3c y `src/play/disparadores.js`.
  disparadores,
  // LA VALLA DE LOS MONSTRUOS, que faltaba entera hasta el 39.
  //
  // 101 `func_monsterclip` y ni uno estaba en el mundo, porque el compilador les
  // quita las caras y esta malla se construye de caras. No se dibujan ni en el
  // juego, así que no había nada que ver: había 101 paredes que no existían y
  // bichos paseándose por donde el mapeador les había prohibido pasar. Ver
  // src/bsp/clip.js, que explica también por qué NO entran en `colision`: el
  // jugador las atraviesa (`world.cpp:1196`) y meterlas en la malla de todos lo
  // dejaría tapiado en mitad de la calle.
  monsterclip: monsterclip.brushes.map((b) => ({
    mins: b.mins.map(red5), maxs: b.maxs.map(red5),
    piezas: b.piezas.map((ps) => ps.map((p) => ({ n: p.n.map(red5), dist: red5(p.dist) }))),
  })),
  texturas: imagenes.map((t) => ({
    nombre: t.nombre, archivo: `tex/${nombreArchivo(t.nombre)}.png`,
    ancho: t.ancho, alto: t.alto, clase: t.clase, calada: t.calada,
  })),
  luz: {
    // El atlas de los adornos y de las caras sin mapa de luz es el QUIETO, y es
    // el que lleva los luxeles de servicio.
    archivo: quieta.archivos[0], ancho: atlasQuieta.ancho, alto: atlasQuieta.alto,
    negro: atlasQuieta.negro, blanco: atlasQuieta.blanco,
    gamma: GAMMA, gammaTextura: GAMMA_TEX, brillo: AJ.brightness, overbright: AJ.overbright,
    // Un cubo por conjunto de estilos animados, con una variante por estado del
    // ciclo. El visor no adivina el reloj: `varianteEnT()` de `src/bsp/luz.js`
    // es `CL_RunLightStyles()`, y `estilos` es lo único que necesita de aquí.
    cubos: listaCubos.map((c) => ({
      clave: c.clave, estilos: c.estilos,
      ancho: c.atlas.ancho, alto: c.atlas.alto,
      variantes: c.archivos,
      caras: c.caras.length,
    })),
  },
  adornos: {
    grupos: mallaAdornos.grupos,
    // LOS QUE VAN SUELTOS porque tienen `targetname` (el 76): uno por
    // colocación, con sus grupos ya desplazados al buffer común y con el estado
    // de dibujo de nacimiento. Nueve en Edana, cero en Gate City.
    nombrados,
    // Dónde está cada uno, en ejes de escena. Hace falta para poder encuadrar UNO
    // y no el promedio de veintisiete: el primer intento puso la cámara en el
    // centroide del grupo entero —que abarca 72 metros— y el fotograma salió de
    // un sitio donde no hay nada.
    colocaciones: colocaciones.map((c) => ({
      modelo: c.modelo, cuerpo: c.cuerpo,
      escena: aEscena(c.origen),
      luz: c.luz,
      solido: c.solido ?? null,
      // El 69: su nombre y su modo de dibujo de nacimiento, para que un
      // `env_render` pueda alcanzarlo. Cinco de los 46 de Edana tienen nombre.
      nombre: c.nombre ?? null,
      render: c.render ?? null,
    })),
    colocados: colocaciones.length,
    ficheros: mdlLeidos.size,
    triangulos: mallaAdornos.positions.length / 9,
    faltan: [...mdlQueFaltan],
  },
  triangulos: malla.triangleCount,
  vertices: malla.vertexCount,
  choque: { triangulos: choque.triangleCount },
  // La caja se guarda en ejes de Three.js, ya convertida: el navegador no debe
  // volver a hacer la conversión, que es el sitio donde el 39,37 se vuelve 32.
  caja: {
    min: [Math.min(cajaMin[0], cajaMax[0]), Math.min(cajaMin[1], cajaMax[1]), Math.min(cajaMin[2], cajaMax[2])],
    max: [Math.max(cajaMin[0], cajaMax[0]), Math.max(cajaMin[1], cajaMax[1]), Math.max(cajaMin[2], cajaMax[2])],
  },
  entrada: {
    clase: llegada.clase,
    unidades: entrada,
    escena: aEscena(entrada),
    // Los pies YA en el suelo, medidos con el árbol BSP. El visor no resta
    // ninguna constante: el origin de este punto está 54 unidades por encima del
    // suelo, ni las 18 ni las 24 que dicen las convenciones.
    pies: aEscena(llegada.pies),
    alturaSobreElSuelo: llegada.alturaSobreElSuelo,
    reapariciones: llegada.reapariciones,
  },
  // Sitios donde se puede estar dentro de cada zona segura, para poder ir a ver
  // los interiores sin andar los 40 m de cueva que el mapa pone a propósito.
  pueblos: pueblos.map((p) => ({ ...p, escena: aEscena(p.pies) })),
  cielo: { nombre: mundoSpawn.skyname ?? null, color: colorCielo, m2: m2(malla.cielo), caras: cieloCaras },
  carteles,
  faltanSprites: [...spritesQueFaltan],
  titulo: mundoSpawn.maptitle ?? null,
  luces,
  medidas: {
    caras: caras.length,
    carasDelMundo: modelos[0].caras,
    modelos: modelos.length,
    superficie: m2(areaTotal),
    variedadDelMundo: delMundo,
    variedadDeTodo: deTodo,
    luzBytes: bsp.lumps.luz.len,
    luzLuxels: cuentas.luxels,
    luzCuadra: cuentas.cuadra,
    histograma: hist,
    adornos: {
      modelos: adornos.modelos.length, mdl: new Set(adornos.modelos).size,
      sprites: adornos.sprites.length, spr: new Set(adornos.sprites).size,
    },
  },
};
writeFileSync(`${SALIDA}/malla.json`, JSON.stringify(manifiesto, null, 1));
writeFileSync(`${SALIDA}/PROCEDENCIA.md`, PROCEDENCIA(bsp, RUTA));

console.log(`\n  escrito en build/${MAPA}/`);
console.log(`    malla.bin     ${(bin.length / 1048576).toFixed(2)} MB`);
console.log(`    luz/*.png     ${(bytesLuzTotal / 1024).toFixed(0)} KB en ${listaCubos.reduce((s, c) => s + c.variantes.length, 0)} atlas (los estados del parpadeo)`);
console.log(`    tex/          ${imagenes.length} PNG, ${(bytesTex / 1024).toFixed(0)} KB`);
console.log(`\n  y a mirarlo:  npm run dev  ->  ?map=${MAPA}\n`);

// --- utilidades --------------------------------------------------------------

/** Un nombre de textura como nombre de archivo. `{grate1b` y `!waterblue` no lo son. */
function nombreArchivo(n) {
  return n.replace(/[^A-Za-z0-9_.-]/g, (c) => ({ "{": "_llave_", "!": "_agua_", "~": "_luz_", "+": "_anim_" }[c] ?? "_"));
}

/** Un argumento de la forma `--clave valor`. */
function arg(clave) {
  const i = process.argv.indexOf(clave);
  return i >= 0 ? process.argv[i + 1] : null;
}

/** El centro de una cara, en unidades. */
function centroDeCara(c) {
  const s = c.puntos.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]);
  return s.map((v) => v / c.puntos.length);
}

function mediana(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function barra(f) {
  return " ▁▂▃▄▅▆▇█"[Math.min(8, Math.round(f * 8))];
}

function PROCEDENCIA(bsp, ruta) {
  return `# Procedencia — NO REDISTRIBUIR

Todo lo que hay en esta carpeta está **derivado de \`${bsp.nombre}.bsp\`, obra de
DrKill**, leído de \`${ruta}\`, y de los \`.spr\` y \`.mdl\` que ese mapa coloca,
leídos de \`../MSC/assets/msr/\`. Los 17 \`.mdl\` son obra de sus respectivos
autores, a los que el propio fichero nombra en su ruta interna de compilación.

Desde el experimento 06 hay además dos familias de \`.tga\`, también del mod y
también leídas de \`../MSC/assets/msr/gfx/\`:

- \`detail/*.png\` — las texturas de DETALLE que \`maps/${MAPA}_detail.txt\`
  empareja con 58 de las 80 texturas del mundo.
- \`env/nature1*.png\` — las seis caras del cielo que declara \`skyname\`.

- El \`.bsp\` original **no se ha copiado** a este proyecto. Sigue donde estaba.
- Estos archivos son **artefactos locales** de \`build/\`, que está en
  \`.gitignore\`: no entran en el repositorio y no se publican.
- Nada de esto pasa a \`public/\`.
- Lo que este proyecto puede usar de aquí es **la capacidad** —emitir malla con
  varias texturas, hornear luz, subdividir caras—, no el contenido.

Lo nuestro es el lector: \`src/bsp/*.js\` y \`tools/gatecity.mjs\`. Vale para
cualquier \`.bsp\` de GoldSrc y no contiene nada de este mapa.

## Lo GENERADO, que no viene de ningún archivo

Un archivo de esta carpeta no está derivado de nada y es nuestro:

- \`spr/glow01.png\` — el halo de las lámparas. Las 23 entidades \`env_glow\` del
  mapa piden \`sprites/glow01.spr\`, que **no está en \`../MSC/\`**: es un fichero
  del Half-Life base y el mod lo hereda de la instalación del juego. Así que no
  hay nada que leer, y lo que hay es un degradado radial calculado en
  \`src/bsp/halo.js\` — doce líneas de aritmética, sin un byte de nadie.

  No reproduce el dibujo del sprite de Valve. Reproduce su PAPEL.

  El cielo \`nature1\` ya NO está en este apartado: sus seis \`.tga\` sí estaban,
  en \`gfx/env/\`, y desde el 06 se leen. Lo que valía para el halo —«se genera y
  se dice»— sólo vale para lo que de verdad no está, y esto estaba.

Regla del experimento 02: **ningún asset entra sin licencia al lado.** Aquí se
resuelve escribiendo el lector y no copiando el contenido.

Generado por \`node tools/gatecity.mjs\`.
`;
}
