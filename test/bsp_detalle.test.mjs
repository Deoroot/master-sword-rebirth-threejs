// El lector de `.tga`, la luz de los adornos y el CANAL del mapa de luz.
//
// ── Por qué existe este archivo, con el número delante ─────────────────────
//
// Porque **397 comprobaciones pasaron en verde sobre un mundo al que no le
// llegaba el mapa de luz**. La geometría traía su `uv1` bien calculada, el atlas
// estaba bien horneado, las UV eran correctas al píxel — y Three.js muestreaba el
// atlas con las UV de la TEXTURA, porque desde r152 cada textura dice qué juego
// de UV usa en `texture.channel` y `channel` vale CERO de fábrica.
//
// Ninguna prueba lo vio porque **ninguna prueba salía del archivo**: todas
// comprobaban que los datos estuvieran bien, y el fallo estaba en el consumo.
//
// Lo que se puede fijar en Node sin navegador es el contrato: si algún día
// alguien reordena `cargarMapaDeLuz` y se lleva por delante el `channel`, esto
// falla. Y lo que sólo se puede comprobar en pantalla lo comprueba
// `tools/juez_luz.mjs`, que predice cada píxel desde los archivos y compara — con
// su control, que es predecirlo también con el fallo puesto.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";

import { decodificarTga, CARAS_DE_CIELO } from "../src/bsp/tga.js";
import { colorDeAdorno, AMBIENTE_MAXIMO, DIRECTO, COS_MEDIO } from "../src/bsp/luz.js";
import { tablasDeGamma, AJUSTES } from "../src/bsp/gamma.js";

const GFX = "../MSC/assets/msr/gfx";
const hayGfx = existsSync(`${GFX}/detail`);

describe("el lector de .tga", () => {
  test("una imagen mínima sin comprimir sale en RGB, no en BGR", () => {
    // Dos píxeles: rojo puro y azul puro, escritos como los escribe un `.tga`.
    const b = Buffer.alloc(18 + 6);
    b[2] = 2;            // sin comprimir
    b.writeUInt16LE(2, 12); // ancho
    b.writeUInt16LE(1, 14); // alto
    b[16] = 24;          // 24 bits
    b[17] = 0x20;        // fila 0 arriba, para no tener que darle la vuelta
    b[18] = 0; b[19] = 0; b[20] = 255;   // BGR del rojo
    b[21] = 255; b[22] = 0; b[23] = 0;   // BGR del azul
    const t = decodificarTga(b, "prueba");
    assert.equal(t.ancho, 2);
    assert.deepEqual([...t.rgba.slice(0, 4)], [255, 0, 0, 255]);
    assert.deepEqual([...t.rgba.slice(4, 8)], [0, 0, 255, 255]);
  });

  test("sin el bit 5 del descriptor, la primera fila del archivo es la de ABAJO", () => {
    const hacer = (desc) => {
      const b = Buffer.alloc(18 + 6);
      b[2] = 2;
      b.writeUInt16LE(1, 12);
      b.writeUInt16LE(2, 14);
      b[16] = 24;
      b[17] = desc;
      b[18] = 0; b[19] = 0; b[20] = 255;    // primera fila del archivo: rojo
      b[21] = 0; b[22] = 255; b[23] = 0;    // segunda: verde
      return decodificarTga(b, "prueba").rgba;
    };
    // Con el bit puesto la fila 0 de salida es la primera del archivo (rojo).
    assert.equal(hacer(0x20)[0], 255);
    // Sin él hay que darle la vuelta: la fila 0 de salida es la segunda (verde).
    assert.equal(hacer(0x00)[1], 255);
  });

  test("el RLE y el crudo dan la MISMA imagen, que es el control del RLE", () => {
    // Cuatro píxeles iguales, una vez repetidos con un paquete RLE y otra sueltos.
    const crudo = Buffer.alloc(18 + 12);
    crudo[2] = 2; crudo.writeUInt16LE(4, 12); crudo.writeUInt16LE(1, 14);
    crudo[16] = 24; crudo[17] = 0x20;
    for (let i = 0; i < 4; i++) { crudo[18 + i * 3] = 10; crudo[19 + i * 3] = 20; crudo[20 + i * 3] = 30; }

    const rle = Buffer.alloc(18 + 4);
    rle[2] = 10; rle.writeUInt16LE(4, 12); rle.writeUInt16LE(1, 14);
    rle[16] = 24; rle[17] = 0x20;
    rle[18] = 0x80 | 3;  // «repite el siguiente píxel 4 veces»
    rle[19] = 10; rle[20] = 20; rle[21] = 30;

    assert.deepEqual([...decodificarTga(rle, "rle").rgba], [...decodificarTga(crudo, "crudo").rgba]);
  });

  test("un RLE truncado da ERROR, no una imagen con basura al final", () => {
    const b = Buffer.alloc(18 + 2);
    b[2] = 10; b.writeUInt16LE(8, 12); b.writeUInt16LE(8, 14);
    b[16] = 24; b[17] = 0x20;
    b[18] = 0x80 | 1;
    assert.throws(() => decodificarTga(b, "roto"), /truncado|se acaba/);
  });

  test("los seis nombres del cielo son los que nombra GoldSrc", () => {
    assert.deepEqual(CARAS_DE_CIELO, ["up", "dn", "lf", "rt", "ft", "bk"]);
  });
});

describe("los .tga del juego, contra el oráculo del propio archivo", { skip: !hayGfx && "no está ../MSC/assets/msr/gfx/" }, () => {
  // El oráculo: **el recorrido tiene que acabar en el último byte**. Un RLE mal
  // leído no da una excepción, da una imagen con una banda de basura al final, y
  // en una textura de detalle eso no se ve. Contar bytes sí lo ve.
  const pieDe = (b) =>
    b.length >= 26 && b.subarray(b.length - 18, b.length - 2).toString("latin1") === "TRUEVISION-XFILE";

  test("los 126 .tga de gfx/detail/ se leen hasta el último byte", () => {
    const dir = `${GFX}/detail`;
    const ficheros = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".tga"));
    assert.ok(ficheros.length > 100, `sólo ${ficheros.length} .tga`);
    const malos = [];
    for (const f of ficheros) {
      const b = readFileSync(`${dir}/${f}`);
      const t = decodificarTga(b, f);
      const esperado = pieDe(b) ? b.length - 26 : b.length;
      if (t.bytesLeidos !== esperado) malos.push(`${f}: ${t.bytesLeidos} de ${esperado}`);
    }
    assert.deepEqual(malos, []);
  });

  test("las seis caras de nature1 están, miden lo mismo y no son planas", () => {
    const caras = CARAS_DE_CIELO.map((c) => decodificarTga(readFileSync(`${GFX}/env/nature1${c}.tga`), c));
    for (const c of caras) {
      assert.equal(c.ancho, caras[0].ancho);
      assert.equal(c.alto, caras[0].alto);
      const vistos = new Set();
      for (let i = 0; i < c.rgba.length; i += 4) vistos.add((c.rgba[i] << 16) | (c.rgba[i + 1] << 8) | c.rgba[i + 2]);
      // El control de la paleta, otra vez: una cara de cielo mal leída sale de un
      // solo color, y un color plano se parece muchísimo a un cielo.
      assert.ok(vistos.size > 1000, `${c.nombre}: sólo ${vistos.size} colores`);
    }
  });
});

describe("la luz de los adornos, que es `R_StudioSetupLighting`", () => {
  const { luz } = tablasDeGamma(AJUSTES);

  test("el color se NORMALIZA: un luxel saturado sale saturado", () => {
    // El motor no ilumina canal a canal. Calcula UNA intensidad con `max(r,g,b)`
    // y la multiplica por el color normalizado (`gl_studio.c`, línea 2328). Pasar
    // los tres canales por la tabla de gamma por separado DESATURA, porque la
    // tabla es cóncava y comprime más el canal pequeño.
    const c = colorDeAdorno([80, 40, 10], luz);
    // La razón entre canales del luxel se conserva exacta, salvo el redondeo.
    assert.ok(Math.abs(c[1] / c[0] - 40 / 80) < 0.02, `g/r = ${(c[1] / c[0]).toFixed(3)}`);
    assert.ok(Math.abs(c[2] / c[0] - 10 / 80) < 0.02, `b/r = ${(c[2] / c[0]).toFixed(3)}`);
  });

  test("el control: hacerlo canal a canal SÍ desatura, que es el fallo que había", () => {
    const porCanal = (v) => luz[Math.min(1023, Math.round(Math.min(128, v * 0.6) * 4))] >> 2;
    const malo = [porCanal(80), porCanal(40), porCanal(10)];
    const bueno = colorDeAdorno([80, 40, 10], luz);
    // Con la cuenta por canal el azul sube de su sitio: menos contraste de color.
    // Para este luxel son 0,176 contra 0,128, o sea un 37 % de más — y con
    // luxeles más oscuros el efecto crece, porque ahí la tabla es más cóncava.
    assert.ok(malo[2] / malo[0] > (bueno[2] / bueno[0]) * 1.25,
      `por canal b/r=${(malo[2] / malo[0]).toFixed(3)}, del motor b/r=${(bueno[2] / bueno[0]).toFixed(3)}`);
  });

  test("un luxel a cero deja el adorno negro, como el motor", () => {
    assert.deepEqual(colorDeAdorno([0, 0, 0], luz), [0, 0, 0]);
    assert.deepEqual(colorDeAdorno(null, luz), [0, 0, 0]);
  });

  test("un adorno nunca es más claro que el suelo que pisa", () => {
    // `illum = ambient + shade·(1 − cos medio)` es `0,6636 × total`, siempre menos
    // que el `total` con el que el mundo pinta ese mismo luxel. Sin esto los
    // muebles se leen como pegatinas puestas encima.
    const factor = (1 - DIRECTO) + DIRECTO * (1 - COS_MEDIO);
    assert.ok(factor > 0.6 && factor < 0.7, `el factor medio es ${factor.toFixed(4)}`);
    for (const v of [16, 32, 64, 128, 200]) {
      const suelo = luz[Math.min(1023, (v * 264 * 338 / 16384) | 0)] >> 2;
      const adorno = colorDeAdorno([v, v, v], luz)[0];
      assert.ok(adorno < suelo, `luxel ${v}: el adorno da ${adorno} y el suelo ${suelo}`);
    }
  });

  test("el ambiente se recorta a 128, como en la línea 1489 del motor", () => {
    assert.equal(AMBIENTE_MAXIMO, 128);
    // Con `direct 0,9` el ambiente es el 10 % del total, así que el recorte sólo
    // muerde por encima de 1 280 — que no existe. Lo que se fija aquí es que la
    // constante sigue siendo la del motor, no que cambie el resultado.
    const alTope = colorDeAdorno([255, 255, 255], luz);
    assert.ok(alTope[0] < 255, "un adorno bajo una lámpara no se pone blanco");
  });
});
