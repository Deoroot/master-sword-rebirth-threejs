// Las primitivas de malla generada, en un solo sitio.
//
// Estaban dentro de `boca.js` porque la boca era lo único que generaba
// geometría. Ahora también la generan las vallas, y dos copias de `quad()` es
// exactamente la clase de cosa que se separa sin que nadie se entere: una de las
// dos aprende a calcular la normal y la otra no, y el síntoma son caras negras
// en la mitad del pueblo.
//
// Todo va en metros y en ejes de Three.js: Y arriba, y el mundo crece hacia +X
// y hacia −Z.

export function nuevaMalla() {
  return { pos: [], nor: [], uv: [], idx: [] };
}

/**
 * UV dentro de un recuadro del atlas, envolviendo por dentro de él.
 *
 * El atlas `bauerhaus` es una hoja con muchos materiales, así que una UV que se
 * salga de su recuadro NO da error: da un trozo de tejado en mitad de una
 * pared. Por eso todo lo generado se mapea siempre dentro de un rectángulo
 * declarado, y el resto se envuelve a mano.
 */
export function uvEn(recuadro, s, t, escala = 3.0) {
  const fr = (v) => v - Math.floor(v);
  return [
    recuadro.u0 + fr(s / escala) * (recuadro.u1 - recuadro.u0),
    recuadro.v0 + fr(t / escala) * (recuadro.v1 - recuadro.v0),
  ];
}

/**
 * Añade un cuadrilátero con su normal calculada del propio polígono.
 *
 * La normal se calcula y no se pasa a mano a propósito: una normal escrita a
 * mano que apunte al revés no da error, da una cara negra, y en una pared de
 * cien caras nadie sabe cuál es.
 */
export function quad(m, a, b, c, d, uvs) {
  const base = m.pos.length / 3;
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const len = Math.hypot(n[0], n[1], n[2]);
  n = len > 1e-9 ? [n[0] / len, n[1] / len, n[2] / len] : [0, 1, 0];
  [a, b, c, d].forEach((p, i) => {
    m.pos.push(p[0], p[1], p[2]);
    m.nor.push(n[0], n[1], n[2]);
    m.uv.push(uvs[i][0], uvs[i][1]);
  });
  m.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/** Pega una malla generada al final de otra, recolocando sus indices. */
export function unir(destino, extra) {
  const base = destino.pos.length / 3;
  destino.pos.push(...extra.pos);
  destino.nor.push(...extra.nor);
  destino.uv.push(...extra.uv);
  for (const i of extra.idx) destino.idx.push(base + i);
  return destino;
}

/** Mueve una malla generada a su sitio del mundo. */
export function mover(m, [ox, oy, oz]) {
  if (ox === 0 && oy === 0 && oz === 0) return m;
  for (let i = 0; i < m.pos.length; i += 3) {
    m.pos[i] += ox;
    m.pos[i + 1] += oy;
    m.pos[i + 2] += oz;
  }
  return m;
}

/**
 * Una caja recta, de esquina a esquina. Seis caras, con la UV envuelta.
 *
 * Es lo que hace un poste, un listón o un tablón, que es casi todo lo que
 * necesita una valla. Se le pasa el recuadro del atlas para que la madera sea la
 * misma madera que ya usa el torno.
 */
export function caja(m, [x0, y0, z0], [x1, y1, z1], recuadro) {
  const uv = (s, t) => uvEn(recuadro, s, t);
  const cara = (a, b, c, d, s0, t0, s1, t1) =>
    quad(m, a, b, c, d, [uv(s0, t0), uv(s1, t0), uv(s1, t1), uv(s0, t1)]);
  // Cada cara con sus cuatro esquinas en antihorario visto desde fuera; la
  // normal la recalcula `quad` de todas formas, así que un despiste aquí se
  // corrige solo en vez de dejar una cara negra.
  cara([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], x0, z0, x1, z1); // arriba
  cara([x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], x0, z0, x1, z1); // abajo
  cara([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], x0, y0, x1, y1);
  cara([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], x0, y0, x1, y1);
  cara([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], z0, y0, z1, y1);
  cara([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], z0, y0, z1, y1);
  return m;
}
