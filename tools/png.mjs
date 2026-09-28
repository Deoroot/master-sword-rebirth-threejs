// Escribe un PNG desde RGBA. Nuestro, y en treinta líneas útiles.
//
// Hace falta porque este proyecto no tenía forma de escribir una imagen en Node:
// `tools/svg2png.mjs` arranca un Chromium para convertir un SVG, que vale para un
// plano y no para 92 texturas y un atlas de mapa de luz de un megapíxel.
//
// Un PNG es una firma, tres trozos y un CRC por trozo. El filtro 0 —«ninguno»— y
// `zlib` de Node hacen el resto; no hay que elegir predictor porque estas imágenes
// son paletizadas de 64×64 y un atlas de luz, no fotografías.

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const TABLA = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABLA[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function trozo(tipo, datos) {
  const cuerpo = Buffer.concat([Buffer.from(tipo, "latin1"), datos]);
  const out = Buffer.alloc(cuerpo.length + 8);
  out.writeUInt32BE(datos.length, 0);
  cuerpo.copy(out, 4);
  out.writeUInt32BE(crc32(cuerpo), cuerpo.length + 4);
  return out;
}

/**
 * RGBA a PNG. `rgba` son `ancho*alto*4` bytes.
 *
 * El `alpha` se conserva: hace falta para `{grate1b`, la única textura calada de
 * Gate City, y una reja dibujada opaca es una plancha.
 */
export function png(rgba, ancho, alto) {
  if (rgba.length < ancho * alto * 4) {
    throw new Error(`png: ${rgba.length} bytes para ${ancho}×${alto} (hacen falta ${ancho * alto * 4})`);
  }
  // Cada fila va precedida de un byte de filtro. Sin él, `zlib` comprime igual y
  // el PNG no se abre: es el byte que más fácil se olvida del formato.
  const bruto = Buffer.alloc(alto * (ancho * 4 + 1));
  for (let y = 0; y < alto; y++) {
    bruto[y * (ancho * 4 + 1)] = 0;
    Buffer.from(rgba.buffer ?? rgba, rgba.byteOffset ?? 0, rgba.length)
      .copy(bruto, y * (ancho * 4 + 1) + 1, y * ancho * 4, (y + 1) * ancho * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8;  // bits por canal
  ihdr[9] = 6;  // color: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", ihdr),
    trozo("IDAT", deflateSync(bruto, { level: 9 })),
    trozo("IEND", Buffer.alloc(0)),
  ]);
}

/** Lo escribe, creando la carpeta si hace falta. */
export function escribirPng(ruta, rgba, ancho, alto) {
  mkdirSync(dirname(ruta), { recursive: true });
  const b = png(rgba, ancho, alto);
  writeFileSync(ruta, b);
  return b.length;
}

// --- y LEER un PNG, que hace falta por una razón concreta --------------------
//
// Porque apareció la referencia que faltaba: **una captura del juego original del
// mismo sitio que una nuestra**. Con las dos delante, «se ve distinto» deja de ser
// una opinión y pasa a ser un histograma contra otro.
//
// Sin esto, la gamma se calibra contra un criterio inventado —«que no salga
// lavado»— y eso ya falló dos veces en esta sesión: una poniendo la rampa y otra
// quitándola, las dos a ojo sobre una vista.
//
// Sólo lee lo que hace falta: 8 bits, color 2 (RGB) o 6 (RGBA), sin entrelazar.
// Cualquier otra cosa avisa en vez de devolver píxeles plausibles.

import { inflateSync } from "node:zlib";
import { readFileSync } from "node:fs";

export function leerPng(ruta) {
  const b = readFileSync(ruta);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error(`${ruta}: no es un PNG`);
  let p = 8, ancho = 0, alto = 0, bits = 0, color = 0, entrelazado = 0;
  const trozos = [];
  while (p + 8 <= b.length) {
    const len = b.readUInt32BE(p);
    const tipo = b.subarray(p + 4, p + 8).toString("latin1");
    if (tipo === "IHDR") {
      ancho = b.readUInt32BE(p + 8);
      alto = b.readUInt32BE(p + 12);
      bits = b[p + 16];
      color = b[p + 17];
      entrelazado = b[p + 20];
    } else if (tipo === "IDAT") trozos.push(b.subarray(p + 8, p + 8 + len));
    else if (tipo === "IEND") break;
    p += 12 + len;
  }
  if (bits !== 8) throw new Error(`${ruta}: ${bits} bits por canal, y esto lee 8`);
  if (color !== 2 && color !== 6) throw new Error(`${ruta}: tipo de color ${color}, y esto lee 2 (RGB) y 6 (RGBA)`);
  if (entrelazado) throw new Error(`${ruta}: entrelazado, y esto no lo deshace`);
  const canales = color === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(trozos));
  const paso = ancho * canales;
  if (raw.length < (paso + 1) * alto) throw new Error(`${ruta}: faltan datos (${raw.length} de ${(paso + 1) * alto})`);

  // Los cinco filtros por línea. Es la única parte con miga del formato, y
  // equivocarse en uno da una imagen con bandas diagonales — muy reconocible.
  const out = new Uint8Array(ancho * alto * 4);
  const linea = new Uint8Array(paso);
  const previa = new Uint8Array(paso);
  for (let y = 0; y < alto; y++) {
    const f = raw[y * (paso + 1)];
    const src = raw.subarray(y * (paso + 1) + 1, y * (paso + 1) + 1 + paso);
    for (let i = 0; i < paso; i++) {
      const a = i >= canales ? linea[i - canales] : 0;
      const bb = previa[i];
      const c = i >= canales ? previa[i - canales] : 0;
      let v = src[i];
      if (f === 1) v += a;
      else if (f === 2) v += bb;
      else if (f === 3) v += (a + bb) >> 1;
      else if (f === 4) {
        const pp = a + bb - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - bb), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? bb : c;
      } else if (f !== 0) throw new Error(`${ruta}: filtro ${f} en la línea ${y}`);
      linea[i] = v & 0xff;
    }
    for (let x = 0; x < ancho; x++) {
      out[(y * ancho + x) * 4] = linea[x * canales];
      out[(y * ancho + x) * 4 + 1] = linea[x * canales + 1];
      out[(y * ancho + x) * 4 + 2] = linea[x * canales + 2];
      out[(y * ancho + x) * 4 + 3] = canales === 4 ? linea[x * canales + 3] : 255;
    }
    previa.set(linea);
  }
  return { rgba: out, ancho, alto };
}
