// El lector de `.bsp`: cabeceras, texinfo, caras, y el mapa de luz.
//
// ── Por qué estas pruebas tienen oráculo y las de antes no ──────────────────
//
// Casi todas las comprobaciones de este proyecto miden lo nuestro contra lo que
// dijimos que queríamos. Éstas miden un lector contra un archivo que ya existe, y
// ese archivo lleva escritos dentro los números que el lector tiene que producir:
// 2 126 793 bytes de mapa de luz, 92 texturas con 256 colores cada una, 15 660
// caras en un lump de 313 200 bytes. **Si el lector se equivoca, no cuadran.**
//
// Es la primera vez en este experimento que una sonda tiene un juez que no
// escribimos nosotros, y por eso cazaron un fallo que ninguna captura habría
// enseñado: 951 parches de mapa de luz un luxel más grandes de lo que el archivo
// guardó, por acumular una suma en doble donde el compilador usó `float`.
//
// El `.bsp` NO está en el repositorio y no se copia: sigue en `../MSC/`. Si no
// está, estas pruebas se saltan y lo dicen, porque una prueba que se salta en
// silencio es una prueba que dice que sí.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import {
  leerBsp, leerModelos, leerTexinfo, leerTexturas, leerEntidades, leerCaras,
  leerTodasLasCaras, parcheDeLuz, tieneLuz, proyS, proyT, areaPoligono,
  aEscena, vectorAEscena, UNIDADES_POR_METRO, LUXEL, LUMPS, origen,
} from "../src/bsp/lector.js";
import { contabilidad, empaquetar, pintarAtlas, histograma, uvDeLuz, MARGEN } from "../src/bsp/luz.js";
import { decodificarMiptex, claseDeTextura, variedadDeImagen, CLASES } from "../src/bsp/miptex.js";
import { emitirMalla, conEntidad, reservarLuxeles, MODOS_RENDER } from "../src/bsp/malla.js";
import { halo } from "../src/bsp/halo.js";
import {
  abrirMdl, leerMdl, texturasDe, mallaDe, cuaternionDeEuler, matrizDeAngulos,
  componer, porMatriz,
} from "../src/bsp/mdl.js";
import { luzEnSuelo } from "../src/bsp/luz.js";
import { tablasDeGamma, AJUSTES, valorDeEstilo, ESTILO_NORMAL } from "../src/bsp/gamma.js";
import { NUCLEO, CAIDA } from "../src/bsp/halo.js";
import { png } from "../tools/png.mjs";

const RUTA = "../MSC/assets/msr/maps/gatecity.bsp";
const HAY = existsSync(RUTA);

// --- lo que no necesita el archivo ------------------------------------------

describe("la escala y los ejes", () => {
  test("GoldSrc mide en pulgadas: 39,37 unidades por metro, no 32", () => {
    // El aviso más viejo de este experimento. Se fija en una prueba porque leer
    // este `.bsp` con las 32 de Quake NO falla: sale un mapa plausible un 19 %
    // más grande, con el jugador convertido en un enano.
    assert.equal(UNIDADES_POR_METRO, 39.37);
    assert.notEqual(UNIDADES_POR_METRO, 32);
    // Y el control: 72 unidades son los seis pies del jugador de Half-Life.
    assert.ok(Math.abs(72 / UNIDADES_POR_METRO - 1.83) < 0.01);
  });

  test("el cambio de ejes conserva la mano derecha", () => {
    // Si no la conservara, el bobinado de las caras dejaría de ser válido y las
    // normales apuntarían hacia dentro — o sea, la mitad del mundo invisible en
    // un renderizador que recorta caras traseras.
    const x = vectorAEscena([1, 0, 0]);
    const y = vectorAEscena([0, 1, 0]);
    const z = vectorAEscena([0, 0, 1]);
    const det =
      x[0] * (y[1] * z[2] - y[2] * z[1]) -
      x[1] * (y[0] * z[2] - y[2] * z[0]) +
      x[2] * (y[0] * z[1] - y[1] * z[0]);
    assert.equal(det, 1);
  });

  test("un punto en unidades sale en metros y con Y arriba", () => {
    const p = aEscena([UNIDADES_POR_METRO, 2 * UNIDADES_POR_METRO, 3 * UNIDADES_POR_METRO]);
    assert.ok(Math.abs(p[0] - 1) < 1e-9);
    assert.ok(Math.abs(p[1] - 3) < 1e-9); // la Z de GoldSrc es la Y de Three.js
    assert.ok(Math.abs(p[2] + 2) < 1e-9); // y la Y va negada
  });

  test("el espaciado de luxel es 16", () => {
    assert.equal(LUXEL, 16);
  });

  test("son quince lumps y en su orden", () => {
    assert.equal(LUMPS.length, 15);
    assert.equal(LUMPS[7], "caras");
    assert.equal(LUMPS[8], "luz");
  });
});

describe("el parche de mapa de luz, con números a mano", () => {
  // Un `texinfo` de juguete: S es la X y T es la Y, sin desplazamiento.
  const ti = { s: [1, 0, 0, 0], t: [0, 1, 0, 0], miptex: 0, flags: 0 };

  test("el tamaño lleva un «+1» y no es el ancho entre 16", () => {
    // De 0 a 64 unidades hay cuatro tramos de 16 y CINCO líneas de luxel. El
    // error de uno da un mapa desplazado medio luxel: se ve bien en una captura
    // y mal en movimiento.
    const p = parcheDeLuz([[0, 0, 0], [64, 0, 0], [64, 32, 0], [0, 32, 0]], ti);
    assert.equal(p.ancho, 5);
    assert.equal(p.alto, 3);
    assert.equal(p.origenS, 0);
    assert.equal(p.origenT, 0);
  });

  test("los luxels son las LÍNEAS de la rejilla, no las casillas", () => {
    // Es lo que de verdad significa el «+1», y escribí esta prueba mal a la
    // primera esperando 1×1: una cara de OCHO unidades —media casilla— pide DOS
    // luxels, porque cruza la línea del cero y la del dieciséis. Sólo una cara de
    // extensión nula pide uno.
    const media = parcheDeLuz([[0, 0, 0], [8, 0, 0], [8, 8, 0]], ti);
    assert.equal(media.ancho, 2);
    assert.equal(media.alto, 2);
    const nula = parcheDeLuz([[16, 16, 0], [16, 16, 0], [16, 16, 0]], ti);
    assert.equal(nula.ancho, 1);
    assert.equal(nula.alto, 1);
  });

  test("el origen se redondea hacia abajo, y en negativo también", () => {
    const p = parcheDeLuz([[-40, -40, 0], [-8, -8, 0], [-8, -40, 0]], ti);
    assert.equal(p.origenS, -48); // floor(-40/16) = -3, por 16
    assert.equal(p.origenT, -48);
    assert.equal(p.ancho, 4);     // de -3 a 0, mas uno
  });

  test("la proyección se redondea a float de 32 bits", () => {
    // El control de este redondeo es el que cuadra los 2 126 793 bytes del lump,
    // más abajo. Aquí sólo se fija que el redondeo ESTÁ, porque quitarlo no da
    // error: da parches un luxel más grandes en 951 caras de 14 527.
    const raro = { s: [0.1, 0.2, 0.3, 0], t: [0, 1, 0, 0] };
    const p = [7, 11, 13];
    assert.equal(proyS(p, raro), Math.fround(p[0] * 0.1 + p[1] * 0.2 + p[2] * 0.3 + 0));
    assert.equal(proyT(p, raro), Math.fround(11));
  });

  test("el medio luxel: la UV cae en el CENTRO del luxel, no en su esquina", () => {
    const cara = { puntos: [[0, 0, 0], [64, 0, 0], [64, 32, 0], [0, 32, 0]], texinfo: ti };
    const p = parcheDeLuz(cara.puntos, ti);
    const item = { ...p, x: 0, y: 0 };
    const atlas = { ancho: 16, alto: 16 };
    const uv = uvDeLuz([0, 0, 0], cara, item, atlas);
    // El primer vértice tiene que caer a medio luxel del borde: 0,5/16.
    assert.ok(Math.abs(uv[0] - 0.5 / 16) < 1e-9);
    assert.ok(Math.abs(uv[1] - 0.5 / 16) < 1e-9);
    // Y el último, a medio luxel del otro lado del último luxel.
    const fin = uvDeLuz([64, 32, 0], cara, item, atlas);
    assert.ok(Math.abs(fin[0] - 4.5 / 16) < 1e-9);
  });
});

describe("las clases de textura, por su nombre", () => {
  test("`{` es calada, `!` y `water` son agua, `sky` es cielo", () => {
    assert.equal(claseDeTextura("{grate1b").clase, CLASES.calada);
    assert.equal(claseDeTextura("{grate1b").calada, true);
    assert.equal(claseDeTextura("!waterblue").clase, CLASES.agua);
    assert.equal(claseDeTextura("water1").clase, CLASES.agua);
    assert.equal(claseDeTextura("sky").clase, CLASES.cielo);
    assert.equal(claseDeTextura("rock_07").clase, CLASES.normal);
  });

  test("`+0` es animada y `~` emisiva", () => {
    const a = claseDeTextura("+0lamp");
    assert.equal(a.clase, CLASES.animada);
    assert.equal(a.cuadro, "0");
    assert.equal(a.base, "lamp");
    assert.equal(claseDeTextura("~light01").clase, CLASES.emisiva);
  });

  test("una roca corriente NO es calada", () => {
    // El control que importa: si `calada` fuera cierto para todas, el índice 255
    // de la paleta sería transparente en las 92 y se verían agujeros por donde se
    // ve el fondo del mundo en paredes macizas.
    for (const n of ["rock_07", "ms_dirt01", "ground03", "T_stone_B1", "wood_103"]) {
      assert.equal(claseDeTextura(n).calada, false, n);
    }
  });
});

describe("el área de un polígono", () => {
  test("un cuadrado de lado 2 mide 4", () => {
    assert.equal(areaPoligono([[0, 0, 0], [2, 0, 0], [2, 2, 0], [0, 2, 0]]), 4);
  });
  test("un polígono degenerado mide cero, no NaN", () => {
    assert.equal(areaPoligono([[0, 0, 0], [1, 1, 1], [2, 2, 2]]), 0);
  });
});

describe("el escritor de PNG", () => {
  test("empieza por la firma y acaba en IEND", () => {
    const b = png(new Uint8Array(4 * 4 * 4).fill(128), 4, 4);
    assert.deepEqual([...b.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.equal(b.subarray(b.length - 8, b.length - 4).toString("latin1"), "IEND");
  });
  test("declara el tamaño en la IHDR", () => {
    const b = png(new Uint8Array(6 * 3 * 4), 6, 3);
    assert.equal(b.readUInt32BE(16), 6);
    assert.equal(b.readUInt32BE(20), 3);
    assert.equal(b[24], 8); // bits por canal
    assert.equal(b[25], 6); // RGBA
  });
  test("se queja si faltan bytes en vez de escribir basura", () => {
    assert.throws(() => png(new Uint8Array(10), 8, 8), /bytes para/);
  });
});

// --- lo que sí necesita el archivo ------------------------------------------

describe("gatecity.bsp, contra las cifras que lleva dentro", { skip: HAY ? false : `falta ${RUTA} (no se copia a propósito)` }, () => {
  const bsp = HAY ? leerBsp(RUTA) : null;
  const modelos = HAY ? leerModelos(bsp) : [];
  const texinfos = HAY ? leerTexinfo(bsp) : [];
  const texturas = HAY ? leerTexturas(bsp) : [];
  const caras = HAY ? leerTodasLasCaras(bsp, modelos, texinfos) : [];

  test("versión 30 y quince lumps dentro del archivo", () => {
    assert.equal(bsp.version, 30);
    for (const n of LUMPS) {
      assert.ok(bsp.lumps[n].off >= 0 && bsp.lumps[n].off + bsp.lumps[n].len <= bsp.bytes, n);
    }
  });

  test("317 modelos: el mundo y 316 entidades con brushes", () => {
    assert.equal(modelos.length, 317);
    assert.equal(modelos[0].caras, 12680);
  });

  test("las caras del archivo son exactamente las del lump", () => {
    // El lump mide 313 200 bytes y una cara son 20: 15 660. Si el recorrido de
    // los modelos no las cubriera todas, sobrarían caras sin dibujar y el mapa
    // saldría con trozos de menos sin que nada avisara.
    assert.equal(bsp.lumps.caras.len / 20, 15660);
    assert.equal(caras.length, 15660);
  });

  test("32 887 m² en el mundo, que es lo que ya medía tools/bsp.mjs", () => {
    const U = UNIDADES_POR_METRO;
    const delMundo = caras.filter((c) => c.modelo === 0).reduce((a, c) => a + c.area, 0) / (U * U);
    assert.ok(Math.abs(delMundo - 32887) < 2, `${delMundo.toFixed(0)} m²`);
  });

  test("1 245 texinfo, y todas las caras apuntan a uno", () => {
    assert.equal(texinfos.length, bsp.lumps.texinfo.len / 40);
    assert.equal(texinfos.length, 1245);
    assert.equal(caras.filter((c) => !c.texinfo).length, 0);
  });

  test("`side` distinto de cero voltea la normal del plano", () => {
    // Sin esto la mitad de los suelos son techos, y eso ya se supo al medir la
    // altura libre. Se comprueba contra el plano crudo, no contra el resultado.
    const volteada = caras.find((c) => c.lado !== 0 && c.modelo === 0);
    assert.ok(volteada, "el mapa tiene caras con side distinto de cero");
    const p = bsp.lumps.planos.datos;
    const crudo = [
      p.readFloatLE(volteada.iPlano * 20),
      p.readFloatLE(volteada.iPlano * 20 + 4),
      p.readFloatLE(volteada.iPlano * 20 + 8),
    ];
    assert.deepEqual(volteada.normal, crudo.map((v) => -v));
  });

  test("las normales son unitarias: los planos están normalizados", () => {
    for (const c of caras.slice(0, 500)) {
      assert.ok(Math.abs(Math.hypot(...c.normal) - 1) < 1e-3);
    }
  });

  // --- el mapa de luz, que es la parte que decide ---------------------------

  test("EL ORÁCULO: los bloques de mapa de luz llenan los 2 126 793 bytes del lump", () => {
    const c = contabilidad(caras, bsp.lumps.luz.len);
    assert.equal(bsp.lumps.luz.len, 2126793);
    assert.equal(c.bytes, 2126793, `sumados ${c.bytes}, sobran ${c.sobran}`);
    assert.equal(c.solapes, 0, `${c.solapes} bloques se solapan`);
    assert.equal(c.huecos, 0, `${c.huecos} bloques dejan hueco`);
    assert.ok(c.cuadra);
  });

  test("CONTROL del oráculo: sin el redondeo a float sobran 29 577 bytes", () => {
    // Éste es el control que convierte lo de arriba en un juez. Se repite la
    // cuenta con la proyección en DOBLE —que es lo que uno escribe sin pensar— y
    // tiene que fallar. Si no fallara, la prueba de arriba no estaría midiendo
    // nada.
    const enDoble = (p, v) => p[0] * v[0] + p[1] * v[1] + p[2] * v[2] + v[3];
    let bytes = 0;
    for (const c of caras) {
      if (!tieneLuz(c)) continue;
      let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
      for (const p of c.puntos) {
        const s = enDoble(p, c.texinfo.s), t = enDoble(p, c.texinfo.t);
        s0 = Math.min(s0, s); s1 = Math.max(s1, s);
        t0 = Math.min(t0, t); t1 = Math.max(t1, t);
      }
      const w = Math.ceil(s1 / 16) - Math.floor(s0 / 16) + 1;
      const h = Math.ceil(t1 / 16) - Math.floor(t0 / 16) + 1;
      bytes += w * h * 3 * c.nEstilos;
    }
    assert.equal(bytes - bsp.lumps.luz.len, 29577);
    assert.notEqual(bytes, bsp.lumps.luz.len);
  });

  test("«tiene mapa de luz» son DOS condiciones: 137 con lightofs=-1 y 996 con styles a 255", () => {
    const c = contabilidad(caras, bsp.lumps.luz.len);
    assert.equal(c.sinLuzPorMenosUno, 137);
    assert.equal(c.sinLuzPorEstilos, 996);
    assert.equal(c.caras, 14527);
    // Y el control: contando sólo `lightofs >= 0` saldrían 996 caras de más, y
    // cada una se pintaría con la luz del bloque de otra — que es un fallo que no
    // se ve porque el resultado es luz plausible.
    assert.equal(caras.filter((x) => x.lightofs >= 0).length, 14527 + 996);
  });

  test("los desplazamientos de las caras con luz no se repiten", () => {
    const con = caras.filter(tieneLuz);
    assert.equal(new Set(con.map((c) => c.lightofs)).size, con.length);
  });

  test("ningún parche pasa de 17 luxels: es el tope de GoldSrc", () => {
    const c = contabilidad(caras, bsp.lumps.luz.len);
    assert.equal(c.parcheMayor, 17);
  });

  test("el atlas empaqueta los 462 915 luxels y los lee todos", () => {
    const atlas = empaquetar(caras, { ancho: 1024 });
    const pintado = pintarAtlas(atlas, bsp.lumps.luz.datos);
    const c = contabilidad(caras, bsp.lumps.luz.len);
    assert.equal(pintado.leidos, c.luxels);
    assert.equal(atlas.ancho, 1024);
    assert.ok(atlas.ocupacion > 0.45, `ocupación ${atlas.ocupacion}`);
    // Y queda sitio para el luxel blanco al que van las caras sin mapa de luz.
    const { negro, blanco } = reservarLuxeles(atlas, pintado.rgba);
    assert.ok(negro[0] > 0 && negro[0] < 1 && blanco[0] > 0 && blanco[0] < 1);
    assert.notDeepEqual(negro, blanco);
  });

  test("el histograma NO es plano, que es el fallo que se da por bueno", () => {
    // Un mapa de luz plano se ve como un mundo uniformemente iluminado — o sea
    // como el jharro de hoy— y por tanto es el fallo más fácil de dar por bueno:
    // la escena se vería bien, se vería entera, y el veredicto de quien la juegue
    // sería otra vez «todo se ve casi 100 % igual».
    const atlas = empaquetar(caras, { ancho: 1024 });
    const h = histograma(atlas, bsp.lumps.luz.datos);
    assert.ok(h.cubetasVivas >= 5, `sólo ${h.cubetasVivas} cubetas vivas`);
    assert.ok(h.desviacion > 20, `desviación ${h.desviacion}`);
    assert.ok(h.mayor < 0.5, `la cubeta mayor se lleva el ${(h.mayor * 100).toFixed(0)} %`);
  });

  test("CONTROL del histograma: un mapa de luz constante sí sale plano", () => {
    // La sonda de arriba sin este control no dice nada. Se le da un lump entero
    // del mismo valor y tiene que derrumbarse.
    //
    // Y no da desviación CERO, que es lo que esperé al escribirla: como los
    // estilos se suman, un lump constante a 90 da 90, 180 y 255 según la cara
    // tenga uno, dos o tres estilos. O sea tres niveles, no uno. Lo que
    // discrimina no es «desviación cero», es **cuántas cubetas hay y cuánto pesa
    // la mayor**: tres contra siete, y el 65 % contra el 34 %.
    const atlas = empaquetar(caras, { ancho: 1024 });
    const plano = Buffer.alloc(bsp.lumps.luz.len, 90);
    const h = histograma(atlas, plano);
    const real = histograma(atlas, bsp.lumps.luz.datos);
    assert.ok(h.cubetasVivas <= 3, `${h.cubetasVivas} cubetas con un lump constante`);
    assert.ok(h.cubetasVivas < real.cubetasVivas);
    assert.ok(h.mayor > real.mayor, `${h.mayor} contra ${real.mayor}`);
  });

  test("se SUMAN los estilos: 2 795 caras no tienen el 0 en styles[0]", () => {
    const con = caras.filter(tieneLuz);
    assert.equal(con.filter((c) => c.estilos[0] === 1).length, 2795);
    // O sea que «el bloque 0 es el estilo 0» es falso, y leer sólo el primero
    // tira la luz de todas las antorchas parpadeantes del mapa.
    const extra = con.reduce((a, c) => a + (c.nEstilos - 1), 0);
    assert.equal(extra, 9405);
  });

  test("sumar los estilos sube la media del atlas, y la sube de verdad", () => {
    const atlas = empaquetar(caras, { ancho: 1024 });
    const h = histograma(atlas, bsp.lumps.luz.datos);
    // 30,5 sumando; 24,9 leyendo sólo el primer bloque. El número importa menos
    // que la dirección, pero se fija para que se sepa hacia dónde se mueve el día
    // que alguien toque esto.
    assert.ok(h.media > 29 && h.media < 32, `media ${h.media}`);
  });

  // --- las texturas --------------------------------------------------------

  test("92 texturas, las 92 incrustadas y las 92 con paleta de 256", () => {
    assert.equal(texturas.length, 92);
    assert.equal(texturas.filter((t) => t?.incrustada).length, 92);
    for (const t of texturas) {
      const img = decodificarMiptex(bsp.lumps.texturas.datos, t.off);
      assert.ok(img, t.nombre);
      assert.equal(img.nColores, 256, t.nombre);
    }
  });

  test("las texturas tienen colores: la paleta se está leyendo bien", () => {
    const vivas = [];
    const planas = [];
    for (const t of texturas) {
      const img = decodificarMiptex(bsp.lumps.texturas.datos, t.off);
      const v = variedadDeImagen(img.rgba);
      (v.colores > 1 ? vivas : planas).push({ n: t.nombre, ...v });
    }
    // 88 de 92. Las cuatro planas son `1white`, `black`, `yellow` y `sky`, que son
    // de un solo color a propósito y lo dicen en el nombre. La primera versión de
    // esta sonda las acusaba: estaba bien escrita para el fallo equivocado.
    assert.ok(vivas.length / texturas.length > 0.9, `${vivas.length} de ${texturas.length}`);
    assert.deepEqual(planas.map((p) => p.n).sort(), ["1white", "black", "sky", "yellow"]);
    const colores = vivas.map((v) => v.colores).sort((a, b) => a - b);
    assert.ok(colores[Math.floor(colores.length / 2)] > 16);
  });

  test("CONTROL de la paleta: con el desplazamiento roto, todas salen planas", () => {
    // El control que convierte lo de arriba en un juez. Se le miente al
    // decodificador sobre dónde empieza la paleta —leyéndola de un
    // desplazamiento fijo, que es el error clásico— y el recuento se derrumba.
    const d = bsp.lumps.texturas.datos;
    let planas = 0;
    for (const t of texturas.slice(0, 20)) {
      const ancho = t.ancho, alto = t.alto;
      const off0 = d.readUInt32LE(t.off + 24);
      // La paleta «donde uno la pondría»: justo detrás del primer mip.
      const falsa = t.off + off0 + ancho * alto + 2;
      const idx = d.subarray(t.off + off0, t.off + off0 + ancho * alto);
      const rgba = new Uint8Array(ancho * alto * 4);
      for (let i = 0; i < ancho * alto; i++) {
        const p = falsa + idx[i] * 3;
        rgba[i * 4] = d[p] ?? 0;
        rgba[i * 4 + 1] = d[p + 1] ?? 0;
        rgba[i * 4 + 2] = d[p + 2] ?? 0;
        rgba[i * 4 + 3] = 255;
      }
      const v = variedadDeImagen(rgba);
      // Con la paleta en el sitio equivocado, la imagen sale con otros colores.
      const bien = variedadDeImagen(decodificarMiptex(d, t.off).rgba);
      if (v.colores !== bien.colores || Math.abs(v.luminancia - bien.luminancia) > 1) planas++;
    }
    assert.ok(planas >= 18, `sólo ${planas} de 20 cambian: el control no discrimina`);
  });

  test("una sola textura calada, dos de agua y una de cielo", () => {
    const por = new Map();
    for (const t of texturas) {
      const c = claseDeTextura(t.nombre).clase;
      por.set(c, (por.get(c) ?? 0) + 1);
    }
    assert.equal(por.get(CLASES.calada), 1);
    assert.equal(por.get(CLASES.agua), 2);
    assert.equal(por.get(CLASES.cielo), 1);
    assert.equal(por.get(CLASES.animada), undefined);
  });

  // --- la malla ------------------------------------------------------------

  test("la malla sale con un grupo por textura, no con uno solo", () => {
    // Es la capacidad que se viene a probar y lo que al jharro le falta: dibuja
    // su mundo entero con UN material.
    const atlas = empaquetar(caras, { ancho: 1024 });
    const pintado = pintarAtlas(atlas, bsp.lumps.luz.datos);
    Object.assign(atlas, reservarLuxeles(atlas, pintado.rgba));
    const malla = emitirMalla(caras, texturas, atlas, { conCielo: true });
    assert.equal(malla.groups.length, 92);
    assert.ok(malla.triangleCount > 40000);
    // Los índices de los grupos cubren el índice entero, sin hueco ni solape.
    let fin = 0;
    for (const g of malla.groups) {
      assert.equal(g.start, fin);
      fin += g.count;
    }
    assert.equal(fin, malla.indices.length);
    // Y hay dos juegos de UV, uno por vértice cada uno.
    assert.equal(malla.uvs.length, malla.vertexCount * 2);
    assert.equal(malla.uvs1.length, malla.vertexCount * 2);
    assert.equal(malla.normals.length, malla.vertexCount * 3);
  });

  test("cada triángulo emitido MIRA HACIA DONDE DICE SU NORMAL", () => {
    // La prueba que faltaba, y que costó una ronda de alguien jugándolo.
    //
    // GoldSrc guarda la vuelta de una cara en sentido HORARIO vista desde delante;
    // Three.js llama frontal al antihorario. Emitidas tal cual, las 12 680 caras
    // del mundo salían con el bobinado opuesto a su propia normal: cada pared se
    // veía sólo desde detrás.
    //
    // Y eso **no se ve como geometría al revés, se ve como oscuridad**: se
    // atraviesan las paredes cercanas y se ven los reversos de las lejanas, o sea
    // cuatro manchas flotando en negro. En un mapa que de verdad es una cueva, se
    // da por bueno.
    //
    // Se comprueba en el TRIÁNGULO EMITIDO, no en el criterio que lo emitió: es la
    // misma disciplina que salvó a Corinth —preguntarle a la puerta ya colocada
    // hacia dónde mira— y por la misma razón.
    const atlas = empaquetar(caras, { ancho: 1024 });
    const pintado = pintarAtlas(atlas, bsp.lumps.luz.datos);
    Object.assign(atlas, reservarLuxeles(atlas, pintado.rgba));
    const malla = emitirMalla(caras, texturas, atlas, { conCielo: true });
    const { positions, normals, indices } = malla;
    // El umbral, que no es una holgura para que pase: quedan **147 triángulos de
    // 41 650** al revés y los 147 son ASTILLAS. El mayor mide 1,35·10⁻⁵ m² —un
    // triángulo de medio milímetro de lado— y entre todos suman 0,0002 m² en un
    // mapa de 34 890. Salen de polígonos con vértices casi alineados, donde el
    // producto cruzado es ruido numérico y no dibujan ni un píxel.
    //
    // Lo que sí tiene que ser cero es un triángulo al revés con área de verdad, y
    // por eso el umbral se dice aparte y se comprueba la superficie total: con el
    // bobinado mal iban los 41 650, incluido el de 427 m².
    const ASTILLA = 1e-4; // un centímetro cuadrado
    let alReves = 0, degenerados = 0, astillas = 0, areaAlReves = 0;
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
      const p = (i, k) => positions[i * 3 + k];
      const u = [p(b, 0) - p(a, 0), p(b, 1) - p(a, 1), p(b, 2) - p(a, 2)];
      const v = [p(c, 0) - p(a, 0), p(c, 1) - p(a, 1), p(c, 2) - p(a, 2)];
      const g = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ];
      const l = Math.hypot(...g);
      if (l < 1e-9) { degenerados++; continue; }
      const d = (g[0] * normals[a * 3] + g[1] * normals[a * 3 + 1] + g[2] * normals[a * 3 + 2]) / l;
      if (d >= 0) continue;
      areaAlReves += l / 2;
      if (l / 2 < ASTILLA) astillas++;
      else alReves++;
    }
    assert.equal(alReves, 0, `${alReves} triángulos con área de verdad miran al revés`);
    assert.equal(astillas, 147);
    assert.ok(areaAlReves < 0.001, `${areaAlReves} m² al revés`);
    // Los degenerados no son un fallo y el 1 % que puse de tope era un número
    // inventado: **3 635 de 41 650**, el 8,7 %. Un `.bsp` PARTE las caras para
    // construir el árbol, y cada corte deja vértices alineados con los que ya
    // había; el abanico saca de ahí triángulos de área nula que no dibujan nada.
    // Se fija el número para que se vea si cambia, en vez de acotarlo a ojo.
    assert.equal(degenerados, 3635);
  });

  test("CONTROL del bobinado: leídas tal cual, las 12 680 caras van al revés", () => {
    // Sin este control, la prueba de arriba sólo dice que el emisor es coherente
    // consigo mismo. Lo que dice con él es que el ORDEN del archivo es el
    // contrario, que es el hecho del formato que había que descubrir.
    let opuestas = 0;
    for (const c of caras.filter((x) => x.modelo === 0)) {
      let n = [0, 0, 0];
      for (let i = 0; i < c.puntos.length; i++) {
        const a = c.puntos[i], b = c.puntos[(i + 1) % c.puntos.length];
        n[0] += (a[1] - b[1]) * (a[2] + b[2]);
        n[1] += (a[2] - b[2]) * (a[0] + b[0]);
        n[2] += (a[0] - b[0]) * (a[1] + b[1]);
      }
      const l = Math.hypot(...n);
      if (l < 1e-9) continue;
      if ((n[0] * c.normal[0] + n[1] * c.normal[1] + n[2] * c.normal[2]) / l < 0) opuestas++;
    }
    assert.equal(opuestas, 12680);
  });

  test("las UV de mapa de luz caen dentro del atlas", () => {
    const atlas = empaquetar(caras, { ancho: 1024 });
    const pintado = pintarAtlas(atlas, bsp.lumps.luz.datos);
    Object.assign(atlas, reservarLuxeles(atlas, pintado.rgba));
    const malla = emitirMalla(caras, texturas, atlas);
    for (let i = 0; i < malla.uvs1.length; i++) {
      assert.ok(malla.uvs1[i] >= 0 && malla.uvs1[i] <= 1, `uv1[${i}] = ${malla.uvs1[i]}`);
    }
  });

  test("diez texturas cubren el 80 % de la superficie del mundo, y la mayor el 30 %", () => {
    // La cifra que trajo esta sesión aquí, leída como PROPORCIÓN y como RECUENTO.
    // Es el objetivo medido que el jharro tiene que alcanzar, y hoy tiene una
    // textura al 100 %.
    const U = UNIDADES_POR_METRO;
    const por = new Map();
    for (const c of caras.filter((x) => x.modelo === 0)) {
      const n = texturas[c.miptex]?.nombre;
      if (n) por.set(n, (por.get(n) ?? 0) + c.area / (U * U));
    }
    const lista = [...por.values()].sort((a, b) => b - a);
    const total = lista.reduce((a, b) => a + b, 0);
    assert.equal(lista.length, 80);
    let s = 0, n = 0;
    while (s / total < 0.8) { s += lista[n++]; }
    assert.equal(n, 10);
    assert.ok(Math.abs(lista[0] / total - 0.303) < 0.005);
  });

  test("la mediana de área de cara del mundo es 0,47 m²", () => {
    // El otro objetivo medido. El jharro está en 1,10 m² porque sus caras son
    // cuadrados de celda de 4 m: ni una pequeña, ni una grande.
    const U = UNIDADES_POR_METRO;
    const areas = caras.filter((c) => c.modelo === 0).map((c) => c.area / (U * U)).sort((a, b) => a - b);
    const med = areas[Math.floor(areas.length / 2)];
    assert.ok(Math.abs(med - 0.47) < 0.01, `${med.toFixed(3)} m²`);
    assert.ok(areas.at(-1) > 400, `la mayor ${areas.at(-1).toFixed(0)} m²`);
  });

  test("el desplazamiento de una entidad se ANOTA, no se aplica a los puntos", () => {
    // Si se aplicara a los puntos, la textura y el mapa de luz de esa pieza se
    // desplazarían con ella: el motor mueve el MODELO y proyecta con la geometría
    // sin mover. Son las nueve `func_door_rotating` de este mapa.
    const ents = leerEntidades(bsp);
    const puerta = ents.find((e) => e.classname === "func_door_rotating" && e.origin &&
      e.origin.trim().split(/\s+/).some((v) => Number(v) !== 0));
    assert.ok(puerta, "el mapa tiene puertas con origin distinto de cero");
    const i = Number(puerta.model.slice(1));
    const originales = leerCaras(bsp, modelos[i], texinfos);
    const movidas = conEntidad(originales, puerta, (e) => [100, 200, 300]);
    assert.deepEqual(movidas[0].puntos, originales[0].puntos);
    assert.deepEqual(movidas[0].desplazamiento, [100, 200, 300]);
  });

  test("las entidades invisibles no traen ni una cara: no hay nada que filtrar", () => {
    // 101 `func_monsterclip`, 30 `msarea_*`, 6 `trigger_*` y 2 `func_ladder`. El
    // compilador se las comió, así que el problema de «¿cuáles se dibujan?» no
    // existe en este archivo. Se comprueba en vez de suponerse: un `.bsp` que sí
    // las trajera dibujaría 101 cajas de roca en mitad del sitio.
    const ents = leerEntidades(bsp);
    const invisibles = /^(func_monsterclip|func_ladder|trigger_|msarea_)/;
    let n = 0;
    for (const e of ents) {
      if (!/^\*\d+$/.test(e.model ?? "") || !invisibles.test(e.classname ?? "")) continue;
      n++;
      assert.equal(modelos[Number(e.model.slice(1))].caras, 0, e.classname);
    }
    assert.equal(n, 139);
  });

  test("el mapa declara un cielo que NO está dentro: skyname nature1", () => {
    // Es un hueco real y medido, de la misma clase que los `.mdl` y los `.spr`:
    // GoldSrc dibuja ahí seis `.tga` de `gfx/env/` que el `.bsp` no lleva. Lo que
    // sí lleva es el color, en `light_environment`.
    const ents = leerEntidades(bsp);
    assert.equal(ents.find((e) => e.classname === "worldspawn").skyname, "nature1");
    assert.equal(ents.find((e) => e.classname === "light_environment")._light, "255 255 128 200");
  });

  test("101 env_model y 58 env_sprite apuntan fuera del archivo", () => {
    const ents = leerEntidades(bsp);
    const mdl = ents.filter((e) => e.classname === "env_model");
    const spr = ents.filter((e) => e.classname === "env_sprite");
    assert.equal(mdl.length, 101);
    assert.equal(spr.length, 58);
    // Y son pocos ficheros distintos: repetición, no variedad.
    assert.equal(new Set(mdl.map((e) => e.model)).size, 17);
    assert.equal(new Set(spr.map((e) => e.model)).size, 3);
    // Ninguno es un `*N`, o sea ninguno está dentro del `.bsp`.
    for (const e of [...mdl, ...spr]) assert.ok(!/^\*/.test(e.model ?? ""), e.model);
  });
});

// --- `--sinluz`: el oraculo de la perilla de mirar ---------------------------
//
// `emitirMalla(..., { sinLuzAl })` decide a que luxel reservado apuntan las caras
// sin mapa de luz: al NEGRO, que es lo que hace el motor, o al BLANCO, que es para
// poder mirar donde estan sobre un mapa oscuro.
//
// El control que puse primero era una captura plantada delante de la cara sin
// mapa de luz mayor, y daba el MISMO numero con la perilla y sin ella —hasta en
// el recuento de colores—, o sea que no controlaba nada. Esto si: se cuentan los
// vertices que apuntan a cada luxel, tiene que dar lo mismo en total, y tiene que
// INTERCAMBIARSE al mover la perilla. Las dos direcciones, no una.
test("sinLuzAl intercambia el luxel reservado de las caras sin mapa de luz", { skip: HAY ? false : `falta ${RUTA}` }, () => {
  const bsp = leerBsp(RUTA);
  const modelos = leerModelos(bsp);
  const texinfos = leerTexinfo(bsp);
  const texturas = leerTexturas(bsp);
  const caras = leerTodasLasCaras(bsp, modelos, texinfos);
  const atlas = empaquetar(caras);
  const rgba = new Uint8Array(atlas.ancho * atlas.alto * 4);
  Object.assign(atlas, reservarLuxeles(atlas, rgba));

  const cuenta = (malla, uv) => {
    let n = 0;
    for (let i = 0; i < malla.uvs1.length; i += 2) {
      if (Math.abs(malla.uvs1[i] - uv[0]) < 1e-6 && Math.abs(malla.uvs1[i + 1] - uv[1]) < 1e-6) n++;
    }
    return n;
  };
  const aNegro = emitirMalla(caras, texturas, atlas, { conCielo: true, sinLuzAl: "negro" });
  const aBlanco = emitirMalla(caras, texturas, atlas, { conCielo: true, sinLuzAl: "blanco" });

  const nNegro = cuenta(aNegro, atlas.negro);
  const bBlanco = cuenta(aBlanco, atlas.blanco);
  assert.ok(nNegro > 1000, `de fabrica tienen que ir al negro, y van ${nNegro} vertices`);
  assert.equal(bBlanco, nNegro, "con la perilla tienen que ir los MISMOS al blanco");
  // Y al reves, que es la mitad que un control flojo se deja: ninguno se queda
  // donde estaba.
  assert.equal(cuenta(aNegro, atlas.blanco), 0, "sin perilla no puede ir ninguno al blanco");
  assert.equal(cuenta(aBlanco, atlas.negro), 0, "con perilla no puede quedarse ninguno en el negro");
  // Los dos luxeles reservados son distintos: si `reservarLuxeles` devolviera dos
  // veces el mismo punto, todo lo de arriba pasaria sin que la perilla hiciera nada.
  assert.notDeepEqual(atlas.negro, atlas.blanco);
});

// --- el halo generado --------------------------------------------------------
//
// `glow01.spr` no esta en `../MSC/` porque es del Half-Life base, y las 23
// `env_glow` que lo usan son el halo de las lamparas. El sustituto es nuestro, y
// lo que hay que comprobar de un degradado generado es que sea un degradado: que
// baje del centro al borde y que se apague ANTES del borde, porque un disco con
// borde se lee como un circulo pintado encima de la pared.
test("el halo generado es un degradado que muere antes del borde", () => {
  const h = halo(64);
  const en = (x, y) => h.rgba[(y * 64 + x) * 4];
  const c = 32;
  assert.ok(en(c, c) > 240, "el centro tiene que estar a tope");
  assert.ok(en(c, c) > en(c + 8, c), "tiene que bajar al alejarse");
  assert.ok(en(c + 8, c) > en(c + 16, c), "y seguir bajando");
  assert.equal(en(0, 0), 0, "la esquina tiene que estar apagada");
  assert.equal(en(c, 0), 0, "y el borde tambien, o se ve el canto del disco");
  // El perfil va en el COLOR y no en el alfa: en aditivo el material suma
  // `color x alfa`, y un halo con el perfil solo en el alfa sale como un cuadrado.
  assert.equal(h.rgba[(c * 64 + c) * 4 + 3], 255);
  assert.equal(h.rgba[3], 255);
});

// --- el lector de `.mdl`: los adornos ---------------------------------------
//
// Los 101 `env_model` de Gate City salen de 17 ficheros que estan AL LADO del
// `.bsp`, en `../MSC/assets/msr/models/`. Como con el mapa: se escribe el lector,
// no se copia el contenido, y lo extraido va a `build/`.
//
// Todas estas comprobaciones tienen ORACULO dentro del archivo, que es lo unico
// que sirve con un formato binario: un `.mdl` mal leido no da error, da un
// adorno — y un adorno raro a cinco metros pasa por un adorno.
const MODELOS = [
  "../MSC/assets/msr/models/misc/chair.mdl",
  "../MSC/assets/msr/models/props/cart.mdl",
  "../MSC/assets/msr/models/props/Lamp.mdl",
  "../MSC/assets/msr/models/props/fern.mdl",
  "../MSC/assets/msr/models/misc/dinner_table2.mdl",
];
const HAY_MDL = MODELOS.every((m) => existsSync(m));

describe("gatecity: el lector de .mdl", { skip: HAY_MDL ? false : "faltan los .mdl (no se copian a proposito)" }, () => {
  test("la cabecera dice el tamano del fichero, y coincide", () => {
    for (const ruta of MODELOS) {
      const m = leerMdl(ruta);
      assert.equal(m.id, "IDST");
      assert.equal(m.version, 10);
      // `length` en la cabecera tiene que valer los bytes del fichero. Es el
      // control mas barato que hay y caza un truncado antes de leer nada.
      assert.equal(m.largo, m.bytes, `${ruta}: la cabecera dice ${m.largo} y el fichero mide ${m.bytes}`);
      assert.ok(m.cuadra);
    }
  });

  test("rechaza un .spr y un fichero de secuencias en vez de leerlos torcidos", () => {
    // `IDSP` (cartel) e `IDSQ` (grupo de secuencias) empiezan los dos por `ID` y
    // no llevan malla. Aceptarlos no daria error: daria basura con forma de modelo.
    const falso = Buffer.alloc(300);
    falso.write("IDSP", 0, "latin1");
    falso.writeInt32LE(2, 4);
    assert.throws(() => abrirMdl(falso, "falso.spr"), /IDST/);
    falso.write("IDSQ", 0, "latin1");
    assert.throws(() => abrirMdl(falso, "falso.mdl"), /IDST/);
  });

  test("los comandos de triangulo dan EXACTAMENTE los que dice la cabecera", () => {
    // `mstudiomesh_t.numtris` es el oraculo. Un recorrido de tiras que se
    // desincroniza no se para: sigue leyendo shorts y saca geometria.
    for (const ruta of MODELOS) {
      const m = leerMdl(ruta);
      const ml = mallaDe(m, texturasDe(m));
      assert.equal(ml.leidos, ml.esperados, `${ruta}: ${ml.leidos} triangulos de ${ml.esperados}`);
      assert.ok(ml.triangulos > 0);
    }
  });

  test("el bobinado concuerda con las normales del archivo", () => {
    // GoldSrc dibuja los modelos con `glCullFace(GL_FRONT)`, al reves que el
    // mundo. Sin invertirlos, los diecisiete daban el **100 %** de sus triangulos
    // girando en contra de su propia normal, y en pantalla eso no es una silla
    // invisible: es una silla APOLILLADA, con la silueta entera y llena de
    // agujeros. Se vio, y costo media ronda darse cuenta de que no era el filtro
    // ni las UV ni el mapa de luz.
    for (const ruta of MODELOS) {
      const m = leerMdl(ruta);
      const ml = mallaDe(m, texturasDe(m));
      assert.ok(ml.bobinadoBien,
        `${ruta}: ${ml.contraNormal} de ${ml.contraNormal + ml.aFavor} en contra`);
      assert.ok(ml.contraNormalFrac < 0.25);
    }
  });

  test("SABOTAJE: invertido el giro, el control lo canta", () => {
    // La pareja del anterior. Se le da la vuelta a cada triangulo y la fraccion
    // en contra tiene que irse al otro extremo. Sin esto, «todos bien» podria
    // significar «la sonda no sabe mirar».
    const m = leerMdl(MODELOS[0]);
    const ml = mallaDe(m, texturasDe(m));
    let contra = 0, aFavor = 0;
    for (const g of ml.grupos) {
      for (let i = 0; i < g.pos.length; i += 9) {
        // se intercambian los vertices 2 y 3
        const P = [g.pos[i], g.pos[i+1], g.pos[i+2], g.pos[i+6], g.pos[i+7], g.pos[i+8], g.pos[i+3], g.pos[i+4], g.pos[i+5]];
        const ax = P[3]-P[0], ay = P[4]-P[1], az = P[5]-P[2];
        const bx = P[6]-P[0], by = P[7]-P[1], bz = P[8]-P[2];
        const cx = ay*bz-az*by, cy = az*bx-ax*bz, cz = ax*by-ay*bx;
        const nx = (g.nor[i]+g.nor[i+3]+g.nor[i+6])/3;
        const ny = (g.nor[i+1]+g.nor[i+4]+g.nor[i+7])/3;
        const nz = (g.nor[i+2]+g.nor[i+5]+g.nor[i+8])/3;
        if (cx*nx+cy*ny+cz*nz > 0) aFavor++; else contra++;
      }
    }
    assert.ok(contra > aFavor * 4, `saboteado deberia dar casi todo en contra, dio ${contra} contra ${aFavor}`);
  });

  test("las UV estan en vueltas de textura, no en pixeles", () => {
    // `s` y `t` vienen en PIXELES. Usados tal cual, un barril sale de un solo
    // color — el mismo fallo silencioso que la paleta de un `miptex`.
    for (const ruta of MODELOS) {
      const m = leerMdl(ruta);
      const ml = mallaDe(m, texturasDe(m));
      for (const g of ml.grupos) {
        for (let i = 0; i < g.uv.length; i++) {
          assert.ok(g.uv[i] >= -2 && g.uv[i] <= 3, `${ruta}: uv ${g.uv[i]} fuera de rango`);
        }
      }
    }
  });

  test("los vertices salen del espacio de su hueso", () => {
    // La caja de la malla tiene que parecerse a un mueble, no a un punto. Sin
    // componer los huesos, las piezas de un modelo de varios huesos se apilan en
    // el origen y la caja se queda diminuta.
    const m = leerMdl("../MSC/assets/msr/models/props/Lamp.mdl");
    assert.ok(m.nHuesos > 1, "esta prueba necesita un modelo de varios huesos");
    const ml = mallaDe(m, texturasDe(m));
    let alto = 0;
    for (const g of ml.grupos) for (let i = 2; i < g.pos.length; i += 3) alto = Math.max(alto, g.pos[i]);
    // Una lampara de pie mide mas de medio metro: 20 unidades de GoldSrc.
    assert.ok(alto > 20, `la lampara mide ${alto.toFixed(1)} unidades de alto`);
  });

  test("el cuaternion compone en el orden del motor (Rz Ry Rx)", () => {
    // `AngleQuaternion()` compone `Rz·Ry·Rx`. En otro orden, un modelo de un solo
    // hueso sale bien y uno de cuatro sale retorcido — la peor forma de fallar.
    const q = cuaternionDeEuler(0, 0, Math.PI / 2); // 90 grados sobre Z
    assert.ok(Math.abs(q[3] - Math.SQRT1_2) < 1e-6);
    assert.ok(Math.abs(q[2] - Math.SQRT1_2) < 1e-6);
    // y no conmuta: girar en X y luego en Y no es lo mismo que al reves
    const a = cuaternionDeEuler(0.7, 0.3, 0);
    const b = cuaternionDeEuler(0.3, 0.7, 0);
    assert.ok(Math.abs(a[0] - b[0]) > 1e-3 || Math.abs(a[1] - b[1]) > 1e-3);
  });

  test("angles de entidad: yaw 90 lleva +X a +Y", () => {
    // Los tres numeros de un `angles` son pitch, yaw, roll, y en Gate City se
    // usan LOS TRES: 72 adornos llevan yaw, 26 pitch y 26 roll. Con solo yaw,
    // cualquier convencion parece buena.
    const R = matrizDeAngulos(0, 90, 0);
    const v = porMatriz(R, [1, 0, 0]);
    assert.ok(Math.abs(v[0]) < 1e-6 && Math.abs(v[1] - 1) < 1e-6 && Math.abs(v[2]) < 1e-6,
      `salio ${v.map((x) => x.toFixed(3)).join(",")}`);
    // y es ortonormal
    const col = (i) => [R[i], R[4 + i], R[8 + i]];
    for (let i = 0; i < 3; i++) {
      assert.ok(Math.abs(Math.hypot(...col(i)) - 1) < 1e-6);
    }
  });
});

describe("gatecity: la luz de los adornos", { skip: HAY ? false : `falta ${RUTA}` }, () => {
  test("no es plana: cada adorno lee el luxel del suelo que tiene debajo", () => {
    // En GoldSrc un modelo no lleva mapa de luz: se ilumina con `R_LightPoint`,
    // un solo luxel leido del suelo. Si los 101 salieran iguales, o el muestreo
    // esta mal o se esta leyendo el mismo luxel cien veces — y el resultado es un
    // mapa donde los muebles parecen pegatinas puestas encima.
    const bsp = leerBsp(RUTA);
    const modelos = leerModelos(bsp);
    const texinfos = leerTexinfo(bsp);
    const caras = leerTodasLasCaras(bsp, modelos, texinfos).filter((c) => c.modelo === 0);
    const ents = leerEntidades(bsp).filter((e) => e.classname === "env_model" && origen(e));
    assert.ok(ents.length > 50, `solo ${ents.length} env_model`);
    const brillos = [];
    for (const e of ents) {
      const l = luzEnSuelo(caras, bsp.lumps.luz.datos, origen(e));
      if (l) brillos.push(0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]);
    }
    assert.ok(brillos.length > ents.length * 0.8, `solo ${brillos.length} de ${ents.length} tienen suelo debajo`);
    brillos.sort((a, b) => a - b);
    assert.ok(brillos[brillos.length - 1] - brillos[0] > 32,
      `la luz de los adornos va de ${brillos[0].toFixed(0)} a ${brillos[brillos.length - 1].toFixed(0)}: demasiado plana`);
  });
});

// --- la gamma del MOTOR ------------------------------------------------------
//
// Estas comprobaciones no valen contra una opinion: valen contra
// `engine/client/gamma.c`. Si alguien toca `tablasDeGamma()` y estos numeros
// cambian, ha dejado de ser la funcion del motor.
describe("gatecity: la gamma es la del motor, no una elegida", () => {
  test("los ajustes son los del config.cfg del juego", () => {
    // gamma 3 y brightness 2 salen de `C:\Juegos\MSR\msr\config.cfg`, y las
    // dos instalaciones —GoldSrc y el port a Xash3D— dicen lo mismo. texgamma y
    // lightgamma no estan en el fichero, asi que valen lo de fabrica.
    assert.equal(AJUSTES.gamma, 3);
    assert.equal(AJUSTES.brightness, 2);
    assert.equal(AJUSTES.texgamma, 2);
    assert.equal(AJUSTES.lightgamma, 2.5);
    // gl_overbright "0": el ajuste que costo un factor de DOS sobre el mapa
    // entero y que no hay forma de deducir leyendo un .bsp.
    assert.equal(AJUSTES.overbright, false);
  });

  test("lightscale sale de R_BuildLightMap, no de un dos", () => {
    // `else lightscale = pow(2, 1/lightgamma) * 256 + 0.5` -> 338 con 2.5.
    // Apagar el overbright no quita el factor dos: lo suaviza a un 32 %.
    const t = tablasDeGamma();
    assert.equal(t.lightscale, 338);
    assert.equal(tablasDeGamma({ ...AJUSTES, overbright: true }).lightscale, 256);
  });

  test("las dos tablas son monotonas y llegan a sus extremos", () => {
    const t = tablasDeGamma();
    assert.equal(t.tex[0], 0);
    assert.equal(t.tex[255], 255);
    assert.equal(t.luz[0], 0);
    for (let i = 1; i < 256; i++) assert.ok(t.tex[i] >= t.tex[i - 1], `tex no monotona en ${i}`);
    for (let i = 1; i < 1024; i++) assert.ok(t.luz[i] >= t.luz[i - 1], `luz no monotona en ${i}`);
    // La de textura ACLARA: exponente g1*texgamma = 2/3, menor que uno.
    assert.ok(t.tex[128] > 128, `tex[128] = ${t.tex[128]}, y tendria que aclarar`);
  });

  test("el codo de `brightness` levanta la sombra sin tocar lo claro", () => {
    // Es el tramo `if (f <= g3)` de BuildGammaTable, y es justo lo que una rampa
    // de un solo exponente no sabe hacer. Con brightness 2 el codo esta en 0,05.
    const con = tablasDeGamma();
    const sin = tablasDeGamma({ ...AJUSTES, brightness: 0 });
    assert.ok(con.luz[64] > sin.luz[64], "brightness 2 tiene que levantar la sombra");
    // y arriba los dos estan pegados al techo
    assert.ok(con.luz[1000] >= sin.luz[1000]);
  });

  test("los estilos de luz: el 0 vale 264 y los que parpadean, mas", () => {
    // `'m' is normal light` y `lightstylevalue = letra * 22` (gl_rlight.c).
    assert.equal(ESTILO_NORMAL, 264);
    assert.equal(valorDeEstilo(0), 264);
    // El 1 y el 6 son los que usa Gate City: 8 842 y 3 368 bloques. Promedian
    // MAS que el fijo, asi que hornearlos como si fueran el 0 los apaga.
    assert.ok(valorDeEstilo(1) > 264, `el estilo 1 promedia ${valorDeEstilo(1)}`);
    assert.ok(valorDeEstilo(6) > 264, `el estilo 6 promedia ${valorDeEstilo(6)}`);
    assert.ok(valorDeEstilo(1) < 264 * 1.2, "y tampoco el doble");
  });
});

// --- el halo, calibrado contra la captura del juego -------------------------
describe("gatecity: el halo de las lamparas", () => {
  test("el perfil es el medido en la captura del juego, no uno elegido", () => {
    // El perfil radial del halo en la captura del juego, quitado el fondo y
    // normalizado, se ajusta a (1-r)^1,5. Con el cuadrado —lo que habia— el
    // maximo solo se toca en el pixel del centro y el mipmap lo promedia a la
    // mitad: el punto mas claro de nuestra calle valia 72 contra los 186 del
    // juego.
    assert.equal(CAIDA, 1.5);
    assert.ok(NUCLEO > 0.1 && NUCLEO < 0.4);
    const h = halo(64);
    const en = (x, y) => h.rgba[(y * 64 + x) * 4];
    const c = 32;
    // El nucleo tiene que estar LLENO, no ser un pico.
    assert.equal(en(c, c), 255);
    assert.equal(en(c + 5, c), 255, "a 5 px del centro todavia tiene que estar lleno");
    // y a la mitad del radio, entre el 30 % y el 50 %, como el juego
    const mitad = en(c + 16, c) / 255;
    assert.ok(mitad > 0.25 && mitad < 0.55, `a medio radio vale ${mitad.toFixed(2)}`);
  });
});
