// La roca del jharro: el suelo, la bóveda, las paredes y los túneles.
//
// Es el 54 % de lo que se ve, según la medida de Gate City —`rock_07` el 30 %,
// `ms_dirt01` el 17 %, `ground03` el 7 %—, o sea que es la mitad larga del
// trabajo. Y no es un terreno: un terreno tiene cielo y esto tiene TECHO, que es
// la diferencia entera. Gate City cubre el 107 % de su suelo: está todo tapado.
//
// ── Las dos condiciones que no se negocian ──────────────────────────────────
//
//   la altura libre    tiene que dar los percentiles medidos —mediana 2,8 m,
//                      p25 2,3, p75 4,9, p90 9,3, el 55 % por debajo de 3— y se
//                      mide con `src/kit/medir.js`, que es el mismo algoritmo
//                      que `tools/bsp.mjs` usó sobre Gate City. Medido de otra
//                      forma el número no se puede comparar con nada.
//   la costura         una sola función decide de quién es cada celda. Aquí la
//                      costura no es con un `.map` —el jharro no tiene `.map`,
//                      es malla entera como el valle de `hill.mjs`— sino entre
//                      PLANTAS: `chocaConOtraPlanta()` en `jharro.js` dice si dos
//                      plantas caben una sobre otra, y la preguntan los dos
//                      lados: la excavación para no abrir la celda y la bóveda
//                      para saber hasta dónde subir. Con dos copias del criterio,
//                      tocar el grueso de la losa en un sitio mete la bóveda de
//                      una planta dentro del suelo de la otra, y eso no da error:
//                      da dos superficies peleándose por el mismo volumen.
//
// ── De dónde sale la altura de cada sitio ───────────────────────────────────
//
// No de elegirla. Los tramos del plano —pasillo, cuarto, bóveda— se ordenan por
// tipo y se les reparte la CURVA medida por área acumulada: el primer 10 % del
// suelo se lleva la altura del p10, el que hace la mitad se lleva la mediana, y
// el último 10 % la del p90. Así la distribución que sale es la distribución que
// entró, por construcción, y además correlaciona con el tipo: los pasillos se
// llevan los techos bajos y las cavernas los altos, que es lo que hace legible el
// contraste. Repartirla al azar daría los mismos percentiles y un sitio sin
// sentido, con una caverna de nueve metros en mitad de un pasillo.

import { CELDA } from "./house.js";
import { nuevaMalla, quad, unir, uvEn } from "./malla.js";
import { PIEDRA } from "./boca.js";
import { hash2 } from "../util/noise.js";
import {
  PLANTAS, ALTURA_LIBRE_MEDIDA, PASO_LIBRE, GRUESO_ROCA, SEPARACION,
  cotaMundo, plantaEncima, transitable,
} from "./jharro.js";

const ESCALA_UV = 3.0;
const uvPiedra = (s, t) => uvEn(PIEDRA, s, t, ESCALA_UV);

/**
 * La altura libre que le toca al cuantil `q`, según la curva medida.
 *
 * Interpolación recta entre los percentiles medidos, y PLANA fuera de ellos: por
 * debajo del p10 se devuelve el p10 y por encima del p90 el p90. Extrapolar sería
 * inventarse la cola —¿cuánto mide la caverna del percentil 99?— y de eso no hay
 * medida. Con las colas planas, los cinco percentiles medidos salen clavados y no
 * se afirma nada de lo que no se midió.
 */
export function alturaLibreObjetivo(q) {
  const t = ALTURA_LIBRE_MEDIDA;
  if (q <= t[0][0]) return t[0][1];
  if (q >= t[t.length - 1][0]) return t[t.length - 1][1];
  for (let i = 1; i < t.length; i++) {
    if (q <= t[i][0]) {
      const [q0, v0] = t[i - 1];
      const [q1, v1] = t[i];
      return v0 + ((q - q0) / (q1 - q0)) * (v1 - v0);
    }
  }
  return t[t.length - 1][1];
}

/**
 * La corrección de la medida, y por qué NO es hacer trampa.
 *
 * El método de medida —el de `tools/bsp.mjs`, que es el que hay que usar para que
 * los números se puedan comparar— reparte cada cara por su caja en planta sobre
 * una rejilla de 2 m, y en cada casilla empareja el suelo con el techo MÁS BAJO
 * que tenga encima. O sea que un pasillo bajo le baja la cifra a la caverna de al
 * lado. Medido así, un jharro al que se le reparte exactamente la curva de Gate
 * City sale medio metro más bajo de mediana y metro y pico más bajo de p90.
 *
 * Pero ese mismo sesgo está en la medida de Gate City, porque es el mismo
 * algoritmo sobre el mismo tipo de geometría: los 2,8 m de mediana que se copian
 * de objetivo ya vienen sesgados. Así que lo que hay que igualar no es la curva
 * que se reparte, es la curva que se MIDE, y para eso la que se reparte tiene que
 * ir por encima. `GAMMA` es esa corrección, un solo número, y su valor salió de
 * barrerlo y quedarse con el que menos error deja contra los cinco percentiles
 * medidos — no de elegirlo.
 *
 * Con GAMMA = 1 —o sea repartiendo la curva medida tal cual— el jharro sale
 * medido así: mediana 2,5 m, p75 4,0, p90 8,1 y el 67 % por debajo de tres
 * metros. Con 0,66 sale 2,7 · 4,7 · 9,3 y el 56 %, contra los 2,8 · 4,9 · 9,3 y
 * 55 % de Gate City. El barrido está en el informe de `tools/roca.mjs`.
 */
export const GAMMA = 0.66;

/** El orden en que los tipos de tramo se llevan techo, de más bajo a más alto. */
const RANGO = { pasillo: 0, cuarto: 1, boveda: 2 };

/**
 * Reparte la curva medida entre los tramos del plano.
 *
 * Devuelve un Map de "planta,tramo" a la altura libre en metros, y el aviso de
 * cuánto hubo que recortar por abajo.
 *
 * ── El recorte, que es la única desviación y se dice ────────────────────────
 *
 * El p10 medido de Gate City es 0,8 m. Un pasillo de 80 cm no es un pasillo: el
 * jugador mide 2,2 m de paso, así que esos pares suelo-techo de Gate City NO son
 * sitios por donde se anda —son repisas, vigas y salientes por encima de un suelo
 * que sí se pisa—. Copiar el número sin más daría un jharro con una cuarta parte
 * de sus galerías intransitables, y las comprobaciones de altura libre saldrían
 * en verde porque el objetivo se cumpliría a la perfección.
 *
 * Así que lo que se pisa se recorta a la altura de paso y la cola baja se
 * devuelve donde de verdad está en el mapa medido: en las repisas, que se emiten
 * aparte y no estorban. Lo que no se hace es fingir que no hubo recorte.
 */
export function repartirAlturas(plan, { gamma = GAMMA } = {}) {
  const tramos = [];
  for (const pl of plan.plantas) {
    pl.tramos.forEach((t, i) => {
      tramos.push({
        planta: pl.indice,
        tramo: i,
        tipo: t.tipo,
        celdas: t.celdas.length,
        orden: hash2(pl.indice * 131 + i, 7),
      });
    });
  }
  // Por tipo y, dentro del tipo, por un revuelto determinista. El revuelto no es
  // decorativo: sin él, dentro de un mismo tipo la altura crecería con el orden
  // de excavación, y las galerías del principio saldrían todas bajas y las del
  // final todas altas.
  tramos.sort((a, b) => RANGO[a.tipo] - RANGO[b.tipo] || a.orden - b.orden);

  const total = tramos.reduce((a, t) => a + t.celdas, 0);
  const alturas = new Map();
  let recortados = 0;
  let acumulado = 0;
  for (const t of tramos) {
    // El cuantil del CENTRO del tramo, no el de su principio: con el del
    // principio el primer tramo se lleva q=0 siempre y el último nunca llega a 1.
    const q = (acumulado + t.celdas / 2) / total;
    acumulado += t.celdas;
    const bruta = alturaLibreObjetivo(q ** gamma);
    const libre = Math.max(bruta, PASO_LIBRE);
    if (libre > bruta) recortados += t.celdas;
    alturas.set(`${t.planta},${t.tramo}`, libre);
  }
  return { alturas, recortados, total, fraccionRecortada: recortados / total };
}

/**
 * La altura libre de una celda, ya con la costura aplicada.
 *
 * Es la del tramo, salvo que haya otra planta encima: entonces el techo se queda
 * a un grueso de losa de su suelo. Es la MISMA regla que `chocaConOtraPlanta`
 * usó para dejar excavar la celda, mirada desde el otro lado; por eso lo que sale
 * nunca baja de la altura de paso.
 */
export function libreEn(plan, alturas, p, x, z) {
  const pl = plan.plantas[p];
  const i = pl.suelo.get(`${x},${z}`);
  if (i === undefined) return null;
  const suya = alturas.get(`${p},${i}`);
  const arriba = plantaEncima(plan, p, x, z);
  if (!arriba) return suya;
  const hueco = arriba.cota - pl.cota - GRUESO_ROCA;
  return Math.min(suya, hueco);
}

// --- los túneles de las conexiones -------------------------------------------

/**
 * Las celdas que ocupa el túnel de una conexión, con la cota de su suelo.
 *
 * La rampa baja con la pendiente de la pieza de escalera del pack —1,015 m por
 * cada 2,183 m, o sea 24,9°— y no repartiendo el salto entre las celdas que haya:
 * la escalera de piedra se va a apoyar encima, y una rampa más tendida que la
 * pieza deja los escalones flotando al principio y enterrados al final.
 *
 * Después de la carrera de la escalera el túnel sigue llano hasta la celda de
 * llegada. Ese trozo llano es el rellano, y existe porque la carrera casi nunca
 * cae en un número entero de celdas: 4,37 m de escalera en 8 m de túnel.
 */
export function celdasTunel(e) {
  const [ax, az] = e.arriba.celda;
  const [dx, dz] = e.dir;
  const celdas = [];
  // De 1 a `corrida − 1`: la celda `corrida` es el pie, y el pie es de la planta
  // de abajo. Ver el comentario de `conexionDe` en jharro.js.
  for (let k = 1; k < e.corrida; k++) {
    celdas.push({ x: ax + dx * k, z: az + dz * k, k });
  }
  return celdas;
}

/** Lo que mide de alto un túnel: el p25 medido, que es de los sitios estrechos. */
export const ALTO_TUNEL = 2.3;

/** La cota del suelo del túnel a `d` metros de la boca de arriba. */
export function cotaTunel(e, d, yArriba, yAbajo) {
  // Un pozo no tiene rampa: su suelo es el fondo desde el primer centímetro. Y
  // en d = 0 devuelve la cota de ARRIBA porque en d = 0 todavía se está en el
  // borde de la galería de arriba; el hueco empieza justo después.
  if (e.tipo === "pozo") return d <= 0 ? yArriba : yAbajo;
  const t = Math.min(1, Math.max(0, d / e.carrera));
  return yArriba + (yAbajo - yArriba) * t;
}

// --- la malla ------------------------------------------------------------------

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** La esquina noroeste de una celda, en metros de mundo. */
export function esquina(x, z) {
  return [x * CELDA, -z * CELDA];
}

/**
 * Los cuatro lados de una celda, con las esquinas en el orden que hace que la
 * pared mire HACIA DENTRO.
 *
 * Estaba escrito dos veces —aquí y en el pozo— y las dos con el mismo error: el
 * norte y el sur tenían las esquinas al revés, así que esas dos paredes miraban
 * hacia fuera de su celda. Desde dentro no se ven, y como aquí por debajo de las
 * mallas no hay mundo, lo que se ve por ahí es el color del fondo. No lo dice
 * ninguna cifra: las paredes se emiten, se cuentan, y la superficie de pared sale
 * igual mire hacia donde mire.
 *
 * Lo cazó una prueba que le pregunta a cada pared si su normal apunta al centro
 * de su celda. El este y el oeste estaban bien, que es lo que hace que un fallo
 * así aguante: media pared del mundo es correcta y la otra media se ve mal solo
 * desde algunos ángulos.
 */
export function ladosDe(wx, wz, x1, z1) {
  return [
    { d: [1, 0], a: [x1, z1], b: [x1, wz] },   // este
    { d: [-1, 0], a: [wx, wz], b: [wx, z1] },  // oeste
    { d: [0, 1], a: [wx, z1], b: [x1, z1] },   // sur
    { d: [0, -1], a: [x1, wz], b: [wx, wz] },  // norte
  ];
}

/**
 * Un muro vertical entre dos puntos del plano, de `y0` a `y1`.
 *
 * El orden de los dos puntos decide hacia dónde mira: la normal sale de
 * `quad()`, que la calcula del propio polígono. Que la calcule y no se le pase a
 * mano es lo que hace que un despiste dé una pared al revés y no una cara negra
 * imposible de encontrar entre cien.
 */
export function muro(m, [x0, z0], [x1, z1], y0, y1, uv0 = 0) {
  if (Math.abs(y1 - y0) < 1e-6) return;
  const largo = Math.hypot(x1 - x0, z1 - z0);
  quad(
    m,
    [x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0],
    [uvPiedra(uv0, y0), uvPiedra(uv0 + largo, y0), uvPiedra(uv0 + largo, y1), uvPiedra(uv0, y1)]
  );
}

/**
 * Una losa horizontal sobre un rectángulo. `arriba` decide hacia dónde mira.
 *
 * `zNorte` es el borde de Z mayor: el mundo crece hacia −Z según se baja de fila,
 * así que el norte de una celda es su Z más grande. Invertirlos no da error, da
 * una losa mirando al revés, y una losa de bóveda que mira arriba desaparece
 * —solo se ve por dentro de la roca— y además cuenta como SUELO al medir la
 * altura libre, que es peor: la cifra sale y no significa nada.
 */
export function losaRect(m, x0, x1, zNorte, zSur, y, arriba) {
  const uv = [uvPiedra(x0, zNorte), uvPiedra(x1, zNorte), uvPiedra(x1, zSur), uvPiedra(x0, zSur)];
  if (arriba) quad(m, [x0, y, zNorte], [x1, y, zNorte], [x1, y, zSur], [x0, y, zSur], uv);
  else quad(m, [x0, y, zSur], [x1, y, zSur], [x1, y, zNorte], [x0, y, zNorte],
    [uv[3], uv[2], uv[1], uv[0]]);
}

/** Una losa sobre una celda entera. */
export function losa(m, x, z, y, arriba) {
  const [wx, wz] = esquina(x, z);
  losaRect(m, wx, wx + CELDA, wz, wz - CELDA, y, arriba);
}

/**
 * Las juntas donde dos huecos de PLANTAS distintas se tocan sin roca en medio.
 *
 * Aparece cuando una caverna de una planta sube por encima del suelo de otra en
 * la columna de al lado: cada una emite su pared, las dos paredes son el mismo
 * plano, y entre las dos galerías quedan cero centímetros de roca. No es un
 * agujero —cada pared se ve desde su lado y el bobinado tapa— pero tampoco está
 * bien: son dos sitios distintos del pueblo pegados por una hoja de papel.
 *
 * Se mide en vez de taparse. Taparlo de la forma obvia —no dejar que la bóveda
 * suba por encima del suelo del vecino— recorta las cavernas, que son el 16 %
 * medido y la mitad del contraste; y la forma fina es no dejar que dos plantas
 * sean vecinas en planta, que es tocar la excavación entera. Queda para la parte
 * que camina el jharro con un cuerpo, que es la que puede decir si se nota.
 */
export function paredesFinas(plan, alturas) {
  const juntas = [];
  for (const pl of plan.plantas) {
    const y0 = cotaMundo(pl.indice);
    for (const k of pl.suelo.keys()) {
      const [x, z] = k.split(",").map(Number);
      const y1 = y0 + libreEn(plan, alturas, pl.indice, x, z);
      for (const [dx, dz] of DIRS) {
        const nx = x + dx, nz = z + dz;
        if (transitable(plan, pl.indice, nx, nz)) continue;
        for (const otra of plan.plantas) {
          if (otra.indice === pl.indice || !otra.suelo.has(`${nx},${nz}`)) continue;
          const v0 = cotaMundo(otra.indice);
          const v1 = v0 + libreEn(plan, alturas, otra.indice, nx, nz);
          const solape = Math.min(y1, v1) - Math.max(y0, v0);
          if (solape > 0.01) {
            juntas.push({ planta: pl.indice, x, z, otra: otra.indice, nx, nz, solape });
          }
        }
      }
    }
  }
  return juntas;
}

/**
 * Genera la roca entera del jharro.
 *
 * Por planta: una losa de suelo y una de bóveda por celda, una pared por cada
 * lado que da a roca, y un canto por cada junta entre dos celdas con el techo a
 * distinta altura. Más los túneles de las conexiones.
 *
 * ── Los cantos del techo, y por qué van a UN solo lado ──────────────────────
 *
 * Entre un pasillo de 2,3 m y una caverna de 9,3 hay siete metros de pared
 * colgando en la junta. Esa pared solo se ve desde el lado ALTO —desde el
 * pasillo la tapa su propio techo— así que se emite mirando a la caverna y no a
 * los dos lados. Emitirla a los dos sería poner dos superficies en el mismo
 * plano, que es lo que parpadea. Emitirla al lado que no es deja un agujero de
 * siete metros por el que se ve el color del fondo, porque aquí todo es
 * superficie y por debajo de las mallas no hay mundo.
 */
export function generarRoca(plan, { alturas, repisas, gamma, juntas } = {}) {
  const reparto = alturas ? { alturas } : repartirAlturas(plan, { gamma });
  const m = nuevaMalla();
  const cuenta = {
    suelos: 0, bovedas: 0, paredes: 0, cantos: 0, dinteles: 0, fachadas: 0,
    tunel: 0, repisas: 0,
  };

  // Las bocas: las juntas por donde entra o sale un túnel, que NO llevan pared.
  // Se apunta de qué celda a qué celda, para que la pared se salte exactamente
  // esa y no la de al lado.
  const bocas = new Map();
  for (const e of plan.enlaces) {
    const [ax, az] = e.arriba.celda;
    const [dx, dz] = e.dir;
    const [bx, bz] = e.abajo.celda;
    const yA = cotaMundo(e.arriba.planta);
    const yB = cotaMundo(e.abajo.planta);
    bocas.set(`${e.arriba.planta},${ax},${az},${dx},${dz}`, { techo: yA + ALTO_TUNEL });
    bocas.set(`${e.abajo.planta},${bx},${bz},${-dx},${-dz}`, { techo: yB + ALTO_TUNEL });
  }

  const libre = (p, x, z) => libreEn(plan, reparto.alturas, p, x, z);

  for (const pl of plan.plantas) {
    const p = pl.indice;
    const y = cotaMundo(p);
    for (const k of pl.suelo.keys()) {
      const [x, z] = k.split(",").map(Number);
      const h = libre(p, x, z);
      const yt = y + h;

      losa(m, x, z, y, true);
      losa(m, x, z, yt, false);
      cuenta.suelos++;
      cuenta.bovedas++;

      const [wx, wz] = esquina(x, z);
      const x1 = wx + CELDA, z1 = wz - CELDA;
      // Las cuatro esquinas en el orden de DIRS: este, oeste, sur, norte. El sur
      // del plano es +z de celda, que en el mundo es −Z.
      const lados = ladosDe(wx, wz, x1, z1);
      for (const lado of lados) {
        const [dx, dz] = lado.d;
        const nx = x + dx, nz = z + dz;
        const vecina = transitable(plan, p, nx, nz);
        if (!vecina) {
          // La costura con lo construido: donde hay una fachada, la pared de roca
          // no se emite hasta abajo, porque la tapa la casa. Emitirla igual
          // dejaría la cara de roca y la del muro del kit en EL MISMO PLANO, y
          // dos superficies coplanarias no dan error: parpadean al moverse y un
          // fotograma fijo no las caza, porque congela la pelea en un ganador.
          //
          // Lo decide una sola función —`juntasDeFachada()` en ciudad.js— y la
          // preguntan los dos lados, igual que `hayRoca()` en la boca de Corinth.
          const fachada = juntas?.get(`${p},${x},${z},${dx},${dz}`);
          if (fachada !== undefined) {
            const techoCasa = y + fachada;
            // Y el dintel por encima: una fachada mide 3 m y la galería puede
            // medir nueve. Abrir un hueco en un muro deja el resto del muro.
            if (yt > techoCasa + 1e-6) muro(m, lado.a, lado.b, techoCasa, yt);
            cuenta.fachadas++;
            continue;
          }
          const boca = bocas.get(`${p},${x},${z},${dx},${dz}`);
          if (boca) {
            // Un hueco en un muro deja el resto del muro, no lo quita entero.
            //
            // La boca de un túnel mide 2,3 m de alto y la galería de la que sale
            // puede medir nueve. Saltarse la pared entera —que es lo que hacía
            // esto— deja SIETE METROS de agujero por encima de la entrada, y por
            // ahí se ve el color del fondo, porque aquí por debajo de las mallas
            // no hay mundo. Lo que va es el dintel: la pared de la boca para
            // arriba.
            const techoBoca = boca.techo;
            if (yt > techoBoca + 1e-6) muro(m, lado.a, lado.b, techoBoca, yt);
            else if (techoBoca > yt + 1e-6) muro(m, lado.b, lado.a, yt, techoBoca);
            cuenta.dinteles++;
            continue;
          }
          muro(m, lado.a, lado.b, y, yt);
          cuenta.paredes++;
          continue;
        }
        // Dos celdas pisables de la misma planta: comparten suelo, así que solo
        // puede haber canto en el techo. Lo emite la del techo ALTO, que es la
        // única desde la que se ve, y así además lo emite una sola de las dos.
        const hv = libre(p, nx, nz);
        if (h > hv + 1e-6) {
          muro(m, lado.a, lado.b, y + hv, yt);
          cuenta.cantos++;
        }
      }
    }
  }

  // --- los túneles ------------------------------------------------------------
  for (const e of plan.enlaces) {
    unir(m, generarTunel(plan, e, reparto.alturas));
    cuenta.tunel++;
  }

  // --- las repisas ------------------------------------------------------------
  const rep = generarRepisas(plan, reparto.alturas, repisas);
  unir(m, rep.malla);
  cuenta.repisas = rep.cuenta;

  return { malla: m, cuenta, reparto };
}

/**
 * El túnel de una conexión: rampa o pozo, con sus paredes y su techo.
 *
 * El techo del túnel es el p25 medido —2,3 m— y no un número redondo: un túnel de
 * escalera es de los sitios estrechos, que son el 55 % del mapa medido. Pero se
 * mide sobre la RAMPA, no sobre una cota fija, porque un techo plano sobre una
 * rampa de 25° deja 2,3 m arriba y medio metro abajo.
 */
export function generarTunel(plan, e, alturas) {
  const m = nuevaMalla();
  const yArriba = cotaMundo(e.arriba.planta);
  const yAbajo = cotaMundo(e.abajo.planta);
  const [dx, dz] = e.dir;
  const [ax, az] = e.arriba.celda;
  const ALTO = ALTO_TUNEL;

  if (e.tipo === "pozo") {
    // Un pozo es un hueco de una celda: sin suelo arriba, con el suelo de la
    // planta de abajo al fondo, y las cuatro paredes menos la boca por donde se
    // entra. El suelo del fondo lo emite la planta de abajo, que es de quien es
    // esa celda: emitirlo también aquí serían dos losas en el mismo plano.
    const { x, z } = celdasTunel(e)[0];
    const [wx, wz] = esquina(x, z);
    const x1 = wx + CELDA, z1 = wz - CELDA;
    const lados = ladosDe(wx, wz, x1, z1);
    const techo = yArriba + ALTO;
    for (const lado of lados) {
      // Dos lados abiertos y dos cerrados: por arriba se entra desde la galería
      // de la planta de encima, y por abajo se sale al pie, que es suelo de la
      // planta de abajo. Los otros dos son roca de arriba abajo.
      const haciaArriba = lado.d[0] === -dx && lado.d[1] === -dz;
      const haciaAbajo = lado.d[0] === dx && lado.d[1] === dz;
      if (haciaArriba) {
        // El hueco por el que se baja: abierto desde el suelo de arriba hasta el
        // techo. Lo que va por debajo de esa cota es el pozo, y ahí no hay pared
        // porque es por donde se entra.
        continue;
      }
      if (haciaAbajo) {
        // Hacia el pie: abierto lo que mide el paso, y dintel por encima.
        muro(m, lado.a, lado.b, yAbajo + ALTO, techo);
        continue;
      }
      muro(m, lado.a, lado.b, yAbajo, techo);
    }
    // El suelo del pozo y su tapa. El suelo es de ESTA celda, que es del túnel:
    // el pie es la celda siguiente y lo emite su planta.
    losa(m, x, z, yAbajo, true);
    losa(m, x, z, techo, false);
    return m;
  }

  // --- la rampa ---------------------------------------------------------------
  //
  // En trozos de medio metro para que la pendiente sea una cuesta y no un
  // escalón, y con las esquinas COMPARTIDAS entre trozo y trozo: dos trozos
  // contiguos tienen exactamente la misma cara vertical y no queda rendija. Es lo
  // mismo que hacen las tiras del río de Corinth, y por lo mismo sigue cerrando.
  const PASO = 0.5;
  // Del borde de la galería de arriba al borde del pie: `corrida − 1` celdas.
  // Con `corrida` celdas la rampa se metía dentro del pie y emitía allí un
  // segundo suelo encima del de la planta.
  const largo = (e.corrida - 1) * CELDA;
  const n = Math.round(largo / PASO);
  const eje = (d) => {
    // El punto medio del túnel a `d` metros de la boca, y sus dos bordes.
    const bx = (ax + 0.5) * CELDA + dx * d;
    const bz = -(az + 0.5) * CELDA - dz * d;
    const ex = dz !== 0 ? CELDA / 2 : 0;
    const ez = dx !== 0 ? CELDA / 2 : 0;
    return [[bx - ex, bz - ez], [bx + ex, bz + ez]];
  };
  // La boca está en el borde de la celda de arriba, a media celda del centro.
  const d0 = CELDA / 2;
  for (let i = 0; i < n; i++) {
    const da = d0 + i * PASO;
    const db = da + PASO;
    const ya = cotaTunel(e, da - d0, yArriba, yAbajo);
    const yb = cotaTunel(e, db - d0, yArriba, yAbajo);
    const [a0, a1] = eje(da);
    const [b0, b1] = eje(db);
    // El suelo del trozo, mirando arriba.
    quad(
      m,
      [a0[0], ya, a0[1]], [a1[0], ya, a1[1]], [b1[0], yb, b1[1]], [b0[0], yb, b0[1]],
      [uvPiedra(a0[0], a0[1]), uvPiedra(a1[0], a1[1]), uvPiedra(b1[0], b1[1]), uvPiedra(b0[0], b0[1])]
    );
    // El techo, que acompaña a la rampa.
    quad(
      m,
      [b0[0], yb + ALTO, b0[1]], [b1[0], yb + ALTO, b1[1]],
      [a1[0], ya + ALTO, a1[1]], [a0[0], ya + ALTO, a0[1]],
      [uvPiedra(b0[0], b0[1]), uvPiedra(b1[0], b1[1]), uvPiedra(a1[0], a1[1]), uvPiedra(a0[0], a0[1])]
    );
    // Las dos paredes, cada una del suelo a su techo.
    quad(
      m,
      [a0[0], ya, a0[1]], [b0[0], yb, b0[1]], [b0[0], yb + ALTO, b0[1]], [a0[0], ya + ALTO, a0[1]],
      [uvPiedra(da, ya), uvPiedra(db, yb), uvPiedra(db, yb + ALTO), uvPiedra(da, ya + ALTO)]
    );
    quad(
      m,
      [b1[0], yb, b1[1]], [a1[0], ya, a1[1]], [a1[0], ya + ALTO, a1[1]], [b1[0], yb + ALTO, b1[1]],
      [uvPiedra(db, yb), uvPiedra(da, ya), uvPiedra(da, ya + ALTO), uvPiedra(db, yb + ALTO)]
    );
  }
  return m;
}

/**
 * La repisa: lo que vuela de la pared y lo que mide a lo largo.
 *
 * Los dos números salen de medir el resultado, no de elegirlos, y el primer
 * intento —un metro de vuelo por los cuatro de la celda— enseñó por qué hacía
 * falta medir: una repisa así se lleva por delante mucho más de lo que ocupa.
 * El emparejamiento cuenta, en cada casilla de 2 m, el techo MÁS BAJO que hay
 * encima, así que una repisa que toca una casilla le borra la bóveda a todas las
 * muestras de esa casilla. Con el metro por cuatro, la mediana del jharro caía de
 * 2,6 a 2,3 m y el 73 % del sitio quedaba por debajo de tres metros, cuando lo
 * medido es el 55 %. O sea: un adorno de roca que no estorba a nadie estaba
 * decidiendo la escala del pueblo entero.
 */
export const REPISA = {
  fondo: 0.9,
  largo: 1.6,
  /**
   * Qué fracción de las celdas de techo bajo con pared llevan repisa.
   *
   * Uno: todas. Y aun así el p10 medido se queda en 1,2 m contra los 0,8 de Gate
   * City, que es la única de las siete cifras que no llega. Bajarlo más pediría
   * plantar todos los salientes a ochenta centímetros clavados, y eso ya no es
   * reproducir la curva medida, es forzar un número. Se deja dicho en vez de
   * disimulado.
   */
  fraccion: 1.0,
};

/**
 * Las repisas: los salientes de roca que devuelven la cola baja de la medida.
 *
 * El p10 de Gate City es 0,8 m de altura libre, y el p25 son 2,3. Entre los dos
 * hay una cuarta parte del mapa por debajo de la altura de paso de un jugador, o
 * sea que esa cuarta parte NO son galerías: son salientes, vigas y repisas por
 * encima de un suelo que sí se pisa. El emparejamiento suelo-techo los cuenta
 * igual, porque no sabe si por debajo se anda.
 *
 * Así que aquí se emiten donde de verdad están: pegadas a la pared, ocupando un
 * metro de los cuatro de la celda, y a una altura sacada de la parte baja de la
 * misma curva medida. La galería sigue teniendo sus 2,3 m por el centro y la
 * medida recupera su cola, que es lo que pasa en el mapa que se midió.
 *
 * Cuántas: las que hagan falta para que la fracción por debajo de la altura de
 * paso sea la medida. Ese número sale de la curva, no de tantear.
 */
export function generarRepisas(plan, alturas, opciones = {}) {
  const { fondo = REPISA.fondo, largo = REPISA.largo, fraccion = REPISA.fraccion } = opciones;
  const m = nuevaMalla();
  // Dónde cae la altura de paso en la curva medida: ésa es la fracción de suelo
  // que tiene que quedar por debajo de ella.
  let qPaso = 0;
  for (let q = 0; q <= 1; q += 0.001) {
    if (alturaLibreObjetivo(q) >= PASO_LIBRE) { qPaso = q; break; }
  }
  // `qCurva` es dónde la curva medida alcanza la altura de paso: por debajo de
  // ese cuantil está la cola que no se anda. `qPaso` es cuántas celdas llevan
  // repisa, que es otra cosa y se calibra midiendo.
  const qCurva = qPaso;
  if (fraccion !== null) qPaso = fraccion;
  let cuenta = 0;
  for (const pl of plan.plantas) {
    const p = pl.indice;
    const y = cotaMundo(p);
    for (const k of pl.suelo.keys()) {
      const [x, z] = k.split(",").map(Number);
      // Una por celda como mucho, y solo en las que tienen pared: una repisa en
      // el aire no es una repisa.
      const lados = DIRS.filter(([dx, dz]) => !transitable(plan, p, x + dx, z + dz));
      if (!lados.length) continue;
      const libre = libreEn(plan, alturas, p, x, z);
      // Solo donde el techo YA es bajo, o sea en pasillos y cuartos.
      //
      // Es la corrección que más movió las cifras, y no era evidente: una repisa
      // puesta en una caverna de nueve metros le borra la bóveda a su casilla de
      // medida entera —el emparejamiento se queda con el techo más bajo— así que
      // repartir las repisas a voleo por todo el jharro no añadía cola baja: se
      // comía la cola ALTA. El p75 caía de 4,4 a 3,6 m y el 16 % de caverna
      // medido se quedaba en el 9 %. Una repisa en una caverna es un saliente
      // perfectamente razonable y encima es donde uno pondría un mirador; lo que
      // pasa es que la medida no puede distinguirla del techo.
      if (libre > alturaLibreObjetivo(0.5)) continue;
      const r = hash2(x * 31 + p * 7919, z * 17 + 13);
      if (r >= qPaso) continue;
      // La altura sale de la parte baja de la curva —de cero al cuantil donde la
      // curva medida alcanza la altura de paso— y el sorteo se normaliza para que
      // se recorra esa banda entera sea cual sea la fracción de celdas con
      // repisa. Sin normalizar, pedir más repisas las subía a todas: el sorteo
      // multiplicaba por la propia fracción y la cola baja no llegaba nunca.
      const h = alturaLibreObjetivo((r / qPaso) * qCurva);
      // Una repisa tiene que quedar por debajo del techo de su galería, y con
      // sitio. Si no cabe, no se pone: media repisa metida en la bóveda es dos
      // superficies en el mismo volumen.
      if (h + 0.2 > libre) continue;
      const lado = lados[Math.floor(hash2(p, x * 97 + z) * lados.length)];
      const [wx, wz] = esquina(x, z);
      const x1 = wx + CELDA, z1 = wz - CELDA;
      // El rectángulo que ocupa: una banda de un metro pegada a ese lado.
      // Centrada en su lado y del largo que se le pida. Del ancho entero de la
      // celda NO: ver el comentario de `REPISA`.
      const s0 = (CELDA - largo) / 2;
      const caja =
        lado[0] === 1 ? [x1 - fondo, wz - s0, x1, z1 + s0]
        : lado[0] === -1 ? [wx, wz - s0, wx + fondo, z1 + s0]
        : lado[1] === 1 ? [wx + s0, z1 + fondo, x1 - s0, z1]
        : [wx + s0, wz, x1 - s0, wz - fondo];
      const [rx0, rz0, rx1, rz1] = caja;
      // Solo la cara de ABAJO: la de arriba no se ve —está pegada a la pared y
      // por encima de ella no anda nadie— y emitirla la contaría como SUELO al
      // medir, que es justo lo que no es. La medida empareja suelos con techos, y
      // una repisa es un techo.
      losaRect(m, rx0, rx1, rz0, rz1, y + h, false);
      cuenta++;
    }
  }
  return { malla: m, cuenta, qPaso };
}
