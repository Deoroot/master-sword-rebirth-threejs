// Coordenadas de textura de Quake.
//
// Es la parte del formato con mas trampas, asi que va aparte y con sus propias
// pruebas. El resumen:
//
//   1. Se elige uno de seis pares de ejes segun hacia donde mire la cara. Esto
//      es lo que hace que un suelo y una pared no lleven la textura girada
//      aunque nadie lo haya pedido. Los seis pares son los de qbsp, copiados
//      tal cual: no son una eleccion de estilo, son parte del formato.
//   2. Se giran esos ejes por la rotacion de la cara. El giro es en el plano de
//      la textura, no alrededor de la normal, que es el error clasico.
//   3. Se dividen por la escala y se suman los desplazamientos.
//   4. Se divide por el tamano de la textura en pixeles, porque hasta aqui todo
//      va en unidades de Quake, no en repeticiones.
//
// El formato Valve 220 se salta los pasos 1 y 2: trae los dos ejes escritos.

// Los seis pares de ejes, en el orden de qbsp: suelo, techo, y las cuatro
// paredes. El primer vector de cada terna es contra el que se compara la
// normal; los otros dos son los ejes u y v.
export const BASE_AXES = [
  [[0, 0, 1], [1, 0, 0], [0, -1, 0]],   // suelo
  [[0, 0, -1], [1, 0, 0], [0, -1, 0]],  // techo
  [[1, 0, 0], [0, 1, 0], [0, 0, -1]],   // pared oeste
  [[-1, 0, 0], [0, 1, 0], [0, 0, -1]],  // pared este
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]],   // pared sur
  [[0, -1, 0], [1, 0, 0], [0, 0, -1]],  // pared norte
];

/** Tamano por defecto de una textura, en pixeles. Las nuestras son de 128. */
export const DEFAULT_TEXTURE_SIZE = 128;

/** El par de ejes que le toca a una normal. Devuelve [u, v] recien copiados. */
export function baseAxesFor(normal) {
  let best = 0;
  let bestDot = -Infinity;
  for (let i = 0; i < BASE_AXES.length; i++) {
    const a = BASE_AXES[i][0];
    const dot = normal[0] * a[0] + normal[1] * a[1] + normal[2] * a[2];
    // El > estricto importa: con >= una normal a 45 grados elegiria el ultimo
    // eje empatado en vez del primero, y qbsp elige el primero.
    if (dot > bestDot) {
      bestDot = dot;
      best = i;
    }
  }
  return [BASE_AXES[best][1].slice(), BASE_AXES[best][2].slice()];
}

/**
 * Los dos ejes de textura de una cara, ya girados y escalados.
 *
 * Devuelve { u, v, uOffset, vOffset } con u y v en unidades de Quake.
 */
export function textureAxes(plane, align) {
  let u;
  let v;
  let uOffset;
  let vOffset;

  if (align?.valve) {
    u = align.u.slice();
    v = align.v.slice();
    uOffset = align.uOffset;
    vOffset = align.vOffset;
  } else {
    [u, v] = baseAxesFor(plane);
    uOffset = align?.offset?.[0] ?? 0;
    vOffset = align?.offset?.[1] ?? 0;

    const angle = ((align?.rotation ?? 0) * Math.PI) / 180;
    if (angle !== 0) {
      // El giro se hace sobre las dos componentes que los ejes usan de verdad,
      // no sobre x e y a ciegas: para una pared que mira a +X los ejes viven en
      // las componentes y,z, y girar x,y no haria nada.
      const sv = u[0] !== 0 ? 0 : u[1] !== 0 ? 1 : 2;
      const tv = v[0] !== 0 ? 0 : v[1] !== 0 ? 1 : 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      for (const vec of [u, v]) {
        const ns = cos * vec[sv] - sin * vec[tv];
        const nt = sin * vec[sv] + cos * vec[tv];
        vec[sv] = ns;
        vec[tv] = nt;
      }
    }
  }

  // Una escala de cero dejaria las coordenadas en infinito y la cara saldria
  // de un color liso. qbsp trata el cero como uno, y aqui igual.
  const sx = align?.scale?.[0] || 1;
  const sy = align?.scale?.[1] || 1;
  return {
    u: [u[0] / sx, u[1] / sx, u[2] / sx],
    v: [v[0] / sy, v[1] / sy, v[2] / sy],
    uOffset,
    vOffset,
  };
}

/**
 * Coordenada de textura de un punto, en repeticiones.
 *
 * El punto va en unidades de Quake y con los ejes de Quake: esta funcion se
 * llama antes de convertir a metros y a los ejes de Three.js, porque los ejes
 * de textura del .map estan escritos en el sistema de Quake.
 *
 * La v sale negada porque el origen de la textura en Quake esta arriba a la
 * izquierda y en OpenGL abajo a la izquierda. Sin la negacion las texturas
 * salen del reves en vertical, que en una pared de ladrillo no se nota y en un
 * tejado o una puerta si.
 */
export function texCoord(point, axes, size = DEFAULT_TEXTURE_SIZE) {
  const [w, h] = Array.isArray(size) ? size : [size, size];
  const s = point[0] * axes.u[0] + point[1] * axes.u[1] + point[2] * axes.u[2];
  const t = point[0] * axes.v[0] + point[1] * axes.v[1] + point[2] * axes.v[2];
  return [(s + axes.uOffset) / w, -(t + axes.vOffset) / h];
}
