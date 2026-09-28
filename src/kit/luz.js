// La luz del jharro.
//
// Bajo tierra la luz no es ambiente: **es el plano**. Al aire libre el sol lo
// enseña todo y la luz solo decide la hora; en una cueva, lo que está iluminado
// es lo que existe, y el reparto de faroles es lo que dice por dónde se pasa y
// dónde estás a salvo.
//
// ── Lo medido, y el cociente que casi lo estropea ──────────────────────────
//
// `npm run bsp -- <ruta> --zonas` sobre Gate City:
//
//   dentro del pueblo   76 luces, una cada  48 m² DE SUELO
//   fuera               42 luces, una cada 113 m² de suelo
//   en conjunto        118 luces, una cada  71 m² de suelo
//   del suelo a su luz  mediana 3,8 m · p90 10,6 · la peor 43,7
//
// La cifra «una cada 71 m²» que venía de la sesión anterior es correcta COMO
// MEDIA y no sirve como reparto: hay dos densidades y su frontera es la zona.
// Repartir 71 m² por todo el jharro convierte las cavernas en pueblo y la
// comprobación sale en verde contra el objetivo.
//
// Y el aviso que se ganó midiendo esto: contadas por metro de HUELLA salen «una
// cada 73 dentro y una cada 510 fuera», o sea SIETE veces, y es falso — fuera del
// pueblo la huella es casi toda roca maciza—. Un cociente con el denominador
// equivocado no da error: da una cifra redonda y convincente.

import { CELDA } from "./house.js";
import { PLANTAS, transitable, cotaMundo } from "./jharro.js";
import { libreEn, celdasTunel, cotaTunel, ALTO_TUNEL } from "./roca.js";
import { nuevaMalla, caja, unir, uvEn } from "./malla.js";
import { MADERA } from "./boca.js";
import { todasLasCeldas, vecinas } from "./zonas.js";
import { hash2 } from "../util/noise.js";

/** Cuántos m² de SUELO por farol, dentro del pueblo. Medido: 3 613 / 76. */
export const SUELO_POR_LUZ_PUEBLO = 48;

/** Y en la cueva. Medido: 4 764 / 42. */
export const SUELO_POR_LUZ_CUEVA = 113;

/**
 * El color y el brillo, copiados del concepto y no del archivo.
 *
 * `info_texlights` de Gate City declara UNA textura emisiva —el farol se ilumina
 * solo— y dice exactamente esto:
 *
 *     "pi_lantern" "255 255 128 100"
 *
 * O sea un blanco cálido tirando a vela. Es lo mismo que usa su
 * `light_environment`, así que el mapa entero está en la misma temperatura: el
 * fuego de dentro y la luz que entra entran en el mismo tono.
 */
export const COLOR = [255 / 255, 255 / 255, 128 / 255];
export const BRILLO = 100;

/**
 * Hasta dónde llega un farol, en metros.
 *
 * Del p90 medido: nueve de cada diez metros de suelo de Gate City tienen su luz
 * a menos de 10,6 m. Un alcance más corto deja agujeros negros que la densidad
 * media no ve; uno más largo hace que la luz deje de ser el plano, porque
 * entonces se ve todo desde todas partes.
 */
export const ALCANCE = 10.6;

/** A qué altura va el farol. Pegado a la pared y por encima de la cabeza. */
export const ALTURA = 2.0;

/** Lo que mide el farol generado: el kit CC0 no trae ninguno. */
export const FAROL = { lado: 0.34, alto: 0.46, brazo: 0.42 };

const k3 = (p, x, z) => `${p},${x},${z}`;

/** El centro de una celda, en metros de mundo. */
export function centroDe(p, x, z) {
  return [x * CELDA + CELDA / 2, cotaMundo(p), -z * CELDA - CELDA / 2];
}

/**
 * Cuántos faroles pide cada zona.
 *
 * De las dos densidades medidas, y no de un número por planta ni de uno cada
 * tantas celdas: lo que se reparte es SUELO.
 */
export function cuantasLuces(zonas) {
  const m2 = (n) => n * CELDA * CELDA;
  return {
    pueblo: Math.round(m2(zonas.pueblo.size) / SUELO_POR_LUZ_PUEBLO),
    cueva: Math.round(m2(zonas.cueva.length) / SUELO_POR_LUZ_CUEVA),
  };
}

/**
 * Reparte `cuantas` luces por un conjunto de celdas, lo más separadas posible.
 *
 * Muestreo del punto más lejano: se empieza por una celda fija y cada farol
 * siguiente va en la celda que está MÁS LEJOS —por el camino, no en línea
 * recta— de todos los faroles ya puestos. Es determinista y no necesita
 * tantear.
 *
 * Por el camino y no en línea recta porque en un jharro dos celdas pueden estar
 * a diez metros y a cien pasos: un farol al otro lado de una pared de roca de un
 * metro no ilumina nada, y una cuenta en línea recta diría que ese rincón ya
 * está atendido.
 */
export function repartir(plan, celdas, cuantas, { semilla = 3 } = {}) {
  if (!celdas.length || cuantas <= 0) return [];
  const dentro = new Set(celdas.map((c) => k3(...c)));
  // La primera: fija por un revuelto determinista, no la primera de la lista —
  // que sería siempre la esquina noroeste de la planta más honda.
  const orden = [...celdas].sort(
    (a, b) => hash2(a[1] * 313 + a[0], a[2] * 977 + semilla) - hash2(b[1] * 313 + b[0], b[2] * 977 + semilla)
  );
  const puestas = [orden[0]];
  const dist = new Map(celdas.map((c) => [k3(...c), Infinity]));

  /** Inunda desde una celda y baja la distancia guardada de cada una. */
  const propagar = (origen) => {
    const vistas = new Map([[k3(...origen), 0]]);
    const cola = [origen];
    for (let i = 0; i < cola.length; i++) {
      const [p, x, z] = cola[i];
      const paso = vistas.get(k3(p, x, z)) + 1;
      for (const v of vecinas(plan, p, x, z)) {
        const k = k3(...v);
        if (vistas.has(k)) continue;
        vistas.set(k, paso);
        cola.push(v);
        if (dentro.has(k) && paso < dist.get(k)) dist.set(k, paso);
      }
    }
    dist.set(k3(...origen), 0);
  };
  propagar(puestas[0]);

  while (puestas.length < cuantas) {
    let mejor = null;
    for (const c of orden) {
      const d = dist.get(k3(...c));
      if (d === 0) continue;
      if (!mejor || d > mejor.d) mejor = { c, d };
    }
    if (!mejor || mejor.d === 0) break;
    puestas.push(mejor.c);
    propagar(mejor.c);
  }
  return puestas;
}

/**
 * Dónde va el farol dentro de su celda: pegado a una pared, si la hay.
 *
 * Un farol en mitad de una caverna de dieciséis metros es una bombilla colgando
 * del vacío. Los de Gate City van en las paredes y en los postes, que es donde
 * los pondría alguien que vive ahí.
 */
export function sitioEnCelda(plan, alturas, p, x, z) {
  const libre = libreEn(plan, alturas, p, x, z);
  const y = cotaMundo(p) + Math.min(ALTURA, libre - 0.5);
  const paredes = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(
    ([dx, dz]) => !transitable(plan, p, x + dx, z + dz)
  );
  const [cx, , cz] = centroDe(p, x, z);
  if (!paredes.length) return { pos: [cx, y, cz], pared: null };
  const lado = paredes[Math.floor(hash2(p * 7919 + x, z * 131) * paredes.length)];
  // Del centro hacia la pared, menos lo que vuela el brazo.
  const off = CELDA / 2 - FAROL.brazo;
  return {
    pos: [cx + lado[0] * off, y, cz - lado[1] * off],
    pared: lado,
  };
}

/**
 * Todos los faroles del jharro.
 *
 * Devuelve las luces —posición, color, alcance— y la malla del farol, que se
 * genera porque el kit CC0 no trae ninguno. Es lo mismo que ya se hizo con las
 * vallas: `src/kit/malla.js` tiene las primitivas.
 */
export function montarLuz(plan, zonas, alturas) {
  const cuantas = cuantasLuces(zonas);
  // Las conexiones van SIEMPRE con farol, y se descuentan del cupo de la cueva.
  //
  // El reparto por densidad recorre celdas de SUELO, y un túnel de escalera o el
  // hueco de un pozo no son suelo de ninguna planta: son celdas del túnel. Así
  // que los siete pasos entre plantas —lo único que une el jharro, y lo único de
  // verdad nuevo del experimento— se quedaron sin una sola luz. Se vio mirando:
  // el pozo era un agujero negro con una mancha iluminada doce metros más abajo,
  // y la densidad medida salía clavada.
  const conexiones = farolesDeConexion(plan);
  const celdasPueblo = [...zonas.pueblo].map((k) => k.split(",").map(Number));
  const puestasPueblo = repartir(plan, celdasPueblo, cuantas.pueblo, { semilla: 3 });
  const puestasCueva = repartir(
    plan, zonas.cueva, Math.max(0, cuantas.cueva - conexiones.length), { semilla: 17 }
  );

  const luces = [];
  const malla = nuevaMalla();
  for (const [zona, lista] of [["pueblo", puestasPueblo], ["cueva", puestasCueva]]) {
    for (const [p, x, z] of lista) {
      const { pos, pared } = sitioEnCelda(plan, alturas, p, x, z);
      luces.push({ planta: p, x, z, zona, pos, color: COLOR, brillo: BRILLO, alcance: ALCANCE });
      unir(malla, generarFarol(pos, pared));
    }
  }
  for (const c of conexiones) {
    luces.push({ ...c, color: COLOR, brillo: BRILLO, alcance: ALCANCE });
    unir(malla, generarFarol(c.pos, c.pared));
  }

  const m2 = (n) => n * CELDA * CELDA;
  const nP = luces.filter((l) => l.zona === "pueblo").length;
  const nC = luces.length - nP;
  const nCon = conexiones.length;
  return {
    luces,
    malla,
    medidas: {
      total: luces.length,
      pueblo: nP,
      cueva: nC,
      suelosPorLuzPueblo: m2(zonas.pueblo.size) / (nP || 1),
      suelosPorLuzCueva: m2(zonas.cueva.length) / (nC || 1),
      suelosPorLuz: m2(zonas.pueblo.size + zonas.cueva.length) / (luces.length || 1),
      contraste: (m2(zonas.cueva.length) / (nC || 1)) / (m2(zonas.pueblo.size) / (nP || 1)),
      conexiones: nCon,
      triangulos: malla.idx.length / 3,
    },
  };
}

/**
 * El farol: una caja en un brazo, generada.
 *
 * Cuatro caras y su tapa, en la franja de madera del mismo atlas que el torno y
 * las vallas, así que sigue siendo una sola llamada de dibujo con el resto de lo
 * generado. La caja es el que ilumina: es el `pi_lantern` de Gate City, o sea la
 * ÚNICA textura emisiva del mapa, y por eso el farol se ve encendido aunque la
 * luz que reparte la ponga el motor.
 */
export function generarFarol(pos, pared) {
  const m = nuevaMalla();
  const [x, y, z] = pos;
  const l = FAROL.lado / 2;
  // La caja del farol.
  caja(m, [x - l, y - FAROL.alto / 2, z - l], [x + l, y + FAROL.alto / 2, z + l], MADERA);
  // El brazo, hacia la pared. Sin pared —en mitad de una caverna— cuelga de
  // arriba, que es la otra forma en que se sostiene una luz.
  const r = 0.05;
  if (pared) {
    const [dx, dz] = pared;
    const a = [x + dx * l, y + FAROL.alto / 2 - r, z - dz * l];
    const b = [x + dx * (l + FAROL.brazo), y + FAROL.alto / 2 + r, z - dz * (l + FAROL.brazo)];
    caja(m, [Math.min(a[0], b[0]) - r, a[1], Math.min(a[2], b[2]) - r],
            [Math.max(a[0], b[0]) + r, b[1], Math.max(a[2], b[2]) + r], MADERA);
  } else {
    caja(m, [x - r, y + FAROL.alto / 2, z - r], [x + r, y + FAROL.alto / 2 + 0.6, z + r], MADERA);
  }
  return m;
}

/**
 * Un farol en cada conexión vertical.
 *
 * En la primera celda del túnel, a la altura de paso sobre la rampa —o sobre el
 * fondo del pozo, que no tiene rampa—. Va pegado a una pared del túnel, que son
 * las dos que no son ni la entrada ni la salida.
 */
export function farolesDeConexion(plan) {
  const out = [];
  for (const e of plan.enlaces) {
    const celdas = celdasTunel(e);
    if (!celdas.length) continue;
    const c = celdas[0];
    const yArriba = cotaMundo(e.arriba.planta);
    const yAbajo = cotaMundo(e.abajo.planta);
    // La cota del suelo del túnel en el centro de esa celda: a media celda de la
    // boca. En un pozo eso ya es el fondo, y ahí el farol va arriba del todo,
    // que es de donde colgaría: alumbrar un pozo desde el fondo es alumbrar el
    // sitio al que se quiere llegar y no el agujero por el que se baja.
    const suelo = e.tipo === "pozo" ? yArriba : cotaTunel(e, CELDA / 2, yArriba, yAbajo);
    const [cx, , cz] = centroDe(e.abajo.planta, c.x, c.z);
    // A un lado del túnel, no en el eje: en el eje de una escalera estorba, y
    // ésa es la lección de la cuerda del torno de Corinth.
    const lateral = [e.dir[1], -e.dir[0]]; // perpendicular a la marcha, en celdas
    const off = CELDA / 2 - FAROL.brazo;
    out.push({
      planta: e.abajo.planta,
      x: c.x,
      z: c.z,
      zona: "cueva",
      conexion: e.tipo,
      pos: [cx + lateral[0] * off, suelo + Math.min(ALTURA, ALTO_TUNEL - 0.5), cz - lateral[1] * off],
      pared: lateral,
    });
  }
  return out;
}

/**
 * A qué distancia se queda cada trozo de suelo de su farol más cercano.
 *
 * Es LA sonda de este reparto, y no la densidad: la densidad media puede estar
 * clavada y haber un rincón a veinte metros de la vela más próxima. Se mide
 * sobre puntos de suelo cada 2 m —la misma rejilla con la que se midió Gate
 * City— y en tres dimensiones, porque un farol en la planta de arriba no
 * ilumina la de abajo.
 */
export function alcanceDeLaLuz(plan, luces, { paso = 2 } = {}) {
  const puntos = [];
  for (const [p, x, z] of todasLasCeldas(plan)) {
    const y = cotaMundo(p);
    for (let i = 0; i < CELDA / paso; i++) {
      for (let j = 0; j < CELDA / paso; j++) {
        puntos.push([
          x * CELDA + (i + 0.5) * paso,
          y,
          -z * CELDA - (j + 0.5) * paso,
          p,
        ]);
      }
    }
  }
  const dist = puntos.map((q) => {
    let mejor = Infinity;
    for (const l of luces) {
      const d = Math.hypot(l.pos[0] - q[0], l.pos[1] - q[1], l.pos[2] - q[2]);
      if (d < mejor) mejor = d;
    }
    return mejor;
  });
  dist.sort((a, b) => a - b);
  const q = (f) => dist[Math.floor((dist.length - 1) * f)];
  return {
    n: dist.length,
    mediana: q(0.5),
    p90: q(0.9),
    peor: dist[dist.length - 1],
    aOscuras: dist.filter((d) => d > ALCANCE).length / dist.length,
  };
}
