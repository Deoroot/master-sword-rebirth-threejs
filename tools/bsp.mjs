// Lee y mide un .bsp de GoldSrc (Half-Life 1, versión 30) sin cargador.
//
//   node tools/bsp.mjs <ruta.bsp>
//   node tools/bsp.mjs <ruta.bsp> --entidades     el censo de entidades
//   node tools/bsp.mjs <ruta.bsp> --zonas         dónde está el pueblo y los bichos
//   node tools/bsp.mjs <ruta.bsp> --texturas      las texturas, por superficie
//
// Es la misma idea que `tools/kit.mjs` hace con los `.glb`: abrir el binario y
// sacar cifras, sin motor, sin navegador y sin importador de por medio. Un
// importador ya es una interpretación; aquí interesa el dato.
//
// ── Para qué sirve medir un mapa ajeno ───────────────────────────────────────
//
// No para copiarlo. Un `.bsp` de un juego es obra de alguien, y este proyecto
// tiene una regla escrita desde el experimento 02: **ningún asset entra sin
// archivo de licencia al lado**. Sacarle la geometría y las texturas a un mapa
// comercial rompería esa regla, y además sería lo menos útil: lo que hace que un
// pueblo subterráneo se lea bien no es su malla, son sus PROPORCIONES.
//
// Lo transferible son los números, y los números no se inventan, se miden:
// cuánto mide de alto un techo, cuánto de ancho un callejón, cuántos metros hay
// entre farol y farol, qué fracción del mapa es calle y qué fracción es
// interior, cuántas salidas tiene cada plaza. Eso se saca de aquí y se usa para
// construir lo nuestro con el kit CC0, que es lo que ya sabemos hacer.
//
// ── El formato, en corto ─────────────────────────────────────────────────────
//
// Cabecera de 124 bytes: un entero de versión (30) y quince pares
// (desplazamiento, longitud), uno por «lump». Sin magia ASCII, así que la
// primera comprobación es que la versión valga 30 y que el lump de planos
// empiece justo donde acaba la cabecera.

import { readFileSync } from "node:fs";
import { basename } from "node:path";

/** Los quince lumps de GoldSrc, en su orden. */
export const LUMPS = [
  "entidades", "planos", "texturas", "vertices", "visibilidad", "nodos",
  "texinfo", "caras", "luz", "clipnodes", "hojas", "marksurfaces",
  "aristas", "surfedges", "modelos",
];

/**
 * Unidades por metro en GoldSrc.
 *
 * NO son las 32 de Quake que usa todo este proyecto. Half-Life mide en PULGADAS:
 * el jugador de pie ocupa 72 unidades y mide seis pies, o sea que la unidad es
 * una pulgada justa y el metro son 39,37. Dar por supuestas las 32 de Quake
 * encoge el mapa un 19 % y no falla nada: sale un pueblo plausible con los
 * techos un palmo más bajos y los callejones un palmo más estrechos, que es
 * justo el tipo de error que no se ve y estropea la referencia entera.
 *
 * Se comprueba contra el propio mapa más abajo, con la altura de las puertas.
 */
export const UNIDADES_POR_METRO = 39.37;

export function leerBsp(ruta) {
  const b = readFileSync(ruta);
  if (b.length < 124) throw new Error(`${ruta}: demasiado corto para ser un .bsp`);
  const version = b.readInt32LE(0);
  if (version !== 30) {
    throw new Error(
      `${ruta}: versión ${version}. Esto lee GoldSrc (30). Quake 1 es 29 y Quake 3 ` +
        `empieza por el ASCII 'IBSP', que son formatos distintos con otros lumps.`
    );
  }
  const lumps = {};
  LUMPS.forEach((nombre, i) => {
    const off = b.readInt32LE(4 + i * 8);
    const len = b.readInt32LE(4 + i * 8 + 4);
    if (off < 0 || len < 0 || off + len > b.length) {
      throw new Error(`${ruta}: el lump '${nombre}' se sale del archivo`);
    }
    lumps[nombre] = { off, len, datos: b.subarray(off, off + len) };
  });
  return { buf: b, version, lumps, bytes: b.length, nombre: basename(ruta, ".bsp") };
}

// --- entidades ---------------------------------------------------------------

/**
 * El lump de entidades es TEXTO: bloques `{ "clave" "valor" ... }`.
 *
 * Es la parte más rica de un `.bsp` para analizar diseño, y la única que se lee
 * sin descifrar nada: ahí están las luces con su brillo, las puertas con su
 * velocidad, los monstruos, los sonidos de ambiente y los puntos de aparición.
 */
export function leerEntidades(bsp) {
  const texto = bsp.lumps.entidades.datos.toString("latin1");
  const out = [];
  const re = /\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(texto))) {
    const props = {};
    const par = /"([^"]*)"\s*"([^"]*)"/g;
    let p;
    while ((p = par.exec(m[1]))) props[p[1]] = p[2];
    if (Object.keys(props).length) out.push(props);
  }
  return out;
}

/** Un `origin` de entidad, en unidades. */
export function origen(e) {
  if (!e.origin) return null;
  const v = e.origin.trim().split(/\s+/).map(Number);
  return v.length === 3 && v.every(Number.isFinite) ? v : null;
}

// --- geometría ---------------------------------------------------------------

/** Los modelos: el 0 es el mundo; los demás, las entidades con brushes. */
export function leerModelos(bsp) {
  const d = bsp.lumps.modelos.datos;
  const out = [];
  for (let i = 0; i + 64 <= d.length; i += 64) {
    out.push({
      mins: [d.readFloatLE(i), d.readFloatLE(i + 4), d.readFloatLE(i + 8)],
      maxs: [d.readFloatLE(i + 12), d.readFloatLE(i + 16), d.readFloatLE(i + 20)],
      primeraCara: d.readInt32LE(i + 56),
      caras: d.readInt32LE(i + 60),
    });
  }
  return out;
}

/** Los nombres de las texturas, y si vienen incrustadas o se piden a un .wad. */
export function leerTexturas(bsp) {
  const d = bsp.lumps.texturas.datos;
  if (d.length < 4) return [];
  const n = d.readUInt32LE(0);
  const out = [];
  for (let i = 0; i < n; i++) {
    const off = d.readInt32LE(4 + i * 4);
    if (off < 0 || off + 40 > d.length) { out.push(null); continue; }
    const nombre = d.subarray(off, off + 16).toString("latin1").replace(/\0.*$/, "");
    out.push({
      nombre,
      ancho: d.readUInt32LE(off + 16),
      alto: d.readUInt32LE(off + 20),
      // Si el primer mip vale 0, el mapa no lleva los píxeles: los pide a un
      // .wad externo. Saberlo importa porque decide si el mapa se puede mirar
      // con lo que trae o hace falta el juego entero.
      incrustada: d.readUInt32LE(off + 24) !== 0,
    });
  }
  return out;
}

/**
 * Las caras del mundo, con su plano, su área y su textura.
 *
 * El área se calcula del polígono, que es la única forma de que «cuánto suelo
 * hay» signifique metros cuadrados y no número de caras: una cara de un pasillo
 * y una del suelo de una plaza cuentan lo mismo contándolas, y no se parecen en
 * nada.
 */
export function leerCaras(bsp, modelo) {
  const { planos, vertices, caras, aristas, surfedges, texinfo } = bsp.lumps;
  const vert = (i) => [
    vertices.datos.readFloatLE(i * 12),
    vertices.datos.readFloatLE(i * 12 + 4),
    vertices.datos.readFloatLE(i * 12 + 8),
  ];
  const out = [];
  for (let f = modelo.primeraCara; f < modelo.primeraCara + modelo.caras; f++) {
    const o = f * 20;
    if (o + 20 > caras.len) break;
    const iPlano = caras.datos.readUInt16LE(o);
    const lado = caras.datos.readUInt16LE(o + 2);
    const primera = caras.datos.readInt32LE(o + 4);
    const n = caras.datos.readUInt16LE(o + 8);
    const iTex = caras.datos.readUInt16LE(o + 10);

    let normal = [
      planos.datos.readFloatLE(iPlano * 20),
      planos.datos.readFloatLE(iPlano * 20 + 4),
      planos.datos.readFloatLE(iPlano * 20 + 8),
    ];
    // `side` distinto de cero significa que la cara mira al otro lado del plano.
    // Sin darle la vuelta, la mitad de los suelos cuentan como techos.
    if (lado) normal = normal.map((v) => -v);

    const puntos = [];
    for (let k = 0; k < n; k++) {
      const se = surfedges.datos.readInt32LE((primera + k) * 4);
      const e = Math.abs(se) * 4;
      const a = aristas.datos.readUInt16LE(e);
      const bb = aristas.datos.readUInt16LE(e + 2);
      puntos.push(vert(se >= 0 ? a : bb));
    }
    if (puntos.length < 3) continue;

    // Área del polígono por el módulo de la suma de productos cruzados desde el
    // primer vértice. Vale para cualquier polígono plano y convexo, que es lo
    // que un .bsp garantiza.
    let ax = 0, ay = 0, az = 0;
    for (let k = 1; k + 1 < puntos.length; k++) {
      const u = [
        puntos[k][0] - puntos[0][0], puntos[k][1] - puntos[0][1], puntos[k][2] - puntos[0][2],
      ];
      const v = [
        puntos[k + 1][0] - puntos[0][0], puntos[k + 1][1] - puntos[0][1], puntos[k + 1][2] - puntos[0][2],
      ];
      ax += u[1] * v[2] - u[2] * v[1];
      ay += u[2] * v[0] - u[0] * v[2];
      az += u[0] * v[1] - u[1] * v[0];
    }
    const area = Math.hypot(ax, ay, az) / 2;

    const miptex = iTex * 40 + 32 < texinfo.len ? texinfo.datos.readUInt32LE(iTex * 40 + 32) : -1;
    out.push({ normal, area, miptex, puntos });
  }
  return out;
}

// --- informe -----------------------------------------------------------------

const ruta = process.argv[2];
if (!ruta) {
  console.error("uso: node tools/bsp.mjs <ruta.bsp> [--entidades] [--texturas] [--zonas]");
  process.exit(2);
}

const bsp = leerBsp(ruta);
const U = UNIDADES_POR_METRO;
const modelos = leerModelos(bsp);
const mundo = modelos[0];
const texturas = leerTexturas(bsp);
const entidades = leerEntidades(bsp);
const caras = leerCaras(bsp, mundo);

const tam = mundo.maxs.map((v, i) => (v - mundo.mins[i]) / U);

console.log(`\n${bsp.nombre}.bsp — GoldSrc v${bsp.version}, ${(bsp.bytes / 1048576).toFixed(2)} MB\n`);
console.log("  lump            desplazamiento    bytes");
for (const n of LUMPS) {
  const l = bsp.lumps[n];
  console.log(`  ${n.padEnd(14)} ${String(l.off).padStart(12)} ${String(l.len).padStart(9)}`);
}

console.log(`\n  el mundo`);
console.log(
  `    caja          ${tam.map((v) => v.toFixed(1)).join(" × ")} m ` +
    `(${mundo.maxs.map((v, i) => (v - mundo.mins[i]).toFixed(0)).join(" × ")} unidades)`
);
console.log(`    modelos       ${modelos.length} (1 mundo + ${modelos.length - 1} entidades con brushes)`);
console.log(`    caras         ${caras.length} en el mundo`);
console.log(`    vertices      ${bsp.lumps.vertices.len / 12}`);
console.log(`    planos        ${bsp.lumps.planos.len / 20}`);
console.log(`    hojas         ${bsp.lumps.hojas.len / 28}`);
console.log(`    texturas      ${texturas.length}, ${texturas.filter((t) => t?.incrustada).length} incrustadas`);
console.log(`    mapa de luz   ${(bsp.lumps.luz.len / 1048576).toFixed(2)} MB precalculado`);

// --- suelos, techos y paredes ------------------------------------------------
//
// En GoldSrc el eje vertical es Z, como en Quake. Una cara con la normal hacia
// arriba es suelo; hacia abajo, techo; lo demás, pared.
let suelo = 0, techo = 0, pared = 0;
for (const c of caras) {
  if (c.normal[2] > 0.7) suelo += c.area;
  else if (c.normal[2] < -0.7) techo += c.area;
  else pared += c.area;
}
const m2 = (u) => u / (U * U);
console.log(`\n  superficie (m²)`);
console.log(`    suelo         ${m2(suelo).toFixed(0)}`);
console.log(`    techo         ${m2(techo).toFixed(0)}  (${((techo / suelo) * 100).toFixed(0)} % del suelo: cuánto está cubierto)`);
console.log(`    pared         ${m2(pared).toFixed(0)}`);

// --- el censo de entidades ---------------------------------------------------
const censo = new Map();
for (const e of entidades) {
  const c = e.classname ?? "(sin classname)";
  censo.set(c, (censo.get(c) ?? 0) + 1);
}
const ordenado = [...censo.entries()].sort((a, b) => b[1] - a[1]);
console.log(`\n  entidades       ${entidades.length} en total, ${censo.size} clases distintas`);
for (const [c, n] of ordenado.slice(0, process.argv.includes("--entidades") ? 999 : 12)) {
  console.log(`    ${String(n).padStart(5)}  ${c}`);
}
if (!process.argv.includes("--entidades") && ordenado.length > 12) {
  console.log(`    ...y ${ordenado.length - 12} clases más (--entidades para verlas)`);
}

// --- las luces, que es lo que hace que un sitio bajo tierra se lea -----------
const luces = entidades.filter((e) => /^light/.test(e.classname ?? "") && origen(e));
if (luces.length) {
  const pts = luces.map(origen);
  // Distancia al farol más cercano, por farol: es la medida de «cada cuánto hay
  // una luz», que es lo que decide si un interior se lee o es una cueva.
  const vecinas = pts.map((p, i) => {
    let d = Infinity;
    pts.forEach((q, j) => {
      if (i !== j) d = Math.min(d, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
    });
    return d / U;
  }).sort((a, b) => a - b);
  const mediana = vecinas[Math.floor(vecinas.length / 2)];
  console.log(`\n  luces           ${luces.length}, la más cercana a otra a ${mediana.toFixed(1)} m (mediana)`);
  console.log(`    por m² de suelo  una cada ${(m2(suelo) / luces.length).toFixed(0)} m²`);
}

// --- las zonas: dónde está el pueblo y dónde los bichos ----------------------
//
// Un mapa de Master Sword no es solo geometría: lleva escrito EN LAS ENTIDADES
// dónde se está a salvo (`msarea_town`), dónde aparecen los monstruos
// (`msarea_monsterspawn`), por dónde se entra (`ms_player_spawn`) y por dónde se
// va a otro mapa (`msarea_transition`). Eso es el plano de juego, y es
// exactamente la parte que no se puede adivinar mirando capturas.
//
// Se mide por la misma razón que todo lo demás: lo transferible son las
// proporciones. Cuánto del mapa es seguro, a qué distancia de la entrada está lo
// primero que te pega, y si la dificultad va con la distancia o con la hondura.
if (process.argv.includes("--zonas")) {
  const caja = (e) =>
    /^\*\d+$/.test(e.model ?? "") ? modelos[Number(e.model.slice(1))] : null;
  const centro = (m) => m.mins.map((v, i) => (v + m.maxs[i]) / 2 / U);
  const areaDe = (m) => ((m.maxs[0] - m.mins[0]) / U) * ((m.maxs[1] - m.mins[1]) / U);

  /** Los puntos de una clase, vengan de un `origin` o de la caja de su modelo. */
  const puntos = (clase) =>
    entidades
      .filter((e) => e.classname === clase)
      .map((e) => {
        const m = caja(e);
        if (m) return { p: centro(m), area: areaDe(m) };
        const o = origen(e);
        return o ? { p: o.map((v) => v / U), area: 0 } : null;
      })
      .filter(Boolean);

  const pueblo = puntos("msarea_town");
  const areaPueblo = pueblo.reduce((a, o) => a + o.area, 0);
  const huella = ((mundo.maxs[0] - mundo.mins[0]) / U) * ((mundo.maxs[1] - mundo.mins[1]) / U);
  const entrada = puntos("ms_player_begin")[0] ?? puntos("ms_player_spawn")[0];

  console.log(`\n  zonas de juego`);
  if (pueblo.length) {
    console.log(
      `    zona segura   ${pueblo.length} áreas, ${areaPueblo.toFixed(0)} m² = ` +
        `${((areaPueblo / huella) * 100).toFixed(0)} % de la huella`
    );
  }

  // La dificultad, contra la distancia a la entrada y contra la hondura. Las dos
  // a la vez, porque en un mapa de varias plantas no son lo mismo y el diseño
  // puede estar usando cualquiera de las dos — o ninguna.
  const dist = (p) =>
    entrada ? Math.hypot(p[0] - entrada.p[0], p[1] - entrada.p[1]) : NaN;
  const clases = [...new Set(entidades.map((e) => e.classname))]
    .filter((c) => /^msmonster_|^ms_npc$|^msworlditem_/.test(c ?? ""));
  if (clases.length && entrada) {
    console.log(`\n    clase                  n   cota media   a la entrada (media)`);
    const filas = clases
      .map((c) => {
        const ps = puntos(c);
        if (!ps.length) return null;
        const z = ps.reduce((a, o) => a + o.p[2], 0) / ps.length;
        const d = ps.reduce((a, o) => a + dist(o.p), 0) / ps.length;
        return { c, n: ps.length, z, d };
      })
      .filter(Boolean)
      .sort((a, b) => a.d - b.d);
    for (const f of filas) {
      console.log(
        `    ${f.c.padEnd(22)}${String(f.n).padStart(3)}   ${f.z.toFixed(0).padStart(7)} m   ` +
          `${f.d.toFixed(0).padStart(11)} m`
      );
    }
  }

  const criaderos = [...puntos("msarea_monsterspawn"), ...puntos("ms_monsterspawn")];
  if (criaderos.length) {
    const conCaja = criaderos.filter((o) => o.area > 0);
    console.log(
      `\n    criaderos     ${criaderos.length}` +
        (conCaja.length
          ? `, ${conCaja.length} con caja de ${(conCaja.reduce((a, o) => a + o.area, 0) / conCaja.length).toFixed(0)} m² de media`
          : "")
    );
  }
  const salidas = puntos("msarea_transition");
  if (salidas.length && entrada) {
    console.log(
      `    salidas       ${salidas.length}, a ${salidas.map((o) => dist(o.p).toFixed(0)).join(" y ")} m de la entrada`
    );
  }

  // Cuánto del SUELO cae dentro de la zona segura.
  //
  // Es la proporción transferible, y no es la misma que «el 21 % de la huella»:
  // la huella incluye toda la roca maciza, y lo que hay que repartir en un jharro
  // es el suelo pisable. Se mide sobre las caras de suelo de verdad, no sobre la
  // caja de las áreas.
  // El suelo seguro, que lo necesita también el reparto de luces de más abajo.
  const zonaSuelo = { seguro: 0, total: 0 };
  if (pueblo.length) {
    const cajasT = entidades
      .filter((e) => e.classname === "msarea_town")
      .map(caja)
      .filter(Boolean);
    let seguro = 0, total = 0;
    for (const c of caras) {
      if (c.normal[2] <= 0.7) continue;
      const cx = c.puntos.reduce((a, p) => a + p[0], 0) / c.puntos.length;
      const cy = c.puntos.reduce((a, p) => a + p[1], 0) / c.puntos.length;
      const cz = c.puntos.reduce((a, p) => a + p[2], 0) / c.puntos.length;
      total += c.area;
      if (cajasT.some((m) =>
        cx >= m.mins[0] && cx <= m.maxs[0] && cy >= m.mins[1] && cy <= m.maxs[1] &&
        cz >= m.mins[2] - 64 && cz <= m.maxs[2])) seguro += c.area;
    }
    zonaSuelo.seguro = m2(seguro);
    zonaSuelo.total = m2(total);
    console.log(
      `    del suelo     ${m2(seguro).toFixed(0)} m² de ${m2(total).toFixed(0)} = ` +
        `${((seguro / total) * 100).toFixed(0)} % del suelo pisable está en zona segura`
    );
  }

  // Y a qué distancia se queda un sitio de su luz más cercana. Es la cifra con la
  // que se juzga un reparto de luces: la densidad media puede estar clavada y
  // haber un rincón a veinte metros de la vela más próxima.
  {
    const puntosLuz2 = entidades
      .filter((e) => /^light/.test(e.classname ?? "") && origen(e))
      .map((e) => origen(e));
    const lejos = [];
    for (const c of caras) {
      if (c.normal[2] <= 0.7) continue;
      const cx = c.puntos.reduce((a, p) => a + p[0], 0) / c.puntos.length;
      const cy = c.puntos.reduce((a, p) => a + p[1], 0) / c.puntos.length;
      const cz = c.puntos.reduce((a, p) => a + p[2], 0) / c.puntos.length;
      let mejor = Infinity;
      for (const l of puntosLuz2) {
        const d = Math.hypot(l[0] - cx, l[1] - cy, l[2] - cz);
        if (d < mejor) mejor = d;
      }
      if (Number.isFinite(mejor)) lejos.push(mejor / U);
    }
    lejos.sort((a, b) => a - b);
    const q = (p) => lejos[Math.floor((lejos.length - 1) * p)];
    console.log(
      `\n    del suelo a su luz más cercana: mediana ${q(0.5).toFixed(1)} m · ` +
        `p90 ${q(0.9).toFixed(1)} · la peor ${lejos.at(-1).toFixed(1)} m`
    );
  }

  // Y LA cifra: si la luz es el plano, la densidad no puede ser la misma dentro
  // del pueblo que fuera. Medirlo es lo que impide iluminar un mapa entero con la
  // densidad media y convertir la cueva en un pueblo.
  if (pueblo.length) {
    const cajas = entidades
      .filter((e) => e.classname === "msarea_town")
      .map(caja)
      .filter(Boolean);
    const dentro = (p) =>
      cajas.some(
        (m) =>
          p[0] * U >= m.mins[0] && p[0] * U <= m.maxs[0] &&
          p[1] * U >= m.mins[1] && p[1] * U <= m.maxs[1]
      );
    const puntosLuz = entidades
      .filter((e) => /^light/.test(e.classname ?? "") && origen(e))
      .map((e) => origen(e).map((v) => v / U));
    const n = puntosLuz.filter(dentro).length;
    const fuera = puntosLuz.length - n;
    // Por metro de SUELO, no de huella.
    //
    // Dividir entre la huella es lo que convierte esta medida en un número falso:
    // fuera del pueblo la huella es casi toda roca maciza, así que sale «una cada
    // 510 m²» contra «una cada 73» y parece que la cueva está SIETE veces más
    // oscura. Por suelo pisable —que es lo que hay que iluminar— la diferencia es
    // de 2,4 veces. Un cociente con el denominador equivocado no da error: da una
    // cifra redonda y convincente, y ésta habría triplicado las luces del pueblo
    // y dejado la cueva a oscuras.
    const suelo2 = zonaSuelo.total || 1;
    const sSeguro = zonaSuelo.seguro || 1;
    const sCueva = suelo2 - sSeguro;
    console.log(`\n    luz dentro    ${n} luces, una cada ${(sSeguro / n).toFixed(0)} m² DE SUELO`);
    console.log(`    luz fuera     ${fuera} luces, una cada ${(sCueva / fuera).toFixed(0)} m² de suelo`);
    console.log(
      `    en conjunto   ${puntosLuz.length} luces, una cada ${(suelo2 / puntosLuz.length).toFixed(0)} m² de suelo`
    );
    console.log(
      `    por HUELLA saldría una cada ${(areaPueblo / n).toFixed(0)} dentro y ` +
        `${((huella - areaPueblo) / fuera).toFixed(0)} fuera: ése es el cociente equivocado`
    );
  }
}

// --- la escala, comprobada contra el propio mapa -----------------------------
//
// No se da por buena la conversión: se contrasta. Las puertas de GoldSrc son
// `func_door` y cada una es un modelo con su caja, así que su altura dice cuánto
// mide una puerta en metros. Si sale 2 m, la unidad es la pulgada; si sale 1,6,
// alguien está usando la escala de Quake.
const puertas = entidades
  .filter((e) => /func_door/.test(e.classname ?? "") && /^\*\d+$/.test(e.model ?? ""))
  .map((e) => modelos[Number(e.model.slice(1))])
  .filter(Boolean)
  .map((m) => (m.maxs[2] - m.mins[2]) / U)
  .sort((a, b) => a - b);
if (puertas.length) {
  const mediana = puertas[Math.floor(puertas.length / 2)];
  console.log(`\n  contraste de escala`);
  console.log(
    `    ${puertas.length} func_door, alto mediano ${mediana.toFixed(2)} m ` +
      `(con ${U} unidades/m)`
  );
  console.log(
    `    a 32 u/m -la escala de Quake que usa este proyecto- serían ` +
      `${((mediana * U) / 32).toFixed(2)} m`
  );
}

// --- la altura libre, que es LA cifra de un pueblo bajo tierra ---------------
//
// Un pueblo al aire libre no tiene techo y su escala la marca el ancho de la
// calle. Uno subterráneo la marca el techo: si está bajo, agobia; si está alto,
// deja de ser una cueva y parece una nave industrial. Así que la pregunta que
// hay que hacerle a un mapa como éste es «¿cuánto suele haber entre el suelo y
// lo que tiene encima?», y eso no se contesta mirando, se cuenta.
//
// Se hace por casillas: las caras horizontales se reparten en una rejilla de
// 2 m por su caja en planta, y en cada casilla se empareja cada suelo con el
// techo más bajo que tenga por encima. No es exacto -una cara grande cae en
// muchas casillas- pero la DISTRIBUCIÓN sí lo es, que es lo que se quiere.
{
  const CASILLA = 2 * U;
  const rej = new Map();
  const mete = (c, tipo) => {
    const xs = c.puntos.map((p) => p[0]);
    const ys = c.puntos.map((p) => p[1]);
    const zs = c.puntos.map((p) => p[2]);
    const z = zs.reduce((a, b) => a + b, 0) / zs.length;
    const i0 = Math.floor(Math.min(...xs) / CASILLA), i1 = Math.floor(Math.max(...xs) / CASILLA);
    const j0 = Math.floor(Math.min(...ys) / CASILLA), j1 = Math.floor(Math.max(...ys) / CASILLA);
    // Una cara enorme -el techo de una plaza- tocaría cientos de casillas y
    // ahogaría la cuenta. Se limita, que para una distribución sobra.
    if ((i1 - i0) * (j1 - j0) > 400) return;
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = `${i},${j}`;
        if (!rej.has(k)) rej.set(k, { suelos: [], techos: [] });
        rej.get(k)[tipo].push(z);
      }
    }
  };
  for (const c of caras) {
    if (c.normal[2] > 0.7) mete(c, "suelos");
    else if (c.normal[2] < -0.7) mete(c, "techos");
  }
  const alturas = [];
  for (const { suelos, techos } of rej.values()) {
    for (const s of suelos) {
      let mejor = Infinity;
      for (const t of techos) if (t > s + 0.5 * U && t - s < mejor) mejor = t - s;
      if (Number.isFinite(mejor)) alturas.push(mejor / U);
    }
  }
  alturas.sort((a, b) => a - b);
  const pct = (p) => alturas[Math.floor((alturas.length - 1) * p)];
  if (alturas.length) {
    console.log(`\n  altura libre    ${alturas.length} pares suelo-techo medidos`);
    console.log(
      `    percentiles   p10 ${pct(0.1).toFixed(1)} · p25 ${pct(0.25).toFixed(1)} · ` +
        `mediana ${pct(0.5).toFixed(1)} · p75 ${pct(0.75).toFixed(1)} · p90 ${pct(0.9).toFixed(1)} m`
    );
    const bajo = alturas.filter((a) => a < 3).length / alturas.length;
    const alto = alturas.filter((a) => a > 8).length / alturas.length;
    console.log(
      `    reparto       ${(bajo * 100).toFixed(0)} % por debajo de 3 m (pasillo y casa), ` +
        `${(alto * 100).toFixed(0)} % por encima de 8 m (bóveda de caverna)`
    );
  }

  // Y cuántos NIVELES hay: el histograma de cotas de suelo. Un pueblo bajo
  // tierra que está todo en una planta es un plano; lo que hace bueno a éste,
  // por las capturas, es que se ve el de abajo desde el de arriba.
  const cotas = [];
  for (const c of caras) {
    if (c.normal[2] <= 0.7) continue;
    const z = c.puntos.reduce((a, p) => a + p[2], 0) / c.puntos.length;
    cotas.push({ z: z / U, area: c.area / (U * U) });
  }
  const BANDA = 2;
  const bandas = new Map();
  for (const { z, area } of cotas) {
    const k = Math.round(z / BANDA) * BANDA;
    bandas.set(k, (bandas.get(k) ?? 0) + area);
  }
  const top = [...bandas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    .sort((a, b) => a[0] - b[0]);
  console.log(`\n  plantas         bandas de 2 m con más suelo, de abajo arriba`);
  for (const [z, area] of top) {
    const barra = "#".repeat(Math.max(1, Math.round((area / top[0][1]) * 24)));
    console.log(`    z = ${String(z).padStart(5)} m  ${area.toFixed(0).padStart(5)} m²  ${barra}`);
  }
}

// --- las texturas, por superficie --------------------------------------------
if (process.argv.includes("--texturas")) {
  const porTex = new Map();
  for (const c of caras) {
    if (c.miptex < 0) continue;
    porTex.set(c.miptex, (porTex.get(c.miptex) ?? 0) + c.area);
  }
  const lista = [...porTex.entries()]
    .map(([i, a]) => ({ nombre: texturas[i]?.nombre ?? `#${i}`, m2: m2(a) }))
    .sort((a, b) => b.m2 - a.m2);
  const total = lista.reduce((s, t) => s + t.m2, 0);
  console.log(`\n  texturas por superficie  (${lista.length} usadas de ${texturas.length})`);
  for (const t of lista.slice(0, 25)) {
    console.log(
      `    ${t.nombre.padEnd(20)} ${t.m2.toFixed(0).padStart(7)} m²  ` +
        `${((t.m2 / total) * 100).toFixed(1).padStart(5)} %`
    );
  }
}

console.log();
