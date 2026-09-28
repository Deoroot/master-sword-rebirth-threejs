// Las texturas de un `.bsp` de GoldSrc: 8 bits indexados con paleta al final.
//
// ── El formato de un `miptex` ───────────────────────────────────────────────
//
//   0..15   nombre, terminado en cero
//   16      uint32  ancho
//   20      uint32  alto
//   24..39  uint32×4  desplazamientos a los cuatro niveles de mip, RELATIVOS al
//           principio del propio miptex. Si el primero vale 0, los píxeles no
//           están en el mapa: se piden a un `.wad` externo.
//   luego   los datos indexados: ancho×alto, y después /4, /16 y /64
//   y AL FINAL  un uint16 con el número de colores y la paleta RGB
//
// **La paleta va DESPUÉS de los datos de mip, con su contador de 2 bytes.**
// Leerla como si empezara en un desplazamiento fijo da una textura de un solo
// color, que se parece muchísimo a «todavía no he puesto texturas» — y por tanto
// es un fallo que uno se cree. El sitio donde empieza se calcula: el final del
// cuarto mip, que mide (ancho/8) × (alto/8).
//
// El control de esa cuenta es que el contador valga 256. En Gate City lo valen
// las 92, que es lo que dice que el desplazamiento está bien sin tener que mirar
// una sola imagen.

/** Cómo se dibuja una textura, deducido de su nombre. */
export const CLASES = {
  normal: "normal",
  // Empieza por `{`: el índice 255 de la paleta es TRANSPARENTE. En Gate City
  // hay una, `{grate1b`, y es una reja: dibujada opaca es una plancha.
  calada: "calada",
  // Empieza por `!` o por `water`: agua, y se mueve. Quieta no se lee como agua,
  // se lee como suelo pintado de azul — la misma lección que el río de Corinth.
  agua: "agua",
  // No se dibuja con su textura: va al fondo. Son 3 822 m², el 11,6 % de la
  // superficie de Gate City, así que dibujarla como una pared más es tapar el
  // mapa con una foto de nubes.
  cielo: "cielo",
  // Animada por cuadros: `+0nombre`, `+1nombre`… El cuadro 0 es el que se ve
  // parado.
  animada: "animada",
  // Emisiva. `info_texlights` de Gate City declara una: `pi_lantern`.
  emisiva: "emisiva",
};

/**
 * La clase de una textura, por su nombre.
 *
 * El orden de las comprobaciones importa: un nombre puede ser `+0~luz` y los
 * prefijos se acumulan. Se resuelven de fuera adentro y se devuelve además el
 * nombre pelado, que es el que agrupa los cuadros de una animación.
 */
export function claseDeTextura(nombre) {
  let n = nombre;
  let calada = false, animada = false, emisiva = false, cuadro = null;
  if (n.startsWith("{")) { calada = true; n = n.slice(1); }
  if (/^\+/.test(n)) { animada = true; cuadro = n[1]; n = n.slice(2); }
  if (n.startsWith("~")) { emisiva = true; n = n.slice(1); }
  const b = n.toLowerCase();
  let clase = CLASES.normal;
  if (/^sky/.test(nombre.toLowerCase())) clase = CLASES.cielo;
  else if (nombre.startsWith("!") || /^water/.test(b)) clase = CLASES.agua;
  else if (calada) clase = CLASES.calada;
  else if (animada) clase = CLASES.animada;
  else if (emisiva) clase = CLASES.emisiva;
  return { clase, base: nombre.startsWith("!") ? n.slice(1) : n, calada, animada, emisiva, cuadro };
}

/**
 * Decodifica un `miptex` a RGBA.
 *
 * `lump` es el lump de texturas entero y `off` el desplazamiento de esta
 * textura dentro de él, que es lo que devuelve `leerTexturas()`.
 *
 * Devuelve `null` si los píxeles no están en el archivo, que es un caso
 * distinto de un error: quiere decir que el mapa pide un `.wad` y hace falta el
 * juego entero.
 */
export function decodificarMiptex(lump, off) {
  if (off + 40 > lump.length) throw new Error(`miptex en ${off}: se sale del lump`);
  const nombre = lump.subarray(off, off + 16).toString("latin1").replace(/\0.*$/, "");
  const ancho = lump.readUInt32LE(off + 16);
  const alto = lump.readUInt32LE(off + 20);
  const mips = [0, 1, 2, 3].map((i) => lump.readUInt32LE(off + 24 + i * 4));
  if (!mips[0]) return null; // los píxeles están en un .wad externo

  if (ancho <= 0 || alto <= 0 || ancho % 16 || alto % 16) {
    // GoldSrc exige múltiplos de 16 porque hay cuatro mips. Si no lo es, los
    // desplazamientos que vienen a continuación no significan lo que digo.
    throw new Error(`${nombre}: ${ancho}×${alto} no es múltiplo de 16`);
  }

  // El final del cuarto mip es donde empieza la paleta. NO es un desplazamiento
  // fijo, y darlo por fijo es el error que devuelve un color plano.
  const finMips = off + mips[3] + (ancho >> 3) * (alto >> 3);
  if (finMips + 2 > lump.length) throw new Error(`${nombre}: la paleta se sale del lump`);
  const nColores = lump.readUInt16LE(finMips);
  if (nColores < 1 || nColores > 256) {
    throw new Error(`${nombre}: la paleta dice tener ${nColores} colores`);
  }
  const pal = lump.subarray(finMips + 2, finMips + 2 + nColores * 3);
  if (pal.length < nColores * 3) throw new Error(`${nombre}: paleta truncada`);

  const idx = lump.subarray(off + mips[0], off + mips[0] + ancho * alto);
  if (idx.length < ancho * alto) throw new Error(`${nombre}: datos de mip truncados`);

  const info = claseDeTextura(nombre);
  const rgba = new Uint8Array(ancho * alto * 4);
  for (let i = 0; i < ancho * alto; i++) {
    const c = idx[i];
    // El índice 255 de una textura `{` es transparente. En las demás es un color
    // como cualquier otro, así que esto NO se puede hacer siempre: dejaría
    // agujeros por donde se ve el fondo del mundo en paredes macizas.
    if (info.calada && c === 255) {
      rgba[i * 4 + 3] = 0;
      continue;
    }
    const p = Math.min(c, nColores - 1) * 3;
    rgba[i * 4] = pal[p];
    rgba[i * 4 + 1] = pal[p + 1];
    rgba[i * 4 + 2] = pal[p + 2];
    rgba[i * 4 + 3] = 255;
  }

  return {
    nombre, ancho, alto, rgba, nColores,
    ...info,
    // Para la sonda: una paleta mal leída da una imagen de un solo color, y eso
    // se nota contando colores distintos, no mirando.
    paleta: Uint8Array.from(pal),
  };
}

/**
 * Cuántos colores distintos tiene una imagen y cuánto brilla.
 *
 * Es la sonda de la parte 2, y su control es el fallo que busca: **una paleta
 * mal leída no da una excepción, da una imagen de un solo color** —o negra— que
 * se parece mucho a no haber puesto texturas todavía. Contar colores distintos
 * la caza; mirar una captura, no, porque una pared de piedra plana y una pared
 * sin textura se parecen bastante en un fotograma de 320 píxeles.
 */
export function variedadDeImagen(rgba) {
  const vistos = new Set();
  let suma = 0, n = 0, min = 255, max = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] === 0) continue;
    vistos.add((rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2]);
    const l = 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
    suma += l; n++;
    if (l < min) min = l;
    if (l > max) max = l;
  }
  return {
    colores: vistos.size,
    luminancia: n ? suma / n : 0,
    contraste: n ? max - min : 0,
    opacos: n,
  };
}
