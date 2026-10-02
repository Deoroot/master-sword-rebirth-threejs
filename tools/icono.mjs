// EL ICONO DEL EJECUTABLE, sacado del icono del juego.
//
//     node tools/icono.mjs    →    build/icono/msr-256.ico
//
// ── Por qué hace falta una herramienta y no basta con apuntar al archivo ───
//
// `../MSC/assets/msr/game.ico` es el icono de Master Sword: Rebirth y mide
// **32x32**, que es lo que medían los iconos cuando se hizo. electron-builder
// exige 256x256 para Windows y se niega en seco:
//
//     ⨯ Icon must be at least 256x256 pixels, provided: 32x32
//
// ── Y por qué por VECINO MÁS CERCANO ───────────────────────────────────────
//
// Porque ampliar x8 con vecino más cercano **no inventa un solo píxel**: cada
// píxel del original se convierte en un cuadrado de 8x8 del mismo color, y el
// icono que sale es el icono que había, magnificado. Cualquier interpolación
// —bilineal, lanczos— sí inventaría: produciría colores que no están en el
// archivo del juego, y entonces el icono ya no sería el suyo sino una versión
// nuestra de él. Siendo contenido ajeno, esa diferencia importa.
//
// Además queda bien: un icono de 1999 a bloques se lee como una decisión, y
// suavizado se lee como un error.
//
// ── Dónde cae, y por qué ahí ───────────────────────────────────────────────
//
// En `build/`, que es donde va TODO lo que se extrae del juego (CLAUDE.md §2,
// regla 2) y que está en `.gitignore`. Es contenido derivado de un asset ajeno:
// no entra al repositorio, igual que no entra el `.bsp`.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { join, dirname } from "node:path";

const ORIGEN = process.env.MSR_ICONO ?? "../MSC/assets/msr/game.ico";
const DESTINO = "build/icono/msr-256.ico";
const ESCALA = 8;                       // 32 x 8 = 256

/** CRC32, que PNG necesita en cada trozo. Node no lo trae expuesto. */
const TABLA = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TABLA[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function trozo(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, "latin1"), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

/** Un PNG RGBA de 8 bits, sin filtros (filtro 0 en cada fila). */
function png(ancho, alto, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8;        // bits por canal
  ihdr[9] = 6;        // color: RGBA
  // 10, 11, 12 = compresión, filtro e interlazado, todos 0 y obligatorios así.
  const filas = Buffer.alloc(alto * (1 + ancho * 4));
  for (let y = 0; y < alto; y++) {
    const dentro = y * (1 + ancho * 4);
    filas[dentro] = 0;      // filtro «ninguno»
    rgba.copy(filas, dentro + 1, y * ancho * 4, (y + 1) * ancho * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    trozo("IHDR", ihdr),
    trozo("IDAT", deflateSync(filas, { level: 9 })),
    trozo("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Saca la primera imagen de un `.ico` clásico: cabecera BITMAPINFOHEADER de 40
 * bytes y píxeles BGRA **de abajo arriba**, que es como los guarda el formato.
 */
function leerIco(ruta) {
  const b = readFileSync(ruta);
  if (b.readUInt16LE(0) !== 0 || b.readUInt16LE(2) !== 1) {
    throw new Error(`${ruta} no parece un .ico`);
  }
  const entrada = 6;
  const ancho = b[entrada] || 256;
  const alto = b[entrada + 1] || 256;
  const bpp = b.readUInt16LE(entrada + 6);
  const off = b.readUInt32LE(entrada + 12);
  const datos = b.subarray(off, off + b.readUInt32LE(entrada + 8));
  if (datos.subarray(1, 4).toString("latin1") === "PNG") {
    throw new Error("el icono ya viene en PNG: este conversor sólo sabe del formato BMP");
  }
  if (bpp !== 32) throw new Error(`sólo se sabe leer 32 bits por píxel, y éste trae ${bpp}`);

  const cabecera = datos.readUInt32LE(0);          // 40
  const rgba = Buffer.alloc(ancho * alto * 4);
  for (let y = 0; y < alto; y++) {
    // De abajo arriba: la fila 0 del archivo es la ÚLTIMA de la imagen.
    const origen = cabecera + (alto - 1 - y) * ancho * 4;
    for (let x = 0; x < ancho; x++) {
      const o = origen + x * 4, d = (y * ancho + x) * 4;
      rgba[d] = datos[o + 2];        // B G R A  ->  R G B A
      rgba[d + 1] = datos[o + 1];
      rgba[d + 2] = datos[o];
      rgba[d + 3] = datos[o + 3];
    }
  }
  return { ancho, alto, rgba };
}

/** Vecino más cercano, entero: cada píxel pasa a ser un cuadrado de `n` x `n`. */
function ampliar({ ancho, alto, rgba }, n) {
  const A = ancho * n, L = alto * n;
  const fuera = Buffer.alloc(A * L * 4);
  for (let y = 0; y < L; y++) {
    const oy = (y / n) | 0;
    for (let x = 0; x < A; x++) {
      const ox = (x / n) | 0;
      rgba.copy(fuera, (y * A + x) * 4, (oy * ancho + ox) * 4, (oy * ancho + ox) * 4 + 4);
    }
  }
  return { ancho: A, alto: L, rgba: fuera };
}

/** Un `.ico` con una sola imagen, en PNG. El 0 en ancho y alto significa 256. */
function escribirIco(imagen) {
  const datos = png(imagen.ancho, imagen.alto, imagen.rgba);
  const cab = Buffer.alloc(6);
  cab.writeUInt16LE(0, 0); cab.writeUInt16LE(1, 2); cab.writeUInt16LE(1, 4);
  const ent = Buffer.alloc(16);
  ent[0] = imagen.ancho >= 256 ? 0 : imagen.ancho;
  ent[1] = imagen.alto >= 256 ? 0 : imagen.alto;
  ent.writeUInt16LE(1, 4);          // planos
  ent.writeUInt16LE(32, 6);         // bits por píxel
  ent.writeUInt32LE(datos.length, 8);
  ent.writeUInt32LE(22, 12);        // 6 + 16
  return Buffer.concat([cab, ent, datos]);
}

const original = leerIco(ORIGEN);
const grande = ampliar(original, ESCALA);
mkdirSync(dirname(DESTINO), { recursive: true });
writeFileSync(DESTINO, escribirIco(grande));
console.log(`${ORIGEN}  ${original.ancho}x${original.alto}` +
  `  ->  ${DESTINO}  ${grande.ancho}x${grande.alto}  (x${ESCALA}, vecino más cercano)`);

// La procedencia se escribe AL LADO, como manda la regla 2: quien encuentre este
// archivo dentro de un año tiene que poder saber de dónde salió sin preguntar.
writeFileSync(join(dirname(DESTINO), "PROCEDENCIA.md"),
  "# De dónde sale el icono\n\n" +
  `- \`msr-256.ico\` ← \`${ORIGEN}\`, el icono del juego (32x32).\n` +
  "- Ampliado x8 por vecino más cercano con `tools/icono.mjs`. No se ha\n" +
  "  interpolado: cada píxel del original es un cuadrado de 8x8, así que los\n" +
  "  colores son exactamente los suyos y no hay ninguno inventado.\n" +
  "- **No es nuestro.** Es contenido de Master Sword: Rebirth, y por eso vive\n" +
  "  aquí, en `build/`, y no en el repositorio. Ver `CREDITOS.md`.\n");
