// El plano del jharro: una ciudad excavada en la roca, en varias plantas.
//
// Un *jharro* —el nombre es de Master Sword— es un pueblo que no está construido
// sobre el suelo sino DENTRO de la roca. Eso cambia el plano entero, y no de
// forma cosmética: `corinth.js` es una rejilla plana con parcelas, y aquí hay
// plantas a cotas distintas unidas por escaleras y pozos. La tercera dimensión es
// lo único de verdad nuevo de este archivo.
//
// ── De dónde salen los números ───────────────────────────────────────────────
//
// De medir `gatecity.bsp` con `npm run bsp`, no de elegirlos. Lo transferible de
// un mapa ajeno son sus PROPORCIONES, y ésas se miden:
//
//   huella      138,5 × 194,7 m
//   suelo       8 210 m² repartidos en ocho bandas de cota
//   relleno     el suelo es el 30,5 % de la huella: siete de cada diez metros
//               cuadrados de planta son roca maciza
//   altura libre  mediana 2,8 m, p25 2,3, p75 4,9, p90 9,3 — y el 55 % por
//               debajo de 3 m
//
// Nada de eso se escribe a mano aquí abajo salvo la propia medida. El tamaño del
// jharro, el número de celdas de cada planta y hasta cuánta caverna hay se
// DERIVAN de esas cifras, así que corregir la medida corrige el plano.
//
// ── Lo que la medida obligó a cambiar del diseño por defecto ─────────────────
//
// Lo primero que se hizo fue leer las ocho bandas como ocho plantas apiladas, y
// la cuenta lo tumbó en dos líneas: entre −22 y −20 hay dos metros. Dos metros de
// separación entre dos suelos no dejan un pasillo, dejan un hueco por el que no
// pasa nadie. O sea que las bandas juntas NO son plantas: son terrazas del mismo
// hueco, suelo escalonado. Lo que separa dos plantas de verdad es un salto
// grande, y en Gate City hay dos: de −10 a −4 (6 m) y de −4 a +8 (12 m).
//
// Por eso aquí una «planta» es una banda de cota, y la CONEXIÓN entre dos bandas
// se calcula del salto: donde hay dos metros, dos tramos de escalera; donde hay
// doce, un pozo. Nada de eso se decide mirando.
//
// TODO en celdas de 4 m, como en `corinth.js` y `house.js`: la celda (x, z) de la
// planta p ocupa de (4x, −4z) a (4x+4, −4z−4) en metros, con el suelo a la cota
// de su banda. Trabajar en celdas es lo que hace que «el cuarto de al lado» sea
// x+1 y no una resta con decimales.

import { CELDA } from "./house.js";
import { TRAMO, HONDO } from "./boca.js";
import { hash2 } from "../util/noise.js";

export const NOMBRE = "el jharro de Corinth";

// --- lo medido ----------------------------------------------------------------
//
// Esto es la única entrada de datos del archivo, y es una medida. Sale de
// `npm run bsp -- ../MSC/assets/msr/maps/gatecity.bsp`, apartado «plantas».

/** La huella de Gate City, en metros. Medida de su caja. */
export const HUELLA_MEDIDA = { ancho: 138.5, fondo: 194.7 };

/**
 * Las bandas de cota de Gate City y cuánto suelo hay en cada una, en m².
 *
 * De abajo arriba, que es como se recorre un jharro: el fondo primero.
 */
export const BANDAS_MEDIDAS = [
  { cota: -22, area: 141 },
  { cota: -20, area: 964 },
  { cota: -18, area: 267 },
  { cota: -14, area: 3330 }, // el grueso del pueblo
  { cota: -12, area: 826 },
  { cota: -10, area: 1276 },
  { cota: -4, area: 413 },
  { cota: 8, area: 993 },
];

/**
 * La altura libre de Gate City, por percentiles. Medida emparejando cada cara de
 * suelo con la cara de techo más baja que tiene encima, en casillas de 2 m.
 *
 * Es LA cifra de un pueblo bajo tierra, y la que más contradice lo que se haría
 * por defecto: más de la mitad del sitio tiene menos de tres metros de techo.
 * Aquí se guarda como tabla y no como media porque una media de 4 m con todo
 * igual no se parece en nada a esto; lo que hace legible una cueva es el
 * CONTRASTE entre el pasillo y la bóveda.
 */
export const ALTURA_LIBRE_MEDIDA = [
  [0.10, 0.8],
  [0.25, 2.3],
  [0.50, 2.8],
  [0.75, 4.9],
  [0.90, 9.3],
];

/** Qué fracción de la altura libre medida pasa de 8 m: la caverna de verdad. */
export const FRACCION_BOVEDA = 0.16;

/**
 * El suelo pisable que se quiere, en m².
 *
 * Es el de Corinth, medido: 256 celdas de 4 m. No es una cifra de Gate City a
 * propósito —Gate City mide el doble— porque lo que se importa son las
 * proporciones, no el tamaño: un jharro del tamaño de Gate City es un mundo
 * entero, y lo que hay que demostrar primero es que las proporciones se sostienen.
 */
export const OBJETIVO_M2 = 4096;

/** La altura de paso del jugador, medida del controlador de `src/play/player.js`. */
export const PASO_LIBRE = 2.2;

/** Lo que mide de grueso la losa de roca que separa una planta de la de arriba. */
export const GRUESO_ROCA = 0.6;

/**
 * Cuánto tienen que distar dos plantas para poder caer una encima de otra.
 *
 * Es LA regla de la tercera dimensión, y no es estética: por debajo de esto no
 * caben las dos. Un suelo a −20 y otro a −22 dejan dos metros, y de esos dos
 * metros 0,6 son la losa de roca: queda 1,4 m de aire, que no es un pasillo, es
 * un hueco por el que no pasa nadie.
 *
 * Por eso las bandas que Gate City tiene a dos metros NO son plantas apiladas:
 * son terrazas del mismo hueco, una al lado de otra. La medida lo dice y el
 * diseño obedece. Leerlas como ocho plantas apiladas daba un edificio de
 * oficinas subterráneo con los techos a metro y medio, y no fallaba ni una cifra
 * porque las cotas eran las medidas.
 */
export const SEPARACION = PASO_LIBRE + GRUESO_ROCA;

/**
 * ¿Choca poner suelo en (x, z) a la cota `cota` con lo ya excavado?
 *
 * Ésta es la función única de la costura entre plantas, y la preguntan los dos
 * lados: la excavación, para no abrir una celda donde no cabe, y la roca, para
 * saber hasta dónde puede subir la bóveda. Con dos copias del criterio bastaría
 * con tocar `GRUESO_ROCA` en un sitio para que la bóveda de una planta se comiera
 * el suelo de la de arriba — y eso no da error, da dos superficies peleándose por
 * el mismo volumen, que parpadea y no sale en ninguna cifra.
 */
export function chocaConOtraPlanta(plantas, x, z, cota) {
  const k = clave(x, z);
  for (const pl of plantas) {
    if (!pl || !pl.suelo.has(k)) continue;
    if (Math.abs(pl.cota - cota) < SEPARACION) return true;
  }
  return false;
}

/**
 * Lo que hay ENCIMA de una celda: la planta más baja de las que la cubren.
 *
 * Es la otra cara de `chocaConOtraPlanta`, y la pregunta la bóveda: donde hay
 * otra planta arriba, el techo no puede subir hasta donde le tocaría por su
 * tramo, sino que se queda a un grueso de losa del suelo de arriba.
 */
export function plantaEncima(plan, p, x, z) {
  const k = clave(x, z);
  const mia = plan.plantas[p].cota;
  let mejor = null;
  for (const pl of plan.plantas) {
    if (pl.indice === p || !pl.suelo.has(k) || pl.cota <= mia) continue;
    if (!mejor || pl.cota < mejor.cota) mejor = pl;
  }
  return mejor;
}

// --- lo que se deriva de lo medido -------------------------------------------

const SUELO_MEDIDO = BANDAS_MEDIDAS.reduce((a, b) => a + b.area, 0);
/** Cuánto de la huella es suelo y no roca. En Gate City, el 30,5 %. */
export const RELLENO = SUELO_MEDIDO / (HUELLA_MEDIDA.ancho * HUELLA_MEDIDA.fondo);
const ASPECTO = HUELLA_MEDIDA.ancho / HUELLA_MEDIDA.fondo;

// La huella sale del relleno y del aspecto medidos, no de un número redondo: si
// el suelo tiene que ser el 30,5 % de la planta, un objetivo de 4 096 m² pisables
// pide 13 400 m² de huella, y con el aspecto de Gate City eso son 98 × 137 m.
const HUELLA_M2 = OBJETIVO_M2 / RELLENO;
export const ANCHO = Math.round(Math.sqrt(HUELLA_M2 * ASPECTO) / CELDA); // 24 celdas
export const FONDO = Math.round(Math.sqrt(HUELLA_M2 / ASPECTO) / CELDA); // 34 celdas

/**
 * El margen de roca que se deja por fuera, en celdas.
 *
 * No es estético: aquí TODO es interior. Sin margen, una galería puede llegar al
 * borde de la rejilla y salirse del mundo, y lo que se ve por ese agujero no es
 * un error de compilación —no hay `qbsp` que juzgue una malla— es el color del
 * fondo. Una celda de roca por fuera cierra el jharro por construcción.
 */
export const MARGEN = 1;

/**
 * Reparte `total` entre unos pesos, en enteros, sin perder ni ganar por el camino.
 *
 * Restos mayores: se da a cada uno su parte entera y las unidades que sobran van
 * a los que más resto tenían. Redondear cada banda por su cuenta daría 255 o 257
 * celdas y la diferencia se colaría como «casi» en todas las cifras derivadas.
 */
export function reparte(total, pesos) {
  const suma = pesos.reduce((a, b) => a + b, 0);
  const exacto = pesos.map((p) => (p / suma) * total);
  const base = exacto.map(Math.floor);
  let falta = total - base.reduce((a, b) => a + b, 0);
  const orden = exacto
    .map((v, i) => [v - Math.floor(v), i])
    .sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; k < falta; k++) base[orden[k % orden.length][1]]++;
  return base;
}

/** Cuántos tramos de escalera del pack hacen falta para salvar un salto. */
export function tramosDe(salto) {
  return Math.ceil(salto / TRAMO.alto);
}

/**
 * Cuántas celdas de carrera ocupa la conexión entre dos bandas, y de qué tipo.
 *
 * Sale de la pieza medida: `strairs_stone` sube 1,015 m por cada 2,183 m de
 * carrera. Un salto de dos metros son dos tramos y 4,4 m de carrera; uno de doce
 * serían doce tramos y 26 m, o sea SEIS celdas y media de galería dedicadas a
 * bajar. Eso no es una escalera, es un viaducto: a partir de ocho metros se baja
 * por un pozo, que es lo que hace Gate City con sus dos `func_ladder`.
 */
export const SALTO_POZO = 8;

export function conexionDe(salto) {
  // `corrida` es a cuántas celdas de distancia cae el pie, y las celdas de EN
  // MEDIO son el túnel: `corrida − 1`. El pie no es del túnel, es de la planta de
  // abajo, y esa frontera es la costura de esta parte.
  //
  // El primer reparto daba el pie al túnel y a la planta a la vez: la rampa
  // emitía su suelo sobre la celda de llegada y la planta emitía el suyo encima.
  // Dos losas en el mismo plano no dan error —dan z-fighting, que parpadea al
  // moverse y un fotograma fijo no lo caza porque congela la pelea en un ganador—
  // y lo cazó una prueba que contaba losas por celda y cota, que es la forma de
  // ver un solape sin mirar.
  if (salto >= SALTO_POZO) return { tipo: "pozo", tramos: 0, corrida: 2, carrera: 0 };
  const tramos = tramosDe(salto);
  const carrera = tramos * TRAMO.carrera;
  // Una celda más de la que pide la carrera: el túnel tiene que poder bajar el
  // salto entero ANTES de llegar al pie, porque el pie está a la cota de abajo y
  // es llano. Sin esa celda, 4,37 m de escalera no caben en 4 m de túnel y la
  // rampa llega al pie con 37 cm de desnivel — un escalón sin cara.
  return { tipo: "escalera", tramos, corrida: Math.ceil(carrera / CELDA) + 1, carrera };
}

/**
 * Las plantas del jharro: la cota medida, y cuántas celdas le tocan.
 *
 * Las celdas se reparten en proporción al suelo que Gate City tiene en cada
 * banda. Por eso la planta de −14 se lleva 104 de 256 y la de −22 solo cuatro:
 * el grueso del pueblo está en una planta y las demás son lo que cuelga de ella.
 * Elegido a ojo saldrían ocho plantas parecidas, que es exactamente lo que un
 * jharro no es.
 */
export const PLANTAS = (() => {
  const celdas = reparte(
    Math.round(OBJETIVO_M2 / (CELDA * CELDA)),
    BANDAS_MEDIDAS.map((b) => b.area)
  );
  return BANDAS_MEDIDAS.map((b, i) => ({
    indice: i,
    cota: b.cota,
    areaMedida: b.area,
    celdas: celdas[i],
  }));
})();

/**
 * La cota cero del jharro en el mundo de Corinth.
 *
 * No es un número elegido: la planta de arriba del jharro es donde acaba el
 * socavón de Corinth, o sea la reja del fondo de la trinchera, que está a
 * −4,06 m de la calle porque la escalera del pack baja cuatro tramos de 1,015 m.
 * La banda más alta que midió Gate City es la de +8, así que el datum es
 * −4,06 − 8. Importar `HONDO` y no copiar el −4,06 es lo que hace que si mañana
 * el socavón se hace más hondo, el jharro baje con él.
 */
export const DATUM = -HONDO - BANDAS_MEDIDAS[BANDAS_MEDIDAS.length - 1].cota;

/** La cota de una planta en metros de mundo. */
export function cotaMundo(p) {
  return DATUM + PLANTAS[p].cota;
}

// --- la excavación ------------------------------------------------------------
//
// Ni una celda escrita a mano. Se excava con un programa determinista: un
// generador congruencial sembrado por planta, así que el mismo plano sale igual
// en Node y en el navegador y se puede comparar con el de ayer.
//
// ── Por qué se excava en TRAMOS y no celda a celda ──────────────────────────
//
// Porque la altura libre se decide luego por tramo, no por celda. Un pasillo de
// seis celdas con seis techos distintos es un sitio absurdo; lo que hace legible
// una cueva es que el pasillo tenga SU techo bajo de punta a punta y que la sala
// de al lado tenga el suyo alto. O sea que el tramo —la tirada recta, el cuarto,
// la caverna— es la unidad de diseño, y la celda solo la unidad de cuenta.

/** Un generador congruencial lineal. Determinista y barato. */
export function azar(semilla) {
  let s = (semilla >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const clave = (x, z) => `${x},${z}`;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** ¿Cae la celda dentro de la parte excavable, con su margen de roca? */
export function dentro(x, z) {
  return x >= MARGEN && z >= MARGEN && x < ANCHO - MARGEN && z < FONDO - MARGEN;
}

/** Cuánto sitio libre hay por delante en una dirección, mirando `vista` celdas. */
export function hueco(x, z, d, suelo, vista = 6, veta = () => false) {
  const [dx, dz] = DIRS[d];
  let libre = 0;
  for (let k = 1; k <= vista; k++) {
    const nx = x + dx * k, nz = z + dz * k;
    // Fuera del margen cuenta como ocupado, no como hueco. Es lo que separa la
    // excavación del borde sin escribir ninguna regla de «no te acerques»: hacia
    // el borde no hay sitio, así que no tira para allá. Y lo mismo hace la veta
    // de la planta vecina: donde no cabe, no hay hueco.
    if (!dentro(nx, nz) || veta(nx, nz) || suelo.has(clave(nx, nz))) break;
    libre++;
  }
  return libre;
}

/**
 * Hacia dónde sigue una cabeza de excavación.
 *
 * Se puntúa cada dirección por el hueco que tiene por delante y se sortea entre
 * las cuatro con esos pesos, con una prima a seguir recto.
 *
 * El primer intento no puntuaba nada: seguía recto con probabilidad 0,65 y giraba
 * con 0,35. El plano salía conexo, medía 256 celdas exactas y daba el relleno
 * medido del 31 %, o sea que TODAS las cifras estaban bien; y el dibujo enseñaba
 * la ciudad apiñada en una esquina con el tercio sur de la roca sin tocar, y una
 * planta entera convertida en una columna de trece celdas pegada al margen. Es
 * otra vez el descampado del experimento 03: el fallo que no dice ninguna cifra
 * porque las cifras son globales y el problema es de reparto.
 */
export function elegirDir(cabeza, suelo, rnd, veta = () => false) {
  const pesos = DIRS.map((_, d) => {
    const h = hueco(cabeza.x, cabeza.z, d, suelo, 6, veta);
    if (h === 0) return 0;
    return h * (d === cabeza.d ? 2.5 : 1);
  });
  const suma = pesos.reduce((a, b) => a + b, 0);
  if (suma === 0) return cabeza.d;
  let r = rnd() * suma;
  for (let d = 0; d < 4; d++) {
    r -= pesos[d];
    if (r < 0) return d;
  }
  return cabeza.d;
}

/**
 * Excava una planta: devuelve sus celdas y sus tramos.
 *
 * Crece desde el ancla —que es donde llega la conexión de la planta de arriba—
 * en tiradas rectas con bifurcaciones, y de vez en cuando abre un cuarto o una
 * caverna al final de una tirada. Que todo crezca del ancla es lo que hace la
 * planta conexa POR CONSTRUCCIÓN; que además se compruebe inundando es lo que
 * hace que si alguien rompe la construcción se entere.
 *
 * `presupuesto.boveda` es el saldo global de celdas de caverna que quedan por
 * abrir. Es un objeto y se muta a propósito: las plantas se excavan en orden
 * fijo, así que una planta de cuatro celdas —donde no cabe una caverna— le deja
 * su parte a la siguiente en vez de perderla.
 */
export function excavar({ celdas, semilla, ancla, presupuesto, veta = () => false }) {
  const rnd = azar(semilla);
  const suelo = new Map(); // "x,z" -> índice de tramo
  const tramos = [];

  const nuevoTramo = (tipo) => {
    tramos.push({ tipo, celdas: [] });
    return tramos.length - 1;
  };

  /** Mete celdas en un tramo. Las que ya estaban se reasignan solo si se pide. */
  const abrir = (lista, idx, reasignar = false) => {
    let puestas = 0;
    for (const [x, z] of lista) {
      const k = clave(x, z);
      const previo = suelo.get(k);
      if (previo !== undefined) {
        if (!reasignar || previo === idx) continue;
        // Una caverna se come el pasillo que entraba en ella: la celda cambia de
        // dueño. Sin esto, la celda tendría dos techos a la vez y el que gana
        // depende del orden en que se emitan las mallas, que es la clase de
        // fallo que se ve a ratos y no sale en ninguna cifra.
        const lista0 = tramos[previo].celdas;
        const pos = lista0.findIndex((c) => c[0] === x && c[1] === z);
        if (pos >= 0) lista0.splice(pos, 1);
        suelo.set(k, idx);
        tramos[idx].celdas.push([x, z]);
        continue;
      }
      suelo.set(k, idx);
      tramos[idx].celdas.push([x, z]);
      puestas++;
    }
    return puestas;
  };

  /** Cuántas celdas de una lista serían nuevas. El presupuesto se mide con esto. */
  const nuevas = (lista) => lista.filter(([x, z]) => !suelo.has(clave(x, z))).length;

  // Lo largo que puede ser una tirada, y sale del presupuesto de la planta.
  //
  // Estaba en 2..6 para todas, y el dibujo lo tumbó: la planta de −14 tiene 104
  // celdas y con tiradas de seis no salía de un cuadrado de veinte por veintitrés,
  // o sea que el tercio sur de la huella se quedaba sin excavar. Y la huella no es
  // un número libre: sale del relleno medido de Gate City —el suelo es el 30,5 %
  // de la planta—, así que una ciudad que no la ocupa hace falsa la cifra que la
  // decidió, y el relleno global seguía dando 31 % porque lo que se cuenta es el
  // total, no el reparto.
  //
  // Una planta de N celdas tendida en galerías alcanza del orden de √N celdas de
  // radio, así que ése es el largo que le toca: diez celdas en la planta grande,
  // dos en la de cuatro celdas del fondo.
  const tirada_max = Math.max(2, Math.round(Math.sqrt(celdas)));

  // El ancla, que es el primer trozo de pasillo.
  const primero = nuevoTramo("pasillo");
  abrir([ancla], primero);
  let cabezas = [{ x: ancla[0], z: ancla[1], d: Math.floor(rnd() * 4) }];

  let guardia = 0;
  while (suelo.size < celdas && guardia++ < 20000) {
    const ci = Math.floor(rnd() * cabezas.length);
    const cabeza = cabezas[ci];
    const d = elegirDir(cabeza, suelo, rnd, veta);
    const [dx, dz] = DIRS[d];
    // El largo se acota por lo que queda de presupuesto. Pasarse y recortar
    // después parece igual y no lo es: recortar celdas de un tramo ya abierto
    // puede partir la galería en dos, y una planta partida sigue midiendo lo
    // mismo y sigue saliendo entera en el dibujo.
    const queda = celdas - suelo.size;
    const largo = Math.min(2 + Math.floor(rnd() * (tirada_max - 1)), queda);
    const tirada = [];
    let x = cabeza.x, z = cabeza.z;
    for (let k = 0; k < largo; k++) {
      const nx = x + dx, nz = z + dz;
      if (!dentro(nx, nz) || veta(nx, nz)) break;
      x = nx; z = nz;
      tirada.push([x, z]);
    }
    if (!tirada.length) {
      // Contra el borde: esta cabeza no sirve. Si no queda ninguna, se replanta
      // en una celda ya excavada, que es lo que impide que la excavación se
      // quede a medio presupuesto sin decir nada.
      cabezas.splice(ci, 1);
      if (!cabezas.length) {
        const ks = [...suelo.keys()];
        const [rx, rz] = ks[Math.floor(rnd() * ks.length)].split(",").map(Number);
        cabezas.push({ x: rx, z: rz, d: Math.floor(rnd() * 4) });
      }
      continue;
    }
    const idx = nuevoTramo("pasillo");
    abrir(tirada, idx);
    if (!tramos[idx].celdas.length) tramos.pop();

    const [fx, fz] = tirada[tirada.length - 1];
    cabeza.x = fx; cabeza.z = fz; cabeza.d = d;

    // Una bifurcación de vez en cuando: sin ellas el jharro es una serpiente.
    if (rnd() < 0.45 && cabezas.length < 6) {
      cabezas.push({ x: fx, z: fz, d: d < 2 ? 2 + Math.floor(rnd() * 2) : Math.floor(rnd() * 2) });
    }

    // ¿Se abre una sala al final de la tirada?
    //
    // Con saldo de caverna pendiente se intenta casi siempre, y no es un ajuste
    // suelto: la caverna es el 16 % medido de la altura libre, o sea la mitad del
    // contraste que hace legible una cueva. Al 50 % se quedaba en el 11 %, y lo
    // que falta ahí no es decoración: es la bóveda que hace que el pasillo de dos
    // metros se lea como un pasillo.
    const quiereBoveda = presupuesto.boveda >= 9;
    if (rnd() < (quiereBoveda ? 0.85 : 0.5)) {
      // Caverna si queda saldo y cabe; si no, cuarto. El tamaño de la caverna
      // sale del saldo que queda, no de un número bonito.
      const lado = quiereBoveda
        ? Math.max(3, Math.min(5, Math.floor(Math.sqrt(presupuesto.boveda))))
        : 2 + Math.floor(rnd() * 2);
      const otro = quiereBoveda ? lado - (rnd() < 0.5 ? 0 : 1) : 2;
      const sala = rectanguloEn(fx, fz, dx, dz, lado, otro, veta);
      // Una sala que no quepa en el presupuesto no se recorta: no se abre. Media
      // caverna es un cuarto grande con el techo de caverna, y eso se ve.
      if (sala && nuevas(sala) <= celdas - suelo.size) {
        const tipo = quiereBoveda ? "boveda" : "cuarto";
        const is = nuevoTramo(tipo);
        abrir(sala, is, true);
        if (tipo === "boveda") presupuesto.boveda -= tramos[is].celdas.length;
      }
    }
  }

  // Los tramos vacíos se van, y los índices que guarda `suelo` se recalculan con
  // ellos. Filtrar la lista sin reindexar el mapa deja a cada celda apuntando al
  // tramo del vecino: la altura libre y la luz saldrían de otro tramo, y todas
  // las cifras seguirían cuadrando.
  const vivos = tramos.filter((t) => t.celdas.length);
  const mapa = new Map();
  vivos.forEach((t, i) => {
    for (const [x, z] of t.celdas) mapa.set(clave(x, z), i);
  });

  return { suelo: mapa, tramos: vivos, completa: mapa.size === celdas };
}

/**
 * El rectángulo de una sala que se abre al final de una tirada.
 *
 * Crece en el sentido de la marcha y se centra en el otro eje, y devuelve null
 * si no cabe entero dentro del margen. Recortarlo en vez de rechazarlo daría
 * cavernas en forma de L pegadas al borde, y una caverna pegada al borde tiene
 * media pared en el margen de roca: un metro de roca no es una pared de cueva.
 */
export function rectanguloEn(fx, fz, dx, dz, largo, ancho, veta = () => false) {
  const celdas = [];
  const [ax, az] = dx !== 0 ? [largo, ancho] : [ancho, largo];
  const x0 = dx > 0 ? fx : dx < 0 ? fx - ax + 1 : fx - Math.floor(ax / 2);
  const z0 = dz > 0 ? fz : dz < 0 ? fz - az + 1 : fz - Math.floor(az / 2);
  for (let x = x0; x < x0 + ax; x++) {
    for (let z = z0; z < z0 + az; z++) {
      if (!dentro(x, z) || veta(x, z)) return null;
      celdas.push([x, z]);
    }
  }
  return celdas;
}

// --- las conexiones verticales ------------------------------------------------

/**
 * Busca dónde plantar la conexión que baja de una planta a la siguiente.
 *
 * La escalera sale de una celda de la planta de arriba, corre en línea recta
 * `corrida` celdas, y su pie es el ancla de la planta de abajo. Las celdas por
 * las que pasa NO pueden ser suelo de la planta de arriba: una escalera que baja
 * por encima de su propio pasillo es un agujero en ese pasillo, y eso es el aviso
 * de siempre —abrir un hueco en un muro deja el hueco sin suelo— pero en el techo.
 *
 * Se recorren las celdas en un orden deterministamente revuelto y se toma la
 * primera que vale. Tomar la primera en orden de rejilla pondría las siete
 * conexiones del jharro en la esquina noroeste.
 */
export function buscarEnlace({ suelo, corrida, semilla, veta = () => false }) {
  const rnd = azar(semilla);
  const celdas = [...suelo.keys()].map((k) => k.split(",").map(Number));
  // Revuelto de Fisher-Yates con el generador determinista.
  for (let i = celdas.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [celdas[i], celdas[j]] = [celdas[j], celdas[i]];
  }
  for (const [x, z] of celdas) {
    for (const di of [0, 1, 2, 3]) {
      const [dx, dz] = DIRS[(di + Math.floor(rnd() * 4)) % 4];
      let vale = true;
      let px = x, pz = z;
      for (let k = 1; k <= corrida; k++) {
        px = x + dx * k;
        pz = z + dz * k;
        if (!dentro(px, pz) || veta(px, pz) || suelo.has(clave(px, pz))) { vale = false; break; }
      }
      if (vale) return { arriba: [x, z], abajo: [px, pz], dir: [dx, dz] };
    }
  }
  return null;
}

/**
 * La entrada del jharro, en la planta de arriba.
 *
 * Por el norte y centrada: es por donde llega la trinchera de Corinth. La
 * posición en planta no está atada a la de Corinth —son dos mundos y se pasa de
 * uno a otro por una reja, no por una costura— pero la COTA sí lo está, y eso es
 * lo que hace que bajar los cuatro metros del socavón deje al jugador en el suelo
 * de la planta de arriba y no a medio metro del aire.
 */
export const ENTRADA_PLANTA = PLANTAS.length - 1;
export const ENTRADA = [Math.floor(ANCHO / 2), MARGEN];

/**
 * El plano entero: excava las plantas de arriba abajo y las une.
 *
 * De arriba abajo y no al revés porque la conexión manda: el pie de la escalera
 * que baja de una planta es el ancla de la siguiente, así que la planta de abajo
 * crece desde donde se llega a ella. Al contrario habría que buscar después por
 * dónde se juntan, y lo normal es que no se junten.
 */
/**
 * La semilla por defecto, y por qué es ésta y no otra.
 *
 * La semilla es arbitraria por definición, así que elegirla no es afinar nada
 * mientras el criterio esté escrito y comprobado. El criterio es el de este
 * experimento: que la ciudad cubra la huella que le dio la medida y que la altura
 * libre salga lo más cerca posible de los siete números de Gate City. Se barrieron
 * doce semillas con las dos cosas medidas —el barrido se repite con
 * `node tools/roca.mjs --semillas`— y ésta es la que menos error deja de las que
 * cubren el 100 % de la huella a lo ancho y a lo largo.
 */
export const SEMILLA = 101;

export function planJharro({ semilla = SEMILLA } = {}) {
  const orden = [...PLANTAS].reverse(); // de la de arriba a la más honda
  const total = PLANTAS.reduce((a, p) => a + p.celdas, 0);
  const bovedaObjetivo = Math.round(total * FRACCION_BOVEDA);
  // La caverna se reparte EN PROPORCIÓN al suelo de cada planta, no por orden de
  // llegada. Con un saldo global único se lo gastaban las dos primeras plantas
  // que se excavan —la de arriba y la de −10— y la planta de −14, que es el
  // grueso del pueblo con 104 de las 256 celdas, se quedaba sin una sola bóveda:
  // el sitio principal del jharro, todo de techo bajo. Ninguna cifra lo decía,
  // porque el total de bóveda seguía siendo el 16 % medido.
  const bovedaPlanta = reparte(bovedaObjetivo, PLANTAS.map((p) => p.celdas));
  // Lo que una planta no puede gastar —en cuatro celdas no cabe una caverna— pasa
  // a la siguiente en vez de perderse.
  const presupuesto = { boveda: 0 };

  const plantas = new Array(PLANTAS.length);
  const enlaces = [];
  const avisos = [];
  /**
   * Las celdas que se lleva un túnel, apartadas para siempre.
   *
   * Un túnel se busca cuando la planta de la que sale ya está excavada, pero las
   * de abajo todavía no: sin apuntarlo, la planta siguiente excava por donde ya
   * pasa una escalera. Eso no choca con nada —la celda estaba libre cuando se
   * miró— y el resultado es una galería que atraviesa un túnel: dos suelos a
   * cotas distintas en la misma celda, con las paredes de uno metidas en el otro.
   * Lo cazaron dos pruebas a la vez, la de las paredes y la del túnel, y las dos
   * decían cosas que parecían distintas.
   */
  const reservadas = new Set();

  let ancla = ENTRADA;
  for (let k = 0; k < orden.length; k++) {
    const p = orden[k];
    presupuesto.boveda += bovedaPlanta[p.indice];
    // La veta: dónde NO se puede excavar esta planta porque ya hay otra
    // demasiado cerca en vertical. Se pregunta a la función única de la costura,
    // no se vuelve a escribir el criterio aquí.
    const veta = (x, z) =>
      reservadas.has(`${x},${z}`) || chocaConOtraPlanta(plantas, x, z, p.cota);
    const { suelo, tramos, completa } = excavar({
      celdas: p.celdas,
      semilla: Math.floor(hash2(semilla, p.indice + 1) * 2 ** 31),
      ancla,
      presupuesto,
      veta,
    });
    plantas[p.indice] = { ...p, suelo, tramos };
    if (!completa) {
      // Se excavó menos de lo que pedía el reparto de las bandas. No es grave por
      // sí solo, pero es un descuadre entre lo medido y lo construido, y esos se
      // dicen: callarlo deja el relleno, la densidad de luz y la altura libre
      // medidos contra un objetivo que ya no es el objetivo.
      avisos.push(
        `la planta ${p.cota} m se quedó en ${suelo.size} de ${p.celdas} celdas`
      );
    }

    const siguiente = orden[k + 1];
    if (!siguiente) break;
    const salto = p.cota - siguiente.cota;
    const con = conexionDe(salto);
    const sitio = buscarEnlace({
      suelo,
      corrida: con.corrida,
      semilla: Math.floor(hash2(semilla + 977, p.indice + 1) * 2 ** 31),
      // El túnel de la escalera baja atravesando la roca desde esta planta hasta
      // la siguiente, así que barre TODAS las cotas intermedias: no puede pasar
      // por encima del suelo de ninguna planta, ni de las de arriba ni de la
      // suya. Preguntar solo por la propia dejaría una escalera cruzando el
      // techo de la galería de al lado, que es un agujero en ese techo.
      veta: (x, z) =>
        reservadas.has(`${x},${z}`) || plantas.some((pl) => pl && pl.suelo.has(`${x},${z}`)),
    });
    if (!sitio) {
      // Sin sitio para la escalera la planta de abajo queda suelta, y eso NO se
      // disimula con un valor por defecto: un enlace inventado es un enlace que
      // no se puede construir, y el fallo aparecería como escalones flotando.
      avisos.push(
        `no cabe la ${con.tipo} de ${p.cota} m a ${siguiente.cota} m: ` +
          `hacen falta ${con.corrida} celdas seguidas sin suelo`
      );
      ancla = [Math.floor(ANCHO / 2), Math.floor(FONDO / 2)];
      continue;
    }
    // El túnel se aparta: de la primera celda a la anterior al pie. El pie no,
    // que es suelo de la planta de abajo y tiene que poder excavarse.
    for (let k = 1; k < con.corrida; k++) {
      reservadas.add(`${sitio.arriba[0] + sitio.dir[0] * k},${sitio.arriba[1] + sitio.dir[1] * k}`);
    }
    enlaces.push({
      ...con,
      salto,
      arriba: { planta: p.indice, celda: sitio.arriba },
      abajo: { planta: siguiente.indice, celda: sitio.abajo },
      dir: sitio.dir,
    });
    ancla = sitio.abajo;
  }

  // La caja que de verdad ocupa la ciudad, y cuánto de la huella cubre.
  //
  // Es la cifra que caza el fallo del reparto, y hace falta porque el relleno
  // global no lo caza: 256 celdas en una esquina y 256 repartidas dan el mismo
  // 31 %. Se mide contra la parte excavable —la huella menos el margen de roca—,
  // que es la que se podía ocupar.
  let x0 = ANCHO, x1 = -1, z0 = FONDO, z1 = -1;
  for (const pl of plantas) {
    for (const k of pl.suelo.keys()) {
      const [x, z] = k.split(",").map(Number);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
  }
  const excavable = { ancho: ANCHO - 2 * MARGEN, fondo: FONDO - 2 * MARGEN };
  const cobertura = {
    x: (x1 - x0 + 1) / excavable.ancho,
    z: (z1 - z0 + 1) / excavable.fondo,
  };

  const bovedaPuesta = plantas.reduce(
    (a, pl) => a + pl.tramos.filter((t) => t.tipo === "boveda").reduce((b, t) => b + t.celdas.length, 0),
    0
  );

  return {
    plantas,
    enlaces,
    reservadas,
    avisos,
    medidas: {
      ancho: ANCHO,
      fondo: FONDO,
      celdas: plantas.reduce((a, p) => a + p.suelo.size, 0),
      m2: plantas.reduce((a, p) => a + p.suelo.size, 0) * CELDA * CELDA,
      relleno: plantas.reduce((a, p) => a + p.suelo.size, 0) / (ANCHO * FONDO),
      caja: { x0, x1, z0, z1 },
      cobertura,
      bovedaObjetivo,
      bovedaPuesta,
      enlaces: enlaces.length,
      tramos: plantas.reduce((a, p) => a + p.tramos.length, 0),
    },
  };
}

// --- lo que se pregunta al plano ---------------------------------------------

/** ¿Se pisa la celda (x, z) de la planta p? */
export function transitable(plan, p, x, z) {
  const pl = plan.plantas[p];
  return !!pl && pl.suelo.has(clave(x, z));
}

/**
 * Inunda el jharro desde una celda y devuelve lo que se alcanza. En 3D.
 *
 * Es `alcanzables()` de `corinth.js` con la tercera dimensión puesta, y la
 * diferencia no es cosmética: en un plano llano, dos celdas vecinas se tocan; en
 * un jharro, dos plantas distintas NO se tocan por mucho que sus celdas caigan
 * una encima de otra. Lo único que las une es un enlace, y un enlace es una
 * arista que alguien tuvo que poner.
 *
 * Por eso esta función es la que de verdad juzga el plano: si falta una escalera,
 * una planta entera se queda fuera del conjunto y el jugador nunca la ve. Con el
 * plano plano de Corinth ese fallo no existía.
 *
 * En cuatro direcciones dentro de cada planta, como en Corinth: cruzar en
 * diagonal entre dos esquinas de roca es un paso que no se puede dar.
 */
export function alcanzables(plan, desde = { planta: ENTRADA_PLANTA, celda: ENTRADA }, sin = []) {
  const quitar = new Set(sin);
  const vistas = new Set();
  if (!transitable(plan, desde.planta, desde.celda[0], desde.celda[1])) return vistas;

  // Las aristas verticales, indexadas por celda, para no recorrer la lista entera
  // en cada paso. Un enlace se sube y se baja: una escalera no es de sentido
  // único, y darla por tal escondería la mitad de los fallos de conexión.
  const puertas = new Map();
  plan.enlaces.forEach((e, i) => {
    if (quitar.has(i)) return;
    const a = `${e.arriba.planta},${e.arriba.celda}`;
    const b = `${e.abajo.planta},${e.abajo.celda}`;
    if (!puertas.has(a)) puertas.set(a, []);
    if (!puertas.has(b)) puertas.set(b, []);
    puertas.get(a).push({ planta: e.abajo.planta, celda: e.abajo.celda });
    puertas.get(b).push({ planta: e.arriba.planta, celda: e.arriba.celda });
  });

  const k3 = (p, x, z) => `${p},${x},${z}`;
  const cola = [[desde.planta, desde.celda[0], desde.celda[1]]];
  vistas.add(k3(desde.planta, desde.celda[0], desde.celda[1]));
  while (cola.length) {
    const [p, x, z] = cola.pop();
    for (const [dx, dz] of DIRS) {
      const nx = x + dx, nz = z + dz;
      const k = k3(p, nx, nz);
      if (vistas.has(k) || !transitable(plan, p, nx, nz)) continue;
      vistas.add(k);
      cola.push([p, nx, nz]);
    }
    for (const d of puertas.get(`${p},${x},${z}`) ?? []) {
      const k = k3(d.planta, d.celda[0], d.celda[1]);
      if (vistas.has(k) || !transitable(plan, d.planta, d.celda[0], d.celda[1])) continue;
      vistas.add(k);
      cola.push([d.planta, d.celda[0], d.celda[1]]);
    }
  }
  return vistas;
}

/** A cuántos pasos de la entrada queda cada celda. Para repartir luz y fachadas. */
export function distancias(plan, desde = { planta: ENTRADA_PLANTA, celda: ENTRADA }) {
  const d = new Map();
  if (!transitable(plan, desde.planta, desde.celda[0], desde.celda[1])) return d;
  const puertas = new Map();
  for (const e of plan.enlaces) {
    const a = `${e.arriba.planta},${e.arriba.celda[0]},${e.arriba.celda[1]}`;
    const b = `${e.abajo.planta},${e.abajo.celda[0]},${e.abajo.celda[1]}`;
    if (!puertas.has(a)) puertas.set(a, []);
    if (!puertas.has(b)) puertas.set(b, []);
    puertas.get(a).push([e.abajo.planta, ...e.abajo.celda]);
    puertas.get(b).push([e.arriba.planta, ...e.arriba.celda]);
  }
  const raiz = [desde.planta, desde.celda[0], desde.celda[1]];
  d.set(raiz.join(","), 0);
  const cola = [raiz];
  for (let i = 0; i < cola.length; i++) {
    const [p, x, z] = cola[i];
    const paso = d.get(`${p},${x},${z}`) + 1;
    const vecinas = [
      ...DIRS.map(([dx, dz]) => [p, x + dx, z + dz]),
      ...(puertas.get(`${p},${x},${z}`) ?? []),
    ];
    for (const v of vecinas) {
      const k = v.join(",");
      if (d.has(k) || !transitable(plan, v[0], v[1], v[2])) continue;
      d.set(k, paso);
      cola.push(v);
    }
  }
  return d;
}

/** Las celdas pisables a las que NO se llega. Es el fallo que nadie echa de menos. */
export function aisladas(plan, vistas = alcanzables(plan)) {
  const fuera = [];
  for (const pl of plan.plantas) {
    for (const k of pl.suelo.keys()) {
      if (!vistas.has(`${pl.indice},${k}`)) {
        const [x, z] = k.split(",").map(Number);
        fuera.push({ planta: pl.indice, x, z });
      }
    }
  }
  return fuera;
}

/** El tramo al que pertenece una celda, o null. Lo pregunta la roca y la luz. */
export function tramoDe(plan, p, x, z) {
  const pl = plan.plantas[p];
  if (!pl) return null;
  const i = pl.suelo.get(clave(x, z));
  return i === undefined ? null : pl.tramos[i] ?? null;
}
