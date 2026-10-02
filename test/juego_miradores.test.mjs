// EL RECORRIDO DE LA CÁMARA DEL MENÚ, comprobado sin navegador.
//
// Lo que se puede probar aquí es la REGLA: que la curva pase por sus puntos, que
// la vuelta no dé un tirón, que el paralaje llegue igual a 60 y a 144 Hz, y que
// la cámara mire a donde se le dice. Que se VEA es cosa de `sondas/menu52.mjs`;
// aquí no hay pantalla que medir.
//
// Y una que no es de aspecto sino de seguridad: sin mirador medido el paseo dice
// que no vale, porque de eso depende que el menú se quede con la pintura en vez
// de mirar al vacío.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  MIRADORES, PARALAJE, SEGUNDOS_POR_VUELTA, UNIDADES_POR_METRO,
  miradorDe, enLaCurva, faseDelRecorrido, paseoDeMenu,
} from "../src/play/miradores.js";

const cerca = (a, b, eps, que = "") => assert.ok(
  Math.abs(a - b) <= eps, `${que}: ${a} no está a ${eps} de ${b}`,
);
const cercaV = (a, b, eps, que = "") => {
  for (let k = 0; k < 3; k++) cerca(a[k], b[k], eps, `${que}[${k}]`);
};

// Un mirador de mentira, en unidades del juego, con los puntos bien repartidos.
const RECTA = [[0, 0, 0], [39.37, 0, 0], [78.74, 0, 0], [118.11, 0, 0]];
const CURVO = [[0, 0, 0], [100, 40, 0], [200, 0, 100], [100, 80, 200]];

describe("la curva del recorrido", () => {
  test("pasa por el primer y el último punto, no se acerca", () => {
    // Es lo que distingue una curva abierta con los extremos reflejados de una
    // que se queda a medio camino: sin la extrapolación, `s = 0` no da `p[0]`.
    cercaV(enLaCurva(CURVO, 0), CURVO[0], 1e-9, "el principio");
    cercaV(enLaCurva(CURVO, 1), CURVO[CURVO.length - 1], 1e-9, "el final");
  });

  test("pasa por los puntos de en medio", () => {
    const tramos = CURVO.length - 1;
    for (let i = 1; i < tramos; i++) {
      cercaV(enLaCurva(CURVO, i / tramos), CURVO[i], 1e-9, `el punto ${i}`);
    }
  });

  test("NO SE PASA DE LARGO EN UNA HORQUILLA, que es por lo que es centrípeto", () => {
    // Y la horquilla no es un caso cualquiera: es el único que sirve.
    //
    // Este control empezó usando los puntos de `CURVO` y **no medía nada**. Se
    // vio cambiando `ALFA` a 0 —el Catmull-Rom uniforme, el defecto del que
    // queremos protegernos— y viendo que la prueba seguía verde. Medido con
    // `desviación máxima respecto de la polilínea`:
    //
    //   puntos            uniforme   centrípeto
    //   CURVO                 13,9         13,9   ← idénticos: no distingue nada
    //   horquilla             11,2          3,1   ← ×3,7
    //   tramo corto            4,4          1,0   ← ×4,3
    //   subida brusca          4,8          6,1   ← el centrípeto es PEOR aquí
    //
    // La última fila importa para no contar de más: el centrípeto no se desvía
    // menos siempre. Lo que evita es el rizo y la cúspide donde un tramo corto
    // va entre dos largos, y de eso se protege el menú, porque los puntos de un
    // mirador se eligen por el encuadre y quedan mal repartidos por definición.
    const HORQUILLA = [[0, 0, 0], [100, 0, 0], [104, 8, 0], [4, 8, 0]];
    const desvio = (puntos) => {
      let peor = 0;
      for (let i = 0; i <= 2000; i++) {
        const p = enLaCurva(puntos, i / 2000);
        let d = Infinity;
        for (let j = 0; j < puntos.length - 1; j++) {
          const a = puntos[j], b = puntos[j + 1];
          const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
          const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
          const L = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
          const t = Math.max(0, Math.min(1, L ? (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / L : 0));
          d = Math.min(d, Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t));
        }
        peor = Math.max(peor, d);
      }
      return peor;
    };
    // El umbral va entre los dos valores medidos —3,1 y 11,2— y no pegado a
    // ninguno, para que un cambio pequeño en la fórmula no lo ponga rojo solo.
    const d = desvio(HORQUILLA);
    assert.ok(d < 6, `se desvió ${d.toFixed(1)} de su polilínea; el uniforme se va a 11,2`);
    // Control positivo: que 6 no sea un número tan grande que lo pase cualquier
    // cosa. Una curva de verdad se desvía algo en una horquilla de 8 de ancho.
    assert.ok(d > 1, `se desvió ${d.toFixed(1)}: esto no está curvando nada`);
  });

  test("un punto repetido no la rompe", () => {
    // El 0/0 de un tramo de largo cero. Pasa en cuanto alguien copia una fila
    // de la tabla de miradores y se olvida de moverla.
    const p = enLaCurva([[0, 0, 0], [10, 0, 0], [10, 0, 0], [20, 0, 0]], 0.5);
    assert.ok(p.every(Number.isFinite), `salió ${JSON.stringify(p)}`);
  });

  test("con un punto o con ninguno no revienta", () => {
    assert.equal(enLaCurva([], 0.5), null);
    cercaV(enLaCurva([[1, 2, 3]], 0.5), [1, 2, 3], 1e-9, "el único punto");
  });
});

describe("la ida y la vuelta", () => {
  test("empieza y acaba la vuelta en el mismo sitio", () => {
    cerca(faseDelRecorrido(0), 0, 1e-12, "el segundo cero");
    cerca(faseDelRecorrido(SEGUNDOS_POR_VUELTA), 0, 1e-12, "la vuelta entera");
    cerca(faseDelRecorrido(SEGUNDOS_POR_VUELTA / 2), 1, 1e-12, "la mitad");
  });

  test("LA VELOCIDAD ES CERO EN LOS EXTREMOS, que es todo el motivo del coseno", () => {
    // Un diente de sierra rebotado también empieza en 0 y llega a 1; lo que no
    // hace es frenar. Si alguien cambia esto por un rebote lineal, esta prueba
    // es la que se pone roja: la velocidad en el extremo pasaría de ~0 a ~2/T.
    // Y LA DIFERENCIA ES DE UN SOLO LADO, no centrada. Con una diferencia
    // centrada esta prueba pasa también con un rebote lineal —lo comprobé
    // rompiéndolo—: en un vértice simétrico `f(t+dt) − f(t−dt)` se cancela
    // exactamente, así que el cero que leía era la resta anulándose y no la
    // cámara frenando. Es el apartado 4 de CLAUDE.md en tres líneas.
    const dt = 0.01;
    const vel = (t) => Math.abs(faseDelRecorrido(t + dt) - faseDelRecorrido(t)) / dt;
    const media = 2 / SEGUNDOS_POR_VUELTA;      // la de un rebote lineal
    assert.ok(vel(0) < media * 0.05, `en el extremo iba a ${vel(0)}`);
    assert.ok(vel(SEGUNDOS_POR_VUELTA / 2) < media * 0.05,
      `en el otro extremo iba a ${vel(SEGUNDOS_POR_VUELTA / 2)}`);
    // Y en el medio del trayecto sí corre, para que el cero de arriba no sea
    // simplemente que esto no se mueve. El control positivo de la prueba.
    assert.ok(vel(SEGUNDOS_POR_VUELTA / 4) > media, `en medio iba a ${vel(SEGUNDOS_POR_VUELTA / 4)}`);
  });

  test("un periodo de cero no divide por cero", () => {
    assert.equal(faseDelRecorrido(10, 0), 0);
  });
});

describe("el paseo", () => {
  const mirador = { puntos: RECTA, mirar: null, segundos: 90 };

  test("sin mirador medido no vale, y ése es el que deja la pintura puesta", () => {
    const p = paseoDeMenu({ mirador: null });
    assert.equal(p.valido, false);
    assert.equal(p.avanzar(0.016), null);
    // Y la tabla puede estar vacía sin que nada se caiga: es como está hoy.
    assert.equal(miradorDe("un_mapa_que_no_existe"), null);
  });

  test("los puntos se leen en unidades del juego y salen en metros", () => {
    // 39,37 y no 32: Gate City es de GoldSrc. Confundirlos deja al jugador un
    // 23 % más grande, y aquí dejaría la cámara a 39 metros de donde se quería.
    const p = paseoDeMenu({ mirador: { puntos: RECTA, mirar: [0, 0, 0], segundos: 90 } });
    const a = p.avanzar(0);
    cercaV(a.pos, [0, 0, 0], 1e-9, "el primer punto");
    const b = paseoDeMenu({ mirador, desde: 45 }).avanzar(0);   // la mitad: el final
    cerca(b.pos[0], RECTA[3][0] / UNIDADES_POR_METRO, 1e-6, "el último punto en metros");
  });

  test("mira al punto de interés cuando lo hay", () => {
    // La cámara en (0,0,0) mirando a (0,0,-100): en estos ejes eso es yaw 0.
    const p = paseoDeMenu({
      mirador: { puntos: [[0, 0, 0], [0, 0, 39.37]], mirar: [0, 0, -3937], segundos: 90 },
      paralaje: { ...PARALAJE, desplazamiento: 0, giro: 0 },
    });
    const a = p.avanzar(0);
    cerca(a.yaw, 0, 1e-6, "mirando al norte");
    cerca(a.pitch, 0, 1e-3, "sin cabeceo");
  });

  test("mira hacia abajo cuando el punto de interés está abajo, y el signo es el de Three", () => {
    // El mismo signo que `camaraDeMuerte`: mirar hacia abajo es pitch NEGATIVO.
    const p = paseoDeMenu({
      mirador: { puntos: [[0, 3937, 0], [0, 3937, 39.37]], mirar: [0, 0, -3937], segundos: 90 },
      paralaje: { ...PARALAJE, desplazamiento: 0, giro: 0 },
    });
    assert.ok(p.avanzar(0).pitch < 0, "desde arriba se mira hacia abajo");
  });

  test("sin punto de interés mira adelante, incluso donde la velocidad es cero", () => {
    // El extremo es justo donde la tangente analítica se anula: si la dirección
    // se sacara derivando, aquí saldría un vector nulo y la cámara miraría al
    // norte de golpe en el momento de la vuelta. Se ve como un tirón.
    const p = paseoDeMenu({
      mirador: { puntos: CURVO, mirar: null, segundos: 90 },
      paralaje: { ...PARALAJE, desplazamiento: 0, giro: 0 },
    });
    const a = p.avanzar(0);
    assert.ok(Number.isFinite(a.yaw) && Number.isFinite(a.pitch));
    // Y que mire a algún sitio de verdad: en el extremo, hacia el recorrido.
    const b = paseoDeMenu({
      mirador: { puntos: CURVO, mirar: null, segundos: 90 }, desde: 1,
      paralaje: { ...PARALAJE, desplazamiento: 0, giro: 0 },
    }).avanzar(0);
    assert.ok(Math.abs(a.yaw - b.yaw) < Math.PI, "el rumbo no salta media vuelta al arrancar");
  });
});

describe("el paralaje", () => {
  const mirador = { puntos: RECTA, mirar: [0, 1000, -3937], segundos: 90 };

  test("sin ratón no se mueve del centro", () => {
    const p = paseoDeMenu({ mirador });
    for (let i = 0; i < 100; i++) p.avanzar(1 / 60, { raton: null });
    cercaV(p.avanzar(0).paralaje.concat(0), [0, 0, 0], 1e-9, "el centro");
  });

  test("vuelve al centro cuando el ratón se va", () => {
    const p = paseoDeMenu({ mirador });
    for (let i = 0; i < 200; i++) p.avanzar(1 / 60, { raton: [1, 1] });
    const torcido = p.avanzar(0).paralaje;
    assert.ok(torcido[0] > 0.9, `no llegó al lado: ${torcido[0]}`);
    for (let i = 0; i < 200; i++) p.avanzar(1 / 60, { raton: null });
    cerca(p.avanzar(0).paralaje[0], 0, 1e-3, "volvió al centro");
  });

  test("TARDA LO MISMO A 60 QUE A 144 HZ", () => {
    // El mockup pedía «lerp 0.05 por frame», y eso ata el suavizado a los fps:
    // a 144 Hz llegaría al lado en menos de la mitad de tiempo. Es un defecto
    // que no se ve mirando una pantalla, sólo comparando dos.
    const tras = (hz) => {
      const p = paseoDeMenu({ mirador });
      const dt = 1 / hz;
      for (let t = 0; t < 0.5 - 1e-9; t += dt) p.avanzar(dt, { raton: [1, 0] });
      return p.avanzar(0).paralaje[0];
    };
    const a = tras(60), b = tras(144);
    cerca(a, b, 0.02, "medio segundo a 60 y a 144 Hz");
    // Y el control positivo: medio segundo con esta constante de tiempo tiene
    // que haber llegado a un sitio concreto, no a «algo parecido a cero». Con
    // tau = 0,325 s, 1 − e^(−0,5/0,325) ≈ 0,785.
    cerca(a, 1 - Math.exp(-0.5 / PARALAJE.tau), 0.02, "el valor que toca");
  });

  test("desplaza a los lados de LA CÁMARA, no en los ejes del mundo", () => {
    // Con el mundo, a mitad de un recorrido que va en X el paralaje empujaría en
    // X también —de frente— y no se vería nada moverse.
    //
    // Y HACEN FALTA DOS MIRADORES PARA PROBARLO, que es la lección del
    // experimento 50. Con la cámara mirando al norte su derecha ES +X, así que
    // los ejes del mundo y los de la cámara dan lo mismo y la prueba no puede
    // fallar por construcción: lo comprobé cambiando el código a `[1, 0, 0]` y
    // siguió verde. El caso que lo distingue es una cámara mirando al este,
    // donde su derecha es +Z y la X tiene que quedarse quieta.
    // Y EL RECORRIDO SUBE, no avanza en horizontal. Con un recorrido en Z, en
    // los cinco segundos que tarda el paralaje en llegar la cámara se ha movido
    // unos centímetros en Z **por el recorrido**, que es justo el eje que el
    // caso «al este» está midiendo, y se los resta. El rojo era de la prueba.
    const empujada = (mirar) => {
      const p = paseoDeMenu({
        mirador: { puntos: [[0, 0, 0], [0, 39.37, 0]], mirar, segundos: 90 },
        paralaje: { ...PARALAJE, giro: 0 },
      });
      for (let i = 0; i < 300; i++) p.avanzar(1 / 60, { raton: [1, 0] });
      return p.avanzar(0).pos;
    };
    const norte = empujada([0, 0, -3937]);
    cerca(norte[0], PARALAJE.desplazamiento, 0.02, "mirando al norte, su derecha es +X");

    const este = empujada([3937, 0, 0]);
    cerca(este[2], PARALAJE.desplazamiento, 0.02, "mirando al este, su derecha es +Z");
    cerca(este[0], 0, 0.02, "y la X se queda quieta");
  });

  test("el giro va al contrario del desplazamiento", () => {
    // Es lo que hace que la escena parezca girar alrededor del punto de interés
    // en vez de que la cámara se vaya de viaje.
    const p = paseoDeMenu({
      mirador: { puntos: [[0, 0, 0], [0, 0, -39.37]], mirar: [0, 0, -3937], segundos: 90 },
    });
    for (let i = 0; i < 300; i++) p.avanzar(1 / 60, { raton: [1, 0] });
    const a = p.avanzar(0);
    assert.ok(a.pos[0] > 0, "desplazado a la derecha");
    assert.ok(a.yaw < 0, `el giro tenía que ir al otro lado, y fue a ${a.yaw}`);
    cerca(a.yaw, -PARALAJE.giro, 0.01, "±1,5°");
  });
});

describe("la tabla de miradores", () => {
  test("APUNTA AL MAPA QUE SE MIDIÓ, y no a la posición 0 de una lista", () => {
    // `MIRADORES` se indexa con `MAPAS_PORTADOS[0]` porque `src/play/` no puede
    // escribir el nombre de un mapa (la regla del 47). El precio es que
    // reordenar esa lista movería los miradores de Gate City a otro mapa **sin
    // que nada fallara**: seguirían siendo dos, seguirían teniendo cinco puntos
    // y seguirían paseándose. Saldría una cámara de menú dentro de una montaña
    // de Edana y ningún control se enteraría.
    //
    // Aquí sí se puede nombrar —esto es `test/`, no `src/play/`—, así que se
    // nombra, que es lo único que ata la tabla a lo que de verdad se midió.
    assert.ok(MIRADORES.gatecity, "los miradores medidos son los de Gate City");
    assert.equal(Object.keys(MIRADORES).length, 1,
      "si aparece un segundo mapa, hay que decir cuál y haberlo mirado");
    // Y las coordenadas: el primer punto del «market row», tal como salió del
    // barrido 3. Si la tabla cambia de mapa, esto se cae con ella.
    assert.deepEqual(MIRADORES.gatecity[0].puntos[0], [1146, -497, -188]);
  });

  test("cada mapa con miradores tiene DOS, por la lección del 50", () => {
    // Con un solo mirador el valor correcto y el valor de reposo son el mismo y
    // la sonda no puede fallar por construcción. Mientras la tabla esté vacía
    // esto no comprueba nada y lo dice; en cuanto haya un mapa, lo exige.
    const mapas = Object.keys(MIRADORES);
    for (const m of mapas) {
      assert.ok(MIRADORES[m].length >= 2, `«${m}» tiene ${MIRADORES[m].length} mirador(es)`);
    }
    if (!mapas.length) {
      assert.equal(miradorDe("gatecity"), null,
        "la tabla está vacía: el menú tiene que quedarse con la pintura");
    }
  });

  test("los miradores medidos tienen de 4 a 6 puntos y se pueden pasear", () => {
    for (const [mapa, lista] of Object.entries(MIRADORES)) {
      lista.forEach((m, i) => {
        assert.ok(m.puntos.length >= 4 && m.puntos.length <= 6,
          `${mapa}[${i}] tiene ${m.puntos.length} puntos, y el mockup pedía de 4 a 6`);
        const p = paseoDeMenu({ mirador: m });
        assert.equal(p.valido, true, `${mapa}[${i}] no se puede pasear`);
        for (let k = 0; k <= 20; k++) {
          const a = p.avanzar(m.segundos / 20, { raton: [0, 0] });
          assert.ok(a.pos.every(Number.isFinite) && Number.isFinite(a.yaw),
            `${mapa}[${i}] da NaN en el paso ${k}`);
        }
      });
    }
  });
});
