// El mapa de luz horneado: 2,03 MB de luz precalculada, y la parte que decide
// si esta pila puede poner en pantalla lo que Gate City pone.
//
// ── Por qué es ESTA parte y no las texturas ─────────────────────────────────
//
// Porque ninguna cantidad de luces dinámicas sin sombra la iguala. El jharro
// lleva 58 luces puntuales y por eso cada superficie recibe luz suave y pareja y
// no hay una sola esquina oscura ni un solo contacto marcado. Un mapa de luz no
// es más luz: es luz que sabe qué tapa a qué, y eso es geometría, no iluminación.
//
// ── Cómo se guarda ──────────────────────────────────────────────────────────
//
// Un parche por cara, y el parche no está en ninguna tabla: se CALCULA. Se
// proyectan los vértices sobre los ejes S y T del `texinfo`, se toman el mínimo y
// el máximo, se dividen entre 16 —el espaciado de luxel—, se redondean hacia
// abajo y hacia arriba, y el tamaño es la diferencia **más uno** en cada eje.
// Los datos son RGB de 8 bits, en el orden de los `styles` que no son 255.
//
// Las tres trampas de este lump, y las tres dan resultados «casi correctos»:
//
//   el «+1»      un desfase de uno da mapas de luz desplazados medio luxel: se
//                ven bien en una captura y mal en movimiento.
//   `lightofs`   vale −1 cuando no hay mapa de luz. Y además hay 996 caras con
//                un `lightofs` válido y los `styles` a 255, que tampoco lo
//                tienen: ver `tieneLuz()` en el lector.
//   el `float`   la proyección se acumula en 32 bits, no en doble. Ver `proyS()`.
//
// Ninguna de las tres la caza una captura. Las tres las caza el mismo control:
// **los bloques tienen que encajar sin solaparse y sumar los bytes del lump.**

import { parcheDeLuz, tieneLuz, proyS, proyT, LUXEL } from "./lector.js";
import { tablasDeGamma, valorDeEstilo, AJUSTES } from "./gamma.js";

/** Cuánto ocupa el bloque de una cara, en bytes. */
export function bytesDeCara(cara) {
  if (!tieneLuz(cara)) return 0;
  const p = parcheDeLuz(cara.puntos, cara.texinfo);
  return p.ancho * p.alto * 3 * cara.nEstilos;
}

/**
 * La contabilidad del lump, que es la sonda con oráculo de esta parte.
 *
 * No mide «parece razonable»: mide contra un número que está escrito en el
 * archivo. Los bloques de las caras con mapa de luz tienen que encajar **sin
 * pisarse, sin dejar huecos entre medias y sin salirse del lump**. Si uno no
 * encaja, lo que se está leyendo mal es el tamaño de los parches — o sea el
 * mapa de luz entero, desplazado.
 *
 * ── LA COLA, y por qué dejó de ser un fallo (experimento 48) ────────────────
 *
 * Hasta el 48 esto exigía además que la suma **fuera** el tamaño del lump, y
 * con eso Edana no se horneaba: sumaba 1 544 688 contra 1 545 495, 807 bytes de
 * menos. Los 807 resultaron ser **ceros al final del lump que ninguna cara
 * reclama**, y el censo de los 93 mapas del juego dice que no es de Edana: 36
 * los tienen, de 363 a 2 928 bytes, todos ceros y todos múltiplo de tres.
 *
 * El motor no los ve. `Mod_LoadLighting` copia el lump entero de una vez
 * (`ReHLDS/rehlds/engine/model.cpp:651-658`) y a partir de ahí cada superficie
 * entra por su `lightofs`: **nadie suma los bloques**. Un byte que nadie
 * reclama no lo lee nadie.
 *
 * Así que la cola se mide y se permite, pero **sólo si es toda ceros**, y para
 * eso hace falta `datos`. Sin `datos` una cola no se puede comprobar y no
 * cuadra: la ignorancia no se pone verde sola.
 */
export function contabilidad(caras, bytesDelLump, datos = null) {
  const con = caras.filter(tieneLuz).sort((a, b) => a.lightofs - b.lightofs);
  let bytes = 0, luxels = 0, solapes = 0, huecos = 0, desbordan = 0, mayor = 0, fin = 0;
  for (let i = 0; i < con.length; i++) {
    const p = parcheDeLuz(con[i].puntos, con[i].texinfo);
    const tam = p.ancho * p.alto * 3 * con[i].nEstilos;
    bytes += tam;
    luxels += p.ancho * p.alto;
    mayor = Math.max(mayor, p.ancho, p.alto);
    fin = con[i].lightofs + tam;
    if (fin > bytesDelLump) desbordan++;
    // El hueco contra el SIGUIENTE bloque. El último no tiene siguiente: lo que
    // le quede por detrás es la cola, y se juzga aparte.
    if (i + 1 < con.length) {
      const sitio = con[i + 1].lightofs - con[i].lightofs;
      if (sitio < tam) solapes++;
      else if (sitio > tam) huecos++;
    }
  }
  const cola = con.length ? bytesDelLump - fin : bytesDelLump;
  // `null` es «no se ha podido mirar», que no es lo mismo que `false`.
  let colaCeros = cola > 0 ? null : true;
  if (cola > 0 && datos) {
    colaCeros = true;
    for (let i = bytesDelLump - cola; i < bytesDelLump; i++) {
      if (datos[i] !== 0) { colaCeros = false; break; }
    }
  }
  return {
    caras: con.length,
    sinLuz: caras.length - con.length,
    sinLuzPorMenosUno: caras.filter((c) => c.lightofs < 0).length,
    sinLuzPorEstilos: caras.filter((c) => c.lightofs >= 0 && c.estilos[0] === 255).length,
    bytes,
    bytesDelLump,
    sobran: bytes - bytesDelLump,
    luxels,
    solapes,
    huecos,
    desbordan,
    cola,
    colaCeros,
    parcheMayor: mayor,
    cuadra: solapes === 0 && huecos === 0 && desbordan === 0 && colaCeros === true,
  };
}

/**
 * Empaqueta los parches de todas las caras en un atlas y devuelve dónde cayó
 * cada uno.
 *
 * Reparte por bandas —«skyline» de una sola pasada, con los parches ordenados de
 * alto a bajo— que para 14 527 rectángulos de entre 2 y 17 luxels deja
 * desperdicio de sobra bajo el 10 %. No hace falta nada mejor: el atlas se
 * hornea una vez en Node.
 *
 * `MARGEN` es un luxel de borde alrededor de cada parche, y no es opcional: el
 * filtro bilineal del atlas mezcla el borde de un parche con el de su vecino, y
 * eso pinta el suelo de una sala con la luz del pasillo de al lado. Se rellena
 * repitiendo el borde, no con negro, que dejaría una línea oscura alrededor de
 * cada cara.
 */
export const MARGEN = 1;

// Aquí vivían `RAMPA`, `RAMPA_TEXTURA`, `rampa()` y `OVERBRIGHT`: cuatro
// constantes de iluminación elegidas comparando capturas a ojo y razonando sobre
// el formato. Las cuatro estaban mal, y no por poco — el overbright estaba a ×2 y
// el juego lo lleva apagado.
//
// Las sustituye `src/bsp/gamma.js`, que es `BuildGammaTable()` del motor con los
// ajustes con los que corre Master Sword Rebirth, leídos de su `config.cfg`. Ver
// el encabezado de ese archivo: es el argumento entero de por qué una referencia
// vale más que un razonamiento.

// ── EL PARPADEO: por qué son CUBOS de caras y no un atlas que se recalcula ──
//
// Un mapa de luz horneado no puede parpadear, y durante dos experimentos ésa fue
// la excusa. Lo que lo destraba es una cuenta, no una técnica.
//
// El motor hace, por téxel (`R_BuildLightMap`):
//
//     suma = Σ  lightstylevalue[estilo_e] · luxel_e
//     out  = rampa[ suma · lightscale >> 14 ]
//
// y `lightstylevalue` cambia diez veces por segundo. La rampa va DESPUÉS de la
// suma, así que **no se pueden sumar atlas ya horneados**: `rampa(a) + rampa(b)`
// no es `rampa(a + b)`. Eso es lo que obligaría a un shader… si hubiera que
// sumar en tiempo real.
//
// Pero no hay que sumar: hay que ELEGIR. El valor de un estilo es `letra × 22`,
// y las cadenas sólo usan unas pocas letras distintas. En Gate City:
//
//     estilo 1  "mmnmmommommnonmmonqnmmo"   letras m n o q  ->  4 valores
//     estilo 6  "nmonqnmomnmomomno"         letras m n o q  ->  4 valores
//
// O sea que el ciclo combinado de 391 pasos (39,1 s) pasa por **16 estados
// distintos y nada más**. Se hornean los 16 y por fotograma se cambia la textura
// de sitio. Sin shader, sin material propio, y EXACTO — no es una aproximación
// del parpadeo, es el parpadeo.
//
// Y para que no sean 16 atlas enteros (64 MB), las caras se reparten en CUBOS
// por el conjunto de estilos animados que llevan. Una cara que sólo tiene el 1
// no necesita 16 variantes: necesita 4. Medido en este mapa:
//
//     cubo     caras   atlas      variantes    MB
//     1        5 671   512×1024       4         8,0
//     quieta   5 488   512×1024       1         2,0
//     1+6      3 171   512×512       16        16,0
//     6          197   128×128        4         0,3   -> 26,3 MB contra 64
//
// Cada cubo es su propio atlas y su propio material. Un vértice pertenece a una
// cara y una cara a un cubo, así que la `uv1` sigue siendo un solo atributo y no
// se duplica ni un vértice.

// Las funciones del ciclo de parpadeo viven en `gamma.js` y se re-exportan aquí
// por comodidad: `luz.js` arrastra `lector.js`, que usa `node:fs`, y el VISOR
// necesita `varianteEnT` en el navegador. Importarla desde aquí rompía la
// página entera con «Module "node:fs" has been externalized».
export {
  estilosAnimados, valoresDeEstilo, cuboDeCara, claveDeCubo, variantesDeCubo, varianteEnT,
} from "./gamma.js";

export function empaquetar(caras, { ancho = 1024 } = {}) {
  const items = caras
    .filter(tieneLuz)
    .map((c) => {
      const p = parcheDeLuz(c.puntos, c.texinfo);
      return { cara: c, ...p, w: p.ancho + MARGEN * 2, h: p.alto + MARGEN * 2 };
    })
    .sort((a, b) => b.h - a.h || b.w - a.w);

  // Si un parche no cabe de ancho, el atlas no puede ser de este ancho. Con 17
  // de máximo y 1 024 de ancho no pasa, pero un `.bsp` con otro `TEXTURE_STEP`
  // sí podría, y entonces el parche se emitiría recortado sin avisar.
  const nocabe = items.find((i) => i.w > ancho);
  if (nocabe) {
    throw new Error(
      `un parche de ${nocabe.w} luxels no cabe en un atlas de ${ancho}: sube el ancho`
    );
  }

  let x = 0, y = 0, altoBanda = 0;
  for (const it of items) {
    if (x + it.w > ancho) { y += altoBanda; x = 0; altoBanda = 0; }
    it.x = x + MARGEN;
    it.y = y + MARGEN;
    x += it.w;
    altoBanda = Math.max(altoBanda, it.h);
  }
  const alto = y + altoBanda;

  return {
    items,
    ancho,
    // Se sube a potencia de dos: los mipmaps de un atlas de mapa de luz no se
    // usan, pero una textura no cuadrada de tamaño raro es la clase de cosa que
    // en algún driver sale con un píxel de desfase.
    alto: Math.max(1, 1 << Math.ceil(Math.log2(Math.max(1, alto)))),
    altoUsado: alto,
    // Cuánto del atlas es parche y cuánto es margen y hueco. Sirve para decir
    // con una cifra si el empaquetado es razonable, sin mirar la imagen.
    ocupacion: items.reduce((a, i) => a + i.ancho * i.alto, 0) / (ancho * Math.max(1, alto)),
  };
}

/**
 * Pinta el atlas: los luxels de cada parche en su sitio, con el borde repetido.
 *
 * ── Se SUMAN los estilos, y el primer intento no lo hacía ───────────────────
 *
 * Una cara guarda un bloque por cada `style` que no sea 255, uno detrás de otro.
 * Leer sólo el primero parecía lo razonable —«el estilo 0 es la luz fija»— y es
 * falso dos veces:
 *
 *   1. En Gate City **2 795 caras tienen `styles[0] = 1`**, no 0. O sea que su
 *      primer bloque ya es una luz parpadeante, y la idea de «el bloque 0 es el
 *      estilo 0» no se sostiene ni como aproximación.
 *   2. Hay 9 405 bloques más, de estilos 1 y 6, en caras que además tienen el 0.
 *      Tirarlos quita la luz de todas las antorchas parpadeantes del mapa.
 *
 * Los estilos 1 y 6 son las dos parpadeantes de Half-Life, y su valor medio es
 * prácticamente el máximo: una antorcha titila, no se apaga. Así que sumarlos con
 * peso uno es lo que reproduce el mapa CON TODAS LAS LUCES ENCENDIDAS, que es lo
 * que se ve en cualquier fotograma del juego. La media del atlas sube de 24,9 a
 * 30,5 sobre 255.
 *
 * Lo que sigue sin reproducirse es el parpadeo en sí, que es animación en tiempo
 * real. Va al informe de capacidad como hueco medido, no se disimula.
 */
export function pintarAtlas(atlas, lumpLuz, { tablas = null, ajustes = AJUSTES, valores = null } = {}) {
  const { ancho, alto, items } = atlas;
  const t = tablas ?? tablasDeGamma(ajustes);
  const { luz, lightscale } = t;
  const rgba = new Uint8Array(ancho * alto * 4);
  // Fondo negro opaco: un luxel que no es de nadie no debería llegar a la
  // pantalla nunca, y si llega, que se vea que es un agujero y no luz.
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;

  // El valor de cada estilo, precalculado. Ver `gamma.js`: el motor multiplica
  // cada bloque por `lightstylevalue[estilo]`, que vale 264 para un estilo fijo
  // y algo más para los que parpadean.
  //
  // `valores` fija el valor de uno o varios estilos en vez de tomar su media, y
  // es lo que hornea las variantes del parpadeo. Sin él sale el atlas de
  // siempre: todos los estilos a su valor medio, o sea el mapa con todas las
  // luces encendidas, que es lo que se ve en cualquier fotograma del juego.
  const valor = new Float64Array(256);
  for (let e = 0; e < 256; e++) valor[e] = valores?.[e] ?? valorDeEstilo(e);

  let leidos = 0;
  for (const it of items) {
    const base = it.cara.lightofs;
    for (let ty = -MARGEN; ty < it.alto + MARGEN; ty++) {
      for (let tx = -MARGEN; tx < it.ancho + MARGEN; tx++) {
        // El borde repite el luxel de dentro más cercano. Con negro dejaría una
        // línea oscura alrededor de cada cara, que es un fallo que se ve como
        // «oclusión de contacto» y por tanto se da por bueno.
        const sx = Math.min(it.ancho - 1, Math.max(0, tx));
        const sy = Math.min(it.alto - 1, Math.max(0, ty));
        const k = sy * it.ancho + sx;
        const dst = ((it.y + ty) * ancho + (it.x + tx)) * 4;
        if (dst + 3 >= rgba.length) continue;
        // Un bloque por estilo, uno detrás de otro, todos del mismo tamaño, y
        // cada uno con SU peso — igual que `R_BuildLightMap()`.
        let r = 0, g = 0, b = 0;
        for (let e = 0; e < it.cara.nEstilos; e++) {
          const src = base + (e * it.ancho * it.alto + k) * 3;
          if (src + 2 >= lumpLuz.length) break;
          const v = valor[it.cara.estilos[e]];
          r += lumpLuz[src] * v; g += lumpLuz[src + 1] * v; b += lumpLuz[src + 2] * v;
        }
        // `t = bl[i] * lightscale >> 14`, recortado a 1023, y por la tabla de luz
        // del motor. El `>> 2` final baja de 10 bits a 8.
        rgba[dst] = luz[Math.min(1023, (r * lightscale) / 16384 | 0)] >> 2;
        rgba[dst + 1] = luz[Math.min(1023, (g * lightscale) / 16384 | 0)] >> 2;
        rgba[dst + 2] = luz[Math.min(1023, (b * lightscale) / 16384 | 0)] >> 2;
        rgba[dst + 3] = 255;
        if (tx >= 0 && ty >= 0 && tx < it.ancho && ty < it.alto) leidos++;
      }
    }
  }
  return { rgba, ancho, alto, leidos };
}

/**
 * La UV de mapa de luz de un vértice, en el atlas.
 *
 * Dos cosas que hay que hacer bien y no se ven si se hacen mal:
 *
 *   restar el origen  la proyección va en unidades de mundo; el parche empieza en
 *                     `floor(min/16)*16`. Sin restarlo, la UV se va a cualquier
 *                     parte y el mapa de luz sale como ruido — que al menos se ve.
 *   el medio luxel    se muestrea el CENTRO del luxel, no su esquina: `+0,5`. Sin
 *                     él el mapa está desplazado medio luxel, y eso sí se da por
 *                     bueno en una captura.
 */
export function uvDeLuz(punto, cara, item, atlas) {
  // El origen del parche viaja en el propio `item` —lo puso `empaquetar()`— y no
  // se vuelve a calcular: dos cálculos del mismo número son dos sitios donde
  // puede dejar de ser el mismo.
  const s = (proyS(punto, cara.texinfo) - item.origenS) / LUXEL + 0.5;
  const t = (proyT(punto, cara.texinfo) - item.origenT) / LUXEL + 0.5;
  return [(item.x + s) / atlas.ancho, (item.y + t) / atlas.alto];
}

/**
 * El histograma de luminancia del atlas, y la sonda que de verdad importa.
 *
 * Si sale PLANO, el mapa de luz se ha leído mal y el mundo se verá uniformemente
 * iluminado — que es exactamente el aspecto del jharro de hoy, y por tanto el
 * fallo más fácil de dar por bueno: la escena se vería bien, se vería entera, y
 * el veredicto de quien la juegue sería otra vez «todo se ve casi 100 % igual».
 *
 * Se mide con la desviación típica y con cuánto pesa la cubeta mayor. Una
 * distribución plana tiene desviación baja y una cubeta dominante; una buena
 * tiene cola oscura, cola clara y algo en medio.
 */
export function histograma(atlas, lumpLuz, { cubetas = 16 } = {}) {
  const h = new Array(cubetas).fill(0);
  let n = 0, suma = 0, suma2 = 0;
  // Se leen los luxels de los PARCHES, no los píxeles del atlas.
  //
  // Es la diferencia entre medir el mapa de luz y medir mi propio empaquetado: el
  // atlas se sube a potencia de dos y queda casi la mitad en negro, así que el
  // histograma del atlas entero decía «la cubeta mayor se lleva el 59 %» y esa
  // cubeta era el hueco. La sonda estaba midiendo el relleno que ella misma
  // había puesto — el mismo error que ya cometió una sonda la sesión pasada.
  for (const it of atlas.items) {
    const nl = it.ancho * it.alto;
    for (let k = 0; k < nl; k++) {
      // Sumando los estilos, igual que `pintarAtlas()`. Medir el estilo 0 solo y
      // pintar la suma sería medir una cosa y enseñar otra.
      let r = 0, g = 0, b = 0;
      for (let e = 0; e < it.cara.nEstilos; e++) {
        const s = it.cara.lightofs + (e * nl + k) * 3;
        if (s + 2 >= lumpLuz.length) break;
        r += lumpLuz[s]; g += lumpLuz[s + 1]; b += lumpLuz[s + 2];
      }
      const l = 0.2126 * Math.min(255, r) + 0.7152 * Math.min(255, g) + 0.0722 * Math.min(255, b);
      h[Math.min(cubetas - 1, Math.floor((l / 256) * cubetas))]++;
      n++; suma += l; suma2 += l * l;
    }
  }
  const media = n ? suma / n : 0;
  const desviacion = n ? Math.sqrt(Math.max(0, suma2 / n - media * media)) : 0;
  return {
    cubetas: h,
    media,
    desviacion,
    // Cuántas cubetas llevan al menos el 1 % de los luxels: es la forma más
    // directa de decir «esto no es un color plano».
    cubetasVivas: h.filter((c) => c > n * 0.01).length,
    mayor: n ? Math.max(...h) / n : 0,
  };
}

// --- la luz de los ADORNOS ---------------------------------------------------
//
// Un modelo `.mdl` NO lleva mapa de luz. En GoldSrc se ilumina con `R_LightPoint`:
// se tira un rayo hacia abajo desde el origen de la entidad, se busca la cara que
// hay debajo y se lee **un solo luxel**, el que cae bajo sus pies. Ese color
// multiplica el modelo entero.
//
// Eso explica una cosa que si no se reproduce canta: un barril en una cueva
// oscura está oscuro, y el mismo barril bajo una lámpara está claro. Sin esto, los
// 101 adornos salen todos con el mismo brillo, y un mapa donde los muebles no
// saben dónde están se lee como pegatinas puestas encima.
//
// Y sale gratis en el atlas: se reserva un luxel por adorno con su color, y el
// material del adorno es el mismo `MeshLambertMaterial` con `lightMap` que el
// mundo. Ni un shader ni un material nuevo.

/**
 * La cara de suelo que hay bajo un punto, y su altura.
 *
 * Se recorren las caras con la normal hacia arriba cuya proyección en planta
 * contiene el punto, y se coge **la más alta por debajo**. No vale la más cercana
 * en 3D: en un edificio de dos plantas, la más cercana puede ser el suelo de
 * arriba y el adorno está en el de abajo.
 */
export function caraBajo(caras, punto, { margen = 8 } = {}) {
  let mejor = null;
  for (const c of caras) {
    if (c.normal[2] < 0.7) continue;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z = 0;
    for (const p of c.puntos) {
      if (p[0] < x0) x0 = p[0];
      if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1];
      if (p[1] > y1) y1 = p[1];
      z += p[2];
    }
    if (punto[0] < x0 - margen || punto[0] > x1 + margen) continue;
    if (punto[1] < y0 - margen || punto[1] > y1 + margen) continue;
    z /= c.puntos.length;
    if (z > punto[2] + margen) continue;
    if (!mejor || z > mejor.z) mejor = { cara: c, z };
  }
  return mejor;
}

/**
 * El color con el que el motor pintaría un adorno puesto en este punto.
 *
 * Devuelve el luxel del suelo, ya sumados los estilos y SIN rampa ni overbright:
 * los pone `pintarAtlas()` cuando el color se escribe en el atlas, que es donde
 * los pone también para el mundo. Aplicarlos aquí los aplicaría dos veces, y eso
 * no se ve como un error — se ve como unos muebles demasiado claros.
 *
 * Si no hay suelo debajo, o el suelo no tiene mapa de luz, devuelve `null`. El
 * que llama decide qué hacer, y lo que hace el motor es dejarlo negro.
 */
export function luzEnSuelo(caras, lumpLuz, punto) {
  const bajo = caraBajo(caras, punto);
  if (!bajo || !tieneLuz(bajo.cara)) return null;
  const c = bajo.cara;
  const p = parcheDeLuz(c.puntos, c.texinfo);
  // El luxel bajo los pies: la proyección del punto sobre los ejes de la cara,
  // menos el origen del parche, en pasos de 16.
  const sx = Math.round((proyS(punto, c.texinfo) - p.origenS) / LUXEL);
  const sy = Math.round((proyT(punto, c.texinfo) - p.origenT) / LUXEL);
  const x = Math.min(p.ancho - 1, Math.max(0, sx));
  const y = Math.min(p.alto - 1, Math.max(0, sy));
  const n = p.ancho * p.alto;
  const k = y * p.ancho + x;
  // `R_RecursiveLightPoint()`, línea a línea: cada bloque de estilo se multiplica
  // por `tr.lightstylevalue[estilo]` y la suma se desplaza OCHO bits en
  // `R_LightVecInternal()` —`light.r = min(cv.r >> 8, 255)`—, no se usa cruda.
  //
  // Para el estilo fijo eso es ×264/256, o sea un 3 % de más; para los estilos 1
  // y 6 es un 10 % y un 13 %. Poco, pero es la misma cuenta que el mundo y no
  // hay razón para hacerla distinta aquí.
  let r = 0, g = 0, b = 0;
  for (let e = 0; e < c.nEstilos; e++) {
    const s = c.lightofs + (e * n + k) * 3;
    if (s + 2 >= lumpLuz.length) break;
    const v = valorDeEstilo(c.estilos[e]);
    r += lumpLuz[s] * v; g += lumpLuz[s + 1] * v; b += lumpLuz[s + 2] * v;
  }
  return [
    Math.min(255, Math.floor(r / 256)),
    Math.min(255, Math.floor(g / 256)),
    Math.min(255, Math.floor(b / 256)),
  ];
}

/**
 * Reserva un luxel por adorno en el atlas y devuelve sus UV.
 *
 * Van en una fila propia por encima de los dos luxeles de servicio, y cada uno es
 * un cuadrado de 3×3 por la misma razón que ellos: con filtro bilineal un píxel
 * suelto se mezcla con sus vecinos y el color que llega al modelo no es el que se
 * puso.
 *
 * Se comprueba que quepan y que la fila esté libre. Escribir encima de los
 * parches del mundo no daría error: daría unos cuantos trozos de pared con la luz
 * de un barril.
 */
/**
 * El ambiente de un modelo se RECORTA a 128. `gl_studio.c`, línea 1489.
 *
 * Un modelo puesto bajo una lámpara no se pone blanco: se queda a la mitad.
 */
export const AMBIENTE_MAXIMO = 128;

/**
 * `v_direct`, la parte DIRIGIDA de la luz de un modelo. `gl_studio.c`:
 *
 *     if( FBitSet( ent->model->flags, STUDIO_AMBIENT_LIGHT )) add = 0.6f;
 *     else add = bound( 0.75f, v_direct->value, 1.0f );
 *
 * `direct` vale 0,9 de fábrica en `engine/client/gamma.c` y ninguna de las dos
 * instalaciones lo toca. De ahí sale el reparto: `shadelight = total × 0,9` y
 * `ambientlight = total × 0,1`.
 */
export const DIRECTO = 0.9;

/**
 * Lo que queda del `cos` de `R_StudioLighting()` cuando se promedia.
 *
 * El motor ilumina cada vértice con su normal:
 *
 *     lightcos = dot(normal, lightvec)          // −1 alineado, 1 opuesto
 *     r = SHADE_LAMBERT                          // 1,4953241 en gl_local.h
 *     lightcos = (lightcos + (r − 1)) / r
 *     if (lightcos > 0) illum −= shadelight × lightcos
 *
 * Un atlas horneado tiene UN luxel por adorno y no una normal por vértice, así
 * que hay que quedarse con el valor medio sobre la esfera de normales. Con
 * `lightcos` uniforme en [−1, 1] la integral sale exacta y vale `r/4`:
 *
 *     E[max(0, (c + r − 1)/r)] = r/4 = 0,373831
 *
 * **Ésta es la única aproximación de todo el camino** y se dice: lo demás es el
 * motor línea a línea. El que quiera quitarla tiene que dejar de hornear la luz
 * de los adornos y calcularla por vértice en el navegador.
 */
export const COS_MEDIO = 1.4953241 / 4;

// Aquí vivía `MODULA_ADORNOS = 0.6`, presentada como `r_lighting_modulate` del
// `config.cfg`. **Esa cvar no hace nada.** En este motor está registrada así:
//
//   engine/client/ref_common.c:745
//     Cvar_Get( "r_lighting_modulate", "0.6", FCVAR_ARCHIVE,
//               "compatibility cvar, does nothing" );
//
// O sea que era un factor 0,6 sobre los 101 adornos sacado de leer el nombre de
// una cvar en un `config.cfg` sin comprobar qué hace el motor con ella — que es
// el mismo error que `gl_overbright`, sólo que del otro lado: allí la referencia
// corrigió al razonamiento, aquí la referencia se leyó a medias.
//
// Lo curioso es por qué no cantó: el factor medio REAL del camino del motor es
// `(1 − 0,9) + 0,9 × (1 − 0,373831) = 0,6636`. Un 0,6 aplicado por canal se le
// parece lo bastante como para que el fallo que sí se veía fuera el otro — que
// la cuenta se hacía **por canal** en vez de con un escalar y un color
// normalizado, y eso aplasta la saturación de todos los muebles del mapa.

/**
 * La luz de un adorno, con el camino completo de `gl_studio.c`.
 *
 * `R_StudioSetupLighting()` NO ilumina canal a canal. Hace esto:
 *
 *   1. `total = max(r, g, b)` del luxel del suelo.
 *   2. `shadelight = total × direct`, `ambientlight = total − shadelight`,
 *      con el ambiente recortado a 128 y la suma recortada a 255.
 *   3. `plight->color = finalLight / max(finalLight)` — el color se NORMALIZA a
 *      que su mayor componente valga uno.
 *   4. por vértice, `illum = ambient + shade·f(cos)` y
 *      `lv = LightToTexGamma(illum × 4) / 1023`.
 *   5. `lightvalues[k] = lightcolor × lv`  (`gl_studio.c`, línea 2328).
 *
 * O sea: **una intensidad ESCALAR por un color normalizado.** Pasar los tres
 * canales por la tabla de gamma por separado —que es lo que hacía esto— no es lo
 * mismo, porque la tabla es cóncava: comprime más el canal pequeño que el grande
 * y por tanto DESATURA. Un barril bajo una lámpara de vela salía gris.
 *
 * Devuelve los tres bytes que van al atlas.
 */
export function colorDeAdorno(luxel, tabla, { directo = DIRECTO, cosMedio = COS_MEDIO } = {}) {
  const [r, g, b] = luxel ?? [0, 0, 0];
  const total = Math.max(r, g, b);
  if (total <= 0) return [0, 0, 0];
  let sombra = total * directo;
  let ambiente = Math.min(AMBIENTE_MAXIMO, total - sombra);
  if (ambiente + sombra > 255) sombra = 255 - ambiente;
  const illum = Math.min(255, Math.max(0, ambiente + sombra * (1 - cosMedio)));
  const lv = tabla[Math.min(1023, Math.round(illum * 4))] / 1023;
  return [
    Math.min(255, Math.round(lv * (r / total) * 255)),
    Math.min(255, Math.round(lv * (g / total) * 255)),
    Math.min(255, Math.round(lv * (b / total) * 255)),
  ];
}

export function reservarAdornos(atlas, rgba, colores, { tablas = null, ajustes = AJUSTES } = {}) {
  const { ancho, alto } = atlas;
  const y = alto - 8;
  if (y <= atlas.altoUsado) {
    throw new Error(
      `no queda sitio para los luxeles de los adornos: el atlas usa ${atlas.altoUsado} de ${alto} filas`
    );
  }
  const porFila = Math.floor(ancho / 4);
  if (colores.length > porFila) {
    throw new Error(`${colores.length} adornos no caben en una fila de ${porFila}`);
  }
  const { luz } = tablas ?? tablasDeGamma(ajustes);

  const uvs = [];
  for (let i = 0; i < colores.length; i++) {
    const x = 2 + i * 4;
    const c = colorDeAdorno(colores[i], luz);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const o = ((y + dy) * ancho + (x + dx)) * 4;
        rgba[o] = c[0];
        rgba[o + 1] = c[1];
        rgba[o + 2] = c[2];
        rgba[o + 3] = 255;
      }
    }
    uvs.push([(x + 0.5) / ancho, (y + 0.5) / alto]);
  }
  return uvs;
}
