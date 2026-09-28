// La regla de los pasos, comprobada contando disparos y no escuchando.
//
// Es la mitad del sonido que se puede probar sin sonido, y es la mitad donde
// están las decisiones: cuándo suena, con qué pie y a qué volumen. Varias de
// estas traen su control negativo porque describen asimetrías que parecen
// erratas —el corte de 220 que deja mudo andar, el pie que cambia aunque no
// suene, el umbral de 120 que no filtra— y que si alguien «limpia», no dan
// error: dan otro juego.

import test, { describe } from "node:test";
import assert from "node:assert/strict";

import {
  Pasos, MATERIALES, VELOCIDAD, MINIMO_MULTIJUGADOR, AGACHADO,
  materialDe, POR_DEFECTO,
} from "../src/play/sonido.js";

/** Corre el contador n segundos a velocidad constante y devuelve los pasos. */
function andar(pasos, { u, segundos, dt = 1 / 60, ...resto }) {
  const dados = [];
  for (let t = 0; t < segundos; t += dt) {
    const r = pasos.tic(dt, { velocidad: [u, 0, 0], enSuelo: true, ...resto });
    if (r) dados.push(r);
  }
  return dados;
}

describe("cuándo suena un paso", () => {
  test("corriendo suena, y al ritmo que dice el motor", () => {
    const p = new Pasos({ azar: () => 0 });
    const dados = andar(p, { u: 300, segundos: 3, material: "tierra" });
    // 300 ms por paso -> 10 en tres segundos, más el primero, que es inmediato.
    assert.ok(dados.length >= 10 && dados.length <= 11, `fueron ${dados.length}`);
    assert.equal(dados[0].material, "tierra");
  });

  test("y ANDANDO no suena: el corte de 220 de multijugador", () => {
    const p = new Pasos({ azar: () => 0 });
    // 150 u/s es andar de sobra: por encima de los 120 de `velwalk`.
    assert.ok(150 > VELOCIDAD.andar && 150 < MINIMO_MULTIJUGADOR);
    assert.equal(andar(p, { u: 150, segundos: 3, material: "tierra" }).length, 0);
  });

  test("el control: el mismo caso en un jugador SÍ suena", () => {
    const p = new Pasos({ multijugador: false, azar: () => 0 });
    assert.ok(andar(p, { u: 150, segundos: 3, material: "tierra" }).length > 0);
  });

  test("y el pie cambia aunque el paso no suene", () => {
    // El `return` del corte está DESPUÉS de `iStepLeft = !iStepLeft`. Si
    // estuviera antes, al empezar a correr saldría siempre el mismo pie.
    const p = new Pasos({ azar: () => 0 });
    andar(p, { u: 150, segundos: 1, material: "tierra" });   // muda, pero cuenta
    const izquierdoTrasAndarMudo = p.izquierdo;
    const q = new Pasos({ azar: () => 0 });
    assert.notEqual(izquierdoTrasAndarMudo, q.izquierdo,
      "andar en silencio tiene que haber movido el pie igual");
  });

  test("en el aire no suena nada", () => {
    const p = new Pasos({ azar: () => 0 });
    const dados = [];
    for (let t = 0; t < 3; t += 1 / 60) {
      const r = p.tic(1 / 60, { velocidad: [400, 0, 0], enSuelo: false, material: "tierra" });
      if (r) dados.push(r);
    }
    assert.equal(dados.length, 0);
  });

  test("quieto en el suelo tampoco", () => {
    const p = new Pasos({ azar: () => 0 });
    assert.equal(andar(p, { u: 0, segundos: 3, material: "tierra" }).length, 0);
  });
});

describe("el umbral de 120 que no filtra", () => {
  test("`velwalk` existe pero no decide: a 1 u/s en un jugador ya suena", () => {
    // En el motor la condición es `speed >= velwalk || flTimeStepSound == 0`,
    // y la función ha vuelto antes si el reloj no era cero — o sea que el
    // segundo término es verdad siempre. Escribirlo como umbral deja mudo un
    // tramo que en el motor suena, y no da ningún error.
    const p = new Pasos({ multijugador: false, azar: () => 0 });
    assert.ok(1 < VELOCIDAD.andar);
    assert.ok(andar(p, { u: 1, segundos: 2, material: "tierra" }).length > 0);
  });

  test("el que SÍ decide es `velrun`: separa andar de correr", () => {
    const lento = new Pasos({ multijugador: false, azar: () => 0 });
    const rapido = new Pasos({ multijugador: false, azar: () => 0 });
    const a = andar(lento, { u: VELOCIDAD.correr - 10, segundos: 2, material: "tierra" })[0];
    const b = andar(rapido, { u: VELOCIDAD.correr + 10, segundos: 2, material: "tierra" })[0];
    assert.equal(a.volumen, MATERIALES.tierra.andando[0]);
    assert.equal(b.volumen, MATERIALES.tierra.corriendo[0]);
    assert.ok(b.volumen > a.volumen);
  });
});

describe("de qué suena el suelo", () => {
  test("una textura sin declarar suena a piedra, que es el `default:`", () => {
    assert.equal(materialDe("wood_018", { "MS_WOOD01": "madera" }), POR_DEFECTO);
  });

  test("y se compara con los 12 primeros caracteres, sin mayúsculas", () => {
    const tabla = { "MS_GRS01PTH_": "tierra" };
    // 12 caracteres justos, y el original lleva un guión bajo de más al final.
    assert.equal(materialDe("ms_grs01pth_largo", tabla), "tierra");
    assert.equal(materialDe("MS_GRS01PTH_", tabla), "tierra");
  });

  test("el agua manda sobre la textura, y la rodilla sobre los pies", () => {
    const p = new Pasos({ azar: () => 0 });
    const conRodilla = p.tic(1, {
      velocidad: [300, 0, 0], enSuelo: true, material: "tierra",
      rodillaEnAgua: true, piesEnAgua: true,
    });
    assert.equal(conRodilla.material, "vadeo");
    const q = new Pasos({ azar: () => 0 });
    const soloPies = q.tic(1, {
      velocidad: [300, 0, 0], enSuelo: true, material: "tierra", piesEnAgua: true,
    });
    assert.equal(soloPies.material, "chapoteo");
  });

  test("y la escalera manda sobre el agua", () => {
    const p = new Pasos({ azar: () => 0 });
    const r = p.tic(1, {
      velocidad: [0, 100, 0], enEscalera: true, rodillaEnAgua: true, material: "tierra",
    });
    assert.equal(r.material, "escalera");
  });

  test("el vadeo no cambia con la velocidad, y la piedra sí", () => {
    assert.deepEqual(MATERIALES.vadeo.andando, MATERIALES.vadeo.corriendo);
    assert.notDeepEqual(MATERIALES.piedra.andando, MATERIALES.piedra.corriendo);
  });
});

describe("agachado y escalera", () => {
  test("agachado suma 100 ms y baja el volumen al 35 %", () => {
    const p = new Pasos({ multijugador: false, azar: () => 0 });
    const r = p.tic(1, { velocidad: [300, 0, 0], enSuelo: true, material: "piedra", agachado: true });
    assert.equal(p.reloj, MATERIALES.piedra.corriendo[1] + AGACHADO.masMilis);
    assert.ok(Math.abs(r.volumen - MATERIALES.piedra.corriendo[0] * AGACHADO.volumen) < 1e-9);
  });

  test("en escalera suena aunque se suba despacio: el corte de 220 no aplica", () => {
    const p = new Pasos({ azar: () => 0 });
    const dados = [];
    for (let t = 0; t < 2; t += 1 / 60) {
      // 200 u/s de subida, por debajo del corte.
      const r = p.tic(1 / 60, { velocidad: [0, 200, 0], enEscalera: true });
      if (r) dados.push(r);
    }
    assert.ok(dados.length > 0, "la escalera está exenta del corte");
    assert.equal(dados[0].material, "escalera");
  });

  test("y el control: esos mismos 200 u/s en el suelo son mudos", () => {
    const p = new Pasos({ azar: () => 0 });
    assert.equal(andar(p, { u: 200, segundos: 2, material: "piedra" }).length, 0);
  });
});

describe("los pies alternan de verdad", () => {
  test("las cuatro muestras salen, y en el orden del motor", () => {
    // `irand = rnd(0,1) + 2*iStepLeft`: 0 y 1 son el pie derecho, 2 y 3 el
    // izquierdo. Con el azar fijado a cada extremo salen 0/2 y 1/3.
    const bajo = new Pasos({ azar: () => 0 });
    const alto = new Pasos({ azar: () => 0.99 });
    const a = andar(bajo, { u: 300, segundos: 3, material: "piedra" }).map((x) => x.muestra);
    const b = andar(alto, { u: 300, segundos: 3, material: "piedra" }).map((x) => x.muestra);
    assert.deepEqual([...new Set(a)].sort(), [0, 2]);
    assert.deepEqual([...new Set(b)].sort(), [1, 3]);
    // Y alternan: nunca dos seguidas del mismo pie.
    for (let i = 1; i < a.length; i++) assert.notEqual(a[i] >= 2, a[i - 1] >= 2);
  });
});

describe("el reloj", () => {
  test("aterrizar da el paso en el acto", () => {
    const p = new Pasos({ azar: () => 0 });
    p.tic(1 / 60, { velocidad: [300, 0, 0], enSuelo: true, material: "piedra" });
    assert.ok(p.reloj > 0, "acaba de dar uno, está esperando");
    p.alAterrizar();
    const r = p.tic(1 / 60, { velocidad: [300, 0, 0], enSuelo: true, material: "piedra" });
    assert.ok(r, "al aterrizar suena sin esperar");
  });

  test("y baja aunque no se dé ningún paso", () => {
    // Si el reloj sólo bajara al dar pasos, quien para y arranca daría el
    // siguiente con retraso. En el motor `PM_ReduceTimers` va aparte.
    const p = new Pasos({ azar: () => 0 });
    p.tic(1 / 60, { velocidad: [300, 0, 0], enSuelo: true, material: "piedra" });
    const antes = p.reloj;
    p.tic(0.1, { velocidad: [0, 0, 0], enSuelo: true, material: "piedra" });
    assert.ok(p.reloj < antes - 90, `bajó de ${antes} a ${p.reloj} estando quieto`);
  });
});
