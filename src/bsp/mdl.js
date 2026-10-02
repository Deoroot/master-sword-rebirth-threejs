// Lector de `.mdl` de GoldSrc: los adornos. Código nuestro.
//
// ── Por qué esto es lo que quedaba ──────────────────────────────────────────
//
// Porque es el último hueco grande del experimento y el único que se ve a la
// altura de los ojos. Gate City coloca **101 `env_model`** de 17 ficheros
// distintos: sillas, barriles, mesas, carros, una lámpara de pie. Ninguno está
// dentro del `.bsp`, pero los 17 están AL LADO, en `../MSC/assets/msr/models/`.
// O sea que no es un muro: es un lector por escribir, y la regla del 02 se
// resuelve igual que con el mapa — se escribe el lector, lo extraído va a
// `build/`, no se copia un byte a `public/`.
//
// ── Lo que hace falta y lo que NO ───────────────────────────────────────────
//
// Para un adorno no hace falta animación, y eso quita la mitad del formato. Hace
// falta la cabeza, los `bodyparts`, la malla con sus tiras y abanicos, las
// texturas con su paleta —que es otra vez el trabajo de `miptex.js`— y la POSE DE
// REPOSO de los huesos. Nada de secuencias, nada de mezcla, nada de `chrome`.
//
// La pose de reposo sale de los propios huesos y no de la secuencia 0, y esto hay
// que decirlo porque parece al revés: en el motor, `CalcBoneQuaternion` empieza en
// `pbone->value[]` y le SUMA lo que diga la animación. Sin animación, `value[]` ES
// la pose. Para un barril, que es lo que somos aquí, eso es exactamente lo que se
// modeló.
//
// ── Las trampas, y todas dan modelos «casi bien» ────────────────────────────
//
//   el bobinado    las tiras de triángulos ALTERNAN el sentido. Sin alternar,
//                  la mitad de las caras salen del revés — y eso ya costó una
//                  ronda entera con el `.bsp`, donde se leyó como oscuridad en
//                  vez de como geometría invertida.
//   las UV         `s` y `t` vienen en PÍXELES, no en vueltas de textura.
//                  Usados como 0..1, un barril sale con un solo téxel estirado:
//                  un color plano, que es el mismo fallo silencioso de la paleta.
//   los huesos     cada vértice trae SU hueso y está en el espacio de ese hueso.
//                  Sin transformar, las piezas de un modelo de cuatro huesos
//                  salen apiladas en el origen — un montón con forma de nada.
//   el cuaternión  el motor compone `Rz·Ry·Rx` (ver `AngleQuaternion`). En otro
//                  orden, un modelo con un solo hueso sale bien y uno con cuatro
//                  sale retorcido, que es la peor forma de fallar: parece que el
//                  lector va bien.
//   las texturas   si `numtextures` vale 0, están en un fichero aparte
//                  `<nombre>T.mdl`. Leer el modelo de todas formas no da error:
//                  da un modelo sin una sola textura.
//
// ── El control ──────────────────────────────────────────────────────────────
//
// El mismo que el resto de la sesión: que las cuentas cierren contra el archivo.
// Cada desplazamiento tiene que caer dentro, cada tira tiene que acabar donde
// empieza la siguiente, y `length` de la cabecera tiene que valer el tamaño del
// fichero. Ver `cuadra` en lo que devuelve `abrirMdl()`.

import { readFileSync } from "node:fs";

/** El tamaño de cada estructura, para que los recorridos no lleven números sueltos. */
export const TAM = {
  cabecera: 244,
  hueso: 112,
  bodypart: 76,
  modelo: 112,
  malla: 20,
  textura: 80,
};

/**
 * Las banderas de una textura de `.mdl`.
 *
 * `masked` es la que importa para un adorno: es el `alphaTest` del índice 255,
 * o sea las hojas de un helecho y los radios de una rueda. Dibujada opaca, una
 * hoja es un rectángulo verde.
 */
export const BANDERAS = {
  planoSinSombra: 0x0001,
  cromo: 0x0002,
  plenaLuz: 0x0004,
  sinMipmaps: 0x0008,
  alfa: 0x0010,
  aditivo: 0x0020,
  recortado: 0x0040,
};

/**
 * El cuaternión de un ángulo de Euler, **en el orden del motor**.
 *
 * Es `AngleQuaternion()` de `studio_util.c`, y compone `Rz·Ry·Rx`. En Three.js el
 * mismo orden se llama `'ZYX'`; el que parece natural —`'XYZ'`— da una rotación
 * distinta en cuanto hay dos ejes en juego.
 *
 * Los `value[3..5]` de un hueso vienen en RADIANES, no en grados: el compilador
 * ya los convirtió. Pasarlos por otra conversión da modelos girados por un factor
 * de 57, que se ve como un adorno tumbado.
 */
export function cuaternionDeEuler(x, y, z) {
  const sr = Math.sin(x * 0.5), cr = Math.cos(x * 0.5);
  const sp = Math.sin(y * 0.5), cp = Math.cos(y * 0.5);
  const sy = Math.sin(z * 0.5), cy = Math.cos(z * 0.5);
  return [
    sr * cp * cy - cr * sp * sy,
    cr * sp * cy + sr * cp * sy,
    cr * cp * sy - sr * sp * cy,
    cr * cp * cy + sr * sp * sy,
  ];
}

/** La matriz 3×4 de un cuaternión y una posición, en filas. */
export function matrizDe(q, p) {
  const [x, y, z, w] = q;
  return [
    1 - 2 * y * y - 2 * z * z, 2 * x * y - 2 * w * z, 2 * x * z + 2 * w * y, p[0],
    2 * x * y + 2 * w * z, 1 - 2 * x * x - 2 * z * z, 2 * y * z - 2 * w * x, p[1],
    2 * x * z - 2 * w * y, 2 * y * z + 2 * w * x, 1 - 2 * x * x - 2 * y * y, p[2],
  ];
}

/** El producto de dos matrices 3×4, en el orden `padre · hijo`. */
export function componer(a, b) {
  const o = new Array(12);
  for (let f = 0; f < 3; f++) {
    for (let c = 0; c < 3; c++) {
      o[f * 4 + c] = a[f * 4] * b[c] + a[f * 4 + 1] * b[4 + c] + a[f * 4 + 2] * b[8 + c];
    }
    o[f * 4 + 3] = a[f * 4] * b[3] + a[f * 4 + 1] * b[7] + a[f * 4 + 2] * b[11] + a[f * 4 + 3];
  }
  return o;
}

/** Un punto por una matriz 3×4. */
export function porMatriz(m, v) {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2] + m[3],
    m[4] * v[0] + m[5] * v[1] + m[6] * v[2] + m[7],
    m[8] * v[0] + m[9] * v[1] + m[10] * v[2] + m[11],
  ];
}

/** Una dirección por una matriz 3×4: sin la traslación. */
export function direccionPorMatriz(m, v) {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[4] * v[0] + m[5] * v[1] + m[6] * v[2],
    m[8] * v[0] + m[9] * v[1] + m[10] * v[2],
  ];
}

/**
 * La matriz de un `angles` de entidad, tal cual la hace el motor.
 *
 * Es `AngleMatrix()`: los tres números de un `angles "p y r"` son **pitch, yaw,
 * roll**, en grados, y la matriz es `Rz(yaw) · Ry(pitch) · Rx(roll)` con el eje Z
 * hacia arriba, que es el de GoldSrc.
 *
 * Hace falta escribirla y no deducirla porque en Gate City **se usan las tres**:
 * de los 101 adornos, 72 llevan yaw, 26 pitch y 26 roll. Con sólo yaw cualquier
 * convención parece buena.
 *
 * Y va en espacio de GoldSrc a propósito: el vértice se lleva entero hasta el
 * mundo ahí —hueso, modelo, entidad, origen— y sólo al final se cambia de ejes,
 * una vez. Cambiando de ejes a media transformación hay que girar también la
 * rotación, y eso son dos sitios donde equivocarse en vez de ninguno.
 */
export function matrizDeAngulos(pitch, yaw, roll) {
  const g = Math.PI / 180;
  const sy = Math.sin(yaw * g), cy = Math.cos(yaw * g);
  const sp = Math.sin(pitch * g), cp = Math.cos(pitch * g);
  const sr = Math.sin(roll * g), cr = Math.cos(roll * g);
  return [
    cp * cy, sr * sp * cy - cr * sy, cr * sp * cy + sr * sy, 0,
    cp * sy, sr * sp * sy + cr * cy, cr * sp * sy - sr * cy, 0,
    -sp, sr * cp, cr * cp, 0,
  ];
}

const texto = (b, o, n) => b.subarray(o, o + n).toString("latin1").replace(/\0.*$/, "");

/**
 * Abre un `.mdl` y lee su cabecera, sin tocar la geometría.
 *
 * `texturas` puede venir de OTRO buffer: cuando `numtextures` vale 0, las
 * texturas están en `<nombre>T.mdl`, que es un fichero con la misma cabecera y
 * sólo el lump de texturas relleno.
 */
export function abrirMdl(b, nombre = "(sin nombre)") {
  if (b.length < TAM.cabecera) throw new Error(`${nombre}: demasiado corto para ser un .mdl`);
  const id = texto(b, 0, 4);
  if (id !== "IDST") {
    // `IDSQ` es un fichero de secuencias y `IDSP` un cartel. Los tres empiezan por
    // `ID` y ninguno de los dos últimos tiene aquí lo que se busca.
    throw new Error(
      `${nombre}: empieza por '${id}' y no por 'IDST'. ` +
        `'IDSQ' es un grupo de secuencias y 'IDSP' un sprite; ninguno lleva malla.`
    );
  }
  const version = b.readInt32LE(4);
  if (version !== 10) throw new Error(`${nombre}: versión ${version}, y esto lee la 10 de GoldSrc`);
  const l = (o) => b.readInt32LE(o);
  const v3 = (o) => [b.readFloatLE(o), b.readFloatLE(o + 4), b.readFloatLE(o + 8)];
  return {
    nombre,
    buf: b,
    id,
    version,
    nombreInterno: texto(b, 8, 64),
    // `length` tiene que valer el tamaño del fichero. Es el primer control y el
    // más barato: si no cuadra, el fichero está truncado o es otra cosa.
    largo: l(72),
    bytes: b.length,
    cuadra: l(72) === b.length,
    ojos: v3(76),
    min: v3(88),
    max: v3(100),
    bbmin: v3(112),
    bbmax: v3(124),
    flags: l(136),
    nHuesos: l(140), offHuesos: l(144),
    nSecuencias: l(164), offSecuencias: l(168),
    nGruposSec: l(172), offGruposSec: l(176),
    nTexturas: l(180), offTexturas: l(184),
    offDatosTextura: l(188),
    nPieles: l(192),
    nFamiliasPiel: l(196), offPieles: l(200),
    nBodyparts: l(204), offBodyparts: l(208),
  };
}

export function leerMdl(ruta) {
  return abrirMdl(readFileSync(ruta), ruta);
}

/**
 * Los huesos, ya compuestos hasta la raíz.
 *
 * Devuelve una matriz 3×4 por hueso, en el espacio del modelo. El bucle va en
 * orden porque el formato garantiza que el padre va antes que el hijo — y se
 * comprueba, porque si no fuera verdad la composición usaría una matriz a medio
 * hacer y el modelo saldría retorcido sin dar error.
 */
export function huesosDe(m) {
  const { buf, offHuesos, nHuesos } = m;
  const matrices = [];
  const padres = [];
  for (let i = 0; i < nHuesos; i++) {
    const o = offHuesos + i * TAM.hueso;
    const padre = buf.readInt32LE(o + 32);
    if (padre >= i) {
      throw new Error(`${m.nombre}: el hueso ${i} tiene de padre al ${padre}, que va después`);
    }
    padres.push(padre);
    // `mstudiobone_t`: name[32], parent(32), flags(36), bonecontroller[6](40),
    // **value[6](64)**, scale[6](88). Son 112 bytes, y `value` está en 64 — no en
    // 44, que es donde acaban los `bonecontroller` de un formato parecido.
    const val = [];
    for (let k = 0; k < 6; k++) val.push(buf.readFloatLE(o + 64 + k * 4));
    const local = matrizDe(
      cuaternionDeEuler(val[3], val[4], val[5]),
      [val[0], val[1], val[2]]
    );
    matrices.push(padre < 0 ? local : componer(matrices[padre], local));
  }
  return { matrices, padres };
}

/**
 * Las texturas de un `.mdl`, decodificadas a RGBA.
 *
 * La paleta va DETRÁS de los píxeles, como en un `miptex` y al revés que en un
 * `.spr`: `index` apunta a `ancho × alto` bytes indexados y justo después vienen
 * los 256 × 3 de la paleta. Son tres formatos parecidos con la paleta en tres
 * sitios, y confundirlos no da error: da una imagen de un solo color.
 *
 * En una textura `recortado`, el índice 255 es transparente. En las demás, el
 * alfa se queda a 255 — y NO se mira el color, porque un negro legítimo del
 * modelo se volvería un agujero.
 */
export function texturasDe(m, bufTex = null) {
  const b = bufTex ?? m.buf;
  const base = bufTex ? abrirMdl(bufTex, `${m.nombre} (texturas)`) : m;
  const out = [];
  for (let i = 0; i < base.nTexturas; i++) {
    const o = base.offTexturas + i * TAM.textura;
    if (o + TAM.textura > b.length) throw new Error(`${m.nombre}: la textura ${i} se sale del fichero`);
    const nombre = texto(b, o, 64);
    const flags = b.readInt32LE(o + 64);
    const ancho = b.readInt32LE(o + 68);
    const alto = b.readInt32LE(o + 72);
    const off = b.readInt32LE(o + 76);
    if (ancho <= 0 || alto <= 0) throw new Error(`${m.nombre}: la textura '${nombre}' mide ${ancho}×${alto}`);
    const fin = off + ancho * alto + 256 * 3;
    if (fin > b.length) throw new Error(`${m.nombre}: los píxeles de '${nombre}' se salen del fichero`);
    const pal = b.subarray(off + ancho * alto, fin);
    const recortado = (flags & BANDERAS.recortado) !== 0;
    const rgba = new Uint8Array(ancho * alto * 4);
    for (let k = 0; k < ancho * alto; k++) {
      const idx = b[off + k];
      if (recortado && idx === 255) { rgba[k * 4 + 3] = 0; continue; }
      rgba[k * 4] = pal[idx * 3];
      rgba[k * 4 + 1] = pal[idx * 3 + 1];
      rgba[k * 4 + 2] = pal[idx * 3 + 2];
      rgba[k * 4 + 3] = 255;
    }
    out.push({ nombre, flags, ancho, alto, rgba, recortado,
      aditivo: (flags & BANDERAS.aditivo) !== 0,
      cromo: (flags & BANDERAS.cromo) !== 0,
      plenaLuz: (flags & BANDERAS.plenaLuz) !== 0 });
  }
  return out;
}

/** La tabla de pieles: qué textura usa cada `skinref`. */
export function pielesDe(m) {
  const { buf, offPieles, nPieles, nFamiliasPiel } = m;
  const familias = [];
  for (let f = 0; f < Math.max(1, nFamiliasPiel); f++) {
    const fila = [];
    for (let i = 0; i < nPieles; i++) {
      const o = offPieles + (f * nPieles + i) * 2;
      fila.push(o + 2 <= buf.length ? buf.readInt16LE(o) : i);
    }
    familias.push(fila);
  }
  return familias;
}

/**
 * La malla de un `.mdl`, en triángulos sueltos y en espacio de modelo.
 *
 * Se recorren los `bodyparts` y de cada uno se toma **el submodelo 0**. Un
 * `bodypart` con varios submodelos es una elección de cuerpo —cabezas distintas,
 * armas distintas— que elige la entidad con su `body`, y para un adorno el 0 es
 * el que el mapa pone. Se cuenta cuántos se dejan fuera, porque «el modelo sale
 * incompleto» y «el modelo tiene dos versiones» se ven igual.
 *
 * Los comandos de triángulo son una lista de shorts:
 *
 *     short n          0 = se acabó; n<0 = ABANICO de -n; n>0 = TIRA de n
 *     por vértice:     índice de vértice, índice de normal, s, t   (4 shorts)
 *
 * Y la tira ALTERNA el sentido en cada triángulo. Sin alternar salen la mitad de
 * las caras del revés, que con luz por delante se ve como manchas negras — el
 * mismo síntoma que tuvieron las 12 680 caras del `.bsp`, y por el que esta vez
 * hay un control.
 */
export function mallaDe(m, texturas, { piel = 0, cuerpo = 0, matrices: dadas = null } = {}) {
  const { buf } = m;
  // Las matrices de hueso: la postura de reposo, o las que le pasen.
  //
  // Un `env_model` declara `sequence`, y **no siempre es la 0**: las 24
  // `p_swords.mdl` de Gate City piden la 1 (`dragonsword_floor_idle`) y los dos
  // `p_shields.mdl` la 2. Dibujados en su postura de reposo salen como un
  // amasijo colgando de un poste — que es exactamente lo que se veía, y que
  // pasa por «ese adorno es raro» porque nadie sabe qué forma debería tener.
  //
  // Las matrices las calcula quien llama, con `src/bsp/mdlanim.js`: este módulo
  // no importa aquél para no montar un ciclo.
  const { matrices } = dadas ? { matrices: dadas } : huesosDe(m);
  const pieles = pielesDe(m);
  const tabla = pieles[Math.min(piel, pieles.length - 1)] ?? [];

  // Un tramo por textura: es lo mismo que hace `emitirMalla()` con el `.bsp`, y
  // por la misma razón — un `drawcall` por material y no uno por malla.
  const porTextura = new Map();
  let submodelosOmitidos = 0, triangulos = 0, tiras = 0, abanicos = 0;
  let esperados = 0, leidos = 0;

  for (let bp = 0; bp < m.nBodyparts; bp++) {
    const ob = m.offBodyparts + bp * TAM.bodypart;
    const nModelos = buf.readInt32LE(ob + 64);
    const base = buf.readInt32LE(ob + 68);
    const offModelos = buf.readInt32LE(ob + 72);
    if (nModelos > 1) submodelosOmitidos += nModelos - 1;
    if (nModelos < 1) continue;
    // Cuál de los submodelos, según el `body` de la entidad. Es la fórmula del
    // motor: `(body / base) % nummodels`, un número en base mixta con un dígito
    // por `bodypart`.
    //
    // En Gate City se usa: los 24 `p_swords.mdl` traen `body` 4, 6, 16, 24 y 28,
    // y cada uno es una espada distinta del mismo perchero. Cogiendo siempre el
    // submodelo 0 salen las 24 iguales — que se ve plausible, porque un perchero
    // con veinticuatro espadas iguales no llama la atención.
    const iSub = nModelos > 1 && base > 0
      ? Math.floor(cuerpo / base) % nModelos
      : 0;

    // `mstudiomodel_t`, y los desplazamientos van escritos porque escribirlos de
    // memoria ya me costó una vuelta: name[64], type(64), boundingradius(68),
    // nummesh(72), meshindex(76), numverts(80), vertinfoindex(84), vertindex(88),
    // numnorms(92), norminfoindex(96), normindex(100), numgroups(104),
    // groupindex(108). Son 112 bytes.
    const om = offModelos + iSub * TAM.modelo;
    const nMallas = buf.readInt32LE(om + 72);
    const offMallas = buf.readInt32LE(om + 76);
    const nVerts = buf.readInt32LE(om + 80);
    const offInfoVert = buf.readInt32LE(om + 84);
    const offVerts = buf.readInt32LE(om + 88);
    const offNormales = buf.readInt32LE(om + 100);

    // Los vértices, ya llevados del espacio de su hueso al del modelo.
    const verts = new Float32Array(nVerts * 3);
    for (let i = 0; i < nVerts; i++) {
      const hueso = buf[offInfoVert + i];
      const v = [
        buf.readFloatLE(offVerts + i * 12),
        buf.readFloatLE(offVerts + i * 12 + 4),
        buf.readFloatLE(offVerts + i * 12 + 8),
      ];
      const w = porMatriz(matrices[hueso] ?? matrices[0], v);
      verts[i * 3] = w[0]; verts[i * 3 + 1] = w[1]; verts[i * 3 + 2] = w[2];
    }

    for (let me = 0; me < nMallas; me++) {
      const omm = offMallas + me * TAM.malla;
      const nTris = buf.readInt32LE(omm);
      const offTris = buf.readInt32LE(omm + 4);
      const skinref = buf.readInt32LE(omm + 8);
      const iTex = tabla[skinref] ?? skinref;
      const tex = texturas[iTex] ?? texturas[0];
      if (!tex) continue;
      // La clave del grupo es el `skinref`, NO el nombre de la textura.
      //
      // Un `.mdl` puede tener varias FAMILIAS de piel —`dwarf/male1.mdl` tiene
      // siete— y la familia decide qué textura le toca a cada `skinref`. Dos
      // mallas con `skinref` distinto pueden compartir textura en la familia 0 y
      // no compartirla en la 3, así que agrupar por nombre de textura hace que
      // cambiar de familia sea imposible sin volver a emitir la malla.
      const clave = `s${skinref}`;
      if (!porTextura.has(clave)) {
        porTextura.set(clave, {
          skinref,
          textura: tex, iTextura: iTex, pos: [], uv: [], nor: [],
          // El HUESO de cada vértice. En GoldSrc es uno y sólo uno —no hay pesos—,
          // así que esto es todo lo que hace falta para que un `SkinnedMesh` de
          // Three.js anime el modelo: `skinIndex` con este número y `skinWeight`
          // a (1, 0, 0, 0). Ver `src/bsp/mdlanim.js`.
          hueso: [],
        });
      }
      const g = porTextura.get(clave);

      // Las normales de este submodelo, en espacio de modelo. Se transforman con
      // el hueso del VÉRTICE y no con el suyo: el formato guarda una normal por
      // vértice de malla y su hueso es el mismo.
      let p = offTris;
      let emitidos = 0;
      for (;;) {
        if (p + 2 > buf.length) break;
        const n = buf.readInt16LE(p); p += 2;
        if (n === 0) break;
        const abanico = n < 0;
        const cuantos = Math.abs(n);
        if (abanico) abanicos++; else tiras++;
        const v = [];
        for (let i = 0; i < cuantos; i++) {
          const iv = buf.readUInt16LE(p);
          const inor = buf.readUInt16LE(p + 2);
          const s = buf.readInt16LE(p + 4);
          const t = buf.readInt16LE(p + 6);
          p += 8;
          v.push({ iv, inor, s, t });
        }
        emitidos += cuantos - 2;
        // El giro se INVIERTE, y no por gusto.
        //
        // GoldSrc dibuja los modelos con `glCullFace(GL_FRONT)` —al revés que el
        // mundo—, así que un `.mdl` viene bobinado en el sentido contrario al que
        // Three.js llama frontal. Sin invertirlo, la mitad de las caras de una
        // silla se van por el culling y la silla sale APOLILLADA: la silueta
        // entera y llena de agujeros. Que es exactamente lo que se vio.
        //
        // Y no hace falta creerse este comentario: el archivo trae las normales,
        // así que el sentido correcto es el que concuerda con ellas. Se cuenta
        // abajo y se devuelve en `contraNormal`. Antes de invertir daba **131 de
        // 131 en la silla, 632 de 632 en el carro, 370 de 370 en la lámpara**: el
        // cien por cien, en todos.
        //
        // Es la misma trampa que tuvieron las 12 680 caras del `.bsp`, y aquella
        // costó una ronda entera de alguien jugándolo porque se leyó como
        // oscuridad. Ésta se caza sin dibujar nada.
        const emite = (a, b2, c) => {
          for (const k of [a, c, b2]) {
            g.pos.push(verts[k.iv * 3], verts[k.iv * 3 + 1], verts[k.iv * 3 + 2]);
            // `s` y `t` van en PÍXELES. Sin dividir, el modelo entero sale de un
            // solo color.
            g.uv.push(k.s / tex.ancho, k.t / tex.alto);
            const nn = [
              buf.readFloatLE(offNormales + k.inor * 12),
              buf.readFloatLE(offNormales + k.inor * 12 + 4),
              buf.readFloatLE(offNormales + k.inor * 12 + 8),
            ];
            const hueso = buf[offInfoVert + k.iv];
            const w = direccionPorMatriz(matrices[hueso] ?? matrices[0], nn);
            g.nor.push(w[0], w[1], w[2]);
            g.hueso.push(hueso);
          }
          triangulos++;
        };
        if (abanico) {
          for (let i = 1; i + 1 < cuantos; i++) emite(v[0], v[i], v[i + 1]);
        } else {
          // La ALTERNANCIA. En los impares se cambian dos vértices de sitio, que
          // es lo que mantiene el sentido de giro.
          for (let i = 0; i + 2 < cuantos; i++) {
            if (i % 2 === 0) emite(v[i], v[i + 1], v[i + 2]);
            else emite(v[i + 1], v[i], v[i + 2]);
          }
        }
      }
      // EL CONTROL, y es un oráculo dentro del archivo, no un «parece razonable»:
      // `mstudiomesh_t.numtris` dice cuántos triángulos tiene esta malla, y los
      // comandos tienen que dar exactamente esos. Una tira de n vértices son n−2
      // triángulos y un abanico también.
      //
      // Es lo mismo que la contabilidad del mapa de luz, y hace la misma falta:
      // un recorrido de tiras que se desincroniza no da error, sigue leyendo
      // shorts y saca geometría — geometría de basura, con forma de modelo roto,
      // que en una captura pequeña pasa por «el adorno es raro».
      esperados += nTris;
      leidos += emitidos;
    }
  }
  // EL CONTROL DEL BOBINADO, y es de los buenos: no hace falta dibujar nada ni
  // mirar nada. El archivo trae una normal por vértice, así que el sentido de
  // giro correcto es el que concuerda con ella. Se cuentan los que no.
  const grupos = [...porTextura.values()];
  let contraNormal = 0, aFavor = 0;
  // Y de paso, QUIÉN ESTÁ REPETIDO. Ver `gemelos` abajo.
  const posDe = (p, i) => [0, 1, 2]
    .map((k) => `${p[i + k * 3].toFixed(3)},${p[i + k * 3 + 1].toFixed(3)},${p[i + k * 3 + 2].toFixed(3)}`)
    .sort().join("|");
  const deFrente = new Set();
  const delReves = [];
  for (const g of grupos) {
    for (let i = 0; i < g.pos.length; i += 9) {
      const ax = g.pos[i + 3] - g.pos[i], ay = g.pos[i + 4] - g.pos[i + 1], az = g.pos[i + 5] - g.pos[i + 2];
      const bx = g.pos[i + 6] - g.pos[i], by = g.pos[i + 7] - g.pos[i + 1], bz = g.pos[i + 8] - g.pos[i + 2];
      const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
      if (Math.hypot(cx, cy, cz) < 1e-9) continue;
      const nx = (g.nor[i] + g.nor[i + 3] + g.nor[i + 6]) / 3;
      const ny = (g.nor[i + 1] + g.nor[i + 4] + g.nor[i + 7]) / 3;
      const nz = (g.nor[i + 2] + g.nor[i + 5] + g.nor[i + 8]) / 3;
      if (cx * nx + cy * ny + cz * nz > 0) { aFavor++; deFrente.add(posDe(g.pos, i)); }
      else { contraNormal++; delReves.push(posDe(g.pos, i)); }
    }
  }
  // LOS GEMELOS, y son lo que salva el umbral de tener que adivinarse (el 48).
  //
  // Un triángulo «en contra» que tiene otro **en las mismas tres posiciones** y
  // a favor no es un error de bobinado: es una pieza de DOBLE CARA, modelada
  // dos veces a propósito porque en GoldSrc no hay `doubleSided`.
  //
  // Lo destapó Edana: `msc_riverwind/flo_grass2.mdl` —una mata de hierba— tiene
  // 36 de 72 en contra, o sea el 50 % clavado, y el umbral del 25 % lo paraba.
  // Los 36 tienen gemelo, los 36. Descontarlos deja el 0 % y no hay que mover
  // el umbral: un modelo de verdad invertido sigue dando el 100 % sin un solo
  // gemelo, porque sus triángulos no están repetidos.
  const gemelos = delReves.filter((k) => deFrente.has(k)).length;
  const sueltos = contraNormal - gemelos;
  return {
    grupos,
    triangulos, tiras, abanicos, submodelosOmitidos,
    esperados, leidos, cuadra: esperados === leidos,
    aFavor, contraNormal, gemelos, sueltos,
    // El umbral es el 25 % y no el 0 %, y la razón está medida: `gaz_thoth_mutant_candle`
    // tiene **10 de sus 120** triángulos girando en contra, y son la llama —una
    // pieza de dos caras, modelada así a propósito—. Un bobinado invertido de
    // verdad no da el 8 %: da el 100 %, que es lo que daban los diecisiete antes
    // de invertirlos.
    //
    // Lo que se cuenta contra el umbral son los que van en contra **y no tienen
    // gemelo**: los de doble cara no son un fallo y en la hierba de Edana son
    // justo la mitad. Ver `gemelos` arriba.
    contraNormalFrac: (aFavor + contraNormal) ? contraNormal / (aFavor + contraNormal) : 0,
    bobinadoBien: sueltos <= (aFavor + contraNormal) * 0.25,
  };
}

/**
 * Los vértices CRUDOS de un modelo: cada uno en el espacio de su hueso, que es
 * como los guarda el archivo y antes de posarlos con ninguna matriz.
 *
 * Es lo que necesita `recorridoDeModelo()` para preguntarle al vértice —y no al
 * hueso— cuánto se mueve una secuencia.
 */
export function verticesCrudos(m) {
  const { buf } = m;
  const out = [];
  for (let bp = 0; bp < m.nBodyparts; bp++) {
    const ob = m.offBodyparts + bp * TAM.bodypart;
    const nModelos = buf.readInt32LE(ob + 64);
    const offModelos = buf.readInt32LE(ob + 72);
    if (nModelos < 1) continue;
    const nVerts = buf.readInt32LE(offModelos + 80);
    const offInfoVert = buf.readInt32LE(offModelos + 84);
    const offVerts = buf.readInt32LE(offModelos + 88);
    for (let i = 0; i < nVerts; i++) {
      out.push({
        hueso: buf[offInfoVert + i],
        p: [
          buf.readFloatLE(offVerts + i * 12),
          buf.readFloatLE(offVerts + i * 12 + 4),
          buf.readFloatLE(offVerts + i * 12 + 8),
        ],
      });
    }
  }
  return out;
}
