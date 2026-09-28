// Ruido determinista. Sin dependencias y sin Math.random().
//
// Que sea determinista no es un capricho de pureza: el emisor del pueblo y el
// paisaje de fondo lo usan los dos, y si diera valores distintos en cada
// ejecucion, ni el .map ni las capturas se podrian comparar con los de antes.
// Un arnes de verificacion no puede apoyarse en un generador que cambia.

/** Hash entero de dos coordenadas, de 0 a 1. */
export function hash2(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Ruido de valor interpolado suavemente, de 0 a 1. */
export function valueNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Varias octavas, de -1 a 1. */
export function fbm(x, y, octaves = 4) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * (valueNoise(x * freq + i * 17.3, y * freq - i * 9.1) * 2 - 1);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}
