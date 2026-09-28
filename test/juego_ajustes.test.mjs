// LOS AJUSTES, APLICADOS. Experimento 37.
//
// Hasta el 36 la ventana de «Options» reunía los valores y se los entregaba a
// nadie. Lo que se comprueba aquí es lo otro: que el número que enseña el
// deslizador es el número con el que gira el ratón, suena el sonido y se
// ilumina el mapa.
//
// Lo que NO se puede comprobar sin navegador —que el atlas cambie de verdad en
// la tarjeta, que Web Audio baje— va en `sondas/ajustes37.mjs`.
//
// ── El control que vale por todos ─────────────────────────────────────────
//
// Con la gamma nueva igual que la vieja, `remapearLuz()` tiene que dar la
// identidad EXACTA. Es lo que distingue «remapear» de «estropear un poco cada
// vez»: si la identidad no sale clavada, cada vez que alguien roce el
// deslizador el mapa perderá un poco y nadie lo verá hasta que esté oscuro.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  Raton, ganancia, M_YAW, M_PITCH, PITCH_MAX,
} from "../src/play/aplicar.js";
import {
  AJUSTES as GAMMA, LIMITES, validar, remapearLuz, errorDeRemapeo, tablasDeGamma,
} from "../src/bsp/gamma.js";
import { esIdentidad } from "../src/render/regamma.js";
import { ajuste, cuenta, porDefecto } from "../src/play/ajustes.js";
import { leerBsp, leerModelos, leerTexinfo, leerCaras, tieneLuz } from "../src/bsp/lector.js";
import { empaquetar, pintarAtlas } from "../src/bsp/luz.js";

const RUTA_CFG = "../MSC/assets/msr/config.cfg";
const CFG = existsSync(RUTA_CFG) ? readFileSync(RUTA_CFG, "utf8") : null;
const MAPA = "../MSC/assets/msr/maps/gatecity.bsp";
const hayMapa = existsSync(MAPA);

const grados = (rad) => (rad * 180) / Math.PI;

// ── EL RATÓN ────────────────────────────────────────────────────────────────

describe("el ratón, con la fórmula del mod", () => {
  test("`m_yaw` y `m_pitch` son los del config.cfg", { skip: !CFG }, () => {
    // La misma regla que trajo las teclas y la gamma: cuando exista el
    // original, leerlo. Sin esto los dos números son dos constantes bonitas.
    assert.match(CFG, /m_yaw\s+"0\.022"/);
    assert.match(CFG, /m_pitch\s+"0\.022000"/);
    assert.equal(M_YAW, 0.022);
    assert.equal(M_PITCH, 0.022);
  });

  test("con la sensibilidad del archivo gira 0,22 grados por cuenta", () => {
    // `sensitivity 10` × `m_yaw 0.022` = 0,22 grados. Es la cuenta entera de
    // `IN_ScaleMouse` + `IN_MouseMove`, y es el número que la constante
    // `MOUSE = 0.0022` —0,126 grados— llevaba desde el experimento 02.
    const r = new Raton({ sensibilidad: 10, filtro: false });
    const g = r.mover(100, 0);
    assert.ok(Math.abs(grados(-g.yaw) / 100 - 0.22) < 1e-9, grados(-g.yaw) / 100);
    // Y el control de que esto NO es la constante vieja: 0,126 grados sería
    // pasar esta prueba por casualidad si alguien la escribiera al revés.
    assert.ok(Math.abs(grados(-g.yaw) / 100 - 0.126) > 0.09);
  });

  test("la sensibilidad multiplica, y las dos puntas del deslizador se notan", () => {
    const suave = new Raton({ sensibilidad: 0.2, filtro: false }).mover(100, 0);
    const bruto = new Raton({ sensibilidad: 20, filtro: false }).mover(100, 0);
    assert.ok(Math.abs(bruto.yaw / suave.yaw - 100) < 1e-6, "20 gira cien veces más que 0,2");
    // Y coinciden con las puntas que enseña la ventana, medidas de la captura.
    assert.equal(ajuste("sensibilidad").min, 0.2);
    assert.equal(ajuste("sensibilidad").max, 20);
  });

  test("el filtro es la media de DOS muestras, no un arrastre", () => {
    // `mouse_x = (mx + old_mouse_x) * 0.5; old_mouse_x = mx;`
    // Lo que se guarda es la cuenta CRUDA. Guardar la filtrada daría un ratón
    // que sigue moviéndose medio segundo después de parar, y eso se nota
    // jugando y no se ve leyendo.
    const r = new Raton({ sensibilidad: 10, filtro: true });
    const uno = r.mover(100, 0);          // (100 + 0) / 2 = 50
    const dos = r.mover(100, 0);          // (100 + 100) / 2 = 100
    const tres = r.mover(0, 0);           // (0 + 100) / 2 = 50
    assert.ok(Math.abs(uno.yaw / dos.yaw - 0.5) < 1e-9, "la primera vale la mitad");
    assert.ok(Math.abs(tres.yaw / dos.yaw - 0.5) < 1e-9, "y al parar queda media, no más");
    const cuatro = r.mover(0, 0);
    assert.equal(Math.abs(cuatro.yaw), 0, "a la segunda quieta, quieto: no hay cola");
  });

  test("sin filtro, una cuenta es una cuenta", () => {
    const r = new Raton({ sensibilidad: 10, filtro: false });
    assert.equal(r.mover(100, 0).yaw, r.mover(100, 0).yaw);
  });

  test("`olvidar()` borra la muestra vieja, que es lo que pide soltar el puntero", () => {
    const r = new Raton({ sensibilidad: 10, filtro: true });
    r.mover(1000, 1000);
    r.olvidar();
    const g = r.mover(100, 0);
    assert.ok(Math.abs(grados(-g.yaw) / 100 - 0.11) < 1e-9, "arranca de cero: media de 100 y 0");
  });

  test("invertir el ratón es el SIGNO de m_pitch, y no toca el giro", () => {
    const normal = new Raton({ sensibilidad: 10, filtro: false, invertido: false }).mover(100, 100);
    const alreves = new Raton({ sensibilidad: 10, filtro: false, invertido: true }).mover(100, 100);
    assert.equal(normal.yaw, alreves.yaw, "el yaw no se entera");
    assert.equal(normal.pitch, -alreves.pitch);
  });

  test("el tope de la vista es 89 grados, que es `cl_pitchup`", () => {
    // Aquí había ±(90° − 0,57°), que es el mismo tope con un número inventado.
    assert.ok(Math.abs(grados(PITCH_MAX) - 89) < 1e-9);
  });
});

// ── EL VOLUMEN ──────────────────────────────────────────────────────────────

describe("el volumen", () => {
  test("los dos valores por defecto son los del archivo", { skip: !CFG }, () => {
    assert.match(CFG, /volume\s+"0\.120000"/);
    assert.match(CFG, /MP3Volume\s+"0\.2"/);
    assert.equal(ajuste("volumen").pordefecto, 0.12);
    assert.equal(ajuste("volumenMp3").pordefecto, 0.2);
  });

  test("la ganancia se recorta a [0, 1] y lo que no es número vale 1", () => {
    assert.equal(ganancia(0.12), 0.12);
    assert.equal(ganancia(-3), 0);
    assert.equal(ganancia(9), 1);
    assert.equal(ganancia("no"), 1);
  });

  test("la música tiene su ajuste vivo, porque hay música", () => {
    // Estaba apagado con «no hay pista de música en este port», y hay cuatro:
    // `msgatecity.mp3` entre ellas. El ajuste estaba muerto por una frase vieja.
    assert.equal(ajuste("volumenMp3").porQueNo, undefined);
    assert.equal(ajuste("volumen").porQueNo, undefined);
  });
});

// ── EL NOMBRE ───────────────────────────────────────────────────────────────

test("el nombre por defecto es el del cvar `name`, y es el del archivo", { skip: !CFG }, () => {
  // Decía «Player» con un comentario explicando que `config.cfg` no traía
  // `name`. Lo trae, en la línea 160.
  assert.match(CFG, /name\s+"Adventurer"/);
  assert.equal(ajuste("nombre").pordefecto, "Adventurer");
  assert.equal(porDefecto().nombre, "Adventurer");
});

// ── LA GAMMA ────────────────────────────────────────────────────────────────

describe("rehacer el mapa de luz", () => {
  test("los topes son los de `V_ValidateGammaCvars`, y los del deslizador", () => {
    assert.deepEqual(LIMITES.gamma, [1.8, 3]);
    assert.deepEqual(LIMITES.brillo, [0, 3]);
    assert.equal(ajuste("gamma").min, 1.8);
    assert.equal(ajuste("gamma").max, 3);
    assert.equal(ajuste("brillo").max, 3);
  });

  test("y se recortan como los recorta el motor", () => {
    assert.equal(validar({ gamma: 99, brillo: -5 }).gamma, 3);
    assert.equal(validar({ gamma: 99, brillo: -5 }).brightness, 0);
    assert.equal(validar({ gamma: 1, brillo: 9 }).gamma, 1.8);
    assert.equal(validar({ gamma: 1, brillo: 9 }).brightness, 3);
  });

  test("CONTROL: con la misma gamma, la tabla es la identidad EXACTA", () => {
    const lut = remapearLuz(GAMMA, GAMMA);
    assert.ok(esIdentidad(lut), "un remapeo a lo mismo no puede mover ni un byte");
    assert.deepEqual(errorDeRemapeo(GAMMA, GAMMA), { peor: 0, medio: 0 });
  });

  test("y con otra, no lo es: la tabla tiene que mover algo", () => {
    // El control contrario. Sin él, una tabla que fuera SIEMPRE la identidad
    // pasaría la prueba de arriba y dejaría los dos deslizadores de adorno.
    const oscuro = remapearLuz(GAMMA, validar({ gamma: 3, brillo: 0 }));
    assert.ok(!esIdentidad(oscuro));
    // Bajar el brillo oscurece: ni un byte puede subir.
    let subidos = 0;
    for (let v = 0; v < 256; v++) if (oscuro[v] > v) subidos++;
    assert.equal(subidos, 0, "bajar el brillo no puede aclarar ningún téxel");
  });

  test("subir el brillo aclara, que es la otra dirección", () => {
    const claro = remapearLuz(validar({ gamma: 3, brillo: 0 }), validar({ gamma: 3, brillo: 3 }));
    let bajados = 0;
    for (let v = 1; v < 256; v++) if (claro[v] < v) bajados++;
    assert.equal(bajados, 0);
  });

  test("la tabla es monótona: un téxel más claro nunca sale más oscuro", () => {
    // Si no lo fuera, el mapa saldría con manchas invertidas —una zona clara
    // más oscura que su sombra—, que es un fallo que parece geometría.
    for (const [g, b] of [[1.8, 0], [2.2, 1], [3, 3], [2.5, 2]]) {
      const lut = remapearLuz(GAMMA, validar({ gamma: g, brillo: b }));
      for (let v = 1; v < 256; v++) {
        assert.ok(lut[v] >= lut[v - 1], `no es monótona en ${v} con gamma ${g} brillo ${b}`);
      }
    }
  });

  test("cuánto se equivoca la tabla contra hornear de verdad, medido", () => {
    // La tabla no puede ser exacta y eso no se esconde: el atlas guarda 256
    // valores de los 1024 índices del motor, así que la inversa tiene que
    // elegir. Lo que se fija aquí es cuánto, para que nadie lo empeore sin
    // enterarse.
    const peores = [[3, 0], [3, 3], [1.8, 2], [2.2, 1]].map(
      ([g, b]) => errorDeRemapeo(GAMMA, validar({ gamma: g, brillo: b })).peor
    );
    assert.ok(Math.max(...peores) <= 40, `el peor error es ${Math.max(...peores)} de 255`);
    const medios = [[3, 0], [3, 3], [1.8, 2], [2.2, 1]].map(
      ([g, b]) => errorDeRemapeo(GAMMA, validar({ gamma: g, brillo: b })).medio
    );
    assert.ok(Math.max(...medios) <= 6, `el peor error medio es ${Math.max(...medios)}`);
  });
});

describe("la tabla, contra el atlas de verdad", { skip: !hayMapa && "no está el .bsp" }, () => {
  // La prueba de arriba mide sobre los 1024 índices del motor, que es el peor
  // caso teórico. Ésta mide sobre los luxels que TIENE Gate City, que es lo
  // que va a ver el jugador: si el error se concentra en valores que el mapa
  // no usa, no se nota, y si se concentra donde sí, hay que decirlo.
  test("remapear el atlas horneado se parece a hornearlo con la gamma nueva", () => {
    const bsp = leerBsp(MAPA);
    const modelos = leerModelos(bsp);
    const texinfos = leerTexinfo(bsp);
    let caras = [];
    for (let i = 0; i < modelos.length; i++) caras = caras.concat(leerCaras(bsp, modelos[i], texinfos));
    const conLuz = caras.filter(tieneLuz).slice(0, 2000);
    const atlas = empaquetar(conLuz, { ancho: 1024 });

    const nueva = validar({ gamma: 3, brillo: 1 });
    const horneado = pintarAtlas(atlas, bsp.lumps.luz.datos, { tablas: tablasDeGamma(GAMMA) });
    const deVerdad = pintarAtlas(atlas, bsp.lumps.luz.datos, { tablas: tablasDeGamma(nueva) });
    const lut = remapearLuz(GAMMA, nueva);

    let n = 0, suma = 0, peor = 0;
    for (let i = 0; i < horneado.rgba.length; i += 4) {
      for (let k = 0; k < 3; k++) {
        const d = Math.abs(lut[horneado.rgba[i + k]] - deVerdad.rgba[i + k]);
        suma += d; n++;
        if (d > peor) peor = d;
      }
    }
    const medio = suma / n;
    // Los números que salen van al informe. Lo que se fija es el orden de
    // magnitud: un error medio por debajo de un byte sobre 255 es invisible, y
    // si alguien rompe la inversa esto se va a las decenas.
    assert.ok(medio < 1, `error medio ${medio.toFixed(3)} de 255 (peor ${peor})`);
  });

  test("CONTROL: sobre el atlas de verdad, la misma gamma no mueve un byte", () => {
    const bsp = leerBsp(MAPA);
    const modelos = leerModelos(bsp);
    const texinfos = leerTexinfo(bsp);
    let caras = [];
    for (let i = 0; i < modelos.length; i++) caras = caras.concat(leerCaras(bsp, modelos[i], texinfos));
    const atlas = empaquetar(caras.filter(tieneLuz).slice(0, 500), { ancho: 512 });
    const p = pintarAtlas(atlas, bsp.lumps.luz.datos, { tablas: tablasDeGamma(GAMMA) });
    const lut = remapearLuz(GAMMA, GAMMA);
    let distintos = 0;
    for (let i = 0; i < p.rgba.length; i += 4) {
      for (let k = 0; k < 3; k++) if (lut[p.rgba[i + k]] !== p.rgba[i + k]) distintos++;
    }
    assert.equal(distintos, 0);
  });
});

// ── LA CUENTA ───────────────────────────────────────────────────────────────

test("cuántos ajustes hacen algo, ahora que hacen algo", () => {
  const c = cuenta();
  // Nueve: los ocho del 34 más el volumen de la música, que estaba apagado por
  // una frase que ya no era verdad. La cuenta se calcula, así que esta prueba
  // es lo único que obliga a mirarla cuando cambie.
  assert.equal(c.vivos, 9, JSON.stringify(c.porPestana));
  assert.equal(c.total, c.vivos + c.apagados);
  // Y los que se han enganchado en el 37 están entre ellos.
  for (const clave of ["sensibilidad", "ratonInvertido", "filtro", "volumen", "volumenMp3",
                       "brillo", "gamma", "nombre", "teclas"]) {
    assert.equal(ajuste(clave).porQueNo, undefined, `${clave} debería estar vivo`);
  }
});
