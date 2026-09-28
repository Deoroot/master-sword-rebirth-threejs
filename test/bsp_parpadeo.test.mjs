// EL PARPADEO de los estilos de luz, y el reparto en cubos que lo hace posible.
//
// ── Por qué esto no necesita un shader, que es lo que parecía ──────────────
//
// El motor hace, por téxel (`R_BuildLightMap`):
//
//     suma = Σ  lightstylevalue[estilo_e] · luxel_e
//     out  = rampa[ suma · lightscale >> 14 ]
//
// La rampa va DESPUÉS de la suma, así que dos atlas ya horneados no se pueden
// sumar: `rampa(a) + rampa(b)` no es `rampa(a + b)`. De ahí salía «hace falta
// un material propio», y durante dos experimentos se dio por bueno.
//
// Lo que lo destraba es contar. `lightstylevalue` es `letra × 22` y las cadenas
// del motor usan cuatro letras distintas cada una, así que el ciclo entero pasa
// por DIECISÉIS estados y no por 391. Se hornean los dieciséis y por fotograma
// se elige. Exacto, y con `MeshLambertMaterial` de fábrica.
//
// Lo que se comprueba aquí es la parte que no se ve: que el índice de variante
// que calcula el reloj sea el mismo que el orden en que se hornearon. Si los dos
// no coinciden **el parpadeo funciona igual de bien** y enseña la variante de
// otra cara — un fallo que no da error y que en pantalla parece luz.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import {
  PATRONES, ESTILO_NORMAL, valorDeEstilo,
  estilosAnimados, valoresDeEstilo, cuboDeCara, claveDeCubo, variantesDeCubo, varianteEnT,
} from "../src/bsp/gamma.js";
import { leerBsp, leerModelos, leerTexinfo, leerCaras, tieneLuz } from "../src/bsp/lector.js";
import { empaquetar, pintarAtlas } from "../src/bsp/luz.js";
import { tablasDeGamma } from "../src/bsp/gamma.js";

const MAPA = "../MSC/assets/msr/maps/gatecity.bsp";
const hayMapa = existsSync(MAPA);

describe("el ciclo de los estilos de luz", () => {
  test("animado es tener más de una letra, y el 0 no lo es", () => {
    const anim = estilosAnimados();
    assert.ok(!anim.includes(0), "el estilo 0 es 'm' a secas: no parpadea");
    assert.ok(anim.includes(1) && anim.includes(6), "el 1 y el 6 son las dos de Half-Life");
    // El control: si el criterio fuera «tiene patrón», el 0 entraría y se
    // hornearía un cubo entero de variantes idénticas.
    assert.ok(PATRONES[0] !== undefined && new Set(PATRONES[0]).size === 1);
  });

  test("los valores de un estilo son sus letras por 22, sin repetir", () => {
    assert.deepEqual(valoresDeEstilo(1), [...new Set([..."mmnmmommommnonmmonqnmmo"]
      .map((c) => (c.charCodeAt(0) - 97) * 22))].sort((a, b) => a - b));
    assert.deepEqual(valoresDeEstilo(1), [264, 286, 308, 352]); // m n o q
    assert.deepEqual(valoresDeEstilo(6), [264, 286, 308, 352]);
    assert.deepEqual(valoresDeEstilo(0), [ESTILO_NORMAL]);
    // Un estilo que no existe vale lo normal, que es lo que hace el motor.
    assert.deepEqual(valoresDeEstilo(200), [ESTILO_NORMAL]);
  });

  test("un cubo es el CONJUNTO de estilos animados de la cara, ordenado", () => {
    const cara = (estilos) => ({ estilos });
    assert.deepEqual(cuboDeCara(cara([0, 255, 255, 255])), []);
    assert.deepEqual(cuboDeCara(cara([1, 0, 255, 255])), [1]);
    assert.deepEqual(cuboDeCara(cara([6, 1, 0, 255])), [1, 6]);
    // Repetido no cuenta dos veces, y el orden no depende del orden del archivo.
    assert.deepEqual(cuboDeCara(cara([6, 6, 1, 1])), [1, 6]);
    assert.equal(claveDeCubo([]), "quieta");
    assert.equal(claveDeCubo([1, 6]), "1+6");
  });

  test("las variantes son el producto cartesiano y no se repite ninguna", () => {
    assert.equal(variantesDeCubo([]).length, 1);
    assert.equal(variantesDeCubo([1]).length, 4);
    assert.equal(variantesDeCubo([1, 6]).length, 16);
    const v = variantesDeCubo([1, 6]);
    assert.equal(new Set(v.map((x) => JSON.stringify(x))).size, 16);
  });

  // EL QUE IMPORTA: el reloj y el horneado tienen que contar igual.
  //
  // Se recorre el ciclo combinado entero —391 pasos, 39,1 s— y en cada uno se
  // comprueba que la variante que elige `varianteEnT` es la que tiene los
  // valores que el motor pone en ese paso.
  test("el índice del reloj apunta a la variante con esos valores, los 391 pasos", () => {
    for (const cubo of [[1], [6], [1, 6]]) {
      const variantes = variantesDeCubo(cubo);
      for (let paso = 0; paso < 391; paso++) {
        const t = paso / 10;
        const esperado = {};
        for (const e of cubo) {
          const p = PATRONES[e];
          esperado[e] = (p[paso % p.length].charCodeAt(0) - 97) * 22;
        }
        const i = varianteEnT(cubo, t);
        assert.ok(i >= 0 && i < variantes.length, `cubo ${cubo}: índice ${i} fuera de rango`);
        assert.deepEqual(variantes[i], esperado,
          `cubo ${cubo}, paso ${paso}: el reloj pide la variante ${i}`);
      }
    }
  });

  test("dos instantes con el mismo estado dan el mismo índice, y uno distinto no", () => {
    // Los pasos 0 y 3 del ciclo son el mismo estado: estilo 1 en 'm' y 6 en 'n'.
    // Es el control que la sonda de pantalla usa para exigir CERO píxeles de
    // diferencia, y aquí se fija el hecho del que depende.
    assert.equal(PATRONES[1][0], PATRONES[1][3]);
    assert.equal(PATRONES[6][0], PATRONES[6][3]);
    assert.equal(varianteEnT([1, 6], 0), varianteEnT([1, 6], 0.3));
    // Y el paso 225 es 'q','q', el más lejano de 'm','n'.
    assert.notEqual(varianteEnT([1, 6], 0), varianteEnT([1, 6], 22.5));
  });

  test("el reloj salta y no interpola: dentro de la décima no se mueve", () => {
    // `flight = (int)Q_floor( ls[i].time * 10 )` y `cl_lightstyle_lerping "0"`.
    for (const t of [0.0, 0.03, 0.07, 0.099]) assert.equal(varianteEnT([1, 6], t), varianteEnT([1, 6], 0));
    assert.equal(varianteEnT([1, 6], 39.1), varianteEnT([1, 6], 0)); // y el ciclo cierra
  });

  test("el valor MEDIO no es ninguno de los cuatro, y por eso hacen falta los cuatro", () => {
    // El atlas de siempre se horneaba con la media de la cadena. Si la media
    // coincidiera con una letra, el parpadeo sería gratis y esto sobraría.
    assert.ok(!valoresDeEstilo(1).includes(valorDeEstilo(1)));
    assert.ok(Math.abs(valorDeEstilo(1) - 264) > 10, "el estilo 1 promedia por encima del fijo");
  });
});

describe("el reparto en cubos no cambia el mapa de luz", { skip: !hayMapa && "no está el .bsp" }, () => {
  // EL CONTROL DEL REPARTO, el mismo que corre la extracción: con todos los
  // estilos a su valor medio, los atlas por cubo tienen que dar el atlas de
  // siempre LUXEL A LUXEL.
  //
  // Repartir 14 527 caras en cuatro atlas y recalcular sus UV es la clase de
  // cambio que sale casi bien: una cara en el cubo equivocado mira a un atlas
  // que también tiene luz, así que se ilumina — con la luz de otro sitio, que
  // no se ve como un fallo sino como el mapa.
  test("a valor medio, los cubos dan el mismo luxel que el atlas entero", () => {
    const bsp = leerBsp(MAPA);
    const modelos = leerModelos(bsp);
    const texinfos = leerTexinfo(bsp);
    let caras = [];
    for (let i = 0; i < modelos.length; i++) caras = caras.concat(leerCaras(bsp, modelos[i], texinfos));
    const conLuz = caras.filter(tieneLuz);
    const tablas = tablasDeGamma();

    const entero = empaquetar(conLuz, { ancho: 1024 });
    const pEntero = pintarAtlas(entero, bsp.lumps.luz.datos, { tablas });
    const donde = new Map(entero.items.map((i) => [i.cara, i]));

    const cubos = new Map();
    for (const c of conLuz) {
      const k = claveDeCubo(cuboDeCara(c));
      if (!cubos.has(k)) cubos.set(k, []);
      cubos.get(k).push(c);
    }
    assert.ok(cubos.size >= 3, `se esperaban varios cubos y hay ${cubos.size}`);

    let comparados = 0, distintos = 0;
    for (const lista of cubos.values()) {
      const a = empaquetar(lista, { ancho: 512 });
      const p = pintarAtlas(a, bsp.lumps.luz.datos, { tablas });
      for (const it of a.items) {
        const antes = donde.get(it.cara);
        for (let ty = 0; ty < it.alto; ty++) {
          for (let tx = 0; tx < it.ancho; tx++) {
            const x = ((antes.y + ty) * entero.ancho + (antes.x + tx)) * 4;
            const y = ((it.y + ty) * a.ancho + (it.x + tx)) * 4;
            comparados++;
            for (let k = 0; k < 3; k++) if (pEntero.rgba[x + k] !== p.rgba[y + k]) { distintos++; break; }
          }
        }
      }
    }
    assert.ok(comparados > 400000, `sólo se han comparado ${comparados} luxels`);
    assert.equal(distintos, 0, `${distintos} de ${comparados} luxels cambian al repartir`);
  });

  test("y una variante SÍ cambia el atlas: el control de que `valores` hace algo", () => {
    // Sin esto, la prueba de arriba la pasaría también un `pintarAtlas` que
    // ignorase `valores` — o sea un parpadeo que no parpadea.
    const bsp = leerBsp(MAPA);
    const modelos = leerModelos(bsp);
    const texinfos = leerTexinfo(bsp);
    const caras = leerCaras(bsp, modelos[0], leerTexinfo(bsp) && texinfos)
      .filter((c) => tieneLuz(c) && c.estilos.includes(1)).slice(0, 400);
    assert.ok(caras.length > 100, "hacen falta caras con el estilo 1");
    const a = empaquetar(caras, { ancho: 512 });
    const tablas = tablasDeGamma();
    const baja = pintarAtlas(a, bsp.lumps.luz.datos, { tablas, valores: { 1: 264 } }); // 'm'
    const alta = pintarAtlas(a, bsp.lumps.luz.datos, { tablas, valores: { 1: 352 } }); // 'q'
    let cambian = 0, total = 0, peor = 0;
    for (const it of a.items) {
      for (let ty = 0; ty < it.alto; ty++) {
        for (let tx = 0; tx < it.ancho; tx++) {
          const o = ((it.y + ty) * a.ancho + (it.x + tx)) * 4;
          total++;
          const d = Math.abs(alta.rgba[o] - baja.rgba[o]);
          if (d) cambian++;
          peor = Math.max(peor, d);
        }
      }
    }
    assert.ok(cambian / total > 0.5, `sólo cambia el ${((cambian / total) * 100).toFixed(1)} % de los luxels`);
    assert.ok(peor >= 8, `el recorrido mayor es de ${peor} y se esperaba algo que se vea`);
    // Y en la dirección buena: 'q' es más claro que 'm'.
    assert.ok(alta.rgba.reduce((s, v, i) => (i % 4 === 3 ? s : s + v), 0) >
      baja.rgba.reduce((s, v, i) => (i % 4 === 3 ? s : s + v), 0));
  });
});
