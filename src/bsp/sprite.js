// Lector de `.spr` de GoldSrc: los carteles animados. Código nuestro.
//
// ── Por qué esto y por qué ahora ────────────────────────────────────────────
//
// Porque quien jugó el mapa señaló lo que faltaba: «el mapa original emitía luces
// desde antorchas… la parte con antorcha tiene una iluminación con flickers, pero
// esa luz no llega al otro túnel». Y las dos mitades de esa frase tienen respuesta
// distinta:
//
//   la luz     YA está. El mapa de luz distingue el farol de la piedra por un
//              factor de diez: `pi_lantern` tiene el mapa de luz a **181 sobre
//              255** de mediana y `rock_07` a **17**. Que la luz no llegue al otro
//              túnel es lo que el compilador horneó, y sus propias capturas del
//              juego enseñan ese túnel igual de negro.
//   la LLAMA   no estaba. `Fire1.spr` se coloca **55 veces** y `Fire2.spr` dos, y
//              son lo que se VE de una antorcha: el charco de luz en la roca ya lo
//              teníamos, pero la fuente era invisible.
//
// O sea que no hace falta un sistema de luz nuestro. Hacía falta dibujar los
// carteles, y este es su lector.
//
// ── El formato, que es casi el `miptex` otra vez ────────────────────────────
//
//   0   char[4]  "IDSP"
//   4   int32    versión: 2 en Half-Life, 1 en Quake
//   8   int32    tipo de orientación
//   12  int32    formato de textura  (sólo en la versión 2)
//   16  float    radio envolvente
//   20  int32    ancho y alto máximos
//   28  int32    cuántos cuadros
//   32  float    longitud de haz
//   36  int32    sincronía
//   40  uint16   colores de la paleta, y a continuación la paleta RGB
//   luego, por cuadro: grupo, origen X e Y, ancho, alto, y los píxeles indexados
//
// La paleta va DELANTE aquí, al contrario que en un `miptex`, donde va detrás de
// los cuatro mips. Son dos formatos parecidos con la paleta en sitios distintos, y
// mezclarlos da una imagen de un solo color — el mismo fallo silencioso de la
// parte 2, con otro archivo.
//
// El control de que el recorrido está bien es que el final calculado caiga en el
// último byte del archivo: 71 926 para `Fire1.spr` y 263 114 para `Fire2.spr`.

import { readFileSync } from "node:fs";

/** Cómo se orienta un cartel. */
export const ORIENTACION = [
  "paralelo_vertical",   // 0  gira sobre su eje Z, siempre de pie
  "de_frente_vertical",  // 1  mira al jugador, siempre de pie
  "paralelo",            // 2  paralelo a la pantalla. Es el de las antorchas.
  "orientado",           // 3  fijo, con los `angles` de la entidad
  "paralelo_girado",     // 4  paralelo a la pantalla y con giro propio
];

/**
 * Cómo se mezcla.
 *
 * Las antorchas son `aditivo`, y eso decide más de lo que parece: en aditivo el
 * negro no aporta nada, así que **no hace falta canal alfa** y tampoco hace falta
 * ordenar por profundidad. Dibujado como opaco, un cartel de fuego es un rectángulo
 * negro con una llama dentro.
 */
export const MEZCLA = ["normal", "aditivo", "alfa_indexado", "alfa_recortado"];

export function leerSpr(ruta) {
  const b = readFileSync(ruta);
  if (b.length < 42) throw new Error(`${ruta}: demasiado corto para ser un .spr`);
  const id = b.subarray(0, 4).toString("latin1");
  if (id !== "IDSP") throw new Error(`${ruta}: no empieza por 'IDSP' sino por '${id}'`);
  const version = b.readInt32LE(4);
  if (version !== 2) {
    throw new Error(
      `${ruta}: versión ${version}. Esto lee GoldSrc (2); la 1 es Quake y no lleva ` +
        `el campo de formato de textura, así que todo lo demás sale desplazado 4 bytes.`
    );
  }
  const tipo = b.readInt32LE(8);
  const formato = b.readInt32LE(12);
  const radio = b.readFloatLE(16);
  const anchoMax = b.readInt32LE(20);
  const altoMax = b.readInt32LE(24);
  const nCuadros = b.readInt32LE(28);
  const nColores = b.readUInt16LE(40);
  if (nColores < 1 || nColores > 256) {
    throw new Error(`${ruta}: la paleta dice tener ${nColores} colores`);
  }
  const pal = b.subarray(42, 42 + nColores * 3);

  const cuadros = [];
  let off = 42 + nColores * 3;
  for (let i = 0; i < nCuadros; i++) {
    if (off + 20 > b.length) throw new Error(`${ruta}: el cuadro ${i} se sale del archivo`);
    const grupo = b.readInt32LE(off);
    if (grupo !== 0) {
      // Un grupo de cuadros lleva por delante una tabla de intervalos. Ninguno de
      // los sprites de este mapa lo usa, y darlo por bueno desplazaría el resto
      // del archivo sin avisar, así que se dice en vez de adivinarlo.
      throw new Error(`${ruta}: el cuadro ${i} es un GRUPO, y esto sólo lee cuadros sueltos`);
    }
    const origenX = b.readInt32LE(off + 4);
    const origenY = b.readInt32LE(off + 8);
    const ancho = b.readInt32LE(off + 12);
    const alto = b.readInt32LE(off + 16);
    const px = b.subarray(off + 20, off + 20 + ancho * alto);
    if (px.length < ancho * alto) throw new Error(`${ruta}: píxeles del cuadro ${i} truncados`);
    cuadros.push({ origenX, origenY, ancho, alto, indices: Uint8Array.from(px) });
    off += 20 + ancho * alto;
  }
  return {
    ruta, version, tipo, formato,
    orientacion: ORIENTACION[tipo] ?? `desconocida(${tipo})`,
    mezcla: MEZCLA[formato] ?? `desconocida(${formato})`,
    radio, anchoMax, altoMax, nColores,
    paleta: Uint8Array.from(pal),
    cuadros,
    // El control: el recorrido tiene que acabar en el último byte del archivo. Si
    // no acaba, algún cuadro se ha leído con otro tamaño y los siguientes salen de
    // cualquier sitio — que no da error, da ruido con forma de imagen.
    bytes: b.length,
    fin: off,
    cuadra: off === b.length,
  };
}

/**
 * Los cuadros de un `.spr` en una sola tira horizontal RGBA.
 *
 * Una tira y no un archivo por cuadro: son 23 cuadros para `Fire1.spr` y el visor
 * los recorre moviendo el `offset` de la textura, que es una resta y no 23
 * descargas. Los cuadros de un `.spr` son todos del mismo tamaño —se comprueba—,
 * así que la tira es exacta y no hace falta un mapa de coordenadas.
 *
 * En los aditivos el alfa se deja a 255 y el negro hace de transparente, que es lo
 * que hace el motor. En los recortados por alfa, el índice 255 es transparente.
 */
export function tiraDeSpr(spr) {
  const { ancho, alto } = spr.cuadros[0];
  for (const c of spr.cuadros) {
    if (c.ancho !== ancho || c.alto !== alto) {
      throw new Error(`${spr.ruta}: los cuadros no miden todos lo mismo (${c.ancho}×${c.alto} contra ${ancho}×${alto})`);
    }
  }
  const n = spr.cuadros.length;
  const rgba = new Uint8Array(ancho * n * alto * 4);
  const recortado = spr.mezcla === "alfa_recortado";
  for (let f = 0; f < n; f++) {
    const c = spr.cuadros[f];
    for (let y = 0; y < alto; y++) {
      for (let x = 0; x < ancho; x++) {
        const i = c.indices[y * ancho + x];
        const dst = (y * ancho * n + f * ancho + x) * 4;
        if (recortado && i === 255) { rgba[dst + 3] = 0; continue; }
        const p = Math.min(i, spr.nColores - 1) * 3;
        rgba[dst] = spr.paleta[p];
        rgba[dst + 1] = spr.paleta[p + 1];
        rgba[dst + 2] = spr.paleta[p + 2];
        rgba[dst + 3] = 255;
      }
    }
  }
  return { rgba, ancho: ancho * n, alto, cuadros: n, anchoCuadro: ancho, altoCuadro: alto };
}

/**
 * El tamaño de un cartel en el mundo, en unidades de GoldSrc.
 *
 * El cuadro trae su propio origen y de ahí sale el rectángulo, igual que en el
 * motor: `left = origenX`, `right = origenX + ancho`, `up = origenY`,
 * `down = origenY − alto`. En los sprites de este mapa sale centrado —origenX
 * es −24 con 48 de ancho— pero no se da por supuesto, porque un cartel
 * descentrado colocado como si estuviera centrado aparece medio metro al lado y
 * eso, en una antorcha, se ve como una llama que no toca su palo.
 */
export function rectanguloDeCuadro(cuadro, escala = 1) {
  return {
    izquierda: cuadro.origenX * escala,
    derecha: (cuadro.origenX + cuadro.ancho) * escala,
    arriba: cuadro.origenY * escala,
    abajo: (cuadro.origenY - cuadro.alto) * escala,
    ancho: cuadro.ancho * escala,
    alto: cuadro.alto * escala,
    // Cuánto se desplaza el centro del rectángulo respecto del `origin` de la
    // entidad. Cero si está centrado.
    centroX: (cuadro.origenX + cuadro.ancho / 2) * escala,
    centroY: (cuadro.origenY - cuadro.alto / 2) * escala,
  };
}
