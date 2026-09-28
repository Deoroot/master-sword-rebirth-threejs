// Las SECUENCIAS de un `.mdl`: lo que convierte 17 adornos quietos en bichos.
//
// ── Qué hay que leer y dónde está ──────────────────────────────────────────
//
// Un `.mdl` de GoldSrc guarda, por SECUENCIA (`mstudioseqdesc_t`, 176 bytes), y
// por HUESO dentro de ella, seis canales comprimidos: tres de posición y tres de
// rotación. Los seis viven detrás de un `mstudioanim_t` de 12 bytes —seis
// `uint16` de desplazamiento, uno por canal— y un desplazamiento de CERO
// significa «este canal no cambia: usa el valor de reposo del hueso».
//
// El resto es un RLE de pares `(valid, total)`:
//
//     struct { byte valid; byte total; }  ó  int16 value
//
// `total` es cuántos fotogramas cubre el bloque y `valid` cuántos valores
// distintos trae detrás. Si `total > valid`, los que faltan repiten el último.
// Eso es `R_StudioCalcBones()` en `public/xash3d_mathlib.c`, y está copiado aquí
// línea a línea porque **el caso que no es obvio es el del final del bloque**: el
// motor se sale del rango `valid` a propósito para leer el primer valor del
// bloque SIGUIENTE (`panimvalue[panimvalue->num.valid + 2].value`), y quien lo
// escriba «bien» por su cuenta obtiene una animación que salta un fotograma de
// cada ocho — que se ve como un tirón y se echa a la tasa de refresco.
//
// ── El oráculo, que es lo que hace que esto se pueda hacer bien ────────────
//
// Cada `mstudioseqdesc_t` guarda la **caja envolvente de su secuencia**, escrita
// por el compilador con los vértices ya animados. Así que hay un juez dentro del
// archivo: animar la malla y comprobar que cabe en esa caja, fotograma a
// fotograma. Si la descompresión está mal, no cabe.
//
// Sin eso, un error aquí se ve como «el bicho camina un poco raro» y se da por
// bueno — que es exactamente cómo han sobrevivido los cinco fallos más caros de
// este experimento.

import { cuaternionDeEuler, matrizDe, componer, porMatriz } from "./mdl.js";

/** `mstudioseqdesc_t` mide 176 bytes y `mstudioanim_t` doce. */
export const TAM_SEQ = 176;
export const TAM_ANIM = 12;

/** Las banderas de una secuencia. La única que importa aquí es el bucle. */
export const SEQ = { bucle: 0x0001 };

/**
 * Los ejes que un `motiontype` saca del hueso y convierte en desplazamiento.
 *
 * `R_StudioCalcRotations()` acaba poniendo a CERO la componente del hueso de
 * movimiento en cada eje marcado. Es lo que separa «el bicho anda» de «el bicho
 * se desliza sin mover las patas»: el compilador mete el avance en la animación
 * y el motor se lo quita para dárselo a la entidad.
 */
export const MOTION = { X: 0x0001, Y: 0x0002, Z: 0x0004 };

const texto = (b, o, n) => b.subarray(o, o + n).toString("latin1").replace(/\0.*$/, "");

/** Las secuencias de un modelo, tal como las declara la cabecera. */
export function leerSecuencias(m) {
  const { buf, offSecuencias, nSecuencias } = m;
  const out = [];
  for (let i = 0; i < nSecuencias; i++) {
    const o = offSecuencias + i * TAM_SEQ;
    if (o + TAM_SEQ > buf.length) throw new Error(`${m.nombre}: la secuencia ${i} se sale del fichero`);
    const f = (k) => buf.readFloatLE(o + k);
    const l = (k) => buf.readInt32LE(o + k);
    out.push({
      indice: i,
      nombre: texto(buf, o, 32),
      fps: f(32),
      flags: l(36),
      bucle: (l(36) & SEQ.bucle) !== 0,
      actividad: l(40),
      // EL PESO DE LA ACTIVIDAD, que no es decorativo: cuando el script no
      // nombra la animación, el motor la busca POR ACTIVIDAD y entre las que
      // empatan sortea en proporción a este número (`LookupActivity`,
      // animation.cpp:81-106). Ver `src/play/actividad.js`.
      pesoActividad: l(44),
      nFotogramas: l(56),
      motiontype: l(68),
      motionbone: l(72),
      avance: [f(76), f(80), f(84)],
      // La caja que escribió el compilador con los vértices YA animados. Es el
      // oráculo de todo este archivo.
      bbmin: [f(96), f(100), f(104)],
      bbmax: [f(108), f(112), f(116)],
      nMezclas: l(120),
      animindex: l(124),
      grupo: l(156),
    });
  }
  return out;
}

/** Los huesos en crudo: padre, valores de reposo y escalas de compresión. */
export function leerHuesos(m) {
  const { buf, offHuesos, nHuesos } = m;
  const out = [];
  for (let i = 0; i < nHuesos; i++) {
    const o = offHuesos + i * 112;
    const padre = buf.readInt32LE(o + 32);
    if (padre >= i) throw new Error(`${m.nombre}: el hueso ${i} tiene de padre al ${padre}`);
    const valor = [], escala = [];
    for (let k = 0; k < 6; k++) {
      valor.push(buf.readFloatLE(o + 64 + k * 4));
      escala.push(buf.readFloatLE(o + 88 + k * 4));
    }
    out.push({ indice: i, nombre: texto(buf, o, 32), padre, valor, escala });
  }
  return out;
}

/**
 * El valor de un canal de un hueso en un fotograma, deshaciendo el RLE.
 *
 * Es el bucle de `R_StudioCalcBones()`, y devuelve los DOS valores que el motor
 * interpola: el del fotograma pedido y el del siguiente. El que llama decide qué
 * hacer con ellos — aquí se usan los dos porque las claves que se emiten a
 * Three.js son las de los fotogramas enteros.
 */
function canal(buf, offAnim, offsetCanal, frame) {
  // Un desplazamiento de cero quiere decir «este canal no está animado». No es
  // un error ni un cero: es que el hueso se queda en su valor de reposo, y en un
  // modelo de 112 huesos eso es la mayoría de los canales.
  if (offsetCanal === 0) return null;
  let p = offAnim + offsetCanal;
  let j = frame;
  const valid = () => buf.readUInt8(p);
  const total = () => buf.readUInt8(p + 1);
  const valorEn = (k) => buf.readInt16LE(p + k * 2);

  if (total() < valid()) j = 0;
  // Se salta de bloque en bloque hasta el que contiene el fotograma. Cada bloque
  // ocupa `valid + 1` enteros de 16 bits: la cabecera y sus valores.
  let vueltas = 0;
  while (total() <= j) {
    j -= total();
    p += (valid() + 1) * 2;
    if (++vueltas > 1e6) throw new Error("el RLE de una animación no termina");
    if (p + 2 > buf.length) throw new Error("el RLE de una animación se sale del fichero");
    if (total() < valid()) j = 0;
  }

  let v1, v2;
  if (valid() > j) {
    v1 = valorEn(j + 1);
    if (valid() > j + 1) v2 = valorEn(j + 2);
    else if (total() > j + 1) v2 = v1;
    // Y aquí el motor se sale del bloque A PROPÓSITO: lee el primer valor del
    // bloque siguiente. No es un desbordamiento, es cómo se encadenan.
    else v2 = valorEn(valid() + 2);
  } else {
    v1 = valorEn(valid());
    if (total() > j + 1) v2 = v1;
    else v2 = valorEn(valid() + 2);
  }
  return [v1, v2];
}

/**
 * Las claves de una secuencia: por hueso, una posición y un cuaternión por
 * fotograma.
 *
 * Devuelve lo que Three.js necesita para un `AnimationClip` sin volver a tocar
 * el archivo, y en el espacio LOCAL de cada hueso — que es lo que pide un
 * `Skeleton`, y lo que permite que el esqueleto se componga en la tarjeta en vez
 * de en Node.
 */
export function clavesDeSecuencia(m, seq, huesos) {
  const { buf } = m;
  if (seq.grupo !== 0) {
    throw new Error(
      `${m.nombre}: '${seq.nombre}' está en el grupo de secuencias ${seq.grupo}, que es otro fichero`
    );
  }
  const n = Math.max(1, seq.nFotogramas);
  const pistas = huesos.map(() => ({
    pos: new Float32Array(n * 3),
    rot: new Float32Array(n * 4),
  }));

  for (let h = 0; h < huesos.length; h++) {
    const hueso = huesos[h];
    // Cada hueso tiene su propio `mstudioanim_t` de 12 bytes, y los seis
    // desplazamientos que trae son RELATIVOS a ese `mstudioanim_t`, no al
    // principio de la secuencia. Tomarlos como absolutos no da error: da huesos
    // que leen la animación de otro hueso.
    const offAnim = seq.animindex + h * TAM_ANIM;
    for (let f = 0; f < n; f++) {
      const v = [];
      for (let k = 0; k < 6; k++) {
        const off = buf.readUInt16LE(offAnim + k * 2);
        const par = canal(buf, offAnim, off, f);
        v.push(par === null ? hueso.valor[k] : hueso.valor[k] + par[0] * hueso.escala[k]);
      }
      // El hueso de movimiento pierde las componentes que el `motiontype` marca:
      // el compilador metió el avance en la animación y el motor se lo quita
      // para dárselo a la entidad. Sin esto, el bicho anda Y se teletransporta.
      if (h === seq.motionbone) {
        if (seq.motiontype & MOTION.X) v[0] = 0;
        if (seq.motiontype & MOTION.Y) v[1] = 0;
        if (seq.motiontype & MOTION.Z) v[2] = 0;
      }
      pistas[h].pos[f * 3] = v[0];
      pistas[h].pos[f * 3 + 1] = v[1];
      pistas[h].pos[f * 3 + 2] = v[2];
      const q = cuaternionDeEuler(v[3], v[4], v[5]);
      pistas[h].rot[f * 4] = q[0];
      pistas[h].rot[f * 4 + 1] = q[1];
      pistas[h].rot[f * 4 + 2] = q[2];
      pistas[h].rot[f * 4 + 3] = q[3];
    }
    // Los cuaterniones se alinean a lo largo de la pista, como hace
    // `QuaternionAlign()` antes de cada `slerp`: dos claves consecutivas que
    // apuntan a hemisferios opuestos representan la misma rotación, pero
    // interpoladas dan **la vuelta larga**. Eso se ve como un brazo que gira 350°
    // en un fotograma, y no da error.
    for (let f = 1; f < n; f++) {
      const a = (f - 1) * 4, b = f * 4;
      let dot = 0;
      for (let k = 0; k < 4; k++) dot += pistas[h].rot[a + k] * pistas[h].rot[b + k];
      if (dot < 0) for (let k = 0; k < 4; k++) pistas[h].rot[b + k] = -pistas[h].rot[b + k];
    }
  }
  return pistas;
}

/**
 * Las matrices de hueso en el espacio del MODELO para un fotograma.
 *
 * Es lo que hace falta para comprobar el oráculo sin navegador: se compone la
 * jerarquía igual que `huesosDe()` hace con la postura de reposo.
 */
export function matricesEnFotograma(pistas, huesos, frame) {
  const out = [];
  for (let h = 0; h < huesos.length; h++) {
    const p = pistas[h].pos, r = pistas[h].rot;
    const f = Math.min(frame, p.length / 3 - 1);
    const local = matrizDe(
      [r[f * 4], r[f * 4 + 1], r[f * 4 + 2], r[f * 4 + 3]],
      [p[f * 3], p[f * 3 + 1], p[f * 3 + 2]]
    );
    const padre = huesos[h].padre;
    out.push(padre < 0 ? local : componer(out[padre], local));
  }
  return out;
}

/**
 * EL ORÁCULO: los vértices animados tienen que caber en la caja de la secuencia.
 *
 * `vertices` es `[{hueso, v:[x,y,z]}]` en el espacio de su hueso, que es como
 * están en el archivo. Se animan fotograma a fotograma y se compara con el
 * `bbmin`/`bbmax` que el compilador escribió para esa secuencia.
 *
 * El margen no es cero y se dice por qué: el compilador redondea la caja a
 * enteros y la calcula sobre el submodelo por defecto de cada `bodypart`, y un
 * modelo con varias opciones de cuerpo puede tener un brazo más largo en otra.
 * Lo que este juez caza no es un vértice de más: es una descompresión rota, que
 * manda los huesos a cientos de unidades de su sitio.
 */
export function cabeEnLaCaja(seq, pistas, huesos, vertices, { margen = 4 } = {}) {
  let peor = 0, fuera = 0, total = 0;
  const n = Math.max(1, seq.nFotogramas);
  for (let f = 0; f < n; f++) {
    const M = matricesEnFotograma(pistas, huesos, f);
    for (const { hueso, v } of vertices) {
      const w = porMatriz(M[hueso] ?? M[0], v);
      total++;
      let d = 0;
      for (let k = 0; k < 3; k++) {
        d = Math.max(d, seq.bbmin[k] - w[k], w[k] - seq.bbmax[k]);
      }
      if (d > margen) fuera++;
      if (d > peor) peor = d;
    }
  }
  return { cabe: fuera === 0, fuera, total, peor };
}

/**
 * EL ORÁCULO DE LA RIGIDEZ: un hueso gira, no se estira.
 *
 * ── Por qué hay un segundo juez, y no es por gusto ──────────────────────────
 *
 * `cabeEnLaCaja` se fía de una caja que escribió el compilador, y **hay
 * archivos cuya caja no describe su propia malla**. `human/reference.mdl` —el
 * modelo que usa la pantalla de elegir personaje— es uno: con la malla que él
 * mismo trae, 44 de sus 65 secuencias se salen de su caja, y la peor por 27,7
 * unidades. Medido, y no es nuestra lectura:
 *
 *     male1.mdl      58/58 caben, el peor a 0,0 u
 *     female1.mdl    45/45 caben, el peor a 0,0 u
 *     reference.mdl  21/65 caben, el peor a 27,7 u
 *
 * Las tres hipótesis que se comprobaron y murieron: que las cajas estuvieran
 * copiadas de `male1.mdl` (0 de 22 secuencias comunes tienen la misma caja),
 * que describieran otro `body` (ninguno de los diez probados da 65/65; el mejor
 * es 63/65), y que la malla fuera distinta (en espacio de hueso las dos miden
 * lo mismo, ±2 unidades).
 *
 * Así que para ese archivo hace falta un juez que **no lea sus cajas**. Éste
 * mide la única cosa que una animación de esqueleto no puede romper: la
 * distancia de cada hueso a su padre es la misma en todos los fotogramas,
 * porque lo que la animación cambia es el giro. Y distingue, con sus dos
 * controles medidos:
 *
 *                      como lo leemos     sin la escala de compresión
 *     male1.mdl           6,410 u                1641,0 u
 *     female1.mdl         0,902 u                 815,4 u
 *     reference.mdl       2,911 u                 815,4 u
 *
 * `reference.mdl` sale **mejor que el modelo que sí pasa el oráculo de la
 * caja**. Entre lo bueno y lo roto hay tres órdenes de magnitud, así que el
 * umbral no hay que afinarlo.
 *
 * La raíz se excluye porque ésa SÍ se mueve: es por donde el compilador metió
 * el avance del salto y de la carrera. Los 6,4 u de `male1.mdl` son la pelvis
 * en `jump`, o sea el salto, no un fallo.
 */
export function rigidezDeModelo(m, huesos, secuencias = null) {
  const secs = secuencias ?? leerSecuencias(m);
  let peor = 0, donde = null, suma = 0, n = 0;
  for (const s of secs) {
    const pistas = clavesDeSecuencia(m, s, huesos);
    const nf = Math.max(1, s.nFotogramas);
    for (let h = 0; h < huesos.length; h++) {
      if (huesos[h].padre < 0) continue;
      const p = pistas[h].pos;
      let min = Infinity, max = -Infinity;
      for (let f = 0; f < nf; f++) {
        const d = Math.hypot(p[f * 3], p[f * 3 + 1], p[f * 3 + 2]);
        if (d < min) min = d;
        if (d > max) max = d;
      }
      const v = max - min;
      suma += v; n++;
      if (v > peor) { peor = v; donde = `${s.nombre}/${huesos[h].nombre}`; }
    }
  }
  return { peor, donde, media: n ? suma / n : 0, huesos: n };
}

/**
 * El umbral de la rigidez, en unidades.
 *
 * Diez unidades son 25 cm, más de lo que estira cualquier salto de los tres
 * modelos humanos (el peor es 6,4) y ochenta veces menos que lo que da la
 * descompresión rota (815). No separa por poco.
 */
export const RIGIDO = 10;

/**
 * Cuánto se mueve de verdad un modelo, en unidades de GoldSrc.
 *
 * ── Por qué hace falta preguntarlo, y por qué la primera medida mintió ──────
 *
 * «Animar los adornos» parecía un trabajo de 101 objetos y son 10.
 *
 * De los 17 `.mdl` que Gate City coloca, **catorce no se mueven ni un
 * milímetro** — y no es que les falte la secuencia: `props/cart.mdl` declara una
 * de 101 fotogramas y `misc/chair.mdl` una de 7, y las dos dejan los vértices
 * exactamente donde estaban. Una secuencia larga no es movimiento.
 *
 * La primera sonda midió el ORIGEN DE CADA HUESO entre fotogramas y dijo que no
 * se movía ninguno, incluido el árbol. Y es que un árbol de cuatro huesos que se
 * mece gira el de la raíz: el origen del hueso se queda donde está y la copa se
 * va ocho centímetros. **La pregunta se le hace al VÉRTICE, que es lo que se
 * ve.** Es el mismo error que la sonda que medía luminancia para juzgar el
 * bobinado: bien escrita, y midiendo otra cosa.
 *
 * `verts` son los crudos del archivo, cada uno con su hueso, tal y como los da
 * `mallaDe` antes de posarlos.
 */
export function recorridoDeModelo(m, huesos, verts) {
  const secuencias = leerSecuencias(m);
  let peor = 0, cual = null;
  for (const s of secuencias) {
    if (s.nFotogramas < 2) continue;
    const pistas = clavesDeSecuencia(m, s, huesos);
    const base = matricesEnFotograma(pistas, huesos, 0);
    const p0 = verts.map((v) => porMatriz(base[v.hueso] ?? base[0], v.p));
    let suyo = 0;
    for (let f = 1; f < s.nFotogramas; f++) {
      const M = matricesEnFotograma(pistas, huesos, f);
      for (let i = 0; i < verts.length; i++) {
        const q = porMatriz(M[verts[i].hueso] ?? M[0], verts[i].p);
        const d = Math.hypot(q[0] - p0[i][0], q[1] - p0[i][1], q[2] - p0[i][2]);
        if (d > suyo) suyo = d;
      }
    }
    if (suyo > peor) { peor = suyo; cual = s; }
  }
  return { recorrido: peor, secuencia: cual };
}

/**
 * El umbral, en unidades, por debajo del cual un adorno se hornea quieto.
 *
 * Media unidad son **1,3 cm** a 39,37 u/m: por debajo de eso no hay nada que
 * mirar, y pagar un esqueleto y una malla aparte por 1,3 cm es cambiar 91
 * objetos de una malla fundida a 91 `drawcalls` para nada.
 */
export const SE_MUEVE = 0.5;
