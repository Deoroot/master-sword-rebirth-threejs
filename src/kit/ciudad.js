// Lo construido del jharro: fachadas contra la roca.
//
// ── Lo que la medida obligó a cambiar, y es el cambio de la parte 3 ─────────
//
// En Corinth, `pueblo.js` coge una parcela vacía, le mete una casa entera dentro
// y la gira hacia la calle más cercana a la llegada. Eso es un pueblo al aire
// libre, y la medida de Gate City dice que un jharro NO se hace así:
//
//   el 54 % de la superficie es roca cruda, y lo construido no llega a un tercio;
//   las casas están pegadas a la cueva, no la cueva construida alrededor de ellas.
//
// O sea que aquí no hay parcelas. Una casa del jharro es un hueco excavado EN LA
// ROCA con una fachada en la boca, y lo que se ve de ella desde la galería es una
// pared de cuatro metros con su puerta. Por dentro no hay nada, igual que en
// Corinth —«las casas no tienen interior, y así se queda»— solo que aquí la
// excusa es mejor: por dentro hay roca.
//
// Y el colocador cambia de criterio: en vez de `rumboDeCalle()` buscando la calle
// más cercana a la llegada, la fachada mira A DONDE HAY HUECO. No hay elección de
// rumbo: la casa está metida en la roca y solo tiene una cara libre, que es la
// que da a la galería. El rumbo lo decide la cueva.
//
// ── La junta, que aquí SÍ sale exacta, y por qué se dice ────────────────────
//
// La parte 3 tenía escrito «hay que resolver la junta entre una fachada recta y
// una pared que no lo es». En este jharro no hace falta, y no por listos: la roca
// de la parte 2 se emitió con las paredes planas en las juntas de celda —flat,
// para que la costura entre plantas y entre tramos fuera exacta— así que la cara
// de roca contra la que se apoya una fachada es un plano de cuatro metros y la
// fachada encaja a hueso. El día que la roca lleve desplazamiento, esta junta
// vuelve a ser un problema, y vuelve a serlo aquí.
//
// Lo que sí hay que resolver es la OTRA junta, la de arriba: una fachada del kit
// mide 3 m y una galería puede medir 2,2. Ver `ALTURA_MURO` más abajo.

import { CELDA, ALTURA_MURO, CARAS, puntoEnCara } from "./house.js";
import {
  PASO_LIBRE, transitable, cotaMundo, tramoDe, distancias, ENTRADA, ENTRADA_PLANTA,
} from "./jharro.js";
import { libreEn, repartirAlturas } from "./roca.js";
import { hash2 } from "../util/noise.js";

/**
 * Cuánto tiene que sobrar por encima de la fachada.
 *
 * La pieza de muro mide 3 m justos. En una galería de 2,2 —que es el 25 % de
 * ellas, porque así lo dice la curva medida— una fachada de tres metros asoma
 * ochenta centímetros POR ENCIMA del techo, o sea que le sale un trozo de casa
 * dentro de la roca y, peor, el techo le atraviesa la puerta. No da error, no
 * cambia ninguna cifra y en una captura de frente la casa se ve entera.
 *
 * Así que lo construido solo cabe donde hay sitio, y eso decide DÓNDE está el
 * pueblo sin que nadie lo elija: en lo ancho. Que es, de paso, lo que hace Gate
 * City — las casas están en las salas, y los pasillos son roca pelada.
 */
export const HOLGURA = 0.3;

/**
 * Cuánto hay que andar desde la entrada antes de que empiece a haber casas.
 *
 * Medido de Gate City: del punto de llegada al área de pueblo más cercana hay
 * **46 m**, y al primer monstruo, 13. O sea que **se entra por la cueva**, no por
 * el pueblo, y lo obvio —una ciudad subterránea con la puerta en la plaza— es
 * justo lo que el mapa de referencia no hace.
 *
 * Sin esta regla el jharro ponía ocho fachadas en la misma planta de la entrada y
 * el pueblo empezaba a cuatro metros de la reja de Corinth: se bajaba el socavón
 * y ya estabas en la plaza. No fallaba nada —el 43 % de zona segura salía clavado
 * igual— y se perdía entero lo que la llegada tiene que contar.
 */
export const LEJOS_DE_LA_ENTRADA = 46;

/**
 * El catálogo, corto a propósito.
 *
 * Gate City coloca 101 adornos de solo 17 modelos, y 55 de sus 58 sprites son el
 * mismo fuego. Lo que llena un sitio no es tener muchas cosas distintas: es
 * repetir. Tres tipos de fachada, y el reparto también sale de ahí — la mayoría
 * son casas y lo demás son las dos o tres cosas que hacen falta.
 */
export const FACHADAS = [
  {
    nombre: "casa",
    peso: 6,
    muro: "plaster_wall_stone_base",
    puerta: "door_wood",
    ventana: "window_square",
  },
  {
    nombre: "taller",
    peso: 2,
    muro: "stone_square",
    puerta: "door_wood_metal_grate",
    ventana: "window_square",
  },
  {
    nombre: "almacen",
    peso: 1,
    muro: "plaster_wall",
    puerta: "door_wood",
    ventana: null,
  },
];

/**
 * De qué cara de la casa es la que da a la galería.
 *
 * ── El eje que está del revés, otra vez ─────────────────────────────────────
 *
 * `house.js` llama «sur» a su cara de z=0, que en el mundo mira hacia +Z. El
 * plano de celdas cuenta las filas de norte a sur, así que la fila z+1 está al
 * SUR y en el mundo está en −Z. Resultado: la cara que `house.js` llama sur mira
 * al NORTE del plano. Es exactamente lo que ya giró media vuelta las doce casas
 * de Corinth, y la traducción vive en un solo sitio —éste— con su prueba.
 */
// La clave es la dirección DE LA GALERÍA AL HUECO DE ROCA, que es como se
// encuentran los sitios; la fachada mira justo al revés, porque está en el hueco
// y da a la galería. Los dos giros seguidos —el del eje y el del sentido— son la
// razón de que este mapa saliera invertido a la primera: estaba escrito «0,-1 →
// sur» con un comentario que explicaba muy bien por qué, y era al revés.
//
// Lo cazó la prueba que le pregunta a la PUERTA YA COLOCADA hacia dónde mira. Y
// aquí ese fallo es peor que en Corinth: allí una casa girada media vuelta se ve
// desde fuera, y aquí la casa está metida en la roca, así que lo que se ve desde
// la galería es una pared lisa de piedra — que en una cueva es exactamente lo que
// uno espera ver.
export const CARA_DE = {
  "0,-1": "norte", // la roca está al norte del plano, o sea en +Z: se mira a −Z
  "0,1": "sur",    // la roca está al sur del plano, en −Z: se mira a +Z
  "1,0": "oeste",  // la roca está al este: se mira a −X
  "-1,0": "este",
};

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const clave = (x, z) => `${x},${z}`;

/**
 * Los sitios donde cabe una fachada.
 *
 * Un sitio es: una celda de galería, un lado suyo que da a roca, y la celda de
 * roca de detrás. Se pide que la celda de roca esté libre —que no sea suelo de
 * ninguna planta ni celda de túnel— porque la casa se mete dentro de ella, y que
 * la galería tenga altura para el muro.
 */
export function sitiosDeFachada(plan, alturas, { lejos = LEJOS_DE_LA_ENTRADA } = {}) {
  const sitios = [];
  const d = distancias(plan);
  const minimo = Math.round(lejos / CELDA); // en celdas de camino, no en línea recta
  const ocupadas = new Set(plan.reservadas);
  for (const pl of plan.plantas) {
    for (const k of pl.suelo.keys()) ocupadas.add(k);
  }
  for (const pl of plan.plantas) {
    const p = pl.indice;
    for (const k of pl.suelo.keys()) {
      const [x, z] = k.split(",").map(Number);
      const libre = libreEn(plan, alturas, p, x, z);
      if (libre < ALTURA_MURO + HOLGURA) continue;
      // Y lo bastante lejos de la entrada, medido POR EL CAMINO y no en línea
      // recta: en un jharro dos celdas pueden estar a diez metros y a cien pasos.
      if ((d.get(`${p},${x},${z}`) ?? Infinity) < minimo) continue;
      const tramo = tramoDe(plan, p, x, z);
      for (const [dx, dz] of DIRS) {
        const nx = x + dx, nz = z + dz;
        if (transitable(plan, p, nx, nz)) continue;
        if (ocupadas.has(clave(nx, nz))) continue;
        sitios.push({
          planta: p, x, z, dx, dz, hueco: [nx, nz], libre, tipo: tramo?.tipo ?? "pasillo",
        });
      }
    }
  }
  return sitios;
}

/**
 * Elige qué sitios se construyen y con qué.
 *
 * Dos reglas, y las dos salen de la medida:
 *
 *   dónde   en las salas y las cavernas, no en los pasillos. En Gate City lo
 *           construido no llega a un tercio de la superficie y el 54 % es roca
 *           cruda: un pasillo excavado es un pasillo excavado, no una calle con
 *           casas. Además es donde hay altura, que es la otra condición.
 *   una por hueco  dos fachadas en la misma celda de roca serían dos casas
 *           metidas en el mismo volumen. Eso no da error: da z-fighting, y un
 *           fotograma fijo no lo caza porque congela la pelea en un ganador.
 */
export function elegirFachadas(sitios, { semilla = 11 } = {}) {
  const puestas = [];
  const usadas = new Set();
  const total = FACHADAS.reduce((a, f) => a + f.peso, 0);
  // Orden determinista y estable: primero las cavernas, luego los cuartos, y
  // dentro de cada uno por un revuelto fijo. Sin orden estable, dos ejecuciones
  // se reparten los huecos distinto y no se puede comparar nada con lo de ayer.
  const rango = { boveda: 0, cuarto: 1, pasillo: 2 };
  const orden = [...sitios]
    .map((s) => ({ s, r: hash2(s.x * 313 + s.planta, s.z * 977 + s.dx * 7 + s.dz * 3) }))
    .sort((a, b) => rango[a.s.tipo] - rango[b.s.tipo] || a.r - b.r);
  for (const { s, r } of orden) {
    if (s.tipo === "pasillo") continue;
    const k = clave(s.hueco[0], s.hueco[1]);
    if (usadas.has(k)) continue;
    usadas.add(k);
    // El tipo, por pesos: la mayoría casas. Repetir es lo que llena un sitio.
    let acumulado = 0;
    let tipo = FACHADAS[0];
    for (const f of FACHADAS) {
      acumulado += f.peso / total;
      if (r < acumulado) { tipo = f; break; }
    }
    puestas.push({ ...s, fachada: tipo.nombre });
  }
  return puestas;
}

/**
 * Las piezas del kit de una fachada, ya en metros de mundo.
 *
 * La casa es una cáscara del kit metida en la celda de roca: sus cuatro paredes
 * están ahí, tres enterradas y una a la vista. Enterrarlas no cuesta nada —por
 * dentro de la roca no hay geometría, así que no se pelea con nada— y ahorra
 * inventarse una pieza de «media casa» que el pack no trae.
 */
export function piezasDeFachada(f, plan) {
  const cara = CARA_DE[`${f.dx},${f.dz}`];
  if (!cara) throw new Error(`lado desconocido: ${f.dx},${f.dz}`);
  const tipo = FACHADAS.find((t) => t.nombre === f.fachada);
  const y = cotaMundo(f.planta);
  // La esquina noroeste de la celda de roca, que es el origen de la cáscara.
  const ox = f.hueco[0] * CELDA;
  const oz = -f.hueco[1] * CELDA;
  const piezas = [
    { pieza: tipo.muro, pos: [ox, y, oz], giro: 0, papel: `${f.fachada} muro` },
  ];
  const puerta = puntoEnCara(1, 1, cara, 0.5, 0);
  piezas.push({
    pieza: tipo.puerta,
    pos: [ox + puerta.x, y + puerta.y, oz + puerta.z],
    giro: puerta.giro,
    papel: `${f.fachada} puerta`,
  });
  if (tipo.ventana) {
    const v = puntoEnCara(1, 1, cara, 0.8, 1.35);
    piezas.push({
      pieza: tipo.ventana,
      pos: [ox + v.x, y + v.y, oz + v.z],
      giro: v.giro,
      papel: `${f.fachada} ventana`,
    });
  }
  return piezas;
}

/**
 * Las juntas de roca que tapa una fachada.
 *
 * Es la función única de la costura entre la roca y lo construido, y la
 * preguntan los dos lados: la roca para NO emitir pared donde la tapa una casa
 * —dos superficies en el mismo plano parpadean— y el colocador para saber dónde
 * puso una. Devuelve un Map de junta a la altura hasta la que llega la fachada,
 * porque la roca tiene que emitir el DINTEL: una fachada mide 3 m y la galería
 * puede medir nueve, y saltarse la pared entera dejaría seis metros de agujero
 * por encima de la casa.
 */
export function juntasDeFachada(fachadas) {
  const m = new Map();
  for (const f of fachadas) {
    m.set(`${f.planta},${f.x},${f.z},${f.dx},${f.dz}`, ALTURA_MURO);
  }
  return m;
}

/**
 * Monta lo construido del jharro.
 *
 * Devuelve `{ fachadas, piezas, medidas }`. Las piezas salen en el formato que ya
 * come `buildFromPlan`, el mismo de Corinth: no hace falta un segundo camino para
 * dibujar esto.
 */
export function montarCiudad(plan, { alturas, semilla, lejos } = {}) {
  const alt = alturas ?? repartirAlturas(plan).alturas;
  const sitios = sitiosDeFachada(plan, alt, { lejos });
  const fachadas = elegirFachadas(sitios, { semilla });
  const piezas = [];
  for (const f of fachadas) {
    for (const q of piezasDeFachada(f, plan)) piezas.push({ ...q, planta: f.planta });
  }
  const usadas = new Map();
  for (const q of piezas) usadas.set(q.pieza, (usadas.get(q.pieza) ?? 0) + 1);
  const porTipo = {};
  for (const f of fachadas) porTipo[f.fachada] = (porTipo[f.fachada] ?? 0) + 1;
  const porPlanta = {};
  for (const f of fachadas) porPlanta[f.planta] = (porPlanta[f.planta] ?? 0) + 1;

  return {
    fachadas,
    piezas,
    juntas: juntasDeFachada(fachadas),
    medidas: {
      sitios: sitios.length,
      fachadas: fachadas.length,
      piezas: piezas.length,
      distintas: usadas.size,
      porTipo,
      porPlanta,
      // Lo que se ve de lo construido: cada fachada enseña una cara de 4 × 3 m.
      // Es la cifra que se compara con «lo construido no llega a un tercio».
      superficie: fachadas.length * CELDA * ALTURA_MURO,
    },
    usadas: [...usadas.entries()].sort((a, b) => b[1] - a[1]),
  };
}
