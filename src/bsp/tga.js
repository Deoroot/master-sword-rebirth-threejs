// Lector de `.tga`. Código nuestro, como el resto de `src/bsp/`.
//
// Hace falta para dos cosas de Gate City que no viven dentro del `.bsp`:
//
//   las TEXTURAS DE DETALLE  `maps/gatecity_detail.txt` empareja 61 de las 80
//                            texturas del mundo con un `.tga` de `gfx/detail/`.
//   el CIELO                 `skyname "nature1"`: seis `.tga` de `gfx/env/`.
//
// ── El formato, y las dos trampas ──────────────────────────────────────────
//
// Cabecera de 18 bytes:
//
//   0   uint8   longitud del campo de identificación, que va justo detrás
//   1   uint8   tipo de paleta (0 = no hay)
//   2   uint8   tipo de imagen: 2 sin comprimir, 10 con RLE, 3 y 11 en gris
//   3..7        la paleta, que aquí no se usa
//   8   uint16  x de origen
//   10  uint16  y de origen
//   12  uint16  ancho
//   14  uint16  alto
//   16  uint8   bits por píxel: 24 o 32
//   17  uint8   descriptor. **El bit 5 dice si la primera fila es la de ARRIBA.**
//
// Trampa 1: **los bytes van en BGR, no en RGB.** Leerlos en orden da una imagen
// que se ve perfectamente y con los colores cambiados — el cielo azul sale
// naranja, que en un mapa con luz de antorcha es la clase de cosa que uno mira y
// da por buena.
//
// Trampa 2: **la primera fila es la de ABAJO salvo que el bit 5 del descriptor
// diga lo contrario.** Los 127 `.tga` de `gfx/detail/` de Master Sword Rebirth
// vienen de las dos maneras: `tl_dirt.tga` tiene el descriptor a 0 (abajo) y
// `tl_metal.tga` a 8 (abajo también, porque el 8 es el número de bits de alfa,
// no la orientación). Aquí se normaliza SIEMPRE a fila 0 arriba, que es como se
// escriben los PNG del proyecto.
//
// Y el RLE, que es lo único con algo de cuenta: un byte de cabecera por paquete.
// Si el bit 7 está puesto, los otros siete más uno son cuántas veces se repite
// **un** píxel; si no, son cuántos píxeles sueltos vienen detrás. Un paquete RLE
// puede cruzar el final de una fila, y hay lectores que lo cortan ahí — el
// formato no lo prohíbe y estos archivos lo hacen.

/** Los tipos de imagen que este lector entiende. */
export const TIPOS = { crudo: 2, rle: 10, grisCrudo: 3, grisRle: 11 };

/**
 * Decodifica un `.tga` a RGBA con la fila 0 arriba.
 *
 * `buf` es un `Buffer` o `Uint8Array` con el archivo entero.
 *
 * El control de que el recorrido es correcto es el mismo que el de `miptex.js`:
 * **que se consuman exactamente los píxeles que declara la cabecera**, ni uno
 * más ni uno menos. Un RLE mal leído no da error: da una imagen con una banda
 * de basura al final, y en una textura de detalle eso no se ve.
 */
export function decodificarTga(buf, nombre = "(sin nombre)") {
  if (buf.length < 18) throw new Error(`${nombre}: demasiado corto para ser un .tga`);
  const idLen = buf[0];
  const tipoPaleta = buf[1];
  const tipo = buf[2];
  const ancho = buf[12] | (buf[13] << 8);
  const alto = buf[14] | (buf[15] << 8);
  const bpp = buf[16];
  const desc = buf[17];

  if (tipoPaleta !== 0) throw new Error(`${nombre}: .tga con paleta, y este lector no las lee`);
  if (tipo !== TIPOS.crudo && tipo !== TIPOS.rle && tipo !== TIPOS.grisCrudo && tipo !== TIPOS.grisRle) {
    throw new Error(`${nombre}: tipo de imagen ${tipo}, que no es 2, 3, 10 ni 11`);
  }
  if (bpp !== 24 && bpp !== 32 && bpp !== 8) {
    throw new Error(`${nombre}: ${bpp} bits por píxel, y este lector lee 8, 24 y 32`);
  }
  if (ancho <= 0 || alto <= 0) throw new Error(`${nombre}: ${ancho}×${alto}`);

  const canales = bpp >> 3;
  let p = 18 + idLen;
  const n = ancho * alto;
  const rgba = new Uint8Array(n * 4);
  const comprimido = tipo === TIPOS.rle || tipo === TIPOS.grisRle;

  /** Un píxel del archivo a RGBA, deshaciendo el BGR. */
  const pon = (i, o) => {
    if (canales === 1) {
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = buf[o];
      rgba[i * 4 + 3] = 255;
      return;
    }
    rgba[i * 4] = buf[o + 2];
    rgba[i * 4 + 1] = buf[o + 1];
    rgba[i * 4 + 2] = buf[o];
    rgba[i * 4 + 3] = canales === 4 ? buf[o + 3] : 255;
  };

  let i = 0;
  if (!comprimido) {
    if (p + n * canales > buf.length) throw new Error(`${nombre}: los píxeles se salen del archivo`);
    for (; i < n; i++, p += canales) pon(i, p);
  } else {
    while (i < n) {
      if (p >= buf.length) throw new Error(`${nombre}: el RLE se acaba antes que la imagen (${i} de ${n})`);
      const cab = buf[p++];
      const cuenta = (cab & 0x7f) + 1;
      if (cab & 0x80) {
        if (p + canales > buf.length) throw new Error(`${nombre}: paquete RLE truncado`);
        for (let k = 0; k < cuenta && i < n; k++, i++) pon(i, p);
        p += canales;
      } else {
        if (p + cuenta * canales > buf.length) throw new Error(`${nombre}: paquete crudo truncado`);
        for (let k = 0; k < cuenta && i < n; k++, i++, p += canales) pon(i, p);
      }
    }
  }
  if (i !== n) throw new Error(`${nombre}: se leyeron ${i} píxeles de ${n}`);

  // El bit 5 del descriptor puesto significa que la primera fila es la de
  // ARRIBA. Sin él —que es el caso de casi todos— hay que darle la vuelta.
  if (!(desc & 0x20)) {
    const fila = ancho * 4;
    const tmp = new Uint8Array(fila);
    for (let y = 0; y < alto >> 1; y++) {
      const a = y * fila, b = (alto - 1 - y) * fila;
      tmp.set(rgba.subarray(a, a + fila));
      rgba.copyWithin(a, b, b + fila);
      rgba.set(tmp, b);
    }
  }

  return {
    nombre, ancho, alto, rgba, bpp, tipo,
    conAlfa: canales === 4,
    // Cuántos bytes del archivo se consumieron. Es el oráculo: para un `.tga` sin
    // pie, tiene que ser el archivo entero; con pie de TGA 2.0, 26 bytes menos.
    bytesLeidos: p,
  };
}

/**
 * Los seis nombres de un cielo de GoldSrc, en el orden en que los pide el motor.
 *
 * `skyname "nature1"` son `nature1up`, `nature1dn`, `nature1lf`, `nature1rt`,
 * `nature1ft` y `nature1bk`. El que se equivoca de orden o de giro no ve un
 * error: ve costuras, y una costura en un cielo de cueva pasa por geometría.
 */
export const CARAS_DE_CIELO = ["up", "dn", "lf", "rt", "ft", "bk"];
