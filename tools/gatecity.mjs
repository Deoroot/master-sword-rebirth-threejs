// Extrae `gatecity.bsp` a `build/gatecity/` para poder dibujarlo.
//
//   node tools/gatecity.mjs [ruta.bsp]
//
// ── Dónde va lo que sale, y por qué importa ─────────────────────────────────
//
// **Todo a `build/gatecity/`, que no se publica y está en `.gitignore`.** El
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
import { leerSpr, tiraDeSpr, rectanguloDeCuadro } from "../src/bsp/sprite.js";
import { SUSTITUTOS } from "../src/bsp/halo.js";
import { tablasDeGamma, AJUSTES } from "../src/bsp/gamma.js";
import { decodificarTga, CARAS_DE_CIELO } from "../src/bsp/tga.js";
import { leerMdl, texturasDe, mallaDe, matrizDeAngulos, porMatriz, direccionPorMatriz, verticesCrudos } from "../src/bsp/mdl.js";
import { leerSecuencias, leerHuesos, clavesDeSecuencia, matricesEnFotograma, recorridoDeModelo, SE_MUEVE } from "../src/bsp/mdlanim.js";
import { extraerBicho } from "./bicho.mjs";
import { escribirPng } from "./png.mjs";

// La ruta es el primer argumento que acabe en `.bsp`, no `argv[2]`: con
// `--gamma 3.4` delante, `argv[2]` es «--gamma» y el lector intentaba abrirlo.
const RUTA = process.argv.slice(2).find((a) => a.endsWith(".bsp")) ??
  "../MSC/assets/msr/maps/gatecity.bsp";
const SALIDA = resolve("build/gatecity");
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
const SOLIDAS = new Set(["func_wall", "func_breakable"]);
const MOVIBLES = new Set(["func_door_rotating"]);
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
const dibujables = caras.filter((c) => !MOVIBLES.has(c.clase));
console.log(`  chocan          ${solidas.length} caras: el mundo más ${[...SOLIDAS].join(", ")}`);
console.log(`  aparte          ${caras.length - dibujables.length} caras de ${[...MOVIBLES].join(", ")}, ` +
  `que se mueven: fuera de la malla quieta Y fuera de la colisión, con las suyas`);

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
const cuentas = contabilidad(caras, bsp.lumps.luz.len);
console.log(`\n  mapa de luz     ${(bsp.lumps.luz.len / 1048576).toFixed(2)} MB en el archivo`);
console.log(`    caras con luz ${cuentas.caras}; sin luz ${cuentas.sinLuz} (${cuentas.sinLuzPorMenosUno} con lightofs=-1, ${cuentas.sinLuzPorEstilos} con styles a 255)`);
console.log(`    contabilidad  ${cuentas.bytes} bytes sumados contra ${cuentas.bytesDelLump} del lump ` +
  `-> ${cuentas.cuadra ? "CUADRA EXACTO" : `FALLO: sobran ${cuentas.sobran}, ${cuentas.solapes} solapes, ${cuentas.huecos} huecos`}`);
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

/**
 * LOS PLANOS de un volumen, que es lo que hace falta para preguntar si estás
 * dentro — y no su caja.
 *
 * Aquí me equivoqué primero y lo cazó el control: escribí que los volúmenes de
 * Gate City eran «brushes rectangulares, así que su caja ES el volumen», y el
 * estanque grande **no lo es**. Sus caras tienen normales como (−0,65, −0,76, 0)
 * y (0,51, −0,86, 0): es un contorno irregular de 19,7 × 8,9 m. Preguntar con
 * la envolvente habría dado «estás en el agua» sobre un rectángulo mucho mayor
 * que la charca, o sea nadar en la orilla. Y eso nadie lo achaca a esto.
 *
 * Un brush de GoldSrc es convexo por construcción, así que basta con sus planos:
 * dentro es estar detrás de todos. La distancia sale de cualquier punto de la
 * cara, porque todos están en su plano.
 *
 * Devuelve `null` si el modelo no trae caras —las escaleras y el `trigger_hurt`
 * son invisibles y el compilador se las comió—, y entonces manda la caja, que
 * para un brush sin caras es lo único que hay y lo que el motor usa como casco.
 */
function planosDe(caras, { epsilon = 0.2 } = {}) {
  if (!caras.length) return null;
  const planos = [];
  for (const c of caras) {
    const d = c.normal[0] * c.puntos[0][0] + c.normal[1] * c.puntos[0][1] + c.normal[2] * c.puntos[0][2];
    // Dos caras del mismo plano —el compilador parte las grandes— cuentan una.
    const ya = planos.some((p) =>
      Math.abs(p.n[0] - c.normal[0]) < 1e-4 && Math.abs(p.n[1] - c.normal[1]) < 1e-4 &&
      Math.abs(p.n[2] - c.normal[2]) < 1e-4 && Math.abs(p.d - d) < 1e-2);
    if (!ya) planos.push({ n: [...c.normal], d });
  }
  // CONVEXIDAD, comprobada y no supuesta: todos los vértices detrás de todos
  // los planos. Si fallara, el test de «dentro» recortaría de más y habría
  // trozos de agua que no mojan.
  let peor = 0;
  for (const c of caras) {
    for (const p of c.puntos) {
      for (const q of planos) {
        peor = Math.max(peor, q.n[0] * p[0] + q.n[1] * p[1] + q.n[2] * p[2] - q.d);
      }
    }
  }
  return { planos, convexo: peor <= epsilon, peor };
}

/** Un plano del `.bsp` en coordenadas de escena. */
//
// El cambio de ejes es un giro, así que conserva el producto escalar: la normal
// pasa por `vectorAEscena` y la distancia sólo se divide por las unidades por
// metro. Escalar la normal en vez de la distancia daría un plano desplazado.
const planoAEscena = (p) => ({ n: vectorAEscena(p.n), d: p.d / U });

/** Los volúmenes de una clase, con sus planos y las claves que se le pidan. */
const volumenesDe = (clase, extra = () => ({})) => entidades
  .filter((e) => e.classname === clase && /^\*\d+$/.test(e.model ?? ""))
  .map((e) => {
    const i = Number(e.model.slice(1));
    const o = origen(e);
    const suyas = leerCaras(bsp, modelos[i], texinfos);
    const forma = planosDe(suyas);
    if (forma && !forma.convexo) {
      console.error(`  FALLO: el modelo *${i} de ${clase} no es convexo (${forma.peor.toFixed(1)} u fuera).`);
      process.exit(1);
    }
    // Con `origin` los planos habría que desplazarlos; ninguno de estos lo
    // trae, y si algún día lo trajera esto lo dice en vez de colocarlos mal.
    if (o && forma && (o[0] || o[1] || o[2])) {
      console.error(`  FALLO: ${clase} *${i} tiene origin y planos, y eso no está contemplado.`);
      process.exit(1);
    }
    return {
      modelo: i,
      caja: cajaDeModelo(modelos[i], o),
      // Los planos, o `null` si el modelo es invisible y sólo hay caja.
      planos: forma ? forma.planos.map(planoAEscena) : null,
      ...extra(e),
    };
  });

const agua = volumenesDe("func_water", (e) => ({
  // `skin` es el contenido: −3 es `CONTENTS_WATER`. Se guarda porque −4
  // (`CONTENTS_SLIME`) y −5 (`CONTENTS_LAVA`) hacen daño y el agua no.
  contenido: num(e.skin, -3),
  oleaje: num(e.WaveHeight, 0),
}));
const escaleras = volumenesDe("func_ladder");
const dano = volumenesDe("trigger_hurt", (e) => ({ dano: num(e.dmg, 0) }));

// Las zonas que todavía no hacen nada, emitidas igual: el dato es del mapa.
const zonas = [
  ...volumenesDe("msarea_town", (e) => ({ clase: "msarea_town", nombre: e.targetname ?? null })),
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
  })),
  ...volumenesDe("msarea_transition", (e) => ({
    clase: "msarea_transition", destino: e.destmap ?? null, comoSeLlama: e.destname ?? null })),
  ...volumenesDe("trigger_once", (e) => ({ clase: "trigger_once", dispara: e.target ?? null })),
];

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
function cuantoSobra(v, n = 20000) {
  if (!v.planos) return null;
  let dentro = 0;
  for (let i = 0; i < n; i++) {
    const p = [0, 1, 2].map((k) => v.caja.min[k] + Math.random() * (v.caja.max[k] - v.caja.min[k]));
    if (v.planos.every((q) => q.n[0] * p[0] + q.n[1] * p[1] + q.n[2] * p[2] - q.d <= 0.01)) dentro++;
  }
  return dentro / n;
}
for (const a of agua) {
  const t = a.caja.max.map((v, k) => (v - a.caja.min[k]).toFixed(1)).join(" × ");
  const f = cuantoSobra(a);
  a.llenaLaCaja = f === null ? null : Number(f.toFixed(3));
  console.log(
    `    agua          ${t} m, contenido ${a.contenido}, oleaje ${a.oleaje} · ` +
    `${a.planos.length} planos, llena el ${(f * 100).toFixed(0)} % de su caja`
  );
}
for (const e of escaleras) {
  const t = e.caja.max.map((v, k) => (v - e.caja.min[k]).toFixed(2)).join(" × ");
  console.log(`    escalera      ${t} m · sin caras (invisible), manda la caja`);
}

// EL CONTROL: que usar los planos en vez de la caja cambie algo de verdad.
//
// Si todos los volúmenes llenaran su caja, los planos serían trabajo para nada
// y bastaría la envolvente. El estanque grande dice que no.
{
  const conPlanos = agua.filter((a) => a.planos);
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
const suelosDelMundo = caras
  .filter((c) => c.modelo === 0 && c.normal[2] > 0.7)
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
// El control del árbol, que sin él esto no dice nada: un punto claramente fuera
// del mapa tiene que salir SÓLIDO, y un palmo por encima de una cara de suelo,
// VACÍO. Sale 182 de 200 en lo segundo: las 18 que fallan son caras de suelo que
// miran a un hueco cerrado, y el umbral está puesto donde discrimina.
{
  const fuera = contenidoEn(bsp, [modelos[0].maxs[0] + 500, modelos[0].maxs[1] + 500, modelos[0].maxs[2] + 500]);
  const encima = suelosDelMundo.slice(0, 200)
    .filter((c) => { const t = centroDeCara(c); return sePuedeEstar(bsp, [t[0], t[1], t[2] + 24]); }).length;
  console.log(`  árbol BSP       ${bsp.lumps.nodos.len / 24} nodos, ${bsp.lumps.hojas.len / 28} hojas`);
  console.log(`    control       fuera del mapa -> ${fuera.nombre}; encima de las 200 caras de suelo mayores -> ${encima}/200 vacío`);
  if (fuera.vacio || encima < 150) {
    console.error(`    FALLO: el recorrido del árbol no discrimina.`);
    process.exit(1);
  }
}
console.log(`  pueblos         ${pueblos.length} de 8 con un suelo donde estar; el más cercano a la llegada, a ${alPueblo?.toFixed(0)} m`);
console.log(`                  el mayor: ${pueblos[0].area.toFixed(0)} m² de caja, ${pueblos[0].suelo.toFixed(0)} m² de suelo en ${pueblos[0].suelos} caras`);

// --- los carteles: las antorchas ---------------------------------------------
//
// `env_sprite` apunta a un `.spr` que NO está dentro del `.bsp`, pero SÍ está al
// lado, en `../MSC/assets/msr/sprites/`. Así que se aplica la misma regla que al
// mapa: **se escribe el lector, no se copia el contenido** — el lector vale para
// cualquier `.spr` de GoldSrc y lo extraído va a `build/gatecity/spr/`.
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
      console.error(`    FALLO: ${e.model}: ${ml.contraNormal} de ${ml.contraNormal + ml.aFavor} ` +
        `triángulos (${(ml.contraNormalFrac * 100).toFixed(0)} %) giran en contra de su normal`);
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
      const r = extraerBicho(rel, { cuerpo: v.cuerpo, base: `${RAIZ_MODELOS}models`, salida: `${SALIDA}/bichos`, callar: true });
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
    procedencia: "derivado local de gatecity.bsp y de los .mdl de Master Sword Rebirth. No redistribuible.",
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

// Un tramo por textura de modelo, con TODAS las colocaciones ya fundidas dentro:
// 101 adornos de 17 ficheros caben en un puñado de `drawcalls` en vez de 101.
const gruposAdorno = new Map();
for (let i = 0; i < colocaciones.length; i++) {
  const c = colocaciones[i];
  const info = mdlLeidos.get(c.modelo);
  const ml = info.mallas.get(c.cuerpo);
  const uv1 = uvAdornos[i];
  for (const g of ml.grupos) {
    const clave = `${c.modelo}#${g.textura.nombre}`;
    if (!gruposAdorno.has(clave)) {
      gruposAdorno.set(clave, {
        clave, modelo: c.modelo, textura: g.textura,
        pos: [], nor: [], uv: [], uvl: [],
      });
    }
    const d = gruposAdorno.get(clave);
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
  const archivo = `mdl/${nombreArchivo(d.modelo.replace(/^.*[\\/]/, "").replace(/\.mdl$/i, "") + "_" + d.textura.nombre.replace(/\.[a-z]+$/i, ""))}.png`;
  if (!existsSync(`${SALIDA}/${archivo}`)) {
    // La rampa de gamma también aquí: un adorno sin ella al lado de una pared con
    // ella se ve como una calcomanía oscura pegada encima. Y la misma excepción
    // que en el mundo: `Image_LoadMDL` manda las texturas con
    // `STUDIO_NF_MASKED` por `LUMP_MASKED`, que NO pasa por `texgammatable`
    // (`engine/common/imagelib/img_wad.c`, línea 192).
    const rgba = Uint8Array.from(d.textura.rgba);
    if (!d.textura.recortado) {
      for (let i = 0; i < rgba.length; i += 4) {
        rgba[i] = RAMPA_TEX[rgba[i]];
        rgba[i + 1] = RAMPA_TEX[rgba[i + 1]];
        rgba[i + 2] = RAMPA_TEX[rgba[i + 2]];
      }
    }
    escribirPng(`${SALIDA}/${archivo}`, rgba, d.textura.ancho, d.textura.alto);
  }
  adGrupos.push({
    start: inicio, count: adPos.length / 3 - inicio,
    modelo: d.modelo, textura: d.textura.nombre, archivo,
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

const conLuz = colocaciones.filter((c) => c.luz).length;
const brillos = colocaciones.filter((c) => c.luz)
  .map((c) => 0.2126 * c.luz[0] + 0.7152 * c.luz[1] + 0.0722 * c.luz[2])
  .sort((a, b) => a - b);
console.log(`\n  adornos         ${colocaciones.length} colocados de ${mdlLeidos.size} ficheros .mdl leídos, ` +
  `${adPos.length / 9} triángulos en ${adGrupos.length} grupos`);
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
// `maps/gatecity_detail.txt` empareja texturas del mundo con un `.tga` y dos
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
  procedencia: "derivado local de gatecity.bsp (DrKill). No redistribuible. Ver PROCEDENCIA.md",
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
    agua, escaleras, dano, zonas, ambiente,
  },
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
    // Dónde está cada uno, en ejes de escena. Hace falta para poder encuadrar UNO
    // y no el promedio de veintisiete: el primer intento puso la cámara en el
    // centroide del grupo entero —que abarca 72 metros— y el fotograma salió de
    // un sitio donde no hay nada.
    colocaciones: colocaciones.map((c) => ({
      modelo: c.modelo, cuerpo: c.cuerpo,
      escena: aEscena(c.origen),
      luz: c.luz,
      solido: c.solido ?? null,
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

console.log(`\n  escrito en build/gatecity/`);
console.log(`    malla.bin     ${(bin.length / 1048576).toFixed(2)} MB`);
console.log(`    luz/*.png     ${(bytesLuzTotal / 1024).toFixed(0)} KB en ${listaCubos.reduce((s, c) => s + c.variantes.length, 0)} atlas (los estados del parpadeo)`);
console.log(`    tex/          ${imagenes.length} PNG, ${(bytesTex / 1024).toFixed(0)} KB`);
console.log(`\n  y a mirarlo:  npm run dev  ->  ?map=gatecity\n`);

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

- \`detail/*.png\` — las 14 texturas de DETALLE que \`maps/gatecity_detail.txt\`
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
