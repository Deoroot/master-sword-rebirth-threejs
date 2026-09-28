// La gamma del motor, copiada del motor. Ya no se calibra a ojo.
//
// ── Por qué este archivo existe ─────────────────────────────────────────────
//
// Porque la iluminación de este mapa se ajustó tres veces a ojo y las tres mal.
// Primero una rampa sólo en el mapa de luz —el 79,7 % de la superficie por debajo
// de 32 sobre 255—; luego la misma rampa en las texturas y se quitó por «lavado»;
// luego se volvió a poner y se pasó al otro lado. Medida contra una captura del
// juego, la nuestra estaba a **mediana 80 contra 32**: dos veces y media de más.
//
// Y entonces apareció lo que faltaba: **el juego instalado y su código fuente**.
//
//   C:\Juegos\MSR\msr\config.cfg                     gamma "3"  brightness "2"
//   C:\Juegos\MSR\msr\opengl.cfg                     gl_overbright "0"
//   C:\Juegos\Steam\...\msrebirth\msr\config.cfg     lo mismo, y
//                                                    gl_texturemode "GL_LINEAR_MIPMAP_LINEAR"
//   ...\MSC\xash3d-fwgs-sdk\engine\client\gamma.c    BuildGammaTable()
//   ...\MSC\xash3d-fwgs-sdk\ref\gl\gl_rsurf.c        R_BuildLightMap()
//
// Las dos instalaciones —la de GoldSrc y el port a Xash3D— dan **exactamente los
// mismos valores**, así que no hay que elegir cuál.
//
// Lo que sigue es `BuildGammaTable()` traducido línea a línea. No es una
// aproximación ni una rampa con un exponente elegido: es la función del motor.
//
// ── Lo que esto tira a la basura, y bien tirado ─────────────────────────────
//
//   `RAMPA`            un exponente 2,8 elegido comparando capturas a ojo.
//   `RAMPA_TEXTURA`    otro, 2,8, elegido por un barrido con dos varas.
//   `OVERBRIGHT = 2`   razonado del formato... y el juego lo lleva APAGADO.
//
// Los tres razonamientos eran defendibles y los tres daban un número distinto del
// real. Es el argumento entero de por qué la referencia importa más que el
// razonamiento: **no hay forma de deducir `gl_overbright 0` leyendo un `.bsp`.**

/**
 * Los ajustes con los que corre Master Sword Rebirth.
 *
 * `gamma` y `brightness` salen de su `config.cfg`; `texgamma` y `lightgamma` no
 * están en el fichero, así que valen lo que declara `gamma.c` de fábrica. El
 * motor además los recorta a [1,8, 3] y `brightness` a [0, 3] — ver
 * `V_ValidateGammaCvars()`.
 */
export const AJUSTES = {
  gamma: 3.0,        // config.cfg
  brightness: 2.0,   // config.cfg
  texgamma: 2.0,     // gamma.c, valor de fábrica
  lightgamma: 2.5,   // gamma.c, valor de fábrica
  overbright: false, // opengl.cfg: gl_overbright "0"
};

const acota = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Los topes del motor, de `V_ValidateGammaCvars()` en `gamma.c:90-104`.
 *
 * Los mismos que enseñan los dos deslizadores de la pestaña Video: 1,8 a 3 el
 * uno y 0 a 3 el otro. Que el deslizador y el motor recorten igual es la
 * comprobación de que la escala de la ventana no es inventada.
 */
export const LIMITES = Object.freeze({ gamma: [1.8, 3], brillo: [0, 3] });

/** Los ajustes con `gamma` y `brillo` recortados como los recorta el motor. */
export function validar({ gamma, brillo }, base = AJUSTES) {
  return {
    ...base,
    gamma: acota(Number(gamma ?? base.gamma), ...LIMITES.gamma),
    brightness: acota(Number(brillo ?? base.brightness), ...LIMITES.brillo),
  };
}

/**
 * LA TABLA QUE LLEVA UN ATLAS YA HORNEADO AL QUE SALDRÍA CON OTRA GAMMA.
 *
 * ── Por qué hace falta, y por qué sólo el mapa de luz ──────────────────────
 *
 * Mover el brillo o la gamma en el motor no es un filtro encima de la pantalla:
 * `V_CheckGamma()` reconstruye estas tablas y llama a `R_GammaChanged(false)`,
 * que hace exactamente una cosa —
 *
 *     glConfig.softwareGammaUpdate = true;
 *     GL_RebuildLightmaps();
 *                                          ref/gl/gl_rmain.c:1017-1021
 *
 * — **rehacer los mapas de luz**. Las texturas del mundo NO se vuelven a subir:
 * se quedan con la `texgamma` que tenían al cargarse, y por eso la pestaña Video
 * lleva su nota de «hay que reiniciar». O sea que aquí basta con rehacer el
 * atlas, y que las texturas no cambien no es un recorte nuestro: es el motor.
 *
 * ── Y por qué es una tabla y no un horneado ────────────────────────────────
 *
 * El motor rehornea desde el lump de luz crudo. Nosotros en el navegador no lo
 * tenemos: tenemos el atlas ya horneado, que guarda `luz[i] >> 2`. Así que se
 * deshace y se vuelve a hacer:
 *
 *     byte del atlas ──(inversa de la tabla vieja)──► i ──(tabla nueva)──► byte
 *
 * La inversa no es exacta porque 1024 índices caben en 256 bytes, y eso se mide
 * en vez de darse por bueno: `error()` compara esta tabla con el horneado de
 * verdad. Con las dos iguales tiene que salir la identidad, y ése es el control.
 *
 * Los bytes que ningún `i` produce se rellenan interpolando entre los vecinos
 * que sí: dejarlos a cero abriría rayas negras en el atlas justo donde el
 * remapeo no tiene nada que decir.
 */
export function remapearLuz(viejos, nuevos) {
  const A = tablasDeGamma(viejos).luz;
  const B = tablasDeGamma(nuevos).luz;
  const suma = new Float64Array(256);
  const cuantos = new Uint32Array(256);
  for (let i = 0; i < 1024; i++) {
    const v = A[i] >> 2;
    suma[v] += B[i] >> 2;
    cuantos[v]++;
  }
  const lut = new Uint8Array(256);
  const sabidos = [];
  for (let v = 0; v < 256; v++) {
    if (!cuantos[v]) continue;
    lut[v] = Math.round(suma[v] / cuantos[v]);
    sabidos.push(v);
  }
  if (!sabidos.length) return lut;
  let k = 0;
  for (let v = 0; v < 256; v++) {
    if (cuantos[v]) continue;
    while (k + 1 < sabidos.length && sabidos[k + 1] <= v) k++;
    const a = sabidos[k] < v ? sabidos[k] : null;      // el sabido de la izquierda
    const b = sabidos[k] > v ? sabidos[k] : sabidos[k + 1] ?? null;
    if (a === null) { lut[v] = lut[b]; continue; }     // antes del primero
    if (b === null) { lut[v] = lut[a]; continue; }     // después del último
    lut[v] = Math.round(lut[a] + (lut[b] - lut[a]) * ((v - a) / (b - a)));
  }
  return lut;
}

/**
 * Cuánto se equivoca `remapearLuz` contra volver a hornear de verdad.
 *
 * Recorre los 1024 índices del motor —que es por donde pasa cada luxel— y mide
 * la diferencia en bytes de 0 a 255 entre lo que da la tabla y lo que daría
 * `pintarAtlas()` con la gamma nueva. Va al informe; no se adivina.
 */
export function errorDeRemapeo(viejos, nuevos) {
  const A = tablasDeGamma(viejos).luz;
  const B = tablasDeGamma(nuevos).luz;
  const lut = remapearLuz(viejos, nuevos);
  let peor = 0, suma = 0;
  for (let i = 0; i < 1024; i++) {
    const d = Math.abs(lut[A[i] >> 2] - (B[i] >> 2));
    if (d > peor) peor = d;
    suma += d;
  }
  return { peor, medio: suma / 1024 };
}

/**
 * `BuildGammaTable()` de `engine/client/gamma.c`, tal cual.
 *
 * Devuelve las dos tablas que hacen falta:
 *
 *   `tex`   256 entradas. Se aplica a la PALETA de cada textura al cargarla, y
 *           eso incluye las de los `.mdl` — ver `l_studio.cpp` en el motor, que
 *           pasa `texgammatable` por los píxeles de los modelos igual que
 *           `model.cpp` lo pasa por los del mapa.
 *   `luz`   1024 entradas. Se aplica al mapa de luz ya sumado y escalado.
 *
 * El tramo raro del medio —`g3`, el `if (f <= g3)`— es un codo: aplasta el
 * extremo oscuro en una recta y deja el resto en una curva. Es lo que hace que
 * `brightness` levante las sombras sin lavar el resto, y es exactamente la parte
 * que una rampa de un solo exponente no sabe hacer. Con `brightness 2` el codo
 * está en 0,05 y además la curva se multiplica por 2 antes de él.
 */
export function tablasDeGamma(a = AJUSTES) {
  const { gamma, brightness, texgamma, lightgamma } = a;
  const g1 = gamma !== 0 ? 1 / gamma : 0.4;
  const g2 = g1 * texgamma;
  const g3 = brightness <= 0 ? 0.125
    : brightness <= 1 ? 0.125 - brightness * brightness * 0.075
      : 0.05;

  const tex = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    tex[i] = acota(Math.floor(Math.pow(i / 255, g2) * 255), 0, 255);
  }

  const luz = new Uint16Array(1024);
  for (let i = 0; i < 1024; i++) {
    let f = Math.pow(i / 1023, lightgamma);
    if (brightness > 1) f *= brightness;
    if (f <= g3) f = (f / g3) * 0.125;
    else f = ((f - g3) / (1 - g3)) * 0.875 + 0.125;
    luz[i] = acota(Math.floor(Math.pow(f, g1) * 1023), 0, 1023);
  }

  return { tex, luz, ...escalas(a) };
}

/**
 * `lightscale`, de `R_BuildLightMap()` en `ref/gl/gl_rsurf.c`:
 *
 *     if (gl_overbright) lightscale = 256;
 *     else               lightscale = pow(2, 1/lightgamma) * 256 + 0.5;
 *
 * O sea que **apagar el overbright no quita el factor dos: lo suaviza**. Con
 * `lightgamma 2,5` sale `2^0,4 × 256 = 338`, que es un 32 % en vez de un 100 %.
 * Ése es el número que yo tenía a 512 (el ×2 entero) y que hacía el mapa el doble
 * de claro de lo que el juego lo enseña.
 *
 * `ESTILO_NORMAL` es `tr.lightstylevalue` para un estilo fijo: el motor guarda
 * `mapa[0] * 22` y el estilo 0 es la letra `m`, que vale 12. Ver
 * `ref/gl/gl_rlight.c`: «'m' is normal light, 'a' is no light, 'z' is double
 * bright».
 */
export function escalas(a = AJUSTES) {
  return {
    lightscale: a.overbright ? 256 : Math.floor(Math.pow(2, 1 / a.lightgamma) * 256 + 0.5),
  };
}

/** El valor de un estilo de luz, que es `letra × 22`. */
export const ESTILO_NORMAL = 12 * 22;

/**
 * Los patrones de los estilos animados de Half-Life, y su valor MEDIO.
 *
 * El motor cambia `lightstylevalue` diez veces por segundo recorriendo la cadena;
 * un atlas horneado no puede parpadear, así que se hornea el valor medio. No es
 * el estilo 0: el 1 promedia 12,83 y el 6 promedia 13,12 sobre los 12 del fijo,
 * o sea un 7 % y un 9 % más claros. Con 8 842 y 3 368 bloques, eso no es ruido.
 *
 * Las cadenas son del motor, no del mapa: el `.bsp` sólo guarda el número de
 * estilo.
 */
export const PATRONES = {
  0: "m",
  1: "mmnmmommommnonmmonqnmmo",
  2: "abcdefghijklmnopqrstuvwxyzyxwvutsrqponmlkjihgfedcba",
  3: "mmmmmaaaaammmmmaaaaaabcdefgabcdefg",
  4: "mamamamamama",
  5: "jklmnopqrstuvwxyzyxwvutsrqponmlkj",
  6: "nmonqnmomnmomomno",
  7: "mmmaaaabcdefgmmmmaaaammmaamm",
  8: "mmmaaaammmaaammmabcdefaaaammmmabcdefmmmaaaa",
  9: "aaaaaaaazzzzzzzz",
  10: "mmamammmmammamamaaamammma",
  11: "abcdefghijklmnopqrrqponmlkjihgfedcba",
};

/** El valor medio de un estilo, en las unidades de `lightstylevalue`. */
export function valorDeEstilo(estilo) {
  const p = PATRONES[estilo];
  if (!p) return ESTILO_NORMAL;
  let s = 0;
  for (const c of p) s += c.charCodeAt(0) - 97;
  return (s / p.length) * 22;
}

/** Los estilos que de verdad se mueven: su cadena tiene más de una letra. */
export function estilosAnimados() {
  return Object.keys(PATRONES)
    .map(Number)
    .filter((e) => new Set(PATRONES[e]).size > 1)
    .sort((a, b) => a - b);
}

/**
 * Los valores DISTINTOS por los que pasa un estilo, en unidades de
 * `lightstylevalue`. Son `letra × 22`, y se ordenan para que el índice de
 * variante sea estable entre ejecuciones.
 */
export function valoresDeEstilo(estilo) {
  const p = PATRONES[estilo];
  if (!p) return [ESTILO_NORMAL];
  return [...new Set([...p].map((c) => (c.charCodeAt(0) - 97) * 22))].sort((a, b) => a - b);
}

/**
 * El cubo de una cara: qué estilos animados lleva, ordenados. `[]` es quieta.
 *
 * Se mira el array `estilos` entero y no sólo el primero. 3 171 caras de Gate
 * City llevan los DOS estilos animados, y son las que obligan a que el cubo sea
 * un conjunto y no una etiqueta.
 */
export function cuboDeCara(cara, animados = null) {
  const anim = new Set(animados ?? estilosAnimados());
  return [...new Set(cara.estilos.filter((e) => anim.has(e)))].sort((a, b) => a - b);
}

/** La clave de texto de un cubo, que es la que va al manifiesto. */
export function claveDeCubo(cubo) {
  return cubo.length ? cubo.join("+") : "quieta";
}

/**
 * Las variantes de un cubo: el producto cartesiano de los valores de sus
 * estilos. Devuelve una lista de objetos `{estilo: valor}`, en orden estable.
 */
export function variantesDeCubo(cubo) {
  // El primer estilo del cubo es el dígito MENOS significativo, que es como lo
  // cuenta `varianteEnT`. Si los dos no usan el mismo orden el parpadeo funciona
  // igual de bien y enseña la variante de otra cara: un fallo que no da error.
  let out = [{}];
  for (const e of cubo) {
    const siguiente = [];
    for (const v of valoresDeEstilo(e)) for (const base of out) siguiente.push({ ...base, [e]: v });
    out = siguiente;
  }
  return out;
}

/**
 * En qué variante está cada cubo en el instante `t`, en segundos.
 *
 * `CL_RunLightStyles()` en `ref/gl/gl_rlight.c`, línea a línea:
 *
 *     flight = (int)Q_floor( ls[i].time * 10 );
 *     tr.lightstylevalue[i] = ls[i].map[flight % ls[i].length] * 22;
 *
 * Diez pasos por segundo y **sin interpolar**, porque el juego corre con
 * `cl_lightstyle_lerping "0"`. Salta, y saltar es lo que se ve.
 */
export function varianteEnT(cubo, t) {
  const paso = Math.floor(t * 10);
  let indice = 0, peso = 1;
  for (const e of cubo) {
    const p = PATRONES[e];
    const valor = (p[((paso % p.length) + p.length) % p.length].charCodeAt(0) - 97) * 22;
    const lista = valoresDeEstilo(e);
    indice += lista.indexOf(valor) * peso;
    peso *= lista.length;
  }
  return indice;
}
