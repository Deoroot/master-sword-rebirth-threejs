// LA MUERTE, lo que se ve. `src/play/muerte.js`.
//
// El ciclo —el impuesto, la espera, el botón— ya lo comprueba
// `test/juego_sesion.test.mjs` desde el 21. Esto es lo que el 41 añade: el velo
// rojo, la cámara y el grito.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  DESVANECIDO, FFADE, alfaDelDesvanecido, camaraDeMuerte, CAMARA,
  sonidoDeMuerte, SONIDOS, CANALES_QUE_CALLA,
} from "../src/play/muerte.js";
import { anuncioDeMuerte } from "../src/juego/sesion.js";

const U = 39.37;

describe("el velo rojo", () => {
  test("son los seis números del motor y ninguno redondeado", () => {
    assert.deepEqual(DESVANECIDO.color, [255, 0, 0]);
    assert.equal(DESVANECIDO.duracion, 0.2);
    assert.equal(DESVANECIDO.aguante, 15);
    assert.equal(DESVANECIDO.alfa, 128);
    assert.equal(DESVANECIDO.banderas, FFADE.IN);
  });

  test("la pantalla NO se pone roja del todo: 128 de 255 es la mitad", () => {
    // Esto es lo que se describió como «el color se pone algo rojo», y es la
    // diferencia entre ver el mapa detrás y no verlo.
    assert.equal(alfaDelDesvanecido(0), 128);
    assert.ok(DESVANECIDO.alfa < 255);
  });

  test("y dura dos décimas, no quince segundos", () => {
    assert.equal(alfaDelDesvanecido(0.1), 64);
    assert.equal(alfaDelDesvanecido(0.2), 0);
    assert.equal(alfaDelDesvanecido(1.0), 0);
    // El positivo: si el aguante fuera la duración, a los cinco segundos —que
    // es cuando reapareces— todavía habría rojo. No lo hay.
    assert.equal(alfaDelDesvanecido(5), 0);
  });

  test("antes de morir no hay velo", () => {
    assert.equal(alfaDelDesvanecido(-1), 0);
  });
});

describe("la cámara de la muerte", () => {
  // Mirando a −Z (giro 0), la derecha del jugador es +X.
  const origen = [10, 2, 10];

  test("70 unidades a la derecha y 25 arriba, en metros", () => {
    const c = camaraDeMuerte({ origen, yaw: 0, U });
    assert.ok(Math.abs(c.pos[0] - (10 + 70 / U)) < 1e-9, `x=${c.pos[0]}`);
    assert.ok(Math.abs(c.pos[1] - (2 + 25 / U)) < 1e-9, `y=${c.pos[1]}`);
    assert.ok(Math.abs(c.pos[2] - 10) < 1e-9);
    assert.equal(CAMARA.lado, 70);
    assert.equal(CAMARA.alto, 25);
  });

  test("con el jugador girado, la derecha gira con él", () => {
    // Giro de 90°: mirando a −X, la derecha pasa a ser −Z.
    const c = camaraDeMuerte({ origen, yaw: Math.PI / 2, U });
    assert.ok(Math.abs(c.pos[0] - 10) < 1e-9, `x=${c.pos[0]}`);
    assert.ok(Math.abs(c.pos[2] - (10 - 70 / U)) < 1e-9, `z=${c.pos[2]}`);
  });

  test("MIRA AL CUERPO, que es lo que hace el `+= 180`", () => {
    const c = camaraDeMuerte({ origen, yaw: 0, U });
    // El vector que va de la cámara al cuerpo, y hacia dónde mira la cámara.
    const aCuerpo = [origen[0] - c.pos[0], origen[1] - c.pos[1], origen[2] - c.pos[2]];
    const n = Math.hypot(...aCuerpo);
    const mira = [
      -Math.sin(c.yaw) * Math.cos(c.pitch),
      Math.sin(c.pitch),
      -Math.cos(c.yaw) * Math.cos(c.pitch),
    ];
    const cos = (mira[0] * aCuerpo[0] + mira[1] * aCuerpo[1] + mira[2] * aCuerpo[2]) / n;
    // Cero grados de desvío: lo mira de frente, no de lado.
    assert.ok(cos > 0.9999, `el desvío es ${(Math.acos(cos) * 180 / Math.PI).toFixed(2)}°`);
  });

  test("y mira hacia ABAJO, porque está por encima", () => {
    // El positivo del de arriba: si el cabeceo saliera con el signo cambiado,
    // la prueba del ángulo también fallaría, pero esta dice CUÁL de los dos
    // signos es el bueno. En Three, cabeceo negativo es mirar abajo.
    const c = camaraDeMuerte({ origen, yaw: 0, U });
    assert.ok(c.pitch < 0, `cabeceo ${c.pitch}`);
    // 25 arriba sobre 70 de lado son 19,65°.
    const grados = (-c.pitch * 180) / Math.PI;
    assert.ok(Math.abs(grados - 19.65) < 0.1, `${grados.toFixed(2)}°`);
  });

  test("una pared a medio camino la para, y lo dice", () => {
    // `if (tr.flFraction < 1.0) vOrigin = tr.vecEndPos;`
    const c = camaraDeMuerte({
      origen, yaw: 0, U,
      trazar: (desde, hasta) => ({
        fraccion: 0.5,
        punto: [(desde[0] + hasta[0]) / 2, (desde[1] + hasta[1]) / 2, (desde[2] + hasta[2]) / 2],
      }),
    });
    assert.equal(c.chocada, true);
    assert.ok(Math.abs(c.pos[0] - (10 + 35 / U)) < 1e-9, `x=${c.pos[0]}`);
    // Y sigue mirando al cuerpo: la traza mueve el sitio, no la mirada.
    assert.ok(c.pitch < 0);
  });

  test("sin choque no se toca nada", () => {
    const c = camaraDeMuerte({ origen, yaw: 0, U, trazar: () => ({ fraccion: 1 }) });
    assert.equal(c.chocada, false);
    assert.ok(Math.abs(c.pos[0] - (10 + 70 / U)) < 1e-9);
  });
});

describe("el grito, que no sale de `DeathSound()`", () => {
  test("depende del género", () => {
    assert.equal(sonidoDeMuerte("male"), "player/death.wav");
    assert.equal(sonidoDeMuerte("female"), "player/femaledeath.wav");
  });

  test("y un género que no existe cae en el de hombre, no en el silencio", () => {
    assert.equal(sonidoDeMuerte("elfo"), SONIDOS.male);
    assert.equal(sonidoDeMuerte(undefined), SONIDOS.male);
  });

  test("`DeathSound()` calla tres canales y no reproduce nada", () => {
    // La función que se llama «sonido de muerte» tiene el `PlaySound`
    // comentado. Los tres `STOP_SOUND` son todo lo que hace, y están aquí para
    // que la lista no se pierda el día que alguien la busque.
    assert.deepEqual(CANALES_QUE_CALLA, ["item", "body", "weapon"]);
  });
});

describe("el anuncio", () => {
  test("no dice «You died»: dice tu nombre y «has fallen»", () => {
    assert.equal(anuncioDeMuerte("Rowan"), "Rowan has fallen!");
    assert.ok(!/you died/i.test(anuncioDeMuerte("Rowan")));
  });
});
