// Lector de `.bsp` de GoldSrc (Half-Life 1, versión 30). Código nuestro.
//
// ── Por qué esto es un módulo y no un script ────────────────────────────────
//
// Hasta ahora todo esto vivía dentro de `tools/bsp.mjs`, que imprime un informe
// en cuanto se carga: `process.exit(2)` en la línea 222 si no hay argumentos. O
// sea que **no se podía importar**, y por tanto no se podía probar ni reutilizar.
// Medir un mapa ajeno cabía en un script; extraerlo para dibujarlo no.
//
// `tools/bsp.mjs` sigue siendo el informe y ahora importa de aquí, así que hay
// un solo decodificador y las cifras de las dos cosas salen del mismo sitio.
//
// ── Lo que este archivo NO hace ─────────────────────────────────────────────
//
// No copia el mapa. Un lector es una herramienta —como `tools/kit.mjs` para los
// `.glb`— y vale para cualquier `.bsp`. El archivo se queda donde está, lo que
// se extraiga va a `build/`, y nada pasa a `public/`. La regla del 02 no se
// relaja: se escribe el lector, no se redistribuye el contenido.
//
// ── El formato, en corto ────────────────────────────────────────────────────
//
// Cabecera de 124 bytes: un entero de versión (30) y quince pares
// (desplazamiento, longitud), uno por «lump». Sin magia ASCII, así que la
// primera comprobación es que la versión valga 30.

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
 * NO son las 32 de Quake que usa el resto de este proyecto. Half-Life mide en
 * PULGADAS: el jugador de pie ocupa 72 unidades y mide seis pies, o sea que la
 * unidad es una pulgada justa y el metro son 39,37. Dar por supuestas las 32 de
 * Quake hace el mundo un 19 % más grande y no falla nada: sale un mapa plausible
 * con el jugador convertido en un enano, que es el aviso más viejo de este
 * experimento y el que más fácil vuelve.
 *
 * Se contrasta contra el propio mapa en `tools/bsp.mjs`, con la altura de las
 * puertas: 2,84 m con 39,37, y 3,50 m —una puerta de tres metros y medio— con 32.
 */
export const UNIDADES_POR_METRO = 39.37;

/**
 * El espaciado del mapa de luz, en unidades. Un luxel cada 16.
 *
 * No es ajustable: está horneado en el archivo. El tamaño del parche de una cara
 * es `(max − min) + 1` en cada eje, y **ese «+1» es el error que da mapas de luz
 * casi correctos** —desplazados medio luxel— que se ven bien en una captura y mal
 * en movimiento.
 */
export const LUXEL = 16;

/** Tamaños de registro, para que los desplazamientos no sean números sueltos. */
export const TAM = { cara: 20, texinfo: 40, modelo: 64, plano: 20, vertice: 12, arista: 4 };

/** Abre un `.bsp` ya leído en memoria. */
export function abrirBsp(b, nombre = "(sin nombre)") {
  if (b.length < 124) throw new Error(`${nombre}: demasiado corto para ser un .bsp`);
  const version = b.readInt32LE(0);
  if (version !== 30) {
    throw new Error(
      `${nombre}: versión ${version}. Esto lee GoldSrc (30). Quake 1 es 29 y Quake 3 ` +
        `empieza por el ASCII 'IBSP', que son formatos distintos con otros lumps.`
    );
  }
  const lumps = {};
  LUMPS.forEach((n, i) => {
    const off = b.readInt32LE(4 + i * 8);
    const len = b.readInt32LE(4 + i * 8 + 4);
    if (off < 0 || len < 0 || off + len > b.length) {
      throw new Error(`${nombre}: el lump '${n}' se sale del archivo`);
    }
    lumps[n] = { off, len, datos: b.subarray(off, off + len) };
  });
  return { buf: b, version, lumps, bytes: b.length, nombre };
}

/** Lee un `.bsp` del disco. Solo para Node. */
export function leerBsp(ruta) {
  return abrirBsp(readFileSync(ruta), basename(ruta, ".bsp"));
}

// --- entidades ---------------------------------------------------------------

/**
 * El lump de entidades es TEXTO: bloques `{ "clave" "valor" ... }`.
 *
 * Es la parte más rica de un `.bsp` para analizar diseño, y la única que se lee
 * sin descifrar nada: ahí están las luces con su brillo, los adornos con su
 * modelo, los monstruos y los puntos de aparición.
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

// --- modelos -----------------------------------------------------------------

/** Los modelos: el 0 es el mundo; los demás, las entidades con brushes. */
export function leerModelos(bsp) {
  const d = bsp.lumps.modelos.datos;
  const out = [];
  for (let i = 0; i + TAM.modelo <= d.length; i += TAM.modelo) {
    out.push({
      mins: [d.readFloatLE(i), d.readFloatLE(i + 4), d.readFloatLE(i + 8)],
      maxs: [d.readFloatLE(i + 12), d.readFloatLE(i + 16), d.readFloatLE(i + 20)],
      primeraCara: d.readInt32LE(i + 56),
      caras: d.readInt32LE(i + 60),
    });
  }
  return out;
}

// --- texturas ----------------------------------------------------------------

/**
 * La cabecera de cada textura: nombre, tamaño, y dónde empieza su `miptex`.
 *
 * El `off` es el dato nuevo respecto de cuando esto solo medía: sin él no se
 * puede decodificar la imagen, y la imagen es la mitad de la diferencia entre
 * Gate City y el jharro.
 */
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
      indice: i,
      off,
      nombre,
      ancho: d.readUInt32LE(off + 16),
      alto: d.readUInt32LE(off + 20),
      // Si el primer mip vale 0, el mapa no lleva los píxeles: los pide a un
      // `.wad` externo. Saberlo importa porque decide si el mapa se puede mirar
      // con lo que trae o hace falta el juego entero. En Gate City las 92 vienen
      // dentro, y por eso este experimento es posible.
      incrustada: d.readUInt32LE(off + 24) !== 0,
    });
  }
  return out;
}

// --- texinfo -----------------------------------------------------------------

/**
 * Los cuarenta bytes que dicen cómo se pinta una cara.
 *
 *   0..15   el vector S: xyz y su desplazamiento
 *   16..31  el vector T: xyz y su desplazamiento
 *   32      `miptex`, el índice de la textura
 *   36      `flags`
 *
 * La UV de un vértice es `(p·S + offS) / ancho` y `(p·T + offT) / alto`. Sin
 * esto no hay textura, y una cara sin textura no se ve mal: se ve gris, que es
 * exactamente el aspecto de «todavía no he puesto texturas».
 */
export function leerTexinfo(bsp) {
  const d = bsp.lumps.texinfo.datos;
  const out = [];
  for (let i = 0; i + TAM.texinfo <= d.length; i += TAM.texinfo) {
    out.push({
      s: [d.readFloatLE(i), d.readFloatLE(i + 4), d.readFloatLE(i + 8), d.readFloatLE(i + 12)],
      t: [d.readFloatLE(i + 16), d.readFloatLE(i + 20), d.readFloatLE(i + 24), d.readFloatLE(i + 28)],
      miptex: d.readUInt32LE(i + 32),
      flags: d.readUInt32LE(i + 36),
    });
  }
  return out;
}

/**
 * La proyección de un punto sobre un eje de textura, en unidades.
 *
 * El `Math.fround` NO es adorno, y costó encontrarlo: el compilador acumula esta
 * suma en un `vec_t`, que en ZHLT es un `float` de 32 bits. Hecha en el doble de
 * JavaScript, una coordenada que vale exactamente −3584 sale como
 * −3583,999999999999 y `Math.ceil(−223,99999…/16)` devuelve **un luxel de más**.
 *
 * Eso no da error: da parches de mapa de luz un luxel más grandes de lo que el
 * archivo guardó, o sea el mapa entero desplazado y mal escalado. Pasaba en
 * **951 de las 14 527 caras** de Gate City, y el resultado se ve bien en una
 * captura. Lo cazó la única sonda que aquí tiene oráculo: la suma de los bloques
 * tiene que dar los 2 126 793 bytes del lump exactos, y con el doble sobraban
 * 29 577.
 */
export function proyS(p, ti) {
  return Math.fround(p[0] * ti.s[0] + p[1] * ti.s[1] + p[2] * ti.s[2] + ti.s[3]);
}

/** La proyección de un punto sobre el eje T. Mismo redondeo, misma razón. */
export function proyT(p, ti) {
  return Math.fround(p[0] * ti.t[0] + p[1] * ti.t[1] + p[2] * ti.t[2] + ti.t[3]);
}

/** La UV de un punto, en vueltas de textura. */
export function uvDe(p, ti, ancho, alto) {
  return [proyS(p, ti) / ancho, proyT(p, ti) / alto];
}

/**
 * Si una cara tiene mapa de luz. Son DOS condiciones, no una.
 *
 * El aviso que traía la sesión era `lightofs = −1 significa sin mapa de luz, no
 * desplazamiento cero`, y es verdad — pero se queda corto, y el archivo lo dice:
 * de las 15 660 caras de Gate City, **137 tienen `lightofs = −1` y otras 996
 * tienen un `lightofs` válido con los cuatro `styles` a 255**. Ésas tampoco
 * tienen mapa de luz: el compilador dejó ahí el desplazamiento corriente, que
 * apunta al bloque de OTRA cara.
 *
 * Leerlas de todas formas no da error y no pinta negro, que sería visible: pinta
 * cada una con la luz de una cara vecina cualquiera. Es el fallo silencioso con
 * mejor pinta de los tres que tiene este lump, y las tres veces lo cazó la misma
 * cosa: exigir que los bloques encajen sin solaparse.
 */
export function tieneLuz(cara) {
  return cara.lightofs >= 0 && cara.estilos[0] !== 255;
}

/**
 * El parche de mapa de luz de una cara: dónde empieza y cuánto mide.
 *
 * Se proyectan los vértices sobre S y T, se toman el mínimo y el máximo, se
 * dividen entre 16, se redondean hacia abajo y hacia arriba, y el tamaño es
 * **la diferencia más uno**. Un desfase de uno aquí da un mapa de luz casi
 * correcto, desplazado medio luxel: se ve bien en una captura y mal en
 * movimiento.
 */
export function parcheDeLuz(puntos, ti) {
  let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
  for (const p of puntos) {
    const s = proyS(p, ti), t = proyT(p, ti);
    if (s < s0) s0 = s;
    if (s > s1) s1 = s;
    if (t < t0) t0 = t;
    if (t > t1) t1 = t;
  }
  const bs = Math.floor(s0 / LUXEL), bS = Math.ceil(s1 / LUXEL);
  const bt = Math.floor(t0 / LUXEL), bT = Math.ceil(t1 / LUXEL);
  return {
    // El origen del parche, en unidades: es lo que hay que restarle a la
    // proyección para que el primer luxel caiga en cero.
    origenS: bs * LUXEL,
    origenT: bt * LUXEL,
    ancho: bS - bs + 1,
    alto: bT - bt + 1,
  };
}

// --- caras -------------------------------------------------------------------

/**
 * Las caras de un modelo, como polígonos, con todo lo que hace falta para
 * dibujarlas.
 *
 * La estructura de una cara son veinte bytes:
 *
 *   0   uint16  plano
 *   2   uint16  `side`: distinto de cero VOLTEA la normal del plano. Sin esto la
 *               mitad de los suelos son techos, y eso ya se supo al medir la
 *               altura libre.
 *   4   int32   primera `surfedge`
 *   8   uint16  cuántas
 *   10  uint16  `texinfo`
 *   12  uint8×4 `styles`: los estilos de luz. 255 es «no hay».
 *   16  int32   `lightofs`: desplazamiento dentro del lump de luz, y **vale −1
 *               cuando la cara no tiene mapa de luz**. Leer el byte 0 del lump
 *               para esas caras las pinta a todas del mismo color.
 */
export function leerCaras(bsp, modelo, texinfos = null) {
  const { planos, vertices, caras, aristas, surfedges } = bsp.lumps;
  const tis = texinfos ?? leerTexinfo(bsp);
  const vert = (i) => [
    vertices.datos.readFloatLE(i * TAM.vertice),
    vertices.datos.readFloatLE(i * TAM.vertice + 4),
    vertices.datos.readFloatLE(i * TAM.vertice + 8),
  ];
  const out = [];
  for (let f = modelo.primeraCara; f < modelo.primeraCara + modelo.caras; f++) {
    const o = f * TAM.cara;
    if (o + TAM.cara > caras.len) break;
    const iPlano = caras.datos.readUInt16LE(o);
    const lado = caras.datos.readUInt16LE(o + 2);
    const primera = caras.datos.readInt32LE(o + 4);
    const n = caras.datos.readUInt16LE(o + 8);
    const iTex = caras.datos.readUInt16LE(o + 10);
    const estilos = [
      caras.datos.readUInt8(o + 12), caras.datos.readUInt8(o + 13),
      caras.datos.readUInt8(o + 14), caras.datos.readUInt8(o + 15),
    ];
    const lightofs = caras.datos.readInt32LE(o + 16);

    let normal = [
      planos.datos.readFloatLE(iPlano * TAM.plano),
      planos.datos.readFloatLE(iPlano * TAM.plano + 4),
      planos.datos.readFloatLE(iPlano * TAM.plano + 8),
    ];
    if (lado) normal = normal.map((v) => -v);

    // El recorrido de `surfedges`: un valor NEGATIVO recorre su arista al
    // revés. Sin eso los polígonos salen con los vértices cruzados.
    const puntos = [];
    for (let k = 0; k < n; k++) {
      const se = surfedges.datos.readInt32LE((primera + k) * 4);
      const e = Math.abs(se) * TAM.arista;
      const a = aristas.datos.readUInt16LE(e);
      const bb = aristas.datos.readUInt16LE(e + 2);
      puntos.push(vert(se >= 0 ? a : bb));
    }
    if (puntos.length < 3) continue;

    const ti = tis[iTex] ?? null;
    out.push({
      indice: f,
      normal,
      area: areaPoligono(puntos),
      iPlano,
      lado,
      iTex,
      miptex: ti ? ti.miptex : -1,
      texinfo: ti,
      estilos,
      // Cuántos estilos de luz guarda esta cara. Los datos son RGB de 8 bits y
      // van uno detrás de otro, en el orden de los `styles` que no son 255.
      nEstilos: estilos.filter((s) => s !== 255).length,
      lightofs,
      puntos,
    });
  }
  return out;
}

/** Todas las caras del archivo, modelo a modelo, con su modelo anotado. */
export function leerTodasLasCaras(bsp, modelos = null, texinfos = null) {
  const ms = modelos ?? leerModelos(bsp);
  const tis = texinfos ?? leerTexinfo(bsp);
  const out = [];
  ms.forEach((m, i) => {
    for (const c of leerCaras(bsp, m, tis)) out.push({ ...c, modelo: i });
  });
  return out;
}

/**
 * Área de un polígono plano, por el módulo de la suma de productos cruzados
 * desde el primer vértice. Vale para cualquier polígono plano y convexo, que es
 * lo que un `.bsp` garantiza.
 */
export function areaPoligono(puntos) {
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
  return Math.hypot(ax, ay, az) / 2;
}

/**
 * Un punto de GoldSrc en unidades a un punto de Three.js en metros.
 *
 * Mismo cambio de ejes que `src/map/geometry.js` —GoldSrc es Z arriba, Three.js
 * es Y arriba— y OTRA escala. Vive aquí y en ningún otro sitio para que haya un
 * solo lugar donde equivocarse, y el error que evita es el de siempre: leer este
 * `.bsp` con 32 u/m no falla, sale un mapa plausible un 19 % más grande.
 */
export function aEscena(p) {
  return [
    p[0] / UNIDADES_POR_METRO,
    p[2] / UNIDADES_POR_METRO,
    -p[1] / UNIDADES_POR_METRO,
  ];
}

/** Un vector, sin escala. El cambio de ejes conserva la mano derecha. */
export function vectorAEscena(v) {
  return [v[0], v[2], -v[1]];
}
